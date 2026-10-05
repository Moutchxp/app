'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
/**
 * ══ 🔴🔴 LES DEUX COMPOSANTS SONT **IMPORTÉS**, JAMAIS RECOPIÉS ═══════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026), mot pour mot : « LE FIL : même présentation que les mails de “Vie du bien”.
 * **RÉUTILISE ce composant, ne le recopie pas.** » Et pour les pièces : « en MINIATURES (**réutilise le composant
 * de miniature des mails** : œil, téléchargement, picto Drive vert). »
 *
 * 🔴 LA RECOPIE ÉTAIT LE PIÈGE, ET CE DÉPÔT L'A DÉJÀ PAYÉ PLUSIEURS FOIS (deux listes de domaines, deux règles de
 * repli, trois listes de types d'images). Deux rendus d'une même ligne de courrier divergent au premier
 * ajustement — et c'est celui qu'on regarde le moins qui garde l'erreur. `LigneVie` et `CartePieceConversation`
 * ont donc reçu un `export` (et RIEN d'autre : ni une classe, ni une prop, ni une virgule du corps), et ce bloc
 * les appelle tels quels. Le garde `HistoriqueDuBien.test.ts` vérifie que l'import existe et qu'aucune de leurs
 * balises n'a été redessinée ici.
 */
import { CSS_VIE_DU_BIEN, LigneVie } from './VieDuBien';
import { CartePieceConversation, CSS_PIECES_CONVERSATION, type GestesPiece } from './PiecesDeLaConversation';
import { CSS_PIECES, type DepotAffiche } from './PiecesJointes';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
import {
  dossierDeLEmplacement, type EmplacementPiece, type StatutPieceDrive,
} from '../../../../lib/gestion/pieceDansLeDrive';
import type { PieceARanger } from '../../../../lib/gestion/rangementDrive';
import { lienDocumentEntier } from '../../../../lib/gestion/pieces';
import { dateHeureComplete, dateHeureCourte } from '../../../../lib/gestion/ecran';
import { formaterDateIso } from '../../../../lib/gestion/annuaireRecherche';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import {
  libelleInterlocuteur, PAGE_HISTORIQUE_MAX, type Interlocuteur, type LigneHistorique,
} from '../../../../lib/gestion/historique';
import {
  dedoublonnerPieces, grouperParMessage, mentionExpediteurPiece, motPieces, piecesDeLaConversation,
  type GroupeDePieces, type PieceDedoublonnee,
} from '../../../../lib/gestion/piecesConversation';
/**
 * 🔴 TOUTES LES DÉCISIONS VIENNENT DU MODULE PUR, ET ELLES N'Y SONT ÉCRITES QU'UNE FOIS. Ce fichier place et
 * peint : il ne décide ni d'une période, ni d'un groupe, ni d'un mot — et surtout pas de la phrase « locataire en
 * place », qui est précisément celle qu'une maquette a fait mentir (voir `motLocataireDeLaPeriode`).
 */
import {
  bornesDuChoix, grouperParCategorie, grouperParConversation, libelleOrdreFil, messagesDuFil, motAgenceEcartee,
  motAucunResultat, motDeuxCompteurs, motLocataireDeLaPeriode, motPeriodeEffective, ordreFilSuivant,
  periodeDeLEvenement, periodeDuDernierLocataire, reglagesActifs, REGLAGES_DEFAUT, reglagesEnParametres,
  adresseACorriger, BUT_DU_PLUS, ciblesDeplacement, clientConnuPour, compteCacheesEnBas, compteCacheesEnHaut,
  MOT_ADRESSE_A_CORRIGER, motifNonSelectionnable,
  completerAvecLesClients, motPastille, pastilleDeCapsule, sorteDeCapsule,
  filtrerParMots, GROUPES_EN_BANDE,
  GROUPES_EN_ENCART, motBasculeResume, motCompteurRecherche, motEncartVide, motPiecesSelection, motsRecherches,
  motCacheesEnBas, motCacheesEnHaut, motDeplacement, MOTIF_NON_DEPLACABLE, partieDeplacable,
  CLE_RETOUR_BIEN, etatRetourDepuisBrut, MS_SURLIGNE_RETOUR, SECONDES_ANNULER_DEPLACEMENT,
  replierLesCartes, SANS_EVENEMENT, SANS_LOCATAIRE_CONNU, tonDeLExpediteur, trierFil, LEGENDE_BARRES,
  type CategoriePartie, type CleGroupeParties, type ClientDuBien, type EtatRetourBien, type GroupeParties,
  type OccupationPeriode,
  type PeriodePartie, type Reglages,
} from '../../../../lib/gestion/historiqueBien';
/**
 * 🔴🔴 LOT HISTORIQUE-BIEN-7 — LA SYNCHRONISATION AVEC LES CARROUSELS DU HAUT, DANS LES DEUX SENS.
 *
 * Ce bloc ANNONCE après chacune de ses écritures (le « + », un glisser, une annulation) pour réveiller le haut,
 * et il ÉCOUTE, pour que vérifier, modifier ou retirer une carte depuis le haut change ses capsules et ses
 * pastilles sans rechargement. Le signal ne porte aucune carte : il dit « redemande ».
 */
import { annoncerCartesContact, concerneCeBien, ecouterCartesContact, type SignalCartesContact }
  from '../../../../lib/gestion/signalCartesContact';
/**
 * 🔴 LE VOCABULAIRE DES CATÉGORIES ET LE CÔTÉ D'UNE CARTE VIENNENT DU MODULE QUI EN EST LE JUGE
 * (`partieCategorie.ts`), jamais d'une liste recopiée ici : `coteDeLaCategorie` décide si une carte de contact
 * se range côté propriétaire ou côté locataire, et c'est la même fonction que la reprise a employée.
 */
import { coteDeLaCategorie, type Categorie } from '../../../../lib/gestion/partieCategorie';
import type { EvenementDuBien } from '../../../../lib/gestion/historiqueBienRepo';

/**
 * LOT HISTORIQUE-BIEN-1 — « L'HISTORIQUE DU BIEN », EN BAS DE LA FICHE D'UN LOGEMENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL AJOUTE À « VIE DU BIEN », QUI EST JUSTE AU-DESSUS ET QUI NE BOUGE PAS D'UN PIXEL. « Vie du bien »
 * répond à « tous les mails de ce logement ». Ce bloc-ci répond à la question d'APRÈS, celle qu'on se pose un
 * dossier en main : *pendant le sinistre de février*, *entre le propriétaire et l'assureur*, qu'est-ce qui s'est
 * dit — et quelles pièces ont circulé ?
 *
 * 🔴 PAS DE BANDEAU DE NAVIGATION. Arno n'en veut pas : le bloc est en bas de la fiche, il se trouve en défilant.
 *
 * 🔴 TOUT EST DÉCIDÉ DANS `historiqueBien.ts`. Ce fichier ne porte aucune règle : il monte le tableau de bord,
 * appelle la route existante avec les paramètres que le module pur écrit, et rend le fil et les pièces avec les
 * composants EXISTANTS.
 *
 * ⚠️ CLAIR ET SOMBRE : aucune couleur n'est inventée ici. Les jetons `--color-svv-*` vivent dans `globals.css`,
 * portés par `.svv-adm-root[data-theme=…]`, et rien n'est posé sur `:root`.
 *
 * ⚠️ 44 PX DE CIBLE, AUCUNE INFORMATION PORTÉE PAR UNE SEULE INFOBULLE, ET LE FOCUS SE GARDE : le tableau de bord
 * est rendu HORS du commutateur d'état (« chargement / erreur / liste »), ce qui fait que cocher une case ne
 * démonte jamais la case. C'est le défaut classique de ces panneaux — on coche, le panneau se reconstruit, et la
 * tabulation repart du début.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Etat =
  | { v: 'charge' }
  | { v: 'erreur'; message: string }
  | {
    v: 'ok'; lignes: LigneHistorique[]; suite: boolean; total: number;
    interlocuteurs: Interlocuteur[]; tronques: boolean;
  };

/** Ce que l'écran demande à ranger : la pièce, et le courrier d'où elle vient (la fenêtre Drive veut les deux). */
interface DemandeRangement {
  messageId: number;
  filId: number | null;
  pieces: PieceARanger[];
}

/**
 * ══ 🔴🔴 LE TEMPS DE SILENCE APRÈS LA DERNIÈRE FRAPPE ═════════════════════════════════════════════════════════════
 *
 * Repris de « Vie du bien » au caractère près (lot HISTORIQUE-BIEN-2) : 250 ms, assez court pour paraître
 * instantané, assez long pour ne pas lancer une requête par lettre. Sans lui, « chaudière » aurait produit neuf
 * requêtes dont huit jetées — et sur le bien le plus fourni (325 mails), les réponses seraient revenues dans le
 * désordre.
 */
const ATTENTE_FRAPPE_MS = 250;

export function HistoriqueDuBien({
  lotCle, maintenant, occupations, categories, periodes = new Map(), clients = [], onFicheClient,
  evenementOuvertInitial = false, onOuvrirFil, onEcranComplet, jeton = null, onPoserJeton,
}: {
  /** La clé WIPPIMMO du lot — la cible de l'historique, et la seule identité qui survive à un ré-import. */
  lotCle: string;
  maintenant: Date;
  /**
   * 🔴 TOUTES LES OCCUPATIONS DU LOGEMENT, PASSÉES COMPRISES — c'est la demande d'Arno : « les anciens locataires
   * sont visibles et sélectionnables, chacun avec sa période ».
   *
   * ⚠️ ELLES VIENNENT DE LA FICHE, PAS DE LA ROUTE, ET C'EST UN FAIT MESURÉ, non un choix de confort :
   * `/api/admin/gestion/historique` ne renseigne `occupations` que pour une cible `locataire-…`
   * (`etendreCible`, branche `locataire`). Pour une cible `lot-…` elle rend un tableau VIDE — un bien n'est pas
   * borné dans le temps. La fiche, elle, les a déjà toutes (`FicheLot.occupations`) : les lire là évite une
   * requête et surtout évite d'élargir une réponse que quatre écrans lisent.
   */
  occupations: readonly OccupationPeriode[];
  /**
   * À QUELLE CATÉGORIE APPARTIENT CHAQUE ADRESSE. Clé en minuscules. Une adresse absente tombe dans
   * « À répartir », ce qui est un fait affiché, jamais un silence.
   */
  categories: ReadonlyMap<string, CategoriePartie>;
  /**
   * 🔴 LOT HISTORIQUE-BIEN-2 — LE CARTOUCHE « ÉVÉNEMENT EN COURS » ARRIVE ICI FILTRÉ. Il menait à « Vie du bien »
   * avec son filtre `'evenement'` ; « Vie du bien » n'existe plus, et la promesse du cartouche doit tenir : on
   * arrive sur les échanges qui portent un événement ouvert, pas sur la liste entière à filtrer soi-même.
   *
   * ⚠️ C'EST UN DÉPART, PAS UNE CONTRAINTE — exactement la convention de `filtreInitial` à qui il succède : le
   * bouton reste cliquable, et le premier clic reprend la main. Un filtre imposé ferait croire que le bien n'a
   * que ces échanges-là.
   */
  evenementOuvertInitial?: boolean;
  /**
   * ══ 🔴🔴 LA PÉRIODE DE CHAQUE PARTIE QUI EN A UNE — « chacun avec sa période » ═══════════════════════════════
   *
   * Clé en minuscules, comme `categories`. Elle vient de la FICHE, qui seule connaît les baux : la route rend un
   * tableau d'occupations VIDE pour une cible `lot-…`. Une adresse absente n'affiche rien — la plupart des
   * parties (assureur, syndic, artisan) n'ont pas de bail, et leur inventer une période serait un mensonge.
   */
  periodes?: ReadonlyMap<string, PeriodePartie>;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES CLIENTS DU BIEN, TELS QUE LA FICHE LES PORTE ═══════════════════
   *
   * DEMANDE D'ARNO : « Le propriétaire client (carte du haut de fiche) y apparaît en capsule même avec 0 mail,
   * avec ses compteurs à 0. »
   *
   * 🔴 ILS VIENNENT DE LA FICHE, COMME `occupations` ET `categories`, ET POUR LA MÊME RAISON : la route de
   * l'historique ne connaît que les gens qui ont ÉCRIT ou REÇU quelque chose. Un propriétaire muet n'y est pas,
   * et c'est bien pour cela que son encart était vide. Élargir la réponse de la route aurait touché quatre
   * écrans pour un besoin qui n'existe que sur la fiche d'un bien.
   *
   * ⚠️ VIDE PAR DÉFAUT, DONC AUCUN CHANGEMENT LÀ OÙ PERSONNE NE LES PASSE : le bloc rend alors exactement ce
   * qu'il rendait avant ce lot, aux deux encarts toujours présents près.
   *
   * ⚠️ UN CLIENT SANS ADRESSE EN FAIT PARTIE (`adresse: null`) : il ne donne pas de capsule, mais il change la
   * phrase de l'encart vide — « aucun échange avec le locataire » plutôt que « aucun locataire connu ».
   */
  clients?: readonly ClientDuBien[];
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — OUVRIR LA FICHE D'ANNUAIRE D'UN CLIENT dont l'adresse est à corriger.
   *
   * Demande d'Arno : « la mention discrète “adresse à corriger dans l'annuaire” (lien vers sa fiche) ». C'est là
   * qu'on corrige l'adresse — pas sur la fiche du bien.
   *
   * ⚠️ FACULTATIVE : sans elle, la mention s'affiche sans lien. Dire le problème vaut mieux que se taire parce
   * qu'on n'a pas de porte à offrir.
   */
  onFicheClient?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3 — L'ÉCRAN « HISTORIQUE » COMPLET RESTE ATTEIGNABLE ════════════════════════════
   *
   * DÉCISION D'ARNO (05/10/2026), en réponse à ma question du lot précédent : « L'écran plein “Historique” reste
   * accessible : petit lien discret “Écran historique complet” en bas du nouveau bloc. »
   *
   * 🔴 POURQUOI LA QUESTION SE POSAIT. Au lot 2, « Tout l'historique des échanges → » a cessé d'ouvrir cet écran
   * pour défiler vers ce bloc — demande d'Arno. La fiche d'un bien perdait alors sa dernière porte vers l'écran
   * plein, qui existe toujours et que ce bloc ne remplace pas en tout point (il est borné à un bien).
   *
   * ⚠️ FACULTATIVE : sans elle, le lien n'est pas rendu. La fiche ne la passe que si elle sait où mener.
   */
  onEcranComplet?: () => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LE VA-ET-VIENT AVEC LA CONVERSATION ════════════════════════════════
   *
   * `jeton` : la clé lue dans l'adresse. Non nulle ⇒ on REVIENT d'une conversation, et l'état complet est à
   * reprendre dans le `sessionStorage` de l'onglet.
   *
   * `onPoserJeton` : demande à l'écran parent d'écrire cette clé dans l'adresse, SANS empiler d'entrée
   * d'historique. C'est l'entrée qu'on quitte qui doit la porter — sinon « Précédent » ramènerait à la fiche
   * SANS son état, c'est-à-dire exactement le défaut qu'Arno a signalé.
   */
  jeton?: string | null;
  onPoserJeton?: (jeton: string) => void;
}) {
  /**
   * ══ 🔴🔴 L'ÉTAT REPRIS AU RETOUR, LU UNE FOIS, AVANT TOUT (lot HISTORIQUE-BIEN-3, point 4) ═══════════════════
   *
   * 🔴 LU DANS L'INITIALISEUR DE `useState`, ET NON DANS UN EFFET. Dans un effet, le bloc se serait affiché une
   * fraction de seconde avec les réglages PAR DÉFAUT, aurait lancé la requête correspondante, puis se serait
   * corrigé : deux requêtes, un clignotement, et un fil qui saute sous les yeux. Ici, le premier rendu est déjà
   * le bon.
   *
   * ⚠️ LA FICHE EST VÉRIFIÉE : un jeton qui désignerait l'état d'un AUTRE bien est écarté, pas appliqué — c'est
   * le genre de confusion qu'un copier-coller d'adresse produit tout seul.
   */
  const repris = useMemo((): EtatRetourBien | null => {
    if (jeton === null || typeof window === 'undefined') return null;
    try {
      const brut = window.sessionStorage.getItem(`${CLE_RETOUR_BIEN}${jeton}`);
      if (brut === null) return null;
      const e = etatRetourDepuisBrut(JSON.parse(brut));
      return e !== null && e.fiche === lotCle ? e : null;
    } catch { return null; }
  }, [jeton, lotCle]);

  const [reglages, setReglages] = useState<Reglages>(
    repris?.reglages
    ?? (evenementOuvertInitial ? { ...REGLAGES_DEFAUT, evenementOuvert: true } : REGLAGES_DEFAUT));
  /**
   * ⚠️ LA SAISIE ET LE RÉGLAGE SONT DEUX ÉTATS, ET IL LE FAUT. Le champ doit répondre à chaque lettre (sinon il
   * paraît cassé) ; la REQUÊTE, elle, n'part qu'après le silence. Les confondre aurait donné l'un ou l'autre
   * défaut : un champ qui saute, ou une requête par caractère.
   */
  const [saisie, setSaisie] = useState(repris?.reglages.texte ?? '');
  useEffect(() => {
    const t = setTimeout(
      () => setReglages((r) => (r.texte === saisie ? r : { ...r, texte: saisie })),
      saisie.trim() === '' ? 0 : ATTENTE_FRAPPE_MS);
    return () => clearTimeout(t);
  }, [saisie]);
  const [page, setPage] = useState(repris?.page ?? 0);
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [deplie, setDeplie] = useState<Set<number>>(new Set());
  const [evenements, setEvenements] = useState<EvenementDuBien[]>([]);
  /** Les événements n'ont pas pu être lus. On le DIT : une liste vide se lirait « ce bien n'en a jamais eu ». */
  const [evenementsIllisibles, setEvenementsIllisibles] = useState(false);

  /**
   * ⚠️ LE RÉSUMÉ DU HAUT EST **REPLIÉ**, CELUI DU BAS EST **OUVERT** (demande d'Arno). Celui du haut porte son
   * compte en toutes lettres SUR le bouton : « 📎 7 pièces » se lit sans un clic, et c'est tout l'intérêt du
   * repli — on sait s'il y a quelque chose à ouvrir avant de l'ouvrir.
   */
  /**
   * ══ 🔴🔴 UN SEUL ÉTAT POUR LES DEUX RÉSUMÉS (lot HISTORIQUE-BIEN-4, point 4) ═════════════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Le MÊME bouton est ajouté EN BAS du listing des mails : il ouvre et ferme le
   * même résumé (un seul état partagé). »
   *
   * 🔴 CE QUI CHANGE PAR RAPPORT AU LOT 1, et il faut le dire : le résumé du bas était ALORS toujours ouvert, et
   * celui du haut replié — c'était la demande d'Arno à l'époque. Un seul état les lie désormais : le bouton du
   * haut et celui du bas montrent et masquent la même chose. Deux états auraient fait deux vérités pour un même
   * contenu, et c'est le genre d'écran où l'on finit par ne plus savoir si l'on a déjà regardé.
   */
  const [resumeOuvert, setResumeOuvert] = useState(false);
  /** Le mail d'où l'on est parti, surligné BRIÈVEMENT au retour (demande d'Arno). */
  const [mailSurligne, setMailSurligne] = useState<number | null>(repris?.mail ?? null);

  /**
   * ══ 🔴 LE REPLI DES GROUPES : UN ENSEMBLE DE **BASCULES**, PAS D'ÉTATS ═══════════════════════════════════════
   *
   * Un groupe au-delà du seuil de `partieCategorie.ts` (6) s'ouvre REPLIÉ ; en dessous, il s'ouvre DÉPLIÉ. La
   * décision passe par `replierLesCartes`, jamais par une comparaison écrite ici.
   * Mémoriser « ouvert » aurait rendu impossible de REFERMER un petit groupe (il était ouvert par défaut, donc
   * déjà « dans l'ensemble » ou pas selon le défaut). On mémorise donc ce que la personne a BASCULÉ, et l'état
   * affiché est le défaut inversé — une seule règle, qui marche dans les deux sens.
   */
  const [bascules, setBascules] = useState<Set<CleGroupeParties>>(new Set());

  const [depots, setDepots] = useState<ReadonlyMap<number, DepotAffiche>>(new Map());
  const [emplacements, setEmplacements] =
    useState<ReadonlyMap<number, readonly EmplacementPiece[]>>(new Map());
  const [aRanger, setARanger] = useState<DemandeRangement | null>(null);
  const [aVoirDansLeDrive, setAVoirDansLeDrive] = useState<EmplacementPiece | null>(null);

  /**
   * ⚠️ TOUT CHANGEMENT DE RÉGLAGE REMET À LA PREMIÈRE PAGE. Sans cela, filtrer depuis la page 3 afficherait
   * « aucun résultat » sur un fil qui en a douze — et l'on croirait les réglages vides.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 1 — LE LISTING CHARGE LA **SÉLECTION**, ET NON 25 MAILS ═════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026), sur lot-47 : « propriétaire ET locataire cochés → le résumé ne montre que les
   * pièces du propriétaire ».
   *
   * ═══ 🔴 CE QUE J'AI MESURÉ, ET CE QUI N'ÉTAIT PAS LA CAUSE ════════════════════════════════════════════════════
   * Le résumé ne se trompait PAS. Mesuré à l'écran, dans les trois combinaisons, il valait exactement la somme
   * des trombones des mails affichés : propriétaire seul 15 = 15, locataire seul 10 = 10, les deux 13 = 13. Et il
   * lisait déjà la même liste que le listing — il n'y a jamais eu de second calcul.
   *
   * ═══ 🔴🔴 LA CAUSE : LA PAGE DE 25 ════════════════════════════════════════════════════════════════════════════
   * La sélection « propriétaire + locataire » compte **49 mails** ; le listing n'en chargeait que **25** — la
   * première page, du plus récent au plus ancien. Dans cette page il n'y avait que deux mails de la locataire, et
   * aucun des deux ne portait de pièce jointe : ses 10 pièces vivaient sur les pages suivantes. Le résumé disait
   * donc la vérité de la PAGE, pas celle de la SÉLECTION — et le même défaut frappait « Tous les mails du bien ».
   *
   * ═══ 🔴 LA CORRECTION, ET POURQUOI C'EST CELLE-LÀ ═════════════════════════════════════════════════════════════
   * Le listing demande désormais la SÉLECTION ENTIÈRE, jusqu'au plafond que la route s'est fixé
   * (`PAGE_HISTORIQUE_MAX`, 100). Trois choses tombent juste du même coup :
   *   · « les deux → les deux familles » (demande d'Arno) : les deux sont à l'écran, donc dans le résumé ;
   *   · « le résumé = la somme des trombones des mails affichés » (sa vérification) reste vrai AU CARACTÈRE ;
   *   · « le résumé et le listing calculés à partir de la MÊME sélection, pas de second calcul » : inchangé —
   *     le résumé lit `lignes`, comme avant. La correction ne touche QUE la taille demandée.
   * La pagination n'est pas retirée : elle reprend au-delà de 100 mails, et son libellé est le même.
   *
   * ⚠️ LE COÛT A ÉTÉ MESURÉ AVANT, et non supposé : sur le bien le plus fourni (cible 421, 325 mails), la route
   * rend 100 lignes en **27 à 34 ms** — contre 144 ms pour la première demande de 25. Charger la sélection ne
   * coûte donc rien de perceptible ; c'est la requête elle-même qui coûte, pas les lignes.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const parametres = reglagesEnParametres(reglages, page, PAGE_HISTORIQUE_MAX);
  const parametresSansPage = reglagesEnParametres({ ...reglages }, 0, PAGE_HISTORIQUE_MAX);
  useEffect(() => { setPage(0); }, [parametresSansPage]);

  // ── ① LES ÉVÉNEMENTS DU BIEN, UNE FOIS ────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/gestion/historique/evenements?cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; evenements?: EvenementDuBien[] };
        if (!vivant) return;
        setEvenements(d.evenements ?? []);
        setEvenementsIllisibles(d.etat !== 'ok');
      } catch {
        if (!vivant) return;
        setEvenements([]);
        setEvenementsIllisibles(true);
      }
    })();
    return () => { vivant = false; };
  }, [lotCle]);

  /**
   * ══ 🔴🔴 ①-bis LES CATÉGORIES RANGÉES EN BASE — C'EST ELLES QUI REMPLISSENT « INDÉPENDANT » ═══════════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « INDÉPENDANT : diagnostiqueurs, artisans, prestataires qui travaillent pour
   * nous sur de nombreux biens. Catégorie GLOBALE : un contact indépendant est rangé une fois pour tous les
   * biens, jamais rattaché à un bien en tant que tel. »
   *
   * 🔴 LA FICHE NE PEUT PAS LE SAVOIR, et c'est pour cela que cette lecture existe. Les propriétaires et les
   * occupants d'un bien se lisent sur la fiche ; « cette adresse travaille pour nous sur quarante biens » ne se
   * lit que dans `gestion_partie_categorie` (migration 304). Sans cette lecture, le groupe « Indépendant »
   * restait vide et les **65 indépendants proposés** par la reprise retombaient tous dans « À répartir » —
   * autrement dit le travail de la reprise ne se voyait nulle part.
   *
   * ⚠️ DEMANDÉE UNE FOIS PAR BIEN, jamais à chaque case cochée : une catégorie ne change pas quand on filtre.
   *
   * ⚠️ EN ÉCHEC, ON NE CASSE RIEN : la carte reste vide, et les groupes retombent sur ce que la fiche sait —
   * c'est-à-dire exactement le comportement d'avant cette lecture. Un bloc qui refuserait de s'afficher parce
   * qu'une lecture d'appoint a échoué serait pire que trois groupes sur quatre.
   */
  const [categoriesRangees, setCategoriesRangees] =
    useState<ReadonlyMap<string, CategoriePartie>>(new Map());
  /**
   * 🔴 LES CARTES PORTENT LEUR ADRESSE depuis le lot HISTORIQUE-BIEN-3, et il la fallait : le « + » cerclé ne
   * s'affiche que sur une partie qui N'A PAS encore de carte, ce qui demande de savoir lesquelles en ont une.
   */
  const [cartesContact, setCartesContact] =
    useState<{ cote: string; adresse: string; verifie: boolean }[]>([]);
  /**
   * ══ 🔴🔴 CE QUE LA RÈGLE À TROIS ÉTAGES A **PROPOSÉ**, Y COMPRIS « non affectée » ══════════════════════════════
   *
   * DEMANDE D'ARNO (04/10/2026) : « La catégorie est PRÉ-REMPLIE quand elle a été déduite (règle à trois étages),
   * et reste modifiable. »
   *
   * 🔴 POURQUOI UNE SECONDE CARTE, ET NON `categoriesRangees`. Celle-là ne garde que les trois catégories
   * RETENUES, parce que c'est tout ce dont les groupes ont besoin. La carte de création, elle, a besoin de la
   * PROPOSITION même quand elle vaut « non affectée » — et surtout de savoir qu'il n'y en a aucune, pour laisser
   * le choix vide plutôt que de pré-cocher « Propriétaire » par défaut. Pré-remplir au hasard est pire que ne
   * rien pré-remplir : on valide sans lire.
   */
  const [proposees, setProposees] = useState<ReadonlyMap<string, Categorie>>(new Map());
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE NOM ET LE TÉLÉPHONE À PRÉ-REMPLIR ═══════════════════════════════
   *
   * DEMANDE D'ARNO : la carte du « + » « est pré-remplie : nom, adresse, téléphone trouvé en signature ».
   *
   * 🔴 ILS ARRIVENT AVEC LA LISTE DES PARTIES, EN UN SEUL APPEL, et c'est volontaire deux fois : le « + » n'a
   * rien à demander au moment du clic (il ouvre la carte instantanément), et aucune adresse personnelle ne
   * voyage dans une chaîne de requête — ce que ce dépôt refuse partout.
   *
   * ⚠️ VIDE EN CAS D'ÉCHEC : la carte s'ouvre alors avec la seule adresse, comme avant ce lot. Un
   * pré-remplissage manquant n'empêche personne de saisir.
   */
  const [coordonnees, setCoordonnees] =
    useState<ReadonlyMap<string, { nom: string | null; telephone: string | null }>>(new Map());

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LE BLOC DU BAS S'ABONNE AU SIGNAL, LUI AUSSI ═════════════════════════════════
   *
   * DEMANDE D'ARNO : « SYNCHRONISATION TOTALE […] que ce soit depuis le haut ou depuis le bas, met à jour l'autre
   * endroit en direct. »
   *
   * 🔴 LES DEUX SENS, ET C'EST LE MOT « TOTALE » QUI L'EXIGE. Ce bloc ANNONCE après chacune de ses écritures (le
   * « + », un glisser, une annulation) pour réveiller les carrousels du haut ; et il ÉCOUTE, pour que vérifier,
   * modifier ou retirer une carte DEPUIS LE HAUT change ses capsules et ses pastilles sans rechargement.
   */
  /** Relire les rangements. Appelée au montage ET après une création : la partie doit changer de groupe en direct. */
  const relireParties = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(
        `/api/admin/gestion/historique/parties?cible=lot-${encodeURIComponent(lotCle)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string;
        data?: {
          parties?: { adresse: string; categorie: string | null }[];
          cartes?: { cote: string; adresse: string; verifie: boolean }[];
          /* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — ce que la carte du « + » pré-remplit. */
          coordonnees?: { adresse: string; nom: string | null; telephone: string | null }[];
        };
      };
      const m = new Map<string, CategoriePartie>();
      const prop = new Map<string, Categorie>();
      for (const x of d.data?.parties ?? []) {
        const cle = x.adresse.trim().toLowerCase();
        if (x.categorie === 'proprietaire' || x.categorie === 'locataire' || x.categorie === 'independant') {
          /* ⚠️ « non affectée » N'EST PAS UN GROUPE DE PARTIE : c'est l'absence de rangement, et le module pur
             l'exprime en ne connaissant pas l'adresse. On ne la pose donc pas dans la carte des groupes. */
          m.set(cle, x.categorie);
          prop.set(cle, x.categorie);
        } else if (x.categorie === 'a_repartir') {
          prop.set(cle, 'a_repartir');
        }
      }
      setCategoriesRangees(m);
      setProposees(prop);
      setCartesContact(d.data?.cartes ?? []);
      const co = new Map<string, { nom: string | null; telephone: string | null }>();
      for (const c of d.data?.coordonnees ?? []) {
        co.set(c.adresse.trim().toLowerCase(), { nom: c.nom, telephone: c.telephone });
      }
      setCoordonnees(co);
    } catch {
      setCategoriesRangees(new Map());
      setProposees(new Map());
      setCartesContact([]);
      setCoordonnees(new Map());
    }
  }, [lotCle]);
  useEffect(() => { void relireParties(); }, [relireParties]);
  /**
   * 🔴 L'ÉCOUTE : un geste fait DANS UN CARROUSEL DU HAUT met ce bloc à jour, sans que l'un connaisse l'autre.
   *
   * ⚠️ ON N'ÉCOUTE PAS SES PROPRES ANNONCES. Ce bloc est à la fois émetteur et auditeur : sans ce garde, il
   * relirait DEUX FOIS après chacune de ses écritures — une fois parce qu'il vient d'écrire, une fois parce
   * qu'il s'entend. Mesuré par deux épreuves qui comptent les lectures : elles en attendaient deux, elles en
   * voyaient trois.
   */
  const monEcoute = useRef<((s: SignalCartesContact) => void) | null>(null);
  useEffect(() => {
    const f = (sig: SignalCartesContact): void => {
      if (concerneCeBien(sig, lotCle)) void relireParties();
    };
    monEcoute.current = f;
    return ecouterCartesContact(f);
  }, [lotCle, relireParties]);

  // ── ② LE FIL ──────────────────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivant = true;
    /* ⚠️ ON NE RETOMBE PAS SUR « chargement » QUAND ON A DÉJÀ UNE LISTE : le fil clignoterait à chaque case
       cochée, et la page sauterait sous le curseur. Même règle que « Vie du bien ». */
    setEtat((e) => (e.v === 'ok' ? e : { v: 'charge' }));
    void (async () => {
      try {
        const sep = parametres === '' ? '?' : '&';
        const res = await fetch(
          `/api/admin/gestion/historique${parametres}${sep}cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string;
          data?: {
            lignes?: LigneHistorique[]; suite?: boolean; entete?: { nbMails?: number };
            interlocuteurs?: Interlocuteur[]; interlocuteursTronques?: boolean;
          };
        };
        if (!vivant) return;
        if (d.etat !== 'ok') {
          setEtat({ v: 'erreur', message: 'L’historique de ce bien n’a pas pu être lu.' });
          return;
        }
        setEtat({
          v: 'ok',
          lignes: d.data?.lignes ?? [],
          suite: d.data?.suite === true,
          total: d.data?.entete?.nbMails ?? 0,
          interlocuteurs: d.data?.interlocuteurs ?? [],
          tronques: d.data?.interlocuteursTronques === true,
        });
      } catch {
        if (vivant) {
          setEtat({
            v: 'erreur', message: 'L’historique de ce bien n’a pas pu être lu : le serveur n’a pas répondu.',
          });
        }
      }
    })();
    return () => { vivant = false; };
  }, [lotCle, parametres]);

  // ── ③ LE FIL, LES PIÈCES, LE RÉSUMÉ ───────────────────────────────────────────────────────────────────────────
  /** La page REÇUE, triée. C'est le dénominateur du « N mails sur M » : la sélection déjà affichée. */
  const lignesPage = useMemo(
    () => (etat.v === 'ok' ? trierFil(etat.lignes, reglages.ordre) : []),
    [etat, reglages.ordre]);

  /**
   * ══ 🔴🔴 LA RECHERCHE EST UN FILTRE DE L'ÉCRAN (lot HISTORIQUE-BIEN-3, point 5) ══════════════════════════════
   *
   * DEMANDE D'ARNO : « La RECHERCHE filtre par mots-clés UNIQUEMENT dans la sélection déjà affichée (période +
   * parties + options) : objet, texte, nom de l'expéditeur, nom des pièces. »
   *
   * 🔴 ELLE S'APPLIQUE APRÈS LE TRI ET AVANT TOUT LE RESTE — le résumé des pièces, le regroupement par
   * conversation et le compteur lisent donc tous `lignes`, c'est-à-dire ce qui est RÉELLEMENT à l'écran. Si le
   * résumé avait lu la page entière, il aurait annoncé des pièces qu'aucun mail visible ne porte.
   */
  const motsCherches = useMemo(() => motsRecherches(reglages.texte), [reglages.texte]);
  const lignes = useMemo(
    () => filtrerParMots(lignesPage, reglages.texte), [lignesPage, reglages.texte]);

  /**
   * 🔴 LE TRI DES PIÈCES « PAR DATE ET PAR EXPÉDITEUR » N'EST PAS RÉÉCRIT ICI : il vit dans
   * `piecesConversation.ts`, qui alimente déjà le récapitulatif d'une conversation. On lui donne les mails de la
   * page sous la forme qu'il attend (`messagesDuFil`), et il rend la liste classée, dédoublonnée et groupée.
   *
   * ⚠️ LES DEUX RÉSUMÉS (HAUT ET BAS) LISENT **LE MÊME** CALCUL. Deux appels auraient pu diverger d'un ordre, et
   * l'on aurait lu « 7 pièces » en haut et compté neuf cartes en bas — le défaut exact que ce module pur avait été
   * écrit pour fermer.
   */
  const recap = useMemo(() => {
    const classees = piecesDeLaConversation(messagesDuFil(lignes), reglages.ordre);
    return dedoublonnerPieces(classees);
  }, [lignes, reglages.ordre]);
  const groupesPieces = useMemo(() => grouperParMessage(recap.pieces), [recap.pieces]);
  const conversations = useMemo(() => grouperParConversation(lignes), [lignes]);

  /**
   * ⚠️ « TOUT REMETTRE À PLAT » EFFACE AUSSI LA SAISIE, et c'est précisément ce qu'un oubli aurait laissé derrière
   * (lot HISTORIQUE-BIEN-2). `reglages.texte` revient à vide par `REGLAGES_DEFAUT` ; sans la ligne ci-dessous, le
   * CHAMP garderait les lettres tapées — puis l'effet de silence les repousserait aussitôt dans les réglages, et
   * le bouton n'aurait eu l'air de rien faire. Écrit une fois, appelé aux deux endroits qui l'offrent.
   */
  const remettreAPlat = useCallback((): void => {
    setReglages(REGLAGES_DEFAUT);
    setBascules(new Set());
    setSaisie('');
  }, []);

  /** Déplier ou replier un mail. Écrit une fois : les deux montages du fil (groupé ou non) s'en servent. */
  const basculerMail = useCallback((messageId: number): void => setDeplie((s) => {
    const n = new Set(s);
    if (n.has(messageId)) n.delete(messageId); else n.add(messageId);
    return n;
  }), []);

  /** Par mail, le fil d'où il vient — la fenêtre « Ranger » en a besoin, et le fil change d'un mail à l'autre. */
  const filDuMessage = useMemo(
    () => new Map(lignes.map((l) => [l.messageId, l.filId])), [lignes]);

  // ── ④ CE QUI EST DÉJÀ DANS LE DRIVE, EN UNE SEULE REQUÊTE POUR TOUTE LA PAGE ───────────────────────────────────
  /**
   * ⚠️ LES IDENTIFIANTS SONT TRIÉS, ET CE N'EST PAS DE LA COQUETTERIE : sans tri, ils suivent l'ordre
   * D'AFFICHAGE, donc inverser le fil changerait l'adresse demandée — et relancerait une requête pour obtenir
   * exactement la même réponse. L'adresse ne doit dépendre que de l'ENSEMBLE des pièces, pas de leur ordre.
   */
  const idsPieces = useMemo(
    () => [...new Set(lignes.flatMap((l) => l.pieces.map((p) => p.pieceId)))]
      .sort((a, b) => a - b).join(','),
    [lignes]);
  const relireDrive = useCallback(async (): Promise<void> => {
    if (idsPieces === '') { setDepots(new Map()); setEmplacements(new Map()); return; }
    try {
      const res = await fetch(`/api/admin/gestion/pieces-drive?pieces=${idsPieces}`, { cache: 'no-store' });
      const d = (await res.json()) as { depots?: DepotAffiche[]; emplacements?: StatutPieceDrive[] };
      setDepots(new Map((d.depots ?? []).map((x) => [x.pieceId, x])));
      setEmplacements(new Map((d.emplacements ?? []).map((x) => [x.pieceId, x.emplacements])));
    } catch {
      // Silence volontaire : on perd la mention « Dans le Drive » et le picto, jamais la liste des pièces.
      setDepots(new Map());
      setEmplacements(new Map());
    }
  }, [idsPieces]);
  useEffect(() => { void relireDrive(); }, [relireDrive]);

  // ── ⑤ LES PARTIES, EN QUATRE GROUPES ──────────────────────────────────────────────────────────────────────────
  const interlocuteurs = etat.v === 'ok' ? etat.interlocuteurs : [];
  /**
   * 🔴🔴 LA FUSION DES DEUX PROVENANCES, ET SON ORDRE EST LA RÈGLE.
   *
   * La fiche dit qui sont les **clients** (ses propriétaires, ses occupants d'hier et d'aujourd'hui) : ça, elle
   * seule le sait, et ça ne se discute pas. La base dit où ont été rangés les **tiers** — syndic, artisan,
   * assureur, et les indépendants.
   *
   * ⚠️ LA FICHE PASSE EN PREMIER ET N'EST JAMAIS RECOUVERTE : un contact n'est pas un client (décision d'Arno), et
   * la réciproque compte autant — **un client ne doit jamais pouvoir être rangé ailleurs par une ligne de
   * catégorie**. Si l'adresse d'un propriétaire se retrouvait un jour dans la table, elle resterait propriétaire
   * ici. La reprise ne pose d'ailleurs aucune ligne sur une adresse que l'annuaire reconnaît : ce garde protège
   * donc d'un futur, pas d'un présent.
   */
  const categoriesFusionnees = useMemo(() => {
    const m = new Map<string, CategoriePartie>(categoriesRangees);
    for (const [adresse, c] of categories) m.set(adresse, c);
    return m as ReadonlyMap<string, CategoriePartie>;
  }, [categories, categoriesRangees]);

  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES CLIENTS DE LA FICHE COMPLÈTENT LA LISTE AVANT LE RANGEMENT.
   *
   * ⚠️ AVANT `grouperParCategorie`, ET NON APRÈS : ainsi un client ajouté passe par la MÊME règle de rangement
   * que tout le monde (la fusion des catégories, où la fiche l'emporte), et atterrit dans son encart sans qu'on
   * ait à le poser à la main. Le poser après aurait fait un second juge du groupe d'une personne.
   */
  const interlocuteursEtClients = useMemo(
    () => completerAvecLesClients(interlocuteurs, clients), [interlocuteurs, clients]);

  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — LES ADRESSES CLIENTES, POUR QU'UNE DES NÔTRES NE SOIT PAS ÉCARTÉE.
   * Décision d'Arno : le propriétaire client de lot-299 garde sa capsule même en `@sansvisavis.com`.
   */
  const adressesClientes = useMemo(() => {
    const e = new Set<string>();
    for (const c of clients) {
      const a = (c.adresse ?? '').trim().toLowerCase();
      if (a !== '') e.add(a);
    }
    return e as ReadonlySet<string>;
  }, [clients]);

  const parties = useMemo(
    () => grouperParCategorie(interlocuteursEtClients, categoriesFusionnees, adressesClientes),
    [interlocuteursEtClients, categoriesFusionnees, adressesClientes]);

  /** La fiche d'annuaire de chaque client, pour le lien « adresse à corriger ». */
  const fichesClientes = useMemo(() => {
    const m = new Map<string, { sorte: 'proprietaire' | 'locataire'; id: number }>();
    for (const c of clients) {
      const a = (c.adresse ?? '').trim().toLowerCase();
      if (a !== '' && c.fiche != null && !m.has(a)) m.set(a, c.fiche);
    }
    return m as ReadonlyMap<string, { sorte: 'proprietaire' | 'locataire'; id: number }>;
  }, [clients]);

  /**
   * ══ 🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » — CALCULÉE UNE FOIS ═══════════════════════════════════════════
   *
   * `null` quand le logement n'a aucun locataire connu : c'est CE `null` qui grise le bouton et qui écrit son
   * motif. La règle — qui est « le dernier », et quelles bornes son bail donne — vit dans le module pur, parce
   * que c'est exactement le verdict qui a déjà été fait mentir une fois par une maquette.
   */
  const periodeLocataire = useMemo(
    () => periodeDuDernierLocataire(occupations, maintenant), [occupations, maintenant]);

  const evenementOuvert = evenements.find((e) => e.ouvert) ?? null;

  /** Cocher ou décocher une personne. Les cases restent montées : le focus ne quitte pas celle qu'on vient de cliquer. */
  const basculerPartie = (adresse: string): void => setReglages((r) => {
    const a = adresse.trim().toLowerCase();
    const dedans = r.parties.includes(a);
    return { ...r, parties: dedans ? r.parties.filter((x) => x !== a) : [...r.parties, a] };
  });

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 2 — LE GLISSER-DÉPOSER, ET SA SYNCHRONISATION STRICTE
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Quelle adresse est en train d'être glissée, et d'où elle part. `null` = aucun glisser en cours. */
  const [glisse, setGlisse] = useState<{ adresse: string; depuis: CleGroupeParties } | null>(null);
  /** Quelle zone de dépôt est survolée : c'est elle qui se surligne, et c'est elle qui s'ouvre si elle est repliée. */
  const [survol, setSurvol] = useState<CleGroupeParties | null>(null);
  /** Quelle capsule a son menu « Déplacer vers… » ouvert (le chemin clavier). */
  const [menu, setMenu] = useState<string | null>(null);
  /** Le dernier déplacement, derrière lequel « Annuler » reste offert quelques secondes. */
  const [dernierGeste, setDernierGeste] = useState<{ mot: string; geste: unknown } | null>(null);
  const [annulationEnCours, setAnnulationEnCours] = useState(false);
  const [refusDeplacement, setRefusDeplacement] = useState<string | null>(null);

  /**
   * ⚠️ LE MESSAGE S'EFFACE TOUT SEUL, et la minuterie est remise à zéro à chaque nouveau déplacement. Sans
   * remise à zéro, deux déplacements rapprochés auraient fait disparaître le second message à l'heure du
   * premier — donc retiré « Annuler » avant qu'on ait pu le lire.
   */
  useEffect(() => {
    if (dernierGeste === null) return undefined;
    const t = setTimeout(() => setDernierGeste(null), SECONDES_ANNULER_DEPLACEMENT * 1000);
    return () => clearTimeout(t);
  }, [dernierGeste]);

  /**
   * ══ 🔴🔴 QUITTER VERS LA CONVERSATION — EN POSANT DE QUOI REVENIR (lot HISTORIQUE-BIEN-3, point 4) ═══════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DEMANDE D'ARNO : « Le bouton RETOUR du navigateur, et un bouton “← Retour à l'historique du bien” dans la
   * conversation, ramènent EXACTEMENT au même état : même fiche, même période, mêmes parties cochées, mêmes
   * options, même texte de recherche, même position de défilement, et le mail d'où l'on est parti surligné
   * brièvement. »
   *
   * 🔴 L'ORDRE DES DEUX GESTES EST TOUT LE MÉCANISME. On RANGE l'état et on POSE le jeton dans l'adresse
   * COURANTE — celle de la fiche — AVANT de naviguer. L'entrée d'historique qu'on quitte porte alors le jeton, et
   * « Précédent » y revient avec de quoi tout retrouver. Poser le jeton après aurait écrit sur l'adresse de la
   * CONVERSATION : le retour serait revenu à une fiche nue, c'est-à-dire au défaut qu'Arno signale.
   *
   * 🔴 LE DÉFILEMENT EST LU AU DERNIER MOMENT, et celui de la PAGE, pas du bloc : c'est la page qui défile quand
   * on lit un fil. Le lire plus tôt (à chaque rendu, par exemple) aurait rangé une position périmée.
   *
   * ⚠️ UNE CLÉ ALÉATOIRE PAR DÉPART. Réutiliser une clé fixe aurait fait qu'un second aller-retour écrase l'état
   * du premier — et le « Précédent » profond serait revenu sur un écran qui n'était pas le sien.
   *
   * ⚠️ `sessionStorage` PEUT REFUSER (navigation privée, quota, données de site bloquées) : on NE casse rien. Le
   * mail s'ouvre quand même, et le retour retombe sur le comportement d'avant ce lot.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const ouvrirLaConversation = useCallback((filId: number, messageId?: number | null): void => {
    if (typeof window !== 'undefined' && onPoserJeton !== undefined) {
      try {
        const cle = (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
          .replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
        const etatRetour: EtatRetourBien = {
          fiche: lotCle,
          reglages,
          defile: Math.round(window.scrollY),
          mail: messageId ?? null,
          page,
        };
        window.sessionStorage.setItem(`${CLE_RETOUR_BIEN}${cle}`, JSON.stringify(etatRetour));
        onPoserJeton(cle);
      } catch {
        /* Silence volontaire : on perd le retour exact, jamais l'ouverture du mail. */
      }
    }
    onOuvrirFil?.(filId, messageId);
  }, [lotCle, onOuvrirFil, onPoserJeton, page, reglages]);

  /**
   * ══ 🔴 AU RETOUR : LE DÉFILEMENT, PUIS LE SURLIGNAGE QUI S'EFFACE ════════════════════════════════════════════
   *
   * ⚠️ LE DÉFILEMENT ATTEND QUE LE FIL SOIT LÀ. Restaurer la position avant que les mails soient rendus aurait
   * fait défiler une page encore courte — on serait retombé en bas, ou nulle part. On attend donc le premier
   * rendu `ok` du fil.
   */
  const defileRepris = useRef(false);
  useEffect(() => {
    if (repris === null || defileRepris.current || etat.v !== 'ok' || typeof window === 'undefined') return;
    defileRepris.current = true;
    window.scrollTo({ top: repris.defile });
  }, [repris, etat.v]);

  useEffect(() => {
    if (mailSurligne === null) return undefined;
    const t = setTimeout(() => setMailSurligne(null), MS_SURLIGNE_RETOUR);
    return () => clearTimeout(t);
  }, [mailSurligne]);

  /**
   * Régler la période sur le bail d'un locataire, depuis sa capsule. 🔴 C'est le geste du lot 1 — choisir la
   * période d'un ancien locataire — à l'endroit où Arno place désormais cette date : dans la capsule.
   */
  const reglerPeriodeSurLeBail = useCallback((b: PeriodePartie): void => {
    setReglages((r) => ({ ...r, periode: { sorte: 'dates', du: b.du, au: b.au } }));
  }, []);

  /**
   * ══ 🔴🔴 QUELLES ADRESSES ONT DÉJÀ UNE CARTE, ET DE QUEL CÔTÉ (lot HISTORIQUE-BIEN-3, point 3) ═══════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « En face de chaque capsule de contact Propriétaire ou Locataire qui N'A PAS
   * encore de carte de contact : un “+” rouge dans un cercle rouge. […] Le “+” disparaît dès que la carte
   * existe. »
   *
   * 🔴 LE CÔTÉ COMPTE, PAS SEULEMENT L'ADRESSE. Une même personne peut être contact du propriétaire sur un bien
   * et du locataire sur un autre ; et sur CE bien, avoir une carte côté propriétaire ne dispense pas d'en avoir
   * une côté locataire si elle y est rangée. La clé de la table est (bien, côté, adresse) : la carte des cartes
   * doit l'être aussi, sinon le « + » disparaîtrait à tort.
   */
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LA CARTE PORTE DÉSORMAIS SON ÉTAT DE VÉRIFICATION, et non plus seulement
   * sa présence. Demande d'Arno : « Si la carte est encore “à vérifier” (trame orange), l'icône est orange. » La
   * donnée était déjà là (`cartesContact[].verifie`) ; c'est l'index qui la jetait.
   *
   * ⚠️ `false` L'EMPORTE SUR `true` POUR UN MÊME CÔTÉ — cas théorique (la table a une clé unique par bien, côté et
   * adresse), écrit par prudence : c'est le geste qui RESTE à faire qui doit se voir.
   */
  const cartesParAdresse = useMemo(() => {
    const m = new Map<string, Map<string, boolean>>();
    for (const c of cartesContact) {
      const cle = c.adresse.trim().toLowerCase();
      const s0 = m.get(cle) ?? new Map<string, boolean>();
      s0.set(c.cote, (s0.get(c.cote) ?? true) && c.verifie);
      m.set(cle, s0);
    }
    return m as ReadonlyMap<string, ReadonlyMap<string, boolean>>;
  }, [cartesContact]);

  /** Déplier ou replier un groupe. Écrit une fois : les encarts et les bandes s'en servent. */
  const basculerRepli = useCallback((cle: CleGroupeParties): void => setBascules((s0) => {
    const n = new Set(s0);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  }), []);

  /**
   * ══ 🔴🔴 DÉPLACER UNE PARTIE — PAR LA MÊME PORTE QUE LE « + », ET PAR AUCUNE AUTRE ════════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « SYNCHRONISATION STRICTE : un déplacement passe par la MÊME porte d'écriture
   * que le choix de catégorie du “+” (aucun second chemin). La carte de contact suit la catégorie : créée,
   * déplacée ou retirée (statut 'retire', jamais supprimée) côté propriétaire / locataire. Toutes les vues
   * ouvertes se mettent à jour en direct. Un contact déplacé à la main n'est plus jamais reclassé par
   * l'automatisation (le choix manuel prime). »
   *
   * 🔴 UNE SEULE REQUÊTE, LA MÊME QUE « VALIDER ». Le déplacement n'envoie ni nom ni téléphone : la carte, si
   * elle existe, emporte les siens (c'est le serveur qui les reporte). Écrire ici un second appel — « pose la
   * catégorie » puis « déplace la carte » — aurait fait deux chemins, et le jour où l'un change, l'autre mentirait.
   *
   * 🔴 ON RELIT APRÈS, PLUTÔT QUE DE DEVINER. C'est la relecture qui fait changer la capsule de groupe, et c'est
   * elle qui garantit que l'écran montre l'état RÉEL — y compris quand le serveur n'a fait qu'une partie du geste
   * (la catégorie sans la carte, par exemple).
   *
   * ⚠️ « LE CHOIX MANUEL PRIME » N'EST PAS TENU ICI : il est tenu par `poserCategorieAlaMain`, qui écrit
   * `origine = 'manuel'`, et par `categorieRetenue`, qui fait passer le manuel devant la proposition. L'écran
   * n'a rien à ajouter — et c'est pour cela qu'il ne peut pas l'oublier.
   */
  const deplacer = useCallback(async (
    adresse: string, vers: CleGroupeParties, nomLisible: string, titreCible: string,
  ): Promise<void> => {
    setGlisse(null);
    setSurvol(null);
    setMenu(null);
    setRefusDeplacement(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cible: `lot-${lotCle}`, adresse, categorie: vers }),
      });
      const d = (await res.json()) as { etat?: string; motif?: string; geste?: unknown };
      if (d.etat !== 'ok') {
        setRefusDeplacement(d.motif ?? 'Le déplacement n’a pas pu être enregistré.');
        return;
      }
      await relireParties();
      /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — on prévient les carrousels du haut : la synchronisation va dans les deux
         sens. Le tour est gardé pour ne pas s'entendre soi-même (voir l'encadré de l'écoute). */
      annoncerCartesContact(lotCle, { sauf: monEcoute.current ?? undefined });
      setDernierGeste({ mot: motDeplacement(nomLisible, titreCible), geste: d.geste ?? null });
    } catch {
      setRefusDeplacement('Le déplacement n’a pas pu être enregistré : le serveur n’a pas répondu.');
    }
  }, [lotCle, relireParties]);

  /**
   * ══ 🔴🔴 « ANNULER » DÉFAIT LE GESTE PAR SES IDENTIFIANTS ════════════════════════════════════════════════════
   *
   * 🔴 ET NON EN REPOSANT LA CATÉGORIE D'AVANT. Reposer aurait écrit une ligne `manuel` là où il n'y avait qu'une
   * PROPOSITION — donc gelé cette proposition en décision humaine, que l'automatisation ne reprendrait plus
   * jamais. C'est l'inverse de ce qu'« Annuler » promet. Le serveur retire ce qu'il a posé et ROUVRE ce qu'il
   * avait retiré : voir l'encadré d'`annulerGesteDeRangement`.
   */
  const annulerDeplacement = useCallback(async (): Promise<void> => {
    if (dernierGeste === null) return;
    setAnnulationEnCours(true);
    setRefusDeplacement(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler', geste: dernierGeste.geste }),
      });
      const d = (await res.json()) as { etat?: string; motif?: string };
      if (d.etat !== 'ok') {
        setRefusDeplacement(d.motif ?? 'L’annulation n’a pas pu être enregistrée.');
        return;
      }
      setDernierGeste(null);
      await relireParties();
      /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — on prévient les carrousels du haut : la synchronisation va dans les deux
         sens. Le tour est gardé pour ne pas s'entendre soi-même (voir l'encadré de l'écoute). */
      annoncerCartesContact(lotCle, { sauf: monEcoute.current ?? undefined });
    } catch {
      setRefusDeplacement('L’annulation n’a pas pu être enregistrée : le serveur n’a pas répondu.');
    } finally {
      setAnnulationEnCours(false);
    }
  }, [dernierGeste, relireParties]);

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LE « + » — RANGER UNE PARTIE NON AFFECTÉE, ET LUI FAIRE UNE CARTE DE CONTACT
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * DEMANDE D'ARNO (04/10/2026) : « Pour chaque partie NON encore affectée à une catégorie : un bouton “+” qui
   * ouvre une petite carte de création de contact (nom, adresse mail pré-remplie, téléphone, et un choix de
   * catégorie Propriétaire / Locataire / Tiers indépendant). La catégorie est PRÉ-REMPLIE quand elle a été
   * déduite (règle à trois étages), et reste modifiable. Valider range la partie dans le bon groupe en direct. »
   *
   * ⚠️ `categorie` PEUT ÊTRE VIDE, et le formulaire refuse alors d'être validé. Pré-cocher « Propriétaire » par
   * défaut aurait fait ranger des gens dans une catégorie fausse d'un clic distrait — et un rangement manuel
   * PRIME sur tout le reste, donc il ne se corrige pas tout seul à la passe suivante.
   */
  const [aCreer, setACreer] = useState<{
    adresse: string; categorie: Categorie | ''; nom: string; telephone: string;
  } | null>(null);
  const [refusCreation, setRefusCreation] = useState<string | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);

  const ouvrirCreation = useCallback((adresse: string, imposee?: CleGroupeParties): void => {
    const cle = adresse.trim().toLowerCase();
    const deduite = proposees.get(cle);
    /**
     * 🔴🔴 LA CATÉGORIE DU GROUPE D'OÙ L'ON CLIQUE L'EMPORTE (lot HISTORIQUE-BIEN-3, point 3). Arno : « Il ouvre
     * la carte de création avec la catégorie pré-remplie. » Le « + » cerclé vit en face d'une capsule DÉJÀ
     * rangée : on sait où elle est, et la redemander serait une question dont l'écran connaît la réponse.
     *
     * ⚠️ `a_repartir` N'EST PAS UNE DÉDUCTION, ni imposée ni proposée : c'est le constat qu'on n'a pas su
     * trancher. Le choix reste alors VIDE — pré-cocher « Propriétaire » au hasard se valide sans être lu.
     */
    const choisie = imposee ?? deduite;
    setRefusCreation(null);
    /**
     * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LE NOM ET LE TÉLÉPHONE SONT PRÉ-REMPLIS (demande d'Arno). Le nom
     * vient du « Nom <adresse> » le plus fréquent de ses mails ; le téléphone, de la signature du plus récent
     * qui en porte un. MESURÉ : 83 % des contacts qui ont écrit ont un numéro trouvable ainsi.
     *
     * ⚠️ UNE PROPOSITION, PAS UNE VÉRITÉ : les deux champs restent modifiables, et c'est l'humain qui valide.
     * La carte créée est d'ailleurs marquée « à vérifier » tant que personne ne l'a regardée.
     */
    const trouve = coordonnees.get(cle);
    setACreer({
      adresse,
      categorie: choisie === undefined || choisie === 'a_repartir' ? '' : choisie,
      nom: trouve?.nom ?? '',
      telephone: trouve?.telephone ?? '',
    });
  }, [proposees, coordonnees]);

  /**
   * ══ 🔴 VALIDER : LE RANGEMENT, PUIS LA CARTE — ET LA RELECTURE QUI FAIT CHANGER DE GROUPE ═══════════════════
   *
   * ⚠️ UNE SEULE PORTE D'ÉCRITURE, ET C'EST LE SERVEUR QUI DÉCIDE. L'écran n'écrit pas en base : il POSTE, et il
   * affiche le refus tel quel. Les règles (un contact du propriétaire se range toujours sur un bien, un
   * indépendant est global, l'auteur doit être identifié) vivent dans `partieCategorieRepo`, qui les tenait déjà
   * pour la reprise — en réécrire une ici aurait fait deux juges pour un même rangement.
   *
   * ⚠️ ON RELIT APRÈS, PLUTÔT QUE DE DEVINER LE NOUVEL ÉTAT. Poser la catégorie « à la main » dans l'état local
   * aurait affiché un rangement que le serveur a peut-être refusé en partie (la carte sans la catégorie, par
   * exemple) — et l'écran aurait menti jusqu'au rechargement.
   */
  const enregistrerCreation = useCallback(async (): Promise<void> => {
    if (aCreer === null || aCreer.categorie === '') return;
    setCreationEnCours(true);
    setRefusCreation(null);
    try {
      const res = await fetch('/api/admin/gestion/historique/parties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cible: `lot-${lotCle}`,
          adresse: aCreer.adresse,
          categorie: aCreer.categorie,
          nom: aCreer.nom.trim() === '' ? null : aCreer.nom.trim(),
          telephone: aCreer.telephone.trim() === '' ? null : aCreer.telephone.trim(),
        }),
      });
      const d = (await res.json()) as { etat?: string; motif?: string };
      if (d.etat !== 'ok') {
        setRefusCreation(d.motif ?? 'Le rangement n’a pas pu être enregistré.');
        return;
      }
      setACreer(null);
      await relireParties();
      /* 🔴🔴 LOT HISTORIQUE-BIEN-7 — on prévient les carrousels du haut : la synchronisation va dans les deux
         sens. Le tour est gardé pour ne pas s'entendre soi-même (voir l'encadré de l'écoute). */
      annoncerCartesContact(lotCle, { sauf: monEcoute.current ?? undefined });
    } catch {
      setRefusCreation('Le rangement n’a pas pu être enregistré : le serveur n’a pas répondu.');
    } finally {
      setCreationEnCours(false);
    }
  }, [aCreer, lotCle, relireParties]);

  /** Tout un groupe d'un geste. Déjà tout coché ⇒ on décoche : un bouton qui ne fait qu'ajouter se bloque vite. */
  const basculerGroupe = (adresses: readonly string[]): void => setReglages((r) => {
    const toutes = adresses.map((a) => a.trim().toLowerCase());
    const tout = toutes.length > 0 && toutes.every((a) => r.parties.includes(a));
    return {
      ...r,
      parties: tout
        ? r.parties.filter((a) => !toutes.includes(a))
        : [...new Set([...r.parties, ...toutes])],
    };
  });

  /**
   * ══ 🔴 LES GESTES D'UNE MINIATURE, DANS LA FICHE ═══════════════════════════════════════════════════════════════
   *
   * 🔴 « RANGER » ET LE PICTO DRIVE OUVRENT **LA** FENÊTRE DRIVE, celle de l'application, dans ses deux modes
   * déjà éprouvés (`ranger` et `consulter`) — exactement ce que fait le bloc des pièces d'un message. Aucun droit
   * n'est accordé ici : c'est le serveur qui autorise ou refuse, dossier par dossier.
   *
   * ⚠️ `onVoir` OUVRE LE DOCUMENT DANS UN ONGLET, ET NON LA VISIONNEUSE — et c'est dit, parce que c'est une
   * différence avec la fenêtre d'une conversation. La visionneuse a besoin du TOUR des pièces de l'échange
   * (`voisinagePiecesConversation`, parent inventé) ; ici le résumé rassemble les pièces de jusqu'à 25 échanges
   * DIFFÉRENTS, et un tour qui les mélangerait franchirait la frontière que ce parent existe pour tenir. Ouvrir
   * l'onglet est le même geste que le double-clic sur la miniature : aucune promesse n'est faite qui ne soit
   * tenue. Le tour complet reste à un clic — « Ouvrir l'échange → », dans le détail du mail.
   *
   * ⚠️ `onAllerAuMessage` DÉPLIE LE MAIL DANS LE FIL CI-DESSOUS, sur place : c'est le geste qu'Arno a demandé
   * dans la fenêtre de conversation, et il a le même sens ici.
   */
  const gestes: GestesPiece = {
    onVoir: (pieceId) => { window.open(lienDocumentEntier(pieceId), '_blank', 'noopener,noreferrer'); },
    onRanger: (p) => setARanger({
      messageId: p.messageId,
      filId: filDuMessage.get(p.messageId) ?? null,
      pieces: [{ pieceId: p.pieceId, nom: p.nomFichier, tailleOctets: p.tailleOctets, typeMime: p.typeMime }],
    }),
    onVoirDansLeDrive: setAVoirDansLeDrive,
    onAllerAuMessage: (messageId) => {
      setDeplie((s) => new Set(s).add(messageId));
      /* ⚠️ `block: 'center'` ET AUCUNE ANIMATION : le mail vient de se déplier, donc la page grandit — une
         animation lancée sur une page qui grandit finit ailleurs que là où elle visait. */
      document.getElementById(`hdb-mail-${messageId}`)?.scrollIntoView({ block: 'center' });
    },
  };

  const totalPieces = recap.pieces.length;

  return (
    <section className="ann-bloc hdb" aria-labelledby="hdb-titre">
      <h4 className="ann-bloc-titre" id="hdb-titre">
        Historique du bien
        {etat.v === 'ok' && <span className="gst-compte">{etat.total}</span>}
      </h4>

      {/* ══ 🔴 L'ÉVÉNEMENT EN COURS, EN TÊTE ════════════════════════════════════════════════════════════════════
          Demande d'Arno : « si un événement est EN COURS, son titre ». C'est le contexte dans lequel on ouvre
          cet historique neuf fois sur dix — l'écrire évite de le chercher dans la liste des périodes. */}
      {evenementOuvert !== null && (
        <p className="hdb-evt" role="status">
          <span className="hdb-evt-capsule">Événement en cours</span>
          <strong className="hdb-evt-nom">{evenementOuvert.reference} — {nettoyerObjet(evenementOuvert.objet)}</strong>
          <span className="hdb-evt-date">
            ouvert le {formaterDateIso((evenementOuvert.ouvertLe ?? '').slice(0, 10)) || 'date inconnue'}
          </span>
        </p>
      )}

      {/* ══ 🔴🔴 QUI OCCUPE — ET « EN PLACE » NE S'ÉCRIT JAMAIS SUR UN LOGEMENT VACANT ══════════════════════════
          La phrase vient ENTIÈREMENT du module pur (`motLocataireDeLaPeriode`), et c'est là qu'elle est éprouvée :
          une maquette de l'étude annonçait « locataire en place depuis le 08/06/2025 » sur un logement vacant
          depuis le 28/09/2026, avec une date d'entrée devinée. Aucun morceau de cette phrase ne se compose ici. */}
      <p className="hdb-occupant">{motLocataireDeLaPeriode(occupations, maintenant)}</p>

      {/* ══ LE TABLEAU DE BORD ══ Rendu HORS du commutateur d'état : cocher une case ne démonte jamais la case,
          donc le focus et la position de défilement ne bougent pas. */}
      <div className="hdb-bord">
        {/* ══ 🔴🔴 BLOC 1 — « PÉRIODE », HORIZONTAL ET PLEINE LARGEUR (lot HISTORIQUE-BIEN-2) ═══════════════════
            DEMANDE D'ARNO (04/10/2026) : « Arno n'aime pas la mise en page actuelle en colonne : refonte
            complète en blocs horizontaux empilés. » Le pavé occupe donc toute la largeur, et son contenu
            s'étale : les quatre choix à gauche, la période effective à droite.

            🔴 QUATRE CHOIX EXCLUSIFS EN BOUTONS SEGMENTÉS, et l'exclusivité est tenue par le TYPE
            (`ChoixPeriode`, une union discriminée), pas par la discipline de l'écran. */}
        <fieldset className="hdb-pave hdb-pave--bande">
          <legend className="hdb-legende">Période</legend>

          <div className="hdb-bande">
            <div className="hdb-segments" role="group" aria-label="Choisir la période">
              <button type="button" aria-pressed={reglages.periode.sorte === 'tous'}
                className={`hdb-seg${reglages.periode.sorte === 'tous' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => ({ ...r, periode: { sorte: 'tous' } }))}>
                Tous les échanges
              </button>

              {/* ══ 🔴🔴 « DEPUIS L'ENTRÉE DU DERNIER LOCATAIRE » ═══════════════════════════════════════════
                  Arno : « début = sa date d'entrée, fin = sa sortie ou aujourd'hui ; si le bien n'a jamais eu
                  de locataire, bouton grisé avec une info-bulle explicative ».

                  🔴 `disabled` ET `title`, PAS UNE COULEUR : un bouton pâle ne dit pas POURQUOI il est pâle.
                  Le motif vient du module pur (`SANS_LOCATAIRE_CONNU`) et il est aussi écrit SOUS la bande,
                  parce qu'une infobulle n'existe pas sur un téléphone — règle tenue partout dans ce bloc. */}
              <button type="button" aria-pressed={reglages.periode.sorte === 'occupation'}
                disabled={periodeLocataire === null}
                title={periodeLocataire === null ? SANS_LOCATAIRE_CONNU : undefined}
                className={`hdb-seg${reglages.periode.sorte === 'occupation' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => (periodeLocataire === null ? r : {
                  ...r, periode: { sorte: 'occupation', du: periodeLocataire.du, au: periodeLocataire.au },
                }))}>
                Depuis l’entrée du dernier locataire
              </button>

              {/* ⚠️ « UN ÉVÉNEMENT » EST UN BOUTON **ET** UNE LISTE : le bouton dit le choix, la liste dit
                  lequel. Il est grisé quand le bien n'a aucun événement — même règle que ci-dessus. */}
              <button type="button" aria-pressed={reglages.periode.sorte === 'evenement'}
                disabled={evenements.length === 0}
                title={evenements.length === 0 ? SANS_EVENEMENT : undefined}
                className={`hdb-seg${reglages.periode.sorte === 'evenement' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => {
                  const e = evenements[0];
                  if (e === undefined) return r;
                  const b = periodeDeLEvenement(e, maintenant);
                  return { ...r, periode: { sorte: 'evenement', evenementId: e.id, du: b.du, au: b.au } };
                })}>
                Un événement
              </button>

              <button type="button" aria-pressed={reglages.periode.sorte === 'dates'}
                className={`hdb-seg${reglages.periode.sorte === 'dates' ? ' hdb-seg--actif' : ''}`}
                onClick={() => setReglages((r) => ({
                  ...r, periode: { sorte: 'dates', ...bornesDuChoix(r.periode) },
                }))}>
                Dates personnalisées
              </button>
            </div>

            {/* ══ 🔴🔴 LA PÉRIODE EFFECTIVE, TOUJOURS ÉCRITE, À DROITE ═══════════════════════════════════════
                Arno : « La période effective est toujours affichée en clair à droite (“du 01/05/2025 au
                04/10/2026”). » C'est la seule chose qui rende visible qu'un événement a réglé deux dates — et
                la seule qui montre qu'on a ensuite modifié une borne à la main. La phrase vient du module pur,
                et elle lit les MÊMES bornes que celles envoyées au serveur (`bornesDuChoix`). */}
            <p className="hdb-effective" role="status">
              <span className="hdb-effective-mot">Période retenue</span>
              {/* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 4 — `maintenant` entre ici pour que « la date du jour » s'écrive
                  « aujourd'hui ». Le module pur ne lit jamais l'horloge lui-même : il la reçoit. */}
              <strong className="hdb-effective-valeur">{motPeriodeEffective(reglages.periode, maintenant)}</strong>
            </p>
          </div>

          {/* ── LA LISTE DÉROULANTE DES ÉVÉNEMENTS — EN COURS ET CLOS ────────────────────────────────────── */}
          {reglages.periode.sorte === 'evenement' && evenements.length > 0 && (
            <label className="hdb-select-ligne">
              <span className="svv-label">L’événement</span>
              {/* ⚠️ UN VRAI `select` : sur un bien chargé, la liste des événements est longue, et une rangée de
                  boutons poussait le fil hors de l'écran — c'est ce qu'Arno a demandé de changer. Le natif
                  apporte en outre la recherche au clavier et le bon comportement sur téléphone. */}
              <select className="ann-champ hdb-select"
                value={reglages.periode.sorte === 'evenement' ? String(reglages.periode.evenementId) : ''}
                onChange={(ev) => setReglages((r) => {
                  const e = evenements.find((x) => String(x.id) === ev.target.value);
                  if (e === undefined) return r;
                  const b = periodeDeLEvenement(e, maintenant);
                  return { ...r, periode: { sorte: 'evenement', evenementId: e.id, du: b.du, au: b.au } };
                })}>
                {evenements.map((e) => (
                  /* LE MOT DIT L'ÉTAT, pas seulement la place dans la liste : « en cours » / « clos ». */
                  <option key={e.id} value={String(e.id)}>
                    {e.reference} — {nettoyerObjet(e.objet) || '(sans objet)'}
                    {' · '}{e.ouvert ? 'en cours' : 'clos'} · {e.nbMails} mail{e.nbMails > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* ── LES DEUX DATES ───────────────────────────────────────────────────────────────────────────────
              ⚠️ ELLES APPARAISSENT DÈS QU'UNE PÉRIODE EST CHOISIE, et pas seulement sur « Dates
              personnalisées » : c'est la règle posée au lot précédent et qu'Arno n'a pas défaite —
              « l'événement PROPOSE une période, il ne l'impose pas ». Toucher une borne bascule sur
              « Dates personnalisées », ce qui est la vérité : ce n'est plus la période de l'événement. */}
          {reglages.periode.sorte !== 'tous' && (
            <div className="hdb-dates">
              <label className="hdb-date">
                <span className="svv-label">Du</span>
                <input type="date" className="ann-champ hdb-champ-date"
                  value={bornesDuChoix(reglages.periode).du ?? ''}
                  onChange={(e) => setReglages((r) => ({
                    ...r,
                    periode: {
                      sorte: 'dates',
                      du: e.target.value === '' ? null : e.target.value,
                      au: bornesDuChoix(r.periode).au,
                    },
                  }))} />
              </label>
              <label className="hdb-date">
                <span className="svv-label">Au</span>
                <input type="date" className="ann-champ hdb-champ-date"
                  value={bornesDuChoix(reglages.periode).au ?? ''}
                  onChange={(e) => setReglages((r) => ({
                    ...r,
                    periode: {
                      sorte: 'dates',
                      du: bornesDuChoix(r.periode).du,
                      au: e.target.value === '' ? null : e.target.value,
                    },
                  }))} />
              </label>
            </div>
          )}

          {/* LES DEUX MOTIFS DE GRISAGE, ÉCRITS — une information portée par une seule infobulle n'existe pas. */}
          {periodeLocataire === null && <p className="gst-note hdb-note">{SANS_LOCATAIRE_CONNU}</p>}
          {evenementsIllisibles && (
            <p className="gst-note hdb-note" role="status">
              Les événements de ce bien n’ont pas pu être lus — les deux dates restent utilisables.
            </p>
          )}
          {!evenementsIllisibles && evenements.length === 0 && (
            <p className="gst-note hdb-note">{SANS_EVENEMENT}</p>
          )}
        </fieldset>

        {/* ══ 🔴🔴 BLOC 2 — « PARTIES » : CAPSULES, DEUX ENCARTS, DEUX BANDES (lot HISTORIQUE-BIEN-3) ══════════
            DEMANDE D'ARNO (05/10/2026) : « Chaque partie devient une CAPSULE (pastille arrondie : case à cocher,
            nom ou adresse, compteurs a écrit / en copie, et la date pour les locataires). » Et : « “Tiers
            indépendant” : une ligne déployable SOUS les deux encarts, pleine largeur, bleue, repliée par défaut,
            qui reste une zone de dépôt même repliée (elle s'ouvre au survol pendant un glisser). Même chose pour
            “Non affectés” (grise). » */}
        <fieldset className="hdb-pave hdb-pave--bande">
          <legend className="hdb-legende">Parties</legend>

          {/* 🔴 « TOUS LES MAILS DU BIEN SUR LA PÉRIODE » IGNORE LE CHOIX DES PARTIES, SANS L'EFFACER. */}
          <label className="hdb-case hdb-case--large">
            <input type="checkbox" checked={reglages.toutesLesParties}
              onChange={(e) => setReglages((r) => ({ ...r, toutesLesParties: e.target.checked }))} />
            <span>Tous les mails du bien sur la période</span>
          </label>
          {reglages.toutesLesParties && reglages.parties.length > 0 && (
            <p className="gst-note hdb-note">
              {reglages.parties.length === 1
                ? '1 personne reste cochée : elle sera reprise dès que cet interrupteur se relève.'
                : `${reglages.parties.length} personnes restent cochées : elles seront reprises dès que cet interrupteur se relève.`}
            </p>
          )}
          {motAgenceEcartee(parties.nousEcartees) !== null && (
            <p className="gst-note hdb-note">{motAgenceEcartee(parties.nousEcartees)}</p>
          )}
          {cartesContact.length > 0 && (
            <p className="gst-note hdb-note">
              {(() => {
                const aVerifier = cartesContact.filter((c) => !c.verifie).length;
                const n = cartesContact.length;
                const total = `${n} contact${n > 1 ? 's' : ''} pré-rempli${n > 1 ? 's' : ''} pour ce bien`;
                return aVerifier === 0
                  ? `${total} — tous vérifiés.`
                  : `${total}, dont ${aVerifier} à vérifier et compléter.`;
              })()}
            </p>
          )}

          {/* ── LES DEUX ENCARTS, CÔTE À CÔTE ───────────────────────────────────────────────────────────────── */}
          <div className="hdb-encarts">
            {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LES DEUX ENCARTS SONT **TOUJOURS** LÀ ═══════════════════
                RÈGLE D'ARNO : « sur TOUTE fiche bien, les deux encarts sont TOUJOURS affichés côte à côte, même
                largeur : Propriétaire à GAUCHE, Locataire à DROITE. »

                🔴 CE QUI ÉTAIT ÉCRIT ICI, ET QUI A PRODUIT LE DÉFAUT : `if (g.nb === 0) return null`. Un encart
                vide disparaissait, et la grille `auto-fit` laissait le survivant occuper toute la ligne — d'où
                « l'encart Locataire prend toute la largeur ». Les deux moitiés de la cause sont corrigées
                ensemble : ici le rendu, et dans la feuille les DEUX colonnes fixes.

                ⚠️ L'ORDRE VIENT DE `GROUPES_EN_ENCART`, qui dit déjà `['proprietaire', 'locataire']` : gauche
                et droite ne sont donc pas décidés ici, et ne peuvent pas diverger de la liste des groupes. */}
            {GROUPES_EN_ENCART.map((cle) => {
              const g = parties.groupes.find((x) => x.cle === cle);
              if (g === undefined) return null;
              return (
                <GroupeDeParties key={cle} g={g} forme="encart" reglages={reglages} bascules={bascules}
                  motSiVide={motEncartVide(cle, clientConnuPour(cle, clients))}
                  periodes={periodes} categoriesFiche={categories} cartesParAdresse={cartesParAdresse}
                  fichesClientes={fichesClientes} onFicheClient={onFicheClient}
                  survol={survol} glisse={glisse} menu={menu}
                  onBasculerRepli={basculerRepli} onBasculerPartie={basculerPartie} onBasculerGroupe={basculerGroupe}
                  onCreer={ouvrirCreation} onMenu={setMenu} onGlisse={setGlisse} onSurvol={setSurvol}
                  onDeplacer={deplacer} onPeriode={reglerPeriodeSurLeBail} />
              );
            })}
          </div>

          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 2 — LES DEUX BANDES SONT **TOUJOURS** LÀ, MÊME À ZÉRO ════════
              RÈGLE D'ARNO : « Sous les deux encarts, sur toute la largeur, deux lignes dépliables, repliées par
              défaut, chacune avec son compteur et sa case “tout le groupe” : “Tiers indépendant” (bleu) puis
              “Non affectés” (gris). Elles sont TOUJOURS présentes, même à 0, et restent des zones de dépôt
              quand elles sont repliées (elles s'ouvrent au survol pendant un glisser). »

              🔴 CE QUI ÉTAIT ÉCRIT ICI : un groupe vide rendait `null` TANT QU'AUCUN GLISSER N'ÉTAIT EN COURS.
              Une bande vide n'existait donc QUE pendant un glisser. Deux conséquences, et la seconde est la
              pire :
                · on ne pouvait pas LIRE qu'un bien n'a aucun tiers indépendant — l'absence de ligne ne dit
                  rien, ni « zéro » ni « pas encore chargé » ;
                · et la bande APPARAISSAIT SOUS LE CURSEUR au premier mouvement du glisser, poussant les deux
                  encarts vers le haut au moment précis où l'on vise. On visait alors une cible qui venait de
                  bouger — le genre de défaut qu'on met sur le compte de sa propre maladresse.

              ⚠️ UNE BANDE REPLIÉE EST DÉJÀ UNE ZONE DE DÉPÔT, et elle l'était avant ce lot : les trois gestes
              (`onDragOver`, `onDragLeave`, `onDrop`) sont posés sur la `section` entière, pas sur la liste. Le
              repli ne cache que les capsules. Et le survol pendant un glisser l'ouvre sans le mémoriser. */}
          {GROUPES_EN_BANDE.map((cle) => {
            const g = parties.groupes.find((x) => x.cle === cle);
            if (g === undefined) return null;
            return (
              <GroupeDeParties key={cle} g={g} forme="bande" reglages={reglages} bascules={bascules}
                periodes={periodes} categoriesFiche={categories} cartesParAdresse={cartesParAdresse}
                fichesClientes={fichesClientes} onFicheClient={onFicheClient}
                survol={survol} glisse={glisse} menu={menu}
                onBasculerRepli={basculerRepli} onBasculerPartie={basculerPartie} onBasculerGroupe={basculerGroupe}
                onCreer={ouvrirCreation} onMenu={setMenu} onGlisse={setGlisse} onSurvol={setSurvol}
                onDeplacer={deplacer} onPeriode={reglerPeriodeSurLeBail} />
            );
          })}

          {/* ══ 🔴🔴 LE MESSAGE D'APRÈS-DÉPÔT, ET SON « ANNULER » ═══════════════════════════════════════════════
              Arno : « après le dépôt, petit message “Fanny Rosky → Locataire” avec “Annuler” quelques secondes. »

              🔴 LE NOM **ET** LA DESTINATION : c'est la seule phrase qui permette de vérifier qu'on n'a pas
              lâché la capsule une rangée trop bas. « Déplacé » tout court aurait obligé à retrouver la capsule
              pour le savoir — ce qu'on vient justement de faire disparaître de l'écran. */}
          {dernierGeste !== null && (
            <p className="hdb-fait" role="status">
              <span className="hdb-fait-mot">{dernierGeste.mot}</span>
              <button type="button" className="hdb-fait-annuler" disabled={annulationEnCours}
                onClick={() => { void annulerDeplacement(); }}>
                {annulationEnCours ? 'Annulation…' : 'Annuler'}
              </button>
            </p>
          )}
          {refusDeplacement !== null && <p className="gst-erreur" role="status">{refusDeplacement}</p>}

          {/* ══ 🔴🔴 LA PETITE CARTE DE CRÉATION DE CONTACT ═══════════════════════════════════════════════════ */}
          {aCreer !== null && (
            <div className="hdb-creation" role="group" aria-label="Ranger cette partie et créer son contact">
              <p className="hdb-creation-titre">
                Ranger <strong>{aCreer.adresse}</strong> pour ce bien
              </p>
              <div className="hdb-creation-champs">
                <label className="hdb-creation-champ">
                  <span className="svv-label">Adresse mail</span>
                  {/* ⚠️ PRÉ-REMPLIE ET NON MODIFIABLE : c'est l'adresse de la partie qu'on range, pas une
                      saisie libre. La rendre modifiable aurait permis de ranger quelqu'un d'autre sans le voir. */}
                  <input type="email" className="ann-champ" value={aCreer.adresse} readOnly />
                </label>
                <label className="hdb-creation-champ">
                  <span className="svv-label">Nom</span>
                  <input type="text" className="ann-champ" value={aCreer.nom} autoComplete="off"
                    placeholder="facultatif"
                    onChange={(e) => setACreer((c) => (c === null ? c : { ...c, nom: e.target.value }))} />
                </label>
                <label className="hdb-creation-champ">
                  <span className="svv-label">Téléphone</span>
                  <input type="tel" className="ann-champ" value={aCreer.telephone} autoComplete="off"
                    placeholder="facultatif"
                    onChange={(e) => setACreer((c) => (c === null ? c : { ...c, telephone: e.target.value }))} />
                </label>
                <label className="hdb-creation-champ">
                  <span className="svv-label">Catégorie</span>
                  <select className="ann-champ" value={aCreer.categorie}
                    onChange={(e) => setACreer((c) => (c === null ? c
                      : { ...c, categorie: e.target.value as Categorie | '' }))}>
                    {/* ⚠️ L'OPTION VIDE EXISTE, et elle est le défaut quand rien n'a été déduit : un choix
                        pré-coché au hasard se valide sans être lu. */}
                    <option value="">— à choisir —</option>
                    <option value="proprietaire">Propriétaire</option>
                    <option value="locataire">Locataire</option>
                    <option value="independant">Tiers indépendant</option>
                  </select>
                </label>
              </div>

              <p className="gst-note hdb-note">
                {aCreer.categorie === 'independant'
                  ? 'Un tiers indépendant est rangé une fois pour TOUS les biens, ne reçoit pas de carte de contact, '
                    + 'et ne sert jamais à l’automatisation.'
                  : aCreer.categorie === ''
                    ? 'Choisissez une catégorie : elle n’a pas été déduite pour cette adresse.'
                    : `Rangée côté ${coteDeLaCategorie(aCreer.categorie) === 'proprietaire' ? 'propriétaire' : 'locataire'} `
                      + 'de ce bien, avec une carte de contact à vérifier.'}
              </p>
              {refusCreation !== null && <p className="gst-erreur" role="status">{refusCreation}</p>}

              <div className="hdb-boutons">
                <button type="button" className="svv-btn gst-btn"
                  disabled={aCreer.categorie === '' || creationEnCours}
                  onClick={() => { void enregistrerCreation(); }}>
                  {creationEnCours ? 'Enregistrement…' : 'Valider'}
                </button>
                <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={() => { setACreer(null); setRefusCreation(null); }}>Annuler</button>
              </div>
            </div>
          )}

          {etat.v === 'ok' && etat.tronques && (
            <p className="gst-note hdb-note" role="status">
              Ce bien compte plus de personnes que la liste n’en montre : les moins présentes ne sont pas listées.
            </p>
          )}
          {etat.v === 'ok' && interlocuteurs.length === 0 && (
            <p className="ann-gris">Aucune personne à lister pour ces réglages.</p>
          )}
        </fieldset>

        {/* ══ 🔴🔴 BLOC 3 — « OPTIONS » : UNE SEULE RANGÉE, PROPRE ET ALIGNÉE (lot HISTORIQUE-BIEN-3, point 5)
            DEMANDE D'ARNO (05/10/2026), qui juge l'actuel « immonde » : « Une seule rangée horizontale, propre,
            alignée : à gauche, le champ de recherche (icône loupe, texte “Rechercher dans les mails affichés…”,
            bouton ✕ pour effacer) ; puis un contrôle segmenté “Pièces jointes : Toutes · Avec · Sans” ; une
            puce bascule “Événement ouvert” ; un bouton d'ordre “↓ Plus récent en haut” ; une bascule “Regrouper
            par conversation”. Hauteurs identiques, espacements réguliers, aucun bouton qui passe seul à la
            ligne ; sur écran étroit, retour à la ligne propre par groupes. »

            🔴 « AUCUN BOUTON QUI PASSE SEUL À LA LIGNE » EST TENU PAR LA STRUCTURE, pas par des réglages de
            largeur : chaque contrôle est un GROUPE indivisible (`hdb-opt`), et c'est entre les groupes que la
            rangée se casse. Un `flex-wrap` sur des boutons nus aurait laissé « Sans » tomber seul sous ses deux
            voisins — le défaut exact qu'Arno a sous les yeux. */}
        <fieldset className="hdb-pave hdb-pave--bande">
          <legend className="hdb-legende">Options</legend>
          <div className="hdb-rangee">

            {/* ── LA RECHERCHE, À GAUCHE ───────────────────────────────────────────────────────────────────── */}
            <div className="hdb-opt hdb-opt--recherche">
              <span className="hdb-loupe" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M9.2 9.2 L12.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <input type="search" className="hdb-champ-recherche" value={saisie} autoComplete="off"
                aria-label="Rechercher dans les mails affichés"
                placeholder="Rechercher dans les mails affichés…"
                onChange={(e) => setSaisie(e.target.value)} />
              {/* ⚠️ LE ✕ N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À EFFACER : un bouton éteint occupe la place et
                  fait croire à une panne. Il est dans le même cadre que le champ, comme une messagerie. */}
              {saisie !== '' && (
                <button type="button" className="hdb-effacer" aria-label="Effacer la recherche"
                  title="Effacer la recherche" onClick={() => setSaisie('')}>✕</button>
              )}
            </div>

            {/* ── LES PIÈCES JOINTES, EN CONTRÔLE SEGMENTÉ ─────────────────────────────────────────────────── */}
            <div className="hdb-opt">
              <span className="hdb-opt-mot">Pièces jointes</span>
              <div className="hdb-segs" role="group" aria-label="Pièces jointes">
                {([['toutes', 'Toutes'], ['avec', 'Avec'], ['sans', 'Sans']] as const).map(([cle, mot]) => (
                  <button key={cle} type="button" aria-pressed={reglages.pieces === cle}
                    className={`hdb-petit${reglages.pieces === cle ? ' hdb-petit--actif' : ''}`}
                    onClick={() => setReglages((r) => ({ ...r, pieces: cle }))}>{mot}</button>
                ))}
              </div>
            </div>

            {/* ── LA PUCE « ÉVÉNEMENT OUVERT » ─────────────────────────────────────────────────────────────── */}
            <div className="hdb-opt">
              <button type="button" aria-pressed={reglages.evenementOuvert}
                className={`hdb-puce-bascule${reglages.evenementOuvert ? ' hdb-puce-bascule--actif' : ''}`}
                onClick={() => setReglages((r) => ({ ...r, evenementOuvert: !r.evenementOuvert }))}>
                Événement ouvert
              </button>
            </div>

            {/* ── L'ORDRE ──────────────────────────────────────────────────────────────────────────────────────
                🔴 LE BOUTON DIT L'ORDRE EN COURS, pas celui qu'il donnerait — convention de tout le module. La
                flèche d'Arno (« ↓ Plus récent en haut ») le dit deux fois, et c'est bien : la flèche se voit du
                coin de l'œil, le mot se lit. */}
            <div className="hdb-opt">
              <button type="button" className="hdb-petit hdb-petit--large"
                onClick={() => setReglages((r) => ({ ...r, ordre: ordreFilSuivant(r.ordre) }))}
                title="Inverser l’ordre du fil">
                <span aria-hidden="true">{reglages.ordre === 'recent' ? '↓' : '↑'}</span>{' '}
                {libelleOrdreFil(reglages.ordre)}
              </button>
            </div>

            {/* ── REGROUPER PAR CONVERSATION ───────────────────────────────────────────────────────────────── */}
            <div className="hdb-opt">
              <label className="hdb-bascule">
                <input type="checkbox" checked={reglages.grouper}
                  onChange={(e) => setReglages((r) => ({ ...r, grouper: e.target.checked }))} />
                <span>Regrouper par conversation</span>
              </label>
            </div>

            {/* ══ 🔴 « N MAILS SUR M », EN DIRECT ═══════════════════════════════════════════════════════════
                Arno : « le compteur “N mails sur M” se met à jour en direct ». Il n'apparaît que pendant une
                recherche : un « 25 sur 25 » permanent serait du bruit qu'on apprend à ne plus lire. */}
            {motCompteurRecherche(lignes.length, lignesPage.length, motsCherches.length > 0) !== null && (
              <p className="hdb-compte-recherche" role="status">
                {motCompteurRecherche(lignes.length, lignesPage.length, true)}
              </p>
            )}
          </div>
        </fieldset>
      </div>

      {/* ══ 🔴🔴 LA LÉGENDE DES BARRES, DISCRÈTE, AU-DESSUS DU LISTING (lot HISTORIQUE-BIEN-2) ═════════════════
          Arno : « Les couleurs sont lisibles en Clair et en Sombre, avec une légende discrète au-dessus du
          listing. » Une couleur sans légende n'est pas une information : elle se devine, et on se trompe.

          ⚠️ CHAQUE ENTRÉE PORTE SON MOT, pas seulement sa pastille : c'est le mot qui informe, la couleur ne
          fait que l'appuyer — même règle que les capsules de statut dans tout ce module. */}
      {lignes.length > 0 && (
        <p className="hdb-legende-barres">
          {LEGENDE_BARRES.map((x) => (
            <span key={x.ton} className="hdb-legende-item">
              <span aria-hidden="true" className={`hdb-legende-pastille hdb-legende-pastille--${x.ton}`} />
              {x.mot}
            </span>
          ))}
        </p>
      )}

      {/* ══ LE RÉSUMÉ DES PIÈCES, EN HAUT — REPLIÉ, AVEC SON COMPTE LISIBLE SANS CLIC ══════════════════════════ */}
      {totalPieces > 0 && (
        <div className="hdb-resume hdb-resume--haut">
          <BasculeResume n={totalPieces} ouvert={resumeOuvert} onBasculer={() => setResumeOuvert((v) => !v)} />
          {/* ══ 🔴🔴 QUAND LA SÉLECTION DÉPASSE LE PLAFOND, ON LE DIT (lot HISTORIQUE-BIEN-4, point 1) ══════════
              Le listing charge la sélection entière jusqu'au plafond de la route (100 mails). Au-delà, le résumé
              ne porte que sur ces 100 — et le taire aurait reproduit, en plus grand, le défaut même qu'Arno a
              signalé : un résumé qui annonce « cette sélection » sans la couvrir. */}
          {etat.v === 'ok' && (etat.suite || page > 0) && (
            <p className="gst-note hdb-note">
              Cette sélection compte plus de {PAGE_HISTORIQUE_MAX} mails : le résumé porte sur les
              {' '}{lignes.length} mails affichés. « Voir la suite → » en montre les suivants.
            </p>
          )}
          {resumeOuvert && (
            <ResumePieces groupes={groupesPieces} depots={depots} emplacements={emplacements}
              maintenant={maintenant} gestes={gestes} sansEmpreinte={recap.sansEmpreinte}
              categories={categoriesFusionnees} />
          )}
        </div>
      )}

      {/* ══ LE FIL ══ `LigneVie`, une par mail — LE composant de « Vie du bien », importé et non recopié. */}
      {etat.v === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
        : etat.v === 'erreur' ? <p className="gst-erreur" role="status">{etat.message}</p>
          : lignes.length === 0 ? (
            <div className="hdb-vide" role="status">
              <p className="ann-gris">{motAucunResultat(reglages)}</p>
              {reglagesActifs(reglages) && (
                <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={remettreAPlat}>
                  Tout remettre à plat
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 🔴 « REGROUPER PAR CONVERSATION » DÉCOUPE LE FIL REÇU, il ne le retrie pas : l'ordre reste
                  décidé à un seul endroit (`trierFil`), et le découpage par `grouperParConversation`. */}
              {reglages.grouper
                ? conversations.map((c) => (
                  <section key={c.filId} className="hdb-conv" aria-label={`Échange : ${nettoyerObjet(c.objet ?? '') || '(sans objet)'}`}>
                    <h5 className="hdb-conv-titre">
                      {nettoyerObjet(c.objet ?? '') || '(sans objet)'}
                      <span className="gst-compte">{c.lignes.length}</span>
                    </h5>
                    <FilDeMails lignes={c.lignes} maintenant={maintenant} deplie={deplie}
                      categories={categoriesFusionnees} surligne={mailSurligne} mots={motsCherches}
                      onBasculer={basculerMail} onOuvrirFil={ouvrirLaConversation} />
                  </section>
                ))
                : (
                  <FilDeMails lignes={lignes} maintenant={maintenant} deplie={deplie}
                    categories={categoriesFusionnees} surligne={mailSurligne} mots={motsCherches}
                    onBasculer={basculerMail} onOuvrirFil={ouvrirLaConversation} />
                )}

              <div className="vdb-pages">
                {page > 0 && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n - 1)}>← Page précédente</button>
                )}
                {etat.suite && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n + 1)}>Voir la suite →</button>
                )}
                {reglagesActifs(reglages) && (
                  <button type="button" className="gst-lien-bouton"
                    onClick={remettreAPlat}>
                    Tout remettre à plat
                  </button>
                )}
              </div>

              {/* ══ 🔴🔴 LE MÊME BOUTON, EN BAS DU LISTING (lot HISTORIQUE-BIEN-4, point 4) ═══════════════════
                  Arno : « Le MÊME bouton est ajouté EN BAS du listing des mails : il ouvre et ferme le même
                  résumé (un seul état partagé). » Après avoir lu quarante mails, on est en bas : remonter
                  chercher le bouton du haut était un aller-retour pour rien. */}
              {totalPieces > 0 && (
                <div className="hdb-resume hdb-resume--bas">
                  <BasculeResume n={totalPieces} ouvert={resumeOuvert}
                    onBasculer={() => setResumeOuvert((v) => !v)} />
                  {resumeOuvert && (
                    <ResumePieces groupes={groupesPieces} depots={depots} emplacements={emplacements}
                      maintenant={maintenant} gestes={gestes} sansEmpreinte={recap.sansEmpreinte}
                      categories={categoriesFusionnees} />
                  )}
                </div>
              )}
            </>
          )}

      {/* ══ 🔴 LE LIEN DISCRET VERS L'ÉCRAN PLEIN, TOUT EN BAS (lot HISTORIQUE-BIEN-3) ═════════════════════════
          Arno : « petit lien discret “Écran historique complet” en bas du nouveau bloc ».

          ⚠️ EN BAS, ET DISCRET, PARCE QUE C'EST UNE SORTIE, PAS UNE ACTION. Le mettre en tête aurait proposé de
          quitter le bloc avant de l'avoir lu ; le mettre en gros aurait suggéré qu'il y a mieux ailleurs. */}
      {onEcranComplet !== undefined && (
        <p className="hdb-sortie">
          <button type="button" className="gst-lien-bouton" onClick={onEcranComplet}>
            Écran historique complet →
          </button>
        </p>
      )}

      {/* ══ LA FENÊTRE DRIVE, EN MODE « RANGER » ══ La MÊME que partout : mêmes refus, même arborescence. */}
      {aRanger !== null && (
        <SelecteurFichierDrive
          mode="ranger"
          messageId={aRanger.messageId}
          filId={aRanger.filId}
          pieces={aRanger.pieces}
          onRangement={() => { void relireDrive(); }}
          onFermer={() => setARanger(null)} />
      )}

      {/* ══ LA FENÊTRE DRIVE, EN MODE « CONSULTER » ══ Le picto vert mène ici : arbre déplié jusqu'au document.
          ⚠️ `dossierDepart` PEUT ÊTRE `null` : sans dossier connu, on s'ouvre à la racine plutôt que d'inventer
          un identifiant qui mènerait à une erreur Google. Le repère, lui, reste posé. */}
      {aVoirDansLeDrive !== null && (
        <SelecteurFichierDrive
          mode="consulter"
          dossierDepart={dossierDeLEmplacement(aVoirDansLeDrive)}
          documentEnEvidence={{ driveFileId: aVoirDansLeDrive.driveFileId }}
          arrivee="arborescence"
          onFermer={() => setAVoirDansLeDrive(null)} />
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 2 — UN GROUPE DE PARTIES : ENCART OU BANDE, ET ZONE DE DÉPÔT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce qu'un groupe reçoit. Beaucoup de props, mais toutes nommées : un objet fourre-tout cacherait les oublis. */
interface PropsGroupe {
  g: GroupeParties;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — CE QUE DIT CE GROUPE QUAND IL N'A AUCUNE CAPSULE.
   *
   * Passé par les ENCARTS, qui sont désormais toujours affichés : « un encart sans capsule reste affiché, avec
   * un texte discret » (Arno). Les BANDES n'en passent pas — leur phrase est celle du dépôt, et une bande sans
   * contact n'a rien d'anormal à expliquer.
   */
  motSiVide?: string;
  /** `encart` = colonne à hauteur fixe (Propriétaire, Locataire) ; `bande` = pleine largeur sous les encarts. */
  forme: 'encart' | 'bande';
  reglages: Reglages;
  bascules: ReadonlySet<CleGroupeParties>;
  periodes: ReadonlyMap<string, PeriodePartie>;
  /** Les CLIENTS de la fiche : eux seuls ne se déplacent pas. */
  categoriesFiche: ReadonlyMap<string, CategoriePartie>;
  /** Par adresse, les côtés où une carte de contact existe déjà. Décide de la présence du « + » cerclé. */
  /** Pour chaque adresse, les côtés où une carte existe sur ce bien, et si elle est VÉRIFIÉE. */
  cartesParAdresse: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
  /** 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — la fiche d'annuaire d'un client, pour « adresse à corriger ». */
  fichesClientes: ReadonlyMap<string, { sorte: 'proprietaire' | 'locataire'; id: number }>;
  onFicheClient?: (sorte: 'proprietaire' | 'locataire', id: number) => void;
  survol: CleGroupeParties | null;
  glisse: { adresse: string; depuis: CleGroupeParties } | null;
  menu: string | null;
  onBasculerRepli: (cle: CleGroupeParties) => void;
  onBasculerPartie: (adresse: string) => void;
  onBasculerGroupe: (adresses: readonly string[]) => void;
  onCreer: (adresse: string, categorie?: CleGroupeParties) => void;
  onMenu: (adresse: string | null) => void;
  onGlisse: (g: { adresse: string; depuis: CleGroupeParties } | null) => void;
  onSurvol: (cle: CleGroupeParties | null) => void;
  onDeplacer: (adresse: string, vers: CleGroupeParties, nom: string, titre: string) => Promise<void>;
  /** Régler la période du tableau de bord sur le bail d'un locataire (la date, dans sa capsule). */
  onPeriode: (p: PeriodePartie) => void;
}

/**
 * ══ 🔴🔴 UN GROUPE, ET C'EST UNE ZONE DE DÉPÔT ══════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Retour visuel : la zone de dépôt survolée se surligne dans sa couleur. » Et
 * pour les bandes : « qui reste une zone de dépôt même repliée (elle s'ouvre au survol pendant un glisser) ».
 *
 * 🔴 `onDragOver` APPELLE `preventDefault()`, ET SANS CELA RIEN NE FONCTIONNE. C'est la règle du navigateur :
 * une zone qui ne « prévient pas le défaut » pendant le survol REFUSE le dépôt, silencieusement — le curseur
 * affiche l'interdit et `onDrop` ne part jamais. C'est le premier piège du glisser-déposer HTML, et il ne
 * produit aucune erreur : juste un geste qui n'aboutit pas.
 *
 * 🔴 UNE BANDE REPLIÉE S'OUVRE AU SURVOL, et c'est la demande d'Arno : sans cela, déposer dans « Tiers
 * indépendant » aurait demandé de la déplier AVANT de commencer le glisser — c'est-à-dire de savoir où l'on va
 * avant de partir. L'ouverture est COMMANDÉE PAR LE SURVOL, pas mémorisée : la bande se referme quand on sort.
 *
 * ⚠️ ON NE SE DÉPOSE PAS SUR SON PROPRE GROUPE : `survolable` l'écarte. Autoriser le dépôt sur place aurait
 * écrit un rangement manuel identique à celui qui existait, donc gelé une proposition sans que personne ne
 * l'ait voulu.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function GroupeDeParties(p: PropsGroupe) {
  const { g, forme, reglages, glisse, survol, motSiVide } = p;
  const adresses = g.interlocuteurs.map((i) => i.adresse);
  const cochees = adresses.filter((a) => reglages.parties.includes(a.trim().toLowerCase())).length;
  /* ⚠️ `length > 0` AVANT la comparaison : un groupe vide aurait été « tout coché » (piège du lot 71). */
  const toutCoche = adresses.length > 0 && cochees === adresses.length;
  const partiel = cochees > 0 && !toutCoche;

  /* LE DÉFAUT DÉPEND DU SEUIL ; LA BASCULE L'INVERSE. Une BANDE, elle, est repliée par défaut (demande d'Arno).
     🔴 LA COMPARAISON VIENT DE `partieCategorie.ts` : écrire `> 6` ici aurait été un second juge pour la borne. */
  const ouvertParDefaut = forme === 'bande' ? false : !replierLesCartes(g.nb);
  const basculee = p.bascules.has(g.cle);
  const ouvertParChoix = basculee ? !ouvertParDefaut : ouvertParDefaut;
  /* 🔴 LE SURVOL PENDANT UN GLISSER OUVRE, SANS MÉMORISER : la bande se referme dès qu'on en sort. */
  const ouvert = ouvertParChoix || (glisse !== null && survol === g.cle);

  const survolable = glisse !== null && glisse.depuis !== g.cle;
  const surligne = survolable && survol === g.cle;

  return (
    <section
      className={`hdb-groupe hdb-groupe--${g.ton} hdb-groupe--${forme}`
        + `${surligne ? ' hdb-groupe--cible' : ''}`}
      onDragOver={(e) => {
        if (!survolable) return;
        /* 🔴 SANS `preventDefault`, LE NAVIGATEUR REFUSE LE DÉPÔT — silencieusement. Voir l'encadré. */
        e.preventDefault();
        if (survol !== g.cle) p.onSurvol(g.cle);
      }}
      onDragLeave={(e) => {
        /* ⚠️ ON NE QUITTE QUE SI L'ON SORT VRAIMENT DU GROUPE : `dragleave` part aussi en passant d'un enfant à
           l'autre, et sans ce contrôle la bande clignotait à chaque capsule traversée. */
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        if (survol === g.cle) p.onSurvol(null);
      }}
      onDrop={(e) => {
        if (!survolable || glisse === null) return;
        e.preventDefault();
        const nom = e.dataTransfer.getData('text/plain') || glisse.adresse;
        void p.onDeplacer(glisse.adresse, g.cle, nom, g.titre);
      }}>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert}
          onClick={() => p.onBasculerRepli(g.cle)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          {g.titre}
          {/* LE COMPTE EST LISIBLE SANS DÉPLIER — c'est tout l'intérêt du repli, et le titre de bande d'Arno
              (« Tiers indépendant · 4 ▸ ») le dit justement comme cela. */}
          <span className="gst-compte">{g.nb}</span>
        </button>
        {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 2 — LA CASE EST LÀ MÊME À ZÉRO, MAIS ELLE NE MENT PAS ═══════
            Arno décrit l'anatomie d'une ligne : « chacune avec son compteur et sa case “tout le groupe” ». Une
            ligne qui perdrait sa case à zéro changerait de forme selon le bien, et la case se déplacerait d'un
            groupe à l'autre sous le curseur.

            🔴 DÉSACTIVÉE, ET NON MASQUÉE, QUAND LE GROUPE EST VIDE. Une case cochable qui ne coche rien est un
            mensonge ; une case grisée dit « il n'y a personne à cocher », ce qui est le fait. Et elle ne peut
            pas afficher « tout coché » sur un ensemble vide — le piège du lot 71, qu'une case active aurait
            rouvert ici (`adresses.length > 0` le ferme déjà côté calcul, la désactivation le ferme à l'écran). */}
        <label className={`hdb-case hdb-case--groupe${g.nb === 0 ? ' hdb-case--muette' : ''}`}>
          <input type="checkbox" checked={toutCoche} disabled={g.nb === 0}
            ref={(el) => { if (el !== null) el.indeterminate = partiel; }}
            aria-label={`Tout le groupe ${g.titre}`}
            onChange={() => p.onBasculerGroupe(adresses)} />
          <span>tout le groupe</span>
        </label>
      </div>

      {/* ══ 🔴🔴 UN GROUPE VIDE PARLE, ET IL DIT DEUX CHOSES DIFFÉRENTES ════════════════════════════════════
          ① CE QU'IL EN EST (lot 5, point 1) : « Aucun locataire connu », « Aucun échange avec le propriétaire
             sur cette période ». C'est l'état du dossier, et il se lit en permanence sur un encart vide — c'est
             le « texte discret » qu'Arno demande à la place d'un encart disparu.
          ② CE QU'ON PEUT Y FAIRE, et seulement PENDANT un glisser : « Déposez ici pour ranger dans X ». Hors
             glisser, cette phrase serait une consigne pour un geste que personne n'a commencé ; pendant le
             glisser, elle est indispensable — sans elle on lâche la capsule sur un rectangle muet. */}
      {g.nb === 0 && motSiVide !== undefined && (
        <p className="hdb-vide-mot">{motSiVide}</p>
      )}
      {ouvert && g.nb === 0 && (glisse !== null || motSiVide === undefined) && (
        <p className="hdb-vide-depot">Déposez ici pour ranger dans « {g.titre} ».</p>
      )}

      {ouvert && g.nb > 0 && (
        <ListeDefilante etiquette={g.titre}>
          {g.interlocuteurs.map((i) => (
            <CapsulePartie key={i.adresse} i={i} {...p} />
          ))}
        </ListeDefilante>
      )}
    </section>
  );
}

/**
 * ══ 🔴🔴 UNE CAPSULE DE PARTIE ══════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Chaque partie devient une CAPSULE (pastille arrondie : case à cocher, nom ou
 * adresse, compteurs a écrit / en copie, et la date pour les locataires). »
 *
 * 🔴 LA CASE À COCHER RESTE UNE VRAIE CASE, dans un vrai `label`. La capsule est une pastille, pas un bouton :
 * en faire un bouton aurait obligé à recoder la sélection au clavier, et aurait cassé le geste le plus fréquent
 * du bloc — cocher quelqu'un.
 *
 * 🔴 LE GLISSER EST POSÉ SUR LE `li`, PAS SUR LE `label`. Un `draggable` sur le label capture le clic qui coche
 * la case dans certains navigateurs ; sur l'enveloppe, le clic reste au label et le glisser part de la pastille.
 *
 * 🔴 UN CLIENT N'EST PAS DÉPLAÇABLE, ET L'ÉCRAN DIT POURQUOI : curseur « interdit » et info-bulle « Client du
 * bien — non déplaçable » (mot d'Arno). Ce n'est pas une précaution d'ergonomie : la fusion remettrait le client
 * dans son groupe au rendu suivant, puisque la fiche l'emporte sur tout rangement. L'interdiction est la vérité
 * de l'arbitrage, et le dire évite de croire à une panne.
 *
 * ⚠️ LE MENU « DÉPLACER VERS… » EST LE SECOND CHEMIN, et il est indispensable : le glisser-déposer n'existe ni
 * au clavier ni sous un doigt. Il passe par la MÊME porte d'écriture.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function CapsulePartie({ i, g, ...p }: PropsGroupe & { i: Interlocuteur }) {
  const cle = i.adresse.trim().toLowerCase();
  const periode = p.periodes.get(cle) ?? null;
  const nomLisible = libelleInterlocuteur(i);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LA SORTE DE LA CAPSULE DÉCIDE DE TOUT CE QUI SUIT.
   *
   * Client, agence, tiers indépendant ou contact : une seule question, posée une fois, au module pur. Le glisser,
   * l'info-bulle et la pastille de droite en découlent — trois conditions dispersées dans ce rendu faisaient le
   * travail avant, et c'est ainsi que le « + » a pu manquer à sa troisième demande.
   */
  const sorte = sorteDeCapsule(i.adresse, g.cle, p.categoriesFiche, i.interne);
  const deplacable = partieDeplacable(i.adresse, p.categoriesFiche, i.interne);
  const menuOuvert = p.menu === cle;
  /**
   * ══ 🔴🔴 LE « + » CERCLÉ : UN CONTACT, D'UN CÔTÉ CLIENT, QUI N'A PAS ENCORE SA CARTE ═════════════════════════
   *
   * Arno : « En face de chaque capsule de contact Propriétaire ou Locataire qui N'A PAS encore de carte de
   * contact […] Pas de “+” pour les Tiers indépendants, l'agence ni les clients. Le “+” disparaît dès que la
   * carte existe. »
   *
   * 🔴 LES TROIS CONDITIONS SONT LES TROIS PHRASES D'ARNO, dans l'ordre :
   *   · `coteDuGroupe !== null` → ni Tiers indépendant, ni Non affectés (c'est `coteDeLaCategorie` qui le dit) ;
   *   · `deplacable` → ni un client, ni l'agence — exactement la même règle que le glisser, et c'est voulu :
   *     deux définitions de « client » auraient fini par diverger, et le « + » serait apparu sur un propriétaire ;
   *   · pas de carte de ce côté → il disparaît dès qu'elle existe.
   */
  const pastille = pastilleDeCapsule(sorte, g.cle, p.cartesParAdresse.get(cle) ?? new Map());
  const motsPastille = motPastille(pastille, nomLisible);
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — UN CLIENT DONT L'ADRESSE NE PEUT RIEN FILTRER.
   *
   * ⚠️ SEULEMENT POUR UN CLIENT OU L'AGENCE, et non pour un contact : un contact en `.invalid` n'arrive pas dans
   * ces listes (il n'écrit pas), et une de nos adresses n'y est de toute façon listée que si la fiche la porte
   * comme cliente — c'est tout l'objet de la décision d'Arno.
   */
  const aCorriger = (sorte === 'client' || sorte === 'agence') && adresseACorriger(i.adresse, i.interne);
  const motifCorriger = aCorriger ? motifNonSelectionnable(i.adresse, i.interne) : null;
  const fiche = p.fichesClientes.get(cle);

  return (
    <li className={`hdb-capsule hdb-capsule--${g.ton}${deplacable ? '' : ' hdb-capsule--fixe'}`}
      data-capsule=""
      draggable={deplacable}
      title={deplacable ? undefined : MOTIF_NON_DEPLACABLE}
      onDragStart={(e) => {
        if (!deplacable) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', nomLisible);
        e.dataTransfer.effectAllowed = 'move';
        p.onGlisse({ adresse: i.adresse, depuis: g.cle });
      }}
      onDragEnd={() => { p.onGlisse(null); p.onSurvol(null); }}>
      <label className={`hdb-case hdb-case--capsule${aCorriger ? ' hdb-case--muette' : ''}`}
        title={motifCorriger ?? undefined}>
        {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — UNE ADRESSE IMPOSSIBLE NE COCHE RIEN ═══════════════════════
            DÉCISION D'ARNO : « Capsule non sélectionnable pour les mails, avec la mention discrète “adresse à
            corriger dans l'annuaire” (lien vers sa fiche). »

            🔴 DÉSACTIVÉE, ET LE MOTIF EST DIT EN TOUTES LETTRES dans l'info-bulle : une case grise sans
            explication se lit comme une panne. Une adresse interne cocherait « nous », c'est-à-dire presque tous
            les mails du bien ; une adresse en `.invalid` ne désigne personne, par construction (RFC 2606). */}
        <input type="checkbox" checked={!aCorriger && p.reglages.parties.includes(cle)}
          disabled={aCorriger}
          onChange={() => p.onBasculerPartie(i.adresse)} />
        <span className="hdb-personne">
          <span className="hdb-personne-nom">{nomLisible}</span>
          <span className="hdb-compteurs">
            {motDeuxCompteurs(i)}
            {/* ══ 🔴🔴 LA DATE D'UN LOCATAIRE, EN PETIT TEXTE SUR LA LIGNE DES COMPTEURS ════════════════════
                DEMANDE D'ARNO (05/10/2026) : « La date “depuis le 02/09/2022” des locataires passe en petit
                texte sur la ligne des compteurs, pas en encadré. »

                🔴 ELLE RESTE CLIQUABLE — elle règle la période sur ce bail, geste acquis au lot 2 — mais elle
                n'a plus de cadre : un encadré dans une capsule faisait deux objets là où il n'y a qu'une
                information, et c'est ce qui donnait aux capsules de locataires une hauteur à part. */}
            {periode !== null && (
              <>
                {' · '}
                <button type="button" className="hdb-periode-mot"
                  title="Régler la période sur ce bail"
                  onClick={(e) => { e.preventDefault(); p.onPeriode(periode); }}>{periode.mot}</button>
              </>
            )}
            {/* ══ 🔴🔴 LA MENTION D'ARNO, SUR LA LIGNE DES COMPTEURS ET EN PETIT ═════════════════════════════
                « la mention discrète “adresse à corriger dans l'annuaire” (lien vers sa fiche) ». Elle est un
                LIEN quand on sait où mener, et un simple mot sinon : dire le problème vaut mieux que se taire
                parce qu'on n'a pas de porte à offrir. */}
            {aCorriger && (
              <>
                {' · '}
                {fiche !== undefined && p.onFicheClient !== undefined ? (
                  <button type="button" className="hdb-a-corriger"
                    title={`${motifCorriger ?? ''} Ouvrir sa fiche d’annuaire.`}
                    onClick={(e) => { e.preventDefault(); p.onFicheClient?.(fiche.sorte, fiche.id); }}>
                    {MOT_ADRESSE_A_CORRIGER}
                  </button>
                ) : (
                  <span className="hdb-a-corriger hdb-a-corriger--muet">{MOT_ADRESSE_A_CORRIGER}</span>
                )}
              </>
            )}
          </span>
        </span>
      </label>

      {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LA PASTILLE DE DROITE, À TROIS ÉTATS ═════════════════════════
          RÈGLE D'ARNO : « Chaque capsule CONTACT, qu'elle soit côté Propriétaire, côté Locataire ou dans Non
          affectés, porte À DROITE, à côté du “…”, un “+” rouge dans un cercle rouge, toujours visible (pas
          seulement au survol). […] Quand une carte existe déjà pour ce contact : le “+” est remplacé par une
          petite icône “fiche” (même cercle, gris) qui ouvre la carte. Si la carte est encore “à vérifier” (trame
          orange), l'icône est orange. »

          🔴 LE BUT, QU'ARNO DEMANDE DE RAPPELER ICI : ce contact, rattaché à une partie du bien, fait que ses
          PROCHAINS mails rejoignent ce bien tout seuls (cas (f) de `proposerBiens`, branché au point 1 de ce
          lot). Le « + » n'est pas une commodité d'annuaire : c'est la porte de l'automatisation.

          ⚠️ LA CATÉGORIE EST PRÉ-REMPLIE PAR L'ENCART D'OÙ L'ON CLIQUE, et laissée VIDE depuis « Non affectés » —
          où le choix devient donc obligatoire, ce qui est la demande d'Arno à la lettre. `ouvrirCreation` tient
          déjà cette nuance : `a_repartir` n'est pas une déduction, c'est le constat qu'on n'a pas tranché. */}
      {motsPastille !== null && (
        <button type="button"
          className={`hdb-plus hdb-plus--cercle hdb-plus--${pastille}`}
          aria-label={motsPastille.aria}
          title={`${motsPastille.titre} — ${BUT_DU_PLUS}`}
          onClick={() => p.onCreer(i.adresse, g.cle)}>
          {pastille === 'plus' ? '+' : '▤'}
        </button>
      )}

      {/* ══ LE MENU « DÉPLACER VERS… » — LE CHEMIN CLAVIER ══════════════════════════════════════════════════ */}
      {deplacable && (
        <MenuDeplacer cle={cle} nom={nomLisible} depuis={g.cle} ouvert={menuOuvert}
          onOuvrir={() => p.onMenu(menuOuvert ? null : cle)} onFermer={() => p.onMenu(null)}
          onChoisir={(vers, titre) => { void p.onDeplacer(i.adresse, vers, nomLisible, titre); }} />
      )}
    </li>
  );
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 2 — LE MENU « DÉPLACER VERS… », ENTIÈREMENT VISIBLE ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026) : « Le menu ouvert par “…” est entièrement visible : il s'ouvre vers le haut ou
 * vers la gauche s'il manque de place, ne déborde jamais de l'encart, passe au-dessus du défilement de l'encart,
 * et se ferme par Échap ou par un clic à côté. »
 *
 * 🔴🔴 IL EST EN POSITION **FIXE**, ET C'EST LA SEULE FAÇON DE TENIR LA PROMESSE. L'encart a `overflow-y: auto`
 * (hauteur fixe, lot 3) : tout élément positionné À L'INTÉRIEUR y est ROGNÉ, et aucun `z-index` n'y change
 * quoi que ce soit — un conteneur qui défile découpe ses enfants, c'est sa définition. Le menu sort donc du flux
 * et se place par rapport à la FENÊTRE, aux coordonnées du bouton. C'est aussi ce qui le fait « passer au-dessus
 * du défilement de l'encart », littéralement.
 *
 * 🔴 IL SE REPLIE VERS LE HAUT OU VERS LA GAUCHE, et le calcul est fait à l'OUVERTURE, sur des mesures réelles
 * (`getBoundingClientRect`) — jamais sur une supposition de place. Un menu qui déborde en bas de l'écran est
 * inatteignable au doigt ; un menu qui déborde à droite coupe les libellés.
 *
 * ⚠️ ÉCHAP ET LE CLIC À CÔTÉ SONT DEUX SORTIES, et il faut les deux : Échap pour le clavier, le clic pour la
 * souris. Sans la seconde, un menu ouvert par erreur se referme en choisissant quelque chose — c'est-à-dire en
 * faisant un geste qu'on ne voulait pas.
 *
 * ⚠️ ON ÉCOUTE `mousedown` ET NON `click` POUR LE CLIC À CÔTÉ : avec `click`, le relâchement d'un clic commencé
 * AILLEURS ferme le menu avant que le bouton d'un item ne reçoive le sien — et le choix se perd.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function MenuDeplacer({ cle, nom, depuis, ouvert, onOuvrir, onFermer, onChoisir }: {
  cle: string;
  nom: string;
  depuis: CleGroupeParties;
  ouvert: boolean;
  onOuvrir: () => void;
  onFermer: () => void;
  onChoisir: (vers: CleGroupeParties, titre: string) => void;
}) {
  const bouton = useRef<HTMLButtonElement | null>(null);
  const panneau = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ haut: number; gauche: number } | null>(null);

  /**
   * ⚠️ LA MESURE SE FAIT APRÈS LE PREMIER RENDU DU PANNEAU, parce qu'il faut sa taille RÉELLE pour savoir s'il
   * déborde. Il est donc rendu une fois hors de l'écran (`place === null` ⇒ `visibility: hidden`), mesuré, puis
   * posé. Sans cela on le verrait sauter de sa position naïve à la bonne.
   */
  useEffect(() => {
    if (!ouvert) { setPlace(null); return; }
    const b = bouton.current;
    const pan = panneau.current;
    if (b === null || pan === null) return;
    const rb = b.getBoundingClientRect();
    const rp = pan.getBoundingClientRect();
    const marge = 8;
    const placeEnBas = window.innerHeight - rb.bottom;
    /* VERS LE HAUT s'il manque de place en bas ET qu'il y en a davantage au-dessus. */
    const haut = placeEnBas < rp.height + marge && rb.top > placeEnBas
      ? Math.max(marge, rb.top - rp.height - 2)
      : rb.bottom + 2;
    /* VERS LA GAUCHE s'il déborderait à droite. On l'aligne alors sur le bord droit du bouton. */
    const gaucheNaive = rb.left;
    const gauche = gaucheNaive + rp.width + marge > window.innerWidth
      ? Math.max(marge, rb.right - rp.width)
      : gaucheNaive;
    setPlace({ haut, gauche });
  }, [ouvert]);

  /** Échap et le clic à côté : les deux sorties. */
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e: KeyboardEvent): void => { if (e.key === 'Escape') onFermer(); };
    const surClic = (e: MouseEvent): void => {
      const c = e.target as Node | null;
      if (bouton.current?.contains(c) === true || panneau.current?.contains(c) === true) return;
      onFermer();
    };
    document.addEventListener('keydown', surTouche);
    document.addEventListener('mousedown', surClic);
    return () => {
      document.removeEventListener('keydown', surTouche);
      document.removeEventListener('mousedown', surClic);
    };
  }, [ouvert, onFermer]);

  return (
    <>
      <button ref={bouton} type="button" className="hdb-menu-bouton" aria-expanded={ouvert}
        aria-label={`Déplacer ${nom} vers une autre catégorie`} title="Déplacer vers…"
        onClick={onOuvrir}>⋯</button>
      {ouvert && (
        <div ref={panneau} className="hdb-menu" role="group" aria-label={`Déplacer ${nom} vers…`}
          data-pour={cle}
          style={place === null
            ? { visibility: 'hidden', top: 0, left: 0 }
            : { top: `${place.haut}px`, left: `${place.gauche}px` }}>
          {ciblesDeplacement(depuis).map((c) => (
            <button key={c.cle} type="button" className="hdb-menu-item"
              onClick={() => onChoisir(c.cle, c.titre)}>{c.titre}</button>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 1 — L'ENCART NE GRANDIT JAMAIS : IL DÉFILE ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Chaque encart garde la hauteur actuelle (celle de la capture
 * d'Arno, 3 lignes visibles). Il ne grandit jamais. S'il y a plus de contacts, son listing DÉFILE à l'intérieur de
 * l'encart. Quand des contacts sont cachés sous le bas de l'encart, une petite puce flottante en bas, centrée,
 * “↓ 3 autres”, invite à défiler (un clic fait défiler) ; elle disparaît quand on est en bas. Même chose vers le
 * haut (“↑”) si on a défilé. »
 *
 * 🔴 POURQUOI LA HAUTEUR FIXE CHANGE TOUT. Le bien 155 porte 56 adresses côté propriétaire. Déplié, l'encart
 * poussait le fil — ce qu'on vient lire — à plus de deux écrans du tableau de bord. Le repli derrière un compteur
 * (lot 1) répondait au cas extrême ; la hauteur fixe répond au cas ORDINAIRE, celui des huit ou dix contacts.
 *
 * 🔴 LES DEUX PUCES SONT DES BOUTONS, PAS DES DÉCORS. « un clic fait défiler » : chacune avance d'un plein
 * encart. Une flèche purement indicative aurait obligé à viser une barre de défilement de quelques pixels — et
 * il n'y en a aucune sur un téléphone.
 *
 * ⚠️ LE COMPTE EST CALCULÉ PAR LE MODULE PUR (`compteCacheesEnBas`), et il ne compte QUE les capsules
 * ENTIÈREMENT cachées. Une capsule dont on voit trois pixels n'est pas lisible : l'annoncer visible aurait fait
 * dire « ↓ 2 autres » là où il en reste trois, et une puce dont le compte est faux cesse d'être crue.
 *
 * ⚠️ ON MESURE À TROIS MOMENTS, ET IL FAUT LES TROIS : au montage, à chaque défilement, et à chaque changement
 * de contenu (cocher une case réécrit les lignes). Mesurer au seul montage aurait figé « ↓ 3 autres » sur un
 * encart devenu court — le défaut classique de ce genre de puce.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function ListeDefilante({ children, etiquette }: { children: ReactNode; etiquette: string }) {
  const boite = useRef<HTMLDivElement | null>(null);
  const [enBas, setEnBas] = useState(0);
  const [enHaut, setEnHaut] = useState(0);

  const mesurer = useCallback((): void => {
    const el = boite.current;
    if (el === null) return;
    const positions = [...el.querySelectorAll('[data-capsule]')].map((x) => ({
      haut: (x as HTMLElement).offsetTop, hauteur: (x as HTMLElement).offsetHeight,
    }));
    setEnBas(compteCacheesEnBas(positions, el.scrollTop, el.clientHeight));
    setEnHaut(compteCacheesEnHaut(positions, el.scrollTop));
  }, []);

  /* ⚠️ `children` EST DANS LES DÉPENDANCES EXPRÈS : cocher une case recrée les lignes, et le compte doit suivre. */
  useEffect(() => { mesurer(); }, [mesurer, children]);

  /**
   * ══ 🔴 LE CLIC DÉFILE D'UN PLEIN ENCART, ET IL RÈGLE `scrollTop` DIRECTEMENT ═════════════════════════════════
   *
   * ⚠️ PAS `scrollBy`, ET C'EST UNE CORRECTION MESURÉE DANS CHROME. Avec `scrollBy({ top })`, la position était
   * bien atteinte mais la puce gardait son ancien nombre : l'événement `scroll` du navigateur arrive APRÈS les
   * étapes de rendu, et une mesure programmée en `requestAnimationFrame` le précédait — elle lisait la position
   * d'avant. L'affectation de `scrollTop` est, elle, prise en compte immédiatement pour la mise en page : on peut
   * donc mesurer dans le même souffle, et la puce dit juste dès le premier clic. (Le défilement à la molette
   * passe, lui, par `onScroll` — vérifié dans Chrome : « ↓ 43 autres · ↑ remonter ».)
   */
  const pousser = (sens: 1 | -1): void => {
    const el = boite.current;
    if (el === null) return;
    el.scrollTop += sens * el.clientHeight;
    mesurer();
  };

  const motBas = motCacheesEnBas(enBas);
  const motHaut = motCacheesEnHaut(enHaut);

  return (
    <div className="hdb-boite">
      <div className="hdb-defile" ref={boite} onScroll={mesurer}>
        <ul className="hdb-personnes">{children}</ul>
      </div>
      {motHaut !== null && (
        <button type="button" className="hdb-puce hdb-puce--haut"
          aria-label={`Remonter dans le groupe ${etiquette}`} onClick={() => pousser(-1)}>{motHaut}</button>
      )}
      {motBas !== null && (
        <button type="button" className="hdb-puce hdb-puce--bas"
          aria-label={`${enBas} autre${enBas > 1 ? 's' : ''} dans le groupe ${etiquette} — défiler`}
          onClick={() => pousser(1)}>{motBas}</button>
      )}
    </div>
  );
}

/**
 * ══ LE FIL DE MAILS — `LigneVie`, UNE PAR MAIL ════════════════════════════════════════════════════════════════════
 *
 * 🔴 ÉCRIT UNE FOIS, APPELÉ DEUX FOIS (fil plat, et fil regroupé par conversation). Deux montages recopiés
 * auraient divergé à la première retouche, et c'est celui qu'on regarde le moins qui aurait gardé l'écart.
 *
 * ⚠️ L'ANCRE DE « ALLER AU MESSAGE » EST UN `li` PARENT, pas un attribut posé sur `LigneVie` — ce composant est
 * importé tel quel et n'a pas de prop `id` (et lui en ajouter une aurait touché « Vie du bien », ce qui est
 * interdit). Un `ol > li > ol > li` est du HTML valide ; l'enveloppe ne porte aucun style propre.
 */
function FilDeMails({ lignes, maintenant, deplie, categories, surligne, mots, onBasculer, onOuvrirFil }: {
  lignes: readonly LigneHistorique[];
  maintenant: Date;
  deplie: ReadonlySet<number>;
  /** Pour la BARRE DE COULEUR : la catégorie retenue de chaque adresse, clé en minuscules. */
  categories: ReadonlyMap<string, CategoriePartie>;
  /** Le mail d'où l'on est parti, surligné brièvement au retour d'une conversation. */
  surligne: number | null;
  /** Les mots cherchés, surlignés dans l'aperçu de chaque ligne (point 5). */
  mots: readonly string[];
  onBasculer: (messageId: number) => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  return (
    <ol className="vdb-liste hdb-liste">
      {lignes.map((l) => (
        /**
         * ══ 🔴🔴 LA BARRE DE COULEUR EST PORTÉE PAR L'ENVELOPPE, PAS PAR `LigneVie` (lot HISTORIQUE-BIEN-2) ═══
         *
         * Arno : « Une petite BARRE VERTICALE de couleur, à DROITE de chaque mail, selon la catégorie de
         * l'expéditeur ».
         *
         * 🔴 AUCUNE PROP N'EST AJOUTÉE À `LigneVie`, ET C'EST VOULU. Ce composant est importé TEL QUEL et sert
         * aussi la fiche d'un locataire ; lui ajouter une couleur l'aurait modifié pour les deux écrans, et la
         * consigne est de le réutiliser, pas de le retoucher. Le `li` qui portait déjà l'ancre de « Aller au
         * message » porte donc la barre, en `border-right` — zéro élément de plus dans le document.
         */
        <li key={l.messageId} id={`hdb-mail-${l.messageId}`}
          className={`hdb-ancre hdb-barre hdb-barre--${tonDeLExpediteur(l, categories)}`
            + `${surligne === l.messageId ? ' hdb-ancre--surlignee' : ''}`}>
          <ol className="vdb-liste">
            <LigneVie l={l} maintenant={maintenant} ouvert={deplie.has(l.messageId)}
              surligner={mots}
              onBasculer={() => onBasculer(l.messageId)} onOuvrirFil={onOuvrirFil} />
          </ol>
        </li>
      ))}
    </ol>
  );
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 4 — LA BASCULE DU RÉSUMÉ, ÉCRITE UNE FOIS ══════════════════════════════════
 *
 * DEMANDE D'ARNO (05/10/2026) : « Le bouton “13 pièces — voir les pièces” devient “13 pièces dans cette
 * sélection — les voir” (et “— les masquer” quand elles sont ouvertes). Il ouvre et ferme le résumé. Le MÊME
 * bouton est ajouté EN BAS du listing des mails. »
 *
 * 🔴 « LE MÊME BOUTON » EST PRIS AU MOT : un seul composant, monté deux fois, lié au même état. Deux boutons
 * recopiés auraient divergé au premier ajustement de libellé — et c'est celui du bas, qu'on voit moins souvent,
 * qui aurait gardé l'ancien mot.
 *
 * ⚠️ LES TROIS MOTS AJOUTÉS (« dans cette sélection ») SONT LA CORRECTION DU POINT 1, DITE À L'ÉCRAN : le résumé
 * couvre la sélection, pas la page — et c'est l'ancien libellé qui avait fait croire le contraire.
 */
function BasculeResume({ n, ouvert, onBasculer }: { n: number; ouvert: boolean; onBasculer: () => void }) {
  return (
    <button type="button" className="pdc-trombone" aria-expanded={ouvert} onClick={onBasculer}>
      <span aria-hidden="true">📎</span> {motPiecesSelection(n)}
      <span className="hdb-resume-mot"> {motBasculeResume(ouvert)}</span>
    </button>
  );
}

/**
 * ══ 🔴🔴 LE RÉSUMÉ, EN LIGNE ET SANS FENÊTRE ══════════════════════════════════════════════════════════════════════
 *
 * Le MÊME montage que `ModalePiecesConversation` — groupes par message sous la date, `CartePieceConversation`
 * pour chaque pièce, le repli des dépôts et des emplacements sur les autres apparitions du même contenu — mais
 * posé DANS la page. Arno : « un résumé en HAUT et en BAS du fil », pas une fenêtre de plus à fermer.
 *
 * ⚠️ LE REPLI SUR `autresApparitions` EST REPRIS MOT POUR MOT de la fenêtre, et ce n'est pas une recopie de
 * confort : le dépôt est enregistré contre LA pièce rangée. Si l'on a rangé la copie du 30/09 et que la carte
 * montre celle du 23/09, chercher le dépôt sur le seul identifiant affiché ferait disparaître la mention — et
 * l'on rangerait une seconde fois un fichier déjà rangé.
 */
function ResumePieces({
  groupes, depots, emplacements, maintenant, gestes, sansEmpreinte, categories,
}: {
  groupes: readonly GroupeDePieces<PieceDedoublonnee>[];
  depots: ReadonlyMap<number, DepotAffiche>;
  emplacements: ReadonlyMap<number, readonly EmplacementPiece[]>;
  maintenant: Date;
  gestes: GestesPiece;
  sansEmpreinte: number;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 4 — LE LISERÉ DE CATÉGORIE JUSQUE DANS LE RÉSUMÉ ══════════════════════
   *
   * DEMANDE D'ARNO : « Dans le résumé, chaque groupe de pièces (par mail) et chaque miniature porte le même
   * liseré de couleur que les mails, des deux côtés, selon la catégorie de l'expéditeur : rouge propriétaire,
   * vert locataire, bleu tiers, sans couleur pour nous. »
   *
   * 🔴 C'EST LA MÊME RÈGLE, PAR LA MÊME FONCTION (`tonDeLExpediteur`), et le groupe porte déjà ce qu'elle
   * demande : `sens` et `de`. Recalculer la catégorie ici aurait fait un second juge — et un document aurait pu
   * être rouge dans le listing et bleu dans le résumé, pour le même mail.
   */
  categories: ReadonlyMap<string, CategoriePartie>;
}) {
  return (
    <div className="hdb-pieces">
      {groupes.map((g) => (
        <section key={g.messageId}
          className={`pdc-groupe hdb-barre hdb-barre--${tonDeLExpediteur(g, categories)}`}>
          <h6 className="pdc-groupe-titre">
            <span className="pdc-groupe-date">{dateHeureCourte(g.recuLe, maintenant)}</span>
            <span className="pdc-groupe-qui" title={dateHeureComplete(g.recuLe)}> · {mentionExpediteurPiece(g)}</span>
            {(g.objet ?? '').trim() !== '' && (
              <span className="pdc-groupe-objet"> · {nettoyerObjet(g.objet ?? '')}</span>
            )}
          </h6>
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 5 — LE LISERÉ RESTE SUR LE BLOC, PAS SUR LES MINIATURES ═════
              RÈGLE D'ARNO : « le liseré de couleur reste UNIQUEMENT sur le bloc qui regroupe les pièces d'un
              mail. Retire-le des miniatures elles-mêmes. »

              🔴 C'EST L'INVERSE DU LOT 4, OÙ IL EN DEMANDAIT LES DEUX (« chaque groupe de pièces et chaque
              miniature porte le même liseré »). Sa nouvelle règle est meilleure, et pour une raison qui se
              voit : un bloc de six pièces portait SEPT liserés de la même couleur — un par carte, plus celui
              du bloc —, et la couleur ne désignait donc plus rien. Posée une fois sur le bloc, elle dit ce
              qu'elle a toujours voulu dire : « ces pièces viennent d'un mail de cette catégorie ».

              ⚠️ LA TEINTE ÉTAIT TRANSMISE PAR UNE VARIABLE CSS, et c'est elle qui disparaît avec la règle : la
              carte `CartePieceConversation` n'a jamais été modifiée (elle sert aussi la fenêtre d'une
              conversation), et elle ne l'est pas davantage ici. La grille redevient une grille. */}
          <ul className="pdc-grille">
            {g.pieces.map((p) => (
              <CartePieceConversation key={p.pieceId} piece={p} maintenant={maintenant} gestes={gestes}
                emplacements={emplacements.get(p.pieceId)
                  ?? p.autresApparitions.map((a) => emplacements.get(a.pieceId)).find((e) => e !== undefined)
                  ?? []}
                depot={depots.get(p.pieceId)
                  ?? p.autresApparitions.map((a) => depots.get(a.pieceId)).find((d) => d !== undefined)} />
            ))}
          </ul>
        </section>
      ))}
      {/* 🔴 LE REPLI SE DIT. Sans empreinte, le rapprochement n'est qu'une présomption : qui lit la liste doit
          savoir laquelle des deux il regarde. Rien ne s'affiche dans le cas ordinaire. */}
      {sansEmpreinte > 0 && (
        <p className="gst-note pdc-note pdc-presomption">
          {sansEmpreinte === 1 ? 'Une pièce a été rapprochée' : `${sansEmpreinte} pièces ont été rapprochées`}
          {' '}sur son nom et sa taille, faute d’empreinte : nous n’en avons pas gardé le contenu.
        </p>
      )}
    </div>
  );
}

/**
 * Le style du bloc. UNIQUEMENT des jetons `--color-svv-*` : aucune couleur en dur, rien sur `:root`, et tout se
 * replie en une colonne sur un iPhone en portrait (390 px).
 *
 * ⚠️ IL EMPORTE `CSS_PIECES_CONVERSATION` (donc le picto Drive), `CSS_VIE_DU_BIEN` et `CSS_PIECES` : le bloc rend
 * les composants de ces trois familles, et un style monté « quelque part plus haut dans la page » est une
 * dépendance invisible — le jour où « Vie du bien » quitte la fiche, ce bloc perdrait ses lignes sans un mot.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS LES COMMENTAIRES CI-DESSOUS : ils vivent dans un litteral gabarit, qu'un seul accent
 * grave terminerait au milieu du CSS (piege deja paye une vingtaine de fois dans ce module).
 */
export const CSS_HISTORIQUE_DU_BIEN = `
${CSS_PIECES_CONVERSATION}
${CSS_VIE_DU_BIEN}
${CSS_PIECES}
.hdb{min-width:0}
/* ── L'EVENEMENT EN COURS ── Le mot porte l'information, la capsule l'appuie. */
.hdb-evt{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:0 0 .5rem;min-width:0}
.hdb-evt-capsule{font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;flex:0 0 auto;
  background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border:1px solid var(--color-svv-amber-soft)}
.hdb-evt-nom{font-size:.88rem;color:var(--color-svv-ink);overflow-wrap:anywhere;min-width:0}
.hdb-evt-date{font-size:.76rem;color:var(--color-svv-muted)}
.hdb-occupant{margin:0 0 .6rem;font-size:.85rem;color:var(--color-svv-ink);overflow-wrap:anywhere}

/* ══ LE TABLEAU DE BORD — DES BANDES HORIZONTALES EMPILEES (lot HISTORIQUE-BIEN-2) ═══════════════════════════
   DEMANDE D'ARNO : « Arno n'aime pas la mise en page actuelle en colonne : refonte complete en blocs
   horizontaux empiles. » Les trois paves ne se partagent donc plus la largeur en colonnes etroites : chacun la
   prend toute, et c'est SON CONTENU qui s'etale. Sur un telephone, chaque bande se replie d'elle-meme. */
.hdb-bord{display:flex;flex-direction:column;gap:8px;margin-bottom:.7rem;min-width:0}
.hdb-pave--bande{width:100%}
/* La bande : les choix a gauche, la periode retenue a droite ; elle passe dessous quand la largeur manque. */
.hdb-bande{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;min-width:0}
.hdb-segments{display:flex;flex-wrap:wrap;gap:.35rem;min-width:0;flex:1 1 20rem}
/* LES BOUTONS SEGMENTES — 44 px de cible, l'etat dit par l'aspect ET par aria-pressed. */
.hdb-seg{min-height:44px;padding:.35rem .8rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);
  font:inherit;font-size:.8rem;text-align:left;color:var(--color-svv-muted);background:var(--color-svv-surface);
  cursor:pointer;min-width:0;max-width:100%}
.hdb-seg:hover:not(:disabled){color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.hdb-seg:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ L'ETAT SELECTIONNE EST ROUGE (lot HISTORIQUE-BIEN-4, point 3) ════════════════════════════════════════════
   DEMANDE D'ARNO : « Dans tout le bloc (Periode, Options, Pieces jointes Toutes/Avec/Sans…), l'etat selectionne
   est ROUGE (la couleur d'accent de l'application), pas noir. Contraste lisible en Clair et en Sombre. »

   🔴 LE TEXTE EST --color-svv-surface, ET NON UN BLANC EN DUR. Le garde de ce fichier interdit toute couleur
   ecrite a la main dans ses propres regles — et il m'a arrete ici, jusque dans ce commentaire, ce qui est juste :
   il ne distingue pas un commentaire d'une regle, et une couleur citee finit par etre recopiee.

   Le raisonnement, en mots : le rouge du depot est FONCE en Clair et CLAIR en Sombre ; la surface fait l'inverse.
   Les deux jetons varient donc en sens contraire, et le contraste tient des deux cotes — texte clair sur rouge
   fonce en Clair, texte fonce sur rouge clair en Sombre. Un blanc fixe n'aurait tenu que d'un cote. */
.hdb-seg--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);
  font-weight:700}
/* GRISE : l'oeil le voit, et le MOTIF est ecrit sous la bande — une infobulle n'existe pas sur un telephone. */
.hdb-seg:disabled{opacity:.5;cursor:not-allowed}
/* LA PERIODE RETENUE — toujours ecrite, jamais devinee d'apres les champs de date. */
.hdb-effective{display:flex;flex-direction:column;gap:0;margin:0;flex:0 1 auto;min-width:0;text-align:right}
.hdb-effective-mot{font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.hdb-effective-valeur{font-size:.86rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* LA LISTE DEROULANTE DES EVENEMENTS — pleine largeur : les references et les objets sont longs. */
.hdb-select-ligne{display:flex;flex-direction:column;gap:.15rem;margin-top:.45rem;min-width:0}
.hdb-select{min-height:44px;font-size:.82rem;width:100%;min-width:0}
.hdb-pave{min-width:0;margin:0;padding:.5rem .6rem .6rem;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-surface)}
.hdb-legende{padding:0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.hdb-boutons{display:flex;flex-wrap:wrap;gap:.35rem;min-width:0}
/* ══ BLOC OPTIONS ── UNE SEULE RANGEE, PROPRE ET ALIGNEE (lot HISTORIQUE-BIEN-3, point 5) ═════════════════════
   DEMANDE D'ARNO, qui juge l'actuel « immonde » : « Hauteurs identiques, espacements reguliers, aucun bouton qui
   passe seul a la ligne ; sur ecran etroit, retour a la ligne propre par groupes. »

   🔴 « AUCUN BOUTON SEUL A LA LIGNE » EST TENU PAR LA STRUCTURE : chaque controle est un GROUPE indivisible
   (.hdb-opt), et c'est ENTRE les groupes que la rangee se casse. Un flex-wrap sur des boutons nus aurait laisse
   « Sans » tomber seul sous ses deux voisins — le defaut exact qu'Arno a sous les yeux.

   🔴 UNE SEULE HAUTEUR, NOMMEE UNE FOIS : --hdb-h. Trois valeurs recopiees auraient suffi a desaligner la
   rangee d'un pixel, et c'est tout ce qu'il faut pour qu'elle paraisse bricolee. */
.hdb-rangee{--hdb-h:38px;display:flex;flex-wrap:wrap;align-items:center;gap:.45rem .6rem;min-width:0}
.hdb-opt{display:flex;align-items:center;gap:.35rem;min-width:0;flex:0 0 auto}
.hdb-opt-mot{font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted);white-space:nowrap}
/* LA RECHERCHE prend la place qui reste, et jamais moins de 14 rem : en dessous, le texte d'invite se coupe. */
.hdb-opt--recherche{flex:1 1 14rem;min-width:0;position:relative}
.hdb-opt--recherche{height:var(--hdb-h);border-radius:999px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);padding:0 .3rem 0 .6rem}
.hdb-opt--recherche:focus-within{border-color:var(--color-svv-red)}
.hdb-loupe{display:inline-flex;flex:0 0 auto;color:var(--color-svv-muted)}
/* LE CHAMP est NU dans son cadre : un second bord a l'interieur du premier se voit, et se voit mal. */
.hdb-champ-recherche{flex:1 1 auto;min-width:0;height:100%;border:0;background:none;font:inherit;
  font-size:.82rem;color:var(--color-svv-ink);outline:none}
.hdb-champ-recherche::-webkit-search-cancel-button{display:none}
.hdb-effacer{flex:0 0 auto;width:26px;height:26px;border-radius:999px;border:0;background:none;font:inherit;
  font-size:.75rem;color:var(--color-svv-muted);cursor:pointer}
.hdb-effacer:hover{background:var(--color-svv-surface);color:var(--color-svv-ink)}
.hdb-effacer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* LE CONTROLE SEGMENTE : des boutons colles dans un seul cadre, comme une bascule de messagerie. */
.hdb-segs{display:inline-flex;flex:0 0 auto;border-radius:999px;border:1px solid var(--color-svv-line-strong);
  overflow:hidden;height:var(--hdb-h)}
.hdb-petit{height:var(--hdb-h);padding:0 .7rem;border:0;background:var(--color-svv-surface);font:inherit;
  font-size:.78rem;color:var(--color-svv-muted);cursor:pointer;white-space:nowrap}
.hdb-segs .hdb-petit+.hdb-petit{border-left:1px solid var(--color-svv-line)}
.hdb-petit:hover{color:var(--color-svv-ink)}
.hdb-petit:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.hdb-petit--actif{background:var(--color-svv-red);color:var(--color-svv-surface);font-weight:700}
/* L'ORDRE est un bouton seul : il porte donc son propre cadre arrondi, a la MEME hauteur. */
.hdb-petit--large{border-radius:999px;border:1px solid var(--color-svv-line-strong)}
.hdb-petit--large:hover{border-color:var(--color-svv-line-strong-hover)}
/* LA PUCE BASCULE : un seul etat a dire, donc un seul bouton — et l'etat se lit par l'aspect ET par
   aria-pressed, parce qu'une couleur seule ne dit rien a qui ne la voit pas. */
.hdb-puce-bascule{height:var(--hdb-h);padding:0 .8rem;border-radius:999px;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);font:inherit;
  font-size:.78rem;color:var(--color-svv-muted);cursor:pointer;white-space:nowrap}
.hdb-puce-bascule:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.hdb-puce-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LA PUCE BASCULE ALLUMEE EST UNE SELECTION COMME LES AUTRES : elle passe donc au rouge, et non a l'ambre.
   Un second ton pour un meme etat aurait oblige a apprendre deux codes pour une seule idee. */
.hdb-puce-bascule--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);
  color:var(--color-svv-surface);font-weight:700}
/* LA BASCULE A CASE garde la MEME hauteur que ses voisins : sans cela, la rangee se decale d'un pixel. */
.hdb-bascule{display:inline-flex;align-items:center;gap:.4rem;height:var(--hdb-h);padding:0 .2rem;
  font-size:.78rem;color:var(--color-svv-ink);cursor:pointer;white-space:nowrap}
.hdb-bascule input{width:18px;height:18px;flex:0 0 auto;accent-color:var(--color-svv-red)}
/* « N MAILS SUR M », en direct. Pousse a droite de la rangee : c'est un resultat, pas un reglage. */
.hdb-compte-recherche{margin:0 0 0 auto;font-size:.74rem;font-weight:700;color:var(--color-svv-red);
  white-space:nowrap}
/* 44 px de cible sur TOUT ce qui se clique : sur un telephone, 36 px se rate une fois sur trois. */
.hdb-choix{display:inline-flex;flex-direction:column;align-items:flex-start;gap:.1rem;min-height:44px;
  padding:.35rem .7rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);font:inherit;
  font-size:.8rem;text-align:left;color:var(--color-svv-muted);background:var(--color-svv-surface);cursor:pointer;
  min-width:0;max-width:100%}
.hdb-choix:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.hdb-choix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'ETAT ACTIF se dit par son ASPECT *et* par aria-pressed : une couleur seule ne dit rien a qui ne la voit pas. */
.hdb-choix--actif{background:var(--color-svv-red);border-color:var(--color-svv-red);color:var(--color-svv-surface);
  font-weight:700}
/* 🔴 LOT HISTORIQUE-BIEN-2 — LES REGLES DES ANCIENNES RANGEES DE BOUTONS (un bouton par evenement, un par
   locataire) ONT ETE RETIREES AVEC ELLES : la periode se choisit maintenant par quatre boutons segmentes et une
   liste deroulante. Plus aucun element ne rendait .hdb-choix--evt, --occ, .hdb-evts, .hdb-occs ni leurs mots. */
.hdb-dates{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.4rem}
.hdb-date{display:flex;flex-direction:column;gap:.15rem;min-width:0;flex:1 1 9rem}
.hdb-champ-date{min-height:44px;font-size:.82rem;min-width:0;width:100%}
.hdb-note{margin:.3rem 0 0}

/* ══ LES PARTIES — QUATRE GROUPES COTE A COTE, EMPILES QUAND LA LARGEUR MANQUE ════════════════════════════════
   DEMANDE D'ARNO : « Quatre rangees ou groupes, cote a cote si la largeur le permet, sinon empiles. »
   auto-fit fait exactement cela, sans point de rupture ecrit a la main : quatre colonnes sur un grand ecran,
   deux sur une tablette, UNE a 390 px. Un minmax plus etroit aurait coupe les adresses en deux. */
/* ══ LOT HISTORIQUE-BIEN-3 — DEUX ENCARTS COTE A COTE, PUIS DEUX BANDES PLEINE LARGEUR ════════════════════════
   DEMANDE D'ARNO : « “Tiers independant” : une ligne deployable SOUS les deux encarts, pleine largeur, bleue,
   repliee par defaut. Meme chose pour “Non affectes” (grise). » Les deux encarts se partagent donc la largeur,
   et les bandes la prennent toute — ce qui leur donne, repliees, la hauteur d'une seule ligne. */
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — DEUX COLONNES, PAS « AUTANT QU'IL EN RESTE » ═══════════════════════
   REGLE D'ARNO : « les deux encarts sont TOUJOURS affiches cote a cote, meme largeur : Proprietaire a GAUCHE,
   Locataire a DROITE (comme avant le lot 4). Sur ecran etroit seulement, les encarts passent l'un sous
   l'autre, Proprietaire en premier. »

   🔴 L'ANCIENNE GRILLE ETAIT LA MOITIE DU DEFAUT : repeat(auto-fit, minmax(240px, 1fr)). auto-fit **replie les pistes vides** :
   avec un seul enfant, il ne reste qu'une colonne et elle prend la ligne entiere. C'est ce qu'Arno a vu —
   l'encart Locataire etendu sur toute la largeur. Deux pistes ecrites 1fr 1fr ne se replient pas : deux colonnes egales, toujours,
   et l'encart vide garde sa moitie.

   🔴 L'EMPILEMENT RESTE, MAIS IL EST DIT : une seule colonne sous 34rem. C'est une requete de media et non plus
   un effet de bord d'auto-fit — on sait donc OU la bascule se produit, et l'ordre du DOM (Proprietaire d'abord)
   donne gratuitement « Proprietaire en premier ».

   ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 3 — LES DEUX ENCARTS ONT TOUJOURS LA MEME HAUTEUR ══════════════════════
   REGLE D'ARNO : « les encarts Proprietaire et Locataire ont TOUJOURS la meme hauteur (celle du plus grand,
   plafonnee a la hauteur maximale d'avant defilement), meme si l'un est vide. Le texte d'encart vide est centre
   verticalement. »

   🔴 CE QUE J'AVAIS ECRIT AU LOT 5, ET QU'ARNO TRANCHE AUTREMENT : align-items:start. Mon motif etait qu'un
   encart vide ne s'etire pas a la hauteur de son voisin ; Arno veut justement qu'il s'etire, parce que deux
   encarts de hauteurs differentes font un bloc de guingois. Sa regle gagne, et elle est plus simple : la
   VALEUR PAR DEFAUT d'une grille — stretch — donne exactement « la hauteur du plus grand », sans une ligne.

   🔴 ET LE PLAFOND EST DEJA TENU, SANS RIEN AJOUTER : la liste de chaque encart est bornee par
   la variable --hdb-liste-h (8,75 rem) et defile au-dela. Le plus grand des deux ne peut donc pas la depasser,
   et « la hauteur du plus grand » est donc « plafonnee a la hauteur maximale d'avant defilement » par
   construction. Un max-height de plus sur l'encart aurait fait un second plafond a tenir. */
.hdb-encarts{display:grid;gap:8px;grid-template-columns:1fr 1fr;align-items:stretch;margin-top:.5rem;
  min-width:0}
@media (max-width:34rem){.hdb-encarts{grid-template-columns:1fr}}
/* 🔴 UN ENCART EST UNE COLONNE : sa tete en haut, et ce qui suit prend la place restante. C'est ce qui permet au
   texte d'un encart vide de se centrer VERTICALEMENT, comme Arno le demande.
   ⚠️ LES BANDES NE SONT PAS CONCERNEES : elles sont pleine largeur et leur hauteur n'a pas de jumelle. */
.hdb-groupe--encart{display:flex;flex-direction:column}
.hdb-groupe--encart .hdb-vide-mot{flex:1 1 auto;display:flex;align-items:center;justify-content:center;
  text-align:center;margin:.35rem 0}
.hdb-groupe--bande{margin-top:8px}
/* ⚠️ LA ZONE SURVOLEE SE SURLIGNE DANS SA COULEUR (demande d'Arno), et le bord s'epaissit : la couleur seule ne
   dit rien a qui ne la voit pas, l'epaisseur se voit toujours. */
.hdb-groupe--cible{border-style:dashed;border-width:2px;border-left-width:4px}
.hdb-groupe--rouge.hdb-groupe--cible{border-color:var(--color-svv-red);background:var(--color-svv-red-soft)}
.hdb-groupe--vert.hdb-groupe--cible{border-color:var(--color-svv-green);background:var(--color-svv-green-soft)}
.hdb-groupe--bleu.hdb-groupe--cible{border-color:var(--color-svv-blue);background:var(--color-svv-blue-soft)}
.hdb-groupe--gris.hdb-groupe--cible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
/* Une bande vide survolee le DIT : sans ce mot, on lacherait la capsule sur un rectangle muet. */
.hdb-vide-depot{margin:.3rem 0 .1rem;font-size:.74rem;color:var(--color-svv-muted);text-align:center}
/* 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 1 — LE « TEXTE DISCRET » D'UN ENCART VIDE. Discret veut dire petit et gris,
   pas illisible : c'est le ton des notes du bloc (--color-svv-muted), et il tient sur deux lignes a 390 px. */
.hdb-vide-mot{margin:.35rem 0 .2rem;font-size:.76rem;color:var(--color-svv-muted);line-height:1.35}
/* 🔴🔴 LOT HISTORIQUE-BIEN-5, POINT 2 — LA CASE « tout le groupe » D'UN GROUPE VIDE. Elle garde sa place (la
   ligne ne change pas de forme selon le bien) et dit qu'elle n'a rien a cocher : estompee, curseur par defaut.
   ⚠️ L'ESTOMPE N'EST PAS LA SEULE INDICATION : l'attribut disabled la porte aussi pour qui ne voit pas la
   couleur, et c'est lui qui empeche reellement le clic. */
.hdb-case--muette{opacity:.5;cursor:default}
.hdb-case--muette input{cursor:default}
/* ── LES QUATRE TONS ── Le bord gauche porte la couleur du groupe : la MEME que la barre des mails qui en
   viennent. Les jetons vivent dans globals.css ; aucune couleur en dur ici, donc rien d'illisible en sombre. */
.hdb-groupe{margin:0;min-width:0;padding:.3rem .4rem .4rem .55rem;border-radius:.5rem;
  border:1px solid var(--color-svv-line);border-left-width:4px;background:var(--color-svv-surface)}
.hdb-groupe--rouge{border-left-color:var(--color-svv-red)}
.hdb-groupe--vert{border-left-color:var(--color-svv-green)}
/* LE BLEU EST UN JETON DU DEPOT (--color-svv-blue, defini dans les DEUX modes) : rien n'est invente ici.
   Un #rrggbb ecrit a la main aurait produit un bleu illisible en sombre — ce que le depot interdit et verifie. */
.hdb-groupe--bleu{border-left-color:var(--color-svv-blue)}
.hdb-groupe--gris{border-left-color:var(--color-svv-line-strong)}
.hdb-groupe-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;min-width:0}
.hdb-replier{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .4rem;flex:1 1 8rem;
  border:0;background:none;font:inherit;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);
  cursor:pointer;text-align:left;min-width:0}
.hdb-replier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdb-triangle{display:inline-block;font-size:.7rem;color:var(--color-svv-red);transition:transform .15s ease}
.hdb-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.hdb-triangle{transition:none}}
/* 🔴 LOT HISTORIQUE-BIEN-2 — .hdb-tout est RETIREE AVEC SON BOUTON : « tout le groupe » est devenu une CASE
   a trois etats (demande d'Arno), et plus aucun element ne rendait ce bouton. */
.hdb-personnes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
/* ══ L'ENCART NE GRANDIT JAMAIS : IL DEFILE (lot HISTORIQUE-BIEN-3, point 1) ══════════════════════════════════
   DEMANDE D'ARNO : « Chaque encart garde la hauteur actuelle (3 lignes visibles). Il ne grandit jamais. »

   🔴 LA HAUTEUR EST UN JETON NOMME, et non un nombre glisse dans une regle : trois capsules de 44 px plus leurs
   deux interlignes de 2 px. L'ecrire ainsi dit POURQUOI c'est cette valeur, et un jour ou la capsule changera de
   hauteur, il n'y aura qu'un endroit a corriger.

   ⚠️ L'overscroll-behavior: contain EMPECHE LE DEFILEMENT DE FUIR VERS LA PAGE : sans lui, arriver en bas de
   l'encart emporte la page entiere, et l'on perd le tableau de bord qu'on etait en train de regler. */
.hdb-boite{position:relative;min-width:0;margin-top:.2rem}
.hdb-defile{max-height:var(--hdb-liste-h);overflow-y:auto;overscroll-behavior:contain;min-width:0;
  scrollbar-width:thin}
.hdb-groupe{--hdb-liste-h:8.75rem}
/* ══ LA PUCE FLOTTANTE ── centree, petite, et c'est un BOUTON : un clic fait defiler d'un plein encart.
   Une fleche purement indicative aurait oblige a viser une barre de defilement de quelques pixels — et il n'y en
   a aucune sur un telephone. */
/* 🔴 AUCUNE OMBRE, ET C'EST UN CHOIX CONTRAINT : ce depot n'a pas de jeton d'ombre, et le garde de ce fichier
   interdit toute couleur en dur dans ses propres regles (il a raison : un rgba ecrit ici serait la meme teinte
   dans les deux themes). La puce se detache donc par un bord EPAIS et un fond de surface surelevee — deux
   jetons, lisibles en Clair comme en Sombre. */
.hdb-puce{position:absolute;left:50%;transform:translateX(-50%);z-index:1;min-height:22px;padding:0 .55rem;
  border-radius:999px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface-raised);
  font:inherit;font-size:.66rem;font-weight:700;color:var(--color-svv-ink);cursor:pointer;white-space:nowrap}
.hdb-puce:hover{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.hdb-puce:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdb-puce--bas{bottom:-3px}
.hdb-puce--haut{top:-3px}
.hdb-case{display:flex;align-items:center;gap:.45rem;min-height:44px;padding:.1rem .3rem;font-size:.8rem;
  color:var(--color-svv-ink);cursor:pointer;min-width:0;border-radius:.4rem}
.hdb-case:hover{background:var(--color-svv-field)}
.hdb-case input{width:18px;height:18px;flex:0 0 auto;accent-color:var(--color-svv-red)}
.hdb-case--large{font-weight:700}
/* LA CASE « tout le groupe » — trois etats, dont indeterminate quand une partie seulement est cochee. */
.hdb-case--groupe{font-size:.72rem;color:var(--color-svv-muted);min-height:36px;flex:0 0 auto}
/* ══ LA CAPSULE ── une pastille arrondie : case a cocher, nom, compteurs, et la date pour les locataires.
   🔴 ELLE EST DEPLACABLE A LA SOURIS. Le draggable vit sur l'enveloppe et non sur le label : pose sur le
   label, il capture dans certains navigateurs le clic qui coche la case — c'est-a-dire le geste le plus frequent
   du bloc. */
/* ══ LOT HISTORIQUE-BIEN-4, POINT 2 — UN SEUL FORMAT POUR TOUTES LES CAPSULES ═════════════════════════════════
   DEMANDE D'ARNO : « Retire le lisere de couleur en arc de cercle a gauche des capsules. TOUTES les capsules
   prennent le format des capsules cote proprietaire : nom sur une ligne, compteurs en dessous, “…” a droite.
   Meme hauteur pour toutes. »

   🔴 LE LISERE PARTAIT EN ARC parce qu'un bord gauche de 3 px sur un rayon de 999 px suit la courbe : il se
   lisait comme une rognure, pas comme une couleur. La categorie est deja dite par l'encart qui porte la
   capsule — la repeter sur chaque pastille etait du bruit.

   🔴 UNE SEULE HAUTEUR, NOMMEE : --hdb-caps. C'est ce qui aligne les quatre groupes cote a cote ; trois valeurs
   recopiees auraient suffi a donner aux locataires une hauteur a part, ce qui etait justement le defaut. */
.hdb-capsule{--hdb-caps:46px;display:flex;flex-wrap:nowrap;align-items:center;gap:.3rem;min-width:0;
  min-height:var(--hdb-caps);border-radius:999px;border:1px solid var(--color-svv-line);
  background:var(--color-svv-surface);padding:.1rem .35rem .1rem .1rem;cursor:grab}
.hdb-capsule:active{cursor:grabbing}
.hdb-capsule:hover{border-color:var(--color-svv-line-strong)}
/* LES CLIENTS NE SE DEPLACENT PAS : curseur « interdit », et l'infobulle dit POURQUOI (mot d'Arno). */
.hdb-capsule--fixe{cursor:not-allowed;background:var(--color-svv-field)}
.hdb-case--capsule{flex:1 1 auto;min-width:0;min-height:calc(var(--hdb-caps) - 4px)}
/* LE NOM SUR UNE LIGNE, LES COMPTEURS EN DESSOUS (format de la capture d'Arno). */
.hdb-personne-nom{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* LA DATE D'UN LOCATAIRE : petit texte sur la ligne des compteurs, SANS cadre (demande d'Arno). */
.hdb-periode-mot{border:0;background:none;padding:0;margin:0;font:inherit;font-size:inherit;
  color:var(--color-svv-muted);text-decoration:underline;text-decoration-style:dotted;cursor:pointer}
.hdb-periode-mot:hover{color:var(--color-svv-ink)}
.hdb-periode-mot:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* ══ LE MENU « DEPLACER VERS… » ── le chemin clavier, indispensable : le glisser n'existe ni au clavier ni sous
   un doigt. Il passe par la MEME porte d'ecriture. */
.hdb-menu-bouton{width:28px;min-height:28px;border-radius:999px;border:1px solid var(--color-svv-line);
  background:transparent;font:inherit;font-size:.9rem;line-height:1;color:var(--color-svv-muted);cursor:pointer}
.hdb-menu-bouton:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.hdb-menu-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ LE MENU EST EN POSITION **FIXE** (lot HISTORIQUE-BIEN-4, point 2) ════════════════════════════════════════
   L'encart a overflow-y: auto : tout element positionne A L'INTERIEUR y est ROGNE, et aucun z-index n'y change
   quoi que ce soit — un conteneur qui defile decoupe ses enfants, c'est sa definition. Le menu sort donc du flux
   et se place par rapport a la FENETRE, aux coordonnees mesurees du bouton. C'est aussi ce qui le fait « passer
   au-dessus du defilement de l'encart », litteralement. */
.hdb-menu{position:fixed;z-index:60;display:flex;flex-direction:column;
  min-width:11rem;max-width:min(18rem,calc(100vw - 16px));border-radius:.5rem;
  border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface-raised);overflow:hidden}
.hdb-menu-item{min-height:40px;padding:0 .7rem;border:0;background:none;font:inherit;font-size:.78rem;
  text-align:left;color:var(--color-svv-ink);cursor:pointer;white-space:nowrap}
.hdb-menu-item:hover{background:var(--color-svv-field)}
.hdb-menu-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* ══ LE MESSAGE D'APRES-DEPOT ── « Fanny Rosky → Locataire », avec « Annuler » quelques secondes. */
.hdb-fait{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin:.5rem 0 0;padding:.35rem .6rem;
  border-radius:.5rem;border:1px solid var(--color-svv-green);background:var(--color-svv-green-soft);
  font-size:.8rem;color:var(--color-svv-green-ink);min-width:0}
.hdb-fait-mot{font-weight:700;overflow-wrap:anywhere;min-width:0}
.hdb-fait-annuler{min-height:32px;padding:0 .6rem;border-radius:.4rem;border:1px solid var(--color-svv-green);
  background:transparent;font:inherit;font-size:.76rem;font-weight:700;color:var(--color-svv-green-ink);
  cursor:pointer}
.hdb-fait-annuler:hover{background:var(--color-svv-surface)}
.hdb-fait-annuler:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* Une ligne de personne : la case a gauche, la periode et le « + » a droite.
   ⚠️ ELLE S'ENROULE. Les quatre groupes sont des colonnes etroites, et un nom reel y tient rarement sur une
   ligne (« NADKARNI BHARGAVA Esha Rajan et Sanjana »). Sans enroulement, la periode ecrasait le nom sur trois
   lignes de deux mots — mesure faite a l'ecran sur le bien 155. La periode passe donc dessous quand il faut. */
.hdb-personne-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .3rem;min-width:0}
.hdb-personne-ligne>.hdb-case{flex:1 1 9rem;min-width:0}
/* LA PERIODE D'UN LOCATAIRE, cliquable : elle regle le tableau de bord sur SON bail.
   Le margin-left l'aligne sous le NOM et non sous la case : elle parle de la personne, pas de la coche. */
.hdb-periode-partie{flex:0 0 auto;margin-left:1.65rem;min-height:36px;padding:0 .4rem;border-radius:.4rem;
  border:1px solid var(--color-svv-line);background:transparent;font:inherit;font-size:.68rem;
  color:var(--color-svv-muted);cursor:pointer;white-space:nowrap}
.hdb-periode-partie:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.hdb-periode-partie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LE « + » — 36 px au moins, et un aria-label complet : un « + » seul ne dit rien a un lecteur d'ecran. */
.hdb-plus{flex:0 0 auto;width:36px;min-height:36px;border-radius:.4rem;border:1px solid var(--color-svv-line);
  background:transparent;font:inherit;font-size:1rem;font-weight:700;color:var(--color-svv-red);cursor:pointer}
.hdb-plus:hover{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}
.hdb-plus:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ LE « + » ROUGE DANS UN CERCLE ROUGE (lot HISTORIQUE-BIEN-3, point 3) ═════════════════════════════════════
   DEMANDE D'ARNO : « un “+” rouge dans un cercle rouge (reprends le + de la capture et ajoute le cercle) ».
   Le signe et le trait sont donc la MEME couleur, et le cercle est un vrai rond : 28 px, bord de 2 px.
   ⚠️ LA CIBLE TACTILE RESTE DE 36 px grace au padding de la capsule : un rond de 28 px se rate, mais la zone
   cliquable, elle, garde sa taille. */
.hdb-plus--cercle{width:28px;height:28px;min-height:28px;border-radius:999px;border:2px solid var(--color-svv-red);
  display:inline-flex;align-items:center;justify-content:center;line-height:1;padding:0}
.hdb-plus--cercle:hover{background:var(--color-svv-red-soft);border-color:var(--color-svv-red)}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LES TROIS ETATS DE LA PASTILLE, MEME CERCLE ════════════════════════
   REGLE D'ARNO : « un “+” rouge dans un cercle rouge, TOUJOURS VISIBLE (pas seulement au survol) […] Quand une
   carte existe deja : le “+” est remplace par une petite icone “fiche” (meme cercle, gris) qui ouvre la carte.
   Si la carte est encore “a verifier” (trame orange), l'icone est orange. »

   🔴 « TOUJOURS VISIBLE » N'A RIEN A CORRIGER ICI, ET C'EST VERIFIE : aucune regle de ce bloc n'a jamais lie la
   pastille au survol ni a une opacite. Ce qui la faisait manquer etait une CONDITION DE RENDU, pas un style — le
   garde du fichier d'epreuves interdit desormais les deux.

   ⚠️ LE MEME CERCLE, LA MEME TAILLE, LA MEME PLACE : seule la couleur change. Trois pastilles de geometries
   differentes auraient fait sauter la droite des capsules d'une ligne a l'autre.
   ⚠️ LE TON NE DIT JAMAIS SEUL : l'info-bulle et l'intitule du lecteur d'ecran portent l'etat en toutes lettres
   (motPastille), parce qu'une couleur ne dit rien a qui ne la voit pas. */
.hdb-plus--plus{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.hdb-plus--fiche{border-color:var(--color-svv-line-strong);color:var(--color-svv-muted);font-size:.86rem}
.hdb-plus--fiche:hover{background:var(--color-svv-field);border-color:var(--color-svv-line-strong-hover)}
.hdb-plus--a_verifier{border-color:var(--color-svv-amber);color:var(--color-svv-amber);font-size:.86rem}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 2 — « adresse a corriger dans l'annuaire » ══════════════════════════════
   DISCRETE veut dire petite et ambre, pas invisible : c'est le ton de ce qui attend un geste dans tout le module
   (la trame des cartes a verifier), et il se lit dans les deux themes.
   ⚠️ CE N'EST PAS UNE ERREUR, C'EST UNE CHOSE A FAIRE : donc l'ambre, et non le rouge, qui dit « refuse ». */
.hdb-a-corriger{border:0;background:transparent;font:inherit;font-size:.7rem;color:var(--color-svv-amber);
  padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.hdb-a-corriger:hover{color:var(--color-svv-ink)}
.hdb-a-corriger:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* Sans fiche a ouvrir, le meme mot sans le lien : on dit le probleme meme sans porte a offrir. */
.hdb-a-corriger--muet{cursor:default;text-decoration:none}
.hdb-plus--a_verifier:hover{background:var(--color-svv-amber-soft);border-color:var(--color-svv-amber)}

/* ══ LA CARTE DE CREATION D'UN CONTACT ── MEME TRAME ORANGE que les cartes creees automatiquement : ce qui est
   en attente de verification se voit, et se voit pareil partout. */
.hdb-creation{margin-top:.6rem;padding:.5rem .6rem .6rem;border-radius:.5rem;min-width:0;
  border:1px solid var(--color-svv-amber);border-left-width:4px;background:var(--color-svv-amber-soft)}
.hdb-creation-titre{margin:0 0 .4rem;font-size:.82rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.hdb-creation-champs{display:grid;gap:.45rem;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));
  min-width:0}
.hdb-creation-champ{display:flex;flex-direction:column;gap:.15rem;min-width:0}
.hdb-creation-champ input,.hdb-creation-champ select{min-height:44px;font-size:.82rem;width:100%;min-width:0}
.hdb-personne{display:flex;flex-direction:column;gap:0;min-width:0}
.hdb-personne-nom{display:flex;align-items:center;gap:.3rem;font-size:.8rem;overflow-wrap:anywhere;min-width:0}
/* 🔴 LOT HISTORIQUE-BIEN-2 — .hdb-interne EST RETIREE AVEC LA PASTILLE « nous » : notre agence n'est plus un
   groupe selectionnable (demande d'Arno), ses adresses ne figurent donc plus dans les listes de parties. Le
   nombre d'adresses ecartees est DIT sous l'interrupteur, par motAgenceEcartee. */
/* LES DEUX COMPTEURS SONT ECRITS, jamais dans une infobulle : un survol n'existe pas sur un telephone. */
.hdb-compteurs{font-size:.7rem;color:var(--color-svv-muted)}

/* ── LE RESUME DES PIECES ── */
.hdb-resume{margin:.5rem 0;min-width:0}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 5 — LE LISERE EST SUR LE BLOC, ET SUR LUI SEUL ═════════════════════════
   REGLE D'ARNO : « le lisere de couleur reste UNIQUEMENT sur le bloc qui regroupe les pieces d'un mail. Retire-le
   des miniatures elles-memes. »

   🔴 C'EST L'INVERSE DU LOT 4, et sa nouvelle regle est meilleure : un bloc de six pieces portait SEPT liseres
   de la meme couleur (un par carte, plus celui du bloc), et la couleur ne designait plus rien. Le bloc garde le
   sien — il reutilise .hdb-barre, exactement comme un mail : meme epaisseur, meme arrondi, meme jeton.

   ⚠️ LES REGLES DE TEINTE PAR VARIABLE SONT RETIREES AVEC ELLE (.hdb-grille-ton et ses six tons) : plus aucun
   element ne portait ces classes. La carte CartePieceConversation, elle, n'a jamais ete modifiee et ne l'est pas
   davantage ici — c'est tout l'interet d'avoir passe la teinte par une variable plutot que par une prop. */
.hdb-pieces .pdc-groupe{padding:.2rem .3rem}
.hdb-resume-mot{font-size:.76rem;color:var(--color-svv-muted)}
.hdb-resume-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.2rem 0 .4rem;
  font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.hdb-pieces{display:flex;flex-direction:column;gap:12px;min-width:0}

/* ══ LA LEGENDE DES BARRES ── discrete : un mot et une pastille, en petit, au-dessus du listing. */
.hdb-legende-barres{display:flex;flex-wrap:wrap;gap:.2rem .8rem;margin:.4rem 0 .3rem;font-size:.7rem;
  color:var(--color-svv-muted);min-width:0}
.hdb-legende-item{display:inline-flex;align-items:center;gap:.3rem}
/* LA PASTILLE DE LEGENDE montre les DEUX liseres, comme le mail : un seul trait aurait decrit autre chose que
   ce qu'on voit. 9 px de large pour deux traits de 3 px et leur intervalle. */
.hdb-legende-pastille{display:inline-block;width:9px;height:12px;border-radius:2px;flex:0 0 auto;
  border-left:3px solid transparent;border-right:3px solid transparent}
.hdb-legende-pastille--rouge{border-left-color:var(--color-svv-red);border-right-color:var(--color-svv-red)}
.hdb-legende-pastille--vert{border-left-color:var(--color-svv-green);border-right-color:var(--color-svv-green)}
.hdb-legende-pastille--bleu{border-left-color:var(--color-svv-blue);border-right-color:var(--color-svv-blue)}
/* GRIS POINTILLE : un trait discontinu, et non un gris plein — il dit qu'il reste un geste a faire. */
.hdb-legende-pastille--gris{border-left:3px dashed var(--color-svv-line-strong);
  border-right:3px dashed var(--color-svv-line-strong)}
/* « NOUS » N'A AUCUNE COULEUR (demande d'Arno) : la pastille est donc VIDE, et le mot porte tout. */
.hdb-legende-pastille--nous{border-left-color:transparent;border-right-color:transparent}

/* ── LE FIL ── La liste exterieure porte l'ancre de « Aller au message » ET la barre de couleur. */
.hdb-liste{list-style:none;margin:0;padding:0}
.hdb-ancre{min-width:0;scroll-margin-top:12px}
/* ══ LE MAIL D'OU L'ON EST PARTI, SURLIGNE BRIEVEMENT AU RETOUR (lot HISTORIQUE-BIEN-3, point 4) ══════════════
   ⚠️ UN FOND, ET NON UNE BORDURE : les deux bords portent deja le lisere de categorie, et une troisieme couleur
   de bord se serait lue comme une categorie de plus. Le fond, lui, ne se confond avec rien. */
.hdb-ancre--surlignee{background:var(--color-svv-amber-soft);border-radius:10px}
/* ══ LES DEUX LISERES, A GAUCHE **ET** A DROITE DE CHAQUE MAIL (lot HISTORIQUE-BIEN-3, point 4) ════════════════
   DEMANDE D'ARNO : « Lisere de couleur des DEUX cotes de la capsule du mail (gauche ET droite), meme epaisseur,
   meme couleur, meme arrondi que celui d'aujourd'hui. » L'arrondi est donc symetrique, et les deux bords
   partagent la meme declaration : une seule regle, impossible de les faire diverger d'un pixel.
   ⚠️ 3 px DE CHAQUE COTE : assez pour se voir du coin de l'oeil, assez peu pour ne pas peser.
   Portes par l'enveloppe du mail : zero element de plus dans le document, et LigneVie n'est pas touchee
   (elle sert aussi la fiche d'un locataire). */
.hdb-barre{border-left:3px solid transparent;border-right:3px solid transparent;border-radius:10px}
.hdb-barre--rouge{border-left-color:var(--color-svv-red);border-right-color:var(--color-svv-red)}
.hdb-barre--vert{border-left-color:var(--color-svv-green);border-right-color:var(--color-svv-green)}
.hdb-barre--bleu{border-left-color:var(--color-svv-blue);border-right-color:var(--color-svv-blue)}
.hdb-barre--gris{border-left-style:dashed;border-right-style:dashed;
  border-left-color:var(--color-svv-line-strong);border-right-color:var(--color-svv-line-strong)}
/* « nous » : AUCUNE couleur, des deux cotes. Les bords restent transparents, donc la largeur du listing ne
   saute pas d'un mail a l'autre — ce qui serait pire qu'une couleur de trop. */
.hdb-barre--nous{border-left-color:transparent;border-right-color:transparent}
/* ── REGROUPER PAR CONVERSATION ── L'objet de l'echange au-dessus de ses mails, comme un intertitre. */
.hdb-conv{margin:0 0 10px;min-width:0}
.hdb-conv-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:0 0 .3rem;font-size:.8rem;
  font-weight:700;color:var(--color-svv-ink);padding-bottom:.2rem;
  border-bottom:1px solid var(--color-svv-line);overflow-wrap:anywhere}
.hdb-vide{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;min-width:0}
/* ── LA SORTIE VERS L'ECRAN PLEIN ── discrete : en bas, en petit, alignee a droite. C'est une sortie, pas une
   action : la mettre en tete aurait propose de quitter le bloc avant de l'avoir lu. */
.hdb-sortie{margin:.7rem 0 0;text-align:right;font-size:.74rem}
`;
