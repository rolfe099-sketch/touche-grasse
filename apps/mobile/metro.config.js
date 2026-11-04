const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...['dist', 'dist-ios', '.playwright-browsers', 'test-results', 'playwright-report'].map(folder => new RegExp(`^${escape(path.resolve(__dirname, folder))}[/\\\\]`)),
];
module.exports = config;
