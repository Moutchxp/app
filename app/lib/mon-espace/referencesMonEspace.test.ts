import { describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (05/11/2026, PRODUCTION) — la réponse des références du formulaire de compromis de « Mon espace » porte TOUJOURS ses quatre listes,
 * en tableaux : `negociateurs`, `apporteurs`, `collegues`, `personnes`. Les deux dernières avaient glissé dans un commentaire (lots D29 / D38) :
 * absentes de la réponse, elles faisaient tomber la page au choix du côté. Dépôts simulés : aucune base.
 */
vi.mock('../admin/schemaDroits', () => ({ mandatDisponible: async () => true, personneTypeDisponible: async () => true, prixVenteDisponible: async () => true,
  repartitionDisponible: async () => true, uniteCommissionDisponible: async () => true }));
vi.mock('../transaction/repo', () => ({
  lireNegociateurs: async () => [{ id: 5, nom: 'Léa', societe: 'criterimmo', actif: true }, { id: 6, nom: 'Parti', societe: 'macj', actif: false }],
  lirePeriodesSociete: async () => new Map(), lireVentes: async () => [], enregistrerDossier: vi.fn(),
}));
vi.mock('./apporteursRepo', () => ({ lireMesApporteurs: async () => ({
  apporteurs: [{ id: 1, fiche: { nom: 'DURAND', statutTva: 'particulier' }, recherche: 'durand', libelle: 'DURAND', interne: false }],
  collegues: [{ id: 5, libelle: 'Léa MARTIN' }] }) }));
vi.mock('./compteRepo', () => ({ estAdministrateur: async () => false }));
vi.mock('../db/client', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
const { referencesMonEspace } = await import('./creationRepo');

describe('🔴 les références de « Mon espace » : les quatre listes, toujours', () => {
  it('negociateurs (actifs), apporteurs, collegues ET personnes — des tableaux', async () => {
    const r = await referencesMonEspace(5, false, '2026-11-05');
    for (const cle of ['negociateurs', 'apporteurs', 'collegues', 'personnes']) expect(Array.isArray(r[cle]), cle).toBe(true);
    expect(r.collegues).toEqual([{ id: 5, libelle: 'Léa MARTIN' }]);
    expect(r.personnes).toEqual([]);
    expect((r.negociateurs as { id: number }[]).map((n) => n.id)).toEqual([5]);
  });
});
