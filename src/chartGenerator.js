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
        
        // Calculate price range with padding, including entry zones
        const prices = candlestickData.map(c => [c.low, c.high]).flat();
        
    // Include entry zone prices in range calculation (ONLY from analysis)
    const entryZonePrices = analysis.entryZones ? analysis.entryZones.map(z => parseFloat(z.price)) : [];
    const currentPrice = analysis.currentPrice || 3645.3;
    
    // Always include current price and entry zones
    let allPrices = [...prices, currentPrice];
    if (entryZonePrices.length > 0) {
        allPrices = [...allPrices, ...entryZonePrices];
        console.log(`Including entry zone prices in range: ${entryZonePrices.map(p => `$${p.toFixed(2)}`).join(', ')}`);
    }
    
    // Calculate range with more padding to ensure zones are visible
    const minPrice = Math.min(...allPrices) * 0.98; // 2% padding below
    const maxPrice = Math.max(...allPrices) * 1.02; // 2% padding above
    const priceRange = maxPrice - minPrice;
    
    console.log(`Chart price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)}`);
    console.log(`Entry zones from analysis: ${entryZonePrices.map(p => `$${p.toFixed(2)}`).join(', ')}`);
    console.log(`Current price: $${currentPrice}`);
        
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
 * Draw TradingView-style entry zones with the most reliable plotting method
 */
function drawTradingViewEntryZones(ctx, entryZones, chartX, chartY, chartWidth, chartHeight, minPrice, maxPrice) {
    const priceRange = maxPrice - minPrice;
    
    if (!entryZones || entryZones.length === 0) {
        console.log('No entry zones to draw');
        return;
    }
    
    // Debug: Log the entry zones data
    console.log('Entry zones data:', JSON.stringify(entryZones, null, 2));
    
    // Sort zones by price for better visual organization
    const sortedZones = [...entryZones].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    
    // Track drawn zones to avoid overlapping labels
    const drawnZones = [];
    
    sortedZones.forEach((zone, index) => {
        const zonePrice = parseFloat(zone.price);
        
        // Debug logging for zone positioning
        console.log(`Drawing zone: ${zone.type} at $${zonePrice}`);
        console.log(`Chart range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)} (range: $${priceRange.toFixed(2)})`);
        console.log(`Chart area: x=${chartX}, y=${chartY}, w=${chartWidth}, h=${chartHeight}`);
        
        // Calculate Y position with proper price mapping
        // Y = 0 at top of chart, chartHeight at bottom
        // Higher prices should be at lower Y values (top of chart)
        const priceRatio = (zonePrice - minPrice) / priceRange;
        const y = chartY + chartHeight - (priceRatio * chartHeight);
        
        console.log(`Price ratio: ${priceRatio.toFixed(4)}, calculated Y: ${y.toFixed(1)}`);
        
        // Ensure y is within chart bounds
        if (y < chartY || y > chartY + chartHeight) {
            console.log(`Zone y position ${y} outside chart bounds (${chartY} - ${chartY + chartHeight}), skipping`);
            return;
        }
        
        // Determine zone color and style based on type and confidence
        let zoneColor, lineStyle, lineWidth;
        if (zone.type && zone.type.toLowerCase().includes('buy')) {
            zoneColor = '#26a69a'; // Green for buy zones
            lineStyle = [8, 4]; // Dashed line
            lineWidth = zone.confidence === 'high' ? 3 : 2; // Thicker for high confidence
        } else if (zone.type && zone.type.toLowerCase().includes('sell')) {
            zoneColor = '#ef5350'; // Red for sell zones
            lineStyle = [8, 4]; // Dashed line
            lineWidth = zone.confidence === 'high' ? 3 : 2; // Thicker for high confidence
        } else {
            zoneColor = '#787b86'; // Gray for neutral zones
            lineStyle = [4, 4]; // Dotted line
            lineWidth = 1;
        }
        
        // Draw TradingView-style horizontal line with enhanced visibility
        ctx.strokeStyle = zoneColor;
        ctx.lineWidth = lineWidth;
        ctx.setLineDash(lineStyle);
        ctx.beginPath();
        ctx.moveTo(chartX, y);
        ctx.lineTo(chartX + chartWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw zone label with improved positioning to avoid overlaps
        const labelWidth = 110;
        const labelHeight = 24;
        let labelX = chartX + chartWidth - labelWidth - 15;
        let labelY = Math.max(chartY + 5, y - labelHeight - 5);
        
        // Check for overlapping labels and adjust position
        const labelSpacing = 30;
        for (let i = 0; i < drawnZones.length; i++) {
            const drawnZone = drawnZones[i];
            if (Math.abs(drawnZone.y - y) < labelSpacing) {
                labelY = drawnZone.y + labelSpacing;
                break;
            }
        }
        
        // Ensure label stays within chart bounds
        labelY = Math.max(chartY + 5, Math.min(chartY + chartHeight - labelHeight - 5, labelY));
        
        // Label background with enhanced styling
        ctx.fillStyle = zoneColor;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        
        // Add border for better visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
        
        // Label text with better formatting
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`$${zonePrice.toFixed(2)}`, labelX + labelWidth/2, labelY + 16);
        
        // Confidence indicator
        if (zone.confidence === 'high') {
            ctx.fillStyle = '#ffd700';
            ctx.font = '14px Arial';
            ctx.fillText('⭐', labelX + labelWidth - 15, labelY + 16);
        }
        
        // Add zone type indicator
        if (zone.type) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'left';
            const typeText = zone.type.includes('BUY') ? 'BUY' : zone.type.includes('SELL') ? 'SELL' : 'ZONE';
            ctx.fillText(typeText, labelX + 5, labelY + 9);
        }
        
        // Add price level indicator on the right axis
        ctx.fillStyle = zoneColor;
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(zonePrice.toFixed(2), chartX + chartWidth + 10, y + 4);
        
        // Track this zone for overlap detection
        drawnZones.push({ y: labelY, price: zonePrice });
    });
}



module.exports = {
    generateTradingViewChart
};
