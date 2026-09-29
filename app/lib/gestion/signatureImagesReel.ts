import { estCompteAttendu, lireSignatures } from './google';
import { assainirHtml } from './htmlMail';
import { jetonAccesGestion } from './jetonAcces';
import { allerChercherImage } from './relaisImageReel';
import { adressesSignature, cidSignature, type ImageSignature } from './signatureImages';
import { estDistante } from './imagesMail';

/**
 * LOT ETOILE-ET-SIGNATURE — LA SIGNATURE GMAIL, ET SES IMAGES, CÔTÉ SERVEUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE MODULE EXISTE. Les images d'une signature Gmail sont hébergées chez Google
 * (`lh3/lh5.googleusercontent.com`). Mesuré le 29/09/2026 sur la signature de gestion@ :
 *
 *     depuis NOTRE SERVEUR, adresse nue   → 200  image/png   1 933 / 835 / 1 600 octets
 *     depuis notre serveur, AVEC le jeton → 403               (Google refuse une identité qu'il n'attend pas)
 *     depuis le NAVIGATEUR, dans la page  → image vide
 *
 * D'où les deux règles de ce fichier : on va les chercher DEPUIS LE SERVEUR, et SANS AUCUNE IDENTITÉ.
 *
 * ⚠️ LA SIGNATURE EST ASSAINIE À L'ENTRÉE, comme tout HTML venu d'ailleurs. Elle vient d'un réglage Gmail, donc
 * d'un formulaire que quelqu'un remplit : ce n'est pas parce que ce quelqu'un est nous qu'elle mérite moins de
 * précautions que le courrier reçu. Et c'est la MÊME fonction qu'à l'affichage : le rang désigne donc la même
 * image des deux côtés.
 *
 * ⚠️ LES OCTETS NE SONT PAS GARDÉS EN BASE. Trois images de 1 à 2 Ko, relues à chaque besoin : les stocker
 * demanderait de savoir quand la signature a changé — c'est-à-dire un second état à tenir d'accord avec Gmail,
 * pour économiser 4 Ko. Un cache MÉMOIRE court suffit, et il meurt avec le processus.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Le cache mémoire : la signature change une fois par an, et l'écran la redemande à chaque ouverture. */
const DUREE_CACHE_MS = 5 * 60 * 1000;
let cache: { le: number; html: string } | null = null;

/**
 * LA SIGNATURE HTML DE gestion@, ASSAINIE. `''` = pas de connexion Google, ou aucune signature réglée — et dans
 * les deux cas l'appelant doit se comporter comme avant ce lot, jamais inventer quelque chose.
 */
export async function signatureHtmlDeGestion(): Promise<string> {
  const maintenant = Date.now();
  if (cache !== null && maintenant - cache.le < DUREE_CACHE_MS) return cache.html;
  const jeton = await jetonAccesGestion();
  if (jeton.etat !== 'ok') return '';
  const sigs = await lireSignatures(jeton.jeton, { fetch });
  if (!sigs.ok) return '';
  const notre = sigs.valeur.find((s) => estCompteAttendu(s.adresse)) ?? sigs.valeur.find((s) => s.parDefaut);
  const html = assainirHtml(notre?.signature ?? '');
  cache = { le: maintenant, html };
  return html;
}

/** L'adresse DISTANTE de la Nᵉ image de la signature, ou `null`. Le rang est celui du document, comme partout. */
export async function adresseImageSignature(rang: number): Promise<string | null> {
  const html = await signatureHtmlDeGestion();
  if (html === '') return null;
  const src = adressesSignature(html)[rang];
  return src !== undefined && estDistante(src) ? src : null;
}

/**
 * ══ 🔴 LES IMAGES DE LA SIGNATURE, PRÊTES À PARTIR DANS LE MESSAGE ═══════════════════════════════════════════
 *
 * Rend une entrée par rang DEMANDÉ et effectivement rapporté. Un rang qu'on n'a pas su récupérer est simplement
 * ABSENT de la liste : `corpsPourEnvoi` lui retirera son `src`, et la signature partira sans cette image.
 *
 * 🔴 « JAMAIS UNE IMAGE CASSÉE » est la consigne d'Arno, et c'est la bonne : une image absente se remarque à
 * peine, un carré barré se remarque chez tous les destinataires — et fait douter du reste du message.
 *
 * ⚠️ LES RANGS DEMANDÉS VIENNENT DU CORPS QUI PART, pas de la signature : on ne va chercher que ce que le message
 * appelle réellement. Une personne qui efface le logo de sa signature dans l'éditeur ne doit pas faire voyager
 * 2 Ko pour rien.
 */
export async function imagesSignaturePourEnvoi(
  rangs: readonly number[], domaine: string, alea: string,
): Promise<{ images: ImageSignature[]; echecs: number[] }> {
  const images: ImageSignature[] = [];
  const echecs: number[] = [];
  const html = await signatureHtmlDeGestion();
  const adresses = html === '' ? [] : adressesSignature(html);
  for (const rang of [...new Set(rangs)].sort((a, b) => a - b)) {
    const src = adresses[rang];
    if (src === undefined || !estDistante(src)) { echecs.push(rang); continue; }
    let rapportee = null;
    try { rapportee = await allerChercherImage(src); } catch { rapportee = null; }
    if (rapportee === null) { echecs.push(rang); continue; }
    images.push({
      rang,
      cid: cidSignature(rang, domaine, alea),
      // Un nom lisible dans un client qui lister les parties : ni le nom Google, ni un identifiant opaque.
      nom: `signature-${rang + 1}.${(rapportee.type.split('/')[1] ?? 'png').replace(/[^a-z0-9]/gi, '')}`,
      typeMime: rapportee.type,
      octets: Buffer.from(rapportee.corps),
    });
  }
  return { images, echecs };
}

/** Pour les épreuves : vider le cache mémoire. N'a aucun effet en production, où le processus vit. */
export function oublierSignature(): void {
  cache = null;
}
