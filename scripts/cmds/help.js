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
        '☠️ 𝗖𝗢𝗠𝗠𝗔𝗡𝗗 𝗜𝗡𝗙𝗢 ☠️',
        '',
        `➥ Name: ${command.name}`,
        `➥ Category: ${command.category || 'Uncategorized'}`,
        `➥ Description: ${description}`,
        `➥ Aliases: ${command.aliases?.length ? command.aliases.join(', ') : 'None'}`,
        `➥ Usage: ${usage}`,
        `➥ Permission: ${role}`,
        `➥ Author: ${command.author || 'Unknown'}`,
        `➥ Version: ${command.version || '1.0'}`
      ].join('\n'));
    }

    const grouped = new Map();
    for (const command of allCommands) {
      const category = cleanCategoryName(command.category);
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(command.name);
    }

    let output = '━━━☠️ 𝗡𝗲𝗼𝗞𝗘𝗫 𝗔𝗜 ☠️━━━\n';
    for (const category of [...grouped.keys()].sort()) {
      output += `\n╭──『 ${category.toUpperCase()} 』\n`;
      output += `${grouped.get(category).sort().map((name) => `× ${name}`).join(' ')}\n`;
      output += '╰────────────◊\n';
    }
    output += `\n➥ Use: ${prefix}help [command name] for details\n➥Use: ${prefix}callad to talk with bot admins '_'`;
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
