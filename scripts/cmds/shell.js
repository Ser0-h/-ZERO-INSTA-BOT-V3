'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 3500;

function limitOutput(value) {
  const text = String(value || '').trim();
  if (!text) return '(no output)';
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n...[truncated]` : text;
}

module.exports = {
  config: {
    name: 'shell',
    aliases: ['sh'],
    author: 'Neoaz 🐊',
    category: 'owner',
    role: 3,
    description: 'Run a shell command on the bot host.',
    usage: '{pn} <command>',
    allowWhenMuted: true
  },

  async onStart({ args, message, role }) {
    if (Number(role) < 3) return;
    const command = args.join(' ').trim();
    if (!command) return message.reply('Usage: !shell <command>');

    try {
      const { stdout, stderr } = await execFileAsync(
        process.env.SHELL || '/bin/sh',
        ['-lc', command],
        {
          cwd: process.cwd(),
          env: process.env,
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
          windowsHide: true
        }
      );
      return message.reply(limitOutput([stdout, stderr].filter(Boolean).join('\n')));
    } catch (error) {
      const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
      return message.reply(limitOutput(output));
    }
  }
};
