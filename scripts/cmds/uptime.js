'use strict';

const os = require('os');
const { formatDuration } = require('../../func/utils');

module.exports = {
  config: {
    name: 'uptime',
    aliases: ['runtime', 'up'],
    version: '1.10',
    author: 'Neoaz 🐊',
    cooldown: 5,
    category: 'system',
    description: 'Check system uptime and status.',
    longDescription: 'Displays the system uptime, RAM usage, CPU load, and other server details.',
    usage: '{pn}'
  },

  async onStart({ event, message, functions }) {
    try {
      await message.react?.('📡');
      const report = buildReport(event, functions);
      const result = await message.reply(report);
      await message.react?.('✅');
      return result;
    } catch (error) {
      await message.react?.('❌');
      return message.reply(`Uptime check failed: ${error.message}`);
    }
  }
};

function buildReport(event = {}, functions = {}) {
  const uptime = process.uptime() * 1000;
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const cpus = os.cpus();
  const cpu = cpus.length ? getCpuLoad(cpus) : 0;
  const timestamp = Number(event.timestamp);
  const ping = Number.isFinite(timestamp) && timestamp > 0
    ? Math.max(0, Date.now() - timestamp)
    : 0;
  const health = functions.getHealth?.() || {};
  const connected = health.mqtt?.connected ?? health.connected ?? health.listening;

  return [
    'System uptime',
    '',
    `Uptime: ${formatDuration(uptime)}`,
    `Ping: ${ping} ms`,
    `RAM usage: ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}`,
    `CPU load: ${cpu.toFixed(2)}%`,
    `Platform: ${os.platform()} (${os.arch()})`,
    `Node.js: ${process.version}`,
    `Hostname: ${os.hostname()}`,
    `Status: ${connected === undefined ? 'unknown' : connected ? 'online' : 'offline'}`
  ].join('\n');
}

function getCpuLoad(cpus) {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return total > 0 ? (1 - idle / total) * 100 : 0;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

module.exports = { ...module.exports, buildReport, formatBytes, getCpuLoad };
