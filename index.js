// Lokaler Modus: stdio (Claude Desktop lokal)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer }      from './server-factory.js';

// Ohne User — im stdio-Modus schlagen tenant-abhängige Tools mit "Nicht angemeldet" fehl.
// Für Login remote via https://carecore.one/mcp/api nutzen.
const server    = createMcpServer(null, null);
const transport = new StdioServerTransport();
await server.connect(transport);
