/**
 * CLI `gestion:pieces:rattraper-refusees` — LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 0.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE RÉPARE, ET POURQUOI ELLE EXISTE. Une pièce dont le type n'était pas dans la liste blanche de la
 * relève est tracée en base AVEC sa raison (`motif_non_stocke`), jamais perdue en silence — c'est la promesse
 * écrite dans `deposerPieceGestion` : « elle redeviendra déposable si la configuration change ». Cette commande
 * est le geste qui tient cette promesse.
 *
 * LE CAS D'ARNO (03/10/2026) : 37 pièces `.mov` (337 Mo) refusées, motif « type non autorisé pour la gestion :
 * “video/quicktime” ». Accord donné d'autoriser le type ; les octets, eux, n'ont jamais été gardés. Ils sont
 * encore dans Gmail, dans le message d'origine — c'est là qu'on va les chercher.
 *
 * ═══ 🔒 CE QU'ELLE S'INTERDIT ═════════════════════════════════════════════════════════════════════════════════════
 *   · AUCUNE ÉCRITURE GOOGLE. Gmail n'est que LU (`messages.get format=raw`), le Drive n'est pas touché du tout.
 *   · AUCUNE PIÈCE N'EST CRÉÉE NI SUPPRIMÉE. On ne fait que REMPLIR les colonnes de stockage d'une ligne qui
 *     existe déjà, et effacer son motif de refus. Le nom, le type, le message restent ceux de la relève.
 *   · AUCUNE PIÈCE QUI A DÉJÀ SES OCTETS N'EST TOUCHÉE (`stocke_le IS NULL` est dans la requête).
 *   · AUCUN TYPE N'EST FORCÉ : on ne reprend que les pièces dont le type est MAINTENANT dans la liste de
 *     `gestion_config`. Changer la config est une décision humaine ; cette commande ne fait que la rattraper.
 *
 * 🔴 SIMULATION PAR DÉFAUT. Sans `--appliquer`, rien n'est écrit : ni base, ni stockage. La commande LIT vraiment
 * les octets (c'est la seule façon de savoir ce qui marchera) et dit ce qu'elle ferait, pièce par pièce.
 *
 * 🔴 REPRENABLE SANS RATTRAPAGE. Elle ne prend que les pièces encore sans octets et inscrit au fur et à mesure :
 * une coupure ne perd que la pièce en cours, et la passe suivante repart d'elle-même.
 *
 * USAGE :
 *   npm run gestion:pieces:rattraper-refusees                      # simulation, tous les types désormais permis
 *   npm run gestion:pieces:rattraper-refusees -- --type=video/quicktime
 *   npm run gestion:pieces:rattraper-refusees -- --type=video/quicktime --appliquer
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createHash } from 'node:crypto';
import { query, closePool } from '../lib/db/client';
import { chargerConfigGestion } from '../lib/gestion/config';
import { lireOctetsPiece } from '../lib/gestion/octetsPiece';
import { depsOctetsPiece, lirePiecesALire } from '../lib/gestion/octetsPieceCablage';
import { deposerPieceGestion } from '../lib/stockage';
/**
 * ══ 🔴🔴 LE JETON GMAIL N'EST PAS LE JETON DRIVE, ET LA CONFUSION COÛTE UN 403 ═════════════════════════════════
 *
 * MESURÉ LE 03/10/2026 : la première version de cette commande demandait `jetonPourSubject` (délégation à
 * l'échelle du domaine, portée DRIVE) et Gmail répondait « HTTP 403 » sur les 37 pièces — lu dans la commande
 * comme « la pièce n'y a pas été retrouvée ». Avec le jeton OAuth de gestion@ (celui du lu/non lu et de l'envoi),
 * les 37 pièces sont retrouvées.
 *
 * 🔴 DEUX QUESTIONS, DEUX JETONS, et c'est écrit depuis le lot 5-BOITE-2 : le Drive agit au nom de l'adresse de
 * session, Gmail au nom du compte qui POSSÈDE la boîte. On emprunte donc exactement le chemin de l'envoi.
 */
import { lireIdentifiants, rafraichirJeton } from '../lib/gestion/google';
import { lireJeton } from '../lib/gestion/googleJeton';
import { pieceMd5Disponible } from '../lib/gestion/schema';
/**
 * 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 1 — LE REFUS DE SÉCURITÉ, NON CONFIGURABLE.
 *
 * La MÊME fonction que la porte de dépôt (`deposerPieceGestion` l'appelle aussi) : programmes, scripts et
 * signatures électroniques sont refusés, quel que soit le type annoncé. Ici elle sert DEUX fois : à dire en
 * simulation ce qui serait refusé, et à écrire le bon MOTIF sur les pièces qu'on ne récupérera jamais.
 */
import {
  estProgrammeParLeNom, estSignatureElectronique, typeCanonique, verdictPiece,
  MOTIF_PROGRAMME, MOTIF_SIGNATURE,
} from '../lib/gestion/pieceSecurite';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const P = '[pieces:rattraper-refusees]';

/**
 * ══ 🔴🔴 LE JOURNAL, DEMANDÉ PAR ARNO — « avec un journal (récupérées, refusées, échecs, et pourquoi) » ══════════
 *
 * Tout ce que la commande dit à l'écran est AUSSI écrit dans un fichier du Bureau. Deux sorties, une seule source :
 * un journal reconstitué à la fin aurait fini par ne plus dire ce que l'écran avait dit.
 */
const JOURNAL: string[] = [];
const dire = (ligne: string): void => { console.log(ligne); JOURNAL.push(ligne); };
function ecrireJournal(nom: string): void {
  const dest = join(homedir(), 'Desktop', nom);
  writeFileSync(dest, `${JOURNAL.join('\n')}\n`, 'utf8');
  console.log(`${P} journal → ${dest}`);
}
/** Un jeton Google vit une heure ; on le renouvelle bien avant, pour ne pas échouer au milieu d'un lot. */
const MARGE_JETON_MS = 45 * 60 * 1000;

const args = process.argv.slice(2);
const appliquer = args.includes('--appliquer');
const typeVoulu = (args.find((a) => a.startsWith('--type=')) ?? '').slice('--type='.length).trim().toLowerCase();
const plafond = Number((args.find((a) => a.startsWith('--plafond=')) ?? '--plafond=500').split('=')[1]);

interface Refusee {
  id: number;
  messageId: number;
  nomFichier: string;
  typeMime: string | null;
  taille: number | null;
  motif: string | null;
}

/** Les octets, en Mo, écrits comme le Finder les écrit. */
const mo = (n: number): string => `${(n / (1024 * 1024)).toFixed(1)} Mo`;

async function principal(): Promise<void> {
  const config = await chargerConfigGestion();
  const permis = config.typesPiecesAcceptes.map((t) => t.trim().toLowerCase());
  dire(`${P} types acceptés par la configuration : ${permis.join(', ')}`);
  if (typeVoulu !== '' && !permis.includes(typeVoulu)) {
    dire(`${P} ⛔ « ${typeVoulu} » n'est PAS dans la liste de « gestion_config ». Rien à faire : c'est la`
      + ' configuration qui autorise, jamais cette commande.');
    return;
  }

  /**
   * ══ 🔴🔴 PHASE ① — LES REFUS DE SÉCURITÉ, SANS ALLER CHERCHER UN SEUL OCTET ═════════════════════════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : une signature `pkcs7` affiche « Signature électronique du mail — pas un
   * document » ; un programme ou un script affiche « Programme non récupéré par sécurité — voir dans Gmail ».
   *
   * 🔴 CES PIÈCES-LÀ PORTENT AUJOURD'HUI LE MAUVAIS MOTIF (« type non autorisé pour la gestion : “…” »), et
   * l'écran ne peut donc pas dire la phrase d'Arno. On réécrit le motif — rien d'autre : aucune ligne créée,
   * aucune supprimée, aucun octet demandé à Gmail.
   *
   * ⚠️ ON NE JUGE ICI QUE SUR LE NOM ET LE TYPE, pas sur le contenu : il n'y a pas d'octets à lire pour une
   * pièce qu'on ne récupérera jamais, et aller les chercher chez Gmail pour les jeter aussitôt serait absurde.
   * Le contrôle sur les octets, lui, vit dans la porte de dépôt et joue à la phase ②.
   */
  const { rows: securite } = await query<{ id: string; nom_fichier: string; type_mime: string | null }>(
    `SELECT p.id::text, p.nom_fichier, p.type_mime
       FROM gestion_piece p WHERE p.stocke_le IS NULL ORDER BY p.id`);
  const aMarquer = securite
    .map((r) => ({
      id: Number(r.id),
      nom: r.nom_fichier,
      motif: estProgrammeParLeNom(r.nom_fichier) ? MOTIF_PROGRAMME
        : estSignatureElectronique({ nom: r.nom_fichier, typeMime: r.type_mime }) ? MOTIF_SIGNATURE : null,
    }))
    .filter((x): x is { id: number; nom: string; motif: string } => x.motif !== null);

  dire(`${P} ── phase ① refus de sécurité (nom et type seuls) ──────`);
  dire(`${P} ${aMarquer.length} pièce(s) à ne JAMAIS récupérer :`);
  for (const x of aMarquer) dire(`${P}   · ${x.id} « ${x.nom} » → ${x.motif}`);
  if (appliquer) {
    for (const x of aMarquer) {
      await query('UPDATE gestion_piece SET motif_non_stocke = $2 WHERE id = $1 AND stocke_le IS NULL',
        [x.id, x.motif]);
    }
    dire(`${P} motifs réécrits : ${aMarquer.length}`);
  }

  /**
   * ══ 🔴🔴 PHASE ② — LE RATTRAPAGE ═══════════════════════════════════════════════════════════════════════════
   *
   * 🔴 ON NE PREND QUE CE QUI EST ENCORE SANS OCTETS, et dont le type est MAINTENANT permis. Les deux conditions
   * comptent : la première rend la commande reprenable, la seconde interdit de rattraper ce que la configuration
   * refuse toujours.
   */
  const { rows } = await query<{
    id: string; message_id: string; nom_fichier: string; type_mime: string | null;
    taille_octets: string | null; motif_non_stocke: string | null;
  }>(
    `SELECT p.id::text, p.message_id::text, p.nom_fichier, p.type_mime, p.taille_octets::text, p.motif_non_stocke
       FROM gestion_piece p
      WHERE p.stocke_le IS NULL
        AND lower(split_part(coalesce(p.type_mime, ''), ';', 1)) = ANY($1::text[])
        ${typeVoulu === '' ? '' : "AND lower(split_part(coalesce(p.type_mime, ''), ';', 1)) = $3"}
      ORDER BY p.id
      LIMIT $2`,
    typeVoulu === '' ? [permis, plafond] : [permis, plafond, typeVoulu]);

  const refusees: Refusee[] = rows.map((r) => ({
    id: Number(r.id), messageId: Number(r.message_id), nomFichier: r.nom_fichier, typeMime: r.type_mime,
    taille: r.taille_octets === null ? null : Number(r.taille_octets), motif: r.motif_non_stocke,
  }));

  const poids = refusees.reduce((t: number, p: Refusee) => t + (p.taille ?? 0), 0);
  dire(`${P} ${refusees.length} pièce(s) à rattraper, ${mo(poids)} au total`);
  dire(`${P} ${appliquer ? '🔴 APPLICATION : la base et le stockage SERONT écrits' : 'SIMULATION : rien ne sera écrit'}`);
  if (refusees.length === 0) { dire(`${P} rien à faire.`); return; }

  let jeton = ''; let obtenuA = 0;
  const jetonGmail = async (): Promise<string | null> => {
    if (jeton !== '' && Date.now() - obtenuA < MARGE_JETON_MS) return jeton;
    const stocke = lireJeton();
    const ids = lireIdentifiants();
    if (stocke === null || ids === null) {
      dire(`${P} ⚠️ aucun jeton Gmail enregistré pour gestion@ : rien ne peut être relu.`);
      return null;
    }
    const j = await rafraichirJeton({ identifiants: ids, refreshToken: stocke.refreshToken }, { fetch });
    if (!j.ok) { dire(`${P} ⚠️ jeton Gmail indisponible : ${j.motif}`); return null; }
    jeton = j.valeur; obtenuA = Date.now(); return jeton;
  };
  const deps = depsOctetsPiece(jetonGmail);
  const avecMd5 = await pieceMd5Disponible();

  let lus = 0; let deposes = 0; let redresses = 0;
  const echecs: { id: number; nom: string; motif: string }[] = [];

  for (const p of refusees) {
    /* 🔴 LE LECTEUR CENTRAL : MinIO (vide ici), puis la copie Drive (il n'y en a pas), puis le message d'origine
       dans Gmail. On ne réécrit pas sa logique — on l'emploie. */
    const aLire = (await lirePiecesALire([p.id])).get(p.id) ?? {
      pieceId: p.id, nomFichier: p.nomFichier, cleStockage: null, stockageVide: false,
      driveFileId: null, md5Attendu: null, tailleAttendue: p.taille, messageIdRfc: null,
    };
    const lu = await lireOctetsPiece(aLire, deps);
    if (!lu.ok) {
      echecs.push({ id: p.id, nom: p.nomFichier, motif: lu.motif });
      dire(`${P}   ✗ ${p.id} « ${p.nomFichier} » — ${lu.motif}`);
      continue;
    }
    lus += 1;
    /**
     * 🔴🔴 LE VERDICT DE SÉCURITÉ, DIT MÊME EN SIMULATION. Sans cela, l'essai annoncerait « ✓ lus » sur un
     * exécutable que le dépôt refuserait trois lignes plus loin — et l'essai, qui sert justement à décider, ne
     * servirait à rien. C'est la MÊME fonction que la porte de dépôt.
     */
    const v = verdictPiece({ nom: p.nomFichier, typeMime: p.typeMime, octets: lu.octets });
    /**
     * 🔴 DEUX REDRESSEMENTS, ET DEUX MOTS DIFFÉRENTS. Le verdict peut retenir un autre type pour DEUX raisons, et
     * les confondre ferait mentir le journal :
     *   · le CONTENU dément un type vague (`application/octet-stream` sur un `.heic`) ;
     *   · le type est une ORTHOGRAPHE ancienne du même format (`image/x-png` → `image/png`).
     * Mesuré : la première passe disait « redressé sur le CONTENU » pour un synonyme, ce qui était faux.
     */
    const dit = v.garder
      ? (v.redresse
        ? ` → type redressé (${typeCanonique(p.typeMime) === v.typeRetenu ? 'ORTHOGRAPHE' : 'CONTENU'}) : `
          + `${p.typeMime ?? '(aucun)'} → ${v.typeRetenu}`
        : '')
      : ` → REFUSÉ : ${v.motif}`;
    dire(`${P}   ✓ ${p.id} « ${p.nomFichier} » — ${mo(lu.octets.byteLength)} lus depuis ${lu.source}${dit}`);
    if (v.garder && v.redresse) redresses += 1;
    if (!appliquer) continue;

    const res = await deposerPieceGestion(lu.octets, p.typeMime, {
      messageId: p.messageId,
      typesAcceptes: config.typesPiecesAcceptes,
      tailleMaxOctets: config.pieceTailleMaxOctets,
      /* 🔴🔴 POINT 1 — le NOM, pour que le refus de sécurité d'Arno s'applique ici EXACTEMENT comme à la relève. */
      nomFichier: p.nomFichier,
    });
    if (!res.depose) {
      echecs.push({ id: p.id, nom: p.nomFichier, motif: res.motif });
      dire(`${P}   ✗ ${p.id} dépôt refusé : ${res.motif}`);
      /* ⚠️ ON RÉÉCRIT LE MOTIF, pour qu'il dise la raison D'AUJOURD'HUI (la taille, par exemple) et non celle
         d'hier (le type) — sans quoi la prochaine passe reposerait la même question. */
      await query('UPDATE gestion_piece SET motif_non_stocke = $2 WHERE id = $1', [p.id, res.motif]);
      continue;
    }
    /**
     * 🔴 ON REMPLIT, ON NE RECRÉE PAS. La ligne existe depuis la relève : son nom, son type et son message ne
     * bougent pas. On ne pose que ce qui manquait — la clé, l'empreinte, la taille réelle, la date — et l'on
     * EFFACE le motif de refus, qui n'a plus d'objet.
     */
    /**
     * ══ 🔴🔴 LE TYPE REDRESSÉ S'INSCRIT AUSSI, ET IL LE FAUT ═════════════════════════════════════════════════
     *
     * ⚠️ DÉFAUT VU À L'ÉCRAN AU PREMIER ESSAI (04/10/2026) : la pièce 3112, « Rib Serrurerie Patito.heic »,
     * annoncée `application/octet-stream`, a été STOCKÉE sous `image/jpeg` (clé `…​.jpg`, bon Content-Type) — mais
     * sa ligne en base gardait `application/octet-stream`. L'écran lit la BASE : une photo parfaitement
     * affichable serait restée rangée parmi les « fichiers à ouvrir avec précaution ».
     *
     * 🔴 ON N'ÉCRIT LE TYPE QUE S'IL A ÉTÉ REDRESSÉ, et seulement depuis un type VAGUE vers un format que les
     * octets désignent sans ambiguïté (voir `typeReelSiVague`). Un type précis n'est jamais contredit.
     */
    const typeRedresse = v.garder && v.redresse ? v.typeRetenu : null;
    /**
     * ⚠️ LA LISTE SE CONSTRUIT, ET CHAQUE VALEUR REND SON NUMÉRO. Deux colonnes sont CONDITIONNELLES (`md5` selon
     * la migration 296, `type_mime` selon le redressement) : écrire les numéros à la main aurait lié une valeur
     * sans que la requête la nomme, et PostgreSQL refuse alors tout — « bind message supplies N parameters, but
     * prepared statement requires M ». C'est l'incident que le lot précédent a payé sur l'historique ; on ne le
     * repaie pas ici.
     */
    const params: unknown[] = [p.id, res.cle, res.empreinte, res.taille];
    const ajouter = (valeur: unknown): string => `$${params.push(valeur)}`;
    const colonnes = [
      ...(avecMd5 ? [`md5 = ${ajouter(createHash('md5').update(lu.octets).digest('hex'))}`] : []),
      ...(typeRedresse === null ? [] : [`type_mime = ${ajouter(typeRedresse)}`]),
    ];
    await query(
      `UPDATE gestion_piece
          SET cle_stockage = $2, empreinte_sha256 = $3, taille_octets = $4,
              stocke_le = now(), motif_non_stocke = NULL${colonnes.length === 0 ? '' : `, ${colonnes.join(', ')}`}
        WHERE id = $1 AND stocke_le IS NULL`, params);
    deposes += 1;
  }

  dire(`${P} ── bilan ──────────────────────────────────────────────`);
  dire(`${P} refus de sécurité (phase ①) : ${aMarquer.length}`);
  dire(`${P} octets retrouvés : ${lus} / ${refusees.length}`);
  dire(`${P} types redressés (contenu ou orthographe) : ${redresses}`);
  dire(`${P} ${appliquer ? `déposées et inscrites : ${deposes}` : '(simulation : aucun dépôt)'}`);
  if (echecs.length > 0) {
    dire(`${P} ${echecs.length} en échec :`);
    for (const e of echecs) dire(`${P}   · ${e.id} « ${e.nom} » — ${e.motif}`);
  }
}

principal()
  .catch((e) => { console.error(`${P} ⛔`, e); JOURNAL.push(`${P} ⛔ ${String(e)}`); process.exitCode = 1; })
  .finally(() => {
    /* 🔴 LE JOURNAL S'ÉCRIT MÊME EN CAS D'ERREUR : c'est précisément là qu'on en a besoin. Et son nom dit si la
       passe a écrit ou non — un journal de simulation ne doit pas se confondre avec un journal d'application. */
    const cible = typeVoulu === '' ? '' : `-${typeVoulu.replace(/[^a-z0-9]+/g, '-')}`;
    ecrireJournal(appliquer
      ? `journal-rattrapage-pieces${cible}-applique.txt`
      : `journal-rattrapage-pieces${cible}-simulation.txt`);
    void closePool();
  });
