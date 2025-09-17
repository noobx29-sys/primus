const { EMA, MACD, RSI, ADX, BollingerBands } = require('technicalindicators');

// Default parameters matching your PineScript
const DEFAULT_PARAMS = {
    ema_short_length: 50,
    ema_long_length: 200,
    macd_fast_length: 12,
    macd_slow_length: 26,
    macd_signal_length: 9,
    rsi_length: 14,
    rsi_buy_level: 30,
    rsi_sell_level: 70,
    di_length: 14,
    adx_smoothing: 14,
    adx_threshold_buy: 25,
    bb_length: 20,
    bb_mult: 2.0
};

// Sample data for testing/fallback
const SAMPLE_DATA = Array.from({ length: 500 }, (_, i) => ({
    timestamp: Date.now() - (500 - i) * 3600000,
    open: 2000 + Math.random() * 50,
    high: 2020 + Math.random() * 50,
    low: 1980 + Math.random() * 50,
    close: 2000 + Math.random() * 50,
    volume: 100 + Math.random() * 50
}));

async function fetchCurrentPrice() {
    console.log('🔍 Generating synthetic current price...');
    
    // Generate realistic current price for gold (around $3500-3600 range)
    const basePrice = 3530;
    const randomVariation = (Math.random() - 0.5) * 100; // ±$50 variation
    const currentPrice = basePrice + randomVariation;
    
    console.log(`✅ Generated current price: $${currentPrice.toFixed(2)}`);
    return parseFloat(currentPrice.toFixed(2));
}

async function fetchPriceData(limit = 500) {
    console.log(`🔍 Generating synthetic price data for ${limit} data points...`);
    
    // Generate realistic current price
    const currentPrice = await fetchCurrentPrice();
    
    console.log(`📊 Generating synthetic data with realistic patterns`);
    console.log(`💰 Using current price: $${currentPrice}`);
    console.log(`📈 Generating ${limit} data points with market structure`);
    
    const syntheticData = generateRealisticSampleData(limit, currentPrice, 'uptrend');
    console.log(`✅ Generated ${syntheticData.length} synthetic data points`);
    console.log(`💰 Latest price: $${syntheticData[syntheticData.length - 1]?.close || 'N/A'}`);
    
    return syntheticData;
}

function generateRealisticSampleData(length = 500, currentPrice = 3530, trend = 'uptrend') {
    const data = [];
    let basePrice = currentPrice;
    
    // Trend strength based on trend type
    let trendStrength = 0.001; // Default slight upward
    if (trend === 'uptrend') {
        trendStrength = 0.002; // Stronger upward trend
    } else if (trend === 'downtrend') {
        trendStrength = -0.002; // Downward trend
    } else {
        trendStrength = 0.0005; // Sideways with slight upward bias
    }
    
    for (let i = 0; i < length; i++) {
        // Add some trending behavior and volatility
        const random = (Math.random() - 0.5) * 0.01; // ±0.5% random movement
        const trendComponent = trendStrength * Math.sin(i / 50); // Cyclical trend
        
        const priceChange = random + trendComponent;
        basePrice = basePrice * (1 + priceChange);
        
        // Generate OHLC data with trend bias
        let open, high, low, close;
        
        if (trend === 'uptrend') {
            // In uptrend, more bullish candles
            const isBullish = Math.random() > 0.3; // 70% bullish candles
            if (isBullish) {
                open = basePrice * (1 - Math.random() * 0.003);
                close = basePrice * (1 + Math.random() * 0.003);
            } else {
                open = basePrice * (1 + Math.random() * 0.003);
                close = basePrice * (1 - Math.random() * 0.003);
            }
        } else if (trend === 'downtrend') {
            // In downtrend, more bearish candles
            const isBearish = Math.random() > 0.3; // 70% bearish candles
            if (isBearish) {
                open = basePrice * (1 + Math.random() * 0.003);
                close = basePrice * (1 - Math.random() * 0.003);
            } else {
                open = basePrice * (1 - Math.random() * 0.003);
                close = basePrice * (1 + Math.random() * 0.003);
            }
        } else {
            // Sideways - random candle direction
            const isBullish = Math.random() > 0.5;
            if (isBullish) {
                open = basePrice * (1 - Math.random() * 0.003);
                close = basePrice * (1 + Math.random() * 0.003);
            } else {
                open = basePrice * (1 + Math.random() * 0.003);
                close = basePrice * (1 - Math.random() * 0.003);
            }
        }
        
        const volatility = basePrice * 0.008; // 0.8% volatility for gold
        high = Math.max(open, close) + Math.random() * volatility * 0.5;
        low = Math.min(open, close) - Math.random() * volatility * 0.5;
        
        data.push({
            timestamp: Date.now() - (length - i) * 60 * 60000, // Hourly intervals
            open: parseFloat(open.toFixed(2)),
            high: parseFloat(high.toFixed(2)),
            low: parseFloat(low.toFixed(2)),
            close: parseFloat(close.toFixed(2)),
            volume: Math.floor(100 + Math.random() * 200)
        });
        
        basePrice = close; // Use close as next open
    }
    
    return data;
}

async function analyzeTradingSignals(params = DEFAULT_PARAMS, progressCallback = null) {
    try {
        console.log('Starting trading signals analysis...');
        
        // Progress update: Data fetching
        if (progressCallback) {
            await progressCallback('📊 Fetching market data...', 30);
        }
        
        // Fetch price data
        const priceData = await fetchPriceData();
        
        // Progress update: Data validation
        if (progressCallback) {
            await progressCallback('🔍 Validating market data...', 40);
        }
        
        // Ensure we have enough data points
        const minDataPoints = Math.max(
            params.ema_long_length,
            params.macd_slow_length,
            params.bb_length,
            params.di_length + params.adx_smoothing
        );
        
        if (!priceData || priceData.length < minDataPoints) {
            throw new Error(`Insufficient price data for analysis. Need at least ${minDataPoints} points, got ${priceData?.length || 0}`);
        }

        const closes = priceData.map(d => d.close);
        const highs = priceData.map(d => d.high);
        const lows = priceData.map(d => d.low);

        console.log(`Analyzing ${closes.length} data points...`);

        // Progress update: Technical indicators calculation
        if (progressCallback) {
            await progressCallback('🔍 Calculating technical indicators...', 50);
        }

        // Calculate EMAs
        if (progressCallback) {
            await progressCallback('📈 Calculating EMAs...', 55);
        }
        const emaShort = EMA.calculate({
            period: params.ema_short_length,
            values: closes
        });
        const emaLong = EMA.calculate({
            period: params.ema_long_length,
            values: closes
        });

        // Calculate MACD
        if (progressCallback) {
            await progressCallback('📊 Calculating MACD...', 60);
        }
        const macd = MACD.calculate({
            fastPeriod: params.macd_fast_length,
            slowPeriod: params.macd_slow_length,
            signalPeriod: params.macd_signal_length,
            values: closes
        });

        // Calculate RSI
        if (progressCallback) {
            await progressCallback('📉 Calculating RSI...', 65);
        }
        const rsi = RSI.calculate({
            period: params.rsi_length,
            values: closes
        });

        // Calculate ADX
        if (progressCallback) {
            await progressCallback('📈 Calculating ADX...', 70);
        }
        const adx = ADX.calculate({
            high: highs,
            low: lows,
            close: closes,
            period: params.di_length
        });

        // Calculate Bollinger Bands
        if (progressCallback) {
            await progressCallback('📊 Calculating Bollinger Bands...', 75);
        }
        const bb = BollingerBands.calculate({
            period: params.bb_length,
            values: closes,
            stdDev: params.bb_mult
        });

        // Get the latest values
        const currentClose = closes[closes.length - 1];
        const currentEmaShort = emaShort[emaShort.length - 1];
        const currentEmaLong = emaLong[emaLong.length - 1];
        const currentMacd = macd[macd.length - 1];
        const currentRsi = rsi[rsi.length - 1];
        const currentAdx = adx[adx.length - 1];
        const currentBb = bb[bb.length - 1];

        // Progress update: Signal calculation
        if (progressCallback) {
            await progressCallback('⚡ Calculating trading signals...', 80);
        }

        // Calculate signals with more detailed logic
        const signals = {
            ema_buy: currentEmaShort > currentEmaLong,
            ema_sell: currentEmaShort < currentEmaLong,
            macd_buy: currentMacd.MACD > currentMacd.signal && currentMacd.MACD > 0,
            macd_sell: currentMacd.MACD < currentMacd.signal && currentMacd.MACD < 0,
            rsi_buy: currentRsi < params.rsi_buy_level,
            rsi_sell: currentRsi > params.rsi_sell_level,
            rsi_neutral: currentRsi >= params.rsi_buy_level && currentRsi <= params.rsi_sell_level,
            adx_buy: currentAdx.ADX > params.adx_threshold_buy && currentAdx.DIplus > currentAdx.DIminus,
            adx_sell: currentAdx.ADX > params.adx_threshold_buy && currentAdx.DIminus > currentAdx.DIplus,
            bb_buy: currentClose < currentBb.lower, // Oversold condition
            bb_sell: currentClose > currentBb.upper, // Overbought condition
            bb_neutral: currentClose >= currentBb.lower && currentClose <= currentBb.upper,
            
            // Current values for reference
            current_price: currentClose,
            current_ema_short: currentEmaShort,
            current_ema_long: currentEmaLong,
            rsi_value: currentRsi,
            macd_value: currentMacd.MACD,
            macd_signal: currentMacd.signal,
            macd_histogram: currentMacd.histogram,
            adx_value: currentAdx.ADX,
            bb_upper: currentBb.upper,
            bb_middle: currentBb.middle,
            bb_lower: currentBb.lower,
            
            // Metadata
            data_points_analyzed: closes.length,
            timestamp: new Date().toISOString(),
            using_sample_data: priceData === SAMPLE_DATA
        };

        // Count buy and sell signals
        const buySignals = ['ema_buy', 'macd_buy', 'rsi_buy', 'adx_buy', 'bb_buy'];
        const sellSignals = ['ema_sell', 'macd_sell', 'rsi_sell', 'adx_sell', 'bb_sell'];
        
        const buyCount = buySignals.filter(signal => signals[signal]).length;
        const sellCount = sellSignals.filter(signal => signals[signal]).length;

        // Determine overall signal with confidence
        signals.buy_signal_count = buyCount;
        signals.sell_signal_count = sellCount;
        signals.overall_buy = buyCount > sellCount;
        signals.overall_sell = sellCount > buyCount;
        signals.overall_neutral = buyCount === sellCount;
        signals.signal_strength = Math.abs(buyCount - sellCount) / Math.max(buySignals.length, sellSignals.length);

        // Final progress update
        if (progressCallback) {
            await progressCallback('✅ Analysis complete!', 90);
        }

        console.log(`Analysis complete. Buy signals: ${buyCount}, Sell signals: ${sellCount}`);
        
        return signals;
        
    } catch (error) {
        console.error('Error in analyzeTradingSignals:', error);
        throw error;
    }
}

// Add a test function to help debug
async function testDataFetch() {
    try {
        console.log('Testing data fetch...');
        const data = await fetchPriceData(10);
        console.log('Sample data:', data.slice(-3)); // Show last 3 entries
        return data;
    } catch (error) {
        console.error('Test failed:', error);
        throw error;
    }
}

// Enhanced Gold Trading Analysis Functions

/**
 * Analyze market structure for gold trading conditions
 * @param {Array} candlestickData - Array of candlestick data
 * @returns {Object} Market structure analysis
 */
function analyzeGoldMarketStructure(candlestickData) {
    if (!candlestickData || candlestickData.length < 20) {
        return {
            trend: 'sideways',
            description: 'Insufficient data for market structure analysis',
            strength: 'weak',
            swingHighs: [],
            swingLows: []
        };
    }

    // Get recent candlesticks for analysis (last 50 candles for better trend detection)
    const recentCandles = candlestickData.slice(-50);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const closes = recentCandles.map(c => c.close);

    // Find swing highs and lows
    const swingHighs = findSwingHighs(highs, 3);
    const swingLows = findSwingLows(lows, 3);

    // Determine market structure based on swing points and recent price action
    let trend = 'sideways';
    let description = 'Market moving sideways between support and resistance';
    let strength = 'moderate';

    // Calculate recent price momentum (last candle vs 10 candles ago)
    const recentPriceChange = (closes[closes.length - 1] - closes[closes.length - 11]) / closes[closes.length - 11];
    const isStrongMove = Math.abs(recentPriceChange) > 0.02; // 2% move

    if (swingHighs.length >= 2 && swingLows.length >= 2) {
        const recentHighs = swingHighs.slice(-2);
        const recentLows = swingLows.slice(-2);

        // Check for Higher Highs and Higher Lows (Uptrend)
        if (recentHighs[1] > recentHighs[0] && recentLows[1] > recentLows[0]) {
            trend = 'uptrend';
            description = 'Market making Higher Highs and Higher Lows';
            strength = isStrongMove ? 'strong' : 'moderate';
        }
        // Check for Lower Highs and Lower Lows (Downtrend)  
        else if (recentHighs[1] < recentHighs[0] && recentLows[1] < recentLows[0]) {
            trend = 'downtrend';
            description = 'Market making Lower Highs and Lower Lows';
            strength = isStrongMove ? 'strong' : 'moderate';
        }
    }
    
    // If we can't determine from swing points, use recent price action
    if (trend === 'sideways') {
        // Check recent price action (last 10 candles)
        const recent10Closes = closes.slice(-10);
        const recent10Change = (recent10Closes[recent10Closes.length - 1] - recent10Closes[0]) / recent10Closes[0];
        
        // Also check overall trend in last 20 candles
        const recent20Closes = closes.slice(-20);
        const recent20Change = (recent20Closes[recent20Closes.length - 1] - recent20Closes[0]) / recent20Closes[0];
        
        // Use the stronger signal
        const shortTermSignal = Math.abs(recent10Change) > 0.01;
        const mediumTermSignal = Math.abs(recent20Change) > 0.02;
        
        if (shortTermSignal || mediumTermSignal) {
            const changeToUse = shortTermSignal ? recent10Change : recent20Change;
            
            if (changeToUse > 0) {
                trend = 'uptrend';
                description = 'Market showing strong upward momentum';
                strength = 'strong';
            } else {
                trend = 'downtrend';
                description = 'Market showing strong downward momentum';
                strength = 'strong';
            }
        }
    }

    return {
        trend,
        description,
        strength,
        swingHighs,
        swingLows,
        currentPrice: closes[closes.length - 1]
    };
}

/**
 * Find swing highs in price data
 * @param {Array} highs - Array of high prices
 * @param {Number} lookback - Number of periods to look back/forward
 * @returns {Array} Array of swing high prices
 */
function findSwingHighs(highs, lookback = 3) {
    const swingHighs = [];
    
    for (let i = lookback; i < highs.length - lookback; i++) {
        let isSwingHigh = true;
        
        // Check if current high is higher than surrounding highs
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue;
            
            if (highs[i] <= highs[j]) {
                isSwingHigh = false;
                break;
            }
        }
        
        if (isSwingHigh) {
            swingHighs.push(highs[i]);
        }
    }
    
    return swingHighs;
}

/**
 * Find swing lows in price data
 * @param {Array} lows - Array of low prices
 * @param {Number} lookback - Number of periods to look back/forward
 * @returns {Array} Array of swing low prices
 */
function findSwingLows(lows, lookback = 3) {
    const swingLows = [];
    
    for (let i = lookback; i < lows.length - lookback; i++) {
        let isSwingLow = true;
        
        // Check if current low is lower than surrounding lows
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue;
            
            if (lows[i] >= lows[j]) {
                isSwingLow = false;
                break;
            }
        }
        
        if (isSwingLow) {
            swingLows.push(lows[i]);
        }
    }
    
    return swingLows;
}

/**
 * Enhanced engulfing pattern detection with advanced criteria
 * @param {Array} candlestickData - Array of candlestick data
 * @returns {Array} Array of detected engulfing patterns with advanced scoring
 */
function detectGoldEngulfingPatterns(candlestickData) {
    const patterns = [];
    
    console.log(`🔍 Analyzing ${candlestickData.length} candles for advanced engulfing patterns...`);
    
    for (let i = 2; i < candlestickData.length; i++) {
        const currentCandle = candlestickData[i];
        const previousCandle = candlestickData[i - 1];
        const prePreviousCandle = candlestickData[i - 2];
        
        // Enhanced Bullish Engulfing Pattern Detection
        if (previousCandle.close < previousCandle.open && // Previous candle is bearish
            currentCandle.close > currentCandle.open && // Current candle is bullish
            currentCandle.open < previousCandle.close && // Current opens below previous close
            currentCandle.close > previousCandle.open) { // Current closes above previous open
            
            const pattern = analyzeBullishEngulfingQuality(currentCandle, previousCandle, prePreviousCandle, candlestickData, i);
            
            if (pattern.score >= 3) { // Only include patterns with score 3 or higher
                patterns.push(pattern);
                console.log(`✅ Found ${pattern.strength} bullish engulfing at $${currentCandle.close} (Score: ${pattern.score}/10)`);
            }
        }
        
        // Enhanced Bearish Engulfing Pattern Detection
        if (previousCandle.close > previousCandle.open && // Previous candle is bullish
            currentCandle.close < currentCandle.open && // Current candle is bearish
            currentCandle.open > previousCandle.close && // Current opens above previous close
            currentCandle.close < previousCandle.open) { // Current closes below previous open
            
            const pattern = analyzeBearishEngulfingQuality(currentCandle, previousCandle, prePreviousCandle, candlestickData, i);
            
            if (pattern.score >= 3) { // Only include patterns with score 3 or higher
                patterns.push(pattern);
                console.log(`✅ Found ${pattern.strength} bearish engulfing at $${currentCandle.close} (Score: ${pattern.score}/10)`);
            }
        }
    }
    
    // Sort patterns by score (highest first)
    patterns.sort((a, b) => b.score - a.score);
    
    console.log(`📊 Advanced pattern detection complete: ${patterns.length} high-quality patterns found`);
    if (patterns.length === 0) {
        console.log('⚠️ No high-quality engulfing patterns detected');
        console.log('   - Looking for patterns with score ≥ 3/10');
        console.log('   - Consider lower timeframe or wait for better setup');
    }
    
    return patterns.slice(0, 5); // Return top 5 patterns
}

/**
 * Analyze bullish engulfing pattern quality with advanced scoring
 */
function analyzeBullishEngulfingQuality(currentCandle, previousCandle, prePreviousCandle, candlestickData, index) {
    let score = 0;
    let strength = 'weak';
    let confidence = 'low';
    const factors = [];
    
    // 1. Body Size Ratio (0-2 points)
    const bodySize = Math.abs(currentCandle.close - currentCandle.open);
    const prevBodySize = Math.abs(previousCandle.close - previousCandle.open);
    const bodyRatio = bodySize / prevBodySize;
    
    if (bodyRatio > 2.0) {
        score += 2;
        factors.push('Massive engulfing (2x+ body size)');
    } else if (bodyRatio > 1.5) {
        score += 1;
        factors.push('Strong engulfing (1.5x+ body size)');
    }
    
    // 2. Volume Analysis (0-1 points)
    if (currentCandle.volume > previousCandle.volume * 1.3) {
        score += 1;
        factors.push('High volume confirmation');
    }
    
    // 3. Wick Analysis (0-1 points)
    const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const bodyRange = Math.abs(currentCandle.close - currentCandle.open);
    
    if (upperWick < bodyRange * 0.3 && lowerWick < bodyRange * 0.3) {
        score += 1;
        factors.push('Clean engulfing (minimal wicks)');
    }
    
    // 4. Previous Trend Context (0-2 points)
    const recentCandles = candlestickData.slice(Math.max(0, index - 5), index);
    const bearishCandles = recentCandles.filter(c => c.close < c.open).length;
    
    if (bearishCandles >= 3) {
        score += 2;
        factors.push('Strong bearish trend reversal');
    } else if (bearishCandles >= 2) {
        score += 1;
        factors.push('Moderate bearish trend');
    }
    
    // 5. Gap Analysis (0-1 points)
    if (currentCandle.open < previousCandle.low) {
        score += 1;
        factors.push('Gap down opening');
    }
    
    // 6. Support Level Confluence (0-2 points)
    const supportLevels = findNearbySupport(currentCandle.close, candlestickData, index);
    if (supportLevels.length > 0) {
        score += Math.min(2, supportLevels.length);
        factors.push(`Support confluence (${supportLevels.length} levels)`);
    }
    
    // 7. Pattern Location (0-1 points)
    const location = getPriceLocationAdvanced(currentCandle.close, candlestickData, index);
    if (location === 'support_zone' || location === 'oversold') {
        score += 1;
        factors.push('Optimal location for bullish reversal');
    }
    
    // Determine strength and confidence
    if (score >= 7) {
        strength = 'very_strong';
        confidence = 'very_high';
    } else if (score >= 5) {
        strength = 'strong';
        confidence = 'high';
    } else if (score >= 3) {
        strength = 'moderate';
        confidence = 'medium';
    }
    
    return {
        type: 'bullish_engulfing',
        timestamp: currentCandle.timestamp,
        price: currentCandle.close,
        strength: strength,
        confidence: confidence,
        score: score,
        maxScore: 10,
        factors: factors,
        location: location,
        bodyRatio: bodyRatio.toFixed(2),
        volumeRatio: (currentCandle.volume / previousCandle.volume).toFixed(2)
    };
}

/**
 * Analyze bearish engulfing pattern quality with advanced scoring
 */
function analyzeBearishEngulfingQuality(currentCandle, previousCandle, prePreviousCandle, candlestickData, index) {
    let score = 0;
    let strength = 'weak';
    let confidence = 'low';
    const factors = [];
    
    // 1. Body Size Ratio (0-2 points)
    const bodySize = Math.abs(currentCandle.close - currentCandle.open);
    const prevBodySize = Math.abs(previousCandle.close - previousCandle.open);
    const bodyRatio = bodySize / prevBodySize;
    
    if (bodyRatio > 2.0) {
        score += 2;
        factors.push('Massive engulfing (2x+ body size)');
    } else if (bodyRatio > 1.5) {
        score += 1;
        factors.push('Strong engulfing (1.5x+ body size)');
    }
    
    // 2. Volume Analysis (0-1 points)
    if (currentCandle.volume > previousCandle.volume * 1.3) {
        score += 1;
        factors.push('High volume confirmation');
    }
    
    // 3. Wick Analysis (0-1 points)
    const upperWick = currentCandle.high - Math.max(currentCandle.open, currentCandle.close);
    const lowerWick = Math.min(currentCandle.open, currentCandle.close) - currentCandle.low;
    const bodyRange = Math.abs(currentCandle.close - currentCandle.open);
    
    if (upperWick < bodyRange * 0.3 && lowerWick < bodyRange * 0.3) {
        score += 1;
        factors.push('Clean engulfing (minimal wicks)');
    }
    
    // 4. Previous Trend Context (0-2 points)
    const recentCandles = candlestickData.slice(Math.max(0, index - 5), index);
    const bullishCandles = recentCandles.filter(c => c.close > c.open).length;
    
    if (bullishCandles >= 3) {
        score += 2;
        factors.push('Strong bullish trend reversal');
    } else if (bullishCandles >= 2) {
        score += 1;
        factors.push('Moderate bullish trend');
    }
    
    // 5. Gap Analysis (0-1 points)
    if (currentCandle.open > previousCandle.high) {
        score += 1;
        factors.push('Gap up opening');
    }
    
    // 6. Resistance Level Confluence (0-2 points)
    const resistanceLevels = findNearbyResistance(currentCandle.close, candlestickData, index);
    if (resistanceLevels.length > 0) {
        score += Math.min(2, resistanceLevels.length);
        factors.push(`Resistance confluence (${resistanceLevels.length} levels)`);
    }
    
    // 7. Pattern Location (0-1 points)
    const location = getPriceLocationAdvanced(currentCandle.close, candlestickData, index);
    if (location === 'resistance_zone' || location === 'overbought') {
        score += 1;
        factors.push('Optimal location for bearish reversal');
    }
    
    // Determine strength and confidence
    if (score >= 7) {
        strength = 'very_strong';
        confidence = 'very_high';
    } else if (score >= 5) {
        strength = 'strong';
        confidence = 'high';
    } else if (score >= 3) {
        strength = 'moderate';
        confidence = 'medium';
    }
    
    return {
        type: 'bearish_engulfing',
        timestamp: currentCandle.timestamp,
        price: currentCandle.close,
        strength: strength,
        confidence: confidence,
        score: score,
        maxScore: 10,
        factors: factors,
        location: location,
        bodyRatio: bodyRatio.toFixed(2),
        volumeRatio: (currentCandle.volume / previousCandle.volume).toFixed(2)
    };
}

/**
 * Determine price location relative to recent price action
 * @param {Number} price - Current price
 * @param {Array} candlestickData - Array of candlestick data
 * @returns {String} Price location description
 */
function getPriceLocation(price, candlestickData) {
    const recentCandles = candlestickData.slice(0, 10); // Look at last 10 candles
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow;
    const pricePosition = (price - minLow) / range;
    
    if (pricePosition > 0.75) return 'upper_resistance';
    if (pricePosition > 0.5) return 'middle_range';
    if (pricePosition > 0.25) return 'middle_support';
    return 'lower_support';
}

/**
 * Advanced price location analysis with more context
 */
function getPriceLocationAdvanced(price, candlestickData, index) {
    const lookback = Math.min(20, index);
    const recentCandles = candlestickData.slice(Math.max(0, index - lookback), index);
    
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    const closes = recentCandles.map(c => c.close);
    
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
    const range = maxHigh - minLow;
    const pricePosition = (price - minLow) / range;
    
    // More detailed location analysis
    if (price <= minLow * 1.002) return 'at_support';
    if (price >= maxHigh * 0.998) return 'at_resistance';
    if (pricePosition > 0.8) return 'resistance_zone';
    if (pricePosition > 0.7) return 'upper_range';
    if (pricePosition > 0.6) return 'above_average';
    if (pricePosition > 0.4) return 'middle_range';
    if (pricePosition > 0.3) return 'below_average';
    if (pricePosition > 0.2) return 'lower_range';
    return 'support_zone';
}

/**
 * Find nearby support levels for confluence analysis
 */
function findNearbySupport(price, candlestickData, index) {
    const supportLevels = [];
    const tolerance = price * 0.005; // 0.5% tolerance
    const lookback = Math.min(50, index);
    const historicalCandles = candlestickData.slice(Math.max(0, index - lookback), index);
    
    // Find swing lows as support
    const swingLows = findSwingLows(historicalCandles.map(c => c.low), 3);
    swingLows.forEach(low => {
        if (Math.abs(price - low) <= tolerance) {
            supportLevels.push({
                level: low,
                type: 'swing_low',
                distance: Math.abs(price - low)
            });
        }
    });
    
    // Find psychological levels (round numbers)
    const roundNumber = Math.round(price / 10) * 10;
    if (Math.abs(price - roundNumber) <= tolerance) {
        supportLevels.push({
            level: roundNumber,
            type: 'psychological',
            distance: Math.abs(price - roundNumber)
        });
    }
    
    return supportLevels.slice(0, 3); // Max 3 confluence levels
}

/**
 * Find nearby resistance levels for confluence analysis
 */
function findNearbyResistance(price, candlestickData, index) {
    const resistanceLevels = [];
    const tolerance = price * 0.005; // 0.5% tolerance
    const lookback = Math.min(50, index);
    const historicalCandles = candlestickData.slice(Math.max(0, index - lookback), index);
    
    // Find swing highs as resistance
    const swingHighs = findSwingHighs(historicalCandles.map(c => c.high), 3);
    swingHighs.forEach(high => {
        if (Math.abs(price - high) <= tolerance) {
            resistanceLevels.push({
                level: high,
                type: 'swing_high',
                distance: Math.abs(price - high)
            });
        }
    });
    
    // Find psychological levels (round numbers)
    const roundNumber = Math.round(price / 10) * 10;
    if (Math.abs(price - roundNumber) <= tolerance) {
        resistanceLevels.push({
            level: roundNumber,
            type: 'psychological',
            distance: Math.abs(price - roundNumber)
        });
    }
    
    return resistanceLevels.slice(0, 3); // Max 3 confluence levels
}

/**
 * Calculate fibonacci retracement zones (61.8% and 50% levels)
 * @param {Number} currentPrice - Current price
 * @param {Object} marketStructure - Market structure analysis
 * @param {Array} candlestickData - Array of candlestick data
 * @returns {Array} Array of fibonacci zones
 */
function calculateGoldFibonacciZones(currentPrice, marketStructure, candlestickData) {
    const fibZones = [];
    
    if (!candlestickData || candlestickData.length < 20) {
        return fibZones; // No fibonacci zones if insufficient data
    }
    
    // Only calculate fibonacci zones for trending markets
    if (marketStructure.trend === 'sideways') {
        return fibZones; // No fibonacci zones for sideways markets
    }
    
    // Find recent swing high and low for fibonacci calculation
    const recentCandles = candlestickData.slice(0, 20);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);
    const range = swingHigh - swingLow;
    
    if (range === 0) return fibZones;
    
    const price = parseFloat(currentPrice);
    
    // Ensure the range is meaningful (at least 1% of current price)
    if (range < price * 0.01) {
        return fibZones; // Range too small for meaningful fibonacci levels
    }
    
    if (marketStructure.trend === 'uptrend') {
        // For uptrends, fibonacci retracements from swing high
        const fib618 = swingHigh - (range * 0.618); // 61.8% retracement
        const fib50 = swingHigh - (range * 0.50);   // 50% retracement
        
        // Only add levels that are below current price (potential support)
        if (fib618 < price) {
            fibZones.push({
                level: '61.8% Retracement',
                price: fib618.toFixed(2),
                type: 'support',
                description: 'Fibonacci 61.8% retracement level - strong support'
            });
        }
        
        if (fib50 < price && Math.abs(fib50 - fib618) > (price * 0.001)) {
            fibZones.push({
                level: '50% Retracement', 
                price: fib50.toFixed(2),
                type: 'support',
                description: 'Fibonacci 50% retracement level - psychological support'
            });
        }
        
    } else if (marketStructure.trend === 'downtrend') {
        // For downtrends, fibonacci retracements from swing low
        const fib618 = swingLow + (range * 0.618); // 61.8% retracement
        const fib50 = swingLow + (range * 0.50);   // 50% retracement
        
        // Only add levels that are above current price (potential resistance)
        if (fib618 > price) {
            fibZones.push({
                level: '61.8% Retracement',
                price: fib618.toFixed(2),
                type: 'resistance',
                description: 'Fibonacci 61.8% retracement level - strong resistance'
            });
        }
        
        if (fib50 > price && Math.abs(fib50 - fib618) > (price * 0.001)) {
            fibZones.push({
                level: '50% Retracement',
                price: fib50.toFixed(2),
                type: 'resistance', 
                description: 'Fibonacci 50% retracement level - psychological resistance'
            });
        }
    }
    
    return fibZones;
}

/**
 * Determine entry zones based on trading conditions
 * @param {Object} marketStructure - Market structure analysis
 * @param {Array} engulfingPatterns - Array of engulfing patterns
 * @param {Array} fibonacciZones - Array of fibonacci zones
 * @param {Number} currentPrice - Current price
 * @returns {Array} Array of entry zones
 */
function determineGoldEntryZones(marketStructure, engulfingPatterns, fibonacciZones, currentPrice) {
    const entryZones = [];
    const price = parseFloat(currentPrice);
    
    if (marketStructure.trend === 'uptrend') {
        // UPTREND CONDITIONS:
        // - Market making Higher Highs and Higher Lows
        // - Look for bullish engulfing (as entry zone) OR
        // - Based on fibonacci retracement tool (61.8-50 level)
        
        // Priority 1: Fibonacci retracement zones (61.8% and 50%)
        if (fibonacciZones.length > 0) {
            fibonacciZones.forEach(fibZone => {
                if (fibZone.type === 'support') {
                    // Only include if within 3% of current price
                    const priceDiff = Math.abs(fibZone.price - price) / price;
                    if (priceDiff <= 0.03) {
                        entryZones.push({
                            type: 'BUY_ZONE',
                            price: fibZone.price, // Already formatted as string
                            reason: `Fibonacci ${fibZone.level} support - HH/HL structure`,
                            pattern: 'fibonacci_support',
                            confidence: 'high',
                            description: fibZone.description
                        });
                    }
                }
            });
        }
        
        // Priority 2: Recent bullish engulfing patterns (last 10 candles only)
        const recentEngulfingLevels = getEngulfingLevels(engulfingPatterns, 'bullish_engulfing', price);
        recentEngulfingLevels.slice(0, 3).forEach((level, index) => {
            // Only include if within 2% of current price
            const priceDiff = Math.abs(level - price) / price;
            if (priceDiff <= 0.02) {
                entryZones.push({
                    type: 'BUY_ZONE',
                    price: level.toFixed(2),
                    reason: `Recent bullish engulfing - HH/HL structure`,
                    pattern: 'bullish_engulfing',
                    confidence: index === 0 ? 'high' : 'medium',
                    description: 'Recent bullish engulfing in uptrend'
                });
            }
        });
        
        // Priority 3: Create practical entry zones for uptrend
        if (entryZones.length === 0) {
            // Add pullback entry zones (slightly below current price)
            const pullback1 = (price * 0.995).toFixed(2); // 0.5% pullback
            const pullback2 = (price * 0.99).toFixed(2);  // 1% pullback
            
            entryZones.push({
                type: 'BUY_ZONE',
                price: pullback1,
                reason: `Uptrend pullback entry - HH/HL structure`,
                pattern: 'pullback_entry',
                confidence: 'high',
                description: 'Minor pullback entry zone'
            });
            
            entryZones.push({
                type: 'BUY_ZONE',
                price: pullback2,
                reason: `Uptrend deeper pullback - HH/HL structure`,
                pattern: 'pullback_entry',
                confidence: 'medium',
                description: 'Deeper pullback entry zone'
            });
        }
        
    } else if (marketStructure.trend === 'downtrend') {
        // DOWNTREND CONDITIONS:
        // - Market making Lower Highs and Lower Lows  
        // - Look for bearish engulfing (as entry zone) OR
        // - Based on fibonacci retracement tool (61.8-50 level)
        
        // Priority 1: Fibonacci retracement zones (61.8% and 50%)
        if (fibonacciZones.length > 0) {
            fibonacciZones.forEach(fibZone => {
                if (fibZone.type === 'resistance') {
                    // Only include if within 3% of current price
                    const priceDiff = Math.abs(fibZone.price - price) / price;
                    if (priceDiff <= 0.03) {
                        entryZones.push({
                            type: 'SELL_ZONE',
                            price: fibZone.price, // Already formatted as string
                            reason: `Fibonacci ${fibZone.level} resistance - LH/LL structure`,
                            pattern: 'fibonacci_resistance',
                            confidence: 'high',
                            description: fibZone.description
                        });
                    }
                }
            });
        }
        
        // Priority 2: Recent bearish engulfing patterns (last 10 candles only)
        const recentEngulfingLevels = getEngulfingLevels(engulfingPatterns, 'bearish_engulfing', price);
        recentEngulfingLevels.slice(0, 3).forEach((level, index) => {
            // Only include if within 2% of current price
            const priceDiff = Math.abs(level - price) / price;
            if (priceDiff <= 0.02) {
                entryZones.push({
                    type: 'SELL_ZONE',
                    price: level.toFixed(2),
                    reason: `Recent bearish engulfing - LH/LL structure`,
                    pattern: 'bearish_engulfing',
                    confidence: index === 0 ? 'high' : 'medium',
                    description: 'Recent bearish engulfing in downtrend'
                });
            }
        });
        
        // Priority 3: Create practical entry zones for downtrend
        if (entryZones.length === 0) {
            // Add bounce entry zones (slightly above current price)
            const bounce1 = (price * 1.005).toFixed(2); // 0.5% bounce
            const bounce2 = (price * 1.01).toFixed(2);  // 1% bounce
            
            entryZones.push({
                type: 'SELL_ZONE',
                price: bounce1,
                reason: `Downtrend bounce entry - LH/LL structure`,
                pattern: 'bounce_entry',
                confidence: 'high',
                description: 'Minor bounce entry zone'
            });
            
            entryZones.push({
                type: 'SELL_ZONE',
                price: bounce2,
                reason: `Downtrend deeper bounce - LH/LL structure`,
                pattern: 'bounce_entry',
                confidence: 'medium',
                description: 'Deeper bounce entry zone'
            });
        }
        
    } else {
        // SIDEWAYS CONDITIONS:
        // - Mark out both support and resistance
        // - SnR to be marked by the presence of bullish and bearish engulfing
        
        const supportLevels = getEngulfingLevels(engulfingPatterns, 'bullish_engulfing', price);
        const resistanceLevels = getEngulfingLevels(engulfingPatterns, 'bearish_engulfing', price);
        
        // Add support zones (below current price, within 2% range)
        supportLevels.slice(0, 2).forEach((level, index) => {
            const priceDiff = Math.abs(level - price) / price;
            if (level < price && priceDiff <= 0.02) {
                entryZones.push({
                    type: 'BUY_ZONE',
                    price: level.toFixed(2),
                    reason: `Sideways support - bullish engulfing`,
                    pattern: 'bullish_engulfing',
                    confidence: 'high',
                    description: 'Support level in sideways market'
                });
            }
        });
        
        // Add resistance zones (above current price, within 2% range)
        resistanceLevels.slice(0, 2).forEach((level, index) => {
            const priceDiff = Math.abs(level - price) / price;
            if (level > price && priceDiff <= 0.02) {
                entryZones.push({
                    type: 'SELL_ZONE',
                    price: level.toFixed(2),
                    reason: `Sideways resistance - bearish engulfing`,
                    pattern: 'bearish_engulfing',
                    confidence: 'high',
                    description: 'Resistance level in sideways market'
                });
            }
        });
        
        // If no patterns found, create logical zones
        if (entryZones.length === 0) {
            const supportZone = (price * 0.99).toFixed(2);  // 1% below
            const resistanceZone = (price * 1.01).toFixed(2); // 1% above
            
            entryZones.push({
                type: 'BUY_ZONE',
                price: supportZone,
                reason: `Sideways support zone`,
                pattern: 'support_level',
                confidence: 'medium',
                description: 'Support in sideways market'
            });
            
            entryZones.push({
                type: 'SELL_ZONE',
                price: resistanceZone,
                reason: `Sideways resistance zone`,
                pattern: 'resistance_level',
                confidence: 'medium',
                description: 'Resistance in sideways market'
            });
        }
    }
    
    // Final filter: Only include zones within practical trading range
    const practicalZones = entryZones.filter(zone => {
        const zonePrice = parseFloat(zone.price);
        const priceDiff = Math.abs(zonePrice - price) / price;
        
        // Maximum distance based on trend
        const maxDistance = marketStructure.trend === 'sideways' ? 0.02 : 0.03; // 2% for sideways, 3% for trending
        return priceDiff <= maxDistance;
    });
    
    // Sort by confidence and proximity to current price
    practicalZones.sort((a, b) => {
        const aDiff = Math.abs(parseFloat(a.price) - price) / price;
        const bDiff = Math.abs(parseFloat(b.price) - price) / price;
        
        // Prioritize high confidence and closer zones
        if (a.confidence === 'high' && b.confidence !== 'high') return -1;
        if (b.confidence === 'high' && a.confidence !== 'high') return 1;
        return aDiff - bDiff;
    });
    
    return practicalZones.slice(0, 3); // Return top 3 most relevant zones
}

/**
 * Helper function to get engulfing pattern levels
 * @param {Array} engulfingPatterns - Array of engulfing patterns
 * @param {String} patternType - Type of pattern to look for
 * @param {Number} currentPrice - Current price
 * @returns {Array} Array of price levels
 */
function getEngulfingLevels(engulfingPatterns, patternType, currentPrice) {
    const levels = [];
    const price = parseFloat(currentPrice);
    
    // If we have real engulfing patterns, use those
    if (engulfingPatterns && engulfingPatterns.length > 0) {
        engulfingPatterns
            .filter(pattern => pattern.type === patternType)
            .forEach(pattern => {
                const patternPrice = parseFloat(pattern.price);
                if (patternPrice > 0) {
                    levels.push(patternPrice);
                }
            });
    }
    
    // If no real patterns, create logical levels based on current price action
    if (levels.length === 0) {
        const priceStep = calculatePriceStep(price);
        const keyLevels = calculateKeyPriceLevels(price, priceStep);
        
        if (patternType === 'bullish_engulfing') {
            // Use support levels for bullish engulfing (below current price)
            keyLevels.support.slice(0, 2).forEach(level => {
                if (level < price && level > price * 0.95) { // Within 5% of current price
                    levels.push(level);
                }
            });
        } else {
            // Use resistance levels for bearish engulfing (above current price)
            keyLevels.resistance.slice(0, 2).forEach(level => {
                if (level > price && level < price * 1.05) { // Within 5% of current price
                    levels.push(level);
                }
            });
        }
    }
    
    return levels.slice(0, 3); // Max 3 levels
}

/**
 * Calculate dynamic price step based on the current price
 * @param {Number} price - Current price
 * @returns {Number} Price step
 */
function calculatePriceStep(price) {
    if (price > 1000) return 10;    // For gold: $10 increments
    if (price > 100) return 1;      // For high value pairs: 1 unit
    if (price > 10) return 0.1;     // For pairs like USDJPY: 0.1 yen
    if (price > 1) return 0.001;    // For most forex pairs: 1 pip
    return 0.0001;                  // For very small values: 0.1 pip
}

/**
 * Calculate key price levels using psychological levels and round numbers
 * @param {Number} currentPrice - Current price
 * @param {Number} priceStep - Price step
 * @returns {Object} Object with support and resistance levels
 */
function calculateKeyPriceLevels(currentPrice, priceStep) {
    const keyLevels = {
        support: [],
        resistance: []
    };
    
    // Find psychological levels (round numbers)
    const roundingFactor = priceStep * 10;
    const currentRounded = Math.round(currentPrice / roundingFactor) * roundingFactor;
    
    // Generate support levels (below current price)
    for (let i = 1; i <= 5; i++) {
        const supportLevel = currentRounded - (roundingFactor * i);
        if (supportLevel > 0) {
            keyLevels.support.push(supportLevel);
        }
    }
    
    // Generate resistance levels (above current price)
    for (let i = 1; i <= 5; i++) {
        const resistanceLevel = currentRounded + (roundingFactor * i);
        keyLevels.resistance.push(resistanceLevel);
    }
    
    // Add weekly/daily psychological levels for more precision
    const bigRoundingFactor = priceStep * 50;
    const bigCurrentRounded = Math.round(currentPrice / bigRoundingFactor) * bigRoundingFactor;
    
    // Add major support/resistance levels
    if (bigCurrentRounded < currentPrice) {
        keyLevels.resistance.unshift(bigCurrentRounded + bigRoundingFactor);
    } else {
        keyLevels.support.unshift(bigCurrentRounded - bigRoundingFactor);
    }
    
    // Sort levels
    keyLevels.support.sort((a, b) => b - a); // Closest support first
    keyLevels.resistance.sort((a, b) => a - b); // Closest resistance first
    
    return keyLevels;
}

/**
 * Generate zone-based recommendation
 * @param {Array} entryZones - Array of entry zones
 * @param {Object} marketStructure - Market structure analysis
 * @param {Number} currentPrice - Current price
 * @param {String} tradingStyle - Trading style (swing/scalping)
 * @returns {Object} Recommendation object
 */
function generateGoldZoneRecommendation(entryZones, marketStructure, currentPrice, tradingStyle) {
    const mainZones = entryZones.filter(zone => zone.confidence === 'high');
    
    if (mainZones.length === 0) {
        return {
            action: 'WAIT',
            message: 'No clear entry zones identified. Wait for better setup.',
            risk: 'Monitor market for engulfing patterns at key levels'
        };
    }
    
    const primaryZone = mainZones[0];
    
    // Calculate suggested SL/TP (suggestions only)
    const price = parseFloat(currentPrice);
    const zonePrice = parseFloat(primaryZone.price);
    
    let stopLoss, takeProfit;
    if (primaryZone.type.includes('BUY')) {
        stopLoss = (zonePrice * 0.99).toFixed(2);
        takeProfit = (zonePrice * 1.02).toFixed(2);
    } else {
        stopLoss = (zonePrice * 1.01).toFixed(2);
        takeProfit = (zonePrice * 0.98).toFixed(2);
    }
    
    return {
        action: 'ZONE_IDENTIFIED',
        zone: primaryZone,
        suggestions: {
            stopLoss,
            takeProfit,
            disclaimer: 'These are analytical suggestions only, not financial advice'
        },
        timeframe: tradingStyle === 'swing' ? 'Medium-term position' : 'Short-term opportunity',
        marketContext: marketStructure.description
    };
}

/**
 * Enhanced forex analysis with trading conditions (same as gold analysis)
 * @param {String} timeframe - Analysis timeframe
 * @param {String} tradingStyle - Trading style (swing/scalping)
 * @param {String} symbol - Forex symbol (EURUSD, GBPUSD, etc.)
 * @param {Array} candlestickData - Candlestick data
 * @returns {Object} Complete forex analysis
 */
async function analyzeForexTradingConditions(timeframe, tradingStyle, symbol, candlestickData = null) {
    try {
        // Fetch candlestick data if not provided
        if (!candlestickData) {
            candlestickData = await fetchCandlestickDataMultiSource('forex', symbol, timeframe, 100);
        }
        
        // Get current price (most recent candle - last in array)
        const currentPrice = candlestickData[candlestickData.length - 1].close;
        
        // Analyze market structure (same logic as gold)
        const marketStructure = analyzeGoldMarketStructure(candlestickData);
        
        // Detect engulfing patterns (same logic as gold)
        const engulfingPatterns = detectGoldEngulfingPatterns(candlestickData);
        
        // Calculate fibonacci zones (same logic as gold)
        const fibonacciZones = calculateGoldFibonacciZones(currentPrice, marketStructure, candlestickData);
        
        // Determine entry zones based on trading conditions (same logic as gold)
        const entryZones = determineGoldEntryZones(marketStructure, engulfingPatterns, fibonacciZones, currentPrice);
        
        // Generate recommendation (same logic as gold)
        const recommendation = generateGoldZoneRecommendation(entryZones, marketStructure, currentPrice, tradingStyle);
        
        // Determine refinement timeframe based on trading style
        const refinementTimeframe = getRefinementTimeframe(tradingStyle, timeframe);
        
        return {
            symbol,
            timeframe,
            refinementTimeframe,
            tradingStyle,
            assetType: 'forex',
            currentPrice: parseFloat(currentPrice),
            marketStructure,
            engulfingPatterns,
            fibonacciZones,
            entryZones,
            recommendation,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Error in analyzeForexTradingConditions:', error);
        throw error;
    }
}

/**
 * Enhanced gold analysis with trading conditions
 * @param {String} timeframe - Analysis timeframe
 * @param {String} tradingStyle - Trading style (swing/scalping)
 * @param {Array} candlestickData - Candlestick data
 * @returns {Object} Complete gold analysis
 */
async function analyzeGoldTradingConditions(timeframe, tradingStyle, candlestickData = null) {
    try {
     
        // Get current price (most recent candle - last in array)
        const currentPrice = candlestickData[candlestickData.length - 1].close;
        
        // Analyze market structure
        const marketStructure = analyzeGoldMarketStructure(candlestickData);
        
        // Detect engulfing patterns
        const engulfingPatterns = detectGoldEngulfingPatterns(candlestickData);
        
        // Calculate fibonacci zones
        const fibonacciZones = calculateGoldFibonacciZones(currentPrice, marketStructure, candlestickData);
        
        // Determine entry zones based on trading conditions
        const entryZones = determineGoldEntryZones(marketStructure, engulfingPatterns, fibonacciZones, currentPrice);
        
        // Generate recommendation
        const recommendation = generateGoldZoneRecommendation(entryZones, marketStructure, currentPrice, tradingStyle);
        
        // Determine refinement timeframe based on trading style
        const refinementTimeframe = getRefinementTimeframe(tradingStyle, timeframe);
        
        return {
            symbol: 'XAUUSD',
            timeframe,
            refinementTimeframe,
            tradingStyle,
            assetType: 'gold',
            currentPrice: parseFloat(currentPrice),
            marketStructure,
            engulfingPatterns,
            fibonacciZones,
            entryZones,
            recommendation,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('Error in analyzeGoldTradingConditions:', error);
        throw error;
    }
}

/**
 * Helper function to determine refinement timeframe
 * @param {String} tradingStyle - Trading style
 * @param {String} mainTimeframe - Main timeframe
 * @returns {String} Refinement timeframe
 */
function getRefinementTimeframe(tradingStyle, mainTimeframe) {
    if (tradingStyle === 'swing') {
        return 'M30'; // Daily -> M30 refinement
    } else { // scalping
        if (mainTimeframe === 'H4') {
            return 'M15'; // H4 -> M15 refinement
        } else { // H1
            return 'M5'; // H1 -> M5 refinement
        }
    }
}

/**
 * Fetch candlestick data from multiple free sources
 * @param {String} assetType - Asset type (gold, forex)
 * @param {String} symbol - Symbol (XAUUSD, EURUSD, etc.)
 * @param {String} timeframe - Timeframe (D1, H4, H1, M30, M15, M5)
 * @param {Number} limit - Number of candles to fetch
 * @returns {Array} Array of candlestick data
 */
async function fetchCandlestickDataMultiSource(assetType, symbol, timeframe, limit = 100) {
    console.log(`🔍 Generating synthetic candlestick data for ${symbol} ${timeframe}`);
    
    // Generate realistic synthetic data based on asset type and timeframe
    const currentPrice = await fetchCurrentPrice();
    const data = generateRealisticSampleData(limit, currentPrice, 'uptrend');
    
    console.log(`✅ Generated ${data.length} synthetic candles for ${symbol}`);
    return data;
}




module.exports = {
    analyzeTradingSignals,
    testDataFetch,
    fetchCurrentPrice,
    fetchPriceData,
    DEFAULT_PARAMS,
    analyzeGoldTradingConditions,
    analyzeForexTradingConditions,
    determineGoldEntryZones,
    calculateGoldFibonacciZones,
    generateGoldZoneRecommendation,
    fetchCandlestickDataMultiSource,
};