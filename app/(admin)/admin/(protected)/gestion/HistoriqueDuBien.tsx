'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { formaterDateIso, periodeOccupation } from '../../../../lib/gestion/annuaireRecherche';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { libelleInterlocuteur, PAGE_HISTORIQUE, type Interlocuteur, type LigneHistorique } from '../../../../lib/gestion/historique';
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
  grouperParCategorie, grouperParConversation, libelleOrdreFil, messagesDuFil, motAucunResultat,
  motDeuxCompteurs, motLocataireDeLaPeriode, ordreFilSuivant, periodeDeLEvenement, periodeDeLOccupation,
  reglagesActifs, REGLAGES_DEFAUT, reglagesEnParametres, replierLesCartes, trierFil,
  type CategoriePartie, type CleGroupeParties, type OccupationPeriode, type Reglages,
} from '../../../../lib/gestion/historiqueBien';
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

export function HistoriqueDuBien({
  lotCle, maintenant, occupations, categories, onOuvrirFil,
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
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_DEFAUT);
  const [page, setPage] = useState(0);
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
  const [resumeHaut, setResumeHaut] = useState(false);

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
  const parametres = reglagesEnParametres(reglages, page, PAGE_HISTORIQUE);
  const parametresSansPage = reglagesEnParametres({ ...reglages }, 0, PAGE_HISTORIQUE);
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
  const [cartesContact, setCartesContact] = useState<{ cote: string; verifie: boolean }[]>([]);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/gestion/historique/parties?cible=lot-${encodeURIComponent(lotCle)}`,
          { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string;
          data?: {
            parties?: { adresse: string; categorie: string | null }[];
            cartes?: { cote: string; verifie: boolean }[];
          };
        };
        if (!vivant) return;
        const m = new Map<string, CategoriePartie>();
        for (const x of d.data?.parties ?? []) {
          /* ⚠️ « à répartir » N'EST PAS UN GROUPE DE PARTIE : c'est l'absence de rangement, et le module pur
             l'exprime en ne connaissant pas l'adresse. On ne la pose donc pas dans la carte. */
          if (x.categorie === 'proprietaire' || x.categorie === 'locataire' || x.categorie === 'independant') {
            m.set(x.adresse.trim().toLowerCase(), x.categorie);
          }
        }
        setCategoriesRangees(m);
        setCartesContact(d.data?.cartes ?? []);
      } catch {
        if (!vivant) return;
        setCategoriesRangees(new Map());
        setCartesContact([]);
      }
    })();
    return () => { vivant = false; };
  }, [lotCle]);

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
  const lignes = useMemo(
    () => (etat.v === 'ok' ? trierFil(etat.lignes, reglages.ordre) : []),
    [etat, reglages.ordre]);

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

  const groupes = useMemo(
    () => grouperParCategorie(interlocuteurs, categoriesFusionnees),
    [interlocuteurs, categoriesFusionnees]);

  const evenementOuvert = evenements.find((e) => e.ouvert) ?? null;

  /** Cocher ou décocher une personne. Les cases restent montées : le focus ne quitte pas celle qu'on vient de cliquer. */
  const basculerPartie = (adresse: string): void => setReglages((r) => {
    const a = adresse.trim().toLowerCase();
    const dedans = r.parties.includes(a);
    return { ...r, parties: dedans ? r.parties.filter((x) => x !== a) : [...r.parties, a] };
  });

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
        {/* ── PÉRIODE ─────────────────────────────────────────────────────────────────────────────────────────── */}
        <fieldset className="hdb-pave">
          <legend className="hdb-legende">Période</legend>
          <div className="hdb-boutons">
            <button type="button" className={`hdb-choix${reglages.periode.sorte === 'tous' ? ' hdb-choix--actif' : ''}`}
              aria-pressed={reglages.periode.sorte === 'tous'}
              onClick={() => setReglages((r) => ({ ...r, periode: { sorte: 'tous' } }))}>
              Tous les échanges
            </button>
            <button type="button" className={`hdb-choix${reglages.periode.sorte === 'dates' ? ' hdb-choix--actif' : ''}`}
              aria-pressed={reglages.periode.sorte === 'dates'}
              onClick={() => setReglages((r) => ({
                ...r,
                periode: {
                  sorte: 'dates',
                  du: r.periode.sorte === 'tous' ? null : r.periode.du,
                  au: r.periode.sorte === 'tous' ? null : r.periode.au,
                },
              }))}>
              Entre deux dates
            </button>
          </div>

          {/* ⚠️ LES DEUX DATES SONT TOUJOURS MODIFIABLES, même après le choix d'un événement : c'est la demande
              d'Arno — l'événement PROPOSE une période, il ne l'impose pas. */}
          {reglages.periode.sorte !== 'tous' && (
            <div className="hdb-dates">
              <label className="hdb-date">
                <span className="svv-label">Du</span>
                <input type="date" className="ann-champ hdb-champ-date"
                  value={reglages.periode.du ?? ''}
                  onChange={(e) => setReglages((r) => (r.periode.sorte === 'tous' ? r : {
                    ...r, periode: { ...r.periode, du: e.target.value === '' ? null : e.target.value },
                  }))} />
              </label>
              <label className="hdb-date">
                <span className="svv-label">Au</span>
                <input type="date" className="ann-champ hdb-champ-date"
                  value={reglages.periode.au ?? ''}
                  onChange={(e) => setReglages((r) => (r.periode.sorte === 'tous' ? r : {
                    ...r, periode: { ...r.periode, au: e.target.value === '' ? null : e.target.value },
                  }))} />
              </label>
            </div>
          )}

          {/* ── UN ÉVÉNEMENT, EN COURS OU CLOS — LE CHOISIR RÈGLE LES DATES ──────────────────────────────────── */}
          {evenements.length > 0 && (
            <div className="hdb-evts" role="group" aria-label="Choisir un événement comme période">
              {evenements.map((e) => {
                const actif = reglages.periode.sorte === 'evenement' && reglages.periode.evenementId === e.id;
                return (
                  <button key={e.id} type="button" aria-pressed={actif}
                    className={`hdb-choix hdb-choix--evt${actif ? ' hdb-choix--actif' : ''}`}
                    onClick={() => setReglages((r) => {
                      const p = periodeDeLEvenement(e, maintenant);
                      return { ...r, periode: { sorte: 'evenement', evenementId: e.id, du: p.du, au: p.au } };
                    })}>
                    <span className="hdb-evt-ref">{e.reference}</span>
                    <span className="hdb-evt-objet">{nettoyerObjet(e.objet) || '(sans objet)'}</span>
                    {/* LE MOT DIT L'ÉTAT, pas seulement la couleur : « en cours » / « clos », en toutes lettres. */}
                    <span className="hdb-evt-etat">{e.ouvert ? 'en cours' : 'clos'} · {e.nbMails} mail{e.nbMails > 1 ? 's' : ''}</span>
                  </button>
                );
              })}
            </div>
          )}
          {evenementsIllisibles && (
            <p className="gst-note hdb-note" role="status">
              Les événements de ce bien n’ont pas pu être lus — les deux dates restent utilisables.
            </p>
          )}

          {/* ── LES LOCATAIRES, CHACUN AVEC SA PÉRIODE (anciens COMPRIS) ────────────────────────────────────── */}
          {occupations.length > 0 && (
            <div className="hdb-occs" role="group" aria-label="Choisir la période d’un locataire">
              {occupations.map((o) => {
                const p = periodeDeLOccupation(o);
                const actif = reglages.periode.sorte !== 'tous'
                  && reglages.periode.du === p.du && reglages.periode.au === p.au
                  && (p.du !== null || p.au !== null);
                return (
                  <button key={`${o.libelle}|${o.depuis ?? ''}|${o.jusqua ?? ''}`} type="button" aria-pressed={actif}
                    className={`hdb-choix hdb-choix--occ${actif ? ' hdb-choix--actif' : ''}`}
                    onClick={() => setReglages((r) => ({ ...r, periode: { sorte: 'dates', du: p.du, au: p.au } }))}>
                    <span className="hdb-occ-nom">{o.libelle}</span>
                    {/* ⚠️ LA PÉRIODE EST ÉCRITE PAR `periodeOccupation`, la fonction que les trois fiches emploient
                        déjà : « du … au … », « depuis le … », ou « dates inconnues » — jamais une date devinée. */}
                    <span className="hdb-occ-periode">{periodeOccupation(o.depuis, o.jusqua)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        {/* ── PARTIES ─────────────────────────────────────────────────────────────────────────────────────────── */}
        <fieldset className="hdb-pave">
          <legend className="hdb-legende">Parties</legend>

          {/* 🔴 « TOUS LES MAILS DU BIEN PENDANT LA PÉRIODE » IGNORE LE CHOIX DES PARTIES, SANS L'EFFACER : on le
              relève et l'on retrouve ses cases telles qu'on les avait laissées (demande d'Arno). */}
          <label className="hdb-case hdb-case--large">
            <input type="checkbox" checked={reglages.toutesLesParties}
              onChange={(e) => setReglages((r) => ({ ...r, toutesLesParties: e.target.checked }))} />
            <span>Tous les mails du bien pendant la période</span>
          </label>
          {reglages.toutesLesParties && reglages.parties.length > 0 && (
            <p className="gst-note hdb-note">
              {reglages.parties.length === 1
                ? '1 personne reste cochée : elle sera reprise dès que cet interrupteur se relève.'
                : `${reglages.parties.length} personnes restent cochées : elles seront reprises dès que cet interrupteur se relève.`}
            </p>
          )}

          {/* ══ 🔴 LES CARTES DE CONTACT DE CE BIEN, DITES ICI ET SEULEMENT ICI ═══════════════════════════════
              La reprise a pré-rempli des cartes de contact (485 sur toute la base). Elles sont destinées aux
              carrousels de la fiche, et ce bloc ne les y met pas : il se CONTENTE de dire combien ce bien en a
              et combien restent à vérifier. Un compte affiché vaut mieux qu'un travail invisible.

              ⚠️ RIEN N'EST ÉCRIT NI DÉPLACÉ PAR CETTE LIGNE : elle lit, elle compte, elle le dit. */}
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

          {groupes.map((g) => {
            /* ⚠️ UN GROUPE VIDE N'EST PAS PEINT, MAIS IL EXISTE : `grouperParCategorie` rend toujours les quatre,
               dans le même ordre, pour que les cases ne se déplacent pas d'un bien à l'autre. */
            if (g.nb === 0) return null;
            const adresses = g.interlocuteurs.map((i) => i.adresse);
            /* ⚠️ `length > 0` AVANT `every` : `[].every(…)` vaut VRAI, et le bouton aurait annoncé « Décocher le
               groupe » sur un groupe vide (piège consigné au lot 71 — l'ensemble vide n'est pas satisfait). */
            const toutCoche = adresses.length > 0
              && adresses.every((a) => reglages.parties.includes(a.trim().toLowerCase()));
            /* LE DÉFAUT DÉPEND DU SEUIL ; LA BASCULE L'INVERSE. Voir l'encadré de `bascules`.
               🔴 LA COMPARAISON ELLE-MÊME VIENT DE `partieCategorie.ts` (`replierLesCartes`) : écrire `> 6` ici
                  aurait été un second juge pour la même borne, et c'est sur les bornes qu'on se trompe. */
            const ouvertParDefaut = !replierLesCartes(g.nb);
            const ouvert = bascules.has(g.cle) ? !ouvertParDefaut : ouvertParDefaut;
            return (
              <div key={g.cle} className="hdb-groupe">
                <div className="hdb-groupe-tete">
                  <button type="button" className="hdb-replier" aria-expanded={ouvert}
                    onClick={() => setBascules((s) => {
                      const n = new Set(s);
                      if (n.has(g.cle)) n.delete(g.cle); else n.add(g.cle);
                      return n;
                    })}>
                    <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
                    {g.titre}
                    {/* LE COMPTE EST LISIBLE SANS DÉPLIER — c'est tout l'intérêt du repli. */}
                    <span className="gst-compte">{g.nb}</span>
                  </button>
                  <button type="button" className="hdb-tout" aria-pressed={toutCoche}
                    onClick={() => basculerGroupe(adresses)}>
                    {toutCoche ? 'Décocher le groupe' : 'Tout le groupe'}
                  </button>
                </div>
                {ouvert && (
                  <ul className="hdb-personnes">
                    {g.interlocuteurs.map((i) => (
                      <li key={i.adresse}>
                        <label className="hdb-case">
                          <input type="checkbox"
                            checked={reglages.parties.includes(i.adresse.trim().toLowerCase())}
                            onChange={() => basculerPartie(i.adresse)} />
                          <span className="hdb-personne">
                            <span className="hdb-personne-nom">
                              {libelleInterlocuteur(i)}
                              {i.interne && <span className="hdb-interne">nous</span>}
                            </span>
                            {/* 🔴 LES DEUX COMPTEURS, ÉCRITS PAR LE MODULE PUR. Jamais dans une infobulle seule :
                                une information portée par un survol n'existe pas sur un téléphone. */}
                            <span className="hdb-compteurs">{motDeuxCompteurs(i)}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {etat.v === 'ok' && etat.tronques && (
            <p className="gst-note hdb-note" role="status">
              Ce bien compte plus de personnes que la liste n’en montre : les moins présentes ne sont pas listées.
            </p>
          )}
          {etat.v === 'ok' && interlocuteurs.length === 0 && (
            <p className="ann-gris">Aucune personne à lister pour ces réglages.</p>
          )}
        </fieldset>

        {/* ── OPTIONS ─────────────────────────────────────────────────────────────────────────────────────────── */}
        <fieldset className="hdb-pave">
          <legend className="hdb-legende">Options</legend>
          <div className="hdb-boutons" role="group" aria-label="Pièces jointes">
            {([['toutes', 'Toutes'], ['avec', 'Avec pièces jointes'], ['sans', 'Sans pièce jointe']] as const)
              .map(([cle, mot]) => (
                <button key={cle} type="button" aria-pressed={reglages.pieces === cle}
                  className={`hdb-choix${reglages.pieces === cle ? ' hdb-choix--actif' : ''}`}
                  onClick={() => setReglages((r) => ({ ...r, pieces: cle }))}>{mot}</button>
              ))}
          </div>
          <div className="hdb-boutons">
            {/* 🔴 LE BOUTON DIT L'ORDRE EN COURS, pas celui qu'il donnerait — même convention que partout ailleurs
                dans le module. Le plus récent en haut est le défaut. */}
            <button type="button" className="hdb-choix" aria-pressed={reglages.ordre === 'recent'}
              onClick={() => setReglages((r) => ({ ...r, ordre: ordreFilSuivant(r.ordre) }))}
              title="Inverser l’ordre du fil">
              {libelleOrdreFil(reglages.ordre)} ⇅
            </button>
          </div>
          <label className="hdb-case">
            <input type="checkbox" checked={reglages.grouper}
              onChange={(e) => setReglages((r) => ({ ...r, grouper: e.target.checked }))} />
            <span>Regrouper par conversation</span>
          </label>
        </fieldset>
      </div>

      {/* ══ LE RÉSUMÉ DES PIÈCES, EN HAUT — REPLIÉ, AVEC SON COMPTE LISIBLE SANS CLIC ══════════════════════════ */}
      {totalPieces > 0 && (
        <div className="hdb-resume hdb-resume--haut">
          <button type="button" className="pdc-trombone" aria-expanded={resumeHaut}
            onClick={() => setResumeHaut((v) => !v)}>
            <span aria-hidden="true">📎</span> {motPieces(totalPieces)}
            <span className="hdb-resume-mot">{resumeHaut ? ' — replier' : ' — voir les pièces'}</span>
          </button>
          {resumeHaut && (
            <ResumePieces groupes={groupesPieces} depots={depots} emplacements={emplacements}
              maintenant={maintenant} gestes={gestes} sansEmpreinte={recap.sansEmpreinte} />
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
                  onClick={() => { setReglages(REGLAGES_DEFAUT); setBascules(new Set()); }}>
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
                      onBasculer={basculerMail} onOuvrirFil={onOuvrirFil} />
                  </section>
                ))
                : (
                  <FilDeMails lignes={lignes} maintenant={maintenant} deplie={deplie}
                    onBasculer={basculerMail} onOuvrirFil={onOuvrirFil} />
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
                    onClick={() => { setReglages(REGLAGES_DEFAUT); setBascules(new Set()); }}>
                    Tout remettre à plat
                  </button>
                )}
              </div>

              {/* ══ LE RÉSUMÉ DES PIÈCES, EN BAS — OUVERT (demande d'Arno) ═══════════════════════════════════ */}
              {totalPieces > 0 && (
                <div className="hdb-resume hdb-resume--bas">
                  <h5 className="hdb-resume-titre">
                    <span aria-hidden="true">📎</span> Pièces jointes des mails affichés
                    <span className="gst-compte">{totalPieces}</span>
                  </h5>
                  <ResumePieces groupes={groupesPieces} depots={depots} emplacements={emplacements}
                    maintenant={maintenant} gestes={gestes} sansEmpreinte={recap.sansEmpreinte} />
                </div>
              )}
            </>
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
function FilDeMails({ lignes, maintenant, deplie, onBasculer, onOuvrirFil }: {
  lignes: readonly LigneHistorique[];
  maintenant: Date;
  deplie: ReadonlySet<number>;
  onBasculer: (messageId: number) => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
}) {
  return (
    <ol className="vdb-liste hdb-liste">
      {lignes.map((l) => (
        <li key={l.messageId} id={`hdb-mail-${l.messageId}`} className="hdb-ancre">
          <ol className="vdb-liste">
            <LigneVie l={l} maintenant={maintenant} ouvert={deplie.has(l.messageId)}
              onBasculer={() => onBasculer(l.messageId)} onOuvrirFil={onOuvrirFil} />
          </ol>
        </li>
      ))}
    </ol>
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
  groupes, depots, emplacements, maintenant, gestes, sansEmpreinte,
}: {
  groupes: readonly GroupeDePieces<PieceDedoublonnee>[];
  depots: ReadonlyMap<number, DepotAffiche>;
  emplacements: ReadonlyMap<number, readonly EmplacementPiece[]>;
  maintenant: Date;
  gestes: GestesPiece;
  sansEmpreinte: number;
}) {
  return (
    <div className="hdb-pieces">
      {groupes.map((g) => (
        <section key={g.messageId} className="pdc-groupe">
          <h6 className="pdc-groupe-titre">
            <span className="pdc-groupe-date">{dateHeureCourte(g.recuLe, maintenant)}</span>
            <span className="pdc-groupe-qui" title={dateHeureComplete(g.recuLe)}> · {mentionExpediteurPiece(g)}</span>
            {(g.objet ?? '').trim() !== '' && (
              <span className="pdc-groupe-objet"> · {nettoyerObjet(g.objet ?? '')}</span>
            )}
          </h6>
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

/* ── LE TABLEAU DE BORD ── auto-fit : trois paves cote a cote sur un ecran large, UN seul a 390 px. */
.hdb-bord{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-bottom:.7rem}
.hdb-pave{min-width:0;margin:0;padding:.5rem .6rem .6rem;border:1px solid var(--color-svv-line);
  border-radius:.6rem;background:var(--color-svv-surface)}
.hdb-legende{padding:0 .3rem;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.hdb-boutons{display:flex;flex-wrap:wrap;gap:.35rem;min-width:0}
/* 44 px de cible sur TOUT ce qui se clique : sur un telephone, 36 px se rate une fois sur trois. */
.hdb-choix{display:inline-flex;flex-direction:column;align-items:flex-start;gap:.1rem;min-height:44px;
  padding:.35rem .7rem;border-radius:.5rem;border:1px solid var(--color-svv-line-strong);font:inherit;
  font-size:.8rem;text-align:left;color:var(--color-svv-muted);background:var(--color-svv-surface);cursor:pointer;
  min-width:0;max-width:100%}
.hdb-choix:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
.hdb-choix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'ETAT ACTIF se dit par son ASPECT *et* par aria-pressed : une couleur seule ne dit rien a qui ne la voit pas. */
.hdb-choix--actif{background:var(--color-svv-ink);border-color:var(--color-svv-ink);color:var(--color-svv-surface);
  font-weight:700}
.hdb-choix--evt,.hdb-choix--occ{flex:1 1 15rem}
.hdb-evt-ref{font-weight:700;font-size:.78rem}
.hdb-evt-objet,.hdb-occ-nom{font-size:.78rem;overflow-wrap:anywhere}
.hdb-occ-nom{font-weight:700}
.hdb-evt-etat,.hdb-occ-periode{font-size:.72rem;opacity:.85}
.hdb-dates{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.4rem}
.hdb-date{display:flex;flex-direction:column;gap:.15rem;min-width:0;flex:1 1 9rem}
.hdb-champ-date{min-height:44px;font-size:.82rem;min-width:0;width:100%}
.hdb-evts,.hdb-occs{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.4rem;min-width:0}
.hdb-note{margin:.3rem 0 0}

/* ── LES PARTIES ── */
.hdb-groupe{margin-top:.45rem;min-width:0}
.hdb-groupe-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;min-width:0}
.hdb-replier{display:inline-flex;align-items:center;gap:.35rem;min-height:44px;padding:0 .4rem;flex:1 1 8rem;
  border:0;background:none;font:inherit;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);
  cursor:pointer;text-align:left;min-width:0}
.hdb-replier:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdb-triangle{display:inline-block;font-size:.7rem;color:var(--color-svv-red);transition:transform .15s ease}
.hdb-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.hdb-triangle{transition:none}}
.hdb-tout{min-height:44px;padding:0 .6rem;border-radius:.5rem;border:1px solid var(--color-svv-line);
  background:transparent;font:inherit;font-size:.74rem;color:var(--color-svv-muted);cursor:pointer}
.hdb-tout:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.hdb-tout:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.hdb-personnes{list-style:none;margin:.2rem 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.hdb-case{display:flex;align-items:center;gap:.45rem;min-height:44px;padding:.1rem .3rem;font-size:.8rem;
  color:var(--color-svv-ink);cursor:pointer;min-width:0;border-radius:.4rem}
.hdb-case:hover{background:var(--color-svv-field)}
.hdb-case input{width:18px;height:18px;flex:0 0 auto;accent-color:var(--color-svv-red)}
.hdb-case--large{font-weight:700}
.hdb-personne{display:flex;flex-direction:column;gap:0;min-width:0}
.hdb-personne-nom{display:flex;align-items:center;gap:.3rem;font-size:.8rem;overflow-wrap:anywhere;min-width:0}
.hdb-interne{font-size:.64rem;font-weight:700;border-radius:999px;padding:0 .35rem;flex:0 0 auto;
  background:var(--color-svv-field);color:var(--color-svv-muted);border:1px solid var(--color-svv-line)}
/* LES DEUX COMPTEURS SONT ECRITS, jamais dans une infobulle : un survol n'existe pas sur un telephone. */
.hdb-compteurs{font-size:.7rem;color:var(--color-svv-muted)}

/* ── LE RESUME DES PIECES ── */
.hdb-resume{margin:.5rem 0;min-width:0}
.hdb-resume-mot{font-size:.76rem;color:var(--color-svv-muted)}
.hdb-resume-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.2rem 0 .4rem;
  font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.hdb-pieces{display:flex;flex-direction:column;gap:12px;min-width:0}

/* ── LE FIL ── La liste exterieure ne porte que l'ancre de « Aller au message » : aucun style propre. */
.hdb-liste{list-style:none;margin:0;padding:0}
.hdb-ancre{min-width:0;scroll-margin-top:12px}
/* ── REGROUPER PAR CONVERSATION ── L'objet de l'echange au-dessus de ses mails, comme un intertitre. */
.hdb-conv{margin:0 0 10px;min-width:0}
.hdb-conv-titre{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:0 0 .3rem;font-size:.8rem;
  font-weight:700;color:var(--color-svv-ink);padding-bottom:.2rem;
  border-bottom:1px solid var(--color-svv-line);overflow-wrap:anywhere}
.hdb-vide{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;min-width:0}
`;
