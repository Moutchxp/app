/**
 * CLI `gestion:vidage:audit` — LOT DRIVE-3 : VÉRIFIER APRÈS COUP QUE CHAQUE EFFACEMENT ÉTAIT LÉGITIME.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CET AUDIT EXISTE, ALORS QUE LA COMMANDE DE VIDAGE VÉRIFIE DÉJÀ AVANT D'EFFACER. Parce que ce ne sont pas
 * les mêmes questions, et que la seconde ne peut être posée qu'APRÈS :
 *   · la commande demande « ai-je le droit d'effacer ceci ? » — et elle le demande une seconde avant d'agir ;
 *   · l'audit demande « ce que j'ai effacé est-il TOUJOURS lisible ailleurs ? » — et la réponse peut changer après.
 * Un fichier Drive mis à la corbeille, déplacé hors de la racine ou remplacé DEPUIS l'effacement rend la pièce
 * indisponible sans que rien ne l'annonce. C'est la seule façon de s'en apercevoir autrement que par un utilisateur
 * qui ne trouve pas son document.
 *
 * 🔒 LECTURE SEULE DE BOUT EN BOUT. Aucune écriture : ni base, ni Drive, ni MinIO. Que des `SELECT`, des lectures de
 * MÉTADONNÉES Drive (`files.get`, jamais le contenu) et des lectures de tête sur le stockage. « Documents clients
 * scannés » n'est pas approché : les identifiants viennent tous de `gestion_piece_vidage`, donc de nos propres copies.
 *
 * ⚠️ IL BORNE CE QU'IL AUDITE. `--apres=<ISO>` ne reprend que les effacements postérieurs à cet instant : après un lot
 * de 2 000 pièces, on ne relit pas les 20 000 précédentes. Sans borne, il audite tout.
 *
 * USAGE :
 *   npm run gestion:vidage:audit                                  # tout
 *   npm run gestion:vidage:audit -- --apres=2026-09-27T05:00:00Z   # le dernier lot seulement
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { jetonPourSubject } from '../lib/gestion/driveDelegue';
import { lireArbre } from '../lib/gestion/driveArbreRepo';
import { ascensionVersRacine, indexer, type NoeudArbre } from '../lib/gestion/driveGardeFou';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { lireConfigStockage } from '../lib/stockage/config';

const P = '[gestion:vidage:audit]';
/**
 * COMBIEN DE LECTURES DRIVE EN PARALLÈLE.
 *
 * 🔴 MESURÉ LE 27/09/2026 : en séquentiel, l'audit du premier lot a mis 45 MINUTES pour 1 571 pièces (1,7 s chacune).
 * À ce rythme, auditer les 26 000 pièces demandait une journée entière — et un audit qu'on n'a pas le temps de faire
 * est un audit qu'on finit par sauter. Huit lectures de front ramènent la même vérification à quelques minutes.
 *
 * ⚠️ HUIT, PAS CINQUANTE. Ce sont des lectures de métadonnées sur NOS fichiers, mais Google limite le débit : trop de
 * parallélisme fait apparaître des 429, qu'on prendrait pour des fichiers illisibles — donc pour de vraies anomalies.
 */
const FRONT = 8;
const COMPTE = 'gestion@criterimmo.fr';
/** Un jeton frais toutes les 30 minutes : il vaut une heure, et un audit long meurt sinon en route (défaut du 26/09). */
const MARGE_JETON_MS = 30 * 60_000;

interface Anomalie { pieceId: number; quoi: string; detail: string }

async function principal(): Promise<void> {
  const apres = process.argv.slice(2).find((a) => a.startsWith('--apres='))?.slice('--apres='.length) ?? null;

  const arbre = await lireArbre();
  if (arbre.etat !== 'ok') {
    console.error(`${P} ❌ L’arborescence Drive n’est pas mémorisée : impossible de vérifier la descendance.`);
    process.exitCode = 1;
    return;
  }
  const index = indexer([...arbre.data] as NoeudArbre[]);

  const { rows } = await query<{
    piece_id: string; drive_file_id: string; md5: string; taille_octets: string; cle_stockage: string;
  }>(
    `SELECT piece_id, drive_file_id, md5, taille_octets::text, cle_stockage
       FROM gestion_piece_vidage
      ${apres === null ? '' : 'WHERE vide_le > $1::timestamptz'}
      ORDER BY piece_id`, apres === null ? [] : [apres]);

  console.log(`\n${P} ── AUDIT DE ${rows.length} EFFACEMENT(S)`
    + `${apres === null ? ' (tous)' : ` postérieurs à ${apres}`} — lecture seule ──\n`);
  if (rows.length === 0) { console.log(`${P} rien à auditer.\n`); return; }

  let jeton = ''; let obtenuA = 0;
  const frais = async (): Promise<string> => {
    if (jeton !== '' && Date.now() - obtenuA < MARGE_JETON_MS) return jeton;
    const j = await jetonPourSubject(COMPTE, { fetch });
    if (!j.ok) throw new Error(`jeton Drive indisponible : ${j.motif}`);
    jeton = j.jeton; obtenuA = Date.now(); return jeton;
  };

  /**
   * LA PRÉSENCE D'UN OBJET, PAR UN `HEAD` — jamais par un téléchargement.
   *
   * ⚠️ `recuperer` RAPATRIE TOUT LE CONTENU : pour savoir si un objet existe, c'est payer la taille du fichier en
   * réseau et en mémoire. Un `HeadObject` ne rend que les en-têtes. Sur un audit de milliers de pièces, dont les
   * miniatures encore présentes, la différence est celle entre quelques secondes et plusieurs minutes.
   */
  const config = lireConfigStockage();
  if (config === null) {
    console.error(`${P} ❌ Le stockage n’est pas configuré : impossible de vérifier que les octets sont partis.`);
    process.exitCode = 1;
    return;
  }
  const s3 = new S3Client({
    endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const presente = async (cle: string): Promise<boolean> => {
    try { await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: cle })); return true; }
    catch { return false; }
  };

  let conformes = 0;
  const anomalies: Anomalie[] = [];

  /**
   * 🔴 UNE COUPURE RÉSEAU N'EST PAS UNE ANOMALIE DE DONNÉES — correctif du 27/09/2026. Le premier lot de vidage est
   * mort sur un `ECONNRESET` après 1 571 pièces. Un audit qui traverse des milliers d'allers-retours en rencontrera :
   * s'il s'arrêtait là, il faudrait le relancer à la main, et pire, une coupure ressemblerait à un fichier illisible
   * — donc à une vraie anomalie. On réessaie donc DEUX fois, avec une pause, et on ne conclut qu'après.
   *
   * ⚠️ TROIS TENTATIVES AU PLUS, JAMAIS UNE BOUCLE. Un audit qui insiste indéfiniment sur un réseau en panne ne rend
   * jamais son verdict, ce qui est la pire des réponses : on ne saurait pas s'il a vu un problème ou s'il attend.
   */
  const lireMetadonnees = async (driveFileId: string): Promise<Response | { erreur: string }> => {
    let dernier = '';
    for (let essai = 1; essai <= 3; essai += 1) {
      try {
        return await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`
          + '?fields=id,parents,trashed,md5Checksum,size&supportsAllDrives=true',
          { headers: { Authorization: `Bearer ${await frais()}` } });
      } catch (e) {
        dernier = e instanceof Error ? e.message : String(e);
        if (essai < 3) await new Promise((r) => setTimeout(r, 1000 * essai));
      }
    }
    return { erreur: dernier };
  };

  /** UNE pièce, vérifiée de bout en bout. Rend `null` si tout va bien, l'anomalie sinon. */
  const verifierUne = async (r: typeof rows[number]): Promise<Anomalie | null> => {
    const id = Number(r.piece_id);
    const res = await lireMetadonnees(r.drive_file_id);
    if (!(res instanceof Response)) return { pieceId: id, quoi: 'Drive INJOIGNABLE après 3 essais', detail: res.erreur };
    if (!res.ok) return { pieceId: id, quoi: 'copie Drive ILLISIBLE', detail: `HTTP ${res.status}` };
    const b = await res.json() as { parents?: string[]; trashed?: boolean; md5Checksum?: string; size?: string };

    if (b.trashed === true) return { pieceId: id, quoi: 'copie Drive À LA CORBEILLE', detail: '' };
    if (!(b.parents ?? []).some((p) => ascensionVersRacine(p, index) !== null)) {
      return {
        pieceId: id, quoi: 'copie Drive HORS de « Base de données locative »',
        detail: JSON.stringify(b.parents ?? []),
      };
    }
    if ((b.md5Checksum ?? '').toLowerCase() !== r.md5.toLowerCase()) {
      return { pieceId: id, quoi: 'EMPREINTE Drive différente de la preuve', detail: '' };
    }
    if (Number(b.size ?? -1) !== Number(r.taille_octets)) {
      return {
        pieceId: id, quoi: 'TAILLE Drive différente de la preuve',
        detail: `${b.size ?? '—'} ≠ ${r.taille_octets}`,
      };
    }
    // Et le contenu a-t-il VRAIMENT quitté MinIO ? Une clé encore là signifie que l'effacement n'a pas eu lieu.
    if (await presente(r.cle_stockage)) {
      return { pieceId: id, quoi: 'contenu ENCORE PRÉSENT dans MinIO', detail: '' };
    }
    return null;
  };

  // Par vagues de `FRONT` : même vérification, quelques minutes au lieu de quelques heures. Voir `FRONT`.
  for (let i = 0; i < rows.length; i += FRONT) {
    const vague = await Promise.all(rows.slice(i, i + FRONT).map(verifierUne));
    for (const v of vague) { if (v === null) conformes += 1; else anomalies.push(v); }
    if ((i / FRONT) % 25 === 0 && i > 0) {
      console.log(`${P}   ${i} / ${rows.length} vérifiées · ${anomalies.length} anomalie(s)`);
    }
  }

  // ── LES MINIATURES, sur TOUTES les pièces : elles ne doivent jamais être touchées ──
  const { rows: mini } = await query<{ piece_id: string; miniature_cle: string; videe: boolean }>(
    `SELECT p.id AS piece_id, p.miniature_cle,
            EXISTS (SELECT 1 FROM gestion_piece_vidage v WHERE v.piece_id = p.id) AS videe
       FROM gestion_piece p WHERE p.miniature_cle IS NOT NULL ORDER BY p.id`);
  const miniPerdues: number[] = [];
  for (const m of mini) {
    if (!(await presente(m.miniature_cle))) miniPerdues.push(Number(m.piece_id));
  }
  s3.destroy();

  console.log(`${P} ✅ conformes ................................. ${conformes} / ${rows.length}`);
  console.log(`${P} ${anomalies.length === 0 ? '✅' : '❌'} anomalies ................................. ${anomalies.length}`);
  for (const a of anomalies.slice(0, 20)) {
    console.log(`${P}    ❌ pièce ${a.pieceId} : ${a.quoi}${a.detail === '' ? '' : ` — ${a.detail}`}`);
  }
  console.log(`${P} ${miniPerdues.length === 0 ? '✅' : '❌'} miniatures intactes ....................... `
    + `${mini.length - miniPerdues.length} / ${mini.length}`
    + `${miniPerdues.length === 0 ? '' : ` — PERDUES : ${miniPerdues.join(', ')}`}`);

  if (anomalies.length > 0 || miniPerdues.length > 0) {
    console.log(`\n${P} 🔴 AUDIT EN ÉCHEC : le vidage ne doit pas continuer.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n${P} ✅ AUDIT PASSÉ : chaque pièce effacée est toujours lisible dans le Drive, à l’identique.\n`);
  }
}

void principal().then(closePool, async (e: unknown) => {
  console.error(e);
  process.exitCode = 1;
  await closePool();
});
