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
   - Use the key levels provided (from last 180 bars analysis)
   - Support = potential BUY zone (price bounces up from level)
   - Resistance = potential SELL zone (price bounces down from level)
   
   ZONE SELECTION CRITERIA (prioritize BEST quality zones):
   a) Most tested zone (multiple touches = stronger, 3+ touches ideal)
   b) Recent touches (zone tested within last 180 bars)
   c) Clean reactions (strong bounces, not slow grinds)
   d) Proximity to current price (closer better, but not primary factor)
   
   SELECT THE BEST QUALITY zone from 180 bars - quality over proximity

3. IDENTIFY CANDLESTICK PATTERNS:
   - Review the detected patterns provided
   - UPTREND → Look for BULLISH ENGULFING at SUPPORT
   - DOWNTREND → Look for BEARISH ENGULFING at RESISTANCE
   - Scan last 180 bars for patterns
   
   QUALITY CRITERIA (prioritize BEST, not most recent):
   a) Pattern that OVERLAPS with support/resistance zone (HIGHEST PRIORITY)
   b) Pattern at a well-tested zone (multiple touches = stronger)
   c) Strongest pattern (larger body size, clearest engulfing)
   d) Pattern proximity to current price (closer is better, but not primary factor)
   
   SELECT THE HIGHEST QUALITY PATTERN even if it's 50-100 bars ago - quality over recency

4. DETERMINE SIGNAL:
   - UPTREND + BULLISH pattern at SUPPORT = BUY
   - DOWNTREND + BEARISH pattern at RESISTANCE = SELL
   - SIDEWAYS or no clear pattern = WAIT

5. MARK ZONE PRICES:
   - Zone should be around the engulfing pattern
   - Keep zone width between ${config.zones.minPips}-${config.zones.maxPips} pips (flexible range)
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

IMPORTANT: Look for M30 engulfing patterns near or overlapping with the Daily zone price range. Some proximity is acceptable.` : '';

    return `You are analyzing ${pair} M30 (30-minute) chart data for Swing Trading entry confirmation.
${dailyContext}

STRICT SOP:

1. IDENTIFY ENGULFING PATTERNS ON M30:
   - Review the detected patterns in the data
   - Look for ${dailyAnalysis?.signal === 'buy' ? 'BULLISH' : dailyAnalysis?.signal === 'sell' ? 'BEARISH' : ''} engulfing
   - Scan last 180 bars for patterns
   
   SELECTION CRITERIA (prioritize BEST, not most recent):
   a) Pattern that overlaps or is NEAR Daily zone (${dailyAnalysis?.zone_price_low}-${dailyAnalysis?.zone_price_high}) - HIGH PRIORITY
   b) Strongest engulfing (larger body, clearest reversal signal)
   c) Pattern close to Daily zone (within reasonable distance)
   d) Pattern proximity to current price (closer better, but not primary)
   
   SELECT THE HIGHEST QUALITY PATTERN near the Daily zone, even if 50-100 bars ago

2. CHECK PRICE ALIGNMENT:
   - Verify if M30 pattern price overlaps with or is near Daily zone
   - Set inside_daily_zone to true if overlap exists or pattern is reasonably close

3. MARK M30 ZONE:
   - Zone around the engulfing pattern
   - Keep zone width between ${config.zones.minPips}-${config.zones.maxPips} pips (flexible range)
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
    logger.info('\n=== Validating Daily Analysis ===');
    const errors = [];
    const warnings = [];

    // Required fields
    const required = ['trend', 'signal', 'pattern', 'zone_type', 'confidence'];
    logger.info(`Checking required fields: ${required.join(', ')}`);
    required.forEach(field => {
      if (!result[field]) {
        errors.push(`Missing required field: ${field}`);
        logger.error(`✗ Missing field: ${field}`);
      } else {
        logger.success(`✓ ${field}: ${result[field]}`);
      }
    });

    // Validate values
    logger.info('Checking trend value...');
    if (!['uptrend', 'downtrend', 'sideways'].includes(result.trend)) {
      errors.push(`Invalid trend: ${result.trend}`);
      logger.error(`✗ Invalid trend: ${result.trend}`);
    } else {
      logger.success(`✓ Valid trend: ${result.trend}`);
    }

    logger.info('Checking signal value...');
    if (!['buy', 'sell', 'wait'].includes(result.signal)) {
      errors.push(`Invalid signal: ${result.signal}`);
      logger.error(`✗ Invalid signal: ${result.signal}`);
    } else {
      logger.success(`✓ Valid signal: ${result.signal}`);
    }

    // Trend-signal alignment
    logger.info('Checking trend-signal alignment...');
    if (result.trend === 'uptrend' && result.signal === 'sell') {
      errors.push('Trend mismatch: Uptrend should not produce sell signal');
      logger.error('✗ Trend mismatch: Uptrend with sell signal');
    } else if (result.trend === 'downtrend' && result.signal === 'buy') {
      errors.push('Trend mismatch: Downtrend should not produce buy signal');
      logger.error('✗ Trend mismatch: Downtrend with buy signal');
    } else {
      logger.success(`✓ Trend-signal alignment OK: ${result.trend} → ${result.signal}`);
    }

    // Confidence check - only warn, don't invalidate
    logger.info(`Checking confidence: ${result.confidence} vs threshold ${this.confidenceThreshold}...`);
    if (result.confidence < this.confidenceThreshold) {
      warnings.push(`Confidence ${result.confidence} below threshold ${this.confidenceThreshold}`);
      logger.warn(`⚠ Confidence below threshold (${result.confidence} < ${this.confidenceThreshold})`);
    } else {
      logger.success(`✓ Confidence OK: ${result.confidence}`);
    }

    // Zone size validation
    if (result.zone_price_high && result.zone_price_low && result.pair) {
      logger.info(`Checking zone size: ${result.zone_price_low} - ${result.zone_price_high}...`);
      const zoneValidation = validateZoneSize(
        result.pair,
        result.zone_price_high,
        result.zone_price_low,
        config.zones.minPips,
        config.zones.maxPips
      );

      if (!zoneValidation.valid) {
        warnings.push(zoneValidation.error);
        logger.warn(`⚠ Zone size issue: ${zoneValidation.error} (${zoneValidation.actualPips.toFixed(1)} pips)`);
      } else {
        logger.success(`✓ Zone size OK: ${zoneValidation.actualPips.toFixed(1)} pips`);
      }
    }

    logger.info(`Daily validation complete: ${errors.length} errors, ${warnings.length} warnings`);
    if (errors.length > 0) {
      logger.error('Daily validation FAILED with errors:', errors);
    } else {
      logger.success('✓ Daily validation PASSED');
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
    logger.info('\n=== Validating M30 Analysis ===');
    const errors = [];
    const warnings = [];

    logger.info('Checking for M30 pattern...');
    if (!result.pattern) {
      errors.push('Missing M30 pattern');
      logger.error('✗ Missing M30 pattern');
    } else {
      logger.success(`✓ M30 pattern found: ${result.pattern}`);
    }

    // M30 should overlap with Daily zone - make this less strict
    logger.info(`Checking zone alignment: inside_daily_zone = ${result.inside_daily_zone}...`);
    if (!result.inside_daily_zone) {
      warnings.push('M30 pattern is outside Daily zone - consider waiting for better alignment');
      logger.warn('⚠ M30 pattern is outside Daily zone');
    } else {
      logger.success('✓ M30 pattern is inside/near Daily zone');
    }

    // Pattern alignment
    logger.info(`Checking pattern alignment with Daily signal (${dailyResult.signal})...`);
    if (dailyResult.signal === 'buy' && result.pattern !== 'bullish_engulfing') {
      warnings.push('M30 pattern does not match Daily buy signal');
      logger.warn(`⚠ M30 pattern (${result.pattern}) doesn't match Daily buy signal`);
    } else if (dailyResult.signal === 'sell' && result.pattern !== 'bearish_engulfing') {
      warnings.push('M30 pattern does not match Daily sell signal');
      logger.warn(`⚠ M30 pattern (${result.pattern}) doesn't match Daily sell signal`);
    } else {
      logger.success(`✓ M30 pattern matches Daily ${dailyResult.signal} signal`);
    }

    logger.info(`M30 validation complete: ${errors.length} errors, ${warnings.length} warnings`);
    if (errors.length > 0) {
      logger.error('M30 validation FAILED with errors:', errors);
    } else {
      logger.success('✓ M30 validation PASSED');
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
    logger.info('\n=== Combining Swing Analysis ===');
    logger.info(`Daily: ${dailyResult.signal} signal, ${dailyResult.trend} trend, ${dailyResult.pattern}`);
    logger.info(`M30: ${m30Result.pattern}, inside_daily_zone=${m30Result.inside_daily_zone}`);
    
    const dailyValidation = this.validateDailyAnalysis(dailyResult);
    const m30Validation = this.validateM30Analysis(m30Result, dailyResult);

    const valid = dailyValidation.valid && m30Validation.valid;
    const confidence = (dailyResult.confidence + m30Result.confidence) / 2;

    logger.info(`\nFinal validation result: ${valid ? 'VALID' : 'INVALID'}`);
    logger.info(`Combined confidence: ${confidence.toFixed(2)}`);
    
    if (!valid) {
      logger.warn('⚠ Setup marked as INVALID - check errors above');
    } else {
      logger.success('✅ Setup marked as VALID');
    }

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
