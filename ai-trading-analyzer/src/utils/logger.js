import winston from 'winston';
import config from './config.js';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
if (!fs.existsSync(config.directories.logs)) {
  fs.mkdirSync(config.directories.logs, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    return stack ? `${msg}\n${stack}` : msg;
  })
);

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    )
  })
];

// Add file transport if enabled
if (config.logging.toFile) {
  transports.push(
    new winston.transports.File({
      filename: path.join(config.directories.logs, 'error.log'),
      level: 'error',
      format: logFormat
    }),
    new winston.transports.File({
      filename: path.join(config.directories.logs, 'combined.log'),
      format: logFormat
    })
  );
}

const logger = winston.createLogger({
  level: config.logging.level,
  transports
});

// Add custom methods for structured logging
logger.analysis = (pair, strategy, message, data = {}) => {
  logger.info(`[${pair}] [${strategy.toUpperCase()}] ${message}`, data);
};

logger.retry = (operation, attempt, maxAttempts, reason) => {
  logger.warn(`Retry ${attempt}/${maxAttempts} for ${operation}: ${reason}`);
};

logger.success = (message, data = {}) => {
  logger.info(`✓ ${message}`, data);
};

logger.failure = (message, error) => {
  logger.error(`✗ ${message}`, { error: error.message, stack: error.stack });
};

export default logger;
