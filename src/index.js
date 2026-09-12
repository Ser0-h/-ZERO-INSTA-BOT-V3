'use strict';

const { loadConfig } = require('./config');
const { InstagramBot } = require('./bot');
const { startHealthServer } = require('./health-server');

async function main() {
  const bot = new InstagramBot(loadConfig());
  const healthServer = await startHealthServer({ bot });
  let shutdownPromise;
  const shutdown = async (signal) => {
    if (shutdownPromise) return shutdownPromise;
    console.log(`${signal} received.`);
    shutdownPromise = (async () => {
      await bot.stop();
      await healthServer.close();
      process.exit(0);
    })();
    return shutdownPromise;
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (error) => console.error('Unhandled rejection:', error));
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        await bot.stop();
        await healthServer.close();
        process.exit(1);
      })();
    }
  });

  try {
    await bot.start();
    return bot;
  } catch (error) {
    await healthServer.close();
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bot could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
