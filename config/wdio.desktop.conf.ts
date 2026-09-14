import path from 'node:path';
import process from 'node:process';
import { createServer, type Server } from 'node:http';
import type { TauriCapabilities } from '@wdio/tauri-service';

const executable = process.platform === 'win32' ? 'movena.exe' : 'movena';
let fixtureServer: Server | undefined;
const capabilities: TauriCapabilities[] = [
  {
    browserName: 'tauri',
    'tauri:options': {
      application: path.resolve('src-tauri', 'target', 'debug', executable),
    },
  },
];

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: [path.resolve('tests', 'desktop', '**', '*.e2e.ts')],
  maxInstances: 1,
  capabilities,
  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'embedded',
        captureBackendLogs: true,
        captureFrontendLogs: true,
        startTimeout: 90_000,
      },
    ],
  ],
  framework: 'mocha',
  reporters: ['spec'],
  logLevel: 'info',
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  mochaOpts: { timeout: 120_000 },
  onPrepare: async () => {
    fixtureServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
      response.end(
        '#EXTM3U\n#EXTINF:-1 group-title="News",Example News\nhttps://media.example/live.m3u8\n',
      );
    });
    await new Promise<void>((resolve, reject) => {
      fixtureServer?.once('error', reject);
      fixtureServer?.listen(18_991, '127.0.0.1', resolve);
    });
  },
  onComplete: async () => {
    await new Promise<void>((resolve, reject) => {
      if (!fixtureServer) return resolve();
      fixtureServer.close((error) => (error ? reject(error) : resolve()));
    });
  },
};
