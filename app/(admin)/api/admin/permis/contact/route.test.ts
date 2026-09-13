import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lot A — GET /api/admin/permis/contact?code=INSEE (LECTURE SEULE, fiche BaseCommune d'une commune). On mocke db/client +
 * garde. Vérifie : garde admin, validation du code, 404 commune inconnue, 200 + BaseCommune (chemin réel route→repo→query),
 * et AUCUNE écriture (l'écriture reste le PATCH). On teste le COMPORTEMENT (statuts, corps, paramètre lié), jamais la forme du SQL.
 */
const queryMock = vi.fn();
vi.mock('../../../../../lib/db/client', () => ({ query: (...a: unknown[]) => queryMock(...a), withTransaction: vi.fn() }));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));

import { GET } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => GET(new Request(`http://test/api/admin/permis/contact${qs}`, { method: 'GET' }));
const sqls = () => queryMock.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  queryMock.mockReset();
  garde.mockResolvedValue({ auteurId: 5 });
});

describe('GET /api/admin/permis/contact — lecture de la fiche commune', () => {
  it('non-administrateur → refus du garde (aucune requête)', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await req('?code=75056')).status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('code INSEE non conforme → 400 (absent, non numérique, ou pas 5 chiffres)', async () => {
    expect((await req('')).status).toBe(400);
    expect((await req('?code=abc')).status).toBe(400);
    expect((await req('?code=7505')).status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('commune inconnue → 404', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect((await req('?code=99999')).status).toBe(404);
  });

  it('commune trouvée → 200 + BaseCommune (chemin route→repo)', async () => {
    queryMock.mockResolvedValue({ rows: [{
      code_insee: '75056', commune_nom: 'Paris', dest_email: 'u@paris.fr', dest_statut: 'confirme', dest_source: 'saisie_manuelle',
      dest_canal: 'email', dest_url_formulaire: null, dest_adresse_postale: null, dest_telephone: null, dest_responsable_nom: null,
      dest_protocole_verifie_le: null, dest_telephone_standard: null, dest_email_type: 'urbanisme', dest_protocole_source: null, dest_note: null,
      prada_courriel: null, prada_nom: null, prada_prenom: null, prada_adresse: null, prada_millesime: null, prada_statut: null, prada_origine: null, prada_rapprochement: null,
    }] });
    const res = await req('?code=75056');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ codeInsee: '75056', communeNom: 'Paris', destCanal: 'email', destEmail: 'u@paris.fr', destEmailType: 'urbanisme' });
  });

  it('read-only : n’émet AUCUNE écriture', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await req('?code=75056');
    expect(sqls().some((s) => /\b(UPDATE|INSERT|DELETE)\b/i.test(s))).toBe(false);
  });
});
