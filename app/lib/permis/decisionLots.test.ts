import { describe, it, expect } from 'vitest';
import { decisionLots } from './decisionLots';
import type { ResultatLectureGed, PieceLue } from './lectureGed';
import type { CandidatCote, RapportExtraction } from './extractionCaracteristiques';

/**
 * N8-B — décision des faits ÉNONCÉS par lot (pure). « Lot 2D<n> en R+<m> » → nb_etages ; plan SS par lot → 1 sous-sol ;
 * plancher SEULEMENT pour le lot le plus haut (chaînage, à vérifier) ; sommet = max acrotère au niveau permis. Corroboré si ≥2 pièces.
 */
const page = (n: number, texte: string) => ({ page: n, texte, aTexte: true });
const piece = (id: number, nomFichier: string, pages: { page: number; texte: string; aTexte: boolean }[]): PieceLue => ({ id, nomFichier, typeMime: 'application/pdf', nbPages: pages.length, pages, muette: false, motif: null });
const ged = (pieces: PieceLue[]): ResultatLectureGed => ({ dossierId: 1, pieces, bilan: { nbPieces: pieces.length, nbPages: 0, pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 } });
const cote = (valeur: number, qualif: string | null, page = 2): CandidatCote => ({ texteBrut: `NGF +${valeur}`, valeur, niveau: null, qualificatifSommet: qualif, provenance: { pieceId: 9, pieceNom: 'PC3.pdf', page } });
const rapport = (cotes: CandidatCote[], niveaux: { niveau: string; valeur: number }[]): RapportExtraction => ({
  cotes, gabarits: [], sousSols: [], reperes: [], hsp: [], dalles: [],
  bilan: { nbPieces: 0, piecesAvecCote: 0, pagesAvecCote: 0, nbCotes: cotes.length, coteMax: null, cotesQualifiees: 0, qualificatifsVus: [], piecesSansCandidat: [], niveaux: niveaux.map((n) => ({ niveau: n.niveau, cotes: [{ valeur: n.valeur, provenance: { pieceId: 9, pieceNom: 'PC3.pdf', page: 2 } }] })) },
});

const corpus = () => ged([
  piece(1, 'PC4_A4.pdf', [page(3, 'création de deux bâtiments : Lot 2D1 en R+7 comprenant des commerces, Lot 2D2 en R+6 donnant sur…')]),
  piece(2, 'PC4_A5.pdf', [page(3, 'L’opération : Lot 2D1 en R+7 comprenant…, Lot 2D2 en R+6…')]),
  piece(3, 'PC39.pdf', [page(16, "Carnet Plans Sous-sol 1 2D1 PLN SS1 ARC"), page(23, 'Sous-sol 1 2D2 PLN SS1 ARC')]),
  piece(4, 'PC40.pdf', [page(27, 'PLAN DE SOUS SOL 1 2D1 PLN SI-SS PC40')]),
]);

describe('decisionLots', () => {
  const d = decisionLots(corpus(), rapport([cote(89.46, 'acrotère'), cote(80.33, 'acrotère')], [{ niveau: 'R07', valeur: 82.93 }, { niveau: 'R03', valeur: 70.19 }]));
  const lot = (r: string) => d.lots.find((l) => l.repere === r)!;

  it('nb_etages énoncé par lot, corroboré (≥2 pièces)', () => {
    expect(lot('2D1').nbEtages).toMatchObject({ valeur: 7, confiance: 'confirmee' });
    expect(lot('2D2').nbEtages).toMatchObject({ valeur: 6, confiance: 'confirmee' });
  });
  it('nb_niveaux_sous_sol = 1 par lot, avec la note « partage non déterminé »', () => {
    expect(lot('2D1').nbSousSol).toMatchObject({ valeur: 1 });
    expect(lot('2D1').nbSousSol!.note).toContain('partage');
    expect(lot('2D2').nbSousSol!.valeur).toBe(1);
  });
  it('plancher SEULEMENT sur le lot le plus haut (2D1), par chaînage, à vérifier', () => {
    expect(lot('2D1').plancher).toMatchObject({ valeur: 82.93, confiance: 'a_verifier' });
    expect(lot('2D1').plancher!.motif).toContain('R07 = 82.93');
    expect(lot('2D2').plancher).toBeNull();
    expect(lot('2D2').plancherMotif).toContain('non libellé par lot');
  });
  it('sommet = max acrotère au niveau PERMIS, réserve enrichie', () => {
    expect(d.sommetPermis!.valeur).toBe(89.46);
    expect(d.sommetPermis!.reserve).toContain('superstructure de toiture');
  });
  it('chaque lot porte le motif de « sommet non rattaché »', () => {
    expect(lot('2D1').sommetMotif).toContain('attribution par lot');
  });
});
