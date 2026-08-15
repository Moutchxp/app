import { describe, it, expect } from 'vitest';
import {
  decisionChamps, MOTIF_AUCUN_CANDIDAT, MOTIF_GABARIT_PLAGE, MOTIF_SOUSSOL_MULTIPLE, MOTIF_PLANCHER_AMBIGU,
  MOTIF_SOMMET_AUCUN, MOTIF_PARKING, MOTIF_REPERE, type ChampEcrit, type DecisionChamp,
} from './decisionChamps';
import type { CandidatCote, CandidatGabarit, CandidatSousSol, Provenance, RapportExtraction } from './extractionCaracteristiques';

/**
 * N5-E — décision PAR CHAMP. Pour chaque champ : le cas « écrit » ET le cas « non écrit avec motif ». Aucune valeur déduite par
 * fréquence : une plage de gabarit, un niveau ambigu, un corpus vide → non écrit avec motif, jamais une valeur inventée.
 */
const prov = (pieceId: number, page = 1): Provenance => ({ pieceId, pieceNom: `p${pieceId}.pdf`, page });
const cote = (valeur: number, niveau: string | null, qualif: string | null, pieceId: number, page = 1): CandidatCote => ({ texteBrut: `NGF +${valeur}`, valeur, niveau, qualificatifSommet: qualif, provenance: prov(pieceId, page) });
const gab = (rMin: number, rMax: number, pieceId: number): CandidatGabarit => ({ texteBrut: `R+${rMin}${rMin === rMax ? '' : ` à R+${rMax}`}`, rMin, rMax, provenance: prov(pieceId) });
const ss = (niveaux: number, pieceId: number): CandidatSousSol => ({ texteBrut: `${niveaux} niveau de sous-sol`, niveaux, provenance: prov(pieceId) });

function rapport(parts: { cotes?: CandidatCote[]; gabarits?: CandidatGabarit[]; sousSols?: CandidatSousSol[] } = {}): RapportExtraction {
  const cotes = parts.cotes ?? [];
  const parNiveau = new Map<string, { valeur: number; provenance: Provenance }[]>();
  for (const c of cotes) { if (c.niveau === null) continue; (parNiveau.get(c.niveau) ?? parNiveau.set(c.niveau, []).get(c.niveau)!).push({ valeur: c.valeur, provenance: c.provenance }); }
  return {
    cotes, gabarits: parts.gabarits ?? [], sousSols: parts.sousSols ?? [], reperes: [], hsp: [], dalles: [],
    bilan: { nbPieces: 0, piecesAvecCote: 0, pagesAvecCote: 0, nbCotes: cotes.length, coteMax: null, cotesQualifiees: 0, qualificatifsVus: [], piecesSansCandidat: [], niveaux: [...parNiveau.entries()].map(([niveau, cts]) => ({ niveau, cotes: cts })) },
  };
}
const champ = (r: RapportExtraction, nom: string): DecisionChamp => decisionChamps(r).champs.find((c) => c.champ === nom)!;
const ecrit = (d: DecisionChamp): ChampEcrit => { expect(d.statut).toBe('ecrit'); return d as ChampEcrit; };

describe('decisionChamps — nb_niveaux_sous_sol', () => {
  it('écrit une valeur unique ; confirmee si ≥2 pièces', () => {
    const d = ecrit(champ(rapport({ sousSols: [ss(1, 1), ss(1, 2)] }), 'nb_niveaux_sous_sol'));
    expect(d.valeur).toBe(1); expect(d.confiance).toBe('confirmee');
  });
  it('a_verifier si une seule pièce', () => {
    expect(ecrit(champ(rapport({ sousSols: [ss(1, 1)] }), 'nb_niveaux_sous_sol')).confiance).toBe('a_verifier');
  });
  it('non écrit si valeurs distinctes', () => {
    const d = champ(rapport({ sousSols: [ss(1, 1), ss(2, 2)] }), 'nb_niveaux_sous_sol');
    expect(d.statut === 'non_ecrit' && d.motif).toBe(MOTIF_SOUSSOL_MULTIPLE);
  });
  it('non écrit si aucun candidat', () => {
    const d = champ(rapport(), 'nb_niveaux_sous_sol');
    expect(d.statut === 'non_ecrit' && d.motif).toBe(MOTIF_AUCUN_CANDIDAT);
  });
});

describe('decisionChamps — nb_etages (gabarit R+n)', () => {
  it('écrit si min = max', () => {
    expect(ecrit(champ(rapport({ gabarits: [gab(7, 7, 1)] }), 'nb_etages')).valeur).toBe(7);
  });
  it('NON écrit si plage (R+5 à R+7) — jamais le max « pour faire quelque chose »', () => {
    const d = champ(rapport({ gabarits: [gab(5, 7, 1)] }), 'nb_etages');
    expect(d.statut).toBe('non_ecrit');
    expect(d.statut === 'non_ecrit' && d.motif).toBe(MOTIF_GABARIT_PLAGE);
  });
  it('non écrit si aucun gabarit', () => {
    expect((champ(rapport(), 'nb_etages') as { motif?: string }).motif).toBe(MOTIF_AUCUN_CANDIDAT);
  });
});

describe('decisionChamps — altitude_dernier_plancher_ngf', () => {
  it('écrit le plancher du niveau le plus haut s’il ne porte qu’UNE cote distincte', () => {
    const r = rapport({ cotes: [cote(59.63, 'R00', null, 1), cote(63.15, 'R01', null, 1), cote(82.93, 'R07', null, 1)] });
    const d = ecrit(champ(r, 'altitude_dernier_plancher_ngf'));
    expect(d.valeur).toBe(82.93); // R07, le plus haut
  });
  it('NON écrit si le niveau le plus haut porte plusieurs cotes distinctes (association ambiguë)', () => {
    const r = rapport({ cotes: [cote(59.63, 'R00', null, 1), cote(82.93, 'R07', null, 1), cote(84.24, 'R07', null, 1)] });
    const d = champ(r, 'altitude_dernier_plancher_ngf');
    expect(d.statut === 'non_ecrit' && d.motif).toBe(MOTIF_PLANCHER_AMBIGU);
  });
  it('non écrit si aucun niveau', () => {
    expect((champ(rapport(), 'altitude_dernier_plancher_ngf') as { motif?: string }).motif).toBe(MOTIF_AUCUN_CANDIDAT);
  });
});

describe('decisionChamps — altitude_sommet_ngf (délègue à decisionSommet)', () => {
  it('écrit le max des acrotères', () => {
    const r = rapport({ cotes: [cote(80.33, null, 'acrotère', 1), cote(89.46, null, 'acrotère', 1)] });
    expect(ecrit(champ(r, 'altitude_sommet_ngf')).valeur).toBe(89.46);
  });
  it('non écrit si aucune cote acrotère', () => {
    const d = champ(rapport({ cotes: [cote(70, null, null, 1)] }), 'altitude_sommet_ngf');
    expect(d.statut === 'non_ecrit' && d.motif).toBe(MOTIF_SOMMET_AUCUN);
  });
});

describe('decisionChamps — champs sans extraction possible', () => {
  it('hauteur_relative_m et altitude_terrain_naturel_ngf : non écrits, motif « aucun candidat »', () => {
    const r = rapport();
    expect((champ(r, 'hauteur_relative_m') as { motif?: string }).motif).toBe(MOTIF_AUCUN_CANDIDAT);
    expect((champ(r, 'altitude_terrain_naturel_ngf') as { motif?: string }).motif).toBe(MOTIF_AUCUN_CANDIDAT);
  });
  it('parking : non écrit (global), motif Cerfa', () => {
    const d = champ(rapport(), 'parking');
    expect(d.portee).toBe('global');
    expect(d.statut === 'non_ecrit' && d.motif).toBe(MOTIF_PARKING);
  });
  it('repere : non écrit, motif attribution indécidable', () => {
    expect((champ(rapport(), 'repere') as { motif?: string }).motif).toBe(MOTIF_REPERE);
  });
  it('rend TOUJOURS les 8 champs (aucun silence)', () => {
    expect(decisionChamps(rapport()).champs.map((c) => c.champ).sort()).toEqual([
      'altitude_dernier_plancher_ngf', 'altitude_sommet_ngf', 'altitude_terrain_naturel_ngf', 'hauteur_relative_m',
      'nb_etages', 'nb_niveaux_sous_sol', 'parking', 'repere',
    ]);
  });
});
