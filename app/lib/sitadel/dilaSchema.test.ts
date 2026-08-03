import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * S27 — garde-fous STATIQUES de la migration 068 (schéma d'accueil DILA). On vérifie que la migration est DDL ADDITIVE
 * (CREATE ... IF NOT EXISTS, aucune suppression de table/colonne), que la contrainte source est ÉLARGIE (les 3 valeurs
 * historiques CONSERVÉES + 'annuaire_dila' ajoutée, jamais remplacée), et que les colonnes EXIGÉES PAR LA LICENCE sont
 * présentes. Aucune connexion DB. On compare aussi à la contrainte d'origine de la 050 (ancrage anti-dérive).
 */
const migration = readFileSync('db/migrations/068_dila.sql', 'utf8');
const migration050 = readFileSync('db/migrations/050_mairie_contact.sql', 'utf8');
/** Lignes de code effectives (hors commentaires `--`) — pour ne pas confondre un exemple commenté avec du DDL réel. */
const code = migration.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

describe('S27 — migration 068 DILA : DDL additive + contrainte source élargie', () => {
  it('crée les deux tables d’accueil en IF NOT EXISTS (idempotent, additif)', () => {
    expect(/CREATE TABLE IF NOT EXISTS dila_millesime/i.test(code)).toBe(true);
    expect(/CREATE TABLE IF NOT EXISTS dila_import/i.test(code)).toBe(true);
    expect(/CREATE INDEX IF NOT EXISTS/i.test(code)).toBe(true);
  });

  it('AUCUNE suppression destructrice : pas de DROP TABLE / DROP COLUMN / ALTER destructeur', () => {
    expect(/DROP\s+TABLE/i.test(code)).toBe(false);
    expect(/DROP\s+COLUMN/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM/i.test(code)).toBe(false);
    expect(/TRUNCATE/i.test(code)).toBe(false);
    // Le SEUL DROP autorisé est celui de la contrainte CHECK de source, pour l'ÉLARGIR (drop + re-add même nom).
    const drops = [...code.matchAll(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+(\w+)/gi)].map((m) => m[1]);
    expect(drops).toEqual(['mairie_contact_source_check']);
  });

  it('contrainte source ÉLARGIE et NON remplacée : les 3 valeurs historiques + annuaire_dila', () => {
    // Ancrage : la 050 définit bien la liste d'origine à 3 valeurs.
    expect(migration050).toMatch(/source\s+text[^\n]*CHECK\s*\(\s*source\s+IN\s*\(\s*'annuaire'\s*,\s*'saisie_manuelle'\s*,\s*'reponse_mairie'\s*\)/i);
    // La 068 ré-ajoute la contrainte avec la liste ÉLARGIE (aucune valeur retirée).
    const m = code.match(/ADD\s+CONSTRAINT\s+mairie_contact_source_check\s+CHECK\s*\(\s*source\s+IN\s*\(([^)]*)\)/i);
    expect(m).not.toBeNull();
    const valeurs = m![1];
    for (const v of ['annuaire', 'saisie_manuelle', 'reponse_mairie', 'annuaire_dila']) {
      expect(valeurs).toContain(`'${v}'`);
    }
  });

  it('colonnes EXIGÉES PAR LA LICENCE présentes sur dila_millesime (fichier + URL + date + copyright)', () => {
    expect(/fichier_source\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/url_telechargement\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/copyright\s+text\s+NOT NULL/i.test(code)).toBe(true);
    expect(/date_fichier\s+date/i.test(code)).toBe(true);
    expect(/taille_octets\s+bigint/i.test(code)).toBe(true);
    expect(/nb_enregistrements\s+bigint/i.test(code)).toBe(true);
    expect(/importe_le\s+timestamptz/i.test(code)).toBe(true);
    // L'avertissement licence est présent dans les commentaires (protection anti-nettoyage).
    expect(/OBLIGATION LICENCE/i.test(migration)).toBe(true);
    expect(/Licence Ouverte v2\.0/i.test(migration)).toBe(true);
  });

  it('dila_import porte le brut d’audit, les coordonnées de contexte (dont lat/lon) et le rattachement', () => {
    expect(/donnee_brute\s+jsonb\s+NOT NULL/i.test(code)).toBe(true);           // mémoire d'audit verbatim
    expect(/millesime_id\s+bigint\s+NOT NULL\s+REFERENCES\s+dila_millesime/i.test(code)).toBe(true); // FK registre
    expect(/code_insee_commune\s+char\(5\)/i.test(code)).toBe(true);            // clé de rattachement en clair
    expect(/ancien_code_pivot\s+text/i.test(code)).toBe(true);                  // règle -01
    expect(/latitude\s+double precision/i.test(code)).toBe(true);
    expect(/longitude\s+double precision/i.test(code)).toBe(true);
    expect(/code_insee\s+char\(5\)\s+REFERENCES\s+commune/i.test(code)).toBe(true); // FK commune (rattachement)
    // rapprochement borné, incluant le direct et la désambiguïsation -01.
    const r = code.match(/rapprochement\s+IN\s*\(([^)]*)\)/i);
    expect(r).not.toBeNull();
    for (const v of ['non_traite', 'direct', 'desambigue_01', 'ambigu', 'hors_perimetre']) {
      expect(r![1]).toContain(`'${v}'`);
    }
  });

  it('une seule transaction, GOLDEN-SAFE (aucun contact moteur/config_scoring/batiment)', () => {
    expect(/BEGIN;/.test(code)).toBe(true);
    expect(/COMMIT;/.test(code)).toBe(true);
    expect(/config_scoring|batiment|coucheDegagement/i.test(code)).toBe(false);
  });
});
