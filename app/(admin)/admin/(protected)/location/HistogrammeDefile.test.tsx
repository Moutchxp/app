// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Histogramme, histogrammeDefile, PAS_ANNEE_FIXE } from './TableauBordSuivi';

/**
 * 🔴 Arno (23/10/2026) — « Année par année » défile horizontalement quand les années ne tiennent plus : largeur d'année FIXE (celle
 * d'aujourd'hui, 8 années), rien ne change tant que tout tient ; position initiale sur l'année choisie ; flèches ‹ › désactivées en
 * bout de course ; axe des montants fixe à gauche ; le détail reste hors de la zone qui défile.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
/** La piste « mesurée » : jsdom ne calcule pas de mise en page, on lui donne ses dimensions (largeur visible 600, contenu au prorata). */
let position = 0;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); position = 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return (this as HTMLElement).hasAttribute('data-histo-piste') ? 600 : 0; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get() {
    const el = this as HTMLElement;
    if (!el.hasAttribute('data-histo-piste')) return 0;
    return Math.round(600 * Number.parseFloat((el.firstElementChild as HTMLElement).style.width) / 100);
  } });
  Object.defineProperty(HTMLElement.prototype, 'scrollLeft', { configurable: true, get() { return (this as HTMLElement).hasAttribute('data-histo-piste') ? position : 0; },
    set(v: number) { if ((this as HTMLElement).hasAttribute('data-histo-piste')) position = v; } });
  (HTMLElement.prototype as unknown as { scrollTo: (o: { left: number }) => void }).scrollTo = function scrollTo(o) { (this as HTMLElement).scrollLeft = o.left; };
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const annees = (n: number) => Array.from({ length: n }, (_, i) => 2012 + i);
const barres = (n: number) => annees(n).map((a) => ({ cle: a, libelle: String(a), valeur: 1000 + a, info: { titre: `Année ${a}`, courant: { libelle: String(a), ca: 1000 + a, nb: 3 }, precedent: null } }));
const rendre = async (n: number, courante: number, onChoisir = vi.fn()) => {
  await act(async () => { root.render(createElement(Histogramme, { barres: barres(n), courante, onChoisir, attribut: 'data-barre-annee', aria: 'CA HT par année', pasFixe: PAS_ANNEE_FIXE })); });
  await act(async () => { await Promise.resolve(); });
};
const q = (s: string) => container.querySelector(s) as HTMLElement | null;

describe('🔴 « Année par année » : 8 années tiennent, 15 défilent', () => {
  it('8 années (aujourd’hui) : aucun défilement — le dessin d’aujourd’hui, inchangé', async () => {
    expect(histogrammeDefile(8, PAS_ANNEE_FIXE)).toBe(false);
    await rendre(8, 2019);
    expect(q('[data-histo-defile]')).toBeNull();
    expect(q('[data-histo-piste]')).toBeNull();
    expect(container.querySelectorAll('[data-barre-annee]')).toHaveLength(8);
  });

  it('15 années : défilement actif ; la largeur d’une année reste celle d’aujourd’hui (jamais écrasée)', async () => {
    expect(histogrammeDefile(9, PAS_ANNEE_FIXE)).toBe(true);
    await rendre(15, 2026);
    expect(q('[data-histo-defile]')).not.toBeNull();
    // La zone qui défile fait 15 années de large à l'échelle d'aujourd'hui : 15 × pas + marge, rapportés aux 8 années.
    expect(Number.parseFloat(q('[data-histo-piste] .tdb-histo-zone')!.style.width)).toBeCloseTo(((15 * PAS_ANNEE_FIXE + 12) / (640 - 56)) * 100, 6);
    expect(container.querySelectorAll('[data-histo-piste] [data-barre-annee]')).toHaveLength(15);
  });

  it('à l’ouverture : posé sur l’année choisie (l’année en cours, donc à droite) ; flèches désactivées en bout de course', async () => {
    await rendre(15, 2026);
    const max = q('[data-histo-piste]')!.scrollWidth - 600;
    expect(position).toBe(max);   // tout à droite
    expect((q('[data-histo-fleche="d"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-histo-fleche="g"]') as HTMLButtonElement).disabled).toBe(false);
    // ‹ fait défiler vers la gauche ; tout à gauche, ‹ se désactive et › se réactive.
    await act(async () => { q('[data-histo-fleche="g"]')!.click(); });
    expect(position).toBeLessThan(max);
    await act(async () => { q('[data-histo-piste]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    for (let i = 0; i < 20; i++) await act(async () => { q('[data-histo-fleche="g"]')?.click(); });
    expect(position).toBe(0);
    expect((q('[data-histo-fleche="g"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-histo-fleche="d"]') as HTMLButtonElement).disabled).toBe(false);
    // Le clavier (le graphique a le focus) : → avance d'une année.
    await act(async () => { q('[data-histo-piste]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(position).toBeGreaterThan(0);
  });

  it('choisir une autre année (filtre, tableau) fait défiler jusqu’à elle ; l’année la plus ancienne : tout à gauche', async () => {
    await rendre(15, 2026);
    await rendre(15, 2012);
    expect(position).toBe(0);
    await rendre(15, 2019);
    expect(position).toBeGreaterThan(0);
    expect(position).toBeLessThan(q('[data-histo-piste]')!.scrollWidth - 600);
  });

  it('l’axe des montants est FIXE, à gauche, hors de la zone qui défile ; le détail aussi', async () => {
    await rendre(15, 2026);
    const axe = q('[data-histo-axe]')!;
    expect(axe.closest('[data-histo-piste]')).toBeNull();
    expect(axe.querySelectorAll('text').length).toBe(5);
    expect(q('[data-histo-detail]')!.closest('[data-histo-piste]')).toBeNull();
    expect(q('[data-histo-detail] .tdb-bulle-titre')?.textContent).toBe('Année 2026');
    // L'échelle est calculée sur TOUTES les années : la plus haute graduation est le maximum de toutes.
    expect(axe.querySelectorAll('text')[4].textContent?.replace(/\s/g, '')).toBe(`${(1000 + 2026).toLocaleString('fr-FR').replace(/\s/g, '')}€`);
  });

  it('le Suivi annuel passe la largeur fixe à « Année par année » (et pas au mois par mois)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/TableauBordSuivi.tsx', 'utf8');
    expect(src).toContain('onChoisir={onAnnee} pasFixe={PAS_ANNEE_FIXE}');
    expect(src.match(/pasFixe=\{PAS_ANNEE_FIXE\}/g)).toHaveLength(1);
  });
});
