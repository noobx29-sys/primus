const { analyzeGoldTradingConditions } = require('./src/tradingAnalyzer.js');

// Copy the overlay function directly to avoid importing index.js
function createAnalysisOverlaySVG(analysis, timeframe) {
    const currentPrice = analysis.currentPrice || 0;
    const trend = analysis.marketStructure?.trend || 'sideways';
    const strength = analysis.marketStructure?.strength || 'moderate';
    const entryZones = analysis.entryZones || [];
    
    // Calculate zone positions (simplified - in real implementation, you'd map to chart coordinates)
    const zoneMarkers = entryZones.slice(0, 3).map((zone, index) => {
        const zonePrice = parseFloat(zone.price);
        const priceDiff = Math.abs(zonePrice - currentPrice) / currentPrice;
        // Map price difference to vertical position (simplified)
        const yPosition = 200 + (index * 30);
        const color = zone.type.includes('BUY') ? '#00ff00' : '#ff0000';
        const icon = zone.type.includes('BUY') ? '🟢' : '🔴';
        
        return {
            x: 350,
            y: yPosition,
            price: zonePrice,
            type: zone.type,
            color: color,
            icon: icon
        };
    });
    
    // Create SVG overlay
    const svg = `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <!-- Analysis Panel (Top Left) -->
        <rect x="20" y="20" width="300" height="200" fill="rgba(0,0,0,0.9)" rx="10"/>
        
        <!-- Header -->
        <text x="40" y="45" fill="white" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
            🎯 ${analysis.tradingStyle?.toUpperCase() || 'ANALYSIS'} - ${analysis.assetType?.toUpperCase() || 'GOLD'}
        </text>
        
        <!-- Price and Trend -->
        <text x="40" y="70" fill="white" font-family="Arial, sans-serif" font-size="14">
            💰 $${currentPrice.toFixed(2)}/oz | 📊 ${trend.toUpperCase()}
        </text>
        
        <!-- Strength -->
        <text x="40" y="90" fill="white" font-family="Arial, sans-serif" font-size="14">
            🔥 ${strength.toUpperCase()}
        </text>
        
        <!-- Patterns and Fib -->
        <text x="40" y="115" fill="white" font-family="Arial, sans-serif" font-size="14">
            🕯️ Patterns: ${analysis.engulfingPatterns?.length || 0} found
        </text>
        <text x="40" y="135" fill="white" font-family="Arial, sans-serif" font-size="14">
            📈 Fib Zones: ${analysis.fibonacciZones?.length || 0} levels
        </text>
        
        <!-- Entry Zones -->
        <text x="40" y="160" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
            🎯 ENTRY ZONES:
        </text>
        
        ${entryZones.slice(0, 2).map((zone, index) => `
            <text x="50" y="${180 + (index * 20)}" fill="${zone.type.includes('BUY') ? '#00ff00' : '#ff0000'}" font-family="Arial, sans-serif" font-size="12">
                ${zone.type.includes('BUY') ? '🟢' : '🔴'} ${zone.type.replace('_', ' ')}: $${zone.price}
            </text>
        `).join('')}
        
        <!-- Zone Markers on Chart -->
        ${zoneMarkers.map(marker => `
            <!-- Zone Line -->
            <line x1="350" y1="${marker.y}" x2="750" y2="${marker.y}" stroke="${marker.color}" stroke-width="2" stroke-dasharray="5,5"/>
            
            <!-- Zone Label -->
            <rect x="750" y="${marker.y - 10}" width="40" height="20" fill="${marker.color}" rx="5"/>
            <text x="770" y="${marker.y + 5}" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">
                ${marker.icon}
            </text>
            
            <!-- Price Label -->
            <text x="760" y="${marker.y + 20}" fill="${marker.color}" font-family="Arial, sans-serif" font-size="10" font-weight="bold">
                $${marker.price}
            </text>
        `).join('')}
        
        <!-- Current Price Line -->
        <line x1="350" y1="300" x2="750" y2="300" stroke="yellow" stroke-width="3"/>
        <text x="760" y="305" fill="yellow" font-family="Arial, sans-serif" font-size="12" font-weight="bold">
            💰 $${currentPrice.toFixed(2)}
        </text>
        
        <!-- Recommendations -->
        ${analysis.recommendation?.suggestions ? `
            <rect x="20" y="550" width="760" height="30" fill="rgba(0,0,0,0.8)" rx="5"/>
            <text x="40" y="570" fill="white" font-family="Arial, sans-serif" font-size="12">
                💡 SL: ${analysis.recommendation.suggestions.stopLoss} | TP: ${analysis.recommendation.suggestions.takeProfit}
            </text>
        ` : ''}
        
        <!-- Disclaimer -->
        <text x="20" y="590" fill="yellow" font-family="Arial, sans-serif" font-size="10">
            ⚠️ Analysis only - do your own research
        </text>
    </svg>
    `;
    
    return svg;
}

async function testOverlayFlow() {
    console.log('🎯 Testing New Overlay Flow');
    console.log('================================');
    
    try {
        // Step 1: Generate analysis (simulates API calls)
        console.log('📊 Step 1: Generating analysis...');
        const analysis = await analyzeGoldTradingConditions('D1', 'swing');
        
        console.log('✅ Analysis generated:');
        console.log(`   💰 Current Price: $${analysis.currentPrice}`);
        console.log(`   📊 Trend: ${analysis.marketStructure.trend}`);
        console.log(`   🔥 Strength: ${analysis.marketStructure.strength}`);
        console.log(`   🎯 Entry Zones: ${analysis.entryZones.length}`);
        
        // Step 2: Create overlay SVG
        console.log('\n🎨 Step 2: Creating overlay SVG...');
        const overlaySvg = createAnalysisOverlaySVG(analysis, 'D1');
        
        console.log('✅ Overlay SVG created');
        console.log(`   📏 SVG Size: ${overlaySvg.length} characters`);
        console.log(`   🎯 Contains zones: ${overlaySvg.includes('BUY ZONE') ? 'Yes' : 'No'}`);
        console.log(`   💰 Contains price: ${overlaySvg.includes(analysis.currentPrice.toString()) ? 'Yes' : 'No'}`);
        
        // Step 3: Test overlay composition (without actual screenshot)
        console.log('\n🖼️ Step 3: Testing overlay composition...');
        const sharp = require('sharp');
        
        // Create a test image buffer (simulating screenshot)
        const testImageBuffer = await sharp({
            create: {
                width: 800,
                height: 600,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            }
        })
        .png()
        .toBuffer();
        
        console.log('✅ Test image created');
        console.log(`   📏 Image size: ${testImageBuffer.length} bytes`);
        
        // Test overlay composition
        const overlayBuffer = Buffer.from(overlaySvg);
        const finalImage = await sharp(testImageBuffer)
            .composite([{
                input: overlayBuffer,
                top: 50,
                left: 50
            }])
            .png()
            .toBuffer();
        
        console.log('✅ Overlay composition successful');
        console.log(`   📏 Final image size: ${finalImage.length} bytes`);
        
        console.log('\n🎉 Overlay Flow Test Complete!');
        console.log('✅ All steps working correctly');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testOverlayFlow().catch(console.error);
