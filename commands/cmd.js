"use strict";

/**
 * cmd — manage commands and events at runtime (GoatBot-style).
 *
 * Commands are plain .js files in commands/ (loaded on boot). Events live in
 * events/. Use this command to load/reload a file after editing without a
 * restart. A legacy custom/commands and custom/events location still works.
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");
const { loadDirectory, validate } = require("../src/commandLoader");

const ROOT = path.resolve(__dirname, "..");

const TEMPLATE = `module.exports = {
	config: {
		name: "mycommand",
		aliases: [],
		author: "your name",
		category: "custom",
		cooldown: 3,
		role: 0,
		description: { en: "Describe what this command does" },
		usage: { en: "{p}mycommand <args>" }
	},

	onStart: async function ({ message, args, event, config, api, usersData, threadsData }) {
		return message.reply("Hello from my custom command!");
	}
};
`;

const EVENT_TEMPLATE = `module.exports = {
	config: {
		name: "myevent",
		eventType: "message",
		author: "your name",
		category: "custom",
		description: { en: "Describe what this event does" }
	},

	onEvent: async function ({ api, event, message, config }) {
		// Runs for every matching event.
	}
};
`;

function listItems() {
	const rows = [];
	for (const dir of ["commands", "custom/commands"]) {
		for (const entry of loadDirectory(dir, "command")) rows.push({ type: "command", ...entry });
	}
	return rows;
}

function resolveFile(sub, name) {
	const clean = String(name || "").trim();
	if (!clean || /[^\w.-]/.test(clean)) return null;
	const filename = clean.endsWith(".js") ? clean : clean + ".js";
	// Commands/events live in the main folders. custom/* is checked first as a
	// legacy location, then the main folder is used for new files.
	const isEvent = sub.includes("event");
	const dirs = isEvent ? ["custom/events", "events"] : ["custom/commands", "commands"];
	for (const dir of dirs) {
		const base = path.join(ROOT, dir);
		const candidate = path.join(base, filename);
		if (candidate.startsWith(base) && fs.existsSync(candidate)) return candidate;
	}
	const base = path.join(ROOT, isEvent ? "events" : "commands");
	return path.join(base, filename);
}

module.exports = {
	config: {
		name: "cmd",
		aliases: ["command"],
		author: "Neoaz 🐊",
		category: "admin",
		cooldown: 2,
		role: 2,
		noPrefix: true,
		description: { en: "Load, unload, reload or list commands and events from commands/ and events/" },
		usage: { en: "{p}cmd <load|unload|reload|list|template> [name]" }
	},

	onStart: async function ({ message, args, config, registry }) {
		const action = (args.shift() || "list").toLowerCase();
		const name = args[0];

		if (action === "list") {
			const commands = [...registry.commands.keys()].sort();
			const events = registry.events.map(script => script.config.name);
			return message.reply(
				`Loaded commands (${commands.length}):\n${commands.join(", ")}\n\n` +
				`Loaded events (${events.length}):\n${events.join(", ") || "—"}`
			);
		}

		if (action === "template") {
			const which = (name || "command").toLowerCase();
			return message.reply(which === "event" ? EVENT_TEMPLATE : TEMPLATE);
		}

		if (!name) return message.reply(`Usage: cmd ${action} <name>`);

		const isEvent = action.includes("event") || args.includes("--event");
		const sub = isEvent ? "events" : "commands";
		const file = resolveFile(sub, name);
		if (!file) return message.reply("Invalid name.");

		if (action === "unload" || action === "remove" || action === "delete") {
			const removed = isEvent ? registry.unregisterEvent(name) : registry.unregisterCommand(name);
			if (!removed) return message.reply(`No loaded ${isEvent ? "event" : "command"} named "${name}".`);
			return message.reply(`Unloaded ${isEvent ? "event" : "command"} "${name}".`);
		}

		if (action === "load" || action === "reload") {
			if (!fs.existsSync(file)) {
				return message.reply(
					`File not found: ${path.relative(ROOT, file)}\n` +
					`Write it there, or use "${config.prefix}cmd template" to get a starter.`
				);
			}
			try {
				delete require.cache[require.resolve(file)];
				const script = require(file);
				validate(script, path.basename(file), isEvent ? "event" : "command");

				if (isEvent) {
					registry.unregisterEvent(script.config.name);
					registry.events.push(script);
				}
				else {
					registry.unregisterCommand(script.config.name);
					const error = registry.registerCommand({ file: path.basename(file), script, commandName: script.config.name });
					if (error) return message.reply(error);
				}
				return message.reply(`${action === "reload" ? "Reloaded" : "Loaded"} ${isEvent ? "event" : "command"} "${script.config.name}".`);
			}
			catch (error) {
				return message.reply(`Failed to load "${name}": ${String(error.message || error)}`);
			}
		}

		return message.reply(`Unknown action "${action}". Use load, unload, reload, list or template.`);
	}
};
