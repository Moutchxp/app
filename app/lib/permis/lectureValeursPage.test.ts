import { describe, it, expect, vi } from 'vitest';
import {
  parseValeurLue, deciderEcritureValeurLue, executerLectureValeurPage,
  PROMPT_LECTURE_VALEURS, ALT_MIN_NGF, ALT_MAX_NGF,
} from './lectureValeursPage';
import type { LecteurPlanches } from './reperePlanches';

/**
 * LOT 95 (B2) — LECTURE DE VALEURS au grain page. Fonctions PURES + orchestrateur d'UNE page (lecteur injecté, aucun appel réseau).
 * On éprouve : la normalisation SÛRE d'une valeur (bornes, illisible → null), la décision d'écriture (rien / déjà rempli / à vérifier /
 * écrire), et le pré-filtre RGPD par page (abstention) réutilisé du LOT 62.
 */
describe('parseValeurLue — normalisation SÛRE (jamais une valeur inventée / hors bornes)', () => {
  it('valeur numérique dans les bornes → retenue, confiance normalisée, extrait tronqué', () => {
    expect(parseValeurLue({ altitude_sommet_ngf: 61.09, confiance: 'sure', extrait: '+61.09 m NGF' }))
      .toEqual({ valeur: 61.09, confiance: 'sure', extrait: '+61.09 m NGF' });
  });
  it('chaîne « 61,09 » (virgule) → 61.09 ; confiance inconnue → « douteuse » (jamais acquis par défaut)', () => {
    expect(parseValeurLue({ altitude_sommet_ngf: '61,09', confiance: 'peut-être', extrait: '' }))
      .toEqual({ valeur: 61.09, confiance: 'douteuse', extrait: '' });
  });
  it('null / non numérique / hors bornes → null (rien d’exploitable, jamais une erreur base)', () => {
    expect(parseValeurLue({ altitude_sommet_ngf: null })).toBeNull();
    expect(parseValeurLue({ altitude_sommet_ngf: 'abc' })).toBeNull();
    expect(parseValeurLue({ altitude_sommet_ngf: ALT_MAX_NGF + 1 })).toBeNull();
    expect(parseValeurLue({ altitude_sommet_ngf: ALT_MIN_NGF - 1 })).toBeNull();
    expect(parseValeurLue({})).toBeNull();
  });
});

describe('deciderEcritureValeurLue — champ VIDE seulement, doute jamais écrit', () => {
  const sure = { valeur: 61.09, confiance: 'sure' as const, extrait: '' };
  const douteuse = { valeur: 61.09, confiance: 'douteuse' as const, extrait: '' };
  it('rien lu → « rien »', () => expect(deciderEcritureValeurLue(null, false)).toBe('rien'));
  it('champ déjà rempli → « deja_rempli » (jamais écrasé), même si la valeur est sûre', () => {
    expect(deciderEcritureValeurLue(sure, true)).toBe('deja_rempli');
  });
  it('champ vide + valeur sûre → « ecrire »', () => expect(deciderEcritureValeurLue(sure, false)).toBe('ecrire'));
  it('champ vide + valeur douteuse → « a_verifier » (proposée, non écrite)', () => {
    expect(deciderEcritureValeurLue(douteuse, false)).toBe('a_verifier');
  });
});

describe('executerLectureValeurPage — pré-filtre RGPD par page (abstention), une seule page envoyée', () => {
  const lecteur = (rep: Record<string, unknown>): LecteurPlanches => ({
    rasteriser: vi.fn(() => 'IMG_B64'),
    vision: vi.fn(async () => rep),
  });
  it('page SANS texte → non envoyée (invérifiable), aucun appel vision', async () => {
    const l = lecteur({});
    const r = await executerLectureValeurPage({ texte: async () => '', pdf: async () => Buffer.from('x'), page: 3, lecteur: l });
    expect(r).toEqual({ envoyee: false, motif: expect.stringContaining('page sans texte') });
    expect(l.vision).not.toHaveBeenCalled();
  });
  it('page avec SIGNAL DE PERSONNE (signé par …) → non envoyée', async () => {
    const l = lecteur({});
    const r = await executerLectureValeurPage({ texte: async () => 'Plan signé par Jean Dupont', pdf: async () => Buffer.from('x'), page: 1, lecteur: l });
    expect(r).toEqual({ envoyee: false, motif: expect.any(String) });
    expect(l.vision).not.toHaveBeenCalled();
  });
  it('page technique cotée → envoyée : vision appelée avec LE prompt de LECTURE (distinct du repérage) et LA page', async () => {
    const l = lecteur({ altitude_sommet_ngf: 61.09, confiance: 'sure', extrait: '+61.09 NGF' });
    const r = await executerLectureValeurPage({ texte: async () => 'Coupe AA cote acrotère +61.09 NGF', pdf: async () => Buffer.from('x'), page: 2, lecteur: l });
    expect(r).toEqual({ envoyee: true, valeur: { valeur: 61.09, confiance: 'sure', extrait: '+61.09 NGF' } });
    expect(l.rasteriser).toHaveBeenCalledWith(expect.any(Buffer), 2);
    expect(l.vision).toHaveBeenCalledWith('IMG_B64', PROMPT_LECTURE_VALEURS);
  });
  it('page envoyée mais rien de lisible (valeur null) → { envoyee:true, valeur:null } (honnête, jamais inventé)', async () => {
    const l = lecteur({ altitude_sommet_ngf: null, confiance: 'douteuse', extrait: '' });
    const r = await executerLectureValeurPage({ texte: async () => 'Coupe sans cote NGF lisible', pdf: async () => Buffer.from('x'), page: 1, lecteur: l });
    expect(r).toEqual({ envoyee: true, valeur: null });
  });
});
