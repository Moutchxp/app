'use client'; // FUS-3c-quater — ce module porte désormais des disclosures interactives (« i »), donc composants clients.

import { useState, useId, useEffect, useRef, Fragment, type CSSProperties, type ReactNode } from 'react';
// ⚠️ Piège du bundle client : on n'importe d'un module serveur que des TYPES (jamais un runtime — rattachementSuiviRepo importe db/client).
import type { LigneSuivi, DetailSuivi, EtatSuivi } from '../../../../lib/permis/rattachementSuiviRepo';
import type { CritereSurface, CritereBordure, CritereBati } from '../../../../lib/permis/detectionRattachement';
import type { AffectationEtat } from '../../../../lib/permis/affectationRepo'; // TYPE seul (module serveur)
// affectationSchema est PUR (aucun import serveur) → on peut importer ses fonctions dans le bundle client.
import { optionsPourCorps, polygonesNonAffectes, corpsDuPolygone, couleurRepere, indexDepuisRepere, etatSurlignement, PALETTE_REPERE, type SchemaEmpreinte, type CorpsAffectation, type AttributsPolygone, type ActionAffectation } from '../../../../lib/permis/affectationSchema';
// rattachementGroupes est PUR (import de TYPE seul depuis le repo, erasé) → client-safe. Source UNIQUE de la coupure en deux (L6).
import { estAFaire, GROUPE1_TITRE, GROUPE2_TITRE } from '../../../../lib/permis/rattachementGroupes';

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

/**
 * L7 — panneau de détail inséré dans le flux de la liste : TRAME GRISE (fond gris clair + hachures 45° discrètes) pour contraster
 * nettement avec les lignes de permis (blanches). Les cartes internes du détail (`svv-card`) restent blanches → la trame encadre et
 * délimite visiblement où commence/finit le détail. Thème clair, aucune icône, rien d'animé.
 */
const styleTrameDetail: CSSProperties = {
  listStyle: 'none', padding: '.5rem', marginTop: '.1rem', borderRadius: '.4rem', border: '1px solid var(--color-svv-line)',
  backgroundColor: '#f4f4f5', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,.05) 0 1px, transparent 1px 7px)',
};

/**
 * L11 — lignes de la BULLE d'un polygone (constat AVANT travaux). PUR → testable. La SOURCE est nommée sans ambiguïté (figé au gel
 * vs actuel). HAUTEUR (élévation depuis le sol, m) et ALTITUDE DE TOIT (cote NGF absolue) sont NOMMÉES SÉPARÉMENT — jamais fusionnées.
 * Donnée absente → « non renseigné » (jamais un blanc ni un zéro inventé). La surface est arrondie à 0,1 m² pour l'AFFICHAGE seul
 * (valeur brute Lambert-93 non altérée, ne sert à aucun calcul).
 */
/**
 * L12 — un polygone est-il du FUTUR BÂTI ? (état IGN « En projet » ou « En construction ») : ce que le permis va faire sortir de
 * terre, par opposition à l'existant. Attribut DÉJÀ figé (L9). NULL (capture < migration 145) → false, jamais confondu avec futur.
 */
export function estFuturBati(etat: string | null | undefined): boolean {
  return etat === 'En projet' || etat === 'En construction';
}

/** L12 — libellé d'état pour la BULLE. Futur bâti nommé « futur bâti » (règle Arno) ; sinon valeur IGN brute ; NULL → « non renseigné ». */
export function libelleEtatBati(etat: string | null | undefined): string {
  if (etat == null) return 'non renseigné';
  if (etat === 'En projet') return 'en projet (futur bâti)';
  if (etat === 'En construction') return 'en construction (futur bâti)';
  return etat.toLowerCase(); // « en service », « en ruine » : valeur IGN brute
}

export function lignesBulle(cleabs: string | null, a: AttributsPolygone | undefined, sourceLibelle: string): string[] {
  const nr = 'non renseigné';
  const surf = a?.surfaceM2 != null ? `${Math.round(a.surfaceM2 * 10) / 10} m²` : nr;
  return [
    `Source : ${sourceLibelle}`,
    `cleabs : ${cleabs ?? nr}`,
    `état : ${libelleEtatBati(a?.etatDeLObjet)}`, // L12 — l'état IGN (futur bâti vs existant vs non renseigné)
    `étages : ${a?.nombreEtages != null ? a.nombreEtages : nr}`,
    `surface : ${surf}`,
    `hauteur (depuis le sol) : ${a?.hauteurM != null ? `${a.hauteurM} m` : nr}`,
    `altitude de toit (NGF) : ${a?.altitudeToitNgf != null ? `${a.altitudeToitNgf} m NGF` : nr}`,
  ];
}

/**
 * L11 — l'interrupteur UNIQUE « Afficher les repères ». Le MÊME composant est monté en vue réduite ET en plein écran : un seul
 * réglage de lecture (piloté par la Vue), deux endroits qui le basculent. Coché → lettres + bulles ; décoché → ni lettre, ni halo, ni bulle.
 */
export function InterrupteurReperes({ afficherReperes, onAfficherReperes }: { afficherReperes: boolean; onAfficherReperes: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: 12, width: 'auto' }}>
      <input type="checkbox" checked={afficherReperes} onChange={(e) => onAfficherReperes(e.target.checked)}
        aria-label="Afficher les repères et les bulles d’information sur les schémas" />
      <span>Afficher les repères (A, B, C…) et les infos au survol</span>
    </label>
  );
}

/**
 * L13/L14 — interrupteur SÉPARÉ, INDÉPENDANT de celui des repères. Il ne RETIRE JAMAIS un polygone : il ne fait que MONTRER/MASQUER
 * la MARQUE (croisillon) qui signale « ici il y aura du neuf ». Tous les polygones restent dessinés dans les deux états. N'a de sens
 * que s'il y a du futur bâti à signaler → la Vue ne le monte que dans ce cas.
 */
export function InterrupteurFuturBati({ afficherFutur, onAfficherFutur }: { afficherFutur: boolean; onAfficherFutur: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', fontSize: 12, width: 'auto' }}>
      <input type="checkbox" checked={afficherFutur} onChange={(e) => onAfficherFutur(e.target.checked)}
        aria-label="Signaler le futur bâti (en projet) par un croisillon sur les schémas" />
      <span>Signaler le futur bâti (en projet)</span>
    </label>
  );
}

/** L1 — formate une date ISO 'YYYY-MM-DD' en 'JJ/MM/AAAA'. Découpage de chaîne (jamais `new Date`) : déterministe et sans piège de fuseau. */
export function formatDateFr(iso: string | null): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export type TonBadge = 'urgence' | 'attente' | 'valide' | 'neutre' | 'manuel';
export interface BadgeSuivi { libelle: string; ton: TonBadge }

function tonEtat(etat: EtatSuivi): TonBadge {
  if (etat === 'arbitrage_demande') return 'urgence';
  if (etat === 'en_attente_bati') return 'attente';
  if (etat === 'valide') return 'valide';
  return 'neutre';
}

/**
 * M7-ter — DÉRIVE le badge d'un dossier. Un dossier OUVERT À LA MAIN (origine_ouverture='manuelle', M5) ne se fait PAS passer pour une
 * détection : libellé « ouvert à la main », ton NEUTRE (jamais l'urgence rouge du moteur — ce n'est pas une alerte, c'est Arno qui a
 * ouvert). Sinon (detection, OU origine absente = données < migration 147 → on ne plante pas) : comportement ACTUEL (libellé = état,
 * ton dérivé de l'état). PUR. La couleur n'est jamais seule porteuse : le libellé suffit.
 */
export function badgeSuivi(e: { origineOuverture: 'detection' | 'manuelle' | null; etat: EtatSuivi; verdict: string | null }): BadgeSuivi {
  if (e.origineOuverture === 'manuelle') return { libelle: 'ouvert à la main', ton: 'manuel' };
  return { libelle: LIBELLE_ETAT_SUIVI[e.etat], ton: tonEtat(e.etat) };
}

function fondTon(ton: TonBadge): CSSProperties {
  switch (ton) {
    case 'urgence': return { background: 'var(--color-svv-red)', color: '#fff' };
    case 'attente': return { background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' };
    case 'valide': return { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' };
    case 'manuel': return { background: '#fff', color: 'var(--color-svv-ink)', border: '1px solid var(--color-svv-line)' }; // neutre encadré, jamais l'urgence rouge
    default: return { background: 'transparent', color: 'var(--color-svv-muted)' };
  }
}

export function BadgeEtatSuivi({ etat, origineOuverture = null, verdict = null }: { etat: EtatSuivi; origineOuverture?: 'detection' | 'manuelle' | null; verdict?: string | null }) {
  const { libelle, ton } = badgeSuivi({ origineOuverture, etat, verdict });
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '.1rem .45rem', borderRadius: '.35rem', whiteSpace: 'nowrap', ...fondTon(ton) }}>
      {libelle}
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

/** L7 — id stable du panneau de détail d'un dossier (relie le bouton `aria-controls` et le panneau `id`). */
const idDetailSuivi = (dossierId: number): string => `detail-suivi-${dossierId}`;

/** Une ligne de suivi. La DATE affichée dépend du groupe : « déclenché le… » (à faire, trié par déclenchement) vs « permis autorisé le… » (en attente, trié par permis). */
function LigneSuiviLi({ l, groupe, onOuvrir, ouvert }: { l: LigneSuivi; groupe: 'a_faire' | 'en_attente'; onOuvrir?: (dossierId: number) => void; ouvert?: number | null }) {
  // M7-ter — un dossier ouvert À LA MAIN n'a été « déclenché » par rien : la date est celle de l'ouverture manuelle.
  const prefixeDeclenchement = l.origineOuverture === 'manuelle' ? 'ouvert à la main le' : 'déclenché le';
  const dateTexte = groupe === 'a_faire'
    ? (l.dateDeclenchementIso ? `${prefixeDeclenchement} ${formatDateFr(l.dateDeclenchementIso)}` : <em style={{ color: 'var(--color-svv-muted)' }}>date de déclenchement inconnue</em>)
    : (l.dateAutorisationIso ? `permis autorisé le ${formatDateFr(l.dateAutorisationIso)}` : <em style={{ color: 'var(--color-svv-muted)' }}>date d’autorisation inconnue</em>);
  return (
    <li style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap', paddingBottom: '.2rem', borderBottom: '1px solid var(--color-svv-line)' }}>
      {/* Le BADGE d'état reste sur chaque ligne (l'info d'état n'est plus portée par la carte, mais par la ligne). M7-ter : dérivé de l'origine. */}
      <BadgeEtatSuivi etat={l.etat} origineOuverture={l.origineOuverture} verdict={l.verdict} />
      {/* FUS-3c-ter — n° + type/nature + adresse ; l'ouverture passe par un BOUTON EXPLICITE, pas un clic sur la ligne. */}
      <span style={{ fontFamily: 'var(--font-svv-mono, monospace)', fontWeight: 700 }}>{l.numDau}</span>
      <span>{l.type}{l.natureTravaux ? ` — ${l.natureTravaux}` : ''}</span>
      <span style={{ color: 'var(--color-svv-muted)' }}>{l.adresse ?? l.commune ?? `INSEE ${l.codeInsee}`}</span>
      {/* Date du critère de tri du groupe (déclenchement OU autorisation), libellée sans ambiguïté ; absence DITE, jamais un blanc. */}
      <span style={{ fontSize: 12, color: 'var(--color-svv-ink)', whiteSpace: 'nowrap' }}>{dateTexte}</span>
      <span style={{ ...styleAide, marginLeft: 'auto' }}>
        {l.derniereEvalIso ? `évalué le ${l.derniereEvalIso} · ` : ''}{ancienneteTexte(l)}
      </span>
      <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', padding: '.2rem .6rem', fontSize: 12 }}
        aria-expanded={ouvert === l.dossierId} aria-controls={idDetailSuivi(l.dossierId)} onClick={() => onOuvrir?.(l.dossierId)}>
        {ouvert === l.dossierId ? 'Fermer le détail' : 'Ouvrir le détail'}
      </button>
    </li>
  );
}

/**
 * L6 — récapitulatif en DEUX GROUPES visiblement distincts (règle Arno) : ① « Rattachement à faire » (arbitrage ouvert, PRIORITÉ
 * absolue, trié par date de déclenchement décroissante) ; ② « En attente d'une mise à jour » (le reste, trié par date de permis
 * décroissante). Les `lignes` arrivent DÉJÀ triées (groupe 1 en tête) par `listerSuivi` ; le filtre préserve l'ordre. Le groupe 1
 * VIDE (cas actuel : aucun déclencheur n'a jamais tourné) est DIT explicitement, jamais laissé croire à un écran incomplet.
 */
export function TableSuivi({ lignes, onOuvrir, ouvert, renderDetail }: {
  lignes: LigneSuivi[]; compteurs?: Record<EtatSuivi, number>; onOuvrir?: (dossierId: number) => void; ouvert?: number | null;
  renderDetail?: (dossierId: number) => ReactNode; // L7 — contenu du détail, inséré DANS LE FLUX sous la ligne ouverte (fourni par la Vue)
}) {
  if (lignes.length === 0) return <div className="svv-card" style={styleAide}>Aucun permis suivi (aucune parcelle analysée pour l’instant).</div>;
  const aFaire = lignes.filter((l) => estAFaire(l.etat));
  const enAttente = lignes.filter((l) => !estAFaire(l.etat));
  const ul = (items: LigneSuivi[], groupe: 'a_faire' | 'en_attente') => (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
      {items.map((l) => (
        <Fragment key={l.dossierId}>
          <LigneSuiviLi l={l} groupe={groupe} onOuvrir={onOuvrir} ouvert={ouvert} />
          {/* L7 — le détail s'insère ICI, juste APRÈS sa ligne et AVANT la suivante (reste dans son GROUPE, jamais en fin de section).
              TRAME GRISE de fond → contraste net avec les lignes de permis (blanches) : on voit où commence/finit le détail. */}
          {ouvert === l.dossierId && renderDetail && (
            <li id={idDetailSuivi(l.dossierId)} style={styleTrameDetail}>{renderDetail(l.dossierId)}</li>
          )}
        </Fragment>
      ))}
    </ul>
  );
  const titreGroupe = (t: string, n: number): ReactNode => (
    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: '.3rem' }}>{t} <span style={{ color: 'var(--color-svv-muted)', fontWeight: 400 }}>({n})</span></div>
  );
  return (
    <div className="flex flex-col gap-3">
      {/* ① GROUPE 1 — priorité absolue. Toujours affiché (même vide) pour que la coupure soit visible. */}
      <section className="svv-card" role="group" aria-label={GROUPE1_TITRE} style={{ padding: '.5rem' }}>
        {titreGroupe(GROUPE1_TITRE, aFaire.length)}
        {aFaire.length === 0
          ? <div style={styleAide}>Aucun rattachement à faire pour l’instant : aucun déclencheur n’a encore signalé de changement à arbitrer.</div>
          : ul(aFaire, 'a_faire')}
      </section>
      {/* ② GROUPE 2 — en attente d'une mise à jour. */}
      {enAttente.length > 0 && (
        <section className="svv-card" role="group" aria-label={GROUPE2_TITRE} style={{ padding: '.5rem' }}>
          {titreGroupe(GROUPE2_TITRE, enAttente.length)}
          {ul(enAttente, 'en_attente')}
        </section>
      )}
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
        <BadgeEtatSuivi etat={detail.etat} origineOuverture={detail.origineOuverture} verdict={detail.verdict} />
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
        {/* L8 — millésime bâti = registre BD TOPO (autorité) ; null = registre absent/vide → « non renseigné » (jamais le proxy, jamais un blanc). Cadastre inchangé. */}
        {' '}Millésimes : cadastre {detail.millesimeCadastre ?? '—'} · bâti {detail.millesimeBati ?? 'non renseigné'}.
      </div>
    </div>
  );
}

// ── FUS-3e — les trois décisions (valider / refuser / retour LiDAR) ──────────
/**
 * M3 — SAISIE d'une COTE PAR POLYGONE affecté, au moment de l'injection. Chaque polygone affecté a son champ (repère + cleabs pour
 * croiser le schéma), pré-rempli avec l'altitude de sommet du bâtiment. « Recopier partout » (≥ 2 polygones) pousse la 1re cote sur
 * les autres — le SEUL moyen d'attribuer la même valeur, et c'est un geste EXPLICITE. Un champ VIDE n'est pas injecté (dit à l'écran).
 * Contrôlé : l'état `cotes` (cleabs → chaîne saisie) vit dans la Vue.
 */
export function SaisieCotesInjection({ affectation, cotes, onCote, onRecopier, misEnAvant = null, onMiseEnAvant }: {
  affectation: AffectationEtat;
  cotes: Record<string, string>;
  onCote: (cleabs: string, valeur: string) => void;
  onRecopier: (corpsId: number) => void;
  misEnAvant?: string | null;                       // M7 — cleabs actuellement mis en avant dans le schéma (réciprocité)
  onMiseEnAvant?: (cleabs: string) => void;         // M7 — le focus d'un champ met en avant CE polygone dans le schéma
}) {
  const { corps, polygones } = affectation;
  const repereDe = (cleabs: string) => polygones.find((p) => p.cleabs === cleabs)?.repere ?? '?';
  const batiments = corps.filter((c) => c.cleabsAffectes.length > 0);
  if (batiments.length === 0) return null;
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 600 }}>Polygones sélectionnés — altitude à injecter</div>
      <div style={styleAide}>Les polygones cochés, avec leur repère, leur couleur et leur cleabs. Chaque polygone reçoit SA cote (m NGF), pré-remplie avec l’altitude de sommet du bâtiment ; corrigez un socle bas si besoin. Un champ laissé vide n’est pas injecté pour ce polygone.</div>
      {/* M7 — canal ACCESSIBLE : dit à voix haute quel polygone le champ courant met en avant dans le schéma (la couleur n'est jamais seule porteuse). */}
      <div role="status" aria-live="polite" style={{ ...styleAide, minHeight: '1.2em' }}>
        {misEnAvant ? `Polygone ${repereDe(misEnAvant)} mis en avant dans le schéma.` : ''}
      </div>
      {batiments.map((c) => (
        <fieldset key={c.id} style={{ border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', margin: 0, padding: '.5rem', display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
          <legend style={{ ...styleAide, padding: '0 .3rem' }}>{c.repere ?? `bâtiment ${c.id}`}</legend>
          {c.cleabsAffectes.map((cleabs) => {
            const val = cotes[cleabs] ?? '';
            const vide = val.trim() === '';
            const champId = `cote-${c.id}-${cleabs}`;
            const repere = repereDe(cleabs);
            const enAvant = cleabs === misEnAvant; // M7 — cette ligne est-elle celle mise en avant dans le schéma ?
            return (
              <div key={cleabs} data-mis-en-avant={enAvant ? 'true' : undefined}
                style={{ display: 'flex', gap: '.4rem', alignItems: 'baseline', flexWrap: 'wrap', padding: '.15rem .25rem', borderRadius: '.3rem',
                  background: enAvant ? 'var(--color-svv-field)' : undefined, boxShadow: enAvant ? 'inset 3px 0 0 var(--color-svv-ink)' : undefined }}>
                <label htmlFor={champId} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '.3rem', fontSize: 12, minWidth: 130 }}>
                  {/* pastille = MÊME couleur de repère que le remplissage du schéma (aide à la reconnaissance visuelle ; jamais seule porteuse). */}
                  <span aria-hidden="true" style={{ alignSelf: 'center', display: 'inline-block', width: 11, height: 11, borderRadius: 2, background: couleurRepere(indexDepuisRepere(repere)), border: '1px solid var(--color-svv-line)', flexShrink: 0 }} />
                  <span>polygone {repere} <span style={styleAide}>· {cleabs}</span></span>
                </label>
                <input id={champId} type="number" inputMode="decimal" step="0.01" value={val}
                  onChange={(e) => onCote(cleabs, e.target.value)}
                  onFocus={() => onMiseEnAvant?.(cleabs)}
                  aria-label={`altitude de sommet du polygone ${repereDe(cleabs)}, en mètres NGF`}
                  style={{ width: 110, padding: '.2rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12, fontFamily: 'inherit' }} />
                <span style={styleAide}>m NGF{vide ? ' — non injecté' : ''}{enAvant ? ' — mis en avant' : ''}</span>
              </div>
            );
          })}
          {c.cleabsAffectes.length > 1 && (
            <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', alignSelf: 'flex-start' }}
              onClick={() => onRecopier(c.id)}>Recopier la cote du polygone {repereDe(c.cleabsAffectes[0])} sur tous les polygones</button>
          )}
        </fieldset>
      ))}
    </div>
  );
}

/**
 * M5 — BLOC d'OUVERTURE MANUELLE : n'apparaît QUE quand aucun dossier n'existe (aucun signal détecté). Dit franchement qu'aucun
 * changement BD TOPO n'a été détecté et que l'ouverture sera tracée comme MANUELLE. Motif OBLIGATOIRE (bouton inactif tant qu'il est
 * vide). Contrôlé : le motif vit dans la Vue.
 */
export function OuvertureManuelle({ motif, onMotif, onOuvrir, enCours }: {
  motif: string; onMotif: (v: string) => void; onOuvrir: () => void; enCours: boolean;
}) {
  const champId = 'motif-ouverture-manuelle';
  return (
    <div className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 600 }}>Ouvrir l’arbitrage manuellement</div>
      <div style={styleAide}>
        Aucun changement BD TOPO n’a été détecté pour ce permis : le déclencheur automatique n’ouvre donc rien. Vous pouvez ouvrir
        l’arbitrage à la main (pour vérifier ou affecter des polygones). <strong>Ce n’est pas une détection</strong> — l’ouverture
        sera tracée comme <strong>manuelle</strong>, en base et au journal.
      </div>
      <label htmlFor={champId} style={{ ...styleAide, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        Motif de l’ouverture manuelle (obligatoire)
        <input id={champId} type="text" value={motif} onChange={(e) => onMotif(e.target.value)}
          placeholder="ex. vérification d’une affectation"
          style={{ padding: '.3rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12, fontFamily: 'inherit' }} />
      </label>
      <button type="button" className="svv-btn" style={{ width: 'auto', alignSelf: 'flex-start' }}
        disabled={enCours || motif.trim() === ''} onClick={onOuvrir}>Ouvrir l’arbitrage manuellement</button>
    </div>
  );
}

/**
 * M5 — BANDEAU d'honnêteté : affiché quand le dossier ouvert l'a été À LA MAIN. Empêche Arno de croire qu'un changement BD TOPO a été
 * détecté. Rappelle comment refermer (Refuser).
 */
export function BandeauOuvertureManuelle({ motif }: { motif: string | null }) {
  return (
    <div role="note" style={{ ...styleAide, border: '1px solid var(--color-svv-line)', borderRadius: '.4rem', padding: '.4rem .5rem' }}>
      <strong>Dossier ouvert manuellement</strong> — aucun changement BD TOPO n’a été détecté ; l’arbitrage a été ouvert à la main.
      {motif ? ` Motif : ${motif}.` : ''} Pour le refermer, utilisez « Refuser » (avec un motif) : la trace au journal est conservée.
    </div>
  );
}

// ── M8 — accusé de prise en compte + résumé avant validation ──────────────────
export interface ReponseValidationOk { ok: true; nbInjectes: number; injections: { repere: string | null; cleabs: string; cote: number }[] }
export interface ReponseValidationEchec { ok: false; statut: number; erreur: string }
export type ReponseValidation = ReponseValidationOk | ReponseValidationEchec;
export interface AccuseValidationData { ton: 'succes' | 'echec'; titre: string; lignes: string[] }

/**
 * M8 — compose l'ACCUSÉ de prise en compte À PARTIR DE LA RÉPONSE SERVEUR (jamais de ce que le front croyait envoyer). PUR.
 * 🔴 GARDE D'HONNÊTETÉ : l'accusé énumère ce qui a RÉELLEMENT eu lieu (altitudes écrites, dossier « validé », journal alimenté, retour
 * LiDAR dispo) et PRÉCISE que le verdict SVAV / la carte / les certificats ne sont PAS modifiés (le moteur ne lit pas encore
 * permis_polygone_altitude). Un échec dit ce qui N'A PAS été écrit ; un 401 dit « session expirée », jamais « échec de l'injection ».
 */
export function composerAccuse(r: ReponseValidation): AccuseValidationData {
  if (!r.ok) {
    if (r.statut === 401) return { ton: 'echec', titre: 'Session expirée', lignes: ['Reconnectez-vous : votre session administrateur a expiré. Aucune altitude n’a été écrite, la validation n’a pas eu lieu.'] };
    return { ton: 'echec', titre: 'Validation impossible', lignes: [r.erreur || 'La validation a échoué.', 'Aucune altitude n’a été écrite ; le dossier n’a pas changé d’état.'] };
  }
  const lignes: string[] = [];
  if (r.nbInjectes === 0) lignes.push('Aucune altitude injectée (aucun champ de cote renseigné).');
  else {
    lignes.push(`${r.nbInjectes} altitude${r.nbInjectes > 1 ? 's' : ''} écrite${r.nbInjectes > 1 ? 's' : ''} (origine « permis ») :`);
    for (const inj of r.injections) lignes.push(`• polygone ${inj.repere ?? '?'} → ${inj.cote} m NGF`);
  }
  lignes.push('Le dossier est passé à « validé ».');
  lignes.push('Le journal d’altitudes (append-only) a été alimenté ; le retour LiDAR reste disponible.');
  lignes.push('Le verdict Sans Vis-à-Vis, la carte et les certificats ne sont PAS modifiés : l’injection alimente le registre d’altitudes, pas le calcul du verdict.');
  return { ton: 'succes', titre: 'Validation prise en compte', lignes };
}

export interface ResumeValidation { nbAffectes: number; nbAvecCote: number; nbVides: number; nbNonAffectes: number }

/** M8 — décompte AVANT le clic : ce qui va être écrit (polygones affectés avec cote) vs laissé de côté (champs vides ; polygones non affectés). PUR. */
export function resumeValidation(affectation: { corps: CorpsAffectation[]; polygones: AffectationEtat['polygones'] }, cotes: Record<string, number | null>): ResumeValidation {
  const affectes = affectation.corps.flatMap((c) => c.cleabsAffectes);
  const nbAvecCote = affectes.filter((cl) => { const v = cotes[cl]; return typeof v === 'number' && Number.isFinite(v); }).length;
  const nbNonAffectes = polygonesNonAffectes(affectation.corps, affectation.polygones).filter((p) => p.cleabs !== null).length;
  return { nbAffectes: affectes.length, nbAvecCote, nbVides: affectes.length - nbAvecCote, nbNonAffectes };
}

/** M8 — accusé rendu (persistant, annoncé aria-live ; couleur JAMAIS seule porteuse : titre + lignes en toutes lettres). */
export function AccuseValidation({ accuse }: { accuse: AccuseValidationData }) {
  const succes = accuse.ton === 'succes';
  return (
    <div role="status" aria-live="polite" className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.25rem',
      borderColor: succes ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red)', background: succes ? 'var(--color-svv-green-soft)' : 'var(--color-svv-red-soft)' }}>
      <div style={{ fontWeight: 700, color: succes ? 'var(--color-svv-green-ink)' : 'var(--color-svv-red-dark)' }}><span aria-hidden="true">{succes ? '✓ ' : '✕ '}</span>{accuse.titre}</div>
      {accuse.lignes.map((l, i) => <div key={i} style={{ color: 'var(--color-svv-ink)' }}>{l}</div>)}
    </div>
  );
}

/**
 * Boutons de décision, PURS et contrôlés (l'état des champs vit dans la Vue). Trois actions distinctes, libellés explicites :
 *  · Valider → injecte les altitudes (origine 'permis'). Si la cardinalité est incohérente, `avertissement` s'affiche et un
 *    MOTIF de confirmation devient obligatoire (le bouton exige alors ce motif).
 *  · Refuser → motif OBLIGATOIRE.
 *  · Retour LiDAR → restaure l'altitude LiDAR d'origine (filet, reste possible après validation).
 * ⚠️ Aucune de ces actions ne change le verdict SVAV (le moteur ne lit pas encore permis_polygone_altitude).
 */
export function ActionsRattachement({ resume, motifRefus, onMotifRefus, onValider, onRefuser, onRetour, enCours }: {
  resume: ResumeValidation;
  motifRefus: string;
  onMotifRefus: (v: string) => void;
  onValider: () => void; onRefuser: () => void; onRetour: () => void; enCours: boolean;
}) {
  const styleTA: CSSProperties = { width: '100%', boxSizing: 'border-box', minHeight: '2.2rem', padding: '.3rem .4rem', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', fontSize: 12, fontFamily: 'inherit' };
  return (
    <div className="svv-card" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <div style={{ fontWeight: 700 }}>Décision</div>
      {/* Valider (M8 : plus de motif ; on INFORME avant le clic de ce qui sera écrit / laissé de côté). */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
        <div style={styleAide}>
          À la validation : <strong>{resume.nbAvecCote} polygone{resume.nbAvecCote > 1 ? 's' : ''} affecté{resume.nbAvecCote > 1 ? 's' : ''}</strong> recevr{resume.nbAvecCote > 1 ? 'ont' : 'a'} {resume.nbAvecCote > 1 ? 'leur' : 'sa'} cote.
          {resume.nbVides > 0 ? ` ${resume.nbVides} champ${resume.nbVides > 1 ? 's' : ''} laissé${resume.nbVides > 1 ? 's' : ''} vide${resume.nbVides > 1 ? 's' : ''} : non injecté${resume.nbVides > 1 ? 's' : ''}.` : ''}
          {resume.nbNonAffectes > 0 ? ` ${resume.nbNonAffectes} polygone${resume.nbNonAffectes > 1 ? 's' : ''} non affecté${resume.nbNonAffectes > 1 ? 's' : ''} (bâti hors permis, c’est normal) : laissé de côté.` : ''}
        </div>
        <button type="button" className="svv-btn" style={{ width: 'auto' }} onClick={onValider} disabled={enCours}>
          Valider le rattachement
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
export function SchemaEmpreinteSvg({ schema, corps, agrandi = false, rougeCleabs, afficherReperes = true, sourceLibelle = '', afficherFutur = true, cleabsMisEnAvant = null }: { schema: SchemaEmpreinte; corps: CorpsAffectation[]; agrandi?: boolean; rougeCleabs?: readonly string[]; afficherReperes?: boolean; sourceLibelle?: string; afficherFutur?: boolean; cleabsMisEnAvant?: string | null }) {
  const uid = useId();
  const trameId = `trame-${uid.replace(/:/g, '')}`; // id unique (deux schémas côte à côte en L5 ne partageront pas le motif)
  const hachureId = `hachure-${uid.replace(/:/g, '')}`; // L12 — croisillon du FUTUR BÂTI (id unique par schéma)
  const [actif, setActif] = useState<string | null>(null); // L11 — repère du polygone survolé/focalisé/tapé (bulle visuelle)
  if (schema.motif) return <div style={{ ...styleAide, fontStyle: 'italic' }}>{schema.motif}</div>;
  // L3 — `agrandi` (plein écran L13) : le schéma remplit la largeur et monte jusqu'à 72vh. M7-bis — `grand` (DÉRIVÉ : un champ de cote a
  //   le focus → cleabsMisEnAvant ≠ null) fait de MÊME EN VUE RÉDUITE, INLINE (SANS réutiliser le plein écran L13) : le schéma occupe
  //   toute sa colonne et grandit en hauteur pendant la saisie ; il retombe quand la mise en avant est remise à zéro (changement de dossier).
  const grand = !agrandi && cleabsMisEnAvant != null;
  const remplirLargeur = agrandi || grand;
  const dims = remplirLargeur ? { width: '100%' as const } : { width: schema.largeur, height: schema.hauteur };
  const styleSvg: CSSProperties = remplirLargeur
    ? { width: '100%', height: 'auto', maxHeight: agrandi ? '72vh' : '68vh', border: '1px solid var(--color-svv-line)', background: '#fff', borderRadius: '.4rem' }
    : { maxWidth: '100%', height: 'auto', border: '1px solid var(--color-svv-line)', background: '#fff', borderRadius: '.4rem' };
  // 🔴 M7-bis — ANTI-SAUT : dès qu'un champ a le focus, la HAUTEUR du conteneur du schéma est RÉSERVÉE (minHeight) → le grossissement
  //   ne réagence pas la page. La colonne des champs (à GAUCHE en desktop, colonnes indépendantes top-alignées ; AU-DESSUS en mobile,
  //   le schéma grandissant vers le BAS) ne bouge donc pas entre deux clics.
  const styleConteneur: CSSProperties = { position: 'relative', display: remplirLargeur ? 'block' : 'inline-block', maxWidth: '100%', width: remplirLargeur ? '100%' : undefined, minHeight: grand ? 'min(68vh, 520px)' : undefined };
  // M7-bis — dès qu'UN polygone est mis en avant, les AUTRES passent en retrait (atténués). Ne vaut que si le mis-en-avant est DANS ce schéma.
  const ilYaMiseEnAvant = cleabsMisEnAvant != null && schema.polygones.some((p) => p.cleabs === cleabsMisEnAvant);
  // L14 — l'interrupteur du futur bâti ne RETIRE JAMAIS un polygone (ne pas faire disparaître du bâti). TOUS les polygones sont
  //   toujours dessinés ; l'interrupteur ne bascule QUE la MARQUE (croisillon L12) — cf. plus bas `afficherFutur && estFuturBati(...)`.
  const actifPoly = afficherReperes ? schema.polygones.find((p) => p.repere === actif) ?? null : null;
  return (
    <div style={styleConteneur}>
      <svg viewBox={`0 0 ${schema.largeur} ${schema.hauteur}`} {...dims} role="img"
        aria-label="Schéma des polygones de la parcelle du permis, étiquetés par repère" style={styleSvg}>
        <defs>
          {/* ① trame grise du fond HORS parcelle : hachures à 45°, franches en niveaux de gris (impression N&B OK) */}
          <pattern id={trameId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill="#f4f4f5" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#c9ccd1" strokeWidth={1.2} />
          </pattern>
          {/* L12 — CROISILLON du futur bâti (« En projet »/« En construction ») : marque NON colorée, en surimpression sur le
              polygone. Un « X » par tuile → croisillon au pavage. Distinct de la trame grise 45° du hors-parcelle. */}
          <pattern id={hachureId} width={6} height={6} patternUnits="userSpaceOnUse">
            <path d="M0 0 L6 6 M6 0 L0 6" stroke="var(--color-svv-ink)" strokeWidth={0.7} strokeOpacity={0.55} fill="none" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={schema.largeur} height={schema.hauteur} fill={`url(#${trameId})`} />
        {/* ② parcelle : blanc plein par-dessus la trame → son contour se détache */}
        {schema.empreintePath && <path d={schema.empreintePath} fill="#fff" stroke="var(--color-svv-ink)" strokeWidth={1.5} />}
        {/* ③ TOUS les polygones (le futur bâti n'est JAMAIS retiré) : couleur par repère ; affecté = contour vert ; hors = tireté */}
        {schema.polygones.map((p) => {
          const affecte = !!corpsDuPolygone(corps, p.cleabs);
          const estRouge = p.cleabs != null && !!rougeCleabs?.includes(p.cleabs); // L5 — nouveau/modifié → rouge (jamais seul porteur)
          // M7/M7-bis — niveau de surlignement + « en retrait » (atténuation des AUTRES pendant qu'un polygone est mis en avant).
          const { niveau, enRetrait } = etatSurlignement({ estMisEnAvant: p.cleabs != null && p.cleabs === cleabsMisEnAvant, ilYaMiseEnAvant, affecte, actif: actif === p.repere });
          // L11 — quand les repères sont affichés : le polygone porte sa BULLE (<title> = survol natif + nom accessible au clavier) et
          // devient focalisable/tapable (équivalent tactile). Décoché → ni <title>, ni lettre, ni interactivité, ni bulle.
          const info = afficherReperes ? lignesBulle(p.cleabs, p.attributs, sourceLibelle) : null;
          const interactif = afficherReperes
            ? { tabIndex: 0, role: 'img' as const, 'aria-label': info!.join(' ; '), style: { cursor: 'pointer', outline: 'none' }, // outline:none → PAS d'anneau de focus bbox du navigateur (rectangle qui déborde) ; le halo ci-dessous épouse la forme

                onMouseEnter: () => setActif(p.repere), onMouseLeave: () => setActif(null),
                onFocus: () => setActif(p.repere), onBlur: () => setActif(null),
                onClick: () => setActif((a) => (a === p.repere ? null : p.repere)) } // tap : 1er appui affiche, 2e masque
            : {};
          return (
            // M7-bis — ATTÉNUATION : un polygone « en retrait » (un AUTRE est mis en avant) passe à opacité réduite EN BLOC (remplissage,
            //   contour, croisillon, lettre) ; le mis-en-avant garde son opacité pleine. L'empreinte et la trame (hors de ces <g>) restent lisibles.
            <g key={p.repere} opacity={enRetrait ? 0.22 : 1} {...interactif}>
              {info && <title>{info.join('\n')}</title>}
              {/* M6/M7 — SURLIGNEMENT qui ÉPOUSE la forme : on re-stroke le PROPRE `path` du polygone (jamais sa bbox), DERRIÈRE le
                  remplissage. « halo » (coché/affecté OU survol/focus) = fin trait encre semi-transparent ; « mis en avant » (le champ de
                  cote de ce polygone a le focus) = double liseré blanc+encre, OPAQUE et un peu plus large — mais c'est surtout l'ATTÉNUATION
                  des autres (ci-dessus) qui le fait ressortir sur une lanière étroite. Toujours DERRIÈRE : contour vert/tireté et croisillon restent dessus, distincts. */}
              {niveau === 'halo' && (
                <path d={p.path} fill="none" stroke="var(--color-svv-ink)" strokeWidth={3.5} strokeOpacity={0.42}
                  strokeLinejoin="round" pointerEvents="none" data-surlignement="true" />
              )}
              {niveau === 'mis-en-avant' && (
                <>
                  <path d={p.path} fill="none" stroke="#fff" strokeWidth={6.5} strokeOpacity={0.95} strokeLinejoin="round" pointerEvents="none" />
                  <path d={p.path} fill="none" stroke="var(--color-svv-ink)" strokeWidth={4} strokeLinejoin="round" pointerEvents="none" data-mis-en-avant="true" />
                </>
              )}
              <path d={p.path} fill={estRouge ? 'var(--color-svv-red)' : couleurRepere(indexDepuisRepere(p.repere))} fillOpacity={0.85}
                stroke={affecte ? 'var(--color-svv-green-ink)' : 'var(--color-svv-ink)'} strokeWidth={affecte ? 2.5 : 1}
                strokeDasharray={p.horsEmpreinte ? '3 2' : undefined} data-en-retrait={enRetrait ? 'true' : undefined} />
              {/* L12/L14 — FUTUR BÂTI (« En projet »/« En construction ») : croisillon en surimpression, NON coloré (le remplissage
                  reste la couleur du repère, aucun rouge). C'est la MARQUE de la projection : l'interrupteur `afficherFutur` la montre
                  (coché) ou la masque (décoché) — SANS jamais retirer le polygone, qui reste toujours dessiné à sa position. */}
              {afficherFutur && estFuturBati(p.attributs?.etatDeLObjet) && (
                <path d={p.path} fill={`url(#${hachureId})`} stroke="none" pointerEvents="none" data-futur-bati="true" />
              )}
              {/* L10 — repère + HALO masquables. Le path ci-dessus (forme + couleur) ne change jamais. */}
              {afficherReperes && (
                <text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}
                  fill="var(--color-svv-ink)" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.repere}</text>
              )}
            </g>
          );
        })}
      </svg>
      {/* L11 — bulle VISUELLE : épinglée EN BAS du schéma (jamais au-dessus du nom en haut, jamais hors cadre : left/right/bottom bornés).
          pointer-events:none → n'intercepte pas le survol du polygone dessous. Le <title> reste le canal natif/clavier/testable. */}
      {actifPoly && (
        <div role="status" aria-live="polite" style={{ position: 'absolute', left: 4, right: 4, bottom: 4, pointerEvents: 'none', background: 'rgba(255,255,255,.96)', border: '1px solid var(--color-svv-line)', borderRadius: '.35rem', padding: '.3rem .45rem', fontSize: 11, lineHeight: 1.35, color: 'var(--color-svv-ink)', overflowWrap: 'anywhere', boxShadow: '0 1px 4px rgba(0,0,0,.18)' }}>
          {lignesBulle(actifPoly.cleabs, actifPoly.attributs, sourceLibelle).map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 700 } : undefined}>{l}</div>)}
        </div>
      )}
    </div>
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
export function LegendeAffectation({ avecRouge = false }: { avecRouge?: boolean }) {
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
      {/* L5 — clé du rouge (uniquement sur « Nouvelle configuration ») : le rouge n'est jamais seul porteur, la légende le dit. */}
      {avecRouge && <span style={item}><span aria-hidden="true" style={chip('var(--color-svv-red)', '1px solid var(--color-svv-ink)')} />nouveau ou modifié depuis l’origine (rouge)</span>}
      <span style={item}><span aria-hidden="true" style={chip('#fff', '2.5px solid var(--color-svv-green-ink)')} />affecté à un corps (contour vert)</span>
      <span style={item}><span aria-hidden="true" style={chip('#fff', '1px dashed var(--color-svv-ink)')} />déborde de la parcelle (contour tireté)</span>
      <span style={item}><span aria-hidden="true" style={{ ...puceBase, backgroundImage: 'repeating-linear-gradient(45deg, #c9ccd1 0 1.2px, #f4f4f5 1.2px 6px)', border: '1px solid var(--color-svv-line)' }} />hors parcelle (trame grise)</span>
    </div>
  );
}

// L3/L5 — noms des DEUX schémas (même nomenclature d'affichage : mêmes repères, palette, trame, parcelle blanche).
export const NOM_SCHEMA_ORIGINE = 'Configuration d’origine';
export const NOM_SCHEMA_NOUVELLE = 'Nouvelle configuration';

/** L5 — mention de « Nouvelle configuration » : combien de polygones, dont combien en rouge (nouveaux/modifiés). */
export function descriptionSchemaNouvelle(nbPolys: number, nbRouge: number): string {
  const base = `Couche bâti actuelle — ${nbPolys} polygone${nbPolys > 1 ? 's' : ''}`;
  return nbRouge > 0 ? `${base}, dont ${nbRouge} nouveau${nbRouge > 1 ? 'x' : ''}/modifié${nbRouge > 1 ? 's' : ''} (en rouge).` : `${base}.`;
}

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
export function CorpsEtChoix({ affectation, persiste, enAttenteBati = false, onAffecter }: { affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean; onAffecter?: (corpsId: number, cleabs: string, action: ActionAffectation) => void }) {
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
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {corps.length === 0 && <li style={styleAide}>Aucun bâtiment déclaré au permis.</li>}
        {corps.map((c) => {
          // M2 — options = polygones proposables à CE bâtiment : `optionsPourCorps` exclut ceux pris par un AUTRE bâtiment
          // (exclusivité (a) côté écran) mais GARDE les siens (ils s'afficheront cochés). On coche via cleabsAffectes.includes.
          const options = optionsPourCorps(corps, polygones, c.id);
          const nbAffectes = c.cleabsAffectes.length;
          return (
            <li key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
              <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, minWidth: 90 }}>{c.repere ?? `bâtiment ${c.id}`}</span>
                <span style={styleAide}>{c.altitudeSommetNgf !== null ? `sommet ${c.altitudeSommetNgf} m NGF` : 'altitude —'}{c.nbEtages !== null ? ` · ${c.nbEtages} ét.` : ''}</span>
              </div>
              <fieldset disabled={colonneManquante} style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                <legend style={{ ...styleAide, padding: 0 }}>polygones (cochez tous ceux qui composent ce bâtiment) :</legend>
                {options.length === 0 && <span style={styleAide}>aucun polygone disponible pour ce bâtiment.</span>}
                {options.map((o) => {
                  const cle = o.cleabs;
                  if (cle === null) return null; // optionsPourCorps ne renvoie que des cleabs non nuls ; garde de typage
                  const coche = c.cleabsAffectes.includes(cle);
                  return (
                    <label key={cle} style={{ display: 'inline-flex', gap: '.4rem', alignItems: 'baseline', fontSize: 12, minHeight: 28 }}>
                      <input type="checkbox" value={cle} checked={coche} disabled={colonneManquante}
                        onChange={(e) => onAffecter?.(c.id, cle, e.target.checked ? 'ajout' : 'retrait')} />
                      <span>polygone {o.repere}{o.horsEmpreinte ? ' (déborde de la parcelle)' : ''} <span style={styleAide}>· {cle}</span></span>
                    </label>
                  );
                })}
                {nbAffectes > 1 && (
                  <div role="note" style={styleAide}>
                    Ce bâtiment porte {nbAffectes} polygones : chacun reçoit sa propre altitude au moment de la validation (bloc « Altitude à injecter »).
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>
      {nonAffectes.length > 0 && (
        <div role="note" style={{ ...styleAide, color: 'var(--color-svv-red)' }}>
          Polygones non affectés — {texteNonAffectes(nonAffectes)}. À affecter au bon bâtiment, ou à laisser si aucun ne correspond (bâtiments accolés / débords).
        </div>
      )}
    </>
  );
}

/**
 * FIGURE du schéma : le SVG + son NOM écrit DANS le visuel (figcaption en surimpression, pas seulement au-dessus). Quand `onAgrandir`
 * est fourni, la figure devient une cible cliquable ET focalisable au clavier (role=button, Entrée/Espace) → ouvre le plein écran.
 */
export function SchemaFigure({ schema, corps, titre, mention, agrandi = false, onAgrandir, rougeCleabs, afficherReperes = true, sourceLibelle = '', afficherFutur = true, cleabsMisEnAvant = null }: { schema: SchemaEmpreinte; corps: CorpsAffectation[]; titre?: string; mention?: string; agrandi?: boolean; onAgrandir?: () => void; rougeCleabs?: readonly string[]; afficherReperes?: boolean; sourceLibelle?: string; afficherFutur?: boolean; cleabsMisEnAvant?: string | null }) {
  const contenu = (
    <>
      <figure style={{ position: 'relative', margin: 0 }}>
        {titre && (
          <figcaption style={{ position: 'absolute', top: 6, left: 6, zIndex: 1, fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,.85)', color: 'var(--color-svv-ink)', padding: '.1rem .45rem', borderRadius: '.3rem', border: '1px solid var(--color-svv-line)' }}>{titre}</figcaption>
        )}
        <SchemaEmpreinteSvg schema={schema} corps={corps} agrandi={agrandi} rougeCleabs={rougeCleabs} afficherReperes={afficherReperes} sourceLibelle={sourceLibelle} afficherFutur={afficherFutur} cleabsMisEnAvant={cleabsMisEnAvant} />
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
export function LegendeRepetesComplete({ schema, corps, rougeCleabs, afficherFutur = true }: { schema: SchemaEmpreinte; corps: CorpsAffectation[]; rougeCleabs?: readonly string[]; afficherFutur?: boolean }) {
  // L14 — la légende liste TOUS les polygones (le futur bâti n'est jamais retiré → le compte reste cohérent : 16 = 16).
  if (schema.polygones.length === 0) return <div style={styleAide}>Aucun polygone dans la parcelle du permis.</div>;
  const deborde = schema.polygones.some((p) => p.horsEmpreinte); // au moins un bâtiment déborde de la parcelle du permis
  const estRouge = (cleabs: string | null) => cleabs != null && !!rougeCleabs?.includes(cleabs);
  const yAduRouge = schema.polygones.some((p) => estRouge(p.cleabs));
  // L12/L14 — la clé du croisillon n'a de sens que si la MARQUE est affichée (`afficherFutur`) ET qu'il y a du futur bâti.
  const nbFutur = afficherFutur ? schema.polygones.filter((p) => estFuturBati(p.attributs?.etatDeLObjet)).length : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      {/* L10 — chaque repère ASSOCIÉ à son cleabs (la clé de lecture dessin ↔ identité). cleabs LONG → jamais dans le polygone,
          seulement ici : chasse fixe, sélectionnable d'un clic (copie). Liste verticale (une entrée par ligne) pour le lire en entier. */}
      <ul role="note" aria-label="Légende : chaque repère et son cleabs" style={{ ...styleAide, margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
        {schema.polygones.map((p) => {
          const corpsAff = corpsDuPolygone(corps, p.cleabs);
          const rouge = estRouge(p.cleabs);
          const note = corpsAff ? ` → ${corpsAff.repere ?? `corps ${corpsAff.id}`}` : p.horsEmpreinte ? ' (déborde de la parcelle)' : '';
          return (
            <li key={p.repere} style={{ display: 'flex', alignItems: 'baseline', gap: '.35rem', overflowWrap: 'anywhere' }}>
              <span aria-hidden="true" style={{ alignSelf: 'center', flexShrink: 0, display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: rouge ? 'var(--color-svv-red)' : couleurRepere(indexDepuisRepere(p.repere)), opacity: 0.85, border: p.horsEmpreinte ? '1px dashed var(--color-svv-ink)' : `1px solid ${corpsAff ? 'var(--color-svv-green-ink)' : 'var(--color-svv-ink)'}` }} />
              <strong style={{ flexShrink: 0 }}>{p.repere}</strong>
              <span aria-hidden="true" style={{ flexShrink: 0, color: 'var(--color-svv-muted)' }}>→</span>
              <span style={{ fontFamily: 'var(--font-svv-mono, monospace)', userSelect: 'all', wordBreak: 'break-all' }}>{p.cleabs ?? '(sans cleabs)'}</span>
              {(note || rouge) && <span style={{ flexShrink: 0, color: 'var(--color-svv-muted)' }}>{note}{rouge ? ' (nouveau/modifié)' : ''}</span>}
            </li>
          );
        })}
      </ul>
      {/* L12 — clé du FUTUR BÂTI : la puce HACHURÉE (croisillon) + ce qu'elle signifie + le COMPTE (utile hors du dessin). Non colorée. */}
      {nbFutur > 0 && (
        <div role="note" style={{ ...styleAide, display: 'flex', alignItems: 'baseline', gap: '.3rem' }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: '#fff', backgroundImage: 'repeating-linear-gradient(45deg, var(--color-svv-ink) 0 .7px, transparent .7px 4px), repeating-linear-gradient(-45deg, var(--color-svv-ink) 0 .7px, transparent .7px 4px)', border: '1px solid var(--color-svv-line)' }} />
          <span><strong>Hachuré = futur bâti (en projet)</strong> — {nbFutur} polygone{nbFutur > 1 ? 's' : ''} que le permis va faire sortir de terre (pas l’existant déjà construit).</span>
        </div>
      )}
      {/* L5 — clé du ROUGE : la puce rouge + ce qu'elle signifie (le rouge n'est jamais seul porteur). */}
      {yAduRouge && (
        <div role="note" style={{ ...styleAide, display: 'flex', alignItems: 'baseline', gap: '.3rem' }}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: 'var(--color-svv-red)', opacity: 0.85, border: '1px solid var(--color-svv-ink)' }} />
          <span><strong>Rouge = nouveau ou modifié depuis l’origine</strong> — ce qui a bougé par rapport à l’état figé.</span>
        </div>
      )}
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
 * COQUILLE de dialogue plein écran (L3, extraite en L5 pour être partagée par le plein écran simple ET le comparatif — ZÉRO
 * duplication de la logique de focus). Vrai DIALOGUE : role=dialog, aria-modal, titre annoncé, focus piégé à l'ouverture et RENDU
 * au déclencheur à la fermeture, Échap EN SUPPLÉMENT du bouton Fermer. Aucune animation (prefers-reduced-motion d'office).
 */
export function DialoguePleinEcran({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  const dialogueRef = useRef<HTMLDivElement>(null);
  const titreId = useId();
  // Ref-indirection : le piège de focus s'installe UNE fois (mount) et le focus est RENDU une seule fois (unmount → fermeture).
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
      <div style={{ position: 'sticky', top: 0, background: '#fff', display: 'flex', alignItems: 'center', gap: '.5rem', paddingBottom: '.25rem', borderBottom: '1px solid var(--color-svv-line)', zIndex: 2 }}>
        <h2 id={titreId} style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{titre}</h2>
        <button type="button" className="svv-btn svv-btn-outline" style={{ width: 'auto', marginLeft: 'auto' }} onClick={onFermer}>Fermer ✕</button>
      </div>
      {children}
    </div>
  );
}

/**
 * PLEIN ÉCRAN d'UN schéma (L3, + rouge L5). HABILLAGE PUR sur `DialoguePleinEcran` : réutilise `SchemaFigure`,
 * `LegendeRepetesComplete` et surtout `CorpsEtChoix` (mêmes règles d'affectation — AUCUNE duplication).
 * Mobile-first : le schéma prime (en tête), la légende puis les sélecteurs suivent en défilement, sans masquer le dessin.
 */
export function SchemaPleinEcran({ titre, mention, affectation, persiste, enAttenteBati = false, onAffecter, onFermer, rougeCleabs, afficherReperes = true, onAfficherReperes, sourceLibelle = '', afficherFutur = true, onAfficherFutur }: {
  titre: string; mention?: string; affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean;
  onAffecter?: (corpsId: number, cleabs: string, action: ActionAffectation) => void; onFermer: () => void; rougeCleabs?: readonly string[]; afficherReperes?: boolean; onAfficherReperes?: (v: boolean) => void; sourceLibelle?: string; afficherFutur?: boolean; onAfficherFutur?: (v: boolean) => void;
}) {
  return (
    <DialoguePleinEcran titre={titre} onFermer={onFermer}>
      {/* L11/L13 — les DEUX interrupteurs (repères, futur bâti) sont AUSSI en plein écran, même réglage que la vue réduite. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
        {onAfficherReperes && <InterrupteurReperes afficherReperes={afficherReperes} onAfficherReperes={onAfficherReperes} />}
        {onAfficherFutur && <InterrupteurFuturBati afficherFutur={afficherFutur} onAfficherFutur={onAfficherFutur} />}
      </div>
      {/* Le schéma PRIME (grand, en tête) — le nom + la mention sont écrits DANS le visuel via la figure. */}
      <SchemaFigure schema={affectation.schema} corps={affectation.corps} titre={titre} mention={mention} agrandi rougeCleabs={rougeCleabs} afficherReperes={afficherReperes} sourceLibelle={sourceLibelle} afficherFutur={afficherFutur} />
      <LegendeRepetesComplete schema={affectation.schema} corps={affectation.corps} rougeCleabs={rougeCleabs} afficherFutur={afficherFutur} />
      {/* La FONCTION de rattachement, à l'identique (mêmes règles) — c'est là qu'on arbitre. */}
      {affectation.colonneManquante && <div role="alert" style={{ color: 'var(--color-svv-red)' }}>Affectation indisponible : migration 117 non appliquée.</div>}
      <CorpsEtChoix affectation={affectation} persiste={persiste} enAttenteBati={enAttenteBati} onAffecter={onAffecter} />
    </DialoguePleinEcran>
  );
}

/**
 * COMPARATIF plein écran (L5) : ORIGINE à gauche, NOUVELLE (rouge) à droite, MÊME cadrage (calculé côté données). Chaque schéma est
 * une `<section>` avec son `aria-label` (distinguable par un lecteur d'écran, pas seulement par la couleur). Mobile-first : sur écran
 * étroit, `flex-wrap` EMPILE (origine au-dessus, nouvelle en dessous) — jamais un côte-à-côte illisible. Vue de COMPARAISON : les deux
 * schémas + leurs légendes (l'arbitrage reste accessible dans chaque bloc et dans chaque plein écran simple, via le même `CorpsEtChoix`).
 */
export function ComparaisonPleinEcran({ origine, nouvelle, rougeCleabs, nomOrigine, nomNouvelle, mentionOrigine, mentionNouvelle, onFermer, afficherReperes = true, onAfficherReperes, sourceOrigine = '', sourceNouvelle = '', afficherFutur = true, onAfficherFutur }: {
  origine: AffectationEtat; nouvelle: AffectationEtat; rougeCleabs?: readonly string[];
  nomOrigine: string; nomNouvelle: string; mentionOrigine?: string; mentionNouvelle?: string; onFermer: () => void; afficherReperes?: boolean; onAfficherReperes?: (v: boolean) => void; sourceOrigine?: string; sourceNouvelle?: string; afficherFutur?: boolean; onAfficherFutur?: (v: boolean) => void;
}) {
  const colonne: CSSProperties = { flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' };
  return (
    <DialoguePleinEcran titre="Comparer les schémas" onFermer={onFermer}>
      {/* L11/L13 — les deux interrupteurs UNE fois pour les deux schémas (même réglage). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
        {onAfficherReperes && <InterrupteurReperes afficherReperes={afficherReperes} onAfficherReperes={onAfficherReperes} />}
        {onAfficherFutur && <InterrupteurFuturBati afficherFutur={afficherFutur} onAfficherFutur={onAfficherFutur} />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        <section aria-label={nomOrigine} style={colonne}>
          <SchemaFigure schema={origine.schema} corps={origine.corps} titre={nomOrigine} mention={mentionOrigine} agrandi afficherReperes={afficherReperes} sourceLibelle={sourceOrigine} afficherFutur={afficherFutur} />
          <LegendeRepetesComplete schema={origine.schema} corps={origine.corps} afficherFutur={afficherFutur} />
        </section>
        <section aria-label={nomNouvelle} style={colonne}>
          <SchemaFigure schema={nouvelle.schema} corps={nouvelle.corps} titre={nomNouvelle} mention={mentionNouvelle} agrandi rougeCleabs={rougeCleabs} afficherReperes={afficherReperes} sourceLibelle={sourceNouvelle} afficherFutur={afficherFutur} />
          <LegendeRepetesComplete schema={nouvelle.schema} corps={nouvelle.corps} rougeCleabs={rougeCleabs} afficherFutur={afficherFutur} />
        </section>
      </div>
    </DialoguePleinEcran>
  );
}

/**
 * Bloc d'affectation (vue RÉDUITE) : le SCHÉMA nommé + cliquable (→ plein écran) + sa LÉGENDE compacte, puis les CHOIX (`CorpsEtChoix`,
 * mêmes règles que le plein écran). Le schéma reste consultable même sans dossier persisté (on DIT pourquoi l'arbitrage est fermé).
 */
export function AffectationBloc({ affectation, persiste, enAttenteBati = false, onAffecter, onAgrandir, titre = NOM_SCHEMA_ORIGINE, mention, rougeCleabs, afficherReperes = true, sourceLibelle = '', afficherFutur = true, cleabsMisEnAvant = null }: { affectation: AffectationEtat; persiste: boolean; enAttenteBati?: boolean; onAffecter?: (corpsId: number, cleabs: string, action: ActionAffectation) => void; onAgrandir?: () => void; titre?: string; mention?: string; rougeCleabs?: readonly string[]; afficherReperes?: boolean; sourceLibelle?: string; afficherFutur?: boolean; cleabsMisEnAvant?: string | null }) {
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
            <SchemaFigure schema={schema} corps={corps} titre={titre} mention={mention} onAgrandir={onAgrandir} rougeCleabs={rougeCleabs} afficherReperes={afficherReperes} sourceLibelle={sourceLibelle} afficherFutur={afficherFutur} cleabsMisEnAvant={cleabsMisEnAvant} />
            <LegendeAffectation avecRouge={(rougeCleabs?.length ?? 0) > 0} />
            <CorpsEtChoix affectation={affectation} persiste={persiste} enAttenteBati={enAttenteBati} onAffecter={onAffecter} />
          </>
        )}
    </div>
  );
}
