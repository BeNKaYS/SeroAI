import { spawn } from 'node:child_process';
import { createUiServer } from '../ui/server.mjs';

function openBrowser(url) {
  const [command, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Tarayıcı açılamazsa adres yine yazdırılır.
  }
}

export async function runUi(options, messages, defaultRoot) {
  const root = options.root ?? defaultRoot;
  const ui = await createUiServer({ root, port: options.port ?? 0, language: options.language });
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ url: ui.url, port: ui.port, root })}\n`);
  } else {
    process.stdout.write(`${messages.uiStarted}\n  ${ui.url}\n${messages.uiStopHint}\n`);
  }
  if (!options.noOpen) openBrowser(ui.url);
  await new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      resolve();
    };
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });
  await ui.close();
  return '';
}
