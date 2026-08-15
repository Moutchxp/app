import { describe, it, expect } from 'vitest';
import { decisionNiveaux } from './decisionNiveaux';
import type { ResultatLectureGed, PieceLue } from './lectureGed';

/**
 * N9-B/C/D — décision PURE depuis le TABLEAU DE NIVEAUX + le SOMMET par ancrage sur la toiture. On éprouve : l'attribution des tables
 * PAR BÂTIMENT (BAT + cartouche LOT/PLN, sans faux positif « 2D » nu) ; la tension R+6/R+7 ; et surtout (N9-D) le sommet = acrotère
 * ÉTIQUETÉ dans une FENÊTRE bornée au-dessus de SA toiture, avec ses trois gardes : exclusion NVP, exclusion superstructure nommée,
 * fenêtre qui ne mord pas la toiture voisine. Garde-corps toujours écarté ; sinon on garde la toiture.
 */
const page = (n: number, texte: string) => ({ page: n, texte, aTexte: true });
const piece = (id: number, nomFichier: string, pages: { page: number; texte: string; aTexte: boolean }[]): PieceLue => ({ id, nomFichier, typeMime: 'application/pdf', nbPages: pages.length, pages, muette: false, motif: null });
const ged = (pieces: PieceLue[]): ResultatLectureGed => ({ dossierId: 1, pieces, bilan: { nbPieces: pieces.length, nbPages: 0, pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 } });

// TABLES (BAT) : 2D2 inline + 2D1 bloc → toitures 2D1 = 88,41 · 2D2 = 86,11.
const COUPE =
  'R01 +61.09 m NGF R02 +64.67 m NGF R03 +68.19 m NGF R04 +71.71 m NGF R05 +75.23 m NGF R06 +79.30 m NGF R07 +82.93 m NGF Rdc +56.47 m NGF TOITURE +86.11 m NGF SS1 +52.93 m NGF BAT 2D2 ' +
  'BAT 2D1 Rdc R01 R02 R03 R04 R05 R06 R07 TOITURE SS1  +59.63m NGF +63.15m NGF +66.67m NGF +70.19m NGF +73.71m NGF +77.23m NGF +80.75m NGF +84.57m NGF +88.41m NGF +53.83m NGF';

// PLAN MASSE : étiquettes de sommet en forme DIRECTE (« NGF <qualif> <cote> »), SANS ancre bâtiment (attribution par toiture). Pièges :
//  - « NVP 88.58 Acrotère » : forme NVP seule → doit être IGNORÉE (garde n°1) ;
//  - « acrotère esc 89.41 » : superstructure → EXCLUE (garde n°2) ;
//  - « acrotère 79.32 » : terrasse basse → hors fenêtre.
const MASSE =
  'NGF acrotère 88.91 NVP 88.58 NGF garde-corps 89.46 NVP 89.13 NGF sol fini 88.41 ' +
  'NGF acrotère esc 89.41 NVP 89.08 ' +
  'NGF acrotère 87.13 NVP 86.80 NGF sol fini 86.11 NGF acrotère 79.32 NVP 78.99 ' +
  'NVP 88.58 Acrotère';

const corpus = () => ged([
  piece(1, 'PC3.pdf', [page(2, COUPE)]),
  piece(2, 'PC40.pdf', [page(26, COUPE)]),
  piece(3, 'PC2.pdf', [page(7, MASSE)]),
  piece(4, 'PC39.pdf', [page(15, MASSE)]),
]);

describe('decisionNiveaux — tables (N9-B)', () => {
  const d = decisionNiveaux(corpus(), { '2D2': { valeur: 6, piece: 'PC4.pdf' } });
  const c = (r: string) => d.corps.find((x) => x.repere === r)!;
  it('plancher PAR BÂTIMENT (2D1 = 84,57 ; 2D2 = 82,93)', () => {
    expect(c('2D1').plancher).toMatchObject({ valeur: 84.57, label: 'R07', confiance: 'confirmee' });
    expect(c('2D2').plancher).toMatchObject({ valeur: 82.93, label: 'R07', confiance: 'confirmee' });
  });
  it('nb_etages 7 / nb_sous_sol 1 corroborés', () => {
    expect(c('2D1').nbEtages).toMatchObject({ valeur: 7, confiance: 'confirmee' });
    expect(c('2D1').nbSousSol).toMatchObject({ valeur: 1, confiance: 'confirmee' });
  });
  it('tension R+6 / R+7 sur 2D2 préservée', () => {
    expect(c('2D2').nbEtages!.valeur).toBe(7);
    expect(c('2D2').nbEtages!.tension).toContain('R+6');
    expect(c('2D1').nbEtages!.tension).toBeNull();
  });
});

describe('decisionNiveaux — sommet par ancrage sur la toiture (N9-D)', () => {
  const d = decisionNiveaux(corpus());
  const c = (r: string) => d.corps.find((x) => x.repere === r)!;

  it('2D1 sommet = acrotère 88,91 (toiture 88,41, écart 0,50), corroboré ≥2 pièces', () => {
    expect(c('2D1').sommet).toMatchObject({ valeur: 88.91, qualif: 'acrotere', ecart: 0.5, confiance: 'confirmee' });
  });
  it('2D2 sommet = acrotère 87,13 (toiture 86,11, écart 1,02), corroboré — LA BASCULE', () => {
    expect(c('2D2').sommet).toMatchObject({ valeur: 87.13, qualif: 'acrotere', ecart: 1.02, confiance: 'confirmee' });
  });
  it('GARDE 1 — fuite NVP : « NVP 88.58 Acrotère » ne produit JAMAIS le sommet 88,58', () => {
    expect(c('2D1').sommet!.valeur).not.toBe(88.58);
    expect(c('2D2').sommet!.valeur).not.toBe(88.58);
  });
  it('GARDE 2 — superstructure nommée : « acrotère esc 89,41 » exclu → 2D1 reste 88,91', () => {
    expect(c('2D1').sommet!.valeur).toBe(88.91);
    expect(c('2D1').sommet!.valeur).not.toBe(89.41);
  });
  it('GARDE 3 — fenêtre bornée : l’acrotère 88,91 de 2D1 (écart +2,80 au-dessus de 86,11) n’entre PAS dans la fenêtre de 2D2', () => {
    expect(c('2D2').sommet!.valeur).not.toBe(88.91);
  });
  it('garde-corps 89,46 : jamais un sommet — écarté et attribué à 2D1', () => {
    expect(c('2D1').gardeCorps.map((g) => g.cote)).toContain(89.46);
    expect(c('2D1').sommet!.valeur).not.toBe(89.46);
    expect(d.gardeCorpsAttribue).toEqual({ cote: 89.46, repere: '2D1' });
  });
});

const TAB_2D2 = 'R01 +61.09 m NGF R02 +64.67 m NGF R03 +68.19 m NGF R04 +71.71 m NGF R07 +82.93 m NGF Rdc +56.47 m NGF TOITURE +86.11 m NGF BAT 2D2';
describe('decisionNiveaux — sommet, cas limites (N9-D)', () => {
  const c = (d: ReturnType<typeof decisionNiveaux>, r: string) => d.corps.find((x) => x.repere === r)!;

  it('acrotère HORS fenêtre (corroboré mais +1,89 m > 1,50) → non retenu, toiture gardée', () => {
    const HAUT = 'NGF acrotère 88.00 NVP 87.67 NGF sol fini 86.11'; // 88,00 − 86,11 = 1,89 m
    const d = decisionNiveaux(ged([piece(1, 'A.pdf', [page(1, TAB_2D2)]), piece(2, 'B.pdf', [page(1, HAUT)]), piece(3, 'C.pdf', [page(1, HAUT)])]));
    expect(c(d, '2D2').sommet).toMatchObject({ valeur: 86.11, qualif: 'toiture' });
    expect(c(d, '2D2').sommet!.note).toContain('fenêtre');
  });
  it('aucun acrotère → toiture retenue avec motif', () => {
    const d = decisionNiveaux(ged([piece(1, 'A.pdf', [page(1, TAB_2D2)]), piece(2, 'B.pdf', [page(1, TAB_2D2)])]));
    expect(c(d, '2D2').sommet).toMatchObject({ valeur: 86.11, qualif: 'toiture' });
    expect(c(d, '2D2').sommet!.note).toContain('aucun acrotère');
  });
  it('acrotère vu sur 1 seule pièce → non corroboré, toiture gardée + note', () => {
    const ACRO = 'NGF acrotère 87.13 NVP 86.80 NGF sol fini 86.11';
    const d = decisionNiveaux(ged([piece(1, 'A.pdf', [page(1, TAB_2D2)]), piece(2, 'B.pdf', [page(1, ACRO)])]));
    expect(c(d, '2D2').sommet).toMatchObject({ valeur: 86.11, qualif: 'toiture' });
    expect(c(d, '2D2').sommet!.note).toContain('1 pièce');
  });
});

// PLN 2D2 (plan de toiture) : table BLOC + étiquette directe d'acrotère — page SANS « BAT », rattachée par le code DWG « 2D2 PLN ».
const PLAN_TOITURE_2D2 =
  '2D2 PLN TOI Carnet Plans de securite  Rdc R01 R02 R03 R04 R05 R06 R07 TOITURE SS1  ' +
  '+56.47m NGF +61.09m NGF +64.67m NGF +68.19m NGF +71.71m NGF +75.23m NGF +79.30m NGF +82.93m NGF +86.11m NGF +52.93m NGF ' +
  'NGF acrotère 87.13 NVP 86.80 NGF sol fini 86.11';

describe('decisionNiveaux — N9-C ancrage LOT/PLN', () => {
  const d = decisionNiveaux(ged([
    piece(1, 'PC3.pdf', [page(2, COUPE)]),               // BAT (coupe) : tables 2D1+2D2
    piece(2, 'PC40.pdf', [page(40, PLAN_TOITURE_2D2)]),  // PLN 2D2 : corrobore la table ET, N9-D, l'acrotère (par toiture)
  ]));
  const c = (r: string) => d.corps.find((x) => x.repere === r)!;

  it('une page « 2D2 PLN » (sans BAT) est rattachée à 2D2 et corrobore sa table', () => {
    expect(c('2D2').plancher).toMatchObject({ valeur: 82.93, confiance: 'confirmee' }); // PC3(bat) + PC40(pln)
    expect(new Set(c('2D2').sources.map((s) => s.piece)).size).toBe(2);
  });
  it('la forme d’ancrage est tracée par source (bat vs pln)', () => {
    const formes = c('2D2').sources.map((s) => s.forme);
    expect(formes).toContain('bat');
    expect(formes).toContain('pln');
  });
  it('N9-D : l’acrotère 87,13 d’une page PLN (non-BAT) est bien lu par ancrage toiture (mais 2 pièces requises pour retenir)', () => {
    // ici 87,13 n'est que sur PC40 → non corroboré → toiture ; le motif cite bien l'acrotère vu 1 fois
    expect(c('2D2').sommet!.note).toContain('87.13');
  });
  it('faux positifs écartés : « LOT 2D » (sans chiffre) et un hash « 2d5567 » ne créent aucun corps', () => {
    const bruit = decisionNiveaux(ged([piece(1, 'MASSE.pdf', [page(1, 'LOT 2D plan masse 2d5567 Rdc R01 R02 R03 TOITURE  +56m NGF +61m NGF +64m NGF +68m NGF +86m NGF')])]));
    expect(bruit.corps).toHaveLength(0);
  });
});
