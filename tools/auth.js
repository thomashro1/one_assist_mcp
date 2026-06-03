import { state } from '../state.js';

const AUTH_ENDPOINT = 'https://carecore.one/one_assist/api/auth.php';

export async function login({ user, pass }) {
  const res = await fetch(`${AUTH_ENDPOINT}?action=login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ user, pass }),
  });

  const data = await res.json();

  if (!data.ok) {
    throw new Error(data.error ?? `Login fehlgeschlagen (HTTP ${res.status})`);
  }

  state.tenantId   = data.tenant_id;
  state.tenantName = data.tenant_name;
  state.username   = data.username;

  return {
    ok:          true,
    tenant_id:   data.tenant_id,
    tenant_name: data.tenant_name,
    username:    data.username,
  };
}

export async function whoami() {
  if (state.tenantId) {
    return {
      loggedIn:    true,
      tenant_id:   state.tenantId,
      tenant_name: state.tenantName,
      username:    state.username,
    };
  }
  return { loggedIn: false };
}
