import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { formatTelegram } from './utils/format.js';
import { captureTradingViewChart } from './utils/tvChart.js';
import { fetchTradingViewPrice } from './utils/tvPrice.js';

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
const DEFAULT_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPJPY', 'USDJPY'];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    selfTest: args.includes('--self-test'),
    debug: args.includes('--debug')
  };
}

async function analyzeSymbol(symbol, mode) {
  const tf = mode === 'Scalping' ? '5' : 'D';
  // Capture chart first (so the price we read is after any redraw/network settle)
  const tvImage = await captureTradingViewChart(symbol, tf);
  const tv = await fetchTradingViewPrice(symbol);
  const text = formatTelegram({
    symbol,
    mode,
    trend: '—',
    signal: '—',
    confirmation: '—',
    zone: { from: tv.price, to: tv.price },
    strength: 50,
    lastPrice: tv.price,
    lastTime: tv.time
  });
  if (process.env.BOT_DEBUG === '1') {
    console.log(`[DEBUG] TradingView (post-screenshot): price=${tv.price} time=${new Date(tv.time).toISOString()} tf=${tf}`);
  }
  return { text, imageBuffer: tvImage };
}

async function runSelfTest() {
  console.log('[TEST] Starting self-test...');
  const modes = ['Swing', 'Scalping'];
  for (const mode of modes) {
    for (const symbol of DEFAULT_SYMBOLS) {
      try {
        console.log(`[TEST] ${mode} ${symbol} analysis`);
        const { text, imageBuffer } = await analyzeSymbol(symbol, mode);
        if (!text || typeof text !== 'string') throw new Error('No text output');
        if (!imageBuffer || !(imageBuffer instanceof Buffer)) {
          console.warn('[WARN] Chart buffer missing. Continuing with text-only.');
        }
      } catch (e) {
        console.warn(`[WARN] Self-test failed for ${mode} ${symbol}: ${e?.message}`);
      }
    }
  }
  console.log('[TEST] Self-test completed.');
}

async function startBot() {
  const bot = new Telegraf(BOT_TOKEN);
  const userMode = new Map(); // chatId -> 'Swing' | 'Scalping'

  bot.start((ctx) => ctx.reply('Welcome! Use /mode to choose Swing or Scalping, then /gold or /fx EURUSD etc.'));
  bot.command('mode', (ctx) => {
    ctx.reply('Choose mode: /swing or /scalping');
  });
  bot.command('swing', (ctx) => { userMode.set(ctx.chat.id, 'Swing'); ctx.reply('Mode set: Swing'); });
  bot.command('scalping', (ctx) => { userMode.set(ctx.chat.id, 'Scalping'); ctx.reply('Mode set: Scalping'); });

  bot.command('gold', async (ctx) => {
    const mode = userMode.get(ctx.chat.id) || 'Swing';
    await ctx.reply(`Analyzing XAUUSD in ${mode} mode...`);
    try {
      const { text, imageBuffer } = await analyzeSymbol('XAUUSD', mode);
      if (imageBuffer) {
        await ctx.replyWithPhoto({ source: imageBuffer }, { caption: text });
      } else {
        await ctx.reply(text);
      }
    } catch (e) {
      console.warn('[WARN] Telegram send failed; retrying with text only...', e?.message);
      try { await ctx.reply('Analysis error, sending text only.'); } catch {}
    }
  });

  bot.command('fx', async (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const symbol = (parts[1] || 'EURUSD').toUpperCase();
    const mode = userMode.get(ctx.chat.id) || 'Swing';
    await ctx.reply(`Analyzing ${symbol} in ${mode} mode...`);
    try {
      const { text, imageBuffer } = await analyzeSymbol(symbol, mode);
      if (imageBuffer) {
        await ctx.replyWithPhoto({ source: imageBuffer }, { caption: text });
      } else {
        await ctx.reply(text);
      }
    } catch (e) {
      console.warn('[WARN] Telegram send failed; retrying with text only...', e?.message);
      try { await ctx.reply('Analysis error, sending text only.'); } catch {}
    }
  });

  bot.launch();
  console.log('Bot started.');
}

const { selfTest, debug } = parseArgs();
if (debug) process.env.BOT_DEBUG = '1';
if (selfTest || !BOT_TOKEN) {
  // Run self-test if requested or when token is missing
  runSelfTest().then(() => {
    if (!BOT_TOKEN) {
      console.log('[INFO] No BOT_TOKEN found; self-test mode only. Set BOT_TOKEN in .env to run the bot.');
    } else {
      startBot();
    }
  });
} else {
  startBot();
}

process.on('unhandledRejection', (e) => console.warn('[WARN] Unhandled rejection', e));
process.on('uncaughtException', (e) => console.warn('[WARN] Uncaught exception', e));


