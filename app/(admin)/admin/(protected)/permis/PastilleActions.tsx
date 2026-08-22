import type { CSSProperties } from 'react';

/**
 * PASTILLES D'ACTIONS — pastille rouge ronde, chiffre blanc, indiquant un nombre d'actions en attente. PURE (aucun état, aucun
 * effet → testable via `renderToStaticMarkup`). Partagée par les onglets (Réponses / Saisines CADA / Rattachement) et la tuile
 * home. RÈGLES : zéro → ne rend RIEN (jamais de pastille vide ni de « 0 ») ; au-delà de 99 → « 99+ ». ACCESSIBILITÉ : un libellé
 * lisible par lecteur d'écran (« 3 actions en attente ») — le chiffre seul ne suffit pas ; le « 99+ » visuel reste exact à l'oral.
 */
const style: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: '1.25rem', height: '1.25rem', padding: '0 .3rem', boxSizing: 'border-box',
  borderRadius: 999, background: 'var(--color-svv-red)', color: '#fff',
  fontSize: 11, fontWeight: 700, lineHeight: 1, verticalAlign: 'middle',
};

export function PastilleActions({ n }: { n: number }) {
  if (!Number.isFinite(n) || n <= 0) return null; // zéro (ou invalide) → aucune pastille
  const affiche = n > 99 ? '99+' : String(n);
  return (
    <span style={style} aria-label={`${n} action${n > 1 ? 's' : ''} en attente`}>
      <span aria-hidden="true">{affiche}</span>
    </span>
  );
}
