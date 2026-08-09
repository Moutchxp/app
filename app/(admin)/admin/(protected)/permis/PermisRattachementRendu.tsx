import type { CSSProperties } from 'react';
import type { EtatRattachement } from '../../../../lib/sitadel/priorite';

/**
 * D1 — rendu PUR de l'état de RATTACHEMENT d'un dossier (colonne + compteurs/filtre), testable via renderToStaticMarkup.
 * Trois valeurs, libellés VALIDÉS au mot près. L'information est portée par le TEXTE (le fond couleur n'est qu'un appui),
 * cibles tactiles suffisantes, aucune interaction au survol seul, aucune transition (prefers-reduced-motion sans objet).
 */

/** Libellés VALIDÉS (au mot près). Ordre d'affichage canonique : rattaché → demande abandonnée → jamais demandé. */
export const LIBELLE_RATTACHEMENT: Record<EtatRattachement, string> = {
  rattache: 'rattaché',
  abandonne: 'demande abandonnée',
  jamais: 'jamais demandé',
};
export const ORDRE_RATTACHEMENT: readonly EtatRattachement[] = ['rattache', 'abandonne', 'jamais'];

function fondBadge(etat: EtatRattachement): CSSProperties {
  if (etat === 'rattache') return { background: 'var(--color-svv-field)', color: 'var(--color-svv-ink)' };
  if (etat === 'abandonne') return { background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)' };
  return { background: 'transparent', color: 'var(--color-svv-muted)' }; // jamais demandé : neutre
}

/**
 * Badge d'état de rattachement d'UNE ligne. Si « rattaché », affiche EN PLUS la référence de la demande et son statut
 * (le TEXTE porte tout). `etat` absent (chemin sans rattachement) → rien.
 */
export function BadgeRattachement({ etat, reference, statut }: { etat?: EtatRattachement; reference?: string | null; statut?: string | null }) {
  if (!etat) return null;
  return (
    <span style={{ display: 'inline-flex', gap: '.35rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '.1rem .45rem', borderRadius: '.35rem', whiteSpace: 'nowrap', ...fondBadge(etat) }}>
        {LIBELLE_RATTACHEMENT[etat]}
      </span>
      {etat === 'rattache' && reference && (
        <span style={{ fontSize: 11, color: 'var(--color-svv-muted)' }}>
          <span style={{ fontFamily: 'var(--font-svv-mono, monospace)' }}>{reference}</span>{statut ? ` · ${statut}` : ''}
        </span>
      )}
    </span>
  );
}

/**
 * Compteurs + filtre par état de rattachement. Les compteurs portent sur l'ENSEMBLE des dossiers filtrés (dit à l'écran),
 * PAS sur la page. Chaque chip est un bouton-filtre (aria-pressed) : « Tous » remet à zéro ; un état l'isole. `comptes` peut
 * omettre un état absent → affiché avec 0 (jamais un compteur muet).
 */
export function CompteursRattachement({ comptes, actif, onFiltre }: {
  comptes: { etat: EtatRattachement; n: number }[];
  actif: EtatRattachement | null;
  onFiltre?: (e: EtatRattachement | null) => void;
}) {
  const parEtat = new Map(comptes.map((c) => [c.etat, c.n]));
  const total = comptes.reduce((s, c) => s + c.n, 0);
  const chip = (valeur: EtatRattachement | null): CSSProperties => ({
    padding: '.3rem .7rem', minHeight: '2.1rem', borderRadius: '.4rem', fontSize: 12, cursor: 'pointer',
    border: '1px solid var(--color-svv-line)',
    background: actif === valeur ? 'var(--color-svv-ink)' : '#fff',
    color: actif === valeur ? '#fff' : 'var(--color-svv-ink)',
    fontWeight: actif === valeur ? 700 : 400,
  });
  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label="Filtrer par état de démarchage" style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={chip(null)} aria-pressed={actif === null} onClick={() => onFiltre?.(null)}>Tous ({total})</button>
        {ORDRE_RATTACHEMENT.map((e) => (
          <button key={e} type="button" style={chip(e)} aria-pressed={actif === e} onClick={() => onFiltre?.(e)}>
            {LIBELLE_RATTACHEMENT[e]} ({parEtat.get(e) ?? 0})
          </button>
        ))}
      </div>
      <span role="note" style={{ fontSize: 11, color: 'var(--color-svv-muted)', fontStyle: 'italic' }}>
        Décomptes calculés sur l’ensemble des dossiers correspondant aux filtres en cours, pas seulement sur la page affichée.
      </span>
    </div>
  );
}
