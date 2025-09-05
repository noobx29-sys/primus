# 🤖 Trading Genie AI Assistant Setup

This guide explains how to set up the OpenAI Assistant integration for Trading Genie bot.

## 🚀 Overview

The Trading Genie bot now includes an AI assistant that can handle user messages when they don't click any menu options. The assistant can:

- Provide market analysis
- Answer trading questions
- Give technical analysis
- Calculate risk management
- Explain trading concepts
- And much more!

## 📋 Prerequisites

1. **OpenAI API Key**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. **OpenAI Assistant**: Create a custom assistant in OpenAI

## 🔧 Setup Steps

### 1. Create OpenAI Assistant

1. Go to [OpenAI Assistants](https://platform.openai.com/assistants)
2. Click "Create" to create a new assistant
3. Configure your assistant:

**Name**: Trading Genie AI
**Description**: AI-powered trading assistant for market analysis and trading guidance
**Instructions**: 
```
You are Trading Genie, an AI-powered trading assistant specializing in Gold (XAUUSD) and Forex markets. 

Your capabilities include:
- Real-time market analysis
- Technical chart analysis
- Trading signal generation
- Risk management calculations
- Support and resistance levels
- Market status and trading hours

You can access various tools to provide accurate trading information. Always be helpful, professional, and focus on trading-related queries.

When users ask about:
- Market conditions: Use get_market_analysis
- Chart patterns: Use get_chart_analysis  
- Trading signals: Use get_trading_signals
- Support/resistance: Use get_support_resistance
- Market hours: Use get_trading_hours
- Risk management: Use get_risk_management

Always provide actionable insights and explain your reasoning.
```

**Model**: GPT-4 Turbo (or your preferred model)

### 2. Configure Environment Variables

Create a `.env` file in your project root with:

```env
# Bot Token (from BotFather)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
TRADING_GENIE_ASSISTANT_ID=your_openai_assistant_id_here

# Server Configuration
PORT=3003
NODE_ENV=development

# Logging
LOG_LEVEL=INFO
```

### 3. Install Dependencies

```bash
npm install openai
```

## 🛠️ Available Tools

The AI assistant has access to these tools:

### 📊 Market Analysis
- **get_market_analysis**: Get real-time market analysis for any symbol
- **get_chart_analysis**: Technical analysis for specific timeframes
- **get_trading_signals**: Current trading signals and recommendations

### 📈 Technical Analysis
- **get_support_resistance**: Support and resistance levels
- **get_risk_management**: Calculate position sizing and risk/reward

### ⏰ Market Information
- **get_market_status**: Current market status and sessions
- **get_trading_hours**: Trading session hours and next signals

## 🎯 How It Works

1. **User sends text message** (doesn't click any buttons)
2. **Bot checks access** (free trial or paid subscription)
3. **AI Assistant processes** the message using OpenAI
4. **Tools are called** as needed for real-time data
5. **Response is generated** with trading insights
6. **Menu options** are provided for further interaction

## 🔍 Example Interactions

### User: "What's the current gold analysis?"
**AI Response**: 
```
📊 Current Gold (XAUUSD) Analysis:

💰 Current Price: $2,045.67
📈 Trend: BULLISH
🎯 Signal: BUY with 78% confidence

Technical Indicators:
• RSI: 65 (Neutral)
• MACD: Bullish crossover
• EMA: Price above 20 EMA

Support Levels: $2,035, $2,025
Resistance Levels: $2,055, $2,065

💡 Recommendation: Consider long position with stop loss at $2,035
```

### User: "Calculate risk for 1 lot gold trade"
**AI Response**:
```
🛡️ Risk Management Calculation:

Position Size: 1.0 lot
Entry: $2,045.67
Stop Loss: $2,035.00
Take Profit: $2,065.00

Risk: $1,067 (10.67 pips)
Reward: $1,933 (19.33 pips)
Risk/Reward Ratio: 1:1.81

💡 This is a good risk/reward ratio. Consider this trade setup.
```

## 🚀 Testing

1. Start your bot: `npm run dev`
2. Send `/start` to get the main menu
3. Type any trading-related question instead of clicking buttons
4. The AI assistant will respond with helpful insights

## 🔧 Customization

You can customize the AI assistant by:

1. **Modifying tools** in `src/tradingGenieAssistant.js`
2. **Updating instructions** in your OpenAI assistant
3. **Adding new functions** for specific trading needs
4. **Integrating real data** instead of demo data

## 📝 Notes

- The assistant maintains conversation context using OpenAI threads
- Tool calls are handled automatically
- Fallback to original guidance if AI fails
- All responses include menu options for easy navigation

## 🆘 Troubleshooting

**Error: "No assistant ID configured"**
- Make sure `TRADING_GENIE_ASSISTANT_ID` is set correctly
- Verify your OpenAI assistant exists and is accessible

**Error: "OpenAI API key not found"**
- Check your `OPENAI_API_KEY` environment variable
- Ensure the API key has proper permissions

**Assistant not responding**
- Check OpenAI API quotas and limits
- Verify assistant instructions are clear
- Check server logs for detailed error messages
