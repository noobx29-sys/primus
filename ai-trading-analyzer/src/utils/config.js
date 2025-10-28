import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
// Priority:
// 1) Project-local .env (ai-trading-analyzer/.env)
// 2) Parent repo root .env (../.env)
// 3) Existing bot .env (../src/.env)
const envPaths = [
  join(__dirname, '../../.env'),
  join(__dirname, '../../../.env'),
  join(__dirname, '../../../src/.env')
];

for (const p of envPaths) {
  try {
    dotenv.config({ path: p, override: false });
  } catch (_) {
    // ignore
  }
}

class Config {
  constructor() {
    this.ensureDirectories();
    this.validateRequired();
    // Runtime overrides (set by CLI flags)
    this.overrides = {
      scalping: {},
      swing: {},
      zones: {},
      chart: {},
      analysis: {}
    };
  }

  // OpenAI Configuration
  get openai() {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4096')
    };
  }

  // TradingView Configuration
  get tradingView() {
    return {
      username: process.env.TRADINGVIEW_USERNAME,
      password: process.env.TRADINGVIEW_PASSWORD,
      baseUrl: process.env.TRADINGVIEW_BASE_URL || 'https://www.tradingview.com'
    };
  }

  // GoCharting Configuration
  get goCharting() {
    return {
      baseUrl: process.env.GOCHARTING_BASE_URL || 'https://gocharting.com/terminal',
      // Template for ticker param, %SYMBOL% will be replaced with pair (e.g., EURUSD)
      // Example final: GOCHARTING:{EXNESS:SPOT:EURUSD}
      tickerTemplate: process.env.GOCHARTING_TICKER_TEMPLATE || 'GOCHARTING:{EXNESS:SPOT:%SYMBOL%}',
      // Which query param to use for timeframe; keep configurable in case GC expects a different key
      intervalParam: process.env.GOCHARTING_INTERVAL_PARAM || 'interval'
    };
  }

  // Trading Pairs
  get tradingPairs() {
    const pairs = process.env.TRADING_PAIRS || 'XAUUSD,EURUSD,GBPUSD';
    return pairs.split(',').map(p => p.trim());
  }

  // Active Strategies
  get activeStrategies() {
    const strategies = process.env.ACTIVE_STRATEGIES || 'swing,scalping';
    return strategies.split(',').map(s => s.trim().toLowerCase());
  }

  // Swing Strategy Settings
  get swing() {
    const base = {
      dailyTimeframe: process.env.SWING_DAILY_TIMEFRAME || '1D',
      entryTimeframe: process.env.SWING_ENTRY_TIMEFRAME || '30',
      confidenceThreshold: parseFloat(process.env.SWING_CONFIDENCE_THRESHOLD || '0.5')
    };
    return { ...base, ...this.overrides.swing };
  }

  // Scalping Strategy Settings
  get scalping() {
    const patterns = (process.env.SCALPING_PATTERNS || 'bullish_engulfing,bearish_engulfing,pin_bar,breakout,breakdown')
      .split(',').map(s => s.trim()).filter(Boolean);
    const sessions = (process.env.SCALPING_SESSIONS || 'LDN,NY')
      .split(',').map(s => s.trim()).filter(Boolean);
    const base = {
      primaryTimeframe: process.env.SCALPING_PRIMARY_TIMEFRAME || '15',
      entryTimeframe: process.env.SCALPING_ENTRY_TIMEFRAME || '5',
      confidenceThreshold: parseFloat(process.env.SCALPING_CONFIDENCE_THRESHOLD || '0.80'),
      patterns,
      sessions, // e.g., ASIA, LDN, NY
      newsBlackoutMin: parseInt(process.env.SCALPING_NEWS_BLACKOUT_MIN || '0'),
      zoneStyle: process.env.SCALPING_ZONE_STYLE || 'wick_to_wick'
    };
    return { ...base, ...this.overrides.scalping };
  }

  // Chart Settings
  get chart() {
    return {
      width: parseInt(process.env.CHART_WIDTH || '1920'),
      height: parseInt(process.env.CHART_HEIGHT || '1080'),
      loadWait: parseInt(process.env.CHART_LOAD_WAIT || '5000'),
      quality: parseInt(process.env.SCREENSHOT_QUALITY || '95')
    };
  }

  // Directories
  get directories() {
    return {
      output: process.env.OUTPUT_DIR || './output',
      logs: process.env.LOGS_DIR || './logs',
      reports: process.env.REPORTS_DIR || './reports'
    };
  }

  // Retry Configuration
  get retry() {
    return {
      maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
      delay: parseInt(process.env.RETRY_DELAY || '2000')
    };
  }

  // Logging
  get logging() {
    return {
      level: process.env.LOG_LEVEL || 'info',
      toFile: process.env.LOG_TO_FILE === 'true'
    };
  }

  // Puppeteer Settings
  get puppeteer() {
    return {
      headless: process.env.HEADLESS !== 'false',
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT || '30000')
    };
  }

  // Zone Drawing
  get zones() {
    const base = {
      buyColor: process.env.BUY_ZONE_COLOR || '#0066FF',
      sellColor: process.env.SELL_ZONE_COLOR || '#FF0033',
      opacity: parseFloat(process.env.ZONE_OPACITY || '0.3'),
      borderWidth: parseInt(process.env.ZONE_BORDER_WIDTH || '2'),
      minimal: process.env.ZONE_MINIMAL === 'true',
      drawLabels: process.env.ZONE_DRAW_LABELS !== 'false',
      fontSize: parseInt(process.env.ZONE_FONT_SIZE || '16'),
      watermark: process.env.ZONE_WATERMARK !== 'false',
      minPips: parseInt(process.env.ZONE_MIN_PIPS || '20'),
      maxPips: parseInt(process.env.ZONE_MAX_PIPS || '30')
    };
    return { ...base, ...this.overrides.zones };
  }

  // Analysis Settings
  get analysis() {
    const base = {
      enableLocalFallback: process.env.ENABLE_LOCAL_FALLBACK === 'true',
      saveRawScreenshots: process.env.SAVE_RAW_SCREENSHOTS === 'true',
      validateZones: process.env.VALIDATE_ZONES === 'true',
      autoRecovery: process.env.AUTO_RECOVERY === 'true'
    };
    return { ...base, ...this.overrides.analysis };
  }

  // Validate required configuration
  validateRequired() {
    const required = ['OPENAI_API_KEY'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      console.warn(`⚠️  Missing configuration: ${missing.join(', ')}`);
      console.warn('   Some features may not work. Check .env.example for reference.');
    }
  }

  // Ensure directories exist
  ensureDirectories() {
    const dirs = Object.values(this.directories);
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Apply runtime overrides, deep-merging provided objects
   * @param {Object} overrides
   */
  applyOverrides(overrides = {}) {
    const groups = ['scalping', 'swing', 'zones', 'chart', 'analysis'];
    for (const g of groups) {
      if (overrides[g]) {
        this.overrides[g] = { ...this.overrides[g], ...overrides[g] };
      }
    }
  }
}

export default new Config();
