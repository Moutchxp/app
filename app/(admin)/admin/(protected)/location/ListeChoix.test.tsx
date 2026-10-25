// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HAUTEUR_MAX_MENU_PX, ListeChoix, placementMenu, type OptionChoix } from './ListeChoix';

/**
 * 🔴 Arno (23/10/2026) — la liste de choix d'un collègue : sous le champ, rouge (pas de bleu), coche sur le choix, clavier
 * (flèches, Entrée, Échap), recherche par frappe, rôles ARIA ; un compte désactivé seulement s'il est le choix en cours.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const OPTIONS: OptionChoix[] = [{ id: 7, libelle: 'Alice Martin' }, { id: 4, libelle: 'Bruno Petit' }, { id: 9, libelle: 'Bertrand Roy' }, { id: 3, libelle: 'Ancien Compte', actif: false }];
let container: HTMLDivElement;
let root: Root;
let choisi: string[];
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); choisi = []; });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

function Banc({ depart }: { depart: string }) {
  const [v, setV] = useState(depart);
  return createElement('label', null, 'Collègue', createElement(ListeChoix, { options: OPTIONS, valeur: v, onChange: (x: string) => { choisi.push(x); setV(x); }, libelle: 'Collègue', donnees: { 'data-champ': '' } }));
}
const monter = async (depart = '') => { await act(async () => { root.render(createElement(Banc, { depart })); }); };
const champ = () => container.querySelector('[data-champ]') as HTMLButtonElement;
const touche = async (key: string) => { await act(async () => { champ().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); };
const options = () => [...container.querySelectorAll('[role="option"]')].map((o) => ({ textContent: o.querySelector('span:last-child')?.textContent }));

describe('🔴 ListeChoix', () => {
  it('rôles ARIA ; s’ouvre au clic ; les comptes désactivés n’y sont pas ; un clic choisit et referme', async () => {
    await monter();
    expect(champ().getAttribute('role')).toBe('combobox');
    expect(champ().getAttribute('aria-expanded')).toBe('false');
    await act(async () => { champ().click(); });
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(options().map((o) => o.textContent)).toEqual(['— choisir —', 'Alice Martin', 'Bruno Petit', 'Bertrand Roy']);
    await act(async () => { (container.querySelector('[data-option="4"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(choisi).toEqual(['4']);
    expect(container.querySelector('[role="listbox"]')).toBeNull();   // l'activation du <label> ne la rouvre pas
    expect(champ().textContent).toBe('Bruno Petit');
    await act(async () => { champ().click(); });
    const sel = container.querySelector('[aria-selected="true"]')!;
    expect(sel.getAttribute('data-option')).toBe('4');
    expect(sel.className).toContain('lch-option--choisi');
    expect(sel.querySelector('.lch-coche')?.textContent).toBe('✓');
    // Arno (23/10/2026) : le surlignage est VERT — celui de l'entrée active du menu (vert pâle / vert foncé) ; le contour reste rouge.
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('.lch-liste>.lch-option--actif{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}');
    expect(css).toContain('.lch-liste>.lch-option--choisi{font-weight:700;color:var(--color-svv-green-ink)}');
    expect(css).toContain('.lch-coche{width:16px;flex:0 0 16px;color:var(--color-svv-green-ink)');
    expect(css).toContain('.lch-champ[aria-expanded="true"]{outline:2px solid var(--color-svv-red)');
    // Arno (24/10/2026) — le rouge n'existe que sous la teinte « rouge » (bloc « Suivi commercial ») ; par défaut, la liste n'en a pas.
    expect(css.split('\n').filter((l) => /red-soft|red-dark/.test(l)).every((l) => l.startsWith('.lch--rouge '))).toBe(true);
    expect(container.querySelector('.lch')?.className).toBe('lch');
  });

  it('clavier : flèches, Entrée, Échap (ne ferme que la liste) ; recherche par frappe', async () => {
    await monter();
    let echapPasse = false;
    const ecoute = (e: KeyboardEvent): void => { if (e.key === 'Escape') echapPasse = true; };
    window.addEventListener('keydown', ecoute);
    await touche('ArrowDown');                      // ouvre, sur « — choisir — »
    expect(champ().getAttribute('aria-expanded')).toBe('true');
    await touche('ArrowDown'); await touche('ArrowDown');
    expect(container.querySelector('.lch-option--actif')?.textContent).toContain('Bruno Petit');
    await touche('Enter');
    expect(choisi).toEqual(['4']);
    await touche('ArrowDown');
    await touche('Escape');
    expect(champ().getAttribute('aria-expanded')).toBe('false');
    expect(echapPasse).toBe(false);                 // la fenêtre autour ne se ferme pas
    await touche('b'); await touche('e');            // « be… » → Bertrand Roy
    expect(container.querySelector('.lch-option--actif')?.textContent).toContain('Bertrand Roy');
    await touche('Enter');
    expect(choisi.at(-1)).toBe('9');
    window.removeEventListener('keydown', ecoute);
  });

  it('un compte désactivé déjà choisi : montré « (compte désactivé) », jamais choisissable', async () => {
    await monter('3');
    expect(champ().textContent).toBe('Ancien Compte (compte désactivé)');
    await act(async () => { champ().click(); });
    const d = container.querySelector('[data-option="3"]')!;
    expect(d.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { d.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(choisi).toEqual([]);
  });
});

describe('🔴 Arno (25/10/2026) — le menu en SURIMPRESSION, placé intelligemment', () => {
  const posee = (r: { top: number; bottom: number; left: number; width: number }) => {
    champ().getBoundingClientRect = () => ({ ...r, right: r.left + r.width, height: r.bottom - r.top, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect;
  };
  it('position FIXE (aucun décalage de la page) ; sous le champ quand il y a la place ; de la largeur du champ', async () => {
    await monter();
    posee({ top: 100, bottom: 144, left: 40, width: 300 });
    const hauteurAvant = document.documentElement.scrollHeight;
    await act(async () => { champ().click(); });
    const ul = container.querySelector('[data-liste-choix]') as HTMLElement;
    expect([ul.style.position, ul.dataset.sens, ul.style.top, ul.style.left, ul.style.width]).toEqual(['fixed', 'bas', '148px', '40px', '300px']);
    expect(document.documentElement.scrollHeight).toBe(hauteurAvant);
  });
  it('en BAS d’écran : il s’ouvre AU-DESSUS du champ (bottom fixé), hauteur bornée, défilement interne', async () => {
    await monter();
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    posee({ top: 700, bottom: 744, left: 40, width: 300 });
    await act(async () => { champ().click(); });
    const ul = container.querySelector('[data-liste-choix]') as HTMLElement;
    expect([ul.dataset.sens, ul.style.top, ul.style.bottom]).toEqual(['haut', 'auto', '72px']);   // 768 − 700 + 4
    expect(Number.parseFloat(ul.style.maxHeight)).toBeLessThanOrEqual(HAUTEUR_MAX_MENU_PX);
  });
  it('il suit le champ au défilement ; fermé au clic extérieur et à Échap', async () => {
    await monter();
    posee({ top: 100, bottom: 144, left: 40, width: 300 });
    await act(async () => { champ().click(); });
    posee({ top: 60, bottom: 104, left: 40, width: 300 });
    await act(async () => { window.dispatchEvent(new Event('scroll')); });
    expect((container.querySelector('[data-liste-choix]') as HTMLElement).style.top).toBe('108px');
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(container.querySelector('[data-liste-choix]')).toBeNull();
    await act(async () => { champ().click(); });
    await touche('Escape');
    expect(container.querySelector('[data-liste-choix]')).toBeNull();
  });
  it('la règle pure : ~6 options + 24 px sous le champ, sinon au-dessus ; jamais à moins de 16 px d’un bord', () => {
    const ecran = { largeur: 600, hauteur: 800 };
    // 6 options = 274 px : sous un champ dont le bas est à 500 px, il reste 800 − 500 − 4 − 24 = 272 px → au-dessus.
    expect(placementMenu({ top: 456, bottom: 500, left: 20, width: 200 }, ecran, 8).sens).toBe('haut');
    expect(placementMenu({ top: 454, bottom: 498, left: 20, width: 200 }, ecran, 8).sens).toBe('bas');
    // Peu d'options : il tient dessous.
    expect(placementMenu({ top: 600, bottom: 644, left: 20, width: 200 }, ecran, 2).sens).toBe('bas');
    // Les bords : 16 px au moins.
    expect(placementMenu({ top: 10, bottom: 54, left: 2, width: 200 }, ecran, 3).left).toBe(16);
    expect(placementMenu({ top: 10, bottom: 54, left: 500, width: 200 }, ecran, 3).left).toBe(384);
    expect(placementMenu({ top: 10, bottom: 54, left: 0, width: 900 }, ecran, 3).width).toBe(568);
  });
});

describe('🔴 Arno (25/10/2026) — le mode RECHERCHE (apporteur d’affaires)', () => {
  const APPORTEURS: OptionChoix[] = [
    { id: 1, libelle: 'DUPONT Jean (Collègue)', groupe: 'Internes', recherche: 'Jean Dupont ; 01 40 00 00 01' },
    { id: 2, libelle: 'BEKETOV Hélène (Partenaire externe)', groupe: 'Partenaires externes', recherche: 'Hélène Beketov ; Immo Écluse ; 06 12 34 56 78 ; h.beketov@exemple.test' },
    { id: 3, libelle: 'Kin Immo (Agence)', groupe: 'Partenaires externes', recherche: 'Kin Immo ; 06 98 76 54 32' },
    { id: 4, libelle: 'ROY Bertrand (Partenaire externe)', groupe: 'Partenaires externes', bloque: true, mention: ' — à rattacher', recherche: 'Bertrand Roy' },
    { id: '+', libelle: '+ Nouvel apporteur…' },
  ];
  let crees: string[];
  let annuaires: number[];
  function BancR() {
    const [v, setV] = useState('');
    return createElement(ListeChoix, { options: APPORTEURS, valeur: v, onChange: (x: string) => { choisi.push(x); setV(x); }, libelle: 'Apporteur', donnees: { 'data-champ': '' },
      recherche: { placeholder: 'Chercher un apporteur : nom…', onCreer: (t: string) => crees.push(t), onAnnuaire: () => { annuaires.push(1); } } });
  }
  const ouvrirR = async () => { crees = []; annuaires = []; await act(async () => { root.render(createElement(BancR)); }); await act(async () => { champ().click(); }); };
  const champR = () => container.querySelector('[data-recherche-liste]') as HTMLInputElement;
  const taperR = async (v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champR(), v); champR().dispatchEvent(new Event('input', { bubbles: true })); }); };
  const toucheR = async (key: string) => { await act(async () => { champR().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); };
  const ids = () => [...container.querySelectorAll('[data-liste-choix] [role="option"]')].map((o) => o.getAttribute('data-option'));

  it('ouvert : le champ de recherche a le focus ; toute la liste, groupes gardés', async () => {
    await ouvrirR();
    expect(document.activeElement).toBe(champR());
    expect(ids()).toEqual(['', '1', '2', '3', '4', '+']);
    expect([...container.querySelectorAll('[data-groupe-choix]')].map((g) => g.textContent)).toEqual(['Internes', 'Partenaires externes']);
  });
  it('filtre à la frappe : accents et casse ignorés, tous les mots, téléphone ; terme surligné ; « + Créer « texte » »', async () => {
    await ouvrirR();
    await taperR('HELENE');
    expect(ids()).toEqual(['2', '+']);
    expect(container.querySelector('[data-option="2"] mark')?.textContent).toBe('Hélène');
    expect(container.querySelector('[data-option="+"]')?.textContent).toContain('+ Créer « HELENE »');
    await taperR('immo 06 98');
    expect(ids()).toEqual(['3', '+']);
    await taperR('0612');
    expect(ids()).toEqual(['2', '+']);
    // Les meilleurs d'abord : « immo » commence le libellé de Kin Immo ? non — mot du libellé (3) ; dans la société de Beketov (1).
    await taperR('immo');
    expect(ids()).toEqual(['3', '2', '+']);
  });
  it('« à rattacher » reste montré, non choisissable ; clavier ↑ ↓ Entrée ; Échap ferme', async () => {
    await ouvrirR();
    await taperR('roy');
    expect(container.querySelector('[data-option="4"]')?.getAttribute('aria-disabled')).toBe('true');
    // Un choix bloqué n'est jamais pris, même par Entrée.
    await toucheR('Enter');
    expect(choisi).toEqual([]);
    await act(async () => { champ().click(); });
    await taperR('ke');
    expect(ids()).toEqual(['2', '+']);
    await toucheR('ArrowDown');
    expect(container.querySelector('.lch-option--actif')?.getAttribute('data-option')).toBe('+');
    await toucheR('ArrowUp');
    await toucheR('Enter');
    expect(choisi).toEqual(['2']);
    await act(async () => { champ().click(); });
    await taperR('kin');
    await toucheR('Enter');
    expect(choisi.at(-1)).toBe('3');
    expect(container.querySelector('[data-liste-choix]')).toBeNull();
    await act(async () => { champ().click(); });
    await toucheR('Escape');
    expect(container.querySelector('[data-liste-choix]')).toBeNull();
  });
  it('« Aucun résultat » : « + Créer « texte » » (création rapide pré-remplie) et « Ouvrir l’annuaire »', async () => {
    await ouvrirR();
    await taperR('Zorglub');
    expect(ids()).toEqual([]);
    expect(container.querySelector('[data-aucun-resultat] p')?.textContent).toBe('Aucun résultat pour « Zorglub ».');
    await act(async () => { (container.querySelector('[data-creer-depuis-recherche]') as HTMLButtonElement).click(); });
    expect(crees).toEqual(['Zorglub']);
    await act(async () => { champ().click(); });
    await taperR('Zorglub');
    await act(async () => { (container.querySelector('[data-annuaire-depuis-recherche]') as HTMLButtonElement).click(); });
    expect(annuaires).toHaveLength(1);
  });
});
