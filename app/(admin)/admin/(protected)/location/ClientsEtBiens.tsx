'use client';

import { useEffect, useState } from 'react';
import { CSS_LOCATION_ECRANS, EtatLecture, useLecture } from './commun';
import { CSS_PASTILLE_STATUT, PastilleStatut } from '../gestion/StatutDuBien';
import type { FiltreStatut, PageClients } from '../../../../lib/location/clientsBiensRepo';

/**
 * ══ 🔴🔴 TUILE LOCATION — « CLIENTS ET BIENS » (Arno, 21/10/2026, migration 403) ══════════════════════════════════════════════
 *
 * Les propriétaires et LEURS BIENS, tous statuts : recherche par nom, téléphone, e-mail ou adresse ; filtre « Tous / En gestion /
 * Location seule / Ancienne gestion » ; une pastille par bien — VERT en gestion, BLEU location seule, GRIS ancienne gestion.
 * Un clic ouvre la fiche (la fiche commune, depuis la Location : les mêmes panneaux). Lecture seule.
 */
const FILTRES: { cle: FiltreStatut; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' }, { cle: 'en_gestion', libelle: 'En gestion' },
  { cle: 'location_seule', libelle: 'Location seule' }, { cle: 'ancienne_gestion', libelle: 'Ancienne gestion' },
];

export function ClientsEtBiens() {
  const [texte, setTexte] = useState('');
  const [terme, setTerme] = useState('');
  const [filtre, setFiltre] = useState<FiltreStatut>('tous');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => { setTerme(texte.trim()); setPage(0); }, 200);
    return () => clearTimeout(t);
  }, [texte]);
  const { etat } = useLecture<PageClients>(`clients=1&q=${encodeURIComponent(terme)}&statut=${filtre}&page=${page}`);
  return (
    <div className="loc-page cb" data-clients-et-biens>
      <style>{CSS_LOCATION_ECRANS + CSS_PASTILLE_STATUT + CSS_CLIENTS_BIENS}</style>
      <p className="loc-retour"><a href="/admin/location">← Location</a></p>
      <header className="svv-page-head loc-tete-comme-accueil">
        <div className="svv-page-head-ligne"><h1 className="svv-page-title">Clients et biens</h1></div>
        <p className="svv-page-sub">Les propriétaires et tous leurs biens : en gestion, en location seule, en ancienne gestion.</p>
      </header>
      <label className="loc-recherche loc-recherche--large">
        <span aria-hidden="true">🔎</span>
        <input value={texte} onChange={(e) => setTexte(e.target.value)} type="search" data-recherche-clients
          placeholder="Chercher un propriétaire : nom, téléphone, e-mail, ou adresse d’un de ses biens"
          aria-label="Chercher un propriétaire par nom, téléphone, e-mail ou adresse d’un de ses biens" />
      </label>
      <div className="cb-filtres" role="group" aria-label="Statut des biens">
        {FILTRES.map((f) => (
          <button key={f.cle} type="button" aria-pressed={filtre === f.cle} data-filtre-statut={f.cle}
            className={`cb-filtre${filtre === f.cle ? ' cb-filtre--actif' : ''}`} onClick={() => { setFiltre(f.cle); setPage(0); }}>{f.libelle}</button>
        ))}
      </div>
      {etat.etat !== 'ok' ? <EtatLecture etat={etat} /> : etat.data.clients.length === 0
        ? <p className="loc-muet" data-aucun-client>{terme === '' ? 'Aucun propriétaire pour ce statut.' : `Aucun propriétaire ne correspond à « ${terme} ».`}</p> : (
          <>
            <p className="loc-muet cb-compte" data-total-clients={etat.data.total}>
              {etat.data.total} propriétaire{etat.data.total > 1 ? 's' : ''}{etat.data.total > etat.data.parPage ? ` — page ${etat.data.page + 1}` : ''}
            </p>
            <ul className="cb-liste">
              {etat.data.clients.map((c) => (
                <li key={c.id} className="cb-client" data-client={c.id}>
                  <div className="cb-client-tete">
                    <a className="cb-nom" href={`/admin/location/proprietaire/${c.id}`}>{c.nom}</a>
                    <span className="cb-coord">{[c.telephone, c.email].filter((x) => x).join(' · ')}</span>
                  </div>
                  {c.biens.length === 0 ? <p className="loc-muet cb-sans">Aucun bien.</p> : (
                    <ul className="cb-biens">
                      {c.biens.map((b) => (
                        <li key={b.id} data-bien-client={b.id}>
                          <PastilleStatut statut={b.statut} petite />
                          <a href={`/admin/location/bien/${b.id}`}>{[b.adresse, b.commune].filter((x) => x).join(', ') || `Bien ${b.id}`}</a>
                          {b.categorie !== null && <span className="loc-muet">{b.categorie}</span>}
                          {b.annexes > 0 && <span className="loc-muet">+ {b.annexes} annexe{b.annexes > 1 ? 's' : ''}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="loc-boutons">
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={page === 0} onClick={() => setPage((x) => x - 1)}>← Précédents</button>
              <button type="button" className="svv-btn svv-btn-outline gst-btn" disabled={(page + 1) * etat.data.parPage >= etat.data.total}
                onClick={() => setPage((x) => x + 1)}>Suivants →</button>
            </div>
          </>
        )}
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; cibles de 44 px ; aucun debordement au telephone. */
export const CSS_CLIENTS_BIENS = `
.cb{min-width:0}
.cb-filtres{display:flex;flex-wrap:wrap;gap:8px}
.cb-filtre{appearance:none;font:inherit;font-weight:700;min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);cursor:pointer}
.cb-filtre--actif{background:var(--color-svv-ink);color:var(--color-svv-surface);border-color:var(--color-svv-ink)}
.cb-compte{margin:0}
.cb-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.cb-client{border:1px solid var(--color-svv-line);border-radius:14px;background:var(--color-svv-surface);padding:12px 14px;min-width:0}
.cb-client-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;min-width:0}
.cb-nom{font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.cb-coord{color:var(--color-svv-muted);font-size:.9rem;overflow-wrap:anywhere;min-width:0}
.cb-sans{margin:6px 0 0}
.cb-biens{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.cb-biens li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;min-width:0}
.cb-biens a{color:var(--color-svv-ink);overflow-wrap:anywhere;min-width:0}
`;
