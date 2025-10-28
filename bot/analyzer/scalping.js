import { fetchCandlesSanitized as fetchCandles, fetchCurrentPrice } from './fetchData.js';
import { detectTrendByMAs, findSupportResistance, detectEngulfing, zoneFromLastCandle, strengthScore } from './indicators.js';

export async function analyzeScalping(symbol) {
  const tfMain = '5m';
  const tfConfirm = '1m';

  const candlesMain = await fetchCandles(symbol, tfMain);
  const { trend } = detectTrendByMAs(candlesMain, 50, 200);
  const sr = findSupportResistance(candlesMain, 120);
  const engulf = detectEngulfing(candlesMain);

  let confirm = 'None';
  try {
    const candlesConfirm = await fetchCandles(symbol, tfConfirm);
    confirm = detectEngulfing(candlesConfirm).signal;
  } catch (e) {
    console.warn(`[WARN] Confirmation timeframe fetch failed (${e?.message}); continuing without confirmation.`);
  }

  const last = candlesMain[candlesMain.length - 1];
  const zone = zoneFromLastCandle(last);
  const strength = strengthScore({ trend, signal: engulf.signal }, confirm);
  let live = undefined;
  try { live = await fetchCurrentPrice(symbol); } catch {}

  return {
    mode: 'Scalping',
    timeframeMain: tfMain,
    timeframeConfirm: tfConfirm,
    trend,
    signal: engulf.signal,
    confirmation: confirm,
    zone,
    support: sr.support,
    resistance: sr.resistance,
    candlesForChart: candlesMain,
    lastPrice: live?.price ?? last.close,
    lastTime: live?.time ?? last.time
  };
}


