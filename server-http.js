import express                            from 'express';
import { randomUUID }                      from 'crypto';
import { StreamableHTTPServerTransport }   from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest }             from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer }                 from './server-factory.js';

const PORT = parseInt(process.env.PORT || '3012');
const app  = express();
app.use(express.json());

const transports = new Map();

app.all('/api', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];

  // Bestehende Session wiederverwenden
  if (sessionId && transports.has(sessionId)) {
    await transports.get(sessionId).handleRequest(req, res, req.body);
    return;
  }

  // Neue Session nur bei Initialize-Request erlauben
  if (req.method === 'POST' && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => transports.set(id, transport),
    });
    transport.onclose = () => transports.delete(transport.sessionId);

    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({ error: 'Bad request: missing or unknown session' });
});

app.get('/health', (_, res) => res.json({ ok: true, name: 'one-assist-mcp', transport: 'streamable-http' }));

app.listen(PORT, '127.0.0.1', () =>
  console.log(`one-assist MCP server (StreamableHTTP) on 127.0.0.1:${PORT}`)
);
