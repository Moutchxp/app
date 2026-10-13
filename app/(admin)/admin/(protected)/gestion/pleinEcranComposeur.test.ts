// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { cssPleinEcranComposeur, LARGEUR_COLONNE_ADMIN_PX } from './pleinEcranComposeur';
import { CSS_FENETRES } from './FenetresRedaction';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';

/**
 * ══ 🔴🔴 LOT PLEIN-ECRAN-COMPOSEUR — LES GARDE-FOUS ═══════════════════════════════════════════════════════════════
 * Un seul comportement partagé (réponse en place ET fenêtre de la boîte) : toute la zone de travail, fond opaque,
 * aucun transform, aucun voile en pseudo-élément ; « Réduire » et « Fermer » groupés à droite ; rien de perdu.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('🔴 la géométrie partagée', () => {
  const css = cssPleinEcranComposeur('.x.x--plein');
  it('toute la zone de travail : bornée aux quatre bords, à droite de la colonne de 240 px dès 768 px', () => {
    expect(css).toMatch(/\.x\.x--plein\{position:fixed;top:0;right:0;bottom:0;left:0;transform:none/);
    expect(css).toContain(`@media (min-width:768px){.x.x--plein{left:${LARGEUR_COLONNE_ADMIN_PX}px}}`);
  });
  it('fond OPAQUE du thème, défilement interne, aucun voile en pseudo-élément', () => {
    expect(css).toContain('background:var(--color-svv-surface)');
    expect(css).toContain('overflow-y:auto');
    expect(css).toContain('.x.x--plein::before{content:none;display:none}');
    expect(css).not.toMatch(/translateX|left:50%|4vh/);
  });
  it('🔴 les DEUX cadres l’emploient : la réponse en place et la fenêtre de la boîte', () => {
    expect(CSS_FENETRES).toContain(cssPleinEcranComposeur('.fre.fre--plein'));
  });
});

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5, classementDisponible: false, interneDisponible: false,
};
const REPONSE: BrouillonEcran = {
  id: null, voie: 'repondre', a: ['gabrielle@exemple.test'], cc: ['x@exemple.test'], cci: [], objet: 'Re: Fuite',
  corps: 'Texte en cours\n\nService Gestion', citation: null, destinatairesApproximatifs: false,
  filId: 77, repondALeMessageId: 9123,
};
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, brouillon: { id: 1 } }), { status: 200 })));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); };

describe('🔴 la réponse en place (historique, conversation)', () => {
  it('« Plein écran » ↔ « Réduire » : même section (jamais démontée), rien de perdu ; boutons groupés à droite', async () => {
    let courant = REPONSE;
    const rendre = () => root.render(createElement(Redaction, {
      brouillon: courant, contexte: CONTEXTE, onChange: (b: BrouillonEcran) => { courant = b; rendre(); },
      onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
    } as never));
    await act(async () => { rendre(); });
    await calmer();
    const section = container.querySelector('section.red') as HTMLElement;
    const groupe = section.querySelector('.red-haut > .red-haut-boutons') as HTMLElement;
    expect([...groupe.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Plein écran', 'Fermer']);
    await act(async () => { (groupe.querySelector('button') as HTMLButtonElement).click(); });
    expect(container.querySelector('section.red')).toBe(section); // le même nœud : rien n'a été remonté
    expect(section.classList.contains('red--plein')).toBe(true);
    expect([...groupe.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Réduire', 'Fermer']);
    expect(courant.corps).toContain('Texte en cours');
    expect(courant.cc).toEqual(['x@exemple.test']);
    await act(async () => { (groupe.querySelector('button') as HTMLButtonElement).click(); });
    expect(section.classList.contains('red--plein')).toBe(false);
    expect(courant.a).toEqual(['gabrielle@exemple.test']);
  });
});
