import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyserMigration, instructions, planifier } from './migrationsNouvelles';

// Migrations de RÉVEIL préparées la nuit du 16/10/2026. 362 (réveil de 216) : DÉCIDÉE par Arno le 16/10, déplacée dans
// db/migrations (part à la prochaine mise à jour). 361 (réveil de 212) : toujours EN ATTENTE hors de db/migrations (la mise à
// jour de la prod ne la voit pas). Ces tests garantissent qu'elles passent le garde, reproduisent exactement l'original et
// fournissent ce que le code lit.
const lire = (dossier: string, fichier: string) => readFileSync(path.join(process.cwd(), dossier, fichier), 'utf8');
const ATTENTE = 'db/migrations-en-attente';
const MIGRATIONS = 'db/migrations';

/** Instructions exécutées, sans transactions, sans commentaires de colonnes/tables, sans SELECT de vérification. */
function coeur(sql: string): string[] {
  return instructions(sql)
    .map((i) => i.replace(/\s+/g, ' ').trim())
    .filter((i) => !/^(BEGIN|COMMIT)$/i.test(i) && !/^COMMENT ON /i.test(i) && !/^SELECT /i.test(i));
}

describe.each([
  [ATTENTE, '361_permis_emprise_numero_reveil.sql', '212_permis_emprise_numero.sql'],
  [MIGRATIONS, '362_permis_cerfa_ia_reveil.sql', '216_permis_cerfa_ia.sql'],
])('%s/%s (réveil de %s)', (dossier, reveil, original) => {
  const contenu = lire(dossier, reveil);
  const a = analyserMigration({ fichier: reveil, contenu });

  it('passe le garde de la mise à jour (aucun refus), enveloppée dans une transaction, sans en-tête irréversible', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
  });
  it('déclare remplacer l’original, sans le réécrire', () => {
    expect(a.remplace).toEqual([original]);
  });
  it('exécute EXACTEMENT les mêmes instructions que l’original (hors transactions, commentaires et vérifications)', () => {
    expect(coeur(contenu)).toEqual(coeur(lire('db/migrations', original)));
  });
});

describe('ce que le code lit et écrit existe bien', () => {
  it('361 : colonne numero + compteur permis_emprise_numero (dossier_id, dernier_numero), comme empriseReconstruiteRepo', () => {
    const repo = readFileSync(path.join(process.cwd(), 'app/lib/permis/empriseReconstruiteRepo.ts'), 'utf8');
    expect(repo).toContain('INSERT INTO permis_emprise_numero (dossier_id, dernier_numero)');
    const a = analyserMigration({ fichier: '361_x.sql', contenu: lire(ATTENTE, '361_permis_emprise_numero_reveil.sql') });
    expect(a.tablesCreees).toEqual(['permis_emprise_numero']);
    expect(a.colonnesAjoutees).toEqual([{ table: 'permis_emprise_reconstruite', colonne: 'numero' }]);
  });
  it('362 : toutes les colonnes de permis_cerfa_ia lues ou écrites par compteRenduIaRepo', () => {
    const sql = lire(MIGRATIONS, '362_permis_cerfa_ia_reveil.sql');
    for (const col of ['dossier_id', 'transmission', 'lecture', 'modele', 'cout_usd', 'empreinte_ged', 'statut', 'motif', 'passe_le']) {
      expect(sql, col).toMatch(new RegExp(`^\\s+${col}\\s`, 'm'));
    }
  });
});

describe('rangement : 362 part à la prochaine mise à jour, 361 reste en attente', () => {
  const dossier = path.join(process.cwd(), MIGRATIONS);
  const existants = readdirSync(dossier).filter((n) => n.endsWith('.sql')).map((n) => ({ fichier: n, contenu: readFileSync(path.join(dossier, n), 'utf8') }));
  const ECARTEES = ['148_mention_sources_graphiques.sql', '212_permis_emprise_numero.sql', '216_permis_cerfa_ia.sql', '262_gestion_piece_classement.sql'];
  // Registre de la prod avant la prochaine mise à jour : tout db/migrations sauf la 362 (148/212/216/262 écartées).
  const registre = existants.filter((f) => f.fichier !== '362_permis_cerfa_ia_reveil.sql').map((f) => ({
    fichier: f.fichier, sha256: analyserMigration(f).sha256, origine: ECARTEES.includes(f.fichier) ? 'ecartee' : 'amorcage',
  }));

  it('362 est dans db/migrations et plus dans db/migrations-en-attente ; 361 y reste', () => {
    expect(existsSync(path.join(process.cwd(), MIGRATIONS, '362_permis_cerfa_ia_reveil.sql'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), ATTENTE, '362_permis_cerfa_ia_reveil.sql'))).toBe(false);
    expect(existsSync(path.join(process.cwd(), ATTENTE, '361_permis_emprise_numero_reveil.sql'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), MIGRATIONS, '361_permis_emprise_numero_reveil.sql'))).toBe(false);
  });

  it('362 est la seule nouvelle ; une fois appliquée, 216 n’est plus rappelée, 212 et 262 le restent', () => {
    const avant = planifier(existants, registre);
    expect(avant.refus).toEqual([]);
    expect(avant.nouvelles.map((n) => n.fichier)).toEqual(['362_permis_cerfa_ia_reveil.sql']);
    const r362 = existants.find((f) => f.fichier === '362_permis_cerfa_ia_reveil.sql')!;
    const apres = planifier(existants, [...registre, { fichier: r362.fichier, sha256: analyserMigration(r362).sha256 }]);
    const avert = apres.avertissements.join('\n');
    expect(avert).not.toMatch(/216_/);
    expect(avert).toMatch(/212_permis_emprise_numero\.sql : écartée/);
    expect(avert).toMatch(/262_gestion_piece_classement\.sql : écartée/);
  });

  it('une fois 362 appliquée, la 361 déplacée telle quelle serait REFUSÉE : elle devra prendre un numéro au-dessus', () => {
    const r362 = existants.find((f) => f.fichier === '362_permis_cerfa_ia_reveil.sql')!;
    const apresMaj = [...registre, { fichier: r362.fichier, sha256: analyserMigration(r362).sha256 }];
    const contenu361 = lire(ATTENTE, '361_permis_emprise_numero_reveil.sql');
    const telleQuelle = planifier([...existants, { fichier: '361_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(telleQuelle.refus.join('\n')).toMatch(/361_permis_emprise_numero_reveil\.sql : numérotée sous la dernière migration appliquée \(362\)/);
    const renumerotee = planifier([...existants, { fichier: '363_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(renumerotee.refus).toEqual([]);
    expect(renumerotee.nouvelles.map((n) => n.fichier)).toEqual(['363_permis_emprise_numero_reveil.sql']);
  });
});
