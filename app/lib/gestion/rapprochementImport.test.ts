import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { choisirFicheARapprocher, estCleApplication, phraseRapprochementNonFait } from './rapprochementImport';

/**
 * 🔴 LOT L0 (17/10/2026) — l'import WIPPIMMO et les fiches créées dans l'application. Les trois scénarios demandés par
 * Arno sont éprouvés de bout en bout sur une base jetable (`annuaireImportApplication.itest.ts`) ; ici, la règle pure
 * et les gardes du dépôt, qui tournent dans `npm test`.
 */
const c = (id: string, nom: string, valeurs: string[] = []) => ({ id, nomNormalise: nom, valeurs });

describe('choisirFicheARapprocher — on ne rapproche que si tout concorde', () => {
  it('même nom ET une coordonnée commune, une seule fiche → rapprochée', () => {
    expect(choisirFicheARapprocher([c('1', 'martin claire', ['+33612345602']), c('2', 'dupont', ['+33612345602'])],
      { nomNormalise: 'martin claire', valeurs: ['+33612345602', 'x@y.fr'] })).toEqual({ etat: 'unique', id: '1' });
  });
  it('même nom sans coordonnée commune → « possible », pas de rapprochement deviné', () => {
    expect(choisirFicheARapprocher([c('1', 'martin claire', ['+33600000000'])],
      { nomNormalise: 'martin claire', valeurs: ['+33612345602'] })).toEqual({ etat: 'possible', ids: ['1'] });
    // Une fiche créée sans aucune coordonnée ne se rapproche pas non plus.
    expect(choisirFicheARapprocher([c('1', 'martin claire')],
      { nomNormalise: 'martin claire', valeurs: [] }).etat).toBe('possible');
  });
  it('deux fiches de l’application concordent → « ambigu »', () => {
    expect(choisirFicheARapprocher([c('1', 'martin', ['a@b.fr']), c('2', 'martin', ['a@b.fr'])],
      { nomNormalise: 'martin', valeurs: ['a@b.fr'] })).toEqual({ etat: 'ambigu', ids: ['1', '2'] });
  });
  it('une coordonnée commune ne suffit pas sans le même nom (un couple, une agence partagent une adresse)', () => {
    expect(choisirFicheARapprocher([c('1', 'martin', ['a@b.fr'])], { nomNormalise: 'durand', valeurs: ['a@b.fr'] }))
      .toEqual({ etat: 'aucun' });
    expect(choisirFicheARapprocher([c('1', '', ['a@b.fr'])], { nomNormalise: '', valeurs: ['a@b.fr'] }))
      .toEqual({ etat: 'aucun' });
  });
  it('le rapport dit pourquoi rien n’a été rapproché', () => {
    expect(phraseRapprochementNonFait('MARTIN Claire', { etat: 'possible', ids: ['7'] })).toContain('aucune coordonnée commune');
    expect(phraseRapprochementNonFait('MARTIN Claire', { etat: 'ambigu', ids: ['7', '8'] })).toContain('fiches 7, 8');
  });
  it('estCleApplication : le préfixe « app- » et lui seul', () => {
    expect(estCleApplication('app-1760000000000-ab12cd')).toBe(true);
    expect(estCleApplication('315')).toBe(false);
    expect(estCleApplication(null)).toBe(false);
  });
});

describe('🔴 gardes du dépôt de l’import', () => {
  const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8').replace(/\s+/g, ' ');
  const marquer = repo.slice(repo.indexOf('async function marquerDisparus('), repo.indexOf('interface FichesApplication'));
  it('« absente de l’export » ne vise jamais une fiche créée dans l’application (comptage ET écriture)', () => {
    expect(repo).toContain("const PAS_UNE_FICHE_DE_L_APPLICATION = `NOT (wippimmo_id LIKE 'app-%')`");
    expect(marquer.match(/\$\{PAS_UNE_FICHE_DE_L_APPLICATION\}/g)).toHaveLength(2);
    expect(marquer).toContain('UPDATE ${table} SET absent_le = now()');
  });
  it('une fiche rapprochée s’écrit par son id, jamais par ON CONFLICT (sa clé « app-… » ne change pas)', () => {
    const ecrire = repo.slice(repo.indexOf('async function ecrireFicheRapprochee('), repo.indexOf('async function ecrireFicheRapprochee(') + 1200);
    expect(ecrire).toContain("col !== 'wippimmo_id'");
    expect(ecrire).toContain('WHERE id = $1');
    expect(ecrire).not.toContain('ON CONFLICT');
  });
  it('la migration 369 ajoute seulement : colonnes facultatives, index partiel, CHECK « app- » — rien n’est supprimé', () => {
    const sql = readFileSync('db/migrations/369_gestion_annuaire_rapprochement.sql', 'utf8');
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/^\s*UPDATE\b/im);
    expect(sql).toContain("CHECK (cle_import IS NULL OR wippimmo_id LIKE 'app-%')");
  });
});
