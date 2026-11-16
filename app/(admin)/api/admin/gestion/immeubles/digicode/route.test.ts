import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (16/11/2026, « Digicodes unifiés ») — l'ancienne route du digicode par adresse n'écrit plus JAMAIS dans les anciennes tables. */
vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ sql: [] as string[], refus: null as Response | null }));
vi.mock('../../../../../../lib/db/client', () => ({
  query: async (s: string) => { h.sql.push(s); return { rows: [] }; },
  withTransaction: async (fn: (q: unknown) => unknown) => fn(async (s: string) => { h.sql.push(s); return { rows: [] }; }),
}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => h.refus }));
vi.mock('../../../../../../lib/location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
import { POST } from './route';

const requete = (corps: unknown) => new Request('http://localhost/api/admin/gestion/immeubles/digicode', { method: 'POST', body: JSON.stringify(corps) });
beforeEach(() => { h.sql = []; h.refus = null; });

describe('POST /api/admin/gestion/immeubles/digicode', () => {
  it('toute écriture est REFUSÉE (410), avec un message qui renvoie au chemin unique ; RIEN n’est lu ni écrit en base', async () => {
    const r = await POST(requete({ voie: '12 rue des Lilas', cp: '75011', commune: 'Paris', digicode: true, code: '1234', batiment: 'B' }));
    expect(r.status).toBe(410);
    const j = await r.json() as { etat: string; motif: string };
    expect(j.etat).toBe('refus');
    expect(j.motif).toContain('le digicode se saisit désormais dans la fiche Copropriété ou la fiche du bien');
    expect(j.motif).toContain('Rien n’est enregistré');
    expect(h.sql).toEqual([]);
  });
  it('le droit « Gestion » reste exigé d’abord', async () => {
    h.refus = new Response(null, { status: 403 });
    expect((await POST(requete({}))).status).toBe(403);
  });
});
