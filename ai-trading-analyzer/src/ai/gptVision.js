import OpenAI from 'openai';
import config from '../utils/config.js';
import logger from '../utils/logger.js';
import { retryWithBackoff } from '../utils/retry.js';
import fs from 'fs';

class GPTVision {
  constructor() {
    this.client = null;
    this.initialize();
  }

  /**
   * Initialize OpenAI client
   */
  initialize() {
    if (!config.openai.apiKey || config.openai.apiKey === 'your_openai_api_key_here') {
      logger.warn('OpenAI API key not configured. GPT Vision will not be available.');
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey
      });
      logger.success('GPT Vision initialized');
    } catch (error) {
      logger.failure('Failed to initialize GPT Vision', error);
    }
  }

  /**
   * Analyze chart screenshot with GPT Vision
   * @param {string} imagePath - Path to chart screenshot
   * @param {string} prompt - Analysis prompt
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeChart(imagePath, prompt) {
    if (!this.client) {
      throw new Error('GPT Vision not initialized. Check OPENAI_API_KEY in .env');
    }

    return retryWithBackoff(
      async () => {
        try {
          logger.info(`Analyzing chart: ${imagePath}`);

          // Read image and convert to base64
          const imageBuffer = fs.readFileSync(imagePath);
          const base64Image = imageBuffer.toString('base64');
          const imageUrl = `data:image/png;base64,${base64Image}`;

          // Call GPT Vision API
          // GPT-5 models have different parameter requirements:
          // - Use max_completion_tokens instead of max_tokens
          // - Only support temperature = 1 (default)
          const isGPT5 = config.openai.model.includes('gpt-5');
          const tokenParam = isGPT5 ? 'max_completion_tokens' : 'max_tokens';

          const requestParams = {
            model: config.openai.model,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: prompt
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl,
                      detail: 'high'
                    }
                  }
                ]
              }
            ],
            [tokenParam]: config.openai.maxTokens
          };

          // GPT-4 models support temperature, GPT-5 does not
          if (!isGPT5) {
            requestParams.temperature = 0.1; // Low temperature for consistent analysis
          }

          const response = await this.client.chat.completions.create(requestParams);

          const content = response.choices[0].message.content;
          logger.success('Chart analysis completed');

          // Parse JSON response
          return this.parseResponse(content);

        } catch (error) {
          logger.failure('Chart analysis failed', error);
          throw error;
        }
      },
      {
        retries: config.retry.maxRetries,
        operationName: 'analyzeChart'
      }
    );
  }

  /**
   * Parse GPT response and extract JSON
   * @param {string} content - GPT response content
   * @returns {Object} Parsed JSON
   */
  parseResponse(content) {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      logger.success('Response parsed successfully');
      
      return parsed;

    } catch (error) {
      logger.failure('Failed to parse GPT response', error);
      logger.info('Raw response:', content);
      throw new Error('Invalid JSON response from GPT');
    }
  }

  /**
   * Analyze with fallback to local analysis
   * @param {string} imagePath - Path to chart screenshot
   * @param {string} prompt - Analysis prompt
   * @param {Function} fallbackFn - Fallback function
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeWithFallback(imagePath, prompt, fallbackFn = null) {
    try {
      return await this.analyzeChart(imagePath, prompt);
    } catch (error) {
      logger.warn('GPT Vision failed, attempting fallback...');
      
      if (fallbackFn && config.analysis.enableLocalFallback) {
        try {
          const result = await fallbackFn(imagePath);
          logger.success('Fallback analysis completed');
          return result;
        } catch (fallbackError) {
          logger.failure('Fallback analysis also failed', fallbackError);
          throw fallbackError;
        }
      }
      
      throw error;
    }
  }

  /**
   * Batch analyze multiple charts
   * @param {Array<Object>} charts - Array of {imagePath, prompt}
   * @returns {Promise<Array<Object>>} Analysis results
   */
  async batchAnalyze(charts) {
    const results = [];

    for (const chart of charts) {
      try {
        const result = await this.analyzeChart(chart.imagePath, chart.prompt);
        results.push({
          success: true,
          data: result,
          imagePath: chart.imagePath
        });
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          imagePath: chart.imagePath
        });
      }
    }

    return results;
  }

  /**
   * Check if GPT Vision is available
   * @returns {boolean} Is available
   */
  isAvailable() {
    return this.client !== null;
  }
}

export default GPTVision;
