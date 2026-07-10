'use client';

import { type CSSProperties, type ReactNode } from 'react';
import {
  libelleMasque,
  partsVerdicts,
  entonnoirCumule,
  formatNombre,
  type Fenetre,
  type Grain,
  type Statistiques,
  type VentilationSure,
} from './affichage';

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
@media (prefers-reduced-motion: reduce){ .svv-stats *{transition:none!important;animation:none!important} }
`;

export function Carte({ titre, aide, badge, children }: { titre: string; aide?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--color-svv-ink)' }}>{titre}</h2>
        {badge}
      </div>
      {aide && <p style={{ margin: 0, fontSize: '.72rem', color: 'var(--color-svv-muted)' }}>{aide}</p>}
      {children}
    </div>
  );
}

/** Badge « source session_fin » : rappelle que la métrique n'apparaît qu'après compaction (cron). */
export function BadgeCompaction() {
  return (
    <span className="svv-label" title="Ces chiffres n’apparaissent qu’après le job de maintenance (cron).">
      après compaction
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
      <div style={{ gridColumn: '1 / -1', height: 8, background: 'var(--color-svv-field)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${valeur > 0 ? pct : 0}%`, height: '100%', background: couleur ?? 'var(--color-svv-ink)', borderRadius: 999, transition: 'width .2s ease' }} />
      </div>
    </div>
  );
}

function Kpi({ valeur, libelle }: { valeur: number; libelle: string }) {
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

export function TuileTrafic({ data }: { data: Statistiques }) {
  const max = Math.max(1, ...data.trafic.map((p) => p.visites));
  const total = data.trafic.reduce((a, p) => a + p.visites, 0);
  return (
    <Carte titre="Visites" aide="Sessions comptées (jamais des « visiteurs uniques »)." badge={<BadgeCompaction />}>
      <div style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>
        Total période : <strong style={{ color: 'var(--color-svv-ink)' }}>{formatNombre(total)}</strong>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
        {data.trafic.length === 0 ? (
          <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune visite compactée sur la période.</span>
        ) : (
          data.trafic.map((p) => <Barre key={p.bucket} label={p.bucket} valeur={p.visites} max={max} />)
        )}
      </div>
    </Carte>
  );
}

export function TuileAnalyses({ data }: { data: Statistiques }) {
  return (
    <Carte titre="Analyses" aide="Lancements et résultats produits (re-runs inclus).">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Kpi valeur={data.analyses.lancees} libelle="analyses lancées" />
        <Kpi valeur={data.analyses.resultats} libelle="résultats produits" />
      </div>
    </Carte>
  );
}

export function TuileVerdicts({ data }: { data: Statistiques }) {
  const { parts, echantillonFaible } = partsVerdicts(data.verdicts);
  const total = data.verdicts.total;
  return (
    <Carte titre="Verdicts" aide="Sur les analyses réalisées (échantillon auto-sélectionné : ne reflète pas le marché).">
      {total === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucun résultat sur la période.</span>
      ) : (
        <>
          {/* Barre proportionnelle SEULEMENT hors échantillon faible : sous N<30, une barre « deux tiers
              verts » se lirait comme un % (interdit SPEC §4) → on ne montre que les comptes bruts. */}
          {!echantillonFaible && (
            <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'var(--color-svv-field)' }} role="img" aria-label={`Répartition des ${total} verdicts`}>
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

export function TuileEntonnoir({ data }: { data: Statistiques }) {
  const funnel = entonnoirCumule(data.entonnoir);
  const max = Math.max(1, ...funnel.map((p) => p.atteinte_min));
  const total = funnel.length ? funnel[0].atteinte_min : 0;
  return (
    <Carte titre="Entonnoir" aide="Visites ayant atteint AU MOINS chaque étape (étape la plus loin atteinte)." badge={<BadgeCompaction />}>
      {total === 0 ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune session compactée sur la période.</span>
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

export function TuileCommunes({ data }: { data: Statistiques }) {
  const c = data.communes;
  const max = Math.max(1, ...c.visibles.map((x) => x.n));
  return (
    <Carte titre="Communes" aide={`Où des analyses ont été lancées (grain commune, anonymisé k=${data.k}). Jamais d’adresse ni de point.`}>
      {c.insuffisant ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>Données insuffisantes pour l’anonymat sur cette période.</span>
      ) : c.visibles.length === 0 && !c.masque ? (
        <span style={{ fontSize: '.8rem', color: 'var(--color-svv-muted)' }}>Aucune commune sur la période.</span>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
            {[...c.visibles].sort((a, b) => b.n - a.n).map((x) => (
              <Barre key={x.commune_insee} label={`Commune ${x.commune_insee}`} valeur={x.n} max={max} />
            ))}
          </div>
          <NoteMasque v={c} />
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

export function TuileProvenance({ data }: { data: Statistiques }) {
  const p = data.provenance;
  return (
    <Carte titre="Provenance" aide="Origine des visites (host référent absent/masqué = « Direct / inconnu »)." badge={<BadgeCompaction />}>
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
