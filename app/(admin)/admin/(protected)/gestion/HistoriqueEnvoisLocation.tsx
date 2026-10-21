'use client';

import { useEffect, useState } from 'react';
import { dateHeureEnvoi, libelleEnvoiHistorique } from '../../../../lib/location/mailNouvelleLocation';
import { EVENEMENT_ENVOI_LOCATION } from '../location/EnvoiAdhocMonga';

/**
 * ══ 🔴 « ENVOIS ADHOC & MONGA (N) » DANS L'HISTORIQUE DU BIEN (Arno, 21/10/2026) ═══════════════════════════════════════════
 *
 * ARNO : « Chaque envoi apparaît dans l'“Historique” du bien (événement “Mail Nouvelle location envoyé à N destinataires par
 * <Prénom Nom>”, avec le message d'accompagnement s'il y en a un). »
 *
 * 🔴 UNE BANDE REPLIABLE, À CÔTÉ DE « Historique des tâches » (même gabarit `hdb-groupe`) : la liste des mails de l'Historique
 * n'est pas touchée (elle ne porte que des mails rattachés). Une ligne par envoi RÉUSSI, du plus récent au plus ancien : date et
 * heure, la phrase, et le message d'accompagnement dessous. Sans aucun envoi : la bande n'apparaît pas. Repliée par défaut.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : la lecture passe par la route `/api/admin/gestion/historique/envois-location`.
 */
interface EnvoiLu { id: number; bailId: number; quand: string; par: string; n: number; message: string | null }

export function HistoriqueEnvoisLocation({ lotId }: { lotId: number }) {
  const [envois, setEnvois] = useState<EnvoiLu[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  // Relue après un envoi réussi depuis la même page (fenêtre « Envoi ADHOC & MONGA »).
  const [tour, setTour] = useState(0);
  useEffect(() => {
    const relire = (): void => setTour((t) => t + 1);
    window.addEventListener(EVENEMENT_ENVOI_LOCATION, relire);
    return () => window.removeEventListener(EVENEMENT_ENVOI_LOCATION, relire);
  }, []);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/admin/gestion/historique/envois-location?lot=${lotId}`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; envois?: unknown }) => { if (vivant) setEnvois(d.etat === 'ok' && Array.isArray(d.envois) ? d.envois as EnvoiLu[] : []); })
      .catch(() => { if (vivant) setEnvois([]); });
    return () => { vivant = false; };
  }, [lotId, tour]);

  if (envois === null || envois.length === 0) return null;
  return (
    <section className="hdb-groupe hdb-groupe--bande hdb-groupe--envois" data-historique-envois-location>
      <style>{CSS_HISTORIQUE_ENVOIS}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Envois ADHOC &amp; MONGA
          <span className="gst-compte">{envois.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="hde-liste">
          {envois.map((e) => (
            <li key={e.id} className="hde-ligne" data-envoi-historique={e.id}>
              <span className="hde-date">{dateHeureEnvoi(e.quand)}</span>
              <span className="hde-titre">{libelleEnvoiHistorique(e)}</span>
              {e.message !== null && e.message.trim() !== '' && <span className="hde-message" data-envoi-message>{e.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons seulement (Clair et Sombre). Sur telephone, les informations passent l une sous l autre. */
export const CSS_HISTORIQUE_ENVOIS = `
.hde-liste{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.hde-ligne{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .75rem;padding:.5rem .6rem;min-height:44px;box-sizing:border-box;
  font-size:.86rem;color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.5rem}
.hde-date{font-weight:600;white-space:nowrap}
.hde-titre{font-weight:600;flex:1 1 14rem;min-width:0;overflow-wrap:anywhere}
.hde-message{flex:1 1 100%;color:var(--color-svv-muted);white-space:pre-wrap;overflow-wrap:anywhere;border-left:3px solid var(--color-svv-line-strong);padding-left:.6rem}
`;
