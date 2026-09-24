/**
 * LOT 5-FUSION — L'ÉTAT DE L'ÉCRAN, ÉCRIT DANS L'ADRESSE. Module PUR : aucun import, aucune base, aucun React.
 *
 * 🔴 POURQUOI CE FICHIER EXISTE. Avant ce lot, l'écran de gestion n'avait aucune mémoire : recharger la page ramenait
 * au poste de tri, le bouton « Précédent » du navigateur quittait le module, et un écran ne pouvait pas s'envoyer par
 * message. Trois défauts qui n'en font qu'un : ce qu'on REGARDE n'était écrit nulle part. Il l'est maintenant dans
 * l'adresse — le seul endroit qu'un navigateur sait relire, garder dans son historique et copier.
 *
 * CE QU'ELLE PORTE : quel écran (partagé, boîte en plein écran, événements en plein écran), quelle étiquette est
 * choisie dans la boîte, et quel échange est ouvert. Rien d'autre : ni le texte d'une recherche en cours, ni le
 * dépliage d'un message — l'adresse dit OÙ l'on est, pas ce qu'on est en train de taper.
 *
 * 🔴 LECTURE TOLÉRANTE, ÉCRITURE STRICTE. Une adresse arrive d'un copier-coller, d'un signet vieux de six mois ou d'une
 * faute de frappe : une valeur inconnue ne doit JAMAIS faire écran blanc, elle retombe sur le défaut. À l'inverse, ce
 * qu'on écrit est toujours la forme canonique — sans quoi deux adresses différentes désigneraient le même écran et
 * l'historique du navigateur se remplirait de doublons.
 */

/** Les trois écrans du module. `partage` = l'écran à deux colonnes, qui reste le point d'entrée. */
export type Ecran = 'partage' | 'boite' | 'evenements';

/**
 * Les étiquettes de la boîte. `carte` est la seule à porter un identifiant : les autres sont des vues fixes.
 *
 * ⚠️ PAS D'ÉTIQUETTE « À TRAITER » : l'état par échange n'existe pas encore en base, et une étiquette qui ne
 * s'appuierait sur rien mentirait. Elle viendra avec le lot qui crée cet état.
 */
export type SorteEtiquette =
  | 'reception' | 'a_classer' | 'envoyes' | 'sans_suite' | 'automatique'
  /** LOT 5e — les messages commencés et pas envoyés. Ils ne vivent pas dans `gestion_message` : voir `PleinEcranBoite`. */
  | 'brouillons'
  | 'carte';

export interface Etiquette {
  sorte: SorteEtiquette;
  /** Renseigné UNIQUEMENT pour `carte`. Ailleurs `null` — une carte sans identifiant n'est pas une étiquette. */
  evenementId: number | null;
}

export interface EtatEcranUrl {
  ecran: Ecran;
  etiquette: Etiquette;
  /** Identifiant de l'échange ouvert, ou `null`. Vaut dans les trois écrans : on ouvre un échange de partout. */
  filOuvert: number | null;
}

/** L'étiquette d'arrivée quand on entre en plein écran depuis l'écran partagé : ce qu'il y a à faire aujourd'hui. */
export const ETIQUETTE_ARRIVEE: Etiquette = { sorte: 'a_classer', evenementId: null };
export const ETIQUETTE_RECEPTION: Etiquette = { sorte: 'reception', evenementId: null };

/** L'écran par défaut, celui d'une adresse nue : l'écran partagé, sans rien d'ouvert. */
export const ETAT_DEFAUT: EtatEcranUrl = { ecran: 'partage', etiquette: ETIQUETTE_ARRIVEE, filOuvert: null };

const ECRANS: readonly Ecran[] = ['partage', 'boite', 'evenements'];
const SORTES_FIXES: readonly SorteEtiquette[] = ['reception', 'a_classer', 'envoyes', 'sans_suite', 'automatique', 'brouillons'];

/** Deux étiquettes désignent-elles la MÊME chose ? Une carte ne se compare pas sans son identifiant. */
export function memeEtiquette(a: Etiquette, b: Etiquette): boolean {
  return a.sorte === b.sorte && a.evenementId === b.evenementId;
}

/**
 * Un identifiant lu dans une adresse. N'accepte QUE des chiffres, et refuse `0` : les identifiants de la base
 * commencent à 1, et accepter `0` ferait partir une requête dont on sait déjà qu'elle ne rendra rien.
 * `Number.MAX_SAFE_INTEGER` borne le haut — au-delà, un nombre JavaScript ne représente plus l'entier qu'on a lu.
 */
function identifiant(brut: string | null): number | null {
  if (brut === null || !/^[1-9]\d{0,15}$/.test(brut)) return null;
  const n = Number(brut);
  return Number.isSafeInteger(n) ? n : null;
}

/** L'étiquette portée par une adresse. Valeur inconnue ⇒ l'étiquette d'arrivée, jamais une erreur. */
export function etiquetteDepuisTexte(brut: string | null): Etiquette {
  if (brut === null) return ETIQUETTE_ARRIVEE;
  if ((SORTES_FIXES as readonly string[]).includes(brut)) return { sorte: brut as SorteEtiquette, evenementId: null };
  const m = /^carte-(\d+)$/.exec(brut);
  const id = m ? identifiant(m[1]) : null;
  return id === null ? ETIQUETTE_ARRIVEE : { sorte: 'carte', evenementId: id };
}

/** Comment une étiquette s'écrit dans l'adresse. Forme canonique, unique pour une étiquette donnée. */
export function texteEtiquette(e: Etiquette): string {
  return e.sorte === 'carte' ? `carte-${e.evenementId ?? 0}` : e.sorte;
}

/**
 * LIT l'état depuis la partie « ?… » d'une adresse. Accepte la chaîne avec ou sans son `?`, vide, ou absurde.
 * Ne jette JAMAIS : une adresse abîmée rend l'écran par défaut, elle ne casse pas la page.
 */
export function lireEtatUrl(recherche: string): EtatEcranUrl {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(recherche.startsWith('?') ? recherche.slice(1) : recherche);
  } catch {
    return ETAT_DEFAUT;
  }
  const brutEcran = p.get('ecran');
  const ecran: Ecran = (ECRANS as readonly string[]).includes(brutEcran ?? '') ? (brutEcran as Ecran) : 'partage';
  return { ecran, etiquette: etiquetteDepuisTexte(p.get('etiquette')), filOuvert: identifiant(p.get('fil')) };
}

/**
 * ÉCRIT l'état sous forme de « ?… ». Rend la chaîne VIDE pour l'écran par défaut : l'adresse nue du module doit
 * rester l'adresse nue du module, pas `?ecran=partage&etiquette=a_classer`.
 *
 * L'étiquette n'est écrite que dans l'écran de la boîte : ailleurs elle ne désigne rien, et la traîner mettrait dans
 * l'historique deux adresses distinctes pour un seul et même écran.
 */
export function ecrireEtatUrl(e: EtatEcranUrl): string {
  const p = new URLSearchParams();
  if (e.ecran !== 'partage') p.set('ecran', e.ecran);
  if (e.ecran === 'boite' && !memeEtiquette(e.etiquette, ETIQUETTE_ARRIVEE)) p.set('etiquette', texteEtiquette(e.etiquette));
  if (e.filOuvert !== null) p.set('fil', String(e.filOuvert));
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

/**
 * Le courrier automatique est-il IMPOSÉ par l'étiquette, et dans quel sens ? `null` = l'interrupteur décide.
 *
 * Deux étiquettes ne laissent pas le choix, et ce n'est pas un caprice d'écran : « À classer » EST le poste de tri,
 * qui n'a jamais montré de courrier automatique — l'y laisser entrer romprait la promesse « même règle, même
 * compteur » ; « Courrier automatique » ne montre QUE ça, et l'exclure la laisserait vide par construction.
 *
 * ⚠️ Cette fonction est PURE et vit ici, pas dans `boiteRepo` : l'écran doit pouvoir décider quoi afficher sans
 * atteindre le dépôt, qui tire `pg` — et donc `dns`, que le navigateur n'a pas (incident du 24/09/2026).
 */
export function autoImposeParEtiquette(e: Etiquette): boolean | null {
  if (e.sorte === 'a_classer' || e.sorte === 'brouillons') return false;
  if (e.sorte === 'automatique') return true;
  return null;
}

/** Deux états désignent-ils le même écran ? Sert à ne PAS empiler une entrée d'historique pour rien. */
export function memeEtat(a: EtatEcranUrl, b: EtatEcranUrl): boolean {
  return a.ecran === b.ecran && a.filOuvert === b.filOuvert
    && (a.ecran !== 'boite' || memeEtiquette(a.etiquette, b.etiquette));
}
