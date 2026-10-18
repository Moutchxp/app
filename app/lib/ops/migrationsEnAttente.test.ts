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
  // 365 : lot GESTION-INVITATIONS-TACHES (17/10/2026). 369 : lot L0, rapprochement des fiches de l'application (17/10/2026).
  // 370 : lot L1, loyer de départ, taux et honoraires de gestion (17/10/2026). 371 : droit de la tuile Location (17/10/2026).
  // 372 : fiche du bien, annexes en arbre, N° de mandat (tuile Location, 17/10/2026). 373 : sortie du portefeuille.
  // 374 : formulaire complet du bien (tuile Location, 17/10/2026). 375 : « propriétaire(s) en gestion ? ».
  // 376 : famille de bien, parking, accès, annexe à une autre adresse (tuile Location, 17/10/2026).
  // 377 : date de la dernière AG de copropriété, par immeuble (tuile Location, 18/10/2026).
  // 378 : nom d'une annexe « Autre », assurance PNO et sa date anniversaire (tuile Location, 18/10/2026).
  // 379 : entretien à prévoir, annotation et détachement d'une annexe, mandat de transaction (tuile Location, 18/10/2026).
  // 380 : origine de l'archivage d'un propriétaire (tuile Location, 18/10/2026).
  const A_VENIR = ['363_admin_invitation.sql', '364_internaute_residence.sql', '365_gestion_tache_invite.sql', '366_gestion_tache_evenement.sql',
    '367_gestion_tache_evenement_reprise.sql', '368_gestion_tache_sans_bien.sql', '369_gestion_annuaire_rapprochement.sql',
    '370_gestion_honoraires_gestion.sql', '371_location_droit.sql', '372_location_biens_annexes.sql',
    '373_location_sortie_portefeuille.sql', '374_location_bien_complet.sql',
    '375_location_proprietaire_en_gestion.sql', '376_location_bien_famille.sql', '377_location_immeuble_ag.sql',
    '378_location_annexe_nom_pno.sql', '379_location_entretien_annexe_mandat.sql', '380_location_origine_archivage.sql'];
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

  it('363 à 380 sont les seules nouvelles, sans refus ; 362 appliquée : 216 n’est plus rappelée, 212 et 262 le restent', () => {
    const plan = planifier(existants, registre);
    expect(plan.refus).toEqual([]);
    expect(plan.nouvelles.map((n) => n.fichier)).toEqual(A_VENIR);
    const avert = planifier(existants, inscrire(A_VENIR)).avertissements.join('\n');
    expect(avert).not.toMatch(/216_/);
    expect(avert).toMatch(/212_permis_emprise_numero\.sql : écartée/);
    expect(avert).toMatch(/262_gestion_piece_classement\.sql : écartée/);
  });

  it('la 361 déplacée telle quelle serait REFUSÉE (sous la dernière appliquée) : elle devra prendre un numéro au-dessus (381)', () => {
    const apresMaj = inscrire(A_VENIR);
    const contenu361 = lire(ATTENTE, '361_permis_emprise_numero_reveil.sql');
    const telleQuelle = planifier([...existants, { fichier: '361_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(telleQuelle.refus.join('\n')).toMatch(/361_permis_emprise_numero_reveil\.sql : numérotée sous la dernière migration appliquée \(380\)/);
    const renumerotee = planifier([...existants, { fichier: '381_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(renumerotee.refus).toEqual([]);
    expect(renumerotee.nouvelles.map((n) => n.fichier)).toEqual(['381_permis_emprise_numero_reveil.sql']);
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

describe('369 (lot L0, rapprochement des fiches de l’application) : enveloppée, colonnes facultatives, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '369_gestion_annuaire_rapprochement.sql');
  const a = analyserMigration({ fichier: '369_gestion_annuaire_rapprochement.sql', contenu });
  it('passe le garde, enveloppée, réversible ; cle_import et rapproche_le sur propriétaires, locataires, occupations', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees).toEqual(['proprietaire', 'locataire', 'occupation'].flatMap((s) => [
      { table: `gestion_annuaire_${s}`, colonne: 'cle_import' }, { table: `gestion_annuaire_${s}`, colonne: 'rapproche_le' }]));
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});

describe('370 (lot L1, loyer de départ, taux et honoraires de gestion) : enveloppée, ajout seul, aucune ligne existante touchée', () => {
  const contenu = lire(MIGRATIONS, '370_gestion_honoraires_gestion.sql');
  const a = analyserMigration({ fichier: '370_gestion_honoraires_gestion.sql', contenu });
  it('passe le garde, enveloppée, réversible ; trois tables neuves et deux colonnes facultatives sur les lots', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual(['gestion_location_conditions', 'gestion_honoraires_reglage', 'gestion_reglage_date']);
    expect(a.colonnesAjoutees).toEqual([
      { table: 'gestion_annuaire_lot', colonne: 'taux_honos_wippimmo' },
      { table: 'gestion_annuaire_lot', colonne: 'base_honos_wippimmo' }]);
  });
  it('aucune ligne existante modifiée ni supprimée : les seuls INSERT visent ses propres tables neuves', () => {
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE|TRUNCATE)\b/im);
    expect(contenu).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b/i);
    const cibles = [...contenu.matchAll(/INSERT INTO\s+(\w+)/g)].map((m) => m[1]);
    expect(new Set(cibles)).toEqual(new Set(['gestion_honoraires_reglage', 'gestion_reglage_date']));
  });
});

describe('371 (droit de la tuile Location) : enveloppée, une colonne facultative, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '371_location_droit.sql');
  const a = analyserMigration({ fichier: '371_location_droit.sql', contenu });
  it('passe le garde, enveloppée, réversible ; perm_location sur admin_utilisateur et rien d’autre', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees).toEqual([{ table: 'admin_utilisateur', colonne: 'perm_location' }]);
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});

describe('372 (tuile Location : bien, annexes, N° de mandat) : enveloppée, ajout seul, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '372_location_biens_annexes.sql');
  const a = analyserMigration({ fichier: '372_location_biens_annexes.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une table neuve et des colonnes facultatives', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual(['gestion_lot_annexe']);
    expect(a.colonnesAjoutees).toEqual([
      { table: 'gestion_annuaire_proprietaire', colonne: 'numero_mandat_gestion' },
      ...['categorie', 'etage', 'porte', 'num_lot_copro', 'surface_carrez_m2', 'surface_exterieure_m2']
        .map((colonne) => ({ table: 'gestion_annuaire_lot', colonne }))]);
  });
  it('aucune donnée écrite ni supprimée ; le lien annexe → logement est protégé en base', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE FROM|TRUNCATE TABLE|DROP TABLE|DROP COLUMN)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
    expect(contenu).toContain('BEFORE UPDATE OR DELETE ON gestion_lot_annexe');
  });
});

describe('373 (tuile Location : sortie du portefeuille) : enveloppée, colonnes facultatives, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '373_location_sortie_portefeuille.sql');
  const a = analyserMigration({ fichier: '373_location_sortie_portefeuille.sql', contenu });
  it('passe le garde, enveloppée, réversible ; sorti_portefeuille_le / _par sur propriétaires, locataires, biens', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees).toEqual(['proprietaire', 'locataire', 'lot'].flatMap((t) => [
      { table: `gestion_annuaire_${t}`, colonne: 'sorti_portefeuille_le' }, { table: `gestion_annuaire_${t}`, colonne: 'sorti_portefeuille_par' }]));
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});
describe('374 (tuile Location : formulaire complet du bien) : enveloppée, colonnes facultatives, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '374_location_bien_complet.sql');
  const a = analyserMigration({ fichier: '374_location_bien_complet.sql', contenu });
  it('passe le garde, enveloppée, réversible ; colonnes du bien sur gestion_annuaire_lot seulement', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual([]);
    expect(a.colonnesAjoutees.map((c) => c.colonne)).toEqual(['batiment', 'escalier', 'type_logement', 'nombre_pieces', 'meuble',
      'surface_habitable_m2', 'syndic_id', 'epoque_construction', 'chauffage', 'dpe_classe', 'dpe_date', 'commentaire']);
    expect(new Set(a.colonnesAjoutees.map((c) => c.table))).toEqual(new Set(['gestion_annuaire_lot']));
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});
describe('375 (tuile Location : propriétaire en gestion ?) : enveloppée, une colonne facultative, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '375_location_proprietaire_en_gestion.sql');
  const a = analyserMigration({ fichier: '375_location_proprietaire_en_gestion.sql', contenu });
  it('passe le garde, enveloppée, réversible ; en_gestion sur gestion_annuaire_proprietaire', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([{ table: 'gestion_annuaire_proprietaire', colonne: 'en_gestion' }]);
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});
describe('376 (tuile Location : famille de bien, parking, accès, annexe à autre adresse) : enveloppée, colonnes facultatives', () => {
  const contenu = lire(MIGRATIONS, '376_location_bien_famille.sql');
  const a = analyserMigration({ fichier: '376_location_bien_famille.sql', contenu });
  it('passe le garde, enveloppée, réversible ; colonnes sur gestion_annuaire_lot seulement', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees.map((c) => c.colonne)).toEqual(['type_local', 'parking_situation', 'parking_type', 'surface_m2',
      'ascenseur', 'digicode', 'digicode_code', 'precision_acces', 'adresse_autre']);
    expect(new Set(a.colonnesAjoutees.map((c) => c.table))).toEqual(new Set(['gestion_annuaire_lot']));
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});

describe('377 (tuile Location : date de la dernière AG, par immeuble) : enveloppée, une table neuve et rien d’autre', () => {
  const contenu = lire(MIGRATIONS, '377_location_immeuble_ag.sql');
  const a = analyserMigration({ fichier: '377_location_immeuble_ag.sql', contenu });
  it('passe le garde, enveloppée, réversible ; crée gestion_immeuble_ag seulement', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.tablesCreees).toEqual(['gestion_immeuble_ag']);
    expect(a.colonnesAjoutees).toEqual([]);
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});

describe('378 (tuile Location : nom d’annexe « Autre », assurance PNO) : enveloppée, colonnes facultatives', () => {
  const contenu = lire(MIGRATIONS, '378_location_annexe_nom_pno.sql');
  const a = analyserMigration({ fichier: '378_location_annexe_nom_pno.sql', contenu });
  it('passe le garde, enveloppée, réversible ; 3 colonnes sur gestion_annuaire_lot seulement', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees.map((c) => c.colonne)).toEqual(['nom_annexe', 'assurance_pno', 'pno_date_anniversaire']);
    expect(new Set(a.colonnesAjoutees.map((c) => c.table))).toEqual(new Set(['gestion_annuaire_lot']));
  });
  it('aucune donnée écrite ni supprimée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
  });
});

describe('379 (tuile Location : entretien, annexe annotée / détachée, mandat de transaction) : enveloppée, ajout seul', () => {
  const contenu = lire(MIGRATIONS, '379_location_entretien_annexe_mandat.sql');
  const a = analyserMigration({ fichier: '379_location_entretien_annexe_mandat.sql', contenu });
  it('passe le garde, enveloppée, réversible ; colonnes facultatives et une table neuve', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([
      { table: 'gestion_annuaire_lot', colonne: 'annotation' }, { table: 'gestion_annuaire_lot', colonne: 'entretien_a_prevoir' },
      { table: 'gestion_annuaire_lot', colonne: 'annexe_detachee_le' }, { table: 'gestion_annuaire_lot', colonne: 'annexe_detachee_par_libelle' },
      { table: 'gestion_annuaire_proprietaire', colonne: 'numero_mandat_transaction' },
    ]);
    expect(a.tablesCreees).toEqual(['gestion_lot_entretien']);
  });
  it('aucune donnée écrite ni supprimée ; le lien parent des annexes n’est pas touché', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
    expect(contenu).not.toMatch(/ALTER TABLE gestion_lot_annexe/i);
  });
});
