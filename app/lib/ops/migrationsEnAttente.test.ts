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
  // 381 : origine de la sortie d'un bien (tuile Location, 18/10/2026).
  // 382 : « Non soumis » au DPE (tuile Location, 18/10/2026).
  // 383 : préavis du locataire et zone tendue (tuiles Location / Gestion, 18/10/2026).
  // 384 : date de l'état des lieux de sortie prévu (accueil Location, 18/10/2026).
  // 385 : état des lieux de sortie planifié — lien vers la tâche du module de tâches (accueil Location, 19/10/2026).
  // 386 : fiche bien = lots loués ensemble — regroupement, lot orphelin en bien autonome, réintégration (19/10/2026).
  // 387 : rapprochement des dossiers clients copiés — propositions et décisions (tuile Gestion, 19/10/2026).
  // 388 : dossier attitré d'un bien et rapprochement des biens (tuile Gestion, 19/10/2026).
  // 389 : identifiants de l'arborescence Drive validée N3 → N10 (tuile Gestion, 19/10/2026).
  // 390 : « Bien en gestion ? » propre à chaque bien (tuile Location, 20/10/2026).
  // 391 : conditions d'entrée d'un bail, écran « Nouveau locataire » (tuile Location, 20/10/2026).
  // 392 : jours de prélèvement 1/5/10/15, honoraires propriétaire (barèmes datés, zone très tendue) (tuile Location, 20/10/2026).
  // 393 : le bail devient une fiche ; garants et contacts rattachés ; verrou ni DELETE ni TRUNCATE (Location / Gestion, 20/10/2026).
  // 394 : la branche « BAIL » du Drive rattachée au bail (bail_id sur gestion_drive_noeud) (Location, 20/10/2026).
  // 395 : le mail « Nouvelle location » (destinataires, journal des envois) et les versions des barèmes (Location, 21/10/2026).
  // 396 : le digicode porté par l'immeuble (adresse normalisée), son journal (Location / Gestion, 21/10/2026).
  // 397 : la date de signature des mandats de gestion et de transaction (fiche propriétaire) (Location, 21/10/2026).
  // 398 : le message d'accompagnement dans le journal d'envoi du mail « Nouvelle location » (Location, 21/10/2026).
  // 399 : un digicode par bâtiment (immeuble = adresse normalisée + bâtiment normalisé), journal du bâtiment (Gestion / Location, 21/10/2026).
  // 400 : « Paiement des charges » de copropriété sur le bien (propriétaire / agence) (Location, 21/10/2026).
  // 401 : « ID fiscal du bien » (avis de taxe foncière), sur le bien principal (Location, 21/10/2026).
  // 402 : honoraires propriétaire saisis à la main (marque « saisi à la main ») (Location, 21/10/2026).
  // 403 : le statut du bien — en gestion / ancienne gestion / location seule — et le journal de ses transitions (Gestion / Location, 21/10/2026).
  // 404 : l'arbre « Base de données location seule » du Drive (arbre de chaque nœud, racine inscrite) (Gestion / Location, 21/10/2026).
  // 405 : la fin de gestion en deux temps — marque d'archivage, réglages datés de la Location (délai d'archivage) (Gestion, 21/10/2026).
  // 406 : « Outils de suivi » — l'activité location (une ligne par bail), apporteurs, règle de commission, « Voir les commissions » (Location, 22/10/2026).
  // 407 : origine du contact, annuaire des apporteurs rattachés à un collègue (daté), choix de prime (Location, 23/10/2026).
  // 408 : l'historique du suivi — mandats de gestion perdus du fichier, écarts expliqués avec le fichier (Location, 23/10/2026).
  // 409 : rattachement d'un apporteur à son collègue « depuis toujours » (date d'effet vide) (Location, 23/10/2026).
  const A_VENIR = ['363_admin_invitation.sql', '364_internaute_residence.sql', '365_gestion_tache_invite.sql', '366_gestion_tache_evenement.sql',
    '367_gestion_tache_evenement_reprise.sql', '368_gestion_tache_sans_bien.sql', '369_gestion_annuaire_rapprochement.sql',
    '370_gestion_honoraires_gestion.sql', '371_location_droit.sql', '372_location_biens_annexes.sql',
    '373_location_sortie_portefeuille.sql', '374_location_bien_complet.sql',
    '375_location_proprietaire_en_gestion.sql', '376_location_bien_famille.sql', '377_location_immeuble_ag.sql',
    '378_location_annexe_nom_pno.sql', '379_location_entretien_annexe_mandat.sql', '380_location_origine_archivage.sql',
    '381_location_origine_sortie_bien.sql', '382_location_dpe_non_soumis.sql', '383_location_preavis.sql', '384_location_etat_des_lieux.sql',
    '385_location_edls.sql', '386_location_regroupement.sql', '387_gestion_rapprochement_dossiers.sql',
    '388_gestion_dossier_attitre_bien.sql', '389_gestion_drive_noeud.sql', '390_location_bien_en_gestion.sql',
    '391_location_conditions_entree.sql', '392_location_honoraires_proprietaire.sql', '393_location_bail_rattachements.sql',
    '394_location_bail_drive.sql', '395_location_mail_nouvelle_location.sql', '396_gestion_immeuble_digicode.sql', '397_location_mandat_date_signature.sql', '398_location_mail_message.sql',
    '399_gestion_immeuble_digicode_batiment.sql', '400_location_charges_copro.sql',
    '401_location_id_fiscal.sql', '402_location_honoraires_saisis.sql', '403_gestion_statut_bien.sql',
    '404_gestion_drive_arbre_location_seule.sql', '405_gestion_fin_de_gestion_archivage.sql', '406_location_suivi_activite.sql', '407_location_suivi_origine_apporteurs.sql',
    '408_location_suivi_historique.sql', '409_location_apporteur_depuis_toujours.sql'];
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

  it('363 à 409 sont les seules nouvelles, sans refus ; 362 appliquée : 216 n’est plus rappelée, 212 et 262 le restent', () => {
    const plan = planifier(existants, registre);
    expect(plan.refus).toEqual([]);
    expect(plan.nouvelles.map((n) => n.fichier)).toEqual(A_VENIR);
    const avert = planifier(existants, inscrire(A_VENIR)).avertissements.join('\n');
    expect(avert).not.toMatch(/216_/);
    expect(avert).toMatch(/212_permis_emprise_numero\.sql : écartée/);
    expect(avert).toMatch(/262_gestion_piece_classement\.sql : écartée/);
  });

  it('la 361 déplacée telle quelle serait REFUSÉE (sous la dernière appliquée) : elle devra prendre un numéro au-dessus (410)', () => {
    const apresMaj = inscrire(A_VENIR);
    const contenu361 = lire(ATTENTE, '361_permis_emprise_numero_reveil.sql');
    const telleQuelle = planifier([...existants, { fichier: '361_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(telleQuelle.refus.join('\n')).toMatch(/361_permis_emprise_numero_reveil\.sql : numérotée sous la dernière migration appliquée \(409\)/);
    const renumerotee = planifier([...existants, { fichier: '410_permis_emprise_numero_reveil.sql', contenu: contenu361 }], apresMaj);
    expect(renumerotee.refus).toEqual([]);
    expect(renumerotee.nouvelles.map((n) => n.fichier)).toEqual(['410_permis_emprise_numero_reveil.sql']);
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

describe('382 (tuile Location : « Non soumis » au DPE) : enveloppée, une colonne facultative, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '382_location_dpe_non_soumis.sql');
  const a = analyserMigration({ fichier: '382_location_dpe_non_soumis.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une colonne sur gestion_annuaire_lot, aucune table', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([{ table: 'gestion_annuaire_lot', colonne: 'dpe_non_soumis' }]);
    expect(a.tablesCreees).toEqual([]);
  });
  it('aucune donnée écrite ni supprimée ; la contrainte de la classe DPE (A–G) n’est pas touchée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP|DEFAULT)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
    expect(contenu).not.toMatch(/dpe_classe_chk/);
  });
});

describe('383 (tuiles Location / Gestion : préavis du locataire, zone tendue) : enveloppée, deux tables neuves, aucune ligne existante touchée', () => {
  const contenu = lire(MIGRATIONS, '383_location_preavis.sql');
  const a = analyserMigration({ fichier: '383_location_preavis.sql', contenu });
  it('passe le garde, enveloppée, réversible ; deux tables neuves, aucune colonne ajoutée ailleurs', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([]);
    expect(a.tablesCreees).toEqual(['gestion_zone_tendue', 'gestion_location_preavis']);
  });
  it('les seuls INSERT amorcent SA table de zones tendues ; aucune ligne existante modifiée ni supprimée ; préavis verrouillé en base', () => {
    expect([...contenu.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1])).toEqual(['gestion_zone_tendue']);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).not.toMatch(/\bTRUNCATE\s+\w+\s*;/i);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_location_preavis/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON gestion_location_preavis/);
    // La migration ne s'appuie pas sur une fonction née en 372 : elle s'applique aussi sur une base sans les migrations Location.
    expect(contenu).not.toMatch(/EXECUTE FUNCTION gestion_ajout_seul_refuser/);
  });
});

describe('384 (accueil Location : date de l’état des lieux de sortie prévu) : enveloppée, une colonne facultative, aucune ligne touchée', () => {
  const contenu = lire(MIGRATIONS, '384_location_etat_des_lieux.sql');
  const a = analyserMigration({ fichier: '384_location_etat_des_lieux.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une colonne sur gestion_annuaire_occupation, aucune table', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([{ table: 'gestion_annuaire_occupation', colonne: 'etat_des_lieux_prevu_le' }]);
    expect(a.tablesCreees).toEqual([]);
  });
  it('aucune donnée écrite ni supprimée ; la date de sortie n’est pas touchée', () => {
    expect(contenu).not.toMatch(/\b(INSERT INTO|DELETE|TRUNCATE|DROP|DEFAULT)\b/i);
    expect(contenu).not.toMatch(/^\s*UPDATE\b/im);
    expect(contenu).not.toMatch(/\bsortie\s*=/);
  });
});

describe('385 (accueil Location : EDLS planifié, lien vers la tâche) : enveloppée, une table neuve, aucune ligne existante touchée', () => {
  const contenu = lire(MIGRATIONS, '385_location_edls.sql');
  const a = analyserMigration({ fichier: '385_location_edls.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une table neuve, aucune colonne ajoutée ailleurs, aucune table de tâches en double', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([]);
    expect(a.tablesCreees).toEqual(['gestion_location_edls']);
    expect(contenu).toMatch(/REFERENCES gestion_tache\(id\)/);
  });
  it('aucune donnée écrite ni supprimée ; le lien est verrouillé en base (ni DELETE, ni TRUNCATE, clôture seule)', () => {
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_location_edls/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON gestion_location_edls/);
  });
});

describe('386 (Location : fiche bien = lots loués ensemble) : enveloppée, une table neuve, le lien annexe → logement intact', () => {
  const contenu = lire(MIGRATIONS, '386_location_regroupement.sql');
  const a = analyserMigration({ fichier: '386_location_regroupement.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une table neuve, aucune colonne ajoutée ailleurs', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([]);
    expect(a.tablesCreees).toEqual(['gestion_bien_regroupement']);
  });
  it('aucune donnée écrite ni supprimée ; gestion_lot_annexe jamais touchée ; verrou en base (clôture seule)', () => {
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).not.toMatch(/ALTER TABLE gestion_lot_annexe|ON gestion_lot_annexe/);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_bien_regroupement/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON gestion_bien_regroupement/);
  });
});

describe('387 (Gestion : rapprochement des dossiers clients) : enveloppée, deux tables neuves en ajout seul, rien d’autre', () => {
  const contenu = lire(MIGRATIONS, '387_gestion_rapprochement_dossiers.sql');
  const a = analyserMigration({ fichier: '387_gestion_rapprochement_dossiers.sql', contenu });
  it('passe le garde, enveloppée, réversible ; deux tables neuves, aucune colonne ajoutée ailleurs', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([]);
    expect([...a.tablesCreees].sort()).toEqual(['gestion_rapprochement_decision', 'gestion_rapprochement_proposition']);
  });
  it('aucune donnée écrite ; aucune autre table touchée ; verrou en base (ajout seul) sur les deux tables', () => {
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).not.toMatch(/ALTER TABLE/);
    for (const t of ['gestion_rapprochement_proposition', 'gestion_rapprochement_decision']) {
      expect(contenu).toMatch(new RegExp(`BEFORE UPDATE OR DELETE ON ${t}\\b`));
      expect(contenu).toMatch(new RegExp(`BEFORE TRUNCATE ON ${t}\\b`));
    }
  });
});

describe('388 (Gestion : dossier attitré d’un bien, rapprochement des biens) : une colonne nullable, deux tables neuves en ajout seul', () => {
  const contenu = lire(MIGRATIONS, '388_gestion_dossier_attitre_bien.sql');
  const a = analyserMigration({ fichier: '388_gestion_dossier_attitre_bien.sql', contenu });
  it('passe le garde, enveloppée, réversible ; la seule colonne ajoutée est gestion_annuaire_lot.drive_dossier_id', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([{ table: 'gestion_annuaire_lot', colonne: 'drive_dossier_id' }]);
    expect([...a.tablesCreees].sort()).toEqual(['gestion_rapprochement_bien_decision', 'gestion_rapprochement_bien_proposition']);
  });
  it('aucune donnée écrite (le repointage est l’étape F) ; verrou en base sur les deux tables neuves', () => {
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS drive_dossier_id text;/);
    expect(contenu).not.toMatch(/drive_dossier_id text NOT NULL|SET DEFAULT/);
    for (const t of ['gestion_rapprochement_bien_proposition', 'gestion_rapprochement_bien_decision']) {
      expect(contenu).toMatch(new RegExp(`BEFORE UPDATE OR DELETE ON ${t}\\b`));
      expect(contenu).toMatch(new RegExp(`BEFORE TRUNCATE ON ${t}\\b`));
    }
  });
});

describe('389 (Gestion : identifiants de l’arborescence Drive validée) : une table neuve, verrou en base, aucune donnée', () => {
  const contenu = lire(MIGRATIONS, '389_gestion_drive_noeud.sql');
  const a = analyserMigration({ fichier: '389_gestion_drive_noeud.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une seule table créée, aucune colonne ajoutée ailleurs', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([]);
    expect([...a.tablesCreees]).toEqual(['gestion_drive_noeud']);
  });
  it('aucune donnée écrite (l’enregistrement est l’étape K) ; ni DELETE ni TRUNCATE ; clé et identifiant Drive uniques', () => {
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_drive_noeud\b/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON gestion_drive_noeud\b/);
    expect(contenu).toMatch(/cle text NOT NULL CONSTRAINT gestion_drive_noeud_cle_uq UNIQUE/);
    expect(contenu).toMatch(/drive_id text NOT NULL CONSTRAINT gestion_drive_noeud_drive_id_uq UNIQUE/);
  });
});

describe('390 (Location : « Bien en gestion ? » propre à chaque bien) : une colonne sur le lot, « en gestion » par défaut', () => {
  const contenu = lire(MIGRATIONS, '390_location_bien_en_gestion.sql');
  const a = analyserMigration({ fichier: '390_location_bien_en_gestion.sql', contenu });
  it('passe le garde, enveloppée, réversible ; la seule colonne ajoutée est gestion_annuaire_lot.en_gestion', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([{ table: 'gestion_annuaire_lot', colonne: 'en_gestion' }]);
    expect(a.tablesCreees).toEqual([]);
  });
  it('les biens existants restent « en gestion » (valeur par défaut true, jamais nulle) ; aucune donnée réécrite', () => {
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS en_gestion boolean NOT NULL DEFAULT true;/);
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
  });
});

describe('391 (Location : conditions d’entrée d’un bail) : une table neuve en ajout seul, aucune donnée', () => {
  const contenu = lire(MIGRATIONS, '391_location_conditions_entree.sql');
  const a = analyserMigration({ fichier: '391_location_conditions_entree.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une seule table créée, aucune colonne ajoutée ailleurs', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect(a.colonnesAjoutees).toEqual([]);
    expect([...a.tablesCreees]).toEqual(['gestion_location_conditions_entree']);
  });
  it('aucune donnée écrite ; ni UPDATE, ni DELETE, ni TRUNCATE (verrou en base) ; montants en centimes entiers', () => {
    expect(contenu).not.toMatch(/INSERT INTO/);
    expect(contenu).not.toMatch(/^\s*(UPDATE|DELETE)\b/im);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_location_conditions_entree\b/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON gestion_location_conditions_entree\b/);
    for (const c of ['prorata_loyer_centimes', 'prorata_charges_centimes', 'depot_garantie_centimes', 'honoraires_agence_centimes']) {
      expect(contenu).toMatch(new RegExp(`${c}\\s+bigint`));
    }
  });
});

describe('392 (Location : jours 1/5/10/15, honoraires propriétaire, barèmes datés, zone très tendue) : ajout seul', () => {
  const contenu = lire(MIGRATIONS, '392_location_honoraires_proprietaire.sql');
  const a = analyserMigration({ fichier: '392_location_honoraires_proprietaire.sql', contenu });
  it('passe le garde, enveloppée, réversible ; une table neuve (barèmes), des colonnes facultatives', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect(a.irreversible).toBe(false);
    expect([...a.tablesCreees]).toEqual(['gestion_bareme_honoraires_location']);
  });
  it('les jours deviennent 1, 5, 10, 15 (ajout de valeurs) ; barèmes en ajout seul, amorce du 01/01/2026 aux tarifs officiels', () => {
    expect(contenu).toMatch(/CHECK \(prelevement_jour IN \(1, 5, 10, 15\)\)/);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_bareme_honoraires_location\b/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON gestion_bareme_honoraires_location\b/);
    expect(contenu).toMatch(/SELECT DATE '2026-01-01', 12\.10, 10\.09, 8\.07, 3\.03,/);
    expect(contenu).not.toMatch(/^\s*DELETE\b/im);
  });
  it('« très tendue » : une colonne sur la table des zones, amorcée sur 75/92/93/94 « à vérifier », sautée sans la table 383', () => {
    expect(contenu).toMatch(/ALTER TABLE IF EXISTS gestion_zone_tendue ADD COLUMN IF NOT EXISTS tres_tendue boolean NOT NULL DEFAULT false;/);
    expect(contenu).toMatch(/IF to_regclass\('gestion_zone_tendue'\) IS NOT NULL THEN/);
    expect(contenu).toMatch(/code IN \('75', '92', '93', '94'\)/);
    expect(contenu).toMatch(/à vérifier/);
  });
});

describe('393 (Location / Gestion : le bail, les garants et contacts rattachés, le verrou) : une seule migration, non appliquée', () => {
  const contenu = lire(MIGRATIONS, '393_location_bail_rattachements.sql');
  const a = analyserMigration({ fichier: '393_location_bail_rattachements.sql', contenu });
  it('passe le garde, enveloppée ; deux tables neuves (le bail, les garants)', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees].sort()).toEqual(['gestion_bail', 'gestion_bail_garant']);
  });
  it('aucune ligne supprimée ; pas de table temporaire (marche aussi lancée telle quelle, psql -f) ; anciennes colonnes gardées, dites obsolètes', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE)\b/im);
    expect(contenu).not.toMatch(/TEMP(ORARY)? TABLE/i);
    expect(contenu).not.toMatch(/DROP COLUMN/i);
    expect(contenu).toMatch(/COMMENT ON COLUMN gestion_location_conditions\.occupation_id IS '[^']*OBSOLÈTE/i);
    expect(contenu).toMatch(/COMMENT ON COLUMN gestion_contact_carte\.lot_cle IS '[^']*OBSOLÈTE/i);
  });
  it('🔴 le verrou : ni DELETE (par instruction) ni TRUNCATE, sur les treize tables, sans exemption de base jetable ; CASCADE → RESTRICT', () => {
    for (const t of ['gestion_annuaire_proprietaire', 'gestion_annuaire_lot', 'gestion_annuaire_lot_proprietaire', 'gestion_bail', 'gestion_annuaire_occupation',
      'gestion_annuaire_locataire', 'gestion_annuaire_contact', 'gestion_contact_carte', 'gestion_bail_garant', 'gestion_location_conditions_entree',
      'gestion_location_conditions', 'gestion_lot_entretien', 'gestion_lot_annexe']) expect(contenu).toContain(`'${t}'`);
    expect(contenu).toMatch(/BEFORE DELETE ON %I FOR EACH STATEMENT/);
    expect(contenu).toMatch(/BEFORE TRUNCATE ON %I FOR EACH STATEMENT/);
    expect(contenu).not.toMatch(/gestion_jetable|svav_test/);
    expect(contenu).toMatch(/REFERENCES gestion_annuaire_locataire\(id\) ON DELETE RESTRICT/);
  });
});

describe('394 (Location : la branche « BAIL » du Drive rattachée au bail) : une seule migration, non appliquée', () => {
  const contenu = lire(MIGRATIONS, '394_location_bail_drive.sql');
  const a = analyserMigration({ fichier: '394_location_bail_drive.sql', contenu });
  it('passe le garde, enveloppée ; aucune table neuve, une colonne facultative vers le bail', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual([]);
    expect(contenu).toMatch(/ALTER TABLE gestion_drive_noeud ADD COLUMN IF NOT EXISTS bail_id bigint REFERENCES gestion_bail\(id\)/);
  });
  it('aucune ligne supprimée ni modifiée ; le verrou de la 389 couvre aussi bail_id', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE)\b/im);
    expect(contenu).not.toMatch(/DROP (COLUMN|TABLE|TRIGGER)/i);
    expect(contenu).toMatch(/NEW\.bail_id\)\s+IS DISTINCT FROM/);
  });
});

describe('395 (Location : le mail « Nouvelle location » et les versions des barèmes) : une seule migration, non appliquée', () => {
  const contenu = lire(MIGRATIONS, '395_location_mail_nouvelle_location.sql');
  const a = analyserMigration({ fichier: '395_location_mail_nouvelle_location.sql', contenu });
  it('passe le garde, enveloppée ; deux tables neuves en ajout seul ; la liste par défaut amorcée', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees].sort()).toEqual(['gestion_location_mail_destinataires', 'gestion_location_mail_envoi']);
    expect(contenu).toMatch(/gestion@criterimmo\.fr[\s\S]*gestion\.criterimmo@gmail\.com[\s\S]*laura@monga\.io/);
  });
  it('🔴 aucune valeur de barème ni d’honoraires modifiée ; aucune ligne supprimée', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE)\b/im);
    expect(contenu).not.toMatch(/DROP (COLUMN|TABLE)/i);
    expect(contenu).not.toMatch(/gestion_location_conditions_entree\s+(SET|DISABLE)/i);
    // Le verrou des versions : une version utilisée ne change plus ; jamais antérieure à la précédente ; rien ne s'efface.
    expect(contenu).toMatch(/hono_bareme_id = OLD\.id/);
    expect(contenu).toMatch(/NEW\.depuis < precedente/);
    expect(contenu).toMatch(/une version ne s''efface jamais/);
  });
});

describe('396 (le digicode porté par l’immeuble) : une seule migration, non appliquée', () => {
  const contenu = lire(MIGRATIONS, '396_gestion_immeuble_digicode.sql');
  const a = analyserMigration({ fichier: '396_gestion_immeuble_digicode.sql', contenu });
  it('passe le garde, enveloppée ; deux tables neuves ; les colonnes du bien restent, signalées obsolètes', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees].sort()).toEqual(['gestion_immeuble', 'gestion_immeuble_digicode_journal']);
    expect(contenu).toMatch(/COMMENT ON COLUMN gestion_annuaire_lot\.digicode_code IS 'OBSOLÈTE/);
  });
  it('🔴 aucune ligne supprimée ni modifiée ; aucun lien au syndic', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE)\b/im);
    expect(contenu).not.toMatch(/DROP (COLUMN|TABLE)/i);
    expect(contenu).not.toMatch(/REFERENCES gestion_(syndic|copropriete)/);
  });
});

describe('397 (la date de signature des mandats) : une seule migration, non appliquée', () => {
  const contenu = lire(MIGRATIONS, '397_location_mandat_date_signature.sql');
  const a = analyserMigration({ fichier: '397_location_mandat_date_signature.sql', contenu });
  it('passe le garde, enveloppée ; aucune table neuve ; deux colonnes facultatives sur la fiche propriétaire ; rien de supprimé ni modifié', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual([]);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS mandat_gestion_signe_le date/);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS mandat_transaction_signe_le date/);
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE)\b/im);
    expect(contenu).not.toMatch(/DROP /i);
  });
});

describe('398 (le message d’accompagnement dans le journal d’envoi) : une seule migration, non appliquée', () => {
  const contenu = lire(MIGRATIONS, '398_location_mail_message.sql');
  const a = analyserMigration({ fichier: '398_location_mail_message.sql', contenu });
  it('passe le garde, enveloppée ; une colonne facultative ; rien de supprimé ni modifié', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual([]);
    expect(contenu).toMatch(/ALTER TABLE gestion_location_mail_envoi ADD COLUMN IF NOT EXISTS message text/);
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE)\b/im);
    expect(contenu).not.toMatch(/DROP /i);
  });
});

describe('399 (un digicode par bâtiment) : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '399_gestion_immeuble_digicode_batiment.sql');
  const a = analyserMigration({ fichier: '399_gestion_immeuble_digicode_batiment.sql', contenu });
  it('passe le garde, enveloppée ; une table neuve ; deux colonnes facultatives au journal ; idempotente', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual(['gestion_immeuble_batiment']);
    expect(contenu).toMatch(/CREATE TABLE IF NOT EXISTS gestion_immeuble_batiment/);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS batiment_cle text/);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS batiment_libelle text/);
    expect(contenu).toMatch(/DROP TRIGGER IF EXISTS gestion_immeuble_batiment_no_delete/);
  });
  it('🔴 aucune ligne supprimée ni modifiée (les codes de l’immeuble deviennent son code général tels quels) ; aucun lien au syndic', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
    expect(contenu).not.toMatch(/DROP (COLUMN|TABLE|CONSTRAINT)/i);
    expect(contenu).not.toMatch(/REFERENCES gestion_(syndic|copropriete)/);
  });
});

describe('400 (« Paiement des charges » de copropriété) : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '400_location_charges_copro.sql');
  const a = analyserMigration({ fichier: '400_location_charges_copro.sql', contenu });
  it('passe le garde, enveloppée ; une colonne facultative (proprietaire / agence / vide) ; idempotente', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual([]);
    expect(contenu).toMatch(/ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS charges_copro text/);
    expect(contenu).toMatch(/CHECK \(charges_copro IS NULL OR charges_copro IN \('proprietaire', 'agence'\)\)/);
    expect(contenu).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'gestion_annuaire_lot_charges_copro_chk'\)/);
  });
  it('🔴 aucune ligne supprimée ni modifiée', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
    expect(contenu).not.toMatch(/DROP /i);
  });
});

describe('401 (« ID fiscal du bien ») : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '401_location_id_fiscal.sql');
  const a = analyserMigration({ fichier: '401_location_id_fiscal.sql', contenu });
  it('passe le garde, enveloppée ; une colonne texte facultative ; idempotente ; rien de supprimé ni modifié', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual([]);
    expect(contenu).toMatch(/ALTER TABLE gestion_annuaire_lot ADD COLUMN IF NOT EXISTS id_fiscal text;/);
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
    expect(contenu).not.toMatch(/DROP /i);
  });
});

describe('402 (honoraires propriétaire saisis à la main) : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '402_location_honoraires_saisis.sql');
  const a = analyserMigration({ fichier: '402_location_honoraires_saisis.sql', contenu });
  it('passe le garde, enveloppée ; une colonne booléenne, faux par défaut ; idempotente ; aucun montant modifié, rien de supprimé', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual([]);
    expect(contenu).toMatch(/ALTER TABLE gestion_location_conditions_entree ADD COLUMN IF NOT EXISTS hono_saisi_main boolean NOT NULL DEFAULT false;/);
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
    expect(contenu).not.toMatch(/DROP /i);
  });
});

describe('403 (statut du bien : en gestion / ancienne gestion / location seule) : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '403_gestion_statut_bien.sql');
  const a = analyserMigration({ fichier: '403_gestion_statut_bien.sql', contenu });
  it('passe le garde, enveloppée ; deux colonnes et une table en ajout seul ; idempotente', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual(['gestion_bien_statut_transition']);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS statut_bien text/);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS statut_bien_depuis date/);
    expect(contenu).toMatch(/CREATE TABLE IF NOT EXISTS gestion_bien_statut_transition/);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_bien_statut_transition\s+FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser\(\)/);
    expect(contenu).not.toMatch(/DROP (TABLE|COLUMN|FUNCTION)/i);
  });
  it('🔴 la reprise ne touche QUE les deux colonnes neuves, et seulement des biens sans statut (rejouable) ; aucun effacement', () => {
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE)\b/im);
    const updates = [...contenu.matchAll(/^UPDATE gestion_annuaire_lot lo\s+SET ([\s\S]*?)FROM final f WHERE lo\.id = f\.id;/gm)];
    expect(updates).toHaveLength(1);
    expect(updates[0][1]).toMatch(/^statut_bien = f\.statut,\s+statut_bien_depuis = CASE/);
    expect(contenu).toMatch(/FROM gestion_annuaire_lot lo WHERE lo\.statut_bien IS NULL/);
    expect(contenu).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM gestion_bien_statut_transition t WHERE t\.lot_id = lo\.id\)/);
    // Les colonnes d'avant ne sont jamais écrites.
    expect(contenu).not.toMatch(/SET\s+(en_gestion|gestion_fin|sorti_portefeuille_le)\s*=/i);
  });
});

describe('404 (l’arbre « Base de données location seule » du Drive) : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '404_gestion_drive_arbre_location_seule.sql');
  const a = analyserMigration({ fichier: '404_gestion_drive_arbre_location_seule.sql', contenu });
  it('passe le garde, enveloppée ; la colonne « arbre » (défaut : locative) ; la racine en ajout seul ; aucune ligne modifiée ni supprimée', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual(['gestion_drive_racine']);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS arbre text NOT NULL DEFAULT 'locative'/);
    expect(contenu).toMatch(/CHECK \(\(arbre = 'locative' AND branche IN \('Actifs', 'Inactifs'\)\) OR \(arbre = 'location_seule' AND branche IS NULL\)\)/);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_drive_racine\s+FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser\(\)/);
    expect(contenu).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
    expect(contenu).not.toMatch(/DROP (TABLE|COLUMN|FUNCTION)/i);
    // Le verrou du registre garde tout, sauf le parent, la branche et l'arbre (un déplacement garde l'identifiant).
    expect(contenu).toMatch(/seuls le parent, la branche et l''arbre changent/);
  });
});

describe('405 (fin de gestion en deux temps, archivage automatique) : une seule migration, non appliquée, rejouable', () => {
  const contenu = lire(MIGRATIONS, '405_gestion_fin_de_gestion_archivage.sql');
  const a = analyserMigration({ fichier: '405_gestion_fin_de_gestion_archivage.sql', contenu });
  it('passe le garde, enveloppée ; la marque d’archivage (vide) ; les réglages en ajout seul ; aucune ligne modifiée ni supprimée', () => {
    expect(a.refus).toEqual([]);
    expect(a.mode).toBe('enveloppee');
    expect([...a.tablesCreees]).toEqual(['gestion_location_reglage']);
    expect(contenu).toMatch(/ADD COLUMN IF NOT EXISTS statut_archive_le timestamptz;/);
    expect(contenu).toMatch(/CHECK \(statut_archive_le IS NULL OR statut_bien = 'ancienne_gestion'\)/);
    expect(contenu).toMatch(/BEFORE UPDATE OR DELETE ON gestion_location_reglage\s+FOR EACH ROW EXECUTE FUNCTION gestion_ajout_seul_refuser\(\)/);
    // Hors des corps de déclencheurs (qui écrivent au fil des gestes futurs), la migration n'écrit AUCUNE ligne.
    expect(contenu.replace(/\$\$[\s\S]*?\$\$/g, '')).not.toMatch(/^\s*(DELETE|TRUNCATE|UPDATE|INSERT)\b/im);
    expect(contenu).not.toMatch(/DROP (TABLE|COLUMN|FUNCTION)/i);
    // Un statut neuf repart sans archivage ; les annexes rattachées suivent l'archivage.
    expect(contenu).toContain('NEW.statut_archive_le := NULL;');
    expect(contenu).toContain('statut_archive_le = NEW.statut_archive_le WHERE id = a.id');
  });
});
