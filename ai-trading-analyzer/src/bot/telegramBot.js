#!/usr/bin/env node

import TelegramBot from 'node-telegram-bot-api';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import StrategyOrchestrator from '../core/strategyOrchestrator.js';
import fs from 'fs';

// Ensure BOT_TOKEN exists
const token = process.env.BOT_TOKEN;
if (!token) {
  logger.failure('BOT_TOKEN missing in environment (.env). Please set BOT_TOKEN=...');
  process.exit(1);
}

function selectRawEntryScreenshot(strategy, shots) {
  const s = strategy.toLowerCase();
  const key = s === 'scalping' ? '5' : '30';
  // Shots is a map of timeframe -> path
  return shots[key] || null;
}

// Create bot (use polling for simplicity)
const bot = new TelegramBot(token, { polling: true });
const orchestrator = new StrategyOrchestrator();

logger.success('Telegram bot started. Waiting for commands...');

// In-memory state per chat
const chatState = new Map();

function resetState(chatId) {
  chatState.set(chatId, { step: 'market', pair: null, strategy: null, processing: false });
}

function getPairsForForex() {
  return config.tradingPairs.filter(p => p.toUpperCase() !== 'XAUUSD');
}

function marketKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [ { text: 'Gold', callback_data: 'market:gold' }, { text: 'Forex', callback_data: 'market:forex' } ],
        [ { text: 'Cancel', callback_data: 'cancel' } ]
      ]
    }
  };
}

function strategyKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [ { text: 'Swing', callback_data: 'strategy:swing' }, { text: 'Scalping', callback_data: 'strategy:scalping' } ],
        [ { text: 'Back', callback_data: 'back:market' }, { text: 'Cancel', callback_data: 'cancel' } ]
      ]
    }
  };
}

function forexPairsKeyboard() {
  const pairs = getPairsForForex().slice(0, 8); // simple first 8
  const rows = [];
  for (let i = 0; i < pairs.length; i += 2) {
    rows.push([
      { text: pairs[i], callback_data: `pair:${pairs[i]}` },
      pairs[i+1] ? { text: pairs[i+1], callback_data: `pair:${pairs[i+1]}` } : undefined
    ].filter(Boolean));
  }
  rows.push([ { text: 'Back', callback_data: 'back:market' }, { text: 'Cancel', callback_data: 'cancel' } ]);
  return { reply_markup: { inline_keyboard: rows } };
}

// Help message
const helpMsg = `
AI Trading Analyzer Bot
=======================
Use the buttons to run an analysis:
  1) Choose market: Gold or Forex
  2) Choose strategy: Swing or Scalping

The bot captures TradingView charts, analyzes them using the Swing/Scalping SOP, and returns annotated images with trading zones. If an analysis is invalid (e.g., no valid M30 confirmation inside Daily), you'll receive a clear explanation and a detailed JSON report.

Command:
  /start - restart
`;

bot.onText(/^\/start$/, async (msg) => {
  resetState(msg.chat.id);
  await bot.sendMessage(msg.chat.id, helpMsg);
  await bot.sendMessage(msg.chat.id, 'Choose market:', marketKeyboard());
});

// Inline button flow
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data || '';
  const state = chatState.get(chatId) || { step: 'market' };
  logger.info(`Callback received: ${data} (step=${state.step}, pair=${state.pair || '-'})`);

  // No debounce: rely on processing lock only

  // Retry analysis
  if (data.startsWith('retry_')) {
    const parts = data.split('_');
    const pair = parts[1];
    const strategy = parts[2];
    await bot.answerCallbackQuery(query.id, { text: 'Retrying analysis...' });
    state.pair = pair;
    state.step = 'strategy';
    chatState.set(chatId, state);
    // Trigger strategy callback to restart analysis
    query.data = `strategy:${strategy}`;
    // Continue to strategy handler below
  }

  // Back to menu
  if (data === 'back_to_menu') {
    resetState(chatId);
    await bot.answerCallbackQuery(query.id, { text: 'Back to menu' });
    await bot.sendMessage(chatId, 'Choose market:', marketKeyboard());
    return;
  }

  // Cancel / Back
  if (data === 'cancel') {
    resetState(chatId);
    await bot.answerCallbackQuery(query.id, { text: 'Cancelled' });
    await bot.sendMessage(chatId, 'Cancelled. Start again by choosing a market:', marketKeyboard());
    return;
  }
  if (data === 'back:market') {
    state.step = 'market';
    state.pair = null;
    chatState.set(chatId, state);
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, 'Back to market selection:', marketKeyboard());
    return;
  }

  // Market selection
  if (data.startsWith('market:')) {
    const which = data.split(':')[1];
    if (which === 'gold') {
      state.pair = 'XAUUSD';
      state.step = 'strategy';
      chatState.set(chatId, state);
      await bot.answerCallbackQuery(query.id); // silent, no popup
      await bot.sendMessage(chatId, 'Choose strategy:', strategyKeyboard());
      return;
    }
    if (which === 'forex') {
      state.step = 'pair';
      chatState.set(chatId, state);
      await bot.answerCallbackQuery(query.id); // silent, no popup
      await bot.sendMessage(chatId, 'Choose Forex pair:', forexPairsKeyboard());
      return;
    }
  }

  // Forex pair selection
  if (data.startsWith('pair:')) {
    const pair = data.split(':')[1];
    state.pair = pair;
    state.step = 'strategy';
    chatState.set(chatId, state);
    await bot.answerCallbackQuery(query.id); // silent, no popup
    await bot.sendMessage(chatId, 'Choose strategy:', strategyKeyboard());
    return;
  }

  // Strategy selection and run
  if (data.startsWith('strategy:')) {
    const strategy = data.split(':')[1];
    if (!state.pair) {
      await bot.answerCallbackQuery(query.id, { text: 'Pick a market first' });
      await bot.sendMessage(chatId, 'Please select a market before choosing a strategy:', marketKeyboard());
      return;
    }
    if (state.processing) {
      await bot.answerCallbackQuery(query.id, { text: 'Analysis already in progress…' });
      return;
    }
    state.processing = true;
    chatState.set(chatId, state);
    await bot.answerCallbackQuery(query.id);
    const statusMessage = await bot.sendMessage(chatId, `Strategy selected: ${strategy.toUpperCase()}. Starting analysis for ${state.pair}…`);
    let statusId = statusMessage.message_id;
    let progress = 0;
    const makeBar = (p) => {
      const width = 20;
      const filled = Math.max(0, Math.min(width, Math.round((p/100)*width)));
      return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${Math.max(0, Math.min(100, Math.round(p)))}%`;
    };
    const setStatus = async (label, p) => {
      progress = Math.max(progress, p);
      const text = `${makeBar(progress)}\n${label}`;
      await bot.editMessageText(text, { chat_id: chatId, message_id: statusId }).catch(()=>{});
    };
    // Start typing indicator loop
    const typingInterval = setInterval(() => {
      bot.sendChatAction(chatId, 'typing').catch(() => {});
    }, 4000);
    logger.info(`Starting analysis via bot: pair=${state.pair}, strategy=${strategy}`);
    try {
      const res = await orchestrator.analyzePair(state.pair, strategy, async (phase, payload = {}) => {
        try {
          if (phase === 'start') await setStatus(`Initializing ${strategy.toUpperCase()} for ${state.pair}…`, 5);
          else if (phase === 'init_browser') await setStatus('Launching browser…', 10);
          else if (phase === 'timeframes') await setStatus(`Timeframes: ${(payload.timeframes||[]).join(', ')}`, 15);
          else if (phase === 'capture_begin') await setStatus('Capturing charts…', 25);
          else if (phase === 'capture' && payload.timeframe) await setStatus(`Capturing ${payload.timeframe}…`, progress + 10);
          else if (phase === 'analyze_begin') await setStatus('Analyzing charts…', 60);
          else if (phase === 'analyze' && payload.timeframe) await setStatus(`Analyzing ${payload.timeframe}…`, progress + 8);
          else if (phase === 'draw_begin') await setStatus('Preparing annotated chart…', 90);
        } catch {}
      });
      const statusLabel = res.status === 'wait_breakout' ? 'WAIT (Sideways)'
                         : res.status === 'forming' ? 'SETUP FORMING'
                         : res.signal.toUpperCase();
      const captionBase = `${state.pair} • ${strategy.toUpperCase()}\nSignal: ${statusLabel}\nConfidence: ${(res.confidence*100).toFixed(1)}%`;
      if (Array.isArray(res.output_images) && res.output_images.length) {
        // Send ONLY the entry timeframe image with Daily context in caption
        const rationale = buildRationale(res, strategy);
        const entryLabel = strategy === 'swing' ? 'M30' : '5-Min';
        const dailyContext = buildDailyContext(res);
        // Delete the loading/status message so the image is not pushed below it
        await bot.deleteMessage(chatId, statusId).catch(()=>{});

        // Prefer the entry image if present, otherwise send the first available image
        const entryImage = selectEntryImage(strategy, res.output_images) || res.output_images[0];
        const entryCaptionBase = `${captionBase} — ${entryLabel} Timeframe`;
        const entryCaption = [
          entryCaptionBase,
          rationale && rationale.trim() ? `\n${rationale}` : '',
          dailyContext ? `\n\nDaily context: ${dailyContext}` : ''
        ].join('');
        await bot.sendPhoto(chatId, entryImage, { caption: entryCaption });
      } else {
        // No annotated images; send ONLY one raw chart (prefer entry timeframe)
        const rawScreenshots = res.raw_screenshots || {};
        const entryLabel = strategy === 'swing' ? 'M30' : '5-Min';
        const primaryKey = strategy === 'swing' ? '1D' : '15';
        const entryKey = strategy === 'swing' ? '30' : '5';
        const rawPrimary = rawScreenshots[primaryKey];
        const rawEntry = rawScreenshots[entryKey];

        if (rawPrimary || rawEntry) {
          const details = buildNoImageExplanation(res, strategy);
          const dailyContext = buildDailyContext(res);
          // Delete the loading/status message so the image is not pushed below it
          await bot.deleteMessage(chatId, statusId).catch(()=>{});
          // Friendlier status line
          const statusNote = res.status === 'wait_breakout' ? '(Sideways — wait for breakout)'
                            : res.status === 'forming' ? '(Trending — waiting for M30 confirmation inside Daily zone)'
                            : '(Unconfirmed)';

          // Prefer entry timeframe; fallback to primary if entry is missing
          const chosenImage = rawEntry || rawPrimary;
          const label = rawEntry ? entryLabel : (strategy === 'swing' ? 'Daily' : '15-Min');
          const captionParts = [
            `${captionBase}\n${statusNote} — ${label} Timeframe`,
            details ? `\n\n${details}` : '',
            dailyContext ? `\n\nDaily context: ${dailyContext}` : ''
          ];
          await bot.sendPhoto(chatId, chosenImage, { caption: captionParts.join('') });
        }
        // If no raw images available, show final details in the status message
        if (!rawPrimary && !rawEntry) {
          const details = buildNoImageExplanation(res, strategy);
          await setStatus('Done.', 100);
          await bot.editMessageText(`${makeBar(100)}\n${details}`, { chat_id: chatId, message_id: statusId }).catch(()=>{});
        }
      }
      clearInterval(typingInterval);
      state.processing = false;
      chatState.set(chatId, state);
      // Send retry button with current pair/strategy
      await bot.sendMessage(chatId, 'What would you like to do next?', retryKeyboard(state.pair, strategy));
      resetState(chatId);
    } catch (e) {
      clearInterval(typingInterval);
      await bot.sendMessage(chatId, `Failed: ${e.message}`);
      state.processing = false;
      chatState.set(chatId, state);
    }
    return;
  }

  // No report sending in chat flow
});

// Fallback for unknown commands
bot.on('message', async (msg) => {
  if (!/^\//.test(msg.text || '')) return;
  if (/^\/(start)/.test(msg.text)) return;
  await bot.sendMessage(msg.chat.id, 'Tap /start and use the buttons to analyze.');
});

// Helpers
function buildNoImageExplanation(res, strategy) {
  const lines = [];
  lines.push('Annotated charts were not generated because the analysis did not pass SOP validation.');
  lines.push('Validation summary:');
  const v = res.validation || {};
  if (v.daily) {
    const errs = (v.daily.errors || []).map(e => `- Daily: ${e}`);
    const warns = (v.daily.warnings || []).map(w => `- Daily (warning): ${w}`);
    lines.push(...errs, ...warns);
  }
  if (v.m30 || v.entry) {
    const m = v.m30 || v.entry;
    const errs = (m.errors || []).map(e => `- Entry timeframe: ${e}`);
    const warns = (m.warnings || []).map(w => `- Entry timeframe (warning): ${w}`);
    lines.push(...errs, ...warns);
  }
  if (lines.length === 2) { // no details added
    lines.push('- No specific errors returned by the analyzer.');
  }
  // Add layman explanation and next steps
  const why = extractReasoning(res, strategy);
  if (why) {
    lines.push('\nWhat this means:');
    lines.push(`- ${why}`);
  }
  lines.push('\nNext steps:');
  if ((v.m30 || v.entry)?.errors?.some(e => /inside/i.test(e))) {
    lines.push('- Wait for a clearer entry on the lower timeframe inside the marked zone.');
  }
  if ((v.daily)?.errors?.length) {
    lines.push('- Re-check the Daily zone or switch to a different pair.');
  }
  lines.push('- You can retry now or switch strategy/market.');
  return lines.join('\n');
}

function selectEntryImage(strategy, images) {
  // Prefer entry timeframe images
  // scalping -> contains '_5_' ; swing -> contains '_30_'
  const s = strategy.toLowerCase();
  const preferred = s === 'scalping' ? '_5_' : '_30_';
  const exact = images.find(p => p.includes(preferred));
  if (exact) return exact;
  // Fallback: try to pick smaller timeframe if both present
  const alt = images.sort().find(p => /_(5|30)_/.test(p));
  return alt || null;
}

function extractReasoning(res, strategy) {
  // Prefer entry timeframe reasoning, then primary/daily
  const entry = res.entry_analysis || res.m30_analysis || res.primary_analysis || res.daily_analysis;
  if (entry && entry.reasoning) return entry.reasoning;
  // Build a simple explanation when missing
  if (res.signal === 'wait') {
    return 'Conditions are not aligned for a low-risk entry according to the SOP.';
  }
  return '';
}

function buildDailyContext(res) {
  // Compose a concise Daily/primary summary without altering analysis
  const da = res.daily_analysis || res.primary_analysis || {};
  const zone = res.daily_zone || res.primary_zone || {};
  const parts = [];
  if (da.trend) parts.push(`trend: ${da.trend}`);
  if (da.signal) parts.push(`signal: ${String(da.signal).toLowerCase()}`);
  const priceLow = zone.price_low || da.zone_price_low;
  const priceHigh = zone.price_high || da.zone_price_high;
  const zType = zone.type || da.zone_type;
  if (priceLow && priceHigh) {
    const z = zType ? ` ${zType}` : '';
    parts.push(`zone${z}: ${priceLow}-${priceHigh}`);
  }
  return parts.join(', ');
}

function buildConciseWhy(res, strategy) {
  const s = (strategy || '').toLowerCase();
  const entry = res.m30_analysis || res.entry_analysis || {};
  // Prefer explicit inside_daily_zone signal (mainly swing)
  if (typeof entry.inside_daily_zone === 'boolean') {
    return entry.inside_daily_zone
      ? 'M30 confirmation inside Daily zone.'
      : 'M30 setup not inside Daily zone yet.';
  }
  // General concise fallback per strategy
  if (s === 'swing') return 'Awaiting M30 confirmation inside Daily zone.';
  if (s === 'scalping') return 'Lower timeframe confirmation at active zone.';
  return 'Entry confirmation status summarized.';
}

function buildRationale(res, strategy) {
  const parts = [];
  // Trend or micro trend
  if (res.trend) parts.push(`Trend: ${res.trend}`);
  if (res.micro_trend) parts.push(`Micro trend: ${res.micro_trend}`);
  // Pattern
  if (res.pattern) parts.push(`Pattern: ${res.pattern.replace('_',' ')}`);

  // Zone price range
  const zone = res.daily_zone || res.primary_zone;
  if (zone && zone.price_low && zone.price_high) {
    const zoneType = zone.type || (res.signal === 'buy' ? 'support' : 'resistance');
    parts.push(`Zone: ${zone.price_low} - ${zone.price_high} (${zoneType})`);
  }

  const why = buildConciseWhy(res, strategy);
  if (why) parts.push(`Why: ${why}`);

  // Action hint with zone range
  let action;
  if (res.signal === 'buy') {
    const zoneStr = zone && zone.price_low && zone.price_high
      ? ` in the ${zone.price_low}-${zone.price_high} zone`
      : '';
    action = `Consider buy setups near the highlighted support${zoneStr} with confirmation.`;
  } else if (res.signal === 'sell') {
    const zoneStr = zone && zone.price_low && zone.price_high
      ? ` in the ${zone.price_low}-${zone.price_high} zone`
      : '';
    action = `Consider sell setups near the highlighted resistance${zoneStr} with confirmation.`;
  } else {
    action = 'No trade: wait for a fresh signal within the zone.';
  }
  parts.push(`Action: ${action}`);
  return parts.join('\n');
}

function retryKeyboard(pair, strategy) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Retry Analysis', callback_data: `retry_${pair}_${strategy}` },
          { text: 'Back to Menu', callback_data: 'back_to_menu' }
        ]
      ]
    }
  };
}
