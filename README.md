# 🧞‍♂️ Trading Genie

**Your AI-powered trading companion - Professional analysis, real-time signals, and market insights**

Trading Genie is a sophisticated Telegram bot that provides professional-grade trading analysis for Gold (XAUUSD) and major Forex pairs. Built with advanced technical analysis capabilities and real-time market data integration.

## ✨ Features

### 📊 **Professional Market Analysis**
- Real-time market condition monitoring
- Advanced technical indicator analysis
- Professional signal generation with confidence levels
- Multi-timeframe analysis (M1 to Monthly)

### 💎 **Multi-Asset Coverage**
- **Gold (XAUUSD)** - Precious metals trading
- **Forex Pairs** - Major currency pairs (EUR/USD, GBP/USD, USD/JPY, etc.)
- Professional TradingView chart integration
- Real-time price data and analysis

### 🔔 **Automated Trading Signals**
- Hourly signals during major trading sessions
- 24-hour advance market notifications
- Session open/close alerts
- Customizable subscription management

### 📈 **Advanced Chart Analysis**
- 9 different timeframes (M1, M5, M15, M30, H1, H4, D1, W1, MN1)
- Professional TradingView chart screenshots
- Technical pattern recognition
- Support and resistance level analysis
- Risk management recommendations

### 🎯 **Professional Trading Tools**
- Entry, stop-loss, and take-profit levels
- Risk/reward ratio calculations
- Trend strength analysis
- Pattern confidence scoring

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- Telegram Bot Token
- Alpha Vantage API Key (optional)
- Yahoo Finance API access

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram_ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## ⚙️ Configuration

### Environment Variables
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
YAHOO_FINANCE_API_KEY=your_yahoo_finance_key
LOG_LEVEL=INFO
PORT=3003
```

### Trading Sessions
- **Asian Session**: 6:00 PM - 3:00 AM EST
- **London Session**: 3:00 AM - 12:00 PM EST  
- **New York Session**: 8:00 AM - 5:00 PM EST

## 📱 Usage

### Main Menu Options
- 📊 **Market Analysis** - Real-time market conditions
- 📈 **Chart Analysis** - Professional technical analysis
- 🔔 **Signal Subscription** - Automated trading alerts
- 📊 **Bot Status** - System performance monitoring
- ❓ **Help & Support** - User guidance and assistance
- ⚙️ **Admin Panel** - Subscriber management

### Chart Analysis Flow
1. Select asset type (Gold or Forex)
2. Choose currency pair (for Forex)
3. Select timeframe (M1 to Monthly)
4. Receive comprehensive analysis with chart screenshot

## 🔧 Technical Details

### Built With
- **Node.js** - Runtime environment
- **node-telegram-bot-api** - Telegram Bot API
- **Puppeteer** - Chart screenshot capture
- **Technical Indicators** - Professional analysis library
- **Express.js** - HTTP server for testing
- **Node-cron** - Scheduled task management

### Architecture
- Modular function-based design
- Comprehensive logging system
- Error handling and graceful shutdown
- Memory-efficient resource management
- Scalable subscriber management

## 📊 Performance Features

### Logging System
- Configurable log levels (DEBUG, INFO, WARN, ERROR)
- Structured logging with context
- Performance monitoring
- Error tracking and debugging

### Resource Management
- Automatic browser cleanup
- Memory leak prevention
- Graceful shutdown handling
- Rate limiting protection

## 🎯 Trading Recommendations

### Optimal Timeframes
- **Scalping**: M1, M5
- **Intraday**: M15, M30, H1
- **Swing Trading**: H4, D1
- **Long-term**: W1, MN1

### Risk Management
- Always use stop-loss orders
- Maintain proper position sizing
- Diversify across timeframes
- Follow professional analysis

## ⚠️ Disclaimer

This bot is for educational and informational purposes only. Trading involves substantial risk and may not be suitable for all investors. Always conduct your own research and consider consulting with a financial advisor before making trading decisions.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Check the Help & Support section in the bot
- Review the logging output for debugging
- Contact your system administrator

---

**🧞‍♂️ Trading Genie - Your AI Trading Companion** 