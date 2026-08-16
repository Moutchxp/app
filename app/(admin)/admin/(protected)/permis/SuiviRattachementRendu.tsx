import type { CSSProperties } from 'react';
// ⚠️ Piège du bundle client : on n'importe d'un module serveur que des TYPES (jamais un runtime — rattachementSuiviRepo importe db/client).
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';

/**
 * FUS-3b — rendu PUR (testable via renderToStaticMarkup) du SUIVI de rattachement : le tableau récapitulatif groupé par état
 * (avec compteurs et ancienneté, tri par urgence), et le DÉTAIL d'un dossier (tableau comparatif « trois sources » + critères,
 * seuils/provenance, verdict/motif, millésimes). LECTURE SEULE : aucun bouton valider/refuser/injecter (FUS-3c). L'information
 * est portée par le TEXTE (la couleur n'est qu'un appui), cibles tactiles suffisantes, table dense scrollable sur mobile.
 *
 * ⚠️ « suivi, aucun signal » n'est PAS un état stocké : c'est l'absence de dossier (dérivé à l'affichage). À NE PAS confondre
 * avec le rattachement permis↔DEMANDE de `PermisRattachementRendu.tsx` (concept distinct).
 */

// Libellés + ordre d'affichage (= urgence). DÉCLARÉS ICI (client-safe), jamais importés du repo serveur.
export const LIBELLE_ETAT_SUIVI: Record<EtatSuivi, string> = {
  arbitrage_demande: 'arbitrage demandé',
  en_attente_bati: 'en attente de bâti',
  annule_par_lidar: 'annulé par LiDAR',
  valide: 'rattaché',
  refuse: 'refusé',
  suivi_aucun_signal: 'suivi, aucun signal',
};
export const ORDRE_AFFICHAGE_ETATS: readonly EtatSuivi[] = ['arbitrage_demande', 'en_attente_bati', 'annule_par_lidar', 'valide', 'refuse', 'suivi_aucun_signal'];

const styleAide: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)', lineHeight: 1.4 };

function fondEtat(etat: EtatSuivi): CSSProperties {
  if (etat === 'arbitrage_demande') return { background: 'var(--color-svv-red)', color: '#fff' };
  if (etat === 'en_attente_bati') return { background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' };
  if (etat === 'valide') return { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' };
  return { background: 'transparent', color: 'var(--color-svv-muted)' };
}

export function BadgeEtatSuivi({ etat }: { etat: EtatSuivi }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '.1rem .45rem', borderRadius: '.35rem', whiteSpace: 'nowrap', ...fondEtat(etat) }}>
      {LIBELLE_ETAT_SUIVI[etat]}
    </span>
  );
}

/** Phrase d'ancienneté selon l'état (« en attente depuis N j » vs « suivi depuis N j »). */
function ancienneteTexte(l: LigneSuivi): string {
  const j = l.joursAnciennete;
  const suffixe = j <= 1 ? "moins d'un jour" : `${j} jours`;
  if (l.etat === 'suivi_aucun_signal') return `suivi depuis ${suffixe}`;
  if (l.etat === 'arbitrage_demande' || l.etat === 'en_attente_bati') return `en attente depuis ${suffixe}`;
  return `depuis ${suffixe}`;
}

/** Tableau récapitulatif groupé par état, avec compteurs en tête et tri par urgence (les `lignes` arrivent déjà triées). */
export function TableSuivi({ lignes, compteurs, onOuvrir }: {
  lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number>; onOuvrir?: (dossierId: number) => void;
}) {
  if (lignes.length === 0) return <div className="svv-card" style={styleAide}>Aucun permis suivi (aucune parcelle analysée pour l’instant).</div>;
  return (
    <div className="flex flex-col gap-3">
      {/* Compteurs par état */}
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {ORDRE_AFFICHAGE_ETATS.filter((e) => compteurs[e] > 0).map((e) => (
          <span key={e} style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'baseline', fontSize: 12, padding: '.15rem .5rem', border: '1px solid var(--color-svv-line)', borderRadius: '.4rem' }}>
            <BadgeEtatSuivi etat={e} /><strong>{compteurs[e]}</strong>
          </span>
        ))}
      </div>
      {/* Groupes par état */}
      {ORDRE_AFFICHAGE_ETATS.filter((e) => compteurs[e] > 0).map((e) => (
        <div key={e} className="svv-card" role="group" aria-label={LIBELLE_ETAT_SUIVI[e]} style={{ padding: '.5rem' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: '.3rem' }}>{LIBELLE_ETAT_SUIVI[e]} <span style={{ color: 'var(--color-svv-muted)' }}>({compteurs[e]})</span></div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
            {lignes.filter((l) => l.etat === e).map((l) => (
              <li key={l.dossierId} style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap', paddingBottom: '.2rem', borderBottom: '1px solid var(--color-svv-line)' }}>
                <button type="button" className="svv-link" style={{ width: 'auto', padding: 0, fontFamily: 'var(--font-svv-mono, monospace)', fontWeight: 700 }}
                  onClick={() => onOuvrir?.(l.dossierId)}>{l.numDau}</button>
                <span style={{ color: 'var(--color-svv-muted)' }}>{l.commune ?? `INSEE ${l.codeInsee}`}</span>
                <span style={{ ...styleAide, marginLeft: 'auto' }}>
                  {l.derniereEvalIso ? `évalué le ${l.derniereEvalIso} · ` : ''}{ancienneteTexte(l)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ── Détail d'un dossier ──────────────────────────────────────────────────────
const thStyle: CSSProperties = { textAlign: 'left', padding: '.3rem .5rem', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--color-svv-muted)', borderBottom: '1px solid var(--color-svv-line)', whiteSpace: 'nowrap' };
const tdStyle: CSSProperties = { padding: '.3rem .5rem', fontSize: 12, verticalAlign: 'top', borderBottom: '1px solid var(--color-svv-line)' };

function cellule(c: { texte: string; presente: boolean }) {
  return <span style={{ color: c.presente ? 'var(--color-svv-ink)' : 'var(--color-svv-muted)', fontStyle: c.presente ? 'normal' : 'italic' }}>{c.texte}</span>;
}

const pct = (x: number): string => `${(x * 100).toFixed(1).replace(/\.0$/, '')} %`;

/**
 * FUS-3c — libellé du RÉGIME : un CONSTAT À DATE, jamais une prédiction. « sans fusion de parcelles » dit que les parcelles
 * d'origine sont encore au cadastre ; l'éventuelle « fusion attendue (N parcelles) » est une INFORMATION à côté, pas un verdict.
 */
export function libelleRegime(regime: string, nbParcellesOrigine: number): { constat: string; info: string | null } {
  if (regime === 'avec_fusion') return { constat: 'avec fusion de parcelles', info: null };
  if (regime === 'sans_fusion') return {
    constat: 'sans fusion de parcelles — les parcelles d’origine sont encore au cadastre (constat à date)',
    info: nbParcellesOrigine >= 2 ? `fusion de parcelles attendue (${nbParcellesOrigine} parcelles d’origine)` : null,
  };
  return { constat: 'régime indéterminé', info: null };
}

/** FUS-3c — URL Street View (pano) au point donné. Aucune clé API : la date de prise de vue est affichée par Google lui-même. */
export function lienStreetView(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

/** Détail comparatif « trois sources » + critères / seuils / verdict / millésimes + Street View. LECTURE SEULE. */
export function DetailSuiviRendu({ detail }: { detail: DetailSuivi }) {
  const c = detail.criteres;
  const reg = libelleRegime(detail.regime, detail.nbParcellesOrigine);
  return (
    <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{detail.numDau}</strong>
        <span style={{ color: 'var(--color-svv-muted)' }}>{detail.commune ?? `INSEE ${detail.codeInsee}`}</span>
        <BadgeEtatSuivi etat={detail.etat} />
        {!detail.persiste && <span style={styleAide}>(dérivé — aucun dossier en base)</span>}
      </div>

      {/* Verdict + motif + régime (constat à date) */}
      <div>
        <span style={{ color: 'var(--color-svv-muted)' }}>Verdict : </span><strong>{detail.verdict}</strong>
        <div style={styleAide}>{detail.motif}</div>
        <div><span style={{ color: 'var(--color-svv-muted)' }}>Régime : </span>{reg.constat}
          {reg.info && <span style={{ marginLeft: '.35rem', fontSize: 11, padding: '.05rem .35rem', borderRadius: '.3rem', background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)' }}>ℹ {reg.info}</span>}
        </div>
      </div>

      {/* Google Street View — sur le centroïde de l'empreinte, ou motif s'il n'y a pas de point fiable */}
      <div>
        {detail.streetView
          ? <>
              <a href={lienStreetView(detail.streetView.lat, detail.streetView.lng)} target="_blank" rel="noopener noreferrer" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }}>ouvrir Google Street View au droit de l’empreinte ↗</a>
              <div style={{ ...styleAide, color: 'var(--color-svv-red)' }}>⚠ VÉRIFIER LA DATE DE LA PRISE DE VUE (affichée par Google) : une image antérieure aux travaux ferait conclure à tort qu’ils n’ont pas eu lieu.</div>
            </>
          : <span style={styleAide}>Pas de lien Street View : {detail.streetViewMotif ?? 'point indisponible'}.</span>}
      </div>

      {/* Tableau comparatif « trois sources » — dense → scrollable horizontalement sur mobile */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
          <thead><tr><th style={thStyle}>Grandeur</th><th style={thStyle}>En base (permis)</th><th style={thStyle}>Cadastre</th><th style={thStyle}>BD TOPO</th></tr></thead>
          <tbody>
            {detail.comparatif.map((r) => (
              <tr key={r.intitule}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.intitule}</td>
                <td style={tdStyle}>{cellule(r.enBase)}</td>
                <td style={tdStyle}>{cellule(r.cadastre)}</td>
                <td style={tdStyle}>{cellule(r.bdTopo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Critères du moteur avec valeurs MESURÉES */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: '.2rem' }}>Critères du moteur</div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
          <li>surface : {c.surface.applicable ? `${c.surface.ratio !== null ? pct(c.surface.ratio) : '—'} (seuil ${pct(c.surface.seuil)}) ${c.surface.franchi ? '✓' : '✗'}` : 'sans objet (sans fusion)'}</li>
          <li>bordure : {c.bordure.applicable ? `${c.bordure.part !== null ? pct(c.bordure.part) : '—'} (seuil ${pct(c.bordure.seuil)}) ${c.bordure.franchi ? '✓' : '✗'}` : 'sans objet (sans fusion)'}</li>
          <li>bâti : {c.bati.nbNouveauxOuModifies} polygone(s) nouveau(x)/modifié(s) {c.bati.franchi ? '✓' : '✗'}</li>
        </ul>
      </div>

      {/* Seuils utilisés + provenance ; millésimes */}
      <div style={styleAide}>
        Seuils utilisés : surface {detail.seuilsBrut.surfacePct} % · bordure {detail.seuilsBrut.bordurePct} % · marge altitude {detail.seuilsBrut.margeAltitudeCm} cm
        {' '}({detail.seuilsProvenance === 'base' ? 'valeurs en base' : 'repli sur défaut — migration 115 non appliquée'}).
        {' '}Millésimes : cadastre {detail.millesimeCadastre ?? '—'} · bâti {detail.millesimeBati ?? '—'}.
      </div>
    </div>
  );
}
