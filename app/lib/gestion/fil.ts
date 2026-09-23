/**
 * MODULE « GESTION » — LOT 3 : la CLÉ DE FIL. Module PUR (aucune I/O), donc recalculable à tout moment, hors ligne, sur un
 * export — c'est ce qui permettra de rejouer le regroupement si la règle évolue, sans retourner chercher les messages.
 *
 * Voie PURE, confirmée par la sonde : 175 réponses sur 177 portent des en-têtes de fil exploitables (99 %). L'identifiant
 * de fil natif de Gmail (X-GM-THRID) n'est donc pas nécessaire — et il aurait exigé de modifier `imap.ts`.
 *
 * DEUX NOTIONS DISTINCTES, à ne pas confondre :
 *   · les IDENTIFIANTS d'un message (le sien + ceux qu'il cite) → servent à RETROUVER le fil auquel il appartient ;
 *   · la CLÉ RACINE → sert à NOMMER un fil qu'on crée, et à ce que deux réponses à un même parent ABSENT de la boîte
 *     tombent d'elles-mêmes dans le même fil.
 */
import { normaliserMessageId } from '../veille/rapportRejet';

// ⚠️ `normaliserMessageId` est la SOURCE UNIQUE de la normalisation d'un Message-ID dans le dépôt (module PUR : aucune I/O,
//   aucun pg, aucun imapflow). Recopier la règle ici garantirait qu'elle diverge un jour.

/** Les en-têtes de fil d'un message, tels que l'adaptateur IMAP les rend. */
export interface EntetesFil {
  messageId: string;
  inReplyTo?: string | null;
  references?: readonly string[] | null;
}

/**
 * Tous les identifiants NORMALISÉS d'un message : le sien, son In-Reply-To, ses References. Dédupliqués, vides écartés.
 * C'est l'ensemble avec lequel on cherche un fil existant : si l'un d'eux est déjà connu, le message appartient à ce fil.
 * ORDRE CONSERVÉ (References est chronologique, du plus ancien au plus récent) — la racine en dépend. PUR.
 */
export function identifiantsMessage(e: EntetesFil): string[] {
  const bruts = [...(e.references ?? []), e.inReplyTo ?? '', e.messageId];
  return [...new Set(bruts.map((b) => normaliserMessageId(b ?? '')).filter((b) => b !== ''))];
}

/**
 * CLÉ RACINE d'un fil, quand il faut en créer un : le PLUS ANCIEN identifiant connu de la chaîne — la première entrée de
 * References, sinon l'In-Reply-To, sinon le Message-ID du message lui-même.
 *
 * POURQUOI LA RACINE ET PAS LE MESSAGE-ID : deux réponses à un même message qui, lui, n'est pas (encore) dans la boîte
 * citent toutes deux cette racine → elles tombent dans LE MÊME fil sans qu'on ait jamais vu le parent. Et si le parent
 * arrive plus tard, son propre Message-ID EST cette clé : il rejoint le fil au lieu d'en ouvrir un second.
 * Renvoie `''` si le message ne porte aucun identifiant exploitable (l'appelant lui donnera une clé de repli). PUR.
 */
export function cleRacine(e: EntetesFil): string {
  const refs = (e.references ?? []).map((r) => normaliserMessageId(r ?? '')).filter((r) => r !== '');
  if (refs.length > 0) return refs[0];
  const parent = normaliserMessageId(e.inReplyTo ?? '');
  if (parent !== '') return parent;
  return normaliserMessageId(e.messageId ?? '');
}

/**
 * Forme de COMPARAISON d'un identifiant : chevrons retirés, tout en minuscules. Utilisée des DEUX CÔTÉS de la recherche
 * de fil (les identifiants du message entrant, et ceux déjà en base) — donc jamais une casse d'un côté et pas de l'autre.
 *
 * ⚠️ Volontairement PLUS TOLÉRANTE que `normaliserMessageId` (qui ne minuscule que le domaine) : la RFC rend la partie
 * locale sensible à la casse, mais deux Message-ID qui ne différeraient que par elle n'existent pas en pratique, alors
 * qu'un serveur qui change la casse en route, lui, existe. Entre sur-fusionner (jamais vu) et sous-fusionner (vu), on
 * choisit la tolérance : deux moitiés d'un même échange sur deux lignes est le défaut qu'on veut éviter. PUR.
 */
export function pourComparaison(identifiant: string): string {
  return normaliserMessageId(identifiant ?? '').toLowerCase();
}

/** Clé de REPLI d'un message sans aucun identifiant : sa propre ligne, jamais fusionnée au hasard avec une autre. PUR. */
export function cleRepli(uid: number, recuLe: Date): string {
  return `sans-identifiant:${uid}:${recuLe.toISOString()}`;
}

/**
 * Décide la clé du fil d'un message : sa racine si elle existe, sinon une clé de repli qui n'appartiendra qu'à lui.
 * `uid` et `recuLe` ne servent QUE dans ce cas de repli. PUR.
 */
export function cleDuFil(e: EntetesFil, uid: number, recuLe: Date): string {
  const racine = cleRacine(e);
  return racine !== '' ? racine : cleRepli(uid, recuLe);
}
