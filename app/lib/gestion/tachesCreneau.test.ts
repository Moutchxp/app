import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (11/11/2026, 470) — LE CRÉNEAU D'AGENDA DES TÂCHES SANS HEURE, CÔTÉ SERVEUR : 1re tâche sans heure du jour pour ce collaborateur
 * 9h00, 2e 8h30, 3e 8h00 (ordre de création) ; une tâche annulée ou déplacée ne fait pas bouger les autres ; passée à un autre jour, un créneau
 * libre de ce jour ; une tâche avec heure, ou un rendez-vous : aucun créneau. Base simulée en mémoire.
 */
type T = { id: number; jour: string; heure: string | null; confiee_a: number; etat: string; creneau: string | null; sorte: string };
const taches = new Map<number, T>();
let suivant = 1;
const queryMock = vi.fn(async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ');
  if (s.includes('FROM (') && s.includes('admin_utilisateur')) return { rows: [{ id: 5, libelle: 'Claire Martin', identifiant: 'c.martin@criterimmo.fr', actif: true, accesGestion: true }] };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ l: 'Arno Jorel' }] };
  if (s.startsWith('INSERT INTO gestion_tache (')) {
    const id = suivant++;
    taches.set(id, { id, jour: String(p[4]), heure: (p[5] as string | null) ?? null, confiee_a: Number(p[7]), etat: 'a_faire', creneau: null, sorte: 'tache' });
    return { rows: [{ id }] };
  }
  if (s.startsWith('UPDATE gestion_tache SET sorte')) { taches.get(Number(p[0]))!.sorte = String(p[1]); return { rows: [] }; }
  if (s.includes("to_char(creneau_sans_heure, 'HH24:MI') AS creneau,")) {
    const t = taches.get(Number(p[0]));
    return { rows: t ? [{ ...t }] : [] };
  }
  if (s.includes('AS c FROM gestion_tache WHERE jour = $1::date')) {
    return { rows: [...taches.values()].filter((t) => t.jour === p[0] && t.confiee_a === p[1] && t.heure === null && t.etat !== 'annulee' && t.creneau !== null && t.id !== p[2]).map((t) => ({ c: t.creneau })) };
  }
  if (s.startsWith('UPDATE gestion_tache SET creneau_sans_heure = $2::time')) { taches.get(Number(p[0]))!.creneau = String(p[1]); return { rows: [] }; }
  if (s.startsWith('UPDATE gestion_tache SET creneau_sans_heure = NULL')) { taches.get(Number(p[0]))!.creneau = null; return { rows: [] }; }
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string, unknown[]])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string, unknown[]]))),
}));
vi.mock('./schema', () => ({ acceptationTacheDisponible: async () => false, invitesTacheDisponible: async () => false, evenementsTacheDisponible: async () => false,
  agendaTacheDisponible: async () => false, contactsTacheDisponible: async () => false, tachesDisponibles: async () => true, piecesTacheDisponible: async () => false,
  sorteTacheDisponible: async () => true, creneauTacheDisponible: async () => true, invitationContactsDisponible: async () => false }));
vi.mock('./comptesGoogleRepo', () => ({ lireDomainesAutorises: async () => 'criterimmo.fr,sansvisavis.com' }));

const { creerTache } = await import('./tachesRepo');
const AUTEUR = { id: 1, libelle: 'a.jorel@sansvisavis.com' };
const S = (o: Record<string, unknown> = {}) => ({ objet: 'Relancer', jour: '2026-11-20', heure: null, note: null, confieeA: 5, evenementId: null, rappels: [], sorte: 'tache' as const, ...o });
beforeEach(() => { taches.clear(); suivant = 1; });

describe('les créneaux, attribués à la création', () => {
  it('trois tâches sans heure le même jour pour le même collaborateur : 9h00, 8h30, 8h00 (ordre de création)', async () => {
    for (let i = 0; i < 3; i += 1) await creerTache(null, S(), AUTEUR);
    expect([...taches.values()].map((t) => t.creneau)).toEqual(['09:00', '08:30', '08:00']);
  });
  it('une tâche AVEC heure, ou un rendez-vous : aucun créneau ; un autre jour : 9h00 à nouveau', async () => {
    await creerTache(null, S({ heure: '14:00' }), AUTEUR);
    await creerTache(null, S({ heure: '10:00', sorte: 'rdv', dureeMinutes: 30 }), AUTEUR);
    await creerTache(null, S({ jour: '2026-11-21' }), AUTEUR);
    expect([...taches.values()].map((t) => t.creneau)).toEqual([null, null, '09:00']);
  });
  it('la 1re annulée : les autres GARDENT leur créneau ; la suivante prend le premier libre (9h00)', async () => {
    for (let i = 0; i < 3; i += 1) await creerTache(null, S(), AUTEUR);
    taches.get(1)!.etat = 'annulee';
    await creerTache(null, S(), AUTEUR);
    expect([...taches.values()].map((t) => [t.id, t.creneau])).toEqual([[1, '09:00'], [2, '08:30'], [3, '08:00'], [4, '09:00']]);
  });
});
