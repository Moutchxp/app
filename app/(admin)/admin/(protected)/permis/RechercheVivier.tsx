'use client';

import { useState } from 'react';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import type { PermisVivier, ResultatRechercheVivier } from '../../../../lib/sitadel/rechercheVivier';

/**
 * D3 — PANNEAU de recherche du VIVIER (permis encore demandables) par n° de permis ou par ville, SCOPÉ au process actif. Une
 * correspondance dans l'AUTRE process n'est jamais « aucun résultat » : elle est annoncée (« N résultats dans X — basculer »).
 * Mobile-first (cibles ≥ 40px), glyphe unicode aria-hidden (pas d'icône), la couleur ne porte jamais l'info seule (mot
 * « demandable »), pas de dark mode. Recherche à la soumission (jamais par frappe → pas de charge du vivier à chaque touche).
 */
export function RechercheVivier({ process, categories, onBasculer }: {
  process: Process;
  categories: { cle: string; libelle: string; rang: number }[];
  onBasculer: (p: Process) => void;
}) {
  // Lot C (point 3) — `bloquees` : par code_insee, la commune téléservice en attente d'accusé (réf. SVAV de la demande qui bloque).
  type Bloquees = Record<string, { reference: string | null; demandeId: number }>;
  const [q, setQ] = useState('');
  const [res, setRes] = useState<(ResultatRechercheVivier & { tronque: boolean; bloquees?: Bloquees }) | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [debloquant, setDebloquant] = useState<number | null>(null);
  const libelle = (cle: string): string => categories.find((c) => c.cle === cle)?.libelle ?? cle;
  const autre: Process = process === 'email' ? 'formulaire' : 'email';

  async function chercher(): Promise<void> {
    const query = q.trim();
    if (query === '') { setRes(null); return; }
    setChargement(true); setErreur('');
    try {
      const r = await fetch(`/api/admin/permis/demandes/vivier-recherche?q=${encodeURIComponent(query)}&process=${process}`, { cache: 'no-store' });
      if (r.ok) setRes((await r.json()) as ResultatRechercheVivier & { tronque: boolean; bloquees?: Bloquees });
      else setErreur('Recherche indisponible.');
    } catch { setErreur('Recherche indisponible.'); }
    finally { setChargement(false); }
  }

  // Lot C (point 3) — ISSUE DE SECOURS depuis le vivier : « pas d'accusé attendu » lève le verrou de la commune (geste humain),
  //   puis on relance la recherche → la commune redevient « demandable ». L'autre sortie (saisir la référence mairie) est rappelée
  //   dans le libellé : un blocage doit TOUJOURS montrer comment en sortir.
  async function debloquer(demandeId: number): Promise<void> {
    setDebloquant(demandeId); setErreur('');
    try {
      const r = await fetch('/api/admin/permis/demandes/debloquer', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ demandeId }),
      });
      if (!r.ok) { setErreur('Déblocage indisponible.'); return; }
      await chercher(); // recharge : la commune n'est plus bloquée
    } catch { setErreur('Déblocage indisponible.'); }
    finally { setDebloquant(null); }
  }

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <strong style={{ fontSize: 13 }}>Rechercher un permis / une ville — vivier {PROCESS_META[process].court}</strong>
      <form onSubmit={(e) => { e.preventDefault(); void chercher(); }} style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="n° de permis ou ville"
          aria-label="Rechercher un permis (numéro) ou une ville dans le vivier"
          style={{ flex: '1 1 12rem', minHeight: 40, padding: '.4rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.45rem', fontSize: 14 }} />
        <button type="submit" className="svv-btn svv-btn-primary" style={{ minHeight: 40, padding: '.4rem .8rem' }} disabled={chargement}>
          <span aria-hidden="true">🔍</span> Chercher
        </button>
      </form>

      {chargement && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }} aria-live="polite">Recherche…</p>}
      {erreur && <p role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)', margin: 0 }}>{erreur}</p>}

      {res && !chargement && (
        <div style={{ fontSize: 13 }}>
          {res.resultats.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-svv-muted)' }}>
              Aucun permis demandable dans le process {PROCESS_META[process].court} pour cette recherche.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
              {res.resultats.map((p: PermisVivier) => {
                const bloc = res.bloquees?.[p.codeInsee];
                const nomCommune = p.communeNom ?? p.codeInsee;
                const refBloc = bloc?.reference ?? (bloc ? `demande #${bloc.demandeId}` : '');
                return (
                  <li key={p.dossierId} style={{ borderBottom: '1px solid var(--color-svv-line)', paddingBottom: '.25rem' }}>
                    <span style={{ fontWeight: 700 }}>{p.type ?? ''} {p.numDau}</span>
                    <span style={{ color: 'var(--color-svv-muted)' }}> · {nomCommune} · {libelle(p.categorie)}{p.dateAutorisation ? ` · ${p.dateAutorisation}` : ''}</span>
                    {/* 🔑 Une commune bloquée n'est JAMAIS « demandable » (contradictoire). Le mot porte l'info (pas la couleur seule). */}
                    {bloc ? (
                      <>
                        <span style={{ color: 'var(--color-svv-red)', fontWeight: 600 }}> · <span aria-hidden="true">⛔</span> bloqué — {nomCommune} en attente de l’accusé de {refBloc}</span>
                        <div style={{ marginTop: '.2rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                          <button type="button" className="svv-btn svv-btn-outline" style={{ minHeight: 32, padding: '.2rem .6rem', color: 'var(--color-svv-red)' }}
                            disabled={debloquant === bloc.demandeId} onClick={() => void debloquer(bloc.demandeId)}>
                            Débloquer — pas d’accusé attendu
                          </button>
                          <span style={{ color: 'var(--color-svv-muted)', fontSize: 11 }}>
                            ou saisir la référence mairie sur la demande {refBloc} (onglet « En cours »).
                          </span>
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--color-svv-green-ink)', fontWeight: 600 }}> · demandable</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {res.tronque && <p style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: '.3rem 0 0' }}>Affichage limité — précisez la recherche.</p>}
          {/* 🔑 MENTION NON SILENCIEUSE : une correspondance dans l'autre vivier n'est jamais un faux « aucun résultat ». */}
          {res.autreProcess > 0 && (
            <p style={{ fontSize: 12, margin: '.3rem 0 0' }}>
              {res.autreProcess} résultat(s) dans le process {PROCESS_META[autre].court} —{' '}
              <button type="button" className="svv-link" style={{ padding: 0, verticalAlign: 'baseline' }} onClick={() => onBasculer(autre)}>basculer</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
