import type { CSSProperties } from 'react';
import { bandeauIdentite, type Bornes, type ParamVeille } from '../../../../lib/sitadel/reglagesVeille';

/**
 * Composants de rendu PURS de l'écran « Réglages » (chantier S7d) — aucun état, aucun effet → testables en Node via
 * `renderToStaticMarkup`. Sortent la logique d'affichage sensible (bandeau d'identité, plage tirée des CHECK) du
 * composant client interactif pour la verrouiller par des tests.
 */

const styleBase: CSSProperties = { padding: '.6rem .75rem', borderRadius: '.6rem', fontSize: 13, lineHeight: 1.45 };

/**
 * S13 — intitulés des deux sous-blocs de paramètres de l'écran Réglages. Le premier coiffe les réglages des demandes ; le
 * second, ceux de la classification/affichage des dossiers — son aide dit explicitement qu'il ne concerne PAS les demandes,
 * pour que le lecteur comprenne pourquoi ces réglages sont là. Exportés (et non « en dur » dans la vue) pour être testés.
 */
export const TITRE_PARAMS_DEMANDES = 'Paramètres des demandes';
export const TITRE_PARAMS_DOSSIERS = 'Classification et affichage des dossiers';
export const AIDE_PARAMS_DOSSIERS = 'Ces réglages ne concernent pas les demandes aux mairies : ils pilotent la mise à jour et l’affichage des dossiers (groupe « Mise à jour des dossiers ») — classement « immeuble », ordre des catégories et profondeur d’affichage par défaut.';

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
