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

module.exports = { createGlobalUtils, ensureGlobalUtils };
