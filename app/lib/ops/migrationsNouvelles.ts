/**
 * migrationsNouvelles.ts — quelles migrations une mise à jour de la prod doit appliquer, comment, et lesquelles elle refuse.
 *
 * Logique PURE (aucune base, aucun fichier) : on lui donne le contenu des fichiers `db/migrations/*.sql` et les lignes du
 * registre `svav_migration` (migration 358), elle rend le plan. Utilisée par l'amorçage du registre
 * (`scripts/migrations-amorcer.ts`) et par la mise à jour de la prod (lot 4).
 *
 * CE QU'ELLE DÉCIDE, POUR CHAQUE FICHIER :
 *  - le MODE d'exécution, lu dans le SQL réellement exécuté (commentaires et méta-commandes psql retirés) :
 *      · `enveloppee`          aucune instruction de transaction → l'outil l'enveloppe dans UNE transaction avec son
 *                              inscription au registre (tout ou rien) ;
 *      · `transaction-propre`  le fichier ouvre/ferme ses propres transactions (BEGIN/COMMIT, 289 fichiers sur 357 au
 *                              15/10/2026) → exécuté tel quel, inscription juste après, dans la même session psql ;
 *      · `sans-transaction`    CREATE INDEX CONCURRENTLY & co. → interdit dans une transaction, exécuté tel quel.
 *    ⚠️ Les 5 fichiers où figure le mot « CONCURRENTLY » au 15/10/2026 ne l'ont QU'EN COMMENTAIRE : aucun n'est
 *    `sans-transaction`. D'où l'analyse sur le SQL exécuté, jamais sur le texte brut.
 *  - les REFUS (la mise à jour ne part pas) :
 *      · toute instruction qui NOMME une des 4 tables LiDAR (mns_lidar_brut, mnt_lidar_brut, mns_bati_propre,
 *        rge_alti) — règle d'Arno « ne jamais toucher aux 4 tables LiDAR », appliquée sans nuance ; le nom est cherché
 *        en MOT ENTIER (`rattachement_marge_altitude_cm` contient « rge_alti » et n'est pas une table LiDAR) ;
 *      · DROP / TRUNCATE / ALTER … CASCADE (hors `ON DELETE|UPDATE CASCADE` d'une clé étrangère), DROP SCHEMA,
 *        DROP OWNED, DROP DATABASE, DROP EXTENSION ;
 *      · une instruction qui retire ou transforme des données (DROP TABLE / COLUMN / TYPE / SEQUENCE / MATERIALIZED
 *        VIEW, RENAME, ALTER COLUMN … TYPE, TRUNCATE, DELETE FROM) SANS l'en-tête `-- svav:irreversible` ;
 *      · CONCURRENTLY dans un fichier qui gère aussi ses transactions (cas à traiter à la main) ;
 *      · nom de fichier hors format `NNN_nom.sql`, numéro en double, migration nouvelle numérotée SOUS la dernière
 *        inscrite (elle aurait dû passer avant des migrations déjà appliquées).
 *  - l'en-tête `-- svav:irreversible` (ligne de commentaire, n'importe où) marque une migration que l'ancien code ne
 *    supporterait pas : la mise à jour demande alors une confirmation explicite et ne fait pas de retour arrière
 *    automatique du code.
 *
 * AVERTISSEMENTS (n'empêchent pas la mise à jour, s'affichent) : fichier déjà inscrit dont le contenu a changé depuis
 * (il ne sera jamais rejoué), fichier inscrit introuvable sur disque, migration « écartée » (jamais appliquée).
 */
import { createHash } from 'node:crypto';

export const TABLES_LIDAR = ['mns_lidar_brut', 'mnt_lidar_brut', 'mns_bati_propre', 'rge_alti'] as const;

export const EN_TETE_IRREVERSIBLE = 'svav:irreversible';

export type ModeExecution = 'enveloppee' | 'transaction-propre' | 'sans-transaction';

export interface FichierMigration {
  fichier: string; // nom seul, ex. « 357_admin_connexion_journal.sql »
  contenu: string;
}

export interface LigneRegistre {
  fichier: string;
  sha256: string;
  origine?: string; // « ecartee » = jamais appliquée, mise de côté à l'amorçage
}

export interface AnalyseMigration {
  fichier: string;
  numero: number | null; // null = nom hors format
  sha256: string;
  mode: ModeExecution;
  irreversible: boolean;
  refus: string[];
  tablesCreees: string[];
  tablesSupprimees: string[];
  colonnesAjoutees: { table: string; colonne: string }[];
}

export interface PlanMigrations {
  nouvelles: AnalyseMigration[]; // dans l'ordre d'application
  refus: string[]; // vide = la mise à jour peut appliquer `nouvelles`
  avertissements: string[];
}

const FORMAT_NOM = /^(\d{3,})_[a-z0-9_]+\.sql$/;

export function numeroMigration(fichier: string): number | null {
  const m = FORMAT_NOM.exec(fichier);
  return m ? Number(m[1]) : null;
}

export function empreinte(contenu: string): string {
  return createHash('sha256').update(contenu, 'utf8').digest('hex');
}

/**
 * Découpe un fichier SQL en instructions EXÉCUTÉES : commentaires (`--`, `/* *\/` imbriqués) et méta-commandes psql
 * (ligne commençant par `\`) retirés ; contenu des chaînes '…' vidé (un COMMENT ON qui cite une table n'est pas une
 * instruction qui la vise) ; corps entre dollars ($$…$$, $f$…$f$) CONSERVÉS (c'est du vrai SQL : fonctions, DO).
 * Le découpage sur « ; » ignore ceux des chaînes, identifiants entre guillemets et corps entre dollars.
 */
export function instructions(sql: string): string[] {
  const sortie: string[] = [];
  let cour = '';
  let i = 0;
  let debutLigne = true;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const suiv = sql[i + 1];
    if (debutLigne) {
      let j = i;
      while (j < n && (sql[j] === ' ' || sql[j] === '\t')) j++;
      if (sql[j] === '\\') {
        while (j < n && sql[j] !== '\n') j++;
        i = j;
        continue;
      }
    }
    debutLigne = false;
    if (c === '\n') {
      debutLigne = true;
      cour += c;
      i++;
    } else if (c === '-' && suiv === '-') {
      while (i < n && sql[i] !== '\n') i++;
    } else if (c === '/' && suiv === '*') {
      let prof = 1;
      i += 2;
      while (i < n && prof > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { prof++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { prof--; i += 2; }
        else i++;
      }
      cour += ' ';
    } else if (c === "'") {
      const echapBackslash = /[eE]$/.test(cour) && !/[a-zA-Z0-9_][eE]$/.test(cour);
      i++;
      while (i < n) {
        if (echapBackslash && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      cour += "''";
    } else if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"' && sql[j + 1] === '"') { j += 2; continue; }
        if (sql[j] === '"') { j++; break; }
        j++;
      }
      cour += sql.slice(i, j);
      i = j;
    } else if (c === '$' && !/[a-zA-Z0-9_]$/.test(cour)) {
      const m = /^\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i));
      if (!m) { cour += c; i++; continue; }
      const balise = m[0];
      const fin = sql.indexOf(balise, i + balise.length);
      const j = fin < 0 ? n : fin + balise.length;
      cour += sql.slice(i, j);
      i = j;
    } else if (c === ';') {
      if (cour.trim()) sortie.push(cour.trim());
      cour = '';
      i++;
    } else {
      cour += c;
      i++;
    }
  }
  if (cour.trim()) sortie.push(cour.trim());
  return sortie;
}

const RE_TRANSACTION = /^(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT)(\s+(WORK|TRANSACTION))?(\s+ISOLATION\s+LEVEL\s+[A-Z ]+)?$/i;
const RE_LIDAR = new RegExp(`\\b(${TABLES_LIDAR.join('|')})\\b`, 'i');
const RE_IDENT = '(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_$]*)';
const RE_NOM_QUALIFIE = `((?:${RE_IDENT}\\.)?${RE_IDENT})`;
const DESTRUCTIFS: [RegExp, string][] = [
  [/^DROP\s+(TABLE|MATERIALIZED\s+VIEW|TYPE|SEQUENCE)\b/i, 'DROP TABLE/TYPE/SEQUENCE/MATERIALIZED VIEW'],
  [/\bDROP\s+COLUMN\b/i, 'DROP COLUMN'],
  [/^ALTER\b[\s\S]*\bRENAME\b/i, 'RENAME'],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, 'ALTER COLUMN … TYPE'],
  [/^TRUNCATE\b/i, 'TRUNCATE'],
  [/^DELETE\s+FROM\b/i, 'DELETE FROM'],
];

function nomSimple(nom: string): string {
  const dernier = nom.split('.').pop() ?? nom;
  return dernier.replace(/^"|"$/g, '').toLowerCase();
}

function extrait(instr: string): string {
  const une = instr.replace(/\s+/g, ' ');
  return une.length > 90 ? `${une.slice(0, 87)}…` : une;
}

export function analyserMigration(f: FichierMigration): AnalyseMigration {
  const numero = numeroMigration(f.fichier);
  const irreversible = new RegExp(`^\\s*--\\s*${EN_TETE_IRREVERSIBLE}\\b`, 'im').test(f.contenu);
  const instrs = instructions(f.contenu);
  const refus: string[] = [];
  const tablesCreees: string[] = [];
  const tablesSupprimees: string[] = [];
  const colonnesAjoutees: { table: string; colonne: string }[] = [];
  let transactionPropre = false;
  let concurrently = false;

  if (numero === null) refus.push(`${f.fichier} : nom hors format « NNN_nom.sql »`);

  instrs.forEach((instr, k) => {
    const lieu = `${f.fichier}, instruction ${k + 1} « ${extrait(instr)} »`;
    if (RE_TRANSACTION.test(instr)) transactionPropre = true;
    if (/\bCONCURRENTLY\b/i.test(instr)) concurrently = true;
    if (RE_LIDAR.test(instr)) refus.push(`${lieu} : nomme une table LiDAR (${RE_LIDAR.exec(instr)?.[1]})`);
    const sansFk = instr.replace(/\bON\s+(DELETE|UPDATE)\s+CASCADE\b/gi, '');
    if (/^(DROP|TRUNCATE|ALTER)\b/i.test(instr) && /\bCASCADE\b/i.test(sansFk)) refus.push(`${lieu} : suppression en CASCADE`);
    if (/^DROP\s+(SCHEMA|OWNED|DATABASE|EXTENSION)\b/i.test(instr)) refus.push(`${lieu} : DROP SCHEMA/OWNED/DATABASE/EXTENSION interdit`);
    if (!irreversible) {
      for (const [re, quoi] of DESTRUCTIFS) {
        if (re.test(instr)) refus.push(`${lieu} : ${quoi} retire ou transforme des données — ajouter l'en-tête « -- ${EN_TETE_IRREVERSIBLE} » si c'est voulu`);
      }
    }
    const creee = new RegExp(`^CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${RE_NOM_QUALIFIE}`, 'i').exec(instr);
    if (creee && !/\bPARTITION\s+OF\b/i.test(instr)) tablesCreees.push(nomSimple(creee[1]));
    const supprimee = new RegExp(`^DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?([\\s\\S]+)$`, 'i').exec(instr);
    if (supprimee) {
      for (const nom of supprimee[1].replace(/\b(CASCADE|RESTRICT)\b/gi, '').split(',')) if (nom.trim()) tablesSupprimees.push(nomSimple(nom.trim()));
    }
    const alter = new RegExp(`^ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?${RE_NOM_QUALIFIE}`, 'i').exec(instr);
    if (alter) {
      const table = nomSimple(alter[1]);
      const re = new RegExp(`\\bADD\\s+COLUMN\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(${RE_IDENT})`, 'gi');
      for (const m of instr.matchAll(re)) colonnesAjoutees.push({ table, colonne: nomSimple(m[1]) });
    }
  });

  if (concurrently && transactionPropre) refus.push(`${f.fichier} : CONCURRENTLY dans un fichier qui gère ses propres transactions — à appliquer à la main`);
  const mode: ModeExecution = concurrently ? 'sans-transaction' : transactionPropre ? 'transaction-propre' : 'enveloppee';
  return { fichier: f.fichier, numero, sha256: empreinte(f.contenu), mode, irreversible, refus, tablesCreees, tablesSupprimees, colonnesAjoutees };
}

export function planifier(fichiers: FichierMigration[], registre: LigneRegistre[]): PlanMigrations {
  const analyses = fichiers.map(analyserMigration);
  const parNom = new Map(analyses.map((a) => [a.fichier, a]));
  const inscrits = new Map(registre.map((l) => [l.fichier, l.sha256]));
  const refus: string[] = [];
  const avertissements: string[] = [];

  for (const a of analyses) if (a.numero === null) refus.push(...a.refus);
  const parNumero = new Map<number, string[]>();
  for (const a of analyses) if (a.numero !== null) parNumero.set(a.numero, [...(parNumero.get(a.numero) ?? []), a.fichier]);
  for (const [num, noms] of parNumero) if (noms.length > 1) refus.push(`numéro ${num} en double : ${noms.join(', ')}`);

  for (const [fichier, sha] of inscrits) {
    const a = parNom.get(fichier);
    if (!a) avertissements.push(`${fichier} : inscrit au registre mais absent de db/migrations`);
    else if (a.sha256 !== sha) avertissements.push(`${fichier} : contenu modifié depuis son application (il ne sera pas rejoué)`);
  }
  for (const l of registre) if (l.origine === 'ecartee') avertissements.push(`${l.fichier} : écartée à l'amorçage, JAMAIS appliquée`);

  const maxInscrit = Math.max(0, ...registre.map((l) => numeroMigration(l.fichier) ?? 0));
  const nouvelles = analyses
    .filter((a) => a.numero !== null && !inscrits.has(a.fichier))
    .sort((x, y) => (x.numero as number) - (y.numero as number) || x.fichier.localeCompare(y.fichier));
  for (const a of nouvelles) {
    if ((a.numero as number) < maxInscrit) refus.push(`${a.fichier} : numérotée sous la dernière migration appliquée (${maxInscrit})`);
    refus.push(...a.refus);
  }
  return { nouvelles, refus, avertissements };
}
