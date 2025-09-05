const { createCanvas } = require('canvas');
const fs = require('fs');

/**
 * Generate a TradingView-like chart with precise zone positioning
 * @param {Array} candlestickData - Candlestick data
 * @param {Object} analysis - Analysis data with entry zones
 * @param {String} timeframe - Timeframe
 * @returns {Buffer} Chart image buffer
 */
async function generateTradingViewChart(candlestickData, analysis, timeframe) {
    try {
        const canvas = createCanvas(1200, 800);
        const ctx = canvas.getContext('2d');
        
        // Set TradingView-like background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1200, 800);
        
        // Chart dimensions (TradingView proportions)
        const chartWidth = 1000;
        const chartHeight = 500;
        const chartX = 80;
        const chartY = 100;
        
        // Calculate price range with padding
        const prices = candlestickData.map(c => [c.low, c.high]).flat();
        const minPrice = Math.min(...prices) * 0.995; // 0.5% padding
        const maxPrice = Math.max(...prices) * 1.005; // 0.5% padding
        const priceRange = maxPrice - minPrice;
        
                // Draw TradingView-style header (simplified)
        drawTradingViewHeader(ctx, analysis, timeframe);
        
        // Draw chart background with grid
        drawChartBackground(ctx, chartX, chartY, chartWidth, chartHeight);
        
        // Draw TradingView-style price scale
        drawTradingViewPriceScale(ctx, chartX, chartY, chartHeight, minPrice, maxPrice);
        
        // Draw TradingView-style candlesticks
        drawTradingViewCandlesticks(ctx, candlestickData, chartX, chartY, chartWidth, chartHeight, minPrice, maxPrice);
        
        // Draw entry zones with TradingView styling
        drawTradingViewEntryZones(ctx, analysis.entryZones, chartX, chartY, chartWidth, chartHeight, minPrice, maxPrice);
        
        // Draw TradingView footer
        drawTradingViewFooter(ctx);
    
    // Convert to buffer
    return canvas.toBuffer('image/png');
        
    } catch (error) {
        console.error('Error generating chart:', error);
        throw error;
    }
}

/**
 * Draw TradingView-style footer
 */
function drawTradingViewFooter(ctx) {
    // Footer background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 750, 1200, 50);
    
    // TradingView logo
    ctx.fillStyle = '#2962ff';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TradingView', 20, 775);
    
    // SL/TP info
    ctx.fillStyle = '#787b86';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('SL: 3501.02 | TP: 3607.11', 200, 775);
    
    // Volume info
    ctx.fillText('23.26 K', 1100, 775);
}

/**
 * Draw TradingView-style header (simplified)
 */
function drawTradingViewHeader(ctx, analysis, timeframe) {
    // Header background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, 1200, 60);
    
    // Asset name and timeframe
    ctx.fillStyle = '#131722';
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${analysis.assetType?.toUpperCase() || 'GOLD'} Spot / U.S. Dollar ${timeframe} • OANDA`, 20, 25);
    
    // Current price data (OHLC)
    const currentPrice = analysis.currentPrice || 0;
    const change = 0.675; // Mock change
    const changePercent = 0.02; // Mock percentage
    
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`O${(currentPrice - 1).toFixed(3)} H${(currentPrice + 2).toFixed(3)} L${(currentPrice - 3).toFixed(3)} C${currentPrice.toFixed(3)} +${change.toFixed(3)} (+${changePercent.toFixed(2)}%)`, 20, 45);
}

/**
 * Draw chart background with TradingView-style grid
 */
function drawChartBackground(ctx, chartX, chartY, chartWidth, chartHeight) {
    // Chart border
    ctx.strokeStyle = '#e1e3e6';
    ctx.lineWidth = 1;
    ctx.strokeRect(chartX, chartY, chartWidth, chartHeight);
    
    // Grid lines
    ctx.strokeStyle = '#f0f3fa';
    ctx.lineWidth = 0.5;
    
    // Vertical grid lines (time)
    for (let i = 0; i <= 10; i++) {
        const x = chartX + (i * chartWidth / 10);
        ctx.beginPath();
        ctx.moveTo(x, chartY);
        ctx.lineTo(x, chartY + chartHeight);
        ctx.stroke();
    }
    
    // Horizontal grid lines (price)
    for (let i = 0; i <= 8; i++) {
        const y = chartY + (i * chartHeight / 8);
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
    }
}

/**
 * Draw TradingView-style price scale
 */
function drawTradingViewPriceScale(ctx, chartX, chartY, chartHeight, minPrice, maxPrice) {
    ctx.fillStyle = '#787b86';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    
    const priceStep = (maxPrice - minPrice) / 8;
    for (let i = 0; i <= 8; i++) {
        const price = minPrice + (priceStep * i);
        const y = chartY + chartHeight - (i * chartHeight / 8);
        
        ctx.fillText(price.toFixed(2), chartX + 1020, y + 4);
    }
}

/**
 * Draw TradingView-style candlesticks
 */
function drawTradingViewCandlesticks(ctx, candlestickData, chartX, chartY, chartWidth, chartHeight, minPrice, maxPrice) {
    const candleWidth = Math.max(2, chartWidth / candlestickData.length);
    const priceRange = maxPrice - minPrice;
    
    candlestickData.forEach((candle, index) => {
        const x = chartX + (index * candleWidth);
        const openY = chartY + chartHeight - ((candle.open - minPrice) / priceRange * chartHeight);
        const closeY = chartY + chartHeight - ((candle.close - minPrice) / priceRange * chartHeight);
        const highY = chartY + chartHeight - ((candle.high - minPrice) / priceRange * chartHeight);
        const lowY = chartY + chartHeight - ((candle.low - minPrice) / priceRange * chartHeight);
        
        // Determine candle color (TradingView colors)
        const isGreen = candle.close >= candle.open;
        const bodyColor = isGreen ? '#26a69a' : '#ef5350';
        const wickColor = isGreen ? '#26a69a' : '#ef5350';
        
        // Draw wick (thinner)
        ctx.strokeStyle = wickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + candleWidth/2, highY);
        ctx.lineTo(x + candleWidth/2, lowY);
        ctx.stroke();
        
        // Draw body (TradingView style)
        const bodyHeight = Math.max(1, Math.abs(closeY - openY));
        const bodyY = isGreen ? closeY : openY;
        
        // Body with border
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x + 1, bodyY, candleWidth - 2, bodyHeight);
        
        // Add subtle border for better definition
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 1, bodyY, candleWidth - 2, bodyHeight);
    });
}

/**
 * Draw TradingView-style entry zones
 */
function drawTradingViewEntryZones(ctx, entryZones, chartX, chartY, chartWidth, chartHeight, minPrice, maxPrice) {
    const priceRange = maxPrice - minPrice;
    
    entryZones.forEach((zone, index) => {
        const zonePrice = parseFloat(zone.price);
        const y = chartY + chartHeight - ((zonePrice - minPrice) / priceRange * chartHeight);
        
        // Draw TradingView-style horizontal line
        ctx.strokeStyle = zone.type.includes('BUY') ? '#26a69a' : '#ef5350';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw TradingView-style zone label
        const labelWidth = 120;
        const labelHeight = 25;
        const labelX = chartX + chartWidth - labelWidth - 10;
        const labelY = y - labelHeight - 5;
        
        // Label background
        ctx.fillStyle = zone.type.includes('BUY') ? '#26a69a' : '#ef5350';
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        
        // Label text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`$${zonePrice}`, labelX + labelWidth/2, labelY + 17);
        
        // Confidence indicator
        if (zone.confidence === 'high') {
            ctx.fillStyle = '#ffd700';
            ctx.fillText('⭐', labelX + labelWidth - 15, labelY + 17);
        }
    });
}



module.exports = {
    generateTradingViewChart
};
