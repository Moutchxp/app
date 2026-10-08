'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * 🔴 DEPUIS LES MODULES **PURS**, JAMAIS DEPUIS LE DÉPÔT. Ce composant vit dans le navigateur : importer
 * `mongaEtapeRepo` le ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire
 * TOUTE l'application — page de connexion comprise (incident du 24/09/2026). Le garde
 * `clientBoundary.guard.test.ts` le vérifie.
 */
import {
  cleDOuverture, construireFrise, etapeOuvrable, motAjout, motDateEtape, motGroupeMessages,
  motMailDOrigine, motMontant, motSource, pictoSource, rangerEnLigne, referencesDeLaFrise,
  type CaseFrise, type ElementFrise, type EtapeAAfficher,
} from '../../../../lib/gestion/frise';
import {
  cartesDuReservoir, confirmationCarte,
  estRepere, motEtape, TYPES_INFORMATION, TYPES_RESERVOIR, type TypeEtape,
} from '../../../../lib/gestion/mongaEtape';
/* 🔴🔴 LE DÉFILEMENT, PARTAGÉ AVEC LA FRISE DES MAILS. Arno, B.3 : « même code, pas de second chemin. » */
import { useDefilementFrise } from './useDefilementFrise';

/**
 * ══ 🔴🔴 LOT FRISE-HORIZONTALE — LA FRISE D'AVANCEMENT, EN LIGNE ═════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « la frise d'avancement devient HORIZONTALE. La liste verticale actuelle
 * disparaît. Données, règles et gestes du lot MONGA-2 inchangés (même module `frise.ts`, aucune perte de
 * fonction). Une seule ligne horizontale, de gauche (plus ancien) à droite (plus récent), reliée par un trait
 * fin. […] VRAIES ÉTAPES = CARRÉS […] MESSAGES SIMPLEMENT INFORMATIFS : petits points discrets posés sur le
 * trait ENTRE les carrés. […] Juste APRÈS le dernier carré d'étape réellement atteinte : un carré “+”. »
 *
 * ═══ 🔴🔴 CE QUI A CHANGÉ, ET CE QUI N'A PAS BOUGÉ D'UN IOTA ════════════════════════════════════════════════════
 *
 * A CHANGÉ : la mise en page, et elle seule. `rangerEnLigne` (module pur) tisse carrés, points et « + » en une
 * suite ; la feuille les pose sur une ligne qui défile.
 *
 * N'A PAS BOUGÉ : `construireFrise`, l'ordre chronologique, les pointillés, les devis comptés par référence, les
 * mots, « étape déduite — aucun mail », la garde SQL sur les étapes Monga, la proposition de clôture, le montant
 * complété à la main, le passage en fiable proposé sans être appliqué. Les épreuves du lot MONGA-2 les tiennent
 * toujours, inchangées.
 *
 * 🔴 LE FORMULAIRE SOUS LA FRISE A ÉTÉ REPRIS PAR LE « + » — et c'est la seule chose retirée, Arno l'ayant
 * accordé en toutes lettres : « Le formulaire “Ajouter une étape” toujours visible sous la frise disparaît,
 * puisqu'il est repris par le “+”. » Rien d'autre n'a été retiré, masqué ni conditionné.
 *
 * ═══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE (06/10/2026) — LA FRISE N'IMPOSE PLUS AUCUNE SUITE ═════════════════════════════
 *
 * DEMANDE D'ARNO : « la frise d'avancement n'impose plus aucune suite d'étapes. Elle se CONSTRUIT avec les vraies
 * étapes, dans l'ordre réel (ex. rendez-vous → devis refusé → nouveau rendez-vous → nouveau devis…). ACCORD
 * D'ARNO : les carrés “attendue” en pointillé sont supprimés. »
 *
 * CE QUI A DISPARU : les carrés en pointillé. Ils PROMETTAIENT un chemin — une ouverture, un devis, une
 * acceptation, une intervention, une clôture, une fois chacun, dans cet ordre — que le dossier réel ne suit pas.
 *
 * CE QUI LES REMPLACE : un RÉSERVOIR. Un clic sur n'importe quel « + » ouvre, sous la frise, les cartes à contour
 * rouge que l'on peut poser ; un clic sur l'une d'elles demande sa date, et elle entre dans la frise en VERT, à
 * sa place chronologique. Chaque type est posable autant de fois que nécessaire.
 *
 * 🔴 TROIS COULEURS, ET CHACUNE DIT UN ÉTAT : ROUGE = à poser (le réservoir, le « + ») · VERT = dans la frise
 * (Monga comme manuelle) · AMBRE = Monga « à confirmer ». Elles ne portent jamais l'information seules — la
 * source est écrite dans la bulle et au lecteur d'écran, et les formes diffèrent aussi.
 *
 * ⚠️ RIEN N'EST PERDU DE MONGA-2 : mêmes données, même module `frise.ts`, mêmes routes, permanence intacte. Les
 * cartes Monga arrivent toujours seules, à leur date, non modifiables ; « à confirmer » garde ses deux boutons ;
 * la proposition de clôture est inchangée.
 *
 * ⚠️ LE DÉFILEMENT HORIZONTAL NE DOIT JAMAIS PIÉGER LA PAGE — révisé au lot FRISES-REPARATION (B). La molette
 * verticale est désormais CONVERTIE en défilement de la frise, mais **uniquement tant que la frise peut encore
 * avancer de ce côté** ; arrivée en butée, elle rend la main à la page, exactement comme avant. C'est la demande
 * d'Arno, et c'est la seule forme qui ne piège pas le lecteur dans le bloc. Tout cela vit dans
 * `useDefilementFrise`, partagé avec la frise des mails.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Reponse {
  etat?: string;
  etapes?: EtapeAAfficher[];
  /**
   * 🔴🔴 LOT CLOTURE-REOUVERTURE — `proposerCloture` A QUITTÉ CE CONTRAT. Il portait la ligne « Clôturer cet
   * événement ? », qui fermait le dossier EN UN CLIC ; Arno demande de la retirer, et de ne fermer que par une
   * carte « Clôture ». À sa place, ce que la GRILLE a besoin de savoir : l'événement est-il ouvert ?
   *
   * ⚠️ `undefined` (une route d'avant ce lot) VAUT « OUVERT », et c'est le repli le moins trompeur : on propose
   * alors « Clôture » comme avant, plutôt que « Réouverture » sur un dossier qui ne l'est pas.
   */
  ouvert?: boolean;
  passagesEnFiableProposes?: { type: TypeEtape; confirmees: number }[];
  /** 🔴 LOT FRISE-CONSTRUCTIBLE — la date d'ouverture de l'ÉVÉNEMENT : la première carte de la frise. */
  ouvertLe?: string;
  erreur?: string;
}

/**
 * Le jour d'aujourd'hui, en local, au format `AAAA-MM-JJ`.
 *
 * ⚠️ PAS DE `toISOString()`, ET C'EST UN PIÈGE DÉJÀ PAYÉ DANS CE DÉPÔT : il rend l'UTC, et à 23 h à Paris en
 * hiver il écrit DÉJÀ le lendemain. Un formulaire qui propose « demain » par défaut un soir sur deux fabrique des
 * dates fausses sans que personne ne le remarque. On lit donc les champs locaux.
 */
function aujourdhuiLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function FriseAvancement({
  evenementId, onGeste, onOuvrirFil, onEtatEvenement, compact = false,
}: {
  evenementId: number;
  /** Le compte rendu remonte à l'écran qui porte la frise : un seul bandeau par écran, jamais deux. */
  onGeste?: (message: string) => void;
  /** Ouvrir le mail d'origine d'une étape Monga. Absent = l'étape n'est pas cliquable. */
  onOuvrirFil?: (filId: number) => void;
  /**
   * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — `onProposerCloture` A ÉTÉ RETIRÉ ════════════════════════════════════════
   *
   * Il portait la ligne « Clôturer cet événement ? » de la frise — la fermeture EN UN CLIC. Arno (08/10/2026) :
   * « Retire la ligne ou le bouton qui permettait de fermer un événement en un seul clic (ailleurs que par la
   * carte Clôture). »
   *
   * 🔴 CE QU'IL PROTÉGEAIT EST RENFORCÉ, PAS PERDU : fermer restait un geste humain (« jamais automatique »),
   * et le reste — mais il passe désormais par une CARTE, qui porte une date et demeure sur la frise. On ne perd
   * pas un garde-fou, on gagne une trace. La fermeture elle-même emprunte toujours `changerEtatEvenement`.
   */
  /**
   * ══ 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — « L'ÉTAT DE CET ÉVÉNEMENT VIENT DE CHANGER » ════════════════════
   *
   * CONSTAT D'ARNO (08/10/2026) : il rouvre l'événement du bien 315 par la carte « Réouverture », et la bande
   * orange de la fiche ne revient pas. Elle est pourtant SUR LA MÊME PAGE, quelques centimètres plus haut.
   *
   * 🔴 PARCE QUE PERSONNE NE LA PRÉVIENT. La frise relit SA frise (`charger`), et c'est tout : l'en-tête de la
   * fiche, le bloc « Événements » et les lignes de l'historique gardent ce qu'ils avaient lu en arrivant. Arno
   * demande que la bande « revienne après une réouverture, SANS rechargement manuel » — il faut donc un signal.
   *
   * 🔴 IL NE PART QUE QUAND L'ÉTAT A VRAIMENT CHANGÉ, et la ROUTE le dit (`etatEvenement`). Le faire partir à
   * chaque carte ferait relire toute la fiche pour un simple « Devis reçu ».
   *
   * ⚠️ ABSENT ⇒ RIEN, et la frise est exactement celle d'avant ce lot : c'est ce qui la garde rendable hors de
   * la fiche du bien.
   */
  onEtatEvenement?: () => void;
  /** Dans la fiche du bien, la frise est plus serrée : même contenu, moins de marges. */
  compact?: boolean;
}) {
  const [vue, setVue] = useState<
    { v: 'charge' } | { v: 'erreur'; m: string } | { v: 'ok'; d: Reponse }
  >({ v: 'charge' });
  /**
   * ══ 🔴🔴 LA BULLE VIT **HORS** DE LA PISTE — DÉFAUT MESURÉ À L'ÉCRAN LE 06/10/2026 ═════════════════════════
   *
   * En CSS, `overflow-x:auto` force l'autre axe à `auto` : la piste devient un conteneur de défilement
   * VERTICAL, et tout ce qui en dépasse est COUPÉ. Mesuré : une bulle ouverte était tronquée de 132 px, puis
   * encore de 34 px après avoir réservé de la place sous la rangée — la hauteur visible de la piste (182 px) ne
   * suit pas celle de son contenu (274 px). C'est une impasse : on ne peut pas réserver assez.
   *
   * 🔴 LA BULLE EST DONC RENDUE SOUS LA FRISE, hors du conteneur qui défile. Elle n'est plus jamais coupée, elle
   * tient sur un écran étroit, et elle garde les deux chemins qu'Arno demande : le SURVOL la montre
   * (`apercu`), le CLIC la fixe (`fixe`) — « au survol (et au clic au clavier) ».
   *
   * ═══ 🔴🔴 LOT FRISE-COMPACTE — LES DEUX CHEMINS NE SE POSENT PLUS AU MÊME ENDROIT ═══════════════════════════
   *
   * Arno (06/10/2026) : « L'ESPACE EN DESSOUS ne se déploie QUE lorsqu'une action le demande : clic sur une
   * carte ou un point (bulle de détail), clic sur un “+” (réservoir), formulaire d'ajout ou de modification. »
   *
   * 🔴 LE SURVOL N'EST PAS UNE ACTION QUI DÉPLOIE. S'il déployait, passer la souris sur la frise ferait sauter
   * de 92 px tout ce qui est en dessous — l'historique du bien — à chaque fois qu'on l'effleure. La bulle de
   * SURVOL est donc FLOTTANTE : elle se pose par-dessus, et ne prend aucune place dans le flux.
   *
   * 🔴 LE CLIC, LUI, DÉPLOIE : c'est une intention, elle dure, et l'on veut lire la bulle sans garder la souris
   * immobile. Même composant, même contenu, une seule classe de différence — deux rendus distincts auraient fini
   * par diverger sur « mail supprimé — étape conservée », comme l'avertit déjà `BulleDetail`.
   */
  const [apercu, setApercu] = useState<string | null>(null);
  const [fixe, setFixe] = useState<string | null>(null);
  const ouvert = fixe ?? apercu;
  const [ajout, setAjout] = useState(false);
  /**
   * ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — LE RÉSERVOIR, ET LA DATE QU'IL PROPOSE ══════════════════════════════════
   *
   * `null` = fermé. Ouvert, il porte le JOUR PROPOSÉ par le « + » qui l'a ouvert : aujourd'hui pour le gros
   * « + » de fin, une date entre les deux voisines pour un « + » intercalaire (Arno, point 4).
   *
   * 🔴 UN SEUL RÉSERVOIR POUR TOUS LES « + », et c'est la raison pour laquelle il vit ici plutôt que dans chaque
   * carré : deux réservoirs ouverts côte à côte, chacun avec sa date, seraient deux formulaires concurrents pour
   * le même geste. Le « + » qui l'ouvre ne fait que lui passer une date de départ.
   */
  const [reservoir, setReservoir] = useState<{ jour: string } | null>(null);
  /**
   * 🔴 LE TYPE CHOISI DANS LE RÉSERVOIR. Le formulaire s'ouvre avec sa carte déjà désignée — c'est ce que
   * « clic sur un carré du réservoir → petit formulaire » veut dire (Arno, point 2).
   */
  const [typePose, setTypePose] = useState<TypeEtape | null>(null);
  /**
   * 🔴🔴 LOT ATTENTION-ET-MODIFIER — L'ÉTAPE MANUELLE QU'ON MODIFIE. `null` = on ajoute.
   *
   * DEMANDE D'ARNO : « dans la bulle d'une étape ou d'une information ajoutée à la main, ajoute “Modifier”, à
   * côté de “Retirer”. Il rouvre le même formulaire prérempli (type, date, heure, texte) et passe par la route
   * PATCH existante. Les étapes Monga restent non modifiables. »
   *
   * 🔴 LE MÊME FORMULAIRE, ET NON UN SECOND. Un panneau d'édition écrit à part aurait fini par proposer d'autres
   * types que l'ajout, ou par oublier la bascule « Étape / Simple information ». C'est le même composant, avec
   * une valeur de départ.
   */
  const [modifie, setModifie] = useState<EtapeAAfficher | null>(null);
  const [occupe, setOccupe] = useState(false);
  /**
   * ══ 🔴🔴 LE DÉFILEMENT VIENT DU CROCHET PARTAGÉ, ET DE NULLE PART AILLEURS ═════════════════════════════════
   *
   * Arno, point B.3 : « Applique les MÊMES règles de défilement à la frise des mails (A) : même code, pas de
   * second chemin. » Les flèches, la molette, le glisser, le clavier et le calage d'ouverture sont dans
   * `useDefilementFrise` — ce composant n'en garde aucune copie.
   *
   * ⚠️ `vue` EN TÉMOIN DE RELECTURE : la largeur de la piste change à chaque relecture (une étape confirmée,
   * un montant saisi), et les flèches doivent se remesurer sans qu'on touche la frise.
   */
  const defilement = useDefilementFrise<HTMLOListElement>(vue);
  const { bords } = defilement;

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${evenementId}/frise`, { cache: 'no-store' });
      const d = (await res.json()) as Reponse;
      if (d.etat !== 'ok') { setVue({ v: 'erreur', m: d.erreur ?? 'Frise indisponible.' }); return; }
      setVue({ v: 'ok', d });
    } catch {
      setVue({ v: 'erreur', m: 'La frise n’a pas répondu.' });
    }
  }, [evenementId]);

  useEffect(() => { void charger(); }, [charger]);

  /**
   * 🔴 « ÉCHAP OU “FERMER” REFERME LE RÉSERVOIR » (Arno, point 2). Les deux, et c'est le minimum : la souris a
   * son bouton, le clavier a sa touche. Un panneau qu'on ne peut fermer qu'à la souris piège celui qui vient
   * d'y saisir une date au clavier.
   *
   * ⚠️ L'ÉCOUTEUR N'EXISTE QUE TANT QUE LE RÉSERVOIR EST OUVERT : un écouteur global permanent intercepterait
   * Échap pour tous les autres panneaux de l'écran, qui ont le leur.
   */
  const fermerReservoir = useCallback((): void => {
    setReservoir(null); setAjout(false); setTypePose(null); setModifie(null);
  }, []);

  /**
   * ══ 🔴🔴 LOT FRISE-COMPACTE — TOUT REFERMER, ET LES QUATRE FAÇONS DE LE DEMANDER ═══════════════════════════
   *
   * Arno, point 2 : « Il se replie dès que l'action est terminée ou annulée (Échap, “Fermer”, clic à côté,
   * validation). Une seule zone ouverte à la fois. »
   *
   * 🔴 UNE SEULE PORTE DE FERMETURE. Avant ce lot, Échap ne fermait que le réservoir, et la bulle n'avait aucun
   * moyen de se refermer autrement qu'en recliquant exactement la carte qui l'avait ouverte. Quatre chemins vers
   * la même fin demandent une seule fonction, sans quoi l'un d'eux oublie toujours quelque chose.
   */
  const toutRefermer = useCallback((): void => {
    setReservoir(null); setAjout(false); setTypePose(null); setModifie(null);
    setFixe(null); setApercu(null);
  }, []);

  /**
   * ⚠️ L'ÉCOUTEUR N'EXISTE QUE TANT QU'UNE ZONE EST OUVERTE. Un écouteur global permanent intercepterait Échap
   * pour tous les autres panneaux de l'écran, qui ont le leur — et écouterait chaque clic de la page pour rien.
   *
   * ⚠️ `pointerdown` ET NON `click` POUR LE « CLIC À CÔTÉ » : un `click` naît à la MONTÉE du pointeur, après que
   * nos propres gestionnaires ont agi — et un glisser de la frise qui se termine hors du bloc aurait alors
   * refermé la zone qu'on venait d'ouvrir. La descente dit l'intention au bon moment.
   */
  const quelqueChoseEstOuvert = reservoir !== null || ajout || fixe !== null;
  const moi = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!quelqueChoseEstOuvert) return undefined;
    const surTouche = (e: KeyboardEvent): void => { if (e.key === 'Escape') toutRefermer(); };
    const surClicAilleurs = (e: PointerEvent): void => {
      const cible = e.target;
      if (cible instanceof Node && moi.current !== null && moi.current.contains(cible)) return;
      toutRefermer();
    };
    window.addEventListener('keydown', surTouche);
    document.addEventListener('pointerdown', surClicAilleurs);
    return () => {
      window.removeEventListener('keydown', surTouche);
      document.removeEventListener('pointerdown', surClicAilleurs);
    };
  }, [quelqueChoseEstOuvert, toutRefermer]);

  /**
   * Ouvrir le réservoir à partir d'un « + » — gros (aujourd'hui) ou intercalaire (date entre les voisines).
   *
   * 🔴 IL FERME LA BULLE : « une seule zone ouverte à la fois » (Arno). Deux panneaux déployés l'un sous l'autre
   * rendraient au bloc la hauteur de trois lignes qu'on vient justement de lui retirer.
   */
  const ouvrirReservoir = useCallback((jour: string): void => {
    setFixe(null); setApercu(null);
    setModifie(null); setTypePose(null); setAjout(false); setReservoir({ jour });
  }, []);

  /** Fixer (ou défixer) la bulle d'une carte. Elle ferme le réservoir, pour la même raison. */
  const setOuvert = useCallback((cle: string | null): void => {
    setReservoir(null); setAjout(false); setTypePose(null); setModifie(null);
    setFixe(cle);
  }, []);

  const agir = async (url: string, methode: 'PATCH' | 'DELETE', corps?: unknown): Promise<void> => {
    if (occupe) return;
    setOccupe(true);
    try {
      const res = await fetch(url, {
        method: methode,
        ...(corps === undefined ? {} : {
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string; erreur?: string };
      onGeste?.(d.etat === 'ok' ? (d.message ?? 'Fait.') : (d.erreur ?? 'Geste impossible.'));
      if (d.etat === 'ok') await charger();
    } catch {
      onGeste?.('Geste impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  if (vue.v === 'charge') return <p className="gst-info" role="status">Lecture de la frise…</p>;
  if (vue.v === 'erreur') {
    return (
      <div className="fav">
        <style>{CSS_FRISE_AVANCEMENT}</style>
        <p className="gst-tronc" role="alert">{vue.m}</p>
      </div>
    );
  }

  const etapes = vue.d.etapes ?? [];
  const aujourdhui = aujourdhuiLocal();
  /**
   * 🔴 LA DATE D'OUVERTURE DE L'ÉVÉNEMENT PORTE LA PREMIÈRE CARTE (Arno, point 1). Quand une étape d'ouverture
   * existe déjà — accusé de réception Monga, repli posé par MONGA-2, ouverture manuelle — c'est ELLE qui compte,
   * et `construireFrise` n'en ajoute aucune : rien n'est doublé, rien n'est remplacé.
   */
  const { majeures, reperes } = construireFrise(etapes, vue.d.ouvertLe ?? null);
  const ligne = rangerEnLigne(majeures, reperes, aujourdhui);
  const plusieursRefs = referencesDeLaFrise(etapes).length > 1;
  const cleOuverture = cleDOuverture(majeures);
  /**
   * 🔴 CE QUE L'ON MONTRE, ET OÙ. Une seule bulle à la fois — deux ouvertes feraient lire la mauvaise.
   *
   * 🔴🔴 LOT FRISE-COMPACTE : la FIXÉE (un clic) déploie l'espace sous la frise ; la SURVOLÉE flotte par-dessus
   * et ne pousse rien. `fixe` l'emporte quand les deux désignent quelque chose : on vient de cliquer, la souris
   * n'a pas encore quitté la carte, et c'est la bulle déployée qui doit rester.
   */
  const etapeDe = (cle: string | null): EtapeAAfficher | null => (cle === null ? null
    : etapes.find((x) => `p${x.id}` === cle || `c${x.id}` === cle) ?? null);
  const detailFixe = etapeDe(fixe);
  const detailApercu = detailFixe !== null ? null : etapeDe(apercu);
  const detailAffiche = detailFixe ?? detailApercu;
  const motDuDetail = detailAffiche === null ? ''
    : (majeures.find((c) => c.etape?.id === detailAffiche.id)?.mot ?? motEtape(detailAffiche.type));

  return (
    <section ref={moi} className={`fav${compact ? ' fav--compact' : ''}`}
      aria-label="Avancement de l’événement">
      <style>{CSS_FRISE_AVANCEMENT}</style>

      {/* ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — LA PROPOSITION DE CLÔTURE A ÉTÉ RETIRÉE D'ICI ═══════════════════
          Elle disait « Une intervention est signalée réalisée. Clôturer cet événement ? » et fermait le dossier
          EN UN CLIC. Arno la retire : on ferme en POSANT une carte « Clôture », qui demande confirmation et
          reste sur la frise. `.fav-lien` sert encore ailleurs (le détail d'une carte) ; `.fav-proposition`, en
          revanche, n'avait que cet unique porteur et part avec lui — une règle orpheline finit toujours par
          être recâblée « parce qu'elle est encore là ». */}

      <div className="fav-piste-cadre">
        {/* ⚠️ LES FLÈCHES N'APPARAISSENT QUE S'IL RESTE DU CONTENU CACHÉ (Arno). Une flèche qui ne mène nulle
            part apprend à ne plus regarder les flèches. */}
        {bords.gauche && (
          <button type="button" className="fav-fleche fav-fleche--g" aria-label="Voir les étapes précédentes"
            onClick={() => defilement.glisser(-1)}>‹</button>
        )}
        {bords.droite && (
          <button type="button" className="fav-fleche fav-fleche--d" aria-label="Voir les étapes suivantes"
            onClick={() => defilement.glisser(1)}>›</button>
        )}

        {/**
          * 🔴 UNE LISTE ORDONNÉE, et non une rangée de `div` : une frise EST une séquence, et c'est ce qu'un
          * lecteur d'écran doit entendre. Le trait qui relie les carrés est décoratif, posé en CSS.
          *
          * 🔴🔴 TOUS LES GESTES VIENNENT DE `attaches` — molette (en écouteur NON passif, le seul moyen de
          * détourner la molette), glisser, clavier ← →, et l'annulation du clic après un glisser. Il n'y a plus
          * un seul gestionnaire de défilement écrit ici : « même code, pas de second chemin » (Arno).
          */}
        <ol className="fav-piste" ref={defilement.ref} {...defilement.attaches}>
          {ligne.map((el) => (
            <ElementDeLaFrise
              key={el.cle} el={el} avecReference={plusieursRefs} occupe={occupe}
              cleOuverture={cleOuverture} calerSurUneFois={defilement.calerSurUneFois}
              ouvert={ouvert} onOuvrir={setOuvert} onSurvol={setApercu}
              onOuvrirFil={onOuvrirFil}
              onConfirmer={(id, g) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: g })}
              onMontant={(id, cents) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: 'montant', montantCents: cents })}
              onRetirer={(id) => void agir(`/api/admin/gestion/etapes/${id}`, 'DELETE')}
              onAjouter={ouvrirReservoir} aujourdhui={aujourdhui}
              onOuverture={(j) => void agir(
                `/api/admin/gestion/evenements/${evenementId}/frise`, 'PATCH',
                { geste: 'ouverture', survenuLe: j })}
            />
          ))}
        </ol>

        {/**
          * ══ 🔴🔴 LOT FRISE-COMPACTE — LA BULLE DE SURVOL, FLOTTANTE ════════════════════════════════════════
          *
          * Elle se pose PAR-DESSUS ce qui suit, et ne prend aucune place : c'est ce qui permet de supprimer les
          * 92 px de vide qu'`.fav-zone` réservait en permanence sans faire sauter la page à chaque survol.
          *
          * 🔴 DANS `.fav-piste-cadre` (positionné), ET NON DANS `.fav-piste` : la piste est un conteneur de
          * défilement, et tout ce qui en dépasse y est COUPÉ — c'est le défaut mesuré au lot FRISE-HORIZONTALE
          * (132 px de texte tronqués). Le cadre, lui, ne coupe rien.
          *
          * ⚠️ `pointer-events:none` EN FEUILLE : une bulle flottante sous la souris masquerait la carte suivante
          * et empêcherait de la survoler. Elle se regarde, elle ne se clique pas — le clic, c'est la bulle
          * déployée, qui porte les gestes.
          */}
        {detailApercu !== null && (
          <div className="fav-flottante" aria-hidden="true">
            <BulleDetail
              e={detailApercu} occupe mot={motDuDetail}
              onMontant={() => undefined} onRetirer={() => undefined} onModifier={() => undefined}
            />
          </div>
        )}
      </div>

      {/**
        * ══ 🔴🔴 LE RÉSERVOIR, JUSTE SOUS LA FRISE (Arno, point 2) ═════════════════════════════════════════════
        *
        * 🔴 SOUS LA FRISE, ET NON DEDANS. La piste est un conteneur de défilement : en CSS, `overflow-x:auto`
        * force l'autre axe à `auto`, et tout ce qui dépasse est COUPÉ — mesuré à 132 px de texte tronqué pour la
        * bulle, au lot FRISE-HORIZONTALE. Un réservoir de quatorze cartes y serait illisible, et il défilerait
        * horizontalement avec la frise au lieu de rester sous les yeux.
        */}
      {(reservoir !== null || ajout) && (
        <div className="fav-reservoir" role="group" aria-label="Ajouter une carte à la frise">
          {ajout ? (
            <AjouterEtape
              evenementId={evenementId} typeImpose={typePose} modifie={modifie}
              jourDefaut={reservoir?.jour ?? aujourdhui}
              onFermer={fermerReservoir}
              onRetour={modifie === null ? () => { setAjout(false); setTypePose(null); } : undefined}
              /* 🔴 LOT MARQUES-EVENEMENT-EN-COURS — quand l'état a changé, on prévient la fiche AVANT de relire
                 la frise : la bande orange, le bloc « Événements » et les lignes de mail se mettent à jour du
                 même geste, sans rechargement à la main (Arno). */
              onFait={(m, etatChange) => {
                onGeste?.(m);
                if (etatChange === true) onEtatEvenement?.();
                fermerReservoir();
                void charger();
              }}
            />
          ) : (
            <Reservoir
              jour={reservoir?.jour ?? aujourdhui}
              /* 🔴 LOT CLOTURE-REOUVERTURE — « Clôture » si le dossier est ouvert, « Réouverture » s'il est
                 clos, jamais les deux (Arno). `undefined` = une route d'avant ce lot : on retombe sur
                 « ouvert », c'est-à-dire la grille d'avant. */
              evenementOuvert={vue.d.ouvert !== false}
              onChoisir={(t) => { setTypePose(t); setAjout(true); }}
              onFermer={fermerReservoir}
            />
          )}
        </div>
      )}

      {/**
        * ══ 🔴🔴 LA BULLE, SOUS LA FRISE ET HORS DU CONTENEUR QUI DÉFILE ═══════════════════════════════════════
        *
        * Arno : « Au survol (et au clic au clavier), une bulle affiche la date, l'auteur et le texte. »
        *
        * 🔴 ELLE EST ICI, ET NON COLLÉE AU POINT, parce qu'une bulle rendue DANS la piste est coupée : en CSS,
        * `overflow-x:auto` force l'autre axe à `auto`, et la hauteur visible de la piste ne suit pas celle de
        * son contenu. Mesuré à l'écran : 132 px de texte coupés, puis encore 34 px après avoir réservé de la
        * place. Sous la frise, elle n'est jamais tronquée, et elle tient sur un écran étroit.
        *
        * ══ 🔴🔴 LOT FRISE-COMPACTE — CE QUI A ÉTÉ RETIRÉ ICI, ET POURQUOI ═════════════════════════════════════
        *
        * `.fav-zone` réservait **92 px de vide en permanence** (mesuré ce 06/10 sur lot-237 : conteneur 234 px =
        * 132 de piste + 10 de marge + 92 de vide). C'est la « deuxième ligne » qu'Arno voit à l'ouverture, et
        * elle était là même sans aucune bulle.
        *
        * Elle avait sa raison : sans elle, la page sautait d'une centaine de pixels à chaque SURVOL d'un point.
        * 🔴 LA VRAIE RÉPONSE N'ÉTAIT PAS DE RÉSERVER LE VIDE, C'ÉTAIT DE SORTIR LE SURVOL DU FLUX. La bulle de
        * survol est maintenant FLOTTANTE (elle se pose par-dessus et ne pousse rien), et seule la bulle FIXÉE
        * par un clic déploie l'espace — qui n'existe alors que tant qu'elle est là.
        */}
      {detailFixe !== null && (
        <div className="fav-zone" aria-live="polite">
          <BulleDetail
            e={detailFixe} occupe={occupe} onOuvrirFil={onOuvrirFil}
            onModifier={(x) => { setModifie(x); setTypePose(null); setAjout(true); setFixe(null); }}
            onMontant={(id, cents) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: 'montant', montantCents: cents })}
            onRetirer={(id) => void agir(`/api/admin/gestion/etapes/${id}`, 'DELETE')}
            onFermer={() => setFixe(null)}
            mot={motDuDetail} />
        </div>
      )}

      {/* ══ LA PROPOSITION D'ARNO : passer un motif en automatique fiable ═══════════════════════════════════
          🔴 PROPOSÉE, JAMAIS APPLIQUÉE (« propose-moi (sans l'appliquer) »). Un seul écart suffit à la retirer,
             même à cinquante confirmations — voir `proposerPassageEnFiable`. */}
      {(vue.d.passagesEnFiableProposes ?? []).length > 0 && (
        <p className="fav-fiable" role="status">
          {(vue.d.passagesEnFiableProposes ?? []).map((p) => (
            <span key={p.type}>
              « {motEtape(p.type)} » a été confirmée {p.confirmees} fois sans être écartée —
              à passer en automatique fiable ? (décision d’Arno, rien n’est appliqué)
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   UN ÉLÉMENT DE LA LIGNE : un carré, un groupe de points, ou le « + »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function ElementDeLaFrise(p: {
  el: ElementFrise; avecReference: boolean; occupe: boolean; cleOuverture: string | null;
  calerSurUneFois: (cible: HTMLElement | null) => void;
  ouvert: string | null; onOuvrir: (c: string | null) => void;
  onSurvol: (cle: string | null) => void;
  onOuvrirFil?: (filId: number) => void;
  onConfirmer: (id: number, geste: 'confirmer' | 'ecarter') => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  /** Ouvrir le réservoir avec une date de départ — le gros « + » comme les intercalaires. */
  onAjouter: (jour: string) => void;
  aujourdhui: string;
  /** Corriger la date d'ouverture de l'événement (Arno, point 1 : « modifiable »). */
  onOuverture: (jour: string) => void;
}) {
  if (p.el.sorte === 'plus') {
    return (
      <li className="fav-el fav-el--plus">
        {/**
          * 🔴 LE GROS « + » ROUGE FERME LA MARCHE (Arno, point 1 : « suivi d'un carré “+” rouge »). Sur une frise
          * qui ne porte que son ouverture — le cas de départ — il est la seule autre chose à l'écran.
          *
          * ⚠️ IL PROPOSE AUJOURD'HUI : on ajoute d'ordinaire ce qui vient d'arriver. Un « + » intercalaire, lui,
          * propose une date entre ses deux voisines, parce qu'il sert à rattraper un oubli.
          */}
        <button type="button" className="fav-carre fav-carre--plus" onClick={() => p.onAjouter(p.aujourdhui)}
          aria-label="Ajouter une étape ou une information">
          <span className="fav-plus-rond" aria-hidden="true">+</span>
        </button>
      </li>
    );
  }

  /**
   * 🔴🔴 LE « + » INTERCALAIRE (Arno, point 4) : « entre deux carrés consécutifs, un petit “+” encapsulé (petit
   * cercle discret sur le trait, plus marqué au survol) ouvre le même réservoir, avec une date proposée entre
   * celles des deux voisins (modifiable). Il sert à ajouter une étape ou une information oubliée. »
   *
   * ⚠️ DISCRET, MAIS JAMAIS INVISIBLE : il garde une cible tactile de 24 px (le cercle n'en fait que 14), parce
   * qu'une commande qu'on ne peut atteindre qu'à la souris précise n'existe pas sur un portable.
   */
  if (p.el.sorte === 'plus-entre') {
    const jour = p.el.jourPropose ?? p.aujourdhui;
    return (
      <li className="fav-el fav-el--entre">
        <button type="button" className="fav-entre" onClick={() => p.onAjouter(jour)}
          title="Ajouter une étape ou une information oubliée ici"
          aria-label={`Ajouter une étape ou une information au ${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`}>
          <span className="fav-entre-rond" aria-hidden="true">+</span>
        </button>
      </li>
    );
  }

  if (p.el.sorte === 'points') {
    const messages = p.el.messages ?? [];
    return (
      <li className="fav-el fav-el--points">
        <span className="fav-sr">{motGroupeMessages(messages.length)}</span>
        <span className="fav-points">
          {messages.map((m) => (
            <Point key={m.id} m={m} actif={p.ouvert === `p${m.id}`}
              onSurvol={p.onSurvol}
              onOuvrir={() => p.onOuvrir(p.ouvert === `p${m.id}` ? null : `p${m.id}`)} />
          ))}
        </span>
      </li>
    );
  }

  const c = p.el.case as CaseFrise;
  return (
    <Carre {...p} c={c} />
  );
}

/* ── UN POINT : un message simplement informatif ───────────────────────────────────────────────────────────── */

function Point({
  m, actif, onSurvol, onOuvrir,
}: {
  m: EtapeAAfficher; actif: boolean;
  onSurvol: (cle: string | null) => void; onOuvrir: () => void;
}) {
  /**
   * ⚠️ UN `<button>`, PAS UNE ZONE DE SURVOL. Arno demande la bulle « au survol (et au clic au clavier) » : le
   * survol et le focus la montrent, le clic la fixe. Une info-bulle accessible au seul survol est invisible au
   * tactile et au clavier (CLAUDE.md §15).
   */
  return (
    <button
      type="button" className={`fav-point fav-point--${m.type}${actif ? ' fav-point--actif' : ''}`}
      aria-expanded={actif} onClick={onOuvrir}
      onMouseEnter={() => onSurvol(`p${m.id}`)} onMouseLeave={() => onSurvol(null)}
      onFocus={() => onSurvol(`p${m.id}`)} onBlur={() => onSurvol(null)}
      title={`${motEtape(m.type)} · ${motDateEtape(m)}`}
    >
      <span className="fav-sr">{motEtape(m.type)} du {motDateEtape(m)}</span>
    </button>
  );
}

/* ── UN CARRÉ : une vraie étape ────────────────────────────────────────────────────────────────────────────── */

function Carre({
  c, avecReference, occupe, cleOuverture, calerSurUneFois, ouvert, onOuvrir,
  onOuvrirFil, onConfirmer, onMontant, onRetirer, onOuverture,
}: {
  c: CaseFrise; avecReference: boolean; occupe: boolean; cleOuverture: string | null;
  calerSurUneFois: (cible: HTMLElement | null) => void;
  ouvert: string | null; onOuvrir: (c: string | null) => void;
  onOuvrirFil?: (filId: number) => void;
  onConfirmer: (id: number, geste: 'confirmer' | 'ecarter') => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  onOuverture: (jour: string) => void;
}) {
  const moi = useRef<HTMLLIElement | null>(null);

  /**
   * ══ 🔴🔴 « À L'OUVERTURE, LA FRISE EST POSITIONNÉE POUR MONTRER LA DERNIÈRE ÉTAPE ATTEINTE » (Arno) ═══════════
   *
   * 🔴 LE VERROU « UNE SEULE FOIS » N'EST PLUS ICI : il est dans `useDefilementFrise`, partagé avec la frise des
   * mails, et c'est `calerSurUneFois` qui le porte. Sans lui, chaque relecture (après un confirmer, un ajout, un
   * montant) ramènerait la frise à la dernière étape atteinte — et l'on perdrait l'endroit qu'on regardait,
   * juste après avoir agi dessus. Arno : « UNE SEULE FOIS à l'ouverture, puis plus jamais ».
   */
  useEffect(() => {
    if (c.cle !== cleOuverture) return;
    calerSurUneFois(moi.current);
  }, [c.cle, cleOuverture, calerSurUneFois]);

  const e = c.etape;

  /**
   * ── ① LA CARTE D'OUVERTURE DÉRIVÉE (Arno, point 1) ─────────────────────────────────────────────────────────
   *
   * Elle affiche `gestion_evenement.ouvert_le`, et la corriger corrige l'ÉVÉNEMENT — une seule vérité. Elle
   * n'est donc ni « Monga » ni « manuelle » : elle n'est pas une étape, c'est la date de naissance du dossier.
   *
   * 🔴 ELLE RÉAGIT COMME LES AUTRES (Arno, point 5 : « tous les carrés de la frise réagissent pareil au survol »)
   * et elle est verte comme les autres : elle EST dans la frise. Seul son contenu diffère.
   */
  if (e === null) {
    return (
      <li className="fav-el" ref={moi}>
        <div className="fav-carre fav-carre--dans">
          <ChampOuverture jour={c.survenuLe.slice(0, 10)} mot={c.mot} occupe={occupe} onPoser={onOuverture} />
        </div>
      </li>
    );
  }

  const aConfirmer = e.certitude === 'a_confirmer';
  const montant = motMontant(e.montantCents);
  const detailOuvert = ouvert === `c${e.id}`;
  const ouvrable = etapeOuvrable(e) && onOuvrirFil !== undefined;
  /* 🔴 « ajoutée le 06/10 à 22:31 par Arnaud », au survol (Arno, point 3). Jamais seul porteur d'information. */
  const pose = motAjout(e.creeLe, e.creeParLibelle);

  return (
    <li className="fav-el" ref={moi}>
      {/**
        * 🔴🔴 LOT CLOTURE-REOUVERTURE, POINT 4 — « Sur la frise, la carte “Réouverture” est la SEULE à contour
        * ROUGE. Toutes les autres cartes posées (y compris Clôture) gardent leur contour VERT. » (Arno)
        *
        * 🔴 LE ROUGE DIT ICI AUTRE CHOSE QU'AILLEURS DANS CETTE FEUILLE, et il faut le savoir : le rouge du
        * RÉSERVOIR veut dire « à poser ». Sur une carte POSÉE, il ne peut pas vouloir dire cela — il dit « le
        * dossier est reparti d'ici ». Les deux ne se croisent jamais : un carré du réservoir n'est pas dans la
        * frise, et réciproquement.
        *
        * ⚠️ LA COULEUR NE PORTE PAS L'INFORMATION SEULE : le MOT « Réouverture » est écrit dans la carte,
        * comme pour toutes les autres.
        */}
      <div className={`fav-carre fav-carre--dans${aConfirmer ? ' fav-carre--doute' : ''}`
        + (e.type === 'reouverture' ? ' fav-carre--reouverture' : '')}
        title={pose ?? undefined}>
        {/**
          * 🔴 UN CLIC SUR UN CARRÉ MONGA OUVRE LE MAIL D'ORIGINE (Arno). Quand il n'y en a pas — étape manuelle,
          * mail supprimé, étape déduite — le carré ouvre son détail plutôt que de ne rien faire : un carré qui
          * ne réagit pas au clic se lit comme une panne.
          */}
        <button
          type="button" className="fav-carre-clic"
          onClick={() => {
            if (ouvrable) { (onOuvrirFil as (f: number) => void)(e.filId as number); return; }
            onOuvrir(detailOuvert ? null : `c${e.id}`);
          }}
          aria-expanded={ouvrable ? undefined : detailOuvert}
          title={ouvrable ? (motMailDOrigine(e) ?? undefined) : 'Voir le détail'}
        >
          <span className="fav-titre">
            {c.mot}
            {/* ⚠️ LE PICTO NE PORTE PAS L'INFORMATION SEUL : la source est lue dans la bulle et au lecteur d'écran. */}
            <span className="fav-picto" aria-hidden="true"> {pictoSource(e)}</span>
          </span>
          <span className="fav-date">{motDateEtape(e)}</span>
          {montant !== null && <span className="fav-montant">{montant}</span>}
          {avecReference && e.reference !== null && <span className="fav-ref">{e.reference}</span>}
          <span className="fav-sr">{motSource(e)}</span>
        </button>

        {/* 🔴 LES DEUX PETITS BOUTONS D'UNE ÉTAPE « À CONFIRMER » (Arno : « confirmer ✓ / écarter ✕ »). */}
        {aConfirmer && (
          <span className="fav-doute">
            <button type="button" className="fav-mini" disabled={occupe} title="Confirmer cette étape"
              onClick={() => onConfirmer(e.id, 'confirmer')}>✓<span className="fav-sr"> confirmer</span></button>
            <button type="button" className="fav-mini" disabled={occupe} title="Écarter cette étape"
              onClick={() => onConfirmer(e.id, 'ecarter')}>✕<span className="fav-sr"> écarter</span></button>
          </span>
        )}

        {/* 🔴 LE MENU « … » : détail, montant, modifier/retirer pour une étape manuelle (Arno). */}
        <button type="button" className="fav-menu" aria-expanded={detailOuvert}
          aria-label={`Détail de l’étape ${c.mot}`}
          onClick={() => onOuvrir(detailOuvert ? null : `c${e.id}`)}>…</button>
      </div>

    </li>
  );
}

/**
 * ══ 🔴 LA BULLE : ce qu'un point ou un carré raconte, et ce qu'on peut en faire ═══════════════════════════════
 *
 * Elle sert aux DEUX : un message informatif (point) et une étape (carré). Le contenu est le même — date,
 * auteur, texte, numéro, mail d'origine — et les gestes dépendent de ce qu'on regarde. Deux composants auraient
 * fini par diverger sur la phrase « mail supprimé — étape conservée ».
 */
function BulleDetail({
  e, mot, occupe, onOuvrirFil, onMontant, onRetirer, onModifier, onFermer,
}: {
  e: EtapeAAfficher; mot: string; occupe: boolean;
  onOuvrirFil?: (filId: number) => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  /** 🔴 LOT ATTENTION-ET-MODIFIER — rouvrir le formulaire, prérempli avec cette étape. */
  onModifier: (e: EtapeAAfficher) => void;
  /**
   * 🔴 LOT FRISE-COMPACTE — « Il se replie dès que l'action est terminée ou annulée (Échap, “Fermer”, clic à
   * côté, validation) » (Arno, point 2). Absent sur la bulle FLOTTANTE : elle ne se ferme pas, elle s'efface
   * quand la souris s'en va.
   */
  onFermer?: () => void;
}) {
  const ouvrable = etapeOuvrable(e) && onOuvrirFil !== undefined;
  return (
    <div className="fav-bulle" role="status">
      <p className="fav-bulle-tete">
        {mot} · {motDateEtape(e)} · {motSource(e)}
        {e.auteur !== null && <> · {e.auteur}</>}
      </p>
      {/**
        * 🔴 QUAND LA CARTE A ÉTÉ POSÉE, ET PAR QUI (Arno, point 3 : « ajoutée le 06/10 à 22:31 par Arnaud »).
        *
        * ⚠️ C'EST UNE AUTRE DATE QUE CELLE DE LA LIGNE DU DESSUS, et c'est tout l'intérêt : celle-là dit quand
        * la chose a eu lieu, celle-ci quand quelqu'un l'a écrite. Elles diffèrent dès qu'on rattrape un oubli
        * par un « + » intercalaire — c'est-à-dire exactement quand on a besoin de savoir qui a ajouté quoi.
        */}
      {motAjout(e.creeLe, e.creeParLibelle) !== null && (
        <p className="fav-bulle-pose">{motAjout(e.creeLe, e.creeParLibelle)}</p>
      )}
      {e.numero !== null && <p className="fav-bulle-texte">N° {e.numero}</p>}
      {e.texte !== null && <p className="fav-bulle-texte">{e.texte}</p>}
      {/* 🔴 LA PHRASE QUI JUSTIFIE TOUT LE LOT MONGA-2 : sans la table des étapes, il n'y aurait rien à garder. */}
      {e.source === 'monga' && e.filId === null && <p className="fav-perdu">{motMailDOrigine(e)}</p>}
      <p className="fav-bulle-gestes">
        {ouvrable && (
          <button type="button" className="fav-lien"
            onClick={() => (onOuvrirFil as (f: number) => void)(e.filId as number)}>
            {motMailDOrigine(e)}
          </button>
        )}
        {/**
          * 🔴 MODIFIER ET RETIRER, CÔTE À CÔTE, ET SEULEMENT SUR UNE ÉTAPE MANUELLE (Arno : « Les étapes Monga
          * restent non modifiables »). La garde d'affichage double celle du dépôt, qui refuse en SQL : un bouton
          * qu'on ne devrait pas voir est une invitation à découvrir un refus.
          */}
        {e.source === 'manuelle' && (
          <button type="button" className="fav-lien" disabled={occupe} onClick={() => onModifier(e)}>
            Modifier
          </button>
        )}
        {e.source === 'manuelle' && (
          <button type="button" className="fav-lien" disabled={occupe} onClick={() => onRetirer(e.id)}>
            Retirer
          </button>
        )}
        {/* 🔴 « FERMER » REPLIE LA ZONE (Arno, point 2), au même titre qu'Échap et qu'un clic à côté. */}
        {onFermer !== undefined && (
          <button type="button" className="fav-lien" onClick={onFermer}>Fermer</button>
        )}
      </p>
      {/**
        * 🔴 LE MONTANT SE COMPLÈTE À LA MAIN, Y COMPRIS SUR UNE ÉTAPE MONGA (décision d'Arno du 06/10) :
        * l'audit a mesuré qu'il n'est jamais dans le mail — 2 sur 120, et ce sont des phrases humaines.
        */}
      {e.type === 'devis_recu' && (
        <ChampMontant cents={e.montantCents} occupe={occupe} onPoser={(v) => onMontant(e.id, v)} />
      )}
    </div>
  );
}

/** Le champ de montant d'un devis. Il part vide dans l'immense majorité des cas — c'est ce que l'audit dit. */
function ChampMontant({
  cents, occupe, onPoser,
}: { cents: number | null; occupe: boolean; onPoser: (cents: number | null) => void }) {
  const [saisie, setSaisie] = useState(cents === null ? '' : String(cents / 100).replace('.', ','));
  return (
    <p className="fav-montant-champ">
      <label className="fav-label" htmlFor="fav-montant">Montant du devis</label>
      <input
        id="fav-montant" className="fav-champ" inputMode="decimal" value={saisie}
        placeholder="non renseigné" onChange={(ev) => setSaisie(ev.target.value)}
      />
      <span className="fav-unite">€</span>
      <button
        type="button" className="fav-btn" disabled={occupe}
        onClick={() => {
          const net = saisie.trim().replace(/\s/g, '').replace(',', '.');
          if (net === '') { onPoser(null); return; }
          const v = Number(net);
          if (!Number.isFinite(v) || v < 0) return;
          /* ⚠️ EN CENTIMES, ARRONDIS : un montant en flottant finirait par afficher 885,4999999. */
          onPoser(Math.round(v * 100));
        }}
      >Enregistrer</button>
    </p>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — LA DATE D'OUVERTURE, MODIFIABLE SUR PLACE ═══════════════════════════════════

   Arno, point 1 : « le carré “Ouverture” (date d'ouverture de l'événement, modifiable) ».

   🔴 SUR PLACE, ET NON DANS UN PANNEAU. C'est une seule date, déjà affichée : la rouvrir ailleurs demanderait de
   quitter la frise des yeux pour corriger ce qu'on y lit. Le champ ne s'enregistre qu'au clic sur « Enregistrer »
   — une date qui part à chaque frappe enverrait trois dates fausses avant la bonne.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function ChampOuverture({
  jour, mot, occupe, onPoser,
}: { jour: string; mot: string; occupe: boolean; onPoser: (jour: string) => void }) {
  const [saisie, setSaisie] = useState(jour);
  const [edite, setEdite] = useState(false);
  /* ⚠️ LA SAISIE SUIT LA DONNÉE quand elle change ailleurs (un enregistrement, une relecture) : sans cela, le
     champ garderait l'ancienne date après coup, et donnerait à croire que rien n'a été pris. */
  useEffect(() => { setSaisie(jour); }, [jour]);

  if (!edite) {
    return (
      <button type="button" className="fav-carre-clic" onClick={() => setEdite(true)}
        title="Corriger la date d’ouverture de l’événement">
        <span className="fav-titre">{mot}</span>
        <span className="fav-date">{`${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`}</span>
        <span className="fav-sr">date d’ouverture de l’événement, modifiable</span>
      </button>
    );
  }
  return (
    <span className="fav-ouverture-edit">
      <span className="fav-titre">{mot}</span>
      <input type="date" className="fav-champ fav-champ--mini" value={saisie} aria-label="Date d’ouverture"
        onChange={(ev) => setSaisie(ev.target.value)} />
      <span className="fav-ouverture-gestes">
        <button type="button" className="fav-mini fav-mini--neutre" disabled={occupe || saisie === ''}
          title="Enregistrer la date d’ouverture"
          onClick={() => { onPoser(saisie); setEdite(false); }}>✓<span className="fav-sr"> enregistrer</span></button>
        <button type="button" className="fav-mini fav-mini--neutre" title="Annuler"
          onClick={() => { setSaisie(jour); setEdite(false); }}>✕<span className="fav-sr"> annuler</span></button>
      </span>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — LE RÉSERVOIR ════════════════════════════════════════════════════════════════

   Arno, point 2 : « un clic sur le “+” ouvre, JUSTE EN DESSOUS de la frise, un réservoir de carrés à contour
   ROUGE, un par type d'étape […] plus un carré LIBRE (titre à saisir). Plus un choix “Simple information”
   (posée en point, pas en carré). Clic sur un carré du réservoir → petit formulaire […] Échap ou “Fermer”
   referme le réservoir. »

   🔴 LES CARTES DU RÉSERVOIR ONT LA FORME DE CELLES DE LA FRISE, en plus petit et en rouge : on voit ce qu'on va
   poser. Une liste déroulante aurait demandé d'imaginer le résultat — et c'est précisément ce que la frise
   constructible cherche à éviter.

   ⚠️ LA LISTE VIENT DU MODULE PUR (`TYPES_RESERVOIR`), jamais réécrite ici : deux listes du même ensemble
   finissent toujours par diverger, et c'est la route qui refuserait silencieusement celle qui a dérivé.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function Reservoir({
  jour, onChoisir, onFermer, evenementOuvert,
}: {
  jour: string; onChoisir: (t: TypeEtape) => void; onFermer: () => void;
  /**
   * 🔴🔴 LOT CLOTURE-REOUVERTURE — L'ÉTAT DÉCIDE DE DEUX CARTES, ET DE DEUX SEULEMENT. Arno : « La carte
   * “Clôture” n'est proposée que si l'événement est ouvert. […] La carte “Réouverture” n'est proposée que si
   * l'événement est clos. » C'est `cartesDuReservoir` (module PUR) qui filtre, et la route applique la MÊME
   * fonction à ce qu'elle annonce — une seule règle, deux lecteurs.
   */
  evenementOuvert: boolean;
}) {
  const [forme, setForme] = useState<'etape' | 'information'>('etape');
  const liste = forme === 'etape' ? cartesDuReservoir(evenementOuvert) : TYPES_INFORMATION;
  return (
    <>
      <p className="fav-ajout-titre">
        Ajouter une carte
        {/* 🔴 LA DATE PROPOSÉE SE LIT AVANT DE CHOISIR : un « + » intercalaire en propose une autre qu'un « + »
            de fin, et le savoir change ce qu'on vient poser. Elle reste modifiable dans le formulaire. */}
        <span className="fav-ajout-date">
          {` — date proposée : ${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`}
        </span>
      </p>

      <div className="fav-ajout-ligne">
        <span className="fav-label" id="fav-forme">Forme</span>
        <span className="fav-bascule" role="group" aria-labelledby="fav-forme">
          <button type="button" className={`fav-bascule-b${forme === 'etape' ? ' fav-bascule-b--actif' : ''}`}
            aria-pressed={forme === 'etape'} onClick={() => setForme('etape')}>Étape (carré)</button>
          <button type="button" className={`fav-bascule-b${forme === 'information' ? ' fav-bascule-b--actif' : ''}`}
            aria-pressed={forme === 'information'}
            onClick={() => setForme('information')}>Simple information (point)</button>
        </span>
      </div>

      <ul className="fav-reserve-liste">
        {liste.map((t) => (
          <li key={t}>
            {/* 🔴 LOT CLOTURE-REOUVERTURE — « le bouton “Réouverture” a aussi un contour rouge plus marqué, pour
                le distinguer. Les autres boutons de la grille ne changent pas. » (Arno) */}
            <button type="button"
              className={`fav-carre fav-carre--reserve${t === 'reouverture' ? ' fav-carre--reouverture' : ''}`}
              onClick={() => onChoisir(t)}>
              <span className="fav-titre">{motEtape(t)}</span>
              {t === 'autre' && <span className="fav-date">titre à saisir</span>}
            </button>
          </li>
        ))}
      </ul>

      <div className="fav-ajout-ligne">
        <button type="button" className="fav-btn" onClick={onFermer}>Fermer</button>
        <span className="fav-unite">ou Échap</span>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE PANNEAU « AJOUTER » — ouvert par une carte du réservoir (Arno)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function AjouterEtape({
  evenementId, typeImpose, modifie, jourDefaut, onFermer, onRetour, onFait,
}: {
  evenementId: number; typeImpose: TypeEtape | null;
  /**
   * 🔴 LA DATE PROPOSÉE PAR LE « + » QUI A OUVERT LE RÉSERVOIR (Arno, points 2 et 4) : aujourd'hui pour le gros
   * « + », une date entre les deux voisines pour un intercalaire. Obligatoire, et modifiable.
   */
  jourDefaut: string;
  /** Revenir au réservoir sans tout fermer. Absent quand on MODIFIE : il n'y a pas de réservoir derrière. */
  onRetour?: () => void;
  /**
   * 🔴🔴 LOT ATTENTION-ET-MODIFIER — L'ÉTAPE MANUELLE QU'ON MODIFIE. `null` = on ajoute.
   *
   * Arno : « Il rouvre le MÊME formulaire prérempli (type, date, heure, texte) et passe par la route PATCH
   * existante. » Un second panneau d'édition aurait fini par proposer d'autres types, ou par oublier la bascule
   * « Étape / Simple information ».
   */
  modifie: EtapeAAfficher | null;
  onFermer: () => void;
  /**
   * 🔴 LOT MARQUES-EVENEMENT-EN-COURS — `onFait` PORTE DÉSORMAIS DEUX CHOSES : le message, et le fait que la
   * carte a changé l'ÉTAT de l'événement. Sans le second, la frise ne pourrait pas prévenir la fiche, et la
   * bande orange resterait absente jusqu'à un rechargement à la main.
   */
  onFait: (message: string, etatChange?: boolean) => void;
}) {
  /**
   * 🔴 « avec en plus le choix “Étape” ou “Simple information” » (Arno). Une étape s'affiche en carré, une
   * information en point — et c'est le TYPE qui décide, `estRepere` tranchant à l'affichage. Le choix ne fait
   * donc que changer la liste des types proposés : il n'y a pas deux chemins d'écriture.
   */
  const [forme, setForme] = useState<'etape' | 'information'>('etape');
  const [type, setType] = useState<TypeEtape>('autre');
  /* 🔴 « date (obligatoire, aujourd'hui par défaut) » — ou la date proposée par un « + » intercalaire (Arno). */
  const [jour, setJour] = useState(jourDefaut);
  const [heure, setHeure] = useState('');
  const [texte, setTexte] = useState('');
  const [titre, setTitre] = useState('');
  const [montant, setMontant] = useState('');
  const [piece, setPiece] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (typeImpose !== null) { setType(typeImpose); setForme(estRepere(typeImpose) ? 'information' : 'etape'); }
  }, [typeImpose]);

  /**
   * 🔴 LE PRÉREMPLISSAGE, UNE SEULE FOIS PAR ÉTAPE OUVERTE. Il ne dépend que de l'identifiant : sans cela,
   * chaque frappe dans le champ « texte » redéclencherait l'effet et réécrirait ce qu'on vient de taper.
   *
   * ⚠️ `survenuLe` SE DÉCOUPE, il ne passe pas par un `Date` : le fuseau du lecteur ne doit pas décaler le jour
   * d'un rendez-vous. Même règle que dans `frise.ts`.
   */
  useEffect(() => {
    if (modifie === null) return;
    setForme(estRepere(modifie.type) ? 'information' : 'etape');
    setType(modifie.type);
    setJour(modifie.survenuLe.slice(0, 10));
    setHeure(modifie.heureConnue ? modifie.survenuLe.slice(11, 16) : '');
    setTexte(modifie.texte ?? '');
    setTitre(modifie.titre ?? '');
    setMontant(modifie.montantCents === null ? '' : String(modifie.montantCents / 100).replace('.', ','));
  }, [modifie?.id]);

  /**
   * La liste offerte au choix du type. Le réservoir pour une étape, les informations pour un point.
   *
   * 🔴 LE TYPE DE L'ÉTAPE QU'ON MODIFIE Y EST TOUJOURS AJOUTÉ, ET C'EST UNE GARDE, PAS UN CONFORT. `ouverture`
   * n'est pas dans le réservoir (la frise porte sa propre carte d'ouverture), mais des étapes d'ouverture
   * MANUELLES existent en base depuis le lot MONGA-2. Sans cet ajout, rouvrir l'une d'elles pour corriger son
   * texte aurait changé son TYPE en silence — une correction qui casse ce qu'elle corrige.
   */
  const listeTypes: readonly TypeEtape[] = (() => {
    const base = forme === 'etape' ? TYPES_RESERVOIR : TYPES_INFORMATION;
    const sien = modifie?.type;
    return sien !== undefined && !base.includes(sien) ? [sien, ...base] : base;
  })();

  /* ⚠️ CHANGER DE FORME CHANGE LE TYPE s'il ne convient plus : sinon on poserait une « Clôture » en point. */
  useEffect(() => {
    if (!listeTypes.includes(type)) setType(listeTypes[0]);
  }, [listeTypes, type]);

  /**
   * 🔴 LE MONTANT, EN CENTIMES ET ARRONDI. Un montant en flottant finirait par afficher 885,4999999.
   * `undefined` = saisie illisible : on ne l'envoie pas, plutôt que d'envoyer zéro.
   */
  const montantEnCents = (): number | null | undefined => {
    const net = montant.trim().replace(/\s/g, '').replace(',', '.');
    if (net === '') return null;
    const v = Number(net);
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : undefined;
  };

  /* 🔴 « titre à saisir » (Arno) : une carte libre sans titre serait une ligne muette. Même garde que la route. */
  const titreManquant = type === 'autre' && titre.trim() === '';
  const montantFaux = montantEnCents() === undefined;

  /**
   * ══ 🔴🔴 LOT CLOTURE-REOUVERTURE — LA CONFIRMATION, AVANT DE POSER ═════════════════════════════════════════
   *
   * ARNO : « Confirmation avant de poser la carte Clôture : “Clôturer cet événement ? Le bien n'aura plus
   * d'événement ouvert.” avec Annuler / Clôturer. » Et la symétrique pour la réouverture.
   *
   * 🔴 DANS LE PANNEAU, ET NON DANS UNE BOÎTE DU NAVIGATEUR. Un `confirm()` bloque la page entière, ne se lit
   * pas au clavier comme le reste, et ne porte pas les mots d'Arno dans la typographie du module. C'est aussi
   * la règle de ce dépôt : aucune boîte modale du navigateur.
   *
   * 🔴 ELLE N'EST DEMANDÉE QUE SI LA CARTE CHANGE L'ÉTAT DU DOSSIER (`confirmationCarte` rend `null` pour les
   * douze autres) : une confirmation sur chaque carte s'apprend, et l'on cesse de la lire — c'est précisément
   * ce qui la rendrait inutile le jour où elle compte.
   *
   * ⚠️ ELLE NE S'APPLIQUE PAS À UNE MODIFICATION : corriger la date d'une Clôture déjà posée ne referme rien,
   * l'état a changé le jour où la carte a été posée. `modifie === null` borne donc la question à l'AJOUT.
   */
  const demande = modifie === null ? confirmationCarte(type) : null;
  const [confirme, setConfirme] = useState(false);
  /* ⚠️ CHANGER DE TYPE REDEMANDE : sans cela, une confirmation donnée pour une Clôture vaudrait pour la carte
     suivante, qu'on n'a jamais confirmée. */
  useEffect(() => { setConfirme(false); }, [type]);

  const envoyer = async (): Promise<void> => {
    if (occupe || jour === '' || titreManquant || montantFaux) return;
    if (demande !== null && !confirme) { setConfirme(true); return; }
    setOccupe(true);
    try {
      /**
       * 🔴 LA MÊME SAISIE, DEUX PORTES — et ce sont les portes QUI EXISTAIENT DÉJÀ (Arno : « passe par la route
       * PATCH existante »). Rien de neuf côté serveur : `POST …/frise` ajoute, `PATCH …/etapes/[id]` modifie, et
       * c'est le `WHERE source = 'manuelle'` du dépôt qui refuse une étape Monga — pas cet écran.
       */
      const corps = {
        type,
        survenuLe: heure === '' ? jour : `${jour}T${heure}`,
        heureConnue: heure !== '',
        texte: texte.trim() === '' ? null : texte.trim(),
        /* ⚠️ LE TITRE N'EST GARDÉ QUE SUR UNE CARTE LIBRE — la route le vérifie aussi, et pour la même raison :
           ailleurs, le mot de la carte vient du TYPE, écrit une seule fois dans `motEtape`. */
        titre: type === 'autre' ? titre.trim() : null,
        /* 🔴 LE MONTANT EST DANS LE FORMULAIRE (Arno, point 2 : « montant pour un devis »). Il ne s'y affiche que
           pour un devis, mais il part toujours : l'omettre à la modification EFFACERAIT celui qui est saisi. */
        montantCents: montantEnCents() ?? null,
      };
      const res = modifie === null
        ? await fetch(`/api/admin/gestion/evenements/${evenementId}/frise`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...corps, pieceNom: piece.trim() === '' ? null : piece.trim() }),
        })
        : await fetch(`/api/admin/gestion/etapes/${modifie.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...corps, geste: 'modifier' }),
        });
      const d = (await res.json().catch(() => ({}))) as {
        etat?: string; message?: string; erreur?: string;
        /* 🔴 LA ROUTE DIT LE FAIT, et l'écran ne relit pas une phrase pour le deviner. */
        etatEvenement?: 'traite' | 'en_cours' | null;
      };
      const defaut = modifie === null ? 'Étape ajoutée.' : 'Étape modifiée.';
      onFait(
        d.etat === 'ok' ? (d.message ?? defaut) : (d.erreur ?? 'Enregistrement impossible.'),
        d.etat === 'ok' && (d.etatEvenement === 'traite' || d.etatEvenement === 'en_cours'),
      );
    } catch {
      onFait('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <>
      <p className="fav-ajout-titre">
        {modifie === null ? `Ajouter — ${motEtape(type)}` : `Modifier — ${motEtape(type)}`}
      </p>

      {/**
        * 🔴 LA FORME SE CHOISIT AU RÉSERVOIR À L'AJOUT, et reste ici pour la MODIFICATION : une carte posée par
        * erreur en étape doit pouvoir devenir une information sans être retirée puis reposée (c'est une
        * possibilité du lot ATTENTION-ET-MODIFIER, et on ne retire rien).
        */}
      {modifie !== null && (
        <div className="fav-ajout-ligne">
          <span className="fav-label" id="fav-forme-m">Forme</span>
          <span className="fav-bascule" role="group" aria-labelledby="fav-forme-m">
            <button type="button" className={`fav-bascule-b${forme === 'etape' ? ' fav-bascule-b--actif' : ''}`}
              aria-pressed={forme === 'etape'} onClick={() => setForme('etape')}>Étape (carré)</button>
            <button type="button"
              className={`fav-bascule-b${forme === 'information' ? ' fav-bascule-b--actif' : ''}`}
              aria-pressed={forme === 'information'}
              onClick={() => setForme('information')}>Simple information (point)</button>
          </span>
        </div>
      )}

      <div className="fav-ajout-ligne">
        <label className="fav-label" htmlFor="fav-type">Type</label>
        <select id="fav-type" className="fav-champ" value={type}
          onChange={(e) => setType(e.target.value as TypeEtape)}>
          {listeTypes.map((t) => <option key={t} value={t}>{motEtape(t)}</option>)}
        </select>
      </div>

      {/* 🔴 LE TITRE D'UNE CARTE LIBRE (Arno : « un carré LIBRE (titre à saisir) »), et lui seul le porte. */}
      {type === 'autre' && (
        <div className="fav-ajout-ligne">
          <label className="fav-label" htmlFor="fav-titre">Titre</label>
          <input id="fav-titre" className="fav-champ fav-champ--texte" value={titre} maxLength={80}
            placeholder="ce que raconte cette carte" onChange={(e) => setTitre(e.target.value)} />
        </div>
      )}

      <div className="fav-ajout-ligne">
        <label className="fav-label" htmlFor="fav-jour">Date</label>
        <input id="fav-jour" type="date" className="fav-champ" value={jour} required
          onChange={(e) => setJour(e.target.value)} />
        <label className="fav-label" htmlFor="fav-heure">Heure</label>
        <input id="fav-heure" type="time" className="fav-champ" value={heure}
          onChange={(e) => setHeure(e.target.value)} />
      </div>

      {/**
        * 🔴 LE MONTANT, « pour un devis » (Arno, point 2). Offert sur les trois cartes de devis : un devis refusé
        * et un devis accepté portent un montant autant que celui qu'on reçoit — et c'est souvent le montant qui
        * explique le refus.
        */}
      {(type === 'devis_recu' || type === 'devis_refuse' || type === 'devis_accepte') && (
        <div className="fav-ajout-ligne">
          <label className="fav-label" htmlFor="fav-montant-ajout">Montant</label>
          <input id="fav-montant-ajout" className="fav-champ" inputMode="decimal" value={montant}
            placeholder="non renseigné" onChange={(e) => setMontant(e.target.value)} />
          <span className="fav-unite">€</span>
        </div>
      )}

      <div className="fav-ajout-ligne">
        <label className="fav-label" htmlFor="fav-texte">Texte</label>
        <textarea id="fav-texte" className="fav-champ fav-champ--texte" rows={2} value={texte}
          onChange={(e) => setTexte(e.target.value)} />
      </div>

      {/* ⚠️ LA PIÈCE NE SE MODIFIE PAS ICI : `modifierEtapeManuelle` ne la touche pas, et un champ qui ne
          s'enregistre pas est pire qu'un champ absent. Elle reste offerte à l'AJOUT. */}
      {modifie === null && <div className="fav-ajout-ligne">
        <label className="fav-label" htmlFor="fav-piece">Pièce jointe</label>
        {/* ⚠️ LE NOM DE LA PIÈCE, PAS LE FICHIER : le dépôt range les pièces par le Drive (lot FENETRE-DRIVE-UNIQUE),
            et ouvrir ici un second chemin de dépôt aurait fait deux endroits où un fichier peut vivre. */}
        <input id="fav-piece" className="fav-champ" value={piece} placeholder="nom du document (facultatif)"
          onChange={(e) => setPiece(e.target.value)} />
      </div>}

      {/* ⚠️ LE REFUS SE DIT AVANT LE CLIC, pas après : un bouton éteint sans raison écrite se lit comme une panne. */}
      {titreManquant && <p className="fav-perdu">Une carte libre demande un titre.</p>}
      {montantFaux && <p className="fav-perdu">Le montant ne se lit pas : un nombre, en euros.</p>}

      {/* 🔴 LA QUESTION D'ARNO, MOT POUR MOT, et elle dit la CONSÉQUENCE SUR LE BIEN — pas le nom du bouton. */}
      {demande !== null && confirme && (
        <p className="fav-confirme" role="alert">{demande.question}</p>
      )}

      <div className="fav-ajout-ligne">
        <button type="button" className="fav-btn fav-btn--fort"
          disabled={occupe || jour === '' || titreManquant || montantFaux}
          onClick={() => void envoyer()}>
          {demande !== null && confirme
            ? demande.valider
            : (modifie === null ? 'Valider' : 'Enregistrer')}
        </button>
        {/* 🔴 « ANNULER » EST LE PREMIER DES DEUX CHOIX D'ARNO : il revient à la saisie, sans rien poser. */}
        {demande !== null && confirme && (
          <button type="button" className="fav-btn" onClick={() => setConfirme(false)}>Annuler</button>
        )}
        {onRetour !== undefined && (
          <button type="button" className="fav-btn" onClick={onRetour}>Choisir une autre carte</button>
        )}
        <button type="button" className="fav-btn" onClick={onFermer}>Fermer</button>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA FEUILLE
   ⚠️ JETONS `--color-svv-*` UNIQUEMENT : aucune couleur en dur, Clair et Sombre suivent d'eux-memes. Le garde
      de feuille du depot refuse un hexadecimal ou un rgba() ici, commentaire compris.
   ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent dans un litteral gabarit.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ══ 🔴🔴 LOT FRISES-REPARATION — LE PREFIXE EST `fav-`, ET PLUS JAMAIS `frs-` ══════════════════════════════════

   🔴 LE DEFAUT QUE CELA REPARE, MESURE A L'ECRAN (06/10/2026, fiche lot-237). Cette feuille employait le prefixe
   `frs-`, celui de la frise des MAILS (FriseDuBien, lots 17-18). Les deux frises coexistent sur la fiche d'un
   bien — le bloc « Evenements » au-dessus du moteur Historique — et TROIS selecteurs entraient en collision :
   `.frs`, `.frs-piste` et `.frs-fleche`.

   MESURE SUR LA FRISE DES MAILS, lot-237 (un evenement, donc cette feuille injectee) :
     · sa piste passait de 88 px a **132 px** (min-height, padding 10/30, display:flex, overflow-x:auto — tout
       venu d'ici) ;
     · la zone orange d'evenement gardait ses 62 px : elle ne couvrait plus que **47 %** de la hauteur haute ;
     · les traits de mails commencaient a **54 px sur 132**, soit a mi-hauteur, le haut vide ;
     · les reperes d'entree/sortie gardaient 62 px sur 132 : leur trait paraissait COUPE ;
     · la fleche passait en **z-index 6** (contre 2) et a `top:50%` d'une boite de 132 : elle se posait SUR les
       traits et les masquait.

   🔴 ET LA PREUVE PAR LE TEMOIN : sur lot-146, qui n'a AUCUN evenement, le bloc « Evenements » ne rend rien,
   cette feuille n'est pas injectee — et la frise des mails mesurait 88 px, traits a 10 px, reperes a 62 px.
   Parfaitement saine. C'est la coexistence qui cassait, pas la frise.

   ⚠️ LA FRISE DES MAILS EST LA PLUS ANCIENNE : c'est au nouveau venu de ceder le prefixe. Une epreuve interdit
   desormais toute intersection entre les deux feuilles.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const CSS_FRISE_AVANCEMENT = `
.fav{margin:0}

/* Le cadre porte les fleches ; la piste defile sous elles. */
.fav-piste-cadre{position:relative}
/* ══ 🔴🔴 LE BAS RESERVE AUX BULLES — DEFAUT MESURE A L'ECRAN LE 06/10/2026 ══════════════════════════════════
   En CSS, overflow-x:auto force l'autre axe a auto : overflow-y:visible ne tient pas, et la piste devient
   un conteneur de defilement VERTICAL aussi. Mesure : une bulle ouverte depassait de 132 px et se trouvait
   COUPEE — son texte, c'est-a-dire tout son interet, etait illisible.
   On reserve donc la hauteur d'une bulle sous la rangee. La bulle vit dans la piste (elle suit son point quand
   on defile, ce qui est juste) et ne depasse plus. */
/* ⚠️ LE BAS RESERVE A LA BARRE DE DEFILEMENT. Mesure a l'ecran : avec 14 px, le bas des carres (et leurs
   boutons ✓ / ✕) passait SOUS la barre de defilement horizontale et se faisait rogner de 14 px. La barre
   occupe la place, il faut la lui donner. */
/* ⚠️ UNE HAUTEUR MINIMALE EXPLICITE, ET ELLE EST NECESSAIRE. Mesure a l'ecran : la piste se rendait a 88 px
   alors que son contenu en demande 132 (10 de marge haute + 92 de carre + 30 pour la barre de defilement), et
   le bas des carres — avec leurs boutons ✓ / ✕ — se faisait rogner de 14 px. Aucun ancetre ne la contraignait :
   c'est le conteneur de defilement lui-meme qui ne prend pas la hauteur de ses enfants. On la lui donne.
   132 = 10 + 92 (la hauteur d'un carre, cf. .fav-carre) + 30. */
/* ══ 🔴🔴 CE QUI A ETE RETIRE ICI, ET POURQUOI : « scroll-behavior:smooth » ══════════════════════════════════════
   Mesure sur lot-237 (82 px de defilement disponible) : AVEC cette propriete, CHAQUE geste rendait 0 —
   molette 0, Maj+molette 0, trackpad 0, et jusqu'a « scrollLeft = 9999 » qui rendait 0 apres 600 ms.
   Explication : « smooth » transforme TOUTE affectation de scrollLeft en animation, et une animation est
   annulee par l'affectation suivante ; un geste continu, qui pose scrollLeft a chaque image, se bat donc
   contre lui-meme. Avec « auto », les memes gestes rendent 82 — le maximum.
   La douceur n'est pas perdue : elle est posee en JavaScript sur les FLECHES seules (COMPORTEMENT_SAUT), qui
   sont un saut voulu et unique. Voir lib/gestion/defilementFrise.ts.
   ⚠️ NE PAS LA REMETTRE ICI : posee en feuille, elle s'applique a tout, y compris au continu.
   ⚠️ overscroll-behavior-x: contain — arriver au bout de la frise ne doit pas emporter la page en arriere
   (geste de retour du trackpad). Meme regle que la frise des mails. */
.fav-piste{list-style:none;margin:0;padding:10px 2px 30px;min-height:132px;box-sizing:border-box;
  display:flex;align-items:flex-start;
  gap:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}
/* ══ 🔴🔴 LOT FRISE-COMPACTE, POINT 4 — LE GRAND CADRE ROUGE, DIAGNOSTIQUE ET REMPLACE ════════════════════════
   CE QUE C'ETAIT : un CONTOUR DE FOCUS CLAVIER, et non un etat « selectionne ». La regle valait
   « outline:2px solid var(--color-svv-red); outline-offset:-2px », posee au lot FRISES-REPARATION (B) en meme
   temps que le tabIndex 0 qui rend la rangee atteignable aux fleches ← → du clavier.
   POURQUOI ELLE CREVAIT L'ECRAN : c'est le traitement de focus des PETITS BOUTONS de l'application, applique a
   une REGION de 1074 x 132 px. Mesure sur lot-237. Le meme defaut existait sur la frise des mails
   (.frs-cadre), pour la meme raison et depuis le meme lot.
   CE QUI LE REMPLACE : un lisere rouge de 3 px sur le bord gauche, pose en ombre interne — l'accent deja
   employe par .fav-bulle dans cette meme feuille (et par .fav-proposition jusqu'au lot CLOTURE-REOUVERTURE,
   qui l'a retiree avec la fermeture en un clic). Discret, coherent, et il dit la meme
   chose : le clavier est DANS cette zone.
   ⚠️ UN CONTOUR TRANSPARENT EST CONSERVE : en mode contraste force, les ombres ne sont pas peintes, et c'est
   le contour que le systeme repeint. Sans lui, l'indicateur disparaitrait pour ceux qui en ont le plus besoin.
   ⚠️ :focus-visible ET NON :focus — « visible uniquement au clavier » (Arno). */
.fav-piste:focus-visible{outline:2px solid transparent;outline-offset:-2px;
  box-shadow:inset 3px 0 0 0 var(--color-svv-red)}

/* Le trait fin qui relie les carres : une bordure posee sur la rangee, derriere les elements. */
.fav-el{position:relative;display:flex;align-items:flex-start;flex:0 0 auto}
.fav-el::before{content:'';position:absolute;left:0;right:0;top:44px;height:2px;
  background:var(--color-svv-line);z-index:0}
.fav-el:first-child::before{left:50%}
.fav-el:last-child::before{right:50%}

/* ══ 🔴🔴 LOT FRISE-CONSTRUCTIBLE — TROIS COULEURS, ET CHACUNE DIT UN ETAT ════════════════════════════════════
   ROUGE = a poser (le reservoir, les « + ») · VERT = dans la frise, qu'elle vienne du courrier ou d'une main
   · AMBRE = venue du courrier et « a confirmer », avec ses deux boutons.
   ⚠️ CES COMMENTAIRES PARTENT DANS LE DOM, et c'est pour cela qu'ils ne nomment pas le prestataire : la feuille
   est injectee par un <style>, son texte entre dans textContent, et une epreuve de CarteVive verifie qu'une
   carte SANS intervention n'affiche nulle part le nom du prestataire. Elle a attrape ce defaut-ci.
   ⚠️ LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE : la source est ecrite dans la bulle et au lecteur d'ecran,
   le picto de source la redit, et les formes different (un carre du reservoir est plus petit et sans date).
   ⚠️ LES CARRES EN POINTILLE « attendue » ONT ETE SUPPRIMES — accord explicite d'Arno (lot FRISE-CONSTRUCTIBLE).
   Ils promettaient une suite d'etapes que le dossier reel ne suit pas. Les types restent tous posables par le
   reservoir, autant de fois que necessaire : on retire une PROMESSE, pas une possibilite. */
/* ══ LE CARRE — meme taille pour tous (Arno : environ 120 x 90 px) ══ */
.fav-carre{position:relative;z-index:1;box-sizing:border-box;width:124px;min-height:92px;
  margin:0 10px;padding:6px 7px;display:flex;flex-direction:column;gap:2px;
  border-radius:10px;border:2px solid var(--color-svv-red);background:var(--color-svv-bg)}
/* 🔴 UNE CARTE QUI EST DANS LA FRISE : contour VERT (Arno, points 2 et 5), quelle que soit son origine. */
.fav-carre--dans{border-color:var(--color-svv-green);background:var(--color-svv-field)}
.fav-carre--doute{border-color:var(--color-svv-amber);border-style:solid}
/* ══ 🔴🔴 LOT CLOTURE-REOUVERTURE, POINT 4 — LA REOUVERTURE EST LA SEULE CARTE ROUGE DE LA FRISE ══════════════
   ARNO : « Sur la frise, la carte “Reouverture” est la SEULE a contour ROUGE. Toutes les autres cartes posees
   (y compris Cloture) gardent leur contour VERT. Dans la grille “Ajouter une carte”, le bouton “Reouverture” a
   aussi un contour rouge plus marque, pour le distinguer. »

   🔴 LA REGLE PASSE APRES .fav-carre--dans ET .fav-carre--reserve, et il le faut : elle doit l'emporter sur le
   vert de l'une comme sur le rouge fin de l'autre. En CSS, a specificite egale, c'est l'ordre qui tranche.
   🔴 DANS LA GRILLE, LE TRAIT EST PLUS EPAIS (2 px contre 1) : tous les carres du reservoir sont deja rouges
   — « ROUGE = a poser » —, donc seule l'EPAISSEUR peut distinguer celui-la. Une autre couleur aurait casse le
   code du reservoir.
   ⚠️ LA COULEUR NE PORTE PAS L'INFORMATION SEULE : le mot « Reouverture » est ecrit dans la carte.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.fav-carre--reouverture{border-color:var(--color-svv-red)}
.fav-carre--reouverture:hover,.fav-carre--reouverture:focus-within{border-color:var(--color-svv-red-dark)}
.fav-carre--reserve.fav-carre--reouverture{border-width:2px}
/* ══ 🔴🔴 LE SURVOL EST LE MEME POUR TOUS LES CARRES (Arno, point 5) ══════════════════════════════════════════
   « tous les carrés de la frise réagissent pareil au survol (contour accentué, curseur main). Aujourd'hui seul
   “Acceptation du devis” le fait. » Le defaut venait de la : seul le carre pointille « posable » portait une
   regle de survol, et les carres atteints n'en avaient aucune — on ne savait pas qu'ils etaient cliquables.
   La regle porte donc sur « .fav-carre » ENTIER, et non sur un modificateur. */
.fav-carre{cursor:pointer;transition:border-color .12s ease, box-shadow .12s ease}
/* ⚠️ L'ACCENT DU SURVOL ETAIT TROP PALE POUR SE VOIR : il valait une ombre interne en --color-svv-line-strong
   posee sur un fond --color-svv-field — deux gris voisins, releves cote a cote dans la page. Arno demandait un
   « contour accentue » ; c'est donc un filet interne d'un pixel en « currentColor » — c'est-a-dire la couleur du
   TEXTE de la carte (--color-svv-ink), franchement contrastee sur le fond dans les deux themes. Elle se lit
   sans couleur, et elle ne masque pas la bordure d'etat (verte, ambre) qui reste visible juste a cote. */
.fav-carre:hover,.fav-carre:focus-within{box-shadow:0 0 0 1px currentColor inset}
.fav-carre--dans:hover,.fav-carre--dans:focus-within{border-color:var(--color-svv-green-ink)}
.fav-carre--doute:hover,.fav-carre--doute:focus-within{border-color:var(--color-svv-amber)}

/* ══ LE RESERVOIR — les cartes qu'on peut poser, a contour ROUGE (Arno, point 2) ══
   Elles ont la forme de celles de la frise, en plus petit : on voit ce qu'on va poser. */
.fav-reservoir{margin:10px 0 0;padding:9px;background:var(--color-svv-field);border-radius:8px;
  border:1px solid var(--color-svv-line)}
.fav-reserve-liste{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.fav-carre--reserve{width:150px;min-height:48px;margin:0;justify-content:center;
  border-color:var(--color-svv-red);background:var(--color-svv-bg);
  font:inherit;text-align:left;color:var(--color-svv-ink)}
.fav-carre--reserve:hover{background:var(--color-svv-field);border-color:var(--color-svv-red)}
.fav-ajout-date{font-weight:400;color:var(--color-svv-muted)}

/* Le « + » : bordure pointillee rouge, gros + rouge cercle (Arno). */
.fav-carre--plus{align-items:center;justify-content:center;cursor:pointer;
  border:2px dashed var(--color-svv-red);background:transparent}
.fav-carre--plus:hover{background:var(--color-svv-field)}
.fav-plus-rond{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;
  border-radius:50%;border:2px solid var(--color-svv-red);color:var(--color-svv-red);
  font-size:1.5rem;line-height:1}

/* ══ 🔴 LE « + » INTERCALAIRE, SUR LE TRAIT ENTRE DEUX CARRES (Arno, point 4) ═════════════════════════════════
   « un petit “+” encapsulé (petit cercle discret sur le trait, plus marqué au survol) ».
   ⚠️ LE BOUTON FAIT 24 px, LE CERCLE 14 : discret a l'oeil, atteignable au doigt. Une commande qui n'existe
   qu'a la souris precise n'existe pas sur un portable (CLAUDE.md §15). */
.fav-el--entre{align-self:flex-start;padding-top:32px}
.fav-entre{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;
  width:24px;height:24px;min-width:24px;padding:0;margin:0 -4px;cursor:pointer;
  border:0;border-radius:50%;background:none}
.fav-entre-rond{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;
  border-radius:50%;border:1px solid var(--color-svv-muted);background:var(--color-svv-bg);
  color:var(--color-svv-muted);font-size:.68rem;line-height:1}
.fav-entre:hover .fav-entre-rond,.fav-entre:focus-visible .fav-entre-rond{width:20px;height:20px;
  font-size:.86rem;border-width:2px;border-color:var(--color-svv-red);color:var(--color-svv-red)}

/* La date d'ouverture, corrigee sur place dans sa carte. */
.fav-ouverture-edit{display:flex;flex-direction:column;gap:3px;width:100%}
.fav-ouverture-gestes{display:flex;gap:3px}
.fav-champ--mini{font-size:.72rem;min-height:28px;padding:2px 4px;width:100%;box-sizing:border-box}
.fav-mini--neutre{border-color:var(--color-svv-line)}
.fav-mini--neutre:hover{background:var(--color-svv-line);color:var(--color-svv-ink)}

/* Le contenu du carre : nom en haut, date en dessous, picto de source. */
.fav-carre-clic{display:flex;flex-direction:column;gap:2px;width:100%;padding:0;
  font:inherit;text-align:left;background:none;border:0;cursor:pointer;color:var(--color-svv-ink)}
.fav-titre{font-size:.78rem;font-weight:700;line-height:1.15;color:var(--color-svv-ink);overflow-wrap:anywhere}
.fav-picto{color:var(--color-svv-red)}
.fav-date{font-size:.7rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.fav-montant{font-size:.72rem;font-weight:700;color:var(--color-svv-ink)}
.fav-ref{font-size:.68rem;font-weight:700;color:var(--color-svv-muted)}

/* Les deux petits boutons d'une etape « a confirmer », et le menu « … ». */
.fav-doute{position:absolute;right:4px;bottom:4px;display:flex;gap:3px}
.fav-mini{width:22px;height:22px;min-width:22px;padding:0;font:inherit;font-size:.72rem;cursor:pointer;
  border-radius:5px;border:1px solid var(--color-svv-amber);background:var(--color-svv-bg);
  color:var(--color-svv-ink);line-height:1}
.fav-mini:hover{background:var(--color-svv-amber);color:var(--color-svv-bg)}
.fav-mini:disabled{opacity:.5;cursor:default}
.fav-menu{position:absolute;right:4px;top:3px;width:20px;height:20px;padding:0;font:inherit;
  line-height:1;cursor:pointer;border:0;border-radius:4px;background:none;color:var(--color-svv-muted)}
.fav-menu:hover{background:var(--color-svv-line);color:var(--color-svv-ink)}

/* ══ LES POINTS — sur le trait, entre les carres ══ */
.fav-el--points{align-self:flex-start;padding-top:38px}
.fav-points{position:relative;z-index:1;display:flex;align-items:center;gap:4px;padding:0 3px}
.fav-point-boite{position:relative;display:inline-flex}
.fav-point{width:11px;height:11px;min-width:11px;min-height:11px;padding:0;cursor:pointer;
  border-radius:50%;border:1px solid var(--color-svv-muted);background:var(--color-svv-bg)}
.fav-point:hover,.fav-point:focus-visible{background:var(--color-svv-red);border-color:var(--color-svv-red)}
.fav-point--rappel_devis{border-style:dashed}
.fav-point--facture{border-width:2px}
.fav-point--note{background:var(--color-svv-field);border-color:var(--color-svv-ink)}
/* Le point dont la bulle est affichee : on voit d'ou vient ce qu'on lit en dessous. */
.fav-point--actif{background:var(--color-svv-red);border-color:var(--color-svv-red)}

/* La bulle : au survol, et fixee au clic. */
/* ══ 🔴🔴 LOT FRISE-COMPACTE — LA ZONE NE RESERVE PLUS RIEN ════════════════════════════════════════════════
   CE QU'ELLE VALAIT AVANT : « min-height:92px », en permanence. Mesure sur lot-237 ce 06/10 : le conteneur de
   l'evenement faisait 234 px = 132 de piste + 10 de marge + 92 de VIDE. C'est la « deuxieme ligne » qu'Arno
   voit a l'ouverture, et elle etait la meme sans aucune bulle.
   Sa raison etait reelle : sans elle, la page sautait d'une centaine de pixels a chaque SURVOL d'un point.
   🔴 LA REPONSE N'ETAIT PAS DE RESERVER LE VIDE, MAIS DE SORTIR LE SURVOL DU FLUX : la bulle de survol est
   desormais FLOTTANTE (.fav-flottante), et cette zone-ci n'existe plus que tant qu'une bulle est FIXEE par un
   clic. Hauteur par defaut : zero, et le bloc tient sur une rangee. */
.fav-zone{margin-top:10px}
.fav-bulle{display:flex;flex-direction:column;gap:2px;max-width:40rem;padding:7px 9px;border-radius:8px;
  background:var(--color-svv-bg);border:1px solid var(--color-svv-line);
  border-left:3px solid var(--color-svv-red)}
.fav-bulle-tete{font-size:.72rem;font-weight:700;color:var(--color-svv-ink)}
/* Quand la carte a ete posee, et par qui — a distinguer de la date de ce qui s'est passe. */
.fav-bulle-pose{margin:0;font-size:.7rem;font-style:italic;color:var(--color-svv-muted)}
.fav-bulle-texte{margin:0;font-size:.76rem;color:var(--color-svv-ink);overflow-wrap:anywhere;white-space:pre-wrap}
.fav-bulle-gestes{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
/* ══ 🔴🔴 LA BULLE DE SURVOL — POSEE PAR-DESSUS, ELLE NE POUSSE RIEN ══════════════════════════════════════════
   Elle vit dans .fav-piste-cadre (positionne) et non dans la piste, qui COUPE ce qui depasse (defaut mesure au
   lot FRISE-HORIZONTALE : 132 px de texte tronques).
   ⚠️ pointer-events:none — une bulle sous la souris masquerait la carte suivante et empecherait de la survoler.
   Elle se regarde ; les gestes sont sur la bulle FIXEE par un clic.
   ⚠️ ELLE DOIT SE DETACHER DU TEXTE QU'ELLE RECOUVRE, et sans ombre coloree : la feuille n'admet que des
   jetons --color-svv-* (un garde refuse tout hexadecimal et tout rgba, commentaire compris). On double donc le
   contour de la bulle par un halo de la couleur de FOND de la page : il la detache nettement du texte en
   dessous, en Clair comme en Sombre, et il suit le theme sans qu'on ait rien a dire de plus. */
.fav-flottante{position:absolute;left:0;top:100%;z-index:7;max-width:40rem;pointer-events:none}
.fav-flottante .fav-bulle{box-shadow:0 0 0 3px var(--color-svv-bg),0 0 0 4px var(--color-svv-line-strong)}

/* ══ LES FLECHES ══ */
.fav-fleche{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:28px;height:44px;
  padding:0;font:inherit;font-size:1.3rem;line-height:1;cursor:pointer;
  border:1px solid var(--color-svv-line);border-radius:7px;
  background:var(--color-svv-bg);color:var(--color-svv-ink)}
.fav-fleche:hover{background:var(--color-svv-field)}
.fav-fleche--g{left:-2px}
.fav-fleche--d{right:-2px}

/* ══ LE DETAIL D'UN CARRE, ET LE RESTE ══ */
.fav-lien{font:inherit;font-size:.76rem;color:var(--color-svv-red);background:none;border:0;padding:0;
  text-decoration:underline;cursor:pointer;min-height:24px}
.fav-lien:disabled{color:var(--color-svv-muted);cursor:default}
.fav-perdu{font-size:.74rem;font-style:italic;color:var(--color-svv-muted);margin:0}

.fav-btn{font:inherit;font-size:.78rem;min-height:36px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);border:1px solid var(--color-svv-line);
  border-radius:6px}
.fav-btn:hover{background:var(--color-svv-field)}
.fav-btn:disabled{color:var(--color-svv-muted);cursor:default}
.fav-btn--fort{color:var(--color-svv-bg);background:var(--color-svv-red);border-color:var(--color-svv-red)}

/* 🔴 LOT CLOTURE-REOUVERTURE — « .fav-proposition » A ETE RETIREE AVEC LA LIGNE « Cloturer cet evenement ? »
   qu'elle habillait, et qui etait son unique porteur. La proposition de passage en fiable, elle, a toujours la
   sienne juste en dessous (.fav-fiable) : rien d'autre ne perd son style. */
.fav-fiable{margin:8px 0 0;padding:6px 8px;font-size:.78rem;color:var(--color-svv-muted);
  background:var(--color-svv-field);border-radius:6px}
/* ══ 🔴 LOT CLOTURE-REOUVERTURE — LA QUESTION POSEE AVANT DE CLORE OU DE ROUVRIR ══════════════════════════════
   Elle dit la consequence sur le BIEN, et elle se lit avant de cliquer : d'ou le liseré rouge et le texte en
   encre pleine. L'attribut role=alert la porte aussi au lecteur d'ecran, au moment ou elle apparait. */
.fav-confirme{margin:8px 0 0;padding:7px 9px;font-size:.82rem;font-weight:600;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:6px}

/* ══ LE PANNEAU D'AJOUT — il vit DANS le reservoir, sous la frise (lot FRISE-CONSTRUCTIBLE) ══ */
.fav-ajout-titre{margin:0 0 7px;font-size:.84rem;font-weight:700;color:var(--color-svv-ink)}
.fav-ajout-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 7px}
.fav-label{font-size:.76rem;color:var(--color-svv-muted);min-width:5rem}
.fav-champ{font:inherit;font-size:.82rem;min-height:36px;padding:4px 8px;color:var(--color-svv-ink);
  background:var(--color-svv-bg);border:1px solid var(--color-svv-line);border-radius:6px}
.fav-champ--texte{flex:1 1 14rem;min-height:48px}
.fav-bascule{display:flex;flex-wrap:wrap;gap:6px}
.fav-bascule-b{font:inherit;font-size:.78rem;min-height:36px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);
  border:1px solid var(--color-svv-line);border-radius:6px}
.fav-bascule-b--actif{color:var(--color-svv-bg);background:var(--color-svv-red);
  border-color:var(--color-svv-red)}
.fav-montant-champ{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 0}
.fav-unite{font-size:.82rem;color:var(--color-svv-muted)}

.fav-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}

/* Ecran etroit : la frise DEFILE, rien ne se superpose et rien ne se replie (Arno). Les bulles et les
   detachements se recadrent pour ne pas sortir de l'ecran. */
@media (max-width:600px){
  .fav-ajout-ligne{flex-direction:column;align-items:stretch}
  .fav-label{min-width:0}
  .fav-champ{width:100%}
  .fav-bulle{max-width:100%}
  /* ⚠️ LE RESERVOIR NE DEFILE PAS LATERALEMENT : ses cartes se mettent les unes sous les autres, pleine
     largeur. Quatorze cartes de 150 px sur un telephone auraient demande un second defilement horizontal,
     a cote de celui de la frise — deux conteneurs qui defilent, exactement ce qu'Arno a fait reparer. */
  .fav-carre--reserve{width:100%}
}
`;
