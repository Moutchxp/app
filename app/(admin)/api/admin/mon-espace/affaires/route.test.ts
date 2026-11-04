import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LigneVente, Vente } from '../../../../../lib/transaction/modele';

/**
 * 🔴 MON ESPACE, LOT 3 — la VRAIE route GET /api/admin/mon-espace/affaires, base simulée (rien n'est écrit) : on lit l'OBJET JSON renvoyé, jamais
 * l'écran. Deux comptes, trois ventes (données fictives) ; un compte sans droit ; un administrateur ; un compte sans aucune vente.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), ventes: [] as unknown[], roles: {} as Record<number, string> }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/transaction/repo', () => ({
  transactionDisponible: async () => true,
  lireVentes: async (s: unknown) => { if (s !== null) throw new Error('« Mon espace » lit toutes les ventes une fois (vue FUSION)'); return h.ventes; },
  // La règle de rattachement existante, simulée : « LEA » → le compte de Léa (5), « MARC » → Marc (7).
  // 🔴 LOT 4 — les noms affichés et le statut des négociateurs de la réponse (lecture des références, sans y donner accès).
  libellesDePaye: () => [], lireStatutsNegociateurs: async () => ({}), nomsAffichesNegociateurs: async () => ({}),
  // 🔴 LOT 8 — les rétrocessions (le bloc « par apporteur » de « Mes statistiques ») : aucune ici.
  lireRetrocessions: async () => [],
  comptesRapprochesDesLibelles: async (ls: string[]) => Object.fromEntries(ls.map((l) => [l, l === 'LEA' || l === 'Léa MARTIN' ? { id: 5 } : l === 'MARC' || l === 'Marc DURAND' ? { id: 7 } : null])),
}));
vi.mock('../../../../../lib/admin/schemaDroits', () => ({ repartitionDisponible: async () => true, personneTypeDisponible: async () => true,
  uniteCommissionDisponible: async () => true, prixVenteDisponible: async () => true, mandatDisponible: async () => true, droitsD37Disponibles: async () => false }));
vi.mock('../../../../../lib/db/client', () => ({ query: async (_sql: string, p: unknown[]) => ({ rows: [{ role: h.roles[Number(p[0])] ?? 'collaborateur', prenom: 'Prénom' }] }) }));

import { GET } from './route';

const ligne = (o: Partial<LigneVente> & Pick<LigneVente, 'negociateur' | 'role'>): LigneVente => ({ id: 1, montantTtc: null, nature: 'vente', compte: true, origine: 'saisie',
  sourceFichier: null, sourceOnglet: null, sourceLigne: null, note: null, ...o });
const base = (o: Partial<Vente>): Vente => ({ id: 0, societe: 'criterimmo', libelle: 'X', honorairesTtc: 12000, statut: 'compromis', annee: 2026, mois: null, dateCompromis: '2026-10-01',
  apporteur: null, note: null, origine: 'saisie', sourceFichier: null, sourceOnglet: null, sourceLigne: null, lignes: [], double: null, ...o });
const partagee = base({ id: 1, libelle: 'PARTAGÉE', repartition: { retroApporteurTtc: 0, parties: [
  { sorte: 'entree', compteId: 5, negociateur: 'Léa MARTIN', societe: 'criterimmo', nom: null, coordonnees: null, pourcentage: 50, montantHt: null },
  { sorte: 'sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, pourcentage: 50, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 5, nom: 'Léa MARTIN' }, sortie: { id: 7, nom: 'Marc DURAND' }, apporteurId: null, personnes: [] },
  lignes: [ligne({ negociateur: 'Léa MARTIN', role: 'negociateur', cote: 'entree', montantTtc: 3111.11, taux: 52 }),
    ligne({ negociateur: 'Marc DURAND', role: 'negociateur', cote: 'sortie', montantTtc: 2999.99, taux: 47 })] });
const deMarc = base({ id: 2, libelle: 'DE MARC SEUL', repartition: { retroApporteurTtc: 0, parties: [
  { sorte: 'entree_sortie', compteId: 7, negociateur: 'Marc DURAND', societe: 'macj', nom: null, coordonnees: null, pourcentage: 100, montantHt: null }] },
  dossier: { adresseBien: null, dateActePrevue: null, dateActe: null, entree: { id: 7, nom: 'Marc DURAND' }, sortie: { id: 7, nom: 'Marc DURAND' }, apporteurId: null, personnes: [] } });
const deLea = base({ id: 3, libelle: 'IMPORT LEA', statut: 'vendue', mois: 4, origine: 'import', lignes: [ligne({ negociateur: 'LEA', role: 'vendeur' })] });

const lire = async (compteId: number | 'refus'): Promise<{ status: number; corps: Record<string, unknown> }> => {
  h.garde.mockResolvedValue(compteId === 'refus' ? { refus: Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 }) } : { auteurId: compteId });
  const r = await GET(new Request('http://local/api/admin/mon-espace/affaires'));
  return { status: r.status, corps: await r.json() as Record<string, unknown> };
};
const data = (c: Record<string, unknown>) => c.data as { ventes: Vente[]; compteurs: { compromis: { nb: number; ids: number[] }; actees: { nb: number; ids: number[] } }; titulaire: { administrateur: boolean } };

beforeEach(() => { h.ventes = [partagee, deMarc, deLea]; h.roles = { 1: 'administrateur' }; });

describe('🔴 GET /api/admin/mon-espace/affaires — le filtrage est fait par le SERVEUR', () => {
  it('compte sans droit : 403, aucune donnée', async () => {
    const r = await lire('refus');
    expect(r.status).toBe(403);
    expect(r.corps).not.toHaveProperty('data');
  });
  it('Léa ne reçoit JAMAIS la vente de Marc seul : ses ventes = la partagée et l’import rattaché', async () => {
    const r = await lire(5);
    expect(data(r.corps).ventes.map((v) => v.id)).toEqual([1, 3]);
    expect(JSON.stringify(r.corps)).not.toContain('DE MARC SEUL');
  });
  it('sur la vente partagée, l’objet JSON ne contient ni la commission ni le taux de l’autre', async () => {
    const lea = JSON.stringify((await lire(5)).corps);
    expect(lea).toContain('3111.11');
    expect(lea).not.toContain('2999.99');
    expect(lea).not.toContain('"taux":47');
    const marc = JSON.stringify((await lire(7)).corps);
    expect(marc).toContain('2999.99');
    expect(marc).not.toContain('3111.11');
    expect(marc).not.toContain('"taux":52');
  });
  it('administrateur : reçoit tout, tel quel', async () => {
    const r = await lire(1);
    expect(data(r.corps).titulaire.administrateur).toBe(true);
    expect(data(r.corps).ventes.map((v) => v.id)).toEqual([1, 2, 3]);
    const json = JSON.stringify(r.corps);
    expect(json).toContain('3111.11');
    expect(json).toContain('2999.99');
  });
  it('compte sans aucune vente : réponse vide, compteurs à zéro, sans erreur', async () => {
    const r = await lire(42);
    expect(r.status).toBe(200);
    expect(data(r.corps).ventes).toEqual([]);
    expect([data(r.corps).compteurs.compromis.nb, data(r.corps).compteurs.actees.nb]).toEqual([0, 0]);
  });
  it('jamais mise en cache', async () => {
    h.garde.mockResolvedValue({ auteurId: 5 });
    expect((await GET(new Request('http://local/api/admin/mon-espace/affaires'))).headers.get('cache-control')).toBe('private, no-store');
  });
});
