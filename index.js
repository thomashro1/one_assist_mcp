// Lokaler Modus: stdio (Claude Desktop lokal)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer }      from './server-factory.js';

const server    = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
