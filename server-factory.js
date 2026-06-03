import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z }          from 'zod';
import { rezeptAnalysieren } from './tools/rezept.js';
import { produkteSuchen }    from './tools/suche.js';
import { auftragErfassen }   from './tools/auftrag.js';
import { produktDetails }    from './tools/produkt.js';
import { login, whoami }     from './tools/auth.js';

export function createMcpServer() {
  const server = new McpServer({ name: 'one-assist', version: '1.0.0' });

  server.tool('login',
    'Meldet sich an der ONE.assist-Plattform an und speichert die tenant_id für Folgeaufrufe.',
    { user: z.string().describe('E-Mail / Benutzername'), pass: z.string().describe('Passwort') },
    async (args) => {
      try   { return { content: [{ type: 'text', text: JSON.stringify(await login(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true }; }
    }
  );

  server.tool('whoami',
    'Zeigt den aktuell eingeloggten Benutzer und die tenant_id.',
    {},
    async () => ({ content: [{ type: 'text', text: JSON.stringify(await whoami(), null, 2) }] })
  );

  server.tool('rezept_analysieren',
    'Analysiert ein Rezeptbild (JPEG/PNG/PDF als Base64) via m16_2.php. Gibt strukturierte Verordnungsdaten zurück.',
    {
      image_base64: z.string().describe('Rezeptbild als Base64-String'),
      mime_type:    z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    },
    async (args) => {
      try   { return { content: [{ type: 'text', text: JSON.stringify(await rezeptAnalysieren(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true }; }
    }
  );

  server.tool('produkte_suchen',
    'Sucht Hilfsmittelprodukte: FAISS (semantisch) + KI-Filter. Freitext möglich: "Bandage für Meniskusriss".',
    {
      query: z.string().describe('Suchanfrage oder produktsuche aus rezept_analysieren'),
      top_k: z.number().int().min(1).max(100).default(30),
    },
    async (args) => {
      try   { return { content: [{ type: 'text', text: JSON.stringify(await produkteSuchen(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true }; }
    }
  );

  server.tool('produkt_details',
    'Lädt Detaildaten und Bilder zu einem Produkt (Name, Beschreibung, Bilder, Varianten, Preis).',
    { id: z.union([z.string(), z.number()]).describe('interneID aus produkte_suchen') },
    async (args) => {
      try   { return { content: [{ type: 'text', text: JSON.stringify(await produktDetails(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true }; }
    }
  );

  server.tool('auftrag_erfassen',
    'Legt einen neuen Auftrag in der Datenbank an. Erfordert vorherigen login().',
    {
      versicherter: z.object({
        vorname: z.string().default(''), nachname: z.string().default(''),
        geburtsdatum: z.string().default(''), versichertennummer: z.string().default(''),
        strasse: z.string().default(''), plz: z.string().default(''), ort: z.string().default(''),
      }),
      kostentraeger:    z.object({ name: z.string().default('') }).default({}),
      ausstellungsdatum: z.string().default(''),
      diagnose:         z.string().default(''),
      verordnungstext:  z.string().default(''),
      suchtext:         z.string().default(''),
      items: z.array(z.object({
        interneID:         z.union([z.string(), z.number()]),
        Bezeichnung:       z.string().optional(),
        Hersteller:        z.string().optional(),
        Hilfsmittelnummer: z.string().optional(),
      })),
      tenant_id: z.number().int().optional(),
    },
    async (args) => {
      try   { return { content: [{ type: 'text', text: JSON.stringify(await auftragErfassen(args), null, 2) }] }; }
      catch (e) { return { content: [{ type: 'text', text: `Fehler: ${e.message}` }], isError: true }; }
    }
  );

  return server;
}
