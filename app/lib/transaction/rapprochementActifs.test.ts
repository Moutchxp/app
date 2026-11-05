import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rattacherLibelle, unifierNegociateurs } from '../location/suivi/negociateurIdentite';

/**
 * 🔴 Arno (05/11/2026) — LE CAS DE PRODUCTION : deux comptes « Pierre Thevenin » — le 9 (p.thevenin@sansvisavis.com, ACTIF) et le 8
 * (p.thevenin@sasnvisavis.com, faute de frappe, DÉSACTIVÉ). Le texte « PIERRE » de ses 60 ventes était ambigu → « Mon espace » vide.
 * RÈGLE : le rapprochement par TEXTE ignore un compte désactivé quand un compte actif correspond ; deux comptes ACTIFS restent ambigus ;
 * un texte qui ne correspond qu'à un compte désactivé (ancien collaborateur) reste rattaché, comme avant. Comptes simulés : aucune base.
 */
const ACTIF = { id: 9, identifiant: 'p.thevenin@sansvisavis.com', prenom: 'Pierre', nom: 'Thevenin', actif: true };
const ERREUR = { id: 8, identifiant: 'p.thevenin@sasnvisavis.com', prenom: 'Pierre', nom: 'Thevenin', actif: false };
const AUTRE_ACTIF = { id: 12, identifiant: 'pierre.martin@sansvisavis.com', prenom: 'Pierre', nom: 'Martin', actif: true };
const ANCIEN = { id: 3, identifiant: 'mylene@sansvisavis.com', prenom: 'Mylène', nom: 'ANCIENNE', actif: false };

const h = vi.hoisted(() => ({ comptes: [] as unknown[] }));
vi.mock('../db/client', () => ({ query: vi.fn(async () => ({ rows: [] })), withTransaction: vi.fn() }));
vi.mock('../location/suivi/negociateurIdentiteRepo', () => ({ lireComptesNegociateurs: async () => h.comptes, lireAliasNegociateurs: async () => [] }));
const { comptesRapprochesDesLibelles } = await import('./repo');
beforeEach(() => { h.comptes = [ACTIF, ERREUR]; });

describe('🔴 nom complet ou adresse (`rattacherLibelle`)', () => {
  it('deux comptes au même nom dont un DÉSACTIVÉ : rattaché au compte actif', () => {
    expect(rattacherLibelle('Pierre Thevenin', [ACTIF, ERREUR], [])).toEqual({ sorte: 'auto', compteId: 9 });
    expect(rattacherLibelle('Pierre Thevenin', [ERREUR, ACTIF], [])).toEqual({ sorte: 'auto', compteId: 9 });
  });
  it('deux comptes ACTIFS au même nom : toujours ambigu, rien rattaché', () => {
    const b = { ...ACTIF, id: 13, identifiant: 'autre@sansvisavis.com' };
    expect(rattacherLibelle('Pierre Thevenin', [ACTIF, b, ERREUR], [])).toEqual({ sorte: 'ambigu', candidats: [9, 13] });
  });
  it('un seul compte, DÉSACTIVÉ : rattaché comme avant (un ancien collaborateur ne perd pas ses lignes)', () => {
    expect(rattacherLibelle('Mylène ANCIENNE', [ACTIF, ANCIEN], [])).toEqual({ sorte: 'auto', compteId: 3 });
  });
  it('l’adresse du compte créé par erreur désigne toujours CE compte (une adresse est exacte)', () => {
    expect(rattacherLibelle('p.thevenin@sasnvisavis.com', [ACTIF, ERREUR], [])).toEqual({ sorte: 'auto', compteId: 8 });
  });
  it('Location (`unifierNegociateurs`) : la même règle — la ligne « Pierre Thevenin » rejoint le compte actif', () => {
    const r = unifierNegociateurs([{ negociateurId: null, negociateurLibelle: 'Pierre Thevenin' }], [ACTIF, ERREUR], []);
    expect(r.lignes[0].negociateurId).toBe(9);
    expect(r.aRapprocher).toEqual([]);
  });
});

describe('🔴 le prénom seul (« PIERRE ») — `comptesRapprochesDesLibelles`, la lecture de « Mon espace »', () => {
  it('LE CAS DE PRODUCTION : « PIERRE » → le compte ACTIF 9, jamais le 8 désactivé', async () => {
    const r = await comptesRapprochesDesLibelles(['PIERRE', 'Pierre Thevenin']);
    expect(r.PIERRE?.id).toBe(9);
    expect(r['Pierre Thevenin']?.id).toBe(9);
  });
  it('deux comptes ACTIFS au prénom Pierre : « PIERRE » reste ambigu, rien rattaché', async () => {
    h.comptes = [ACTIF, ERREUR, AUTRE_ACTIF];
    expect((await comptesRapprochesDesLibelles(['PIERRE'])).PIERRE).toBeNull();
  });
  it('un seul compte au prénom, désactivé : rattaché comme avant', async () => {
    h.comptes = [ACTIF, ANCIEN];
    expect((await comptesRapprochesDesLibelles(['MYLENE'])).MYLENE?.id).toBe(3);
  });
});
