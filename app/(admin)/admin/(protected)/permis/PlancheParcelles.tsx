'use client';

import { useEffect, useState } from 'react';
import type { PlancheParcelles as PlancheData, PlancheParcelleMeta, CentreMode } from '../../../../lib/permis/plancheParcellesRepo';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle';
import { LiseusePieces } from './LiseusePieces'; // LOT 90 — liseuse LECTURE SEULE autonome, RÉUTILISÉE (jamais dupliquée)

/**
 * PL-A/PL-B — PLANCHE CADASTRALE (LECTURE SEULE). Parcelles du permis (colorées par ORIGINE) + voisines (contour neutre) dans un
 * rayon RÉGLABLE, dessinées par le schéma SVG maison (module pur `affectationSchema`, EPSG:2154 — aucune tuile). Organisée comme
 * « Bâtiments et projection » : LISEUSE à gauche, planche à droite (comparer un plan au cadastre). Chargée AU DÉPLIAGE (PERF-1).
 * AUCUNE écriture (le clic ajouter/retirer et la validation sont le lot PL-C). La légende NOMME L'ACTEUR d'une parcelle corrigée/
 * saisie sans mentir sur « à la main ». SURVOL → nom (title) ; TAP/CLIC/CLAVIER → détail (l'écran reste utilisable au doigt).
 */

const RAYON_MIN = 50, RAYON_MAX = 200, RAYON_PAS = 50; // stops mesurés (50/100/150/200) ; défaut 50
const SEUIL_DENSE = 250; // au-delà de ~250 parcelles dessinées, la planche devient un « nuage » → alerte de lisibilité honnête

// Couleur d'une parcelle : retenue → par origine ; voisine → contour neutre.
function styleParcelle(m: PlancheParcelleMeta): { fill: string; stroke: string; fillOpacity: number } {
  if (!m.retenue) return { fill: 'var(--color-svv-muted)', stroke: 'var(--color-svv-muted)', fillOpacity: 0.06 };
  if (m.origine === 'saisie') return { fill: 'var(--color-svv-green-ink)', stroke: 'var(--color-svv-green-ink)', fillOpacity: 0.3 };
  if (m.origine === 'extraite') return { fill: 'var(--color-svv-blue)', stroke: 'var(--color-svv-blue)', fillOpacity: 0.3 };
  return { fill: 'var(--color-svv-ink)', stroke: 'var(--color-svv-ink)', fillOpacity: 0.22 };
}

// Texte d'identification d'une parcelle (survol/détail). Pour une retenue : ce qu'on sait déjà (origine, acteur, date).
function texteParcelle(m: PlancheParcelleMeta): string {
  const base = `Section ${m.section} n° ${m.numero}`;
  if (!m.retenue) return `${base} — voisine`;
  if (m.origine === 'saisie') {
    const d = descriptionActeurParcelle(m);
    return `${base} — ${d.aLaMain ? `à la main par ${d.qui}` : `corrigée par ${d.qui}`}${d.quand ? ` le ${d.quand}` : ''}`;
  }
  return `${base} — ${m.origine === 'extraite' ? 'des pièces' : 'rapprochement cadastral'}`;
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
  const [rayon, setRayon] = useState(RAYON_MIN);
  const [mode, setMode] = useState<CentreMode>('empreinte');
  const [idu, setIdu] = useState<string | null>(null);          // parcelle de centrage (mode 'parcelle')
  const [selection, setSelection] = useState<number | null>(null); // index sélectionné (tap/clic/clavier)

  useEffect(() => {
    let annule = false;
    void (async () => {
      setEtat('chargement');
      try {
        const q = new URLSearchParams({ dossierId: String(dossierId), rayon: String(rayon), centre: mode });
        if (mode === 'parcelle' && idu) q.set('idu', idu);
        const res = await fetch(`/api/admin/permis/planche?${q.toString()}`, { cache: 'no-store' });
        if (annule) return;
        if (!res.ok) { setEtat('erreur'); return; }
        const j = (await res.json()) as { planche: PlancheData };
        setData(j.planche); setSelection(null); setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, [dossierId, rayon, mode, idu]);

  // Changement de mode : « parcelle » sans choix → on prend la 1re parcelle du permis (jamais un repli muet sur l'empreinte).
  const changerMode = (m: CentreMode) => {
    setMode(m);
    if (m === 'parcelle') setIdu((prev) => prev ?? data?.parcellesChoix[0]?.idu ?? null);
  };

  const styleCarte = { display: 'flex', flexDirection: 'column' as const, gap: '.5rem' };
  const enTete = (
    <div style={{ fontWeight: 700, fontSize: 13 }}>Planche cadastrale <span style={{ fontSize: 12, color: 'var(--color-svv-muted)', fontWeight: 400 }}>(lecture seule — comparer un plan au cadastre)</span></div>
  );

  if (etat === 'chargement' && !data) return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement de la planche cadastrale…</div>;
  if (etat === 'erreur' || !data) return <div className="svv-card" role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Planche cadastrale indisponible.</div>;

  const { schema, meta } = data;
  const provenances = meta.filter((m) => m.retenue && m.origine === 'saisie');
  const sel = selection !== null ? meta[selection] ?? null : null;
  const btn = (actif: boolean): React.CSSProperties => ({ cursor: 'pointer', border: `1px solid ${actif ? 'var(--color-svv-ink)' : 'var(--color-svv-line)'}`, borderRadius: '.4rem', background: actif ? 'var(--color-svv-field)' : 'var(--color-svv-surface)', color: 'var(--color-svv-ink)', padding: '.2rem .55rem', fontSize: 12, fontWeight: actif ? 700 : 400 });

  return (
    <div className="svv-card" style={styleCarte}>
      {enTete}
      {/* Organisation « Bâtiments et projection » : liseuse à gauche, planche à droite. Responsive : stack sous ~560 px (mobile-first). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.8rem', alignItems: 'start' }}>
        {/* GAUCHE — LISEUSE réutilisée (jamais dupliquée) */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--color-svv-muted)', marginBottom: '.3rem' }}>Documents du permis</div>
          <LiseusePieces dossierId={dossierId} />
        </div>

        {/* DROITE — contrôles + planche */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
          {/* CENTRAGE : empreinte (défaut) / parcelle / adresse */}
          <div role="group" aria-label="Centrage de la planche" style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Centrer :</span>
            <button type="button" style={btn(mode === 'empreinte')} aria-pressed={mode === 'empreinte'} onClick={() => changerMode('empreinte')}>Parcelles du permis</button>
            <button type="button" style={btn(mode === 'parcelle')} aria-pressed={mode === 'parcelle'} onClick={() => changerMode('parcelle')} disabled={data.parcellesChoix.length === 0}>Une parcelle</button>
            <button type="button" style={btn(mode === 'adresse')} aria-pressed={mode === 'adresse'} onClick={() => changerMode('adresse')}>Adresse du permis</button>
            {mode === 'parcelle' && data.parcellesChoix.length > 0 && (
              <select aria-label="Parcelle de centrage" value={idu ?? ''} onChange={(e) => setIdu(e.target.value || null)}
                style={{ fontSize: 12, padding: '.15rem .3rem', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' }}>
                {data.parcellesChoix.map((p) => <option key={p.idu} value={p.idu}>Section {p.section} n° {p.numero}</option>)}
              </select>
            )}
          </div>
          {/* « on ne devine pas » : une adresse non résolue le DIT, et la planche reste sur l'empreinte. */}
          {data.centreAvertissement && (
            <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-red)' }}>⚠ {data.centreAvertissement}</div>
          )}

          {/* RAYON réglable 50→200 m */}
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor={`rayon-${dossierId}`} style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Voisines à</label>
            <input id={`rayon-${dossierId}`} type="range" min={RAYON_MIN} max={RAYON_MAX} step={RAYON_PAS} value={rayon}
              onChange={(e) => setRayon(Number(e.target.value))} style={{ flex: '1 1 120px', maxWidth: 200 }} />
            <strong style={{ fontSize: 12 }}>{data.rayonM} m</strong>
            <span style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>· {data.nbVoisines} voisine(s)</span>
          </div>
          {data.nbRetenues + data.nbVoisines > SEUIL_DENSE && (
            <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>Planche dense ({data.nbRetenues + data.nbVoisines} parcelles) — rapprochez le rayon pour lire les repères.</div>
          )}

          {data.motif ? (
            <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{data.motif}</div>
          ) : (
            <>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} role="img"
                  aria-label={`Planche cadastrale : ${data.nbRetenues} parcelle(s) du permis et ${data.nbVoisines} voisine(s)`}
                  style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block', background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
                  {schema.empreintePath && <path d={schema.empreintePath} fill="none" stroke="var(--color-svv-line)" strokeWidth={1.5} strokeDasharray="4 3" />}
                  {/* Voisines dessous : cliquables/tap au doigt (sélection) + survol (title). Hors tabulation (jusqu'à des centaines) — les RETENUES portent l'accès clavier. */}
                  {schema.polygones.map((p, i) => meta[i] && !meta[i].retenue ? (
                    <path key={p.repere} d={p.path} fill={styleParcelle(meta[i]).fill} fillOpacity={selection === i ? 0.25 : styleParcelle(meta[i]).fillOpacity} stroke={selection === i ? 'var(--color-svv-ink)' : styleParcelle(meta[i]).stroke} strokeWidth={selection === i ? 1.4 : 0.6}
                      style={{ cursor: 'pointer' }} onClick={() => setSelection(i)}><title>{texteParcelle(meta[i])}</title></path>
                  ) : null)}
                  {/* Retenues dessus : cliquables ET focusables au clavier (peu nombreuses) → survol + tap + clavier. */}
                  {schema.polygones.map((p, i) => meta[i] && meta[i].retenue ? (
                    <path key={p.repere} d={p.path} fill={styleParcelle(meta[i]).fill} fillOpacity={selection === i ? 0.5 : styleParcelle(meta[i]).fillOpacity} stroke={styleParcelle(meta[i]).stroke} strokeWidth={selection === i ? 2.4 : 1.4}
                      tabIndex={0} role="button" aria-label={texteParcelle(meta[i])} style={{ cursor: 'pointer' }}
                      onClick={() => setSelection(i)} onFocus={() => setSelection(i)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelection(i); } }}><title>{texteParcelle(meta[i])}</title></path>
                  ) : null)}
                  {/* Étiquettes section/numéro sur les RETENUES */}
                  {schema.polygones.map((p, i) => meta[i] && meta[i].retenue ? (
                    <text key={`t-${p.repere}`} x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central"
                      style={{ fontSize: 9, fontWeight: 700, fill: 'var(--color-svv-ink)', paintOrder: 'stroke', stroke: 'var(--color-svv-surface)', strokeWidth: 2.5, pointerEvents: 'none' }}>
                      {meta[i].section} {meta[i].numero}
                    </text>
                  ) : null)}
                  {/* Marqueur d'ADRESSE (mode adresse, géocodage réussi) : croix repère */}
                  {data.marqueurAdresse && (
                    <g pointerEvents="none">
                      <circle cx={data.marqueurAdresse.cx} cy={data.marqueurAdresse.cy} r={4.5} fill="none" stroke="var(--color-svv-red)" strokeWidth={1.6} />
                      <line x1={data.marqueurAdresse.cx - 7} y1={data.marqueurAdresse.cy} x2={data.marqueurAdresse.cx + 7} y2={data.marqueurAdresse.cy} stroke="var(--color-svv-red)" strokeWidth={1.2} />
                      <line x1={data.marqueurAdresse.cx} y1={data.marqueurAdresse.cy - 7} x2={data.marqueurAdresse.cx} y2={data.marqueurAdresse.cy + 7} stroke="var(--color-svv-red)" strokeWidth={1.2} />
                    </g>
                  )}
                </svg>
              </div>

              {/* Détail de la parcelle SÉLECTIONNÉE (tap/clic/clavier) — le survol seul (title) ne suffit pas au doigt. */}
              <div aria-live="polite" style={{ fontSize: 12, minHeight: '1.2em', color: 'var(--color-svv-ink)' }}>
                {sel ? <><strong>{texteParcelle(sel)}</strong>{sel.surfaceM2 !== null ? <span style={{ color: 'var(--color-svv-muted)' }}> · {sel.surfaceM2} m²</span> : null}{sel.idu ? <span style={{ color: 'var(--color-svv-muted)', fontFamily: 'var(--font-svv-mono, monospace)' }}> · {sel.idu}</span> : null}</>
                  : <span style={{ color: 'var(--color-svv-muted)' }}>Survolez, touchez ou sélectionnez au clavier une parcelle pour l’identifier.</span>}
              </div>

              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '.15rem .8rem', fontSize: 11, color: 'var(--color-svv-muted)' }}>
                {LEGENDE.map((l) => (
                  <li key={l.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: l.couleur, opacity: l.cle === 'voisine' ? 0.4 : 0.6, border: `1px solid ${l.couleur}`, flexShrink: 0 }} />
                    {l.texte}
                  </li>
                ))}
              </ul>

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
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-svv-muted)' }}>{data.nbRetenues} parcelle(s) du permis · {data.nbVoisines} voisine(s). Repère seulement — aucune mesure.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
