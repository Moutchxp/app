import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CADENCE_DEFAUT, BORNES } from './config';

/**
 * La migration 227 est ADDITIVE et ses DÉFAUTS sont ceux du code (une seule vérité : si l'un des deux bouge
 * sans l'autre, un environnement fraîchement migré n'appliquerait pas les seuils décidés).
 * Même convention que les autres tests de schéma du projet (lecture du .sql, assertions sémantiques).
 */
const sql = readFileSync('db/migrations/227_cadence_limites.sql', 'utf8');
/** Code SQL SEUL : les commentaires sont retirés d'abord (ils parlent de DELETE/UPDATE sans en exécuter). */
const norm = sql
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

describe('migration 227 — additive et rien d’autre', () => {
  it('ne contient AUCUN UPDATE, DELETE, DROP, ALTER ni TRUNCATE sur des données existantes', () => {
    expect(norm).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE|ALTER)\b/i);
  });

  it('crée les deux tables de façon idempotente', () => {
    expect(norm).toContain('CREATE TABLE IF NOT EXISTS config_cadence');
    expect(norm).toContain('CREATE TABLE IF NOT EXISTS cadence_evenement');
    expect(norm).toContain('ON CONFLICT (id) DO NOTHING'); // rejouable sans écraser la configuration en place
  });

  it('indexe la requête de comptage ET la purge', () => {
    expect(norm).toContain('CREATE INDEX IF NOT EXISTS cadence_evenement_fenetre_idx');
    expect(norm).toContain('CREATE INDEX IF NOT EXISTS cadence_evenement_purge_idx');
  });
});

describe('les défauts de la base sont EXACTEMENT ceux du code', () => {
  it.each([
    ['visiteur_analyses_par_10min', CADENCE_DEFAUT.visiteurAnalysesPar10min, 3],
    ['visiteur_analyses_par_24h', CADENCE_DEFAUT.visiteurAnalysesPar24h, 10],
    ['compte_analyses_par_10min', CADENCE_DEFAUT.compteAnalysesPar10min, 10],
    ['compte_analyses_par_heure', CADENCE_DEFAUT.compteAnalysesParHeure, 40],
    ['creation_compte_par_heure', CADENCE_DEFAUT.creationComptreParHeure, 3],
  ])('%s : base = code = %i', (colonne, valeurCode, attendu) => {
    expect(valeurCode).toBe(attendu); // la valeur décidée par le porteur
    expect(norm).toMatch(new RegExp(`${colonne}\\s+integer NOT NULL DEFAULT ${attendu}\\b`));
  });

  it('AUCUNE colonne de limite journalière ni totale POUR UN COMPTE (décision produit, pas un oubli)', () => {
    expect(norm).not.toMatch(/compte_analyses_par_(24h|jour|mois|total)/i);
    expect(norm).not.toMatch(/compte_analyses_total/i);
  });
});

describe('bornes de sûreté : la base est la dernière barrière, le code la première', () => {
  it('la contrainte CHECK couvre les cinq seuils', () => {
    expect(norm).toContain('CONSTRAINT config_cadence_bornes CHECK');
    for (const c of ['visiteur_analyses_par_10min', 'visiteur_analyses_par_24h', 'compte_analyses_par_10min',
      'compte_analyses_par_heure', 'creation_compte_par_heure']) {
      expect(norm).toMatch(new RegExp(`${c} BETWEEN \\d+ AND \\d+`));
    }
  });

  it('les bornes du code sont les mêmes que celles de la base', () => {
    for (const [champ, { min, max }] of Object.entries(BORNES)) {
      const colonne = {
        visiteurAnalysesPar10min: 'visiteur_analyses_par_10min',
        visiteurAnalysesPar24h: 'visiteur_analyses_par_24h',
        compteAnalysesPar10min: 'compte_analyses_par_10min',
        compteAnalysesParHeure: 'compte_analyses_par_heure',
        creationComptreParHeure: 'creation_compte_par_heure',
      }[champ as keyof typeof BORNES];
      expect(norm).toContain(`${colonne} BETWEEN ${min} AND ${max}`);
    }
  });

  it('un seuil à 0 est refusé par la base (fermer le service ne doit pas être une faute de frappe)', () => {
    for (const { min } of Object.values(BORNES)) expect(min).toBeGreaterThanOrEqual(1);
  });
});
