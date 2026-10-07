'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlocRepliable } from '../permis/BlocRepliable';
import { ChoisirEvenement } from './ChoisirEvenement';
import { MenuDiscret } from './MenuDiscret';
import { Conversation, MessageConversation } from './Conversation';
import { agirSurLeMail, DeplacerVers, type Rapport } from './gestesMail';
import type { CarteDetail, FilDeCarte, MailParti, MessageDeFil } from '../../../../lib/gestion/carteRepo';
/* 🔴 LOT MONGA-1, POINT 4 — le type seul, effacé à la compilation : ce composant vit dans le navigateur. */
import type { MongaDeLEvenement } from '../../../../lib/gestion/mongaRepo';
import type { CarteEvenement, DerniereEtapeVignette } from '../../../../lib/gestion/fileRepo';
/* 🔴 LOT VIGNETTE-EVENEMENT, POINT 2 — le mot d'une étape et la forme de sa date : modules PURS. */
import { motEtape } from '../../../../lib/gestion/mongaEtape';
/* 🔴 LOT EVENEMENT-MINIMALISTE, POINT 2 — le mot d'un TYPE d'événement. Module PUR, liste déjà en base (268).
   🔴🔴 LOT CAPSULE-TYPE-EVENEMENT — et sa COULEUR, et le mot de l'absence de type, et la LISTE pour le choisir :
   tout vient du même module, qui est désormais la seule déclaration des types. */
import {
  categorieValide, motCategorie, MOT_TYPE_A_DEFINIR, tonDuType, TYPES_EVENEMENT,
} from '../../../../lib/gestion/evenementQualite';
import type { Cible } from '../../../../lib/gestion/rattachement';
import {
  depuis, formaterDateFr, formaterTaille, heureParis, libelleEtat, libelleSens,
} from '../../../../lib/gestion/ecran';
/* 🔴🔴 LOT MONGA-2, POINT 4 — la frise d'avancement de l'événement. */
import { FriseAvancement } from './FriseAvancement';
import { statutDuMessage } from '../../../../lib/gestion/statutClassement';
import { corpsLisible, trierPieces } from '../../../../lib/gestion/lisibilite';

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

/** Même principe pour les messages d'un échange : on rapporte, on ne décide pas. */
async function chargerMessages(filId: number): Promise<
  { v: 'ok'; messages: MessageDeFil[]; partis: MailParti[] } | { v: 'erreur'; m: string }
> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/messages`, { cache: 'no-store' });
    if (!res.ok) return { v: 'erreur', m: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    const data = (await res.json()) as { messages: MessageDeFil[]; partis?: MailParti[] };
    return { v: 'ok', messages: data.messages, partis: data.partis ?? [] };
  } catch {
    return { v: 'erreur', m: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}


export function CarteVive({ carte, maintenant, onGeste, onHistorique, partage = false, onOuvrirBien }: {
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
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique de cette carte : ses échanges affectés ET les mails qui lui ont été
   * rattachés à la main. Absent = aucun bouton, et la carte est exactement celle d'avant ce lot.
   */
  onHistorique?: (cible: Cible) => void;
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
  const auClic = (e: React.MouseEvent<HTMLLIElement>): void => {
    marquerVu();
    const cible = e.target instanceof Element ? e.target : null;
    if (cible?.closest('.gst-type-capsule--vide') == null) return;
    e.stopPropagation();
    e.preventDefault();
    setDemandeDeType((n) => n + 1);
  };

  return (
    <li className={`gst-item${misAJour ? ' gst-item--monga' : ''}`} onClickCapture={auClic}>
      <BlocRepliable
        titreClasseExtra="gst-repli"
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
              <span
                className={`gst-type-capsule ${typeEvenement === null
                  ? 'gst-type-capsule--vide' : `gst-type-capsule--${tonDuType(typeEvenement)}`}`}
                title={typeEvenement === null
                  ? 'Aucun type sur cet événement — cliquez pour le choisir'
                  : `Type de l’événement : ${motCategorie(typeEvenement)}`}>
                {typeEvenement === null ? MOT_TYPE_A_DEFINIR : motCategorie(typeEvenement)}
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
          <CorpsCarte evenementId={carte.evenementId} maintenant={maintenant} onDetail={setDetail} onGeste={onGeste}
            onHistorique={onHistorique} partage={partage} onOuvrirBien={onOuvrirBien}
            /* 🔴 … ET LE MÊME NONCE OUVRE LE FORMULAIRE, où vit le choix du type. Deux effets, un seul geste. */
            demandeDeType={demandeDeType} />
        )}
      </BlocRepliable>
    </li>
  );
}

/** Le contenu d'une carte dépliée. Monté au PREMIER dépliage — c'est là, et seulement là, que la requête part. */
function CorpsCarte({ evenementId, maintenant, onDetail, onGeste, onHistorique, partage, onOuvrirBien,
  demandeDeType = 0 }: {
  evenementId: number; maintenant: Date; onDetail: (d: CarteDetail) => void; onGeste: Rapport;
  onHistorique?: (cible: Cible) => void;
  partage: boolean;
  onOuvrirBien?: (cleBien: string, evenementId: number) => void;
  /**
   * 🔴🔴 LOT CAPSULE-TYPE-EVENEMENT, POINT 1 — le nonce du clic sur « Type à définir ». `0` = personne n'a
   * demandé, et le corps est alors exactement celui d'avant ce lot.
   */
  demandeDeType?: number;
}) {
  const [etatVue, setEtatVue] = useState<VueCarte>({ v: 'charge' });
  const [occupe, setOccupe] = useState(false);
  /**
   * 🔴 OUVERT D'EMBLÉE QUAND ON ARRIVE PAR LA CAPSULE. Ce corps n'est MONTÉ qu'au premier dépliage : un clic sur
   * « Type à définir » déplie et monte en même temps, et l'effet ci-dessous ne verrait donc jamais de CHANGEMENT
   * de nonce. L'état initial lit le nonce ; l'effet, lui, sert aux clics SUIVANTS, carte déjà dépliée.
   */
  const [edition, setEdition] = useState(demandeDeType > 0);
  const dernierTypeDemande = useRef(demandeDeType);
  useEffect(() => {
    if (demandeDeType === dernierTypeDemande.current) return;
    dernierTypeDemande.current = demandeDeType;
    setEdition(true);
  }, [demandeDeType]);

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
      setEdition(false);
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
   * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 4 — LE GROS BOUTON FAIT PARTIE DE SA CAPSULE ═══════════════════
   *
   * Arno : « le bouton rouge flotte aujourd'hui entre deux événements. Intègre-le DANS la capsule dépliée : même
   * cadre, même fond, aucun vide entre la carte et le bouton, et un écart net avec l'événement suivant. »
   *
   * 🔴 IL ÉTAIT DÉJÀ DANS LE `li` DE SA CARTE — c'est l'HABILLAGE qui le faisait flotter : le corps gardait son
   * espace du haut, et le bouton était posé dans un `gst-bloc` à lui, encadré et sur un autre fond. Sur l'écran
   * partagé, où les cartes n'ont plus qu'un filet en bas, cette petite boîte se lisait comme un troisième objet,
   * entre deux événements. Ce modificateur colle le corps à la carte et rend le cadre du bloc transparent.
   *
   * ⚠️ EN PLEIN ÉCRAN, RIEN NE CHANGE : là, le corps porte l'état, la frise, le résumé et les échanges — autant
   * de blocs qui ONT besoin de leur cadre pour se distinguer les uns des autres.
   */
  return (
    <div className={`gst-corps${partage ? ' gst-corps--partage' : ''}`}>
      {/**
        * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — L'ÉTAT, OU LE GROS BOUTON : L'UN OU L'AUTRE ══════════════════
        *
        * ACCORD D'ARNO : le bloc « À traiter / En cours / Traité » quitte l'ÉCRAN PARTAGÉ. Sa fonction n'est pas
        * perdue — elle est ajoutée dans l'en-tête de l'événement sur la fiche du bien, et elle reste ici en plein
        * écran. **Même porte d'écriture** dans les trois endroits : `PATCH /evenements/[id] { etat }`.
        *
        * 🔴 À SA PLACE, DANS L'ÉCRAN PARTAGÉ : « un GROS bouton pleine largeur “Ouvrir la fiche du bien sur cet
        * événement →” » (Arno). C'est le geste qu'on veut faire depuis l'écran partagé — aller au dossier —, et
        * non celui qu'on y faisait par défaut d'avoir mieux.
        */}
      {partage
        ? <OuvrirLaFicheDuBien biens={d.biens ?? []} evenementId={evenementId} onOuvrirBien={onOuvrirBien} />
        : <EtatCarte etat={d.etat} traiteLe={d.traiteLe} traitePar={d.traitePar} occupe={occupe}
          onEtat={(e) => void agir({ etat: e }, `Événement ${d.reference} : ${libelleEtat(e).toLowerCase()}.`)} />}

      {/**
        * ══ 🔴🔴 LOT EVENEMENT-MINIMALISTE, POINT 3 — L'ÉCRAN PARTAGÉ S'ARRÊTE ICI ═════════════════════════════
        *
        * ACCORD D'ARNO (07/10/2026) : « sous la vignette dépliée, retire le titre “Avancement” et tout ce qui est
        * en dessous (alerte de clôture, frise, bloc Quoi / Qui demande / Adresse / Ouvert / Modifier). Il ne
        * reste que la vignette et le gros bouton “Ouvrir la fiche du bien sur cet événement →”. »
        *
        * 🔴 RIEN N'EST PERDU, ET C'EST VÉRIFIÉ PIÈCE PAR PIÈCE : la frise est dans le bloc « Événements » de la
        * fiche du bien depuis le lot MONGA-2 ; la proposition « Clôturer cet événement ? » y est AJOUTÉE par ce
        * lot (elle n'y passait pas `onProposerCloture`) ; le « Modifier » des informations de l'événement y est
        * AJOUTÉ aussi, avec le MÊME formulaire que celui-ci — pas une copie. Et le gros bouton mène là en un
        * clic, déplié sur le bon événement.
        *
        * 🔴 EN PLEIN ÉCRAN, RIEN NE CHANGE : tout ce qui suit s'affiche comme avant. L'écran partagé est une
        * LISTE — on y choisit un dossier, on ne le travaille pas.
        */}
      {partage ? null : (<>

      {/**
        * ══ 🔴🔴 LOT MONGA-1, POINT 4 — LE BADGE DE L'INTERVENTION, SA DERNIÈRE ÉTAPE, SON LIEN ════════════════
        *
        * Arno : « Sur l'événement : un badge “Monga MNG-23987”, la dernière étape (ex. “Devis en attente de
        * validation · 05/10”), et le lien “Vers Mission”. »
        *
        * 🔴 IL EST POSÉ SOUS L'ÉTAT, AVANT LE RÉSUMÉ : c'est le renseignement qui dit OÙ EN EST le travail, et
        * il doit se lire sans dérouler la carte.
        *
        * ⚠️ RIEN DU TOUT SUR UNE CARTE SANS MONGA — le cas ordinaire, et de très loin.
        */}
      {(d.monga ?? null) !== null && (
        <div className="gst-monga" role="note">
          <p className="gst-monga-tete">
            <span className="gst-monga-badge">{(d.monga as MongaDeLEvenement).badge}</span>
            <span className="gst-monga-etape">{(d.monga as MongaDeLEvenement).derniereEtapeMot}</span>
            {(d.monga as MongaDeLEvenement).lienMission !== null && (
              /* ⚠️ `noreferrer` : on n'annonce pas notre écran interne à Monga. */
              <a className="gst-monga-lien" target="_blank" rel="noreferrer"
                href={(d.monga as MongaDeLEvenement).lienMission ?? '#'}>Vers Mission</a>
            )}
          </p>
          {/**
            * 🔴🔴 LA PROPOSITION DE CLORE — ET SEULEMENT UNE PROPOSITION (Arno : « jamais automatique »).
            *
            * 🔴 LA MESURE QUI LA JUSTIFIE : l'audit n'a trouvé **qu'UN SEUL** mail « Mission terminée » pour
            * 40 références. Une clôture automatique ne fermerait donc presque rien — et fermerait parfois à
            * tort, puisqu'une intervention finie chez Monga peut encore attendre une facture ou une reprise
            * chez nous.
            *
            * ⚠️ ELLE PASSE PAR LA PORTE QU'ARNO EMPLOIE DÉJÀ (`onEtat('traite')` du bloc d'état) : même
            * journal, même réversibilité — rouvrir une carte est un geste normal, pas une réparation.
            */}
          {(d.monga as MongaDeLEvenement).terminee && d.etat !== 'traite' && (
            <p className="gst-monga-clore">
              <span>Monga a marqué cette intervention terminée. Clore l’événement ?</span>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe}
                onClick={() => void agir({ etat: 'traite' },
                  `Événement ${d.reference} clos après « Mission terminée » (Monga).`)}>
                Clore l’événement
              </button>
            </p>
          )}
        </div>
      )}

      {/**
        * ══ 🔴🔴 LOT MONGA-2, POINT 4 — LA FRISE D'AVANCEMENT, DANS LA VUE DE L'ÉVÉNEMENT ══════════════════════
        *
        * Arno : « Où elle s'affiche — dans la vue de l'événement. »
        *
        * 🔴 ELLE EST POSÉE SOUS LE BADGE MONGA ET AVANT LE RÉSUMÉ, pour la même raison que le badge lui-même :
        * c'est ce qui dit OÙ EN EST le travail, et cela doit se lire avant les détails administratifs de la
        * carte (demandeur, catégorie, note).
        *
        * 🔴 ELLE S'AFFICHE MÊME SANS MONGA, et c'est une demande explicite : « Fonctionne aussi pour un
        * événement SANS Monga (frise entièrement manuelle). » Sur un événement nu, elle montre sa carte
        * d'ouverture et le « + » rouge — c'est-à-dire un dossier qu'on peut tenir à la main dès le premier jour.
        *
        * ⚠️ CETTE PHRASE DISAIT « les sept étapes attendues en pointillé et le bouton “+ Ajouter une étape” »
        * jusqu'au lot FRISE-CONSTRUCTIBLE : les pointillés ont été supprimés sur accord d'Arno, et le bouton est
        * devenu le « + ». Rien n'est perdu — tous ces types restent posables par le réservoir, autant de fois
        * que nécessaire.
        *
        * 🔴 LOT FRISE-COMPACTE : c'est LE MÊME composant que dans le bloc « Événements » de la fiche du bien,
        * donc le même comportement — une seule rangée par défaut, l'espace du bas déployé à la demande seule.
        * Arno, point 5 : « Même comportement dans la vue de l'événement. » Un second rendu l'aurait trahi.
        *
        * ⚠️ LA PROPOSITION DE CLÔTURE PASSE PAR LA PORTE QU'ARNO EMPLOIE DÉJÀ (`agir({ etat: 'traite' })`),
        * exactement comme celle du badge Monga juste au-dessus : même journal, même réversibilité. Deux chemins
        * pour clore auraient fini par écrire deux histoires différentes dans le journal.
        */}
      <h3 className="gst-sous-titre">Avancement</h3>
      <FriseAvancement
        evenementId={evenementId}
        onGeste={(m) => onGeste(m)}
        onProposerCloture={() => void agir({ etat: 'traite' },
          `Événement ${d.reference} clos depuis la frise d’avancement.`)}
      />

      {edition
        ? <FormulaireCarte detail={d} occupe={occupe}
            onValider={(champs) => void agir(champs, `Événement ${d.reference} mis à jour.`)}
            onAnnuler={() => setEdition(false)} />
        : <ResumeCarte detail={d} maintenant={maintenant} onModifier={() => setEdition(true)} occupe={occupe} />}

      {/* LOT RATTACHEMENT-2 — TOUT L'HISTORIQUE DE CETTE CARTE, d'un clic : ses échanges affectés et les mails qui
          lui ont été rattachés à la main, sur une seule frise, avec leurs pièces et le filtre par interlocuteur. */}
      {onHistorique && (
        <button type="button" className="svv-btn svv-btn-outline gst-btn gst-histo"
          onClick={() => onHistorique({ sorte: 'evenement', cle: null, id: evenementId })}>
          Tout l’historique des échanges →
        </button>
      )}

      <h3 className="gst-sous-titre">
        Échanges rattachés <span className="gst-compte">{d.fils.length}</span>
      </h3>
      {d.fils.length === 0 && d.mailsDeplaces.length === 0
        ? <p className="gst-vide">Aucun échange rattaché. Un échange détaché retourne dans la file, il n’est jamais perdu.</p>
        : (
          <ul className="gst-liste">
            {d.fils.map((f) => (
              <FilRattache key={f.filId} fil={f} evenementId={evenementId} maintenant={maintenant} onGeste={onGeste} />
            ))}
          </ul>
        )}

      {/* LES MAILS VENUS SEULS — à part, parce que ce ne sont pas des échanges, et en disant d'où ils sortent. */}
      {d.mailsDeplaces.length > 0 && (
        <>
          <h3 className="gst-sous-titre">
            Mails déplacés ici <span className="gst-compte">{d.mailsDeplaces.length}</span>
          </h3>
          <ol className="gst-fil">
            {d.mailsDeplaces.map((m) => (
              <li key={m.message.messageId} className="gst-item gst-item--fil">
                <p className="gst-note">
                  Venu de l’échange « {m.objetDuFil?.trim() || '(sans objet)'} », qui l’annonce toujours.
                </p>
                <ol className="gst-fil">
                  {/* LOT 5b — la MÊME brique que dans une conversation, ouverte d'emblée : un mail venu seul n'a pas
                      de fil à parcourir, il n'y a rien à replier. Le geste « Détacher ce mail » est conservé.
                      LOT 5-STATUT — son cartouche montre SA carte, celle où il a été déplacé, et non celle de son
                      échange d'origine : il est réellement ailleurs, et dire le contraire ferait croire qu'il suit
                      son fil. Constat sans bouton : ses gestes à lui sont dans son menu « ⋯ », où ils étaient déjà. */}
                  <MessageConversation message={m.message} maintenant={maintenant} ouvert onBasculer={() => {}}
                    statut={statutDuMessage(
                      { etat: 'a_classer', reference: null, evenementId: null },
                      { carteDuMail: { reference: d.reference, libelle: d.objet, evenementId: d.evenementId } },
                    )}
                    onRemettre={() => void agirSurLeMail(m.message.messageId, null, onGeste)} />
                </ol>
              </li>
            ))}
          </ol>
        </>
      )}
      </>)}
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
   * ⚠️ UNE FICHE DE BIEN S'ADRESSE PAR SA CLÉ WIPPIMMO, et cette clé s'écrit `bien-<nombre>` dans l'adresse
   * (`SORTES_FICHE_PAR_CLE`). Une clé qui n'est pas un nombre ne peut donc pas être ouverte — on la DIT plutôt
   * que de la faire disparaître d'une liste où elle devrait être.
   */
  const adressable = (cle: string): boolean => {
    const n = Number(cle);
    return Number.isSafeInteger(n) && n > 0;
  };
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

  const ouvrables = biens.filter((b) => adressable(b.cle));

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
              {adressable(b.cle)
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

/** Ce que porte la carte, en lecture. Un champ vide est DIT vide plutôt que laissé deviner. */
function ResumeCarte({ detail, maintenant, onModifier, occupe }: {
  detail: CarteDetail; maintenant: Date; onModifier: () => void; occupe: boolean;
}) {
  const demandeur = detail.demandeurNom ?? detail.demandeurEmail;
  return (
    <div className="gst-bloc">
      <dl className="gst-fiche">
        <dt>Quoi</dt><dd>{detail.objet}</dd>
        <dt>Qui demande</dt><dd>{demandeur ?? <span className="gst-absent">non renseigné</span>}</dd>
        <dt>Adresse</dt><dd>{detail.adresseLibre ?? <span className="gst-absent">non renseignée</span>}</dd>
        <dt>Ouvert</dt>
        <dd><span title={formaterDateFr(detail.ouvertLe)}>{depuis(detail.ouvertLe, maintenant)}</span>{detail.ouvertPar ? ` par ${detail.ouvertPar}` : ''}</dd>
      </dl>
      <div className="gst-actions">
        <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onModifier}>Modifier</button>
      </div>
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
 * Un échange rattaché : replié, il ne coûte rien ; déplié, il montre la conversation entière.
 *
 * Ses commandes vivent dans un MENU DISCRET, posé dans le coin — pas dans une rangée de boutons. Le titre d'un
 * `BlocRepliable` EST un bouton : on n'imbrique donc pas le menu dedans (ce serait un bouton dans un bouton, invalide
 * et injouable au clavier), il est son VOISIN, placé dans le coin par le CSS.
 */
function FilRattache({ fil, evenementId, maintenant, onGeste }: {
  fil: FilDeCarte; evenementId: number; maintenant: Date; onGeste: Rapport;
}) {
  const [deplacer, setDeplacer] = useState(false);
  return (
    <li className="gst-item gst-item--fil">
      <div className="gst-coin">
        <MenuDiscret titre="Actions sur cet échange" entrees={[
          { libelle: 'Déplacer l’échange…', onChoisir: () => setDeplacer(true) },
          { libelle: 'Détacher l’échange', discrete: true, onChoisir: () => void detacherFil(fil.filId, onGeste) },
        ]} />
      </div>
      {deplacer && (
        <DeplacerVers
          titre={`Déplacer l’échange « ${fil.objet?.trim() || '(sans objet)'} » vers`}
          exclure={evenementId}
          onAnnuler={() => setDeplacer(false)}
          onValider={async (cible) => {
            await deplacerFil(fil.filId, cible, onGeste);
            setDeplacer(false);
          }} />
      )}
      <BlocRepliable
        titreClasseExtra="gst-repli gst-repli--avec-menu"
        titre={
          <span className="gst-carte-titre">
            <span className="gst-objet">{fil.objet?.trim() || '(sans objet)'}</span>
            {fil.attend && <span className="gst-attend">attend une réponse</span>}
            <span className="gst-carte-bas">
              <span className="gst-qui">{fil.interlocuteur ?? '(expéditeur inconnu)'}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span title={formaterDateFr(fil.dernierLe)}>{depuis(fil.dernierLe, maintenant)}</span>
              <span className="gst-sep" aria-hidden="true">·</span>
              <span>{fil.nbMessages} message{fil.nbMessages > 1 ? 's' : ''}</span>
              {fil.nbPieces > 0 && <>
                <span className="gst-sep" aria-hidden="true">·</span>
                <span>{fil.nbPieces} pièce{fil.nbPieces > 1 ? 's' : ''} jointe{fil.nbPieces > 1 ? 's' : ''}</span>
              </>}
            </span>
          </span>
        }
      >
        {() => <Conversation filId={fil.filId} maintenant={maintenant} onGeste={onGeste} avecBandeau={false} />}
      </BlocRepliable>
    </li>
  );
}

/**
 * DÉPLACER = RATTACHER AILLEURS. Le geste existe déjà côté serveur (`affecter`) et il est atomique : l'ancienne
 * affectation est désactivée et la nouvelle créée dans UNE transaction, après une lecture verrouillée — il n'existe
 * aucun instant où l'échange n'a plus de carte. Rien de nouveau n'est écrit ici, seule la manière de le demander change.
 */
async function deplacerFil(filId: number, evenementId: number, onGeste: Rapport): Promise<void> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/affectation`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evenementId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; reference?: string; erreur?: string };
    if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Déplacement impossible.'); return; }
    onGeste(`Échange déplacé vers ${data.reference ?? 'l’événement choisi'}.`, { rechargerTout: true });
  } catch {
    onGeste('Déplacement impossible : le serveur n’a pas répondu.');
  }
}

/** DÉTACHER : l'échange retourne dans la file. Rien n'est supprimé — il y revient avec tous ses messages. */
async function detacherFil(filId: number, onGeste: Rapport): Promise<void> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/affectation`, { method: 'DELETE' });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
    if (!res.ok || !data.ok) { onGeste(data.erreur ?? 'Détachement impossible.'); return; }
    onGeste('Échange détaché : il est revenu dans la file, avec tous ses messages.', { rechargerTout: true });
  } catch {
    onGeste('Détachement impossible : le serveur n’a pas répondu.');
  }
}


/**
 * LOT 5b — `CorpsFil`, `Message` et leur ligne de pièce jointe ONT DÉMÉNAGÉ dans `Conversation.tsx`, qui est désormais
 * la SEULE vue conversation du module — utilisée par la carte, par le poste de tri et par la boîte mail.
 *
 * RIEN N'EST PERDU au passage, et c'est la condition pour que ce déménagement soit acceptable : les gestes par message
 * (déplacer ce mail, le détacher), la liste des mails sortis de l'échange avec leur bouton « Remettre dans son
 * échange », les pièces servies par l'application, les images de signature repliées et l'historique cité repliable
 * sont tous dans la nouvelle vue. Elle y AJOUTE l'en-tête complet, le dépliage message par message et les messages
 * tenus hors de la file.
 */
