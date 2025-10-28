# 🤖 AI Trading Analyzer

**Fully automated AI trading analysis tool with Swing and Scalping strategies for Gold (XAUUSD) and Forex pairs using Puppeteer + GPT Vision**

## 🎯 Features

- **Multi-Strategy Analysis**: Swing Trading (Daily + M30) and Scalping (15min + 5min)
- **Automated Chart Capture**: Puppeteer-based TradingView screenshot automation
- **AI-Powered Analysis**: GPT-4 Vision for intelligent chart pattern recognition
- **Strict SOP Compliance**: Follows exact trading SOPs for consistent signals
- **Shadow-to-Shadow Zone Marking**: Precise zone drawing like professional traders
- **Auto-Recovery**: Built-in retry mechanisms and fault tolerance
- **Self-Testing**: Comprehensive test suite validates all components
- **Multi-Pair Support**: Analyze Gold (XAUUSD) and all major Forex pairs

## 📁 Project Structure

```
ai-trading-analyzer/
├── src/
│   ├── core/              # Core orchestration
│   │   ├── chartCapture.js       # Puppeteer chart screenshots
│   │   └── strategyOrchestrator.js # Main analysis coordinator
│   ├── ai/                # AI analysis
│   │   └── gptVision.js          # GPT-4 Vision integration
│   ├── sop/               # Strategy SOPs
│   │   ├── swingSignal.js        # Swing trading SOP
│   │   └── scalpingSignal.js     # Scalping SOP
│   ├── draw/              # Zone drawing
│   │   └── zoneDrawer.js         # Chart annotation engine
│   ├── utils/             # Utilities
│   │   ├── config.js             # Configuration loader
│   │   ├── logger.js             # Logging system
│   │   └── retry.js              # Retry mechanisms
│   ├── tests/             # Testing suite
│   │   ├── runTests.js           # Test runner
│   │   └── validator.js          # Output validator
│   └── index.js           # Main entry point
├── output/                # Generated charts with zones
├── reports/               # JSON analysis reports
├── logs/                  # Execution logs
├── .env                   # Configuration (create from .env.example)
├── .env.example           # Example configuration
├── package.json           # Dependencies
└── README.md              # This file
```

## 🚀 Quick Start

### 1. Installation

```bash
cd ai-trading-analyzer
npm install
```

### 2. Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Required
OPENAI_API_KEY=your_openai_api_key_here

# Optional (for TradingView login)
TRADINGVIEW_USERNAME=your_username
TRADINGVIEW_PASSWORD=your_password

# Trading pairs (comma-separated)
TRADING_PAIRS=XAUUSD,EURUSD,GBPUSD,USDJPY,AUDUSD

# Active strategies (comma-separated)
ACTIVE_STRATEGIES=swing,scalping
```

### 3. Run Analysis

```bash
# Analyze all pairs with all strategies
npm start

# Or use specific commands
node src/index.js --all
```

## 📊 Usage Examples

### Analyze All Pairs and Strategies
```bash
npm start
# or
node src/index.js --all
```

### Analyze Specific Pair
```bash
node src/index.js --pair XAUUSD
```

### Analyze with Specific Strategy
```bash
node src/index.js --strategy swing
node src/index.js --strategy scalping
```

### Analyze Single Pair + Strategy
```bash
node src/index.js --single EURUSD scalping
```

## 🧪 Testing

### Run All Tests
```bash
npm test
# or
npm run test-all
```

### Run Strategy-Specific Tests
```bash
npm run test-swing
npm run test-scalping
```

### Validate Outputs
```bash
npm run validate
```

## 📋 Strategy SOPs

### Swing Signal SOP

**Timeframes**: Daily (1D) + M30 (30-minute)

**Steps**:
1. **Daily Timeframe**
   - Identify trend (uptrend/downtrend/sideways)
   - Locate support/resistance zones
   - Find bullish/bearish engulfing patterns
   - Mark zone "shadow to shadow"

2. **M30 Timeframe**
   - Confirm with smaller engulfing inside Daily zone
   - Validate entry timing
   - Mark precise entry zone

**Output**: Buy/Sell signal with confidence score

### Scalping Signal SOP

**Timeframes**: 15-minute + 5-minute

**Steps**:
1. **15-Minute Timeframe**
   - Identify micro trend and momentum
   - Find immediate support/resistance
   - Look for quick reversal patterns or breakouts
   - Mark tight zones

2. **5-Minute Timeframe**
   - Confirm entry with 5-min pattern
   - Validate timing (immediate/wait/expired)
   - Mark precise entry zone

**Output**: Quick entry signal with tight stop-loss zones

## 🎨 Output Examples

### Generated Files

**Screenshots with Zones**:
```
output/XAUUSD_swing_1D_1696723456789.png
output/XAUUSD_swing_30_1696723456790.png
output/EURUSD_scalping_15_1696723456791.png
output/EURUSD_scalping_5_1696723456792.png
```

**Analysis Reports**:
```json
{
  "strategy": "Swing Signal",
  "pair": "XAUUSD",
  "valid": true,
  "signal": "sell",
  "trend": "downtrend",
  "pattern": "bearish_engulfing",
  "daily_zone": {
    "type": "resistance",
    "price_high": 2650.50,
    "price_low": 2645.20,
    "coordinates": { "x1": 850, "y1": 120, "x2": 920, "y2": 180 }
  },
  "m30_zone": {
    "coordinates": { "x1": 880, "y1": 140, "x2": 900, "y2": 160 }
  },
  "confidence": 0.92,
  "timestamp": "2025-10-07T00:45:26.000Z"
}
```

## 🔧 Configuration Options

### Chart Settings
```env
CHART_WIDTH=1920              # Screenshot width
CHART_HEIGHT=1080             # Screenshot height
CHART_LOAD_WAIT=5000          # Wait time for chart load (ms)
SCREENSHOT_QUALITY=95         # Image quality (0-100)
```

### Strategy Settings
```env
# Swing
SWING_DAILY_TIMEFRAME=1D
SWING_ENTRY_TIMEFRAME=30
SWING_CONFIDENCE_THRESHOLD=0.75

# Scalping
SCALPING_PRIMARY_TIMEFRAME=15
SCALPING_ENTRY_TIMEFRAME=5
SCALPING_CONFIDENCE_THRESHOLD=0.80
```

### Zone Drawing
```env
BUY_ZONE_COLOR=#0066FF        # Blue for buy zones
SELL_ZONE_COLOR=#FF0033       # Red for sell zones
ZONE_OPACITY=0.3              # Zone transparency
ZONE_BORDER_WIDTH=2           # Border thickness
```

### Retry & Recovery
```env
MAX_RETRIES=3                 # Max retry attempts
RETRY_DELAY=2000              # Delay between retries (ms)
AUTO_RECOVERY=true            # Enable auto-recovery
```

## 🛠️ Troubleshooting

### Puppeteer Issues
```bash
# Install Chromium dependencies (Linux)
sudo apt-get install -y \
  chromium-browser \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libnss3 \
  libcups2 \
  libxss1 \
  libxrandr2 \
  libasound2 \
  libatk1.0-0 \
  libgtk-3-0
```

### Canvas/Sharp Issues
```bash
# Rebuild native dependencies
npm rebuild sharp
npm rebuild canvas
```

### OpenAI API Issues
- Verify API key is correct in `.env`
- Check API quota and billing
- Ensure `gpt-4o` or `gpt-4-vision-preview` model access

### Chart Capture Issues
- Increase `CHART_LOAD_WAIT` if charts not loading
- Check TradingView URL format
- Verify network connectivity

## 📈 Performance

- **Analysis Time**: ~30-60 seconds per pair per strategy
- **GPT-4 Vision Calls**: 2 per strategy (primary + entry timeframe)
- **Screenshot Size**: ~50-200KB per chart
- **Memory Usage**: ~500MB-1GB during analysis

## 🔒 Security

- API keys stored in `.env` (gitignored)
- No hardcoded credentials
- Secure Puppeteer sandbox mode
- Local file storage only

## 🤝 Integration with Existing Bot

This analyzer can be integrated with your existing Trading Genie bot:

```javascript
// In your bot code
import StrategyOrchestrator from './ai-trading-analyzer/src/core/strategyOrchestrator.js';

const orchestrator = new StrategyOrchestrator();

// Analyze on demand
bot.onText(/\/analyze (.+)/, async (msg, match) => {
  const pair = match[1];
  const result = await orchestrator.analyzePair(pair, 'swing');
  
  // Send result to user
  bot.sendMessage(msg.chat.id, `
    Signal: ${result.signal}
    Confidence: ${(result.confidence * 100).toFixed(1)}%
  `);
});
```

## 📝 Logs

Logs are stored in `logs/` directory:
- `combined.log` - All logs
- `error.log` - Error logs only

View logs:
```bash
tail -f logs/combined.log
```

## 🧩 Dependencies

- **puppeteer**: Browser automation for chart capture
- **sharp**: High-performance image processing
- **canvas**: Drawing zones on charts
- **openai**: GPT-4 Vision API integration
- **dotenv**: Environment configuration
- **winston**: Logging framework
- **p-retry**: Retry mechanisms

## 📄 License

MIT License - Free to use and modify

## 🙏 Credits

Built for Firaz's Trading Systems
- Swing Signal SOP implementation
- Scalping Signal SOP implementation
- Shadow-to-shadow zone marking methodology

## 📞 Support

For issues or questions:
1. Check logs in `logs/` directory
2. Run validation: `npm run validate`
3. Run tests: `npm test`
4. Review configuration in `.env`

---

**Happy Trading! 📊💰**
