'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * PART-3a — DEMANDER À LA MAIRIE LES PIÈCES MANQUANTES, sous le bloc de complétude. Une case par famille MANQUANTE (toutes
 * PRÉ-COCHÉES) ; Arno décoche ce qu'il ne veut pas. Envoi MANUEL (POST admin), dans le fil du dernier message. Aucune famille
 * cochée → bouton inactif. Adresse non répondable (no-reply) → bouton inactif + motif en clair. Mobile-first, texte porteur.
 */
type Famille = 'masse' | 'coupe' | 'etage' | 'cerfa';
const LIBELLE: Record<Famille, string> = { masse: 'Plan de masse', coupe: 'Plan de coupe', etage: 'Plans d’étages', cerfa: 'Formulaire Cerfa' };

interface Etat { destinataire: string | null; repliable: boolean; motif: string | null; historique: { le: string; motif: string }[] }
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };

export function BlocDemandePieces({ dossierId, famillesManquantes }: { dossierId: number; famillesManquantes: Famille[] }) {
  const [coches, setCoches] = useState<Set<Famille>>(() => new Set(famillesManquantes)); // toutes pré-cochées
  const [etat, setEtat] = useState<Etat | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Chargement au montage : fetch INLINE avec garde `annule` (patron BlocPiecesPermis) — l'effet ne fait que charger puis poser.
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/permis/demander-pieces?dossierId=${dossierId}`, { cache: 'no-store' });
        if (!annule && res.ok) setEtat((await res.json()) as Etat);
      } catch { /* état indisponible : le bloc reste affiché, l'envoi dira le motif */ }
    })();
    return () => { annule = true; };
  }, [dossierId]);
  // Rafraîchissement APRÈS un envoi (hors effet : appelé depuis le handler) → l'historique se met à jour.
  const chargerEtat = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/permis/demander-pieces?dossierId=${dossierId}`, { cache: 'no-store' });
      if (res.ok) setEtat((await res.json()) as Etat);
    } catch { /* refetch best-effort */ }
  }, [dossierId]);

  const basculer = (f: Famille) => setCoches((s) => { const n = new Set(s); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  const envoyer = useCallback(async () => {
    setEnvoi(true); setMessage(null);
    try {
      const res = await fetch('/api/admin/permis/demander-pieces', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId, familles: [...coches] }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; destinataire?: string; erreur?: string };
      if (res.ok && d.ok) { setMessage(`Demande envoyée à ${d.destinataire}.`); await chargerEtat(); }
      else setMessage(res.status === 401 ? 'Session expirée : reconnectez-vous.' : (d.erreur ?? 'envoi impossible'));
    } catch { setMessage('envoi impossible'); } finally { setEnvoi(false); }
  }, [dossierId, coches, chargerEtat]);

  const repliable = etat?.repliable ?? false;
  const peutEnvoyer = repliable && coches.size > 0 && !envoi;

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 0, marginTop: '.4rem', paddingTop: '.4rem', borderTop: '1px solid var(--color-svv-line)' }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>Demander les pièces manquantes à la mairie</h4>
      {etat === null
        ? <span style={muted} aria-live="polite">Chargement…</span>
        : (
          <>
            {etat.destinataire && repliable && <span style={muted}>Sera envoyé dans le fil du dernier message, à {etat.destinataire}.</span>}
            {!repliable && <p role="note" style={{ margin: 0, fontSize: 12, color: 'var(--color-svv-red)' }}>Envoi impossible : {etat.motif ?? 'destinataire non répondable'}.</p>}
            <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
              <legend style={{ ...muted, padding: 0 }}>Pièces à demander (décochez ce que vous ne voulez pas) :</legend>
              {famillesManquantes.map((f) => (
                <label key={f} style={{ display: 'flex', gap: '.4rem', alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={coches.has(f)} onChange={() => basculer(f)} disabled={!repliable} />
                  {LIBELLE[f]}
                </label>
              ))}
            </fieldset>
            <button type="button" className="svv-btn svv-btn-primary" style={{ width: 'auto', padding: '.3rem .7rem', alignSelf: 'flex-start' }}
              disabled={!peutEnvoyer} onClick={() => void envoyer()}>
              {envoi ? 'Envoi…' : 'Demander ces pièces'}
            </button>
            {coches.size === 0 && repliable && <span style={muted}>Cochez au moins une pièce.</span>}
            {message && <div role="status" style={{ fontSize: 12, color: 'var(--color-svv-ink)' }}>{message}</div>}
            {etat.historique.length > 0 && (
              <div style={{ ...muted, marginTop: '.2rem' }}>
                Demandes déjà envoyées :
                <ul style={{ margin: '.1rem 0 0', paddingLeft: '1.1rem' }}>
                  {etat.historique.map((h, i) => <li key={i}>{h.le.slice(0, 16).replace('T', ' ')} — {h.motif}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
    </div>
  );
}
