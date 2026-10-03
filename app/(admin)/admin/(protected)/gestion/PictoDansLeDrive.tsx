'use client';

import { useEffect, useRef, useState } from 'react';
import {
  bullePieceDansLeDrive, ligneEmplacement, titreMenuEmplacements, type EmplacementPiece,
} from '../../../../lib/gestion/pieceDansLeDrive';
import { BaseDeDonnees } from './BaseDeDonnees';

/**
 * ══ 🔴🔴 LOT PICTO-PIECE-DANS-LE-DRIVE, POINT 1 — LE PICTO, ET SON PETIT MENU ════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « à DROITE des pictos existants (œil, téléchargement, Drive ▲), un picto “base de
 * données”. Il n'apparaît QUE si cette pièce est déjà dans le Drive. Bulle : “Pièce jointe dans le Drive”, avec
 * “(N emplacements)” si plusieurs. Clic : 1 emplacement → ouvre notre fenêtre Drive positionnée dans le dossier
 * qui contient le document ; plusieurs → petit menu listant les chemins. »
 *
 * 🔴 UN SEUL COMPOSANT POUR LES DEUX ÉCRANS. Les pictos de la lecture d'un mail (`pj-action`) et ceux du
 * récapitulatif de la conversation (`pdc-action`) n'ont pas la même classe, mais ils ont le MÊME comportement :
 * écrire deux fois le menu aurait donné deux listes, deux bulles, et un jour deux réponses différentes à la même
 * question. La classe est donc une PROP ; tout le reste est ici.
 *
 * ⚠️ RIEN DU TOUT QUAND LA PIÈCE N'EST PAS DANS LE DRIVE (demande d'Arno) : pas un bouton éteint, pas une place
 * réservée. Un picto grisé se lit comme « il devrait y être » ; l'absence, elle, ne dit rien de faux.
 *
 * 🔒 CE COMPOSANT N'OUVRE RIEN LUI-MÊME. Il DEMANDE (`onOuvrir`), et c'est l'écran parent qui monte la fenêtre
 * Drive — la même que partout ailleurs, avec ses refus serveur. Il n'accorde aucun droit, il ne lit aucun octet.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function PictoDansLeDrive({ emplacements, nomPiece, classe, onOuvrir }: {
  /** Les emplacements connus, déjà calculés par la route. Vide ⇒ ce composant ne rend RIEN. */
  emplacements: readonly EmplacementPiece[];
  /** Le nom de la PIÈCE, pour le lecteur d'écran : « Pièce jointe dans le Drive — facture.pdf ». */
  nomPiece: string;
  /** La classe du bouton, celle de la rangée d'actions de l'écran hôte (`pj-action` ou `pdc-action`). */
  classe: string;
  onOuvrir: (e: EmplacementPiece) => void;
}) {
  /**
   * ══ 🔴🔴 LE MENU EST POSÉ EN COORDONNÉES D'ÉCRAN, ET CE N'EST PAS UN CAPRICE ══════════════════════════════════
   *
   * DÉFAUT VU À L'ÉCRAN le 03/10/2026, sur les 9 emplacements d'Arno : le menu était bien rendu, avec ses neuf
   * lignes — et INVISIBLE. La carte d'une pièce (`.pj-carte`) porte `overflow:hidden` depuis le lot 5-PJ-A, pour
   * que la vignette ne déborde pas de son cadre : un menu en `position:absolute` y est coupé net.
   *
   * 🔴 D'OÙ `position:fixed` ET UNE POSE MESURÉE, exactement comme le menu contextuel de la fenêtre Drive
   * (`.sfd-menu`, lot DRIVE-LOUPE-MENU-VITESSE). On ne touche PAS au `overflow` de la carte : il protège la
   * vignette, et le changer déplacerait le défaut ailleurs.
   *
   * `null` = fermé. Sinon, le coin où poser le menu, en coordonnées de la fenêtre.
   */
  const [pose, setPose] = useState<{ droite: number; haut: number } | null>(null);
  const menuOuvert = pose !== null;
  const cadre = useRef<HTMLDivElement | null>(null);

  /**
   * ⚠️ ÉCHAP ET LE CLIC AILLEURS FERMENT LE MENU, et c'est le minimum pour un menu posé au-dessus d'une liste :
   * sans cela il resterait ouvert pendant qu'on fait autre chose, et masquerait la carte voisine.
   *
   * ⚠️ `capture` SUR ÉCHAP, ET `stopPropagation` : la fenêtre qui porte ce menu écoute elle aussi Échap. Sans
   * cela, une seule touche fermait le menu ET le récapitulatif des pièces.
   */
  useEffect(() => {
    if (!menuOuvert) return undefined;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPose(null);
    };
    const surClic = (e: MouseEvent) => {
      if (cadre.current?.contains(e.target as Node) === true) return;
      setPose(null);
    };
    /* ⚠️ UN MENU POSÉ EN COORDONNÉES D'ÉCRAN DOIT SE FERMER QUAND LA PAGE BOUGE : sinon il resterait accroché au
       vide pendant que la conversation défile sous lui. Même règle que le menu de la fenêtre Drive. */
    const surDefilement = () => setPose(null);
    window.addEventListener('keydown', surTouche, true);
    window.addEventListener('mousedown', surClic);
    window.addEventListener('scroll', surDefilement, true);
    window.addEventListener('resize', surDefilement);
    return () => {
      window.removeEventListener('keydown', surTouche, true);
      window.removeEventListener('mousedown', surClic);
      window.removeEventListener('scroll', surDefilement, true);
      window.removeEventListener('resize', surDefilement);
    };
  }, [menuOuvert]);

  if (emplacements.length === 0) return null;
  const bulle = bullePieceDansLeDrive(emplacements.length);
  const unSeul = emplacements.length === 1;

  return (
    <div className="pdd" ref={cadre}>
      <button
        type="button" className={classe}
        title={bulle} aria-label={`${bulle} — ${nomPiece}`}
        /* ⚠️ `aria-haspopup`/`aria-expanded` SEULEMENT QUAND IL Y A UN MENU : les annoncer sur un bouton qui
           ouvre directement ferait attendre une liste qui ne viendra pas. */
        aria-haspopup={unSeul ? undefined : 'menu'}
        aria-expanded={unSeul ? undefined : menuOuvert}
        onClick={(e) => {
          /* 🔴 UN SEUL EMPLACEMENT : ON Y VA (demande d'Arno). Un menu d'une seule ligne est un clic de trop. */
          if (unSeul) { onOuvrir(emplacements[0]); return; }
          if (menuOuvert) { setPose(null); return; }
          /* ⚠️ LA POSE EST MESURÉE SUR LE BOUTON, pas devinée : il vit dans une grille qui se replie, et sa
             place change avec la largeur de l'écran. */
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setPose({ droite: Math.max(8, window.innerWidth - r.right), haut: r.bottom + 2 });
        }}>
        {/* ══ 🔴🔴 LOT DRIVE-HABILLAGE, POINT 3 — L'ICÔNE SEULE EN VERT ═══════════════════════════════════════
            DEMANDE D'ARNO (03/10/2026) : « l'icône seule en VERT (même vert que la pastille), la case qui
            l'entoure inchangée ».

            🔴 LE VERT EST CELUI DE LA PASTILLE, AU JETON PRÈS : `--color-svv-green-ink`, exactement ce que
            `.sfd-piece-range` emploie. Les deux disent la MÊME chose — « ce document est déjà quelque part dans
            le Drive » — et deux verts voisins mais différents feraient douter qu'il s'agisse du même état.

            🔴 LE VERT PORTE SUR UN ENROBAGE, PAS SUR LE BOUTON : la case (fond, bordure, survol, cible de 44 px)
            reste celle de tous les autres pictos de la carte. Teindre le bouton aurait changé sa couleur au
            survol et son liseré de focus — c'est-à-dire la case, qu'Arno demande explicitement de ne pas toucher.

            ⚠️ LE TRACÉ SUIT `currentColor` (voir `BaseDeDonnees`) : il n'y a donc rien à passer à l'icône, et
            c'est aussi ce qui la fait basculer seule en Clair et en Sombre. Un emoji, lui, aurait ignoré la
            couleur — c'est la raison pour laquelle ce picto est un SVG depuis le lot PICTO-PIECE-DANS-LE-DRIVE. */}
        <span className="pdd-icone" aria-hidden="true"><BaseDeDonnees taille={17} /></span>
      </button>

      {pose !== null && !unSeul && (
        <ul className="pdd-menu" role="menu" aria-label={titreMenuEmplacements(emplacements.length)}
          /* ⚠️ LE HAUT EST BORNÉ : sur une carte en bas de page, le menu se recolle au bord plutôt que de sortir
             de l'écran — c'est la même précaution que le menu de la fenêtre Drive, en plus simple (la hauteur,
             elle, est déjà bornée par `max-height` et son propre défilement). */
          style={{ right: pose.droite, top: Math.min(pose.haut, Math.max(8, window.innerHeight - 120)) }}>
          <li className="pdd-menu-titre" role="presentation">{titreMenuEmplacements(emplacements.length)}</li>
          {emplacements.map((e) => (
            <li key={e.driveFileId} role="none">
              <button type="button" role="menuitem" className="pdd-menu-item"
                onClick={() => { setPose(null); onOuvrir(e); }}>
                {/* 🔴 LE CHEMIN, PUIS LE NOM DU FICHIER LÀ-BAS : il n'est pas toujours celui de la pièce, et
                    c'est précisément le cas qui a fondé ce lot. Les mots viennent du module pur. */}
                {ligneEmplacement(e)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Le style du picto et de son menu. Uniquement des jetons `--color-svv-*` : aucune couleur en dur, donc il bascule
 * seul en Clair et en Sombre.
 *
 * ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il vit dans un litteral de gabarit (piege TS1005 du depot, vu 12 fois).
 */
export const CSS_PICTO_DANS_LE_DRIVE = `
.pdd{position:relative;display:inline-flex}
/* ══ LOT DRIVE-HABILLAGE, POINT 3 — L'ICONE SEULE EN VERT ═══════════════════════════════════════════════════════
   Arno : « l'icone seule en VERT (meme vert que la pastille), la case qui l'entoure inchangee ».

   LE MEME JETON QUE LA PASTILLE DU COMPTEUR : --color-svv-green-ink, exactement ce que .sfd-piece-range emploie.
   Les deux disent la MEME chose — « ce document est deja quelque part dans le Drive » — et deux verts voisins mais
   differents feraient douter qu'il s'agisse du meme etat.

   LA REGLE PORTE SUR L'ENROBAGE DE L'ICONE, JAMAIS SUR LE BOUTON : la case garde son fond, sa bordure, son survol
   et sa cible de 44 px, comme tous les autres pictos de la carte. Teindre le bouton aurait aussi teint son liseré
   de focus et son survol — c'est-a-dire la case, qu'Arno demande de ne pas toucher.

   display:inline-flex — l'enrobage ne doit pas ajouter de hauteur de ligne autour du trace, sinon le picto ne
   s'aligne plus avec l'oeil et le telechargement, a sa gauche. */
.pdd-icone{display:inline-flex;align-items:center;justify-content:center;color:var(--color-svv-green-ink)}
/* 🔴 LE MENU SORT DU FLUX : la rangee d'actions ne doit pas grandir quand on l'ouvre, sinon toute la grille de
   vignettes saute d'un cran au moment precis ou l'on vise une ligne. */
/* 🔴🔴 « fixed », PAS « absolute » : la carte d'une piece porte « overflow:hidden » (lot 5-PJ-A, pour que la vignette
   ne deborde pas), et un menu absolu y est COUPE — defaut vu a l'ecran le 03/10/2026. La pose vient du composant,
   mesuree sur le bouton. */
.pdd-menu{position:fixed;z-index:90;min-width:16rem;max-width:min(26rem,80vw);
  margin:0;padding:4px;list-style:none;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.5rem;
  /* ⚠️ L'OMBRE PASSE PAR UN JETON, comme celle du menu de la fenetre Drive : un noir en dur serait invisible en
     Sombre et trop dur en Clair. */
  box-shadow:0 6px 24px color-mix(in srgb, var(--color-svv-ink) 28%, transparent);
  max-height:min(60vh,22rem);overflow:auto}
.pdd-menu-titre{padding:4px 8px 6px;font-size:.7rem;font-weight:700;letter-spacing:.03em;text-transform:uppercase;
  color:var(--color-svv-muted)}
.pdd-menu-item{display:block;width:100%;min-height:36px;padding:6px 8px;border:0;border-radius:.4rem;
  background:none;text-align:left;font-size:.78rem;line-height:1.35;color:var(--color-svv-ink);cursor:pointer;
  overflow-wrap:anywhere}
.pdd-menu-item:hover{background:var(--color-svv-field)}
.pdd-menu-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
`;
