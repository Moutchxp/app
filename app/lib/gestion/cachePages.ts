/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LE CACHE COURT DES PAGES DE LISTE. MODULE PUR ══════════════════════════════
 *
 * Aucune base, aucun réseau, aucun DOM, aucun React : on lui donne une clé, il rend ou il garde.
 *
 * ═══ 🔴 CE QUE ÇA RÉPARE, ET CE QUI A ÉTÉ MESURÉ ════════════════════════════════════════════════════════════════
 *
 * Mesuré à l'écran le 30/09/2026, clic sur « › » jusqu'à la liste affichée :
 *   · Réception            727 · 843 · 858 · 873 · 915 · 955 ms
 *   · Courrier automatique 739 · 780 · 799 · 813 · 824 · 1 044 ms
 *
 * 🔴 ET TOUT CE TEMPS EST DE L'ATTENTE SERVEUR : 625 à 1 022 ms d'attente, contre 1 ms de transfert et un rendu
 * négligeable. Optimiser le navigateur n'aurait rien donné ; ce qui coûte, c'est la requête.
 *
 * D'où les deux leviers, dans cet ordre :
 *   ① NE PAS LA REFAIRE — une page déjà vue se rouvre depuis ce cache, sans un seul aller-retour ;
 *   ② LA FAIRE D'AVANCE — les pages suivantes sont demandées en arrière-plan pendant qu'on lit celle qu'on a.
 * La demande d'Arno dit les deux : « une page déjà vue se rouvre instantanément », « précharge en arrière-plan ».
 *
 * ═══ ⚠️ POURQUOI « COURT », ET POURQUOI C'EST ESSENTIEL ═════════════════════════════════════════════════════════
 *
 * Une boîte mail BOUGE : du courrier arrive, on classe, on met à la corbeille, on marque lu. Une page gardée trop
 * longtemps montrerait un état révolu — et c'est bien pire qu'une page lente, parce que rien ne le dit. Le cache
 * a donc une DURÉE DE VIE en secondes, et il est VIDÉ à chaque événement qui change la liste (relève, geste). Les
 * deux, pas l'un ou l'autre : la durée couvre ce qu'on n'a pas vu passer, le vidage couvre ce qu'on a fait.
 */

/** Combien de temps une page gardée reste digne de confiance. Demande d'Arno : « un cache court ». */
export const DUREE_CACHE_MS = 30_000;

/**
 * Combien de pages on garde au plus. Vingt-cinq lignes par page, une trentaine d'objets par ligne : cinquante
 * pages tiennent sans peser, et personne ne revient en arrière au-delà.
 *
 * ⚠️ LA PLUS ANCIENNE SORT LA PREMIÈRE (`Map` en JavaScript garde l'ordre d'insertion) : c'est celle dont on
 * s'est le plus éloigné, donc la moins susceptible d'être redemandée.
 */
export const PAGES_GARDEES_MAX = 50;

export interface EntreeCache<T> {
  valeur: T;
  /** L'horloge du navigateur au moment où la page a été rangée. */
  poseeA: number;
}

/**
 * ══ 🔴 LA CLÉ : CE QUI FAIT QU'UNE PAGE EST « LA MÊME » ═════════════════════════════════════════════════════════
 *
 * Deux pages ne sont interchangeables que si TOUT ce qui décide de leur contenu est identique : l'étiquette, le
 * rang de la page, et chacun des filtres. En oublier un servirait la page de « Réception » sous « Spam », ou la
 * liste entière sous le filtre étoilé — un cache qui se trompe de page est pire que pas de cache du tout.
 *
 * ⚠️ LE CRITÈRE DE RECHERCHE EN FAIT PARTIE, ENTIER. Deux recherches différentes ne partagent jamais une page.
 */
export function cleDePage(o: {
  etiquette: string;
  page: number;
  auto: boolean;
  filtre: string | null;
  etoile: boolean;
  /** La recherche, sérialisée par l'appelant. Chaîne vide = aucune recherche. */
  recherche: string;
}): string {
  return [
    o.etiquette, String(o.page), o.auto ? 'auto' : '-', o.filtre ?? '-', o.etoile ? 'etoile' : '-', o.recherche,
  ].join('|');
}

/**
 * Le cache lui-même. Une classe plutôt qu'une `Map` nue : la durée de vie et le plafond sont des RÈGLES, et une
 * règle qui vit chez l'appelant est une règle qu'un second appelant oubliera.
 */
export class CachePages<T> {
  private readonly pages = new Map<string, EntreeCache<T>>();

  constructor(
    private readonly dureeMs: number = DUREE_CACHE_MS,
    private readonly maxPages: number = PAGES_GARDEES_MAX,
  ) {}

  /**
   * La page gardée, ou `null`.
   *
   * ⚠️ UNE PAGE PÉRIMÉE EST RETIRÉE AU PASSAGE, pas seulement ignorée : la laisser ferait grossir le cache de
   * pages mortes qu'on relit à chaque fois pour les rejeter.
   */
  lire(cle: string, maintenant: number): T | null {
    const e = this.pages.get(cle);
    if (e === undefined) return null;
    if (maintenant - e.poseeA > this.dureeMs) { this.pages.delete(cle); return null; }
    return e.valeur;
  }

  /** Ranger une page. Réécrire une clé existante la remet à neuf, date comprise. */
  ranger(cle: string, valeur: T, maintenant: number): void {
    // Réinsérer après suppression remet la clé EN FIN d'ordre : une page relue n'est plus la plus ancienne.
    this.pages.delete(cle);
    this.pages.set(cle, { valeur, poseeA: maintenant });
    while (this.pages.size > this.maxPages) {
      const plusAncienne = this.pages.keys().next();
      if (plusAncienne.done === true) break;
      this.pages.delete(plusAncienne.value);
    }
  }

  /**
   * ══ 🔴 TOUT VIDER — appelé à chaque événement qui change la liste ═══════════════════════════════════════════
   *
   * La relève (du courrier nouveau), et tout geste qui déplace une ligne : classer, mettre à la corbeille,
   * marquer lu. Demande d'Arno, mot pour mot. On vide TOUT plutôt que d'essayer de deviner quelles pages sont
   * touchées : un mail classé change la page où il était, celles qui le suivaient (les lignes remontent d'un
   * cran), et les totaux. Deviner reviendrait à réécrire la requête côté navigateur.
   */
  vider(): void {
    this.pages.clear();
  }

  /** Combien de pages sont gardées. Pour les épreuves, et pour pouvoir le dire. */
  get taille(): number {
    return this.pages.size;
  }
}

/**
 * ══ 🔴 QUELLES PAGES PRÉCHARGER, ET DANS QUEL ORDRE ═════════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « une fois qu'elle est rendue, précharge en arrière-plan les 2 pages suivantes (et la
 * précédente si on vient de reculer) ».
 *
 * 🔴 « UNE FOIS QU'ELLE EST RENDUE », ET C'EST LA RÈGLE QUI COMPTE : la page affichée a la priorité ABSOLUE. Un
 * préchargement lancé pendant son chargement lui disputerait la connexion et le serveur, pour une page que
 * personne ne regarde encore. C'est la même règle que l'amorce des voisins dans la visionneuse (lot
 * PIECES-DE-LA-CONVERSATION), et elle a la même raison.
 *
 * ⚠️ ON NE PRÉCHARGE JAMAIS CE QU'ON A DÉJÀ : l'appelant écarte les pages présentes en cache avant de demander.
 * PUR : rend des RANGS, pas des requêtes.
 */
export function pagesAPrecharger(o: {
  page: number;
  /** A-t-on reculé pour arriver ici ? La précédente devient alors utile — on vient de montrer qu'on y retourne. */
  versLArriere: boolean;
  /** Y a-t-il une page après ? Rendu par le serveur, jamais déduit d'un total. */
  suite: boolean;
}): number[] {
  const out: number[] = [];
  // Les deux suivantes, dans l'ordre : la plus proche d'abord, parce que c'est la plus probable.
  if (o.suite) { out.push(o.page + 1, o.page + 2); }
  // ⚠️ LA PRÉCÉDENTE SEULEMENT SI L'ON VIENT DE RECULER, et jamais la page 0 depuis la page 0.
  if (o.versLArriere && o.page > 0) out.push(o.page - 1);
  return out;
}
