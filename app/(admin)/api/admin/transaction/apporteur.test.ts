import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 TUILE « TRANSACTION », LOT AC (Arno, 29/10/2026) — créer un apporteur depuis le choix de l'apporteur d'un compromis : la route passe par
 * `creerApporteur` de la Location (le MÊME annuaire, `gestion_location_apporteur` : aucune copie, un nom déjà pris refusé), son taux daté du
 * jour ; les références portent la recherche de chaque apporteur et les collègues. Dépôts simulés : rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/transaction/garde', () => ({ exigerTransaction: async () => ({ auteurId: 2 }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
vi.mock('../../../../lib/transaction/repo', () => ({ transactionDisponible: async () => true, lireNegociateurs: async () => [], lirePersonnes: async () => [] }));
vi.mock('../../../../lib/admin/schemaDroits', () => ({ annulationDisponible: async () => true, interCabinetDisponible: async () => true, prixVenteDisponible: async () => true,
  repartitionDisponible: async () => true, uniteCommissionDisponible: async () => true }));
vi.mock('../../../../lib/transaction/locationLue', () => ({ lireCaLocation: async () => ({}) }));
const h = vi.hoisted(() => ({ creer: vi.fn() }));
vi.mock('../../../../lib/location/suivi/suiviRepo', () => ({
  creerApporteur: h.creer,
  lireApporteurs: async () => [{ id: 16, nom: 'Gardien Dacquet', nomFamille: 'Dacquet', prenom: 'Gardien', type: 'partenaire', societe: 'Foncia Puteaux', telephone: '06 11 22 33 44', email: null, archive: false },
    { id: 9, nom: 'Ancien', type: 'partenaire', archive: true }],
  lireComptesInterface: async () => [{ id: 2, libelle: 'Arnaud Jorel', actif: true }, { id: 5, libelle: 'Jean-Baptiste PONS', actif: true }],
}));
const { GET, POST } = await import('./route');
const post = (corps: unknown) => POST(new Request('http://x/api/admin/transaction', { method: 'POST', body: JSON.stringify(corps) }));
beforeEach(() => { h.creer.mockReset(); });

describe('🔴 LOT AC — l’apporteur d’affaires depuis la Transaction', () => {
  it('les références : chaque apporteur (non archivé) avec son libellé de l’annuaire et sa recherche (nom, prénom, société, téléphone) ; les collègues', async () => {
    const d = (await (await GET(new Request('http://x/api/admin/transaction?vue=references'))).json()).data;
    expect(d.apporteurs).toEqual([{ id: 16, nom: 'Gardien Dacquet', libelle: 'DACQUET Gardien', recherche: 'Gardien Dacquet ; Dacquet ; Gardien ; Foncia Puteaux ; 06 11 22 33 44' }]);
    expect(d.collegues).toEqual([{ id: 2, libelle: 'Arnaud Jorel', actif: true }, { id: 5, libelle: 'Jean-Baptiste PONS', actif: true }]);
  });
  it('« apporteur-creer » : le MÊME annuaire que la Location (`creerApporteur`), daté du jour, origine « transaction » ; l’id créé est rendu', async () => {
    h.creer.mockResolvedValue({ etat: 'ok', data: { id: 31 } });
    const r = await post({ action: 'apporteur-creer', apporteur: { nom: 'Léa Dupont', type: 'partenaire', taux: '', interne: false, collegueId: 5, societe: 'Agence du Parc' } });
    expect(await r.json()).toEqual({ etat: 'ok', data: { id: 31 } });
    const [brut, auteur] = h.creer.mock.calls[0];
    expect(brut).toMatchObject({ nom: 'Léa Dupont', collegueId: 5, societe: 'Agence du Parc', origine: 'transaction' });
    expect(brut.depuis).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(auteur).toEqual({ id: 2, libelle: 'a.jorel@sansvisavis.com' });
  });
  it('un homonyme (nom déjà pris) : le refus de l’annuaire est rendu tel quel (422), rien n’est créé', async () => {
    h.creer.mockResolvedValue({ etat: 'refus', motif: 'L’apporteur « Gardien Dacquet » existe déjà.' });
    const r = await post({ action: 'apporteur-creer', apporteur: { nom: 'Gardien Dacquet', collegueId: 5 } });
    expect(r.status).toBe(422);
    expect((await r.json()).motif).toBe('L’apporteur « Gardien Dacquet » existe déjà.');
  });
});
