// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (22/10/2026, migration 406) — la roue « Paramètres Location », onglets « Apporteurs » et « Commissions » : le
 * référentiel et ses taux DATÉS (une nouvelle version, jamais une correction en arrière), la règle du négociateur, les
 * rétrocessions (annulées, jamais supprimées). Les vrais composants, route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let suivi: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  suivi = { disponible: true, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }],
    apporteurs: [{ id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }, { depuis: '2026-06-01', taux: 0.12, coutFixeMensuel: 50 }] }],
    regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }],
    retrocessions: [{ id: 8, negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-08-01', montant: 200, libelle: 'Alex Coms' }] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push({ ...JSON.parse(String(init.body)) as Record<string, unknown>, url: String(url) }); return json({ etat: 'ok' }); }
    if (String(url).includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { parAnnee: [{ annee: 2026, nb: 5, ca: 3941.03, commission: 394.1 }], parMois: [{ mois: '2026-09', nb: 5, ca: 3941.03, commission: 394.1 }] } });
    if (String(url).includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-22', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ouvrir = async (onglet: string) => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector(`[data-onglet="${onglet}"]`)!);
};

describe('🔴 Paramètres Location — Apporteurs et Commissions', () => {
  it('les cinq onglets ; les trois d’avant sont toujours là', async () => {
    await ouvrir('apporteurs');
    expect([...container.querySelectorAll('[data-onglet]')].map((b) => b.textContent))
      .toEqual(['Destinataires du mail', 'Barèmes d’honoraires', 'Archivage des fins de gestion', 'Apporteurs', 'Commissions']);
  });

  it('Apporteurs : le taux EN VIGUEUR aujourd’hui et l’historique ; « Nouveau taux » crée une version datée', async () => {
    await ouvrir('apporteurs');
    const ligne = container.querySelector('[data-apporteur="3"]')!;
    expect(ligne.textContent).toContain('Taux 12 % · coût fixe 50,00 € / mois (depuis le 01/06/2026)');
    expect(ligne.textContent).toContain('Historique : 01/01/2026 → 10 %');
    await clic(ligne.querySelector('[data-nouveau-taux="3"]')!);
    const champs = ligne.querySelectorAll('[data-nouvelle-version] input');
    await saisir(champs[0] as HTMLInputElement, '15');
    await saisir(champs[2] as HTMLInputElement, '2026-11-01');
    await clic(ligne.querySelector('[data-enregistrer-version]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'bareme-apporteur', apporteurId: 3, bareme: { taux: '15', coutFixe: '50', depuis: '2026-11-01' } });
  });

  it('Apporteurs : « + Ajouter l’apporteur »', async () => {
    await ouvrir('apporteurs');
    await saisir(container.querySelector('[data-nom-apporteur]') as HTMLInputElement, 'Leboncoin');
    await saisir(container.querySelector('[data-taux-apporteur]') as HTMLInputElement, '0');
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'creer-apporteur', apporteur: { nom: 'Leboncoin', type: 'partenaire', taux: '0' } });
  });

  it('Commissions : la règle en vigueur ; une rétrocession s’ajoute, et s’ANNULE (jamais supprimée)', async () => {
    await ouvrir('commissions');
    expect(container.querySelector('[data-regle="2026-01-01"]')?.textContent).toContain('Taux 15 % · prime logement 150,00 € · prime parking 15,00 €');
    expect(container.querySelector('[data-retrocession="8"]')?.textContent).toContain('Alex Coms — 200,00 €');
    await clic(container.querySelector('[data-annuler-retrocession="8"]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'annuler-retrocession', id: 8 });
    expect(container.querySelector('[data-enregistrer-parametres]')).toBeNull();   // chaque ligne a son bouton
    await clic(container.querySelector('[data-onglet="baremes"]')!);
    expect(container.querySelector('[data-enregistrer-parametres]')).not.toBeNull();   // les autres onglets gardent le leur
  });

  it('sans la migration 406 : le dit, rien à saisir', async () => {
    suivi = { disponible: false };
    await ouvrir('commissions');
    expect(container.querySelector('[data-suivi-sans-migration]')?.textContent).toContain('migration 406');
    expect(container.querySelector('[data-ajouter-retrocession]')).toBeNull();
  });
});

describe('🔴 407 — l’annuaire des apporteurs', () => {
  const avec407 = () => {
    suivi = { ...suivi, annuaire: true, collegues: [{ id: 2, libelle: 'Arnaud Jorel' }, { id: 5, libelle: 'Jean-Baptiste PONS' }],
      apporteurs: [
        { id: 3, nom: 'Kin Immo', type: 'agence', archive: false, societe: 'Kin SAS', telephone: '01 02 03 04 05', email: 'kin@exemple.test', baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }],
          collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] },
        { id: 4, nom: 'Apporteur Repris', type: 'partenaire', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }], collegues: [] },
      ] };
  };
  it('un apporteur sans collègue s’affiche en orange « à rattacher » ; le rattaché montre son collègue', async () => {
    avec407();
    await ouvrir('apporteurs');
    expect(container.querySelector('[data-apporteur="4"]')?.className).toContain('plo-a-rattacher');
    expect(container.querySelector('[data-apporteur="4"] [data-a-rattacher]')?.textContent).toBe('à rattacher');
    expect(container.querySelector('[data-apporteur="3"] [data-collegue-apporteur]')?.textContent).toBe('Arnaud Jorel');
    expect(container.querySelector('[data-alerte-a-rattacher]')?.textContent).toContain('1 apporteur(s) « à rattacher »');
  });
  it('la fiche : coordonnées, rattachement (« depuis toujours » proposé d’office au 1er), cumul par an et par mois', async () => {
    avec407();
    await ouvrir('apporteurs');
    await clic(container.querySelector('[data-ouvrir-fiche="4"]')!);
    const f = container.querySelector('[data-fiche-apporteur="4"]')!;
    await clic(f.querySelector('[data-rattacher-collegue]')!);
    await clic(container.querySelector('[data-liste-choix] [data-option="5"]')!);
    expect((f.querySelector('[data-rattacher-toujours]') as HTMLInputElement).checked).toBe(true);
    expect((f.querySelector('[data-rattacher-depuis]') as HTMLInputElement).disabled).toBe(true);
    expect((f.querySelector('[data-rattacher-depuis]') as HTMLInputElement).value).toBe('');
    await clic(f.querySelector('[data-rattacher]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'rattacher-apporteur', apporteurId: 4, rattachement: { collegueId: 5, depuisToujours: true } });
    expect((posts.at(-1)!.rattachement as Record<string, unknown>).depuis).toBeUndefined();
    // Décochée : une date d'effet (un rattachement daté, qui prend le relais à sa date).
    await clic(f.querySelector('[data-rattacher-toujours]')!);
    await saisir(f.querySelector('[data-rattacher-depuis]') as HTMLInputElement, '2026-11-01');
    await clic(f.querySelector('[data-rattacher]')!);
    expect(posts.at(-1)).toMatchObject({ rattachement: { collegueId: 5, depuis: '2026-11-01' } });
    await saisir(f.querySelector('[data-fiche-societe]') as HTMLInputElement, 'Repris SARL');
    await clic(f.querySelector('[data-enregistrer-fiche]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'modifier-apporteur', apporteurId: 4, fiche: { societe: 'Repris SARL' } });
    expect(container.querySelector('[data-cumul-apporteur]')?.textContent?.replace(/[\u202f\u00a0]/g, ' ')).toContain('Année 202653 941,03 €394,10 €septembre 202653 941,03 €394,10 €');
  });
  it('🔴 Arno (23/10/2026) : la fiche, le nouveau taux et la nouvelle règle se ferment quand on veut (bouton ou Échap), sans rien écrire', async () => {
    avec407();
    const fermee = vi.fn();
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: fermee })); });
    await calmer();
    await clic(container.querySelector('[data-onglet="apporteurs"]')!);
    const echap = async (el: Element) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }); };
    // La fiche : saisie abandonnée par « Fermer la fiche » ; rouverte, elle revient aux valeurs en base.
    await clic(container.querySelector('[data-ouvrir-fiche="3"]')!);
    await saisir(container.querySelector('[data-fiche-societe]') as HTMLInputElement, 'Autre SAS');
    await clic(container.querySelector('[data-fermer-fiche="3"]')!);
    expect(container.querySelector('[data-fiche-apporteur]')).toBeNull();
    await clic(container.querySelector('[data-ouvrir-fiche="3"]')!);
    expect((container.querySelector('[data-fiche-societe]') as HTMLInputElement).value).toBe('Kin SAS');
    // Échap dans la fiche : la fiche se ferme, pas la roue.
    await echap(container.querySelector('[data-fiche-societe]')!);
    expect(container.querySelector('[data-fiche-apporteur]')).toBeNull();
    expect(fermee).not.toHaveBeenCalled();
    // Le nouveau taux : Annuler, puis Échap.
    await clic(container.querySelector('[data-nouveau-taux="3"]')!);
    await clic(container.querySelector('[data-annuler-version]')!);
    expect(container.querySelector('[data-nouvelle-version]')).toBeNull();
    await clic(container.querySelector('[data-nouveau-taux="3"]')!);
    await echap(container.querySelector('[data-nouvelle-version] input')!);
    expect(container.querySelector('[data-nouvelle-version]')).toBeNull();
    // La nouvelle règle : Échap.
    await clic(container.querySelector('[data-onglet="commissions"]')!);
    await clic(container.querySelector('[data-nouvelle-regle]')!);
    await echap(container.querySelector('[data-saisie-regle] input')!);
    expect(container.querySelector('[data-saisie-regle]')).toBeNull();
    expect(fermee).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });
  it('🔴 Arno (23/10/2026) : « À rattacher (N) » en tête de liste ne montre que les apporteurs sans collègue', async () => {
    avec407();
    await ouvrir('apporteurs');
    const filtre = container.querySelector('[data-filtre-a-rattacher]') as HTMLButtonElement;
    expect(filtre.textContent).toBe('À rattacher (1)');
    expect(container.querySelectorAll('[data-apporteur]')).toHaveLength(2);
    await clic(filtre);
    expect([...container.querySelectorAll('[data-apporteur]')].map((x) => x.getAttribute('data-apporteur'))).toEqual(['4']);
    expect(filtre.getAttribute('aria-pressed')).toBe('true');
    await clic(filtre);
    expect(container.querySelectorAll('[data-apporteur]')).toHaveLength(2);
  });
  it('la modale s’ouvre directement sur un onglet choisi', async () => {
    avec407();
    await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {}, ongletInitial: 'apporteurs' })); });
    await calmer();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-onglet')).toBe('apporteurs');
  });
  it('un nouvel apporteur part avec son collègue de rattachement', async () => {
    avec407();
    await ouvrir('apporteurs');
    await saisir(container.querySelector('[data-nom-apporteur]') as HTMLInputElement, 'Nouveau');
    await clic(container.querySelector('[data-collegue-apporteur-nouveau]')!);
    await clic(container.querySelector('[data-liste-choix] [data-option="2"]')!);
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'creer-apporteur', apporteur: { nom: 'Nouveau', collegueId: 2 } });
  });
});
