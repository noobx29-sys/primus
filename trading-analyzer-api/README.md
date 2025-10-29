# Trading Analyzer - API Version

A complete rewrite of the trading analysis system that uses **TwelveData API** to fetch market data instead of taking screenshots. The system follows the same proven SOP (Standard Operating Procedures) for Swing and Scalping strategies, but feeds structured market data to AI for analysis, then generates professional candlestick charts with zones.

## Key Differences from Original

| Feature | Original (ai-trading-analyzer) | This Version (trading-analyzer-api) |
|---------|-------------------------------|-------------------------------------|
| Data Source | TradingView screenshots | TwelveData API (REST) |
| Analysis Input | Chart images | Structured OHLCV + indicators |
| Chart Generation | Screenshot + overlay | Programmatic generation (Canvas) |
| Speed | Slower (browser automation) | Faster (direct API calls) |
| Cost | Free | API costs (free tier: 800 calls/day) |
| Assets | Forex + Gold | Forex only (free tier) |

## Features

✅ **API-Based Data Fetching** - Uses TwelveData API for real-time and historical data  
✅ **Same SOP Logic** - Implements identical Swing and Scalping strategies  
✅ **AI Analysis** - GPT analyzes structured market data with context  
✅ **Automatic Chart Generation** - Creates candlestick charts with zones  
✅ **Smart Pattern Detection** - Identifies engulfing patterns, pin bars, etc.  
✅ **Support/Resistance Detection** - Automatically finds key levels  
✅ **Rate Limiting** - Respects API limits (8 calls/min free tier)  
✅ **JSON Reports** - Detailed analysis reports saved for each run  
✅ **Telegram Bot** - Interactive bot interface for easy analysis on-the-go  

## Project Structure

```
trading-analyzer-api/
├── src/
│   ├── api/
│   │   ├── twelveDataClient.js    # TwelveData API client
│   │   └── dataFormatter.js        # Formats OHLCV data for AI
│   ├── ai/
│   │   └── gptAnalyzer.js          # OpenAI GPT analysis
│   ├── sop/
│   │   ├── swingSignal.js          # Swing trading SOP
│   │   └── scalpingSignal.js       # Scalping SOP
│   ├── charts/
│   │   └── chartGenerator.js       # Canvas-based chart generation
│   ├── core/
│   │   └── orchestrator.js         # Main orchestrator
│   ├── bot/
│   │   └── telegramBot.js          # Telegram bot interface
│   ├── utils/
│   │   ├── config.js               # Configuration
│   │   ├── logger.js               # Logging utility
│   │   └── pips.js                 # Pip calculations
│   ├── index.js                    # Main entry point
│   └── test.js                     # Test script
├── output/                         # Generated charts
├── reports/                        # Analysis reports (JSON)
├── package.json
├── .env.example
└── README.md
```

## Setup Instructions

### 1. Prerequisites

- Node.js 16+ installed
- TwelveData API key (free tier available)
- OpenAI API key

### 2. Installation

```bash
cd trading-analyzer-api
npm install
```

### 3. Configuration

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` and add your API keys:

```env
# TwelveData API Key (Free tier: 800 API calls/day)
# Get your API key from: https://twelvedata.com/
TWELVEDATA_API_KEY=your_twelvedata_api_key_here

# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Model selection
OPENAI_MODEL=gpt-4o-mini
```

### 4. Get API Keys

#### TwelveData API Key (Required)
1. Go to https://twelvedata.com/
2. Sign up for a free account
3. Copy your API key from the dashboard
4. Free tier includes:
   - 800 API calls per day
   - ~8 calls per minute
   - Major forex pairs supported

#### OpenAI API Key (Required)
1. Go to https://platform.openai.com/
2. Sign up or log in
3. Navigate to API keys section
4. Create a new API key
5. Copy and save it securely

## Usage

### Analyze All Configured Pairs

Analyzes all pairs in `config.js` with all active strategies:

```bash
npm start
```

### Analyze Specific Pair

```bash
node src/index.js EUR/USD swing
node src/index.js GBP/USD scalping
```

### Run Tests

Quick test to validate setup:

```bash
npm test
```

## Available Pairs (Free Tier)

- EUR/USD
- GBP/USD
- USD/JPY
- AUD/USD
- USD/CAD
- NZD/USD

## Available Strategies

### 1. Swing Trading

**Timeframes:** Daily + 30-minute  
**Patterns:** Bullish/Bearish Engulfing  

**SOP:**
1. Analyze Daily chart for overall trend
2. Identify support/resistance zones
3. Find engulfing patterns at key levels
4. Confirm with M30 engulfing inside Daily zone
5. Generate actionable signal with zones

**Example:**
```bash
node src/index.js EUR/USD swing
```

### 2. Scalping

**Timeframes:** 15-minute + 5-minute  
**Patterns:** Engulfing, Pin Bars, Inside Bars  

**SOP:**
1. Analyze 15-min chart for micro trend
2. Identify immediate support/resistance
3. Find scalping patterns (reversals/breakouts)
4. Confirm with 5-min pattern inside 15-min zone
5. Generate quick entry signal

**Example:**
```bash
node src/index.js GBP/USD scalping
```

## Configuration

Edit `src/utils/config.js` to customize:

```javascript
// Trading pairs
tradingPairs: [
  'EUR/USD',
  'GBP/USD',
  // Add more pairs...
],

// Active strategies
activeStrategies: ['swing', 'scalping'],

// Swing strategy settings
swing: {
  dailyTimeframe: '1day',
  entryTimeframe: '30min',
  dailyBars: 200,
  entryBars: 300,
  confidenceThreshold: 0.6
},

// Scalping strategy settings
scalping: {
  primaryTimeframe: '15min',
  entryTimeframe: '5min',
  primaryBars: 200,
  entryBars: 300,
  confidenceThreshold: 0.65
},

// Zone settings
zones: {
  minPips: 10,
  maxPips: 50,
  buyColor: '#00FF00',
  sellColor: '#FF0000'
}
```

## Output

### 1. Charts

Generated in `output/` directory:
- PNG format, 1200x600 pixels
- Candlestick charts with zones overlaid
- Professional styling with grid and labels

Example: `output/EURUSD_swing_1day_1730000000000.png`

### 2. Reports

Saved in `reports/` directory:
- JSON format with full analysis details
- Includes validation results and warnings
- Timestamped for tracking

Example: `reports/EURUSD_swing_1730000000000.json`

## Rate Limiting

TwelveData free tier limits:
- **800 API calls per day**
- **~8 calls per minute**

The system automatically handles rate limiting:
- 8-second delay between API calls
- Respects daily limits

**API Call Usage:**
- 1 pair + 1 strategy = 2 API calls (one per timeframe)
- Analyzing all 6 pairs with both strategies = 24 API calls
- You can run ~33 full analyses per day with free tier

## How It Works

### Data Flow

```
1. Fetch OHLCV data from TwelveData
   ↓
2. Format data for AI (detect patterns, find levels)
   ↓
3. Send to GPT with SOP prompt
   ↓
4. Validate AI response
   ↓
5. Generate chart with zones
   ↓
6. Save report
```

### AI Analysis Process

1. **Data Formatting:**
   - Converts raw OHLCV to structured format
   - Detects candlestick patterns automatically
   - Identifies swing highs/lows for support/resistance
   - Calculates trend and momentum

2. **GPT Analysis:**
   - Receives formatted data + SOP instructions
   - Follows step-by-step trading rules
   - Returns JSON with signal, zones, confidence

3. **Validation:**
   - Checks trend-signal alignment
   - Validates zone sizes (pip width)
   - Ensures pattern confirmation
   - Warns on low confidence

4. **Chart Generation:**
   - Draws candlesticks on canvas
   - Overlays zones with transparency
   - Adds labels and price scales
   - Saves as PNG

## Troubleshooting

### API Key Issues

```
Error: TwelveData API key not configured
```

**Solution:** Make sure `.env` file exists with valid `TWELVEDATA_API_KEY`

### Rate Limit Errors

```
Error: Rate limit exceeded
```

**Solution:** Wait a few minutes or upgrade to paid TwelveData plan

### No Patterns Found

```
Warning: No valid patterns detected
```

**Solution:** This is normal - not all market conditions produce signals. The AI correctly identified no setup.

### Chart Generation Fails

```
Error: Failed to generate chart
```

**Solution:** Ensure `canvas` package is properly installed:
```bash
npm install canvas --build-from-source
```

## Advantages Over Screenshot Method

1. **Speed:** 3-5x faster (no browser automation)
2. **Accuracy:** Structured data = more precise analysis
3. **Scalability:** Can analyze hundreds of pairs easily
4. **Historical Analysis:** Can fetch any historical period
5. **Data Quality:** Direct from API vs. visual interpretation

## Limitations

1. **API Costs:** Free tier limited to 800 calls/day
2. **Forex Only:** Free tier doesn't support commodities (Gold, Oil)
3. **Data Dependency:** Relies on TwelveData API availability

## Future Enhancements

- [ ] Add more indicators (RSI, MACD, Bollinger Bands)
- [ ] Support for crypto pairs
- [ ] Backtesting functionality
- [ ] Telegram bot integration
- [ ] Real-time alerts
- [ ] Multi-timeframe correlation analysis

## License

MIT

## Support

For issues or questions:
1. Check this README thoroughly
2. Review the code comments
3. Test with the provided test script
4. Verify API keys are correct

## Credits

Based on the proven SOP from `ai-trading-analyzer` but reimagined for API-based data fetching and analysis.
