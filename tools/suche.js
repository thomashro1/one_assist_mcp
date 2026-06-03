import { CONFIG } from '../config.js';

/**
 * Vollständige Produktsuche: FAISS (semantisch) → KI-Filter (GPT-4o-mini)
 * Entspricht dem App-Flow in SucheAuswahlPage / SemanischeSuchePage.
 */
export async function produkteSuchen({ query, top_k = 30 }) {
  // --- Schritt 1: FAISS semantische Suche ---
  const faissRes = await fetch(`${CONFIG.FAISS_ENDPOINT}?action=search`, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Proxy-Token': CONFIG.FAISS_PROXY_TOKEN,
    },
    body: JSON.stringify({ q: query, top_k }),
  });

  if (!faissRes.ok) {
    throw new Error(`FAISS-Fehler HTTP ${faissRes.status}`);
  }

  const faissData = await faissRes.json();
  const hits = faissData?.data?.results ?? faissData?.results ?? faissData ?? [];

  if (!Array.isArray(hits) || hits.length === 0) {
    return { query, produkte: [], count: 0 };
  }

  // --- Schritt 2: KI-Filter ---
  const filteredIds = await kiFilter(query, hits);

  const produkte = hits.filter(h => {
    const id = String(h.interneID ?? h.id ?? '');
    return filteredIds.includes(id);
  });

  return {
    query,
    produkte,
    count:               produkte.length,
    faiss_treffer_gesamt: hits.length,
    ki_filter_aktiv:     filteredIds.length < hits.length,
  };
}

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

  const ids = Array.isArray(parsed?.ids) ? parsed.ids.map(String).filter(id => allIds.includes(id)) : [];
  return ids.length >= 2 ? ids : allIds;
}
