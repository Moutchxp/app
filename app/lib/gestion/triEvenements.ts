/**
 * MODULE « GESTION » — LOT FILTRES-EVENEMENTS-NEW : DANS QUEL ORDRE LES CARTES D'ÉVÉNEMENT SE RANGENT. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026), mot pour mot :
 *
 *   « DEUX BOUTONS DE TRI en haut de la colonne et de l'écran Événements, à côté du compteur : “New” et “Urgent”.
 *     Un seul actif à la fois. “New” actif par défaut.
 *
 *     A. “New” actif :
 *        1) toutes les cartes “New”, de l'activité la plus RÉCENTE à la plus ancienne ;
 *        2) puis les autres par urgence : Urgent, puis Intermédiaire, puis Normal, puis sans niveau. Dans chaque
 *           niveau, du dernier échange le plus RÉCENT au plus ancien.
 *
 *     B. “Urgent” actif, groupes dans cet ordre : 1) Urgent ; 2) New (les “New” qui ne sont pas Urgent) ;
 *        3) Intermédiaire ; 4) Normal ; 5) sans niveau d'urgence.
 *        Un événement Urgent ET New va dans le groupe Urgent, et garde sa pastille New.
 *        Chaque événement n'apparaît qu'une seule fois.
 *        Dans CHAQUE groupe : du dernier échange le plus ANCIEN (en premier) au plus RÉCENT (en dernier).
 *
 *     Ce sont des TRIS : aucune carte n'est masquée, le compteur reste le nombre total d'événements. »
 *
 * ═══ 🔴🔴 POURQUOI CE FICHIER EXISTE À PART, ET PUR ═════════════════════════════════════════════════════════════════
 *
 * ARNO : « Mêmes règles sur l'écran partagé et sur l'écran Événements en plein écran. UNE SEULE SOURCE DE CALCUL,
 * partagée par les deux écrans. » Les deux listes sont rendues par le même composant depuis le lot
 * VIGNETTE-EVENEMENT (`cartesDe(partage)`) ; leur ORDRE doit l'être aussi, et par une fonction qu'on peut éprouver
 * sans monter un écran.
 *
 * ⚠️ AUCUN IMPORT, AUCUNE BASE, AUCUN React — comme `evenementQualite.ts`, et pour la même raison : ce module est lu
 * par un composant de NAVIGATEUR, et importer quoi que ce soit qui remonte jusqu'à `pg` ferait échouer la
 * construction de TOUTE l'application (incident du 24/09/2026, garde `clientBoundary.guard.test.ts`).
 *
 * ⚠️ LE TRI SE FAIT À L'ÉCRAN, ET NON EN SQL. C'est ce qui tient la dernière phrase d'Arno — « L'ordre se met à jour
 * sans rechargement quand un mail est lu ou quand l'urgence change » : l'écran a déjà les deux valeurs en main, il
 * reclasse au rendu suivant. Un `ORDER BY` aurait demandé un aller-retour au serveur pour chaque lecture de mail.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les deux tris possibles. Le mot est celui qui s'écrit dans l'adresse (`&tri=new|urgent`). */
export const TRIS_EVENEMENT = ['new', 'urgent'] as const;

export type TriEvenement = (typeof TRIS_EVENEMENT)[number];

/**
 * LE TRI PAR DÉFAUT, écrit une seule fois. ARNO : « “New” actif par défaut. »
 *
 * ⚠️ IL EST LU PAR L'ADRESSE ET PAR L'ÉCRAN : c'est la valeur qui ne s'écrit JAMAIS dans l'URL (un défaut écrit
 * dans l'adresse n'est plus un défaut), et celle sur laquelle une adresse abîmée retombe.
 */
export const TRI_DEFAUT: TriEvenement = 'new';

/** Le tri porté par une adresse, ou le défaut. PUR — une valeur inconnue ne casse jamais l'écran. */
export function triValide(brut: unknown): TriEvenement {
  return typeof brut === 'string' && (TRIS_EVENEMENT as readonly string[]).includes(brut)
    ? (brut as TriEvenement) : TRI_DEFAUT;
}

/** Le mot du bouton, tel qu'il s'affiche. Les mots d'Arno, et pas d'autres. */
export function motTri(t: TriEvenement): string {
  return t === 'urgent' ? 'Urgent' : 'New';
}

/**
 * CE QU'IL FAUT SAVOIR D'UN ÉVÉNEMENT POUR LE RANGER, et rien de plus.
 *
 * 🔴 UNE FORME MINIMALE, ET NON `CarteEvenement` : ce module ne doit pas dépendre du dépôt (il vit des deux côtés
 * de la frontière). Le type générique des fonctions ci-dessous accepte donc n'importe quel objet qui porte ces
 * trois champs — la vraie carte en porte bien davantage, et elle ressort telle quelle.
 */
export interface EvenementARanger {
  /**
   * Le niveau d'urgence enregistré (`normale` | `haute` | `urgent`), ou `null`/inconnu = aucun.
   * ⚠️ « AUCUN » N'EST PAS « normale » : c'est le cinquième groupe d'Arno, et le dernier.
   */
  urgence: string | null;
  /**
   * 🔴 LA DATE DE L'ACTIVITÉ « NEW » : « date du mail reçu non lu le plus récent de l'événement » (Arno).
   * `null` = l'événement n'est PAS « New ». C'est donc ce champ, et lui seul, qui porte le statut.
   */
  nouveauteLe: string | null;
  /**
   * 🔴 « DERNIER ÉCHANGE » : « date du mail le plus récent de l'événement (reçu ou envoyé), la même valeur que
   * celle affichée “dernier échange il y a N jours”. Événement sans aucun échange : date d'ouverture. » (Arno)
   * Le repli sur l'ouverture est fait par l'appelant (`dernierEchangeDe`), pour qu'il n'y ait qu'un endroit où
   * cette phrase soit écrite.
   */
  dernierEchangeLe: string | null;
  /** La date d'ouverture, qui sert de repli quand l'événement n'a aucun échange. */
  ouvertLe: string;
}

/** Un événement est-il « New » ? PUR. C'est la date d'activité qui le dit, et rien d'autre. */
export function estNouveau(e: Pick<EvenementARanger, 'nouveauteLe'>): boolean {
  return typeof e.nouveauteLe === 'string' && e.nouveauteLe !== '';
}

/**
 * LA DATE DE « DERNIER ÉCHANGE » D'UN ÉVÉNEMENT, avec le repli d'Arno. PUR.
 *
 * ⚠️ ÉCRITE ICI UNE SEULE FOIS : les deux tris s'en servent, et une seconde écriture du repli « sinon la date
 * d'ouverture » aurait fini par ranger les événements sans échange à deux endroits différents selon le bouton.
 */
export function dernierEchangeDe(e: Pick<EvenementARanger, 'dernierEchangeLe' | 'ouvertLe'>): string {
  const d = e.dernierEchangeLe;
  return typeof d === 'string' && d !== '' ? d : e.ouvertLe;
}

/**
 * ══ 🔴🔴 LE RANG D'UN NIVEAU D'URGENCE, ET POURQUOI IL EST ÉCRIT ICI ════════════════════════════════════════════
 *
 * Arno donne l'ordre en toutes lettres : « Urgent, puis Intermédiaire, puis Normal, puis sans niveau ». C'est
 * l'ordre DÉCROISSANT de gravité, et c'est l'INVERSE de l'ordre de déclaration de `NIVEAUX_URGENCE` (qui va du
 * plus calme au plus pressant, parce que c'est l'ordre d'un sélecteur).
 *
 * 🔴 ON NE DÉRIVE DONC PAS CE RANG DE `NIVEAUX_URGENCE` À L'ENVERS, et c'est délibéré : un niveau ajouté au milieu
 * du sélecteur se rangerait alors au milieu du tri sans que personne ne l'ait décidé. L'ordre d'AFFICHAGE d'un
 * choix et l'ordre de GRAVITÉ sont deux décisions, et elles se prennent séparément.
 *
 * ⚠️ UN NIVEAU INCONNU TOMBE AVEC « SANS NIVEAU », en dernier : une valeur qu'on ne sait pas classer ne doit pas
 * remonter en tête par accident. C'est le cas d'un `critique` resté dans une page ouverte avant la migration 319.
 */
const RANG_URGENCE: Record<string, number> = { urgent: 0, haute: 1, normale: 2 };

/** Le rang de gravité d'un niveau : 0 = le plus pressant, 3 = aucun niveau. PUR. */
export function rangUrgence(urgence: string | null | undefined): number {
  return typeof urgence === 'string' && urgence in RANG_URGENCE ? RANG_URGENCE[urgence] : 3;
}

/** Compare deux dates ISO, la plus RÉCENTE d'abord. Une date absente passe en dernier. */
function plusRecentDAbord(a: string, b: string): number {
  return a === b ? 0 : (a > b ? -1 : 1);
}

/** Compare deux dates ISO, la plus ANCIENNE d'abord. */
function plusAncienDAbord(a: string, b: string): number {
  return a === b ? 0 : (a < b ? -1 : 1);
}

/**
 * ══ 🔴🔴 TRI « NEW » (A) ════════════════════════════════════════════════════════════════════════════════════════
 *
 * « 1) toutes les cartes “New”, de l'activité la plus RÉCENTE à la plus ancienne ; 2) puis les autres par urgence :
 * Urgent, puis Intermédiaire, puis Normal, puis sans niveau. Dans chaque niveau, du dernier échange le plus RÉCENT
 * au plus ancien. »
 *
 * 🔴 LES « NEW » PASSENT TOUS DEVANT, QUELLE QUE SOIT LEUR URGENCE — c'est la lettre du point A, et c'est ce qui
 * distingue ce tri du second : ici, ce qui vient d'arriver prime ; là-bas, ce qui presse prime.
 */
export function trierParNouveaute<T extends EvenementARanger>(evenements: readonly T[]): T[] {
  return [...evenements].sort((a, b) => {
    const na = estNouveau(a);
    const nb = estNouveau(b);
    if (na !== nb) return na ? -1 : 1;
    /* ① LES « NEW » ENTRE EUX : l'activité la plus récente d'abord. `nouveauteLe` n'est jamais nul ici. */
    if (na && nb) return plusRecentDAbord(a.nouveauteLe as string, b.nouveauteLe as string);
    /* ② LES AUTRES : par gravité, puis le dernier échange le plus récent d'abord. */
    const r = rangUrgence(a.urgence) - rangUrgence(b.urgence);
    return r !== 0 ? r : plusRecentDAbord(dernierEchangeDe(a), dernierEchangeDe(b));
  });
}

/**
 * ══ 🔴🔴 TRI « URGENT » (B) ═════════════════════════════════════════════════════════════════════════════════════
 *
 * « 1) Urgent ; 2) New (les “New” qui ne sont pas Urgent) ; 3) Intermédiaire ; 4) Normal ; 5) sans niveau. Un
 * événement Urgent ET New va dans le groupe Urgent, et garde sa pastille New. Chaque événement n'apparaît qu'une
 * seule fois. Dans CHAQUE groupe : du dernier échange le plus ANCIEN (en premier) au plus RÉCENT (en dernier). »
 *
 * 🔴 LE GROUPE « NEW » S'INTERCALE ENTRE URGENT ET INTERMÉDIAIRE, et il prend donc des événements qui seraient
 * sinon tombés plus bas : un « New » sans niveau d'urgence passe devant un « Intermédiaire » qui n'a rien de neuf.
 * C'est exactement ce qu'Arno demande, et c'est la seule subtilité de ce tri.
 *
 * ⚠️ « CHAQUE ÉVÉNEMENT N'APPARAÎT QU'UNE SEULE FOIS » est garanti par construction, et non par un dédoublonnage :
 * `groupe()` rend UN rang par événement, et le tri ne fait que les ordonner. Construire cinq listes puis les
 * concaténer aurait ouvert la porte au doublon qu'Arno nomme — c'est précisément le piège qu'il signale.
 *
 * ⚠️ DU PLUS ANCIEN AU PLUS RÉCENT, et c'est l'INVERSE du tri « New ». Ce n'est pas une étourderie de la demande :
 * quand on trie par urgence, on travaille une pile — et l'on commence par ce qui attend depuis le plus longtemps.
 */
export function trierParUrgence<T extends EvenementARanger>(evenements: readonly T[]): T[] {
  /** Le rang du GROUPE d'Arno : 0 Urgent · 1 New · 2 Intermédiaire · 3 Normal · 4 sans niveau. PUR. */
  const groupe = (e: T): number => {
    if (rangUrgence(e.urgence) === 0) return 0;   // Urgent, New ou pas : il reste dans le groupe Urgent
    if (estNouveau(e)) return 1;                  // New, et pas Urgent
    return rangUrgence(e.urgence) + 1;            // haute → 2, normale → 3, aucun → 4
  };
  return [...evenements].sort((a, b) => {
    const g = groupe(a) - groupe(b);
    return g !== 0 ? g : plusAncienDAbord(dernierEchangeDe(a), dernierEchangeDe(b));
  });
}

/**
 * LE TRI DEMANDÉ, par son nom. PUR.
 *
 * 🔴 C'EST **LA** PORTE DES DEUX ÉCRANS : ni l'un ni l'autre ne choisit sa fonction de tri, ils passent le mot de
 * l'adresse. Deux appels directs à `trierParNouveaute` / `trierParUrgence` auraient fini par diverger le jour où
 * un troisième tri apparaît.
 */
export function trierEvenements<T extends EvenementARanger>(
  evenements: readonly T[], tri: TriEvenement,
): T[] {
  return tri === 'urgent' ? trierParUrgence(evenements) : trierParNouveaute(evenements);
}
