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

const P = '[pieces:rattraper-refusees]';
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
  console.log(`${P} types acceptés par la configuration : ${permis.join(', ')}`);
  if (typeVoulu !== '' && !permis.includes(typeVoulu)) {
    console.log(`${P} ⛔ « ${typeVoulu} » n'est PAS dans la liste de « gestion_config ». Rien à faire : c'est la`
      + ' configuration qui autorise, jamais cette commande.');
    return;
  }

  /**
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
  console.log(`${P} ${refusees.length} pièce(s) à rattraper, ${mo(poids)} au total`);
  console.log(`${P} ${appliquer ? '🔴 APPLICATION : la base et le stockage SERONT écrits' : 'SIMULATION : rien ne sera écrit'}`);
  if (refusees.length === 0) { console.log(`${P} rien à faire.`); return; }

  let jeton = ''; let obtenuA = 0;
  const jetonGmail = async (): Promise<string | null> => {
    if (jeton !== '' && Date.now() - obtenuA < MARGE_JETON_MS) return jeton;
    const stocke = lireJeton();
    const ids = lireIdentifiants();
    if (stocke === null || ids === null) {
      console.log(`${P} ⚠️ aucun jeton Gmail enregistré pour gestion@ : rien ne peut être relu.`);
      return null;
    }
    const j = await rafraichirJeton({ identifiants: ids, refreshToken: stocke.refreshToken }, { fetch });
    if (!j.ok) { console.log(`${P} ⚠️ jeton Gmail indisponible : ${j.motif}`); return null; }
    jeton = j.valeur; obtenuA = Date.now(); return jeton;
  };
  const deps = depsOctetsPiece(jetonGmail);
  const avecMd5 = await pieceMd5Disponible();

  let lus = 0; let deposes = 0; const echecs: { id: number; nom: string; motif: string }[] = [];

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
      console.log(`${P}   ✗ ${p.id} « ${p.nomFichier} » — ${lu.motif}`);
      continue;
    }
    lus += 1;
    console.log(`${P}   ✓ ${p.id} « ${p.nomFichier} » — ${mo(lu.octets.byteLength)} lus depuis ${lu.source}`);
    if (!appliquer) continue;

    const res = await deposerPieceGestion(lu.octets, p.typeMime, {
      messageId: p.messageId,
      typesAcceptes: config.typesPiecesAcceptes,
      tailleMaxOctets: config.pieceTailleMaxOctets,
    });
    if (!res.depose) {
      echecs.push({ id: p.id, nom: p.nomFichier, motif: res.motif });
      console.log(`${P}   ✗ ${p.id} dépôt refusé : ${res.motif}`);
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
    await query(
      `UPDATE gestion_piece
          SET cle_stockage = $2, empreinte_sha256 = $3, taille_octets = $4,
              stocke_le = now(), motif_non_stocke = NULL
              ${avecMd5 ? ', md5 = $5' : ''}
        WHERE id = $1 AND stocke_le IS NULL`,
      avecMd5
        ? [p.id, res.cle, res.empreinte, res.taille, createHash('md5').update(lu.octets).digest('hex')]
        : [p.id, res.cle, res.empreinte, res.taille]);
    deposes += 1;
  }

  console.log(`${P} ── bilan ──────────────────────────────────────────────`);
  console.log(`${P} octets retrouvés : ${lus} / ${refusees.length}`);
  console.log(`${P} ${appliquer ? `déposées et inscrites : ${deposes}` : '(simulation : aucun dépôt)'}`);
  if (echecs.length > 0) {
    console.log(`${P} ${echecs.length} en échec :`);
    for (const e of echecs) console.log(`${P}   · ${e.id} « ${e.nom} » — ${e.motif}`);
  }
}

principal()
  .catch((e) => { console.error(`${P} ⛔`, e); process.exitCode = 1; })
  .finally(() => void closePool());
