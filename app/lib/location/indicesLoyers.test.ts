import { describe, expect, it } from 'vitest';
import {
  indiceDuBail, indicesDuType, libelleIndice, lireValeurIndice, manquesIndice, revisionParDefaut, typeIndiceParDefaut, verifierNouvelIndice, type IndiceSaisi,
} from './indicesLoyers';
import { lignesConditions, verifierConditions } from './conditionsEntree';

/** 🔴 Arno (25/10/2026, 423) — la règle des indices de révision (pure, la même à l'écran et au serveur). Données fictives. */
const IRL = (annee: number, trimestre: number, valeur: number, derniereUtilisation: string | null = null): IndiceSaisi => ({ type: 'irl', annee, trimestre, valeur, derniereUtilisation });

describe('🔴 les indices des loyers', () => {
  it('présélection selon le bien : Logement → IRL, Local → ILC, Parking → IRL, inconnu → IRL', () => {
    expect(['logement', 'local', 'parking', null].map((f) => typeIndiceParDefaut(f))).toEqual(['irl', 'ilc', 'irl', 'irl']);
  });
  it('la ligne de la liste, et l’ordre : le plus récent d’abord', () => {
    expect(libelleIndice(IRL(2026, 2, 146.68, '2026-10-12'))).toBe('T2 2026 — 146,68 · dernière utilisation le 12/10/2026');
    expect(libelleIndice(IRL(2026, 2, 146.68))).toBe('T2 2026 — 146,68 · jamais utilisé');
    expect(indicesDuType([IRL(2025, 4, 1), IRL(2026, 1, 1), IRL(2025, 2, 1)], 'irl').map((i) => `${i.annee}-${i.trimestre}`)).toEqual(['2026-1', '2025-4', '2025-2']);
  });
  it('la révision par défaut : l’anniversaire de l’entrée (un 29 février → le 28)', () => {
    expect(revisionParDefaut('2026-10-12')).toBe('2027-10-12');
    expect(revisionParDefaut('2028-02-29')).toBe('2029-02-28');
    expect(revisionParDefaut(null)).toBe('');
  });
  it('la valeur : trois décimales au plus, positive, jamais arrondie', () => {
    expect(['146,68', '146.684', '0', '146,6841', 'abc'].map((v) => lireValeurIndice(v))).toEqual([146.68, 146.684, undefined, undefined, undefined]);
  });
  it('un DOUBLON est refusé avec la valeur existante ; une valeur différente le DIT (rien n’est écrasé)', () => {
    const existants = [IRL(2026, 2, 146.68)];
    const meme = verifierNouvelIndice({ type: 'irl', annee: 2026, trimestre: 2, valeur: '146,68' }, existants);
    expect(meme).toMatchObject({ ok: false, existant: existants[0] });
    expect(!meme.ok && meme.motif).toContain('existe déjà (146,68)');
    const autre = verifierNouvelIndice({ type: 'irl', annee: 2026, trimestre: 2, valeur: '147' }, existants);
    expect(!autre.ok && autre.motif).toContain('rien n’est écrasé');
    expect(verifierNouvelIndice({ type: 'ilc', annee: 2026, trimestre: 2, valeur: '147' }, existants)).toEqual({ ok: true, indice: { type: 'ilc', annee: 2026, trimestre: 2, valeur: 147 } });
  });
  it('les trois champs obligatoires ; l’indice du bail vérifié, et ses lignes dans les conditions (journal, fiche)', () => {
    expect(Object.keys(manquesIndice({}))).toEqual(['indice-type', 'indice-reference', 'indice-revision']);
    expect(indiceDuBail({ type: 'irl', reference: '2026-2', revision: '2027-10-12' })).toEqual({ type: 'irl', annee: 2026, trimestre: 2, revision: '2027-10-12' });
    const brut = { depot: 'agence', prelevement: false, garant: false, assurance: 'aucune', honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
      sommes: {}, reglement: 'cheque', indice: { type: 'irl', reference: '2026-2', revision: '2027-10-12' } };
    const v = verifierConditions(brut);
    expect(v.ok && v.valeurs.indice).toEqual({ type: 'irl', annee: 2026, trimestre: 2, revision: '2027-10-12' });
    expect(v.ok && lignesConditions(v.valeurs).filter((l) => l.mot.includes('ndice') || l.mot.includes('révision'))).toEqual([
      { mot: 'Indice des loyers', valeur: 'IRL T2 2026' }, { mot: 'Date de révision annuelle', valeur: '12/10/2027' }]);
    expect(verifierConditions({ ...brut, indice: { type: 'irl', reference: '', revision: '' } }).ok).toBe(false);
  });
});
