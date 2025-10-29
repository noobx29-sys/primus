import OpenAI from 'openai';
import config from '../utils/config.js';
import logger from '../utils/logger.js';

/**
 * GPT Analysis Client
 * Uses OpenAI API to analyze formatted market data
 */
class GPTAnalyzer {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.model = config.openai.model;
    this.maxTokens = config.openai.maxTokens;
    this.temperature = config.openai.temperature;
  }

  /**
   * Analyze market data with GPT
   * @param {string} prompt - Analysis prompt
   * @param {Object} formattedData - Structured market data
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(prompt, formattedData) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          logger.info(`Retry attempt ${attempt}/${maxRetries}...`);
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        } else {
          logger.info('Sending data to GPT for analysis...');
        }

        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(prompt, formattedData);

        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_completion_tokens: this.maxTokens,
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        
        // Log raw response for debugging
        logger.debug('Raw GPT response length:', content?.length || 0);
        
        if (!content || content.trim().length === 0) {
          throw new Error('Empty response from GPT');
        }

        // Try to parse JSON with better error handling
        let analysis;
        try {
          analysis = JSON.parse(content);
        } catch (parseError) {
          logger.error('Failed to parse GPT response as JSON');
          logger.debug('Response content (first 500 chars):', content.substring(0, 500));
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        }

        // Validate that we have the expected structure
        if (!analysis || typeof analysis !== 'object') {
          throw new Error('GPT response is not a valid object');
        }

        logger.success('✓ GPT analysis completed');
        logger.debug('Analysis result:', analysis);

        return analysis;

      } catch (error) {
        lastError = error;
        logger.error(`GPT analysis failed (attempt ${attempt}/${maxRetries}):`, error.message);
        
        // If it's an OpenAI API error, provide more context
        if (error.response) {
          logger.error('OpenAI API error status:', error.response.status);
          logger.error('OpenAI API error details:', error.response.data);
        }
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw lastError;
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Build system prompt
   */
  buildSystemPrompt() {
    return `You are an expert forex trader and technical analyst. You analyze market data following strict Standard Operating Procedures (SOP) for swing trading and scalping strategies.

Your analysis must:
1. Follow the specific SOP steps provided
2. Identify trends, patterns, and key levels accurately
3. Provide actionable trading signals (buy/sell/wait)
4. Return responses in valid JSON format
5. Be precise with price levels and confidence scores

Always prioritize:
- Trend alignment (don't fight the trend)
- Pattern quality and confirmation
- Risk management and proper zone placement
- Clear reasoning for every decision`;
  }

  /**
   * Build user prompt with formatted data
   */
  buildUserPrompt(prompt, formattedData) {
    return `${prompt}

MARKET DATA:

=== SUMMARY ===
Pair: ${formattedData.summary.pair}
Timeframe: ${formattedData.summary.timeframe}
Current Price: ${formattedData.summary.currentPrice}
Period High: ${formattedData.summary.periodHigh}
Period Low: ${formattedData.summary.periodLow}
Price Change: ${formattedData.summary.priceChange}
Total Bars: ${formattedData.summary.totalBars}

=== TREND ANALYSIS ===
${formattedData.trendAnalysis.description}
Trend: ${formattedData.trendAnalysis.trend}

=== KEY LEVELS ===
Resistance Levels:
${this.formatLevels(formattedData.keyLevels.resistance)}

Support Levels:
${this.formatLevels(formattedData.keyLevels.support)}

=== DETECTED PATTERNS ===
${this.formatPatterns(formattedData.candlestickPatterns)}

=== RECENT PRICE ACTION ===
${formattedData.priceAction.description}

=== RECENT CANDLES (Last 30) ===
${this.formatCandles(formattedData.recentCandles)}

Analyze the above data following the SOP and return your analysis in JSON format.`;
  }

  /**
   * Format levels for prompt
   */
  formatLevels(levels) {
    if (!levels || levels.length === 0) return 'None identified';
    return levels.map((l, i) => 
      `${i + 1}. ${l.price} (${l.touches} touches, last: ${l.lastTouch})`
    ).join('\n');
  }

  /**
   * Format patterns for prompt
   */
  formatPatterns(patterns) {
    if (!patterns || patterns.length === 0) return 'No significant patterns detected';
    return patterns.slice(-10).map((p, i) => 
      `${i + 1}. ${p.type.replace('_', ' ').toUpperCase()} at ${p.datetime} - ${p.description}`
    ).join('\n');
  }

  /**
   * Format candles for prompt
   */
  formatCandles(candles) {
    return candles.map(c => 
      `#${c.index}: ${c.type} | O:${c.open} H:${c.high} L:${c.low} C:${c.close} | Body:${c.bodySize} UW:${c.upperWick} LW:${c.lowerWick}`
    ).join('\n');
  }

  /**
   * Validate API key
   */
  async validateApiKey() {
    try {
      if (!config.openai.apiKey || config.openai.apiKey === 'your_openai_api_key_here') {
        throw new Error('OpenAI API key not configured');
      }

      await this.openai.models.list();
      logger.success('✓ OpenAI API key is valid');
      return true;

    } catch (error) {
      logger.error('Invalid OpenAI API key:', error.message);
      return false;
    }
  }
}

export default GPTAnalyzer;
