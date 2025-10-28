import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import logger from './logger.js';

/**
 * Extract price scale from chart image
 * Reads the price labels on the right side of the chart
 */
class PriceScaleExtractor {
  /**
   * Extract price scale from chart image
   * @param {string} imagePath - Path to chart screenshot
   * @returns {Promise<Object>} { priceHigh, priceLow, imageHeight }
   */
  async extractPriceScale(imagePath) {
    try {
      logger.info('Extracting price scale from chart...');

      // Get image metadata
      const metadata = await sharp(imagePath).metadata();
      const { width, height } = metadata;

      // Extract right-side strip (price axis area)
      // Typically the rightmost 100px contains the price scale
      const priceAxisWidth = 100;
      const priceAxisBuffer = await sharp(imagePath)
        .extract({
          left: width - priceAxisWidth,
          top: 0,
          width: priceAxisWidth,
          height: height
        })
        .toBuffer();

      // Preprocess image for better OCR
      const preprocessedBuffer = await sharp(priceAxisBuffer)
        .greyscale()
        .normalise()
        .threshold(128) // Binary threshold
        .toBuffer();

      // Use OCR to read price labels
      logger.info('Running OCR on price axis...');
      const { data: { text } } = await Tesseract.recognize(preprocessedBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            logger.info(`OCR progress: ${(m.progress * 100).toFixed(0)}%`);
          }
        }
      });

      logger.info(`OCR text extracted: ${text.substring(0, 200)}...`);

      // Parse prices from OCR text
      const prices = this.parsePricesFromOCR(text);

      if (prices.length < 2) {
        logger.warn(`Could not extract enough price points from chart (found ${prices.length} prices)`);
        logger.info(`Raw OCR text: ${text}`);
        return null;
      }

      // Find highest and lowest prices
      const priceHigh = Math.max(...prices);
      const priceLow = Math.min(...prices);

      logger.success(`Price scale extracted: ${priceLow} - ${priceHigh}`);

      return {
        priceHigh,
        priceLow,
        imageHeight: height,
        imageWidth: width,
        pricePoints: prices
      };

    } catch (error) {
      logger.failure('Failed to extract price scale', error);
      return null;
    }
  }

  /**
   * Parse price values from OCR text
   * @param {string} text - OCR text output
   * @returns {Array<number>} Array of detected prices
   */
  parsePricesFromOCR(text) {
    const prices = [];

    // Match decimal numbers (e.g., 1.16123, 4166.3, 152.45)
    const numberPattern = /\d+\.\d+/g;
    const matches = text.match(numberPattern);

    if (matches) {
      matches.forEach(match => {
        const price = parseFloat(match);
        if (!isNaN(price) && price > 0) {
          prices.push(price);
        }
      });
    }

    return prices;
  }

  /**
   * Convert price level to Y pixel coordinate
   * @param {number} price - Price level
   * @param {Object} scale - Price scale info from extractPriceScale()
   * @returns {number} Y coordinate (pixels)
   */
  priceToY(price, scale) {
    if (!scale || !scale.priceHigh || !scale.priceLow) {
      logger.warn('Invalid price scale, cannot convert price to Y coordinate');
      return null;
    }

    const { priceHigh, priceLow, imageHeight } = scale;
    const priceRange = priceHigh - priceLow;

    if (priceRange <= 0) {
      logger.warn('Invalid price range');
      return null;
    }

    // Y axis is inverted: top of image = high price, bottom = low price
    // Formula: y = (priceHigh - price) / priceRange * imageHeight
    const y = ((priceHigh - price) / priceRange) * imageHeight;

    return Math.round(y);
  }

  /**
   * Calculate zone coordinates from price levels
   * @param {number} zoneHighPrice - Upper price boundary
   * @param {number} zoneLowPrice - Lower price boundary
   * @param {Object} scale - Price scale info
   * @param {number} xStart - X coordinate start (default: 0 for full width)
   * @param {number} xEnd - X coordinate end (default: image width)
   * @returns {Object} { x1, y1, x2, y2 }
   */
  calculateZoneCoordinates(zoneHighPrice, zoneLowPrice, scale, xStart = 0, xEnd = null) {
    if (!scale) {
      logger.warn('No price scale available, cannot calculate coordinates');
      return null;
    }

    const y1 = this.priceToY(zoneHighPrice, scale);
    const y2 = this.priceToY(zoneLowPrice, scale);

    if (y1 === null || y2 === null) {
      return null;
    }

    return {
      x1: xStart,
      y1: y1,
      x2: xEnd || scale.imageWidth,
      y2: y2
    };
  }
}

export default new PriceScaleExtractor();
