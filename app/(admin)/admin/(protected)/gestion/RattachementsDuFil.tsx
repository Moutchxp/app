'use client';

import { useCallback, useEffect, useState } from 'react';
// LOT CONTACT-LIGNES — le type passe dans le titre, et ne s'ecrit qu'une fois par groupe.
import { lignesParType } from '../../../../lib/gestion/telephoneAffichage';
import { ModifierRattachement, motSorteLong, CSS_MODIFIER_RATTACHEMENT } from './ModifierRattachement';
import { BoutonCopier, CSS_BOUTON_COPIER } from './BoutonCopier';
import { MenuRattachementBien } from './MenuRattachementBien';
import { dateHeureComplete } from '../../../../lib/gestion/ecran';
// LOT FICHE-RATTACHEMENT — les mots et les ordres vivent dans un module PUR, éprouvé sans écran.
import {
  adresseFicheAnnuaire, adresseHistoriqueDuBien, idDossierDrive,
  motAujourdhui, motNbBiensRattaches, motPeriode, motRole, motSansLocataire,
  motStatutBien, occupantsAujourdhuiADire,
  motSurface, qualitePersonne,
  AIDE_DRIVE_ABSENT, AIDE_DRIVE_DU_BIEN, AIDE_HISTORIQUE_ABSENT, AIDE_HISTORIQUE_DU_BIEN,
  AUCUN_BIEN_DU_MAIL, biensDuMail, ENCADRE_EXCEPTION_CE_MAIL, MENTION_AJOUT_PONCTUEL, motEnTeteMail,
  MOT_CHANGER_REGLE_SUIVI, MOT_DRIVE_ABSENT, MOT_DRIVE_DU_BIEN, MOT_HISTORIQUE_DU_BIEN,
  MOT_MODIFIER_BIENS_DU_MAIL, resumeModificationBiens, TITRE_BIENS_DU_MAIL,
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
} from '../../../../lib/gestion/interneLevee';
import {
  alerteTouteLaConversation, motClassement,
  type ChoixSuivi, type Classement, type ExceptionMail,
} from '../../../../lib/gestion/periodesConversation';
import type { LienAffiche } from '../../../../lib/gestion/rattachementRepo';

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

/** Ce que la fenêtre montre : la fiche du mail, ou l'un de ses deux panneaux de modification. */
type Panneau = 'aucun' | 'exception' | 'suivi';

export function RattachementsDuFil({
  filId, titre, messageId = null, onFerme, onGeste, onLeveeFaite,
}: {
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
  onLeveeFaite?: (fait: { mails: number[]; liens: number[] }) => void;
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [modifie, setModifie] = useState<LienAffiche | null>(null);
  const [panneau, setPanneau] = useState<Panneau>('aucun');
  /** Le choix du bloc « Suivi dans la conversation », quand il est ouvert. Deux options, jamais trois (voir plus bas). */
  const [choixSuivi, setChoixSuivi] = useState<ChoixSuivi>('suite');
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
  const [leveeFaite, setLeveeFaite] = useState<{ mails: number[]; liens: number[] } | null>(null);

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
  const [suivi, setSuivi] = useState<{ mails: number[]; exceptions: ExceptionMail[] } | null>(null);
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

  const charger = useCallback(async () => {
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
      if (df.etat === 'sans_schema' || dl.etat === 'sans_schema') { setEtat({ v: 'sans_schema' }); return; }
      /**
       * ⚠️ ON VÉRIFIE LA FORME, PAS SEULEMENT L'ÉTAT. Une réponse « ok » dont le corps n'a pas la forme attendue
       * (un serveur plus ancien, un onglet resté ouvert pendant un déploiement) doit donner un message lisible,
       * jamais un écran blanc : `fiche.biens.length` sur un tableau absent casse tout le rendu.
       */
      const f = df.data;
      if (df.etat !== 'ok' || !f || !Array.isArray(f.biens)) {
        setEtat({ v: 'erreur', message: df.message ?? 'Lecture impossible : réponse inattendue du serveur.' });
        return;
      }
      setEtat({ v: 'ok', fiche: f, liens: dl.etat === 'ok' && Array.isArray(dl.data) ? dl.data : [] });
    } catch {
      setEtat({ v: 'erreur', message: 'La lecture des rattachements n’a pas abouti.' });
    }
  }, [filId, messageId]);

  useEffect(() => { void charger(); }, [charger]);

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
        const d = (await res.json()) as { etat?: string; mails?: number[]; exceptions?: ExceptionMail[] };
        if (annule || d.etat !== 'ok') return;
        setSuivi({ mails: d.mails ?? [], exceptions: d.exceptions ?? [] });
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
        const d = (await res.json()) as {
          etat?: string; dossiers?: { dossierId: string; cles: string[] }[];
        };
        if (annule || d.etat !== 'ok') return;
        const carte: Record<string, string> = {};
        for (const x of d.dossiers ?? []) for (const c of x.cles) carte[c] = x.dossierId;
        setDossiers(carte);
      } catch { /* confort absent : la fiche reste entièrement utilisable */ }
    })();
    return () => { annule = true; };
  }, [filId]);

  /**
   * ⚠️ LA FENÊTRE DE MODIFICATION PREND TOUTE LA PLACE quand elle s'ouvre : deux boîtes de dialogue empilées sont
   * injouables au clavier, et un lecteur d'écran ne sait plus laquelle est active. On rend donc l'une OU l'autre.
   */
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

  const fiche = etat.v === 'ok' ? etat.fiche : null;
  const tousLesLiens = etat.v === 'ok' ? etat.liens : [];
  const liensParId = new Map(tousLesLiens.map((l) => [l.id, l]));
  const objet = fiche?.objet ?? titre ?? null;
  /**
   * 🔴🔴 LE MAIL DE LA FENÊTRE — UN SEUL CHEMIN, ET C'EST LE LOT. Le mail cliqué s'il y en a un ; sinon celui que
   * le serveur a désigné comme le plus récent, c'est-à-dire celui que la ligne de liste affiche.
   */
  const mailId = messageId ?? fiche?.enTete?.messageId ?? null;
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
  const libellesDuMail: Record<string, string> = {};
  for (const b of biens) libellesDuMail[b.cle] = `${b.adresseComplete} — lot ${b.numeroLot}`;

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
  const annulerLevee = async (): Promise<void> => {
    const fait = leveeFaite;
    if (fait === null) return;
    setLeveeFaite(null);
    try {
      const res = await fetch('/api/admin/gestion/interne', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remettreLevee: true, remettre: fait.liens, marques: fait.mails }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; liens?: number };
      if (d.ok === true) onGeste?.(motApresAnnulationLevee(typeof d.liens === 'number' ? d.liens : 0));
      await charger();
    } catch {
      setErreur('Le serveur n’a pas répondu.');
    }
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
    const classement: Classement = { sorte: 'biens', biens: voulus.map((b) => ({ ...b })) };

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
      const d = (await res.json()) as { ok?: boolean; erreur?: string };
      if (!res.ok || d.ok !== true) { setErreur(d.erreur ?? 'Le geste n’a pas abouti.'); return; }
      onGeste?.(choix === 'mail'
        ? `Exception posée sur ce mail : ${motClassement(classement)}.`
        : (choix === 'conversation'
          ? `Toute la conversation reclassée : ${motClassement(classement)}.`
          : `Nouvelle période à partir de ce mail : ${motClassement(classement)}.`));
      setPanneau('aucun');
      setSelection(null);
      setConfirme(false);
      await charger();
      /* 🔴🔴 POINT 2 — APRÈS L'ÉCRITURE, ET JAMAIS AVANT : la marque est déjà levée par `rattacher()`. Ce qui
         reste à faire est d'offrir la SORTIE, avec les deux moitiés qu'elle devra défaire. */
      if (leveeConfirmee !== null && leveeConfirmee.length > 0 && ajoutes.length > 0) {
        const fait = { mails: [...leveeConfirmee], liens: await liensPosesPour(ajoutes, suivi?.mails ?? []) };
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
    mails: suivi.mails, exceptions: suivi.exceptions, messageId: mailId,
    versQuoi: motClassement({
      sorte: 'biens',
      biens: (selection ?? clesDuMail).map((cle) => ({ cle, libelle: libellesDuMail[cle] ?? cle })),
    }),
  });
  const bloquee = panneau === 'suivi' && choixSuivi === 'conversation' && !confirme
    ? 'Cochez la confirmation ci-dessus pour reclasser toute la conversation.'
    : null;

  return (
    <div className="mrt-voile" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) onFerme(); }}>
      <style>{CSS_MODIFIER_RATTACHEMENT}</style>
      <style>{CSS_BOUTON_COPIER}</style>
      <style>{CSS_RATTACHEMENTS_FIL}</style>
      <div className="mrt rdf" role="dialog" aria-modal="true" aria-labelledby="rdf-titre"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onFerme(); } }}>

        {/* ══ 🔴🔴 EN TÊTE : DE QUEL MAIL ON PARLE — expéditeur, date, objet (demande d'Arno) ═════════════════
            🔴 UN SEUL TITRE DÉSORMAIS. « Bien(s) de cet échange » a disparu avec la fenêtre qui le portait : un
            rattachement se pose sur un MAIL, et « les biens de l'échange » était une somme — or une somme ne se
            modifie pas. */}
        <h2 className="mrt-titre" id="rdf-titre">{TITRE_BIENS_DU_MAIL}</h2>
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
        {fiche !== null && !(biens.length === 0 && panneau === 'aucun') && (
          <p className="rdf-detail rdf-compteur">{motNbBiensRattaches((selection ?? clesDuMail).length)}</p>
        )}

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
        {fiche !== null && biens.length === 0 && (
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

        {/* ══ 🔴 UN BLOC PAR BIEN ════════════════════════════════════════════════════════════════════════════ */}
        {biens.map((b) => (
          <BlocBien key={b.cle} bien={b} dossierId={dossiers[b.cle] ?? b.dossierDriveId}
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
            onClick={() => { setPanneau('exception'); setSelection(clesDuMail); setErreur(null); }}>
            {MOT_MODIFIER_BIENS_DU_MAIL}
          </button>
        )}

        {mailId !== null && panneau !== 'aucun' && (
          <MenuRattachementBien messageId={mailId} filId={filId}
            preCoches={clesDuMail}
            libellesConnus={libellesDuMail}
            /**
             * 🔴🔴 LOT FENETRE-BIENS-CARTES-ET-RACCOURCIS, POINT 3 — LA SÉLECTION EST TENUE ICI.
             *
             * Elle se coche désormais sur les CARTES du haut autant que dans le menu : il n'y a donc qu'un seul
             * endroit possible pour la garder, et c'est la fenêtre. Le menu, lui, la reçoit et la rend.
             */
            cochesImposees={selection ?? clesDuMail}
            onCochesChange={setSelection}
            onSelection={setSelection}
            motValider={panneau === 'exception' ? 'Valider les biens de ce mail' : 'Valider le suivi'}
            validationBloquee={bloquee}
            onValider={(voulus) => ecrire(voulus, panneau === 'exception' ? 'mail' : choixSuivi)}
            onFerme={() => { setPanneau('aucun'); setSelection(null); setConfirme(false); }}
            onGeste={onGeste}
            onChange={async () => { await charger(); }}
            /* ⚠️ PAS DE « Hors gestion, ou classer par pièce… » ICI : il ouvre LA fenêtre de classement, et deux
               boîtes de dialogue empilées sont injouables au clavier. Le bouton n'est donc pas rendu — plutôt
               qu'un bouton qui se contenterait de refermer le panneau, c'est-à-dire un bouton qui ment. */
            pied={(
              <div className="rdf-pied-panneau">
                {panneau === 'exception' ? (
                  <>
                    {/* 🔴🔴 c) L'ENCADRÉ CLAIR, mot pour mot celui d'Arno. */}
                    <p className="rdf-encadre" role="note">{ENCADRE_EXCEPTION_CE_MAIL}</p>
                    {/* 🔴 LE LIEN QUI OUVRE L'AUTRE RÈGLE — dans la MÊME fenêtre, et sans perdre la sélection. */}
                    <button type="button" className="gst-lien-bouton"
                      onClick={() => { setPanneau('suivi'); setConfirme(false); }}>
                      {MOT_CHANGER_REGLE_SUIVI}
                    </button>
                  </>
                ) : (
                  <>
                    {/* ══ 🔴🔴 LE BLOC « SUIVI DANS LA CONVERSATION », À DEUX OPTIONS ═══════════════════════
                        RÈGLE D'ARNO : « il ouvre dans la même fenêtre le bloc “Suivi dans la conversation” avec
                        “Ce mail et la conversation à venir” et “Toute la conversation” (comportements existants
                        inchangés, avertissement de “Toute la conversation” compris) ».

                        ⚠️ DEUX OPTIONS, PAS TROIS, et c'est volontaire : « Ce mail uniquement » est déjà ce que
                        fait le grand bouton. L'offrir ici une seconde fois ferait deux chemins pour un seul
                        geste — et c'est précisément ce que ce lot défait.

                        🔴 LES MOTS ET LES AIDES VIENNENT DE LA SOURCE (`CHOIX_SUIVI`), jamais d'une copie : deux
                        listes recopiées divergent au premier ajustement, sans que rien ne le dise. */}
                    <fieldset className="rdf-suivi">
                      <legend className="rdf-suivi-titre">Suivi dans la conversation</legend>
                      {CHOIX_SUIVI.filter((c) => c.cle !== 'mail').map((c) => (
                        <label className="rdf-choix" key={c.cle}>
                          <input type="radio" name="rdf-suivi" checked={choixSuivi === c.cle}
                            onChange={() => { setChoixSuivi(c.cle); setConfirme(false); }} />
                          <span>
                            <span className="rdf-suivi-mot">{c.mot}</span>
                            <span className="rdf-suivi-aide">{c.aide}</span>
                          </span>
                        </label>
                      ))}
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
                    <button type="button" className="gst-lien-bouton"
                      onClick={() => { setPanneau('exception'); setConfirme(false); }}>
                      ← Revenir à l’exception sur ce seul mail
                    </button>
                  </>
                )}
                {/* 🔴 CE QUE LA VALIDATION VA ÉCRIRE, DIT AVANT DE LA FAIRE — « Aucun changement » compris. */}
                {/* ⚠️ `rdf-bilan`, PAS `rdf-resume` : ce dernier est déjà le dépliant « Voir le détail par mail »
                    de chaque bien. Deux sens pour une classe, c'est un style qu'on croit changer ici et qui
                    bouge là-bas. */}
                <p className="rdf-detail rdf-bilan" role="status">
                  {resumeModificationBiens({ avant: clesDuMail, apres: selection ?? clesDuMail })}
                </p>
              </div>
            )} />
        )}

        {erreur !== null && <p className="gst-tronc" role="alert">{erreur}</p>}

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

/** UN BIEN : sa fiche, ses personnes, ses gestes. */
function BlocBien({
  bien, dossierId, liens, onModifier, ponctuel = false, surUnSeulMail = false, garde, onGarder, onDrive,
}: {
  bien: BienRattache;
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

      {/* ══ 🔴 LES PERSONNES, L'EXPÉDITEUR EN TÊTE ═════════════════════════════════════════════════════════ */}
      {bien.personnes.filter((p) => p.role === 'proprietaire').length === 0 && (
        <p className="rdf-detail rdf-absent">Aucun propriétaire connu pour ce lot dans l’annuaire.</p>
      )}
      {bien.personnes.map((p) => <CartePersonne key={`${p.role}-${p.cle}`} personne={p} />)}
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
    </section>
  );
}

/** UNE PERSONNE : son nom, sa qualité, et TOUS ses moyens de contact, chacun avec sa colonne d'origine. */
function CartePersonne({ personne }: { personne: PersonneRattachement }) {
  const qualite = qualitePersonne(personne.civilite);
  const periode = motPeriode(personne);
  const fiche = adresseFicheAnnuaire(personne);
  /** ⚠️ LA SORTE EST RENDUE EXPLICITE : `CoordonneeFiche` ne la porte pas, elle vivait dans le NOM du tableau. */
  const contacts = [
    ...personne.telephones.map((c) => ({ ...c, sorte: 'telephone' as const, quoi: 'le numéro' })),
    ...personne.emails.map((c) => ({ ...c, sorte: 'email' as const, quoi: 'l’adresse e-mail' })),
  ];

  return (
    <div className={`rdf-personne${personne.expediteur ? ' rdf-personne--expediteur' : ''}`}>
      <p className="rdf-personne-tete">
        <span className="rdf-sorte">{motRole(personne.role)}</span>
        <span className="rdf-personne-nom">{personne.nom}</span>
        {qualite !== null && <span className="rdf-note">{qualite}</span>}
        {/* 🔴 LE MOT « Expéditeur », jamais la couleur seule : c'est lui qui porte l'information. */}
        {personne.expediteur && <span className="rdf-expediteur">Expéditeur</span>}
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
              /* ⚠️ MÊME RAISON QUE DANS `PropositionsDeBiens` : la note vit HORS de la ligne, qui garde son
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
  text-transform:uppercase;color:var(--color-svv-red);border:1px solid var(--color-svv-red);white-space:nowrap}
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
.rdf-pied-panneau{display:flex;flex-direction:column;gap:6px;margin:8px 0 0;min-width:0}
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
/* LOT STATUT-PAR-MAIL — le detail par mail, REPLIE. On ne cache rien : on cesse de repeter. */
.rdf-detail-mails{margin-top:2px}
.rdf-resume{font-size:.78rem;color:var(--color-svv-muted);cursor:pointer}
.rdf-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.rdf-sous-liste{display:flex;flex-direction:column;gap:6px;margin:6px 0 0;padding:0 0 0 10px;list-style:none;
  border-left:2px solid var(--color-svv-line)}
.rdf-sous-item{display:flex;flex-direction:column;gap:2px;min-width:0}
@media (max-width:520px){
  /* ⚠️ MEME A 390 px, LA LIGNE NE SE REPLIE PAS : « Copier » doit rester sur la ligne de sa valeur. On retrecit
     le titre, la valeur tronque — c'est exactement ce que la troncature est la pour faire. */
  .rdf-contact-libelle{flex-basis:3.6rem}
}
`;
