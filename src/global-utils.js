'use strict';

const coreUtils = require('../func/utils');
const replyUtils = require('../func/reply');
const progressUtils = require('../func/progress');
const mediaUtils = require('../func/media');
const messageUtils = require('../scripts/utils/reply');
const threadUserUtils = require('../scripts/utils/thread-users');

function createGlobalUtils(dynamic = {}) {
  return {
    ...coreUtils,
    ...replyUtils,
    ...progressUtils,
    ...mediaUtils,
    ...messageUtils,
    ...threadUserUtils,
    ...dynamic
  };
}

function ensureGlobalUtils() {
  if (!global.utils) global.utils = createGlobalUtils();
  return global.utils;
}

// Command modules destructure `global.utils` at require time. Installing it as a
// side effect of loading this module means a command file can always bootstrap
// the utilities by requiring it first, regardless of load order. This mirrors
// how Goatbot guarantees `global.utils` before any command is loaded.
ensureGlobalUtils();

module.exports = { createGlobalUtils, ensureGlobalUtils };
