import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D5 — GET /basculer-rail (APERÇU, lecture seule). On mocke db/client + garde. Vérifie : garde admin, validation, résolution de
 * commune, PÉRIMÈTRE des demandes (brouillon/prête SEULEMENT → jamais envoyée/close), raison de refus, et AUCUNE écriture.
 */
const queryMock = vi.fn();
vi.mock('../../../../../lib/db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));

import { GET } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => GET(new Request(`http://test/api/admin/permis/basculer-rail${qs}`, { method: 'GET' }));
const sqls = () => queryMock.mock.calls.map((c) => String(c[0]));

function brancher(contact: { canal: string | null; email?: string | null; url?: string | null; adr?: string | null }, ids: number[], permis: number) {
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM commune WHERE/.test(sql)) return { rows: [{ code_insee: '75056', nom: 'Paris' }] };
    if (/FROM mairie_contact WHERE code_insee/.test(sql)) return { rows: [{ canal: contact.canal, email: contact.email ?? null, url_formulaire: contact.url ?? null, adresse_postale: contact.adr ?? null }] };
    if (/FROM demande WHERE code_insee/.test(sql)) return { rows: ids.map((id) => ({ id })) };
    if (/count\(DISTINCT dd\.dossier_id\)/.test(sql)) return { rows: [{ n: permis }] };
    return { rows: [] };
  });
}

beforeEach(() => {
  queryMock.mockReset();
  garde.mockResolvedValue({ auteurId: 5 });
});

describe('D5 — GET basculer-rail (aperçu)', () => {
  it('non-administrateur → 403', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await req('?q=75056&cible=formulaire')).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('cible invalide / commune manquante → 422', async () => {
    expect((await req('?q=75056&cible=courrier')).status).toBe(422);
    expect((await req('?cible=formulaire')).status).toBe(422);
  });

  it('happy path : renvoie le périmètre + raison null quand la coordonnée cible existe', async () => {
    brancher({ canal: 'email', email: 'x@y.fr', url: 'https://ville.fr/urba' }, [1, 2], 2);
    const body = await (await req('?q=Paris&cible=formulaire')).json();
    expect(body).toMatchObject({ codeInsee: '75056', communeNom: 'Paris', canalActuel: 'email', cible: 'formulaire', nbDemandes: 2, nbPermis: 2, raisonRefus: null });
    expect(body.ids).toEqual([1, 2]);
  });

  // 🔴 PART 3 — le périmètre est brouillon/prête SEULEMENT : jamais une envoyée/close.
  it('la requête des demandes ne vise QUE brouillon/prête (jamais envoyée/close)', async () => {
    brancher({ canal: 'email', email: 'x@y.fr', url: 'https://ville.fr/urba' }, [], 0);
    await req('?q=75056&cible=formulaire');
    const sqlDem = sqls().find((s) => /FROM demande WHERE code_insee/.test(s)) ?? '';
    expect(sqlDem.replace(/\s+/g, ' ')).toContain("statut IN ('brouillon', 'prete')");
    expect(sqlDem).not.toMatch(/envoyee|close/);
  });

  // 🔴 PART 3 — APERÇU = LECTURE SEULE : aucune écriture (le canal ne change qu'à l'exécution, via PATCH /contact).
  it('n’émet AUCUNE écriture (read-only)', async () => {
    brancher({ canal: 'email', email: 'x@y.fr', url: 'https://ville.fr/urba' }, [1], 1);
    await req('?q=75056&cible=formulaire');
    expect(sqls().some((s) => /\b(UPDATE|INSERT|DELETE)\b/i.test(s))).toBe(false);
  });

  it('coordonnée cible manquante → raisonRefus renseignée (refus, pas 500)', async () => {
    brancher({ canal: 'email', email: 'x@y.fr', url: null }, [1], 1); // pas d'URL → vers formulaire refusé
    const body = await (await req('?q=75056&cible=formulaire')).json();
    expect(body.raisonRefus).toContain('URL de formulaire invalide');
  });

  it('commune introuvable → 404 ; ambiguë → 409', async () => {
    queryMock.mockImplementation(async (sql: string) => (/FROM commune WHERE/.test(sql) ? { rows: [] } : { rows: [] }));
    expect((await req('?q=Zzz&cible=email')).status).toBe(404);
    queryMock.mockImplementation(async (sql: string) => (/FROM commune WHERE/.test(sql) ? { rows: [{ code_insee: '1', nom: 'A' }, { code_insee: '2', nom: 'A' }] } : { rows: [] }));
    expect((await req('?q=A&cible=email')).status).toBe(409);
  });
});
