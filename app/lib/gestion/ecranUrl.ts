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

/**
 * LES ÉCRANS DU MODULE. `partage` = l'écran à deux colonnes, qui reste le point d'entrée. Chaque lot en a AJOUTÉ un ;
 * aucun n'en a jamais remplacé ni modifié un autre, et chacun se referme sur l'écran partagé.
 *
 *   · `partage`, `boite`, `evenements` — lot 5-FUSION ;
 *   · `annuaire`   — lot ANNUAIRE-1, atteint par son propre bouton ;
 *   · `a_trier`    — lot RATTACHEMENT-1 : les mails sans rattachement certain ;
 *   · `historique` — lot RATTACHEMENT-2 : tout ce qui s'est dit à propos d'une cible.
 *
 * ⚠️ NE PAS CONFONDRE `a_trier` AVEC L'ÉTIQUETTE `a_classer` DE LA BOÎTE. « À classer » = quels ÉCHANGES restent à
 * poser sur une carte (flux de travail). « À trier » = quels MAILS n'ont pas de rattachement certain à un logement
 * (archivage). Deux questions différentes, deux écrans — c'est pour cela qu'on n'a pas ajouté une étiquette de plus.
 *
 * ⚠️ `historique` PORTE UNE CIBLE (`&cible=lot-282`), sans laquelle il ne désigne rien : une adresse
 * `?ecran=historique` nue rend un écran sans cible, que la vue traite comme toute valeur illisible.
 */
export type Ecran = 'partage' | 'boite' | 'evenements' | 'annuaire' | 'a_trier' | 'historique';

/**
 * Les étiquettes de la boîte. `carte` est la seule à porter un identifiant : les autres sont des vues fixes.
 *
 * ⚠️ PAS D'ÉTIQUETTE « À TRAITER » : l'état par échange n'existe pas encore en base, et une étiquette qui ne
 * s'appuierait sur rien mentirait. Elle viendra avec le lot qui crée cet état.
 */
export type SorteEtiquette =
  | 'reception' | 'a_classer' | 'envoyes' | 'sans_suite' | 'automatique' | 'corbeille'
  /** LOT 5e — les messages commencés et pas envoyés. Ils ne vivent pas dans `gestion_message` : voir `PleinEcranBoite`. */
  | 'brouillons'
  | 'carte';

export interface Etiquette {
  sorte: SorteEtiquette;
  /** Renseigné UNIQUEMENT pour `carte`. Ailleurs `null` — une carte sans identifiant n'est pas une étiquette. */
  evenementId: number | null;
}

/**
 * LOT ANNUAIRE-1 — la fiche ouverte dans l'annuaire. Elle vit dans l'ADRESSE, comme l'échange ouvert et pour les
 * mêmes raisons : recharger doit ramener la fiche qu'on lisait, « Précédent » doit revenir à la précédente, et une
 * fiche doit pouvoir s'envoyer par message à un collègue.
 *
 * ⚠️ LE TEXTE TAPÉ DANS LA RECHERCHE, LUI, N'Y EST PAS — c'est la règle du fichier : l'adresse dit OÙ l'on est, pas
 * ce qu'on est en train de taper.
 */
export type SorteFiche = 'proprietaire' | 'lot' | 'locataire';
export interface FicheUrl { sorte: SorteFiche; id: number }

export interface EtatEcranUrl {
  ecran: Ecran;
  etiquette: Etiquette;
  /** Identifiant de l'échange ouvert, ou `null`. Vaut dans les trois écrans : on ouvre un échange de partout. */
  filOuvert: number | null;
  /**
   * LOT ANNUAIRE-1 — la fiche ouverte. `null` ailleurs que dans l'annuaire, et dans l'annuaire sans fiche ouverte.
   *
   * ⚠️ FACULTATIVE À L'ÉCRITURE, TOUJOURS RENSEIGNÉE À LA LECTURE. Une trentaine d'appels construisent déjà un état
   * à la main (`{ ecran: 'boite', etiquette, filOuvert: null }`) : les obliger tous à écrire `fiche: null` pour un
   * écran qui n'a pas de fiche serait du bruit, et chaque oubli deviendrait une erreur de compilation dans du code
   * qui n'a rien à voir avec l'annuaire.
   */
  fiche?: FicheUrl | null;
  /**
   * LOT RATTACHEMENT-2 — la cible de l'historique, écrite `lot-282` / `proprio-339` / `carte-12`. `null` ailleurs que
   * dans l'écran `historique`.
   *
   * ⚠️ FACULTATIVE À L'ÉCRITURE, comme `fiche`, et pour la même raison : une trentaine d'appels construisent déjà un
   * état à la main, et les obliger tous à écrire `cible: null` pour un écran qui n'en a pas serait du bruit — chaque
   * oubli devenant une erreur de compilation dans du code sans rapport.
   *
   * ⚠️ TYPÉE `string | null` ET NON `Cible` : `ecranUrl` est un module PUR sans aucun import, c'est sa garantie depuis
   * le lot 5-FUSION. La lecture de la cible vit dans `historique.ts` (`cibleDepuisTexte`), qui en est le seul juge.
   */
  cible?: string | null;
}

const SORTES_FICHE: readonly SorteFiche[] = ['proprietaire', 'lot', 'locataire'];

/** La fiche portée par une adresse (« lot-12 »). Valeur inconnue ⇒ aucune fiche, jamais une erreur. */
export function ficheDepuisTexte(brut: string | null): FicheUrl | null {
  if (brut === null) return null;
  const m = /^([a-z]+)-(\d+)$/.exec(brut);
  if (m === null || !(SORTES_FICHE as readonly string[]).includes(m[1])) return null;
  const id = identifiant(m[2]);
  return id === null ? null : { sorte: m[1] as SorteFiche, id };
}

/** Comment une fiche s'écrit dans l'adresse. Forme canonique, unique pour une fiche donnée. */
export function texteFiche(f: FicheUrl): string {
  return `${f.sorte}-${f.id}`;
}

/** L'étiquette d'arrivée quand on entre en plein écran depuis l'écran partagé : ce qu'il y a à faire aujourd'hui. */
export const ETIQUETTE_ARRIVEE: Etiquette = { sorte: 'a_classer', evenementId: null };
export const ETIQUETTE_RECEPTION: Etiquette = { sorte: 'reception', evenementId: null };

/** L'écran par défaut, celui d'une adresse nue : l'écran partagé, sans rien d'ouvert. */
export const ETAT_DEFAUT: EtatEcranUrl = {
  ecran: 'partage', etiquette: ETIQUETTE_ARRIVEE, filOuvert: null, fiche: null, cible: null,
};

const ECRANS: readonly Ecran[] = ['partage', 'boite', 'evenements', 'annuaire', 'a_trier', 'historique'];
const SORTES_FIXES: readonly SorteEtiquette[] = [
  'reception', 'a_classer', 'envoyes', 'sans_suite', 'automatique', 'brouillons',
  // LOT 5-BOITE-3 — la corbeille est une étiquette comme les autres : elle vit dans l'adresse, donc elle se
  //   recharge, se copie et se retrouve par « Précédent ».
  'corbeille',
];

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
  return {
    ecran,
    etiquette: etiquetteDepuisTexte(p.get('etiquette')),
    filOuvert: identifiant(p.get('fil')),
    // La fiche ne désigne quelque chose QUE dans l'annuaire : la lire ailleurs traînerait un paramètre mort.
    fiche: ecran === 'annuaire' ? ficheDepuisTexte(p.get('fiche')) : null,
    // LOT RATTACHEMENT-2 — idem pour la cible de l'historique. Elle est rendue TELLE QUELLE (bornée) : c'est
    //   `cibleDepuisTexte` dans `historique.ts` qui juge si elle désigne quelque chose, et lui seul.
    cible: ecran === 'historique' ? cibleBrute(p.get('cible')) : null,
  };
}

/**
 * La cible portée par une adresse, BORNÉE et sans plus d'interprétation. Une valeur absurde rend `null`, jamais une
 * erreur. On refuse ce qui ne peut pas être une cible — mais on ne cherche pas à savoir laquelle : ce n'est pas le
 * rôle de ce fichier, qui doit rester sans aucun import.
 */
function cibleBrute(brut: string | null): string | null {
  const s = (brut ?? '').trim();
  return s !== '' && s.length <= 70 && /^[A-Za-z0-9_.:+-]+$/.test(s) ? s : null;
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
  if (e.ecran === 'annuaire' && e.fiche != null) p.set('fiche', texteFiche(e.fiche));
  if (e.ecran === 'historique' && e.cible != null && e.cible !== '') p.set('cible', e.cible);
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
  // LOT 5-BOITE-3 — la CORBEILLE montre TOUT ce qu'elle contient, courrier automatique compris. Sans cela, un
  //   échange entièrement automatique mis à la corbeille ne serait visible NULLE PART — ni dans ses boîtes, qui
  //   l'écartent, ni ici. Une corbeille où l'on ne retrouve pas ce qu'on y a mis n'est pas une corbeille.
  if (e.sorte === 'corbeille') return true;
  return null;
}

/** Deux états désignent-ils le même écran ? Sert à ne PAS empiler une entrée d'historique pour rien. */
export function memeEtat(a: EtatEcranUrl, b: EtatEcranUrl): boolean {
  return a.ecran === b.ecran && a.filOuvert === b.filOuvert
    && (a.ecran !== 'boite' || memeEtiquette(a.etiquette, b.etiquette))
    && (a.ecran !== 'annuaire' || (a.fiche?.sorte ?? null) === (b.fiche?.sorte ?? null)
      && (a.fiche?.id ?? null) === (b.fiche?.id ?? null))
    && (a.ecran !== 'historique' || (a.cible ?? null) === (b.cible ?? null));
}
