'use client';

import { RechercheVivierManuel } from './RechercheVivierManuel';

/**
 * MODE DE PRÉPARATION (téléservice) — bascule entre deux modes, SOUS le carrousel. Le rail Téléservice n'a PAS de bouton
 * « Préparer les demandes » (préparer un lot n'a aucun sens : un téléservice ne permet qu'un dépôt à la fois, et le verrou de
 * commune n'autorise qu'une demande en vol). Le rail E-mail garde son bouton (envoi groupé légitime), rendu par ADemanderVue.
 *
 * - AUTOMATIQUE (par défaut) : pour chaque commune LIBRE, une carte de dépôt COMPLÈTE apparaît TOUTE SEULE dans le carrousel
 *   ci-dessus (aucun geste préalable) ; la demande ne se crée qu'au 1er geste réel (copie / dépôt). Ce mode n'ajoute donc aucun
 *   contenu propre ici — juste un rappel de l'endroit où regarder.
 * - MANUEL : un panneau apparaît pour choisir soi-même un permis dans le vivier téléservice, hors des critères de sélection.
 *
 * Le `mode` est CONTRÔLÉ par le parent (ADemanderVue), qui l'utilise aussi pour afficher/masquer les cartes virtuelles du carrousel.
 * Chaque mode dit en TOUTES LETTRES ce qu'il fait (le texte porte l'info, jamais la couleur seule ; `aria-pressed` porte l'état).
 * Mobile-first : la bascule passe à la ligne sur écran étroit, cibles ≥ 40 px, aucun débordement horizontal.
 */
export type ModePreparation = 'auto' | 'manuel';

export function ModeDemandeTeleservice({ categories, mode, onMode, onChangement }: {
  categories: { cle: string; libelle: string; rang: number }[];
  mode: ModePreparation;
  onMode: (m: ModePreparation) => void;
  onChangement: () => void;
}) {
  const styleOnglet = (actif: boolean): React.CSSProperties => ({
    flex: '1 1 12rem', minHeight: 44, padding: '.4rem .7rem', borderRadius: '.5rem', fontSize: 13, textAlign: 'left',
    border: actif ? '2px solid var(--color-svv-ink)' : '1px solid var(--color-svv-line)',
    background: actif ? 'var(--color-svv-paper, #fff)' : 'transparent', fontWeight: actif ? 700 : 500, cursor: 'pointer',
  });

  return (
    <section aria-label="Mode de préparation des demandes téléservice" className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <strong style={{ fontSize: 13 }}>Comment préparer les demandes téléservice ?</strong>
      <div role="group" aria-label="Choisir le mode de préparation" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button type="button" aria-pressed={mode === 'auto'} onClick={() => onMode('auto')} style={styleOnglet(mode === 'auto')}>
          Mode automatique {mode === 'auto' ? '· actif' : ''}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>
            Les cartes de dépôt des communes libres apparaissent toutes seules dans le carrousel ci-dessus (aucun clic ; la demande se crée au 1er geste).
          </span>
        </button>
        <button type="button" aria-pressed={mode === 'manuel'} onClick={() => onMode('manuel')} style={styleOnglet(mode === 'manuel')}>
          Mode manuel {mode === 'manuel' ? '· actif' : ''}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>
            Tu choisis toi-même un permis dans le vivier, hors des critères de sélection.
          </span>
        </button>
      </div>

      {mode === 'auto' && (
        <p role="note" style={{ fontSize: 12, color: 'var(--color-svv-muted)', margin: 0 }}>
          Regarde le carrousel « à déposer à la main » ci-dessus : chaque commune libre y a déjà sa carte de dépôt, prête à copier.
        </p>
      )}
      {mode === 'manuel' && <RechercheVivierManuel categories={categories} onPrepared={onChangement} />}
    </section>
  );
}
