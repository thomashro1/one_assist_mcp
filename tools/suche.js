import { CONFIG } from '../config.js';

/**
 * Vollständige Produktsuche: FAISS (semantisch) → KI-Filter (GPT-4o-mini)
 * → Anreicherung mit mandantenspezifischer Referenz aus himi10_search_map
 *   (Tier basic/comfort/premium, WAZ, Privatpreis, Hinweise).
 */
export async function produkteSuchen(user, { query, top_k = 30 }) {
  if (!user) throw new Error('Nicht angemeldet.');

  // --- Schritt 1: FAISS semantische Suche ---
  const faissRes = await fetch(`${CONFIG.FAISS_ENDPOINT}?action=search`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'X-Proxy-Token': CONFIG.FAISS_PROXY_TOKEN,
    },
    body: JSON.stringify({ q: query, top_k }),
  });
  if (!faissRes.ok) throw new Error(`FAISS-Fehler HTTP ${faissRes.status}`);

  const faissData = await faissRes.json();
  const hits = faissData?.data?.results ?? faissData?.results ?? faissData ?? [];

  if (!Array.isArray(hits) || hits.length === 0) {
    return { query, tenant_id: user.tenant_id, produkte: [], count: 0 };
  }

  // --- Schritt 2: KI-Filter ---
  const filteredIds = await kiFilter(query, hits);
  let produkte = hits.filter(h => {
    const id = String(h.interneID ?? h.id ?? '');
    return filteredIds.includes(id);
  });

  // --- Schritt 3: Referenzdatenbank-Anreicherung (mandantenabhängig) ---
  const refMap = await ladeReferenzMap(user.tenant_id, produkte);
  produkte = produkte.map(p => {
    const himi = normalisiereHimi(p.Hilfsmittelnummer ?? p.hilfsmittelnummer);
    const ref  = himi ? refMap.get(himi) : null;
    return {
      ...p,
      referenz: ref ? {
        basic:     Boolean(Number(ref.himi10_basic)),
        comfort:   Boolean(Number(ref.himi10_comfort)),
        premium:   Boolean(Number(ref.himi10_premium)),
        waz:       ref.himi10_0waz ?? null,
        p_preis:   ref.p_preis     ?? null,
        hinweis_1: ref.hinweis_1   ?? null,
        hinweis_2: ref.hinweis_2   ?? null,
      } : null,
    };
  });

  return {
    query,
    tenant_id:            user.tenant_id,
    produkte,
    count:                produkte.length,
    faiss_treffer_gesamt: hits.length,
    ki_filter_aktiv:      filteredIds.length < hits.length,
    referenz_treffer:     refMap.size,
  };
}

// ---- Referenzdatenbank ----------------------------------------------------

function normalisiereHimi(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

/**
 * Ruft himi_man.php action=search mit tenant_id im Body auf (der Fallback-Pfad,
 * der für Non-Session-Clients wie native App bereits produktiv ist).
 * Liefert Map<himi10_search, row>.
 */
async function ladeReferenzMap(tenant_id, produkte) {
  const himis = [...new Set(
    produkte.map(p => normalisiereHimi(p.Hilfsmittelnummer ?? p.hilfsmittelnummer)).filter(Boolean)
  )];
  if (himis.length === 0) return new Map();

  try {
    const res = await fetch(CONFIG.HIMI_MAN_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:    'search',
        tenant_id,
        data:      { q: '', limit: 5000 },
      }),
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];

    const wanted = new Set(himis);
    const map    = new Map();
    for (const row of rows) {
      const key = normalisiereHimi(row.himi10_search);
      if (key && wanted.has(key)) map.set(key, row);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ---- KI-Filter (unverändert aus V1) ---------------------------------------

async function kiFilter(query, hits) {
  const allIds = hits.map(h => String(h.interneID ?? h.id ?? '')).filter(Boolean);
  if (!CONFIG.OPENAI_API_KEY) return allIds;

  const lines = hits.map(h => {
    const id   = String(h.interneID ?? h.id ?? '');
    const name = h.Bezeichnung   ?? h.bezeichnung   ?? h.name ?? id;
    const hst  = h.Hersteller    ?? h.hersteller    ?? '';
    const himi = h.Hilfsmittelnummer ?? h.hilfsmittelnummer ?? '';
    let label  = name;
    if (hst)  label += ` (${hst})`;
    if (himi) label += ` [${himi}]`;
    return `${id}: ${label}`;
  });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:           'gpt-4o-mini',
      max_tokens:      400,
      temperature:     0.0,
      seed:            42,
      response_format: { type: 'json_object' },
      messages: [
        {
          role:    'system',
          content: `Du bist ein Produktfilter für eine Sanitätshaus-Software.
Aufgabe: Prüfe welche Produkte inhaltlich zur Suchanfrage passen.
Die Produkte haben eine HIMI-Hilfsmittelnummer in eckigen Klammern [XX.XX.XX.XXXX].
Regeln:
- Behalte nur Produkte, die zur gesuchten Produktkategorie gehören.
- Entferne Produkte aus falschen Kategorien (z. B. Rollator ≠ Rollstuhl, Gehstock ≠ Rollator).
- Im Zweifel behalten (lieber zu viel als zu wenig).
- Antworte NUR als JSON: {"ids": ["105957", "105123", ...]}`,
        },
        {
          role:    'user',
          content: `Suchanfrage: "${query}"\n\nKandidaten:\n${lines.join('\n')}`,
        },
      ],
    }),
  });

  if (!res.ok) return allIds;

  const data    = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  let parsed;
  try { parsed = JSON.parse(content); } catch { return allIds; }

  const ids = Array.isArray(parsed?.ids)
    ? parsed.ids.map(String).filter(id => allIds.includes(id))
    : [];
  return ids.length >= 2 ? ids : allIds;
}
