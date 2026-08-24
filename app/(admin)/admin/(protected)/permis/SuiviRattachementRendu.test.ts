import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableSuivi, DetailSuiviRendu, AffectationBloc, SchemaEmpreinteSvg, LegendeAffectation, ActionsRattachement, SaisieCotesInjection, OuvertureManuelle, BandeauOuvertureManuelle, LIBELLE_ETAT_SUIVI, libelleRegimeExpose, libelleVerdict, lienStreetView, libelleCritereSurface, libelleCritereBordure, libelleCritereBati, critereSurfaceDeclenche, critereBordureDeclenche, critereBatiDeclenche, EN_ATTENTE_MAJ, formatDateFr, SchemaPleinEcran, LegendeRepetesComplete, NOM_SCHEMA_ORIGINE, estToucheFermeture, indexFocusSuivant, restaurerFocus, descriptionSchemaOrigine, ComparaisonPleinEcran, NOM_SCHEMA_NOUVELLE, descriptionSchemaNouvelle } from './SuiviRattachementRendu';
import type { LigneSuivi, DetailSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { CritereSurface, CritereBordure } from '../../../../lib/permis/detectionRattachement';
import type { AffectationEtat } from '../../../../lib/permis/affectationRepo';
import { couleurRepere, repereDepuisIndex, PALETTE_REPERE, type SchemaEmpreinte } from '../../../../lib/permis/affectationSchema';
import { lignesBulle, InterrupteurReperes, InterrupteurFuturBati, estFuturBati, libelleEtatBati } from './SuiviRattachementRendu';
import type { AttributsPolygone } from '../../../../lib/permis/affectationSchema';

/**
 * FUS-3b — rendu PUR du suivi (renderToStaticMarkup, aucun DOM). Couvre : compteurs + groupes par état, tri par urgence,
 * ancienneté ; le tableau comparatif « trois sources » (dont « aucun bâtiment » et « sans objet »), critères et provenance.
 */
const ligne = (o: Partial<LigneSuivi>): LigneSuivi => ({ dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', type: 'PC', adresse: '5 rue de la Paix', natureTravaux: 'construction neuve', etat: 'suivi_aucun_signal', verdict: null, joursAnciennete: 3, derniereEvalIso: null, dateAutorisationIso: '2026-03-13', dateDeclenchementIso: null, ...o });

const detail = (o: Partial<DetailSuivi> = {}): DetailSuivi => ({
  dossierId: 1, numDau: '07512025V0035', commune: 'Paris', codeInsee: '75112', type: 'PC', adresse: '5 rue de la Paix', natureTravaux: 'construction neuve', etat: 'suivi_aucun_signal', persiste: false,
  origineOuverture: 'detection', motifOuverture: null,
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
    { intitule: 'Nombre de bâtiments', enBase: { texte: '2 corps déclarés', presente: true }, cadastre: { texte: 'sans objet pour cette source', presente: false }, bdTopo: { texte: 'aucun bâtiment dans la parcelle du permis', presente: true } },
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

describe('FUS-3b / L6 — TableSuivi (deux groupes, ancienneté)', () => {
  it('chaque ligne porte son badge d’état + l’ancienneté', () => {
    const lignes = [ligne({ dossierId: 2, etat: 'arbitrage_demande', joursAnciennete: 5, derniereEvalIso: '2026-08-11' }), ligne({ dossierId: 1, etat: 'suivi_aucun_signal', joursAnciennete: 3 })];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes }));
    expect(h).toContain('arbitrage demandé');
    expect(h).toContain('suivi, aucun signal');
    expect(h).toContain('en attente depuis 5 jours');
    expect(h).toContain('suivi depuis 3 jours');
    expect(h).toContain('évalué le 2026-08-11');
  });

  it('FUS-3c-ter — ligne repliée : n° + type + nature + adresse, et un BOUTON explicite (pas un clic sur la ligne)', () => {
    const lignes = [ligne({ dossierId: 1, etat: 'suivi_aucun_signal', type: 'PC', natureTravaux: 'construction neuve', adresse: '5 rue de la Paix' })];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes, ouvert: null }));
    expect(h).toContain('PC — construction neuve');
    expect(h).toContain('5 rue de la Paix');
    expect(h).toContain('Ouvrir le détail');
    const hOuvert = renderToStaticMarkup(createElement(TableSuivi, { lignes, ouvert: 1 }));
    expect(hOuvert).toContain('Fermer le détail');
    expect(hOuvert).toContain('aria-expanded="true"');
  });

  it('univers vide → message explicite', () => {
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes: [] }));
    expect(h).toMatch(/Aucun permis suivi/);
  });

  it('L6 — DEUX groupes distincts, groupe 1 en tête ; le GROUPE 1 vide est DIT explicitement (pas d’écran incomplet)', () => {
    // Aucun « à faire » aujourd'hui → groupe 1 vide + mention ; le reste va dans le groupe 2.
    const hVide = renderToStaticMarkup(createElement(TableSuivi, { lignes: [ligne({ dossierId: 1, etat: 'suivi_aucun_signal' })] }));
    expect(hVide).toContain('Rattachement à faire');
    expect(hVide).toContain('Aucun rattachement à faire pour l’instant');
    expect(hVide).toContain('En attente d’une mise à jour');
    // Un dossier à arbitrer → il apparaît dans le groupe 1, EN TÊTE du groupe 2.
    const lignes = [ligne({ dossierId: 9, etat: 'arbitrage_demande', dateDeclenchementIso: '2026-08-20' }), ligne({ dossierId: 1, etat: 'suivi_aucun_signal', dateAutorisationIso: '2026-01-01' })];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes }));
    expect(h.indexOf('Rattachement à faire')).toBeLessThan(h.indexOf('En attente d’une mise à jour')); // groupe 1 au-dessus
    expect(h).not.toContain('Aucun rattachement à faire pour l’instant'); // groupe 1 non vide → pas la mention
    expect(h).toContain('déclenché le 20/08/2026'); // ligne du groupe 1 : date de DÉCLENCHEMENT
  });

  it('L6/L1 — groupe 2 : date d’AUTORISATION du permis (libellée) ; absence DITE ; date de déclenchement inconnue dans le groupe 1', () => {
    const lignes = [
      ligne({ dossierId: 1, etat: 'suivi_aucun_signal', dateAutorisationIso: '2025-08-27' }),
      ligne({ dossierId: 2, etat: 'suivi_aucun_signal', dateAutorisationIso: null }),
      ligne({ dossierId: 3, etat: 'arbitrage_demande', dateDeclenchementIso: null }),
    ];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes }));
    expect(h).toContain('permis autorisé le 27/08/2025'); // groupe 2 : date de permis
    expect(h).toContain('date d’autorisation inconnue');   // absence DITE, pas un blanc
    expect(h).toContain('date de déclenchement inconnue'); // groupe 1 sans detecte_le → dit inconnu, jamais un blanc
    expect(h).toContain('suivi depuis'); // l'ancienneté coexiste, distincte de la date de critère
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
    expect(h).toContain('aucun bâtiment dans la parcelle du permis');
    expect(h).toContain('sans objet pour cette source');
    expect(h).toContain('repli sur défaut'); // provenance defaut
    expect(h).toContain('cadastre 2026-06-01');
    expect(h).not.toContain('dérivé — aucun dossier en base'); // FUS-3c-ter : supprimé
    expect(h).toContain('5 rue de la Paix'); // remplacé par l'adresse
    expect(h).toContain('PC — construction neuve');
  });

  it('L8 — millésime bâti = valeur du registre affichée ; MILLESIME_INCONNU (null) → « non renseigné », jamais un blanc ni le proxy ; cadastre inchangé', () => {
    const hVal = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ millesimeBati: '2026-06-15', millesimeCadastre: '2026-06-01' }) }));
    expect(hVal).toContain('bâti 2026-06-15');   // la valeur du registre (autorité)
    expect(hVal).toContain('cadastre 2026-06-01'); // cadastre inchangé (son autorité)
    const hInconnu = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ millesimeBati: null, millesimeCadastre: '2026-06-01' }) }));
    expect(hInconnu).toContain('bâti non renseigné'); // registre absent → dit explicitement
    expect(hInconnu).not.toMatch(/bâti\s+—/);         // jamais un tiret muet pour le bâti
    expect(hInconnu).toContain('cadastre 2026-06-01'); // le cadastre garde son rendu
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
    expect(libelleCritereSurface(critSurface(), 2)).toBe('95 % de la parcelle du permis (2 parcelles d’origine) — seuil 80 % (seuil atteint)');
    expect(libelleCritereSurface(critSurface({ ratio: 0.62, franchi: false }), 1)).toBe('62 % de la parcelle du permis (1 parcelle d’origine) — seuil 80 % (seuil non atteint)');
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
    expect(libelleRegimeExpose('indetermine', 2)).toMatch(/indéterminée — parcelle du permis incomplète/);
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
    const h = renderToStaticMarkup(createElement(DetailSuiviRendu, { detail: detail({ streetView: null, streetViewMotif: 'parcelle du permis incomplète ou non figée' }) }));
    expect(h).not.toContain('map_action=pano');
    expect(h).toMatch(/Pas de lien Street View : parcelle du permis incomplète ou non figée/);
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
      { id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: [] },
      { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: [] },
    ], ...o,
  });

  it('SchemaEmpreinteSvg : dessine l’empreinte + un chemin étiqueté par polygone ; motif → texte, pas de <svg>', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema(), corps: aff().corps }));
    expect(h).toContain('<svg');
    expect(h).toContain('M10,10'); // empreinte
    expect(h).toContain('>A<'); expect(h).toContain('>B<'); // repères
    const hMotif = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema({ motif: 'parcelle du permis incomplète ou absente', empreintePath: null, polygones: [] }), corps: [] }));
    expect(hMotif).not.toContain('<svg');
    expect(hMotif).toContain('parcelle du permis incomplète ou absente');
  });

  it('DOSSIER PERSISTÉ — 2 corps / 2 polygones : chaque corps voit A et B ; polygones non affectés signalés', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff(), persiste: true }));
    expect(h).toContain('polygone A'); expect(h).toContain('polygone B');
    expect(h).toMatch(/Polygones non affectés — dans la parcelle : A, B/); // rien affecté → A et B signalés (tous deux DANS l'empreinte)
  });

  it('EXCLUSIVITÉ : A affecté au corps 1 → n’est plus proposé au corps 2 (réversible côté corps 1)', () => {
    const a = aff({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: [] }] });
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true }));
    expect(h).toContain('value="BAT_A"'); // sélection du corps 1
    expect(h).toMatch(/Polygones non affectés — dans la parcelle : B/); // B reste non affecté → signalé
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
    expect(h).toMatch(/dans la parcelle : A ; débordant de la parcelle : B/); // ← ne fond PLUS les 2 catégories en « A, B »
  });

  it('2 corps / 1 polygone (cardinalités inégales) : un corps peut rester « aucun »', () => {
    const a = aff({
      schema: schema({ polygones: [{ repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false }] }),
      polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }],
      corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88.9, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87.1, nbEtages: 7, cleabsAffectes: [] }],
    });
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true }));
    expect(h).toContain('aucun polygone disponible'); // corps 2 : son seul candidat (A) est pris par le corps 1 → rien à cocher
    expect(h).not.toContain('Polygones non affectés'); // A est affecté → aucun polygone orphelin
  });

  it('GARDE D’AFFICHAGE — « aucun signal » (persiste=false) : PAS de sélecteur, mais l’explication est dite, et le schéma RESTE', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff(), persiste: false }));
    expect(h).toContain('<svg');                              // le schéma reste affiché (informatif)
    expect(h).toContain('Légende du schéma');                // la légende reste
    expect(h).toContain('Aucun signal de mise à jour');       // on DIT pourquoi (jamais de disparition muette)
    expect(h).not.toContain('type="checkbox"');               // aucune case d’affectation
    expect(h).not.toContain('Polygones non affectés');
  });

  it('DAACT « en attente du bâti » (persiste=true, enAttenteBati=true) : affectation FERMÉE + libellé explicite, schéma RESTE', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff(), persiste: true, enAttenteBati: true }));
    expect(h).toContain('<svg');                    // schéma toujours consultable
    expect(h).toContain('En attente du bâti');       // libellé explicite (SPEC B)
    expect(h).toContain('travaux sont déclarés terminés');
    expect(h).not.toContain('type="checkbox"');      // affectation FERMÉE (on n'invente pas un polygone)
  });

  it('L2 — LÉGENDE : l’information ne dépend PAS de la seule couleur (repère écrit, contours vert/tireté, trame nommés)', () => {
    const h = renderToStaticMarkup(createElement(LegendeAffectation, {}));
    expect(h).toContain('couleur = repère du polygone'); // la couleur = identité ; le repère écrit reste la référence
    expect(h).toContain('affecté à un corps (contour vert)');
    expect(h).toContain('déborde de la parcelle (contour tireté)');
    expect(h).toContain('hors parcelle (trame grise)');
    expect(h).toContain('dashed');          // le hors-empreinte est matérialisé par un contour tireté sur la puce
  });

  it('empreinte non figée → motif, pas de schéma ; migration 117 absente → avertissement + sélecteurs désactivés', () => {
    const hMotif = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff({ empreinteFigee: false, motif: 'parcelle du permis non figée : affectation impossible', schema: { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: 'parcelle du permis non figée : affectation impossible' }, polygones: [] }), persiste: true }));
    expect(hMotif).toContain('parcelle du permis non figée : affectation impossible');
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
    const corps = [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: ['BAT_A'] }];
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
      { id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: [] },
      { id: 2, repere: '2D2', altitudeSommetNgf: 87, nbEtages: 7, cleabsAffectes: [] },
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
    expect(vide).toContain('Aucun polygone dans la parcelle du permis');
  });

  it('④ RATTACHEMENT en plein écran : les cases à cocher par bâtiment sont là (c’est là qu’on arbitre)', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affL3(), persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('type="checkbox"');
    expect(h).toContain('polygone A'); expect(h).toContain('polygone B');
  });

  it('ZÉRO duplication : le plein écran CONSOMME les mêmes règles (exclusivité + non-affectés) — il ne les réécrit pas', () => {
    // A affecté au corps 1 → règle d'exclusivité : A n'est plus une option ailleurs, et B est signalé non affecté.
    const a = affL3({ corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: ['BAT_A'] }, { id: 2, repere: '2D2', altitudeSommetNgf: 87, nbEtages: 7, cleabsAffectes: [] }] });
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: a, persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('value="BAT_A"'); expect(h).toContain('checked');    // A coché pour le corps 1 (réversible)
    expect(h).toMatch(/Polygones non affectés — dans la parcelle : B/);      // MÊME sortie que polygonesNonAffectes/texteNonAffectes
  });

  it('mobile / garde d’affichage : « aucun signal » (persiste=false) → pas de sélecteur, mais le schéma et le dialogue restent', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affL3(), persiste: false, onAffecter: noop, onFermer: noop }));
    expect(h).toContain('role="dialog"');
    expect(h).toContain('<svg');                       // schéma consultable
    expect(h).toContain('Aucun signal de mise à jour'); // on DIT pourquoi (jamais de disparition muette)
    expect(h).not.toContain('type="checkbox"');        // pas d'arbitrage sans dossier
  });
});

describe('M2/M3 — cases à cocher : multi-affectation ouverte (garde R4 levée en M3)', () => {
  const noop = () => {};
  const base = (corps: AffectationEtat['corps']): AffectationEtat => ({
    empreinteFigee: true, motif: null, colonneManquante: false,
    schema: {
      largeur: 320, hauteur: 240, empreintePath: 'M0,0 L10,0 L10,10 Z', motif: null,
      polygones: [
        { repere: 'A', cleabs: 'BAT_A', path: 'M1,1 L2,1 L2,2 Z', cx: 1, cy: 1, horsEmpreinte: false },
        { repere: 'B', cleabs: 'BAT_B', path: 'M3,3 L4,3 L4,4 Z', cx: 3, cy: 3, horsEmpreinte: false },
      ],
    },
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false }],
    corps,
  });
  const nbCoches = (h: string) => (h.match(/checked/g) ?? []).length;

  it('un polygone déjà affecté à CE bâtiment s’affiche COCHÉ ; l’autre proposable reste décoché (exactement 1 coché)', () => {
    const a = base([{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: ['BAT_A'] }]);
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true, onAffecter: noop }));
    expect(h).toContain('value="BAT_A"'); expect(h).toContain('value="BAT_B"'); // les deux proposables
    expect(nbCoches(h)).toBe(1);                                                 // un SEUL coché → c'est A (le seul affecté)
    expect(h).not.toContain('porte 2 polygones');                               // un seul polygone → pas de note R4
  });

  it('deux polygones cochés pour un même bâtiment → multi ouvert, et la note d’avertissement R4 (« faux obstacle ») a DISPARU', () => {
    const a = base([{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: ['BAT_A', 'BAT_B'] }]);
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: a, persiste: true, onAffecter: noop }));
    expect(nbCoches(h)).toBe(2);                       // les DEUX cochés : multi bien ouverte
    expect(h).not.toMatch(/faux obstacle/);            // la note d'avertissement M2 a disparu (R4 levée)
    expect(h).not.toMatch(/refusera d’injecter/);      // plus d'annonce de refus
    expect(h).toContain('chacun reçoit sa propre altitude'); // note informative M3 (renvoi au bloc de saisie)
  });
});

describe('M3 — SaisieCotesInjection : une cote par polygone (bloc d’injection)', () => {
  const noop = () => {};
  const affN = (cleabsAffectes: string[]): AffectationEtat => ({
    empreinteFigee: true, motif: null, colonneManquante: false,
    schema: { largeur: 320, hauteur: 240, empreintePath: 'M0,0 L1,0 L1,1 Z', motif: null, polygones: [] },
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false }],
    corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes }],
  });

  it('N polygones affectés → N champs numériques, étiquetés repère + cleabs, aux valeurs des cotes (distinctes)', () => {
    const h = renderToStaticMarkup(createElement(SaisieCotesInjection, { affectation: affN(['BAT_A', 'BAT_B']), cotes: { BAT_A: '88', BAT_B: '82' }, onCote: noop, onRecopier: noop }));
    expect((h.match(/type="number"/g) ?? []).length).toBe(2);   // un champ par polygone
    expect(h).toContain('polygone A'); expect(h).toContain('· BAT_A');
    expect(h).toContain('value="88"'); expect(h).toContain('value="82"'); // cotes distinctes affichées
  });

  it('un champ vide est signalé « non injecté » (non ambigu)', () => {
    const h = renderToStaticMarkup(createElement(SaisieCotesInjection, { affectation: affN(['BAT_A', 'BAT_B']), cotes: { BAT_A: '88', BAT_B: '' }, onCote: noop, onRecopier: noop }));
    expect(h).toContain('non injecté');
  });

  it('« recopier partout » n’apparaît qu’à partir de 2 polygones (geste explicite)', () => {
    const un = renderToStaticMarkup(createElement(SaisieCotesInjection, { affectation: affN(['BAT_A']), cotes: { BAT_A: '88' }, onCote: noop, onRecopier: noop }));
    expect(un).not.toContain('Recopier');
    const deux = renderToStaticMarkup(createElement(SaisieCotesInjection, { affectation: affN(['BAT_A', 'BAT_B']), cotes: { BAT_A: '88', BAT_B: '88' }, onCote: noop, onRecopier: noop }));
    expect(deux).toContain('Recopier la cote du polygone A');
  });

  it('aucun polygone affecté → le bloc ne s’affiche pas', () => {
    const h = renderToStaticMarkup(createElement(SaisieCotesInjection, { affectation: affN([]), cotes: {}, onCote: noop, onRecopier: noop }));
    expect(h).toBe('');
  });
});

describe('M5 — ouverture manuelle : bloc d’ouverture + bandeau d’honnêteté', () => {
  const noop = () => {};

  it('OuvertureManuelle : dit franchement « pas une détection / manuelle », motif obligatoire (bouton inactif si vide)', () => {
    const vide = renderToStaticMarkup(createElement(OuvertureManuelle, { motif: '', onMotif: noop, onOuvrir: noop, enCours: false }));
    expect(vide).toMatch(/pas une détection/i);
    expect(vide).toMatch(/manuelle/i);
    expect(vide).toContain('disabled');           // motif vide → bouton inactif
    const rempli = renderToStaticMarkup(createElement(OuvertureManuelle, { motif: 'vérif', onMotif: noop, onOuvrir: noop, enCours: false }));
    expect(rempli).not.toContain('disabled');      // motif saisi → bouton actif
    expect(rempli).toContain('value="vérif"');     // le motif saisi est bien reflété
  });

  it('OuvertureManuelle : bouton inactif pendant une action en cours', () => {
    const h = renderToStaticMarkup(createElement(OuvertureManuelle, { motif: 'vérif', onMotif: noop, onOuvrir: noop, enCours: true }));
    expect(h).toContain('disabled');
  });

  it('BandeauOuvertureManuelle : distingue visiblement une ouverture manuelle et rappelle « Refuser » pour refermer', () => {
    const h = renderToStaticMarkup(createElement(BandeauOuvertureManuelle, { motif: 'vérification affectation' }));
    expect(h).toContain('ouvert manuellement');
    expect(h).toMatch(/aucun changement BD ?TOPO/i);
    expect(h).toContain('vérification affectation'); // le motif est rappelé
    expect(h).toMatch(/Refuser/);                     // comment refermer
  });
});

describe('M6 — surlignement qui épouse la forme + panneau (pastilles)', () => {
  const noop = () => {};
  const schemaA = (horsEmpreinte = false): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [{ repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte }],
  });
  const corpsA = [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: ['BAT_A'] }];
  const affPanneau: AffectationEtat = {
    empreinteFigee: true, motif: null, colonneManquante: false, schema: { largeur: 320, hauteur: 240, empreintePath: null, polygones: [], motif: null },
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }],
    corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: ['BAT_A'] }],
  };

  it('polygone coché (affecté) → halo qui reprend le PATH du polygone (jamais un rect/bbox), teinte encre, derrière', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaA(), corps: corpsA }));
    expect(h).toMatch(/<path[^>]*d="M20,20 L40,20 L40,40 Z"[^>]*data-surlignement="true"/); // ÉPOUSE la géométrie
    expect(h).not.toMatch(/<rect[^>]*data-surlignement/);                                    // jamais un rectangle englobant
    expect(h).toContain('stroke="var(--color-svv-ink)"');                                     // encre
  });

  it('PAS d’anneau de focus bbox : outline:none sur le polygone interactif', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaA(), corps: [] }));
    expect(h).toContain('outline:none');
    expect(h).not.toContain('data-surlignement'); // non affecté + non actif → aucun halo par défaut
  });

  it('trois signaux DISTINCTS sur une même lanière : halo (sélection) + contour vert (affecté) + tireté (déborde)', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaA(true), corps: corpsA }));
    expect(h).toContain('data-surlignement="true"');            // sélection (halo)
    expect(h).toContain('stroke="var(--color-svv-green-ink)"');  // affecté (contour vert)
    expect(h).toContain('stroke-dasharray="3 2"');               // déborde (tireté)
  });

  it('panneau : chaque polygone sélectionné porte une pastille de SA couleur de repère, sous l’intitulé « Polygones sélectionnés »', () => {
    const h = renderToStaticMarkup(createElement(SaisieCotesInjection, { affectation: affPanneau, cotes: { BAT_A: '88' }, onCote: noop, onRecopier: noop }));
    expect(h).toContain('Polygones sélectionnés');
    expect(h).toContain(couleurRepere(0)); // A → couleurRepere(0), MÊME teinte que le remplissage du schéma
  });
});

describe('L3b — vocabulaire parcelle : « empreinte » disparaît de l’interface visible', () => {
  // Un polygone débordant (B) pour éprouver le libellé du débordement.
  const affDeborde = (): AffectationEtat => ({
    empreinteFigee: true, motif: null, colonneManquante: false,
    schema: {
      largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
      polygones: [
        { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
        { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: true },
      ],
    },
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: true }],
    corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: [] }],
  });
  const noop = () => {};

  it('① le plein écran ne dit PLUS « hors empreinte » ni « empreinte » ; il dit « déborde de la parcelle »', () => {
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: affDeborde(), persiste: true, onAffecter: noop, onFermer: noop }));
    expect(h).not.toMatch(/hors empreinte/i);   // l'ancien terme interne a disparu
    expect(h).not.toMatch(/empreinte/i);         // plus aucun « empreinte » visible sur cet écran
    expect(h).toContain('déborde de la parcelle'); // nouvelle formulation métier
  });

  it('② POURQUOI ça compte, dit une fois à côté de la légende plein écran (mitoyen/voisin → à vérifier)', () => {
    const h = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: affDeborde().schema, corps: [] }));
    expect(h).toContain('Contour tireté = déborde de la parcelle');
    expect(h).toContain('probablement mitoyen ou voisin');
    expect(h).toContain('à vérifier avant de l’affecter au permis');
    // sans polygone débordant : pas de « pourquoi » (message montré seulement là où il s'applique)
    const sansDeborde = renderToStaticMarkup(createElement(LegendeRepetesComplete, {
      schema: { largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null, polygones: [{ repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false }] }, corps: [],
    }));
    expect(sansDeborde).not.toContain('Contour tireté = déborde de la parcelle');
  });

  it('④ la puce de légende porte le CONTOUR TIRETÉ (pas seulement le mot) sur un polygone débordant', () => {
    const h = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: affDeborde().schema, corps: [] }));
    expect(h).toContain('1px dashed var(--color-svv-ink)'); // puce tiretée = matérialise le débordement dans le dessin
    expect(h).toContain('>B</strong>'); expect(h).toContain('déborde de la parcelle');
  });

  it('la légende COMPACTE dit aussi « déborde de la parcelle » (plus « hors empreinte »)', () => {
    const h = renderToStaticMarkup(createElement(LegendeAffectation, {}));
    expect(h).not.toMatch(/hors empreinte/i);
    expect(h).toContain('déborde de la parcelle (contour tireté)');
    expect(h).toContain('dashed');
  });
});

describe('L4 — nom + mention du schéma d’origine selon sa provenance (descriptionSchemaOrigine)', () => {
  it('figée + millésime → « Configuration d’origine » + « État figé (millésime X) »', () => {
    expect(descriptionSchemaOrigine({ figee: true, captureVide: false, millesimeGel: '2026-06-18' }))
      .toEqual({ nom: NOM_SCHEMA_ORIGINE, mention: 'État figé (millésime 2026-06-18).' });
  });

  it('figée mais millésime inconnu → « millésime inconnu » (jamais un blanc)', () => {
    expect(descriptionSchemaOrigine({ figee: true, captureVide: false, millesimeGel: null }).mention).toBe('État figé (millésime inconnu).');
  });

  it('capture VIDE (terrain nu au gel, cas 07512025V0035) → message DISTINCT, garde le nom d’origine', () => {
    const d = descriptionSchemaOrigine({ figee: true, captureVide: true, millesimeGel: '2026-06-18' });
    expect(d.nom).toBe(NOM_SCHEMA_ORIGINE);
    expect(d.mention).toBe('Terrain nu au moment du gel — aucun bâtiment (millésime 2026-06-18).');
  });

  it('AUCUNE capture → nom HONNÊTE « État courant (non figé) » + mention explicite (jamais un repli muet sous « origine »)', () => {
    const d = descriptionSchemaOrigine({ figee: false, captureVide: false, millesimeGel: null });
    expect(d.nom).toBe('État courant (non figé)');
    expect(d.nom).not.toBe(NOM_SCHEMA_ORIGINE);
    expect(d.mention).toMatch(/Aucun état d’origine n’a été capturé/);
  });

  it('les DEUX situations « pas de snapshot exploitable » ne produisent PAS le même message', () => {
    const terrainNu = descriptionSchemaOrigine({ figee: true, captureVide: true, millesimeGel: '2026-06-18' }).mention;
    const aucuneCapture = descriptionSchemaOrigine({ figee: false, captureVide: false, millesimeGel: null }).mention;
    expect(terrainNu).not.toBe(aucuneCapture);
  });

  it('L5 — mention de « Nouvelle configuration » : compte de polygones + mention du rouge', () => {
    expect(descriptionSchemaNouvelle(3, 0)).toBe('Couche bâti actuelle — 3 polygones.');
    expect(descriptionSchemaNouvelle(3, 1)).toBe('Couche bâti actuelle — 3 polygones, dont 1 nouveau/modifié (en rouge).');
    expect(descriptionSchemaNouvelle(2, 2)).toBe('Couche bâti actuelle — 2 polygones, dont 2 nouveaux/modifiés (en rouge).');
  });

  it('la mention (provenance + millésime) est écrite DANS le visuel du schéma (vue réduite ET plein écran)', () => {
    const aff: AffectationEtat = {
      empreinteFigee: true, motif: null, colonneManquante: false,
      schema: { largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null, polygones: [{ repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false }] },
      polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }],
      corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: [] }],
    };
    const desc = descriptionSchemaOrigine({ figee: true, captureVide: false, millesimeGel: '2026-06-18' });
    const hReduit = renderToStaticMarkup(createElement(AffectationBloc, { affectation: aff, persiste: true, titre: desc.nom, mention: desc.mention }));
    expect(hReduit).toContain('Configuration'); expect(hReduit).toContain('État figé (millésime 2026-06-18).');
    const hPlein = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: 'État courant (non figé)', mention: 'Aucun état d’origine n’a été capturé pour ce permis : polygones lus dans la couche bâti actuelle.', affectation: aff, persiste: true, onAffecter: () => {}, onFermer: () => {} }));
    expect(hPlein).toContain('État courant (non figé)');          // nom honnête annoncé (titre du dialogue)
    expect(hPlein).toContain('Aucun état d’origine n’a été capturé'); // mention dans le visuel
  });
});

describe('L5 — second schéma, rouge, comparatif côte à côte', () => {
  const schema2 = (): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
      { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: false },
    ],
  });
  const affAB = (): AffectationEtat => ({
    empreinteFigee: true, motif: null, colonneManquante: false, schema: schema2(),
    polygones: [{ repere: 'A', cleabs: 'BAT_A', horsEmpreinte: false }, { repere: 'B', cleabs: 'BAT_B', horsEmpreinte: false }],
    corps: [{ id: 1, repere: '2D1', altitudeSommetNgf: 88, nbEtages: 7, cleabsAffectes: [] }],
  });
  const noop = () => {};
  const compte = (h: string, re: RegExp) => (h.match(re) ?? []).length;

  it('② le rouge s’applique aux SEULS polygones nouveaux/modifiés (B rouge, A garde sa palette) ; sans liste, aucun rouge', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema2(), corps: [], rougeCleabs: ['BAT_B'] }));
    expect(h).toContain('fill="var(--color-svv-red)"');       // B nouveau/modifié → rouge
    expect(h).toContain(`fill="${couleurRepere(0)}"`);         // A garde SA couleur de palette (identité)
    expect(compte(h, /fill="var\(--color-svv-red\)"/g)).toBe(1); // un SEUL polygone rouge (pas A)
    const h0 = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schema2(), corps: [] }));
    expect(h0).not.toContain('var(--color-svv-red)');          // cas identique à l'origine → AUCUN rouge (comportement correct)
  });

  it('le rouge n’est jamais seul porteur : la légende dit ce qu’il signifie ET le repère écrit reste', () => {
    const h = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: schema2(), corps: [], rougeCleabs: ['BAT_B'] }));
    expect(h).toContain('Rouge = nouveau ou modifié depuis l’origine');
    expect(h).toContain('>B</strong>'); expect(h).toContain('(nouveau/modifié)');
    // la légende COMPACTE porte aussi la clé du rouge quand il y a du rouge
    const hc = renderToStaticMarkup(createElement(LegendeAffectation, { avecRouge: true }));
    expect(hc).toContain('nouveau ou modifié depuis l’origine (rouge)');
    expect(renderToStaticMarkup(createElement(LegendeAffectation, {}))).not.toContain('(rouge)'); // pas de clé rouge sur l'origine
  });

  it('⑥ le bloc « Nouvelle configuration » porte le rouge ET la même fonction de rattachement (sélecteurs)', () => {
    const h = renderToStaticMarkup(createElement(AffectationBloc, { affectation: affAB(), persiste: true, titre: NOM_SCHEMA_NOUVELLE, mention: descriptionSchemaNouvelle(2, 1), rougeCleabs: ['BAT_B'], onAffecter: noop }));
    expect(h).toContain(NOM_SCHEMA_NOUVELLE);                  // nom dans le visuel
    expect(h).toContain('fill="var(--color-svv-red)"');        // rouge
    expect(h).toContain('type="checkbox"');                    // MÊME fonction de rattachement (CorpsEtChoix réutilisé)
    expect(h).toContain('nouveau/modifié (en rouge)');         // mention
  });

  it('⑤ comparatif : vrai dialogue, deux <section> aria-label (distinguables au lecteur d’écran), ORIGINE à gauche, rouge sur la NOUVELLE seule', () => {
    const h = renderToStaticMarkup(createElement(ComparaisonPleinEcran, {
      origine: affAB(), nouvelle: affAB(), rougeCleabs: ['BAT_B'],
      nomOrigine: NOM_SCHEMA_ORIGINE, nomNouvelle: NOM_SCHEMA_NOUVELLE, mentionOrigine: 'orig', mentionNouvelle: 'nouv', onFermer: noop,
    }));
    expect(h).toContain('role="dialog"'); expect(h).toContain('aria-modal="true"'); expect(h).toContain('Comparer les schémas');
    expect(h).toContain(`aria-label="${NOM_SCHEMA_ORIGINE}"`); expect(h).toContain(`aria-label="${NOM_SCHEMA_NOUVELLE}"`);
    // ORIGINE avant NOUVELLE dans le DOM → à gauche (côte à côte) / au-dessus (empilé mobile)
    expect(h.indexOf(`aria-label="${NOM_SCHEMA_ORIGINE}"`)).toBeLessThan(h.indexOf(`aria-label="${NOM_SCHEMA_NOUVELLE}"`));
    // le rouge n'apparaît QUE dans la nouvelle (une seule surface rouge, alors que les deux schémas contiennent B)
    expect(compte(h, /fill="var\(--color-svv-red\)"/g)).toBe(1);
  });

  it('les DEUX schémas coexistent sans se marcher dessus : identifiants de trame UNIQUES (L2)', () => {
    const h = renderToStaticMarkup(createElement(ComparaisonPleinEcran, {
      origine: affAB(), nouvelle: affAB(), rougeCleabs: ['BAT_B'],
      nomOrigine: NOM_SCHEMA_ORIGINE, nomNouvelle: NOM_SCHEMA_NOUVELLE, onFermer: noop,
    }));
    const ids = [...h.matchAll(/id="(trame-[^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);                 // un motif de trame par SVG
    expect(new Set(ids).size).toBe(2);          // et ils sont DISTINCTS (pas de collision d'id)
  });
});

describe('L7 — le détail s’insère DANS LE FLUX, sous sa ligne (trame grise), pas en fin de section', () => {
  const marqueur = (id: number) => createElement('div', null, `DETAIL_${id}`); // contenu factice du détail
  const deuxG2 = () => [
    ligne({ dossierId: 9, numDau: 'AAA', etat: 'suivi_aucun_signal', dateAutorisationIso: '2026-02-01' }),
    ligne({ dossierId: 8, numDau: 'BBB', etat: 'suivi_aucun_signal', dateAutorisationIso: '2026-01-01' }),
  ]; // triées : 9 (2026-02) avant 8 (2026-01), même groupe 2

  it('le panneau de la ligne A apparaît APRÈS A et AVANT B (jamais en fin de section)', () => {
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes: deuxG2(), ouvert: 9, renderDetail: marqueur }));
    const iA = h.indexOf('AAA'), iPanneau = h.indexOf('DETAIL_9'), iB = h.indexOf('BBB');
    expect(iA).toBeGreaterThanOrEqual(0); expect(iPanneau).toBeGreaterThan(iA); expect(iB).toBeGreaterThan(iPanneau);
    expect(h).toContain('id="detail-suivi-9"');            // le panneau porte l'id référencé par aria-controls
    expect(h).toContain('aria-controls="detail-suivi-9"'); // le bouton le référence
    expect(h).not.toContain('DETAIL_8');                   // seule la ligne OUVERTE a un panneau
  });

  it('détail FERMÉ (ouvert=null) → aucun panneau rendu', () => {
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes: deuxG2(), ouvert: null, renderDetail: marqueur }));
    expect(h).not.toContain('DETAIL_');
    expect(h).not.toContain('id="detail-suivi-');
    expect(h).toContain('aria-controls="detail-suivi-9"'); // l'id est toujours référencé, même replié (a11y)
  });

  it('détail ouvert dans le GROUPE 2 → le GROUPE 1 n’est pas traversé (le panneau reste APRÈS l’en-tête du groupe 2)', () => {
    const lignes = [
      ligne({ dossierId: 5, numDau: 'ARB', etat: 'arbitrage_demande', dateDeclenchementIso: '2026-08-20' }), // groupe 1
      ligne({ dossierId: 9, numDau: 'AAA', etat: 'suivi_aucun_signal', dateAutorisationIso: '2026-02-01' }), // groupe 2 (ouvert)
    ];
    const h = renderToStaticMarkup(createElement(TableSuivi, { lignes, ouvert: 9, renderDetail: marqueur }));
    const iG1 = h.indexOf('Rattachement à faire'), iG2 = h.indexOf('En attente d’une mise à jour'), iPanneau = h.indexOf('DETAIL_9');
    expect(iG1).toBeLessThan(iG2);          // groupe 1 au-dessus du groupe 2 (coupure L6 intacte)
    expect(iPanneau).toBeGreaterThan(iG2);  // le panneau du dossier ouvert est DANS le groupe 2, pas entre les groupes
    // le dossier d'arbitrage (groupe 1) n'a pas de panneau : la coupure n'est pas traversée
    expect(h).toContain('ARB'); expect(h).not.toContain('DETAIL_5');
  });
});

describe('L10 — cleabs dans la légende + interrupteur des repères', () => {
  const schemaAB = (o: Partial<SchemaEmpreinte> = {}): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BATIMENT0000000240764949', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false },
      { repere: 'B', cleabs: 'BATIMENT0000002493678245', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: false },
    ], ...o,
  });
  const noop = () => {};

  it('② repères ACTIFS (défaut) → les lettres + leur halo sont dans le markup', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaAB(), corps: [] }));
    expect(h).toContain('<text'); expect(h).toContain('>A<'); expect(h).toContain('>B<');
    expect(h).toContain('paint-order="stroke"'); // le halo
  });

  it('② repères MASQUÉS → AUCUNE lettre ni halo, mais parcelle + polygones (formes + couleurs) TOUJOURS là', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaAB(), corps: [], afficherReperes: false }));
    expect(h).not.toContain('<text');            // aucune lettre
    expect(h).not.toContain('paint-order');       // aucun halo
    expect(h).toContain('d="M10,10 L100,10 L100,100 Z" fill="#fff"'); // la parcelle blanche reste
    expect(h).toContain(`fill="${couleurRepere(0)}"`); // A garde sa couleur
    expect(h).toContain(`fill="${couleurRepere(1)}"`); // B garde sa couleur
    expect(h).toContain('d="M20,20 L40,20 L40,40 Z"'); // les formes des polygones restent
  });

  it('① la légende associe chaque repère à son cleabs (chasse fixe, sélectionnable d’un clic)', () => {
    const h = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: schemaAB(), corps: [] }));
    expect(h).toContain('>A</strong>'); expect(h).toContain('BATIMENT0000000240764949'); // repère A → son cleabs
    expect(h).toContain('>B</strong>'); expect(h).toContain('BATIMENT0000002493678245');
    expect(h).toContain('user-select:all'); // sélectionnable d'un clic pour copier
    expect(h).toMatch(/font-family:var\(--font-svv-mono/); // chasse fixe
    // le cleabs n'est jamais DESSINÉ comme étiquette dans le polygone : le <text> ne porte que la lettre (L11 : il est dans la bulle <title>).
    const hSvg = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaAB(), corps: [] }));
    expect(hSvg).toMatch(/>A<\/text>/);
    expect(hSvg).not.toMatch(/>[^<]*BATIMENT[^<]*<\/text>/);
  });

  it('un polygone SANS cleabs (cas théorique) ne casse pas le rendu (légende + schéma)', () => {
    const s = schemaAB({ polygones: [{ repere: 'A', cleabs: null, path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false }] });
    const hLeg = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: s, corps: [] }));
    expect(hLeg).toContain('(sans cleabs)'); expect(hLeg).toContain('>A</strong>');
    const hSvg = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: s, corps: [], afficherReperes: false }));
    expect(hSvg).not.toContain('<text'); // masquage OK même sans cleabs
  });

  it('l’interrupteur vaut pour les DEUX schémas (comparatif) : masqué → aucune lettre dans l’un NI l’autre', () => {
    const orig: AffectationEtat = { empreinteFigee: true, motif: null, colonneManquante: false, schema: schemaAB(), polygones: [], corps: [] };
    const props = { origine: orig, nouvelle: orig, nomOrigine: NOM_SCHEMA_ORIGINE, nomNouvelle: NOM_SCHEMA_NOUVELLE, onFermer: noop };
    const hOn = renderToStaticMarkup(createElement(ComparaisonPleinEcran, { ...props, afficherReperes: true }));
    expect((hOn.match(/<text/g) ?? []).length).toBe(4); // 2 repères × 2 schémas
    const hOff = renderToStaticMarkup(createElement(ComparaisonPleinEcran, { ...props, afficherReperes: false }));
    expect(hOff).not.toContain('<text'); // aucun repère dessiné, dans aucun des deux schémas
  });
});

describe('L11 — bulles au survol + interrupteur en plein écran', () => {
  const noop = () => {};
  // schéma avec attributs : A complet, B avec hauteur mais SANS altitude toit (cas réel 11430)
  const schemaAttr = (): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false, attributs: { nombreEtages: 7, hauteurM: 21, altitudeToitNgf: 89.4, surfaceM2: 73.87, etatDeLObjet: 'En service' } },
      { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: false, attributs: { nombreEtages: null, hauteurM: 5, altitudeToitNgf: null, surfaceM2: 77.5, etatDeLObjet: null } },
    ],
  });

  it('lignesBulle (pur) : source en tête, cleabs, valeurs présentes affichées, absentes « non renseigné », hauteur ≠ altitude', () => {
    const l = lignesBulle('BAT_A', { nombreEtages: 7, hauteurM: 21, altitudeToitNgf: 89.4, surfaceM2: 73.87, etatDeLObjet: 'En service' }, 'au moment du gel');
    expect(l[0]).toBe('Source : au moment du gel');
    expect(l).toContain('cleabs : BAT_A');
    expect(l).toContain('étages : 7');
    expect(l).toContain('surface : 73.9 m²');                 // arrondi d'affichage seul (0,1 m²)
    expect(l).toContain('hauteur (depuis le sol) : 21 m');    // hauteur nommée
    expect(l).toContain('altitude de toit (NGF) : 89.4 m NGF'); // altitude nommée SÉPARÉMENT
    // tout absent → « non renseigné » partout (jamais un zéro inventé)
    const vide = lignesBulle(null, { nombreEtages: null, hauteurM: null, altitudeToitNgf: null, surfaceM2: null, etatDeLObjet: null }, 'x');
    expect(vide).toContain('cleabs : non renseigné'); expect(vide).toContain('surface : non renseigné');
    expect(vide).toContain('hauteur (depuis le sol) : non renseigné'); expect(vide).toContain('altitude de toit (NGF) : non renseigné');
  });

  it('coché → bulle (title) avec cleabs + étages + surface + hauteur + altitude de toit ; polygone focalisable au clavier', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaAttr(), corps: [], sourceLibelle: 'au moment du gel' }));
    expect(h).toContain('<title>');
    expect(h).toContain('cleabs : BAT_A'); expect(h).toContain('étages : 7'); expect(h).toContain('surface : 73.9 m²');
    expect(h).toContain('hauteur (depuis le sol) : 21 m'); expect(h).toContain('altitude de toit (NGF) : 89.4 m NGF');
    expect(h).toContain('Source : au moment du gel'); // source nommée sans ambiguïté
    expect(h).toContain('tabindex="0"');               // atteignable au clavier
    expect(h).toContain('aria-label="Source : au moment du gel'); // info aussi dans le nom accessible
  });

  it('hauteur PRÉSENTE mais altitude ABSENTE (cas 11430) → l’une affichée, l’autre « non renseigné »', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaAttr(), corps: [], sourceLibelle: 'gel' }));
    expect(h).toContain('hauteur (depuis le sol) : 5 m');      // B : hauteur présente
    expect(h).toContain('altitude de toit (NGF) : non renseigné'); // B : altitude absente
  });

  it('décoché → aucune lettre, aucun halo, AUCUNE bulle (ni title, ni interactivité)', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaAttr(), corps: [], afficherReperes: false }));
    expect(h).not.toContain('<text');       // aucune lettre
    expect(h).not.toContain('paint-order');  // aucun halo
    expect(h).not.toContain('<title');       // aucune bulle
    expect(h).not.toContain('tabindex');     // plus interactif
    expect(h).not.toContain('cleabs :');     // pas d'info de bulle
    expect(h).toContain('d="M20,20 L40,20 L40,40 Z"'); // les polygones (formes) restent
  });

  it('l’interrupteur est présent en PLEIN ÉCRAN (schéma seul) et pilote le réglage', () => {
    const aff: AffectationEtat = { empreinteFigee: true, motif: null, colonneManquante: false, schema: schemaAttr(), polygones: [], corps: [] };
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: aff, persiste: true, onAffecter: noop, onFermer: noop, afficherReperes: true, onAfficherReperes: noop, sourceLibelle: 'gel' }));
    expect(h).toContain('type="checkbox"'); expect(h).toContain('Afficher les repères');
    // sans onAfficherReperes (ex. si non fourni) → pas d'interrupteur
    const hSans = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: aff, persiste: true, onAffecter: noop, onFermer: noop }));
    expect(hSans).not.toContain('type="checkbox"');
  });

  it('l’interrupteur est présent en plein écran COMPARATIF, une seule fois, et vaut pour les deux schémas', () => {
    const aff: AffectationEtat = { empreinteFigee: true, motif: null, colonneManquante: false, schema: schemaAttr(), polygones: [], corps: [] };
    const h = renderToStaticMarkup(createElement(ComparaisonPleinEcran, { origine: aff, nouvelle: aff, nomOrigine: NOM_SCHEMA_ORIGINE, nomNouvelle: NOM_SCHEMA_NOUVELLE, onFermer: noop, afficherReperes: true, onAfficherReperes: noop, sourceOrigine: 'au moment du gel', sourceNouvelle: 'état actuel' }));
    expect((h.match(/type="checkbox"/g) ?? []).length).toBe(1); // UN seul interrupteur
    expect(h).toContain('Source : au moment du gel'); expect(h).toContain('Source : état actuel'); // chaque schéma nomme SA source
  });

  it('InterrupteurReperes (pur) : reflète l’état et l’annonce aux lecteurs d’écran', () => {
    const hOn = renderToStaticMarkup(createElement(InterrupteurReperes, { afficherReperes: true, onAfficherReperes: noop }));
    expect(hOn).toContain('checked'); expect(hOn).toContain('aria-label="Afficher les repères');
    const hOff = renderToStaticMarkup(createElement(InterrupteurReperes, { afficherReperes: false, onAfficherReperes: noop }));
    expect(hOff).not.toContain('checked');
  });
});

describe('L12 — distinguer le futur bâti (En projet) sur le schéma', () => {
  const attr = (etat: string | null, o: Partial<AttributsPolygone> = {}): AttributsPolygone => ({ nombreEtages: null, hauteurM: null, altitudeToitNgf: null, surfaceM2: null, etatDeLObjet: etat, ...o });
  const schemaEtats = (): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false, attributs: attr('En projet') },
      { repere: 'B', cleabs: 'BAT_B', path: 'M60,60 L80,60 L80,80 Z', cx: 70, cy: 70, horsEmpreinte: false, attributs: attr('En service') },
      { repere: 'C', cleabs: 'BAT_C', path: 'M85,85 L95,85 L95,95 Z', cx: 90, cy: 90, horsEmpreinte: false, attributs: attr(null) },
    ],
  });

  it('estFuturBati : projet/construction → true ; service/ruine/null → false (NULL jamais confondu)', () => {
    expect(estFuturBati('En projet')).toBe(true);
    expect(estFuturBati('En construction')).toBe(true);
    expect(estFuturBati('En service')).toBe(false);
    expect(estFuturBati('En ruine')).toBe(false);
    expect(estFuturBati(null)).toBe(false);
    expect(estFuturBati(undefined)).toBe(false);
  });

  it('libelleEtatBati : futur bâti nommé ; existant en valeur IGN ; NULL → « non renseigné »', () => {
    expect(libelleEtatBati('En projet')).toBe('en projet (futur bâti)');
    expect(libelleEtatBati('En construction')).toBe('en construction (futur bâti)');
    expect(libelleEtatBati('En service')).toBe('en service');
    expect(libelleEtatBati(null)).toBe('non renseigné');
  });

  it('la bulle affiche l’état (futur bâti / existant / non renseigné) — sans le confondre', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaEtats(), corps: [], sourceLibelle: 'au moment du gel' }));
    expect(h).toContain('état : en projet (futur bâti)'); // A
    expect(h).toContain('état : en service');             // B (existant, jamais confondu avec NULL)
    expect(h).toContain('état : non renseigné');          // C (NULL, jamais confondu avec « en service »)
  });

  it('« En projet » → croisillon (marque non colorée) ; « En service » et NULL → pas de marque', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaEtats(), corps: [] }));
    expect(h).toContain('<pattern id="hachure-');   // le motif croisillon est défini
    expect((h.match(/data-futur-bati="true"/g) ?? []).length).toBe(1); // UN seul polygone hachuré (A « En projet »)
    // la couleur de REMPLISSAGE reste celle du repère dans TOUS les cas (A inclus), aucun rouge introduit
    expect(h).toContain(`fill="${couleurRepere(0)}"`); // A garde sa couleur de palette (le croisillon est une surimpression)
    expect(h).toContain(`fill="${couleurRepere(1)}"`); // B
    expect(h).not.toContain('var(--color-svv-red)');   // aucun rouge introduit par le futur bâti
  });

  it('la marque du futur bâti n’est PAS gouvernée par l’interrupteur des repères (elle reste même repères masqués)', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaEtats(), corps: [], afficherReperes: false }));
    expect(h).not.toContain('<text');                 // repères masqués
    expect(h).toContain('data-futur-bati="true"');     // mais le croisillon du futur bâti reste (propriété du polygone)
  });

  it('la LÉGENDE explique la distinction + donne le COMPTE ; absente s’il n’y a aucun futur bâti', () => {
    const h = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: schemaEtats(), corps: [] }));
    expect(h).toContain('futur bâti (en projet)');
    expect(h).toContain('1 polygone que le permis va faire sortir de terre'); // le compte (1 « En projet »)
    // aucun futur bâti → pas de clé
    const sansFutur: SchemaEmpreinte = { ...schemaEtats(), polygones: [{ repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false, attributs: attr('En service') }] };
    const hSans = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: sansFutur, corps: [] }));
    expect(hSans).not.toContain('futur bâti');
  });
});

describe('L14 — l’interrupteur du futur bâti ne masque QUE la marque (croisillon), jamais un polygone', () => {
  const noop = () => {};
  const attr = (etat: string | null): AttributsPolygone => ({ nombreEtages: null, hauteurM: null, altitudeToitNgf: null, surfaceM2: null, etatDeLObjet: etat });
  // A existant, C EN PROJET (comme le dossier 11430), B existant.
  const schemaABC = (): SchemaEmpreinte => ({
    largeur: 320, hauteur: 240, empreintePath: 'M10,10 L100,10 L100,100 Z', motif: null,
    polygones: [
      { repere: 'A', cleabs: 'BAT_A', path: 'M20,20 L40,20 L40,40 Z', cx: 30, cy: 30, horsEmpreinte: false, attributs: attr('En service') },
      { repere: 'B', cleabs: 'BAT_B', path: 'M50,50 L70,50 L70,70 Z', cx: 60, cy: 60, horsEmpreinte: false, attributs: attr('En service') },
      { repere: 'C', cleabs: 'BAT_C', path: 'M80,80 L95,80 L95,95 Z', cx: 88, cy: 88, horsEmpreinte: false, attributs: attr('En projet') },
    ],
  });

  it('DÉFAUT 1 corrigé : décoché → le croisillon disparaît, mais TOUS les polygones restent dessinés (aucun bâti ne disparaît)', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaABC(), corps: [], afficherFutur: false }));
    expect(h).not.toContain('data-futur-bati');      // la MARQUE (croisillon) est masquée
    expect(h).toContain('M80,80 L95,80 L95,95 Z');   // le polygone C (En projet) est TOUJOURS dessiné à sa position
    expect(h).toContain('M20,20 L40,20 L40,40 Z');   // A
    expect(h).toContain('M50,50 L70,50 L70,70 Z');   // B
    expect(h).toContain('>A<'); expect(h).toContain('>B<'); expect(h).toContain('>C<'); // les 3 repères présents
    expect(h).toContain('BAT_C');                    // la bulle de C reste (polygone toujours là)
  });

  it('coché (défaut) → le croisillon marque le futur bâti ; le polygone est là dans les deux cas', () => {
    const h = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaABC(), corps: [] }));
    expect(h).toContain('data-futur-bati="true"');   // C marqué
    expect((h.match(/data-futur-bati="true"/g) ?? []).length).toBe(1); // 1 seul futur (C)
    expect(h).toContain('M80,80 L95,80 L95,95 Z');   // C dessiné
  });

  it('le COMPTE et la légende restent complets dans les deux états (le futur bâti n’est jamais retiré)', () => {
    const hOn = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: schemaABC(), corps: [] }));
    expect(hOn).toContain('BAT_A'); expect(hOn).toContain('BAT_B'); expect(hOn).toContain('BAT_C'); // les 3 listés
    expect(hOn).toContain('futur bâti (en projet)'); // clé du croisillon (marque affichée)
    const hOff = renderToStaticMarkup(createElement(LegendeRepetesComplete, { schema: schemaABC(), corps: [], afficherFutur: false }));
    expect(hOff).toContain('BAT_A'); expect(hOff).toContain('BAT_B'); expect(hOff).toContain('BAT_C'); // TOUJOURS les 3 (rien retiré)
    expect(hOff).not.toContain('futur bâti');        // marque masquée → pas de clé, mais les polygones restent
  });

  it('les repères ne sont jamais renumérotés (A/B/C stables quel que soit l’interrupteur)', () => {
    const rep = (h: string) => (h.match(/>([A-Z])<\/text>/g) ?? []).join(',');
    const hOn = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaABC(), corps: [] }));
    const hOff = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaABC(), corps: [], afficherFutur: false }));
    expect(rep(hOn)).toBe(rep(hOff)); // mêmes lettres, même ordre, dans les deux états
  });

  it('les deux interrupteurs restent INDÉPENDANTS et le cadrage ne bouge pas', () => {
    const hFuturOff = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaABC(), corps: [], afficherFutur: false, afficherReperes: true }));
    expect(hFuturOff).toContain('>A<'); expect(hFuturOff).not.toContain('data-futur-bati'); // repères OK, marque off
    const hReperesOff = renderToStaticMarkup(createElement(SchemaEmpreinteSvg, { schema: schemaABC(), corps: [], afficherFutur: true, afficherReperes: false }));
    expect(hReperesOff).toContain('data-futur-bati="true"'); expect(hReperesOff).not.toContain('<text'); // marque on, repères off
    expect(hFuturOff).toContain('viewBox="0 0 320 240"'); expect(hReperesOff).toContain('viewBox="0 0 320 240"'); // cadrage stable
  });

  it('InterrupteurFuturBati : libellé « Signaler le futur bâti » (il marque, il ne masque pas de bâti), distinct des repères', () => {
    const h = renderToStaticMarkup(createElement(InterrupteurFuturBati, { afficherFutur: true, onAfficherFutur: noop }));
    expect(h).toContain('Signaler le futur bâti'); expect(h).toContain('checked');
    expect(h).not.toContain('Afficher les repères');
  });

  it('les deux interrupteurs sont présents en plein écran quand leurs handlers sont fournis', () => {
    const aff: AffectationEtat = { empreinteFigee: true, motif: null, colonneManquante: false, schema: schemaABC(), polygones: [], corps: [] };
    const h = renderToStaticMarkup(createElement(SchemaPleinEcran, { titre: NOM_SCHEMA_ORIGINE, affectation: aff, persiste: true, onAffecter: noop, onFermer: noop, onAfficherReperes: noop, onAfficherFutur: noop }));
    expect(h).toContain('Afficher les repères'); expect(h).toContain('Signaler le futur bâti');
  });
});
