'use client';

import { useEffect, useState } from 'react';
import type { TiersDuBien } from '../../../../lib/gestion/contactsTacheRepo';

/**
 * ══ 🔴🔴 « TIERS INDÉPENDANTS AJOUTÉS PAR UNE TÂCHE (N) » — UNE BANDE REPLIABLE DE L'HISTORIQUE DU BIEN (Arno, 10/11/2026) ══════════
 *
 * Arno : « Tâche rattachée à UN SEUL bien : un contact ajouté qui n'existe pas dans l'historique de ce bien y est ajouté comme « tiers
 * indépendant » (nom, rôle, téléphone, e-mail), avec trace au journal. » La bande les montre, avec la date, l'auteur et la tâche d'où
 * ils viennent. Lecture seule ; rien ne s'affiche s'il n'y en a aucun (ou sans la migration 465). ⚠️ AUCUN IMPORT QUI TIRE `pg`
 * (le type seul est importé).
 */
export function BandeTiersDuBien({ lotId }: { lotId: number }) {
  const [lignes, setLignes] = useState<TiersDuBien[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/admin/gestion/taches/contacts?bien=${lotId}&tiers=1`, { headers: { Accept: 'application/json' }, cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { etat?: string; tiers?: unknown }) => { if (vivant) setLignes(d.etat === 'ok' && Array.isArray(d.tiers) ? d.tiers as TiersDuBien[] : []); })
      .catch(() => { if (vivant) setLignes([]); });
    return () => { vivant = false; };
  }, [lotId]);
  if (lignes === null || lignes.length === 0) return null;
  const date = (q: string): string => {
    const d = new Date(q);
    if (Number.isNaN(d.getTime())) return q;
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  };
  return (
    <section className="hdb-groupe hdb-groupe--bande" data-tiers-du-bien>
      <style>{CSS_TIERS_DU_BIEN}</style>
      <div className="hdb-groupe-tete">
        <button type="button" className="hdb-replier" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)}>
          <span aria-hidden="true" className={`hdb-triangle${ouvert ? ' hdb-triangle--ouvert' : ''}`}>▶</span>
          Tiers indépendants ajoutés par une tâche
          <span className="gst-compte">{lignes.length}</span>
        </button>
      </div>
      {ouvert && (
        <ul className="tdb-liste">
          {lignes.map((t) => (
            <li key={t.id} data-tiers={t.id}>
              <strong>{t.nom}</strong>
              {t.role !== null && t.role.trim() !== '' && <span className="tdb-muet">{t.role}</span>}
              {t.telephone !== null && <a href={`tel:${t.telephone.replace(/[^\d+]/g, '')}`}>{t.telephone}</a>}
              {t.email !== null && <span className="tdb-email">{t.email}</span>}
              <span className="tdb-muet">ajouté le {date(t.creeLe)} par {t.par}{t.tacheId === null ? '' : ` (tâche n° ${t.tacheId})`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme seulement (Clair et Sombre) ; cibles de 44 px. */
const CSS_TIERS_DU_BIEN = `
.tdb-liste{list-style:none;margin:0;padding:4px 0 8px;display:flex;flex-direction:column;gap:6px;min-width:0}
.tdb-liste li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;font-size:.82rem;color:var(--color-svv-ink);overflow-wrap:anywhere;min-width:0}
.tdb-liste a{color:var(--color-svv-ink);display:inline-flex;align-items:center;min-height:44px}
.tdb-muet{color:var(--color-svv-muted)}
.tdb-email{overflow-wrap:anywhere}
`;
