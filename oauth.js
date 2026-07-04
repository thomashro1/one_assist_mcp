// OAuth 2.1 Provider für den one-assist MCP-Server.
// Zeigt beim Verbinden aus claude.ai ein natives Browser-Fenster mit
// dem HTML-Login-Formular. Access-Token persistiert 24h in mcp_tokens.

import { randomBytes, createHash } from 'crypto';
import { CONFIG } from './config.js';
import {
  verifyPassword, persistToken, validateToken, revokeToken,
  registerClient, getClient,
} from './user_auth.js';

// Auth-Codes bleiben in-memory (10 Minuten TTL, wird sofort im Flow konsumiert).
// Clients dagegen persistieren in mcp_oauth_clients (überleben PM2-Restart).
const authCodes = new Map();

const CODE_LIFETIME_MS = 10 * 60 * 1000;

function randomToken(bytes = 32) { return randomBytes(bytes).toString('base64url'); }

export { validateToken, revokeToken };

// ---------- Discovery ----------

export function protectedResource(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    resource:                 `${CONFIG.PUBLIC_BASE_URL}/api`,
    authorization_servers:    [CONFIG.PUBLIC_BASE_URL],
    bearer_methods_supported: ['header'],
    scopes_supported:         ['mcp'],
  });
}

export function authorizationServer(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({
    issuer:                                CONFIG.PUBLIC_BASE_URL,
    authorization_endpoint:                `${CONFIG.PUBLIC_BASE_URL}/authorize`,
    token_endpoint:                        `${CONFIG.PUBLIC_BASE_URL}/token`,
    registration_endpoint:                 `${CONFIG.PUBLIC_BASE_URL}/register`,
    response_types_supported:              ['code'],
    grant_types_supported:                 ['authorization_code'],
    code_challenge_methods_supported:      ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    scopes_supported:                      ['mcp'],
  });
}

// ---------- Dynamic Client Registration ----------

export async function register(req, res) {
  const body = req.body || {};
  console.log('oauth /register body:', JSON.stringify(body));
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirect_uris.length === 0) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' });
  }

  const requestedAuth = String(body.token_endpoint_auth_method || 'none');
  const supported     = ['none', 'client_secret_post', 'client_secret_basic'];
  const token_endpoint_auth_method = supported.includes(requestedAuth) ? requestedAuth : 'none';

  const client = {
    client_id:     'c_' + randomToken(16),
    client_secret: token_endpoint_auth_method === 'none' ? null : randomToken(32),
    redirect_uris,
    token_endpoint_auth_method,
    client_name:   body.client_name ? String(body.client_name) : null,
    created_at:    Date.now(),
  };

  try {
    await registerClient(client);
  } catch (e) {
    console.error('registerClient failed:', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'server_error', error_description: e.message });
  }

  const response = {
    client_id:                  client.client_id,
    client_id_issued_at:        Math.floor(client.created_at / 1000),
    redirect_uris,
    grant_types:                ['authorization_code'],
    response_types:             ['code'],
    token_endpoint_auth_method,
    scope:                      'mcp',
  };
  if (client.client_secret) {
    response.client_secret            = client.client_secret;
    response.client_secret_expires_at = 0;
  }
  if (client.client_name) response.client_name = client.client_name;
  if (body.software_id)   response.software_id = String(body.software_id);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma',        'no-cache');
  res.status(201).json(response);
}

// ---------- Login-Formular ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loginHtml(params, errorMsg) {
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join('\n');
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>ONE.assist — Anmelden</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #3C4E95; margin: 0; padding: 0;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #1e293b; }
  form { background: #fff; border-radius: 10px; padding: 32px 30px; width: 380px;
         box-shadow: 0 12px 30px rgba(0,0,0,.25); }
  h1 { font-size: 22px; margin: 0 0 4px; color: #3C4E95; }
  h1 span { color: #3E8937; }
  .subtitle { font-size: 13px; color: #64748b; margin-bottom: 22px; }
  label { display: block; font-size: 12px; color: #64748b; margin-bottom: 4px; }
  input[type="email"], input[type="password"] {
    width: 100%; padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 5px;
    font-size: 14px; margin-bottom: 14px;
  }
  input[type="email"]:focus, input[type="password"]:focus {
    outline: none; border-color: #3E8937; box-shadow: 0 0 0 2px rgba(62,137,55,.15);
  }
  button { width: 100%; padding: 10px 18px; background: #3E8937; color: #fff; border: none;
           border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: 600; }
  button:hover { background: #326d2c; }
  .err  { padding: 8px 10px; background: #fee2e2; color: #dc2626; border-radius: 4px; font-size: 13px; margin-bottom: 14px; }
  .hint { font-size: 11px; color: #94a3b8; margin-top: 16px; text-align: center; }
</style></head>
<body>
<form method="POST" action="/mcp/authorize">
  <h1>ONE.<span>assist</span></h1>
  <div class="subtitle">Anmelden für den Zugriff aus Claude</div>
  ${errorMsg ? `<div class="err">${escapeHtml(errorMsg)}</div>` : ''}
  ${inputs}
  <label>E-Mail</label>
  <input type="email" name="email" required autofocus>
  <label>Passwort</label>
  <input type="password" name="password" required>
  <button type="submit">Anmelden</button>
  <div class="hint">Der Zugriff bleibt bis zu 24 Stunden gültig.</div>
</form>
</body></html>`;
}

async function validateAuthorizeParams(q) {
  if (q.response_type !== 'code')                 return "invalid_request: response_type must be 'code'";
  if (!q.client_id)                               return 'invalid_client';
  const client = await getClient(q.client_id);
  if (!client)                                    return 'invalid_client';
  if (!q.redirect_uri || !client.redirect_uris.includes(q.redirect_uri))
                                                  return 'invalid_redirect_uri';
  if (!q.code_challenge)                          return 'invalid_request: code_challenge (PKCE) required';
  if (q.code_challenge_method && q.code_challenge_method !== 'S256')
                                                  return 'invalid_request: only S256 supported';
  return null;
}

export async function authorizeGet(req, res) {
  const err = await validateAuthorizeParams(req.query);
  if (err) return res.status(400).send(err);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(loginHtml({
    response_type:         req.query.response_type,
    client_id:             req.query.client_id,
    redirect_uri:          req.query.redirect_uri,
    code_challenge:        req.query.code_challenge,
    code_challenge_method: req.query.code_challenge_method || 'S256',
    state:                 req.query.state || '',
    scope:                 req.query.scope || 'mcp',
  }));
}

export async function authorizePost(req, res) {
  const err = await validateAuthorizeParams(req.body);
  if (err) return res.status(400).send(err);

  const { email, password, redirect_uri, state } = req.body;
  let user;
  try   { user = await verifyPassword(String(email || ''), String(password || '')); }
  catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(500).send(loginHtml(hiddenParams(req.body), 'Backend-Fehler: ' + e.message));
  }

  if (!user) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(401).send(loginHtml(hiddenParams(req.body), 'Ungültige Zugangsdaten'));
  }

  const code = 'ac_' + randomToken(24);
  authCodes.set(code, {
    code,
    client_id:             req.body.client_id,
    redirect_uri:          req.body.redirect_uri,
    code_challenge:        req.body.code_challenge,
    code_challenge_method: 'S256',
    scope:                 req.body.scope || 'mcp',
    user,
    created_at:            Date.now(),
  });

  const u = new URL(redirect_uri);
  u.searchParams.set('code', code);
  if (state) u.searchParams.set('state', state);
  res.redirect(302, u.toString());
}

function hiddenParams(b) {
  return {
    response_type:         b.response_type,
    client_id:             b.client_id,
    redirect_uri:          b.redirect_uri,
    code_challenge:        b.code_challenge,
    code_challenge_method: b.code_challenge_method || 'S256',
    state:                 b.state || '',
    scope:                 b.scope || 'mcp',
  };
}

// ---------- Token ----------

export async function token(req, res) {
  const body = req.body || {};
  let client_id     = String(body.client_id     || '');
  let client_secret = String(body.client_secret || '');

  const authHdr = req.headers.authorization;
  if (authHdr && authHdr.startsWith('Basic ')) {
    const [id, secret] = Buffer.from(authHdr.slice(6), 'base64').toString().split(':', 2);
    client_id = id; client_secret = secret;
  }

  const client = await getClient(client_id);
  if (!client) return res.status(400).json({ error: 'invalid_client' });
  if (client_secret && client.client_secret && client.client_secret !== client_secret) {
    return res.status(400).json({ error: 'invalid_client' });
  }

  if (body.grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const code          = String(body.code          || '');
  const redirect_uri  = String(body.redirect_uri  || '');
  const code_verifier = String(body.code_verifier || '');

  const ac = authCodes.get(code);
  if (!ac)                                            return res.status(400).json({ error: 'invalid_grant' });
  if (ac.created_at + CODE_LIFETIME_MS < Date.now()) { authCodes.delete(code); return res.status(400).json({ error: 'invalid_grant', error_description: 'code expired' }); }
  if (ac.client_id    !== client_id)                  return res.status(400).json({ error: 'invalid_grant' });
  if (ac.redirect_uri !== redirect_uri)               return res.status(400).json({ error: 'invalid_grant' });

  const challenge = createHash('sha256').update(code_verifier).digest('base64url');
  if (challenge !== ac.code_challenge)                return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE failed' });

  authCodes.delete(code);

  const access_token = 'at_' + randomToken(32);
  const expiresAt    = new Date(Date.now() + CONFIG.TOKEN_LIFETIME_SECONDS * 1000);
  try {
    await persistToken(access_token, ac.user, expiresAt);
  } catch (e) {
    return res.status(500).json({ error: 'server_error', error_description: e.message });
  }

  res.json({
    access_token,
    token_type: 'Bearer',
    expires_in: CONFIG.TOKEN_LIFETIME_SECONDS,
    scope:      ac.scope,
  });
}

// Cleanup abgelaufener Auth-Codes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCodes) if (v.created_at + CODE_LIFETIME_MS < now) authCodes.delete(k);
}, 60 * 1000);
