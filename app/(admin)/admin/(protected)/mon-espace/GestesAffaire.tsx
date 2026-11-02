'use client';

import { useEffect, useState } from 'react';
import { ModaleAnnulation } from '../transaction/OngletCompromis';
import type { VenteMonEspace } from '../../../../lib/mon-espace/mesAffaires';

/**
 * 🔴 MON ESPACE, LOT 7 (Arno, 02/11/2026) — LES GESTES D'UNE AFFAIRE DEPUIS « MON ESPACE » (décision 5), sur sa ligne dépliée :
 *   · un compromis : « Acte signé » (la date de l'acte, comme dans la tuile) et « Annuler le compromis » (la fenêtre de la tuile : motif, date, note) ;
 *   · une vente actée : « Revenir en compromis ».
 * Chaque geste se CONFIRME dans la page (« Valider l'acte signé du … pour … ? »), jamais par un dialogue du navigateur. L'envoi passe par
 * /api/admin/mon-espace/geste (les fonctions de la tuile, la garde de version : 409 si un collègue a enregistré entre-temps). Les boutons ne
 * sont rendus que pour un négociateur de l'affaire ou un administrateur (`peutAgir`) ; le serveur refuse les autres (403).
 */
export const URL_GESTE = '/api/admin/mon-espace/geste';
const jourFr = (d: string): string => d.split('-').reverse().join('/');

/** Envoie un geste ; rend le motif d'un refus (null : accepté). */
export async function posterGeste(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(URL_GESTE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (r.status === 401) return 'Votre session a expiré : reconnectez-vous.';
    const d = (await r.json()) as { etat?: string; motif?: string; message?: string };
    return d.etat === 'ok' ? null : d.motif ?? d.message ?? (r.status === 403 ? 'Accès refusé.' : 'Enregistrement refusé.');
  } catch {
    return 'Enregistrement impossible : le serveur n’a pas répondu.';
  }
}

type Ouvert = 'acte' | 'retour' | 'annuler' | null;

export function GestesAffaire({ v, aujourdhui, peutAgir, onFait, onOccupe }: { v: VenteMonEspace; aujourdhui: string; peutAgir: boolean; onFait: () => void;
  /** Un geste est ouvert (saisie ou confirmation) sur cette affaire : le rafraîchissement automatique attend. Fonction STABLE (useCallback). */
  onOccupe: (id: number, occupe: boolean) => void }) {
  const [ouvert, setOuvert] = useState<Ouvert>(null);
  const [date, setDate] = useState(aujourdhui);
  const [motif, setMotif] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => { onOccupe(v.id, ouvert !== null); }, [ouvert, onOccupe, v.id]);
  useEffect(() => () => onOccupe(v.id, false), [onOccupe, v.id]);
  if (!peutAgir || (v.statut !== 'compromis' && v.statut !== 'vendue')) return null;
  const confirmer = async (corps: Record<string, unknown>): Promise<void> => {
    setEnvoi(true); setMotif(null);
    const r = await posterGeste({ id: v.id, version: v.version, ...corps });
    setEnvoi(false);
    if (r === null) { setOuvert(null); onFait(); } else setMotif(r);
  };
  const abandonner = <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => { setOuvert(null); setMotif(null); }} data-abandonner-geste>Abandonner</button>;
  return <>
    {ouvert === null && (v.statut === 'compromis' ? <>
      <button type="button" className="svv-btn svv-btn-primary gst-btn" onClick={() => { setDate(aujourdhui); setOuvert('acte'); }} data-acte-signe-mon-espace={v.id}>Acte signé</button>
      <button type="button" className="trx-btn-annulation" onClick={() => setOuvert('annuler')} data-annuler-mon-espace={v.id}>Annuler le compromis</button>
    </> : <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setOuvert('retour')} data-retour-mon-espace={v.id}>Revenir en compromis</button>)}
    {ouvert === 'acte' && (
      <form className="trx-form mes-confirmation" onSubmit={(e) => { e.preventDefault(); void confirmer({ geste: 'acte-signe', dateActe: date }); }} data-confirmation-acte={v.id}>
        <label>Date de l’acte (son mois est le mois du CA)<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required data-date-acte-mon-espace /></label>
        <p className="trx-plein mes-confirmation-question" role="status">{date === '' ? 'Choisissez la date de l’acte.' : `Valider l’acte signé du ${jourFr(date)} pour « ${v.libelle} » ?`}</p>
        <div className="trx-plein trx-actions">
          <button type="submit" className="svv-btn svv-btn-primary gst-btn" disabled={envoi || date === ''} data-confirmer-acte-mon-espace>Valider l’acte signé</button>{abandonner}
        </div>
      </form>
    )}
    {ouvert === 'retour' && (
      <div className="mes-confirmation" role="group" aria-label="Revenir en compromis" data-confirmation-retour={v.id}>
        <p className="mes-confirmation-question" role="status">Remettre « {v.libelle} » en compromis en cours ? L’acte ne sera plus compté dans le CA.</p>
        <div className="trx-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={envoi} onClick={() => void confirmer({ geste: 'retour-compromis' })} data-confirmer-retour-mon-espace>Revenir en compromis</button>{abandonner}
        </div>
      </div>
    )}
    {ouvert === 'annuler' && <ModaleAnnulation vente={v} aujourdhui={aujourdhui} onFermer={() => setOuvert(null)} onFait={() => { setOuvert(null); onFait(); }}
      envoyer={(c) => posterGeste({ geste: 'compromis-annuler', ...c })} />}
    {motif !== null && <p className="trx-erreur" role="alert" data-motif-geste={v.id}>{motif}</p>}
  </>;
}
