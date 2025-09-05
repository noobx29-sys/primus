const { createAnalysisOverlaySVG } = require('./src/index.js');

// Test zone positioning logic
function testZonePositioning() {
    console.log('🎯 Testing Zone Positioning Logic');
    console.log('================================');
    
    // Mock analysis data
    const analysis = {
        tradingStyle: 'scalping',
        assetType: 'gold',
        currentPrice: 3555.94,
        marketStructure: {
            trend: 'uptrend',
            strength: 'strong'
        },
        entryZones: [
            {
                type: 'BUY_ZONE',
                price: '3538.16',
                reason: 'Recent bullish engulfing - HH/HL structure',
                confidence: 'high'
            },
            {
                type: 'BUY_ZONE', 
                price: '3520.38',
                reason: 'Fibonacci 61.8% retracement level',
                confidence: 'medium'
            }
        ]
    };
    
    console.log('📊 Test Data:');
    console.log(`   Current Price: $${analysis.currentPrice}`);
    console.log(`   Zone 1: $${analysis.entryZones[0].price} (${analysis.entryZones[0].confidence})`);
    console.log(`   Zone 2: $${analysis.entryZones[1].price} (${analysis.entryZones[1].confidence})`);
    
    // Calculate expected positions
    const currentPrice = analysis.currentPrice;
    const minPrice = currentPrice * 0.98; // 2% below current
    const maxPrice = currentPrice * 1.02; // 2% above current
    const priceRange = maxPrice - minPrice;
    
    console.log('\n📏 Price Range Calculation:');
    console.log(`   Min Price: $${minPrice.toFixed(2)}`);
    console.log(`   Max Price: $${maxPrice.toFixed(2)}`);
    console.log(`   Price Range: $${priceRange.toFixed(2)}`);
    
    // Calculate zone positions
    analysis.entryZones.forEach((zone, index) => {
        const zonePrice = parseFloat(zone.price);
        const priceDiff = zonePrice - minPrice;
        const yRatio = priceDiff / priceRange;
        const yPosition = 600 - (yRatio * 500);
        
        console.log(`\n🎯 Zone ${index + 1} Positioning:`);
        console.log(`   Price: $${zonePrice}`);
        console.log(`   Price Diff from Min: $${priceDiff.toFixed(2)}`);
        console.log(`   Y Ratio: ${yRatio.toFixed(3)}`);
        console.log(`   Y Position: ${yPosition.toFixed(1)}px`);
        console.log(`   Expected Chart Position: ${yPosition < 300 ? 'ABOVE' : 'BELOW'} current price`);
        
        // Verify positioning makes sense
        const isAboveCurrent = zonePrice > currentPrice;
        const isBelowCurrent = zonePrice < currentPrice;
        const positionCorrect = (isBelowCurrent && yPosition > 300) || (isAboveCurrent && yPosition < 300);
        
        console.log(`   ✅ Position Correct: ${positionCorrect ? 'YES' : 'NO'}`);
    });
    
    // Generate SVG to check
    console.log('\n🎨 Generating SVG overlay...');
    const svg = createAnalysisOverlaySVG(analysis, 'H4');
    console.log(`   SVG Length: ${svg.length} characters`);
    console.log(`   Contains zone markers: ${svg.includes('3520.38') ? 'YES' : 'NO'}`);
    console.log(`   Contains zone markers: ${svg.includes('3538.16') ? 'YES' : 'NO'}`);
    
    console.log('\n🎉 Zone Positioning Test Complete!');
}

// Run the test
testZonePositioning();
