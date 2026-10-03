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
  adresseDossierDrive, adresseFicheAnnuaire, motNbMails, motPeriode, motRole, motSansLocataire, motStatutBien,
  motSurface, qualitePersonne,
  AUCUN_BIEN_DU_MAIL, biensDuMail, ENCADRE_EXCEPTION_CE_MAIL, MENTION_AJOUT_PONCTUEL, motEnTeteMail,
  MOT_CHANGER_REGLE_SUIVI, MOT_MODIFIER_BIENS_DU_MAIL, resumeModificationBiens, TITRE_BIENS_DU_MAIL,
  type BienRattache, type FicheRattachementFil, type PersonneRattachement,
} from '../../../../lib/gestion/ficheRattachement';
/* 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT — LA RÈGLE DE SUIVI ET SON ALERTE VIENNENT DE LA SOURCE.
   `CHOIX_SUIVI` vit dans `EncartRattachement` depuis le lot BROUILLONS-APERCU-TYPES-LIBELLES, et il y est exporté
   précisément pour cela : les mots et les aides ne se recopient pas d'un écran à l'autre. */
import { CHOIX_SUIVI } from './EncartRattachement';
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

export function RattachementsDuFil({ filId, titre, messageId = null, onFerme, onGeste }: {
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
  const ecrire = async (voulus: readonly { cle: string; libelle: string }[], choix: ChoixSuivi): Promise<void> => {
    if (mailId === null) return;
    setErreur(null);
    const classement: Classement = { sorte: 'biens', biens: voulus.map((b) => ({ ...b })) };
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
        {fiche !== null && <p className="rdf-detail">{motNbMails(fiche.nbMailsDuFil)}</p>}

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
            /* 🔴 LA FENÊTRE NE PARLE QUE D'UN MAIL : « sur 1 mail » n'apprend rien, et le détail ne montre que
               ses liens à lui. Voir `biensDuMail`. */
            surUnSeulMail
            liens={b.lienIds.map((id) => liensParId.get(id)).filter((l): l is LienAffiche => l !== undefined)}
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
            /* 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS — LA ZONE (a) D'ARNO : ce qui EST rattaché, avec son ✕.
               La fenêtre est seule à le savoir : c'est elle qui lit les liens vivants du mail. */
            dejaRattaches={biens.map((b) => ({ cle: b.cle, libelle: libellesDuMail[b.cle] ?? b.cle }))}
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

        <div className="mrt-boutons">
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

/** UN BIEN : sa fiche, ses personnes, ses gestes. */
function BlocBien({ bien, dossierId, liens, onModifier, ponctuel = false, surUnSeulMail = false }: {
  bien: BienRattache;
  dossierId: string | null;
  liens: LienAffiche[];
  onModifier: (l: LienAffiche) => void;
  /** 🔴 « Il est marqué “ajout ponctuel” dans la fenêtre » (Arno). Voir `MOTIF_AJOUT_PONCTUEL`. */
  ponctuel?: boolean;
  /** Ouverte sur un mail : la carte ne parle que de lui, et n'annonce pas « sur N mails de la conversation ». */
  surUnSeulMail?: boolean;
}) {
  const drive = adresseDossierDrive(dossierId);
  return (
    <section className="rdf-item" aria-label={bien.adresseComplete}>
      <div className="rdf-tete">
        <span className="rdf-cible">{bien.adresseComplete}</span>
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

      {/* 🔒 LE DOSSIER DU BIEN : une ADRESSE que le navigateur ouvre, jamais un appel de l'application à Google.
          Nouvel onglet, en lecture, avec les droits Google de la personne connectée. */}
      {drive !== null && (
        <p className="rdf-detail">
          <a className="rdf-lien" href={drive} target="_blank" rel="noopener noreferrer">
            Ouvrir le dossier du bien <span aria-hidden="true">↗</span>
          </a>
          <span className="rdf-note"> — dans Google Drive, en lecture</span>
        </p>
      )}

      {/* ══ 🔴 LES PERSONNES, L'EXPÉDITEUR EN TÊTE ═════════════════════════════════════════════════════════ */}
      {bien.personnes.filter((p) => p.role === 'proprietaire').length === 0 && (
        <p className="rdf-detail rdf-absent">Aucun propriétaire connu pour ce lot dans l’annuaire.</p>
      )}
      {bien.personnes.map((p) => <CartePersonne key={`${p.role}-${p.cle}`} personne={p} />)}
      {/* 🔴 « VACANT À CETTE DATE » EST UNE RÉPONSE, pas un vide : il explique pourquoi le mail vient du bailleur. */}
      {bien.personnes.filter((p) => p.role === 'locataire').length === 0 && (
        <p className="rdf-detail rdf-absent">{motSansLocataire(bien.dateMail)}</p>
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
.rdf-item{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;padding:10px;
  border:1px solid var(--color-svv-line);border-radius:.6rem;background:var(--color-svv-surface);min-width:0}
.rdf-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;min-width:0}
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
.rdf-note{font-size:.74rem;color:var(--color-svv-muted)}
.rdf-lien{font-size:.78rem;font-weight:600;color:var(--color-svv-red)}
.rdf-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
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
