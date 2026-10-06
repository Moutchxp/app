'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * 🔴 DEPUIS LES MODULES **PURS**, JAMAIS DEPUIS LE DÉPÔT. Ce composant vit dans le navigateur : importer
 * `mongaEtapeRepo` le ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire
 * TOUTE l'application — page de connexion comprise (incident du 24/09/2026). Le garde
 * `clientBoundary.guard.test.ts` le vérifie.
 */
import {
  cleDOuverture, construireFrise, etapeOuvrable, motDateEtape, motGroupeMessages, motMailDOrigine,
  motMontant, motSource, pictoSource, rangerEnLigne, referencesDeLaFrise,
  type CaseFrise, type ElementFrise, type EtapeAAfficher,
} from '../../../../lib/gestion/frise';
import {
  estRepere, motEtape, TYPES_AJOUTABLES, TYPES_INFORMATION, type TypeEtape,
} from '../../../../lib/gestion/mongaEtape';

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
 * ⚠️ LE DÉFILEMENT HORIZONTAL NE DOIT JAMAIS PIÉGER LA PAGE. La molette VERTICALE sur la frise fait défiler la
 * PAGE, comme partout ailleurs ; seules la molette horizontale et Maj+molette déplacent la frise. Détourner la
 * molette verticale est le défaut classique des frises en ligne : on ne peut plus quitter le bloc en défilant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

interface Reponse {
  etat?: string;
  etapes?: EtapeAAfficher[];
  proposerCloture?: boolean;
  passagesEnFiableProposes?: { type: TypeEtape; confirmees: number }[];
  erreur?: string;
}

export function FriseAvancement({
  evenementId, onGeste, onOuvrirFil, onProposerCloture, compact = false,
}: {
  evenementId: number;
  /** Le compte rendu remonte à l'écran qui porte la frise : un seul bandeau par écran, jamais deux. */
  onGeste?: (message: string) => void;
  /** Ouvrir le mail d'origine d'une étape Monga. Absent = l'étape n'est pas cliquable. */
  onOuvrirFil?: (filId: number) => void;
  /** 🔴 PROPOSITION de clôture (Arno : « jamais automatique ») — l'écran parent décide quoi en faire. */
  onProposerCloture?: () => void;
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
   */
  const [apercu, setApercu] = useState<string | null>(null);
  const [fixe, setFixe] = useState<string | null>(null);
  const ouvert = fixe ?? apercu;
  const setOuvert = setFixe;
  const [ajout, setAjout] = useState(false);
  /**
   * 🔴 LE TYPE IMPOSÉ PAR UN CARRÉ POINTILLÉ. « Le bouton “Le devis est accepté” devient un clic sur le carré
   * pointillé “Acceptation du devis” (même effet) » — Arno. Le panneau s'ouvre avec son type déjà choisi.
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
  /** Reste-t-il du contenu caché à gauche / à droite ? Décide des flèches « ‹ › » (Arno). */
  const [bords, setBords] = useState({ gauche: false, droite: false });
  const piste = useRef<HTMLOListElement | null>(null);
  const cale = useRef(false);

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

  /** Met à jour les flèches. Appelée au défilement, au redimensionnement et après chaque relecture. */
  const mesurerBords = useCallback(() => {
    const el = piste.current;
    if (el === null) return;
    /* ⚠️ UNE MARGE D'UN PIXEL : les navigateurs rendent parfois `scrollLeft` fractionnaire, et une comparaison
       stricte ferait clignoter la flèche de droite à chaque pixel de défilement. */
    setBords({
      gauche: el.scrollLeft > 1,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = piste.current;
    if (el === null) return;
    mesurerBords();
    window.addEventListener('resize', mesurerBords);
    return () => window.removeEventListener('resize', mesurerBords);
  }, [mesurerBords, vue]);

  const glisser = (sens: -1 | 1): void => {
    const el = piste.current;
    if (el === null) return;
    /* Un peu plus d'un carré à la fois : on avance sans perdre le fil de ce qu'on regardait. */
    el.scrollBy({ left: sens * Math.max(160, el.clientWidth * 0.6), behavior: 'smooth' });
  };

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
      <div className="frs">
        <style>{CSS_FRISE}</style>
        <p className="gst-tronc" role="alert">{vue.m}</p>
      </div>
    );
  }

  const etapes = vue.d.etapes ?? [];
  const { majeures, reperes } = construireFrise(etapes);
  const ligne = rangerEnLigne(majeures, reperes);
  const plusieursRefs = referencesDeLaFrise(etapes).length > 1;
  const cleOuverture = cleDOuverture(majeures);
  /**
   * 🔴 CE QUE LA ZONE DU BAS MONTRE : la chose survolée, ou celle qu'un clic a fixée. Une seule à la fois —
   * deux bulles ouvertes feraient lire la mauvaise.
   */
  const detailAffiche = ouvert === null ? null
    : etapes.find((x) => `p${x.id}` === ouvert || `c${x.id}` === ouvert) ?? null;
  const motDuDetail = detailAffiche === null ? ''
    : (majeures.find((c) => c.etape?.id === detailAffiche.id)?.mot ?? motEtape(detailAffiche.type));

  return (
    <section className={`frs${compact ? ' frs--compact' : ''}`} aria-label="Avancement de l’événement">
      <style>{CSS_FRISE}</style>

      {/* ══ LA PROPOSITION DE CLÔTURE — jamais automatique (Arno) ══════════════════════════════════════════ */}
      {vue.d.proposerCloture === true && onProposerCloture !== undefined && (
        <p className="frs-proposition" role="status">
          Une intervention est signalée réalisée.{' '}
          <button type="button" className="frs-lien" onClick={onProposerCloture}>
            Clôturer cet événement ?
          </button>
        </p>
      )}

      {/* ══ LE PANNEAU D'AJOUT, AU-DESSUS DE LA FRISE (Arno : « dans une petite fenêtre au-dessus de la frise ») */}
      {ajout && (
        <AjouterEtape
          evenementId={evenementId} typeImpose={typePose} modifie={modifie}
          onFermer={() => { setAjout(false); setTypePose(null); setModifie(null); }}
          onFait={(m) => {
            onGeste?.(m); setAjout(false); setTypePose(null); setModifie(null); void charger();
          }}
        />
      )}

      <div className="frs-piste-cadre">
        {/* ⚠️ LES FLÈCHES N'APPARAISSENT QUE S'IL RESTE DU CONTENU CACHÉ (Arno). Une flèche qui ne mène nulle
            part apprend à ne plus regarder les flèches. */}
        {bords.gauche && (
          <button type="button" className="frs-fleche frs-fleche--g" aria-label="Voir les étapes précédentes"
            onClick={() => glisser(-1)}>‹</button>
        )}
        {bords.droite && (
          <button type="button" className="frs-fleche frs-fleche--d" aria-label="Voir les étapes suivantes"
            onClick={() => glisser(1)}>›</button>
        )}

        {/**
          * 🔴 UNE LISTE ORDONNÉE, et non une rangée de `div` : une frise EST une séquence, et c'est ce qu'un
          * lecteur d'écran doit entendre. Le trait qui relie les carrés est décoratif, posé en CSS.
          *
          * ⚠️ `onWheel` NE DÉTOURNE QUE LA MOLETTE HORIZONTALE ET MAJ+MOLETTE. La molette verticale continue de
          * faire défiler la PAGE — sans quoi on ne pourrait plus quitter le bloc en défilant.
          */}
        <ol
          className="frs-piste" ref={piste} onScroll={mesurerBords}
          onWheel={(e) => {
            const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
            if (!horizontal) return;
            e.currentTarget.scrollLeft += e.deltaX !== 0 ? e.deltaX : e.deltaY;
          }}
        >
          {ligne.map((el) => (
            <ElementDeLaFrise
              key={el.cle} el={el} avecReference={plusieursRefs} occupe={occupe}
              cleOuverture={cleOuverture} piste={piste} cale={cale}
              ouvert={ouvert} onOuvrir={setOuvert} onSurvol={setApercu}
              onOuvrirFil={onOuvrirFil}
              onConfirmer={(id, g) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: g })}
              onMontant={(id, cents) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: 'montant', montantCents: cents })}
              onRetirer={(id) => void agir(`/api/admin/gestion/etapes/${id}`, 'DELETE')}
              onPoser={(t) => { setTypePose(t); setAjout(true); }}
            />
          ))}
        </ol>
      </div>

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
        * ⚠️ UNE HAUTEUR RÉSERVÉE MÊME QUAND ELLE EST VIDE : sans cela, la page sauterait d'une centaine de
        * pixels à chaque survol d'un point, et les carrés se déroberaient sous la souris.
        */}
      <div className="frs-zone" aria-live="polite">
        {detailAffiche !== null && <BulleDetail
          e={detailAffiche} occupe={occupe} onOuvrirFil={onOuvrirFil}
          onModifier={(x) => { setModifie(x); setTypePose(null); setAjout(true); }}
          onMontant={(id, cents) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: 'montant', montantCents: cents })}
          onRetirer={(id) => void agir(`/api/admin/gestion/etapes/${id}`, 'DELETE')}
          mot={motDuDetail} />}
      </div>

      {/* ══ LA PROPOSITION D'ARNO : passer un motif en automatique fiable ═══════════════════════════════════
          🔴 PROPOSÉE, JAMAIS APPLIQUÉE (« propose-moi (sans l'appliquer) »). Un seul écart suffit à la retirer,
             même à cinquante confirmations — voir `proposerPassageEnFiable`. */}
      {(vue.d.passagesEnFiableProposes ?? []).length > 0 && (
        <p className="frs-fiable" role="status">
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
  piste: React.RefObject<HTMLOListElement | null>; cale: React.RefObject<boolean>;
  ouvert: string | null; onOuvrir: (c: string | null) => void;
  onSurvol: (cle: string | null) => void;
  onOuvrirFil?: (filId: number) => void;
  onConfirmer: (id: number, geste: 'confirmer' | 'ecarter') => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  onPoser: (type: TypeEtape) => void;
}) {
  if (p.el.sorte === 'plus') {
    return (
      <li className="frs-el frs-el--plus">
        {/**
          * 🔴 LE « + », JUSTE APRÈS LE DERNIER CARRÉ ATTEINT (Arno). Sur une frise entièrement vide — un événement
          * sans Monga — `rangerEnLigne` le met en PREMIER : la première chose à faire est bien d'ajouter.
          */}
        <button type="button" className="frs-carre frs-carre--plus" onClick={() => p.onPoser('autre')}
          aria-label="Ajouter une étape ou une information">
          <span className="frs-plus-rond" aria-hidden="true">+</span>
        </button>
      </li>
    );
  }

  if (p.el.sorte === 'points') {
    const messages = p.el.messages ?? [];
    return (
      <li className="frs-el frs-el--points">
        <span className="frs-sr">{motGroupeMessages(messages.length)}</span>
        <span className="frs-points">
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
      type="button" className={`frs-point frs-point--${m.type}${actif ? ' frs-point--actif' : ''}`}
      aria-expanded={actif} onClick={onOuvrir}
      onMouseEnter={() => onSurvol(`p${m.id}`)} onMouseLeave={() => onSurvol(null)}
      onFocus={() => onSurvol(`p${m.id}`)} onBlur={() => onSurvol(null)}
      title={`${motEtape(m.type)} · ${motDateEtape(m)}`}
    >
      <span className="frs-sr">{motEtape(m.type)} du {motDateEtape(m)}</span>
    </button>
  );
}

/* ── UN CARRÉ : une vraie étape ────────────────────────────────────────────────────────────────────────────── */

function Carre({
  c, avecReference, occupe, cleOuverture, piste, cale, ouvert, onOuvrir,
  onOuvrirFil, onConfirmer, onMontant, onRetirer, onPoser,
}: {
  c: CaseFrise; avecReference: boolean; occupe: boolean; cleOuverture: string | null;
  piste: React.RefObject<HTMLOListElement | null>; cale: React.RefObject<boolean>;
  ouvert: string | null; onOuvrir: (c: string | null) => void;
  onOuvrirFil?: (filId: number) => void;
  onConfirmer: (id: number, geste: 'confirmer' | 'ecarter') => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  onPoser: (type: TypeEtape) => void;
}) {
  const moi = useRef<HTMLLIElement | null>(null);

  /**
   * ══ 🔴🔴 « À L'OUVERTURE, LA FRISE EST POSITIONNÉE POUR MONTRER LA DERNIÈRE ÉTAPE ATTEINTE » (Arno) ═══════════
   *
   * ⚠️ UNE SEULE FOIS, ET C'EST TOUT L'INTÉRÊT DE `cale`. Sans ce verrou, chaque relecture (après un confirmer,
   * un ajout, un montant) ramènerait la frise à la dernière étape atteinte — et l'on perdrait l'endroit qu'on
   * regardait, juste après avoir agi dessus.
   *
   * ⚠️ `block: 'nearest'` ET `inline: 'center'` : on cale HORIZONTALEMENT sans faire sauter la page
   * verticalement. Un `scrollIntoView` par défaut remonterait la fiche entière sur la frise.
   */
  useEffect(() => {
    if (c.cle !== cleOuverture || cale.current || moi.current === null || piste.current === null) return;
    cale.current = true;
    moi.current.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [c.cle, cleOuverture, cale, piste]);

  const e = c.etape;

  /* ── ① L'ÉTAPE ATTENDUE, EN POINTILLÉ (Arno) ─────────────────────────────────────────────────────────────── */
  if (e === null) {
    /**
     * 🔴 « Le bouton “Le devis est accepté” devient un clic sur le carré pointillé “Acceptation du devis” (même
     * effet) » — Arno. C'est le SEUL pointillé cliquable : les autres étapes arrivent par mail, celle-là
     * n'arrive jamais (0 mail d'acceptation sur 120 mesurés).
     */
    const cliquable = c.type === 'devis_accepte';
    const contenu = (
      <>
        <span className="frs-titre">{c.mot}</span>
        <span className="frs-attendue">attendue</span>
      </>
    );
    return (
      <li className="frs-el" ref={moi}>
        {cliquable ? (
          <button type="button" className="frs-carre frs-carre--attendue frs-carre--posable"
            disabled={occupe} onClick={() => onPoser(c.type)}
            title="Le devis est accepté — poser l’étape">
            {contenu}
          </button>
        ) : (
          <div className="frs-carre frs-carre--attendue">{contenu}</div>
        )}
      </li>
    );
  }

  const aConfirmer = e.certitude === 'a_confirmer';
  const montant = motMontant(e.montantCents);
  const detailOuvert = ouvert === `c${e.id}`;
  const ouvrable = etapeOuvrable(e) && onOuvrirFil !== undefined;

  return (
    <li className="frs-el" ref={moi}>
      <div className={`frs-carre frs-carre--atteinte${aConfirmer ? ' frs-carre--doute' : ''}`}>
        {/**
          * 🔴 UN CLIC SUR UN CARRÉ MONGA OUVRE LE MAIL D'ORIGINE (Arno). Quand il n'y en a pas — étape manuelle,
          * mail supprimé, étape déduite — le carré ouvre son détail plutôt que de ne rien faire : un carré qui
          * ne réagit pas au clic se lit comme une panne.
          */}
        <button
          type="button" className="frs-carre-clic"
          onClick={() => {
            if (ouvrable) { (onOuvrirFil as (f: number) => void)(e.filId as number); return; }
            onOuvrir(detailOuvert ? null : `c${e.id}`);
          }}
          aria-expanded={ouvrable ? undefined : detailOuvert}
          title={ouvrable ? (motMailDOrigine(e) ?? undefined) : 'Voir le détail'}
        >
          <span className="frs-titre">
            {c.mot}
            {/* ⚠️ LE PICTO NE PORTE PAS L'INFORMATION SEUL : la source est lue dans la bulle et au lecteur d'écran. */}
            <span className="frs-picto" aria-hidden="true"> {pictoSource(e)}</span>
          </span>
          <span className="frs-date">{motDateEtape(e)}</span>
          {montant !== null && <span className="frs-montant">{montant}</span>}
          {avecReference && e.reference !== null && <span className="frs-ref">{e.reference}</span>}
          <span className="frs-sr">{motSource(e)}</span>
        </button>

        {/* 🔴 LES DEUX PETITS BOUTONS D'UNE ÉTAPE « À CONFIRMER » (Arno : « confirmer ✓ / écarter ✕ »). */}
        {aConfirmer && (
          <span className="frs-doute">
            <button type="button" className="frs-mini" disabled={occupe} title="Confirmer cette étape"
              onClick={() => onConfirmer(e.id, 'confirmer')}>✓<span className="frs-sr"> confirmer</span></button>
            <button type="button" className="frs-mini" disabled={occupe} title="Écarter cette étape"
              onClick={() => onConfirmer(e.id, 'ecarter')}>✕<span className="frs-sr"> écarter</span></button>
          </span>
        )}

        {/* 🔴 LE MENU « … » : détail, montant, modifier/retirer pour une étape manuelle (Arno). */}
        <button type="button" className="frs-menu" aria-expanded={detailOuvert}
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
  e, mot, occupe, onOuvrirFil, onMontant, onRetirer, onModifier,
}: {
  e: EtapeAAfficher; mot: string; occupe: boolean;
  onOuvrirFil?: (filId: number) => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  /** 🔴 LOT ATTENTION-ET-MODIFIER — rouvrir le formulaire, prérempli avec cette étape. */
  onModifier: (e: EtapeAAfficher) => void;
}) {
  const ouvrable = etapeOuvrable(e) && onOuvrirFil !== undefined;
  return (
    <div className="frs-bulle" role="status">
      <p className="frs-bulle-tete">
        {mot} · {motDateEtape(e)} · {motSource(e)}
        {e.auteur !== null && <> · {e.auteur}</>}
      </p>
      {e.numero !== null && <p className="frs-bulle-texte">N° {e.numero}</p>}
      {e.texte !== null && <p className="frs-bulle-texte">{e.texte}</p>}
      {/* 🔴 LA PHRASE QUI JUSTIFIE TOUT LE LOT MONGA-2 : sans la table des étapes, il n'y aurait rien à garder. */}
      {e.source === 'monga' && e.filId === null && <p className="frs-perdu">{motMailDOrigine(e)}</p>}
      <p className="frs-bulle-gestes">
        {ouvrable && (
          <button type="button" className="frs-lien"
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
          <button type="button" className="frs-lien" disabled={occupe} onClick={() => onModifier(e)}>
            Modifier
          </button>
        )}
        {e.source === 'manuelle' && (
          <button type="button" className="frs-lien" disabled={occupe} onClick={() => onRetirer(e.id)}>
            Retirer
          </button>
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
    <p className="frs-montant-champ">
      <label className="frs-label" htmlFor="frs-montant">Montant du devis</label>
      <input
        id="frs-montant" className="frs-champ" inputMode="decimal" value={saisie}
        placeholder="non renseigné" onChange={(ev) => setSaisie(ev.target.value)}
      />
      <span className="frs-unite">€</span>
      <button
        type="button" className="frs-btn" disabled={occupe}
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
   LE PANNEAU « AJOUTER » — repris par le « + » (Arno)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function AjouterEtape({
  evenementId, typeImpose, modifie, onFermer, onFait,
}: {
  evenementId: number; typeImpose: TypeEtape | null;
  /**
   * 🔴🔴 LOT ATTENTION-ET-MODIFIER — L'ÉTAPE MANUELLE QU'ON MODIFIE. `null` = on ajoute.
   *
   * Arno : « Il rouvre le MÊME formulaire prérempli (type, date, heure, texte) et passe par la route PATCH
   * existante. » Un second panneau d'édition aurait fini par proposer d'autres types, ou par oublier la bascule
   * « Étape / Simple information ».
   */
  modifie: EtapeAAfficher | null;
  onFermer: () => void; onFait: (message: string) => void;
}) {
  /**
   * 🔴 « avec en plus le choix “Étape” ou “Simple information” » (Arno). Une étape s'affiche en carré, une
   * information en point — et c'est le TYPE qui décide, `estRepere` tranchant à l'affichage. Le choix ne fait
   * donc que changer la liste des types proposés : il n'y a pas deux chemins d'écriture.
   */
  const [forme, setForme] = useState<'etape' | 'information'>('etape');
  const [type, setType] = useState<TypeEtape>('autre');
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState('');
  const [texte, setTexte] = useState('');
  const [piece, setPiece] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (typeImpose !== null) { setType(typeImpose); setForme('etape'); }
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
  }, [modifie?.id]);

  /* ⚠️ CHANGER DE FORME CHANGE LE TYPE s'il ne convient plus : sinon on poserait une « Clôture » en point. */
  useEffect(() => {
    const liste = forme === 'etape' ? TYPES_AJOUTABLES : TYPES_INFORMATION;
    if (!liste.includes(type)) setType(liste[0]);
  }, [forme, type]);

  const envoyer = async (): Promise<void> => {
    if (occupe || jour === '') return;
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
      };
      const res = modifie === null
        ? await fetch(`/api/admin/gestion/evenements/${evenementId}/frise`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...corps, pieceNom: piece.trim() === '' ? null : piece.trim() }),
        })
        : await fetch(`/api/admin/gestion/etapes/${modifie.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          /* ⚠️ LE MONTANT EST RENVOYÉ TEL QUEL : `modifierEtapeManuelle` l'écrit, et l'omettre l'effacerait. */
          body: JSON.stringify({ ...corps, geste: 'modifier', montantCents: modifie.montantCents }),
        });
      const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string; erreur?: string };
      const defaut = modifie === null ? 'Étape ajoutée.' : 'Étape modifiée.';
      onFait(d.etat === 'ok' ? (d.message ?? defaut) : (d.erreur ?? 'Enregistrement impossible.'));
    } catch {
      onFait('Enregistrement impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  const liste = forme === 'etape' ? TYPES_AJOUTABLES : TYPES_INFORMATION;

  return (
    <div className="frs-ajout" role="group" aria-label="Ajouter une étape ou une information">
      <p className="frs-ajout-titre">{modifie === null ? 'Ajouter' : 'Modifier l’étape'}</p>

      <div className="frs-ajout-ligne">
        <span className="frs-label">Forme</span>
        <span className="frs-bascule">
          <button type="button" className={`frs-bascule-b${forme === 'etape' ? ' frs-bascule-b--actif' : ''}`}
            aria-pressed={forme === 'etape'} onClick={() => setForme('etape')}>Étape (carré)</button>
          <button type="button" className={`frs-bascule-b${forme === 'information' ? ' frs-bascule-b--actif' : ''}`}
            aria-pressed={forme === 'information'} onClick={() => setForme('information')}>Simple information (point)</button>
        </span>
      </div>

      <div className="frs-ajout-ligne">
        <label className="frs-label" htmlFor="frs-type">Type</label>
        <select id="frs-type" className="frs-champ" value={type}
          onChange={(e) => setType(e.target.value as TypeEtape)}>
          {liste.map((t) => <option key={t} value={t}>{motEtape(t)}</option>)}
        </select>
      </div>

      <div className="frs-ajout-ligne">
        <label className="frs-label" htmlFor="frs-jour">Date</label>
        <input id="frs-jour" type="date" className="frs-champ" value={jour}
          onChange={(e) => setJour(e.target.value)} />
        <label className="frs-label" htmlFor="frs-heure">Heure</label>
        <input id="frs-heure" type="time" className="frs-champ" value={heure}
          onChange={(e) => setHeure(e.target.value)} />
      </div>

      <div className="frs-ajout-ligne">
        <label className="frs-label" htmlFor="frs-texte">Texte</label>
        <textarea id="frs-texte" className="frs-champ frs-champ--texte" rows={2} value={texte}
          onChange={(e) => setTexte(e.target.value)} />
      </div>

      {/* ⚠️ LA PIÈCE NE SE MODIFIE PAS ICI : `modifierEtapeManuelle` ne la touche pas, et un champ qui ne
          s'enregistre pas est pire qu'un champ absent. Elle reste offerte à l'AJOUT. */}
      {modifie === null && <div className="frs-ajout-ligne">
        <label className="frs-label" htmlFor="frs-piece">Pièce jointe</label>
        {/* ⚠️ LE NOM DE LA PIÈCE, PAS LE FICHIER : le dépôt range les pièces par le Drive (lot FENETRE-DRIVE-UNIQUE),
            et ouvrir ici un second chemin de dépôt aurait fait deux endroits où un fichier peut vivre. */}
        <input id="frs-piece" className="frs-champ" value={piece} placeholder="nom du document (facultatif)"
          onChange={(e) => setPiece(e.target.value)} />
      </div>}

      <div className="frs-ajout-ligne">
        <button type="button" className="frs-btn frs-btn--fort" disabled={occupe || jour === ''}
          onClick={() => void envoyer()}>{modifie === null ? 'Ajouter' : 'Enregistrer'}</button>
        <button type="button" className="frs-btn" onClick={onFermer}>Annuler</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA FEUILLE
   ⚠️ JETONS `--color-svv-*` UNIQUEMENT : aucune couleur en dur, Clair et Sombre suivent d'eux-memes. Le garde
      de feuille du depot refuse un hexadecimal ou un rgba() ici, commentaire compris.
   ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent dans un litteral gabarit.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const CSS_FRISE = `
.frs{margin:0}

/* Le cadre porte les fleches ; la piste defile sous elles. */
.frs-piste-cadre{position:relative}
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
   132 = 10 + 92 (la hauteur d'un carre, cf. .frs-carre) + 30. */
.frs-piste{list-style:none;margin:0;padding:10px 2px 30px;min-height:132px;box-sizing:border-box;
  display:flex;align-items:flex-start;
  gap:0;overflow-x:auto;scroll-behavior:smooth;scrollbar-width:thin}

/* Le trait fin qui relie les carres : une bordure posee sur la rangee, derriere les elements. */
.frs-el{position:relative;display:flex;align-items:flex-start;flex:0 0 auto}
.frs-el::before{content:'';position:absolute;left:0;right:0;top:44px;height:2px;
  background:var(--color-svv-line);z-index:0}
.frs-el:first-child::before{left:50%}
.frs-el:last-child::before{right:50%}

/* ══ LE CARRE — meme taille pour tous (Arno : environ 120 x 90 px) ══ */
.frs-carre{position:relative;z-index:1;box-sizing:border-box;width:124px;min-height:92px;
  margin:0 10px;padding:6px 7px;display:flex;flex-direction:column;gap:2px;
  border-radius:10px;border:2px solid var(--color-svv-red);background:var(--color-svv-bg)}
.frs-carre--atteinte{background:var(--color-svv-field)}
.frs-carre--doute{border-color:var(--color-svv-amber);border-style:solid}
/* L'etape attendue : pointille, pale (Arno). Elle se lit sans couleur. */
.frs-carre--attendue{border:2px dashed var(--color-svv-muted);background:transparent;opacity:.8}
.frs-carre--attendue .frs-titre{color:var(--color-svv-muted)}
.frs-carre--posable{cursor:pointer;text-align:left;font:inherit}
.frs-carre--posable:hover{border-color:var(--color-svv-red);opacity:1}

/* Le « + » : bordure pointillee rouge, gros + rouge cercle (Arno). */
.frs-carre--plus{align-items:center;justify-content:center;cursor:pointer;
  border:2px dashed var(--color-svv-red);background:transparent}
.frs-carre--plus:hover{background:var(--color-svv-field)}
.frs-plus-rond{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;
  border-radius:50%;border:2px solid var(--color-svv-red);color:var(--color-svv-red);
  font-size:1.5rem;line-height:1}

/* Le contenu du carre : nom en haut, date en dessous, picto de source. */
.frs-carre-clic{display:flex;flex-direction:column;gap:2px;width:100%;padding:0;
  font:inherit;text-align:left;background:none;border:0;cursor:pointer;color:var(--color-svv-ink)}
.frs-titre{font-size:.78rem;font-weight:700;line-height:1.15;color:var(--color-svv-ink);overflow-wrap:anywhere}
.frs-picto{color:var(--color-svv-red)}
.frs-date{font-size:.7rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.frs-montant{font-size:.72rem;font-weight:700;color:var(--color-svv-ink)}
.frs-ref{font-size:.68rem;font-weight:700;color:var(--color-svv-muted)}
.frs-attendue{font-size:.7rem;font-style:italic;color:var(--color-svv-muted)}

/* Les deux petits boutons d'une etape « a confirmer », et le menu « … ». */
.frs-doute{position:absolute;right:4px;bottom:4px;display:flex;gap:3px}
.frs-mini{width:22px;height:22px;min-width:22px;padding:0;font:inherit;font-size:.72rem;cursor:pointer;
  border-radius:5px;border:1px solid var(--color-svv-amber);background:var(--color-svv-bg);
  color:var(--color-svv-ink);line-height:1}
.frs-mini:hover{background:var(--color-svv-amber);color:var(--color-svv-bg)}
.frs-mini:disabled{opacity:.5;cursor:default}
.frs-menu{position:absolute;right:4px;top:3px;width:20px;height:20px;padding:0;font:inherit;
  line-height:1;cursor:pointer;border:0;border-radius:4px;background:none;color:var(--color-svv-muted)}
.frs-menu:hover{background:var(--color-svv-line);color:var(--color-svv-ink)}

/* ══ LES POINTS — sur le trait, entre les carres ══ */
.frs-el--points{align-self:flex-start;padding-top:38px}
.frs-points{position:relative;z-index:1;display:flex;align-items:center;gap:4px;padding:0 3px}
.frs-point-boite{position:relative;display:inline-flex}
.frs-point{width:11px;height:11px;min-width:11px;min-height:11px;padding:0;cursor:pointer;
  border-radius:50%;border:1px solid var(--color-svv-muted);background:var(--color-svv-bg)}
.frs-point:hover,.frs-point:focus-visible{background:var(--color-svv-red);border-color:var(--color-svv-red)}
.frs-point--rappel_devis{border-style:dashed}
.frs-point--facture{border-width:2px}
.frs-point--note{background:var(--color-svv-field);border-color:var(--color-svv-ink)}
/* Le point dont la bulle est affichee : on voit d'ou vient ce qu'on lit en dessous. */
.frs-point--actif{background:var(--color-svv-red);border-color:var(--color-svv-red)}

/* La bulle : au survol, et fixee au clic. */
/* ══ LA ZONE DE DETAIL, SOUS LA FRISE ET HORS DU CONTENEUR QUI DEFILE ══
   Une hauteur minimale reservee meme vide : sans elle, la page sauterait d'une centaine de pixels a chaque
   survol d'un point, et les carres se deroberaient sous la souris. */
.frs-zone{min-height:92px;margin-top:10px}
.frs-bulle{display:flex;flex-direction:column;gap:2px;max-width:40rem;padding:7px 9px;border-radius:8px;
  background:var(--color-svv-bg);border:1px solid var(--color-svv-line);
  border-left:3px solid var(--color-svv-red)}
.frs-bulle-tete{font-size:.72rem;font-weight:700;color:var(--color-svv-ink)}
.frs-bulle-texte{margin:0;font-size:.76rem;color:var(--color-svv-ink);overflow-wrap:anywhere;white-space:pre-wrap}
.frs-bulle-gestes{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}

/* ══ LES FLECHES ══ */
.frs-fleche{position:absolute;top:50%;transform:translateY(-50%);z-index:6;width:28px;height:44px;
  padding:0;font:inherit;font-size:1.3rem;line-height:1;cursor:pointer;
  border:1px solid var(--color-svv-line);border-radius:7px;
  background:var(--color-svv-bg);color:var(--color-svv-ink)}
.frs-fleche:hover{background:var(--color-svv-field)}
.frs-fleche--g{left:-2px}
.frs-fleche--d{right:-2px}

/* ══ LE DETAIL D'UN CARRE, ET LE RESTE ══ */
.frs-lien{font:inherit;font-size:.76rem;color:var(--color-svv-red);background:none;border:0;padding:0;
  text-decoration:underline;cursor:pointer;min-height:24px}
.frs-lien:disabled{color:var(--color-svv-muted);cursor:default}
.frs-perdu{font-size:.74rem;font-style:italic;color:var(--color-svv-muted);margin:0}

.frs-btn{font:inherit;font-size:.78rem;min-height:36px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);border:1px solid var(--color-svv-line);
  border-radius:6px}
.frs-btn:hover{background:var(--color-svv-field)}
.frs-btn:disabled{color:var(--color-svv-muted);cursor:default}
.frs-btn--fort{color:var(--color-svv-bg);background:var(--color-svv-red);border-color:var(--color-svv-red)}

.frs-proposition{margin:0 0 8px;padding:6px 8px;font-size:.8rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:6px}
.frs-fiable{margin:8px 0 0;padding:6px 8px;font-size:.78rem;color:var(--color-svv-muted);
  background:var(--color-svv-field);border-radius:6px}

/* ══ LE PANNEAU D'AJOUT, au-dessus de la frise ══ */
.frs-ajout{margin:0 0 10px;padding:9px;background:var(--color-svv-field);border-radius:8px;
  border:1px solid var(--color-svv-line)}
.frs-ajout-titre{margin:0 0 7px;font-size:.84rem;font-weight:700;color:var(--color-svv-ink)}
.frs-ajout-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 7px}
.frs-label{font-size:.76rem;color:var(--color-svv-muted);min-width:5rem}
.frs-champ{font:inherit;font-size:.82rem;min-height:36px;padding:4px 8px;color:var(--color-svv-ink);
  background:var(--color-svv-bg);border:1px solid var(--color-svv-line);border-radius:6px}
.frs-champ--texte{flex:1 1 14rem;min-height:48px}
.frs-bascule{display:flex;flex-wrap:wrap;gap:6px}
.frs-bascule-b{font:inherit;font-size:.78rem;min-height:36px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);
  border:1px solid var(--color-svv-line);border-radius:6px}
.frs-bascule-b--actif{color:var(--color-svv-bg);background:var(--color-svv-red);
  border-color:var(--color-svv-red)}
.frs-montant-champ{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 0}
.frs-unite{font-size:.82rem;color:var(--color-svv-muted)}

.frs-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}

/* Ecran etroit : la frise DEFILE, rien ne se superpose et rien ne se replie (Arno). Les bulles et les
   detachements se recadrent pour ne pas sortir de l'ecran. */
@media (max-width:600px){
  .frs-ajout-ligne{flex-direction:column;align-items:stretch}
  .frs-label{min-width:0}
  .frs-champ{width:100%}
  .frs-bulle{max-width:100%}
}
`;
