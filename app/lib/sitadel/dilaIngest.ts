/**
 * I/O de l'ingestion de l'annuaire DILA (Base de données locales, service-public.gouv.fr — chantier S28).
 *
 * MOTIF Sitadel/PRADA : téléchargement vers un `.part` HORS DU DÉPÔT (répertoire temporaire système), CONTRÔLE D'INTÉGRITÉ
 * RÉEL de l'archive (`tar -tjf` : teste le flux bzip2 ET la structure tar), promotion atomique par `rename`, 3 essais,
 * TOUT-OU-RIEN (on jette plutôt qu'ingérer un partiel). Le JSON de ~259 Mo n'est JAMAIS chargé en entier : on l'extrait en
 * FLUX vers stdout (`tar -xjO`) et on le parse incrémentalement (`enregistrementsService`). Seules les mairies de NOTRE
 * PÉRIMÈTRE (~335) sont conservées ; le reste est ignoré à la volée. Insertion en UNE transaction. AUCUN ENVOI, AUCUNE
 * écriture dans mairie_contact (c'est S29).
 *
 * PILOTAGE SANS CODE : l'URL de téléchargement N'EST PAS en dur. Elle est lue depuis la variable d'environnement `DILA_URL`
 * (repli sur `DILA_URL_DEFAUT`). Le fichier daté restant la SEULE source de vérité (pas d'API), c'est le réglage d'infra
 * naturel. NB : aucune table de config existante ne peut porter une URL sans migration (config_veille est un singleton typé,
 * analytics_maintenance_config n'a qu'une `valeur` integer), et ce chantier n'ajoute AUCUNE migration ; la home durable,
 * éditable depuis l'admin, sera une colonne de config_veille ajoutée par le chantier « bouton d'admin » (migration dédiée).
 */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { query, withTransaction } from '../db/client';
import {
  enregistrementsService, estMairie, codesCommune, extraireContexte, rattacher,
  type DilaRecord,
} from './dilaJson';
import { chargerConfigVeille, DILA_URL_DEFAUT, type ConfigVeille } from './veilleConfig';

export { DILA_URL_DEFAUT };
const UA = 'sansvisavis-dila-ingest';
/** Paternité EXIGÉE par la Licence Ouverte v2.0 (identique au DEFAULT de dila_millesime.copyright). */
export const COPYRIGHT_DILA = 'Direction de l\'information légale et administrative (Premier ministre)';
/** Répertoire de travail HORS DU DÉPÔT (jamais committé). Surchargé par $DILA_DIR. */
const dossierTravail = (): string => (process.env.DILA_DIR?.trim() || join(tmpdir(), 'svav-dila'));

/**
 * PRÉCÉDENCE S30 de l'URL de téléchargement — la BASE FAIT FOI :
 *   1) `config_veille.dila_url` (base, éditable depuis l'admin) → autoritatif dès qu'il est renseigné (colonne NOT NULL) ;
 *   2) `$DILA_URL` (variable d'env) → SECOURS ops UNIQUEMENT si la base ne fournit pas de valeur (ex. table injoignable →
 *      repli `CONFIG_VEILLE_DEFAUT`), pour débloquer sans accès DB ;
 *   3) `DILA_URL_DEFAUT` → repli ultime.
 * On garde l'env comme filet de sécurité (jamais prioritaire) : en fonctionnement normal, la valeur d'Arno (base) gouverne.
 */
export function urlDila(config: Pick<ConfigVeille, 'dilaUrl'>): string {
  const base = (config.dilaUrl ?? '').trim();
  if (base !== '') return base;                              // la base fait foi
  return process.env.DILA_URL?.trim() || DILA_URL_DEFAUT;    // secours ops → repli ultime
}

export interface CompteursDila {
  code: string;                 // millésime (date du fichier, ex. '2026-08-03')
  fichierSource: string;        // nom EXACT du fichier daté (ex. '2026-08-03_053120-data.gouv_local.json')
  dateFichier: string;          // 'AAAA-MM-JJ'
  urlEffective: string;         // URL LONGUE après redirection
  tailleOctets: number;
  copyright: string;
  enregistrementsLus: number;   // total d'éléments service[] parcourus
  mairiesTrouvees: number;      // total de guichets de type mairie
  mairiesPerimetre: number;     // mairies tombant dans nos codes (candidates, déléguées incluses)
  lignesGardees: number;        // lignes réellement insérées (une par commune du périmètre)
  direct: number;
  desambigue01: number;
  ecarteesDeleguee: number;     // mairies DÉLÉGUÉES écartées par la règle -01 (commune EN périmètre) — non écrites en base
  ambigus: string[];
  manquants: string[];
  millesimeId: number;
}

/** Liste les membres de l'archive bzip2/tar — CONTRÔLE D'INTÉGRITÉ RÉEL (décompresse le flux + lit la structure tar). */
function listerArchive(chemin: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-tjf', chemin]);
    let out = '', err = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d: string) => { out += d; });
    p.stderr.on('data', (d) => { err += String(d); });
    p.on('error', reject);
    p.on('close', (code) => code === 0
      ? resolve(out.split('\n').map((l) => l.trim()).filter((l) => l !== ''))
      : reject(new Error(`intégrité archive DILA invalide (tar -tjf code ${code}) : ${err.trim()}`)));
  });
}

/** Nom du fichier annuaire dans l'archive + millésime (date) déduit de son préfixe. */
function membreAnnuaire(membres: string[]): { membre: string; code: string } {
  for (const m of membres) {
    const base = m.replace(/^\.\//, '');
    const mm = /(\d{4}-\d{2}-\d{2})_\d+-data\.gouv_local\.json$/.exec(base);
    if (mm) return { membre: base, code: mm[1] };
  }
  throw new Error('archive DILA : aucun fichier *-data.gouv_local.json trouvé (structure inattendue)');
}

/**
 * Télécharge l'archive vers `.part` HORS DÉPÔT, VÉRIFIE son intégrité (tar -tjf), promotion atomique par rename. 3 essais,
 * puis on jette. Retourne le chemin final, l'URL longue effective, la taille et la liste des membres (déjà validée).
 */
async function telecharger(url: string): Promise<{ chemin: string; urlEffective: string; tailleOctets: number; membres: string[] }> {
  const dossier = dossierTravail();
  await mkdir(dossier, { recursive: true });
  const chemin = join(dossier, 'dila_all_latest.tar.bz2');
  const part = `${chemin}.part`;
  const MAX_ESSAIS = 3;
  let urlEffective = url;
  for (let essai = 1; essai <= MAX_ESSAIS; essai++) {
    console.log(`  ↓ téléchargement archive DILA (essai ${essai}/${MAX_ESSAIS}) …`);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok || res.body === null) throw new Error(`archive DILA HTTP ${res.status} pour ${url}`);
    urlEffective = res.url || url;
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(part));
    try {
      const membres = await listerArchive(part);          // intégrité RÉELLE (bzip2 + tar), pas un contrôle de fin de ligne
      await rename(part, chemin);                          // promotion atomique
      const { size } = await stat(chemin);
      console.log(`  ✓ archive complète et intègre : ${chemin} (${size} octets)`);
      return { chemin, urlEffective, tailleOctets: size, membres };
    } catch (e) {
      console.warn(`  ⚠ archive INVALIDE (${(e as Error).message}) — nouvel essai`);
      await rm(part, { force: true });
    }
  }
  throw new Error(`archive DILA invalide/incomplète après ${MAX_ESSAIS} essais — import refusé (tout-ou-rien).`);
}

/** Extrait le membre en FLUX (stdout) et collecte les mairies du périmètre, sans jamais charger les 259 Mo en mémoire. */
async function collecterMairies(archive: string, membre: string, perimetre: Set<string>): Promise<{
  enregistrementsLus: number; mairiesTrouvees: number; mairiesPerimetre: number; parCode: Map<string, DilaRecord[]>;
}> {
  const p = spawn('tar', ['-xjOf', archive, membre]);
  let erreurProc: Error | null = null;
  p.on('error', (e) => { erreurProc = e; });
  p.stdout.setEncoding('utf8');
  const parCode = new Map<string, DilaRecord[]>();
  let enregistrementsLus = 0, mairiesTrouvees = 0, mairiesPerimetre = 0;
  for await (const rec of enregistrementsService(p.stdout as AsyncIterable<string>)) {
    enregistrementsLus++;
    if (!estMairie(rec)) continue;
    mairiesTrouvees++;
    const dansPerimetre = codesCommune(rec).filter((c) => perimetre.has(c));
    if (dansPerimetre.length === 0) continue;             // ignorée à la volée (volumétrie)
    mairiesPerimetre++;
    for (const c of dansPerimetre) {
      const l = parCode.get(c); if (l) l.push(rec); else parCode.set(c, [rec]);
    }
  }
  if (erreurProc !== null) throw erreurProc;
  if (enregistrementsLus === 0) throw new Error('extraction DILA : flux vide (échec tar/bzip2)');
  return { enregistrementsLus, mairiesTrouvees, mairiesPerimetre, parCode };
}

const SQL_MILLESIME =
  `INSERT INTO dila_millesime (code, fichier_source, date_fichier, url_telechargement, copyright, taille_octets, nb_enregistrements)
   VALUES ($1, $2, $3::date, $4, $5, $6, $7)
   ON CONFLICT (code) DO UPDATE SET
     fichier_source = EXCLUDED.fichier_source, date_fichier = EXCLUDED.date_fichier,
     url_telechargement = EXCLUDED.url_telechargement, copyright = EXCLUDED.copyright,
     taille_octets = EXCLUDED.taille_octets, nb_enregistrements = EXCLUDED.nb_enregistrements, importe_le = now()
   RETURNING id`;

const SQL_IMPORT =
  `INSERT INTO dila_import (millesime_id, id_dila, ancien_code_pivot, code_insee_commune, nom, categorie,
     telephone, courriel, site_internet, adresse_libelle, adresse_code_postal, adresse_commune, latitude, longitude,
     date_creation, date_modification, date_diffusion, donnee_brute, code_insee, rapprochement)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20)`;

/**
 * Point d'entrée. Télécharge (tout-ou-rien) → identifie le millésime ; si déjà importé et non forcé → 'rien_a_faire' SANS
 * re-parser ; sinon extrait en flux, rattache, et ré-écrit atomiquement les lignes de CE millésime (registre + brut).
 * IDEMPOTENCE : `dila_millesime.code` unique ; on remplace les `dila_import` de CE millésime (jamais un doublon) et on ne
 * touche PAS aux autres millésimes (historique conservé). Cleanup des gros fichiers en fin de run.
 */
export async function importerAnnuaireDila(opts: { forcer?: boolean } = {}): Promise<
  { statut: 'importe'; compteurs: CompteursDila } | { statut: 'rien_a_faire'; code: string }
> {
  const config = await chargerConfigVeille();                 // S30 : l'URL vient de la base (config_veille.dila_url)
  const { chemin, urlEffective, tailleOctets, membres } = await telecharger(urlDila(config));
  try {
    const { membre, code } = membreAnnuaire(membres);
    const fichierSource = membre.replace(/^\.\//, '');
    if (opts.forcer !== true) {
      const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM dila_millesime WHERE code = $1`, [code]);
      if ((rows[0]?.n ?? 0) > 0) return { statut: 'rien_a_faire', code };
    }
    // Périmètre = référentiel commune (lecture seule).
    const { rows: cr } = await query<{ code_insee: string }>(`SELECT code_insee FROM commune ORDER BY code_insee`);
    const codesPerimetre = cr.map((r) => r.code_insee);
    const perimetre = new Set(codesPerimetre);

    const { enregistrementsLus, mairiesTrouvees, mairiesPerimetre, parCode } = await collecterMairies(chemin, membre, perimetre);
    const rat = rattacher(parCode, codesPerimetre);

    // LICENCE (point 5) : registre complet, sinon l'import n'est PAS considéré réussi.
    if (fichierSource === '' || !/^\d{4}-\d{2}-\d{2}$/.test(code) || urlEffective === '' || tailleOctets <= 0 || rat.retenues.length === 0) {
      throw new Error('registre de licence incomplet (fichier/date/URL/taille/volume) — import refusé.');
    }

    const millesimeId = await withTransaction(async (q) => {
      const { rows } = await q<{ id: number }>(SQL_MILLESIME, [code, fichierSource, code, urlEffective, COPYRIGHT_DILA, tailleOctets, rat.retenues.length]);
      const id = rows[0].id;
      await q(`DELETE FROM dila_import WHERE millesime_id = $1`, [id]);   // remplace CE millésime, jamais les autres
      for (const ret of rat.retenues) {
        const x = extraireContexte(ret.rec);
        await q(SQL_IMPORT, [
          id, x.idDila, x.ancienCodePivot, x.codeInseeCommune, x.nom, x.categorie,
          x.telephone, x.courriel, x.siteInternet, x.adresseLibelle, x.adresseCodePostal, x.adresseCommune, x.latitude, x.longitude,
          x.dateCreation, x.dateModification, x.dateDiffusion, JSON.stringify(ret.rec), ret.codeInsee, ret.rapprochement,
        ]);
      }
      return id;
    });

    return {
      statut: 'importe',
      compteurs: {
        code, fichierSource, dateFichier: code, urlEffective, tailleOctets, copyright: COPYRIGHT_DILA,
        enregistrementsLus, mairiesTrouvees, mairiesPerimetre, lignesGardees: rat.retenues.length,
        direct: rat.direct, desambigue01: rat.desambigue01, ecarteesDeleguee: rat.ecarteesDeleguee,
        ambigus: rat.ambigus, manquants: rat.manquants, millesimeId,
      },
    };
  } finally {
    // Cleanup : les gros fichiers ne restent JAMAIS (hors dépôt de toute façon).
    if (existsSync(chemin)) await rm(chemin, { force: true });
  }
}
