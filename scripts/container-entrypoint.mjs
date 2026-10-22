import { spawn } from 'node:child_process';
import { containerDatabaseUrl } from './container-environment.mjs';

try {
  process.env.DATABASE_URL = containerDatabaseUrl(process.env.DATABASE_URL);
  if (process.argv[2] === 'backend') {
    await import('../backend/dist/main.js');
  } else if (process.argv[2] === 'migrate') {
    const child = spawn('npm', ['run', 'db:migrate'], { stdio: 'inherit' });
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
    child.on('error', () => { console.error('Migration process could not start'); process.exitCode = 1; });
    child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
  } else {
    throw new Error();
  }
} catch {
  console.error('Container startup failed. Verify DATABASE_URL and the container command.');
  process.exitCode = 1;
}
