#!/usr/bin/env node

import StrategyOrchestrator from './core/strategyOrchestrator.js';
import config from './utils/config.js';
import logger from './utils/logger.js';

/**
 * AI Trading Analyzer - Main Entry Point
 * 
 * Automated trading analysis tool with Swing and Scalping strategies
 * for Gold (XAUUSD) and Forex pairs using Puppeteer + GPT Vision
 */

class TradingAnalyzer {
  constructor() {
    this.orchestrator = new StrategyOrchestrator();
  }

  /**
   * Run analysis based on command line arguments
   */
  async run() {
    try {
      // Ensure directories exist
      config.ensureDirectories();

      // Parse command line arguments
      const args = this.parseArgs();

      // Apply runtime overrides from CLI
      if (args.overrides) {
        config.applyOverrides(args.overrides);
      }

      logger.info('🚀 AI Trading Analyzer Started');
      logger.info(`Mode: ${args.mode}`);

      // Execute based on mode
      switch (args.mode) {
        case 'single':
          await this.runSingle(args.pair, args.strategy);
          break;
        
        case 'pair':
          await this.runPair(args.pair);
          break;
        
        case 'strategy':
          await this.runStrategy(args.strategy);
          break;
        
        case 'all':
        default:
          await this.runAll();
          break;
      }

      logger.success('✅ Analysis completed successfully');
      process.exit(0);

    } catch (error) {
      logger.failure('❌ Analysis failed', error);
      process.exit(1);
    }
  }

  /**
   * Parse command line arguments
   * @returns {Object} Parsed arguments
   */
  parseArgs() {
    const args = process.argv.slice(2);
    const parsed = {
      mode: 'all',
      pair: null,
      strategy: null,
      overrides: null
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--pair' || arg === '-p') {
        parsed.mode = 'pair';
        parsed.pair = args[++i];
      } else if (arg === '--strategy' || arg === '-s') {
        parsed.mode = 'strategy';
        parsed.strategy = args[++i];
      } else if (arg === '--single') {
        parsed.mode = 'single';
        parsed.pair = args[++i];
        parsed.strategy = args[++i];
      } else if (arg === '--all' || arg === '-a') {
        parsed.mode = 'all';
      } else if (arg === '--help' || arg === '-h') {
        this.printHelp();
        process.exit(0);
      } else if (arg === '--anchor' || arg === '--primary') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.scalping = { ...(parsed.overrides.scalping||{}), primaryTimeframe: args[++i] };
      } else if (arg === '--exec' || arg === '--entry') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.scalping = { ...(parsed.overrides.scalping||{}), entryTimeframe: args[++i] };
      } else if (arg === '--patterns') {
        parsed.overrides = parsed.overrides || {}; 
        const list = args[++i].split(',').map(s=>s.trim()).filter(Boolean);
        parsed.overrides.scalping = { ...(parsed.overrides.scalping||{}), patterns: list };
      } else if (arg === '--sessions') {
        parsed.overrides = parsed.overrides || {}; 
        const list = args[++i].split(',').map(s=>s.trim()).filter(Boolean);
        parsed.overrides.scalping = { ...(parsed.overrides.scalping||{}), sessions: list };
      } else if (arg === '--news-blackout') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.scalping = { ...(parsed.overrides.scalping||{}), newsBlackoutMin: parseInt(args[++i]) };
      } else if (arg === '--zone-style') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.scalping = { ...(parsed.overrides.scalping||{}), zoneStyle: args[++i] };
      } else if (arg === '--zone-minimal') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.zones = { ...(parsed.overrides.zones||{}), minimal: true };
      } else if (arg === '--no-watermark') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.zones = { ...(parsed.overrides.zones||{}), watermark: false };
      } else if (arg === '--opacity') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.zones = { ...(parsed.overrides.zones||{}), opacity: parseFloat(args[++i]) };
      } else if (arg === '--border') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.zones = { ...(parsed.overrides.zones||{}), borderWidth: parseInt(args[++i]) };
      } else if (arg === '--font') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.zones = { ...(parsed.overrides.zones||{}), fontSize: parseInt(args[++i]) };
      } else if (arg === '--labels') {
        parsed.overrides = parsed.overrides || {}; 
        parsed.overrides.zones = { ...(parsed.overrides.zones||{}), drawLabels: args[++i] !== 'false' };
      }
    }

    return parsed;
  }

  /**
   * Run analysis for a single pair and strategy
   * @param {string} pair - Trading pair
   * @param {string} strategy - Strategy name
   */
  async runSingle(pair, strategy) {
    if (!pair || !strategy) {
      throw new Error('Both pair and strategy must be specified for single mode');
    }

    logger.info(`Analyzing ${pair} with ${strategy} strategy...`);
    const result = await this.orchestrator.analyzePair(pair, strategy);
    
    this.printResult(result);
  }

  /**
   * Run all strategies for a single pair
   * @param {string} pair - Trading pair
   */
  async runPair(pair) {
    if (!pair) {
      throw new Error('Pair must be specified');
    }

    logger.info(`Analyzing ${pair} with all active strategies...`);
    const strategies = config.activeStrategies;
    const results = [];

    for (const strategy of strategies) {
      try {
        const result = await this.orchestrator.analyzePair(pair, strategy);
        results.push({ strategy, success: true, result });
      } catch (error) {
        results.push({ strategy, success: false, error: error.message });
      }
    }

    this.printResults(results);
  }

  /**
   * Run a single strategy for all pairs
   * @param {string} strategy - Strategy name
   */
  async runStrategy(strategy) {
    if (!strategy) {
      throw new Error('Strategy must be specified');
    }

    logger.info(`Running ${strategy} strategy on all pairs...`);
    const pairs = config.tradingPairs;
    const results = [];

    for (const pair of pairs) {
      try {
        const result = await this.orchestrator.analyzePair(pair, strategy);
        results.push({ pair, success: true, result });
      } catch (error) {
        results.push({ pair, success: false, error: error.message });
      }
    }

    this.printResults(results);
  }

  /**
   * Run all strategies for all pairs
   */
  async runAll() {
    logger.info('Running full analysis on all pairs and strategies...');
    const results = await this.orchestrator.analyzeAll();
    return results;
  }

  /**
   * Print single result
   * @param {Object} result - Analysis result
   */
  printResult(result) {
    console.log('\n' + '='.repeat(60));
    console.log('ANALYSIS RESULT');
    console.log('='.repeat(60));
    console.log(`Pair: ${result.pair}`);
    console.log(`Strategy: ${result.strategy}`);
    console.log(`Signal: ${result.signal.toUpperCase()}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Valid: ${result.valid ? '✓' : '✗'}`);
    
    if (result.valid) {
      console.log(`\nTrend: ${result.trend || result.micro_trend}`);
      console.log(`Pattern: ${result.pattern}`);
    } else {
      console.log('\nValidation Errors:');
      if (result.validation) {
        Object.values(result.validation).forEach(v => {
          v.errors?.forEach(e => console.log(`  - ${e}`));
        });
      }
    }
    
    console.log('='.repeat(60));
  }

  /**
   * Print multiple results
   * @param {Array<Object>} results - Analysis results
   */
  printResults(results) {
    console.log('\n' + '='.repeat(60));
    console.log('ANALYSIS RESULTS');
    console.log('='.repeat(60));
    
    results.forEach((r, i) => {
      const identifier = r.pair || r.strategy;
      const status = r.success ? '✓' : '✗';
      const signal = r.success ? r.result.signal.toUpperCase() : 'FAILED';
      const confidence = r.success ? `${(r.result.confidence * 100).toFixed(1)}%` : r.error;
      
      console.log(`${i + 1}. ${status} ${identifier}: ${signal} (${confidence})`);
    });
    
    console.log('='.repeat(60));
  }

  /**
   * Print help message
   */
  printHelp() {
    console.log(`
AI Trading Analyzer - Help
==========================

Usage:
  node src/index.js [options]

Options:
  --all, -a                    Analyze all pairs with all strategies (default)
  --pair, -p <PAIR>            Analyze specific pair with all strategies
  --strategy, -s <STRATEGY>    Analyze all pairs with specific strategy
  --single <PAIR> <STRATEGY>   Analyze specific pair with specific strategy
  --help, -h                   Show this help message

 Advanced (overrides):
   --anchor <TF>               Override primary TF (e.g., 60, 15)
   --exec <TF>                 Override entry TF (e.g., 5, 1)
   --patterns <CSV>            Restrict scalping patterns (e.g., bullish_engulfing,bearish_engulfing)
   --sessions <CSV>            Session filter (ASIA,LDN,NY)
   --news-blackout <MIN>       Minutes to avoid around high-impact news
   --zone-style <STYLE>        Zone style (wick_to_wick|body_to_body)
   --zone-minimal              Clean lines only (no filled boxes)
   --no-watermark              Disable watermark text
   --opacity <0-1>             Zone fill opacity
   --border <px>               Zone border width
   --font <px>                 Label font size
   --labels <true|false>       Toggle labels

Examples:
  node src/index.js --all
  node src/index.js --pair XAUUSD
  node src/index.js --strategy swing
  node src/index.js --single EURUSD scalping

Strategies:
  swing      - Swing trading (Daily + M30)
  scalping   - Scalping (15min + 5min)

Pairs:
  Configure in .env file (TRADING_PAIRS)
  Default: XAUUSD, EURUSD, GBPUSD, USDJPY, etc.
    `);
  }
}

// Run the analyzer
const analyzer = new TradingAnalyzer();
analyzer.run();
