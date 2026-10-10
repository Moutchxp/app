'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { nomAvecVille, type SyndicResume } from '../../../../lib/gestion/syndics';
import { FicheSyndic } from './FicheSyndic';
import { rafraichirImmeubles } from './useImmeublesSyndics';

/**
 * ══ 🔴🔴 LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN — L'ÉCRAN « SYNDICS » ══════════════════════════════════════════════
 *
 * ARNO : « Écran “Syndics” dans la tuile Gestion : liste des syndics (nom, nb de copropriétés, nb de biens),
 * recherche, “+ Créer un syndic” from scratch (sans bien de départ → ajouter une ou plusieurs copropriétés),
 * ouverture de la même fiche. Cet écran est le composant que la future tuile Location réutilisera. »
 *
 * 🔴 IL NE DÉPEND DE RIEN DE L'ÉCRAN GESTION : ni de son adresse, ni de ses états. Il reçoit seulement, s'il y en a
 * un, le composeur où écrire (`onEcrire`) et le retour. C'est ce qui permet de le poser tel quel ailleurs.
 */
export function EcranSyndics({ onEcrire, retour = null }: {
  onEcrire?: (email: string) => void;
  /** Un bouton de retour à poser en tête, fourni par l'écran hôte. */
  retour?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<SyndicResume[] | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [version, setVersion] = useState(0);
  const [ouvert, setOuvert] = useState<{ id: number | null } | null>(null);

  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      void fetch(`/api/admin/gestion/syndics?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        .then((r) => r.json() as Promise<{ disponible?: boolean; syndics?: SyndicResume[] }>)
        .then((j) => { if (vivant) { setListe(j.syndics ?? []); setDisponible(j.disponible !== false); } })
        .catch(() => { if (vivant) setListe([]); });
    }, 200);
    return () => { vivant = false; clearTimeout(t); };
  }, [q, version]);

  const fermer = (): void => { setOuvert(null); setVersion((v) => v + 1); void rafraichirImmeubles(); };

  return (
    <section className="esy" aria-labelledby="esy-titre">
      <style>{CSS_ECRAN_SYNDICS}</style>
      <div className="esy-tete">
        {retour}
        <h2 className="esy-titre" id="esy-titre">
          Syndics {liste !== null && <span className="gst-compte">{liste.length}</span>}
        </h2>
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!disponible}
          onClick={() => setOuvert({ id: null })}>+ Créer un syndic</button>
      </div>
      {!disponible && <p className="esy-alerte">L’annuaire des syndics n’est pas encore installé (migration 324).</p>}
      <label className="esy-recherche">
        <span className="esy-sr">Rechercher un syndic</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, e-mail, domaine…" />
      </label>
      {liste === null ? <p className="esy-discret">Chargement…</p> : liste.length === 0 ? (
        <p className="esy-discret">{q.trim() === '' ? 'Aucun syndic enregistré pour l’instant.' : 'Aucun syndic ne répond à cette recherche.'}</p>
      ) : (
        <ul className="esy-liste">
          {liste.map((s) => (
            <li key={s.id}>
              <button type="button" className="esy-ligne" onClick={() => setOuvert({ id: s.id })}>
                {/* LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — « NOM / Ville » : deux Foncia se distinguent. */}
                <span className="esy-nom">{nomAvecVille(s.nom, s.ville)}</span>
                <span className="esy-chiffres">
                  {s.nbCoproprietes} copropriété{s.nbCoproprietes > 1 ? 's' : ''} · {s.nbBiens} bien{s.nbBiens > 1 ? 's' : ''}
                </span>
                {s.email && <span className="esy-discret">{s.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ouvert !== null && typeof document !== 'undefined' && createPortal(
        <FicheSyndic syndicId={ouvert.id} onFerme={fermer}
          onEcrire={onEcrire === undefined ? undefined : (email) => { fermer(); onEcrire(email); }} />,
        document.querySelector('.svv-adm-root') ?? document.body,
      )}
    </section>
  );
}

/* Jetons --color-svv-* uniquement. AUCUN ACCENT GRAVE dans ce littéral. */
export const CSS_ECRAN_SYNDICS = `
.esy{display:flex;flex-direction:column;gap:.7rem;min-width:0;padding:4px 0}
.esy-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.esy-titre{margin:0;font-size:1.1rem;font-weight:700;color:var(--color-svv-ink);flex:1 1 auto}
.esy-alerte{padding:8px 10px;border-radius:8px;background:var(--color-svv-amber-soft);color:var(--color-svv-amber);font-size:.85rem}
.esy-recherche input{width:100%;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--color-svv-line-strong);
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:16px}
.esy-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.esy-discret{color:var(--color-svv-muted);font-size:.85rem}
.esy-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.esy-ligne{width:100%;min-height:44px;display:flex;flex-wrap:wrap;align-items:baseline;gap:.3rem 1rem;text-align:left;cursor:pointer;
  padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit}
.esy-ligne:hover,.esy-ligne:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.esy-nom{font-weight:700;flex:1 1 12rem}
.esy-chiffres{font-size:.88rem}
`;
