'use client';

import { useState } from 'react';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import type { PermisVivier, ResultatRechercheVivier, ColonneTriVivier } from '../../../../lib/sitadel/rechercheVivier';

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
  // MOTEUR COMPLET — rail TÉLÉSERVICE uniquement (`estFormulaire`). État d'écran LOCAL, NON persistant (aucun localStorage/URL) ;
  //   panneau FERMÉ au montage ; rien de coché → tous les types. Le rail e-mail ne rend RIEN de ceci et n'envoie aucun paramètre.
  const estFormulaire = process === 'formulaire';
  const [moteurOuvert, setMoteurOuvert] = useState(false);
  const [typesCoches, setTypesCoches] = useState<Set<string>>(new Set());
  const [triColonne, setTriColonne] = useState<'' | ColonneTriVivier>('');
  const [triSens, setTriSens] = useState<'asc' | 'desc'>('asc');
  const basculerType = (cle: string): void => setTypesCoches((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });

  async function chercher(): Promise<void> {
    const query = q.trim();
    if (query === '') { setRes(null); return; }
    setChargement(true); setErreur('');
    // Rail e-mail : URL STRICTEMENT inchangée (q + process). Téléservice : ajoute les options du moteur complet SI renseignées
    //   (rien de coché / aucun tri → aucun paramètre → réponse identique à aujourd'hui). Le serveur les traite en optionnels.
    const params = new URLSearchParams({ q: query, process });
    if (estFormulaire) {
      if (typesCoches.size > 0) params.set('types', [...typesCoches].join(','));
      if (triColonne !== '') params.set('tri', `${triColonne}:${triSens}`);
    }
    try {
      const r = await fetch(`/api/admin/permis/demandes/vivier-recherche?${params.toString()}`, { cache: 'no-store' });
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
        {/* MOTEUR COMPLET — rail téléservice UNIQUEMENT. Bouton + panneau ENTRE le champ et « Chercher ». En e-mail : rien (rendu
            historique à l'identique). Dépliage = montage conditionnel INSTANTANÉ (aucune animation → respecte prefers-reduced-motion). */}
        {estFormulaire && (
          <>
            <button type="button" className="svv-btn svv-btn-outline" aria-expanded={moteurOuvert} aria-controls="moteur-recherche-complet"
              onClick={() => setMoteurOuvert((o) => !o)} style={{ minHeight: 44, padding: '.4rem .8rem', flex: '0 0 auto' }}>
              <span aria-hidden="true">{moteurOuvert ? '▾ ' : '▸ '}</span>Moteur de recherche complet
            </button>
            {moteurOuvert && (
              <div id="moteur-recherche-complet" style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: '.7rem', padding: '.6rem', border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', background: 'var(--color-svv-field)' }}>
                {/* Groupe 1 — TYPE DE PERMIS : cases multi. Référentiel = prop `categories` (= categoriesConnues(config)), JAMAIS une liste en dur. */}
                <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                  <legend style={{ fontSize: 12, fontWeight: 700, padding: 0 }}>Type de permis</legend>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                    {categories.map((c) => (
                      <label key={c.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', minHeight: 44, padding: '.2rem .55rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={typesCoches.has(c.cle)} onChange={() => basculerType(c.cle)} style={{ width: 18, height: 18 }} />
                        {c.libelle}
                      </label>
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>Aucun coché = tous les types.</span>
                </fieldset>
                {/* Groupe 2 — TRI : colonne × sens, sur les champs RÉELLEMENT présents dans le vivier (date, commune). Pas de « surface » (absente de PermisVivier). */}
                <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
                  <legend style={{ fontSize: 12, fontWeight: 700, padding: 0, width: '100%' }}>Tri</legend>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}>Trier par
                    <select value={triColonne} onChange={(e) => setTriColonne(e.target.value as '' | ColonneTriVivier)} style={{ minHeight: 44, padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 }}>
                      <option value="">Ordre par défaut</option>
                      <option value="date">Date d’autorisation</option>
                      <option value="commune">Commune</option>
                    </select>
                  </label>
                  {triColonne !== '' && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', fontSize: 12 }}>Sens
                      <select value={triSens} onChange={(e) => setTriSens(e.target.value as 'asc' | 'desc')} style={{ minHeight: 44, padding: '.3rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 13 }}>
                        <option value="asc">Croissant</option>
                        <option value="desc">Décroissant</option>
                      </select>
                    </label>
                  )}
                </fieldset>
              </div>
            )}
          </>
        )}
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
