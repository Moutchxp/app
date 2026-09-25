'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EnTeteFil, MailParti, MessageDeFil, PieceDeMessage } from '../../../../lib/gestion/carteRepo';
import {
  etatCorps, lignesDestinataires, mentionHorsFile, messagesDeplies, MENTION_HTML_SEUL,
} from '../../../../lib/gestion/conversation';
import { dateHeureComplete, dateHeureCourte, formaterTaille, libelleSens, LIBELLE_CLASSER } from '../../../../lib/gestion/ecran';
import {
  actionsDuStatut, libelleCartouche, lienVersCarte, precisionCartouche, statutDuMessage, tonCartouche,
  type ActionStatut, type StatutClassement,
} from '../../../../lib/gestion/statutClassement';
import { corpsLisible, trierPieces } from '../../../../lib/gestion/lisibilite';
import { CSS_PIECES, PiecesJointes } from './PiecesJointes';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { MenuDiscret } from './MenuDiscret';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { preparerBrouillon, type VoieRedaction } from '../../../../lib/gestion/redaction';
import { heureGmail } from '../../../../lib/gestion/ecran';
import { lienGmail, libelleEtoile, menuMessage, type ActionMessage } from '../../../../lib/gestion/gmailMenu';
import { PanneauAffecter } from './PanneauAffecter';
import { agirSurLeMail, DeplacerVers, type Rapport } from './gestesMail';

/**
 * LOT 5b — LA VUE CONVERSATION. UNE SEULE, utilisée partout où l'on ouvre un échange : depuis la boîte mail, depuis le
 * poste de tri, depuis une carte. Deux vues du même échange finiraient par diverger — et c'est toujours celle qu'on
 * regarde le moins qui garde le défaut.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LA FORME VOULUE PAR ARNO : en HAUT nos fonctions maison (affecter, classer sans suite, rouvrir, détacher, déplacer,
 * référence GES-…), en DESSOUS un environnement de messagerie ordinaire. Les fonctions maison ne sont pas réécrites :
 * elles appellent les MÊMES routes qu'avant, donc le même journal et le même comportement.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * CE QUE CE LOT N'A PAS : répondre / transférer / nouveau message (5e), la recherche (5c), l'affichage de la mise en
 * forme HTML (5d), l'état « à traiter / traité par X » par échange. Le texte est rendu TEL QUEL, jamais interprété.
 *
 * MOBILE D'ABORD : chaque ligne repliée est un bouton pleine largeur d'au moins 44 px, les adresses passent à la ligne
 * plutôt que de déborder, aucune interaction au survol seul. Couleurs : jetons `--color-svv-*` uniquement, et chaque
 * information portée par un MOT — « Hors file de tri », « destinataires non détaillés » — jamais par la couleur seule.
 */

type Vue =
  | { v: 'charge' }
  | { v: 'ok'; fil: EnTeteFil; messages: MessageDeFil[]; partis: MailParti[] }
  | { v: 'erreur'; m: string };

async function chargerConversation(filId: number): Promise<Vue> {
  try {
    const res = await fetch(`/api/admin/gestion/fils/${filId}/messages`, { cache: 'no-store' });
    if (!res.ok) return { v: 'erreur', m: res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Lecture impossible.' };
    const d = (await res.json()) as { fil?: EnTeteFil; messages: MessageDeFil[]; partis?: MailParti[] };
    // Repli SÛR : sans en-tête (réponse d'une version antérieure), on rend quand même la conversation — les fonctions
    //   maison se calment plutôt que de faire écran blanc. Lire le courrier doit toujours rester possible.
    const fil: EnTeteFil = d.fil ?? { filId, objet: null, etat: 'a_classer', reference: null, evenementId: null, evenementObjet: null };
    return { v: 'ok', fil, messages: d.messages ?? [], partis: d.partis ?? [] };
  } catch {
    return { v: 'erreur', m: 'Lecture impossible : le serveur n’a pas répondu.' };
  }
}

/** Le corps d'UN message, au dépliage. `null` = rien à afficher ; `undefined` = la lecture a échoué. */
async function chargerCorps(messageId: number): Promise<string | null | undefined> {
  try {
    const res = await fetch(`/api/admin/gestion/messages/${messageId}/corps`, { cache: 'no-store' });
    if (!res.ok) return undefined;
    return ((await res.json()) as { corps: string | null }).corps;
  } catch {
    return undefined;
  }
}

/**
 * Un geste sur l'échange. Les routes sont CELLES QUI EXISTENT : ce lot ne réécrit aucune logique métier.
 *
 * LOT 5-GMAIL — il RELIT ensuite la conversation (`apres`). En plein écran on RESTE sur l'échange après un geste :
 * la barre d'actions doit donc dire la vérité tout de suite (la référence GES-… qui apparaît, « Rouvrir » qui
 * remplace « Classer sans suite »). Sans cette relecture, la barre continuerait d'annoncer l'état d'avant.
 */
async function geste(url: string, methode: 'POST' | 'DELETE', succes: string, onGeste: Rapport, apres?: () => void): Promise<void> {
  try {
    const res = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
    if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Geste impossible.'); return; }
    onGeste(succes, { rechargerTout: true });
    apres?.();
  } catch {
    onGeste('Geste impossible : le serveur n’a pas répondu.');
  }
}

export function Conversation({ filId, maintenant, onGeste, onFerme, avecBandeau = true, barreActions = false, onClassement, redaction = null }: {
  filId: number;
  maintenant: Date;
  onGeste: Rapport;
  /** Optionnel : la boîte mail affiche un retour, une carte n'en a pas besoin. */
  onFerme?: () => void;
  /**
   * Le bandeau des fonctions maison. Éteint DANS UNE CARTE — et uniquement là : l'échange y porte déjà son propre menu,
   * visible même replié, et le dupliquer donnerait deux commandes identiques à dix pixels l'une de l'autre. Aucune
   * fonction n'est retirée : elles restent toutes à leur place d'avant, au même endroit et au même clic.
   */
  avecBandeau?: boolean;
  /**
   * LOT 5-GMAIL — LA BARRE D'ACTIONS, en plein écran. Les gestes qui vivaient dans le menu « ⋯ » deviennent des
   * BOUTONS visibles, façon messagerie : flèche de retour tout à gauche, puis les actions maison. Le menu « ⋯ »
   * reste, avec exactement les mêmes entrées — rien n'a été déplacé hors de portée.
   *
   * ⚠️ AUCUN bouton d'envoi (« Répondre », « Transférer ») : ils viendront avec le lot d'envoi. Un bouton grisé
   * qui promet une fonction inexistante fait perdre plus de temps qu'une absence.
   */
  barreActions?: boolean;
  /**
   * Classer / créer / déplacer : l'écran PARENT ouvre son propre partage (conversation à gauche, événements à
   * droite). Sans ce rappel, la barre retombe sur le panneau d'affectation en place — le comportement d'avant.
   */
  onClassement?: (voie: 'nouveau' | 'existant') => void;
  /**
   * LOT 5e — ce que l'écran sait de la rédaction : droit, schéma, connexion Google, signature, délai d'annulation.
   * ABSENT = aucun bouton d'écriture, et la conversation est exactement celle d'avant ce lot.
   */
  redaction?: ContexteRedactionEcran | null;
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [deplies, setDeplies] = useState<Set<number>>(new Set());
  const [corps, setCorps] = useState<Map<number, string | null>>(new Map());
  const [affecter, setAffecter] = useState(false);
  const [deplacer, setDeplacer] = useState<number | null>(null);
  /** LOT 5e — le brouillon en cours d'écriture sous la conversation. `null` = on ne rédige pas. */
  const [brouillon, setBrouillon] = useState<BrouillonEcran | null>(null);
  /**
   * LOT 5-FIDÈLE — l'état de chaque message DANS GMAIL (étoile, non lu). Relu à l'ouverture, jamais mémorisé en base :
   * quelqu'un de l'équipe peut étoiler depuis son téléphone pendant qu'on regarde l'écran.
   */
  const [gmail, setGmail] = useState<Map<number, { etoile: boolean; nonLu: boolean } | null>>(new Map());

  const recharger = useCallback(async () => {
    setVue({ v: 'charge' });
    const r = await chargerConversation(filId);
    setVue(r);
    // Le dernier message est déplié d'emblée — et son corps est DÉJÀ là (le serveur l'envoie avec la conversation).
    if (r.v === 'ok') setDeplies(messagesDeplies(r.messages));
  }, [filId]);

  useEffect(() => { void recharger(); }, [recharger]);

  /**
   * LOT 5-FIDÈLE — L'ÉTAT GMAIL DE CHAQUE MESSAGE (étoile, non lu), relu À L'OUVERTURE et jamais mémorisé en base :
   * quelqu'un de l'équipe peut étoiler depuis son téléphone pendant qu'on regarde l'écran.
   *
   * ⚠️ EN SÉRIE, ET SEULEMENT DANS LA VUE EN PLEINE PAGE. Chaque message demande une recherche `rfc822msgid:` à
   * Gmail : cent requêtes en parallèle sur un fil de cent messages feraient étrangler la connexion par Google. Un
   * échec ne casse rien — l'étoile n'est simplement pas affichée, plutôt que montrée éteinte, ce qui mentirait.
   */
  useEffect(() => {
    if (!barreActions || vue.v !== 'ok') return;
    let annule = false;
    const aDemander = vue.messages.slice(0, 25).map((m) => m.messageId);
    void (async () => {
      for (const id of aDemander) {
        if (annule) return;
        try {
          const res = await fetch(`/api/admin/gestion/messages/${id}/gmail`, { cache: 'no-store' });
          if (!res.ok || annule) continue;
          const d = (await res.json()) as { etat?: { etoile: boolean; nonLu: boolean } | null };
          if (!annule && d.etat) setGmail((g) => new Map(g).set(id, d.etat ?? null));
        } catch { /* pas d'étoile affichée : voir l'encadré */ }
      }
    })();
    return () => { annule = true; };
  }, [barreActions, vue]);

  async function basculer(m: MessageDeFil) {
    const ouvert = deplies.has(m.messageId);
    setDeplies((s) => { const n = new Set(s); if (ouvert) n.delete(m.messageId); else n.add(m.messageId); return n; });
    // On ne va chercher un corps qu'UNE fois, et seulement s'il en manque un : replier puis redéplier ne recharge rien.
    if (!ouvert && etatCorps(m, corps.get(m.messageId)).v === 'a_charger') {
      const c = await chargerCorps(m.messageId);
      setCorps((s) => new Map(s).set(m.messageId, c ?? null));
    }
  }

  async function toutDeplier(messages: readonly MessageDeFil[]) {
    setDeplies(new Set(messages.map((m) => m.messageId)));
    const manquants = messages.filter((m) => etatCorps(m, corps.get(m.messageId)).v === 'a_charger');
    // En série, pas en parallèle : 102 requêtes d'un coup mettraient le serveur à genoux pour un geste de confort.
    for (const m of manquants) {
      const c = await chargerCorps(m.messageId);
      setCorps((s) => new Map(s).set(m.messageId, c ?? null));
    }
  }

  if (vue.v === 'charge') return <p className="gst-info" role="status">Chargement de la conversation…</p>;
  if (vue.v === 'erreur') {
    return (
      <div>
        <p className="gst-erreur" role="status">{vue.m}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void recharger()}>Réessayer</button>
      </div>
    );
  }

  const { fil, messages, partis } = vue;
  const rattache = fil.reference !== null;

  /**
   * CE QUE LE CARTOUCHE DÉCLENCHE. Chaque geste passe par la route qui EXISTE — rien n'est réécrit, rien n'est
   * dupliqué : « classer », « changer l'affectation » et « créer » ouvrent le même panneau d'affectation que le
   * lot 4b (en place, ou dans le partage du plein écran quand l'écran parent en propose un), « classer sans suite »
   * et « rouvrir » appellent les deux verbes symétriques de `/fils/[id]/sans-suite`.
   */
  /**
   * LOT 5-FIDÈLE — CE QUE FAIT CHAQUE ENTRÉE DU MENU « ⋮ ». Trois natures, et aucune ne fait semblant :
   *   · `gmail`  — on demande à la vraie boîte (droit d'écriture relu en base côté serveur, et journal) ;
   *   · `lien`   — l'API de Gmail ne sait pas le faire : on ouvre le message DANS Gmail, et l'entrée le DIT ;
   *   · `maison` — c'est notre outil qui répond, sans rien demander à Google.
   */
  const agirSurLeMessage = async (a: ActionMessage, m: MessageDeFil) => {
    const ouvrirDansGmail = () => {
      const lien = lienGmail(redaction?.adresseGestion ?? 'gestion@criterimmo.fr', { messageIdRfc: m.messageIdRfc });
      if (lien === null) { onGeste('Impossible d’ouvrir ce message dans Gmail : son identifiant est inconnu.'); return; }
      window.open(lien, '_blank', 'noopener');
    };
    switch (a) {
      case 'repondre': case 'repondre_tous': case 'transferer':
        if (redaction) setBrouillon(ouvrirRedaction(a, [m], fil.filId, redaction, maintenant));
        return;
      // Ces quatre-là, Gmail ne les expose pas : on y emmène, et l'entrée l'annonce déjà en toutes lettres.
      case 'partager_chat': case 'hameconnage': case 'illegal': case 'traduire':
        ouvrirDansGmail(); return;
      case 'filtrer_similaires':
        onGeste(`Recherche des messages de ${m.de} — ouvrez la boîte et collez « ${m.de} » dans le champ de recherche.`);
        return;
      case 'imprimer':
        window.print(); return;
      case 'telecharger':
        window.open(`/api/admin/gestion/messages/${m.messageId}/original?telecharger=1`, '_blank', 'noopener'); return;
      case 'afficher_original':
        window.open(`/api/admin/gestion/messages/${m.messageId}/original`, '_blank', 'noopener'); return;
      default: break;
    }
    // Les trois actions qui MODIFIENT Gmail. Une confirmation d'abord quand l'entrée en demande une.
    const entree = menuMessage({ nomExpediteur: m.deNom?.trim() || m.de }).find((e) => e.cle === a);
    if (entree?.confirmation && !window.confirm(entree.confirmation)) return;
    try {
      const res = await fetch(`/api/admin/gestion/messages/${m.messageId}/gmail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: a }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; erreur?: string; etat?: { etoile: boolean; nonLu: boolean } | null };
      if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Action impossible.'); return; }
      if (d.etat) setGmail((g) => new Map(g).set(m.messageId, d.etat ?? null));
      onGeste(d.message ?? 'C’est fait.');
    } catch {
      onGeste('Action impossible : le serveur n’a pas répondu.');
    }
  };

  /** L'ÉTOILE : elle bascule, exactement comme le clic de Gmail — on ne décide pas à sa place ce qu'elle doit devenir. */
  const basculerEtoile = async (m: MessageDeFil) => {
    try {
      const res = await fetch(`/api/admin/gestion/messages/${m.messageId}/gmail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'etoile' }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; erreur?: string; etat?: { etoile: boolean; nonLu: boolean } | null };
      if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Action impossible.'); return; }
      if (d.etat) setGmail((g) => new Map(g).set(m.messageId, d.etat ?? null));
    } catch {
      onGeste('Action impossible : le serveur n’a pas répondu.');
    }
  };

  const agirSurLeStatut = (a: ActionStatut) => {
    if (a === 'classer' || a === 'changer') { if (onClassement) onClassement('existant'); else setAffecter(true); return; }
    if (a === 'creer') { if (onClassement) onClassement('nouveau'); else setAffecter(true); return; }
    if (a === 'sans_suite') {
      void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'POST',
        'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', onGeste, () => void recharger());
      return;
    }
    void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'DELETE',
      'Échange rouvert : il est revenu dans la file.', onGeste, () => void recharger());
  };
  const tousDeplies = messages.length > 0 && messages.every((m) => deplies.has(m.messageId));

  return (
    <section className="cnv" aria-labelledby={`cnv-titre-${fil.filId}`}>
      <style>{CSS_CONVERSATION}{CSS_PIECES}</style>

      {/* ══ LE BANDEAU DU HAUT : NOS FONCTIONS MAISON ══════════════════════════════════════════════════════════════
          Elles appellent les routes EXISTANTES, sans réécrire une ligne de leur logique — donc même journal, même
          réversibilité, mêmes garanties qu'avant ce lot. */}
      {avecBandeau && (
      <div className={`cnv-bandeau${barreActions ? ' cnv-bandeau--barre' : ''}`}>
        <div className="cnv-bandeau-haut">
          {/* LA SORTIE, TOUJOURS EN PREMIER. En plein écran c'est une FLÈCHE, comme dans une messagerie — mais une
              flèche muette n'est pas un bouton : le libellé accessible est écrit, et la cible fait 44 px. C'est le
              MÊME geste que le « ← Retour » d'avant, au même endroit. */}
          {onFerme && (barreActions
            ? (
              <button type="button" className="cnv-retour" aria-label="Retour à la liste" title="Retour à la liste"
                onClick={onFerme}>
                <span aria-hidden="true">←</span>
              </button>
            )
            : <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>← Retour</button>)}
          {fil.reference && <span className="cnv-ref">{fil.reference}</span>}
          {fil.etat === 'sans_suite' && <span className="cnv-etiquette">classé sans suite</span>}

          {/* ══ LOT 5-STATUT — LA BARRE NE PORTE PLUS LES TROIS BOUTONS DE CLASSEMENT ═══════════════════════════════
              « Classer dans une carte », « Créer un événement » et « Classer sans suite » ont quitté cette barre
              (décision d'Arno du 24/09/2026 — le seul retrait de ce lot). Ils vivent désormais DANS LE CARTOUCHE DE
              STATUT, à gauche de la date de chaque message : là où l'on voit d'abord où en est l'échange, et donc là
              où l'on décide de le changer. La flèche de retour et le menu « ⋯ » restent ici, et le menu conserve
              TOUTES ses entrées — « Détacher » comprise. Rien n'est devenu inatteignable. */}

          <span className="cnv-menu">
            <MenuDiscret titre="Actions sur cet échange" entrees={[
              // LOT 5-FUSION-B — « Classer dans une carte » remplace « Affecter » ici aussi : un seul mot pour un
              //   seul geste, dans tout le module. La route et le journal sont inchangés.
              ...(rattache ? [] : [{ libelle: `${LIBELLE_CLASSER}…`, onChoisir: () => (onClassement ? onClassement('existant') : setAffecter(true)) }]),
              ...(rattache ? [{
                libelle: 'Détacher l’échange',
                discrete: true,
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/affectation`, 'DELETE',
                  'Échange détaché : il est revenu dans la file, avec tous ses messages.', onGeste, () => void recharger()),
              }] : []),
              ...(fil.etat === 'a_classer' ? [{
                libelle: 'Classer sans suite',
                discrete: true,
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'POST',
                  'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', onGeste, () => void recharger()),
              }] : [{
                libelle: 'Rouvrir l’échange',
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'DELETE',
                  'Échange rouvert : il est revenu dans la file.', onGeste, () => void recharger()),
              }]),
            ]} />
          </span>
        </div>
        <h2 className="cnv-titre" id={`cnv-titre-${fil.filId}`}>{nettoyerObjet(fil.objet) || '(sans objet)'}</h2>
        <p className="cnv-compte">
          {messages.length} message{messages.length > 1 ? 's' : ''}
          {messages.length > 1 && (
            <>
              {' · '}
              <button type="button" className="gst-lien-bouton"
                onClick={() => (tousDeplies ? setDeplies(new Set()) : void toutDeplier(messages))}>
                {tousDeplies ? 'Tout replier' : 'Tout déplier'}
              </button>
            </>
          )}
        </p>
      </div>
      )}
      {/* Le compte et « tout déplier » restent accessibles même sans bandeau (dans une carte). */}
      {!avecBandeau && messages.length > 1 && (
        <p className="cnv-compte">
          {messages.length} messages{' · '}
          <button type="button" className="gst-lien-bouton"
            onClick={() => (tousDeplies ? setDeplies(new Set()) : void toutDeplier(messages))}>
            {tousDeplies ? 'Tout replier' : 'Tout déplier'}
          </button>
        </p>
      )}

      {affecter && (
        <PanneauAffecter filId={fil.filId} objet={fil.objet ?? undefined}
          onFait={(m) => { setAffecter(false); onGeste(m, { rechargerTout: true }); void recharger(); }}
          onAnnuler={() => setAffecter(false)} />
      )}

      {/* ══ LA CONVERSATION ═══════════════════════════════════════════════════════════════════════════════════════ */}
      <ol className="cnv-fil">
        {messages.map((m) => (
          <MessageConversation key={m.messageId} message={m} maintenant={maintenant}
            ouvert={deplies.has(m.messageId)}
            corpsCharge={corps.get(m.messageId)}
            onBasculer={() => void basculer(m)}
            statut={statutDuMessage(fil, m)}
            onActionStatut={agirSurLeStatut}
            gmail={{ etat: gmail.get(m.messageId) ?? null }}
            onEtoile={barreActions && redaction ? () => void basculerEtoile(m) : undefined}
            onRepondre={barreActions && redaction ? (voie) => setBrouillon(ouvrirRedaction(voie, [m], fil.filId, redaction, maintenant)) : undefined}
            onActionMessage={barreActions ? (a) => void agirSurLeMessage(a, m) : undefined}
            onDeplacer={() => setDeplacer(m.messageId)}
            onRemettre={() => void agirSurLeMail(m.messageId, null, onGeste)}
            panneau={deplacer === m.messageId ? (
              <DeplacerVers titre="Déplacer ce mail vers" exclure={null}
                onAnnuler={() => setDeplacer(null)}
                onValider={async (cible) => { await agirSurLeMail(m.messageId, cible, onGeste); setDeplacer(null); }} />
            ) : null} />
        ))}
      </ol>

      {/* ══ LOT 5e — ÉCRIRE, SOUS LA CONVERSATION (façon messagerie) ══════════════════════════════════════════════
          Les trois boutons ne s'affichent QUE si tout est réuni : base à jour, droit d'envoi, et écran de lecture en
          pleine page. Chaque manque est DIT, jamais tu — un bouton absent sans explication envoie chercher un bug. */}
      {barreActions && redaction && (
        brouillon !== null ? (
          <Redaction brouillon={brouillon} contexte={redaction}
            onChange={setBrouillon}
            onFerme={() => setBrouillon(null)}
            onEnvoye={() => { setBrouillon(null); void recharger(); }}
            onGeste={(m) => onGeste(m)} />
        ) : (
          <div className="cnv-ecrire">
            {!redaction.schemaPret && (
              <p className="gst-tronc">Mise à jour de la base à appliquer avant de pouvoir écrire (migrations 239 à 241).</p>
            )}
            {redaction.schemaPret && !redaction.peutEnvoyer && (
              <p className="gst-tronc">Vous n’avez pas le droit d’envoyer au nom de gestion@.</p>
            )}
            {redaction.schemaPret && redaction.peutEnvoyer && (
              /* LOT 5-FIDÈLE — LE PIED DE GMAIL : trois boutons ARRONDIS, avec leur icône, dans l'ordre de Gmail.
                 Même fonction qu'avant, même route, même rédaction : seule la forme reprend celle que l'équipe
                 connaît. L'icône ne porte jamais l'information seule — le mot est écrit à côté. */
              <div className="cnv-pied">
                {(['repondre', 'repondre_tous', 'transferer'] as const).map((voie) => (
                  <button key={voie} type="button" className="cnv-pied-bouton"
                    onClick={() => setBrouillon(ouvrirRedaction(voie, messages, fil.filId, redaction, maintenant))}>
                    <IconeVoie voie={voie} />
                    <span>{voie === 'repondre' ? 'Répondre' : voie === 'repondre_tous' ? 'Répondre à tous' : 'Transférer'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      )}

      {/* La note de réversibilité, CONSERVÉE : ce qui se fait d'un clic doit se défaire d'un clic, et se lire. */}
      <p className="gst-note">Détacher ou déplacer ne supprime rien : par le menu « ⋯ » de l’échange, il retourne dans la file ou rejoint une autre carte, avec tous ses messages et ses pièces.</p>

      {/* LES MAILS SORTIS DE CET ÉCHANGE — annoncés, jamais effacés en silence (comportement du lot 4d-B2, conservé). */}
      {partis.length > 0 && (
        <ul className="gst-partis">
          {partis.map((p) => (
            <li key={p.messageId} className="gst-parti">
              <span>
                1 mail déplacé vers <span className="gst-ref">{p.reference}</span>
                {p.objet?.trim() ? ` — « ${p.objet.trim()} »` : ''}
              </span>
              {/* Le geste de retour, CONSERVÉ tel quel : ce qui se fait d'un clic doit se défaire d'un clic. */}
              <button type="button" className="gst-lien-bouton"
                onClick={() => void agirSurLeMail(p.messageId, null, onGeste)}>
                Remettre dans son échange
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * LOT 5-FIDÈLE — LES TROIS ICÔNES DU PIED, en SVG EN LIGNE : c'est la convention du dépôt (aucune bibliothèque
 * d'icônes n'y est installée, et en ajouter une pour trois flèches serait une dépendance de plus à suivre).
 *
 * ⚠️ `aria-hidden` : l'icône ne dit rien de plus que le mot écrit à côté. La laisser lisible aux lecteurs d'écran
 * ferait entendre deux fois la même chose.
 */
function IconeVoie({ voie }: { voie: VoieRedaction }) {
  const commun = { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true as const,
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (voie === 'transferer') {
    return (
      <svg {...commun}><path d="M15 7l5 5-5 5" /><path d="M20 12h-9a6 6 0 00-6 6v1" /></svg>
    );
  }
  if (voie === 'repondre_tous') {
    return (
      <svg {...commun}><path d="M8 7l-5 5 5 5" /><path d="M13 7l-5 5 5 5" /><path d="M8 12h7a5 5 0 015 5v1" /></svg>
    );
  }
  return (
    <svg {...commun}><path d="M9 7l-5 5 5 5" /><path d="M4 12h9a6 6 0 016 6v1" /></svg>
  );
}

/**
 * LOT 5e — OUVRE UN BROUILLON à partir du DERNIER message de la conversation. C'est celui auquel on répond quand on
 * clique « Répondre » sans avoir rien désigné d'autre — le comportement de toute messagerie.
 *
 * 🔴 Toute la décision (qui reçoit quoi, quel objet, quelle citation) vit dans `redaction.ts`, module PUR et
 * entièrement éprouvé. Ici on ne fait que lui passer le message et récupérer le résultat.
 */
function ouvrirRedaction(
  voie: VoieRedaction, messages: readonly MessageDeFil[], filId: number,
  ctx: ContexteRedactionEcran, maintenant: Date,
): BrouillonEcran {
  const dernier = messages.length > 0 ? messages[messages.length - 1] : null;
  const b = preparerBrouillon(voie, dernier === null ? null : {
    messageId: dernier.messageId, de: dernier.de, deNom: dernier.deNom, objet: dernier.objet,
    recuLe: dernier.recuLe, corps: dernier.corps ?? dernier.extrait,
    destA: dernier.destA, destCc: dernier.destCc, destinatairesFondus: dernier.destinatairesFondus,
  }, { adresseGestion: ctx.adresseGestion, signature: ctx.signature },
  { filId, dateLisible: dernier ? dateHeureComplete(dernier.recuLe) : undefined });
  void maintenant;
  return { ...b, id: null };
}

/**
 * UN message de la conversation. Replié, il tient sur une ligne (expéditeur, extrait, date) ; déplié, il montre son
 * en-tête complet, son texte et ses pièces. Le texte est rendu TEL QUEL — jamais interprété comme du HTML.
 */
export function MessageConversation({
  message, maintenant, ouvert, corpsCharge, onBasculer, onDeplacer, onRemettre, panneau, statut, onActionStatut,
  gmail, onEtoile, onRepondre, onActionMessage,
}: {
  message: MessageDeFil; maintenant: Date; ouvert: boolean;
  corpsCharge?: string | null; onBasculer: () => void;
  /** Gestes par mail, CONSERVÉS du lot 4d : déplacer ce mail vers une autre carte, ou l'en détacher. */
  onDeplacer?: () => void; onRemettre?: () => void; panneau?: React.ReactNode;
  /**
   * LOT 5-STATUT — OÙ EN EST CE MESSAGE, juste à gauche de sa date. Absent = aucun cartouche, et le message est
   * exactement celui d'avant ce lot (c'est le cas des écrans qui n'en ont pas besoin).
   */
  statut?: StatutClassement;
  /** Ce que le cartouche déclenche. Absent = le cartouche n'est qu'un CONSTAT, sans bouton. */
  onActionStatut?: (a: ActionStatut) => void;
  /**
   * LOT 5-FIDÈLE — l'état du message DANS GMAIL (étoile, non lu), relu à l'ouverture. `null`/absent = pas de
   * connexion Google : l'étoile n'est pas affichée plutôt que montrée éteinte, ce qui ne voudrait rien dire.
   */
  gmail?: { etat: { etoile: boolean; nonLu: boolean } | null } | null;
  onEtoile?: () => void;
  onRepondre?: (voie: VoieRedaction) => void;
  /** Une entrée du menu « ⋮ » qui n'est ni « déplacer » ni « détacher » — celles-là gardent leurs rappels d'origine. */
  onActionMessage?: (a: ActionMessage) => void;
}) {
  const [actions, setActions] = useState(false);
  const propositions = statut ? actionsDuStatut(statut) : { declencheur: null, actions: [] };
  const hors = mentionHorsFile(message);
  const qui = message.deNom?.trim() || message.de;
  const etat = etatCorps(message, corpsCharge);
  const lisible = etat.v === 'texte' ? corpsLisible(etat.texte) : null;
  const { vraies, signatures } = trierPieces(message.pieces);

  return (
    <li className={`cnv-msg${message.horsFile ? ' cnv-msg--hors' : ''}`}>
      {/* LE MENU DU MAIL — effacé au repos (décision d'Arno : pas de boutons partout), mais toujours atteignable, y
          compris message REPLIÉ. Il est le VOISIN de la ligne, pas son enfant : la ligne EST un bouton, et un bouton
          dans un bouton est invalide et injouable au clavier. C'est la même solution que pour `BlocRepliable`. */}
      {/* La LIGNE REPLIÉE est le bouton : toute la largeur, au moins 44 px, et l'état annoncé par `aria-expanded`. */}
      <button type="button" className="cnv-ligne" aria-expanded={ouvert} onClick={onBasculer}>
        {/* Le SENS est dit par un MOT (« reçu de » / « envoyé à ») : il reste lisible en niveaux de gris. */}
        <span className="cnv-qui">{libelleSens(message.sens)} {qui}</span>
        {/* Une mention EN MOTS : elle reste lisible en niveaux de gris et pour un daltonien. */}
        {hors && <span className="cnv-hors">{hors}</span>}
        {!ouvert && message.extrait && <span className="cnv-extrait">{corpsLisible(message.extrait).visible}</span>}
      </button>

      {/* ══ LE COIN DE L'EN-TÊTE : statut · date · menu ═══════════════════════════════════════════════════════════
          🔴 VOISIN de la ligne, jamais son enfant. La ligne EST un bouton, et le cartouche en contient (« Modifier »,
          un lien vers la carte) : un bouton dans un bouton est invalide et injouable au clavier. C'est la solution
          déjà retenue pour le menu « ⋯ » et pour `BlocRepliable`.
          L'ORDRE DU DOM est aussi l'ordre mobile : sous la ligne, le cartouche passe donc sous le nom de
          l'expéditeur quand la place manque — exactement ce qu'Arno a demandé. */}
      {/* ══ LOT 5-FIDÈLE — L'EN-TÊTE DE GMAIL, DANS SON ORDRE ═════════════════════════════════════════════════════
          [statut] · heure · étoile · flèche Répondre · ⋮ — les mêmes places que dans Gmail, parce que l'équipe y
          travaille toute la journée et ne doit pas réapprendre où viser. */}
      <div className="cnv-coin">
        {statut && (
          <CartoucheStatut statut={statut} ouvert={actions}
            declencheur={propositions.declencheur}
            onBasculer={onActionStatut ? () => setActions((v) => !v) : undefined} />
        )}
        {/* L'heure façon Gmail : « 19:07 (il y a 3 heures) », « hier 17:24 », « 22 sept. 18:44 ». */}
        <span className="cnv-quand" title={dateHeureComplete(message.recuLe)}>{heureGmail(message.recuLe, maintenant)}</span>

        {/* L'ÉTOILE — elle bascule le libellé STARRED dans la VRAIE boîte, et son état est relu DANS GMAIL.
            Sans connexion Google, elle n'est pas affichée : on ne montre pas une étoile éteinte qui ne dirait rien. */}
        {gmail?.etat && onEtoile && (
          <button type="button" className={`cnv-etoile${gmail.etat.etoile ? ' cnv-etoile--posee' : ''}`}
            aria-pressed={gmail.etat.etoile} aria-label={libelleEtoile(gmail.etat.etoile)} title={libelleEtoile(gmail.etat.etoile)}
            onClick={onEtoile}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"
              fill={gmail.etat.etoile ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* LA FLÈCHE RÉPONDRE — le geste le plus fréquent, atteignable sans ouvrir le menu, comme dans Gmail. */}
        {onRepondre && (
          <button type="button" className="cnv-icone" aria-label="Répondre" title="Répondre"
            onClick={() => onRepondre('repondre')}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 7L4 12l5 5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 12h9a6 6 0 016 6v1" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {/* LE MENU « ⋮ » — mêmes mots, même ordre, mêmes séparateurs que Gmail. Il garde AUSSI nos entrées maison,
            rangées sous « Gestion » : « Déplacer ce mail », « Détacher ce mail ». */}
        <MenuDiscret titre="Actions sur ce message" glyphe="⋮" entrees={
          menuMessage({ nomExpediteur: qui, avecGestes: Boolean(onDeplacer || onRemettre) })
            .filter((e) => (e.cle === 'deplacer_mail' ? Boolean(onDeplacer) : e.cle === 'detacher_mail' ? Boolean(onRemettre) : true))
            .map((e) => ({
              libelle: e.libelle,
              aide: e.aide,
              separateurAvant: e.separateurAvant,
              section: e.section,
              discrete: e.cle === 'detacher_mail',
              onChoisir: () => {
                if (e.cle === 'deplacer_mail') { onDeplacer?.(); return; }
                if (e.cle === 'detacher_mail') { onRemettre?.(); return; }
                onActionMessage?.(e.cle);
              },
            }))
        } />
      </div>

      {/* LES GESTES RÉVÉLÉS — pleine largeur, donc empilés d'eux-mêmes sur téléphone. Ils appellent les routes qui
          existaient avant ce lot : aucune logique nouvelle, même journal, même réversibilité. */}
      {statut && onActionStatut && actions && propositions.actions.length > 0 && (
        <div className="cnv-statut-actions" role="group" aria-label={`Classement — ${libelleCartouche(statut)}`}>
          {propositions.actions.map((a) => (
            <button key={a.cle} type="button" className="svv-btn svv-btn-outline gst-btn"
              onClick={() => { setActions(false); onActionStatut(a.cle); }}>
              {a.libelle}
            </button>
          ))}
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setActions(false)}>
            Annuler
          </button>
        </div>
      )}

      {panneau}

      {ouvert && (
        <div className="cnv-detail">
          <dl className="cnv-entete">
            <dt>De</dt>
            <dd>{message.deNom?.trim() ? `${message.deNom.trim()} <${message.de}>` : message.de}</dd>
            {lignesDestinataires(message).map((l, i) => (
              <div key={`${l.champ ?? 'fondu'}-${i}`} className="cnv-entete-ligne">
                <dt>{l.champ ?? 'À'}</dt>
                <dd>
                  {l.valeur}
                  {/* Dire qu'on ne sait pas est une information ; laisser croire qu'on sait n'en est pas une. */}
                  {l.approximatif && <span className="cnv-note"> — destinataires non détaillés</span>}
                </dd>
              </div>
            ))}
            <dt>Date</dt>
            <dd>{dateHeureComplete(message.recuLe)}</dd>
          </dl>

          {etat.v === 'texte' && lisible !== null && (
            <>
              <p className="gst-msg-corps">{lisible.visible || '(message sans texte)'}</p>
              {lisible.cite && (
                <details className="gst-cite">
                  <summary className="gst-cite-titre">Afficher le message cité</summary>
                  <p className="gst-msg-corps gst-cite-corps">{lisible.cite}</p>
                </details>
              )}
            </>
          )}
          {etat.v === 'a_charger' && <p className="gst-info" role="status">Chargement du message…</p>}
          {/* 557 messages en base n'ont QUE de la mise en forme. Un vide muet ferait croire à un message vide. */}
          {etat.v === 'html_seul' && <p className="gst-msg-corps gst-absent">{MENTION_HTML_SEUL}</p>}
          {etat.v === 'vide' && <p className="gst-msg-corps gst-absent">(message sans texte)</p>}

          {/* LOT 5-PJ-A — un SEUL composant rend les pièces, partout où un message s'affiche. */}
          <PiecesJointes messageId={message.messageId} vraies={vraies} signatures={signatures} />
        </div>
      )}
    </li>
  );
}

/**
 * LOT 5-STATUT — LE CARTOUCHE : où en est ce message, en UN COUP D'ŒIL et EN TOUTES LETTRES.
 *
 * 🔴 LE MOT EST TOUJOURS ÉCRIT — « À classer », « Sans suite », « Courrier automatique », ou la référence GES-… avec
 * le titre de la carte. Le ton (vert pour une carte) ne fait que l'appuyer : seul, il serait muet en niveaux de gris,
 * pour un daltonien, et pour un lecteur d'écran.
 *
 * CLIQUABLE VERS LA CARTE quand il y en a une : le lien mène à la boîte en plein écran, sous l'étiquette de cette
 * carte — un écran qui existe déjà. Sans identifiant, pas de lien : un lien mort use la confiance plus qu'il ne sert.
 */
export function CartoucheStatut({ statut, ouvert, declencheur, onBasculer }: {
  statut: StatutClassement;
  ouvert: boolean;
  /** Le mot du bouton qui révèle les gestes (« Classer », « Modifier »). `null` = ce statut n'en propose aucun. */
  declencheur: string | null;
  /** Absent = cartouche de CONSTAT, sans bouton (mail déplacé seul, courrier automatique). */
  onBasculer?: () => void;
}) {
  const mot = libelleCartouche(statut);
  const precision = precisionCartouche(statut);
  const lien = lienVersCarte(statut);
  return (
    <span className="cnv-statut">
      {lien
        ? <a className={`cnv-cartouche cnv-cartouche--${tonCartouche(statut)}`} href={lien} title={precision ?? undefined}>{mot}</a>
        : <span className={`cnv-cartouche cnv-cartouche--${tonCartouche(statut)}`} title={precision ?? undefined}>{mot}</span>}
      {declencheur && onBasculer && (
        <button type="button" className="cnv-statut-bouton" aria-expanded={ouvert} onClick={onBasculer}>
          {declencheur}
        </button>
      )}
    </span>
  );
}

const CSS_CONVERSATION = `
.cnv{display:flex;flex-direction:column;gap:12px;min-width:0}
.cnv-bandeau{display:flex;flex-direction:column;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--color-svv-line)}
.cnv-bandeau-haut{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cnv-menu{margin-left:auto}
/* ── LOT 5-GMAIL : LA BARRE D'ACTIONS ───────────────────────────────────────────────────────────────────────────── */
/* Elle COLLE en haut : sur une conversation de cent messages, les actions doivent rester sous la main sans remonter. */
.cnv-bandeau--barre{position:sticky;top:0;z-index:3;background:var(--color-svv-surface);padding-top:6px}
/* La flèche de retour : une CIBLE de 44 px, un libellé accessible, et un contour au focus bien visible. Un glyphe
   seul n'est pas un bouton : c'est son libellé accessible qui le rend utilisable au lecteur d'écran. */
.cnv-retour{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:0;
  font-size:20px;line-height:1;color:var(--color-svv-ink);background:transparent;border:1px solid transparent;
  border-radius:.5rem;cursor:pointer}
.cnv-retour:hover{background:var(--color-svv-field);border-color:var(--color-svv-line)}
.cnv-retour:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cnv-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
/* Les trois boutons d'écriture, sous la conversation — là où Gmail les met, et là où l'on regarde après avoir lu. */
.cnv-ecrire{padding-top:10px;border-top:1px solid var(--color-svv-line)}
.cnv-ref{font-weight:700;font-size:.85rem;color:var(--color-svv-green-ink)}
.cnv-etiquette{font-size:.75rem;font-weight:700;padding:.15rem .5rem;border:1px solid var(--color-svv-line-strong);border-radius:.5rem;color:var(--color-svv-muted)}
.cnv-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.cnv-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
/* L'EN-TÊTE D'UN MESSAGE : la ligne cliquable, puis son COIN (statut · date · menu) — deux frères, jamais imbriqués.
   Ils s'assoient côte à côte quand il y a la place, et le coin passe SOUS le nom de l'expéditeur quand elle manque. */
.cnv-msg{display:flex;flex-wrap:wrap;align-items:flex-start;border-bottom:1px solid var(--color-svv-line);min-width:0}
.cnv-msg--hors{background:var(--color-svv-field)}
.cnv-ligne{display:flex;flex-direction:column;gap:3px;flex:1 1 16rem;min-width:0;min-height:44px;padding:10px 4px;
  text-align:left;background:none;border:0;color:inherit;font:inherit;cursor:pointer}
.cnv-ligne:hover,.cnv-ligne:focus-visible{background:var(--color-svv-field)}
.cnv-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.cnv-coin{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:6px;flex:0 1 auto;
  min-width:0;padding:6px 0}
/* Les gestes révélés prennent la LARGEUR ENTIÈRE : ils s'empilent donc d'eux-mêmes sur un téléphone. */
.cnv-statut-actions{flex-basis:100%;display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 10px}
.cnv-statut{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}
/* ── LOT 5-FIDÈLE : l'étoile et les icônes de l'en-tête, aux places de Gmail ──────────────────────────────────── */
.cnv-etoile,.cnv-icone{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  padding:0;color:var(--color-svv-muted);background:transparent;border:1px solid transparent;border-radius:.5rem;cursor:pointer}
.cnv-etoile:hover,.cnv-icone:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line)}
.cnv-etoile:focus-visible,.cnv-icone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'étoile POSÉE : remplie ET colorée. Son libellé accessible change aussi — jamais la couleur seule. */
.cnv-etoile--posee{color:var(--color-svv-red)}
/* ── LOT 5-FIDÈLE : le pied de Gmail — trois boutons arrondis, icône puis mot ─────────────────────────────────── */
.cnv-pied{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}
.cnv-pied-bouton{display:inline-flex;align-items:center;gap:.45rem;min-height:44px;padding:.45rem 1.1rem;
  font:inherit;font-size:.85rem;font-weight:600;color:var(--color-svv-ink);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:999px;cursor:pointer}
.cnv-pied-bouton:hover{background:var(--color-svv-field)}
.cnv-pied-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* LE CARTOUCHE — le MOT d'abord, la couleur ensuite : lisible en niveaux de gris et pour un daltonien. */
.cnv-cartouche{display:inline-block;max-width:22rem;padding:2px 8px;border-radius:999px;font-size:.72rem;
  font-weight:700;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  border:1px solid var(--color-svv-line-strong);color:var(--color-svv-muted);background:var(--color-svv-surface)}
a.cnv-cartouche{text-decoration:underline;text-underline-offset:2px}
a.cnv-cartouche:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cnv-cartouche--succes{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft);border-color:var(--color-svv-green)}
.cnv-cartouche--attente{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong)}
.cnv-cartouche--neutre{color:var(--color-svv-muted)}
/* Le déclencheur (« Classer », « Modifier ») : discret, mais une cible de 44 px et un focus très visible. */
.cnv-statut-bouton{min-height:44px;padding:0 .4rem;font-size:.75rem;font-weight:700;color:var(--color-svv-red);
  background:transparent;border:0;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.cnv-statut-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.cnv-qui{font-weight:700;font-size:.95rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-quand{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.cnv-hors{font-size:.75rem;font-weight:700;color:var(--color-svv-muted)}
.cnv-extrait{font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.cnv-detail{flex-basis:100%;padding:0 4px 12px;min-width:0}
.cnv-entete{margin:0 0 10px;padding:8px 10px;background:var(--color-svv-field);border-radius:.5rem;font-size:.8rem;min-width:0}
.cnv-entete dt{font-weight:700;color:var(--color-svv-muted)}
.cnv-entete dd{margin:0 0 .35rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-note{color:var(--color-svv-muted);font-style:italic}
/* Le menu vit désormais DANS le coin, à côté de la date et du cartouche : plus de positionnement absolu, donc plus
   de largeur réservée en dur sur la ligne — et rien ne peut se recouvrir quand le cartouche est long. */
`;
