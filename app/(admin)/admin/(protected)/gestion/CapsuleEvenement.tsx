'use client';

import { motSurvolUrgence, motTypeEvenement, trameEvenement } from '../../../../lib/gestion/evenementRattache';

/**
 * ══ 🔴🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET, PARTIE 2 — LA CAPSULE D'ÉVÉNEMENT, UNE SEULE ET MÊME PARTOUT ═══════════
 *
 * ARNO (12/10/2026) : « Contenu : TYPE · numéro — titre tronqué (titre complet au survol). TRAME = couleur de
 * l'URGENCE […] ; non précisée = le jaune / orange actuel ; événement clos = gris. Au survol : “Urgence : <niveau>”.
 * La même capsule sert aussi pour la pastille “Événement en cours” des lignes de mail et pour la mention
 * “événement ouvert sur ce bien”. »
 *
 * 🔴 LOT LISTE-MAILS-RETOUR-PASTILLE-SOBRE (Arno, 12/10/2026) — ELLE NE VIT QUE DANS LA FENÊTRE « Bien(s) rattaché(s) à
 * ce mail » (bloc « Événement rattaché » et liste des événements en cours). Les LIGNES de mail (historique, boîte,
 * recherche, conversation) gardent la pastille « Événement en cours » sobre et la mention grise d'avant : la capsule
 * type + trame d'urgence les rendait brouillonnes.
 *
 * ⚠️ LA COULEUR N'EST JAMAIS SEULE : le type est écrit, et l'urgence l'est dans la bulle et au lecteur d'écran.
 * ⚠️ SA FEUILLE (`CSS_CAPSULE_EVENEMENT`) EST DANS CELLE DE CHAQUE ÉCRAN HÔTE, une fois — jamais une balise
 *    `style` par capsule (elle ajouterait son texte à celui de la ligne).
 */
export interface EvenementCapsule {
  reference: string;
  objet: string;
  ouvert: boolean;
  categorie?: string | null;
  urgence?: string | null;
}

export function CapsuleEvenement({ e }: { e: EvenementCapsule }) {
  const type = motTypeEvenement(e.categorie);
  const bulle = `${e.reference} — ${e.objet}\nType : ${type} · ${motSurvolUrgence(e)}`;
  const classes = `cev cev--${trameEvenement(e)}`;
  return (
    <span className={classes} title={bulle}>
      <span className="cev-type">{type}</span>
      <span className="cev-sep" aria-hidden="true"> · </span>
      {/* Le TITRE se tronque d'abord ; le numéro ne se tronque qu'en dernier recours (écran étroit). */}
      <span className="cev-mot">
        <span className="cev-ref">{e.reference}</span>
        <span className="cev-objet">{` — ${e.objet}`}</span>
        {/* Clos : le mot « (traité) » reste écrit — la couleur n'est jamais seule. */}
        {!e.ouvert && <span className="cev-clos">{' (traité)'}</span>}
      </span>
      <span className="cev-sr">{` — ${motSurvolUrgence(e).toLowerCase()}`}</span>
    </span>
  );
}

/* AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit. Couleurs : jetons seulement, Clair et
   Sombre (les paires de la capsule de type de la carte, lot URGENCE-EVENEMENT). */
export const CSS_CAPSULE_EVENEMENT = `
.cev{display:inline-flex;align-items:center;min-width:0;max-width:100%;padding:.1rem .55rem;border-radius:999px;
  font-size:.72rem;font-weight:700;line-height:1.35;border:1px solid transparent;box-sizing:border-box;
  vertical-align:middle;white-space:nowrap;flex:0 1 auto}
.cev-type{flex:0 0 auto}
.cev-sep{flex:0 0 auto;white-space:pre}
.cev-mot{display:flex;min-width:0;overflow:hidden}
.cev-ref{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.cev-clos{flex:0 0 auto;white-space:pre}
.cev-objet{flex:0 100000 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}
.cev--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);border-color:var(--color-svv-green-soft)}
.cev--orange{background:var(--color-svv-orange-soft);color:var(--color-svv-urgence-orange-texte);border-color:var(--color-svv-orange-soft)}
.cev--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);border-color:var(--color-svv-red-soft)}
.cev--non-precisee{background:var(--color-svv-amber-soft);color:var(--color-svv-amber);border-color:var(--color-svv-amber-soft)}
.cev--clos{background:var(--color-svv-field);color:var(--color-svv-muted);border-color:var(--color-svv-line)}
.cev-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);
  white-space:nowrap;border:0}
`;
