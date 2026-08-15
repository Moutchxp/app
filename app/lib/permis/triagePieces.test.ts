import { describe, it, expect } from 'vitest';
import { trierPieces, PLAFOND_PAGES_TRIAGE } from './triagePieces';
import type { PieceLue, ResultatLectureGed } from './lectureGed';
import type { CandidatCote, RapportExtraction } from './extractionCaracteristiques';

/**
 * N7-A — triage déterministe (données SYNTHÉTIQUES, aucune dépendance à la GED réelle). Chaque règle isolément, la priorité entre
 * règles, l'exclusion par nom, l'exclusion par marqueur, la troncature, et le cas « aucune page retenue » (résultat légitime).
 */
type PageIn = { page: number; texte: string; aTexte: boolean };
const piece = (id: number, nomFichier: string, pages: PageIn[]): PieceLue => ({
  id, nomFichier, typeMime: 'application/pdf', nbPages: pages.length, pages, muette: pages.every((p) => !p.aTexte), motif: null,
});
const ged = (pieces: PieceLue[]): ResultatLectureGed => ({
  dossierId: 1, pieces,
  bilan: { nbPieces: pieces.length, nbPages: pieces.reduce((s, p) => s + p.pages.length, 0), pagesAvecTexte: 0, pagesSansTexte: 0, piecesMuettes: 0 },
});
const cote = (pieceId: number, pieceNom: string, page: number, valeur: number, qualif: string | null): CandidatCote =>
  ({ texteBrut: `NGF +${valeur}`, valeur, niveau: null, qualificatifSommet: qualif, provenance: { pieceId, pieceNom, page } });
const rapport = (cotes: CandidatCote[]): RapportExtraction => ({ cotes } as unknown as RapportExtraction);

describe('trierPieces — R1 cote_qualifiee', () => {
  it('retient une page portant une cote qualifiée, avec l’indice des valeurs', () => {
    const g = ged([piece(1, 'PC3.pdf', [{ page: 2, texte: 'plan', aTexte: true }])]);
    const p = trierPieces(g, rapport([cote(1, 'PC3.pdf', 2, 89.46, 'acrotère'), cote(1, 'PC3.pdf', 2, 88.41, 'acrotère')]));
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0]).toMatchObject({ piece: 'PC3.pdf', page: 2, regle: 'cote_qualifiee', priorite: 1 });
    expect(p.pages[0].indice).toContain('88.41');
    expect(p.pages[0].indice).toContain('89.46');
  });
  it('une cote NGF NON qualifiée ne déclenche pas R1', () => {
    const g = ged([piece(1, 'PC3.pdf', [{ page: 2, texte: 'plan', aTexte: true }])]);
    expect(trierPieces(g, rapport([cote(1, 'PC3.pdf', 2, 59.63, null)])).pages).toHaveLength(0);
  });
});

describe('trierPieces — R2 vue_par_lot', () => {
  it('retient une page MUETTE d’une pièce à >=2 repères distincts', () => {
    const g = ged([piece(1, 'C_A2.pdf', [
      { page: 1, texte: 'façades du LOT 2D1 et du lot 2D2', aTexte: true },
      { page: 14, texte: '', aTexte: false },
    ])]);
    const p = trierPieces(g, rapport([]));
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0]).toMatchObject({ page: 14, regle: 'vue_par_lot' });
    expect(p.pages[0].indice).toContain('2D1');
    expect(p.pages[0].indice).toContain('2D2');
  });
  it('un seul repère → pas de R2', () => {
    const g = ged([piece(1, 'X.pdf', [{ page: 1, texte: 'LOT 2D1 seulement', aTexte: true }, { page: 2, texte: '', aTexte: false }])]);
    expect(trierPieces(g, rapport([])).pages).toHaveLength(0);
  });
});

describe('trierPieces — R3 planche_muette', () => {
  it('retient une page muette d’une pièce portant des cotes NGF ailleurs (et <2 repères)', () => {
    const g = ged([piece(1, 'PLAN.pdf', [{ page: 1, texte: 'coupe', aTexte: true }, { page: 2, texte: '', aTexte: false }])]);
    const p = trierPieces(g, rapport([cote(1, 'PLAN.pdf', 1, 70, null)]));
    expect(p.pages).toHaveLength(1);
    expect(p.pages[0]).toMatchObject({ page: 2, regle: 'planche_muette' });
  });
  it('page muette d’une pièce SANS cote et SANS repère → rien', () => {
    const g = ged([piece(1, 'VIDE.pdf', [{ page: 1, texte: 'texte quelconque', aTexte: true }, { page: 2, texte: '', aTexte: false }])]);
    expect(trierPieces(g, rapport([])).pages).toHaveLength(0);
  });
});

describe('trierPieces — priorité entre règles', () => {
  it('une page muette d’une pièce à la fois multi-repères ET à cotes → R2 (prioritaire sur R3)', () => {
    const g = ged([piece(1, 'MIX.pdf', [{ page: 1, texte: 'LOT 2D1 et LOT 2D2', aTexte: true }, { page: 2, texte: '', aTexte: false }])]);
    const p = trierPieces(g, rapport([cote(1, 'MIX.pdf', 1, 70, null)]));
    expect(p.pages[0].regle).toBe('vue_par_lot');
  });
  it('R1 (cote_qualifiee) passe avant R2 dans le tri', () => {
    const g = ged([
      piece(1, 'A_lot.pdf', [{ page: 1, texte: 'LOT 2D1 LOT 2D2', aTexte: true }, { page: 9, texte: '', aTexte: false }]),
      piece(2, 'Z_cote.pdf', [{ page: 3, texte: 'coupe', aTexte: true }]),
    ]);
    const p = trierPieces(g, rapport([cote(2, 'Z_cote.pdf', 3, 89.46, 'acrotère')]));
    expect(p.pages[0].regle).toBe('cote_qualifiee'); // priorité, même si Z_cote trie après A_lot alphabétiquement
  });
});

describe('trierPieces — exclusion par NOM (portée PIÈCE)', () => {
  it('exclut la pièce ENTIÈRE (cerfa) — aucune page sélectionnée, portée piece', () => {
    const g = ged([piece(1, 'Cerfa_13409.pdf', [{ page: 1, texte: 'LOT 2D1 LOT 2D2', aTexte: true }, { page: 2, texte: '', aTexte: false }])]);
    const p = trierPieces(g, rapport([cote(1, 'Cerfa_13409.pdf', 1, 89.46, 'acrotère')]));
    expect(p.pages).toHaveLength(0);
    const ex = p.exclusions.find((e) => e.piece === 'Cerfa_13409.pdf');
    expect(ex).toMatchObject({ portee: 'piece' });
    expect(ex!.page).toBeUndefined();
    expect(ex!.motif).toContain('nom');
  });
});

describe('trierPieces — exclusion par MARQUEUR (portée PAGE)', () => {
  it('n’écarte QUE la page marquée ; les autres pages de la pièce restent éligibles', () => {
    const g = ged([piece(1, 'plan.pdf', [
      { page: 1, texte: 'Je soussigné M. X, demande…', aTexte: true }, // page identité → exclue
      { page: 3, texte: 'coupe', aTexte: true },                        // page R1 → retenue
    ])]);
    const p = trierPieces(g, rapport([cote(1, 'plan.pdf', 3, 89.46, 'acrotère')]));
    expect(p.pages).toEqual([expect.objectContaining({ page: 3, regle: 'cote_qualifiee' })]);
    const ex = p.exclusions.find((e) => e.page === 1);
    expect(ex).toMatchObject({ portee: 'page', page: 1 });
    expect(ex!.motif).toContain('je soussigne');
  });
});

describe('trierPieces — « siret » n’exclut qu’avec un contexte demandeur (même page)', () => {
  it('siret SEUL (cartouche architecte) → PAS d’exclusion', () => {
    const g = ged([piece(1, 'plan.pdf', [{ page: 1, texte: 'Cartouche — SIRET 123 456 789', aTexte: true }])]);
    const p = trierPieces(g, rapport([cote(1, 'plan.pdf', 1, 89.46, 'acrotère')]));
    expect(p.pages).toHaveLength(1);
    expect(p.exclusions).toHaveLength(0);
  });
  it('siret + contexte demandeur (même page) → page exclue', () => {
    const g = ged([piece(1, 'plan.pdf', [{ page: 1, texte: 'Le demandeur, SIRET 123 456 789, atteste', aTexte: true }])]);
    const p = trierPieces(g, rapport([cote(1, 'plan.pdf', 1, 89.46, 'acrotère')]));
    expect(p.pages).toHaveLength(0);
    expect(p.exclusions.find((e) => e.page === 1)).toMatchObject({ portee: 'page' });
  });
  it('siret sur une page, contexte demandeur sur une AUTRE page → pas d’exclusion (co-occurrence exigée sur la même page)', () => {
    const g = ged([piece(1, 'plan.pdf', [
      { page: 1, texte: 'SIRET 123 456 789', aTexte: true },
      { page: 2, texte: 'le demandeur', aTexte: true },
    ])]);
    const p = trierPieces(g, rapport([cote(1, 'plan.pdf', 1, 89.46, 'acrotère')]));
    expect(p.exclusions).toHaveLength(0);
    expect(p.pages).toHaveLength(1);
  });
});

describe('trierPieces — troncature et cas vide', () => {
  it('tronque au plafond, journalise ce qui saute, tronque=true', () => {
    const pages: PageIn[] = [{ page: 1, texte: 'x', aTexte: true }, { page: 2, texte: 'x', aTexte: true }, { page: 3, texte: 'x', aTexte: true }];
    const g = ged([piece(1, 'P.pdf', pages)]);
    const cotes = pages.map((pg) => cote(1, 'P.pdf', pg.page, 80 + pg.page, 'acrotère'));
    const p = trierPieces(g, rapport(cotes), 2);
    expect(p.plafond).toBe(2);
    expect(p.pages).toHaveLength(2);
    expect(p.tronque).toBe(true);
    expect(p.exclusions.some((e) => /plafond/.test(e.motif))).toBe(true);
  });
  it('aucune page retenue = résultat légitime (pas une erreur)', () => {
    const g = ged([piece(1, 'rien.pdf', [{ page: 1, texte: 'texte sans cote ni repère', aTexte: true }])]);
    const p = trierPieces(g, rapport([]));
    expect(p.pages).toEqual([]);
    expect(p.tronque).toBe(false);
    expect(p.plafond).toBe(PLAFOND_PAGES_TRIAGE);
  });
});
