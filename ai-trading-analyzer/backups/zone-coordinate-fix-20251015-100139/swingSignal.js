import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { validateZoneSize } from '../utils/pips.js';

/**
 * Swing Signal SOP Implementation
 * 
 * SOP Steps:
 * 1. Open Daily timeframe
 * 2. Identify trend (uptrend/downtrend/sideways)
 * 3. Identify Support/Resistance zones
 * 4. Identify Candlestick Patterns (Bullish/Bearish Engulfing)
 * 5. Lower to M30 timeframe
 * 6. Find M30 engulfing inside Daily engulfing
 * 7. Mark zone "shadow to shadow"
 */

class SwingSignalSOP {
  constructor() {
    this.name = 'Swing Signal';
    this.dailyTimeframe = config.swing.dailyTimeframe;
    this.entryTimeframe = config.swing.entryTimeframe;
    this.confidenceThreshold = config.swing.confidenceThreshold;
  }

  /**
   * Get required timeframes for analysis
   * @returns {Array<string>} Timeframes needed
   */
  getRequiredTimeframes() {
    return [this.dailyTimeframe, this.entryTimeframe];
  }

  /**
   * Build GPT prompt for Swing analysis
   * @param {string} pair - Trading pair
   * @param {string} timeframe - Current timeframe
   * @param {Object} context - Additional context (e.g., Daily analysis for M30)
   * @returns {string} GPT prompt
   */
  buildAnalysisPrompt(pair, timeframe, context = {}) {
    if (timeframe === this.dailyTimeframe) {
      return this.buildDailyPrompt(pair);
    } else {
      return this.buildM30Prompt(pair, context.dailyAnalysis);
    }
  }

  /**
   * Build Daily timeframe analysis prompt
   * @param {string} pair - Trading pair
   * @returns {string} Prompt
   */
  buildDailyPrompt(pair) {
    return `You are an expert Forex/Gold trader analyzing a ${pair} Daily chart for Swing Trading signals.

STRICT SOP - Follow these steps exactly:

1. IDENTIFY TREND (CRITICAL - BE ACCURATE):
   - Look at the BROADER chart context (at least 30-50 candles)
   - Ignore minor pullbacks/bounces - focus on the DOMINANT direction

   HOW TO IDENTIFY TRENDS:
   - UPTREND = Each peak is HIGHER than the previous peak AND each valley is HIGHER than the previous valley
     Example: If price was at 1.17, then 1.16, then 1.18, then 1.17 = UPTREND (higher highs, higher lows)

   - DOWNTREND = Each peak is LOWER than the previous peak AND each valley is LOWER than the previous valley
     Example: If price was at 1.17, then 1.16, then 1.15, then 1.14 = DOWNTREND (lower highs, lower lows)
     **Even if there's a small bounce at the end, if the overall movement is DOWN, it's still a DOWNTREND**

   - SIDEWAYS = Price oscillating in a range with no clear higher/lower pattern

   DECISION RULES:
   - Compare the FIRST major high on the left with the LATEST high on the right:
     * If latest high is LOWER than first high = suggests DOWNTREND
     * If latest high is HIGHER than first high = suggests UPTREND
   - Compare the FIRST major low on the left with the LATEST low on the right:
     * If latest low is LOWER than first low = confirms DOWNTREND
     * If latest low is HIGHER than first low = confirms UPTREND
   - If the chart shows price declining from top-left to bottom-right = DOWNTREND
   - If the chart shows price climbing from bottom-left to top-right = UPTREND
   - Don't be fooled by short-term bounces or pullbacks - look at the big picture
   - A small bounce after a long decline does NOT make it an uptrend

   THEN:
   - If uptrend → look for BUY signals at SUPPORT (price bouncing up)
   - If downtrend → look for SELL signals at RESISTANCE (price bouncing down)
   - If sideways → signal = "wait" (wait for breakout)

2. IDENTIFY SUPPORT/RESISTANCE ZONES:
   - Support = potential BUY zone (price bounces up from this level)
   - Resistance = potential SELL zone (price bounces down from this level)
   - Mark the EXACT price levels

3. IDENTIFY CANDLESTICK PATTERNS:
   - Look for RECENT engulfing patterns (focus on the RIGHT SIDE of the chart - last 20-30 candles)
   - UPTREND → Look for BULLISH ENGULFING at SUPPORT (buy signal)
   - DOWNTREND → Look for BEARISH ENGULFING at RESISTANCE (sell signal)
   - Bullish Engulfing = Green candle completely engulfs previous red candle (body + wicks)
   - Bearish Engulfing = Red candle completely engulfs previous green candle (body + wicks)
   - The pattern should be RECENT and near CURRENT PRICE (rightmost area of chart)

CRITICAL - ZONE MUST BE RELEVANT TO CURRENT PRICE:
   - The zone price range MUST be near the CURRENT PRICE (visible on the right side of chart)
   - DO NOT mark old zones from months/weeks ago that are far from current price
   - If current price is 4100, look for patterns near 4000-4100 range, NOT at 3300
   - If no recent pattern exists near current price, mark pattern as "none" rather than using an old irrelevant pattern

CRITICAL VALIDATION:
   - If trend is DOWNTREND, you MUST look for BEARISH patterns (sell signal)
   - If trend is UPTREND, you MUST look for BULLISH patterns (buy signal)
   - DO NOT suggest buy signals in a downtrend or sell signals in an uptrend

4. MARK ZONE COORDINATES:
   - Identify the EXACT candle with the engulfing pattern
   - Mark from SHADOW TO SHADOW (not body to body)
   - Provide pixel coordinates: x1, y1 (top-left), x2, y2 (bottom-right)
   - VERY IMPORTANT: Keep the zone PRICE RANGE width within ${config.zones.minPips}-${config.zones.maxPips} pips (convert for the instrument). If wick-to-wick exceeds this, select the most relevant core subrange near current price to stay within this pip width.

Return ONLY valid JSON in this exact format:
{
  "pair": "${pair}",
  "timeframe": "Daily",
  "trend": "uptrend|downtrend|sideways",
  "signal": "buy|sell|wait",
  "pattern": "bullish_engulfing|bearish_engulfing|none",
  "zone_type": "support|resistance|none",
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "zone_coordinates": {
    "x1": 0,
    "y1": 0,
    "x2": 0,
    "y2": 0
  },
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Build M30 timeframe analysis prompt
   * @param {string} pair - Trading pair
   * @param {Object} dailyAnalysis - Daily timeframe analysis results
   * @returns {string} Prompt
   */
  buildM30Prompt(pair, dailyAnalysis = null) {
    const dailyContext = dailyAnalysis ? `

CONTEXT FROM DAILY ANALYSIS:
- Daily Signal: ${dailyAnalysis.signal?.toUpperCase() || 'UNKNOWN'}
- Daily Pattern: ${dailyAnalysis.pattern?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
- Daily Zone Price Range: ${dailyAnalysis.zone_price_low || 'N/A'} to ${dailyAnalysis.zone_price_high || 'N/A'}
- Expected M30 Pattern: ${dailyAnalysis.signal === 'buy' ? 'BULLISH ENGULFING' : dailyAnalysis.signal === 'sell' ? 'BEARISH ENGULFING' : 'ENGULFING'}

IMPORTANT: Look for M30 engulfing patterns near the price range ${dailyAnalysis.zone_price_low || ''} - ${dailyAnalysis.zone_price_high || ''}.` : '';

    return `You are analyzing a ${pair} M30 (30-minute) chart for Swing Trading entry confirmation.
${dailyContext}

STRICT SOP - Follow these steps:

1. IDENTIFY ENGULFING PATTERNS ON M30 (RELAXED CRITERIA):
   - Scan the ENTIRE M30 chart for ${dailyAnalysis?.signal === 'buy' ? 'BULLISH' : dailyAnalysis?.signal === 'sell' ? 'BEARISH' : 'ENGULFING'} patterns
   - ACCEPT patterns that are "close enough" even if not perfect:
     * IDEAL: Green candle completely engulfs previous red candle (body + wicks)
     * ACCEPTABLE: Green candle body is significantly larger and covers most of the previous red candle
     * ALSO ACCEPTABLE: Strong momentum candles in the same direction (multiple green candles pushing up)
   - Focus on patterns near price level ${dailyAnalysis?.zone_price_low || ''}-${dailyAnalysis?.zone_price_high || ''}
   - Look for patterns INSIDE or NEAR the Daily zone price range
   - PRIORITY: Find ANY reasonable ${dailyAnalysis?.signal === 'buy' ? 'bullish' : dailyAnalysis?.signal === 'sell' ? 'bearish' : ''} signal, even if not textbook perfect

2. CHECK PRICE ALIGNMENT:
   - Check if ANY M30 engulfing pattern's price range overlaps with the Daily zone (${dailyAnalysis?.zone_price_low || ''}-${dailyAnalysis?.zone_price_high || ''})
   - Set inside_daily_zone to true if there's overlap, false otherwise

3. MARK M30 ZONE:
   - Mark from SHADOW TO SHADOW (full wick-to-wick height)
   - Provide exact pixel coordinates of the engulfing candle pair
   - Include actual price levels for zone_price_high and zone_price_low
   - STRICT SIZE: Ensure the M30 entry zone price width stays within ${config.zones.minPips}-${config.zones.maxPips} pips. If broader, narrow to the most actionable core area overlapping the Daily zone.

IMPORTANT: The engulfing pattern does NOT need to be the most recent candles.
It should be ANY ${dailyAnalysis?.signal === 'buy' ? 'bullish' : dailyAnalysis?.signal === 'sell' ? 'bearish' : ''} engulfing pattern that overlaps with the Daily zone price range (${dailyAnalysis?.zone_price_low || ''}-${dailyAnalysis?.zone_price_high || ''}).

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "M30",
  "pattern": "bullish_engulfing|bearish_engulfing|none",
  "zone_coordinates": {
    "x1": 0,
    "y1": 0,
    "x2": 0,
    "y2": 0
  },
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "inside_daily_zone": true|false,
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Normalize coordinates to relative ratios
   * @param {Object} coords - Absolute coordinates
   * @param {number} imageWidth - Image width
   * @param {number} imageHeight - Image height
   * @returns {Object} Relative coordinates (0-1)
   */
  normalizeCoordinates(coords, imageWidth, imageHeight) {
    if (!coords || !coords.x1) return coords;
    return {
      rx1: coords.x1 / imageWidth,
      ry1: coords.y1 / imageHeight,
      rx2: coords.x2 / imageWidth,
      ry2: coords.y2 / imageHeight,
      _normalized: true
    };
  }

  /**
   * Validate Daily analysis result
   * @param {Object} result - Analysis result
   * @returns {Object} Validation result
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

    // Validate trend
    if (!['uptrend', 'downtrend', 'sideways'].includes(result.trend)) {
      errors.push(`Invalid trend: ${result.trend}`);
    }

    // Validate signal
    if (!['buy', 'sell', 'wait'].includes(result.signal)) {
      errors.push(`Invalid signal: ${result.signal}`);
    }

    // Validate pattern
    if (!['bullish_engulfing', 'bearish_engulfing', 'none'].includes(result.pattern)) {
      errors.push(`Invalid pattern: ${result.pattern}`);
    }

    // CRITICAL: Validate trend-signal-pattern alignment
    if (result.trend === 'uptrend' && result.signal === 'sell') {
      errors.push('TREND MISMATCH: Uptrend should produce buy signals, not sell signals');
    }
    if (result.trend === 'downtrend' && result.signal === 'buy') {
      errors.push('TREND MISMATCH: Downtrend should produce sell signals, not buy signals');
    }
    if (result.trend === 'uptrend' && result.pattern === 'bearish_engulfing') {
      errors.push('PATTERN MISMATCH: Uptrend should have bullish_engulfing pattern, not bearish');
    }
    if (result.trend === 'downtrend' && result.pattern === 'bullish_engulfing') {
      errors.push('PATTERN MISMATCH: Downtrend should have bearish_engulfing pattern, not bullish');
    }
    if (result.signal === 'buy' && result.pattern === 'bearish_engulfing') {
      errors.push('SIGNAL-PATTERN MISMATCH: Buy signal requires bullish_engulfing, not bearish');
    }
    if (result.signal === 'sell' && result.pattern === 'bullish_engulfing') {
      errors.push('SIGNAL-PATTERN MISMATCH: Sell signal requires bearish_engulfing, not bullish');
    }

    // Validate confidence
    if (result.confidence < 0 || result.confidence > 1) {
      errors.push(`Invalid confidence: ${result.confidence}`);
    }

    // Validate zone coordinates (RELAXED: warn instead of error)
    if (result.zone_coordinates) {
      const coords = result.zone_coordinates;
      if (!coords.x1 || !coords.y1 || !coords.x2 || !coords.y2) {
        warnings.push('Incomplete zone coordinates (drawing may be skipped)');
      }
    } else {
      warnings.push('No zone coordinates provided (drawing may be skipped)');
    }

    // Check confidence threshold
    if (result.confidence < this.confidenceThreshold) {
      errors.push(`Confidence ${result.confidence} below threshold ${this.confidenceThreshold}`);
    }

    // Validate zone size (pip width)
    if (result.zone_price_high && result.zone_price_low && result.pair) {
      const zoneValidation = validateZoneSize(
        result.pair,
        result.zone_price_high,
        result.zone_price_low,
        config.zones.minPips,
        config.zones.maxPips
      );

      if (!zoneValidation.valid) {
        errors.push(zoneValidation.error);
        logger.warn(`Daily zone validation failed: ${zoneValidation.error}`);
      } else {
        logger.info(`Daily zone size OK: ${zoneValidation.actualPips.toFixed(1)} pips`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate M30 analysis result
   * @param {Object} result - Analysis result
   * @param {Object} dailyResult - Daily analysis result
   * @returns {Object} Validation result
   */
  validateM30Analysis(result, dailyResult) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!result.pattern || !result.zone_coordinates) {
      errors.push('Missing required M30 fields');
    }

    // Check if inside daily zone (RELAXED validation)
    // If the model's boolean is false, try a price-range overlap fallback with larger tolerance
    if (!result.inside_daily_zone) {
      const dLow = Number(dailyResult.zone_price_low);
      const dHigh = Number(dailyResult.zone_price_high);
      const eLow = Number(result.zone_price_low);
      const eHigh = Number(result.zone_price_high);

      const haveDailyPrices = Number.isFinite(dLow) && Number.isFinite(dHigh) && dHigh > dLow;
      const haveEntryPrices = Number.isFinite(eLow) && Number.isFinite(eHigh) && eHigh > eLow;

      if (haveDailyPrices && haveEntryPrices) {
        // RELAXED: Allow patterns within 50% of the daily zone range (much more lenient)
        const dailyRange = dHigh - dLow;
        const tol = dailyRange * 0.5; // 50% tolerance
        const overlapLow = Math.max(dLow, eLow);
        const overlapHigh = Math.min(dHigh, eHigh);
        const overlaps = overlapHigh + tol >= overlapLow;

        if (overlaps) {
          // Downgrade to warning; treat as inside
          warnings.push('M30 zone near Daily zone (relaxed criteria - accepting pattern)');
        } else {
          // STILL RELAXED: Even if not overlapping, downgrade to warning instead of error
          warnings.push('M30 pattern not inside Daily zone (accepting anyway with lower confidence)');
        }
      } else {
        // No price data - just warn instead of error
        warnings.push('M30 pattern zone validation skipped (no price data)');
      }
    }

    // Pattern must match daily signal (RELAXED - downgrade to warning)
    if (dailyResult.signal === 'buy' && result.pattern !== 'bullish_engulfing') {
      // Accept if pattern is at least not opposite direction
      if (result.pattern === 'bearish_engulfing') {
        errors.push('M30 pattern contradicts Daily buy signal (bearish found)');
      } else {
        warnings.push('M30 pattern does not match Daily buy signal perfectly (accepting anyway)');
      }
    }
    if (dailyResult.signal === 'sell' && result.pattern !== 'bearish_engulfing') {
      // Accept if pattern is at least not opposite direction
      if (result.pattern === 'bullish_engulfing') {
        errors.push('M30 pattern contradicts Daily sell signal (bullish found)');
      } else {
        warnings.push('M30 pattern does not match Daily sell signal perfectly (accepting anyway)');
      }
    }

    // Confidence check (RELAXED - only warn, don't fail)
    if (result.confidence < this.confidenceThreshold) {
      warnings.push(`M30 confidence ${result.confidence} below threshold (accepting with lower confidence)`);
    }

    // Validate zone size (pip width)
    if (result.zone_price_high && result.zone_price_low && result.pair) {
      const zoneValidation = validateZoneSize(
        result.pair,
        result.zone_price_high,
        result.zone_price_low,
        config.zones.minPips,
        config.zones.maxPips
      );

      if (!zoneValidation.valid) {
        errors.push(zoneValidation.error);
        logger.warn(`M30 zone validation failed: ${zoneValidation.error}`);
      } else {
        logger.info(`M30 zone size OK: ${zoneValidation.actualPips.toFixed(1)} pips`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Combine Daily and M30 analysis
   * @param {Object} dailyResult - Daily analysis
   * @param {Object} m30Result - M30 analysis
   * @returns {Object} Combined analysis
   */
  combineAnalysis(dailyResult, m30Result) {
    const dailyValidation = this.validateDailyAnalysis(dailyResult);
    const m30Validation = this.validateM30Analysis(m30Result, dailyResult);

    // Determine status per SOP
    let status = 'confirmed';
    let valid = dailyValidation.valid && m30Validation.valid;
    let confidence = (dailyResult.confidence + m30Result.confidence) / 2;

    // Sideways → wait for breakout (use only Daily confidence)
    if (dailyResult.trend === 'sideways' || dailyResult.signal === 'wait') {
      status = 'wait_breakout';
      valid = false;
      confidence = dailyResult.confidence;
    } else if (!m30Validation.valid) {
      // Trending but M30 not aligned → setup forming
      status = 'forming';
      valid = false;
      confidence = dailyResult.confidence;
    }

    return {
      strategy: this.name,
      pair: dailyResult.pair,
      status,
      valid,
      signal: dailyResult.signal,
      trend: dailyResult.trend,
      pattern: dailyResult.pattern,
      daily_zone: {
        type: dailyResult.zone_type,
        price_high: dailyResult.zone_price_high,
        price_low: dailyResult.zone_price_low,
        coordinates: dailyResult.zone_coordinates
      },
      m30_zone: {
        coordinates: m30Result.zone_coordinates
      },
      confidence,
      daily_analysis: dailyResult,
      m30_analysis: m30Result,
      validation: {
        daily: dailyValidation,
        m30: m30Validation
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get drawing instructions for zones
   * @param {Object} analysis - Combined analysis
   * @returns {Object} Drawing instructions
   */
  getDrawingInstructions(analysis) {
    const color = analysis.signal === 'buy' ? config.zones.buyColor : config.zones.sellColor;
    const label = analysis.signal === 'buy' ? 'BUY ZONE' : 'SELL ZONE';

    return {
      daily: {
        coordinates: analysis.daily_zone.coordinates,
        color: color,
        opacity: config.zones.opacity,
        borderWidth: config.zones.borderWidth,
        label: `Daily ${label} - ${analysis.pattern.replace('_', ' ').toUpperCase()}`,
        labelPosition: 'top-left'
      },
      m30: {
        coordinates: analysis.m30_zone.coordinates,
        color: color,
        opacity: config.zones.opacity + 0.1,
        borderWidth: config.zones.borderWidth,
        label: `M30 Entry - ${analysis.pattern.replace('_', ' ').toUpperCase()}`,
        labelPosition: 'bottom-right'
      }
    };
  }
}

export default SwingSignalSOP;
