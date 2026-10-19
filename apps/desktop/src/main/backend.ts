import { ChildProcess, spawn } from 'child_process';
import crypto from 'crypto';
import http from 'http';
import net from 'net';
import path from 'path';

export interface BackendProcessInfo {
  port: number;
  token: string;
  process: ChildProcess;
}

/**
 * Find an available TCP port on loopback.
 */
export async function findFreePort(startPort: number = 52174): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const address = server.address() as net.AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // If port is occupied, try dynamic allocation with 0
      const altServer = net.createServer();
      altServer.listen(0, '127.0.0.1', () => {
        const address = altServer.address() as net.AddressInfo;
        const port = address.port;
        altServer.close(() => resolve(port));
      });
    });
  });
}

/**
 * Poll the backend health endpoint until it responds with HTTP 200.
 */
export async function waitForBackendHealth(port: number, maxAttempts: number = 40): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const isHealthy = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (isHealthy) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

import { app } from 'electron';
import fs from 'fs';
import os from 'os';

/**
 * Launch the Python FastAPI backend as a child process.
 */
export async function startBackendProcess(): Promise<BackendProcessInfo> {
  const port = await findFreePort(52174);
  const token = crypto.randomBytes(16).toString('hex');

  const appPath = app.getAppPath();
  const resourcesPath = (process as any).resourcesPath || appPath;

  const candidatePaths = [
    path.join(resourcesPath, 'bin', 'lab-engine.exe'),
    path.join(resourcesPath, 'lab-engine.exe'),
    path.join(appPath, 'dist-backend', 'lab-engine.exe'),
    path.join(appPath, '..', 'dist-backend', 'lab-engine.exe'),
  ];

  let exePath = '';
  let exeArgs: string[] = ['--port', String(port), '--token', token];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        exePath = candidate;
        console.log(`[Electron] Found standalone backend binary at: ${exePath}`);
        break;
      }
    } catch (_) {}
  }

  const logDir = path.join(os.homedir(), '.labdownloader');
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (_) {}
  const logStream = fs.createWriteStream(path.join(logDir, 'engine.log'), { flags: 'a' });

  let cwd = exePath ? path.dirname(exePath) : (app.isPackaged ? resourcesPath : appPath);
  if (!exePath) {
    // Fallback to python script
    exePath = 'python';
    const scriptPath = app.isPackaged
      ? path.join(resourcesPath, 'app.asar.unpacked', 'services', 'downloader', 'main.py')
      : path.join(appPath, 'services', 'downloader', 'main.py');
    exeArgs = [scriptPath, '--port', String(port), '--token', token];
    cwd = app.isPackaged ? path.dirname(scriptPath) : appPath;
    console.log(`[Electron] Falling back to system Python with script: ${scriptPath}`);
  }

  console.log(`[Electron] Starting backend service from ${exePath} on 127.0.0.1:${port} (cwd: ${cwd})...`);
  logStream.write(`\n--- Starting Backend on port ${port} at ${new Date().toISOString()} ---\n`);
  logStream.write(`[INIT] exePath=${exePath}, cwd=${cwd}\n`);

  const proc = spawn(exePath, exeArgs, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    windowsHide: true,
  });

  proc.stdout?.on('data', (data) => {
    const text = data.toString();
    console.log(`[Backend stdout] ${text.trim()}`);
    logStream.write(`[OUT] ${text}`);
  });

  proc.stderr?.on('data', (data) => {
    const text = data.toString();
    console.error(`[Backend stderr] ${text.trim()}`);
    logStream.write(`[ERR] ${text}`);
  });

  proc.on('error', (err) => {
    console.error(`[Electron] Failed to spawn backend process: ${err.message}`);
    logStream.write(`[FAIL] ${err.message}\n`);
  });

  proc.on('exit', (code, signal) => {
    console.log(`[Electron] Backend process exited with code ${code}, signal ${signal}`);
    logStream.write(`[EXIT] code=${code}, signal=${signal}\n`);
  });

  const healthy = await waitForBackendHealth(port);
  if (!healthy) {
    console.warn(`[Electron] Backend health check timed out on port ${port}.`);
  } else {
    console.log(`[Electron] Backend verified healthy on port ${port}.`);
  }

  return { port, token, process: proc };
}

/**
 * Gracefully stop the backend process.
 */
export async function stopBackendProcess(info: BackendProcessInfo | null): Promise<void> {
  if (!info) return;
  console.log('[Electron] Requesting backend shutdown...');

  try {
    const req = http.request(
      `http://127.0.0.1:${info.port}/api/system/shutdown`,
      {
        method: 'POST',
        headers: { 'X-Lab-Token': info.token },
      }
    );
    req.on('error', () => {});
    req.end();
  } catch (_) {}

  // Wait briefly then kill if still running
  await new Promise((r) => setTimeout(r, 600));
  if (!info.process.killed) {
    try {
      info.process.kill('SIGTERM');
    } catch (_) {}
  }
}
