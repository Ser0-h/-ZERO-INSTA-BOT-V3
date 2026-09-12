'use strict';

const { main } = require('./src/index');

if (require.main === module) {
  main().catch((error) => {
    console.error(`Bot could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
