'use client';

import { useState, type ReactNode } from 'react';
import { CSS_TRIANGLE, CSS_TRIANGLE_BOITE, DessinTriangle } from '../_composants/TriangleDepliage';

/**
 * ══ 🔴 LOT LO10 (Arno, 01/11/2026) — UNE LISTE DE BAUX REPLIABLE, partagée (Suivi CA › Location « Les baux de … » ; module Location « Locations du
 * mois » du Suivi du mois et des onglets du Suivi annuel) ══════════════════════════════════════════════════════════════════════════════════
 * Plus de 25 baux : REPLIÉE à l'arrivée, sur une ligne — le triangle rouge partagé (lot BN), le titre, le compteur, le total de la liste ; un clic
 * (Entrée / Espace : un vrai bouton) déplie, un second replie. 25 baux ou moins : ouverte, comme avant (repliable d'un clic). Les outils (tri,
 * recherche) restent dans l'en-tête, visibles même repliée ; `avant` : ce qui reste toujours montré sous l'en-tête (une alerte). L'état n'est pas
 * retenu d'une visite à l'autre ; il repart de la règle quand la liste change (`cle` : une autre période). Rien n'est retiré : déplié, le contenu
 * d'avant, inchangé.
 */
export const SEUIL_LISTE_REPLIEE = 25;
export const ouverteParDefaut = (nb: number): boolean => nb <= SEUIL_LISTE_REPLIEE;

/** L'état ouvert / replié d'une liste : la règle à l'arrivée, et de nouveau quand `cle` change (une autre période, un autre mois). */
export function useListeRepliee(nb: number, cle: string): [boolean, (o: boolean) => void] {
  const [etat, setEtat] = useState<{ cle: string; ouvert: boolean }>(() => ({ cle, ouvert: ouverteParDefaut(nb) }));
  if (etat.cle !== cle) {
    const neuf = { cle, ouvert: ouverteParDefaut(nb) };
    setEtat(neuf);
    return [neuf.ouvert, (o) => setEtat({ cle, ouvert: o })];
  }
  return [etat.ouvert, (o) => setEtat({ cle, ouvert: o })];
}

/**
 * 🔴 LOT LO12 (Arno) — l'en-tête sur deux lignes : ligne 1, le triangle rouge sur la ligne du titre, le titre court, le compteur juste après, le total
 * à DROITE (l'unité choisie en grand, l'autre en petit dessous) ; ligne 2, les outils : « Trier : … » à gauche, « Rechercher… » à droite.
 * `infobulle` : le nom complet de la période (title / aria-label du titre), quand le titre l'abrège.
 */
export function ListeRepliable({ id, section, titre, infobulle, compteur, total, outils, avant, aDroite, ouvert, onOuvert, children, classe = 'tdb-section', donnees }: {
  id: string; section: string; titre: ReactNode; infobulle?: string; compteur: ReactNode; total: ReactNode; outils?: ReactNode; avant?: ReactNode;
  /** 🔴 LOT CG5 — un contrôle sur la MÊME ligne que le titre, à droite, hors du bouton (utilisable replié, sans déplier) ; absent : l'en-tête d'avant. */
  aDroite?: ReactNode;
  ouvert: boolean; onOuvert: (o: boolean) => void; children: ReactNode; classe?: string; donnees?: Record<string, string>;
}) {
  return (
    <section className={`${classe} lr-liste${ouvert ? ' lr-liste--ouverte' : ''}`} aria-labelledby={`${id}-titre`} data-liste-repliee={section} data-replie={ouvert ? 'ouvert' : 'replie'} {...donnees}>
      <style>{CSS_LISTE_REPLIABLE}</style>
      <div className="lr-entete">
        {(() => {
          const h = (
            <h3 className="lr-h">
              <button type="button" className="lr-bascule" aria-expanded={ouvert} aria-controls={`${id}-contenu`} onClick={() => onOuvert(!ouvert)} data-deplier-liste={section}>
                <span className="svv-triangle-boite lr-triangle" aria-hidden="true"><DessinTriangle ouvert={ouvert} /></span>
                <span className="lr-nom"><span className="lr-titre" id={`${id}-titre`} title={infobulle} {...(infobulle !== undefined ? { 'data-infobulle-periode': infobulle } : {})}>{titre}</span>
                  {' '}<span className="trx-compteur lr-compteur" data-compteur-liste>{compteur}</span></span>
                <span className="lr-total" data-total-liste={section}>{total}</span>
              </button>
            </h3>);
          return aDroite === undefined ? h : <div className="lr-ligne">{h}<div className="lr-a-droite" data-a-droite-liste={section}>{aDroite}</div></div>;
        })()}
        {outils !== undefined && <div className="lr-outils">{outils}</div>}
      </div>
      {avant}
      {ouvert && <div className="lr-contenu" id={`${id}-contenu`} data-contenu-liste={section}>{children}</div>}
    </section>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_LISTE_REPLIABLE = `${CSS_TRIANGLE}${CSS_TRIANGLE_BOITE}
.lr-entete{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0}
.lr-h{margin:0;min-width:0;font-size:inherit}
.lr-liste--ouverte .lr-entete{margin-bottom:10px}
.lr-bascule{appearance:none;display:flex;flex-wrap:nowrap;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 0 0 4px;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:10px}
.lr-bascule:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.lr-triangle{flex:none}
.lr-nom{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.lr-titre{font-size:1.05rem;font-weight:800;color:var(--color-svv-ink)}
.lr-compteur{font-weight:700;color:var(--color-svv-muted);white-space:nowrap}
.lr-total{flex:none;margin-left:auto;text-align:right;font-weight:800;color:var(--color-svv-ink)}
.lr-total .trx-mt{display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.2}
.lr-total small,.lr-total .trx-mt-petit{font-weight:600;font-size:.8rem;color:var(--color-svv-muted)}
.lr-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.lr-ligne>.lr-h{flex:1 1 20rem}
.lr-a-droite{flex:none;margin-left:auto}
.lr-outils{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:6px 12px;padding-left:4px}
.lr-outils>:only-child{margin-right:auto}
`;
