// Zero-dependency static server for the A-1 probe page.
// Usage: node verification/probe/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 4173);

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const file = path === '/' || path === '/index.html' ? 'index.html' : null;

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }

  try {
    const body = await readFile(join(here, file));
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('read error');
  }
});

server.listen(port, () => {
  console.log(`A-1 probe listening on http://localhost:${port}`);
});
