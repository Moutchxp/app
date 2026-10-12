// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { LocatairesConcernes, type ChoixConcernes } from './LocatairesConcernes';

/**
 * ══ 🔴🔴 LOT MARGES-MODALE-ET-LOCATAIRES-DE-L-EVENEMENT — À L'ÉCRAN ══════════════════════════════════════════════════
 * 🔒 Données de banc (`fetch` simulé) : rien n'est lu ni écrit en base.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let occupations: unknown[] = [];
let dernier: ChoixConcernes | null = null;

beforeEach(() => {
  dernier = null;
  occupations = [
    { locataireId: 10, nom: 'TALHOUARN Valentin', entree: '2024-10-26', sortie: null },
    { locataireId: 302, nom: 'LEON GUIMAREY DI FIORE Isabella et Hugo', entree: '2025-05-01', sortie: '2026-09-28' },
    { locataireId: 346, nom: 'MOUDNI Imane', entree: '2022-04-16', sortie: '2025-01-16' },
    { locataireId: 400, nom: 'ANCIEN Plus', entree: '2019-01-01', sortie: '2022-03-31' },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const rep = (j: unknown) => ({ ok: true, json: async () => j });
    if (url.startsWith('/api/admin/gestion/annuaire?lotCle=')) return rep({ etat: 'ok', data: { occupations } });
    if (url.startsWith('/api/admin/gestion/annuaire?q=')) {
      return rep({ etat: 'ok', data: { personnes: [{ sujet: 'proprietaire', id: 12, nomAffiche: 'M. Paul BANC', email: 'paul@banc.invalid', mobile: null }] } });
    }
    return rep({});
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const bouton = (t: string): HTMLButtonElement => {
  const b = [...container.querySelectorAll('button')].find((x) => x.textContent?.trim() === t);
  if (!b) throw new Error(`bouton introuvable : ${t}`);
  return b as HTMLButtonElement;
};
const cliquer = async (el: Element): Promise<void> => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const taper = async (el: HTMLInputElement, v: string): Promise<void> => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => { setter?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};

function Hote() {
  const [v, setV] = useState<ChoixConcernes | null>(null);
  return createElement(LocatairesConcernes, {
    bienCles: ['315'], libellesDesBiens: ['67 rue de Normandie, 92400 COURBEVOIE — lot 315'], valeur: v,
    onChange: (c) => { dernier = c; setV(c); },
  });
}
const monter = async (): Promise<void> => { await act(async () => { root.render(createElement(Hote)); }); await calmer(); };

describe('🔴🔴 « Locataire(s) concerné(s) : … — Modifier »', () => {
  it('par défaut : le locataire en place, la phrase avec son nom — et RIEN ne remonte tant qu’on ne modifie pas', async () => {
    await monter();
    expect(container.querySelector('.bev-note')?.textContent)
      .toBe('Sera rattaché à 67 rue de Normandie, 92400 COURBEVOIE — lot 315, à son propriétaire et à TALHOUARN Valentin (locataire en place).');
    expect([...container.querySelectorAll('.lce-ligne .lce-puce')].map((p) => [p.textContent, p.className])).toEqual([['TALHOUARN Valentin', 'lce-puce lce-puce--vert']]);
    expect(dernier).toBeNull();
  });
  it('la fenêtre : actuels en VERT (entrée), les DEUX anciens les plus récents en VIOLET (entrée, sortie)', async () => {
    await monter();
    await cliquer(bouton('Modifier'));
    const cases = [...container.querySelectorAll('.lce-case')].map((c) => [c.className.replace('lce-case ', ''), c.querySelector('.lce-nom')?.textContent,
      c.querySelector('.lce-detail')?.textContent, (c.querySelector('input') as HTMLInputElement).checked]);
    expect(cases).toEqual([
      ['lce-case--vert', 'TALHOUARN Valentin', 'entré le 26/10/2024', true],
      ['lce-case--violet', 'LEON GUIMAREY DI FIORE Isabella et Hugo', 'du 01/05/2025 au 28/09/2026', false],
      ['lce-case--violet', 'MOUDNI Imane', 'du 16/04/2022 au 16/01/2025', false],
    ]);
  });
  it('un ancien locataire choisi : la phrase suit, le choix remonte comme MODIFIÉ', async () => {
    await monter();
    await cliquer(bouton('Modifier'));
    const [actuel, ancien] = [...container.querySelectorAll('.lce-case input')] as HTMLInputElement[];
    await cliquer(actuel);
    await cliquer(ancien);
    await cliquer(bouton('Valider le choix'));
    expect(dernier?.modifie).toBe(true);
    expect(dernier?.choix.map((c) => [c.sorte, c.locataireId])).toEqual([['ancien_locataire', 302]]);
    expect(container.querySelector('.bev-note')?.textContent).toBe('Sera rattaché à 67 rue de Normandie, 92400 COURBEVOIE — lot 315, à son propriétaire et à LEON GUIMAREY DI FIORE Isabella et Hugo (ancien locataire, sorti le 28/09/2026).');
    expect(container.querySelector('.lce-puce')?.className).toBe('lce-puce lce-puce--violet');
  });
  it('« Autre personne… » : l’annuaire, puis la saisie libre (gris, sans fiche)', async () => {
    await monter();
    await cliquer(bouton('Modifier'));
    await cliquer(bouton('Autre personne…'));
    await taper(container.querySelector('.lce-autre input[type="search"]') as HTMLInputElement, 'banc');
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    await calmer();
    await cliquer(bouton('M. Paul BANC · paul@banc.invalid'));
    await cliquer(bouton('Autre personne…'));
    await cliquer(bouton('Saisir librement (sans créer de fiche)'));
    const champs = [...container.querySelectorAll('.lce-autre input')] as HTMLInputElement[];
    await taper(champs[0], 'Me DUPONT, avocat');
    await taper(champs[1], 'me.dupont@banc.invalid');
    expect(container.textContent).toContain('aucune fiche n’est créée dans l’annuaire');
    await cliquer(bouton('Ajouter'));
    await cliquer(bouton('Valider le choix'));
    expect(dernier?.choix.map((c) => [c.sorte, c.nom, c.sujet, c.sujetId, c.email])).toEqual([
      ['locataire', 'TALHOUARN Valentin', null, null, null],
      ['annuaire', 'M. Paul BANC', 'proprietaire', 12, 'paul@banc.invalid'],
      ['libre', 'Me DUPONT, avocat', null, null, 'me.dupont@banc.invalid'],
    ]);
    expect([...container.querySelectorAll('.lce-ligne .lce-puce')].map((p) => p.className.split('--')[1])).toEqual(['vert', 'gris', 'gris']);
  });
  it('bien vacant : rien de coché, et la phrase le dit', async () => {
    occupations = occupations.slice(1);
    await monter();
    expect(container.querySelector('.bev-note')?.textContent).toContain('aucun locataire concerné (bien vacant)');
    await cliquer(bouton('Modifier'));
    expect(container.textContent).toContain('Aucun locataire en place (bien vacant).');
    expect(([...container.querySelectorAll('.lce-case input')] as HTMLInputElement[]).some((i) => i.checked)).toBe(false);
  });
});

describe('🔴🔴 PARTIE 1 — rien ne déborde de la fenêtre « Bien(s) rattaché(s) à ce mail »', () => {
  const G = 'app/(admin)/admin/(protected)/gestion/';
  it('la pastille d’un libellé de la glissière est bornée au bloc (extrémités recadrées), son contour tracé dedans', () => {
    const g = readFileSync(`${G}GlissierePortee.tsx`, 'utf8');
    expect(g).toContain('margin-left:clamp(0px, calc(var(--gpo-retrait) + var(--gpo-x) * (100% - 2 * var(--gpo-retrait)) - var(--gpo-l) / 2), calc(100% - var(--gpo-l)));');
    expect(g).toContain('.gpo-libelle:focus-visible{outline:3px solid var(--color-svv-ink);outline-offset:-3px}');
  });
  it('« Événement rattaché » et les autres lignes pleine largeur tracent leur cadre vers l’intérieur', () => {
    const r = readFileSync(`${G}RattachementsDuFil.tsx`, 'utf8');
    for (const c of ['.rdf-evt-resume', '.rdf-suivi-resume', '.rdf-resume']) {
      expect(r, c).toContain(`${c}:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:.4rem}`);
    }
    expect(readFileSync(`${G}ListeBiensACocher.tsx`, 'utf8')).toContain('.rec-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}');
  });
});
