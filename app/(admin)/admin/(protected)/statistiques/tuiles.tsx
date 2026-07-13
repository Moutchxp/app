'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  libelleMasque,
  partsVerdicts,
  entonnoirCumule,
  formatNombre,
  maxSerie,
  coordsSerie,
  joindreGeo,
  filtrerCommunesClient,
  ratioPct,
  couleurDominant,
  LIBELLE_VERDICT,
  DEPARTEMENTS_IDF,
  type CleSerie,
  type Fenetre,
  type Grain,
  type Statistiques,
  type VentilationSure,
  type FiltreCommune,
  type RefCommunes,
  type FiltresGeo,
  type VerdictType,
} from './affichage';

// Carte chargée CÔTÉ CLIENT seulement (Leaflet accède à `window`). `ssr: false` → rien au SSR/1er rendu →
// aucun mismatch d'hydratation (même motif que app/MapSelector.tsx). Le chunk Leaflet ne charge qu'ici.
const CarteCommunes = dynamic(() => import('./CarteCommunes'), { ssr: false });

/**
 * M2 — LOT 5. Composants de PRÉSENTATION du tableau de bord (séparés de la page-coquille pour être
 * testables au rendu et pour qu'AJOUTER UNE MÉTRIQUE = ajouter une tuile ici, sans refonte). Purement
 * présentationnels : props → JSX. AUCUN bleu, focus rouge (feuille CSS_ECRAN), barres CSS sans dépendance.
 */

// Focus ROUGE (jamais l'anneau bleu par défaut), cibles ≥ 44px, animations coupées sous reduced-motion.
export const CSS_ECRAN = `
.svv-stats :is(button,input,select,a):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.svv-stats :is(button,input,select){min-height:44px}
.svv-stats .svv-label{color:var(--color-svv-muted)}
.svv-stats input[type=date]{accent-color:var(--color-svv-red)}
/* Trame grise sur le CONTENEUR de chaque bloc (cohérence admin : Pilotage, Années de construction).
   Scopé à .svv-stats → n'affecte pas .svv-card ailleurs. Les surfaces internes (graphe, carte, pistes)
   gardent un fond blanc pour ressortir sur le gris. */
.svv-stats .svv-card{background:var(--color-svv-field)}
@media (prefers-reduced-motion: reduce){ .svv-stats *{transition:none!important;animation:none!important} }
`;

export function Carte({
  titre,
  aide,
  badge,
  voile,
  children,
}: {
  titre: string;
  aide?: string;
  badge?: ReactNode;
  voile?: string; // Lot 6 : si présent, la tuile est « grisée » (non ventilable sous le filtre commune) + note
  children: ReactNode;
}) {
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>{titre}</h2>
        {badge}
      </div>
      {aide && <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>{aide}</p>}
      {voile ? (
        <>
          <p
            role="note"
            style={{ margin: 0, fontSize: '.72rem', color: 'var(--color-svv-muted)', fontStyle: 'italic', background: '#fff', border: '1px solid var(--color-svv-line)', borderRadius: 8, padding: '6px 8px' }}
          >
            {voile}
          </p>
          {/* Contenu GLOBAL, atténué : ces chiffres NE sont PAS filtrés par commune (la note l'explicite). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: 0.4, pointerEvents: 'none' }} aria-hidden>
            {children}
          </div>
        </>
      ) : (
        children
      )}
    </div>
  );
}

/** Badge « source session_fin » : rappelle que la métrique n'apparaît qu'après compaction (cron). */
export function BadgeCompaction() {
  return (
    <span className="svv-label" title="Ces chiffres n’apparaissent qu’après le traitement de maintenance quotidien.">
      après consolidation
    </span>
  );
}

/** Barre horizontale (piste + remplissage), largeur en %. Aucune dépendance, responsive, pas de bleu. */
export function Barre({ label, valeur, max, couleur }: { label: string; valeur: number; max: number; couleur?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((valeur / max) * 100)) : 0;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 8px', alignItems: 'center' }}>
      <span style={{ fontSize: '.8rem', color: 'var(--color-svv-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>{formatNombre(valeur)}</span>
      <div style={{ gridColumn: '1 / -1', height: 8, background: '#fff', border: '1px solid var(--color-svv-line)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${valeur > 0 ? pct : 0}%`, height: '100%', background: couleur ?? 'var(--color-svv-ink)', borderRadius: 999, transition: 'width .2s ease' }} />
      </div>
    </div>
  );
}

function Kpi({ valeur, libelle }: { valeur: number | null | undefined; libelle: string }) {
  // `valeur` peut arriver `undefined` sur un `data.analyses` d'une réponse périmée (skew de version) : `formatNombre`
  // retombe sur 0 — un KPI manquant affiche « 0 », il ne fait JAMAIS planter la page (pas d'error boundary ici).
  return (
    <div style={{ flex: '1 1 120px', minWidth: 0 }}>
      <div style={{ fontSize: '1.7rem', fontWeight: 800, color: 'var(--color-svv-ink)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{formatNombre(valeur)}</div>
      <div style={{ fontSize: '.78rem', color: 'var(--color-svv-muted)' }}>{libelle}</div>
    </div>
  );
}

/** Note de masquage / insuffisance (k-anonymat), affichée telle quelle — JAMAIS reconstituée. */
export function NoteMasque<T>({ v }: { v: VentilationSure<T> }) {
  const l = libelleMasque(v);
  if (!l) return null;
  return (
    <p style={{ margin: '2px 0 0', fontSize: '.72rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }} aria-label={`Masquage anonymat : ${l}`}>
      {l}
    </p>
  );
}

const COUL_VERDICT: Record<string, string> = {
  SANS_VIS_A_VIS: 'var(--color-svv-green)',
  VIS_A_VIS: 'var(--color-svv-red)',
  INDETERMINE: 'var(--color-svv-muted)',
};

export function TuileTrafic({ data, voile }: { data: Statistiques; voile?: string }) {
  const max = Math.max(1, ...data.trafic.map((p) => p.visites));
  const total = data.trafic.reduce((a, p) => a + p.visites, 0);
  return (
    <Carte titre="Visites" aide="Sessions comptées (jamais des « visiteurs uniques »)." badge={<BadgeCompaction />} voile={voile}>
      <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>
        Total période : <strong style={{ color: 'var(--color-svv-ink)' }}>{formatNombre(total)}</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {data.trafic.length === 0 ? (
          <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune visite consolidée sur la période.</span>
        ) : (
          data.trafic.map((p) => <Barre key={p.bucket} label={p.bucket} valeur={p.visites} max={max} />)
        )}
      </div>
    </Carte>
  );
}

/** Ratio en % ou « — » (division par zéro / dénominateur nul → jamais NaN). `ratioPct` garantit le null. */
function libelleRatio(num: number, denom: number): string {
  const r = ratioPct(num, denom);
  return r === null ? '—' : `${formatNombre(r)} %`;
}

export function TuileAnalyses({ data, voile }: { data: Statistiques; voile?: string }) {
  const a = data.analyses;
  // Dénominateur des ratios = VISITES de la période (session_fin, post-compaction). Global, jamais par commune.
  const totalVisites = data.trafic.reduce((s, p) => s + p.visites, 0);
  return (
    <Carte titre="Analyses" aide="Lancements, résultats et conversions (re-runs inclus). Chiffres GLOBAUX." voile={voile}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Kpi valeur={a.lancees} libelle="analyses lancées" />
        <Kpi valeur={a.resultats} libelle="résultats produits" />
        <Kpi valeur={a.certificats} libelle="certificats demandés" />
        <Kpi valeur={a.totalEstimations} libelle="estimations (total)" />
        <Kpi valeur={a.plusvalue} libelle="dont plus-value" />
        <Kpi valeur={a.estimationImmo} libelle="dont estimation immo" />
      </div>
      {/* RATIOS globaux (division d'affichage, garde ÷0 → « — »). Rapportés aux visites → n'ont de sens
          qu'après compaction (cron) : « — » tant qu'aucune visite n'est comptée sur la période. */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.82rem' }}>
        <span style={{ color: 'var(--color-svv-muted)' }}>
          Estimations / visites : <strong style={{ color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>{libelleRatio(a.totalEstimations, totalVisites)}</strong>
        </span>
        <span style={{ color: 'var(--color-svv-muted)' }}>
          Certificats / visites : <strong style={{ color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>{libelleRatio(a.certificats, totalVisites)}</strong>
        </span>
      </div>
      <p style={{ margin: 0, fontSize: '.68rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
        Ratios rapportés aux visites (après le traitement de maintenance quotidien) : « — » tant qu’aucune visite n’est comptée.
      </p>
    </Carte>
  );
}

export function TuileVerdicts({
  data,
  filtre,
  nomCommune,
  resultatsCommune,
  voile,
}: {
  data: Statistiques;
  filtre?: FiltreCommune | null; //   Lot 6 : présent → verdicts SCOPÉS à la commune (k re-passé serveur)
  nomCommune?: string;
  resultatsCommune?: number; //       total résultats de la commune (= son n dans communes.visibles, ≥ k, sûr)
  voile?: string; //                  filtre actif mais scope indisponible → note « chiffres globaux » (jamais muet)
}) {
  // Filtre carte actif → verdicts scopés à la commune (k-ventilé), JAMAIS les verdicts globaux recolorés.
  if (filtre) return <VerdictsCommune filtre={filtre} nom={nomCommune ?? filtre.commune} resultats={resultatsCommune} />;
  const { parts, echantillonFaible } = partsVerdicts(data.verdicts);
  const total = data.verdicts.total;
  return (
    <Carte titre="Verdicts" aide="Sur les analyses réalisées (échantillon auto-sélectionné : ne reflète pas le marché)." voile={voile}>
      {total === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucun résultat sur la période.</span>
      ) : (
        <>
          {/* Barre proportionnelle SEULEMENT hors échantillon faible : sous N<30, une barre « deux tiers
              verts » se lirait comme un % (interdit SPEC §4) → on ne montre que les comptes bruts. */}
          {!echantillonFaible && (
            <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: '#fff', border: '1px solid var(--color-svv-line)' }} role="img" aria-label={`Répartition des ${total} verdicts`}>
              {parts.map((p) => (
                <div key={p.cle} style={{ width: `${total > 0 ? (p.n / total) * 100 : 0}%`, background: COUL_VERDICT[p.cle] }} title={`${p.libelle} : ${p.n}`} />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {parts.map((p) => (
              <div key={p.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: COUL_VERDICT[p.cle], flexShrink: 0 }} aria-hidden />
                <span style={{ color: 'var(--color-svv-ink)', flex: 1 }}>{p.libelle}</span>
                <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatNombre(p.n)}{p.pct !== null ? ` · ${p.pct} %` : ''}
                </span>
              </div>
            ))}
          </div>
          {echantillonFaible && (
            <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
              Échantillon faible ({total} &lt; 30) — comptes bruts, pas de pourcentage.
            </p>
          )}
        </>
      )}
    </Carte>
  );
}

/** Verdicts d'UNE commune (filtre carte) : k-ventilé côté serveur → affiché tel quel, JAMAIS reconstitué. */
function VerdictsCommune({ filtre, nom, resultats }: { filtre: FiltreCommune; nom: string; resultats?: number }) {
  const v = filtre.verdicts;
  return (
    <Carte titre="Verdicts — commune" aide="Répartition scopée à la commune sélectionnée (re-passée en k côté serveur).">
      <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>
        {nom}
        {resultats != null ? (
          <>
            {' · '}
            <strong style={{ color: 'var(--color-svv-ink)' }}>{formatNombre(resultats)}</strong> résultats
          </>
        ) : null}
      </div>
      {v.insuffisant ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
          Détail par verdict : données insuffisantes pour l’anonymat sur cette commune.
        </span>
      ) : v.visibles.length === 0 && !v.masque ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucun résultat pour cette commune.</span>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {v.visibles.map((c) => (
              <div key={c.verdict} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: COUL_VERDICT[c.verdict], flexShrink: 0 }} aria-hidden />
                <span style={{ color: 'var(--color-svv-ink)', flex: 1 }}>{LIBELLE_VERDICT[c.verdict] ?? c.verdict}</span>
                <span style={{ fontWeight: 700, color: 'var(--color-svv-ink)', fontVariantNumeric: 'tabular-nums' }}>{formatNombre(c.n)}</span>
              </div>
            ))}
          </div>
          <NoteMasque v={v} />
        </>
      )}
    </Carte>
  );
}

// ── Lot 6 : série temporelle filtrable (SVG maison, 0 dépendance) ─────────────────────────────────────
const GROUPES_SERIE: { id: string; libelle: string; cles: { cle: CleSerie; couleur: string }[] }[] = [
  { id: 'visites', libelle: 'Visites', cles: [{ cle: 'visites', couleur: 'var(--color-svv-ink)' }] },
  { id: 'analyses', libelle: 'Analyses', cles: [{ cle: 'analysesLancees', couleur: 'var(--color-svv-muted)' }] },
  {
    id: 'verdicts',
    libelle: 'Verdicts',
    cles: [
      { cle: 'sans', couleur: 'var(--color-svv-green)' },
      { cle: 'vis', couleur: 'var(--color-svv-red)' },
      { cle: 'ind', couleur: 'var(--color-svv-muted)' },
    ],
  },
  // Conversions (Chantier A) — chips INDÉPENDANTES : chacune UNE courbe. « Total estimations » est déjà la
  // somme (plusvalue + estimation immo) calculée à la lecture → jamais une addition à l'écran (pas de triple compte).
  { id: 'certificat', libelle: 'Certificat', cles: [{ cle: 'certificats', couleur: 'var(--color-svv-ink)' }] },
  { id: 'plusvalue', libelle: 'Plus-value', cles: [{ cle: 'plusvalue', couleur: 'var(--color-svv-red)' }] },
  { id: 'estimation_immo', libelle: 'Estimation immo', cles: [{ cle: 'estimationImmo', couleur: 'var(--color-svv-muted)' }] },
  { id: 'total_estimations', libelle: 'Total estimations', cles: [{ cle: 'totalEstimations', couleur: 'var(--color-svv-green)' }] },
];
const SVG_W = 320;
const SVG_H = 120;
const SVG_PAD = 6;

/** Courbes { visites, analyses, verdicts(3) } dans le temps. GLOBALE (jamais scindée par commune). Chips de
 *  bascule (rouge contour = active). Aucune dépendance : polylignes SVG dérivées de `coordsSerie` (pur, testé). */
export function SerieTemporelle({ serie }: { serie: Statistiques['serie'] }) {
  const [actifs, setActifs] = useState<Set<string>>(() => new Set(['visites', 'analyses']));
  const basculer = (id: string) =>
    setActifs((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const groupesActifs = GROUPES_SERIE.filter((g) => actifs.has(g.id));
  const clesActives: CleSerie[] = groupesActifs.flatMap((g) => g.cles.map((c) => c.cle));
  const iw = SVG_W - SVG_PAD * 2;
  const ih = SVG_H - SVG_PAD * 2;
  const max = maxSerie(serie, clesActives.length ? clesActives : ['visites']);
  return (
    <Carte
      titre="Activité dans le temps"
      aide="Série GLOBALE (jamais scindée par commune). Visites : après le traitement de maintenance quotidien."
      badge={<BadgeCompaction />}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Courbes affichées">
        {GROUPES_SERIE.map((g) => {
          const on = actifs.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => basculer(g.id)}
              style={{
                minHeight: 44,
                padding: '0 12px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: '.76rem',
                fontWeight: 700,
                border: `1px solid ${on ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`,
                background: '#fff',
                color: on ? 'var(--color-svv-red)' : 'var(--color-svv-muted)',
              }}
            >
              {g.libelle}
            </button>
          );
        })}
      </div>
      {serie.length === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune activité consolidée sur la période.</span>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            width="100%"
            role="img"
            aria-label={`Série temporelle : ${groupesActifs.map((g) => g.libelle).join(', ') || 'aucune courbe'}`}
            style={{ display: 'block', background: '#fff', borderRadius: 8, height: 'auto' }}
          >
            {groupesActifs
              .flatMap((g) => g.cles)
              .map(({ cle, couleur }) => {
                const pts = coordsSerie(serie, cle, max, iw, ih);
                if (pts.length === 0) return null;
                const poly = pts.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
                return (
                  <g key={cle} transform={`translate(${SVG_PAD},${SVG_PAD})`}>
                    <polyline points={poly} fill="none" stroke={couleur} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {pts.map((c, i) => (
                      <circle key={i} cx={c.x} cy={c.y} r={1.8} fill={couleur} />
                    ))}
                  </g>
                );
              })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--color-svv-muted)' }}>
            <span>{serie[0].bucket}</span>
            <span>échelle Y max : {formatNombre(max)}</span>
            <span>{serie[serie.length - 1].bucket}</span>
          </div>
          {/* Honnêteté (constat R4) : échelle Y COMMUNE → une petite courbe (verdicts) mêlée à une grande
              (visites) s'aplatit. On le dit, et on invite à isoler une courbe pour la lire. */}
          <p style={{ margin: 0, fontSize: '.68rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
            Échelle Y commune à toutes les courbes — masque une courbe volumineuse pour agrandir les faibles volumes.
          </p>
        </>
      )}
    </Carte>
  );
}

export function TuileEntonnoir({ data, voile }: { data: Statistiques; voile?: string }) {
  const funnel = entonnoirCumule(data.entonnoir);
  const max = Math.max(1, ...funnel.map((p) => p.atteinte_min));
  const total = funnel.length ? funnel[0].atteinte_min : 0;
  return (
    <Carte titre="Entonnoir" aide="Visites ayant atteint AU MOINS chaque étape (étape la plus loin atteinte)." badge={<BadgeCompaction />} voile={voile}>
      {total === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune session consolidée sur la période.</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {funnel.map((p) => (
            <Barre key={p.etape} label={p.libelle} valeur={p.atteinte_min} max={max} couleur="var(--color-svv-red)" />
          ))}
        </div>
      )}
    </Carte>
  );
}

/** Chip de filtre (rouge plein quand actif, contour neutre sinon). Réutilise `stylePuce`. ≥44px, aucun bleu. */
function ChipFiltre({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={actif} onClick={onClick} style={stylePuce(actif)}>
      {children}
    </button>
  );
}

const styleSelect: CSSProperties = { minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-svv-line)', background: '#fff', color: 'var(--color-svv-ink)', fontSize: '.82rem' };

/** Légende des couleurs de bulle = verdict dominant k-safe (ou neutre). AUCUN bleu (tokens svv + gris clair neutre). */
function LegendeVerdict() {
  const items = [
    { c: couleurDominant('SANS_VIS_A_VIS'), l: 'Sans vis-à-vis domine' },
    { c: couleurDominant('VIS_A_VIS'), l: 'Vis-à-vis domine' },
    { c: couleurDominant('INDETERMINE'), l: 'Indéterminé domine' },
    { c: couleurDominant(null), l: 'Anonymisé (k)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '.68rem', color: 'var(--color-svv-muted)' }} aria-label="Légende des couleurs de bulle">
      {items.map((it) => (
        <span key={it.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: it.c, flexShrink: 0, border: '1px solid var(--color-svv-line)' }} aria-hidden />
          {it.l}
        </span>
      ))}
    </div>
  );
}

export function TuileCommunes({
  data,
  refGeo,
  selection,
  onToggle,
  onClear,
  reducedMotion,
  filtres,
  onFiltres,
}: {
  data: Statistiques;
  refGeo: RefCommunes | null; //                       référentiel cartographique (endpoint géo) — null si non chargé
  selection: string[]; //                               multi-sélection CLIENT (Set de communes ∈ c.visibles, déjà k-safe)
  onToggle: (insee: string) => void; //                bascule une commune dans/hors la sélection (aucune requête serveur)
  onClear: () => void; //                               vide la sélection
  reducedMotion: boolean;
  filtres: FiltresGeo; //                               Chantier B : filtre d'AFFICHAGE (verdict-dominant / dept), CLIENT
  onFiltres: (f: FiltresGeo) => void; //                changement → filtrage CLIENT du payload k-safe (AUCUN refetch)
}) {
  const c = data.communes;
  // Filtrage CLIENT (post-revue adverse) sur les communes DÉJÀ k-safe : verdict par DOMINANT (déjà anonymisé),
  // département par préfixe INSEE (générique, aucun département en dur). Ne requête rien, ne révèle rien de plus que
  // le payload → aucune différenciation inter-vues.
  const visiblesFiltrees = filtrerCommunesClient(c.visibles, filtres);
  const tri = [...visiblesFiltrees].sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...tri.map((x) => x.n));
  const geo = refGeo ? joindreGeo(tri, refGeo) : []; // ne trace QUE les visibles (k-safe) ayant un centroïde connu
  const nomDe = (insee: string) => refGeo?.[insee]?.nom ?? `Commune ${insee}`;
  const filtreActif = !!(filtres.verdict || filtres.departement);
  const set = (patch: Partial<FiltresGeo>) => onFiltres({ ...filtres, ...patch });
  // Recherche texte : PUR filtre d'AFFICHAGE de la liste (client), insensible casse/accents. N'interroge pas le
  // serveur et ne change pas l'éligibilité (la liste reste ⊂ c.visibles ≥ k) → jamais de commune sous le seuil.
  const [recherche, setRecherche] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(recherche.trim());
  const triAffiche = q === '' ? tri : tri.filter((x) => norm(nomDe(x.commune_insee)).includes(q));
  return (
    <Carte titre="Communes" aide={`Où des analyses ont abouti (résultats produits, grain commune, anonymisé k=${data.k}). Jamais d’adresse ni de point.`}>
      {/* Barre de filtres d'AFFICHAGE (Chantier B, post-revue) : appliqués CÔTÉ CLIENT au payload k-safe, aucun refetch. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="group" aria-label="Filtre par verdict dominant" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="svv-label" style={{ fontSize: '.72rem' }}>Verdict dominant</span>
          <ChipFiltre actif={!filtres.verdict} onClick={() => set({ verdict: null })}>Tous</ChipFiltre>
          <ChipFiltre actif={filtres.verdict === 'SANS_VIS_A_VIS'} onClick={() => set({ verdict: 'SANS_VIS_A_VIS' as VerdictType })}>Sans vis-à-vis</ChipFiltre>
          <ChipFiltre actif={filtres.verdict === 'VIS_A_VIS'} onClick={() => set({ verdict: 'VIS_A_VIS' as VerdictType })}>Vis-à-vis</ChipFiltre>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>
            Département
            <select value={filtres.departement ?? ''} onChange={(e) => set({ departement: e.target.value || null })} style={styleSelect}>
              <option value="">Tous</option>
              {DEPARTEMENTS_IDF.map((d) => <option key={d.code} value={d.code}>{d.nom}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>
            Rechercher une commune
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom de commune…"
              aria-label="Rechercher une commune dans la liste"
              style={styleSelect}
            />
          </label>
        </div>
      </div>

      {c.insuffisant ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
          Données insuffisantes pour l’anonymat sur cette période.
        </span>
      ) : c.visibles.length === 0 && !c.masque ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune commune sur la période.</span>
      ) : tri.length === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune commune ne correspond au filtre d’affichage (verdict dominant / département).</span>
      ) : (
        <>
          {geo.length > 0 && (
            <>
              <CarteCommunes communes={geo} selection={selection} onSelect={onToggle} reducedMotion={reducedMotion} />
              <LegendeVerdict />
              {/* Légende d'échelle (constat R4) : le rayon est un REPÈRE relatif (racine bornée), pas une mesure. */}
              <p style={{ margin: 0, fontSize: '.68rem', color: 'var(--color-svv-muted)' }}>
                Taille des bulles ∝ nombre de résultats (repère relatif ; comptes exacts dans la liste). Dézoomer montre
                une carte vide hors Île-de-France — normal, aucune donnée ailleurs.
              </p>
            </>
          )}
          {refGeo && geo.length < tri.length && (
            // Réconciliation carte/liste (constat R4) : une commune visible sans centroïde connu reste listée.
            <p style={{ margin: 0, fontSize: '.68rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
              {tri.length - geo.length} commune(s) sans localisation connue — dans la liste, absente(s) de la carte.
            </p>
          )}
          {/* Résumé de sélection (multi) : compte + désélection globale. La sélection est un Set CLIENT de communes
              déjà k-safe (aucune requête d'union serveur). */}
          {selection.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>
              <span>{selection.length} commune{selection.length > 1 ? 's' : ''} sélectionnée{selection.length > 1 ? 's' : ''}</span>
              <button type="button" onClick={onClear} style={{ minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-svv-red)', background: '#fff', color: 'var(--color-svv-red)', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
                Tout désélectionner
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {triAffiche.length === 0 ? (
              <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune commune ne correspond à la recherche.</span>
            ) : triAffiche.map((x) => {
              const actif = selection.includes(x.commune_insee);
              return (
                <button
                  key={x.commune_insee}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => onToggle(x.commune_insee)}
                  style={{
                    textAlign: 'left',
                    width: '100%',
                    minHeight: 44,
                    cursor: 'pointer',
                    border: `1px solid ${actif ? 'var(--color-svv-red)' : 'transparent'}`,
                    borderRadius: 8,
                    background: actif ? 'var(--color-svv-field)' : 'transparent',
                    padding: '4px 8px',
                  }}
                >
                  <Barre label={nomDe(x.commune_insee)} valeur={x.n} max={max} couleur={actif ? 'var(--color-svv-red)' : couleurDominant(x.dominant)} />
                </button>
              );
            })}
          </div>
          {/* Note de masquage (Chantier B) : COMPTE sans identité ni localisation, rouge contour, adaptée au filtre. */}
          {c.masque && (
            <p role="note" style={{ margin: '2px 0 0', fontSize: '.72rem', color: 'var(--color-svv-red)', fontStyle: 'italic', border: '1px solid var(--color-svv-red)', borderRadius: 8, padding: '4px 8px' }}>
              {c.masque.nbCellules} commune(s) masquée(s) sur la période — données insuffisantes pour l’anonymat (jamais nommées ni localisées).
            </p>
          )}
        </>
      )}
    </Carte>
  );
}

function ListeProvenance<T extends { n: number }>({ v, cle }: { v: VentilationSure<T>; cle: (t: T) => string }) {
  const max = Math.max(1, ...v.visibles.map((x) => x.n));
  if (v.insuffisant) return <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>Données insuffisantes pour l’anonymat.</span>;
  if (v.visibles.length === 0 && !v.masque) return <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune donnée.</span>;
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
        {[...v.visibles].sort((a, b) => b.n - a.n).map((x, i) => (
          <Barre key={i} label={cle(x)} valeur={x.n} max={max} />
        ))}
      </div>
      <NoteMasque v={v} />
    </>
  );
}

export function TuileProvenance({ data, voile }: { data: Statistiques; voile?: string }) {
  const p = data.provenance;
  return (
    <Carte titre="Provenance" aide="Origine des visites (host référent absent/masqué = « Direct / inconnu »)." badge={<BadgeCompaction />} voile={voile}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <div className="svv-label" style={{ marginBottom: 4 }}>Source / medium</div>
          <ListeProvenance v={p.par_source_medium} cle={(x) => `${x.source ?? 'Direct / inconnu'}${x.medium ? ' · ' + x.medium : ''}`} />
        </div>
        <div>
          <div className="svv-label" style={{ marginBottom: 4 }}>Site référent</div>
          <ListeProvenance v={p.par_referer} cle={(x) => x.referer_hote ?? 'Direct / inconnu'} />
        </div>
      </div>
    </Carte>
  );
}

const stylePuce = (actif: boolean): CSSProperties => ({
  padding: '0 12px',
  minHeight: 44,
  borderRadius: 10,
  border: `1px solid ${actif ? 'var(--color-svv-red)' : 'var(--color-svv-line)'}`,
  background: actif ? 'var(--color-svv-red)' : '#fff',
  color: actif ? '#fff' : 'var(--color-svv-ink)',
  fontWeight: 700,
  fontSize: '.82rem',
  cursor: 'pointer',
});

export function SelecteurFenetre({
  fenetre,
  onChange,
  presetFn,
}: {
  fenetre: Fenetre;
  onChange: (f: Fenetre) => void;
  presetFn: (nom: '7j' | '30j' | '90j', grain: Grain) => Fenetre;
}) {
  const styleDate: CSSProperties = { minHeight: 44, padding: '0 10px', borderRadius: 10, border: '1px solid var(--color-svv-line)', background: '#fff', color: 'var(--color-svv-ink)', fontSize: '.85rem' };
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Période rapide">
        <button type="button" style={stylePuce(false)} onClick={() => onChange(presetFn('7j', fenetre.grain))}>7 jours</button>
        <button type="button" style={stylePuce(false)} onClick={() => onChange(presetFn('30j', fenetre.grain))}>30 jours</button>
        <button type="button" style={stylePuce(false)} onClick={() => onChange(presetFn('90j', fenetre.grain))}>90 jours</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Granularité">
        {(['jour', 'semaine', 'mois'] as Grain[]).map((g) => (
          <button key={g} type="button" aria-pressed={fenetre.grain === g} style={stylePuce(fenetre.grain === g)} onClick={() => onChange({ ...fenetre, grain: g })}>
            {g === 'jour' ? 'Par jour' : g === 'semaine' ? 'Par semaine' : 'Par mois'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>
          Du
          <input type="date" value={fenetre.debut} max={fenetre.fin} style={styleDate} onChange={(e) => e.target.value && onChange({ ...fenetre, debut: e.target.value })} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>
          Au
          <input type="date" value={fenetre.fin} min={fenetre.debut} style={styleDate} onChange={(e) => e.target.value && onChange({ ...fenetre, fin: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

export function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="svv-card" style={{ textAlign: 'center', padding: '28px 16px' }}>
      <div style={{ fontWeight: 800, color: 'var(--color-svv-ink)', marginBottom: 4 }}>{titre}</div>
      <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--color-svv-muted)' }}>{texte}</p>
    </div>
  );
}
