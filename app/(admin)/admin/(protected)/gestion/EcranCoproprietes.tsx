'use client';

import { useEffect, useState } from 'react';
import { nomAvecVille } from '../../../../lib/gestion/syndics';
import { TITRE_HORS_COPROPRIETE, type LigneCopropriete } from '../../../../lib/gestion/copropriete';
import { FicheCopropriete } from './FicheCopropriete';

/**
 * ══ 🔴🔴 L'ÉCRAN « COPROPRIÉTÉS » (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 4) ══════════════════════════════════════════════════════
 * Juste sous « Syndics » : TOUS les immeubles du portefeuille — une copropriété encore non enregistrée y figure, et sa fiche se crée au premier
 * « Valider ». Une ligne par copropriété : son nom, ses adresses, son syndic, le nombre de biens, « Bien hors copropriété » le cas échéant ;
 * une recherche (nom, adresse, syndic) ; chaque ligne ouvre la fiche copropriété. Comme l'écran des syndics, il ne dépend de rien de l'écran
 * hôte (Gestion, ou la page de la Location) : il reçoit son retour, et éventuellement une copropriété à ouvrir dès l'arrivée.
 */
const API = '/api/admin/gestion/coproprietes/liste';
type Ligne = Omit<LigneCopropriete, 'cherchable'>;

export function EcranCoproprietes({ retour = null, ouvrirDepart = null }: { retour?: React.ReactNode; ouvrirDepart?: string | null }) {
  const [q, setQ] = useState('');
  const [liste, setListe] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [ouverte, setOuverte] = useState<string | null>(ouvrirDepart);
  useEffect(() => {
    let vivant = true;
    const t = setTimeout(() => {
      fetch(`${API}?q=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => r.json() as Promise<{ etat?: string; data?: { lignes: Ligne[] }; message?: string }>)
        .then((j) => { if (!vivant) return; if (j.etat === 'ok' && j.data) { setListe(j.data.lignes); setErreur(null); } else { setListe([]); setErreur(j.message ?? 'Lecture impossible.'); } })
        .catch(() => { if (vivant) { setListe([]); setErreur('Lecture impossible : le serveur n’a pas répondu.'); } });
    }, 200);
    return () => { vivant = false; clearTimeout(t); };
  }, [q, version]);
  return (
    <section className="ecp" aria-labelledby="ecp-titre" data-ecran-coproprietes>
      <style>{CSS_ECRAN_COPROPRIETES}</style>
      <div className="ecp-tete">
        {retour}
        <h2 className="ecp-titre" id="ecp-titre">Copropriétés {liste !== null && <span className="gst-compte" data-ecp-compte>{liste.length}</span>}</h2>
      </div>
      <p className="ecp-discret ecp-sans-marge">Tous les immeubles du portefeuille ; une copropriété pas encore enregistrée a sa fiche créée au premier « Valider ».</p>
      <label className="ecp-recherche">
        <span className="ecp-sr">Rechercher une copropriété</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, adresse, syndic…" data-ecp-recherche />
      </label>
      {erreur !== null && <p className="cp-refus" role="alert">{erreur}</p>}
      {liste === null ? <p className="ecp-discret">Chargement…</p> : liste.length === 0 ? (
        <p className="ecp-discret" data-ecp-vide>{q.trim() === '' ? 'Aucun immeuble dans le portefeuille.' : 'Aucune copropriété ne répond à cette recherche.'}</p>
      ) : (
        <ul className="ecp-liste">
          {liste.map((c) => (
            <li key={c.cle}>
              <button type="button" className="ecp-ligne" onClick={() => setOuverte(c.immeuble)} data-ecp-ligne={c.cle}>
                <span className="ecp-nom">{c.nom}
                  {c.hors && <span className="ecp-hors" data-ecp-hors> · {TITRE_HORS_COPROPRIETE}</span>}
                  {!c.declaree && <span className="ecp-discret" data-ecp-a-creer> · fiche à créer</span>}</span>
                <span className="ecp-adresses" data-ecp-adresses>{c.adresses.join(' · ')}</span>
                <span className="ecp-chiffres">
                  <span data-ecp-syndic>{c.syndic === null ? (c.hors ? 'sans syndic' : 'aucun syndic lié') : `Syndic : ${nomAvecVille(c.syndic.nom, c.syndic.ville)}`}</span>
                  {' · '}<span data-ecp-biens>{c.nbBiens} bien{c.nbBiens > 1 ? 's' : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {ouverte !== null && <FicheCopropriete immeuble={ouverte} onFerme={() => { setOuverte(null); setVersion((v) => v + 1); }} />}
    </section>
  );
}

/* Jetons --color-svv-* uniquement. AUCUN ACCENT GRAVE dans ce litteral. Telephone : tout passe a la ligne. */
export const CSS_ECRAN_COPROPRIETES = `
.ecp{display:flex;flex-direction:column;gap:.7rem;min-width:0;padding:4px 0}
.ecp-tete{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem}
.ecp-titre{margin:0;font-size:1.1rem;font-weight:700;color:var(--color-svv-ink);flex:1 1 auto}
.ecp-recherche input{width:100%;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--color-svv-line-strong);box-sizing:border-box;
  background:var(--color-svv-field);color:var(--color-svv-ink);font:inherit;font-size:16px}
.ecp-sr{position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ecp-discret{color:var(--color-svv-muted);font-size:.85rem}
.ecp-sans-marge{margin:0}
.ecp-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.4rem}
.ecp-ligne{width:100%;min-height:44px;display:flex;flex-direction:column;gap:.2rem;text-align:left;cursor:pointer;box-sizing:border-box;
  padding:10px 12px;border-radius:10px;border:1px solid var(--color-svv-line);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;min-width:0}
.ecp-ligne:hover,.ecp-ligne:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.ecp-nom{font-weight:700;overflow-wrap:anywhere}
.ecp-hors{color:var(--color-svv-orange);font-weight:800}
.ecp-adresses{font-size:.88rem;color:var(--color-svv-muted);overflow-wrap:anywhere}
.ecp-chiffres{font-size:.88rem;overflow-wrap:anywhere}
`;
