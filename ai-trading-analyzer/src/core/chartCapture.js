import puppeteer from 'puppeteer';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import fs from 'fs';
import path from 'path';

class ChartCapture {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * Press Control + "+" multiple times to adjust zoom/layout (browser-level)
   * Uses NumpadAdd and Shift+Equal variants for robustness.
   */
  async pressCtrlPlus(times = 2) {
    const pressCombo = async (combo) => {
      for (let i = 0; i < times; i++) {
        await this.page.bringToFront();
        for (const key of combo.down) await this.page.keyboard.down(key);
        await this.page.keyboard.press(combo.key);
        for (const key of combo.up.reverse()) await this.page.keyboard.up(key);
        await this.page.waitForTimeout(120);
      }
    };
  
    try {
      // 1) Try Ctrl + NumpadAdd
      await pressCombo({ down: ['Control'], key: 'NumpadAdd', up: ['Control'] });
      logger.info(`Sent Ctrl+NumpadAdd ${times} time(s)`);
      return;
    } catch {}
  
    try {
      // 2) Try Ctrl + Shift + Equal (i.e., '+')
      await pressCombo({ down: ['Control', 'Shift'], key: 'Equal', up: ['Shift', 'Control'] });
      logger.info(`Sent Ctrl+Shift+Equal ${times} time(s)`);
      return;
    } catch {}
  
    try {
      // 3) Fallback: CSS zoom
      await this.page.evaluate((t) => {
        const cur = parseFloat(document.body.style.zoom || '1');
        document.body.style.zoom = String(cur + 0.1 * t);
      }, times);
      logger.info(`Applied CSS zoom fallback x${times}`);
    } catch (err) {
      logger.warn('Pre-capture zoom attempts failed (non-critical)', err);
    }
  }
  

  /**
   * Initialize Puppeteer browser
   */
  async initialize() {
    try {
      logger.info('Initializing Puppeteer browser...');
      
      this.browser = await puppeteer.launch({
        headless: config.puppeteer.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          `--window-size=${config.chart.width},${config.chart.height}`
        ],
        defaultViewport: {
          width: config.chart.width,
          height: config.chart.height,
          deviceScaleFactor: 1
        }
      });

      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      logger.success('Puppeteer browser initialized');
      return true;
    } catch (error) {
      logger.failure('Failed to initialize Puppeteer', error);
      throw error;
    }
  }

  /**
   * Capture TradingView chart screenshot
   * @param {string} pair - Trading pair (e.g., XAUUSD)
   * @param {string} timeframe - Timeframe (e.g., 1D, 30, 15, 5)
   * @returns {Promise<string>} Path to screenshot
   */
  async captureChart(pair, timeframe) {
    return retryWithBackoff(
      async () => {
        try {
          logger.info(`Capturing ${pair} chart on ${timeframe} timeframe...`);

          if (!this.page) {
            await this.initialize();
          }

          // Check if we need to navigate or if we can just change timeframe on current page
          const currentUrl = this.page.url();
          const targetUrl = this.buildGoChartingUrl(pair, timeframe);
          const needsNavigation = !currentUrl || 
                                  !currentUrl.includes('gocharting.com') || 
                                  !currentUrl.includes(pair);

          if (needsNavigation) {
            // Navigate to GoCharting for the first time or when changing pairs
            logger.info(`Navigating to: ${targetUrl}`);
            await this.page.goto(targetUrl, {
              waitUntil: 'networkidle2',
              timeout: config.puppeteer.timeout
            });
            
            // Wait for chart to load
            await this.waitForChartLoad();
          } else {
            // Same pair, just change timeframe using keyboard shortcut
            logger.info(`Already on ${pair} chart, changing timeframe via keyboard...`);
            await this.changeTimeframe(timeframe);
            // Give extra time for chart to update
            await this.page.waitForTimeout(1000);
          }


        
      // Remove overlays and UI elements (keep this BEFORE zoom so the chart can get focus)
await this.cleanChartView();

// Deterministic zoom via DevTools (works in headless reliably)
try {
  const cdp = await this.page.target().createCDPSession();
  // 1.15 ~ 15% zoom-in; tune as you like or make it env-driven
  const scale = parseFloat(process.env.PAGE_SCALE_FACTOR || '1');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
  logger.info(`Applied DevTools page scale: ${scale}`);
} catch (e) {
  logger.warn('DevTools page scale failed, will try keyboard/CSS zoom fallback', e);
}

// Optional: pre-capture hotkeys (still try; your pressCtrlPlus already tries NumpadAdd and Ctrl+Shift+Equal)
const ctrlPlusCount = parseInt(process.env.PRE_HOTKEY_CTRL_PLUS_COUNT || '2');
if (ctrlPlusCount > 0) {
  await this.pressCtrlPlus(ctrlPlusCount);
  await this.page.waitForTimeout(250);
}


          // Take screenshot
          const screenshotPath = await this.takeScreenshot(pair, timeframe);

          // Validate screenshot
          if (!this.validateScreenshot(screenshotPath)) {
            throw new Error('Screenshot validation failed');
          }

          logger.success(`Chart captured: ${screenshotPath}`);
          return screenshotPath;

        } catch (error) {
          logger.failure(`Failed to capture ${pair} chart on ${timeframe}`, error);
          throw error;
        }
      },
      {
        retries: config.retry.maxRetries,
        operationName: `captureChart-${pair}-${timeframe}`
      }
    );
  }

  /**
   * Build GoCharting URL
   * @param {string} pair - Trading pair (e.g., XAUUSD)
   * @param {string} timeframe - Timeframe (e.g., 1D, 30, 15, 5)
   * @returns {string} GoCharting URL
   */
  buildGoChartingUrl(pair, timeframe) {
    const base = (config.goCharting && config.goCharting.baseUrl) || 'https://gocharting.com/terminal';
    const tmpl = (config.goCharting && config.goCharting.tickerTemplate) || 'GOCHARTING:{EXNESS:SPOT:%SYMBOL%}';
    const intervalParam = (config.goCharting && config.goCharting.intervalParam) || 'interval';
    // Build ticker string by replacing %SYMBOL%
    const ticker = tmpl.replace('%SYMBOL%', pair);
    const params = new URLSearchParams();
    params.set('ticker', ticker);
    if (timeframe) params.set(intervalParam, timeframe);
    const url = `${base}?${params.toString()}`;
    return url;
  }

  /**
   * [Deprecated] TradingView formatter – kept for backward compatibility if needed elsewhere.
   * Not used in GoCharting flow.
   */
  formatPairForTradingView(pair) {
    // Gold pairs
    if (pair.includes('XAU') || pair.includes('GOLD')) {
      return `OANDA:${pair}`;
    }
    // Forex pairs
    return `FX:${pair}`;
  }

  /**
   * Wait for chart to fully load
   */
  async waitForChartLoad() {
    logger.info('Waiting for chart to load (GoCharting)...');
    try {
      // GoCharting renders the plot on canvases; wait for multiple canvases to appear
      await this.page.waitForFunction(
        () => document.querySelectorAll('canvas').length >= 1,
        { timeout: config.puppeteer.timeout }
      );

      // Extra wait for stabilization
      await this.page.waitForTimeout(config.chart.loadWait);
      await this.page.evaluate(() => window.scrollTo(0, 0));
      logger.success('Chart loaded successfully (GoCharting)');
    } catch (error) {
      logger.failure('Chart load timeout (GoCharting)', error);
      throw new Error('Chart failed to load within timeout period');
    }
  }

  /**
   * Change timeframe using keyboard shortcuts or UI interaction
   * GoCharting might not respect URL params, so we use hotkeys
   * @param {string} timeframe - Target timeframe (e.g., '5', '15', '30', '1D')
   */
  async changeTimeframe(timeframe) {
    try {
      logger.info(`Attempting to change timeframe to: ${timeframe}`);
      
      // Map timeframes to GoCharting keyboard shortcuts
      const shortcuts = {
        '1': '1',    // 1 min
        '5': '5',    // 5 min
        '15': '1+5', // 15 min (might need Alt+1 then Alt+5)
        '30': '3',   // 30 min
        '60': '6',   // 1 hour (might be 'H')
        '240': 'H',  // 4 hour
        '1D': 'D',   // Daily
        '1W': 'W',   // Weekly
        '1M': 'M'    // Monthly
      };

      const shortcut = shortcuts[timeframe];
      if (!shortcut) {
        logger.warn(`No keyboard shortcut found for timeframe: ${timeframe}`);
        return false;
      }

      // Try multiple approaches to change timeframe
      // 1. First try: direct key press (may require focus on chart)
      await this.page.bringToFront();
      await this.page.click('canvas'); // Focus on chart
      await this.page.waitForTimeout(300);
      
      // Send the keyboard shortcut
      if (shortcut.includes('+')) {
        // Complex shortcut (e.g., '1+5' for 15min)
        const keys = shortcut.split('+');
        for (const key of keys) {
          await this.page.keyboard.press(key);
          await this.page.waitForTimeout(200);
        }
      } else {
        // Simple shortcut
        await this.page.keyboard.press(shortcut);
      }

      // Wait for chart to update
      await this.page.waitForTimeout(2000);
      logger.success(`Timeframe changed to: ${timeframe}`);
      return true;

    } catch (error) {
      logger.warn(`Failed to change timeframe via keyboard: ${error.message}`);
      return false;
    }
  }

  /**
   * Draw price zones on TradingView chart using TradingView's drawing API
   * @param {number} priceHigh - Upper price of zone
   * @param {number} priceLow - Lower price of zone
   * @param {string} color - Zone color (e.g., '#0066FF')
   * @param {number} chartPriceHigh - Chart's highest visible price (optional, for better accuracy)
   * @param {number} chartPriceLow - Chart's lowest visible price (optional, for better accuracy)
   */
  async drawZoneOnChart(priceHigh, priceLow, color = '#0066FF', chartPriceHigh = null, chartPriceLow = null) {
    // GoCharting: No public widget API exposed like TradingView in this codebase.
    // Implement a non-invasive overlay rectangle aligned to the chart canvas area as a temporary solution.
    try {
      logger.info(`Drawing zone overlay (GoCharting): ${priceLow} - ${priceHigh}`);

      const result = await this.page.evaluate(({ high, low, zoneColor, expectedChartHigh, expectedChartLow }) => {
        try {
          // 1) Find the main chart canvas
          const canvases = Array.from(document.querySelectorAll('canvas'));
          if (!canvases.length) return { ok: false, reason: 'no_canvas' };
          const main = canvases
            .map(c => ({ c, r: c.getBoundingClientRect() }))
            .filter(x => x.r.width > 200 && x.r.height > 150)
            .sort((a, b) => (b.r.width * b.r.height) - (a.r.width * a.r.height))[0];
          if (!main) return { ok: false, reason: 'no_main_canvas' };

          // 2) Read right-axis ticks to build price->y mapping
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const isNum = (s) => /^[-+]?\d*\.?\d+$/.test(String(s).trim());
          const candidates = [];
          
          // First pass: collect all numeric elements on the right edge
          const rightEdgeNums = [];
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            if (!el || !el.getBoundingClientRect || !el.textContent) continue;
            const txt = el.textContent.trim();
            if (!isNum(txt) || txt.includes(':')) continue; // Skip time values
            const r = el.getBoundingClientRect();
            // Must be on right edge, reasonable size, and within chart vertical bounds
            if (r.width > 15 && r.width < 150 && r.height > 10 && r.height < 40 && 
                (vw - r.right) <= 80 && r.bottom > main.r.top && r.top < main.r.bottom) {
              const price = parseFloat(txt);
              // Filter by expected price range for the instrument
              if (price > 1 && price < 100000) {  // Reasonable range for most instruments
                rightEdgeNums.push({ price, y: r.top + r.height / 2, r, txt });
              }
            }
          }
          
          // Second pass: filter to keep only elements that look like price axis labels
          // Price axis labels should be evenly distributed vertically
          for (const item of rightEdgeNums) {
            // Check if this element's text content is EXACTLY the price (not part of a larger string)
            if (item.txt === item.price.toString() || item.txt === item.price.toFixed(0) || 
                item.txt === item.price.toFixed(1) || item.txt === item.price.toFixed(2)) {
              candidates.push(item);
            }
          }
          // Deduplicate ticks with similar prices (within 0.1% tolerance)
          const uniqueTicks = [];
          for (const tick of candidates.sort((a, b) => a.price - b.price)) {
            if (uniqueTicks.length === 0 || Math.abs(tick.price - uniqueTicks[uniqueTicks.length - 1].price) / tick.price > 0.001) {
              uniqueTicks.push(tick);
            }
          }
          const ticks = uniqueTicks;
          console.log(`[Zone Debug] All ${ticks.length} ticks:`, ticks.map(t => `${t.price}@y${t.y.toFixed(0)}`).join(', '));

          // If we have expected chart range, use it directly instead of detected ticks
          if (expectedChartHigh && expectedChartLow && Math.abs(expectedChartHigh - expectedChartLow) > 0.001) {
            console.log(`[Zone Debug] Using provided chart range: ${expectedChartLow}-${expectedChartHigh}`);

            // TradingView adds ~3% auto-scale margin above/below the visible price range
            const chartRangeRaw = expectedChartHigh - expectedChartLow;
            const autoScaleMargin = chartRangeRaw * 0.03;
            const adjustedHigh = expectedChartHigh + autoScaleMargin;
            const adjustedLow = expectedChartLow - autoScaleMargin;
            const chartRange = chartRangeRaw + (2 * autoScaleMargin);

            // TradingView UI padding: top toolbar (~70px) and bottom time axis (~45px)
            const topUIHeight = 70;
            const bottomUIHeight = 45;
            const plotHeight = Math.max(1, main.r.height - topUIHeight - bottomUIHeight);

            // Calculate Y positions using adjusted range to account for auto-scale margin
            const yFromPrice = (p) => topUIHeight + ((adjustedHigh - p) / chartRange) * plotHeight;
            let yTop = yFromPrice(Math.max(high, low));
            let yBottom = yFromPrice(Math.min(high, low));
            
            // Clamp and ensure minimum height
            yTop = Math.max(main.r.top, Math.min(yTop, main.r.bottom));
            yBottom = Math.max(main.r.top, Math.min(yBottom, main.r.bottom));
            let height = Math.max(18, Math.round(yBottom - yTop));
            
            const host = ensureHost();
            host.appendChild(
              makeOverlay(Math.round(main.r.left), Math.round(yTop), Math.round(main.r.width), height, zoneColor, low, high)
            );
            setTimeout(cleanupOldOverlays, 10000);
            return { 
              ok: true, 
              fallback: false,
              usedExpectedRange: true,
              debug: {
                expectedRange: `${expectedChartLow}-${expectedChartHigh}`,
                targetZone: `${low}-${high}`,
                calculatedY: `${yTop.toFixed(0)}-${yBottom.toFixed(0)}`,
                finalY: `${Math.round(yTop)}, height=${height}`
              }
            };
          }

          // Fallback if insufficient ticks
          if (ticks.length < 2) {
            const host = ensureHost();
            const r = main.r;
            const bandHeight = Math.max(20, Math.min(200, r.height * 0.25));
            const y = Math.round(r.top + (r.height * 0.375));
            host.appendChild(makeOverlay(r.left, y, r.width, bandHeight, zoneColor, low, high));
            setTimeout(cleanupOldOverlays, 10000);
            return { ok: true, fallback: true };
          }

          // 3) Linear interpolation using extreme ticks
          const t0 = ticks[0];
          const t1 = ticks[ticks.length - 1];
          console.log(`[Zone Debug] Found ${ticks.length} ticks. Range: ${t0.price} (y=${t0.y.toFixed(0)}) to ${t1.price} (y=${t1.y.toFixed(0)})`);
          console.log(`[Zone Debug] Target zone: ${low} - ${high}`);
          if (Math.abs(t1.price - t0.price) < 1e-9) return { ok: false, reason: 'degenerate_ticks' };
          const yFromPrice = (p) => t0.y + (p - t0.price) * (t1.y - t0.y) / (t1.price - t0.price);
          // FIXED: Higher price = smaller Y (top of screen), lower price = larger Y (bottom of screen)
          let yTop = yFromPrice(Math.max(high, low));      // Higher price -> top of zone
          let yBottom = yFromPrice(Math.min(high, low));   // Lower price -> bottom of zone
          console.log(`[Zone Debug] Calculated Y: top=${yTop.toFixed(0)}, bottom=${yBottom.toFixed(0)}`);

          // 4) Clamp to canvas bounds and enforce minimum band height so it doesn't look like a line
          yTop = Math.max(main.r.top, Math.min(yTop, main.r.bottom));
          yBottom = Math.max(main.r.top, Math.min(yBottom, main.r.bottom));
          // FIXED: height = yBottom - yTop (since yBottom > yTop in screen coordinates)
          let height = Math.max(2, Math.round(yBottom - yTop));
          const minH = 18; // ensure visible band
          if (height < minH) {
            const cy = (yTop + yBottom) / 2;
            let yT = cy - minH / 2;  // yTop is smaller (higher on screen)
            let yB = cy + minH / 2;  // yBottom is larger (lower on screen)
            // clamp
            if (yT < main.r.top) { yB += (main.r.top - yT); yT = main.r.top; }
            if (yB > main.r.bottom) { yT -= (yB - main.r.bottom); yB = main.r.bottom; }
            yTop = yT; yBottom = yB; height = Math.max(2, Math.round(yBottom - yTop));
          }

          // 5) Draw overlay - position at yTop (top of the zone), extend downward by height
          const host = ensureHost();
          host.appendChild(
            makeOverlay(Math.round(main.r.left), Math.round(yTop), Math.round(main.r.width), height, zoneColor, low, high)
          );
          setTimeout(cleanupOldOverlays, 10000);
          return { 
            ok: true, 
            fallback: false,
            debug: {
              tickCount: ticks.length,
              tickRange: `${t0.price}@y${t0.y.toFixed(0)} to ${t1.price}@y${t1.y.toFixed(0)}`,
              targetZone: `${low}-${high}`,
              calculatedY: `${yTop.toFixed(0)}-${yBottom.toFixed(0)}`,
              finalY: `${Math.round(yTop)}, height=${height}`
            }
          };

          // Helpers
          function ensureHost() {
            let host = document.getElementById('gc-overlay-host');
            if (!host) {
              host = document.createElement('div');
              host.id = 'gc-overlay-host';
              host.style.position = 'fixed';
              host.style.left = '0px';
              host.style.top = '0px';
              host.style.right = '0px';
              host.style.bottom = '0px';
              host.style.pointerEvents = 'none';
              host.style.zIndex = '2147483647';
              document.body.appendChild(host);
            }
            return host;
          }

          function makeOverlay(x, y, w, h, zoneColor, low, high) {
            const overlay = document.createElement('div');
            overlay.className = 'gc-zone-overlay';
            overlay.style.position = 'fixed';
            overlay.style.left = `${Math.round(x)}px`;
            overlay.style.top = `${Math.round(y)}px`;
            overlay.style.width = `${Math.round(w)}px`;
            overlay.style.height = `${Math.round(h)}px`;
            overlay.style.background = zoneColor;
            overlay.style.opacity = '0.18';
            overlay.style.border = 'none';
            overlay.style.boxSizing = 'border-box';
            overlay.style.pointerEvents = 'none';
            overlay.style.borderRadius = '6px';

            // explicit boundary lines
            const mkLine = (topPx) => {
              const line = document.createElement('div');
              line.style.position = 'absolute';
              line.style.left = '0px';
              line.style.right = '0px';
              line.style.height = '3px';
              line.style.background = zoneColor;
              line.style.top = `${topPx}px`;
              line.style.opacity = '1';
              line.style.borderRadius = '2px';
              return line;
            };
            overlay.appendChild(mkLine(0)); // top boundary
            overlay.appendChild(mkLine(Math.max(0, Math.round(h - 3)))); // bottom boundary

            const label = document.createElement('div');
            label.textContent = `Zone ${low} - ${high}`;
            label.style.position = 'absolute';
            label.style.left = '8px';
            label.style.top = '8px';
            label.style.font = '12px/1.2 Arial, sans-serif';
            label.style.color = '#ffffff';
            label.style.textShadow = '0 1px 2px rgba(0,0,0,0.7)';
            overlay.appendChild(label);
            return overlay;
          }

          function cleanupOldOverlays() {
            const host = document.getElementById('gc-overlay-host');
            if (!host) return;
            const maxOverlays = 3;
            const nodes = Array.from(host.querySelectorAll('.gc-zone-overlay'));
            if (nodes.length > maxOverlays) nodes.slice(0, nodes.length - maxOverlays).forEach(n => n.remove());
          }
        } catch (e) {
          return { ok: false, reason: e.message };
        }
      }, { high: priceHigh, low: priceLow, zoneColor: color, expectedChartHigh: chartPriceHigh, expectedChartLow: chartPriceLow });

      if (!result.ok) {
        logger.warn(`Zone overlay insertion failed: ${result.reason || 'unknown'}`);
        return false;
      }
      await this.page.waitForTimeout(300);
      logger.success('✓ Zone overlay added');
      if (result.debug) {
        logger.info(`  Debug: ${JSON.stringify(result.debug)}`);
      }
      return true;
    } catch (error) {
      logger.warn('Failed to draw GoCharting overlay', error);
      return false;
    }
  }

  /**
   * Clean chart view by removing UI elements
   */
  async cleanChartView() {
    try {
      logger.info('Cleaning chart view...');

      // Hide various UI elements
      await this.page.evaluate(() => {
        // Helper to hide elements by selector
        const hideAll = (sel) => {
          document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
        };

        // 1) Obvious chrome (generic + GoCharting hints)
        hideAll('header, [class*="toolbar"], [class*="popup"], [class*="modal"], [class*="advert"], [class*="menu"], [class*="sidebar"], [class*="banner"], .adsbygoogle, [id*="ad"], [class*="promo"]');

        // 2) LEFT toolbar only (keep right side intact)
        // Try specific selectors first
        hideAll('[data-name="left-toolbar"], [class*="leftToolbar"], [class*="left-toolbar"], [id*="leftTool"], [class*="left-tool"]');

        // 3) RIGHT toolbar / scales decorations
        hideAll('[data-name="right-toolbar"], [class*="rightToolbar"], [class*="right-toolbar"], [class*="scale-controls"], [class*="legend"]');

        // 4) Bottom bars: trade, one click, status
        hideAll('[class*="bottom"], [class*="status-bar"], [class*="oneClick"], [class*="trade"]');

        // 5) Iframes and fixed overlays (ads/promos)
        document.querySelectorAll('iframe').forEach(f => { try { f.style.display = 'none'; } catch(_){} });
        Array.from(document.querySelectorAll('body *')).forEach(el => {
          try {
            const style = getComputedStyle(el);
            if (style.position === 'fixed') {
              const r = el.getBoundingClientRect();
              // hide if not overlapping main canvas significantly
              if ((r.width * r.height) > 10000 && r.left > 10 && r.top > 10) {
                el.style.display = 'none';
              }
            }
          } catch(_){}
        });

        // Geometry-based fallback: any tall, narrow element near the far left
        const vh = window.innerHeight;
        const leftCandidates = Array.from(document.querySelectorAll('body *'))
          .filter(el => el.getBoundingClientRect)
          .map(el => el.getBoundingClientRect())
          .filter(r => r.left >= 0 && r.left < 140 && r.width >= 40 && r.width <= 140 && r.height > vh * 0.5);
        leftCandidates.forEach(r => {
          const el = document.elementFromPoint(r.left + 1, r.top + 10);
          if (el) el.style.display = 'none';
        });
      });

      logger.success('Chart view cleaned');
    } catch (error) {
      logger.warn('Failed to clean chart view (non-critical)', error);
    }
  }

  /**
   * Take screenshot
   * @param {string} pair - Trading pair
   * @param {string} timeframe - Timeframe
   * @returns {Promise<string>} Screenshot path
   */
  async takeScreenshot(pair, timeframe) {
    const timestamp = Date.now();
    const filename = `${pair}_${timeframe}_${timestamp}.png`;
    const screenshotPath = path.join(config.directories.output, 'raw', filename);

    // Ensure directory exists
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Support two modes: 'viewport' and 'clip' (default)
    // Defaulting to 'clip' ensures the captured image matches the chart plot
    // area used by ZoneDrawer's Y mapping (padTop/padBottom), preventing
    // vertical misalignment of zones.
    const mode = process.env.CAPTURE_MODE || 'clip';
    if (mode === 'clip') {
      const clip = await this.getChartClip();
      await this.page.screenshot({ path: screenshotPath, type: 'png', fullPage: false, clip: clip || undefined });
    } else {
      await this.page.screenshot({ path: screenshotPath, type: 'png', fullPage: false });
    }

    return screenshotPath;
  }

  /**
   * Determine a consistent clip rectangle of the main chart area
   * Picks the largest visible canvas inside the chart container
   * and applies a small padding while staying within viewport bounds
   */
  async getChartClip() {
    try {
      const clip = await this.page.evaluate(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const canvases = Array.from(document.querySelectorAll('canvas'))
          .map(c => c.getBoundingClientRect())
          .filter(r => r && r.width > 50 && r.height > 50);

        // Union of all canvases (chart plot areas)
        let union = null;
        canvases.forEach(r => {
          if (!union) union = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          else {
            union.left = Math.min(union.left, r.left);
            union.top = Math.min(union.top, r.top);
            union.right = Math.max(union.right, r.right);
            union.bottom = Math.max(union.bottom, r.bottom);
          }
        });
        if (!union) {
          const body = document.body.getBoundingClientRect();
          union = { left: 0, top: 0, right: body.width, bottom: body.height };
        }

        // Detect left toolbar candidate (thin tall element on the far left)
        const leftCandidates = Array.from(document.querySelectorAll('body *'))
          .filter(el => el.getBoundingClientRect)
          .map(el => el.getBoundingClientRect())
          .filter(r => r.left >= 0 && r.left < 120 && r.width >= 40 && r.width <= 120 && r.height > vh * 0.5);
        const leftToolbarRight = leftCandidates.reduce((mx, r) => Math.max(mx, r.right), 0);

        // Axes padding (keep price/time scales visible)
        const padTop = 8;
        const padRight = 36; // price axis
        const padBottom = 28; // time axis
        const padLeft = 0; // exclude left toolbar

        let x = Math.floor(Math.max(0, union.left, leftToolbarRight + 2) + padLeft);
        let y = Math.floor(Math.max(0, union.top) + padTop);
        let w = Math.floor(Math.min(vw, union.right + padRight) - x);
        let h = Math.floor(Math.min(vh, union.bottom + padBottom) - y);

        // Clamp minimal sensible size
        w = Math.max(400, Math.min(w, vw - x));
        h = Math.max(300, Math.min(h, vh - y));

        return { x, y, width: w, height: h };
      });

      // Sanity check values
      if (!clip || clip.width < 50 || clip.height < 50) return null;
      logger.info(`Using stable clip: x=${clip.x}, y=${clip.y}, w=${clip.width}, h=${clip.height}`);
      return clip;
    } catch (err) {
      logger.warn('Failed to compute chart clip; falling back to viewport screenshot');
      return null;
    }
  }

  /**
   * Validate screenshot
   * @param {string} screenshotPath - Path to screenshot
   * @returns {boolean} Is valid
   */
  validateScreenshot(screenshotPath) {
    try {
      const stats = fs.statSync(screenshotPath);
      
      // Check file size (should be > 10KB)
      if (stats.size < 10000) {
        logger.warn(`Screenshot too small: ${stats.size} bytes`);
        return false;
      }

      return true;
    } catch (error) {
      logger.failure('Screenshot validation failed', error);
      return false;
    }
  }

  /**
   * Capture multiple timeframes
   * @param {string} pair - Trading pair
   * @param {Array<string>} timeframes - Array of timeframes
   * @returns {Promise<Object>} Map of timeframe to screenshot path
   */
  async captureMultipleTimeframes(pair, timeframes) {
    const screenshots = {};

    for (const timeframe of timeframes) {
      try {
        screenshots[timeframe] = await this.captureChart(pair, timeframe);
      } catch (error) {
        logger.failure(`Failed to capture ${timeframe} timeframe`, error);
        screenshots[timeframe] = null;
      }
    }

    return screenshots;
  }

  /**
   * Close browser
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        logger.info('Browser closed');
      }
    } catch (error) {
      logger.failure('Failed to close browser', error);
    }
  }
}

export default ChartCapture;

// New method: capture with on-page overlay for GoCharting
// Placed after export for visibility; actual export remains default.
// We append the method to the prototype to avoid reordering large file sections.
ChartCapture.prototype.captureGoChartingWithOverlay = async function(pair, timeframe, priceHigh, priceLow, color, strategyName, chartPriceHigh = null, chartPriceLow = null) {
  try {
    logger.info(`Re-capturing ${pair} ${timeframe} with on-page overlay ${priceLow}-${priceHigh}...`);
    if (chartPriceHigh && chartPriceLow) {
      logger.info(`  Using provided chart range: ${chartPriceLow}-${chartPriceHigh}`);
    }

    // Initialize browser if needed
    if (!this.page) {
      await this.initialize();
    }

    // Navigate to GoCharting
    const url = this.buildGoChartingUrl(pair, timeframe);
    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: config.puppeteer.timeout
    });

    // Wait for chart to load and clean the view
    await this.waitForChartLoad();
    await this.cleanChartView();

    // Draw overlay directly on the page, passing chart price range if available
    await this.drawZoneOnChart(priceHigh, priceLow, color || '#0066FF', chartPriceHigh, chartPriceLow);

    // Wait a bit to ensure overlay is painted
    await this.page.waitForTimeout(500);

    // Take screenshot
    const timestamp = Date.now();
    const filename = `${pair}_${strategyName}_${timeframe}_overlay_${timestamp}.png`;
    const outputPath = path.join(config.directories.output, filename);

    if (!fs.existsSync(config.directories.output)) {
      fs.mkdirSync(config.directories.output, { recursive: true });
    }

    await this.page.screenshot({ path: outputPath, fullPage: false, type: 'png' });
    logger.success(`Overlay screenshot saved: ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.failure('Failed to capture GoCharting with overlay', error);
    return null;
  }
};
