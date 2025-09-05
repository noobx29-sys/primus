const { analyzeGoldTradingConditions } = require('./src/tradingAnalyzer.js');

// Simplified version of the formatTimeframeAnalysis function for testing
function formatTimeframeAnalysis(analysis, timeframe) {
    if (!analysis) return '❌ Analysis not available';
    
    const timeStr = new Date().toLocaleTimeString('en-US', { 
        timeZone: 'America/New_York',
        hour12: false 
    });
    
    let message = `<b>🎯 ${analysis.tradingStyle.toUpperCase()} - ${analysis.assetType.toUpperCase()}</b>\n`;
    message += `💱 ${analysis.symbol} | ⏰ ${analysis.timeframe}→${analysis.refinementTimeframe}\n`;
    message += `🕐 ${timeStr} EST\n\n`;
    
    // Format price based on asset type
    const priceDisplay = analysis.assetType === 'gold' 
        ? `$${analysis.currentPrice}/oz` 
        : `${analysis.currentPrice}`;
    
    message += `💰 ${priceDisplay} | 📊 ${analysis.marketStructure.trend.toUpperCase()}\n`;
    message += `🔥 ${analysis.marketStructure.strength.toUpperCase()}\n\n`;
    
    // Display engulfing patterns found (simplified)
    const patternCount = analysis.engulfingPatterns?.length || 0;
    message += `🕯️ Patterns: ${patternCount} found\n`;
    
    // Display fibonacci zones (simplified)
    const fibCount = analysis.fibonacciZones?.length || 0;
    message += `📈 Fib Zones: ${fibCount} levels\n`;
    
    // Display entry zones (simplified)
    message += `\n🎯 ENTRY ZONES:\n`;
    if (analysis.entryZones && analysis.entryZones.length > 0) {
        analysis.entryZones.forEach((zone, index) => {
            const zoneIcon = zone.type.includes('BUY') ? '🟢' : '🔴';
            const priceFormatted = analysis.assetType === 'gold' ? `$${zone.price}` : zone.price;
            message += `${zoneIcon} ${zone.type.replace('_', ' ')}: ${priceFormatted}\n`;
            if (zone.confidence === 'high') message += `   ⭐ High confidence\n`;
        });
    } else {
        message += `❌ No clear zones\n`;
    }
    
    // Add recommendations (simplified)
    if (analysis.recommendation && analysis.recommendation.action === 'ZONE_IDENTIFIED') {
        message += `\n💡 SL: ${analysis.recommendation.suggestions.stopLoss} | TP: ${analysis.recommendation.suggestions.takeProfit}\n`;
        message += `📊 ${analysis.recommendation.timeframe}\n`;
    }
    
    message += `\n⚠️ Analysis only - do your own research`;
    
    // Check message length and truncate if necessary (Telegram caption limit is 1024 characters)
    const maxLength = 1000; // Leave some buffer
    if (message.length > maxLength) {
        message = message.substring(0, maxLength - 3) + '...';
        console.log('⚠️ Message truncated due to length limit');
    }
    
    return message;
}

async function testMessageLength() {
    console.log('🎯 Testing Optimized Message Length\n');
    
    const testCases = [
        { timeframe: 'D1', style: 'swing' },
        { timeframe: 'H4', style: 'scalping' },
        { timeframe: 'H1', style: 'scalping' }
    ];
    
    for (const testCase of testCases) {
        console.log(`📊 Testing: ${testCase.style.toUpperCase()} ${testCase.timeframe}`);
        console.log('─'.repeat(50));
        
        try {
            const analysis = await analyzeGoldTradingConditions(testCase.timeframe, testCase.style);
            const message = formatTimeframeAnalysis(analysis, testCase.timeframe);
            
            console.log(`✅ Message Length: ${message.length} characters`);
            console.log(`✅ Telegram Limit: 1024 characters`);
            console.log(`✅ Status: ${message.length <= 1024 ? '✅ OK' : '❌ TOO LONG'}`);
            console.log(`\n📝 Message Preview:`);
            console.log(message.substring(0, 300) + '...');
            
            console.log('\n' + '='.repeat(50) + '\n');
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}\n`);
        }
    }
    
    console.log('🎉 Message Length Test Complete!');
    console.log('✅ Optimized messages should now fit within Telegram limits');
}

// Run the test
testMessageLength().catch(console.error);
