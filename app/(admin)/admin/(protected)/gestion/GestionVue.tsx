'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CarteEvenement, EtatEcran, LigneFile } from '../../../../lib/gestion/fileRepo';
import {
  depuis, formaterDateFr, libelleEtat, mentionTroncature, messageErreurHttp, messageEvenementsVide, messageFileVide,
  messageReleve,
} from '../../../../lib/gestion/ecran';
import { useReleveGestion } from './useReleveGestion';
import { PanneauAffecter } from './PanneauAffecter';
import { CarteVive } from './CarteVive';

/**
 * LOT 2/3/4b — l'écran à deux côtés, et les DEUX GESTES.
 *
 * Chaque geste est RÉVERSIBLE DEPUIS CET ÉCRAN, et c'est une exigence, pas un confort : ce qui se fait d'un clic doit se
 * défaire d'un clic. « Classer sans suite » a son pendant « Rouvrir », dans une section qui reste visible — sans quoi
 * écarter un échange serait une suppression déguisée.
 *
 * La FILE ne montre que ce qui a bougé récemment (fenêtre réglée en base, 30 jours par défaut). Les échanges plus
 * anciens ne sont NI supprimés NI masqués en silence : leur nombre est annoncé en toutes lettres.
 *
 * MOBILE D'ABORD (exigence transverse §15) : une seule colonne sous 900 px, LA FILE D'ABORD — et c'est l'ordre du DOM
 * qui le garantit, jamais un `order` CSS qui mentirait au clavier et aux lecteurs d'écran. Aucun débordement horizontal
 * (les objets et adresses cassent en fin de ligne), aucune interaction au survol seul, cibles tactiles ≥ 44 px.
 *
 * COULEURS : uniquement des jetons `--color-svv-*`. L'attente d'une réponse est signalée par un MOT (« attend une
 * réponse »), pas par une couleur seule — elle reste lisible en niveaux de gris comme aux daltoniens.
 */

type Chargement = { etat: 'charge' } | { etat: 'ok'; data: EtatEcran } | { etat: 'erreur'; message: string };

export function GestionVue() {
  const [vue, setVue] = useState<Chargement>({ etat: 'charge' });
  // Instant de référence des « il y a … », figé au rendu et rafraîchi avec les données. JAMAIS calculé pendant le rendu
  //   d'une ligne : deux lignes d'une même page doivent parler du même « maintenant ».
  const [maintenant, setMaintenant] = useState<Date | null>(null);

  /**
   * LOT 4b/4c — état des GESTES. `panneau` retient l'IDENTIFIANT DE L'ÉCHANGE dont le panneau est ouvert, jamais son
   * rang dans la liste : la file change sous l'écran (relève, rattachement, classement) et un rang ne désigne alors
   * plus le même échange. Déclaré AVANT `charger`, qui le remet à zéro à chaque relecture.
   */
  const [panneau, setPanneau] = useState<number | null>(null);
  const [geste, setGeste] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [gesteEnCours, setGesteEnCours] = useState(false);

  /**
   * Lit l'écran et RENVOIE le résultat sans toucher à aucun état : c'est l'appelant qui décide quoi en faire. Un refus
   * (403/401) n'est pas une panne, et il est dit pour ce qu'il est — envoyer chercher un bug là où le motif est « pas
   * le droit » fait perdre une demi-journée.
   */
  const lire = useCallback(async (): Promise<Chargement> => {
    try {
      const res = await fetch('/api/admin/gestion', { cache: 'no-store' });
      if (!res.ok) return { etat: 'erreur', message: messageErreurHttp(res.status) };
      return { etat: 'ok', data: (await res.json()) as EtatEcran };
    } catch {
      return { etat: 'erreur', message: messageErreurHttp(0) };
    }
  }, []);

  // Chargement au montage. Le premier acte de l'effet est un `await` → aucun `setState` synchrone dans le corps de
  //   l'effet (cascade de rendus), et `annule` empêche d'écrire dans un composant démonté. Même patron que les autres
  //   écrans de l'admin.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const r = await lire();
      if (annule) return;
      setMaintenant(new Date());
      setVue(r);
    })();
    return () => { annule = true; };
  }, [lire]);

  /**
   * Relecture DEMANDÉE (clic) : ici l'indicateur d'attente est attendu par celui qui vient de cliquer.
   *
   * LOT 4c — elle REFERME tout panneau ouvert, et c'est structurel, pas cosmétique : la liste qu'on vient de relire
   * n'est plus celle sur laquelle l'utilisateur avait cliqué (un échange rattaché en sort, les suivants remontent).
   * Le faire ICI plutôt qu'à chaque appelant est le seul moyen qu'aucun chemin ne l'oublie — relève automatique et
   * bouton « Rafraîchir » compris.
   */
  const charger = useCallback(async () => {
    setPanneau(null);
    setVue({ etat: 'charge' });
    const r = await lire();
    setMaintenant(new Date());
    setVue(r);
  }, [lire]);

  // LOT 3 — une passe réussie change ce qui est à l'écran : on recharge, sans recharger la page.
  const { enCours: releveEnCours, message: releveMsg, releverMaintenant } = useReleveGestion(() => { void charger(); });

  /** Un geste = un appel, un compte rendu, un rechargement. Jamais un silence, succès comme échec. */
  const agir = useCallback(async (url: string, methode: 'POST' | 'DELETE', succes: string, corps?: unknown) => {
    if (gesteEnCours) return;
    setGesteEnCours(true);
    setGeste(null);
    try {
      const res = await fetch(url, {
        method: methode,
        ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !data.ok) {
        setGeste({ ton: 'erreur', texte: data.erreur ?? (res.status === 403 ? 'Droit retiré : reconnectez-vous.' : 'Geste impossible.') });
        return;
      }
      setGeste({ ton: 'ok', texte: succes });
      setPanneau(null);
      await charger();
    } catch {
      setGeste({ ton: 'erreur', texte: 'Geste impossible : le serveur n’a pas répondu.' });
    } finally {
      setGesteEnCours(false);
    }
  }, [gesteEnCours, charger]);

  if (vue.etat === 'charge') return <><style>{CSS_GESTION}</style><p className="gst-info" role="status">Chargement…</p></>;
  if (vue.etat === 'erreur') {
    return (
      <>
        <style>{CSS_GESTION}</style>
        <p className="gst-erreur" role="status">{vue.message}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void charger()}>Réessayer</button>
      </>
    );
  }

  const d = vue.data;
  const ref = maintenant ?? new Date();
  const troncFile = mentionTroncature(d.file.length, d.filsTotal);
  const troncEv = mentionTroncature(d.evenements.length, d.evenementsTotal);

  return (
    <>
      <style>{CSS_GESTION}</style>

      {/* BANDEAU D'ÉTAT — toujours présent : un outil qui dit depuis quand il n'a pas regardé reste honnête. */}
      <div className="gst-bandeau" role="status">
        <span>{messageReleve(d, ref)}</span>
        <span className="gst-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={releveEnCours}
            onClick={() => void releverMaintenant()}>
            {releveEnCours ? 'Relève en cours…' : 'Relever maintenant'}
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={releveEnCours}
            onClick={() => void charger()}>Rafraîchir</button>
        </span>
      </div>
      {/* COMPTE RENDU de la dernière passe — succès comme échec, jamais un silence. */}
      {releveMsg && <p className={`gst-compte-rendu gst-ton-${releveMsg.ton}`} role="status">{releveMsg.texte}</p>}
      {geste && <p className={`gst-compte-rendu gst-ton-${geste.ton}`} role="status">{geste.texte}</p>}

      {/* ORDRE DU DOM = ordre mobile : la file d'abord, les événements ensuite. */}
      <div className="gst-deux">
        <section className="gst-col" aria-labelledby="gst-titre-file">
          <h2 className="gst-titre" id="gst-titre-file">
            À classer <span className="gst-compte">{d.filsTotal}</span>
          </h2>
          {troncFile && <p className="gst-tronc">{troncFile}</p>}
          {/* FENÊTRE D'ACTIVITÉ — dite en toutes lettres. Un outil qui cache sans le dire ment. */}
          {d.filsTropAnciens > 0 && (
            <p className="gst-tronc">
              {d.filsTropAnciens} échange{d.filsTropAnciens > 1 ? 's' : ''} plus ancien{d.filsTropAnciens > 1 ? 's' : ''} que {d.fenetreJours} jours
              {' '}ne {d.filsTropAnciens > 1 ? 'sont' : 'est'} pas affiché{d.filsTropAnciens > 1 ? 's' : ''} dans la file.
              {' '}Rien n’est supprimé : {d.filsTropAnciens > 1 ? 'ils restent' : 'il reste'} en base.
            </p>
          )}
          {d.file.length === 0
            ? <p className="gst-vide">{messageFileVide(d)}</p>
            : (
              <ul className="gst-liste">
                {d.file.map((f) => (
                  <LigneFil key={f.filId} fil={f} maintenant={ref}
                    ouvert={panneau === f.filId}
                    occupe={gesteEnCours}
                    onAffecter={() => setPanneau(panneau === f.filId ? null : f.filId)}
                    onSansSuite={() => void agir(`/api/admin/gestion/fils/${f.filId}/sans-suite`, 'POST', 'Échange classé sans suite. Il reviendra dans la file si un nouveau message y arrive.', {})}
                    onFait={(m) => { setGeste({ ton: 'ok', texte: m }); setPanneau(null); void charger(); }}
                    onAnnuler={() => setPanneau(null)} />
                ))}
              </ul>
            )}

          {/* CLASSÉS SANS SUITE — la contrepartie du geste : visible, et réversible d'un clic. */}
          {d.sansSuiteTotal > 0 && (
            <details className="gst-sans-suite">
              <summary className="gst-sans-suite-titre">Classés sans suite <span className="gst-compte">{d.sansSuiteTotal}</span></summary>
              <ul className="gst-liste">
                {d.sansSuite.map((f) => (
                  <li key={f.filId} className="gst-item">
                    <div className="gst-item-haut"><span className="gst-objet">{f.objet?.trim() || '(sans objet)'}</span></div>
                    <div className="gst-item-bas">
                      <span title={formaterDateFr(f.classeLe)}>classé {depuis(f.classeLe, ref)}</span>
                      {f.classePar && <><span className="gst-sep" aria-hidden="true">·</span><span>par {f.classePar}</span></>}
                      {f.motif && <><span className="gst-sep" aria-hidden="true">·</span><span>{f.motif}</span></>}
                    </div>
                    <div className="gst-actions">
                      <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={gesteEnCours}
                        onClick={() => void agir(`/api/admin/gestion/fils/${f.filId}/sans-suite`, 'DELETE', 'Échange rouvert : il est revenu dans la file.')}>
                        Rouvrir
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="gst-col" aria-labelledby="gst-titre-ev">
          <h2 className="gst-titre" id="gst-titre-ev">
            Événements <span className="gst-compte">{d.evenementsTotal}</span>
          </h2>
          {troncEv && <p className="gst-tronc">{troncEv}</p>}
          {d.evenements.length === 0
            ? <p className="gst-vide">{messageEvenementsVide()}</p>
            : (
              <ul className="gst-liste">
                {d.evenements.map((e) => (
                  <CarteVive key={e.evenementId} carte={e} maintenant={ref}
                    onGeste={(message, options) => {
                      setGeste({ ton: 'ok', texte: message });
                      // Un détachement change AUSSI la file (l'échange y revient) : là, tout l'écran est relu. Une
                      //   correction ou un changement d'état ne concernent que la carte — la relire elle seule évite
                      //   de replier le dossier qu'on est en train de lire.
                      if (options?.rechargerTout) void charger();
                    }} />
                ))}
              </ul>
            )}
        </section>
      </div>
    </>
  );
}

/** Une ligne de la file = UN ÉCHANGE (pas un message) : à ce volume, six mails ne doivent pas prendre six lignes.
 *  EXPORTÉ pour être rendu en test (contrat visible : mot « attend une réponse », pluriels, jamais de couleur seule). */
export function LigneFil({ fil, maintenant, ouvert = false, occupe = false, onAffecter, onSansSuite, onFait, onAnnuler }: {
  fil: LigneFile; maintenant: Date;
  ouvert?: boolean; occupe?: boolean;
  onAffecter?: () => void; onSansSuite?: () => void;
  onFait?: (message: string) => void; onAnnuler?: () => void;
}) {
  return (
    <li className="gst-item">
      <div className="gst-item-haut">
        <span className="gst-objet">{fil.objet?.trim() || '(sans objet)'}</span>
        {fil.attend && <span className="gst-attend">attend une réponse</span>}
      </div>
      <div className="gst-item-bas">
        <span className="gst-qui">{fil.interlocuteur ?? '(expéditeur inconnu)'}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(fil.dernierLe)}>{depuis(fil.dernierLe, maintenant)}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span>{fil.nbMessages} message{fil.nbMessages > 1 ? 's' : ''}</span>
        {fil.nbPieces > 0 && <><span className="gst-sep" aria-hidden="true">·</span><span>{fil.nbPieces} pièce{fil.nbPieces > 1 ? 's' : ''} jointe{fil.nbPieces > 1 ? 's' : ''}</span></>}
      </div>
      {/* LES DEUX GESTES. Rendus seulement si l'appelant les fournit → la ligne reste rendable en lecture seule. */}
      {(onAffecter || onSansSuite) && (
        <div className="gst-actions">
          {onAffecter && (
            // LOT 4c — « Replier », et non « Fermer » : dans un outil de gestion locative, « fermer » se comprend
            //   comme « clore le dossier ». Le bouton ne fait que replier le panneau ; il le dit maintenant.
            <button type="button" className={`svv-btn ${ouvert ? 'svv-btn-outline' : 'svv-btn-primary'} gst-btn`}
              aria-expanded={ouvert} disabled={occupe} onClick={onAffecter}>
              {ouvert ? 'Replier' : 'Affecter à un événement'}
            </button>
          )}
          {onSansSuite && (
            <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={occupe} onClick={onSansSuite}>
              Classer sans suite
            </button>
          )}
        </div>
      )}
      {/* Le panneau porte le NOM de l'échange sur lequel il agit : après un geste la liste remonte d'un cran, et un
          panneau anonyme ouvert à la même place que le précédent ferait rattacher le mauvais échange sans rien dire. */}
      {ouvert && onFait && onAnnuler && (
        <PanneauAffecter filId={fil.filId} objet={fil.objet?.trim() || '(sans objet)'} onFait={onFait} onAnnuler={onAnnuler} />
      )}
    </li>
  );
}

/** Une carte d'événement : qui demande, quoi, depuis quand, dernier échange, état. EXPORTÉE pour être rendue en test. */
export function CarteEv({ carte, maintenant }: { carte: CarteEvenement; maintenant: Date }) {
  return (
    <li className="gst-item">
      <div className="gst-item-haut">
        <span className="gst-objet">{carte.objet}</span>
        {carte.attend && <span className="gst-attend">attend une réponse</span>}
      </div>
      <div className="gst-item-bas">
        <span className="gst-ref">{carte.reference}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span>{libelleEtat(carte.etat)}</span>
        <span className="gst-sep" aria-hidden="true">·</span>
        <span title={formaterDateFr(carte.ouvertLe)}>ouvert {depuis(carte.ouvertLe, maintenant)}</span>
      </div>
      <div className="gst-item-bas">
        {carte.demandeur && <><span className="gst-qui">{carte.demandeur}</span><span className="gst-sep" aria-hidden="true">·</span></>}
        {carte.adresseLibre && <><span>{carte.adresseLibre}</span><span className="gst-sep" aria-hidden="true">·</span></>}
        <span>{carte.nbFils} échange{carte.nbFils > 1 ? 's' : ''}</span>
        {carte.dernierEchangeLe && <>
          <span className="gst-sep" aria-hidden="true">·</span>
          <span title={formaterDateFr(carte.dernierEchangeLe)}>dernier échange {depuis(carte.dernierEchangeLe, maintenant)}</span>
        </>}
      </div>
    </li>
  );
}

const CSS_GESTION = `
/* DEUX CÔTÉS au-dessus de 900 px ; UNE colonne en dessous, la file d'abord — par l'ordre du DOM, jamais par un order CSS. */
.gst-deux{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
@media (max-width:900px){.gst-deux{grid-template-columns:1fr}}
.gst-col{min-width:0}  /* sans ça, une grille laisse un enfant déborder de sa colonne */
.gst-titre{display:flex;align-items:center;gap:.5rem;font-size:15px;font-weight:700;color:var(--color-svv-ink);margin:0 0 .5rem}
.gst-compte{display:inline-block;background:var(--color-svv-field);color:var(--color-svv-muted);font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px}
.gst-bandeau{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;margin:0 0 1rem;font-size:.85rem;color:var(--color-svv-ink);line-height:1.45}
.gst-btn{width:auto;flex-shrink:0;min-height:44px;padding:.55rem 1rem;font-size:.85rem;border-radius:.6rem}
.gst-actions{display:flex;flex-wrap:wrap;gap:.5rem;flex-shrink:0}
/* Compte rendu de passe : le TON est porté par un mot dans le texte autant que par la couleur (jamais la couleur seule). */
.gst-compte-rendu{font-size:.85rem;line-height:1.5;margin:0 0 1rem;padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink)}
.gst-ton-erreur{border-color:var(--color-svv-red);color:var(--color-svv-red);font-weight:600}
.gst-ton-info{color:var(--color-svv-muted)}
.gst-info,.gst-vide,.gst-tronc{font-size:.85rem;color:var(--color-svv-muted);line-height:1.5;margin:0 0 .5rem}
.gst-vide{background:var(--color-svv-surface);border:1px dashed var(--color-svv-line-strong);border-radius:10px;padding:14px 16px}
.gst-erreur{font-size:.9rem;font-weight:600;color:var(--color-svv-red);margin:0 0 .6rem}
.gst-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* Cible tactile confortable ; tout casse en fin de ligne → jamais de débordement horizontal, même sur un objet sans espace. */
.gst-item{min-height:44px;background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px;overflow-wrap:anywhere}
.gst-item-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem}
.gst-item-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.8rem;color:var(--color-svv-muted);margin-top:4px}
.gst-objet{font-weight:700;font-size:.92rem;color:var(--color-svv-ink);line-height:1.35}
.gst-qui{font-weight:600;color:var(--color-svv-ink)}
.gst-ref{font-variant-numeric:tabular-nums;font-weight:600;color:var(--color-svv-ink)}
.gst-sep{color:var(--color-svv-line-strong)}
/* L'attente est dite par un MOT, jamais par la seule couleur (lisible en niveaux de gris et aux daltoniens). */
.gst-attend{flex-shrink:0;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--color-svv-red);border:1px solid var(--color-svv-red);border-radius:999px;padding:2px 8px}
/* PANNEAU d'affectation, ouvert sous la ligne. */
.gst-panneau{margin-top:10px;padding:12px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;display:flex;flex-direction:column;gap:10px}
/* Sur QUOI on agit, rappelé dans le panneau : la liste bouge sous l'écran, pas la mémoire de celui qui clique. */
.gst-panneau-titre{margin:0;font-size:.8rem;color:var(--color-svv-muted);line-height:1.4}
.gst-voies{display:flex;flex-wrap:wrap;gap:.5rem}
.gst-voie{min-height:44px;padding:.5rem .9rem;font-size:.85rem;font-weight:600;border-radius:.6rem;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.gst-voie--active{border-color:var(--color-svv-red);color:var(--color-svv-red)}
.gst-voie:disabled{opacity:.5;cursor:not-allowed}
.gst-champs{display:flex;flex-direction:column;gap:10px}
.gst-champ{display:flex;flex-direction:column;gap:4px}
/* 16px minimum : en dessous, les navigateurs mobiles zooment à la mise au point du champ. */
.gst-saisie{min-height:44px;width:100%;box-sizing:border-box;padding:.5rem .7rem;font-size:16px;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface);color:var(--color-svv-ink)}
.gst-note{margin:0;font-size:.78rem;line-height:1.4;color:var(--color-svv-muted)}
/* ── LOT 4c : LA CARTE VIVANTE ─────────────────────────────────────────────────────────────────────────────────── */
/* La ligne de titre d'un bloc repliable est un vrai bouton : on la laisse occuper toute la largeur et respirer. */
.gst-repli{align-items:flex-start;padding:.6rem .7rem}
.gst-carte-titre{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;min-width:0}
.gst-carte-bas{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;flex-basis:100%;font-size:.8rem;font-weight:400;color:var(--color-svv-muted)}
.gst-corps{display:flex;flex-direction:column;gap:12px;padding:12px 2px 2px}
.gst-bloc{display:flex;flex-direction:column;gap:8px;background:var(--color-svv-field);border:1px solid var(--color-svv-line);border-radius:10px;padding:10px 12px}
.gst-sous-titre{margin:.25rem 0 0;font-size:13px;font-weight:700;color:var(--color-svv-ink);display:flex;align-items:center;gap:.5rem}
/* Fiche d'une carte : deux colonnes au large, une seule sur mobile — jamais un tableau qui déborde. */
.gst-fiche{display:grid;grid-template-columns:auto 1fr;gap:.35rem .75rem;margin:0;font-size:.85rem}
.gst-fiche dt{font-weight:700;color:var(--color-svv-muted)}
.gst-fiche dd{margin:0;color:var(--color-svv-ink);overflow-wrap:anywhere}
@media (max-width:520px){.gst-fiche{grid-template-columns:1fr;gap:.1rem}.gst-fiche dd{margin-bottom:.4rem}}
/* Une donnée absente est DITE absente — un blanc laisserait croire à un oubli d'affichage. */
.gst-absent{color:var(--color-svv-muted);font-style:italic}
.gst-item--fil{background:var(--color-svv-field)}
.gst-fil{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
/* Un message : le sens est porté par un MOT (« reçu de » / « nous avons écrit »), la bordure ne fait que l'appuyer. */
.gst-msg{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-left:3px solid var(--color-svv-line-strong);border-radius:8px;padding:8px 10px}
.gst-msg--envoye{border-left-color:var(--color-svv-green)}
.gst-msg-haut{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.78rem;color:var(--color-svv-muted)}
/* pre-wrap : le texte du mail garde ses paragraphes ; anywhere : une URL à rallonge ne fait pas déborder l'écran. */
.gst-msg-corps{margin:.4rem 0 0;font-size:.85rem;line-height:1.5;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.gst-etiquette{font-size:11px;font-weight:700;color:var(--color-svv-muted);border:1px solid var(--color-svv-line-strong);border-radius:999px;padding:1px 7px}
.gst-pieces{list-style:none;margin:.5rem 0 0;padding:0;display:flex;flex-direction:column;gap:.3rem}
.gst-piece{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;font-size:.8rem;color:var(--color-svv-muted)}
/* Cible tactile : un lien de pièce jointe se clique au doigt comme un bouton. */
.gst-lien{min-height:44px;display:inline-flex;align-items:center;font-weight:600;color:var(--color-svv-red);text-decoration:underline}
/* CLASSÉS SANS SUITE — replié par défaut : présent sans encombrer. */
.gst-sans-suite{margin-top:1rem;border-top:1px solid var(--color-svv-line);padding-top:.75rem}
.gst-sans-suite-titre{display:flex;align-items:center;gap:.5rem;min-height:44px;font-size:13px;font-weight:700;color:var(--color-svv-ink);cursor:pointer}
`;
