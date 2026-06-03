import { CONFIG } from '../config.js';
import { state }  from '../state.js';

/**
 * Speichert einen Auftrag in himi10_orders.
 * tenant_id aus Argument oder Config-Default.
 */
export async function auftragErfassen(args) {
  const body = {
    versicherter:     args.versicherter     ?? {},
    kostentraeger:    args.kostentraeger     ?? {},
    ausstellungsdatum: args.ausstellungsdatum ?? '',
    diagnose:         args.diagnose          ?? '',
    verordnungstext:  args.verordnungstext   ?? '',
    suchtext:         args.suchtext          ?? '',
    items:            args.items             ?? [],
    tenant_id:        args.tenant_id         ?? state.tenantId ?? CONFIG.DEFAULT_TENANT_ID,
  };

  const res = await fetch(CONFIG.ORDERS_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Auftrag-Fehler HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return await res.json();
}
