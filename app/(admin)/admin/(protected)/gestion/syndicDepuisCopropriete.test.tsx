// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { FicheSyndic } from './FicheSyndic';

/**
 * ══ 🔴🔴 (Arno, 20/11/2026) « dans la modale de copropriété […] la même méthode qu'en copie 1 pour rattacher un syndic via le moteur de recherche,
 * mais si le syndic n'existe pas on doit pouvoir le créer exactement de la même manière. » ═══════════════════════════════════════════════════════════
 * LA fenêtre « Syndic de la copropriété » de la carte d'un bien (FicheSyndic), variante « copropriete » : même recherche, même « Ajouter un syndic »,
 * même création depuis les résultats avec la garde anti-doublon ; le choix est RENDU à la copropriété sans écriture (préparé jusqu'à son « Valider »).
 * 🔒 Données de banc (`fetch` simulé, cabinets fictifs).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANNUAIRE = [{ id: 4, nom: 'Cabinet FONCIA', adresse: '12 bis av. des Champs-Élysées', codePostal: '75008', ville: 'Paris',
  emails: ['contact@foncia.invalid'], telephones: ['0142000001'] }];
const FICHE_4 = { id: 4, nom: 'Cabinet FONCIA', adresse: '12 bis av. des Champs-Élysées', codePostal: '75008', ville: 'Paris', telephone: '0142000001',
  telephone2: null, email: 'contact@foncia.invalid', note: null, creeLe: '2026-10-12T10:00:00Z', creeParLibelle: 'banc', majLe: null, majParLibelle: null,
  contacts: [], coproprietes: [], historique: [], anciens: [] };
let appels: Array<{ url: string; methode: string; corps: Record<string, unknown> | null }> = [];
let container: HTMLDivElement;
let root: Root;
let choisis: Array<{ id: number; nom: string; ville: string | null }> = [];
let ferme = 0;

beforeEach(() => {
  appels = []; choisis = []; ferme = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const methode = init?.method ?? 'GET';
    const corps = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    appels.push({ url, methode, corps });
    const rep = (j: unknown, ok = true) => ({ ok, json: async () => j });
    if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: [] });
    if (url.startsWith('/api/admin/gestion/syndics/comparables')) return rep({ etat: 'ok', syndics: ANNUAIRE });
    if (url === '/api/admin/gestion/syndics/4' && methode === 'GET') return rep({ etat: 'ok', fiche: FICHE_4 });
    if (url === '/api/admin/gestion/syndics' && methode === 'POST') return rep({ ok: true, id: 13 });
    if (url.startsWith('/api/admin/gestion/syndics?')) {
      return rep({ syndics: [{ id: 4, nom: 'Cabinet FONCIA', ville: 'Paris', email: 'contact@foncia.invalid', telephone: null, nbCoproprietes: 3, nbBiens: 5, cherchable: '' }] });
    }
    if (url.startsWith('/api/admin/gestion/syndics')) return rep({ etat: 'ok', disponible: true, syndics: [], communes: [], adresses: [] });
    return rep({});
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const attendre = async (ms: number): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await calmer(); };
const bouton = (texte: string): HTMLButtonElement => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === texte);
  if (!b) throw new Error(`bouton introuvable : ${texte}`);
  return b as HTMLButtonElement;
};
const taper = async (el: HTMLInputElement, v: string): Promise<void> => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const monter = async (syndicActuel: string | null = '_TEST SYNDIC CONTACTS / Puteaux'): Promise<void> => {
  await act(async () => {
    root.render(createElement(FicheSyndic, { syndicId: null, variante: 'copropriete', contexteCopropriete: { libelle: '12 rue _TEST Syndic Contacts', syndicActuel },
      onFerme: () => { ferme += 1; }, onChoisi: (s) => { choisis.push(s); } }));
  });
  await attendre(260);
};
const ecritures = () => appels.filter((a) => a.methode !== 'GET');

describe('le même composant aux deux endroits', () => {
  it('la modale Copropriété ouvre FicheSyndic (variante « copropriete ») ; la carte du bien garde la même ; plus de recherche maison dans la copropriété', () => {
    const copro = readFileSync('app/(admin)/admin/(protected)/gestion/FicheCopropriete.tsx', 'utf8');
    expect(copro).toContain('<FicheSyndic syndicId={null} variante="copropriete"');
    expect(copro).not.toContain('/api/admin/gestion/syndics?q=');
    expect(copro).not.toContain('data-fcp-q-syndic');
    const bien = readFileSync('app/(admin)/admin/(protected)/gestion/BoutonSyndic.tsx', 'utf8');
    expect(bien).toMatch(/<FicheSyndic\b/);
  });
});

describe('depuis la copropriété : la fenêtre « Syndic de la copropriété »', () => {
  it('le titre, la ligne « Copropriété : … — syndic actuel : … », le champ de recherche, « Ajouter un syndic », l’aide, les résultats (copropriétés · biens · e-mail)', async () => {
    await monter();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Syndic de la copropriété');
    expect(document.querySelector('[data-fsy-contexte-copro]')?.textContent).toBe('Copropriété : 12 rue _TEST Syndic Contacts — syndic actuel : _TEST SYNDIC CONTACTS / Puteaux.');
    expect(document.querySelector('.fsy label.fsy-champ span')?.textContent).toBe('Chercher un syndic existant (nom, e-mail, téléphone, domaine)');
    expect(bouton('Ajouter un syndic')).toBeTruthy();
    expect(document.querySelector('[data-fsy-creer-apres-recherche]')?.textContent).toContain('s’il n’est pas dans la liste, vous pourrez le créer');
    expect(document.querySelector('.fsy-resultat')?.textContent).toContain('3 copropriétés · 5 biens · contact@foncia.invalid');
    expect(document.querySelector('[data-fsy-rattacher="4"]')?.textContent?.trim()).toBe('Rattacher cette copropriété à ce syndic');
  });

  it('sans syndic : « aucun syndic connu »', async () => {
    await monter(null);
    expect(document.querySelector('[data-fsy-contexte-copro]')?.textContent).toBe('Copropriété : 12 rue _TEST Syndic Contacts — aucun syndic connu.');
  });

  it('RECHERCHE : la frappe part au moteur de recherche des syndics', async () => {
    await monter();
    await taper(document.querySelector('.fsy input[type="search"]') as HTMLInputElement, 'foncia');
    await attendre(260);
    expect(appels.some((a) => a.url === '/api/admin/gestion/syndics?q=foncia')).toBe(true);
  });

  it('RATTACHER : le syndic est RENDU à la copropriété (préparé), RIEN n’est écrit, la fenêtre se ferme', async () => {
    await monter();
    await act(async () => { (document.querySelector('[data-fsy-rattacher="4"]') as HTMLButtonElement).click(); }); await calmer();
    expect(choisis).toEqual([{ id: 4, nom: 'Cabinet FONCIA', ville: 'Paris' }]);
    expect(ecritures()).toEqual([]);
    expect(appels.some((a) => a.url.includes('rattacher-bien'))).toBe(false);
    expect(ferme).toBe(1);
  });

  it('CRÉER depuis les résultats : le même formulaire, le nom tapé pré-rempli, AUCUNE copropriété pré-remplie (rattachée à la validation de la copropriété)', async () => {
    await monter();
    await taper(document.querySelector('.fsy input[type="search"]') as HTMLInputElement, '_TEST SYNDIC CREE DEPUIS COPRO');
    await attendre(260);
    await act(async () => { (document.querySelector('[data-fsy-creer-recherche]') as HTMLButtonElement).click(); }); await attendre(10);
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Créer un syndic');
    const nom = [...document.querySelectorAll('label.fsy-champ')].find((l) => l.querySelector('span')?.textContent?.trim() === 'Nom du cabinet *')?.querySelector('input') as HTMLInputElement;
    expect(nom.value).toBe('_TEST SYNDIC CREE DEPUIS COPRO');
    expect(ecritures()).toEqual([]);
  });

  it('DOUBLON : le même bandeau que la carte du bien ; « Choisir celui-ci » rend le syndic EXISTANT à la copropriété, rien n’est créé', async () => {
    await monter();
    await taper(document.querySelector('.fsy input[type="search"]') as HTMLInputElement, 'SARL Foncia');
    await attendre(260);
    await act(async () => { (document.querySelector('[data-fsy-creer-recherche]') as HTMLButtonElement).click(); }); await attendre(10);
    expect(document.querySelector('.psy-bandeau--doublon')?.textContent).toContain('Ce syndic existe peut-être déjà :');
    await act(async () => { bouton('Choisir celui-ci').click(); }); await calmer();
    expect(choisis).toEqual([{ id: 4, nom: 'Cabinet FONCIA', ville: 'Paris' }]);
    expect(appels.some((a) => a.url === '/api/admin/gestion/syndics' && a.methode === 'POST')).toBe(false);
  });
});
