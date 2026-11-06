#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod/v4';
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  originValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
} from '@modelcontextprotocol/server';

import { DatabaseNotFoundError, openDb } from './data/db.ts';
import { createBibleRepo } from './data/repo.ts';
import { createServer } from './server.ts';
import { createRateLimiter } from './rate-limit.ts';

const hostnames = z
  .string()
  .transform((arg) =>
    arg
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean),
  )
  .optional();

const env = z
  .object({
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    STEPBIBLE_DB: z
      .string()
      .min(1)
      .default(fileURLToPath(new URL('../data/bible.sqlite', import.meta.url))),
    ALLOWED_HOSTS: hostnames,
    ALLOWED_ORIGINS: hostnames,
  })
  .parse(process.env);

const allowedHosts = env.ALLOWED_HOSTS ?? localhostAllowedHostnames();
const allowedOrigins = env.ALLOWED_ORIGINS ?? localhostAllowedOrigins();

const openOrExit = (path: string): DatabaseSync => {
  try {
    return openDb(path);
  } catch (e) {
    if (e instanceof DatabaseNotFoundError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
};

const db = openOrExit(env.STEPBIBLE_DB);
const repo = createBibleRepo(db);
const handler = createMcpHandler(() => createServer({ repo }), {
  onerror: (e) => console.error('mcp handle error:', e.message),
});

const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

const isByteStream = (value: unknown): value is ReadableStream<Uint8Array> => value instanceof ReadableStream;

const toWebRequest = (req: IncomingMessage, url: URL) => {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(req.rawHeaders[i] ?? '', req.rawHeaders[i + 1] ?? '');
  }

  const method = req.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers });
  }

  const body: unknown = Readable.toWeb(req);
  if (!isByteStream(body)) {
    throw new TypeError('expected a web ReadableStream');
  }

  const init = { method, headers, body, duplex: 'half' };
  return new Request(url, init);
};

const route = async (req: IncomingMessage): Promise<Response> => {
  const url = URL.parse(req.url ?? '/', 'http://localhost');

  if (url === null) {
    return new Response(null, { status: 400 });
  }

  if (url.pathname === '/health' && req.method === 'GET') {
    return Response.json({ status: 'ok' });
  }

  if (url.pathname === '/mcp') {
    const decision = limiter(req.socket.remoteAddress ?? 'unknown');
    if (!decision.allowed) {
      return Response.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': decision.retryAfterSeconds.toString() } },
      );
    }

    const request = toWebRequest(req, url);
    return (
      hostHeaderValidationResponse(request, allowedHosts) ??
      originValidationResponse(request, allowedOrigins) ??
      handler.fetch(request)
    );
  }

  return new Response(null, { status: 404 });
};

const writeWebResponse = async (response: Response, res: ServerResponse): Promise<void> => {
  if (res.destroyed) {
    return;
  }
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body === null) {
    res.end();
    return;
  }
  await pipeline(Readable.from(response.body), res);
};

const server = createHttpServer((req, res) => {
  route(req)
    .then((response) => writeWebResponse(response, res))
    .catch((e: unknown) => {
      if (res.destroyed) {
        return;
      }
      console.error(e);
      if (res.headersSent) {
        res.destroy();
      } else {
        res.writeHead(500).end();
      }
    });
});

server.listen(env.PORT, '0.0.0.0', () => {
  console.error(`stepbible MCP server listening on :${env.PORT}`);
});

const shutdown = (signal: string): void => {
  console.error(`stepbible MCP server stopping on ${signal}`);
  setTimeout(() => {
    server.closeAllConnections();
    process.exit(1);
  }, 10_000).unref();

  server.close(() => {
    db.close();
    process.exit(0);
  });
  handler.close().catch(console.error);
};

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
