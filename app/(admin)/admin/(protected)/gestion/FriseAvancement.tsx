'use client';

import { useCallback, useEffect, useState } from 'react';
/**
 * 🔴 DEPUIS LES MODULES **PURS**, JAMAIS DEPUIS LE DÉPÔT. Ce composant vit dans le navigateur : importer
 * `mongaEtapeRepo` le ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire
 * TOUTE l'application — page de connexion comprise (incident du 24/09/2026). Le garde
 * `clientBoundary.guard.test.ts` le vérifie.
 */
import {
  construireFrise, etapeOuvrable, motDateEtape, motMailDOrigine, motMontant, motSource,
  referencesDeLaFrise, type CaseFrise, type EtapeAAfficher,
} from '../../../../lib/gestion/frise';
import { motEtape, TYPES_AJOUTABLES, type TypeEtape } from '../../../../lib/gestion/mongaEtape';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 3 — LA FRISE D'AVANCEMENT D'UN ÉVÉNEMENT ═════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : « Les ÉTAPES MAJEURES, bien visibles, dans l'ordre chronologique : Ouverture →
 * Prise de rendez-vous → Devis 1, 2, 3… (montant) → Acceptation du devis → Rendez-vous d'intervention →
 * Intervention → Clôture. Chaque étape porte sa date et sa source (pictogramme Monga ou « ajoutée par
 * <collaborateur> ») ; un clic sur une étape Monga ouvre le mail d'origine s'il existe encore (sinon : « mail
 * supprimé — étape conservée »). Les étapes attendues mais pas encore atteintes s'affichent en pointillé.
 * Les COMMENTAIRES Monga et les rappels : simples petits repères discrets sur la frise, dont le contenu
 * s'affiche au survol. Ce ne sont pas des étapes. […] Fonctionne aussi pour un événement SANS Monga (frise
 * entièrement manuelle). Clair et Sombre, lisible sur écran étroit. »
 *
 * ═══ 🔴🔴 CE QUE L'AUDIT A IMPOSÉ À CET ÉCRAN ═══════════════════════════════════════════════════════════════════
 *
 * Deux des étapes majeures qu'Arno a listées n'arrivent **jamais** par mail, et c'est mesuré, pas supposé :
 *   · le MONTANT d'un devis — 2 mails sur 120, et ce sont deux phrases humaines ; le mail « Devis envoyé » dit
 *     seulement « le devis est disponible, vous pouvez le valider via le lien ». Le montant est DERRIÈRE le lien.
 *   · l'ACCEPTATION du devis — **0 mail**. Monga ne notifie pas la validation : c'est nous qui validons chez eux.
 *
 * 🔴 DÉCISION D'ARNO APRÈS CE CONSTAT : « Devis automatique (numéro + date), montant complété à la main ;
 * “Acceptation du devis” en étape manuelle affichée en pointillé, validable en un clic. » C'est exactement ce que
 * rend cet écran : le pointillé de l'acceptation porte un bouton qui la pose, et la case d'un devis porte un
 * champ de montant.
 *
 * ⚠️ AUCUN HOVER SEUL POUR UNE FONCTION : le survol d'un repère RÉVÈLE un texte, il ne déclenche rien. Les
 * repères sont aussi des boutons, pour que le clavier et le tactile y accèdent — exigence transverse du dépôt
 * (CLAUDE.md §15 : « pas d'interaction dépendant du survol seul »).
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
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ajout, setAjout] = useState(false);
  /**
   * 🔴 LE TYPE IMPOSÉ PAR UN POINTILLÉ. « Acceptation du devis » est validable EN UN CLIC (décision d'Arno) :
   * le bouton du pointillé ouvre le panneau AVEC son type déjà choisi, au lieu de laisser le chercher dans une
   * liste de douze. `null` = le panneau a été ouvert par « + Ajouter une étape », et le type est libre.
   */
  const [typePose, setTypePose] = useState<TypeEtape | null>(null);
  const [occupe, setOccupe] = useState(false);

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
   * ⚠️ UN SEUL GESTE À LA FOIS (`occupe`) : la frise se relit après chaque geste, et deux gestes qui se croisent
   * feraient atterrir la réponse du premier sur l'état du second.
   */
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

  if (vue.v === 'charge') {
    return <p className="gst-info" role="status">Lecture de la frise…</p>;
  }
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
  /**
   * 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 06/10/2026, trois références reliées à l'événement 1 : la frise affichait
   * **trois « Ouverture »** identiques, sans dire laquelle appartenait à quelle intervention. L'événement avait
   * l'air de s'ouvrir trois fois.
   *
   * Quand l'événement porte plusieurs interventions Monga, chaque case en nomme donc la sienne. Quand il n'y en
   * a qu'une — le cas ordinaire — l'écrire partout serait du bruit : elle est déjà en tête de la carte.
   */
  const plusieursRefs = referencesDeLaFrise(etapes).length > 1;

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

      {/* ══ LA FRISE ELLE-MÊME ════════════════════════════════════════════════════════════════════════════
          🔴 UNE LISTE ORDONNÉE, et non une rangée de `div` : une frise EST une séquence, et c'est ce qu'un
          lecteur d'écran doit entendre. Le trait qui la relie est décoratif, posé en CSS. */}
      <ol className="frs-liste">
        {majeures.map((c) => (
          <CaseEtape
            key={c.cle} c={c} avecReference={plusieursRefs} occupe={occupe}
            ouverte={ouvert === c.cle}
            onBasculer={() => setOuvert((o) => (o === c.cle ? null : c.cle))}
            onOuvrirFil={onOuvrirFil}
            onConfirmer={(id, g) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: g })}
            onMontant={(id, cents) => void agir(`/api/admin/gestion/etapes/${id}`, 'PATCH', { geste: 'montant', montantCents: cents })}
            onRetirer={(id) => void agir(`/api/admin/gestion/etapes/${id}`, 'DELETE')}
            onPoser={(type) => { setAjout(true); setTypePose(type); }}
          />
        ))}
      </ol>

      {/* ══ LES REPÈRES — « simples petits repères discrets […] dont le contenu s'affiche au survol » (Arno) ══
          ⚠️ ILS NE SONT PAS SUR LA LIGNE DES ÉTAPES, et c'est la phrase d'Arno : « Ce ne sont pas des étapes ».
             Les mêler à la frise majeure aurait noyé huit étapes sous cinquante-trois commentaires. */}
      {reperes.length > 0 && (
        <div className="frs-reperes">
          <span className="frs-reperes-mot">{motNbReperes(reperes.length)}</span>
          <ul className="frs-reperes-liste">
            {reperes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`frs-repere frs-repere--${r.type}`}
                  aria-expanded={ouvert === `r${r.id}`}
                  onClick={() => setOuvert((o) => (o === `r${r.id}` ? null : `r${r.id}`))}
                  title={`${motEtape(r.type)} — ${motDateEtape(r)}`}
                >
                  <span className="frs-sr">{motEtape(r.type)} du {motDateEtape(r)}</span>
                </button>
                {ouvert === `r${r.id}` && (
                  <div className="frs-bulle" role="status">
                    <p className="frs-bulle-tete">
                      {motEtape(r.type)} · {motDateEtape(r)}
                      {r.auteur !== null && <> · {r.auteur}</>}
                    </p>
                    {r.texte !== null && <p className="frs-bulle-texte">{r.texte}</p>}
                    {r.numero !== null && <p className="frs-bulle-texte">N° {r.numero}</p>}
                    {etapeOuvrable(r) && onOuvrirFil !== undefined && (
                      <button type="button" className="frs-lien" onClick={() => onOuvrirFil(r.filId as number)}>
                        Voir le mail d’origine
                      </button>
                    )}
                    {/* ⚠️ LA PHRASE VIENT DU MODULE PUR, ICI AUSSI. Je l'avais recopiée en dur à cet endroit —
                        une épreuve l'a attrapée. Deux exemplaires d'une même phrase finissent par diverger, et
                        celle-ci est précisément celle qui explique à quoi sert tout le point 2. */}
                    {r.source === 'monga' && r.filId === null && (
                      <p className="frs-perdu">{motMailDOrigine(r)}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ══ « + AJOUTER UNE ÉTAPE » (Arno) — dans la MÊME chronologie et indépendamment de Monga ═══════════
          🔴 TOUJOURS OFFERT, MÊME SANS MONGA : « Fonctionne aussi pour un événement SANS Monga (frise
             entièrement manuelle) ». C'est ce bouton qui rend la frise utilisable sur un événement nu. */}
      {!ajout && (
        <p className="frs-ajouter">
          <button type="button" className="frs-btn" onClick={() => { setTypePose(null); setAjout(true); }}>
            + Ajouter une étape
          </button>
        </p>
      )}

      <AjouterEtape
        evenementId={evenementId} ouvert={ajout} typeImpose={typePose}
        onFermer={() => { setAjout(false); setTypePose(null); }}
        onFait={(m) => { onGeste?.(m); setAjout(false); setTypePose(null); void charger(); }}
      />

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

/** Le mot du compteur de repères. Écrit une fois : « 1 repère », « 12 repères ». */
export function motNbReperes(n: number): string {
  return n <= 1 ? `${n} repère` : `${n} repères`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   UNE CASE DE LA FRISE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function CaseEtape({
  c, avecReference, occupe, ouverte, onBasculer, onOuvrirFil, onConfirmer, onMontant, onRetirer, onPoser,
}: {
  c: CaseFrise; avecReference: boolean; occupe: boolean; ouverte: boolean;
  onBasculer: () => void;
  onOuvrirFil?: (filId: number) => void;
  onConfirmer: (id: number, geste: 'confirmer' | 'ecarter') => void;
  onMontant: (id: number, cents: number | null) => void;
  onRetirer: (id: number) => void;
  onPoser: (type: TypeEtape) => void;
}) {
  const e = c.etape;

  /* ── ① L'ÉTAPE ATTENDUE, EN POINTILLÉ (Arno) ─────────────────────────────────────────────────────────────── */
  if (e === null) {
    return (
      <li className="frs-case frs-case--attendue">
        <span className="frs-pastille frs-pastille--attendue" aria-hidden="true" />
        <div className="frs-corps">
          <p className="frs-mot">{c.mot}</p>
          <p className="frs-sous">attendue</p>
          {/**
           * 🔴 « Acceptation du devis » VALIDABLE EN UN CLIC (décision d'Arno du 06/10). C'est la seule étape
           * attendue qui porte un bouton : les autres arrivent par mail, celle-là n'arrive jamais (0 cas mesuré).
           */}
          {c.type === 'devis_accepte' && (
            <button type="button" className="frs-poser" disabled={occupe} onClick={() => onPoser(c.type)}>
              Le devis est accepté
            </button>
          )}
        </div>
      </li>
    );
  }

  const aConfirmer = e.certitude === 'a_confirmer';
  const montant = motMontant(e.montantCents);
  const perdu = e.source === 'monga' && e.filId === null;

  return (
    <li className={`frs-case${aConfirmer ? ' frs-case--doute' : ''}`}>
      <span className={`frs-pastille frs-pastille--${e.source}`} aria-hidden="true" />
      <div className="frs-corps">
        <p className="frs-mot">
          {c.mot}
          {/* ⚠️ LE PICTOGRAMME NE PORTE PAS L'INFORMATION SEUL : le mot de la source est lu juste en dessous. */}
          {e.source === 'monga' && <span className="frs-picto" title="Étape venue de Monga" aria-hidden="true"> ◆</span>}
          {montant !== null && <span className="frs-montant"> · {montant}</span>}
        </p>
        <p className="frs-sous">
          {motDateEtape(e)} · {motSource(e)}
          {e.numero !== null && <> · N° {e.numero}</>}
          {/* 🔴 QUELLE INTERVENTION — seulement quand l'événement en porte plusieurs. Voir `plusieursRefs`. */}
          {avecReference && e.reference !== null && <> · <span className="frs-ref">{e.reference}</span></>}
        </p>

        {aConfirmer && (
          <p className="frs-doute">
            <span className="frs-doute-mot">à confirmer</span>
            <button type="button" className="frs-btn" disabled={occupe}
              onClick={() => onConfirmer(e.id, 'confirmer')}>Confirmer</button>
            <button type="button" className="frs-btn" disabled={occupe}
              onClick={() => onConfirmer(e.id, 'ecarter')}>Écarter</button>
          </p>
        )}

        <p className="frs-gestes">
          <button type="button" className="frs-lien" aria-expanded={ouverte} onClick={onBasculer}>
            {ouverte ? 'Replier' : 'Détail'}
          </button>
          {etapeOuvrable(e) && onOuvrirFil !== undefined && (
            <button type="button" className="frs-lien" onClick={() => onOuvrirFil(e.filId as number)}>
              {motMailDOrigine(e)}
            </button>
          )}
          {/* 🔴 LA PHRASE QUI JUSTIFIE TOUT LE POINT 2 : sans la table des étapes, il n'y aurait rien à conserver. */}
          {perdu && <span className="frs-perdu">{motMailDOrigine(e)}</span>}
          {e.source === 'manuelle' && (
            <button type="button" className="frs-lien" disabled={occupe} onClick={() => onRetirer(e.id)}>
              Retirer
            </button>
          )}
        </p>

        {ouverte && (
          <div className="frs-detail">
            {e.texte !== null && <p className="frs-bulle-texte">{e.texte}</p>}
            {/**
             * 🔴 LE MONTANT SE COMPLÈTE À LA MAIN, Y COMPRIS SUR UNE ÉTAPE MONGA (décision d'Arno). C'est la
             * seule chose qu'une main pose sur une étape venue de Monga — tout le reste y est en lecture seule.
             */}
            {e.type === 'devis_recu' && (
              <ChampMontant cents={e.montantCents} occupe={occupe} onPoser={(v) => onMontant(e.id, v)} />
            )}
          </div>
        )}
      </div>
    </li>
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
   « + AJOUTER UNE ÉTAPE » (Arno)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function AjouterEtape({
  evenementId, ouvert, typeImpose, onFermer, onFait,
}: {
  evenementId: number; ouvert: boolean; typeImpose: TypeEtape | null;
  onFermer: () => void; onFait: (message: string) => void;
}) {
  const [type, setType] = useState<TypeEtape>('autre');
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState('');
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => { if (typeImpose !== null) setType(typeImpose); }, [typeImpose]);

  if (!ouvert) return null;

  const envoyer = async (): Promise<void> => {
    if (occupe || jour === '') return;
    setOccupe(true);
    try {
      const res = await fetch(`/api/admin/gestion/evenements/${evenementId}/frise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          survenuLe: heure === '' ? jour : `${jour}T${heure}`,
          heureConnue: heure !== '',
          texte: texte.trim() === '' ? null : texte.trim(),
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string; erreur?: string };
      onFait(d.etat === 'ok' ? (d.message ?? 'Étape ajoutée.') : (d.erreur ?? 'Ajout impossible.'));
    } catch {
      onFait('Ajout impossible : le serveur n’a pas répondu.');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="frs-ajout">
      <p className="frs-ajout-titre">Ajouter une étape</p>
      <div className="frs-ajout-ligne">
        <label className="frs-label" htmlFor="frs-type">Type</label>
        <select id="frs-type" className="frs-champ" value={type}
          onChange={(e) => setType(e.target.value as TypeEtape)}>
          {TYPES_AJOUTABLES.map((t) => <option key={t} value={t}>{motEtape(t)}</option>)}
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
      <div className="frs-ajout-ligne">
        <button type="button" className="frs-btn frs-btn--fort" disabled={occupe || jour === ''}
          onClick={() => void envoyer()}>Ajouter</button>
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
.frs-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0}

/* Une case : la pastille a gauche, le texte a droite, et le trait qui relie les pastilles entre elles. */
.frs-case{position:relative;display:flex;gap:10px;padding:8px 0 8px 2px;min-height:44px}
.frs-case::before{content:'';position:absolute;left:7px;top:0;bottom:0;width:2px;
  background:var(--color-svv-line)}
.frs-case:first-child::before{top:18px}
.frs-case:last-child::before{bottom:calc(100% - 18px)}
.frs-pastille{position:relative;z-index:1;flex:0 0 auto;width:16px;height:16px;margin-top:2px;
  border-radius:50%;background:var(--color-svv-red);border:2px solid var(--color-svv-bg)}
.frs-pastille--manuelle{background:var(--color-svv-ink)}
/* L'etape attendue : un cercle vide, en pointille. C'est la demande d'Arno, et elle se lit sans couleur. */
.frs-pastille--attendue{background:transparent;border:2px dashed var(--color-svv-muted)}
.frs-case--attendue .frs-mot{color:var(--color-svv-muted)}
.frs-case--attendue{opacity:.85}
.frs-case--doute .frs-pastille{background:var(--color-svv-bg);border:2px solid var(--color-svv-red)}

.frs-corps{flex:1 1 auto;min-width:0}
.frs-mot{margin:0;font-size:.88rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.frs-picto{color:var(--color-svv-red)}
.frs-montant{font-weight:700;color:var(--color-svv-ink)}
.frs-ref{font-weight:700;color:var(--color-svv-ink)}
.frs-sous{margin:1px 0 0;font-size:.78rem;color:var(--color-svv-muted);overflow-wrap:anywhere}

.frs-doute{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0 0}
.frs-doute-mot{font-size:.74rem;font-weight:700;color:var(--color-svv-red);
  border:1px dashed var(--color-svv-red);border-radius:999px;padding:1px 7px}

.frs-gestes{display:flex;flex-wrap:wrap;gap:10px;margin:4px 0 0;align-items:center}
.frs-lien{font:inherit;font-size:.78rem;color:var(--color-svv-red);background:none;border:0;padding:0;
  text-decoration:underline;cursor:pointer;min-height:24px}
.frs-lien:disabled{color:var(--color-svv-muted);cursor:default}
.frs-perdu{font-size:.78rem;font-style:italic;color:var(--color-svv-muted);margin:0}

.frs-btn{font:inherit;font-size:.78rem;min-height:32px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-ink);background:var(--color-svv-bg);border:1px solid var(--color-svv-line);
  border-radius:6px}
.frs-btn:hover{background:var(--color-svv-field)}
.frs-btn:disabled{color:var(--color-svv-muted);cursor:default}
.frs-btn--fort{color:var(--color-svv-bg);background:var(--color-svv-red);border-color:var(--color-svv-red)}
.frs-poser{font:inherit;font-size:.78rem;min-height:32px;margin-top:4px;padding:3px 10px;cursor:pointer;
  color:var(--color-svv-red);background:transparent;border:1px dashed var(--color-svv-red);border-radius:6px}

.frs-detail{margin:6px 0 0;padding:6px 8px;background:var(--color-svv-field);border-radius:6px}
.frs-bulle-texte{margin:0;font-size:.8rem;color:var(--color-svv-ink);overflow-wrap:anywhere;white-space:pre-wrap}

/* Les reperes : de petits points sous la frise, et une bulle au clic comme au survol. */
.frs-reperes{margin:8px 0 0;padding-top:8px;border-top:1px solid var(--color-svv-line)}
.frs-reperes-mot{font-size:.76rem;color:var(--color-svv-muted)}
.frs-reperes-liste{list-style:none;display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 0;padding:0}
.frs-repere{width:12px;height:12px;min-width:12px;min-height:12px;padding:0;cursor:pointer;
  border-radius:50%;border:1px solid var(--color-svv-muted);background:var(--color-svv-field)}
.frs-repere:hover,.frs-repere:focus-visible{background:var(--color-svv-red);border-color:var(--color-svv-red)}
.frs-repere--rappel_devis{border-style:dashed}
.frs-repere--facture{border-width:2px}
.frs-bulle{margin:6px 0 0;padding:6px 8px;background:var(--color-svv-field);
  border-left:3px solid var(--color-svv-red);border-radius:6px;max-width:42rem}
.frs-bulle-tete{margin:0 0 2px;font-size:.76rem;font-weight:700;color:var(--color-svv-ink)}

.frs-proposition{margin:0 0 8px;padding:6px 8px;font-size:.8rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:6px}
.frs-fiable{margin:8px 0 0;padding:6px 8px;font-size:.78rem;color:var(--color-svv-muted);
  background:var(--color-svv-field);border-radius:6px}

.frs-ajouter{margin:8px 0 0}
.frs-ajout{margin:8px 0 0;padding:8px;background:var(--color-svv-field);border-radius:6px}
.frs-ajout-titre{margin:0 0 6px;font-size:.82rem;font-weight:700;color:var(--color-svv-ink)}
.frs-ajout-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 6px}
.frs-label{font-size:.76rem;color:var(--color-svv-muted);min-width:4.5rem}
.frs-champ{font:inherit;font-size:.82rem;min-height:36px;padding:4px 8px;color:var(--color-svv-ink);
  background:var(--color-svv-bg);border:1px solid var(--color-svv-line);border-radius:6px}
.frs-champ--texte{flex:1 1 14rem;min-height:48px}
.frs-montant-champ{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 0}
.frs-unite{font-size:.82rem;color:var(--color-svv-muted)}

.frs-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip-path:inset(50%);white-space:nowrap;border:0}

/* Ecran etroit : rien ne se replie, tout se tasse. Les cibles gardent leurs 44 px (exigence du depot). */
@media (max-width:600px){
  .frs-ajout-ligne{flex-direction:column;align-items:stretch}
  .frs-label{min-width:0}
  .frs-champ{width:100%}
}
`;
