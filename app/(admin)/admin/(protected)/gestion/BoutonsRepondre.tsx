'use client';

import type { VoieRedaction } from '../../../../lib/gestion/redaction';

/**
 * ══ 🔴🔴 LOT REPONDRE-DEPUIS-HISTORIQUE-DU-BIEN — LES TROIS BOUTONS, ÉCRITS UNE SEULE FOIS ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (09/10/2026) : « à la fin de chaque mail déplié de l'historique […] les 3 boutons de la boîte mail :
 * “↩ Répondre”, “↩↩ Répondre à tous”, “↪ Transférer” — **même composant, même format** que dans la boîte mail. »
 *
 * 🔴 CE FICHIER NAÎT DE CETTE PHRASE-LÀ, ET DE RIEN D'AUTRE. Le groupe vivait DANS `Conversation.tsx`, sous chaque
 * message déplié (lot FIL-LECTURE). Le recopier dans la vie du bien aurait donné deux rangées jumelles : le jour où
 * l'on change une icône, un libellé ou une classe, l'une des deux suivrait et l'autre non — c'est le défaut que ce
 * dépôt a déjà payé plusieurs fois (le précédent `BoutonRond` : « une classe partagée dont la feuille ne l'est pas
 * n'est pas partagée »).
 *
 * 🔴 RIEN N'A CHANGÉ DE FORME EN DÉMÉNAGEANT : mêmes classes (`cnv-repondre`, `svv-btn svv-btn-outline gst-btn`),
 * mêmes libellés, mêmes dessins d'icône, même ordre. La conversation rend exactement ce qu'elle rendait hier —
 * c'est vérifiable au caractère près dans `git show HEAD~1`.
 *
 * ⚠️ LA FEUILLE DE STYLE RESTE CELLE DE L'ÉCRAN QUI L'EMPLOIE, et c'est voulu : `.cnv-repondre` est définie dans
 * le CSS de la conversation, et la vie du bien définit la sienne sous son propre préfixe. Une feuille embarquée
 * ici serait injectée deux fois sur l'écran qui porte les deux.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les trois voies offertes sous un message, dans l'ordre de Gmail — et leurs mots, écrits une seule fois. */
export const VOIES_REPONSE: readonly (readonly [VoieRedaction, string])[] = [
  ['repondre', 'Répondre'],
  ['repondre_tous', 'Répondre à tous'],
  ['transferer', 'Transférer'],
] as const;

/**
 * LOT 5-FIDÈLE — les trois dessins, tels quels. L'icône ne porte JAMAIS l'information seule : le mot est écrit à
 * côté, et c'est lui que lit un lecteur d'écran (`aria-hidden` sur le dessin).
 */
export function IconeVoie({ voie }: { voie: VoieRedaction }) {
  const commun = { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true as const,
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (voie === 'transferer') {
    return (
      <svg {...commun}><path d="M15 7l5 5-5 5" /><path d="M20 12h-9a6 6 0 00-6 6v1" /></svg>
    );
  }
  if (voie === 'repondre_tous') {
    return (
      <svg {...commun}><path d="M8 7l-5 5 5 5" /><path d="M13 7l-5 5 5 5" /><path d="M8 12h7a5 5 0 015 5v1" /></svg>
    );
  }
  return (
    <svg {...commun}><path d="M9 7l-5 5 5 5" /><path d="M4 12h9a6 6 0 016 6v1" /></svg>
  );
}

/**
 * LA RANGÉE DES TROIS GESTES SOUS **CE** MESSAGE.
 *
 * 🔴 `aria-label` NOMME LE MESSAGE VISÉ quand l'appelant le sait : sur une page qui porte vingt mails dépliés,
 * vingt groupes « Répondre à ce message » ne se distinguent pas au clavier.
 */
export function BoutonsRepondre({ onRepondre, className = 'cnv-repondre', etiquette = 'Répondre à ce message' }: {
  onRepondre: (voie: VoieRedaction) => void;
  /** La classe de l'enveloppe. Chaque écran porte la sienne, parce que chaque écran porte sa feuille. */
  className?: string;
  etiquette?: string;
}) {
  return (
    <div className={className} role="group" aria-label={etiquette}>
      {VOIES_REPONSE.map(([voie, mot]) => (
        <button key={voie} type="button" className="svv-btn svv-btn-outline gst-btn"
          onClick={() => onRepondre(voie)}>
          <IconeVoie voie={voie} />
          <span>{mot}</span>
        </button>
      ))}
    </div>
  );
}
