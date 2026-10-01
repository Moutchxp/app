/**
 * ⚠️ PAS D'`import 'server-only'` ICI, ET C'EST DÉLIBÉRÉ — comme dans `signatureImagesReel`, `envoiReel` et
 * `octetsPieceCablage`, ses voisins immédiats. Ce module est atteint par la RELÈVE CONTINUE
 * (`app/scripts/relever-gestion-continu.ts` → `travailleurEnvoiReel` → `envoiReel` → ici), qui tourne sous `tsx`,
 * hors bundle react-server : `server-only` y lève au chargement et tuerait le script. Le garde
 * `app/lib/garde/serverOnly.guard.test.ts` surveille exactement cette chaîne, et c'est lui qui l'a signalée.
 */
import { query } from '../db/client';
import { htmlDuMessage } from './carteRepo';
import { adressesDesImages, estDistante } from './imagesMail';
import { lireDataImage, mimeDuType, octetsDeLaCharge, TAILLE_IMAGE_MAX, typeImageSur } from './imagesIntegrees';
import { allerChercherImage } from './relaisImageReel';
import { lireOctetsDesPieces } from './octetsPiece';
import { depsOctetsPiece, lirePiecesALire } from './octetsPieceCablage';
import { cidCite, citeesParmi, nomCite, type ImageCitee } from './imagesCitees';

/**
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 0) — ALLER CHERCHER LES OCTETS DES IMAGES CITÉES ═══════════════
 *
 * Le JUMEAU de `signatureImagesReel`, pour les images du corps CITÉ. Le module pur (`imagesCitees`) dit lesquelles
 * sont les nôtres et comment les remplacer ; celui-ci va chercher leurs octets, chacun à sa source :
 *
 *   · `pieces/<id>`            → la pièce jointe, par le même chemin que l'envoi d'une pièce (MinIO, Drive, Gmail) ;
 *   · `messages/<id>/integree` → les octets d'une image `data:`, extraits de la colonne par expression régulière ;
 *   · `messages/<id>/image`    → l'image DISTANTE, que notre relais va chercher chez l'expéditeur.
 *
 * 🔴 CE QU'ON NE RAPPORTE PAS N'EST PAS UNE PANNE D'ENVOI. L'image est retirée du corps et le message part sans
 * elle — jamais avec un carré barré. C'est la consigne d'Arno pour la signature, et elle vaut ici mot pour mot.
 *
 * ⚠️ BORNÉ. Un corps cité peut appeler des dizaines d'images ; un message de plusieurs dizaines de mégaoctets
 * serait refusé par Gmail après avoir occupé la mémoire du serveur. On s'arrête donc à `IMAGES_MAX` images et à
 * `POIDS_MAX` au total, et on le DIT.
 */
export const IMAGES_MAX = 20;
export const POIDS_MAX = 20 * 1024 * 1024;

/** Les octets d'une image `data:` d'un message, extraits en base — jamais la colonne entière en mémoire. */
async function octetsIntegree(messageId: number, rang: number): Promise<{ type: string; octets: Buffer } | null> {
  const html = await htmlDuMessage(messageId);
  if (html === null) return null;
  const toutes = adressesDesImages(html);
  const src = toutes[rang];
  if (src === undefined) return null;
  const data = lireDataImage(src);
  if (data === null || !typeImageSur(data.type)) return null;
  // ⚠️ MÊME CONVERSION DE RANG QUE LA ROUTE : le rang compte TOUTES les images, l'extraction ne voit que les
  //   intégrées. Les confondre servirait une image pour une autre.
  const rangIntegree = toutes.slice(0, rang).filter((s) => lireDataImage(s) !== null).length;
  const { rows } = await query<{ type: string; charge: string }>(
    `SELECT m[1] AS type, m[2] AS charge
       FROM gestion_message g,
            LATERAL regexp_matches(g.corps_html,
              'data:image/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=[:space:]]+)', 'gi') AS m
      WHERE g.id = $1
      OFFSET $2 LIMIT 1`, [messageId, rangIntegree]);
  const brut = rows[0];
  if (brut === undefined || !typeImageSur(brut.type)) return null;
  const charge = brut.charge.replace(/\s+/g, '');
  if (charge === '' || octetsDeLaCharge(charge) > TAILLE_IMAGE_MAX) return null;
  const octets = Buffer.from(charge, 'base64');
  return octets.length === 0 ? null : { type: mimeDuType(brut.type), octets };
}

/** Les octets d'une image DISTANTE, par notre relais — avec ses verrous anti-SSRF, inchangés. */
async function octetsDistante(messageId: number, rang: number): Promise<{ type: string; octets: Buffer } | null> {
  const html = await htmlDuMessage(messageId);
  if (html === null) return null;
  const src = adressesDesImages(html)[rang];
  if (src === undefined || !estDistante(src)) return null;
  const r = await allerChercherImage(src);
  return r === null ? null : { type: r.type, octets: Buffer.from(r.corps) };
}

/** Les octets d'une pièce jointe, par le MÊME chemin que l'envoi d'une pièce — pas un second lecteur. */
async function octetsPieceJointe(pieceId: number): Promise<{ type: string; octets: Buffer } | null> {
  const brutes = await lirePiecesALire([pieceId]);
  const p = brutes.get(pieceId);
  if (p === undefined) return null;
  /**
   * ⚠️ `lireOctetsDesPieces` LÈVE quand une pièce est introuvable (règle « tout ou rien » de l'envoi de pièces).
   * Ici, une image manquante n'est PAS une raison de faire échouer l'envoi : l'appelant attrape, et la balise est
   * retirée du corps. On garde donc le même lecteur — une seule définition de « où sont les octets d'une pièce » —
   * avec une issue différente, qui est celle d'Arno pour les images.
   */
  const lues = await lireOctetsDesPieces([p], depsOctetsPiece());
  const l = lues[0];
  if (l === undefined || l.octets.length === 0) return null;
  // ⚠️ `PieceALire` NE PORTE PAS LE TYPE : il ne sert qu'à TROUVER les octets. On le lit donc à côté, et l'on
  //   retombe sur « image/jpeg » faute de mieux — une image sans type s'affiche mal chez certains clients.
  const { rows } = await query<{ t: string | null }>(
    'SELECT type_mime AS t FROM gestion_piece WHERE id = $1', [pieceId]);
  const t = (rows[0]?.t ?? '').trim();
  return { type: t.startsWith('image/') ? t : 'image/jpeg', octets: l.octets };
}

/**
 * ══ LES IMAGES CITÉES D'UN CORPS, PRÊTES À PARTIR ══════════════════════════════════════════════════════════════
 *
 * Rend une entrée par image EFFECTIVEMENT rapportée. Ce qui manque est dans `echecs` : `corpsCitePourEnvoi`
 * retirera ces balises, et le message partira sans elles.
 */
export async function imagesCiteesPourEnvoi(
  adresses: readonly string[], domaine: string, alea: string,
): Promise<{ images: ImageCitee[]; echecs: number[] }> {
  const images: ImageCitee[] = [];
  const echecs: number[] = [];
  let poids = 0;

  for (const c of citeesParmi(adresses)) {
    if (images.length >= IMAGES_MAX || poids >= POIDS_MAX) { echecs.push(c.indice); continue; }
    let r: { type: string; octets: Buffer } | null = null;
    try {
      if (c.quoi.sorte === 'piece') r = await octetsPieceJointe(c.quoi.pieceId);
      else if (c.quoi.sorte === 'integree') r = await octetsIntegree(c.quoi.messageId, c.quoi.rang);
      else r = await octetsDistante(c.quoi.messageId, c.quoi.rang);
    } catch {
      r = null;
    }
    if (r === null || r.octets.length === 0 || poids + r.octets.length > POIDS_MAX) {
      echecs.push(c.indice);
      continue;
    }
    poids += r.octets.length;
    images.push({
      indice: c.indice,
      cid: cidCite(c.indice, domaine, alea),
      nom: nomCite(c.indice, r.type),
      typeMime: r.type,
      octets: r.octets,
    });
  }
  return { images, echecs };
}
