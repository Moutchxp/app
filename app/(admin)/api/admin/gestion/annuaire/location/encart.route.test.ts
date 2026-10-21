import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026) — la ROUTE de la fiche commune, encart modifiable : `?encart=N` (valeurs fraîches), `?modifsEncart=N`
 * (Historique), action `modifier-encart` (un groupe, l'auteur de la requête). Garde et dépôt simulés : rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'arno@exemple.test' }) }));
vi.mock('../../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), withTransaction: vi.fn(), closePool: vi.fn() }));
const modifierEncartBien = vi.fn();
const lireEncartBien = vi.fn();
const modificationsEncart = vi.fn();
vi.mock('../../../../../../lib/location/encartBienRepo', async (orig) => ({
  ...(await orig<object>()),
  modifierEncartBien: (...a: unknown[]) => modifierEncartBien(...a),
  lireEncartBien: (...a: unknown[]) => lireEncartBien(...a),
  modificationsEncart: (...a: unknown[]) => modificationsEncart(...a),
}));
const { GET, POST } = await import('./route');

const URL_API = 'http://localhost/api/admin/gestion/annuaire/location';
const poste = (corps: unknown) => POST(new Request(URL_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }));
beforeEach(() => { modifierEncartBien.mockReset(); lireEncartBien.mockReset(); modificationsEncart.mockReset(); });

describe('🔴 encart : la route', () => {
  it('?encart=N → les valeurs fraîches ; ?modifsEncart=N → l’Historique', async () => {
    lireEncartBien.mockResolvedValue({ etat: 'ok', data: { valeurs: { commentaire: 'x' } } });
    expect(await (await GET(new Request(`${URL_API}?encart=7`))).json()).toEqual({ etat: 'ok', data: { valeurs: { commentaire: 'x' } } });
    expect(lireEncartBien).toHaveBeenCalledWith(7);
    modificationsEncart.mockResolvedValue([{ id: 1, quand: '2026-10-21', texte: 'Commentaire — …', par: 'arno' }]);
    expect(await (await GET(new Request(`${URL_API}?modifsEncart=7`))).json()).toMatchObject({ etat: 'ok', data: [{ id: 1 }] });
  });

  it('modifier-encart : le groupe et la saisie vont au dépôt, avec l’auteur ; l’issue est rendue', async () => {
    modifierEncartBien.mockResolvedValue({ etat: 'ok', data: { changements: [{ cle: 'commentaire' }] } });
    const r = await poste({ action: 'modifier-encart', id: 7, groupe: 'commentaire', valeurs: { commentaire: 'Après.' } });
    expect(await r.json()).toEqual({ etat: 'ok', data: { changements: [{ cle: 'commentaire' }] } });
    expect(modifierEncartBien.mock.calls[0]).toEqual([7, 'commentaire', { commentaire: 'Après.' }, { id: 5, libelle: 'arno@exemple.test' }]);
  });

  it('un refus du dépôt est rendu tel quel (motif en clair)', async () => {
    modifierEncartBien.mockResolvedValue({ etat: 'refus', motif: 'La date du DPE ne peut pas être dans le futur.' });
    const r = await poste({ action: 'modifier-encart', id: 7, groupe: 'dpe', valeurs: { dpeDate: '2099-01-01' } });
    expect(await r.json()).toMatchObject({ etat: 'refus', motif: 'La date du DPE ne peut pas être dans le futur.' });
  });

  it('groupe inconnu, valeurs absentes ou bien manquant : refusé sans rien appeler', async () => {
    for (const corps of [{ action: 'modifier-encart', id: 7, groupe: 'proprietaires', valeurs: {} }, { action: 'modifier-encart', id: 7, groupe: 'dpe' },
      { action: 'modifier-encart', groupe: 'dpe', valeurs: {} }]) {
      const r = await poste(corps);
      expect(r.status, JSON.stringify(corps)).toBeGreaterThanOrEqual(400);
    }
    expect(modifierEncartBien).not.toHaveBeenCalled();
  });
});
