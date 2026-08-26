import { describe, it, expect } from 'vitest';
import { dateValide, extraireDateIndisponibilite } from './ingestionMillesime';

/**
 * Helpers PURS de l'ingestion Sitadel/DiDo (aucun réseau) : lecture d'une date de publication et interprétation d'un corps
 * de réponse 400. Enjeu métier : un « millésime annoncé mais pas encore publié » ne doit JAMAIS être pris pour une panne.
 */
describe('dateValide — parse tolérant d’une date ISO', () => {
  it('date ISO valide → Date', () => {
    expect(dateValide('2026-08-28T06:45:00.000Z')?.toISOString()).toBe('2026-08-28T06:45:00.000Z');
  });
  it('chaîne illisible → null (jamais d’exception)', () => {
    expect(dateValide('pas une date')).toBeNull();
    expect(dateValide('')).toBeNull();
  });
});

describe('extraireDateIndisponibilite — 400 DATÉ « pas encore publié » vs 400 pour toute autre raison', () => {
  it('corps JSON annonçant une indisponibilité DATÉE → la date', () => {
    const corps = JSON.stringify({ message: 'Les données ne seront pas disponible avant 2026-08-28T06:45:00.000Z.' });
    expect(extraireDateIndisponibilite(corps)?.toISOString()).toBe('2026-08-28T06:45:00.000Z');
  });
  it('texte brut (non-JSON) annonçant « pas encore publié » avec une date → la date', () => {
    const corps = 'Le millésime est annoncé mais pas encore publié : 2026-09-30T05:00:00.000Z';
    expect(extraireDateIndisponibilite(corps)?.toISOString()).toBe('2026-09-30T05:00:00.000Z');
  });
  it('400 pour une AUTRE raison (rid inconnu…) → null (reste une vraie panne)', () => {
    expect(extraireDateIndisponibilite(JSON.stringify({ message: 'Unknown rid: 1234' }))).toBeNull();
    expect(extraireDateIndisponibilite('Bad Request')).toBeNull();
  });
  it('indisponibilité annoncée MAIS sans date lisible → null (on ne devine pas une date)', () => {
    expect(extraireDateIndisponibilite(JSON.stringify({ message: 'Données pas encore publiées.' }))).toBeNull();
  });
  it('corps vide → null', () => {
    expect(extraireDateIndisponibilite('')).toBeNull();
  });
});
