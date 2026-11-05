import { describe, expect, it } from 'vitest';
import { lireConfirmations, resoudreConfirmations } from './transaction-relier-comptes';

/**
 * 🔴 Arno (05/11/2026) — `transaction:relier-comptes --confirme` accepte le compte par ADRESSE E-MAIL (les numéros diffèrent d'une base à
 * l'autre). Une adresse inconnue, ou portée par deux comptes : REFUS, rien n'est deviné. PUR : aucune base.
 */
const COMPTES = [
  { id: 8, identifiant: 'p.thevenin@sansvisavis.com', nom: 'Pierre Thevenin' },
  { id: 5, identifiant: 'jb.pons@sansvisavis.com', nom: 'Jean-Baptiste PONS' },
];

describe('lire --confirme', () => {
  it('libellé = adresse e-mail ou numéro ; espaces gardés dans le libellé', () => {
    expect(lireConfirmations('PIERRE=p.thevenin@sansvisavis.com, Jean Baptiste=jb.pons@sansvisavis.com,ARNAUD=2')).toEqual({
      ok: [{ libelle: 'PIERRE', compte: 'p.thevenin@sansvisavis.com' }, { libelle: 'Jean Baptiste', compte: 'jb.pons@sansvisavis.com' }, { libelle: 'ARNAUD', compte: '2' }],
      illisibles: [] });
  });
  it('illisible : sans libellé, sans compte, ni adresse ni numéro', () => {
    expect(lireConfirmations('=x@y.fr,PIERRE=,PIERRE=pierre,PIERRE=0').illisibles).toEqual(['=x@y.fr', 'PIERRE=', 'PIERRE=pierre', 'PIERRE=0']);
  });
});

describe('résoudre : le compte de chaque confirmation', () => {
  it('par adresse e-mail (casse et espaces ignorés), ou par numéro', () => {
    const r = resoudreConfirmations([{ libelle: 'PIERRE', compte: ' P.Thevenin@SansVisAVis.com ' }, { libelle: 'Jean Baptiste', compte: '5' }], COMPTES);
    expect(r.refus).toEqual([]);
    expect(r.ok.map((x) => [x.libelle, x.compteId])).toEqual([['PIERRE', 8], ['Jean Baptiste', 5]]);
  });
  it('🔴 adresse inconnue : REFUS', () => {
    const r = resoudreConfirmations([{ libelle: 'PIERRE', compte: 'pierre@inconnu.fr' }], COMPTES);
    expect(r.ok).toEqual([]);
    expect(r.refus).toEqual(['« PIERRE » : l’adresse pierre@inconnu.fr n’existe pas.']);
  });
  it('🔴 deux comptes avec la même adresse : REFUS, rien n’est deviné', () => {
    const r = resoudreConfirmations([{ libelle: 'PIERRE', compte: 'p.thevenin@sansvisavis.com' }],
      [...COMPTES, { id: 11, identifiant: 'P.THEVENIN@sansvisavis.com', nom: 'Pierre THEVENIN' }]);
    expect(r.ok).toEqual([]);
    expect(r.refus).toEqual(['« PIERRE » : l’adresse p.thevenin@sansvisavis.com est portée par 2 comptes (8, 11) — rien n’est deviné.']);
  });
  it('numéro inconnu : REFUS', () => {
    expect(resoudreConfirmations([{ libelle: 'X', compte: '99' }], COMPTES).refus).toEqual(['« X » : le compte n° 99 n’existe pas.']);
  });
});
