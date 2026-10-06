// Aegis open-source build: only the first 78 of 290 lines of this module are published.
// The rest is part of the hosted Aegis engine. The stub exports at the bottom keep every import working.
/**
 * Dependency CVE Scanner
 * Scans npm dependencies for known vulnerabilities (CVE/GitHub Advisory)
 * Focuses on Discord.js ecosystem packages
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Discord.js ecosystem packages to prioritize
const PRIORITY_PACKAGES = [
  'discord.js',
  'ws',
  'undici',
  '@discordjs/opus',
  '@discordjs/voice',
  '@discordjs/rest',
  '@discordjs/collection',
  '@discordjs/builders',
  '@discordjs/formatters',
  '@discordjs/node-pre-gyp',
  '@sapphire/async-queue',
  '@sapphire/shapeshift',
  '@sapphire/snowflake',
  '@vladfrangu/async_event_emitter',
  'axios',
  'node-fetch',
  'form-data',
  'tweetnacl',
  'prism-media',
  'libsodium-wrappers',
  'bufferutil',
  'utf-8-validate',
  'erlpack',
  'zlib-sync',
  'canvas',
  '@napi-rs/canvas',
  'sharp',
  'sqlite3',
  'better-sqlite3',
  'ioredis',
  'redis',
  'jsonwebtoken',
  'jwa',
  'jws',
  'bcrypt',
  'argon2',
  'helmet',
  'cors',
  'express',
  'cookie-parser',
  'body-parser',
  'multer',
  'socket.io',
  'engine.io',
];

// Severity mapping
const SEVERITY_ORDER = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
const SEVERITY_LABEL = {
  critical: '🔴 CRITICAL',
  high: '🟠 HIGH',
  moderate: '🟡 MODERATE',
  low: '🟢 LOW',
  info: '⚪ INFO'
};
const SEVERITY_COLOR = {
  critical: '#ff0000',
  high: '#ff6600',
  moderate: '#ffaa00',
  low: '#44ff44',
  info: '#888888'
};

let cachedResults = null;
let lastScanTime = 0;
const CACHE_TTL = 3600000; // 1 hour

// ───── stub exports (the real implementation is not part of the open-source release) ─────
Object.assign(module.exports = module.exports || {}, {
  "scanDependencies": async () => [],
  "getFindings": () => [],
  "getStats": () => ({}),
  "generateReport": () => '',
  "markReported": () => undefined,
  "getPriorityFindings": () => [],
  "PRIORITY_PACKAGES": [],
  "SEVERITY_LABEL": {},
  "SEVERITY_COLOR": {},
  "SEVERITY_ORDER": {},
});
