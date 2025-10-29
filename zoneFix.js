// Quick fix for zone extraction - add this to the beginning of extractEntryZonesFromAnalysis function

function extractStructuredZones(analysisText) {
    const zones = [];
    const lines = analysisText.split('\n');
    let currentZone = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for **Level**: price pattern
        const levelMatch = line.match(/\*\*Level\*\*:\s*(\d{1,4}[,.]?\d{3}(?:\.\d{1,3})?)/i);
        if (levelMatch) {
            currentZone.price = parseFloat(levelMatch[1].replace(/[,']/g, ''));
        }

        // Look for **Zone Type**: BUY/SELL pattern
        const zoneTypeMatch = line.match(/\*\*Zone Type\*\*:\s*(BUY|SELL|BREAKOUT)/i);
        if (zoneTypeMatch) {
            currentZone.type = zoneTypeMatch[1].toLowerCase();
        }

        // Look for **Confidence Level**: HIGH/MEDIUM/LOW pattern
        const confidenceMatch = line.match(/\*\*Confidence Level\*\*:\s*(HIGH|MEDIUM|LOW)/i);
        if (confidenceMatch) {
            currentZone.confidence = confidenceMatch[1].toLowerCase();

            // We have a complete zone, add it
            if (currentZone.price && currentZone.type) {
                if (currentZone.price >= 2000 && currentZone.price <= 5000) {
                    zones.push({
                        type: currentZone.type === 'sell' ? 'SELL Zone' : 'BUY Zone',
                        price: currentZone.price.toFixed(2),
                        confidence: currentZone.confidence,
                        zone_type: currentZone.type === 'sell' ? 'supply' : 'demand',
                        touches: 3
                    });
                    console.log(`✅ Extracted structured zone: ${currentZone.type.toUpperCase()} at $${currentZone.price} (${currentZone.confidence} confidence)`);
                }
            }
            currentZone = {}; // Reset for next zone
        }
    }

    return zones;
}

// Test with the new inline format from latest logs
const inlineTestAnalysis = `
1. **Primary Support Zone:**
   - **BUY $3779.00** - **HIGH Confidence**
     - Reason: Strong historical support, multiple bounces.

2. **Primary Resistance Zone:**
   - **SELL $3839.00** - **HIGH Confidence**
     - Reason: Strong historical resistance, multiple rejections.

3. **Fibonacci Pullback Zone:**
   - **BUY $3794.00** - **MEDIUM Confidence**
`;

function extractInlineZones(analysisText) {
    const zones = [];
    const lines = analysisText.split('\n');

    lines.forEach(line => {
        const trimmedLine = line.trim();

        // Match pattern: **BUY $3779.00** - **HIGH Confidence** or **BUY $3780.00 - HIGH**
        const inlineMatch = trimmedLine.match(/\*\*(BUY|SELL|BREAKOUT)\s+\$(\d{1,4}[,.]?\d{3}(?:\.\d{1,3})?)\*\*\s*-\s*\*\*(HIGH|MEDIUM|LOW)(?:\s+Confidence)?\*\*/i) ||
                           trimmedLine.match(/\*\*(BUY|SELL|BREAKOUT)\s+\$(\d{1,4}[,.]?\d{3}(?:\.\d{1,3})?)\s*-\s*(HIGH|MEDIUM|LOW)\*\*/i);
        if (inlineMatch) {
            const type = inlineMatch[1].toLowerCase();
            const price = parseFloat(inlineMatch[2].replace(/[,']/g, ''));
            const confidence = inlineMatch[3].toLowerCase();

            if (price >= 2000 && price <= 5000) {
                zones.push({
                    type: type === 'sell' ? 'SELL Zone' : 'BUY Zone',
                    price: price.toFixed(2),
                    confidence: confidence,
                    zone_type: type === 'sell' ? 'supply' : 'demand',
                    touches: 3
                });
                console.log(`✅ Extracted inline zone: ${type.toUpperCase()} at $${price} (${confidence} confidence)`);
            }
        }
    });

    return zones;
}

// Test with the original structured format
const testAnalysis = `
### Current Price Context
- **Current Price**: Approximately 3815.530

### Zone Identification

1. **Primary Support Zone**
   - **Level**: 3780.000
   - **Zone Type**: BUY
   - **Confidence Level**: HIGH

2. **Primary Resistance Zone**
   - **Level**: 3840.000
   - **Zone Type**: SELL
   - **Confidence Level**: HIGH

3. **Breakout Zone**
   - **Level**: 3820.000
   - **Zone Type**: BREAKOUT
   - **Confidence Level**: MEDIUM

4. **Fibonacci Retracement Level**
   - **Level**: 3805.000
   - **Zone Type**: BUY
   - **Confidence Level**: LOW
`;

console.log('Testing structured zone extraction:');
const testZones = extractStructuredZones(testAnalysis);
console.log('Structured zones:', JSON.stringify(testZones, null, 2));

console.log('\nTesting inline zone extraction:');
const inlineZones = extractInlineZones(inlineTestAnalysis);
console.log('Inline zones:', JSON.stringify(inlineZones, null, 2));

module.exports = { extractStructuredZones, extractInlineZones };