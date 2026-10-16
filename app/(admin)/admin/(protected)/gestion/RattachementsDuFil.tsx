'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
/* 🔴 LOT GESTION-SUIVI-MIXTE — les biens One shot d'un mail (même vérité que le badge) et les mots du suivi mixte. */
import { biensOneShotDuMail, MOT_CARTOUCHE_ONE_SHOT, TITRE_SUIVI_MIXTE } from '../../../../lib/gestion/suiviOneShot';
// LOT CONTACT-LIGNES — le type passe dans le titre, et ne s'ecrit qu'une fois par groupe.
import { lignesParType } from '../../../../lib/gestion/telephoneAffichage';
/* 🔴🔴 LOT MONGA-1, POINT 3 — l'encart d'une intervention Monga, monté en tête de cette fenêtre. */
import { EncartMonga } from './EncartMonga';
import { ModifierRattachement, motSorteLong, CSS_MODIFIER_RATTACHEMENT } from './ModifierRattachement';
import { BoutonCopier, CSS_BOUTON_COPIER } from './BoutonCopier';
import { CSS_MENU_RATTACHEMENT, MenuRattachementBien } from './MenuRattachementBien';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
import { motSuiviAutomatique, suiviAutomatiqueDuMail } from '../../../../lib/gestion/reglesRattachement';
/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « Sortir du suivi » peut se faire pendant que cette fenêtre est ouverte. */
import { annoncerClassement, ecouterClassement } from '../../../../lib/gestion/signalClassement';
// LOT FICHE-RATTACHEMENT — les mots et les ordres vivent dans un module PUR, éprouvé sans écran.
import {
  adresseFicheAnnuaire, adresseHistoriqueDuBien, idDossierDrive,
  motAujourdhui, motNbBiensRattaches, motPeriode, motRole, motSansLocataire,
  motStatutBien, occupantsAujourdhuiADire,
  motSurface, qualitePersonne,
  AIDE_DRIVE_ABSENT, AIDE_DRIVE_DU_BIEN, AIDE_HISTORIQUE_ABSENT, AIDE_HISTORIQUE_DU_BIEN,
  AUCUN_BIEN_DU_MAIL, biensDuMail, ENCADRE_EXCEPTION_CE_MAIL, MENTION_AJOUT_PONCTUEL, motEnTeteMail,
  MOT_DRIVE_ABSENT, MOT_DRIVE_DU_BIEN, MOT_HISTORIQUE_DU_BIEN,
  MOT_MODIFIER_BIENS_DU_MAIL, resumeModificationBiens, TITRE_BIENS_DU_MAIL, TITRE_BIENS_SUIVIS,
  type BienRattache, type FicheRattachementFil, type PersonneRattachement,
} from '../../../../lib/gestion/ficheRattachement';
/* 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — « Ouvrir le Drive du bien » ouvre NOTRE outil Drive, et
   c'est CELUI-LÀ, pas une seconde fenêtre qui lui ressemblerait. Voir l'encadré d'`EcranDriveDuBien`. */
import { SelecteurFichierDrive } from './SelecteurFichierDrive';
/* 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT — LA RÈGLE DE SUIVI ET SON ALERTE VIENNENT DE LA SOURCE.
   `CHOIX_SUIVI` vit dans `EncartRattachement` depuis le lot BROUILLONS-APERCU-TYPES-LIBELLES, et il y est exporté
   précisément pour cela : les mots et les aides ne se recopient pas d'un écran à l'autre. */
import { CHOIX_SUIVI } from './EncartRattachement';
/**
 * 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LES MOTS DE LA LEVÉE, DANS UN MODULE PUR.
 *
 * 🔴 CETTE FENÊTRE EST **LA** PORTE PAR LAQUELLE ON RATTACHE UN BIEN À UN MAIL DÉJÀ MARQUÉ « INTERNE », et c'est
 * ce qui l'oblige à poser la question. Mesuré à l'écran le 04/10/2026 : quand un mail est interne, le bloc
 * « Classer ce mail » n'affiche plus les deux boutons mais la CASE VERTE, dont le clic RETIRE la marque. Le seul
 * chemin qui rattache un bien SANS retirer la marque d'abord part donc d'ici — « Visualiser / Modifier », puis
 * « Modifier les biens rattachés à ce mail ».
 */
import {
  messageLeveeInterne, motApresAnnulationLevee, motApresLevee, SECONDES_ANNULER_LEVEE,
  type SortieLevee, type TraceSuivi,
} from '../../../../lib/gestion/interneLevee';
/* 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — l'« Annuler » complet, écrit une seule fois pour les deux écrans. */
import { annulerLaLevee, defaireLaDecisionDeSuivi } from './annulationLevee';
/* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — les mots du mode ponctuel, écrits dans le module PUR. */
import {
  MOT_VALIDER_CE_MAIL_UNIQUEMENT,
  SECONDES_ANNULER_SORTIE,
} from '../../../../lib/gestion/sortirDuSuivi';
import {
  alerteTouteLaConversation, motClassement,
  /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL — la projection, pour reposer les PERSONNES en vigueur (voir `ecrire`). */
  projeter,
  type ChoixSuivi, type Classement, type ExceptionMail, type Periode, type PersonneClassee,
} from '../../../../lib/gestion/periodesConversation';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';
/* 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — le formulaire de création et la recherche d'événements, RÉEMPLOYÉS
   et non recopiés (voir l'encadré de `ChampsEvenement`). Le type vient du module PUR. */
import { ChampsEvenement, CSS_BLOC_EVENEMENT } from './BlocEvenement';
import type { ChoixConcernes } from './LocatairesConcernes';
/* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — les bornes de la carte neuve, décidées par le module PUR. */
import { bornesEvenement } from '../../../../lib/gestion/evenementQualite';
import { jourParis } from '../../../../lib/gestion/historiqueBien';
import { ChoisirEvenement } from './ChoisirEvenement';
/* 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — les cartes des biens suivis prennent le format des cartes du
   composant partagé : mêmes classes, même pastille « i », mêmes deux lignes de parties. */
import { CSS_LISTE_BIENS, PartiesSurDeuxLignes } from './ListeBiensACocher';
import { CSS_INFO_BIEN, InfoBien } from './InfoBien';
import { titresDistincts } from '../../../../lib/gestion/titreBien';
/* 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — la portée en quatre positions (module PUR) et sa glissière. */
import {
  definitionDe, modificationEnCours, motApresValidation, motConfirmationConversation,
  MOT_CONFIRMER_CONVERSATION, QUESTION_RETOUR_ORIGINE, type PositionPortee,
  /* 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — le premier classement d'un mail (module PUR). */
  AUCUN_BIEN_SUIVI, glissiereOuverte, morceauxDefinitionPortee, porteeArbitre, positionAffichee,
  /* 🔴🔴 LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — le bouton de la portée (module PUR). */
  etatBoutonPortee,
  /* 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — la bulle d'« Origine » grisée au premier rattachement. */
  BULLE_ORIGINE_PREMIER,
  /* 🔴 LOT TITRE-PROPOSITIONS-DYNAMIQUE — le titre du bloc « Propositions », en direct. */
  titreBlocPropositions,
  /* 🔴🔴 LOT RATTACHEMENT-CONVERSATION — règle C : faire choisir la portée, sans présélection. */
  DEFINITION_A_CHOISIR, MOT_CHOISIR_PORTEE, porteeADemander, positionAChoisir,
} from '../../../../lib/gestion/porteeSuivi';
import { CSS_GLISSIERE_PORTEE, GlissierePortee } from './GlissierePortee';
/* 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE — la décision de la fenêtre pour un mail en cours d'écriture (module PUR). */
import {
  decisionRattachement, fondDuProchainMail, type RattachementBrouillon,
} from '../../../../lib/gestion/rattachementBrouillon';
import {
  expediteurDuMail, indexExpediteur, MOT_EXPEDITEUR, roleExpediteur, type ExpediteurDuMail,
} from '../../../../lib/gestion/expediteurDuMail';
import type { EvenementDuMail } from '../../../../lib/gestion/evenementQualite';
import {
  dateCourteIso, lectureEvenement, listeEnCours, resumeBlocEvenement, trierParUrgence, type EvenementLu,
} from '../../../../lib/gestion/evenementRattache';
import { etapeEnMots } from '../../../../lib/gestion/etapeVignette';
import { CapsuleEvenement, CSS_CAPSULE_EVENEMENT } from './CapsuleEvenement';
import {
  corpsCreation, partiesDesBiensFiche, PHRASE_BLOC_LECTURE, type PartieCarteNeuve,
} from '../../../../lib/gestion/evenementDuMail';

/**
 * LOT BARRE-STATUT, REFAIT AU LOT FICHE-RATTACHEMENT — « VISUALISER / MODIFIER » : CE QUE DIT UN ÉCHANGE CLASSÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE DISAIT AVANT, ET POURQUOI C'ÉTAIT TROP PEU. Une ligne : « Propriétaire X — automatique ». Pour
 * rappeler le locataire, retrouver l'adresse du logement ou son numéro de lot, il fallait refermer, rouvrir
 * l'échange, déplier un message, puis ouvrir l'annuaire dans un autre onglet. On ouvrait cette fenêtre pour SAVOIR,
 * et elle ne disait presque rien.
 *
 * 🔴 DÉSORMAIS, LE BIEN D'ABORD — c'est la règle du 28/09/2026, appliquée à l'affichage. Pour CHAQUE bien de
 * l'échange : son adresse complète, son n° de lot, sa nature, son type, sa surface, son statut ; puis ses
 * PERSONNES, avec leurs téléphones et leurs e-mails, le libellé de la colonne d'où vient chaque valeur, et un
 * bouton « Copier » sur chacune.
 *
 * 🔴 L'EXPÉDITEUR EN TÊTE. Un mail du propriétaire met son bloc en premier, marqué « Expéditeur » ; un mail du
 * locataire met le sien. On ouvre cette fenêtre en ayant un mail sous les yeux, et le geste suivant est presque
 * toujours de répondre ou de rappeler celui qui a écrit.
 *
 * 🔴 RIEN N'EST RETIRÉ. « Voir le détail par mail », « Modifier », « Retirer » et « Rattacher à un bien » sont tous
 * là, au même endroit qu'avant. Cette fenêtre AJOUTE ce qu'il fallait aller chercher ailleurs.
 *
 * ⚠️ ELLE NE RÉÉCRIT AUCUN GESTE. Modifier reste ENTIÈREMENT le travail de `ModifierRattachement`, rattacher celui
 * de `MenuRattachementBien`. Réimplémenter ici aurait créé une deuxième façon de faire le même geste — donc, un
 * jour, deux comportements différents.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacés à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

type Etat =
  | { v: 'charge' }
  | { v: 'ok'; fiche: FicheRattachementFil; liens: LienAffiche[] }
  | { v: 'sans_schema' }
  | { v: 'erreur'; message: string };

/**
 * Ce que la fenêtre montre : la fiche du mail, ou son panneau de modification.
 *
 * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 2 — IL N'Y A PLUS QU'UN PANNEAU ══════════════════════════════════════
 *
 * Il y en avait DEUX (`'exception'` et `'suivi'`), et l'on passait de l'un à l'autre par deux liens qui se
 * renvoyaient la balle : « Changer plutôt la règle de suivi… » et « ← Revenir à l'exception sur ce seul mail ».
 *
 * DEMANDE D'ARNO (06/10/2026) : « Ajoute un vrai choix “Ce mail uniquement” (exception), avec le même style
 * radio et sa phrase d'explication, en PREMIÈRE position. […] Le lien “Revenir à l'exception…” est remplacé par
 * ce choix. » Les trois fenêtres deviennent donc trois boutons radio d'un même groupe — et le panneau unique
 * suit : garder deux états pour trois radios aurait fait un état qui ne veut plus rien dire.
 *
 * ⚠️ RIEN N'EST PERDU ET RIEN N'EST AJOUTÉ AU MODÈLE : les trois fenêtres existaient déjà (`ChoixSuivi`,
 * module pur), et la porte d'écriture est la même (`/api/admin/gestion/suivi`). Seul le chemin pour les
 * atteindre change.
 */
type Panneau = 'aucun' | 'modifier';

/**
 * ══ 🔴🔴 LOT FENETRE-CLASSEMENT-UNIQUE (Arno, 13/10/2026) — LA MÊME FENÊTRE, OUVERTE DEPUIS LE COMPOSEUR ══════════════
 * « Classer ce mail » du composeur ouvre CETTE fenêtre (« Bien(s) rattaché(s) à ce mail »), en mode BROUILLON.
 *
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE (Arno, 13-14/10/2026) — ET ELLE Y EST DÉSORMAIS COMPLÈTE ═══════════════════════
 * DÉCISION D'ARNO : dans le composeur (Nouveau message, Répondre, Répondre à tous, Transférer — partout), la fenêtre est
 * IDENTIQUE à celle de « Modifier le rattachement » d'un mail existant :
 *   · « Biens actuellement suivi(s) dans cette conversation (Suivi de fond) », avec case à cocher, fond vert, « déjà
 *     rattaché — décochez pour le retirer » et le détail propriétaire / locataire (`CarteBienSuivi`, la même carte) ;
 *   · propositions et moteur de recherche (le contenu du composeur, propositions d'après les destinataires comprises) ;
 *   · « Événement rattaché » avec les événements en cours du bien (`BlocEvenementLecture`, le même bloc) ;
 *   · « Portée du suivi » : la glissière à 4 positions, ses définitions et ses alertes (`BlocPortee`, le même bloc).
 * Pour un Nouveau message (pas encore de conversation) : pas de bloc « Biens suivis » ; le bien de la fiche est coché
 * dans les propositions. La position par défaut est celle qu'aurait la grande fenêtre pour ce mail
 * (`decisionRattachement`, module pur, que le serveur rejoue sur le mail capturé).
 *
 * 🔴 RIEN N'EST ÉCRIT SUR LE SERVEUR : les choix (biens, portée, biens du suivi de fond décochés) vont dans le brouillon,
 * et partent avec l'envoi. Une fois le mail parti et capturé, ils sont appliqués par `poserClassement` — la fonction de
 * « Modifier le rattachement » (voir `envoiClassementRepo`).
 * ⚠️ « Autres classements » n'apparaît pas : ses gestes (« Hors gestion, ou classer par pièce… », « Classer dans une
 * carte », « Classer sans suite ») portent sur un mail EXISTANT, et la grande fenêtre ne les a qu'ouverte depuis la boîte
 * mail. « Interne » et « Hors gestion » restent dans le bloc « Classer ce mail » du composeur, inchangés.
 * Sans `brouillon` : la fenêtre est exactement celle d'avant (« Modifier le rattachement », « Visualiser / Modifier »).
 */
export interface BrouillonRattachement {
  /** La conversation du brouillon (`null` pour un nouveau message). */
  filId: number | null;
  /** Le mail auquel on répond (`null` = le plus récent de la conversation). */
  messageId: number | null;
  /** Vrai quand le mail part DANS une conversation (Répondre, Répondre à tous, Transférer) : le bloc des biens suivis. */
  conversation: boolean;
  /** Ce que le brouillon garde déjà de la fenêtre : portée touchée et biens du suivi de fond décochés. */
  rattachement: RattachementBrouillon | null;
  /** Les biens déjà retenus par le brouillon (cibles « lot »), et ses événements (cibles « événement »). */
  biens: readonly { cle: string; libelle: string }[];
  evenements?: readonly { id: number | null; libelle: string }[];
  /** 🔴 LOT COMPOSEUR-BLOC-VERT — l'objet et les destinataires du brouillon, pour la ligne d'en-tête « Brouillon · … ». */
  objet?: string;
  destinataires?: readonly string[];
}

/** Ce que la fenêtre donne au contenu du composeur (`RattacherEnEcrivant`, posé dedans). */
export interface ContenuFenetreBrouillon {
  /** Les biens du suivi de fond (tenus par le bloc du haut) : `garde` = case cochée. `null` = aucun. */
  masquees: ReadonlyMap<string, { garde: boolean; libelle: string }> | null;
  onSelection: (cles: readonly string[]) => void;
  /** Le bloc « Événement rattaché » puis la « Portée du suivi », à poser au-dessus du bouton final. */
  pied: ReactNode;
  /** Le contenu y confie sa validation : le bouton final du cadre « Portée du suivi » la déclenche. */
  validerExterne: (valider: () => void) => void;
  /** « Sélectionner / Désélectionner tous les biens » : la fenêtre coche ou décoche toutes les cartes du bloc du haut. */
  onBasculerMasquees: (garde: boolean) => void;
  /** 🔴 LOT TITRE-PROPOSITIONS-DYNAMIQUE — le titre du bloc « Propositions » (`titreBlocPropositions`). */
  titrePropositions: string;
  /** La sélection à reprendre après « Revenir au suivi d'origine ? — Oui » (`null` = la pré-coche habituelle). */
  selectionInitiale: readonly string[] | null;
  /** Change quand le contenu doit repartir de son état d'ouverture (« Revenir au suivi d'origine »). */
  cle: string;
  /** Ce que la validation range dans le brouillon, avec les biens. */
  rattachementVoulu: () => RattachementBrouillon;
}

type ProprietesMail = Parameters<typeof RattachementsDuFilMail>[0];

export function RattachementsDuFil(props: ProprietesMail
  | { brouillon: BrouillonRattachement; onFerme: () => void; children: (c: ContenuFenetreBrouillon) => ReactNode }) {
  if ('brouillon' in props) return <FenetreRattachementBrouillon {...props} />;
  return <RattachementsDuFilMail {...props} />;
}

/** La phrase du mode brouillon : rien n'est écrit avant l'envoi, tout est appliqué après. */
export const MOT_BROUILLON_A_L_ENVOI = 'Mail en cours d’écriture : rien n’est enregistré avant l’envoi. Les choix de cette '
  + 'fenêtre seront appliqués au mail dès qu’il sera parti.';
/** Où sont les gestes sur l'événement, pour un mail pas encore envoyé (bloc « Événement rattaché » en lecture). */
export const PHRASE_EVENEMENT_COMPOSEUR = 'Pour créer un événement ou y lier ce mail, utilisez le bouton Événement du mail une fois envoyé.';

/**
 * 🔴 LOT COMPOSEUR-BLOC-VERT — LA LIGNE D'EN-TÊTE, à la place de « expéditeur · date · objet » : « Brouillon · <objet ou
 * « sans objet »> · <destinataires ou « aucun destinataire »> » (Arno, mot pour mot). PUR.
 */
export function enTeteBrouillon(objet: string | null | undefined, destinataires: readonly string[] | undefined): string {
  const o = (objet ?? '').trim();
  const d = (destinataires ?? []).filter((x) => x.trim() !== '');
  return `Brouillon · ${o === '' ? 'sans objet' : o} · ${d.length === 0 ? 'aucun destinataire' : d.join(', ')}`;
}

/** Une carte de bien suivi dont la fiche n'a pas pu être lue : le libellé seul, sans parties. */
function bienMinimal(cle: string, libelle: string): BienRattache {
  return {
    cle, lotId: null, adresseComplete: libelle, numeroLot: cle, nature: null, typeBien: null, surfaceM2: null,
    statut: 'classe', dateMail: null, occupantsAujourdhui: [], nbMails: 0, dossierDriveId: null, personnes: [],
    lienIds: [],
  } as unknown as BienRattache;
}

/** Le mode brouillon : la fenêtre de « Modifier le rattachement », pour un mail qui n'existe pas encore. */
function FenetreRattachementBrouillon({ brouillon, onFerme, children }: {
  brouillon: BrouillonRattachement; onFerme: () => void; children: (c: ContenuFenetreBrouillon) => ReactNode;
}) {
  const avecSuivis = brouillon.conversation && brouillon.filId !== null;
  /* La conversation : ses mails, ses périodes et ses exceptions (le suivi de fond), et la fiche de ses biens. */
  const [lu, setLu] = useState<{
    mails: number[]; periodes: Periode[]; exceptions: ExceptionMail[]; biens: BienRattache[];
  } | null>(avecSuivis ? null : { mails: [], periodes: [], exceptions: [], biens: [] });
  useEffect(() => {
    if (!avecSuivis) return undefined;
    let annule = false;
    void (async () => {
      const vide = { mails: [] as number[], periodes: [] as Periode[], exceptions: [] as ExceptionMail[], biens: [] as BienRattache[] };
      try {
        const q = brouillon.messageId === null ? '' : `&message=${brouillon.messageId}`;
        const [rs, rf] = await Promise.all([
          fetch(`/api/admin/gestion/suivi?fil=${brouillon.filId}`, { cache: 'no-store' }),
          fetch(`/api/admin/gestion/rattachements?fiche=${brouillon.filId}${q}`, { cache: 'no-store' }),
        ]);
        const ds = (await rs.json()) as { etat?: string; mails?: number[]; exceptions?: ExceptionMail[]; periodes?: Periode[] };
        const df = (await rf.json().catch(() => ({}))) as { etat?: string; data?: FicheRattachementFil };
        if (annule) return;
        setLu({
          mails: ds.etat === 'ok' ? ds.mails ?? [] : [],
          periodes: ds.etat === 'ok' ? ds.periodes ?? [] : [],
          exceptions: ds.etat === 'ok' ? ds.exceptions ?? [] : [],
          biens: df.etat === 'ok' && df.data !== undefined && Array.isArray(df.data.biens) ? df.data.biens : [],
        });
      } catch {
        if (!annule) setLu(vide);
      }
    })();
    return () => { annule = true; };
  }, [avecSuivis, brouillon.filId, brouillon.messageId]);

  /* ── LE SUIVI DE FOND QUE CE MAIL RECEVRA (le prochain mail de la conversation), et ses cartes. ── */
  const fond = avecSuivis && lu !== null ? fondDuProchainMail(lu.mails, lu.periodes) : null;
  const fondBiens = fond !== null && fond.sorte === 'biens' ? fond.biens : [];
  /**
   * ══ 🔴🔴 LOT COMPOSEUR-BLOC-VERT (Arno, 14/10/2026) — LE BLOC DU HAUT PORTE AUSSI LES BIENS DÉJÀ CHOISIS ═══════════════
   * Comme dans « Modifier le rattachement », où le bloc du haut montre les biens rattachés au mail À L'OUVERTURE : ici, le
   * suivi de fond (réponse) PLUS les biens que le brouillon porte déjà (le bien de la fiche pour un Nouveau message). Ils y
   * sont sur fond vert, case cochée ; jamais seulement dans « Propositions ». La liste est FIGÉE à l'ouverture, comme la
   * référence : un bien coché dans les propositions y reste coché, et rejoint le bloc à la réouverture.
   */
  const [clesBrouillon] = useState<readonly string[]>(() => brouillon.biens.map((b) => b.cle));
  const [gardesBrouillon, setGardesBrouillon] = useState<readonly string[]>(() => brouillon.biens.map((b) => b.cle));
  const clesDuBrouillonHaut = clesBrouillon.filter((c) => !fondBiens.some((b) => b.cle === c));
  const [fichesBrouillon, setFichesBrouillon] = useState<BienRattache[]>([]);
  const aLire = lu === null ? '' : clesDuBrouillonHaut.filter((c) => !lu.biens.some((b) => b.cle === c)).join(',');
  useEffect(() => {
    if (aLire === '') return undefined;
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/rattachements?biensBrouillon=${encodeURIComponent(aLire)}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; data?: BienRattache[] };
        if (vivant && d.etat === 'ok' && Array.isArray(d.data)) setFichesBrouillon(d.data);
      } catch { /* la carte garde son libellé seul */ }
    })();
    return () => { vivant = false; };
  }, [aLire]);
  const libelleBrouillon = (cle: string): string => brouillon.biens.find((b) => b.cle === cle)?.libelle ?? cle;
  const carteDe = (cle: string, libelle: string): BienRattache => lu?.biens.find((x) => x.cle === cle)
    ?? fichesBrouillon.find((x) => x.cle === cle) ?? bienMinimal(cle, libelle);
  const cartes = [
    ...fondBiens.map((b) => carteDe(b.cle, b.libelle)),
    ...clesDuBrouillonHaut.map((c) => carteDe(c, libelleBrouillon(c))),
  ];
  const gardee = (cle: string): boolean => (fondBiens.some((b) => b.cle === cle)
    ? !retires.includes(cle) : gardesBrouillon.includes(cle));
  /* R4 : le suivi de fond posé par l'automate, avec sa date — la mention de la référence. */
  const suiviAuto = avecSuivis && lu !== null && fond !== null
    ? suiviAutomatiqueDuMail([...lu.mails, -1], lu.periodes, -1) : null;
  const titresSuivis = new Map(titresDistincts(cartes.map((b) => ({
    cle: b.cle, adresse: b.adresseComplete.replace(/\b\d{5}\s+/, ''), nature: b.nature, typeBien: b.typeBien,
    immeuble: null as string | null,
  }))).map((x) => [x.cle, x.titre]));

  /* ── LES CHOIX, gardés jusqu'à « Valider » (puis dans le brouillon). ── */
  const [retires, setRetires] = useState<readonly string[]>(brouillon.rattachement?.retires ?? []);
  const [positionVoulue, setPosition] = useState<PositionPortee | null>(brouillon.rattachement?.position ?? null);
  const [selection, setSelection] = useState<readonly string[]>(brouillon.biens.map((b) => b.cle));
  const [selectionInitiale, setSelectionInitiale] = useState<readonly string[] | null>(null);
  const [cleContenu, setCleContenu] = useState(0);
  const [demandeOrigine, setDemandeOrigine] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [appel, setAppel] = useState(0);
  useEffect(() => {
    if (appel === 0) return undefined;
    const t = setTimeout(() => setAppel(0), 1400);
    return () => clearTimeout(t);
  }, [appel]);
  const [blocEvtOuvert, setBlocEvtOuvert] = useState(false);
  /** La validation du contenu (`RattacherEnEcrivant`), à jour à chaque rendu : le bouton final de la portée l'appelle. */
  const validerDuContenu = useRef<(() => void) | null>(null);

  const clesFond = new Set(fondBiens.map((b) => b.cle));
  const libelles = new Map<string, string>([...brouillon.biens.map((b) => [b.cle, b.libelle] as const)]);
  /* Les biens choisis : ceux du bloc du haut restés cochés (hors suivi de fond), puis ceux des propositions et de la
     recherche. Les cartes du haut sont tenues ici, pas par les propositions. */
  const choisis = [...new Set([
    ...clesDuBrouillonHaut.filter((c) => gardesBrouillon.includes(c)),
    ...selection.filter((c) => !clesFond.has(c) && !clesDuBrouillonHaut.includes(c)),
  ])].map((cle) => ({ cle, libelle: libelles.get(cle) ?? cle }));
  /* 🔴 LA DÉCISION DE LA GRANDE FENÊTRE, pour ce mail (module pur, rejoué par le serveur sur le mail capturé). */
  const decision = decisionRattachement({
    fond: avecSuivis ? fond : null, biens: choisis, rattachement: { position: positionVoulue, retires: [...retires] },
  });
  const { premier, modification, position } = decision;
  /* Plus aucune modification : la position voulue repart de ① (règle de la grande fenêtre). */
  if (!premier && !modification && positionVoulue !== null) setPosition(null);

  const choisirPosition = (p: PositionPortee): void => {
    if (p === 'origine' && premier) return;
    if (p === 'origine' && modification) { setDemandeOrigine(true); return; }
    setPosition(p);
    setConfirme(false);
  };
  const revenirALOrigine = (): void => {
    setRetires([]);
    setGardesBrouillon(clesBrouillon);
    setSelection([]);
    setSelectionInitiale([]);
    setCleContenu((n) => n + 1);
    setDemandeOrigine(false);
    setConfirme(false);
    setPosition('origine');
  };
  /**
   * 🔴 LE BOUTON DE LA GRANDE FENÊTRE (`etatBoutonPortee`), avec UNE nuance qui protège un geste existant du composeur :
   * décocher TOUS les biens qu'un brouillon portait déjà (le bien ajouté d'office d'un client destinataire, par exemple)
   * puis valider les retire du brouillon — « Valider — aucun bien » d'avant. Ce n'est plus un premier rattachement à
   * faire, c'est une modification : le bouton prend donc le mot et l'état de la grande fenêtre pour une modification
   * (« Valider la modification du suivi », actif). Rien n'est écrit pour autant avant l'envoi.
   */
  const retraitDeTout = premier && decision.voulus.length === 0 && brouillon.biens.length > 0;
  const bouton = retraitDeTout
    ? etatBoutonPortee({ premier: false, position, modification: true, nbCoches: 0 })
    : etatBoutonPortee({ premier, position, modification, nbCoches: decision.voulus.length });
  const appelerLesBiens = (): void => {
    setAppel(Date.now());
    const bloc = document.querySelector<HTMLElement>('.rdf--brouillon .rdf-suivis, .rdf--brouillon .rec-carte');
    if (bloc !== null && typeof bloc.scrollIntoView === 'function') bloc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  /* ── LES ÉVÉNEMENTS EN COURS DES BIENS QUI SERONT RATTACHÉS (lecture seule). ── */
  const clesVoulues = decision.voulus.map((b) => b.cle).join(',');
  const [duBien, setDuBien] = useState<EvenementLu[] | null>(null);
  useEffect(() => {
    if (clesVoulues === '') { setDuBien([]); return undefined; }
    let vivant = true;
    setDuBien(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/evenements/des-biens?biens=${encodeURIComponent(clesVoulues)}`, { cache: 'no-store' });
        const d = (await res.json()) as { etat?: string; duBien?: EvenementLu[] };
        if (vivant) setDuBien(d.etat === 'ok' && Array.isArray(d.duBien) ? d.duBien : []);
      } catch { if (vivant) setDuBien([]); }
    })();
    return () => { vivant = false; };
  }, [clesVoulues]);
  const rattaches: EvenementLu[] = (brouillon.evenements ?? []).filter((e) => e.id !== null)
    .map((e) => ({ id: e.id as number, reference: e.libelle, objet: '', ouvert: true }));

  const masquees = cartes.length === 0 ? null
    : new Map(cartes.map((b) => [b.cle, {
      garde: gardee(b.cle),
      libelle: fondBiens.find((x) => x.cle === b.cle)?.libelle ?? libelleBrouillon(b.cle),
    }] as const));
  /** « Sélectionner / Désélectionner tous les biens » : toutes les cases du bloc du haut, comme la référence. */
  const basculerHaut = (garde: boolean): void => {
    setRetires(garde ? [] : fondBiens.map((b) => b.cle));
    setGardesBrouillon(garde ? clesDuBrouillonHaut : []);
  };
  const mailsPourConfirmation = [...(lu?.mails ?? []), -1];

  const pied = (
    <div className="rdf-pied-panneau">
      <BlocEvenementLecture lus={{ rattaches, duBien: duBien ?? [] }} evenement={null} charge={duBien === null}
        renvoi={PHRASE_EVENEMENT_COMPOSEUR} ouvert={blocEvtOuvert} onOuvert={setBlocEvtOuvert} />
      {lu !== null && (
        <BlocPortee position={position} modification={modification} premier={premier}
          nbCoches={decision.voulus.length}
          demandeOrigine={demandeOrigine} onChoisir={choisirPosition}
          onOuiOrigine={revenirALOrigine} onNonOrigine={() => setDemandeOrigine(false)}
          confirmation={position === 'conversation' && modification
            ? motConfirmationConversation({ mails: mailsPourConfirmation, exceptions: lu.exceptions, messageId: -1, periodes: lu.periodes }) : null}
          confirme={confirme} onConfirme={() => setConfirme((v) => !v)}
          bouton={bouton} desactive={modification && position === 'conversation' && !confirme}
          onValider={() => { if (bouton.inactif) appelerLesBiens(); else validerDuContenu.current?.(); }} />
      )}
    </div>
  );

  return (
    <div className="mrt-voile rdf-brouillon-voile" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <style>{CSS_RATTACHEMENTS_FIL}</style>
      <style>{CSS_BLOC_EVENEMENT}</style>
      <style>{CSS_LISTE_BIENS}</style>
      <style>{CSS_INFO_BIEN}</style>
      <style>{CSS_MENU_RATTACHEMENT}</style>
      <div className={`mrt rdf rdf--ponctuel rdf--brouillon${appel !== 0 ? ' rdf--appel' : ''}`} role="dialog" aria-modal="true"
        aria-labelledby="rdf-titre" data-mode="brouillon"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>
        <button type="button" className="rdf-croix" aria-label="Fermer sans rien changer"
          title="Fermer sans rien changer" onClick={onFerme}>×</button>
        <h2 className="mrt-titre" id="rdf-titre">{TITRE_BIENS_DU_MAIL}</h2>
        {/* 🔴 LOT COMPOSEUR-BLOC-VERT — à la place de « expéditeur · date · objet » de la référence. */}
        <p className="rdf-entete" data-entete="brouillon">{enTeteBrouillon(brouillon.objet, brouillon.destinataires)}</p>
        <p className="rdf-detail rdf-brouillon-mot">{MOT_BROUILLON_A_L_ENVOI}</p>
        {/* 🔴 LOT COMPOSEUR-BLOC-VERT — LE BLOC DU HAUT, DANS TOUS LES MODES : « Biens actuellement suivi(s)… (Suivi de
            fond) » pour une réponse, « Bien(s) rattaché(s) à ce mail » pour un Nouveau message. Même carte, même fond
            vert, même case que la référence. */}
        <section className="rdf-suivis" aria-labelledby="rdf-suivis-titre" data-bloc="suivis"
          data-sorte={avecSuivis ? 'suivi-de-fond' : 'nouveau'}>
          <h3 className="rdf-suivis-titre" id="rdf-suivis-titre">{avecSuivis ? TITRE_BIENS_SUIVIS : TITRE_BIENS_DU_MAIL}</h3>
          {suiviAuto !== null && (
            <p className="rdf-detail rdf-suivi-auto">
              {motSuiviAutomatique(suiviAuto === '' ? null : dateHeureComplete(suiviAuto))}
            </p>
          )}
          {lu === null && <p className="gst-info" role="status">Lecture des biens suivis…</p>}
          {lu !== null && cartes.length === 0 && (
            <p className="rdf-detail">{avecSuivis ? AUCUN_BIEN_SUIVI : AUCUN_BIEN_DU_MAIL}</p>
          )}
          {cartes.length > 0 && (
            <ul className="rdf-suivis-liste">
              {cartes.map((b) => (
                <CarteBienSuivi key={b.cle} bien={b} titre={titresSuivis.get(b.cle) ?? b.adresseComplete}
                  garde={gardee(b.cle)}
                  onGarder={() => (fondBiens.some((x) => x.cle === b.cle)
                    ? setRetires((avant) => (avant.includes(b.cle) ? avant.filter((c) => c !== b.cle) : [...avant, b.cle]))
                    : setGardesBrouillon((avant) => (avant.includes(b.cle)
                      ? avant.filter((c) => c !== b.cle) : [...avant, b.cle])))}
                  liens={[]} onModifier={() => {}} />
              ))}
            </ul>
          )}
        </section>
        {children({
          masquees,
          onBasculerMasquees: basculerHaut,
          /* 🔴 LOT TITRE-PROPOSITIONS-DYNAMIQUE — la même règle que « Modifier le rattachement » : un bien coché hors du
             bloc du haut (propositions ou recherche) est un bien ajouté. */
          titrePropositions: titreBlocPropositions(selection.some((c) => !cartes.some((b) => b.cle === c)), position),
          onSelection: (cles) => setSelection(cles),
          pied,
          validerExterne: (v) => { validerDuContenu.current = v; },
          selectionInitiale,
          cle: `contenu-${cleContenu}`,
          rattachementVoulu: () => ({ position: positionVoulue, retires: [...retires] }),
        })}
        {/* 🔴 LOT COMPOSEUR-BLOC-VERT — le pied de la référence : « Fermer », qui ferme sans rien changer (comme la croix). */}
        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

function RattachementsDuFilMail({
  filId, titre, messageId = null, onFerme, onGeste, onLeveeFaite,
  ouvreLaModification = false, actionsDePied = [], ponctuel = false,
  aClasser = false, ecrireParLAppelant, renvoiEvenement = PHRASE_BLOC_LECTURE, expediteurInconnu,
  erreurDeLAppelant = null, occupeParLAppelant = false,
}: {
  /**
   * 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — quand l'appelant écrit (`ecrireParLAppelant`), SON refus et SON attente
   * s'affichent ICI, dans la fenêtre restée ouverte : écrits sous elle, ils seraient cachés par son voile.
   */
  erreurDeLAppelant?: string | null;
  occupeParLAppelant?: boolean;
  /**
   * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — LA FENÊTRE COMMUNE, OUVERTE AUSSI PAR « Rattacher à un logement » ═══
   *
   * DÉCISION D'ARNO (12/10/2026) : « les fenêtres qui ont la même fonction doivent être IDENTIQUES ». La fenêtre de
   * « Modifier le rattachement » (porte ponctuelle) remplace « Rattacher ce mail à… ». Trois propriétés suffisent :
   *
   *   · `aClasser` — le mail est « À classer » : c'est un PREMIER classement (avec un mail sans bien ni suivi, voir
   *     `premier`). « Origine » y veut dire « laisser à classer », la glissière part sur « Ce mail + futurs échanges ».
   *   · `ecrireParLAppelant` — la validation est CONFIÉE à l'appelant, avec les biens cochés et la portée : l'encart du
   *     mail y garde son chemin complet (étape « Classer ce nouveau contact », marque « Interne », chemin sans
   *     migration 290). Rien n'est recopié : c'est SON code qui écrit, comme avant. Absent ⇒ la fenêtre écrit elle-même.
   *   · `renvoiEvenement` — la phrase du bloc « Événement rattaché » dit OÙ sont les gestes sur l'événement, et ils ne
   *     sont pas au même endroit selon l'écran (bouton « Événement » de l'historique, en-tête du mail ailleurs).
   */
  aClasser?: boolean;
  ecrireParLAppelant?: (
    voulus: readonly { cle: string; libelle: string }[], choix: ChoixSuivi, arbitre: boolean,
    /** 🔴 LOT GESTION-EXPEDITEUR-INCONNU — l'interrupteur « Affecter l'expéditeur inconnu » ; `undefined` s'il n'est pas affiché. */
    affecter?: boolean,
  ) => void;
  /**
   * 🔴🔴 LOT GESTION-EXPEDITEUR-INCONNU (Arno, 16/10/2026) — L'EXPÉDITEUR EST-IL INCONNU DES FICHES DES BIENS COCHÉS ? Fourni
   * par l'appelant qui écrit (la MÊME question que celle qui ouvre « Classer ce nouveau contact ») ; `null` = on ne sait
   * pas (lecture en échec) — l'interrupteur ne s'affiche pas, et la règle d'avant s'applique.
   */
  expediteurInconnu?: (cles: readonly string[]) => Promise<boolean | null>;
  renvoiEvenement?: string;
  filId: number;
  /** L'objet de l'échange, connu de la liste. La fiche en rend un aussi ; celui-ci sert de repli. */
  titre?: string | null;
  /**
   * ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 2 — LE MAIL DONT CETTE FENÊTRE PARLE ═════════════
   *
   * RÈGLE D'ARNO (03/10/2026) : « une SEULE fenêtre, quel que soit le point d'entrée. Elle porte sur UN mail
   * précis : le mail cliqué, ou depuis une ligne de liste le mail affiché sur la ligne (le plus récent de
   * l'échange). »
   *
   * ⚠️ `null` NE VEUT PLUS DIRE « LA FENÊTRE DE L'ÉCHANGE », il veut dire « le mail de la ligne » — c'est-à-dire
   * le plus récent, que le serveur désigne lui-même (`fiche.enTete`). C'est tout le lot : il n'y a plus deux
   * fenêtres à corriger séparément, il n'y en a plus qu'une.
   */
  messageId?: number | null;
  onFerme: () => void;
  onGeste?: (message: string) => void;
  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — QUI PORTE L'« ANNULER » DE LA LEVÉE ═══════════════════════
   *
   * Appelé quand un rattachement vient de LEVER la marque « interne » d'un ou plusieurs mails. L'appelant reçoit
   * de quoi tout défaire : les mails à remarquer, et les liens à retirer.
   *
   * ⚠️ POURQUOI CETTE PROPRIÉTÉ EXISTE, et c'est un défaut vu à l'écran : cette fenêtre SE FERME à chaque geste
   * (`Conversation` la ferme dans `onGeste`). Un « Annuler » rendu dedans disparaissait avec elle, dans la même
   * image. L'appelant qui a un bloc « Classer ce mail » sous le mail le lui confie ; celui qui n'en a pas ne
   * passe pas cette propriété, et la fenêtre garde son panneau local.
   */
  onLeveeFaite?: (fait: SortieLevee) => void;
  /**
   * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 1 — LA FENÊTRE S'OUVRE DÉJÀ SUR LA MODIFICATION ═══════════════════
   *
   * DEMANDE D'ARNO (06/10/2026) : « Sur un mail “À classer”, le lien “Classer” ouvre la fenêtre “Bien(s)
   * rattaché(s) à ce mail” (même composant, aucune copie). Comme aucun bien n'est rattaché, la zone du haut
   * affiche les PROPOSITIONS de rattachement […], puis le moteur “Chercher un autre bien” en bas, puis les
   * options de suivi, puis “Valider le suivi”. »
   *
   * 🔴 C'EST EXACTEMENT CE QUE CE PANNEAU MONTRE DÉJÀ, et c'est pour cela qu'il n'y a pas une ligne de rendu
   * nouvelle : le menu réemployé affiche les propositions de l'automatisation avec leur motif, puis
   * « Chercher un autre bien », puis le pied (options de suivi, événement, bilan). Ce qui manquait est qu'on y
   * arrive sans un clic de plus — un mail qu'on vient CLASSER n'a rien à « visualiser » d'abord.
   *
   * ⚠️ `false`/absent ⇒ LA FENÊTRE EST EXACTEMENT CELLE D'AVANT : elle s'ouvre sur la fiche, et le grand bouton
   * « Modifier les biens rattachés à ce mail » reste la porte. On ne change pas « Visualiser / Modifier ».
   */
  ouvreLaModification?: boolean;
  /**
   * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 1 — LES GESTES QUI VIENNENT DU BLOC EN LIGNE SUPPRIMÉ ══════════════
   *
   * ACCORD D'ARNO : « le bloc en ligne “Classer dans une carte · Créer un événement · Classer sans suite ·
   * Annuler” est SUPPRIMÉ. Ses fonctions passent dans la fenêtre, rien n'est perdu : “Classer sans suite” et
   * “Classer dans une carte” deviennent deux actions secondaires en pied de fenêtre, même effet qu'aujourd'hui,
   * par le même code. » (« Créer un événement », lui, est entré dans la ligne « Événement rattaché » au point 3.)
   *
   * 🔴 LA FENÊTRE NE SAIT PAS CE QU'ELLES FONT, ET C'EST VOULU : elle reçoit un libellé et un geste. « Même
   * effet qu'aujourd'hui, par le même code » n'est tenable qu'ainsi — c'est l'appelant qui appelle les routes
   * qu'il appelait déjà (`/sans-suite`, le panneau des cartes), sans qu'une ligne de leur logique soit recopiée.
   *
   * ⚠️ VIDE/ABSENT ⇒ AUCUN PIED SUPPLÉMENTAIRE : la fenêtre ouverte depuis une ligne de liste ou depuis
   * « Visualiser / Modifier » reste celle d'avant.
   */
  actionsDePied?: readonly { cle: string; libelle: string; onChoisir: () => void }[];
  /**
   * ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — LE MODE PONCTUEL ═══════════════════════════════════════════════
   *
   * DEMANDE D'ARNO (06/10/2026) : la fenêtre, avec TOUTES ses fonctions actuelles (biens rattachés, cartes,
   * moteur « Chercher un autre bien », événement), « MAIS en mode PONCTUEL : aucune option de suivi n'est
   * affichée ni proposée […] Un bandeau clair en haut […] Le bouton de validation s'appelle “Valider pour ce
   * mail uniquement”. »
   *
   * 🔴🔴 CE N'EST PAS UN SECOND CHEMIN D'ÉCRITURE. C'est la MÊME route (`POST /api/admin/gestion/suivi`) et le
   * MÊME `choix: 'mail'` — celui que « Sortir du suivi » emploie déjà. Ce qui change est ce qu'on MONTRE : on ne
   * propose plus de portée, parce qu'il n'y en a plus qu'une, et on le dit en toutes lettres.
   *
   * 🔴 « AUCUNE PÉRIODE CRÉÉE, MODIFIÉE OU SUPPRIMÉE » EST VRAI PAR CONSTRUCTION : `choix: 'mail'` écrit une
   * EXCEPTION, et une exception ne déplace aucune période — c'est sa définition. Les deux fenêtres qui touchent
   * aux périodes ne sont pas offertes, donc pas choisissables par mégarde.
   *
   * ⚠️ `false`/absent ⇒ LA FENÊTRE EST EXACTEMENT CELLE D'AVANT, avec ses trois fenêtres de suivi. « Visualiser
   * / Modifier » et « Classer » ne changent pas d'un pixel.
   */
  ponctuel?: boolean;
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [modifie, setModifie] = useState<LienAffiche | null>(null);
  /**
   * 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 1 — ouverte pour CLASSER, elle arrive sur le panneau de modification.
   *
   * ⚠️ `selection` RESTE `null` À L'ARRIVÉE, et c'est juste : `null` veut dire « l'état enregistré du mail »,
   * et sur un mail à classer cet état est vide. Y poser une liste d'avance aurait été précocher — ce qu'Arno
   * interdit explicitement (« aucune cochée d'office »).
   */
  const [panneau, setPanneau] = useState<Panneau>(
    /* 🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — « Modifier le rattachement » est un geste de MODIFICATION : la
       fenêtre s'ouvre donc sur le panneau, comme pour « Classer ». */
    ouvreLaModification || ponctuel ? 'modifier' : 'aucun');
  /**
   * Le choix du bloc « Suivi dans la conversation ». LES TROIS fenêtres depuis le lot CLASSER-PAR-LA-MODALE.
   *
   * ══ 🔴🔴 POURQUOI LE DÉFAUT EST `'mail'`, ET NON `SUIVI_DEFAUT` ═══════════════════════════════════════════
   *
   * Arno : « Le choix par défaut reste celui d'aujourd'hui. » Aujourd'hui, ouvrir ce panneau puis valider pose
   * une EXCEPTION sur ce seul mail — c'était l'état d'arrivée (`panneau === 'exception'`), et l'autre règle se
   * demandait par un lien. Cocher `'suite'` d'avance aurait donc CHANGÉ ce que « Valider » fait sans qu'on
   * l'ait demandé, et changé vers le geste le plus large des deux : une période reclasse les mails à venir.
   *
   * ⚠️ `SUIVI_DEFAUT` (`'suite'`) RESTE LE DÉFAUT DES AUTRES FENÊTRES, et il n'est pas touché : là-bas, rien
   * n'arrive « déjà sur l'exception ».
   *
   * ⚠️ C'EST L'OUVERTURE DU PANNEAU QUI LE REPOSE À `'mail'` (voir le bouton plus bas), et non cette valeur
   * initiale : on peut ouvrir, choisir une autre fenêtre, fermer, et rouvrir. Les deux sont écrites pareil pour
   * qu'elles ne puissent pas se contredire.
   */
  const [choixSuivi, setChoixSuivi] = useState<ChoixSuivi>('mail');
  const [confirme, setConfirme] = useState(false);
  /** La sélection en cours dans le panneau, remontée par le menu : elle écrit la phrase et nourrit l'alerte. */
  const [selection, setSelection] = useState<readonly string[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LA QUESTION, PUIS LA SORTIE ══════════════════════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « Avant d'appliquer : “Ce mail est marqué Interne : rattacher ce bien retirera
   * la marque Interne” avec Confirmer / Annuler. Après : “Annuler” quelques secondes, qui remet exactement l'état
   * d'avant. »
   *
   * 🔴 `demandeLevee` GARDE LES ARGUMENTS DU GESTE, PAS UNE FONCTION — même raison qu'ailleurs : le geste est
   * différé entre la question et la réponse, et une fermeture aurait figé des états qui continuent de changer.
   */
  const [demandeLevee, setDemandeLevee] = useState<{
    message: string; mails: number[];
    geste: { voulus: readonly { cle: string; libelle: string }[]; choix: ChoixSuivi };
  } | null>(null);
  const [leveeFaite, setLeveeFaite] = useState<SortieLevee | null>(null);

  /**
   * ══ 🔴🔴 POURQUOI L'« ANNULER » EST REMONTÉ AU PARENT QUAND IL PEUT LE PRENDRE ═══════════════════════════════
   *
   * ⚠️ DÉFAUT MESURÉ À L'ÉCRAN le 04/10/2026, et pas déduit du code : cette fenêtre SE FERME à chaque geste —
   * `Conversation` fait `onGeste={() => setVoirRattachements(false)}`, et c'est son comportement depuis le lot
   * BARRE-STATUT. Un « Annuler » rendu ICI disparaissait donc avec elle, dans la même image : la marque était
   * levée, et plus aucune sortie n'était offerte.
   *
   * 🔴 LA SORTIE EST DONC CONFIÉE AU BLOC « Classer ce mail » (`EncartRattachement`), qui reste sous le mail et
   * qui porte DÉJÀ le même panneau pour le sens inverse. Un seul dessin, un seul comportement, deux portes.
   *
   * ⚠️ ET LE PANNEAU LOCAL RESTE, pour l'appelant qui ne reprend pas la main (`BoiteMail` ouvre la même fenêtre
   * sans bloc en dessous). Sans lui, cette porte-là n'aurait aucune sortie du tout.
   */

  /** L'« Annuler » ne reste offert que quelques secondes : passé ce délai, le geste est acquis. */
  useEffect(() => {
    if (leveeFaite === null) return undefined;
    const t = setTimeout(() => setLeveeFaite(null), SECONDES_ANNULER_LEVEE * 1000);
    return () => clearTimeout(t);
  }, [leveeFaite]);
  /** Les périodes et exceptions vivantes de l'échange — pour l'alerte de « Toute la conversation ». */
  const [suivi, setSuivi] = useState<
    { mails: number[]; exceptions: ExceptionMail[]; periodes: Periode[]; rattachee?: boolean; interneEchange?: boolean } | null>(null);
  /**
   * 🔴 LES DOSSIERS DRIVE DES BIENS, par clé de lot. Lus À PART, et APRÈS le reste.
   *
   * ⚠️ C'EST UN CONFORT, PAS UNE DONNÉE DE LA FICHE : la descente jusqu'au sous-dossier du lot demande un appel à
   * Google, qui peut être lent ou muet. L'attendre pour afficher l'adresse et le téléphone du locataire ferait
   * payer à tout le monde le prix d'un lien que l'on ne clique pas toujours.
   */
  const [dossiers, setDossiers] = useState<Record<string, string>>({});
  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — LE DRIVE DU BIEN, DEMANDÉ DEPUIS UNE CARTE ══════════
   *
   * `null` = la fenêtre est celle qu'on connaît. Non nul = on a cliqué « Ouvrir le Drive du bien », et c'est la
   * fenêtre Drive qui prend la place — exactement comme `modifie` plus bas, et pour la même raison : deux boîtes
   * de dialogue empilées sont injouables au clavier, et un lecteur d'écran ne sait plus laquelle est active.
   */
  const [driveDuBien, setDriveDuBien] = useState<{ id: string; nom: string } | null>(null);
  /**
   * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — OUVRIR UN ÉVÉNEMENT DEPUIS LA FENÊTRE ══════════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * DEMANDE D'ARNO (06/10/2026) : « Dans la ligne “ÉVÉNEMENT RATTACHÉ” de la fenêtre : “Lier à un événement”
   * (liste des événements du ou des biens cochés) et “Créer un événement”. […] L'événement créé est lié au mail
   * et au(x) bien(s) choisis au moment de “Valider le suivi”. “Annuler” ne crée rien. »
   *
   * 🔴 C'EST UNE **INTENTION**, PAS UN GESTE, et c'est tout le point. La carte neuve doit être rattachée aux
   * biens qu'on vient de cocher, avec leur propriétaire et leur locataire — or ces biens ne sont pas encore
   * écrits quand on remplit le formulaire, et leurs personnes ne sont donc pas connues. Créer tout de suite
   * aurait ouvert une carte sans bien, ou avec les biens d'AVANT la modification.
   *
   * 🔴 ELLE S'ÉCRIT PAR LES MÊMES ROUTES QUE LE BLOC « Événement rattaché » de l'encart
   * (`/messages/<id>/affectation`), avec le même corps. Aucune porte d'écriture nouvelle, aucun geste réécrit.
   *
   * ⚠️ `null` ⇒ RIEN À ÉCRIRE : « Annuler » la remet à `null`, et « Valider le suivi » n'écrit alors que les
   * biens, exactement comme avant ce lot.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const [evtVoulu, setEvtVoulu] = useState<
    { sorte: 'lier'; evenementId: number; mot: string; capsule?: { reference: string; objet: string } }
    | {
      sorte: 'creer'; objet: string; categorie: string; urgence: string;
      /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — les jours civils retenus, et la note. */
      ouvertLe: string | null; closLe: string | null; note: string | null;
      /* 🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — le choix modifié des personnes concernées (sinon `null`). */
      concernes?: ChoixConcernes | null;
    }
    | null
  >(null);
  /** Le panneau ouvert sous la ligne « Événement rattaché » : la recherche, le formulaire, ou rien. */
  const [panneauEvt, setPanneauEvt] = useState<'aucun' | 'lier' | 'creer'>('aucun');
  /** Les champs du formulaire partagé (`ChampsEvenement`). Rien n'est écrit tant qu'on n'a pas validé. */
  const [evtTitre, setEvtTitre] = useState('');
  /** 🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — « Locataire(s) concerné(s) » (`null` : le choix par défaut). */
  const [evtConcernes, setEvtConcernes] = useState<ChoixConcernes | null>(null);
  const [evtCategorie, setEvtCategorie] = useState('');
  const [evtUrgence, setEvtUrgence] = useState('');
  /** 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — les deux dates et la note de la carte neuve (accord d'Arno). */
  const [evtOuvertLe, setEvtOuvertLe] = useState('');
  const [evtClosLe, setEvtClosLe] = useState('');
  const [evtNote, setEvtNote] = useState('');
  /**
   * L'événement DÉJÀ posé sur ce mail, et si la migration 268 est là. Lus par la route que le bloc de l'encart
   * emploie déjà — une seule question, une seule réponse.
   */
  const [evtDuMail, setEvtDuMail] = useState<{
    evenement: EvenementDuMail | null; qualifie: boolean;
    /* 🔴 LOT EVENEMENT-RATTACHE-COHERENT — les deux listes que la LIGNE reçoit (rattachés, et ceux du bien). */
    lus: { rattaches: EvenementLu[]; duBien: EvenementLu[] } | null;
  } | null>(null);
  /**
   * 🔴 LES ÉVÉNEMENTS DES BIENS COCHÉS, par la route qui répond DÉJÀ à cette question
   * (`/historique/evenements?cible=lot-…`). `null` = pas encore lu, ou aucun bien coché ⇒ aucune restriction.
   */
  const [evtsDesBiens, setEvtsDesBiens] = useState<number[] | null>(null);
  /** Les noms des biens cochés, tels que le menu les connaît — voir `libellesDuMail` plus bas. */
  const [libellesCoches, setLibellesCoches] = useState<Record<string, string>>({});
  /** Un tour de compteur relit l'événement du mail — après une écriture, et seulement là. */
  const [rafraichirEvt, setRafraichirEvt] = useState(0);
  /** 🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET — le bloc « Événement rattaché » : replié par défaut. */
  const [blocEvtOuvert, setBlocEvtOuvert] = useState(false);
  /**
   * ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — L'« ANNULER » DE LA MODIFICATION PONCTUELLE ════════════════════
   *
   * DEMANDE D'ARNO : « “Annuler” quelques secondes après, qui rétablit exactement l'état d'avant. »
   *
   * 🔴 IL N'Y A RIEN À ÉCRIRE POUR DÉFAIRE, et c'est tout l'intérêt : `defaireLaDecisionDeSuivi` retire ce que
   * le geste a créé, rouvre ce qu'il a fermé, puis REPROJETTE — les liens reviennent d'eux-mêmes, parce que la
   * projection est un diff vers la décision vivante. Aucun second chemin de restauration, et c'est ce qui rend
   * « exactement l'état d'avant » vérifiable plutôt que promis.
   *
   * ⚠️ IL VIT DANS CETTE FENÊTRE, ET IL LE PEUT : contrairement à « Visualiser / Modifier », la porte ponctuelle
   * ne referme PAS la fenêtre après le geste (l'appelant ne passe pas `onGeste` de fermeture). La sortie reste
   * donc visible là où on vient d'agir.
   *
   * ⚠️ `null` ⇒ RIEN À DÉFAIRE : aucune trace, ou le délai est passé. Le geste est alors acquis, comme partout.
   */
  const [ponctuelFait, setPonctuelFait] = useState<TraceSuivi | null>(null);
  /**
   * 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA PORTÉE CHOISIE SUR LA GLISSIÈRE (porte ponctuelle), la question
   * du retour à « Origine », la clé qui remet le menu à son état d'ouverture, et la portée du dernier geste (pour dire
   * ce qui vient d'être fait au-dessus de l'« Annuler »).
   */
  /* 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — `null` = personne n'a touché la glissière (le DÉFAUT, voir `positionAffichee`). */
  const [positionVoulue, setPosition] = useState<PositionPortee | null>(null);
  /* 🔴🔴 LOT GESTION-EXPEDITEUR-INCONNU — l'interrupteur, DÉSACTIVÉ à chaque ouverture (Arno), et l'expéditeur inconnu ? */
  const [affecter, setAffecter] = useState(false);
  const [inconnu, setInconnu] = useState(false);
  /* 🔴 LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — l'appel vers les blocs de biens (bouton blanc), quelques instants.
     ⚠️ DÉCLARÉ ICI, AVEC LES AUTRES ÉTATS : plus bas, la fenêtre Drive rend avant, et l'ordre des hooks casserait. */
  const [appel, setAppel] = useState(0);
  useEffect(() => {
    if (appel === 0) return undefined;
    const t = setTimeout(() => setAppel(0), 1400);
    return () => clearTimeout(t);
  }, [appel]);
  const [demandeOrigine, setDemandeOrigine] = useState(false);
  const [cleMenu, setCleMenu] = useState(0);
  const [choixFait, setChoixFait] = useState<ChoixSuivi>('mail');
  useEffect(() => {
    if (ponctuelFait === null) return undefined;
    const t = setTimeout(() => setPonctuelFait(null), SECONDES_ANNULER_SORTIE * 1000);
    return () => clearTimeout(t);
  }, [ponctuelFait]);

  /**
   * 🔴🔴 ELLE REND LA FICHE QU'ELLE VIENT DE LIRE (lot CLASSER-PAR-LA-MODALE, point 3), et `null` si la lecture
   * a échoué. Elle pose aussi l'état, comme avant : c'est le MÊME appel, et il n'y en a pas deux.
   *
   * ⚠️ POURQUOI UNE VALEUR DE RETOUR. L'événement créé doit être rattaché « au mail et au(x) bien(s) choisis »,
   * avec leur propriétaire et leur locataire. Ces personnes ne sont connues qu'une fois les biens ÉCRITS — et à
   * cet instant l'état de React n'est pas encore à jour. Lire la réponse plutôt que l'état évite d'attendre un
   * rendu pour écrire, c'est-à-dire d'écrire d'après une liste d'avant.
   */
  const charger = useCallback(async (): Promise<FicheRattachementFil | null> => {
    setEtat({ v: 'charge' });
    try {
      // LES DEUX ENSEMBLE : la fiche (les biens et leurs parties) et les liens bruts (le détail par mail et les
      //   gestes). Les enchaîner doublerait l'attente pour un résultat identique.
      /* 🔴 `&message=` DIT DE QUEL MAIL ON PARLE. Absent, le serveur prend le plus récent — celui de la ligne. */
      const q = messageId === null ? '' : `&message=${messageId}`;
      const [rf, rl] = await Promise.all([
        fetch(`/api/admin/gestion/rattachements?fiche=${filId}${q}`, { cache: 'no-store' }),
        fetch(`/api/admin/gestion/rattachements?fil=${filId}`, { cache: 'no-store' }),
      ]);
      const df = (await rf.json()) as { etat?: string; data?: FicheRattachementFil; message?: string };
      const dl = (await rl.json()) as { etat?: string; data?: LienAffiche[] };
      if (df.etat === 'sans_schema' || dl.etat === 'sans_schema') { setEtat({ v: 'sans_schema' }); return null; }
      /**
       * ⚠️ ON VÉRIFIE LA FORME, PAS SEULEMENT L'ÉTAT. Une réponse « ok » dont le corps n'a pas la forme attendue
       * (un serveur plus ancien, un onglet resté ouvert pendant un déploiement) doit donner un message lisible,
       * jamais un écran blanc : `fiche.biens.length` sur un tableau absent casse tout le rendu.
       */
      const f = df.data;
      if (df.etat !== 'ok' || !f || !Array.isArray(f.biens)) {
        setEtat({ v: 'erreur', message: df.message ?? 'Lecture impossible : réponse inattendue du serveur.' });
        return null;
      }
      setEtat({ v: 'ok', fiche: f, liens: dl.etat === 'ok' && Array.isArray(dl.data) ? dl.data : [] });
      return f;
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des rattachements n’a pas abouti.' });
      return null;
    }
  }, [filId, messageId]);

  useEffect(() => { void charger(); }, [charger]);


  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — ELLE REFLÈTE « SORTIR DU SUIVI » ═════════════════════════════════
   *
   * DEMANDE D'ARNO : « La fenêtre “Visualiser / Modifier” du mail reflète le changement. »
   *
   * 🔴 ELLE PEUT ÊTRE OUVERTE PENDANT LE GESTE : on sort un mail du suivi depuis l'historique d'un bien, et cette
   * fenêtre — ouverte sur le même mail depuis la liste ou la conversation — continuerait d'afficher le bien
   * retiré. Elle relit donc ce que le serveur sait, par la MÊME fonction que son premier chargement.
   *
   * ⚠️ ON NE RELIT QUE SI C'EST DE NOTRE MAIL (ou de notre échange) QU'IL S'AGIT : d'autres fenêtres peuvent être
   * montées ailleurs, et les faire toutes relire à chaque geste serait du bruit à chaque clic.
   */
  useEffect(() => ecouterClassement((sig) => {
    const nous = sig.filId === filId || (messageId !== null && sig.messageId === messageId);
    if (nous) void charger();
  }), [charger, filId, messageId]);

  /**
   * ══ 🔴 LE SUIVI DE LA CONVERSATION — POUR L'ALERTE, ET POUR ELLE SEULE ═══════════════════════════════════════
   *
   * L'alerte de « Toute la conversation » annonce COMBIEN de mails seront reclassés et combien d'exceptions
   * survivent : sans les mails ni les exceptions, elle ne peut pas être composée, et une alerte approximative ne
   * se lit plus (voir `alerteTouteLaConversation`).
   *
   * ⚠️ SON ABSENCE N'EMPÊCHE RIEN : sans migration 290, la route répond « sans_schema », le bloc de suivi ne
   * s'ouvre pas, et la fenêtre reste exactement ce qu'elle est — une fiche de lecture avec son exception.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/suivi?fil=${filId}`, { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; mails?: number[]; exceptions?: ExceptionMail[]; periodes?: Periode[];
          rattachee?: boolean; interneEchange?: boolean;
        };
        if (annule || d.etat !== 'ok') return;
        /* 🔴🔴 LES PÉRIODES AUSSI, DEPUIS LE LOT RATTACHEMENT-PONCTUEL — voir `personnesEnVigueur` : elles
           portent les PERSONNES du classement, que la validation doit reposer telles quelles. */
        setSuivi({ mails: d.mails ?? [], exceptions: d.exceptions ?? [], periodes: d.periodes ?? [],
          rattachee: d.rattachee === true, interneEchange: d.interneEchange === true });
      } catch { /* l'alerte se taira : voir l'encadré */ }
    })();
    return () => { annule = true; };
  }, [filId]);

  /**
   * ══ 🔒 LE DOSSIER DU BIEN DANS LE DRIVE — LECTURE SEULE, ET AU MIEUX-EFFORT ═══════════════════════════════════
   *
   * On réemploie la route du lot DRIVE-DOSSIER-DU-BIEN, qui part du dossier du PROPRIÉTAIRE (connu en base depuis
   * le lot 253) et descend, par UN `files.list`, jusqu'au sous-dossier « … — lot N ». Aucune écriture, aucune
   * création : l'application lit des métadonnées, et le lien affiché ouvre Drive dans un autre onglet, avec les
   * droits Google de la personne connectée.
   *
   * ⚠️ SON ÉCHEC NE SE VOIT PAS : sans réponse, le lien retombe sur le dossier du propriétaire porté par la fiche,
   * et à défaut il n'y a pas de lien. Un raccourci absent n'est pas une panne.
   */
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/drive/dossier-du-bien?fil=${filId}`, { cache: 'no-store' });
        /**
         * 🔴🔴 LOT DRIVE-RACCOURCI-PAR-DESTINATAIRE — LA ROUTE REND MAINTENANT `biens`, UN PAR LOT.
         *
         * Elle rendait `dossiers`, un par DOSSIER DE PROPRIÉTAIRE, avec les clés des biens qu'il couvre — il
         * fallait donc déplier `cles` pour retrouver le bien. Elle rend désormais le dossier DE CHAQUE BIEN
         * (celui de « Dossier Drive » sur la fiche), et la carte se lit d'un trait.
         *
         * 🔴 ET « Ouvrir le Drive du bien » Y GAGNE : il ouvrait le dossier du bailleur, un cran au-dessus du
         * logement — chez un propriétaire à six lots, on arrivait sur six sous-dossiers à choisir. Il ouvre
         * maintenant le logement nommé sur le bouton.
         *
         * ⚠️ UN BIEN SANS DOSSIER CONNU N'ENTRE PAS DANS LA CARTE : l'appelant retombe alors sur
         * `b.dossierDriveId`, exactement comme avant. Une absence n'est pas une panne.
         */
        const d = (await res.json()) as {
          etat?: string; biens?: { cle: string; dossierId: string | null }[];
        };
        if (annule || d.etat !== 'ok') return;
        const carte: Record<string, string> = {};
        for (const x of d.biens ?? []) if (x.dossierId !== null) carte[x.cle] = x.dossierId;
        setDossiers(carte);
      } catch { /* confort absent : la fiche reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
  }, [filId]);

  /**
   * ⚠️ LA FENÊTRE DE MODIFICATION PREND TOUTE LA PLACE quand elle s'ouvre : deux boîtes de dialogue empilées sont
   * injouables au clavier, et un lecteur d'écran ne sait plus laquelle est active. On rend donc l'une OU l'autre.
   */
  /* ⚠️ CES DÉRIVATIONS SONT REMONTÉES **AVANT** LES RETOURS ANTICIPÉS (lot CLASSER-PAR-LA-MODALE, point 3) :
     les deux lectures qui suivent en ont besoin, et un `useEffect` placé après un `return` conditionnel n'est
     pas exécuté au même rendu que les autres — React refuse alors de rendre le composant (« Rendered fewer
     hooks than expected »). Défaut attrapé par `RaccourcisCarteBien.test.tsx`. Ce ne sont que des dérivations
     de l'état déjà lu : rien n'a changé dans ce qu'elles calculent. */
  const fiche = etat.v === 'ok' ? etat.fiche : null;
  const tousLesLiens = etat.v === 'ok' ? etat.liens : [];
  const liensParId = new Map(tousLesLiens.map((l) => [l.id, l]));
  const objet = fiche?.objet ?? titre ?? null;
  /**
   * 🔴🔴 LE MAIL DE LA FENÊTRE — UN SEUL CHEMIN, ET C'EST LE LOT. Le mail cliqué s'il y en a un ; sinon celui que
   * le serveur a désigné comme le plus récent, c'est-à-dire celui que la ligne de liste affiche.
   */
  const mailId = messageId ?? fiche?.enTete?.messageId ?? null;
  /** R4 : la date de pose du suivi AUTOMATIQUE qui couvre ce mail (`null` = pas un suivi automatique). */
  const suiviAuto = suivi === null || mailId === null ? null : suiviAutomatiqueDuMail(suivi.mails, suivi.periodes, mailId);
  /**
   * 🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — L'EXPÉDITEUR DU MAIL AFFICHÉ (`enTete`, celui dont la fenêtre
   * parle) : le cartouche « Expéditeur : … » des biens suivis, des propositions et des résultats vient de lui seul.
   */
  const expediteurMail = expediteurDuMail(fiche?.enTete?.de, fiche?.enTete?.deNom, fiche?.enTete?.messageId ?? null);
  /**
   * 🔴🔴 LES BIENS QUE CETTE FENÊTRE MONTRE : ceux qui sont rattachés OFFICIELLEMENT à ce mail — lien vivant et
   * CONFIRMÉ, jamais une proposition. C'est `biensDuMail`, et il n'y a plus de second chemin : c'est pour cela
   * que la fenêtre de la liste montrait encore les cartes « À trancher » après le lot a7f5f968.
   */
  const biens = fiche === null || mailId === null
    ? []
    : biensDuMail(fiche.biens, tousLesLiens, mailId);
  /** L'état de départ du panneau : exactement les biens ci-dessus, cochés. */
  const clesDuMail = biens.map((b) => b.cle);
  /**
   * 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LE TITRE DES CARTES SUIVIES, « adresse — nature · type », par la
   * fonction des cartes du composant partagé. Le code postal est ôté : c'est la forme que la recherche affiche.
   */
  const titresSuivis = new Map(titresDistincts(biens.map((b) => ({
    cle: b.cle, adresse: b.adresseComplete.replace(/\b\d{5}\s+/, ''), nature: b.nature, typeBien: b.typeBien,
    immeuble: null as string | null,
  }))).map((x) => [x.cle, x.titre]));
  const libellesConnus: Record<string, string> = {};
  for (const b of biens) libellesConnus[b.cle] = `${b.adresseComplete} — lot ${b.numeroLot}`;
  /**
   * 🔴🔴 LOT GESTION-SUIVI-MIXTE (Arno, 16/10/2026) — LES BIENS DE CE MAIL RATTACHÉS EN ONE SHOT, par la même vérité que le
   * badge « Suivi modifié en one shot » (`biensOneShotDuMail`). Mixte = au moins un bien One shot ET au moins un bien du
   * suivi de fond.
   */
  const clesOneShot = suivi === null || mailId === null ? new Set<string>()
    : biensOneShotDuMail({ messageId: mailId, mails: suivi.mails, periodes: suivi.periodes, exceptions: suivi.exceptions });
  const suiviMixte = clesOneShot.size > 0 && biens.some((b) => !clesOneShot.has(b.cle));
  /**
   * 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — LES NOMS DES BIENS **COCHÉS**, et pas seulement des rattachés.
   *
   * ⚠️ DÉFAUT VU À L'ÉCRAN (06/10/2026, mail d'essai 57299) : « Créer un événement » préremplissait le titre
   * avec la CLÉ du bien coché (« 475 ») au lieu de son nom, et la phrase « Sera rattaché à … » disait la même
   * clé. La cause : cette fenêtre ne nomme que les biens DÉJÀ rattachés au mail ; un bien tout juste coché dans
   * les propositions ou dans la recherche n'est connu que du menu. Il le dit désormais (second argument de
   * `onCochesChange`), et les deux cartes de noms se superposent — les rattachés d'abord, les cochés ensuite.
   */
  const libellesDuMail: Record<string, string> = { ...libellesCoches, ...libellesConnus };
  /**
   * 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LE JOUR DU MAIL DE CETTE FENÊTRE, `AAAA-MM-JJ`.
   *
   * Il préremplit la date d'ouverture d'une carte neuve (« préremplie à la date du mail », Arno). Il vient de
   * l'en-tête que le serveur a rendu — la même source que la phrase « Gestion · mercredi 30 septembre… ».
   *
   * ⚠️ `null` TANT QUE LA FICHE N'A PAS RÉPONDU, et le formulaire retombe alors sur aujourd'hui : on ne devine
   * pas une date, et un champ vide se lirait comme un oubli.
   */
  const jourDuMailDeLaFenetre = fiche?.enTete?.recuLe == null
    ? null : jourParis(new Date(fiche.enTete.recuLe));

  /**
   * 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — Y A-T-IL UNE MODIFICATION ? Une case cochée ou décochée, un bien
   * ajouté, un événement à lier ou à créer. Dès la première, la glissière passe AUTOMATIQUEMENT de ① à ② ; sans plus
   * aucune, elle revient à ① et grise les trois autres (module pur `positionSuivante`).
   */
  const modification = modificationEnCours({ avant: clesDuMail, apres: selection, evenementVoulu: evtVoulu !== null });
  /* ⚠️ CALCULÉE AU RENDU, jamais recopiée par un effet : la position affichée découle de la position voulue et de
     l'existence d'une modification — elle ne peut donc jamais les contredire. */
  /**
   * ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — LE PREMIER CLASSEMENT ═════════════════════════════════════════════
   * Un mail « À classer », ou un mail qui ne porte aucun bien et qu'aucune période ni exception ne couvre : il n'a
   * JAMAIS été classé. « Origine » y veut dire « laisser à classer », et la glissière part sur « Ce mail + futurs
   * échanges », la règle du premier classement (Arno). Les mails de l'historique d'un bien n'y sont jamais.
   */
  const premier = ponctuel && (aClasser || (
    suivi !== null && mailId !== null && fiche !== null && !fiche.horsGestion && clesDuMail.length === 0
    && !projeter(suivi.mails, suivi.periodes, suivi.exceptions).has(mailId)));
  const position = positionAffichee(positionVoulue, modification, premier);
  /**
   * ══ 🔴🔴 LOT RATTACHEMENT-CONVERSATION (Arno, 16/10/2026) — RÈGLE C : AUCUNE POSITION PRÉSÉLECTIONNÉE ══════════════
   * Mail jamais classé qui n'est PAS le premier d'une conversation sans suivi de fond : la glissière s'ouvre vide, et la
   * validation reste inactive tant qu'une des trois options n'est pas choisie. `suivi` pas encore lu ⇒ on ne demande pas
   * (la règle d'avant, le temps d'une requête). Premier mail et conversation déjà suivie : inchangés.
   */
  const aDemander = premier && suivi !== null && mailId !== null && porteeADemander({
    messageId: mailId, mails: suivi.mails, nbPeriodes: suivi.periodes.length, nbExceptions: suivi.exceptions.length,
    rattachee: suivi.rattachee === true, interneEchange: suivi.interneEchange === true,
  });
  const sansPosition = positionAChoisir(positionVoulue, aDemander);
  /* Plus aucune modification : la position voulue repart de ①, pour que la PROCHAINE modification ramène bien sur ②.
     ⚠️ Pas au premier classement : la portée s'y choisit AVANT de cocher, et on ne la reprend pas. */
  if (!premier && !modification && positionVoulue !== null) setPosition(null);
  /**
   * 🔴🔴 LOT GESTION-EXPEDITEUR-INCONNU — à chaque changement des biens cochés, la question est reposée à l'appelant (lecture
   * seule). Sans bien coché, ou si la lecture échoue, l'interrupteur disparaît.
   */
  const clesPourExpediteur = [...new Set(selection ?? clesDuMail)].sort().join(',');
  useEffect(() => {
    /* ⚠️ SEULEMENT S'IL Y A UNE MODIFICATION : rouvrir un mail rattaché sans rien changer ne pose aucune question. */
    if (expediteurInconnu === undefined || clesPourExpediteur === '' || !modification) { setInconnu(false); return undefined; }
    let vivant = true;
    void expediteurInconnu(clesPourExpediteur.split(',')).then((r) => { if (vivant) setInconnu(r === true); });
    return () => { vivant = false; };
  }, [clesPourExpediteur, expediteurInconnu, modification]);

  /**
   * 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — L'ÉVÉNEMENT DÉJÀ POSÉ SUR CE MAIL, et la migration 268.
   *
   * ⚠️ LA MÊME ROUTE QUE LE BLOC DE L'ENCART, et pour la raison écrite dans son encadré : la donnée et sa
   * condition arrivent ENSEMBLE. Un composant qui affirmerait « mise à jour 268 à appliquer » sans l'avoir
   * demandé au serveur mentirait — c'est le défaut du 28/09/2026.
   *
   * ⚠️ SILENCE EN CAS D'ÉCHEC : la ligne dit « aucun », et les deux gestes restent offerts. Une erreur rouge
   * au-dessus des biens ferait croire que les RATTACHEMENTS ont un problème.
   */
  useEffect(() => {
    if (mailId === null) return undefined;
    let vivant = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/messages/${mailId}/affectation`, { cache: 'no-store' });
        const d = (await res.json()) as {
          etat?: string; evenement?: EvenementDuMail | null; qualifie?: boolean;
          lus?: { rattaches?: EvenementLu[]; duBien?: EvenementLu[] };
        };
        if (!vivant) return;
        setEvtDuMail({
          evenement: d.etat === 'ok' ? (d.evenement ?? null) : null,
          qualifie: d.etat === 'ok' && d.qualifie === true,
          lus: d.etat === 'ok' && d.lus !== undefined
            ? { rattaches: d.lus.rattaches ?? [], duBien: d.lus.duBien ?? [] }
            : null,
        });
      } catch {
        if (vivant) setEvtDuMail({ evenement: null, qualifie: false, lus: null });
      }
    })();
    return () => { vivant = false; };
  }, [mailId, rafraichirEvt]);

  /**
   * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — LES ÉVÉNEMENTS DU OU DES BIENS COCHÉS ══════════════════════════
   *
   * Arno : « “Lier à un événement” (liste des événements du ou des biens cochés) ».
   *
   * 🔴 PAR LA ROUTE QUI RÉPOND DÉJÀ À CETTE QUESTION (`/historique/evenements?cible=lot-…`, lot
   * HISTORIQUE-BIEN-1) : « les événements d'un bien » a UNE définition dans ce dépôt, et en écrire une seconde
   * dans la recherche aurait donné deux listes qui se contredisent un jour.
   *
   * ⚠️ AUCUN BIEN COCHÉ ⇒ AUCUNE RESTRICTION (`null`) : la recherche est alors celle de partout ailleurs. On ne
   * peut pas restreindre à l'ensemble vide une liste dont on ne sait rien — et un mail qu'on classe sans bien
   * peut parfaitement mériter une carte.
   *
   * ⚠️ UNE LECTURE PAR BIEN COCHÉ, et seulement quand le panneau « Lier » est ouvert : cette question ne se pose
   * qu'à cet instant, et la poser à chaque coche aurait rechargé pour rien.
   */
  const clesCochees = (selection ?? clesDuMail).join(',');
  useEffect(() => {
    if (panneauEvt !== 'lier') return undefined;
    const cles = clesCochees === '' ? [] : clesCochees.split(',');
    if (cles.length === 0) { setEvtsDesBiens(null); return undefined; }
    let vivant = true;
    void (async () => {
      const ids = new Set<number>();
      for (const cle of cles) {
        try {
          const res = await fetch(
            `/api/admin/gestion/historique/evenements?cible=lot-${encodeURIComponent(cle)}`,
            { cache: 'no-store' },
          );
          const d = (await res.json()) as { etat?: string; evenements?: { id: number }[] };
          if (d.etat === 'ok') for (const e of d.evenements ?? []) ids.add(e.id);
        } catch {
          /* ⚠️ UNE LECTURE EN ÉCHEC N'EST PAS « AUCUN ÉVÉNEMENT » : on ne retire rien de la liste à cause
             d'elle, les autres biens comptent quand même. */
        }
      }
      if (vivant) setEvtsDesBiens([...ids]);
    })();
    return () => { vivant = false; };
  }, [panneauEvt, clesCochees]);

  /**
   * 🔴🔴 LOT EVENEMENT-RATTACHE-COHERENT — LE MÊME CALCUL QUE LA PASTILLE DE LA LIGNE (`lectureEvenement`, sur les
   * listes que la ligne reçoit). L'événement affiché est celui que la pastille compte ; à défaut, un rattaché hors de
   * toute période (gris : rattaché, mais pas « en cours » pour ce mail).
   */
  const lectureFenetre = lectureEvenement(evtDuMail?.lus?.rattaches ?? [], evtDuMail?.lus?.duBien ?? []);
  /**
   * 🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET — les événements RATTACHÉS au mail, tels que la ligne repliée les nomme :
   * ceux de la période (en cours d'abord), sinon le rattaché hors période que la route connaît (gris).
   */
  const rattachesAffiches: EvenementLu[] = (evtDuMail?.lus?.rattaches ?? []).length > 0
    ? trierParUrgence(evtDuMail?.lus?.rattaches ?? [])
    : (evtDuMail?.evenement ? [{
      id: evtDuMail.evenement.evenementId, reference: evtDuMail.evenement.reference, objet: evtDuMail.evenement.objet,
      ouvert: false, categorie: evtDuMail.evenement.categorie, urgence: evtDuMail.evenement.urgence,
    }] : []);
  /** La liste dépliée (Partie 3) : les événements EN COURS, rattachés ou non. */
  const listeOuverte = listeEnCours(lectureFenetre);
  /** Les rattachés qui ne sont PAS dans la liste (clos) : nommés à part, une seule fois. */
  const rattachesHorsListe = rattachesAffiches.filter((e) => !listeOuverte.some((x) => x.id === e.id));
  /** Un événement « à lier » qui n'est pas dans la liste (choisi par la recherche) : nommé à part. */
  const voulueHorsListe = evtVoulu?.sorte === 'lier' && evtVoulu.capsule !== undefined
    && !listeOuverte.some((x) => x.id === evtVoulu.evenementId)
    ? { ...evtVoulu.capsule, ouvert: true } : null;

  if (modifie !== null) {
    return (
      <ModifierRattachement lien={modifie} messageId={modifie.messageId}
        onGeste={onGeste}
        onAnnuler={() => setModifie(null)}
        onFait={async () => { setModifie(null); await charger(); }} />
    );
  }

  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 a) — LE DRIVE DU BIEN, DANS NOTRE OUTIL ══════════════
   *
   * RÈGLE D'ARNO : « “Ouvrir le Drive du bien” ouvre NOTRE outil Drive (la fenêtre Drive de l'app) positionné
   * directement dans le dossier Drive du bien (arbre déplié jusqu'à lui). Si le dossier est sous “Documents
   * clients scannés” : consultation seule, aucune action d'écriture possible (gardes existantes, refus serveur). »
   *
   * 🔴 C'EST LE MÊME COMPOSANT QUE PARTOUT AILLEURS (`SelecteurFichierDrive`), et c'est tout l'intérêt : les
   * gardes de l'archive, le menu, l'aperçu, les refus du serveur sont ceux qui sont déjà éprouvés. Réécrire ici
   * un navigateur « en lecture » aurait fabriqué un second jeu de règles d'autorisation — donc, un jour, deux
   * réponses différentes à la même question.
   *
   * 🔒 AUCUNE PERMISSION N'EST ACCORDÉE ICI. La consultation seule sous « Documents clients scannés » ne vient pas
   * d'un drapeau que cette fenêtre passerait : elle vient du serveur, qui remonte la chaîne des parents et refuse
   * (`verdictJoindre`, `verdictCreer`, `verdictDeposer`). Un drapeau d'écran se contournerait ; un refus serveur,
   * non.
   *
   * ⚠️ `filId` EST PASSÉ, et il sert : la barre latérale propose alors « Dossier du bien » et les derniers
   * dossiers utilisés pour cet échange — c'est-à-dire qu'on garde le contexte du mail d'où l'on vient.
   */
  if (driveDuBien !== null) {
    return (
      <SelecteurFichierDrive
        mode="consulter"
        filId={filId}
        dossierDepart={driveDuBien}
        onFermer={() => setDriveDuBien(null)} />
    );
  }




  /**
   * ══ 🔴🔴 CE QUE « VALIDER » ÉCRIT — UNE SEULE REQUÊTE, ET LA RÈGLE EST CELLE DU SERVEUR ══════════════════════
   *
   * RÈGLE D'ARNO : « Valider fixe les biens de CE mail (ajouts ET retraits) comme une EXCEPTION “Ce mail
   * uniquement” (même mécanisme que l'option existante). Aucune période créée, fermée ou modifiée ; aucun effet
   * sur les autres mails. Un retour à la configuration de la fenêtre en vigueur supprime l'exception (règle du
   * dernier choix, rien d'écrit). »
   *
   * 🔴 LES QUATRE PROMESSES TIENNENT PARCE QU'ON N'ÉCRIT RIEN ICI. On envoie la DÉCISION à `/api/admin/gestion/suivi`
   * — le même appel que le bloc « Suivi dans la conversation » depuis le lot SUIVI-CONVERSATION — et c'est
   * `effetDuChoix` qui en tire les écritures :
   *   · `choix: 'mail'` ⇒ une EXCEPTION, et rien d'autre : `nouvellePeriode` vaut `null` par construction ;
   *   · la règle 2 du lot SUIVI-DERNIER-CHOIX RETIRE l'exception quand le résultat est identique à la
   *     configuration en vigueur juste avant ce mail — c'est, mot pour mot, le « retour à la configuration de la
   *     fenêtre » d'Arno, et il n'a fallu l'écrire nulle part.
   *
   * ⚠️ UNE SEULE REQUÊTE POUR LES AJOUTS ET LES RETRAITS : on envoie la LISTE VOULUE, pas une suite de gestes.
   * Un `POST` par ajout et un `PATCH` par retrait auraient laissé, en cas d'échec au milieu, un mail à moitié
   * reclassé — et personne pour dire lequel.
   */
  /**
   * ══ 🔴🔴 POINT 2 — L'APERÇU DE LA LEVÉE, ET LES LIENS QUE LE GESTE VIENT DE POSER ══════════════════════════
   *
   * 🔒 LECTURE SEULE, les deux. La levée elle-même est faite par `rattacher()` côté serveur, pendant l'écriture :
   * cette fenêtre ne lève rien, elle DEMANDE avant et offre une SORTIE après.
   */
  const apercuLevee = async (choix: ChoixSuivi): Promise<{ interne: boolean; mails: number[] } | null> => {
    if (mailId === null) return null;
    try {
      const p = new URLSearchParams({ leverait: '1', messageId: String(mailId), choix });
      if ((suivi?.mails ?? []).length > 0) p.set('mails', (suivi?.mails ?? []).join(','));
      const res = await fetch(`/api/admin/gestion/interne?${p.toString()}`, { cache: 'no-store' });
      const d = (await res.json().catch(() => ({}))) as { interne?: boolean; mails?: number[] };
      if (d.interne !== true) return { interne: false, mails: [] };
      return { interne: true, mails: Array.isArray(d.mails) ? d.mails : [] };
    } catch { return null; }
  };

  /**
   * ⚠️ RELECTURE EN BASE, et non un identifiant rendu par l'écriture : le chemin des périodes ne rend AUCUN
   * identifiant de lien — il rend un nombre de projections. Or l'« Annuler » doit nommer ce qu'il retire.
   */
  const liensPosesPour = async (cles: readonly string[], mails: readonly number[]): Promise<number[]> => {
    if (mailId === null || cles.length === 0) return [];
    try {
      const vises = mails.length > 0 ? mails : [mailId];
      const res = await fetch(`/api/admin/gestion/rattachements?messages=${vises.join(',')}`,
        { cache: 'no-store' });
      const d = (await res.json().catch(() => ({}))) as { etat?: string; data?: Record<string, LienAffiche[]> };
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

  /** L'« ANNULER » DES SECONDES QUI SUIVENT : il retire le rattachement ET repose la marque, par les mêmes portes. */
  /** L'« ANNULER » DES SECONDES QUI SUIVENT : il défait la décision de suivi, le rattachement ET la marque. */
  const annulerLevee = async (): Promise<void> => {
    const fait = leveeFaite;
    if (fait === null) return;
    setLeveeFaite(null);
    const issue = await annulerLaLevee(fait);
    if (issue.ok) onGeste?.(motApresAnnulationLevee(issue.liens));
    else setErreur('Le serveur n’a pas répondu.');
    await charger();
  };

  /**
   * ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — L'ÉVÉNEMENT VOULU, ÉCRIT APRÈS LES BIENS ═══════════════════════
   *
   * Arno : « L'événement créé est lié au mail et au(x) bien(s) choisis au moment de “Valider le suivi”. »
   *
   * 🔴 LES MÊMES ROUTES QUE LE BLOC « Événement rattaché » DE L'ENCART, avec le même corps : `{ evenementId }`
   * pour lier, `{ nouveau: { objet, categorie, urgence, parties } }` pour créer. Aucune porte d'écriture neuve,
   * aucune logique recopiée — donc même journal et même réversibilité (« Délier » défait l'un comme l'autre).
   *
   * 🔴 LES PARTIES VIENNENT DE LA FICHE **FRAÎCHE**, celle que la lecture d'après l'écriture vient de rendre.
   * C'est la seule qui connaisse les personnes des biens tout juste rattachés ; prendre l'état de React aurait
   * donné les biens d'AVANT la modification.
   *
   * ⚠️ UN ÉCHEC NE DÉFAIT PAS LES BIENS : ils sont écrits, et c'est un geste réussi. On le DIT, et l'événement
   * reste voulu — on peut réessayer sans recommencer la sélection.
   */
  const ecrireLEvenementVoulu = async (
    fraiche: FicheRattachementFil | null, voulus: readonly { cle: string; libelle: string }[],
  ): Promise<void> => {
    const voulu = evtVoulu;
    if (voulu === null || mailId === null) return;
    /* 🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — le corps de création est `corpsCreation` (module pur
       evenementDuMail), le MÊME que la fenêtre « Événement de ce mail » envoie : aucun des deux ne le recopie. */
    const corps = voulu.sorte === 'lier'
      ? { evenementId: voulu.evenementId }
      : corpsCreation(voulu, evtDuMail?.qualifie === true, partiesDesBiens(fraiche, voulus));
    try {
      const res = await fetch(`/api/admin/gestion/messages/${mailId}/affectation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
      });
      const d = (await res.json()) as { erreur?: string };
      if (!res.ok) { setErreur(d.erreur ?? 'Les biens sont enregistrés, mais l’événement n’a pas abouti.'); return; }
      setEvtVoulu(null);
      setPanneauEvt('aucun');
      setRafraichirEvt((n) => n + 1);
      onGeste?.(voulu.sorte === 'lier'
        ? 'Mail lié à l’événement.'
        : 'Événement créé et lié à ce mail.');
    } catch {
      setErreur('Les biens sont enregistrés, mais le serveur n’a pas répondu pour l’événement.');
    }
  };

  /**
   * 🔴 SUR QUOI PORTE LA CARTE NEUVE : le bien, son propriétaire, son locataire — la même règle que le bloc de
   * l'encart (demande d'Arno au lot CONTACTS-ET-EVENEMENT), lue sur la fiche fraîche.
   */
  const partiesDesBiens = (
    fraiche: FicheRattachementFil | null,
    voulus: readonly { cle: string; libelle: string }[],
  ): PartieCarteNeuve[] => partiesDesBiensFiche(fraiche?.biens ?? [], voulus);

  /**
   * Les PERSONNES que le suivi applique à ce mail — propriétaire, locataire, et leur contact extérieur. PUR vis
   * à vis du réseau : tout est déjà chargé. `[]` quand aucune fenêtre ne couvre ce mail.
   */
  const personnesEnVigueur = (): PersonneClassee[] => {
    if (suivi === null || mailId === null) return [];
    const c = projeter(suivi.mails, suivi.periodes, suivi.exceptions).get(mailId);
    return [...(c?.personnes ?? [])];
  };

  const ecrire = async (
    voulus: readonly { cle: string; libelle: string }[], choix: ChoixSuivi,
    /**
     * 🔴🔴 POINT 2 — LA CONFIRMATION, ET CE QU'ELLE A VU. `null` = pas encore confirmée. Sinon : LES MAILS QUI
     * ÉTAIENT INTERNE au moment de la question — la seule occasion de les connaître, puisque l'écriture les
     * aura levés quand on en reparlera.
     */
    leveeConfirmee: readonly number[] | null = null,
  ): Promise<void> => {
    if (mailId === null) return;
    setErreur(null);
    /**
     * ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL — LES PERSONNES DU CLASSEMENT SONT REPOSÉES TELLES QUELLES ═══════════
     *
     * ═══ DÉFAUT TROUVÉ À L'ESSAI RÉEL (06/10/2026, mail _TEST 57471 de lot-27) ═════════════════════════════
     *
     * Décocher le bien a retiré le lien du bien — ce qu'on demandait — ET le lien `proprietaire 45`, c'est-à-dire
     * l'INTERVENTION « pour JOREL Arnaud (propriétaire) · via Arnaud JOREL » que la ligne affiche. Personne ne
     * l'avait demandé, et rien ne l'annonçait.
     *
     * 🔴 LA CAUSE EST CELLE QUE `sortirDuSuivi` A DÉJÀ RACONTÉE : le classement d'un mail a DEUX axes. Les BIENS
     * (`biens`) et les PERSONNES (`personnes`, lot CONTACTS-EXTERNES), projetées à part. Cette fenêtre ne connaît
     * que les biens : en posant `{ sorte: 'biens', biens }` sans plus, elle écrivait « et aucune personne ».
     *
     * 🔴 ON REPOSE DONC LES PERSONNES EN VIGUEUR, lues à la même source que `sortirDuSuivi` : la projection des
     * périodes et des exceptions sur CE mail. On ne les reconstruit pas depuis les liens — c'est exactement
     * l'erreur que l'essai réel du 05/10 avait déjà coûtée (un propriétaire reposé en LOT).
     *
     * ⚠️ AUCUNE PERSONNE EN VIGUEUR ⇒ RIEN D'AJOUTÉ, et le geste est celui d'avant : c'est le cas de l'immense
     * majorité du courrier.
     */
    const personnes = personnesEnVigueur();
    const classement: Classement = {
      sorte: 'biens',
      biens: voulus.map((b) => ({ ...b })),
      ...(personnes.length > 0 ? { personnes } : {}),
    };

    /**
     * ══ 🔴🔴 POINT 2 — ON DEMANDE AVANT, QUAND UN BIEN S'AJOUTE À UN MAIL MARQUÉ « INTERNE » ═════════════════
     *
     * 🔴 « QU'UN BIEN S'AJOUTE » EST LA CONDITION. Retirer un bien, ou revalider la même liste, ne lève aucune
     * marque et ne doit poser aucune question — règle d'Arno du sens inverse : « si rien n'est concerné,
     * comportement actuel inchangé, sans message ».
     *
     * ⚠️ APERÇU EN ÉCHEC (`null`) ⇒ ON ÉCRIT QUAND MÊME, sans offrir d'« Annuler ». Refuser le geste parce
     * qu'une lecture a échoué conditionnerait une fonction existante à une requête nouvelle.
     */
    const ajoutes = voulus.map((b) => b.cle).filter((c) => !clesDuMail.includes(c));
    if (leveeConfirmee === null && ajoutes.length > 0) {
      const apercu = await apercuLevee(choix);
      if (apercu !== null && apercu.interne) {
        setDemandeLevee({ message: messageLeveeInterne(true) ?? '', mails: apercu.mails, geste: { voulus, choix } });
        return;
      }
    }

    try {
      const res = await fetch('/api/admin/gestion/suivi', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filId, messageId: mailId, classement, choix }),
      });
      const d = (await res.json()) as { ok?: boolean; erreur?: string; trace?: TraceSuivi };
      if (!res.ok || d.ok !== true) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return; }
      /* 🔴 LOT SUIVI-DE-FOND-MODIFIE-ET-COMPTEUR-BIENS — le classement de ce mail (et peut-être de son échange) vient de
         changer : les lignes affichées relisent leur compteur « N biens rattachés », sans recharger la page. */
      annoncerClassement({ messageId: mailId, filId });
      onGeste?.(choix === 'mail'
        ? `Exception posée sur ce mail : ${motClassement(classement)}.`
        : (choix === 'conversation'
          ? `Toute la conversation reclassée : ${motClassement(classement)}.`
          : `Nouvelle période à partir de ce mail : ${motClassement(classement)}.`));
      setPanneau('aucun');
      setSelection(null);
      setConfirme(false);
      const fraiche = await charger();
      /* 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — l'événement voulu s'écrit MAINTENANT, et pas avant : la carte
         neuve reçoit ainsi les biens qu'on vient d'écrire, avec leur propriétaire et leur locataire. */
      await ecrireLEvenementVoulu(fraiche, voulus);
      /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — la sortie, quelques secondes, et seulement dans cette porte :
         ailleurs la fenêtre se referme au geste, et un « Annuler » rendu dedans disparaîtrait avec elle. */
      if (ponctuel) { setChoixFait(choix); setPonctuelFait(d.trace ?? null); setPosition(null); }
      /* 🔴🔴 POINT 2 — APRÈS L'ÉCRITURE, ET JAMAIS AVANT : la marque est déjà levée par `rattacher()`. Ce qui
         reste à faire est d'offrir la SORTIE, avec les deux moitiés qu'elle devra défaire. */
      if (leveeConfirmee !== null && leveeConfirmee.length > 0 && ajoutes.length > 0) {
        const fait: SortieLevee = {
          mails: [...leveeConfirmee],
          liens: await liensPosesPour(ajoutes, suivi?.mails ?? []),
          /* 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — LA TRACE DE LA DÉCISION, telle que le serveur l'a
             rendue. Sans elle, « Annuler » ne pourrait que REJOUER une décision, donc en inventer une. */
          trace: d.trace ?? null,
        };
        if (onLeveeFaite !== undefined) onLeveeFaite(fait); else setLeveeFaite(fait);
      }
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    }
  };

  /**
   * 🔴🔴 L'ALERTE DE « TOUTE LA CONVERSATION », composée par le module PUR — et sa confirmation obligatoire.
   * Comportement existant, repris sans une virgule de changement (lot SUIVI-CONVERSATION).
   */
  const alerte = suivi === null || mailId === null ? '' : alerteTouteLaConversation({
    mails: suivi.mails, exceptions: suivi.exceptions, messageId: mailId, periodes: suivi.periodes,
    versQuoi: motClassement({
      sorte: 'biens',
      biens: (selection ?? clesDuMail).map((cle) => ({ cle, libelle: libellesDuMail[cle] ?? cle })),
    }),
  });
  const bloquee = !ponctuel && choixSuivi === 'conversation' && !confirme
    ? 'Cochez la confirmation ci-dessus pour reclasser toute la conversation.'
    : null;

  /**
   * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA PORTÉE, LA DÉFINITION, LE BOUTON FINAL (porte ponctuelle) ══
   *
   * 🔴 ① SANS MODIFICATION : « Valider le maintien du suivi actuel » ferme sans rien écrire.
   * 🔴 ②③④ : « Valider la modification du suivi » écrit par LA porte existante (`ecrire` → `/api/admin/gestion/suivi`),
   *    avec la fenêtre de la position : `mail` (exception + photo « avant », lot TRACE-ONE-SHOT), `suite` (la période,
   *    son accolade et son point d'information, inchangés), `conversation` (projection : ajouts posés, retraits en
   *    « sorti du suivi », restaurables). Tout est historisé par cette porte.
   * 🔴 ① AVEC DES MODIFICATIONS : la question « Revenir au suivi d'origine ? », et rien ne bouge sans un « Oui ».
   */
  const choisirPosition = (p: PositionPortee): void => {
    /* 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — « Origine » n'est pas choisissable au premier rattachement (Arno). */
    if (p === 'origine' && premier) return;
    if (p === 'origine' && modification) { setDemandeOrigine(true); return; }
    setPosition(p);
    setConfirme(false);
  };
  const revenirALOrigine = (): void => {
    setSelection(clesDuMail);
    setEvtVoulu(null);
    setPanneauEvt('aucun');
    /* Le menu (propositions, recherche, biens ajoutés) repart de son état d'ouverture. */
    setCleMenu((n) => n + 1);
    setDemandeOrigine(false);
    setConfirme(false);
    setPosition('origine');
  };
  /**
   * ══ 🔴🔴 LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — LE BOUTON SUIT LA GLISSIÈRE ET LES CASES, EN DIRECT ══════
   * Calculé au rendu par le module PUR (`etatBoutonPortee`) : aucun bien coché au premier rattachement, hors « Origine »,
   * ⇒ « Sélectionner minimum un bien », blanc et inactif ; son clic n'écrit rien, il APPELLE l'œil vers les blocs de
   * biens (un bref liseré, qui se tait sous `prefers-reduced-motion`).
   */
  const nbCoches = new Set(selection ?? clesDuMail).size;
  const bouton = sansPosition
    ? { mot: MOT_CHOISIR_PORTEE, aspect: 'vide' as const, inactif: true, mention: null }
    : etatBoutonPortee({ premier, position, modification, nbCoches });
  const appelerLesBiens = (): void => {
    setAppel(Date.now());
    const bloc = document.querySelector<HTMLElement>('.rdf .rdf-suivis, .rdf .rec-carte');
    /* ⚠️ `scrollIntoView` peut manquer (environnement sans mise en page) : l'appel reste visuel, sans défilement. */
    if (bloc !== null && typeof bloc.scrollIntoView === 'function') bloc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  const validerLaPortee = (): void => {
    if (sansPosition) return;   // 🔴 règle C : rien ne s'écrit tant qu'une option n'est pas choisie
    if (bouton.inactif) { appelerLesBiens(); return; }
    /* « Origine » n'écrit jamais rien : au premier rattachement, le mail reste « À classer », biens cochés ou non. */
    if (!modification || position === 'origine') { onFerme(); return; }
    const choix = definitionDe(position).choix;
    if (choix === null || (position === 'conversation' && !confirme)) return;
    const voulus = (selection ?? clesDuMail).map((cle) => ({ cle, libelle: libellesDuMail[cle] ?? cle }));
    /* 🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — l'appelant qui écrit lui-même reçoit les biens et la portée. */
    if (ecrireParLAppelant !== undefined) {
      ecrireParLAppelant(voulus, choix, porteeArbitre(positionVoulue, premier), inconnu ? affecter : undefined);
      return;
    }
    void ecrire(voulus, choix);
  };
  /* 🔴 LOT COMPOSEUR-FENETRE-COMPLETE — le bloc est un composant PARTAGÉ (`BlocPortee`) : le composeur rend le même. */
  const blocPortee = (
    <BlocPortee position={position} modification={modification} premier={premier} sansPosition={sansPosition}
      nbCoches={new Set(selection ?? clesDuMail).size}
      demandeOrigine={demandeOrigine} onChoisir={choisirPosition}
      onOuiOrigine={revenirALOrigine} onNonOrigine={() => setDemandeOrigine(false)}
      confirmation={position === 'conversation' && modification && suivi !== null && mailId !== null
        ? motConfirmationConversation({ mails: suivi.mails, exceptions: suivi.exceptions, messageId: mailId, periodes: suivi.periodes }) : null}
      confirme={confirme} onConfirme={() => setConfirme((v) => !v)}
      bouton={bouton} desactive={sansPosition || occupeParLAppelant || (modification && position === 'conversation' && !confirme)}
      onValider={validerLaPortee} />
  );

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <style>{CSS_RATTACHEMENTS_FIL}</style>
      {/* 🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — la feuille du formulaire partagé (`ChampsEvenement`, classes
          `bev-…`). Elle est montée ici parce que ce sont SES champs qu'on affiche ; la recopier aurait donné
          deux formulaires qui ne se ressemblent plus au premier ajustement. */}
      <style>{CSS_BLOC_EVENEMENT}</style>
      {ponctuel && <style>{CSS_LISTE_BIENS}</style>}
      {ponctuel && <style>{CSS_INFO_BIEN}</style>}
      <div className={`mrt rdf${ponctuel ? ' rdf--ponctuel' : ''}${appel !== 0 ? ' rdf--appel' : ''}`} role="dialog" aria-modal="true" aria-labelledby="rdf-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>
        {/* 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA CROIX : fermer sans rien écrire, c'est revenir à
            « Origine » (Arno). Elle ne fait QUE fermer : aucune requête ne part par elle. */}
        {ponctuel && (
          <button type="button" className="rdf-croix" aria-label="Fermer sans rien changer"
            title="Fermer sans rien changer" onClick={onFerme}>×</button>
        )}

        {/* ══ 🔴🔴 EN TÊTE : DE QUEL MAIL ON PARLE — expéditeur, date, objet (demande d'Arno) ═════════════════
            🔴 UN SEUL TITRE DÉSORMAIS. « Bien(s) de cet échange » a disparu avec la fenêtre qui le portait : un
            rattachement se pose sur un MAIL, et « les biens de l'échange » était une somme — or une somme ne se
            modifie pas. */}
        <h2 className="mrt-titre" id="rdf-titre">{TITRE_BIENS_DU_MAIL}</h2>
        {/* ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — LE BANDEAU, MOT POUR MOT CELUI D'ARNO ════════════════
            Il est EN HAUT, avant tout le reste, et non près du bouton : on doit savoir ce que la fenêtre fait
            AVANT de commencer à cocher, pas au moment de valider. `role="note"` : un lecteur d'écran l'annonce
            comme une remarque, sans voler le focus. */}
        {/* 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — CE BANDEAU A DÉMÉNAGÉ, MOT POUR MOT : c'est désormais la
            définition de ② « One shot », sous la glissière (Arno : « ② texte actuel »). En haut, il aurait démenti
            ③ et ④. Les deux autres portes ne l'ont jamais affiché. */}
        {/* ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — LA SORTIE, QUELQUES SECONDES ═════════════════════════
            Arno : « “Annuler” quelques secondes après, qui rétablit exactement l'état d'avant. »
            🔴 ELLE NE RÉÉCRIT RIEN : elle défait la décision de suivi, et la projection ramène les liens
            d'elle-même. Un second chemin de restauration aurait divergé au premier ajustement. */}
        {ponctuelFait !== null && (
          <div className="rdf-ponctuel-fait" role="status">
            <span className="rdf-ponctuel-mot">{motApresValidation(choixFait)}</span>
            <button type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => void (async () => {
                const trace = ponctuelFait;
                setPonctuelFait(null);
                const ok = await defaireLaDecisionDeSuivi(trace);
                if (!ok) { setErreur('L’annulation n’a pas abouti : rien n’a été défait.'); return; }
                annoncerClassement({ messageId: mailId ?? 0, filId });
                onGeste?.('Modification ponctuelle annulée : l’état d’avant est rétabli.');
                await charger();
              })()}>
              Annuler
            </button>
          </div>
        )}
        {fiche?.enTete != null && (
          <p className="rdf-entete">{motEnTeteMail(fiche.enTete, dateHeureComplete(fiche.enTete.recuLe))}</p>
        )}
        {/* ⚠️ L'OBJET DE L'ÉCHANGE RESTE, en repli : il sert quand l'en-tête du mail n'a pas pu être lu. */}
        {fiche?.enTete == null && objet !== null && objet !== '' && <p className="rdf-objet">{objet}</p>}
        {/**
          * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 2 — LE COMPTEUR, EN DIRECT ═══════════════════════
          *
          * Il compte CE QUI SERA RATTACHÉ SI L'ON VALIDE : les cartes du haut restées cochées, plus les biens
          * cochés dans les propositions ou dans la recherche. C'est exactement la liste que « Valider » enverra,
          * et c'est pour cela qu'elle est lue au même endroit qu'elle — `selection`.
          *
          * ⚠️ HORS MODIFICATION, `selection` EST `null` et l'on compte l'état ENREGISTRÉ (`clesDuMail`). Après
          * une validation, la fenêtre relit la base : le compteur reflète donc ce qui est écrit, sans que rien
          * n'ait à le lui dire.
          *
          * ⚠️ ON NE L'AFFICHE PAS QUAND LE BLOC « aucun bien » EST LÀ : il dirait la même chose deux fois, à deux
          * centimètres d'écart.
          */}
        {/* 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — en « Modifier le rattachement », le titre du bloc des biens
            suivis REMPLACE ce compteur (Arno). Les deux autres portes le gardent. */}
        {!ponctuel && fiche !== null && !(biens.length === 0 && panneau === 'aucun') && (
          <p className="rdf-detail rdf-compteur">{motNbBiensRattaches((selection ?? clesDuMail).length)}</p>
        )}

        {/**
          * ══ 🔴🔴 LOT MONGA-1, POINT 3 — L'ENCART « INTERVENTION MONGA », EN TÊTE ═══════════════════════════════
          *
          * Arno : « dans la fenêtre “Classer” (même composant), un encart EN TÊTE “Intervention Monga MNG-23987 ·
          * barre de douche defixer · 53 avenue des Ternes”. »
          *
          * 🔴 IL EST POSÉ ICI, AVANT TOUT CE QUI SE COCHE, et pour la même raison que le bandeau ponctuel : on
          * doit savoir DE QUELLE INTERVENTION il s'agit avant de commencer à choisir un bien. Posé en bas, il
          * serait lu après que la décision est prise.
          *
          * ⚠️ IL NE RETIRE RIEN À LA FENÊTRE. Sur un mail qui n'est pas un mail Monga — c'est-à-dire sur
          * l'immense majorité du courrier — il ne rend RIEN, et la fenêtre est exactement celle d'avant ce lot.
          *
          * 🔴 `onRelie` RELIT LA FENÊTRE, parce que relier une référence CLASSE le mail : ses biens, son
          * propriétaire et son locataire viennent de changer sous l'encart. Sans cette relecture, la fenêtre
          * montrerait l'état d'avant le clic jusqu'à sa prochaine ouverture.
          */}
        <EncartMonga messageId={mailId} onGeste={onGeste} onRelie={() => { void charger(); }} />

        {etat.v === 'charge' && <p className="gst-info" role="status">Lecture des rattachements…</p>}
        {etat.v === 'erreur' && <p className="gst-tronc" role="alert">{etat.message}</p>}
        {/* ⚠️ LA MIGRATION 257 ABSENTE EST UN ÉTAT, PAS UNE PANNE : on le DIT, on ne montre pas une liste vide. */}
        {etat.v === 'sans_schema' && (
          <p className="gst-tronc">
            Les rattachements ne sont pas encore installés sur cette base (mise à jour 257 à appliquer).
          </p>
        )}

        {/* ══ 🔴 HORS GESTION, OU AUCUN BIEN : ON LE DIT, ET ON PROPOSE LE GESTE ═════════════════════════════
            Un cadre vide se lit comme une panne. Ces deux états sont des RÉPONSES — « ce mail ne concerne aucun
            bien », « il n'est rattaché à rien pour l'instant » — et chacun a sa suite naturelle. */}
        {!ponctuel && fiche !== null && biens.length === 0 && (
          <div className="rdf-vide">
            <p className="rdf-vide-mot">
              {fiche.horsGestion
                ? 'Cet échange est marqué « Hors gestion » : il ne concerne aucun bien.'
                : AUCUN_BIEN_DU_MAIL}
            </p>
            <p className="rdf-detail">
              {fiche.horsGestion
                ? 'La marque se lève d’elle-même si vous le rattachez à un bien.'
                : 'Les autres mails de la conversation peuvent l’être, eux.'}
            </p>
          </div>
        )}

        {/* ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — BLOC 1 : « BIENS ACTUELLEMENT SUIVI(S) » ════════════
            Le titre est INTÉGRÉ au cadre qui liste les biens (Arno), en plus grand. Chaque bien est une carte au format du
            composant partagé ; son détail est sur une ligne repliable. Seule la porte ponctuelle est concernée. */}
        {ponctuel && fiche !== null && (
          <section className="rdf-suivis" aria-labelledby="rdf-suivis-titre">
            {/* 🔴🔴 LOT GESTION-SUIVI-MIXTE (Arno) — suivi de fond ET One shot sur ce mail : le titre le dit, en rouge. */}
            <h3 className={`rdf-suivis-titre${suiviMixte ? ' rdf-suivis-titre--mixte' : ''}`} id="rdf-suivis-titre">
              {suiviMixte ? TITRE_SUIVI_MIXTE : TITRE_BIENS_SUIVIS}
            </h3>
            {/* 🔴🔴 LOT RATTACHEMENT-AUTOMATIQUE-REGLES-R1-R4-ET-LECTURE-DE-L-OBJET — R4 : le suivi en vigueur sur ce mail a été
                posé par l'automate ; on le dit, avec sa date. Rien d'autre ne change dans ce bloc. */}
            {suiviAuto !== null && (
              <p className="rdf-detail rdf-suivi-auto">
                {motSuiviAutomatique(suiviAuto === '' ? null : dateHeureComplete(suiviAuto))}
              </p>
            )}
            {biens.length === 0 && (
              <p className="rdf-detail">
                {fiche.horsGestion
                  ? 'Cet échange est marqué « Hors gestion » : il ne concerne aucun bien. La marque se lève d’elle-même si vous le rattachez à un bien.'
                  : premier ? AUCUN_BIEN_SUIVI
                    : `${AUCUN_BIEN_DU_MAIL}. Les autres mails de la conversation peuvent l’être, eux.`}
              </p>
            )}
            <ul className="rdf-suivis-liste">
              {biens.map((b) => (
                <CarteBienSuivi key={b.cle} bien={b} titre={titresSuivis.get(b.cle) ?? b.adresseComplete}
                  ponctuel={b.ponctuel} expediteurMail={expediteurMail} oneShot={clesOneShot.has(b.cle)}
                  garde={panneau === 'aucun' ? undefined : (selection ?? clesDuMail).includes(b.cle)}
                  onGarder={panneau === 'aucun' ? undefined : () => setSelection((avant) => {
                    const courant = avant ?? clesDuMail;
                    return courant.includes(b.cle) ? courant.filter((c) => c !== b.cle) : [...courant, b.cle];
                  })}
                  liens={b.lienIds.map((id) => liensParId.get(id)).filter((l): l is LienAffiche => l !== undefined)}
                  onModifier={setModifie} />
              ))}
            </ul>
          </section>
        )}

        {/* ══ 🔴 UN BLOC PAR BIEN ════════════════════════════════════════════════════════════════════════════ */}
        {!ponctuel && biens.map((b) => (
          <BlocBien key={b.cle} bien={b} dossierId={dossiers[b.cle] ?? b.dossierDriveId} expediteurMail={expediteurMail}
            ponctuel={b.ponctuel}
            /* 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — la case n'existe QUE pendant la
               modification : hors du panneau, la carte est exactement celle d'avant ce lot. */
            garde={panneau === 'aucun' ? undefined : (selection ?? clesDuMail).includes(b.cle)}
            onGarder={panneau === 'aucun' ? undefined : () => setSelection((avant) => {
              const courant = avant ?? clesDuMail;
              return courant.includes(b.cle) ? courant.filter((c) => c !== b.cle) : [...courant, b.cle];
            })}
            /* 🔴 LA FENÊTRE NE PARLE QUE D'UN MAIL : « sur 1 mail » n'apprend rien, et le détail ne montre que
               ses liens à lui. Voir `biensDuMail`. */
            surUnSeulMail
            liens={b.lienIds.map((id) => liensParId.get(id)).filter((l): l is LienAffiche => l !== undefined)}
            /* 🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 a) — la carte demande, la fenêtre ouvre. */
            onDrive={setDriveDuBien}
            onModifier={setModifie} />
        ))}

        {/* ══ 🔴🔴 LE GRAND BOUTON, ET CE QU'IL OUVRE DANS LA MÊME FENÊTRE ═══════════════════════════════════
            RÈGLE D'ARNO : « Sous les biens, un grand bouton “Modifier les biens de ce mail”. Il ouvre, dans la
            même fenêtre : a) les propositions automatiques s'il y en a (décochées, sauf les biens déjà
            rattachés, qui sont cochés) ; b) le moteur de recherche (tous les biens de la base) ; c) un encadré
            clair. »

            🔴 LES DEUX ZONES SONT CELLES DU MENU EXISTANT (`MenuRattachementBien`), réemployé tel quel : une
            seconde liste de propositions aurait fini par ne plus dire la même chose que la première. Seules la
            pré-coche, le pied et l'écriture changent — et c'est exactement ce que le menu accepte désormais. */}
        {mailId !== null && panneau === 'aucun' && (
          <button type="button" className="svv-btn svv-btn-primary gst-btn rdf-modifier"
            onClick={() => {
              setPanneau('modifier');
              setSelection(clesDuMail);
              setChoixSuivi('mail');
              setConfirme(false);
              setErreur(null);
            }}>
            {MOT_MODIFIER_BIENS_DU_MAIL}
          </button>
        )}

        {mailId !== null && panneau !== 'aucun' && (
          <MenuRattachementBien key={`${mailId}-${cleMenu}`} messageId={mailId} filId={filId}
            /* 🔴 LOT PROPOSITIONS-MEME-PROPRIETAIRE — en porte ponctuelle, les propositions élargies (règle d'Arno). */
            propositionsElargies={ponctuel}
            preCoches={clesDuMail}
            /* 🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — en porte ponctuelle, la validation est la glissière et
               le bouton final de cette fenêtre (dans le pied) : la rangée du menu n'est pas rendue. */
            sansBoutons={ponctuel}
            /* 🔴 LOT GLISSIERE-PILULE — dans « Modifier le rattachement » (porte ponctuelle), le bloc « Propositions »
               se replie par sa croix (Arno). Les autres portes n'ont pas la croix. */
            propositionsRepliables={ponctuel}
            /* 🔴 LOT TITRE-PROPOSITIONS-DYNAMIQUE (Arno, 14/10/2026) — « Propositions », ou « Bien(s) ajouté(s) … » selon la
               portée, dès qu'un bien est coché hors des biens déjà rattachés. Seule la porte à glissière est concernée. */
            {...(ponctuel ? {
              titrePropositions: titreBlocPropositions(
                (selection ?? clesDuMail).some((c) => !clesDuMail.includes(c)), sansPosition ? 'origine' : position),
            } : {})}
            /* 🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — le cartouche nommé et la trame verte « coché ». */
            expediteurMail={expediteurMail} trameCochee
            libellesConnus={libellesConnus}
            /**
             * 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — LA SÉLECTION EST TENUE ICI.
             *
             * Elle se coche désormais sur les CARTES du haut autant que dans le menu : il n'y a donc qu'un seul
             * endroit possible pour la garder, et c'est la fenêtre. Le menu, lui, la reçoit et la rend.
             */
            cochesImposees={selection ?? clesDuMail}
            /* 🔴 LES NOMS ARRIVENT AVEC LES CLÉS (point 3, défaut vu à l'écran) : voir `libellesDuMail`. */
            onCochesChange={(cles, noms) => {
              setSelection(cles);
              if (noms !== undefined) setLibellesCoches((avant) => ({ ...avant, ...noms }));
            }}
            onSelection={(cles, noms) => {
              setSelection(cles);
              if (noms !== undefined) setLibellesCoches((avant) => ({ ...avant, ...noms }));
            }}
            /* 🔴 LE MOT DIT CE QUE « VALIDER » VA FAIRE, et les deux mots existaient déjà : valider une
               exception n'est pas valider le suivi d'une conversation, et un seul libellé pour les deux
               aurait effacé la différence que l'encadré prend soin d'expliquer. */
            /* 🔴 EN MODE PONCTUEL, LE BOUTON DIT LA PORTÉE, puisque plus rien d'autre ne la dit (Arno). */
            motValider={ponctuel
              ? MOT_VALIDER_CE_MAIL_UNIQUEMENT
              : (choixSuivi === 'mail' ? 'Valider les biens de ce mail' : 'Valider le suivi')}
            validationBloquee={bloquee}
            /* 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — un événement voulu EST quelque chose à valider, même si
               les biens n'ont pas bougé. Sans cela, « Valider le suivi » restait grisé et l'événement
               inatteignable. */
            aussiAValider={evtVoulu !== null}
            /* 🔴🔴 EN PONCTUEL, LA FENÊTRE EST `'mail'` ET NE PEUT PAS ÊTRE AUTRE CHOSE — ce n'est pas l'état
               d'un bouton qu'on lit, c'est une constante : un état se change, une constante non. */
            onValider={(voulus) => ecrire(voulus, choixSuivi)}
            onFerme={() => { setPanneau('aucun'); setSelection(null); setConfirme(false); }}
            onGeste={onGeste}
            onChange={async () => { await charger(); }}
            /* ⚠️ PAS DE « Hors gestion, ou classer par pièce… » ICI : il ouvre LA fenêtre de classement, et deux
               boîtes de dialogue empilées sont injouables au clavier. Le bouton n'est donc pas rendu — plutôt
               qu'un bouton qui se contenterait de refermer le panneau, c'est-à-dire un bouton qui ment. */
            pied={(
              <div className="rdf-pied-panneau">
                {/* ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 2 — LES TROIS FENÊTRES, EN TROIS RADIOS ═══════════
                    DEMANDE D'ARNO (06/10/2026) : « Ajoute un vrai choix “Ce mail uniquement” (exception), avec
                    le même style radio et sa phrase d'explication, en PREMIÈRE position. Le choix par défaut
                    reste celui d'aujourd'hui. Le lien “Revenir à l'exception…” est remplacé par ce choix. »

                    🔴 CE QUE CELA REMPLACE, ET POURQUOI C'EST MIEUX : deux panneaux et deux liens qui se
                    renvoyaient la balle (« Changer plutôt la règle de suivi… » / « ← Revenir à l'exception sur
                    ce seul mail »). On ne pouvait comparer les trois règles qu'en cliquant, c'est-à-dire en
                    perdant de vue celle qu'on quittait — alors que c'est exactement la comparaison qui décide.

                    🔴 LES MOTS ET LES AIDES VIENNENT DE LA SOURCE (`CHOIX_SUIVI`), jamais d'une copie, et
                    l'ORDRE est celui du module pur — « Ce mail uniquement » y est déjà en premier.

                    ⚠️ AUCUNE RÈGLE NE CHANGE : mêmes trois fenêtres qu'avant, même porte d'écriture
                    (`/api/admin/gestion/suivi`), même avertissement obligatoire sur « Toute la conversation ». */}
                {/* ⚠️ EN MODE PONCTUEL, AUCUNE OPTION DE SUIVI N'EST AFFICHÉE NI PROPOSÉE (Arno, mot pour mot) —
                    pas même « Ce mail uniquement », qui est pourtant ce que le geste fait : un choix à une
                    seule option n'est pas un choix, c'est une case qu'on clique sans la lire. Le bandeau du
                    haut le dit mieux, et il le dit avant. */}
                {!ponctuel && (
                <fieldset className="rdf-suivi">
                  <legend className="rdf-suivi-titre">Suivi dans la conversation</legend>
                  {CHOIX_SUIVI.map((c) => (
                    <label className="rdf-choix" key={c.cle}>
                      <input type="radio" name="rdf-suivi" checked={choixSuivi === c.cle}
                        onChange={() => { setChoixSuivi(c.cle); setConfirme(false); }} />
                      <span>
                        <span className="rdf-suivi-mot">{c.mot}</span>
                        <span className="rdf-suivi-aide">{c.aide}</span>
                      </span>
                    </label>
                  ))}
                  {/* 🔴🔴 L'ENCADRÉ CLAIR D'ARNO, mot pour mot — et il ne paraît QUE sur le choix qu'il
                      explique. Permanent, il aurait démenti les deux autres options juste au-dessus. */}
                  {choixSuivi === 'mail' && (
                    <p className="rdf-encadre" role="note">{ENCADRE_EXCEPTION_CE_MAIL}</p>
                  )}
                  {choixSuivi === 'conversation' && (
                    <p className="rdf-alerte" role="status">
                      <span className="rdf-alerte-texte">{alerte}</span>
                      <label className="rdf-choix">
                        <input type="checkbox" checked={confirme} onChange={() => setConfirme((v) => !v)} />
                        <span>Je confirme le reclassement de toute la conversation.</span>
                      </label>
                    </p>
                  )}
                </fieldset>
                )}
                {/* ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 3 — LA LIGNE « ÉVÉNEMENT RATTACHÉ » ══════════════
                    DEMANDE D'ARNO : « Dans la ligne “ÉVÉNEMENT RATTACHÉ” de la fenêtre : “Lier à un événement”
                    (liste des événements du ou des biens cochés) et “Créer un événement”. […] L'événement créé
                    est lié au mail et au(x) bien(s) choisis au moment de “Valider le suivi”. “Annuler” ne crée
                    rien. »

                    🔴 LES DEUX MORCEAUX SONT RÉEMPLOYÉS, JAMAIS RECOPIÉS : `ChoisirEvenement` (la recherche de
                    partout ailleurs) et `ChampsEvenement` (le formulaire du bloc de l'encart, extrait pour cela).
                    Deux formulaires recopiés auraient divergé au premier ajustement.

                    ⚠️ RIEN N'EST ÉCRIT ICI : on note ce qu'on VEUT, et « Valider le suivi » l'écrit après les
                    biens — c'est à cette seule condition que la carte neuve peut recevoir les biens cochés, leur
                    propriétaire et leur locataire. */}
                {/* ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — BLOC 4 : UNE SEULE LIGNE REPLIABLE (Arno) ══════
                    « ▸ Événement rattaché : aucun / GES-… ». Dépliée, elle montre le contenu d'avant, à l'identique
                    (« Lier à un événement », « Créer un événement »). Les deux autres portes gardent la ligne ouverte. */}
                {(() => {
                  const contenuEvt = (
                    <>
                  {/* ══ 🔴🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET, PARTIE 3 — « ÉVÉNEMENTS EN COURS SUR CE BIEN » ══════════
                      EN TÊTE du contenu déplié (Arno), avant « Lier » et « Créer ». Une ligne par événement : capsule · ouvert le … · Étape : <dernière étape de sa frise, celle de sa
                      carte> · « Rattaché ✓ » ou la case « Rattacher ce mail ». Tri : urgence décroissante, puis
                      ouverture la plus récente. La case NOTE le lien (comme « Lier à un événement ») ; seul « Valider »
                      l'écrit — jamais de rattachement automatique.
                      ⚠️ UN MAIL NE PORTE QU'UN ÉVÉNEMENT EN BASE (un rattachement actif par message, index unique) :
                      une seule case peut donc être cochée ; cocher un événement quand le mail en porte déjà un le
                      REMPLACE à la validation, et la ligne le dit avant. */}
                  {listeOuverte.length > 0 && (
                    <div className="rdf-evt-liste">
                      <p className="rdf-evt-liste-titre">Événements en cours sur ce bien</p>
                      <ul className="rdf-evt-lignes">
                        {listeOuverte.map((e) => {
                          const etape = etapeEnMots(e.etape, e.ouvertLe);
                          const coche = evtVoulu?.sorte === 'lier' && evtVoulu.evenementId === e.id;
                          const ouvertLe = dateCourteIso(e.ouvertLe);
                          return (
                            <li key={e.id} className="rdf-evt-ligne">
                              <CapsuleEvenement e={e} />
                              <span className="rdf-evt-meta">
                                {ouvertLe !== null && <span>ouvert le {ouvertLe}</span>}
                                <span>Étape : {etape.mot}{etape.date !== null && etape.date !== '—' ? ` (${etape.date})` : ''}
                                  {etape.aConfirmer ? ' — à confirmer' : ''}</span>
                              </span>
                              {/* 🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — dans « Modifier le rattachement »
                                  (porte ponctuelle), LECTURE SEULE : « non rattaché » en simple texte ; la case
                                  « Rattacher ce mail » a déménagé dans la fenêtre « Événement de ce mail ». */}
                              {e.rattache
                                ? <span className="rdf-evt-rattache">Rattaché ✓</span>
                                : ponctuel ? <span className="rdf-evt-non-rattache">non rattaché</span> : (
                                  <label className="rdf-evt-cocher">
                                    <input type="checkbox" checked={coche}
                                      onChange={() => {
                                        setErreur(null);
                                        if (coche) { setEvtVoulu(null); return; }
                                        setPanneauEvt('aucun');
                                        setEvtVoulu({
                                          sorte: 'lier', evenementId: e.id, mot: `${e.reference} · ${e.objet}`,
                                          capsule: { reference: e.reference, objet: e.objet },
                                        });
                                      }} />
                                    <span>Rattacher ce mail</span>
                                    {coche && rattachesAffiches.length > 0 && (
                                      <span className="rdf-evt-remplace">
                                        {` — remplacera ${rattachesAffiches.map((x) => x.reference).join(', ')}`}
                                      </span>
                                    )}
                                  </label>
                                )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <p className="rdf-evt-tete">
                    {!ponctuel && <span className="rdf-suivi-titre">Événement rattaché</span>}
                    {evtDuMail === null && <span className="rdf-detail">lecture…</span>}
                    {/* 🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET, PARTIE 4 — UNE capsule par événement, jamais deux : un
                        rattaché EN COURS est dans la liste ci-dessous ; seul un rattaché qui n'y est pas (clos) se
                        nomme ici. */}
                    {rattachesHorsListe.map((e) => (
                      <span key={e.id} className="rdf-evt-nom"><CapsuleEvenement e={e} /></span>
                    ))}
                    {/* 🔴 « Aucun » EST UNE RÉPONSE : l'événement est facultatif, et il ne change jamais la
                        capsule de statut d'un mail (règle du lot STATUT-HORS-GESTION). */}
                    {evtDuMail !== null && rattachesAffiches.length === 0 && evtVoulu === null && (
                      <span className="rdf-detail">aucun — l’événement est facultatif</span>
                    )}
                    {/* 🔴 CE QUI SERA ÉCRIT À LA VALIDATION, DIT AVANT DE LA FAIRE. */}
                    {evtVoulu !== null && (
                      <span className="rdf-evt-voulu">
                        {evtVoulu.sorte === 'lier'
                          ? <>à lier : {voulueHorsListe !== null
                            ? <CapsuleEvenement e={voulueHorsListe} /> : evtVoulu.mot}</>
                          : `à créer : « ${evtVoulu.objet.trim()} »`}
                      </span>
                    )}
                    {/* 🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — en porte ponctuelle, « Lier à un événement »
                        et « Créer un événement » ont déménagé dans la fenêtre « Événement de ce mail » (bouton
                        « Événement » du mail déplié). Les deux autres portes les gardent ici, inchangés. */}
                    {!ponctuel && panneauEvt === 'aucun' && evtVoulu === null && (
                      <>
                        <button type="button" className="gst-lien-bouton"
                          onClick={() => { setPanneauEvt('lier'); setErreur(null); }}>
                          Lier à un événement
                        </button>
                        <button type="button" className="gst-lien-bouton"
                          onClick={() => {
                            setErreur(null);
                            /* Le titre part du premier bien coché : c'est ce qu'on écrirait à la main neuf
                               fois sur dix. Il reste entièrement modifiable. */
                            const premiere = (selection ?? clesDuMail)[0];
                            setEvtTitre(premiere === undefined ? '' : (libellesDuMail[premiere] ?? premiere));
                            /* 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — « préremplie à la date du mail quand on
                               vient d'un mail, sinon aujourd'hui » (Arno). Cette fenêtre porte TOUJOURS sur un
                               mail, et son en-tête en donne la date ; le repli n'existe que si la fiche n'a pas
                               encore répondu. */
                            setEvtOuvertLe(jourDuMailDeLaFenetre ?? jourParis(new Date()));
                            setEvtClosLe('');
                            setEvtNote('');
                            setPanneauEvt('creer');
                          }}>
                          Créer un événement
                        </button>
                      </>
                    )}
                    {/* ⚠️ SE DÉDIRE EST TOUJOURS POSSIBLE, ET RIEN N'A ÉTÉ ÉCRIT : « Annuler ne crée rien ». */}
                    {evtVoulu !== null && (
                      <button type="button" className="gst-lien-bouton"
                        onClick={() => { setEvtVoulu(null); setPanneauEvt('aucun'); }}>
                        Annuler l’événement
                      </button>
                    )}
                  </p>
                  {panneauEvt === 'lier' && (
                    <div className="rdf-evt-forme">
                      {/* 🔴 LA LISTE EST BORNÉE AUX ÉVÉNEMENTS DES BIENS COCHÉS (demande d'Arno) — par la route
                          qui répond déjà à cette question. Aucun bien coché ⇒ aucune restriction : on ne peut
                          pas borner à l'ensemble vide une liste dont on ne sait rien. */}
                      <ChoisirEvenement choisi={null} autoFocus
                        exclure={evtDuMail?.evenement?.evenementId ?? null}
                        restreindreA={evtsDesBiens}
                        motSiRestreintVide="Aucun événement sur le ou les biens cochés — « Créer un événement » en ouvre un."
                        onChoisir={(id, trouve) => {
                          if (id === null) return;
                          /* 🔴 ON LE NOMME AVEC SES PROPRES MOTS : « à lier : GES-2026-000012 · Fuite ». Un
                             numéro seul n'aurait rien dit avant de valider. */
                          setEvtVoulu({
                            sorte: 'lier',
                            evenementId: id,
                            mot: trouve == null ? `événement n° ${id}` : `${trouve.reference} · ${trouve.objet}`,
                            ...(trouve == null ? {} : { capsule: { reference: trouve.reference, objet: trouve.objet } }),
                          });
                          setPanneauEvt('aucun');
                        }} />
                      <div className="rdf-evt-boutons">
                        <button type="button" className="svv-btn svv-btn-outline gst-btn"
                          onClick={() => setPanneauEvt('aucun')}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}

                  {panneauEvt === 'creer' && (
                    <div className="rdf-evt-forme">
                      <ChampsEvenement titre={evtTitre} onTitre={setEvtTitre}
                        categorie={evtCategorie} onCategorie={setEvtCategorie}
                        urgence={evtUrgence} onUrgence={setEvtUrgence}
                        qualifieDisponible={evtDuMail?.qualifie === true}
                        libellesDesBiens={(selection ?? clesDuMail).map((c) => libellesDuMail[c] ?? c)}
                        ouvertLe={evtOuvertLe} onOuvertLe={setEvtOuvertLe}
                        closLe={evtClosLe} onClosLe={setEvtClosLe}
                        note={evtNote} onNote={setEvtNote}
                        bienCles={selection ?? clesDuMail} concernes={evtConcernes} onConcernes={setEvtConcernes} />
                      <div className="rdf-evt-boutons">
                        {/* ⚠️ « Annuler » NE CRÉE RIEN, et ne garde rien : demande d'Arno, mot pour mot. */}
                        <button type="button" className="svv-btn svv-btn-outline gst-btn"
                          onClick={() => { setPanneauEvt('aucun'); setEvtVoulu(null); }}>
                          Annuler
                        </button>
                        {/* 🔴 IL NE CRÉE PAS : il NOTE. La création part avec « Valider le suivi ». */}
                        <button type="button" className="svv-btn svv-btn-outline gst-btn"
                          disabled={evtTitre.trim() === '' || bornesEvenement(evtOuvertLe, evtClosLe).refus !== null}
                          onClick={() => {
                            const bornes = bornesEvenement(evtOuvertLe, evtClosLe);
                            if (bornes.refus !== null) { setErreur(bornes.refus); return; }
                            setEvtVoulu({
                              sorte: 'creer', objet: evtTitre, categorie: evtCategorie, urgence: evtUrgence,
                              ouvertLe: bornes.ouvertLe,
                              closLe: bornes.closLe,
                              note: evtNote.trim() === '' ? null : evtNote.trim(),
                              concernes: evtConcernes,
                            });
                            setPanneauEvt('aucun');
                          }}>
                          Garder pour la validation
                        </button>
                      </div>
                    </div>
                  )}
                  {/* 🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — la phrase d'Arno, en bas du bloc en lecture. */}
                  {ponctuel && <p className="rdf-detail rdf-evt-renvoi">{renvoiEvenement}</p>}
                    </>
                  );
                  if (!ponctuel) return <div className="rdf-evt">{contenuEvt}</div>;
                  /* 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE — EN PORTE PONCTUELLE, LE BLOC EST EN LECTURE SEULE, et c'est un
                     composant PARTAGÉ (`BlocEvenementLecture`) : le composeur rend le même. Repliée, la ligne dit toujours
                     la vérité complète (lot BLOC-EVENEMENT-RATTACHE-COMPLET, parties 1 à 4). */
                  return (
                    <BlocEvenementLecture lus={evtDuMail?.lus ?? null} evenement={evtDuMail?.evenement ?? null}
                      charge={evtDuMail === null} renvoi={renvoiEvenement}
                      ouvert={blocEvtOuvert} onOuvert={setBlocEvtOuvert} />
                  );
                })()}
                {/* 🔴 CE QUE LA VALIDATION VA ÉCRIRE, DIT AVANT DE LA FAIRE — « Aucun changement » compris. */}
                {/* ⚠️ `rdf-bilan`, PAS `rdf-resume` : ce dernier est déjà le dépliant « Voir le détail par mail »
                    de chaque bien. Deux sens pour une classe, c'est un style qu'on croit changer ici et qui
                    bouge là-bas. */}
                {!ponctuel && (
                <p className="rdf-detail rdf-bilan" role="status">
                  {resumeModificationBiens({ avant: clesDuMail, apres: selection ?? clesDuMail })}
                </p>
                )}
                {/* 🔴🔴 LOT GESTION-EXPEDITEUR-INCONNU — l'interrupteur, AVANT la portée et son bouton de validation. */}
                {ponctuel && inconnu && (
                  <InterrupteurExpediteur actif={affecter} onChange={setAffecter} desactive={occupeParLAppelant} />
                )}
                {ponctuel && blocPortee}
                {/* ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 1 — LES DEUX ACTIONS SECONDAIRES DU PIED ══════════
                    ACCORD D'ARNO : « “Classer sans suite” et “Classer dans une carte” deviennent deux actions
                    secondaires en pied de fenêtre, même effet qu'aujourd'hui, par le même code. »

                    🔴 SECONDAIRES VEUT DIRE SECONDAIRES : en liens discrets, SOUS le bilan, loin du bouton
                    vert. Ce ne sont pas des façons de valider la fenêtre — ce sont deux autres décisions, qui
                    la quittent. Les habiller en boutons les aurait mises à égalité avec « Valider le suivi ». */}
                {/* ══ 🔴🔴 LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — « AUTRES CLASSEMENTS » (Arno) ══════════════════════
                    Dans la fenêtre commune, les gestes de l'ancienne « Rattacher ce mail à… » (« Hors gestion, ou
                    classer par pièce… », « Classer dans une carte », « Classer sans suite ») forment un bloc en bas,
                    sous la portée. Mêmes actions qu'avant : l'appelant les fournit, la fenêtre ne fait que les montrer. */}
                {ponctuel && actionsDePied.length > 0 && (
                  <section className="rdf-autres" aria-labelledby="rdf-autres-titre">
                    <p className="rdf-suivi-titre" id="rdf-autres-titre">Autres classements</p>
                    <p className="rdf-pied-actions">
                      {actionsDePied.map((a) => (
                        <button key={a.cle} type="button" className="gst-lien-bouton" onClick={a.onChoisir}>
                          {a.libelle}
                        </button>
                      ))}
                    </p>
                  </section>
                )}
                {!ponctuel && actionsDePied.length > 0 && (
                  <p className="rdf-pied-actions">
                    {actionsDePied.map((a) => (
                      <button key={a.cle} type="button" className="gst-lien-bouton" onClick={a.onChoisir}>
                        {a.libelle}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            )} />
        )}

        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}
        {erreurDeLAppelant !== null && <p className="gst-tronc" role="alert">{erreurDeLAppelant}</p>}

        {/* ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — LA QUESTION D'ARNO, MOT POUR MOT ═══════════════════
            « Ce mail est marqué Interne : rattacher ce bien retirera la marque Interne » avec Confirmer /
            Annuler. La phrase vient du module PUR : elle n'est pas recopiée ici.

            ⚠️ PAS DE CHOIX DE FENÊTRE DANS CE PANNEAU : elle est déjà choisie — c'est celle du geste qu'on est en
            train de valider, et Arno écrit « selon la MÊME fenêtre choisie ». */}
        {demandeLevee !== null && (
          <div className="ert-interne-panneau" role="group"
            aria-label="Confirmer la levée de la marque « interne »">
            <p className="ert-interne-mot">{demandeLevee.message}</p>
            <p className="ert-interne-note">
              {demandeLevee.mails.length > 1
                ? `La fenêtre choisie porte sur ${demandeLevee.mails.length} mails marqués « interne » : la `
                  + 'marque sera retirée de chacun.'
                : 'La marque sera retirée de ce mail.'}
              {' La marque de la CONVERSATION n’est pas touchée : si elle en porte une, les réponses à venir '
                + 'resteront internes — un clic sur la case verte la retire.'}
            </p>
            <p className="ert-interne-note">
              Rien n’est supprimé : la marque reste en base, datée et signée, et « Annuler » la remet.
            </p>
            <div className="ert-interne-boutons">
              <button type="button" className="svv-btn svv-btn-primary gst-btn"
                onClick={() => {
                  const g = demandeLevee.geste;
                  const leves = demandeLevee.mails;
                  setDemandeLevee(null);
                  void ecrire(g.voulus, g.choix, leves);
                }}>
                Confirmer
              </button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => setDemandeLevee(null)}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* 🔴 APRÈS LE GESTE : la sortie, quelques secondes. Elle défait les DEUX moitiés — le rattachement posé
            ET la marque levée. Remettre l'une sans l'autre reconstruirait « Interne avec un bien ». */}
        {leveeFaite !== null && (
          <div className="ert-interne-panneau ert-interne-panneau--fait" role="status">
            <p className="ert-interne-mot">{motApresLevee(leveeFaite.mails.length)}</p>
            <div className="ert-interne-boutons">
              <button type="button" className="svv-btn svv-btn-outline gst-btn"
                onClick={() => { void annulerLevee(); }}>
                Annuler — remettre la marque « interne »
              </button>
            </div>
          </div>
        )}

        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE — LE BLOC « ÉVÉNEMENT RATTACHÉ » EN LECTURE, UN SEUL DESSIN POUR LES DEUX ══════
 * Extrait tel quel de la porte ponctuelle de « Modifier le rattachement » (lots BLOC-EVENEMENT-RATTACHE-COMPLET et
 * BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE) : une ligne repliable qui dit la vérité complète ; dépliée, les événements
 * EN COURS sur le bien (capsule, ouverture, étape, « Rattaché ✓ » ou « non rattaché »), puis la phrase qui dit où sont
 * les gestes. AUCUN GESTE ICI : lier ou créer un événement se fait ailleurs (phrase `renvoi`).
 */
export function BlocEvenementLecture({ lus, evenement, charge, renvoi, ouvert, onOuvert }: {
  lus: { rattaches: EvenementLu[]; duBien: EvenementLu[] } | null;
  /** L'événement posé sur le mail, quand la route le connaît hors de toute période (gris). */
  evenement: EvenementDuMail | null;
  /** Vrai tant que la lecture n'a pas répondu (« lecture… »). */
  charge: boolean;
  renvoi: string;
  ouvert: boolean;
  onOuvert: (o: boolean) => void;
}) {
  /* 🔴 LOT EVENEMENT-RATTACHE-COHERENT — le même calcul que la pastille de la ligne (`lectureEvenement`). */
  const lecture = lectureEvenement(lus?.rattaches ?? [], lus?.duBien ?? []);
  const rattachesAffiches: EvenementLu[] = (lus?.rattaches ?? []).length > 0
    ? trierParUrgence(lus?.rattaches ?? [])
    : (evenement ? [{
      id: evenement.evenementId, reference: evenement.reference, objet: evenement.objet,
      ouvert: false, categorie: evenement.categorie, urgence: evenement.urgence,
    }] : []);
  const listeOuverte = listeEnCours(lecture);
  const rattachesHorsListe = rattachesAffiches.filter((e) => !listeOuverte.some((x) => x.id === e.id));
  const contenu = (
    <>
      {listeOuverte.length > 0 && (
        <div className="rdf-evt-liste">
          <p className="rdf-evt-liste-titre">Événements en cours sur ce bien</p>
          <ul className="rdf-evt-lignes">
            {listeOuverte.map((e) => {
              const etape = etapeEnMots(e.etape, e.ouvertLe);
              const ouvertLe = dateCourteIso(e.ouvertLe);
              return (
                <li key={e.id} className="rdf-evt-ligne">
                  <CapsuleEvenement e={e} />
                  <span className="rdf-evt-meta">
                    {ouvertLe !== null && <span>ouvert le {ouvertLe}</span>}
                    <span>Étape : {etape.mot}{etape.date !== null && etape.date !== '—' ? ` (${etape.date})` : ''}
                      {etape.aConfirmer ? ' — à confirmer' : ''}</span>
                  </span>
                  {e.rattache
                    ? <span className="rdf-evt-rattache">Rattaché ✓</span>
                    : <span className="rdf-evt-non-rattache">non rattaché</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="rdf-evt-tete">
        {charge && <span className="rdf-detail">lecture…</span>}
        {rattachesHorsListe.map((e) => (
          <span key={e.id} className="rdf-evt-nom"><CapsuleEvenement e={e} /></span>
        ))}
        {!charge && rattachesAffiches.length === 0 && (
          <span className="rdf-detail">aucun — l’événement est facultatif</span>
        )}
      </p>
      <p className="rdf-detail rdf-evt-renvoi">{renvoi}</p>
    </>
  );
  const resume = resumeBlocEvenement(lecture, rattachesAffiches);
  const etatEvt = ouvert ? null
    : charge ? <span className="rdf-evt-etat rdf-evt-aucun">lecture…</span>
      : resume.cas === 'aucun'
        ? <span className="rdf-evt-etat"><span className="rdf-evt-aucun">aucun</span></span>
        : (
          <span className="rdf-evt-etat">
            {resume.cas === 'en_cours_sur_le_bien' && <span className="rdf-evt-aucun">{resume.mot}</span>}
            {resume.capsules.map((e) => <CapsuleEvenement key={e.id} e={e} />)}
            {resume.cas === 'rattache' && resume.mot !== null && (
              <span className="rdf-evt-autres">{resume.mot}</span>
            )}
          </span>
        );
  return (
    <details className="rdf-evt rdf-evt-repli rdf-evt-bloc" open={ouvert}
      onToggle={(ev) => onOuvert(ev.currentTarget.open)}>
      <summary className="rdf-evt-resume">
        {/* « ÉVÉNEMENT RATTACHÉ : aucun » — le deux-points reste collé au titre, même quand la suite passe à la ligne. */}
        <span className="rdf-evt-titre">Événement rattaché{etatEvt !== null
          && resume.cas !== 'rattache' && !charge ? ' :' : ''}</span>
        {etatEvt}
        <span className="rdf-evt-chevron" aria-hidden="true" />
      </summary>
      {contenu}
    </details>
  );
}

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE — LE BLOC « PORTÉE DU SUIVI », UN SEUL DESSIN POUR LES DEUX FENÊTRES ══════════
 * Extrait tel quel de « Modifier le rattachement » (lot MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS) : glissière, question
 * du retour à « Origine », définition de la position, confirmation de « Toute la conversation », bouton final. Le
 * composeur rend le même composant : la fenêtre est la même parce que c'est le même code.
 */
export function BlocPortee({
  position, modification, premier, nbCoches, demandeOrigine, onChoisir, onOuiOrigine, onNonOrigine,
  confirmation, confirme, onConfirme, bouton, desactive, onValider, sansBouton = false, sansPosition = false,
}: {
  position: PositionPortee;
  /** 🔴 LOT RATTACHEMENT-CONVERSATION — règle C : aucune position présélectionnée (glissière vide, texte d'invite). */
  sansPosition?: boolean;
  modification: boolean;
  premier: boolean;
  nbCoches: number;
  demandeOrigine: boolean;
  onChoisir: (p: PositionPortee) => void;
  onOuiOrigine: () => void;
  onNonOrigine: () => void;
  /** La phrase de ④ (« N mails de cette conversation seront mis à jour… ») ; `null` = pas de confirmation à demander. */
  confirmation: string | null;
  confirme: boolean;
  onConfirme: () => void;
  bouton: { mot: string; aspect: 'plein' | 'vide'; inactif: boolean; mention: string | null };
  desactive: boolean;
  onValider: () => void;
  /** Le composeur pose le bouton final dans son pied (celui qui valide les biens) : il n'est pas rendu ici. */
  sansBouton?: boolean;
}) {
  return (
    <div className="rdf-portee">
      <style>{CSS_GLISSIERE_PORTEE}</style>
      <p className="rdf-suivi-titre">Portée du suivi</p>
      {/* 🔴 Au premier classement, les quatre positions se choisissent d'emblée (`glissiereOuverte`). */}
      {/* 🔴 LOT PREMIER-RATTACHEMENT-SANS-ORIGINE — au premier rattachement, « Origine » grisée, avec sa bulle. */}
      <GlissierePortee position={sansPosition ? null : position} modification={glissiereOuverte(modification, premier)}
        onChoisir={onChoisir} origineInterdite={premier ? BULLE_ORIGINE_PREMIER : null} />
      {demandeOrigine && (
        <div className="rdf-portee-question" role="alertdialog" aria-label={QUESTION_RETOUR_ORIGINE}>
          <p className="rdf-portee-question-mot">{QUESTION_RETOUR_ORIGINE}</p>
          <div className="rdf-evt-boutons">
            <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={onOuiOrigine}>Oui</button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onNonOrigine}>
              Non
            </button>
          </div>
        </div>
      )}
      {/* 🔴 LA DÉFINITION DE LA POSITION, mot pour mot (Arno). */}
      <p className={`rdf-portee-definition rdf-portee-definition--${position}`} role="note">
        {/* 🔴 ③ porte le nombre de biens cochés, en direct (lot ACCOLADE-AU-MAIL-DECLENCHEUR-ET-LIBELLES). */}
        {/* 🔴 LOT BULLE-BIENS-RATTACHES — « suivi de fond » en gras dans ③ (Arno). */}
        {sansPosition ? DEFINITION_A_CHOISIR : morceauxDefinitionPortee(position, nbCoches, premier)
          .map((m, i) => (m.fort ? <strong key={i}>{m.texte}</strong> : <span key={i}>{m.texte}</span>))}
      </p>
      {/* 🔴 ④ — LA CONFIRMATION AVANT VALIDATION, avec le nombre de mails mis à jour. */}
      {confirmation !== null && (
        <div className="rdf-alerte" role="status">
          <span className="rdf-alerte-texte">{confirmation}</span>
          <label className="rdf-choix">
            <input type="checkbox" checked={confirme} onChange={onConfirme} />
            <span>{MOT_CONFIRMER_CONVERSATION}</span>
          </label>
        </div>
      )}
      {!sansBouton && (
        <button type="button"
          className={`svv-btn gst-btn rdf-valider-portee ${bouton.aspect === 'vide' ? 'svv-btn-outline rdf-valider-portee--vide' : 'svv-btn-primary'}`}
          disabled={desactive}
          aria-disabled={bouton.inactif ? true : undefined}
          onClick={onValider}>
          {bouton.mot}
        </button>
      )}
      {!sansBouton && bouton.mention !== null && <p className="rdf-valider-mention" role="note">{bouton.mention}</p>}
    </div>
  );
}

/** UN BIEN : sa fiche, ses personnes, ses gestes. */
function BlocBien({
  bien, dossierId, liens, onModifier, ponctuel = false, surUnSeulMail = false, garde, onGarder, onDrive,
  expediteurMail = null,
}: {
  bien: BienRattache;
  /** 🔴 LOT PILULE-TROIS-TRAITS-ET-EXPEDITEUR-PARTOUT — l'expéditeur du mail affiché (« Expéditeur : … »). */
  expediteurMail?: ExpediteurDuMail | null;
  dossierId: string | null;
  liens: LienAffiche[];
  onModifier: (l: LienAffiche) => void;
  /** 🔴 « Il est marqué “ajout ponctuel” dans la fenêtre » (Arno). Voir `MOTIF_AJOUT_PONCTUEL`. */
  ponctuel?: boolean;
  /** Ouverte sur un mail : la carte ne parle que de lui, et n'annonce pas « sur N mails de la conversation ». */
  surUnSeulMail?: boolean;
  /**
   * ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — LA CASE DE LA CARTE ════════════════════════════════
   *
   * DEMANDE D'ARNO (03/10/2026) : « quand on clique “Modifier les biens rattachés à ce mail”, chaque CARTE de
   * bien du haut reçoit une CASE, cochée par défaut (= reste rattaché), à gauche de l'adresse. La décocher = ce
   * bien sera retiré à la validation (carte estompée, mention “sera retiré”). La recocher = rétabli. »
   *
   * 🔴 C'EST LA MÊME DÉCISION QUE LA ZONE QU'ELLE REMPLACE, mais prise LÀ OÙ LE BIEN EST DÉCRIT : on décoche le
   * bien qu'on a sous les yeux, avec son adresse, son lot, ses personnes — et non une ligne d'adresse répétée
   * trente centimètres plus bas.
   *
   * ⚠️ `undefined` ⇒ AUCUNE CASE, et la carte est exactement celle d'avant ce lot : c'est son état hors du
   * panneau de modification, et celui de tous les autres écrans qui l'emploient.
   */
  garde?: boolean;
  onGarder?: () => void;
  /**
   * 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 a) — « Ouvrir le Drive du bien ». La carte DEMANDE,
   * elle n'ouvre pas : la fenêtre Drive prend la place de toute la boîte de dialogue, c'est donc à celle-ci de
   * décider. Voir l'encadré du rendu dans `RattachementsDuFil`.
   */
  onDrive?: (dossier: { id: string; nom: string }) => void;
}) {
  /** L'identifiant du dossier Drive, ou `null` : c'est LA question du premier bouton. */
  const dossier = idDossierDrive(dossierId);
  /** L'adresse de la fiche du bien, ou `null` : celle du second. */
  const histo = adresseHistoriqueDuBien(bien.lotId);
  const avecCase = garde !== undefined && onGarder !== undefined;
  /* 🔴 LA CARTE S'ESTOMPE quand elle ne sera plus là : la mention le DIT, l'opacité ne fait que l'appuyer. */
  const retire = avecCase && garde === false;
  return (
    <section className={retire ? 'rdf-item rdf-item--retire' : 'rdf-item'} aria-label={bien.adresseComplete}>
      <div className="rdf-tete">
        {avecCase && (
          <input type="checkbox" className="rdf-garde" checked={garde} onChange={onGarder}
            title={garde ? 'Décocher pour retirer ce bien de ce mail' : 'Recocher pour le garder'}
            aria-label={`Garder « ${bien.adresseComplete} » rattaché à ce mail`} />
        )}
        <span className="rdf-cible">{bien.adresseComplete}</span>
        {/* 🔴 « SERA RETIRÉ » EST ÉCRIT, jamais seulement grisé : un aplat ne se lit ni en niveaux de gris, ni au
            lecteur d'écran — et c'est une décision qu'on vient de prendre, elle doit se relire. */}
        {retire && <span className="rdf-sera-retire">sera retiré</span>}
        {/* 🔴 L'AJOUT PONCTUEL SE DIT EN MOTS, à côté du statut : il ne se devine à aucune couleur, et c'est la
            seule façon de savoir pourquoi ce bien est là alors que la conversation ne le porte pas. */}
        {ponctuel && <span className="rdf-ponctuel">{MENTION_AJOUT_PONCTUEL}</span>}
        {/* Le MOT est toujours écrit ; la couleur ne fait que l'appuyer. */}
        <span className={`rdf-statut rdf-statut--${bien.statut}`}>{motStatutBien(bien.statut)}</span>
      </div>

      {/* 🔴 LES CARACTÉRISTIQUES, DANS L'ORDRE OÙ ON LES CHERCHE. La surface est DITE absente quand elle l'est —
          l'export WIPPIMMO n'en porte aucune —, jamais devinée d'après le type. */}
      <p className="rdf-detail rdf-caract">
        <span>lot {bien.numeroLot}</span>
        {bien.nature !== null && <span>{bien.nature}</span>}
        {bien.typeBien !== null && <span>{bien.typeBien}</span>}
        <span className={bien.surfaceM2 === null ? 'rdf-absent' : undefined}>{motSurface(bien.surfaceM2)}</span>
        {!surUnSeulMail && (
          <span>sur {bien.nbMails} mail{bien.nbMails > 1 ? 's' : ''} de la conversation</span>
        )}
      </p>

      {/* ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — LES DEUX GRANDS BOUTONS DE LA CARTE ═════════
          RÈGLE D'ARNO : « DEUX boutons rouges allongés côte à côte, remplissant ensemble la largeur de la carte,
          à la place de la ligne “Ouvrir le dossier du bien ↗ — dans Google Drive, en lecture”. […] Les deux
          boutons tiennent sur mobile (empilés si nécessaire). »

          🔴 CE QUE LA LIGNE REMPLACÉE FAISAIT DE MOINS. Elle sortait de l'application : on perdait le mail, les
          gardes de l'archive n'existent pas chez Google, et le retour passait par un onglet à refermer. Et elle
          ne proposait RIEN pour l'autre question qu'on se pose devant un bien — « que s'est-il passé ici ? ».

          ⚠️ LA LARGEUR SE PARTAGE EN DEUX PARTS ÉGALES (`flex:1 1 0` sur chacun), et non « au contenu » : deux
          boutons de largeurs différentes se liraient comme un bouton principal et un bouton secondaire, alors
          que ce sont deux chemins de même rang. */}
      <div className="rdf-raccourcis">
        {/* a) 🔒 LE DOSSIER DU BIEN, DANS NOTRE OUTIL — ou, s'il est inconnu, le MOT qui le dit, éteint. */}
        {dossier === null ? (
          <button type="button" className="svv-btn svv-btn-primary gst-btn rdf-raccourci" disabled
            title={AIDE_DRIVE_ABSENT} aria-label={AIDE_DRIVE_ABSENT}>
            {MOT_DRIVE_ABSENT}
          </button>
        ) : (
          <button type="button" className="svv-btn svv-btn-primary gst-btn rdf-raccourci"
            title={AIDE_DRIVE_DU_BIEN}
            /* ⚠️ LE NOM PASSÉ N'EST QU'UNE ATTENTE : le serveur rend la chaîne complète des parents avec son
               listing, et le fil d'Ariane de la fenêtre Drive se corrige de lui-même (lot RANGER-ARBRE-2). */
            onClick={() => onDrive?.({ id: dossier, nom: `${bien.adresseComplete} — lot ${bien.numeroLot}` })}>
            {MOT_DRIVE_DU_BIEN}
          </button>
        )}
        {/* b) 🔴 LA FICHE DU BIEN ET SON « Vie du bien » — une NAVIGATION ordinaire, dans l'application.
            C'est elle qui fait tenir la promesse d'Arno : « la flèche retour revient à la fenêtre ou au mail
            d'origine (règle existante) ». Voir `adresseHistoriqueDuBien`. */}
        {histo === null ? (
          <button type="button" className="svv-btn svv-btn-primary gst-btn rdf-raccourci" disabled
            title={AIDE_HISTORIQUE_ABSENT} aria-label={AIDE_HISTORIQUE_ABSENT}>
            {MOT_HISTORIQUE_DU_BIEN}
          </button>
        ) : (
          <a className="svv-btn svv-btn-primary gst-btn rdf-raccourci" href={histo}
            title={AIDE_HISTORIQUE_DU_BIEN}>
            {MOT_HISTORIQUE_DU_BIEN}
          </a>
        )}
      </div>

      <CorpsDuBien bien={bien} liens={liens} onModifier={onModifier} expediteurMail={expediteurMail} />
    </section>
  );
}

/**
 * ══ 🔴 LE CORPS D'UNE CARTE DE BIEN : ses personnes (l'expéditeur en tête), « vacant », « Aujourd'hui », et le détail
 * par mail. Extrait TEL QUEL de `BlocBien` (lot MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS) pour être rendu aussi dans la
 * ligne repliable des cartes de « Modifier le rattachement » — un seul dessin, deux places.
 */
function CorpsDuBien({ bien, liens, onModifier, expediteurMail = null, sansCartoucheExpediteur = false }: {
  bien: BienRattache; liens: LienAffiche[]; onModifier: (l: LienAffiche) => void;
  /**
   * 🔴🔴 LOT PILULE-TROIS-TRAITS-ET-EXPEDITEUR-PARTOUT (Arno, 12/10/2026) — « Expéditeur : <nom> » sur la SEULE personne
   * qui porte l'adresse De: de ce mail précis ; plus jamais « a écrit un jour dans la conversation ».
   */
  expediteurMail?: ExpediteurDuMail | null;
  /**
   * `true` dans la ligne repliable des cartes de « Bien(s) rattaché(s) à ce mail » : le cartouche est déjà sur la ligne
   * du bien, la fiche dépliée ne le répète pas (un seul cartouche visible par bien).
   */
  sansCartoucheExpediteur?: boolean;
}) {
  const iExpediteur = sansCartoucheExpediteur ? -1 : indexExpediteur(bien.personnes, expediteurMail);
  /**
   * 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 2 — FAUT-IL AJOUTER « Aujourd'hui : … » ?
   *
   * `null` = non, et c'est le cas le plus fréquent : l'occupant n'a pas changé depuis le mail, la ligne ne
   * répéterait que ce qui est écrit juste au-dessus. La décision est PURE et éprouvée sans écran — la carte ne
   * fait que l'écrire.
   */
  const aujourdhui = occupantsAujourdhuiADire(
    bien.personnes.filter((p) => p.role === 'locataire'), bien.occupantsAujourdhui,
  );
  return (
    <>
      {/* ══ 🔴 LES PERSONNES, L'EXPÉDITEUR EN TÊTE ═════════════════════════════════════════════════════════ */}
      {bien.personnes.filter((p) => p.role === 'proprietaire').length === 0 && (
        <p className="rdf-detail rdf-absent">Aucun propriétaire connu pour ce lot dans l’annuaire.</p>
      )}
      {bien.personnes.map((p, i) => (
        <CartePersonne key={`${p.role}-${p.cle}`} personne={p}
          nomExpediteur={i === iExpediteur && expediteurMail !== null ? expediteurMail.nom : null} />
      ))}
      {/* 🔴 « VACANT À CETTE DATE » EST UNE RÉPONSE, pas un vide : il explique pourquoi le mail vient du bailleur. */}
      {bien.personnes.filter((p) => p.role === 'locataire').length === 0 && (
        <p className="rdf-detail rdf-absent">{motSansLocataire(bien.dateMail)}</p>
      )}
      {/* ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 2 — « AUJOURD'HUI », QUAND CE N'EST PLUS LA MÊME PERSONNE ══

          DEMANDE D'ARNO : « Si l'occupant d'aujourd'hui est différent, ajoute une petite ligne discrète
          “Aujourd'hui : <nom>” avec sa fiche annuaire. »

          🔴 ELLE N'APPARAÎT QUE QUAND ELLE APPREND QUELQUE CHOSE. Sans ce filtre, la fenêtre porterait la ligne
          sur les 11 617 couples où rien n'a changé pour servir les 89 où quelque chose a changé.

          🔴 « vacant » EST UN MOT, et il compte autant qu'un nom : il dit qu'on ne peut plus joindre personne à
          cette adresse aujourd'hui, ce que le silence laisserait croire l'inverse.

          ⚠️ LE NOM EST CLIQUABLE QUAND LA FICHE EXISTE, et seulement alors — `adresseFicheAnnuaire` rend `null`
          sans identifiant interne, et un lien mort serait pire que du texte. */}
      {aujourdhui !== null && (
        <p className="rdf-detail rdf-aujourdhui">
          {aujourdhui.length === 0 ? motAujourdhui(aujourdhui) : (
            <>
              {'Aujourd’hui : '}
              {aujourdhui.map((o, i) => {
                const vers = adresseFicheAnnuaire({ role: 'locataire', id: o.id });
                return (
                  <span key={`${o.cle}-${o.id ?? 'x'}`}>
                    {i > 0 && ', '}
                    {vers === null ? o.nom : (
                      <a href={vers} className="rdf-lien" title={`Fiche annuaire de ${o.nom}`}>{o.nom}</a>
                    )}
                  </span>
                );
              })}
            </>
          )}
        </p>
      )}

      {/* LE DÉTAIL PAR MAIL, REPLIÉ : chaque mail, sa règle, sa date, son auteur, et son propre « Modifier ». */}
      {liens.length > 0 && (
        <details className="rdf-detail-mails">
          <summary className="rdf-resume">Voir le détail par mail</summary>
          <ul className="rdf-sous-liste">
            {liens.map((l) => (
              <li key={l.id} className="rdf-sous-item">
                <span className="rdf-detail">
                  {motSorteLong(l.cible.sorte)} · mail nº {l.messageId}
                  {' · '}{l.statut === 'confirme' ? 'confirmé' : 'proposé'}
                  {' · '}{l.origine === 'manuel' ? 'posé à la main' : 'posé automatiquement'}
                  {l.regle ? ` · règle ${l.regle}` : ''}
                  {l.creeLe ? ` · ${dateHeureComplete(l.creeLe)}` : ''}
                  {l.creePar ? ` · ${l.creePar}` : ''}
                  {l.pieceId !== null ? ' · cette pièce jointe seulement' : ''}
                </span>
                <button type="button" className="gst-lien-bouton" onClick={() => onModifier(l)}>
                  Modifier ce rattachement…
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — UN BIEN SUIVI, AU FORMAT DES CARTES DU COMPOSANT PARTAGÉ ═══════
 *
 * DEMANDE D'ARNO (11/10/2026) : « Chaque bien déjà rattaché est présenté au format des cartes de ListeBiensACocher :
 * case, titre “adresse — nature · type”, “i”, PROPRIÉTAIRE, LOCATAIRE (à la date du mail), motif. Sous la carte, une
 * ligne repliable unique avec le nom du propriétaire. Dépliée, elle montre le détail actuel […]. La capsule rouge
 * “EXPÉDITEUR” reste affichée à côté de la partie qui a envoyé le mail, y compris sur la ligne repliée. »
 *
 * 🔴 RIEN DU DÉTAIL N'EST PERDU : la ligne repliable rend `CorpsDuBien` — le même que la carte d'avant — précédé du
 * statut, de la mention « ajout ponctuel » et des caractéristiques (lot, nature, type, surface).
 * 🔴 SEULS « Ouvrir le Drive du bien » ET « Historique du bien » N'Y SONT PAS (accord d'Arno, pour cette modale) : ils
 * restent sur la carte des deux autres portes et ailleurs dans l'application.
 */
function CarteBienSuivi({ bien, titre, liens, garde, onGarder, onModifier, ponctuel = false, expediteurMail = null, oneShot = false }: {
  bien: BienRattache;
  /** 🔴 LOT GESTION-SUIVI-MIXTE — ce bien est rattaché à ce mail en One shot (cartouche rouge sur fond blanc). */
  oneShot?: boolean;
  /** 🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — l'expéditeur du mail affiché. */
  expediteurMail?: ExpediteurDuMail | null;
  /** « ajout ponctuel » (voir `MOTIF_AJOUT_PONCTUEL`). */
  ponctuel?: boolean;
  titre: string;
  liens: LienAffiche[];
  /** `undefined` ⇒ aucune case (hors modification). */
  garde?: boolean;
  onGarder?: () => void;
  onModifier: (l: LienAffiche) => void;
}) {
  const avecCase = garde !== undefined && onGarder !== undefined;
  const retire = avecCase && garde === false;
  const proprios = bien.personnes.filter((p) => p.role === 'proprietaire');
  const locataires = bien.personnes.filter((p) => p.role === 'locataire');
  /**
   * 🔴🔴 LOT PILULE-ROUGE-MAISON-EXPEDITEUR-UNIQUE-TRAME-VERTE — LA PARTIE QUI A ENVOYÉ CE MAIL : celle dont l'annuaire
   * porte l'adresse De:. Aucune ⇒ pas de cartouche sur ce bien (Arno). ⚠️ UN SEUL CARTOUCHE PAR BIEN, sur la ligne de
   * cette partie : celui de la ligne repliable « ▶ … » est retiré (demande d'Arno).
   */
  const expediteur = roleExpediteur(bien.personnes, expediteurMail);
  const coche = avecCase && garde === true;
  const motif = !avecCase ? 'rattaché à ce mail'
    : garde ? 'déjà rattaché — décochez pour le retirer'
      : 'décoché : ce mail sortira du suivi de ce bien à la validation (restaurable)';
  return (
    <li className={`rec-bien rdf-suivi-carte${retire ? ' rdf-suivi-carte--retire' : ''}${coche ? ' rec-bien--coche' : ''}`}>
      <label className="rec-choix">
        {avecCase && (
          <input type="checkbox" className="rdf-garde" checked={garde} onChange={onGarder}
            aria-label={`Garder « ${titre} » rattaché à ce mail`} />
        )}
        <span className="rec-bien-nom">{titre}</span>
        {oneShot && <span className="rdf-cartouche-oneshot">{MOT_CARTOUCHE_ONE_SHOT}</span>}
        <InfoBien cle={bien.cle} titre={titre} surLaLigne={`${titre} ${bien.personnes.map((p) => p.nom).join(' ')}`} />
        {/* 🔴 « SERA RETIRÉ » EST ÉCRIT, jamais seulement grisé. */}
        {retire && <span className="rdf-sera-retire">sera retiré</span>}
      </label>
      <PartiesSurDeuxLignes parties={bien.personnes} aLaDateDuMail expediteur={expediteur}
        nomExpediteur={expediteurMail?.nom ?? null}
        bienCle={bien.cle} messageIdExpediteur={expediteurMail?.messageId ?? null} />
      <p className="rec-motif">{motif}</p>
      <details className="rdf-suivi-detail">
        <summary className="rdf-suivi-resume">
          {proprios.length === 0 ? 'Aucun propriétaire connu' : proprios.map((p) => p.nom).join(' · ')}
          {/* 🔴 PLUS DE CARTOUCHE ICI (Arno) : il est sur la ligne de la partie, juste au-dessus. Le nom du locataire
              qui a écrit reste écrit sur la ligne, comme avant. */}
          {expediteur === 'locataire' && <> · {locataires.filter((p) => roleExpediteur([p], expediteurMail) !== null).map((p) => p.nom).join(' · ')}</>}
        </summary>
        <div className="rdf-suivi-corps">
          <p className="rdf-detail rdf-caract">
            <span className={`rdf-statut rdf-statut--${bien.statut}`}>{motStatutBien(bien.statut)}</span>
            {ponctuel && <span className="rdf-ponctuel">{MENTION_AJOUT_PONCTUEL}</span>}
            <span>lot {bien.numeroLot}</span>
            {bien.nature !== null && <span>{bien.nature}</span>}
            {bien.typeBien !== null && <span>{bien.typeBien}</span>}
            <span className={bien.surfaceM2 === null ? 'rdf-absent' : undefined}>{motSurface(bien.surfaceM2)}</span>
          </p>
          <CorpsDuBien bien={bien} liens={liens} onModifier={onModifier} sansCartoucheExpediteur />
        </div>
      </details>
    </li>
  );
}

/** UNE PERSONNE : son nom, sa qualité, et TOUS ses moyens de contact, chacun avec sa colonne d'origine. */
function CartePersonne({ personne, nomExpediteur = null }: {
  personne: PersonneRattachement;
  /**
   * 🔴 LOT PILULE-TROIS-TRAITS-ET-EXPEDITEUR-PARTOUT — le nom de « Expéditeur : <nom> » si CETTE personne a envoyé le mail affiché
   * (décidé par `CorpsDuBien`, une seule par bien) ; `null` sinon. Le liseré rouge suit le mot : jamais la couleur seule.
   */
  nomExpediteur?: string | null;
}) {
  const qualite = qualitePersonne(personne.civilite);
  const periode = motPeriode(personne);
  const fiche = adresseFicheAnnuaire(personne);
  /** ⚠️ LA SORTE EST RENDUE EXPLICITE : `CoordonneeFiche` ne la porte pas, elle vivait dans le NOM du tableau. */
  const contacts = [
    ...personne.telephones.map((c) => ({ ...c, sorte: 'telephone' as const, quoi: 'le numéro' })),
    ...personne.emails.map((c) => ({ ...c, sorte: 'email' as const, quoi: 'l’adresse e-mail' })),
  ];

  return (
    <div className={`rdf-personne${nomExpediteur !== null ? ' rdf-personne--expediteur' : ''}`}>
      <p className="rdf-personne-tete">
        <span className="rdf-sorte">{motRole(personne.role)}</span>
        <span className="rdf-personne-nom">{personne.nom}</span>
        {qualite !== null && <span className="rdf-note">{qualite}</span>}
        {/* 🔴 LE MOT « Expéditeur », jamais la couleur seule : c'est lui qui porte l'information. */}
        {nomExpediteur !== null && (
          <span className="rdf-expediteur">
            {MOT_EXPEDITEUR}<span className="rdf-expediteur-nom"> : {nomExpediteur}</span>
          </span>
        )}
        {/* LA FICHE D'ANNUAIRE, à côté de CHAQUE personne : c'est là qu'on va voir ou corriger ses coordonnées. */}
        {fiche !== null && (
          <a className="rdf-lien" href={fiche} target="_blank" rel="noopener noreferrer">
            Fiche annuaire <span aria-hidden="true">↗</span>
          </a>
        )}
      </p>
      {periode !== null && <p className="rdf-detail">{periode}</p>}

      {contacts.length === 0
        ? <p className="rdf-detail rdf-absent">Aucune coordonnée dans l’annuaire.</p>
        : (
          <ul className="rdf-contacts">
            {/* ══ 🔴🔴 LOT CONTACT-LIGNES — TITRE | VALEUR | COPIER ══════════════════════════════════════════
                Le titre portait le libellé D'ORIGINE (« Mobile 1 », « Email 2 ») ; il porte désormais le TYPE —
                MOBILE, FIXE, E-MAIL —, écrit une seule fois par groupe, et « Copier » est collé au bord droit,
                aligné d'une ligne à l'autre.

                ⚠️ CE QUE LE LIBELLÉ D'ORIGINE PROTÉGEAIT RESTE VRAI : « l'export ne permet PAS de dire à qui
                appartient chaque valeur quand une personne en porte plusieurs ». On n'invente toujours aucune
                attribution — on dit le TYPE, ce qui est vrai, au lieu du numéro de colonne, qui ne parlait
                qu'à celui qui avait lu l'export. */}
            {lignesParType(contacts).map(({ contact: c, titre }) => (
              /* ⚠️ MÊME RAISON QUE DANS `CartesPersonnes` : la note vit HORS de la ligne, qui garde son
                 `nowrap` — sans quoi une adresse longue repousserait « Copier » à la ligne suivante. */
              <li key={`${c.sorte}|${c.valeur}`} className="rdf-contact-bloc">
                <span className="rdf-contact">
                {titre === null
                  ? <span className="rdf-contact-libelle" aria-hidden="true" />
                  : <span className="rdf-contact-libelle">{titre}</span>}
                {/* 🔴 LOT FICHES-RETOUCHES — le numéro se lit groupé par deux ; `valeur` reste la forme
                    canonique, pour les comparaisons et le lien `tel:`. */}
                <span className="rdf-contact-valeur" title={c.sorte === 'email' ? c.valeur : c.affichage}>
                  {c.affichage}
                </span>
                <BoutonCopier valeur={c.affichage} quoi={`${c.quoi} de ${personne.nom}`} />
                </span>
                {/* 🔴 LOT ANNOTATIONS-TEL — la note passe SOUS la ligne, alignée sur la valeur. */}
                {c.note !== null && <span className="rdf-note-tel">{c.note}</span>}
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

export const CSS_RATTACHEMENTS_FIL = `
/* LOT GESTION-SUIVI-MIXTE — le titre du suivi mixte, en rouge ; le cartouche « One shot » : texte et bordure rouges, fond blanc. */
.rdf-suivis .rdf-suivis-titre.rdf-suivis-titre--mixte{color:var(--color-svv-red)}
.rdf-cartouche-oneshot{display:inline-flex;align-items:center;flex:0 0 auto;padding:0 .45rem;min-height:20px;border-radius:999px;
  font-size:.7rem;font-weight:700;line-height:1.4;white-space:nowrap;color:var(--color-svv-red);background:#fff;
  border:1px solid var(--color-svv-red)}

/* LOT GESTION-EXPEDITEUR-INCONNU — l'interrupteur « Affecter l'expediteur inconnu » (deux positions, cibles tactiles pleines). */
.rdf-affecter{margin:0 0 10px;padding:10px 12px;border:1px solid var(--color-svv-line);border-radius:.7rem;background:var(--color-svv-surface)}
.rdf-affecter-ligne{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.rdf-affecter-mot{font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
.rdf-affecter-choix{display:inline-flex;border:1px solid var(--color-svv-line-strong);border-radius:999px;overflow:hidden}
.rdf-affecter-position{min-height:36px;padding:0 14px;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer;border:0;
  background:transparent;color:var(--color-svv-muted)}
.rdf-affecter-position--choisie{background:var(--color-svv-red);color:#fff}
.rdf-affecter-position:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.rdf-affecter-aide{margin:.4rem 0 0;font-size:.75rem;color:var(--color-svv-muted)}

.rdf-objet{margin:-6px 0 2px;font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 2 — le compteur en tete. Il BOUGE pendant qu'on modifie :
   on le met donc un peu en avant, pour que l'oeil le retrouve apres chaque case cochee. */
.rdf-compteur{font-weight:700;color:var(--color-svv-ink)}
/* ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 2 — LE LISERE QUI SEPARE UN BIEN DU SUIVANT ═══════════════════
   DEMANDE D'ARNO (04/10/2026, fil 3490 / message 57473) : « le lisere gris qui entoure TOUT le bloc d'un bien
   devient plus epais (environ 2 px) et plus contraste, pour bien separer un bien du suivant. Il doit etre lisible
   en Clair et en Sombre. Rien d'autre ne bouge. »

   🔴 DEUX CHANGEMENTS, ET DEUX SEULEMENT : 1 px → 2 px, et « line » → « line-strong ». Le jeton fort existe deja
   et sert partout ou une bordure doit se voir (les cartouches de statut juste en dessous s'en servent) : prendre
   une couleur en dur aurait ete juste dans un theme et faux dans l'autre, alors que le jeton bascule seul.

   ⚠️ L'EPAISSEUR EST SUR LES QUATRE COTES, parce qu'Arno dit « entoure TOUT le bloc ». Un lisere epaissi d'un
   seul cote se lirait comme un marqueur d'etat — c'est deja le langage du repere ambre et du liseré rouge.

   ⚠️ LE RESTE NE BOUGE PAS : padding, rayon, fond, espacement. Et « rdf-item--retire » garde son trait
   DISCONTINU, qui dit « ce lien va partir » : il est juste deux fois plus visible, comme les autres.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot, vu 12 fois). */
.rdf-item{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;padding:10px;
  border:2px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-surface);min-width:0}
.rdf-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;min-width:0}
/* ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — LA CASE DE LA CARTE ════════════════════════════════
   Elle vit A GAUCHE DE L'ADRESSE (demande d'Arno), et n'existe que pendant la modification.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot). */
.rdf-garde{flex:0 0 auto;width:18px;height:18px;margin:0;cursor:pointer;align-self:center}
.rdf-garde:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* 🔴 LA CARTE QUI SERA RETIREE S'ESTOMPE — et le MOT « sera retiré » le dit : l'opacite ne fait que l'appuyer,
   elle ne se lit ni en niveaux de gris, ni au lecteur d'ecran. */
.rdf-item--retire{opacity:.55;border-style:dashed}
.rdf-sera-retire{flex:0 0 auto;padding:.05rem .45rem;border-radius:999px;font-size:.7rem;font-weight:700;
  line-height:1.6;color:var(--color-svv-red);border:1px solid var(--color-svv-red);white-space:nowrap}
.rdf-sorte{font-size:.68rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.rdf-cible{flex:1 1 14rem;font-size:.95rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* Le mot est TOUJOURS écrit : la couleur ne fait que l'appuyer. */
.rdf-ponctuel{font-size:.7rem;font-weight:700;letter-spacing:.02em;color:var(--color-svv-muted);
  padding:1px 6px;border:1px dashed var(--color-svv-line-strong);border-radius:999px;white-space:nowrap}
.rdf-statut{padding:.05rem .45rem;border-radius:999px;font-size:.7rem;font-weight:700;line-height:1.6;
  border:1px solid transparent;white-space:nowrap}
.rdf-statut--classe{color:var(--color-svv-green-ink);border-color:var(--color-svv-green-ink)}
.rdf-statut--auto{color:var(--color-svv-green-ink);border-color:var(--color-svv-line-strong)}
.rdf-statut--a_trancher{color:var(--color-svv-muted);border-color:var(--color-svv-line-strong)}
.rdf-detail{margin:0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
/* Les caractéristiques sur une rangée souple, séparées par des points médians tracés en CSS. */
.rdf-caract{display:flex;flex-wrap:wrap;gap:.1rem .5rem}
.rdf-caract > span + span::before{content:'· ';color:var(--color-svv-line-strong)}
/* Une donnée ABSENTE est dite, et se distingue d'une donnée présente — par le mot d'abord, l'italique ensuite. */
.rdf-absent{font-style:italic}
/* ══ 🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 2 — « Aujourd'hui : … » : DISCRET, demande d'Arno ════════════════
   AUCUNE COULEUR PROPRE, ET C'EST VOLONTAIRE : la ligne porte deja .rdf-detail, dont la couleur
   (--color-svv-muted) bascule seule en Clair et en Sombre. Une teinte en dur aurait ete juste dans un theme et
   fausse dans l'autre. Seul un demi-cran d'air la detache de la personne du mail, pour qu'on ne lise pas les deux
   comme une meme phrase. */
.rdf-aujourdhui{margin-top:.15rem}
.rdf-note{font-size:.74rem;color:var(--color-svv-muted)}
.rdf-lien{font-size:.78rem;font-weight:600;color:var(--color-svv-red)}
.rdf-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* ══ 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 4 — LES DEUX GRANDS BOUTONS DE LA CARTE ══════════════════
   « Deux boutons rouges allongés cote a cote, remplissant ensemble la largeur de la carte » (Arno). Le rouge, le
   rayon et l'etat desactive viennent de .svv-btn-primary de la charte : AUCUNE couleur n'est ecrite ici.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot, vu 12 fois). */
.rdf-raccourcis{display:flex;gap:8px;margin:2px 0;min-width:0}
/* 🔴 DEUX PARTS EGALES, et non « au contenu » : deux largeurs differentes se liraient comme un bouton principal
   et un bouton secondaire, alors que ce sont deux chemins de meme rang. */
.rdf-raccourci{flex:1 1 0;min-width:0;text-align:center;text-decoration:none;
  font-size:.82rem;font-weight:700;line-height:1.25;white-space:normal;overflow-wrap:anywhere}
.rdf-raccourci:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
@media (max-width:420px){
  /* 🔴 « Les deux boutons tiennent sur mobile (empiles si necessaire) » (Arno). A 390 px, deux libelles de cette
     longueur cote a cote tiennent sur quatre lignes chacun : on empile, et chacun reprend toute la largeur. */
  .rdf-raccourcis{flex-direction:column}
}
/* ══ UNE PERSONNE ══════════════════════════════════════════════════════════════════════════════════════════ */
.rdf-personne{display:flex;flex-direction:column;gap:3px;padding:8px 10px;min-width:0;
  background:var(--color-svv-field);border-radius:.5rem}
/* 🔴 L'EXPÉDITEUR : un liseré rouge ET le mot « Expéditeur ». Jamais la couleur seule. */
.rdf-personne--expediteur{border-left:3px solid var(--color-svv-red);border-radius:0 .5rem .5rem 0}
.rdf-personne-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.1rem .5rem;margin:0;min-width:0}
.rdf-personne-nom{font-size:.88rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.rdf-expediteur{padding:.05rem .4rem;border-radius:999px;font-size:.68rem;font-weight:700;letter-spacing:.03em;
  text-transform:uppercase;color:var(--color-svv-red);border:1px solid var(--color-svv-red);white-space:nowrap;max-width:100%}
/* LOT PILULE-TROIS-TRAITS-ET-EXPEDITEUR-PARTOUT — le nom garde sa casse : « EXPEDITEUR : Valentin TALHOUARN ». */
.rdf-expediteur-nom{text-transform:none;letter-spacing:0;white-space:normal;overflow-wrap:anywhere}
.rdf-contacts{display:flex;flex-direction:column;gap:2px;margin:2px 0 0;padding:0;list-style:none}
/* ══ 🔴 LOT CONTACT-LIGNES — titre | valeur | Copier, et « Copier » colle au bord DROIT ═══════════════════
   Plus de flex-wrap : une adresse longue ne doit jamais pousser « Copier » a la ligne suivante. Elle est
   TRONQUEE avec « … », son texte entier en infobulle, et la copie, elle, reste intacte. */
.rdf-contact{display:flex;flex-wrap:nowrap;align-items:center;gap:.5rem;min-height:32px;min-width:0}
.rdf-contact-libelle{flex:0 0 4.6rem;min-width:0;font-size:.7rem;font-weight:700;letter-spacing:.02em;
  text-transform:uppercase;color:var(--color-svv-muted);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rdf-contact-valeur{flex:1 1 auto;min-width:0;font-size:.85rem;color:var(--color-svv-ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Le bouton ne retrecit jamais : c'est la valeur qui cede la place, pas lui. */
.rdf-contact>.bcp{flex:0 0 auto;margin-left:auto}
/* LOT ANNOTATIONS-TEL — la note vit SOUS la ligne, dans son propre bloc : la ligne, elle, garde son nowrap. */
.rdf-contact-bloc{display:flex;flex-direction:column;min-width:0}
.rdf-note-tel{margin-left:5.1rem;font-size:.72rem;font-style:italic;color:var(--color-svv-muted);
  overflow-wrap:anywhere}
/* ══ LE VIDE, DIT ══════════════════════════════════════════════════════════════════════════════════════════ */
.rdf-vide{display:flex;flex-direction:column;gap:2px;margin-bottom:10px;padding:10px;
  border-left:3px solid var(--color-svv-red);border-radius:0 .5rem .5rem 0;background:var(--color-svv-field)}
.rdf-vide-mot{margin:0;font-size:.88rem;font-weight:700;color:var(--color-svv-ink)}
.rdf-rattacher{align-self:flex-start;font-size:.84rem;font-weight:700}
/* ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT — L'EN-TETE DU MAIL, LE GRAND BOUTON, LES DEUX PANNEAUX ═══
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot, vu 12 fois). */
/* De quel mail la fenetre parle : expediteur, date, objet. C'est la premiere chose qu'on y cherche. */
.rdf-entete{margin:-6px 0 2px;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* 🔴 UN GRAND BOUTON, et il prend toute la largeur : c'est le geste principal de la fenetre, pas un lien de plus. */
.rdf-modifier{width:100%;justify-content:center;margin:2px 0 4px;font-weight:700}
/* ══ LOT RATTACHEMENT-PONCTUEL, POINT 1 — LE BANDEAU DU MODE PONCTUEL, ET SA SORTIE ═══════════════════════════
   LE BANDEAU EST AMBRE : c'est le ton de l'avertissement dans tout cet ecran, et il dit « attention a la portee »
   sans crier. Le MOT porte l'information ; la couleur ne fait que l'appuyer. */
.rdf-bandeau-ponctuel{margin:4px 0 8px;padding:8px 10px;border-left:4px solid var(--color-svv-amber);
  background:var(--color-svv-amber-soft);border-radius:.4rem;font-size:.82rem;font-weight:600;
  color:var(--color-svv-ink);overflow-wrap:anywhere}
/* LA SORTIE : le mot de ce qui vient d'etre fait, et le bouton qui le defait, sur la meme ligne. */
.rdf-ponctuel-fait{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;margin:0 0 8px;
  padding:8px 10px;border:1px solid var(--color-svv-green-ink);border-radius:.4rem;
  background:var(--color-svv-green-soft);min-width:0}
.rdf-ponctuel-mot{flex:1 1 14rem;min-width:0;font-size:.82rem;color:var(--color-svv-green-ink);
  overflow-wrap:anywhere}
.rdf-pied-panneau{display:flex;flex-direction:column;gap:6px;margin:8px 0 0;min-width:0}
/* LOT CLASSER-PAR-LA-MODALE, POINT 1 — les deux actions secondaires du pied, en liens discrets et non en
   boutons : ce ne sont pas des facons de valider la fenetre, ce sont deux autres decisions qui la quittent.
   Elles se replient d'elles-memes sur telephone. */
.rdf-pied-actions{display:flex;flex-wrap:wrap;gap:.2rem 1rem;margin:2px 0 0;padding-top:6px;
  border-top:1px solid var(--color-svv-line)}
/* LOT CLASSER-PAR-LA-MODALE, POINT 3 — LA LIGNE « EVENEMENT RATTACHE » DU PIED.
   Meme dessin que la ligne du bloc de l'encart : un titre, l'etat, puis les gestes en liens discrets. Les
   formes qui s'ouvrent dessous sont encadrees, comme la-bas — on voit ce qui est ouvert, et sur quoi. */
.rdf-evt{min-width:0;padding-top:6px;border-top:1px solid var(--color-svv-line)}
.rdf-evt-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.2rem .6rem;margin:0;min-width:0}
.rdf-evt-nom{font-size:.84rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* CE QUI SERA ECRIT A LA VALIDATION : en ambre, le ton des evenements dans tout cet ecran. */
.rdf-evt-voulu{font-size:.78rem;font-weight:700;color:var(--color-svv-amber);overflow-wrap:anywhere}
.rdf-evt-forme{margin:6px 0 0;padding:8px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;
  background:var(--color-svv-surface);min-width:0}
.rdf-evt-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:8px}
/* c) L'ENCADRE CLAIR : il dit ce que « Valider » va faire, AVANT de le faire. */
.rdf-encadre{margin:0;padding:8px 10px;border-radius:0 .5rem .5rem 0;
  border-left:3px solid var(--color-svv-red);background:var(--color-svv-field);
  font-size:.8rem;line-height:1.45;color:var(--color-svv-ink)}
/* Le bloc de suivi : MEME dessin que celui de l'encart du mail, parce que c'est le meme bloc. */
.rdf-suivi{margin:0;padding:6px 10px;border:1px solid var(--color-svv-line);border-radius:.6rem;min-width:0}
.rdf-suivi-titre{font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.rdf-choix{display:flex;align-items:flex-start;gap:.5rem;padding:3px 0;font-size:.85rem;
  color:var(--color-svv-ink);cursor:pointer;min-width:0}
.rdf-choix>span{display:flex;flex-direction:column;gap:1px;min-width:0}
.rdf-suivi-mot{font-weight:600}
.rdf-suivi-aide{font-size:.74rem;color:var(--color-svv-muted);line-height:1.35}
/* L'alerte de « toute la conversation » : un liseré rouge ET le texte. Jamais la couleur seule. */
.rdf-alerte{display:flex;flex-direction:column;gap:.2rem;margin:.4rem 0 0;padding:6px 8px;
  border-radius:0 .5rem .5rem 0;border-left:3px solid var(--color-svv-red);background:var(--color-svv-field)}
.rdf-alerte-texte{font-size:.8rem;font-weight:600;color:var(--color-svv-ink)}
/* Ce que la validation va ecrire, en une phrase — « Aucun changement » compris. */
.rdf-bilan{font-weight:600;color:var(--color-svv-ink)}
/* ══ LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — « MODIFIER LE RATTACHEMENT » ══════════════════════════════════
   AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit. Couleurs : jetons seulement. */
.rdf--ponctuel{position:relative}
/* LOT FENETRE-CLASSEMENT-UNIQUE — le mode brouillon (ouvert depuis le composeur). Le voile passe AU-DESSUS de la fenetre
   de redaction flottante (z-index 60) et de son plein ecran, comme le faisait la petite fenetre (80). La fenetre est une
   colonne : titre, biens suivis (bornes), puis le contenu du composeur dont seul le corps defile ; « Valider » reste vu. */
.rdf-brouillon-voile{z-index:80}
/* LOT COMPOSEUR-FENETRE-COMPLETE : la fenetre du composeur defile EN ENTIER, comme « Modifier le rattachement » (.mrt) :
   biens suivis, propositions, recherche, evenement, portee et son bouton se suivent dans le meme cadre. Le contenu du
   composeur pose dedans perd sa colonne a corps defilant ; son pied (l'evenement et la portee) perd son cadre de carte :
   ce sont les blocs de la grande fenetre, deja encadres. */
.rdf--brouillon{max-height:min(92vh, calc(100dvh - 32px));width:min(680px, 96vw)}
.rdf--brouillon .rec.rec--integre{flex:0 0 auto;min-height:auto}
.rdf--brouillon .rec-corps{flex:0 0 auto;overflow:visible}
.rdf--brouillon .rec-pied-sup{padding:0;border:0;background:transparent;animation:none}
/* LOT COMPOSEUR-BLOC-VERT : le cadre gris de la reference (.mrb) garde sa marge interieure, que .rec.rec--integre annulait. */
.rdf--brouillon .rec.rec--integre.mrb{padding:8px 10px;margin:6px 0 10px;background:var(--color-svv-field);border-radius:.6rem}
.rdf-brouillon-mot{margin:0;padding-right:2.2rem}
/* LOT UNE-SEULE-FENETRE-DE-RATTACHEMENT — le bloc « Autres classements », sous la portee : encadre comme elle, plus
   discret (trait fin), ses gestes en liens qui se replient d'eux-memes sur telephone. */
.rdf-autres{display:flex;flex-direction:column;gap:4px;margin-top:6px;padding:8px 12px;min-width:0;
  border:1px solid var(--color-svv-line);border-radius:.7rem;background:var(--color-svv-surface)}
.rdf-autres .rdf-pied-actions{margin:0;padding-top:0;border-top:0}
/* La portee : la glissiere, sa definition, le bouton final pleine largeur. */
.rdf-portee{display:flex;flex-direction:column;gap:8px;margin-top:6px;padding:10px 12px;
  border:2px solid var(--color-svv-line-strong);border-radius:.7rem;background:var(--color-svv-surface);min-width:0}
.rdf-portee-definition{margin:0;padding:8px 10px;border-radius:0 .5rem .5rem 0;border-left:3px solid var(--color-svv-red);
  background:var(--color-svv-field);font-size:.82rem;line-height:1.45;color:var(--color-svv-ink)}
.rdf-portee-definition--origine{border-left-color:var(--color-svv-line-strong)}
.rdf-portee-question{padding:8px 10px;border:1px solid var(--color-svv-amber);border-radius:.5rem;
  background:var(--color-svv-amber-soft)}
.rdf-portee-question-mot{margin:0;font-size:.85rem;font-weight:700;color:var(--color-svv-ink)}
.rdf-valider-portee{width:100%;justify-content:center;min-height:48px;font-size:.95rem;font-weight:700}
/* LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — le bouton BLANC (contour et texte rouges) : « Selectionner minimum
   un bien ». Inactif sans etre grise : il doit se lire, en Clair comme en Sombre. */
.rdf-valider-portee.rdf-valider-portee--vide{background:var(--color-svv-surface);color:var(--color-svv-red);
  border:2px solid var(--color-svv-red);box-shadow:none;cursor:default}
.rdf-valider-portee.rdf-valider-portee--vide:hover{background:var(--color-svv-surface);color:var(--color-svv-red)}
.rdf-valider-mention{margin:-2px 0 0;font-size:.78rem;font-style:italic;color:var(--color-svv-muted);text-align:center}
/* L'appel vers les blocs de biens : un bref liseré rouge, deux fois. */
@keyframes rdf-appel{0%,100%{box-shadow:0 0 0 0 transparent}50%{box-shadow:0 0 0 3px var(--color-svv-red)}}
.rdf--appel .rdf-suivis,.rdf--appel .rec-carte{animation:rdf-appel .6s ease-in-out 2}
@media (prefers-reduced-motion: reduce){.rdf--appel .rdf-suivis,.rdf--appel .rec-carte{animation:none;
  outline:2px solid var(--color-svv-red);outline-offset:2px}}
.rdf-croix{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;justify-content:center;
  min-width:36px;min-height:36px;padding:0;font:inherit;font-size:1.4rem;line-height:1;color:var(--color-svv-muted);
  background:transparent;border:0;border-radius:50%;cursor:pointer}
.rdf-croix:hover{background:color-mix(in srgb, var(--color-svv-ink) 8%, transparent);color:var(--color-svv-ink)}
.rdf-croix:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* Bloc 1 : le titre est DANS le cadre, en plus grand. */
.rdf-suivis{margin:4px 0 10px;padding:10px 12px;background:var(--color-svv-surface);
  border:2px solid var(--color-svv-line-strong);border-radius:.7rem;min-width:0}
.rdf-suivis-titre{margin:0 0 .5rem;font-size:1.02rem;font-weight:700;color:var(--color-svv-ink)}
.rdf-suivis-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.rdf-suivi-carte--retire{opacity:.6;border-style:dashed}
.rdf-suivi-detail{margin:.35rem 0 0 1.6rem}
.rdf-suivi-resume{font-size:.8rem;font-weight:600;color:var(--color-svv-ink);cursor:pointer;overflow-wrap:anywhere}
.rdf-suivi-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:.4rem}
.rdf-suivi-corps{display:flex;flex-direction:column;gap:6px;margin-top:6px}
/* La ligne « Evenement rattache », repliee. */
.rdf-evt-resume{font-size:.8rem;font-weight:600;color:var(--color-svv-ink);cursor:pointer;overflow-wrap:anywhere}
/* LOT MARGES-MODALE — trace VERS L INTERIEUR : rien ne deborde du bloc (focus, selection). */
.rdf-evt-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:.4rem}
.rdf-evt-repli>.rdf-evt-tete{margin-top:6px}
/* LOT EVENEMENT-RATTACHE-COHERENT, PARTIE 3 — le bloc encadre, au dessin de .rec-carte (Propositions, Moteur de
   recherche). Replie : une seule ligne, titre + capsule (ou aucun) + chevron a droite. Rien ne deborde. */
.rdf-evt-bloc{margin:0 0 10px;padding:10px 12px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  border-radius:.7rem;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0;box-sizing:border-box;max-width:100%}
/* LOT BLOC-EVENEMENT-RATTACHE-COMPLET, PARTIE 4 — la ligne de titre garde une marge interieure : le cadre de focus
   se trace DEDANS (outline-offset negatif), a distance du bord du bloc, et le chevron est pose dans la marge droite,
   entierement visible. La ligne peut passer a la ligne (cas 2 sur telephone) : rien ne sort du bloc. */
.rdf-evt-bloc>.rdf-evt-resume{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .5rem;
  min-width:0;list-style:none;min-height:32px;padding:4px 30px 4px 6px;margin:-4px -6px;border-radius:.5rem;
  overflow-wrap:normal;box-sizing:border-box}
.rdf-evt-bloc>.rdf-evt-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:.5rem}
.rdf-evt-bloc>.rdf-evt-resume::-webkit-details-marker{display:none}
.rdf-evt-bloc>.rdf-evt-resume::marker{content:''}
.rdf-evt-titre{flex:0 0 auto;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.rdf-evt-etat{flex:1 1 14rem;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:.35rem;font-size:.8rem}
.rdf-evt-etat>.cev{flex:0 1 auto}
.rdf-evt-aucun{color:var(--color-svv-muted);font-weight:600}
.rdf-evt-autres{font-size:.76rem;font-weight:600;color:var(--color-svv-muted);white-space:nowrap}
.rdf-evt-chevron{position:absolute;right:11px;top:50%;width:8px;height:8px;margin-top:-6px;
  border-right:2px solid var(--color-svv-muted);border-bottom:2px solid var(--color-svv-muted);transform:rotate(-45deg);
  transition:transform .15s}
.rdf-evt-bloc[open]>.rdf-evt-resume .rdf-evt-chevron{transform:rotate(45deg)}
@media (prefers-reduced-motion:reduce){.rdf-evt-chevron{transition:none}}
.rdf-evt-bloc[open]>.rdf-evt-resume{margin-bottom:6px}
.rdf-evt-bloc>.rdf-evt-tete{margin-top:0}
.rdf-evt-nom{display:inline-flex;min-width:0;max-width:100%}
.rdf-evt-voulu{display:inline-flex;align-items:center;gap:.3rem;min-width:0;max-width:100%}
/* PARTIE 3 — la liste des evenements en cours. */
.rdf-evt-liste{margin:0 0 8px;min-width:0}
.rdf-evt-liste-titre{margin:0 0 6px;font-size:.78rem;font-weight:700;color:var(--color-svv-ink)}
.rdf-evt-lignes{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;min-width:0}
.rdf-evt-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem .6rem;padding:6px 8px;min-width:0;
  border:1px solid var(--color-svv-line);border-radius:.6rem;box-sizing:border-box}
.rdf-evt-ligne>.cev{flex:0 1 auto}
.rdf-evt-meta{display:flex;flex-wrap:wrap;gap:.15rem .6rem;font-size:.76rem;color:var(--color-svv-muted);min-width:0}
.rdf-evt-meta>span+span::before{content:'·';margin-right:.6rem}
.rdf-evt-rattache{margin-left:auto;font-size:.78rem;font-weight:700;color:var(--color-svv-green-ink);white-space:nowrap}
.rdf-evt-cocher{margin-left:auto;display:inline-flex;align-items:center;gap:.35rem;min-height:32px;font-size:.8rem;
  font-weight:600;color:var(--color-svv-ink);cursor:pointer;min-width:0;flex-wrap:wrap}
.rdf-evt-cocher input:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.rdf-evt-remplace{font-weight:400;color:var(--color-svv-muted)}
.rdf-evt-non-rattache{margin-left:auto;font-size:.78rem;font-weight:600;color:var(--color-svv-muted);white-space:nowrap}
.rdf-evt-renvoi{margin:8px 0 0;font-style:italic}
${CSS_CAPSULE_EVENEMENT}
/* LOT STATUT-PAR-MAIL — le detail par mail, REPLIE. On ne cache rien : on cesse de repeter. */
.rdf-detail-mails{margin-top:2px}
.rdf-resume{font-size:.78rem;color:var(--color-svv-muted);cursor:pointer}
.rdf-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:.4rem}
.rdf-sous-liste{display:flex;flex-direction:column;gap:6px;margin:6px 0 0;padding:0 0 0 10px;list-style:none;
  border-left:2px solid var(--color-svv-line)}
.rdf-sous-item{display:flex;flex-direction:column;gap:2px;min-width:0}
@media (max-width:520px){
  /* ⚠️ MEME A 390 px, LA LIGNE NE SE REPLIE PAS : « Copier » doit rester sur la ligne de sa valeur. On retrecit
     le titre, la valeur tronque — c'est exactement ce que la troncature est la pour faire. */
  .rdf-contact-libelle{flex-basis:3.6rem}
}
`;

/**
 * ══ 🔴🔴 LOT GESTION-EXPEDITEUR-INCONNU (Arno, 16/10/2026) — L'INTERRUPTEUR « AFFECTER L'EXPÉDITEUR INCONNU » ═══════════
 * Deux positions, Activé / Désactivé ; DÉSACTIVÉ par défaut. Activé : après validation, « Classer ce nouveau contact »
 * s'ouvre comme avant. Désactivé : il ne s'ouvre pas — le mail est rattaché, et son expéditeur reste dans « Non affectés »
 * de l'historique du bien. Affiché seulement quand l'expéditeur est inconnu des fiches des biens cochés.
 */
export const MOT_AFFECTER_EXPEDITEUR = 'Affecter l’expéditeur inconnu';
export const AIDE_AFFECTER_EXPEDITEUR = 'Désactivé : le mail est rattaché au bien et classé “Non affecté” dans son historique ; '
  + 'vous pourrez l’affecter plus tard par glisser-déposer.';

function InterrupteurExpediteur({ actif, onChange, desactive = false }: {
  actif: boolean; onChange: (v: boolean) => void; desactive?: boolean;
}) {
  return (
    <div className="rdf-affecter">
      <div className="rdf-affecter-ligne">
        <span className="rdf-affecter-mot" id="rdf-affecter-mot">{MOT_AFFECTER_EXPEDITEUR}</span>
        <div className="rdf-affecter-choix" role="radiogroup" aria-labelledby="rdf-affecter-mot">
          {([true, false] as const).map((v) => (
            <button key={String(v)} type="button" role="radio" aria-checked={actif === v} disabled={desactive}
              className={`rdf-affecter-position${actif === v ? ' rdf-affecter-position--choisie' : ''}`}
              onClick={() => onChange(v)}>
              {v ? 'Activé' : 'Désactivé'}
            </button>
          ))}
        </div>
      </div>
      <p className="rdf-affecter-aide">{AIDE_AFFECTER_EXPEDITEUR}</p>
    </div>
  );
}
