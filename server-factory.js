import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z }         from 'zod';

import { rezeptAnalysieren }      from './tools/rezept.js';
import { produkteSuchen }          from './tools/suche.js';
import { produkteSuchenKlassisch } from './tools/suche_klassisch.js';
import { auftragErfassen }         from './tools/auftrag.js';
import { produktDetails }          from './tools/produkt.js';
import { revokeToken }             from './user_auth.js';

/**
 * Erzeugt einen MCP-Server pro Session. Der eingeloggte User wird als
 * Closure gebunden — alle Tools sehen automatisch die richtige tenant_id.
 * user === null bedeutet: Zugriff über statischen Bearer-Token ohne User-Kontext.
 */
export function createMcpServer(user, token) {
  const server = new McpServer(
    { name: 'one-assist', version: '2.0.0' },
    {
      capabilities: { tools: {} },
      instructions: user
        ? `MCP-Server für ONE.assist. Angemeldet als ${user.username} (Tenant ${user.tenant_id} — ${user.tenant_name}). Alle Suchen und Aufträge laufen unter dieser tenant_id, Referenzdatenbank-Anreicherung ist aktiv.`
        : 'MCP-Server für ONE.assist. Nicht angemeldet — bitte OAuth-Login durchführen.',
    },
  );

  // ---- whoami ------------------------------------------------------------
  server.tool(
    'whoami',
    'Zeigt den aktuell eingeloggten Benutzer und die tenant_id.',
    {},
    async () => {
      const data = user
        ? { loggedIn: true, tenant_id: user.tenant_id, tenant_name: user.tenant_name, username: user.username }
        : { loggedIn: false };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    },
  );

  // ---- logout ------------------------------------------------------------
  server.tool(
    'logout',
    'Meldet den aktuellen User ab. Der Access-Token wird invalidiert; der nächste Tool-Call erfordert erneuten Login.',
    {},
    async () => {
      if (!user)  return { content: [{ type: 'text', text: 'Nicht angemeldet — kein Logout nötig.' }] };
      if (token)  await revokeToken(token);
      return { content: [{ type: 'text', text: `${user.username} abgemeldet.` }] };
    },
  );

  // ---- rezept_analysieren -----------------------------------------------
  server.tool(
    'rezept_analysieren',
    'Analysiert ein Rezeptbild via m16_2.php. Unterstützt JPEG, PNG, WebP, HEIC, HEIF, TIFF, PDF. Drei Eingabewege (in Reihenfolge der Empfehlung): (1) image_ref = Referenz aus dem Upload-Formular unter https://carecore.one/mcp/upload — bevorzugt bei großen Fotos, kein Kontextverbrauch; (2) image_url wenn das Bild irgendwo erreichbar ist; (3) image_base64 + mime_type nur für kleine Bilder (< ~200 KB), sonst sprengt es den Kontext.',
    {
      image_ref:    z.string().regex(/^up_[A-Za-z0-9_-]{6,32}$/).optional().describe('Upload-Referenz vom Formular unter carecore.one/mcp/upload (Format up_xxx). Empfohlen bei Fotos vom Handy.'),
      image_url:    z.string().url().optional().describe('Öffentlich erreichbare URL zum Rezeptbild.'),
      image_base64: z.string().optional().describe('Rezeptbild als Base64. Nur für kleine Bilder (<200 KB) — sonst image_ref oder image_url.'),
      mime_type:    z.enum([
        'image/jpeg', 'image/png', 'image/webp',
        'image/heic', 'image/heif', 'image/tiff',
        'application/pdf',
      ]).optional().describe('MIME-Type (nur nötig bei image_base64).'),
    },
    async (args) => wrapTool(user, () => rezeptAnalysieren(user, args)),
  );

  // ---- produkte_suchen (semantisch, FAISS) ------------------------------
  server.tool(
    'produkte_suchen',
    'Semantische Produktsuche via FAISS + KI-Filter + mandantenabhängige Referenzdaten (Tier/WAZ/Privatpreis). Freitext möglich: "Bandage für Meniskusriss".',
    {
      query: z.string().describe('Suchanfrage oder produktsuche aus rezept_analysieren'),
      top_k: z.number().int().min(1).max(100).default(30),
    },
    async (args) => wrapTool(user, () => produkteSuchen(user, args)),
  );

  // ---- produkte_suchen_klassisch (Feld-Filter) --------------------------
  server.tool(
    'produkte_suchen_klassisch',
    'Klassische Produktsuche mit strukturierten Filtern (Produktname, Beschreibung, Hersteller, Hilfsmittelnummer, Lieferantenartikelnummer, EAN). Genau ein Feld reicht, mehrere werden UND-verknüpft. Automatische Paginierung. Ergebnisse werden mit Referenzdaten des Mandanten (Tier/WAZ/Privatpreis) angereichert.',
    {
      name:              z.string().optional().describe('Produktname enthält'),
      beschreibung:      z.string().optional().describe('Beschreibung enthält'),
      hersteller:        z.string().optional().describe('Herstellername enthält'),
      hilfsmittelnummer: z.string().optional().describe('Vollständige HIMI-Nummer, z. B. "23.99.01.0001"'),
      lieferanten_artnr: z.string().optional().describe('Artikelnummer des Herstellers'),
      ean:               z.string().optional().describe('EAN / GTIN'),
      max_seiten:        z.number().int().min(1).max(100).default(50).describe('Maximale Anzahl Seiten (à 30 Treffer)'),
    },
    async (args) => wrapTool(user, () => produkteSuchenKlassisch(user, args)),
  );

  // ---- produkt_details --------------------------------------------------
  server.tool(
    'produkt_details',
    'Lädt Detaildaten und Bilder zu einem Produkt (Name, Beschreibung, Bilder, Varianten, Preis).',
    { id: z.union([z.string(), z.number()]).describe('interneID aus produkte_suchen') },
    async (args) => wrapTool(user, () => produktDetails(user, args)),
  );

  // ---- auftrag_erfassen -------------------------------------------------
  server.tool(
    'auftrag_erfassen',
    'Legt einen neuen Auftrag in der Datenbank an. Die tenant_id wird automatisch aus dem eingeloggten User genommen.',
    {
      versicherter: z.object({
        vorname: z.string().default(''), nachname: z.string().default(''),
        geburtsdatum: z.string().default(''), versichertennummer: z.string().default(''),
        strasse: z.string().default(''), plz: z.string().default(''), ort: z.string().default(''),
      }),
      kostentraeger:     z.object({ name: z.string().default('') }).default({}),
      ausstellungsdatum: z.string().default(''),
      diagnose:          z.string().default(''),
      verordnungstext:   z.string().default(''),
      suchtext:          z.string().default(''),
      items: z.array(z.object({
        // Web-App-Schema (bevorzugt) — wird 1:1 an save_completed_order.php weitergereicht
        id:        z.union([z.string(), z.number()]).describe('Produkt-ID (aus produkte_suchen[.produkte[*].interneID] oder produkt_details[.id])'),
        name:      z.string().describe('Produktbezeichnung (Anzeige-Spalte "PRODUKT")'),
        aidNumber: z.string().describe('Hilfsmittelnummer, z. B. "23.99.01.0001" (Anzeige-Spalte "HIMI-NR.")'),
        supplier:  z.string().describe('Herstellername (Anzeige-Spalte "LIEFERANT")'),
        quantity:  z.number().int().min(1).default(1).describe('Menge (Default 1)'),
        ean:       z.string().default('').describe('EAN/GTIN, falls bekannt'),
      })).describe('Positionsliste des Auftrags. Jede Zeile erscheint in der Auftrags-Card unter "Produkte".'),
    },
    async (args) => wrapTool(user, () => auftragErfassen(user, args)),
  );

  return server;
}

async function wrapTool(user, fn) {
  if (!user) {
    return { content: [{ type: 'text', text: 'Nicht angemeldet. Bitte über den OAuth-Login-Flow anmelden.' }], isError: true };
  }
  try {
    const result = await fn();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true };
  }
}
