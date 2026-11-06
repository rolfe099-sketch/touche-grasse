const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
module.exports = defineConfig([expo, { ignores: ['public/ocr/**', 'dist/**', 'dist-ios/**', '.expo/**', '.playwright-browsers/**', 'test-results/**', 'playwright-report/**'] }]);
