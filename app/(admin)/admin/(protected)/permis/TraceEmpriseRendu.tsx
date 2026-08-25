import type { CSSProperties } from 'react';
import {
  projeterDansBoite, type Boite, type PointLambert, type VerdictCalage, type VerdictVraisemblance,
} from '../../../../lib/permis/calageEmprise';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';

/**
 * PROJ-2 — RENDU PUR (aucun état, aucun effet → testable en Node via renderToStaticMarkup) de l'écran de tracé d'emprise.
 * Tout ce qui décide (similitude, aire, résidu, vraisemblance) vit dans le module pur `calageEmprise` ; ici on AFFICHE.
 * 🔴 Chaque emprise est étiquetée « reconstitution » avec son résidu de calage — jamais présentée comme une mesure.
 */

const muted: CSSProperties = { color: 'var(--color-svv-muted)', fontSize: 13 };
const carte: CSSProperties = { border: '1px solid var(--color-svv-line)', borderRadius: '.5rem', padding: '.6rem .8rem', background: '#fff' };

/** Nombre en français, sans arrondi trompeur d'un calcul (arrondi d'AFFICHAGE seulement). */
export function fmtM2(x: number): string { return `${Math.round(x).toLocaleString('fr-FR')} m²`; }
export function fmtM(x: number): string { return `${x.toFixed(2).replace('.', ',')} m`; }

/**
 * Bandeau de CALAGE : résidu de fit, échelle implicite (« 1:R ») vs déclarée, résidu d'échelle, et le verdict « douteux »
 * avec ses raisons — TOUJOURS affiché, jamais lissé. Sur 2 points le résidu de fit est nul par construction : on le DIT.
 */
export function BandeauCalage({ calage, nbPaires }: { calage: VerdictCalage | null; nbPaires: number }) {
  if (!calage) return <p style={muted}>Calage : posez 2 points (plan ↔ schéma) pour caler le tracé.</p>;
  return (
    <div style={{ ...carte, borderColor: calage.douteux ? 'var(--color-svv-red)' : 'var(--color-svv-line)' }} data-douteux={calage.douteux}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Calage {calage.douteux ? '⚠ douteux' : '✓'}</div>
      <ul style={{ ...muted, margin: 0, paddingLeft: '1.1rem' }}>
        <li>résidu de calage : <strong>{fmtM(calage.residuFitM)}</strong>{nbPaires <= 2 ? ' (calage exact sur 2 points — contrôlé par l’échelle déclarée ou un 3ᵉ repère)' : ''}</li>
        <li>échelle implicite : <strong>1:{Math.round(calage.ratioImplicite)}</strong>{calage.ratioDeclare !== null ? ` · déclarée 1:${Math.round(calage.ratioDeclare)}` : ' · échelle déclarée non saisie'}</li>
        {calage.residuEchelleM !== null && <li>écart d’échelle sur la base : <strong>{fmtM(calage.residuEchelleM)}</strong></li>}
        {calage.raisons.map((r) => <li key={r} style={{ color: 'var(--color-svv-red)' }}>{r}</li>)}
      </ul>
    </div>
  );
}

/** Bandeau de VRAISEMBLANCE : aire vive + comparaison plancher/étages + 🔴 dépassement du terrain (n'empêche pas d'enregistrer). */
export function BandeauVraisemblance({ aireM2, v }: { aireM2: number | null; v: VerdictVraisemblance | null }) {
  return (
    <div style={carte}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Aire {aireM2 !== null ? <strong>{fmtM2(aireM2)}</strong> : <span style={muted}>— (tracez un contour fermé)</span>}</div>
      {v && (
        <ul style={{ ...muted, margin: 0, paddingLeft: '1.1rem' }}>
          {v.messages.map((m) => <li key={m} style={m.startsWith('🔴') ? { color: 'var(--color-svv-red)', fontWeight: 600 } : undefined}>{m}</li>)}
          {v.messages.length === 0 && <li>aucun repère de vraisemblance en base (plancher / étages / terrain non renseignés).</li>}
        </ul>
      )}
    </div>
  );
}

/** Liste des emprises DÉJÀ tracées : libellé, surface, 🔴 étiquette « reconstitution », résidu de calage, effacement. */
export function ListeEmprises({ emprises, onSupprimer }: { emprises: EmpriseReconstruite[]; onSupprimer?: (id: number) => void }) {
  if (emprises.length === 0) return <p style={muted}>Aucune emprise reconstituée pour ce dossier.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {emprises.map((e) => (
        <li key={e.id} style={{ ...carte, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.6rem' }}>
          <span>
            <strong>{e.libelle}</strong>{' '}
            <span style={{ ...muted, border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', padding: '0 .3rem' }}>reconstitution</span>{' '}
            {e.surfaceM2 !== null ? fmtM2(e.surfaceM2) : ''}{' '}
            <span style={muted}>· résidu {e.residuM !== null ? fmtM(e.residuM) : '—'}{e.page !== null ? ` · page ${e.page}` : ''}</span>
          </span>
          {onSupprimer && <button type="button" onClick={() => onSupprimer(e.id)} style={{ ...muted, cursor: 'pointer', border: '1px solid var(--color-svv-line)', borderRadius: '.3rem', background: 'var(--color-svv-field)', padding: '.15rem .5rem' }}>effacer</button>}
        </li>
      ))}
    </ul>
  );
}

/**
 * SCHÉMA de la PARCELLE (pur, SVG) : la parcelle en fond, les emprises reconstituées remplies + étiquetées, et — pendant le
 * calage — les points Lambert désignés. Projection Lambert→boîte PARTAGÉE (`projeterDansBoite`) : ce qui est dessiné ici est
 * exactement ce sur quoi Arno CLIQUE (l'inverse vit dans le module pur). `motif` explicite si la parcelle est absente.
 */
export function SchemaParcelleTrace({ boite, parcelle, emprises, calageLambert, onCliquer }: {
  boite: Boite | null; parcelle: PointLambert[][]; emprises: EmpriseReconstruite[]; calageLambert: PointLambert[]; onCliquer?: (px: { x: number; y: number }) => void;
}) {
  if (!boite || parcelle.length === 0) return <p style={muted}>Parcelle du permis absente : schéma non dessiné (aucun point fiable).</p>;
  const path = (anneau: PointLambert[]) => anneau.map((p, i) => { const q = projeterDansBoite(boite, p); return `${i === 0 ? 'M' : 'L'}${q.x.toFixed(1)},${q.y.toFixed(1)}`; }).join(' ') + ' Z';
  return (
    <svg width={boite.largeur} height={boite.hauteur} viewBox={`0 0 ${boite.largeur} ${boite.hauteur}`} role="img" aria-label="schéma de la parcelle et des emprises reconstituées"
      style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', background: '#fff', cursor: onCliquer ? 'crosshair' : 'default' }}
      onClick={onCliquer ? (ev) => { const r = (ev.target as SVGElement).ownerSVGElement?.getBoundingClientRect() ?? (ev.currentTarget as SVGSVGElement).getBoundingClientRect(); onCliquer({ x: ev.clientX - r.left, y: ev.clientY - r.top }); } : undefined}>
      {parcelle.map((a, i) => <path key={`p${i}`} d={path(a)} fill="none" stroke="var(--color-svv-ink)" strokeWidth={1.2} />)}
      {emprises.map((e) => e.anneau.length >= 3 && <path key={`e${e.id}`} d={path(e.anneau)} fill="rgba(163,4,2,.18)" stroke="var(--color-svv-red)" strokeWidth={1.4} data-emprise={e.id} />)}
      {calageLambert.map((p, i) => { const q = projeterDansBoite(boite, p); return <g key={`c${i}`}><circle cx={q.x} cy={q.y} r={4} fill="var(--color-svv-red)" /><text x={q.x + 6} y={q.y - 6} fontSize={11} fill="var(--color-svv-red)">{i + 1}</text></g>; })}
    </svg>
  );
}
