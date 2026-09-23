'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CarteEvenement, EtatEcran, LigneFile } from '../../../../lib/gestion/fileRepo';
import {
  depuis, formaterDateFr, libelleEtat, mentionTroncature, messageErreurHttp, messageEvenementsVide, messageFileVide,
  messageReleve,
} from '../../../../lib/gestion/ecran';
import { useReleveGestion } from './useReleveGestion';

/**
 * LOT 2/3 — l'écran à deux côtés. Aucun geste de CLASSEMENT ici : affecter un échange à un événement et classer sans
 * suite sont le lot 4. Deux contrôles seulement : « Rafraîchir », qui relit l'écran, et « Relever maintenant » (lot 3),
 * qui lance UNE passe de relève de la boîte et recharge l'écran après un vrai succès.
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

  /** Relecture DEMANDÉE (clic) : ici l'indicateur d'attente est attendu par celui qui vient de cliquer. */
  const charger = useCallback(async () => {
    setVue({ etat: 'charge' });
    const r = await lire();
    setMaintenant(new Date());
    setVue(r);
  }, [lire]);

  // LOT 3 — une passe réussie change ce qui est à l'écran : on recharge, sans recharger la page.
  const { enCours: releveEnCours, message: releveMsg, releverMaintenant } = useReleveGestion(() => { void charger(); });

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

      {/* ORDRE DU DOM = ordre mobile : la file d'abord, les événements ensuite. */}
      <div className="gst-deux">
        <section className="gst-col" aria-labelledby="gst-titre-file">
          <h2 className="gst-titre" id="gst-titre-file">
            À classer <span className="gst-compte">{d.filsTotal}</span>
          </h2>
          {troncFile && <p className="gst-tronc">{troncFile}</p>}
          {d.file.length === 0
            ? <p className="gst-vide">{messageFileVide(d)}</p>
            : <ul className="gst-liste">{d.file.map((f) => <LigneFil key={f.filId} fil={f} maintenant={ref} />)}</ul>}
        </section>

        <section className="gst-col" aria-labelledby="gst-titre-ev">
          <h2 className="gst-titre" id="gst-titre-ev">
            Événements <span className="gst-compte">{d.evenementsTotal}</span>
          </h2>
          {troncEv && <p className="gst-tronc">{troncEv}</p>}
          {d.evenements.length === 0
            ? <p className="gst-vide">{messageEvenementsVide()}</p>
            : <ul className="gst-liste">{d.evenements.map((e) => <CarteEv key={e.evenementId} carte={e} maintenant={ref} />)}</ul>}
        </section>
      </div>
    </>
  );
}

/** Une ligne de la file = UN ÉCHANGE (pas un message) : à ce volume, six mails ne doivent pas prendre six lignes.
 *  EXPORTÉ pour être rendu en test (contrat visible : mot « attend une réponse », pluriels, jamais de couleur seule). */
export function LigneFil({ fil, maintenant }: { fil: LigneFile; maintenant: Date }) {
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
`;
