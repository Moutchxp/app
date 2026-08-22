'use client'; // FUS-3c-quater — ce module porte désormais des disclosures interactives (« i »), donc composants clients.

import { useState, type CSSProperties, type ReactNode } from 'react';
// ⚠️ Piège du bundle client : on n'importe d'un module serveur que des TYPES (jamais un runtime — rattachementSuiviRepo importe db/client).
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { CritereSurface, CritereBordure, CritereBati } from '../../../../lib/permis/detectionRattachement';
import type { AffectationEtat } from '../../../../lib/permis/affectationRepo'; // TYPE seul (module serveur)
// affectationSchema est PUR (aucun import serveur) → on peut importer ses fonctions dans le bundle client.
import { optionsPourCorps, polygonesNonAffectes, corpsDuPolygone, type SchemaEmpreinte, type CorpsAffectation } from '../../../../lib/permis/affectationSchema';

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
  if (regime === 'indetermine') return 'fusion de parcelles : indéterminée — empreinte incomplète';
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
  const base = `${pct(s.ratio)} de l’empreinte (${nbParcellesOrigine} parcelle${nbParcellesOrigine > 1 ? 's' : ''} d’origine) — seuil ${pct(s.seuil)}`;
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
              <a href={lienStreetView(detail.streetView.lat, detail.streetView.lng)} target="_blank" rel="noopener noreferrer" className="svv-link" style={{ width: 'auto', padding: '.05rem .3rem' }}>ouvrir Google Street View au droit de l’empreinte ↗</a>
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
              La bordure ne compare que les limites EXTÉRIEURES des parcelles réunies (l’empreinte est leur union — la frontière mitoyenne est effacée), jamais les limites qui les séparent entre elles.
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

// ── FUS-3d — affectation polygone ↔ corps ────────────────────────────────────
const couleurPolygone = (affecte: boolean, hors: boolean): string =>
  affecte ? 'var(--color-svv-green-soft)' : hors ? '#fde2e1' : 'var(--color-svv-field)';

/** Schéma SVG PUR : empreinte en fond, chaque polygone rempli + étiqueté par son repère. Aucune tuile — projection dans une boîte
 *  (module `affectationSchema`). `motif` (empreinte incomplète/absente) → on l'écrit, on ne dessine pas au hasard. */
export function SchemaEmpreinteSvg({ schema, corps }: { schema: SchemaEmpreinte; corps: CorpsAffectation[] }) {
  if (schema.motif) return <div style={{ ...styleAide, fontStyle: 'italic' }}>{schema.motif}</div>;
  return (
    <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} width={schema.largeur} height={schema.hauteur} role="img"
      aria-label="Schéma des polygones de l’empreinte, étiquetés par repère"
      style={{ maxWidth: '100%', height: 'auto', border: '1px solid var(--color-svv-line)', background: '#fff', borderRadius: '.4rem' }}>
      {schema.empreintePath && <path d={schema.empreintePath} fill="#fff" stroke="var(--color-svv-line)" strokeWidth={1.5} />}
      {schema.polygones.map((p) => (
        <g key={p.repere}>
          <path d={p.path} fill={couleurPolygone(!!corpsDuPolygone(corps, p.cleabs), p.horsEmpreinte)} fillOpacity={0.7}
            stroke="var(--color-svv-ink)" strokeWidth={1} strokeDasharray={p.horsEmpreinte ? '3 2' : undefined} />
          <text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill="var(--color-svv-ink)">{p.repere}</text>
        </g>
      ))}
    </svg>
  );
}

/** Texte des polygones non affectés, DISTINGUANT « dans l'empreinte » (gris) et « hors empreinte » (rouge tireté) — cohérent avec le schéma. */
export function texteNonAffectes(nonAffectes: { repere: string; horsEmpreinte: boolean }[]): string {
  const dans = nonAffectes.filter((p) => !p.horsEmpreinte).map((p) => p.repere);
  const hors = nonAffectes.filter((p) => p.horsEmpreinte).map((p) => p.repere);
  const parts: string[] = [];
  if (dans.length > 0) parts.push(`dans l’empreinte : ${dans.join(', ')}`);
  if (hors.length > 0) parts.push(`hors empreinte : ${hors.join(', ')}`);
  return parts.join(' ; ');
}

/** Légende du schéma : les TROIS styles. La couleur n'est jamais seule — le LIBELLÉ et le contour TIRETÉ (hors empreinte) portent l'information. */
export function LegendeAffectation() {
  const puce = (fill: string, tirete: boolean): CSSProperties => ({
    display: 'inline-block', width: 14, height: 14, borderRadius: 3, marginRight: '.35rem', verticalAlign: 'middle',
    background: fill, opacity: 0.85, border: `1px ${tirete ? 'dashed' : 'solid'} var(--color-svv-ink)`,
  });
  const item: CSSProperties = { display: 'inline-flex', alignItems: 'center' };
  return (
    <div role="note" aria-label="Légende du schéma d’affectation" style={{ ...styleAide, display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
      <span style={item}><span aria-hidden="true" style={puce('var(--color-svv-green-soft)', false)} />affecté à un corps</span>
      <span style={item}><span aria-hidden="true" style={puce('#fde2e1', true)} />hors empreinte (déborde de l’emprise), contour tireté</span>
      <span style={item}><span aria-hidden="true" style={puce('var(--color-svv-field)', false)} />dans l’empreinte, non affecté</span>
    </div>
  );
}

/**
 * Bloc d'affectation : le SCHÉMA + sa LÉGENDE (toujours, informatif), puis — SI le dossier est PERSISTÉ — un sélecteur par corps
 * (EXCLUSIVITÉ) et les polygones non affectés. `persiste=false` (« aucun signal ») → on n'ouvre PAS les sélecteurs mais on DIT
 * pourquoi (on ne cache pas sans dire) ; le schéma reste consultable. RÉVERSIBLE. ⚠️ AUCUN valider/refuser, AUCUNE injection (FUS-3e).
 */
export function AffectationBloc({ affectation, persiste, enAttenteBati = false, onAffecter }: { affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean; onAffecter?: (corpsId: number, cleabs: string | null) => void }) {
  const { corps, polygones, schema, motif, colonneManquante } = affectation;
  const nonAffectes = polygonesNonAffectes(corps, polygones);
  return (
    <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700 }}>
        Affectation des polygones aux bâtiments
        <InfoDepliable label="comment lire le schéma d’affectation">BD TOPO ne nomme pas ses polygones (seulement un cleabs illisible). Chaque polygone de l’empreinte reçoit un repère STABLE (A, B, C…) et une couleur sur le schéma. Repérez-le sur vos plans de la GED et sur Street View, puis affectez-le au bon corps. Un polygone affecté disparaît des choix des autres corps ; une affectation reste modifiable ; un corps peut rester sans polygone.</InfoDepliable>
      </div>
      {colonneManquante && <div role="alert" style={{ color: 'var(--color-svv-red)' }}>Affectation indisponible : migration 117 non appliquée.</div>}
      {motif
        ? <div style={{ ...styleAide, fontStyle: 'italic' }}>{motif}</div>
        : (
          <>
            {/* Schéma + légende : TOUJOURS rendus (informatifs — comprendre le site), quel que soit l'état du dossier. */}
            <SchemaEmpreinteSvg schema={schema} corps={corps} />
            <LegendeAffectation />
            {!persiste ? (
              // « Aucun signal » (dossier non persisté) : on n'ouvre pas l'arbitrage, mais on DIT pourquoi (jamais de disparition muette).
              <div role="note" style={{ ...styleAide }}>
                Aucun signal de mise à jour n’a encore été détecté pour ce permis : il n’y a rien à arbitrer pour l’instant. L’affectation des polygones aux bâtiments s’ouvrira dès qu’un changement (parcelle ou bâti) sera détecté. Le schéma ci-dessus reste consultable pour comprendre le site.
              </div>
            ) : enAttenteBati ? (
              // DAACT / fusion sans bâti : dossier ouvert, mais le bâtiment n'est pas encore mesuré → affectation FERMÉE (on n'invente pas un polygone).
              <div role="note" style={{ ...styleAide }}>
                En attente du bâti : les travaux sont déclarés terminés, mais BD TOPO n’a pas encore de bâtiment mesuré dans l’empreinte. L’affectation s’ouvrira quand le bâtiment apparaîtra — on n’affecte pas un polygone préexistant à un bâtiment qui n’est pas encore construit.
              </div>
            ) : (
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
                            {options.map((o) => <option key={o.cleabs ?? o.repere} value={o.cleabs ?? ''}>polygone {o.repere}{o.horsEmpreinte ? ' (hors empreinte)' : ''}</option>)}
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
            )}
          </>
        )}
    </div>
  );
}
