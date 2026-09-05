'use client';

import { useEffect, useState } from 'react';
import type { PlancheParcelles as PlancheData, PlancheParcelleMeta } from '../../../../lib/permis/plancheParcellesRepo';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle';

/**
 * PL-A — PLANCHE CADASTRALE (LECTURE SEULE) : les parcelles du permis (colorées par ORIGINE) + les voisines (contour neutre) dans un
 * rayon, dessinées par le schéma SVG maison (module pur `affectationSchema`, EPSG:2154 — aucune tuile). Répond à « voir la planche +
 * lesquelles l'auto-analyse a retenues ». Chargée AU DÉPLIAGE (PERF-1 : un bloc jamais ouvert ne requête rien). Aucun clic d'écriture
 * (lot PL-B). La légende NOMME L'ACTEUR d'une parcelle corrigée/saisie (« par verif-lot101 »), sans mentir sur « à la main ».
 */

// Couleur d'une parcelle : retenue → par origine (saisie/extraite/cadastral) ; voisine → contour neutre.
function styleParcelle(m: PlancheParcelleMeta): { fill: string; stroke: string; fillOpacity: number } {
  if (!m.retenue) return { fill: 'var(--color-svv-muted)', stroke: 'var(--color-svv-muted)', fillOpacity: 0.06 }; // voisine : contour, à peine teintée
  if (m.origine === 'saisie') return { fill: 'var(--color-svv-green-ink)', stroke: 'var(--color-svv-green-ink)', fillOpacity: 0.3 };  // à la main
  if (m.origine === 'extraite') return { fill: 'var(--color-svv-blue)', stroke: 'var(--color-svv-blue)', fillOpacity: 0.3 };          // des pièces
  return { fill: 'var(--color-svv-ink)', stroke: 'var(--color-svv-ink)', fillOpacity: 0.22 };                                          // cadastral (rapprochement)
}

const LEGENDE: { cle: string; couleur: string; texte: string }[] = [
  { cle: 'saisie', couleur: 'var(--color-svv-green-ink)', texte: 'à la main' },
  { cle: 'extraite', couleur: 'var(--color-svv-blue)', texte: 'des pièces' },
  { cle: 'cadastral', couleur: 'var(--color-svv-ink)', texte: 'rapprochement cadastral' },
  { cle: 'voisine', couleur: 'var(--color-svv-muted)', texte: 'parcelle voisine (repère)' },
];

export function PlancheParcelles({ dossierId }: { dossierId: number }) {
  const [data, setData] = useState<PlancheData | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');

  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat('chargement'); // dans l'async (jamais synchrone dans le corps de l'effet → pas de rendu en cascade)
      try {
        const res = await fetch(`/api/admin/permis/planche?dossierId=${dossierId}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        const j = (await res.json()) as { planche: PlancheData };
        setData(j.planche); setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, [dossierId]);

  if (etat === 'chargement') return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement de la planche cadastrale…</div>;
  if (etat === 'erreur' || !data) return <div className="svv-card" role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Planche cadastrale indisponible.</div>;

  const { schema, meta } = data;
  // Retenues corrigées/saisies à la main → une ligne de PROVENANCE honnête (acteur nommé, ou valeur brute si non identifiable).
  const provenances = meta.filter((m) => m.retenue && m.origine === 'saisie');

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Planche cadastrale <span style={{ fontSize: 12, color: 'var(--color-svv-muted)', fontWeight: 400 }}>(lecture seule — parcelles du permis + voisines à {data.rayonM} m)</span></div>

      {data.motif ? (
        <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{data.motif}</div>
      ) : (
        <>
          {/* Schéma SVG maison (paths projetés par le module pur ; EPSG:2154 → boîte). Responsive : largeur fluide, jamais de débordement. */}
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} role="img"
              aria-label={`Planche cadastrale : ${data.nbRetenues} parcelle(s) du permis et ${data.nbVoisines} voisine(s)`}
              style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block', background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
              {/* Empreinte du permis en fond (repère discret) */}
              {schema.empreintePath && <path d={schema.empreintePath} fill="none" stroke="var(--color-svv-line)" strokeWidth={1.5} strokeDasharray="4 3" />}
              {/* Voisines d'abord (dessous), retenues ensuite (dessus) : lisibilité. L'ordre du schéma suit `meta`. */}
              {schema.polygones.map((p, i) => meta[i] && !meta[i].retenue ? (
                <path key={p.repere} d={p.path} fill={styleParcelle(meta[i]).fill} fillOpacity={styleParcelle(meta[i]).fillOpacity} stroke={styleParcelle(meta[i]).stroke} strokeWidth={0.6} />
              ) : null)}
              {schema.polygones.map((p, i) => meta[i] && meta[i].retenue ? (
                <path key={p.repere} d={p.path} fill={styleParcelle(meta[i]).fill} fillOpacity={styleParcelle(meta[i]).fillOpacity} stroke={styleParcelle(meta[i]).stroke} strokeWidth={1.4} />
              ) : null)}
              {/* Étiquettes section/numéro sur les RETENUES seulement (les voisines resteraient illisibles) */}
              {schema.polygones.map((p, i) => meta[i] && meta[i].retenue ? (
                <text key={`t-${p.repere}`} x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: 9, fontWeight: 700, fill: 'var(--color-svv-ink)', paintOrder: 'stroke', stroke: 'var(--color-svv-surface)', strokeWidth: 2.5 }}>
                  {meta[i].section} {meta[i].numero}
                </text>
              ) : null)}
            </svg>
          </div>

          {/* Légende (les MOTS portent le sens, la couleur en appui) */}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '.15rem .8rem', fontSize: 11, color: 'var(--color-svv-muted)' }}>
            {LEGENDE.map((l) => (
              <li key={l.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: l.couleur, opacity: l.cle === 'voisine' ? 0.4 : 0.6, border: `1px solid ${l.couleur}`, flexShrink: 0 }} />
                {l.texte}
              </li>
            ))}
          </ul>

          {/* PROVENANCE HONNÊTE des parcelles corrigées/saisies : l'ACTEUR (nom si admin, sinon valeur brute) + la date. Jamais « à la
              main » pour un harnais/CLI. Même règle que le bloc parcelles (cf. acteurParcelle). */}
          {provenances.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem', fontSize: 11 }}>
              {provenances.map((m, i) => {
                const d = descriptionActeurParcelle(m);
                return (
                  <li key={`${m.section}-${m.numero}-${i}`} style={{ color: 'var(--color-svv-muted)' }}>
                    <strong style={{ color: 'var(--color-svv-ink)' }}>Section {m.section} n° {m.numero}</strong>{' '}
                    {d.aLaMain
                      ? <>rattachée à la main par <strong style={{ color: 'var(--color-svv-ink)' }}>{d.qui}</strong></>
                      : <>référence corrigée par <strong style={{ color: 'var(--color-svv-ink)' }}>{d.qui}</strong> <span style={{ fontStyle: 'italic' }}>(pas un geste manuel identifié)</span></>}
                    {d.quand ? <> le {d.quand}</> : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p style={{ margin: 0, fontSize: 11, color: 'var(--color-svv-muted)' }}>{data.nbRetenues} parcelle(s) du permis · {data.nbVoisines} voisine(s) dessinée(s). Repère seulement — aucune mesure.</p>
        </>
      )}
    </div>
  );
}
