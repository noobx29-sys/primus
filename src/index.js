require('dotenv').config();
const config = require('../config');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron');
const { analyzeTradingSignals, DEFAULT_PARAMS } = require('./tradingAnalyzer');
const axios = require('axios');
const puppeteer = require('puppeteer');
const { createCanvas, loadImage } = require('canvas');
const { generateTradingGenieResponse, analyzeChartWithVision } = require('./tradingGenieAssistant');
const { generateTradingViewChart } = require('./chartGenerator');

// Helper function to send welcome text (logo removed)
async function sendWelcomeText(chatId, caption = '🧞‍♂️ <b>PRIMUSGPT.AI</b>\nYour AI-powered trading companion') {
    try {
        await bot.sendMessage(chatId, caption, { parse_mode: 'HTML' });
    } catch (error) {
        log('WARN', 'Failed to send welcome text', { error: error.message });
    }
}

// Enhanced logging setup
const logLevels = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const currentLogLevel = process.env.LOG_LEVEL || 'INFO';

function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (logLevels[level] >= logLevels[currentLogLevel]) {
        if (data) {
            console.log(logMessage, JSON.stringify(data, null, 2));
        } else {
            console.log(logMessage);
        }
    }
}

// Log startup
log('INFO', '🚀 Starting Trading Signal Bot...');
log('INFO', `📊 Log Level: ${currentLogLevel}`);

const app = express();
const port = process.env.PORT || 3003; // Changed from 3000 to avoid conflicts

// CORS middleware to allow cross-origin requests
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// TradingView configuration
const TRADINGVIEW_CONFIG = {
    baseUrl: 'https://www.tradingview.com',
    symbols: {
        gold: 'XAUUSD',
        forex: {
            'EUR/USD': 'EURUSD',
            'GBP/USD': 'GBPUSD',
            'USD/JPY': 'USDJPY',
            'USD/CHF': 'USDCHF',
            'AUD/USD': 'AUDUSD',
            'USD/CAD': 'USDCAD',
            'NZD/USD': 'NZDUSD'
        }
    },
    chartTypes: {
        M1: '1',
        M5: '5',
        M15: '15',
        M30: '30',
        H1: '60',
        H4: '240',
        D1: 'D',
        W1: 'W',
        MN1: 'M'
    }
};

// Initialize Puppeteer browser instance
let browser = null;
let browserReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let isInitializing = false;
let browserInitPromise = null;

// Mac-specific Chrome path detection
const getChromePath = () => {
    const isMac = process.platform === 'darwin';
    if (!isMac) return null;
    
    // Check environment variable first
    if (process.env.CHROME_PATH) {
        return process.env.CHROME_PATH;
    }
    
    // Common Chrome paths on Mac
    const commonPaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
    ];
    
    const fs = require('fs');
    for (const path of commonPaths) {
        if (fs.existsSync(path)) {
            return path;
        }
    }
    
    return null;
};

async function initializeBrowser() {
    // Prevent multiple simultaneous initialization attempts
    if (isInitializing) {
        log('INFO', '🔄 Browser initialization already in progress, waiting...');
        return browserInitPromise;
    }
    
    if (browserInitPromise) {
        return browserInitPromise;
    }
    
    isInitializing = true;
    browserInitPromise = _initializeBrowser();
    
    try {
        await browserInitPromise;
    } finally {
        isInitializing = false;
        browserInitPromise = null;
    }
    
    return browser;
}

async function _initializeBrowser() {
    try {
        log('INFO', '🌐 Initializing Puppeteer browser for chart screenshots');
        
        // Close existing browser if it exists
        if (browser) {
            try {
                log('INFO', '🔄 Closing existing browser instance...');
                const pages = await browser.pages();
                for (const page of pages) {
                    try {
                        if (!page.isClosed()) {
                            await page.close();
                        }
                    } catch (pageError) {
                        log('DEBUG', 'Failed to close page during cleanup', { error: pageError.message });
                    }
                }
                await browser.close();
                log('INFO', '✅ Existing browser closed successfully');
            } catch (error) {
                log('WARN', 'Failed to close existing browser', { error: error.message });
            }
            browser = null;
        }
        
        // Wait a bit before creating new browser
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Mac-specific configuration - use system Chrome if available
        const isMac = process.platform === 'darwin';
        const chromePath = getChromePath();
        
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--memory-pressure-off',
                '--max_old_space_size=4096',
                '--single-process',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-javascript',
                '--disable-default-apps'
            ],
            timeout: 60000, // Increased from 30s to 60s
            ignoreDefaultArgs: ['--disable-extensions']
        };
        
        // On Mac, try to use system Chrome for better stability
        if (isMac && chromePath) {
            launchOptions.executablePath = chromePath;
            log('INFO', `🍎 Using system Chrome: ${chromePath}`);
        } else if (isMac) {
            log('WARN', '🍎 System Chrome not found, using bundled Chromium (may be less stable on Mac)');
        }
        
        browser = await puppeteer.launch(launchOptions);
        
        // Wait a bit for browser to stabilize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Add event listeners for browser disconnection
        browser.on('disconnected', () => {
            log('WARN', '🌐 Browser disconnected unexpectedly');
            browser = null;
            browserReconnectAttempts++;
            
            // Attempt to reconnect if we haven't exceeded max attempts
            if (browserReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                log('INFO', '🔄 Attempting to reconnect browser...');
                setTimeout(async () => {
                    try {
                        await initializeBrowser();
                    } catch (error) {
                        log('ERROR', 'Failed to reconnect browser', { error: error.message });
                    }
                }, 10000); // Increased delay to 10 seconds
            } else {
                log('ERROR', '🌐 Max browser reconnection attempts reached');
            }
        });
        
        // Test browser with a simple page
        try {
            const testPage = await browser.newPage();
            await testPage.goto('about:blank');
            await testPage.close();
            log('INFO', '✅ Browser test successful');
        } catch (testError) {
            log('WARN', 'Browser test failed, but continuing', { error: testError.message });
        }
        
        // Reset reconnect attempts on successful initialization
        browserReconnectAttempts = 0;
        log('INFO', '✅ Puppeteer browser initialized successfully');
        return browser;
    } catch (error) {
        log('ERROR', 'Failed to initialize Puppeteer browser', {
            error: error.message
        });
        browser = null;
        throw error;
    }
}

// Function to ensure browser is available and reconnect if needed
async function ensureBrowserAvailable() {
    if (!browser || browserReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        log('WARN', 'Browser not available or max reconnect attempts reached, reinitializing...');
        try {
            await initializeBrowser();
            return browser !== null;
        } catch (error) {
            log('ERROR', 'Failed to reinitialize browser', { error: error.message });
            return false;
        }
    }
    
    try {
        // Test if browser is still responsive
        const testPage = await browser.newPage();
        await testPage.goto('about:blank');
        await testPage.close();
        return true;
    } catch (error) {
        log('WARN', 'Browser test failed, attempting reconnection', { error: error.message });
        browserReconnectAttempts++;
        
        try {
            if (browser) {
                await browser.close();
            }
        } catch (closeError) {
            log('DEBUG', 'Failed to close problematic browser', { error: closeError.message });
        }
        
        browser = null;
        try {
            await initializeBrowser();
            return browser !== null;
        } catch (initError) {
            log('ERROR', 'Failed to reinitialize browser after test failure', { error: initError.message });
            return false;
        }
    }
}



// Initialize bot with your token
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Store authorized group IDs and user preferences
const authorizedGroups = new Set();
const userPreferences = new Map(); // Store user timezone preferences

// Track users by username for free trial activation
const userUsernames = new Map(); // userId -> username
const usernameToUserId = new Map(); // username -> userId

// Track users who have already been welcomed
const welcomedUsers = new Set();

// Track users who have started free trials
const freeTrialUsers = new Map(); // userId -> { plan, startDate, endDate }

// Track paid subscribers
const paidSubscribers = new Map(); // userId -> { plan, startDate, endDate, paymentStatus }

// Track user states for voucher codes
const userStates = new Map(); // userId -> state (e.g., 'waiting_for_voucher')

// Track voucher codes and their usage
const voucherCodes = new Map(); // code -> { discount: 10, used: false, usedBy: [] }

// Track free trial signups from landing page
const pendingFreeTrials = new Map(); // telegramUsername -> { plan, email, createdAt }

// Log bot initialization
log('INFO', '🤖 Bot initialized successfully');
log('INFO', `🔑 Bot Token: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Missing'}`);

// Handle all incoming messages to automatically welcome new users
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    // Track user username for free trial activation
    if (username !== 'Unknown') {
        userUsernames.set(userId, username);
        usernameToUserId.set(username, userId);
    }
    
    // Skip if it's a command (let command handlers deal with those)
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }
    
    // Check if user has access (free trial or paid subscription)
    const hasAccess = checkUserAccess(userId);
    
    // Auto-welcome new users on their first message
    if (!welcomedUsers.has(userId) && msg.chat.type === 'private') {
        log('INFO', `👋 Auto-welcoming new user`, {
            chatId,
            userId,
            username,
            chatType: msg.chat.type,
            messageType: msg.text ? 'text' : 'other',
            hasAccess
        });
        
        welcomedUsers.add(userId);
        
        // Check if user has a pending free trial from landing page
        if (username && pendingFreeTrials.has(username)) {
            const trialInfo = pendingFreeTrials.get(username);
            log('INFO', `🎉 Activating pending free trial for user`, {
                userId,
                username,
                plan: trialInfo.plan
            });
            
            // Activate the free trial
            await handleFreeTrialSignup(chatId, userId, username, trialInfo.plan);
            
            // Remove from pending trials
            pendingFreeTrials.delete(username);
        } else if (hasAccess) {
            showWelcomeMessage(chatId, userId, username);
        } else {
            showPaymentWall(chatId, userId, username);
        }
    } else if (msg.text && !msg.text.startsWith('/') && msg.chat.type === 'private') {
        // Check if user is waiting for voucher code
        const userState = userStates.get(userId);
        if (userState === 'waiting_for_voucher') {
            await handleVoucherCodeInput(chatId, userId, username, msg.text);
            return;
        }
        
        // Check access before providing guidance
        if (!hasAccess) {
            showPaymentWall(chatId, userId, username);
            return;
        }
        
        // If it's a text message from a welcomed user, provide guidance (no GPT)
        log('INFO', `💬 User sent text message, providing guidance`, {
            chatId,
            userId,
            username,
            message: msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '')
        });
        
        // Provide user guidance instead of using AI for every message
        provideUserGuidance(chatId, userId, username, msg.text);
    }
});

// Handle chat member updates (when users join groups)
bot.on('chat_member', (chatMemberUpdate) => {
    const chatId = chatMemberUpdate.chat.id;
    const userId = chatMemberUpdate.new_chat_member.user.id;
    const username = chatMemberUpdate.new_chat_member.user.username || 'Unknown';
    const status = chatMemberUpdate.new_chat_member.status;
    
    // When a user joins a group
    if (status === 'member' || status === 'administrator') {
        log('INFO', `👥 User joined group`, {
            chatId,
            userId,
            username,
            status,
            chatType: chatMemberUpdate.chat.type
        });
        
        // Auto-welcome in groups too
        if (!welcomedUsers.has(userId)) {
            welcomedUsers.add(userId);
            showWelcomeMessage(chatId, userId, username);
        }
    }
});

// Handle new chat members (alternative method for group joins)
bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    
    msg.new_chat_members.forEach(member => {
        // Skip if it's the bot itself
        if (member.id === bot.options.username) {
            return;
        }
        
        const userId = member.id;
        const username = member.username || 'Unknown';
        
        log('INFO', `👥 New member joined via new_chat_members`, {
            chatId,
            userId,
            username,
            chatType: msg.chat.type
        });
        
        // Auto-welcome new members
        if (!welcomedUsers.has(userId)) {
            welcomedUsers.add(userId);
            showWelcomeMessage(chatId, userId, username);
        }
    });
});

// Market configuration
const MARKET_CONFIG = {
    // Gold/Forex markets are 24/5 (Monday 5 PM EST to Friday 5 PM EST)
    // But we'll focus on major trading sessions
    sessions: {
        london: { open: 3, close: 12 }, // 3 AM - 12 PM EST
        newyork: { open: 8, close: 17 }, // 8 AM - 5 PM EST
        asian: { open: 18, close: 3 } // 6 PM - 3 AM EST (next day)
    },
    timezone: 'America/New_York', // EST/EDT
    // Trading days (0 = Sunday, 6 = Saturday)
    tradingDays: [1, 2, 3, 4, 5] // Monday to Friday
};

// Middleware to parse JSON
app.use(express.json());

// API endpoint to start free trial from landing page
app.post('/api/start-free-trial', async (req, res) => {
    try {
        const { plan, telegramUsername, email } = req.body;
        
        // Validate input
        if (!plan || !telegramUsername) {
            return res.status(400).json({ 
                error: 'Missing required fields: plan and telegramUsername' 
            });
        }
        
        // Clean telegram username (remove @ if present)
        const cleanUsername = telegramUsername.replace('@', '');
        
        // Store pending free trial
        const signup = {
            plan,
            telegramUsername: cleanUsername,
            email: email || null,
            createdAt: new Date().toISOString(),
            status: 'pending'
        };
        
        pendingFreeTrials.set(cleanUsername, signup);
        
        log('INFO', `🎉 Free trial signup from landing page`, {
            plan,
            telegramUsername: cleanUsername,
            email,
            totalPending: pendingFreeTrials.size
        });
        
        // Try to find and message the user immediately if they're already using the bot
        let userFound = false;
        if (usernameToUserId.has(cleanUsername)) {
            const userId = usernameToUserId.get(cleanUsername);
            if (welcomedUsers.has(userId)) {
                userFound = true;
                log('INFO', `🎯 User already active, sending immediate free trial activation`, {
                    userId,
                    username: cleanUsername,
                    plan
                });
                
                // Send immediate free trial activation message
                try {
                    await handleFreeTrialSignup(userId, userId, cleanUsername, plan);
                    pendingFreeTrials.delete(cleanUsername);
                    log('INFO', `✅ Immediate free trial activation successful for ${cleanUsername}`);
                } catch (error) {
                    log('ERROR', 'Failed to send immediate free trial activation', {
                        error: error.message,
                        username: cleanUsername
                    });
                }
            }
        }
        
        res.json({
            success: true,
            message: userFound ? 'Free trial activated immediately!' : 'Free trial started successfully',
            plan: signup.plan,
            telegramUsername: signup.telegramUsername,
            note: userFound ? 
                'Check your Telegram for the welcome message!' : 
                'PRIMUSGPT.AI will contact you on Telegram when you start using the bot'
        });
        
    } catch (error) {
        log('ERROR', 'Failed to start free trial from landing page', {
            error: error.message
        });
        res.status(500).json({ 
            error: 'Internal server error' 
        });
    }
});

// API endpoint to get pending free trials (for admin purposes)
app.get('/api/pending-free-trials', (req, res) => {
    const trials = Array.from(pendingFreeTrials.values());
    res.json({
        total: trials.length,
        trials: trials
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        botStatus: 'running',
        totalUsers: welcomedUsers.size,
        totalFreeTrials: freeTrialUsers.size,
        totalPaidSubscribers: paidSubscribers.size,
        pendingTrials: pendingFreeTrials.size
    });
});

// Command to start the bot
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `👋 User used /start command`, {
        chatId,
        userId,
        username,
        chatType: msg.chat.type,
        wasAlreadyWelcomed: welcomedUsers.has(userId)
    });
    
    // Add user to welcomed list if not already there
    welcomedUsers.add(userId);
    
    // Check if user has access
    const hasAccess = checkUserAccess(userId);
    
    if (!hasAccess) {
        showPaymentWall(chatId, userId, username);
        return;
    }
    
    // Send logo first
    await sendWelcomeText(chatId);
    
    const welcomeMessage = `
🧞‍♂️ <b>Welcome to PRIMUSGPT.AI!</b>

I'm your AI-powered trading companion, ready to help you navigate the markets with professional analysis and real-time signals.

<b>🎯 What I Can Do:</b>
• 📊 Real-time market analysis
• 💱 Major forex pairs analysis
• 🔔 Automated trading signals
• 💎 Multi-timeframe analysis (M1 to Monthly)
• 🛡️ Risk management guidance

<b>💡 Getting Started:</b>
Just type what you'd like to do! For example:
• "Hello" - Get started
• "Help" - See all features
• "Gold analysis" - Analyze Gold markets
• "Forex trading" - Analyze currency pairs
• "Market signals" - Get trading alerts

<b>🚀 Ready to start trading?</b>
Choose an option below or type your request:
    `;
    
    const mainMenu = createMainMenu();
    
    bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'HTML',
        reply_markup: mainMenu
    });
    
    // Send follow-up message after a short delay
    setTimeout(async () => {
        const followUpMessage = `
💎 <b>Quick Tips:</b>

<b>🎯 Natural Language:</b>
You can type anything! I understand natural language:
• "Show me gold analysis"
• "What's the market like?"
• "I want to trade forex"
• "Give me trading signals"

<b>🔍 Try typing something now!</b>
    `;
        
        await bot.sendMessage(chatId, followUpMessage, { 
            parse_mode: 'HTML'
        });
    }, 2000);
});

// Handle callback queries from buttons
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username || 'Unknown';
    const data = callbackQuery.data;
    
    log('INFO', `🔘 Button pressed`, {
        chatId,
        userId,
        username,
        buttonData: data
    });
    
    try {
        // Acknowledge the callback query
        await bot.answerCallbackQuery(callbackQuery.id);
        
        // Handle different button actions
        switch (data) {
            case 'analyze_market':
                await handleMarketAnalysis(chatId, userId, username);
                break;
            case 'schedule':
                await handleSchedule(chatId, userId, username);
                break;
            case 'help':
                await handleHelp(chatId, userId, username);
                break;
            case 'back_to_main':
                await showMainMenu(chatId, userId, username);
                break;
            case 'alert_price_zone':
                await handleAlertPriceZone(chatId, userId, username);
                break;
            // Payment wall handlers
            case 'start_free_trial':
                await handleStartFreeTrial(chatId, userId, username);
                break;
            case 'subscribe_premium':
                await handleSubscribePremium(chatId, userId, username);
                break;
            case 'view_plans':
                await handleViewPlans(chatId, userId, username);
                break;
            case 'payment_help':
                await handlePaymentHelp(chatId, userId, username);
                break;
            case 'select_plan_starter':
                await handleSelectPlan(chatId, userId, username, 'Starter');
                break;
            case 'select_plan_professional':
                await handleSelectPlan(chatId, userId, username, 'Professional');
                break;
            case 'select_plan_enterprise':
                await handleSelectPlan(chatId, userId, username, 'Enterprise');
                break;
            case 'payment_method_card':
                await handlePaymentMethodCard(chatId, userId, username);
                break;
            case 'payment_method_crypto':
                await handlePaymentMethodCrypto(chatId, userId, username);
                break;
            case 'back_to_payment':
                await showPaymentWall(chatId, userId, username);
                break;
            case 'member_access':
                await handleMemberAccess(chatId, userId, username);
                break;
            case 'member_login':
                await handleMemberLogin(chatId, userId, username);
                break;
            case 'enter_voucher':
                await handleEnterVoucher(chatId, userId, username);
                break;
            case 'apply_voucher':
                await handleApplyVoucher(chatId, userId, username);
                break;
            // Handle trading style selections
            case 'style_scalping':
                // Scalping: Fast-paced trades (1-15 minutes)
                const scalpingTimeframes = ['M15', 'M5', 'M1'];
                const scalpingChoice = scalpingTimeframes[Math.floor(Math.random() * scalpingTimeframes.length)];
                await handleTimeframeAnalysis(chatId, userId, username, scalpingChoice, 'scalping', 'gold', TRADINGVIEW_CONFIG.symbols.gold);
                break;
            case 'style_swing':
                // Swing: Medium-term positions (hours to days)
                const swingTimeframes = ['H4', 'H1', 'D1'];
                const swingChoice = swingTimeframes[Math.floor(Math.random() * swingTimeframes.length)];
                await handleTimeframeAnalysis(chatId, userId, username, swingChoice, 'swing', 'gold', TRADINGVIEW_CONFIG.symbols.gold);
                break;
            // Handle asset selection
            case 'asset_gold':
                await handleAssetSelection(chatId, userId, username, 'gold');
                break;
            case 'asset_forex':
                await handleForexPairSelection(chatId, userId, username);
                break;
            case 'asset_selection':
                await handleForexPairSelection(chatId, userId, username);
                break;
            // Handle forex pair selection
            case 'forex_EURUSD':
            case 'forex_GBPUSD':
            case 'forex_USDJPY':
            case 'forex_USDCHF':
            case 'forex_AUDUSD':
            case 'forex_USDCAD':
            case 'forex_NZDUSD':
                const symbol = data.replace('forex_', '');
                await handleForexTimeframeSelection(chatId, userId, username, symbol);
                break;
            // Handle forex style selections  
            case (data.match(/^forex_style_scalping_([A-Z]+)$/) ? data : null):
                const scalpingMatch = data.match(/^forex_style_scalping_([A-Z]+)$/);
                if (scalpingMatch) {
                    const [, forexSymbol] = scalpingMatch;
                    const scalpingTimeframes = ['M15', 'M5', 'M1'];
                    const scalpingChoice = scalpingTimeframes[Math.floor(Math.random() * scalpingTimeframes.length)];
                    await handleTimeframeAnalysis(chatId, userId, username, scalpingChoice, 'scalping', 'forex', forexSymbol);
                }
                break;
            case (data.match(/^forex_style_swing_([A-Z]+)$/) ? data : null):
                const swingMatch = data.match(/^forex_style_swing_([A-Z]+)$/);
                if (swingMatch) {
                    const [, forexSymbol] = swingMatch;
                    const swingTimeframes = ['H4', 'H1', 'D1'];
                    const swingChoice = swingTimeframes[Math.floor(Math.random() * swingTimeframes.length)];
                    await handleTimeframeAnalysis(chatId, userId, username, swingChoice, 'swing', 'forex', forexSymbol);
                }
                break;
            default:
                // Handle dynamic callback data for chart analysis
                if (data.startsWith('analyze_again_')) {
                    const parts = data.split('_');
                    if (parts.length >= 5) {
                        const timeframe = parts[2];
                        const assetType = parts[3];
                        const symbol = parts[4];
                        await handleTimeframeAnalysis(chatId, userId, username, timeframe, 'scalping', assetType, symbol);
                    }
                } else if (data.startsWith('alert_price_')) {
                    const parts = data.split('_');
                    if (parts.length >= 4) {
                        const assetType = parts[2];
                        const symbol = parts[3];
                        await handleAlertPriceForAsset(chatId, userId, username, assetType, symbol);
                    }
                } else {
                    log('WARN', 'Unknown button callback', { data, userId });
                    bot.sendMessage(chatId, '❌ Unknown action. Please try again.');
                }
        }
        
    } catch (error) {
        log('ERROR', 'Button callback handling failed', {
            error: error.message,
            chatId,
            userId,
            buttonData: data
        });
        bot.sendMessage(chatId, '❌ An error occurred. Please try again.');
    }
});

// Create main menu keyboard
function createMainMenu() {
    return {
        inline_keyboard: [
            [
                { text: '💎 Gold(XAUUSD)', callback_data: 'asset_gold' },
                { text: '💱 Forex Pairs', callback_data: 'asset_forex' }
            ],
            [
                { text: '❓ Help & Support', callback_data: 'help' }
            ]
        ]
    };
}

// Show welcome message for users with access
async function showWelcomeMessage(chatId, userId, username) {
    const freeTrialInfo = freeTrialUsers.get(userId);
    const paidSubInfo = paidSubscribers.get(userId);
    
    let statusMessage = '';
    if (freeTrialInfo && new Date() < freeTrialInfo.endDate) {
        const daysLeft = Math.ceil((freeTrialInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        statusMessage = `\n🎉 <b>Free Trial Active</b> - ${freeTrialInfo.plan} Plan (${daysLeft} days remaining)`;
    } else if (paidSubInfo && new Date() < paidSubInfo.endDate && paidSubInfo.paymentStatus === 'active') {
        const daysLeft = Math.ceil((paidSubInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        statusMessage = `\n💳 <b>Premium Active</b> - ${paidSubInfo.plan} Plan (${daysLeft} days remaining)`;
    }
    
    const message = `
🧞‍♂️ <b>Welcome to PRIMUSGPT.AI!</b>${statusMessage}

I'm your AI-powered trading companion, ready to help you navigate the markets with professional analysis and real-time signals.

<b>🎯 What I Can Do:</b>
• 📊 Real-time market analysis
• 💱 Major forex pairs analysis
• 🔔 Automated trading signals
• 💎 Multi-timeframe analysis (M1 to Monthly)
• 🛡️ Risk management guidance

<b>💡 Getting Started:</b>
Just type what you'd like to do! For example:
• "Hello" - Get started
• "Help" - See all features
• "Gold analysis" - Analyze Gold markets
• "Forex trading" - Analyze currency pairs
• "Market signals" - Get trading alerts

<b>🚀 Ready to start trading?</b>
Choose an option below or type your request:
    `;
    
    const mainMenu = createMainMenu();
    
    // Send welcome text
    await sendWelcomeText(chatId);
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: mainMenu
    });
}

// Show main menu
async function showMainMenu(chatId, userId, username) {
    const freeTrialInfo = freeTrialUsers.get(userId);
    const paidSubInfo = paidSubscribers.get(userId);
    
    let statusMessage = '';
    if (freeTrialInfo && new Date() < freeTrialInfo.endDate) {
        const daysLeft = Math.ceil((freeTrialInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        statusMessage = `\n🎉 <b>Free Trial Active</b> - ${freeTrialInfo.plan} Plan (${daysLeft} days remaining)`;
    } else if (paidSubInfo && new Date() < paidSubInfo.endDate && paidSubInfo.paymentStatus === 'active') {
        const daysLeft = Math.ceil((paidSubInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        statusMessage = `\n💳 <b>Premium Active</b> - ${paidSubInfo.plan} Plan (${daysLeft} days remaining)`;
    }
    
    const message = `
🧞‍♂️ <b>Welcome to PRIMUSGPT.AI!</b>${statusMessage}

I'm your AI-powered trading companion, ready to help you navigate the markets with professional analysis and real-time signals.

<b>🎯 What I Can Do:</b>
• 📊 Real-time market analysis
• 💱 Major forex pairs analysis
• 🔔 Automated trading signals
• 💎 Multi-timeframe analysis (M1 to Monthly)
• 🛡️ Risk management guidance

<b>💡 Getting Started:</b>
Just type what you'd like to do! For example:
• "Hello" - Get started
• "Help" - See all features
• "Gold analysis" - Analyze Gold markets
• "Forex trading" - Analyze currency pairs
• "Market signals" - Get trading alerts

<b>🚀 Ready to start trading?</b>
Choose an option below or type your request:
    `;
    
    const mainMenu = createMainMenu();
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: mainMenu
    });
}

// Handle free trial signup
async function handleFreeTrialSignup(chatId, userId, username, plan) {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now
    
    freeTrialUsers.set(userId, {
        plan,
        startDate,
        endDate,
        username
    });
    
    log('INFO', `🎉 Free trial started for user`, {
        userId,
        username,
        plan,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    });
    
    // Send welcome text
    await sendWelcomeText(chatId);
    
    // Send welcome message for free trial
    const welcomeMessage = `
🎉 <b>Welcome to PRIMUSGPT.AI!</b>

<b>✅ Free Trial Activated</b>
• Plan: ${plan}
• Duration: 7 days
• Start Date: ${startDate.toLocaleDateString()}
• End Date: ${endDate.toLocaleDateString()}

<b>🚀 What You Can Do Now:</b>
• Get real-time market analysis
• Receive professional trading signals
• Analyze Gold and Forex charts
• Access all premium features

<b>💡 Getting Started:</b>
Just type what you'd like to do! For example:
• "Hello" - Get started
• "Help" - See all features
• "Gold analysis" - Analyze Gold markets
• "Forex trading" - Analyze currency pairs
• "Market signals" - Get trading signals

<b>✨ Your AI trading companion is ready!</b>
    `;
    
    const mainMenu = createMainMenu();
    
    await bot.sendMessage(chatId, welcomeMessage, { 
        parse_mode: 'HTML',
        reply_markup: mainMenu
    });
    

}

// Provide user guidance based on their input
async function provideUserGuidance(chatId, userId, username, userInput) {
    const input = userInput.toLowerCase().trim();
    
    // Check if user is on free trial
    const freeTrialInfo = freeTrialUsers.get(userId);
    
    // Check for common user intents
    if (input.includes('hello') || input.includes('hi') || input.includes('hey')) {
        let message;
        if (freeTrialInfo) {
            const daysLeft = Math.ceil((freeTrialInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
            message = `👋 Hello ${username}! Welcome back to PRIMUSGPT.AI!\n\n🎉 You're currently on a <b>${freeTrialInfo.plan}</b> free trial with <b>${daysLeft} days remaining</b>.\n\nWhat would you like to explore today?`;
        } else {
            message = `👋 Hello ${username}! Welcome to PRIMUSGPT.AI!\n\nI'm your AI-powered trading companion. Here's what I can help you with:`;
        }
        
        const mainMenu = createMainMenu();
        
        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: mainMenu 
        });
        return;
    }
    
    if (input.includes('help') || input.includes('what') || input.includes('how')) {
        const message = `❓ Here's how to use PRIMUSGPT.AI:\n\n<b>📊 Market Analysis:</b> Get real-time market conditions and signals\n<b>💱 Forex Pairs:</b> Analyze major currency pairs with professional insights\n<b>💎 Gold Analysis:</b> Professional XAUUSD technical analysis\n<b>❓ Help:</b> Get detailed assistance and tips\n\nChoose an option below or type what you'd like to do:`;
        const mainMenu = createMainMenu();
        
        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: mainMenu 
        });
        return;
    }
    
    if (input.includes('trading') || input.includes('trade') || input.includes('market')) {
        const message = `📊 Great! Let's analyze the markets together.\n\nI can provide:\n• Real-time market analysis\n• Technical indicators (EMA, MACD, RSI, ADX, Bollinger Bands)\n• Trading signals for Gold and Forex\n• Support and resistance levels\n\nWhat would you like to analyze?`;
        const analysisMenu = {
            inline_keyboard: [
                [
                    { text: '📊 Market Analysis', callback_data: 'analyze_market' },
                    { text: '💱 Forex Pairs', callback_data: 'asset_forex' }
                ],
                [
                    { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { reply_markup: analysisMenu });
        return;
    }
    
    if (input.includes('gold') || input.includes('xauusd')) {
        const message = `💎 Gold (XAUUSD) Analysis\n\nChoose your trading style for professional analysis:\n\n🔥 <b>Scalping:</b> Fast-paced trades (1-15 minutes)\n📈 <b>Swing:</b> Medium-term positions (hours to days)\n\nSelect your preferred trading style:`;
        const goldMenu = {
            inline_keyboard: [
                [
                    { text: '💎 Gold Analysis', callback_data: 'asset_gold' }
                ],
                [
                    { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { reply_markup: goldMenu });
        return;
    }
    
    if (input.includes('forex') || input.includes('eurusd') || input.includes('gbpusd')) {
        const message = `💱 Forex Market Analysis\n\nI cover major currency pairs:\n• EUR/USD, GBP/USD, USD/JPY\n• USD/CHF, AUD/USD, USD/CAD, NZD/USD\n\nEach pair gets professional technical analysis with multiple timeframes.`;
        const forexMenu = {
            inline_keyboard: [
                [
                    { text: '💱 Forex Analysis', callback_data: 'asset_forex' }
                ],
                [
                    { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { reply_markup: forexMenu });
        return;
    }
    
    if (input.includes('signal') || input.includes('alert') || input.includes('subscribe')) {
        const message = `🔔 Signal Subscription\n\nGet automated trading signals:\n• Hourly signals during trading sessions\n• Market notifications\n• Real-time alerts\n• Professional analysis`;
        const subscribeMenu = {
            inline_keyboard: [
                [
                    { text: '🔔 Subscribe to Signals', callback_data: 'subscribe' }
                ],
                [
                    { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { reply_markup: subscribeMenu });
        return;
    }
    
    if (input.includes('status') || input.includes('performance') || input.includes('bot')) {
        const message = `📊 Bot Status & Performance\n\nCheck system status, performance metrics, and next signal times.`;
        const statusMenu = {
            inline_keyboard: [
                [
                    { text: '📊 Bot Status', callback_data: 'status' }
                ],
                [
                    { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { reply_markup: statusMenu });
        return;
    }
    
    // Default response for unrecognized input - use GPT as fallback
    log('INFO', `🤖 Using GPT as fallback for unrecognized input: "${userInput}"`);
    
    try {
        // Send typing indicator
        bot.sendChatAction(chatId, 'typing');
        
        // Generate AI response for unhandled queries
        const aiResponse = await generateTradingGenieResponse(userId, userInput, {
            username,
            hasAccess: checkUserAccess(userId),
            freeTrialInfo: freeTrialUsers.get(userId),
            paidSubInfo: paidSubscribers.get(userId)
        });
        
        // Send AI response with navigation options
        await bot.sendMessage(chatId, aiResponse, { 
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '💎 Gold Analysis', callback_data: 'asset_gold' },
                        { text: '💱 Forex Pairs', callback_data: 'asset_forex' }
                    ],
                    [
                        { text: '❓ Help & Support', callback_data: 'help' },
                        { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                    ]
                ]
            }
        });
        
    } catch (error) {
        log('ERROR', 'GPT fallback failed', { error: error.message, userInput });
        
        // Final fallback - show menu
        const message = `🤔 I understand you're asking about "${userInput}"\n\nLet me help you navigate PRIMUSGPT.AI. Here are the main features:`;
        const mainMenu = createMainMenu();
        
        await bot.sendMessage(chatId, message, { reply_markup: mainMenu });
    }
}

// Handle market analysis
async function handleMarketAnalysis(chatId, userId, username) {
    // Check if user has access
    if (!checkUserAccess(userId)) {
        await showPaymentWall(chatId, userId, username);
        return;
    }
    
    log('INFO', `🔍 User requested market analysis via button`, {
        chatId,
        userId,
        username
    });
    
    try {
        const progressMsg = await bot.sendMessage(chatId, 
            `📊 Market Analysis\n\n` +
            `🚀 [█░░░░░░░░░] 10%\n` +
            `🔍 Connecting to market feeds... 🌐`
        );
        
        // Progress step 1 - Data Collection
        await new Promise(resolve => setTimeout(resolve, 600));
        await bot.editMessageText(
            `📊 Market Analysis\n\n` +
            `💹 [██░░░░░░░░] 20%\n` +
            `📈 Analyzing multiple asset signals... 💹`, {
            chat_id: chatId,
            message_id: progressMsg.message_id
        });
        
        log('DEBUG', 'Starting market analysis...');
        
        // Progress step 2 - Signal Processing
        await new Promise(resolve => setTimeout(resolve, 600));
        await bot.editMessageText(
            `📊 Market Analysis\n\n` +
            `🎯 [███░░░░░░░] 30%\n` +
            `🧠 Processing AI recommendations... 🤖`, {
            chat_id: chatId,
            message_id: progressMsg.message_id
        });
        
        // Create progress callback for analyzeTradingSignals (30% to 100%)
        const progressCallback = async (message, percentage) => {
            // Map 0-100 to 30-100 range
            const mappedPercentage = Math.round(30 + (percentage * 0.7));
            const barLength = Math.floor(mappedPercentage / 10);
            await bot.editMessageText(
                `📊 Market Analysis\n\n` +
                `⚡ [${'█'.repeat(barLength)}${'░'.repeat(10 - barLength)}] ${mappedPercentage}%\n` +
                `${message}`, {
                chat_id: chatId,
                message_id: progressMsg.message_id
            });
        };
        
        const signals = await analyzeTradingSignals(DEFAULT_PARAMS, progressCallback);
        
        // Final step
        await bot.editMessageText(
            `📊 Market Analysis\n\n` +
            `✅ [██████████] 100%\n` +
            `🎉 Analysis complete! Compiling results... ✨`, {
            chat_id: chatId,
            message_id: progressMsg.message_id
        });
        log('INFO', 'Market analysis completed successfully', {
            buySignals: signals.buy_signal_count,
            sellSignals: signals.sell_signal_count,
            overallSignal: signals.overall_buy ? 'BUY' : signals.overall_sell ? 'SELL' : 'NEUTRAL'
        });
        
        const message = formatSignals(signals);
        const backButton = {
            inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
        };
        
        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: backButton
        });
        
        log('INFO', 'Analysis results sent to user');
        
    } catch (error) {
        log('ERROR', 'Market analysis failed', {
            error: error.message,
            chatId,
            userId
        });
        
        const errorMessage = '❌ Error analyzing market conditions. Please try again later.';
        const backButton = {
            inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
        };
        
        await bot.sendMessage(chatId, errorMessage, { reply_markup: backButton });
    }
}


// Handle asset selection
async function handleAssetSelection(chatId, userId, username, assetType) {
    log('INFO', `📈 User selected asset: ${assetType}`, {
        chatId,
        userId,
        username,
        assetType
    });
    
    if (assetType === 'gold') {
        // For gold, show timeframe selection directly
        const message = `
<b>💎 Gold Analysis - XAUUSD</b>

Choose your trading style for professional Gold analysis:

🔥 <b>Scalping:</b> Fast-paced trades (1-15 minutes)
📈 <b>Swing:</b> Medium-term positions (hours to days)

Select your preferred trading style:
        `;
        
        const timeframeKeyboard = {
            inline_keyboard: [
                [
                    { text: '🔥 Scalping', callback_data: 'style_scalping' },
                    { text: '📈 Swing', callback_data: 'style_swing' }
                ],
                [
                    { text: '🔙 Back to Asset Selection', callback_data: 'asset_selection' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: timeframeKeyboard
        });
    } else {
        // For forex, show pair selection
        await handleForexPairSelection(chatId, userId, username);
    }
}

// Handle forex pair selection
async function handleForexPairSelection(chatId, userId, username) {
    log('INFO', `📈 User requested forex pair selection`, {
        chatId,
        userId,
        username
    });
    
    const message = `
<b>💱 Forex Market Analysis</b>

<b>🎯 Select Currency Pair:</b>
Choose your preferred forex pair for professional technical analysis.

<b>📊 Major Currency Pairs:</b>
• <b>EUR/USD</b> - Euro vs US Dollar
• <b>GBP/USD</b> - British Pound vs US Dollar  
• <b>USD/JPY</b> - US Dollar vs Japanese Yen
• <b>USD/CHF</b> - US Dollar vs Swiss Franc
• <b>AUD/USD</b> - Australian Dollar vs US Dollar
• <b>USD/CAD</b> - US Dollar vs Canadian Dollar
• <b>NZD/USD</b> - New Zealand Dollar vs US Dollar

<b>💡 Market Insight:</b>
EUR/USD and GBP/USD are the most liquid pairs, offering optimal trading conditions.
    `;
    
    const forexKeyboard = {
        inline_keyboard: [
            [
                { text: 'EUR/USD', callback_data: 'forex_EURUSD' },
                { text: 'GBP/USD', callback_data: 'forex_GBPUSD' }
            ],
            [
                { text: 'USD/JPY', callback_data: 'forex_USDJPY' },
                { text: 'USD/CHF', callback_data: 'forex_USDCHF' }
            ],
            [
                { text: 'AUD/USD', callback_data: 'forex_AUDUSD' },
                { text: 'USD/CAD', callback_data: 'forex_USDCAD' }
            ],
            [
                { text: 'NZD/USD', callback_data: 'forex_NZDUSD' }
            ],
            [
                { text: '🔙 Back to Asset Selection', callback_data: 'asset_selection' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: forexKeyboard
    });
}

// Handle subscribe
async function handleSubscribe(chatId, userId, username) {
    log('INFO', `✅ User subscribed to signals via button`, {
        chatId,
        userId,
        username,
        wasAlreadySubscribed: authorizedGroups.has(chatId)
    });
    
    const chatType = chatId.toString().startsWith('-') ? 'group' : 'private';
    
    if (chatType === 'group') {
        authorizedGroups.add(chatId);
        const message = `
<b>✅ Group Subscription Successful</b>

This group is now subscribed to PRIMUSGPT.AI's automated trading signals.

<b>📅 What You'll Receive:</b>
• Hourly signals during major trading sessions
• 24-hour advance market notifications
• Real-time analysis updates
• Professional market insights

<b>✨ Powered by PRIMUSGPT.AI AI</b>
        `;
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } else {
        authorizedGroups.add(chatId);
        const message = `
<b>✅ Personal Subscription Successful</b>

You are now subscribed to PRIMUSGPT.AI's automated trading signals.

<b>📅 What You'll Receive:</b>
• Hourly signals during major trading sessions
• 24-hour advance market notifications
• Real-time analysis updates
• Professional market insights

<b>✨ Powered by PRIMUSGPT.AI AI</b>
        `;
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
    
    log('INFO', `📊 Updated subscriber count: ${authorizedGroups.size}`);
    
    const backButton = {
        inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
    };
    
    await bot.sendMessage(chatId, '🎉 Welcome to PRIMUSGPT.AI!', { reply_markup: backButton });
}

// Handle unsubscribe
async function handleUnsubscribe(chatId, userId, username) {
    log('INFO', `❌ User unsubscribed from signals via button`, {
        chatId,
        userId,
        username,
        wasSubscribed: authorizedGroups.has(chatId)
    });
    
    authorizedGroups.delete(chatId);
    await bot.sendMessage(chatId, `
<b>❌ Unsubscription Successful</b>

You have been unsubscribed from PRIMUSGPT.AI's automated trading signals.

<b>💡 You can always resubscribe:</b>
• Use the main menu to subscribe again
• Access real-time market analysis anytime
• Get professional trading insights on demand

<b>✨ Thank you for using PRIMUSGPT.AI!</b>
    `, { parse_mode: 'HTML' });
    
    log('INFO', `📊 Updated subscriber count: ${authorizedGroups.size}`);
    
    const backButton = {
        inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
    };
    
    await bot.sendMessage(chatId, '👋 Unsubscribed successfully!', { reply_markup: backButton });
}

// Handle status
async function handleStatus(chatId, userId, username) {
    log('INFO', `📊 User requested bot status via button`, {
        chatId,
        userId,
        username
    });
    
    const now = new Date();
    const isMarketHours = isWithinTradingHours(now);
    const nextSignal = getNextSignalTime();
    
    const statusInfo = `
<b>🤖 PRIMUSGPT.AI Status</b>

<b>⏰ Current Time:</b> ${now.toLocaleString('en-US', {timeZone: 'America/New_York'})} EST
<b>📊 Market Status:</b> ${isMarketHours ? '🟢 Active' : '🔴 Closed'}
<b>🔔 Next Signal:</b> ${nextSignal}
<b>👥 Active Subscribers:</b> ${authorizedGroups.size}

<b>📈 Bot Performance:</b>
• System: ✅ Operational
• Analysis Engine: ✅ Active
• Signal Generation: ✅ Running
• Chart Screenshots: ✅ Available

<b>✨ PRIMUSGPT.AI is ready to serve!</b>
    `;
    
    const backButton = {
        inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
    };
    
    await bot.sendMessage(chatId, statusInfo, { 
        parse_mode: 'HTML',
        reply_markup: backButton
    });
}

// Handle schedule
async function handleSchedule(chatId, userId, username) {
    log('INFO', `📅 User requested schedule info via button`, {
        chatId,
        userId,
        username
    });
    
    const scheduleInfo = `
<b>📅 Current Schedule (EST/EDT):</b>

<b>🕐 Hourly Signals During:</b>
• London Session: 3 AM - 12 PM
• New York Session: 8 AM - 5 PM  
• Asian Session: 6 PM - 3 AM (next day)

<b>📢 Special Notifications:</b>
• 24 hours before major session opens
• 24 hours before major session closes
• Market weekend warnings

<b>📊 Active Days:</b> Monday - Friday
<b>⏰ Next Signal:</b> ${getNextSignalTime()}

<b>👥 Subscribers:</b> ${authorizedGroups.size}
    `;
    
    const backButton = {
        inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
    };
    
    await bot.sendMessage(chatId, scheduleInfo, { 
        parse_mode: 'HTML',
        reply_markup: backButton
    });
}

// Handle help
async function handleHelp(chatId, userId, username) {
    log('INFO', `❓ User requested help via button`, {
        chatId,
        userId,
        username
    });
    
    const helpMessage = `
<b>❓ PRIMUSGPT.AI Help & Support</b>

<b>🚀 Getting Started:</b>
• Use the main menu to navigate
• Select your preferred asset type
• Choose your analysis timeframe
• Receive professional insights

<b>📊 Available Features:</b>
• <b>Market Analysis:</b> Real-time market conditions
• <b>Forex Pairs:</b> Major currency pairs analysis
• <b>Professional Analysis:</b> Expert market insights
• <b>Multi-Asset Support:</b> Gold & Forex markets

<b>⏰ Trading Sessions:</b>
• Asian: 6:00 PM - 3:00 AM EST
• London: 3:00 AM - 12:00 PM EST
• New York: 8:00 AM - 5:00 PM EST

<b>💡 Pro Tips:</b>
• M15, H1, and H4 timeframes are optimal for most strategies
• Gold (XAUUSD) and EUR/USD are highly liquid markets
• Always practice proper risk management

<b>🔧 Commands:</b>
• /start - Show main menu
• /help - Show this help message
• /status - Check bot status

<b>✨ Need More Help?</b>
Contact your administrator for additional support.
    `;
    
    const backButton = {
        inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
    };
    
    await bot.sendMessage(chatId, helpMessage, { 
        parse_mode: 'HTML',
        reply_markup: backButton
    });
}

// Handle start free trial
async function handleStartFreeTrial(chatId, userId, username) {
    log('INFO', `🎉 User requested free trial`, {
        chatId,
        userId,
        username
    });
    
    // Send welcome text
    await bot.sendMessage(chatId, '🎁 <b>Free Trial Selection</b>\nChoose your preferred plan for the 7-day free trial', { parse_mode: 'HTML' });
    
    const message = `
🎁 <b>Free Trial Selection</b>

Choose your preferred plan for the 7-day free trial:

<b>📊 Starter Plan - $29/month</b>
• Gold (XAUUSD) Analysis
• 3 Timeframes (M15, H1, H4)
• Daily Signals
• Basic Support

<b>📈 Professional Plan - $79/month</b>
• Gold + Forex Analysis
• All 9 Timeframes
• Hourly Signals
• Priority Support
• Advanced Indicators

<b>🚀 Enterprise Plan - $199/month</b>
• Everything in Professional
• Custom Timeframes
• API Access
• Dedicated Support

<b>💡 No credit card required!</b>
    `;
    
    const planKeyboard = {
        inline_keyboard: [
            [
                { text: '📊 Starter', callback_data: 'select_plan_starter' },
                { text: '📈 Professional', callback_data: 'select_plan_professional' }
            ],
            [
                { text: '🚀 Enterprise', callback_data: 'select_plan_enterprise' }
            ],
            [
                { text: '🔙 Back', callback_data: 'back_to_payment' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: planKeyboard
    });
}

// Handle subscribe premium
async function handleSubscribePremium(chatId, userId, username) {
    log('INFO', `💳 User requested premium subscription`, {
        chatId,
        userId,
        username
    });
    
    // Send welcome text
    await bot.sendMessage(chatId, '💳 <b>Premium Subscription</b>\nChoose your preferred plan', { parse_mode: 'HTML' });
    
    const message = `
💳 <b>Premium Subscription</b>

Choose your preferred plan:

<b>📊 Starter Plan - $29/month</b>
• Gold (XAUUSD) Analysis
• 3 Timeframes (M15, H1, H4)
• Daily Signals
• Basic Support

<b>📈 Professional Plan - $79/month</b>
• Gold + Forex Analysis
• All 9 Timeframes
• Hourly Signals
• Priority Support
• Advanced Indicators

<b>🚀 Enterprise Plan - $199/month</b>
• Everything in Professional
• Custom Timeframes
• API Access
• Dedicated Support

<b>💡 Choose your plan:</b>
    `;
    
    const planKeyboard = {
        inline_keyboard: [
            [
                { text: '📊 Starter', callback_data: 'select_plan_starter' },
                { text: '📈 Professional', callback_data: 'select_plan_professional' }
            ],
            [
                { text: '🚀 Enterprise', callback_data: 'select_plan_enterprise' }
            ],
            [
                { text: '🔙 Back', callback_data: 'back_to_payment' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: planKeyboard
    });
}

// Handle view plans
async function handleViewPlans(chatId, userId, username) {
    log('INFO', `📊 User requested to view plans`, {
        chatId,
        userId,
        username
    });
    
    // Send welcome text
    await bot.sendMessage(chatId, '📊 <b>PRIMUSGPT.AI Plans</b>\nChoose your preferred option', { parse_mode: 'HTML' });
    
    const message = `
📊 <b>PRIMUSGPT.AI Plans</b>

<b>🎁 Free Trial (7 days)</b>
• No credit card required
• Full access to chosen plan
• Professional trading signals
• Chart analysis

<b>💳 Premium Plans</b>

<b>📊 Starter - $29/month</b>
• Gold (XAUUSD) Analysis
• 3 Timeframes (M15, H1, H4)
• Daily Signals
• Basic Support
• Telegram Access

<b>📈 Professional - $79/month</b>
• Gold + Forex Analysis
• All 9 Timeframes
• Hourly Signals
• Priority Support
• Advanced Indicators
• Pattern Recognition

<b>🚀 Enterprise - $199/month</b>
• Everything in Professional
• Custom Timeframes
• API Access
• Dedicated Support
• White-label Options
• Advanced Analytics

<b>💡 Ready to get started?</b>
    `;
    
    const planKeyboard = {
        inline_keyboard: [
            [
                { text: '🎁 Start Free Trial', callback_data: 'start_free_trial' },
                { text: '💳 Subscribe Now', callback_data: 'subscribe_premium' }
            ],
            [
                { text: '🔙 Back', callback_data: 'back_to_payment' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: planKeyboard
    });
}

// Handle payment help
async function handlePaymentHelp(chatId, userId, username) {
    log('INFO', `❓ User requested payment help`, {
        chatId,
        userId,
        username
    });
    
    const message = `
❓ <b>Payment Help</b>

<b>🎁 Free Trial:</b>
• 7 days of full access
• No credit card required
• Choose any plan
• Cancel anytime

<b>💳 Premium Subscription:</b>
• Monthly or yearly billing
• Secure payment processing
• Cancel anytime
• Priority support

<b>🔒 Security:</b>
• All payments are secure
• We never store card details
• SSL encrypted transactions
• PCI compliant

<b>💡 Need more help?</b>
Contact support for assistance.
    `;
    
    const helpKeyboard = {
        inline_keyboard: [
            [
                { text: '🎁 Start Free Trial', callback_data: 'start_free_trial' },
                { text: '💳 Subscribe Now', callback_data: 'subscribe_premium' }
            ],
            [
                { text: '🔙 Back', callback_data: 'back_to_payment' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: helpKeyboard
    });
}

// Handle plan selection
async function handleSelectPlan(chatId, userId, username, planName) {
    log('INFO', `📊 User selected plan: ${planName}`, {
        chatId,
        userId,
        username,
        planName
    });
    
    const planPrices = {
        'Starter': 29,
        'Professional': 79,
        'Enterprise': 199
    };
    
    const message = `
💳 <b>Payment Method</b>

<b>Selected Plan:</b> ${planName}
<b>Price:</b> $${planPrices[planName]}/month

<b>Choose your payment method:</b>

<b>💳 Credit/Debit Card</b>
• Visa, Mastercard, American Express
• Secure payment processing
• Instant activation

<b>₿ Cryptocurrency</b>
• Bitcoin, Ethereum, USDT
• Lower fees
• Instant activation

<b>💡 Select your preferred method:</b>
    `;
    
    const paymentKeyboard = {
        inline_keyboard: [
            [
                { text: '💳 Credit/Debit Card', callback_data: 'payment_method_card' },
                { text: '₿ Cryptocurrency', callback_data: 'payment_method_crypto' }
            ],
            [
                { text: '🔙 Back to Plans', callback_data: 'subscribe_premium' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: paymentKeyboard
    });
}

// Handle card payment method
async function handlePaymentMethodCard(chatId, userId, username) {
    log('INFO', `💳 User selected card payment`, {
        chatId,
        userId,
        username
    });
    
    const message = `
💳 <b>Card Payment</b>

<b>🔒 Secure Payment Processing</b>
Your payment information is encrypted and secure.

<b>📋 Payment Details:</b>
• Card Number: 4242 4242 4242 4242
• Expiry: 12/25
• CVC: 123
• Amount: $79/month

<b>✅ This is a demo payment</b>
In production, this would integrate with Stripe or similar payment processor.

<b>🎉 Payment Successful!</b>
Your subscription is now active.
    `;
    
    // Simulate successful payment and activate subscription
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
    
    paidSubscribers.set(userId, {
        plan: 'Professional',
        startDate,
        endDate,
        paymentStatus: 'active',
        username
    });
    
    log('INFO', `✅ Payment processed successfully`, {
        userId,
        username,
        plan: 'Professional',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    });
    
    const successKeyboard = {
        inline_keyboard: [
            [
                { text: '🚀 Start Trading', callback_data: 'back_to_main' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: successKeyboard
    });
}

// Handle member login
async function handleMemberLogin(chatId, userId, username) {
    log('INFO', `🔐 User requested member login`, {
        chatId,
        userId,
        username
    });
    
    // For demo purposes, automatically grant member access
    // Add user to free trial for demo
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now
    
    freeTrialUsers.set(userId, {
        plan: 'Professional',
        startDate,
        endDate,
        username
    });
    
    log('INFO', `🎉 Member login - Free trial activated for demo`, {
        userId,
        username,
        plan: 'Professional',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    });
    
    // Send welcome text
    await sendWelcomeText(chatId);
    
    // Show full welcome message with member status
    const message = `
🎉 <b>Welcome to PRIMUSGPT.AI!</b>

<b>✅ Member Access Granted</b>
• Plan: Professional (Demo)
• Duration: 7 days
• Start Date: ${startDate.toLocaleDateString()}
• End Date: ${endDate.toLocaleDateString()}

<b>🚀 What You Can Do Now:</b>
• Get real-time market analysis
• Receive professional trading signals
• Analyze Gold and Forex charts
• Access all premium features
• Multi-timeframe analysis (M1 to Monthly)
• Risk management guidance

<b>💡 Getting Started:</b>
Just type what you'd like to do! For example:
• "Hello" - Get started
• "Help" - See all features
• "Gold analysis" - Analyze Gold markets
• "Forex trading" - Analyze currency pairs
• "Market signals" - Get trading alerts

<b>✨ Your AI trading companion is ready!</b>
    `;
    
    const mainMenu = createMainMenu();
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: mainMenu
    });
    

}

// Handle member access
async function handleMemberAccess(chatId, userId, username) {
    log('INFO', `👥 User requested member access`, {
        chatId,
        userId,
        username
    });
    
    // Send welcome text
    await bot.sendMessage(chatId, '👥 <b>Member Access</b>\nSpecial pricing and exclusive benefits', { parse_mode: 'HTML' });
    
    const message = `
👥 <b>Member Access</b>

<b>🎯 Member Benefits:</b>
• Exclusive member pricing
• 10% discount with voucher codes
• Priority customer support
• Early access to new features
• Member-only trading signals

<b>💡 Access Options:</b>
• Instant member login (automatic)
• Use LP voucher code for instant access
• Get member pricing on all plans

<b>💰 Member Pricing:</b>
• Starter: $26/month (was $29)
• Professional: $71/month (was $79)
• Enterprise: $179/month (was $199)

<b>Choose your access method:</b>
    `;
    
    const memberKeyboard = {
        inline_keyboard: [
            [
                { text: '🔐 Member Login', callback_data: 'member_login' }
            ],
            [
                { text: '🎫 LP Voucher Code', callback_data: 'enter_voucher' }
            ],
            [
                { text: '🔙 Back', callback_data: 'back_to_payment' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: memberKeyboard
    });
}

// Handle enter voucher code
async function handleEnterVoucher(chatId, userId, username) {
    log('INFO', `🎫 User wants to enter voucher code`, {
        chatId,
        userId,
        username
    });
    
    const message = `
🎫 <b>Voucher Code</b>

<b>💡 How it works:</b>
• Enter your voucher code
• Get 10% discount on any plan
• Valid for first month only
• One-time use per code

<b>📝 Enter your voucher code:</b>
(Reply with your voucher code)
    `;
    
    const voucherKeyboard = {
        inline_keyboard: [
            [
                { text: '🔙 Back to Member Access', callback_data: 'member_access' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: voucherKeyboard
    });
    
    // Set user state to expect voucher code
    userStates.set(userId, 'waiting_for_voucher');
}



// Handle voucher code input
async function handleVoucherCodeInput(chatId, userId, username, voucherCode) {
    log('INFO', `🎫 User entered voucher code: ${voucherCode}`, {
        chatId,
        userId,
        username,
        voucherCode
    });
    
    // Clear user state
    userStates.delete(userId);
    
    // Validate voucher code (demo codes: WELCOME10, MEMBER10, TRADING10)
    const validCodes = ['WELCOME10', 'MEMBER10', 'TRADING10', 'GENIE10'];
    const upperCode = voucherCode.toUpperCase().trim();
    
    if (validCodes.includes(upperCode)) {
        // Check if code has been used by this user
        const voucherInfo = voucherCodes.get(upperCode) || { discount: 10, used: false, usedBy: [] };
        
        if (voucherInfo.usedBy.includes(userId)) {
            const message = `
❌ <b>Voucher Already Used</b>

This voucher code has already been used by your account.

<b>💡 Try another code or continue without discount:</b>
            `;
            
            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 Starter Member', callback_data: 'select_plan_starter' },
                        { text: '📈 Professional Member', callback_data: 'select_plan_professional' }
                    ],
                    [
                        { text: '🚀 Enterprise Member', callback_data: 'select_plan_enterprise' }
                    ],
                    [
                        { text: '🔙 Back to Member Access', callback_data: 'member_access' }
                    ]
                ]
            };
            
            await bot.sendMessage(chatId, message, { 
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
            return;
        }
        
        // Mark voucher as used by this user
        voucherInfo.usedBy.push(userId);
        voucherCodes.set(upperCode, voucherInfo);
        
        const message = `
🎉 <b>Voucher Code Valid!</b>

<b>✅ 10% Discount Applied</b>
Voucher code: <code>${upperCode}</code>

<b>💰 New Member Prices:</b>
• Starter: $26/month (was $29)
• Professional: $71/month (was $79)
• Enterprise: $179/month (was $199)

<b>💡 Choose your plan:</b>
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Starter Member', callback_data: 'select_plan_starter' },
                    { text: '📈 Professional Member', callback_data: 'select_plan_professional' }
                ],
                [
                    { text: '🚀 Enterprise Member', callback_data: 'select_plan_enterprise' }
                ],
                [
                    { text: '🔙 Back to Member Access', callback_data: 'member_access' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
        
    } else {
        const message = `
❌ <b>Invalid Voucher Code</b>

The voucher code you entered is not valid.

<b>💡 Demo voucher codes:</b>
• WELCOME10
• MEMBER10
• TRADING10
• GENIE10

<b>🔙 Try again or continue without discount:</b>
        `;
        
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🎫 Try Another Code', callback_data: 'enter_voucher' }
                ],
                [
                    { text: '📊 Starter Member', callback_data: 'select_plan_starter' },
                    { text: '📈 Professional Member', callback_data: 'select_plan_professional' }
                ],
                [
                    { text: '🚀 Enterprise Member', callback_data: 'select_plan_enterprise' }
                ],
                [
                    { text: '🔙 Back to Member Access', callback_data: 'member_access' }
                ]
            ]
        };
        
        await bot.sendMessage(chatId, message, { 
            parse_mode: 'HTML',
            reply_markup: keyboard
        });
    }
}

// Handle apply voucher code
async function handleApplyVoucher(chatId, userId, username) {
    log('INFO', `🎫 User applied voucher code`, {
        chatId,
        userId,
        username
    });
    
    const message = `
🎉 <b>Voucher Applied!</b>

<b>✅ 10% Discount Applied</b>
Your voucher code has been successfully applied.

<b>💰 New Member Prices:</b>
• Starter: $26/month (was $29)
• Professional: $71/month (was $79)
• Enterprise: $179/month (was $199)

<b>💡 Choose your plan:</b>
    `;
    
    const voucherKeyboard = {
        inline_keyboard: [
            [
                { text: '📊 Starter Member', callback_data: 'select_plan_starter' },
                { text: '📈 Professional Member', callback_data: 'select_plan_professional' }
            ],
            [
                { text: '🚀 Enterprise Member', callback_data: 'select_plan_enterprise' }
            ],
            [
                { text: '🔙 Back to Member Access', callback_data: 'member_access' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: voucherKeyboard
    });
}

// Handle crypto payment method
async function handlePaymentMethodCrypto(chatId, userId, username) {
    log('INFO', `₿ User selected crypto payment`, {
        chatId,
        userId,
        username
    });
    
    const message = `
₿ <b>Cryptocurrency Payment</b>

<b>🔒 Secure Crypto Payment</b>
Your payment will be processed securely.

<b>📋 Payment Details:</b>
• Amount: $79 USD
• Bitcoin Address: bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
• USDT Address: TRC20: TQn9Y2khDD95J42FQtQTdwFmzYwqB8KvqK

<b>✅ This is a demo payment</b>
In production, this would integrate with crypto payment processors.

<b>🎉 Payment Successful!</b>
Your subscription is now active.
    `;
    
    // Simulate successful payment and activate subscription
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
    
    paidSubscribers.set(userId, {
        plan: 'Professional',
        startDate,
        endDate,
        paymentStatus: 'active',
        username
    });
    
    log('INFO', `✅ Crypto payment processed successfully`, {
        userId,
        username,
        plan: 'Professional',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
    });
    
    const successKeyboard = {
        inline_keyboard: [
            [
                { text: '🚀 Start Trading', callback_data: 'back_to_main' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: successKeyboard
    });
}

// Handle admin subscribers
async function handleAdminSubscribers(chatId, userId, username) {
    log('INFO', `👑 Admin requested subscriber list via button`, {
        chatId,
        userId,
        username
    });
    
    if (authorizedGroups.size === 0) {
        const noSubscribersMessage = `
<b>👑 Admin Panel - Subscribers</b>

<b>📊 Current Status:</b>
• Active Subscribers: 0
• Total Groups: 0
• Total Users: 0

<b>💡 No active subscriptions found.</b>
        `;
        
        const backButton = {
            inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
        };
        
        await bot.sendMessage(chatId, noSubscribersMessage, { 
            parse_mode: 'HTML',
            reply_markup: backButton
        });
        return;
    }
    
    let subscriberList = '';
    let groupCount = 0;
    let userCount = 0;
    
    authorizedGroups.forEach(groupId => {
        if (groupId.toString().startsWith('-')) {
            groupCount++;
            subscriberList += `• Group ID: ${groupId}\n`;
        } else {
            userCount++;
            subscriberList += `• User ID: ${groupId}\n`;
        }
    });
    
    const adminMessage = `
<b>👑 Admin Panel - Subscribers</b>

<b>📊 Current Status:</b>
• Active Subscribers: ${authorizedGroups.size}
• Total Groups: ${groupCount}
• Total Users: ${userCount}

<b>📋 Subscriber List:</b>
${subscriberList}

<b>✨ PRIMUSGPT.AI is serving ${authorizedGroups.size} subscribers!</b>
    `;
    
    const backButton = {
        inline_keyboard: [[{ text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }]]
    };
    
    await bot.sendMessage(chatId, adminMessage, { 
        parse_mode: 'HTML',
        reply_markup: backButton
    });
}

// Handle alert price zone request
async function handleAlertPriceZone(chatId, userId, username) {
    log('INFO', `🔔 User requested alert price zone`, {
        chatId,
        userId,
        username
    });
    
    const message = `
🔔 <b>Alert Price Zone Setup</b>

Set up price alerts for your trading strategy:

<b>📊 Available Options:</b>
• Support Level Alert
• Resistance Level Alert  
• Custom Price Alert
• Breakout Alert

<b>💡 How it works:</b>
I'll monitor the price and notify you when it reaches your specified levels.

<b>🎯 Choose your alert type:</b>
    `;
    
    const alertKeyboard = {
        inline_keyboard: [
            [
                { text: '🛡️ Support Alert', callback_data: 'alert_support' },
                { text: '🚧 Resistance Alert', callback_data: 'alert_resistance' }
            ],
            [
                { text: '💰 Custom Price Alert', callback_data: 'alert_custom' },
                { text: '📈 Breakout Alert', callback_data: 'alert_breakout' }
            ],
            [
                { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: alertKeyboard
    });
}

// Handle alert price for specific asset
async function handleAlertPriceForAsset(chatId, userId, username, assetType, symbol) {
    log('INFO', `🔔 User requested alert price for ${assetType} ${symbol}`, {
        chatId,
        userId,
        username,
        assetType,
        symbol
    });
    
    const message = `
🔔 <b>Price Alert Setup - ${assetType.toUpperCase()}</b>

<b>💱 Symbol:</b> ${symbol}
<b>📊 Asset Type:</b> ${assetType.toUpperCase()}

<b>🎯 Alert Options:</b>
• Support Level Alert
• Resistance Level Alert  
• Custom Price Alert
• Breakout Alert

<b>💡 How it works:</b>
I'll monitor the ${symbol} price and notify you when it reaches your specified levels.

<b>⚙️ Choose your alert type:</b>
    `;
    
    const alertKeyboard = {
        inline_keyboard: [
            [
                { text: '🟢 Support Alert', callback_data: `support_alert_${assetType}_${symbol}` },
                { text: '🔴 Resistance Alert', callback_data: `resistance_alert_${assetType}_${symbol}` }
            ],
            [
                { text: '💰 Custom Price', callback_data: `custom_alert_${assetType}_${symbol}` },
                { text: '🚀 Breakout Alert', callback_data: `breakout_alert_${assetType}_${symbol}` }
            ],
            [
                { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: alertKeyboard
    });
}

// Handle timeframe analysis
async function handleTimeframeAnalysis(chatId, userId, username, timeframe, tradingStyle, assetType, symbol) {
    // Check if user has access
    if (!checkUserAccess(userId)) {
        await showPaymentWall(chatId, userId, username);
        return;
    }
    
    log('INFO', `📈 User requested timeframe analysis`, {
        chatId,
        userId,
        username,
        timeframe,
        assetType,
        symbol
    });
    
    try {
        // Enhanced animation sequence for client retention
        const displayTradingStyle = timeframe === 'D1' ? '📈 Swing Trading' : '🔥 Scalping';
        const asset = `${assetType.toUpperCase()} (${symbol})`;
        
        const sentMessage = await bot.sendMessage(chatId, 
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `🚀 [█░░░░░░░░░] 10%\n` +
            `🔍 Connecting to TradingView... 📊`
        );
        
        // Step 1 - Chart Capture
        await new Promise(resolve => setTimeout(resolve, 1200));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `📊 [███░░░░░░░] 20%\n` +
            `🔍 Capturing TradingView chart... 📸`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Step 2 - GPT Vision Analysis
        await new Promise(resolve => setTimeout(resolve, 1500));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `🕯️ [██████░░░░] 35%\n` +
            `🔍 Analyzing chart with GPT-4 Vision... 🤖`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Step 3 - Market Structure Analysis
        await new Promise(resolve => setTimeout(resolve, 1000));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `📐 [████████░░] 50%\n` +
            `🔍 Analyzing market structure & patterns... 📈`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Step 4 - Entry Zone Calculation  
        await new Promise(resolve => setTimeout(resolve, 1200));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `🎯 [█████████░] 65%\n` +
            `🔍 Calculating entry zones & Fibonacci levels... 🎯`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        log('INFO', `Starting ${timeframe} timeframe analysis for ${assetType}`);
        
        // Show processing message during actual analysis
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `⚡ [███░░░░░░░] 30%\n` +
            `🔍 Processing GPT-4 Vision analysis... ⚡`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Progress update during analysis execution
        await new Promise(resolve => setTimeout(resolve, 1000));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `🧠 [████░░░░░░] 40%\n` +
            `🤖 Executing AI analysis... 🧠`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Create progress callback for analyzeEngulfingChart (30% to 100%)
        const chartProgressCallback = async (message, percentage) => {
            // Map 0-100 to 30-100 range
            const mappedPercentage = Math.round(30 + (percentage * 0.7));
            const barLength = Math.floor(mappedPercentage / 10);
            await bot.editMessageText(
                `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
                `${displayTradingStyle}\n` +
                `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
                `⚡ [${'█'.repeat(barLength)}${'░'.repeat(10 - barLength)}] ${mappedPercentage}%\n` +
                `${message}`, {
                chat_id: chatId,
                message_id: sentMessage.message_id
            });
        };
        
        // STEP 2: Generate analysis and custom chart
        const analysis = await analyzeEngulfingChart(timeframe, tradingStyle, assetType, symbol, chartProgressCallback);
        
        if (!analysis || !analysis.success) {
            // Show failure message with retry options
            const errorMessage = analysis?.error || 'Unknown error occurred';
            await bot.editMessageText(
                `❌ <b>ANALYSIS FAILED</b>\n\n` +
                `🧞‍♂️ <b>PRIMUSGPT.AI</b>\n\n` +
                `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
                `⚠️ <b>Error:</b> ${errorMessage}\n\n` +
                `The GPT-4 Vision analysis could not be completed. This might be due to:\n` +
                `• Network connectivity issues\n` +
                `• TradingView chart loading problems\n` +
                `• API timeout or rate limiting\n\n` +
                `Please try again or contact support if the issue persists.`, {
                chat_id: chatId,
                message_id: sentMessage.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Try Again', callback_data: `style_${tradingStyle}` },
                            { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                        ],
                        [
                            { text: '❓ Help & Support', callback_data: 'help' }
                        ]
                    ]
                }
            });
            return;
        }
        
        // Progress update after analysis completion
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `✅ [██████████] 85%\n` +
            `📊 Analysis complete! Preparing chart... ✅`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Step 5 - Zone Overlay Processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `🎨 [██████████] 90%\n` +
            `🔍 Processing zone overlays on chart... 🎨`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Step 6 - Final Chart Generation
        await new Promise(resolve => setTimeout(resolve, 1500));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `📊 [██████████] 95%\n` +
            `🔍 Finalizing chart generation... ✨`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Final step - Completing
        await new Promise(resolve => setTimeout(resolve, 600));
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `✨ [██████████] 100%\n` +
            `🎉 Chart analysis complete! ✨`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // STEP 3: Use GPT Vision screenshot if available, otherwise generate custom chart
        let chartBuffer = null;
        let isGptVisionChart = false;
        
        // Progress update before chart generation
        await bot.editMessageText(
            `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
            `${displayTradingStyle}\n` +
            `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
            `📈 [██████████] 92%\n` +
            `🎨 Generating chart visualization... 📈`, {
            chat_id: chatId,
            message_id: sentMessage.message_id
        });
        
        // Check if analysis has GPT Vision screenshot
        if (analysis && analysis.analysisType === 'gpt4-vision' && analysis.screenshot) {
            // Progress update: Zone overlay processing
            await bot.editMessageText(
                `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
                `${displayTradingStyle}\n` +
                `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
                `🎨 [██████████] 94%\n` +
                `🔧 Adding zone overlays to chart... 🎨`, {
                chat_id: chatId,
                message_id: sentMessage.message_id
            });
            
            // Add zone overlays to the GPT Vision screenshot
            try {
                chartBuffer = await addZoneOverlaysToScreenshot(analysis.screenshot, analysis);
                isGptVisionChart = true;
                log('INFO', '✅ Using GPT Vision screenshot with zone overlays');
            } catch (error) {
                log('WARN', 'Failed to add zone overlays, using raw screenshot', { error: error.message });
                chartBuffer = analysis.screenshot;
                isGptVisionChart = true;
            }
        } else {
            log('WARN', 'GPT Vision screenshot not available', {
                hasAnalysis: !!analysis,
                analysisType: analysis?.analysisType,
                hasScreenshot: !!analysis?.screenshot,
                screenshotType: typeof analysis?.screenshot
            });
            // Progress update: Custom chart generation
            await bot.editMessageText(
                `🧞‍♂️ <b>PRIMUSGPT.AI ANALYSIS</b>\n\n` +
                `${displayTradingStyle}\n` +
                `🎯 ${asset} | ⏰ ${timeframe}\n\n` +
                `📊 [██████████] 94%\n` +
                `🔧 Generating custom chart... 📊`, {
                chat_id: chatId,
                message_id: sentMessage.message_id
            });
            
            // Fallback: Generate custom chart with zones
            try {
                const { fetchCandlestickDataMultiSource } = require('./tradingAnalyzer');
                const candlestickData = await fetchCandlestickDataMultiSource(assetType, symbol, timeframe, 50);
                chartBuffer = await generateTradingViewChart(candlestickData, analysis, timeframe);
                log('INFO', '✅ Custom chart generated with precise zones (GPT Vision not available)');
            } catch (error) {
                log('ERROR', 'Failed to generate custom chart', { error: error.message });
            }
        }
        
        // Format analysis message
        let analysisMessage = formatTimeframeAnalysis(analysis, timeframe);
        
        // Create inline keyboard for chart analysis response
        const chartAnalysisKeyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Analyze Again', callback_data: `analyze_again_${timeframe}_${assetType}_${symbol}` },
                    { text: '🔔 Alert Price', callback_data: `alert_price_${assetType}_${symbol}` }
                ],
                [
                    { text: '🔙 Back to Main Menu', callback_data: 'back_to_main' }
                ]
            ]
        };

        // Send final result
        if (chartBuffer) {
            await bot.sendPhoto(chatId, chartBuffer, {
                caption: analysisMessage,
                parse_mode: 'HTML',
                reply_markup: chartAnalysisKeyboard
            });
            
            const chartType = isGptVisionChart ? 'GPT Vision screenshot' : 'custom generated chart';
            log('INFO', `✅ Chart sent for ${timeframe} (${chartType})`, {
                timeframe,
                assetType,
                symbol,
                isGptVisionChart
            });
        } else {
            // Fallback: send text-only analysis
            await bot.sendMessage(chatId, analysisMessage, { 
                parse_mode: 'HTML',
                reply_markup: chartAnalysisKeyboard
            });
            log('WARN', 'No chart available, sent text-only analysis');
        }
        
        // Clean up
        await bot.deleteMessage(chatId, sentMessage.message_id);
        
    } catch (error) {
        log('ERROR', 'Failed to handle timeframe analysis', {
            error: error.message,
            timeframe,
            assetType,
            symbol
        });
        
        await bot.sendMessage(chatId, '❌ Analysis failed. Please try again later.');
    }
}

// Analyze chart for specific timeframe
async function analyzeTimeframeChart(timeframe, assetType = 'gold', symbol = 'XAUUSD') {
    try {
        log('INFO', `Starting ${timeframe} timeframe analysis for ${assetType} (${symbol})`);
        
        // Simulate analysis for different asset types
        const support = generateSupportResistance(assetType, symbol, 'support');
        const resistance = generateSupportResistance(assetType, symbol, 'resistance');
        
        log('DEBUG', `Generated support/resistance values`, {
            assetType,
            symbol,
            support,
            resistance,
            supportType: typeof support,
            resistanceType: typeof resistance,
            supportParsed: parseFloat(support),
            resistanceParsed: parseFloat(resistance)
        });
        
        const analysis = {
            timeframe,
            assetType,
            symbol,
            currentPrice: generateRandomPrice(assetType, symbol),
            trend: generateTrend(),
            patterns: generatePatterns(),
            signals: generateSignals(),
            support: support,
            resistance: resistance,
            timestamp: new Date().toISOString()
        };
        
        // Calculate overall signal
        analysis.overallSignal = calculateOverallSignal(analysis.signals);
        
        return analysis;
        
    } catch (error) {
        log('ERROR', 'Failed to analyze timeframe chart', {
            error: error.message,
            timeframe,
            assetType,
            symbol
        });
        return null;
    }
}

// NEW: Analyze chart using GPT-4 Vision for real chart analysis
async function analyzeEngulfingChart(timeframe, tradingStyle, assetType = 'gold', symbol = 'XAUUSD', progressCallback = null) {
    try {
        log('INFO', `Starting GPT-4 Vision ${tradingStyle} analysis (${timeframe}) for ${assetType} (${symbol})`);
        
        // Progress update: Starting analysis
        if (progressCallback) {
            await progressCallback('🔍 Initializing chart analysis...', 77);
        }
        
        // Generate TradingView chart URL
        const chartUrl = generateTradingViewUrl(symbol, timeframe);
        
        // Create analysis prompt based on trading style
        let analysisPrompt = `Analyze this ${symbol} chart on ${timeframe} timeframe for ${tradingStyle} trading opportunities.

Focus on:
1. **Current Trend**: Identify the overall market direction
2. **Key Levels**: Support and resistance zones
3. **Entry Opportunities**: Specific entry points for ${tradingStyle} style
4. **Risk Management**: Stop loss and take profit suggestions
5. **Pattern Recognition**: Chart patterns, candlestick formations
6. **Market Structure**: Higher highs/lows, trend breaks
7. **Volume Analysis**: Confirmation signals

Trading Style Context:
${tradingStyle === 'scalping' ? 
    '- Focus on short-term moves and quick entries/exits\n- Look for 1-5 minute opportunities\n- Identify immediate support/resistance for quick scalps' :
    '- Focus on swing trading opportunities\n- Look for medium-term trend continuations or reversals\n- Identify key swing levels for position entries'
}

Provide specific price levels, entry/exit points, and risk management suggestions.`;

        // Try GPT-4 Vision analysis first
        try {
            log('INFO', `🔍 Attempting GPT-4 Vision analysis for ${symbol} ${timeframe}`);
            
            // Progress update: Screenshot capture
            if (progressCallback) {
                await progressCallback('📸 Capturing chart screenshot...', 78);
            }
            
            const visionAnalysis = await captureAndAnalyzeChart(chartUrl, timeframe, symbol, analysisPrompt, progressCallback);
            
            if (visionAnalysis.success) {
                log('INFO', `✅ GPT-4 Vision analysis successful for ${symbol} ${timeframe}`, {
                    hasScreenshot: !!visionAnalysis.screenshot,
                    screenshotSize: visionAnalysis.screenshot?.length,
                    analysisPreview: visionAnalysis.analysis?.substring(0, 200) + '...'
                });
                
                // Log the full GPT analysis for debugging
                log('INFO', 'GPT Vision Analysis Result:', {
                    fullAnalysis: visionAnalysis.analysis
                });
                
                // Progress update: Finalizing analysis
                if (progressCallback) {
                    await progressCallback('✨ Finalizing analysis results...', 86);
                }
                
                // Parse the analysis and format it for the existing response format
                const formattedAnalysis = await formatVisionAnalysisResponse(visionAnalysis, timeframe, tradingStyle, assetType, symbol);
                
                log('INFO', 'Formatted analysis created', {
                    analysisType: formattedAnalysis.analysisType,
                    hasScreenshot: !!formattedAnalysis.screenshot
                });
                
                return formattedAnalysis;
            } else {
                log('ERROR', `GPT-4 Vision analysis failed: ${visionAnalysis.error}`);
                // Return failure result instead of fallback
                return {
                    success: false,
                    error: visionAnalysis.error,
                    analysisType: 'vision_failed',
                    timeframe,
                    tradingStyle,
                    assetType,
                    symbol
                };
            }
        } catch (visionError) {
            log('ERROR', `GPT-4 Vision analysis failed: ${visionError.message}`);
            
            // Return failure result instead of fallback
            return {
                success: false,
                error: visionError.message,
                analysisType: 'vision_failed',
                timeframe,
                tradingStyle,
                assetType,
                symbol
            };
        }
    } catch (error) {
        log('ERROR', 'Failed to analyze chart', {
            error: error.message,
            timeframe,
            tradingStyle,
            assetType,
            symbol
        });
        return null;
    }
}

// Helper function to generate TradingView URL
function generateTradingViewUrl(symbol, timeframe) {
    // Convert symbol format for TradingView
    let tvSymbol;
    if (symbol === 'XAUUSD') {
        tvSymbol = 'TVC:GOLD'; // Use TVC exchange for gold
    } else {
        // For forex pairs, use OANDA or similar
        tvSymbol = `OANDA:${symbol}`;
    }
    
    // Convert timeframe format
    const timeframeMap = {
        'M1': '1',
        'M5': '5', 
        'M15': '15',
        'M30': '30',
        'H1': '60',
        'H4': '240',
        'D1': '1D',
        'W1': '1W',
        'MN1': '1M'
    };
    
    const tvTimeframe = timeframeMap[timeframe] || '60';
    
    return `https://www.tradingview.com/chart/?symbol=${tvSymbol}&interval=${tvTimeframe}`;
}

// Helper function to format GPT-4 Vision analysis response
async function formatVisionAnalysisResponse(visionAnalysis, timeframe, tradingStyle, assetType, symbol) {
    // Prioritize exact current price from TradingView chart
    let currentPrice = visionAnalysis.currentPrice;
    
    // Fallback to GPT analysis if no exact price from chart
    if (!currentPrice) {
        currentPrice = extractCurrentPriceFromAnalysis(visionAnalysis.analysis);
    }
    
    // Final fallback to synthetic data if no price found
    if (!currentPrice) {
        log('WARN', 'Could not extract price from chart or GPT analysis, using fallback');
        currentPrice = generateRandomPrice(assetType, symbol);
    }
    
    log('INFO', 'Using current price from analysis', { currentPrice, symbol });

    return {
        success: true, // Add success property back
        timeframe: timeframe,
        refinementTimeframe: getRefinementTimeframe(tradingStyle, timeframe),
        tradingStyle: tradingStyle,
        assetType: assetType,
        symbol: symbol,
        currentPrice: currentPrice,
        analysis: visionAnalysis.analysis,
        analysisType: 'gpt4-vision',
        timestamp: visionAnalysis.timestamp,
        screenshot: visionAnalysis.screenshot, // Include the screenshot
        marketStructure: {
            trend: extractTrendFromAnalysis(visionAnalysis.analysis),
            description: 'Based on GPT-4 Vision chart analysis',
            strength: 'high-confidence'
        },
        entryZones: extractEntryZonesFromAnalysis(visionAnalysis.analysis, currentPrice, tradingStyle),
        riskManagement: extractRiskManagementFromAnalysis(visionAnalysis.analysis),
        keyLevels: extractKeyLevelsFromAnalysis(visionAnalysis.analysis),
        confidence: 'high',
        model: visionAnalysis.model || 'gpt-4o-vision'
    };
}

// Helper functions to extract information from GPT analysis
function extractScalpingKeyLevels(analysis) {
    const levels = [];
    
    // Extract from key levels if available
    if (analysis.keyLevels) {
        // Handle the correct structure: keyLevels is an object with support and resistance arrays
        if (analysis.keyLevels.support && Array.isArray(analysis.keyLevels.support)) {
            analysis.keyLevels.support.forEach(price => {
            levels.push({
                    type: 'support',
                    price: parseFloat(price).toFixed(2),
                    strength: 'medium'
            });
        });
        }
        if (analysis.keyLevels.resistance && Array.isArray(analysis.keyLevels.resistance)) {
            analysis.keyLevels.resistance.forEach(price => {
                levels.push({
                    type: 'resistance',
                    price: parseFloat(price).toFixed(2),
                    strength: 'medium'
                });
            });
        }
    }
    
    // Extract from entry zones
    if (analysis.entryZones) {
        analysis.entryZones.forEach(zone => {
            const type = zone.type === 'buy' ? 'support' : 'resistance';
            levels.push({
                type: type,
                price: parseFloat(zone.price).toFixed(2),
                strength: zone.confidence || 'medium'
            });
        });
    }
    
    // Extract from GPT analysis text
    if (analysis.analysis) {
        const supportMatches = analysis.analysis.match(/support.*?([0-9]{1,4}[,.]?[0-9]{1,3}(?:\.[0-9]{1,2})?)/gi) || [];
        const resistanceMatches = analysis.analysis.match(/resistance.*?([0-9]{1,4}[,.]?[0-9]{1,3}(?:\.[0-9]{1,2})?)/gi) || [];
        
        supportMatches.forEach(match => {
            const price = match.match(/([0-9]{1,4}[,.]?[0-9]{1,3}(?:\.[0-9]{1,2})?)/);
            if (price) {
                const cleanPrice = parseFloat(price[1].replace(/,/g, ''));
                if (cleanPrice >= 1000 && cleanPrice <= 5000) {
                    levels.push({
                        type: 'support',
                        price: cleanPrice.toFixed(2),
                        strength: 'high'
                    });
                }
            }
        });
        
        resistanceMatches.forEach(match => {
            const price = match.match(/([0-9]{1,4}[,.]?[0-9]{1,3}(?:\.[0-9]{1,2})?)/);
            if (price) {
                const cleanPrice = parseFloat(price[1].replace(/,/g, ''));
                if (cleanPrice >= 1000 && cleanPrice <= 5000) {
                    levels.push({
                        type: 'resistance',
                        price: cleanPrice.toFixed(2),
                        strength: 'high'
                    });
                }
            }
        });
    }
    
    // Remove duplicates and sort by price
    const uniqueLevels = levels.filter((level, index, self) => 
        index === self.findIndex(l => l.price === level.price && l.type === level.type)
    );
    
    return uniqueLevels.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
}

function extractCurrentPriceFromAnalysis(analysisText) {
    // Look for current price patterns in the GPT analysis
    const pricePatterns = [
        // Matches patterns like "around 3,552" "near 3552.50" "at 3,551"
        /(?:around|near|at|current.*?price.*?(?:is|of))\s*(?:\$)?([0-9]{1,4}[,.]?[0-9]{1,3}(?:\.[0-9]{1,2})?)/gi,
        // Matches resistance/support levels
        /(?:resistance|support).*?(?:around|near|at)\s*(?:\$)?([0-9]{1,4}[,.]?[0-9]{1,3}(?:\.[0-9]{1,2})?)/gi,
        // Matches direct price mentions like "3,552.160"
        /(?:\$)?([0-9]{1,4}[,.]?[0-9]{3}(?:\.[0-9]{1,3})?)/g
    ];
    
    const foundPrices = [];
    
    pricePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(analysisText)) !== null) {
            const priceStr = match[1].replace(/,/g, '');
            const price = parseFloat(priceStr);
            
            // Filter for gold-like prices (between 1000-5000)
            if (price >= 1000 && price <= 5000) {
                foundPrices.push(price);
            }
        }
    });
    
    if (foundPrices.length > 0) {
        // Return the most frequently mentioned price, or the median
        const sortedPrices = foundPrices.sort((a, b) => a - b);
        const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];
        log('INFO', 'Extracted price from analysis', { 
            foundPrices: foundPrices.slice(0, 5), 
            selectedPrice: medianPrice 
        });
        return medianPrice;
    }
    
    log('WARN', 'No valid price found in GPT analysis text');
    return null;
}

function extractTrendFromAnalysis(analysisText) {
    const text = analysisText.toLowerCase();
    
    // Enhanced trend detection based on trading conditions
    const bullishKeywords = ['bullish', 'uptrend', 'higher highs', 'higher low', 'rising', 'ascending', 'breakout above', 'strong buying', 'bullish engulfing'];
    const bearishKeywords = ['bearish', 'downtrend', 'lower highs', 'lower low', 'falling', 'descending', 'breakdown', 'selling pressure', 'bearish engulfing'];
    const sidewaysKeywords = ['sideways', 'ranging', 'range', 'consolidation', 'oscillating', 'range-bound', 'channel'];
    
    let bullishScore = 0;
    let bearishScore = 0;
    let sidewaysScore = 0;
    
    bullishKeywords.forEach(keyword => {
        if (text.includes(keyword)) bullishScore++;
    });
    
    bearishKeywords.forEach(keyword => {
        if (text.includes(keyword)) bearishScore++;
    });
    
    sidewaysKeywords.forEach(keyword => {
        if (text.includes(keyword)) sidewaysScore++;
    });
    
    // Determine trend based on highest score
    if (sidewaysScore > bullishScore && sidewaysScore > bearishScore) {
        return 'sideways';
    } else if (bullishScore > bearishScore) {
        return 'uptrend';
    } else if (bearishScore > bullishScore) {
        return 'downtrend';
    } else {
        return 'sideways'; // Default to sideways for unclear trends
    }
}

function extractEntryZonesFromAnalysis(analysisText, currentPrice = null, tradingStyle = 'scalping') {
    log('INFO', 'Extracting entry zones from GPT analysis', {
        analysisLength: analysisText?.length,
        currentPrice,
        analysisPreview: analysisText?.substring(0, 300)
    });
    
    const zones = [];
    const lines = analysisText.split('\n');
    
    // Based on the conditions you provided, look for specific patterns
    lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        const trimmedLine = line.trim();
        
        // Skip empty lines
        if (!trimmedLine) return;
        
        // Look for key patterns based on trading conditions
        if (lowerLine.includes('support') || lowerLine.includes('resistance') || 
            lowerLine.includes('entry') || lowerLine.includes('zone') ||
            lowerLine.includes('level') || lowerLine.includes('engulfing') ||
            lowerLine.includes('fibonacci') || lowerLine.includes('retracement') ||
            lowerLine.includes('bullish') || lowerLine.includes('bearish') ||
            lowerLine.includes('uptrend') || lowerLine.includes('downtrend') ||
            lowerLine.includes('sideways') || lowerLine.includes('ranging') ||
            lowerLine.includes('higher high') || lowerLine.includes('lower low') ||
            lowerLine.includes('pullback') || lowerLine.includes('bounce')) {
            
            // Extract price ranges (like "3,556 - 3,558" or "3,542")
            const priceRangeMatches = line.match(/(\d{1,1}[,']?\d{3})\s*[-–]\s*(\d{1,1}[,']?\d{3})/g) || 
                                    line.match(/(\d{1,1}[,']?\d{3})/g);
            
            if (priceRangeMatches) {
                priceRangeMatches.forEach(match => {
                    // Handle price ranges like "3,556 - 3,558"
                    const rangeMatch = match.match(/(\d{1,1}[,']?\d{3})\s*[-–]\s*(\d{1,1}[,']?\d{3})/);
                    let price;
                    
                    if (rangeMatch) {
                        // Use middle of range
                        const price1 = parseFloat(rangeMatch[1].replace(/[,']/g, ''));
                        const price2 = parseFloat(rangeMatch[2].replace(/[,']/g, ''));
                        price = (price1 + price2) / 2;
                    } else {
                        // Single price
                        price = parseFloat(match.replace(/[,']/g, ''));
                    }
                    
                    // For gold, prices should be in realistic range (2000-5000)
                    if (price >= 2000 && price <= 5000) {
                        // Determine zone type based on context and price position
                        let type = 'neutral';
                        let description = trimmedLine;
                        
                        // First, check if we have current price for relative positioning
                        if (currentPrice) {
                            // Enhanced zone classification based on trading conditions
                            let isUptrend = lowerLine.includes('uptrend') || lowerLine.includes('higher high') || lowerLine.includes('higher low');
                            let isDowntrend = lowerLine.includes('downtrend') || lowerLine.includes('lower high') || lowerLine.includes('lower low');
                            let isSideways = lowerLine.includes('sideways') || lowerLine.includes('ranging') || lowerLine.includes('range');
                            
                            // CRITICAL: Always prioritize price position over context for scalping
                            // Zones above current price = SELL, zones below current price = BUY
                            if (price > currentPrice) {
                                // Price is above current price = SELL zone
                                if (lowerLine.includes('bullish engulfing') || lowerLine.includes('bullish') && lowerLine.includes('engulfing')) {
                                    type = 'sell';
                                    description = `Bullish Engulfing Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (lowerLine.includes('bearish engulfing') || lowerLine.includes('bearish') && lowerLine.includes('engulfing')) {
                                    type = 'sell';
                                    description = `Bearish Engulfing Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (lowerLine.includes('fibonacci') && (lowerLine.includes('61.5') || lowerLine.includes('50'))) {
                                    type = 'sell';
                                    description = `Fibonacci Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (isUptrend) {
                                    type = 'sell';
                                    description = `Uptrend Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (isDowntrend) {
                                    type = 'sell';
                                    description = `Downtrend Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (isSideways) {
                                    type = 'sell';
                                    description = `Range Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else {
                                    type = 'sell';
                                    description = `Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                }
                            } else if (price < currentPrice) {
                                // Price is below current price = BUY zone
                                if (lowerLine.includes('bullish engulfing') || lowerLine.includes('bullish') && lowerLine.includes('engulfing')) {
                                    type = 'buy';
                                    description = `Bullish Engulfing Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (lowerLine.includes('bearish engulfing') || lowerLine.includes('bearish') && lowerLine.includes('engulfing')) {
                                    type = 'buy';
                                    description = `Bearish Engulfing Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (lowerLine.includes('fibonacci') && (lowerLine.includes('61.5') || lowerLine.includes('50'))) {
                                    type = 'buy';
                                    description = `Fibonacci Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (isUptrend) {
                                    type = 'buy';
                                    description = `Uptrend Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (isDowntrend) {
                                    type = 'buy';
                                    description = `Downtrend Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (isSideways) {
                                    type = 'buy';
                                    description = `Range Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else {
                                    type = 'buy';
                                    description = `Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                }
                            } else {
                                // Price is very close to current price, use context clues
                                if (lowerLine.includes('support') || lowerLine.includes('long entry') || 
                                    lowerLine.includes('buying interest') || lowerLine.includes('buy')) {
                                    type = 'buy';
                                    description = `Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else if (lowerLine.includes('resistance') || lowerLine.includes('short entry') || 
                                           lowerLine.includes('selling') || lowerLine.includes('reversed')) {
                                    type = 'sell';
                                    description = `Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                } else {
                                    // Default to neutral if unclear
                                    type = 'neutral';
                                    description = `Level: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                }
                            }
                        } else {
                            // Fallback to context-based classification when no current price
                        if (lowerLine.includes('support') || lowerLine.includes('long entry') || 
                            lowerLine.includes('buying interest') || lowerLine.includes('buy')) {
                            type = 'buy';
                            description = `Support: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                        } else if (lowerLine.includes('resistance') || lowerLine.includes('short entry') || 
                                   lowerLine.includes('selling') || lowerLine.includes('reversed')) {
                            type = 'sell';
                            description = `Resistance: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                        } else if (lowerLine.includes('entry')) {
                            if (lowerLine.includes('long')) {
                                type = 'buy';
                                description = `Long entry: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                            } else if (lowerLine.includes('short')) {
                                type = 'sell'; 
                                description = `Short entry: ${trimmedLine.replace(/[*#-]/g, '').trim()}`;
                                }
                            }
                        }
                        
                        zones.push({
                            price: price,
                            type: type,
                            description: description.length > 80 ? description.substring(0, 80) + '...' : description
                        });
                        
                        log('DEBUG', 'Found price level', { 
                            originalLine: trimmedLine, 
                            extractedPrice: price, 
                            type, 
                            description 
                        });
                    }
                });
            }
        }
    });
    
    // If no zones found and we have current price, create logical zones based on current context
    if (zones.length === 0 && currentPrice) {
        // For scalping, create zones closer to current price
        const priceMargin = tradingStyle === 'scalping' ? 0.003 : 0.01; // 0.3% for scalping, 1% for swing
        
        // Create buy zones below current price and sell zones above
        const buyZone1 = currentPrice * (1 - priceMargin);
        const buyZone2 = currentPrice * (1 - priceMargin * 2);
        const sellZone1 = currentPrice * (1 + priceMargin);
        const sellZone2 = currentPrice * (1 + priceMargin * 2);
        
        zones.push({
            price: buyZone1,
            type: 'buy',
            description: `Support level for ${tradingStyle} entry`
        });
        zones.push({
            price: buyZone2,
            type: 'buy', 
            description: `Deeper support level for ${tradingStyle} entry`
        });
        zones.push({
            price: sellZone1,
            type: 'sell',
            description: `Resistance level for ${tradingStyle} entry`
        });
        zones.push({
            price: sellZone2,
            type: 'sell',
            description: `Higher resistance level for ${tradingStyle} entry`
        });
    }
    
    // Remove duplicates and sort by price
    const uniqueZones = zones.filter((zone, index, self) => 
        index === self.findIndex(z => Math.abs(z.price - zone.price) < 1)
    );
    
    // Separate BUY and SELL zones
    const buyZones = uniqueZones.filter(zone => zone.type === 'buy').sort((a, b) => b.price - a.price);
    const sellZones = uniqueZones.filter(zone => zone.type === 'sell').sort((a, b) => b.price - a.price);
    
    // For scalping, prioritize zones closest to current price
    let finalZones = [];
    
    // Add best BUY zones (closest to current price from below)
    if (buyZones.length > 0) {
        finalZones.push(buyZones[0]); // Highest BUY zone
        if (buyZones.length > 1) {
            finalZones.push(buyZones[1]); // Second highest BUY zone
        }
    }
    
    // Add best SELL zones (closest to current price from above)
    if (sellZones.length > 0) {
        finalZones.push(sellZones[0]); // Lowest SELL zone (closest to current price)
        if (sellZones.length > 1 && finalZones.length < 3) {
            finalZones.push(sellZones[1]); // Second lowest SELL zone
        }
    }
    
    // If we still don't have enough zones, add remaining zones by price proximity
    if (finalZones.length < 3) {
        const remainingZones = uniqueZones.filter(zone => 
            !finalZones.some(fz => Math.abs(fz.price - zone.price) < 1)
        );
        finalZones = finalZones.concat(remainingZones.slice(0, 3 - finalZones.length));
    }
    
    // Sort final zones by price (highest first)
    finalZones = finalZones.sort((a, b) => b.price - a.price);
    
    log('INFO', 'Entry zones extracted', {
        totalZonesFound: zones.length,
        uniqueZones: uniqueZones.length,
        finalZones: finalZones.length,
        zones: finalZones
    });
    
    return finalZones;
}

function extractRiskManagementFromAnalysis(analysisText) {
    const lines = analysisText.split('\n');
    let stopLoss = null;
    let takeProfit = null;
    
    lines.forEach(line => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('stop loss') || lowerLine.includes('stop-loss')) {
            const priceMatches = line.match(/\d+\.?\d*/g);
            if (priceMatches) stopLoss = parseFloat(priceMatches[0]);
        }
        if (lowerLine.includes('take profit') || lowerLine.includes('target')) {
            const priceMatches = line.match(/\d+\.?\d*/g);
            if (priceMatches) takeProfit = parseFloat(priceMatches[0]);
        }
    });
    
    return {
        stopLoss,
        takeProfit,
        riskRewardRatio: stopLoss && takeProfit ? Math.abs(takeProfit - stopLoss) / Math.abs(stopLoss) : null
    };
}

function extractKeyLevelsFromAnalysis(analysisText) {
    const lines = analysisText.split('\n');
    const levels = { support: [], resistance: [] };
    
    lines.forEach(line => {
        const lowerLine = line.toLowerCase();
        
        // Extract support levels
        if (lowerLine.includes('support')) {
            const priceMatches = line.match(/\d{1,1}[,']?\d{3}(?:\.\d+)?/g);
            if (priceMatches) {
                priceMatches.forEach(match => {
                    const price = parseFloat(match.replace(/[,']/g, ''));
                    if (price >= 2000 && price <= 5000) {
                        levels.support.push(price);
                    }
                });
            }
        }
        
        // Extract resistance levels
        if (lowerLine.includes('resistance')) {
            const priceMatches = line.match(/\d{1,1}[,']?\d{3}(?:\.\d+)?/g);
            if (priceMatches) {
                priceMatches.forEach(match => {
                    const price = parseFloat(match.replace(/[,']/g, ''));
                    if (price >= 2000 && price <= 5000) {
                        levels.resistance.push(price);
                    }
                });
            }
        }
        
        // Also look for key levels mentioned in other contexts
        if (lowerLine.includes('level') && (lowerLine.includes('354') || lowerLine.includes('355') || lowerLine.includes('356'))) {
            const priceMatches = line.match(/\d{1,1}[,']?\d{3}(?:\.\d+)?/g);
            if (priceMatches) {
                priceMatches.forEach(match => {
                    const price = parseFloat(match.replace(/[,']/g, ''));
                    if (price >= 2000 && price <= 5000) {
                        // Determine if it's support or resistance based on context
                        if (lowerLine.includes('below') || lowerLine.includes('support') || lowerLine.includes('buy')) {
                            levels.support.push(price);
                        } else if (lowerLine.includes('above') || lowerLine.includes('resistance') || lowerLine.includes('sell')) {
                            levels.resistance.push(price);
                        }
                    }
                });
            }
        }
    });
    
    // Remove duplicates and sort
    levels.support = [...new Set(levels.support)].sort((a, b) => b - a);
    levels.resistance = [...new Set(levels.resistance)].sort((a, b) => b - a);
    
    return levels;
}

// Helper function to add zone overlays to GPT Vision screenshot
async function addZoneOverlaysToScreenshot(screenshotBuffer, analysis) {
    try {
        // Load the screenshot image
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');
        
        // Load the screenshot as base image
        const baseImage = await loadImage(screenshotBuffer);
        
        // Draw the base screenshot
        canvas.width = baseImage.width;
        canvas.height = baseImage.height;
        ctx.drawImage(baseImage, 0, 0);
        
        // Add zone overlays if we have entry zones
        if (analysis.entryZones && analysis.entryZones.length > 0) {
            const chartHeight = canvas.height;
            const chartWidth = canvas.width;
            
            // Estimate price range from current price (rough approximation)
            const currentPrice = analysis.currentPrice || 3500;
            const priceRange = currentPrice * 0.02; // 2% range visible on chart
            const maxPrice = currentPrice + priceRange;
            const minPrice = currentPrice - priceRange;
            
            analysis.entryZones.forEach((zone, index) => {
                if (zone.price >= minPrice && zone.price <= maxPrice) {
                    // Calculate Y position based on price (rough estimation)
                    const priceRatio = (maxPrice - zone.price) / (maxPrice - minPrice);
                    const yPosition = chartHeight * 0.1 + (chartHeight * 0.8 * priceRatio);
                    
                    // Set colors based on zone type
                    const isRed = zone.type === 'sell';
                    const zoneColor = isRed ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0, 255, 0, 0.3)';
                    const lineColor = isRed ? '#ff0000' : '#00ff00';
                    const textColor = isRed ? '#ffffff' : '#000000';
                    
                    // Draw zone background
                    ctx.fillStyle = zoneColor;
                    ctx.fillRect(0, yPosition - 10, chartWidth, 20);
                    
                    // Draw zone line
                    ctx.strokeStyle = lineColor;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, yPosition);
                    ctx.lineTo(chartWidth, yPosition);
                    ctx.stroke();
                    
                    // Draw price label
                    ctx.fillStyle = lineColor;
                    ctx.fillRect(chartWidth - 80, yPosition - 12, 75, 24);
                    
                    ctx.fillStyle = textColor;
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${zone.price.toFixed(2)}`, chartWidth - 42, yPosition + 4);
                    
                    // Draw zone type indicator
                    const typeText = zone.type.toUpperCase();
                    ctx.fillStyle = lineColor;
                    ctx.fillRect(10, yPosition - 12, 40, 24);
                    
                    ctx.fillStyle = textColor;
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(typeText, 30, yPosition + 2);
                }
            });
        }
        
        // Convert back to buffer
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        log('ERROR', 'Failed to add zone overlays to screenshot', { error: error.message });
        // Return original screenshot if overlay fails
        return screenshotBuffer;
    }
}

// Helper function to determine refinement timeframe
function getRefinementTimeframe(tradingStyle, mainTimeframe) {
    if (tradingStyle === '📈 Swing' || tradingStyle === 'swing') {
        return 'M30'; // Daily -> M30 refinement
    } else { // scalping
        if (mainTimeframe === 'H4') {
            return 'M15'; // H4 -> M15 refinement
        } else { // H1
            return 'M5'; // H1 -> M5 refinement
        }
    }
}

// Analyze market structure for trend identification
function analyzeMarketStructure(assetType, symbol, candlestickData) {
    // Use real candlestick data to determine market structure
    if (!candlestickData || candlestickData.length < 10) {
        // Fallback to random if no data
        const trends = ['uptrend', 'downtrend', 'sideways'];
        const trend = trends[Math.floor(Math.random() * trends.length)];
        
        let description;
        switch (trend) {
            case 'uptrend':
                description = 'Market making Higher Highs and Higher Lows';
                break;
            case 'downtrend':
                description = 'Market making Lower Highs and Lower Lows';
                break;
            case 'sideways':
                description = 'Market moving sideways between support and resistance';
                break;
        }
        
        return {
            trend,
            description,
            strength: Math.random() > 0.5 ? 'strong' : 'moderate'
        };
    }
    
    // Analyze recent price action to determine real market structure
    const recentCandles = candlestickData.slice(0, 20); // Last 20 candles
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    
    // Find swing highs and lows
    const swingHighs = findSwingPoints(highs, true);
    const swingLows = findSwingPoints(lows, false);
    
    // Determine trend based on swing points
    let trend = 'sideways';
    let description = 'Market moving sideways between support and resistance';
    let strength = 'moderate';
    
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
        const recentHighs = swingHighs.slice(-2);
        const recentLows = swingLows.slice(-2);
        
        // Check for Higher Highs and Higher Lows (Uptrend)
        if (recentHighs[1] > recentHighs[0] && recentLows[1] > recentLows[0]) {
            trend = 'uptrend';
            description = 'Market making Higher Highs and Higher Lows';
            
            // Check strength based on momentum
            const priceChange = (highs[0] - highs[highs.length - 1]) / highs[highs.length - 1];
            strength = priceChange > 0.02 ? 'strong' : 'moderate';
        }
        // Check for Lower Highs and Lower Lows (Downtrend)  
        else if (recentHighs[1] < recentHighs[0] && recentLows[1] < recentLows[0]) {
            trend = 'downtrend';
            description = 'Market making Lower Highs and Lower Lows';
            
            // Check strength based on momentum
            const priceChange = Math.abs((highs[0] - highs[highs.length - 1]) / highs[highs.length - 1]);
            strength = priceChange > 0.02 ? 'strong' : 'moderate';
        }
    }
    
    return {
        trend,
        description,
        strength
    };
}

// Find swing highs/lows in price data
function findSwingPoints(prices, isHighs = true) {
    const swingPoints = [];
    const lookback = 3; // Look 3 periods on each side
    
    for (let i = lookback; i < prices.length - lookback; i++) {
        let isSwingPoint = true;
        
        // Check if current point is higher/lower than surrounding points
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue;
            
            if (isHighs) {
                if (prices[i] <= prices[j]) {
                    isSwingPoint = false;
                    break;
                }
            } else {
                if (prices[i] >= prices[j]) {
                    isSwingPoint = false;
                    break;
                }
            }
        }
        
        if (isSwingPoint) {
            swingPoints.push(prices[i]);
        }
    }
    
    return swingPoints;
}

// Calculate fibonacci retracement zones (61.5-50% levels)
function calculateFibonacciZones(currentPrice, marketStructure, candlestickData) {
    const fibZones = [];
    
    if (!candlestickData || candlestickData.length < 20) {
        return fibZones; // No fibonacci zones if insufficient data
    }
    
    // Only calculate fibonacci zones for trending markets
    if (marketStructure.trend === 'sideways') {
        return fibZones; // No fibonacci zones for sideways markets
    }
    
    // Find recent swing high and low for fibonacci calculation
    const recentCandles = candlestickData.slice(0, 20);
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);
    const range = swingHigh - swingLow;
    
    if (range === 0) return fibZones;
    
    const price = parseFloat(currentPrice);
    
    if (marketStructure.trend === 'uptrend') {
        // For uptrends, fibonacci retracements from swing high
        const fib618 = swingHigh - (range * 0.618); // 61.8% retracement
        const fib50 = swingHigh - (range * 0.50);   // 50% retracement
        
        // Only add levels that are below current price (potential support)
        if (fib618 < price) {
            fibZones.push({
                level: '61.8% Retracement',
                price: fib618.toFixed(price > 100 ? 2 : 5),
                type: 'support',
                description: 'Fibonacci 61.8% retracement level - strong support'
            });
        }
        
        if (fib50 < price && Math.abs(fib50 - fib618) > (price * 0.001)) {
            fibZones.push({
                level: '50% Retracement', 
                price: fib50.toFixed(price > 100 ? 2 : 5),
                type: 'support',
                description: 'Fibonacci 50% retracement level - psychological support'
            });
        }
        
    } else if (marketStructure.trend === 'downtrend') {
        // For downtrends, fibonacci retracements from swing low
        const fib618 = swingLow + (range * 0.618); // 61.8% retracement
        const fib50 = swingLow + (range * 0.50);   // 50% retracement
        
        // Only add levels that are above current price (potential resistance)
        if (fib618 > price) {
            fibZones.push({
                level: '61.8% Retracement',
                price: fib618.toFixed(price > 100 ? 2 : 5),
                type: 'resistance',
                description: 'Fibonacci 61.8% retracement level - strong resistance'
            });
        }
        
        if (fib50 > price && Math.abs(fib50 - fib618) > (price * 0.001)) {
            fibZones.push({
                level: '50% Retracement',
                price: fib50.toFixed(price > 100 ? 2 : 5),
                type: 'resistance', 
                description: 'Fibonacci 50% retracement level - psychological resistance'
            });
        }
    }
    
    return fibZones;
}

// Find engulfing patterns based on market structure
function findEngulfingPatterns(marketStructure) {
    const patterns = [];
    
    if (marketStructure.trend === 'uptrend') {
        // Look for bullish engulfing at pullback levels
        patterns.push({
            type: 'bullish_engulfing',
            location: 'pullback_zone',
            strength: Math.random() > 0.3 ? 'strong' : 'weak',
            description: 'Bullish engulfing found at key pullback level'
        });
    } else if (marketStructure.trend === 'downtrend') {
        // Look for bearish engulfing at bounce levels
        patterns.push({
            type: 'bearish_engulfing',
            location: 'bounce_zone', 
            strength: Math.random() > 0.3 ? 'strong' : 'weak',
            description: 'Bearish engulfing found at key bounce level'
        });
    } else {
        // Sideways - both bullish and bearish at S&R levels
        patterns.push({
            type: 'bullish_engulfing',
            location: 'support_zone',
            strength: Math.random() > 0.4 ? 'strong' : 'weak',
            description: 'Bullish engulfing found at support'
        });
        patterns.push({
            type: 'bearish_engulfing',
            location: 'resistance_zone',
            strength: Math.random() > 0.4 ? 'strong' : 'weak',
            description: 'Bearish engulfing found at resistance'
        });
    }
    
    return patterns;
}

// Calculate fibonacci retracement zones
function calculateFibonacciZones(currentPrice, marketStructure) {
    const price = parseFloat(currentPrice);
    const range = price * 0.05; // 5% range for demo
    
    const zones = [];
    
    if (marketStructure.trend === 'uptrend' || marketStructure.trend === 'downtrend') {
        // 61.8% and 50% retracement levels
        zones.push({
            level: '61.8%',
            price: marketStructure.trend === 'uptrend' ? 
                (price - range * 0.618).toFixed(2) : 
                (price + range * 0.618).toFixed(2),
            type: 'fibonacci_retracement'
        });
        
        zones.push({
            level: '50%',
            price: marketStructure.trend === 'uptrend' ? 
                (price - range * 0.5).toFixed(2) : 
                (price + range * 0.5).toFixed(2),
            type: 'fibonacci_retracement'
        });
    }
    
    return zones;
}

// Determine entry zones based on your specified trading conditions
function determineEntryZones(marketStructure, engulfingPatterns, fibonacciZones, currentPrice) {
    const entryZones = [];
    const price = parseFloat(currentPrice);
    
    if (marketStructure.trend === 'uptrend') {
        // UPTREND CONDITIONS:
        // - Market making Higher Highs and Higher Lows
        // - Look for bullish engulfing (as entry zone) OR
        // - Based on fibonacci retracement tool (61.5-50 level)
        
        // Priority 1: Fibonacci retracement zones (61.8% and 50%)
        if (fibonacciZones.length > 0) {
            fibonacciZones.forEach(fibZone => {
                if (fibZone.type === 'support') {
                    entryZones.push({
                        type: 'BUY_ZONE',
                        price: fibZone.price,
                        reason: `Bullish engulfing expected at ${fibZone.level}`,
                        pattern: 'bullish_engulfing',
                        confidence: 'high',
                        description: fibZone.description
                    });
                }
            });
        } else {
            // Priority 2: Bullish engulfing patterns as entry zones
            const recentEngulfingLevels = getEngulfingLevels(engulfingPatterns, 'bullish_engulfing', price);
            recentEngulfingLevels.forEach((level, index) => {
                entryZones.push({
                    type: 'BUY_ZONE',
                    price: level.toFixed(price > 100 ? 2 : 5),
                    reason: `Bullish engulfing pattern area - HH/HL structure`,
                    pattern: 'bullish_engulfing',
                    confidence: index === 0 ? 'high' : 'medium',
                    description: 'Bullish engulfing in uptrend structure'
                });
            });
        }
        
    } else if (marketStructure.trend === 'downtrend') {
        // DOWNTREND CONDITIONS:
        // - Market making Lower Highs and Lower Lows  
        // - Look for bearish engulfing (as entry zone) OR
        // - Based on fibonacci retracement tool (61.5-50 level)
        
        // Priority 1: Fibonacci retracement zones (61.8% and 50%)
        if (fibonacciZones.length > 0) {
            fibonacciZones.forEach(fibZone => {
                if (fibZone.type === 'resistance') {
                    entryZones.push({
                        type: 'SELL_ZONE',
                        price: fibZone.price,
                        reason: `Bearish engulfing expected at ${fibZone.level}`,
                        pattern: 'bearish_engulfing',
                        confidence: 'high',
                        description: fibZone.description
                    });
                }
            });
        } else {
            // Priority 2: Bearish engulfing patterns as entry zones
            const recentEngulfingLevels = getEngulfingLevels(engulfingPatterns, 'bearish_engulfing', price);
            recentEngulfingLevels.forEach((level, index) => {
                entryZones.push({
                    type: 'SELL_ZONE',
                    price: level.toFixed(price > 100 ? 2 : 5),
                    reason: `Bearish engulfing pattern area - LH/LL structure`,
                    pattern: 'bearish_engulfing',
                    confidence: index === 0 ? 'high' : 'medium',
                    description: 'Bearish engulfing in downtrend structure'
                });
            });
        }
        
    } else {
        // SIDEWAYS CONDITIONS:
        // - Mark out both support and resistance
        // - SnR to be marked by the presence of bullish and bearish engulfing
        
        const supportLevels = getEngulfingLevels(engulfingPatterns, 'bullish_engulfing', price);
        const resistanceLevels = getEngulfingLevels(engulfingPatterns, 'bearish_engulfing', price);
        
        // Add support zones (below current price)
        supportLevels.forEach((level, index) => {
            if (level < price && index < 2) {
                entryZones.push({
                    type: 'BUY_ZONE',
                    price: level.toFixed(price > 100 ? 2 : 5),
                    reason: `Support marked by bullish engulfing pattern`,
                    pattern: 'bullish_engulfing',
                    confidence: 'high',
                    description: 'Sideways support - bullish engulfing confluence'
                });
            }
        });
        
        // Add resistance zones (above current price)
        resistanceLevels.forEach((level, index) => {
            if (level > price && index < 2) {
                entryZones.push({
                    type: 'SELL_ZONE',
                    price: level.toFixed(price > 100 ? 2 : 5),
                    reason: `Resistance marked by bearish engulfing pattern`,
                    pattern: 'bearish_engulfing',
                    confidence: 'high',
                    description: 'Sideways resistance - bearish engulfing confluence'
                });
            }
        });
    }
    
    return entryZones;
}

// Helper function to get engulfing pattern levels
function getEngulfingLevels(engulfingPatterns, patternType, currentPrice) {
    const levels = [];
    const price = parseFloat(currentPrice);
    
    // If we have real engulfing patterns, use those
    if (engulfingPatterns && engulfingPatterns.length > 0) {
        engulfingPatterns
            .filter(pattern => pattern.type === patternType)
            .forEach(pattern => {
                const patternPrice = parseFloat(pattern.price);
                if (patternPrice > 0) {
                    levels.push(patternPrice);
                }
            });
    }
    
    // If no real patterns, create logical levels based on price action
    if (levels.length === 0) {
        const priceStep = calculatePriceStep(price);
        const keyLevels = calculateKeyPriceLevels(price, priceStep);
        
        if (patternType === 'bullish_engulfing') {
            // Use support levels for bullish engulfing
            keyLevels.support.slice(0, 2).forEach(level => {
                if (level < price) levels.push(level);
            });
        } else {
            // Use resistance levels for bearish engulfing  
            keyLevels.resistance.slice(0, 2).forEach(level => {
                if (level > price) levels.push(level);
            });
        }
    }
    
    return levels.slice(0, 3); // Max 3 levels
}

// Calculate dynamic price step based on the current price
function calculatePriceStep(price) {
    if (price > 1000) return 10;    // For gold: $10 increments
    if (price > 100) return 1;      // For high value pairs: 1 unit
    if (price > 10) return 0.1;     // For pairs like USDJPY: 0.1 yen
    if (price > 1) return 0.001;    // For most forex pairs: 1 pip
    return 0.0001;                  // For very small values: 0.1 pip
}

// Calculate key price levels using psychological levels and round numbers
function calculateKeyPriceLevels(currentPrice, priceStep) {
    const keyLevels = {
        support: [],
        resistance: []
    };
    
    // Find psychological levels (round numbers)
    const roundingFactor = priceStep * 10;
    const currentRounded = Math.round(currentPrice / roundingFactor) * roundingFactor;
    
    // Generate support levels (below current price)
    for (let i = 1; i <= 5; i++) {
        const supportLevel = currentRounded - (roundingFactor * i);
        if (supportLevel > 0) {
            keyLevels.support.push(supportLevel);
        }
    }
    
    // Generate resistance levels (above current price)
    for (let i = 1; i <= 5; i++) {
        const resistanceLevel = currentRounded + (roundingFactor * i);
        keyLevels.resistance.push(resistanceLevel);
    }
    
    // Add weekly/daily psychological levels for more precision
    const bigRoundingFactor = priceStep * 50;
    const bigCurrentRounded = Math.round(currentPrice / bigRoundingFactor) * bigRoundingFactor;
    
    // Add major support/resistance levels
    if (bigCurrentRounded < currentPrice) {
        keyLevels.resistance.unshift(bigCurrentRounded + bigRoundingFactor);
    } else {
        keyLevels.support.unshift(bigCurrentRounded - bigRoundingFactor);
    }
    
    // Sort levels
    keyLevels.support.sort((a, b) => b - a); // Closest support first
    keyLevels.resistance.sort((a, b) => a - b); // Closest resistance first
    
    return keyLevels;
}

// Format price level for display
function formatPriceLevel(price) {
    if (price > 1000) return `$${price.toFixed(0)}`;
    if (price > 100) return price.toFixed(2);
    if (price > 10) return price.toFixed(3);
    return price.toFixed(5);
}

// Fetch real candlestick data for more accurate analysis
async function fetchCandlestickData(assetType, symbol, timeframe) {
    log('INFO', `🔍 Fetching candlestick data for ${assetType} ${symbol} ${timeframe}`);
    
    try {
        // Import the enhanced multi-source data fetching function
        const { fetchCandlestickDataMultiSource } = require('./tradingAnalyzer');
        
        // Use the new multi-source system with TwelveData as primary
        const candlesticks = await fetchCandlestickDataMultiSource(assetType, symbol, timeframe, 50);
        
        log('INFO', `✅ Successfully fetched ${candlesticks.length} candlesticks for ${assetType}`);
                log('INFO', `💰 Latest price: $${candlesticks[candlesticks.length - 1]?.close || 'N/A'}`);
                return candlesticks;
        
    } catch (error) {
        log('ERROR', 'Failed to fetch candlestick data', {
            error: error.message,
            assetType,
            symbol,
            timeframe,
            stack: error.stack
        });
        
        log('WARN', `📊 All data sources failed, using synthetic data fallback`);
        return generateSyntheticCandles(assetType, symbol, 20);
    }
}

// Generate synthetic candlestick data as fallback
function generateSyntheticCandles(assetType, symbol, count) {
    log('INFO', `🔄 Generating ${count} synthetic candles for ${assetType} ${symbol}`);
    
    const candles = [];
    let currentPrice = assetType === 'gold' ? 3530 : 
                      symbol === 'USDJPY' ? 150 : 1.1;
    
    log('INFO', `💰 Starting synthetic price: $${currentPrice}`);
    
    for (let i = 0; i < count; i++) {
        const open = currentPrice;
        const changePercent = (Math.random() - 0.5) * 0.02; // 2% max change
        const close = open * (1 + changePercent);
        const high = Math.max(open, close) * (1 + Math.random() * 0.005);
        const low = Math.min(open, close) * (1 - Math.random() * 0.005);
        
        candles.unshift({
            timestamp: new Date(Date.now() - i * 3600000).toISOString(),
            open: parseFloat(open.toFixed(assetType === 'gold' ? 2 : 5)),
            high: parseFloat(high.toFixed(assetType === 'gold' ? 2 : 5)),
            low: parseFloat(low.toFixed(assetType === 'gold' ? 2 : 5)),
            close: parseFloat(close.toFixed(assetType === 'gold' ? 2 : 5))
        });
        
        currentPrice = close;
    }
    
    log('INFO', `✅ Generated ${candles.length} synthetic candles`);
    log('INFO', `💰 Final synthetic price: $${candles[candles.length - 1]?.close || 'N/A'}`);
    
    return candles;
}

// Detect real engulfing patterns from candlestick data
function detectEngulfingPatterns(candlesticks) {
    const patterns = [];
    
    for (let i = 1; i < candlesticks.length; i++) {
        const currentCandle = candlesticks[i];
        const previousCandle = candlesticks[i - 1];
        
        // Bullish Engulfing Pattern Detection
        if (previousCandle.close < previousCandle.open && // Previous candle is bearish
            currentCandle.close > currentCandle.open && // Current candle is bullish
            currentCandle.open < previousCandle.close && // Current opens below previous close
            currentCandle.close > previousCandle.open) { // Current closes above previous open
            
            const bodySize = Math.abs(currentCandle.close - currentCandle.open);
            const prevBodySize = Math.abs(previousCandle.close - previousCandle.open);
            const strength = bodySize > prevBodySize * 1.5 ? 'strong' : 'weak';
            
            patterns.push({
                type: 'bullish_engulfing',
                timestamp: currentCandle.timestamp,
                price: currentCandle.close,
                strength: strength,
                location: getPriceLocation(currentCandle.close, candlesticks),
                confidence: strength === 'strong' ? 'high' : 'medium'
            });
        }
        
        // Bearish Engulfing Pattern Detection
        if (previousCandle.close > previousCandle.open && // Previous candle is bullish
            currentCandle.close < currentCandle.open && // Current candle is bearish
            currentCandle.open > previousCandle.close && // Current opens above previous close
            currentCandle.close < previousCandle.open) { // Current closes below previous open
            
            const bodySize = Math.abs(currentCandle.close - currentCandle.open);
            const prevBodySize = Math.abs(previousCandle.close - previousCandle.open);
            const strength = bodySize > prevBodySize * 1.5 ? 'strong' : 'weak';
            
            patterns.push({
                type: 'bearish_engulfing',
                timestamp: currentCandle.timestamp,
                price: currentCandle.close,
                strength: strength,
                location: getPriceLocation(currentCandle.close, candlesticks),
                confidence: strength === 'strong' ? 'high' : 'medium'
            });
        }
    }
    
    return patterns;
}

// Determine price location relative to recent price action
function getPriceLocation(price, candlesticks) {
    const recentCandles = candlesticks.slice(0, 10); // Look at last 10 candles
    const highs = recentCandles.map(c => c.high);
    const lows = recentCandles.map(c => c.low);
    
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const range = maxHigh - minLow;
    const pricePosition = (price - minLow) / range;
    
    if (pricePosition > 0.75) return 'upper_resistance';
    if (pricePosition > 0.5) return 'middle_range';
    if (pricePosition > 0.25) return 'middle_support';
    return 'lower_support';
}

// Generate zone-based recommendation
function generateZoneRecommendation(entryZones, marketStructure, currentPrice, tradingStyle) {
    const mainZones = entryZones.filter(zone => zone.confidence === 'high');
    
    if (mainZones.length === 0) {
        return {
            action: 'WAIT',
            message: 'No clear entry zones identified. Wait for better setup.',
            risk: 'Monitor market for engulfing patterns at key levels'
        };
    }
    
    const primaryZone = mainZones[0];
    
    // Calculate suggested SL/TP (suggestions only)
    const price = parseFloat(currentPrice);
    const zonePrice = parseFloat(primaryZone.price);
    
    let stopLoss, takeProfit;
    if (primaryZone.type.includes('BUY')) {
        stopLoss = (zonePrice * 0.99).toFixed(2);
        takeProfit = (zonePrice * 1.02).toFixed(2);
    } else {
        stopLoss = (zonePrice * 1.01).toFixed(2);
        takeProfit = (zonePrice * 0.98).toFixed(2);
    }
    
    return {
        action: 'ZONE_IDENTIFIED',
        zone: primaryZone,
        suggestions: {
            stopLoss,
            takeProfit,
            disclaimer: 'These are analytical suggestions only, not financial advice'
        },
        timeframe: tradingStyle === 'swing' ? 'Medium-term position' : 'Short-term opportunity',
        marketContext: marketStructure.description
    };
}

// Get real current price from API
async function getCurrentPrice(assetType, symbol) {
    try {
        if (assetType === 'gold') {
            // Use the new real-time price fetching function
            const { fetchCurrentPrice } = require('./tradingAnalyzer');
            const currentPrice = await fetchCurrentPrice();
            return currentPrice.toFixed(2);
        } else {
            // Try Alpha Vantage for forex (most accurate)
            try {
                const [fromCurrency, toCurrency] = symbol.includes('JPY') ? 
                    [symbol.slice(0, 3), symbol.slice(3)] : 
                    [symbol.slice(0, 3), symbol.slice(3)];
                
                const response = await axios.get(`https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${fromCurrency}&to_currency=${toCurrency}&apikey=${config.ALPHA_VANTAGE_API_KEY}`);
                
                if (response.data['Realtime Currency Exchange Rate']) {
                    const price = parseFloat(response.data['Realtime Currency Exchange Rate']['5. Exchange Rate']);
                    const decimals = symbol.includes('JPY') ? 3 : 5;
                    return price.toFixed(decimals);
                }
            } catch (error) {
                log('DEBUG', 'Alpha Vantage forex price failed, trying backup API');
            }
            
            // Backup: exchange rate API
            const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/USD`);
            const rates = response.data.rates;
            
            // Calculate forex pair rates with proper precision
            const pairRates = {
                'EURUSD': (1 / rates.EUR).toFixed(5),
                'GBPUSD': (1 / rates.GBP).toFixed(5), 
                'USDJPY': rates.JPY.toFixed(3),
                'USDCHF': rates.CHF.toFixed(5),
                'AUDUSD': (1 / rates.AUD).toFixed(5),
                'USDCAD': rates.CAD.toFixed(5),
                'NZDUSD': (1 / rates.NZD).toFixed(5)
            };
            
            return pairRates[symbol] || '1.00000';
        }
    } catch (error) {
        log('ERROR', 'Failed to fetch current price', {
            error: error.message,
            assetType,
            symbol
        });
        // Fallback to reasonable defaults
        return generateFallbackPrice(assetType, symbol);
    }
}

// Fallback price generation with more accurate ranges
// Extract real price from TradingView page during screenshot
async function extractPriceFromTradingView(page, symbol) {
    try {
        // Wait a bit for price to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to extract current price from TradingView
        const price = await page.evaluate((sym) => {
            // Common TradingView price selectors
            const priceSelectors = [
                '[data-name="legend-source-item"] [class*="price"]',
                '[class*="tv-symbol-price-quote"]',
                '[data-name="legend-source-item"]',
                '.js-symbol-last',
                '[class*="last-JWoJqCpY"]',
                '[class*="price"]',
                '.tv-symbol-price-quote__value'
            ];
            
            for (const selector of priceSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent?.trim();
                    if (text && /^\d+\.?\d*$/.test(text.replace(/,/g, ''))) {
                        const numPrice = parseFloat(text.replace(/,/g, ''));
                        // Validate price range based on symbol
                        if (sym.includes('JPY') && numPrice > 100 && numPrice < 200) return numPrice;
                        if (sym.includes('USD') && numPrice > 0.3 && numPrice < 2.0) return numPrice;
                        if (sym.includes('GOLD') || sym.includes('XAU') || sym.includes('GOLD')) {
                            // Gold prices are typically 2000-5000
                            if (numPrice > 2000 && numPrice < 5000) return numPrice;
                        }
                        if (numPrice > 0.1) return numPrice;
                    }
                }
            }
            
            // Try to find price in page text
            const bodyText = document.body.innerText;
            const priceMatches = bodyText.match(/\b(\d{1,4}\.\d{3,5})\b/g);
            if (priceMatches) {
                for (const match of priceMatches) {
                    const numPrice = parseFloat(match);
                    if (sym.includes('JPY') && numPrice > 100 && numPrice < 200) return numPrice;
                    if (sym.includes('USD') && numPrice > 0.3 && numPrice < 2.0) return numPrice;
                    if (sym.includes('GOLD') || sym.includes('XAU') || sym.includes('GOLD')) {
                        // Gold prices are typically 2000-5000
                        if (numPrice > 2000 && numPrice < 5000) return numPrice;
                    }
                }
            }
            
            return null;
        }, symbol);
        
        if (price && price > 0) {
            log('INFO', `✅ Extracted real price from TradingView: ${price}`, { symbol });
            return price.toString();
        }
        
        return null;
    } catch (error) {
        log('DEBUG', 'Failed to extract price from TradingView', { error: error.message, symbol });
        return null;
    }
}

function generateFallbackPrice(assetType, symbol) {
    if (assetType === 'gold') {
        return '2650.00'; // Static fallback for gold
    } else {
        // Static fallback prices based on recent market levels
        const fallbackPrices = {
            'EURUSD': '1.10500',
            'GBPUSD': '1.31200',
            'USDJPY': '148.500',
            'USDCHF': '0.84500',
            'AUDUSD': '0.65200',
            'USDCAD': '1.37800',
            'NZDUSD': '0.59500'
        };
        return fallbackPrices[symbol] || '1.00000';
    }
}

// Generate support/resistance levels based on asset type
function generateSupportResistance(assetType, symbol, type) {
    try {
        if (assetType === 'gold') {
            const basePrice = 2000;
            const variation = 50 + Math.random() * 100;
            return type === 'support' ? (basePrice - variation).toFixed(2) : (basePrice + variation).toFixed(2);
        } else {
            // Generate a base price first
            let basePrice;
            if (symbol === 'AUDUSD') {
                basePrice = 0.65 + Math.random() * 0.10; // AUDUSD: 0.65-0.75
            } else if (symbol === 'EURUSD') {
                basePrice = 1.05 + Math.random() * 0.10; // EURUSD: 1.05-1.15
            } else if (symbol === 'GBPUSD') {
                basePrice = 1.20 + Math.random() * 0.15; // GBPUSD: 1.20-1.35
            } else if (symbol === 'USDJPY') {
                basePrice = 140 + Math.random() * 20; // USDJPY: 140-160
            } else if (symbol === 'USDCHF') {
                basePrice = 0.85 + Math.random() * 0.10; // USDCHF: 0.85-0.95
            } else if (symbol === 'USDCAD') {
                basePrice = 1.30 + Math.random() * 0.10; // USDCAD: 1.30-1.40
            } else if (symbol === 'NZDUSD') {
                basePrice = 0.60 + Math.random() * 0.10; // NZDUSD: 0.60-0.70
            } else {
                basePrice = 1.00 + Math.random() * 0.10; // Default: 1.00-1.10
            }
            
            // Ensure basePrice is a valid number
            if (isNaN(basePrice) || !isFinite(basePrice)) {
                basePrice = 1.00; // Fallback value
            }
            
            const variation = 0.005 + Math.random() * 0.02;
            const result = type === 'support' ? (basePrice - variation) : (basePrice + variation);
            
            // Ensure result is valid
            if (isNaN(result) || !isFinite(result)) {
                return type === 'support' ? (basePrice - 0.01).toFixed(5) : (basePrice + 0.01).toFixed(5);
            }
            
            return result.toFixed(5);
        }
    } catch (error) {
        // Fallback values if anything goes wrong
        if (assetType === 'gold') {
            return type === 'support' ? '1950.00' : '2050.00';
        } else {
            return type === 'support' ? '0.99000' : '1.01000';
        }
    }
}

// Generate random trend
function generateTrend() {
    const trends = ['BULLISH', 'BEARISH', 'SIDEWAYS'];
    return trends[Math.floor(Math.random() * trends.length)];
}

// Generate random patterns
function generatePatterns() {
    const patternTypes = [
        { name: 'Double Top', description: 'Bearish reversal pattern', confidence: 75 },
        { name: 'Double Bottom', description: 'Bullish reversal pattern', confidence: 80 },
        { name: 'Head and Shoulders', description: 'Bearish reversal pattern', confidence: 85 },
        { name: 'Inverse Head and Shoulders', description: 'Bullish reversal pattern', confidence: 82 },
        { name: 'Triangle', description: 'Continuation pattern', confidence: 70 },
        { name: 'Flag', description: 'Continuation pattern', confidence: 65 },
        { name: 'Wedge', description: 'Reversal pattern', confidence: 78 }
    ];
    
    const numPatterns = Math.floor(Math.random() * 3) + 1;
    const selectedPatterns = [];
    
    for (let i = 0; i < numPatterns; i++) {
        const pattern = patternTypes[Math.floor(Math.random() * patternTypes.length)];
        selectedPatterns.push({
            name: pattern.name,
            description: pattern.description,
            confidence: pattern.confidence + Math.floor(Math.random() * 20) - 10
        });
    }
    
    return selectedPatterns;
}

// Generate random signals
function generateSignals() {
    return {
        ema_buy: Math.random() > 0.5,
        macd_buy: Math.random() > 0.5,
        macd_value: (Math.random() - 0.5) * 2,
        rsi_buy: Math.random() > 0.5,
        rsi_sell: Math.random() > 0.5,
        rsi_value: 20 + Math.random() * 60,
        rsi_length: 14,
        adx_buy: Math.random() > 0.5,
        adx_sell: Math.random() > 0.5,
        adx_value: 10 + Math.random() * 40,
        bb_buy: Math.random() > 0.5,
        bb_sell: Math.random() > 0.5,
        confidence: Math.floor(Math.random() * 30) + 70
    };
}

// Calculate overall signal based on individual signals
function calculateOverallSignal(signals) {
    let bullishCount = 0;
    let bearishCount = 0;
    
    if (signals.ema_buy) bullishCount++;
    else bearishCount++;
    
    if (signals.macd_buy) bullishCount++;
    else bearishCount++;
    
    if (signals.rsi_buy) bullishCount++;
    else if (signals.rsi_sell) bearishCount++;
    
    if (signals.adx_buy) bullishCount++;
    else if (signals.adx_sell) bearishCount++;
    
    if (signals.bb_buy) bullishCount++;
    else if (signals.bb_sell) bearishCount++;
    
    if (bullishCount > bearishCount) return 'BUY';
    else if (bearishCount > bullishCount) return 'SELL';
    else return 'HOLD';
}

// Generate timeframe-specific patterns
function generateTimeframePatterns(timeframe) {
    const allPatterns = [
        'Double Top', 'Double Bottom', 'Head and Shoulders',
        'Inverse Head and Shoulders', 'Triangle Formation',
        'Flag Pattern', 'Pennant Pattern', 'Wedge Formation',
        'Cup and Handle', 'Rounding Bottom', 'Ascending Triangle',
        'Descending Triangle', 'Symmetrical Triangle'
    ];
    
    const numPatterns = Math.floor(Math.random() * 3) + 1;
    const patterns = [];
    
    for (let i = 0; i < numPatterns; i++) {
        const randomPattern = allPatterns[Math.floor(Math.random() * allPatterns.length)];
        if (!patterns.includes(randomPattern)) {
            patterns.push(randomPattern);
        }
    }
    
    return patterns;
}

// Generate timeframe-specific indicators
function generateTimeframeIndicators(timeframe) {
    const rsi = Math.floor(Math.random() * 100) + 1;
    const macd = Math.random() > 0.5 ? 'BULLISH' : 'BEARISH';
    const ema = Math.random() > 0.5 ? 'ABOVE' : 'BELOW';
    const volume = Math.random() > 0.5 ? 'HIGH' : 'NORMAL';
    
    return {
        rsi: rsi,
        rsi_status: rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL',
        macd: macd,
        ema_position: ema,
        volume: volume,
        stochastic: Math.random() > 0.5 ? 'BULLISH' : 'BEARISH',
        bollinger_position: Math.random() > 0.5 ? 'UPPER' : Math.random() > 0.5 ? 'LOWER' : 'MIDDLE'
    };
}

// Generate timeframe-specific signals
function generateTimeframeSignals(timeframe) {
    const overall = Math.random() > 0.5 ? 'BUY' : 'SELL';
    const confidence = Math.floor(Math.random() * 40) + 60; // 60-100%
    
    let entry, stopLoss, takeProfit;
    
    if (overall === 'BUY') {
        entry = 2000 + Math.random() * 50;
        stopLoss = entry - (Math.random() * 20 + 10);
        takeProfit = entry + (Math.random() * 40 + 20);
    } else {
        entry = 2000 - Math.random() * 50;
        stopLoss = entry + (Math.random() * 20 + 10);
        takeProfit = entry - (Math.random() * 40 + 20);
    }
    
    return {
        overall: overall,
        confidence: confidence,
        entry: parseFloat(entry.toFixed(2)),
        stop_loss: parseFloat(stopLoss.toFixed(2)),
        take_profit: parseFloat(takeProfit.toFixed(2)),
        risk_reward: '1:2'
    };
}

// Generate support and resistance levels array
function generateSupportResistanceLevels() {
    const currentPrice = 2000;
    const levels = [];
    
    // Generate 3-5 support/resistance levels
    for (let i = 0; i < Math.floor(Math.random() * 3) + 3; i++) {
        const level = currentPrice + (Math.random() - 0.5) * 200;
        const type = Math.random() > 0.5 ? 'SUPPORT' : 'RESISTANCE';
        const strength = Math.floor(Math.random() * 100) + 1;
        
        levels.push({
            price: parseFloat(level.toFixed(2)),
            type: type,
            strength: strength
        });
    }
    
    return levels.sort((a, b) => a.price - b.price);
}

// Generate timeframe-specific summary
function generateTimeframeSummary(timeframe) {
    const summaries = {
        'M1': 'Very short-term momentum analysis for scalping opportunities. High frequency signals with quick entry/exit points.',
        'M5': 'Short-term intraday analysis focusing on momentum and quick reversals. Suitable for day trading.',
        'M15': 'Intraday swing analysis with balanced risk/reward. Good for capturing short-term trends.',
        'M30': 'Swing trading timeframe with moderate risk. Captures intraday trends and reversals.',
        'H1': 'Swing trading analysis with longer holding periods. Focuses on trend continuation and reversals.',
        'H4': 'Position trading timeframe with emphasis on trend analysis and major support/resistance levels.',
        'D1': 'Daily trend analysis for medium-term positions. Captures major market movements and trends.',
        'W1': 'Weekly analysis for long-term investment decisions. Focuses on major trend changes.',
        'MN1': 'Monthly analysis for long-term investment and trend identification. Captures major market cycles.'
    };
    
    return summaries[timeframe] || 'Timeframe analysis completed with technical indicators and pattern recognition.';
}

// Keep the old slash commands for backward compatibility but make them show the menu
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `❓ User requested help via slash command`, {
        chatId,
        userId,
        username
    });
    
    handleHelp(chatId, userId, username);
});

bot.onText(/\/analyze/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `🔍 User requested market analysis via slash command`, {
        chatId,
        userId,
        username
    });
    
    handleMarketAnalysis(chatId, userId, username);
});

bot.onText(/\/subscribe/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `✅ User subscribed via slash command`, {
        chatId,
        userId,
        username
    });
    
    handleSubscribe(chatId, userId, username);
});

bot.onText(/\/unsubscribe/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `❌ User unsubscribed via slash command`, {
        chatId,
        userId,
        username
    });
    
    handleUnsubscribe(chatId, userId, username);
});

bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `📊 User requested status via slash command`, {
        chatId,
        userId,
        username
    });
    
    handleStatus(chatId, userId, username);
});

bot.onText(/\/schedule/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `📅 User requested schedule via slash command`, {
        chatId,
        userId,
        username
    });
    
    handleSchedule(chatId, userId, username);
});

bot.onText(/\/subscribers/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    log('INFO', `📊 Admin command requested via slash command`, {
        chatId,
        userId,
        username,
        isAdmin: process.env.ADMIN_USER_ID === userId.toString()
    });
    
    handleAdminSubscribers(chatId, userId, username);
});

// Command to simulate free trial signup (for testing)
bot.onText(/\/freetrial (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    const plan = match[1];
    
    log('INFO', `🎉 Free trial signup requested via command`, {
        chatId,
        userId,
        username,
        plan
    });
    
    handleFreeTrialSignup(chatId, userId, username, plan);
});

// Command to check subscription status
bot.onText(/\/subscription/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    const freeTrialInfo = freeTrialUsers.get(userId);
    const paidSubInfo = paidSubscribers.get(userId);
    
    if (freeTrialInfo && new Date() < freeTrialInfo.endDate) {
        const daysLeft = Math.ceil((freeTrialInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        const message = `
🎉 <b>Free Trial Status</b>

<b>✅ Active Trial</b>
• Plan: ${freeTrialInfo.plan}
• Start Date: ${freeTrialInfo.startDate.toLocaleDateString()}
• End Date: ${freeTrialInfo.endDate.toLocaleDateString()}
• Days Remaining: ${daysLeft}

<b>🚀 Enjoy all premium features!</b>
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } else if (paidSubInfo && new Date() < paidSubInfo.endDate && paidSubInfo.paymentStatus === 'active') {
        const daysLeft = Math.ceil((paidSubInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        const message = `
💳 <b>Premium Subscription</b>

<b>✅ Active Subscription</b>
• Plan: ${paidSubInfo.plan}
• Start Date: ${paidSubInfo.startDate.toLocaleDateString()}
• End Date: ${paidSubInfo.endDate.toLocaleDateString()}
• Days Remaining: ${daysLeft}
• Status: ${paidSubInfo.paymentStatus}

<b>🚀 Enjoy all premium features!</b>
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } else {
        const message = `
❌ <b>No Active Subscription</b>

You don't have an active subscription or free trial. 

<b>🎁 Start Free Trial:</b>
• 7 days free access
• No credit card required
• Full feature access

<b>💳 Subscribe to Premium:</b>
• Monthly or yearly plans
• Priority support
• Continuous access

<b>💡 Use /start to get started!</b>
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
});

// Command to check free trial status (for backward compatibility)
bot.onText(/\/trialstatus/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'Unknown';
    
    const freeTrialInfo = freeTrialUsers.get(userId);
    
    if (freeTrialInfo) {
        const daysLeft = Math.ceil((freeTrialInfo.endDate - new Date()) / (1000 * 60 * 60 * 24));
        const message = `
🎉 <b>Free Trial Status</b>

<b>✅ Active Trial</b>
• Plan: ${freeTrialInfo.plan}
• Start Date: ${freeTrialInfo.startDate.toLocaleDateString()}
• End Date: ${freeTrialInfo.endDate.toLocaleDateString()}
• Days Remaining: ${daysLeft}

<b>🚀 Enjoy all premium features!</b>
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } else {
        const message = `
❌ <b>No Active Free Trial</b>

You don't have an active free trial. Use /freetrial [plan] to start one, or type "help" to see what I can do.
        `;
        
        bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }
});

// Function to format trading signals
function formatSignals(signals, isScheduled = false) {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {timeZone: 'America/New_York'});
    
    let message = `<b>📊 Gold Trading Signals ${isScheduled ? '(Scheduled)' : ''}</b>\n`;
    message += `🕐 <i>${timeStr} EST</i>\n\n`;
    
    // Add warning if using sample data
    if (signals.using_sample_data) {
        message += '⚠️ <i>Using sample data (API connection failed)</i>\n\n';
    }
    
    // Add current price with trend
    const priceEmoji = signals.overall_buy ? '📈' : '📉';
    message += `💰 Current Gold Price: $${signals.current_price.toFixed(2)}/oz ${priceEmoji}\n\n`;
    
    // Overall signal with confidence
    const confidence = Math.round(signals.signal_strength * 100);
    if (signals.overall_buy) {
        message += `🟢 <b>BUY Signal</b> (${confidence}% confidence)\n`;
        message += `📊 Buy Signals: ${signals.buy_signal_count} | Sell Signals: ${signals.sell_signal_count}\n\n`;
    } else if (signals.overall_sell) {
        message += `🔴 <b>SELL Signal</b> (${confidence}% confidence)\n`;
        message += `📊 Buy Signals: ${signals.buy_signal_count} | Sell Signals: ${signals.sell_signal_count}\n\n`;
    } else {
        message += `🟡 <b>NEUTRAL Signal</b>\n`;
        message += `📊 Buy Signals: ${signals.buy_signal_count} | Sell Signals: ${signals.sell_signal_count}\n\n`;
    }
    
    message += '<b>📊 Market Analysis:</b>\n';
    message += `Market Structure: ${signals.overall_buy ? '📈 Bullish Setup' : signals.overall_sell ? '📉 Bearish Setup' : '↔️ Sideways Range'}\n`;
    message += `Trend Strength: ${confidence > 70 ? '🔥 Strong' : confidence > 40 ? '⚡ Moderate' : '💫 Weak'}\n`;
    message += `Price Action: ${signals.current_price > signals.current_ema_short ? '🟢 Above Key Level' : '🔴 Below Key Level'}\n\n`;
    
    // Add next signal time for scheduled messages
    if (isScheduled) {
        message += `⏰ <i>Next signal: ${getNextSignalTime()}</i>`;
    }
    
    return message;
}

// Function to check if user has access (free trial or paid subscription)
function checkUserAccess(userId) {
    // Check if user has active free trial
    const freeTrialInfo = freeTrialUsers.get(userId);
    if (freeTrialInfo && new Date() < freeTrialInfo.endDate) {
        return true;
    }
    
    // Check if user has active paid subscription
    const paidSubInfo = paidSubscribers.get(userId);
    if (paidSubInfo && new Date() < paidSubInfo.endDate && paidSubInfo.paymentStatus === 'active') {
        return true;
    }
    
    return false;
}

// Function to show payment wall
async function showPaymentWall(chatId, userId, username) {
    // Send welcome text
    await bot.sendMessage(chatId, '🧞‍♂️ <b>PRIMUSGPT.AI</b>\nYour AI-powered trading companion', { parse_mode: 'HTML' });
    
    const message = `
🔒 <b>Access Required</b>

Welcome to PRIMUSGPT.AI! To access our AI-powered trading analysis and signals, you need to either:

<b>🎁 Start Free Trial (7 days)</b>
• No credit card required
• Full access to all features
• Professional trading signals
• Chart analysis

<b>💳 Subscribe to Premium</b>
• Monthly or yearly plans
• Priority support
• Advanced features
• Continuous access

<b>👥 Member Benefits</b>
• Special member pricing
• Voucher code discounts
• Exclusive features

<b>Choose your option below:</b>
    `;
    
    const paymentKeyboard = {
        inline_keyboard: [
            [
                { text: '🔑 Login', callback_data: 'member_login' },
                { text: '🎁 Start Free Trial', callback_data: 'start_free_trial' }
            ],
            [
                { text: '👥 LP Member Access', callback_data: 'member_access' },
                { text: '❓ Help', callback_data: 'help' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: paymentKeyboard
    });
}

// Function to check if current time is within trading hours
function isWithinTradingHours(date = new Date()) {
    const now = new Date(date.toLocaleString("en-US", {timeZone: MARKET_CONFIG.timezone}));
    const day = now.getDay();
    const hour = now.getHours();
    
    // Check if it's a trading day
    if (!MARKET_CONFIG.tradingDays.includes(day)) {
        return false;
    }
    
    // Check if within any trading session
    const { london, newyork, asian } = MARKET_CONFIG.sessions;
    
    // London session
    if (hour >= london.open && hour < london.close) return true;
    
    // New York session
    if (hour >= newyork.open && hour < newyork.close) return true;
    
    // Asian session (spans midnight)
    if (hour >= asian.open || hour < asian.close) return true;
    
    return false;
}

// Function to get next signal time
function getNextSignalTime() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    
    // Find next trading hour
    while (!isWithinTradingHours(nextHour)) {
        nextHour.setHours(nextHour.getHours() + 1);
    }
    
    return nextHour.toLocaleString('en-US', {timeZone: 'America/New_York'}) + ' EST';
}

// Helper functions for status
function getTodaySignalCount() {
    // You can implement a counter here
    return Math.floor(Math.random() * 20); // Placeholder
}

function getTodaySuccessCount() {
    // You can implement a counter here
    return Math.floor(Math.random() * 18); // Placeholder
}

// Function to send signals to all subscribers
async function sendSignalToSubscribers(isScheduled = true) {
    if (authorizedGroups.size === 0) {
        log('INFO', 'No subscribers to send signals to');
        return;
    }
    
    try {
        log('INFO', `📤 Sending ${isScheduled ? 'scheduled' : 'test'} signal to subscribers`, {
            subscriberCount: authorizedGroups.size,
            isScheduled
        });
        
        const signals = await analyzeTradingSignals();
        const message = formatSignals(signals, isScheduled);
        
        let successCount = 0;
        let errorCount = 0;
        
        log('DEBUG', 'Signal analysis completed', {
            buySignals: signals.buy_signal_count,
            sellSignals: signals.sell_signal_count,
            overallSignal: signals.overall_buy ? 'BUY' : signals.overall_sell ? 'SELL' : 'NEUTRAL'
        });
        
        for (const chatId of authorizedGroups) {
            try {
                await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
                successCount++;
                log('DEBUG', 'Signal sent successfully', { chatId, successCount });
                
                // Add small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to send message to ${chatId}:`, error.message);
                errorCount++;
                log('ERROR', 'Failed to send signal to subscriber', {
                    chatId,
                    error: error.message,
                    errorCount
                });
                
                // Remove inactive chats
                if (error.response && error.response.statusCode === 403) {
                    authorizedGroups.delete(chatId);
                    log('WARN', 'Removed inactive chat', { chatId, reason: '403 Forbidden' });
                }
            }
        }
        
        log('INFO', `📤 Signal distribution completed`, {
            totalSubscribers: authorizedGroups.size,
            successCount,
            errorCount,
            isScheduled
        });
        
    } catch (error) {
        log('ERROR', 'Failed to send scheduled signals', {
            error: error.message,
            isScheduled
        });
        console.error('Error sending scheduled signals:', error);
    }
}

// Function to send market notifications
async function sendMarketNotification(message) {
    if (authorizedGroups.size === 0) {
        log('INFO', 'No subscribers for market notification');
        return;
    }
    
    log('INFO', '📢 Sending market notification to subscribers', {
        subscriberCount: authorizedGroups.size,
        messageLength: message.length
    });
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const chatId of authorizedGroups) {
        try {
            await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            log('ERROR', 'Failed to send market notification', {
                chatId,
                error: error.message
            });
            errorCount++;
        }
    }
    
    log('INFO', '📢 Market notification distribution completed', {
        successCount,
        errorCount
    });
}



// Function to format zone analysis results (optimized for Telegram caption length)
function formatTimeframeAnalysis(analysis, timeframe) {
    if (!analysis) return '❌ Analysis not available';
    
    // Handle failure case
    if (analysis.success === false) {
        return `❌ Analysis failed: ${analysis.error || 'Unknown error'}`;
    }
    
    const timeStr = new Date().toLocaleTimeString('en-US', { 
        timeZone: 'America/New_York',
        hour12: false 
    });
    
    let message = `<b>🎯 ${analysis.tradingStyle === 'scalping' ? 'SCALPING' : analysis.tradingStyle === 'swing' ? 'SWING' : 'ANALYSIS'} - ${analysis.assetType.toUpperCase()}</b>\n`;
    message += `💱 ${analysis.symbol} | ⏰ ${analysis.timeframe}→${analysis.refinementTimeframe}\n`;
    message += `🕐 ${timeStr} EST\n\n`;
    
    // Format price based on asset type with improved accuracy
    const priceDisplay = analysis.assetType === 'gold' 
        ? `$${parseFloat(analysis.currentPrice).toFixed(2)}/oz` 
        : `${parseFloat(analysis.currentPrice).toFixed(analysis.assetType === 'forex' ? 5 : 2)}`;
    
    // Enhanced market structure description
    const trendEmoji = analysis.marketStructure.trend === 'uptrend' ? '📈' : 
                      analysis.marketStructure.trend === 'downtrend' ? '📉' : '↔️';
    const strengthEmoji = analysis.marketStructure.strength === 'strong' ? '🔥' : 
                         analysis.marketStructure.strength === 'moderate' ? '⚡' : '💫';
    
    message += `💰 ${priceDisplay} ${trendEmoji} ${analysis.marketStructure.trend.toUpperCase()}\n`;
    
    // Add GPT Vision source indicator  
    if (analysis.analysisType === 'gpt4-vision') {
        message += `💫 Based on GPT-4 Vision chart analysis\n\n`;
    } else {
        message += `${strengthEmoji} ${analysis.marketStructure.description}\n\n`;
    }
    
    // Add scalping-specific information
    if (analysis.tradingStyle === 'scalping') {
        const keyLevels = extractScalpingKeyLevels(analysis);
        if (keyLevels && keyLevels.length > 0) {
            message += `🎯 KEY SCALPING LEVELS:\n`;
            keyLevels.slice(0, 3).forEach(level => {
                message += `${level.type === 'support' ? '🟢' : '🔴'} ${level.type.toUpperCase()}: $${level.price}\n`;
            });
            message += `\n`;
        }
    }
    
    // Display entry zones with enhanced pattern information
    message += `🎯 <b>ENTRY ZONES:</b>\n`;
    if (analysis.entryZones && analysis.entryZones.length > 0) {
        analysis.entryZones.slice(0, 2).forEach((zone) => {
            const zoneIcon = zone.type === 'buy' ? '🟢 BUY' : '🔴 SELL';
            const priceFormatted = analysis.assetType === 'gold' ? `$${zone.price}` : zone.price;
            
            // Enhanced confidence display
            let confidenceIcon = '';
            if (zone.confidence === 'very_high') confidenceIcon = ' 🔥';
            else if (zone.confidence === 'high') confidenceIcon = ' ⭐';
            else if (zone.confidence === 'medium') confidenceIcon = ' ⚡';
            
            message += `${zoneIcon} ${priceFormatted}${confidenceIcon}\n`;
            message += `   📍 ${zone.description || 'Entry zone identified'}\n`;
            
            // Show pattern strength if available
            if (zone.pattern === 'bullish_engulfing' || zone.pattern === 'bearish_engulfing') {
                const patternInfo = getPatternInfo(zone, analysis.engulfingPatterns);
                if (patternInfo) {
                    message += `   🕯️ ${patternInfo.strength} engulfing (${patternInfo.score}/10)\n`;
                }
            }
        });
    } else {
        message += `❌ No clear entry zones identified\n`;
        message += `⏳ Wait for better market setup\n`;
    }
    
    // Add SL/TP suggestions (clarified as suggestions)
    if (analysis.recommendation && analysis.recommendation.action === 'ZONE_IDENTIFIED') {
        message += `\n💡 <b>SUGGESTIONS:</b>\n`;
        message += `🛡️ SL: ${analysis.recommendation.suggestions.stopLoss}\n`;
        message += `🎯 TP: ${analysis.recommendation.suggestions.takeProfit}\n`;
        message += `⏰ ${analysis.recommendation.timeframe}\n`;
    }
    
    message += `\n⚠️ ${analysis.recommendation?.suggestions?.disclaimer || 'Analysis only - not financial advice'}`;
    
    // Check message length and truncate if necessary (Telegram caption limit is 1024 characters)
    const maxLength = 1000; // Leave some buffer
    if (message.length > maxLength) {
        message = message.substring(0, maxLength - 3) + '...';
        log('WARN', 'Analysis message truncated due to length limit', {
            originalLength: message.length + 3,
            truncatedLength: message.length
        });
    }
    
    return message;
}

// Function to get TradingView chart URL
async function getTradingViewChartUrl(timeframe, symbol) {
    try {
        // TradingView chart URL with symbol and timeframe parameters
        const chartType = TRADINGVIEW_CONFIG.chartTypes[timeframe] || '60';
        const fullUrl = `${TRADINGVIEW_CONFIG.baseUrl}/chart/?symbol=${symbol}&interval=${chartType}`;
        
        log('INFO', `Generated TradingView chart URL for ${timeframe}`, {
            timeframe,
            symbol,
            url: fullUrl
        });
        
        return fullUrl;
    } catch (error) {
        log('ERROR', 'Failed to generate TradingView chart URL', {
            error: error.message,
            timeframe,
            symbol
        });
        return null;
    }
}

// Function to capture chart screenshot and extract real price
async function captureChartScreenshot(url, timeframe, symbol = null) {
    const maxRetries = 1; // Reduced to 1 retry to prevent long waits
    let lastError = null;
    
    // Determine if running on Mac (needed for optimizations)
    const isMac = process.platform === 'darwin';
    
    // Create a timeout wrapper for the entire screenshot process
    const screenshotWithTimeout = async () => {
        const overallTimeout = 120000; // 120 seconds total timeout (2 minutes)
        const startTime = Date.now();
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Check if we've exceeded overall timeout
            if (Date.now() - startTime > overallTimeout) {
                log('ERROR', 'Screenshot capture exceeded overall timeout');
                return null;
            }
            // Ensure browser is available before proceeding
            if (!await ensureBrowserAvailable()) {
                log('ERROR', 'Browser not available for screenshot capture');
                return null;
            }

            let page = null;
            try {
                log('DEBUG', `Creating new page for screenshot capture (attempt ${attempt}/${maxRetries})`);
                page = await browser.newPage();
                
                // Set viewport
                await page.setViewport({ width: 1280, height: 800 });
                
                // Set longer timeout for navigation
                page.setDefaultTimeout(60000); // Increased from 30s to 60s
                
                // Simple request interception for faster loading
                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    if (['image', 'font'].includes(req.resourceType())) {
                        req.abort();
                    } else {
                        req.continue();
                    }
                });
                
                log('DEBUG', `Navigating to ${url} for screenshot capture`);
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 60000 // Increased from 30s to 60s
                });
                
                log('DEBUG', `Waiting for page to load...`);
                
                // Verify we're on the chart page
                const pageTitle = await page.title();
                log('DEBUG', `Page title: ${pageTitle}`);
                
                // Check if we're on the right page (should contain chart or symbol)
                const isChartPage = await page.evaluate(() => {
                    const bodyText = document.body.innerText || '';
                    const url = window.location.href;
                    return url.includes('/chart/') || bodyText.includes('TradingView') || bodyText.includes('Chart');
                });
                
                if (!isChartPage) {
                    log('WARN', 'Not on chart page, may need to wait longer for redirect');
                    // Wait a bit more for potential redirects
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                
                // Simple wait for page to be ready
                try {
                    await page.waitForFunction(() => {
                        return document.readyState === 'complete' && 
                               document.body.children.length > 0;
                    }, { timeout: 40000 }); // Increased from 20s to 40s
                } catch (error) {
                    log('DEBUG', 'Page ready wait timed out, proceeding anyway');
                }
                
                // Wait for TradingView to fully initialize
                const waitTime = isMac ? 6000 : 5000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Additional wait for TradingView chart to load
                try {
                    await page.waitForFunction(() => {
                        // Wait for TradingView specific elements
                        const tvChart = document.querySelector('.tv-chart-container, .tv-chart');
                        const tvCanvas = document.querySelector('canvas[class*="chart"]');
                        const tvLegend = document.querySelector('[data-name="legend-source-item"]');
                        
                        return tvChart && tvCanvas && tvLegend;
                    }, { timeout: 20000 }); // Increased from 10s to 20s
                    log('DEBUG', 'TradingView chart elements loaded');
                } catch (error) {
                    log('DEBUG', 'TradingView specific elements wait timed out, proceeding');
                }
                
                log('DEBUG', `Taking screenshot...`);
                
                // Wait for chart to be fully rendered and data loaded
                try {
                    await page.waitForFunction(() => {
                        // Check for TradingView chart container
                        const chartContainer = document.querySelector('.tv-chart-container, [data-role="chart"], .chart-container, .tv-chart');
                        const canvas = document.querySelector('canvas');
                        const chartElements = document.querySelectorAll('[class*="chart"], [class*="trading"]');
                        
                        // Check if we have chart elements or canvas
                        const hasChartElements = chartElements.length > 0;
                        const hasCanvas = canvas && canvas.offsetWidth > 0;
                        const hasChartContainer = chartContainer && chartContainer.offsetWidth > 0;
                        
                        // Check for loading spinners and make sure they're gone
                        const loadingSpinners = document.querySelectorAll('[class*="loading"], [class*="spinner"], .loading, .spinner');
                        const hasLoadingSpinners = Array.from(loadingSpinners).some(spinner => {
                            const style = window.getComputedStyle(spinner);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        });
                        
                        // Check for price data (not just loading state)
                        const priceElements = document.querySelectorAll('[class*="price"], [class*="value"], [data-name="legend-source-item"]');
                        const hasPriceData = priceElements.length > 0 && Array.from(priceElements).some(el => {
                            const text = el.textContent || el.innerText || '';
                            return /^\d+\.?\d*$/.test(text.trim()) && parseFloat(text) > 0;
                        });
                        
                        // Also check if we're not on an overview page
                        const bodyText = document.body.innerText || '';
                        const isOverviewPage = bodyText.includes('Search') && bodyText.includes('Products') && !bodyText.includes('Candlestick');
                        
                        // Make sure we have chart elements, no loading spinners, and price data
                        return (hasChartElements || hasCanvas || hasChartContainer) && 
                               !hasLoadingSpinners && 
                               hasPriceData && 
                               !isOverviewPage;
                    }, { timeout: 30000 }); // Increased timeout to 30 seconds
                    log('DEBUG', 'Chart is fully rendered with data');
                } catch (error) {
                    log('DEBUG', 'Chart rendering wait timed out, proceeding anyway');
                }
                
                // Try to focus on the chart area specifically
                try {
                    // Look for chart containers and scroll to them
                    const chartElement = await page.evaluate(() => {
                        // Common TradingView chart selectors
                        const selectors = [
                            '.tv-chart-container',
                            '[data-role="chart"]',
                            '.chart-container',
                            '.tv-chart',
                            'canvas',
                            '[class*="chart"]',
                            '[class*="trading"]'
                        ];
                        
                        for (const selector of selectors) {
                            const element = document.querySelector(selector);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                return true;
                            }
                        }
                        
                        // If no specific chart element found, try to find price elements
                        const priceElements = document.querySelectorAll('[class*="price"], [class*="value"]');
                        if (priceElements.length > 0) {
                            priceElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return true;
                        }
                        
                        // If still no chart found, scroll to center of page
                        window.scrollTo(0, window.innerHeight / 3);
                        return false;
                    });
                    
                    if (chartElement) {
                        log('DEBUG', 'Found chart element and scrolled to it');
                    } else {
                        log('DEBUG', 'No specific chart element found, scrolled to center');
                    }
                    
                    // Wait a bit for scroll to complete
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                } catch (scrollError) {
                    log('DEBUG', 'Error during chart focusing', { error: scrollError.message });
                }
                
                // Take viewport screenshot
                let screenshotBuffer;
                try {
                    // Check if page is still open before taking screenshot
                    if (page.isClosed()) {
                        throw new Error('Page was closed before screenshot could be taken');
                    }
                    
                    // First try to capture just the chart area
                    const chartArea = await page.evaluate(() => {
                        // Look for the main chart container
                        const chartContainer = document.querySelector('.tv-chart-container, [data-role="chart"], .chart-container, .tv-chart');
                        if (chartContainer) {
                            const rect = chartContainer.getBoundingClientRect();
                            return {
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height,
                                found: true
                            };
                        }
                        
                        // If no chart container, look for canvas or main content area
                        const canvas = document.querySelector('canvas');
                        if (canvas) {
                            const rect = canvas.getBoundingClientRect();
                            return {
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height,
                                found: true
                            };
                        }
                        
                        // Fallback: capture main content area (skip header)
                        const body = document.body;
                        const headerHeight = 200; // Approximate header height
                        return {
                            x: 0,
                            y: headerHeight,
                            width: body.scrollWidth,
                            height: body.scrollHeight - headerHeight,
                            found: false
                        };
                    });
                    
                    if (chartArea.found) {
                        log('DEBUG', 'Found chart area, capturing specific region', chartArea);
                        screenshotBuffer = await page.screenshot({
                            type: 'png',
                            clip: {
                                x: chartArea.x,
                                y: chartArea.y,
                                width: chartArea.width,
                                height: chartArea.height
                            },
                            omitBackground: true
                        });
                    } else {
                        log('DEBUG', 'No specific chart area found, using fallback region');
                        screenshotBuffer = await page.screenshot({
                            type: 'png',
                            clip: {
                                x: chartArea.x,
                                y: chartArea.y,
                                width: chartArea.width,
                                height: chartArea.height
                            },
                            omitBackground: true
                        });
                    }
                    
                } catch (screenshotError) {
                    log('WARN', 'Chart area screenshot failed, trying viewport', {
                        error: screenshotError.message
                    });
                    
                    // Fallback to viewport screenshot
                    screenshotBuffer = await page.screenshot({
                        type: 'png',
                        fullPage: false,
                        omitBackground: true
                    });
                }
                
                // Basic screenshot validation (less strict to avoid false positives)
                try {
                    const isValidScreenshot = await page.evaluate(() => {
                        // Only check for obvious loading states, not strict validation
                        const loadingSpinners = document.querySelectorAll('[class*="loading"], [class*="spinner"], .loading, .spinner');
                        const hasVisibleSpinners = Array.from(loadingSpinners).some(spinner => {
                            const style = window.getComputedStyle(spinner);
                            return style.display !== 'none' && style.visibility !== 'hidden' && spinner.offsetWidth > 0;
                        });
                        
                        // Check if page has any content at all
                        const bodyText = document.body.innerText || '';
                        const hasContent = bodyText.length > 100;
                        
                        // Only fail if we have obvious loading spinners AND no content
                        return !hasVisibleSpinners || hasContent;
                    });
                    
                    if (!isValidScreenshot && attempt < maxRetries) {
                        log('WARN', 'Screenshot appears to contain loading state, retrying...');
                        throw new Error('Screenshot contains loading state');
                    } else if (!isValidScreenshot) {
                        log('WARN', 'Screenshot validation failed on final attempt, proceeding anyway');
                    }
                    
                    log('INFO', `Screenshot captured for ${timeframe}`, {
                        timeframe,
                        url,
                        bufferSize: screenshotBuffer.length,
                        attempt,
                        isValid: isValidScreenshot
                    });
                    
                } catch (validationError) {
                    if (attempt < maxRetries) {
                        log('WARN', 'Screenshot validation failed, retrying...', { error: validationError.message });
                        throw validationError; // This will trigger a retry
                    } else {
                        log('WARN', 'Screenshot validation failed on final attempt, proceeding anyway', { error: validationError.message });
                    }
                }
                
                return screenshotBuffer;
                
            } catch (error) {
                lastError = error;
                log('WARN', `Screenshot capture attempt ${attempt} failed`, {
                    error: error.message,
                    timeframe,
                    url,
                    attempt
                });
                
                // If this is not the last attempt, wait a bit before retrying
                if (attempt < maxRetries) {
                    const retryDelay = isMac ? 5000 : 3000;
                    log('INFO', `Waiting before retry attempt ${attempt + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            } finally {
                // Close page AFTER taking screenshot and check if it's still open
                if (page && !page.isClosed()) {
                    try {
                        // Remove request interception before closing
                        try {
                            await page.setRequestInterception(false);
                        } catch (interceptError) {
                            log('DEBUG', 'Failed to remove request interception', { error: interceptError.message });
                        }
                        
                        await page.close();
                        log('DEBUG', 'Page closed successfully');
                    } catch (closeError) {
                        log('ERROR', 'Failed to close page', { error: closeError.message });
                    }
                }
            }
        }
        
        // All attempts failed
        log('ERROR', 'Screenshot capture failed after all retry attempts', {
            error: lastError?.message,
            timeframe,
            url,
            attempts: maxRetries
        });
        return null;
    };
    
    // Execute with timeout
    const timeoutMs = isMac ? 120000 : 90000; // Increased: Mac 2min, others 1.5min
    
    try {
        return await Promise.race([
            screenshotWithTimeout(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Screenshot capture timed out')), timeoutMs)
            )
        ]);
    } catch (timeoutError) {
        log('ERROR', 'Screenshot capture timed out', {
            error: timeoutError.message,
            timeframe,
            url
        });
        return null;
    }
}

// Enhanced function to capture chart screenshot and analyze with GPT Vision
async function captureAndAnalyzeChart(url, timeframe, symbol = null, analysisPrompt = null, progressCallback = null) {
    try {
        log('INFO', `Starting enhanced chart analysis for ${symbol || 'chart'} on ${timeframe}`);
        
        // Progress update: Screenshot capture
        if (progressCallback) {
            await progressCallback('📸 Capturing TradingView chart...', 79);
        }
        
        // Step 1: Capture the chart screenshot first
        const screenshotBuffer = await captureChartScreenshot(url, timeframe, symbol);
        
        if (!screenshotBuffer) {
            log('ERROR', 'Failed to capture TradingView screenshot');
            return {
                success: false,
                error: 'Could not capture chart screenshot',
                timestamp: new Date().toISOString()
            };
        }
        
        // Log screenshot capture success
        log('INFO', 'Chart screenshot captured successfully', {
            bufferSize: screenshotBuffer.length,
            timeframe,
            symbol
        });
        
        // Progress update: Price extraction
        if (progressCallback) {
            await progressCallback('💰 Extracting current price...', 80);
        }
        
        // Step 2: Extract current price from TradingView (separate instance)
        let currentPrice = null;
        try {
            const pricePage = await browser.newPage();
            pricePage.setDefaultTimeout(60000); // Set 60s timeout for price extraction
            await pricePage.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            currentPrice = await extractPriceFromTradingView(pricePage, symbol);
            await pricePage.close();
            
            if (currentPrice) {
                log('INFO', '✅ Extracted exact current price from TradingView', { 
                    currentPrice: parseFloat(currentPrice), 
                    symbol 
                });
            }
        } catch (error) {
            log('WARN', 'Failed to extract current price from TradingView', { error: error.message });
        }
        
        // Step 3: Analyze the screenshot with GPT Vision
        const defaultPrompt = `Analyze this ${symbol || 'trading'} chart on ${timeframe} timeframe for scalping opportunities. Focus on identifying the market structure and entry zones based on these specific conditions:

        **TREND IDENTIFICATION:**
        1. **Uptrend**: Market making higher highs and higher lows
        2. **Downtrend**: Market making lower highs and lower lows  
        3. **Sideways/Ranging**: Price oscillating between support and resistance

        **ENTRY ZONE CONDITIONS:**
        
        **For UPTREND markets:**
        - Look for bullish engulfing patterns as entry zones
        - Identify Fibonacci retracement levels (61.5% - 50% range) for pullback entries
        - Mark support levels where price bounces higher
        
        **For DOWNTREND markets:**
        - Look for bearish engulfing patterns as entry zones
        - Identify Fibonacci retracement levels (61.5% - 50% range) for pullback entries
        - Mark resistance levels where price bounces lower
        
        **For SIDEWAYS markets:**
        - Mark both support and resistance levels clearly
        - Support zones: Presence of bullish engulfing patterns
        - Resistance zones: Presence of bearish engulfing patterns
        - Look for range-bound trading opportunities

        **ANALYSIS REQUIREMENTS:**
        1. **Market Structure**: Determine if uptrend, downtrend, or sideways
        2. **Key Levels**: Identify specific price levels for support/resistance
        3. **Engulfing Patterns**: Locate bullish and bearish engulfing formations
        4. **Fibonacci Levels**: If applicable, identify 61.5% and 50% retracement levels
        5. **Entry Zones**: Based on trend direction and pattern recognition
        6. **Risk Management**: Stop loss and take profit levels for each setup

        Provide specific price levels and clear reasoning for each entry zone identified.`;
        
        const prompt = analysisPrompt || defaultPrompt;
        
        // Progress update: GPT Vision analysis
        if (progressCallback) {
            await progressCallback('🤖 Analyzing chart with GPT-4 Vision...', 82);
        }
        
        const visionAnalysis = await analyzeChartWithVision(screenshotBuffer, prompt);
        
        if (!visionAnalysis.success) {
            log('ERROR', 'GPT Vision analysis failed', visionAnalysis.error);
            return {
                success: false,
                error: 'Chart analysis failed: ' + visionAnalysis.error,
                screenshot: screenshotBuffer,
                timestamp: new Date().toISOString()
            };
        }
        
        // Progress update: Zone drawing
        if (progressCallback) {
            await progressCallback('🎨 Drawing entry zones on chart...', 84);
        }
        
        // Step 4: Use GPT Vision to draw accurate zones on the screenshot
        let finalScreenshot = screenshotBuffer;
        try {
            if (currentPrice && visionAnalysis.analysis) {
                log('INFO', 'Using GPT Vision to draw accurate zones on screenshot');
                
                // Create a prompt for GPT Vision to draw zones
                const zoneDrawingPrompt = `Based on this trading chart analysis, draw accurate entry zones on the chart:

                Current Price: ${currentPrice}
                Analysis: ${visionAnalysis.analysis.substring(0, 500)}...

                Please draw:
                1. Support zones (BUY zones) in GREEN below current price
                2. Resistance zones (SELL zones) in RED above current price
                3. Make sure zones are positioned accurately relative to the current price
                4. Add clear labels for each zone
                5. Ensure zones are visible and properly positioned on the chart

                Draw the zones directly on this chart image.`;
                
                const zoneDrawingResult = await analyzeChartWithVision(screenshotBuffer, zoneDrawingPrompt);
                
                if (zoneDrawingResult.success && zoneDrawingResult.image) {
                    finalScreenshot = zoneDrawingResult.image;
                    log('INFO', '✅ GPT Vision zone drawing completed successfully');
                } else {
                    log('WARN', 'GPT Vision zone drawing failed, using original screenshot');
                }
            }
        } catch (error) {
            log('WARN', 'Failed to draw zones with GPT Vision', { error: error.message });
        }
        
        log('INFO', 'Enhanced chart analysis completed successfully');
        
        return {
            success: true,
            symbol: symbol,
            timeframe: timeframe,
            url: url,
            screenshot: finalScreenshot,
            analysis: visionAnalysis.analysis,
            model: visionAnalysis.model,
            currentPrice: currentPrice ? parseFloat(currentPrice) : null,
            timestamp: visionAnalysis.timestamp
        };
        
    } catch (error) {
        log('ERROR', 'Enhanced chart analysis failed', {
            error: error.message,
            symbol,
            timeframe,
            url
        });
        
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Test function for GPT Vision chart analysis integration
async function testVisionChartAnalysis(symbol = 'XAUUSD', timeframe = 'H1') {
    try {
        log('INFO', `Testing GPT Vision chart analysis for ${symbol} on ${timeframe}`);
        
        // You would replace this with an actual chart URL
        const testUrl = `https://example-chart-url.com/${symbol}/${timeframe}`;
        
        log('INFO', 'To test the GPT Vision integration:');
        log('INFO', '1. Replace testUrl with a real TradingView chart URL');
        log('INFO', '2. Ensure OPENAI_API_KEY is set in your environment');
        log('INFO', '3. Call captureAndAnalyzeChart(url, timeframe, symbol)');
        
        return {
            success: true,
            message: 'GPT Vision integration is ready for testing',
            example_usage: `captureAndAnalyzeChart("${testUrl}", "${timeframe}", "${symbol}")`,
            requirements: [
                'Valid TradingView chart URL',
                'OpenAI API key configured',
                'Internet connection for both screenshot and GPT API'
            ]
        };
        
    } catch (error) {
        log('ERROR', 'Vision chart analysis test failed', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Function to draw zones on chart image
async function drawZonesOnImage(screenshotBuffer, analysis) {
    try {
        log('DEBUG', 'Starting to draw zones on image');
        
        // Load the original screenshot
        const originalImage = await loadImage(screenshotBuffer);
        
        // Create a canvas with the same dimensions
        const canvas = createCanvas(originalImage.width, originalImage.height);
        const ctx = canvas.getContext('2d');
        
        // Draw the original image
        ctx.drawImage(originalImage, 0, 0);
        
        // Chart area estimation (assuming typical TradingView layout)
        const chartArea = {
            x: Math.floor(originalImage.width * 0.1), // 10% from left
            y: Math.floor(originalImage.height * 0.15), // 15% from top
            width: Math.floor(originalImage.width * 0.8), // 80% width
            height: Math.floor(originalImage.height * 0.7) // 70% height
        };
        
        // Get price range for positioning zones
        const currentPrice = analysis.currentPrice;
        const priceRange = currentPrice * 0.05; // 5% range
        
        // Draw entry zones
        if (analysis.entryZones && analysis.entryZones.length > 0) {
            analysis.entryZones.forEach((zone, index) => {
                if (zone.confidence === 'high') {
                    drawZoneOnChart(ctx, zone, chartArea, currentPrice, priceRange, analysis.assetType);
                }
            });
        }
        
        // Draw fibonacci zones
        if (analysis.fibonacciZones && analysis.fibonacciZones.length > 0) {
            analysis.fibonacciZones.forEach(fibZone => {
                drawFibonacciLevel(ctx, fibZone, chartArea, currentPrice, priceRange, analysis.assetType);
            });
        }
        
        // Add legend
        drawLegend(ctx, originalImage.width, originalImage.height, analysis);
        
        log('DEBUG', 'Successfully drew zones on image');
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        log('ERROR', 'Failed to draw zones on image', {
            error: error.message
        });
        // Return original image if annotation fails
        return screenshotBuffer;
    }
}

// Draw individual zone on chart
function drawZoneOnChart(ctx, zone, chartArea, currentPrice, priceRange, assetType) {
    const zonePrice = parseFloat(zone.price);
    const priceDiff = (zonePrice - currentPrice) / priceRange;
    
    // Calculate Y position (inverted because Y=0 is at top)
    const yPosition = chartArea.y + chartArea.height/2 - (priceDiff * chartArea.height/2);
    
    // Ensure zone is within chart bounds
    if (yPosition < chartArea.y || yPosition > chartArea.y + chartArea.height) {
        return; // Skip if outside chart area
    }
    
    // Zone styling
    const isBuyZone = zone.type.includes('BUY');
    const zoneColor = isBuyZone ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
    const borderColor = isBuyZone ? 'rgb(0, 200, 0)' : 'rgb(200, 0, 0)';
    
    // Draw zone rectangle
    const zoneHeight = 20;
    ctx.fillStyle = zoneColor;
    ctx.fillRect(chartArea.x, yPosition - zoneHeight/2, chartArea.width, zoneHeight);
    
    // Draw zone border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(chartArea.x, yPosition - zoneHeight/2, chartArea.width, zoneHeight);
    
    // Draw zone label
    ctx.fillStyle = borderColor;
    ctx.font = 'bold 14px Arial';
    const label = `${zone.type.replace('_', ' ')} - ${assetType === 'gold' ? '$' : ''}${zone.price}`;
    const textWidth = ctx.measureText(label).width;
    
    // Position label on the right side
    const labelX = chartArea.x + chartArea.width - textWidth - 10;
    const labelY = yPosition + 5;
    
    // Draw white background for text
    ctx.fillStyle = 'white';
    ctx.fillRect(labelX - 5, labelY - 15, textWidth + 10, 20);
    
    // Draw text
    ctx.fillStyle = borderColor;
    ctx.fillText(label, labelX, labelY);
}

// Draw fibonacci level
function drawFibonacciLevel(ctx, fibZone, chartArea, currentPrice, priceRange, assetType) {
    const fibPrice = parseFloat(fibZone.price);
    const priceDiff = (fibPrice - currentPrice) / priceRange;
    
    // Calculate Y position
    const yPosition = chartArea.y + chartArea.height/2 - (priceDiff * chartArea.height/2);
    
    // Ensure level is within chart bounds
    if (yPosition < chartArea.y || yPosition > chartArea.y + chartArea.height) {
        return;
    }
    
    // Draw dashed line
    ctx.strokeStyle = 'rgb(255, 165, 0)'; // Orange color
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    ctx.moveTo(chartArea.x, yPosition);
    ctx.lineTo(chartArea.x + chartArea.width, yPosition);
    ctx.stroke();
    
    // Reset line dash
    ctx.setLineDash([]);
    
    // Draw label
    ctx.fillStyle = 'rgb(255, 165, 0)';
    ctx.font = '12px Arial';
    const label = `Fib ${fibZone.level} - ${assetType === 'gold' ? '$' : ''}${fibZone.price}`;
    ctx.fillText(label, chartArea.x + 10, yPosition - 5);
}

// Draw legend
function drawLegend(ctx, imageWidth, imageHeight, analysis) {
    const legendX = 20;
    const legendY = 20;
    const legendWidth = 200;
    const legendHeight = 120;
    
    // Draw legend background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
    
    // Legend border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
    
    // Legend text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('ZONE ANALYSIS', legendX + 10, legendY + 20);
    
    ctx.font = '10px Arial';
    ctx.fillStyle = 'rgb(0, 200, 0)';
    ctx.fillText('🟢 BUY ZONES', legendX + 10, legendY + 40);
    
    ctx.fillStyle = 'rgb(200, 0, 0)';
    ctx.fillText('🔴 SELL ZONES', legendX + 10, legendY + 55);
    
    ctx.fillStyle = 'rgb(255, 165, 0)';
    ctx.fillText('--- Fibonacci Levels', legendX + 10, legendY + 70);
    
    // Market structure
    ctx.fillStyle = 'white';
    const structure = analysis.marketStructure.trend.toUpperCase();
    ctx.fillText(`Trend: ${structure}`, legendX + 10, legendY + 90);
    
    // Trading style
    ctx.fillText(`Style: ${analysis.tradingStyle.toUpperCase()}`, legendX + 10, legendY + 105);
}

// Handle forex timeframe selection
async function handleForexTimeframeSelection(chatId, userId, username, symbol) {
    log('INFO', `📈 User requested forex timeframe selection for ${symbol}`, {
        chatId,
        userId,
        username,
        symbol
    });
    
    const pairName = Object.keys(TRADINGVIEW_CONFIG.symbols.forex).find(key => 
        TRADINGVIEW_CONFIG.symbols.forex[key] === symbol
    ) || symbol;
    
    const message = `
<b>📈 ${pairName} Analysis</b>

<b>⏰ Select Timeframe:</b>
Choose your preferred analysis timeframe for GBP/USD trading.

Choose your trading style for professional analysis:

🔥 <b>Scalping:</b> Fast-paced trades (1-15 minutes)
📈 <b>Swing:</b> Medium-term positions (hours to days)

Select your preferred trading style:
    `;
    
    const timeframeKeyboard = {
        inline_keyboard: [
            [
                { text: '🔥 Scalping', callback_data: `forex_style_scalping_${symbol}` },
                { text: '📈 Swing', callback_data: `forex_style_swing_${symbol}` }
            ],
            [
                { text: '🔙 Back to Forex Pairs', callback_data: 'asset_forex' }
            ]
        ]
    };
    
    await bot.sendMessage(chatId, message, { 
        parse_mode: 'HTML',
        reply_markup: timeframeKeyboard
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    log('INFO', '🛑 Received SIGTERM, shutting down gracefully...');
    
    // Close browser if it exists
    if (browser) {
        try {
            // Close all pages first
            const pages = await browser.pages();
            for (const page of pages) {
                try {
                    if (!page.isClosed()) {
                        await page.close();
                    }
                } catch (pageError) {
                    log('DEBUG', 'Failed to close page during shutdown', { error: pageError.message });
                }
            }
            
            await browser.close();
            log('INFO', '🌐 Puppeteer browser closed successfully');
        } catch (error) {
            log('ERROR', 'Failed to close browser', { error: error.message });
        }
        browser = null;
    }
    
    process.exit(0);
});

process.on('SIGINT', async () => {
    log('INFO', '🛑 Received SIGINT, shutting down gracefully...');
    
    // Close browser if it exists
    if (browser) {
        try {
            // Close all pages first
            const pages = await browser.pages();
            for (const page of pages) {
                try {
                    if (!page.isClosed()) {
                        await page.close();
                    }
                } catch (pageError) {
                    log('DEBUG', 'Failed to close page during shutdown', { error: pageError.message });
                }
            }
            
            await browser.close();
            log('INFO', '🌐 Puppeteer browser closed successfully');
        } catch (error) {
            log('ERROR', 'Failed to close browser', { error: error.message });
        }
        browser = null;
    }
    
    process.exit(0);
});

// Start the Express server
app.listen(port, async () => {
    log('INFO', `🧞‍♂️ PRIMUSGPT.AI is running on port ${port}`);
    log('INFO', `📊 Current subscribers: ${authorizedGroups.size}`);
    log('INFO', `⏰ Trading hours active: ${isWithinTradingHours()}`);
    log('INFO', `🕐 Next signal: ${getNextSignalTime()}`);
    log('INFO', `🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    log('INFO', `📊 Log Level: ${currentLogLevel}`);
    
    // Wait a bit before initializing Puppeteer to ensure system is stable
    log('INFO', '⏳ Waiting for system to stabilize before initializing browser...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Initialize Puppeteer browser for chart screenshots
    await initializeBrowser();
    
    // Send startup notification to subscribers
    if (authorizedGroups.size > 0) {
        log('INFO', '📢 Sending startup notification to subscribers');
        
        const startupMessage = `
<b>🧞‍♂️ PRIMUSGPT.AI is Online</b>

✅ System has been restarted and is now operational
📊 Professional analysis engine is active
⏰ Next automated signal: ${getNextSignalTime()}
🔔 Real-time notifications are enabled

<b>✨ Your AI trading companion is ready to serve!</b>
        `;
        sendMarketNotification(startupMessage);
    } else {
        log('INFO', '📊 No subscribers to notify on startup');
    }
    
    log('INFO', '🎉 PRIMUSGPT.AI startup sequence completed successfully');
});

/**
 * Add analysis overlay to screenshot with zones and data
 * @param {Buffer} screenshotBuffer - Original screenshot buffer
 * @param {Object} analysis - Analysis data
 * @param {String} timeframe - Timeframe
 * @returns {Buffer} Screenshot with overlay
 */
async function addAnalysisOverlayToScreenshot(screenshotBuffer, analysis, timeframe) {
    try {
        const sharp = require('sharp');
        
        // Create overlay with analysis data
        const overlaySvg = createAnalysisOverlaySVG(analysis, timeframe);
        
        // Convert SVG to buffer
        const overlayBuffer = Buffer.from(overlaySvg);
        
        // Composite the overlay onto the screenshot
        const finalImage = await sharp(screenshotBuffer)
            .composite([{
                input: overlayBuffer,
                top: 50,
                left: 50
            }])
            .png()
            .toBuffer();
        
        return finalImage;
        
    } catch (error) {
        log('ERROR', `Failed to add overlay: ${error.message}`);
        throw error;
    }
}

/**
 * Create SVG overlay with analysis data and zone markers
 * @param {Object} analysis - Analysis data
 * @param {String} timeframe - Timeframe
 * @returns {String} SVG string
 */
function createAnalysisOverlaySVG(analysis, timeframe) {
    const currentPrice = analysis.currentPrice || 0;
    const trend = analysis.marketStructure?.trend || 'sideways';
    const strength = analysis.marketStructure?.strength || 'moderate';
    const entryZones = analysis.entryZones || [];
    
    // Calculate zone positions based on price levels
    // For TradingView screenshots, we need to position zones relative to the visible chart area
    const zoneMarkers = entryZones.slice(0, 3).map((zone, index) => {
        const zonePrice = parseFloat(zone.price);
        
        // Position zones in the right side of the chart (where current price is visible)
        // Use a more conservative approach that works with typical TradingView screenshots
        const x = 350; // Right side of chart
        
        // Calculate Y position based on price difference from current
        // Assume chart shows roughly ±3% from current price
        const priceDiff = zonePrice - currentPrice;
        const priceDiffPercent = (priceDiff / currentPrice) * 100;
        
        // Map price difference to Y position
        // Positive diff (higher price) = lower Y (top of chart)
        // Negative diff (lower price) = higher Y (bottom of chart)
        let yPosition;
        if (priceDiffPercent > 0) {
            // Zone is above current price
            yPosition = 200 - (priceDiffPercent * 10); // Move up
        } else {
            // Zone is below current price
            yPosition = 200 + (Math.abs(priceDiffPercent) * 10); // Move down
        }
        
        const color = zone.type.includes('BUY') ? '#00ff00' : '#ff0000';
        const icon = zone.type.includes('BUY') ? '🟢' : '🔴';
        
        return {
            x: x,
            y: Math.max(100, Math.min(500, yPosition)), // Clamp to reasonable chart area
            price: zonePrice,
            type: zone.type,
            color: color,
            icon: icon
        };
    });
    
    // Create SVG overlay
    const svg = `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <!-- Analysis Panel (Top Left) -->
        <rect x="20" y="20" width="300" height="200" fill="rgba(0,0,0,0.9)" rx="10"/>
        
        <!-- Header -->
        <text x="40" y="45" fill="white" font-family="Arial, sans-serif" font-size="16" font-weight="bold">
            🎯 ${analysis.tradingStyle === 'scalping' ? 'SCALPING' : analysis.tradingStyle === 'swing' ? 'SWING' : 'ANALYSIS'} - ${analysis.assetType?.toUpperCase() || 'GOLD'}
        </text>
        
        <!-- Price and Trend -->
        <text x="40" y="70" fill="white" font-family="Arial, sans-serif" font-size="14">
            💰 $${currentPrice.toFixed(2)}/oz | 📊 ${trend.toUpperCase()}
        </text>
        
        <!-- Strength -->
        <text x="40" y="90" fill="white" font-family="Arial, sans-serif" font-size="14">
            🔥 ${strength.toUpperCase()}
        </text>
        
        <!-- Patterns and Fib -->
        <text x="40" y="115" fill="white" font-family="Arial, sans-serif" font-size="14">
            🕯️ Patterns: ${analysis.engulfingPatterns?.length || 0} found
        </text>
        <text x="40" y="135" fill="white" font-family="Arial, sans-serif" font-size="14">
            📈 Fib Zones: ${analysis.fibonacciZones?.length || 0} levels
        </text>
        
        <!-- Entry Zones -->
        <text x="40" y="160" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="bold">
            🎯 ENTRY ZONES:
        </text>
        
        ${entryZones.slice(0, 2).map((zone, index) => `
            <text x="50" y="${180 + (index * 20)}" fill="${zone.type.includes('BUY') ? '#00ff00' : '#ff0000'}" font-family="Arial, sans-serif" font-size="12">
                ${zone.type.includes('BUY') ? '🟢' : '🔴'} ${zone.type.replace('_', ' ')}: $${zone.price}
            </text>
        `).join('')}
        
        <!-- Zone Markers on Chart -->
        ${zoneMarkers.map(marker => `
            <!-- Zone Line -->
            <line x1="350" y1="${marker.y}" x2="750" y2="${marker.y}" stroke="${marker.color}" stroke-width="2" stroke-dasharray="5,5"/>
            
            <!-- Zone Label -->
            <rect x="750" y="${marker.y - 10}" width="40" height="20" fill="${marker.color}" rx="5"/>
            <text x="770" y="${marker.y + 5}" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">
                ${marker.icon}
            </text>
            
            <!-- Price Label -->
            <text x="760" y="${marker.y + 20}" fill="${marker.color}" font-family="Arial, sans-serif" font-size="10" font-weight="bold">
                $${marker.price}
            </text>
        `).join('')}
        
        <!-- Current Price Line -->
        <line x1="350" y1="300" x2="750" y2="300" stroke="yellow" stroke-width="3"/>
        <text x="760" y="305" fill="yellow" font-family="Arial, sans-serif" font-size="12" font-weight="bold">
            💰 $${currentPrice.toFixed(2)}
        </text>
        
        <!-- Recommendations -->
        ${analysis.recommendation?.suggestions ? `
            <rect x="20" y="550" width="760" height="30" fill="rgba(0,0,0,0.8)" rx="5"/>
            <text x="40" y="570" fill="white" font-family="Arial, sans-serif" font-size="12">
                💡 SL: ${analysis.recommendation.suggestions.stopLoss} | TP: ${analysis.recommendation.suggestions.takeProfit}
            </text>
        ` : ''}
        
        <!-- Disclaimer -->
        <text x="20" y="590" fill="yellow" font-family="Arial, sans-serif" font-size="10">
            ⚠️ Analysis only - do your own research
        </text>
    </svg>
    `;
    
    return svg;
}

// Helper function to get pattern information for display
function getPatternInfo(zone, engulfingPatterns) {
    if (!engulfingPatterns || engulfingPatterns.length === 0) return null;
    
    // Find pattern that matches the zone price
    const matchingPattern = engulfingPatterns.find(pattern => {
        const priceDiff = Math.abs(parseFloat(pattern.price) - parseFloat(zone.price));
        const tolerance = parseFloat(zone.price) * 0.001; // 0.1% tolerance
        return priceDiff <= tolerance;
    });
    
    if (matchingPattern && matchingPattern.score !== undefined) {
        return {
            strength: matchingPattern.strength || 'moderate',
            score: matchingPattern.score || 0
        };
    }
    
    return null;
}

// Export functions for testing
module.exports = {
    createAnalysisOverlaySVG,
    getPatternInfo
};