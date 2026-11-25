// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { ArreteComptes, MOT_ARRETE_MANQUANT } from './ArreteComptes';

/** 🔴 Arno (23/11/2026, 512) — « Date d'arrêté des comptes » : le composant unique (fiche Copropriété et fenêtre de la sortie), route simulée. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
let posts: Record<string, unknown>[];
let lu: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  lu = { arrete: null, par: null, le: null, disponible: true };
  global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c);
      return { json: async () => ({ etat: 'ok', data: { arrete: { jour: Number(c.jour), mois: Number(c.mois) }, par: 'arno@exemple.fr', le: '2026-11-23T09:00:00.000Z' } }) } as Response;
    }
    return { json: async () => ({ etat: 'ok', data: lu }) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const rendre = async () => { await act(async () => { root.render(createElement(ArreteComptes, { coproprieteId: 7 })); }); await calmer(); };
const clic = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const choisir = async (sel: string, v: string) => {
  const el = container.querySelector(sel) as HTMLSelectElement;
  await act(async () => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); });
};

describe('« Date d’arrêté des comptes » (composant unique)', () => {
  it('non renseignée : on le dit ; « Renseigner » ; jour + mois → UNE requête au serveur ; la date s’affiche', async () => {
    await rendre();
    expect(container.querySelector('[data-arrete-comptes]')?.getAttribute('data-arrete-comptes')).toBe('vide');
    expect(container.textContent).toContain('Date d’arrêté des comptes : non renseignée');
    await clic('[data-arrete-modifier]');
    await choisir('[data-arrete-mois]', '12');
    await choisir('[data-arrete-jour]', '31');
    await clic('[data-arrete-enregistrer]');
    expect(posts).toEqual([{ action: 'arrete-comptes', coproprieteId: 7, jour: '31', mois: '12' }]);
    expect(container.querySelector('[data-arrete-valeur]')?.textContent).toBe('31 DÉCEMBRE'); // 🔴 (23h13) en toutes lettres à l'écran
    expect(container.querySelector('[data-arrete-enregistree]')).not.toBeNull();
  });
  it('saisie incomplète : le message après la tentative, rien n’est envoyé ; « Annuler » referme', async () => {
    await rendre();
    await clic('[data-arrete-modifier]');
    expect(container.querySelector('[data-arrete-message]')).toBeNull();
    await choisir('[data-arrete-mois]', '6');
    await clic('[data-arrete-enregistrer]');
    expect(container.querySelector('[data-arrete-message]')?.textContent).toBe('Choisissez le jour ET le mois de l’arrêté des comptes.');
    expect(posts).toEqual([]);
    await clic('[data-arrete-annuler]');
    expect(container.querySelector('[data-arrete-formulaire]')).toBeNull();
  });
  it('renseignée : la date, qui l’a saisie ; « Modifier » prérempli ; juin n’offre que 30 jours', async () => {
    lu = { arrete: { jour: 30, mois: 6 }, par: 'arno@exemple.fr', le: '2026-11-20T09:00:00.000Z', disponible: true };
    await rendre();
    expect(container.querySelector('[data-arrete-valeur]')?.textContent).toBe('30 JUIN'); // 🔴 (23h13) en toutes lettres à l'écran
    await clic('[data-arrete-modifier]');
    expect((container.querySelector('[data-arrete-jour]') as HTMLSelectElement).value).toBe('30');
    expect((container.querySelector('[data-arrete-mois]') as HTMLSelectElement).value).toBe('6');
    expect(container.querySelectorAll('[data-arrete-jour] option')).toHaveLength(31); // « — » + 30 jours
  });
  it('sans la migration 512 : on le dit, rien ne se saisit', async () => {
    lu = { arrete: null, par: null, le: null, disponible: false };
    await rendre();
    expect(container.querySelector('[data-arrete-comptes="sans-schema"]')?.textContent).toContain('migration 512');
    expect(container.querySelector('[data-arrete-modifier]')).toBeNull();
  });
  it('le MÊME composant dans la fiche Copropriété (bloc « AG ») et dans la fenêtre de la sortie', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/FicheCopropriete.tsx', 'utf8')).toContain('<ArreteComptes coproprieteId={f.id} onChange={(x) => { setErreur(null); setInfo(motArreteEnregistre(x.arrete)); }} />');
    expect(readFileSync('app/(admin)/admin/(protected)/location/AgSortie.tsx', 'utf8')).toContain('<ArreteComptes coproprieteId={lu.copropriete.id} alerteSiManquante onChange={(x) => { setArrete(x.arrete); onRelire?.(); }} />');
  });
  // 🔴 Arno (23/11/2026) — « Valider la sortie » : la date manquante MISE EN AVANT
  // 🔴 Arno (23/11/2026, suite) — le bandeau « fusionné dans cette ligne » : plus de doublon
  it('fenêtre de sortie (alerteSiManquante) : LA ligne dit la date manquante (une seule fois), tant qu’elle manque, plus après la saisie', async () => {
    await act(async () => { root.render(createElement(ArreteComptes, { coproprieteId: 7, alerteSiManquante: true })); }); await calmer();
    expect(container.querySelector('[data-arrete-bandeau]')?.textContent).toBe('⚠ Date d’arrêté des comptes : non renseignée — sans elle, le suivi des 20 % ne peut pas être fiable.');
    expect(container.querySelector('[data-arrete-bandeau]')?.classList.contains('arc-arrete-ligne')).toBe(true);
    expect(container.querySelectorAll('.arc-arrete-ligne')).toHaveLength(1);
    expect(container.textContent?.split(MOT_ARRETE_MANQUANT)).toHaveLength(2);
    expect(container.textContent).not.toContain('Date d’arrêté des comptes manquante');
    await clic('[data-arrete-modifier]');
    await choisir('[data-arrete-mois]', '12'); await choisir('[data-arrete-jour]', '31');
    await clic('[data-arrete-enregistrer]');
    expect(posts).toEqual([{ action: 'arrete-comptes', coproprieteId: 7, jour: '31', mois: '12' }]);
    expect(container.querySelector('[data-arrete-bandeau]')).toBeNull();
  });
  it('fiche Copropriété (sans alerteSiManquante) : pas de bandeau', async () => {
    await rendre();
    expect(container.querySelector('[data-arrete-bandeau]')).toBeNull();
  });
});

/** 🔴 Arno (23/11/2026) — « il faut agrandir le bouton "Renseigner la date d'arrêté des comptes" pour qu'il occupe toute la largeur de la colonne ». */
describe('🔴 « Renseigner la date d’arrêté des comptes » : toute la largeur de la colonne', () => {
  // (23/11/2026, suite) « Modifier » aussi pleine largeur désormais : la règle de base .arc-arrete-btn (épreuve de l'agencement, plus bas)
  it('non renseignée : le bouton pleine largeur (comme « + Ajouter une AG ») ; renseignée : « Modifier » (règle de base, pleine largeur aussi)', async () => {
    await rendre();
    const b = container.querySelector('[data-arrete-modifier]') as HTMLElement;
    expect(b.textContent).toBe('Renseigner la date d’arrêté des comptes');
    expect(b.classList.contains('arc-arrete-btn--plein')).toBe(true);
    expect(container.querySelector('style')!.textContent).toContain('.arc-arrete-btn--plein{align-self:stretch;width:100%;box-sizing:border-box}');
    act(() => root.unmount()); root = createRoot(container);
    lu = { arrete: { jour: 31, mois: 12 }, par: 'arno@exemple.fr', le: '2026-11-23T09:00:00.000Z', disponible: true };
    await rendre();
    expect((container.querySelector('[data-arrete-modifier]') as HTMLElement).classList.contains('arc-arrete-btn--plein')).toBe(false);
  });
  it('fiche Copropriété nouvelle (saisie gardée) : le même bouton pleine largeur', async () => {
    const { ArreteComptesLocal } = await import('./ArreteComptes');
    await act(async () => { root.render(createElement(ArreteComptesLocal, { valeur: null, onChange: () => {} })); });
    expect((container.querySelector('[data-arrete-modifier]') as HTMLElement).classList.contains('arc-arrete-btn--plein')).toBe(true);
  });
});

/** 🔴 Arno (23/11/2026) — « l'agencement de ces champs n'est pas propre, l'esthétique est mauvaise, il faut utiliser tout l'espace et ne pas faire des boutons de tailles différentes pour harmoniser ce bloc. » */
describe('🔴 l’agencement du bloc « Date d’arrêté des comptes »', () => {
  it('Jour / Mois et Annuler / Enregistrer : deux colonnes égales (empilées si elles ne tiennent pas), même hauteur ; « Renseigner » et « Modifier » pleine largeur', async () => {
    const { CSS_ARRETE_COMPTES } = await import('./ArreteComptes');
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-champs,.arc-arrete-boutons{display:grid;grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));gap:8px;min-width:0}');
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-boutons .gst-btn{min-height:44px;width:100%;min-width:0;box-sizing:border-box;margin:0}');
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-champ select{min-height:44px;width:100%;min-width:0;');
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-btn{align-self:stretch;min-height:44px;width:100%;box-sizing:border-box;margin:0}');
    // les marges internes du formulaire : celles des autres blocs (formulaire d'AG : 10px 12px)
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-form{display:flex;flex-direction:column;gap:8px;padding:10px 12px;');
    // plus de règle « au téléphone » qui changeait les tailles des boutons
    expect(CSS_ARRETE_COMPTES).not.toContain('@media');
    // la structure : deux champs dans la grille, deux boutons dans la grille
    await rendre();
    await clic('[data-arrete-modifier]');
    expect(container.querySelectorAll('.arc-arrete-champs > .arc-arrete-champ')).toHaveLength(2);
    expect(container.querySelectorAll('.arc-arrete-boutons > button')).toHaveLength(2);
  });
});

/** 🔴 Arno (23/11/2026) — « afficher la date d'arrêté des comptes en plus gros sur une seule ligne, et la légende concernant la date de saisie et par qui en dessous ». */
describe('🔴 la date en gros, la légende dessous', () => {
  it('ligne 1 en gros : « Date d’arrêté des comptes : 01/03 » ; ligne 2 en petit gris : « saisie par Arnaud JOREL le 23/11/2026 »', async () => {
    lu = { arrete: { jour: 1, mois: 3 }, par: 'Arnaud Jorel', le: '2026-11-23T09:00:00.000Z', disponible: true };
    await rendre();
    const l1 = container.querySelector('.arc-arrete-ligne') as HTMLElement;
    expect(l1.textContent).toBe('Date d’arrêté des comptes : 1er MARS'); // 🔴 (Arno, 23h13) « 1er MARS »
    expect(l1.classList.contains('arc-arrete-ligne--grande')).toBe(true);
    const l2 = container.querySelector('[data-arrete-qui]') as HTMLElement;
    expect(l2.textContent).toBe('saisie par Arnaud JOREL le 23/11/2026');
    expect(l2.classList.contains('loc-muet')).toBe(true);
    expect(l1.nextElementSibling).toBe(l2);
    const { CSS_ARRETE_COMPTES } = await import('./ArreteComptes');
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-ligne--grande{font-size:1.15rem;line-height:1.35}');
    expect(CSS_ARRETE_COMPTES).toContain('.arc-arrete-qui{margin:-4px 0 0;font-size:.85rem}');
  });
  it('non renseignée : une seule ligne, pas de légende', async () => {
    await rendre();
    expect(container.querySelector('[data-arrete-qui]')).toBeNull();
  });
});
