import type { CSSProperties } from 'react';

/**
 * PASTILLES D'ACTIONS — pastille rouge ronde, chiffre blanc, indiquant un nombre. PURE (aucun état, aucun effet → testable via
 * `renderToStaticMarkup`). Partagée par les onglets (Réponses / Saisines CADA / Rattachement), la tuile Permis (home) et la tuile
 * Sources (home, F7). RÈGLES : zéro → ne rend RIEN (jamais de pastille vide ni de « 0 ») ; au-delà de 99 → « 99+ ». ACCESSIBILITÉ :
 * un libellé lisible par lecteur d'écran — le chiffre seul ne suffit pas ; le « 99+ » visuel reste exact à l'oral.
 *
 * `ariaLabel` : libellé accessible SUR MESURE (F7 : « 2 mises à jour de base de données disponibles »). OMIS → défaut HISTORIQUE
 * « N action(s) en attente », À L'IDENTIQUE des appelants Permis existants (aucune régression : la prop est purement additive).
 */
const style: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: '1.25rem', height: '1.25rem', padding: '0 .3rem', boxSizing: 'border-box',
  borderRadius: 999, background: 'var(--color-svv-red)', color: '#fff',
  fontSize: 11, fontWeight: 700, lineHeight: 1, verticalAlign: 'middle',
};

export function PastilleActions({ n, ariaLabel }: { n: number; ariaLabel?: string }) {
  if (!Number.isFinite(n) || n <= 0) return null; // zéro (ou invalide) → aucune pastille
  const affiche = n > 99 ? '99+' : String(n);
  const label = ariaLabel ?? `${n} action${n > 1 ? 's' : ''} en attente`; // défaut = comportement historique inchangé
  return (
    <span style={style} aria-label={label}>
      <span aria-hidden="true">{affiche}</span>
    </span>
  );
}
