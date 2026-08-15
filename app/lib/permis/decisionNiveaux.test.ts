import { describe, it, expect } from 'vitest';
import { decisionNiveaux } from './decisionNiveaux';
import type { ResultatLectureGed, PieceLue } from './lectureGed';

/**
 * N9-B — décision PURE depuis le TABLEAU DE NIVEAUX (coupe), ancré sur « BAT 2D<x> ». On éprouve : les deux sérialisations
 * (2D2 inline, 2D1 bloc) ; l'attribution PAR BÂTIMENT (le R07 de 2D1 = 84,57, celui de 2D2 = 82,93 — plus de confusion) ;
 * le sommet = acrotère corroboré SINON toiture (garde-corps jamais retenu) ; la corroboration ≥2 pièces ; la tension R+6/R+7.
 */
const page = (n: number, texte: string) => ({ page: n, texte, aTexte: true });
const piece = (id: number, nomFichier: string, pages: { page: number; texte: string; aTexte: boolean }[]): PieceLue => ({ id, nomFichier, typeMime: 'application/pdf', nbPages: pages.length, pages, muette: false, motif: null });
const ged = (pieces: PieceLue[]): ResultatLectureGed => ({ dossierId: 1, pieces, bilan: { nbPieces: pieces.length, nbPages: 0, pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 } });

// 2D2 = INLINE (label collé à sa cote) ; 2D1 = BLOC (labels en série puis cotes en série) + trio de sommet (acrotère/garde-corps par NVP).
const COUPE =
  'R01 +61.09 m NGF R02 +64.67 m NGF R03 +68.19 m NGF R04 +71.71 m NGF R05 +75.23 m NGF R06 +79.30 m NGF R07 +82.93 m NGF Rdc +56.47 m NGF TOITURE +86.11 m NGF SS1 +52.93 m NGF ' +
  'LIMITE PARCELLAIRE Av. Benoit Frachon BAT 2D2 NVP 56.20 NVP 82.60 ' +
  'BAT 2D1 Rdc R01 R02 R03 R04 R05 R06 R07 TOITURE SS1  +59.63m NGF +63.15m NGF +66.67m NGF +70.19m NGF +73.71m NGF +77.23m NGF +80.75m NGF +84.57m NGF +88.41m NGF +53.83m NGF ' +
  'NVP 88.08 NVP 84.24 NVP 80.42 NVP 53.50 NGF +88.91 NGF +89.46 NGF +88.41 NVP 88.58 Acrotère Garde-corps à lisse NVP 89.13 Niveau sol fini NVP 88.08 Acrotère';
// PC5 (élévation) : 2D2 porte un acrotère à +87.13 (au-dessus de sa toiture 86.11) — mais sur CETTE seule pièce.
const ELEVATION =
  'BAT 2D2 NGF +87.13 Acrotère NVP 86.80 R01 +61.09 m NGF R02 +64.67 m NGF R03 +68.19 m NGF R04 +71.71 m NGF R05 +75.23 m NGF R06 +79.30 m NGF R07 +82.93 m NGF Rdc +56.47 m NGF TOITURE +86.11 m NGF ' +
  'BAT 2D1 Rdc R01 R02 R03 R04 R05 R06 R07 TOITURE SS1  +59.63m NGF +63.15m NGF +66.67m NGF +70.19m NGF +73.71m NGF +77.23m NGF +80.75m NGF +84.57m NGF +88.41m NGF +53.83m NGF';

const corpus = () => ged([
  piece(1, 'PC3.pdf', [page(2, COUPE)]),
  piece(2, 'PC40.pdf', [page(26, COUPE)]),
  piece(3, 'PC5.pdf', [page(3, ELEVATION)]),
]);

describe('decisionNiveaux', () => {
  const d = decisionNiveaux(corpus(), { '2D1': { valeur: 7, piece: 'PC4.pdf' }, '2D2': { valeur: 6, piece: 'PC4.pdf' } });
  const c = (r: string) => d.corps.find((x) => x.repere === r)!;

  it('attribue PAR BÂTIMENT : le R07 de 2D1 = 84,57, celui de 2D2 = 82,93 (plus de confusion)', () => {
    expect(c('2D1').plancher).toMatchObject({ valeur: 84.57, label: 'R07', confiance: 'confirmee' });
    expect(c('2D2').plancher).toMatchObject({ valeur: 82.93, label: 'R07', confiance: 'confirmee' });
  });
  it('nb_etages depuis la table (7), nb_sous_sol = 1, corroborés', () => {
    expect(c('2D1').nbEtages).toMatchObject({ valeur: 7, confiance: 'confirmee' });
    expect(c('2D1').nbSousSol).toMatchObject({ valeur: 1, confiance: 'confirmee' });
  });
  it('sommet 2D1 = ACROTÈRE 88,91 (corroboré), garde-corps 89,46 écarté — jamais le sommet', () => {
    expect(c('2D1').sommet).toMatchObject({ valeur: 88.91, qualif: 'acrotere', confiance: 'confirmee' });
    expect(c('2D1').gardeCorps.map((g) => g.cote)).toContain(89.46);
    expect(c('2D1').sommet!.valeur).not.toBe(89.46);
  });
  it('sommet 2D2 = TOITURE 86,11 (pas d’acrotère corroboré) ; l’acrotère 87,13 (1 pièce) est signalé, non retenu', () => {
    expect(c('2D2').sommet).toMatchObject({ valeur: 86.11, qualif: 'toiture' });
    expect(c('2D2').sommet!.note).toContain('87.13');
    expect(c('2D2').sommet!.note).toContain('non corroboré');
  });
  it('tension R+6 / R+7 sur 2D2 : la structure écrit 7 mais pose la réserve citant les deux', () => {
    expect(c('2D2').nbEtages!.valeur).toBe(7);
    expect(c('2D2').nbEtages!.tension).toContain('R+6');
    expect(c('2D2').nbEtages!.tension).toContain('PC4');
    expect(c('2D1').nbEtages!.tension).toBeNull(); // 2D1 concorde (7 = R+7)
  });
  it('le garde-corps le plus haut (89,46) est désormais attribué à 2D1 → l’ex-sommet permis a une adresse', () => {
    expect(d.gardeCorpsAttribue).toEqual({ cote: 89.46, repere: '2D1' });
  });
});

/**
 * N9-C — ancrage bâtiment élargi : « BAT 2D<x> » (coupe) ET cartouche « (I)LOT 2D<x> » / code DWG « 2D<x> PLN » (plans, élévations).
 * Formes distinguables (`forme` sur chaque source). Le SOMMET reste borné aux pages BAT (l'appariement NVP y est fiable) : une page
 * LOT/PLN corrobore les TABLES mais n'injecte PAS de sommet (sinon glissement d'étiquette, cf. rapport). Pas de faux positif « 2D » nu.
 */
// Table de niveaux de 2D2 en BLOC, page identifiée par le code DWG « 2D2 PLN » (plan de toiture) — SANS titre « BAT ».
const PLAN_TOITURE_2D2 =
  '2D2 PLN TOI Carnet Plans de securite  Rdc R01 R02 R03 R04 R05 R06 R07 TOITURE SS1  ' +
  '+56.47m NGF +61.09m NGF +64.67m NGF +68.19m NGF +71.71m NGF +75.23m NGF +79.30m NGF +82.93m NGF +86.11m NGF +52.93m NGF ' +
  'ACROTERE TOITURE +99.99 NGF Acrotère NVP 99.66';   // stray « acrotère 99.99 » : DOIT être ignoré (page non-BAT)

describe('decisionNiveaux — N9-C ancrage LOT/PLN', () => {
  const d = decisionNiveaux(ged([
    piece(1, 'PC3.pdf', [page(2, COUPE)]),                 // BAT (coupe) : tables 2D1+2D2 + sommets
    piece(2, 'PC40.pdf', [page(40, PLAN_TOITURE_2D2)]),    // PLN 2D2 : corrobore la table, PAS le sommet
  ]));
  const c = (r: string) => d.corps.find((x) => x.repere === r)!;

  it('une page « 2D2 PLN » (sans BAT) est rattachée à 2D2 et corrobore sa table', () => {
    expect(c('2D2')).toBeTruthy();
    expect(c('2D2').plancher).toMatchObject({ valeur: 82.93, confiance: 'confirmee' }); // 2 pièces : PC3(bat) + PC40(pln)
    expect(new Set(c('2D2').sources.map((s) => s.piece)).size).toBe(2);
  });
  it('la forme d’ancrage est tracée par source (bat vs pln), jamais fusionnée', () => {
    const formes = c('2D2').sources.map((s) => s.forme);
    expect(formes).toContain('bat');
    expect(formes).toContain('pln');
  });
  it('GARDE-FOU : le sommet ne vient QUE des pages BAT — l’« acrotère 99,99 » d’une page PLN est ignoré', () => {
    expect(c('2D2').sommet!.qualif).toBe('toiture');           // reste 86,11 (coupe), pas 99,99
    expect(c('2D2').sommet!.valeur).toBe(86.11);
    expect(c('2D2').gardeCorps.map((g) => g.cote)).not.toContain(99.99);
    expect(c('2D2').niveaux.some((n) => n.cote === 99.99)).toBe(false);
  });

  it('faux positifs écartés : « LOT 2D » (sans chiffre) et un hash « 2d5567 » ne créent aucun corps', () => {
    const bruit = decisionNiveaux(ged([
      piece(1, 'MASSE.pdf', [page(1, 'LOT 2D plan masse 2d5567 Rdc R01 R02 R03 TOITURE  +56m NGF +61m NGF +64m NGF +68m NGF +86m NGF')]),
    ]));
    expect(bruit.corps).toHaveLength(0); // aucune ancre valide → table orpheline, non attribuée
  });
});
