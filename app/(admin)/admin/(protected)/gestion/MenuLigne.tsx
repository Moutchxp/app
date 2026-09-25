'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  creerAppuiLong, deplacerDansMenu, menuLigne,
  type ActionLigne, type AppuiLong, type EtatLigne,
} from '../../../../lib/gestion/menuLigne';

/**
 * LOT 5-BOITE-3 — LE MENU D'UNE LIGNE DE LA BOÎTE : clic droit, appui long, ou bouton « ⋯ ».
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 TROIS PORTES, UN SEUL MENU. Le clic droit est ce que tout le monde essaie d'abord sur un ordinateur ; l'appui
 * long est son équivalent au doigt ; le bouton « ⋯ » est la seule des trois qui SE VOIE — et c'est pour cela qu'il
 * existe : une commande qu'il faut deviner n'existe pas. Les trois ouvrent exactement les mêmes entrées, jamais un
 * sous-ensemble « pour aller plus vite ».
 *
 * 🔴 L'APPUI LONG S'ANNULE SI LE DOIGT BOUGE. Sans cela, faire défiler la liste ouvrirait un menu tous les trois
 * échanges. Dix pixels de tolérance : au-delà, c'est un défilement, pas une intention.
 *
 * 🔴 AU CLAVIER, ENTIÈREMENT. Flèches (qui bouclent aux deux bouts), Début/Fin, Échap pour refermer — et le focus
 * REVIENT sur le bouton « ⋯ » de la ligne, jamais en haut de la page : perdre le focus dans une liste de trente
 * échanges, c'est repartir de zéro.
 *
 * ⚠️ AUCUNE INTERACTION AU SEUL SURVOL : le bouton « ⋯ » est toujours visible, avec sa cible de 44 px. Sur un
 * iPhone, il n'y a pas de survol, et une commande qui n'apparaît qu'au passage de la souris n'existe pas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function MenuLigne({ titre, etat, onAction, children }: {
  /** Ce que le bouton annonce aux lecteurs d'écran — il NOMME l'échange, sinon trente boutons disent la même chose. */
  titre: string;
  etat: EtatLigne;
  onAction: (a: ActionLigne) => void;
  /**
   * LA LIGNE ELLE-MÊME. Elle est rendue DEDANS, et non à côté, pour une raison mesurée à l'écran : posés sur le seul
   * bouton « ⋯ », le clic droit et l'appui long n'ouvraient rien — il fallait viser un carré de 44 px. Ils vivent
   * donc sur TOUTE la ligne, qui est ce qu'on vise naturellement.
   */
  children: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(0);
  const boite = useRef<HTMLDivElement | null>(null);
  const bouton = useRef<HTMLButtonElement | null>(null);
  const entreesRef = useRef<(HTMLButtonElement | null)[]>([]);
  const idMenu = useId();
  const entrees = menuLigne(etat);

  const fermer = useCallback((rendreLeFocus: boolean) => {
    setOuvert(false);
    if (rendreLeFocus) bouton.current?.focus();
  }, []);

  const ouvrir = useCallback(() => { setSurvole(0); setOuvert(true); }, []);

  // Un clic dehors et Échap referment. Les écouteurs ne vivent QUE pendant l'ouverture : un menu fermé ne coûte rien,
  //   et il y en a un par ligne — trente par page.
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (e: MouseEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false); };
    const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); fermer(true); } };
    document.addEventListener('mousedown', surClic);
    document.addEventListener('keydown', surTouche);
    return () => { document.removeEventListener('mousedown', surClic); document.removeEventListener('keydown', surTouche); };
  }, [ouvert, fermer]);

  // Le focus suit la flèche : c'est ce qui rend le menu utilisable sans voir l'écran.
  useEffect(() => { if (ouvert) entreesRef.current[survole]?.focus(); }, [ouvert, survole]);

  // ── L'APPUI LONG ── Toute la règle vit dans `creerAppuiLong` (module pur, éprouvé) ; ici on ne fait que lui dire
  //   ce que le doigt fait. `useRef` et non `useState` : l'appui ne doit RIEN redessiner tant qu'il n'a pas abouti.
  const appui = useRef<AppuiLong | null>(null);
  if (appui.current === null) appui.current = creerAppuiLong({ ouvrir: () => ouvrir() });
  const annulerAppui = useCallback(() => { appui.current?.annuler(); }, []);
  useEffect(() => annulerAppui, [annulerAppui]);

  /**
   * ⚠️ LE DÉFILEMENT DE LA PAGE ANNULE AUSSI L'APPUI. `onTouchMove` ne suffit pas toujours : dès que le navigateur
   * prend la main sur le défilement, il peut cesser d'émettre des `touchmove` vers React. Sans cette seconde
   * ceinture, faire glisser la liste ouvrirait un menu une fois sur trois — et on ne saurait pas pourquoi.
   */
  useEffect(() => {
    const surDefilement = () => annulerAppui();
    window.addEventListener('scroll', surDefilement, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', surDefilement, { capture: true });
  }, [annulerAppui]);

  // Rien à proposer : la ligne est rendue TELLE QUELLE, sans bouton ni gestes — exactement l'écran d'avant ce lot.
  if (entrees.length === 0) return <>{children}</>;

  return (
    <div
      className="mlg" ref={boite}
      // ── LE CLIC DROIT ── `preventDefault` remplace le menu du navigateur par le nôtre, et seulement sur la ligne.
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); ouvrir(); }}
      onTouchStart={(e) => {
        // `changedTouches` en repli : tous les navigateurs ne remplissent pas `touches` de la même façon, et un
        //   doigt qu'on ne sait pas lire vaut un appui qu'on n'arme pas — jamais un plantage.
        const t = e.touches[0] ?? e.changedTouches[0];
        if (t !== undefined) appui.current?.commencer(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0] ?? e.changedTouches[0];
        if (t !== undefined) appui.current?.bouger(t.clientX, t.clientY);
      }}
      onTouchEnd={annulerAppui}
      onTouchCancel={annulerAppui}
    >
      {children}
      <button
        ref={bouton} type="button" className="mlg-bouton"
        aria-haspopup="menu" aria-expanded={ouvert} aria-controls={ouvert ? idMenu : undefined}
        title={titre} aria-label={titre}
        onClick={(e) => { e.stopPropagation(); if (ouvert) fermer(false); else ouvrir(); }}
        onKeyDown={(e) => {
          // La flèche du bas ouvre ET pose le focus sur la première entrée : le geste attendu d'un menu au clavier.
          if (!ouvert && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ouvrir(); }
        }}
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {ouvert && (
        <div
          className="mlg-liste" id={idMenu} role="menu" aria-label={titre}
          onKeyDown={(e) => {
            const suivant = deplacerDansMenu(e.key, survole, entrees.length);
            if (suivant === null) return;
            e.preventDefault();
            setSurvole(suivant);
          }}
        >
          {entrees.map((entree, i) => (
            <div key={entree.cle} className={entree.separateurAvant ? 'mlg-groupe' : undefined}>
              <button
                ref={(el) => { entreesRef.current[i] = el; }}
                type="button" role="menuitem" tabIndex={i === survole ? 0 : -1}
                className={`mlg-entree${entree.discrete ? ' mlg-entree--discrete' : ''}`}
                onClick={(e) => { e.stopPropagation(); fermer(true); onAction(entree.cle); }}
              >
                <span className="mlg-libelle">{entree.libelle}</span>
                {/* L'aide est ÉCRITE sous l'entrée : au doigt, il n'y a pas de survol pour la révéler. */}
                {entree.aide && <span className="mlg-aide">{entree.aide}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Le style du menu de ligne. Uniquement des jetons `--color-svv-*`, cibles de 44 px, et RIEN qui ne dépende du
 * survol. À 390 px, le menu se cale sur le bord droit de la ligne et ne déborde jamais de l'écran.
 */
export const CSS_MENU_LIGNE = `
/* La LIGNE et son bouton, côte à côte. Le menu ne peut pas être DANS le bouton d'ouverture (un bouton dans un
   bouton est invalide en HTML, et le clic ouvrirait l'échange), d'où cette rangée. */
.mlg{position:relative;display:flex;align-items:stretch;gap:2px;width:100%;min-width:0}
.mlg>.bte-ligne{flex:1 1 auto;min-width:0;border-bottom:0}
.mlg>.mlg-bouton{align-self:center}
.mlg-bouton{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;
  padding:0;border:1px solid transparent;border-radius:.45rem;background:transparent;color:var(--color-svv-muted);
  cursor:pointer;font-size:1.05rem;line-height:1}
.mlg-bouton:hover{background:var(--color-svv-field);border-color:var(--color-svv-line);color:var(--color-svv-ink)}
.mlg-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.mlg-bouton[aria-expanded="true"]{background:var(--color-svv-field);border-color:var(--color-svv-line-strong)}

/* Le menu s'ouvre SOUS le bouton et calé À DROITE : à 390 px, l'ouvrir à gauche le ferait sortir de l'écran. */
.mlg-liste{position:absolute;top:calc(100% + 2px);right:0;z-index:30;min-width:15rem;max-width:min(20rem,90vw);
  display:flex;flex-direction:column;padding:4px;border:1px solid var(--color-svv-line-strong);border-radius:10px;
  background:var(--color-svv-surface);box-shadow:0 8px 24px rgba(0,0,0,.14)}
.mlg-groupe{border-top:1px solid var(--color-svv-line);margin-top:4px;padding-top:4px}
.mlg-entree{display:flex;flex-direction:column;gap:1px;width:100%;min-height:44px;padding:8px 10px;text-align:left;
  border:0;border-radius:6px;background:none;color:var(--color-svv-ink);font:inherit;font-size:.85rem;cursor:pointer}
.mlg-entree:hover{background:var(--color-svv-field)}
.mlg-entree:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* « Défaire » n'est pas « danger » : l'entrée est mise à part, jamais rendue rouge pour effrayer. */
.mlg-entree--discrete .mlg-libelle{color:var(--color-svv-muted)}
.mlg-libelle{font-weight:600}
.mlg-aide{font-size:.74rem;font-weight:400;color:var(--color-svv-muted);white-space:normal;line-height:1.35}

@media (prefers-reduced-motion:reduce){.mlg-liste{box-shadow:none}}
`;
