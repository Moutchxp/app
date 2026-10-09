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
/* ══ 🔴🔴 LOT BOUTONS-PLATS-ET-SYMETRIE-PANNEAUX, POINT 1 — 32 px QU'ON VOIT, 44 px QU'ON TOUCHE ══════════════
   ARNO (09/10/2026) : « Fini la pilule : coins arrondis a 8 px (meme rayon que le bouton “Plein ecran”),
   hauteur VISIBLE 32 px, marges interieures horizontales conservees. La zone CLIQUABLE reste d'au moins 44 px
   de haut (marge invisible autour du bouton visible), pour respecter la cible tactile du §15. »
   🔴 LES DEUX EXIGENCES NE SE CONTREDISENT PLUS, ET C'EST TOUT L'OBJET DE CE BLOC. Jusqu'ici la cible tactile
   etait tenue en GROSSISSANT le bouton (min-height:44px) : le dessin payait l'accessibilite. Le ::after la
   tient sans rien dessiner — un rectangle transparent de 44 px, centre sur le bouton, qui recoit le clic
   parce qu'il appartient au bouton. Le doigt touche 44, l'oeil voit 32.
   ⚠️ LE RECTANGLE NE DEBORDE QUE VERTICALEMENT (left:0;right:0) : deux boutons voisins d'une meme rangee ne
   peuvent donc pas se voler un clic, quel que soit l'ecart horizontal entre eux. C'est l'ecart VERTICAL, lui,
   qui compte quand la rangee se replie sur un telephone — d'ou les 12 px de row-gap poses par les trois
   rangees qui montent ces boutons (sans quoi deux lignes de 32 px espacees de 6 px auraient des zones de clic
   qui se chevauchent).
   ⚠️ 8 px ET NON .6rem : « Plein ecran » arrondissait a 9,6 px (.gst-btn). Arno ecrit 8 px ET « meme rayon que
   Plein ecran » : les deux boutons passent donc a 8, plutot que de laisser 1,6 px d'ecart sur une rangee dont
   ce lot demande justement l'homogeneite.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gpil{position:relative;min-height:32px;padding:.25rem .7rem;font:inherit;font-size:.8rem;
  color:var(--color-svv-ink);
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:8px;cursor:pointer}
/* LA CIBLE TACTILE : invisible, sans fond ni bordure, et elle ne deplace rien (position absolue). */
.gpil::after{content:"";position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
/* ⚠️ :not(.gpil--actif) EST LA CORRECTION DU LOT FILTRES-FAMILLES-ET-BOUTONS-ROUGES, POINT 2, ET C'EST UN
   VRAI DEFAUT : ce survol s'appliquait AUSSI au bouton actif. Son fond sombre redevenait alors le gris pale
   de field pendant que son texte restait surface — c'est-a-dire BLANC SUR GRIS CLAIR en theme Clair,
   illisible (contraste mesure 1,2:1). Constat d'Arno : « un bouton actif survole devient illisible ».
   L'actif a desormais son propre survol, deux regles plus bas, qui ne fait que FONCER son fond.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gpil:hover:not(:disabled):not(.gpil--actif){background:var(--color-svv-field)}
/* ⚠️ LE MEME SELECTEUR DE BASE QUE LE SURVOL (.gpil:not(:disabled)), et ce n'est pas une coquetterie : le garde
   §15 de GestionVue.parts.test.ts retire « :hover » du selecteur et exige de trouver son pendant au clavier,
   caractere pour caractere. Ecrire « .gpil:focus-visible » aurait laisse passer un survol sans pendant clavier
   — c'est la lecon que .gst-tri portait deja, et qu'il emporte ici avec lui.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral de gabarit. */
.gpil:not(:disabled):focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.gpil:disabled{cursor:default;opacity:.6}
/* ══ 🔴🔴 LOT FILTRES-FAMILLES-ET-BOUTONS-ROUGES, POINT 3 — L'ACTIF EST LE ROUGE DE LA MARQUE ════════════════
   ARNO : « Partout dans ce format commun, l'etat actif passe du noir actuel au rouge de la marque (le rouge
   du bouton “Nouveau message”), texte blanc. »
   🔴 C'EST DEJA LE ROUGE QUE LA FICHE DU BIEN EMPLOIE pour ses propres bascules (.hdb-petit--actif,
   .hdb-puce-bascule--actif) : ce lot ne cree pas une convention, il aligne le reste du module sur celle qui
   existe. Un seul rouge d'etat actif dans toute l'application.
   ⚠️ « TEXTE BLANC » S'ECRIT --color-svv-surface, JAMAIS un blanc fige : en theme Sombre, le rouge devient
   CLAIR (#ff6b6b) et c'est le texte qui doit devenir sombre. Le jeton fait les deux d'un coup.
   ⚠️ L'ACTIF se dit par le MOT (aria-pressed) autant que par la couleur : jamais la couleur seule. */
.gpil--actif{color:var(--color-svv-surface);background:var(--color-svv-red);border-color:var(--color-svv-red)}
/* ══ 🔴🔴 POINT 2 — L'ACTIF SURVOLE NE FAIT QUE FONCER, et il reste lisible ════════════════════════════════
   --color-svv-red-dark EST LE SURVOL DU ROUGE DANS TOUT LE DEPOT (.svv-btn-primary:hover) : en Clair il
   fonce (#850302), en Sombre il eclaircit (#ff8a8a) — dans les deux cas il s'ECARTE du fond normal, et le
   texte (jeton surface) suit le theme avec lui. Contrastes mesures : 10,4:1 en Clair, 7,0:1 en Sombre.
   ⚠️ LE FOCUS CLAVIER EST TRAITE PAR LA MEME REGLE : Arno demande « actif + survol ET actif + focus ». Le
   liseret de focus, lui, reste celui de tous les boutons du module. */
.gpil--actif:hover:not(:disabled),
.gpil--actif:not(:disabled):focus-visible{background:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-dark);color:var(--color-svv-surface)}
`;
