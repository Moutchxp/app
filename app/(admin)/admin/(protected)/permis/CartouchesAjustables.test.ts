// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { CartouchesAjustables, BasculeMode } from './TraceEmpriseRendu';
import type { EmpriseReconstruite } from '../../../../lib/permis/empriseReconstruiteRepo';

/** Fixture minimale : seul `id` est lu par le composant (le nom vient du `nomEmprise` fourni). */
const emp = (id: number): EmpriseReconstruite => ({ id }) as unknown as EmpriseReconstruite;
const nom = (e: EmpriseReconstruite) => `bâtiment en projet ${e.id}`;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

describe('CartouchesAjustables (BAT défaut 3) — un cartouche par emprise, sélection lisible et accessible', () => {
  it('un cartouche par emprise, nommé via nomEmprise (source unique, même nom que la barre)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: null, onSelectionner: () => {} }));
    expect(html).toContain('bâtiment en projet 1');
    expect(html).toContain('bâtiment en projet 2');
    expect((html.match(/<button/g) ?? []).length).toBe(2);
  });

  it('le SÉLECTIONNÉ : rouge + marque ÉCRITE « sélectionné » + aria-current (jamais la couleur seule)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 2, onSelectionner: () => {} }));
    // marque écrite + drapeau lecteur d'écran
    expect(html).toContain('sélectionné');
    expect(html).toContain('aria-current="true"');
    // exactement UN cartouche sélectionné + un liseré rouge présent
    expect((html.match(/data-selectionne="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('var(--color-svv-red)');
  });

  it('aucune sélection → aucun aria-current, aucune marque « sélectionné »', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1)], nomEmprise: nom, selectionId: null, onSelectionner: () => {} }));
    expect(html).not.toContain('aria-current');
    expect(html).not.toContain('sélectionné');
  });

  it('une SEULE emprise → la rangée reste affichée (dit sur quoi on travaille)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(9)], nomEmprise: nom, selectionId: 9, onSelectionner: () => {} }));
    expect(html).toContain('bâtiment en projet 9');
    expect((html.match(/<button/g) ?? []).length).toBe(1);
  });

  it('aucune emprise → aucune rangée (rien à ajuster)', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [], nomEmprise: nom, selectionId: null, onSelectionner: () => {} }));
    expect(html).toBe('');
  });

  it('cliquer un cartouche SÉLECTIONNE ce polygone (onSelectionner reçoit son id)', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onSelectionner = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 1, onSelectionner })); });
    const btn2 = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('bâtiment en projet 2'))!;
    act(() => { btn2.click(); });
    expect(onSelectionner).toHaveBeenCalledWith(2);
  });

  it('occupe → cartouches indisponibles (aria-disabled) le temps de la requête', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1)], nomEmprise: nom, selectionId: null, onSelectionner: () => {}, occupe: true }));
    expect(html).toContain('aria-disabled="true"');
  });
});

describe('CartouchesAjustables (BAT défaut D) — confirmation ANCRÉE au cartouche visé, jamais un clic muet', () => {
  it('le cartouche VISÉ (confirmId) devient une carte « à confirmer » : texte explicite + deux issues + aria', () => {
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 1, confirmId: 2, onSelectionner: () => {}, onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(html).toContain('travail non enregistré'); // TEXTE lisible, à l'endroit du clic (couvre ajustement ET retouche)
    expect(html).toContain('Changer quand même');
    expect(html).toContain('Rester');
    expect(html).toContain('bâtiment en projet 2');       // ancré sur le polygone VISÉ, nommé
    expect(html).toContain('role="group"');               // structure exposée aux lecteurs d'écran
  });

  it('les AUTRES cartouches sont indisponibles pendant la confirmation : aria-disabled + texte « indisponible » (jamais la couleur seule)', () => {
    // 3 emprises : 1 sélectionnée, 2 en confirmation, 3 = « autre » ni sélectionnée ni visée → doit être marquée indisponible.
    const html = renderToStaticMarkup(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2), emp(3)], nomEmprise: nom, selectionId: 1, confirmId: 2, onSelectionner: () => {}, onConfirmer: () => {}, onAnnuler: () => {} }));
    expect(html).toContain('aria-disabled="true"'); // état accessible
    expect(html).toContain('— indisponible');       // dit AUSSI par le texte (cartouche 3)
  });

  it('« Changer quand même » appelle onConfirmer, « Rester » appelle onAnnuler', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onConfirmer = vi.fn(), onAnnuler = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 1, confirmId: 2, onSelectionner: () => {}, onConfirmer, onAnnuler })); });
    const trouver = (t: string) => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(t))!;
    act(() => { trouver('Changer quand même').click(); });
    expect(onConfirmer).toHaveBeenCalledTimes(1);
    act(() => { trouver('Rester').click(); });
    expect(onAnnuler).toHaveBeenCalledTimes(1);
  });

  it('cliquer un cartouche INDISPONIBLE pendant la confirmation n’a aucun effet (onSelectionner non appelé)', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onSelectionner = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(CartouchesAjustables, { emprises: [emp(1), emp(2)], nomEmprise: nom, selectionId: 1, confirmId: 2, onSelectionner, onConfirmer: () => {}, onAnnuler: () => {} })); });
    const c1 = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('bâtiment en projet 1'))!;
    act(() => { c1.click(); });
    expect(onSelectionner).not.toHaveBeenCalled();
  });
});

describe('BasculeMode (BAT défaut B) — bascule ajuster ⇄ retouche, mode actif porté par le TEXTE + aria', () => {
  it('rend les deux modes ; l’actif est marqué « · actif » ET aria-pressed=true (jamais la couleur seule)', () => {
    const html = renderToStaticMarkup(createElement(BasculeMode, { mode: 'retoucher', onMode: () => {} }));
    expect(html).toContain('Ajuster');
    expect(html).toContain('Retoucher');
    expect(html).toContain('· actif');                 // marque écrite du mode actif
    expect(html).toContain('aria-pressed="true"');     // état exposé aux lecteurs d'écran
  });

  it('cliquer un mode INACTIF appelle onMode(ce mode)', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onMode = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(BasculeMode, { mode: 'ajuster', onMode })); });
    const retoucher = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Retoucher'))!;
    act(() => { retoucher.click(); });
    expect(onMode).toHaveBeenCalledWith('retoucher');
  });

  it('cliquer le mode DÉJÀ actif n’appelle rien (pas de bascule inutile)', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onMode = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(BasculeMode, { mode: 'ajuster', onMode })); });
    const ajuster = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Ajuster'))!;
    act(() => { ajuster.click(); });
    expect(onMode).not.toHaveBeenCalled();
  });

  it('disabled → aucun mode cliquable', () => {
    const container = document.createElement('div'); document.body.appendChild(container);
    const onMode = vi.fn();
    root = createRoot(container);
    act(() => { root!.render(createElement(BasculeMode, { mode: 'ajuster', onMode, disabled: true })); });
    Array.from(container.querySelectorAll('button')).forEach((b) => act(() => (b as HTMLButtonElement).click()));
    expect(onMode).not.toHaveBeenCalled();
  });
});

/**
 * Garde de source (BlocTraceEmprise non montable) — le CÂBLAGE de la sélection : la rangée est branchée dans le plein écran, la sélection
 * passe par un handler qui PROTÈGE un ajustement non enregistré (confirmation), et le sélectionné suit l'emprise en cours (single).
 */
// Chemin RELATIF AU CWD (racine du projet) — robuste en environnement jsdom, où `import.meta.url` n'est pas de schéma file:// (pattern déjà en place ailleurs).
const SRC = readFileSync('app/(admin)/admin/(protected)/permis/BlocTraceEmprise.tsx', 'utf8').replace(/\s+/g, ' ');
describe('BlocTraceEmprise — câblage rangée + bascule de mode (garde source)', () => {
  it('rangée + bascule de mode branchées ; sélection et confirmation ancrée suivent l’état courant', () => {
    expect(SRC).toContain('<CartouchesAjustables');
    expect(SRC).toContain('selectionId={selIdCourant}');                 // suit l'emprise courante (ajuster OU retouche)
    expect(SRC).toContain('onSelectionner={selectionnerAjustable}');
    expect(SRC).toContain('confirmId={demandeConfirm?.cibleId ?? null}'); // confirmation ancrée au cartouche visé (défaut D)
    expect(SRC).toContain('<BasculeMode mode={modeCourant} onMode={basculerMode}'); // bascule ajuster/retouche (défaut B)
  });
  it('la garde UNIQUE couvre polygone ET mode : demanderBascule via basculeRefusee + sessionModifiee, jamais d’abandon silencieux', () => {
    const bloc = SRC.match(new RegExp('const demanderBascule = useCallback\\(\\(cibleId: number, mode: ModeGeste\\) => \\{.*?\\}, \\['))?.[0] ?? '';
    expect(bloc).toContain('sessionModifiee');       // travail non enregistré (ajustement OU retouche)
    expect(bloc).toContain('basculeRefusee');        // décision « refusé ? » dans le module pur
    expect(bloc).toContain('setDemandeConfirm(');    // → confirmation ancrée au lieu de perdre
    expect(bloc).toContain('appliquerBascule(');     // sans travail en cours → bascule directe
    // selectionnerAjustable = changement de polygone (mode conservé) ; basculerMode = changement de mode (polygone conservé)
    expect(SRC).toContain('const selectionnerAjustable = useCallback((id: number) => demanderBascule(id,');
    expect(SRC).toContain('const basculerMode = useCallback((mode: ModeGeste) => { if (cibleParDefaut != null) demanderBascule(cibleParDefaut, mode);');
  });
  it('exclusivité des modes : appliquerBascule efface l’ajustement en retouche (jamais tiges + poignées de sommet ensemble)', () => {
    const bloc = SRC.match(new RegExp('const appliquerBascule = useCallback\\(\\(cibleId: number, mode: ModeGeste\\) => \\{.*?\\}, \\['))?.[0] ?? '';
    expect(bloc).toContain("mode === 'retoucher'");
    expect(bloc).toContain('setAjustement(null); demarrerRetouche(cibleId)'); // retouche efface l'ajustement
    expect(bloc).toContain('demarrerAjustement(cibleId)');                    // ajuster (demarrerAjustement efface déjà la retouche)
  });
  it('(défaut C) en plein écran, le bandeau parcelle (bandeauSel) est rendu APRÈS le schéma agrandi (boiteGrande) — sous le dessin', () => {
    const iSchema = SRC.indexOf('boite={boiteGrande}');
    expect(iSchema).toBeGreaterThan(-1);
    expect(iSchema).toBeLessThan(SRC.lastIndexOf('{bandeauSel}')); // le dernier {bandeauSel} = celui du plein écran, désormais SOUS le schéma
  });
  it('(défaut A + point 3) SOURCE UNIQUE : selIdCourant alimente le cerclé (selectionId) ; le surlignage du schéma est l’APERÇU transformé (apercuAjustement), plus la géométrie stockée (empriseSelectionneeId retiré)', () => {
    expect(SRC).toContain('const selIdCourant = empriseSelectionnee(ajustement, retouche)'); // une seule décision
    expect(SRC).toContain('selectionId={selIdCourant}');           // cartouche cerclé
    // point 3 : le surlignage NE dérive PLUS d’un id figeant la géométrie stockée (il divergeait de la cible dès un déplacement).
    expect(SRC).not.toContain('empriseSelectionneeId=');
    // Le surligné suivant le geste = l’aperçu d’ajustement, passé aux DEUX schémas (vue normale/XL + plein écran).
    expect((SRC.match(/apercuAjustement=\{apercuAjustement\}/g) ?? []).length).toBe(2);
  });
});
