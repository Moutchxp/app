import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 5-DROITS — garde-fous STATIQUES de la migration 236. Deux propriétés, et la seconde est la vraie :
 *   ① la migration n'AJOUTE qu'une colonne — elle ne touche à aucun droit existant ;
 *   ② la colonne est NULLABLE et SANS DEFAULT. Un `DEFAULT false` répondrait « non » à la place d'Arno pour tous les
 *      comptes d'aujourd'hui et effacerait pour toujours la différence entre « on a décidé que non » et « on n'a pas
 *      encore décidé ». C'est le test qui protège la décision b.
 */
const prose = readFileSync('db/migrations/236_droit_envoi_gestion.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('236 — une colonne, trois états', () => {
  it('ajoute `perm_gestion_envoi` en booléen', () => {
    expect(/ADD COLUMN IF NOT EXISTS\s+perm_gestion_envoi\s+boolean/.test(code)).toBe(true);
  });

  it('🔴 NI `NOT NULL`, NI `DEFAULT` — c’est le NULL qui porte « à décider »', () => {
    const ajout = code.match(/ADD COLUMN IF NOT EXISTS\s+perm_gestion_envoi\s+boolean([^;]*)/)?.[1] ?? '';
    expect(ajout).not.toMatch(/DEFAULT/i);
    expect(ajout).not.toMatch(/NOT NULL/i);
  });

  it('pose l’index partiel qui répond à « qui reste à décider ? »', () => {
    expect(code).toContain('admin_utilisateur_envoi_a_decider_idx');
    expect(/perm_gestion IS TRUE AND perm_gestion_envoi IS NULL/.test(code)).toBe(true);
  });

  it('ne touche QU’À `admin_utilisateur`, et n’écrit dans aucune ligne existante', () => {
    const alterees = [...code.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alterees)).toEqual(new Set(['admin_utilisateur']));
    expect(/INSERT INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|COLUMN)|ALTER\s+COLUMN|RENAME/i.test(code)).toBe(false);
  });

  it('🔴 NE TOUCHE À AUCUN DROIT EXISTANT — une seule colonne est ajoutée, et c’est la nouvelle', () => {
    const touchees = [...code.matchAll(/(?:ADD|DROP|ALTER|RENAME)\s+COLUMN(?:\s+IF (?:NOT )?EXISTS)?\s+(\w+)/gi)].map((m) => m[1]);
    expect(touchees).toEqual(['perm_gestion_envoi']);
  });

  it('dit NOIR SUR BLANC pourquoi « à décider » n’est pas « non »', () => {
    expect(prose).toContain('À DÉCIDER');
    expect(prose).toContain('« À décider » VAUT NON tant que la réponse n\'est pas donnée');
    expect(prose).toContain('un NON silencieux et un NON assumé ne se valent pas');
  });

  it('une seule transaction, un bloc de vérification, un rollback, et livrée NON APPLIQUÉE', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/236_droit_envoi_gestion.sql');
  });

  it('ne touche NI le module Permis, NI le moteur SVAV, NI le verdict, NI le golden', () => {
    expect(/perm_permis|verdict|score|config_scoring|mnt_lidar/i.test(code)).toBe(false);
    expect(prose).toContain('29.107259068449615'); // cité comme intouché, à dessein
  });

  it('la sonde du code va chercher exactement ce que la migration crée', () => {
    const sonde = readFileSync('app/lib/admin/schemaDroits.ts', 'utf8');
    expect(sonde).toContain("colonneExiste('admin_utilisateur', 'perm_gestion_envoi')");
  });
});

/**
 * LOT 5-DROITS — L'INVARIANT DU FUTUR LOT 5e, consigné AVANT d'écrire la première ligne d'envoi. Un invariant écrit
 * après coup ne protège rien : celui-ci doit exister au moment où quelqu'un branchera l'envoi.
 */
describe('l’invariant « auteur d’un envoi » est consigné, avec le fichier:ligne de son garde', () => {
  const invariants = readFileSync('docs/INVARIANTS_SVAV.md', 'utf8');

  it('l’invariant est écrit, et dit que l’auteur vient de la SESSION, jamais du client', () => {
    expect(invariants).toContain('exigerCapaciteEnvoiGestion');
    expect(invariants).toMatch(/jamais.{0,80}client/i);
  });

  it('il cite un fichier:ligne, et cette ligne existe vraiment', () => {
    const cite = invariants.match(/`app\/lib\/admin\/garde\.ts:(\d+)`/);
    expect(cite).not.toBeNull();
    const ligne = readFileSync('app/lib/admin/garde.ts', 'utf8').split('\n')[Number(cite![1]) - 1];
    expect(ligne).toContain('exigerCapaciteEnvoiGestion');
  });
});
