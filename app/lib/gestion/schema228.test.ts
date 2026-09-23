import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 1 — garde-fous STATIQUES de la migration 228 (schéma du module « Gestion »). AUCUNE connexion à la base : on lit le
 * FICHIER. Ces tests ne remplacent pas l'application manuelle par Arno ; ils verrouillent ce qui, une fois appliqué, ne se
 * corrige plus sans une seconde migration : additivité, nommage des contraintes, absence de type énuméré, isolement total
 * vis-à-vis du module Permis, et les QUATRE règles de conception du module (on ne supprime jamais ; l'état d'attente est
 * dérivé ; tout se pilote sans code ; ce qui est dérivable n'est pas stocké).
 *
 * `code` = la migration SANS ses lignes de commentaire `--` (les COMMENT ON, eux, restent : c'est du vrai SQL).
 * `prose` = le fichier ENTIER, pour les garde-fous qui vivent dans les commentaires.
 */
const prose = readFileSync('db/migrations/228_gestion_schema.sql', 'utf8');
const code = prose.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

const TABLES = [
  'gestion_config', 'gestion_regle_exclusion', 'gestion_fil', 'gestion_message', 'gestion_piece',
  'gestion_compteur', 'gestion_evenement', 'gestion_reference_externe', 'gestion_affectation',
  'gestion_journal', 'gestion_releve_run',
];

/**
 * Corps d'un `CREATE TABLE` — la DÉFINITION seule, sans les COMMENT ON qui l'entourent. Indispensable : les commentaires
 * DISENT ce que le schéma ne fait pas (« aucune action ON DELETE », « sans dépendance à Gmail », « on ajoutera lot_id »),
 * et une assertion posée sur le fichier entier prendrait ces phrases pour le contraire de ce qu'elles affirment.
 */
function corps(table: string): string {
  const debut = code.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  if (debut === -1) return '';
  const fin = code.indexOf('\n);', debut);
  // Les commentaires de FIN DE LIGNE sont retirés aussi : ils expliquent souvent ce que le schéma NE fait PAS
  //   (« pas d'ON DELETE… »), et les garder ferait conclure l'inverse. Le retrait ne s'applique qu'en dehors des
  //   littéraux : on ne coupe que si le début de ligne contient un nombre PAIR d'apostrophes.
  return code.slice(debut, fin === -1 ? undefined : fin)
    .split('\n')
    .map((l) => {
      const i = l.indexOf('--');
      return i !== -1 && (l.slice(0, i).match(/'/g) ?? []).length % 2 === 0 ? l.slice(0, i) : l;
    })
    .join('\n');
}
/** Toutes les définitions de table, bout à bout (aucun COMMENT ON, aucun commentaire de prose). */
const definitions = TABLES.map(corps).join('\n');

describe('228 — additivité et conventions du dépôt', () => {
  it('crée les 11 tables du module, toutes en IF NOT EXISTS', () => {
    for (const t of TABLES) {
      expect(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`, 'i').test(code)).toBe(true);
    }
  });

  it('ne DÉTRUIT rien : aucun DROP de table/colonne/contrainte/index, aucun DELETE, aucun TRUNCATE', () => {
    expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|FUNCTION|DATABASE|SCHEMA)/i.test(code)).toBe(false);
    expect(/DELETE\s+FROM/i.test(code)).toBe(false);
    expect(/^\s*TRUNCATE\b/im.test(code)).toBe(false); // `BEFORE TRUNCATE ON` (le trigger) reste autorisé
  });

  it('le seul DROP autorisé est celui d’un TRIGGER — seule façon idempotente d’en (re)poser un', () => {
    const drops = [...code.matchAll(/DROP\s+(\w+)/gi)].map((m) => m[1].toUpperCase());
    expect(new Set(drops)).toEqual(new Set(['TRIGGER']));
  });

  it('n’écrit qu’UNE SEULE fois des données existantes : le droit d’accès des administrateurs', () => {
    const updates = [...code.matchAll(/^\s*UPDATE\s+(\w+)/gim)].map((m) => m[1]);
    expect(updates).toEqual(['admin_utilisateur']);
    expect(/UPDATE admin_utilisateur SET perm_gestion = true WHERE role = 'administrateur'/i.test(code)).toBe(true);
  });

  it('les deux écritures de données sont IDEMPOTENTES (rejouer la migration ne double rien)', () => {
    expect(/INSERT INTO gestion_config \(id\) VALUES \(1\) ON CONFLICT \(id\) DO NOTHING/i.test(code)).toBe(true);
    expect(/INSERT INTO gestion_regle_exclusion[\s\S]*WHERE NOT EXISTS/i.test(code)).toBe(true);
    expect(/UPDATE admin_utilisateur[\s\S]{0,140}AND perm_gestion = false/i.test(code)).toBe(true);
  });

  it('AUCUN type énuméré : les listes fermées sont des CHECK, jamais des CREATE TYPE', () => {
    expect(/CREATE\s+TYPE/i.test(code)).toBe(false);
  });

  it('TOUTE contrainte CHECK est NOMMÉE (donc élargissable par DROP/ADD CONSTRAINT, sans réécrire la table)', () => {
    const toutes = (code.match(/CHECK\s*\(/gi) ?? []).length;
    const nommees = (code.match(/CONSTRAINT\s+\w+\s+CHECK\s*\(/gi) ?? []).length;
    expect(toutes).toBeGreaterThan(0);
    expect(nommees).toBe(toutes);
  });

  it('une seule transaction, et un bloc de vérification en fin de fichier', () => {
    expect((code.match(/^\s*BEGIN;/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*COMMIT;/gim) ?? []).length).toBe(1);
    expect(prose).toContain('VÉRIFICATION POST-APPLICATION');
    expect(prose).toContain('ROLLBACK');
  });

  it('est livrée NON APPLIQUÉE, avec la commande d’application à la main', () => {
    expect(prose).toContain('TU NE L\'APPLIQUES PAS');
    expect(prose).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/228_gestion_schema.sql');
  });
});

describe('228 — le module Permis n’est touché d’AUCUNE façon', () => {
  it('n’altère aucune table du module Permis ni du moteur', () => {
    const alterees = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(alterees).toEqual(['admin_utilisateur']); // table partagée de l'administration, qui n'appartient à aucun module
    for (const interdite of ['config_veille', 'config_scoring', 'demande', 'sitadel_dossier', 'batiment', 'certificat']) {
      expect(new RegExp(`(ALTER|INSERT INTO|UPDATE|DELETE FROM)\\s+${interdite}\\b`, 'i').test(code)).toBe(false);
    }
  });

  it('n’écrit JAMAIS dans releve_run — y poser une ligne ferait avancer le curseur de la relève des permis', () => {
    // On neutralise d'abord le nom de NOTRE table sœur, puis on vérifie qu'aucune INSTRUCTION ne vise celle du module Permis.
    const sansSoeur = code.replace(/gestion_releve_run/g, 'gestion_journal_des_passes');
    expect(/(INSERT INTO|UPDATE|ALTER TABLE|DELETE FROM|CREATE TABLE[^;]*)\s+releve_run\b/i.test(sansSoeur)).toBe(false);
    expect(/CREATE TABLE IF NOT EXISTS gestion_releve_run\b/i.test(code)).toBe(true);
    expect(prose).toContain('TABLE SŒUR'); // et la raison est écrite en clair
  });
});

describe('228 — règle ① on ne supprime jamais : une exclusion est réversible', () => {
  it('un message écarté garde la RÉFÉRENCE de la règle qui l’a écarté, et son motif FIGÉ', () => {
    expect(/exclu_par_regle_id\s+bigint\s+REFERENCES gestion_regle_exclusion\(id\)/i.test(code)).toBe(true);
    expect(/exclu_motif\s+text/i.test(code)).toBe(true);
    expect(/exclu_le\s+timestamptz/i.test(code)).toBe(true);
  });

  it('aucune action ON DELETE sur cette référence : une règle citée ne peut pas être supprimée', () => {
    const message = corps('gestion_message');
    expect(message).toContain('exclu_par_regle_id');
    expect(/ON DELETE/i.test(message)).toBe(false);
  });

  it('les trois marques d’exclusion vont ensemble ou aucune (jamais une exclusion inexplicable)', () => {
    expect(/CONSTRAINT gestion_message_exclusion_chk CHECK/i.test(code)).toBe(true);
  });

  it('une règle se DÉSACTIVE, un fil se classe sans suite, une affectation se détache — rien ne se supprime', () => {
    expect(/actif\s+boolean\s+NOT NULL\s+DEFAULT\s+true/i.test(code)).toBe(true);   // gestion_regle_exclusion + gestion_affectation
    expect(/etat\s+text\s+NOT NULL\s+DEFAULT\s+'a_classer'/i.test(code)).toBe(true);
    expect(/sans_suite_le\s+timestamptz/i.test(code)).toBe(true);
    expect(/detache_le\s+timestamptz/i.test(code)).toBe(true);
  });

  it('on peut retrouver les messages écartés par une règle donnée (c’est ce qui permet de les faire revenir)', () => {
    expect(/CREATE INDEX IF NOT EXISTS gestion_message_exclus_idx[\s\S]{0,120}WHERE exclu_le IS NOT NULL/i.test(code)).toBe(true);
  });

  it('un nouveau message dans un fil classé sans suite le ramène dans la file — la règle est écrite', () => {
    expect(prose).toContain('REVIENT dans la file');
  });
});

describe('228 — règle ② l’état « attend une réponse » est DÉRIVÉ, jamais stocké', () => {
  it('AUCUNE colonne ne prétend porter cet état', () => {
    expect(/\b(en_attente|attend_reponse|attente_reponse)\s+(boolean|text|timestamptz)/i.test(code)).toBe(false);
  });

  it('l’index partiel qui rend la dérivation instantanée existe', () => {
    expect(/CREATE INDEX IF NOT EXISTS gestion_message_attente_idx\s+ON gestion_message \(fil_id, recu_le DESC\) WHERE exclu_le IS NULL/i.test(code)).toBe(true);
  });

  it('les colonnes nécessaires à la dérivation sont là (sens du message et indice d’automatisme)', () => {
    expect(/CONSTRAINT gestion_message_sens_chk CHECK \(sens IN \('recu','envoye'\)\)/i.test(code)).toBe(true);
    expect(/automatique\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i.test(code)).toBe(true);
  });

  it('la règle de dérivation est écrite en clair dans le fichier', () => {
    expect(prose).toContain('DÉRIVÉ, JAMAIS STOCKÉ');
    expect(prose).toContain('probablement HUMAIN');
  });
});

describe('228 — règle ③ tout ce qui se pilote se pilote sans code', () => {
  it('la configuration est un SINGLETON verrouillé, avec ses bornes en CHECK', () => {
    expect(/CONSTRAINT gestion_config_singleton_chk CHECK \(id = 1\)/i.test(code)).toBe(true);
    expect(/CONSTRAINT gestion_config_bornes_chk CHECK/i.test(code)).toBe(true);
  });

  it('elle porte les sept réglages demandés, aux valeurs mesurées par la sonde', () => {
    expect(code).toContain("dossier_imap                  text        NOT NULL DEFAULT '_GESTION BOITE MAIL'");
    expect(/conservation_carte_close_mois integer\s+NOT NULL DEFAULT 60/i.test(code)).toBe(true);
    expect(/rattrapage_jours\s+integer\s+NOT NULL DEFAULT 90/i.test(code)).toBe(true);
    expect(/plafond_par_passe\s+integer\s+NOT NULL DEFAULT 400/i.test(code)).toBe(true);
    expect(/piece_taille_max_mo\s+integer\s+NOT NULL DEFAULT 25/i.test(code)).toBe(true);
    expect(code).toContain("domaines_internes             text        NOT NULL DEFAULT 'criterimmo.fr,sansvisavis.com'");
    for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'image/heic',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']) {
      expect(code).toContain(type); // liste PROPRE à la gestion (pdf, jpeg, png, gif, mp4, docx, heic)
    }
  });

  it('les règles d’exclusion vivent EN BASE, avec type, valeur, sens, état, motif, auteur et date', () => {
    for (const colonne of ['type', 'valeur', 'sens', 'actif', 'motif', 'cree_par', 'cree_le']) {
      expect(new RegExp(`^\\s{2}${colonne}\\s`, 'im').test(code)).toBe(true);
    }
    const types = code.match(/gestion_regle_exclusion_type_chk CHECK \(type IN \(([^)]*)\)\)/i);
    expect(types).not.toBeNull();
    for (const v of ['gabarit_objet', 'domaine_expediteur', 'adresse_expediteur', 'signal_entete']) {
      expect(types![1]).toContain(`'${v}'`);
    }
    const sens = code.match(/gestion_regle_exclusion_sens_chk CHECK \(sens IN \(([^)]*)\)\)/i);
    expect(sens![1]).toContain("'les_deux'");
  });

  /**
   * ⚠️ ÉTAT DU FICHIER 228, PAS ÉTAT DE LA BASE. La migration 229 (lot 3-bis) ÉTEINT ensuite les deux règles de domaine
   * interne : un collègue du service location transfère à la gestion des mails de locataires, l'expéditeur devient alors
   * une adresse interne, et ces messages sont de vraies demandes. Une migration appliquée ne se réécrit pas — c'est donc
   * 229 qui fait foi sur l'état courant (cf. schema229.test.ts). Ce test-ci ne vérifie que ce que 228 a semé.
   */
  it('la GRAINE de 228 est posée : le gabarit prouvé et les domaines internes, actifs à l’époque', () => {
    expect(/\('gabarit_objet', 'Document CRITERIMMO', 'les_deux', true,/.test(code)).toBe(true);
    expect(/\('domaine_expediteur', 'criterimmo\.fr', 'recu', true,/.test(code)).toBe(true);
    expect(/\('domaine_expediteur', 'sansvisavis\.com', 'recu', true,/.test(code)).toBe(true);
  });

  it('⚠️ les règles de signal d’en-tête sont posées mais ÉTEINTES — sinon elles écarteraient MONGA', () => {
    for (const signal of ['auto-submitted', 'list-unsubscribe', 'list-id', 'precedence', 'x-auto-response-suppress',
      'feedback-id', 'x-campaign-id', 'x-mailer', 'adresse sans réponse']) {
      expect(new RegExp(`\\('signal_entete', '${signal}', '(les_deux|recu)', false,`).test(code)).toBe(true);
    }
    expect(/\('signal_entete', '[^']+', '(les_deux|recu)', true,/.test(code)).toBe(false); // aucune n'est active
    expect(prose).toContain('MONGA');
  });
});

describe('228 — règle ④ ce qui est dérivable n’est pas stocké', () => {
  it('aucun compteur figé sur le fil ni sur l’événement (nombre de messages, dernier échange)', () => {
    expect(/\b(nb_messages|nombre_messages|dernier_echange|dernier_message_le)\b/i.test(code)).toBe(false);
  });
});

describe('228 — le reste du modèle', () => {
  it('un message ne peut pas être capturé deux fois (dédoublonnage gratuit des relèves)', () => {
    expect(/CONSTRAINT gestion_message_message_id_key UNIQUE \(message_id\)/i.test(code)).toBe(true);
  });

  it('les ancres de fil sont conservées BRUTES → les fils sont recalculables sans retourner à la boîte', () => {
    expect(/in_reply_to\s+text/i.test(code)).toBe(true);
    expect(/references_brut\s+text/i.test(code)).toBe(true);
    expect(/CONSTRAINT gestion_fil_cle_key UNIQUE \(cle\)/i.test(code)).toBe(true);
  });

  it('AUCUNE colonne d’identifiant de fil Gmail : la sonde a montré que les en-têtes suffisent (99 %)', () => {
    expect(/gmail/i.test(definitions)).toBe(false);
  });

  it('le texte des messages est gardé en base ; les pièces, jamais (invariant §7)', () => {
    expect(/corps_texte\s+text/i.test(code)).toBe(true);
    expect(/cle_stockage\s+text/i.test(code)).toBe(true);
    expect(/(bytea|blob|oid)\b/i.test(code)).toBe(false); // aucun contenu binaire en base
    expect(/motif_non_stocke\s+text/i.test(code)).toBe(true); // une pièce non déposée garde sa raison
  });

  it('un fil n’est affecté qu’à UNE carte à la fois ; une carte porte autant de fils qu’il en faut', () => {
    expect(/CREATE UNIQUE INDEX IF NOT EXISTS gestion_affectation_fil_actif_idx ON gestion_affectation \(fil_id\) WHERE actif/i.test(code)).toBe(true);
    expect(/CREATE UNIQUE INDEX[^;]*gestion_affectation \(evenement_id\)/i.test(code)).toBe(false);
  });

  it('la référence d’un événement est verrouillée par un format et sert un compteur ATOMIQUE par année', () => {
    expect(/CONSTRAINT gestion_evenement_reference_chk CHECK \(reference ~ '\^GES-\[0-9\]\{4\}-\[0-9\]\{6\}\$'\)/i.test(code)).toBe(true);
    expect(/CREATE TABLE IF NOT EXISTS gestion_compteur[\s\S]{0,200}annee\s+integer PRIMARY KEY/i.test(code)).toBe(true);
  });

  it('l’accroche MONGA existe et n’impose AUCUN format (doctrine 085)', () => {
    expect(/CREATE TABLE IF NOT EXISTS gestion_reference_externe\b/i.test(code)).toBe(true);
    expect(/CHECK \(reference ~ /i.test(code.split('gestion_reference_externe')[2] ?? '')).toBe(false);
    expect(/CONSTRAINT gestion_reference_externe_key UNIQUE \(evenement_id, reference\)/i.test(code)).toBe(true);
  });

  it('l’accroche « référentiel de lots » est ANNONCÉE, et rien n’est inventé', () => {
    expect(prose).toContain('ACCROCHE FUTURE');
    expect(prose).toContain('adresse_libre');
    // Le référentiel est ANNONCÉ dans la prose, jamais CRÉÉ : aucune colonne, aucune table ne l'anticipe.
    expect(/\b(lot_id|loc_bien|loc_partie|wippimmo)\b/i.test(definitions)).toBe(false);
    expect(/CREATE TABLE[^;]*\b(lot|bien|locataire|proprietaire|bail)\b/i.test(code)).toBe(false);
  });

  it('le journal est APPEND-ONLY garanti EN BASE, sans aucune clé étrangère (la trace survit à la purge)', () => {
    expect(/CREATE OR REPLACE FUNCTION gestion_journal_append_only\(\) RETURNS trigger/i.test(code)).toBe(true);
    expect(/BEFORE UPDATE OR DELETE ON gestion_journal/i.test(code)).toBe(true);
    expect(/BEFORE TRUNCATE ON gestion_journal/i.test(code)).toBe(true);
    expect(/restrict_violation/i.test(code)).toBe(true);
    const bloc = code.slice(code.indexOf('CREATE TABLE IF NOT EXISTS gestion_journal'), code.indexOf('gestion_journal_append_only'));
    expect(/REFERENCES/i.test(bloc)).toBe(false);
  });

  it('le droit d’accès suit le patron des perm_* : additif, défaut false, administrateurs cochés', () => {
    expect(/ALTER TABLE admin_utilisateur ADD COLUMN IF NOT EXISTS perm_gestion boolean NOT NULL DEFAULT false/i.test(code)).toBe(true);
  });
});
