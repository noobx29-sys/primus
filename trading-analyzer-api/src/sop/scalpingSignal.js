import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { validateZoneSize } from '../utils/pips.js';

/**
 * Scalping Signal SOP Implementation (API-based)
 * 
 * SOP Steps:
 * 1. Analyze 15-minute timeframe data
 * 2. Identify micro trend and momentum
 * 3. Identify immediate support/resistance
 * 4. Look for quick reversal patterns or breakouts
 * 5. Analyze 5-minute timeframe data
 * 6. Confirm entry with 5-min pattern
 * 7. Mark tight zones for quick entries
 */
class ScalpingSignalSOP {
  constructor() {
    this.name = 'Scalping Signal';
    this.primaryTimeframe = config.scalping.primaryTimeframe;
    this.entryTimeframe = config.scalping.entryTimeframe;
    this.primaryBars = config.scalping.primaryBars;
    this.entryBars = config.scalping.entryBars;
    this.confidenceThreshold = config.scalping.confidenceThreshold;
    this.patterns = config.scalping.patterns;
  }

  /**
   * Get required timeframes for analysis
   */
  getRequiredTimeframes() {
    return [
      { interval: this.primaryTimeframe, bars: this.primaryBars },
      { interval: this.entryTimeframe, bars: this.entryBars }
    ];
  }

  /**
   * Build GPT prompt for 15-min analysis
   */
  build15MinPrompt(pair) {
    return `You are analyzing ${pair} 15-minute chart data for Scalping opportunities.

SCALPING SOP:

1. IDENTIFY MICRO TREND:
   - Analyze recent price action (last 180 bars)
   - Determine: BULLISH, BEARISH, or RANGING
   - Look for momentum shifts

2. IDENTIFY IMMEDIATE SUPPORT/RESISTANCE:
   - Find support/resistance from provided key levels
   - Use last 180 bars for zone identification
   - Mark TIGHT zones (scalping requires precision)
   
   ZONE SELECTION CRITERIA (prioritize BEST quality):
   a) Most tested zone (multiple touches = stronger, 3+ touches ideal)
   b) Recent activity (zone tested within last 180 bars)
   c) Clean reactions (sharp bounces, strong rejections)
   d) Zone proximity to current price (closer better, but not primary)
   
   SELECT THE BEST QUALITY zone from 180 bars - quality over proximity

3. IDENTIFY CANDLESTICK PATTERNS:
   - Review the detected patterns provided
   - UPTREND → Look for BULLISH ENGULFING at SUPPORT
   - DOWNTREND → Look for BEARISH ENGULFING at RESISTANCE
   - Scan last 180 bars for patterns
   
   QUALITY CRITERIA (prioritize BEST, not most recent):
   a) Pattern that OVERLAPS with support/resistance zone (HIGHEST PRIORITY)
   b) Pattern at well-tested zone (multiple touches = stronger)
   c) Strongest pattern (larger body, clearest signal)
   d) Pattern proximity to current price (closer better, but not primary)
   
   SELECT THE HIGHEST QUALITY PATTERN - quality over recency

4. MOMENTUM CONFIRMATION:
   - Check if recent candles show strong momentum
   - Review price action description
   - Avoid choppy, indecisive action

5. MARK ZONE:
   - Mark TIGHT zones for scalping
   - Keep zone width between ${config.zones.minPips}-${config.zones.maxPips} pips (flexible range)
   - Provide exact price high and low

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "15min",
  "micro_trend": "bullish|bearish|ranging",
  "signal": "buy|sell|wait",
  "pattern": "${this.patterns.join('|')}|none",
  "zone_type": "support|resistance|breakout|none",
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "momentum": "strong|moderate|weak",
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Build GPT prompt for 5-min analysis
   */
  build5MinPrompt(pair, primaryAnalysis) {
    const primaryContext = primaryAnalysis ? `

CONTEXT FROM 15-MIN ANALYSIS:
- 15-Min Signal: ${primaryAnalysis.signal?.toUpperCase()}
- 15-Min Pattern: ${primaryAnalysis.pattern?.replace('_', ' ').toUpperCase()}
- 15-Min Zone: ${primaryAnalysis.zone_price_low} to ${primaryAnalysis.zone_price_high}
- Expected 5-Min Pattern: ${primaryAnalysis.signal === 'buy' ? 'BULLISH' : primaryAnalysis.signal === 'sell' ? 'BEARISH' : 'CONFIRMATION'}

IMPORTANT: Look for 5-min patterns near or overlapping with the 15-min zone price range. Some proximity is acceptable for scalping opportunities.` : '';

    return `You are analyzing ${pair} 5-minute chart data for Scalping entry confirmation.
${primaryContext}

SCALPING ENTRY SOP:

1. IDENTIFY CONFIRMATION PATTERNS:
   - Look for ${primaryAnalysis?.signal === 'buy' ? 'BULLISH' : primaryAnalysis?.signal === 'sell' ? 'BEARISH' : 'CONFIRMATION'} patterns
   - Patterns: ${this.patterns.join(', ')}
   - Focus on patterns near ${primaryAnalysis?.zone_price_low}-${primaryAnalysis?.zone_price_high}
   - Scan last 180 bars
   
   SELECTION CRITERIA (prioritize BEST, not most recent):
   a) Pattern that overlaps or is NEAR 15-min zone - HIGH PRIORITY
   b) Strongest pattern (clearest signal, larger body)
   c) Pattern close to 15-min zone (within reasonable distance)
   d) Pattern proximity to current price (closer better, but secondary)
   
   SELECT HIGHEST QUALITY PATTERN near the 15-min zone - quality over recency

2. CHECK PRICE ALIGNMENT:
   - Verify if pattern overlaps with or is near 15-min zone
   - Set inside_15min_zone to true if overlap exists or pattern is reasonably close

3. TIGHT ENTRY ZONE:
   - Mark precise entry zone
   - Keep zone width between ${config.zones.minPips}-${config.zones.maxPips} pips (flexible range)
   - Provide exact price high and low

Return ONLY valid JSON:
{
  "pair": "${pair}",
  "timeframe": "5min",
  "pattern": "${this.patterns.join('|')}|none",
  "zone_price_high": 0.0,
  "zone_price_low": 0.0,
  "inside_15min_zone": true|false,
  "entry_timing": "immediate|wait|expired",
  "confidence": 0.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Validate 15-min analysis
   */
  validate15MinAnalysis(result) {
    logger.info('\n=== Validating 15-Min Analysis ===');
    const errors = [];
    const warnings = [];

    const required = ['micro_trend', 'signal', 'pattern', 'zone_type', 'momentum', 'confidence'];
    logger.info(`Checking required fields: ${required.join(', ')}`);
    required.forEach(field => {
      if (!result[field]) {
        errors.push(`Missing required field: ${field}`);
        logger.error(`✗ Missing field: ${field}`);
      } else {
        logger.success(`✓ ${field}: ${result[field]}`);
      }
    });

    logger.info('Checking micro_trend value...');
    if (!['bullish', 'bearish', 'ranging'].includes(result.micro_trend)) {
      errors.push(`Invalid micro_trend: ${result.micro_trend}`);
      logger.error(`✗ Invalid micro_trend: ${result.micro_trend}`);
    } else {
      logger.success(`✓ Valid micro_trend: ${result.micro_trend}`);
    }

    logger.info('Checking signal value...');
    if (!['buy', 'sell', 'wait'].includes(result.signal)) {
      errors.push(`Invalid signal: ${result.signal}`);
      logger.error(`✗ Invalid signal: ${result.signal}`);
    } else {
      logger.success(`✓ Valid signal: ${result.signal}`);
    }

    logger.info(`Checking momentum: ${result.momentum}...`);
    if (result.momentum === 'weak') {
      warnings.push('Weak momentum - scalping may be risky');
      logger.warn('⚠ Weak momentum detected');
    } else {
      logger.success(`✓ Momentum OK: ${result.momentum}`);
    }

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

    logger.info(`15-min validation complete: ${errors.length} errors, ${warnings.length} warnings`);
    if (errors.length > 0) {
      logger.error('15-min validation FAILED with errors:', errors);
    } else {
      logger.success('✓ 15-min validation PASSED');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate 5-min analysis
   */
  validate5MinAnalysis(result, primaryResult) {
    logger.info('\n=== Validating 5-Min Analysis ===');
    const errors = [];
    const warnings = [];

    logger.info('Checking for 5-min pattern...');
    if (!result.pattern) {
      errors.push('Missing 5-min pattern');
      logger.error('✗ Missing 5-min pattern');
    } else {
      logger.success(`✓ 5-min pattern found: ${result.pattern}`);
    }

    logger.info(`Checking zone alignment: inside_15min_zone = ${result.inside_15min_zone}...`);
    if (!result.inside_15min_zone) {
      warnings.push('5-min pattern is outside 15-min zone - consider waiting for better alignment');
      logger.warn('⚠ 5-min pattern is outside 15-min zone');
    } else {
      logger.success('✓ 5-min pattern is inside/near 15-min zone');
    }

    logger.info(`Checking entry timing: ${result.entry_timing}...`);
    if (result.entry_timing === 'expired') {
      warnings.push('Entry opportunity may have expired');
      logger.warn('⚠ Entry timing marked as expired');
    } else {
      logger.success(`✓ Entry timing: ${result.entry_timing}`);
    }

    logger.info(`Checking 5-min confidence: ${result.confidence} vs threshold ${this.confidenceThreshold}...`);
    if (result.confidence < this.confidenceThreshold) {
      warnings.push(`5-min confidence ${result.confidence} below threshold`);
      logger.warn(`⚠ 5-min confidence below threshold (${result.confidence} < ${this.confidenceThreshold})`);
    } else {
      logger.success(`✓ 5-min confidence OK: ${result.confidence}`);
    }

    logger.info(`5-min validation complete: ${errors.length} errors, ${warnings.length} warnings`);
    if (errors.length > 0) {
      logger.error('5-min validation FAILED with errors:', errors);
    } else {
      logger.success('✓ 5-min validation PASSED');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Combine 15-min and 5-min analysis
   */
  combineAnalysis(primaryResult, entryResult) {
    logger.info('\n=== Combining Scalping Analysis ===');
    logger.info(`15-min: ${primaryResult.signal} signal, ${primaryResult.micro_trend} trend, ${primaryResult.pattern}`);
    logger.info(`5-min: ${entryResult.pattern}, inside_15min_zone=${entryResult.inside_15min_zone}`);
    
    const primaryValidation = this.validate15MinAnalysis(primaryResult);
    const entryValidation = this.validate5MinAnalysis(entryResult, primaryResult);

    const valid = primaryValidation.valid && entryValidation.valid;
    const confidence = (primaryResult.confidence + entryResult.confidence) / 2;

    logger.info(`\nFinal validation result: ${valid ? 'VALID' : 'INVALID'}`);
    logger.info(`Combined confidence: ${confidence.toFixed(2)}`);
    
    if (!valid) {
      logger.warn('⚠ Setup marked as INVALID - check errors above');
    } else {
      logger.success('✅ Setup marked as VALID');
    }

    return {
      strategy: this.name,
      pair: primaryResult.pair,
      valid,
      signal: primaryResult.signal,
      micro_trend: primaryResult.micro_trend,
      pattern: primaryResult.pattern,
      momentum: primaryResult.momentum,
      confidence,
      primary_zone: {
        type: primaryResult.zone_type,
        price_high: primaryResult.zone_price_high,
        price_low: primaryResult.zone_price_low
      },
      entry_zone: {
        price_high: entryResult.zone_price_high,
        price_low: entryResult.zone_price_low,
        timing: entryResult.entry_timing,
        inside_15min_zone: entryResult.inside_15min_zone
      },
      primary_analysis: primaryResult,
      entry_analysis: entryResult,
      validation: {
        primary: primaryValidation,
        entry: entryValidation
      },
      timestamp: new Date().toISOString()
    };
  }
}

export default ScalpingSignalSOP;
