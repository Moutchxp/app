import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collaborateursPourTache, MENTION_SANS_ACCES_GESTION, peutRecevoirUneTache } from './taches';

/**
 * RÈGLE D'ARNO DU 13/10/2026 — À QUI CONFIER UNE TÂCHE : tout compte ACTIF de l'application dont l'adresse est dans
 * NOTRE Workspace, accès Gestion ou non. Une seule règle (`peutRecevoirUneTache`), pour la liste ET pour le serveur.
 */
const DOMAINES = ['criterimmo.fr', 'sansvisavis.com'];
const compte = (p: Partial<{ id: number; libelle: string; identifiant: string; actif: boolean; accesGestion: boolean }>) => ({
  id: 1, libelle: 'Arno Jorel', identifiant: 'a.jorel@sansvisavis.com', actif: true, accesGestion: true, ...p,
});

describe('🔴 la règle « Confiée à »', () => {
  it('un compte actif du Workspace SANS accès Gestion est proposé, avec la mention', () => {
    const l = collaborateursPourTache([compte({ id: 2, libelle: 'Claire Martin', identifiant: 'c.martin@criterimmo.fr', accesGestion: false })], DOMAINES, null);
    expect(l).toEqual([{ id: 2, libelle: 'Claire Martin', accesGestion: false }]);
    expect(MENTION_SANS_ACCES_GESTION).toBe('(sans accès Gestion — verra la tâche dans son agenda)');
  });
  it('un compte inactif n’est pas proposé', () => {
    expect(peutRecevoirUneTache({ actif: false, identifiant: 'x@sansvisavis.com' }, DOMAINES)).toBe(false);
  });
  it('un compte hors Workspace n’est pas proposé, même actif et même avec l’accès Gestion', () => {
    expect(peutRecevoirUneTache({ actif: true, identifiant: 'augustin@gmail.com' }, DOMAINES)).toBe(false);
    expect(peutRecevoirUneTache({ actif: true, identifiant: 'x@sansvisavis.com.pirate.fr' }, DOMAINES)).toBe(false);
    expect(peutRecevoirUneTache({ actif: true, identifiant: 'X@SansVisAVis.com' }, DOMAINES)).toBe(true);
  });
  it('aucun domaine connu ⇒ personne (on ne devine pas notre Workspace)', () => {
    expect(peutRecevoirUneTache({ actif: true, identifiant: 'x@sansvisavis.com' }, [])).toBe(false);
  });
  it('moi en tête, puis l’ordre reçu', () => {
    const l = collaborateursPourTache([
      compte({ id: 1, libelle: 'Anne' , identifiant: 'a@criterimmo.fr' }),
      compte({ id: 2, libelle: 'Bruno', identifiant: 'b@gmail.com' }),
      compte({ id: 3, libelle: 'Claire', identifiant: 'c@sansvisavis.com' }),
      compte({ id: 4, libelle: 'Denis', identifiant: 'd@sansvisavis.com' }),
    ], DOMAINES, 3);
    expect(l.map((c) => c.id)).toEqual([3, 1, 4]);
  });
});

/* ── LE SERVEUR APPLIQUE LA MÊME RÈGLE ──────────────────────────────────────────────────────────────────────────── */
let compteBase: Record<string, unknown> | null;
const appels: string[] = [];
const queryMock = vi.fn(async (sql: string) => {
  const s = sql.replace(/\s+/g, ' ');
  appels.push(s);
  if (s.includes('FROM (') && s.includes('admin_utilisateur')) return { rows: compteBase === null ? [] : [compteBase] };
  if (s.includes('FROM gestion_annuaire_lot WHERE id = $1')) return { rows: [{}] };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ l: 'Arno Jorel' }] };
  if (s.includes('INSERT INTO gestion_tache (')) return { rows: [{ id: 7 }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...(a as [string])),
  withTransaction: async (f: (q: unknown) => unknown) => f((...a: unknown[]) => queryMock(...(a as [string]))),
}));
vi.mock('./schema', () => ({ contactsTacheDisponible: async () => false, tachesDisponibles: async () => true }));
vi.mock('./comptesGoogleRepo', () => ({ lireDomainesAutorises: async () => 'criterimmo.fr,sansvisavis.com' }));

const { creerTache } = await import('./tachesRepo');
const SAISIE = { objet: 'Visite', jour: '2026-10-15', heure: null, note: null, confieeA: 5, evenementId: null, rappels: [] };
const AUTEUR = { id: 1, libelle: 'a.jorel@sansvisavis.com' };

describe('🔴 le serveur refuse une personne hors règle', () => {
  beforeEach(() => { appels.length = 0; });
  it('hors Workspace : refus 400, rien n’est écrit', async () => {
    compteBase = { id: 5, libelle: 'Augustin Jorel', identifiant: 'augustin@gmail.com', actif: true, accesGestion: false };
    expect(await creerTache(10, SAISIE, AUTEUR)).toMatchObject({ ok: false, statut: 400 });
    expect(appels.some((s) => s.startsWith('INSERT'))).toBe(false);
  });
  it('compte inconnu ou inactif (la lecture ne prend que les actifs) : refus', async () => {
    compteBase = null;
    expect(await creerTache(10, SAISIE, AUTEUR)).toMatchObject({ ok: false, statut: 400 });
  });
  it('actif, du Workspace, SANS accès Gestion : accepté', async () => {
    compteBase = { id: 5, libelle: 'Claire Martin', identifiant: 'c.martin@criterimmo.fr', actif: true, accesGestion: false };
    expect(await creerTache(10, SAISIE, AUTEUR)).toEqual({ ok: true, id: 7 });
    expect(appels.find((s) => s.startsWith('INSERT INTO gestion_tache ('))).toBeDefined();
  });
});
