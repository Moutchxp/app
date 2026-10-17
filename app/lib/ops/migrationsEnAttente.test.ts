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

describe('rangement : 362 appliquée en prod, 363 (invitations), 364 (résidence du compte) et 365 (invités des tâches) partent à la prochaine mise à jour, 361 reste en attente', () => {
  const dossier = path.join(process.cwd(), MIGRATIONS);
  const existants = readdirSync(dossier).filter((n) => n.endsWith('.sql')).map((n) => ({ fichier: n, contenu: readFileSync(path.join(dossier, n), 'utf8') }));
  const ECARTEES = ['148_mention_sources_graphiques.sql', '212_permis_emprise_numero.sql', '216_permis_cerfa_ia.sql', '262_gestion_piece_classement.sql'];
  // Pas encore appliquées en prod (16/10/2026, après la publication de 4c8cd637 qui a appliqué la 362).
  // 365 : lot GESTION-INVITATIONS-TACHES (17/10/2026).
  const A_VENIR = ['363_admin_invitation.sql', '364_internaute_residence.sql', '365_gestion_tache_invite.sql', '366_gestion_tache_evenement.sql',
    '367_gestion_tache_evenement_reprise.sql', '368_gestion_tache_sans_bien.sql'];
  const registre = existants.filter((f) => !A_VENIR.includes(f.fichier)).map((f) => ({
    fichier: f.fichier, sha256: analyserMigration(f).sha256, origine: ECARTEES.includes(f.fichier) ? 'ecartee' : 'amorcage',
  }));
  const inscrire = (noms: string[]) => [...registre, ...existants.filter((f) => noms.includes(f.fichier)).map((f) => ({ fichier: f.fichier, sha256: analyserMigration(f).sha256 }))];

  it('362 est dans db/migrations et plus dans db/migrations-en-attente ; 361 y reste', () => {
    expect(existsSync(path.join(process.cwd(), MIGRATIONS, '362_permis_cerfa_ia_reveil.sql'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), ATTENTE, '362_permis_cerfa_ia_reveil.sql'))).toBe(false);
    expect(existsSync(path.join(process.cwd(), ATTENTE, '361_permis_emprise_numero_reveil.sql'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), MIGRATIONS, '361_permis_emprise_numero_reveil.sql'))).toBe(false);
  });

  it('363 à 368 sont les seules nouvelles, sans refus ; 362 appliquée : 216 n’est plus rappelée, 212 et 262 le restent', () => {
    const plan = planifier(existants, registre);
    expect(plan.refus).toEqual([]);
    expect(plan.nouvelles.map((n) => n.fichier)).toEqual(A_VENIR);
    const avert = planifier(existants, inscrire(A_VENIR)).avertissements.join('\n');
    expect(avert).not.toMatch(/216_/);
    expect(avert).toMatch(/212_permis_emprise_numero\.sql : écartée/);
    expect(avert).toMatch(/262_gestion_piece_classement\.sql : écartée/);
  });

  it('la 361 déplacée telle quelle serait REFUSÉE (sous la dernière appliquée) : elle devra prendre un numéro au-dessus (369)', () => {
    const apresMaj = inscrire(A_VENIR);
    const contenu361 = lire(ATTENTE, '361_permis_emprise_numero_reveil.sql');
    const telleQuelle = planifier([...existants, { fichier: '361_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(telleQuelle.refus.join('\n')).toMatch(/361_permis_emprise_numero_reveil\.sql : numérotée sous la dernière migration appliquée \(368\)/);
    const renumerotee = planifier([...existants, { fichier: '369_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(renumerotee.refus).toEqual([]);
    expect(renumerotee.nouvelles.map((n) => n.fichier)).toEqual(['369_permis_emprise_numero_reveil.sql']);
  });
});

describe('364 (adresse de résidence sur le compte) : additive, enveloppée, sans toucher aux données', () => {
  const contenu = lire(MIGRATIONS, '364_internaute_residence.sql');
  const a = analyserMigration({ fichier: '364_internaute_residence.sql', contenu });
  it('passe le garde, enveloppée, réversible, 3 colonnes ajoutées sur internaute et rien d’autre', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees).toEqual([
      { table: 'internaute', colonne: 'adresse_residence' },
      { table: 'internaute', colonne: 'adresse_residence_maj_a' },
      { table: 'internaute', colonne: 'adresse_residence_source' },
    ]);
  });
  it('aucune écriture de données (ni UPDATE, ni INSERT, ni DELETE, ni DEFAULT posé sur les lignes existantes)', () => {
    const sql = coeur(contenu).join('\n');
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|TRUNCATE|DEFAULT)\b/i);
  });
  it('les sources acceptées sont celles que le code écrit', () => {
    const code = readFileSync(path.join(process.cwd(), 'app/lib/internaute/residenceCompte.ts'), 'utf8');
    for (const s of ['tunnel_bien_analyse', 'tunnel_adresse_saisie', 'espace_client']) {
      expect(contenu).toContain(`'${s}'`);
      expect(code).toContain(`'${s}'`);
    }
  });
});

describe('365 (invités des tâches) : enveloppée, sans refus, une table neuve et deux colonnes, reprise sans perte', () => {
  const contenu = lire(MIGRATIONS, '365_gestion_tache_invite.sql');
  const a = analyserMigration({ fichier: '365_gestion_tache_invite.sql', contenu });
  it('passe le garde, enveloppée, réversible', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual(['gestion_tache_invite']);
    expect(a.colonnesAjoutees).toEqual([
      { table: 'gestion_tache_demande', colonne: 'invite_id' },
      { table: 'gestion_tache_demande', colonne: 'raison' },
    ]);
  });
  it('aucune suppression de ligne ; la table des invités refuse la suppression (déclencheurs de la 346)', () => {
    const sql = coeur(contenu).join('\n');
    expect(sql).not.toMatch(/\b(DELETE|TRUNCATE)\b(?! ON)/i);
    expect(sql).toContain('CREATE TRIGGER gestion_tache_invite_no_delete BEFORE DELETE ON gestion_tache_invite');
    expect(sql).not.toMatch(/UPDATE gestion_tache SET/i);
  });
  it('les raisons acceptées sont celles que le code écrit', () => {
    const code = readFileSync(path.join(process.cwd(), 'app/lib/gestion/acceptationRepo.ts'), 'utf8');
    for (const r of ['creation', 'ajout', 'relance', 'renvoi', 'destinataire_change']) {
      expect(contenu).toContain(`'${r}'`);
      expect(code).toContain(`'${r}'`);
    }
  });
});

describe('366 (tâches ↔ événements) : enveloppée, une table neuve, aucune donnée touchée', () => {
  const contenu = lire(MIGRATIONS, '366_gestion_tache_evenement.sql');
  const a = analyserMigration({ fichier: '366_gestion_tache_evenement.sql', contenu });
  it('passe le garde, enveloppée, réversible, une seule table créée, aucune colonne ajoutée ailleurs', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual(['gestion_tache_evenement']);
    expect(a.colonnesAjoutees).toEqual([]);
  });
  it('aucune écriture de données ; la suppression est refusée par les déclencheurs de la 346', () => {
    const sql = coeur(contenu).join('\n');
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE FROM|TRUNCATE gestion)\b/i);
    expect(sql).toContain('CREATE TRIGGER gestion_tache_evenement_no_delete BEFORE DELETE ON gestion_tache_evenement');
  });
});

describe('367 (reprise de « Événement du bien lié ») : enveloppée, un seul INSERT idempotent, la donnée d’origine intacte', () => {
  const contenu = lire(MIGRATIONS, '367_gestion_tache_evenement_reprise.sql');
  const a = analyserMigration({ fichier: '367_gestion_tache_evenement_reprise.sql', contenu });
  it('passe le garde, enveloppée, réversible, ni table ni colonne', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees).toEqual([]);
  });
  it('n’écrit QUE dans gestion_tache_evenement, sans doublon ; gestion_tache n’est ni modifiée ni vidée', () => {
    const sql = coeur(contenu);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/^INSERT INTO gestion_tache_evenement /);
    expect(sql[0]).toContain('NOT EXISTS');
    expect(sql.join('\n')).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
  });
});

describe('368 (tâche sans bien) : enveloppée, lot_id facultatif, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '368_gestion_tache_sans_bien.sql');
  const a = analyserMigration({ fichier: '368_gestion_tache_sans_bien.sql', contenu });
  it('passe le garde, enveloppée, réversible, ni table ni colonne nouvelle', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees).toEqual([]);
  });
  it('une seule instruction : DROP NOT NULL sur gestion_tache.lot_id ; aucune donnée écrite, la clé étrangère reste', () => {
    const sql = coeur(contenu);
    expect(sql).toEqual(['ALTER TABLE gestion_tache ALTER COLUMN lot_id DROP NOT NULL']);
    expect(contenu).not.toMatch(/\b(UPDATE|INSERT|DELETE|TRUNCATE|DROP CONSTRAINT|DROP TABLE)\b/i);
  });
});
