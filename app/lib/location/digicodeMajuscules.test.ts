import { describe, expect, it } from 'vitest';
import { libelleValeur, majusculesDigicode, majusculesDigicodeOuNul, verifierDigicode } from './digicodeImmeuble';
import { motChangementAVenir, valeurSaisie } from '../gestion/digicodes';
import { motCode } from '../gestion/digicodesEnvoi';
import { motCode as motCodeAdresse } from '../gestion/adresseCoproGestes';

/** 🔴 Arno (26/11/2026, 14h35, point 2) — « Les caractères saisis dans les champs de digicode doivent tous être en lettres capitales ». */
describe('les digicodes en MAJUSCULES', () => {
  it('la fonction : lettres en capitales (accents compris), chiffres et symboles inchangés', () => {
    expect(majusculesDigicode('57b83')).toBe('57B83');
    expect(majusculesDigicode('a1#*-é 9')).toBe('A1#*-É 9');
    expect([majusculesDigicodeOuNul(null), majusculesDigicodeOuNul(undefined), majusculesDigicodeOuNul('x2')]).toEqual([null, null, 'X2']);
  });
  it('l’enregistrement côté serveur : la nouvelle base (valeurSaisie) et l’ancienne règle (verifierDigicode)', () => {
    expect(valeurSaisie({ digicode: true, code: ' 57b83 ' })).toEqual({ ok: true, valeur: { digicode: true, code: '57B83' } });
    expect(verifierDigicode({ digicode: 'oui', code: 'ab12' })).toEqual({ ok: true, valeur: { digicode: true, code: 'AB12' } });
    expect(valeurSaisie({ digicode: false, code: 'abc' })).toEqual({ ok: true, valeur: { digicode: false, code: null } });
  });
  it('l’affichage d’un code existant encore en minuscules : en majuscules partout', () => {
    expect(libelleValeur({ digicode: true, code: '57b83' })).toBe('oui · code 57B83');
    expect(motCode({ digicode: true, code: 'b17' })).toBe('B17');
    expect(motCodeAdresse({ digicode: true, code: 'a17' })).toBe('code A17');
    expect(motChangementAVenir({ valeur: { digicode: true, code: 'z9' }, appliqueLe: '2026-12-01T09:00:00Z' })).toMatch(/^nouveau code Z9 à partir du /);
  });
});
