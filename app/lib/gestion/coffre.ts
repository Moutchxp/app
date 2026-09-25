/**
 * MODULE « GESTION » — LOT 5-PJ-C : LE COFFRE. Chiffrement au repos des jetons Google des collaborateurs.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CHIFFRER, ET POURQUOI ICI. Un jeton de rafraîchissement Google n'expire pas : il donne un accès complet
 * au Drive d'une personne, sans mot de passe, tant qu'elle ne le révoque pas. Stocké en clair, il fuit avec la
 * première copie de la base — une sauvegarde, un export, un dump partagé pour déboguer. Le chiffrer au repos fait
 * qu'une base volée ne suffit plus : il faut AUSSI la clé, qui vit dans `.env` et n'est jamais committée.
 *
 * AES-256-GCM, et non AES-CBC : GCM est AUTHENTIFIÉ. Un octet modifié en base fait ÉCHOUER le déchiffrement au lieu
 * de rendre silencieusement n'importe quoi — et « n'importe quoi » enverrait des requêtes avec un faux jeton sans
 * qu'on comprenne pourquoi.
 *
 * 🔴 CE QUI N'EST PAS FAIT ICI, ET C'EST ASSUMÉ : aucune rotation de clé. Changer `GESTION_JETON_CLE` rendra les
 * jetons existants illisibles — chaque collaborateur devra simplement recliquer sur « Connecter mon Google Drive ».
 * C'est une conséquence acceptable et RÉVERSIBLE ; une machinerie de rotation pour une poignée de comptes serait du
 * code à maintenir sans bénéfice. Le format porte un préfixe de version (`v1:`) pour que ce choix reste ouvert.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Le nom de la variable d'environnement qui porte la clé. Écrit une fois : une faute de frappe serait muette. */
export const VARIABLE_CLE = 'GESTION_JETON_CLE';

/** Préfixe de format. Sert à reconnaître un contenu chiffré par nous, et à laisser la porte ouverte à un `v2:`. */
const VERSION = 'v1';

/** Erreur du coffre. Distincte d'une panne de base : elle se répare dans `.env`, pas dans PostgreSQL. */
export class CoffreIndisponible extends Error {}

/**
 * La clé, lue depuis l'environnement. 32 octets, en hexadécimal (64 caractères) ou en base64.
 *
 * Rejette une clé de mauvaise taille AVEC la façon d'en fabriquer une : sans cette phrase, on cherche la commande
 * pendant dix minutes, et on finit par mettre n'importe quoi.
 */
export function lireCle(env: Record<string, string | undefined> = process.env): Buffer {
  const brut = (env[VARIABLE_CLE] ?? '').trim();
  if (brut === '') {
    throw new CoffreIndisponible(
      `${VARIABLE_CLE} manquante dans .env — sans elle, aucun jeton Google ne peut être conservé. `
      + `En fabriquer une : openssl rand -hex 32`);
  }
  const cle = /^[0-9a-fA-F]{64}$/.test(brut) ? Buffer.from(brut, 'hex') : Buffer.from(brut, 'base64');
  if (cle.length !== 32) {
    throw new CoffreIndisponible(
      `${VARIABLE_CLE} doit faire 32 octets (64 caractères hexadécimaux). En fabriquer une : openssl rand -hex 32`);
  }
  return cle;
}

/** Le coffre est-il utilisable ? Question posée AVANT d'offrir un bouton qui écrirait un jeton. */
export function coffreConfigure(env: Record<string, string | undefined> = process.env): boolean {
  try { lireCle(env); return true; } catch { return false; }
}

/**
 * CHIFFRE. Le format est `v1:<iv>:<étiquette>:<contenu>`, chaque partie en base64.
 *
 * ⚠️ UN VECTEUR D'INITIALISATION NEUF À CHAQUE FOIS (12 octets aléatoires). Le réutiliser avec la même clé casse
 * GCM complètement — ce n'est pas une précaution de style, c'est la condition de sa sécurité.
 */
export function chiffrer(clair: string, env: Record<string, string | undefined> = process.env): string {
  const cle = lireCle(env);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle, iv);
  const contenu = Buffer.concat([c.update(clair, 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64'), c.getAuthTag().toString('base64'), contenu.toString('base64')].join(':');
}

/**
 * DÉCHIFFRE. Toute altération — un octet changé, une étiquette qui ne correspond pas, un format inattendu — fait
 * ÉCHOUER plutôt que de rendre une valeur douteuse. Un jeton à moitié juste est pire qu'un jeton absent.
 */
export function dechiffrer(chiffre: string, env: Record<string, string | undefined> = process.env): string {
  const parts = (chiffre ?? '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new CoffreIndisponible('Jeton illisible : format inattendu (a-t-il été écrit par une autre version ?).');
  }
  const cle = lireCle(env);
  try {
    const d = createDecipheriv('aes-256-gcm', cle, Buffer.from(parts[1], 'base64'));
    d.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([d.update(Buffer.from(parts[3], 'base64')), d.final()]).toString('utf8');
  } catch {
    // La cause la plus probable, et de loin : la clé a changé. On le DIT, avec la sortie — recliquer sur
    //   « Connecter mon Google Drive » suffit, et c'est une information, pas un incident.
    throw new CoffreIndisponible(
      'Jeton illisible avec la clé actuelle : la clé a probablement changé. Chaque collaborateur doit relier son '
      + 'compte Google à nouveau (« Connecter mon Google Drive »).');
  }
}

/**
 * CE QU'ON DIT D'UN JETON SANS JAMAIS LE DIRE. Même règle que `masquerJeton` (lot 5-GOOGLE) : sa longueur suffit à
 * confirmer qu'il est là, et un jeton lu à l'écran finit dans un historique de terminal ou une capture. PUR.
 */
export function masquer(valeur: string | null | undefined): string {
  const v = (valeur ?? '').trim();
  return v === '' ? 'absent' : `présent (${v.length} caractères, non affiché)`;
}
