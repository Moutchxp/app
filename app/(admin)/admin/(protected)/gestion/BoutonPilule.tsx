'use client';

/**
 * ══ 🔴🔴 LOT HARMONIE-BOUTONS-ET-TROMBONE, POINT 2 — UN SEUL FORMAT DE BOUTON-FILTRE ═══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (09/10/2026), mot pour mot :
 *   « Référence : les boutons du panneau “Boîte de réception” (“Tous”, “À classer”, “Classés”, “Hors gestion”)
 *     — même forme de pilule, hauteur, marges intérieures, bordure, police, taille, graisse, état actif (fond
 *     sombre / texte blanc) et état inactif (fond blanc / bordure grise). […] Rends ce format commun (un seul
 *     composant ou une seule classe partagée) pour que les trois groupes ne divergent plus. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ══ 🔴🔴 CE QU'ILS ÉTAIENT, ET POURQUOI ILS AVAIENT DIVERGÉ ════════════════════════════════════════════════════
 *
 * Trois groupes, trois dessins, écrits par trois lots différents, chacun raisonnable isolément :
 *   · `.brc-filtre`  (Boîte de réception) — 36 px, texte `ink` sur `surface`, graisse normale, actif = fond `ink`.
 *   · `.gst-tri`     (New / Urgent)       — 44 px, texte `muted` sur `bg`, GRAS, actif = fond bleu ou rouge pâle.
 *   · `.gurg-voie`   (Urgence)            — 44 px, texte `muted` sur `bg`, GRAS, actif = teinte pâle de son sens.
 * Personne ne les avait comparés côte à côte, parce qu'ils ne se touchent jamais dans un même fichier. C'est
 * exactement le motif que ce dépôt a déjà payé pour le bouton rond (`BoutonRond`), le « Modifier » de
 * l'événement (`FormulaireCarte`) et le sélecteur d'urgence : une copie finit TOUJOURS par diverger.
 *
 * ══ 🔴🔴 LA HAUTEUR COMMUNE EST 44 px, ET NON LES 36 px DE LA RÉFÉRENCE ═══════════════════════════════════════
 *
 * Arno nomme « Tous » comme référence, y compris pour la hauteur. 36 px partout aurait RABAISSÉ deux groupes
 * sous la cible tactile de 44 px exigée par le §15 (exigence transverse mobile du dépôt), et cassé l'épreuve
 * `urgenceEvenement.test.ts` qui l'écrit « non négociable en mode compact ». On unifie donc par le HAUT :
 * identiques partout, et conformes partout.
 *
 * ⚠️ ET CELA NE DÉPLACE RIEN À L'ÉCRAN : la rangée qui porte les filtres de la boîte
 * (`.gst-tete-partage-outils`) réserve déjà `min-height:44px`. Les boutons grandissent de 8 px DANS une rangée
 * qui les avait déjà ; l'en-tête, les deux colonnes et le haut des listes ne bougent pas d'un pixel (mesuré).
 *
 * ══ 🔴 L'EXCEPTION DE L'URGENCE EST PORTÉE PAR L'APPELANT, PAS PAR CE FICHIER ═════════════════════════════════
 *
 * Arno : « EXCEPTION volontaire : le bouton ACTIF garde sa couleur de sens […] en fond plein avec texte blanc ».
 * `SelecteurUrgence` ajoute donc sa propre classe de ton PAR-DESSUS la pilule, et ne redéfinit que la couleur de
 * l'actif. Tout le reste — forme, hauteur, marges, bordure, police, taille, graisse, inactif, survol, focus,
 * désactivé — vient d'ici. Un seul endroit à toucher le jour où le dessin change.
 *
 * ⚠️ AUCUN COMPORTEMENT N'EST TOUCHÉ : ce composant rend un `button` et appelle `onClick`. Les filtres filtrent
 * comme avant, le tri écrit `&tri=` comme avant, l'urgence s'enregistre par la même route qu'avant.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : ce fichier est monté dans trois écrans clients (garde `clientBoundary`).
 */
export function BoutonPilule({ mot, actif, onClick, aide, occupe = false, classeDeTon }: {
  /** Le MOT, toujours écrit dans le bouton : la couleur ne porte jamais seule l'information. */
  mot: string;
  /**
   * 🔴 `aria-pressed` DIT L'ÉTAT AUTREMENT QUE PAR LA COULEUR, et c'est la condition pour que « actif » existe
   * aussi au lecteur d'écran. Règle commune aux trois groupes, qui l'avaient déjà chacun de leur côté.
   */
  actif: boolean;
  onClick: () => void;
  /** L'info-bulle, quand le groupe en a une (les filtres de la boîte en portent, pas les tris). */
  aide?: string;
  /** Une écriture est en cours : le bouton se grise, comme partout ailleurs dans le module. */
  occupe?: boolean;
  /** La classe de SENS de l'appelant (l'exception d'urgence) : elle ne peint que l'état actif. */
  classeDeTon?: string;
}) {
  return (
    <button
      type="button"
      className={`gpil${classeDeTon === undefined ? '' : ` ${classeDeTon}`}${actif ? ' gpil--actif' : ''}`}
      aria-pressed={actif}
      title={aide}
      disabled={occupe}
      onClick={onClick}
    >
      {mot}
    </button>
  );
}

/**
 * LA FEUILLE, écrite une seule fois — et INJECTÉE par chacun des trois écrans qui montrent ces boutons.
 *
 * ⚠️ C'EST LA LEÇON DE `CSS_BOUTON_ROND` : une classe partagée dont la feuille ne l'est pas n'est pas partagée.
 * Le bouton serait arrivé nu dans l'écran qui n'injecte rien — carré, sans bordure.
 *
 * ⚠️ JETONS `--color-svv-*` UNIQUEMENT (le thème Sombre suit tout seul) ET AUCUN ACCENT GRAVE : cette feuille
 * vit DANS un litteral gabarit, qu'un seul terminerait (piege TS1005, consigne quinze fois dans ce depot).
 */
export const CSS_BOUTON_PILULE = `
.gpil{min-height:44px;padding:.25rem .7rem;font:inherit;font-size:.8rem;color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:999px;cursor:pointer}
.gpil:hover:not(:disabled){background:var(--color-svv-field)}
/* ⚠️ LE MEME SELECTEUR DE BASE QUE LE SURVOL (.gpil:not(:disabled)), et ce n'est pas une coquetterie : le garde
   §15 de GestionVue.parts.test.ts retire « :hover » du selecteur et exige de trouver son pendant au clavier,
   caractere pour caractere. Ecrire « .gpil:focus-visible » aurait laisse passer un survol sans pendant clavier
   — c'est la lecon que .gst-tri portait deja, et qu'il emporte ici avec lui.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gpil:not(:disabled):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.gpil:disabled{cursor:default;opacity:.6}
/* L'ACTIF se dit par le MOT (aria-pressed) autant que par la forme : jamais la couleur seule. */
.gpil--actif{color:var(--color-svv-surface);background:var(--color-svv-ink);border-color:var(--color-svv-ink)}
`;
