// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ECHELLE_MIN, echelleTotaux, largeurDeuxRangees, PLANCHER_MONTANT_PX, TAILLE_MONTANT_PX } from './miseEnPageTotaux';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — LA CARTE D'APPORTEUR : la ligne de totaux, la ligne des conditions et les 4 boutons CENTRÉS (l'en-tête reste à
 * gauche) ; la ligne de totaux sur UNE ligne à 1200 px, quels que soient les montants (échelle de police commune, plancher 13 px), repliée
 * en deux rangées équilibrées seulement sur un écran étroit. Les largeurs de ROUSSEAU Frédéric (214 dossiers, 138 716,54 €) sont celles
 * MESURÉES dans Chrome (banc, base de dev lue en lecture seule) : jsdom ne mesure rien.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mesures Chrome, à l'échelle 1 (style final), largeur utile de la carte à 1200 px : 714 px, écart 9,6 px.
const ROUSSEAU_ECHELLE_1 = [86, 195, 213, 200];   // Dossiers 214 · Honoraires HT 138 716,54 € · Dû à l'apporteur HT 13 759,57 € · Net agence HT 124 956,97 €
const ECART_ECHELLE_1 = 0.6 * 16;
const besoin = (l: readonly number[], e: number) => l.reduce((s, x) => s + x, 0) + e * (l.length - 1);

describe('🔴 l’échelle commune de la ligne de totaux', () => {
  it('ROUSSEAU Frédéric à 1200 px : tient sur UNE ligne, au-dessus du plancher (13 px) — rien ne se replie', () => {
    const r = echelleTotaux([{ besoin: besoin(ROUSSEAU_ECHELLE_1, ECART_ECHELLE_1), dispo: 714 }]);
    expect(r.replie).toBe(false);
    expect(r.echelle * TAILLE_MONTANT_PX).toBeGreaterThanOrEqual(PLANCHER_MONTANT_PX);
    expect(besoin(ROUSSEAU_ECHELLE_1, ECART_ECHELLE_1) * r.echelle).toBeLessThanOrEqual(714);
  });
  it('la MÊME échelle pour toutes les cartes : celle qu’exige la plus longue ; jamais plus grande que 1', () => {
    const r = echelleTotaux([{ besoin: 400, dispo: 714 }, { besoin: besoin(ROUSSEAU_ECHELLE_1, ECART_ECHELLE_1), dispo: 714 }, { besoin: 300, dispo: 714 }]);
    expect(r.echelle).toBeCloseTo((714 / besoin(ROUSSEAU_ECHELLE_1, ECART_ECHELLE_1)) * 0.995, 6);
    expect(echelleTotaux([{ besoin: 300, dispo: 714 }]).echelle).toBe(1);
  });
  it('sous le plancher (écran étroit) : on garde 13 px et la ligne se replie', () => {
    expect(echelleTotaux([{ besoin: besoin(ROUSSEAU_ECHELLE_1, ECART_ECHELLE_1), dispo: 470 }])).toEqual({ echelle: ECHELLE_MIN, replie: true });
    expect(ECHELLE_MIN * TAILLE_MONTANT_PX).toBeCloseTo(13, 6);
  });
  it('le repli : DEUX rangées équilibrées, jamais trois (ROUSSEAU à 600 px : 2 + 2)', () => {
    const l = ROUSSEAU_ECHELLE_1.map((x) => x * ECHELLE_MIN); const e = ECART_ECHELLE_1 * ECHELLE_MIN;
    const w = largeurDeuxRangees(l, e);
    expect(w).toBe(Math.ceil(Math.max(l[0] + e + l[1], l[2] + e + l[3])));
    // Le retour à la ligne du navigateur avec cette largeur : exactement deux rangées.
    let rangees = 1; let c = 0;
    for (const x of l) { const avec = c === 0 ? x : c + e + x; if (avec <= w + 0.5) c = avec; else { rangees += 1; c = x; } }
    expect(rangees).toBe(2);
    // Cinq éléments (avec « Dû au collègue ») : deux rangées aussi.
    expect(largeurDeuxRangees([60, 150, 165, 158, 153], 7)).toBeLessThan(besoin([60, 150, 165, 158, 153], 7));
  });
});

// ── Le centrage (styles de la carte) ─────────────────────────────────────────────────────────────────────────────────────
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
const ROUSSEAU: Apporteur = { id: 1, nom: 'Frédéric Rousseau', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Rousseau', prenom: 'Frédéric',
  baremes: [{ depuis: '2020-01-01', taux: 0.1, mode: 'one_shot', tauxGestion: 0, ordre: 1 }], collegues: [{ depuis: '0001-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }], remunerations: [] };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: { 1: { nb: 214, ca: 138716.54, commission: 13759.57, collegue: 0 } } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true,
      negociateurs: [], regles: [], retrocessions: [], collegues: [{ id: 2, libelle: 'Arnaud Jorel' }], apporteurs: [ROUSSEAU] } });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };

describe('🔴 les trois lignes centrées ; l’en-tête à gauche', () => {
  it('totaux, conditions et boutons : centrés ; totaux sans retour à la ligne (sauf repli), police à l’échelle commune ; en-tête inchangé', async () => {
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
    await calmer();
    await act(async () => { container.querySelector<HTMLElement>('[data-onglet="apporteurs"]')!.click(); });
    await calmer();
    expect(container.querySelector('[data-net-agence="1"] dd')?.textContent?.replace(/[  ]/g, ' ')).toBe('124 956,97 €');
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('').replace(/\s+/g, '');
    expect(css).toMatch(/\.plo-totaux-ligne\{display:flex;flex-wrap:nowrap;justify-content:center;[^}]*font-size:calc\(1rem\*var\(--plo-echelle-totaux\)\)\}/);
    expect(css).toMatch(/\.plo-versions\[data-liste-apporteurs\]\{gap:24px;--plo-echelle-totaux:1\}/);
    expect(css).toMatch(/\.plo-totaux-ligne\[data-replie\]\{flex-wrap:wrap\}/);
    expect(css).toMatch(/\.plo-totaux-lignediv\{[^}]*white-space:nowrap;flex-shrink:0\}/);
    expect(css).toMatch(/\.plo-conditions-ligne\{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;/);
    expect(css).toMatch(/\.plo-boutons-carte\{display:flex;flex-wrap:wrap;gap:8px;[^}]*justify-content:center\}/);
    // L'en-tête (nom + badges) : aucune règle de centrage.
    expect(css).not.toMatch(/\.plo-version-titre\{[^}]*justify-content:center/);
    // La liste porte l'échelle commune (jsdom ne mesure rien : 1).
    expect(container.querySelector<HTMLElement>('[data-liste-apporteurs]')?.dataset.echelleTotaux).toBe('1');
  });
});
