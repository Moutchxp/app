import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableSuivi, DetailSuiviRendu, AffectationBloc, SchemaEmpreinteSvg, LegendeAffectation, ActionsRattachement, LIBELLE_ETAT_SUIVI, libelleRegimeExpose, libelleVerdict, lienStreetView, libelleCritereSurface, libelleCritereBordure, libelleCritereBati, critereSurfaceDeclenche, critereBordureDeclenche, critereBatiDeclenche, EN_ATTENTE_MAJ, formatDateFr, SchemaPleinEcran, LegendeRepetesComplete, NOM_SCHEMA_ORIGINE, estToucheFermeture, indexFocusSuivant, restaurerFocus } from './SuiviRattachementRendu';
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { CritereSurface, CritereBordure } from '../../../../lib/permis/detectionRattachement';
import type { AffectationEtat } from '../../../../lib/permis/affectationRepo';
import { couleurRepere, repereDepuisIndex, PALETTE_REPERE, type SchemaEmpreinte } from '../../../../lib/permis/affectationSchema';

/**
 * FUS-3b — rendu PUR du suivi (renderToStaticMarkup, aucun DOM). Couvre : compteurs + groupes par état, tri par urgence,
 * ancienneté ; le tableau comparatif « trois sources » (dont « aucun bâtiment » et « sans objet »), critères et provenance.
 */
const ligne = (o: Partial<LigneSuivi>): LigneSuivi => ({ dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', type: 'PC', adresse: '5 rue de la Paix', natureTravaux: 'construction neuve', etat: 'suivi_aucun_signal', verdict: null, joursAnciennete: 3, derniereEvalIso: null, dateAutorisationIso: '2026-03-13', ...o });

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

  it('L1 — la date d’autorisation du permis est affichée (libellée), et une date absente le DIT (jamais un blanc)', () => {
    const lignes = [
      ligne({ dossierId: 1, etat: 'suivi_aucun_signal', dateAutorisationIso: '2025-08-27' }),
      ligne({ dossierId: 2, etat: 'suivi_aucun_signal', dateAutorisationIso: null }),
    ];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes, compteurs: compteurs({ suivi_aucun_signal: 2 }) }));
    expect(h).toContain('permis autorisé le 27/08/2025'); // format FR + libellé explicite
    expect(h).toContain('date d’autorisation inconnue');  // absence DITE, pas un blanc
    // la date d'arrivée NE doit PAS se confondre avec l'ancienneté (« suivi depuis… ») : les deux libellés coexistent, distincts.
    expect(h).toContain('suivi depuis');
  });
});

describe('L1 — formatDateFr (ISO → JJ/MM/AAAA, sans piège de fuseau)', () => {
  it('formate une date ISO ; null → vide ; entrée non ISO → renvoyée telle quelle', () => {
    expect(formatDateFr('2025-08-27')).toBe('27/08/2025');
    expect(formatDateFr('2026-03-13')).toBe('13/03/2026');
    expect(formatDateFr(null)).toBe('');
    expect(formatDateFr('pas une date')).toBe('pas une date');
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

describe('FUS-3d — schéma SVG + affectation polygone ↔ corps', () => {
  const schema = (o: Partial<SchemaEmpreinte> = {}): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 L10,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 L20,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
      { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 L60,80 Z', cx: 70, cy: 70, horsEmpreinte: false },
    ], ...o,
  });
  const aff = (o: Partial<AffectationEtat> = {}): AffectationEtat => ({
    empreinteFigee: true, motif: null, colonneManquante: false, schema: schema(),
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false }],
    corps: [
      { id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffecte: null },
      { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffecte: null },
    ], ...o,
  });

  it('SchemaEmpreinteSvg : dessine l’empreinte + un chemin étiqueté par polygone ; motif → texte, pas de <svg>', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema(), corps: aff().corps }));
    expect(h).toContain('<svg');
    expect(h).toContain('M10,10'); // empreinte
    expect(h).toContain('>A<'); expect(h).toContain('>B<'); // repères
    const hMotif = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema({ motif: 'empreinte incomplète ou absente', empreintePath: null, polygones: [] }), corps: [] }));
    expect(hMotif).not.toContain('<svg');
    expect(hMotif).toContain('empreinte incomplète ou absente');
  });

  it('DOSSIER PERSISTÉ — 2 corps / 2 polygones : chaque corps voit A et B ; polygones non affectés signalés', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff(), persiste: true }));
    expect(h).toContain('polygone A'); expect(h).toContain('polygone B');
    expect(h).toMatch(/Polygones non affectés — dans l’empreinte : A, B/); // rien affecté → A et B signalés (tous deux DANS l'empreinte)
  });

  it('EXCLUSIVITÉ : A affecté au corps 1 → n’est plus proposé au corps 2 (réversible côté corps 1)', () => {
    const a = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffecte: 'BAT_A' }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffecte: null }] });
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true }));
    expect(h).toContain('value="BAT_A"'); // sélection du corps 1
    expect(h).toMatch(/Polygones non affectés — dans l’empreinte : B/); // B reste non affecté → signalé
  });

  it('distinction HORS empreinte : le décompte sépare « dans l’empreinte » et « hors empreinte » (cohérent avec le schéma)', () => {
    const a = aff({
      schema: schema({ polygones: [
        { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
        { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: true },
      ] }),
      polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: true }],
    });
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true }));
    expect(h).toMatch(/dans l’empreinte : A ; hors empreinte : B/); // ← ne fond PLUS les 2 catégories en « A, B »
  });

  it('2 corps / 1 polygone (cardinalités inégales) : un corps peut rester « aucun »', () => {
    const a = aff({
      schema: schema({ polygones: [{ repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false }] }),
      polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }],
      corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffecte: 'BAT_A' }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffecte: null }],
    });
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true }));
    expect(h).toContain('aucun (bâtiment sans polygone)'); // le corps 2 peut rester sans polygone
    expect(h).not.toContain('Polygones non affectés'); // A est affecté → aucun polygone orphelin
  });

  it('GARDE D’AFFICHAGE — « aucun signal » (persiste=false) : PAS de sélecteur, mais l’explication est dite, et le schéma RESTE', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff(), persiste: false }));
    expect(h).toContain('<svg');                              // le schéma reste affiché (informatif)
    expect(h).toContain('Légende du schéma');                // la légende reste
    expect(h).toContain('Aucun signal de mise à jour');       // on DIT pourquoi (jamais de disparition muette)
    expect(h).not.toContain('<select');                       // aucun sélecteur d’affectation
    expect(h).not.toContain('Polygones non affectés');
  });

  it('DAACT « en attente du bâti » (persiste=true, enAttenteBati=true) : affectation FERMÉE + libellé explicite, schéma RESTE', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff(), persiste: true, enAttenteBati: true }));
    expect(h).toContain('<svg');                    // schéma toujours consultable
    expect(h).toContain('En attente du bâti');       // libellé explicite (SPEC B)
    expect(h).toContain('travaux sont déclarés terminés');
    expect(h).not.toContain('<select');              // affectation FERMÉE (on n'invente pas un polygone)
  });

  it('L2 — LÉGENDE : l’information ne dépend PAS de la seule couleur (repère écrit, contours vert/tireté, trame nommés)', () => {
    const h = renderToStaticMarkup(createElement(LegendeAffectation, {}));
    expect(h).toContain('couleur = repère du polygone'); // la couleur = identité ; le repère écrit reste la référence
    expect(h).toContain('affecté à un corps (contour vert)');
    expect(h).toContain('hors empreinte (contour tireté)');
    expect(h).toContain('hors parcelle (trame grise)');
    expect(h).toContain('dashed');          // le hors-empreinte est matérialisé par un contour tireté sur la puce
  });

  it('empreinte non figée → motif, pas de schéma ; migration 117 absente → avertissement + sélecteurs désactivés', () => {
    const hMotif = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff({ empreinteFigee: false, motif: 'empreinte non figée : affectation impossible', schema: { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: 'empreinte non figée : affectation impossible' }, polygones: [] }), persiste: true }));
    expect(hMotif).toContain('empreinte non figée : affectation impossible');
    const hCol = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff({ colonneManquante: true }), persiste: true }));
    expect(hCol).toContain('migration 117 non appliquée');
    expect(hCol).toContain('disabled');
  });
});

describe('FUS-3e — ActionsRattachement (les trois boutons)', () => {
  const noop = () => {};
  const props = (o: Record<string, unknown> = {}) => ({ avertissement: null, motifRefus: '', motifConfirmation: '', onMotifRefus: noop, onMotifConfirmation: noop, onValider: noop, onRefuser: noop, onRetour: noop, enCours: false, ...o });

  it('trois boutons distincts, libellés explicites ; refuser désactivé sans motif', () => {
    const h = renderToStaticMarkup(createElement(ActionsRattachement, props()));
    expect(h).toContain('Valider le rattachement');
    expect(h).toContain('Refuser le rattachement');
    expect(h).toContain('Retour aux caractéristiques LiDAR d’origine');
    expect(h).toMatch(/Refuser le rattachement<\/button>/); // présent
    // refuser désactivé quand motif vide
    expect(h).toMatch(/disabled[\s\S]*Refuser le rattachement/);
  });

  it('avertissement de cardinalité → champ de motif de confirmation + bouton « Confirmer » désactivé sans motif', () => {
    const h = renderToStaticMarkup(createElement(ActionsRattachement, props({ avertissement: '1 corps sans polygone : confirmez avec un motif.' })));
    expect(h).toContain('1 corps sans polygone');
    expect(h).toContain('Confirmer la validation (avec motif)');
    expect(h).toContain('aria-label="motif de validation malgré l’incohérence"');
    // confirmer désactivé tant que motifConfirmation vide
    expect(h).toMatch(/disabled[\s\S]*Confirmer la validation/);
    // avec motif de confirmation → activé
    const h2 = renderToStaticMarkup(createElement(ActionsRattachement, props({ avertissement: 'x', motifConfirmation: 'bâtiments accolés' })));
    expect(h2).not.toMatch(/disabled[^>]*>[\s\S]{0,40}Confirmer la validation/);
  });

  it('refuser ACTIVÉ dès qu’un motif est saisi', () => {
    const h = renderToStaticMarkup(createElement(ActionsRattachement, props({ motifRefus: 'parcelle erronée' })));
    expect(h).not.toMatch(/disabled[^>]*>[\s\S]{0,40}Refuser le rattachement/);
  });
});

describe('L2 — lisibilité du schéma (trame hors parcelle, parcelle blanche, palette par repère)', () => {
  const schema16 = (): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L300,10 L300,230 L10,230 Z', motif: null,
    polygones: Array.from({ length: 16 }, (_, i) => ({
      repere: repereDepuisIndex(i), cleabs: `BAT_${i}`,
      path: `M${20 + i},${20 + i} L${30 + i},${20 + i} L${30 + i},${30 + i} Z`, cx: 25 + i, cy: 25 + i, horsEmpreinte: false,
    })),
  });

  it('① trame grise DERRIÈRE (motif hachuré à 45°) + ② parcelle blanche PAR-DESSUS', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema16(), corps: [] }));
    expect(h).toContain('<pattern');                       // motif de trame défini
    expect(h).toContain('patternTransform="rotate(45)"');  // hachures à 45°
    expect(h).toMatch(/fill="url\(#trame-[^"]+\)"/);        // fond hors parcelle rempli par la trame
    expect(h).toContain('d="M10,10 L300,10 L300,230 L10,230 Z" fill="#fff"'); // parcelle blanche par-dessus
  });

  it('③ les 16 polygones (cas 07512024V0037) reçoivent 16 couleurs de palette DISTINCTES, aucune blanche', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema16(), corps: [] }));
    const attendues = Array.from({ length: 16 }, (_, i) => couleurRepere(i));
    for (const c of attendues) expect(h).toContain(`fill="${c}"`); // chaque repère A..P a SA couleur
    expect(new Set(attendues).size).toBe(16);                       // et elles sont toutes distinctes
    expect(h).not.toContain('fill="#ffffff"');                     // aucun polygone blanc (la parcelle utilise #fff, pas #ffffff)
    for (const c of PALETTE_REPERE) { const hex = c.toLowerCase(); expect(hex).not.toBe('#fff'); expect(hex).not.toBe('#ffffff'); }
  });

  it('le repère reste lisible : HALO blanc (paint-order) sous le glyphe, sur n’importe quelle couleur', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema16(), corps: [] }));
    expect(h).toContain('paint-order="stroke"'); // halo dessiné derrière le glyphe
    expect(h).toContain('>A<'); expect(h).toContain('>P<'); // 16e repère présent et étiqueté
  });

  it('affecté → contour VERT (canal non coloré, distinct de la teinte d’identité) ; hors empreinte → contour tireté', () => {
    const s: SchemaEmpreinte = {
      largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
      polygones: [
        { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
        { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: true },
      ],
    };
    const corps = [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffecte: 'BAT_A' }];
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: s, corps }));
    expect(h).toContain('stroke="var(--color-svv-green-ink)"'); // A affecté → contour vert
    expect(h).toContain('stroke-dasharray="3 2"');              // B hors empreinte → contour tireté
    expect(h).toContain(`fill="${couleurRepere(0)}"`);          // A garde SA couleur d'identité (le vert n'est qu'un contour)
  });
});

describe('L3 — plein écran, nom dans le visuel, légende complète, rattachement disponible', () => {
  const schemaAB = (): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
      { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: false },
    ],
  });
  const affL3 = (o: Partial<AffectationEtat> = {}): AffectationEtat => ({
    empreinteFigee: true, motif: null, colonneManquante: false, schema: schemaAB(),
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false }],
    corps: [
      { id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffecte: null },
      { id: 2, repere: '2D2', altitudeSommetNgf: 87, nbEtages: 7, cleabsAffecte: null },
    ], ...o,
  });
  const noop = () => {};

  it('helpers PURS : Échap ferme (en supplément du bouton) ; piège de focus circulaire ; focus rendu au déclencheur', () => {
    expect(estToucheFermeture('Escape')).toBe(true);
    expect(estToucheFermeture('Esc')).toBe(true);
    expect(estToucheFermeture('Tab')).toBe(false);
    // Tab → avant (enroulé), Shift+Tab → arrière (enroulé), index -1 (rien de focalisé) → premier/dernier
    expect([indexFocusSuivant(0, 3, false), indexFocusSuivant(2, 3, false), indexFocusSuivant(0, 3, true), indexFocusSuivant(-1, 3, false), indexFocusSuivant(-1, 3, true)]).toEqual([1, 0, 2, 0, 2]);
    expect(indexFocusSuivant(5, 0, false)).toBe(0);
    // focus RENDU au déclencheur (via un faux élément injecté — testable sans DOM) ; sûr si absent
    let rendu = false;
    restaurerFocus({ focus: () => { rendu = true; } });
    expect(rendu).toBe(true);
    expect(() => restaurerFocus(null)).not.toThrow();
  });

  it('② OUVERTURE : la vue réduite expose un déclencheur cliquable ET focalisable au clavier (role=button), avec le NOM dans le visuel', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: affL3(), persiste: true, onAgrandir: noop }));
    expect(h).toContain('role="button"');                        // cible ouvrable
    expect(h).toContain('tabindex="0"');                          // …au clavier, pas seulement à la souris
    expect(h).toContain('Agrandir le schéma en plein écran');     // aria-label explicite
    expect(h).toContain('⤢ Agrandir');                            // indice visible
    expect(h).toContain(NOM_SCHEMA_ORIGINE);                      // nom écrit DANS le visuel (figcaption)
    // sans onAgrandir : pas de déclencheur, mais le schéma reste présent (informatif)
    const hSans = renderToStaticMarkup(createElement(AffectationBloc, { affectation: affL3(), persiste: true }));
    expect(hSans).not.toContain('role="button"');
    expect(hSans).toContain('<svg');
  });

  it('① DIALOGUE : role=dialog + aria-modal + titre annoncé (aria-labelledby ↔ h2) + bouton Fermer explicite', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affL3(), persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('role="dialog"');
    expect(h).toContain('aria-modal="true"');
    const m = /aria-labelledby="([^"]+)"/.exec(h);
    expect(m).not.toBeNull();
    expect(h).toContain(`id="${m![1]}"`);                         // le titre annoncé existe réellement
    expect(h).toContain(NOM_SCHEMA_ORIGINE);                      // « Configuration d’origine »
    expect(h).toContain('Fermer');                                // bouton Fermer explicite (Échap est EN SUPPLÉMENT, testé plus haut)
    expect(h).toContain('<svg');                                  // le schéma agrandi prime
  });

  it('③ LÉGENDE COMPLÈTE en plein écran : liste les repères RÉELS (A, B…) avec leur couleur — pas une pastille générique', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affL3(), persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('>A</strong>'); expect(h).toContain('>B</strong>'); // repères réellement présents
    expect(h).toContain(`background:${couleurRepere(0)}`);        // couleur de A
    expect(h).toContain(`background:${couleurRepere(1)}`);        // couleur de B
    // légende directe : empreinte vide → message, jamais une pastille creuse
    const vide = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: null }, corps: [] }));
    expect(vide).toContain('Aucun polygone dans l’empreinte');
  });

  it('④ RATTACHEMENT en plein écran : les sélecteurs par corps sont là (c’est là qu’on arbitre)', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affL3(), persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('<select');
    expect(h).toContain('polygone A'); expect(h).toContain('polygone B');
  });

  it('ZÉRO duplication : le plein écran CONSOMME les mêmes règles (exclusivité + non-affectés) — il ne les réécrit pas', () => {
    // A affecté au corps 1 → règle d'exclusivité : A n'est plus une option ailleurs, et B est signalé non affecté.
    const a = affL3({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffecte: 'BAT_A' }, { id: 2, repere: '2D2', altitudeSommetNgf: 87, nbEtages: 7, cleabsAffecte: null }] });
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: a, persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('value="BAT_A"');                                   // sélection du corps 1 (réversible)
    expect(h).toMatch(/Polygones non affectés — dans l’empreinte : B/);      // MÊME sortie que polygonesNonAffectes/texteNonAffectes
  });

  it('mobile / garde d’affichage : « aucun signal » (persiste=false) → pas de sélecteur, mais le schéma et le dialogue restent', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affL3(), persiste: false, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('role="dialog"');
    expect(h).toContain('<svg');                       // schéma consultable
    expect(h).toContain('Aucun signal de mise à jour'); // on DIT pourquoi (jamais de disparition muette)
    expect(h).not.toContain('<select');                // pas d'arbitrage sans dossier
  });
});
