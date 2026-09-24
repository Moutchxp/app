/**
 * MODULE « GESTION » — CE QUE LE NAVIGATEUR A LE DROIT DE SAVOIR DE LA RECHERCHE. Module PUR : **aucun import**, donc
 * aucune base, aucun pilote `pg`, aucun module serveur. C'est ce qui le rend chargeable dans un composant client.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE — L'INCIDENT DU 24/09/2026.
 *
 * `BoiteMail.tsx` (composant CLIENT) importait `decouperTermes` depuis `rechercheBoite.ts`, qui contient AUSSI le SQL et
 * importe donc `db/client` → `pg` → `dns`. Le navigateur n'a pas de `dns` : webpack a refusé de construire la page, et
 * TOUTE l'application est tombée avec elle — y compris l'écran de connexion, qui n'a rien à voir avec la gestion.
 *
 * La règle qui en découle, et qui vaut pour tout le module : **ce dont le navigateur a besoin ne vit jamais dans le même
 * fichier que le SQL**. Les deux ont pourtant besoin de la MÊME normalisation d'accents — sans quoi « Marceau » se
 * chercherait d'un côté et pas de l'autre. Elle est donc ici, au seul endroit que les deux peuvent lire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * L'ensemble FERMÉ des accents français, et leur équivalent sans accent. `translate()` côté base et cette table côté
 * navigateur font le MÊME travail, caractère par caractère — c'est ce qui garantit qu'une recherche trouve la même
 * chose des deux côtés, et que les positions restent alignées quand l'écran met un mot en évidence.
 *
 * ⚠️ Ces deux chaînes doivent rester de MÊME LONGUEUR et se correspondre position par position.
 */
export const ACCENTS = 'àâäáãåÀÂÄÁÃÅéèêëÉÈÊËíìîïÍÌÎÏóòôöõÓÒÔÖÕúùûüÚÙÛÜçÇñÑýÿÝ';
export const SANS_ACCENT = 'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnNyyY';

/**
 * La normalisation, en TypeScript : minuscules et accents retirés. Remplace caractère par caractère, donc la chaîne
 * rendue a EXACTEMENT la même longueur que l'originale — c'est ce qui permet de chercher sur la version normalisée
 * tout en découpant l'originale aux mêmes positions. PUR.
 */
export function normaliser(s: string): string {
  let out = '';
  for (const c of s.toLowerCase()) {
    const i = ACCENTS.indexOf(c);
    out += i === -1 ? c : SANS_ACCENT[i];
  }
  return out;
}

/**
 * La MÊME normalisation, en SQL. `translate` + `lower` : aucune extension PostgreSQL, le même résultat partout, et —
 * c'est ce qui compte pour le lot 5c — des fonctions IMMUTABLE, donc INDEXABLES (`unaccent`, lui, ne l'est pas).
 * Fabrique une chaîne de SQL ; n'exécute rien et n'ouvre aucune connexion. PUR.
 */
export const normSql = (expr: string): string =>
  `translate(lower(coalesce(${expr}, '')), '${ACCENTS}', '${SANS_ACCENT}')`;

/** Un terme cherché : un mot, ou une expression entre guillemets. */
export interface Terme { texte: string; exact: boolean }

/** Bornes de sûreté : un mot d'une lettre ne filtre rien, et au-delà de 8 termes on ne cherche plus, on coûte. */
const MIN_LONGUEUR_TERME = 2;
const MAX_TERMES = 8;

/**
 * DÉCOUPE LA SAISIE en termes, comme le ferait une messagerie : ce qui est entre guillemets reste ensemble, le reste se
 * découpe aux espaces. Les termes sont NORMALISÉS, donc « Marceau », « marceau » et « MARCEAU » sont un seul et même mot.
 *
 * Sert des DEUX côtés de la frontière : au serveur pour le mode réduit, au navigateur pour mettre les mots trouvés en
 * évidence. Une seule définition, donc jamais deux façons de comprendre la même saisie. PUR.
 */
export function decouperTermes(saisie: string): Terme[] {
  const termes: Terme[] = [];
  // Les guillemets d'abord : ce qu'ils entourent ne se découpe pas.
  const reste = saisie.replace(/"([^"]*)"/g, (_, contenu: string) => {
    const t = normaliser(contenu).trim();
    if (t !== '') termes.push({ texte: t, exact: true });
    return ' ';
  });
  for (const mot of normaliser(reste).split(/\s+/)) {
    const t = mot.trim();
    if (t.length >= MIN_LONGUEUR_TERME) termes.push({ texte: t, exact: false });
  }
  return termes.slice(0, MAX_TERMES);
}

/** Ce qu'on cherche. Tous les champs sont facultatifs ; tout ce qui est fourni se COMBINE (ET). */
export interface CritereRecherche {
  /** La saisie, telle quelle. Les guillemets y font une expression exacte, comme dans une messagerie. */
  saisie: string;
  /** Bornes de période, en ISO (`AAAA-MM-JJ`). Incluses toutes les deux. */
  du?: string | null;
  au?: string | null;
  /** Fragment d'adresse ou de nom d'expéditeur. */
  expediteur?: string | null;
  /** Comme dans la liste : écarté par défaut, ramené sur demande. */
  inclureAutomatiques?: boolean;
}

/**
 * Y a-t-il quelque chose à chercher ? Une saisie vide ou d'un seul caractère ne lance aucune requête — c'est ce qui
 * évite qu'un champ effacé fasse balayer 56 000 messages. Jugé identiquement par l'écran et par la route. PUR.
 */
export function rechercheUtile(c: CritereRecherche): boolean {
  return decouperTermes(c.saisie).length > 0
    || (c.expediteur ?? '').trim() !== ''
    || (c.du ?? '') !== '' || (c.au ?? '') !== '';
}
