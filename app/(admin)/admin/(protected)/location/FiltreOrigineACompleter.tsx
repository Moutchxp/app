'use client';

import { useEffect, useState } from 'react';

/**
 * ══ 🔴 Arno (25/10/2026, 425) — LE FILTRE « ORIGINE À COMPLÉTER » DE L'ANNUAIRE (Gestion et Location) ═════════════════════════════════
 * Un bouton, replié par défaut : il liste les propriétaires dont l'origine du contact est « Origine inconnue — à compléter » ou encore à
 * renseigner (reprise de l'import) ; un clic ouvre la fiche, où l'origine se complète. Rien ne s'affiche sans la 425.
 */
interface Ligne { id: number; nom: string; origine: 'inconnue' | null }

export function FiltreOrigineACompleter({ ouvrir, lien }: { ouvrir?: (id: number) => void; lien?: (id: number) => string }) {
  const [ouvert, setOuvert] = useState(false);
  const [lu, setLu] = useState<{ disponible: boolean; proprietaires: Ligne[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    if (!ouvert || lu !== null) return;
    let vivant = true;
    fetch('/api/admin/gestion/annuaire?origineACompleter=1', { cache: 'no-store' }).then((r) => r.json())
      .then((d: { etat?: string; data?: { disponible: boolean; proprietaires: Ligne[] } }) => {
        if (!vivant) return;
        if (d.etat === 'ok' && d.data !== undefined) setLu(d.data); else setErreur('La liste n’a pas pu être lue.');
      }).catch(() => { if (vivant) setErreur('La liste n’a pas pu être lue : le serveur n’a pas répondu.'); });
    return () => { vivant = false; };
  }, [ouvert, lu]);
  return (
    <div className="foc" data-filtre-origine-a-completer>
      <style>{CSS_FILTRE_ORIGINE}</style>
      <button type="button" className="foc-bouton" aria-expanded={ouvert} onClick={() => setOuvert((v) => !v)} data-ouvrir-origine-a-completer>
        <span aria-hidden="true">{ouvert ? '▾' : '▸'}</span> Origine à compléter</button>
      {ouvert && (erreur !== null ? <p className="gst-erreur" role="alert">{erreur}</p> : lu === null ? <p className="gst-info" role="status">Lecture…</p>
        : !lu.disponible ? <p className="loc-muet">Mise à jour de la base à appliquer (migration 425) : l’origine du contact ne se saisit pas encore sur le propriétaire.</p>
          : lu.proprietaires.length === 0 ? <p className="loc-muet">Aucun propriétaire dont l’origine reste à compléter.</p> : (
            <>
              <p className="loc-muet foc-compte">{lu.proprietaires.length} propriétaire(s) — « inconnue » : choisie à la création ; « à renseigner » : jamais saisie (import).</p>
              <ul className="foc-liste" data-liste-origine-a-completer>
                {lu.proprietaires.map((p) => (
                  <li key={p.id} data-proprietaire-origine={p.id}>
                    {lien !== undefined ? <a href={lien(p.id)}>{p.nom}</a> : <button type="button" className="foc-lien" onClick={() => ouvrir?.(p.id)}>{p.nom}</button>}
                    <span className="foc-mot">{p.origine === 'inconnue' ? 'inconnue' : 'à renseigner'}</span>
                  </li>))}
              </ul>
            </>))}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px. */
const CSS_FILTRE_ORIGINE = `
.foc{display:flex;flex-direction:column;gap:6px;margin:12px 0}
.foc-bouton{appearance:none;align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:999px;border:1px dashed var(--color-svv-amber);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.foc-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.foc-compte{margin:0}
.foc-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;border:1px solid var(--color-svv-line);border-radius:12px;background:var(--color-svv-surface)}
.foc-liste li{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-bottom:1px solid var(--color-svv-line);overflow-wrap:anywhere}
.foc-liste li:last-child{border-bottom:0}
.foc-lien{appearance:none;background:none;border:0;padding:0;font:inherit;color:var(--color-svv-ink);text-decoration:underline;cursor:pointer;text-align:left}
.foc-mot{font-size:.78rem;color:var(--color-svv-muted);white-space:nowrap}
`;
