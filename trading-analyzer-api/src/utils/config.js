import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const config = {
  // API Keys
  twelvedata: {
    apiKey: process.env.TWELVEDATA_API_KEY,
    baseUrl: 'https://api.twelvedata.com'
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: 3000,
    temperature: 0.3
  },

  // Trading Pairs (Free tier supports major forex pairs)
  tradingPairs: [
    'EUR/USD',
    'GBP/USD',
    'USD/JPY',
    'AUD/USD',
    'USD/CAD',
    'NZD/USD'
  ],

  // Active Strategies
  activeStrategies: ['swing', 'scalping'],

  // Swing Trading Strategy
  swing: {
    dailyTimeframe: '1day',
    entryTimeframe: '30min',
    dailyBars: 200,        // Number of daily bars to fetch
    entryBars: 300,        // Number of 30min bars to fetch
    confidenceThreshold: 0.6,
    patterns: ['bullish_engulfing', 'bearish_engulfing']
  },

  // Scalping Strategy
  scalping: {
    primaryTimeframe: '15min',
    entryTimeframe: '5min',
    primaryBars: 200,      // Number of 15min bars to fetch
    entryBars: 300,        // Number of 5min bars to fetch
    confidenceThreshold: 0.55,
    patterns: ['bullish_engulfing', 'bearish_engulfing', 'pin_bar', 'inside_bar'],
    sessions: ['london', 'new_york'],
    newsBlackoutMin: 30,
    zoneStyle: 'shadow_to_shadow'
  },

  // Zones Configuration
  zones: {
    minPips: 10,
    maxPips: 50,
    buyColor: '#00FF00',
    sellColor: '#FF0000',
    opacity: 0.3,
    borderWidth: 2
  },

  // Directories
  directories: {
    output: path.join(__dirname, '../../output'),
    reports: path.join(__dirname, '../../reports')
  },

  // Chart Generation
  chart: {
    width: 1200,
    height: 600,
    backgroundColor: '#1E1E1E',
    textColor: '#FFFFFF',
    gridColor: '#333333',
    candleUpColor: '#26A69A',
    candleDownColor: '#EF5350'
  },

  // Rate Limiting (TwelveData free tier: 800 calls/day, ~8 calls/min)
  rateLimit: {
    maxCallsPerMinute: 8,
    delayBetweenCalls: 8000 // 8 seconds
  }
};

export default config;
