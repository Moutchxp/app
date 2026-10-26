import { describe, it, expect } from 'vitest';
import { nomDuCompteNegociateur, rattacherLibelle, unifierNegociateurs, type CompteNegociateur } from './negociateurIdentite';
import { sectionNegociateurs, type ActiviteCalcul, type Retrocession } from './tableauBord';

/**
 * 🔴 Arno (26/10/2026) — UNE PERSONNE = UN SEUL ESPACE NÉGOCIATEUR : « jb.pons@sansvisavis.com » et « Jean-Baptiste PONS » étaient deux
 * espaces. Un libellé qui correspond sans ambiguïté à un compte (prénom + nom, ou adresse) prend ce compte ; un libellé ambigu ou sans
 * compte reste séparé, « à rapprocher » ; un rattachement manuel (432) l'emporte. PUR.
 */
const COMPTES: CompteNegociateur[] = [
  { id: 5, identifiant: 'jb.pons@sansvisavis.com', prenom: 'Jean-Baptiste', nom: 'PONS' },
  { id: 2, identifiant: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel' },
  { id: 4, identifiant: 'arnaud.jorel@gmail.com', prenom: 'Augustin', nom: 'Jorel' },
  { id: 7, identifiant: 'autre@sansvisavis.com', prenom: 'Jean-Baptiste', nom: 'Pons' },
];

describe('le rattachement d’un libellé', () => {
  it('prénom + nom, nom + prénom, ou adresse d’UN seul compte : rattaché (casse, accents, espaces ignorés)', () => {
    const uns = COMPTES.slice(0, 3);
    expect(rattacherLibelle('Jean-Baptiste PONS', uns, [])).toEqual({ sorte: 'auto', compteId: 5 });
    expect(rattacherLibelle('  pons   jean-baptiste ', uns, [])).toEqual({ sorte: 'auto', compteId: 5 });
    expect(rattacherLibelle('JB.Pons@SansVisAVis.com', uns, [])).toEqual({ sorte: 'auto', compteId: 5 });
  });
  it('ambigu (deux comptes du même nom) ou inconnu : jamais deviné', () => {
    expect(rattacherLibelle('Jean-Baptiste Pons', COMPTES, [])).toEqual({ sorte: 'ambigu', candidats: [5, 7] });
    expect(rattacherLibelle('Jorel', COMPTES, [])).toEqual({ sorte: 'aucun' });
    expect(rattacherLibelle('JB', COMPTES, [])).toEqual({ sorte: 'aucun' });
  });
  it('un rattachement manuel l’emporte, même sur un libellé ambigu', () => {
    expect(rattacherLibelle('Jean-Baptiste Pons', COMPTES, [{ libelleNormalise: 'jean-baptiste pons', libelle: 'Jean-Baptiste Pons', compteId: 5 }]))
      .toEqual({ sorte: 'alias', compteId: 5 });
  });
  it('l’espace porte le NOM de la personne, pas son adresse', () => {
    expect(nomDuCompteNegociateur(COMPTES[0])).toBe('Jean-Baptiste PONS');
    expect(nomDuCompteNegociateur({ id: 9, identifiant: 'x@y.fr', prenom: null, nom: null })).toBe('x@y.fr');
  });
});

describe('un négociateur avec compte + libellé = UN espace, sommes = l’addition des deux anciens', () => {
  const base = { type: 'bail', libelleProprietaire: 'P', libelleLocataire: 'L', primeSaisie: null, mandatGestion: false, categoriePrime: null,
    apporteurId: null, apporteurNom: null, apporteurTaux: null, commissionSaisie: null, avecGestion: false, origineProprietaire: null, origineLocataire: null,
    loyerHc: null, charges: null, assurance: null, parking: false, vacanceJours: null, rattachement: 'rattache' } as const;
  const ligne = (id: string, negociateurId: number | null, negociateurLibelle: string, hp: number, prime: number) =>
    ({ ...base, id, dateSignature: '2026-10-05', honoProprietaireHt: hp, honoLocataireHt: 0, negociateurId, negociateurLibelle, primeSaisie: prime }) as unknown as ActiviteCalcul;
  const lignes = [ligne('a', 5, 'jb.pons@sansvisavis.com', 230.48, 0), ligne('b', null, 'Jean-Baptiste PONS', 1198.05, 150), ligne('c', null, 'Jean-Baptiste PONS', 0, 150)];
  const retro: Retrocession[] = [{ negociateurId: null, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-10-01', montant: 20, libelle: 'r' }];
  const ctx = { regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], apporteurs: [], retrocessions: retro, aujourdhui: '2026-10-26' };
  it('avant : deux espaces ; après : un seul, « Jean-Baptiste PONS », CA, primes et rétrocessions additionnés', () => {
    const avant = sectionNegociateurs(lignes, ctx as never, { annee: 2026, mois: 10 });
    expect(avant.map((x) => x.libelle).sort()).toEqual(['Jean-Baptiste PONS', 'jb.pons@sansvisavis.com']);
    const u = unifierNegociateurs(lignes, COMPTES.slice(0, 3), []);
    const r = unifierNegociateurs(retro, COMPTES.slice(0, 3), []);
    const apres = sectionNegociateurs(u.lignes, { ...ctx, retrocessions: r.lignes } as never, { annee: 2026, mois: 10 });
    expect(apres.map((x) => [x.cle, x.libelle])).toEqual([['id:5', 'Jean-Baptiste PONS']]);
    const somme = (k: 'ca' | 'primes' | 'retrocessions' | 'commission') => avant.reduce((s, x) => s + x.totaux[k], 0);
    for (const k of ['ca', 'primes', 'retrocessions', 'commission'] as const) expect(apres[0].totaux[k], k).toBeCloseTo(somme(k), 6);
    expect(u.lignes[1]).toMatchObject({ negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', negociateurLibelleOrigine: 'Jean-Baptiste PONS' });
    expect(u.aRapprocher).toEqual([]);
  });
  it('un libellé ambigu reste séparé et figure « à rapprocher », avec ses comptes candidats', () => {
    const u = unifierNegociateurs([ligne('d', null, 'Jean-Baptiste Pons', 10, 0), ligne('e', null, 'Jean-Baptiste Pons', 10, 0), ligne('f', null, 'JB', 5, 0)], COMPTES, []);
    expect(u.lignes.map((l) => l.negociateurId)).toEqual([null, null, null]);
    expect(u.aRapprocher).toEqual([
      { libelle: 'JB', nb: 1, candidats: [] },
      { libelle: 'Jean-Baptiste Pons', nb: 2, candidats: [{ id: 5, nom: 'Jean-Baptiste PONS' }, { id: 7, nom: 'Jean-Baptiste Pons' }] },
    ]);
  });
});
