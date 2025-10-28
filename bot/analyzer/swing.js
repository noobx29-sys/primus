import { fetchCandlesSanitized as fetchCandles, ensureEnoughData, fetchCurrentPrice } from './fetchData.js';
import { detectTrendByMAs, findSupportResistance, detectEngulfing, zoneFromLastCandle, strengthScore, candleWithinRange } from './indicators.js';

export async function analyzeSwing(symbol) {
  const tfHigher = '1d';
  const tfConfirm = '30m';

  const candlesDaily = ensureEnoughData(await fetchCandles(symbol, tfHigher), 210);
  const { trend } = detectTrendByMAs(candlesDaily, 50, 200);
  const sr = findSupportResistance(candlesDaily, 80);
  const engulf = detectEngulfing(candlesDaily);

  let confirm = 'None';
  try {
    const candlesConfirm = await fetchCandles(symbol, tfConfirm);
    // SOP: confirmation engulfing on M30 inside the daily engulfing candle
    const lastDaily = candlesDaily[candlesDaily.length - 1];
    const dailyRange = zoneFromLastCandle(lastDaily);
    const confSignal = detectEngulfing(candlesConfirm).signal;
    const lastM30 = candlesConfirm[candlesConfirm.length - 1];
    if (confSignal !== 'None' && candleWithinRange(lastM30, dailyRange)) {
      confirm = confSignal;
    } else {
      confirm = 'None';
    }
  } catch (e) {
    console.warn(`[WARN] Confirmation timeframe fetch failed (${e?.message}); continuing without confirmation.`);
  }

  const last = candlesDaily[candlesDaily.length - 1];
  const zone = zoneFromLastCandle(last);
  const strength = strengthScore({ trend, signal: engulf.signal }, confirm);
  let live = undefined;
  try { live = await fetchCurrentPrice(symbol); } catch {}

  return {
    mode: 'Swing',
    timeframeMain: tfHigher,
    timeframeConfirm: tfConfirm,
    trend,
    signal: engulf.signal,
    confirmation: confirm,
    zone,
    support: sr.support,
    resistance: sr.resistance,
    candlesForChart: candlesDaily,
    lastPrice: live?.price ?? last.close,
    lastTime: live?.time ?? last.time
  };
}


