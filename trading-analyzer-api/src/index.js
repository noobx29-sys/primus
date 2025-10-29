import StrategyOrchestrator from './core/orchestrator.js';
import logger from './utils/logger.js';

/**
 * Trading Analyzer - API Version
 * Uses TwelveData API instead of screenshots
 */

async function main() {
  try {
    logger.info(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           TRADING ANALYZER - API VERSION                     ║
║           Powered by TwelveData & OpenAI                     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    const orchestrator = new StrategyOrchestrator();

    // Validate API keys
    await orchestrator.validateKeys();

    // Get command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      // No arguments - analyze all pairs with all strategies
      logger.info('No arguments provided - analyzing all configured pairs');
      await orchestrator.analyzeAll();
    } else if (args.length === 2) {
      // Two arguments: pair and strategy
      const [pair, strategy] = args;
      logger.info(`Analyzing ${pair} with ${strategy} strategy`);
      
      const result = await orchestrator.analyzePair(pair, strategy);
      
      // Print result summary
      printResult(result);
    } else {
      // Invalid arguments
      logger.error('Invalid arguments');
      printUsage();
      process.exit(1);
    }

  } catch (error) {
    logger.failure('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Print result summary
 */
function printResult(result) {
  logger.info(`\n${'='.repeat(60)}`);
  logger.info('ANALYSIS RESULT');
  logger.info('='.repeat(60));
  logger.info(`Pair: ${result.pair}`);
  logger.info(`Strategy: ${result.strategy}`);
  logger.info(`Valid: ${result.valid ? '✓ YES' : '✗ NO'}`);
  logger.info(`Signal: ${result.signal.toUpperCase()}`);
  logger.info(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
  
  if (result.trend) {
    logger.info(`Trend: ${result.trend}`);
  }
  
  if (result.pattern) {
    logger.info(`Pattern: ${result.pattern.replace('_', ' ').toUpperCase()}`);
  }

  if (result.charts && result.charts.length > 0) {
    logger.info(`\nGenerated Charts:`);
    result.charts.forEach(chart => {
      logger.info(`  - ${chart.timeframe}: ${chart.path}`);
    });
  }

  if (result.report_path) {
    logger.info(`\nReport: ${result.report_path}`);
  }

  // Validation warnings/errors
  if (result.validation) {
    if (result.validation.daily && result.validation.daily.warnings.length > 0) {
      logger.warn('\nDaily Analysis Warnings:');
      result.validation.daily.warnings.forEach(w => logger.warn(`  - ${w}`));
    }
    if (result.validation.m30 && result.validation.m30.warnings.length > 0) {
      logger.warn('\nM30 Analysis Warnings:');
      result.validation.m30.warnings.forEach(w => logger.warn(`  - ${w}`));
    }
    if (result.validation.primary && result.validation.primary.warnings.length > 0) {
      logger.warn('\n15-Min Analysis Warnings:');
      result.validation.primary.warnings.forEach(w => logger.warn(`  - ${w}`));
    }
    if (result.validation.entry && result.validation.entry.warnings.length > 0) {
      logger.warn('\n5-Min Analysis Warnings:');
      result.validation.entry.warnings.forEach(w => logger.warn(`  - ${w}`));
    }
  }

  logger.info('='.repeat(60));
}

/**
 * Print usage instructions
 */
function printUsage() {
  logger.info(`
USAGE:
  node src/index.js                    # Analyze all configured pairs
  node src/index.js <PAIR> <STRATEGY>  # Analyze specific pair

EXAMPLES:
  node src/index.js                    # Analyze all
  node src/index.js EUR/USD swing      # Analyze EUR/USD with swing strategy
  node src/index.js GBP/USD scalping   # Analyze GBP/USD with scalping strategy

AVAILABLE PAIRS:
  EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, NZD/USD

AVAILABLE STRATEGIES:
  swing     - Swing trading (Daily + M30 timeframes)
  scalping  - Scalping (15min + 5min timeframes)
  `);
}

// Run the main function
main();
