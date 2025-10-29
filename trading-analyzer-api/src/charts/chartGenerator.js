import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { formatPrice } from '../utils/pips.js';

/**
 * Chart Generator
 * Creates candlestick charts with zones using Canvas
 */
class ChartGenerator {
  constructor() {
    this.width = config.chart.width;
    this.height = config.chart.height;
    this.padding = { top: 80, right: 100, bottom: 80, left: 20 };
    this.chartArea = {
      x: this.padding.left,
      y: this.padding.top,
      width: this.width - this.padding.left - this.padding.right,
      height: this.height - this.padding.top - this.padding.bottom
    };
  }

  /**
   * Generate candlestick chart with zones
   * @param {Array} ohlcv - OHLCV data
   * @param {string} pair - Trading pair
   * @param {string} timeframe - Timeframe
   * @param {Object} zones - Zones to draw (optional)
   * @param {Object} validationErrors - Validation errors to display (optional)
   * @returns {Promise<string>} Path to generated chart
   */
  async generateChart(ohlcv, pair, timeframe, zones = null, validationErrors = null) {
    try {
      logger.info(`Generating chart for ${pair} ${timeframe}...`);

      // Create canvas
      const canvas = createCanvas(this.width, this.height);
      const ctx = canvas.getContext('2d');

      // Draw background
      this.drawBackground(ctx);

      // Calculate price range and scales
      const priceRange = this.calculatePriceRange(ohlcv);
      const xScale = this.calculateXScale(ohlcv.length);
      const yScale = this.calculateYScale(priceRange);

      // Draw grid
      this.drawGrid(ctx, priceRange, ohlcv.length);

      // Draw candlesticks
      this.drawCandlesticks(ctx, ohlcv, xScale, yScale, priceRange);

      // Draw zones if provided
      if (zones) {
        this.drawZones(ctx, zones, yScale, priceRange);
      }

      // Draw axes
      this.drawAxes(ctx, priceRange, ohlcv, pair);

      // Draw title
      this.drawTitle(ctx, pair, timeframe);

      // Draw validation errors if present
      if (validationErrors && validationErrors.length > 0) {
        this.drawValidationErrors(ctx, validationErrors);
      }

      // Save to file
      const outputPath = await this.saveChart(canvas, pair, timeframe);

      logger.success(`✓ Chart generated: ${outputPath}`);
      return outputPath;

    } catch (error) {
      logger.error('Failed to generate chart:', error.message);
      throw error;
    }
  }

  /**
   * Draw background
   */
  drawBackground(ctx) {
    // Main background
    ctx.fillStyle = config.chart.backgroundColor;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // Chart area background (slightly lighter)
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(
      this.chartArea.x,
      this.chartArea.y,
      this.chartArea.width,
      this.chartArea.height
    );
  }

  /**
   * Calculate price range
   */
  calculatePriceRange(ohlcv) {
    const highs = ohlcv.map(c => c.high);
    const lows = ohlcv.map(c => c.low);
    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const padding = (high - low) * 0.1; // 10% padding

    return {
      high: high + padding,
      low: low - padding,
      range: high - low + (2 * padding)
    };
  }

  /**
   * Calculate X scale (candle spacing)
   */
  calculateXScale(candleCount) {
    return this.chartArea.width / candleCount;
  }

  /**
   * Calculate Y scale (price to pixel)
   */
  calculateYScale(priceRange) {
    return this.chartArea.height / priceRange.range;
  }

  /**
   * Convert price to Y coordinate
   */
  priceToY(price, yScale, priceRange) {
    return this.chartArea.y + (priceRange.high - price) * yScale;
  }

  /**
   * Draw grid
   */
  drawGrid(ctx, priceRange, candleCount) {
    ctx.strokeStyle = config.chart.gridColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]); // Dashed lines

    // Horizontal grid lines (price levels)
    const priceSteps = 8;
    const priceStep = priceRange.range / priceSteps;

    for (let i = 0; i <= priceSteps; i++) {
      const price = priceRange.low + (priceStep * i);
      const y = this.priceToY(price, this.calculateYScale(priceRange), priceRange);
      
      ctx.beginPath();
      ctx.moveTo(this.chartArea.x, y);
      ctx.lineTo(this.chartArea.x + this.chartArea.width, y);
      ctx.stroke();
    }

    // Vertical grid lines (time)
    const timeSteps = 8;
    const xStep = this.chartArea.width / timeSteps;

    for (let i = 0; i <= timeSteps; i++) {
      const x = this.chartArea.x + (xStep * i);
      
      ctx.beginPath();
      ctx.moveTo(x, this.chartArea.y);
      ctx.lineTo(x, this.chartArea.y + this.chartArea.height);
      ctx.stroke();
    }
    
    ctx.setLineDash([]); // Reset line dash
  }

  /**
   * Draw candlesticks
   */
  drawCandlesticks(ctx, ohlcv, xScale, yScale, priceRange) {
    const candleWidth = Math.max(3, xScale * 0.8);
    const wickWidth = Math.max(1, candleWidth * 0.15);

    ohlcv.forEach((candle, i) => {
      const x = this.chartArea.x + (i * xScale) + (xScale / 2);
      const isBullish = candle.close > candle.open;
      
      const openY = this.priceToY(candle.open, yScale, priceRange);
      const closeY = this.priceToY(candle.close, yScale, priceRange);
      const highY = this.priceToY(candle.high, yScale, priceRange);
      const lowY = this.priceToY(candle.low, yScale, priceRange);

      // Draw wick
      ctx.strokeStyle = isBullish ? config.chart.candleUpColor : config.chart.candleDownColor;
      ctx.lineWidth = wickWidth;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // Draw body with border for better visibility
      const bodyColor = isBullish ? config.chart.candleUpColor : config.chart.candleDownColor;
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = 1;
      
      const bodyHeight = Math.abs(closeY - openY) || 1; // Min 1px for doji
      const bodyX = x - candleWidth / 2;
      const bodyY = Math.min(openY, closeY);
      
      ctx.fillRect(bodyX, bodyY, candleWidth, bodyHeight);
      ctx.strokeRect(bodyX, bodyY, candleWidth, bodyHeight);
    });
  }

  /**
   * Draw zones
   */
  drawZones(ctx, zones, yScale, priceRange) {
    // Draw primary zone (Daily/15min)
    if (zones.primary_zone && zones.primary_zone.price_high && zones.primary_zone.price_low) {
      this.drawZone(
        ctx,
        zones.primary_zone.price_high,
        zones.primary_zone.price_low,
        zones.signal === 'buy' ? config.zones.buyColor : config.zones.sellColor,
        yScale,
        priceRange,
        'Primary Zone'
      );
    }

    // Draw entry zone (M30/5min)
    if (zones.entry_zone && zones.entry_zone.price_high && zones.entry_zone.price_low) {
      this.drawZone(
        ctx,
        zones.entry_zone.price_high,
        zones.entry_zone.price_low,
        zones.signal === 'buy' ? config.zones.buyColor : config.zones.sellColor,
        yScale,
        priceRange,
        'Entry Zone',
        0.2 // Higher opacity for entry zone
      );
    }
  }

  /**
   * Draw a single zone
   */
  drawZone(ctx, priceHigh, priceLow, color, yScale, priceRange, label, opacityAdjust = 0) {
    const y1 = this.priceToY(priceHigh, yScale, priceRange);
    const y2 = this.priceToY(priceLow, yScale, priceRange);

    // Draw zone rectangle
    ctx.fillStyle = this.hexToRgba(color, config.zones.opacity + opacityAdjust);
    ctx.fillRect(
      this.chartArea.x,
      y1,
      this.chartArea.width,
      y2 - y1
    );

    // Draw zone border
    ctx.strokeStyle = color;
    ctx.lineWidth = config.zones.borderWidth;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.rect(this.chartArea.x, y1, this.chartArea.width, y2 - y1);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw label on left side
    ctx.fillStyle = color;
    ctx.font = 'bold 14px Arial';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(label, this.chartArea.x + 10, y1 + 20);
    ctx.shadowBlur = 0;

    // Draw price levels on right side
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    const rightX = this.chartArea.x + this.chartArea.width + 10;
    
    // High price
    ctx.fillStyle = color;
    ctx.fillText(priceHigh.toFixed(5), rightX, y1 + 4);
    
    // Low price
    ctx.fillText(priceLow.toFixed(5), rightX, y2 + 4);
  }

  /**
   * Convert hex color to rgba
   */
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Draw axes
   */
  drawAxes(ctx, priceRange, ohlcv, pair) {
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;

    // Right Y-axis (price)
    const rightAxisX = this.chartArea.x + this.chartArea.width;
    ctx.beginPath();
    ctx.moveTo(rightAxisX, this.chartArea.y);
    ctx.lineTo(rightAxisX, this.chartArea.y + this.chartArea.height);
    ctx.stroke();

    // X-axis (time)
    ctx.beginPath();
    ctx.moveTo(this.chartArea.x, this.chartArea.y + this.chartArea.height);
    ctx.lineTo(this.chartArea.x + this.chartArea.width, this.chartArea.y + this.chartArea.height);
    ctx.stroke();

    // Y-axis labels (prices) on the RIGHT
    ctx.fillStyle = config.chart.textColor;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';

    const priceSteps = 8;
    const priceStep = priceRange.range / priceSteps;
    const yScale = this.calculateYScale(priceRange);

    for (let i = 0; i <= priceSteps; i++) {
      const price = priceRange.low + (priceStep * i);
      const y = this.priceToY(price, yScale, priceRange);
      
      // Draw tick mark
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rightAxisX, y);
      ctx.lineTo(rightAxisX + 5, y);
      ctx.stroke();
      
      // Draw price label
      ctx.fillStyle = config.chart.textColor;
      ctx.fillText(formatPrice(pair, price), rightAxisX + 10, y + 4);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    ctx.font = '11px Arial';
    const timeSteps = 6;
    const candleStep = Math.floor(ohlcv.length / timeSteps);

    for (let i = 0; i <= timeSteps; i++) {
      const index = Math.min(i * candleStep, ohlcv.length - 1);
      const candle = ohlcv[index];
      const x = this.chartArea.x + (index * this.calculateXScale(ohlcv.length));
      
      // Draw tick mark
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, this.chartArea.y + this.chartArea.height);
      ctx.lineTo(x, this.chartArea.y + this.chartArea.height + 5);
      ctx.stroke();
      
      // Format datetime
      const date = new Date(candle.datetime);
      const label = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      
      ctx.fillStyle = config.chart.textColor;
      ctx.fillText(label, x, this.chartArea.y + this.chartArea.height + 25);
    }
  }

  /**
   * Draw title
   */
  drawTitle(ctx, pair, timeframe) {
    // Main title
    ctx.fillStyle = config.chart.textColor;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 3;
    ctx.fillText(`${pair} - ${timeframe}`, this.width / 2, 40);
    ctx.shadowBlur = 0;
    
    // Subtitle with timestamp
    ctx.font = '12px Arial';
    ctx.fillStyle = '#999999';
    const now = new Date();
    const timestamp = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    ctx.fillText(`Generated: ${timestamp}`, this.width / 2, 60);
  }

  /**
   * Draw validation errors on chart
   */
  drawValidationErrors(ctx, errors) {
    // Draw semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(
      this.chartArea.x + 50,
      this.chartArea.y + 50,
      this.chartArea.width - 100,
      100 + (errors.length * 25)
    );

    // Draw border
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 3;
    ctx.strokeRect(
      this.chartArea.x + 50,
      this.chartArea.y + 50,
      this.chartArea.width - 100,
      100 + (errors.length * 25)
    );

    // Draw header
    ctx.fillStyle = '#FF0000';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ INVALID SETUP ⚠️', this.width / 2, this.chartArea.y + 85);

    // Draw errors
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    errors.forEach((error, i) => {
      const text = `❌ ${error}`;
      ctx.fillText(text, this.chartArea.x + 70, this.chartArea.y + 120 + (i * 25));
    });
  }

  /**
   * Save chart to file
   */
  async saveChart(canvas, pair, timeframe) {
    const timestamp = Date.now();
    const filename = `${pair.replace('/', '')}_${timeframe}_${timestamp}.png`;
    const outputPath = path.join(config.directories.output, filename);

    // Ensure output directory exists
    if (!fs.existsSync(config.directories.output)) {
      fs.mkdirSync(config.directories.output, { recursive: true });
    }

    // Save canvas to file
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
  }
}

export default ChartGenerator;
