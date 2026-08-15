import { describe, it, expect } from 'vitest';
import { versIdu, depuisIdu, sectionNumeroParses, communeCadastrale } from './referenceCadastrale';

/**
 * CAD-1 — normalisation de référence cadastrale. On éprouve les DEUX sens (versIdu / depuisIdu), le PADDING des zéros de tête, et
 * les cas tordus (section à une lettre, préfixe 000 vs vide, numéro à 1 chiffre) — c'est ce padding qui fait échouer le
 * rapprochement si on l'oublie (Sitadel écrit « 9 » là où l'IDU écrit « 0009 »).
 */
describe('CAD-1 — versIdu : (INSEE, préfixe, section, numéro) → IDU 14 car. avec padding', () => {
  it('cas Sitadel type : « 9 » → « 0009 », préfixe vide → « 000 », section 2 lettres conservée', () => {
    expect(versIdu({ insee: '75056', prefixe: '', section: 'DZ', numero: '9' })).toBe('75056000DZ0009');
    expect(versIdu({ insee: '75056', prefixe: '000', section: 'DZ', numero: '10' })).toBe('75056000DZ0010');
  });
  it('section à UNE lettre → paddée à 2 (« J » → « 0J ») ; reproduit un IDU réel de la table', () => {
    expect(versIdu({ insee: '92062', prefixe: '000', section: 'J', numero: '161' })).toBe('920620000J0161');
  });
  it('numéro à 1 chiffre, section minuscule → MAJ, préfixe non-000 (lieu-dit)', () => {
    expect(versIdu({ insee: '78646', prefixe: '302', section: 'a', numero: '7' })).toBe('786463020A0007'); // 78646·302·0A·0007
  });
  it('toujours 14 caractères', () => {
    expect(versIdu({ insee: '93001', prefixe: '000', section: 'AD', numero: '488' })).toHaveLength(14);
    expect(versIdu({ insee: '93001', prefixe: '', section: 'A', numero: '1' })).toHaveLength(14);
  });
});

describe('CAD-1 — depuisIdu : IDU → composants paddés ; longueur ≠ 14 → null (on ne devine pas)', () => {
  it('découpe 5·3·2·4', () => {
    expect(depuisIdu('920620000J0161')).toEqual({ insee: '92062', prefixe: '000', section: '0J', numero: '0161' });
  });
  it('null si la longueur n’est pas 14', () => {
    expect(depuisIdu('92062')).toBeNull();
    expect(depuisIdu('')).toBeNull();
  });
});

describe('CAD-1 — aller-retour et forme « colonnes parsées »', () => {
  it('versIdu ∘ depuisIdu est stable (idempotent sur un IDU valide)', () => {
    const idu = '920620000J0161';
    expect(versIdu(depuisIdu(idu)!)).toBe(idu);
  });
  it('sectionNumeroParses retire les zéros de tête (comme les colonnes de la table)', () => {
    expect(sectionNumeroParses('920620000J0161')).toEqual({ section: 'J', numero: '161' });   // 0J → J, 0161 → 161
    expect(sectionNumeroParses('93001000AD0488')).toEqual({ section: 'AD', numero: '488' });   // AD conservé, 0488 → 488
    expect(sectionNumeroParses('75056000DZ0009')).toEqual({ section: 'DZ', numero: '9' });      // le « 9 » de Sitadel retrouvé
  });
});

describe('N3-E — communeCadastrale : arrondissement dérivé du numéro (garde centrale)', () => {
  it('Paris (cas réel) : 07512025V0035 → 75120 (Paris 20e), PAS 75056', () => {
    expect(communeCadastrale('07512025V0035', '75056')).toEqual({ insee: '75120' });
  });
  it('Lyon : le numéro donne l’arrondissement 69381, pas la commune entière 69123', () => {
    expect(communeCadastrale('06938125A0001', '69123')).toEqual({ insee: '69381' });
  });
  it('Marseille : 13201, pas 13055', () => {
    expect(communeCadastrale('01320125B0002', '13055')).toEqual({ insee: '13201' });
  });
  it('commune non découpée : la commune cadastrale = la commune Sitadel (cohérent)', () => {
    expect(communeCadastrale('09205025C0003', '92050')).toEqual({ insee: '92050' });
  });
  it('ABSTENTION — format illisible → motif, jamais une parcelle fausse', () => {
    const r = communeCadastrale('X-mauvais', '75056');
    expect('motif' in r && r.motif).toContain('illisible');
  });
  it('ABSTENTION — dept du numéro ≠ dept Sitadel → motif (on ne devine pas)', () => {
    const r = communeCadastrale('07512025V0035', '92050'); // numéro dit 75, Sitadel dit 92
    expect('motif' in r && r.motif).toContain('incohérent');
  });
})
