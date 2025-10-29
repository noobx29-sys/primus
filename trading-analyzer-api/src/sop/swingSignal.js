import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { validateZoneSize } from '../utils/pips.js';

/**
 * Swing Signal SOP Implementation (API-based)
 * 
 * SOP Steps:
 * 1. Analyze Daily timeframe data
 * 2. Identify trend (uptrend/downtrend/sideways)
 * 3. Identify Support/Resistance zones
 * 4. Identify Candlestick Patterns (Bullish/Bearish Engulfing)
 * 5. Analyze M30 timeframe data
 * 6. Find M30 engulfing inside Daily engulfing zone
 * 7. Return actionable signal with zones
 */
class SwingSignalSOP {
  constructor() {
    this.name = 'Swing Signal';
    this.dailyTimeframe = config.swing.dailyTimeframe;
    this.entryTimeframe = config.swing.entryTimeframe;
    this.dailyBars = config.swing.dailyBars;
    this.entryBars = config.swing.entryBars;
    this.confidenceThreshold = config.swing.confidenceThreshold;
  }

  /**
   * Get required timeframes for analysis
   */
  getRequiredTimeframes() {
    return [
      { interval: this.dailyTimeframe, bars: this.dailyBars },
      { interval: this.entryTimeframe, bars: this.entryBars }
    ];
  }

  /**
   * Build GPT prompt for Daily analysis
   */
  buildDailyPrompt(pair) {
    return `You are analyzing ${pair} Daily chart data for Swing Trading signals.

STRICT SOP - Follow these steps:

1. IDENTIFY TREND (CRITICAL):
   - Analyze the trend data provided
   - Look at price change over the period
   - Examine recent highs and lows
   - Determine: UPTREND, DOWNTREND, or SIDEWAYS

   RULES:
   - UPTREND = Higher highs and higher lows
   - DOWNTREND = Lower highs and lower lows
   - SIDEWAYS = No clear direction, ranging

2. IDENTIFY SUPPORT/RESISTANCE ZONES:
   - Use the key levels provided
   - Support = potential BUY zone (price bounces up)
   - Resistance = potential SELL zone (price bounces down)
   - Select the most relevant levels near current price

3. IDENTIFY CANDLESTICK PATTERNS:
   - Review the detected patterns provided
   - UPTREND → Look for BULLISH ENGULFING at SUPPORT
   - DOWNTREND → Look for BEARISH ENGULFING at RESISTANCE
   - Pattern must be recent (within last 180 bars) and near current price

4. DETERMINE SIGNAL:
   - UPTREND + BULLISH pattern at SUPPORT = BUY
   - DOWNTREND + BEARISH pattern at RESISTANCE = SELL
   - SIDEWAYS or no clear pattern = WAIT

5. MARK ZONE PRICES:
   - Zone should be around the engulfing pattern
   - Keep zone width between ${config.zones.minPips}-${config.zones.maxPips} pips
   - Provide exact price high and low

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "Daily",
  "trend": "uptrend|downtrend|sideways",
  "signal": "buy|sell|wait",
  "pattern": "bullish_engulfing|bearish_engulfing|none",
  "zone_type": "support|resistance|none",
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "confidence": 0.0,
  "reasoning": "Brief explanation of your analysis"
}`;
  }

  /**
   * Build GPT prompt for M30 analysis
   */
  buildM30Prompt(pair, dailyAnalysis) {
    const dailyContext = dailyAnalysis ? `

CONTEXT FROM DAILY ANALYSIS:
- Daily Signal: ${dailyAnalysis.signal?.toUpperCase()}
- Daily Pattern: ${dailyAnalysis.pattern?.replace('_', ' ').toUpperCase()}
- Daily Zone: ${dailyAnalysis.zone_price_low} to ${dailyAnalysis.zone_price_high}
- Expected M30 Pattern: ${dailyAnalysis.signal === 'buy' ? 'BULLISH ENGULFING' : dailyAnalysis.signal === 'sell' ? 'BEARISH ENGULFING' : 'ENGULFING'}

IMPORTANT: Look for M30 engulfing patterns that overlap with the Daily zone price range.` : '';

    return `You are analyzing ${pair} M30 (30-minute) chart data for Swing Trading entry confirmation.
${dailyContext}

STRICT SOP:

1. IDENTIFY ENGULFING PATTERNS ON M30:
   - Review the detected patterns in the data
   - Look for ${dailyAnalysis?.signal === 'buy' ? 'BULLISH' : dailyAnalysis?.signal === 'sell' ? 'BEARISH' : ''} engulfing
   - Pattern should be near or inside the Daily zone (${dailyAnalysis?.zone_price_low}-${dailyAnalysis?.zone_price_high})
   - Scan last 180 bars for patterns that overlap with Daily zone

2. CHECK PRICE ALIGNMENT:
   - Verify if M30 pattern price overlaps with Daily zone
   - Set inside_daily_zone to true if overlap exists

3. MARK M30 ZONE:
   - Zone around the engulfing pattern
   - Keep zone width between ${config.zones.minPips}-${config.zones.maxPips} pips
   - Provide exact price high and low

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "M30",
  "pattern": "bullish_engulfing|bearish_engulfing|none",
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "inside_daily_zone": true|false,
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Validate Daily analysis
   */
  validateDailyAnalysis(result) {
    const errors = [];
    const warnings = [];

    // Required fields
    const required = ['trend', 'signal', 'pattern', 'zone_type', 'confidence'];
    required.forEach(field => {
      if (!result[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate values
    if (!['uptrend', 'downtrend', 'sideways'].includes(result.trend)) {
      errors.push(`Invalid trend: ${result.trend}`);
    }

    if (!['buy', 'sell', 'wait'].includes(result.signal)) {
      errors.push(`Invalid signal: ${result.signal}`);
    }

    // Trend-signal alignment
    if (result.trend === 'uptrend' && result.signal === 'sell') {
      errors.push('Trend mismatch: Uptrend should not produce sell signal');
    }
    if (result.trend === 'downtrend' && result.signal === 'buy') {
      errors.push('Trend mismatch: Downtrend should not produce buy signal');
    }

    // Confidence check
    if (result.confidence < this.confidenceThreshold) {
      warnings.push(`Confidence ${result.confidence} below threshold ${this.confidenceThreshold}`);
    }

    // Zone size validation
    if (result.zone_price_high && result.zone_price_low && result.pair) {
      const zoneValidation = validateZoneSize(
        result.pair,
        result.zone_price_high,
        result.zone_price_low,
        config.zones.minPips,
        config.zones.maxPips
      );

      if (!zoneValidation.valid) {
        warnings.push(zoneValidation.error);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate M30 analysis
   */
  validateM30Analysis(result, dailyResult) {
    const errors = [];
    const warnings = [];

    if (!result.pattern) {
      errors.push('Missing M30 pattern');
    }

    // CRITICAL: M30 must be inside Daily zone for valid swing setup
    if (!result.inside_daily_zone) {
      errors.push('M30 pattern NOT inside Daily zone - setup invalid per SOP');
    }

    // Pattern alignment
    if (dailyResult.signal === 'buy' && result.pattern !== 'bullish_engulfing') {
      warnings.push('M30 pattern does not match Daily buy signal');
    }
    if (dailyResult.signal === 'sell' && result.pattern !== 'bearish_engulfing') {
      warnings.push('M30 pattern does not match Daily sell signal');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Combine Daily and M30 analysis
   */
  combineAnalysis(dailyResult, m30Result) {
    const dailyValidation = this.validateDailyAnalysis(dailyResult);
    const m30Validation = this.validateM30Analysis(m30Result, dailyResult);

    const valid = dailyValidation.valid && m30Validation.valid;
    const confidence = (dailyResult.confidence + m30Result.confidence) / 2;

    return {
      strategy: this.name,
      pair: dailyResult.pair,
      valid,
      signal: dailyResult.signal,
      trend: dailyResult.trend,
      pattern: dailyResult.pattern,
      confidence,
      daily_zone: {
        type: dailyResult.zone_type,
        price_high: dailyResult.zone_price_high,
        price_low: dailyResult.zone_price_low
      },
      m30_zone: {
        price_high: m30Result.zone_price_high,
        price_low: m30Result.zone_price_low,
        inside_daily_zone: m30Result.inside_daily_zone
      },
      daily_analysis: dailyResult,
      m30_analysis: m30Result,
      validation: {
        daily: dailyValidation,
        m30: m30Validation
      },
      timestamp: new Date().toISOString()
    };
  }
}

export default SwingSignalSOP;
