import { describe, it, expect, vi } from 'vitest';
import { validerSortieIa, construirePromptIa, SEUIL_RESUME_DESCRIPTION } from './compteRenduIaSchema';
import { lireCompteRenduIa, type LecteurCompteRenduIa, type EntreePieceIa } from './lireCompteRenduIa';
import type { PageTexteIa } from './selectionPagesCerfaIa';

/** CR-2b1 — validation + orchestrateur, adaptateur SIMULÉ (aucun réseau, aucun binaire). On assertionne le comportement, jamais le prompt. */

const CONFORME = {
  natureProjet: { valeur: 'nouvelle_construction', confiance: 'haute', page: 34 },
  recoursArchitecte: { valeur: true, confiance: 'moyenne', page: 34 },
  demolition: { valeur: false, confiance: 'moyenne', page: 34 },      // « pas de démolition » est AFFIRMÉ → cite la page vue
  travauxParTranches: { valeur: null, confiance: 'faible', page: null }, // vraie abstention (page null OK)
  typeOperationSvav: { valeur: 'immeuble', confiance: 'moyenne', page: 18 },
  resumeDescription: null,
};

describe('validerSortieIa', () => {
  it('sortie conforme → ok', () => {
    expect(validerSortieIa(CONFORME).ok).toBe(true);
  });
  it('abstention (valeur null, page null) est CONFORME (le modèle a le droit de ne pas savoir)', () => {
    const r = validerSortieIa({ ...CONFORME, natureProjet: { valeur: null, confiance: 'faible', page: null } });
    expect(r.ok).toBe(true);
  });
  it('valeur hors enum → rejetée', () => {
    expect(validerSortieIa({ ...CONFORME, natureProjet: { valeur: 'autre_chose', confiance: 'haute', page: 1 } }).ok).toBe(false);
  });
  it('valeur AFFIRMÉE sans page citée → rejetée (règle P2)', () => {
    const r = validerSortieIa({ ...CONFORME, typeOperationSvav: { valeur: 'immeuble', confiance: 'haute', page: null } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toMatch(/page citée/);
  });
  it('champ manquant → rejetée', () => {
    const { demolition, ...sansDemol } = CONFORME; void demolition;
    expect(validerSortieIa(sansDemol).ok).toBe(false);
  });
});

describe('construirePromptIa — pilotage du résumé (jamais la forme exacte du prompt)', () => {
  it('demande un résumé au-dessus du seuil, l’interdit en dessous', () => {
    expect(construirePromptIa([18], true)).toMatch(/résumé/i);
    expect(construirePromptIa([18], false)).toMatch(/null/);
  });
});

// ── Orchestrateur avec adaptateur SIMULÉ ────────────────────────────────────────────────────────────────────────────────────────
const pagePropre = (n: number, texte: string): PageTexteIa => ({ page: n, texte });
const piece = (pages: PageTexteIa[]): EntreePieceIa => ({ pieceId: 1, pieceNom: 'cerfa.pdf', pdf: Buffer.from('x'), pages });
const lecteurSimule = (json: unknown, tokens = { promptTokens: 100, completionTokens: 50 }): LecteurCompteRenduIa => ({
  rasteriser: () => 'IMG_B64',
  visionMultiPages: vi.fn(async () => ({ json, usage: tokens, modele: 'mistral-medium-latest' })),
});

const PAGES_AVEC_CIBLE = [
  pagePropre(34, '5.2 Nature du projet Nouvelle construction'),
  pagePropre(18, 'Courte description de votre projet ou de vos travaux :'),
];

describe('lireCompteRenduIa — orchestrateur', () => {
  it('sortie conforme → statut « lu », lecture présente, coût calculé', async () => {
    const r = await lireCompteRenduIa(piece(PAGES_AVEC_CIBLE), lecteurSimule(CONFORME), { texteLibreLongueur: 100 });
    expect(r.statut).toBe('lu');
    expect(r.lecture?.natureProjet.valeur).toBe('nouvelle_construction');
    expect(r.coutUsd).toBeGreaterThan(0);
    expect(r.transmission.envoyees.map((e) => e.page).sort()).toEqual([18, 34]);
  });

  it('sortie invalide → statut « echec », lecture null (RIEN retenu)', async () => {
    const r = await lireCompteRenduIa(piece(PAGES_AVEC_CIBLE), lecteurSimule({ natureProjet: { valeur: 'xxx' } }), { texteLibreLongueur: 100 });
    expect(r.statut).toBe('echec');
    expect(r.lecture).toBeNull();
    expect(r.motif).toMatch(/non conforme/);
  });

  it('aucune page transmissible → statut « abstention », AUCUN appel', async () => {
    const lect = lecteurSimule(CONFORME);
    const r = await lireCompteRenduIa(piece([pagePropre(5, 'Superficie du terrain')]), lect, { texteLibreLongueur: 100 });
    expect(r.statut).toBe('abstention');
    expect(lect.visionMultiPages).not.toHaveBeenCalled();
    expect(r.coutUsd).toBe(0);
  });

  it('panne du fournisseur (throw) → statut « echec » + motif, jamais un crash', async () => {
    const lect: LecteurCompteRenduIa = { rasteriser: () => 'IMG', visionMultiPages: async () => { throw new Error('fournisseur HTTP 401'); } };
    const r = await lireCompteRenduIa(piece(PAGES_AVEC_CIBLE), lect, { texteLibreLongueur: 100 });
    expect(r.statut).toBe('echec');
    expect(r.motif).toMatch(/lecture IA non disponible.*401/);
  });

  it('texte libre court → resumeDescription forcé à null même si le modèle en renvoie un', async () => {
    const r = await lireCompteRenduIa(piece(PAGES_AVEC_CIBLE), lecteurSimule({ ...CONFORME, resumeDescription: 'un résumé' }), { texteLibreLongueur: SEUIL_RESUME_DESCRIPTION - 1 });
    expect(r.lecture?.resumeDescription).toBeNull();
  });
});
