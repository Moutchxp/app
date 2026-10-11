'use client';

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FenetreConfirmation } from './Redaction';
import { motSortieDesBiens } from '../../../../lib/gestion/sortirDuSuivi';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-SORTIE-PAR-BIEN-ET-SIX-BOUTONS — UNE SEULE QUESTION, POSÉE PAR TOUS LES GESTES QUI SORTENT UN MAIL
 * DE L'HISTORIQUE D'UN BIEN ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ARNO : « tout retrait d'un mail confirmé de l'historique d'un bien devient un “Sortir du suivi” POUR CE BIEN
 * SEULEMENT […] avec la confirmation “Sortir ce mail du suivi de <adresse du bien> ? Il restera dans les autres
 * historiques et pourra être restauré.” »
 *
 * 🔴 LA MÊME FENÊTRE QUE PARTOUT (`FenetreConfirmation`, portail dans `.svv-adm-root`, Échap = Annuler, focus sur
 * « Annuler ») : écrite une fois, appelée par chaque geste au moment où il sait quels biens il ferait quitter.
 *
 * ⚠️ AUCUN BIEN À SORTIR ⇒ AUCUNE QUESTION : la promesse rend `true` tout de suite, et le geste se fait comme avant.
 */
export function confirmerSortieDesBiens(libellesDesBiens: readonly string[]): Promise<boolean> {
  const question = motSortieDesBiens(libellesDesBiens);
  if (question === null || typeof document === 'undefined') return Promise.resolve(true);
  return new Promise<boolean>((resoudre) => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    const finir = (oui: boolean): void => {
      racine.unmount();
      hote.remove();
      resoudre(oui);
    };
    racine.render(createElement(FenetreConfirmation, {
      question, annuler: 'Annuler', confirmer: 'Sortir du suivi',
      onAnnuler: () => finir(false), onConfirmer: () => finir(true),
    }));
  });
}
