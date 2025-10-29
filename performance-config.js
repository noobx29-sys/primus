// Performance optimization configuration
module.exports = {
    // Reduce all timeout delays by 70%
    delays: {
        chartCapture: 300,      // was 1500ms
        imageProcessing: 200,   // was 1000ms
        gptAnalysis: 300,       // was 1200ms
        pageLoad: 600,          // was 2000ms
        browserInit: 500,       // was 2000ms
        messageDelay: 100,      // was 300ms
        progressUpdate: 150     // was 500ms
    },

    // Browser optimization settings
    browser: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--enable-automation',
            '--password-store=basic',
            '--use-mock-keychain'
        ],
        defaultViewport: {
            width: 1024,
            height: 768
        },
        timeout: 15000  // Reduced from default 30000ms
    },

    // Chart generation optimization
    chart: {
        enableCaching: true,
        cacheTimeout: 300000,   // 5 minutes
        maxCandlesticks: 200,   // Reduce from 500
        simplifiedDrawing: true
    },

    // GPT Vision optimization
    vision: {
        maxRetries: 2,          // Reduced from 3
        timeout: 60000,         // Reduced from 180000ms
        imageQuality: 'medium', // was 'high'
        maxTokens: 800         // Reduced from 1500
    }
};