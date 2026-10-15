import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyserMigration, instructions, planEnTsv, planifier, type FichierMigration } from './migrationsNouvelles';

const f = (fichier: string, contenu: string): FichierMigration => ({ fichier, contenu });

describe('instructions — le SQL réellement exécuté', () => {
  it('retire commentaires et méta-commandes psql, vide les chaînes, garde les corps entre dollars', () => {
    const sql = [
      '-- CREATE INDEX CONCURRENTLY en commentaire',
      '\\echo \'>>> rien ; ici\'',
      '/* bloc /* imbriqué */ ; toujours commentaire */',
      "COMMENT ON TABLE t IS 'cite mns_lidar_brut ; et un point-virgule';",
      'CREATE FUNCTION f() RETURNS void AS $f$ BEGIN PERFORM 1; END; $f$ LANGUAGE plpgsql;',
      'SELECT $1::int, "a;b" FROM x',
    ].join('\n');
    expect(instructions(sql)).toEqual([
      "COMMENT ON TABLE t IS ''",
      'CREATE FUNCTION f() RETURNS void AS $f$ BEGIN PERFORM 1; END; $f$ LANGUAGE plpgsql',
      'SELECT $1::int, "a;b" FROM x',
    ]);
  });

  it("gère les guillemets doublés et les chaînes E'…'", () => {
    expect(instructions("SELECT 'l''a;b', E'x\\';y' ; SELECT 2")).toEqual(["SELECT '', E''", 'SELECT 2']);
  });
});

describe('analyserMigration — mode', () => {
  it('enveloppee sans instruction de transaction', () => {
    expect(analyserMigration(f('400_a.sql', 'CREATE TABLE IF NOT EXISTS a (id int);')).mode).toBe('enveloppee');
  });
  it('transaction-propre avec BEGIN/COMMIT', () => {
    expect(analyserMigration(f('400_a.sql', 'BEGIN;\nCREATE TABLE a (id int);\nCOMMIT;')).mode).toBe('transaction-propre');
  });
  it('sans-transaction avec CREATE INDEX CONCURRENTLY exécuté', () => {
    const a = analyserMigration(f('400_a.sql', 'CREATE INDEX CONCURRENTLY IF NOT EXISTS a_i ON a (id);'));
    expect(a.mode).toBe('sans-transaction');
    expect(a.refus).toEqual([]);
  });
  it('CONCURRENTLY seulement en commentaire → pas sans-transaction', () => {
    expect(analyserMigration(f('400_a.sql', '-- pas de CONCURRENTLY ici\nBEGIN;\nCREATE INDEX a_i ON a (id);\nCOMMIT;')).mode).toBe('transaction-propre');
  });
  it('CONCURRENTLY + BEGIN/COMMIT → refus', () => {
    const a = analyserMigration(f('400_a.sql', 'BEGIN; SELECT 1; COMMIT;\nCREATE INDEX CONCURRENTLY a_i ON a (id);'));
    expect(a.refus.join()).toMatch(/CONCURRENTLY dans un fichier qui gère ses propres transactions/);
  });
});

describe('analyserMigration — garde LiDAR', () => {
  it.each([
    'ALTER TABLE mns_lidar_brut DROP CONSTRAINT IF EXISTS x',
    'DROP TABLE IF EXISTS public.mnt_lidar_brut',
    'TRUNCATE rge_alti',
    'CREATE INDEX i ON "mns_bati_propre" (rid)',
    'DELETE FROM mns_lidar_brut WHERE rid < 0',
    'CREATE VIEW v AS SELECT rid FROM MNT_LIDAR_BRUT',
  ])('refuse « %s »', (sql) => {
    expect(analyserMigration(f('400_a.sql', `${sql};`)).refus.join()).toMatch(/nomme une table LiDAR/);
  });
  it('ignore un nom qui ne fait que CONTENIR « rge_alti » (rattachement_marge_altitude_cm)', () => {
    const a = analyserMigration(f('400_a.sql', 'ALTER TABLE config_veille ADD COLUMN IF NOT EXISTS rattachement_marge_altitude_cm integer;'));
    expect(a.refus).toEqual([]);
  });
  it('ignore une table LiDAR citée en commentaire ou dans une chaîne', () => {
    const a = analyserMigration(f('400_a.sql', "-- ne touche pas mns_lidar_brut\nCOMMENT ON TABLE a IS 'sans rapport avec mnt_lidar_brut';"));
    expect(a.refus).toEqual([]);
  });
});

describe('analyserMigration — CASCADE et suppressions', () => {
  it('refuse DROP … CASCADE', () => {
    expect(analyserMigration(f('400_a.sql', '-- svav:irreversible\nDROP TABLE a CASCADE;')).refus.join()).toMatch(/CASCADE/);
  });
  it("accepte ON DELETE CASCADE d'une clé étrangère", () => {
    const a = analyserMigration(f('400_a.sql', 'ALTER TABLE b ADD CONSTRAINT b_fk FOREIGN KEY (a_id) REFERENCES a (id) ON DELETE CASCADE;'));
    expect(a.refus).toEqual([]);
  });
  it.each(['DROP SCHEMA x', 'DROP OWNED BY y', 'DROP EXTENSION postgis_raster'])('refuse « %s » même marqué irréversible', (sql) => {
    expect(analyserMigration(f('400_a.sql', `-- svav:irreversible\n${sql};`)).refus.join()).toMatch(/interdit/);
  });
});

describe('analyserMigration — svav:irreversible', () => {
  it.each([
    'DROP TABLE a',
    'ALTER TABLE a DROP COLUMN c',
    'ALTER TABLE a RENAME COLUMN c TO d',
    'ALTER TABLE a ALTER COLUMN c TYPE bigint',
    'TRUNCATE a',
    'DELETE FROM a WHERE id = 1',
  ])('« %s » sans en-tête → refus ; avec en-tête → accepté et marqué', (sql) => {
    const sans = analyserMigration(f('400_a.sql', `${sql};`));
    expect(sans.refus.join()).toMatch(/svav:irreversible/);
    expect(sans.irreversible).toBe(false);
    const avec = analyserMigration(f('400_a.sql', `-- svav:irreversible\n${sql};`));
    expect(avec.refus).toEqual([]);
    expect(avec.irreversible).toBe(true);
  });
  it("n'exige rien d'une migration qui ajoute", () => {
    const a = analyserMigration(f('400_a.sql', 'ALTER TABLE a ADD COLUMN IF NOT EXISTS c text;\nCREATE INDEX IF NOT EXISTS a_c ON a (c);\nUPDATE a SET c = \'x\';'));
    expect(a.refus).toEqual([]);
    expect(a.colonnesAjoutees).toEqual([{ table: 'a', colonne: 'c' }]);
  });
});

describe('planifier', () => {
  const m1 = f('001_a.sql', 'CREATE TABLE a (id int);');
  const m2 = f('002_b.sql', 'CREATE TABLE b (id int);');
  const m3 = f('003_c.sql', 'CREATE TABLE c (id int);');
  const sha = (x: FichierMigration) => analyserMigration(x).sha256;

  it('rend seulement les migrations non inscrites, dans l’ordre des numéros', () => {
    const p = planifier([m3, m1, m2], [{ fichier: m1.fichier, sha256: sha(m1) }]);
    expect(p.nouvelles.map((a) => a.fichier)).toEqual(['002_b.sql', '003_c.sql']);
    expect(p.refus).toEqual([]);
  });
  it('rien de nouveau → plan vide', () => {
    const p = planifier([m1, m2], [m1, m2].map((x) => ({ fichier: x.fichier, sha256: sha(x) })));
    expect(p.nouvelles).toEqual([]);
    expect(p.refus).toEqual([]);
  });
  it('refuse une nouvelle numérotée sous la dernière inscrite', () => {
    const p = planifier([m1, m2, m3], [m1, m3].map((x) => ({ fichier: x.fichier, sha256: sha(x) })));
    expect(p.refus.join()).toMatch(/002_b\.sql : numérotée sous la dernière migration appliquée \(3\)/);
  });
  it('refuse un numéro en double et un nom hors format', () => {
    const p = planifier([m1, f('001_autre.sql', 'SELECT 1;'), f('Migration.sql', 'SELECT 1;')], []);
    expect(p.refus.join('\n')).toMatch(/numéro 1 en double/);
    expect(p.refus.join('\n')).toMatch(/Migration\.sql : nom hors format/);
  });
  it('avertit (sans refuser) d’un fichier inscrit modifié ou disparu', () => {
    const p = planifier([m1], [{ fichier: m1.fichier, sha256: 'x'.repeat(64) }, { fichier: '000_vieux.sql', sha256: 'y'.repeat(64) }]);
    expect(p.refus).toEqual([]);
    expect(p.avertissements.join('\n')).toMatch(/001_a\.sql : contenu modifié/);
    expect(p.avertissements.join('\n')).toMatch(/000_vieux\.sql : inscrit au registre mais absent/);
  });
  it('une migration écartée n’est pas nouvelle, et le rappelle', () => {
    const p = planifier([m1, m2], [{ fichier: m1.fichier, sha256: sha(m1) }, { fichier: m2.fichier, sha256: sha(m2), origine: 'ecartee' }]);
    expect(p.nouvelles).toEqual([]);
    expect(p.avertissements).toEqual(["002_b.sql : écartée à l'amorçage, JAMAIS appliquée"]);
  });
  it('remonte les refus d’une nouvelle migration', () => {
    const p = planifier([m1, f('002_x.sql', 'TRUNCATE rge_alti;')], [{ fichier: m1.fichier, sha256: sha(m1) }]);
    expect(p.refus.join()).toMatch(/nomme une table LiDAR/);
  });
});

describe('planEnTsv', () => {
  it('une ligne par fait, dans l’ordre, sans tabulation parasite', () => {
    const m1 = f('001_a.sql', 'CREATE TABLE a (id int);');
    const m2 = f('002_b.sql', '-- svav:irreversible\nDROP TABLE x;');
    const m3 = f('003_c.sql', 'TRUNCATE rge_alti;');
    const sha1 = analyserMigration(m1).sha256;
    const tsv = planEnTsv(planifier([m1, m2, m3], [{ fichier: m1.fichier, sha256: sha1 }, { fichier: '000_z.sql', sha256: 'f'.repeat(64), origine: 'ecartee' }]));
    const lignes = tsv.split('\n').map((l) => l.split('\t'));
    expect(lignes[0]).toEqual(['NOUVELLE', '002_b.sql', 'enveloppee', '1', analyserMigration(m2).sha256]);
    expect(lignes[1].slice(0, 4)).toEqual(['NOUVELLE', '003_c.sql', 'enveloppee', '0']);
    expect(lignes.filter((l) => l[0] === 'REFUS').length).toBe(2); // TRUNCATE rge_alti : table LiDAR + destructif sans en-tête
    expect(lignes.filter((l) => l[0] === 'AVERT').length).toBe(2);
    expect(lignes.every((l) => (l[0] === 'NOUVELLE' ? l.length === 5 : l.length === 2))).toBe(true);
  });
  it('plan vide → texte vide', () => {
    expect(planEnTsv({ nouvelles: [], refus: [], avertissements: [] })).toBe('');
  });
});

describe('les vraies migrations du dépôt', () => {
  const dossier = path.join(process.cwd(), 'db/migrations');
  const fichiers = readdirSync(dossier).filter((n) => n.endsWith('.sql')).sort();
  const analyses = fichiers.map((n) => analyserMigration(f(n, readFileSync(path.join(dossier, n), 'utf8'))));

  it('ont toutes un nom au format et un numéro unique', () => {
    expect(analyses.every((a) => a.numero !== null)).toBe(true);
    expect(new Set(analyses.map((a) => a.numero)).size).toBe(analyses.length);
  });
  it('aucune ne lance de CONCURRENTLY (le mot n’apparaît qu’en commentaire)', () => {
    expect(analyses.filter((a) => a.mode === 'sans-transaction').map((a) => a.fichier)).toEqual([]);
  });
  it('seules 001 (création) et 353 (contrainte d’emprise) nomment une table LiDAR', () => {
    const lidar = analyses.filter((a) => a.refus.some((r) => r.includes('table LiDAR'))).map((a) => a.fichier.slice(0, 3));
    expect(lidar).toEqual(['001', '353']);
  });
  it('lit les créations et ajouts de colonnes de 357 et 358', () => {
    const parNum = new Map(analyses.map((a) => [a.numero, a]));
    expect(parNum.get(357)?.tablesCreees).toEqual(['admin_connexion_journal']);
    expect(parNum.get(357)?.mode).toBe('enveloppee');
    expect(parNum.get(358)?.tablesCreees).toEqual(['svav_migration']);
    expect(parNum.get(358)?.refus).toEqual([]);
  });
});
