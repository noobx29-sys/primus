# Quick Start Guide

Get up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
cd trading-analyzer-api
npm install
```

## Step 2: Get Your API Keys

### TwelveData (Required)
1. Visit https://twelvedata.com/
2. Click "Get Free API Key"
3. Sign up with email
4. Copy your API key

### OpenAI (Required)
1. Visit https://platform.openai.com/
2. Sign in or create account
3. Go to "API Keys"
4. Click "Create new secret key"
5. Copy your key

## Step 3: Configure

```bash
cp .env.example .env
nano .env  # or use your favorite editor
```

Paste your keys:
```env
TWELVEDATA_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Step 4: Run Test

```bash
npm test
```

Expected output:
```
✓ API keys validated
✓ EUR/USD analyzed
✓ Charts generated
✓ Report saved
```

## Step 5: Analyze

### Single Pair
```bash
node src/index.js EUR/USD swing
```

### All Pairs
```bash
npm start
```

## What You Get

1. **Console Output:**
   - Real-time progress
   - Signal: BUY/SELL/WAIT
   - Confidence score
   - Validation warnings

2. **Charts:** `output/EURUSD_swing_1day_*.png`
   - Candlestick chart
   - Zones overlaid
   - Professional styling

3. **Reports:** `reports/EURUSD_swing_*.json`
   - Full analysis details
   - All timeframe data
   - Validation results

## Customization

Edit `src/utils/config.js`:

```javascript
// Add more pairs
tradingPairs: [
  'EUR/USD',
  'USD/CHF',  // Add this
],

// Change strategies
activeStrategies: ['swing'],  // Only swing

// Adjust confidence
swing: {
  confidenceThreshold: 0.7,  // Higher = stricter
}
```

## Common Commands

```bash
# Analyze EUR/USD with swing strategy
node src/index.js EUR/USD swing

# Analyze GBP/USD with scalping
node src/index.js GBP/USD scalping

# Analyze all configured pairs
npm start

# Run tests
npm test
```

## Tips

1. **Free Tier Limits:** 800 API calls/day = ~33 full analyses
2. **Best Times:** Analyze during market hours for best results
3. **Multiple Runs:** Wait 8 seconds between analyses (rate limiting)
4. **Check Reports:** JSON reports have full details for review

## Need Help?

1. Read the full README.md
2. Check your API keys in .env
3. Verify internet connection
4. Review console output for specific errors

## What's Next?

- Experiment with different pairs
- Try both swing and scalping strategies
- Review generated charts and reports
- Adjust confidence thresholds in config
- Set up automated runs (cron jobs)

Happy trading! 📈
