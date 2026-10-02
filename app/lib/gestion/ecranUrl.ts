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
  /**
   * LOT ERGO-BOITE-3 — le courrier que GMAIL a classé en spam. Ce n'est pas notre jugement : on le constate, on le
   * garde (Gmail, lui, le supprime au bout de 30 jours), et on ne le laisse entrer nulle part ailleurs. Sans la
   * migration 263, l'étiquette existe et sa liste est vide — jamais fausse.
   */
  | 'spam'
  /**
   * ══ 🔴🔴 LOT DOSSIER-A-CLASSER — LES MAILS QUI PORTENT LA PASTILLE ROUGE « À classer » ══════════════════════
   *
   * DÉCISION D'ARNO (02/10/2026) : « Le dossier “Sans événement” ne me sert à rien. Il est remplacé, à la même
   * place, par un dossier “À classer” qui affiche tous les mails portant le statut “À classer”. »
   *
   * 🔴🔴 POURQUOI UN NOM DIFFÉRENT DE `a_classer`, ET C'EST TOUT LE PIÈGE DE CE LOT. La sorte `a_classer` existe
   * depuis le lot 5-FUSION et ne désigne PAS ce que son nom dit : c'est l'étiquette du POSTE DE TRI (les échanges
   * sans événement, `gestion_fil.etat = 'a_classer'`), rebaptisée « Sans événement » à l'écran au lot
   * STATUT-PAR-MAIL précisément parce que son mot trompait. La réutiliser aurait fait pointer la même adresse vers
   * deux listes différentes, et cassé toutes les adresses déjà copiées ou mises en favori.
   *
   * ⚠️ LE MOT AFFICHÉ EST « À classer » ; la sorte, elle, dit SUR QUOI elle porte — le STATUT d'un mail, et non
   * l'état d'un échange. Mesuré le 02/10/2026 : 38 013 mails portent le statut, contre 36 690 échanges sans
   * événement. Deux questions, deux nombres, deux listes.
   */
  | 'a_classer_statut'
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
   * ══ 🔴 LOT MESSAGE-CLIQUÉ — QUEL MESSAGE DE CET ÉCHANGE ON VENAIT LIRE ════════════════════════════════════════
   * Le message que la LIGNE cliquée représentait : le dernier reçu sous « Réception », le dernier envoyé sous
   * « Envoyés », le message trouvé dans une recherche, celui de la ligne dans l'historique. La conversation le
   * déplie et l'amène à l'écran ; les autres restent au-dessus et en dessous, repliés et cliquables.
   *
   * 🔴 POURQUOI DANS L'ADRESSE, et pas dans un état de composant. C'est la règle du fichier depuis le lot 5-FUSION :
   * ce qu'on REGARDE s'écrit dans l'adresse, seul endroit qu'un navigateur sait relire, garder dans son historique et
   * copier. Sans cela, recharger la page — ou revenir par « Précédent » — rouvrirait le fil sur son dernier message
   * et non sur celui qu'on lisait ; et un échange ne pourrait pas s'envoyer à un collègue ouvert au bon endroit.
   *
   * ⚠️ IL NE VAUT RIEN SANS `filOuvert`, et c'est vérifié aux deux bouts : ni lu ni écrit quand aucun échange n'est
   * ouvert. Un `?message=` orphelin ne désigne rien — le traîner mettrait dans l'historique deux adresses pour un
   * seul écran, exactement ce que `fiche`, `cible` et `filtre` évitent déjà.
   *
   * ⚠️ FACULTATIF À L'ÉCRITURE, comme ses voisins : une trentaine d'appels construisent déjà un état à la main, et
   * les obliger tous à écrire `messageOuvert: null` serait du bruit. `null` = « le défaut », c'est-à-dire le dernier
   * message lisible de l'échange — le comportement d'avant ce lot, mot pour mot.
   */
  messageOuvert?: number | null;
  /**
   * ══ 🔴 LOT BROUILLONS-GMAIL — LE BROUILLON QU'ON VIENT ROUVRIR ════════════════════════════════════════════════
   *
   * Un clic sur un brouillon de RÉPONSE ouvrait la conversation… sans l'éditeur, et le brouillon était introuvable
   * (constat d'Arno). Il voyage désormais dans l'adresse, comme le message visé : la conversation sait alors quel
   * brouillon rouvrir, et sous quel message le poser.
   *
   * ⚠️ IL NE VAUT RIEN SANS `filOuvert`, exactement comme `messageOuvert` : un `?brouillon=` orphelin ne désigne
   * aucune conversation, et le traîner mettrait deux adresses dans l'historique pour un seul écran.
   *
   * ⚠️ FACULTATIF À L'ÉCRITURE : la trentaine d'appels qui construisent déjà un état à la main n'ont pas à écrire
   * `brouillonOuvert: null`. `null` = « aucun brouillon à rouvrir », c'est-à-dire le comportement d'avant ce lot.
   */
  brouillonOuvert?: number | null;
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
  /**
   * ══ LOT ERGO-BOITE-3 — LE SÉLECTEUR DE « RÉCEPTION » : tous les échanges reçus, ou seulement les non lus ══════
   * `null` = tous (le défaut, et la valeur qui ne s'écrit jamais dans l'adresse). `'non-lus'` = seulement les
   * échanges portant un message reçu que JE n'ai pas ouvert.
   *
   * 🔴 POURQUOI DANS L'ADRESSE. Sans cela, un rechargement — ou le rafraîchissement automatique de 30 s, qui relit
   * la page — ramènerait la liste entière sans prévenir, alors qu'on venait de demander les non lus. Un filtre qui
   * saute tout seul est pire qu'un filtre absent : on croit voir le tout, on ne voit qu'une partie, ou l'inverse.
   *
   * ⚠️ FACULTATIF À L'ÉCRITURE, comme `fiche` et `cible`, et pour la même raison : une trentaine d'appels
   * construisent déjà un état à la main, et les obliger tous à écrire `filtre: null` serait du bruit.
   */
  filtre?: 'non-lus' | null;
  /**
   * LOT FILTRE-ETOILE — ne montrer que les échanges étoilés. `false` (le défaut) ne s'écrit jamais dans l'adresse.
   *
   * 🔴 IL SE COMBINE, il ne remplace pas. Étoilés ET non lus, étoilés sous « Envoyés », étoilés dans une
   * recherche : ce sont des restrictions qui s'additionnent, comme les cases du panneau avancé.
   */
  etoile?: boolean;
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
/**
 * ══ 🔴 LOT ERGO-BOITE — CE QU'ON VOIT EN OUVRANT LE MODULE ══════════════════════════════════════════════════════
 * LA BOÎTE, SUR « RÉCEPTION ». Demande d'Arno du 27/09/2026 : c'est le courrier reçu qu'il ouvre en arrivant, pas la
 * file de tri. Jusqu'ici le module s'ouvrait sur l'écran partagé, à l'étiquette « À classer » — deux gestes avant
 * d'atteindre ce qu'on venait lire.
 *
 * ⚠️ RIEN N'EST RETIRÉ : l'écran partagé reste à un clic (« ← Écran partagé », premier élément de la colonne), avec
 * ses événements et sa file de tri. Et une adresse qui DÉSIGNE quelque chose l'emporte toujours sur ce défaut —
 * `?ecran=partage`, `?etiquette=envoyes`, `?fil=123` ouvrent exactement ce qu'ils visent (voir `lireEtatUrl`).
 */
export const ETAT_DEFAUT: EtatEcranUrl = {
  ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: null, messageOuvert: null, brouillonOuvert: null,
  fiche: null, cible: null,
  filtre: null, etoile: false,
};

const ECRANS: readonly Ecran[] = ['partage', 'boite', 'evenements', 'annuaire', 'a_trier', 'historique'];
const SORTES_FIXES: readonly SorteEtiquette[] = [
  'reception', 'a_classer', 'envoyes', 'sans_suite', 'automatique', 'brouillons', 'spam',
  // 🔴🔴 LOT DOSSIER-A-CLASSER — le dossier des mails qui portent la pastille rouge. Voir l'encadré de la sorte :
  //   ce n'est PAS `a_classer`, qui est le poste de tri (« Sans événement »).
  'a_classer_statut',
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

/**
 * L'ADRESSE DÉSIGNE-T-ELLE UNE ÉTIQUETTE QUI EXISTE ? PUR.
 *
 * ⚠️ `etiquetteDepuisTexte` ne peut pas répondre : elle rend « À classer » aussi bien pour `a_classer` que pour une
 * valeur absurde. Distinguer les deux est nécessaire pour savoir s'il faut appliquer un repli — voir `lireEtatUrl`.
 */
export function etiquetteReconnue(brut: string | null): boolean {
  const t = (brut ?? '').trim();
  if (t === '') return false;
  return (SORTES_FIXES as readonly string[]).includes(t) || (/^carte-(\d+)$/.test(t) && identifiant(t.slice(6)) !== null);
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
  // LOT MESSAGE-CLIQUÉ — le message visé n'existe QUE s'il y a un échange ouvert : un `?message=` orphelin ne
  //   désigne rien, et le garder mettrait deux adresses dans l'historique pour un seul écran.
  const filOuvert = identifiant(p.get('fil'));
  // LOT ERGO-BOITE — sans paramètre, c'est la boîte (voir `ETAT_DEFAUT`). Un `ecran=` écrit, lui, fait toujours foi.
  const ecran: Ecran = (ECRANS as readonly string[]).includes(brutEcran ?? '')
    ? (brutEcran as Ecran) : ETAT_DEFAUT.ecran;
  return {
    ecran,
    /**
     * ⚠️ L'ÉTIQUETTE PAR DÉFAUT DÉPEND DE L'ÉCRAN, et c'est le point délicat de ce lot. Dans la boîte, c'est
     * « Réception » ; sur l'écran partagé, c'est « À classer », qui est la liste qu'il montre depuis toujours.
     * Donner « Réception » à l'écran partagé changerait la liste de gauche sans que personne l'ait demandé.
     */
    /**
     * ⚠️ ABSENTE, VIDE OU ABÎMÉE : LE MÊME REPLI. `URLSearchParams.get` rend `''` et non `null` pour `?etiquette=`,
     * et `etiquetteDepuisTexte` rend « À classer » pour une valeur qu'elle ne reconnaît pas. Sans ce traitement
     * unifié, `?etiquette=` ouvrait « Réception » et `?etiquette=nimportequoi` ouvrait « À classer » — deux replis
     * différents pour la même situation : une adresse qui ne désigne rien.
     *
     * Hors de la boîte, on garde `etiquetteDepuisTexte` : l'écran partagé arrive sur sa file de tri, comme toujours.
     */
    etiquette: ecran !== 'partage' && !etiquetteReconnue(p.get('etiquette'))
      ? ETAT_DEFAUT.etiquette
      : etiquetteDepuisTexte(p.get('etiquette')),
    filOuvert,
    messageOuvert: filOuvert === null ? null : identifiant(p.get('message')),
    // LOT BROUILLONS-GMAIL — comme le message visé : lu SEULEMENT avec son échange (voir `brouillonOuvert`).
    brouillonOuvert: filOuvert === null ? null : identifiant(p.get('brouillon')),
    // La fiche ne désigne quelque chose QUE dans l'annuaire : la lire ailleurs traînerait un paramètre mort.
    fiche: ecran === 'annuaire' ? ficheDepuisTexte(p.get('fiche')) : null,
    // LOT RATTACHEMENT-2 — idem pour la cible de l'historique. Elle est rendue TELLE QUELLE (bornée) : c'est
    //   `cibleDepuisTexte` dans `historique.ts` qui juge si elle désigne quelque chose, et lui seul.
    cible: ecran === 'historique' ? cibleBrute(p.get('cible')) : null,
    /**
     * Le filtre ne désigne quelque chose QUE dans la boîte, sous « Réception » : ailleurs il n'y a pas de non-lus à
     * distinguer, et le traîner mettrait dans l'historique deux adresses pour un seul écran. Toute valeur autre que
     * `non-lus` vaut « tous » — une adresse abîmée doit montrer TOUT, jamais moins.
     */
    filtre: ecran === 'boite' && p.get('filtre') === 'non-lus' ? 'non-lus' : null,
    // Comme le filtre des non-lus : il ne désigne quelque chose que dans la boîte, et toute autre valeur vaut
    //   « non » — une adresse abîmée doit montrer TOUT, jamais moins.
    etoile: ecran === 'boite' && p.get('etoile') === '1',
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
  // LOT ERGO-BOITE — ON N'ÉCRIT QUE CE QUI S'ÉCARTE DU DÉFAUT, et le défaut a changé : c'est désormais la boîte sur
  //   « Réception ». L'adresse nue du module désigne donc cela, et `?ecran=partage` s'écrit maintenant en toutes
  //   lettres. Les deux tests se lisent sur `ETAT_DEFAUT` et non sur des valeurs recopiées : une seule vérité.
  if (e.ecran !== ETAT_DEFAUT.ecran) p.set('ecran', e.ecran);
  if (e.ecran === 'boite' && !memeEtiquette(e.etiquette, ETAT_DEFAUT.etiquette)) p.set('etiquette', texteEtiquette(e.etiquette));
  if (e.filOuvert !== null) p.set('fil', String(e.filOuvert));
  // LOT MESSAGE-CLIQUÉ — écrit UNIQUEMENT avec son échange, et jamais seul : voir `messageOuvert`. Ainsi le
  //   rechargement et le bouton « Précédent » rouvrent le message qu'on lisait, pas le dernier du fil.
  if (e.filOuvert !== null && e.messageOuvert != null) p.set('message', String(e.messageOuvert));
  // LOT BROUILLONS-GMAIL — le brouillon rouvert, écrit avec son échange et jamais seul.
  if (e.filOuvert !== null && e.brouillonOuvert != null) p.set('brouillon', String(e.brouillonOuvert));
  if (e.ecran === 'annuaire' && e.fiche != null) p.set('fiche', texteFiche(e.fiche));
  if (e.ecran === 'historique' && e.cible != null && e.cible !== '') p.set('cible', e.cible);
  // Seul `non-lus` s'écrit : « tous » est le défaut, et un défaut écrit dans l'adresse n'est plus un défaut.
  if (e.ecran === 'boite' && e.filtre === 'non-lus') p.set('filtre', 'non-lus');
  if (e.ecran === 'boite' && e.etoile === true) p.set('etoile', '1');
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

/**
 * Deux états désignent-ils le même écran ? Sert à ne PAS empiler une entrée d'historique pour rien.
 *
 * ⚠️ LOT MESSAGE-CLIQUÉ — LE MESSAGE VISÉ ENTRE DANS LA COMPARAISON. Deux messages différents du même échange sont
 * deux endroits différents : sans cela, passer de l'un à l'autre écraserait l'entrée d'historique, et « Précédent »
 * ne ramènerait pas au message d'où l'on vient. Il n'est comparé que dans la boîte, où il existe.
 */
export function memeEtat(a: EtatEcranUrl, b: EtatEcranUrl): boolean {
  return a.ecran === b.ecran && a.filOuvert === b.filOuvert
    && (a.filOuvert === null || (a.messageOuvert ?? null) === (b.messageOuvert ?? null))
    && (a.filOuvert === null || (a.brouillonOuvert ?? null) === (b.brouillonOuvert ?? null))
    && (a.ecran !== 'boite' || memeEtiquette(a.etiquette, b.etiquette))
    && (a.ecran !== 'annuaire' || (a.fiche?.sorte ?? null) === (b.fiche?.sorte ?? null)
      && (a.fiche?.id ?? null) === (b.fiche?.id ?? null))
    && (a.ecran !== 'historique' || (a.cible ?? null) === (b.cible ?? null));
}
