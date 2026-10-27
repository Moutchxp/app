import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 4, libelle: 'Arnaud' }) }));
const repo = {
  ajouterEtapeManuelle: vi.fn(), friseDeLEvenement: vi.fn(), poserCarteDeBorne: vi.fn(), reordonnerCartes: vi.fn(),
};
vi.mock('../../../../../../../lib/gestion/mongaEtapeRepo', () => ({
  ajouterEtapeManuelle: (...a: unknown[]) => repo.ajouterEtapeManuelle(...a),
  friseDeLEvenement: (...a: unknown[]) => repo.friseDeLEvenement(...a),
  poserCarteDeBorne: (...a: unknown[]) => repo.poserCarteDeBorne(...a),
  reordonnerCartes: (...a: unknown[]) => repo.reordonnerCartes(...a),
  decompteConfirmations: async () => [], referencesDeliees: async () => [], referencesSuiviesAilleurs: async () => [],
}));
vi.mock('../../../../../../../lib/gestion/schema', () => ({ correctionEtapeDisponible: async () => true }));
vi.mock('../../../../../../../lib/gestion/tacheEvenementsRepo', () => ({ tachesDeLEvenement: async () => [] }));
vi.mock('../../../../../../../lib/gestion/gestes', () => ({ deplacerOuvertureEvenement: vi.fn() }));
const queryMock = vi.fn();
vi.mock('../../../../../../../lib/db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { PATCH, POST } from './route';
import { motDateAvantDernier } from '../../../../../../../lib/gestion/frise';

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE (Arno, 27/10/2026) — LES GARDES DE LA ROUTE DE LA FRISE ═════════════════════════════════════════════════════
 * A3 : une carte posée au bout n'est pas datée avant le dernier élément (refus avec la phrase d'Arno, rien n'est écrit) ; sans date
 * saisie, elle se range au jour de repli. A4 : le glisser ne dépose rien avant l'Ouverture. Le comportement est éprouvé (réponse,
 * paramètres transmis), jamais la forme d'un SQL.
 */
const ctx = { params: Promise.resolve({ id: '37' }) };
const req = (methode: 'POST' | 'PATCH', corps: unknown) => new Request('http://local/x', { method: methode, body: JSON.stringify(corps) });
const etape = (id: number, p: Record<string, unknown> = {}) => ({
  id, reference: 'MNG-20922', type: 'commentaire', survenuLe: '2026-10-23 10:00:00', heureConnue: true, jourConnu: true, heureFin: null,
  numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'monga', certitude: 'confirmee', statut: 'vif',
  messageId: 900 + id, aEuUnMail: true, filId: 50, pieceNom: null, creeParLibelle: null, creeLe: '2026-10-23 10:00:05', titre: null,
  rangDevis: null, rangPose: null, poseChoisie: false, ...p,
});
const FRISE = [
  etape(1, { type: 'ouverture', survenuLe: '2026-10-23 09:12:00' }),
  etape(2), etape(3, { survenuLe: '2026-10-24 11:00:00', creeLe: '2026-10-24 11:00:05' }),
];

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  for (const f of Object.values(repo)) f.mockReset();
  repo.friseDeLEvenement.mockResolvedValue(FRISE);
  repo.ajouterEtapeManuelle.mockResolvedValue(500);
  repo.reordonnerCartes.mockResolvedValue({ ok: true });
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ ouvert: true, ouvert_le: '2026-10-23 09:12:00+02' }] });
});

describe('🔴🔴 A3 — POST : une carte posée au bout ne se date pas avant le dernier élément', () => {
  it('date antérieure : 409, la phrase d’Arno, rien n’est écrit', async () => {
    const res = await POST(req('POST', { type: 'rapport', survenuLe: '2026-10-20', jourConnu: true }), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ erreur: motDateAvantDernier('2026-10-24') });
    expect(repo.ajouterEtapeManuelle).not.toHaveBeenCalled();
  });

  it('même jour ou après : la carte part, au bout (aucune place demandée)', async () => {
    const res = await POST(req('POST', { type: 'rapport', survenuLe: '2026-10-24', jourConnu: true }), ctx);
    expect(res.status).toBe(200);
    expect(repo.ajouterEtapeManuelle).toHaveBeenCalledWith(expect.objectContaining({ survenuLe: '2026-10-24', insererApres: undefined }));
  });

  it('le petit « + » qui suit le dernier élément est soumis à la même règle', async () => {
    const res = await POST(req('POST', { type: 'note', survenuLe: '2026-10-20', jourConnu: true, insererApres: 3 }), ctx);
    expect(res.status).toBe(409);
  });

  it('un « + » intercalaire garde son rôle (rattraper un oubli à sa place) : pas de plancher', async () => {
    const res = await POST(req('POST', { type: 'note', survenuLe: '2026-10-23', jourConnu: true, insererApres: 2 }), ctx);
    expect(res.status).toBe(200);
    expect(repo.ajouterEtapeManuelle).toHaveBeenCalledWith(expect.objectContaining({ survenuLe: '2026-10-23', insererApres: 2 }));
  });

  it('sans date saisie : rangée au jour de repli, jamais avant le dernier élément', async () => {
    await POST(req('POST', { type: 'rapport', survenuLe: '2026-10-21', jourConnu: false }), ctx);
    expect(repo.ajouterEtapeManuelle).toHaveBeenLastCalledWith(expect.objectContaining({ survenuLe: '2026-10-24', jourConnu: false }));
    await POST(req('POST', { type: 'rapport', survenuLe: '2026-10-27', jourConnu: false }), ctx);
    expect(repo.ajouterEtapeManuelle).toHaveBeenLastCalledWith(expect.objectContaining({ survenuLe: '2026-10-27', jourConnu: false }));
  });
});

describe('🔴🔴 A4 — PATCH ordre : rien ne se dépose avant l’Ouverture', () => {
  it('un ordre qui met un élément devant l’Ouverture est refusé, rien n’est écrit', async () => {
    const res = await PATCH(req('PATCH', { geste: 'ordre', cartes: [2, 1, 3] }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toBe('Rien ne se place avant l’Ouverture : elle reste le premier élément de la frise.');
    expect(repo.reordonnerCartes).not.toHaveBeenCalled();
  });

  it('un ordre qui garde l’Ouverture en tête passe (le glisser-déposer reste)', async () => {
    const res = await PATCH(req('PATCH', { geste: 'ordre', cartes: [1, 3, 2] }), ctx);
    expect(res.status).toBe(200);
    expect(repo.reordonnerCartes).toHaveBeenCalledWith(37, [1, 3, 2], 'Arnaud');
  });
});
