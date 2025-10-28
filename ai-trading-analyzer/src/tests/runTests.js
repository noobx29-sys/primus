#!/usr/bin/env node

import ChartCapture from '../core/chartCapture.js';
import GPTVision from '../ai/gptVision.js';
import ZoneDrawer from '../draw/zoneDrawer.js';
import SwingSignalSOP from '../sop/swingSignal.js';
import ScalpingSignalSOP from '../sop/scalpingSignal.js';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

/**
 * Test Suite for AI Trading Analyzer
 * 
 * Validates all components and ensures system reliability
 */

class TestRunner {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  /**
   * Register a test
   * @param {string} name - Test name
   * @param {Function} fn - Test function
   */
  test(name, fn) {
    this.tests.push({ name, fn });
  }

  /**
   * Run all tests
   */
  async runAll() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 AI TRADING ANALYZER - TEST SUITE');
    console.log('='.repeat(60) + '\n');

    for (const test of this.tests) {
      try {
        console.log(`Running: ${test.name}...`);
        await test.fn();
        this.results.push({ name: test.name, passed: true });
        console.log(`✓ PASSED: ${test.name}\n`);
      } catch (error) {
        this.results.push({ name: test.name, passed: false, error: error.message });
        console.log(`✗ FAILED: ${test.name}`);
        console.log(`  Error: ${error.message}\n`);
      }
    }

    this.printSummary();
  }

  /**
   * Print test summary
   */
  printSummary() {
    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const total = this.results.length;

    console.log(`Total: ${total}`);
    console.log(`Passed: ${passed} ✓`);
    console.log(`Failed: ${failed} ✗`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    }

    console.log('='.repeat(60));

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Initialize test runner
const runner = new TestRunner();

// ============================================
// Configuration Tests
// ============================================

runner.test('Config: Load environment variables', async () => {
  if (!config.openai || !config.tradingView) {
    throw new Error('Failed to load config');
  }
  console.log('  ✓ Config loaded successfully');
});

runner.test('Config: Validate directories', async () => {
  config.ensureDirectories();
  const dirs = Object.values(config.directories);
  
  const fs = await import('fs');
  dirs.forEach(dir => {
    if (!fs.default.existsSync(dir)) {
      throw new Error(`Directory not created: ${dir}`);
    }
  });
  
  console.log(`  ✓ All ${dirs.length} directories exist`);
});

runner.test('Config: Validate trading pairs', async () => {
  const pairs = config.tradingPairs;
  if (!pairs || pairs.length === 0) {
    throw new Error('No trading pairs configured');
  }
  console.log(`  ✓ ${pairs.length} trading pairs configured`);
});

runner.test('Config: Validate strategies', async () => {
  const strategies = config.activeStrategies;
  if (!strategies || strategies.length === 0) {
    throw new Error('No strategies configured');
  }
  console.log(`  ✓ ${strategies.length} strategies configured`);
});

// ============================================
// Component Tests
// ============================================

runner.test('Component: Initialize ChartCapture', async () => {
  const chartCapture = new ChartCapture();
  await chartCapture.initialize();
  await chartCapture.close();
  console.log('  ✓ ChartCapture initialized and closed');
});

runner.test('Component: Initialize GPTVision', async () => {
  const gptVision = new GPTVision();
  if (!gptVision.isAvailable()) {
    console.log('  ⚠ GPT Vision not available (check API key)');
  } else {
    console.log('  ✓ GPT Vision initialized');
  }
});

runner.test('Component: Initialize ZoneDrawer', async () => {
  const zoneDrawer = new ZoneDrawer();
  if (!zoneDrawer) {
    throw new Error('Failed to initialize ZoneDrawer');
  }
  console.log('  ✓ ZoneDrawer initialized');
});

// ============================================
// SOP Tests
// ============================================

runner.test('SOP: Swing Signal - Get timeframes', async () => {
  const sop = new SwingSignalSOP();
  const timeframes = sop.getRequiredTimeframes();
  
  if (timeframes.length !== 2) {
    throw new Error(`Expected 2 timeframes, got ${timeframes.length}`);
  }
  
  console.log(`  ✓ Swing timeframes: ${timeframes.join(', ')}`);
});

runner.test('SOP: Swing Signal - Build prompts', async () => {
  const sop = new SwingSignalSOP();
  const dailyPrompt = sop.buildAnalysisPrompt('XAUUSD', '1D');
  const m30Prompt = sop.buildAnalysisPrompt('XAUUSD', '30');
  
  if (!dailyPrompt.includes('Daily') || !m30Prompt.includes('M30')) {
    throw new Error('Prompts not built correctly');
  }
  
  console.log('  ✓ Swing prompts built correctly');
});

runner.test('SOP: Swing Signal - Validate analysis', async () => {
  const sop = new SwingSignalSOP();
  
  const validResult = {
    trend: 'downtrend',
    signal: 'sell',
    pattern: 'bearish_engulfing',
    zone_type: 'resistance',
    confidence: 0.85,
    zone_coordinates: { x1: 100, y1: 100, x2: 200, y2: 200 }
  };
  
  const validation = sop.validateDailyAnalysis(validResult);
  
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  
  console.log('  ✓ Swing validation works correctly');
});

runner.test('SOP: Scalping Signal - Get timeframes', async () => {
  const sop = new ScalpingSignalSOP();
  const timeframes = sop.getRequiredTimeframes();
  
  if (timeframes.length !== 2) {
    throw new Error(`Expected 2 timeframes, got ${timeframes.length}`);
  }
  
  console.log(`  ✓ Scalping timeframes: ${timeframes.join(', ')}`);
});

runner.test('SOP: Scalping Signal - Build prompts', async () => {
  const sop = new ScalpingSignalSOP();
  const primary = sop.buildAnalysisPrompt('EURUSD', '15');
  const entry = sop.buildAnalysisPrompt('EURUSD', '5');
  
  if (!primary.includes('15-minute') || !entry.includes('5-minute')) {
    throw new Error('Prompts not built correctly');
  }
  
  console.log('  ✓ Scalping prompts built correctly');
});

runner.test('SOP: Scalping Signal - Validate analysis', async () => {
  const sop = new ScalpingSignalSOP();
  
  const validResult = {
    micro_trend: 'bullish',
    signal: 'buy',
    pattern: 'bullish_engulfing',
    zone_type: 'support',
    momentum: 'strong',
    confidence: 0.88,
    zone_coordinates: { x1: 100, y1: 100, x2: 200, y2: 200 }
  };
  
  const validation = sop.validate15MinAnalysis(validResult);
  
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }
  
  console.log('  ✓ Scalping validation works correctly');
});

// ============================================
// Integration Tests
// ============================================

runner.test('Integration: Chart URL building', async () => {
  const chartCapture = new ChartCapture();
  
  const url1 = chartCapture.buildTradingViewUrl('XAUUSD', '1D');
  const url2 = chartCapture.buildTradingViewUrl('EURUSD', '30');
  
  if (!url1.includes('XAUUSD') || !url2.includes('EURUSD')) {
    throw new Error('URLs not built correctly');
  }
  
  console.log('  ✓ TradingView URLs built correctly');
});

runner.test('Integration: Drawing instructions', async () => {
  const sop = new SwingSignalSOP();
  
  const mockAnalysis = {
    signal: 'buy',
    pattern: 'bullish_engulfing',
    daily_zone: {
      coordinates: { x1: 100, y1: 100, x2: 200, y2: 200 }
    },
    m30_zone: {
      coordinates: { x1: 150, y1: 150, x2: 180, y2: 180 }
    }
  };
  
  const instructions = sop.getDrawingInstructions(mockAnalysis);
  
  if (!instructions.daily || !instructions.m30) {
    throw new Error('Drawing instructions not generated');
  }
  
  console.log('  ✓ Drawing instructions generated correctly');
});

// ============================================
// Utility Tests
// ============================================

runner.test('Utility: Logger functionality', async () => {
  logger.info('Test info message');
  logger.success('Test success message');
  logger.warn('Test warning message');
  console.log('  ✓ Logger working correctly');
});

runner.test('Utility: Retry mechanism', async () => {
  const { retryWithBackoff } = await import('../utils/retry.js');
  
  let attempts = 0;
  const testFn = async () => {
    attempts++;
    if (attempts < 2) {
      throw new Error('Simulated failure');
    }
    return 'success';
  };
  
  const result = await retryWithBackoff(testFn, {
    retries: 3,
    minTimeout: 100,
    operationName: 'test'
  });
  
  if (result !== 'success' || attempts !== 2) {
    throw new Error('Retry mechanism not working');
  }
  
  console.log(`  ✓ Retry mechanism works (${attempts} attempts)`);
});

// ============================================
// Run Tests
// ============================================

runner.runAll();
