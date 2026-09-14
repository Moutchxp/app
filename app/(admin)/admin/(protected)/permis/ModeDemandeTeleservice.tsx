'use client';

import { useState } from 'react';
import { RechercheVivierManuel } from './RechercheVivierManuel';

/**
 * MODE DE PRÉPARATION (téléservice) — bascule entre deux modes, AU-DESSUS du carrousel. PUREMENT ADDITIF : n'enlève, ne masque,
 * ne déplace et ne conditionne AUCUN élément existant (le carrousel, le bouton « Préparer les demandes » et le moteur de
 * recherche actuels restent en place, inchangés, plus bas dans l'onglet). La bascule ne gouverne QUE le nouveau panneau manuel.
 *
 * - AUTOMATIQUE (par défaut au chargement) : les cartes du carrousel viennent du bouton « Préparer les demandes », qui applique
 *   les critères de sélection. Rien de neuf ne s'affiche — les outils d'aujourd'hui restent en dessous.
 * - MANUEL : un panneau apparaît pour choisir soi-même un permis dans le vivier téléservice et préparer sa demande, hors du tri.
 *
 * Chaque mode dit en TOUTES LETTRES ce qu'il fait (le texte porte l'info, jamais la couleur seule ; `aria-pressed` porte l'état).
 * Mobile-first : la bascule passe à la ligne sur écran étroit, cibles ≥ 40 px, aucun débordement horizontal.
 */
type Mode = 'auto' | 'manuel';

export function ModeDemandeTeleservice({ categories, onChangement }: {
  categories: { cle: string; libelle: string; rang: number }[];
  onChangement: () => void;
}) {
  const [mode, setMode] = useState<Mode>('auto'); // le mode automatique reste le mode par défaut au chargement

  const styleOnglet = (actif: boolean): React.CSSProperties => ({
    flex: '1 1 12rem', minHeight: 44, padding: '.4rem .7rem', borderRadius: '.5rem', fontSize: 13, textAlign: 'left',
    border: actif ? '2px solid var(--color-svv-ink)' : '1px solid var(--color-svv-line)',
    background: actif ? 'var(--color-svv-paper, #fff)' : 'transparent', fontWeight: actif ? 700 : 500, cursor: 'pointer',
  });

  return (
    <section aria-label="Mode de préparation des demandes téléservice" className="svv-card" style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
      <strong style={{ fontSize: 13 }}>Comment préparer les demandes téléservice ?</strong>
      <div role="group" aria-label="Choisir le mode de préparation" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
        <button type="button" aria-pressed={mode === 'auto'} onClick={() => setMode('auto')} style={styleOnglet(mode === 'auto')}>
          Mode automatique {mode === 'auto' ? '· actif' : ''}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>
            Les cartes viennent du bouton « Préparer les demandes », selon les critères de sélection.
          </span>
        </button>
        <button type="button" aria-pressed={mode === 'manuel'} onClick={() => setMode('manuel')} style={styleOnglet(mode === 'manuel')}>
          Mode manuel {mode === 'manuel' ? '· actif' : ''}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--color-svv-muted)' }}>
            Tu choisis toi-même un permis dans le vivier, hors des critères de sélection.
          </span>
        </button>
      </div>

      {mode === 'manuel' && <RechercheVivierManuel categories={categories} onPrepared={onChangement} />}
    </section>
  );
}
