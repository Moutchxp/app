'use client';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 2 — LE BOUTON ROND, ÉCRIT **UNE SEULE FOIS** ════════════════════════
 *
 * Arno : « transforme le bouton “Rafraîchir” en bouton rond à icône, identique à celui de la boîte mail ouverte
 * (même composant, pas une copie) ».
 *
 * 🔴 IL EXISTAIT DÉJÀ, MAIS ÉCRIT DANS `BoiteMail` : son balisage, son dessin et sa feuille y vivaient côte à
 * côte, et l'écran partagé ne pouvait pas l'atteindre. Le recopier aurait fait deux ronds — et le jour où l'un
 * gagne un état, une taille ou un repli de mouvement, l'autre ne l'a pas. Il vit donc ici, et les DEUX écrans
 * l'importent : `BoiteMail` pour « Relever et actualiser », `BoiteReception` pour « Rafraîchir ».
 *
 * ⚠️ MÊME DESSIN, ACTIONS DIFFÉRENTES, ET C'EST VOULU. Arno : « il garde exactement l'action de l'actuel bouton
 * Rafraîchir de l'écran partagé. Si l'action du bouton rond de la boîte mail est différente, dis-le-moi : n'en
 * change aucune des deux. » Elles LE SONT :
 *   · dans la BOÎTE en plein écran, il RELÈVE puis actualise (`Relever et actualiser`) ;
 *   · sur l'ÉCRAN PARTAGÉ, il ACTUALISE seulement — c'est ce que faisait « Rafraîchir ».
 * Aucune des deux n'est touchée : c'est le mot et l'appel qui changent, jamais le composant.
 *
 * ⚠️ UNE ICÔNE SANS NOM N'EXISTE PAS pour un lecteur d'écran, et ne s'apprend pas au survol sur un téléphone :
 * `aria-label` ET `title` portent donc toujours une phrase, et elle est OBLIGATOIRE dans les propriétés.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : ce fichier est monté dans deux écrans clients.
 */

/** Le dessin : une flèche circulaire. `aria-hidden` — c'est le bouton qui porte le nom. */
export function PictoRelever() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4h-4" />
    </svg>
  );
}

export function BoutonRond({ mot, onClick, occupe = false, tourne = false, children }: {
  /** La phrase que le bouton DIT : info-bulle et libellé accessible, toujours les deux. */
  mot: string;
  onClick: () => void;
  /** Grisé pendant qu'un geste est en cours : recliquer sur un geste qui tourne n'aide personne. */
  occupe?: boolean;
  /**
   * 🔴 L'ICÔNE TOURNE PENDANT L'OPÉRATION : c'est le seul retour visuel qu'un geste est en cours, et sans lui on
   * reclique. L'animation est coupée pour qui a demandé moins de mouvement — l'icône reste alors estompée, donc
   * l'information passe quand même.
   */
  tourne?: boolean;
  /** Le dessin. Par défaut la flèche circulaire ; l'étoile du filtre passe le sien. */
  children?: React.ReactNode;
}) {
  return (
    <button type="button" className={`bte-relever${tourne ? ' bte-relever--tourne' : ''}`}
      onClick={onClick} disabled={occupe} aria-label={mot} title={mot}>
      {children ?? <PictoRelever />}
    </button>
  );
}

/**
 * LA FEUILLE DU BOUTON, écrite une seule fois elle aussi — et INJECTÉE par les deux écrans qui le montrent.
 *
 * ⚠️ ELLE VIVAIT DANS `CSS_BOITE` : l'écran partagé ne monte pas `BoiteMail`, et le bouton y serait arrivé nu —
 * carré, sans bordure, sans rotation. Une classe partagée dont la feuille ne l'est pas n'est pas partagée.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit DANS un litteral gabarit, qu'un seul terminerait (piege
 * consigne quatorze fois dans ce depot).
 */
export const CSS_BOUTON_ROND = `
.bte-relever{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;margin-left:.4rem;
  vertical-align:middle;border:1px solid var(--color-svv-line);border-radius:999px;background:transparent;
  color:var(--color-svv-ink);cursor:pointer}
.bte-relever:hover{background:var(--color-svv-field)}
.bte-relever:disabled{opacity:.55;cursor:default}
.bte-relever--tourne svg{animation:bte-tourne 1s linear infinite}
@keyframes bte-tourne{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.bte-relever--tourne svg{animation:none}}
`;
