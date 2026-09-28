'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formaterTaille } from '../../../../lib/gestion/ecran';
// LOT DRIVE-DOSSIER-DU-BIEN — le dossier du propriétaire du bien rattaché, proposé en première position.
import {
  dossiersPrioritaires, mentionNbBiens, titreDossierPrioritaire, type BienDuMail, type DossierPrioritaire,
} from '../../../../lib/gestion/dossierDuBien';
// LOT DRIVE-VISUALISER-ET-DOSSIERS — voir un fichier sans le joindre, et créer un dossier là où l'on est.
import { ApercuFichierDrive, adresseApercu, type FichierAVoir } from './ApercuFichierDrive';
import { sorteApercu } from '../../../../lib/gestion/apercuDrive';
import { NOM_DOSSIER_MAX } from '../../../../lib/gestion/dossierNouveau';

/**
 * LOT REDACTION-GMAIL — CHOISIR UN FICHIER DU DRIVE, POUR LE JOINDRE OU POUR EN INSÉRER LE LIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 DEUX GESTES, DEUX RÉGIMES, ET LA DIFFÉRENCE N'EST PAS UNE NUANCE.
 *   · « Insérer un lien » ne lit RIEN : il pose l'adresse Drive et le nom dans le message. Le destinataire devra
 *     s'authentifier chez Google, qui appliquera SES droits. → proposé PARTOUT ;
 *   · « Joindre » télécharge les octets et les met dans un mail qui part sur l'Internet ouvert. → JAMAIS sous
 *     « Documents clients scannés ».
 *
 * Sous ce dossier, le bouton « Joindre » N'EXISTE PAS et l'écran DIT pourquoi, avec la sortie (le lien). Un bouton
 * grisé sans explication se lit comme une panne ; un bouton absent sans explication se lit comme un oubli.
 *
 * ⚠️ L'ÉCRAN N'EST PAS LA BARRIÈRE. C'est la route qui refuse (`/api/admin/gestion/drive/fichiers`), en remontant
 * la chaîne des parents — un écran se modifie, une route non. Ici, on explique ; là-bas, on protège.
 *
 * 🔒 LE NAVIGATEUR NE PARLE JAMAIS À GOOGLE : il demande à l'application, qui relit le droit et interroge le Drive
 * avec un jeton qui ne quitte pas le serveur. Navigation par DOSSIER, un niveau à la fois — le Drive fait ~15 000
 * dossiers et 13 niveaux (mesuré le 25/09/2026) : on ne charge jamais l'arborescence entière.
 *
 * ═══ 🔴 LOT EDITEUR-PJ — LA FENÊTRE NE SE FERME PLUS À CHAQUE PIÈCE ══════════════════════════════════════════════
 * Avant, un clic sur « Joindre » ajoutait le fichier ET refermait tout. Joindre trois pièces prises dans deux
 * dossiers demandait donc de rouvrir le Drive trois fois et de redescendre treize niveaux deux fois. Le geste le
 * plus courant était le plus coûteux.
 *
 * Désormais : chaque « Joindre » ajoute, la fenêtre RESTE, et le dossier courant reste affiché. Un compteur dit
 * combien de pièces ont été ajoutées, les fichiers déjà pris le DISENT, et « Terminé » ferme quand on a fini.
 *
 * 🔴 PAS DE DOUBLON : un fichier déjà ajouté ne peut pas l'être une seconde fois — son bouton devient une mention.
 * Rien n'empêchait, avant, d'ajouter deux fois le même bail et de l'envoyer en double.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Fichier {
  id: string;
  nom: string;
  typeMime: string;
  tailleOctets: number | null;
  modifieLe: string | null;
  lien: string | null;
  dossier: boolean;
  /**
   * 🔴 LOT APERCU-RAPIDE — LE DOSSIER QUI CONTIENT CE FICHIER. Il borne « Précédent / Suivant » de l'aperçu.
   * Dans une liste de dossier il est le même pour tous ; dans une recherche, il est la barrière.
   */
  parentId?: string | null;
}

type Vue =
  | { v: 'charge' }
  | {
    v: 'ok'; fichiers: Fichier[]; joindreAutorise: boolean; motifRefus: string | null; recherche: boolean;
    /** 🔴 LES DOSSIERS TROUVÉS, séparés des fichiers : ils s'affichent en PREMIER (demande d'Arno). */
    dossiers: Fichier[];
    /**
     * 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — peut-on créer un dossier ICI, et sinon pourquoi.
     *
     * ⚠️ LES DEUX VIENNENT DE LA MÊME RÉPONSE QUE LE CONTENU, jamais d'un appel à part : une sonde de schéma voyage
     * avec la donnée qu'elle conditionne (règle tirée du défaut du 28/09/2026, où un `false` par défaut avait fait
     * disparaître une fonction pourtant en place, sans qu'aucune erreur ne s'affiche).
     */
    creerAutorise: boolean;
    motifCreation: string | null;
  }
  | { v: 'indisponible'; message: string };

/**
 * ══ 🔴 L'ÉTAT DE « + NOUVEAU DOSSIER » — quatre temps, et le troisième est celui qui protège. ═════════════════════
 *
 * `ferme` → `saisie` (on tape un nom) → `confirme` (le SERVEUR a rendu le chemin complet) → création.
 *
 * 🔴 LE CHEMIN DE LA CONFIRMATION VIENT DU SERVEUR, jamais du fil d'Ariane affiché. Demande d'Arno : « une
 * confirmation affiche le nom et le chemin complet ». Le recomposer ici le ferait dire par l'écran — c'est-à-dire
 * par la partie qu'on vérifie — et il serait faux précisément dans le cas qui compte : quand on est entré dans un
 * dossier trouvé par une recherche, où l'écran ne connaît qu'un maillon du chemin.
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
   *
   * Avant, « Joindre » faisait : le navigateur demande les octets, le serveur les tire du Drive, les renvoie en
   * base64, le navigateur les repousse. Trois allers-retours pendant lesquels l'écran était BLOQUÉ. Pour six
   * pièces, six attentes — le constat d'Arno.
   *
   * Désormais on ne passe que l'IDENTIFIANT. Le serveur lit les métadonnées (un appel court), inscrit la pièce, et
   * tire les octets en tâche de fond. Le « Joindre » suivant est cliquable immédiatement.
   */
  drive?: { fichierId: string; nom: string; dossierId: string | null; dossierNom: string | null };
  /** Le lien inséré : rien n'a été lu du contenu. */
  lien?: { nom: string; url: string };
}

export function SelecteurFichierDrive({ onChoisir, onFermer, filId = null, lots = [] }: {
  /** Ajoute la pièce au brouillon. ⚠️ NE FERME PAS la fenêtre : c'est « Terminé » qui ferme. */
  onChoisir: (c: ChoixFichierDrive) => void | Promise<void>;
  onFermer: () => void;
  /**
   * 🔴 LOT DRIVE-DOSSIER-DU-BIEN — de quoi savoir à quel(s) bien(s) ce mail est relié.
   *
   * `filId` : l'échange auquel on répond — ses rattachements vivants donnent les biens.
   * `lots`  : les lots choisis À L'ÉCRITURE (« Classer ce mail »), pour un message neuf qui n'a pas d'échange.
   *
   * Les deux absents ⇒ aucune ligne prioritaire, et le sélecteur est exactement celui d'avant ce lot.
   */
  filId?: number | null;
  lots?: readonly string[];
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  /** Le fil d'Ariane : deux dossiers « Documents » à deux endroits sont la règle, pas l'exception. */
  const [ariane, setAriane] = useState<{ id: string; nom: string }[]>([]);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /** 🔴 LES FICHIERS DÉJÀ AJOUTÉS pendant cette ouverture : par leur identifiant Drive, donc sans doublon possible. */
  const [ajoutes, setAjoutes] = useState<string[]>([]);
  const [saisie, setSaisie] = useState('');
  /** L'historique. `null` = pas encore lu ; liste vide = rien à proposer ; `disponible: false` = migration absente. */
  const [recents, setRecents] = useState<{ lignes: Recent[]; disponible: boolean } | null>(null);
  /** Le terme de la recherche d'où l'on est entré dans un dossier. `null` = on n'en vient pas. */
  const [rechercheOuverte, setRechercheOuverte] = useState<string | null>(null);
  /** 🔴 LOT DRIVE-DOSSIER-DU-BIEN — les dossiers des biens rattachés, en tête. Vide = rien à proposer. */
  const [prioritaires, setPrioritaires] = useState<DossierPrioritaire[]>([]);
  /** 🔴 LOT DRIVE-VISUALISER-ET-DOSSIERS — le fichier qu'on REGARDE. `null` = aucun aperçu ouvert. */
  const [aVoir, setAVoir] = useState<FichierAVoir | null>(null);
  const [creation, setCreation] = useState<Creation>({ c: 'ferme' });
  /** Ce qu'on annonce APRÈS une création réussie — dont le défaut de journal, s'il y en a eu un. */
  const [motDeLaCreation, setMotDeLaCreation] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);
  /**
   * ══ 🔴 LOT APERCU-RAPIDE — LE PRÉCHARGEMENT AU SURVOL ═══════════════════════════════════════════════════════
   *
   * Ce qui coûte cher à l'ouverture d'un aperçu n'est pas le document : c'est le VERDICT (remonter la chaîne des
   * parents, 1,7 à 2,4 s mesurés le 29/09/2026) et les métadonnées. Les deux sont mémorisés 60 s côté serveur.
   * Un survol suffit donc à les payer d'avance, et le clic ne trouve plus rien à attendre.
   *
   * ⚠️ `amorces` RETIENT CE QU'ON A DÉJÀ DEMANDÉ : sans elle, promener la souris sur une liste de quarante lignes
   * lancerait quarante requêtes, puis quarante de plus au retour. Un fichier n'est amorcé qu'une fois par ouverture.
   *
   * ⚠️ ET LE NOMBRE EST BORNÉ (demande d'Arno). Au-delà, on n'amorce plus : mieux vaut un aperçu qui attend un
   * tiers de seconde qu'un navigateur qui tient trente requêtes ouvertes pendant qu'on cherche autre chose.
   *
   * 🔒 AUCUN PRÉCHARGEMENT LÀ OÙ LA LECTURE EST REFUSÉE : l'appel n'est posé que sur les lignes d'un dossier où
   * `joindreAutorise` est vrai. Et même s'il partait, il ne rendrait que le refus de la route — `info` prononce le
   * MÊME verdict que les octets, et ne lit pas un seul octet du document.
   */
  const amorces = useRef<Set<string>>(new Set());
  const AMORCES_MAX = 12;
  const amorcer = useCallback((f: { id: string; typeMime: string; dossier: boolean }) => {
    if (f.dossier || sorteApercu(f.typeMime) === 'aucun') return;
    if (amorces.current.has(f.id) || amorces.current.size >= AMORCES_MAX) return;
    amorces.current.add(f.id);
    void fetch(adresseApercu(f.id, 'info'), { cache: 'no-store' }).catch(() => {});
  }, []);

  const charger = useCallback(async (dossierId: string) => {
    setVue({ v: 'charge' });
    setErreur(null);
    // Changer de dossier remet le compteur d'amorces à zéro : ce ne sont plus les mêmes fichiers.
    amorces.current.clear();
    try {
      const res = await fetch(`/api/admin/gestion/drive/fichiers?dossier=${encodeURIComponent(dossierId)}`,
        { cache: 'no-store' });
      const d = (await res.json()) as {
        etat?: string; message?: string; fichiers?: Fichier[]; joindreAutorise?: boolean; motifRefus?: string | null;
        creerAutorise?: boolean; motifCreation?: string | null;
      };
      if (d.etat !== 'ok') { setVue({ v: 'indisponible', message: d.message ?? 'Drive indisponible.' }); return; }
      setVue({
        v: 'ok', fichiers: d.fichiers ?? [], dossiers: [],
        joindreAutorise: d.joindreAutorise !== false,
        motifRefus: d.motifRefus ?? null,
        recherche: false,
        // ⚠️ `=== true` et non `!== false` : un serveur qui ne dirait rien ne doit pas laisser croire qu'on peut
        //   créer. Le défaut, pour une ÉCRITURE, est « non » — l'inverse de ce qu'on fait pour une lecture.
        creerAutorise: d.creerAutorise === true,
        motifCreation: d.motifCreation ?? null,
      });
    } catch {
      setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' });
    }
  }, []);

  useEffect(() => { void charger(''); }, [charger]);
  useEffect(() => { champ.current?.focus(); }, []);

  /**
   * ══ 🔴 LOT EDITEUR-PJ — « RÉCENTS » À L'OUVERTURE ════════════════════════════════════════════════════════════
   * Joindre une pièce, c'est presque toujours rejoindre la même, ou retourner dans le même dossier. La liste vit
   * dans NOTRE base (migration 269) : rien n'est écrit dans le Drive pour la tenir.
   *
   * ⚠️ SANS LA MIGRATION, LA SECTION N'EXISTE PAS — pas une section vide, qui se lirait comme une panne.
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
   * ══ 🔴 LOT DRIVE-DOSSIER-DU-BIEN — LE DOSSIER DU BIEN, EN PREMIÈRE POSITION ══════════════════════════════════
   *
   * Demande d'Arno : « lorsqu'un mail est déjà relié à un bien, le drive doit nous emmener directement sur le
   * dossier du bien correspondant en proposition prioritaire ».
   *
   * 🔴 AUCUN APPEL AU DRIVE POUR CELA. La correspondance est déjà en base depuis le lot 253 (le dossier du
   * propriétaire, par clé WIPPIMMO) : on ne cherche rien chez Google, et l'ouverture du sélecteur ne coûte pas
   * une requête de plus.
   *
   * ⚠️ AUCUN BIEN (message neuf sans classement, échange « Hors gestion ») ⇒ liste vide ⇒ aucune ligne. « Rien ne
   * change », mot pour mot.
   */
  useEffect(() => {
    if (filId === null && lots.length === 0) return undefined;
    let annule = false;
    void (async () => {
      try {
        const p = new URLSearchParams();
        if (filId !== null) p.set('fil', String(filId));
        if (lots.length > 0) p.set('lots', lots.join(','));
        const res = await fetch(`/api/admin/gestion/drive/dossier-du-bien?${p}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; biens?: BienDuMail[]; dossiers?: DossierPrioritaire[] };
        if (annule || d.etat !== 'ok') return;
        // ⚠️ LE REGROUPEMENT VIENT DU MODULE PUR, et le serveur l'a déjà fait : on le refait ici SEULEMENT si le
        //   serveur ne l'a pas rendu, pour qu'un ancien serveur ne fasse pas disparaître la fonction en silence.
        setPrioritaires(d.dossiers ?? dossiersPrioritaires(d.biens ?? []));
      } catch { /* un raccourci absent n'est pas une panne : le sélecteur reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lots` est un tableau littéral côté appelant : le
    //   suivre relancerait la lecture à chaque rendu. Sa CLÉ suffit, et elle ne change qu'avec son contenu.
  }, [filId, lots.join(',')]);

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
          });
        } catch { if (!annule) setVue({ v: 'indisponible', message: 'Le Drive n’a pas répondu.' }); }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [saisie]);

  const dossierCourant = ariane.at(-1) ?? null;

  /**
   * ⚠️ TOUTE NAVIGATION REFERME LA CRÉATION EN COURS. Un nom tapé pour « GESTION LOCATIVE » qui survivrait à l'entrée
   * dans un sous-dossier ferait créer au bon nom, au mauvais endroit — la faute que toute cette fonction cherche à
   * empêcher. Le mot de la dernière création, lui, part aussi : il ne vaut que pour l'endroit où il a été dit.
   */
  const oublierCreation = () => { setCreation({ c: 'ferme' }); setMotDeLaCreation(null); };

  const entrer = (f: { id: string; nom: string }) => {
    setSaisie('');
    oublierCreation();
    setAriane((a) => [...a, { id: f.id, nom: f.nom }]);
    void charger(f.id);
  };
  const remonter = (i: number) => {
    setSaisie('');
    oublierCreation();
    const coupe = ariane.slice(0, i);
    setAriane(coupe);
    void charger(coupe.at(-1)?.id ?? '');
  };

  /**
   * JOINDRE : on demande les octets. La route REFUSE si le fichier est sous le dossier interdit.
   *
   * 🔴 LA FENÊTRE NE SE FERME PAS, et le dossier courant ne bouge pas : c'est tout l'objet de ce lot. On marque
   * seulement le fichier comme ajouté, pour qu'un second clic ne l'envoie pas en double.
   */
  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — « JOINDRE » N'ATTEND PLUS RIEN ════════════════════════════════════════════
   *
   * LE CONSTAT D'ARNO : après un clic sur « Joindre », il fallait attendre la fin du téléchargement avant de
   * pouvoir sélectionner une autre pièce. Très pénible — et pour six pièces, six attentes.
   *
   * 🔴 LA PIÈCE EST MARQUÉE AJOUTÉE TOUT DE SUITE, avant même la réponse du serveur. C'est ce qui rend le clic
   * suivant immédiat. Le serveur, lui, ne fait qu'un appel court (les métadonnées) puis inscrit la ligne ; les
   * octets sont tirés derrière, en tâche de fond.
   *
   * ⚠️ ET SI LE SERVEUR REFUSE (« Documents clients scannés », document Google natif, 25 Mo dépassés), LA MARQUE
   * EST RETIRÉE et le motif s'affiche. Une marque optimiste qui resterait après un refus ferait croire qu'une
   * pièce est jointe alors qu'elle ne l'est pas — c'est-à-dire exactement le mensonge que ce lot interdit.
   *
   * ⚠️ AUCUN SABLIER, AUCUNE BARRE DE PROGRESSION : demande d'Arno. « L'utilisateur ne doit JAMAIS voir qu'une
   * pièce se télécharge encore. »
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

  /** Un « récent » du Drive : un fichier se joint, un dossier s'ouvre. */
  const ouvrirRecent = (r: Recent) => {
    if (r.sorte === 'drive_dossier') { entrer({ id: r.cle, nom: r.libelle }); return; }
    void joindre({
      id: r.cle, nom: r.libelle, typeMime: r.detail ?? '', tailleOctets: r.tailleOctets,
      modifieLe: null, lien: null, dossier: false,
    });
  };

  /**
   * ══ 🔴 LOT ENVOI-ARRIERE-PLAN — ENTRER DANS UN DOSSIER TROUVÉ, SANS PERDRE LA RECHERCHE ═════════════════════
   *
   * Demande d'Arno : « un lien ← Résultats de la recherche ramène à la liste sans perdre la saisie ». On garde
   * donc le terme DANS le fil d'Ariane, comme une étape : c'est ce qui rend le retour naturel, et ce qui laisse le
   * chemin cohérent quand on descend de deux niveaux dans le dossier trouvé.
   *
   * ⚠️ `ajoutes` ET LE COMPTEUR NE SONT PAS TOUCHÉS : ils vivent au-dessus de la navigation, donc les marques
   * « ✓ ajouté » restent justes quand on passe des résultats à un dossier puis qu'on revient.
   */
  const entrerDepuisRecherche = (f: Fichier) => {
    setRechercheOuverte(saisie.trim());
    setAriane([{ id: f.id, nom: f.nom }]);
    void charger(f.id);
  };

  /**
   * ══ 🔴 « + NOUVEAU DOSSIER », TEMPS 2 : DEMANDER LE CHEMIN AU SERVEUR. Aucune écriture encore. ════════════════
   *
   * Le serveur vérifie tout (le dossier interdit, le nom, le doublon) et rend le CHEMIN COMPLET. C'est ce chemin
   * qu'on affichera, et c'est lui qui vaut confirmation : il vient de Google, pas de notre affichage.
   */
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

  /**
   * ══ 🔴🔴 « + NOUVEAU DOSSIER », TEMPS 3 : CRÉER. La seule écriture Drive de tout l'éditeur de mail. ═══════════
   *
   * ⚠️ LE SERVEUR REVÉRIFIE TOUT. Le temps 2 est une courtoisie pour l'écran, pas une autorisation.
   *
   * 🔴 APRÈS LA CRÉATION, LE NOUVEAU DOSSIER S'OUVRE (demande d'Arno) : on y va pour y ranger quelque chose, donc
   * l'y conduire est la suite naturelle du geste — et c'est aussi la preuve visible qu'il existe.
   */
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
        etat?: string; message?: string; journalise?: boolean;
        dossier?: { id: string; nom: string };
      };
      if (d.etat !== 'ok' || !d.dossier) {
        setCreation({ ...etat, occupe: false, erreur: d.message ?? 'Le dossier n’a pas pu être créé.' });
        return;
      }
      // ⚠️ `entrer` remet la création à zéro : on pose donc le message APRÈS, sinon il serait effacé aussitôt.
      entrer({ id: d.dossier.id, nom: d.dossier.nom });
      setMotDeLaCreation(d.message ?? `Dossier « ${d.dossier.nom} » créé. Vous y êtes.`);
    } catch {
      setCreation({ ...etat, occupe: false, erreur: 'Le Drive n’a pas répondu.' });
    }
  };

  const revenirAuxResultats = () => {
    const terme = rechercheOuverte;
    setRechercheOuverte(null);
    oublierCreation();
    setAriane([]);
    // ⚠️ On repose la saisie TELLE QUELLE : c'est elle qui relance la recherche (effet temporisé ci-dessus).
    setSaisie('');
    setTimeout(() => setSaisie(terme ?? ''), 0);
  };

  const recentsDrive = (recents?.lignes ?? []).filter((r) => r.sorte !== 'locale');
  /** Les « Récents » n'ont de sens qu'à l'ouverture : à la racine, sans recherche en cours. */
  const montrerRecents = ariane.length === 0 && saisie.trim().length < 2
    && recents?.disponible === true && recentsDrive.length > 0;

  return (
    <>
    <div className="sfd-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <style>{CSS_SELECTEUR_FICHIER}</style>
      <div className="sfd" role="dialog" aria-modal="true" aria-labelledby="sfd-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFermer(); } }}>
        <h2 className="sfd-titre" id="sfd-titre">Insérer depuis Google Drive</h2>

        {/* 🔴 LE COMPTEUR : il dit ce qui a été fait, puisque la fenêtre ne se ferme plus pour le dire. Sans lui,
            on ne saurait plus combien de pièces on a prises. `role="status"` : annoncé, sans interrompre. */}
        <p className={`sfd-compteur${ajoutes.length === 0 ? ' sfd-compteur--vide' : ''}`} role="status">
          {ajoutes.length === 0
            ? 'Aucune pièce ajoutée pour l’instant — la fenêtre reste ouverte, prenez-en autant que nécessaire.'
            : `${ajoutes.length} pièce${ajoutes.length > 1 ? 's' : ''} ajoutée${ajoutes.length > 1 ? 's' : ''} au message.`}
        </p>

        <label className="sfd-champ">
          <span className="svv-label">Chercher un fichier par son nom, dans tout le Drive</span>
          <input ref={champ} className="sfd-saisie" type="search" value={saisie} autoComplete="off" maxLength={120}
            placeholder="ex. « bail 2024 », « devis plomberie »"
            onChange={(e) => {
              const v = e.target.value;
              setSaisie(v);
              // Effacer la recherche ramène au dossier où l'on était : on ne perd pas sa place.
              if (v.trim().length < 2) void charger(dossierCourant?.id ?? '');
            }} />
        </label>

        {/* 🔴 LE RETOUR AUX RÉSULTATS, demandé par Arno : on entre dans un dossier trouvé, on y joint ce qu'on
            veut, et l'on revient à la liste SANS perdre la saisie. Sans ce lien, il faudrait retaper le terme. */}
        {rechercheOuverte !== null && (
          <button type="button" className="gst-lien-bouton sfd-retour" onClick={revenirAuxResultats}>
            ← Résultats de la recherche « {rechercheOuverte} »
          </button>
        )}

        <nav className="sfd-ariane" aria-label="Chemin">
          <button type="button" className="gst-lien-bouton" onClick={() => remonter(0)}>Mon Drive</button>
          {ariane.map((e, i) => (
            <span key={e.id}>
              <span className="sfd-fleche" aria-hidden="true"> › </span>
              <button type="button" className="gst-lien-bouton" onClick={() => remonter(i + 1)}>{e.nom}</button>
            </span>
          ))}
        </nav>

        {/* ══ 🔴 « + NOUVEAU DOSSIER » — sous le chemin, parce qu'il crée DANS ce chemin ════════════════════════
            🔴🔴 LE BOUTON N'EXISTE PAS LÀ OÙ LA CRÉATION EST INTERDITE — sous « Documents clients scannés » et
            tous ses sous-dossiers, dans les résultats de recherche, à la racine du sélecteur, et tant que la
            migration 272 n'est pas appliquée. Dans ce dernier cas il est MONTRÉ, désactivé, avec son motif : la
            fonction existe et attend quelque chose, ce qui n'est pas la même information qu'une règle qui
            l'interdit. Quand c'est la RÈGLE qui interdit, le motif est déjà affiché plus haut (« 🔒 … »), et
            aligner en plus un bouton mort n'ajouterait rien. */}
        {vue.v === 'ok' && !vue.recherche && (vue.creerAutorise || vue.motifCreation !== null) && (
          <section className="sfd-creer" aria-label="Créer un dossier">
            {creation.c === 'ferme' && (
              vue.creerAutorise
                ? (
                  <button type="button" className="gst-lien-bouton sfd-creer-ouvrir"
                    onClick={() => setCreation({ c: 'saisie', nom: '', occupe: false, erreur: null })}>
                    + Nouveau dossier
                  </button>
                )
                : (
                  <p className="sfd-creer-motif">
                    <button type="button" className="gst-lien-bouton" disabled
                      title={vue.motifCreation ?? undefined}>+ Nouveau dossier</button>
                    <span className="sfd-mention sfd-mention--bloc">{vue.motifCreation}</span>
                  </p>
                )
            )}

            {/* ── TEMPS 1 : LE NOM. Entrée = continuer, comme partout ailleurs dans le module. ──────────────── */}
            {creation.c === 'saisie' && (
              <div className="sfd-creer-corps">
                <label className="sfd-champ">
                  <span className="svv-label">Nom du nouveau dossier</span>
                  <input className="sfd-saisie" type="text" value={creation.nom} autoComplete="off"
                    maxLength={NOM_DOSSIER_MAX} autoFocus disabled={creation.occupe}
                    placeholder="ex. « Travaux 2026 »"
                    onChange={(e) => setCreation({ c: 'saisie', nom: e.target.value, occupe: false, erreur: null })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void preparerDossier(creation.nom); }
                    }} />
                </label>
                {creation.erreur !== null && <p className="gst-tronc" role="alert">{creation.erreur}</p>}
                <div className="sfd-creer-boutons">
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={creation.occupe}
                    onClick={() => void preparerDossier(creation.nom)}>
                    {creation.occupe ? 'Vérification…' : 'Continuer'}
                  </button>
                  <button type="button" className="gst-lien-bouton" onClick={oublierCreation}>Annuler</button>
                </div>
              </div>
            )}

            {/* ── 🔴🔴 TEMPS 2 : LA CONFIRMATION. Le NOM et le CHEMIN COMPLET, rendus par le serveur ────────────
                C'est la seule protection contre la faute la plus probable de tout ce lot : le bon nom, au mauvais
                endroit. Deux dossiers « Documents » à deux endroits sont la règle, pas l'exception, dans un Drive
                construit à la main pendant des années. */}
            {creation.c === 'confirme' && (
              <div className="sfd-creer-corps">
                <p className="sfd-creer-chemin">
                  <span className="sfd-creer-nom">📁 {creation.nom}</span>
                  <span className="sfd-mention sfd-mention--bloc">{creation.phrase}</span>
                </p>
                {creation.erreur !== null && <p className="gst-tronc" role="alert">{creation.erreur}</p>}
                <div className="sfd-creer-boutons">
                  <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={creation.occupe}
                    onClick={() => void creerDossier(creation)}>
                    {creation.occupe ? 'Création…' : 'Créer'}
                  </button>
                  <button type="button" className="gst-lien-bouton" onClick={oublierCreation}>Annuler</button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Ce qu'on a fait, dit après coup : y compris le cas — rare mais possible — d'un journal qui a échoué. */}
        {motDeLaCreation !== null && <p className="sfd-creer-fait" role="status">{motDeLaCreation}</p>}

        {/* ══ 🔴 LOT DRIVE-DOSSIER-DU-BIEN — LE DOSSIER DU BIEN, EN TÊTE ════════════════════════════════════════
            Demande d'Arno : première ligne, en évidence, AU-DESSUS de Récents. C'est l'endroit où l'on va neuf
            fois sur dix quand on répond à un mail déjà rattaché — le mettre après les Récents obligerait à lire
            une liste pour trouver l'entrée la plus sûre.

            🔴 LA LIGNE DIT DE QUI EST LE DOSSIER. Il est rangé par PROPRIÉTAIRE, pas par logement : 58 bailleurs
            portent plusieurs lots. Annoncer « dossier du bien » tout court ferait croire à un rangement par
            logement qui n'existe pas, et l'on croirait s'être trompé de dossier en l'ouvrant.

            ⚠️ ELLE NE S'AFFICHE QUE PENDANT LA NAVIGATION ORDINAIRE : dans des résultats de recherche, elle
            n'aurait rien à voir avec ce qu'on regarde. */}
        {prioritaires.length > 0 && ariane.length === 0 && saisie.trim().length < 2 && (
          <section className="sfd-prio" aria-label="Dossier du bien">
            {prioritaires.map((d) => (
              <button key={d.dossierId} type="button" className="sfd-prio-ligne"
                onClick={() => entrer({ id: d.dossierId, nom: d.dossierNom || d.libelle })}>
                <span className="sfd-prio-titre">
                  <span aria-hidden="true">📁</span> {titreDossierPrioritaire(d)}
                </span>
                <span className="sfd-prio-bien">{d.libelle}</span>
                {/* Le nombre n'est dit QUE s'il y en a plusieurs : « 1 bien » est du bruit. */}
                {mentionNbBiens(d) !== null && <span className="sfd-mention">{mentionNbBiens(d)}</span>}
              </button>
            ))}
          </section>
        )}

        {/* ══ 🔴 « RÉCENTS » — ce qu'on a réellement joint, le plus récent en premier ═══════════════════════════ */}
        {montrerRecents && (
          <section className="sfd-recents" aria-label="Récents">
            <p className="sfd-section">Récents</p>
            <ul className="sfd-liste">
              {recentsDrive.map((r) => (
                <li key={`${r.sorte}|${r.cle}`} className="sfd-item">
                  <button type="button" className="sfd-dossier" disabled={ajoutes.includes(r.cle)}
                    onClick={() => ouvrirRecent(r)}>
                    <span aria-hidden="true">{r.sorte === 'drive_dossier' ? '📁' : '📄'}</span> {r.libelle}
                  </button>
                  {/* Le MOT dit ce que le clic fera : ouvrir n'est pas joindre. */}
                  <span className="sfd-mention">
                    {ajoutes.includes(r.cle) ? 'déjà ajouté'
                      : r.sorte === 'drive_dossier' ? 'dossier — ouvrir' : 'fichier — joindre'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {vue.v === 'charge' && <p className="gst-info" role="status">Lecture du Drive…</p>}
        {vue.v === 'indisponible' && <p className="gst-tronc" role="alert">{vue.message}</p>}
        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

        {/* 🔴🔴 LE DOSSIER INTERDIT SE DIT EN TOUTES LETTRES, avec la sortie — et AVANT la liste, pour qu'on le lise
            avant de chercher un bouton qui n'y est pas. */}
        {vue.v === 'ok' && !vue.joindreAutorise && vue.motifRefus !== null && (
          <p className="sfd-interdit" role="status">🔒 {vue.motifRefus}</p>
        )}

        {/* 🔴🔴 DANS UNE RECHERCHE, LE DROIT SE JUGE AU MOMENT DE JOINDRE. On le DIT d'avance : un refus qu'on
            découvre au clic se lit comme une panne, un refus annoncé se lit comme une règle. */}
        {vue.v === 'ok' && vue.recherche && (
          <p className="sfd-interdit" role="status">
            🔒 Résultats de tout le Drive : le droit de joindre est vérifié au moment de joindre. Un fichier de
            « Documents clients scannés » sera refusé, avec son motif.
          </p>
        )}

        {vue.v === 'ok' && vue.fichiers.length === 0 && vue.dossiers.length === 0 && (
          <p className="gst-tronc">
            {vue.recherche ? `Aucun dossier ni fichier trouvé pour « ${saisie.trim()} ».` : 'Ce dossier est vide.'}
          </p>
        )}

        {/* ══ 🔴 LES DOSSIERS TROUVÉS, EN PREMIER (demande d'Arno) ═══════════════════════════════════════════
            Ce qu'on cherche, neuf fois sur dix, c'est LE DOSSIER d'un lot ou d'un locataire — pour y prendre
            ensuite deux ou trois pièces. Les mettre après les fichiers obligerait à faire défiler pour trouver
            l'entrée la plus utile.

            🔴 UN GROUPE VIDE N'EST PAS AFFICHÉ : un titre suivi de rien se lit comme une panne. */}
        {vue.v === 'ok' && vue.dossiers.length > 0 && (
          <section className="sfd-groupe" aria-label="Dossiers trouvés">
            <p className="sfd-section">Dossiers</p>
            <ul className="sfd-liste">
              {vue.dossiers.map((f) => (
                <li key={f.id} className="sfd-item">
                  <button type="button" className="sfd-dossier" onClick={() => entrerDepuisRecherche(f)}>
                    <span aria-hidden="true">📁</span> {f.nom}
                  </button>
                  <span className="sfd-mention">ouvrir</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {vue.v === 'ok' && vue.fichiers.length > 0 && (
          <section className="sfd-groupe" aria-label={vue.recherche ? 'Fichiers trouvés' : 'Contenu du dossier'}>
            {/* Le titre « Fichiers » n'a de sens que FACE à un autre groupe : dans un dossier ordinaire, la liste
                se suffit à elle-même et un titre de plus ne ferait qu'occuper la hauteur. */}
            {vue.recherche && vue.dossiers.length > 0 && <p className="sfd-section">Fichiers</p>}
            <ul className="sfd-liste">
              {vue.fichiers.map((f) => (
                <li key={f.id} className="sfd-item"
                  onMouseEnter={() => { if (!f.dossier && vue.joindreAutorise) amorcer(f); }}>
                  {f.dossier ? (
                    <button type="button" className="sfd-dossier" onClick={() => entrer(f)}>
                      <span aria-hidden="true">📁</span> {f.nom}
                    </button>
                  ) : (
                    <>
                      <span className="sfd-nom" title={f.nom}>
                        <span aria-hidden="true">📄</span> {f.nom}
                        {f.tailleOctets !== null && (
                          <span className="sfd-taille"> · {formaterTaille(f.tailleOctets)}</span>
                        )}
                      </span>
                      <span className="sfd-gestes">
                        {/* ══ 🔴 « VISUALISER », EN PREMIER (demande d'Arno) ═════════════════════════════════════
                            L'ordre dit l'usage : on REGARDE, puis on joint, puis — à défaut — on met un lien. Avant
                            ce lot, pour savoir si « Devis 2.pdf » était le bon devis, il fallait le joindre et
                            l'envoyer. On joignait donc au hasard.

                            🔴🔴 IL EST ABSENT SOUS « DOCUMENTS CLIENTS SCANNÉS », exactement comme « Joindre » :
                            afficher un avis d'imposition à l'écran, c'est le LIRE, et c'est la lecture du contenu
                            que la règle interdit. Le motif est affiché au-dessus, une fois pour la liste entière. */}
                        {vue.joindreAutorise && (
                          <button type="button" className="gst-lien-bouton"
                            /**
                             * 🔴 LOT APERCU-RAPIDE — LE SURVOL AMORCE LE TRAVAIL. Au moment du clic, le verdict et
                             * les métadonnées sont déjà mémorisés côté serveur : c'est la part la plus chère de
                             * l'ouverture (1,7 à 2,4 s mesurés le 29/09/2026), et elle est payée pendant qu'on
                             * approche la souris.
                             */
                            onMouseEnter={() => amorcer(f)}
                            onFocus={() => amorcer(f)}
                            onClick={() => setAVoir({
                              id: f.id, nom: f.nom, typeMime: f.typeMime, lien: f.lien,
                              parentId: f.parentId ?? (vue.recherche ? null : dossierCourant?.id ?? null),
                            })}>
                            Visualiser
                          </button>
                        )}
                        {/* 🔴🔴 « Joindre » N'EXISTE PAS sous « Documents clients scannés ». Le motif est affiché
                            au-dessus : on n'aligne pas un bouton grisé qu'on ne saurait pas expliquer ligne à ligne. */}
                        {vue.joindreAutorise && (
                          ajoutes.includes(f.id)
                            // 🔴 PAS DE DOUBLON : le bouton laisse place à une MENTION. Un bouton encore cliquable
                            //   enverrait deux fois la même pièce ; un bouton grisé n'expliquerait pas pourquoi.
                            ? <span className="sfd-ajoute">✓ ajouté</span>
                            : (
                              // 🔴 AUCUN SABLIER : le clic marque la pièce et rend la main. Voir `joindre`.
                              <button type="button" className="gst-lien-bouton" onClick={() => void joindre(f)}>
                                Joindre
                              </button>
                            )
                        )}
                        <button type="button" className="gst-lien-bouton" onClick={() => lier(f)}>
                          Insérer un lien
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="sfd-boutons">
          {/* 🔴 « TERMINÉ » remplace « Fermer » : le mot dit qu'on a fini d'ajouter, pas qu'on renonce. */}
          <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onFermer}>Terminé</button>
        </div>
      </div>
    </div>

    {/* ══ 🔴🔴 L'APERÇU — FRÈRE DU SÉLECTEUR, PAS SON ENFANT ═══════════════════════════════════════════════════
        C'est ce qui garantit la demande d'Arno : « on revient exactement au même dossier, avec la même recherche, le
        même compteur et les mêmes ✓ ajouté ». Le sélecteur n'est pas démonté, donc son état ne bouge pas — fermer
        l'aperçu ne « revient » nulle part, on n'était jamais parti.

        ⚠️ ET NON DANS `.sfd-voile`, pour une seconde raison : le sélecteur ferme sur Échap et sur un clic hors de
        lui. Dedans, l'aperçu aurait fait remonter ses Échap et ses clics jusqu'à lui — une croix qui ferme deux
        fenêtres au lieu d'une. */}
    {aVoir !== null && (
      <ApercuFichierDrive
        fichier={aVoir}
        /**
         * 🔴 LOT APERCU-RAPIDE — LA LISTE AFFICHÉE, TELLE QUELLE. C'est le module pur `voisinsVisualisables` qui en
         * tire le périmètre : les dossiers écartés, les types sans aperçu sautés, et surtout RIEN qui n'ait le même
         * dossier parent que le document ouvert. Filtrer ici aurait mis cette règle dans l'écran.
         *
         * ⚠️ ON PASSE LES DEUX GROUPES d'une recherche (dossiers ET fichiers) : le module écarte les dossiers
         * lui-même, et lui cacher la moitié de la liste l'empêcherait de compter juste.
         */
        voisinage={vue.v === 'ok'
          ? [...vue.dossiers, ...vue.fichiers].map((f) => ({
            id: f.id, nom: f.nom, typeMime: f.typeMime, dossier: f.dossier,
            // Dans un DOSSIER, la route ne renseigne pas le parent de chaque ligne : c'est le dossier courant.
            parentId: f.parentId ?? (vue.recherche ? null : dossierCourant?.id ?? null),
          }))
          : []}
        joindreAutorise={vue.v === 'ok' ? vue.joindreAutorise : false}
        /** 🔴 « ✓ ajouté » SUIT LE DOCUMENT AFFICHÉ, pas celui par lequel on est entré : on navigue dedans. */
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
.sfd-voile{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px;
  background:color-mix(in srgb, var(--color-svv-ink) 38%, transparent)}
.sfd{display:flex;flex-direction:column;gap:10px;width:min(640px,100%);max-height:86vh;overflow-y:auto;padding:16px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.8rem;
  box-shadow:0 10px 40px color-mix(in srgb, var(--color-svv-ink) 20%, transparent)}
.sfd-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink)}
/* Le COMPTEUR : le MOT porte l'information, jamais la couleur seule. */
.sfd-compteur{margin:0;padding:6px 10px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-radius:.4rem}
.sfd-compteur--vide{font-weight:400;color:var(--color-svv-muted)}
.sfd-champ{display:flex;flex-direction:column;gap:.2rem;min-width:0}
.sfd-saisie{min-height:40px;padding:.3rem .5rem;font:inherit;font-size:.9rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.4rem;min-width:0}
.sfd-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.sfd-ariane{display:flex;flex-wrap:wrap;align-items:center;font-size:.82rem;color:var(--color-svv-muted)}
.sfd-fleche{color:var(--color-svv-line-strong)}
.sfd-section{margin:0;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.sfd-recents{display:flex;flex-direction:column;gap:2px;min-width:0;padding-bottom:6px;
  border-bottom:1px solid var(--color-svv-line)}
.sfd-mention{font-size:.74rem;color:var(--color-svv-muted);white-space:nowrap;margin-left:auto}
.sfd-groupe{display:flex;flex-direction:column;gap:2px;min-width:0}
/* 🔴 LA LIGNE PRIORITAIRE — en EVIDENCE, parce qu'elle est la bonne reponse neuf fois sur dix. Le liseré rouge
   la distingue sans crier : ce n'est pas une alerte, c'est un raccourci. Cible pleine largeur, 44 px au moins. */
.sfd-prio{display:flex;flex-direction:column;gap:4px;min-width:0;padding-bottom:8px;
  border-bottom:1px solid var(--color-svv-line)}
.sfd-prio-ligne{display:flex;flex-direction:column;gap:1px;width:100%;min-height:44px;padding:8px 10px;
  text-align:left;font:inherit;color:var(--color-svv-ink);background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);border-left:3px solid var(--color-svv-red);border-radius:.5rem;
  cursor:pointer;min-width:0}
.sfd-prio-ligne:hover{border-color:var(--color-svv-ink);border-left-color:var(--color-svv-red)}
.sfd-prio-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.sfd-prio-titre{font-size:.88rem;font-weight:700;overflow-wrap:anywhere}
.sfd-prio-bien{font-size:.8rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.sfd-retour{align-self:flex-start;font-size:.82rem}
/* 🔴 « + NOUVEAU DOSSIER » — discret au repos, net quand il s'ouvre : c'est un geste rare, et le seul qui ÉCRIT. */
.sfd-creer{display:flex;flex-direction:column;gap:6px;min-width:0}
.sfd-creer-ouvrir{align-self:flex-start;font-size:.84rem;font-weight:700}
.sfd-creer-motif{display:flex;flex-direction:column;gap:2px;margin:0;min-width:0}
/* 🔴 UN BOUTON DÉSACTIVÉ DOIT SE VOIR. Défaut constaté à l'écran le 28/09/2026 : « .gst-lien-bouton » n'a aucune
   règle « :disabled », si bien que le bouton du mode dégradé s'affichait EXACTEMENT comme un bouton actif — rouge,
   souligné, avec un curseur de main. On cliquait, rien ne se passait, et l'on cherchait une panne.
   ⚠️ RÈGLE POSÉE ICI, PAS SUR LA CLASSE GLOBALE : celle-ci sert sur une dizaine d'écrans, où « disabled » ne dure
   que le temps d'un envoi. La changer partout dépasserait ce lot, et on ne l'a pas demandé. */
.sfd-creer .gst-lien-bouton:disabled{color:var(--color-svv-muted);text-decoration:none;cursor:default}
.sfd-creer-corps{display:flex;flex-direction:column;gap:8px;min-width:0;padding:10px;
  background:var(--color-svv-field);border:1px solid var(--color-svv-line);
  border-left:3px solid var(--color-svv-red);border-radius:0 .5rem .5rem 0}
.sfd-creer-boutons{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.sfd-creer-chemin{display:flex;flex-direction:column;gap:2px;margin:0;min-width:0}
.sfd-creer-nom{font-size:.92rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.sfd-creer-fait{margin:0;padding:6px 10px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-green);border-radius:0 .4rem .4rem 0}
/* La mention passe sous le libellé quand elle est une PHRASE et non une étiquette : sinon elle se coupe à droite. */
.sfd-mention--bloc{margin-left:0;white-space:normal;overflow-wrap:anywhere}
/* 🔴🔴 Le dossier interdit : dit en MOTS, avec un fond qui le distingue — jamais la couleur seule. */
.sfd-interdit{margin:0;padding:8px 10px;font-size:.82rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}
.sfd-liste{display:flex;flex-direction:column;gap:0;margin:0;padding:0;list-style:none}
.sfd-item{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px;padding:6px 2px;
  border-bottom:1px solid var(--color-svv-line);min-width:0}
.sfd-dossier{flex:1 1 auto;min-height:44px;padding:0;font:inherit;font-size:.9rem;text-align:left;
  color:var(--color-svv-ink);background:none;border:0;cursor:pointer;overflow-wrap:anywhere}
.sfd-dossier:hover:not(:disabled){text-decoration:underline}
.sfd-dossier:disabled{color:var(--color-svv-muted);cursor:default}
.sfd-nom{flex:1 1 12rem;min-width:0;font-size:.88rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.sfd-taille{color:var(--color-svv-muted)}
.sfd-gestes{display:flex;flex-wrap:wrap;gap:10px;margin-left:auto}
/* « déjà ajouté » : un MOT, pas un bouton désactivé — on sait ce qui s'est passé, pas seulement qu'on ne peut plus. */
.sfd-ajoute{font-size:.82rem;font-weight:700;color:var(--color-svv-ink);white-space:nowrap}
.sfd-boutons{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
`;
