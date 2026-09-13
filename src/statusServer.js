"use strict";

/**
 * Minimal HTTP status server. A Docker host such as Render scans for an open
 * port and treats a service that binds none as unhealthy ("No open ports
 * detected"). The bot itself only makes outbound connections, so this tiny
 * server exists purely to satisfy the platform's port check and to expose a
 * `/health` endpoint.
 *
 * Set PORT=0 to disable it entirely (pure worker mode).
 *
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

const http = require("http");
const log = require("./logger");

function createStatusServer(options) {
	const port = options && options.port != null ? Number(options.port) : Number(process.env.PORT || 8080);
	const host = (options && options.host) || "0.0.0.0";
	const info = (options && options.info) || (() => ({}));

	if (!port) {
		return { start() { }, stop() { }, enabled: false };
	}

	let server = null;

	function payload() {
		let extra = {};
		try { extra = info() || {}; } catch (_) { extra = {}; }
		return Object.assign({
			ok: true,
			service: "instabot",
			uptime: Math.round(process.uptime())
		}, extra);
	}

	function handler(req, res) {
		const body = JSON.stringify(payload());
		res.writeHead(200, {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Length": Buffer.byteLength(body)
		});
		res.end(body);
	}

	return {
		enabled: true,
		start() {
			if (server) return Promise.resolve(server);
			server = http.createServer(handler);
			return new Promise((resolve, reject) => {
				server.once("error", reject);
				server.listen(port, host, () => {
					log.info("HTTP", `status server listening on http://${host}:${port}`);
					resolve(server);
				});
			});
		},
		stop() {
			return new Promise(resolve => {
				if (!server) return resolve();
				server.close(() => resolve());
				server = null;
			});
		}
	};
}

module.exports = { createStatusServer };
