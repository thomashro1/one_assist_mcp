// Thin HTTP-Client für api/mcp_auth.php.
// Kein direkter DB-Zugriff — alles läuft über PHP mit X-Internal-Token.

import { CONFIG } from './config.js';

async function callAuth(action, payload) {
  if (!CONFIG.MCP_INTERNAL_TOKEN) {
    throw new Error('MCP_INTERNAL_TOKEN nicht gesetzt (env)');
  }
  const res = await fetch(CONFIG.MCP_AUTH_ENDPOINT, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Internal-Token': CONFIG.MCP_INTERNAL_TOKEN,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`mcp_auth: kein JSON (HTTP ${res.status}): ${text.slice(0, 200)}`); }
  return { status: res.status, data };
}

/** Prüft user/pass gegen tenants_users. Gibt User-Objekt zurück oder null. */
export async function verifyPassword(email, password) {
  const { data } = await callAuth('verify_password', { email, password });
  if (!data.ok) return null;
  return data.user;  // { id, tenant_id, tenant_name, username }
}

/** Persistiert einen Access-Token in mcp_tokens. */
export async function persistToken(access_token, user, expiresAtDate) {
  // MySQL DATETIME Format: YYYY-MM-DD HH:MM:SS
  const expires_at = expiresAtDate.toISOString().slice(0, 19).replace('T', ' ');
  const { data } = await callAuth('token_store', {
    access_token,
    tenant_id:   user.tenant_id,
    tenant_name: user.tenant_name,
    user_id:     user.id,
    username:    user.username,
    expires_at,
  });
  if (!data.ok) throw new Error(`token_store fehlgeschlagen: ${data.error || 'unknown'}`);
}

/** Validiert einen Access-Token. Gibt User-Objekt zurück oder null. */
export async function validateToken(access_token) {
  const { data } = await callAuth('token_validate', { access_token });
  if (!data.ok) return null;
  return data.user;
}

/** Widerruft einen Token. */
export async function revokeToken(access_token) {
  try { await callAuth('token_revoke', { access_token }); } catch { /* ignore */ }
}

/** Persistiert einen OAuth-Client. */
export async function registerClient(client) {
  const { data } = await callAuth('client_register', {
    client_id:                  client.client_id,
    client_secret:              client.client_secret,
    redirect_uris:              client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    client_name:                client.client_name,
  });
  if (!data.ok) throw new Error(`client_register fehlgeschlagen: ${data.error || 'unknown'}`);
}

/** Lädt einen OAuth-Client aus der DB. Gibt null zurück wenn unbekannt. */
export async function getClient(client_id) {
  const { data, status } = await callAuth('client_get', { client_id });
  if (status === 404 || !data.ok) return null;
  return data.client;  // { client_id, client_secret, redirect_uris, token_endpoint_auth_method, client_name, created_at }
}
