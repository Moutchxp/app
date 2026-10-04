'use client';

import { useEffect, useRef, useState } from 'react';
/**
 * 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — les mots et le délai de « Marquer interne détachera :
 * … », dans un module PUR. L'écran les écrit, il ne les invente pas.
 */
import {
  messageDetachement, motApresDetachement, SECONDES_ANNULER, type BienDetache,
} from '../../../../lib/gestion/interneDetache';
/**
 * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — L'AUTRE SENS : les mots de « Ce mail est marqué Interne : rattacher
 * ce bien retirera la marque Interne », dans un module PUR lui aussi.
 */
import {
  messageLeveeInterne, motApresAnnulationLevee, motApresLevee,
} from '../../../../lib/gestion/interneLevee';
import type { ChoixInterne } from '../../../../lib/gestion/interneDuMail';
import { CSS_CHOISIR_CIBLE } from './ChoisirCible';
import { ModifierRattachement } from './ModifierRattachement';
// 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE MÊME MODULE QUE LA FENÊTRE DE RÉDACTION, à l'extrémité droite du bloc.
import { ChampClassement, CSS_CHAMP_CLASSEMENT } from './ChampClassement';
import { CSS_RATTACHER_EN_ECRIVANT, RattacherEnEcrivant } from './RattacherEnEcrivant';
import { lignePremierBien } from '../../../../lib/gestion/classementBoutons';
// 🔴 LOT MODALE-RATTACHER-PROPRE — le titre d'un bien (sans numéro de lot) et la pastille « i ».
import { titresDistincts } from '../../../../lib/gestion/titreBien';
// 🔴🔴 LOT SUIVI-CONVERSATION — les périodes de classement d'une conversation. Décisions dans un module PUR.
import {
  alerteTouteLaConversation, blocSuiviVisible, motClassement, SUIVI_DEFAUT,
  type ChoixSuivi, type Classement, type ExceptionMail, type Periode, type PersonneClassee,
} from '../../../../lib/gestion/periodesConversation';
import { CSS_INFO_BIEN, InfoBien } from './InfoBien';
// 🔴🔴 LOT CONTACTS-EXTERNES — la 2ᵉ étape « Classer ce nouveau contact », et ses décisions (module PUR).
import { CSS_ETAPE_CONTACT, EtapeContactExterne, type ValidationEtape2 } from './EtapeContactExterne';
import { choixSuiviDeContact } from '../../../../lib/gestion/contactExterne';
// ⚠️ `import type` SEULEMENT : ce dépôt tire `pg` (garde de graphe `clientBoundary.guard.test.ts`).
import type { ReponseEtape2 } from '../../../../lib/gestion/contactExterneRepo';
import type { CibleBrouillon } from '../../../../lib/gestion/redaction';
// LOT AFFECTATION-PAR-BIEN — la fenêtre de classement complète, partagée : une seule implémentation du geste.
import { ClasserMail } from './ClasserMail';
// LOT CONTACTS-ET-EVENEMENT — le bloc « Événement rattaché », en tête de l'encart.
import { BlocEvenement } from './BlocEvenement';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';
import type { Cible, Statut } from '../../../../lib/gestion/rattachement';

/**
 * LOT RATTACHEMENT-1 — « RATTACHÉ À … », DANS CHAQUE MAIL OUVERT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND, EN UNE LIGNE : « ce mail parle du logement 4 rue X et de son propriétaire ». C'est la question
 * qu'on se pose en classant, et celle à laquelle il faudra répondre pour reconstituer l'historique d'un logement.
 *
 * 🔴 IL MONTRE AUSSI LES PROPOSITIONS, séparément, avec leurs deux gestes. Un candidat qu'on ne voit pas est un
 * candidat qui ne sera jamais arbitré — et la file de tri ne suffit pas : c'est en lisant le mail qu'on tranche.
 *
 * 🔴 TOUT EST RÉVERSIBLE, ET LE BANDEAU LE DIT. « Retirer » ne supprime rien : le lien change d'état, daté et signé,
 * et la mention « Remettre » apparaît. Ce qui se fait d'un clic se défait d'un clic.
 *
 * ⚠️ IL NE S'AFFICHE QU'AVEC QUELQUE CHOSE À DIRE OU À FAIRE. Migration 257 absente, ou réponse en échec : le parent
 * ne lui passe rien et il ne rend rien — surtout pas une erreur rouge au-dessus d'un mail, qui ferait croire que le
 * mail lui-même a un problème. Quand il n'y a ni lien ni candidat, il reste UNE ligne : le bouton « Rattacher à… ».
 * C'est le seul endroit d'où l'on puisse rattacher un mail qu'aucune adresse ne désigne — il ne peut pas disparaître.
 *
 * 🔴 IL NE CHARGE RIEN LUI-MÊME. Les liens lui sont DONNÉS par la conversation, qui les demande UNE FOIS pour tous
 * ses messages (`?messages=1,2,3`). Un échange porte parfois trente mails : trente requêtes se verraient à l'écran.
 * Après un geste, il appelle `onChange` — c'est la conversation qui recharge, une fois, pour tout le monde.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/**
 * ⚠️ PAS DE PROPRIÉTÉ `evenementQualifie` ICI — elle a existé, et elle a menti. C'était une propriété facultative
 * à `false` par défaut, que la conversation ne passait pas : le bloc « Événement » annonçait donc « mise à jour 268
 * à appliquer » sur une base où elle l'était. `BlocEvenement` demande maintenant la réponse au serveur, avec les
 * données qu'elle conditionne. Ne pas la réintroduire ici : elle retraverserait deux composants pour rien.
 */
/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — LES TROIS CHOIX, DANS L'ORDRE D'ARNO, AVEC LEUR PHRASE D'AIDE ════════════════
 *
 * « Une phrase d'aide sous chaque choix, en français simple » (Arno). Trois options dont on ne comprend pas la
 * différence valent une option : c'est la phrase qui fait le choix, pas le titre.
 *
 * ⚠️ ÉCRITS ICI ET NULLE PART AILLEURS : l'ordre, les mots et les aides sont une seule vérité. Le choix coché
 * d'avance, lui, vient du module pur (`SUIVI_DEFAUT`).
 *
 * 🔴🔴 EXPORTÉ DEPUIS LE LOT BROUILLONS-APERCU-TYPES-LIBELLES, et pour une seule raison : le bloc de suivi de
 * l'étape 2 reprend désormais ces mots (demande d'Arno). Une épreuve les compare À LA SOURCE plutôt que de les
 * recopier — recopiés, les deux listes auraient divergé au premier ajustement sans que rien ne le dise.
 *
 * ⚠️ AUCUN CONTENU N'A CHANGÉ ICI : ni l'ordre, ni les mots, ni les aides, ni les clés. Seul le mot-clé `export`
 * a été ajouté.
 */
export const CHOIX_SUIVI: readonly { cle: ChoixSuivi; mot: string; aide: string }[] = [
  {
    cle: 'mail', mot: 'Ce mail uniquement',
    aide: 'Exception : ce mail seul est classé ainsi. Le mail suivant reprend la règle d’avant.',
  },
  {
    cle: 'suite', mot: 'Ce mail et la conversation à venir',
    aide: 'Nouvelle période à partir d’ici. Les mails précédents ne bougent pas.',
  },
  {
    cle: 'conversation', mot: 'Toute la conversation',
    aide: 'Tous les mails, passés et à venir, sont reclassés. Les exceptions déjà posées sont conservées.',
  },
];

/** Ce qu'on dit après le geste. Un mot par choix : « posé » ne dit pas la même chose selon ce qu'on a décidé. */
function motDuGeste(choix: ChoixSuivi, c: Classement): string {
  const quoi = motClassement(c);
  if (choix === 'mail') return `Exception posée sur ce mail : ${quoi}.`;
  if (choix === 'conversation') return `Toute la conversation reclassée : ${quoi}.`;
  return `Nouvelle période à partir de ce mail : ${quoi}.`;
}

/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LE GESTE MIS EN ATTENTE PENDANT LA QUESTION ════════════════════
 *
 * Les arguments exacts de `ecrireClassement`, gardés le temps de poser la question « Ce mail est marqué Interne :
 * rattacher ce bien retirera la marque Interne ».
 *
 * 🔴 DES DONNÉES, PAS UNE FERMETURE. Une fonction mémorisée aurait figé les états de React au moment de la
 * question ; le panneau, lui, reste ouvert pendant que la conversation continue de se rafraîchir (la relève tourne
 * chaque minute). En rejouant les ARGUMENTS, le geste confirmé est celui qu'on a demandé, sur l'état d'aujourd'hui.
 */
interface ArgumentsClassement {
  choisies: readonly CibleBrouillon[];
  personnes: readonly PersonneClassee[];
  suiviContact: 'auto' | 'ponctuel' | null;
  expediteurNonVerifie: boolean;
}

export function EncartRattachement({
  messageId, filId, liens, interne = null, horsGestion = false, onInterne, onHorsGestion,
  onChange, onGeste, onHistorique, mailsDuFil = [], choixInterne = 'conversation', leveeExterne = null,
  onLeveeAnnulee,
}: {
  messageId: number;
  /**
   * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — CE QUI MANQUAIT POUR QUE LES DEUX CASES AIENT UN SENS ═══════════════
   *
   * Le bloc ne connaissait que les RATTACHEMENTS. Or « Classer ce mail » a trois réponses vertes, et deux
   * d'entre elles ne vivent pas dans `gestion_rattachement` : « Interne » porte sur l'ÉCHANGE (migration 281),
   * « Hors gestion » sur LE MESSAGE (migration 266). Sans elles, le bloc aurait montré deux boutons rouges et
   * blancs au-dessus d'un mail déjà classé — c'est-à-dire proposé de refaire un geste déjà fait.
   *
   * `interne` : `null` = on ne sait pas (migration 281 absente, ou lecture en échec). Les deux cases
   * fonctionnent quand même pour « Rattacher » ; la case blanche est GRISÉE avec son motif.
   */
  interne?: boolean | null;
  /** Ce MAIL porte-t-il une marque « hors gestion » vivante ? */
  horsGestion?: boolean;
  /**
   * Pose (`true`) ou retire (`false`) la marque « interne » de l'ÉCHANGE. Absent ⇒ la case blanche est inerte.
   *
   * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — ELLE REND CE QU'ELLE A DÉTACHÉ ══════════════
   *
   * Marquer « interne » détache désormais les biens des mails couverts (décision d'Arno). L'appelant rend donc la
   * liste des liens retirés : sans leurs identifiants, l'« Annuler » des secondes qui suivent ne saurait pas quoi
   * remettre.
   *
   * ⚠️ `remettre` AU RETRAIT : les liens à remettre, quand c'est l'« Annuler » qui appelle. Vide (ou absent) ⇒ le
   * geste est EXACTEMENT celui d'avant ce lot — on retire la marque, on ne touche à aucun rattachement.
   */
  onInterne?: (actif: boolean, remettre?: readonly number[], choix?: ChoixInterne) =>
  void | Promise<void> | Promise<readonly BienDetache[] | void>;
  /**
   * 🔴🔴 POINT 2 — LES MAILS DE L'ÉCHANGE, dans l'ordre CHRONOLOGIQUE, et la fenêtre choisie. Ils servent à
   * demander au serveur ce que le geste détacherait — la fenêtre peut couvrir plus que le mail affiché.
   *
   * ⚠️ VIDE ⇒ L'APERÇU NE PORTE QUE SUR CE MAIL, et le geste reste celui d'avant. On ne devine pas une portée.
   */
  mailsDuFil?: readonly number[];
  choixInterne?: ChoixInterne;
  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — L'« ANNULER » D'UNE LEVÉE FAITE AILLEURS ═══════════════════
   *
   * Une levée déclenchée par la fenêtre « Visualiser / Modifier », dont la SORTIE est rendue ici.
   *
   * ⚠️ POURQUOI ELLE ARRIVE D'AILLEURS : cette fenêtre-là se ferme à chaque geste, et un « Annuler » rendu dedans
   * disparaissait avec elle — mesuré à l'écran. Ce bloc, lui, reste sous le mail, et il porte déjà exactement le
   * même panneau pour le sens inverse. Un seul dessin, un seul comportement, deux portes.
   *
   * ⚠️ `null`/absent ⇒ RIEN NE CHANGE : seul le geste fait DANS ce bloc offre une sortie, comme avant.
   */
  leveeExterne?: { mails: number[]; liens: number[] } | null;
  /** Prévient l'appelant que sa sortie a été prise (ou qu'elle n'a plus lieu d'être), pour qu'il l'oublie. */
  onLeveeAnnulee?: () => void;
  /** Retire la marque « hors gestion » de ce mail (`false`). Absent ⇒ la case verte ne se défait pas d'ici. */
  onHorsGestion?: (actif: boolean) => void | Promise<void>;
  /** L'échange de ce mail, pour la portée « toute la conversation » du bloc « Événement rattaché ». */
  filId?: number | null;
  /** Les liens vivants de CE mail, chargés par la conversation. `null` = migration 257 absente ou lecture en échec. */
  liens: readonly LienAffiche[] | null;
  /** Recharge les liens de toute la conversation. Appelé après chaque geste réussi. */
  onChange: () => void | Promise<void>;
  /** Prévient l'écran parent qu'un geste a eu lieu, pour son compte rendu. */
  onGeste?: (message: string) => void;
  /**
   * LOT RATTACHEMENT-2 — ouvre TOUT l'historique de cette cible. Absent = l'étiquette reste du texte : c'est le cas
   * d'une conversation rendue DANS une carte, où l'on ne veut pas quitter la carte d'un clic involontaire.
   */
  onHistorique?: (cible: Cible) => void;
}) {
  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — `ajout` OUVRE DÉSORMAIS LA MODALE « Rattacher ce mail à… », la même que la
   * fenêtre de rédaction. Il ouvrait le panneau en ligne `MenuRattachementBien`, dont le lien rouge d'appel a
   * été supprimé sur demande d'Arno. Ce panneau n'est PAS mort : il reste la fenêtre « Visualiser / Modifier »
   * de l'en-tête (`RattachementsDuFil`), et ce qu'il portait de plus — la portée et « Hors gestion, ou classer
   * par pièce… » — est repris au pied de la modale (voir `piedSupplementaire`).
   */
  const [ajout, setAjout] = useState(false);
  /** 🔴 « voir plus » : la ligne de gauche est repliée sur le PREMIER bien, et se déplie sur demande. */
  const [deplie, setDeplie] = useState(false);
  /**
   * ══ 🔴🔴 LOT SUIVI-CONVERSATION — LE SUIVI REMPLACE LA PORTÉE ═══════════════════════════════════════════════
   *
   * Demande d'Arno : le bloc « Suivi dans la conversation » REMPLACE « Portée de ce qu'on ajoute », avec trois
   * choix au lieu de deux, et « Ce mail et la conversation à venir » coché d'avance.
   *
   * 🔴 CE QUI A CHANGÉ, ET CE N'EST PAS QU'UN MOT. « Portée » disait où le geste s'appliquait AUJOURD'HUI ;
   * « Suivi » dit sous quelle règle le mail est classé, donc ce dont les mails À VENIR hériteront. C'est la
   * différence entre un geste et une décision — et c'est ce qui permet de ne plus écraser le passé.
   */
  const [choix, setChoix] = useState<ChoixSuivi>(SUIVI_DEFAUT);
  /** 🔴 « Sans confirmation, “Valider” reste bloqué » : la case que « Toute la conversation » exige. */
  const [confirme, setConfirme] = useState(false);
  /** Les périodes et exceptions de cette conversation. `null` = migration 290 absente, ou lecture en échec. */
  const [suivi, setSuivi] = useState<{
    periodes: Periode[]; exceptions: ExceptionMail[]; mails: number[];
    /**
     * 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — LES DEUX FAITS QUE LA RÈGLE ② D'ARNO DEMANDE.
     *
     * · `rattachee`       — cette conversation porte-t-elle au moins un rattachement VALIDÉ ? Les périodes et les
     *                       exceptions ne suffisaient pas : Arno écrit « au moins une période OU un rattachement
     *                       validé ». Une proposition pré-cochée n'en est pas un.
     * · `expediteurConnu` — l'adresse de ce mail est-elle contact d'une fiche propriétaire ou locataire ?
     */
    rattachee: boolean; expediteurConnu: boolean;
  } | null>(null);

  /**
   * ⚠️ LE SUIVI N'EST LU QU'À L'OUVERTURE DE LA MODALE. Le bloc gris surplombe CHAQUE mail d'une conversation
   * qui en porte parfois trente : lire les périodes pour chacun ferait trente requêtes à l'ouverture d'un fil,
   * pour une information que personne ne regarde tant qu'il ne classe pas.
   */
  useEffect(() => {
    if (!ajout || filId == null) return undefined;
    let vivant = true;
    void (async () => {
      try {
        /**
         * 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — LE MAIL EST DÉSORMAIS PASSÉ, et il le faut : la règle ②
         * d'Arno demande si l'expéditeur de CE mail est connu des fiches. La route répond `false` si on ne le
         * passe pas, donc l'omettre rendrait simplement le comportement d'avant ce lot.
         */
        const res = await fetch(
          `/api/admin/gestion/suivi?fil=${filId}&message=${messageId}`, { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; periodes?: Periode[]; exceptions?: ExceptionMail[]; mails?: number[];
          rattachee?: boolean; expediteurConnu?: boolean;
        };
        if (!vivant) return;
        setSuivi(d.etat !== 'ok' ? null
          : {
            periodes: d.periodes ?? [], exceptions: d.exceptions ?? [], mails: d.mails ?? [],
            // ⚠️ `=== true` ET NON `?? false` : une réponse d'API plus ancienne que ce lot ne porte pas ces
            //   champs, et `undefined` doit valoir « non » — c'est-à-dire le comportement d'avant.
            rattachee: d.rattachee === true, expediteurConnu: d.expediteurConnu === true,
          });
      } catch { if (vivant) setSuivi(null); }
    })();
    return () => { vivant = false; };
  }, [ajout, filId, messageId]);
  /** LOT FIL-LECTURE-2 — le rattachement dont on a ouvert la fenêtre « Modifier ». `null` = aucune fenêtre. */
  const [modifie, setModifie] = useState<LienAffiche | null>(null);
  const [occupe, setOccupe] = useState(false);
  /** LOT AFFECTATION-PAR-BIEN — la fenêtre complète (portée, hors gestion, pièces), ouverte depuis le bloc. */
  const [classer, setClasser] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  /** Les liens défaits pendant cette visite : on garde le bouton « Remettre » sous la main, sans recharger. */
  const [defaits, setDefaits] = useState<Map<number, LienAffiche>>(new Map());

  const agir = async (corps: Record<string, unknown>, methode: 'POST' | 'PATCH', dit: string): Promise<boolean> => {
    setOccupe(true);
    setErreur(null);
    try {
      const res = await fetch('/api/admin/gestion/rattachements', {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { ok?: boolean; erreur?: string };
      if (!res.ok || d.ok !== true) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return false; }
      onGeste?.(dit);
      await onChange();
      return true;
    } catch {
      setErreur('Le serveur n’a pas répondu.');
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const changer = async (lien: LienAffiche, statut: Statut, dit: string): Promise<void> => {
    const fait = await agir({ lienId: lien.id, statut }, 'PATCH', dit);
    if (!fait) return;
    setDefaits((m) => {
      const n = new Map(m);
      if (statut === 'retire' || statut === 'rejete') n.set(lien.id, lien); else n.delete(lien.id);
      return n;
    });
  };

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — « VOIR PLUS » SE DÉCIDE SUR CE QUI EST AFFICHÉ ═══════
   *
   * Demande d'Arno : « le lien ne s'affiche que si la vue dépliée montre AU MOINS une information absente de la
   * ligne de base ». Deux choses peuvent manquer à la ligne, et deux seulement :
   *   ① le TITRE COUPÉ par le CSS — l'écran seul le sait : `scrollWidth > clientWidth` ;
   *   ② les MENTIONS que seul le dépliage porte — aujourd'hui « cette pièce seulement ».
   * (Le troisième cas, « il y a d'autres biens », est décidé par le module pur, qui compte.)
   *
   * ⚠️ CES TROIS LIGNES SONT AU-DESSUS DU `return null` QUI SUIT, ET CE N'EST PAS UN HASARD : un `useState` posé
   * après une sortie anticipée n'est pas appelé à tous les rendus, et React s'arrête net (« Rendered fewer hooks
   * than expected »). Mesuré ici même, sur 46 épreuves d'un coup.
   */
  const nomDuPremier = useRef<HTMLElement | null>(null);
  const [titreCoupe, setTitreCoupe] = useState(false);
  useEffect(() => {
    const el = nomDuPremier.current;
    if (el === null) { setTitreCoupe(false); return undefined; }
    // ⚠️ UN PIXEL DE MARGE : un navigateur rend parfois `scrollWidth` supérieur d'un pixel sans rien couper.
    const mesurer = (): void => setTitreCoupe(el.scrollWidth > el.clientWidth + 1);
    mesurer();
    // ⚠️ LA LARGEUR CHANGE AVEC LA FENÊTRE : sans cela, le lien ne reviendrait pas en réduisant l'écran.
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [liens, deplie]);

  /**
   * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT — CE QUE LA MODALE A SOUS LES CASES, À CET INSTANT ═══════════════════
   *
   * `null` = la modale est fermée, ou ses propositions se chargent encore : il n'y a alors aucun changement à
   * constater, et le bloc « Suivi dans la conversation » reste absent. C'est l'état de départ, et c'est lui
   * qu'Arno voyait enfreint — le bloc s'affichait avant qu'on ait touché quoi que ce soit.
   *
   * ⚠️ DÉCLARÉ **AVANT** LE RETOUR ANTICIPÉ CI-DESSOUS, et ce n'est pas un détail de style : un `useState` placé
   * après ferait rendre moins de crochets qu'au tour précédent dès que `liens` passe à `null`, et React lève
   * « Rendered fewer hooks than expected ». Le piège s'est refermé une première fois au lot
   * PROPOSITIONS-EMAILS-MULTIPLES (46 essais rouges) ; il s'est refermé ici une seconde fois.
   */
  const [selectionModale, setSelectionModale] = useState<readonly string[] | null>(null);

  /**
   * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES QUATRE ÉTATS DE LA 2ᵉ ÉTAPE ══════════════════════════════════════════
   *
   * ⚠️ DÉCLARÉS **AVANT** LE RETOUR ANTICIPÉ CI-DESSOUS, et ce n'est pas un détail de style : un `useState` placé
   * après ferait rendre moins de crochets qu'au tour précédent dès que `liens` passe à `null`, et React lève
   * « Rendered fewer hooks than expected ». Le piège s'est déjà refermé DEUX fois dans ce fichier (lots
   * PROPOSITIONS-EMAILS-MULTIPLES puis MODALE-SUIVI-ET-DEFILEMENT). Il ne se refermera pas une troisième.
   *
   * · `etape2`        — les données de l'étape. `null` = elle n'est pas ouverte.
   * · `ciblesEnCours` — 🔴 LES CASES COCHÉES À L'ÉTAPE 1, GARDÉES POUR « ← Retour » (demande d'Arno). C'est ce
   *                     qui permet de rouvrir l'étape 1 exactement comme on l'a quittée : `precocher` coche les
   *                     cibles qu'on lui donne.
   * · `verification`  — le temps d'un aller-retour : on DIT ce qu'on fait plutôt que de clignoter.
   */
  const [etape2, setEtape2] = useState<ReponseEtape2 | null>(null);
  const [ciblesEnCours, setCiblesEnCours] = useState<readonly CibleBrouillon[] | null>(null);
  const [verification, setVerification] = useState(false);
  const [occupeEtape2, setOccupeEtape2] = useState(false);
  const [erreurEtape2, setErreurEtape2] = useState<string | null>(null);

  /**
   * ⚠️ LES ÉTATS DU PANNEAU « INTERNE » SONT DÉCLARÉS **AVANT** LE PREMIER `return`, et ce n'est pas une
   * question de style : React exige que le nombre de `useState`/`useEffect` d'un rendu soit TOUJOURS le même.
   * Posés après `if (liens === null) return null`, ils ont fait tomber 16 épreuves d'un coup — « Rendered fewer
   * hooks than expected ». Le défaut était le mien, et il ne se voit qu'à l'exécution.
   */
  /**
   * ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — LE PANNEAU DE « MARQUER INTERNE » ════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « AVANT d'appliquer, un message clair : “Marquer interne détachera : <liste des
   * biens>” avec Confirmer / Annuler. Après : “Annuler” pendant quelques secondes, qui remet exactement les
   * rattachements d'avant. — Si aucun bien n'est rattaché : comportement actuel inchangé, sans message. »
   *
   * 🔴 TROIS ÉTATS, ET UN SEUL À LA FOIS : rien · on demande (la liste et deux boutons) · c'est fait (le compte
   * rendu et l'« Annuler », qui s'efface au bout de quelques secondes).
   *
   * 🔴 LA LISTE VIENT DU SERVEUR, pas de cet écran. Il connaît les biens du mail AFFICHÉ ; la fenêtre choisie,
   * elle, peut couvrir toute la conversation — donc des mails dont il n'a pas les liens. Une confirmation qui ne
   * nommerait que ce qu'il voit promettrait moins qu'elle ne fait.
   */
  const [demandeInterne, setDemandeInterne] = useState<{ choix: ChoixInterne; biens: BienDetache[] } | null>(null);
  const [detachesInterne, setDetachesInterne] = useState<BienDetache[] | null>(null);
  const [occupeInterne, setOccupeInterne] = useState(false);

  /** L'« Annuler » ne reste offert que quelques secondes : passé ce délai, le geste est acquis. */
  useEffect(() => {
    if (detachesInterne === null) return undefined;
    const t = setTimeout(() => setDetachesInterne(null), SECONDES_ANNULER * 1000);
    return () => clearTimeout(t);
  }, [detachesInterne]);

  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — L'AUTRE SENS, ET SES TROIS ÉTATS ═════════════════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « Quand un HUMAIN rattache un bien à un mail marqué Interne, la marque Interne
   * est levée pour ce mail, selon la même fenêtre choisie. — Avant d'appliquer : “Ce mail est marqué Interne :
   * rattacher ce bien retirera la marque Interne” avec Confirmer / Annuler. Après : “Annuler” quelques secondes,
   * qui remet exactement l'état d'avant. »
   *
   * 🔴 `demandeLevee` GARDE LES ARGUMENTS DU GESTE, PAS UNE FONCTION. Le geste est différé entre la question et
   * la réponse : il faut donc pouvoir le rejouer à l'identique. Mémoriser une FERMETURE aurait figé des états de
   * React qui, eux, continuent de changer pendant que le panneau est ouvert.
   *
   * 🔴 `leveeFaite` PORTE CE QU'IL FAUT POUR DÉFAIRE : les mails dont la marque a été levée, les liens qui
   * viennent d'être posés, et si la marque de l'ÉCHANGE est partie avec. Sans ces trois, « remet exactement
   * l'état d'avant » ne serait qu'une phrase.
   */
  const [demandeLevee, setDemandeLevee] = useState<{
    message: string; mails: number[]; geste: ArgumentsClassement;
  } | null>(null);
  const [leveeFaite, setLeveeFaite] = useState<{ mails: number[]; liens: number[] } | null>(null);

  /**
   * ══ 🔴 LA SORTIE AFFICHÉE : LA NÔTRE, OU CELLE QU'ON NOUS CONFIE ══════════════════════════════════════════
   *
   * ⚠️ ON NE RECOPIE PAS `leveeExterne` DANS UN ÉTAT, et c'est volontaire : écrire un état depuis un effet pour
   * suivre une propriété déclenche un second rendu en cascade — React le signale, et ce bloc n'a pas besoin d'un
   * état de plus pour afficher une donnée qu'il reçoit déjà. Chacun garde donc SON délai : le nôtre juste en
   * dessous, le sien chez l'appelant, qui l'oublie au bout du même temps.
   */
  const levee = leveeFaite ?? leveeExterne;

  /** Le même délai que le sens inverse, et pour la même raison : un « Annuler » éternel n'acquitte jamais rien. */
  useEffect(() => {
    if (leveeFaite === null) return undefined;
    const t = setTimeout(() => setLeveeFaite(null), SECONDES_ANNULER * 1000);
    return () => clearTimeout(t);
  }, [leveeFaite]);

  if (liens === null) return null;

  /**
   * ══ 🔴🔴 LOT FICHE-RATTACHEMENT — UN NOM DE PERSONNE N'EST JAMAIS PRÉSENTÉ COMME UN BIEN RATTACHÉ ════════════
   *
   * LE DÉFAUT EXACT, vu par Arno le 28/09/2026 au soir sur le mail « modification adresse mail » d'Isabelle MENN :
   * sous le titre « BIEN(S) RATTACHÉ(S) : », l'encart affichait « PROPRIÉTAIRE BALIABINE épouse MENN Isabelle
   * (234) — automatique ». Un nom de personne, annoncé comme un bien. On cherchait le logement dans la phrase.
   *
   * 🔴 LE TITRE DIT DES BIENS : IL N'Y AURA DONC QUE DES BIENS DESSOUS. Plus aucune voie ne crée de lien
   * « personne » (le moteur, les deux routes, et la base avec la migration 273), mais 17 en sont nés le 28/09 au
   * soir par un processus qui tournait avec l'ancien code — et rien n'interdit qu'un cas semblable ressurgisse
   * d'une vieille ligne. S'il en reste un, il est montré À PART, avec ce qu'il est et le geste pour le corriger.
   *
   * ⚠️ IL EST MONTRÉ, PAS CACHÉ. Le masquer laisserait un mail classé sous une personne sans que personne ne le
   * voie ni ne puisse le reprendre — c'est-à-dire exactement le défaut, en pire : silencieux.
   */
  const confirmes = liens.filter((l) => l.statut === 'confirme');
  const vivants = confirmes.filter((l) => l.cible.sorte !== 'proprietaire' && l.cible.sorte !== 'locataire');
  const ancienModele = confirmes.filter((l) => l.cible.sorte === 'proprietaire' || l.cible.sorte === 'locataire');
  const candidats = liens.filter((l) => l.statut === 'propose');
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — les propositions qui visent un BIEN (logement) ou un PROPRIÉTAIRE sont rendues
   * par le bloc des biens : c'est LUI qui traduit une ancienne proposition « propriétaire » en la liste de ses
   * biens. Les autres — une carte proposée — gardent le rendu d'avant, mot pour mot.
   */
  const candidatsHorsBien = candidats.filter(
    (l) => l.cible.sorte !== 'lot' && l.cible.sorte !== 'proprietaire');
  const remettables = [...defaits.values()].filter((l) => !liens.some((x) => x.id === l.id));

  /* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LE MÊME MODULE « RATTACHER / INTERNE » QU'À LA RÉDACTION ═══════════
     Demande d'Arno : « Dans le bloc gris au-dessus de chaque mail […] place à l'extrémité DROITE le même
     composant que dans la fenêtre de rédaction […]. Mail non rattaché (À classer) → deux boutons. Mail
     rattaché / Interne / Hors gestion → case verte correspondante. » */

  /** Les BIENS (logements) rattachés, traduits dans la forme que `ChampClassement` et la modale emploient. */
  const biensRattaches: CibleBrouillon[] = vivants
    .filter((l) => l.cible.sorte === 'lot')
    .map((l) => ({
      sorte: 'lot' as const, cle: l.cible.cle, id: l.cible.id, libelle: l.libelle,
      // ⚠️ `?? undefined` : la catégorie est absente quand l'annuaire ne l'a pas dite. Le module pur la compte
      //   alors comme « logement » — à un seul endroit, jamais ici.
      ...(l.categorie !== null ? { categorie: l.categorie } : {}),
    }));

  /**
   * ══ 🔴🔴 VALIDER LA MODALE : ON POSE CE QUI MANQUE, ON RETIRE CE QUI N'EST PLUS COCHÉ ════════════════════════
   *
   * Demande d'Arno (point 5) : « À 0, le bouton reste actif et s'intitule “Valider — aucun bien” : valider
   * retire tous les rattachements et ramène les deux boutons rouge et blanc. »
   *
   * 🔴 UN DIFF, ET NON UNE RÉÉCRITURE. On ne retire pas tout pour tout reposer : un lien reposé perdrait sa date
   * de création, son auteur et son motif d'origine — tout ce qui permet de dire, six mois plus tard, d'où vient
   * un rattachement. On ne touche QUE ce qui change.
   *
   * ⚠️ LES GESTES PASSENT PAR LES ROUTES EXISTANTES (`agir`), jamais par une seconde écriture : « Retirer » écrit
   * `retire` sur le lien, il ne supprime rien. Tout reste daté et signé, et remettable.
   *
   * ══ 🔴🔴 LOT SUIVI-CONVERSATION — DEUX CHEMINS, ET LE SECOND EST CELUI D'AVANT ═══════════════════════════
   *
   * ① AVEC LA MIGRATION 290 : on envoie LA DÉCISION — ce classement, avec ce suivi — à `/api/admin/gestion/suivi`,
   *    et le serveur en tire les écritures. C'est le seul chemin qui sache ce qu'est une période.
   * ② SANS ELLE : le chemin d'avant, mot pour mot — un geste par bien posé, un par bien retiré, sur CE mail. Le
   *    classement se comporte exactement comme avant ce lot, et l'écran ne propose aucun suivi.
   *
   * 🔴 UN DIFF DANS LES DEUX CAS. On ne retire pas tout pour tout reposer : un lien reposé perdrait sa date, son
   * auteur et son motif d'origine — tout ce qui permet de dire, six mois plus tard, d'où vient un rattachement.
   */
  /**
   * ══ 🔴🔴 LOT CONTACTS-EXTERNES — AU CLIC SUR « VALIDER », ON VÉRIFIE L'EXPÉDITEUR D'ABORD ═══════════════════
   *
   * Demande d'Arno : « au clic sur Valider, compare l'adresse de l'expéditeur à TOUTES les adresses de TOUTES les
   * cartes des fiches propriétaires et locataires de CHAQUE bien coché. Si l'adresse correspond : comportement
   * actuel, rien de nouveau. Si elle ne correspond pas : la modale ne se ferme pas et affiche une 2ᵉ ÉTAPE. »
   *
   * 🔴 LA DÉCISION EST AU SERVEUR, ET IL LE FAUT : lui seul a l'annuaire, et les adresses des fiches n'ont rien à
   * faire dans le navigateur. Le module PUR `etape2Requise` tranche côté serveur, sur des faits qu'il a lus.
   *
   * ⚠️ UNE LECTURE EN ÉCHEC NE BLOQUE RIEN. Le classement du bien part comme avant (règle n° 1 : ne rien casser),
   * et le compte rendu le DIT — « expéditeur non vérifié ». Répondre « pas d'étape 2 » en silence ferait perdre
   * l'information exactement dans le cas où ce lot existe pour la retenir.
   */
  const demanderEtape2 = async (choisies: readonly CibleBrouillon[]): Promise<{
    data: ReponseEtape2 | null; echec: boolean;
  }> => {
    const biens = choisies.filter((c) => c.sorte === 'lot').map((c) => c.cle ?? '').filter((c) => c !== '');
    // ⚠️ AUCUN BIEN COCHÉ ⇒ AUCUNE QUESTION. « Valider — aucun bien » RETIRE les rattachements : demander pour
    //   qui un contact intervient à ce moment-là n'aurait aucun sens (et la base refuserait le lien).
    if (biens.length === 0) return { data: null, echec: false };
    const p = new URLSearchParams({ message: String(messageId), biens: biens.join(',') });
    if (interne === true) p.set('interne', '1');
    if (horsGestion) p.set('horsGestion', '1');
    try {
      const res = await fetch(`/api/admin/gestion/contact-externe?${p}`, { cache: 'no-store' });
      const d = (await res.json()) as { etat?: string; data?: ReponseEtape2 };
      if (d.etat !== 'ok' || d.data === undefined) return { data: null, echec: true };
      return { data: d.data.requise ? d.data : null, echec: false };
    } catch {
      return { data: null, echec: true };
    }
  };

  const appliquerCibles = async (choisies: readonly CibleBrouillon[]): Promise<void> => {
    /**
     * 🔴 « La modale ne se ferme pas » (Arno) : la fenêtre de l'étape 1 se démonte, et celle de l'étape 2 se
     * monte dans le MÊME cadre, aux mêmes mesures. Entre les deux, un voile qui DIT ce qu'il fait — sans quoi
     * l'écran clignoterait, et un clignotement se lit comme un défaut.
     */
    setVerification(true);
    const verdict = await demanderEtape2(choisies);
    setVerification(false);
    if (verdict.data !== null) {
      // ⚠️ ON GARDE LES CASES COCHÉES : « ← Retour » rouvre l'étape 1 avec cette liste, et `precocher` les coche.
      setCiblesEnCours(choisies);
      setEtape2(verdict.data);
      return;
    }
    await ecrireClassement(choisies, [], null, verdict.echec);
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — RATTACHER UN BIEN LÈVE LA MARQUE « INTERNE »
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * L'APERÇU, POUR LA QUESTION. Rend `null` si la lecture échoue — et dans ce cas on classe sans rien lever.
   *
   * 🔒 LECTURE SEULE : `?leverait=1` n'écrit rien.
   */
  const apercuLevee = async (
    choixLevee: ChoixInterne,
  ): Promise<{ interne: boolean; mails: number[] } | null> => {
    try {
      const p = new URLSearchParams({ leverait: '1', messageId: String(messageId), choix: choixLevee });
      if (mailsDuFil.length > 0) p.set('mails', mailsDuFil.join(','));
      const res = await fetch(`/api/admin/gestion/interne?${p.toString()}`, { cache: 'no-store' });
      const d = (await res.json().catch(() => ({}))) as { interne?: boolean; mails?: number[] };
      if (d.interne !== true) return { interne: false, mails: [] };
      return { interne: true, mails: Array.isArray(d.mails) ? d.mails : [] };
    } catch { return null; }
  };

  /**
   * ══ 🔴🔴 LES LIENS QUE LE GESTE VIENT DE POSER, RELUS EN BASE ══════════════════════════════════════════════
   *
   * ⚠️ POURQUOI UNE RELECTURE, ET NON LES `liens` DE LA PROPRIÉTÉ : l'écriture passe par deux chemins, et le
   * chemin des périodes ne rend AUCUN identifiant de lien — il rend un nombre de projections. Or l'« Annuler »
   * doit nommer les liens qu'il retire, un par un. On les relit donc, en ne gardant que ceux qui visent les
   * clés que ce geste a ajoutées.
   *
   * ⚠️ ET SUR LES MAILS COUVERTS, PAS SEULEMENT CELUI-CI : « toute la conversation » pose le bien sur plusieurs
   * mails. N'en retirer qu'un laisserait les autres — et l'état d'avant ne serait pas revenu.
   */
  const liensPosesPour = async (cles: readonly string[], mails: readonly number[]): Promise<number[]> => {
    try {
      const vises = mails.length > 0 ? mails : [messageId];
      const res = await fetch(`/api/admin/gestion/rattachements?messages=${vises.join(',')}`,
        { cache: 'no-store' });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; data?: Record<string, LienAffiche[]>;
      };
      if (d.etat !== 'ok' || d.data === undefined) return [];
      const voulues = new Set(cles);
      const ids = new Set<number>();
      for (const liste of Object.values(d.data)) {
        for (const l of liste) {
          if (l.statut === 'confirme' && l.cible.sorte === 'lot' && voulues.has(l.cible.cle ?? '')) ids.add(l.id);
        }
      }
      return [...ids];
    } catch { return []; }
  };

  /**
   * ══ 🔴🔴 APRÈS LE CLASSEMENT : ON N'A RIEN À LEVER, ON A UNE SORTIE À OFFRIR ════════════════════════════════
   *
   * 🔴 LA MARQUE EST DÉJÀ LEVÉE QUAND ON ARRIVE ICI, et pas par cet écran : `rattacher()` l'a fait, côté serveur,
   * pour chaque mail qu'il vient de rattacher. C'est voulu — il est la SEULE porte d'écriture d'un rattachement,
   * donc le seul endroit où la règle ne peut pas être oubliée. Voir son encadré.
   *
   * CE QUI RESTE À FAIRE ICI EST DONC UNIQUEMENT L'« ANNULER » : relire les liens qui viennent d'être posés, et
   * garder sous la main les mails qui étaient interne — les deux moitiés que l'annulation devra défaire.
   */
  const offrirAnnulationDeLaLevee = async (
    cles: readonly string[], mailsLeves: readonly number[],
  ): Promise<void> => {
    setOccupeInterne(true);
    try {
      const liensPoses = await liensPosesPour(cles, mailsDuFil.length > 0 ? mailsDuFil : [messageId]);
      onGeste?.(motApresLevee(mailsLeves.length));
      setLeveeFaite({ mails: [...mailsLeves], liens: liensPoses });
    } finally {
      setOccupeInterne(false);
    }
  };

  /** L'« ANNULER » DES SECONDES QUI SUIVENT : il retire le rattachement ET repose la marque, par les mêmes portes. */
  const annulerLevee = async (): Promise<void> => {
    const fait = levee;
    if (fait === null || fait === undefined) return;
    setLeveeFaite(null);
    /* 🔴 L'APPELANT DOIT OUBLIER SA SORTIE, sinon elle réapparaîtrait au rendu suivant : c'est LUI qui la porte. */
    onLeveeAnnulee?.();
    setOccupeInterne(true);
    try {
      const res = await fetch('/api/admin/gestion/interne', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remettreLevee: true, remettre: fait.liens, marques: fait.mails }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; liens?: number };
      if (d.ok === true) onGeste?.(motApresAnnulationLevee(typeof d.liens === 'number' ? d.liens : 0));
      await onChange();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    } finally {
      setOccupeInterne(false);
    }
  };

  /**
   * ══ 🔴🔴 ÉCRIRE LE CLASSEMENT — LES DEUX CHEMINS D'AVANT, PLUS LES PERSONNES ════════════════════════════════
   *
   * ⚠️ LE CORPS DES DEUX CHEMINS EST CELUI D'AVANT CE LOT, À LA LIGNE PRÈS. Ce qui est nouveau :
   *   · `personnes` entre dans le `classement` envoyé à la route du suivi (champ FACULTATIF : un classement sans
   *     personne est byte-identique à celui d'avant) ;
   *   · `suiviContact` peut imposer le choix de suivi quand l'étape 2 l'a demandé (voir la règle de préséance).
   *
   * 🔴🔴 LA PRÉSÉANCE DES DEUX MÉCANISMES DE SUIVI, ET ELLE EST CELLE D'ARNO :
   *   ① si le bloc à 3 choix est VISIBLE, c'est LUI qui arbitre (« à partir du 2e mail, si on MODIFIE la
   *      sélection d'une conversation en suivi automatique, c'est le bloc à 3 choix existant qui s'applique,
   *      inchangé ») ;
   *   ② sinon, si l'étape 2 a montré ses deux choix, ce sont EUX ;
   *   ③ sinon, le défaut (`SUIVI_DEFAUT`), comme avant ce lot.
   */
  const ecrireClassement = async (
    choisies: readonly CibleBrouillon[],
    personnes: readonly PersonneClassee[],
    suiviContact: 'auto' | 'ponctuel' | null,
    expediteurNonVerifie = false,
    /**
     * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LA CONFIRMATION, ET CE QU'ELLE A VU.
     *
     * `null` = pas encore confirmée. Sinon : LES MAILS QUI ÉTAIENT INTERNE au moment de la question, et c'est
     * exactement ce que l'« Annuler » devra remettre.
     *
     * 🔴 POURQUOI LA LISTE, ET PAS UN SIMPLE `true` : la levée est faite par `rattacher()` côté serveur, pendant
     * l'écriture. Après coup, plus aucun de ces mails n'est interne — les redemander rendrait une liste vide, et
     * l'« Annuler » n'aurait rien à remettre. La seule occasion de les connaître est AVANT.
     *
     * ⚠️ `null` PAR DÉFAUT, ET C'EST CE QUI REND LE GESTE SÛR : tout appelant qui ne connaît pas ce lot — et il y
     * en a trois — passe d'abord par la question. On n'oublie pas une confirmation par omission.
     */
    leveeConfirmee: readonly number[] | null = null,
  ): Promise<void> => {
    const voulues = new Set(choisies.filter((c) => c.sorte === 'lot').map((c) => c.cle ?? ''));
    /** ⚠️ `?? ''` NE SUFFIRAIT PAS : une mention honnête vaut mieux qu'un silence sur une vérification sautée. */
    const mention = expediteurNonVerifie
      ? ' (expéditeur non vérifié : la lecture des fiches n’a pas abouti)' : '';

    /**
     * ══ 🔴🔴 POINT 2 — ON DEMANDE AVANT, QUAND LE MAIL EST MARQUÉ « INTERNE » ET QU'UN BIEN S'AJOUTE ══════════
     *
     * 🔴 « QU'UN BIEN S'AJOUTE » EST LA CONDITION, et non « qu'on valide la fenêtre ». Retirer un bien, changer
     * une personne ou revalider la même sélection ne lève aucune marque et ne doit donc poser aucune question :
     * c'est la règle d'Arno du sens inverse appliquée ici — « si rien n'est concerné, comportement actuel
     * inchangé, sans message ».
     *
     * 🔴 LA FENÊTRE DE LA LEVÉE EST CELLE DU CLASSEMENT, et elle est calculée ICI, une fois, pour les deux : la
     * levée « selon la même fenêtre choisie » n'a de sens que si c'est littéralement la même valeur.
     *
     * ⚠️ ET SI L'APERÇU NE RÉPOND PAS, ON CLASSE QUAND MÊME, SANS RIEN LEVER. Refuser le rattachement parce
     * qu'une lecture a échoué conditionnerait une fonction existante à une requête nouvelle — ce qu'on ne fait
     * pas. La marque resterait vivante, l'affichage resterait juste (un rattachement l'emporte sur « Interne »),
     * et le prochain geste reposerait la question.
     */
    const presentesAvant = new Set(biensRattaches.map((c) => c.cle ?? ''));
    const clesAjoutees = [...voulues].filter((c) => c !== '' && !presentesAvant.has(c));
    const choixDeLaLevee: ChoixInterne = suivi !== null && filId != null
      ? (blocVisible || suiviContact === null ? choix : choixSuiviDeContact(suiviContact))
      : 'mail';

    if (leveeConfirmee === null && clesAjoutees.length > 0) {
      const apercu = await apercuLevee(choixDeLaLevee);
      if (apercu !== null && apercu.interne) {
        setDemandeLevee({
          message: messageLeveeInterne(true) ?? '',
          mails: apercu.mails,
          geste: { choisies, personnes, suiviContact, expediteurNonVerifie },
        });
        return;
      }
    }
    /** Ce que l'« Annuler » devra défaire. Appelé APRÈS l'écriture, et seulement si la levée a été confirmée. */
    const offrirLAnnulation = async (): Promise<void> => {
      if (leveeConfirmee === null || leveeConfirmee.length === 0 || clesAjoutees.length === 0) return;
      await offrirAnnulationDeLaLevee(clesAjoutees, leveeConfirmee);
    };

    // ① LE CHEMIN DES PÉRIODES : une seule requête, qui porte la décision entière.
    if (suivi !== null && filId != null) {
      const classement: Classement = {
        sorte: 'biens',
        biens: choisies.filter((c) => c.sorte === 'lot')
          .map((c) => ({ cle: c.cle ?? '', libelle: c.libelle })),
        ...(personnes.length === 0 ? {} : { personnes }),
      };
      // 🔴 LA PRÉSÉANCE, ÉCRITE UNE SEULE FOIS (voir l'encadré ci-dessus).
      const choixRetenu: ChoixSuivi = blocVisible || suiviContact === null
        ? choix : choixSuiviDeContact(suiviContact);
      setOccupe(true);
      setErreur(null);
      try {
        const res = await fetch('/api/admin/gestion/suivi', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filId, messageId, classement, choix: choixRetenu }),
        });
        const d = (await res.json()) as { ok?: boolean; erreur?: string };
        if (!res.ok || d.ok !== true) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return; }
        onGeste?.(`${motDuGeste(choixRetenu, classement)}${mention}`);
        await onChange();
        setAjout(false);
        setEtape2(null);
        setCiblesEnCours(null);
        /* 🔴🔴 POINT 2 — APRÈS LE CLASSEMENT, ET JAMAIS AVANT : on ne lève pas une marque pour un geste qui
           n'aurait pas abouti. Le `return` au-dessus, en cas d'erreur, garantit qu'on ne passe pas ici. */
        await offrirLAnnulation();
      } catch {
        setErreur('Le serveur n’a pas répondu.');
      } finally {
        setOccupe(false);
      }
      return;
    }

    // ② LE CHEMIN D'AVANT, inchangé : ce mail, et lui seul.
    const presentes = new Set(biensRattaches.map((c) => c.cle ?? ''));
    const aPoser = [...voulues].filter((c) => !presentes.has(c));
    const aRetirer = vivants.filter((l) => l.cible.sorte === 'lot' && !voulues.has(l.cible.cle ?? ''));
    for (const l of aRetirer) {
      await agir({ lienId: l.id, statut: 'retire' }, 'PATCH', `Rattachement retiré : ${l.libelle}`);
    }
    for (const cle of aPoser) {
      await agir({ messageId, cible: { sorte: 'lot', cle }, motif: 'rattaché à la main' },
        'POST', 'Rattachement posé.');
    }
    if (aPoser.length === 0 && aRetirer.length === 0) await onChange();
    setAjout(false);
    setEtape2(null);
    setCiblesEnCours(null);
    await offrirLAnnulation();
  };

  /**
   * ══ 🔴🔴 VALIDER L'ÉTAPE 2 : LE CONTACT D'ABORD, LE CLASSEMENT ENSUITE ═════════════════════════════════════
   *
   * 🔴 L'ORDRE EST LA FONCTIONNALITÉ : il faut l'identifiant du contact externe pour l'écrire sur chaque lien
   * d'intervention. On le mémorise donc AVANT de poser le classement.
   *
   * ⚠️ UN CONTACT QU'ON N'A PAS PU MÉMORISER NE BLOQUE RIEN. Les trois champs sont facultatifs — c'est écrit
   * deux fois dans le cahier des charges —, et le classement du bien ne doit pas dépendre d'eux. Les relations
   * aux personnes se posent alors sans `contact_externe_id` : la mention « via … » manquera, le rôle instantané
   * et le lien ne manqueront pas.
   */
  const validerEtape2 = async (v: ValidationEtape2): Promise<void> => {
    const cibles = ciblesEnCours ?? [];
    setErreurEtape2(null);
    setOccupeEtape2(true);
    let contactId: number | null = null;
    try {
      if (etape2 !== null && etape2.disponible) {
        const res = await fetch('/api/admin/gestion/contact-externe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: etape2.expediteur, ...v.contact }),
        });
        const d = (await res.json()) as { ok?: boolean; id?: number };
        if (d.ok === true && typeof d.id === 'number') contactId = d.id;
      }
      await ecrireClassement(
        cibles,
        v.personnes.map((p) => ({ ...p, contactExterneId: contactId })),
        v.suivi,
      );
    } catch {
      setErreurEtape2('Le serveur n’a pas répondu.');
    } finally {
      setOccupeEtape2(false);
    }
  };

  /**
   * 🔴 « RÉINITIALISER » / LE CLIC SUR LA CASE VERTE — un seul geste, trois défaits selon l'état courant.
   * Demande d'Arno : « Pour un mail reçu, le statut repasse à “À classer” tant qu'un nouveau choix n'est pas
   * fait. » C'est exactement ce que fait chacun des trois : il RETIRE, il ne remplace pas.
   */
  /**
   * 🔴🔴 LE CLIC SUR « INTERNE » — IL DEMANDE D'ABORD, QUAND IL Y A QUELQUE CHOSE À DÉTACHER.
   *
   * ⚠️ AUCUN MESSAGE QUAND IL N'Y A RIEN À DÉTACHER, et c'est la seconde phrase d'Arno : le cas le plus fréquent
   * garde le comportement d'avant, au clic près.
   *
   * ⚠️ ET SI L'APERÇU NE RÉPOND PAS, ON MARQUE QUAND MÊME. Refuser le geste parce qu'une lecture a échoué
   * conditionnerait une fonction existante à une requête nouvelle — ce qu'on ne fait pas. La confirmation est une
   * précaution, pas un péage.
   */
  const apercuDetachement = async (choix: ChoixInterne): Promise<BienDetache[] | null> => {
    try {
      const p = new URLSearchParams({ detacherait: '1', messageId: String(messageId), choix });
      if (mailsDuFil.length > 0) p.set('mails', mailsDuFil.join(','));
      const res = await fetch(`/api/admin/gestion/interne?${p.toString()}`, { cache: 'no-store' });
      const d = (await res.json().catch(() => ({}))) as { biens?: BienDetache[] };
      return Array.isArray(d.biens) ? d.biens : [];
    } catch { return null; }
  };

  const cliquerInterne = async (): Promise<void> => {
    if (onInterne === undefined) return;
    setOccupeInterne(true);
    try {
      const biens = await apercuDetachement(choixInterne);
      /* ⚠️ APERÇU EN ÉCHEC (`null`) ⇒ ON MARQUE QUAND MÊME : la confirmation est une précaution, pas un péage. */
      if (biens === null || biens.length === 0) { await appliquerInterne(choixInterne, []); return; }
      setDemandeInterne({ choix: choixInterne, biens });
    } finally {
      setOccupeInterne(false);
    }
  };

  /**
   * ══ 🔴🔴 CHANGER DE FENÊTRE DANS LE PANNEAU, ET LA LISTE SUIT ══════════════════════════════════════════════
   *
   * DÉCISION D'ARNO : le détachement se fait « selon la fenêtre choisie (Ce mail uniquement / Ce mail et la
   * conversation à venir / Toute la conversation) ».
   *
   * 🔴 LES TROIS FENÊTRES EXISTAIENT DÉJÀ dans la route et dans le module pur (`mailsCouvertsParLeChoix`), mais
   * AUCUN écran ne les offrait pour « interne » : la case du bandeau a toujours porté sur l'ÉCHANGE entier. Elles
   * sont donc offertes ICI, dans la confirmation — l'endroit où l'on décide, et le seul où la liste des biens
   * concernés peut suivre le choix en direct.
   *
   * ⚠️ LA LISTE EST RE-DEMANDÉE AU SERVEUR À CHAQUE CHANGEMENT, et ce n'est pas un luxe : « ce mail uniquement »
   * et « toute la conversation » ne détachent pas les mêmes biens. Une liste figée promettrait autre chose que ce
   * que le bouton ferait.
   */
  const changerFenetreInterne = async (choix: ChoixInterne): Promise<void> => {
    setOccupeInterne(true);
    try {
      const biens = await apercuDetachement(choix);
      setDemandeInterne({ choix, biens: biens ?? [] });
    } finally {
      setOccupeInterne(false);
    }
  };

  /** LE GESTE, une fois confirmé (ou d'emblée, s'il n'y avait rien à détacher). */
  const appliquerInterne = async (
    choix: ChoixInterne, annonces: readonly BienDetache[],
  ): Promise<void> => {
    setDemandeInterne(null);
    setOccupeInterne(true);
    try {
      const faits = await onInterne?.(true, undefined, choix);
      /* 🔴 ON N'OFFRE L'« ANNULER » QUE SI QUELQUE CHOSE A ÉTÉ DÉTACHÉ. Sinon il n'y a rien à remettre, et la
         marque se retire déjà d'un clic sur la case verte — le geste d'avant, inchangé. */
      const liste = Array.isArray(faits) ? faits : annonces;
      setDetachesInterne(liste.length > 0 ? [...liste] : null);
    } finally {
      setOccupeInterne(false);
    }
  };

  /** L'« ANNULER » DES SECONDES QUI SUIVENT : il retire la marque ET remet les liens, par la même porte. */
  const annulerInterne = async (): Promise<void> => {
    const liste = detachesInterne ?? [];
    setDetachesInterne(null);
    setOccupeInterne(true);
    try {
      await onInterne?.(false, liste.map((b) => b.lienId));
    } finally {
      setOccupeInterne(false);
    }
  };

  const reinitialiser = async (): Promise<void> => {
    if (biensRattaches.length > 0) { await appliquerCibles([]); return; }
    if (interne === true) { await onInterne?.(false); return; }
    if (horsGestion) await onHorsGestion?.(false);
  };

  /**
   * ══ 🔴🔴 LOT MODALE-RATTACHER-PROPRE — LE TITRE D'UN BIEN, SANS SON NUMÉRO DE LOT ══════════════════════════
   *
   * Demande d'Arno : « dans la ligne “BIEN(S) RATTACHÉ(S)” ainsi que dans le “voir plus”, le titre d'un bien
   * devient “adresse — Type de bien”. Le numéro de lot n'apparaît plus dans le titre. »
   *
   * 🔴 IL EST RECALCULÉ, PAS RELU. `cible_libelle` est le texte FIGÉ au moment du rattachement — il porte
   * l'ancien format (« … — Appartement Studio — lot 247 »), et il porterait l'adresse d'alors si elle avait
   * changé depuis. Le titre vient donc des FAITS du lot, joints à la lecture (`lien.bien`).
   *
   * ⚠️ REPLI SUR LE LIBELLÉ ENREGISTRÉ quand l'annuaire ne dit rien (migration 253 absente, lot disparu de
   * l'import) : un bien sans nom sur cette ligne serait pire qu'un nom d'hier.
   *
   * ⚠️ LE DÉPARTAGE PORTE SUR LA LISTE ENTIÈRE DU MAIL : deux lots du même immeuble, même type, sont le cas
   * fréquent — et c'est précisément celui où deux titres identiques rendraient la ligne inutilisable.
   */
  const titres = new Map(titresDistincts(
    // ⚠️ `!= null` COUVRE AUSSI `undefined` : une réponse d'API plus ancienne que ce lot ne porte pas `bien`, et
    //   un titre composé de rien donnerait « Lot 442 » — exactement le numéro qu'on vient d'en retirer.
    vivants.filter((l) => l.cible.sorte === 'lot' && l.bien != null && l.cible.cle !== null).map((l) => ({
      cle: l.cible.cle as string,
      adresse: [l.bien?.adresse ?? '', l.bien?.commune ?? ''].filter((x) => x.trim() !== '').join(', '),
      nature: l.bien?.nature ?? null, typeBien: l.bien?.typeBien ?? null, immeuble: l.bien?.immeuble ?? null,
    })),
  ).map((x) => [x.cle, x.titre]));
  const titreDe = (l: LienAffiche): string => titres.get(l.cible.cle ?? '') ?? l.libelle;

  /**
   * 🔴🔴 LES DEUX CONDITIONS D'ARNO, décidées dans le module PUR. `suivi === null` = migration 290 absente : le
   * bloc n'existe pas, et le classement se comporte comme avant ce lot.
   */
  const blocVisible = suivi !== null && blocSuiviVisible({
    estPremierMail: suivi.mails.length > 0 && suivi.mails[0] === messageId,
    /**
     * 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — `rattachee` S'AJOUTE AUX DEUX AUTRES, et c'est la lettre
     * d'Arno : « conversation DÉJÀ rattachée (au moins une période OU un rattachement validé) ».
     *
     * ⚠️ CE N'EST PAS UN DÉTAIL DE PLUS : sans lui, une conversation portant des rattachements validés mais
     * aucune période serait tenue pour « jamais rattachée », et la règle ② lui montrerait le bloc en permanence —
     * alors qu'elle relève de la règle ①, inchangée.
     */
    dejaClassee: suivi.periodes.length > 0 || suivi.exceptions.length > 0 || suivi.rattachee,
    // 🔴 RÈGLE ② : sur une conversation jamais rattachée, c'est LUI qui ouvre le bloc — et lui seul.
    expediteurConnu: suivi.expediteurConnu,
    /**
     * 🔴🔴 LA RÉFÉRENCE EST CE QUI EST **VALIDÉ** POUR CE MAIL : ses liens CONFIRMÉS, c'est-à-dire ceux qu'une
     * personne a posés et ceux que la fenêtre en cours a projetés — la projection les écrit confirmés, donc une
     * seule définition suffit pour les deux. Les PROPOSITIONS du moteur n'en sont pas : laisser une case
     * pré-cochée telle quelle n'est pas une décision, et ne doit pas faire apparaître le bloc.
     */
    reference: biensRattaches.map((b) => b.cle ?? ''),
    selection: selectionModale,
  });
  /** Ce que l'alerte annonce, mot pour mot — composé par le module pur. */
  const alerte = suivi === null ? '' : alerteTouteLaConversation({
    mails: suivi.mails, exceptions: suivi.exceptions, messageId,
    // ⚠️ L'ALERTE PARLE DE CE QUI EST RATTACHÉ AU MOMENT OÙ ON OUVRE : la fenêtre, elle, connaît la sélection
    //   en cours de modification, mais elle ne la remonte qu'à la validation. Nommer l'état de départ est
    //   honnête et suffit à faire comprendre la portée du geste — c'est le NOMBRE de mails qui alerte.
    versQuoi: motClassement({ sorte: 'biens', biens: biensRattaches.map((b) => ({
      cle: b.cle ?? '', libelle: b.libelle,
    })) }),
  });

  /**
   * ══ 🔴🔴 LOT AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE — « VOIR PLUS » SE DÉCIDE SUR CE QUI EST AFFICHÉ ═══════
   *
   * Demande d'Arno : « le lien ne s'affiche que si la vue dépliée montre AU MOINS une information absente de la
   * ligne de base ». Deux choses peuvent manquer à la ligne, et deux seulement :
   *   ① le TITRE COUPÉ par le CSS — c'est l'écran qui le sait, et lui seul : `scrollWidth > clientWidth` ;
   *   ② les MENTIONS que seul le dépliage porte — aujourd'hui « cette pièce seulement ».
   * (Le troisième cas, « il y a d'autres biens », est décidé par le module pur, qui compte.)
   */
  /** Ce que la ligne de gauche montre d'abord : le premier bien, en entier, et « voir plus » s'il faut. */
  const ligne = lignePremierBien(vivants.map(titreDe), {
    tronque: titreCoupe,
    // ⚠️ SEULEMENT CELLES DU PREMIER : s'il y a d'autres biens, le lien s'affiche de toute façon.
    enPlus: vivants.length === 1 && vivants[0].pieceId !== null ? ['cette pièce seulement'] : [],
  });
  /** La mention des propositions, écrite une fois : elle sert de texte ET d'infobulle (elle peut se tronquer). */
  const motPropositions = candidats.length === 1
    ? 'Une proposition de l’automatisation à trancher.'
    : `${candidats.length} propositions de l’automatisation à trancher.`;

  return (
    <div className="ert" role="group" aria-label="Rattachements de ce mail">
      <style>{CSS_ENCART_RATTACHEMENT}</style>
      <style>{CSS_CHOISIR_CIBLE}</style>
      {/* 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — les deux feuilles du module de classement : ce bloc vit AILLEURS que
          la fenêtre de rédaction, et ne peut compter sur aucune feuille montée par elle. */}
      <style>{CSS_CHAMP_CLASSEMENT}</style>
      <style>{CSS_RATTACHER_EN_ECRIVANT}</style>
      <style>{CSS_INFO_BIEN}</style>

      {/* ══ LOT FIL-LECTURE-2 — TOUT SUR UNE LIGNE QUAND ÇA TIENT ═════════════════════════════════════════════
          « RATTACHÉ À · PROPRIÉTAIRE DENIS Philippe · automatique · Modifier · Retirer · + Rattacher à… ». Le
          titre, la liste et le bouton d'ajout étaient trois blocs empilés, séparés par des marges : six lignes de
          hauteur pour une information qui en tient une. Ils sont maintenant dans le MÊME conteneur souple, qui ne
          passe à la ligne que si la largeur ne suffit pas. Rien n'est retiré — seuls les blancs le sont. */}
      {/* ══ 🔴🔴 LOT BLOC-CLASSER-COMPACT — TOUT TIENT SUR DEUX LIGNES, LE MODULE À DROITE DES DEUX ═════════
          Demande d'Arno : « Le module de droite est centré verticalement sur la hauteur des DEUX lignes. » Il
          ne vivait qu'à côté de la ligne 2 : il se calait donc sur une seule, et la capsule gagnait une marche.
          Les deux lignes entrent dans une COLONNE, et la rangée n'a plus que deux enfants — la colonne, et le
          module. C'est aussi ce qui fait qu'à largeur réduite le module passe sous les DEUX lignes, en pleine
          largeur, et non sous la seconde seulement. */}
      <div className="ert-rangee">
      <div className="ert-colonne">

      {/* ══ 🔴 LOT CONTACTS-ET-EVENEMENT — LE BLOC « ÉVÉNEMENT RATTACHÉ », EN TÊTE ════════════════════════════
          L'événement est FACULTATIF et ne change jamais la capsule de statut (qui dépend du bien) : « aucun » est
          une réponse normale. Lier, créer et délier sont ici, et leurs panneaux s'ouvrent JUSTE SOUS la ligne. */}
      <BlocEvenement messageId={messageId} filId={filId ?? null}
        biens={vivants
          .filter((l) => l.cible.sorte === 'lot' && l.cible.cle !== null)
          .map((l) => ({ cle: l.cible.cle as string, libelle: l.libelle, parties: [] }))}
        onGeste={onGeste}
        onChange={onChange} />

      {/* 🔴 LOT CONTACTS-ET-EVENEMENT — « Bien(s) classé(s) : ». Ils étaient sous « Bien(s) rattaché(s) », qui est
          devenu le bloc de l'ÉVÉNEMENT ci-dessus. RIEN N'EST PERDU : ils restent visibles, en tête des
          propositions, avec « Modifier » et « Retirer » comme avant, et la recherche manuelle juste en dessous. */}
      {/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — DEUX COLONNES : CE QUI EST, À GAUCHE ; CE QU'ON FAIT, À DROITE ══
          Demande d'Arno : le module de classement va « à l'extrémité DROITE » du bloc, « à la hauteur du bloc ».
          La ligne de gauche garde ce qu'elle disait — titre, biens, « Modifier », « Retirer », propositions —
          et gagne l'adresse COMPLÈTE du premier bien avec son « voir plus ». */}
      <div className="ert-tete ert-tete--biens">
        <span className="ert-titre">Bien(s) rattaché(s) :</span>
        {vivants.length === 0 && <span className="ert-vide">rien pour l’instant</span>}

      {/* ══ 🔴🔴 LA LIGNE REPLIÉE : LE PREMIER BIEN, EN ENTIER ═══════════════════════════════════════════════
          Demande d'Arno (point 3) : « Affiche l'adresse complète du PREMIER bien (adresse — type — lot N). S'il
          y a plusieurs biens, ou si l'adresse est tronquée : un petit lien “voir plus” au bout. »

          🔴 CE QU'ELLE REMPLACE : la liste de TOUS les biens, chacun avec ses deux gestes, empilés au-dessus de
          chaque mail. Deux biens suffisaient à faire trois lignes ; cinq en faisaient six. On montre le premier,
          et le reste se déplie — rien n'est caché, tout est à un clic.

          ⚠️ LA DÉCISION « voir plus » VIENT DU MODULE PUR (`lignePremierBien`) : l'écran place et peint. */}
      {/* ══ 🔴🔴 LOT BLOC-CLASSER-COMPACT — LA LIGNE 2, ET RIEN QUE LA LIGNE 2 ═══════════════════════════════
          Demande d'Arno, mot pour mot : « “BIEN(S) RATTACHÉ(S) :” suivi DIRECTEMENT de l'adresse du premier
          bien, puis “automatique” en gris s'il y a lieu, puis “voir plus” quand il y a plusieurs biens ou que
          l'adresse est tronquée. »

          CE QUI A ÉTÉ RETIRÉ, AVEC SON ACCORD EXPLICITE :
            · le libellé « LOGEMENT » devant l'adresse — l'adresse dit déjà ce qu'elle désigne, et le titre de
              la ligne dit « bien » ; trois mots pour la même information sur une ligne qui doit en tenir une ;
            · les liens « Modifier » et « Retirer » — ils passent désormais par la case verte, qui ouvre la
              modale (modifier, décocher, « Valider — aucun bien » pour tout retirer). Deux portes pour le même
              geste finissent par ne plus faire la même chose.

          ⚠️ RIEN N'EST DEVENU INACCESSIBLE : changer de bien, c'est décocher l'un et cocher l'autre dans la
          modale ; retirer, c'est décocher. Et l'HISTORIQUE reste à un clic sur l'adresse elle-même. */}
      {vivants.length > 0 && !deplie && (
        <span className="ert-premier">
          {/* ⚠️ C'EST CET ÉLÉMENT QU'ON MESURE : celui qui porte la coupure CSS. Mesurer son parent dirait que
              tout tient, puisque le parent, lui, s'adapte. */}
          {onHistorique
            ? (
              <button type="button" className="ert-lien ert-lien--coupe"
                ref={(e) => { nomDuPremier.current = e; }}
                onClick={() => onHistorique(vivants[0].cible)}
                title={`Tout l’historique — ${ligne.premier}`}>
                {ligne.premier}
              </button>
            )
            : (
              <span className="ert-nom ert-lien--coupe" ref={(e) => { nomDuPremier.current = e; }}
                title={ligne.premier}>
                {ligne.premier}
              </span>
            )}
          {/* 🔴 LOT MODALE-RATTACHER-PROPRE — LA MÊME PASTILLE QUE DANS LA MODALE (demande d'Arno) : le numéro
              de lot a quitté le titre, il est dans cette fenêtre — avec tout le reste du descriptif. */}
          {vivants[0].cible.cle !== null && (
            // ⚠️ `surLaLigne` = CE BLOC N'AFFICHE QUE LE TITRE : la fenêtre n'en répétera donc ni l'adresse ni
            //   la qualité, et gardera tout le reste (n° de lot, gestion, parties, Drive…).
            <InfoBien cle={vivants[0].cible.cle} titre={ligne.premier} surLaLigne={ligne.premier} />
          )}
          {/* « automatique » EN GRIS S'IL Y A LIEU : quand c'est une personne qui a posé le lien, il n'y a rien
              à signaler — c'est le cas normal, et l'écrire ferait du bruit sur chaque mail classé à la main. */}
          {!vivants[0].parUnHumain && <span className="ert-source">automatique</span>}
          {ligne.voirPlus && (
            <button type="button" className="gst-lien-bouton ert-voir" onClick={() => setDeplie(true)}>
              {ligne.total > 1 ? `voir plus (${ligne.total})` : 'voir plus'}
            </button>
          )}
        </span>
      )}

      {/* ⚠️ LE LIEN ROUGE « Rattacher à un bien » A ÉTÉ SUPPRIMÉ (demande d'Arno) : les deux cases, à droite,
          prennent sa place physique ET sa fonction. Le panneau qu'il ouvrait n'est pas mort pour autant — il
          reste la fenêtre « Visualiser / Modifier » de l'en-tête, et ce qu'il portait de plus (la portée,
          « Hors gestion, ou classer par pièce… ») est repris au pied de la modale. */}
      {/* ══ 🔴 LOT LISTE-PAGINATION — LA MENTION DES PROPOSITIONS FINIT LA LIGNE DES BIENS ════════════════════
          Demande d'Arno : « la 3e ligne passe au bout de la 2e, sur la même ligne ». Elle occupait un paragraphe
          à elle seule sous l'encart — une ligne entière pour six mots, sur un bloc qu'on lit au-dessus de CHAQUE
          mail. Elle se lit désormais à la suite : « BIEN(S) RATTACHÉ(S) : rien pour l'instant · Rattacher à un
          bien · 2 propositions de l'automatisation à trancher ».

          🔴 ELLE EST DANS LA MÊME RANGÉE SOUPLE (`ert-tete`) que le titre, les biens et le bouton : si la largeur
          ne suffit pas, elle passe à la ligne D'ELLE-MÊME (`flex-wrap`), sans rien tronquer. On gagne une ligne
          quand il y a la place, et on n'en perd aucune quand il n'y en a pas.

          ⚠️ UN `span`, PLUS UN `p` : un paragraphe force un retour à la ligne quelle que soit la place, c'est
          même sa définition. C'est lui qui coûtait la ligne, pas la marge.

          ⚠️ LE SÉPARATEUR « · » EST DÉCORATIF (`aria-hidden`) : il sépare pour l'œil. Un lecteur d'écran, lui,
          enchaîne déjà les éléments de la rangée sans avoir besoin d'entendre « point médian ». */}
      {!ajout && candidats.length > 0 && (
        <>
          <span className="ert-separateur" aria-hidden="true">·</span>
          {/* 🔴 LOT BLOC-CLASSER-COMPACT — L'INFOBULLE PORTE LE TEXTE ENTIER : la mention se tronque quand la
              place manque (le bloc doit tenir sur deux lignes), et ce qui est coupé reste atteignable. */}
          <span className="ert-motif ert-propositions" title={motPropositions}>{motPropositions}</span>
        </>
      )}
      </div>

      {/* ══ DÉPLIÉ : « l'adresse complète du premier bien puis tous les autres, une ligne chacun » (Arno) ════ */}
      {/* ⚠️ DÉPLIÉ, LA MÊME FORME QUE LA LIGNE 2, répétée : l'adresse, et « automatique » s'il y a lieu. Garder
          « Modifier » et « Retirer » ici seulement aurait rendu le geste dépendant d'un repli — on l'aurait
          cherché sans le trouver huit fois sur dix. */}
      {vivants.length > 0 && deplie && (
        <ul className="ert-liste ert-deplie">
          {vivants.map((l) => (
            <li key={l.id} className="ert-ligne">
              {/* LOT RATTACHEMENT-2 — L'ÉTIQUETTE EST LE POINT D'ENTRÉE de l'historique : un clic, et l'on voit tout
                  ce qui s'est dit à propos de ce logement. C'est le chemin le plus court depuis un mail qu'on lit. */}
              {onHistorique
                ? (
                  <button type="button" className="ert-lien" onClick={() => onHistorique(l.cible)}
                    title={`Tout l’historique — ${titreDe(l)}`}>
                    {titreDe(l)}
                  </button>
                )
                : <span className="ert-nom">{titreDe(l)}</span>}
              {/* 🔴 LA PASTILLE EST AUSSI DANS LE « voir plus » (demande d'Arno) : chaque bien y a son descriptif. */}
              {l.cible.cle !== null && (
                <InfoBien cle={l.cible.cle} titre={titreDe(l)} surLaLigne={titreDe(l)} />
              )}
              {/* D'OÙ VIENT LE LIEN, écrit quand il vient du moteur : une personne, elle, engage sa décision. */}
              {!l.parUnHumain && <span className="ert-source">automatique</span>}
              {l.pieceId !== null && <span className="ert-source">cette pièce seulement</span>}
            </li>
          ))}
          <li className="ert-ligne">
            <button type="button" className="gst-lien-bouton ert-voir" onClick={() => setDeplie(false)}>
              voir moins
            </button>
          </li>
        </ul>
      )}
      </div>

      {/* ══ 🔴🔴 À L'EXTRÉMITÉ DROITE : LE MÊME MODULE QUE LA FENÊTRE DE RÉDACTION ══════════════════════════
          Mêmes états, mêmes mots, même animation « D — Élastique ». Seule la place change (version compacte,
          à la hauteur du bloc) — et c'est bien le MÊME composant : deux implémentations du même geste
          finiraient par deux comportements, c'est la règle du module depuis « Hors gestion ». */}
      <ChampClassement compact
        cibles={biensRattaches}
        interne={interne === true}
        horsGestion={horsGestion}
        /* 🔴 « Rattacher » ouvre la modale — et la case verte « Rattaché » la rouvre, cochée (demande d'Arno). */
        onRattacher={() => setAjout(true)}
        /* ⚠️ GRISÉE SI L'ON NE SAIT PAS : `interne === null` veut dire migration 281 absente, ou lecture en
           échec. Proposer un geste dont on sait qu'il ne pourra pas aboutir serait pire que l'absence. */
        interneDisponible={interne !== null && onInterne !== undefined}
        /* 🔴🔴 POINT 2 — il DEMANDE d'abord, quand il y a des biens à détacher. Sans bien, rien ne change. */
        onInterne={() => { void cliquerInterne(); }}
        onReinitialiser={() => { void reinitialiser(); }} />
      </div>

      {/* ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — LA CONFIRMATION, PUIS L'« ANNULER » ══════

          DÉCISION D'ARNO (04/10/2026) : « AVANT d'appliquer, un message clair : “Marquer interne détachera :
          <liste des biens>” avec Confirmer / Annuler. Après : “Annuler” pendant quelques secondes, qui remet
          exactement les rattachements d'avant. »

          🔴 LA LISTE EST NOMMÉE, JAMAIS COMPTÉE. « détachera 3 biens » n'apprend rien : on ne peut pas décider
          sans savoir LESQUELS. C'est tout l'objet de la confirmation, et c'est aussi ce qui autorise ce geste à
          toucher un lien posé à la main — la même raison que « Toute la conversation ».

          ⚠️ LE PANNEAU EST ICI, SOUS LES DEUX CASES, et non dans une fenêtre modale : on décide en voyant le mail
          et ses biens, pas devant un voile qui les cache. */}
      {demandeInterne !== null && (
        <div className="ert-interne-panneau" role="group" aria-label="Confirmer le marquage « interne »">
          {/* 🔴🔴 LES TROIS FENÊTRES D'ARNO, ET LES MÊMES MOTS QU'AILLEURS (`CHOIX_SUIVI`) : « Ce mail uniquement »,
              « Ce mail et la conversation à venir », « Toute la conversation ». En écrire une seconde série aurait
              donné deux vocabulaires pour une même notion. */}
          <p className="ert-interne-mot">Jusqu’où ce marquage porte-t-il ?</p>
          <div className="ert-interne-fenetres" role="radiogroup" aria-label="Portée du marquage">
            {CHOIX_SUIVI.map((c) => (
              <label key={c.cle} className="ert-interne-fenetre" title={c.aide}>
                <input type="radio" name={`ert-interne-${messageId}`} checked={demandeInterne.choix === c.cle}
                  disabled={occupeInterne}
                  onChange={() => { void changerFenetreInterne(c.cle); }} />
                <span>{c.mot}</span>
              </label>
            ))}
          </div>
          {/* 🔴 ET LA LISTE SUIT LE CHOIX, en direct : « ce mail uniquement » et « toute la conversation » ne
              détachent pas les mêmes biens. Une liste figée promettrait autre chose que ce que le bouton ferait. */}
          {demandeInterne.biens.length === 0 ? (
            <p className="ert-interne-note">
              Aucun bien à détacher avec cette portée : le marquage ne retirera aucun rattachement.
            </p>
          ) : (
            <>
              <p className="ert-interne-mot">{messageDetachement(demandeInterne.biens)}</p>
              <ul className="ert-interne-liste">
                {demandeInterne.biens.map((b) => <li key={b.lienId}>{b.libelle}</li>)}
              </ul>
              <p className="ert-interne-note">
                Les rattachements sont RETIRÉS, jamais supprimés : ils restent datés et signés, et « Annuler » les
                remet.
              </p>
            </>
          )}
          <div className="ert-interne-boutons">
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupeInterne}
              onClick={() => { void appliquerInterne(demandeInterne.choix, demandeInterne.biens); }}>
              Confirmer
            </button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupeInterne}
              onClick={() => setDemandeInterne(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* 🔴 APRÈS LE GESTE : le compte rendu, et la sortie — quelques secondes, puis elle s'efface d'elle-même.
          Un « Annuler » qui resterait indéfiniment ferait croire que le geste n'est jamais acquis. */}
      {detachesInterne !== null && (
        <div className="ert-interne-panneau ert-interne-panneau--fait" role="status">
          <p className="ert-interne-mot">{motApresDetachement(detachesInterne.length)}</p>
          <ul className="ert-interne-liste">
            {detachesInterne.map((b) => <li key={b.lienId}>{b.libelle}</li>)}
          </ul>
          <div className="ert-interne-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupeInterne}
              onClick={() => { void annulerInterne(); }}>
              Annuler — remettre {detachesInterne.length === 1 ? 'ce bien' : 'ces biens'}
            </button>
          </div>
        </div>
      )}

      {/* ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — L'AUTRE SENS, SA QUESTION ET SA SORTIE ═══════════════
          DÉCISION D'ARNO : « Avant d'appliquer : “Ce mail est marqué Interne : rattacher ce bien retirera la
          marque Interne” avec Confirmer / Annuler. Après : “Annuler” quelques secondes, qui remet exactement
          l'état d'avant. »

          🔴 LA PHRASE EST CELLE DU MODULE PUR, mot pour mot celle d'Arno. Elle n'est pas réécrite ici.

          ⚠️ PAS DE CHOIX DE FENÊTRE DANS CE PANNEAU-CI, et c'est la différence avec son jumeau : la fenêtre est
          DÉJÀ choisie — c'est celle du classement qu'on est en train de valider, et Arno écrit « selon la MÊME
          fenêtre choisie ». En offrir une seconde ici aurait permis de classer sur toute la conversation et de ne
          lever la marque que sur un mail : deux décisions contradictoires dans un seul geste. */}
      {demandeLevee !== null && (
        <div className="ert-interne-panneau" role="group" aria-label="Confirmer la levée de la marque « interne »">
          <p className="ert-interne-mot">{demandeLevee.message}</p>
          <p className="ert-interne-note">
            {demandeLevee.mails.length > 1
              ? `La fenêtre choisie porte sur ${demandeLevee.mails.length} mails marqués « interne » : la marque `
                + 'sera retirée de chacun.'
              : 'La marque sera retirée de ce mail.'}
            {' La marque de la CONVERSATION n’est pas touchée : si elle en porte une, les réponses à venir '
              + 'resteront internes — un clic sur la case verte la retire.'}
          </p>
          <p className="ert-interne-note">
            Rien n’est supprimé : la marque reste en base, datée et signée, et « Annuler » la remet.
          </p>
          <div className="ert-interne-boutons">
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe || occupeInterne}
              onClick={() => {
                const g = demandeLevee.geste;
                const leves = demandeLevee.mails;
                setDemandeLevee(null);
                void ecrireClassement(g.choisies, g.personnes, g.suiviContact, g.expediteurNonVerifie, leves);
              }}>
              Confirmer
            </button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe || occupeInterne}
              onClick={() => setDemandeLevee(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* 🔴 APRÈS LE GESTE : la sortie, quelques secondes. Elle défait les DEUX moitiés — le rattachement qui
          vient d'être posé ET la marque qui vient d'être levée. Remettre l'une sans l'autre reconstruirait
          « Interne avec un bien », l'état même que ce lot ferme. */}
      {levee !== null && levee !== undefined && (
        <div className="ert-interne-panneau ert-interne-panneau--fait" role="status">
          <p className="ert-interne-mot">{motApresLevee(levee.mails.length)}</p>
          <div className="ert-interne-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupeInterne}
              onClick={() => { void annulerLevee(); }}>
              Annuler — remettre la marque « interne »
            </button>
          </div>
        </div>
      )}

      {/* ══ 🔴🔴 UN RESTE D'ANCIEN MODÈLE : DIT POUR CE QU'IL EST, ET JAMAIS SOUS LE TITRE DES BIENS ═════════
          Il porte les mêmes gestes qu'avant — « Modifier » mène au sélecteur de bien, « Retirer » l'enlève — mais
          la phrase ne laisse plus croire que cette personne EST le bien du mail. */}
      {ancienModele.length > 0 && (
        <>
          <p className="ert-sous-titre ert-ancien-titre">
            Rattachement d’avant la règle « bien » — à reprendre
          </p>
          <ul className="ert-liste">
            {ancienModele.map((l) => (
              <li key={l.id} className="ert-ligne ert-ligne--ancien">
                <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
                <span className="ert-nom">{l.libelle}</span>
                <span className="ert-motif">
                  ce mail est rangé sous une PERSONNE ; un mail se classe dans un BIEN — choisissez le logement
                </span>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => setModifie(l)}>
                  Modifier
                </button>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => void changer(l, 'retire', `Rattachement retiré : ${l.libelle}`)}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA MÊME MODALE QUE LA RÉDACTION ══════════════════════════════
          Demande d'Arno (point 4) : « la modale “Rattacher ce mail à…” s'ouvre avec les biens actuellement
          rattachés COCHÉS, plus les propositions et le moteur de recherche. On ajoute ou on décoche librement. »

          🔴 ELLE REMPLACE LE PANNEAU EN LIGNE (`MenuRattachementBien`), qui ouvrait les mêmes zones mais sous
          une autre forme et avec une autre validation. Une seule fenêtre pour un seul geste, des deux côtés de
          l'application : c'est tout l'objet de ce lot.

          ⚠️ CE QUE LE PANNEAU PORTAIT DE PLUS EST REPRIS AU PIED, pas perdu : le suivi (qui a remplacé la
          portée, lot SUIVI-CONVERSATION) et « Hors gestion, ou classer par pièce… ». */}
      {ajout && (
        <RattacherEnEcrivant
          messageId={messageId}
          destinataires={[]}
          /**
           * 🔴🔴 LOT CONTACTS-EXTERNES — « ← Retour » GARDE LES CASES COCHÉES (demande d'Arno), et voici comment :
           * on rouvre l'étape 1 avec la liste qu'on venait d'y valider. `precocher` (dans `RattacherEnEcrivant`)
           * coche d'office les cibles qu'on lui donne, et les fait figurer dans la liste même si le moteur ne les
           * propose pas (`horsPropositions`). La fenêtre se retrouve donc exactement comme on l'a quittée.
           *
           * ⚠️ `?? biensRattaches` : hors d'un retour, c'est le comportement d'avant ce lot, sans une différence.
           */
          cibles={ciblesEnCours ?? biensRattaches}
          /**
           * 🔴🔴 ET « GARDER LES CASES COCHÉES » VEUT DIRE LES DEUX SENS. `cibles` seul ne suffisait pas : la
           * pré-coche de la fenêtre y AJOUTE les biens recommandés par le moteur, c'est-à-dire ceux qu'on venait
           * justement de décocher. Défaut vu à l'écran le 02/10/2026 sur le mail 57329 (GDS PROPRETÉ) : on
           * revenait de l'étape 2 avec « 5 bien(s) coché(s) » au lieu d'un seul.
           */
          selectionInitiale={ciblesEnCours === null
            ? null
            : ciblesEnCours.filter((c) => c.sorte === 'lot').map((c) => c.cle ?? '')}
          onSelection={setSelectionModale}
          onChange={(c) => { void appliquerCibles(c); }}
          /* 🔴 FERMER OUBLIE LA SÉLECTION : rouvrir repart de l'état validé, donc sans bloc, comme à l'ouverture.
             ⚠️ LOT CONTACTS-EXTERNES — la croix et « Échap » oublient AUSSI les cases gardées pour le retour :
                sortir par là, c'est renoncer, et renoncer ne doit rien laisser derrière.

             🔴🔴 ET CE `null` N'EFFACE PAS CELUI DU CHEMIN « VALIDER », MALGRÉ LES APPARENCES. Dans la modale,
                `valider()` appelle `onChange()` PUIS `onFerme()`, tous deux de façon synchrone — mais
                `appliquerCibles` est ASYNCHRONE : elle n'a encore rien posé quand cette ligne passe. C'est donc
                `setCiblesEnCours(choisies)`, exécuté APRÈS la réponse du serveur, qui a le dernier mot. L'ordre
                réel est : onChange (début) → onFerme (ce null) → réponse → ciblesEnCours. */
          onFerme={() => { setSelectionModale(null); setAjout(false); setCiblesEnCours(null); }}
          validationBloquee={blocVisible && choix === 'conversation' && !confirme
            ? 'Cochez la confirmation ci-dessus pour reclasser toute la conversation.'
            : null}
          piedSupplementaire={(
            <>
              {/* ══ 🔴🔴 LOT SUIVI-CONVERSATION — « SUIVI DANS LA CONVERSATION » ══════════════════════════
                  Demande d'Arno : « Il n'apparaît dans la modale que si DEUX conditions sont réunies : le mail
                  n'est pas le premier de la conversation, ET on modifie un classement déjà validé sur cette
                  conversation. Sinon, il est absent, et le premier classement vaut pour ce mail et toute la
                  suite. » La décision est dans le module PUR (`blocSuiviVisible`). */}
              {blocVisible && (
                <fieldset className="ert-portee">
                  <legend className="ert-portee-titre">Suivi dans la conversation</legend>
                  {CHOIX_SUIVI.map((c) => (
                    <label className="ert-choix ert-choix--suivi" key={c.cle}>
                      <input type="radio" name="ert-suivi" checked={choix === c.cle}
                        onChange={() => { setChoix(c.cle); setConfirme(false); }} />
                      <span>
                        <span className="ert-suivi-mot">{c.mot}</span>
                        {/* 🔴 UNE PHRASE D'AIDE SOUS CHAQUE CHOIX, EN FRANÇAIS SIMPLE (demande d'Arno) : trois
                            options dont on ne comprend pas la différence valent une option. */}
                        <span className="ert-suivi-aide">{c.aide}</span>
                      </span>
                    </label>
                  ))}

                  {/* 🔴🔴 L'ALERTE DE « TOUTE LA CONVERSATION », et sa confirmation obligatoire. */}
                  {choix === 'conversation' && (
                    <p className="ert-alerte" role="status">
                      <span className="ert-alerte-texte">{alerte}</span>
                      <label className="ert-choix">
                        <input type="checkbox" checked={confirme}
                          onChange={() => setConfirme((v) => !v)} />
                        <span>Je confirme le reclassement de toute la conversation.</span>
                      </label>
                    </p>
                  )}
                </fieldset>
              )}
              <button type="button" className="gst-lien-bouton"
                onClick={() => { setAjout(false); setClasser(true); }}>
                Hors gestion, ou classer par pièce…
              </button>
            </>
          )} />
      )}

      {/* ══ 🔴 LOT AFFECTATION-PAR-BIEN — LES PROPOSITIONS SONT DES BIENS, TOUJOURS ══════════════════════════
          Demande d'Arno, sur un cas réel : « Contestation de la retenue de 450 € sur dépôt de garantie » proposait
          « PROPRIÉTAIRE MARTY Jean-François (310) ». Un propriétaire n'est pas un dossier — c'est une PARTIE d'un
          dossier. Le bloc présente donc des BIENS (adresse + lot), chacun avec son propriétaire et son locataire À
          LA DATE DU MAIL, son motif en clair, et une case à cocher.

          🔴 LES PROPOSITIONS ANCIENNES DE TYPE PROPRIÉTAIRE SONT MONTRÉES COMME LA LISTE DE LEURS BIENS, et RIEN
          n'est réécrit en base tant que personne n'a validé : une ligne ancienne n'est pas fausse, elle est écrite
          dans un vocabulaire qu'on n'emploie plus. */}
      {/* 🔴 LOT BIEN-RATTACHE — LES PROPOSITIONS SONT DANS LE MENU, PLUS À L'ÉCRAN EN PERMANENCE. Demande
          d'Arno : une seule entrée. Quand il y en a, la ligne le DIT — sinon on ne saurait pas qu'il y a
          quelque chose à ouvrir, et l'automatisation travaillerait pour personne. */}
      {/* 🔴 LOT LISTE-PAGINATION — CETTE MENTION A ÉTÉ DÉPLACÉE au bout de la ligne « Bien(s) rattaché(s) », dans
          `ert-tete` (voir son encadré). Elle n'est pas retirée : elle est REMONTÉE, et c'est ce qui fait gagner la
          ligne qu'Arno demande. Rien n'est affiché deux fois — il n'en reste aucune copie ici. */}

      {/* Les propositions qui ne sont PAS des biens (une carte proposée) gardent leurs deux gestes, inchangés :
          rien n'est retiré, et ce bloc-ci ne sait rien des événements. */}
      {candidatsHorsBien.length > 0 && (
        <>
          <p className="ert-sous-titre">
            {candidatsHorsBien.length === 1 ? 'Une autre proposition' : `${candidatsHorsBien.length} autres propositions`}
          </p>
          <ul className="ert-liste">
            {candidatsHorsBien.map((l) => (
              <li key={l.id} className="ert-ligne ert-ligne--propose">
                <span className="ert-sorte">{motSorte(l.cible.sorte)}</span>
                <span className="ert-nom">{l.libelle}</span>
                {/* POURQUOI ce candidat : sans le motif, on ne peut pas trancher sans rouvrir le code. */}
                {l.motif && <span className="ert-motif">{l.motif}</span>}
                <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={occupe}
                  onClick={() => void changer(l, 'confirme', `Rattachement confirmé : ${l.libelle}`)}>
                  Confirmer
                </button>
                <button type="button" className="gst-lien-bouton" disabled={occupe}
                  onClick={() => void changer(l, 'rejete', `Proposition rejetée : ${l.libelle}`)}>
                  Rejeter
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* CE QU'ON VIENT DE DÉFAIRE, remis d'un clic. Rien n'a été supprimé : c'est le même lien qui revient. */}
      {remettables.length > 0 && (
        <ul className="ert-liste ert-liste--defaits">
          {remettables.map((l) => (
            <li key={l.id} className="ert-ligne">
              <span className="ert-defait">Retiré · {l.libelle}</span>
              <button type="button" className="gst-lien-bouton" disabled={occupe}
                onClick={() => void changer(l, l.statut === 'propose' ? 'propose' : 'confirme',
                  `Rattachement remis : ${l.libelle}`)}>
                Remettre
              </button>
            </li>
          ))}
        </ul>
      )}

      {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

      {/* LOT AFFECTATION-PAR-BIEN — « Hors gestion » et les cas fins (portée, pièces) passent par LA fenêtre de
          classement, jamais par une seconde implémentation : deux chemins finiraient par deux comportements. */}
      {classer && (
        <ClasserMail messageId={messageId} filId={null}
          onFerme={() => setClasser(false)}
          onGeste={onGeste}
          onFait={async () => { await onChange(); }} />
      )}

      {modifie !== null && (
        <ModifierRattachement lien={modifie} messageId={messageId}
          onGeste={onGeste}
          onAnnuler={() => setModifie(null)}
          onFait={async () => { setModifie(null); await onChange(); }} />
      )}

      {/* ══ 🔴🔴 LOT CONTACTS-EXTERNES — LE TEMPS D'UN ALLER-RETOUR, ON DIT CE QU'ON FAIT ════════════════════
          « La modale ne se ferme pas » (Arno) : entre l'étape 1 qui se démonte et l'étape 2 qui se monte, il y a
          une requête. Sans ce voile, l'écran serait nu pendant ce temps — et un clignotement se lit comme un
          défaut, pas comme une attente. Il porte le MÊME cadre et les MÊMES mesures que les deux étapes. */}
      {verification && (
        <div className="ece-voile" role="presentation">
          <style>{CSS_ETAPE_CONTACT}</style>
          <div className="ece ece--attente" role="status">
            <p className="ece-attente">Vérification de l’expéditeur…</p>
          </div>
        </div>
      )}

      {/* ══ 🔴🔴 L'ÉTAPE 2 : « CLASSER CE NOUVEAU CONTACT » ══════════════════════════════════════════════════
          Elle ne s'ouvre QUE sur décision du serveur (`requise`), qui applique le module pur `etape2Requise` :
          mail reçu, au moins un bien coché, ni Interne ni Hors gestion, pas un « Document CRITERIMMO », adresse
          qui n'est pas des nôtres, et expéditeur inconnu de toutes les fiches des biens cochés. */}
      {etape2 !== null && (
        <EtapeContactExterne
          data={etape2}
          occupe={occupeEtape2 || occupe}
          erreur={erreurEtape2 ?? erreur}
          /* 🔴 « ← Retour » ROUVRE L'ÉTAPE 1 AVEC SES CASES (voir `ciblesEnCours`). Rien n'est écrit : on revient
             exactement où l'on était, et le geste reste à faire. */
          onRetour={() => { setEtape2(null); setErreurEtape2(null); setAjout(true); }}
          onValider={validerEtape2} />
      )}
    </div>
  );
}

/**
 * Le mot de la sorte, écrit en toutes lettres. PUR.
 *
 * ⚠️ « Propriétaire » et « Locataire » RESTENT ICI, alors qu'on n'en écrit plus : 19 555 lignes historiques les
 * portent, et elles doivent rester LISIBLES. Ce qui a changé, c'est l'endroit où elles s'affichent — jamais sous
 * le titre « Bien(s) rattaché(s) ».
 */
export function motSorte(s: 'lot' | 'proprietaire' | 'locataire' | 'evenement'): string {
  if (s === 'lot') return 'Logement';
  if (s === 'proprietaire') return 'Propriétaire';
  if (s === 'locataire') return 'Locataire';
  return 'Événement';
}

export const CSS_ENCART_RATTACHEMENT = `
/* Un encart de RENSEIGNEMENT, jamais une alerte. La sorte est écrite, l'origine aussi : rien ne tient à une couleur.
   Mobile d'abord : chaque ligne s'enroule, les boutons font au moins 44 px de haut. */
/* ══ LOT FIL-LECTURE-2 — COMPACT : les blancs partent, rien d'autre ══════════════════════════════════════════════
   Marges intérieures réduites (10/12 px puis 6/10), plus d'espace entre les blocs empilés, et surtout la tête, la
   liste et le bouton d'ajout sur une SEULE rangée souple. Les tailles de texte, elles, ne bougent pas : on gagne
   sur le vide, jamais sur la lisibilité. */
/* 🔴 LOT LISTE-PAGINATION — MARGES VERTICALES RESSERRÉES (demande d'Arno : « réduis aussi les marges verticales
   du bloc »). L'espace entre blocs empilés passe de .2rem à .1rem, la marge extérieure de .5rem à .3rem et le
   rembourrage haut/bas de 6 px à 4 px. Les tailles de texte ne bougent pas : on gagne sur le vide, jamais sur la
   lisibilité — c'est la règle déjà écrite au-dessus, et ce lot ne fait que la pousser d'un cran. */
/* 🔴🔴 LOT BLOC-CLASSER-COMPACT — UNE MARGE INTERIEURE EGALE, ET LE MODULE QUI NE TOUCHE JAMAIS LE BORD.
   « marge interieure egale en haut, en bas et a droite, environ 10 a 12 px. Il ne touche JAMAIS le bord de la
   capsule grise » (Arno). Le rembourrage etait de 4 px en haut et en bas : le module arrivait a 4 px du bord,
   et la capsule paraissait trop serree autour de lui. 10 px partout, et un interligne REGULIER entre les deux
   lignes (6 px) — ni tasse, ni ecarte.
   ⚠️ 10 px SUR LES QUATRE COTES, et non 10/12 : mesure a l'ecran, 12 px a droite plus la bordure faisaient
   13 px d'un cote contre 11 de l'autre. Arno demande une marge EGALE ; elle doit l'etre a la mesure. */
.ert{display:flex;flex-direction:column;gap:6px;margin:.3rem 0;padding:10px;border-radius:10px;
  border:1px solid var(--color-svv-line);background:var(--color-svv-field);overflow-wrap:anywhere}
/* La rangée unique : titre, liste et bouton d'ajout s'y suivent, et n'enroulent que si la largeur manque. */
.ert-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem .5rem}
.ert-tete>.ert-liste{flex:1 1 auto;min-width:0}

/* ══ 🔴🔴 LA LIGNE 2 TIENT SUR UNE LIGNE, ET NE POUSSE JAMAIS LE MODULE ══════════════════════════════════════
   « L'adresse longue se tronque avec “…” sur une ligne, sans jamais pousser le module de droite » (Arno).
   TROIS CONDITIONS, et il faut les trois :
     ① la rangee ne s'enroule PAS (nowrap) — sinon « voir plus » tombe a la ligne, et la ligne 2 en fait deux ;
     ② elle peut RETRECIR (min-width:0) — sans quoi un flex refuse de passer sous la taille de son contenu, et
       l'adresse pousserait le module hors du bloc au lieu de se couper ;
     ③ seule l'ADRESSE se laisse comprimer (flex:0 1 auto) ; le titre, « automatique » et « voir plus » gardent
       leur taille (flex:0 0 auto). Ce sont trois mots courts : les tronquer ne ferait gagner que du sens. */
.ert-tete--biens{flex-wrap:nowrap;min-width:0;overflow:hidden}
.ert-tete--biens>*{flex:0 0 auto}
.ert-tete--biens>.ert-premier{flex:1 1 auto;min-width:0}
/* 🔴 LA MENTION DES PROPOSITIONS SE COMPRIME, ELLE AUSSI, et ne s'enroule jamais : mesure a l'ecran, elle
   passait sur DEUX lignes et le bloc en faisait trois. Elle se tronque donc en dernier recours — l'adresse
   garde la priorite parce qu'elle est plus longue et absorbe davantage de compression —, et son infobulle
   porte le texte entier. */
.ert-tete--biens>.ert-propositions{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis}
.ert-titre{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:var(--color-svv-muted)}
.ert-vide{font-size:.8rem;font-style:italic;color:var(--color-svv-muted)}
.ert-sous-titre{margin:.3rem 0 0;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted)}
.ert-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.ert-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;font-size:.85rem;color:var(--color-svv-ink);
  line-height:1.4;padding:0}
.ert-ligne--propose{padding:4px 6px;border-radius:8px;border:1px dashed var(--color-svv-line)}
/* 🔴🔴 UN RESTE D'ANCIEN MODÈLE. Le liseré rouge le distingue du reste — mais ce sont les MOTS du titre et du
   motif qui portent l'information, jamais la couleur seule : la règle du module depuis la première capsule. */
.ert-ancien-titre{color:var(--color-svv-red)}
.ert-ligne--ancien{padding:4px 6px;border-radius:0 8px 8px 0;border-left:3px solid var(--color-svv-red);
  background:var(--color-svv-field)}
.ert-liste--defaits{opacity:.75}
.ert-sorte{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.02em;
  color:var(--color-svv-muted);flex:0 0 auto}
.ert-nom{font-weight:700}
.ert-lien{background:none;border:0;padding:0;margin:0;font:inherit;font-size:.85rem;font-weight:700;
  color:var(--color-svv-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer;min-height:32px;
  text-align:left;overflow-wrap:anywhere}
@media (pointer:coarse){.ert-lien{min-height:38px}}
.ert-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.ert-source,.ert-motif{font-size:.74rem;color:var(--color-svv-muted)}
.ert-motif{font-style:italic}
/* ══ 🔴🔴 LOT PIECES-RECUPEREES-ET-INTERNE-SYMETRIQUE, POINT 2 — LE PANNEAU « MARQUER INTERNE DÉTACHERA » ═══════
   AMBRE POUR LA DEMANDE (on s'apprete a retirer quelque chose), NEUTRE POUR LE COMPTE RENDU (c'est fait, il reste
   une sortie). Jetons du theme dans les deux cas : lisible en Clair comme en Sombre, et le MOT porte toujours
   l'information — jamais la seule couleur.
   Mobile d'abord : la liste casse en fin de ligne, les boutons font 44 px et passent a la ligne si besoin. */
.ert-interne-panneau{margin:.4rem 0 0;padding:.5rem .6rem;border:1px solid var(--color-svv-amber);
  border-radius:.5rem;background:var(--color-svv-amber-soft)}
.ert-interne-panneau--fait{border-color:var(--color-svv-line-strong);background:var(--color-svv-surface)}
.ert-interne-mot{margin:0;font-size:.8rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ert-interne-liste{margin:.25rem 0 0;padding-left:1.1rem;display:flex;flex-direction:column;gap:.15rem;
  font-size:.78rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.ert-interne-note{margin:.3rem 0 0;font-size:.72rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.ert-interne-boutons{margin:.45rem 0 0;display:flex;flex-wrap:wrap;gap:.4rem}
/* Les trois fenetres : une par ligne, cible tactile de 44 px, aucune dependance au survol. */
.ert-interne-fenetres{margin:.3rem 0 .35rem;display:flex;flex-direction:column;gap:.1rem}
.ert-interne-fenetre{display:flex;align-items:center;gap:.4rem;min-height:44px;font-size:.78rem;
  color:var(--color-svv-ink);cursor:pointer}
.ert-defait{font-size:.8rem;font-style:italic;color:var(--color-svv-muted)}
.ert-ajouter{align-self:baseline;flex:0 0 auto}

/* ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — DEUX COLONNES : CE QUI EST, PUIS CE QU'ON FAIT ════════════════════════
   « place a l'extremite DROITE le meme composant que dans la fenetre de redaction […] a la hauteur du bloc »
   (Arno). La gauche prend toute la place restante et peut s'enrouler ; la droite garde sa largeur.
   ⚠️ align-items:center : le module de classement est CENTRE sur la hauteur du bloc, pas colle en haut —
   c'est ce que veut dire « a la hauteur du bloc » quand la gauche passe sur deux lignes.
   ⚠️ Sous 560 px, les deux colonnes s'empilent : deux cases de 38 px cote a cote avec une adresse complete
   deviennent illisibles sur un telephone. */
/* ══ 🔴🔴 DEUX COLONNES : LES DEUX LIGNES A GAUCHE, LE MODULE A DROITE DES DEUX ══════════════════════════════
   « Le module de droite est centre verticalement sur la hauteur des DEUX lignes » (Arno) : il est donc le frere
   de la COLONNE, pas de la ligne 2. align-items:stretch lui donne toute la hauteur, et c'est lui qui centre
   son contenu (voir .ccl--compact) — ce qui laisse aussi ses cases s'etirer avec le bloc.
   ⚠️ min-width:0 SUR LA COLONNE : sans lui, le texte de gauche imposerait sa largeur naturelle et pousserait
   le module. C'est la regle la plus souvent oubliee des mises en page flex, et c'est exactement le defaut
   qu'Arno decrit. */
/* ⚠️ « nowrap » ET NON « wrap », ET C'EST LA CLE DE LA DEMANDE. Avec « wrap », le module passait a la ligne des que
   la place manquait — mais en gardant SA largeur, donc colle a gauche sous le texte : ni une colonne, ni une
   pleine largeur, juste un decrochage. Il n'y a desormais que DEUX etats, et aucun entre-deux : cote a cote
   (le texte se comprime et l'adresse se tronque), ou empile en PLEINE largeur sous les deux lignes. */
.ert-rangee{display:flex;flex-wrap:nowrap;align-items:stretch;gap:.5rem .8rem;min-width:0}
.ert-colonne{display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-width:0}
/* A largeur reduite, le module passe SOUS les deux lignes, en PLEINE largeur (demande d'Arno). */
@media (max-width:560px){
  .ert-rangee{flex-direction:column;align-items:stretch}
  .ert-rangee>.ccl--compact{width:100%}
}

/* ══ LA LIGNE REPLIEE : le PREMIER bien, et « voir plus » au bout ════════════════════════════════════════════
   ⚠️ LE LIBELLE NE DEBORDE PAS, il se COUPE avec des points de suspension : une adresse complete peut faire
   80 caracteres, et la faire passer a la ligne repousserait le module de classement hors de la rangee. Le
   texte entier reste accessible — c'est tout l'objet de « voir plus », et l'infobulle le porte aussi. */
.ert-premier{display:flex;flex-wrap:nowrap;align-items:baseline;gap:.4rem;min-width:0;overflow:hidden}
.ert-premier>*{flex:0 0 auto}
.ert-premier>.ert-lien--coupe{flex:0 1 auto;min-width:0}
.ert-lien--coupe{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;min-width:0;
  display:block}
.ert-voir{font-weight:600;white-space:nowrap}
/* Le depliage vit SOUS la ligne 2, dans la colonne : il ne doit ni la rallonger, ni pousser le module. */
.ert-deplie{gap:2px}

/* La portee, reprise au pied de la modale. Meme forme que celle du panneau qu'elle remplace. */
.ert-portee{margin:0 0 .5rem;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  min-width:0}
.ert-portee-titre{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.ert-choix{display:flex;align-items:center;gap:.5rem;min-height:32px;font-size:.85rem;color:var(--color-svv-ink);
  cursor:pointer}
.ert-choix--inactif{color:var(--color-svv-muted);cursor:default}
.ert-portee-note{margin:.2rem 0 0;font-size:.74rem;font-style:italic;color:var(--color-svv-muted)}

/* ══ 🔴🔴 LOT SUIVI-CONVERSATION — LES TROIS CHOIX, ET LEUR PHRASE D'AIDE ═══════════════════════════════════════
   « Une phrase d'aide sous chaque choix, en francais simple » (Arno). Elle vit SOUS le mot, en petit et en gris :
   le mot se lit d'un coup d'oeil, l'aide se lit quand on hesite. Les deux sur la meme ligne auraient fait choisir
   au hasard. */
.ert-choix--suivi{align-items:flex-start;min-height:0;padding:3px 0}
.ert-choix--suivi>span{display:flex;flex-direction:column;gap:1px;min-width:0}
.ert-suivi-mot{font-weight:600}
.ert-suivi-aide{font-size:.74rem;color:var(--color-svv-muted);line-height:1.35}

/* 🔴 L'ALERTE DE « TOUTE LA CONVERSATION ». Elle reclasse des mails PASSES : elle se voit, et elle se confirme.
   Le liseret rouge n'est qu'un renfort — le MOT porte l'information, regle du module depuis la premiere capsule. */
.ert-alerte{display:flex;flex-direction:column;gap:.2rem;margin:.4rem 0 0;padding:6px 8px;border-radius:0 .5rem .5rem 0;
  border-left:3px solid var(--color-svv-red);background:var(--color-svv-field)}
.ert-alerte-texte{font-size:.8rem;font-weight:600;color:var(--color-svv-ink)}
/* LOT BIEN-RATTACHE — la mention qui dit qu'il y a quelque chose a ouvrir. Sans elle, l'automatisation
   travaillerait pour personne : on ne saurait pas qu'un menu porte des propositions.
   🔴 LOT LISTE-PAGINATION — elle vit maintenant DANS la rangee ert-tete, au bout de la ligne des biens : plus de
   marge haute (elle creait le decrochage), et flex 0 1 auto pour qu'elle passe a la ligne d'elle-meme quand la
   largeur ne suffit pas, au lieu de comprimer ses voisines.
   (Aucun accent grave dans ce commentaire : il vit DANS un litteral de gabarit, qu'un seul accent grave
    terminerait — piege consigne plusieurs fois dans ce depot.) */
.ert-propositions{margin:0;font-weight:600;color:var(--color-svv-ink);flex:0 1 auto}
/* Le point median qui separe les trois morceaux de la ligne. Purement decoratif : aria-hidden cote balise. */
.ert-separateur{flex:0 0 auto;font-size:.74rem;color:var(--color-svv-muted)}
/* 🔴 LA CIBLE TACTILE : on ne descend pas sous 44 px de HAUTEUR TOTALE, on la répartit autrement. Les trois liens
   (« Modifier », « Retirer », « + Rattacher à… ») gardaient chacun 44 px de hauteur propre, ce qui empilait trois
   pavés dans un encart qui doit tenir sur une ligne. Ils gardent une hauteur confortable et un padding horizontal
   qui élargit la zone cliquable — la surface reste atteignable au doigt, la hauteur ne triple plus. */
.ert .gst-lien-bouton{min-height:32px;padding:0 .2rem}
@media (pointer:coarse){.ert .gst-lien-bouton{min-height:38px;padding:0 .35rem}}
`;
