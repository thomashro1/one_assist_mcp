import express                             from 'express';
import multer                               from 'multer';
import { randomUUID }                       from 'crypto';
import { StreamableHTTPServerTransport }    from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest }              from '@modelcontextprotocol/sdk/types.js';

import { CONFIG }          from './config.js';
import { createMcpServer } from './server-factory.js';
import * as oauth          from './oauth.js';
import { uploadHandler }   from './upload.js';
import { uploadFormHtml }  from './upload_html.js';

const PORT = parseInt(process.env.PORT || '3012');
const app  = express();
app.use(express.json({ limit: '50mb' }));

// ---- Health (unauth) --------------------------------------------------------
app.get('/health', (_req, res) =>
  res.json({ ok: true, name: 'one-assist-mcp', transport: 'streamable-http', version: '2.0.0' }),
);

// ---- OAuth-Discovery (unauth) ----------------------------------------------
// claude.ai probiert mehrere Pfade nach RFC 8414 / 9728:
//   /.well-known/oauth-protected-resource
//   /.well-known/oauth-protected-resource/mcp        (Standard: issuer-path angehängt)
//   /.well-known/oauth-protected-resource/mcp/api    (resource-path angehängt)
//   /.well-known/oauth-authorization-server
//   /.well-known/oauth-authorization-server/mcp
// Alle liefern das gleiche JSON zurück.
app.get(/^\/\.well-known\/oauth-protected-resource(\/.*)?$/,   oauth.protectedResource);
app.get(/^\/\.well-known\/oauth-authorization-server(\/.*)?$/, oauth.authorizationServer);

// ---- OAuth-Endpoints (unauth) ----------------------------------------------
app.post('/register',                                              oauth.register);
app.get ('/authorize',                                             oauth.authorizeGet);
app.post('/authorize', express.urlencoded({ extended: false }),    oauth.authorizePost);
app.post('/token',     express.urlencoded({ extended: false }),    oauth.token);

// ---- Bearer-Auth-Middleware -------------------------------------------------
async function bearerAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    res.setHeader(
      'WWW-Authenticate',
      `Bearer realm="one-assist", resource_metadata="${CONFIG.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
    );
    return res.status(401).json({ error: 'Bearer token required' });
  }
  const token = auth.slice(7).trim();
  try {
    const user = await oauth.validateToken(token);
    if (user) { req.currentUser = user; req.currentToken = token; return next(); }
  } catch (e) {
    console.warn('bearerAuth backend error:', e.message);
  }
  res.setHeader(
    'WWW-Authenticate',
    `Bearer realm="one-assist", error="invalid_token", resource_metadata="${CONFIG.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
  );
  res.status(401).json({ error: 'Invalid or expired bearer token' });
}

// ---- Upload (Web-Formular + JSON) ------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
async function optionalBearer(req, _res, next) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    try {
      const user = await oauth.validateToken(auth.slice(7).trim());
      if (user) req.currentUser = user;
    } catch {}
  }
  next();
}
app.get ('/upload',      (_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(uploadFormHtml()); });
app.get ('/upload.html', (_req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(uploadFormHtml()); });
app.post('/upload', optionalBearer, upload.single('file'), uploadHandler);

// ---- MCP-Streamable-HTTP (session-scoped) ----------------------------------
const sessions = new Map();

app.all('/api', bearerAuth, async (req, res) => {
  try {
    const sid = req.headers['mcp-session-id'];

    // Bestehende Session wiederverwenden
    if (sid && sessions.has(sid)) {
      await sessions.get(sid).transport.handleRequest(req, res, req.body);
      return;
    }

    // Neue Session nur bei Initialize-Request erlauben
    if (req.method === 'POST' && isInitializeRequest(req.body)) {
      const user  = req.currentUser  || null;
      const token = req.currentToken || null;

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator:   () => randomUUID(),
        onsessioninitialized: (id) => sessions.set(id, { transport, user }),
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      const server = createMcpServer(user, token);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ error: 'Bad request: missing or unknown session' });
  } catch (e) {
    console.error('mcp /api handler error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// ---- Start -----------------------------------------------------------------
app.listen(PORT, '127.0.0.1', () => {
  console.log(`one-assist MCP server (v2, OAuth) on 127.0.0.1:${PORT}`);
  console.log(`Public base URL: ${CONFIG.PUBLIC_BASE_URL}`);
  if (!CONFIG.MCP_INTERNAL_TOKEN) {
    console.warn('WARN: MCP_INTERNAL_TOKEN nicht gesetzt — Auth-Backend-Aufrufe schlagen fehl.');
  }
});
