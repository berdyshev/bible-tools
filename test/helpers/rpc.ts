import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod/v4';

const response = z.object({
  id: z.number(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});

/** Connects `server` over an in-memory transport and returns a minimal JSON-RPC requester. */
export const connectRaw = async (server: McpServer) => {
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (r: z.infer<typeof response>) => void>();
  client.onmessage = (message) => {
    const parsed = response.safeParse(message);
    if (parsed.success) pending.get(parsed.data.id)?.(parsed.data);
  };
  await server.connect(serverSide);
  await client.start();

  let nextId = 1;
  const request = (method: string, params: Record<string, unknown> = {}): Promise<z.infer<typeof response>> =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      void client.send({ jsonrpc: '2.0', id, method, params });
    });

  await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0.0.0' },
  });
  await client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return { request, close: () => client.close() };
};
