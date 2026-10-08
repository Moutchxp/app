'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlocRepliable } from '../permis/BlocRepliable';
import type { Rapport } from './gestesMail';
import type { CarteDetail } from '../../../../lib/gestion/carteRepo';
/* 🔴 LOT MONGA-1, POINT 4 — le type seul, effacé à la compilation : ce composant vit dans le navigateur. */
import type { MongaDeLEvenement } from '../../../../lib/gestion/mongaRepo';
import type { CarteEvenement, DerniereEtapeVignette } from '../../../../lib/gestion/fileRepo';
/* 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — le mot d'une étape et la forme de sa date : modules PURS. */
import { motEtape } from '../../../../lib/gestion/mongaEtape';
/* 🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — le mot d'un TYPE d'événement. Module PUR, liste déjà en base (268).
   🔴🔴 LOT CAPSULE-TYPE-EVENEMENT — et sa COULEUR, et le mot de l'absence de type, et la LISTE pour le choisir :
   tout vient du même module, qui est désormais la seule déclaration des types. */
/* 🔴🔴 LOT URGENCE-EVENEMENT, POINT 1 — ET SA COULEUR VIENT DÉSORMAIS DU DEGRÉ D'URGENCE (`tonUrgence`), non plus
   du type (`tonDuType`, qui n'est plus lu ici). Le MOT, lui, reste le type : c'est exactement ce qu'Arno demande. */
import {
  categorieValide, motCategorie, motUrgence, MOT_TYPE_A_DEFINIR, tonUrgence, TYPES_EVENEMENT,
} from '../../../../lib/gestion/evenementQualite';
/* 🔴 LOT URGENCE-EVENEMENT, POINT 5 — comparer deux noms accents/casse/tirets indifférents. Module PUR. */
import { normaliserNom } from '../../../../lib/gestion/documentsAuto';
/* ══ 🔴🔴 LOT CARTES-EVENEMENT-MEME-GESTE — CE QUE CE FICHIER N'IMPORTE PLUS, ET POURQUOI ═══════════════════════
   La carte dépliée ne montre plus que les infos manquantes et le bouton rouge : avec les blocs de détail sont
   partis leurs composants (`Conversation`, `MenuDiscret`, `ChoisirEvenement`, `DeplacerVers`, `FriseAvancement`,
   `SelecteurUrgence`) et les outils qu'eux seuls lisaient (`statutDuMessage`, `corpsLisible`, `trierPieces`,
   `formaterTaille`, `libelleSens`, `depuis`, et le type `Cible`). Un import orphelin finit toujours par être
   recâblé « parce qu'il est encore là » — c'est la leçon des règles de feuille orphelines du lot
   EVENEMENT-MINIMALISTE, et elle vaut pour les imports. */
import { formaterDateFr, heureParis, libelleEtat } from '../../../../lib/gestion/ecran';

/**
 * LOT 4c — LA CARTE VIVANTE : le côté droit de l'écran cesse d'être une liste pour devenir un dossier qu'on ouvre.
 *
 * CHARGEMENT PARESSEUX, patron `BlocRepliable` (réutilisé tel quel, pas recopié) : une carte qu'on ne déplie pas ne
 * lance AUCUNE requête, et un échange qu'on ne déplie pas non plus. Avec 443 échanges dans la file, c'est ce qui fait
 * la différence entre un écran qui s'ouvre et un écran qui rame. Une fois ouvert, le contenu reste monté : replier
 * puis rouvrir ne relance rien.
 *
 * ⚠️ LES PIÈCES JOINTES SONT SERVIES PAR L'APPLICATION (`/api/admin/gestion/pieces/[id]`). Aucune URL de stockage
 * n'arrive jusqu'au navigateur : une URL signée serait un laissez-passer transmissible vers le bail ou le RIB d'un
 * locataire, alors qu'ici le droit est relu en base à chaque ouverture.
 *
 * MOBILE D'ABORD : tout casse en fin de ligne, cibles ≥ 44 px, aucune interaction au survol seul, et pas une seule
 * couleur en dur — uniquement des jetons `--color-svv-*`.
 */

// LOT 5b — `Rapport` vit dans `gestesMail` (brique partagée avec la vue conversation, sans cycle d'imports).
//   RÉEXPORTÉ ici : aucun import existant ne casse.
export type { Rapport };

/**
 * 🔴 LOT MONGA-1, POINT 4 — la carte reçoit, en plus, l'intervention Monga qu'elle porte (ou `null`, le cas
 * ordinaire). Le type vit à côté de `CarteDetail` plutôt que dedans : `CarteDetail` est ce que `carteRepo` sait
 * d'une carte, et Monga n'en fait pas partie — la route compose les deux.
 */
type CarteAvecMonga = CarteDetail & {
  monga?: MongaDeLEvenement | null;
  /** 🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — les biens de l'événement, pour le gros bouton. */
  biens?: { cle: string; adresse: string | null; commune: string | null }[];
  /**
   * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — LES PARTIES EN VIGUEUR DU OU DES BIENS : propriétaires en cours et
   * locataires occupants du jour, calculés par la route avec `personnesDesBiens` + `personnesEnVigueur` — c'est-à-dire
   * le calcul du bloc Parties de la fiche du bien, et non une seconde lecture qui dirait autrement.
   *
   * ⚠️ ABSENT (et non `[]`) sur une réponse antérieure à ce lot — une page restée ouverte pendant un déploiement.
   * L'écran n'affiche alors rien de plus qu'avant, au lieu de tomber. Même prudence que `biens` et `derniereEtape`.
   */
  parties?: { sorte: 'proprietaire' | 'locataire'; nom: string }[];
};

type VueCarte = { v: 'charge' } | { v: 'ok'; d: CarteAvecMonga } | { v: 'erreur'; m: string };

/**
 * Va chercher une carte et RENVOIE le résultat sans toucher à aucun état : c'est l'appelant qui décide quoi en faire.
 * Hors du composant, donc réutilisable par l'effet de montage comme par le « Réessayer », sans dupliquer la lecture.
 * Un refus (403) n'est pas une panne, et il est dit pour ce qu'il est.
 */
async function chargerCarte(evenementId: number): Promise<VueCarte> {
  try {
    const res = await fetch(`/api/admin/gestion/evenements/${evenementId}`, { cache: 'no-store' });
    if (!res.ok) return { v: 'erreur', m: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    return { v: 'ok', d: (await res.json()) as CarteAvecMonga };
  } catch {
    return { v: 'erreur', m: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}

/**
 * ══ 🔴 CETTE FICHE DE BIEN PEUT-ELLE S'OUVRIR ? PUR ════════════════════════════════════════════════════════════
 *
 * ⚠️ UNE FICHE DE BIEN S'ADRESSE PAR SA CLÉ WIPPIMMO, et cette clé s'écrit `bien-<nombre>` dans l'adresse
 * (`SORTES_FICHE_PAR_CLE`). Une clé qui n'est pas un nombre ne peut donc pas être ouverte — le bouton rouge la DIT
 * plutôt que de la faire disparaître d'une liste où elle devrait être.
 *
 * 🔴 LOT URGENCE-EVENEMENT, POINT 4 — SORTIE DE `OuvrirLaFicheDuBien`, où elle était une fermeture locale. Le
 * double-clic de l'écran Événements doit ouvrir « exactement comme le bouton rouge » (Arno) : deux écritures de
 * « cette clé est-elle adressable » auraient fini par ne plus répondre pareil, et c'est précisément la promesse
 * d'Arno qui serait tombée. Une seule règle, deux appelants.
 */
function estCleAdressable(cle: string): boolean {
  const n = Number(cle);
  return Number.isSafeInteger(n) && n > 0;
}


export function CarteVive({
  carte, maintenant, onGeste, partage = false, onOuvrirBien, vise = false,
}: {
  carte: CarteEvenement;
  maintenant: Date;
  onGeste: Rapport;
  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — EST-ON DANS L'ÉCRAN PARTAGÉ ? ═════════════════════════════════════
   *
   * ACCORD D'ARNO (06/10/2026) : « BLOC “À traiter / En cours / Traité” : il est retiré de l'écran partagé. Sa
   * fonction n'est pas perdue : elle est ajoutée dans l'en-tête de l'événement sur la fiche du bien (bloc
   * Événements) et dans la vue de l'événement, même porte d'écriture. »
   *
   * 🔴 UNE PROP, ET NON DEUX COMPOSANTS. La carte est rendue par le MÊME code dans la colonne de l'écran partagé
   * et en plein écran — c'est écrit noir sur blanc dans `GestionVue` (« rendues une seule fois »). Un second
   * composant aurait fini par diverger sur tout le reste du dossier.
   *
   * ⚠️ `false` PAR DÉFAUT, c'est-à-dire « plein écran » : l'état y reste, et toute autre vue qui rendrait cette
   * carte sans rien dire garde exactement le comportement d'avant ce lot.
   */
  partage?: boolean;
  /**
   * 🔴 OUVRIR LA FICHE DU BIEN SUR CET ÉVÉNEMENT (Arno, point 1). Absent = aucun bouton : la carte est alors
   * celle d'avant ce lot, et c'est ce qui la garde rendable hors de `GestionVue`.
   */
  onOuvrirBien?: (cleBien: string, evenementId: number) => void;
  /**
   * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 4 — EST-CE CETTE CARTE QU'ON VIENT VOIR ? L'adresse le dit
   * (`?ecran=evenements&evenement=<id>`), et c'est `GestionVue` qui compare. Vrai ⇒ liseré de sélection, carte
   * DÉPLIÉE, et la liste se défile pour la centrer.
   *
   * ⚠️ `false` PAR DÉFAUT : une vue qui rendrait cette carte sans rien dire garde le comportement d'avant ce lot.
   *
   * 🔴🔴 LOT CARTES-EVENEMENT-MEME-GESTE — PLUS AUCUN GESTE NE L'ALLUME. Arno : « Le lien &evenement=<id> (carte
   * centrée, liserée, dépliée) peut rester comme fonction d'adresse, mais plus aucun geste ne doit l'appeler par
   * défaut. » Il ne s'allume donc plus que par une adresse écrite ou collée à la main.
   */
  vise?: boolean;
}) {
  // Le détail, une fois chargé, fait foi sur le résumé : après une correction du « quoi », le titre replié doit dire
  //   le nouveau libellé sans attendre un rechargement de tout l'écran.
  const [detail, setDetail] = useState<CarteDetail | null>(null);
  const objet = detail?.objet ?? carte.objet;
  const etat = detail?.etat ?? carte.etat;

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — « MIS À JOUR PAR MONGA » ═════════════════════════════════════════
   *
   * Arno : « Quand l'automatisation Monga AJOUTE ou MODIFIE une étape d'un événement (jamais pour un geste
   * manuel), la vignette est mise en avant : liseré vert lumineux qui pulse doucement, plus un petit badge
   * “Mis à jour par Monga · <heure>” sur la miniature. […] L'effet reste PAR COLLABORATEUR jusqu'à ce que CE
   * collaborateur clique sur la vignette, OU ouvre la fiche du bien concerné, OU ouvre la vue de l'événement. »
   *
   * 🔴 UNE COMPARAISON DE DEUX DATES, et rien d'autre. La date d'écriture de Monga contre MA dernière vue.
   * Jamais vu (`vuLe` nul) et une mise à jour existe ⇒ allumé. C'est ce qui fait que l'effet se rallume tout
   * seul à la prochaine étape Monga, sans que personne n'ait à l'éteindre chez les autres.
   *
   * ⚠️ `eteint` EST UN ÉTAT LOCAL, et il ne remplace pas l'écriture : il éteint l'effet TOUT DE SUITE, à l'œil,
   * pendant que la requête part. Sans lui, la vignette resterait allumée jusqu'à la relecture suivante de
   * l'écran — on cliquerait, et rien ne se passerait.
   */
  const [eteint, setEteint] = useState(false);
  const majMonga = carte.mongaMajLe ?? null;
  const misAJour = !eteint && majMonga !== null && (carte.vuLe === null || carte.vuLe === undefined
    || majMonga > carte.vuLe);

  /**
   * 🔴 LES TROIS CHEMINS PASSENT PAR LA MÊME PORTE (`POST /evenements/vus`). Ici, le premier : « CE
   * collaborateur clique sur la vignette ».
   *
   * ⚠️ L'ÉCHEC SE TAIT. Marquer vu est un geste de confort : une bannière d'erreur parce qu'on vient de cliquer
   * une vignette ferait bien plus de mal que l'effet qui reste allumé une minute de plus.
   */
  const marquerVu = (): void => {
    if (!misAJour) return;
    setEteint(true);
    void fetch('/api/admin/gestion/evenements/vus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [carte.evenementId] }),
    }).catch(() => undefined);
  };

  /**
   * 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 2 — LE TYPE RETENU. `categorieValide` est la MÊME fonction que le
   * formulaire de la carte : une valeur inconnue ou vide vaut « pas de type ». Sans elle, `motCategorie` rendrait
   * « Non précisée », c'est-à-dire un type là où il n'y en a pas.
   *
   * ⚠️ LE DÉTAIL FAIT FOI DÈS QU'IL EST LÀ, comme pour l'objet et l'état juste au-dessus : après avoir choisi un
   * type dans le formulaire, la capsule doit le dire sans attendre un rechargement de tout l'écran.
   */
  const typeEvenement = categorieValide(detail?.categorie ?? carte.categorie);

  /**
   * ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 1 — LE DEGRÉ D'URGENCE, QUI PEINT LA CAPSULE ═══════════════════════════
   *
   * ARNO : « La couleur de fond de la capsule de type ne dépend plus du type : elle traduit le degré d'urgence de
   * l'événement. Le texte affiché reste le type. »
   *
   * 🔴 LE DÉTAIL FAIT FOI DÈS QU'IL EST LÀ, comme pour l'objet, l'état et le type juste au-dessus. C'est CELA qui
   * tient la promesse « la couleur de la capsule change sans recharger » du point 3 : le sélecteur écrit, la carte
   * se relit, `detail.urgence` change, et la capsule suit — sans que l'écran entier soit rechargé.
   *
   * ⚠️ `null` = AUCUN NIVEAU ENREGISTRÉ, et c'est le cas des 2 événements de la base au 08/10/2026 : la capsule est
   * alors grise neutre. Ne pas avoir choisi n'est pas « Normal ».
   */
  const urgence = detail?.urgence ?? carte.urgence ?? null;
  const ton = tonUrgence(urgence);

  /**
   * ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — « UN CLIC SUR “Type à définir” OUVRE LE CHOIX DU TYPE » ═══════
   *
   * Un NONCE, et non un booléen : il sert deux fois (ouvrir le dossier, puis ouvrir son formulaire), et un
   * booléen remis à faux aurait demandé de savoir QUAND le remettre — c'est-à-dire un troisième état à tenir.
   */
  const [demandeDeType, setDemandeDeType] = useState(0);

  /**
   * ══ 🔴🔴 POURQUOI LE CLIC EST INTERCEPTÉ ICI, ET NON PORTÉ PAR UN BOUTON ═══════════════════════════════════
   *
   * La capsule vit DANS le titre de `BlocRepliable`, et ce titre EST un `<button>`. Un bouton dans un bouton est
   * du HTML invalide et injouable au clavier — c'est écrit noir sur blanc trois fois dans ce fichier, et c'est
   * pour cela que le menu d'un échange vit en VOISIN du repli plutôt que dedans.
   *
   * 🔴 ON INTERCEPTE DONC EN PHASE DE CAPTURE, sur la ligne entière. La capture descend du `<li>` vers le
   * `<button>` : couper la propagation ici empêche le repli de basculer, et la capsule garde son clic. Sur une
   * carte DÉPLIÉE, c'est ce qui évite qu'un clic sur « Type à définir » ne la referme au lieu d'ouvrir le choix.
   *
   * ⚠️ LA FONCTION RESTE ATTEIGNABLE AU CLAVIER SANS CETTE CAPSULE, et c'est ce qui la rend acceptable : le titre
   * du dossier est un vrai bouton, il déplie la carte, et le formulaire « Modifier » y porte un vrai `<select>`.
   * La capsule est un RACCOURCI de souris vers un chemin qui existe déjà, jamais le seul chemin.
   */
  /**
   * ══ 🔴🔴 LOT CARTES-EVENEMENT-MEME-GESTE — UN SEUL DOUBLE-CLIC, LE MÊME SUR LES DEUX ÉCRANS ═════════════════
   *
   * ═══ CE QUE CETTE RÈGLE REMPLACE, ET IL FAUT LE DIRE ══════════════════════════════════════════════════════
   * Le lot URGENCE-EVENEMENT (e34bf69d) faisait DEUX gestes différents : dans l'écran partagé, le double-clic
   * menait à l'écran Événements centré sur la carte ; en plein écran, il ouvrait la fiche du bien. ARNO revient
   * dessus le 08/10/2026 : « RÈGLE UNIQUE […] IDENTIQUE sur l'écran partagé et sur l'écran Événements en plein
   * écran. Un seul code partagé, pas deux comportements. […] DOUBLE-CLIC → ouvre directement la fiche du bien sur
   * cet événement (même lien, même code que le bouton rouge). »
   *
   * 🔴 LE PASSAGE AU PLEIN ÉCRAN NE SE FAIT PLUS QUE PAR LE BOUTON « Plein écran » de la colonne Événements
   * (Arno, point 3). L'adresse `?ecran=evenements&evenement=<id>` reste valide — carte centrée, liserée,
   * dépliée —, mais PLUS AUCUN GESTE ne l'appelle : c'est une fonction d'adresse, pas un geste.
   *
   * ═══ 🔴 COMMENT LES DEUX GESTES SONT DISTINGUÉS ════════════════════════════════════════════════════════════
   *
   * 🔴 ON LIT `e.detail`, LE COMPTEUR DE CLICS DU NAVIGATEUR. Le SECOND clic (`detail >= 2`) est INTERCEPTÉ en
   * phase de capture : il n'atteint jamais le bouton du repli, donc la seconde bascule N'A PAS LIEU et la carte
   * ne revient jamais à son état de départ. Le PREMIER clic, lui, bascule normalement — Arno l'accepte en toutes
   * lettres : « Si le premier clic déplie brièvement la carte avant de partir vers la fiche, c'est acceptable. »
   * C'est ce qui évite de retarder de ~250 ms le geste le plus fréquent pour servir le plus rare.
   *
   * ⚠️ UN CONTRÔLE INTERNE NE DÉCLENCHE RIEN : si le clic vient d'un bouton, d'un lien ou d'un champ AUTRE que le
   * titre du repli — le bouton rouge lui-même, les trois boutons d'état —, on ne fait rien du tout. Le titre du
   * repli EST un `<button>` (`svv-repli-titre`), d'où la comparaison explicite : sans elle, le double-clic ne
   * marcherait nulle part, puisque toute la carte repliée vit dans ce bouton.
   */
  const auClic = (e: React.MouseEvent<HTMLLIElement>): void => {
    marquerVu();
    const cible = e.target instanceof Element ? e.target : null;
    /**
     * 🔴 LA CAPSULE « Type à définir » GARDE SON CLIC, ET IL DÉPLIE LA CARTE. Son geste a CHANGÉ de destination
     * avec ce lot : le formulaire qu'elle ouvrait vivait dans la carte, et il est parti dans la fiche du bien
     * avec tout le reste. Elle reste un raccourci vers le dossier — jamais un cul-de-sac —, et le choix du type
     * se fait désormais par « Modifier les informations de l'événement », sur la fiche.
     */
    if (cible?.closest('.gst-type-capsule--vide') != null) {
      e.stopPropagation();
      e.preventDefault();
      setDemandeDeType((n) => n + 1);
      return;
    }
    /* Premier clic : on laisse le repli faire son travail, exactement comme avant ce lot. */
    if (e.detail < 2) return;

    /* ⚠️ UN CONTRÔLE INTERNE (hors titre du repli) NE DÉCLENCHE RIEN. */
    const interactif = cible?.closest('button, a, input, select, textarea, label') ?? null;
    if (interactif !== null && !interactif.classList.contains('svv-repli-titre')) return;

    /* 🔴 LE SECOND CLIC N'ATTEINT PAS LE REPLI : c'est ce qui empêche la seconde bascule. */
    e.stopPropagation();
    e.preventDefault();

    /**
     * 🔴 LA FICHE DU BIEN, PAR LE MÊME CHEMIN QUE LE BOUTON ROUGE (`onOuvrirBien`, même clé, même adresse), et
     * désormais depuis LES DEUX ÉCRANS. La clé est celle du bien UNIQUE de l'événement, et c'est bien la même
     * que celle qu'ouvrirait le bouton : `biensNommesDeLEvenement` et `sqlBienDeLEvenement` trient tous deux
     * `ORDER BY cle`, donc le premier de l'un est le premier de l'autre — et quand il n'y en a qu'un, c'est le
     * même.
     *
     * ⚠️ AUCUN BIEN ⇒ AUCUNE OUVERTURE (Arno, en toutes lettres), et rien d'autre ne change.
     *
     * ⚠️ PLUSIEURS BIENS ⇒ AUCUNE OUVERTURE NON PLUS — « Événement à plusieurs biens ou sans bien : pas
     * d'ouverture (comme tu l'as fait) », Arno. Le bouton rouge ouvre alors un CHOIX du bien, et un double-clic
     * n'a pas d'endroit où le poser.
     */
    if (onOuvrirBien === undefined || carte.bien === null || carte.nbBiens !== 1) return;
    if (!estCleAdressable(carte.bien.cle)) return;
    onOuvrirBien(carte.bien.cle, carte.evenementId);
  };

  /**
   * ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 4 — « LA LISTE DÉFILÉE ET CENTRÉE SUR L'ÉVÉNEMENT » ════════════════════
   *
   * ⚠️ UNE SEULE FOIS, ET LE VERROU EST ICI : sans lui, chaque relecture de la liste — un geste, le battement de
   * 30 s — ramènerait la page sur l'événement, et l'on perdrait l'endroit qu'on regardait. Même règle, et même
   * raison, que le calage du bloc « Événements » de la fiche du bien (lot VIGNETTE-EVENEMENT).
   *
   * ⚠️ SANS `behavior: 'smooth'`, ET C'EST MESURÉ AILLEURS : un défilement animé est piloté par les images du
   * navigateur et s'interrompt dès que la page cesse d'en produire — on arrivait à mi-chemin. Arbitrage déjà pris
   * par `EvenementsDuBien` et par les frises, pour exactement cette raison.
   *
   * ⚠️ `block: 'center'` PARCE QU'ARNO DIT « CENTRÉE ». Le corps de la carte se monte juste après (il charge son
   * détail) et peut décaler le centre de quelques dizaines de pixels : la carte reste à l'écran, et le liseré dit
   * laquelle. Un second défilement après l'arrivée du détail aurait fait sauter la page deux fois.
   */
  const ancre = useRef<HTMLLIElement | null>(null);
  const pose = useRef(false);
  useEffect(() => {
    if (!vise || pose.current || ancre.current === null) return;
    pose.current = true;
    ancre.current.scrollIntoView({ block: 'center' });
  }, [vise]);

  return (
    <li ref={ancre}
      className={`gst-item${misAJour ? ' gst-item--monga' : ''}${vise ? ' gst-item--vise' : ''}`}
      /* ⚠️ LA COULEUR NE PORTE PAS L'INFORMATION SEULE : le liseré se voit, `aria-current` s'entend. */
      aria-current={vise ? true : undefined}
      onClickCapture={auClic}>
      <BlocRepliable
        titreClasseExtra="gst-repli"
        /* 🔴 LOT URGENCE-EVENEMENT, POINT 4 — « cet événement […] déplié ». `ouvrirQuand` est la LATCH que
           `BlocRepliable` offre déjà : elle s'ouvre UNE fois et ne referme jamais d'elle-même, donc on peut
           replier la carte juste après sans qu'elle se rouvre. */
        ouvrirQuand={vise}
        /* 🔴 LOT CAPSULE-TYPE-EVENEMENT — le clic sur « Type à définir » DÉPLIE le dossier. `ouvrirSignal` est le
           mécanisme déjà prévu par `BlocRepliable` pour cela (un nonce), et il ne prend pas le contrôle : on
           peut replier juste après. */
        ouvrirSignal={demandeDeType}
        titre={
          /**
           * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA VIGNETTE ════════════════════════════════════════════
           *
           * Arno : « Retire la capsule “attend une réponse”. Garde toutes les autres informations actuelles
           * (titre, référence, état, nombre d'échanges, dernier échange). Ajoute À DROITE de la vignette une
           * miniature de la DERNIÈRE carte d'étape de sa frise. Le titre se coupe proprement avec “…” pour
           * laisser la place. »
           *
           * 🔴 DEUX COLONNES : le texte à gauche, la miniature à droite. Le texte prend ce qui reste et son
           * titre se coupe ; la miniature a une largeur fixe et ne se laisse pas écraser. L'inverse — une
           * miniature élastique — l'aurait réduite à un trait sur les titres longs, et c'est justement là
           * qu'on a besoin de savoir où en est le dossier.
           */
          <span className="gst-carte-titre gst-carte-titre--avec-etape">
            <span className="gst-carte-texte">
              {/* ══ 🔴🔴 LOT EVENEMENTS-CARTES-PLEINES, POINT 2 — LE TITRE EST ENTIER ═══════════════════════
                  CETTE LIGNE DISAIT : « LE TITRE SE COUPE AVEC “…”, et il garde son contenu entier dans son
                  `title` : une coupure qui perd l'information serait un titre faux. » C'était la demande du lot
                  VIGNETTE-EVENEMENT, qui venait d'ajouter la miniature à droite.

                  🔴 ARNO REVIENT DESSUS (07/10/2026) : « Plus aucun texte coupé par “…” dans la carte : le titre
                  complet […]. Les textes longs passent à la ligne au lieu d'être tronqués, et la carte grandit
                  en hauteur. » La place de la miniature est toujours laissée — elle garde ses 132 px fixes —,
                  mais c'est la HAUTEUR qui absorbe les titres longs.

                  ⚠️ LE `title` RESTE, ET IL N'EST PLUS UN FILET : c'est une bulle de confort. Le retirer serait
                  un retrait, qu'Arno n'a pas demandé. */}
              <span className="gst-objet gst-objet--entier" title={objet}>{objet}</span>
              {/**
                * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE — CETTE LIGNE A ÉTÉ ÉPURÉE, POINTS 1, 2 ET 5 ═══════════════
                *
                * ACCORD D'ARNO (07/10/2026), et SEULEMENT pour ces retraits-là :
                *   ① la RÉFÉRENCE (« GES-2026-000001 ») et l'ÉTAT (« En cours ») quittent la carte. Ils restent
                *      ailleurs — fiche du bien, fenêtre de l'événement — et n'y sont pas touchés ;
                *   ② le TYPE prend leur place en tête de ligne. Il était déjà là (lot EVENEMENT-MINIMALISTE,
                *      point 2), au même libellé et au même style : seul son rang change ;
                *   ⑤ « dernier échange il y a N jours » quitte CETTE ligne — il est déjà dit, en entier, par
                *      « Ouvert depuis N jours · dernier échange il y a N jours » juste en dessous
                *      (`LignesDuDossier`). Le compteur « N échange » reste.
                *
                * 🔴 LE TYPE NE S'AFFICHE QUE S'IL EST RENSEIGNÉ **ET RECONNU** (`categorieValide`). La condition
                * d'avant (`!== null && !== undefined`) laissait passer une chaîne vide ou un mot inconnu, que
                * `motCategorie` rend « Non précisée » : la carte aurait affiché un type là où il n'y en a pas,
                * exactement ce qu'Arno demande d'éviter.
                */}
              {/* ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — LE TYPE QUITTE CETTE COLONNE ═══════════════════
                  ARNO (07/10/2026) : « Le type sort de la colonne de texte de gauche : le mot “Travaux” qui s'y
                  affiche aujourd'hui est DÉPLACÉ dans la capsule, pas doublé. »

                  🔴 DÉPLACÉ, ET NON RETIRÉ : il est juste à droite, sous la vignette d'étape, et il y est
                  désormais VISIBLE MÊME QUAND IL MANQUE (« Type à définir »). On en voit donc plus qu'avant,
                  pas moins. L'afficher aux deux endroits aurait été la seule vraie perte : deux mots pour une
                  information, et le doute sur lequel des deux fait foi. */}
              <LignesDuDossier carte={carte} maintenant={maintenant} />
            </span>
            {/**
              * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — LA CAPSULE MONGA SOUS LA VIGNETTE ════════════════
              *
              * Arno : « afficher la capsule verte Monga JUSTE EN DESSOUS de la vignette de droite (celle qui
              * montre “Intervention 12/10/2026”). Elle indique la DERNIÈRE étape Monga de l'événement. »
              *
              * 🔴 ELLE N'EST PAS NOUVELLE : c'est la capsule `gst-monga-vignette` qui vivait au bout de la ligne
              * de la référence — même classe, même dessin (fond vert, texte blanc), mêmes références au survol
              * et pour le lecteur d'écran. Elle CHANGE DE PLACE et gagne l'étape ; rien n'est retiré de la carte.
              *
              * 🔴 L'ÉTAPE VIENT DE LA MÊME SOURCE QUE LA FRISE (`sqlDerniereEtape`, borné aux étapes de Monga) :
              * aucune seconde requête, et donc aucun risque que la capsule et la frise se contredisent.
              *
              * ⚠️ PAS DE RÉFÉRENCE MNG VIVE ⇒ PAS DE CAPSULE, et c'est le cas ordinaire. La condition est
              * exactement celle d'avant (`mongaRefs`), pour que la capsule apparaisse aux mêmes dossiers.
              */}
            <span className="gst-carte-droite">
              <MiniatureEtape etape={carte.derniereEtape} ouvertLe={carte.ouvertLe}
                misAJourLe={misAJour ? majMonga : null} />
              {/**
                * ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — LA CAPSULE DU TYPE ═══════════════════════════════
                *
                * ARNO, 4e demande : « voir EN UN COUP D'ŒIL le type de chaque événement sur sa carte. Une capsule
                * qui affiche le type, placée JUSTE EN DESSOUS de la vignette d'étape de droite. Même largeur
                * exacte que cette vignette, alignée dessus, petit écart vertical. […] l'ordre est : vignette
                * d'étape → capsule de type → capsule Monga. Toutes à la même largeur. »
                *
                * 🔴 LA MÊME LARGEUR N'EST PAS RECOPIÉE : la colonne est en `align-items:stretch`, donc chacune de
                * ses filles prend sa largeur (132 px). Réécrire « width:132px » sur la capsule aurait fait une
                * troisième valeur à tenir — et c'est exactement ce qui finit par diverger sur écran étroit, où la
                * colonne passe à 100 %.
                *
                * 🔴 SANS TYPE, LA CAPSULE EST LÀ QUAND MÊME, en gris neutre, et elle se clique. Cette règle en
                * REMPLACE une autre, posée au lot CARTE-EVENEMENT-EPUREE (« pas de type → rien ») : Arno revient
                * dessus — « Arno veut toujours voir l'information ». Un vide ne se distingue pas d'un oubli.
                *
                * ⚠️ LE MOT PORTE L'INFORMATION, LA COULEUR NE FAIT QUE L'APPUYER : le type est écrit en toutes
                * lettres dans la capsule, et le ton ne sert qu'à le reconnaître de loin.
                */}
              {/**
                * ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 1 — DEUX AXES SUR UNE SEULE CAPSULE ═══════════════════════
                *
                * ARNO (08/10/2026) : « La couleur de fond de la capsule de type ne dépend plus du type : elle
                * traduit le degré d'urgence de l'événement. Le texte affiché reste le type (“Travaux”,
                * “Fuite”…). […] Événement sans niveau d'urgence enregistré : capsule grise neutre (comme
                * aujourd'hui pour “Type à définir”). »
                *
                * 🔴 DEUX CLASSES, PARCE QUE CE SONT DEUX FAITS INDÉPENDANTS : le TEXTE vient du type (ou de son
                * absence), le FOND vient de l'urgence (ou de son absence). Les quatre combinaisons existent, et
                * la plus intéressante est celle qu'une classe unique aurait rendue impossible : « Type à définir »
                * en ROUGE, c'est-à-dire un dossier urgent que personne n'a encore qualifié.
                *
                * 🔴 `--vide` RESTE, ET NE PORTE PLUS QUE LE BORD POINTILLÉ ET LA MAIN : c'est elle que `auClic`
                * interroge pour reconnaître un clic sur « Type à définir ». Son fond gris a déménagé dans
                * `--sans-urgence`, qui dit maintenant autre chose — l'absence de NIVEAU, non de type.
                *
                * ⚠️ LE MOT PORTE L'INFORMATION, LA COULEUR NE FAIT QUE L'APPUYER — et le niveau, qui n'est plus
                * écrit dans la capsule, l'est DANS SA BULLE et au lecteur d'écran. Sans cela, le degré d'urgence
                * n'existerait que comme une couleur : illisible en niveaux de gris, et pour un daltonien.
                */}
              <span
                className={[
                  'gst-type-capsule',
                  ton === null ? 'gst-type-capsule--sans-urgence' : `gst-type-capsule--urg-${ton}`,
                  typeEvenement === null ? 'gst-type-capsule--vide' : '',
                ].filter((c) => c !== '').join(' ')}
                title={[
                  typeEvenement === null
                    ? 'Aucun type sur cet événement — cliquez pour le choisir'
                    : `Type de l’événement : ${motCategorie(typeEvenement)}`,
                  urgence === null ? 'Aucun niveau d’urgence enregistré' : `Urgence : ${motUrgence(urgence)}`,
                ].join(' — ')}>
                {typeEvenement === null ? MOT_TYPE_A_DEFINIR : motCategorie(typeEvenement)}
                <span className="gst-sr-only">
                  {urgence === null
                    ? ' — aucun niveau d’urgence enregistré'
                    : ` — urgence : ${motUrgence(urgence)}`}
                </span>
                {typeEvenement === null && (
                  <span className="gst-sr-only"> — cliquez pour ouvrir le choix du type</span>
                )}
              </span>
              {(carte.mongaRefs ?? []).length > 0 && (
                <span className="gst-monga-vignette gst-monga-vignette--sous"
                  title={[(carte.mongaRefs ?? []).join(', '), motEtapeMonga(carte.derniereEtapeMonga)]
                    .filter((x) => x !== null && x !== '').join(' — ')}>
                  MONGA
                  {motEtapeMonga(carte.derniereEtapeMonga) !== null && <>
                    <span className="gst-sep" aria-hidden="true"> · </span>
                    {motEtapeMonga(carte.derniereEtapeMonga)}
                  </>}
                  <span className="gst-sr-only"> — suivi par Monga, {(carte.mongaRefs ?? []).join(', ')}
                    {motEtapeMonga(carte.derniereEtapeMonga) !== null
                      && `, dernière étape Monga : ${motEtapeMonga(carte.derniereEtapeMonga) ?? ''}`}
                  </span>
                </span>
              )}
            </span>
          </span>
        }
      >
        {() => (
          <CorpsCarte evenementId={carte.evenementId} onDetail={setDetail} onGeste={onGeste}
            partage={partage} onOuvrirBien={onOuvrirBien}
            /**
             * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — CE QUE LA CARTE REPLIÉE DIT DÉJÀ, pour ne pas le répéter en
             * dessous. Les deux noms viennent de `LignesDuDossier`, quelques lignes plus haut, et de nulle
             * part ailleurs : c'est LUI qui les écrit, et c'est donc lui qui sait lesquels sont « déjà dits ».
             */
            dejaDits={[carte.bien?.proprietaire ?? null, carte.bien?.locataire ?? null]
              .filter((n): n is string => n !== null && n.trim() !== '')} />
        )}
      </BlocRepliable>
    </li>
  );
}

/** Le contenu d'une carte dépliée. Monté au PREMIER dépliage — c'est là, et seulement là, que la requête part. */
function CorpsCarte({ evenementId, onDetail, onGeste, partage, onOuvrirBien, dejaDits = [] }: {
  evenementId: number; onDetail: (d: CarteDetail) => void; onGeste: Rapport;
  partage: boolean;
  onOuvrirBien?: (cleBien: string, evenementId: number) => void;
  /**
   * 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — les noms que la carte REPLIÉE affiche déjà. Vide = elle n'en affiche
   * aucun, et tout ce qu'on sait du bien se dit alors sous le repli.
   */
  dejaDits?: readonly string[];
}) {
  const [etatVue, setEtatVue] = useState<VueCarte>({ v: 'charge' });
  const [occupe, setOccupe] = useState(false);
  /**
   * 🔴🔴 LOT CARTES-EVENEMENT-MEME-GESTE — L'ÉTAT `edition` ET SON NONCE ONT DISPARU AVEC LEUR FORMULAIRE.
   * `FormulaireCarte` ne vit plus dans la carte (il est dans la fiche du bien, et ce fichier continue de
   * l'EXPORTER pour elle) : un état qui n'ouvre plus rien serait un troisième état à tenir pour personne. Le
   * nonce de la capsule « Type à définir » reste côté `CarteVive`, où il sert encore à DÉPLIER la carte.
   */

  /** Relit la carte et POSE l'état. Sert au « Réessayer » et à la relecture qui suit un geste. */
  const lire = useCallback(async () => {
    const r = await chargerCarte(evenementId);
    setEtatVue(r);
    if (r.v === 'ok') onDetail(r.d);
  }, [evenementId, onDetail]);

  /**
   * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — OUVRIR LA VUE DE L'ÉVÉNEMENT ÉTEINT L'EFFET ═════════════════════
   *
   * Arno : « […] OU ouvre la vue de l'événement ». Ce corps n'est monté QUE lorsqu'on déplie la carte — le
   * chargement est paresseux depuis le lot 4c. Être monté, c'est avoir ouvert le dossier.
   *
   * 🔴 LA MÊME PORTE QUE LES DEUX AUTRES CHEMINS, et c'est tout l'intérêt : trois écritures différentes auraient
   * fini par éteindre l'effet à un endroit sans l'éteindre à l'autre.
   *
   * ⚠️ IL S'EXÉCUTE MÊME SI LA VIGNETTE N'ÉTAIT PAS ALLUMÉE, et c'est voulu : déplier un dossier, c'est l'avoir
   * vu. Marquer la date maintenant évite que la prochaine relève ne rallume un effet pour une étape qu'on vient
   * de lire.
   */
  useEffect(() => {
    void fetch('/api/admin/gestion/evenements/vus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [evenementId] }),
    }).catch(() => undefined);
  }, [evenementId]);

  // Chargement au montage — c'est-à-dire au PREMIER dépliage, puisque `BlocRepliable` ne monte son enfant qu'alors.
  //   Le premier acte est un `await` : aucun setState ne part du corps de l'effet (pas de cascade de rendus), et
  //   `annule` empêche d'écrire dans un composant démonté entre-temps. Même patron que les autres écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const r = await chargerCarte(evenementId);
      if (annule) return;
      setEtatVue(r);
      if (r.v === 'ok') onDetail(r.d);
    })();
    return () => { annule = true; };
  }, [evenementId, onDetail]);

  /** Un geste sur la carte : un appel, un compte rendu, une relecture. Jamais un silence. */
  const agir = useCallback(async (corps: unknown, succes: string) => {
    if (occupe) return;
    setOccupe(true);
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${evenementId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Modification impossible.'); return; }
      onGeste(succes);
      await lire();
    } catch {
      onGeste('Modification impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  }, [occupe, evenementId, onGeste, lire]);

  if (etatVue.v === 'charge') return <p className="gst-info" role="status">Chargement du dossier…</p>;
  if (etatVue.v === 'erreur') {
    return (
      <div className="gst-corps">
        <p className="gst-erreur" role="status">{etatVue.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void lire()}>Réessayer</button>
      </div>
    );
  }

  const d = etatVue.d;
  /**
   * ══ 🔴🔴 LOT CARTES-EVENEMENT-MEME-GESTE — LA CARTE DÉPLIÉE N'EST PLUS QU'UN TREMPLIN ═══════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DÉCISION D'ARNO (08/10/2026), mot pour mot : « SIMPLE CLIC → la carte se déplie et montre UNIQUEMENT : les
   * informations absentes de la carte repliée […] ; le bouton rouge “Ouvrir la fiche du bien sur cet événement →”,
   * dans la capsule. » Et : « RETRAITS dans la carte DÉPLIÉE, sur les deux écrans (accord d'Arno, doublon avec la
   * fiche du bien) : tout ce qui s'y affichait en plus des infos manquantes et du bouton rouge disparaît. »
   *
   * ═══ 🔴🔴 CE QUI DISPARAÎT, ET OÙ CHAQUE CHOSE A ÉTÉ RETROUVÉE AVANT D'ÊTRE RETIRÉE ═════════════════════════
   *
   * Arno l'exige : « AVANT de retirer : vérifie que chaque élément retiré existe bien dans la fiche du bien sur
   * cet événement. » Vérification faite, pièce par pièce :
   *
   *   · le SÉLECTEUR D'URGENCE          → `EvenementsDuBien` (fiche du bien), en mode compact ;
   *   · la frise « AVANCEMENT »          → `EvenementsDuBien`, même composant `FriseAvancement` ;
   *   · « Clôturer cet événement ? »     → `EvenementsDuBien`, qui passe déjà `onProposerCloture` ;
   *   · « MODIFIER les informations »    → `EvenementsDuBien`, et c'est LE MÊME `FormulaireCarte` (toujours
   *                                        exporté par ce fichier) — donc le choix du TYPE avec lui ;
   *   · le RÉSUMÉ (Quoi / Qui demande / Adresse / Ouvert) → les mêmes champs, lisibles et corrigeables, dans ce
   *                                        formulaire-là ;
   *   · « Détacher l'échange »           → `Conversation.tsx`, menu d'un échange ;
   *   · « Déplacer l'échange… »          → `PanneauAffecter` (« Rattacher à : événement existant »), rendu par
   *                                        `Conversation.tsx` — donc atteignable depuis la boîte ET depuis la
   *                                        fiche du bien (la frise ouvre un fil) ;
   *   · « Remettre dans son échange »    → `Conversation.tsx` ;
   *   · le badge MONGA et « Vers Mission » → `EncartMonga`, depuis le mail qui porte la référence.
   *
   * ⚠️ DEUX FONCTIONS PERDENT LEUR SEUL CHEMIN, ET ELLES SONT DITES À ARNO PLUTÔT QUE TUES : « Tout l'historique
   * des échanges → » DE CET ÉVÉNEMENT (l'écran historique reste, mais plus aucun lien n'émet `cible=carte-<id>`),
   * et la proposition Monga « Monga a marqué cette intervention terminée. Clore l'événement ? » (la clôture, elle,
   * reste offerte par la frise de la fiche). Arno a accordé le retrait des « échanges » et des « informations » en
   * toutes lettres : ces deux-là en font partie.
   *
   * ═══ 🔴🔴 LA SEULE CHOSE QUE JE NE RETIRE PAS, ET POURQUOI ══════════════════════════════════════════════════
   *
   * ARNO : « Si l'un n'existe nulle part ailleurs […], ne le retire pas : interromps-toi et dis-le à Arno. »
   *
   * Les trois boutons « À traiter / En cours / Traité » (`EtatCarte`) sont dans ce cas, et ils sont les SEULS :
   * la fiche du bien les a perdus au lot EVENEMENT-MINIMALISTE, dont le commentaire dit noir sur blanc « il reste
   * une porte d'écriture : celle de la vue de l'événement en plein écran ». Les retirer ferait perdre « En cours »
   * et la RÉOUVERTURE d'un événement traité — la frise ne sait que CLORE, et seulement quand elle le propose.
   * Ils restent donc ici, en PLEIN ÉCRAN seulement, en attendant un mot d'Arno. C'est l'unique écart entre les
   * deux écrans, et il tient en une ligne à supprimer.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  return (
    <div className={`gst-corps${partage ? ' gst-corps--partage' : ''}`}>
      {/**
        * 🔴 LE BOUTON ROUGE, SUR LES DEUX ÉCRANS (Arno, point 1). Il ne vivait que dans l'écran partagé ; c'est
        * désormais le geste principal de la carte dépliée, où qu'elle soit rendue.
        */}
      <OuvrirLaFicheDuBien biens={d.biens ?? []} evenementId={evenementId} onOuvrirBien={onOuvrirBien} />

      {/**
        * 🔴 LES INFORMATIONS ABSENTES DE LA CARTE REPLIÉE (Arno, point 1), c'est-à-dire les noms que la vignette
        * ne dit pas : locataires actuels et propriétaires. Calcul des Parties, inchangé depuis le lot
        * URGENCE-EVENEMENT.
        */}
      <PartiesManquantes parties={d.parties} dejaDits={dejaDits} />

      {/**
        * 🔴🔴 L'UNIQUE EXCEPTION, EN PLEIN ÉCRAN SEULEMENT — voir l'encadré ci-dessus. `EtatCarte` n'existe nulle
        * part ailleurs dans l'application, et Arno demande de NE PAS retirer ce qui serait alors perdu.
        */}
      {partage ? null : (
        <EtatCarte etat={d.etat} traiteLe={d.traiteLe} traitePar={d.traitePar} occupe={occupe}
          onEtat={(e) => void agir({ etat: e }, `Événement ${d.reference} : ${libelleEtat(e).toLowerCase()}.`)} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — LES LIGNES COURTES DE LA VIGNETTE ════════════════════════════════

   Arno : « ajoute, sur des lignes courtes : […] “Ouvert depuis N jours” ET “dernier échange il y a N jours” ;
   l'adresse du bien (avec le lot) ; le propriétaire, le locataire en place s'il y en a un, et “Demandé par
   <nom>”. »

   🔴 DES LIGNES COURTES, ET CHACUNE SE TAIT QUAND ELLE N'A RIEN À DIRE. Un « propriétaire : non renseigné » sur
   chaque vignette ferait trois lignes de vide par dossier ; c'est l'absence de la ligne qui dit l'absence.

   ⚠️ « N JOURS » SE CALCULE ICI, AVEC L'INSTANT DE RÉFÉRENCE DE L'ÉCRAN — jamais `Date.now()` caché dedans :
   c'est la règle de `depuis`, et elle vaut pour que toutes les lignes d'une même page disent la même heure.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 3 — LE MOT DE LA DERNIÈRE ÉTAPE MONGA ════════════════════════════════
 *
 * Le MÊME mot que la frise et que la miniature : `motEtape` pour le type, le titre saisi pour une carte libre.
 * Écrit ici une seule fois, parce que la capsule l'affiche, le met dans sa bulle et le dit au lecteur d'écran —
 * trois endroits qui ne doivent pas se mettre à diverger.
 *
 * ⚠️ `null` = AUCUNE ÉTAPE VENUE DE MONGA : la capsule se contente alors de « MONGA », comme avant ce lot.
 */
function motEtapeMonga(e: DerniereEtapeVignette | null | undefined): string | null {
  if (e === null || e === undefined) return null;
  const titre = e.titre?.trim() ?? '';
  return e.type === 'autre' && titre !== '' ? titre : motEtape(e.type);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT URGENCE-EVENEMENT, POINT 5 — LES PARTIES QUE LA CARTE REPLIÉE NE DIT PAS ══════════════════════════

   DEMANDE D'ARNO (08/10/2026), mot pour mot : « Quand on déplie la carte, afficher les noms qui n'apparaissent pas
   dans la carte repliée : le ou les locataires actuels, et le ou les propriétaires s'ils manquent. Réutilise le
   calcul du bloc Parties de la fiche bien (pas de seconde requête qui recalcule à sa façon). Si une partie est
   déjà affichée dans la carte repliée, elle n'est pas répétée. Pas de numéro de lot interne. »

   ═══ 🔴🔴 CE QUE LA CARTE REPLIÉE DIT DÉJÀ, ET POURQUOI IL EN MANQUE ════════════════════════════════════════════

   `LignesDuDossier` écrit « Propriétaire : X · Locataire en place : Y » — mais UN SEUL de chaque, et pour UN SEUL
   bien : `sqlBienDeLEvenement` rend le premier lot par clé (`ORDER BY c.cle LIMIT 1`) et, dans ce lot, la dernière
   occupation ouverte (`LIMIT 1`). Un bien en COLOCATION, un bien à plusieurs PROPRIÉTAIRES, ou un événement qui
   porte deux lots : la carte repliée n'en montre qu'un bout, et c'est ce bout-là qu'Arno veut compléter.

   ═══ 🔴🔴 « RÉUTILISE LE CALCUL », ET C'EST LA DÉCISION DE CE POINT ═════════════════════════════════════════════

   La liste arrive TOUTE FAITE de la route (`parties`), qui la tire de `personnesDesBiens` + `personnesEnVigueur` —
   le calcul que l'étape 2 du classement AFFICHE et que la création d'un événement depuis Monga emploie déjà pour
   POSER les parties d'une carte neuve. Ce composant ne calcule donc rien d'autre que la SOUSTRACTION demandée :
   retirer ce qui est déjà écrit au-dessus.

   ⚠️ LA COMPARAISON PASSE PAR `normaliserNom`, ET IL LE FAUT ABSOLUMENT. Les deux listes ne viennent pas de la
   même colonne : la carte repliée écrit `gestion_annuaire_lot.proprietaire_texte`, la fiche écrit
   `gestion_annuaire_proprietaire.nom_complet`. « VALET / RAEPSAET Damien et Michelle » et « Valet-Raepsaet Damien
   et Michelle » sont la MÊME personne et deux chaînes différentes : un `===` aurait répété tout le monde, c'est-à-
   dire exactement ce qu'Arno interdit. `normaliserNom` est la fonction que les documents automatiques emploient
   pour cette question précise, et elle est PURE.

   ⚠️ PAS DE NUMÉRO DE LOT (Arno) : on n'écrit que des NOMS et leur rôle. L'adresse du bien est déjà dans la carte
   repliée, et le lot interne n'y a jamais eu sa place.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Comment chaque rôle s'annonce. Les MÊMES mots que `LignesDuDossier`, pour qu'on lise une liste et non deux. */
const MOTS_PARTIE: Record<'proprietaire' | 'locataire', string> = {
  proprietaire: 'Propriétaire',
  locataire: 'Locataire en place',
};

function PartiesManquantes({ parties, dejaDits }: {
  parties: { sorte: 'proprietaire' | 'locataire'; nom: string }[] | undefined;
  dejaDits: readonly string[];
}) {
  /* ⚠️ ABSENTE ⇒ RIEN, et ce n'est pas la même chose que vide : une réponse antérieure à ce lot ne porte pas le
     champ, et l'écran doit alors être celui d'avant — jamais une ligne « aucune partie » inventée. */
  if (parties === undefined) return null;

  const connus = new Set(dejaDits.map(normaliserNom).filter((n) => n !== ''));
  const lignes = (['proprietaire', 'locataire'] as const).map((sorte) => {
    const noms: string[] = [];
    /* ⚠️ DÉDOUBLONNÉ AUSSI À L'INTÉRIEUR DE LA LISTE : une même personne peut être propriétaire de DEUX lots du
       même événement. Deux fois son nom se lirait comme deux personnes. */
    const vus = new Set<string>();
    for (const p of parties) {
      if (p.sorte !== sorte) continue;
      const cle = normaliserNom(p.nom);
      if (cle === '' || connus.has(cle) || vus.has(cle)) continue;
      vus.add(cle);
      noms.push(p.nom.trim());
    }
    return { sorte, noms };
  }).filter((l) => l.noms.length > 0);

  /* 🔴 RIEN À AJOUTER ⇒ RIEN DU TOUT. Un bloc « (aucune autre partie) » sur chaque carte serait deux lignes de
     vide par dossier : c'est l'absence de la ligne qui dit l'absence, règle de `LignesDuDossier`. */
  if (lignes.length === 0) return null;

  return (
    <p className="gst-parties">
      {lignes.map((l) => (
        <span key={l.sorte} className="gst-parties-ligne">
          <span className="gst-parties-role">{MOTS_PARTIE[l.sorte]}&nbsp;:</span>
          {' '}
          {l.noms.join(' · ')}
        </span>
      ))}
    </p>
  );
}

/** « N jours » depuis une date. PUR dans son esprit : l'instant de référence est injecté. */
function enJours(iso: string | null, maintenant: Date): number | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const jours = Math.floor((maintenant.getTime() - d.getTime()) / 86_400_000);
  /* ⚠️ UNE DATE FUTURE (horloges désaccordées) VAUT ZÉRO, jamais un nombre négatif — même prudence que
     `depuis`, qui ramène « il y a -2 heures » à « à l'instant ». */
  return jours < 0 ? 0 : jours;
}

/** « 0 jour » / « 1 jour » / « 7 jours » — accordé, parce qu'un « 1 jours » dans un écran soigné se remarque. */
function motJours(n: number): string {
  return n <= 1 ? `${n} jour` : `${n} jours`;
}

function LignesDuDossier({ carte, maintenant }: { carte: CarteEvenement; maintenant: Date }) {
  const ouvertDepuis = enJours(carte.ouvertLe, maintenant);
  const dernier = enJours(carte.dernierEchangeLe, maintenant);
  const b = carte.bien ?? null;
  const lieu = b === null ? null
    : [b.adresse, b.commune].filter((x) => x !== null && x !== '').join(', ');
  /**
   * ══ 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 6 — L'ADRESSE SEULE, SANS LE NUMÉRO DE LOT ════════════════════════
   *
   * CE QUI ÉTAIT ÉCRIT ICI : « l'adresse du bien (AVEC LE LOT) — Arno. Le numéro de lot est ce qui identifie le
   * bien dans WIPPIMMO, et deux adresses se ressemblent souvent dans un même immeuble. » ACCORD D'ARNO
   * (07/10/2026) : « lot 315 — 67 rue de Normandie, COURBEVOIE » devient « 67 rue de Normandie, COURBEVOIE ».
   *
   * ⚠️ LE LOT RESTE LE SEUL NOM D'UN BIEN SANS ADRESSE : quand on n'a pas de lieu à écrire, « lot 315 » reste —
   * sans quoi la ligne disparaîtrait, et avec elle le seul moyen de savoir de quel bien on parle. Arno ne demande
   * pas de retirer le lot, mais de ne plus le mettre DEVANT une adresse.
   *
   * ⚠️ AILLEURS DANS L'APPLICATION, RIEN NE CHANGE : la forme « adresse — lot N » (suffixe) des autres écrans
   * n'est pas touchée.
   */
  const adresse = b === null ? null
    : (lieu === null || lieu === '' ? `lot ${b.cle}` : lieu);
  const gens = b === null ? [] : [
    b.proprietaire === null ? null : `Propriétaire : ${b.proprietaire}`,
    b.locataire === null ? null : `Locataire en place : ${b.locataire}`,
  ].filter((x): x is string => x !== null);
  if (carte.demandeur !== null && carte.demandeur !== '') gens.push(`Demandé par ${carte.demandeur}`);

  return (
    <>
      {(ouvertDepuis !== null || dernier !== null) && (
        <span className="gst-carte-ligne">
          {ouvertDepuis !== null && <>Ouvert depuis {motJours(ouvertDepuis)}</>}
          {ouvertDepuis !== null && dernier !== null && <span aria-hidden="true"> · </span>}
          {dernier !== null && <>dernier échange il y a {motJours(dernier)}</>}
        </span>
      )}
      {adresse !== null && (
        <span className="gst-carte-ligne gst-carte-ligne--adresse">
          {adresse}
          {/* ⚠️ PLUSIEURS BIENS : on montre le premier et l'on DIT qu'il y en a d'autres. Taire le nombre
              serait mentir par omission ; les lister tous rendrait la liste illisible. */}
          {carte.nbBiens > 1 && <> {`(+ ${carte.nbBiens - 1} autre${carte.nbBiens > 2 ? 's' : ''} bien${carte.nbBiens > 2 ? 's' : ''})`}</>}
        </span>
      )}
      {gens.length > 0 && <span className="gst-carte-ligne">{gens.join(' · ')}</span>}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — LA MINIATURE DE LA DERNIÈRE ÉTAPE ═══════════════════════════════════

   Arno : « une miniature de la DERNIÈRE carte d'étape de sa frise (même dessin qu'un carré de la frise, en
   réduit : nom de l'étape et date, contour vert, pictogramme Monga si elle vient de Monga, ambre si “à
   confirmer”). Sans aucune étape : “Ouverture” et sa date. »

   🔴 LE MÊME DESSIN, ET LES MÊMES TROIS COULEURS QUE LA FRISE : vert = dans la frise, ambre = « à confirmer ».
   C'est ce qui fait qu'on reconnaît la carte en ouvrant le dossier — une miniature qui ne ressemblerait pas à sa
   carte obligerait à réapprendre deux fois le même code de couleurs.

   ⚠️ ELLE PORTE SON PROPRE PRÉFIXE `gst-mini-` ET NON `fav-` : la feuille de la frise n'est pas injectée sur
   l'écran partagé (la frise n'y est pas montée), et surtout — leçon du lot FRISES-REPARATION — deux composants
   ne partagent JAMAIS un préfixe de classe, il n'y a pas de portée en CSS.

   ⚠️ LA COULEUR NE PORTE PAS L'INFORMATION SEULE : le mot « à confirmer » est écrit, et le pictogramme de source
   est doublé d'un texte au lecteur d'écran.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function MiniatureEtape({ etape: brut, ouvertLe, misAJourLe = null }: {
  etape: DerniereEtapeVignette | null | undefined; ouvertLe: string;
  /**
   * 🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — l'heure de la mise à jour Monga, quand l'effet est allumé. `null` =
   * éteint, et la miniature est alors exactement celle du point 2.
   */
  misAJourLe?: string | null;
}) {
  /**
   * ══ 🔴🔴 ABSENT ET `null` SONT LA MÊME CHOSE ICI, ET C'EST UN DÉFAUT MESURÉ ════════════════════════════════
   *
   * Premier jet : `etape === null`. La suite a rendu `TypeError: Cannot read properties of undefined (reading
   * 'type')` sur **14 épreuves** de `GestionVue.fusion` — et ce n'est pas un artefact d'épreuve. Le champ arrive
   * d'une réponse JSON : il est ABSENT, et non `null`, dès qu'un appelant ne le pose pas — une page encore
   * ouverte pendant un déploiement, un écran qui construit une carte à la main, un cache.
   *
   * 🔴 ET LA CONSÉQUENCE ÉTAIT TOTALE : la vignette jetait, donc la liste entière, donc l'écran partagé. Une
   * miniature est un ORNEMENT ; elle ne doit jamais pouvoir emporter l'écran qui la porte.
   */
  const etape = brut ?? null;

  /**
   * 🔴 SANS AUCUNE ÉTAPE : « Ouverture » et sa date (Arno). C'est exactement ce que la frise montre dans le même
   * cas — sa carte d'ouverture dérivée de `gestion_evenement.ouvert_le` (lot FRISE-CONSTRUCTIBLE). Les deux
   * écrans disent donc la même chose, parce qu'ils lisent la même donnée.
   */
  const mot = etape === null
    ? motEtape('ouverture')
    : (etape.type === 'autre' && etape.titre !== null && etape.titre.trim() !== ''
      ? etape.titre.trim() : motEtape(etape.type));
  /* ⚠️ ET LA DATE RÉSISTE AUSSI À UNE CHAÎNE ABSENTE : une carte sans `ouvertLe` ne doit pas davantage jeter. */
  const quand = (etape?.survenuLe ?? ouvertLe ?? '').slice(0, 10);
  const date = quand.length === 10
    ? `${quand.slice(8, 10)}/${quand.slice(5, 7)}/${quand.slice(0, 4)}` : '—';
  const doute = etape !== null && etape.certitude === 'a_confirmer';
  const deMonga = etape !== null && etape.source === 'monga';

  return (
    <span className={`gst-mini${doute ? ' gst-mini--doute' : ''}`}>
      <span className="gst-mini-titre">
        {mot}
        {/* ⚠️ LE PICTO NE PORTE PAS L'INFORMATION SEUL : la source est dite juste après, au lecteur d'écran. */}
        {deMonga && <span className="gst-mini-picto" aria-hidden="true"> ◆</span>}
      </span>
      <span className="gst-mini-date">{date}</span>
      {doute && <span className="gst-mini-doute">à confirmer</span>}
      {/**
        * 🔴 LE BADGE « Mis à jour par Monga · <heure> » (Arno). Il porte l'HEURE, et non la date : l'effet ne
        * survit qu'à une mise à jour récente, et « 19:28 » répond à la question qu'on se pose en le voyant.
        *
        * 🔴 DÉFAUT MESURÉ, ET CORRIGÉ : le premier jet découpait la chaîne (`misAJourLe.slice(11, 16)`). La
        * route rend l'heure en UTC — le badge affichait **17:28** pour une écriture faite à **19:28**. Deux
        * heures d'écart, et rien à l'écran pour s'en apercevoir. `heureParis` la rend en heure de Paris, comme
        * tout le reste du module.
        */}
      {misAJourLe !== null && (
        <span className="gst-mini-monga">Mis à jour par Monga · {heureParis(misAJourLe)}</span>
      )}
      <span className="gst-sr-only">
        {etape === null
          ? `dernière étape : aucune, ouverture du ${date}`
          : `dernière étape : ${mot} du ${date}, ${deMonga ? 'venue de Monga' : 'posée à la main'}`}
        {misAJourLe !== null && ` — mis à jour par Monga à ${heureParis(misAJourLe)}`}
      </span>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — LE GROS BOUTON DE L'ÉCRAN PARTAGÉ ═══════════════════════════════════

   Arno : « un GROS bouton pleine largeur “Ouvrir la fiche du bien sur cet événement →”, qui ouvre la fiche du
   bien, défile jusqu'au bloc Événements, déplie cet événement et centre sa frise sur la dernière étape. Si
   l'événement concerne plusieurs biens : petit choix du bien d'abord. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function OuvrirLaFicheDuBien({ biens, evenementId, onOuvrirBien }: {
  biens: { cle: string; adresse: string | null; commune: string | null }[];
  evenementId: number;
  onOuvrirBien?: (cleBien: string, evenementId: number) => void;
}) {
  const [choix, setChoix] = useState(false);

  /**
   * 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 6 — L'ADRESSE SEULE, sans le numéro de lot devant. Même décision et
   * même repli que `LignesDuDossier` : le lot ne reste que lorsqu'il n'y a AUCUNE adresse à écrire, parce qu'il
   * est alors le seul nom du bien.
   */
  const mot = (b: { cle: string; adresse: string | null; commune: string | null }): string => {
    const lieu = [b.adresse, b.commune].filter((x) => x !== null && x !== '').join(', ');
    return lieu === '' ? `lot ${b.cle}` : lieu;
  };

  /* ⚠️ AUCUN BIEN : on le DIT. Un bouton qui ne mène nulle part s'apprend, et l'on cesse de le regarder. */
  if (onOuvrirBien === undefined || biens.length === 0) {
    return (
      <div className="gst-bloc">
        <p className="gst-note">
          {onOuvrirBien === undefined
            ? 'L’ouverture de la fiche n’est pas disponible depuis cet écran.'
            : 'Cet événement n’est rattaché à aucun bien : il n’y a pas de fiche à ouvrir.'}
        </p>
      </div>
    );
  }

  const ouvrables = biens.filter((b) => estCleAdressable(b.cle));

  /* 🔴 UN SEUL BIEN : le bouton y va directement. « Petit choix du bien D'ABORD » ne vaut qu'au pluriel (Arno). */
  if (ouvrables.length === 1 && biens.length === 1) {
    return (
      <div className="gst-bloc">
        {/**
          * 🔴🔴 LOT CARTE-EVENEMENT-EPUREE, POINT 4 — PLUS D'ADRESSE SOUS LE BOUTON. ACCORD D'ARNO : elle
          * redisait mot pour mot celle que la vignette porte quelques lignes plus haut. Le bouton, lui, reste.
          *
          * ⚠️ LA NOTE DU CAS « PLUSIEURS BIENS » N'EST PAS CONCERNÉE : elle ne dit pas une adresse, elle dit
          * combien il y en a — et c'est ce qui explique que le bouton ouvre un choix plutôt qu'une fiche.
          */}
        <button type="button" className="svv-btn svv-btn-primary gst-ouvrir-fiche"
          onClick={() => onOuvrirBien(ouvrables[0].cle, evenementId)}>
          Ouvrir la fiche du bien sur cet événement →
        </button>
      </div>
    );
  }

  return (
    <div className="gst-bloc">
      <button type="button" className="svv-btn svv-btn-primary gst-ouvrir-fiche"
        aria-expanded={choix} onClick={() => setChoix((c) => !c)}>
        Ouvrir la fiche du bien sur cet événement →
      </button>
      {choix && (
        <ul className="gst-choix-biens" aria-label="Choisir le bien">
          {biens.map((b) => (
            <li key={b.cle}>
              {estCleAdressable(b.cle)
                ? <button type="button" className="svv-btn svv-btn-outline gst-btn"
                  onClick={() => onOuvrirBien(b.cle, evenementId)}>{mot(b)}</button>
                /* ⚠️ IL EST LISTÉ QUAND MÊME, et son impossibilité est écrite : le taire ferait croire que
                   l'événement ne concerne pas ce bien. */
                : <span className="gst-note">{mot(b)} — fiche non adressable (clé non numérique)</span>}
            </li>
          ))}
        </ul>
      )}
      {!choix && (
        <p className="gst-note">
          {biens.length} biens concernés — le choix s’ouvre au clic.
        </p>
      )}
    </div>
  );
}

/** Les trois états, en toutes lettres. « Traité » DIT sa date : un dossier clos sans date serait introuvable après. */
function EtatCarte({ etat, traiteLe, traitePar, occupe, onEtat }: {
  etat: CarteDetail['etat']; traiteLe: string | null; traitePar: string | null; occupe: boolean;
  onEtat: (e: CarteDetail['etat']) => void;
}) {
  const choix: CarteDetail['etat'][] = ['a_traiter', 'en_cours', 'traite'];
  return (
    <div className="gst-bloc">
      <div className="gst-voies" role="group" aria-label="État de l’événement">
        {choix.map((c) => (
          <button key={c} type="button" className={`gst-voie${etat === c ? ' gst-voie--active' : ''}`}
            aria-pressed={etat === c} disabled={occupe || etat === c} onClick={() => onEtat(c)}>
            {libelleEtat(c)}
          </button>
        ))}
      </div>
      {etat === 'traite' && traiteLe && (
        <p className="gst-note">Traité le {formaterDateFr(traiteLe)}{traitePar ? ` par ${traitePar}` : ''}. Rouvrable à tout moment : il suffit de rechoisir un état.</p>
      )}
    </div>
  );
}


/** La correction à la main. Le pré-remplissage ne propose que ce qui est écrit dans le mail : il fallait pouvoir corriger. */
/**
 * 🔴 LOT EVENEMENT-MINIMALISTE, POINT 3 — EXPORTÉ pour le bloc « Événements » de la fiche du bien. Le « Modifier »
 * y est ajouté parce qu'il quitte l'écran partagé, et c'est LE MÊME formulaire : une copie aurait fini par
 * proposer d'autres champs d'un côté que de l'autre.
 */
export function FormulaireCarte({ detail, occupe, onValider, onAnnuler }: {
  detail: CarteDetail; occupe: boolean;
  onValider: (champs: {
    objet: string; demandeurNom: string; adresseLibre: string;
    /** 🔴 LOT CAPSULE-TYPE-EVENEMENT — ABSENTE quand le type n'a pas bougé : voir plus bas pourquoi. */
    categorie?: string;
  }) => void;
  onAnnuler: () => void;
}) {
  const [objet, setObjet] = useState(detail.objet);
  const [demandeur, setDemandeur] = useState(detail.demandeurNom ?? detail.demandeurEmail ?? '');
  const [adresse, setAdresse] = useState(detail.adresseLibre ?? '');
  /**
   * ══ 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — LE TYPE SE CHOISIT ICI, ET POUR LA PREMIÈRE FOIS ══════════════
   *
   * CONSTAT FAIT EN OUVRANT LE LOT : le type ne se posait QU'À LA CRÉATION (`BlocEvenement`). Ni ce formulaire,
   * ni le `PATCH` ne le portaient — un événement ouvert sans type le restait pour toujours, et la capsule
   * « Type à définir » n'aurait mené nulle part. Arno demande qu'un clic « ouvre l'endroit existant où l'on
   * choisit le type, sans créer de nouvel écran » : c'est donc CE formulaire — celui qu'ouvre déjà « Modifier les
   * informations de l'événement » — qui gagne le champ. Aucun écran de plus.
   *
   * 🔴 LES CHOIX VIENNENT DE LA SOURCE UNIQUE (`TYPES_EVENEMENT`), comme ceux du formulaire de création : un type
   * ajouté là-bas apparaît ici sans qu'on touche à ce fichier.
   */
  const [categorie, setCategorie] = useState(categorieValide(detail.categorie) ?? '');
  return (
    <div className="gst-bloc gst-champs">
      <label className="gst-champ">
        <span className="svv-label">Quoi</span>
        <input className="gst-saisie" value={objet} onChange={(e) => setObjet(e.target.value)} maxLength={300} />
      </label>
      <label className="gst-champ">
        <span className="svv-label">Qui demande</span>
        <input className="gst-saisie" value={demandeur} onChange={(e) => setDemandeur(e.target.value)} maxLength={300} />
      </label>
      <label className="gst-champ">
        <span className="svv-label">Adresse (texte libre)</span>
        <input className="gst-saisie" value={adresse} onChange={(e) => setAdresse(e.target.value)} maxLength={300} />
      </label>
      <label className="gst-champ">
        <span className="svv-label">Type</span>
        <select className="gst-saisie" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
          <option value="">{MOT_TYPE_A_DEFINIR}</option>
          {TYPES_EVENEMENT.map((t) => <option key={t.cle} value={t.cle}>{t.mot}</option>)}
        </select>
      </label>
      <p className="gst-note">Un champ vidé est effacé ; le « quoi », lui, ne peut pas rester vide — sans titre, la carte devient introuvable.</p>
      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe || objet.trim() === ''}
          /**
            * ⚠️ `categorie` N'EST ENVOYÉE QUE SI ELLE A CHANGÉ, et ce n'est pas une optimisation : sur une base
            * où la migration 268 n'est pas appliquée, la colonne n'existe pas et le serveur REFUSE d'écrire un
            * type. L'envoyer à chaque enregistrement aurait fait échouer une simple correction du « quoi » sur
            * ces bases-là. Qui touche au type reçoit un refus qui NOMME la mise à jour manquante ; qui n'y
            * touche pas ne s'en aperçoit jamais.
            */
          onClick={() => onValider({
            objet, demandeurNom: demandeur, adresseLibre: adresse,
            ...(categorie === (categorieValide(detail.categorie) ?? '') ? {} : { categorie }),
          })}>
          {occupe ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onAnnuler}>Annuler</button>
      </div>
    </div>
  );
}

/**
 * LOT 5b — `CorpsFil`, `Message` et leur ligne de pièce jointe ONT DÉMÉNAGÉ dans `Conversation.tsx`, qui est désormais
 * la SEULE vue conversation du module — utilisée par le poste de tri et par la boîte mail.
 *
 * 🔴 LOT CARTES-EVENEMENT-MEME-GESTE — « par la carte » A ÉTÉ RETIRÉ DE CETTE PHRASE, et c'est un fait, pas une
 * correction de style : la carte dépliée ne porte plus de conversation. Elle ne montre que les informations
 * absentes de la vignette et le bouton rouge vers la fiche du bien.
 *
 * RIEN N'EST PERDU au passage, et c'est la condition pour que ce déménagement soit acceptable : les gestes par message
 * (déplacer ce mail, le détacher), la liste des mails sortis de l'échange avec leur bouton « Remettre dans son
 * échange », les pièces servies par l'application, les images de signature repliées et l'historique cité repliable
 * sont tous dans la nouvelle vue. Elle y AJOUTE l'en-tête complet, le dépliage message par message et les messages
 * tenus hors de la file.
 */
