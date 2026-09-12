'use strict';

const { replyWithEffect } = require('../../func/reply');

module.exports = {
  config: {
    name: 'help',
    aliases: ['menu', 'commands'],
    version: '4.8',
    author: 'Neoaz 🐊',
    category: 'system',
    description: 'Show all available commands.',
    longDescription: 'Displays a clean and premium-styled categorized list of commands.',
    usage: '{pn}help [command name]'
  },

  async onStart({ api, args, config, message, commandEntries, prefix, threadID }) {
    const reply = (content) => replyWithEffect({ api, message, threadID }, content);
    const allCommands = commandEntries();

    if (args[0]) {
      const wanted = String(args[0]).toLowerCase();
      const command = allCommands.find((item) => item.name === wanted || item.aliases.includes(wanted));
      if (!command) return reply(`❌ Command "${wanted}" not found.`);

      const description = typeof command.longDescription === 'string'
        ? command.longDescription
        : command.longDescription?.en || command.shortDescription?.en || command.shortDescription || command.description || 'No description';
      const guide = typeof command.guide === 'string'
        ? command.guide
        : command.guide?.en || command.usage || `${prefix}${command.name}`;
      const usage = guide.replaceAll('{pn}', `${prefix}${command.name}`);
      const role = command.role !== undefined ? command.role : 0;

      return reply([
        'Command information',
        '',
        `Name: ${command.name}`,
        `Category: ${command.category || 'Uncategorized'}`,
        `Description: ${description}`,
        `Aliases: ${command.aliases?.length ? command.aliases.join(', ') : 'None'}`,
        `Usage: ${usage}`,
        `Permission: ${formatPermission(role)}`,
        `Author: ${command.author || 'Unknown'}`,
        `Version: ${command.version || '1.0'}`
      ].join('\n'));
    }

    const grouped = new Map();
    for (const command of allCommands) {
      const category = cleanCategoryName(command.category);
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(command.name);
    }

    let output = 'Available commands\n';
    for (const category of [...grouped.keys()].sort()) {
      output += `\n${category}\n`;
      output += `${grouped.get(category).sort().map((name) => `- ${name}`).join('\n')}\n`;
    }
    output += `\nUse ${prefix}help <command> for details.`;
    return reply(output);
  }
};

function cleanCategoryName(text) {
  if (!text) return 'others';
  return String(text)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatPermission(role) {
  const value = role && typeof role === 'object' ? role.onStart ?? role.onChat ?? 0 : role;
  return {
    0: 'Everyone',
    1: 'Group admins',
    2: 'Bot admins',
    3: 'Owner'
  }[Number(value)] || 'Everyone';
}
