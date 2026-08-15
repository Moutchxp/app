import { describe, it, expect } from 'vitest';
import { decisionSommet, QUALIFICATIF_SOMMET, RESERVE_SOMMET } from './decisionSommet';
import type { CandidatCote, Provenance, RapportExtraction } from './extractionCaracteristiques';

/**
 * N5-C — DÉCISION DU SOMMET (pure). On éprouve les règles ARBITRÉES : sommet = MAX des cotes « acrotère » ; aucun plancher/filtre
 * bas (une cote non-acrotère plus haute n'entre jamais) ; réserve TOUJOURS portée ; confiance 'a_verifier' par défaut, 'confirmee'
 * seulement si (≥2 pièces distinctes ET trame sûre + épaisseur plausible) ; candidats « niveau fini » journalisés, jamais promus.
 */

const prov = (pieceId: number, page = 1): Provenance => ({ pieceId, pieceNom: `piece${pieceId}.pdf`, page });
const cote = (valeur: number, qualificatifSommet: string | null, pieceId: number, page = 1): CandidatCote => ({
  texteBrut: `NGF +${valeur}`, valeur, niveau: null, qualificatifSommet, provenance: prov(pieceId, page),
});

/** Construit un RapportExtraction minimal : seuls `cotes` et `bilan.niveaux` sont lus par `decisionSommet`. */
function rapport(cotes: CandidatCote[], niveaux: { niveau: string; valeurs: number[] }[] = []): RapportExtraction {
  return {
    cotes, gabarits: [], sousSols: [], reperes: [], hsp: [], dalles: [],
    bilan: {
      nbPieces: 0, piecesAvecCote: 0, pagesAvecCote: 0, nbCotes: cotes.length, coteMax: null,
      cotesQualifiees: 0, qualificatifsVus: [], piecesSansCandidat: [],
      niveaux: niveaux.map((n) => ({ niveau: n.niveau, cotes: n.valeurs.map((valeur) => ({ valeur, provenance: prov(1) })) })),
    },
  };
}

describe('decisionSommet — sélection du sommet', () => {
  it('retient le MAXIMUM des cotes « acrotère », en NGF absolu', () => {
    const d = decisionSommet(rapport([cote(80.33, 'acrotère', 1), cote(89.46, 'acrotère', 1), cote(55.58, 'acrotère', 1)]));
    expect(d.valeurNgf).toBe(89.46);
    expect(d.qualificatif).toBe(QUALIFICATIF_SOMMET);
    expect(d.raisonAbsence).toBeNull();
  });

  it("n'écarte AUCUNE cote basse par un plancher (le max seul compte)", () => {
    // 55.58 (voisin bas) est présent mais sans effet : le max reste le max. Aucun filtre bas n'est appliqué.
    const d = decisionSommet(rapport([cote(55.58, 'acrotère', 1), cote(89.46, 'acrotère', 1)]));
    expect(d.valeurNgf).toBe(89.46);
  });

  it('ignore une cote NON « acrotère » même si elle est plus haute (seul l’acrotère est un sommet)', () => {
    const d = decisionSommet(rapport([cote(89.46, 'acrotère', 1), cote(120, 'faîtage', 1), cote(150, null, 1)]));
    expect(d.valeurNgf).toBe(89.46);
  });

  it('aucune cote acrotère → pas de valeur, raison explicite', () => {
    const d = decisionSommet(rapport([cote(66.92, 'niveau fini', 1), cote(70, null, 1)]));
    expect(d.valeurNgf).toBeNull();
    expect(d.raisonAbsence).toBe('aucune_cote_acrotere');
  });
});

describe('decisionSommet — confiance', () => {
  // Trame SÛRE : 3 rangs, chacun UNE valeur, strictement croissante, pas ~3.5 m.
  const trameSaine = [
    { niveau: 'R00', valeurs: [59.63] },
    { niveau: 'R01', valeurs: [63.13] },
    { niveau: 'R02', valeurs: [66.63] },
  ];

  it("'a_verifier' par défaut : une seule pièce, même avec trame saine", () => {
    const d = decisionSommet(rapport([cote(69, 'acrotère', 1)], trameSaine)); // épaisseur 69-66.63=2.37 ≤ pas 3.5, MAIS 1 pièce
    expect(d.nbPiecesDistinctes).toBe(1);
    expect(d.coherentTrame).toBe(true);
    expect(d.confiance).toBe('a_verifier');
  });

  it("'confirmee' : ≥2 pièces distinctes ET épaisseur plausible sur trame saine", () => {
    const d = decisionSommet(rapport([cote(69, 'acrotère', 1), cote(69, 'acrotère', 2)], trameSaine));
    expect(d.nbPiecesDistinctes).toBe(2);
    expect(d.coherentTrame).toBe(true);
    expect(d.confiance).toBe('confirmee');
  });

  it("reste 'a_verifier' si l'épaisseur de toiture est NON plausible (sommet trop au-dessus du dernier plancher)", () => {
    // 89.46 − 66.63 = 22.83 m ≫ pas → non plausible, même sur 2 pièces.
    const d = decisionSommet(rapport([cote(89.46, 'acrotère', 1), cote(89.46, 'acrotère', 2)], trameSaine));
    expect(d.coherentTrame).toBe(false);
    expect(d.confiance).toBe('a_verifier');
  });

  it("reste 'a_verifier' si la trame n'est pas SÛRE (un niveau porte un nuage de cotes)", () => {
    const trameAmbigue = [
      { niveau: 'R00', valeurs: [59.63, 58.23, 57.35] }, // nuage → ambigu
      { niveau: 'R01', valeurs: [63.13] },
      { niveau: 'R02', valeurs: [66.63] },
    ];
    const d = decisionSommet(rapport([cote(69, 'acrotère', 1), cote(69, 'acrotère', 2)], trameAmbigue));
    expect(d.coherentTrame).toBe(false);
    expect(d.confiance).toBe('a_verifier');
  });

  it('deux pièces distinctes exigées : la même pièce deux fois ne suffit pas', () => {
    const d = decisionSommet(rapport([cote(69, 'acrotère', 1, 2), cote(69, 'acrotère', 1, 5)], trameSaine));
    expect(d.nbPiecesDistinctes).toBe(1);
    expect(d.confiance).toBe('a_verifier');
  });

  it('porte les observations (provenance + texte brut) de la valeur retenue, pour la colonne extrait du journal', () => {
    const d = decisionSommet(rapport([cote(89.46, 'acrotère', 3), cote(89.46, 'acrotère', 7)]));
    expect(d.observations.map((o) => o.provenance.pieceId).sort()).toEqual([3, 7]);
    expect(d.observations.every((o) => o.texteBrut === 'NGF +89.46')).toBe(true);
  });
});

describe('decisionSommet — réserve et journal', () => {
  it('porte TOUJOURS la réserve explicite, y compris quand la valeur est confirmée', () => {
    const trameSaine = [
      { niveau: 'R00', valeurs: [59.63] }, { niveau: 'R01', valeurs: [63.13] }, { niveau: 'R02', valeurs: [66.63] },
    ];
    const confirmee = decisionSommet(rapport([cote(69, 'acrotère', 1), cote(69, 'acrotère', 2)], trameSaine));
    const aVerifier = decisionSommet(rapport([cote(89.46, 'acrotère', 1)]));
    expect(confirmee.confiance).toBe('confirmee');
    expect(confirmee.reserve).toBe(RESERVE_SOMMET);
    expect(aVerifier.reserve).toBe(RESERVE_SOMMET);
  });

  it('journalise les candidats « niveau fini » par valeur distincte SANS jamais les promouvoir en sommet', () => {
    const d = decisionSommet(rapport([
      cote(89.46, 'acrotère', 1),
      cote(80.86, 'niveau fini', 1), cote(66.92, 'niveau fini', 2), cote(66.92, 'niveau fini', 3),
    ]));
    expect(d.valeurNgf).toBe(89.46); // le niveau fini n'entre jamais dans le sommet
    expect(d.candidatsNiveauFini.map((c) => c.valeur)).toEqual([66.92, 80.86]); // triés croissant
    const nf66 = d.candidatsNiveauFini.find((c) => c.valeur === 66.92)!;
    expect(nf66.observations.map((o) => o.provenance.pieceId).sort()).toEqual([2, 3]);
  });
});
