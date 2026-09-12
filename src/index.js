'use strict';

const { loadConfig } = require('./config');
const { InstagramBot } = require('./bot');

async function main() {
  const bot = new InstagramBot(loadConfig());
  let shutdownPromise;
  const shutdown = async (signal) => {
    if (shutdownPromise) return shutdownPromise;
    console.log(`${signal} received.`);
    shutdownPromise = bot.stop().finally(() => process.exit(0));
    return shutdownPromise;
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    if (!shutdownPromise) {
      shutdownPromise = bot.stop().finally(() => process.exit(1));
    }
  });

  await bot.start();
  return bot;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bot could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
