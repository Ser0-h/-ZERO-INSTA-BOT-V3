"use strict";

/**
 * Simple JSON-backed storage for users and threads.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const fs = require("fs");
const path = require("path");

class Store {
	constructor(file, defaults) {
		this.file = file;
		this.defaults = defaults;
		this.data = {};
		this._writeTimer = null;
		this._load();
	}

	_load() {
		try {
			if (fs.existsSync(this.file))
				this.data = JSON.parse(fs.readFileSync(this.file, "utf8")) || {};
		}
		catch (error) {
			this.data = {};
		}
	}

	_schedule() {
		if (this._writeTimer) return;
		this._writeTimer = setTimeout(() => {
			this._writeTimer = null;
			this.flush();
		}, 250);
	}

	flush() {
		try {
			fs.mkdirSync(path.dirname(this.file), { recursive: true });
			fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
		}
		catch (error) {
			/* best effort */
		}
	}

	get(id) {
		return this.data[id] || null;
	}

	set(id, patch) {
		const current = this.data[id] || JSON.parse(JSON.stringify(this.defaults));
		const next = Object.assign({}, current, patch);
		this.data[id] = next;
		this._schedule();
		return next;
	}

	ensure(id, patch = {}) {
		if (!this.data[id]) {
			this.data[id] = Object.assign(JSON.parse(JSON.stringify(this.defaults)), patch);
			this._schedule();
		}
		return this.data[id];
	}

	update(id, patch) {
		const current = this.data[id];
		if (!current) return null;
		Object.assign(current, patch);
		this._schedule();
		return current;
	}

	all() {
		return Object.values(this.data);
	}

	count() {
		return Object.keys(this.data).length;
	}
}

function createDatabase(config) {
	const dir = path.join(path.resolve(__dirname, ".."), config.database.dir);
	fs.mkdirSync(dir, { recursive: true });

	const users = new Store(path.join(dir, "users.json"), {
		userID: null,
		name: null,
		username: null,
		firstSeen: Date.now(),
		banned: { status: false, reason: null, date: null },
		settings: {},
		data: {}
	});

	const threads = new Store(path.join(dir, "threads.json"), {
		threadID: null,
		name: null,
		isGroup: false,
		members: [],
		adminIDs: [],
		settings: {},
		data: {}
	});

	return {
		dir,
		users,
		threads,
		flush() {
			users.flush();
			threads.flush();
		}
	};
}

module.exports = { Store, createDatabase };
