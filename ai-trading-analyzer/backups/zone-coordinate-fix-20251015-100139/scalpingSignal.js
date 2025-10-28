import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { validateZoneSize } from '../utils/pips.js';

/**
 * Scalping Signal SOP Implementation
 * 
 * SOP Steps:
 * 1. Open 15-minute timeframe (primary)
 * 2. Identify micro trend and momentum
 * 3. Identify immediate support/resistance
 * 4. Look for quick reversal patterns or breakouts
 * 5. Lower to 5-minute timeframe (entry)
 * 6. Confirm entry with 5-min pattern
 * 7. Mark tight zones for quick entries
 */

class ScalpingSignalSOP {
  constructor() {
    this.name = 'Scalping Signal';
    this.primaryTimeframe = config.scalping.primaryTimeframe;
    this.entryTimeframe = config.scalping.entryTimeframe;
    this.confidenceThreshold = config.scalping.confidenceThreshold;
    this.patterns = config.scalping.patterns;
    this.sessions = config.scalping.sessions;
    this.newsBlackoutMin = config.scalping.newsBlackoutMin;
    this.zoneStyle = config.scalping.zoneStyle;
  }

  /**
   * Get required timeframes for analysis
   * @returns {Array<string>} Timeframes needed
   */
  getRequiredTimeframes() {
    return [this.primaryTimeframe, this.entryTimeframe];
  }

  /**
   * Build GPT prompt for Scalping analysis
   * @param {string} pair - Trading pair
   * @param {string} timeframe - Current timeframe
   * @param {Object} context - Additional context (e.g., 15min analysis for 5min)
   * @returns {string} GPT prompt
   */
  buildAnalysisPrompt(pair, timeframe, context = {}) {
    if (timeframe === this.primaryTimeframe) {
      return this.build15MinPrompt(pair);
    } else {
      return this.build5MinPrompt(pair, context.dailyAnalysis);
    }
  }

  /**
   * Build 15-minute timeframe analysis prompt
   * @param {string} pair - Trading pair
   * @returns {string} Prompt
   */
  build15MinPrompt(pair) {
    const allowedPatterns = this.patterns.join('|');
    const sessionHint = this.sessions && this.sessions.length ? `Only consider setups that align with these sessions: ${this.sessions.join(', ')}.` : 'Consider market session context (Asia/London/New York).';
    const newsHint = this.newsBlackoutMin > 0 ? `Avoid entries within ±${this.newsBlackoutMin} minutes of high-impact news.` : 'No news blackout filter.';
    const zoneHint = this.zoneStyle === 'body_to_body' ? 'Mark zone from candle body to body.' : 'Mark zone from shadow (wick) to shadow (wick).';
    return `You are an expert scalper analyzing a ${pair} 15-minute chart for quick scalping opportunities.

SCALPING SOP - Follow these steps:

1. IDENTIFY MICRO TREND:
   - Analyze last 20-30 candles for short-term direction
   - Determine: BULLISH, BEARISH, or RANGING
   - Look for momentum shifts

2. IDENTIFY IMMEDIATE SUPPORT/RESISTANCE:
   - Find the NEAREST support/resistance levels
   - These should be recent price action levels (last 50-100 candles)
   - Mark TIGHT zones (scalping requires precision). ${zoneHint}
   - STRICT SIZE: Keep the zone price width within ${config.zones.minPips}-${config.zones.maxPips} pips (convert appropriately for the instrument).

3. IDENTIFY SCALPING PATTERNS:
   - For BUY: Look for bullish reversal at support OR breakout above resistance
   - For SELL: Look for bearish reversal at resistance OR breakdown below support
   - Only use these patterns: ${this.patterns.join(', ')}

4. MOMENTUM CONFIRMATION:
   - Check if recent candles show strong momentum
   - Look for increasing volume/volatility
   - Avoid choppy, indecisive price action

5. MARK ZONE COORDINATES:
   - Mark TIGHT zones (${this.zoneStyle === 'body_to_body' ? 'body to body' : 'shadow to shadow'})
   - Scalping zones should be smaller than swing zones
   - Provide exact pixel coordinates
   - Ensure the zone price width stays within ${config.zones.minPips}-${config.zones.maxPips} pips; if wider, pick the most actionable core area.

SESSION FILTER: ${sessionHint}
NEWS FILTER: ${newsHint}

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "15min",
  "micro_trend": "bullish|bearish|ranging",
  "signal": "buy|sell|wait",
  "pattern": "${allowedPatterns}|none",
  "zone_type": "support|resistance|breakout|none",
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "zone_coordinates": {
    "x1": 0,
    "y1": 0,
    "x2": 0,
    "y2": 0
  },
  "momentum": "strong|moderate|weak",
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Build 5-minute timeframe analysis prompt
   * @param {string} pair - Trading pair
   * @param {Object} primaryAnalysis - 15-minute timeframe analysis results
   * @returns {string} Prompt
   */
  build5MinPrompt(pair, primaryAnalysis = null) {
    const allowedPatterns = this.patterns.join('|');

    const primaryContext = primaryAnalysis ? `

CONTEXT FROM 15-MIN ANALYSIS:
- 15-Min Signal: ${primaryAnalysis.signal?.toUpperCase() || 'UNKNOWN'}
- 15-Min Pattern: ${primaryAnalysis.pattern?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
- 15-Min Zone Price Range: ${primaryAnalysis.zone_price_low || 'N/A'} to ${primaryAnalysis.zone_price_high || 'N/A'}
- Expected 5-Min Pattern: ${primaryAnalysis.signal === 'buy' ? 'BULLISH (engulfing, pin bar, etc.)' : primaryAnalysis.signal === 'sell' ? 'BEARISH (engulfing, pin bar, etc.)' : 'CONFIRMATION'}

IMPORTANT: Look for 5-min patterns near the price range ${primaryAnalysis.zone_price_low || ''} - ${primaryAnalysis.zone_price_high || ''}.` : '';

    return `You are analyzing a ${pair} 5-minute chart for scalping entry confirmation.
${primaryContext}

SCALPING ENTRY SOP:

1. IDENTIFY CONFIRMATION PATTERNS (RELAXED CRITERIA):
   - Scan the 5-min chart for ${primaryAnalysis?.signal === 'buy' ? 'BULLISH' : primaryAnalysis?.signal === 'sell' ? 'BEARISH' : 'CONFIRMATION'} patterns
   - Allowed patterns: ${allowedPatterns}
   - ACCEPT patterns that are "close enough" even if not textbook perfect
   - Focus on patterns near price level ${primaryAnalysis?.zone_price_low || ''}-${primaryAnalysis?.zone_price_high || ''}
   - PREFER recent patterns (last 10-20 candles) but don't exclude older ones if they're in the right zone
   - PRIORITY: Find ANY reasonable ${primaryAnalysis?.signal === 'buy' ? 'bullish' : primaryAnalysis?.signal === 'sell' ? 'bearish' : ''} signal

2. CHECK PRICE ALIGNMENT:
   - Check if ANY 5-min pattern's price range overlaps with the 15-min zone (${primaryAnalysis?.zone_price_low || ''}-${primaryAnalysis?.zone_price_high || ''})
   - Set inside_15min_zone to true if there's overlap, false otherwise

3. TIMING:
   - Evaluate if pattern is recent enough for immediate entry
   - Set entry_timing to "immediate" if in last 5-10 candles, "wait" if forming, "expired" if too old (>20 candles)

4. TIGHT ENTRY ZONE:
   - Mark very precise entry zone (${this.zoneStyle === 'body_to_body' ? 'body to body' : 'shadow to shadow'})
   - Include actual price levels for zone_price_high and zone_price_low
   - Provide exact pixel coordinates
   - STRICT SIZE: Constrain the 5-min entry zone to ${config.zones.minPips}-${config.zones.maxPips} pips. If necessary, narrow to the core overlap with the 15-min zone.

NOTE: For scalping, prioritize patterns that overlap with the 15-min zone price range, even if they're not the absolute most recent candles.

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "5min",
  "pattern": "${allowedPatterns}|none",
  "zone_coordinates": {
    "x1": 0,
    "y1": 0,
    "x2": 0,
    "y2": 0
  },
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "inside_15min_zone": true|false,
  "entry_timing": "immediate|wait|expired",
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Validate 15-min analysis result
   * @param {Object} result - Analysis result
   * @returns {Object} Validation result
   */
  validate15MinAnalysis(result) {
    const errors = [];
    const warnings = [];

    // Required fields
    const required = ['micro_trend', 'signal', 'pattern', 'zone_type', 'momentum', 'confidence'];
    required.forEach(field => {
      if (!result[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate micro trend
    if (!['bullish', 'bearish', 'ranging'].includes(result.micro_trend)) {
      errors.push(`Invalid micro_trend: ${result.micro_trend}`);
    }

    // Validate signal
    if (!['buy', 'sell', 'wait'].includes(result.signal)) {
      errors.push(`Invalid signal: ${result.signal}`);
    }

    // Validate momentum
    if (!['strong', 'moderate', 'weak'].includes(result.momentum)) {
      errors.push(`Invalid momentum: ${result.momentum}`);
    }

    // Warn on weak momentum
    if (result.momentum === 'weak') {
      warnings.push('Weak momentum detected - scalping may be risky');
    }

    // Validate confidence
    if (result.confidence < 0 || result.confidence > 1) {
      errors.push(`Invalid confidence: ${result.confidence}`);
    }

    // Check confidence threshold
    if (result.confidence < this.confidenceThreshold) {
      errors.push(`Confidence ${result.confidence} below threshold ${this.confidenceThreshold}`);
    }

    // Validate zone coordinates
    if (result.zone_coordinates) {
      const coords = result.zone_coordinates;
      if (!coords.x1 || !coords.y1 || !coords.x2 || !coords.y2) {
        errors.push('Incomplete zone coordinates');
      }
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
        logger.warn(`15-min zone validation failed: ${zoneValidation.error}`);
      } else {
        logger.info(`15-min zone size OK: ${zoneValidation.actualPips.toFixed(1)} pips`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate 5-min analysis result
   * @param {Object} result - Analysis result
   * @param {Object} primaryResult - 15-min analysis result
   * @returns {Object} Validation result
   */
  validate5MinAnalysis(result, primaryResult) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!result.pattern || !result.zone_coordinates) {
      errors.push('Missing required 5-min fields');
    }

    // Must be inside 15-min zone
    if (!result.inside_15min_zone) {
      errors.push('5-min pattern not inside 15-min zone');
    }

    // Check entry timing
    if (result.entry_timing === 'expired') {
      warnings.push('Entry opportunity may have expired');
    }

    // Confidence check
    if (result.confidence < this.confidenceThreshold) {
      warnings.push(`5-min confidence ${result.confidence} below threshold`);
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
        logger.warn(`5-min zone validation failed: ${zoneValidation.error}`);
      } else {
        logger.info(`5-min zone size OK: ${zoneValidation.actualPips.toFixed(1)} pips`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Combine 15-min and 5-min analysis
   * @param {Object} primaryResult - 15-min analysis
   * @param {Object} entryResult - 5-min analysis
   * @returns {Object} Combined analysis
   */
  combineAnalysis(primaryResult, entryResult) {
    const primaryValidation = this.validate15MinAnalysis(primaryResult);
    const entryValidation = this.validate5MinAnalysis(entryResult, primaryResult);

    const combinedConfidence = (primaryResult.confidence + entryResult.confidence) / 2;

    return {
      strategy: this.name,
      pair: primaryResult.pair,
      valid: primaryValidation.valid && entryValidation.valid,
      signal: primaryResult.signal,
      micro_trend: primaryResult.micro_trend,
      pattern: primaryResult.pattern,
      momentum: primaryResult.momentum,
      primary_zone: {
        type: primaryResult.zone_type,
        price_high: primaryResult.zone_price_high,
        price_low: primaryResult.zone_price_low,
        coordinates: primaryResult.zone_coordinates
      },
      entry_zone: {
        coordinates: entryResult.zone_coordinates,
        timing: entryResult.entry_timing
      },
      confidence: combinedConfidence,
      primary_analysis: primaryResult,
      entry_analysis: entryResult,
      validation: {
        primary: primaryValidation,
        entry: entryValidation
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
    const label = analysis.signal === 'buy' ? 'BUY' : 'SELL';
    const primaryTF = `${this.primaryTimeframe}${isNaN(this.primaryTimeframe) ? '' : 'M'}`;
    const entryTF = `${this.entryTimeframe}${isNaN(this.entryTimeframe) ? '' : 'M'}`;

    return {
      primary: {
        coordinates: analysis.primary_zone.coordinates,
        color: color,
        opacity: config.zones.opacity,
        borderWidth: config.zones.borderWidth,
        label: `${primaryTF} ${label} - ${analysis.pattern.replace('_', ' ').toUpperCase()}`,
        labelPosition: 'top-left'
      },
      entry: {
        coordinates: analysis.entry_zone.coordinates,
        color: color,
        opacity: config.zones.opacity + 0.15,
        borderWidth: config.zones.borderWidth + 1,
        label: `${entryTF} ENTRY - ${analysis.entry_analysis.pattern.replace('_', ' ').toUpperCase()}`,
        labelPosition: 'bottom-right'
      }
    };
  }
}

export default ScalpingSignalSOP;
