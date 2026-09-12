'use strict';

const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function createLogger(scope = 'BOT', level = 'info') {
  const threshold = levels[level] || levels.info;
  const write = (name, method, args) => {
    if (levels[name] < threshold) return;
    const stamp = new Date().toISOString();
    method(`[${stamp}] [${scope}] [${name.toUpperCase()}]`, ...args);
  };

  return {
    debug: (...args) => write('debug', console.log, args),
    info: (...args) => write('info', console.log, args),
    warn: (...args) => write('warn', console.warn, args),
    error: (...args) => write('error', console.error, args)
  };
}

module.exports = { createLogger };
