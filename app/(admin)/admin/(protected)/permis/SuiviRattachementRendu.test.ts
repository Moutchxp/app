import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableSuivi, DetailSuiviRendu, LIBELLE_ETAT_SUIVI, libelleRegimeExpose, libelleVerdict, lienStreetView, libelleCritereSurface, libelleCritereBordure, libelleCritereBati, critereSurfaceDeclenche, critereBordureDeclenche, critereBatiDeclenche, EN_ATTENTE_MAJ } from './SuiviRattachementRendu';
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { CritereSurface, CritereBordure } from '../../../../lib/permis/detectionRattachement';

/**
 * FUS-3b — rendu PUR du suivi (renderToStaticMarkup, aucun DOM). Couvre : compteurs + groupes par état, tri par urgence,
 * ancienneté ; le tableau comparatif « trois sources » (dont « aucun bâtiment » et « sans objet »), critères et provenance.
 */
const ligne = (o: Partial<LigneSuivi>): LigneSuivi => ({ dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', type: 'PC', adresse: '5 rue de la Paix', natureTravaux: 'construction neuve', etat: 'suivi_aucun_signal', verdict: null, joursAnciennete: 3, derniereEvalIso: null, ...o });

const detail = (o: Partial<DetailSuivi> = {}): DetailSuivi => ({
  dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', type: 'PC', adresse: '5 rue de la Paix', natureTravaux: 'construction neuve', etat: 'suivi_aucun_signal', persiste: false,
  verdict: 'RIEN', regime: 'sans_fusion', motif: 'aucun signal (en attente)',
  criteres: {
    surface: { applicable: false, ratio: null, seuil: 0.8, franchi: false },
    bordure: { applicable: false, part: null, seuil: 0.6, franchi: false },
    bati: { nbNouveauxOuModifies: 0, franchi: false },
  },
  seuils: { seuilSurface: 0.8, seuilBordure: 0.6, margeAltitudeM: 0.1 },
  seuilsProvenance: 'defaut', seuilsBrut: { surfacePct: 80, bordurePct: 60, margeAltitudeCm: 10 },
  millesimeCadastre: '2026-06-01', millesimeBati: '2026-03-20',
  comparatif: [
    { intitule: 'Surface de parcelle', enBase: { texte: '2631.5 m² déclarés', presente: true }, cadastre: { texte: '2885 m²', presente: true }, bdTopo: { texte: 'sans objet pour cette source', presente: false } },
    { intitule: 'Nombre de bâtiments', enBase: { texte: '2 corps déclarés', presente: true }, cadastre: { texte: 'sans objet pour cette source', presente: false }, bdTopo: { texte: 'aucun bâtiment dans l’empreinte', presente: true } },
  ],
  nbParcellesOrigine: 2, nbContoursEmpreinte: 1, streetView: { lat: 48.87, lng: 2.35 }, streetViewMotif: null, pieces: [],
  ...o,
});
const critSurface = (o: Partial<CritereSurface> = {}): CritereSurface => ({ applicable: true, ratio: 0.95, seuil: 0.8, franchi: true, ...o });
const critBordure = (o: Partial<CritereBordure> = {}): CritereBordure => ({ applicable: true, part: 0.88, seuil: 0.6, franchi: true, ...o });

describe('FUS-3b — libellés d’état', () => {
  it('libellés exacts (dont « suivi, aucun signal »)', () => {
    expect(LIBELLE_ETAT_SUIVI.suivi_aucun_signal).toBe('suivi, aucun signal');
    expect(LIBELLE_ETAT_SUIVI.arbitrage_demande).toBe('arbitrage demandé');
    expect(LIBELLE_ETAT_SUIVI.valide).toBe('rattaché');
  });
});

describe('FUS-3b — TableSuivi (compteurs, groupes, ancienneté)', () => {
  const compteurs = (o: Partial<Record<EtatSuivi, number>>): Record<EtatSuivi, number> =>
    ({ arbitrage_demande: 0, en_attente_bati: 0, annule_par_lidar: 0, valide: 0, refuse: 0, suivi_aucun_signal: 0, ...o });

  it('groupe par état, compte, et affiche l’ancienneté', () => {
    const lignes = [ligne({ dossierId: 2, etat: 'arbitrage_demande', joursAnciennete: 5, derniereEvalIso: '2026-08-11' }), ligne({ dossierId: 1, etat: 'suivi_aucun_signal', joursAnciennete: 3 })];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes, compteurs: { arbitrage_demande: 1, en_attente_bati: 0, annule_par_lidar: 0, valide: 0, refuse: 0, suivi_aucun_signal: 1 } }));
    expect(h).toContain('arbitrage demandé');
    expect(h).toContain('suivi, aucun signal');
    expect(h).toContain('en attente depuis 5 jours');
    expect(h).toContain('suivi depuis 3 jours');
    expect(h).toContain('évalué le 2026-08-11');
  });

  it('FUS-3c-ter — ligne repliée : n° + type + nature + adresse, et un BOUTON explicite (pas un clic sur la ligne)', () => {
    const lignes = [ligne({ dossierId: 1, etat: 'suivi_aucun_signal', type: 'PC', natureTravaux: 'construction neuve', adresse: '5 rue de la Paix' })];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes, ouvert: null, compteurs: { arbitrage_demande: 0, en_attente_bati: 0, annule_par_lidar: 0, valide: 0, refuse: 0, suivi_aucun_signal: 1 } }));
    expect(h).toContain('PC — construction neuve');
    expect(h).toContain('5 rue de la Paix');
    expect(h).toContain('Ouvrir le détail');
    const hOuvert = renderToStaticMarkup(createElement(TableSuivi, { lignes, ouvert: 1, compteurs: { arbitrage_demande: 0, en_attente_bati: 0, annule_par_lidar: 0, valide: 0, refuse: 0, suivi_aucun_signal: 1 } }));
    expect(hOuvert).toContain('Fermer le détail');
    expect(hOuvert).toContain('aria-expanded="true"');
  });

  it('univers vide → message explicite', () => {
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes: [], compteurs: compteurs({}) }));
    expect(h).toMatch(/Aucun permis suivi/);
  });
});

describe('FUS-3b — DetailSuiviRendu (comparatif trois sources + provenance)', () => {
  it('rend les trois colonnes, « aucun bâtiment », « sans objet », et la provenance des seuils', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(h).toContain('En base (permis)');
    expect(h).toContain('Cadastre');
    expect(h).toContain('BD TOPO');
    expect(h).toContain('aucun bâtiment dans l’empreinte');
    expect(h).toContain('sans objet pour cette source');
    expect(h).toContain('repli sur défaut'); // provenance defaut
    expect(h).toContain('cadastre 2026-06-01');
    expect(h).not.toContain('dérivé — aucun dossier en base'); // FUS-3c-ter : supprimé
    expect(h).toContain('5 rue de la Paix'); // remplacé par l'adresse
    expect(h).toContain('PC — construction neuve');
  });

  it('critères NON évaluables → statut d’ATTENTE (jamais « sans objet »), bâti 0 = attente aussi', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(h).not.toContain('sans objet (sans fusion)');
    expect(h).toContain('surface : en attente de la mise à jour du cadastre et de BD TOPO');
    expect(h).toContain('bordure : en attente de la mise à jour du cadastre et de BD TOPO');
    expect(h).toContain('aucun bâti nouveau ou modifié pour l’instant');
  });

  it('FUS-3c-quater — l’explication de bordure passe derrière un « i » (repliée par défaut, jamais supprimée)', () => {
    const h1 = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(h1).toContain('aria-label="détails sur la mesure de bordure"'); // le bouton « i » existe
    expect(h1).toContain('aria-expanded="false"');                          // replié par défaut
    expect(h1).not.toMatch(/limites EXTÉRIEURES des parcelles réunies/);    // l'explication n'est PAS affichée par défaut
    // même avec des contours disjoints, la note reste DANS le « i » (repliée), pas déversée sur le cartouche
    const h2 = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ nbContoursEmpreinte: 2 }) }));
    expect(h2).not.toContain('contours disjoints');
  });

  it('FUS-3c-quater — « Verdict : » restauré (RIEN compris), ligne de motif SUPPRIMÉE de l’affichage', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ motif: 'sans fusion cadastrale et aucun bâti nouveau : aucun signal (en attente)' }) }));
    expect(h).toContain('Verdict : ');
    expect(h).toContain('en attente de la mise à jour du cadastre et de BD TOPO');
    expect(h).not.toContain('sans fusion cadastrale et aucun bâti'); // motif retiré de l'écran (reste en base)
    expect(h).toContain('Critères comparatifs du moteur'); // titre renommé
  });

  it('FUS-3c-quater — un critère DÉCLENCHÉ passe en vert (couleur de succès), l’attente reste grise', () => {
    const declenche = detail({
      regime: 'avec_fusion', verdict: 'RATTACHEMENT_AUTOMATIQUE',
      criteres: {
        surface: { applicable: true, ratio: 0.95, seuil: 0.8, franchi: true },
        bordure: { applicable: true, part: 0.88, seuil: 0.6, franchi: true },
        bati: { nbNouveauxOuModifies: 1, franchi: true },
      },
    });
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: declenche }));
    expect(h).toContain('var(--color-svv-green-ink)'); // couleur de succès existante, pas une nouvelle
    expect(h).toContain('(seuil atteint)');            // libellé explicite SANS la couleur
    expect(h).toContain('détecté');
    // en attente → gris, pas de vert
    const attente = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(attente).not.toContain('var(--color-svv-green-ink)');
  });
});

describe('FUS-3c-bis — libellés de critères (attente + pourcentages)', () => {
  it('surface non applicable → attente ; applicable franchi → % mesuré + seuil ; non franchi → mention seuil non atteint', () => {
    expect(libelleCritereSurface(critSurface({ applicable: false }), 2)).toBe(EN_ATTENTE_MAJ);
    expect(libelleCritereSurface(critSurface(), 2)).toBe('95 % de l’empreinte (2 parcelles d’origine) — seuil 80 % (seuil atteint)');
    expect(libelleCritereSurface(critSurface({ ratio: 0.62, franchi: false }), 1)).toBe('62 % de l’empreinte (1 parcelle d’origine) — seuil 80 % (seuil non atteint)');
  });

  it('bordure : % de contour commun + seuil (atteint ou non) ; attente si non applicable', () => {
    expect(libelleCritereBordure(critBordure())).toBe('88 % de contour commun — seuil 60 % (seuil atteint)');
    expect(libelleCritereBordure(critBordure({ part: 0.4, franchi: false }))).toBe('40 % de contour commun — seuil 60 % (seuil non atteint)');
    expect(libelleCritereBordure(critBordure({ applicable: false }))).toBe(EN_ATTENTE_MAJ);
  });

  it('bâti : 0 = attente ; ≥1 = décompte DÉTECTÉ', () => {
    expect(libelleCritereBati({ nbNouveauxOuModifies: 0, franchi: false })).toMatch(/en attente de la mise à jour de BD TOPO/);
    expect(libelleCritereBati({ nbNouveauxOuModifies: 1, franchi: true })).toBe('1 polygone nouveau/modifié détecté');
    expect(libelleCritereBati({ nbNouveauxOuModifies: 3, franchi: true })).toBe('3 polygones nouveaux/modifiés détectés');
  });

  it('helpers « déclenché » : applicable+franchi (surface/bordure) ; bâti ≥ 1', () => {
    expect(critereSurfaceDeclenche(critSurface())).toBe(true);
    expect(critereSurfaceDeclenche(critSurface({ franchi: false }))).toBe(false);
    expect(critereSurfaceDeclenche(critSurface({ applicable: false }))).toBe(false);
    expect(critereBordureDeclenche(critBordure({ franchi: false }))).toBe(false);
    expect(critereBatiDeclenche({ nbNouveauxOuModifies: 0, franchi: false })).toBe(false);
    expect(critereBatiDeclenche({ nbNouveauxOuModifies: 2, franchi: true })).toBe(true);
  });
});

describe('FUS-3c/3c-ter — régime (n’affirme que le certain), verdict, Street View', () => {
  it('libelleRegimeExpose : 1 parcelle = certitude ; 2+ sans fusion = INDÉTERMINÉE (jamais « sans fusion ») ; fusion constatée ; empreinte incomplète', () => {
    expect(libelleRegimeExpose('sans_fusion', 1)).toBe('sans fusion de parcelles possible (une seule parcelle)');
    expect(libelleRegimeExpose('sans_fusion', 2)).toBe('fusion de parcelles : indéterminée — en attente de la mise à jour du cadastre');
    expect(libelleRegimeExpose('sans_fusion', 2)).not.toMatch(/sans fusion/); // ne conclut pas
    expect(libelleRegimeExpose('avec_fusion', 3)).toBe('fusion de parcelles constatée');
    expect(libelleRegimeExpose('indetermine', 2)).toMatch(/indéterminée — empreinte incomplète/);
  });

  it('libelleVerdict : RIEN → attente ; les vrais verdicts gardent un libellé lisible', () => {
    expect(libelleVerdict('RIEN')).toBe('en attente de la mise à jour du cadastre et de BD TOPO');
    expect(libelleVerdict('RATTACHEMENT_AUTOMATIQUE')).toBe('rattachement automatique');
    expect(libelleVerdict('ARBITRAGE_DEMANDE')).toBe('arbitrage demandé');
  });

  it('lienStreetView : URL pano au viewpoint, sans clé API', () => {
    expect(lienStreetView(48.87, 2.35)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=48.87,2.35');
  });

  it('DetailSuiviRendu : « Verdict : en attente… » ; 2 parcelles sans fusion → indéterminée ; Street View + consigne courte', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail() }));
    expect(h).toContain('Verdict : ');                // FUS-3c-quater : étiquette restaurée
    expect(h).toContain('en attente de la mise à jour du cadastre et de BD TOPO');
    expect(h).toContain('fusion de parcelles : indéterminée — en attente de la mise à jour du cadastre');
    expect(h).not.toContain('fusion de parcelles attendue'); // plus d'affirmation prédictive
    expect(h).toContain('map_action=pano&amp;viewpoint=48.87,2.35');
    expect(h).toMatch(/Vérifier la date de la prise de vue/); // consigne courte (l'explication est derrière un « i »)
  });

  it('DetailSuiviRendu : une seule parcelle → « sans fusion de parcelles possible »', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ nbParcellesOrigine: 1 }) }));
    expect(h).toContain('sans fusion de parcelles possible (une seule parcelle)');
  });

  it('DetailSuiviRendu : empreinte absente → pas de lien Street View mais le motif', () => {
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ streetView: null, streetViewMotif: 'empreinte incomplète ou non figée' }) }));
    expect(h).not.toContain('map_action=pano');
    expect(h).toMatch(/Pas de lien Street View : empreinte incomplète ou non figée/);
  });
});
