const { analyzeGoldTradingConditions } = require('./src/tradingAnalyzer.js');

async function testImprovedZones() {
    console.log('🎯 Testing Improved Entry Zone Logic');
    console.log('=====================================');
    
    try {
        const analysis = await analyzeGoldTradingConditions('H1', 'scalping');
        
        console.log('✅ Analysis Results:');
        console.log(`   Current Price: $${analysis.currentPrice}`);
        console.log(`   Trend: ${analysis.marketStructure.trend}`);
        console.log(`   Entry Zones: ${analysis.entryZones.length}`);
        
        if (analysis.entryZones.length > 0) {
            console.log('\n🎯 Entry Zones:');
            analysis.entryZones.forEach((zone, i) => {
                const priceDiff = ((analysis.currentPrice - parseFloat(zone.price)) / analysis.currentPrice * 100).toFixed(2);
                const direction = parseFloat(zone.price) < analysis.currentPrice ? 'BELOW' : 'ABOVE';
                
                console.log(`   ${i+1}. ${zone.type}: $${zone.price}`);
                console.log(`      ${direction} current price by ${priceDiff}%`);
                console.log(`      Reason: ${zone.reason}`);
                console.log(`      Confidence: ${zone.confidence}`);
            });
            
            console.log('\n🎯 Practical Trading:');
            const firstZone = analysis.entryZones[0];
            if (firstZone) {
                const zonePrice = parseFloat(firstZone.price);
                const currentPrice = analysis.currentPrice;
                
                if (zonePrice < currentPrice) {
                    console.log(`   Wait for price to drop to $${firstZone.price} to BUY`);
                    console.log(`   Current: $${currentPrice} → Target: $${firstZone.price}`);
                } else {
                    console.log(`   Wait for price to rise to $${firstZone.price} to BUY`);
                    console.log(`   Current: $${currentPrice} → Target: $${firstZone.price}`);
                }
            }
        } else {
            console.log('\n❌ No entry zones found');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testImprovedZones().catch(console.error);
