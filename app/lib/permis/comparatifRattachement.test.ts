import { describe, it, expect } from 'vitest';
import { construireComparatif, type DonneesComparatif } from './comparatifRattachement';

/**
 * FUS-3b — le tableau comparatif « trois sources » : chaque source qui ne porte pas une grandeur le DIT (« sans objet »),
 * une donnée manquante le DIT aussi (« non renseigné ») ; jamais de cellule vide muette.
 */
const base = (o: Partial<DonneesComparatif> = {}): DonneesComparatif => ({
  surfaceParcelleDeclareeM2: 2631.5, nbCorps: 2, etagesCorps: [7, 7], altitudesCorps: [88.91, 87.13],
  destinationsPermis: ['logement'], sousSolsCorps: [1, 1], stationnementPermis: 12,
  nbParcellesCadastre: 2, surfaceCadastraleM2: 2885, surfaceCadastralePostgisM2: 2885.3,
  empreinteFigee: true, nbBatimentsBdTopo: 0, etagesBdTopo: [], altitudesToitBdTopo: [], usagesBdTopo: [], ...o,
});

const ligne = (rows: ReturnType<typeof construireComparatif>, intitule: string) => rows.find((r) => r.intitule === intitule)!;

describe('construireComparatif', () => {
  it('surface : EN BASE déclarée, CADASTRE contenance+ST_Area, BD TOPO sans objet', () => {
    const r = ligne(construireComparatif(base()), 'Surface de parcelle');
    expect(r.enBase).toMatchObject({ presente: true });
    expect(r.enBase.texte).toMatch(/2631\.5 m² déclarés/);
    expect(r.cadastre.texte).toMatch(/2885 m².*ST_Area 2885\.3.*2 parcelles/);
    expect(r.bdTopo).toEqual({ texte: 'sans objet pour cette source', presente: false });
  });

  it('terrain nu (empreinte figée, 0 bâtiment) : BD TOPO « aucun bâtiment » mesuré, listes bâti « sans objet »', () => {
    const rows = construireComparatif(base());
    expect(ligne(rows, 'Nombre de bâtiments').bdTopo).toEqual({ texte: 'aucun bâtiment dans l’empreinte', presente: true });
    expect(ligne(rows, 'Étages').bdTopo.presente).toBe(false);
    expect(ligne(rows, 'Altitudes (sommet permis / toit BD TOPO, NGF)').bdTopo.texte).toBe('sans objet pour cette source');
  });

  it('empreinte NON figée → BD TOPO entièrement « sans objet » (nb bâtiments compris)', () => {
    const rows = construireComparatif(base({ empreinteFigee: false }));
    expect(ligne(rows, 'Nombre de bâtiments').bdTopo.presente).toBe(false);
  });

  it('bâtiments BD TOPO présents : étages/altitudes listés ; étages tous nuls → « renseigné pour aucun »', () => {
    const rows = construireComparatif(base({ nbBatimentsBdTopo: 2, etagesBdTopo: [null, null], altitudesToitBdTopo: [42.5, 40.1], usagesBdTopo: ['Résidentiel', 'Résidentiel'] }));
    expect(ligne(rows, 'Étages').bdTopo.texte).toMatch(/renseigné pour aucun des 2/);
    expect(ligne(rows, 'Altitudes (sommet permis / toit BD TOPO, NGF)').bdTopo.texte).toMatch(/42\.5 m · 40\.1 m/);
    expect(ligne(rows, 'Destinations').bdTopo.texte).toBe('Résidentiel'); // dédoublonné
  });

  it('EN BASE : liste partielle d’étages (un seul renseigné sur deux) le signale', () => {
    const r = ligne(construireComparatif(base({ etagesCorps: [7, null] })), 'Étages');
    expect(r.enBase.texte).toMatch(/7 ét\. \(sur 2\)/);
  });

  it('valeurs EN BASE manquantes → « non renseigné », jamais vide', () => {
    const rows = construireComparatif(base({ surfaceParcelleDeclareeM2: null, destinationsPermis: null, stationnementPermis: null }));
    expect(ligne(rows, 'Surface de parcelle').enBase).toMatchObject({ presente: false, texte: 'non renseigné' });
    expect(ligne(rows, 'Destinations').enBase.texte).toBe('non renseigné');
    expect(ligne(rows, 'Stationnement').enBase.texte).toBe('non renseigné');
  });

  it('cadastre non rattaché → le DIT explicitement', () => {
    expect(ligne(construireComparatif(base({ surfaceCadastraleM2: null })), 'Surface de parcelle').cadastre.texte).toMatch(/non rattachée au cadastre/);
  });
});
