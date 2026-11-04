const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  // Metro's Windows watcher normalizes paths to '/', while crawling uses
  // native separators. Match both, including the directory itself.
  ...['dist', 'dist-ios', '.playwright-browsers', 'test-results', 'playwright-report'].map(folder => new RegExp(`^${path.resolve(__dirname, folder).split(/[/\\]/).map(escape).join('[/\\\\]')}(?:[/\\\\]|$)`)),
];
module.exports = config;
