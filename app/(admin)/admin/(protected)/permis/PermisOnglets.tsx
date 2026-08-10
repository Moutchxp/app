import type { CSSProperties } from 'react';

/**
 * S13 — barre d'onglets PURE de la tuile Permis (aucun état, aucun effet → testable en Node via `renderToStaticMarkup`).
 * Les onglets sont répartis en DEUX groupes nommés, pour séparer visuellement les deux automatisations distinctes :
 * mettre à jour les dossiers Sitadel d'un côté, demander les pièces aux mairies de l'autre. Le groupe est RÉEL pour un
 * lecteur d'écran (`role="group"` + `aria-label`), pas seulement visuel. La couleur (liseré) n'est qu'un appui : l'intitulé
 * de groupe (les mots) porte l'information. Aucune transition → rien à neutraliser pour prefers-reduced-motion.
 */
export type CleOnglet = 'dossiers' | 'demandes' | 'reponses' | 'archives' | 'saisines' | 'reglages' | 'automatisation' | 'collaborateurs';

export const GROUPES_ONGLETS: { titre: string; onglets: { cle: CleOnglet; libelle: string }[] }[] = [
  { titre: 'Mise à jour des dossiers', onglets: [{ cle: 'dossiers', libelle: 'Dossiers' }, { cle: 'automatisation', libelle: 'Automatisation' }] },
  { titre: 'Demandes aux mairies', onglets: [{ cle: 'demandes', libelle: 'Demandes' }, { cle: 'reponses', libelle: 'Réponses' }, { cle: 'archives', libelle: 'Archives' }, { cle: 'saisines', libelle: 'Saisines CADA' }, { cle: 'collaborateurs', libelle: 'Collaborateurs' }, { cle: 'reglages', libelle: 'Réglages' }] },
];

const styleTitreGroupe: CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-svv-muted)' };

function styleOnglet(actif: boolean): CSSProperties {
  return {
    padding: '.4rem .9rem', border: '1px solid var(--color-svv-line)',
    borderBottom: actif ? '2px solid var(--color-svv-red)' : '1px solid var(--color-svv-line)',
    background: actif ? '#fff' : 'var(--color-svv-field)', fontWeight: actif ? 700 : 400,
    cursor: 'pointer', borderRadius: '.4rem .4rem 0 0',
  };
}

/** Deux blocs nommés qui s'empilent sur écran étroit (flex-wrap), chacun gardant son intitulé au-dessus de ses onglets. */
export function OngletsPermis({ actif, onChoisir }: { actif: CleOnglet; onChoisir: (cle: CleOnglet) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'flex-end' }}>
      {GROUPES_ONGLETS.map((g) => (
        <div key={g.titre} role="group" aria-label={g.titre} className="flex flex-col gap-1" style={{ minWidth: 0 }}>
          <span style={styleTitreGroupe}>{g.titre}</span>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', borderBottom: '1px solid var(--color-svv-line)' }}>
            {g.onglets.map((o) => (
              <button key={o.cle} type="button" style={styleOnglet(actif === o.cle)}
                aria-current={actif === o.cle ? 'page' : undefined} onClick={() => onChoisir(o.cle)}>
                {o.libelle}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
