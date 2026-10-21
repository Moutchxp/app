// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { CreationProprietaires } from './CreationProprietaires';
import { EtiquetteHorsGestion } from '../gestion/Annuaire';

/**
 * 🔴 Arno (20/10/2026) — écran « Nouveau bien » : « Bien en gestion ? », dernier bloc après « Commentaires ».
 *   · le MÊME bloc que « Propriétaire(s) en gestion ? » (même composant, même rendu, même fête sur Oui) ;
 *   · réponse OBLIGATOIRE : dans « Reste à renseigner », « Enregistrer le bien » bloqué ; envoyée avec le bien ;
 *   · en continuité de « Créer un nouveau propriétaire » : pas reposée, le bien prend la réponse du dessus ;
 *   · l'étiquette « Hors gestion » (le mot + la couleur) sur la carte du bien.
 * Les VRAIS composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let defile: Element[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; defile = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { defile.push(this); };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok(corps.action === 'creer-proprietaires' ? { ids: [41] } : { logementId: 9 });
    }
    if (String(url).includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const bloc = () => container.querySelector('[data-question-gestion="bien"]') as HTMLElement | null;
const bouton = (mot: 'En gestion' | 'Location seule') => [...(bloc()?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.replace('✓ ', '') === mot) as HTMLButtonElement;
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => {
  await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
};
/** Un parking nu complet : tout l'obligatoire, sauf « Bien en gestion ? ». */
const parkingComplet = async () => {
  await clic(container.querySelector('[data-famille="parking"]')!);
  await clic(container.querySelectorAll('[aria-label="Type de parking"] button')[0]);
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
};
const rendreBien = async () => {
  await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
  await calmer();
};

describe('🔴 « Bien en gestion ? » — le bloc de l’écran « Nouveau bien »', () => {
  it('en bas, après « Commentaires » : section 8, titre marqué obligatoire, Oui / Non sans présélection', async () => {
    await rendreBien();
    await clic(container.querySelector('[data-famille="logement"]')!);
    const sections = [...container.querySelectorAll('form > .loc-section')];
    expect(sections.at(-1)).toBe(bloc());
    expect(sections.at(-2)?.querySelector('h3')?.textContent).toBe('7Commentaires');
    expect(bloc()?.querySelector('h3')?.textContent).toBe('8Statut du bien *');
    expect(bloc()?.querySelector('h3 .loc-oblig')).not.toBeNull();
    expect([bouton('En gestion'), bouton('Location seule')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
  });

  it('le MÊME bloc que « Propriétaire(s) en gestion ? » : même composant, mêmes classes, même structure', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const proprietaires = container.querySelector('[data-question-gestion="proprietaires"]') as HTMLElement;
    // Arno (21/10/2026, 397) : sous les boutons du BIEN, les lignes du mandat (gestion / transaction) — un ajout de ce bloc seul,
    // éprouvé à part (`MandatBienEnGestion.test.tsx`) ; la QUESTION reste le même composant.
    const sansMandat = (s: Element): Element => { const c = s.cloneNode(true) as Element; c.querySelector('.lmd-bloc')?.remove(); return c; };
    const rendu = (s0: Element) => sansMandat(s0).outerHTML.replace(/ (id|aria-labelledby|aria-label|data-question-gestion)="[^"]*"/g, '')
      .replace(/Propriétaire\(s\) en gestion \?|Statut du bien/g, 'TITRE').replace(/<span class="loc-num">\d<\/span>/, '')
      .replace(/ <span class="loc-oblig">\*<\/span>/, '')
      // Arno (21/10/2026, 403) : seuls les MOTS des boutons diffèrent (« En gestion » / « Location seule ») — même composant.
      .replace('>En gestion<', '>Oui<').replace('>Location seule<', '>Non<');
    const avant = rendu(proprietaires);
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await calmer();
    expect(rendu(bloc()!)).toBe(avant);
    expect(bouton('En gestion').className).toBe('loc-gros-bouton loc-gros-bouton--centre fete-hote');
    expect(bouton('Location seule').className).toBe('loc-gros-bouton loc-gros-bouton--centre');
    expect(bloc()?.querySelector('.loc-gros-boutons')?.className).toBe('loc-gros-boutons loc-oui-non');
    // Aucune copie divergente : les deux écrans montent `QuestionEnGestion`, aucun n'écrit ses propres boutons Oui / Non.
    for (const f of ['CreationBien.tsx', 'CreationProprietaires.tsx']) {
      const src = readFileSync(`app/(admin)/admin/(protected)/location/${f}`, 'utf8');
      expect(src, f).toContain('<QuestionEnGestion ');
      expect(src, f).not.toContain('fete-hote');
      expect(src, f).not.toContain('<FeteOui');
    }
  });

  it('la fête du « Oui » : dans le bouton Oui, au seul passage à Oui (pas sur Non), relancée à chaque nouveau passage', async () => {
    await rendreBien();
    expect(bloc()?.querySelector('[data-fete]')).toBeNull();
    await clic(bouton('Location seule'));
    expect(bloc()?.querySelector('[data-fete]')).toBeNull();
    await clic(bouton('En gestion'));
    const fete = bloc()?.querySelector('[data-fete]');
    expect(fete).not.toBeNull();
    expect(bouton('En gestion').contains(fete!)).toBe(true);
    expect(bouton('En gestion').getAttribute('aria-pressed')).toBe('true');
    expect(bouton('En gestion').querySelector('.fete-texte')?.textContent).toBe('✓ En gestion');
    // Le style de la fête est chargé par l'écran (sinon la toile déborderait du bouton).
    expect([...container.querySelectorAll('style')].some((s) => s.textContent?.includes('.fete-hote{position:relative;overflow:hidden'))).toBe(true);
  });

  it('OBLIGATOIRE : dans « Reste à renseigner », rien n’est envoyé, le message est sous le bloc et la page y défile', async () => {
    await rendreBien();
    await parkingComplet();
    expect(barre()).toBe('Reste à renseigner : Statut du bien : choisissez « En gestion » ou « Location seule ».');
    await soumettre();
    expect(posts).toEqual([]);
    expect(bloc()?.querySelector('.loc-manque')?.textContent).toBe('Statut du bien : choisissez « En gestion » ou « Location seule ».');
    expect(defile.at(-1)).toBe(bloc());
    await clic(bouton('Location seule'));
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    expect(bloc()?.querySelector('.loc-manque')).toBeNull();
  });

  it('enregistré AVEC le bien : Non → enGestion false ; on peut changer d’avis → true', async () => {
    await rendreBien();
    await parkingComplet();
    await clic(bouton('Location seule'));
    await soumettre();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'creer-bien', proprietaireIds: [1], enGestion: false });
    // Arno (21/10/2026) : enregistré → modale « ✓ Bien enregistré », et le bien n'est JAMAIS recréé par un second clic.
    expect(document.querySelector('[data-modale-issue="succes"]')).not.toBeNull();
    await soumettre();
    expect(posts).toHaveLength(1);
    // Changer d'avis : sur un formulaire neuf.
    act(() => { root.unmount(); }); root = createRoot(container); document.body.querySelectorAll('[data-modale-issue]').forEach((m) => m.closest('.mis-voile')?.remove());
    await rendreBien();
    await parkingComplet();
    await clic(bouton('Location seule'));
    await clic(bouton('En gestion'));
    expect(bouton('Location seule').getAttribute('aria-pressed')).toBe('false');
    await soumettre();
    expect(posts.at(-1)).toMatchObject({ action: 'creer-bien', enGestion: true });
  });

  it('en continuité de « Créer un nouveau propriétaire » : la question n’est pas reposée, le bien prend la réponse du dessus', async () => {
    const creerFiches = vi.fn(async () => ({ ids: [41] }));
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [], continuite: { proprietaires: [{ nom: 'NOUVEAU Jean' }], contacts: [], creerFiches, enGestion: false } })); });
    await calmer();
    expect(bloc()).toBeNull();
    expect(container.querySelector('[data-question-gestion]')).toBeNull();
    await parkingComplet();
    expect(barre()).toBe('Tout l’obligatoire est renseigné.');
    await soumettre();
    expect(posts[0]).toMatchObject({ action: 'creer-bien', proprietaireIds: [41], enGestion: false });
  });

  it('l’écran « Créer un nouveau propriétaire » transmet sa réponse au formulaire du bien en dessous', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/CreationProprietaires.tsx', 'utf8');
    expect(src.replace(/\s+/g, ' ')).toContain('contacts: etat.contacts, creerFiches, enGestion,');
  });
});

describe('🔴 l’étiquette « Hors gestion » de la carte du bien', () => {
  it('le MOT et la couleur (jamais la couleur seule), sur la carte du bien et l’en-tête de sa fiche — seulement si hors gestion', async () => {
    await act(async () => { root.render(createElement(EtiquetteHorsGestion)); });
    const e = container.querySelector('[data-hors-gestion]') as HTMLElement;
    expect(e.textContent).toBe('Hors gestion');
    expect(e.className).toBe('ann-etiq ann-etiq--hors-gestion');
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toMatch(/\.ann-etiq--hors-gestion\{background:var\(--color-svv-amber-soft\);border-color:var\(--color-svv-amber\);color:var\(--color-svv-amber\)\}/);
    // La carte du bien (fiche propriétaire, Gestion ET Location) et l'en-tête de la fiche du bien ; conditionnée au seul statut.
    // Arno (21/10/2026, 403) : sur la carte, la pastille du STATUT la remplace quand il est connu ; sans lui, l'étiquette d'avant.
    expect(src.match(/: b\.horsGestion === true && <EtiquetteHorsGestion \/>\}/g)).toHaveLength(1);
    expect(src.match(/\{f\.horsGestion === true && <EtiquetteHorsGestion \/>\}/g)).toHaveLength(1);
  });
});
