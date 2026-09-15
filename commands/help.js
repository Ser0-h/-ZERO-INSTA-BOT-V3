"use strict";

const TEXT_EFFECTS = ["love", "gift", "celebration", "fire"];

function cleanCategoryName(text) {
	if (!text) return "others";

	return String(text)
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase() || "others";
}

function randomTextEffect() {
	return TEXT_EFFECTS[
		Math.floor(Math.random() * TEXT_EFFECTS.length)
	];
}

function bold(text) {
	const map = {
		A: "𝗔", B: "𝗕", C: "𝗖", D: "𝗗", E: "𝗘", F: "𝗙",
		G: "𝗚", H: "𝗛", I: "𝗜", J: "𝗝", K: "𝗞", L: "𝗟",
		M: "𝗠", N: "𝗡", O: "𝗢", P: "𝗣", Q: "𝗤", R: "𝗥",
		S: "𝗦", T: "𝗧", U: "𝗨", V: "𝗩", W: "𝗪", X: "𝗫",
		Y: "𝗬", Z: "𝗭",

		a: "𝗮", b: "𝗯", c: "𝗰", d: "𝗱", e: "𝗲", f: "𝗳",
		g: "𝗴", h: "𝗵", i: "𝗶", j: "𝗷", k: "𝗸", l: "𝗹",
		m: "𝗺", n: "𝗻", o: "𝗼", p: "𝗽", q: "𝗾", r: "𝗿",
		s: "𝘀", t: "𝘁", u: "𝘂", v: "𝘃", w: "𝘄", x: "𝘅",
		y: "𝘆", z: "𝘇",

		0: "𝟬", 1: "𝟭", 2: "𝟮", 3: "𝟯", 4: "𝟰",
		5: "𝟱", 6: "𝟲", 7: "𝟳", 8: "𝟴", 9: "𝟵"
	};

	return String(text)
		.split("")
		.map(char => map[char] || char)
		.join("");
}

module.exports = {

	config: {

		name: "help",

		aliases: [
			"h",
			"menu",
			"commands"
		],

		author: "Idle×Saow",

		category: "info",

		cooldown: 3,

		role: 0,

		description: {
			en: "Show all available commands or details for one"
		},

		usage: {
			en: "{p}help [command]"
		}
	},


	onStart: async function ({
		message,
		args,
		config,
		registry
	}) {

		const prefix =
			config.prefix;

		const query =
			(args[0] || "").toLowerCase();


		// ====================================================
		// COMMAND DETAILS
		// ====================================================

		if (query) {

			const command =
				registry.resolve(query);

			if (!command) {

				return message.send(
					`𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!\n\n` +
					`» 𝗖𝗼𝗺𝗺𝗮𝗻𝗱 : ${bold(query)}\n` +
					`» 𝗦𝘁𝗮𝘁𝘂𝘀 : 𝗡𝗼𝘁 𝗙𝗼𝘂𝗻𝗱\n\n` +
					`» 𝗧𝘆𝗽𝗲 : ${prefix}help`
				);
			}


			const c =
				command.config;


			const description =
				(
					c.description &&
					(
						c.description[config.language] ||
						c.description.en
					)
				) ||
				"—";


			const usage =
				(
					c.usage &&
					(
						c.usage[config.language] ||
						c.usage.en
					)
				) ||
				`${prefix}${c.name}`;


			const finalUsage =
				usage.replace(
					/\{p\}/g,
					prefix
				);


			let version = "1.0.0";

			try {

				version =
					require("../package.json").version;

			} catch (_) {}


			const body = [

				`𝗜𝗱𝗹𝗲×𝗦𝗮𝗼𝘄!`,

				"",

				`» 𝗖𝗼𝗺𝗺𝗮𝗻𝗱 : ${bold(c.name)}`,

				`» 𝗖𝗮𝘁𝗲𝗴𝗼𝗿𝘆 : ${bold(
					c.category || "Uncategorized"
				)}`,

				`» 𝗗𝗲𝘀𝗰𝗿𝗶𝗽𝘁𝗶𝗼𝗻 : ${description}`,

				`» 𝗔𝗹𝗶𝗮𝘀𝗲𝘀 : ${
					c.aliases && c.aliases.length
						? c.aliases.join(", ")
						: "None"
				}`,

				`» 𝗨𝘀𝗮𝗴𝗲 : ${finalUsage}`,

				`» 𝗣𝗲𝗿𝗺𝗶𝘀𝘀𝗶𝗼𝗻 : ${c.role || 0}`,

				`» 𝗔𝘂𝘁𝗵𝗼𝗿 : ${
					c.author || "—"
				}`,

				`» 𝗩𝗲𝗿𝘀𝗶𝗼𝗻 : ${version}`,

				"",

				`» 𝗚𝗹𝗼𝗯𝗮𝗹 𝗣𝗿𝗲𝗳𝗶𝘅 : ${prefix}`,

				`» 𝗧𝘆𝗽𝗲 : ${bold(
					c.noPrefix ? "Non-Prefix" : "Prefix"
				)}`

			].join("\n");


			try {

				return await message.send({
					body,
					effect: randomTextEffect()
				});

			} catch (_) {

				return message.send(body);
			}
		}


		// ====================================================
		// ALL COMMANDS
		// ====================================================

		const byCategory = {};


		for (
			const command
			of registry.commands.values()
		) {

			if (
				command.config.hidden
			) continue;


			const category =
				cleanCategoryName(
					command.config.category
				);


			(
				byCategory[category] ||
				(byCategory[category] = [])
			).push(
				command.config.name
			);
		}


		const botName =
			config.botName ||
			"Idle×Saow";


		const lines = [

			`${bold(botName)}`,

			"",

			`» 𝗚𝗹𝗼𝗯𝗮𝗹 𝗣𝗿𝗲𝗳𝗶𝘅 : ${prefix}`,

			`» 𝗧𝗼𝘁𝗮𝗹 𝗖𝗮𝘁𝗲𝗴𝗼𝗿𝗶𝗲𝘀 : ${
				Object.keys(byCategory).length
			}`,

			""
		];


		for (
			const category
			of Object.keys(byCategory).sort()
		) {

			const names =
				byCategory[category].sort();


			lines.push(
				`» 𝗖𝗮𝘁𝗲𝗴𝗼𝗿𝘆 : ${bold(
					category.toUpperCase()
				)}`
			);


			lines.push(
				names
					.map(
						name =>
							`» ${prefix}${name}`
					)
					.join("\n")
			);


			lines.push("");
		}


		lines.push(
			`» 𝗨𝘀𝗲 : ${prefix}help [command]`
		);


		const body =
			lines.join("\n");


		try {

			return await message.send({
				body,
				effect: randomTextEffect()
			});

		} catch (_) {

			return message.send(body);
		}
	}
};
