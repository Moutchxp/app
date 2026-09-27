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

/**
 * ══ LOT RECHERCHE-AVANCEE — LES LISTES OÙ L'ON CHERCHE ════════════════════════════════════════════════════════════
 * Les cinq mêmes que la colonne de gauche. Elles sont TOUTES cochées par défaut : une recherche qui oublierait
 * silencieusement une liste ferait conclure qu'un mail n'existe pas.
 *
 * ⚠️ CE N'EST PAS UN CHOIX EXCLUSIF mais un ENSEMBLE : on peut chercher dans « Réception + Envoyés » sans le courrier
 * automatique, ce qui est justement le réglage le plus utile au quotidien.
 */
export type SorteListe = 'reception' | 'envoyes' | 'automatique' | 'brouillons' | 'spam';
export const LISTES_TOUTES: readonly SorteListe[] =
  ['reception', 'envoyes', 'automatique', 'brouillons', 'spam'];

/** Le filtre « pièce jointe ». `indifferent` par défaut : on ne restreint que si on l'a demandé. */
export type FiltrePiece = 'indifferent' | 'avec' | 'sans';

/** Ce qu'on cherche. Tous les champs sont facultatifs ; tout ce qui est fourni se COMBINE (ET). */
export interface CritereRecherche {
  /** La saisie, telle quelle. Les guillemets y font une expression exacte, comme dans une messagerie. */
  saisie: string;
  /**
   * LOT RECHERCHE-AVANCEE — « NE CONTIENT PAS ». Les mots sont pris en OU : un mail est écarté dès qu'il contient
   * L'UN d'eux. C'est ce qu'on attend d'une exclusion — « sans facture ni relance » doit retirer les deux.
   */
  sansMots?: string | null;
  /** Bornes de période, en ISO (`AAAA-MM-JJ`). Incluses toutes les deux. */
  du?: string | null;
  au?: string | null;
  /** Fragment d'adresse ou de nom d'expéditeur. */
  expediteur?: string | null;
  /** LOT RECHERCHE-AVANCEE — avec / sans pièce jointe. Absent = indifférent. */
  piece?: FiltrePiece;
  /**
   * LOT RECHERCHE-AVANCEE — dans quelles listes chercher. ABSENT ≠ AUCUNE : absent veut dire « on ne s'est pas
   * prononcé », et le critère se comporte alors EXACTEMENT comme avant ce lot (cf. `automatiquesInclus`). C'est ce
   * qui laisse intacts tous les appels qui existaient.
   */
  listes?: readonly SorteListe[];
  /**
   * Comme dans la liste : écarté par défaut, ramené sur demande.
   *
   * ⚠️ N'EST PLUS LU DIRECTEMENT quand `listes` est fourni — `automatiquesInclus` tranche, et lui seul. Deux champs
   * qui disent le même fait finissent par se contredire ; celui-ci reste pour les appelants d'avant le lot.
   */
  inclureAutomatiques?: boolean;
}

/**
 * LES LISTES RETENUES. Absent ⇒ toutes : un critère qui ne dit rien cherche partout, jamais nulle part. PUR.
 */
export function listesChoisies(c: CritereRecherche): readonly SorteListe[] {
  return c.listes === undefined ? LISTES_TOUTES : c.listes;
}

/**
 * LE COURRIER AUTOMATIQUE EST-IL INCLUS ? UNE SEULE RÉPONSE, pour l'écran comme pour le SQL.
 *
 * 🔴 POURQUOI UNE FONCTION ET PAS DEUX CHAMPS. Le fait « on veut aussi l'automatique » s'écrivait `inclureAutomatiques`
 * ; le panneau avancé l'écrit maintenant par une case de `listes`. Deux écritures d'un même fait, c'est deux vérités
 * qui divergeront — ici, la case l'emporte dès qu'elle existe, et l'ancien champ sert quand elle n'existe pas. PUR.
 */
export function automatiquesInclus(c: CritereRecherche): boolean {
  if (c.listes !== undefined) return c.listes.includes('automatique');
  return c.inclureAutomatiques === true;
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

/**
 * 🔴 CE QUI NE SUFFIT PAS À LANCER UNE RECHERCHE, ET POURQUOI. « Ne contient pas », le filtre de pièce jointe et les
 * cases de listes sont des RESTRICTIONS : seuls, ils ne désignent rien, ils retranchent. Chercher « tout le courrier
 * sauf le mot facture » rendrait 50 000 résultats et coûterait un balayage complet pour une réponse que personne ne
 * lira. Ils n'entrent donc PAS dans `rechercheUtile` — ils affinent une recherche, ils ne la déclenchent pas.
 *
 * MAIS ILS DOIVENT SE VOIR quand ils sont posés : un filtre oublié qui cache des mails est exactement le défaut que
 * la pastille de l'engrenage signale. C'est à cela que sert cette fonction — dire qu'un réglage AUTRE que les mots
 * est actif, sans rien déclencher. PUR.
 */
export function filtresAvancesActifs(c: CritereRecherche): boolean {
  return decouperTermes(c.sansMots ?? '').length > 0
    || (c.expediteur ?? '').trim() !== ''
    || (c.du ?? '') !== '' || (c.au ?? '') !== ''
    || (c.piece !== undefined && c.piece !== 'indifferent')
    || listesChoisies(c).length !== LISTES_TOUTES.length;
}
