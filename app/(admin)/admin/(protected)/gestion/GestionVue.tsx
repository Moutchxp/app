'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CarteEvenement, EtatEcran, LigneFile } from '../../../../lib/gestion/fileRepo';
import {
  depuis, etatVeille, formaterDateFr, libelleEtat, LIBELLE_CLASSER, mentionTroncature, messageErreurHttp,
  messageEvenementsVide, messageFileVide, messageReleve,
} from '../../../../lib/gestion/ecran';
import {
  ecrireEtatUrl, ETAT_DEFAUT, ETIQUETTE_ARRIVEE, ETIQUETTE_RECEPTION, lireEtatUrl, memeEtat,
  type EtatEcranUrl, type Etiquette, type FicheUrl,
} from '../../../../lib/gestion/ecranUrl';
import { decisionRetour, lireMemoire, memoirePour } from '../../../../lib/gestion/retourEcran';
/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « Sortir du suivi » change le classement d'un mail : les compteurs suivent. */
import { ecouterClassement } from '../../../../lib/gestion/signalClassement';
/* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — de quoi relire l'état rangé derrière le jeton de retour. Le module
   est PUR : l'importer ici ne tire ni `pg` ni React. */
import { CLE_RETOUR_BIEN, etatRetourDepuisBrut } from '../../../../lib/gestion/historiqueBien';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { InfoBulle, INFOBULLE_CSS } from '../InfoBulle';
import { useReleveGestion } from './useReleveGestion';
// 🔴 LOT LISTE-PAGINATION — la MÊME barre que la boîte, les brouillons et la file à rattacher.
import { BarrePages, CSS_BARRE_PAGES } from './BarrePages';
import { PAR_PAGE } from '../../../../lib/gestion/pagination';
import { PanneauAffecter } from './PanneauAffecter';
import { CarteVive } from './CarteVive';
/* 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 3 — la barre de recherche de l'annuaire, sur l'accueil. */
import { BarreAnnuaire } from './BarreAnnuaire';
/* 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 2 — la feuille du bouton rond, partagée avec la boîte. */
import { CSS_BOUTON_ROND } from './BoutonRond';
import { Conversation } from './Conversation';
// LOT ENVOI-ARRIERE-PLAN — les mails encore en route, et ceux qui ne sont PAS partis.
import { BandeauEnvois } from './BandeauEnvois';
// LOT STATUT-PAR-MAIL — la colonne de gauche montre les MAILS reçus, un par ligne.
import { BoiteReception } from './BoiteReception';
import { ColonneMode } from './ColonneMode';
import { PleinEcranBoite, type EtiquetteAffichee } from './PleinEcranBoite';
import { Annuaire } from './Annuaire';
import { FileATrier } from './FileATrier';
import { etatSuite } from '../../../../lib/gestion/suiteReleve';
import { etatCopie } from '../../../../lib/gestion/copieArretee';
import {
  aRafraichir, empreinteSuivante, peutBattre, PERIODE_BATTEMENT_MS, veilleAAfficher, veilleSuivante,
  type Empreinte, type VeilleVive,
} from '../../../../lib/gestion/rafraichir';
import { HistoriqueCible } from './HistoriqueCible';
import { cibleDepuisTexte, texteCible } from '../../../../lib/gestion/historique';
import type { ContexteRedactionEcran } from './Redaction';
/* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — les compteurs de la colonne suivent toute action. Module PUR. */
import {
  appliquerDelta, appliquerDeltaBrouillons, type DeltaCompteurs,
} from '../../../../lib/gestion/compteursColonne';

/**
 * LOT 2/3/4b — l'écran à deux côtés, et les DEUX GESTES.
 *
 * Chaque geste est RÉVERSIBLE DEPUIS CET ÉCRAN, et c'est une exigence, pas un confort : ce qui se fait d'un clic doit se
 * défaire d'un clic. « Classer sans suite » a son pendant « Rouvrir », dans une section qui reste visible — sans quoi
 * écarter un échange serait une suppression déguisée.
 *
 * La FILE ne montre que ce qui a bougé récemment (fenêtre réglée en base, 30 jours par défaut). Les échanges plus
 * anciens ne sont NI supprimés NI masqués en silence : leur nombre est annoncé en toutes lettres.
 *
 * MOBILE D'ABORD (exigence transverse §15) : une seule colonne sous 900 px, LA FILE D'ABORD — et c'est l'ordre du DOM
 * qui le garantit, jamais un `order` CSS qui mentirait au clavier et aux lecteurs d'écran. Aucun débordement horizontal
 * (les objets et adresses cassent en fin de ligne), aucune interaction au survol seul, cibles tactiles ≥ 44 px.
 *
 * COULEURS : uniquement des jetons `--color-svv-*`. L'attente d'une réponse est signalée par un MOT (« attend une
 * réponse »), pas par une couleur seule — elle reste lisible en niveaux de gris comme aux daltoniens.
 */

type Chargement = { etat: 'charge' } | { etat: 'ok'; data: EtatEcran } | { etat: 'erreur'; message: string };


/**
 * LOT 5-FUSION — LES TROIS ÉCRANS, ET LA DISPARITION DES DEUX ONGLETS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LES ONGLETS « POSTE DE TRI » / « BOÎTE MAIL » N'EXISTENT PLUS. C'est le SEUL retrait de ce lot, et c'est une
 * décision d'Arno : deux onglets obligeaient à choisir entre « ce que j'ai à faire » et « ce qui existe », alors que
 * les deux servent au même geste. Il n'y a plus qu'une boîte, augmentée : l'écran partagé pour travailler, et le plein
 * écran pour chercher.
 *
 * AUCUNE FONCTION N'A DISPARU AVEC EUX. Ce que montrait l'onglet « Boîte mail » est devenu l'étiquette « Réception »
 * de la boîte en plein écran, avec sa recherche, ses filtres, son interrupteur de courrier automatique et sa
 * pagination. Ce que montrait l'onglet « Poste de tri » est resté l'écran d'arrivée, inchangé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'ÉTAT DE L'ÉCRAN VIT DANS L'ADRESSE (`ecranUrl.ts`, module pur) : recharger la page revient où l'on était, le
 * bouton « Précédent » du navigateur refait le chemin en arrière au lieu de quitter le module, et un écran se copie
 * à quelqu'un d'autre. On empile une entrée d'historique quand l'écran CHANGE, on remplace sinon — sans quoi trois
 * clics sur la même étiquette demanderaient trois « Précédent ».
 */
export function GestionVue({ intro }: {
  /**
   * LOT 5-GMAIL — la phrase de description du module. En plein écran, l'en-tête de la page est COMPACTÉ sur une
   * ligne : la phrase passe alors dans une info-bulle CLIQUABLE (jamais au survol seul). Elle vient de la page, qui
   * la donne aussi à `EnTetePage` — une seule phrase, deux endroits, aucune divergence possible.
   */
  intro?: string;
}) {
  const [vue, setVue] = useState<Chargement>({ etat: 'charge' });
  // Instant de référence des « il y a … », figé au rendu et rafraîchi avec les données. JAMAIS calculé pendant le rendu
  //   d'une ligne : deux lignes d'une même page doivent parler du même « maintenant ».
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  /**
   * ══ 🔴 LOT LISTE-PAGINATION — LA PAGE DE LA FILE « SANS ÉVÉNEMENT » ═════════════════════════════════════════
   *
   * DEUX déclarations pour une seule valeur, et ce n'est pas un doublon :
   *   · l'ÉTAT fait rendre l'écran quand on tourne la page ;
   *   · la RÉFÉRENCE est lue par `lire`, qui doit garder la même identité d'un rendu à l'autre — la mettre dans
   *     ses dépendances relancerait l'effet de montage à chaque changement, et la liste clignoterait.
   * Les deux sont écrites au MÊME endroit (`allerPageFile`), jamais séparément : c'est ce qui les empêche de
   * diverger.
   */
  const [pageFile, setPageFile] = useState(0);
  const pageFileRef = useRef(0);

  /**
   * LOT 4b/4c — état des GESTES. `panneau` retient l'IDENTIFIANT DE L'ÉCHANGE dont le panneau est ouvert, jamais son
   * rang dans la liste : la file change sous l'écran (relève, rattachement, classement) et un rang ne désigne alors
   * plus le même échange. Déclaré AVANT `charger`, qui le remet à zéro à chaque relecture.
   */
  const [panneau, setPanneau] = useState<number | null>(null);
  const [geste, setGeste] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [gesteEnCours, setGesteEnCours] = useState(false);
  /** LOT 5-FUSION — quel écran, quelle étiquette, quel échange ouvert. Lu et écrit dans l'adresse (voir `ecranUrl`). */
  const [etatUrl, setEtatUrl] = useState<EtatEcranUrl>(ETAT_DEFAUT);
  const [auto, setAuto] = useState(false);
  /**
   * LOT ANNUAIRE-1 — l'adresse à qui écrire, cliquée dans une fiche de l'annuaire. Elle traverse jusqu'à la boîte,
   * qui possède le SEUL écran d'écriture du module, puis est aussitôt consommée.
   *
   * ⚠️ `consommerEcrireA` est un `useCallback` SANS dépendance, et ce n'est pas un détail : passé tel quel à un
   * effet de `PleinEcranBoite`, un rappel recréé à chaque rendu relancerait l'effet en boucle — le défaut déjà
   * mesuré au lot 5-BOITE (`onNonLus`), et dont le seul symptôme visible est un écran qui rame.
   */
  const [ecrireA, setEcrireA] = useState<string | null>(null);
  const consommerEcrireA = useCallback(() => setEcrireA(null), []);
  const [comptesBoite, setComptesBoite] = useState<
    {
      lisibles: number; automatiques: number; envoyes: number; reception: number; corbeille: number | null;
      /** LOT ERGO-BOITE-3 — absent tant que la migration 263 n'est pas appliquée : l'entrée « Spam » reste alors
       *  sans nombre, et `etiquettesVisibles` l'écarte, comme toute étiquette vide. */
      spam?: number;
      /** 🔴🔴 LOT DOSSIER-A-CLASSER — les échanges qui portent la pastille rouge. Absent d'une réponse plus
       *  ancienne que ce lot : l'entrée reste alors sans compteur, jamais à zéro. */
      aClasser?: number;
    } | null
  >(null);
  /**
   * ══ 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — QUAND REDEMANDER LES COMPTEURS DE LA COLONNE ════════════════════
   *
   * DEMANDE D'ARNO : « le compteur “À classer” baisse » après une validation. Il ne descend pas tout seul : les
   * sept nombres de la colonne viennent d'UNE lecture (`/api/admin/gestion/boite/comptes`), faite UNE FOIS en
   * entrant en plein écran. Un mail marqué « Interne » depuis la conversation le laissait donc inchangé jusqu'au
   * rechargement de la page.
   *
   * 🔴 UN NUMÉRO DE VERSION, ET NON `setComptesBoite(null)`. Remettre l'état à `null` aurait redéclenché la même
   * lecture — mais `null` veut dire « on ne sait pas » dans toute cette colonne : les entrées auraient perdu leur
   * nombre le temps de l'aller-retour, et « Corbeille » aurait DISPARU puis reparu (son absence de nombre la
   * retire de la liste, cf. l'encadré de son entrée). Avec une version, les anciens nombres restent affichés
   * jusqu'à l'arrivée des nouveaux.
   *
   * ⚠️ LA RÉFÉRENCE SERT DE GARDE D'UNICITÉ, à la place de l'ancien `comptesBoite !== null` : elle retient la
   * version DÉJÀ lue, de sorte qu'aller et revenir en plein écran ne redemande rien — exactement ce que faisait le
   * garde d'avant.
   */
  const [versionComptes, setVersionComptes] = useState(0);
  const comptesCharges = useRef(-1);
  /**
   * LOT 5-BOITE — combien d'échanges me restent NON LUS, remonté par la liste elle-même (elle l'obtient du serveur,
   * calculé pour MA session). `null` = on ne sait pas encore, ou le suivi de lecture n'est pas disponible : on
   * n'affiche alors rien, plutôt qu'un « 0 » qui ressemblerait à une bonne nouvelle.
   */
  const [nonLus, setNonLus] = useState<{ n: number | null; partiel: boolean }>({ n: null, partiel: false });
  /**
   * LOT ERGO-BOITE-2 — COMBIEN DE MAILS ATTENDENT UNE DÉCISION DE RATTACHEMENT, pour l'entrée « À rattacher ».
   *
   * 🔴 C'EST `aTrier` SEUL, PAS `aTrier + sansCandidat`. Première version : la somme des deux, soit 19 108, alors
   * que la file de tri n'offre à trancher que 3 261 mails. Les 15 847 autres n'ont AUCUN candidat : il n'y a rien à
   * confirmer ni à rejeter pour eux, seulement un rattachement à inventer à la main, un par un. Les additionner
   * annonçait six fois le travail réel — Arno l'a vu en comparant au chiffre de la file. Un compteur doit compter
   * ce qu'un clic permet de faire.
   *
   * ⚠️ `sansCandidat` N'EST PAS PERDU pour autant : il voyage à côté, sert l'info-bulle de l'entrée, et l'écran de
   * la file continue de l'afficher en clair et de les lister (onglet « Sans candidat »). Rien n'est masqué ; c'est
   * l'addition qui était fausse, pas la donnée.
   *
   * ⚠️ MÊME SOURCE QUE L'ÉCRAN, toujours : un second calcul donnerait tôt ou tard deux nombres pour une vérité.
   * `null` = pas encore connu, ou migration 257 absente : on n'affiche alors aucun compteur plutôt qu'un zéro
   * qu'on n'a pas mesuré.
   */
  const [aRattacher, setARattacher] = useState<{ aTrancher: number; sansCandidat: number } | null>(null);
  /**
   * ⚠️ IL SE CHARGE AU MONTAGE, PAS DANS `charger`. Première version : l'appel vivait dans `charger`, qui ne tourne
   * QUE sur un geste explicite — les données de l'écran, elles, arrivent par un effet. Le compteur restait donc
   * vide à l'ouverture, et personne ne l'aurait su sans le regarder. Constaté à l'écran avant livraison.
   *
   * ⚠️ ET LES NOMBRES SONT SOUS `data` : la route rend `{ etat, data }` — la forme du module, qui distingue
   * « migration absente » d'un vrai résultat. Les lire à la racine rendait `undefined`, donc aucun compteur.
   */
  const chargerARattacher = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/gestion/rattachements?chiffres=1', { cache: 'no-store' });
      if (!res.ok) { setARattacher(null); return; }
      const j = (await res.json()) as { etat?: string; data?: { aTrier?: number; sansCandidat?: number } };
      const c = j.etat === 'ok' ? j.data : undefined;
      setARattacher(typeof c?.aTrier === 'number'
        ? { aTrancher: c.aTrier, sansCandidat: c.sansCandidat ?? 0 }
        : null);
    } catch {
      // Un échec laisse le compteur à `null` : l'entrée s'affiche sans nombre, ce qui vaut mieux qu'un écran vide.
      setARattacher(null);
    }
  }, []);
  useEffect(() => { void chargerARattacher(); }, [chargerARattacher]);
  /**
   * 🔴 STABLE, ET ON NE REMPLACE L'ÉTAT QUE S'IL CHANGE VRAIMENT. Deux pièges se referment ici, et ils s'étaient
   * refermés en test (rendu en boucle, suite bloquée) :
   *   ① une fonction recréée à chaque rendu est une NOUVELLE dépendance pour l'effet de la liste, qui la rappelle,
   *      ce qui refait un rendu — d'où le `useCallback` sans dépendance ;
   *   ② `setNonLus({ … })` fabrique un objet NEUF même quand les valeurs sont identiques, donc un nouveau rendu à
   *      chaque appel. On rend la MÊME référence quand rien n'a bougé : c'est ce qui arrête la boucle pour de bon.
   */
  const majNonLus = useCallback((n: number | null, partiel?: boolean) => {
    setNonLus((avant) => (avant.n === n && avant.partiel === (partiel === true)
      ? avant
      : { n, partiel: partiel === true }));
  }, []);
  /**
   * ══ 🔴🔴 LOT DOSSIER-A-CLASSER — LE COMPTEUR « À CLASSER » SUIT LA LISTE, EN DIRECT ═══════════════════════════
   *
   * DEMANDE D'ARNO : « Le compteur se met à jour quand un mail est classé (il sort du dossier, avec la même mise
   * à jour optimiste que la Réception). »
   *
   * 🔴 C'EST LE MÊME PATRON QUE `majNonLus` JUSTE AU-DESSUS, et c'est ce qui le rend juste : la liste est la seule
   * à savoir ce qu'elle montre. Un mail classé disparaît de la liste à sa relecture, la liste rapporte son nouveau
   * total, et la colonne baisse — sans seconde requête, et sans qu'un second calcul puisse la contredire.
   *
   * ⚠️ SEULEMENT POUR SON PROPRE DOSSIER : le total de « Réception » ne doit pas venir écraser celui d'« À
   * classer ». La sorte voyage avec le nombre, et c'est elle qui décide si l'on écoute.
   *
   * ⚠️ ET SEULEMENT SI L'ON A DÉJÀ DES COMPTES : tant que la colonne n'a rien chargé, on ne fabrique pas un objet
   * partiel dont les six autres nombres seraient inventés.
   */
  const majTotalEtiquette = useCallback((sorte: string, total: number | null) => {
    if (sorte !== 'a_classer_statut' || total === null) return;
    setComptesBoite((avant) => (avant === null || avant.aClasser === total
      ? avant
      : { ...avant, aClasser: total }));
  }, []);
  /**
   * LOT 5e — CE QUE L'ÉCRAN SAIT DE LA RÉDACTION : base à jour ? droit d'envoyer ? connexion Google ? quelle
   * signature, quel délai d'annulation. `null` = pas encore demandé. Chargé au montage, une seule fois : ces
   * réponses ne changent pas pendant qu'on lit un mail.
   */
  const [redaction, setRedaction] = useState<ContexteRedactionEcran | null>(null);
  const [brouillonsTotal, setBrouillonsTotal] = useState<number | null>(null);
  /**
   * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — LE TOTAL DES BROUILLONS SE RELIT ═══════════════════════════════════
   *
   * Il arrivait avec le contexte de rédaction, lu UNE fois au montage : jeter un brouillon ne le faisait donc pas
   * bouger. C'est le constat exact d'Arno. On extrait la lecture pour pouvoir la rejouer — la route est la même,
   * et c'est bien la même source de vérité que l'écran des brouillons.
   *
   * ⚠️ ON NE TOUCHE QUE CE NOMBRE : le reste du contexte (signature, droits, sondes de migration) ne change pas
   * pendant qu'on travaille, et le réécrire ferait repartir l'éditeur ouvert sur un objet neuf.
   */
  const chargerBrouillonsTotal = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/gestion/redaction', { cache: 'no-store' });
      if (!res.ok) return;
      const c = (await res.json()) as { brouillons?: number };
      if (typeof c.brouillons === 'number') setBrouillonsTotal(c.brouillons);
    } catch { /* un compteur qu'on n'a pas pu relire garde sa valeur : jamais d'écran vidé pour si peu */ }
  }, []);
  const { ecran, etiquette, filOuvert } = etatUrl;

  /**
   * ══ 🔴 LOT BIEN-RATTACHE — LE COMPTE RENDU S'EFFACE À LA NAVIGATION ═══════════════════════════════════════════
   *
   * LE DÉFAUT, VU PAR ARNO SUR LE FIL 36494 : l'écran affichait « Mail lié à l'événement. » au-dessus d'un mail
   * dont la capsule disait « Événement : aucun ». Vérification en base : ce fil et ce mail n'ont JAMAIS porté
   * d'affectation — aucune ligne, aucun journal. Le bandeau venait d'un geste fait **sur un autre échange**
   * (mail 57111, lié puis délié à 15:51), et il était resté à l'écran pendant qu'on naviguait ailleurs.
   *
   * 🔴 UN COMPTE RENDU PARLE DE CE QU'ON VIENT DE FAIRE, ET DE RIEN D'AUTRE. Survivant à la navigation, il devient
   * une affirmation sur le mail qu'on regarde maintenant — et il est alors faux. Changer d'écran, d'étiquette ou
   * d'échange l'efface donc, sans exception.
   */
  useEffect(() => { setGeste(null); }, [ecran, etiquette.sorte, etiquette.evenementId, filOuvert]);
  /**
   * LOT MESSAGE-CLIQUÉ — le message visé. Lu ici, et NON dans chaque écran : l'adresse fait foi, et `filOuvert`
   * commande — sans échange ouvert, un message visé ne désigne rien (voir `ecranUrl`).
   */
  const messageOuvert = filOuvert === null ? null : (etatUrl.messageOuvert ?? null);
  /** LOT BROUILLONS-GMAIL — le brouillon à rouvrir dans la conversation. Il ne vaut rien sans son échange. */
  const brouillonOuvert = filOuvert === null ? null : (etatUrl.brouillonOuvert ?? null);

  /**
   * L'adresse fait FOI. On la lit au montage — jamais au rendu serveur, où `window` n'existe pas et où une lecture
   * ferait diverger l'hydratation — puis à chaque « Précédent » / « Suivant » du navigateur.
   */
  useEffect(() => {
    const relire = () => setEtatUrl(lireEtatUrl(window.location.search));
    relire();
    window.addEventListener('popstate', relire);
    return () => window.removeEventListener('popstate', relire);
  }, []);

  /**
   * ══ 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 1 — TOUS LES COMPTEURS SUIVENT TOUTE ACTION ════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (03/10/2026) : « mettre un brouillon à la corbeille ne met pas à jour les compteurs
   * (Brouillons, Corbeille…). Il faut recharger la page. »
   *
   * 🔴 LA CAUSE : les sept nombres de la colonne venaient d'UNE lecture gardée par un numéro de version, et UN
   * SEUL geste la redemandait (le classement, lot STATUT-LIGNE-APRES-CLASSEMENT). Tous les autres la laissaient
   * telle quelle. Le compteur n'était pas faux, il était VIEUX — ce qui est pire, parce que rien ne le dit.
   *
   * RÈGLE D'ARNO : corbeille et restauration (mail ou brouillon), envoi, création et suppression de brouillon,
   * classement, lu/non lu, spam — TOUS mettent les compteurs à jour IMMÉDIATEMENT. « Mise à jour optimiste, puis
   * relecture serveur pour confirmer (même source de vérité que les listes). »
   *
   * ═══ LES DEUX TEMPS, ET POURQUOI IL EN FAUT DEUX ═════════════════════════════════════════════════════════════
   *
   *   ① LE DELTA, TOUT DE SUITE. Mesuré le 03/10/2026 : `comptesBoite()` prend 123 à 258 ms sur la base d'Arno
   *      (57 476 messages). C'est peu pour une page, c'est beaucoup pour un chiffre qui doit bouger sous le
   *      doigt — un quart de seconde d'immobilité se lit comme « il ne s'est rien passé ».
   *   ② LA RELECTURE, DANS LA FOULÉE, et c'est elle qui fait foi : même source que les listes. Si les deux
   *      divergent (un autre onglet a travaillé, la relève a posé un mail), c'est elle qui gagne.
   *
   * ⚠️ LE DELTA EST FACULTATIF, et beaucoup de gestes n'en portent pas : l'effet d'un mail mis à la corbeille sur
   * « Réception » dépend de ce qui reste dans l'échange, ce que l'écran ne sait pas. On s'abstient alors de
   * deviner — la relecture dira juste, 150 ms plus tard.
   *
   * 🔴 TROIS LECTURES, PARCE QUE LES NOMBRES VIENNENT DE TROIS ENDROITS : la colonne (`/boite/comptes`), les
   * brouillons (le contexte de rédaction) et « À rattacher » (les chiffres de rattachement). Les réunir en une
   * route serait un autre chantier ; les relire ensemble suffit, et garde chaque nombre à sa source.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const rafraichirComptes = useCallback((delta?: DeltaCompteurs, avantEcriture = false) => {
    // ① OPTIMISTE — ce qu'on sait du geste, posé immédiatement.
    if (delta !== undefined) {
      setComptesBoite((avant) => appliquerDelta(avant, delta));
      setBrouillonsTotal((avant) => appliquerDeltaBrouillons(avant, delta));
    }
    /**
     * ══ 🔴🔴 LOT INSTANTANE-ETOILE-CORBEILLE, POINT 2 — ON NE DEMANDE RIEN AVANT D'AVOIR ÉCRIT ═══════════════════
     *
     * 🔴 LE DÉFAUT, MESURÉ À L'ÉCRAN (06/10/2026). Depuis le point 2, un geste de corbeille applique son delta
     * AVANT d'écrire. La confirmation ② partait donc elle aussi avant l'écriture, revenait ~150 ms plus tard avec
     * le nombre d'AVANT, et écrasait le delta : la Corbeille affichait **89** quand le serveur répondait **88**,
     * et elle y restait — plus aucune lecture ne venait la corriger.
     *
     * 🔴 LE GESTE CONFIRME LUI-MÊME, une fois l'écriture revenue, par un second appel SANS delta : ② part alors
     * après le `COMMIT`, et dit la vérité. Rien n'est perdu — simplement demandé au bon moment.
     *
     * ⚠️ `false` PAR DÉFAUT : tous les autres gestes appliquent leur delta APRÈS leur écriture et ne changent pas
     * d'un iota. Ce drapeau ne vaut que pour ce qui ANTICIPE.
     */
    if (avantEcriture) return;
    // ② CONFIRMATION — la vérité, demandée aux trois sources.
    setVersionComptes((v) => v + 1);
    void chargerBrouillonsTotal();
    void chargerARattacher();
  }, [chargerBrouillonsTotal, chargerARattacher]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — LES COMPTEURS SUIVENT « SORTIR DU SUIVI » ═════════════════════════
   *
   * DEMANDE D'ARNO : « Si le mail n'a plus AUCUN bien : il repasse “À classer” dans la boîte (pas Interne), et
   * les compteurs du menu de gauche se mettent à jour. »
   *
   * 🔴 LE GESTE PART DU FOND DE L'ÉCRAN « Annuaire » (`Annuaire` → `VueLot` → `HistoriqueDuBien`), et les
   * compteurs vivent ICI. Un rappel passé de main en main aurait ajouté une propriété à trois composants qui
   * n'ont rien à voir avec le classement — voir l'encadré de `signalClassement`.
   *
   * ⚠️ AUCUN DELTA : on ne sait pas, d'ici, si ce mail avait d'autres biens ni si son échange est « interne ».
   * On redemande, et la vérité arrive 150 ms plus tard — c'est exactement ce que fait `rafraichirComptes()`
   * sans argument.
   */
  useEffect(() => ecouterClassement(() => rafraichirComptes()), [rafraichirComptes]);

  /**
   * ══ LE COMPTE RENDU D'UN GESTE, EN UN SEUL ENDROIT ═══════════════════════════════════════════════════════════
   *
   * ⚠️ IL ÉTAIT ÉCRIT SIX FOIS, à six endroits de ce fichier, et c'est exactement pour cela que les compteurs ne
   * suivaient qu'à un seul : il suffisait d'en oublier cinq. Une seule fonction, et plus aucun geste ne peut
   * passer à côté.
   */
  const surGeste = useCallback((
    message: string,
    options?: { rechargerTout?: boolean; compteurs?: DeltaCompteurs; avantEcriture?: boolean },
  ) => {
    /**
     * ⚠️ UN MESSAGE VIDE NE S'AFFICHE PAS, MAIS LE GESTE COMPTE QUAND MÊME. Certains gestes portent déjà leur
     * propre bandeau (« Mis à la corbeille — Annuler ») : un second compte rendu par-dessus serait du bruit. Ils
     * appellent tout de même cette porte, pour que les compteurs suivent — c'est exactement l'oubli qui a produit
     * le constat d'Arno, et on le rend impossible plutôt que de compter sur la vigilance.
     */
    if (message !== '') setGeste({ ton: 'ok', texte: message });
    rafraichirComptes(options?.compteurs, options?.avantEcriture === true);
  }, [rafraichirComptes]);

  /** Aller à un écran : on l'affiche, ET on l'écrit dans l'adresse. Les deux ensemble, toujours, ou l'un mentirait. */
  const aller = useCallback((brut: EtatEcranUrl) => {
    /**
     * 🔴 LOT MESSAGE-CLIQUÉ — UN MESSAGE VISÉ NE SURVIT JAMAIS À SON ÉCHANGE. Une trentaine d'appels construisent
     * leur état par `{ ...etatUrl, filOuvert: null }` : sans cette remise à zéro, le message de l'échange qu'on
     * vient de fermer resterait dans l'état, et le prochain échange ouvert sans message précisé s'ouvrirait sur un
     * message qui n'est pas le sien. On le nettoie ICI, en un seul endroit, plutôt que dans chacun des appels — un
     * oubli parmi trente ne se verrait pas.
     */
    const suivant = brut.filOuvert === null ? { ...brut, messageOuvert: null } : brut;
    setEtatUrl(suivant);
    if (typeof window === 'undefined') return;
    const url = `${window.location.pathname}${ecrireEtatUrl(suivant)}`;
    const courant = lireEtatUrl(window.location.search);
    /**
     * 🔴🔴 LOT FLECHES-RETOUR — CHAQUE ENTRÉE D'HISTORIQUE EMPORTE L'ÉCRAN D'OÙ L'ON VIENT.
     *
     * C'est tout le mécanisme : la question « où revenir ? » ne se pose plus à chaque flèche, elle est RÉPONDUE
     * ici, une fois, au moment où l'on quitte un écran. Le module pur `retourEcran` décide ce qu'il faut retenir
     * (descendre pose un parent, se déplacer au même niveau l'hérite) ; cette ligne se contente de le ranger.
     *
     * ⚠️ L'OBJET DOIT RESTER SÉRIALISABLE : le navigateur le garde dans son historique et le relit après un
     * rechargement. C'est pourquoi `MemoireEntree` ne porte que des données, jamais une fonction.
     */
    const memoire = memoirePour(courant, suivant, lireMemoire(window.history.state));
    // Empiler une entrée seulement si l'écran CHANGE : sinon « Précédent » demanderait autant de clics qu'on en a
    //   donné pour rien. `pushState` (et non `router.push`) : aucun aller-retour serveur pour un changement d'écran.
    if (memeEtat(courant, suivant)) window.history.replaceState(memoire, '', url);
    else window.history.pushState(memoire, '', url);
  }, []);

  /**
   * ══ 🔴🔴 LOT FLECHES-RETOUR — LE RETOUR, UNE SEULE FOIS POUR TOUT LE MODULE ════════════════════════════════════
   *
   * RÈGLE D'ARNO (01/10/2026) : « Toute flèche ou tout bouton de retour ramène à l'ÉCRAN PRÉCÉDENT réellement
   * visité, dans l'état exact où on l'a quitté […]. Jamais vers une destination fixe quand on venait d'ailleurs. »
   *
   * 🔴 IL RECULE DANS L'HISTORIQUE QUAND IL LE PEUT, et c'est ce qui rend la position de défilement, la page de
   * liste et la recherche sans que personne ait à les sauvegarder : le navigateur les tient déjà. « ← » fait alors
   * EXACTEMENT ce que fait le bouton « Précédent » — autre exigence d'Arno.
   *
   * ⚠️ ET IL VA DROIT AU PARENT QUAND RECULER RENDRAIT AUTRE CHOSE : un mail atteint depuis un mail voisin a bien
   * la liste pour parent, mais l'entrée juste avant lui est l'autre mail. Le module pur tranche (`decisionRetour`).
   *
   * ⚠️ SANS RIEN DERRIÈRE (adresse collée, nouvel onglet), on ne sort jamais de l'application : on remonte d'un
   * cran logique — le dossier du mail, la liste de l'annuaire, l'écran partagé.
   */
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — REVENIR À « L'HISTORIQUE DU BIEN » DEPUIS LA CONVERSATION ══════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « un bouton “← Retour à l'historique du bien” dans la conversation [ramène]
   * EXACTEMENT au même état ».
   *
   * 🔴 `undefined` QUAND ON NE VIENT PAS DE LÀ, et c'est ce qui fait que le bouton n'existe pas alors. Un bouton
   * toujours présent aurait proposé de « revenir » à un écran où l'on n'est jamais allé.
   *
   * 🔴 LA FICHE EST RELUE DANS L'ÉTAT RANGÉ, et non devinée : la conversation ne sait pas de quel bien elle a
   * été ouverte, et le jeton, lui, le sait. Deviner la fiche depuis le fil aurait pu ramener sur un AUTRE bien
   * — un même échange peut porter plusieurs logements.
   *
   * ⚠️ `pousser: true` : on AJOUTE une entrée d'historique plutôt que de reculer, parce qu'on peut être arrivé
   * dans la conversation par un autre chemin que le bloc (un clic dans la boîte, puis une navigation). Reculer
   * aurait alors quitté un écran qu'on n'avait pas ouvert depuis la fiche.
   */
  /**
   * 🔴 LE DERNIER JETON POSÉ PAR LE BLOC « HISTORIQUE DU BIEN ». Une référence et non un état : il est lu dans
   * le MÊME geste que celui qui le pose, avant tout nouveau rendu. Voir la correction notée sur `onOuvrirFil`.
   */
  const jetonPose = useRef<string | null>(null);

  const retourHistoriqueBien = useMemo(() => {
    const j = etatUrl.hdb ?? null;
    if (j === null || typeof window === 'undefined') return undefined;
    let fiche: FicheUrl | null = null;
    try {
      const brut = window.sessionStorage.getItem(`${CLE_RETOUR_BIEN}${j}`);
      const e = brut === null ? null : etatRetourDepuisBrut(JSON.parse(brut));
      /* La clé rangée est la clé WIPPIMMO du bien : l'adresse de la fiche l'écrit `bien-<n>` (lot
         HISTORIQUES-UNE-SEULE-REGLE, point 6), la seule forme qui marche avec un numéro de lot. */
      const n = e === null ? Number.NaN : Number(e.fiche);
      if (Number.isSafeInteger(n) && n > 0) fiche = { sorte: 'bien', id: n };
    } catch { fiche = null; }
    if (fiche === null) return undefined;
    const cible = fiche;
    return () => aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: cible, hdb: j });
  }, [etatUrl.hdb, aller]);

  const retour = useCallback(() => {
    if (typeof window === 'undefined') return;
    const courant = lireEtatUrl(window.location.search);
    const d = decisionRetour(courant, lireMemoire(window.history.state));
    if (d.sorte === 'reculer') { window.history.back(); return; }
    aller(d.etat);
  }, [aller]);

  /**
   * Lit l'écran et RENVOIE le résultat sans toucher à aucun état : c'est l'appelant qui décide quoi en faire. Un refus
   * (403/401) n'est pas une panne, et il est dit pour ce qu'il est — envoyer chercher un bug là où le motif est « pas
   * le droit » fait perdre une demi-journée.
   */
  const lire = useCallback(async (): Promise<Chargement> => {
    try {
      /**
       * 🔴 LOT LISTE-PAGINATION — LE RANG DE LA PAGE DE LA FILE VOYAGE AVEC LA DEMANDE. `0` (le défaut) n'est PAS
       * écrit dans l'adresse : un défaut écrit n'est plus un défaut, et la route rend alors exactement ce qu'elle
       * rendait avant ce lot. Le rang est lu dans une référence et non dans les dépendances de ce rappel : `lire`
       * doit garder la MÊME identité d'un rendu à l'autre, sans quoi l'effet de montage se rejouerait sans fin.
       */
      const rang = pageFileRef.current;
      const res = await fetch(`/api/admin/gestion${rang > 0 ? `?filePage=${rang}` : ''}`, { cache: 'no-store' });
      if (!res.ok) return { etat: 'erreur', message: messageErreurHttp(res.status) };
      return { etat: 'ok', data: (await res.json()) as EtatEcran };
    } catch {
      return { etat: 'erreur', message: messageErreurHttp(0) };
    }
  }, []);

  // Chargement au montage. Le premier acte de l'effet est un `await` → aucun `setState` synchrone dans le corps de
  //   l'effet (cascade de rendus), et `annule` empêche d'écrire dans un composant démonté. Même patron que les autres
  //   écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const r = await lire();
      if (annule) return;
      setMaintenant(new Date());
      setVue(r);
    })();
    return () => { annule = true; };
  }, [lire]);

  /**
   * Relecture DEMANDÉE (clic) : ici l'indicateur d'attente est attendu par celui qui vient de cliquer.
   *
   * LOT 4c — elle REFERME tout panneau ouvert, et c'est structurel, pas cosmétique : la liste qu'on vient de relire
   * n'est plus celle sur laquelle l'utilisateur avait cliqué (un échange rattaché en sort, les suivants remontent).
   * Le faire ICI plutôt qu'à chaque appelant est le seul moyen qu'aucun chemin ne l'oublie — relève automatique et
   * bouton « Rafraîchir » compris.
   */
  const charger = useCallback(async () => {
    setPanneau(null);
    setVue({ etat: 'charge' });
    void chargerARattacher();   // un geste a pu rattacher un mail : le compteur suit
    const r = await lire();
    setMaintenant(new Date());
    setVue(r);
  }, [lire, chargerARattacher]);

  /**
   * ══ LOT ÉCRAN-VIVANT — LE RAFRAÎCHISSEMENT DISCRET ═══════════════════════════════════════════════════════════
   * Le MÊME chargement que `charger`, MOINS les deux choses qui se voient :
   *   · il ne referme AUCUN panneau ouvert — personne n'a cliqué, rien ne doit se replier sous les doigts ;
   *   · il ne passe PAS par « chargement » — sinon l'écran clignoterait toutes les 30 secondes.
   * Il remplace les données en place, et c'est tout. Un mail ouvert, un brouillon en cours, une recherche tapée
   * vivent dans des composants enfants qui ne sont pas remontés : rien de cela n'est touché.
   */
  const rafraichirDiscret = useCallback(async () => {
    const r = await lire();
    setMaintenant(new Date());
    // ⚠️ ON N'ÉCRASE PAS UN ÉCHEC PAR UN ÉCHEC : si la lecture rate alors que l'écran affiche déjà des données,
    //   on garde ce qui est affiché. Un battement qui échoue ne doit pas vider l'écran de quelqu'un qui travaille.
    setVue((avant) => (r.etat === 'ok' || avant.etat !== 'ok' ? r : avant));
  }, [lire]);

  // LOT 3 — une passe réussie change ce qui est à l'écran : on recharge, sans recharger la page.
  const { enCours: releveEnCours, message: releveMsg, releverMaintenant } = useReleveGestion(() => { void charger(); });

  /**
   * ══ 🔴 LOT ÉCRAN-VIVANT — LE BATTEMENT : L'ÉCRAN SE MET À JOUR TOUT SEUL ══════════════════════════════════════
   * LE DÉFAUT RÉPARÉ, constaté le 26/09/2026. Arno signale « la relève automatique ne fonctionne pas ». Elle
   * fonctionnait : 83 messages étiquetés depuis la veille, 83 en base, aucun manquant. C'est cet écran qui ne
   * bougeait pas — chargé UNE FOIS au montage, et plus jamais. Il répétait « dernière passe il y a 46 s » une heure
   * durant, et la Réception restait figée sur le dernier mail connu au chargement.
   *
   * ⚠️ DEUX HORLOGES, ET IL FAUT LES DEUX :
   *   · `maintenant` avance à CHAQUE battement, même quand rien n'a changé — sans quoi « il y a 46 s » reste écrit
   *     indéfiniment. Il ne coûte aucune requête ;
   *   · les DONNÉES ne se relisent que si l'empreinte a changé (1,2 ms mesuré, contre une lecture complète de la
   *     file, des cartes, des compteurs, de la veille et de la copie).
   *
   * 🔴 CE QUI EMPÊCHE LA BOUCLE DE RENDU QUI A SATURÉ LA MÉMOIRE DANS `BoiteMail` :
   *   ① `empreinteSuivante` rend la MÊME référence quand rien n'a bougé — aucun rendu inutile, aucun effet relancé ;
   *   ② l'empreinte vit dans une RÉFÉRENCE (`useRef`), pas dans un état : la comparer ne déclenche aucun rendu ;
   *   ③ l'effet ne dépend QUE de fonctions mémoïsées et d'une période constante — il est posé UNE fois, et son
   *      `clearInterval` est rendu dans tous les cas ;
   *   ④ rien ne s'accumule : on remplace, on n'ajoute jamais.
   */
  const empreinte = useRef<Empreinte | null>(null);
  const enVol = useRef(false);
  /**
   * LOT VEILLE-VIVE — l'état de la relève tel que le BATTEMENT l'a vu, et non tel que la page l'a chargé.
   *
   * ⚠️ UN ÉTAT, PAS UNE RÉFÉRENCE — contrairement à l'empreinte. L'empreinte sert à DÉCIDER (comparer sans provoquer
   * de rendu) ; celui-ci est AFFICHÉ, donc un rendu est exactement ce qu'on veut quand il change. `veilleSuivante`
   * garantit qu'il ne change que lorsque la valeur change vraiment.
   */
  const [veilleVive, setVeilleVive] = useState<VeilleVive | null>(null);
  /**
   * LOT VEILLE-VIVE — QUAND LE DERNIER BATTEMENT A-T-IL RÉUSSI ? Initialisé au montage : la page vient d'être servie,
   * ses valeurs sont donc fraîches. Mis à jour à chaque battement RÉUSSI, jamais à un battement raté — c'est tout
   * l'objet du champ : distinguer « la relève est arrêtée » de « je ne peux plus le vérifier ».
   */
  const [mesureLe, setMesureLe] = useState<string>(() => new Date().toISOString());
  /** Ce que le battement a vu arriver sans pouvoir le montrer. Remis à zéro dès que la liste se recharge. */
  const [courrierNouveau, setCourrierNouveau] = useState(0);

  useEffect(() => {
    let vivant = true;

    const battre = async (): Promise<void> => {
      if (!vivant || enVol.current) return;
      if (!peutBattre({
        visible: typeof document === 'undefined' || document.visibilityState !== 'hidden',
        chargementEnCours: false, gesteEnCours, releveEnCours,
      })) return;

      enVol.current = true;
      try {
        const res = await fetch('/api/admin/gestion/empreinte', { cache: 'no-store' });
        if (!res.ok || !vivant) return;
        const apres = (await res.json()) as Empreinte & { veille?: VeilleVive };
        if (!vivant || typeof apres.messageMax !== 'number') return;

        const avant = empreinte.current;
        const quoi = aRafraichir(avant, apres);
        empreinte.current = avant === null ? apres : empreinteSuivante(avant, apres);

        // L'HEURE AVANCE À CHAQUE BATTEMENT. C'est le correctif du « il y a 46 s » figé, et il ne coûte rien.
        setMaintenant(new Date());

        /**
         * ══ 🔴 LOT VEILLE-VIVE — ET L'ÉTAT DE LA RELÈVE AVANCE AVEC ELLE ════════════════════════════════════════
         * C'EST LE CORRECTIF DU BANDEAU MENTEUR, prouvé le 27/09/2026 : « arrêtée depuis 12 min » à 01:43 alors que
         * le journal montre une passe chaque minute de 01:05 à 01:45. `aRafraichir` rendait déjà un drapeau
         * `bandeau` pour exactement ce cas — et RIEN ne le lisait. L'horloge avançait, l'heure de la dernière passe
         * restait celle du chargement de la page, et le seuil des dix intervalles finissait par être franchi.
         *
         * ⚠️ ON MET À JOUR SANS RECHARGER L'ÉCRAN. Une passe vide ne justifie pas de relire la file, les cartes et
         * les compteurs — mais elle change l'heure de la dernière passe, et c'est tout ce qu'il faut suivre.
         * `veilleSuivante` garde la MÊME référence quand rien n'a changé : aucun rendu inutile, et la boucle qui a
         * saturé la mémoire dans `BoiteMail` ne peut pas revenir par ici.
         */
        if (apres.veille) setVeilleVive((v) => veilleSuivante(v, apres.veille as VeilleVive));
        // ⚠️ SEULEMENT SUR UN BATTEMENT RÉUSSI. Un `catch` plus bas laisse donc cette date vieillir, et le bandeau
        //   passe à « impossible de vérifier » au lieu d'accuser la relève d'être arrêtée.
        setMesureLe(new Date().toISOString());

        if (quoi.donnees) {
          if (avant !== null && apres.messageMax > avant.messageMax) {
            setCourrierNouveau((n) => n + (apres.messageMax - avant.messageMax));
          }
          await rafraichirDiscret();
        }
      } catch {
        // Silence volontaire : l'écran garde ce qu'il affiche. Un battement raté n'est pas une panne à annoncer.
      } finally {
        enVol.current = false;
      }
    };

    const minuterie = setInterval(() => { void battre(); }, PERIODE_BATTEMENT_MS);
    // Un onglet qui redevient visible a peut-être manqué des battements (le navigateur les ralentit) : on rattrape
    //   tout de suite, sinon l'heure affichée serait fausse au retour.
    const surVisibilite = (): void => { if (document.visibilityState === 'visible') void battre(); };
    document.addEventListener('visibilitychange', surVisibilite);
    void battre();   // une première mesure, pour avoir un point de comparaison

    return () => {
      vivant = false;
      clearInterval(minuterie);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [rafraichirDiscret, gesteEnCours, releveEnCours]);

  /**
   * LOT 5e — le contexte de rédaction, demandé UNE FOIS au montage. Un échec le laisse à `null` : aucun bouton
   * d'écriture ne s'affiche alors, et la conversation reste exactement celle d'avant ce lot. Se taire vaut mieux que
   * proposer un geste dont on ne sait pas s'il aboutira.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/redaction', { cache: 'no-store' });
        if (!res.ok || annule) return;
        const c = (await res.json()) as ContexteRedactionEcran & { brouillons?: number };
        if (annule || typeof c.schemaPret !== 'boolean') return;
        setRedaction({
          schemaPret: c.schemaPret, peutEnvoyer: c.peutEnvoyer === true, jetonPresent: c.jetonPresent === true,
          signature: c.signature ?? '', nomExpediteur: c.nomExpediteur || 'CRITERIMMO',
          adresseGestion: c.adresseGestion || 'gestion@criterimmo.fr',
          delaiAnnulationS: typeof c.delaiAnnulationS === 'number' ? c.delaiAnnulationS : 10,
          // LOT 5-PJ-ENVOI — absent d'une réponse plus ancienne que ce lot ⇒ aucune zone de pièces, comme avant.
          piecesDisponibles: c.piecesDisponibles === true,
          /**
           * ══ 🔴 LES SONDES DE SCHÉMA SONT RECOPIÉES UNE À UNE, et ce n'est pas du zèle ═══════════════════════
           *
           * Cet objet est reconstruit champ par champ (jamais étalé) : tout ce qui n'est pas NOMMÉ ici n'atteint
           * jamais l'éditeur. Trois réponses de la route s'y perdaient depuis le lot REDACTION-GMAIL, sans que
           * rien ne le dise — `htmlDisponible`, `classementDisponible` (le champ « Classer ce mail » d'un nouveau
           * message, jamais affiché) et `signatureHtml`.
           *
           * 🔴🔴 `signatureHtml` EST RÉTABLIE — LOT ETOILE-ET-SIGNATURE, ET LA RAISON D'AVANT ÉTAIT FAUSSE.
           *
           * Le lot précédent l'avait laissée de côté en concluant que ces images « ne sont servies qu'à une
           * session Google ». MESURÉ DEPUIS : c'est l'inverse. Adresse nue depuis notre SERVEUR → 200, image/png,
           * 1 933 / 835 / 1 600 octets ; la MÊME adresse avec un jeton Google → 403. Ce n'était pas une question
           * d'identité, mais de qui appelle : le navigateur n'y arrive pas, le serveur si.
           *
           * D'où le chemin en deux temps de ce lot : la route rend une signature dont les images passent par
           * NOTRE route (`signaturePourEcran`), et l'envoi les incorpore au message en `cid:`. Le logo s'affiche
           * dans l'éditeur, et il part avec le message sans aucun lien externe.
           */
          signatureHtml: typeof c.signatureHtml === 'string' ? c.signatureHtml : '',
          htmlDisponible: c.htmlDisponible === true,
          classementDisponible: c.classementDisponible === true,
          // 🔴 LOT RATTACHER-EN-ECRIVANT — la 281 : sans elle le bouton « Interne » de la modale reste grisé.
          interneDisponible: c.interneDisponible === true,
          /**
           * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — migration 276. Absente ⇒ jeter un brouillon redevient « Supprimer
           * le brouillon », sans bandeau « Annuler » : on ne promet pas un retour qu'on ne peut pas tenir.
           */
          corbeilleBrouillon: c.corbeilleBrouillon === true,
        });
        setBrouillonsTotal(typeof c.brouillons === 'number' ? c.brouillons : 0);
      } catch { /* aucun bouton d'écriture : voir l'encadré */ }
    })();
    return () => { annule = true; };
  }, []);

  /**
   * LOT 5-FUSION — les nombres des trois étiquettes qui se calculent sur TOUTE la boîte. Demandés SEULEMENT en entrant
   * en plein écran : ce regroupement balaie les 56 000 messages, et le faire payer à l'écran d'accueil pour une
   * colonne qu'on n'y affiche pas serait une lenteur offerte. Un échec laisse les étiquettes SANS nombre plutôt
   * qu'avec des nombres faux — l'écran reste utilisable, il ne raconte simplement rien qu'il ne sait pas.
   */
  useEffect(() => {
    if (ecran !== 'boite') return;
    /**
     * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LE GARDE D'UNICITÉ EST DEVENU UNE VERSION.
     *
     * Il s'écrivait `comptesBoite !== null` : une seule lecture, jamais rejouée. On lit maintenant « ai-je déjà
     * lu CETTE version ? », ce qui garde le même comportement (aller et revenir en plein écran ne redemande
     * rien) tout en permettant à un classement de réclamer une relecture. La référence est posée AVANT la
     * requête : deux rendus rapprochés ne lanceraient pas deux fois la même lecture.
     *
     * ⚠️ UN ÉCHEC NE REMET PAS LA RÉFÉRENCE EN ARRIÈRE, exactement comme avant ce lot : la colonne reste alors
     * sans nombres plutôt que de réessayer en boucle à chaque rendu.
     */
    if (comptesCharges.current === versionComptes) return;
    comptesCharges.current = versionComptes;
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/boite/comptes', { cache: 'no-store' });
        if (!res.ok || annule) return;
        const c = (await res.json()) as {
          lisibles?: number; automatiques?: number; envoyes?: number; reception?: number; corbeille?: number | null;
          spam?: number; aClasser?: number;
        };
        if (!annule && typeof c.lisibles === 'number') {
          // `reception` est le compte de l'étiquette Réception (au moins un message reçu). Une réponse plus ancienne
          //   que ce lot ne le porte pas : on retombe alors sur `lisibles`, le comportement d'avant.
          setComptesBoite({
            lisibles: c.lisibles, automatiques: c.automatiques ?? 0, envoyes: c.envoyes ?? 0,
            reception: c.reception ?? c.lisibles,
            // `null` = migration 251 absente : l'étiquette « Corbeille » ne s'affiche pas du tout (voir plus bas).
            corbeille: c.corbeille ?? null,
            // LOT ERGO-BOITE-3 — `undefined` (réponse plus ancienne, ou migration 263 absente) se PROPAGE tel quel :
            //   l'entrée « Spam » reste alors sans nombre et disparaît de la colonne, au lieu d'annoncer un zéro
            //   qu'on n'a pas mesuré. Un `?? 0` ici aurait été le mensonge poli.
            spam: c.spam,
            // 🔴🔴 LOT DOSSIER-A-CLASSER — `undefined` SE PROPAGE TEL QUEL, comme `spam` juste au-dessus : sans
            //   le nombre, l'entrée s'affiche sans compteur plutôt que d'annoncer un zéro qu'on n'a pas mesuré.
            aClasser: c.aClasser,
          });
        }
      } catch { /* étiquettes sans nombre : voir l'encadré */ }
    })();
    return () => { annule = true; };
  }, [ecran, versionComptes]);

  /** Un geste = un appel, un compte rendu, un rechargement. Jamais un silence, succès comme échec. */
  const agir = useCallback(async (url: string, methode: 'POST' | 'DELETE', succes: string, corps?: unknown) => {
    if (gesteEnCours) return;
    setGesteEnCours(true);
    setGeste(null);
    try {
      const res = await fetch(url, {
        method: methode,
        ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !data.ok) {
        setGeste({ ton: 'erreur', texte: data.erreur ?? (res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Geste impossible.') });
        return;
      }
      /* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION — `agir` est la porte des gestes de la FILE (sans suite, affectation,
         rattachement) : ils déplacent « À classer » et « À rattacher ». Ils passent donc par la même porte que les
         autres, et les compteurs suivent. */
      surGeste(succes);
      setPanneau(null);
      await charger();
    } catch {
      setGeste({ ton: 'erreur', texte: 'Geste impossible : le serveur n’a pas répondu.' });
    } finally {
      setGesteEnCours(false);
    }
  }, [gesteEnCours, charger]);

  if (vue.etat === 'charge') return <><style>{CSS_GESTION}</style><style>{CSS_BARRE_PAGES}</style><p className="gst-info" role="status">Chargement…</p></>;
  if (vue.etat === 'erreur') {
    return (
      <>
        <style>{CSS_GESTION}</style><style>{CSS_BARRE_PAGES}</style>
        <p className="gst-erreur" role="status">{vue.message}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void charger()}>Réessayer</button>
      </>
    );
  }

  const d = vue.data;
  const ref = maintenant ?? new Date();
  const troncFile = mentionTroncature(d.file.length, d.filsTotal);
  const troncEv = mentionTroncature(d.evenements.length, d.evenementsTotal);
  /**
   * LE POSTE DE TRI, RENDU UNE SEULE FOIS, et affiché à deux endroits : dans la colonne de gauche de l'écran partagé,
   * et sous l'étiquette « À classer » du plein écran. Un seul rendu, donc un seul comportement — le recopier aurait
   * fait deux files qui divergent au premier changement.
   *
   * LOT 5-FUSION-B — le bouton dit « Classer dans une carte » PARTOUT, écran partagé compris (décision d'Arno du
   * 24/09/2026 ; il disait « Affecter à un événement »). Même bouton, même route, même journal : seul le mot change,
   * comme « Replier » avait remplacé « Fermer » au lot 4c. Deux mots pour un même geste font douter qu'il s'agisse du
   * même geste — c'est précisément ce qu'on évite.
   */
  /**
   * ══ 🔴🔴 LOT LISTE-PAGINATION — LA BARRE DE LA FILE « SANS ÉVÉNEMENT » ═══════════════════════════════════════
   *
   * CE QUE ÇA RÉPARE. Cette liste montrait les 50 premiers échanges et le disait honnêtement (« 50 affichés sur
   * 523 ») — mais sans AUCUN moyen d'atteindre les 473 autres. La mention de troncature disait la vérité et
   * laissait sans recours ; la barre donne le recours, et le total devient celui de la catégorie, comme partout.
   *
   * 🔴 LA SUITE SE DÉDUIT DU TOTAL ICI, et c'est l'exception qui confirme la règle du lot. Ailleurs on refuse de
   * la déduire, parce que le serveur sait mieux (il lit une ligne de plus). Ici la file est bornée à la fenêtre
   * d'activité et son total sort de la MÊME requête que les lignes, dans la même transaction logique : les deux
   * ne peuvent pas s'écarter d'un cran. Au pire, la dernière page serait vide — et la barre y reste visible pour
   * pouvoir revenir (cf. `barrePagination`).
   *
   * ⚠️ CHANGER DE PAGE RELIT L'ÉCRAN : la file vit côté serveur, on ne la découpe pas en mémoire. On pose la
   * référence AVANT l'appel, puisque c'est elle que `lire` consulte.
   */
  const allerPageFile = (vers: number) => {
    const rang = Math.max(0, vers);
    pageFileRef.current = rang;
    setPageFile(rang);
    setPanneau(null);
    void charger();
  };
  const barreFile = (ou: 'haut' | 'bas') => (
    <BarrePages ou={ou} page={pageFile} lignes={d.file.length} total={d.filsTotal}
      suite={(pageFile + 1) * PAR_PAGE < d.filsTotal} nom="la file" onPage={allerPageFile} />
  );
  const fileAClasser = d.file.length === 0 && pageFile === 0
    ? <p className="gst-vide">{messageFileVide(d)}</p>
    : (
      <>
      {barreFile('haut')}
      <ul className="gst-liste">
        {d.file.map((f) => (
          <LigneFil key={f.filId} fil={f} maintenant={ref}
            ouvert={panneau === f.filId}
            onOuvrir={() => aller({ ...etatUrl, filOuvert: f.filId })}
            occupe={gesteEnCours}
            onAffecter={() => setPanneau(panneau === f.filId ? null : f.filId)}
            onSansSuite={() => void agir(`/api/admin/gestion/fils/${f.filId}/sans-suite`, 'POST', 'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', {})}
            onFait={(m) => { surGeste(m); setPanneau(null); void charger(); }}
            onAnnuler={() => setPanneau(null)} />
        ))}
      </ul>
      {barreFile('bas')}
      </>
    );

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — OUVRIR LA FICHE DU BIEN SUR CET ÉVÉNEMENT ══════════════════════════
   *
   * Arno : « ouvre la fiche du bien, défile jusqu'au bloc Événements, déplie cet événement et centre sa frise sur
   * la dernière étape ».
   *
   * 🔴 LA FICHE D'UN BIEN S'ADRESSE PAR SA CLÉ WIPPIMMO (`SORTES_FICHE_PAR_CLE`), et l'événement visé voyage dans
   * l'adresse à côté d'elle : c'est la fiche qui se pose dessus, et elle le refera après un rechargement ou sur
   * un lien envoyé à un collègue.
   */
  const ouvrirBienSurEvenement = (cleBien: string, evenementId: number): void => {
    const n = Number(cleBien);
    if (!Number.isSafeInteger(n) || n <= 0) return;
    aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: { sorte: 'bien', id: n }, evenementVise: evenementId });
  };

  /**
   * Les cartes, écrites une seule fois : mêmes fonctions dans la colonne et en plein écran.
   *
   * 🔴 UN SEUL ARGUMENT LES SÉPARE (lot VIGNETTE-EVENEMENT, point 1) : dans l'écran PARTAGÉ, le bloc d'état cède
   * la place au gros bouton « Ouvrir la fiche du bien sur cet événement → » (accord d'Arno) ; en plein écran,
   * l'état reste. Deux listes écrites à la main auraient fini par diverger sur tout le reste.
   */
  const cartesDe = (partage: boolean) => d.evenements.map((e) => (
    <CarteVive key={e.evenementId} carte={e} maintenant={ref}
      partage={partage} onOuvrirBien={ouvrirBienSurEvenement}
      /* LOT RATTACHEMENT-2 — la carte est le troisième point d'entrée de l'historique, avec l'annuaire et le bandeau. */
      onHistorique={(c) => aller({ ...ETAT_DEFAUT, ecran: 'historique', cible: texteCible(c) })}
      onGeste={(message, options) => {
        surGeste(message, options);
        // Un détachement change AUSSI la file (l'échange y revient) : là, tout l'écran est relu. Une
        //   correction ou un changement d'état ne concernent que la carte — la relire elle seule évite
        //   de replier le dossier qu'on est en train de lire.
        if (options?.rechargerTout) void charger();
      }} />
  ));

  const etiquettes = etiquettesDeLEcran(d, comptesBoite, brouillonsTotal, nonLus.n, nonLus.partiel, etiquette);
  // LOT 5-VEILLE — l'état de la relève AUTOMATIQUE, calculé ici pour être rendu à l'identique dans les trois écrans.
  //   `ref` est l'instant de rendu déjà utilisé par le reste du bandeau : une seule horloge, aucun écart entre deux
  //   phrases voisines. Le repli couvre une réponse d'API plus ancienne que ce lot — l'écran ne doit jamais tomber
  //   parce qu'un champ manque.
  /**
   * LOT RATTACHEMENT-2 — l'enchaînement qui suit la relève (adresses, rattachement). Il se TAIT quand tout va bien :
   * une ligne de plus qui répète « tout va bien » chaque minute finirait par cacher celle qui dit le contraire.
   */
  const suite = etatSuite(d.suite ?? { resultat: null, detail: null, ms: null });

  /**
   * LOT COPIE-SURV — la COPIE des pièces vers le Drive. Trois tons, et la différence n'est pas cosmétique : une
   * alerte pour un arrêt SUBI que personne n'a voulu ni vu, une ligne calme pour un arrêt VOULU dont il reste du
   * travail, et rien du tout pendant qu'elle tourne ou quand tout est copié.
   */
  const copie = etatCopie(d.copie ?? { derniere: null, restantes: null, motifs: [] });

  /**
   * LOT RATTACHEMENT-2 — la cible de l'historique, LUE ici et nulle part ailleurs. `ecranUrl` la garde en texte brut
   * (c'est un module sans aucun import, c'est sa garantie) ; c'est `cibleDepuisTexte` qui juge si elle désigne
   * quelque chose, et une valeur illisible rend `null` plutôt qu'un écran blanc.
   */
  const cibleHistorique = cibleDepuisTexte(etatUrl.cible ?? null);

  /**
   * ══ 🔴 LOT VEILLE-VIVE — LE BANDEAU JUGE SUR CE QUE LE BATTEMENT A VU ═══════════════════════════════════════════
   * L'heure de la dernière passe vient du BATTEMENT quand il en a une, de la page sinon. Sans cette inversion, le
   * bandeau comparait une horloge vivante (`ref`, qui avance toutes les 30 s) à une heure gelée au chargement — et
   * annonçait « arrêtée » au bout de dix intervalles d'accalmie, pendant que la relève tournait chaque minute.
   *
   * Les deux RÉGLAGES (cadence attendue, tolérance) continuent de venir de la page : ils ne changent pas d'une
   * minute à l'autre, et les faire voyager à chaque battement serait payer pour rien.
   */
  const veillePage = d.veille ?? { derniereLe: null, resultat: null, erreur: null, intervalleS: 60, toleranceIntervalles: 10 };
  const veilleFraiche = veilleAAfficher(
    { derniereLe: veillePage.derniereLe, resultat: veillePage.resultat, dernierMailLe: d.dernierMailLe ?? null },
    veilleVive,
  );
  const veille = etatVeille({ ...veillePage, ...veilleFraiche, mesureLe }, ref);

  /**
   * ══ 🔴 LOT ERGO-BOITE — L'ORDINAIRE DESCEND, L'EXCEPTIONNEL RESTE EN HAUT ══════════════════════════════════════
   * Trois informations occupaient le haut de la page : l'heure de la dernière relève, la cadence, l'état de la copie
   * des pièces. Elles se CONSULTENT — on veut pouvoir y jeter un œil —, elles ne se LISENT pas à chaque ouverture.
   * Les descendre en petit dans la colonne rend au bandeau d'alerte, resté en haut, le pouvoir de se faire
   * remarquer : à force de trois pavés gris permanents, on n'en lisait plus aucun.
   *
   * 🔴 SEUL L'ORDINAIRE DESCEND. Une relève arrêtée, une copie arrêtée sur échec, un rattachement en échec : ces
   * trois-là s'affichent en haut de page, en rouge, comme aujourd'hui. C'est le partage qui fait tout l'intérêt du
   * déplacement, et c'est pour cela que la condition est écrite ici plutôt que dans la colonne.
   */
  const etatDiscret: string[] = [
    messageReleve({
      ...d,
      derniereReleveLe: veilleFraiche.derniereLe ?? d.derniereReleveLe,
      dernierMailLe: veilleFraiche.dernierMailLe,
    }, ref),
    ...(veille.niveau === 'ok' ? [veille.texte] : []),
    ...(copie.niveau === 'calme' ? [copie.texte] : []),
  ];

  return (
    <>
      <style>{CSS_GESTION}</style><style>{CSS_BARRE_PAGES}</style>
      <style>{INFOBULLE_CSS}</style>

      {/* ══ 🔴🔴 LOT FICHES-ANNUAIRE — LE TITRE DE LA PAGE N'A RIEN À FAIRE SUR UNE FICHE ════════════════════
          « Gestion » et sa description sont rendus par `EnTetePage`, dans `page.tsx` — un composant SERVEUR, au
          DESSUS de cette vue. Sur la fiche d'une personne, ils occupaient 130 px à répéter le nom du module et à
          expliquer la boîte mail, au-dessus de coordonnées qu'on venait lire.

          🔴 POURQUOI UNE RÈGLE DE STYLE ET NON UNE CONDITION : l'écran courant est un état du CLIENT (il change
          sans recharger la page) ; le composant serveur, lui, a déjà rendu. Une feuille conditionnelle est la
          seule façon honnête de le masquer sans déplacer l'en-tête de TOUS les modules, qui s'en servent.

          ⚠️ RIEN N'EST SUPPRIMÉ : l'en-tête revient dès qu'on quitte l'annuaire, et la page garde son `<h1>`
          dans le document — un lecteur d'écran qui parcourt les titres le trouve toujours. */}
      {ecran === 'annuaire' && <style>{'.gst-page > .svv-page-head{display:none}'}</style>}
      {/* ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 1 — LE PARAGRAPHE D'EXPLICATION QUITTE L'ACCUEIL ═══════════
          ACCORD D'ARNO : « Courrier de gestion locative : à gauche la boîte de réception… » disparaît de l'écran
          partagé. Le TITRE « Gestion » reste — il n'est pas dans la demande.

          🔴 LA PHRASE N'EST PAS SUPPRIMÉE, ELLE N'EST PLUS AFFICHÉE **ICI** : `INTRO_GESTION` reste la seule
          écriture de ce texte, et le plein écran la porte toujours dans l'info-bulle cliquable de son bandeau
          compact. La retirer du module l'aurait enlevée des deux endroits.

          ⚠️ PAR LA FEUILLE, COMME POUR L'ANNUAIRE JUSTE AU-DESSUS : l'en-tête est rendu par la PAGE (un composant
          serveur qui ne connaît pas l'écran courant, lequel vit dans l'adresse et n'est lu qu'ici). C'est le
          patron déjà en place dans ce fichier, et non un contournement nouveau. */}
      {ecran === 'partage' && <style>{'.gst-page > .svv-page-head > .svv-page-sub{display:none}'}</style>}

      {/* BANDEAU D'ÉTAT — toujours présent : un outil qui dit depuis quand il n'a pas regardé reste honnête.
          LOT 5-GMAIL — en PLEIN ÉCRAN il devient une ligne compacte qui porte AUSSI le titre du module et sa phrase
          de description (dans une info-bulle cliquable), parce que l'en-tête de page, lui, est replié pour rendre sa
          hauteur à la liste. Rien n'est perdu : ni le titre, ni la phrase, ni l'heure de la dernière relève, ni les
          deux boutons — ce sont exactement les mêmes, sur une ligne au lieu de trois. */}
      {/* ══ 🔴 LOT ERGO-BOITE-3 — LE BLOC « GESTION ⓘ » EST SUPPRIMÉ ═══════════════════════════════════════════
          Retrait demandé explicitement par Arno le 27/09/2026. Le titre du module et son icône d'information
          occupaient une bande grise en haut de chaque écran, au-dessus d'une boîte mail qui dit déjà ce qu'elle est.

          🔴 CE QUI RESTE, ET POURQUOI LE BLOC N'EST PAS RAYÉ PARTOUT. Sur les écrans AUTRES que la boîte, la même
          bande porte encore l'heure de la dernière relève et les boutons « Relever maintenant », « Rafraîchir »,
          « Annuaire » et « À rattacher » : les supprimer là retirerait des fonctions, ce qui n'est pas demandé (et
          la boîte, elle, a son icône et sa colonne pour les remplacer). Le bloc disparaît donc entièrement de la
          BOÎTE — où il ne portait plus que le titre — et perd son titre et son icône partout ailleurs.

          🔴 LE BANDEAU D'ALERTE N'EST PAS CELUI-CI. « Relève arrêtée », « copie arrêtée » vivent dans le `<p
          className="gst-veille--alerte">` juste en dessous, sur TOUS les écrans, boîte comprise. C'est même ce
          retrait qui lui rend le haut de page. */}
      {/* ══ 🔴🔴 LOT FICHES-ANNUAIRE — L'ANNUAIRE N'EST PAS UNE PAGE DE SERVICE ═══════════════════════════════
          Arno, devant la fiche de M. ROI Nathan : « elle est nulle, il faut totalement la restructurer ». Elle
          commençait à 590 px du haut, sous cinq blocs qui ne la concernaient pas : le titre du module, sa
          description, le bandeau de relève et ses boutons, « Relève automatique », « Copie des pièces ».

          🔴 CE BLOC EST DONC RETIRÉ DE L'ANNUAIRE, comme il l'avait été de la boîte au lot ERGO-BOITE-3 — et pour
          la même raison : il n'y porte plus rien qu'on vienne y chercher. Il RESTE partout ailleurs (événements,
          « À rattacher », écran partagé), où il est le seul moyen de relever.

          ⚠️ LES ALERTES, ELLES, NE BOUGENT PAS. « Relève arrêtée », « copie arrêtée », « envoi en échec » restent
          affichées sur TOUS les écrans, annuaire compris : ce sont des sécurités, et masquer une sécurité pour
          gagner de la place, c'est la retirer. Seul l'ORDINAIRE descend. */}
      {/* ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 1 — CE BLOC QUITTE AUSSI L'ÉCRAN PARTAGÉ ═══════════════
          ACCORD D'ARNO (07/10/2026) : sur l'accueil Gestion, le cadre « Dernière relève… / Dernier mail reçu… /
          N messages en base… » et ses boutons « Relever maintenant », « Annuaire », « À rattacher » sont retirés.
          Il reste sur les écrans « Événements » et « À rattacher », où il est encore le seul moyen de relever.

          🔴 CHAQUE FONCTION A ÉTÉ RETROUVÉE AILLEURS AVANT LE RETRAIT, et aucune ne disparaît :
            · RELEVER MAINTENANT → le bouton rond « Relever et actualiser » de la boîte en plein écran ;
            · RAFRAÎCHIR        → conservé, devenu le bouton rond à droite de l'en-tête de la colonne (point 2) ;
            · ANNUAIRE          → la barre de recherche ci-dessous mène directement aux fiches (point 3), et la
                                  colonne de la boîte en plein écran garde son entrée « Annuaire » ;
            · À RATTACHER       → l'entrée « À rattacher » de cette même colonne, avec son compteur ;
            · LES INFORMATIONS DE RELÈVE et L'AVANCEMENT DE LA COPIE DRIVE → la colonne de la boîte en plein
                                  écran les porte déjà (lot ERGO-BOITE, `etatDiscret`).

          ⚠️ LES ALERTES NE SONT PAS TOUCHÉES. « Relève arrêtée », « copie arrêtée », « envoi en échec » restent
          affichées sur TOUS les écrans, accueil compris : ce sont des sécurités, et masquer une sécurité pour
          gagner de la place, c'est la retirer. Seul l'ORDINAIRE s'en va.

          ⚠️ ET LES MÉCANISMES TOURNENT TOUJOURS : la relève automatique (une passe par minute) et la reprise de
          copie vers le Drive ne sont pas touchées — on retire un affichage, jamais un rouage. */}
      {ecran !== 'boite' && ecran !== 'annuaire' && ecran !== 'partage' && (
      <div className="gst-bandeau gst-bandeau--compact" role="status">
        {/* ══ 🔴 LOT ERGO-BOITE — EN PLEIN ÉCRAN, CE BANDEAU NE PORTE PLUS QUE LE TITRE ═══════════════════════════
            L'heure de la dernière relève et l'état de la copie sont descendus dans la colonne (`etatDiscret`), et
            les deux boutons sont devenus UNE icône à côté du titre de la liste. Sur l'ÉCRAN PARTAGÉ, qui n'a pas de
            colonne de gestion, ils restent ici : les y retirer aurait supprimé une fonction, ce qui n'est pas
            demandé. */}
        {/* ⚠️ PLUS DE `ecran !== 'boite'` ICI : depuis le lot ERGO-BOITE-3, tout ce bloc ne s'affiche PLUS dans la
            boîte (voir ci-dessus). La condition était devenue toujours vraie — TypeScript l'a dit, et une
            condition qui ne peut pas être fausse est un piège pour qui la relira. */}
        <span>{messageReleve({
          ...d,
          derniereReleveLe: veilleFraiche.derniereLe ?? d.derniereReleveLe,
          dernierMailLe: veilleFraiche.dernierMailLe,
        }, ref)}</span>
        <span className="gst-actions">
          {/* Les deux boutons restent sur les écrans qui n'ont pas la colonne de la boîte — événements, annuaire,
              file de rattachement : là, aucune icône ne les remplace, et sans eux il n'y aurait plus aucun moyen de
              relever. Dans la boîte, c'est l'icône « Relever et actualiser » qui fait les deux. */}
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={releveEnCours}
            onClick={() => void releverMaintenant()}>
            {releveEnCours ? 'Relève en cours…' : 'Relever maintenant'}
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={releveEnCours}
            onClick={() => void charger()}>Rafraîchir</button>
          {/* LOT ANNUAIRE-1 — L'ANNUAIRE, atteignable depuis N'IMPORTE QUEL écran du module. Il ne remplace rien :
              c'est un quatrième écran, et son bouton de retour ramène à l'écran partagé.
              LOT ERGO-BOITE — en plein écran il vit dans la colonne ; ailleurs, il reste ici.
              ⚠️ PLUS DE `ecran !== 'annuaire'` ICI : depuis le lot FICHES-ANNUAIRE, tout ce bloc ne s'affiche PLUS
              dans l'annuaire (voir l'encadré au-dessus). La condition était devenue toujours vraie — TypeScript
              l'a dit, et une condition qui ne peut pas être fausse est un piège pour qui la relira. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn"
            onClick={() => { setPanneau(null); aller({ ...ETAT_DEFAUT, ecran: 'annuaire' }); }}>
            Annuaire
          </button>
          {/* LOT RATTACHEMENT-1 — LA FILE des mails sans rattachement certain, atteignable depuis n'importe quel
              écran. Elle ne remplace rien : ni l'étiquette « À classer » de la boîte (quels ÉCHANGES poser sur une
              carte), ni les cartes. Elle répond à une autre question : quels MAILS n'ont pas de rattachement certain.
              LOT ERGO-BOITE — renommée « À rattacher », ce qui dit ce qu'elle fait ; en plein écran elle vit dans la
              colonne, avec son compteur. Même écran, même fonction. */}
          {ecran !== 'a_trier' && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { setPanneau(null); aller({ ...ETAT_DEFAUT, ecran: 'a_trier' }); }}>
              À rattacher
            </button>
          )}
        </span>
      </div>
      )}

      {/* ══ LOT 5-VEILLE — LA RELÈVE AUTOMATIQUE EST-ELLE EN VIE ? ══
          Le 25/09/2026, dix heures de courrier ont manqué pendant que le bandeau affichait, en gris, « dernière
          relève il y a 9 h ». Exact, et illisible : aucun seuil, et la cadence attendue écrite nulle part. Cette
          ligne-ci dit l'état EN MOTS — « arrêtée depuis 9 h » se lit en niveaux de gris — et, quand il y a un
          problème, le GESTE qui le répare. Elle est posée SOUS le bandeau, sans rien lui retirer : le compte des
          messages, l'heure de la dernière passe et les deux boutons restent exactement où ils étaient.
          `role="alert"` seulement quand ça ne va pas : une lecture d'écran ne doit pas être interrompue pour dire
          que tout va bien. */}
      {/* 🔴 LOT ERGO-BOITE — EN HAUT, SEULEMENT CE QUI ALERTE. Dans la boîte, la ligne ORDINAIRE (« dernière passe il
          y a 47 s ») est descendue dans la colonne : la laisser aussi ici l'afficherait DEUX FOIS, ce qui est
          exactement ce qu'on cherchait à éviter — trois pavés gris permanents à force desquels on ne lit plus rien.
          L'alerte, elle, reste en haut sur TOUS les écrans. */}
      {veille.niveau !== 'ok' ? (
        <p className="gst-veille gst-veille--alerte" role="alert">
          <span className="gst-veille-texte">{veille.texte}</span>
          {veille.aide && <span className="gst-veille-aide">{veille.aide}</span>}
        </p>
      ) : ecran !== 'boite' && ecran !== 'annuaire' && ecran !== 'partage' && (
        /* 🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 1 — la ligne ORDINAIRE quitte aussi l'accueil (accord d'Arno).
           Elle reste dans la colonne de la boîte en plein écran. L'ALERTE, elle, s'affiche partout. */
        <p className="gst-veille" role="status">{veille.texte}</p>
      )}
      {/* LOT RATTACHEMENT-2 — LE COURRIER EST ARRIVÉ, MAIS SON RATTACHEMENT A ÉCHOUÉ. Une ligne SÉPARÉE de celle de
          la veille, et c'est tout le point : mélanger les deux verdicts ferait crier l'alerte de relève pour une
          raison qui n'est pas la sienne, et on apprendrait à l'ignorer. Elle n'apparaît QUE sur échec. */}
      {suite.niveau === 'echec' && (
        <p className="gst-veille gst-veille--alerte" role="alert">
          <span className="gst-veille-texte">{suite.texte}</span>
          {suite.aide && <span className="gst-veille-aide">{suite.aide}</span>}
        </p>
      )}
      {/* ══ LOT COPIE-SURV — LA COPIE DES PIÈCES EST-ELLE ARRÊTÉE ? ═══════════════════════════════════════════════
          Le 26/09/2026 elle s'est arrêtée sur dix échecs d'affilée alors qu'il restait 24 000 pièces, et AUCUN écran
          ne le disait : l'arrêt a été découvert par hasard deux heures plus tard. `role="alert"` SEULEMENT pour un
          arrêt subi — un arrêt qu'on a demandé n'a pas à interrompre une lecture d'écran. */}
      {copie.niveau === 'alerte' && (
        <p className="gst-veille gst-veille--alerte" role="alert">
          <span className="gst-veille-texte">{copie.texte}</span>
          {copie.aide && <span className="gst-veille-aide gst-veille-commande">{copie.aide}</span>}
        </p>
      )}
      {/* Même partage pour la copie : l'arrêt SUBI crie en haut, l'avancement ordinaire descend dans la colonne. */}
      {copie.niveau === 'calme' && ecran !== 'boite' && ecran !== 'annuaire' && ecran !== 'partage' && (
        /* 🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 1 — idem : l'avancement ORDINAIRE de la copie quitte l'accueil,
           et reste dans la colonne de la boîte en plein écran. L'ARRÊT SUBI, lui, crie partout. */
        <p className="gst-veille" role="status">{copie.texte}</p>
      )}
      {/* COMPTE RENDU de la dernière passe — succès comme échec, jamais un silence. */}
      {/* ══ 🔴 LOT ENVOI-ARRIERE-PLAN — CE QUI N'EST PAS (ENCORE) PARTI ═══════════════════════════════════════
          En TÊTE du module, et pas au fond d'un écran : un mail qui n'est pas parti doit se voir là où l'on
          travaille, quel que soit l'écran ouvert. Il ne s'affiche que s'il a quelque chose à dire — un bandeau
          permanent cesse d'être lu, et le jour où il parle, personne ne le voit. */}
      {/* 🔴 LOT PJ-APRES-VIDAGE — `sauf` : ce que le fil ouvert annonce déjà, la tête de page ne le redit pas.
          Sans lui, regarder l'échange concerné affichait le MÊME échec deux fois, à dix centimètres d'écart. */}
      <BandeauEnvois sauf={filOuvert} />
      {releveMsg && <p className={`gst-compte-rendu gst-ton-${releveMsg.ton}`} role="status">{releveMsg.texte}</p>}
      {geste && <p className={`gst-compte-rendu gst-ton-${geste.ton}`} role="status">{geste.texte}</p>}

      {/* LOT 5-FUSION — LES TROIS ÉCRANS. Une conversation ouverte occupe l'écran partagé, comme depuis le lot 5b ;
          en plein écran elle a sa propre colonne. C'est la MÊME vue dans les deux cas. */}
      {/* LOT RATTACHEMENT-2 — L'HISTORIQUE D'UNE CIBLE. Atteint par un clic depuis l'annuaire, depuis une étiquette du
          bandeau « Rattaché à » d'un mail, ou depuis une carte d'événement. Sans cible lisible dans l'adresse, on
          n'affiche pas un écran vide : on revient à l'écran partagé, comme pour toute valeur illisible. */}
      {ecran === 'historique' ? (
        cibleHistorique !== null ? (
          <HistoriqueCible cible={cibleHistorique} maintenant={ref}
            /* ⚠️ « ← » DOIT NOMMER SON ÉCRAN. Depuis le lot ERGO-BOITE, `ETAT_DEFAUT` EST la boîte : s'en remettre à
             lui ferait un bouton de retour qui ne sort de nulle part. */
          onRetour={() => aller({ ...ETAT_DEFAUT, ecran: 'partage', etiquette: ETIQUETTE_ARRIVEE })}
          /* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 3 — même raison qu'au-dessus : pas de colonne ici. */
          onReception={() => aller({ ...ETAT_DEFAUT, ecran: 'boite', etiquette: ETIQUETTE_RECEPTION })}
            onCible={(c) => aller({ ...ETAT_DEFAUT, ecran: 'historique', cible: texteCible(c) })}
            onOuvrirFil={(id, messageId) => aller({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: id, messageOuvert: messageId ?? null })}
            onGeste={(m) => surGeste(m)} />
        ) : (
          <p className="gst-tronc">
            L’adresse ne désigne aucun logement, propriétaire ni événement.{' '}
            <button type="button" className="gst-lien-bouton" onClick={() => aller({ ...ETAT_DEFAUT })}>
              Revenir à l’écran partagé
            </button>
          </p>
        )
      ) : ecran === 'a_trier' ? (
        <FileATrier
          /* LOT ERGO-BOITE — le retour mène à la BOÎTE, d'où l'on vient maintenant (entrée « À rattacher » de la
             colonne). Auparavant il menait à l'écran partagé, parce que le bouton y vivait. Rien n'est perdu :
             l'écran partagé reste à un clic depuis la colonne. */
          onRetour={() => aller({ ...ETAT_DEFAUT })}
          /* 🔴🔴 LOT COMPTEURS-CORBEILLE-RECEPTION, POINT 3 — « la liste Réception, depuis n'importe quel
             écran » : cet écran n'a pas la colonne, donc pas de tuile. On lui donne le chemin. */
          onReception={() => aller({ ...ETAT_DEFAUT, ecran: 'boite', etiquette: ETIQUETTE_RECEPTION })}
          /* Lire l'échange avant de trancher : on part dans la boîte, où vit la conversation en pleine page. */
          onOuvrirFil={(id, messageId) => aller({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: id, messageOuvert: messageId ?? null })}
          onGeste={(m) => surGeste(m)} />
      ) : ecran === 'annuaire' ? (
        <Annuaire
          fiche={etatUrl.fiche ?? null}
          /* 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 0 — « Historique du bien » arrive avec `&bloc=vie` et la
             fiche se pose sur son historique. ⚠️ `bloc: null` EN CHANGEANT DE FICHE : une fiche ouverte à la main
             depuis l'annuaire s'ouvre par le haut, sinon le paramètre collerait à toutes les suivantes. */
          poserSurVie={etatUrl.bloc === 'vie'}
          /* 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — l'événement sur lequel le gros bouton demande de se poser. */
          evenementVise={etatUrl.evenementVise ?? null}
          onFiche={(f) => aller({ ...etatUrl, fiche: f, bloc: null })}
          /* 🔴 LOT FICHES-ANNUAIRE étape B — l'heure de référence de l'écran, et le chemin vers un échange :
             « la vie du bien » liste les mails du logement, et un clic doit pouvoir en ouvrir un dans la boîte. */
          maintenant={ref}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LE JETON SUIT JUSQU'À LA CONVERSATION. Sans lui, la
             conversation ne saurait pas qu'elle a un « historique du bien » où revenir, et le bouton « ← Retour
             à l'historique du bien » n'aurait rien à viser. `etatUrl.hdb` a été posé juste avant, par
             `onPoserJeton`, sur l'adresse de la FICHE — c'est elle que « Précédent » retrouve. */
          onOuvrirFil={(id, messageId) => aller({
            ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: id, messageOuvert: messageId ?? null,
            /**
             * 🔴🔴 LE JETON VIENT DE LA **RÉFÉRENCE**, ET NON DE `etatUrl` — correction mesurée dans Chrome.
             * Le bloc pose son jeton puis ouvre la conversation dans le MÊME geste : à cet instant, `setEtatUrl`
             * n'a pas encore re-rendu, et `etatUrl` porte donc encore l'état d'AVANT (jeton nul). La conversation
             * arrivait sans jeton, et son bouton « ← Retour à l'historique du bien » n'avait rien à viser.
             * Une référence, elle, est à jour immédiatement.
             */
            hdb: jetonPose.current ?? etatUrl.hdb ?? null,
          })}
          /* 🔴 LE JETON S'ÉCRIT DANS L'ADRESSE COURANTE, SANS EMPILER D'ENTRÉE. `memeEtat` ignore `hdb`
             exprès : `aller` fait donc un `replaceState`, et l'entrée qu'on quitte porte le jeton. */
          jetonHistorique={etatUrl.hdb ?? null}
          onPoserJeton={(j) => { jetonPose.current = j; aller({ ...etatUrl, hdb: j }); }}
          /* 🔴🔴 LOT FLECHES-RETOUR — « ← Retour » revient à l'écran précédent RÉELLEMENT visité : la liste de
             l'annuaire quand on y a ouvert une fiche, le MAIL quand on est venu d'un mail. Avant ce lot, il
             ramenait toujours à la boîte — le second défaut constaté par Arno. */
          onRetour={retour}
          /* LOT RATTACHEMENT-2 — « Tout l'historique des échanges » depuis une fiche de logement ou de propriétaire. */
          onHistorique={(c) => aller({ ...ETAT_DEFAUT, ecran: 'historique', cible: texteCible(c) })}
          /* Écrire à quelqu'un trouvé dans l'annuaire : on part dans la boîte, où vit le SEUL écran d'écriture. */
          onEcrire={redaction?.schemaPret && redaction.peutEnvoyer
            ? (email) => {
              setEcrireA(email);
              aller({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: null });
            }
            : undefined} />
      ) : ecran === 'boite' ? (
        <PleinEcranBoite
          ecrireA={ecrireA} onEcrireAConsomme={consommerEcrireA}
          onFicheAnnuaire={(sorte, id) => aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: { sorte, id } })}
          onHistorique={(c) => aller({ ...ETAT_DEFAUT, ecran: 'historique', cible: texteCible(c) })}
          /* LOT ÉCRAN-VIVANT — le battement a vu du courrier : la liste se relit si elle peut le faire sans rien
             perdre, sinon elle l'annonce. Le compteur retombe à zéro dès qu'elle s'est relue. */
          versionDonnees={courrierNouveau} onListeRelue={() => setCourrierNouveau(0)}
          etiquette={etiquette} etiquettes={etiquettes} filOuvert={filOuvert} maintenant={ref}
          /* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — voir `retourHistoriqueBien` : c'est l'écran « boîte » qui
             rend la conversation ouverte depuis « Voir la conversation d'origine → ». */
          onRetourHistoriqueBien={retourHistoriqueBien}
          /* LOT MESSAGE-CLIQUÉ — le message que la ligne cliquée représentait, lu dans l'adresse. */
          messageOuvert={messageOuvert}
          auto={auto} onAuto={setAuto} onNonLus={majNonLus} onTotalEtiquette={majTotalEtiquette}
          corbeilleDisponible={comptesBoite?.corbeille !== null && comptesBoite?.corbeille !== undefined}
          peutEcrire={redaction?.peutEnvoyer === true}
          piecesDisponibles={redaction?.piecesDisponibles === true}
          onEtiquette={(e) => { setPanneau(null); aller({ ...etatUrl, etiquette: e, filOuvert: null }); }}
          /* LOT BROUILLONS-GMAIL — un brouillon de réponse voyage avec l'échange : la conversation sait alors
             lequel rouvrir, et sous quel message le poser. Absent ⇒ comportement d'avant ce lot. */
          onOuvrir={(id, messageId, brouillonId) => aller({
            ...etatUrl, filOuvert: id, messageOuvert: messageId ?? null, brouillonOuvert: brouillonId ?? null,
          })}
          brouillonOuvert={brouillonOuvert}
          /* 🔴🔴 LOT FLECHES-RETOUR — la flèche du mail revient D'OÙ L'ON VIENT (« À rattacher », une recherche,
             l'annuaire…), et non à l'étiquette courante. Avant ce lot, « À rattacher → mail → ← » rendait
             « Réception » : le défaut qu'Arno a constaté. */
          onFermerFil={retour}
          /* ⚠️ « ← Écran partagé » DOIT NOMMER SON ÉCRAN. Depuis le lot ERGO-BOITE, `ETAT_DEFAUT` EST la boîte :
             s'en remettre à lui ferait un bouton de retour qui ne sort de nulle part. */
          onRetour={() => aller({ ...ETAT_DEFAUT, ecran: 'partage', etiquette: ETIQUETTE_ARRIVEE })}
          /* LOT ERGO-BOITE-3 — le sélecteur « non lus / total » de Réception. Il passe par l'ADRESSE, comme
             l'étiquette et l'échange ouvert : un rechargement, un « Précédent », le rafraîchissement automatique
             de 30 s et l'icône « Relever et actualiser » le conservent sans que rien n'ait à s'en souvenir. */
          filtre={etatUrl.filtre ?? null}
          onFiltre={(f) => aller({ ...etatUrl, filtre: f, filOuvert: null })}
          /* LOT FILTRE-ETOILE — comme le sélecteur des non-lus, le filtre vit dans l'ADRESSE : il survit au
             rechargement, au « Précédent » et au rafraîchissement automatique de 30 s. */
          etoile={etatUrl.etoile === true}
          onEtoileFiltre={(actif) => aller({ ...etatUrl, etoile: actif, filOuvert: null })}
          onRattacher={() => { setPanneau(null); aller({ ...ETAT_DEFAUT, ecran: 'a_trier' }); }}
          aRattacher={aRattacher === null ? null : aRattacher.aTrancher}
          aRattacherSansCandidat={aRattacher === null ? null : aRattacher.sansCandidat}
          onAnnuaire={() => { setPanneau(null); aller({ ...ETAT_DEFAUT, ecran: 'annuaire' }); }}
          etatDiscret={etatDiscret}
          /* UN SEUL GESTE : `releverMaintenant` relève PUIS rappelle `charger()` — c'est déjà ainsi qu'il est câblé. */
          onRelever={() => void releverMaintenant()} releveEnCours={releveEnCours}
          onGeste={(m, o) => { surGeste(m, o); if (o?.rechargerTout) void charger(); }}
          /**
           * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LES COMPTEURS DE LA COLONNE SUIVENT LE CLASSEMENT.
           *
           * La LISTE se met à jour toute seule (`versionStatuts`, dans `PleinEcranBoite`) ; les sept nombres de
           * la colonne, eux, viennent d'ici — et « À classer » en est un. Voir l'encadré de `versionComptes`.
           *
           * ⚠️ ON NE RAPPELLE PAS `charger()` : cette lecture-là (file, cartes, veille) n'a rien à voir avec le
           * classement d'un mail, et la payer à chaque geste ferait relire l'écran entier pour un chiffre.
           */
          onClassementChange={() => setVersionComptes((v) => v + 1)}
          redaction={redaction}
          enfantAClasser={fileAClasser} />
      ) : ecran === 'evenements' ? (
        /* ÉVÉNEMENTS EN PLEIN ÉCRAN — les MÊMES cartes, avec toutes leurs fonctions : rien n'est retiré, la largeur
           disponible sert seulement à en montrer deux de front au lieu d'une. */
        <div className="pe">
          {/* LOT 5-FUSION-B — la colonne du mode prend la place des liens de modules. ⚠️ Elle ne contient QUE ce que
              la colonne des cartes portait déjà : son titre, son compteur, la mention de troncature, et le retour.
              La colonne des cartes n'a JAMAIS eu de recherche ni de filtre (la recherche d'événement, elle, vit dans
              les panneaux « Classer dans une carte » et « Déplacer », et elle y reste) — on n'en invente donc pas. */}
          <ColonneMode actif panneauMobile="contenu" titre="Événements">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => aller({ ...ETAT_DEFAUT })}>
              ← Écran partagé
            </button>
            <h2 className="cm-titre" id="gst-titre-ev-plein">
              Événements <span className="gst-compte">{d.evenementsTotal}</span>
            </h2>
            {troncEv && <p className="cm-note">{troncEv}</p>}
          </ColonneMode>
          {filOuvert !== null && (
            <section className="gst-col">
              <Conversation filId={filOuvert} maintenant={ref} messageVise={messageOuvert}
                /* 🔴 LOT FLECHES-RETOUR — le MÊME retour que partout ailleurs. */
                onFerme={retour}
                /* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — « ← Retour à l'historique du bien », offert SEULEMENT
                   quand on vient de là (le jeton est dans l'adresse). Voir `retourHistoriqueBien`. */
                onRetourHistoriqueBien={retourHistoriqueBien}
                onFicheAnnuaire={(sorte, id) => aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: { sorte, id } })}
                onHistorique={(c) => aller({ ...ETAT_DEFAUT, ecran: 'historique', cible: texteCible(c) })}
                onGeste={(m, o) => { surGeste(m, o); if (o?.rechargerTout) { aller({ ...etatUrl, filOuvert: null }); void charger(); } }} />
            </section>
          )}
          {d.evenements.length === 0
            ? <p className="gst-vide">{messageEvenementsVide()}</p>
            : <ul className="gst-liste gst-cartes-larges">{cartesDe(false)}</ul>}
        </div>
      ) : filOuvert !== null ? (
        <section className="gst-col">
          <Conversation filId={filOuvert} maintenant={ref} messageVise={messageOuvert}
            /* 🔴 LOT FLECHES-RETOUR — le MÊME retour que partout ailleurs. */
            onFerme={retour}
            /* 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — voir `retourHistoriqueBien`. */
            onRetourHistoriqueBien={retourHistoriqueBien}
            onFicheAnnuaire={(sorte, id) => aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: { sorte, id } })}
            onHistorique={(c) => aller({ ...ETAT_DEFAUT, ecran: 'historique', cible: texteCible(c) })}
            onGeste={(m, o) => { surGeste(m, o); if (o?.rechargerTout) { aller({ ...etatUrl, filOuvert: null }); void charger(); } }} />
        </section>
      ) : (
      /* ORDRE DU DOM = ordre mobile : la file d'abord, les événements ensuite.
         🔴 LOT ACCUEIL-GESTION, POINT 3 — UN FRAGMENT, parce que cette branche porte désormais DEUX éléments :
         les deux colonnes, puis le bloc « Échanges sans événement » qui est passé SOUS elles. */
      <>
      {/* ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 1 — L'ANNUAIRE EST UN OUTIL À PART ═════════════════════════════
          Arno : « la fonction Annuaire doit se lire comme un outil à part entière, nettement séparé de l'écran
          partagé en dessous. Le bloc a son propre cadre (fond blanc, bord net, coins arrondis, légère ombre), une
          marge franche au-dessus et en dessous, AUCUN cadre commun avec les colonnes. »

          🔴 UN BLOC, PUIS UN TRAIT, PUIS L'ÉCRAN PARTAGÉ : deux zones qu'on distingue d'un coup d'œil. Le trait
          est discret (`gst-separation`) — l'espacement seul laissait encore lire une seule colonne de contenu.

          🔴 ET AUCUN ÉTAT PARTAGÉ, c'est la demande explicite : `BarreAnnuaire` ne reçoit QUE `onFiche`. Elle ne
          connaît ni la liste des mails, ni les événements, ni les filtres, ni le rafraîchissement — elle ne peut
          donc rien leur faire, et aucune relecture de l'écran ne la touche.

          ⚠️ LA LISTE DE SUGGESTIONS S'OUVRE PAR-DESSUS SANS RIEN DÉCALER, comme avant : elle est posée en
          absolu DANS le bloc (`position:relative` sur la barre), donc rattachée à lui et au-dessus du reste. */}
      <section className="gst-bloc-annuaire" aria-label="Annuaire">
        <BarreAnnuaire
          onFiche={(f) => { setPanneau(null); aller({ ...ETAT_DEFAUT, ecran: 'annuaire', fiche: f }); }} />
      </section>
      <hr className="gst-separation" />

      <div className="gst-deux">
        {/* ══ 🔴 LOT STATUT-PAR-MAIL — CETTE COLONNE MONTRE LES MAILS REÇUS, PLUS LA FILE DES ÉCHANGES ═══════════
            Demande d'Arno. Elle montrait une file de CONVERSATIONS à poser sur un événement ; elle montre désormais
            les derniers MAILS REÇUS, un par ligne, avec le statut de CHACUN.

            La différence n'est pas cosmétique : une conversation de douze messages occupait UNE ligne, et ses onze
            autres mails étaient invisibles — or le classement se fait mail par mail. Une liste d'échanges ne
            pouvait donc pas dire ce qui restait à classer.

            🔴 RIEN N'EST SUPPRIMÉ : la file des échanges sans événement est en dessous, repliée, avec ses gestes
            et son compteur ; son lien direct est au bas de la boîte de réception. */}
        <section className="gst-col" aria-labelledby="gst-titre-reception">
          <BoiteReception
            maintenant={ref}
            /**
             * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 2 — « RAFRAÎCHIR » DEVIENT LE BOUTON ROND ══════════════
             *
             * Arno : « transforme le bouton “Rafraîchir” en bouton rond à icône, identique à celui de la boîte
             * mail ouverte (même composant, pas une copie). Place-le juste à droite de l'en-tête “Boîte de
             * réception · gestion@criterimmo.fr · N mails reçus”. Il garde exactement l'action de l'actuel bouton
             * Rafraîchir de l'écran partagé. »
             *
             * 🔴 C'EST DONC `charger()`, MOT POUR MOT CE QUE FAISAIT « Rafraîchir » : on relit l'écran, on ne
             * relève pas. Le bouton rond de la BOÎTE, lui, relève PUIS actualise — deux gestes différents sous le
             * même dessin, et Arno demande de n'en changer aucun.
             */
            onRafraichir={() => void charger()}
            onOuvrir={(filId, messageId) => aller({
              ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: filId, messageOuvert: messageId,
            })}
            /* 🔴 LE PLEIN ÉCRAN DE CETTE COLONNE OUVRE TOUJOURS « RÉCEPTION » — demande d'Arno. L'étiquette est
               ÉCRITE, jamais héritée de `etiquette` : sinon le bouton rouvrirait la dernière liste consultée
               (Envoyés, Spam, une carte…), et on ne saurait pas pourquoi la boîte s'ouvre ailleurs. */
            onPleinEcran={() => {
              setPanneau(null);
              aller({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: null, messageOuvert: null });
            }}
            onFileEchanges={() => { setPanneau(null); aller({ ecran: 'boite', etiquette: ETIQUETTE_ARRIVEE, filOuvert: null }); }}
            compteEchanges={d.filsTotal}
            /**
             * ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 2 — `auto` NE PART PLUS VERS CETTE COLONNE ═══════════════════════
             *
             * ACCORD D'ARNO (06/10/2026) : « sur l'écran partagé, le lien est retiré, et la colonne mail affiche
             * TOUJOURS la Réception SANS courrier automatique, quel que soit l'état choisi en plein écran ».
             *
             * 🔴 LE LOT RENOMMER-PARTOUT-ET-FINITIONS (point 8) l'y avait amené pour que les deux écrans partagent
             * un seul interrupteur. Arno retire l'interrupteur d'ICI : la colonne n'a donc plus d'état à
             * recevoir, et ne pas le lui passer est la seule façon honnête de le dire — un composant qui reçoit
             * une valeur qu'il ignore se relit six mois plus tard comme un défaut.
             *
             * ⚠️ `auto` NE DISPARAÎT PAS : il reste la variable du PLEIN ÉCRAN, passée à `PleinEcranBoite`
             * quelques lignes plus haut, avec son interrupteur et son comportement inchangés.
             */
             />

        </section>

        <section className="gst-col" aria-labelledby="gst-titre-ev">
          {/* ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — LE MÊME EN-TÊTE QUE LA COLONNE DE GAUCHE ════════════════════
              Deux rangées, et les mêmes deux dans les deux colonnes : le TITRE (avec son compteur) sur la
              première, les OUTILS sur la seconde. La colonne de gauche met ses filtres dans la seconde ; celle-ci
              n'en a pas, et c'est « Plein écran » qui l'occupe — dans les deux cas la rangée sert, et les deux
              listes commencent à la même hauteur. Voir l'encadré de `.gst-tete-partage` dans la feuille. */}
          <div className="gst-tete-partage">
            <div className="gst-tete-partage-titre">
              <h2 className="gst-titre" id="gst-titre-ev">
                Événements <span className="gst-compte">{d.evenementsTotal}</span>
              </h2>
            </div>
            <div className="gst-tete-partage-outils">
              <button type="button" className="svv-btn svv-btn-outline gst-btn gst-plein"
                onClick={() => aller({ ecran: 'evenements', etiquette, filOuvert: null })}>
                Plein écran
              </button>
            </div>
          </div>
          {/* 🔴 LA LISTE DÉFILE POUR ELLE-MÊME, à la MÊME hauteur visible que celle de gauche (feuille). Le
              message « aucun événement » prend la même boîte : sinon la colonne se raccourcirait quand elle est
              vide, et les deux pieds ne seraient plus alignés. */}
          <div className="gst-corps-partage">
            {troncEv && <p className="gst-tronc">{troncEv}</p>}
            {d.evenements.length === 0
              ? <p className="gst-vide">{messageEvenementsVide()}</p>
              : <ul className="gst-liste">{cartesDe(true)}</ul>}
          </div>
          {/* ⚠️ LE PIED EXISTE MÊME VIDE : il réserve la même hauteur qu'à gauche, pour que les deux colonnes se
              terminent sur la même ligne. C'est le prix de la symétrie, et il est de 44 px. */}
          <div className="gst-pied-partage" />
        </section>
      </div>

      {/* ══ 🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — CE BLOC EST PASSÉ **SOUS** LES DEUX COLONNES ════════════════

          Il vivait DANS la colonne de gauche, sous son pied. Les deux colonnes ne pouvaient donc pas se
          terminer sur la même ligne — mesuré avant correction : le pied de gauche à 922 px, celui de droite à
          967 px — et c'est exactement la dissymétrie qu'Arno demande de corriger.

          🔴 RIEN N'EST RETIRÉ NI MASQUÉ : le bloc garde son titre, son compteur, son « Plein écran », sa
          fenêtre d'activité, ses gestes et son repli par défaut. Il est simplement posé SOUS les deux colonnes,
          sur toute la largeur, là où il ne déséquilibre plus rien. */}
        {/* LA FILE DES ÉCHANGES SANS ÉVÉNEMENT — conservée telle quelle, repliée par défaut. Elle garde son
            plein écran, sa fenêtre d'activité, ses gestes et son compteur : aucun n'est retiré. */}
        <details className="gst-file-echanges">
          <summary className="gst-file-titre">
            Échanges sans événement <span className="gst-compte">{d.filsTotal}</span>
          </summary>
        <div className="gst-entete-col">
          <h2 className="gst-titre" id="gst-titre-file">
            Sans événement <span className="gst-compte">{d.filsTotal}</span>
          </h2>
          <button type="button" className="svv-btn svv-btn-outline gst-btn"
            onClick={() => { setPanneau(null); aller({ ecran: 'boite', etiquette: ETIQUETTE_ARRIVEE, filOuvert: null }); }}>
            Plein écran
          </button>
        </div>
        {troncFile && <p className="gst-tronc">{troncFile}</p>}
        {/* FENÊTRE D'ACTIVITÉ — dite en toutes lettres. Un outil qui cache sans le dire ment. */}
        {d.filsTropAnciens > 0 && (
          <p className="gst-tronc">
            {d.filsTropAnciens} échange{d.filsTropAnciens > 1 ? 's' : ''} plus ancien{d.filsTropAnciens > 1 ? 's' : ''} que {d.fenetreJours} jours
            {' '}ne {d.filsTropAnciens > 1 ? 'sont' : 'est'} pas affiché{d.filsTropAnciens > 1 ? 's' : ''} dans la file.
            {' '}Rien n’est supprimé : {d.filsTropAnciens > 1 ? 'ils restent' : 'il reste'} en base.
            {/* LOT 5a — la phrase ne change pas d'un mot ; on lui AJOUTE la sortie qui lui manquait.
                LOT 5-FUSION — cette sortie mène désormais à l'étiquette « Réception », qui est ce que montrait
                l'onglet supprimé : tout le courrier, sans la fenêtre de 30 jours. */}
            {' '}
            <button type="button" className="gst-lien-bouton"
              onClick={() => { setPanneau(null); aller({ ecran: 'boite', etiquette: ETIQUETTE_RECEPTION, filOuvert: null }); }}>
              Les voir dans la boîte mail
            </button>
          </p>
        )}
        {fileAClasser}

        {/* CLASSÉS SANS SUITE — la contrepartie du geste : visible, et réversible d'un clic. */}
        {d.sansSuiteTotal > 0 && (
          <details className="gst-sans-suite">
            <summary className="gst-sans-suite-titre">Classés sans suite <span className="gst-compte">{d.sansSuiteTotal}</span></summary>
            <ul className="gst-liste">
              {d.sansSuite.map((f) => (
                <li key={f.filId} className="gst-item">
                  <div className="gst-item-haut"><span className="gst-objet">{nettoyerObjet(f.objet) || '(sans objet)'}</span></div>
                  <div className="gst-item-bas">
                    <span title={formaterDateFr(f.classeLe)}>classé {depuis(f.classeLe, ref)}</span>
                    {f.classePar && <><span className="gst-sep" aria-hidden="true">·</span><span>par {f.classePar}</span></>}
                    {f.motif && <><span className="gst-sep" aria-hidden="true">·</span><span>{f.motif}</span></>}
                  </div>
                  <div className="gst-actions">
                    <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={gesteEnCours}
                      onClick={() => void agir(`/api/admin/gestion/fils/${f.filId}/sans-suite`, 'DELETE', 'Échange rouvert : il est revenu dans la file.')}>
                      Rouvrir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        )}
        </details>
      </>
      )}
    </>
  );
}

/**
 * LOT 5-FUSION — LA COLONNE D'ÉTIQUETTES, construite à partir de ce que l'écran SAIT DÉJÀ. PURE, donc éprouvable.
 *
 * 🔴 AUCUN COMPTEUR N'EST RECALCULÉ ICI. « À classer » et « Sans suite » sont ceux du poste de tri, mot pour mot ;
 * « Réception », « Envoyés » et « Courrier automatique » viennent de l'unique lecture `comptesBoite` ; le nombre
 * d'échanges d'une carte est celui qu'elle affiche déjà dans sa colonne. Deux calculs auraient donné, tôt ou tard,
 * deux chiffres différents pour la même chose — et c'est toujours l'écran le moins regardé qui garde le faux.
 *
 * ⚠️ AUCUNE ÉTIQUETTE « À TRAITER » : l'état par échange n'existe pas en base (il vient dans un lot dédié), et une
 * étiquette qui ne s'appuierait sur rien mentirait dès le premier clic.
 */
export function etiquettesDeLEcran(
  d: EtatEcran,
  comptes: {
    lisibles: number; automatiques: number; envoyes: number; reception?: number; corbeille?: number | null;
    spam?: number;
    /** 🔴🔴 LOT DOSSIER-A-CLASSER — les échanges à classer. Absent ⇒ l'entrée s'affiche sans compteur. */
    aClasser?: number;
  } | null,
  brouillons: number | null = null,
  nonLus: number | null = null,
  nonLusPartiel = false,
  /**
   * LOT ERGO-BOITE — L'ÉTIQUETTE OUVERTE, quand c'en est une. Sert à UNE seule chose : garder dans la colonne la
   * carte qu'on regarde. Absente ⇒ aucune carte, ce qui est le cas ordinaire.
   */
  ouverte: Etiquette | null = null,
): EtiquetteAffichee[] {
  return [
    // ══ LOT ERGO-BOITE — L'ORDRE EST CELUI D'ARNO, du plus lu au moins lu ════════════════════════════════════════
    //   Réception, Envoyés, Courrier automatique, À classer, Brouillons. Il ne se déduit d'aucune règle : c'est
    //   l'ordre dans lequel il travaille, et c'est la seule justification qui vaille pour une colonne de navigation.
    // LOT 5-BOITE — « Réception » ne compte plus TOUTE la boîte : seulement les échanges où quelqu'un nous a écrit,
    //   exactement comme son filtre. `reception` absent = réponse d'API plus ancienne que ce lot ⇒ ancien compte.
    {
      etiquette: ETIQUETTE_RECEPTION, libelle: 'Réception',
      compte: comptes?.reception ?? comptes?.lisibles ?? null, nonLus, nonLusPartiel,
    },
    { etiquette: { sorte: 'envoyes', evenementId: null }, libelle: 'Envoyés', compte: comptes?.envoyes ?? null },
    { etiquette: { sorte: 'automatique', evenementId: null }, libelle: 'Courrier automatique', compte: comptes?.automatiques ?? null },
    /**
     * ══ 🔴🔴 LOT DOSSIER-A-CLASSER — « SANS ÉVÉNEMENT » CÈDE SA PLACE À « À CLASSER » ═════════════════════════
     *
     * DÉCISION D'ARNO (02/10/2026), accord explicite : « Le dossier “Sans événement” (641) ne me sert à rien. Il
     * est remplacé, À LA MÊME PLACE, par un dossier “À classer” qui affiche tous les mails portant le statut
     * “À classer” (la pastille rouge des listes). »
     *
     * HISTOIRE DE CETTE LIGNE, en deux temps. Au lot STATUT-PAR-MAIL, l'entrée s'appelait « À classer » et
     * comptait les échanges SANS ÉVÉNEMENT : le mot promettait un arriéré de classement, le nombre parlait d'autre
     * chose. On avait alors corrigé LE MOT (« Sans événement »). Arno tranche aujourd'hui dans l'autre sens : ce
     * qu'il veut à cette place, c'est le travail de classement — donc on change LA CHOSE, et le mot d'origine
     * redevient juste.
     *
     * 🔴 CE QUI N'EST PAS RETIRÉ, ET IL FAUT LE SAVOIR. Seule l'ENTRÉE DE LA COLONNE change. L'étiquette
     * `a_classer` (le poste de tri, sa fenêtre d'activité, son écran plein, ses gestes) vit toujours : l'écran
     * PARTAGÉ garde son panneau « Sans événement » avec le même compteur `d.filsTotal`, et son bouton « Plein
     * écran ». Rien de la logique « sans événement » n'est touché — ni la pastille « Événement : aucun », ni la
     * recherche, ni les autres écrans.
     *
     * ⚠️ `?? null` ET NON `?? 0` : une réponse d'API plus ancienne que ce lot ne porte pas ce nombre. `null` se lit
     * « on ne sait pas encore » et laisse l'entrée SANS compteur ; un `0` se lirait « il n'y a plus rien à
     * classer », ce qui serait la plus mauvaise des nouvelles à annoncer à tort.
     */
    {
      etiquette: { sorte: 'a_classer_statut', evenementId: null }, libelle: 'À classer',
      compte: comptes?.aClasser ?? null,
    },
    // LOT 5e — les BROUILLONS. Comme les autres : pas d'étiquette vide, et son nombre vient d'une seule lecture.
    { etiquette: { sorte: 'brouillons', evenementId: null }, libelle: 'Brouillons', compte: brouillons },
    /**
     * ══ LOT ERGO-BOITE-3 — « SPAM », APRÈS BROUILLONS (place demandée par Arno) ═══════════════════════════════
     * Le courrier que GMAIL a classé indésirable. Ce n'est pas notre jugement : on le constate, on le garde — Gmail,
     * lui, l'efface au bout de 30 jours — et on ne le laisse entrer nulle part ailleurs (ni Réception, ni À classer,
     * ni À rattacher, et aucune proposition de rattachement).
     *
     * ⚠️ `undefined` (réponse d'API plus ancienne, ou migration 263 absente) ⇒ `null` : l'entrée est alors écartée
     * par `etiquettesVisibles` comme toute étiquette vide, au lieu d'afficher un zéro qu'on n'a pas mesuré.
     */
    { etiquette: { sorte: 'spam', evenementId: null }, libelle: 'Spam', compte: comptes?.spam ?? null },
    /**
     * ══ 🔴 LOT BOITE-INTERNE-CORBEILLE — « CORBEILLE », JUSTE SOUS « SPAM » (place demandée par Arno) ═══════════
     *
     * Les mails que GMAIL tient pour supprimés. Un seul état, synchronisé, comme le spam juste au-dessus et comme
     * le lu/non lu : la relève relit « [Gmail]/Corbeille » à chaque passe et fait coïncider les deux.
     *
     * 🔴 ELLE REMPLACE l'entrée « Corbeille » du lot 5-BOITE-3, qui était plus haut dans cette liste et désignait
     * une corbeille INTERNE (cacher un échange de nos boîtes sans toucher Gmail). Celle-là n'a jamais servi —
     * 0 échange sur 36 531 — et deux entrées du même nom, aux deux sens différents, n'auraient rien voulu dire.
     *
     * ══ 🔴 `null` ⇒ L'ENTRÉE EST RETIRÉE DE LA LISTE, et il faut l'écrire ICI. VU À L'ÉCRAN le 29/09/2026 :
     * première version, `compte: comptes?.corbeille ?? null`, en croyant que `etiquettesVisibles` l'écarterait
     * « comme toute étiquette vide ». C'EST FAUX, et le code le dit : `e.compte === null` veut dire « on ne sait
     * pas encore » — un état d'attente, pendant lequel l'entrée RESTE, sans son nombre. La colonne affichait donc
     * « Corbeille » sans compteur, menant à une liste vide par construction, avant même la migration.
     *
     * Le retrait est donc explicite, comme le faisait déjà l'entrée qu'on remplace : sans la migration 275, le
     * geste « Supprimer » n'existe pas non plus, et une corbeille qu'on ne peut pas remplir n'a rien à faire dans
     * le sommaire. `undefined` = réponse d'API plus ancienne que ce lot : même traitement.
     */
    ...(comptes?.corbeille === null || comptes?.corbeille === undefined
      ? []
      : [{
        etiquette: { sorte: 'corbeille' as const, evenementId: null },
        libelle: 'Corbeille', compte: comptes.corbeille,
      }]),
    /**
     * ⚠️ « Sans suite » VIENT APRÈS, et n'est PAS retirée. Arno a donné l'ordre des entrées qu'il regarde ; il a
     * aussi écrit « rien d'autre n'est retiré ». Elle garde donc sa place, à la suite — et `etiquettesVisibles`
     * l'écarte d'elle-même quand elle est vide, comme avant ce lot.
     */
    { etiquette: { sorte: 'sans_suite', evenementId: null }, libelle: 'Sans suite', compte: d.sansSuiteTotal },
    /**
     * ══ 🔴 LOT ERGO-BOITE — LES CARTES D'ÉVÉNEMENT NE SONT PLUS DANS CETTE COLONNE ═══════════════════════════════
     * Retrait demandé explicitement par Arno. Une carte n'est pas un dossier de courrier : la mettre parmi
     * « Réception » et « Envoyés » faisait cohabiter deux choses de nature différente, et une carte au long titre
     * (« GES-2026-000001 Re: NOTE INFORMATION RESIDENCE DE L'ORNE — CHANGEMENT DES CODES… ») occupait à elle seule
     * le quart de la colonne.
     *
     * 🔴 AUCUN ÉVÉNEMENT N'EST SUPPRIMÉ NI MASQUÉ. Ils restent sur l'écran partagé, dans leur propre colonne
     * « Événements », avec son bouton « Plein écran » — et le bouton « ← Écran partagé », premier élément de cette
     * colonne-ci, y ramène en un clic. `EtatEcran.evenements` n'est pas touché, et l'étiquette `carte` reste
     * parfaitement valide : un lien direct `?etiquette=carte-12` continue d'ouvrir la carte 12.
     *
     * ⚠️ UNE SEULE EXCEPTION : LA CARTE QU'ON REGARDE. Un lien `?etiquette=carte-12` — celui que produit le cartouche
     * d'une conversation classée — doit continuer d'ouvrir une liste NOMMÉE, avec son entrée sélectionnée dans la
     * colonne. Sans cette exception, le lien marcherait encore mais l'écran s'intitulerait « Boîte mail » et aucune
     * entrée ne serait active : on ne saurait plus ce qu'on regarde. Elle n'ajoute jamais qu'UNE ligne, et seulement
     * pendant qu'on est dessus.
     */
    ...(ouverte?.sorte === 'carte'
      ? d.evenements
        .filter((e) => e.evenementId === ouverte.evenementId)
        .map((e): EtiquetteAffichee => ({
          etiquette: { sorte: 'carte', evenementId: e.evenementId },
          libelle: e.objet, reference: e.reference, compte: e.nbFils,
        }))
      : []),
  ];
}

/** Une ligne de la file = UN ÉCHANGE (pas un message) : à ce volume, six mails ne doivent pas prendre six lignes.
 *  EXPORTÉ pour être rendu en test (contrat visible : mot « attend une réponse », pluriels, jamais de couleur seule). */
export function LigneFil({ fil, maintenant, ouvert = false, occupe = false, onAffecter, onSansSuite, onFait, onAnnuler, onOuvrir }: {
  fil: LigneFile; maintenant: Date;
  ouvert?: boolean; occupe?: boolean;
  onAffecter?: () => void; onSansSuite?: () => void;
  onFait?: (message: string) => void; onAnnuler?: () => void;
  /** LOT 5b — ouvrir la CONVERSATION depuis la file de tri. Optionnel : sans lui, la ligne est exactement celle d'avant. */
  onOuvrir?: () => void;
}) {
  return (
    <li className="gst-item">
      <div className="gst-item-haut">
        {/* LOT 4d-C — AFFICHAGE seulement : la cascade de « Re: / TR: / Fwd: » ne dit rien de plus que l'objet,
            elle dit juste que le mail a beaucoup circulé. L'objet enregistré, lui, n'est pas touché. */}
        {/* LOT 5b — l'objet devient la porte d'entrée de la conversation, comme dans n'importe quelle messagerie.
            Sans `onOuvrir`, il reste le texte simple d'avant : aucune ligne existante ne change de comportement. */}
        {onOuvrir
          ? <button type="button" className="gst-objet gst-objet-bouton" onClick={onOuvrir}>{nettoyerObjet(fil.objet) || '(sans objet)'}</button>
          : <span className="gst-objet">{nettoyerObjet(fil.objet) || '(sans objet)'}</span>}
        {fil.attend && <span className="gst-attend">attend une réponse</span>}
      </div>
      <div className="gst-item-bas">
        <span className="gst-qui">{fil.interlocuteur ?? '(expéditeur inconnu)'}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(fil.dernierLe)}>{depuis(fil.dernierLe, maintenant)}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span>{fil.nbMessages} message{fil.nbMessages > 1 ? 's' : ''}</span>
        {fil.nbPieces > 0 && <><span className="gst-sep" aria-hidden="true">·</span><span>{fil.nbPieces} pièce{fil.nbPieces > 1 ? 's' : ''} jointe{fil.nbPieces > 1 ? 's' : ''}</span></>}
      </div>
      {/* LES DEUX GESTES. Rendus seulement si l'appelant les fournit → la ligne reste rendable en lecture seule. */}
      {(onAffecter || onSansSuite) && (
        <div className="gst-actions">
          {onAffecter && (
            // LOT 4c — « Replier », et non « Fermer » : dans un outil de gestion locative, « fermer » se comprend
            //   comme « clore le dossier ». Le bouton ne fait que replier le panneau ; il le dit maintenant.
            <button type="button" className={`svv-btn ${ouvert ? 'svv-btn-outline' : 'svv-btn-primary'} gst-btn`}
              aria-expanded={ouvert} disabled={occupe} onClick={onAffecter}>
              {ouvert ? 'Replier' : LIBELLE_CLASSER}
            </button>
          )}
          {onSansSuite && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onSansSuite}>
              Classer sans suite
            </button>
          )}
        </div>
      )}
      {/* Le panneau porte le NOM de l'échange sur lequel il agit : après un geste la liste remonte d'un cran, et un
          panneau anonyme ouvert à la même place que le précédent ferait rattacher le mauvais échange sans rien dire. */}
      {ouvert && onFait && onAnnuler && (
        <PanneauAffecter filId={fil.filId} objet={nettoyerObjet(fil.objet) || '(sans objet)'} onFait={onFait} onAnnuler={onAnnuler} />
      )}
    </li>
  );
}

/**
 * Une carte d'événement : qui demande, quoi, depuis quand, dernier échange, état. EXPORTÉE pour être rendue en test.
 *
 * ⚠️ ELLE N'EST RENDUE NULLE PART EN PRODUCTION — la vignette vivante est le titre de `CarteVive`. Elle garde
 * pourtant le contrat à jour : deux vignettes d'événement qui ne diraient pas la même chose finiraient par être
 * lues l'une pour l'autre.
 *
 * 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA CAPSULE « attend une réponse » EST RETIRÉE (accord d'Arno). Elle reste
 * sur les ÉCHANGES (`LigneFil`), où elle dit autre chose : un fil qui attend une réponse de notre part. Sur un
 * ÉVÉNEMENT, elle doublait ce que l'état et la dernière étape disent déjà mieux.
 */
export function CarteEv({ carte, maintenant }: { carte: CarteEvenement; maintenant: Date }) {
  return (
    <li className="gst-item">
      <div className="gst-item-haut">
        <span className="gst-objet">{carte.objet}</span>
      </div>
      <div className="gst-item-bas">
        <span className="gst-ref">{carte.reference}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span>{libelleEtat(carte.etat)}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(carte.ouvertLe)}>ouvert {depuis(carte.ouvertLe, maintenant)}</span>
      </div>
      <div className="gst-item-bas">
        {carte.demandeur && <><span className="gst-qui">{carte.demandeur}</span><span className="gst-sep" aria-hidden="true">·</span></>}
        {carte.adresseLibre && <><span>{carte.adresseLibre}</span><span className="gst-sep" aria-hidden="true">·</span></>}
        <span>{carte.nbFils} échange{carte.nbFils > 1 ? 's' : ''}</span>
        {carte.dernierEchangeLe && <>
          <span className="gst-sep" aria-hidden="true">·</span>
          <span title={formaterDateFr(carte.dernierEchangeLe)}>dernier échange {depuis(carte.dernierEchangeLe, maintenant)}</span>
        </>}
      </div>
    </li>
  );
}

const CSS_GESTION = `
/* ══ LOT ANNUAIRE-BLOC-DEDIE, POINT 1 — LE BLOC ANNUAIRE, ET SA SEPARATION D'AVEC L'ECRAN PARTAGE ══
   Son propre cadre : fond de surface (BLANC en theme Clair, et ce qui en tient lieu en Sombre — un blanc en dur
   y serait illisible), bord net, coins arrondis. Marge franche au-dessus et en dessous, puis un trait discret :
   on voit deux zones, l'outil en haut, le courrier et les evenements en dessous.
   🔴 UN LISERE PLUTOT QU'UNE OMBRE (Arno laisse le choix : « legere ombre OU lisere ») : la feuille de ce module
   n'admet AUCUNE couleur en dur, et une ombre portee en demande une (un rgba). Un second anneau pose sur un
   jeton donne le meme relief, et il suit le theme Sombre sans rien dire de lui.
   ⚠️ AUCUN CADRE COMMUN avec les colonnes : ce bloc se ferme avant elles, et le trait le dit.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.gst-bloc-annuaire{margin:0 0 14px;padding:14px;border:1px solid var(--color-svv-line-strong);border-radius:14px;
  background:var(--color-svv-surface);box-shadow:0 0 0 3px var(--color-svv-field)}
.gst-separation{height:0;margin:0 0 16px;border:0;border-top:1px solid var(--color-svv-line)}
/* 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 2 — la feuille du bouton rond, la MEME que celle de la boite en plein
   ecran (cf. BoutonRond.tsx). Sans elle, le bouton arriverait nu sur l'accueil : carre, sans bordure, sans
   rotation. Une classe partagee dont la feuille ne l'est pas n'est pas partagee.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
${CSS_BOUTON_ROND}
/* DEUX CÔTÉS au-dessus de 900 px ; UNE colonne en dessous, la file d'abord — par l'ordre du DOM, jamais par un order CSS. */
/* ── LOT 5-GMAIL : LA PAGE, ET SON EN-TÊTE REPLIÉ EN PLEIN ÉCRAN ───────────────────────────────────────────────── */
/* La largeur de confort de l'écran partagé ; en plein écran, la boîte prend toute la place disponible. */
.gst-page{max-width:1120px}
:root[data-gst-plein="1"] .gst-page{max-width:none}
/* L'en-tête de page (titre + phrase) se replie : son titre et sa phrase repassent dans le bandeau compact, qui les
   porte l'un à côté de l'autre. Rien n'est retiré — c'est un déménagement, et il est réversible au clic sur retour. */
:root[data-gst-plein="1"] .svv-page-head{display:none}
.gst-bandeau--compact{padding:6px 10px;margin-bottom:.6rem;gap:.5rem}
.gst-bandeau-titre{display:inline-flex;align-items:center;gap:.4rem;font-size:15px;font-weight:700;color:var(--color-svv-ink)}
/* LOT 5-FUSION — L'EN-TÊTE D'UNE COLONNE : son titre, et son bouton « Plein écran » au bout. Il passe à la ligne sur
   téléphone plutôt que de comprimer le titre — un bouton de 44 px et un titre lisible ne tiennent pas sur 320 px. */
.gst-entete-col{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;margin:0 0 .5rem}
.gst-entete-col .gst-titre{margin:0}
.gst-deux{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT ACCUEIL-GESTION, POINT 3 — LES DEUX COLONNES SE REPONDENT
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO (06/10/2026) : « meme largeur (50/50), meme hauteur d'en-tete (titre + compteur + filtres
   alignes sur une meme ligne de base), memes marges, meme hauteur de ligne de liste, memes pieds (pagination
   alignee), defilement independant mais meme hauteur visible. Aucune fonction retiree ni masquee. »

   ETAT MESURE AVANT (fenetre 1456 px) : la grille etait DEJA 50/50 (552 + 16 + 552). Tout le reste divergeait —
   colonne de gauche 3 386 px de haut contre 264 a droite, listes commencant a 497 px et 445 px, lignes de 106 px
   d'un cote et de 88 a 116 de l'autre, un pied de deux rangees a gauche et aucun a droite.

   TROIS RANGEES, LES MEMES DES DEUX COTES :
     ① l'EN-TETE, lui-meme en deux : le titre (avec son compteur) puis les outils. A gauche les filtres et
        « Plein ecran » ; a droite « Plein ecran » seul. Aucune rangee vide nulle part.
     ② le CORPS, qui defile pour lui-meme, a hauteur FIXE et identique : c'est « defilement independant, meme
        hauteur visible ». Fixe et non plafonnee, sinon la colonne des evenements (deux cartes) serait plus
        courte que celle des mails, et les pieds ne s'aligneraient plus.
     ③ le PIED, de meme hauteur, cale en bas.

   ⚠️ TOUT CECI NE VAUT QUE SUR LARGE. Sous 900 px les colonnes passent l'une sous l'autre (regle existante), et
   deux boites a defilement empilees dans un petit ecran seraient un piege : la hauteur fixe est donc LEVEE, et
   la page reprend son defilement unique. C'est pour cela que les regles vivent dans une media query.

   ⚠️ AUCUNE COULEUR, AUCUNE FONCTION ICI : ce bloc ne fait que de la mise en page. Rien n'est retire ni masque —
   les gestes du pied de la colonne de gauche sont passes cote a cote, pas supprimes. */

/* L'EN-TETE COMMUN : deux rangees, les memes hauteurs des deux cotes. */
.gst-tete-partage{display:flex;flex-direction:column;gap:.4rem;margin:0 0 .5rem}
.gst-tete-partage-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;min-height:23px}
.gst-tete-partage-titre .gst-titre{margin:0}
.gst-tete-partage-outils{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px}
/* « Plein ecran » ferme la rangee, a droite, dans les DEUX colonnes. */
.gst-tete-partage-outils .gst-plein{margin-left:auto}
/* Le corps et le pied : memes marges, meme hauteur de pied. */
.gst-corps-partage{min-width:0}
/* ⚠️ 48 px ET NON 44 : un bouton de 44 px pose dans une rangee alignee au centre occupe 48 px avec son liset.
   Mesure a l'ecran : le pied de gauche faisait 48 et celui de droite 44, et les deux colonnes se terminaient a
   4 px l'une de l'autre. On fixe donc la MEME hauteur des deux cotes plutot que de la laisser au contenu. */
.gst-pied-partage{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;min-height:48px;margin-top:8px}

@media (min-width:901px){
  /* Les deux colonnes font la meme hauteur : c'est la grille qui l'impose, pas leur contenu. */
  .gst-deux{align-items:stretch}
  .gst-deux > .gst-col{display:flex;flex-direction:column;min-height:0}
  /* La colonne de gauche delegue son contenu a BoiteReception : il doit s'etirer comme son hote. */
  .gst-deux > .gst-col > .brc{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;gap:0}
  /* ② LA HAUTEUR VISIBLE COMMUNE. max() donne un plancher : sur un ecran bas, la liste reste utilisable. */
  .gst-deux .gst-corps-partage{flex:1 1 auto;min-height:0;height:max(22rem,52vh);overflow-y:auto}
  /* ③ LE PIED RESTE EN BAS, meme quand le corps ne se remplit pas. */
  .gst-deux .gst-pied-partage{margin-top:auto}
}

/* ══ ① LE MEME RYTHME DE LIGNE DANS LES DEUX LISTES ════════════════════════════════════════════════════════════

   Meme hauteur MINIMALE, memes marges internes, meme separateur : une ligne de mail et une carte d'evenement se
   lisent desormais sur la meme trame. Mesure avant : 106 px a gauche contre 88 a 116 a droite, avec des cartes
   detachees (bordure + coins arrondis + fond) face a des lignes separees par un filet.

   ⚠️ C'EST UN MINIMUM, PAS UN PLAFOND, et c'est delibere. Une carte d'evenement qui porte une pastille « attend
   une reponse » depasse les 106 px ; la rogner reviendrait a MASQUER du contenu, ce qu'Arno interdit dans la
   meme phrase qu'il demande l'harmonie (« aucune fonction retiree ni masquee »). Entre un pixel identique et un
   contenu entier, c'est le contenu qui gagne — et la trame commune suffit a ce que les deux colonnes se
   repondent.

   ⚠️ CE BLOC NE VAUT QUE DANS .gst-deux : en plein ecran, la liste des evenements garde ses cartes detachees. */
.gst-deux .brc-li,
.gst-deux .gst-item{min-height:var(--gst-ligne,106px)}
.gst-deux .gst-liste{gap:0}
.gst-deux .gst-item{border-radius:0;border:0;border-bottom:1px solid var(--color-svv-line);
  background:transparent;padding:8px 4px}
/* Les cartes en plein écran : deux de front quand la largeur le permet, une seule sinon. Aucune fonction n'y change.
   Point de rupture en max-width, comme tout le reste de cette feuille : c'est la convention du fichier, et elle évite
   qu'une largeur minimale en dur se glisse dans une règle. */
.gst-cartes-larges{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}
@media (max-width:1099px){.gst-cartes-larges{grid-template-columns:1fr}}
@media (max-width:900px){.gst-deux{grid-template-columns:1fr}}
.gst-col{min-width:0}  /* sans ça, une grille laisse un enfant déborder de sa colonne */
/* LOT ERGO-BOITE-4 — flex-wrap : la mention « courrier automatique » vit maintenant sur cette ligne, poussée à
   droite. Sur un écran étroit elle doit pouvoir descendre sous le titre plutôt que l'écraser.
   ⚠️ AUCUN ACCENT GRAVE ICI : littéral gabarit. */
.gst-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;font-size:15px;font-weight:700;color:var(--color-svv-ink);margin:0 0 .5rem}
.gst-compte{display:inline-block;background:var(--color-svv-field);color:var(--color-svv-muted);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px}
.gst-bandeau{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;margin:0 0 1rem;font-size:.85rem;color:var(--color-svv-ink);line-height:1.45}
.gst-btn{width:auto;flex-shrink:0;min-height:44px;padding:.55rem 1rem;font-size:.85rem;border-radius:.6rem}
.gst-actions{display:flex;flex-wrap:wrap;gap:.5rem;flex-shrink:0}
/* ── LOT 5-VEILLE — l'état de la relève AUTOMATIQUE ──
   Une seule colonne, qui se replie naturellement à 390 px ; le texte porte l'information À LUI SEUL, la bordure et la
   couleur ne font que le redire (une information tenue par la seule couleur n'existe pas pour qui ne la distingue pas). */
/* LOT RATTACHEMENT-2 — le bouton d'entrée de l'historique, sur une carte dépliée. */
.gst-histo{align-self:flex-start;margin:.2rem 0 .4rem}
.gst-veille{display:flex;flex-direction:column;gap:.2rem;font-size:.82rem;line-height:1.45;margin:-.4rem 0 1rem;
  padding:8px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);
  color:var(--color-svv-muted);overflow-wrap:anywhere}
.gst-veille--alerte{border-color:var(--color-svv-red);color:var(--color-svv-ink);font-weight:600}
.gst-veille-texte{color:inherit}
/* L'aide est le GESTE à faire : toujours visible, jamais repliée derrière un survol — il n'y a pas de survol sur un téléphone. */
.gst-veille-aide{font-weight:400;color:var(--color-svv-muted)}
/* LOT COPIE-SURV — l'aide de l'alerte de copie porte une COMMANDE à recopier : elle doit rester lisible et
   sélectionnable au doigt, et casser proprement sur un téléphone plutôt que déborder. */
.gst-veille-commande{font-size:.78rem;overflow-wrap:anywhere;user-select:all}
/* AUCUNE animation, AUCUNE transition, et pas davantage de clignotement : une alerte qui bouge attire l'œil une fois
   puis fatigue. La préférence "mouvement réduit" n'a donc rien à neutraliser ici — c'est la façon la plus sûre de la
   respecter. (Pas d'accent grave dans ce commentaire : il est DANS un littéral gabarit, qu'il terminerait.) */
/* Compte rendu de passe : le TON est porté par un mot dans le texte autant que par la couleur (jamais la couleur seule). */
.gst-compte-rendu{font-size:.85rem;line-height:1.5;margin:0 0 1rem;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.gst-ton-erreur{border-color:var(--color-svv-red);color:var(--color-svv-red);font-weight:600}
.gst-ton-info{color:var(--color-svv-muted)}
.gst-info,.gst-vide,.gst-tronc{font-size:.85rem;color:var(--color-svv-muted);line-height:1.5;margin:0 0 .5rem}
.gst-vide{background:var(--color-svv-surface);border:1px dashed var(--color-svv-line-strong);border-radius:10px;padding:14px 16px}
.gst-erreur{font-size:.9rem;font-weight:600;color:var(--color-svv-red);margin:0 0 .6rem}
.gst-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* Cible tactile confortable ; tout casse en fin de ligne → jamais de débordement horizontal, même sur un objet sans espace. */
.gst-item{min-height:44px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;overflow-wrap:anywhere}
.gst-item-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
.gst-item-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.8rem;color:var(--color-svv-muted);margin-top:4px}
.gst-objet-bouton{background:none;border:0;padding:0;margin:0;text-align:left;cursor:pointer;color:inherit;font:inherit;font-weight:inherit;min-height:44px;text-decoration:underline;text-underline-offset:3px}
.gst-objet-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.gst-objet{font-weight:700;font-size:.92rem;color:var(--color-svv-ink);line-height:1.35}
.gst-qui{font-weight:600;color:var(--color-svv-ink)}
.gst-ref{font-variant-numeric:tabular-nums;font-weight:600;color:var(--color-svv-ink)}
.gst-sep{color:var(--color-svv-line-strong)}
/* L'attente est dite par un MOT, jamais par la seule couleur (lisible en niveaux de gris et aux daltoniens). */
.gst-attend{flex-shrink:0;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--color-svv-red);border:1px solid var(--color-svv-red);border-radius:999px;padding:2px 8px}
/* PANNEAU d'affectation, ouvert sous la ligne. */
.gst-panneau{margin-top:10px;padding:12px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;display:flex;flex-direction:column;gap:10px}
/* Sur QUOI on agit, rappelé dans le panneau : la liste bouge sous l'écran, pas la mémoire de celui qui clique. */
.gst-panneau-titre{margin:0;font-size:.8rem;color:var(--color-svv-muted);line-height:1.4}
.gst-voies{display:flex;flex-wrap:wrap;gap:.5rem}
.gst-voie{min-height:44px;padding:.5rem .9rem;font-size:.85rem;font-weight:600;border-radius:.6rem;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.gst-voie--active{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.gst-voie:disabled{opacity:.5;cursor:not-allowed}
.gst-champs{display:flex;flex-direction:column;gap:10px}
.gst-champ{display:flex;flex-direction:column;gap:4px}
/* 16px minimum : en dessous, les navigateurs mobiles zooment à la mise au point du champ. */
.gst-saisie{min-height:44px;width:100%;box-sizing:border-box;padding:.5rem .7rem;font-size:16px;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.gst-note{margin:0;font-size:.78rem;line-height:1.4;color:var(--color-svv-muted)}
/* ── LOT 4c : LA CARTE VIVANTE ─────────────────────────────────────────────────────────────────────────────────── */
/* La ligne de titre d'un bloc repliable est un vrai bouton : on la laisse occuper toute la largeur et respirer. */
.gst-repli{align-items:flex-start;padding:.6rem .7rem}
.gst-carte-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;min-width:0}
/* ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA VIGNETTE : LE TEXTE A GAUCHE, LA MINIATURE A DROITE ════════════
   Arno : « Ajoute A DROITE de la vignette une miniature de la DERNIERE carte d'etape de sa frise […] Le titre se
   coupe proprement avec “…” pour laisser la place. »
   🔴 LE TEXTE PREND CE QUI RESTE (flex:1 1 auto + min-width:0, sans quoi un enfant en flex refuse de retrecir
   sous sa largeur de contenu) ; la miniature ne se laisse PAS ecraser (flex-shrink:0). L'inverse l'aurait
   reduite a un trait sur les titres longs — c'est-a-dire la ou l'on a le plus besoin de savoir ou en est le
   dossier. */
.gst-carte-titre--avec-etape{flex-wrap:nowrap;align-items:flex-start;gap:.6rem}
.gst-carte-texte{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}
/* ⚠️ LA COUPURE GARDE LE TITRE ENTIER DANS SON ATTRIBUT « title » (balisage) : une coupure qui perd
   l'information serait un titre faux. */
.gst-objet--coupe{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ══ LA MINIATURE — meme dessin qu'un carre de la frise, en reduit ══
   ⚠️ PREFIXE « gst-mini- » ET NON « fav- » : la feuille de la frise n'est pas injectee sur l'ecran partage, et deux
   composants ne partagent JAMAIS un prefixe de classe (leçon du lot FRISES-REPARATION — il n'y a pas de portee
   en CSS). */
/* ══ LOT CARTE-EVENEMENT-EPUREE, POINT 3 — LA COLONNE DE DROITE : la miniature, et la capsule Monga dessous ══
   Arno : « afficher la capsule verte Monga JUSTE EN DESSOUS de la vignette de droite ». La colonne a la LARGEUR
   DE LA MINIATURE (132 px) et ne s'etire pas : c'est le texte de gauche qui prend la place restante, comme avant.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gst-carte-droite{flex:0 0 auto;display:flex;flex-direction:column;align-items:stretch;gap:3px;width:132px}
.gst-mini{flex:0 0 auto;box-sizing:border-box;width:132px;min-height:46px;padding:4px 6px;
  display:flex;flex-direction:column;gap:1px;position:relative;
  border-radius:8px;border:2px solid var(--color-svv-green);background:var(--color-svv-field)}
/* 🔴 AMBRE QUAND L'ETAPE EST « A CONFIRMER » — la meme regle que la frise, et le MOT est ecrit en dessous. */
.gst-mini--doute{border-color:var(--color-svv-amber)}
.gst-mini-titre{font-size:.72rem;font-weight:700;line-height:1.15;color:var(--color-svv-ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gst-mini-picto{color:var(--color-svv-red)}
.gst-mini-date{font-size:.68rem;color:var(--color-svv-muted)}
.gst-mini-doute{font-size:.64rem;font-style:italic;color:var(--color-svv-amber)}
.gst-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}

/* ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — LA VIGNETTE « MONGA » ══════════════════════════════════════════
   Arno : « une vignette “MONGA” bien visible, fond vert, texte blanc, avec la reference au survol ». La MEME
   que sur la fiche du bien (.evb-monga), au meme dessin.
   ⚠️ LE JETON DE TEXTE EST --color-svv-bg, ET NON UN BLANC EN DUR : en theme Sombre, « blanc » est le fond de
   la page, et c'est lui qui donne le contraste contre le vert. */
.gst-monga-vignette{display:inline-block;margin-left:.35rem;padding:1px 7px;border-radius:999px;
  font-size:.68rem;font-weight:700;letter-spacing:.04em;white-space:nowrap;
  color:var(--color-svv-bg);background:var(--color-svv-green)}
/* ══ LOT CARTE-EVENEMENT-EPUREE, POINT 3 — LA MEME CAPSULE, SOUS LA MINIATURE ══
   Meme dessin (fond vert, texte blanc) : seule sa POSE change. Elle porte en plus la derniere etape Monga, qui
   est un texte et non un sigle — elle passe donc a la ligne plutot que de deborder de sa colonne de 132 px.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gst-monga-vignette--sous{display:block;margin-left:0;white-space:normal;line-height:1.25;
  text-align:center;letter-spacing:.02em}

/* ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — LES LIGNES COURTES DE LA VIGNETTE ══════════════════════════════
   Arno : « ajoute, sur des lignes COURTES ». Chacune tient sur une ligne et se coupe proprement — la vignette
   vit dans une colonne etroite, et un retour a la ligne par adresse la ferait grandir du double.
   ⚠️ « min-width:0 » EST NECESSAIRE sur le parent (.gst-carte-texte, deja pose) : sans lui, un enfant en flex
   refuse de retrecir sous la largeur de son contenu, et la coupure ne se declenche jamais. */
.gst-carte-ligne{display:block;font-size:.74rem;line-height:1.3;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gst-carte-ligne--adresse{color:var(--color-svv-ink)}
/* Le type de l'evenement : il se distingue du reste de la ligne sans crier. */
.gst-carte-type{font-weight:700;color:var(--color-svv-ink)}
/* ⚠️ ECRAN ETROIT : les lignes se coupent toujours, elles ne debordent jamais. */
@media (max-width:600px){
  .gst-carte-ligne{white-space:normal;overflow-wrap:anywhere}
}

/* ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 4 — « MIS A JOUR PAR MONGA » PASSE AU ROUGE ════════════════════════
   Arno (07/10/2026) : « Le message “Mis a jour par Monga · <heure>” s'ecrit en ROUGE, et TOUTE la vignette de
   l'evenement est cerclee de rouge (au lieu du lisere vert). Effet discret si “reduire les animations” est
   active. »

   ⚠️ CE QUE C'ETAIT AU LOT PRECEDENT : un lisere VERT. Le vert disait « dans la frise » partout ailleurs dans
   l'application (les cartes d'etape, la vignette MONGA) — il ne pouvait donc pas dire AUSSI « regarde-moi ».
   Le rouge est la couleur d'attention du depot (--color-svv-red), et elle ne sert a rien d'autre ici.

   🔴 LE CERCLE EST UNE OMBRE, PAS UNE BORDURE : une bordure deplacerait la vignette de 3 px en s'allumant, et
   toute la liste sauterait a chaque relecture. L'ombre ne prend aucune place.

   🔴🔴 ET C'EST UNE OMBRE **INTERIEURE**, DEFAUT MESURE A L'ECRAN. Premier jet : une ombre exterieure. Mesure
   sur l'ecran partage — la vignette est collee aux bords de .gst-corps-partage (marges 0 en haut, a gauche, a
   droite), et ce conteneur defile donc porte overflow:auto. Le cercle etait COUPE SUR TROIS COTES : seul le bas
   se voyait. Arno demande que « TOUTE la vignette soit cerclee » ; un cercle coupe sur trois cotes n'est pas un
   cercle. Une ombre « inset » se dessine a l'interieur de la boite : rien ne peut la rogner.

   🔴 « SANS CLIGNOTEMENT AGRESSIF » : le cercle ne DISPARAIT jamais, il respire — la pulsation joue sur le halo
   exterieur, le trait de 2 px reste. 2,4 s par cycle, bien au-dessous des 3 clignotements par seconde que les
   regles d'accessibilite interdisent, et sans aucun changement de couleur.

   ⚠️ L'EFFET NE PORTE JAMAIS L'INFORMATION SEUL : le badge l'ECRIT sur la miniature, et le lecteur d'ecran
   l'entend. Un cercle rouge tout seul ne dit rien a qui ne le voit pas. */
.gst-item--monga{position:relative;border-radius:10px;
  box-shadow:inset 0 0 0 2px var(--color-svv-red),inset 0 0 12px 0 var(--color-svv-red);
  animation:gst-monga-respire 2.4s ease-in-out infinite}
@keyframes gst-monga-respire{
  0%,100%{box-shadow:inset 0 0 0 2px var(--color-svv-red),inset 0 0 12px 0 var(--color-svv-red)}
  50%{box-shadow:inset 0 0 0 2px var(--color-svv-red),inset 0 0 2px 0 var(--color-svv-red)}
}
/* 🔴 « EFFET DISCRET SI “REDUIRE LES ANIMATIONS” EST ACTIVE » (Arno) : le cercle reste, le mouvement s'arrete,
   et le halo exterieur tombe — il ne reste que le trait. On retire le mouvement, jamais l'information. */
@media (prefers-reduced-motion: reduce){
  .gst-item--monga{animation:none;box-shadow:inset 0 0 0 2px var(--color-svv-red)}
}
/* Le badge, sur la miniature. Il porte l'HEURE : l'effet ne survit qu'a une mise a jour recente.
   🔴 EN ROUGE DEPUIS LE LOT EVENEMENT-MINIMALISTE (point 4), comme le cercle : les deux disent la meme chose,
   et deux couleurs pour un seul fait se liraient comme deux faits.
   🔴 DEFAUT MESURE A L'ECRAN : « white-space:nowrap » etait HERITE de la vignette, et le badge se faisait
   couper — « Mis a jour par Monga · 19: », l'heure amputee (135 px de texte pour 116 de place). On le remet
   donc explicitement a « normal » : le badge tient sur deux lignes plutot que de perdre ce qu'il annonce. */
.gst-mini-monga{display:block;margin-top:1px;font-size:.62rem;font-weight:700;line-height:1.2;
  white-space:normal;color:var(--color-svv-red);overflow-wrap:anywhere}
/* ⚠️ ECRAN ETROIT : la miniature passe SOUS le texte plutot que de l'etrangler. Elle reste entiere — c'est
   l'information qu'on vient chercher. */
@media (max-width:600px){
  .gst-carte-titre--avec-etape{flex-wrap:wrap}
  .gst-mini{width:100%}
  /* Sur telephone, la colonne de droite passe sous le texte et prend toute la largeur, comme la miniature. */
  .gst-carte-droite{width:100%}
}
.gst-carte-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;flex-basis:100%;font-size:.8rem;font-weight:400;color:var(--color-svv-muted)}
.gst-corps{display:flex;flex-direction:column;gap:12px;padding:12px 2px 2px}
/* ══ LOT ACCUEIL-GESTION-ANNUAIRE, POINT 4 — LE GROS BOUTON FAIT PARTIE DE SA CAPSULE ══
   Arno : « aucun vide entre la carte et le bouton, un ecart net avec l'evenement suivant, et il doit se lire
   clairement comme faisant partie de sa capsule ».
   🔴 TROIS REGLES, ET CHACUNE REPARE UNE CHOSE VUE A L'ECRAN : le corps colle a la carte (plus de padding ni de
   gap en haut) ; le bloc du bouton perd son cadre et son fond, qui en faisaient un troisieme objet pose entre
   deux evenements ; et l'ecart se met SOUS le bouton, a l'interieur de la capsule, avant le filet qui separe
   de l'evenement suivant.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.gst-corps--partage{padding:0;gap:0;margin-bottom:10px}
.gst-corps--partage .gst-bloc{background:transparent;border:0;border-radius:0;padding:8px 0 0}
.gst-bloc{display:flex;flex-direction:column;gap:8px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px}
.gst-sous-titre{margin:.25rem 0 0;font-size:13px;font-weight:700;color:var(--color-svv-ink);display:flex;align-items:center;gap:.5rem}
/* LOT MONGA-1, POINT 4 — l'intervention Monga d'une carte : badge, derniere etape, lien, et la PROPOSITION de
   clore. Aucune couleur en dur : rien que les jetons SVAV, donc le theme Sombre marche sans rien dire de lui. */
.gst-monga{margin:.25rem 0 0;padding:6px 10px;border:1px solid var(--color-svv-line-strong);
  border-radius:.5rem;background:var(--color-svv-field);min-width:0}
.gst-monga-tete{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;font-size:12px}
.gst-monga-badge{padding:.05rem .45rem;border-radius:999px;font-size:11px;font-weight:700;
  color:var(--color-svv-ink);border:1px solid var(--color-svv-line-strong)}
.gst-monga-etape{font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.gst-monga-lien{color:var(--color-svv-red);text-decoration:underline}
.gst-monga-clore{margin:6px 0 0;display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;font-size:12px;
  color:var(--color-svv-ink)}
@media (max-width:420px){ .gst-monga-clore button{width:100%} }
/* Fiche d'une carte : deux colonnes au large, une seule sur mobile — jamais un tableau qui déborde. */
.gst-fiche{display:grid;grid-template-columns:auto 1fr;gap:.35rem .75rem;margin:0;font-size:.85rem}
.gst-fiche dt{font-weight:700;color:var(--color-svv-muted)}
.gst-fiche dd{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (max-width:520px){.gst-fiche{grid-template-columns:1fr;gap:.1rem}.gst-fiche dd{margin-bottom:.4rem}}
/* Une donnée absente est DITE absente — un blanc laisserait croire à un oubli d'affichage. */
.gst-absent{color:var(--color-svv-muted);font-style:italic}
.gst-item--fil{background:var(--color-svv-field)}
.gst-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* Un message : le sens est porté par un MOT (« reçu de » / « nous avons écrit »), la bordure ne fait que l'appuyer. */
.gst-msg{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-left:3px solid var(--color-svv-line-strong);border-radius:8px;padding:8px 10px}
.gst-msg--envoye{border-left-color:var(--color-svv-green)}
.gst-msg-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.78rem;color:var(--color-svv-muted)}
/* pre-wrap : le texte du mail garde ses paragraphes ; anywhere : une URL à rallonge ne fait pas déborder l'écran. */
.gst-msg-corps{margin:.4rem 0 0;font-size:.85rem;line-height:1.5;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.gst-etiquette{font-size:11px;font-weight:700;color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong);border-radius:999px;padding:1px 7px}
.gst-pieces{list-style:none;margin:.5rem 0 0;padding:0;display:flex;flex-direction:column;gap:.3rem}
.gst-piece{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.8rem;color:var(--color-svv-muted)}
/* Cible tactile : un lien de pièce jointe se clique au doigt comme un bouton. */
.gst-lien{min-height:44px;display:inline-flex;align-items:center;font-weight:600;color:var(--color-svv-red);text-decoration:underline}
/* ── LOT 4d : LE MENU DISCRET, ET LA RECHERCHE D'ÉVÉNEMENT ─────────────────────────────────────────────────────── */
/* Le menu se pose dans le coin de l'élément, SANS entrer dans le bouton de titre (un bouton dans un bouton n'existe pas). */
.gst-coin{position:absolute;top:6px;right:6px;z-index:2}
/* …et le titre lui réserve sa place, pour qu'aucun texte ne passe sous le menu. */
.gst-repli--avec-menu{padding-right:52px}
.gst-item--fil{position:relative}
.gst-menu{position:relative;display:inline-block}
/* DISCRET AU REPOS, jamais introuvable : le glyphe est pâle, mais la cible fait 44 px et le focus est très visible. */
.gst-menu-bouton{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;
  font-size:18px;line-height:1;color:var(--color-svv-muted);background:transparent;border:1px solid transparent;
  border-radius:.5rem;cursor:pointer}
.gst-menu-bouton:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line)}
.gst-menu-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;color:var(--color-svv-ink)}
.gst-menu-bouton[aria-expanded="true"]{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.gst-menu-bouton:disabled{opacity:.4;cursor:not-allowed}
.gst-menu-liste{position:absolute;top:100%;right:0;z-index:5;min-width:min(260px,80vw);display:flex;flex-direction:column;
  /* Pas d'ombre portée : elle exigerait une couleur en dur, et la charte n'en a pas. Une bordure franche suffit à
     détacher le menu du fond, et reste lisible en contraste élevé. */
  background:var(--color-svv-surface);border:2px solid var(--color-svv-line-strong);border-radius:.6rem;overflow:hidden}
.gst-menu-entree{min-height:44px;padding:.6rem .8rem;text-align:left;font-size:.85rem;color:var(--color-svv-ink);
  background:transparent;border:0;border-bottom:1px solid var(--color-svv-line);cursor:pointer}
.gst-menu-entree:last-child{border-bottom:0}
/* LOT 5-FIDÈLE — les séparateurs et les sections de Gmail. Un trait, un titre : on vise sans lire. */
.gst-menu-groupe{border-top:2px solid var(--color-svv-line-strong)}
.gst-menu-section{margin:0;padding:.45rem .8rem .1rem;font-size:.7rem;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--color-svv-muted)}
.gst-menu-entree{display:flex;flex-direction:column;gap:2px}
.gst-menu-aide{font-size:.72rem;line-height:1.35;color:var(--color-svv-muted);white-space:normal}
/* SUR TÉLÉPHONE, le menu est une FEUILLE PLEINE LARGEUR : un menu de 260 px collé à droite déborde de l'écran. */
@media (max-width:599px){
  .gst-menu-liste{position:fixed;left:0;right:0;bottom:0;top:auto;min-width:0;width:100%;max-height:75vh;
    overflow-y:auto;border-radius:.9rem .9rem 0 0;border-width:2px 0 0}
}
.gst-menu-entree:hover,.gst-menu-entree:focus-visible{background:var(--color-svv-field)}
/* Défaire n'est pas dangereux dans ce module : la teinte est SOBRE, jamais un rouge d'alerte qui ferait hésiter. */
.gst-menu-entree--discrete{color:var(--color-svv-muted)}
/* RECHERCHE D'ÉVÉNEMENT — la même partout : file, déplacement d'un échange, déplacement d'un mail. */
.gst-choix{display:flex;flex-direction:column;gap:8px}
.gst-resultats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;max-height:min(46vh,340px);overflow-y:auto}
.gst-resultat{width:100%;min-height:44px;display:flex;flex-direction:column;gap:2px;padding:.5rem .6rem;text-align:left;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.5rem;cursor:pointer}
.gst-resultat:hover,.gst-resultat:focus-visible{border-color:var(--color-svv-line-strong)}
.gst-resultat--choisi{border-color:var(--color-svv-red)}
.gst-resultat--nouveau{font-weight:700;color:var(--color-svv-ink);border-style:dashed}
.gst-resultat-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;justify-content:space-between}
.gst-resultat-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.78rem;color:var(--color-svv-muted)}
/* LOT 4d-B2 — LES MAILS PARTIS d'un échange : annoncés, et remis d'un clic. Discret, mais jamais tu. */
.gst-partis{list-style:none;margin:.5rem 0 0;padding:0;display:flex;flex-direction:column;gap:.35rem}
.gst-parti{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;font-size:.8rem;color:var(--color-svv-muted);
  border-left:3px solid var(--color-svv-line-strong);padding:.25rem .5rem}
.gst-lien-bouton{min-height:44px;padding:0;font-size:.8rem;font-weight:600;color:var(--color-svv-red);background:transparent;
  border:0;text-decoration:underline;cursor:pointer}
/* Le menu d'un message se range au bout de sa ligne d'en-tête, sans pousser le texte. */
.gst-msg-menu{margin-left:auto}
/* LOT 4d-C — le texte CITÉ et les images de signature : présents, repliés, jamais supprimés. */
/* ══ 🔴 LOT LECTURE-HTML-FIL-TROMBONE — LA CITATION EST VISIBLE, MISE À DISTANCE PAR LE STYLE ═══════════════════
   Elle était repliée derrière « Afficher le message cité » (le .gst-cite ci-dessous, conservé pour la RÉDACTION,
   où le repli garde son sens : on n'y relit pas ce qu'on cite, on vérifie qu'il est bien joint).
   Dans la LECTURE, le repli obligeait à cliquer pour savoir à quoi on répondait. Retrait + filet gris : l'œil
   distingue le neuf de l'ancien sans un seul geste, et il n'y a plus aucun état à tenir. */
.gst-cite-bloc{margin:.5rem 0 0;padding:0 0 0 .7rem;border-left:3px solid var(--color-svv-line-strong)}
.gst-cite-bloc .gst-cite-corps{border-left:0;padding-left:0;margin:0}
.gst-cite{margin-top:.4rem}
.gst-cite-titre{min-height:44px;display:flex;align-items:center;font-size:.78rem;font-weight:600;color:var(--color-svv-muted);cursor:pointer}
.gst-cite-corps{color:var(--color-svv-muted);border-left:2px solid var(--color-svv-line-strong);padding-left:.6rem}
/* CLASSÉS SANS SUITE — replié par défaut : présent sans encombrer. */
/* LOT STATUT-PAR-MAIL — la file des echanges sans evenement, repliee sous la boite de reception. Rien n'est
   retire : elle garde son plein ecran, sa fenetre d'activite, ses gestes et son compteur. */
.gst-file-echanges{margin-top:10px;border-top:1px solid var(--color-svv-line);padding-top:8px}
.gst-file-titre{font-size:.85rem;font-weight:600;color:var(--color-svv-ink);cursor:pointer}
.gst-file-titre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.gst-sans-suite{margin-top:1rem;border-top:1px solid var(--color-svv-line);padding-top:.75rem}
.gst-sans-suite-titre{display:flex;align-items:center;gap:.5rem;min-height:44px;font-size:13px;font-weight:700;color:var(--color-svv-ink);cursor:pointer}
`;
