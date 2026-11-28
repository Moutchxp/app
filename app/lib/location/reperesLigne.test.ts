import { describe, expect, it } from 'vitest';
import { dateAlerteSansPrevisite, dateDuStatut, dateEchu, ordonnerReperes } from './reperesLigne';

/** 🔴🔴 Arno (28/11/2026, 01h52) — les repères d'une ligne « Sans rendez-vous fixé », du plus ancien (en haut) au plus récent (en bas). */
describe('🔴 01h52 — la date d’apparition de chaque repère', () => {
  const L = { recuLe: '2026-08-01', dateMax: '2026-11-01' };
  it('« En préavis » = la réception ; « Aucune pré-visite fixée » = le 11e jour ; « Préavis échu » = le lendemain de la fin du préavis', () => {
    expect(dateDuStatut('en_preavis', L)).toBe('2026-08-01');
    expect(dateAlerteSansPrevisite(L)).toBe('2026-08-12');
    expect(dateEchu(L)).toBe('2026-11-02');
  });
  it('« Refus / absence » = le mail de refus ; « Pré-visite effectuée » = le compte rendu, sinon le jour du rendez-vous ; un instant ISO → son jour', () => {
    expect(dateDuStatut('refus_previsite', { ...L, previsite: { statut: 'refusee', refusLe: '2026-08-20T09:00:00.000Z' } })).toBe('2026-08-20');
    expect(dateDuStatut('previsite_effectuee', { ...L, previsite: { statut: 'effectuee', effectueeLe: '2026-08-25T10:00:00.000Z', rdv: { jour: '2026-08-24' } } })).toBe('2026-08-25');
    expect(dateDuStatut('previsite_effectuee', { ...L, previsite: { statut: 'effectuee', rdv: { jour: '2026-08-24' } } })).toBe('2026-08-24');
    expect(dateDuStatut('refus_previsite', L)).toBeNull();
  });
});

describe('🔴 01h52 — ordonnerReperes : du plus ancien au plus récent ; sans date en bas ; à date égale l’ordre reçu', () => {
  it('le cas d’Arno : En préavis, puis Aucune pré-visite fixée, puis Préavis échu', () => {
    const L = { recuLe: '2026-08-01', dateMax: '2026-11-01' };
    const r = ordonnerReperes([
      { cle: 'en_preavis', date: dateDuStatut('en_preavis', L) },
      { cle: 'echu', date: dateEchu(L) },
      { cle: 'alerte', date: dateAlerteSansPrevisite(L) },
    ]);
    expect(r.map((x) => x.cle)).toEqual(['en_preavis', 'alerte', 'echu']);
  });
  it('une fin de préavis AVANT le 11e jour (préavis court) : « Préavis échu » passe avant « Aucune pré-visite fixée »', () => {
    const L = { recuLe: '2026-11-01', dateMax: '2026-11-05' };
    expect(ordonnerReperes([{ cle: 's', date: dateDuStatut('en_preavis', L) }, { cle: 'e', date: dateEchu(L) }, { cle: 'a', date: dateAlerteSansPrevisite(L) }]).map((x) => x.cle)).toEqual(['s', 'e', 'a']);
  });
  it('sans date : en bas ; égalité : l’ordre reçu ; rien de perdu', () => {
    expect(ordonnerReperes([{ k: 1, date: null }, { k: 2, date: '2026-01-02' }, { k: 3, date: '2026-01-02' }, { k: 4, date: '2026-01-01' }]).map((x) => x.k)).toEqual([4, 2, 3, 1]);
  });
});
