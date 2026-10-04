import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const evenementsMock = vi.fn();
vi.mock('../../../../../../lib/gestion/historiqueBienRepo', () => ({
  evenementsDuBien: (...a: unknown[]) => evenementsMock(...a),
  EVENEMENTS_DU_BIEN_MAX: 40,
}));

import { GET } from './route';

/**
 * LOT HISTORIQUE-BIEN-1 — LES ÉVÉNEMENTS D'UN BIEN, AVEC LEURS DATES.
 *
 * 🔴 CE QU'ELLE SERT, ET RIEN D'AUTRE : choisir un événement dans le tableau de bord RÈGLE les deux dates. Il lui
 * faut donc `ouvert_le` et `traite_le`, que ni `LigneHistorique.evenements` ni `chercherEvenements` ne rendent.
 */
const requete = (q: string) => new Request(`http://local/api/admin/gestion/historique/evenements${q}`);

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  evenementsMock.mockReset(); evenementsMock.mockResolvedValue({ liste: [], tronque: false });
});

describe('les événements d’un bien', () => {
  it('🔒 exige le droit « gestion » : les objets d’événement nomment des personnes', async () => {
    await GET(requete('?cible=lot-155'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('🔒 refus ⇒ aucune lecture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(requete('?cible=lot-155'))).status).toBe(403);
    expect(evenementsMock).not.toHaveBeenCalled();
  });

  it('🔴 elle lit par la CLÉ WIPPIMMO du lot', async () => {
    await GET(requete('?cible=lot-155'));
    expect(evenementsMock.mock.calls[0][0]).toBe('155');
  });

  /** ⚠️ UNE CLÉ WIPPIMMO PEUT CONTENIR UN TIRET (« J-1 ») : la lecture coupe au PREMIER tiret et garde le reste. */
  it('⚠️ une clé à tiret est transmise entière', async () => {
    await GET(requete('?cible=lot-J-1'));
    expect(evenementsMock.mock.calls[0][0]).toBe('J-1');
  });

  /** 🔴 SEULE UNE CIBLE `lot-…` EST ACCEPTÉE : un prédicat deviné pour une autre cible serait un prédicat faux. */
  it('🔴 toute autre cible est refusée, plutôt que répondue de travers', async () => {
    for (const q of ['', '?cible=', '?cible=proprio-339', '?cible=carte-12', '?cible=locataire-254']) {
      const res = await GET(requete(q));
      expect(res.status).toBe(400);
      expect((await res.json() as { etat: string }).etat).toBe('cible_invalide');
    }
    expect(evenementsMock).not.toHaveBeenCalled();
  });

  it('🔴 elle rend la liste, la troncature et le plafond, sans cache partagé', async () => {
    evenementsMock.mockResolvedValue({
      liste: [{
        id: 7, reference: 'EV-2026-007', objet: 'Dégât des eaux', etat: 'en_cours', ouvert: true,
        ouvertLe: '2026-02-03T07:15:00Z', closLe: null, nbMails: 6,
      }],
      tronque: true,
    });
    const res = await GET(requete('?cible=lot-155'));
    const d = await res.json() as { etat: string; evenements: { id: number }[]; tronque: boolean; max: number };
    expect(d.etat).toBe('ok');
    expect(d.evenements[0].id).toBe(7);
    expect(d.tronque).toBe(true);
    expect(d.max).toBe(40);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  /** ⚠️ PAS DE CATCH MUET : une liste vide se lirait « ce bien n'a jamais eu d'événement ». */
  it('⚠️ une panne de base se DIT (503)', async () => {
    evenementsMock.mockRejectedValue(new Error('base muette'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(requete('?cible=lot-155'));
    expect(res.status).toBe(503);
    expect((await res.json() as { etat: string }).etat).toBe('erreur');
  });
});
