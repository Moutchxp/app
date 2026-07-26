'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formaterDateJour, libelleCommune, type CleCategorie } from '../../../../lib/sitadel/priorite';
import type { DossierAffiche, ResultatVeille } from '../../../../lib/sitadel/veilleRepo';

/**
 * Vue de la tuile « Permis de construire » (client) : filtres combinables + liste paginée CÔTÉ SERVEUR (jamais 29 670
 * lignes d'un coup), total filtré et compteurs par catégorie. La recherche libre (numéro / voie) tolère la troncature
 * du libellé (traitée en base par trigramme — cf. `priorite.ts`). LECTURE SEULE : aucune mutation.
 */

interface Categorie { cle: CleCategorie; libelle: string; rang: number }
interface Props { depuisParDefaut: string; categories: Categorie[] }

interface Filtres {
  departement: string; commune: string; type: '' | 'PC' | 'PD'; rang: string;
  depuis: string; jusqua: string; surfaceMin: string; logementsMin: string; q: string;
}

type Etat =
  | { statut: 'chargement' }
  | { statut: 'erreur' }
  | { statut: 'ok'; data: ResultatVeille };

const TAILLE = 25;
const styleChamp: CSSProperties = { padding: '.4rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', fontSize: 14 };
const fmtNb = (n: number | null): string => (n === null ? '—' : n.toLocaleString('fr-FR'));
const fmtSurf = (n: number | null): string => (n === null ? '—' : `${Math.round(n).toLocaleString('fr-FR')} m²`);

export function PermisVue({ depuisParDefaut, categories }: Props) {
  const [filtres, setFiltres] = useState<Filtres>({
    departement: '', commune: '', type: '', rang: '',
    depuis: depuisParDefaut, jusqua: '', surfaceMin: '', logementsMin: '', q: '',
  });
  const [page, setPage] = useState(1);
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' });

  /** Toute modif de filtre remet la pagination à 1 (jamais de setState d'effet). */
  const maj = (patch: Partial<Filtres>): void => { setFiltres((f) => ({ ...f, ...patch })); setPage(1); };

  const categoriesTriees = useMemo(() => [...categories].sort((a, b) => a.rang - b.rang), [categories]);
  const cle = JSON.stringify(filtres);

  // Fetch débouncé (250 ms) sur (filtres, page). Patron admin : setState DANS l'IIFE async + garde anti-course.
  useEffect(() => {
    let annule = false;
    const t = setTimeout(() => {
      void (async () => {
        setEtat({ statut: 'chargement' });
        try {
          const p = new URLSearchParams();
          for (const [k, v] of Object.entries(filtres)) if (v !== '') p.set(k, v);
          p.set('page', String(page));
          p.set('taille', String(TAILLE));
          const res = await fetch(`/api/admin/permis?${p.toString()}`, { cache: 'no-store' });
          if (annule) return;
          if (!res.ok) { setEtat({ statut: 'erreur' }); return; }
          const data = (await res.json()) as ResultatVeille;
          if (!annule) setEtat({ statut: 'ok', data });
        } catch {
          if (!annule) setEtat({ statut: 'erreur' });
        }
      })();
    }, 250);
    return () => { annule = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, page]);

  const data = etat.statut === 'ok' ? etat.data : null;
  const nbPages = data ? Math.max(1, Math.ceil(data.total / TAILLE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Filtres (tous combinables) ── */}
      <div className="svv-card" style={{ display: 'flex', flexWrap: 'wrap', gap: '.6rem', alignItems: 'flex-end' }}>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Département
          <select value={filtres.departement} onChange={(e) => maj({ departement: e.target.value })} style={styleChamp}>
            <option value="">Tous</option>
            {['75', '92', '93', '78'].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Commune (nom ou code)
          <input value={filtres.commune} onChange={(e) => maj({ commune: e.target.value })} placeholder="ex. Nanterre ou 92050" style={styleChamp} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Type
          <select value={filtres.type} onChange={(e) => maj({ type: e.target.value as Filtres['type'] })} style={styleChamp}>
            <option value="">Tous</option><option value="PC">PC</option><option value="PD">PD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Catégorie
          <select value={filtres.rang} onChange={(e) => maj({ rang: e.target.value })} style={styleChamp}>
            <option value="">Toutes</option>
            {categoriesTriees.map((c) => <option key={c.cle} value={String(c.rang)}>{c.libelle}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Depuis
          <input type="date" value={filtres.depuis} onChange={(e) => maj({ depuis: e.target.value })} style={styleChamp} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Jusqu&rsquo;à
          <input type="date" value={filtres.jusqua} onChange={(e) => maj({ jusqua: e.target.value })} style={styleChamp} />
        </label>
        <button type="button" onClick={() => maj({ depuis: '', jusqua: '' })} className="svv-btn svv-btn-outline" style={{ padding: '.4rem .7rem', fontSize: 13 }}>
          Depuis toujours
        </button>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Surface min (m²)
          <input type="number" min={0} value={filtres.surfaceMin} onChange={(e) => maj({ surfaceMin: e.target.value })} style={{ ...styleChamp, width: 110 }} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12 }}>Logements min
          <input type="number" min={0} value={filtres.logementsMin} onChange={(e) => maj({ logementsMin: e.target.value })} style={{ ...styleChamp, width: 110 }} />
        </label>
        <label className="flex flex-col gap-1" style={{ fontSize: 12, flex: '1 1 220px' }}>Recherche (n° de dossier ou voie)
          <input value={filtres.q} onChange={(e) => maj({ q: e.target.value })} placeholder="ex. ISSY-LES-MOULINEAUX" style={styleChamp} />
        </label>
      </div>

      {/* ── Total + compteurs par catégorie ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', fontSize: 13 }}>
        <strong>{data ? `${data.total.toLocaleString('fr-FR')} dossier(s)` : '…'}</strong>
        {data?.comptes.map((c) => (
          <span key={c.rang} className="svv-pill" style={{ background: 'var(--color-svv-field)', padding: '.2rem .55rem', borderRadius: 999 }}>
            {c.libelle} : {c.n.toLocaleString('fr-FR')}
          </span>
        ))}
      </div>

      {/* ── Liste ── */}
      {etat.statut === 'erreur' && <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Chargement impossible (réservé aux administrateurs).</div>}
      {etat.statut === 'chargement' && !data && <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement…</div>}
      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
                {['Catégorie', 'Date', 'Commune', 'Dép.', 'Surface', 'Logts', 'Adresse du terrain', 'Cadastre', 'N° dossier', 'Type'].map((h) => (
                  <th key={h} style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((d: DossierAffiche) => (
                <tr key={`${d.type}-${d.id}`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                  <td style={{ padding: '.4rem .5rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.libelleCategorie}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{formaterDateJour(d.dateReelleAutorisation)}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{libelleCommune(d.communeNom, d.codeInsee)}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{d.departement}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{fmtSurf(d.type === 'PD' ? d.superficieTerrain : d.surfCreee)}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{fmtNb(d.nbLgtTotCrees)}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{[d.adrNumTer, d.adrLibvoieTer, d.adrLocaliteTer].filter(Boolean).join(' ') || '—'}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap' }}>{d.cadastre.length ? d.cadastre.join(' · ') : '—'}</td>
                  <td style={{ padding: '.4rem .5rem', whiteSpace: 'nowrap', fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.numDau}</td>
                  <td style={{ padding: '.4rem .5rem' }}>{d.type}</td>
                </tr>
              ))}
              {data.lignes.length === 0 && (
                <tr><td colSpan={10} style={{ padding: '1rem .5rem', color: 'var(--color-svv-muted)' }}>Aucun dossier pour ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.total > TAILLE && (
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
          <span>Page {page} / {nbPages}</span>
          <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page >= nbPages} onClick={() => setPage((p) => Math.min(nbPages, p + 1))}>Suivant</button>
        </div>
      )}
    </div>
  );
}
