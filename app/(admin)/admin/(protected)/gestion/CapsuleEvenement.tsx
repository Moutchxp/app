'use client';

import {
  motSurvolUrgence, motTypeEvenement, trameEvenement, MOT_OUVERT_SUR_LE_BIEN,
} from '../../../../lib/gestion/evenementRattache';

/**
 * ══ 🔴🔴 LOT BLOC-EVENEMENT-RATTACHE-COMPLET, PARTIE 2 — LA CAPSULE D'ÉVÉNEMENT, UNE SEULE ET MÊME PARTOUT ═══════════
 *
 * ARNO (12/10/2026) : « Contenu : TYPE · numéro — titre tronqué (titre complet au survol). TRAME = couleur de
 * l'URGENCE […] ; non précisée = le jaune / orange actuel ; événement clos = gris. Au survol : “Urgence : <niveau>”.
 * La même capsule sert aussi pour la pastille “Événement en cours” des lignes de mail et pour la mention
 * “événement ouvert sur ce bien”. »
 *
 * 🔴 TROIS VARIANTES D'UN SEUL DESSIN — même trame, même type en tête, même bulle :
 *   · `nom`      — « Type · GES-2026-000001 — titre » (fenêtre « Bien(s) rattaché(s) à ce mail ») ;
 *   · `pastille` — « Type · Événement en cours » (cas a : le mail est rattaché) — lignes de mail ;
 *   · `mention`  — « Type · événement ouvert sur ce bien » (cas b) : la même trame, mais au TRAIT, sans fond, en
 *     italique — c'est ce qui la garde discrète, et distincte de la pastille pleine (règle du lot 8ae9f387).
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

export function CapsuleEvenement({ e, variante = 'nom', mot, survol }: {
  e: EvenementCapsule;
  variante?: 'nom' | 'pastille' | 'mention';
  /** Le mot de la pastille (« Événement en cours », « 2 événements en cours »). */
  mot?: string;
  /** Une bulle plus complète (plusieurs événements) ; sinon numéro, titre, type et urgence. */
  survol?: string;
}) {
  const type = motTypeEvenement(e.categorie);
  const bulle = survol ?? `${e.reference} — ${e.objet}\nType : ${type} · ${motSurvolUrgence(e)}`;
  const classes = `cev cev--${trameEvenement(e)}${variante === 'nom' ? '' : ` cev--${variante}`}`;
  return (
    <span className={classes} title={bulle}>
      <span className="cev-type">{type}</span>
      <span className="cev-sep" aria-hidden="true"> · </span>
      {variante === 'nom' ? (
        /* Le TITRE se tronque d'abord ; le numéro ne se tronque qu'en dernier recours (écran étroit). */
        <span className="cev-mot">
          <span className="cev-ref">{e.reference}</span>
          <span className="cev-objet">{` — ${e.objet}`}</span>
          {/* Clos : le mot « (traité) » reste écrit, comme avant ce lot — la couleur n'est jamais seule. */}
          {!e.ouvert && <span className="cev-clos">{' (traité)'}</span>}
        </span>
      ) : (
        <span className="cev-mot"><span className="cev-objet">{variante === 'mention' ? MOT_OUVERT_SUR_LE_BIEN : mot}</span></span>
      )}
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
.cev--pastille{font-size:.68rem;padding:.1rem .5rem}
/* La mention du cas b : la meme trame, au trait, sans fond, en italique — discrete. */
.cev--mention{background:transparent;font-size:.68rem;font-weight:600;font-style:italic;padding:.05rem .45rem}
.cev--mention.cev--vert{border-color:var(--color-svv-green-ink)}
.cev--mention.cev--orange{border-color:var(--color-svv-urgence-orange-texte)}
.cev--mention.cev--rouge{border-color:var(--color-svv-red-dark)}
.cev--mention.cev--non-precisee{border-color:var(--color-svv-amber)}
.cev-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);
  white-space:nowrap;border:0}
`;
