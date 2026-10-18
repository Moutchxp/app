import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — la ROUTE : la sortie d'abord, le mail ensuite ; un échec
 * d'envoi ne transforme JAMAIS une sortie enregistrée en erreur, et il est rendu tel quel (jamais un faux « envoyé »).
 */
vi.mock('../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/location/garde', () => ({ exigerLocation: async () => ({ ok: true }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'arno@exemple.fr' }) }));
const enregistrerSortie = vi.fn();
const notifierSortie = vi.fn();
vi.mock('../../../../lib/location/sortieLocatairesRepo', () => ({
  enregistrerSortie: (...a: unknown[]) => enregistrerSortie(...a),
  notifierSortie: (...a: unknown[]) => notifierSortie(...a),
  rechercherOccupants: vi.fn(async () => []), lireBail: vi.fn(), bauxDuLocataire: vi.fn(),
  corrigerSortie: vi.fn(), annulerSortie: vi.fn(),
}));

import { POST } from './route';

const demande = (corps: unknown): Request => new Request('http://localhost/api/admin/location', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});
const FAITE = { date: '2026-10-31', vacant: true, restants: [], bail: { lotId: 7 }, sortants: [], occupationIds: [11], annexes: [] };

beforeEach(() => { enregistrerSortie.mockReset(); notifierSortie.mockReset(); });

describe('POST sortie-locataires', () => {
  it('échec d’envoi : la sortie reste « ok », et la réponse dit que le mail n’est pas parti', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'ok', data: FAITE });
    notifierSortie.mockResolvedValue({ envoye: false, motif: 'Gmail injoignable', destinataires: ['a@b.fr'], objet: 'x' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11, '12', 'x'], date: '2026-10-31' }))).json();
    expect(r).toEqual({ etat: 'ok', data: { date: '2026-10-31', vacant: true, restants: [] }, mail: { envoye: false, ignore: false, motif: 'Gmail injoignable' } });
    expect(enregistrerSortie).toHaveBeenCalledWith({ occupationId: 11, sortants: [11, 12], date: '2026-10-31' }, { id: 3, libelle: 'arno@exemple.fr' });
  });

  it('un refus de la sortie : aucun mail', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '' }))).json();
    expect(r).toEqual({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    expect(notifierSortie).not.toHaveBeenCalled();
  });
});
