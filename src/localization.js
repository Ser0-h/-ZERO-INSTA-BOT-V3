'use strict';

const fs = require('fs');
const path = require('path');

function loadLanguage(directory = path.resolve(__dirname, '../scripts/langs'), language = 'en', logger) {
  const fallback = readLanguage(path.join(directory, 'en.js'), logger);
  const selected = language === 'en'
    ? fallback
    : mergeObjects(fallback, readLanguage(path.join(directory, `${language}.js`), logger));

  return (key, fallbackText = key, values = {}) => {
    const template = getValue(selected, key) || getValue(fallback, key) || fallbackText;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => (
      values[name] === undefined ? `{${name}}` : String(values[name])
    ));
  };
}

function readLanguage(filePath, logger) {
  try {
    if (!fs.existsSync(filePath)) return {};
    const value = require(filePath);
    return value && typeof value === 'object' ? value : {};
  } catch (error) {
    logger?.warn(`Could not load language file ${filePath}:`, error.message);
    return {};
  }
}

function getValue(source, key) {
  return String(key).split('.').reduce((value, part) => value?.[part], source);
}

function mergeObjects(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeObjects(merged[key] || {}, value)
      : value;
  }
  return merged;
}

module.exports = { loadLanguage };
