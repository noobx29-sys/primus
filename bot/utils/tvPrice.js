import puppeteer from 'puppeteer';

function buildTradingViewUrl(symbol = 'XAUUSD') {
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') return 'https://www.tradingview.com/chart/?symbol=TVC%3AGOLD';
  if (s.length === 6) return `https://www.tradingview.com/chart/?symbol=OANDA%3A${s.slice(0,3)}${s.slice(3)}`;
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(s)}`;
}

function buildSymbolPageUrl(symbol = 'XAUUSD') {
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') return 'https://www.tradingview.com/symbols/TVC-GOLD/';
  if (s.length === 6) return `https://www.tradingview.com/symbols/OANDA-${s.slice(0,3)}${s.slice(3)}/`;
  return `https://www.tradingview.com/symbols/${encodeURIComponent(s.replace(':','-'))}/`;
}

let browserPromise = null;
let sharedPage = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  }
  return browserPromise;
}

async function getPage() {
  const browser = await getBrowser();
  if (!sharedPage || sharedPage.isClosed()) {
    sharedPage = await browser.newPage();
    await sharedPage.setViewport({ width: 1360, height: 768, deviceScaleFactor: 1 });
    await sharedPage.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
  }
  return sharedPage;
}

export async function fetchTradingViewPrice(symbol = 'XAUUSD', timeoutMs = 20000) {
  const page = await getPage();
  try {
    // 1) Prefer symbol info page JSON (__NEXT_DATA__) which carries the live last price
    const symbolUrl = buildSymbolPageUrl(symbol);
    await page.goto(symbolUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const jsonPrice = await page.evaluate(() => {
      function findNumber(obj) {
        if (!obj || typeof obj !== 'object') return undefined;
        const keys = ['lp','last','lastPrice','price','regularMarketPrice'];
        for (const k of keys) {
          const v = obj[k];
          if (typeof v === 'number') return v;
          if (typeof v === 'string' && v.match(/^\d+(?:\.\d+)?$/)) return Number(v);
        }
        for (const v of Object.values(obj)) {
          const r = findNumber(v);
          if (r !== undefined) return r;
        }
        return undefined;
      }
      try {
        const tag = document.querySelector('script#__NEXT_DATA__') || document.querySelector('script[type="application/json"]');
        if (tag) {
          const data = JSON.parse(tag.textContent);
          const val = findNumber(data);
          return val;
        }
      } catch {}
      return undefined;
    });
    if (Number.isFinite(jsonPrice)) {
      if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] TradingView price (symbol JSON):', jsonPrice, symbolUrl);
      return { price: Number(jsonPrice), time: Date.now(), source: 'tradingview:symbol' };
    }

    // 2) Try right-side instrument card (watchlist/instrument details). Retry a few times.
    const url = buildTradingViewUrl(symbol);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    let price = undefined;
    for (let attempt = 0; attempt < 3 && !Number.isFinite(price); attempt++) {
      await page.waitForTimeout(800);
      price = await page.evaluate(() => {
        function extractNumbers(text) {
          return (text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || []).map(t => Number(t.replace(/,/g, '')));
        }
        function plausibleGold(n) { return n > 3000 && n < 5000; }
        // Find the instrument details card labeled GOLD and USD; take the largest plausible number inside it
        const cards = Array.from(document.querySelectorAll('div'))
          .filter(el => /GOLD/i.test(el.textContent || '') && /USD/i.test(el.textContent || ''));
        for (const card of cards) {
          const rect = card.getBoundingClientRect();
          if (!rect || rect.width < 150 || rect.left < window.innerWidth * 0.6) continue; // prefer right panel
          const nums = extractNumbers(card.textContent || '').filter(plausibleGold);
          if (nums.length) return Math.max(...nums);
        }
        return undefined;
      });
    }
    if (Number.isFinite(price)) {
      if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] TradingView price (right panel):', price, url);
      return { price, time: Date.now(), source: 'tradingview:right' };
    }

    // 3) Fallback to chart legend/whole page scrape
    await page.waitForTimeout(1500);
    price = await page.evaluate(() => {
      function extractNumbers(text) {
        return (text.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || []).map(t => Number(t.replace(/,/g, '')));
      }
      function plausibleGold(n) { return n > 3000 && n < 5000; }
      // 0) Try to read explicit OHLC line and take C (close)
      const ohlcEl = document.querySelector('[data-name="pane-legend-price-and-change"]');
      if (ohlcEl && ohlcEl.textContent) {
        const raw = ohlcEl.textContent;
        // Try flexible patterns: "C 3,952.020" or "Close 3,952.020" or compact without space
        const m1 = raw.match(/(?:\bC\b|Close)\s*([0-9,]+(?:\.[0-9]+)?)/i);
        if (m1) {
          const val = Number(m1[1].replace(/,/g, ''));
          if (plausibleGold(val)) return val;
        }
        // Fallback: extract 4 numbers in order and take the last as C when labels present
        const nums = (raw.match(/[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?/g) || []).map(t => Number(t.replace(/,/g,'')));
        if (nums.length >= 4) {
          const cGuess = nums[nums.length - 1];
          if (plausibleGold(cGuess)) return cGuess;
        }
      }
      // 1) Prefer elements located on the right 30% of the viewport (watchlist/symbol panel)
      const rightThreshold = window.innerWidth * 0.7;
      const elements = Array.from(document.querySelectorAll('div,span'));
      let best = undefined;
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.right < rightThreshold) continue;
        const nums = extractNumbers(el.textContent || '').filter(plausibleGold);
        if (!nums.length) continue;
        // Prefer largest number inside this right-side block (display price is usually the largest among change figures)
        const candidate = Math.max(...nums);
        if (typeof candidate === 'number') best = candidate;
      }
      if (typeof best === 'number') return best;
      // 2) Fallback: targeted selectors
      const targets = [
        document.querySelector('[data-name="legend-last-value"]'),
        document.querySelector('[data-name="pane-legend-price-and-change"]'),
        document.querySelector('[data-role="symbol-title-price"]')
      ];
      for (const el of targets) {
        if (!el) continue;
        const nums = extractNumbers(el.textContent || '').filter(plausibleGold);
        if (nums.length) return nums[nums.length - 1];
      }
      // 3) Fallback: entire page
      const all = extractNumbers(document.body.innerText).filter(plausibleGold);
      return all.length ? all[all.length - 1] : undefined;
    });
    if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] TradingView price (chart scrape):', price, url);
    return { price, time: Date.now(), source: 'tradingview' };
  } catch (e) {
    if (process.env.BOT_DEBUG === '1') console.warn('[WARN] TradingView price error:', e?.message);
    throw e;
  }
}


