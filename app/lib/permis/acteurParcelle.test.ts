import { describe, it, expect } from 'vitest';
import { estActeurAdmin, dateCourteFr, descriptionActeurParcelle } from './acteurParcelle';

/**
 * PL-A — provenance HONNÊTE de l'acteur d'une parcelle corrigée/saisie. Cas fondateur : l'incident « verif-lot101 » (un harnais de
 * vérification avait écrit une correction sur le dossier 468), que l'écran affichait « rattachée à la main » comme un geste d'Arno.
 */
describe('estActeurAdmin — un compte admin identifiable, ou pas', () => {
  it('nom résolu (id admin → prénom/nom) → admin', () => {
    expect(estActeurAdmin({ majPar: '2', majLe: null, acteurNom: 'Arnaud Jorel' })).toBe(true);
  });
  it("voie de secours nommée 'admin' → admin", () => {
    expect(estActeurAdmin({ majPar: 'admin', majLe: null, acteurNom: null })).toBe(true);
  });
  it("harnais 'verif-lot101' (non résolu) → PAS admin", () => {
    expect(estActeurAdmin({ majPar: 'verif-lot101', majLe: null, acteurNom: null })).toBe(false);
  });
  it("CLI 'cli:rapprocher-parcelles' → PAS admin", () => {
    expect(estActeurAdmin({ majPar: 'cli:rapprocher-parcelles', majLe: null, acteurNom: null })).toBe(false);
  });
  it('id numérique NON résolu (compte supprimé) → PAS admin (on ne devine pas un nom disparu)', () => {
    expect(estActeurAdmin({ majPar: '99', majLe: null, acteurNom: null })).toBe(false);
  });
});

describe('dateCourteFr — grain jour, sans fuseau ni horloge', () => {
  it('ISO → JJ/MM/AAAA', () => {
    expect(dateCourteFr('2026-09-05T14:40:09.679694+02:00')).toBe('05/09/2026');
  });
  it('date seule → JJ/MM/AAAA', () => {
    expect(dateCourteFr('2026-09-05')).toBe('05/09/2026');
  });
  it('null / illisible → null (jamais une date inventée)', () => {
    expect(dateCourteFr(null)).toBeNull();
    expect(dateCourteFr('pas une date')).toBeNull();
  });
});

describe('descriptionActeurParcelle — la phrase honnête', () => {
  it('admin résolu → « à la main » AUTORISÉ, nommé, daté', () => {
    const d = descriptionActeurParcelle({ majPar: '2', majLe: '2026-09-05T14:40:09+02:00', acteurNom: 'Arnaud Jorel' });
    expect(d).toEqual({ aLaMain: true, qui: 'Arnaud Jorel', quand: '05/09/2026' });
  });
  it("secours 'admin' → « à la main » AUTORISÉ, « compte admin »", () => {
    const d = descriptionActeurParcelle({ majPar: 'admin', majLe: null, acteurNom: null });
    expect(d).toEqual({ aLaMain: true, qui: 'compte admin', quand: null });
  });
  it("verif-lot101 → PAS « à la main » : valeur BRUTE affichée (le cœur du correctif)", () => {
    const d = descriptionActeurParcelle({ majPar: 'verif-lot101', majLe: '2026-09-05T14:40:09+02:00', acteurNom: null });
    expect(d.aLaMain).toBe(false);
    expect(d.qui).toBe('verif-lot101');
    expect(d.quand).toBe('05/09/2026');
  });
  it('auteur totalement absent → « auteur inconnu », jamais « à la main »', () => {
    const d = descriptionActeurParcelle({ majPar: null, majLe: null, acteurNom: null });
    expect(d.aLaMain).toBe(false);
    expect(d.qui).toBe('auteur inconnu');
  });
});
