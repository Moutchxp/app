'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { echeanceDe, etatEcheance, type EtatEcheance } from '../../../../lib/veille/echeance';
import type { ReponsesData } from '../../../../lib/veille/reponsesSuivi';
import {
  IndicateurReleve, RappelReglages, TableRuns, BadgeEtat, CompteSatisfaction, DetailDossiers,
  BlocARattacher, RelanceCarte, PhraseVide, formaterDate,
} from './ReponsesRendu';

/**
 * R5a — écran « Réponses » : suivi EN LECTURE SEULE de la boucle CRPA (état de la relève, échéances, file « à rattacher »,
 * relances préparées). Aucune action, aucune écriture — les actions sont le chantier R5b. L'état d'échéance est calculé ICI
 * via `etatEcheance` (réutilisé, jamais recopié) sur un instant figé au chargement, puis seulement affiché (ReponsesRendu).
 */
const PAGE = 20;
const styleTh: CSSProperties = { padding: '.4rem .5rem', textAlign: 'left' };
const styleTd: CSSProperties = { padding: '.4rem .5rem', verticalAlign: 'top' };
const styleH2: CSSProperties = { fontSize: 15, fontWeight: 700, margin: 0 };

function Pagination({ page, nbPages, total, onPage }: { page: number; nbPages: number; total: number; onPage: (p: number) => void }) {
  if (nbPages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: '.6rem', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>Précédent</button>
      <span>Page {page} / {nbPages} ({total})</span>
      <button type="button" className="svv-btn svv-btn-outline" style={{ padding: '.35rem .7rem' }} disabled={page >= nbPages} onClick={() => onPage(Math.min(nbPages, page + 1))}>Suivant</button>
    </div>
  );
}

export function ReponsesVue() {
  const [data, setData] = useState<ReponsesData | null>(null);
  const [maintenant, setMaintenant] = useState<Date>(() => new Date()); // instant FIGÉ, réactualisé au chargement des données
  const [erreur, setErreur] = useState(false);
  const [dossOuverts, setDossOuverts] = useState<Set<number>>(new Set());
  const [relOuvertes, setRelOuvertes] = useState<Set<number>>(new Set());
  const [pageDem, setPageDem] = useState(1);
  const [pageRat, setPageRat] = useState(1);
  const [pageRel, setPageRel] = useState(1);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/reponses', { cache: 'no-store' });
        if (annule) return;
        if (res.ok) { setData((await res.json()) as ReponsesData); setMaintenant(new Date()); } else setErreur(true);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // Bloc 2 — enrichissement (etatEcheance réutilisé) + tri par échéance CROISSANTE (le plus urgent en haut ; sans date en dernier).
  const demandes = useMemo(() => {
    if (!data) return [];
    const reg = { echeanceAlerteJours: data.reglages.alerteJours, releveFraicheurHeures: data.reglages.fraicheurHeures };
    const derniere = data.derniereOkLe ? new Date(data.derniereOkLe) : null;
    return data.demandes.map((d) => {
      const envoye = d.envoyeLe ? new Date(d.envoyeLe) : null;
      const r = etatEcheance({ envoyeLe: envoye, statutAcheminement: d.statutAcheminement, dossiersActifs: d.dossiersActifs, dossiersSatisfaits: d.dossiersSatisfaits, derniereReleveOkLe: derniere }, maintenant, reg);
      return { ...d, etat: r.etat as EtatEcheance, motif: r.motif, echeanceLe: envoye ? echeanceDe(envoye) : null };
    }).sort((a, b) => {
      if (!a.echeanceLe && !b.echeanceLe) return 0;
      if (!a.echeanceLe) return 1;
      if (!b.echeanceLe) return -1;
      return a.echeanceLe.getTime() - b.echeanceLe.getTime();
    });
  }, [data, maintenant]);

  if (erreur) return <p role="alert" style={{ color: 'var(--color-svv-red)' }}>Suivi indisponible.</p>;
  if (!data) return <p style={{ color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement du suivi…</p>;

  const toggle = (set: Set<number>, id: number): Set<number> => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  // Pagination (les listes peuvent grossir).
  const nbPagesDem = Math.max(1, Math.ceil(demandes.length / PAGE));
  const pDem = Math.min(pageDem, nbPagesDem);
  const demVisibles = demandes.slice((pDem - 1) * PAGE, pDem * PAGE);

  const nbPagesRat = Math.max(1, Math.ceil(data.aRattacher.length / PAGE));
  const pRat = Math.min(pageRat, nbPagesRat);
  const ratVisibles = data.aRattacher.slice((pRat - 1) * PAGE, pRat * PAGE);

  const nbPagesRel = Math.max(1, Math.ceil(data.relances.length / PAGE));
  const pRel = Math.min(pageRel, nbPagesRel);
  const relVisibles = data.relances.slice((pRel - 1) * PAGE, pRel * PAGE);

  return (
    <div className="flex flex-col gap-4">
      {/* ── Bloc 1 : état de la relève (le plus important, en tête) ── */}
      <section className="svv-card flex flex-col gap-2">
        <h2 style={styleH2}>État de la relève</h2>
        <IndicateurReleve active={data.reglages.active} derniereOkLe={data.derniereOkLe} fraicheurHeures={data.reglages.fraicheurHeures} maintenant={maintenant} />
        <RappelReglages reglages={data.reglages} />
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, margin: '.4rem 0 .2rem' }}>10 dernières relèves</h3>
          <TableRuns runs={data.runs} />
        </div>
      </section>

      {/* ── Bloc 2 : suivi des demandes envoyées (tableau de bord, tri échéance croissante) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Suivi des demandes envoyées</h2>
        {demandes.length === 0 ? (
          <PhraseVide>Aucune demande envoyée pour l’instant.</PhraseVide>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)' }}>
                    {['Référence', 'Commune', 'Envoyée le', 'Échéance', 'État', 'Dossiers', 'Réponses', ''].map((h) => <th key={h} style={styleTh}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {demVisibles.map((d) => {
                    const ouvert = dossOuverts.has(d.demandeId);
                    return [
                      <tr key={d.demandeId} style={{ borderBottom: ouvert ? 'none' : '1px solid var(--color-svv-line)' }}>
                        <td style={{ ...styleTd, fontFamily: 'var(--font-svv-mono, monospace)' }}>{d.reference}</td>
                        <td style={styleTd}>{d.communeNom ?? d.codeInsee}</td>
                        <td style={styleTd}>{formaterDate(d.envoyeLe)}</td>
                        <td style={styleTd}>{d.echeanceLe ? formaterDate(d.echeanceLe.toISOString()) : '—'}</td>
                        <td style={styleTd}><BadgeEtat etat={d.etat} motif={d.motif} /></td>
                        <td style={styleTd}><CompteSatisfaction satisfaits={d.dossiersSatisfaits} total={d.dossiersActifs} /></td>
                        <td style={{ ...styleTd, textAlign: 'right' }}>{d.nbReponses}</td>
                        <td style={styleTd}><button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem' }} aria-expanded={ouvert} onClick={() => setDossOuverts((s) => toggle(s, d.demandeId))}>{ouvert ? 'masquer' : 'détail'}</button></td>
                      </tr>,
                      ouvert ? (
                        <tr key={`${d.demandeId}-detail`} style={{ borderBottom: '1px solid var(--color-svv-line)' }}>
                          <td colSpan={8} style={{ padding: '0 .5rem .5rem' }}><DetailDossiers dossiers={d.dossiers} /></td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={pDem} nbPages={nbPagesDem} total={demandes.length} onPage={setPageDem} />
          </>
        )}
      </section>

      {/* ── Bloc 3 : file « à rattacher » (paginée 20) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>À rattacher</h2>
        <BlocARattacher reponses={ratVisibles} />
        <Pagination page={pRat} nbPages={nbPagesRat} total={data.aRattacher.length} onPage={setPageRat} />
      </section>

      {/* ── Bloc 4 : relances préparées (brouillons, corps consultable) ── */}
      <section className="flex flex-col gap-2">
        <h2 style={styleH2}>Relances préparées</h2>
        {data.relances.length === 0 ? (
          <PhraseVide>Aucune relance préparée.</PhraseVide>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {relVisibles.map((r) => (
                <div key={r.id} className="flex flex-col gap-1">
                  <RelanceCarte relance={r} ouvert={relOuvertes.has(r.id)} />
                  <button type="button" className="svv-link" style={{ width: 'auto', padding: '.15rem .4rem', alignSelf: 'flex-start' }}
                    aria-expanded={relOuvertes.has(r.id)} onClick={() => setRelOuvertes((s) => toggle(s, r.id))}>
                    {relOuvertes.has(r.id) ? 'masquer le corps' : 'voir le corps'}
                  </button>
                </div>
              ))}
            </div>
            <Pagination page={pRel} nbPages={nbPagesRel} total={data.relances.length} onPage={setPageRel} />
          </>
        )}
      </section>
    </div>
  );
}
