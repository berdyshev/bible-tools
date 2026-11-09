#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod/v4';
import { toNodeHandler } from '@modelcontextprotocol/node';
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
    RATE_LIMIT: z.coerce.number().int().min(1).default(600),
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

// One limit for all clients: behind Render's proxy the socket address is the proxy's, and every
// claude.ai connector calls from Anthropic's addresses anyway, so a per-IP key would not separate
// clients. Forwarded headers are not trusted: the onrender.com hostname bypasses Cloudflare.
const limiter = createRateLimiter({ limit: env.RATE_LIMIT, windowMs: 60_000 });
const GLOBAL_KEY = 'global';

const route = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);

  if (pathname === '/health' && request.method === 'GET') {
    return Response.json({ status: 'ok' });
  }

  if (pathname === '/mcp') {
    const decision = limiter(GLOBAL_KEY);
    if (!decision.allowed) {
      return Response.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': decision.retryAfterSeconds.toString() } },
      );
    }

    return (
      hostHeaderValidationResponse(request, allowedHosts) ??
      originValidationResponse(request, allowedOrigins) ??
      handler.fetch(request)
    );
  }

  return new Response(null, { status: 404 });
};

const nodeHandler = toNodeHandler({ fetch: route }, { onerror: (e) => console.error('http error:', e) });

const server = createHttpServer((req, res) => {
  // NodeIncomingMessageLike declares `method?: string`, which exactOptionalPropertyTypes keeps
  // from accepting IncomingMessage's `string | undefined`; on a server request both are always set.
  const request = Object.assign(req, { method: req.method ?? 'GET', url: req.url ?? '/' });
  nodeHandler(request, res).catch((e: unknown) => {
    console.error(e);
    res.destroy();
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
