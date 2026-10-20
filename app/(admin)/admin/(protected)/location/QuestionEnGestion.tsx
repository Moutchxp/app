'use client';

import { useState, type ReactNode } from 'react';
import { FeteOui } from './FeteOui';

/**
 * ══ 🔴🔴 LA QUESTION « … EN GESTION ? » — UN SEUL COMPOSANT, DEUX ÉCRANS ════════════════════════════════════════════════
 *
 * · « Propriétaire(s) en gestion ? » — bloc 2 de « Créer un nouveau propriétaire » (Arno, 17/10/2026) ;
 * · « Bien en gestion ? » — dernier bloc de « Ajouter un nouveau bien » (Arno, 20/10/2026) : « le MÊME bloc : même
 *   composant, même rendu (tailles, couleurs, états sélectionnés), mêmes fonctionnalités, même animation sur le bouton
 *   “Oui”. Aucune copie divergente du code. »
 *
 * Deux gros boutons Oui / Non ; `null` tant qu'on n'a pas répondu ; on peut changer d'avis. La FÊTE du Oui (`FeteOui`) se
 * joue au seul PASSAGE à Oui, dans le bouton. Le style vient de l'écran hôte (`CSS_LOCATION_CREATION` + `CSS_FETE`).
 * Ce que le choix entraîne ailleurs (vider un mandat, effacer un refus) reste à l'écran hôte, par `onChoix`.
 */
export function QuestionEnGestion({ id, numero, titre, valeur, onChoix, sorte, obligatoire = false, children }: {
  /** L'identifiant du titre (`aria-labelledby`). */
  id: string;
  numero: number;
  titre: string;
  valeur: boolean | null;
  onChoix: (oui: boolean) => void;
  /** `data-question-gestion` : « proprietaires » ou « bien ». */
  sorte: 'proprietaires' | 'bien';
  /** L'astérisque des champs obligatoires, après le titre. */
  obligatoire?: boolean;
  /** Sous les boutons : le message « ce qui manque » de l'écran hôte. */
  children?: ReactNode;
}) {
  /** La fête du « Oui » : relancée (clé) à chaque NOUVEAU passage à Oui. */
  const [fete, setFete] = useState(0);
  return (
    <section className="loc-section" aria-labelledby={id} data-question-gestion={sorte}>
      <h3 id={id}><span className="loc-num">{numero}</span>{titre}{obligatoire && <> <span className="loc-oblig">*</span></>}</h3>
      <div className="loc-gros-boutons loc-oui-non" role="group" aria-label={titre}>
        {/* Arno (18/10/2026) : la FÊTE du Oui — au passage à Oui seulement, contenue dans le bouton, 3 s, sans son. */}
        <button type="button" className="loc-gros-bouton loc-gros-bouton--centre fete-hote" aria-pressed={valeur === true}
          onClick={() => { if (valeur !== true) setFete((n) => n + 1); onChoix(true); }}>
          <span className="fete-texte">{valeur === true ? '✓ Oui' : 'Oui'}</span>
          {fete > 0 && <FeteOui key={fete} />}
        </button>
        <button type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={valeur === false}
          onClick={() => onChoix(false)}>{valeur === false ? '✓ Non' : 'Non'}</button>
      </div>
      {children}
    </section>
  );
}
