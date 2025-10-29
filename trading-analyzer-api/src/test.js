import StrategyOrchestrator from './core/orchestrator.js';
import logger from './utils/logger.js';

/**
 * Test Script
 * Quick test of the trading analyzer
 */

async function test() {
  try {
    logger.info('Testing Trading Analyzer API...\n');

    const orchestrator = new StrategyOrchestrator();

    // Test 1: Validate API keys
    logger.info('Test 1: Validating API keys...');
    await orchestrator.validateKeys();
    logger.success('✓ API keys validated\n');

    // Test 2: Analyze single pair with swing strategy
    logger.info('Test 2: Analyzing EUR/USD with swing strategy...');
    const result = await orchestrator.analyzePair('EUR/USD', 'swing');
    
    logger.info('\nTest Result:');
    logger.info(`- Valid: ${result.valid}`);
    logger.info(`- Signal: ${result.signal}`);
    logger.info(`- Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    logger.info(`- Charts generated: ${result.charts?.length || 0}`);
    logger.info(`- Report saved: ${result.report_path}`);

    logger.success('\n✓ All tests passed!');

  } catch (error) {
    logger.failure('Test failed:', error);
    process.exit(1);
  }
}

test();
