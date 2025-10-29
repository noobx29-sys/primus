import TwelveDataClient from '../api/twelveDataClient.js';
import DataFormatter from '../api/dataFormatter.js';
import GPTAnalyzer from '../ai/gptAnalyzer.js';
import ChartGenerator from '../charts/chartGenerator.js';
import SwingSignalSOP from '../sop/swingSignal.js';
import ScalpingSignalSOP from '../sop/scalpingSignal.js';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Strategy Orchestrator
 * Coordinates API calls, AI analysis, and chart generation
 */
class StrategyOrchestrator {
  constructor() {
    this.apiClient = new TwelveDataClient();
    this.dataFormatter = new DataFormatter();
    this.gptAnalyzer = new GPTAnalyzer();
    this.chartGenerator = new ChartGenerator();
    
    // Initialize strategies
    this.strategies = {
      swing: new SwingSignalSOP(),
      scalping: new ScalpingSignalSOP()
    };
  }

  /**
   * Analyze a trading pair with specified strategy
   * @param {string} pair - Trading pair (e.g., EUR/USD)
   * @param {string} strategyName - Strategy name (swing/scalping)
   * @returns {Promise<Object>} Analysis result
   */
  async analyzePair(pair, strategyName) {
    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Starting ${strategyName.toUpperCase()} analysis for ${pair}`);
      logger.info('='.repeat(60));

      // Get strategy
      const strategy = this.strategies[strategyName];
      if (!strategy) {
        throw new Error(`Unknown strategy: ${strategyName}`);
      }

      // Get required timeframes
      const timeframes = strategy.getRequiredTimeframes();
      logger.info(`Required timeframes: ${timeframes.map(tf => tf.interval).join(', ')}`);

      // Fetch market data for all timeframes
      logger.info('Fetching market data from TwelveData...');
      const marketData = await this.fetchMarketData(pair, timeframes);

      // Analyze each timeframe
      const analyses = await this.analyzeTimeframes(pair, strategy, marketData);

      // Combine analyses
      const combinedAnalysis = this.combineAnalyses(strategy, analyses);

      // Generate charts (always, even if invalid to show why)
      logger.info('Generating charts...');
      combinedAnalysis.charts = await this.generateCharts(pair, strategyName, combinedAnalysis, marketData);

      // Save report
      const reportPath = await this.saveReport(pair, strategyName, combinedAnalysis);
      combinedAnalysis.report_path = reportPath;

      logger.success(`${strategyName.toUpperCase()} analysis completed for ${pair}`);
      return combinedAnalysis;

    } catch (error) {
      logger.failure(`Analysis failed for ${pair} (${strategyName})`, error);
      throw error;
    }
  }

  /**
   * Fetch market data from TwelveData
   */
  async fetchMarketData(pair, timeframes) {
    const marketData = {};

    for (const tf of timeframes) {
      try {
        const data = await this.apiClient.getTimeSeries(pair, tf.interval, tf.bars);
        marketData[tf.interval] = {
          ohlcv: data,
          formatted: this.dataFormatter.formatForAI(data, pair, tf.interval)
        };
        logger.success(`✓ ${tf.interval} data fetched and formatted`);
      } catch (error) {
        logger.error(`Failed to fetch ${tf.interval} data:`, error.message);
        marketData[tf.interval] = null;
      }
    }

    return marketData;
  }

  /**
   * Analyze all timeframes
   */
  async analyzeTimeframes(pair, strategy, marketData) {
    const analyses = [];
    let previousAnalysis = null;

    const timeframes = strategy.getRequiredTimeframes();

    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      const tfData = marketData[tf.interval];

      if (!tfData) {
        logger.warn(`Skipping ${tf.interval} - no data available`);
        continue;
      }

      try {
        // Build prompt based on timeframe
        let prompt;
        if (i === 0) {
          // Primary timeframe (Daily or 15min)
          if (strategy.name === 'Swing Signal') {
            prompt = strategy.buildDailyPrompt(pair);
          } else {
            prompt = strategy.build15MinPrompt(pair);
          }
        } else {
          // Entry timeframe (M30 or 5min)
          if (strategy.name === 'Swing Signal') {
            prompt = strategy.buildM30Prompt(pair, previousAnalysis);
          } else {
            prompt = strategy.build5MinPrompt(pair, previousAnalysis);
          }
        }

        // Analyze with GPT
        const analysis = await this.gptAnalyzer.analyze(prompt, tfData.formatted);

        analyses.push({
          timeframe: tf.interval,
          analysis
        });

        previousAnalysis = analysis;

        logger.success(`✓ ${tf.interval} analyzed (confidence: ${analysis.confidence})`);

      } catch (error) {
        logger.error(`Failed to analyze ${tf.interval}:`, error.message);
        analyses.push({
          timeframe: tf.interval,
          analysis: null,
          error: error.message
        });
      }
    }

    return analyses;
  }

  /**
   * Combine timeframe analyses
   */
  combineAnalyses(strategy, analyses) {
    if (analyses.length < 2) {
      throw new Error('Insufficient timeframe analyses');
    }

    const [primaryAnalysis, entryAnalysis] = analyses;

    if (!primaryAnalysis.analysis || !entryAnalysis.analysis) {
      throw new Error('One or more analyses failed');
    }

    // Use strategy-specific combination logic
    return strategy.combineAnalysis(
      primaryAnalysis.analysis,
      entryAnalysis.analysis
    );
  }

  /**
   * Generate charts for all timeframes
   */
  async generateCharts(pair, strategyName, analysis, marketData) {
    const charts = [];
    const timeframes = Object.keys(marketData);

    // Collect all validation errors for display
    const allErrors = [];
    if (!analysis.valid && analysis.validation) {
      Object.values(analysis.validation).forEach(v => {
        if (v.errors && Array.isArray(v.errors)) {
          allErrors.push(...v.errors);
        }
      });
    }

    for (let i = 0; i < timeframes.length; i++) {
      const tf = timeframes[i];
      const tfData = marketData[tf];

      if (!tfData || !tfData.ohlcv) continue;

      try {
        // Prepare zones for chart
        const zones = {
          signal: analysis.signal,
          primary_zone: i === 0 ? (analysis.daily_zone || analysis.primary_zone) : null,
          entry_zone: i === 1 ? (analysis.m30_zone || analysis.entry_zone) : null
        };

        // Only show errors on the entry (bottom) chart
        const validationErrors = (!analysis.valid && i === timeframes.length - 1 && allErrors.length > 0)
          ? allErrors 
          : null;

        const chartPath = await this.chartGenerator.generateChart(
          tfData.ohlcv,
          pair,
          tf,
          zones,
          validationErrors
        );

        charts.push({
          timeframe: tf,
          path: chartPath
        });

        logger.success(`✓ Chart generated for ${tf}`);

      } catch (error) {
        logger.error(`Failed to generate chart for ${tf}:`, error.message);
      }
    }

    return charts;
  }

  /**
   * Save analysis report
   */
  async saveReport(pair, strategyName, analysis) {
    try {
      const timestamp = Date.now();
      const filename = `${pair.replace('/', '')}_${strategyName}_${timestamp}.json`;
      const reportPath = path.join(config.directories.reports, filename);

      // Ensure directory exists
      if (!fs.existsSync(config.directories.reports)) {
        fs.mkdirSync(config.directories.reports, { recursive: true });
      }

      // Save report
      fs.writeFileSync(reportPath, JSON.stringify(analysis, null, 2));

      logger.success(`Report saved: ${reportPath}`);
      return reportPath;
    } catch (error) {
      logger.error('Failed to save report:', error.message);
      return null;
    }
  }

  /**
   * Analyze all configured pairs with all active strategies
   */
  async analyzeAll() {
    const pairs = config.tradingPairs;
    const strategies = config.activeStrategies;
    const results = [];

    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`Starting batch analysis`);
    logger.info(`Pairs: ${pairs.join(', ')}`);
    logger.info(`Strategies: ${strategies.join(', ')}`);
    logger.info('='.repeat(60));

    for (const pair of pairs) {
      for (const strategy of strategies) {
        try {
          const result = await this.analyzePair(pair, strategy);
          results.push({
            pair,
            strategy,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            pair,
            strategy,
            success: false,
            error: error.message
          });
        }
      }
    }

    // Print summary
    this.printSummary(results);

    return results;
  }

  /**
   * Print analysis summary
   */
  printSummary(results) {
    logger.info(`\n${'='.repeat(60)}`);
    logger.info('ANALYSIS SUMMARY');
    logger.info('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    logger.info(`Total: ${results.length}`);
    logger.info(`Successful: ${successful.length}`);
    logger.info(`Failed: ${failed.length}`);

    if (successful.length > 0) {
      logger.info('\n✓ Successful Analyses:');
      successful.forEach(r => {
        const signal = r.result.signal.toUpperCase();
        const confidence = (r.result.confidence * 100).toFixed(1);
        logger.info(`  - ${r.pair} (${r.strategy}): ${signal} signal (${confidence}% confidence)`);
      });
    }

    if (failed.length > 0) {
      logger.info('\n✗ Failed Analyses:');
      failed.forEach(r => {
        logger.info(`  - ${r.pair} (${r.strategy}): ${r.error}`);
      });
    }

    logger.info('='.repeat(60));
  }

  /**
   * Validate API keys
   */
  async validateKeys() {
    logger.info('Validating API keys...');
    
    const twelveDataValid = await this.apiClient.validateApiKey();
    const openAIValid = await this.gptAnalyzer.validateApiKey();

    if (!twelveDataValid || !openAIValid) {
      throw new Error('API key validation failed. Please check your .env file.');
    }

    logger.success('✓ All API keys validated');
    return true;
  }
}

export default StrategyOrchestrator;
