import { formatPrice } from '../utils/pips.js';

/**
 * Market Data Formatter
 * Converts OHLCV data into structured text format for AI analysis
 */
class DataFormatter {
  
  /**
   * Format OHLCV data for AI consumption
   * @param {Array} ohlcv - OHLCV data array
   * @param {string} pair - Trading pair
   * @param {string} timeframe - Timeframe
   * @returns {Object} Formatted data with summary and patterns
   */
  formatForAI(ohlcv, pair, timeframe) {
    if (!ohlcv || ohlcv.length === 0) {
      throw new Error('No OHLCV data provided');
    }

    return {
      summary: this.generateSummary(ohlcv, pair, timeframe),
      recentCandles: this.formatRecentCandles(ohlcv, pair, 30),
      keyLevels: this.identifyKeyLevels(ohlcv, pair),
      trendAnalysis: this.analyzeTrend(ohlcv),
      candlestickPatterns: this.detectPatterns(ohlcv, pair),
      priceAction: this.describePriceAction(ohlcv, pair)
    };
  }

  /**
   * Generate summary statistics
   */
  generateSummary(ohlcv, pair, timeframe) {
    const latest = ohlcv[ohlcv.length - 1];
    const oldest = ohlcv[0];
    const high = Math.max(...ohlcv.map(c => c.high));
    const low = Math.min(...ohlcv.map(c => c.low));
    
    return {
      pair,
      timeframe,
      totalBars: ohlcv.length,
      currentPrice: formatPrice(pair, latest.close),
      priceChange: ((latest.close - oldest.close) / oldest.close * 100).toFixed(2) + '%',
      periodHigh: formatPrice(pair, high),
      periodLow: formatPrice(pair, low),
      range: formatPrice(pair, high - low),
      lastUpdate: latest.datetime
    };
  }

  /**
   * Format recent candles in readable text
   */
  formatRecentCandles(ohlcv, pair, count = 30) {
    const recent = ohlcv.slice(-count);
    
    return recent.map((candle, idx) => {
      const bodySize = Math.abs(candle.close - candle.open);
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      const isBullish = candle.close > candle.open;
      
      return {
        index: idx + 1,
        datetime: candle.datetime,
        type: isBullish ? 'BULLISH' : 'BEARISH',
        open: formatPrice(pair, candle.open),
        high: formatPrice(pair, candle.high),
        low: formatPrice(pair, candle.low),
        close: formatPrice(pair, candle.close),
        bodySize: formatPrice(pair, bodySize),
        upperWick: formatPrice(pair, upperWick),
        lowerWick: formatPrice(pair, lowerWick)
      };
    });
  }

  /**
   * Identify key support/resistance levels
   */
  identifyKeyLevels(ohlcv, pair) {
    const highs = ohlcv.map(c => c.high);
    const lows = ohlcv.map(c => c.low);
    
    // Find swing highs and lows
    const swingHighs = [];
    const swingLows = [];
    
    for (let i = 2; i < ohlcv.length - 2; i++) {
      // Swing high: higher than 2 bars before and after
      if (ohlcv[i].high > ohlcv[i-1].high && 
          ohlcv[i].high > ohlcv[i-2].high &&
          ohlcv[i].high > ohlcv[i+1].high && 
          ohlcv[i].high > ohlcv[i+2].high) {
        swingHighs.push({
          price: ohlcv[i].high,
          index: i,
          datetime: ohlcv[i].datetime
        });
      }
      
      // Swing low: lower than 2 bars before and after
      if (ohlcv[i].low < ohlcv[i-1].low && 
          ohlcv[i].low < ohlcv[i-2].low &&
          ohlcv[i].low < ohlcv[i+1].low && 
          ohlcv[i].low < ohlcv[i+2].low) {
        swingLows.push({
          price: ohlcv[i].low,
          index: i,
          datetime: ohlcv[i].datetime
        });
      }
    }

    // Group similar levels (within 0.1% of each other)
    const resistanceLevels = this.groupLevels(swingHighs, pair, 0.001);
    const supportLevels = this.groupLevels(swingLows, pair, 0.001);

    return {
      resistance: resistanceLevels.slice(0, 5), // Top 5
      support: supportLevels.slice(0, 5)
    };
  }

  /**
   * Group similar price levels
   */
  groupLevels(swingPoints, pair, threshold) {
    if (swingPoints.length === 0) return [];

    const sorted = swingPoints.sort((a, b) => b.price - a.price);
    const groups = [];
    
    for (const point of sorted) {
      let foundGroup = false;
      
      for (const group of groups) {
        if (Math.abs(point.price - group.price) / group.price < threshold) {
          group.touches++;
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        groups.push({
          price: formatPrice(pair, point.price),
          touches: 1,
          lastTouch: point.datetime
        });
      }
    }
    
    // Sort by number of touches
    return groups.sort((a, b) => b.touches - a.touches);
  }

  /**
   * Analyze overall trend
   */
  analyzeTrend(ohlcv) {
    if (ohlcv.length < 50) {
      return { trend: 'insufficient_data', description: 'Not enough data for trend analysis' };
    }

    const recent = ohlcv.slice(-50);
    const older = ohlcv.slice(-100, -50);

    const recentAvg = recent.reduce((sum, c) => sum + c.close, 0) / recent.length;
    const olderAvg = older.reduce((sum, c) => sum + c.close, 0) / older.length;

    const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

    // Identify higher highs and higher lows (uptrend)
    const recentHighs = recent.map(c => c.high);
    const recentLows = recent.map(c => c.low);
    const isHigherHighs = recentHighs.slice(-10).some((h, i, arr) => i > 0 && h > arr[i-1]);
    const isHigherLows = recentLows.slice(-10).some((l, i, arr) => i > 0 && l > arr[i-1]);

    // Identify lower highs and lower lows (downtrend)
    const isLowerHighs = recentHighs.slice(-10).some((h, i, arr) => i > 0 && h < arr[i-1]);
    const isLowerLows = recentLows.slice(-10).some((l, i, arr) => i > 0 && l < arr[i-1]);

    let trend = 'sideways';
    let description = 'Market is ranging without clear direction';

    if (percentChange > 0.5 && isHigherHighs && isHigherLows) {
      trend = 'uptrend';
      description = `Strong uptrend with higher highs and higher lows (+${percentChange.toFixed(2)}%)`;
    } else if (percentChange < -0.5 && isLowerHighs && isLowerLows) {
      trend = 'downtrend';
      description = `Strong downtrend with lower highs and lower lows (${percentChange.toFixed(2)}%)`;
    } else if (percentChange > 0.2) {
      trend = 'weak_uptrend';
      description = `Weak uptrend (+${percentChange.toFixed(2)}%)`;
    } else if (percentChange < -0.2) {
      trend = 'weak_downtrend';
      description = `Weak downtrend (${percentChange.toFixed(2)}%)`;
    }

    return { trend, description, percentChange: percentChange.toFixed(2) };
  }

  /**
   * Detect candlestick patterns
   */
  detectPatterns(ohlcv, pair) {
    const patterns = [];
    
    // Look at last 50 candles for patterns
    const scanRange = Math.min(50, ohlcv.length - 1);
    
    for (let i = ohlcv.length - scanRange; i < ohlcv.length - 1; i++) {
      const current = ohlcv[i];
      const previous = ohlcv[i - 1];
      
      // Bullish Engulfing
      if (this.isBullishEngulfing(previous, current)) {
        patterns.push({
          type: 'bullish_engulfing',
          index: i,
          datetime: current.datetime,
          description: `Bullish engulfing at ${formatPrice(pair, current.close)}`
        });
      }
      
      // Bearish Engulfing
      if (this.isBearishEngulfing(previous, current)) {
        patterns.push({
          type: 'bearish_engulfing',
          index: i,
          datetime: current.datetime,
          description: `Bearish engulfing at ${formatPrice(pair, current.close)}`
        });
      }

      // Pin Bar (Hammer/Shooting Star)
      if (this.isPinBar(current)) {
        const isPinBarBullish = current.close > current.open;
        patterns.push({
          type: isPinBarBullish ? 'bullish_pin_bar' : 'bearish_pin_bar',
          index: i,
          datetime: current.datetime,
          description: `${isPinBarBullish ? 'Bullish' : 'Bearish'} pin bar`
        });
      }
    }

    return patterns;
  }

  /**
   * Check if bullish engulfing pattern
   */
  isBullishEngulfing(prev, curr) {
    return (
      prev.close < prev.open && // Previous is bearish
      curr.close > curr.open && // Current is bullish
      curr.open <= prev.close && // Opens at or below previous close
      curr.close >= prev.open    // Closes at or above previous open
    );
  }

  /**
   * Check if bearish engulfing pattern
   */
  isBearishEngulfing(prev, curr) {
    return (
      prev.close > prev.open && // Previous is bullish
      curr.close < curr.open && // Current is bearish
      curr.open >= prev.close && // Opens at or above previous close
      curr.close <= prev.open    // Closes at or below previous open
    );
  }

  /**
   * Check if pin bar (long wick, small body)
   */
  isPinBar(candle) {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    // Pin bar: body is less than 1/3 of total range, one wick is > 2/3
    return (
      bodySize < totalRange * 0.33 &&
      (upperWick > totalRange * 0.66 || lowerWick > totalRange * 0.66)
    );
  }

  /**
   * Describe recent price action in natural language
   */
  describePriceAction(ohlcv, pair) {
    const recent = ohlcv.slice(-10);
    const latest = recent[recent.length - 1];
    
    const bullishCandles = recent.filter(c => c.close > c.open).length;
    const bearishCandles = recent.filter(c => c.close < c.open).length;
    
    const momentum = bullishCandles > bearishCandles ? 'bullish' : 
                     bearishCandles > bullishCandles ? 'bearish' : 'neutral';
    
    const volatility = this.calculateVolatility(recent);
    
    return {
      momentum,
      bullishCandles,
      bearishCandles,
      volatility: volatility.toFixed(2) + '%',
      description: `Recent price action shows ${momentum} momentum with ${volatility.toFixed(1)}% volatility. ` +
                   `Last 10 candles: ${bullishCandles} bullish, ${bearishCandles} bearish.`
    };
  }

  /**
   * Calculate recent volatility
   */
  calculateVolatility(candles) {
    const ranges = candles.map(c => (c.high - c.low) / c.close * 100);
    return ranges.reduce((sum, r) => sum + r, 0) / ranges.length;
  }
}

export default DataFormatter;
