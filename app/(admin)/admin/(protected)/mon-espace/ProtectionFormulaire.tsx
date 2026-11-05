'use client';

import { Component, type ReactNode } from 'react';

/**
 * ══ 🔴 Arno (05/11/2026, production) — LA PROTECTION D'ÉCRAN DU FORMULAIRE DE COMPROMIS ═══════════════════════════════════════════════
 * Une erreur dans le formulaire (une donnée inattendue) ne fait plus tomber la page entière (« This page couldn't load ») : SEUL le formulaire
 * est remplacé par un message, avec « Fermer » ; le reste de « Mon espace » (listes, cartes, onglets) reste utilisable. L'erreur est écrite
 * dans la console, pour qu'on la retrouve.
 */
export const MESSAGE_FORMULAIRE_EN_ERREUR = 'Le formulaire du compromis a rencontré une erreur. Fermez-le et réessayez ; le reste de « Mon espace » reste utilisable.';

export class ProtectionFormulaire extends Component<{ children: ReactNode; onFermer: () => void }, { erreur: boolean }> {
  state = { erreur: false };

  static getDerivedStateFromError(): { erreur: boolean } {
    return { erreur: true };
  }

  componentDidCatch(e: unknown): void {
    console.error('[mon-espace] formulaire du compromis en erreur', e);
  }

  render(): ReactNode {
    if (!this.state.erreur) return this.props.children;
    return (
      <section className="svv-card mes-parcours" role="alert" data-formulaire-en-erreur>
        <p className="loc-alerte loc-alerte--orange" style={{ margin: '0 0 .6rem' }}>{MESSAGE_FORMULAIRE_EN_ERREUR}</p>
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={this.props.onFermer} data-formulaire-erreur-fermer>Fermer</button>
      </section>
    );
  }
}
