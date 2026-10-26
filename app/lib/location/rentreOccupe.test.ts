import { describe, it, expect } from 'vitest';
import {
  activiteEnPlace, estCandidatRentreOccupe, lienLocataireEnPlace, MANQUE_DATE_MANDAT, MANQUE_RENTRE_OCCUPE, manquesRentreOccupe, verifierRentreOccupe,
} from './rentreOccupe';

/**
 * 🔴 Arno (26/10/2026, 430) — le bien « rentré occupé » : la question obligatoire (R1), Non = rien ne change (R2), Oui = date du mandat et
 * suivi « Mandat de gestion seul » sans honoraire de location (R3), candidats listés sans bascule (R4). PUR.
 */
describe('R1 — la question est obligatoire pour un bien en gestion', () => {
  it('sans réponse : dans « Reste à renseigner » ; Oui sans date : la date du mandat ; répondu : plus rien', () => {
    expect(manquesRentreOccupe({ enGestion: true, disponible: true, entreOccupe: null, dateMandat: '' })).toEqual({ entreOccupe: MANQUE_RENTRE_OCCUPE });
    expect(manquesRentreOccupe({ enGestion: true, disponible: true, entreOccupe: true, dateMandat: '' })).toEqual({ dateMandat: MANQUE_DATE_MANDAT });
    expect(manquesRentreOccupe({ enGestion: true, disponible: true, entreOccupe: true, dateMandat: '2026-10-15' })).toEqual({});
    expect(manquesRentreOccupe({ enGestion: true, disponible: true, entreOccupe: false, dateMandat: '' })).toEqual({});
  });
  it('location seule, ou base sans la migration 430 : jamais exigée (le bien se crée comme aujourd’hui)', () => {
    expect(manquesRentreOccupe({ enGestion: false, disponible: true, entreOccupe: null, dateMandat: '' })).toEqual({});
    expect(manquesRentreOccupe({ enGestion: true, disponible: false, entreOccupe: null, dateMandat: '' })).toEqual({});
  });
});

describe('R2 / R3 — ce que le serveur accepte', () => {
  const jour = '2026-10-26';
  it('absent (écran d’avant, autre appelant) : rien ne change ; Non : rentré vide, aucune date', () => {
    expect(verifierRentreOccupe({}, true, jour)).toEqual({ ok: true, entreOccupe: null, dateEffet: null });
    expect(verifierRentreOccupe({ entreOccupe: false }, true, jour)).toEqual({ ok: true, entreOccupe: false, dateEffet: null });
  });
  it('Oui : la date du mandat devient la date d’entrée dans le suivi ; illisible ou future : refusée', () => {
    expect(verifierRentreOccupe({ entreOccupe: true, dateMandat: '2026-10-15' }, true, jour)).toEqual({ ok: true, entreOccupe: true, dateEffet: '2026-10-15' });
    expect(verifierRentreOccupe({ entreOccupe: true, dateMandat: '2026-02-30' }, true, jour)).toEqual({ ok: false, motif: MANQUE_DATE_MANDAT });
    expect(verifierRentreOccupe({ entreOccupe: true, dateMandat: '2026-11-01' }, true, jour).ok).toBe(false);
    expect(verifierRentreOccupe({ entreOccupe: 'oui' }, true, jour)).toEqual({ ok: false, motif: MANQUE_RENTRE_OCCUPE });
  });
  it('un bien hors gestion n’a pas de prise en gestion : la réponse est ignorée', () => {
    expect(verifierRentreOccupe({ entreOccupe: true, dateMandat: '2026-10-15' }, false, jour)).toEqual({ ok: true, entreOccupe: null, dateEffet: null });
  });
  it('le suivi d’un bail en place : « Mandat de gestion seul », daté du mandat, sans honoraire de location', () => {
    const s = { type: 'bail', dateSignature: '2014-03-01', honoProprietaireHt: '416,67', honoLocataireHt: '226,95', negociateurId: 3 };
    expect(activiteEnPlace(s, '2026-10-15')).toEqual({ type: 'gestion_seule', dateSignature: '2026-10-15', honoProprietaireHt: '0', honoLocataireHt: '0', negociateurId: 3 });
    expect(activiteEnPlace(s, null).dateSignature).toBe('2014-03-01');
  });
  it('l’enchaînement : le formulaire « Nouveau locataire » du bien créé, en mode « locataire en place »', () => {
    expect(lienLocataireEnPlace(64)).toBe('/admin/location/nouveau-locataire?bien=64&enPlace=1');
  });
});

describe('R4 — un candidat : bail commencé nettement avant l’entrée en gestion (90 jours par défaut)', () => {
  it('bail de 2014, gestion d’octobre 2026 : candidat ; bail du mois : non ; sans bail : non', () => {
    expect(estCandidatRentreOccupe({ entreeGestion: '2026-10-15', bailEntree: '2014-03-01' })).toBe(true);
    expect(estCandidatRentreOccupe({ entreeGestion: '2026-10-15', bailEntree: '2026-10-01' })).toBe(false);
    expect(estCandidatRentreOccupe({ entreeGestion: '2026-10-15', bailEntree: '2026-07-17' })).toBe(true);
    expect(estCandidatRentreOccupe({ entreeGestion: '2026-10-15', bailEntree: null })).toBe(false);
    expect(estCandidatRentreOccupe({ entreeGestion: '2026-10-15', bailEntree: '2026-01-01' }, 365)).toBe(false);
  });
});
