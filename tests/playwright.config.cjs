const path = require('node:path');
const { defineConfig } = require('@playwright/test');

const python = process.platform === 'win32' ? 'python' : 'python3';

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.cjs',
  timeout: 30000,
  expect: { timeout: 6000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:8787',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: `${python} -m http.server 8787 --directory .`,
    cwd: path.resolve(__dirname, '..'),
    url: 'http://127.0.0.1:8787/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
