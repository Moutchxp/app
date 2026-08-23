'use client'; // FUS-3c-quater — ce module porte désormais des disclosures interactives (« i »), donc composants clients.

import { useState, useId, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
// ⚠️ Piège du bundle client : on n'importe d'un module serveur que des TYPES (jamais un runtime — rattachementSuiviRepo importe db/client).
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { CritereSurface, CritereBordure, CritereBati } from '../../../../lib/permis/detectionRattachement';
import type { AffectationEtat } from '../../../../lib/permis/affectationRepo'; // TYPE seul (module serveur)
// affectationSchema est PUR (aucun import serveur) → on peut importer ses fonctions dans le bundle client.
import { optionsPourCorps, polygonesNonAffectes, corpsDuPolygone, couleurRepere, indexDepuisRepere, PALETTE_REPERE, type SchemaEmpreinte, type CorpsAffectation } from '../../../../lib/permis/affectationSchema';

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

/** L1 — formate une date ISO 'YYYY-MM-DD' en 'JJ/MM/AAAA'. Découpage de chaîne (jamais `new Date`) : déterministe et sans piège de fuseau. */
export function formatDateFr(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

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
export function TableSuivi({ lignes, compteurs, onOuvrir, ouvert }: {
  lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number>; onOuvrir?: (dossierId: number) => void; ouvert?: number | null;
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
                {/* FUS-3c-ter — n° + type/nature + adresse ; l'ouverture passe par un BOUTON EXPLICITE, pas un clic sur la ligne. */}
                <span style={{ fontFamily: 'var(--font-svv-mono, monospace)', fontWeight: 700 }}>{l.numDau}</span>
                <span>{l.type}{l.natureTravaux ? ` — ${l.natureTravaux}` : ''}</span>
                <span style={{ color: 'var(--color-svv-muted)' }}>{l.adresse ?? l.commune ?? `INSEE ${l.codeInsee}`}</span>
                {/* L1 — date d'ARRIVÉE du permis (autorisation), libellée pour ne pas se confondre avec « suivi depuis… » (date d'entrée en suivi). */}
                <span style={{ fontSize: 12, color: 'var(--color-svv-ink)', whiteSpace: 'nowrap' }}>
                  {l.dateAutorisationIso ? `permis autorisé le ${formatDateFr(l.dateAutorisationIso)}` : <em style={{ color: 'var(--color-svv-muted)' }}>date d’autorisation inconnue</em>}
                </span>
                <span style={{ ...styleAide, marginLeft: 'auto' }}>
                  {l.derniereEvalIso ? `évalué le ${l.derniereEvalIso} · ` : ''}{ancienneteTexte(l)}
                </span>
                <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', padding: '.2rem .6rem', fontSize: 12 }}
                  aria-expanded={ouvert === l.dossierId} onClick={() => onOuvrir?.(l.dossierId)}>
                  {ouvert === l.dossierId ? 'Fermer le détail' : 'Ouvrir le détail'}
                </button>
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
 * FUS-3c-ter — exposition du RÉGIME à l'écran : n'AFFIRME QUE ce qui est CERTAIN.
 *  · fusion CONSTATÉE (moteur avec_fusion : les parcelles d'origine ont disparu du cadastre) → on peut l'écrire ;
 *  · UNE seule parcelle → « sans fusion possible » (certitude) ;
 *  · 2 parcelles ou plus sans fusion encore constatée → INDÉTERMINÉE (on ne peut pas savoir si la mise à jour est arrivée) :
 *    on n'affirme RIEN, on dit l'attente. (« sans fusion — parcelles encore au cadastre » se lisait comme une conclusion.)
 * ⚠️ Le régime INTERNE du moteur (detectionRattachement) ne change PAS : il pilote toujours quels critères s'appliquent. Seule
 *    son EXPOSITION comme fait établi est corrigée ici. Rendu pur.
 */
export function libelleRegimeExpose(regime: string, nbParcellesOrigine: number): string {
  if (regime === 'avec_fusion') return 'fusion de parcelles constatée';
  if (regime === 'indetermine') return 'fusion de parcelles : indéterminée — parcelle du permis incomplète';
  // sans_fusion (les parcelles d'origine sont encore au cadastre) : ce n'est PAS une preuve d'absence de fusion à venir.
  if (nbParcellesOrigine <= 1) return 'sans fusion de parcelles possible (une seule parcelle)';
  return 'fusion de parcelles : indéterminée — en attente de la mise à jour du cadastre';
}

/** FUS-3c-ter — libellé de l'état de détection : RIEN = absence de constat (attente), pas une conclusion. */
export function libelleVerdict(verdict: string): string {
  if (verdict === 'RIEN') return 'en attente de la mise à jour du cadastre et de BD TOPO';
  if (verdict === 'RATTACHEMENT_AUTOMATIQUE') return 'rattachement automatique';
  if (verdict === 'ARBITRAGE_DEMANDE') return 'arbitrage demandé';
  return verdict;
}

/** FUS-3c — URL Street View (pano) au point donné. Aucune clé API : la date de prise de vue est affichée par Google lui-même. */
export function lienStreetView(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

// FUS-3c-bis — un critère NON APPLICABLE (surface/bordure hors régime de fusion) n'est PAS « sans objet » : il n'est pas ENCORE
// évaluable. On le dit comme une ATTENTE (ce n'est pas nous qui décidons de la fusion, on la constatera à la mise à jour).
export const EN_ATTENTE_MAJ = 'en attente de la mise à jour du cadastre et de BD TOPO';

// FUS-3c-quater — un critère est DÉCLENCHÉ (→ ligne verte) quand une mise à jour détectée le franchit ; sinon « en attente ».
// Le LIBELLÉ porte l'info (« seuil atteint » / « détecté ») → il reste explicite SANS la couleur.
export function critereSurfaceDeclenche(s: CritereSurface): boolean { return s.applicable && s.franchi; }
export function critereBordureDeclenche(b: CritereBordure): boolean { return b.applicable && b.franchi; }
export function critereBatiDeclenche(bati: CritereBati): boolean { return bati.nbNouveauxOuModifies >= 1; }

/** Libellé du critère SURFACE : attente si non applicable ; sinon la valeur MESURÉE + le seuil (atteint ou non — jamais muet). */
export function libelleCritereSurface(s: CritereSurface, nbParcellesOrigine: number): string {
  if (!s.applicable) return EN_ATTENTE_MAJ;
  if (s.ratio === null) return `mesure indisponible — seuil ${pct(s.seuil)}`;
  const base = `${pct(s.ratio)} de la parcelle du permis (${nbParcellesOrigine} parcelle${nbParcellesOrigine > 1 ? 's' : ''} d’origine) — seuil ${pct(s.seuil)}`;
  return s.franchi ? `${base} (seuil atteint)` : `${base} (seuil non atteint)`;
}

/** Libellé du critère BORDURE : attente si non applicable ; sinon la part de contour commun MESURÉE + le seuil (atteint ou non). */
export function libelleCritereBordure(b: CritereBordure): string {
  if (!b.applicable) return EN_ATTENTE_MAJ;
  if (b.part === null) return `mesure indisponible — seuil ${pct(b.seuil)}`;
  const base = `${pct(b.part)} de contour commun — seuil ${pct(b.seuil)}`;
  return b.franchi ? `${base} (seuil atteint)` : `${base} (seuil non atteint)`;
}

/** Libellé du critère BÂTI : 0 polygone = attente d'une donnée qui viendra (pas un échec) ; sinon le décompte DÉTECTÉ. */
export function libelleCritereBati(bati: CritereBati): string {
  const n = bati.nbNouveauxOuModifies;
  if (n === 0) return 'aucun bâti nouveau ou modifié pour l’instant — en attente de la mise à jour de BD TOPO';
  return `${n} polygone${n > 1 ? 's' : ''} nouveau${n > 1 ? 'x' : ''}/modifié${n > 1 ? 's' : ''} détecté${n > 1 ? 's' : ''}`;
}

/** FUS-3c-quater — disclosure « i » accessible (aria-expanded) : une explication longue, repliée par défaut, ouverte à la demande. */
export function InfoDepliable({ label, children }: { label: string; children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button type="button" aria-expanded={ouvert} aria-label={label} title={label}
        onClick={() => setOuvert((v) => !v)}
        style={{ width: 'auto', marginLeft: '.35rem', padding: '0 .4rem', borderRadius: '999px', border: '1px solid var(--color-svv-line)', background: 'var(--color-svv-field)', color: 'var(--color-svv-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1.6 }}>
        i
      </button>
      {ouvert && <div style={{ ...styleAide, marginTop: '.2rem' }}>{children}</div>}
    </>
  );
}

/** Détail comparatif « trois sources » + critères / seuils / verdict / millésimes + Street View. LECTURE SEULE. */
export function DetailSuiviRendu({ detail }: { detail: DetailSuivi }) {
  const c = detail.criteres;
  return (
    <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      {/* FUS-3c-ter — en-tête : n° + commune + état + ADRESSE (plus de « (dérivé — aucun dossier en base) », qui ne disait rien). */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{detail.numDau}</strong>
        <span>{detail.type}{detail.natureTravaux ? ` — ${detail.natureTravaux}` : ''}</span>
        <BadgeEtatSuivi etat={detail.etat} />
        <span style={{ color: 'var(--color-svv-muted)' }}>{detail.adresse ?? detail.commune ?? `INSEE ${detail.codeInsee}`}</span>
      </div>

      {/* FUS-3c-quater — « Verdict : … » (étiquette restaurée) pour TOUS les verdicts, RIEN compris. La ligne de MOTIF est retirée
          de l'affichage (doublon moins clair des critères) — le motif reste en base et au journal. Régime : n'affiche que le certain. */}
      <div>
        <div><span style={{ color: 'var(--color-svv-muted)' }}>Verdict : </span><strong>{libelleVerdict(detail.verdict)}</strong></div>
        <div><span style={{ color: 'var(--color-svv-muted)' }}>Parcelles : </span>{libelleRegimeExpose(detail.regime, detail.nbParcellesOrigine)}</div>
      </div>

      {/* Google Street View — sur le centroïde de l'empreinte, ou motif s'il n'y a pas de point fiable */}
      <div>
        {detail.streetView
          ? <>
              <a href={lienStreetView(detail.streetView.lat, detail.streetView.lng)} target="_blank" rel="noopener noreferrer" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }}>ouvrir Google Street View au droit de la parcelle ↗</a>
              {/* FUS-3c-quater — la consigne courte reste visible ; l'explication longue passe derrière un « i ». */}
              <span style={{ ...styleAide, color: 'var(--color-svv-red)' }}> ⚠ Vérifier la date de la prise de vue</span>
              <InfoDepliable label="pourquoi vérifier la date de la prise de vue">La date est affichée par Google dans sa propre interface. Une image ANTÉRIEURE aux travaux ferait conclure à tort qu’ils n’ont pas eu lieu — la vue doit être postérieure au permis.</InfoDepliable>
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

      {/* FUS-3c-quater — « Critères comparatifs du moteur ». Un critère DÉCLENCHÉ passe en VERT (couleur de succès de l'app), la
          ligne en attente reste grise ; le libellé porte l'info (« seuil atteint » / « détecté ») → explicite SANS la couleur. */}
      <div>
        <div style={{ fontWeight: 700, marginBottom: '.2rem', color: 'var(--color-svv-ink)' }}>Critères comparatifs du moteur</div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
          <li style={{ color: critereSurfaceDeclenche(c.surface) ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)' }}>surface : {libelleCritereSurface(c.surface, detail.nbParcellesOrigine)}</li>
          <li style={{ color: critereBordureDeclenche(c.bordure) ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)' }}>
            bordure : {libelleCritereBordure(c.bordure)}
            {/* FUS-3c-quater — l'explication (limites extérieures) + l'éventuelle note « contours disjoints » passent derrière un « i ». */}
            <InfoDepliable label="détails sur la mesure de bordure">
              La bordure ne compare que les limites EXTÉRIEURES des parcelles réunies (la parcelle du permis est leur union — la frontière mitoyenne est effacée), jamais les limites qui les séparent entre elles.
              {detail.nbContoursEmpreinte > 1 && (
                <div style={{ marginTop: '.3rem', color: 'var(--color-svv-red)' }}>⚠ Empreinte en {detail.nbContoursEmpreinte} contours disjoints (parcelles qui ne se touchent pas) : la bordure est mesurée contre chaque contour extérieur, et le point Street View (centroïde) peut tomber ENTRE les parcelles — à interpréter avec prudence.</div>
              )}
            </InfoDepliable>
          </li>
          <li style={{ color: critereBatiDeclenche(c.bati) ? 'var(--color-svv-green-ink)' : 'var(--color-svv-muted)' }}>bâti : {libelleCritereBati(c.bati)}</li>
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

// ── FUS-3e — les trois décisions (valider / refuser / retour LiDAR) ──────────
/**
 * Boutons de décision, PURS et contrôlés (l'état des champs vit dans la Vue). Trois actions distinctes, libellés explicites :
 *  · Valider → injecte les altitudes (origine 'permis'). Si la cardinalité est incohérente, `avertissement` s'affiche et un
 *    MOTIF de confirmation devient obligatoire (le bouton exige alors ce motif).
 *  · Refuser → motif OBLIGATOIRE.
 *  · Retour LiDAR → restaure l'altitude LiDAR d'origine (filet, reste possible après validation).
 * ⚠️ Aucune de ces actions ne change le verdict SVAV (le moteur ne lit pas encore permis_polygone_altitude).
 */
export function ActionsRattachement({ avertissement, motifRefus, motifConfirmation, onMotifRefus, onMotifConfirmation, onValider, onRefuser, onRetour, enCours }: {
  avertissement: string | null;
  motifRefus: string; motifConfirmation: string;
  onMotifRefus: (v: string) => void; onMotifConfirmation: (v: string) => void;
  onValider: () => void; onRefuser: () => void; onRetour: () => void; enCours: boolean;
}) {
  const styleTA: CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: '2.2rem', padding: '.3rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12, fontFamily: 'inherit' };
  return (
    <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700 }}>Décision</div>
      {/* Valider (avec confirmation si cardinalité incohérente) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        {avertissement && (
          <div role="alert" style={{ color: 'var(--color-svv-red)' }}>
            {avertissement}
            <textarea value={motifConfirmation} onChange={(e) => onMotifConfirmation(e.target.value)} disabled={enCours}
              aria-label="motif de validation malgré l’incohérence" placeholder="motif de validation malgré l’incohérence (obligatoire)…" style={{ ...styleTA, marginTop: '.2rem' }} />
          </div>
        )}
        <button type="button" className="svv-btn" style={{ width: 'auto' }} onClick={onValider}
          disabled={enCours || (!!avertissement && !motifConfirmation.trim())}>
          {avertissement ? 'Confirmer la validation (avec motif)' : 'Valider le rattachement'}
        </button>
      </div>
      {/* Refuser (motif obligatoire) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <textarea value={motifRefus} onChange={(e) => onMotifRefus(e.target.value)} disabled={enCours}
          aria-label="motif de refus" placeholder="motif de refus (obligatoire)…" style={styleTA} />
        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} onClick={onRefuser} disabled={enCours || !motifRefus.trim()}>
          Refuser le rattachement
        </button>
      </div>
      {/* Retour LiDAR (filet) */}
      <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto' }} onClick={onRetour} disabled={enCours}>
          Retour aux caractéristiques LiDAR d’origine
        </button>
        <span style={styleAide}>Restaure l’altitude LiDAR d’origine des polygones affectés (filet en cas d’erreur d’affectation) ; reste possible après validation.</span>
      </div>
    </div>
  );
}

// ── FUS-3d / L2 — schéma : lisibilité (trame hors parcelle, parcelle blanche, palette par repère) ─────────────────────────────
/**
 * Schéma SVG PUR : empreinte en fond, chaque polygone rempli + étiqueté par son repère. Aucune tuile — projection dans une boîte
 * (module `affectationSchema`). `motif` (empreinte incomplète/absente) → on l'écrit, on ne dessine pas au hasard.
 *
 * L2 — lisibilité (thème clair unique, rien d'animé) :
 *  ① FOND HORS PARCELLE : une TRAME grise (hachures à 45°) pour que le contour de la parcelle se détache — lisible même imprimé N&B ;
 *  ② PARCELLE : blanc plein PAR-DESSUS la trame ;
 *  ③ POLYGONES : couleur FRANCHE de la palette FIXE, indexée par le repère stable (A, B, C…) → tous distincts, aucun blanc.
 *     Le rouge est ABSENT de la palette (réservé au lot L5). La couleur n'est qu'une aide : le repère écrit reste la référence
 *     (halo blanc sous le glyphe → lisible sur n'importe quelle teinte). Affecté → contour VERT ; hors empreinte → contour TIRETÉ
 *     (canaux NON colorés : l'information ne dépend jamais de la seule couleur).
 */
export function SchemaEmpreinteSvg({ schema, corps, agrandi = false }: { schema: SchemaEmpreinte; corps: CorpsAffectation[]; agrandi?: boolean }) {
  const uid = useId();
  const trameId = `trame-${uid.replace(/:/g, '')}`; // id unique (deux schémas côte à côte en L5 ne partageront pas le motif)
  if (schema.motif) return <div style={{ ...styleAide, fontStyle: 'italic' }}>{schema.motif}</div>;
  // L3 — `agrandi` : en plein écran, le schéma remplit la largeur disponible (le viewBox conserve le ratio) et monte jusqu'à 72vh
  // pour que les repères chevauchés en vue réduite redeviennent lisibles. En vue réduite : dimensions intrinsèques + maxWidth.
  const dims = agrandi ? { width: '100%' as const } : { width: schema.largeur, height: schema.hauteur };
  const styleSvg: CSSProperties = agrandi
    ? { width: '100%', height: 'auto', maxHeight: '72vh', border: '1px solid var(--color-svv-line)', background: '#fff', borderRadius: '.4rem' }
    : { maxWidth: '100%', height: 'auto', border: '1px solid var(--color-svv-line)', background: '#fff', borderRadius: '.4rem' };
  return (
    <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} {...dims} role="img"
      aria-label="Schéma des polygones de la parcelle du permis, étiquetés par repère" style={styleSvg}>
      <defs>
        {/* ① trame grise du fond HORS parcelle : hachures à 45°, franches en niveaux de gris (impression N&B OK) */}
        <pattern id={trameId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill="#f4f4f5" />
          <line x1={0} y1={0} x2={0} y2={6} stroke="#c9ccd1" strokeWidth={1.2} />
        </pattern>
      </defs>
      <rect x={0} y={0} width={schema.largeur} height={schema.hauteur} fill={`url(#${trameId})`} />
      {/* ② parcelle : blanc plein par-dessus la trame → son contour se détache */}
      {schema.empreintePath && <path d={schema.empreintePath} fill="#fff" stroke="var(--color-svv-ink)" strokeWidth={1.5} />}
      {/* ③ polygones : couleur franche par repère (identité stable) ; affecté = contour vert ; hors empreinte = contour tireté */}
      {schema.polygones.map((p) => {
        const affecte = !!corpsDuPolygone(corps, p.cleabs);
        return (
          <g key={p.repere}>
            <path d={p.path} fill={couleurRepere(indexDepuisRepere(p.repere))} fillOpacity={0.85}
              stroke={affecte ? 'var(--color-svv-green-ink)' : 'var(--color-svv-ink)'} strokeWidth={affecte ? 2.5 : 1}
              strokeDasharray={p.horsEmpreinte ? '3 2' : undefined} />
            {/* repère avec HALO blanc (paint-order) → contraste suffisant sur n'importe quelle couleur de remplissage */}
            <text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}
              fill="var(--color-svv-ink)" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.repere}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Texte des polygones non affectés, DISTINGUANT ceux DANS la parcelle (gris) et ceux qui DÉBORDENT de la parcelle (rouge tireté) — cohérent avec le schéma. */
export function texteNonAffectes(nonAffectes: { repere: string; horsEmpreinte: boolean }[]): string {
  const dans = nonAffectes.filter((p) => !p.horsEmpreinte).map((p) => p.repere);
  const hors = nonAffectes.filter((p) => p.horsEmpreinte).map((p) => p.repere);
  const parts: string[] = [];
  if (dans.length > 0) parts.push(`dans la parcelle : ${dans.join(', ')}`);
  if (hors.length > 0) parts.push(`débordant de la parcelle : ${hors.join(', ')}`);
  return parts.join(' ; ');
}

/**
 * Légende du schéma (L2). La couleur n'est JAMAIS seule porteuse : chaque item nomme aussi son cue non coloré (repère écrit,
 * contour vert, contour tireté, trame). Présentation minimale, tenue à jour avec l'encodage L2 — sa mise en forme définitive
 * (nom du schéma, plein écran) reste le lot L3.
 */
export function LegendeAffectation() {
  const item: CSSProperties = { display: 'inline-flex', alignItems: 'center' };
  const puceBase: CSSProperties = { display: 'inline-block', width: 14, height: 14, borderRadius: 3, marginRight: '.35rem', verticalAlign: 'middle' };
  const chip = (fill: string, border: string): CSSProperties => ({ ...puceBase, background: fill, opacity: 0.85, border });
  return (
    <div role="note" aria-label="Légende du schéma d’affectation" style={{ ...styleAide, display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
      {/* ③ la couleur = identité du polygone (repère). On montre quelques teintes de la palette ; le repère écrit reste la référence. */}
      <span style={item}>
        <span aria-hidden="true" style={{ display: 'inline-flex', marginRight: '.35rem' }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ ...puceBase, width: 10, marginRight: 2, background: PALETTE_REPERE[i], opacity: 0.85, border: '1px solid var(--color-svv-ink)' }} />)}
        </span>
        couleur = repère du polygone (A, B, C…)
      </span>
      <span style={item}><span aria-hidden="true" style={chip('#fff', '2.5px solid var(--color-svv-green-ink)')} />affecté à un corps (contour vert)</span>
      <span style={item}><span aria-hidden="true" style={chip('#fff', '1px dashed var(--color-svv-ink)')} />déborde de la parcelle (contour tireté)</span>
      <span style={item}><span aria-hidden="true" style={{ ...puceBase, backgroundImage: 'repeating-linear-gradient(45deg, #c9ccd1 0 1.2px, #f4f4f5 1.2px 6px)', border: '1px solid var(--color-svv-line)' }} />hors parcelle (trame grise)</span>
    </div>
  );
}

// L3 — nom par défaut du (seul) schéma actuel. Un SECOND nom (« Nouvelle configuration ») viendra en L5 ; la place est prête ici.
export const NOM_SCHEMA_ORIGINE = 'Configuration d’origine';

/**
 * L4 — nom + mention du schéma d'origine selon sa PROVENANCE (snapshot figé vs couche vivante). Pur (testable). JAMAIS un repli
 * muet sur le vivant sous le nom « origine » : sans capture, le schéma est nommé honnêtement « État courant (non figé) ». Le
 * millésime du gel est écrit dans la mention (ou « inconnu »). Trois cas distincts, dont « terrain nu au gel » ≠ « aucune capture ».
 */
export function descriptionSchemaOrigine(o: { figee: boolean; captureVide: boolean; millesimeGel: string | null }): { nom: string; mention: string } {
  const millTxt = o.millesimeGel ? `millésime ${o.millesimeGel}` : 'millésime inconnu';
  if (!o.figee) return { nom: 'État courant (non figé)', mention: 'Aucun état d’origine n’a été capturé pour ce permis : polygones lus dans la couche bâti actuelle.' };
  if (o.captureVide) return { nom: NOM_SCHEMA_ORIGINE, mention: `Terrain nu au moment du gel — aucun bâtiment (${millTxt}).` };
  return { nom: NOM_SCHEMA_ORIGINE, mention: `État figé (${millTxt}).` };
}

/**
 * CORPS + CHOIX D'AFFECTATION — la SEULE source de vérité des sélecteurs (exclusivité `optionsPourCorps`, réversibilité,
 * polygones non affectés `polygonesNonAffectes`). Rendue À L'IDENTIQUE en vue réduite ET en plein écran (L3) : la vue agrandie
 * n'est qu'un HABILLAGE, elle NE redéfinit AUCUNE règle — elle réutilise ce composant. `persiste=false`/`enAttenteBati` disent
 * pourquoi l'arbitrage est fermé (jamais de disparition muette). ⚠️ AUCUN valider/refuser, AUCUNE injection (FUS-3e).
 */
export function CorpsEtChoix({ affectation, persiste, enAttenteBati = false, onAffecter }: { affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean; onAffecter?: (corpsId: number, cleabs: string | null) => void }) {
  const { corps, polygones, colonneManquante } = affectation;
  if (!persiste) {
    return (
      <div role="note" style={{ ...styleAide }}>
        Aucun signal de mise à jour n’a encore été détecté pour ce permis : il n’y a rien à arbitrer pour l’instant. L’affectation des polygones aux bâtiments s’ouvrira dès qu’un changement (parcelle ou bâti) sera détecté. Le schéma reste consultable pour comprendre le site.
      </div>
    );
  }
  if (enAttenteBati) {
    return (
      <div role="note" style={{ ...styleAide }}>
        En attente du bâti : les travaux sont déclarés terminés, mais BD TOPO n’a pas encore de bâtiment mesuré dans la parcelle du permis. L’affectation s’ouvrira quand le bâtiment apparaîtra — on n’affecte pas un polygone préexistant à un bâtiment qui n’est pas encore construit.
      </div>
    );
  }
  const nonAffectes = polygonesNonAffectes(corps, polygones);
  return (
    <>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        {corps.length === 0 && <li style={styleAide}>Aucun corps de bâtiment déclaré au permis.</li>}
        {corps.map((c) => {
          const options = optionsPourCorps(corps, polygones, c.id);
          return (
            <li key={c.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, minWidth: 90 }}>{c.repere ?? `corps ${c.id}`}</span>
              <span style={styleAide}>{c.altitudeSommetNgf !== null ? `sommet ${c.altitudeSommetNgf} m NGF` : 'altitude —'}{c.nbEtages !== null ? ` · ${c.nbEtages} ét.` : ''}</span>
              <label style={{ display: 'inline-flex', gap: '.3rem', alignItems: 'baseline' }}>
                <span style={styleAide}>polygone :</span>
                <select value={c.cleabsAffecte ?? ''} disabled={colonneManquante} aria-label={`polygone affecté au corps ${c.repere ?? c.id}`}
                  onChange={(e) => onAffecter?.(c.id, e.target.value || null)}
                  style={{ padding: '.2rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12, fontFamily: 'inherit' }}>
                  <option value="">— aucun (bâtiment sans polygone) —</option>
                  {options.map((o) => <option key={o.cleabs ?? o.repere} value={o.cleabs ?? ''}>polygone {o.repere}{o.horsEmpreinte ? ' (déborde de la parcelle)' : ''}</option>)}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
      {nonAffectes.length > 0 && (
        <div role="note" style={{ ...styleAide, color: 'var(--color-svv-red)' }}>
          Polygones non affectés — {texteNonAffectes(nonAffectes)}. À affecter au bon corps, ou à laisser si aucun corps ne correspond (bâtiments accolés / débords).
        </div>
      )}
    </>
  );
}

/**
 * FIGURE du schéma : le SVG + son NOM écrit DANS le visuel (figcaption en surimpression, pas seulement au-dessus). Quand `onAgrandir`
 * est fourni, la figure devient une cible cliquable ET focalisable au clavier (role=button, Entrée/Espace) → ouvre le plein écran.
 */
export function SchemaFigure({ schema, corps, titre, mention, agrandi = false, onAgrandir }: { schema: SchemaEmpreinte; corps: CorpsAffectation[]; titre?: string; mention?: string; agrandi?: boolean; onAgrandir?: () => void }) {
  const contenu = (
    <>
      <figure style={{ position: 'relative', margin: 0 }}>
        {titre && (
          <figcaption style={{ position: 'absolute', top: 6, left: 6, zIndex: 1, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,.85)', color: 'var(--color-svv-ink)', padding: '.1rem .45rem', borderRadius: '.3rem', border: '1px solid var(--color-svv-line)' }}>{titre}</figcaption>
        )}
        <SchemaEmpreinteSvg schema={schema} corps={corps} agrandi={agrandi} />
      </figure>
      {/* L4 — mention (provenance + millésime du gel) écrite DANS le visuel, juste sous le nom du schéma. */}
      {mention && <div style={{ ...styleAide }}>{mention}</div>}
    </>
  );
  if (!onAgrandir) return contenu;
  const ouvrir = () => onAgrandir();
  return (
    <div role="button" tabIndex={0} aria-label={`Agrandir le schéma en plein écran${titre ? ` : ${titre}` : ''}`}
      onClick={ouvrir}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
      {contenu}
      <span style={{ ...styleAide }}>⤢ Agrandir — repères lisibles (les lanières étroites se chevauchent en petit)</span>
    </div>
  );
}

/**
 * LÉGENDE COMPLÈTE (plein écran) : liste les repères RÉELLEMENT PRÉSENTS (A, B, C… jusqu'au dernier) avec leur couleur, pour
 * retrouver un polygone précis — une pastille générique n'identifie pas un bâtiment. Affecté → mention du corps ; hors empreinte
 * signalé (contour tireté). La couleur n'est qu'une aide : le repère écrit reste la référence.
 */
export function LegendeRepetesComplete({ schema, corps }: { schema: SchemaEmpreinte; corps: CorpsAffectation[] }) {
  if (schema.polygones.length === 0) return <div style={styleAide}>Aucun polygone dans la parcelle du permis.</div>;
  const deborde = schema.polygones.some((p) => p.horsEmpreinte); // au moins un bâtiment déborde de la parcelle du permis
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      <div role="note" aria-label="Légende : repères présents dans la parcelle du permis" style={{ ...styleAide, display: 'flex', flexWrap: 'wrap', gap: '.35rem .8rem' }}>
        {schema.polygones.map((p) => {
          const corpsAff = corpsDuPolygone(corps, p.cleabs);
          return (
            <span key={p.repere} style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
              <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: couleurRepere(indexDepuisRepere(p.repere)), opacity: 0.85, border: p.horsEmpreinte ? '1px dashed var(--color-svv-ink)' : `1px solid ${corpsAff ? 'var(--color-svv-green-ink)' : 'var(--color-svv-ink)'}` }} />
              <strong>{p.repere}</strong>{corpsAff ? ` → ${corpsAff.repere ?? `corps ${corpsAff.id}`}` : p.horsEmpreinte ? ' (déborde de la parcelle)' : ''}
            </span>
          );
        })}
      </div>
      {/* ②/④ — clé du débordement : la puce AVEC son contour tireté (pas seulement le mot) + POURQUOI ça compte, dit UNE fois. */}
      {deborde && (
        <div role="note" style={{ ...styleAide, display: 'flex', alignItems: 'baseline', gap: '.3rem' }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: '#fff', border: '1px dashed var(--color-svv-ink)' }} />
          <span><strong>Contour tireté = déborde de la parcelle</strong> — bâtiment probablement mitoyen ou voisin : à vérifier avant de l’affecter au permis.</span>
        </div>
      )}
    </div>
  );
}

// ── L3 — helpers PURS du dialogue plein écran (testables en environnement node, sans DOM) ─────────────────────────────────────
/** Une touche ferme-t-elle le dialogue ? (Échap, EN SUPPLÉMENT du bouton Fermer, jamais à sa place.) */
export function estToucheFermeture(key: string): boolean { return key === 'Escape' || key === 'Esc'; }
/** Index focusable suivant dans un piège de focus circulaire (Tab → avant, Shift+Tab → arrière ; enroulement aux bords). */
export function indexFocusSuivant(index: number, total: number, shift: boolean): number {
  if (total <= 0) return 0;
  if (index < 0) return shift ? total - 1 : 0;
  return shift ? (index - 1 + total) % total : (index + 1) % total;
}
/** Rend le focus à l'élément déclencheur (à la fermeture). Sûr si l'élément est absent. */
export function restaurerFocus(element: { focus: () => void } | null | undefined): void { element?.focus(); }

/**
 * PLEIN ÉCRAN (L3) — vrai DIALOGUE (role=dialog, aria-modal, titre annoncé, focus piégé à l'ouverture et RENDU au déclencheur à la
 * fermeture, Échap en supplément du bouton Fermer). HABILLAGE PUR : réutilise `SchemaFigure`, `LegendeRepetesComplete` et surtout
 * `CorpsEtChoix` (mêmes règles d'affectation — AUCUNE duplication). Aucune animation (prefers-reduced-motion respecté d'office).
 * Mobile-first : le schéma prime (en tête), la légende puis les sélecteurs suivent en défilement, sans masquer le dessin.
 */
export function SchemaPleinEcran({ titre, mention, affectation, persiste, enAttenteBati = false, onAffecter, onFermer }: {
  titre: string; mention?: string; affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean;
  onAffecter?: (corpsId: number, cleabs: string | null) => void; onFermer: () => void;
}) {
  const dialogueRef = useRef<HTMLDivElement>(null);
  const titreId = useId();
  // Ref-indirection : le piège de focus s'installe UNE fois (mount) et le focus est RENDU une seule fois (unmount → fermeture).
  // Sans elle, un `onFermer` inline (nouvelle identité à chaque rendu parent) relancerait l'effet et ferait sauter le focus.
  const onFermerRef = useRef(onFermer);
  useEffect(() => { onFermerRef.current = onFermer; }, [onFermer]); // maj hors rendu (règle react-hooks/refs)
  useEffect(() => {
    const dlg = dialogueRef.current;
    if (!dlg) return;
    const declencheur = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null; // élément focalisé AVANT ouverture
    const focusables = (): HTMLElement[] => Array.from(dlg.querySelectorAll<HTMLElement>('button, a[href], select, input, textarea, [tabindex]:not([tabindex="-1"])')).filter((el) => !el.hasAttribute('disabled'));
    focusables()[0]?.focus(); // focus piégé à l'ouverture (le bouton Fermer est en tête)
    const onKey = (e: KeyboardEvent) => {
      if (estToucheFermeture(e.key)) { e.preventDefault(); onFermerRef.current(); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) return;
        const suivant = indexFocusSuivant(f.indexOf(document.activeElement as HTMLElement), f.length, e.shiftKey);
        e.preventDefault(); f[suivant]?.focus();
      }
    };
    dlg.addEventListener('keydown', onKey);
    return () => { dlg.removeEventListener('keydown', onKey); restaurerFocus(declencheur); }; // focus RENDU au déclencheur
  }, []);

  return (
    <div ref={dialogueRef} role="dialog" aria-modal="true" aria-labelledby={titreId}
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#fff', display: 'flex', flexDirection: 'column', gap: '.5rem', padding: '.75rem', overflow: 'auto' }}>
      <div style={{ position: 'sticky', top: 0, background: '#fff', display: 'flex', alignItems: 'center', gap: '.5rem', paddingBottom: '.25rem', borderBottom: '1px solid var(--color-svv-line)' }}>
        <h2 id={titreId} style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{titre}</h2>
        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', marginLeft: 'auto' }} onClick={onFermer}>Fermer ✕</button>
      </div>
      {/* Le schéma PRIME (grand, en tête) — le nom + la mention (provenance/millésime) sont écrits DANS le visuel via la figure. */}
      <SchemaFigure schema={affectation.schema} corps={affectation.corps} titre={titre} mention={mention} agrandi />
      <LegendeRepetesComplete schema={affectation.schema} corps={affectation.corps} />
      {/* La FONCTION de rattachement, à l'identique (mêmes règles) — c'est là qu'on arbitre. */}
      {affectation.colonneManquante && <div role="alert" style={{ color: 'var(--color-svv-red)' }}>Affectation indisponible : migration 117 non appliquée.</div>}
      <CorpsEtChoix affectation={affectation} persiste={persiste} enAttenteBati={enAttenteBati} onAffecter={onAffecter} />
    </div>
  );
}

/**
 * Bloc d'affectation (vue RÉDUITE) : le SCHÉMA nommé + cliquable (→ plein écran) + sa LÉGENDE compacte, puis les CHOIX (`CorpsEtChoix`,
 * mêmes règles que le plein écran). Le schéma reste consultable même sans dossier persisté (on DIT pourquoi l'arbitrage est fermé).
 */
export function AffectationBloc({ affectation, persiste, enAttenteBati = false, onAffecter, onAgrandir, titre = NOM_SCHEMA_ORIGINE, mention }: { affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean; onAffecter?: (corpsId: number, cleabs: string | null) => void; onAgrandir?: () => void; titre?: string; mention?: string }) {
  const { corps, schema, motif, colonneManquante } = affectation;
  return (
    <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700 }}>
        Affectation des polygones aux bâtiments
        <InfoDepliable label="comment lire le schéma d’affectation">BD TOPO ne nomme pas ses polygones (seulement un cleabs illisible). Chaque polygone de la parcelle du permis reçoit un repère STABLE (A, B, C…) et une couleur sur le schéma. Repérez-le sur vos plans de la GED et sur Street View, puis affectez-le au bon corps. Un polygone affecté disparaît des choix des autres corps ; une affectation reste modifiable ; un corps peut rester sans polygone.</InfoDepliable>
      </div>
      {colonneManquante && <div role="alert" style={{ color: 'var(--color-svv-red)' }}>Affectation indisponible : migration 117 non appliquée.</div>}
      {motif
        ? <div style={{ ...styleAide, fontStyle: 'italic' }}>{motif}</div>
        : (
          <>
            {/* Schéma nommé + cliquable (→ plein écran) + légende compacte : TOUJOURS rendus (informatifs), quel que soit l'état. */}
            <SchemaFigure schema={schema} corps={corps} titre={titre} mention={mention} onAgrandir={onAgrandir} />
            <LegendeAffectation />
            <CorpsEtChoix affectation={affectation} persiste={persiste} enAttenteBati={enAttenteBati} onAffecter={onAffecter} />
          </>
        )}
    </div>
  );
}
