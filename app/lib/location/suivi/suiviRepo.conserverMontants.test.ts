import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (23/10/2026) — la feuille du mois corrige une ligne sans toucher au taux ni au montant d'apporteur : la valeur EXACTE
 * en base (ex. 64,362 repris du fichier, `=E8*10%`) reste — jamais arrondie par une autre correction ; le contrôle au centime
 * du fichier en dépend. Base simulée : rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
const appels: { sql: string; params: unknown[] }[] = [];
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  appels.push({ sql: sql.replace(/\s+/g, ' '), params });
  if (sql.includes('FOR UPDATE')) return { rows: [{ apporteur_id: '4' }] };
  if (sql.includes('FROM gestion_location_apporteur a')) return { rows: [{ archive: false, rattache: true }] };
  return { rows: [] };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { modifierActivite } = await import('./suiviRepo');

const auteur = { id: 5, libelle: 'Jean-Baptiste PONS' };
const champs = { origineContact: 'apporteur', apporteurId: 4, apporteurTaux: '10', commissionApporteur: '64,36', primeMode: 'aucune' };
const miseAJour = () => appels.find((a) => a.sql.startsWith(' UPDATE gestion_location_activite') || a.sql.startsWith('UPDATE gestion_location_activite'))!;

beforeEach(() => { appels.length = 0; });

describe('🔴 modifier-activite — les montants non touchés gardent leur valeur exacte', () => {
  it('conserverMontants : taux et montant gardés en base (colonnes reprises telles quelles)', async () => {
    expect(await modifierActivite(12, { ...champs, conserverMontants: true }, auteur)).toEqual({ etat: 'ok' });
    const u = miseAJour();
    expect(u.sql).toContain('WHEN $11::boolean THEN apporteur_taux');
    expect(u.sql).toContain('CASE WHEN $11::boolean THEN apporteur_commission_saisie ELSE $7 END');
    expect(u.params[10]).toBe(true);
  });

  it('sans conserverMontants : la nouvelle valeur (au centime) est écrite', async () => {
    await modifierActivite(12, { ...champs, commissionApporteur: '70,13' }, auteur);
    const u = miseAJour();
    expect(u.params[10]).toBe(false);
    expect(u.params[6]).toBe(70.13);
  });

  it('un AUTRE apporteur choisi : l’ancien montant n’est pas gardé', async () => {
    await modifierActivite(12, { ...champs, apporteurId: 7, conserverMontants: true }, auteur);
    expect(miseAJour().params[10]).toBe(false);
  });
});
