'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * LOT 4d — LE MENU DISCRET « ⋯ ».
 *
 * DÉCISION D'ARNO, et c'est la raison d'être de ce composant : « des boutons discrets dans chacun des mails, sinon il
 * y aura des boutons partout ». Un dossier ouvert montre une carte, ses échanges et leurs messages ; si chacun portait
 * sa rangée de boutons, l'écran deviendrait illisible avant d'être utile. Les commandes se rangent donc derrière un
 * point d'entrée EFFACÉ AU REPOS — et qui reste, lui, parfaitement atteignable.
 *
 * Discret ne veut pas dire inaccessible :
 *   · c'est un vrai `<button>`, donc atteignable au clavier, avec `aria-haspopup` et `aria-expanded` ;
 *   · sa cible tactile fait 44 px quoi qu'il arrive (le glyphe est petit, la zone ne l'est pas) ;
 *   · il ne dépend d'AUCUN survol — sur un téléphone, il n'y a pas de survol ;
 *   · Échap referme, un clic à l'extérieur referme, et le focus revient sur le bouton.
 */
export interface EntreeMenu {
  libelle: string;
  onChoisir: () => void;
  /** Vrai pour une entrée qui défait quelque chose : elle est mise à part, jamais rendue rouge pour effrayer. */
  discrete?: boolean;
}

export function MenuDiscret({ titre, entrees, desactive = false }: {
  /** Ce que le bouton annonce aux lecteurs d'écran — « Actions sur ce message », « Actions sur cet échange ». */
  titre: string;
  entrees: EntreeMenu[];
  desactive?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef<HTMLDivElement | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const idMenu = useId();

  const fermer = useCallback((rendreLeFocus = false) => {
    setOuvert(false);
    if (rendreLeFocus) bouton.current?.focus();
  }, []);

  // Un clic dehors et la touche Échap referment. Les deux écouteurs ne vivent QUE pendant l'ouverture : un menu fermé
  //   ne coûte rien, et il y en a un par message.
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false); };
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOuvert(false); bouton.current?.focus(); } };
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => { document.removeEventListener('mousedown', surClic); document.removeEventListener('keydown', surTouche); };
  }, [ouvert]);

  return (
    <div className="gst-menu" ref={boite}>
      <button ref={bouton} type="button" className="gst-menu-bouton" disabled={desactive}
        aria-haspopup="menu" aria-expanded={ouvert} aria-controls={ouvert ? idMenu : undefined}
        title={titre} aria-label={titre}
        onClick={() => setOuvert((o) => !o)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {ouvert && (
        <div className="gst-menu-liste" id={idMenu} role="menu">
          {entrees.map((e) => (
            <button key={e.libelle} type="button" role="menuitem"
              className={`gst-menu-entree${e.discrete ? ' gst-menu-entree--discrete' : ''}`}
              onClick={() => { fermer(); e.onChoisir(); }}>
              {e.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
