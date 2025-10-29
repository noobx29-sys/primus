# Telegram Bot for Trading Analyzer API

A Telegram bot interface for the TwelveData-based trading analyzer.

## Features

✅ **Streamlined Interface** - Direct forex pair selection (no market menu)  
✅ **Real-time Analysis** - Fetches live data from TwelveData API  
✅ **AI-Powered Signals** - Uses GPT for analysis following proven SOP  
✅ **Professional Charts** - Polished charts with right-side Y-axis  
✅ **Focused Output** - Sends only the entry timeframe chart (M30/5min)  
✅ **Progress Tracking** - Checklist-style status updates  
✅ **Validation Feedback** - Clear explanations when setups are invalid  
✅ **Retry Functionality** - Quick retry button for new analysis  

## Setup

### 1. Install Dependencies

```bash
npm install node-telegram-bot-api
```

### 2. Create Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` command
3. Follow instructions to create your bot
4. Copy the **bot token** you receive

### 3. Configure Environment

Add your bot token to `.env`:

```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 4. Run the Bot

```bash
npm run bot
```

Or directly:

```bash
node src/bot/telegramBot.js
```

## Usage

1. **Start the bot** in Telegram by searching for your bot name
2. Send `/start` command
3. Choose **Forex** market
4. Select a **trading pair** (EUR/USD, GBP/USD, etc.)
5. Choose **strategy** (Swing or Scalping)
6. Wait for analysis (30-60 seconds)
7. Receive annotated charts with trading zones

## Bot Flow

```
/start
  ↓
Choose Market (Forex)
  ↓
Select Pair (EUR/USD, GBP/USD, etc.)
  ↓
Choose Strategy (Swing / Scalping)
  ↓
[Processing...]
  ├─ Validate API keys
  ├─ Fetch market data (TwelveData)
  ├─ AI analysis (GPT)
  └─ Generate charts
  ↓
Receive Results:
  - Annotated charts (if valid)
  - Signal (BUY/SELL/WAIT)
  - Confidence score
  - Zone prices
  - Reasoning
  ↓
Retry or Back to Menu
```

## Output Examples

### Valid Analysis
```
EUR/USD • SWING
✅ Valid
Signal: BUY
Confidence: 68.5%
Trend: uptrend
Pattern: bullish engulfing

Zone (support):
1.15855 - 1.16355

📝 Price is in uptrend with bullish engulfing
at support. M30 confirmation inside Daily zone.

[Chart 1: Daily timeframe with zones]
[Chart 2: M30 timeframe with entry zone]
```

### Invalid Analysis
```
EUR/USD • SWING
⚠️ Invalid
Signal: BUY
Confidence: 31.0%

⚠️ Analysis did not pass SOP validation:

❌ Entry timeframe issues:
  • M30 pattern NOT inside Daily zone

💡 What this means:
  • For valid swing setup, M30 entry must be inside Daily zone
  • Wait for price to return to Daily zone

🔄 You can retry or try different pair
```

## Commands

- `/start` - Start the bot and begin analysis

## Keyboard Navigation

- **Forex** - Access forex pairs
- **Swing / Scalping** - Choose trading strategy
- **Retry Analysis** - Run same analysis again
- **Back to Menu** - Return to main menu
- **Cancel** - Cancel current operation

## API Rate Limits

TwelveData free tier:
- **800 calls per day**
- **~8 calls per minute**

Each analysis uses **2 API calls** (one per timeframe).

You can run approximately **400 analyses per day** with the free tier.

## Troubleshooting

### Bot Not Responding

```
Error: ETELEGRAM: 409 Conflict
```

**Solution:** Only one instance can run at a time. Stop other instances:
```bash
pkill -f telegramBot.js
```

### API Key Errors

```
Error: TWELVEDATA_API_KEY not configured
```

**Solution:** Check your `.env` file has all required keys:
- `TWELVEDATA_API_KEY`
- `OPENAI_API_KEY`
- `TELEGRAM_BOT_TOKEN`

### Rate Limit Exceeded

```
Error: Rate limit exceeded
```

**Solution:** Wait 1 minute or upgrade to TwelveData paid plan.

## Differences from Screenshot Bot

| Feature | Screenshot Bot | API Bot |
|---------|---------------|---------|
| Data Source | TradingView screenshots | TwelveData API |
| Speed | 60-90 seconds | 30-60 seconds |
| Assets | Forex + Gold | Forex only (free tier) |
| Browser | Required (Puppeteer) | Not needed |
| Rate Limits | None | 800 calls/day |

## Advanced Configuration

Edit `src/utils/config.js` to customize:

```javascript
// Trading pairs
tradingPairs: [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  // Add more...
],

// Timeframes and bars
swing: {
  dailyBars: 200,
  entryBars: 300,
  confidenceThreshold: 0.6
},

scalping: {
  primaryBars: 200,
  entryBars: 300,
  confidenceThreshold: 0.65
}
```

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start src/bot/telegramBot.js --name trading-bot

# View logs
pm2 logs trading-bot

# Restart
pm2 restart trading-bot

# Auto-start on reboot
pm2 startup
pm2 save
```

### Using systemd

Create `/etc/systemd/system/trading-bot.service`:

```ini
[Unit]
Description=Trading Analyzer Telegram Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/trading-analyzer-api
ExecStart=/usr/bin/node src/bot/telegramBot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable trading-bot
sudo systemctl start trading-bot
sudo systemctl status trading-bot
```

## Security Notes

1. **Keep your bot token secret** - Never commit to git
2. **Use .env file** - Store all credentials there
3. **.env is gitignored** - Safe from accidental commits
4. **Restrict bot access** - Consider whitelisting Telegram user IDs

## Support

For issues or questions:
1. Check API keys are valid
2. Verify bot token from @BotFather
3. Check logs for detailed error messages
4. Ensure TwelveData and OpenAI credits available

## License

MIT
