import ChartCapture from './chartCapture.js';
import GPTVision from '../ai/gptVision.js';
import { analyzeLocally } from '../ai/localFallback.js';
import ZoneDrawer from '../draw/zoneDrawer.js';
import SwingSignalSOP from '../sop/swingSignal.js';
import ScalpingSignalSOP from '../sop/scalpingSignal.js';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

class StrategyOrchestrator {
  constructor() {
    this.chartCapture = new ChartCapture();
    this.gptVision = new GPTVision();
    this.zoneDrawer = new ZoneDrawer();
    
    // Initialize strategies
    this.strategies = {
      swing: new SwingSignalSOP(),
      scalping: new ScalpingSignalSOP()
    };
  }

  /**
   * Analyze a trading pair with specified strategy
   * @param {string} pair - Trading pair
   * @param {string} strategyName - Strategy name (swing/scalping)
   * @returns {Promise<Object>} Analysis result
   */
  async analyzePair(pair, strategyName, onProgress = null) {
    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`Starting ${strategyName.toUpperCase()} analysis for ${pair}`);
      logger.info('='.repeat(60));
      if (onProgress) onProgress('start', { pair, strategy: strategyName });

      // Get strategy
      const strategy = this.strategies[strategyName];
      if (!strategy) {
        throw new Error(`Unknown strategy: ${strategyName}`);
      }

      // Initialize browser
      if (onProgress) onProgress('init_browser');
      await this.chartCapture.initialize();

      // Get required timeframes
      const timeframes = strategy.getRequiredTimeframes();
      logger.info(`Required timeframes: ${timeframes.join(', ')}`);
      if (onProgress) onProgress('timeframes', { timeframes });

      // Capture charts for all timeframes
      if (onProgress) onProgress('capture_begin');
      const screenshots = await this.captureCharts(pair, timeframes, onProgress);

      // Analyze each timeframe
      if (onProgress) onProgress('analyze_begin');
      const analyses = await this.analyzeTimeframes(pair, strategy, timeframes, screenshots, onProgress);

      // Combine analyses
      const combinedAnalysis = this.combineAnalyses(strategy, analyses);
      // Attach raw screenshots so callers can still send a chart when invalid
      combinedAnalysis.raw_screenshots = screenshots;

      // Draw zones if analysis is valid
      if (combinedAnalysis.valid) {
        const images = await this.drawAnalysisZones(pair, strategyName, combinedAnalysis, screenshots);
        combinedAnalysis.output_images = images;
      } else {
        combinedAnalysis.output_images = [];
      }
      if (onProgress) onProgress('draw_complete', { images: combinedAnalysis.output_images });

      // Save report
      const reportPath = await this.saveReport(pair, strategyName, combinedAnalysis);
      combinedAnalysis.report_path = reportPath;
      if (onProgress) onProgress('report', { reportPath });

      // Cleanup
      await this.chartCapture.close();

      logger.success(`${strategyName.toUpperCase()} analysis completed for ${pair}`);
      return combinedAnalysis;

    } catch (error) {
      logger.failure(`Analysis failed for ${pair} (${strategyName})`, error);
      await this.chartCapture.close();
      throw error;
    }
  }

  /**
   * Capture charts for all timeframes
   * @param {string} pair - Trading pair
   * @param {Array<string>} timeframes - Timeframes to capture
   * @returns {Promise<Object>} Map of timeframe to screenshot path
   */
  async captureCharts(pair, timeframes, onProgress = null) {
    logger.info(`Capturing ${timeframes.length} charts...`);
    
    const screenshots = {};
    
    for (const timeframe of timeframes) {
      try {
        if (onProgress) onProgress('capture', { timeframe });
        screenshots[timeframe] = await this.chartCapture.captureChart(pair, timeframe);
        logger.success(`✓ ${timeframe} captured`);
      } catch (error) {
        logger.failure(`✗ ${timeframe} capture failed`, error);
        screenshots[timeframe] = null;
      }
    }

    return screenshots;
  }

  /**
   * Analyze all timeframes
   * @param {string} pair - Trading pair
   * @param {Object} strategy - Strategy instance
   * @param {Array<string>} timeframes - Timeframes
   * @param {Object} screenshots - Screenshot paths
   * @returns {Promise<Array<Object>>} Analysis results
   */
  async analyzeTimeframes(pair, strategy, timeframes, screenshots, onProgress = null) {
    logger.info(`Analyzing ${timeframes.length} timeframes with GPT Vision...`);

    const analyses = [];
    let previousAnalysis = null; // Store analysis from previous (primary) timeframe

    for (let i = 0; i < timeframes.length; i++) {
      const timeframe = timeframes[i];
      const screenshotPath = screenshots[timeframe];

      if (!screenshotPath) {
        logger.warn(`Skipping ${timeframe} - no screenshot available`);
        continue;
      }

      try {
        // Build context for prompt (pass previous analysis for secondary timeframes)
        const context = i > 0 && previousAnalysis ? { dailyAnalysis: previousAnalysis } : {};

        // Build prompt for this timeframe with context
        const prompt = strategy.buildAnalysisPrompt(pair, timeframe, context);

        // Analyze with GPT Vision, fallback to local rules if unavailable
        if (onProgress) onProgress('analyze', { timeframe });
        const analysis = await this.gptVision.analyzeWithFallback(
          screenshotPath,
          prompt,
          async (img) => analyzeLocally(img, { pair, timeframe, strategy: strategy.constructor.name })
        );

        analyses.push({
          timeframe,
          analysis,
          screenshotPath
        });

        // Store this analysis for next iteration
        previousAnalysis = analysis;

        logger.success(`✓ ${timeframe} analyzed (confidence: ${analysis.confidence})`);

      } catch (error) {
        logger.failure(`✗ ${timeframe} analysis failed`, error);
        analyses.push({
          timeframe,
          analysis: null,
          error: error.message
        });
      }
    }

    return analyses;
  }

  /**
   * Combine timeframe analyses
   * @param {Object} strategy - Strategy instance
   * @param {Array<Object>} analyses - Individual analyses
   * @returns {Object} Combined analysis
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
   * Draw zones using post-processing with price-based Y coordinate calculation
   * @param {string} pair - Trading pair
   * @param {string} strategyName - Strategy name
   * @param {Object} analysis - Combined analysis
   * @param {Object} screenshots - Map of timeframe -> screenshot path
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<string[]>} Generated image paths
   */
  async drawAnalysisZones(pair, strategyName, analysis, screenshots, onProgress = null) {
    try {
      logger.info('Drawing zones with price-based coordinates...');

      if (onProgress) onProgress('draw_begin');

      const strategy = this.strategies[strategyName];
      const drawingInstructions = strategy.getDrawingInstructions(analysis);
      const timeframes = strategy.getRequiredTimeframes();

      const generated = [];

      for (let i = 0; i < timeframes.length; i++) {
        const timeframe = timeframes[i];
        const screenshotPath = screenshots[timeframe];

        if (!screenshotPath) continue;

        // Get zone drawing config for this timeframe
        const zoneCfg = i === 0
          ? (drawingInstructions.primary || drawingInstructions.daily)
          : (drawingInstructions.entry || drawingInstructions.m30);

        const zonesToDraw = i === 0 ? { primary: zoneCfg } : { entry: zoneCfg };

        // Prefer on-page overlay via Puppeteer for GoCharting.
        // Fallback to post-process drawing if overlay is unavailable.
        let producedPath = null;
        if (zoneCfg && zoneCfg.priceHigh && zoneCfg.priceLow) {
          const color = zoneCfg.color || (analysis.signal === 'buy' ? config.zones.buyColor : config.zones.sellColor);
          producedPath = await this.chartCapture.captureGoChartingWithOverlay(
            pair,
            timeframe,
            zoneCfg.priceHigh,
            zoneCfg.priceLow,
            color,
            strategyName,
            zoneCfg.chartPriceHigh,
            zoneCfg.chartPriceLow
          );
        }

        if (!producedPath) {
          // Fallback/default: post-process drawing on captured screenshot
          const timestamp = Date.now();
          const outputFilename = `${pair}_${strategyName}_${timeframe}_${timestamp}.png`;
          const outputPath = path.join(config.directories.output, outputFilename);
          const watermarkText = `${pair} | ${strategyName.toUpperCase()} | ${timeframe}`;
          await this.zoneDrawer.drawZones(screenshotPath, zonesToDraw, outputPath, watermarkText);
          producedPath = outputPath;
        }

        logger.success(`✓ Zones drawn on ${timeframe}: ${producedPath}`);
        generated.push(producedPath);
      }

      return generated;
    } catch (error) {
      logger.failure('Failed to draw zones', error);
      return [];
    }
  }

  /**
   * Capture chart with zone drawn directly on TradingView
   * @param {string} pair - Trading pair
   * @param {string} timeframe - Timeframe
   * @param {number} priceHigh - Upper zone price
   * @param {number} priceLow - Lower zone price
   * @param {string} color - Zone color
   * @param {string} strategyName - Strategy name for filename
   * @returns {Promise<string>} Path to annotated screenshot
   */
  async captureChartWithZone(pair, timeframe, priceHigh, priceLow, color, strategyName) {
    try {
      logger.info(`Re-capturing ${pair} ${timeframe} with zone ${priceLow}-${priceHigh}...`);

      // Initialize browser if needed
      if (!this.chartCapture.page) {
        await this.chartCapture.initialize();
      }

      // Navigate to chart
      const url = this.chartCapture.buildTradingViewUrl(pair, timeframe);
      await this.chartCapture.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: config.puppeteer.timeout
      });

      // Wait for chart to load
      await this.chartCapture.waitForChartLoad();
      await this.chartCapture.cleanChartView();

      // Draw zone on chart
      await this.chartCapture.drawZoneOnChart(priceHigh, priceLow, color);

      // Wait for rendering
      await this.chartCapture.page.waitForTimeout(1000);

      // Take screenshot
      const timestamp = Date.now();
      const filename = `${pair}_${strategyName}_${timeframe}_annotated_${timestamp}.png`;
      const outputPath = path.join(config.directories.output, filename);

      // Ensure output directory exists
      if (!fs.existsSync(config.directories.output)) {
        fs.mkdirSync(config.directories.output, { recursive: true });
      }

      await this.chartCapture.page.screenshot({
        path: outputPath,
        fullPage: false
      });

      logger.success(`Annotated chart saved: ${outputPath}`);
      return outputPath;

    } catch (error) {
      logger.failure('Failed to capture chart with zone', error);
      return null;
    }
  }

  /**
   * Save analysis report
   * @param {string} pair - Trading pair
   * @param {string} strategyName - Strategy name
   * @param {Object} analysis - Analysis result
   */
  async saveReport(pair, strategyName, analysis) {
    try {
      const timestamp = Date.now();
      const filename = `${pair}_${strategyName}_${timestamp}.json`;
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
      logger.failure('Failed to save report', error);
      return null;
    }
  }

  /**
   * Analyze all configured pairs with all active strategies
   * @returns {Promise<Array<Object>>} All analysis results
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
   * @param {Array<Object>} results - Analysis results
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
}

export default StrategyOrchestrator;
