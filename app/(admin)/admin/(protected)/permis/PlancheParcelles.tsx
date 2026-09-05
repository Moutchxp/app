'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlancheParcelles as PlancheData, PlancheParcelleMeta, CentreMode } from '../../../../lib/permis/plancheParcellesRepo';
import { descriptionActeurParcelle } from '../../../../lib/permis/acteurParcelle';
import { LiseusePieces } from './LiseusePieces'; // LOT 90 — liseuse LECTURE SEULE autonome, RÉUTILISÉE (jamais dupliquée)

/**
 * PL-A/B/C — PLANCHE CADASTRALE. Parcelles du permis + voisines dans un rayon RÉGLABLE, schéma SVG maison (module pur, EPSG:2154).
 * Liseuse à gauche, planche à droite. PL-C : CLIC = BASCULEMENT (la parcelle s'allume en VERT / se désélectionne) — état LOCAL, un
 * clic n'écrit RIEN ; « Valider la sélection » écrit la superposition (recalcule empreinte+bâti+projection) ; « Revenir à la
 * configuration d'origine » retire la sélection (retour à l'automatique) ; « Réinitialiser » remet la composition au défaut
 * automatique (local). L'état courant est DIT (automatique, ou validé par QUI et QUAND — provenance honnête de PL-A/B). Mobile-first.
 */

const RAYON_MIN = 50, RAYON_MAX = 200, RAYON_PAS = 50;
const SEUIL_DENSE = 250;

/** IDU des parcelles du permis (ensemble automatique par défaut) présentes sur la planche. */
function origineIdus(data: PlancheData): string[] {
  return data.meta.filter((m) => m.retenue && m.idu).map((m) => m.idu as string);
}

// Style d'une parcelle SELON la composition locale : dans la composition = VERT (allumée) ; parcelle du permis retirée = contour
//   pointillé (on voit qu'on l'a désélectionnée) ; voisine non sélectionnée = contour neutre.
function styleParcelle(m: PlancheParcelleMeta, dans: boolean): { fill: string; stroke: string; fillOpacity: number; dash?: string; width: number } {
  if (dans) return { fill: 'var(--color-svv-green-ink)', stroke: 'var(--color-svv-green-ink)', fillOpacity: 0.4, width: 1.6 };
  if (m.retenue) return { fill: 'none', stroke: 'var(--color-svv-ink)', fillOpacity: 0, dash: '3 2', width: 1.1 }; // parcelle du permis DÉSÉLECTIONNÉE
  return { fill: 'var(--color-svv-muted)', stroke: 'var(--color-svv-muted)', fillOpacity: 0.06, width: 0.6 };        // voisine
}

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
  { cle: 'selectionnee', couleur: 'var(--color-svv-green-ink)', texte: 'sélectionnée (dans la composition)' },
  { cle: 'retiree', couleur: 'var(--color-svv-ink)', texte: 'parcelle du permis retirée' },
  { cle: 'voisine', couleur: 'var(--color-svv-muted)', texte: 'voisine (repère)' },
];

export function PlancheParcelles({ dossierId }: { dossierId: number }) {
  const [data, setData] = useState<PlancheData | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'erreur' | 'ok'>('chargement');
  const [rayon, setRayon] = useState(RAYON_MIN);
  const [mode, setMode] = useState<CentreMode>('empreinte');
  const [idu, setIdu] = useState<string | null>(null);
  const [survol, setSurvol] = useState<{ x: number; y: number; texte: string } | null>(null);
  const [composition, setComposition] = useState<Set<string>>(new Set()); // PL-C — sélection LOCALE (basculement) ; un clic n'écrit rien
  const [prevSelKey, setPrevSelKey] = useState<string | null>(null);      // clé de RÉINITIALISATION de la composition (reset PENDANT le rendu, pas dans un effet)
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
        setData(j.planche); setEtat('ok');
      } catch { if (!annule) setEtat('erreur'); }
    })();
    return () => { annule = true; };
  }, [dossierId, rayon, mode, idu]);

  // Init/reset de la COMPOSITION locale, PENDANT LE RENDU (React idiome « ajuster l'état quand une clé change » ; pas d'effet →
  //   pas de rendu en cascade). Clé = dossier + état de VALIDATION (PAS le rayon) → changer le rayon/centrage NE perd PAS une
  //   composition en cours ; valider/retirer (la sélection change) réaligne bien la composition.
  const selKey = data ? `${dossierId}|${data.selection.active}|${data.selection.idus.join(',')}` : null;
  if (data && selKey !== prevSelKey) {
    setPrevSelKey(selKey);
    setComposition(new Set(data.selection.active ? data.selection.idus : origineIdus(data)));
  }

  const defautIdus = useMemo(() => (data ? origineIdus(data) : []), [data]);
  const compositionModifiee = useMemo(() => {
    const d = new Set(defautIdus);
    return d.size !== composition.size || [...composition].some((x) => !d.has(x));
  }, [composition, defautIdus]);

  const basculer = (id: string | null) => { if (!id) return; setComposition((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const reinitialiser = () => { setComposition(new Set(defautIdus)); setMsg(null); };

  const poster = async (action: 'valider' | 'retirer', idus?: string[]) => {
    setEnCours(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/permis/planche', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, dossierId, idus }) });
      if (res.status === 401) { setMsg('Session expirée — reconnectez-vous.'); return; }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string; planche?: PlancheData };
      if (!res.ok || !j.ok || !j.planche) { setMsg(j.erreur ?? 'action impossible, réessayez.'); return; }
      setData(j.planche); // la composition se réaligne via l'effet (selKey change)
      setMsg(action === 'valider' ? 'Sélection validée — empreinte, bâti et projection recalculés.' : 'Retour à la configuration automatique.');
    } catch { setMsg('action impossible (réseau).'); } finally { setEnCours(false); }
  };

  const changerMode = (m: CentreMode) => { setMode(m); if (m === 'parcelle') setIdu((prev) => prev ?? data?.parcellesChoix[0]?.idu ?? null); };

  if (etat === 'chargement' && !data) return <div className="svv-card" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }} aria-live="polite">Chargement de la planche cadastrale…</div>;
  if (etat === 'erreur' || !data) return <div className="svv-card" role="alert" style={{ fontSize: 12, color: 'var(--color-svv-red)' }}>Planche cadastrale indisponible.</div>;

  const { schema, meta } = data;
  const btn = (actif: boolean): React.CSSProperties => ({ cursor: 'pointer', border: `1px solid ${actif ? 'var(--color-svv-ink)' : 'var(--color-svv-line)'}`, borderRadius: '.4rem', background: actif ? 'var(--color-svv-field)' : 'var(--color-svv-surface)', color: 'var(--color-svv-ink)', padding: '.2rem .55rem', fontSize: 12, fontWeight: actif ? 700 : 400 });
  const btnAction: React.CSSProperties = { cursor: 'pointer', minHeight: 40, padding: '.4rem .7rem', borderRadius: '.45rem', fontSize: 13, fontWeight: 600, border: '1px solid var(--color-svv-line)' };
  const focusable = (m: PlancheParcelleMeta) => m.retenue || (m.idu ? composition.has(m.idu) : false); // parcelles ACTIONNABLES au clavier
  const provenanceSel = descriptionActeurParcelle({ majPar: data.selection.validePar, majLe: data.selection.valideLe, acteurNom: data.selection.acteurNom });

  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>Planche cadastrale <span style={{ fontSize: 12, color: 'var(--color-svv-muted)', fontWeight: 400 }}>(cliquez une parcelle pour la sélectionner ; validez pour l’appliquer)</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '.8rem', alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--color-svv-muted)', marginBottom: '.3rem' }}>Documents du permis</div>
          <LiseusePieces dossierId={dossierId} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', minWidth: 0 }}>
          {/* CENTRAGE */}
          <div role="group" aria-label="Centrage de la planche" style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Centrer :</span>
            <button type="button" style={btn(mode === 'empreinte')} aria-pressed={mode === 'empreinte'} onClick={() => changerMode('empreinte')}>Toutes les parcelles</button>
            <button type="button" style={btn(mode === 'parcelle')} aria-pressed={mode === 'parcelle'} onClick={() => changerMode('parcelle')}
              disabled={data.parcellesChoix.length <= 1} title={data.parcellesChoix.length <= 1 ? 'ce permis n’a qu’une parcelle : identique à « Toutes les parcelles »' : undefined}>Centrer sur une parcelle</button>
            <button type="button" style={btn(mode === 'adresse')} aria-pressed={mode === 'adresse'} onClick={() => changerMode('adresse')}>Centrer sur l’adresse</button>
            {mode === 'parcelle' && data.parcellesChoix.length > 0 && (
              <select aria-label="Parcelle de centrage" value={idu ?? ''} onChange={(e) => setIdu(e.target.value || null)} style={{ fontSize: 12, padding: '.15rem .3rem', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' }}>
                {data.parcellesChoix.map((p) => <option key={p.idu} value={p.idu}>Section {p.section} n° {p.numero}</option>)}
              </select>
            )}
          </div>
          {data.centreAvertissement && <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-red)' }}>⚠ {data.centreAvertissement}</div>}

          {/* RAYON */}
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor={`rayon-${dossierId}`} style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>Voisines à</label>
            <input id={`rayon-${dossierId}`} type="range" min={RAYON_MIN} max={RAYON_MAX} step={RAYON_PAS} value={rayon} onChange={(e) => setRayon(Number(e.target.value))} style={{ flex: '1 1 120px', maxWidth: 200 }} />
            <strong style={{ fontSize: 12 }}>{data.rayonM} m</strong>
            <span style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>· {data.nbVoisines} voisine(s)</span>
          </div>
          {data.nbRetenues + data.nbVoisines > SEUIL_DENSE && <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-muted)' }}>Planche dense ({data.nbRetenues + data.nbVoisines} parcelles) — rapprochez le rayon pour lire les repères.</div>}

          {data.motif ? (
            <div role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)' }}>{data.motif}</div>
          ) : (
            <>
              <div style={{ width: '100%', overflowX: 'auto' }}>
                <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} role="img"
                  aria-label={`Planche cadastrale : ${composition.size} parcelle(s) sélectionnée(s) sur ${data.nbRetenues} du permis, ${data.nbVoisines} voisine(s)`}
                  style={{ width: '100%', maxWidth: 520, height: 'auto', display: 'block', background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
                  {schema.empreintePath && <path d={schema.empreintePath} fill="none" stroke="var(--color-svv-line)" strokeWidth={1.5} strokeDasharray="4 3" />}
                  {schema.polygones.map((p, i) => { const m = meta[i]; if (!m) return null;
                    const id = m.idu; const dans = id ? composition.has(id) : false; const s = styleParcelle(m, dans);
                    return (
                      <path key={p.repere} d={p.path} fill={s.fill} fillOpacity={s.fillOpacity} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash}
                        role="button" aria-pressed={dans} aria-label={`${texteParcelle(m)} — ${dans ? 'sélectionnée' : 'non sélectionnée'}`}
                        tabIndex={focusable(m) ? 0 : -1} style={{ cursor: 'pointer' }}
                        onClick={() => basculer(id)} onFocus={() => id && setSurvol(null)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(id); } }}
                        onMouseMove={(e) => setSurvol({ x: e.clientX, y: e.clientY, texte: texteParcelle(m) })} onMouseLeave={() => setSurvol(null)}>
                        <title>{texteParcelle(m)}</title>
                      </path>
                    );
                  })}
                  {schema.polygones.map((p, i) => meta[i] && meta[i].retenue ? (
                    <text key={`t-${p.repere}`} x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 9, fontWeight: 700, fill: 'var(--color-svv-ink)', paintOrder: 'stroke', stroke: 'var(--color-svv-surface)', strokeWidth: 2.5, pointerEvents: 'none' }}>{meta[i].section} {meta[i].numero}</text>
                  ) : null)}
                  {data.marqueurAdresse && (
                    <g pointerEvents="none">
                      <circle cx={data.marqueurAdresse.cx} cy={data.marqueurAdresse.cy} r={4.5} fill="none" stroke="var(--color-svv-red)" strokeWidth={1.6} />
                      <line x1={data.marqueurAdresse.cx - 7} y1={data.marqueurAdresse.cy} x2={data.marqueurAdresse.cx + 7} y2={data.marqueurAdresse.cy} stroke="var(--color-svv-red)" strokeWidth={1.2} />
                      <line x1={data.marqueurAdresse.cx} y1={data.marqueurAdresse.cy - 7} x2={data.marqueurAdresse.cx} y2={data.marqueurAdresse.cy + 7} stroke="var(--color-svv-red)" strokeWidth={1.2} />
                    </g>
                  )}
                </svg>
              </div>

              {/* ── PL-C : ÉTAT COURANT + COMPOSITION + ACTIONS ─────────────────────────────────────────────────────────────── */}
              <div style={{ borderTop: '1px solid var(--color-svv-line)', paddingTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {/* État courant : DIT clairement automatique vs validé par QUI et QUAND (provenance honnête). */}
                <div aria-live="polite" style={{ fontSize: 12 }}>
                  {data.selection.active
                    ? <><strong style={{ color: 'var(--color-svv-green-ink)' }}>Sélection validée</strong> {provenanceSel.aLaMain ? <>par <strong>{provenanceSel.qui}</strong></> : <>par <strong>{provenanceSel.qui}</strong> <span style={{ fontStyle: 'italic', color: 'var(--color-svv-muted)' }}>(auteur non identifié)</span></>}{provenanceSel.quand ? <> le {provenanceSel.quand}</> : null}<span style={{ color: 'var(--color-svv-muted)' }}> — {data.selection.idus.length} parcelle(s).</span></>
                    : <span style={{ color: 'var(--color-svv-muted)' }}><strong style={{ color: 'var(--color-svv-ink)' }}>Configuration automatique</strong> (préparée par l’analyse). Le passage par la planche n’est pas obligatoire.</span>}
                </div>
                <div style={{ fontSize: 12 }}><strong>{composition.size}</strong> parcelle(s) dans la composition{compositionModifiee ? <span style={{ color: 'var(--color-svv-muted)' }}> (modifiée — non validée)</span> : null}</div>

                <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  <button type="button" className="svv-btn svv-btn-primary" style={btnAction} disabled={enCours || composition.size === 0}
                    onClick={() => void poster('valider', [...composition])}>Valider la sélection</button>
                  {compositionModifiee && <button type="button" style={{ ...btnAction, background: 'var(--color-svv-field)' }} disabled={enCours} onClick={reinitialiser}>Réinitialiser à la sélection par défaut</button>}
                  {data.selection.active && <button type="button" style={{ ...btnAction, background: 'var(--color-svv-field)' }} disabled={enCours} onClick={() => void poster('retirer')}>Revenir à la configuration d’origine</button>}
                </div>

                {/* Geste DÉLIBÉRÉ : on DIT ce qui va se recalculer (jamais un clic anodin). */}
                <div style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>⚠ « Valider » recalcule l’empreinte, la photo du bâti et la projection de ce permis. Réversible : « Revenir à la configuration d’origine » restaure l’état automatique à l’identique.</div>
                {composition.size === 0 && <div role="note" style={{ fontSize: 11.5, color: 'var(--color-svv-red)' }}>Sélectionnez au moins une parcelle : une empreinte vide n’est pas validable.</div>}
                {msg && <div role="status" style={{ fontSize: 12, color: msg.startsWith('Session') || msg.includes('impossible') ? 'var(--color-svv-red)' : 'var(--color-svv-green-ink)' }}>{msg}</div>}
              </div>

              {/* Identité de la parcelle survolée (le survol seul, instantané ci-dessous, + une ligne stable au doigt). */}
              <div aria-live="polite" style={{ fontSize: 12, minHeight: '1.2em', color: 'var(--color-svv-muted)' }}>{survol ? survol.texte : 'Survolez ou touchez une parcelle pour l’identifier ; cliquez pour la (dé)sélectionner.'}</div>

              {/* OÙ L'ON EST */}
              <div style={{ fontSize: 12, color: 'var(--color-svv-ink)', borderTop: '1px solid var(--color-svv-line)', paddingTop: '.35rem' }}>
                <span aria-hidden>📍 </span><strong>{data.localisation.feuilleLibelle}</strong>
                {data.localisation.communeNom === null && data.localisation.communeCode ? <span style={{ color: 'var(--color-svv-red)' }}> — commune {data.localisation.communeCode} non résolue en base</span> : null}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-svv-muted)' }}>{data.localisation.feuilleNote}</span>
              </div>

              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '.15rem .8rem', fontSize: 11, color: 'var(--color-svv-muted)' }}>
                {LEGENDE.map((l) => (
                  <li key={l.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
                    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: l.cle === 'retiree' ? 'transparent' : l.couleur, opacity: l.cle === 'voisine' ? 0.4 : 0.6, border: `1px ${l.cle === 'retiree' ? 'dashed' : 'solid'} ${l.couleur}`, flexShrink: 0 }} />
                    {l.texte}
                  </li>
                ))}
              </ul>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--color-svv-muted)' }}>{data.nbRetenues} parcelle(s) du permis · {data.nbVoisines} voisine(s). Repère seulement — aucune mesure.</p>
            </>
          )}
        </div>
      </div>
      {survol && (
        <div role="status" aria-hidden style={{ position: 'fixed', left: survol.x + 12, top: survol.y + 12, zIndex: 50, pointerEvents: 'none', background: 'var(--color-svv-ink)', color: 'var(--color-svv-surface)', fontSize: 11, padding: '.15rem .4rem', borderRadius: '.3rem', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}>{survol.texte}</div>
      )}
    </div>
  );
}
