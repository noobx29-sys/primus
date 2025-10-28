export function simpleMovingAverage(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];
  const out = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out.push(sum / period);
  }
  return out;
}

export function averageTrueRange(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const highLow = current.high - current.low;
    const highClose = Math.abs(current.high - prev.close);
    const lowClose = Math.abs(current.low - prev.close);
    const tr = Math.max(highLow, highClose, lowClose);
    trs.push(tr);
  }
  const atrSeries = simpleMovingAverage(trs, period);
  return atrSeries.length ? atrSeries[atrSeries.length - 1] : 0;
}

export function detectTrendByMAs(candles, shortPeriod = 50, longPeriod = 200) {
  const closes = candles.map((c) => c.close);
  const maShort = simpleMovingAverage(closes, shortPeriod);
  const maLong = simpleMovingAverage(closes, longPeriod);
  if (!maShort.length || !maLong.length) return { trend: 'Sideways', maShort: [], maLong: [] };
  const lastShort = maShort[maShort.length - 1];
  const lastLong = maLong[maLong.length - 1];
  const trend = lastShort > lastLong ? 'Uptrend' : lastShort < lastLong ? 'Downtrend' : 'Sideways';
  return { trend, maShort, maLong };
}

export function findSupportResistance(candles, lookback = 50) {
  const start = Math.max(0, candles.length - lookback);
  let maxHigh = -Infinity;
  let minLow = Infinity;
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;
  }
  return { support: minLow, resistance: maxHigh };
}

export function detectEngulfing(candles) {
  if (candles.length < 2) return { signal: 'None' };
  const a = candles[candles.length - 2];
  const b = candles[candles.length - 1];
  const aBull = a.close > a.open;
  const aBear = a.close < a.open;
  const bBull = b.close > b.open;
  const bBear = b.close < b.open;
  const bodyA = Math.abs(a.close - a.open);
  const bodyB = Math.abs(b.close - b.open);
  const bullishEngulf = aBear && bBull && b.open <= a.close && b.close >= a.open && bodyB > bodyA * 0.8;
  const bearishEngulf = aBull && bBear && b.open >= a.close && b.close <= a.open && bodyB > bodyA * 0.8;
  if (bullishEngulf) return { signal: 'Bullish Engulfing' };
  if (bearishEngulf) return { signal: 'Bearish Engulfing' };
  return { signal: 'None' };
}

export function zoneFromLastCandle(candle) {
  const lowShadow = Math.min(candle.open, candle.close, candle.low);
  const highShadow = Math.max(candle.open, candle.close, candle.high);
  return { from: lowShadow, to: highShadow };
}

export function strengthScore({ trend, signal }, confirmation) {
  let score = 50;
  if (trend === 'Uptrend') score += 10; else if (trend === 'Downtrend') score -= 10;
  if (signal?.includes('Bullish')) score += 10; else if (signal?.includes('Bearish')) score += 10; // magnitude only
  if (confirmation && confirmation !== 'None') score += 10;
  return Math.max(0, Math.min(100, score));
}

export function distancePercent(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const mid = (Math.abs(a) + Math.abs(b)) / 2 || 1;
  return Math.abs(a - b) / mid;
}

export function candleWithinRange(candle, range) {
  if (!candle || !range) return false;
  const cLow = Math.min(candle.low, candle.open, candle.close);
  const cHigh = Math.max(candle.high, candle.open, candle.close);
  const rLow = Math.min(range.from, range.to);
  const rHigh = Math.max(range.from, range.to);
  return cLow >= rLow && cHigh <= rHigh;
}



