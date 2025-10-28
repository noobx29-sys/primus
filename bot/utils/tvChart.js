import puppeteer from 'puppeteer';

function buildSymbol(symbol) {
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') return 'TVC:GOLD';
  if (s.length === 6) return `OANDA:${s.slice(0,3)}${s.slice(3)}`;
  return s;
}

export async function captureTradingViewChart(symbol = 'XAUUSD', timeframe = '1D') {
  const sym = buildSymbol(symbol);
  const url = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(timeframe)}`;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait a bit for chart to render
    await page.waitForTimeout(2500);
    // Hide UI clutter if present
    await page.evaluate(() => {
      const hide = (sel) => document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
      hide('[data-name="header-toolbar"]');
      hide('[data-name="left-toolbar"]');
      hide('[data-name="right-toolbar"]');
      hide('[data-name="status-line"]');
    }).catch(()=>{});
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] Captured TradingView chart', url);
    return buf;
  } finally {
    await browser.close().catch(()=>{});
  }
}


