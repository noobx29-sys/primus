// Minimal helper to sleep between retries
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Map common tickers to Yahoo symbols
const SYMBOL_MAP = {
  XAUUSD: 'XAUUSD=X',
};

function toYahooSymbol(symbol) {
  if (SYMBOL_MAP[symbol]) return SYMBOL_MAP[symbol];
  return symbol.toUpperCase();
}

function altYahooSymbols(symbol) {
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') {
    const pref = (process.env.GOLD_SOURCE || '').toLowerCase();
    if (pref === 'futures' || pref === 'gc=f') return ['GC=F', 'XAUUSD=X'];
    // default spot first
    return ['XAUUSD=X', 'GC=F'];
  }
  return [toYahooSymbol(s)];
}

function normalizeInterval(tf) {
  const m = tf.toLowerCase();
  const map = {
    '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
    '60m': '60m', '1h': '60m', '4h': '4h', '1d': '1d', '1wk': '1wk'
  };
  return map[m] || '1d';
}

function toTwelveInterval(tf) {
  const m = tf.toLowerCase();
  const map = { '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min', '60m': '1h', '1h': '1h', '1d': '1day' };
  return map[m] || '1day';
}

function toTwelveSymbol(symbol) {
  const s = symbol.toUpperCase();
  if (s.length === 6) return `${s.slice(0,3)}/${s.slice(3)}`; // EURUSD -> EUR/USD
  if (s === 'XAUUSD') return 'XAU/USD';
  return s;
}

function toFinnhubResolution(tf) {
  const m = tf.toLowerCase();
  const map = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '60m': '60', '1h': '60', '1d': 'D' };
  return map[m] || 'D';
}

function toFinnhubSymbol(symbol) {
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') return 'OANDA:XAU_USD';
  if (s.length === 6) {
    const b = s.slice(0, 3);
    const q = s.slice(3);
    return `OANDA:${b}_${q}`;
  }
  return s;
}

function buildCandlesFromYahoo(points) {
  return points
    .filter((p) => p && p.open != null && p.high != null && p.low != null && p.close != null && p.volume != null && p.date)
    .map((p) => ({
      time: new Date(p.date).getTime(),
      open: Number(p.open),
      high: Number(p.high),
      low: Number(p.low),
      close: Number(p.close),
      volume: Number(p.volume)
    }));
}

async function fetchFromYahooREST(symbol, interval, range) {
  const candidates = altYahooSymbols(symbol);
  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*' };
  for (const querySymbol of candidates) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(querySymbol)}?range=${range}&interval=${interval}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      continue;
    }
    const json = await resp.json();
    const result = json?.chart?.result?.[0];
    const ts = result?.timestamp || [];
    const o = result?.indicators?.quote?.[0]?.open || [];
    const h = result?.indicators?.quote?.[0]?.high || [];
    const l = result?.indicators?.quote?.[0]?.low || [];
    const c = result?.indicators?.quote?.[0]?.close || [];
    const v = result?.indicators?.quote?.[0]?.volume || [];
    const points = ts.map((t, i) => ({ date: new Date(t * 1000), open: o[i], high: h[i], low: l[i], close: c[i], volume: v[i] ?? 0 }));
    const built = buildCandlesFromYahoo(points);
    if (built.length) return built;
  }
  throw new Error('Yahoo REST 404');
}

// Twelve Data (requires API key)
async function fetchFromTwelveDataCandles(symbol, timeframe) {
  const key = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA;
  if (!key) throw new Error('TwelveData key missing');
  const sym = toTwelveSymbol(symbol);
  const interval = toTwelveInterval(timeframe);
  const outputsize = interval === '1day' ? 5000 : 5000; // max
  const ex = process.env.TWELVEDATA_EXCHANGE ? `&exchange=${encodeURIComponent(process.env.TWELVEDATA_EXCHANGE)}` : '';
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}${ex}&interval=${encodeURIComponent(interval)}&outputsize=${outputsize}&apikey=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`TwelveData ${resp.status}`);
  const json = await resp.json();
  if (!json || !json.values) throw new Error('TwelveData empty');
  // values are descending by datetime
  const candles = json.values.map((v) => ({
    time: new Date(v.datetime.endsWith('Z') ? v.datetime : v.datetime.replace(' ', 'T') + 'Z').getTime(),
    open: Number(v.open),
    high: Number(v.high),
    low: Number(v.low),
    close: Number(v.close),
    volume: Number(v.volume ?? 0)
  })).filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close)).sort((a,b)=>a.time-b.time);
  return candles;
}

// Finnhub (requires API key). Prefer this when key is present.
async function fetchFromFinnhubCandles(symbol, timeframe) {
  const key = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY || process.env.FINNHUB;
  if (!key) throw new Error('Finnhub key missing');
  const sym = toFinnhubSymbol(symbol);
  const res = toFinnhubResolution(timeframe);
  const now = Math.floor(Date.now() / 1000);
  const from = res === 'D' ? now - 365 * 24 * 3600 : now - 60 * 24 * 3600; // 1y daily or ~60d intraday
  const url = `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(sym)}&resolution=${res}&from=${from}&to=${now}&token=${encodeURIComponent(key)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Finnhub ${resp.status}`);
  const json = await resp.json();
  if (json.s !== 'ok') throw new Error(`Finnhub status ${json.s}`);
  const candles = [];
  for (let i = 0; i < json.t.length; i++) {
    candles.push({
      time: json.t[i] * 1000,
      open: Number(json.o[i]),
      high: Number(json.h[i]),
      low: Number(json.l[i]),
      close: Number(json.c[i]),
      volume: Number(json.v?.[i] ?? 0)
    });
  }
  return candles;
}

// Stooq daily fallback (no key). Intraday is limited; we'll use it only for 1D.
async function fetchFromStooqDaily(symbol) {
  const s = symbol.toLowerCase();
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Stooq ${resp.status}`);
  const text = await resp.text();
  const lines = text.trim().split(/\r?\n/).slice(1); // skip header
  const candles = lines.map((line) => {
    const [date, open, high, low, close, volume] = line.split(',');
    return {
      time: new Date(date).getTime(),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0)
    };
  }).filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close));
  if (!candles.length) throw new Error('Stooq empty');
  return candles;
}

// Stooq intraday CSV: q/l with i=1,5,15,60 (not always available for FX; best-effort)
async function fetchFromStooqIntraday(symbol, interval) {
  const intradayMap = { '1m': '1', '5m': '5', '15m': '15', '30m': '15', '60m': '60' };
  const iParam = intradayMap[interval] || '15';
  const s = symbol.toLowerCase();
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&i=${iParam}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Stooq intraday ${resp.status}`);
  const text = await resp.text();
  const lines = text.trim().split(/\r?\n/);
  // Stooq intraday q/l returns rows like: symbol,date,time,open,high,low,close,volume
  const dataLines = lines.filter((ln) => /\d{4}-\d{2}-\d{2}/.test(ln));
  if (!dataLines.length) throw new Error('Stooq intraday empty');
  const candles = dataLines.map((line) => {
    const parts = line.split(',');
    const date = parts[1];
    const time = parts[2] || '00:00:00';
    const open = Number(parts[3]);
    const high = Number(parts[4]);
    const low = Number(parts[5]);
    const close = Number(parts[6]);
    const volume = Number(parts[7] || 0);
    return { time: new Date(`${date}T${time}Z`).getTime(), open, high, low, close, volume };
  }).filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close));
  if (!candles.length) throw new Error('Stooq intraday parsed empty');
  return candles;
}

function synthesizeFromCloses(closes) {
  // Fallback: build pseudo-candles when only close series is available
  const candles = [];
  for (let i = 0; i < closes.length; i++) {
    const close = closes[i];
    const prev = closes[i - 1] ?? close;
    const open = prev;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    candles.push({ time: Date.now() - (closes.length - i) * 60000, open, high, low, close, volume: 0 });
  }
  return candles;
}

// exchangerate.host daily timeseries (supports FX and metals like XAU)
async function fetchFromExchangerateHostDaily(symbol, days = 200) {
  const base = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3).toUpperCase();
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://api.exchangerate.host/timeseries?start_date=${fmt(start)}&end_date=${fmt(end)}&base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`exchangerate.host ${resp.status}`);
  const json = await resp.json();
  if (!json?.rates) throw new Error('exchangerate.host empty');
  const dates = Object.keys(json.rates).sort();
  const candles = dates.map((dateStr) => {
    const rate = json.rates[dateStr]?.[quote];
    if (!Number.isFinite(rate)) return null;
    // If base is USD and symbols=XAU, rate = XAU per USD; we want USD per XAU
    // In general, we want price as base/quote; keep as returned.
    // But for base=USD, quote=XAU we invert to get XAUUSD.
    let price = rate;
    if (base === 'USD' && quote === 'XAU') {
      price = 1 / rate; // USD per XAU
    }
    return { time: new Date(dateStr + 'T00:00:00Z').getTime(), open: price, high: price, low: price, close: price, volume: 0 };
  }).filter(Boolean);
  if (!candles.length) throw new Error('exchangerate.host parsed empty');
  return candles;
}

function expandDailyToIntraday(dailyCandles, interval) {
  // Create synthetic intraday candles per day to satisfy intraday renderings
  const minutesPer = interval === '1m' ? 1 : interval === '5m' ? 5 : interval === '15m' ? 15 : 30;
  const perDay = Math.floor((24 * 60) / minutesPer);
  const out = [];
  for (const d of dailyCandles) {
    for (let i = 0; i < perDay; i++) {
      const t = d.time + i * minutesPer * 60000;
      out.push({ time: t, open: d.close, high: d.close, low: d.close, close: d.close, volume: 0 });
    }
  }
  return out.slice(-Math.max(200, perDay * 5));
}

export async function fetchCandles(symbol, timeframe) {
  const interval = normalizeInterval(timeframe);
  const range = interval === '1d' ? '1y' : interval === '30m' ? '60d' : interval === '5m' ? '30d' : '7d';

  // SIMPLE MODE: one clear path with explicit logs, no fallbacks
  if (process.env.SIMPLE_MODE === '1') {
    console.log(`[INFO] [SIMPLE] Fetching candles from Yahoo: symbol=${symbol}, interval=${interval}, range=${range}`);
    const candles = await fetchFromYahooREST(symbol, interval, range);
    console.log(`[INFO] [SIMPLE] Yahoo candles loaded: count=${candles.length}`);
    return candles;
  }

  // Twelve Data first when key available
  try {
    const candles = await fetchFromTwelveDataCandles(symbol, interval);
    if (candles.length) return candles;
  } catch (e) {
    if (process.env.BOT_DEBUG === '1') console.warn('[WARN] TwelveData fetch failed:', e?.message);
  }

  // Finnhub first when key available
  try {
    const candles = await fetchFromFinnhubCandles(symbol, interval);
    if (candles.length) return candles;
  } catch (e) {
    if (process.env.BOT_DEBUG === '1') console.warn('[WARN] Finnhub fetch failed:', e?.message);
  }

  // Try Yahoo REST, and if it fails, try related intervals for robustness
  const alternateIntervals = (base) => {
    if (base === '30m') return ['30m', '60m', '15m'];
    if (base === '5m') return ['5m', '15m', '1m'];
    if (base === '1m') return ['1m', '2m', '5m'];
    return [base];
  };
  for (const tryInterval of alternateIntervals(interval)) {
    try {
      const tryRange = tryInterval === '1m' ? '7d' : tryInterval === '5m' ? '30d' : tryInterval === '15m' ? '60d' : tryInterval === '30m' ? '60d' : range;
      const candles = await fetchFromYahooREST(symbol, tryInterval, tryRange);
      if (candles.length) return candles;
      console.warn(`[WARN] Yahoo REST returned no data for ${symbol} ${tryInterval}, trying next interval...`);
    } catch (e) {
      console.warn(`[WARN] Yahoo REST fetch failed (${e?.message}) for ${symbol} ${tryInterval}, trying next interval...`);
      await delay(200);
    }
  }

  // For 1D, try Stooq as a free no-key source
  if (interval === '1d') {
    try {
      console.info('[INFO] Using Stooq daily fallback...');
      const candles = await fetchFromStooqDaily(symbol);
      if (candles.length) return candles;
    } catch (e) {
      console.warn(`[WARN] Stooq fallback failed (${e?.message}).`);
    }
  }

  // For intraday, try Stooq intraday when available
  if (interval !== '1d') {
    try {
      console.info('[INFO] Trying Stooq intraday fallback...');
      const candles = await fetchFromStooqIntraday(symbol, interval);
      if (candles.length) return candles;
    } catch (e) {
      console.warn(`[WARN] Stooq intraday fallback failed (${e?.message}).`);
    }
  }

  // Last resort: synthesize from latest closes via Yahoo REST close-only
  try {
    console.info('[INFO] Synthesizing candles from close series...');
    const closesOnly = await fetchFromYahooREST(symbol, '1d', '1mo');
    const closes = closesOnly.map((c) => c.close);
    const candles = synthesizeFromCloses(closes);
    if (candles.length) return candles;
  } catch (e) {
    console.warn(`[WARN] Synthesis fallback failed (${e?.message}).`);
  }

  // Free API fallback: exchangerate.host daily, works for FX and metals (XAU)
  try {
    console.info('[INFO] Using exchangerate.host daily fallback...');
    const daily = await fetchFromExchangerateHostDaily(symbol, 240);
    if (interval === '1d') return daily;
    const intr = expandDailyToIntraday(daily, interval);
    if (intr.length) return intr;
  } catch (e) {
    console.warn(`[WARN] exchangerate.host fallback failed (${e?.message}).`);
  }

  throw new Error(`All data fetch attempts failed for ${symbol} ${timeframe}`);
}

function sanitizeCandles(raw, interval) {
  if (!Array.isArray(raw)) return [];
  const sorted = [...raw]
    .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low))
    .sort((a, b) => a.time - b.time);
  const maxJump = interval === '1d' ? 0.15 : 0.08;
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    const c = { ...sorted[i] };
    if (c.high < Math.max(c.open, c.close)) c.high = Math.max(c.high, c.open, c.close);
    if (c.low > Math.min(c.open, c.close)) c.low = Math.min(c.low, c.open, c.close);
    if (out.length) {
      const prev = out[out.length - 1];
      if (prev.close > 0) {
        const jump = Math.abs(c.close - prev.close) / prev.close;
        if (jump > maxJump) continue;
      }
    }
    out.push(c);
  }
  return out;
}

export async function fetchCandlesSanitized(symbol, timeframe) {
  const candles = await fetchCandles(symbol, timeframe);
  return sanitizeCandles(candles, normalizeInterval(timeframe));
}

export function ensureEnoughData(candles, min = 200) {
  if (!Array.isArray(candles) || candles.length < min) {
    throw new Error(`Not enough candle data: have ${candles?.length ?? 0}, need ${min}`);
  }
  return candles;
}


// Live price helpers
async function fetchYahooQuotePrice(symbol) {
  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,text/plain,*/*' };
  const candidates = altYahooSymbols(symbol);
  for (const querySymbol of candidates) {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(querySymbol)}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) continue;
    const json = await resp.json();
    const r = json?.quoteResponse?.result?.[0];
    const p = r?.regularMarketPrice ?? r?.postMarketPrice ?? r?.preMarketPrice;
    const t = (r?.regularMarketTime || r?.postMarketTime || r?.preMarketTime) ? ((r.regularMarketTime || r.postMarketTime || r.preMarketTime) * 1000) : Date.now();
    if (Number.isFinite(p)) return { price: Number(p), time: t, source: `yahoo:${querySymbol}` };
  }
  throw new Error('Yahoo quote failed');
}

async function fetchExchangerateHostLatest(symbol) {
  const base = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3).toUpperCase();
  const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`exchangerate.host latest ${resp.status}`);
  const json = await resp.json();
  const rate = json?.rates?.[quote];
  if (!Number.isFinite(rate)) throw new Error('exchangerate.host latest empty');
  return { price: Number(rate), time: Date.now(), source: 'exchangerate.host' };
}

export async function fetchCurrentPrice(symbol) {
  // SIMPLE MODE: one source only with explicit logs
  if (process.env.SIMPLE_MODE === '1') {
    if (process.env.BOT_TV === '1') {
      console.log('[INFO] [SIMPLE] Fetching live price from TradingView');
      const { fetchTradingViewPrice } = await import('../utils/tvPrice.js');
      const tv = await fetchTradingViewPrice(symbol);
      if (!Number.isFinite(tv?.price)) throw new Error('TradingView price not found');
      console.log(`[INFO] [SIMPLE] TradingView price: ${tv.price}`);
      return tv;
    }
    console.log('[INFO] [SIMPLE] Fetching live price from Yahoo Quote');
    const q = await fetchYahooQuotePrice(symbol);
    console.log(`[INFO] [SIMPLE] Yahoo price: ${q.price}`);
    const now = Date.now();
    return { price: q.price, time: now, source: q.source };
  }
  // TradingView scrape first if enabled
  try {
    if (process.env.BOT_TV === '1') {
      const { fetchTradingViewPrice } = await import('../utils/tvPrice.js');
      const tv = await fetchTradingViewPrice(symbol);
      if (Number.isFinite(tv?.price)) return tv;
    }
  } catch (e) {
    if (process.env.BOT_DEBUG === '1') console.warn('[WARN] TradingView price failed:', e?.message);
  }
  // Twelve Data price first if available
  try {
    const key = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || process.env.TWELVEDATA;
    if (key) {
      const sym = toTwelveSymbol(symbol);
      const ex = process.env.TWELVEDATA_EXCHANGE ? `&exchange=${encodeURIComponent(process.env.TWELVEDATA_EXCHANGE)}` : '';
      const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(sym)}${ex}&apikey=${encodeURIComponent(key)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        const p = Number(json.price);
        if (Number.isFinite(p)) {
          if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] Live price from TwelveData:', p);
          return { price: p, time: Date.now(), source: 'twelvedata' };
        }
      }
    }
  } catch (e) {
    if (process.env.BOT_DEBUG === '1') console.warn('[WARN] TwelveData price failed:', e?.message);
  }

  // Finnhub quote first if available
  try {
    const key = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY || process.env.FINNHUB;
    if (key) {
      const sym = toFinnhubSymbol(symbol);
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        const p = Number(json.c);
        const t = Number(json.t) * 1000 || Date.now();
        if (Number.isFinite(p)) {
          if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] Live price from finnhub:', p, new Date(t).toISOString());
          return { price: p, time: Date.now(), source: 'finnhub' };
        }
      }
    }
  } catch (e) {
    if (process.env.BOT_DEBUG === '1') console.warn('[WARN] Finnhub quote failed:', e?.message);
  }

  try {
    const q = await fetchYahooQuotePrice(symbol);
    if (process.env.BOT_DEBUG === '1') console.log(`[DEBUG] Live price from ${q.source}:`, q.price, new Date(q.time).toISOString());
    const now = Date.now();
    const ageSec = Math.round((now - q.time) / 1000);
    if (process.env.BOT_DEBUG === '1') console.log(`[DEBUG] Quote age: ${ageSec}s`);
    // Display current fetch time to avoid confusion if marketTime is stale
    return { price: q.price, time: now, source: q.source };
  } catch {}
  try {
    const q = await fetchExchangerateHostLatest(symbol);
    if (symbol.toUpperCase() === 'XAUUSD') {
      const inv = 1 / q.price; // convert USD/XAU -> XAUUSD
      if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] Live price from exchangerate.host inverted:', inv);
      return { price: inv, time: Date.now(), source: 'exchangerate.host' };
    }
    if (process.env.BOT_DEBUG === '1') console.log('[DEBUG] Live price from exchangerate.host:', q.price);
    return { price: q.price, time: Date.now(), source: 'exchangerate.host' };
  } catch {}
  return undefined;
}


