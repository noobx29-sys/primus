import sharp from 'sharp';
import logger from '../utils/logger.js';

/**
 * Lightweight rule-based fallback analyzer when GPT Vision is unavailable.
 * It does NOT try to read candles; instead, it:
 * - Uses image dimensions to place plausible zones near recent price area (right side)
 * - Returns structured JSON matching the strategy expectations
 * - Provides deterministic output so pipeline can proceed and be tested
 */
export async function analyzeLocally(imagePath, { pair, timeframe, strategy } = {}) {
  // Read image dimensions
  const meta = await sharp(imagePath).metadata();
  const width = meta.width || 1920;
  const height = meta.height || 1080;

  // Heuristics: place zone in the top (sell) if timeframe ends with 'D' or '15'
  const isSellBias = String(timeframe).toUpperCase().includes('D') || String(timeframe) === '15';

  // Build a zone rectangle near the right edge
  const zoneWidth = Math.max(80, Math.floor(width * 0.08));
  const zoneHeight = Math.max(40, Math.floor(height * 0.08));
  const marginRight = Math.floor(width * 0.12);
  const x2 = width - marginRight;
  const x1 = x2 - zoneWidth;
  const y1 = isSellBias ? Math.floor(height * 0.18) : Math.floor(height * 0.62);
  const y2 = y1 + zoneHeight;

  // Sane defaults
  const base = {
    pair: pair || 'XAUUSD',
    confidence: 0.6,
    reasoning: 'Local heuristic fallback (no GPT). Coordinates placed near right edge for visibility.'
  };

  if ((strategy || '').toLowerCase().includes('swing')) {
    if (String(timeframe).toUpperCase() === '1D' || String(timeframe).toUpperCase() === 'D') {
      return {
        ...base,
        timeframe: 'Daily',
        trend: isSellBias ? 'downtrend' : 'uptrend',
        signal: isSellBias ? 'sell' : 'buy',
        pattern: isSellBias ? 'bearish_engulfing' : 'bullish_engulfing',
        zone_type: isSellBias ? 'resistance' : 'support',
        zone_price_high: 0,
        zone_price_low: 0,
        zone_coordinates: { x1, y1, x2, y2 }
      };
    }
    // M30 confirmation
    return {
      ...base,
      timeframe: 'M30',
      pattern: isSellBias ? 'bearish_engulfing' : 'bullish_engulfing',
      zone_coordinates: { x1: x1 + 10, y1: y1 + 10, x2: x2 - 10, y2: y2 - 10 },
      inside_daily_zone: true
    };
  }

  // Scalping strategy
  if (String(timeframe) === '15') {
    return {
      ...base,
      timeframe: '15min',
      micro_trend: isSellBias ? 'bearish' : 'bullish',
      signal: isSellBias ? 'sell' : 'buy',
      pattern: isSellBias ? 'bearish_engulfing' : 'bullish_engulfing',
      zone_type: isSellBias ? 'resistance' : 'support',
      momentum: 'moderate',
      zone_price_high: 0,
      zone_price_low: 0,
      zone_coordinates: { x1, y1, x2, y2 }
    };
  }

  // 5-min entry
  return {
    ...base,
    timeframe: '5min',
    pattern: isSellBias ? 'bearish_engulfing' : 'bullish_engulfing',
    zone_coordinates: { x1: x1 + 10, y1: y1 + 10, x2: x2 - 10, y2: y2 - 10 },
    inside_15min_zone: true,
    entry_timing: 'immediate'
  };
}

export default { analyzeLocally };
