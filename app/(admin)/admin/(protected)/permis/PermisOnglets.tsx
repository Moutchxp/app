import type { CSSProperties } from 'react';
import { PastilleActions } from './PastilleActions';

/**
 * S13 — barre d'onglets PURE de la tuile Permis (aucun état, aucun effet → testable en Node via `renderToStaticMarkup`).
 * Les onglets sont répartis en DEUX groupes nommés, pour séparer visuellement les deux automatisations distinctes :
 * mettre à jour les dossiers Sitadel d'un côté, demander les pièces aux mairies de l'autre. Le groupe est RÉEL pour un
 * lecteur d'écran (`role="group"` + `aria-label`), pas seulement visuel. La couleur (liseré) n'est qu'un appui : l'intitulé
 * de groupe (les mots) porte l'information. Aucune transition → rien à neutraliser pour prefers-reduced-motion.
 */
export type CleOnglet = 'dossiers' | 'a_demander' | 'en_cours' | 'reponses' | 'projection' | 'archives' | 'saisines' | 'reglages' | 'automatisation' | 'collaborateurs' | 'rattachement';

export const GROUPES_ONGLETS: { titre: string; onglets: { cle: CleOnglet; libelle: string }[] }[] = [
  // FUS-3b — « Rattachement » = suivi du rattachement des permis à leur parcelle/bâtiments futurs (distinct du rattachement permis↔demande).
  // PROJ-2b — le tracé d'emprise n'est PLUS un onglet autonome : il vit dans le détail d'un dossier de « Rattachement », par bâtiment.
  { titre: 'Mise à jour des dossiers', onglets: [{ cle: 'dossiers', libelle: 'Dossiers' }, { cle: 'automatisation', libelle: 'Automatisation' }, { cle: 'rattachement', libelle: 'Rattachement' }] },
  // Q5 — l'ex-onglet « Demandes » est SCINDÉ en « À demander » (préparation) puis « En cours » (suivi), en tête du groupe.
  // PROJ-2c — « Projection » S'INSÈRE entre « Réponses » et « Archives » : à la réception des pièces, on reconstitue l'emprise des futurs bâtiments.
  { titre: 'Demandes aux mairies', onglets: [{ cle: 'a_demander', libelle: 'À demander' }, { cle: 'en_cours', libelle: 'En cours' }, { cle: 'reponses', libelle: 'Réponses' }, { cle: 'projection', libelle: 'Analyse et projection' }, { cle: 'archives', libelle: 'Archives' }, { cle: 'saisines', libelle: 'Saisines CADA' }, { cle: 'collaborateurs', libelle: 'Collaborateurs' }, { cle: 'reglages', libelle: 'Réglages' }] },
];

const styleTitreGroupe: CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-svv-muted)' };

function styleOnglet(actif: boolean): CSSProperties {
  return {
    padding: '.4rem .9rem', border: '1px solid var(--color-svv-line)',
    borderBottom: actif ? '2px solid var(--color-svv-red)' : '1px solid var(--color-svv-line)',
    background: actif ? 'var(--color-svv-surface)' : 'var(--color-svv-field)', color: 'var(--color-svv-ink)', fontWeight: actif ? 700 : 400,
    cursor: 'pointer', borderRadius: '.4rem .4rem 0 0',
  };
}

/**
 * Deux blocs nommés qui s'empilent sur écran étroit (flex-wrap), chacun gardant son intitulé au-dessus de ses onglets.
 * `compteurs` (optionnel) porte le nombre d'actions en attente par onglet → une PastilleActions rouge s'affiche À GAUCHE du titre
 * quand le compteur est > 0 (zéro → rien). Seuls les onglets concernés (Réponses / Saisines CADA / Rattachement) reçoivent un compteur.
 */
export function OngletsPermis({ actif, onChoisir, compteurs }: {
  actif: CleOnglet; onChoisir: (cle: CleOnglet) => void; compteurs?: Partial<Record<CleOnglet, number>>;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'flex-end' }}>
      {GROUPES_ONGLETS.map((g) => (
        <div key={g.titre} role="group" aria-label={g.titre} className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <span style={styleTitreGroupe}>{g.titre}</span>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', borderBottom: '1px solid var(--color-svv-line)' }}>
            {g.onglets.map((o) => (
              <button key={o.cle} type="button" style={{ ...styleOnglet(actif === o.cle), display: 'inline-flex', alignItems: 'center', gap: '.35rem' }}
                aria-current={actif === o.cle ? 'page' : undefined} onClick={() => onChoisir(o.cle)}>
                <PastilleActions n={compteurs?.[o.cle] ?? 0} />
                {o.libelle}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
