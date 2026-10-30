'use client';

import { useState, type ReactNode } from 'react';
import { DessinTriangle } from '../_composants/TriangleDepliage';

/**
 * ══ 🔴 Arno (25/10/2026, puis 26/10/2026) — UN BLOC REPLIÉ PAR DÉFAUT, partagé : « Les négociateurs » et « Les apporteurs » du Suivi annuel,
 * « Résultat net de l'agence » du Suivi du mois et du « Résumé de la période ». Une ligne — titre à gauche, résumé et chevron ▸ / ▾ à
 * droite — qui se déplie au clic (sur la ligne ou le chevron), à Entrée ou Espace (un vrai bouton) ; un second clic replie ; replié à
 * chaque chargement. Déplié : le contenu d'avant, INCHANGÉ (ce qui s'y clique — un « i » — ne replie rien : le bouton n'est que la
 * ligne de titre). `defilement` : la mécanique de « Année par année » (défilement interne au-delà d'une hauteur, en-tête de tableau
 * figé), pour un long tableau. `classe`, `niveau`, `donnees` : l'allure et les repères de l'écran hôte.
 */
export function BlocReplie({ id, section, titre, resume, children, classe = 'tdb-section', niveau = 'h3', defilement = true, donnees, chevronAGauche = false, ouvertInitial = false, triangle = false }: {
  id: string; section: string; titre: ReactNode; resume: ReactNode; children: ReactNode;
  classe?: string; niveau?: 'h3' | 'h4'; defilement?: boolean; donnees?: Record<string, string>;
  /** 🔴 Arno (26/10/2026) — le triangle d'ouverture À GAUCHE du titre (comme les lignes « Négociateur ») ; absent : à droite, comme avant. */
  chevronAGauche?: boolean;
  /** LOT R (Transaction) — déplié dès l'affichage (une carte visée par un lien) ; absent : replié, comme avant. */
  ouvertInitial?: boolean;
  /** 🔴 LOT BN (Transaction) — à gauche, le triangle ROUGE partagé avec la tuile Gestion (`DessinTriangle`) au lieu de la petite flèche grise ; absent : comme avant. */
  triangle?: boolean;
}) {
  const [ouvert, setOuvert] = useState(ouvertInitial);
  const Titre = niveau;
  return (
    <section className={`${classe} tdb-replie${ouvert ? ' tdb-replie--ouvert' : ''}`} aria-labelledby={id} data-replie={ouvert ? 'ouvert' : 'replie'} {...donnees}>
      <Titre id={id} className="tdb-replie-titre">
        <button type="button" className="tdb-replie-ligne" aria-expanded={ouvert} aria-controls={`${id}-contenu`} onClick={() => setOuvert((o) => !o)} data-deplier={section}>
          {chevronAGauche && (triangle ? <span className="svv-triangle-boite tdb-h-triangle" aria-hidden="true"><DessinTriangle ouvert={ouvert} /></span>
            : <span className="tdb-h-chevron tdb-h-chevron--gauche" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>)}
          <span className="tdb-replie-mot">{titre}</span>
          <span className="tdb-replie-resume" data-resume-replie={section}>{resume}</span>
          {!chevronAGauche && <span className="tdb-h-chevron" aria-hidden="true">{ouvert ? '▾' : '▸'}</span>}
        </button>
      </Titre>
      {ouvert && (
        <div className={defilement ? 'tdb-h-cadre tdb-h-cadre--ouvert tdb-replie-cadre' : 'tdb-replie-contenu'} id={`${id}-contenu`} data-contenu-replie={section}>{children}</div>
      )}
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Toute la ligne est le bouton (cible tactile, clavier) ; deplie, defilement interne et en-tete fige. */
export const CSS_BLOC_REPLIE = `
.tdb-replie .tdb-replie-titre{margin:0}
.tdb-replie--ouvert .tdb-replie-titre{margin:0 0 10px}
.tdb-replie-ligne{appearance:none;display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;width:100%;min-height:44px;padding:0;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:10px}
.tdb-replie-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.tdb-replie-mot{font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.tdb-replie-resume{margin-left:auto;font-size:.92rem;font-weight:600;color:var(--color-svv-muted)}
@media (hover:hover){ .tdb-replie-ligne:hover .tdb-replie-resume{color:var(--color-svv-ink)} }
.tdb-replie-cadre{max-height:min(70vh,640px)}
.tdb-h-cadre--ouvert{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
.tdb-h-cadre--ouvert .tdb-table thead th{position:sticky;top:0;z-index:1;background:var(--color-svv-surface);border-bottom:0;box-shadow:inset 0 -1px 0 var(--color-svv-line)}
.tdb-h-chevron{display:inline-flex;align-items:center;justify-content:center;min-width:32px;font-size:1rem}
.tdb-h-chevron--gauche{min-width:0;flex:0 0 1.2em;justify-content:flex-start;color:var(--color-svv-muted)}
.tdb-h-chevron--gauche + .tdb-replie-mot{flex:1 1 12rem;min-width:0}
.tdb-h-triangle + .tdb-replie-mot{flex:1 1 12rem;min-width:0}
`;
