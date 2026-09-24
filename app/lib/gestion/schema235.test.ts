import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 5-0 — garde-fous STATIQUES de la migration 235 (destinataires séparés). Ce qui est protégé ici tient en deux
 * phrases :
 *   ① la migration n'AJOUTE que des colonnes — elle ne réécrit, ne supprime et ne renomme RIEN ;
 *   ② `NULL` (« jamais analysé ») et `[]` (« analysé, personne ») ne doivent jamais se confondre. Un DEFAULT '[]' sur
 *      ces colonnes effacerait pour toujours la trace des 27 833 messages restant à rattraper. C'est le test le plus
 *      important du fichier.
 */
const prose = readFileSync('db/migrations/235_gestion_destinataires_separes.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('235 — quatre colonnes, et rien d’autre', () => {
  it('ajoute les quatre colonnes en jsonb', () => {
    for (const c of ['dest_a', 'dest_cc', 'dest_cci', 'repondre_a']) {
      expect(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${c}\\s+jsonb`).test(code)).toBe(true);
    }
  });

  it('🔴 AUCUN DEFAULT sur ces colonnes — c’est le NULL qui distingue « jamais analysé » de « analysé, personne »', () => {
    const ajouts = [...code.matchAll(/ADD COLUMN IF NOT EXISTS\s+(dest_a|dest_cc|dest_cci|repondre_a)\s+jsonb([^,;]*)/g)];
    expect(ajouts).toHaveLength(4);
    for (const [, colonne, suite] of ajouts) {
      expect(`${colonne}: ${suite}`).not.toMatch(/DEFAULT/i);
      expect(`${colonne}: ${suite}`).not.toMatch(/NOT NULL/i);
    }
  });

  it('chaque colonne n’accepte qu’un TABLEAU JSON, ou NULL', () => {
    expect(code).toContain("jsonb_typeof(%I) = ''array''");
    expect(code).toContain("ARRAY['dest_a', 'dest_cc', 'dest_cci', 'repondre_a']");
  });

  it('pose l’index PARTIEL qui rendra la future passe de rattrapage possible', () => {
    expect(code).toContain('gestion_message_dest_inconnus_idx');
    expect(/WHERE\s+dest_a\s+IS\s+NULL/i.test(code)).toBe(true);
  });

  it('ne touche QUE gestion_message, et n’écrit dans aucune ligne existante', () => {
    const alterees = [...code.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alterees)).toEqual(new Set(['gestion_message']));
    expect(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|COLUMN)|ALTER\s+COLUMN|RENAME/i.test(code)).toBe(false);
  });

  it('ne retire RIEN : les colonnes d’avant ne sont ni supprimées, ni modifiées, ni renommées', () => {
    // Les seules colonnes que la migration TOUCHE sont les quatre qu'elle crée. `destinataires` et `nb_destinataires`
    //   ne peuvent donc pas être altérées — le test porte sur les ordres, pas sur la prose des commentaires SQL.
    const touchees = [...code.matchAll(/(?:ADD|DROP|ALTER|RENAME)\s+COLUMN(?:\s+IF (?:NOT )?EXISTS)?\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(touchees)).toEqual(new Set(['dest_a', 'dest_cc', 'dest_cci', 'repondre_a']));
  });

  it('dit NOIR SUR BLANC pourquoi NULL et [] ne sont pas la même chose', () => {
    expect(prose).toContain('ON N\'A JAMAIS REGARDÉ');
    expect(prose).toContain('on a regardé, il n\'y avait personne');
    expect(prose).toContain('AUCUN DEFAULT');
  });

  it('annonce la future passe de rattrapage, sans la livrer', () => {
    expect(prose).toContain('sans retélécharger un seul corps de mail');
    expect(prose).toContain('WHERE dest_a IS NULL');
  });

  it('une seule transaction, un bloc de vérification, un rollback, et livrée NON APPLIQUÉE', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/235_gestion_destinataires_separes.sql');
  });

  it('ne touche NI le moteur SVAV, NI le verdict, NI le golden, NI le module Permis', () => {
    expect(/permis|verdict|score|mnt_lidar|mns_lidar|config_scoring/i.test(code)).toBe(false);
    expect(prose).toContain('29.107259068449615'); // le golden est cité comme intouché, à dessein
  });
});

describe('235 — la sonde de schéma va bien chercher ce que la migration crée', () => {
  it('le code sonde `dest_a`, l’une des colonnes que 235 ajoute', async () => {
    const sonde = readFileSync('app/lib/gestion/schema.ts', 'utf8');
    expect(sonde).toContain("colonneExiste('gestion_message', 'dest_a')");
    expect(code).toMatch(/ADD COLUMN IF NOT EXISTS\s+dest_a/);
  });

  it('…et la sonde est HORS transaction, comme ses sœurs (la règle du lot 4a)', async () => {
    const sonde = readFileSync('app/lib/gestion/schema.ts', 'utf8');
    // Le commentaire d'en-tête CITE `withTransaction` pour expliquer le piège — c'est voulu. Ce qui compte, c'est
    //   qu'aucune LIGNE DE CODE ne l'appelle : une sonde dans une transaction ne pourrait pas se rabattre.
    const lignesCode = sonde.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).join('\n');
    expect(lignesCode).not.toContain('withTransaction');
    expect(sonde).toContain('LA SONDE SE FAIT HORS TRANSACTION');
  });
});
