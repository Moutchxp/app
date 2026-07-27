import type { CSSProperties } from 'react';
import { bandeauIdentite, type Bornes, type ParamVeille } from '../../../../lib/sitadel/reglagesVeille';

/**
 * Composants de rendu PURS de l'écran « Réglages » (chantier S7d) — aucun état, aucun effet → testables en Node via
 * `renderToStaticMarkup`. Sortent la logique d'affichage sensible (bandeau d'identité, plage tirée des CHECK) du
 * composant client interactif pour la verrouiller par des tests.
 */

const styleBase: CSSProperties = { padding: '.6rem .75rem', borderRadius: '.6rem', fontSize: 13, lineHeight: 1.45 };

/** Bandeau permanent : identité complète (vert) → demandes « prête » possibles ; incomplète (rouge) → bloquées. */
export function BandeauIdentite({ problemes }: { problemes: string[] }) {
  const { complete, message } = bandeauIdentite(problemes);
  const style: CSSProperties = complete
    ? { ...styleBase, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' }
    : { ...styleBase, background: '#fdecec', color: 'var(--color-svv-red)', fontWeight: 600 };
  return <div role="status" aria-live="polite" style={style}>{message}</div>;
}

/**
 * Ligne « plage autorisée » d'un paramètre. Les bornes proviennent des CHECK de la base (jamais d'une constante) : si
 * elles manquent, on le dit explicitement plutôt que d'inventer une plage. Pour un paramètre texte, on rappelle le format.
 */
export function PlageParam({ param, bornes }: { param: ParamVeille; bornes?: Bornes }) {
  const style: CSSProperties = { fontSize: 12, color: 'var(--color-svv-muted)' };
  if (param.type === 'enum') {
    return <span style={style}>Choix : {(param.optionsEnum ?? []).join(' / ')}.</span>;
  }
  if (param.type === 'texte') {
    return <span style={style}>Format : codes de pièces séparés par des virgules (ex. PC2, PC3).</span>;
  }
  if (!bornes) {
    return <span style={{ ...style, color: 'var(--color-svv-red)' }}>Plage indisponible : contrainte introuvable en base.</span>;
  }
  return <span style={style}>Plage autorisée : {bornes.min} – {bornes.max}{param.unite ? ` ${param.unite}` : ''}</span>;
}
