import { describe, expect, it } from 'vitest';
import { adresseTolerante, propositionsRegroupement, signatureProposition, type FicheARegrouper } from './doublonsCopropriete';
import { cleImmeuble } from './syndics';

/** 🔴🔴 Arno (19/11/2026) — les copropriétés en double par variantes d'adresse : le cas réel du 54 avenue Puvis de Chavannes, et ses témoins. */
const SIX = [
  ['54 avenue du Puvis de Chavannes / AUGIER', 29],
  ['54 avenue Puvis de Chavannes', 39],
  ['54 avenue Puvis de Chavannes (HARY)', 4],
  ['54 avenue puvis de Chavannes, 92400, Courbevoie', 1],
  ['54 Avneue Puvis de Chavannes', 1],
  ['54 Puvis de Chavannes', 3],
] as const;
const fiche = (immeuble: string, nbBiens = 1, o: Partial<FicheARegrouper> = {}): FicheARegrouper =>
  ({ cle: cleImmeuble(immeuble), immeuble, codePostal: '92400', commune: 'Courbevoie', declaree: false, nbBiens, ...o });

describe('la signature tolérante', () => {
  it('les six écritures réelles du 54 avenue Puvis de Chavannes ont la même signature (et six clés d’immeuble différentes)', () => {
    expect(new Set(SIX.map(([i]) => cleImmeuble(i))).size).toBe(6);
    expect(new Set(SIX.map(([i]) => adresseTolerante(i, 'Courbevoie').signature))).toEqual(new Set(['54 puvi chavanne']));
    // le type de voie : « avenue » partout où il est écrit (« Avneue » corrigé), absent de « 54 Puvis de Chavannes »
    expect(SIX.map(([i]) => adresseTolerante(i, 'Courbevoie').type)).toEqual(['avenue', 'avenue', 'avenue', 'avenue', 'avenue', null]);
  });
  it('le cas témoin : le 56 avenue Puvis de Chavannes est une AUTRE signature', () => {
    expect(adresseTolerante('56 avenue Puvis de Chavannes').signature).toBe('56 puvi chavanne');
  });
  it('les fautes et abréviations courantes du type de voie ; « du / de / de la » ; le code postal, la commune ; ce qui suit « / » ou entre parenthèses', () => {
    for (const v of ['12 aveune Foch', '12 av. Foch', '12 Ave Foch', '12 AVENUE FOCH, 75116 Paris', '12 avenue Foch (bât. B)', '12 avenue Foch / DUPONT', '12 avenue Foch Paris']) {
      expect(adresseTolerante(v, 'Paris')).toEqual({ signature: '12 foch', type: 'avenue' });
    }
    expect(adresseTolerante('3 bd de la Mission Marchand')).toEqual({ signature: '3 mission marchand', type: 'boulevard' });
    expect(adresseTolerante('3 Boulevard de la Mission-Marchand')).toEqual({ signature: '3 mission marchand', type: 'boulevard' });
    expect(adresseTolerante('8 r. du Gal Leclerc')).toEqual({ signature: '8 general leclerc', type: 'rue' });
    expect(adresseTolerante('8 rue du Général Leclerc')).toEqual({ signature: '8 general leclerc', type: 'rue' });
  });
  it('le numéro et son indice comptent ; sans numéro, aucune signature (rien n’est proposé)', () => {
    expect(adresseTolerante('12 bis rue des Lilas').signature).toBe('12 bis lila');
    expect(adresseTolerante('12bis rue des Lilas').signature).toBe('12 bis lila');
    expect(adresseTolerante('12 rue des Lilas').signature).toBe('12 lila');
    expect(adresseTolerante('Résidence Les Tilleuls').signature).toBe('');
    expect(adresseTolerante('').signature).toBe('');
  });
});

describe('les propositions de regroupement', () => {
  it('les six fiches du 54 forment UNE proposition ; la principale est celle qui a le plus de biens ; le 56 n’y est pas', () => {
    const fiches = [...SIX.map(([i, n]) => fiche(i, n)), fiche('56 avenue Puvis de Chavannes', 2)];
    const p = propositionsRegroupement(fiches);
    expect(p).toHaveLength(1);
    expect(p[0].cles).toEqual(SIX.map(([i]) => cleImmeuble(i)).sort());
    expect(p[0].principale).toBe(cleImmeuble('54 avenue Puvis de Chavannes'));
    expect(p[0].cles).not.toContain(cleImmeuble('56 avenue Puvis de Chavannes'));
  });
  it('une fiche déjà enregistrée est la principale ; deux fiches enregistrées : aucune proposition (le regroupement se fait depuis la fiche)', () => {
    const p = propositionsRegroupement([fiche('54 avenue Puvis de Chavannes', 39), fiche('54 Puvis de Chavannes', 3, { declaree: true })]);
    expect(p[0].principale).toBe(cleImmeuble('54 Puvis de Chavannes'));
    expect(propositionsRegroupement([fiche('54 avenue Puvis de Chavannes', 39, { declaree: true }), fiche('54 Puvis de Chavannes', 3, { declaree: true })])).toEqual([]);
  });
  it('rien qui se contredit : « rue » contre « avenue », deux codes postaux, deux parcelles ; une valeur inconnue ne contredit rien', () => {
    expect(propositionsRegroupement([fiche('5 rue Foch'), fiche('5 avenue Foch')])).toEqual([]);
    expect(propositionsRegroupement([fiche('5 rue Foch', 1, { codePostal: '92400' }), fiche('5 rue Foch.', 1, { codePostal: '92800' })])).toEqual([]);
    expect(propositionsRegroupement([fiche('5 rue Foch', 1, { parcelle: '920260000A0001' }), fiche('5 r Foch', 1, { parcelle: '920260000A0002' })])).toEqual([]);
    expect(propositionsRegroupement([fiche('5 rue Foch', 1, { parcelle: '920260000A0001' }), fiche('5 r Foch', 1, { parcelle: null })])).toHaveLength(1);
    // une écriture sans type n'est rattachée que si le groupe n'hésite pas entre deux types
    const hesite = propositionsRegroupement([fiche('5 rue Foch'), fiche('5 r. Foch'), fiche('5 avenue Foch'), fiche('5 av Foch'), fiche('5 Foch')]);
    expect(hesite.map((x) => x.cles.length)).toEqual([2, 2]);
    expect(hesite.flatMap((x) => x.cles)).not.toContain(cleImmeuble('5 Foch'));
  });
  it('« Ignorer » : la proposition ignorée ne revient pas ; une nouvelle écriture la fait revenir', () => {
    const deux = [fiche('54 avenue Puvis de Chavannes', 39), fiche('54 Puvis de Chavannes', 3)];
    const sig = signatureProposition(deux.map((f) => f.cle));
    expect(propositionsRegroupement(deux, new Set([sig]))).toEqual([]);
    expect(propositionsRegroupement([...deux, fiche('54 Avneue Puvis de Chavannes')], new Set([sig]))).toHaveLength(1);
  });
});
