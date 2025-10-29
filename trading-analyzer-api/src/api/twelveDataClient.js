import axios from 'axios';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

/**
 * TwelveData API Client
 * Free tier: 800 API calls per day, ~8 calls per minute
 */
class TwelveDataClient {
  constructor() {
    this.apiKey = config.twelvedata.apiKey;
    this.baseUrl = config.twelvedata.baseUrl;
    this.lastCallTime = 0;
    this.callDelay = config.rateLimit.delayBetweenCalls;
  }

  /**
   * Rate limiting: Wait between API calls
   */
  async rateLimitWait() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.callDelay) {
      const waitTime = this.callDelay - timeSinceLastCall;
      logger.debug(`Rate limiting: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastCallTime = Date.now();
  }

  /**
   * Fetch time series data
   * @param {string} symbol - Trading pair (e.g., EUR/USD)
   * @param {string} interval - Timeframe (1min, 5min, 15min, 30min, 1h, 1day)
   * @param {number} outputsize - Number of data points (max 5000 for free tier)
   * @returns {Promise<Array>} OHLCV data
   */
  async getTimeSeries(symbol, interval, outputsize = 300) {
    try {
      await this.rateLimitWait();

      logger.info(`Fetching ${symbol} ${interval} data (${outputsize} bars)...`);

      const response = await axios.get(`${this.baseUrl}/time_series`, {
        params: {
          symbol: symbol,
          interval: interval,
          outputsize: outputsize,
          apikey: this.apiKey,
          format: 'JSON',
          order: 'DESC' // Most recent first
        },
        timeout: 10000
      });

      if (response.data.status === 'error') {
        throw new Error(response.data.message || 'API error');
      }

      if (!response.data.values || !Array.isArray(response.data.values)) {
        throw new Error('Invalid response format');
      }

      const data = response.data.values;
      
      // Convert to standard OHLCV format and reverse to chronological order
      const ohlcv = data.reverse().map(bar => ({
        datetime: bar.datetime,
        timestamp: new Date(bar.datetime).getTime(),
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseFloat(bar.volume || 0)
      }));

      logger.success(`✓ Fetched ${ohlcv.length} bars for ${symbol} ${interval}`);

      return ohlcv;

    } catch (error) {
      logger.error(`Failed to fetch ${symbol} ${interval}:`, error.message);
      
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Free tier: 8 calls/min, 800 calls/day.');
      }
      
      throw error;
    }
  }

  /**
   * Get current quote (real-time price)
   * @param {string} symbol - Trading pair
   * @returns {Promise<Object>} Current quote
   */
  async getQuote(symbol) {
    try {
      await this.rateLimitWait();

      logger.info(`Fetching current quote for ${symbol}...`);

      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: {
          symbol: symbol,
          apikey: this.apiKey
        },
        timeout: 10000
      });

      if (response.data.status === 'error') {
        throw new Error(response.data.message || 'API error');
      }

      const quote = {
        symbol: response.data.symbol,
        price: parseFloat(response.data.close),
        open: parseFloat(response.data.open),
        high: parseFloat(response.data.high),
        low: parseFloat(response.data.low),
        volume: parseFloat(response.data.volume || 0),
        timestamp: new Date(response.data.datetime).getTime(),
        datetime: response.data.datetime
      };

      logger.success(`✓ Current price for ${symbol}: ${quote.price}`);

      return quote;

    } catch (error) {
      logger.error(`Failed to fetch quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Validate API key
   * @returns {Promise<boolean>} True if valid
   */
  async validateApiKey() {
    try {
      if (!this.apiKey || this.apiKey === 'your_twelvedata_api_key_here') {
        throw new Error('TwelveData API key not configured');
      }

      // Test with a simple quote request
      await this.getQuote('EUR/USD');
      
      logger.success('✓ TwelveData API key is valid');
      return true;

    } catch (error) {
      logger.error('Invalid TwelveData API key:', error.message);
      return false;
    }
  }

  /**
   * Get multiple timeframes for a symbol
   * @param {string} symbol - Trading pair
   * @param {Array} timeframes - Array of timeframe objects [{interval, bars}]
   * @returns {Promise<Object>} Map of timeframe to data
   */
  async getMultipleTimeframes(symbol, timeframes) {
    const results = {};

    for (const tf of timeframes) {
      try {
        results[tf.interval] = await this.getTimeSeries(symbol, tf.interval, tf.bars);
      } catch (error) {
        logger.error(`Failed to fetch ${symbol} ${tf.interval}:`, error.message);
        results[tf.interval] = null;
      }
    }

    return results;
  }
}

export default TwelveDataClient;
