/* eslint-disable @typescript-eslint/no-require-imports -- Metro's CommonJS configuration interface. */
const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
// Keep Windows development/export from exhausting file handles on large repos.
config.maxWorkers = 2;
const original = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(original) ? original : original ? [original] : []),
  /[/\\](?:artifacts|\.next|test-results|playwright-report)[/\\]/,
];
module.exports = config;
