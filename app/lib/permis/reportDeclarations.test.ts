import { describe, it, expect } from 'vitest';
import { decisionReportDeclarations, CHAMPS_REPORTABLES, CHAMPS_INFORMATIFS_SEULS, type EtatChampCourant, type ChampReportable } from './reportDeclarations';
import type { DeclarationsRecapCerfa } from './recapCerfa';

const DECL: DeclarationsRecapCerfa = {
  dateDepot: '04/11/2025', superficieTerrainM2: 5015, logementsTotal: 67, logementsIndividuels: 0, logementsCollectifs: 67,
  niveauxDessusSol: 5, niveauxDessousSol: 1, stationnementAvant: 0, stationnementApres: 49, empriseAuSolCreeeM2: 1354,
  surfacePlancherTotaleM2: 4994, descriptionProjet: null, decompte: null, absents: [], ambigus: [], present: true,
};
const vide: EtatChampCourant = { valeur: null, origine: null, proprietaire: null };
const etatVide = (): Record<ChampReportable, EtatChampCourant> => ({ nbLogements: { ...vide }, nbPlacesStationnement: { ...vide }, surfacePlancherM2: { ...vide } });

describe('decisionReportDeclarations — remplit les champs VIDES depuis les déclarations', () => {
  it('les 3 champs reportables VIDES reçoivent la valeur déclarée', () => {
    const r = decisionReportDeclarations(DECL, etatVide());
    expect(r).toEqual([
      { cle: 'nbLogements', colonne: 'nb_logements', valeur: 67 },
      { cle: 'nbPlacesStationnement', colonne: 'nb_places_stationnement', valeur: 49 },
      { cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', valeur: 4994 },
    ]);
  });

  it('une déclaration absente (null) ne reporte rien pour ce champ', () => {
    const r = decisionReportDeclarations({ ...DECL, stationnementApres: null }, etatVide());
    expect(r.map((x) => x.cle)).toEqual(['nbLogements', 'surfacePlancherM2']); // stationnement sauté
  });
});

describe('decisionReportDeclarations — GARDES de précédence (recap = méthode la plus faible)', () => {
  it('🔴 un champ SAISIE (la main) n’est JAMAIS écrasé', () => {
    const etat = etatVide();
    etat.nbLogements = { valeur: 12, origine: 'saisie', proprietaire: null }; // saisie n'est jamais journalisée → proprietaire null
    const r = decisionReportDeclarations(DECL, etat);
    expect(r.map((x) => x.cle)).not.toContain('nbLogements');
    expect(r.map((x) => x.cle)).toEqual(['nbPlacesStationnement', 'surfacePlancherM2']);
  });

  it('un champ occupé par une méthode SUPÉRIEURE (cerfa) n’est pas écrasé', () => {
    const etat = etatVide();
    etat.surfacePlancherM2 = { valeur: 4994, origine: 'extraite', proprietaire: 'cerfa' };
    const r = decisionReportDeclarations(DECL, etat);
    expect(r.map((x) => x.cle)).not.toContain('surfacePlancherM2');
  });

  it('un champ déjà détenu par RECAP est ré-écrit (idempotence), pas considéré comme occupé', () => {
    const etat = etatVide();
    etat.nbLogements = { valeur: 67, origine: 'extraite', proprietaire: 'recap' };
    const r = decisionReportDeclarations(DECL, etat);
    expect(r.map((x) => x.cle)).toContain('nbLogements');
  });
});

describe('reportDeclarations — correspondance champ par champ', () => {
  it('les 3 champs reportables ciblent des colonnes de caractéristique NON ambiguës', () => {
    expect(CHAMPS_REPORTABLES.map((c) => `${c.cle}→${c.colonne}`)).toEqual([
      'nbLogements→nb_logements', 'nbPlacesStationnement→nb_places_stationnement', 'surfacePlancherM2→surface_plancher_m2',
    ]);
  });
  it('les champs sans destination sont listés comme informatifs, avec leur motif', () => {
    const libelles = CHAMPS_INFORMATIFS_SEULS.map((c) => c.libelle);
    expect(libelles).toContain('Niveaux du bâtiment le plus élevé'); // par bâtiment, attribution non établie → informatif
    expect(libelles).toContain('Emprise au sol créée');
    expect(CHAMPS_INFORMATIFS_SEULS.every((c) => c.motif.length > 0)).toBe(true);
  });
});
