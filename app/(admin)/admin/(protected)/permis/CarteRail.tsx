'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { type Bbox, ajustement, anneauVersSvg, projeterL93VersSvg, bboxDe } from '../../../../lib/sitadel/carteProjection';
import type { CommuneGeo } from '../../../../lib/sitadel/carteRepo';
import { PROCESS_META, type Process } from '../../../../lib/sitadel/process';
import { etatCommuneRail, communeSelectionnable, LIBELLE_ETAT_RAIL, type EtatCommuneRail } from '../../../../lib/sitadel/carteRail';

/**
 * Lot 2 — CARTE INTERACTIVE des communes d'UN rail (chantier « À demander »). Réutilise le socle S6 (carteProjection L93→SVG, /api/admin/
 * permis/carte servant le canal — lot 1) SANS toucher `CartePermis`. AUCUN fond de plan / tuile externe. La sélection est une INTENTION
 * LOCALE (le cycle de validation + l'écriture arrivent au Lot 3) : ce composant N'ÉCRIT RIEN.
 *
 * QUATRE états (dérivés du canal, cf. carteRail) : sur ce rail / sur l'autre rail / non affectée / hors process (non sélectionnable).
 * SURVOL : couleur intermédiaire + bulle « nom de commune » qui suit le curseur (motif de la planche cadastrale). SÉLECTION : couleur
 * DÉFINITIVE en permanence. CLIC : bascule illimitée sur TOUTE la surface (polygones `pointer-events: all` → intérieur cliquable, pas le
 * piège du remplissage vide). A11y : chaque commune est un bouton FOCUSABLE au clavier (Entrée/Espace) avec un libellé lisible.
 *
 * PERFORMANCE (~366 communes) : la géométrie (points SVG) est MÉMOÏSÉE (ne recalcule pas au survol) ; seul le remplissage change. Si le
 * re-rendu au survol devenait lourd, le repli serait un `:hover` CSS pour la teinte + une bulle découplée — signalé, non appliqué (inutile ici).
 */

const LARGEUR = 900; // résolution interne du canevas SVG (le viewBox fait le zoom)

interface Survol { x: number; y: number; nom: string; code: string }

/**
 * POINT 3 — PALETTE CLIVANTE (jetons SVAV EXISTANTS, tous THEME-AWARE — redéfinis en [data-theme='dark']). Des HUES distincts (vert /
 * violet / gris / neutre / rouge) à opacité modérée : chaque état se distingue d'un coup d'œil, en clair comme en sombre. Aucune teinte
 * nouvelle codée en dur (le #ffffff des « non affectées » est déjà var(--color-svv-surface)). La couleur n'est JAMAIS le seul porteur
 * (aria-label + légende texte). MÊME source pour la carte ET les pastilles de légende (une seule vérité).
 */
type Teinte = { fill: string; opacity: number; stroke: string };
const COULEUR_ETAT: Record<EtatCommuneRail, Teinte> = {
  courant:     { fill: 'var(--color-svv-green)',   opacity: 0.5,  stroke: 'var(--color-svv-green-ink)' },   // sur ce rail — VERT franc
  autre:       { fill: 'var(--color-svv-violet)',  opacity: 0.42, stroke: 'var(--color-svv-violet)' },      // sur l'autre rail — VIOLET
  nonAffecte:  { fill: 'var(--color-svv-surface)', opacity: 1,    stroke: 'var(--color-svv-line-strong)' }, // non affectée — NEUTRE (fond, opaque → intérieur cliquable)
  horsProcess: { fill: 'var(--color-svv-muted)',   opacity: 0.42, stroke: 'var(--color-svv-muted)' },       // hors process — GRIS marqué
};
const COULEUR_SELECTION: Teinte = { fill: 'var(--color-svv-red)', opacity: 0.62, stroke: 'var(--color-svv-red)' }; // sélectionnée — ROUGE (définitif)
const COULEUR_SURVOL: Teinte    = { fill: 'var(--color-svv-red)', opacity: 0.28, stroke: 'var(--color-svv-red)' }; // survol — rouge CLAIR (intermédiaire)

/** Remplissage d'une commune : sélection (édition) > survol > état réel. `montreSelection`/`survolee` déjà conditionnés à l'édition par l'appelant. */
function remplissage(etat: EtatCommuneRail, montreSelection: boolean, survolee: boolean): Teinte {
  if (montreSelection) return COULEUR_SELECTION;
  if (survolee) return COULEUR_SURVOL;
  return COULEUR_ETAT[etat];
}

export function CarteRail({ rail, selection, onToggle, departement = null, donnees, editable = true }: {
  rail: Process; selection: ReadonlySet<string>; onToggle: (code: string) => void; departement?: string | null;
  /** Lot 3 — données FOURNIES par le parent (panneau) : évite un 2e fetch ET permet de refléter la nouvelle réalité après validation. Absent → la carte charge seule (usage standalone). */
  donnees?: { communes: CommuneGeo[]; bbox: Bbox } | null;
  /** Lot 3 — au REPOS la carte n'est PAS modifiable : `editable=false` → clic/clavier inertes, pas de curseur pointeur, hors du tab (le survol/bulle d'identification reste). Défaut true. */
  editable?: boolean;
}) {
  const [dataFetch, setData] = useState<{ communes: CommuneGeo[]; bbox: Bbox } | null>(null);
  const [erreur, setErreur] = useState(false);
  const [survol, setSurvol] = useState<Survol | null>(null);
  const data = donnees ?? dataFetch; // le parent PRIME : s'il fournit les données, la carte ne charge pas.

  useEffect(() => {
    if (donnees) return; // données fournies par le parent → aucun fetch interne.
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/carte', { cache: 'force-cache' });
        if (annule) return;
        if (!res.ok) { setErreur(true); return; }
        const d = (await res.json()) as { communes: CommuneGeo[]; bbox: Bbox };
        if (!annule) setData(d);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, [donnees]);

  // GÉOMÉTRIE mémoïsée (points SVG + canal + nom) : ne recalcule PAS au survol/sélection (perf ~366 communes).
  const rendu = useMemo(() => {
    if (!data) return null;
    const [xmin, ymin, xmax, ymax] = data.bbox;
    const hauteur = Math.max(1, Math.round(LARGEUR * (ymax - ymin) / Math.max(xmax - xmin, 1e-9)));
    const a = ajustement(data.bbox, { largeur: LARGEUR, hauteur, marge: 4 });
    const polys = data.communes.map((c) => ({
      code: c.code, nom: c.nom, dep: c.dep, canal: c.canal,
      pts: c.anneaux.map((ring) => anneauVersSvg(ring, data.bbox, a)),
    }));
    return { hauteur, a, polys };
  }, [data]);

  const viewBox = useMemo(() => {
    if (!data || !rendu) return `0 0 ${LARGEUR} 100`;
    const cibles = departement ? data.communes.filter((c) => c.dep === departement) : data.communes;
    const anneaux = cibles.flatMap((c) => c.anneaux);
    if (anneaux.length === 0) return `0 0 ${LARGEUR} ${rendu.hauteur}`;
    const [xmin, ymin, xmax, ymax] = bboxDe(anneaux);
    const [x1, y1] = projeterL93VersSvg(xmin, ymax, data.bbox, rendu.a);
    const [x2, y2] = projeterL93VersSvg(xmax, ymin, data.bbox, rendu.a);
    const m = 8;
    return `${(x1 - m).toFixed(1)} ${(y1 - m).toFixed(1)} ${(x2 - x1 + 2 * m).toFixed(1)} ${(y2 - y1 + 2 * m).toFixed(1)}`;
  }, [data, rendu, departement]);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Carte indisponible.</div>;
  if (!data || !rendu) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement de la carte…</div>;

  const bulle: CSSProperties | null = survol
    ? { position: 'fixed', left: survol.x + 12, top: survol.y + 12, zIndex: 50, pointerEvents: 'none', background: 'var(--color-svv-ink)', color: 'var(--color-svv-surface)', fontSize: 11, padding: '.15rem .4rem', borderRadius: '.3rem', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }
    : null;

  return (
    <div className="svv-card" style={{ padding: '.5rem' }}>
      <svg viewBox={viewBox} width="100%" style={{ maxHeight: 460, display: 'block', background: 'var(--color-svv-field)' }} role="group" aria-label={`Carte des communes du rail ${PROCESS_META[rail].court}`}>
        {rendu.polys.map((p) => {
          const etat = etatCommuneRail(p.canal, rail);
          const selectionnee = selection.has(p.code);
          const selectionnable = communeSelectionnable(etat);
          const survolee = survol?.code === p.code;
          const actif = selectionnable && editable; // basculable seulement en édition ; au repos la carte n'est pas modifiable
          // POINT 1 — l'overlay « sélectionnée » (rouge) ne s'applique QU'EN ÉDITION. Au REPOS, la sélection amorcée sur l'origine (Lot 3)
          //   ne doit PAS teindre les communes du rail en rouge : elles portent leur état réel « sur ce rail » (vert). Idem aria-pressed /
          //   suffixe « sélectionnée » : au repos, la carte n'est pas un sélecteur → on n'annonce pas de sélection.
          const montreSelection = selectionnee && editable;
          const c = remplissage(etat, montreSelection, survolee && actif);
          const activer = () => { if (actif) onToggle(p.code); };
          return (
            <g key={p.code} role="button" aria-pressed={actif ? selectionnee : undefined} aria-disabled={actif ? undefined : true}
              aria-label={`${p.nom} — ${LIBELLE_ETAT_RAIL[etat]}${actif ? (selectionnee ? ', sélectionnée' : ', non sélectionnée') : ''}`}
              tabIndex={actif ? 0 : -1}
              onClick={activer}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && actif) { e.preventDefault(); onToggle(p.code); } }}
              onMouseMove={(e) => setSurvol({ x: e.clientX, y: e.clientY, nom: p.nom, code: p.code })}
              onMouseLeave={() => setSurvol((s) => (s?.code === p.code ? null : s))}
              onFocus={() => setSurvol({ x: 0, y: 0, nom: p.nom, code: p.code })}
              onBlur={() => setSurvol((s) => (s?.code === p.code ? null : s))}
              style={{ cursor: actif ? 'pointer' : 'default' }}>
              {p.pts.map((pts, i) => (
                <polygon key={i} points={pts}
                  fill={c.fill} fillOpacity={c.opacity} stroke={c.stroke} strokeWidth={montreSelection ? 1.2 : 0.4}
                  strokeLinejoin="round" style={{ pointerEvents: 'all' }} />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Ligne d'identité (aria-live) : nom de la commune survolée/focus, doublure lisible de la bulle. Le hint DIT LA VÉRITÉ selon l'état :
          au REPOS la carte n'est pas modifiable (rien n'est cliquable → renvoi vers « Modifier la sélection ») ; en ÉDITION on (dé)sélectionne. */}
      <p aria-live="polite" style={{ margin: '.3rem 0 0', minHeight: '1.2em', fontSize: 12, color: 'var(--color-svv-muted)' }}>
        {survol ? survol.nom : (editable
          ? 'Survolez pour identifier ; cliquez une commune pour la (dé)sélectionner.'
          : 'Survolez (ou tabulez sur) une commune pour l’identifier. Cliquez « Modifier la sélection » pour pouvoir affecter des communes à ce rail.')}
      </p>

      {/* POINT 3 — LÉGENDE à VRAIES pastilles (≈18 px, teinte fidèle à la carte : remplissage à l'opacité par-dessus le fond de carte,
          bordée du trait de l'état) + libellé texte à côté. Le sens est porté par le TEXTE ; la pastille n'est qu'un appui visuel. */}
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem 1rem', listStyle: 'none', margin: '.45rem 0 0', padding: 0, fontSize: 12, color: 'var(--color-svv-ink)' }} aria-label="Légende des états de commune">
        {[
          { t: COULEUR_ETAT.courant, l: LIBELLE_ETAT_RAIL.courant },
          { t: COULEUR_ETAT.autre, l: LIBELLE_ETAT_RAIL.autre },
          { t: COULEUR_ETAT.nonAffecte, l: LIBELLE_ETAT_RAIL.nonAffecte },
          { t: COULEUR_ETAT.horsProcess, l: LIBELLE_ETAT_RAIL.horsProcess },
          { t: COULEUR_SELECTION, l: 'sélectionnée' },
          { t: COULEUR_SURVOL, l: 'survol' },
        ].map(({ t, l }) => (
          <li key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
            <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block', width: 18, height: 18, borderRadius: 4, border: `1px solid ${t.stroke}`, background: 'var(--color-svv-field)', overflow: 'hidden', flexShrink: 0 }}>
              <span style={{ position: 'absolute', inset: 0, background: t.fill, opacity: t.opacity }} />
            </span>
            {l}
          </li>
        ))}
      </ul>

      <p style={{ margin: '.3rem 0 0', fontSize: 11, color: 'var(--color-svv-muted)' }}>
        Contours © IGN ADMIN EXPRESS (Licence Ouverte Etalab 2.0) — aucun fond de plan.
      </p>

      {bulle && <div role="status" aria-hidden style={bulle}>{survol!.nom}</div>}
    </div>
  );
}
