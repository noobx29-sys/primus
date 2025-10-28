import pRetry from 'p-retry';
import config from './config.js';
import logger from './logger.js';

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise} Result of the function
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    retries = config.retry.maxRetries,
    minTimeout = config.retry.delay,
    factor = 2,
    onFailedAttempt = null,
    operationName = 'operation'
  } = options;

  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (error) {
        logger.retry(operationName, error.attemptNumber || 1, retries, error.message);
        throw error;
      }
    },
    {
      retries,
      minTimeout,
      factor,
      onFailedAttempt: (error) => {
        if (onFailedAttempt) {
          onFailedAttempt(error);
        }
        logger.retry(operationName, error.attemptNumber, retries + 1, error.message);
      }
    }
  );
}

/**
 * Retry with custom validation
 * @param {Function} fn - Async function to retry
 * @param {Function} validator - Function to validate result
 * @param {Object} options - Retry options
 * @returns {Promise} Validated result
 */
export async function retryWithValidation(fn, validator, options = {}) {
  return retryWithBackoff(async () => {
    const result = await fn();
    
    if (!validator(result)) {
      throw new Error('Validation failed');
    }
    
    return result;
  }, options);
}

/**
 * Retry with timeout
 * @param {Function} fn - Async function to retry
 * @param {number} timeout - Timeout in milliseconds
 * @param {Object} options - Retry options
 * @returns {Promise} Result of the function
 */
export async function retryWithTimeout(fn, timeout, options = {}) {
  return retryWithBackoff(async () => {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Operation timeout')), timeout)
      )
    ]);
  }, options);
}

export default {
  retryWithBackoff,
  retryWithValidation,
  retryWithTimeout
};
