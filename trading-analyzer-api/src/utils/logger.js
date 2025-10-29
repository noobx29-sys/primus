/**
 * Simple Logger Utility
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class Logger {
  log(message, ...args) {
    console.log(`${colors.cyan}[INFO]${colors.reset}`, message, ...args);
  }

  info(message, ...args) {
    console.log(`${colors.blue}[INFO]${colors.reset}`, message, ...args);
  }

  success(message, ...args) {
    console.log(`${colors.green}[SUCCESS]${colors.reset}`, message, ...args);
  }

  warn(message, ...args) {
    console.log(`${colors.yellow}[WARN]${colors.reset}`, message, ...args);
  }

  error(message, ...args) {
    console.error(`${colors.red}[ERROR]${colors.reset}`, message, ...args);
  }

  failure(message, error) {
    console.error(`${colors.red}[FAILURE]${colors.reset}`, message);
    if (error) {
      console.error(error);
    }
  }

  debug(message, ...args) {
    if (process.env.DEBUG) {
      console.log(`${colors.dim}[DEBUG]${colors.reset}`, message, ...args);
    }
  }
}

export default new Logger();
