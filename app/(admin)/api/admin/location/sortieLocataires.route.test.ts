import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — la ROUTE : la sortie d'abord, le mail ensuite ; un échec
 * d'envoi ne transforme JAMAIS une sortie enregistrée en erreur, et il est rendu tel quel (jamais un faux « envoyé »).
 */
vi.mock('../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/location/garde', () => ({ exigerLocation: async () => ({ ok: true }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'arno@exemple.fr' }) }));
/** Le droit « Gestion », RELU EN BASE par `exigerCompteActif` (simulé) : `null` = accordé, une réponse = refusé. */
let droitGestion = true;
vi.mock('../../../../lib/admin/garde', () => ({
  exigerCompteActif: async (_r: Request, module: string) => (module === 'gestion' && !droitGestion ? new Response(null, { status: 403 }) : null),
}));
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

beforeEach(() => { enregistrerSortie.mockReset(); notifierSortie.mockReset(); droitGestion = true; });

describe('POST sortie-locataires', () => {
  it('échec d’envoi : la sortie reste « ok », et la réponse dit que le mail n’est pas parti', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'ok', data: FAITE });
    notifierSortie.mockResolvedValue({ envoye: false, motif: 'Gmail injoignable', destinataires: ['a@b.fr'], objet: 'x' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11, '12', 'x'], date: '2026-10-31' }))).json();
    expect(r).toEqual({ etat: 'ok', data: { date: '2026-10-31', vacant: true, restants: [] }, mail: { envoye: false, ignore: false, motif: 'Gmail injoignable' } });
    expect(enregistrerSortie).toHaveBeenCalledWith({ occupationId: 11, sortants: [11, 12], date: '2026-10-31' }, { id: 3, libelle: 'arno@exemple.fr' });
  });

  it('🔴 décision du 18/10/2026 : SANS le droit Gestion, la validation de sortie est REFUSÉE par le serveur (403), rien n’est écrit', async () => {
    droitGestion = false;
    const res = await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '2026-10-15' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ etat: 'refus', motif: 'La sortie est validée par un utilisateur de la Gestion.' });
    expect(enregistrerSortie).not.toHaveBeenCalled();
    expect(notifierSortie).not.toHaveBeenCalled();
  });

  it('un refus de la sortie : aucun mail', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '' }))).json();
    expect(r).toEqual({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    expect(notifierSortie).not.toHaveBeenCalled();
  });
});
