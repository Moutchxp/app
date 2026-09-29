'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
// LOT DRIVE-DOSSIER-DU-BIEN — le dossier du propriétaire du bien rattaché, proposé en première position.
import {
  dossiersPrioritaires, mentionNbBiens, titreDossierPrioritaire, type BienDuMail, type DossierPrioritaire,
} from '../../../../lib/gestion/dossierDuBien';
// LOT DRIVE-VISUALISER-ET-DOSSIERS — voir un fichier sans le joindre, et créer un dossier là où l'on est.
import { ApercuFichierDrive, adresseApercu, type FichierAVoir } from './ApercuFichierDrive';
import { sorteApercu } from '../../../../lib/gestion/apercuDrive';
import { NOM_DOSSIER_MAX } from '../../../../lib/gestion/dossierNouveau';
// 🔴 LOT DRIVE-FACON-FINDER — toutes les RÈGLES du navigateur (tri, icônes, historique, sélection, menu) : module PUR.
// 🔴 LOT DRIVE-DEPLACER — la règle du déplacement, la presse-papiers et les fichiers « ._ ». Module PUR.
import {
  DUREE_ANNULATION_MS, estCoupe, estFichierSystemeMac, infobulleFichierSysteme, motColler, motMouvementFait,
  MOT_FICHIER_SYSTEME, type Presse,
} from '../../../../lib/gestion/driveDeplacement';
import {
  ariane as arianeDuChemin, aplatir, avancer, cheminCourant, cliquerLigne, COLONNES, dateFinder,
  dossierDuChemin, fenetreVisible, flecheTri, HAUTEUR_LIGNE, HISTORIQUE_DEPART,
  iconeEntree, menuDossier, menuFichier, motType, naviguerVers, peutAvancer, peutReculer, reculer,
  SELECTION_VIDE, selectionSuivante, tailleFinder, titreDuChemin, TRI_DEFAUT,
  type ActionMenu, type Chemin, type Colonne, type DroitsPresse, type EntreeDrive, type EntreeMenu,
  type Historique, type Selection, type Tri,
} from '../../../../lib/gestion/finderDrive';

/**
 * LOT DRIVE-FACON-FINDER — LE NAVIGATEUR DRIVE, EN PRÉSENTATION LISTE, COMME DANS LE FINDER.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 LA DEMANDE D'ARNO, DANS SES MOTS : « la fenêtre n'a pas de croix pour la fermer, il faut l'ajouter. La
 * navigation dans notre Drive custom est beaucoup trop différente, en esthétique et en fonctionnalités, de celle du
 * Drive Google. Il faut dupliquer son esthétique et ses fonctions principales pour que l'internaute ne soit pas
 * déstabilisé en passant d'un environnement à l'autre, et privilégier la réactivité maximale au clic. »
 *
 * CE QUI A CHANGÉ : une barre de titre avec sa croix, une barre d'outils (flèches ‹ ›, titre, fil d'Ariane, loupe,
 * « ⋯ »), une barre latérale, et une LISTE à quatre colonnes triables, avec icônes par type, triangle de dépliage,
 * double-clic, barre d'espace, flèches, sélection multiple et menu contextuel.
 *
 * ⚠️ RIEN N'A ÉTÉ RETIRÉ. Recherche (dossiers puis fichiers), Récents, dossier du bien, multi-ajout sans fermeture,
 * compteur, « ✓ ajouté », Visualiser avec ses Précédent/Suivant, « Nouveau dossier » avec sa confirmation et ses
 * interdits, envoi en arrière-plan : tout est là, aux mêmes routes, avec les mêmes refus.
 *
 * ═══ 🔴🔴 DEUX GESTES, DEUX RÉGIMES, ET LA DIFFÉRENCE N'EST PAS UNE NUANCE ═══════════════════════════════════════
 *   · « Insérer un lien » ne lit RIEN : il pose l'adresse Drive et le nom dans le message. Le destinataire devra
 *     s'authentifier chez Google, qui appliquera SES droits. → proposé PARTOUT ;
 *   · « Joindre » et « Visualiser » lisent le CONTENU. → JAMAIS sous « Documents clients scannés », par aucune
 *     voie : ni la ligne, ni le double-clic, ni la barre d'espace, ni le menu contextuel, ni la sélection multiple.
 *
 * ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. C'est la route qui refuse, en remontant la chaîne des parents — un écran se
 * modifie, une route non. Ici, on explique ; là-bas, on protège.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE : il demande à l'application, qui relit le droit et interroge le Drive
 * avec un jeton qui ne quitte pas le serveur.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Ce que ce navigateur manipule est exactement ce que le module pur sait trier et décrire. */
type Fichier = EntreeDrive;

/* ══ 🔴 LOT DRIVE-DEPLACER — LES TROIS CONSTANTES DU GLISSER ═══════════════════════════════════════════════════ */

/**
 * 🔴 UN TYPE MIME À NOUS, ET RIEN D'AUTRE. Le glisser ne dépose JAMAIS `text/plain` ni `text/uri-list` : un nom de
 * fichier du cabinet lâché dans n'importe quel champ de n'importe quelle page serait une fuite silencieuse. Un
 * type inconnu du reste du monde ne se lit que chez nous.
 */
const MIME_INTERNE = 'application/x-svv-drive';

/**
 * ⚠️ LE « RESSORT » DU FINDER : un dossier survolé assez longtemps pendant un glisser s'ouvre tout seul. 700 ms
 * est le compromis d'Apple — assez court pour descendre trois niveaux sans lâcher, assez long pour traverser un
 * dossier sans l'ouvrir par accident.
 */
const RESSORT_MS = 700;

/** La taille de la fenêtre, retenue d'une ouverture à l'autre. PRÉFÉRENCE LOCALE : elle ne quitte pas ce navigateur. */
const CLE_TAILLE_FENETRE = 'svv.gestion.selecteurDrive.taille';

/** Le minimum dont la route a besoin : elle relit tout chez Google de toute façon. */
function fichierMinimal(o: { id: string; nom?: string; dossier?: boolean }): Fichier {
  return {
    id: o.id, nom: o.nom ?? '', typeMime: '', tailleOctets: null, modifieLe: null, lien: null,
    dossier: o.dossier === true,
  };
}

/** Une liste chargée, avec ce que la route dit des droits à cet endroit. */
interface Listing {
  fichiers: Fichier[];
  dossiers: Fichier[];
  joindreAutorise: boolean;
  motifRefus: string | null;
  creerAutorise: boolean;
  motifCreation: string | null;
  recherche: boolean;
  /**
   * 🔴 LA LISTE EST-ELLE INCOMPLÈTE ? Un dossier de plus de mille entrées atteint la borne de lecture. On le DIT :
   * jusqu'à ce lot, un dossier de plus de 200 entrées était tronqué en SILENCE, et l'on croyait avoir tout vu.
   */
  tronque: boolean;
}

type Vue =
  | { v: 'charge' }
  | ({ v: 'ok' } & Listing)
  | { v: 'indisponible'; message: string };

/**
 * ══ 🔴 L'ÉTAT DE « NOUVEAU DOSSIER » — quatre temps, et le troisième est celui qui protège. ════════════════════════
 * `ferme` → `saisie` → `confirme` (le SERVEUR a rendu le chemin complet) → création. Le chemin de la confirmation
 * vient du serveur, jamais du fil d'Ariane affiché : le recomposer ici le ferait dire par la partie qu'on vérifie.
 */
type Creation =
  | { c: 'ferme' }
  | { c: 'saisie'; nom: string; occupe: boolean; erreur: string | null }
  | { c: 'confirme'; nom: string; chemin: string; phrase: string; occupe: boolean; erreur: string | null };

/** Une entrée de l'historique « Récents », telle que la route la rend. */
interface Recent {
  sorte: 'drive_fichier' | 'drive_dossier' | 'locale';
  cle: string;
  libelle: string;
  detail: string | null;
  tailleOctets: number | null;
}

export interface ChoixFichierDrive {
  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — ON NE TRANSPORTE PLUS LES OCTETS ═══════════════════════════════════════════
   * On ne passe que l'IDENTIFIANT. Le serveur lit les métadonnées (un appel court), inscrit la pièce, et tire les
   * octets en tâche de fond. Le « Joindre » suivant est cliquable immédiatement.
   */
  drive?: { fichierId: string; nom: string; dossierId: string | null; dossierNom: string | null };
  /** Le lien inséré : rien n'a été lu du contenu. */
  lien?: { nom: string; url: string };
}

/** Ce que le menu contextuel vise. */
type CibleMenu = { x: number; y: number; entree: Fichier };

export function SelecteurFichierDrive({ onChoisir, onFermer, filId = null, lots = [] }: {
  /** Ajoute la pièce au brouillon. ⚠️ NE FERME PAS la fenêtre : c'est « Terminé » ou la croix qui ferme. */
  onChoisir: (c: ChoixFichierDrive) => void | Promise<void>;
  onFermer: () => void;
  /**
   * 🔴 LOT DRIVE-DOSSIER-DU-BIEN — de quoi savoir à quel(s) bien(s) ce mail est relié.
   * Les deux absents ⇒ aucune entrée « Dossier du bien », et le navigateur est le même pour tout le reste.
   */
  filId?: number | null;
  lots?: readonly string[];
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [histo, setHisto] = useState<Historique>(HISTORIQUE_DEPART);
  const [tri, setTri] = useState<Tri>(TRI_DEFAUT);
  const [selection, setSelection] = useState<Selection>(SELECTION_VIDE);
  const [erreur, setErreur] = useState<string | null>(null);
  /** 🔴 LES FICHIERS DÉJÀ AJOUTÉS pendant cette ouverture : par identifiant Drive, donc sans doublon possible. */
  const [ajoutes, setAjoutes] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');
  const [loupeOuverte, setLoupeOuverte] = useState(false);
  const [recents, setRecents] = useState<{ lignes: Recent[]; disponible: boolean } | null>(null);
  const [montrerRecents, setMontrerRecents] = useState(false);
  const [rechercheOuverte, setRechercheOuverte] = useState<string | null>(null);
  const [prioritaires, setPrioritaires] = useState<DossierPrioritaire[]>([]);
  const [aVoir, setAVoir] = useState<FichierAVoir | null>(null);
  const [creation, setCreation] = useState<Creation>({ c: 'ferme' });
  const [motDeLaCreation, setMotDeLaCreation] = useState<string | null>(null);
  const [menu, setMenu] = useState<CibleMenu | null>(null);
  const [outils, setOutils] = useState(false);
  /** 🔴 LE DÉPLIAGE SUR PLACE : les dossiers ouverts, et leurs enfants déjà lus. */
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [enfants, setEnfants] = useState<Map<string, Fichier[]>>(new Map());
  /* ══ 🔴🔴 LOT DRIVE-DEPLACER ═══════════════════════════════════════════════════════════════════════════════
     Décision d'Arno : l'application peut désormais DÉPLACER et COPIER dans le Drive. Elle ne supprime, ne renomme,
     ne met à la corbeille et ne partage toujours RIEN. */
  /** La presse-papiers, INTERNE à l'application : elle ne touche jamais au presse-papiers du système. */
  const [presse, setPresse] = useState<Presse | null>(null);
  /** Ce qui est en train d'être glissé. `null` = aucun glisser en cours. */
  const [glisse, setGlisse] = useState<{ ids: string[]; nom: string } | null>(null);
  /** Le dossier survolé pendant un glisser — celui qui s'allume. */
  const [survole, setSurvole] = useState<string | null>(null);
  /** Le bandeau « N élément(s) déplacé(s) vers X — Annuler ». `null` = rien à annoncer. */
  const [bandeau, setBandeau] = useState<{ mot: string; mouvements: number[] } | null>(null);
  /** La confirmation d'une copie de dossier, et ce qu'elle annonce. */
  const [confirmation, setConfirmation] = useState<{ phrase: string; agir: () => void } | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  const scene = useRef<HTMLDivElement | null>(null);
  /** La fenêtre elle-même : on lui rend la taille qu'elle avait la dernière fois. */
  const cadre = useRef<HTMLDivElement | null>(null);
  /** Le minuteur qui ouvre un dossier après un survol prolongé pendant le glisser (le « spring-loading » du Finder). */
  const ressort = useRef<{ id: string; minuteur: ReturnType<typeof setTimeout> } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [hauteurVue, setHauteurVue] = useState(600);

  /** ⚠️ `lots` est un tableau LITTÉRAL côté appelant : le suivre relancerait la lecture à chaque rendu.
   *  Sa clé, elle, ne change qu'avec son contenu — et elle se vérifie statiquement. */
  const clesLots = lots.join(',');
  const chemin = cheminCourant(histo);
  const dossierCourant = chemin.at(-1) ?? null;

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 RÉACTIVITÉ — LE CACHE DES LISTINGS, ET L'ANNULATION
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     Demande d'Arno : « retour visuel immédiat (moins de 100 ms) à chaque clic », « cache des listings déjà vus
     (retour arrière instantané) », « requêtes annulées quand on change de dossier ».

     🔴 UN DOSSIER DÉJÀ VU S'AFFICHE SANS ATTENDRE, puis se rafraîchit en silence. Montrer d'abord ce qu'on sait
     est ce qui distingue « instantané » de « rapide » : le Drive du cabinet met 300 ms à 1,5 s à répondre, et ces
     300 ms suffisent à donner l'impression d'un écran qui rame.

     ⚠️ LE RAFRAÎCHISSEMENT SILENCIEUX N'EFFACE JAMAIS L'ÉCRAN : il remplace la liste quand la réponse arrive, et
     seulement si l'on est toujours au même endroit. Sinon, changer vite de dossier ferait revenir le contenu du
     précédent par-dessus le nouveau.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
  const cache = useRef<Map<string, Listing>>(new Map());
  const enVol = useRef<AbortController | null>(null);
  /** L'endroit qu'on est en train de charger : une réponse qui n'est plus la sienne est jetée. */
  const attendu = useRef<string>('');

  const lireListing = useCallback(async (
    dossierId: string, signal: AbortSignal,
  ): Promise<Listing | { erreur: string }> => {
    const res = await fetch(`/api/admin/gestion/drive/fichiers?dossier=${encodeURIComponent(dossierId)}`,
      { cache: 'no-store', signal });
    const d = (await res.json()) as {
      etat?: string; message?: string; fichiers?: Fichier[]; joindreAutorise?: boolean; motifRefus?: string | null;
      creerAutorise?: boolean; motifCreation?: string | null; tronque?: boolean;
    };
    if (d.etat !== 'ok') return { erreur: d.message ?? 'Drive indisponible.' };
    return {
      fichiers: d.fichiers ?? [], dossiers: [],
      joindreAutorise: d.joindreAutorise !== false,
      motifRefus: d.motifRefus ?? null,
      // ⚠️ `=== true` et non `!== false` : un serveur qui ne dirait rien ne doit pas laisser croire qu'on peut
      //   créer. Le défaut, pour une ÉCRITURE, est « non » — l'inverse de ce qu'on fait pour une lecture.
      creerAutorise: d.creerAutorise === true,
      motifCreation: d.motifCreation ?? null,
      recherche: false,
      tronque: d.tronque === true,
    };
  }, []);

  const charger = useCallback(async (dossierId: string) => {
    attendu.current = dossierId;
    enVol.current?.abort();
    const ctrl = new AbortController();
    enVol.current = ctrl;
    setErreur(null);
    setScrollTop(0);
    const connu = cache.current.get(dossierId);
    // ① CE QU'ON SAIT DÉJÀ, TOUT DE SUITE. ② Puis la vérité, en silence.
    if (connu !== undefined) setVue({ v: 'ok', ...connu });
    else setVue({ v: 'charge' });
    try {
      const r = await lireListing(dossierId, ctrl.signal);
      if (attendu.current !== dossierId) return;
      if ('erreur' in r) { if (connu === undefined) setVue({ v: 'indisponible', message: r.erreur }); return; }
      cache.current.set(dossierId, r);
      setVue({ v: 'ok', ...r });
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return;
      if (attendu.current === dossierId && connu === undefined) {
        setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
      }
    }
  }, [lireListing]);

  /**
   * 🔴 LE PRÉCHARGEMENT AU SURVOL D'UN DOSSIER. Approcher la souris paie la requête ; le clic ne trouve plus rien
   * à attendre. Borné par le cache lui-même : un dossier déjà connu n'est pas redemandé.
   */
  const precharger = useCallback((dossierId: string) => {
    if (dossierId === '' || cache.current.has(dossierId)) return;
    void (async () => {
      try {
        const r = await lireListing(dossierId, new AbortController().signal);
        if (!('erreur' in r)) cache.current.set(dossierId, r);
      } catch { /* un préchargement raté n'est pas une panne : le clic paiera, comme avant */ }
    })();
  }, [lireListing]);

  /**
   * ⚠️ LE PREMIER CHARGEMENT EST DIFFÉRÉ D'UN TOUR DE BOUCLE, et ce n'est pas une coquetterie : appeler `charger`
   * dans le corps de l'effet poserait un `setState` SYNCHRONE au montage, ce qui enchaîne deux rendus pour rien.
   * L'écran ne perd rien : son état de départ est déjà « en chargement », donc le squelette est peint tout de suite.
   */
  useEffect(() => {
    let annule = false;
    // ⚠️ UNE MICRO-TÂCHE, PAS UN MINUTEUR : elle part au tout prochain tour de boucle, donc sans aucun délai
    //   perceptible, là où un `setTimeout` aurait fait attendre un tour d'horloge complet.
    queueMicrotask(() => { if (!annule) void charger(''); });
    return () => { annule = true; };
  }, [charger]);

  /**
   * ══ 🔴 « RÉCENTS » ═══════════════════════════════════════════════════════════════════════════════════════════
   * Joindre une pièce, c'est presque toujours rejoindre la même, ou retourner dans le même dossier. La liste vit
   * dans NOTRE base (migration 269) : rien n'est écrit dans le Drive pour la tenir.
   * ⚠️ SANS LA MIGRATION, L'ENTRÉE N'EXISTE PAS — pas une liste vide, qui se lirait comme une panne.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/pieces-recentes?sorte=drive_fichier,drive_dossier',
          { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; lignes?: Recent[]; disponible?: boolean };
        if (annule) return;
        setRecents(d.etat === 'ok'
          ? { lignes: d.lignes ?? [], disponible: d.disponible !== false }
          : { lignes: [], disponible: false });
      } catch { if (!annule) setRecents({ lignes: [], disponible: false }); }
    })();
    return () => { annule = true; };
  }, []);

  /**
   * ══ 🔴 LE DOSSIER DU BIEN ════════════════════════════════════════════════════════════════════════════════════
   * 🔴 AUCUN APPEL AU DRIVE POUR CELA : la correspondance est déjà en base (le dossier du propriétaire, par clé
   * WIPPIMMO). Ouvrir le navigateur ne coûte donc pas une requête Google de plus.
   */
  useEffect(() => {
    if (filId === null && clesLots === '') return undefined;
    let annule = false;
    void (async () => {
      try {
        const p = new URLSearchParams();
        if (filId !== null) p.set('fil', String(filId));
        if (clesLots !== '') p.set('lots', clesLots);
        const res = await fetch(`/api/admin/gestion/drive/dossier-du-bien?${p}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; biens?: BienDuMail[]; dossiers?: DossierPrioritaire[] };
        if (annule || d.etat !== 'ok') return;
        const liste = d.dossiers ?? dossiersPrioritaires(d.biens ?? []);
        setPrioritaires(liste);
        // 🔴 PRÉCHARGÉ D'EMBLÉE (demande d'Arno) : c'est l'endroit où l'on va neuf fois sur dix.
        for (const x of liste) precharger(x.dossierId);
      } catch { /* un raccourci absent n'est pas une panne : le navigateur reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
  }, [filId, clesLots, precharger]);

  /**
   * LA RECHERCHE, TEMPORISÉE (250 ms). ⚠️ `annule` couvre les DEUX cas : fenêtre refermée, et réponse PÉRIMÉE —
   * une réponse lente à « ba » ne doit pas écraser les résultats de « bail 2024 ».
   */
  useEffect(() => {
    const terme = saisie.trim();
    if (terme.length < 2) return undefined;
    let annule = false;
    const minuteur = setTimeout(() => {
      void (async () => {
        setMontrerRecents(false);
        setVue({ v: 'charge' });
        try {
          const res = await fetch(`/api/admin/gestion/drive/fichiers?recherche=${encodeURIComponent(terme)}`,
            { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string; message?: string; fichiers?: Fichier[]; dossiers?: Fichier[]; joindreAutorise?: boolean;
          };
          if (annule) return;
          if (d.etat !== 'ok') { setVue({ v: 'indisponible', message: d.message ?? 'Drive indisponible.' }); return; }
          setVue({
            v: 'ok', fichiers: d.fichiers ?? [], dossiers: d.dossiers ?? [],
            joindreAutorise: d.joindreAutorise !== false,
            motifRefus: null, recherche: true,
            // 🔴 PAS DE CRÉATION DANS DES RÉSULTATS : quarante lignes venues de quarante dossiers ne sont pas un
            //   endroit. On entre dans un dossier trouvé, PUIS on y crée.
            creerAutorise: false, motifCreation: null,
            // La recherche a sa propre borne, annoncée par la route depuis le lot EDITEUR-PJ.
            tronque: false,
          });
        } catch { if (!annule) setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' }); }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LA NAVIGATION
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const oublierCreation = () => { setCreation({ c: 'ferme' }); setMotDeLaCreation(null); };

  const allerA = useCallback((c: Chemin) => {
    setSaisie('');
    setMontrerRecents(false);
    setSelection(SELECTION_VIDE);
    setOuverts(new Set());
    oublierCreation();
    setHisto((h) => naviguerVers(h, c));
    void charger(dossierDuChemin(c));
  }, [charger]);

  const entrer = (f: { id: string; nom: string }) => {
    allerA([...chemin, { id: f.id, nom: f.nom }]);
  };
  /** Ouvrir un dossier : depuis une recherche on repart de lui, sinon on descend d'un cran. */
  const ouvrirDossier = (f: Fichier) => {
    if (listing?.recherche === true) entrerDepuisRecherche(f); else entrer(f);
  };

  const remonter = (index: number) => { allerA(chemin.slice(0, index)); };

  /** Les flèches ‹ › : on rejoue l'endroit de l'historique, sans l'empiler à nouveau. */
  const pasArriere = () => {
    if (!peutReculer(histo)) return;
    const h = reculer(histo);
    setHisto(h);
    setSelection(SELECTION_VIDE); setOuverts(new Set()); setSaisie(''); oublierCreation();
    void charger(dossierDuChemin(cheminCourant(h)));
  };
  const pasAvant = () => {
    if (!peutAvancer(histo)) return;
    const h = avancer(histo);
    setHisto(h);
    setSelection(SELECTION_VIDE); setOuverts(new Set()); setSaisie(''); oublierCreation();
    void charger(dossierDuChemin(cheminCourant(h)));
  };

  /**
   * ══ 🔴 ENTRER DANS UN DOSSIER TROUVÉ, SANS PERDRE LA RECHERCHE ═══════════════════════════════════════════════
   * On garde le terme : c'est ce qui rend le retour naturel. `ajoutes` et le compteur ne sont pas touchés — ils
   * vivent au-dessus de la navigation, donc les « ✓ ajouté » restent justes au retour.
   */
  const entrerDepuisRecherche = (f: Fichier) => {
    setRechercheOuverte(saisie.trim());
    setSaisie('');
    setSelection(SELECTION_VIDE);
    setHisto((h) => naviguerVers(h, [{ id: f.id, nom: f.nom }]));
    void charger(f.id);
  };

  const revenirAuxResultats = () => {
    const terme = rechercheOuverte;
    setRechercheOuverte(null);
    oublierCreation();
    setHisto(HISTORIQUE_DEPART);
    setSaisie('');
    setLoupeOuverte(true);
    setTimeout(() => setSaisie(terme ?? ''), 0);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LES GESTES SUR UN FICHIER
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const amorces = useRef<Set<string>>(new Set());
  const AMORCES_MAX = 12;
  /**
   * 🔴 LE SURVOL AMORCE L'APERÇU. Ce qui coûte cher n'est pas le document : c'est le VERDICT (remonter la chaîne
   * des parents) et les métadonnées, mémorisés 60 s côté serveur. Un survol suffit à les payer d'avance.
   * 🔒 AUCUN PRÉCHARGEMENT DE CONTENU LÀ OÙ LA LECTURE EST REFUSÉE : l'appel n'est posé que si `joindreAutorise`.
   */
  const amorcer = useCallback((f: Fichier, autorise: boolean) => {
    if (!autorise || f.dossier || sorteApercu(f.typeMime) === 'aucun') return;
    if (amorces.current.has(f.id) || amorces.current.size >= AMORCES_MAX) return;
    amorces.current.add(f.id);
    void fetch(adresseApercu(f.id, 'info'), { cache: 'no-store' }).catch(() => {});
  }, []);

  /**
   * ══ 🔴🔴 « JOINDRE » N'ATTEND RIEN ═══════════════════════════════════════════════════════════════════════════
   * La pièce est marquée ajoutée TOUT DE SUITE, avant la réponse du serveur : c'est ce qui rend le clic suivant
   * immédiat. Et si le serveur refuse (« Documents clients scannés », document Google natif, 25 Mo dépassés), LA
   * MARQUE EST RETIRÉE et le motif s'affiche — une marque optimiste qui resterait après un refus ferait croire
   * qu'une pièce est jointe alors qu'elle ne l'est pas.
   */
  const joindre = async (f: Fichier) => {
    if (ajoutes.includes(f.id)) return;
    /* 🔴 UN « ._ » NE SE JOINT PAS. Il porte presque le nom d'un vrai document et ne pèse que quelques kilooctets :
       l'envoyer, c'est envoyer une pièce jointe qui ment. */
    if (estFichierSystemeMac(f.nom)) { setErreur(infobulleFichierSysteme(f.nom)); return; }
    setErreur(null);
    setAjoutes((a) => (a.includes(f.id) ? a : [...a, f.id]));
    try {
      await onChoisir({
        drive: {
          fichierId: f.id, nom: f.nom,
          dossierId: dossierCourant?.id ?? null,
          dossierNom: dossierCourant?.nom ?? null,
        },
      });
    } catch (e) {
      setAjoutes((a) => a.filter((x) => x !== f.id));
      setErreur(e instanceof Error ? e.message : 'Ce fichier n’a pas pu être joint.');
    }
  };

  /** INSÉRER UN LIEN : aucun contenu n'est lu. C'est pour cela qu'il reste permis partout. */
  const lier = (f: Fichier) => {
    if (f.lien === null || f.lien === '') { setErreur('Ce fichier n’a pas d’adresse Drive partageable.'); return; }
    void onChoisir({ lien: { nom: f.nom, url: f.lien } });
  };

  /** OUVRIR DANS GOOGLE DRIVE : un nouvel onglet, en LECTURE. Rien n'est lu ni écrit par l'application. */
  const ouvrirChezGoogle = (f: Fichier) => {
    if (f.lien === null || f.lien === '') { setErreur('Ce fichier n’a pas d’adresse Drive.'); return; }
    globalThis.open?.(f.lien, '_blank', 'noopener,noreferrer');
  };

  const visualiser = (f: Fichier, autorise: boolean) => {
    if (f.dossier) return;
    /* 🔴 UN « ._ » NE S'OUVRE PAS : il ne contient pas le document. Et ce refus-là se DIT AVANT celui de la
       lecture, parce qu'il est le seul des deux qui apprenne quelque chose : le vrai fichier est juste à côté.
       Il ne lit rien pour autant — il lit un NOM, que la liste affichait déjà. */
    if (estFichierSystemeMac(f.nom)) { setErreur(infobulleFichierSysteme(f.nom)); return; }
    if (!autorise) return;
    setAVoir({
      id: f.id, nom: f.nom, typeMime: f.typeMime, lien: f.lien,
      parentId: f.parentId ?? (vue.v === 'ok' && vue.recherche ? null : dossierCourant?.id ?? null),
    });
  };

  /** Un « récent » du Drive : un fichier se joint, un dossier s'ouvre. */
  const ouvrirRecent = (r: Recent) => {
    if (r.sorte === 'drive_dossier') { setMontrerRecents(false); entrer({ id: r.cle, nom: r.libelle }); return; }
    void joindre({
      id: r.cle, nom: r.libelle, typeMime: r.detail ?? '', tailleOctets: r.tailleOctets,
      modifieLe: null, lien: null, dossier: false,
    });
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     « NOUVEAU DOSSIER » — inchangé, avec sa confirmation venue du serveur et ses interdits
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const preparerDossier = async (nom: string) => {
    const parent = dossierCourant?.id ?? '';
    setCreation({ c: 'saisie', nom, occupe: true, erreur: null });
    try {
      const p = new URLSearchParams({ parent, nom });
      const res = await fetch(`/api/admin/gestion/drive/dossier?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; message?: string; nom?: string; chemin?: string; phrase?: string };
      if (d.etat !== 'ok' || typeof d.chemin !== 'string') {
        setCreation({ c: 'saisie', nom, occupe: false, erreur: d.message ?? 'Ce nom n’a pas pu être vérifié.' });
        return;
      }
      setCreation({
        c: 'confirme', nom: d.nom ?? nom, chemin: d.chemin,
        phrase: d.phrase ?? `Le dossier sera créé ici : ${d.chemin}`, occupe: false, erreur: null,
      });
    } catch {
      setCreation({ c: 'saisie', nom, occupe: false, erreur: 'Le Drive n’a pas répondu.' });
    }
  };

  const creerDossier = async (etat: Extract<Creation, { c: 'confirme' }>) => {
    const parent = dossierCourant?.id ?? '';
    setCreation({ ...etat, occupe: true, erreur: null });
    try {
      const res = await fetch('/api/admin/gestion/drive/dossier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent, nom: etat.nom }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string; journalise?: boolean; dossier?: { id: string; nom: string };
      };
      if (d.etat !== 'ok' || !d.dossier) {
        setCreation({ ...etat, occupe: false, erreur: d.message ?? 'Le dossier n’a pas pu être créé.' });
        return;
      }
      // Le dossier parent a changé de contenu : son listing mémorisé ne vaut plus.
      cache.current.delete(parent);
      // ⚠️ `entrer` remet la création à zéro : on pose donc le message APRÈS, sinon il serait effacé aussitôt.
      entrer({ id: d.dossier.id, nom: d.dossier.nom });
      setMotDeLaCreation(d.message ?? `Dossier « ${d.dossier.nom} » créé. Vous y êtes.`);
    } catch {
      setCreation({ ...etat, occupe: false, erreur: 'Le Drive n’a pas répondu.' });
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE DÉPLIAGE SUR PLACE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴 LE TRIANGLE ▸ OUVRE LE SOUS-NIVEAU SUR PLACE, sans quitter la vue. Le contenu est lu à la demande, PUIS
   * mémorisé : replier puis redéplier ne redemande rien.
   */
  const basculerDepliage = useCallback((f: Fichier) => {
    setOuverts((o) => {
      const n = new Set(o);
      if (n.has(f.id)) { n.delete(f.id); return n; }
      n.add(f.id);
      if (!enfants.has(f.id)) {
        void (async () => {
          try {
            const r = await lireListing(f.id, new AbortController().signal);
            if ('erreur' in r) return;
            cache.current.set(f.id, r);
            setEnfants((m) => new Map(m).set(f.id, r.fichiers));
          } catch { /* un sous-niveau qu'on n'a pas pu lire reste replié : rien ne casse */ }
        })();
      }
      return n;
    });
  }, [enfants, lireListing]);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LA LISTE : aplatie, triée, virtualisée
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const listing = vue.v === 'ok' ? vue : null;
  /**
   * ⚠️ PAS DE `useMemo` ICI, ET C'EST DÉLIBÉRÉ : le compilateur React refuse d'optimiser un composant dont il ne
   * peut pas préserver la mémorisation manuelle (il juge la carte des enfants modifiable), et il abandonne alors
   * TOUT le fichier. Le laisser faire lui-même vaut mieux qu'un `useMemo` qui lui coûte le reste.
   */
  const racineListe = listing === null ? []
    : listing.recherche ? [...listing.dossiers, ...listing.fichiers] : listing.fichiers;
  const lignes = aplatir(racineListe, ouverts, (id) => enfants.get(id), tri);
  const ordre = lignes.map((l) => l.entree.id);
  const fenetre = fenetreVisible(lignes.length, scrollTop, hauteurVue);
  const visibles = lignes.slice(fenetre.debut, fenetre.fin);

  useEffect(() => {
    const el = scene.current;
    if (el === null) return undefined;
    const mesurer = () => setHauteurVue(el.clientHeight);
    mesurer();
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null;
    obs?.observe(el);
    return () => obs?.disconnect();
  }, []);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 DÉPLACER ET COPIER — LE GESTE, ET SON GARDE
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. Il explique et il empêche de viser ce qui sera refusé ; c'est la ROUTE qui
     protège, en remontant la chaîne des parents de la source ET de la cible chez Google, à chaque appel. Un écran
     se modifie, une route non.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Le déplacement est-il disponible ? Sans la migration 274, non — et le motif est dit. */
  const [journalPret, setJournalPret] = useState<boolean | null>(null);
  const MOTIF_SANS_JOURNAL =
    'Déplacement indisponible : la mise à jour de la base qui consigne les déplacements n’est pas appliquée. '
    + 'On ne déplace pas dans le Drive ce qu’on ne saurait pas expliquer ensuite.';

  /**
   * ⚠️ PAS DE `useCallback` ICI, ET C'EST DÉLIBÉRÉ (même raison qu'à la liste, plus haut) : le compilateur React
   * refuse d'optimiser un composant dont il ne peut pas préserver la mémorisation manuelle — il juge `chemin`
   * modifiable — et il abandonne alors TOUT le fichier. Le laisser faire lui-même vaut mieux qu'un `useCallback`
   * qui lui coûte le reste de l'écran.
   */
  const mouvoir = async (
    sorte: 'deplacer' | 'copier', elements: Fichier[], cibleId: string, cibleNom: string,
  ): Promise<void> => {
    if (elements.length === 0 || cibleId === '') return;
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: sorte, cible: cibleId,
          elements: elements.map((f) => ({ id: f.id, nom: f.nom, dossier: f.dossier, parentId: f.parentId ?? null })),
        }),
      });
      const d = (await res.json()) as {
        etat?: string; message?: string; nomCible?: string;
        faits?: { id: string }[]; refuses?: { nom: string; motif: string }[]; mouvements?: number[];
      };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'Ce déplacement n’a pas pu être fait.'); return; }
      const faits = d.faits ?? [];
      const refuses = d.refuses ?? [];
      // 🔴 UN REFUS SE DIT, AVEC SON MOTIF. Un geste sans effet et sans explication se lit comme une panne.
      if (refuses.length > 0) {
        setErreur(refuses.map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      if (faits.length === 0) return;
      // Les deux dossiers concernés ont changé de contenu : leur listing mémorisé ne vaut plus.
      cache.current.delete(cibleId);
      cache.current.delete(dossierCourant?.id ?? '');
      setPresse(null);
      setSelection(SELECTION_VIDE);
      setBandeau({
        mot: motMouvementFait(sorte, faits.length, d.nomCible ?? cibleNom),
        // ⚠️ UNE COPIE NE S'ANNULE PAS : annuler voudrait dire SUPPRIMER la copie, et l'app ne supprime rien.
        mouvements: sorte === 'deplacer' ? (d.mouvements ?? []) : [],
      });
      void charger(dossierCourant?.id ?? '');
    } catch {
      setErreur('Le Drive n’a pas répondu.');
    }
  };

  /** ANNULER : la route relit le parent d'origine DANS LE JOURNAL, pas dans ce que cet écran se rappelle. */
  const annulerMouvement = async (mouvements: number[]) => {
    setBandeau(null);
    try {
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'annuler', mouvements }),
      });
      const d = (await res.json()) as { etat?: string; message?: string; refuses?: { nom: string; motif: string }[] };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'L’annulation n’a pas pu être faite.'); return; }
      if ((d.refuses ?? []).length > 0) {
        setErreur((d.refuses ?? []).map((r) => `« ${r.nom} » : ${r.motif}`).join(' · '));
      }
      cache.current.clear();
      void charger(dossierCourant?.id ?? '');
    } catch { setErreur('Le Drive n’a pas répondu.'); }
  };

  /** Le bandeau s'efface tout seul au bout de dix secondes : le temps de s'apercevoir qu'on s'est trompé. */
  useEffect(() => {
    if (bandeau === null) return undefined;
    const t = setTimeout(() => setBandeau(null), DUREE_ANNULATION_MS);
    return () => clearTimeout(t);
  }, [bandeau]);

  /**
   * 🔴 ON DEMANDE À LA ROUTE, pas à une copie de la règle. Elle seule sait si le journal existe — et c'est elle
   * qui refusera de toute façon. `null` = on ne sait pas encore : le geste est alors simplement inactif.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/gestion/drive/deplacer', { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; disponible?: boolean };
        if (!annule) setJournalPret(d.etat === 'ok' && d.disponible === true);
      } catch { if (!annule) setJournalPret(false); }
    })();
    return () => { annule = true; };
  }, []);

  /** Les éléments visés par un geste : la sélection si la ligne en fait partie, sinon cette ligne seule. */
  const visesPar = (f: Fichier): Fichier[] => {
    if (!selection.ids.includes(f.id)) return [f];
    return selection.ids.map((id) => entreeParId(id)).filter((x): x is Fichier => x !== null);
  };


  /**
   * ══ 🔴 COPIER UN DOSSIER : ON ANNONCE LE NOMBRE AVANT, ET C'EST LE SERVEUR QUI LE COMPTE ════════════════════
   *
   * Arno : « copie récursive, précédée d'une confirmation qui annonce le nombre d'éléments, avec une limite
   * raisonnable ». Ce nombre ne peut pas venir d'ici : l'écran ne connaît que le premier niveau, et encore, que
   * s'il l'a déplié. On le demande donc, et l'on n'agit qu'après un « Copier » explicite.
   *
   * ⚠️ UN FICHIER SEUL NE DEMANDE RIEN : copier trois pièces jointes est un geste ordinaire. C'est la RÉCURSION
   * qui se confirme, parce qu'elle seule peut emporter deux cents éléments sans qu'on l'ait vu venir.
   */
  const lancerCopie = async (elements: Fichier[], cibleId: string, cibleNom: string): Promise<void> => {
    const dossiers = elements.filter((f) => f.dossier);
    if (dossiers.length === 0) { void mouvoir('copier', elements, cibleId, cibleNom); return; }
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/drive/deplacer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compter', elements: dossiers.map((f) => ({ id: f.id, nom: f.nom, dossier: true })),
        }),
      });
      const d = (await res.json()) as { etat?: string; possible?: boolean; phrase?: string; motif?: string; message?: string };
      if (d.etat !== 'ok') { setErreur(d.message ?? 'Ce dossier n’a pas pu être compté.'); return; }
      if (d.possible !== true) { setErreur(d.motif ?? 'Cette copie est au-delà de ce que ce geste sait faire.'); return; }
      setConfirmation({
        phrase: d.phrase ?? `Copier vers « ${cibleNom} » ?`,
        agir: () => { setConfirmation(null); void mouvoir('copier', elements, cibleId, cibleNom); },
      });
    } catch { setErreur('Le Drive n’a pas répondu.'); }
  };

  /**
   * COLLER : déplacer ce qui a été coupé, copier ce qui a été copié.
   *
   * 🔴 UNE COPIE PASSE PAR LA MÊME PORTE QUE LE GLISSER AVEC ⌥ : `lancerCopie`, donc la confirmation dès qu'il y a
   * un dossier. Deux chemins qui feraient deux choses différentes — l'un annonçant le nombre, l'autre non —
   * seraient un piège tendu à celui qui apprend le geste par l'un des deux.
   */
  const coller = (cibleId: string, cibleNom: string) => {
    if (presse === null || journalPret !== true) return;
    /* ⚠️ LES ÉLÉMENTS PEUVENT NE PLUS ÊTRE À L'ÉCRAN (on a changé de dossier depuis la prise) : on reconstruit
       alors le minimum dont la route a besoin — elle relit tout chez Google de toute façon. Ce qu'on ne peut PAS
       reconstruire, c'est « est-ce un dossier » : c'est pour cela que la prise l'a retenu. */
    const liste = presse.ids.map((id) => entreeParId(id)
      ?? fichierMinimal({ id, dossier: presse.dossiers.includes(id) }));
    if (presse.mode === 'couper') { void mouvoir('deplacer', liste, cibleId, cibleNom); return; }
    void lancerCopie(liste, cibleId, cibleNom);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴 LE GLISSER-DÉPOSER
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     Arno : « sur un dossier → DÉPLACEMENT ; Option (⌥) → COPIE ; sur la zone Pièces jointes du mail → JOINDRE.
     Retour visuel : fantôme, dossier cible en surbrillance, curseur interdit, ouverture automatique d'un dossier
     après un survol prolongé. »

     ⚠️ CE QUI VOYAGE DANS LE GLISSER TIENT EN UN TYPE MIME À NOUS (`MIME_INTERNE`). Pas de `text/plain`, pas de
     `text/uri-list` : un nom de document du cabinet lâché dans le champ de recherche d'un autre onglet serait une
     fuite que personne ne verrait passer.
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** Le glisser s'arrête : plus de fantôme, plus de surbrillance, plus de ressort en attente. */
  const finGlisse = () => {
    setGlisse(null);
    setSurvole(null);
    if (ressort.current !== null) { clearTimeout(ressort.current.minuteur); ressort.current = null; }
  };

  const demarrerGlisse = (e: React.DragEvent, f: Fichier) => {
    const elements = visesPar(f);
    if (!selection.ids.includes(f.id)) setSelection({ ids: [f.id], ancre: f.id });
    setGlisse({
      ids: elements.map((x) => x.id),
      nom: elements.length > 1 ? `${elements.length} éléments` : f.nom,
    });
    try {
      e.dataTransfer.setData(MIME_INTERNE, JSON.stringify(
        elements.map((x) => ({ id: x.id, nom: x.nom, dossier: x.dossier })),
      ));
      e.dataTransfer.effectAllowed = 'copyMove';
      /* 🔴 LE FANTÔME D'UNE SÉLECTION MULTIPLE DIT COMBIEN. Sans lui, on traîne l'image d'UNE ligne en croyant
         n'en déplacer qu'une — et l'on en déplace cinq. */
      if (elements.length > 1 && typeof document !== 'undefined') {
        const fantome = document.createElement('div');
        fantome.className = 'sfd-fantome';
        fantome.textContent = `${elements.length} éléments`;
        document.body.appendChild(fantome);
        e.dataTransfer.setDragImage(fantome, 14, 14);
        setTimeout(() => fantome.remove(), 0);
      }
    } catch { /* un navigateur qui refuse le transfert ne doit pas casser la sélection */ }
  };

  /**
   * LE SURVOL D'UNE CIBLE PENDANT LE GLISSER.
   *
   * 🔴 `preventDefault()` EST CE QUI AUTORISE LE DÉPÔT : sans lui, le navigateur affiche le curseur « interdit » et
   * n'émet jamais `drop`. C'est donc ici, et seulement ici, qu'on dit oui — sur un DOSSIER, jamais sur un fichier.
   */
  const survolerCible = (
    e: React.DragEvent,
    cible: { id: string; nom: string; ouvrable: boolean; reel?: string },
  ) => {
    // ⚠️ `id` sert à ALLUMER la bonne zone (le fil d'Ariane et la barre latérale ont leurs propres clés) ; `reel`
    //    est l'identifiant Drive, le seul qui permette de reconnaître qu'on survole ce qu'on est en train de tenir.
    if (glisse === null || glisse.ids.includes(cible.reel ?? cible.id)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    if (survole !== cible.id) setSurvole(cible.id);
    // ⚠️ LE RESSORT : on n'en arme qu'UN, et seulement pour un dossier de la liste — pas pour le fil d'Ariane, où
    //   l'on est déjà en train de remonter, ni pour la zone des pièces jointes, qui ne s'ouvre pas.
    if (cible.ouvrable && ressort.current?.id !== cible.id) {
      if (ressort.current !== null) clearTimeout(ressort.current.minuteur);
      ressort.current = {
        id: cible.id,
        minuteur: setTimeout(() => { ressort.current = null; setSurvole(null); entrer(cible); }, RESSORT_MS),
      };
    }
  };

  const quitterCible = (id: string) => {
    setSurvole((v) => (v === id ? null : v));
    if (ressort.current?.id === id) { clearTimeout(ressort.current.minuteur); ressort.current = null; }
  };

  /** Ce qui a été saisi, relu du transfert — et à défaut, de ce que l'écran se rappelle. */
  const elementsDuGlisse = (e: React.DragEvent): Fichier[] => {
    let brut = '';
    try { brut = e.dataTransfer.getData(MIME_INTERNE); } catch { brut = ''; }
    if (brut !== '') {
      try {
        const liste = JSON.parse(brut) as { id?: string; nom?: string; dossier?: boolean }[];
        const lus = liste.filter((x) => typeof x?.id === 'string' && x.id !== '')
          .map((x) => entreeParId(x.id as string) ?? fichierMinimal({ id: x.id as string, nom: x.nom, dossier: x.dossier }));
        if (lus.length > 0) return lus;
      } catch { /* un transfert illisible se rattrape ci-dessous */ }
    }
    return (glisse?.ids ?? []).map((id) => entreeParId(id)).filter((x): x is Fichier => x !== null);
  };

  /** LE DÉPÔT SUR UN DOSSIER : déplacement, ou copie si Option (⌥) est tenue. */
  const deposerSur = (e: React.DragEvent, cible: { id: string; nom: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const copie = e.altKey;
    const elements = elementsDuGlisse(e);
    finGlisse();
    if (elements.length === 0 || cible.id === '') return;
    if (journalPret !== true) { setErreur(MOTIF_SANS_JOURNAL); return; }
    if (copie) { void lancerCopie(elements, cible.id, cible.nom); return; }
    void mouvoir('deplacer', elements, cible.id, cible.nom);
  };

  /**
   * ══ 🔴 LE DÉPÔT SUR « PIÈCES JOINTES » ══════════════════════════════════════════════════════════════════════
   *
   * ⚠️ LA ZONE EST DANS LE PIED DE CETTE FENÊTRE, et non sur le brouillon lui-même : ce navigateur est une fenêtre
   * MODALE qui recouvre le message — pendant un glisser, la zone du mail est littéralement derrière. La déposer
   * ici est la seule façon de la rendre atteignable sans démonter la modale.
   *
   * 🔴 ELLE N'ÉCRIT RIEN DANS LE DRIVE : elle joint, exactement comme le bouton 📎. Elle reste donc disponible
   * même sans la migration 274 (demande d'Arno : « sans elle, glisser vers le mail seulement »).
   */
  const deposerSurPiecesJointes = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const elements = elementsDuGlisse(e);
    finGlisse();
    const joignables = elements.filter((f) => !f.dossier && !estFichierSystemeMac(f.nom) && !ajoutes.includes(f.id));
    const ecartes = elements.length - joignables.length;
    if (joignables.length === 0) {
      setErreur(elements.some((f) => f.dossier)
        ? 'Un dossier ne se joint pas à un message. Déposez les fichiers qu’il contient.'
        : 'Rien de joignable dans ce qui a été déposé.');
      return;
    }
    if (ecartes > 0) {
      setErreur(`${ecartes} élément${ecartes > 1 ? 's' : ''} écarté${ecartes > 1 ? 's' : ''} : `
        + 'dossier, fichier système « ._ » ou pièce déjà jointe.');
    }
    for (const f of joignables) void joindre(f);
  };

  /**
   * ══ 🔴 LA TAILLE DE LA FENÊTRE, D'UNE OUVERTURE À L'AUTRE ═══════════════════════════════════════════════════
   *
   * Préférence LOCALE au navigateur (demande d'Arno), donc `localStorage` — et tout est sous `try/catch` : en
   * navigation privée, avec les données de site bloquées, l'accès JETTE. Une fenêtre qui ne se rappelle pas sa
   * taille est un désagrément ; une fenêtre qui ne s'ouvre pas est une panne.
   */
  useEffect(() => {
    const el = cadre.current;
    if (el === null) return undefined;
    try {
      const brut = globalThis.localStorage?.getItem(CLE_TAILLE_FENETRE) ?? null;
      if (brut !== null) {
        const t = JSON.parse(brut) as { l?: number; h?: number };
        // ⚠️ BORNÉ PAR L'ÉCRAN D'AUJOURD'HUI : une taille retenue sur un 27 pouces rendrait la fenêtre inutilisable
        //   sur un portable, avec sa croix hors de l'écran.
        if (typeof t.l === 'number' && t.l >= 520) el.style.width = `${Math.min(t.l, globalThis.innerWidth - 24)}px`;
        if (typeof t.h === 'number' && t.h >= 360) el.style.height = `${Math.min(t.h, globalThis.innerHeight - 24)}px`;
      }
    } catch { /* une préférence illisible n'est pas une panne : la fenêtre garde sa taille par défaut */ }
    if (typeof ResizeObserver !== 'function') return undefined;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const obs = new ResizeObserver(() => {
      if (minuteur !== null) clearTimeout(minuteur);
      // On n'écrit pas à chaque pixel : on écrit quand la main s'arrête.
      minuteur = setTimeout(() => {
        try {
          const r = el.getBoundingClientRect();
          globalThis.localStorage?.setItem(CLE_TAILLE_FENETRE,
            JSON.stringify({ l: Math.round(r.width), h: Math.round(r.height) }));
        } catch { /* idem : on renonce à se rappeler, pas à fonctionner */ }
      }, 400);
    });
    obs.observe(el);
    return () => { obs.disconnect(); if (minuteur !== null) clearTimeout(minuteur); };
  }, []);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE CLAVIER — flèches, Entrée, barre d'espace, Échap, et Cmd+X / Cmd+C / Cmd+V
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** ⚠️ Fonction simple, sans `useCallback` : voir plus haut — le compilateur React fait mieux tout seul. */
  const entreeParId = (id: string): Fichier | null =>
    lignes.find((l) => l.entree.id === id)?.entree ?? null;

  const ouvrirSelection = () => {
    const id = selection.ids.at(-1);
    if (id === undefined) return;
    const f = entreeParId(id);
    if (f === null) return;
    if (f.dossier) { ouvrirDossier(f); return; }
    visualiser(f, listing?.joindreAutorise === true);
  };

  const surTouche = (e: React.KeyboardEvent) => {
    /**
     * 🔴 ÉCHAP FERME LA FENÊTRE — SAUF SI L'APERÇU EST OUVERT : il ferme alors l'aperçu d'abord (demande d'Arno).
     * L'aperçu étant rendu HORS de cette fenêtre, il écoute Échap lui-même ; on se contente de ne pas doubler.
     */
    if (e.key === 'Escape') {
      if (aVoir !== null) return;
      if (menu !== null) { e.preventDefault(); setMenu(null); return; }
      if (confirmation !== null) { e.preventDefault(); setConfirmation(null); return; }
      // 🔴 ÉCHAP ANNULE LA COUPE (demande d'Arno) avant de fermer : on renonce au geste, pas à la fenêtre.
      if (presse !== null) { e.preventDefault(); setPresse(null); return; }
      if (creation.c !== 'ferme') { e.preventDefault(); oublierCreation(); return; }
      e.stopPropagation();
      onFermer();
      return;
    }

    /* ══ 🔴 COUPER / COPIER / COLLER — la presse-papiers INTERNE à l'application ═══════════════════════════════
       ⚠️ ELLE NE TOUCHE JAMAIS AU PRESSE-PAPIERS DU SYSTÈME : ce qu'on « coupe » ici est une intention, pas une
       donnée. Rien ne quitte l'application, et rien n'est retiré du Drive tant qu'on n'a pas collé. */
    if ((e.metaKey || e.ctrlKey) && (e.key === 'x' || e.key === 'c' || e.key === 'v')) {
      e.preventDefault();
      if (e.key === 'v') {
        const cible = dossierCourant?.id ?? '';
        if (cible !== '') coller(cible, dossierCourant?.nom ?? 'ce dossier');
        return;
      }
      if (selection.ids.length === 0) return;
      const pris = selection.ids.map((id) => entreeParId(id)).filter((x): x is Fichier => x !== null);
      setPresse({
        mode: e.key === 'x' ? 'couper' : 'copier',
        ids: [...selection.ids],
        dossiers: pris.filter((x) => x.dossier).map((x) => x.id),
        parentSource: dossierCourant?.id ?? null,
      });
      return;
    }
    if (menu !== null) setMenu(null);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setSelection((s) => selectionSuivante(s, ordre, e.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); ouvrirSelection(); return; }
    /** 🔴 LA BARRE D'ESPACE : le « Coup d'œil » du Finder. Sur un dossier, elle ne fait rien — il n'y a rien à voir. */
    if (e.key === ' ' && selection.ids.length === 1) {
      const f = entreeParId(selection.ids[0]);
      if (f !== null && !f.dossier) {
        e.preventDefault();
        visualiser(f, listing?.joindreAutorise === true);
      }
    }
  };

  /** Le défilement suit la sélection au clavier : une ligne choisie hors de l'écran ne sert à rien. */
  useEffect(() => {
    const id = selection.ids.at(-1);
    if (id === undefined || scene.current === null) return;
    const i = ordre.indexOf(id);
    if (i < 0) return;
    const haut = i * HAUTEUR_LIGNE;
    const el = scene.current;
    if (haut < el.scrollTop) el.scrollTop = haut;
    else if (haut + HAUTEUR_LIGNE > el.scrollTop + el.clientHeight) {
      el.scrollTop = haut + HAUTEUR_LIGNE - el.clientHeight;
    }
  }, [selection, ordre]);

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE MENU CONTEXTUEL
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    if (menu === null) return undefined;
    const fermer = () => setMenu(null);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
    return () => { window.removeEventListener('scroll', fermer, true); window.removeEventListener('resize', fermer); };
  }, [menu]);

  /**
   * 🔴 CE QUE LE MENU A LE DROIT DE PROPOSER POUR LA MÉMOIRE TAMPON. Sans la migration 274, les trois entrées sont
   * ÉTEINTES avec leur motif — et non absentes : la fonction existe et attend quelque chose, ce n'est pas la même
   * information qu'un geste qui n'existe pas.
   */
  const droitsPresse = (): DroitsPresse => ({
    autorise: journalPret === true,
    motif: journalPret === true ? null
      : journalPret === null ? 'Vérification en cours…' : MOTIF_SANS_JOURNAL,
    motColler: motColler(presse),
    presseVide: presse === null,
  });

  const entreesDuMenu = (f: Fichier): EntreeMenu[] => f.dossier
    ? menuDossier({
      creerAutorise: listing?.creerAutorise === true,
      motifCreation: listing?.motifCreation ?? null,
      avecLien: (f.lien ?? '') !== '',
      presse: droitsPresse(),
    })
    /* 🔴🔴 UN FICHIER « ._ » EST TRAITÉ COMME UN ENDROIT OÙ LA LECTURE EST REFUSÉE : « Visualiser » et « Joindre »
       éteints, avec pour motif l'infobulle qui renvoie au VRAI fichier. Le reste — lien, Drive, couper, copier,
       coller — n'est pas touché : ces gestes-là ne lisent rien. */
    : menuFichier({
      joindreAutorise: listing?.joindreAutorise === true && !estFichierSystemeMac(f.nom),
      motifRefus: estFichierSystemeMac(f.nom) ? infobulleFichierSysteme(f.nom) : (listing?.motifRefus ?? null),
      dejaAjoute: ajoutes.includes(f.id),
      avecLien: (f.lien ?? '') !== '',
      presse: droitsPresse(),
    });

  const agirMenu = (a: ActionMenu, f: Fichier) => {
    setMenu(null);
    if (a === 'ouvrir') { ouvrirDossier(f); return; }
    if (a === 'visualiser') { visualiser(f, listing?.joindreAutorise === true); return; }
    if (a === 'joindre') { void joindre(f); return; }
    if (a === 'lien') { lier(f); return; }
    if (a === 'ouvrir_google') { ouvrirChezGoogle(f); return; }
    if (a === 'nouveau_dossier') {
      // On crée DANS ce dossier : on y entre d'abord, pour que la confirmation porte le bon chemin.
      entrer(f);
      setTimeout(() => setCreation({ c: 'saisie', nom: '', occupe: false, erreur: null }), 0);
      return;
    }
    /* 🔴 LES MÊMES GESTES QUE ⌘X / ⌘C / ⌘V, par la même porte : `visesPar` étend à la sélection si la ligne en
       fait partie, exactement comme le clavier. Deux chemins qui feraient deux choses différentes seraient un
       piège. */
    if (a === 'couper' || a === 'copier') {
      const pris = visesPar(f);
      setPresse({
        mode: a === 'couper' ? 'couper' : 'copier',
        ids: pris.map((x) => x.id),
        dossiers: pris.filter((x) => x.dossier).map((x) => x.id),
        parentSource: dossierCourant?.id ?? null,
      });
      return;
    }
    if (a === 'coller') {
      // 🔴 SUR UN DOSSIER, ON COLLE DEDANS ; sur un fichier, dans le dossier AFFICHÉ, celui qui le contient.
      if (f.dossier) { coller(f.id, f.nom); return; }
      const cible = dossierCourant?.id ?? '';
      if (cible !== '') coller(cible, dossierCourant?.nom ?? 'ce dossier');
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE RENDU
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const recentsDrive = (recents?.lignes ?? []).filter((r) => r.sorte !== 'locale');
  const joindreOk = listing?.joindreAutorise === true;
  const selectionJoignable = selection.ids
    .map((id) => entreeParId(id))
    .filter((f): f is Fichier => f !== null && !f.dossier && !ajoutes.includes(f.id));

  /**
   * 🔴 LA BARRE LATÉRALE EST AUSSI UNE CIBLE DE DÉPÔT, comme dans le Finder — mais seulement là où l'entrée
   * désigne un VRAI dossier. « Récents » est une liste, « Drives partagés » un écran de choix : rien ne s'y
   * dépose, et `depot: null` le dit une fois pour toutes plutôt que par un test au moment du glisser.
   */
  const laterales = [
    ...prioritaires.map((d) => ({
      cle: `bien:${d.dossierId}`, icone: '🏠', libelle: titreDossierPrioritaire(d),
      depot: { id: d.dossierId, nom: d.dossierNom || d.libelle },
      // ⚠️ LE NOMBRE N'EST DIT QUE S'IL Y EN A PLUSIEURS : « 1 bien » est du bruit. Il l'était déjà avant ce lot,
      //   et le taire ici ferait croire qu'un dossier ne porte qu'un seul logement.
      detail: mentionNbBiens(d) === null ? d.libelle : `${d.libelle} · ${mentionNbBiens(d)}`,
      aller: () => entrerDepuisRacine({ id: d.dossierId, nom: d.dossierNom || d.libelle }),
    })),
    ...(recents?.disponible === true && recentsDrive.length > 0
      ? [{ cle: 'recents', icone: '🕘', libelle: 'Récents', detail: null as string | null,
        depot: null as { id: string; nom: string } | null,
        aller: () => { setMontrerRecents(true); setSelection(SELECTION_VIDE); } }]
      : []),
    { cle: 'mon_drive', icone: '💾', libelle: 'Mon Drive', detail: null as string | null,
      depot: { id: 'root', nom: 'Mon Drive' } as { id: string; nom: string } | null,
      aller: () => entrerDepuisRacine({ id: 'root', nom: 'Mon Drive' }) },
    { cle: 'drives', icone: '👥', libelle: 'Drives partagés', detail: null as string | null,
      depot: null as { id: string; nom: string } | null,
      aller: () => entrerDepuisRacine({ id: 'svav:drives', nom: 'Drives partagés' }) },
  ];

  /** Une entrée latérale part TOUJOURS de la racine : c'est un raccourci, pas une descente de plus. */
  function entrerDepuisRacine(f: { id: string; nom: string }) {
    setMontrerRecents(false);
    allerA([{ id: f.id, nom: f.nom }]);
  }

  return (
    <>
    <div className="sfd-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_SELECTEUR_FICHIER}</style>
      <div className="sfd" role="dialog" aria-modal="true" aria-labelledby="sfd-titre" ref={cadre}
        onKeyDown={surTouche} tabIndex={-1}
        /* ⚠️ UN GLISSER QUI SE TERMINE DANS LE VIDE DOIT S'ÉTEINDRE : sans cela, la surbrillance et le fantôme
           survivraient au geste, et l'écran resterait « en train de glisser » pour toujours. */
        onDragEnd={finGlisse}
        onDrop={finGlisse}>

        {/* ══ 🔴 LA BARRE DE TITRE, AVEC SA CROIX ═══════════════════════════════════════════════════════════════
            Elle manquait : « la fenêtre n'a pas de croix pour la fermer, il faut l'ajouter » (Arno). Le titre est
            le nom du DOSSIER COURANT, comme dans une fenêtre du Finder — et non un libellé fixe qui ne dirait pas
            où l'on est. */}
        <header className="sfd-barre-titre">
          <h2 className="sfd-titre" id="sfd-titre">{titreDuChemin(chemin)}</h2>
          <button type="button" className="sfd-croix" aria-label="Fermer la fenêtre" title="Fermer"
            onClick={onFermer}>
            <span aria-hidden="true">✕</span>
          </button>
        </header>

        {/* ══ 🔴 LA BARRE D'OUTILS, FAÇON FINDER ════════════════════════════════════════════════════════════════
            Flèches ‹ › avec l'historique, fil d'Ariane cliquable, loupe, et « ⋯ » pour « Nouveau dossier ». */}
        <div className="sfd-outils">
          <span className="sfd-fleches" role="group" aria-label="Historique de navigation">
            <button type="button" className="sfd-outil" aria-label="Précédent" title="Précédent"
              disabled={!peutReculer(histo)} onClick={pasArriere}><span aria-hidden="true">‹</span></button>
            <button type="button" className="sfd-outil" aria-label="Suivant" title="Suivant"
              disabled={!peutAvancer(histo)} onClick={pasAvant}><span aria-hidden="true">›</span></button>
          </span>

          <nav className="sfd-ariane" aria-label="Chemin">
            {arianeDuChemin(chemin).map((e, i) => (
              <span key={`${e.id}:${i}`} className="sfd-ariane-pas">
                {i > 0 && <span className="sfd-chevron" aria-hidden="true">›</span>}
                {/* 🔴 LE FIL D'ARIANE EST UNE CIBLE : c'est le geste « remonter d'un cran » du Finder, et sans lui
                    il faudrait sortir du dossier, lâcher, resélectionner, recommencer. ⚠️ PAS DE RESSORT ici :
                    on ne veut pas qu'un survol du chemin nous fasse changer d'endroit en plein glisser. */}
                <button type="button"
                  className={`sfd-ariane-bouton${survole === `pas:${e.id}` ? ' sfd-ariane-bouton--vise' : ''}`}
                  onClick={() => remonter(e.index)}
                  onDragOver={(ev) => survolerCible(ev, {
                    id: `pas:${e.id}`, nom: e.nom, ouvrable: false, reel: e.id,
                  })}
                  onDragLeave={() => quitterCible(`pas:${e.id}`)}
                  onDrop={(ev) => deposerSur(ev, { id: e.id, nom: e.nom })}>{e.nom}</button>
              </span>
            ))}
          </nav>

          <span className="sfd-outils-droite">
            <button type="button" className="sfd-outil" aria-label="Rechercher" title="Rechercher"
              aria-expanded={loupeOuverte}
              onClick={() => { setLoupeOuverte((v) => !v); setTimeout(() => champ.current?.focus(), 0); }}>
              <span aria-hidden="true">🔍</span>
            </button>
            <span className="sfd-plus">
              <button type="button" className="sfd-outil" aria-label="Autres actions" title="Autres actions"
                aria-expanded={outils} onClick={() => setOutils((v) => !v)}>
                <span aria-hidden="true">⋯</span>
              </button>
              {outils && (
                <ul className="sfd-menu sfd-menu--outils" role="menu">
                  {/* 🔴🔴 « Nouveau dossier » PORTE SES INTERDITS : éteint avec son motif sous « Documents clients
                      scannés », dans les résultats de recherche, à la racine, et sans la migration 272. */}
                  {/* 🔴🔴 ABSENT là où la RÈGLE interdit (sous « Documents clients scannés », dans des résultats
                      de recherche, à la racine) : le motif est déjà écrit en tête de liste, et aligner en plus une
                      entrée morte n'ajouterait rien. DÉSACTIVÉ, avec son motif, quand c'est la MIGRATION qui
                      manque : la fonction existe et attend quelque chose — ce n'est pas la même information. */}
                  {listing !== null && (listing.creerAutorise || listing.motifCreation !== null) && (
                    <li role="none">
                      <button type="button" role="menuitem" className="sfd-menu-item"
                        disabled={!listing.creerAutorise}
                        title={listing.creerAutorise ? undefined : (listing.motifCreation ?? undefined)}
                        onClick={() => {
                          setOutils(false);
                          setCreation({ c: 'saisie', nom: '', occupe: false, erreur: null });
                        }}>
                        Nouveau dossier
                      </button>
                      {!listing.creerAutorise && listing.motifCreation !== null && (
                        <p className="sfd-menu-motif">{listing.motifCreation}</p>
                      )}
                    </li>
                  )}
                  {listing !== null && !listing.creerAutorise && listing.motifCreation === null && (
                    <li role="none"><p className="sfd-menu-motif">Aucune autre action ici.</p></li>
                  )}
                </ul>
              )}
            </span>
          </span>
        </div>

        {loupeOuverte && (
          <label className="sfd-champ">
            <span className="svv-label">Chercher un fichier ou un dossier, dans tout le Drive</span>
            <input ref={champ} className="sfd-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
              placeholder="ex. « bail 2024 », « devis plomberie »"
              onChange={(e) => {
                const v = e.target.value;
                setSaisie(v);
                // Effacer la recherche ramène au dossier où l'on était : on ne perd pas sa place.
                if (v.trim().length < 2) void charger(dossierCourant?.id ?? '');
              }} />
          </label>
        )}

        {rechercheOuverte !== null && (
          <button type="button" className="gst-lien-bouton sfd-retour" onClick={revenirAuxResultats}>
            ← Résultats de la recherche « {rechercheOuverte} »
          </button>
        )}

        {/* ══ « NOUVEAU DOSSIER » — la même fonction, la même confirmation venue du serveur, les mêmes interdits ══ */}
        {creation.c === 'saisie' && (
          <div className="sfd-creer-corps">
            <label className="sfd-champ">
              <span className="svv-label">Nom du nouveau dossier</span>
              <input className="sfd-saisie" type="text" value={creation.nom} autoComplete="off"
                maxLength={NOM_DOSSIER_MAX} autoFocus disabled={creation.occupe}
                placeholder="ex. « Travaux 2026 »"
                onChange={(e) => setCreation({ c: 'saisie', nom: e.target.value, occupe: false, erreur: null })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void preparerDossier(creation.nom); } }} />
            </label>
            {creation.erreur !== null && <p className="gst-tronc" role="alert">{creation.erreur}</p>}
            <div className="sfd-creer-boutons">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={creation.occupe}
                onClick={() => void preparerDossier(creation.nom)}>Continuer</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={creation.occupe}
                onClick={oublierCreation}>Annuler</button>
            </div>
          </div>
        )}
        {creation.c === 'confirme' && (
          <div className="sfd-creer-corps">
            {/* 🔴 LE CHEMIN COMPLET, RENDU PAR LE SERVEUR. C'est lui qui vaut confirmation : le recomposer ici le
                ferait dire par l'écran, et il serait faux précisément dans le cas qui compte. */}
            {/* 🔴🔴 LE NOM ET LE CHEMIN COMPLET, RENDUS PAR LE SERVEUR. C'est la seule protection contre la faute
                la plus probable : le bon nom, au mauvais endroit. Deux dossiers « Documents » à deux endroits sont
                la règle, pas l'exception, dans un Drive construit à la main pendant des années. */}
            <p className="sfd-creer-chemin" role="status">
              <span className="sfd-creer-nom">📁 {creation.nom}</span>
              <span className="sfd-mention sfd-mention--bloc">{creation.phrase}</span>
            </p>
            {creation.erreur !== null && <p className="gst-tronc" role="alert">{creation.erreur}</p>}
            <div className="sfd-creer-boutons">
              <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={creation.occupe}
                onClick={() => void creerDossier(creation)}>{creation.occupe ? 'Création…' : 'Créer'}</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={creation.occupe}
                onClick={oublierCreation}>Annuler</button>
            </div>
          </div>
        )}
        {motDeLaCreation !== null && <p className="sfd-creer-fait" role="status">{motDeLaCreation}</p>}

        {/* 🔴🔴 LE DOSSIER INTERDIT SE DIT EN TOUTES LETTRES, AVANT la liste — pour qu'on le lise avant de chercher
            un bouton qui n'y est pas. */}
        {listing !== null && !listing.joindreAutorise && listing.motifRefus !== null && (
          <p className="sfd-interdit" role="status">🔒 {listing.motifRefus}</p>
        )}
        {listing !== null && listing.recherche && (
          <p className="sfd-interdit" role="status">
            🔒 Résultats de tout le Drive : le droit de joindre est vérifié au moment de joindre. Un fichier de
            « Documents clients scannés » sera refusé, avec son motif.
          </p>
        )}
        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}
        {vue.v === 'indisponible' && <p className="gst-tronc" role="alert">{vue.message}</p>}

        {/* ══ 🔴 LE BANDEAU « N ÉLÉMENT(S) DÉPLACÉ(S) VERS X — ANNULER », DIX SECONDES ═══════════════════════
            ⚠️ « Annuler » N'APPARAÎT QUE POUR UN DÉPLACEMENT. Annuler une copie voudrait dire SUPPRIMER la copie,
            et l'application ne supprime rien : le bandeau d'une copie dit donc ce qui a été fait, sans promettre
            un retour qu'on ne saurait pas tenir. */}
        {bandeau !== null && (
          <p className="sfd-bandeau" role="status">
            <span className="sfd-bandeau-mot">{bandeau.mot}</span>
            {bandeau.mouvements.length > 0 && (
              <button type="button" className="sfd-bandeau-annuler"
                onClick={() => void annulerMouvement(bandeau.mouvements)}>Annuler</button>
            )}
            <button type="button" className="sfd-bandeau-croix" aria-label="Masquer ce message"
              onClick={() => setBandeau(null)}><span aria-hidden="true">✕</span></button>
          </p>
        )}

        {/* ══ 🔴 LA CONFIRMATION D'UNE COPIE DE DOSSIER, avec le nombre RÉEL compté par le serveur ═══════════ */}
        {confirmation !== null && (
          <div className="sfd-creer-corps" role="alertdialog" aria-label="Confirmer la copie">
            <p className="sfd-creer-chemin">
              <span className="sfd-creer-nom">📋 {confirmation.phrase}</span>
              <span className="sfd-mention sfd-mention--bloc">
                Les doublons de nom sont conservés tous les deux, comme dans Google Drive : rien n’est écrasé.
              </span>
            </p>
            <div className="sfd-creer-boutons">
              <button type="button" className="svv-btn svv-btn-primary gst-btn"
                onClick={confirmation.agir}>Copier</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => setConfirmation(null)}>Annuler</button>
            </div>
          </div>
        )}

        {/* ══ LE CORPS : barre latérale + liste ═════════════════════════════════════════════════════════════════ */}
        <div className="sfd-corps">
          <aside className="sfd-cote" aria-label="Emplacements">
            <ul className="sfd-cote-liste">
              {laterales.map((l) => (
                <li key={l.cle}>
                  <button type="button"
                    className={`sfd-cote-item${survole === `cote:${l.cle}` ? ' sfd-cote-item--vise' : ''}`}
                    onClick={l.aller}
                    onDragOver={l.depot === null ? undefined
                      : (e) => survolerCible(e, {
                        id: `cote:${l.cle}`, nom: l.libelle, ouvrable: false, reel: l.depot?.id,
                      })}
                    onDragLeave={l.depot === null ? undefined : () => quitterCible(`cote:${l.cle}`)}
                    onDrop={l.depot === null ? undefined : (e) => deposerSur(e, l.depot as { id: string; nom: string })}>
                    <span className="sfd-cote-icone" aria-hidden="true">{l.icone}</span>
                    <span className="sfd-cote-mots">
                      <span className="sfd-cote-libelle">{l.libelle}</span>
                      {l.detail !== null && <span className="sfd-cote-detail">{l.detail}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="sfd-vue" aria-label="Contenu">
            {/* ══ LES EN-TÊTES DE COLONNES : un clic trie, une flèche dit dans quel sens ═══════════════════════ */}
            <div className="sfd-entetes" role="row">
              {COLONNES.map((c) => (
                <button key={c.cle} type="button" role="columnheader"
                  className={`sfd-entete sfd-col-${c.cle}${tri.colonne === c.cle ? ' sfd-entete--actif' : ''}`}
                  aria-sort={tri.colonne === c.cle ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => setTri((t) => (t.colonne === c.cle
                    ? { colonne: c.cle as Colonne, sens: t.sens === 'asc' ? 'desc' : 'asc' }
                    : { colonne: c.cle as Colonne, sens: 'asc' }))}>
                  {c.libelle}<span className="sfd-fleche-tri" aria-hidden="true">{flecheTri(c.cle, tri)}</span>
                </button>
              ))}
            </div>

            <div className="sfd-lignes" ref={scene} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
              {/* ══ 🔴 « RÉCENTS », quand on le demande dans la barre latérale ═════════════════════════════════ */}
              {montrerRecents ? (
                <ul className="sfd-recents">
                  {recentsDrive.map((r) => (
                    <li key={`${r.sorte}|${r.cle}`}>
                      <button type="button" className="sfd-ligne sfd-ligne--recent"
                        disabled={ajoutes.includes(r.cle)} onClick={() => ouvrirRecent(r)}>
                        <span className="sfd-col-nom">
                          <span className="sfd-icone" aria-hidden="true">{r.sorte === 'drive_dossier' ? '📁' : '📄'}</span>
                          {r.libelle}
                        </span>
                        <span className="sfd-col-type">
                          {ajoutes.includes(r.cle) ? '✓ déjà ajouté'
                            : r.sorte === 'drive_dossier' ? 'dossier — ouvrir' : 'fichier — joindre'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : vue.v === 'charge' ? (
                /* 🔴 LE SQUELETTE : des lignes grises tout de suite, jamais un écran figé ni un vide. C'est ce qui
                   fait la différence entre « ça répond » et « ça rame » quand le Drive met une seconde. */
                <ul className="sfd-squelette" aria-hidden="true">
                  {Array.from({ length: 14 }, (_, i) => <li key={i} className="sfd-ligne sfd-ligne--squelette" />)}
                </ul>
              ) : listing !== null && lignes.length === 0 ? (
                <p className="gst-tronc sfd-vide">
                  {listing.recherche ? `Aucun dossier ni fichier trouvé pour « ${saisie.trim()} ».` : 'Ce dossier est vide.'}
                </p>
              ) : (
                <>
                  {/* La virtualisation : deux cales, et seulement les lignes qu'on voit. */}
                  {fenetre.avant > 0 && <div style={{ height: fenetre.avant }} aria-hidden="true" />}
                  <ul className="sfd-liste" role="listbox" aria-multiselectable="true">
                    {visibles.map(({ entree: f, profondeur }) => {
                      const choisie = selection.ids.includes(f.id);
                      const deja = ajoutes.includes(f.id);
                      /* 🔴 LES DEUX ÉTATS NOUVEAUX D'UNE LIGNE :
                         · COUPÉE — estompée jusqu'au collage (demande d'Arno). Elle n'a PAS bougé : rien n'est
                           retiré du Drive tant qu'on n'a pas collé, et Échap rend la coupe.
                         · « ._ » — le jumeau technique de macOS : grisé, nommé pour ce qu'il est, et ni
                           visualisable ni joignable. */
                      const coupee = estCoupe(presse, f.id);
                      const systeme = estFichierSystemeMac(f.nom);
                      const lisible = joindreOk && !systeme;
                      return (
                        <li key={f.id} role="option" aria-selected={choisie}
                          className={`sfd-ligne${choisie ? ' sfd-ligne--choisie' : ''}`
                            + `${coupee ? ' sfd-ligne--coupee' : ''}${systeme ? ' sfd-ligne--systeme' : ''}`
                            + `${survole === f.id ? ' sfd-ligne--vise' : ''}`}
                          style={{ paddingLeft: 6 + profondeur * 16 }}
                          title={systeme ? infobulleFichierSysteme(f.nom) : undefined}
                          /* 🔴 SAISISSABLE — c'est ce qui manquait : « je ne peux pas saisir un fichier ou un
                             document pour le glisser-déposer » (Arno). */
                          draggable
                          onDragStart={(e) => demarrerGlisse(e, f)}
                          onDragEnd={finGlisse}
                          /* ⚠️ SEUL UN DOSSIER ACCEPTE UN DÉPÔT. Sur un fichier, on ne fait pas `preventDefault`,
                             et le navigateur montre de lui-même le curseur « interdit » — c'est le retour visuel
                             demandé, rendu par le système plutôt que dessiné par nous. */
                          onDragOver={f.dossier
                            ? (e) => survolerCible(e, { id: f.id, nom: f.nom, ouvrable: true })
                            : undefined}
                          onDragLeave={f.dossier ? () => quitterCible(f.id) : undefined}
                          onDrop={f.dossier ? (e) => deposerSur(e, { id: f.id, nom: f.nom }) : undefined}
                          onMouseEnter={() => {
                            if (f.dossier) precharger(f.id);
                            else amorcer(f, lisible);
                          }}
                          onClick={(e) => setSelection((s) => cliquerLigne(s, f.id, ordre,
                            { cmd: e.metaKey || e.ctrlKey, maj: e.shiftKey }))}
                          /* 🔴 DOUBLE-CLIC : un dossier s'ouvre, un fichier se visualise — comme dans le Finder. */
                          onDoubleClick={() => {
                            if (f.dossier) { ouvrirDossier(f); return; }
                            // ⚠️ `joindreOk`, et non `lisible` : c'est `visualiser` qui dit le refus d'un « ._ ».
                            visualiser(f, joindreOk);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setSelection((s) => (s.ids.includes(f.id) ? s : { ids: [f.id], ancre: f.id }));
                            setMenu({ x: e.clientX, y: e.clientY, entree: f });
                          }}>
                          <span className="sfd-col-nom">
                            {/* 🔴 LE TRIANGLE ▸ : il déplie SUR PLACE, sans quitter la vue. Absent sur un fichier. */}
                            {f.dossier ? (
                              <button type="button" className="sfd-triangle"
                                aria-label={ouverts.has(f.id) ? `Replier ${f.nom}` : `Déplier ${f.nom}`}
                                aria-expanded={ouverts.has(f.id)}
                                onClick={(e) => { e.stopPropagation(); basculerDepliage(f); }}>
                                <span aria-hidden="true">{ouverts.has(f.id) ? '▾' : '▸'}</span>
                              </button>
                            ) : <span className="sfd-triangle sfd-triangle--vide" aria-hidden="true" />}
                            <span className="sfd-icone" aria-hidden="true">{iconeEntree(f)}</span>
                            <span className="sfd-nom" title={f.nom}>{f.nom}</span>
                            {deja && <span className="sfd-ajoute">✓ ajouté</span>}
                          </span>
                          <span className="sfd-col-modifie">{dateFinder(f.modifieLe)}</span>
                          <span className="sfd-col-taille">{tailleFinder(f.tailleOctets, f.dossier)}</span>
                          {/* 🔴 LE TYPE DIT LA VÉRITÉ : « Fichier système Mac », et non « PDF » — car c'en est un
                              qui n'en est pas un. C'est le mot qui évite de le joindre en croyant bien faire. */}
                          <span className="sfd-col-type">{systeme ? MOT_FICHIER_SYSTEME : motType(f)}</span>

                          {/* ══ 🔴 LES ACTIONS DE LIGNE, EN ICÔNES DISCRÈTES AU SURVOL ═══════════════════════════
                              Elles étaient trois liens ROUGES permanents sur chaque ligne : la liste en était
                              illisible, et rien ne ressemblait moins au Finder. Elles restent TOUTES disponibles,
                              mais elles n'apparaissent qu'au survol (et au focus clavier), avec une infobulle.
                              🔴🔴 « Visualiser » et « Joindre » N'EXISTENT PAS là où la lecture est refusée — le
                              motif est affiché une fois, en tête de liste. « Insérer un lien » reste : il ne lit rien. */}
                          {!f.dossier && (
                            <span className="sfd-gestes" onClick={(e) => e.stopPropagation()}>
                              {lisible && (
                                <button type="button" className="sfd-geste" title="Visualiser"
                                  aria-label={`Visualiser ${f.nom}`}
                                  onFocus={() => amorcer(f, lisible)}
                                  onClick={() => visualiser(f, lisible)}>
                                  <span aria-hidden="true">👁</span>
                                </button>
                              )}
                              {lisible && !deja && (
                                <button type="button" className="sfd-geste" title="Joindre au message"
                                  aria-label={`Joindre ${f.nom}`} onClick={() => void joindre(f)}>
                                  <span aria-hidden="true">📎</span>
                                </button>
                              )}
                              <button type="button" className="sfd-geste" title="Insérer un lien"
                                aria-label={`Insérer un lien vers ${f.nom}`} onClick={() => lier(f)}>
                                <span aria-hidden="true">🔗</span>
                              </button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {fenetre.apres > 0 && <div style={{ height: fenetre.apres }} aria-hidden="true" />}
                  {/* 🔴 UNE LISTE INCOMPLÈTE LE DIT. Taire la troncature ferait conclure qu'un dossier n'existe
                      pas alors qu'il est simplement au-delà de la borne — la faute d'avant ce lot. */}
                  {listing !== null && listing.tronque && (
                    <p className="gst-tronc sfd-vide" role="status">
                      Ce dossier contient plus d’entrées que cette liste n’en affiche. Utilisez la recherche (🔍)
                      pour atteindre celles qui manquent.
                    </p>
                  )}
                </>
              )}
            </div>
          </main>
        </div>

        {/* ══ LE PIED : la zone de dépôt, le compteur, la sélection multiple, et « Terminé » ═══════════════════ */}
        <div className="sfd-pied">
          {/* ══ 🔴 « PIÈCES JOINTES » — LA ZONE DE DÉPÔT DU MESSAGE, RAMENÉE ICI ══════════════════════════════
              ⚠️ ELLE EST DANS CETTE FENÊTRE, et non sur le brouillon : ce navigateur est une modale qui RECOUVRE
              le message — pendant un glisser, la zone du mail est littéralement derrière. La ramener ici est la
              seule façon de la rendre atteignable. Elle n'écrit rien dans le Drive : elle joint, comme le 📎. */}
          {joindreOk && (
            <div className={`sfd-depot${survole === 'pj' ? ' sfd-depot--vise' : ''}`}
              onDragOver={(e) => {
                if (glisse === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (survole !== 'pj') setSurvole('pj');
              }}
              onDragLeave={() => quitterCible('pj')}
              onDrop={deposerSurPiecesJointes}>
              <span aria-hidden="true">📎</span> Pièces jointes — déposez ici pour joindre au message
            </div>
          )}
          <p className={`sfd-compteur${ajoutes.length === 0 ? ' sfd-compteur--vide' : ''}`} role="status">
            {ajoutes.length === 0
              ? 'Aucune pièce ajoutée — la fenêtre reste ouverte, prenez-en autant que nécessaire.'
              : `${ajoutes.length} pièce${ajoutes.length > 1 ? 's' : ''} ajoutée${ajoutes.length > 1 ? 's' : ''} au message.`}
          </p>
          {/* 🔴 « JOINDRE LA SÉLECTION » : la suite naturelle du Cmd+clic et du Maj+clic. Absent là où la lecture
              du contenu est refusée, comme les boutons de ligne. */}
          {joindreOk && selectionJoignable.length > 1 && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { for (const f of selectionJoignable) void joindre(f); }}>
              Joindre la sélection ({selectionJoignable.length})
            </button>
          )}
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer}>Terminé</button>
        </div>
      </div>
    </div>

    {/* ══ 🔴🔴 LE MENU CONTEXTUEL — UNIQUEMENT LES ACTIONS QUE L'APPLICATION SAIT FAIRE ════════════════════════
        Jamais Renommer, Placer dans la corbeille, Supprimer, Déplacer, Partager ni Dupliquer : l'application ne
        fait rien de tout cela, et le module pur qui construit ce menu ne connaît même pas ces mots. */}
    {menu !== null && (
      <>
        <div className="sfd-menu-voile" role="presentation" onClick={() => setMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
        <ul className="sfd-menu" role="menu" style={{ left: menu.x, top: menu.y }}
          aria-label={`Actions sur ${menu.entree.nom}`}>
          {entreesDuMenu(menu.entree).map((e) => (
            <li key={e.action} role="none">
              <button type="button" role="menuitem" className="sfd-menu-item"
                disabled={e.motifInactif !== null} title={e.motifInactif ?? undefined}
                onClick={() => agirMenu(e.action, menu.entree)}>
                {e.libelle}
              </button>
              {e.motifInactif !== null && <p className="sfd-menu-motif">{e.motifInactif}</p>}
            </li>
          ))}
        </ul>
      </>
    )}

    {/* ══ 🔴🔴 L'APERÇU — FRÈRE DU NAVIGATEUR, PAS SON ENFANT ═══════════════════════════════════════════════════
        On revient exactement au même dossier, avec la même recherche, le même compteur et les mêmes « ✓ ajouté » :
        le navigateur n'est pas démonté, donc son état ne bouge pas — fermer l'aperçu ne « revient » nulle part, on
        n'était jamais parti. Et dedans, ses Échap et ses clics seraient remontés jusqu'à lui : une croix qui ferme
        deux fenêtres au lieu d'une. */}
    {aVoir !== null && listing !== null && (
      <ApercuFichierDrive
        fichier={aVoir}
        voisinage={[...listing.dossiers, ...listing.fichiers].map((f) => ({
          id: f.id, nom: f.nom, typeMime: f.typeMime, dossier: f.dossier,
          parentId: f.parentId ?? (listing.recherche ? null : dossierCourant?.id ?? null),
        }))}
        joindreAutorise={listing.joindreAutorise}
        estDeja={(id) => ajoutes.includes(id)}
        onJoindre={(f) => {
          void joindre({
            id: f.id, nom: f.nom, typeMime: f.typeMime, tailleOctets: null,
            modifieLe: null, lien: f.lien, dossier: false,
          });
        }}
        onFermer={() => setAVoir(null)} />
    )}
    </>
  );
}

export const CSS_SELECTEUR_FICHIER = `
/* ══ 🔴 LOT DRIVE-FACON-FINDER — LA FENETRE, PRESQUE PLEIN ECRAN ET REDIMENSIONNABLE ═══════════════════════════
   Le modele est une fenetre du Finder en presentation LISTE : large, dense, avec sa barre de titre, sa barre
   d'outils, sa barre laterale et ses colonnes. La generosite de la taille n'est pas un confort : dans un Drive de
   quinze mille dossiers, une fenetre de 640 px obligeait a defiler pour lire dix lignes. */
.sfd-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:2vh 2vw;
  background:color-mix(in srgb, var(--color-svv-ink) 38%, transparent)}
.sfd{display:flex;flex-direction:column;width:min(1400px,96vw);height:min(920px,94vh);min-width:520px;min-height:360px;
  overflow:hidden;resize:both;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.7rem;
  box-shadow:0 10px 40px color-mix(in srgb, var(--color-svv-ink) 30%, transparent)}
.sfd:focus{outline:none}

/* ── LA BARRE DE TITRE, avec sa croix (elle manquait) ─────────────────────────────────────────────────────── */
.sfd-barre-titre{display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;min-height:44px;flex:0 0 auto;
  background:var(--color-svv-ink);color:var(--color-svv-surface)}
.sfd-titre{flex:1 1 auto;min-width:0;margin:0;font-size:.9rem;font-weight:700;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-croix{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;min-width:32px;
  padding:0;font:inherit;font-size:.95rem;color:inherit;background:transparent;border:0;border-radius:.3rem;cursor:pointer}
.sfd-croix:hover{background:color-mix(in srgb, var(--color-svv-surface) 18%, transparent)}
.sfd-croix:focus-visible{outline:2px solid var(--color-svv-surface);outline-offset:-2px}

/* ── LA BARRE D'OUTILS ────────────────────────────────────────────────────────────────────────────────────── */
.sfd-outils{display:flex;align-items:center;gap:8px;padding:6px 10px;flex:0 0 auto;flex-wrap:wrap;
  background:var(--color-svv-field);border-bottom:1px solid var(--color-svv-line)}
.sfd-fleches{display:flex;gap:2px;flex:0 0 auto}
.sfd-outil{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;
  font:inherit;font-size:1rem;line-height:1;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line);border-radius:.35rem;cursor:pointer}
.sfd-outil:hover:not(:disabled){background:var(--color-svv-field)}
.sfd-outil:disabled{opacity:.4;cursor:default}
.sfd-outil:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-ariane{display:flex;align-items:center;flex-wrap:wrap;gap:2px;flex:1 1 12rem;min-width:0;font-size:.82rem}
.sfd-ariane-pas{display:inline-flex;align-items:center;gap:2px;min-width:0}
.sfd-chevron{color:var(--color-svv-muted)}
.sfd-ariane-bouton{max-width:16rem;padding:2px 6px;font:inherit;font-size:.82rem;color:var(--color-svv-ink);
  background:transparent;border:0;border-radius:.3rem;cursor:pointer;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-ariane-bouton:hover{background:var(--color-svv-surface)}
.sfd-ariane-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-outils-droite{display:flex;align-items:center;gap:4px;margin-left:auto;flex:0 0 auto}
.sfd-plus{position:relative}
.sfd-menu--outils{position:absolute;right:0;top:34px;left:auto}

/* ── LE CORPS : barre laterale + liste ────────────────────────────────────────────────────────────────────── */
.sfd-corps{display:grid;grid-template-columns:210px 1fr;flex:1 1 auto;min-height:0}
.sfd-cote{overflow-y:auto;padding:8px 6px;background:var(--color-svv-field);border-right:1px solid var(--color-svv-line)}
.sfd-cote-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.sfd-cote-item{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 8px;
  font:inherit;font-size:.82rem;text-align:left;color:var(--color-svv-ink);background:transparent;border:0;
  border-radius:.35rem;cursor:pointer}
.sfd-cote-item:hover{background:var(--color-svv-surface)}
.sfd-cote-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.sfd-cote-icone{flex:0 0 auto}
.sfd-cote-mots{display:flex;flex-direction:column;min-width:0}
.sfd-cote-libelle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-cote-detail{font-size:.72rem;color:var(--color-svv-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.sfd-vue{display:flex;flex-direction:column;min-width:0;min-height:0}

/* ── LES COLONNES : memes largeurs pour l'en-tete et les lignes ───────────────────────────────────────────── */
.sfd-entetes,.sfd-ligne{display:grid;grid-template-columns:minmax(0,1fr) 11rem 6rem 9rem;align-items:center;gap:8px}
.sfd-entetes{flex:0 0 auto;padding:0 10px;background:var(--color-svv-field);
  border-bottom:1px solid var(--color-svv-line-strong)}
.sfd-entete{display:flex;align-items:center;gap:4px;min-height:26px;padding:0 4px;
  font:inherit;font-size:.74rem;font-weight:700;text-align:left;color:var(--color-svv-muted);
  background:transparent;border:0;border-right:1px solid var(--color-svv-line);cursor:pointer}
.sfd-entete:last-child{border-right:0}
.sfd-entete:hover{color:var(--color-svv-ink)}
.sfd-entete--actif{color:var(--color-svv-ink)}
.sfd-fleche-tri{font-size:.62rem}

.sfd-lignes{flex:1 1 auto;min-height:0;overflow-y:auto;padding:0 10px 8px}
.sfd-liste,.sfd-recents,.sfd-squelette{list-style:none;margin:0;padding:0}

/* ── UNE LIGNE : fine, alternee, surlignee au survol et a la selection ────────────────────────────────────── */
.sfd-ligne{min-height:28px;padding:0 6px;font-size:.82rem;color:var(--color-svv-ink);
  border-bottom:1px solid color-mix(in srgb, var(--color-svv-line) 55%, transparent);cursor:default;
  user-select:none;position:relative}
.sfd-liste>.sfd-ligne:nth-child(even){background:color-mix(in srgb, var(--color-svv-field) 55%, transparent)}
.sfd-ligne:hover{background:var(--color-svv-field)}
/* La SELECTION est aux couleurs de la charte, et elle porte un MOT pour le lecteur d'ecran (aria-selected). */
.sfd-ligne--choisie,.sfd-liste>.sfd-ligne--choisie:nth-child(even){
  background:color-mix(in srgb, var(--color-svv-red) 16%, transparent);
  box-shadow:inset 2px 0 0 var(--color-svv-red)}
.sfd-ligne--recent{display:grid;width:100%;text-align:left;font:inherit;font-size:.82rem;border:0;
  background:transparent;cursor:pointer}
.sfd-ligne--recent:disabled{cursor:default;color:var(--color-svv-muted)}
.sfd-ligne--squelette{background:linear-gradient(90deg,
  color-mix(in srgb, var(--color-svv-line) 40%, transparent) 25%,
  color-mix(in srgb, var(--color-svv-line) 18%, transparent) 50%,
  color-mix(in srgb, var(--color-svv-line) 40%, transparent) 75%);
  border-radius:.25rem;margin:3px 0;height:22px}
@media (prefers-reduced-motion: no-preference){
  .sfd-ligne--squelette{background-size:200% 100%;animation:sfd-respire 1.1s linear infinite}
  @keyframes sfd-respire{from{background-position:200% 0}to{background-position:-200% 0}}
}

.sfd-col-nom{display:flex;align-items:center;gap:4px;min-width:0}
.sfd-triangle{display:inline-flex;align-items:center;justify-content:center;width:18px;height:22px;min-width:18px;
  padding:0;font:inherit;font-size:.7rem;color:var(--color-svv-muted);background:transparent;border:0;cursor:pointer}
.sfd-triangle:hover{color:var(--color-svv-ink)}
.sfd-triangle--vide{cursor:default}
.sfd-icone{flex:0 0 auto}
.sfd-nom{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-col-modifie,.sfd-col-taille,.sfd-col-type{font-size:.76rem;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sfd-col-taille{text-align:right}
.sfd-ajoute{flex:0 0 auto;font-size:.72rem;font-weight:700;color:var(--color-svv-green, var(--color-svv-ink))}

/* ── LES ACTIONS DE LIGNE : discretes, au survol, avec infobulle ──────────────────────────────────────────── */
.sfd-gestes{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:2px;
  opacity:0;pointer-events:none;background:var(--color-svv-surface);border-radius:.3rem;padding:1px}
.sfd-ligne:hover .sfd-gestes,.sfd-ligne:focus-within .sfd-gestes,.sfd-ligne--choisie .sfd-gestes{
  opacity:1;pointer-events:auto}
.sfd-geste{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;
  font:inherit;font-size:.8rem;line-height:1;background:transparent;border:0;border-radius:.25rem;cursor:pointer}
.sfd-geste:hover{background:var(--color-svv-field)}
.sfd-geste:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}

/* ── LE MENU CONTEXTUEL ───────────────────────────────────────────────────────────────────────────────────── */
.sfd-menu-voile{position:fixed;inset:0;z-index:80}
.sfd-menu{position:fixed;z-index:81;list-style:none;margin:0;padding:4px;min-width:200px;max-width:280px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.5rem;
  box-shadow:0 6px 24px color-mix(in srgb, var(--color-svv-ink) 28%, transparent)}
.sfd-menu-item{display:block;width:100%;min-height:30px;padding:5px 10px;font:inherit;font-size:.82rem;
  text-align:left;color:var(--color-svv-ink);background:transparent;border:0;border-radius:.3rem;cursor:pointer}
.sfd-menu-item:hover:not(:disabled){background:var(--color-svv-field)}
.sfd-menu-item:disabled{color:var(--color-svv-muted);cursor:default}
.sfd-menu-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* Un refus se DIT : l'entree eteinte porte son motif, en petit, sous elle. */
.sfd-menu-motif{margin:0 0 4px;padding:0 10px;font-size:.7rem;color:var(--color-svv-muted)}

/* ── LE PIED ──────────────────────────────────────────────────────────────────────────────────────────────── */
.sfd-pied{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 12px;flex:0 0 auto;
  background:var(--color-svv-field);border-top:1px solid var(--color-svv-line)}
.sfd-compteur{flex:1 1 14rem;margin:0;font-size:.78rem;color:var(--color-svv-ink)}
.sfd-compteur--vide{color:var(--color-svv-muted)}

/* ── CE QUI RESTE DES LOTS PRECEDENTS ─────────────────────────────────────────────────────────────────────── */
.sfd-champ{display:flex;flex-direction:column;gap:3px;padding:8px 12px 0;flex:0 0 auto}
.sfd-saisie{width:100%;min-height:38px;padding:.4rem .6rem;font-size:16px;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.4rem}
.sfd-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.sfd-retour{align-self:flex-start;margin:6px 12px 0;flex:0 0 auto}
.sfd-interdit{margin:6px 12px 0;padding:6px 10px;flex:0 0 auto;font-size:.78rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:0 .35rem .35rem 0}
.sfd-creer-corps{display:flex;flex-direction:column;gap:6px;padding:8px 12px;flex:0 0 auto}
.sfd-creer-chemin{display:flex;flex-direction:column;gap:2px;margin:0;min-width:0}
.sfd-creer-nom{font-size:.86rem;font-weight:700;color:var(--color-svv-ink)}
.sfd-mention{font-size:.74rem;color:var(--color-svv-muted)}
.sfd-mention--bloc{display:block}
.sfd-creer-boutons{display:flex;gap:8px;flex-wrap:wrap}
.sfd-creer-fait{margin:6px 12px 0;font-size:.8rem;color:var(--color-svv-ink);flex:0 0 auto}
.sfd-vide{margin:14px 6px}

/* ══ 🔴 LOT DRIVE-DEPLACER — GLISSER, COUPER/COLLER, BANDEAU, FICHIERS SYSTEME ══════════════════════════════
   ⚠️ AUCUN BACKTICK dans ce bloc : il vit dans un litteral de gabarit, et un seul backtick couperait le fichier
   en deux au milieu d'une regle CSS. Le piege s'est deja referme trois fois sur ce module.
   ⚠️ AUCUNE COULEUR EN DUR : uniquement les jetons --color-svv-*, pour que le sombre suive tout seul. */

/* ── LE FANTOME d'une selection multiple : il dit COMBIEN on tient ──────────────────────────────────────── */
.sfd-fantome{position:fixed;top:-1000px;left:-1000px;z-index:-1;padding:4px 10px;border-radius:.4rem;
  font:600 .8rem/1.2 system-ui,sans-serif;color:var(--color-svv-surface);background:var(--color-svv-red)}

/* ── LA CIBLE ALLUMEE : dossier de la liste, entree laterale, pas du fil d'Ariane ───────────────────────── */
.sfd-ligne--vise{outline:2px solid var(--color-svv-red);outline-offset:-2px;
  background:color-mix(in srgb, var(--color-svv-red) 12%, transparent)}
.sfd-cote-item--vise,.sfd-ariane-bouton--vise{outline:2px solid var(--color-svv-red);outline-offset:-2px;
  background:color-mix(in srgb, var(--color-svv-red) 12%, transparent)}

/* ── UNE LIGNE COUPEE : estompee JUSQU'AU COLLAGE. Elle n'a pas bouge, et Echap rend la coupe. ──────────── */
.sfd-ligne--coupee{opacity:.45}

/* ── UN FICHIER SYSTEME MAC (« ._ ») : grise, et son type le dit. Il reste affiche, exprès. ─────────────── */
.sfd-ligne--systeme{color:var(--color-svv-muted)}
.sfd-ligne--systeme .sfd-nom{font-style:italic}

/* ── LE BANDEAU « N element(s) deplace(s) vers X — Annuler », dix secondes ──────────────────────────────── */
.sfd-bandeau{display:flex;align-items:center;gap:10px;margin:6px 12px 0;padding:7px 10px;flex:0 0 auto;
  font-size:.8rem;color:var(--color-svv-ink);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line-strong);border-left:3px solid var(--color-svv-red);
  border-radius:0 .35rem .35rem 0}
.sfd-bandeau-mot{flex:1 1 auto;min-width:0}
.sfd-bandeau-annuler{flex:0 0 auto;padding:3px 10px;font:600 .78rem/1.2 inherit;cursor:pointer;
  color:var(--color-svv-surface);background:var(--color-svv-red);border:0;border-radius:.3rem}
.sfd-bandeau-annuler:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:1px}
.sfd-bandeau-croix{flex:0 0 auto;padding:0 4px;font-size:.9rem;line-height:1;cursor:pointer;
  color:var(--color-svv-muted);background:none;border:0}

/* ── LA ZONE « PIECES JOINTES » DU PIED : la cible du mail, ramenee dans la fenetre modale ──────────────── */
.sfd-depot{flex:1 1 16rem;padding:7px 10px;font-size:.78rem;color:var(--color-svv-muted);
  background:var(--color-svv-surface);border:1px dashed var(--color-svv-line-strong);border-radius:.4rem}
.sfd-depot--vise{color:var(--color-svv-ink);border-style:solid;border-color:var(--color-svv-red);
  background:color-mix(in srgb, var(--color-svv-red) 12%, transparent)}

/* ⚠️ UN GLISSER NE SE FAIT PAS AU DOIGT sur un telephone : la zone de depot y devient un simple rappel, et
   tous les gestes restent accessibles par le menu contextuel (appui long) et par « Joindre la selection ». */
@media (max-width: 760px){
  .sfd-depot{flex:1 1 100%}
}

/* ⚠️ SUR TELEPHONE, la barre laterale passe en rangee au-dessus de la liste, et les colonnes de droite
   disparaissent : quatre colonnes sur 380 px ne se lisent pas. Le NOM et les gestes restent. */
@media (max-width: 760px){
  .sfd{width:100%;height:100%;border-radius:0;resize:none}
  .sfd-corps{grid-template-columns:1fr;grid-template-rows:auto 1fr}
  .sfd-cote{border-right:0;border-bottom:1px solid var(--color-svv-line)}
  .sfd-cote-liste{flex-direction:row;flex-wrap:wrap}
  .sfd-entetes,.sfd-ligne{grid-template-columns:minmax(0,1fr) 5rem}
  .sfd-col-modifie,.sfd-col-type,.sfd-entete.sfd-col-modifie,.sfd-entete.sfd-col-type{display:none}
}
`;
