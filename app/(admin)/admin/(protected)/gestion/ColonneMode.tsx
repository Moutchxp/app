'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ATTR_MOBILE, ATTR_PLEIN_ECRAN, ID_EMPLACEMENT_MODE } from '../Sidebar';

/**
 * LOT 5-FUSION-B — LA COLONNE DU MODE, POSÉE DANS LA BARRE DE L'ADMINISTRATION.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE FAIT CE FICHIER, ET CE QU'IL NE FAIT PAS. En plein écran, les commandes de l'écran (les étiquettes de la
 * boîte, le titre des événements) prennent la place des LIENS DE MODULES dans la barre de gauche — décision d'Arno du
 * 24/09/2026. Trois choses NE bougent pas, et ce fichier n'y touche jamais : la marque « Admin SVAV® » (même rendu,
 * même destination), la déconnexion et le choix du thème (qui restent en bas), et la barre du haut (identité,
 * « Changer mon mot de passe »). L'écran partagé, lui, garde sa navigation complète.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 POURQUOI UN PORTAIL. La barre latérale est un FRÈRE du contenu dans la coquille de l'admin, pas son parent : un
 * écran ne peut pas la remplacer en se dessinant lui-même. Dessiner une SECONDE colonne à côté aurait donné, sur un
 * grand écran, deux barres verticales et deux marques « Admin SVAV® ». Le portail dépose donc le contenu DANS la barre
 * existante, et un attribut sur la racine du document dit au CSS de la barre d'effacer ses liens de modules.
 *
 * ⚠️ REPLI SANS PORTAIL. Si l'emplacement n'existe pas — écran monté hors de la coquille, test qui rend la vue seule —
 * la colonne s'affiche EN PLACE plutôt que de disparaître. Une fonction qui s'évapore parce qu'un conteneur manque est
 * le genre de défaut qu'on ne voit qu'en production.
 *
 * MOBILE D'ABORD : sous 768 px il n'y a pas deux colonnes mais DEUX ÉCRANS — la colonne, puis son contenu — avec un
 * retour explicite entre les deux. Le CSS qui les bascule vit dans `Sidebar` (il vise ses propres classes) ; ici on ne
 * pose que l'attribut qui le commande.
 */

/** Ce que la colonne du mode montre sur téléphone : elle-même, ou le contenu de l'écran. */
export type PanneauMobile = 'colonne' | 'contenu';

/**
 * Pose (et retire) les attributs qui commandent le CSS de la barre. PUR au sens où il ne dépend que de ses arguments,
 * et REVERSIBLE : quitter le plein écran ou démonter l'écran rend la barre exactement à son état d'avant.
 */
export function appliquerAttributs(racine: HTMLElement | null, plein: boolean, mobile: PanneauMobile): void {
  if (!racine) return;
  if (plein) {
    racine.setAttribute(ATTR_PLEIN_ECRAN, '1');
    racine.setAttribute(ATTR_MOBILE, mobile);
  } else {
    racine.removeAttribute(ATTR_PLEIN_ECRAN);
    racine.removeAttribute(ATTR_MOBILE);
  }
}

export function ColonneMode({ actif, panneauMobile, titre, children }: {
  /** `false` = écran partagé : rien n'est posé, rien n'est masqué, la barre est celle de toujours. */
  actif: boolean;
  panneauMobile: PanneauMobile;
  /** Nommé pour les lecteurs d'écran : « Étiquettes de la boîte », « Événements ». */
  titre: string;
  children: ReactNode;
}) {
  // Les attributs suivent l'état, et sont RETIRÉS au démontage — quitter la page de gestion ne doit pas laisser
  //   l'administration sans sa navigation.
  useEffect(() => {
    const racine = document.documentElement;
    appliquerAttributs(racine, actif, panneauMobile);
    return () => appliquerAttributs(racine, false, panneauMobile);
  }, [actif, panneauMobile]);

  if (!actif) return null;

  /**
   * L'emplacement est cherché AU RENDU, et c'est sûr ICI — pas ailleurs. Le plein écran n'existe qu'après le montage :
   * l'écran part toujours de l'écran partagé et ne lit l'adresse que dans un effet (`GestionVue`). Ce composant n'est
   * donc jamais rendu par le serveur ni pendant l'hydratation, et aucun décalage n'est possible.
   *
   * ⚠️ Si un jour l'écran lisait l'adresse PENDANT le rendu, il faudrait repasser par un état posé après le montage :
   * lire le DOM au rendu ferait alors diverger le HTML du serveur et celui du client.
   */
  const cible = typeof document === 'undefined' ? null : document.getElementById(ID_EMPLACEMENT_MODE);

  const contenu = (
    <nav className="cm" aria-label={titre}>
      <style>{CSS_COLONNE}</style>
      {children}
    </nav>
  );
  // Repli assumé : sans emplacement, on rend en place plutôt que de ne rien rendre (voir l'encadré).
  return cible ? createPortal(contenu, cible) : contenu;
}

const CSS_COLONNE = `
.cm{display:flex;flex-direction:column;gap:8px;min-width:0}
.cm-titre{margin:.25rem 0 0;font-size:13px;font-weight:700;color:var(--color-svv-ink);display:flex;align-items:center;gap:.5rem}
.cm-note{margin:0;font-size:.75rem;line-height:1.4;color:var(--color-svv-muted)}
.cm-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
/* ══ LOT ERGO-BOITE-3 — LA LIGNE « RÉCEPTION » ET SES DEUX SÉLECTEURS ═══════════════════════════════════════════
   Le nom prend la place qu'il faut, les deux nombres sont collés à droite. L'ACTIF est en gras ET souligné, l'autre
   en gris clair ET souligné : deux marques par état, dont une qui survit aux niveaux de gris et au daltonisme.
   Le soulignement des deux dit « c'est cliquable » — un nombre souligné n'a jamais l'air d'un simple compteur. */
.cm-li-sel{display:flex;align-items:center;gap:2px}
.cm-entree--nom{flex:1 1 auto;min-width:0}
.cm-sels{display:inline-flex;align-items:center;gap:8px;padding-right:8px;flex:0 0 auto}
.cm-sel{background:transparent;border:0;padding:2px 0;font-size:11px;cursor:pointer;
  text-decoration:underline;text-underline-offset:2px;color:var(--color-svv-muted);font-weight:500}
.cm-sel:hover{color:var(--color-svv-ink)}
.cm-sel--actif{color:var(--color-svv-ink);font-weight:800}
.cm-sel:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:3px}
/* ══ LOT ERGO-BOITE — CE QUI SUIT LES ENTRÉES DE LA BOÎTE ═══════════════════════════════════════════════════════
   « À rattacher » et « Annuaire » sont des gestes, pas des dossiers de courrier : un filet les sépare des entrées,
   sans les reléguer. */
.cm-liste--apres{margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--color-svv-line)}
/* L'ÉTAT ORDINAIRE, EN PETIT ET EN BAS. Il se consulte, il ne se lit pas : c'est pour cela qu'il descend ici, et
   c'est ce qui redonne au bandeau d'alerte, resté en haut de page, le pouvoir de se faire remarquer. */
.cm-etat{margin-top:.75rem;padding-top:.6rem;border-top:1px solid var(--color-svv-line);
  font-size:.7rem;line-height:1.45;color:var(--color-svv-muted)}
.cm-etat-ligne{margin:0 0 .35rem}
.cm-etat-ligne:last-child{margin-bottom:0}
/* Une entrée de colonne : cible tactile confortable, texte qui casse plutôt que de déborder. */
.cm-entree{display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:100%;min-height:44px;
  padding:.45rem .6rem;text-align:left;font:inherit;font-size:.85rem;color:var(--color-svv-ink);cursor:pointer;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:.6rem}
.cm-entree:hover{border-color:var(--color-svv-line-strong)}
.cm-entree:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
/* L'entrée ouverte est dite par un MOT (aria-current) autant que par la forme : lisible en niveaux de gris. */
.cm-entree--active{background:var(--color-svv-field);border-color:var(--color-svv-line-strong);font-weight:700;
  text-decoration:underline;text-underline-offset:4px}
.cm-nom{display:flex;flex-direction:column;gap:1px;min-width:0}
.cm-texte{overflow-wrap:anywhere}
/* LOT 5-BOITE — « 3 non lus », À CÔTÉ du total et jamais à sa place. Le mot est écrit en toutes lettres : une
   pastille colorée seule ne dirait rien en niveaux de gris ni à un lecteur d'écran. Le texte se replie avant le
   nombre total, pour qu'à 390 px ce soit l'information la moins utile qui saute à la ligne. */
.cm-non-lus{flex:0 1 auto;min-width:0;font-size:.74rem;font-weight:700;color:var(--color-svv-ink);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;
