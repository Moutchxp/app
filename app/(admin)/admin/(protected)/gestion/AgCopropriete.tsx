'use client';

import { useEffect, useState } from 'react';
import { A_RATTACHER, ligneEntreeAg, TITRE_BLOC_AG, type EntreeAg } from '../../../../lib/location/agCopropriete';

/**
 * ══ 🔴🔴 LE BLOC « AG DE LA COPROPRIÉTÉ » (Arno, 16/11/2026, migration 475) ═══════════════════════════════════════════════════════════════════
 * Sur la fiche du bien (Location et Gestion), à côté du digicode, et dans la fiche syndic (par copropriété) : l'historique des AG — dates,
 * dernière tenue / prochaine, statut OFFICIELLE ou PROJETÉE (distincts à l'œil), qui, quand, d'où (sortie n° …, fiche du bien…). Les AG sont
 * celles de la COPROPRIÉTÉ : un changement de syndic n'y change rien. LECTURE SEULE (`/api/admin/gestion/immeubles/ag`).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */
const API = '/api/admin/gestion/immeubles/ag';
interface Lu { copropriete: string | null; immeuble: string | null; applicable: boolean; entrees: EntreeAg[] }

export function AgCopropriete({ lotId, immeuble }: { lotId?: number; immeuble?: string }) {
  const q = lotId !== undefined ? `lotId=${lotId}` : `immeuble=${encodeURIComponent(immeuble ?? '')}`;
  const [lu, setLu] = useState<{ q: string; etat: 'ok'; data: Lu } | { q: string; etat: 'sans_schema' | 'erreur' } | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch(`${API}?${q}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: Lu }>).then((d) => {
      if (!vivant) return;
      setLu(d.etat === 'ok' && d.data ? { q, etat: 'ok', data: d.data } : { q, etat: d.etat === 'sans_schema' ? 'sans_schema' : 'erreur' });
    }).catch(() => { if (vivant) setLu({ q, etat: 'erreur' }); });
    return () => { vivant = false; };
  }, [q]);
  const etat = lu !== null && lu.q === q ? lu : null;
  if (etat === null || etat.etat === 'sans_schema') return null;
  if (etat.etat !== 'ok') return <p className="loc-muet" data-ag-copropriete-bloc="erreur">{TITRE_BLOC_AG} : lecture impossible.</p>;
  const d: Lu = etat.data;
  if (!d.applicable) return null;
  return (
    <div className="agc" data-ag-copropriete-bloc>
      <p className="agc-titre">{TITRE_BLOC_AG}{d.copropriete !== null ? <> — <span data-agc-copropriete>{d.copropriete}</span></> : <span className="agc-a-rattacher" data-agc-a-rattacher> — {A_RATTACHER}</span>}</p>
      {d.entrees.length === 0 ? <p className="loc-muet agc-vide" data-agc-vide>Aucune AG enregistrée.</p> : (
        <ul className="agc-liste">
          {d.entrees.map((e) => (
            <li key={e.id} className={`agc-entree agc-entree--${e.type === 'derniere' ? 'tenue' : e.statut}`} data-agc-entree={e.type} data-agc-statut={e.statut}>{ligneEntreeAg(e)}</li>
          ))}
        </ul>
      )}
      <style>{CSS_AG_COPROPRIETE}</style>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Une projection : en italique, bordure en tirets ; une officielle : bordure pleine. */
export const CSS_AG_COPROPRIETE = `
.agc{grid-column:1 / -1;display:flex;flex-direction:column;gap:4px;min-width:0}
.agc-titre{margin:0;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.agc-a-rattacher{color:var(--color-svv-orange);font-weight:800}
.agc-vide{margin:0}
.agc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px}
.agc-entree{padding:4px 8px;border-radius:8px;border:1px solid var(--color-svv-line-strong);color:var(--color-svv-ink);font-size:.88rem;overflow-wrap:anywhere}
.agc-entree--officielle{border-color:var(--color-svv-green);background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.agc-entree--projetee{border-style:dashed;font-style:italic}
`;
