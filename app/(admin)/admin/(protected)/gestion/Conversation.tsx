'use client';

import { useCallback, useEffect, useState } from 'react';
import type { EnTeteFil, MailParti, MessageDeFil, PieceDeMessage } from '../../../../lib/gestion/carteRepo';
import {
  etatCorps, lignesDestinataires, mentionHorsFile, messagesDeplies, MENTION_HTML_SEUL,
} from '../../../../lib/gestion/conversation';
import { depuis, formaterDateFr, formaterTaille, libelleSens } from '../../../../lib/gestion/ecran';
import { corpsLisible, trierPieces } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
import { MenuDiscret } from './MenuDiscret';
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
    const fil: EnTeteFil = d.fil ?? { filId, objet: null, etat: 'a_classer', reference: null, evenementId: null };
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

/** Un geste sur l'échange. Les routes sont CELLES QUI EXISTENT : ce lot ne réécrit aucune logique métier. */
async function geste(url: string, methode: 'POST' | 'DELETE', succes: string, onGeste: Rapport): Promise<void> {
  try {
    const res = await fetch(url, { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
    if (!res.ok || !d.ok) { onGeste(d.erreur ?? 'Geste impossible.'); return; }
    onGeste(succes, { rechargerTout: true });
  } catch {
    onGeste('Geste impossible : le serveur n’a pas répondu.');
  }
}

export function Conversation({ filId, maintenant, onGeste, onFerme, avecBandeau = true }: {
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
}) {
  const [vue, setVue] = useState<Vue>({ v: 'charge' });
  const [deplies, setDeplies] = useState<Set<number>>(new Set());
  const [corps, setCorps] = useState<Map<number, string | null>>(new Map());
  const [affecter, setAffecter] = useState(false);
  const [deplacer, setDeplacer] = useState<number | null>(null);

  const recharger = useCallback(async () => {
    setVue({ v: 'charge' });
    const r = await chargerConversation(filId);
    setVue(r);
    // Le dernier message est déplié d'emblée — et son corps est DÉJÀ là (le serveur l'envoie avec la conversation).
    if (r.v === 'ok') setDeplies(messagesDeplies(r.messages));
  }, [filId]);

  useEffect(() => { void recharger(); }, [recharger]);

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
  const tousDeplies = messages.length > 0 && messages.every((m) => deplies.has(m.messageId));

  return (
    <section className="cnv" aria-labelledby={`cnv-titre-${fil.filId}`}>
      <style>{CSS_CONVERSATION}</style>

      {/* ══ LE BANDEAU DU HAUT : NOS FONCTIONS MAISON ══════════════════════════════════════════════════════════════
          Elles appellent les routes EXISTANTES, sans réécrire une ligne de leur logique — donc même journal, même
          réversibilité, mêmes garanties qu'avant ce lot. */}
      {avecBandeau && (
      <div className="cnv-bandeau">
        <div className="cnv-bandeau-haut">
          {onFerme && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={onFerme}>← Retour</button>
          )}
          {fil.reference && <span className="cnv-ref">{fil.reference}</span>}
          {fil.etat === 'sans_suite' && <span className="cnv-etiquette">classé sans suite</span>}
          <span className="cnv-menu">
            <MenuDiscret titre="Actions sur cet échange" entrees={[
              ...(rattache ? [] : [{ libelle: 'Affecter à une carte…', onChoisir: () => setAffecter(true) }]),
              ...(rattache ? [{
                libelle: 'Détacher l’échange',
                discrete: true,
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/affectation`, 'DELETE',
                  'Échange détaché : il est revenu dans la file, avec tous ses messages.', onGeste),
              }] : []),
              ...(fil.etat === 'a_classer' ? [{
                libelle: 'Classer sans suite',
                discrete: true,
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'POST',
                  'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', onGeste),
              }] : [{
                libelle: 'Rouvrir l’échange',
                onChoisir: () => void geste(`/api/admin/gestion/fils/${fil.filId}/sans-suite`, 'DELETE',
                  'Échange rouvert : il est revenu dans la file.', onGeste),
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
            onDeplacer={() => setDeplacer(m.messageId)}
            onRemettre={() => void agirSurLeMail(m.messageId, null, onGeste)}
            panneau={deplacer === m.messageId ? (
              <DeplacerVers titre="Déplacer ce mail vers" exclure={null}
                onAnnuler={() => setDeplacer(null)}
                onValider={async (cible) => { await agirSurLeMail(m.messageId, cible, onGeste); setDeplacer(null); }} />
            ) : null} />
        ))}
      </ol>

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
 * UN message de la conversation. Replié, il tient sur une ligne (expéditeur, extrait, date) ; déplié, il montre son
 * en-tête complet, son texte et ses pièces. Le texte est rendu TEL QUEL — jamais interprété comme du HTML.
 */
export function MessageConversation({
  message, maintenant, ouvert, corpsCharge, onBasculer, onDeplacer, onRemettre, panneau,
}: {
  message: MessageDeFil; maintenant: Date; ouvert: boolean;
  corpsCharge?: string | null; onBasculer: () => void;
  /** Gestes par mail, CONSERVÉS du lot 4d : déplacer ce mail vers une autre carte, ou l'en détacher. */
  onDeplacer?: () => void; onRemettre?: () => void; panneau?: React.ReactNode;
}) {
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
      {(onDeplacer || onRemettre) && (
        <div className="cnv-msg-menu">
          <MenuDiscret titre="Actions sur ce message" entrees={[
            ...(onDeplacer ? [{ libelle: 'Déplacer ce mail vers un autre événement…', onChoisir: onDeplacer }] : []),
            ...(onRemettre ? [{ libelle: 'Détacher ce mail', discrete: true, onChoisir: onRemettre }] : []),
          ]} />
        </div>
      )}
      {/* La LIGNE REPLIÉE est le bouton : toute la largeur, au moins 44 px, et l'état annoncé par `aria-expanded`. */}
      <button type="button" className="cnv-ligne" aria-expanded={ouvert} onClick={onBasculer}>
        <span className="cnv-ligne-haut">
          {/* Le SENS est dit par un MOT (« reçu de » / « envoyé à ») : il reste lisible en niveaux de gris. */}
          <span className="cnv-qui">{libelleSens(message.sens)} {qui}</span>
          <span className="cnv-quand" title={formaterDateFr(message.recuLe)}>{depuis(message.recuLe, maintenant)}</span>
        </span>
        {/* Une mention EN MOTS : elle reste lisible en niveaux de gris et pour un daltonien. */}
        {hors && <span className="cnv-hors">{hors}</span>}
        {!ouvert && message.extrait && <span className="cnv-extrait">{corpsLisible(message.extrait).visible}</span>}
      </button>

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
            <dd>{formaterDateFr(message.recuLe)}</dd>
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

          <PiecesDuMessage vraies={vraies} signatures={signatures} />
        </div>
      )}
    </li>
  );
}

/** Les pièces d'un message, servies PAR L'APPLICATION — aucune URL de stockage ne sort jamais vers le navigateur. */
function PiecesDuMessage({ vraies, signatures }: { vraies: PieceDeMessage[]; signatures: PieceDeMessage[] }) {
  return (
    <>
      {vraies.length > 0 && (
        <ul className="gst-pieces">
          {vraies.map((p) => <LignePiece key={p.pieceId} piece={p} />)}
        </ul>
      )}
      {/* Les images de signature, à part et repliées : consultables, mais elles ne noient plus les vraies pièces. */}
      {signatures.length > 0 && (
        <details className="gst-cite">
          <summary className="gst-cite-titre">
            {signatures.length} image{signatures.length > 1 ? 's' : ''} de signature
          </summary>
          <ul className="gst-pieces">
            {signatures.map((p) => <LignePiece key={p.pieceId} piece={p} />)}
          </ul>
        </details>
      )}
    </>
  );
}

function LignePiece({ piece: p }: { piece: PieceDeMessage }) {
  return (
    <li className="gst-piece">
      {p.disponible ? (
        <>
          {/* Servie par l'application : le droit est relu à chaque ouverture. Aucune URL de stockage ici. */}
          <a className="gst-lien" href={`/api/admin/gestion/pieces/${p.pieceId}`} target="_blank" rel="noreferrer">{p.nomFichier}</a>
          <span className="gst-sep" aria-hidden="true">·</span>
          <span>{formaterTaille(p.tailleOctets)}</span>
          <span className="gst-sep" aria-hidden="true">·</span>
          <a className="gst-lien" href={`/api/admin/gestion/pieces/${p.pieceId}?telecharger=1`}>Télécharger</a>
        </>
      ) : (
        // Pas de lien : une pièce non déposée ne s'ouvrira pas, et un lien mort userait la confiance.
        <span className="gst-absent">{p.nomFichier} — non conservée{p.motifNonStocke ? ` (${p.motifNonStocke})` : ''}</span>
      )}
    </li>
  );
}

const CSS_CONVERSATION = `
.cnv{display:flex;flex-direction:column;gap:12px;min-width:0}
.cnv-bandeau{display:flex;flex-direction:column;gap:6px;padding-bottom:10px;border-bottom:1px solid var(--color-svv-line)}
.cnv-bandeau-haut{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.cnv-menu{margin-left:auto}
.cnv-ref{font-weight:700;font-size:.85rem;color:var(--color-svv-green-ink)}
.cnv-etiquette{font-size:.75rem;font-weight:700;padding:.15rem .5rem;border:1px solid var(--color-svv-line-strong);border-radius:.5rem;color:var(--color-svv-muted)}
.cnv-titre{margin:0;font-size:1.05rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-compte{margin:0;font-size:.8rem;color:var(--color-svv-muted)}
.cnv-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}
.cnv-msg{position:relative;border-bottom:1px solid var(--color-svv-line);min-width:0}
.cnv-msg--hors{background:var(--color-svv-field)}
.cnv-ligne{display:flex;flex-direction:column;gap:3px;width:100%;min-height:44px;padding:10px 4px;text-align:left;
  background:none;border:0;color:inherit;font:inherit;cursor:pointer}
.cnv-ligne:hover,.cnv-ligne:focus-visible{background:var(--color-svv-field)}
.cnv-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.cnv-ligne-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;justify-content:space-between}
.cnv-qui{font-weight:700;font-size:.95rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-quand{font-size:.8rem;color:var(--color-svv-muted);white-space:nowrap}
.cnv-hors{font-size:.75rem;font-weight:700;color:var(--color-svv-muted)}
.cnv-extrait{font-size:.85rem;color:var(--color-svv-muted);overflow-wrap:anywhere;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.cnv-detail{padding:0 4px 12px;min-width:0}
.cnv-entete{margin:0 0 10px;padding:8px 10px;background:var(--color-svv-field);border-radius:.5rem;font-size:.8rem;min-width:0}
.cnv-entete dt{font-weight:700;color:var(--color-svv-muted)}
.cnv-entete dd{margin:0 0 .35rem;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cnv-note{color:var(--color-svv-muted);font-style:italic}
/* Le menu est posé dans le coin, AU-DESSUS de la ligne : la ligne garde sa pleine largeur cliquable, et le menu
   reste atteignable message replié comme déplié. Marge à droite de la ligne pour qu'ils ne se recouvrent jamais. */
.cnv-msg-menu{position:absolute;top:4px;right:0;z-index:1}
.cnv-ligne{padding-right:52px}
`;
