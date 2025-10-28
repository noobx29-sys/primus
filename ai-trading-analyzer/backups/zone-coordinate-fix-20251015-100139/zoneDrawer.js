import sharp from 'sharp';
import { createCanvas, loadImage, registerFont } from 'canvas';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

class ZoneDrawer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  /**
   * Draw zones on chart screenshot
   * @param {string} screenshotPath - Path to original screenshot
   * @param {Object} drawingInstructions - Drawing instructions from SOP
   * @param {string} outputPath - Output path for final image
   * @returns {Promise<string>} Path to final image
   */
  async drawZones(screenshotPath, drawingInstructions, outputPath, watermarkText = null) {
    try {
      logger.info(`Drawing zones on: ${screenshotPath}`);

      // Load image
      const image = await loadImage(screenshotPath);
      
      // Create canvas
      this.canvas = createCanvas(image.width, image.height);
      this.ctx = this.canvas.getContext('2d');

      // Draw original image
      this.ctx.drawImage(image, 0, 0);

      // Draw each zone
      for (const [zoneName, zoneConfig] of Object.entries(drawingInstructions)) {
        if (zoneConfig && zoneConfig.coordinates) {
          this.drawZone(zoneConfig);
        }
      }

      // Optional watermark (guarded by config)
      if (watermarkText && config.zones.watermark) {
        this.addWatermark(watermarkText);
      }

      // Save to file
      await this.saveCanvas(outputPath);

      logger.success(`Zones drawn: ${outputPath}`);
      return outputPath;

    } catch (error) {
      logger.failure('Failed to draw zones', error);
      throw error;
    }
  }

  /**
   * Draw a single zone
   * @param {Object} zoneConfig - Zone configuration
   */
  drawZone(zoneConfig) {
    const { coordinates, color, opacity, borderWidth, label, labelPosition } = zoneConfig;
    let { x1, y1, x2, y2 } = coordinates;

    // Clamp coordinates to canvas bounds and enforce minimum vertical thickness
    const minSize = 8;
    const W = this.canvas.width;
    const H = this.canvas.height;
    x1 = Math.max(0, Math.min(x1, W - 1));
    x2 = Math.max(0, Math.min(x2, W - 1));
    y1 = Math.max(1, Math.min(y1, H - 2));
    y2 = Math.max(1, Math.min(y2, H - 2));
    if (x2 < x1) [x1, x2] = [x2, x1];
    if (y2 < y1) [y1, y2] = [y2, y1];
    if (x2 - x1 < minSize) x2 = Math.min(W - 1, x1 + minSize);

    // Ensure vertical span >= minSize even near image edges
    if (y2 - y1 < minSize) {
      const need = minSize - (y2 - y1);
      const moveUp = Math.min(need, y1 - 1);
      const moveDown = need - moveUp;
      y1 = y1 - moveUp;
      y2 = Math.min(H - 2, y2 + moveDown);
    }

    // Final safety: if identical after clamping, split around y
    if (y1 === y2) {
      if (y2 < H - 2) y2 = Math.min(H - 2, y2 + minSize);
      else y1 = Math.max(1, y1 - minSize);
    }

    logger.info(`Zone coordinates clamped: (${x1},${y1})-(${x2},${y2})`);

    // Calculate dimensions
    const width = x2 - x1;
    const height = y2 - y1;

    // Parse color and apply opacity
    const rgb = this.hexToRgb(color);
    const fillColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
    const strokeColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;

    // Minimal mode: draw only clean horizontal lines at top/bottom
    if (config.zones.minimal) {
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = Math.max(2, borderWidth + 2);
      // Top line
      this.ctx.beginPath();
      this.ctx.moveTo(0, y1);
      this.ctx.lineTo(this.canvas.width, y1);
      this.ctx.stroke();
      // Bottom line
      this.ctx.beginPath();
      this.ctx.moveTo(0, y2);
      this.ctx.lineTo(this.canvas.width, y2);
      this.ctx.stroke();
    } else {
      // Draw filled rectangle
      this.ctx.fillStyle = fillColor;
      this.ctx.fillRect(x1, y1, width, height);
      // Draw border
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = borderWidth;
      this.ctx.strokeRect(x1, y1, width, height);
    }

    // Draw label if provided
    if (label && config.zones.drawLabels) {
      this.drawLabel(label, x1, y1, width, height, labelPosition, strokeColor);
    }

    // Draw shadow/dashed accent lines only when not in minimal mode
    if (!config.zones.minimal) {
      this.drawShadowLines(x1, y1, x2, y2, strokeColor, borderWidth);
    }
  }

  /**
   * Draw shadow lines to emphasize "shadow to shadow" marking
   * @param {number} x1 - Top-left X
   * @param {number} y1 - Top-left Y
   * @param {number} x2 - Bottom-right X
   * @param {number} y2 - Bottom-right Y
   * @param {string} color - Line color
   * @param {number} width - Line width
   */
  drawShadowLines(x1, y1, x2, y2, color, width) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width + 1;
    this.ctx.setLineDash([10, 5]);

    // Top shadow line
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y1);
    this.ctx.stroke();

    // Bottom shadow line
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y2);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();

    // Reset line dash
    this.ctx.setLineDash([]);
  }

  /**
   * Draw label on zone
   * @param {string} text - Label text
   * @param {number} x - Zone X
   * @param {number} y - Zone Y
   * @param {number} width - Zone width
   * @param {number} height - Zone height
   * @param {string} position - Label position
   * @param {string} color - Label color
   */
  drawLabel(text, x, y, width, height, position, color) {
    // Set font
    const fontSize = Math.max(10, config.zones.fontSize || 16);
    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.fillStyle = color;
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = 3;

    // Calculate position
    let labelX = x + 10;
    let labelY = y + 25;

    if (position === 'top-right') {
      labelX = x + width - 10 - this.ctx.measureText(text).width;
      labelY = y + 25;
    } else if (position === 'bottom-left') {
      labelX = x + 10;
      labelY = y + height - 10;
    } else if (position === 'bottom-right') {
      labelX = x + width - 10 - this.ctx.measureText(text).width;
      labelY = y + height - 10;
    }

    // Draw text with outline for visibility
    this.ctx.strokeText(text, labelX, labelY);
    this.ctx.fillText(text, labelX, labelY);
  }

  /**
   * Draw arrow pointing to zone
   * @param {number} fromX - Arrow start X
   * @param {number} fromY - Arrow start Y
   * @param {number} toX - Arrow end X
   * @param {number} toY - Arrow end Y
   * @param {string} color - Arrow color
   */
  drawArrow(fromX, fromY, toX, toY, color) {
    const headLength = 15;
    const angle = Math.atan2(toY - fromY, toX - fromX);

    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = 3;

    // Draw line
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();

    // Draw arrowhead
    this.ctx.beginPath();
    this.ctx.moveTo(toX, toY);
    this.ctx.lineTo(
      toX - headLength * Math.cos(angle - Math.PI / 6),
      toY - headLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      toX - headLength * Math.cos(angle + Math.PI / 6),
      toY - headLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Add watermark/timestamp
   * @param {string} text - Watermark text
   */
  addWatermark(text) {
    const fontSize = Math.max(10, (config.zones.fontSize || 16) - 2);
    this.ctx.font = `${fontSize}px Arial`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.lineWidth = 2;

    const textWidth = this.ctx.measureText(text).width;
    const padding = 12;
    const x = Math.max(10, this.canvas.width - textWidth - padding);
    const y = this.canvas.height - 20;

    this.ctx.strokeText(text, x, y);
    this.ctx.fillText(text, x, y);
  }

  /**
   * Save canvas to file
   * @param {string} outputPath - Output file path
   */
  async saveCanvas(outputPath) {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert canvas to buffer
    const buffer = this.canvas.toBuffer('image/png');

    // Use sharp for final optimization
    await sharp(buffer)
      .png({ quality: config.chart.quality })
      .toFile(outputPath);
  }

  /**
   * Convert hex color to RGB
   * @param {string} hex - Hex color
   * @returns {Object} RGB values
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  /**
   * Create comparison image (before/after)
   * @param {string} originalPath - Original screenshot
   * @param {string} annotatedPath - Annotated screenshot
   * @param {string} outputPath - Output path
   */
  async createComparison(originalPath, annotatedPath, outputPath) {
    try {
      const original = await sharp(originalPath).resize(960, 540).toBuffer();
      const annotated = await sharp(annotatedPath).resize(960, 540).toBuffer();

      await sharp({
        create: {
          width: 1920,
          height: 540,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
      })
        .composite([
          { input: original, left: 0, top: 0 },
          { input: annotated, left: 960, top: 0 }
        ])
        .toFile(outputPath);

      logger.success(`Comparison image created: ${outputPath}`);
    } catch (error) {
      logger.failure('Failed to create comparison', error);
    }
  }
}

export default ZoneDrawer;
