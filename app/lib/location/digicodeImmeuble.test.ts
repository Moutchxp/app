import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cleImmeubleAdresse, libelleValeur, mentionDigicode, planReprise, verifierDigicode, type LotAReprendre } from './digicodeImmeuble';

/** 🔴 Arno (21/10/2026, 396) — le digicode porté par l'IMMEUBLE, identifié par son adresse postale normalisée. */
describe('l’immeuble d’une adresse : la clé normalisée', () => {
  it('casse, accents, espaces, tirets et abréviations (bd, av, r) donnent le MÊME immeuble', () => {
    const k = cleImmeubleAdresse({ voie: '12 boulevard Victor Hugo', codePostal: '92400', commune: 'Courbevoie' });
    expect(cleImmeubleAdresse({ voie: '12  Bd VICTOR-HUGO', codePostal: '92 400', commune: 'COURBEVOIE' })).toBe(k);
    expect(cleImmeubleAdresse({ voie: '3 av. des Prés', codePostal: '75011', commune: 'Paris' })).toBe(cleImmeubleAdresse({ voie: '3 AVENUE DES PRES', codePostal: '75011', commune: 'PARIS' }));
    expect(cleImmeubleAdresse({ voie: '4 r de la Paix', codePostal: '75002', commune: 'Paris' })).toBe(cleImmeubleAdresse({ voie: '4 rue de la Paix', codePostal: '75002', commune: 'Paris' }));
  });
  it('un autre numéro, un autre code postal ou une autre commune : un AUTRE immeuble ; sans voie : aucun', () => {
    const k = cleImmeubleAdresse({ voie: '12 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie' });
    expect(cleImmeubleAdresse({ voie: '14 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie' })).not.toBe(k);
    expect(cleImmeubleAdresse({ voie: '12 rue Victor Hugo', codePostal: '92300', commune: 'Courbevoie' })).not.toBe(k);
    expect(cleImmeubleAdresse({ voie: '12 rue Victor Hugo', codePostal: '92400', commune: 'Puteaux' })).not.toBe(k);
    expect(cleImmeubleAdresse({ voie: '  ', codePostal: '92400', commune: 'Courbevoie' })).toBeNull();
  });
  it('la mention et la saisie', () => {
    expect(mentionDigicode({ voie: '12 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie' }, 3)).toBe('Commun à tous les biens du 12 rue Victor Hugo, 92400 Courbevoie (3 biens)');
    expect(mentionDigicode({ voie: '12 rue Victor Hugo', codePostal: null, commune: null }, 1)).toBe('Commun à tous les biens du 12 rue Victor Hugo (1 bien)');
    expect(verifierDigicode({ digicode: 'oui', code: ' 57B83 ' })).toEqual({ ok: true, valeur: { digicode: true, code: '57B83' } });
    expect(verifierDigicode({ digicode: false, code: '57B83' })).toEqual({ ok: true, valeur: { digicode: false, code: null } });
    expect(verifierDigicode({ digicode: true, code: '123456789' })).toEqual({ ok: false, motif: 'Le code du digicode fait 8 caractères au plus.' });
    expect(libelleValeur({ digicode: true, code: 'A1' })).toBe('oui · code A1');
  });
  it('🔴 le syndic n’entre PAS dans la clé (rien dans le module ne le nomme)', () => {
    const src = readFileSync('app/lib/location/digicodeImmeuble.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/syndic/i);
    const repo = readFileSync('app/lib/location/digicodeImmeubleRepo.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(repo).not.toMatch(/syndic_id|gestion_syndic|gestion_copropriete/);
  });
});

describe('🔴 la reprise des digicodes déjà saisis sur des biens', () => {
  const L = (id: number, voie: string, digicode: boolean | null, code: string | null, cp = '92400'): LotAReprendre => ({ id, numero: String(id), voie, codePostal: cp, commune: 'Courbevoie', digicode, code });
  it('un seul bien a un code, ou tous le même (blancs et casse ignorés) : il passe sur l’immeuble', () => {
    const p = planReprise([L(1, '12 rue A', true, '57b83'), L(2, '12 RUE A', true, ' 57B83 '), L(3, '12 r A', null, null), L(4, '8 rue B', true, 'X1')]);
    expect(p.aArbitrer).toEqual([]);
    expect(p.aReprendre.map((r) => [r.adresse.voie, r.valeur, r.lots])).toEqual([['12 rue A', { digicode: true, code: '57b83' }, [1, 2, 3]], ['8 rue B', { digicode: true, code: 'X1' }, [4]]]);
  });
  it('des codes DIFFÉRENTS à la même adresse : rien n’est choisi, « à arbitrer » avec les biens et leurs codes', () => {
    const p = planReprise([L(1, '12 rue A', true, '1111'), L(2, '12 rue A', true, '2222'), L(3, '12 rue A', null, null)]);
    expect(p.aReprendre).toEqual([]);
    expect(p.aArbitrer).toEqual([{ cle: expect.any(String), adresse: { voie: '12 rue A', codePostal: '92400', commune: 'Courbevoie' },
      lots: [{ id: 1, numero: '1', digicode: true, code: '1111' }, { id: 2, numero: '2', digicode: true, code: '2222' }] }]);
  });
  it('sans code : Oui / Non passe s’il est le même partout, sinon « à arbitrer » ; sans voie : laissé tel quel', () => {
    expect(planReprise([L(1, '12 rue A', false, null), L(2, '12 rue A', false, null)]).aReprendre[0].valeur).toEqual({ digicode: false, code: null });
    expect(planReprise([L(1, '12 rue A', true, null), L(2, '12 rue A', false, null)]).aArbitrer).toHaveLength(1);
    expect(planReprise([L(9, '', true, '1')]).sansAdresse).toEqual([9]);
  });
});
