'use client';

/**
 * Un groupe de choix unique en grosses pilules (oui / non, intérieur / extérieur…). Un second clic désélectionne.
 * Le choix retenu est ROUGE et porte « ✓ » (`.loc-pilules`, `commun.tsx`) : jamais la couleur seule.
 * Partagé par « Ajouter un nouveau bien » et le bloc « Conditions d'entrée » de « Nouveau locataire » (Arno, 20/10/2026 :
 * « mêmes composants de boutons, mêmes tailles, mêmes états »).
 */
export function Pilules<T extends string>({ etiquette, options, libelle, valeur, onChoix, variante }: {
  etiquette: string; options: readonly T[]; libelle: Record<T, string>; valeur: T | null; onChoix: (v: T | null) => void;
  /** Une variante de mise en page (`loc-pilules--<variante>`), ex. « jour » : les 4 jours de prélèvement sur UNE ligne. Absente ⇒ d'avant. */
  variante?: string;
}) {
  return (
    <div className={`loc-pilules${variante ? ` loc-pilules--${variante}` : ''}`} role="group" aria-label={etiquette}>
      {options.map((o) => <button key={o} type="button" aria-pressed={valeur === o} onClick={() => onChoix(valeur === o ? null : o)}>{libelle[o]}</button>)}
    </div>
  );
}
export const OUI_NON = ['oui', 'non'] as const;
export const LIBELLE_OUI_NON: Record<'oui' | 'non', string> = { oui: 'Oui', non: 'Non' };
export const versOuiNon = (v: boolean | null): 'oui' | 'non' | null => (v === null ? null : v ? 'oui' : 'non');
