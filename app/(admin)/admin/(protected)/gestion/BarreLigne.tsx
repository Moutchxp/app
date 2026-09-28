'use client';

// LOT BARRE-STATUT — le statut de la capsule décide du dernier bouton. Module PUR : aucun import qui tire `pg`.
import { actionDeLaCapsule, type CapsuleStatut } from '../../../../lib/gestion/statutClassement';

/**
 * LOT LISTE-GMAIL — LA BARRE D'ACTIONS D'UNE LIGNE, AU SURVOL.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS. Cinq gestes fréquents, à portée de souris sur la ligne, comme dans
 * Gmail : le nombre de messages, l'étoile, l'enveloppe (lu / non lu), la corbeille, « Classer ». Elle ne REMPLACE
 * rien : le menu au clic droit garde toutes ses entrées, et chacun de ces gestes existait déjà ailleurs.
 *
 * 🔴 UN CLIC DANS LA BARRE N'OUVRE PAS LE MAIL. C'est la garantie qui rend la barre utilisable : elle se pose
 * PAR-DESSUS la ligne (qui est un bouton), et chacun de ses boutons arrête la propagation. Sans cela, mettre un
 * échange à la corbeille l'ouvrirait en même temps — et on lirait un mail qu'on venait de ranger.
 *
 * 🔴 AU CLAVIER AUSSI. La barre apparaît au survol MAIS AUSSI dès que le focus entre dans la ligne (`:focus-within`
 * sur la rangée, cf. la feuille de style de la liste) : une barre qu'on ne peut atteindre qu'à la souris n'existe
 * pas pour qui navigue au clavier.
 *
 * ⚠️ LA CORBEILLE DEMANDE CONFIRMATION, TOUJOURS. C'est le seul geste de la barre qui retire un échange de la vue ;
 * il est réversible (corbeille INTERNE, rien n'est supprimé de Gmail ni de la base), mais un clic involontaire au
 * survol se produirait sans qu'on l'ait voulu. La confirmation s'ouvre DANS la barre, sans quitter la liste.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface EtatBarreLigne {
  /** Le nombre de messages de l'échange. Affiché seulement s'il y en a PLUS D'UN : « 1 » n'apprend rien. */
  nbMessages: number;
  etoilee: boolean;
  /**
   * L'étoile est-elle utilisable ? `false` = migration 264 non appliquée : le bouton est rendu DÉSACTIVÉ avec une
   * info-bulle qui le dit — plutôt qu'absent (on chercherait un bug) ou actif (on promettrait un geste impossible).
   */
  etoileDisponible: boolean;
  /** L'échange porte-t-il un message reçu non lu ? Décide du sens de l'enveloppe ET de l'action proposée. */
  nonLu: boolean;
  /** La corbeille est-elle disponible (migration 251) ? Sinon, pas de bouton — le geste n'existe pas. */
  corbeilleDisponible: boolean;
  /**
   * LOT BARRE-STATUT — LE STATUT DE LA CAPSULE de cette ligne, qui décide du dernier bouton de la barre.
   * `undefined` = pas de capsule (Brouillons, Spam, ou réponse de serveur plus ancienne que le lot CAPSULE-STATUT) :
   * on garde alors « Classer », parce qu'on ne devine pas un état qu'on n'a pas lu.
   */
  statut?: CapsuleStatut;
}

export function BarreLigne({ etat, confirme, onConfirmer, onEtoile, onLecture, onCorbeille, onClasser, onVisualiser }: {
  etat: EtatBarreLigne;
  /**
   * 🔴 LA CONFIRMATION DE CORBEILLE EST PILOTÉE PAR LA LISTE, pas gardée ici. C'est ce qui garantit qu'il n'y en a
   * JAMAIS DEUX : ouvrir celle d'une ligne referme celle d'une autre. Gardée en propre, chaque barre pouvait rester
   * ouverte de son côté, et deux lignes montraient leur barre en même temps.
   */
  confirme: boolean;
  onConfirmer: (ouvrir: boolean) => void;
  onEtoile: (etoilee: boolean) => void;
  onLecture: (lu: boolean) => void;
  onCorbeille: () => void;
  onClasser: () => void;
  /**
   * LOT BARRE-STATUT — ouvre la fenêtre « Visualiser / Modifier » des rattachements. N'est appelé que quand la
   * capsule est VERTE. Absent = on retombe sur `onClasser` : un bouton ne promet jamais un geste qui n'existe pas.
   */
  onVisualiser?: () => void;
}) {
  /**
   * ══ 🔴 LE MÊME TRAITEMENT POUR TOUS LES BOUTONS DE LA BARRE ═══════════════════════════════════════════════════
   * ① on ARRÊTE LA PROPAGATION avant d'agir : la ligne qui nous porte est un bouton, et sans cela chaque geste de
   *    la barre ouvrirait aussi le mail ;
   * ② on REND LE FOCUS après un clic SOURIS. Défaut constaté par Arno le 27/09/2026 : le bouton cliqué gardait le
   *    focus, la rangée restait « focus-within », et la barre restait affichée une fois la souris partie — sur
   *    plusieurs lignes à la fois. Le bouton n'a aucune raison de garder le focus après un clic de souris.
   *
   * ⚠️ `e.detail > 0` DISTINGUE LA SOURIS DU CLAVIER : une activation au clavier (Entrée, Espace) rend `detail: 0`.
   * On ne lui retire donc JAMAIS le focus — ce serait rendre la barre inutilisable au clavier, exactement ce qu'on
   * veut préserver.
   */
  const geste = (f: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.detail > 0) (e.currentTarget as HTMLElement).blur();
    f();
  };

  if (confirme) {
    return (
      <span className="brl brl--confirme" role="group" aria-label="Confirmer la mise à la corbeille"
        onClick={(e) => e.stopPropagation()}>
        <span className="brl-question">Mettre cet échange à la corbeille ?</span>
        <button type="button" className="brl-bouton" onClick={geste(() => onConfirmer(false))}>Annuler</button>
        <button type="button" className="brl-bouton brl-bouton--rouge"
          onClick={geste(() => { onConfirmer(false); onCorbeille(); })}>
          Confirmer
        </button>
      </span>
    );
  }

  return (
    <span className="brl" role="group" aria-label="Actions sur cet échange" onClick={(e) => e.stopPropagation()}>
      {/* a. LE NOMBRE DE MESSAGES — déplacé ici depuis le bas de la ligne, et seulement s'il dépasse 1. */}
      {etat.nbMessages > 1 && (
        <span className="brl-compte" title={`${etat.nbMessages} messages dans cet échange`}>{etat.nbMessages}</span>
      )}

      {/* b. L'ÉTOILE de l'équipe — état de NOTRE application, partagé et daté. Elle ne touche pas à Gmail. */}
      <button type="button"
        className={`brl-icone${etat.etoilee ? ' brl-icone--etoilee' : ''}`}
        disabled={!etat.etoileDisponible}
        aria-pressed={etat.etoilee}
        aria-label={etat.etoilee ? 'Retirer l’étoile' : 'Mettre une étoile'}
        title={etat.etoileDisponible
          ? (etat.etoilee ? 'Retirer l’étoile' : 'Mettre une étoile')
          : 'Étoile indisponible : mise à jour de la base à appliquer (migration 264).'}
        onClick={geste(() => onEtoile(!etat.etoilee))}>
        <Etoile pleine={etat.etoilee} />
      </button>

      {/* c. L'ENVELOPPE — elle montre L'ACTION POSSIBLE, pas l'état : ouverte quand le mail est non lu, donc
             « je peux le marquer lu ». Le mot est dans le libellé accessible, jamais porté par la seule forme. */}
      <button type="button" className="brl-icone"
        aria-label={etat.nonLu ? 'Marquer comme lu' : 'Marquer comme non lu'}
        title={etat.nonLu ? 'Marquer comme lu' : 'Marquer comme non lu'}
        onClick={geste(() => onLecture(etat.nonLu))}>
        <Enveloppe ouverte={etat.nonLu} />
      </button>

      {/* d. LA CORBEILLE — interne, réversible, et TOUJOURS confirmée. */}
      {etat.corbeilleDisponible && (
        <button type="button" className="brl-icone"
          aria-label="Mettre à la corbeille" title="Mettre à la corbeille"
          onClick={geste(() => onConfirmer(true))}>
          <Corbeille />
        </button>
      )}

      {/* ══ 🔴 e. LE BOUTON DE FIN DE BARRE SUIT LA CAPSULE — lot BARRE-STATUT, demande d'Arno ═══════════════════
             · capsule ROUGE « À classer » → « Classer », en ROUGE : le MÊME module d'affectation que le mail
               ouvert, pour rattacher l'échange et ses pièces. C'est le comportement d'avant ce lot, inchangé ;
             · capsule VERTE « Classé » ou « Auto » → « Visualiser / Modifier », dans le MÊME vert que la capsule ;
             · capsule GRISE « Hors gestion » → « Visualiser / Modifier » aussi, mais en GRIS : le mail a bien une
               réponse (« aucun bien »), elle se consulte et se défait — proposer « Classer » nierait la décision.
               Proposer « Classer » sur un échange déjà rangé posait une question à laquelle la ligne répondait
               déjà deux centimètres plus à gauche ; ce qu'on veut alors, c'est VOIR où il est rangé.
             ⚠️ LE BOUTON NE DISPARAÎT JAMAIS : la barre garde exactement le même nombre de commandes, à la même
             place. Seuls le mot et le ton changent — la cible du clic ne se déplace pas sous le doigt.
             ⚠️ SANS CAPSULE (`statut` absent : Brouillons, Spam, réponse de serveur plus ancienne que le lot
             CAPSULE-STATUT), on garde « Classer ». On ne devine pas un état qu'on n'a pas lu. */}
      {/* 🔴 LOT STATUT-HORS-GESTION — un TROISIÈME ton, le GRIS, pour « Hors gestion ». Le mot et le ton viennent
          d'`actionDeLaCapsule` (module PUR) et non d'un `if` écrit ici : la barre, l'en-tête du mail ouvert et la
          boîte de réception doivent s'accorder, et trois copies de la même règle finissent par diverger. */}
      {(() => {
        const a = actionDeLaCapsule(etat.statut);
        return (
          <button type="button" className={`brl-bouton brl-bouton--${a.ton}`}
            onClick={geste(a.ton === 'rouge' ? onClasser : (onVisualiser ?? onClasser))}>
            {a.mot}
          </button>
        );
      })()}
    </span>
  );
}

/** L'étoile, pleine ou vide. `aria-hidden` : le bouton qui la porte est déjà nommé. */
export function Etoile({ pleine }: { pleine: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill={pleine ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" strokeLinejoin="round" />
    </svg>
  );
}

function Enveloppe({ ouverte }: { ouverte: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" />
      {ouverte ? <path d="M3 8l9 6 9-6" /> : <path d="M3 7l9 6 9-6" />}
    </svg>
  );
}

function Corbeille() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 7V5h4v2M6 7l1 12h10l1-12" />
    </svg>
  );
}

export const CSS_BARRE_LIGNE = `
/* ══ LA BARRE : par-dessus la date, tout à droite, révélée au survol ET au focus ════════════════════════════════
   Elle est POSITIONNÉE EN ABSOLU au-dessus du bout de la ligne — c'est ce qui lui permet de masquer la date sans
   décaler quoi que ce soit, donc sans faire sauter la liste quand la souris passe.
   ⚠️ ELLE RESTE DANS LE FLUX DU CLAVIER : hidden ou display:none la rendraient inatteignable à la tabulation. On
   la masque par l'opacité, et la rangée la révèle au survol comme au focus (voir la liste).
   ⚠️⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un littéral gabarit, qu'un seul backtick refermerait. */
/* ══ 🔴 LA BARRE S'ARRÊTE AVANT LE « ⋯ » ════════════════════════════════════════════════════════════════════════
   Défaut signalé par Arno : collée à 6 px du bord, la barre recouvrait le bouton « ⋯ » de la ligne, qui devenait
   impossible à cliquer tant qu'elle était affichée. Mesuré : le menu occupe 1448–1492 (44 px, collé au bord) et la
   barre 1329–1486 — elle passait par-dessus sur 38 px.
   Le retrait vaut donc la LARGEUR DU MENU (44 px, la cible tactile minimale, imposée par .mlg-bouton) plus 8 px
   d'air. Écrit en calc() et non en 52px figés, pour que les deux bougent ensemble le jour où la cible change.
   ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : littéral gabarit. */
.brl{position:absolute;right:calc(44px + 8px);top:50%;transform:translateY(-50%);z-index:2;
  display:inline-flex;align-items:center;gap:2px;padding:2px 4px;border-radius:8px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  box-shadow:0 1px 4px rgba(17,19,24,.12);opacity:0;pointer-events:none;transition:opacity .08s ease-out}
/* 🔴 SURVOL, OU FOCUS VENU DU CLAVIER — ET RIEN D'AUTRE. La règle focus-within gardait la barre allumée après un
   clic SOURIS, parce que le bouton cliqué conservait le focus : la barre restait sur la ligne une fois la souris
   partie, et sur plusieurs lignes à la fois. focus-visible ne s'allume, lui, que pour une navigation au clavier —
   c'est exactement la distinction demandée. Le blur() posé côté script en est la ceinture (voir le composant).
   ⚠️ LA CONFIRMATION DE CORBEILLE FAIT EXCEPTION et reste visible jusqu'à Annuler ou Confirmer (règle plus bas).
   ⚠️ AUCUN ACCENT GRAVE ICI : littéral gabarit. */
.bte-li:hover .brl,.bte-li:has(:focus-visible) .brl{opacity:1;pointer-events:auto}
@media (prefers-reduced-motion:reduce){.brl{transition:none}}
/* Sur écran tactile, il n'y a pas de survol : la barre est montrée en permanence plutôt qu'inatteignable. */
@media (pointer:coarse){.brl{opacity:1;pointer-events:auto;position:static;transform:none;box-shadow:none}}
.brl-compte{padding:0 .3rem;font-size:.74rem;font-weight:700;color:var(--color-svv-muted)}
.brl-icone{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;
  background:transparent;border:0;border-radius:6px;color:var(--color-svv-muted);cursor:pointer}
.brl-icone:hover{background:var(--color-svv-field);color:var(--color-svv-ink)}
.brl-icone:disabled{opacity:.45;cursor:not-allowed}
.brl-icone:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* L'étoile POSÉE garde la couleur de la marque, et sa forme est pleine : deux marques, jamais la couleur seule. */
.brl-icone--etoilee{color:var(--color-svv-red)}
.brl-bouton{padding:.15rem .4rem;font:inherit;font-size:.76rem;font-weight:600;background:transparent;border:0;
  border-radius:6px;color:var(--color-svv-ink);cursor:pointer}
.brl-bouton:hover{background:var(--color-svv-field)}
.brl-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.brl-bouton--rouge{color:var(--color-svv-red)}
/* LOT STATUT-HORS-GESTION — le MEME gris que la capsule « Hors gestion ». Le MOT est ecrit dans les trois cas. */
.brl-bouton--gris{color:var(--color-svv-muted)}
/* LOT BARRE-STATUT — le MEME vert que la capsule « Classé » / « Auto » (var(--color-svv-green-ink)), pour qu'on
   lise d'un coup que le bouton parle de la capsule qui est juste a cote. Le MOT change aussi, toujours : la
   couleur seule resterait muette en niveaux de gris et pour un daltonien. */
.brl-bouton--vert{color:var(--color-svv-green-ink)}
/* La confirmation prend la place de la barre, sans quitter la liste : on décide là où l'on a cliqué. */
.brl--confirme{opacity:1;pointer-events:auto;gap:.4rem}
.bte-li .brl--confirme{opacity:1;pointer-events:auto}
.brl-question{font-size:.76rem;color:var(--color-svv-ink)}
/* 🔴 L'ÉTOILE POSÉE, AU DÉBUT DE LA LIGNE, EN PERMANENCE — hors barre, donc visible sans survol. Une étoile
   éteinte, elle, ne s'affiche nulle part : elle ne dirait rien et alourdirait chaque ligne. */
/* ⚠️ L'ÉTOILE EST DANS LA CELLULE DU CORRESPONDANT, à côté de son texte. Posée en voisine, elle prenait une colonne
   de la grille dense et réduisait l'adresse à un caractère de large — vu à l'écran le 27/09/2026.
   ⚠️ AUCUN ACCENT GRAVE ICI : littéral gabarit. */
.bte-etoile{display:inline-flex;align-items:center;vertical-align:-2px;color:var(--color-svv-red);margin-right:.25rem}
`;
