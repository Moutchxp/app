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
import {
  ariane as arianeDuChemin, aplatir, avancer, cheminCourant, cliquerLigne, COLONNES, dateFinder,
  dossierDuChemin, fenetreVisible, flecheTri, HAUTEUR_LIGNE, HISTORIQUE_DEPART,
  iconeEntree, menuDossier, menuFichier, motType, naviguerVers, peutAvancer, peutReculer, reculer,
  SELECTION_VIDE, selectionSuivante, tailleFinder, titreDuChemin, TRI_DEFAUT,
  type ActionMenu, type Chemin, type Colonne, type EntreeDrive, type EntreeMenu, type Historique,
  type Selection, type Tri,
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
  const champ = useRef<HTMLInputElement | null>(null);
  const scene = useRef<HTMLDivElement | null>(null);
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
    if (!autorise || f.dossier) return;
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
     LE CLAVIER — flèches, Entrée, barre d'espace, Échap
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
      if (creation.c !== 'ferme') { e.preventDefault(); oublierCreation(); return; }
      e.stopPropagation();
      onFermer();
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

  const entreesDuMenu = (f: Fichier): EntreeMenu[] => f.dossier
    ? menuDossier({
      creerAutorise: listing?.creerAutorise === true,
      motifCreation: listing?.motifCreation ?? null,
      avecLien: (f.lien ?? '') !== '',
    })
    : menuFichier({
      joindreAutorise: listing?.joindreAutorise === true,
      motifRefus: listing?.motifRefus ?? null,
      dejaAjoute: ajoutes.includes(f.id),
      avecLien: (f.lien ?? '') !== '',
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

  const laterales = [
    ...prioritaires.map((d) => ({
      cle: `bien:${d.dossierId}`, icone: '🏠', libelle: titreDossierPrioritaire(d),
      // ⚠️ LE NOMBRE N'EST DIT QUE S'IL Y EN A PLUSIEURS : « 1 bien » est du bruit. Il l'était déjà avant ce lot,
      //   et le taire ici ferait croire qu'un dossier ne porte qu'un seul logement.
      detail: mentionNbBiens(d) === null ? d.libelle : `${d.libelle} · ${mentionNbBiens(d)}`,
      aller: () => entrerDepuisRacine({ id: d.dossierId, nom: d.dossierNom || d.libelle }),
    })),
    ...(recents?.disponible === true && recentsDrive.length > 0
      ? [{ cle: 'recents', icone: '🕘', libelle: 'Récents', detail: null as string | null,
        aller: () => { setMontrerRecents(true); setSelection(SELECTION_VIDE); } }]
      : []),
    { cle: 'mon_drive', icone: '💾', libelle: 'Mon Drive', detail: null as string | null,
      aller: () => entrerDepuisRacine({ id: 'root', nom: 'Mon Drive' }) },
    { cle: 'drives', icone: '👥', libelle: 'Drives partagés', detail: null as string | null,
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
      <div className="sfd" role="dialog" aria-modal="true" aria-labelledby="sfd-titre"
        onKeyDown={surTouche} tabIndex={-1}>

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
                <button type="button" className="sfd-ariane-bouton" onClick={() => remonter(e.index)}>{e.nom}</button>
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

        {/* ══ LE CORPS : barre latérale + liste ═════════════════════════════════════════════════════════════════ */}
        <div className="sfd-corps">
          <aside className="sfd-cote" aria-label="Emplacements">
            <ul className="sfd-cote-liste">
              {laterales.map((l) => (
                <li key={l.cle}>
                  <button type="button" className="sfd-cote-item" onClick={l.aller}>
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
                      return (
                        <li key={f.id} role="option" aria-selected={choisie}
                          className={`sfd-ligne${choisie ? ' sfd-ligne--choisie' : ''}`}
                          style={{ paddingLeft: 6 + profondeur * 16 }}
                          onMouseEnter={() => {
                            if (f.dossier) precharger(f.id);
                            else amorcer(f, joindreOk);
                          }}
                          onClick={(e) => setSelection((s) => cliquerLigne(s, f.id, ordre,
                            { cmd: e.metaKey || e.ctrlKey, maj: e.shiftKey }))}
                          /* 🔴 DOUBLE-CLIC : un dossier s'ouvre, un fichier se visualise — comme dans le Finder. */
                          onDoubleClick={() => {
                            if (f.dossier) { ouvrirDossier(f); return; }
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
                          <span className="sfd-col-type">{motType(f)}</span>

                          {/* ══ 🔴 LES ACTIONS DE LIGNE, EN ICÔNES DISCRÈTES AU SURVOL ═══════════════════════════
                              Elles étaient trois liens ROUGES permanents sur chaque ligne : la liste en était
                              illisible, et rien ne ressemblait moins au Finder. Elles restent TOUTES disponibles,
                              mais elles n'apparaissent qu'au survol (et au focus clavier), avec une infobulle.
                              🔴🔴 « Visualiser » et « Joindre » N'EXISTENT PAS là où la lecture est refusée — le
                              motif est affiché une fois, en tête de liste. « Insérer un lien » reste : il ne lit rien. */}
                          {!f.dossier && (
                            <span className="sfd-gestes" onClick={(e) => e.stopPropagation()}>
                              {joindreOk && (
                                <button type="button" className="sfd-geste" title="Visualiser"
                                  aria-label={`Visualiser ${f.nom}`}
                                  onFocus={() => amorcer(f, joindreOk)}
                                  onClick={() => visualiser(f, joindreOk)}>
                                  <span aria-hidden="true">👁</span>
                                </button>
                              )}
                              {joindreOk && !deja && (
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

        {/* ══ LE PIED : le compteur, la sélection multiple, et « Terminé » ══════════════════════════════════════ */}
        <div className="sfd-pied">
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
