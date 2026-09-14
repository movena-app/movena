import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : undefined;
  await new Promise((resolve) => probe.close(resolve));
  if (!port) throw new Error('Could not reserve a local port for the screenshot harness.');
  return port;
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/?readme=hero`);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for the screenshot harness.');
}

export async function startScreenshotHarness(projectRoot) {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(
    process.execPath,
    [
      path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--config',
      path.join(projectRoot, 'config', 'vite.ui.config.ts'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  server.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  try {
    await waitForServer(baseUrl);
  } catch (error) {
    server.kill();
    if (output.trim()) process.stderr.write(output);
    throw error;
  }

  return {
    baseUrl,
    stop() {
      server.kill();
    },
    writeOutput() {
      if (output.trim()) process.stderr.write(output);
    },
  };
}

export async function waitForPageAssets(page, delayMs) {
  await page.locator('#root').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => undefined)),
    );
  });
  await page.waitForTimeout(delayMs);
}
