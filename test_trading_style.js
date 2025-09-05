const { analyzeGoldTradingConditions } = require('./src/tradingAnalyzer.js');

async function testTradingStyle() {
    console.log('🎯 Testing Trading Style Debug');
    console.log('================================');
    
    try {
        // Test 1: Scalping style
        console.log('📊 Test 1: Scalping style (H4)');
        const scalpingAnalysis = await analyzeGoldTradingConditions('H4', 'scalping');
        
        console.log('✅ Scalping Analysis:');
        console.log(`   Trading Style: "${scalpingAnalysis.tradingStyle}"`);
        console.log(`   Timeframe: ${scalpingAnalysis.timeframe}`);
        console.log(`   Refinement: ${scalpingAnalysis.refinementTimeframe}`);
        console.log(`   Current Price: $${scalpingAnalysis.currentPrice}`);
        console.log(`   Entry Zones: ${scalpingAnalysis.entryZones.length}`);
        
        // Test 2: Swing style
        console.log('\n📊 Test 2: Swing style (D1)');
        const swingAnalysis = await analyzeGoldTradingConditions('D1', 'swing');
        
        console.log('✅ Swing Analysis:');
        console.log(`   Trading Style: "${swingAnalysis.tradingStyle}"`);
        console.log(`   Timeframe: ${swingAnalysis.timeframe}`);
        console.log(`   Refinement: ${swingAnalysis.refinementTimeframe}`);
        console.log(`   Current Price: $${swingAnalysis.currentPrice}`);
        console.log(`   Entry Zones: ${swingAnalysis.entryZones.length}`);
        
        console.log('\n🎉 Trading Style Test Complete!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testTradingStyle().catch(console.error);
