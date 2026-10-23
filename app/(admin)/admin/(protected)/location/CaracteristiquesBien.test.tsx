// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/nouveau-locataire', useRouter: () => ({ push: nav.push }) }));
import { CreationLocataire } from './CreationLocataire';
import { ecartHonoraires } from './ConditionsEntree';
import { valeursDepuis } from '../../../../lib/location/encartBien';
import { gestesPour } from '../../../../lib/gestion/statutBien';
import type { ComplementsFiche } from '../../../../lib/location/bienComplet';
import type { LectureFiche } from '../../../../lib/location/ficheBienEntiereRepo';

/**
 * 🔴 Arno (24/10/2026) — « Nouveau locataire », bloc 3 « Conditions d'entrée » : le bouton « Caractéristiques du bien » (première
 * ligne, à droite) ouvre la fiche du bien — le formulaire « Modifier le bien » de d822613a, le MÊME composant, sans le bloc 1
 * « Propriétaire(s) » — dans une grande modale. Enregistrée : la modale se ferme, le bien est relu, les honoraires propriétaire au
 * barème sont recalculés — sauf un montant saisi à la main, jamais écrasé (l'écart est dit). Annuler / Échap : rien d'écrit.
 * Les vrais composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

const CALCUL = (surface: string, total: string) => ({ etat: 'ok', surface, zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, baremeId: 1,
  baremeDepuis: '2026-01-01', source: 'Arrêté', tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total });
const VALEURS = valeursDepuis({ categorie: 'logement', adresse: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE', etage: '2', porte: '21', numLotCopro: '12',
  surfaceCarrezM2: 61.8, surfaceExterieureM2: null },
{ typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: 'B', ascenseur: true, digicode: false, commentaire: 'Avant.',
  dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false, entretiens: [], assurancePno: true, pnoDateAnniversaire: '2026-05-01', epoqueConstruction: '1949-1974',
  chauffage: null, idFiscal: '921234567890', chargesCopro: 'agence', derniereAg: '2026-06-15', syndicId: null, syndicNom: '', precisionAcces: '', escalier: '' } as unknown as ComplementsFiche);
const LECTURE: LectureFiche = {
  version: 'v1',
  encart: { valeurs: VALEURS, famille: 'logement', annexe: false, avecIdFiscal: true, avecCharges: true, avecAg: true, avecEntretien: true, adresseModifiable: true, avecPno: true,
    digicodeImmeuble: null, categorie: 'logement', adresse: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE', nomAnnexe: null },
  annexes: [],
  statut: { statut: 'en_gestion', depuis: '2019-03-01', gestes: gestesPour('en_gestion'), disponible: true, suitLot: null },
  proprietaires: ['DURAND Léa'], mandat: { sorte: 'gestion', lignes: [] },
};

let container: HTMLDivElement;
let root: Root;
let posts: { url: string; corps: Record<string, unknown> }[];
let calcul: unknown;
let lectures: string[];
beforeEach(() => {
  nav.push.mockReset();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; calcul = CALCUL('61.8', '935.034'); lectures = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    lectures.push(u);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ url: u, corps });
      if (corps.action === 'modifier-fiche-bien') {
        // la base a la nouvelle surface : le calcul du serveur suit
        calcul = CALCUL('70', '1059.1');
        return ok({ changements: [{ cle: 'surfaceCarrezM2', champ: 'Surface Carrez/Boutin m²', avant: '61,8', apres: '70' }], notes: [] });
      }
      return ok({});
    }
    // La fiche commune (route de la Gestion), lue par le formulaire « Modifier le bien ».
    if (u.includes('/api/admin/gestion/annuaire/location?ficheEntiere=7')) return ok(LECTURE);
    if (u.includes('/api/admin/gestion/annuaire/location?versionBien=7')) return ok({ version: 'v1' });
    if (u.startsWith('/api/admin/gestion/annuaire?lot=7')) return ok({ id: 7, nature: 'Appartement', typeBien: 'T3', surfaceM2: null });
    // La Location.
    if (u.includes('schemaConditionsEntree')) return ok({ conditions: true, loyer: true, manquantes: [] });
    if (u.includes('honorairesProprietaire=7')) return ok(calcul);
    if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '15 rue Fictive, Courbevoie', detail: 'Appartement', loue: false }]);
    if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'logement', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [] }], sorte: 'simple', origineLibelle: '' });
    if (u.includes('/api/admin/location?lot=7')) return ok({ bien: { id: 7, categorie: 'logement' }, complements: { entretienAPrevoir: null, entretiens: [] } });
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
const q = (s: string) => document.querySelector(s) as HTMLElement | null;
const clic = async (el: Element | string) => {
  const e = typeof el === 'string' ? q(el) : el;
  if (!e) throw new Error(`absent : ${String(el)}`);
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer();
};
const saisir = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const bouton = () => q('[data-caracteristiques-bien="bien-loue"]') as HTMLButtonElement;
const boutonConditions = () => q('[data-caracteristiques-bien="conditions"]') as HTMLButtonElement;
const montant = () => q('[data-hono-montant] input') as HTMLInputElement;
const mention = () => q('[data-hono-mention]')?.textContent ?? '';
const surface = () => {
  const l = [...document.querySelectorAll('[data-modale-caracteristiques-bien] form.loc-page label')].find((x) => (x.firstChild?.textContent ?? x.textContent ?? '').trim().startsWith('Surface Carrez'));
  return l?.querySelector('input') as HTMLInputElement;
};
const echap = async () => { await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })); }); await calmer(); };

const monter = async () => { await act(async () => { root.render(createElement(CreationLocataire)); }); await calmer(); };
const choisirBien = async () => {
  await saisir(q('input[data-recherche-bien]') as HTMLInputElement, 'Fictive');
  await clic('.loc-choix button');
  await saisir(q('input[data-date-entree]') as HTMLInputElement, '2026-11-01');
};
const enregistrerSurface = async (v: string) => {
  await saisir(surface(), v);
  await clic('[data-modale-caracteristiques-bien] [data-valider-modification]');
  const lignes = [...document.querySelectorAll('[data-contre-validation] li')].map((l) => l.textContent ?? '');
  expect(lignes).toHaveLength(1);
  expect(lignes[0]).toMatch(/^Surface Carrez.*61,8.*→.*70/);   // la contre-validation habituelle
  await clic('[data-confirmer-modification]');
  await clic('[data-fermer-succes-modification]');
};

describe('🔴 « Caractéristiques du bien » — Nouveau locataire', () => {
  it('à droite du titre du bloc « Bien loué » (Arno, 24/10/2026) ET du bloc 3 ; sans bien : visible, inactif, « Choisissez d’abord le bien »', async () => {
    await monter();
    // là où l'on choisit le bien : juste après le titre du bloc 2, qui reste l'enfant direct de la section
    expect(bouton().previousElementSibling?.matches('section[data-bloc-bien-loue] > h3')).toBe(true);
    expect(bouton().previousElementSibling?.textContent).toBe('2Bien loué');
    expect(boutonConditions().previousElementSibling?.matches('section[data-bloc-conditions] > h3')).toBe(true);
    for (const b of [bouton(), boutonConditions()]) {
      expect(b.textContent).toBe('Caractéristiques du bien');
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.title).toBe('Choisissez d’abord le bien');
      await clic(b);
      expect(q('[data-modale-caracteristiques-bien]')).toBeNull();
    }
    await choisirBien();
    expect(bouton().getAttribute('aria-disabled')).toBe('false');
    expect(bouton().title).toBe('');
    // celui du bloc 3 ouvre la même modale
    await clic(boutonConditions());
    expect(q('[data-modale-caracteristiques-bien]')).not.toBeNull();
  });

  it('ouvre en grande modale LE formulaire « Modifier le bien » (même composant), sans le bloc 1 « Propriétaire(s) », pré-rempli', async () => {
    await monter(); await choisirBien();
    await clic(bouton());
    const m = q('[data-modale-caracteristiques-bien]')!;
    expect(m.getAttribute('role')).toBe('dialog');
    expect(m.getAttribute('aria-modal')).toBe('true');
    expect(m.querySelector('.loc-titre')?.textContent).toBe('Modifier le bien');
    // sans le bloc 1 : la numérotation d'origine commence à 2
    expect([...m.querySelectorAll('form.loc-page section.loc-section > h3 .loc-num')].map((x) => x.textContent)[0]).toBe('2');
    expect(m.querySelector('[data-bloc-proprietaires], [data-rappel-proprietaires]')).toBeNull();
    expect(surface().value).toBe('61,8');
    expect(q('[data-modale-caracteristiques-bien] [data-valider-modification]')?.textContent).toBe('Enregistrer les modifications');
    expect(q('[data-modale-caracteristiques-bien] [data-annuler-modification]')).not.toBeNull();
    // le lien de l'en-tête ramène au formulaire du locataire (il ne quitte pas la page)
    expect(m.querySelector('.loc-retour a')?.textContent).toBe('← Nouveau locataire');
    // pas de copie : la modale rend ModifierFicheBien
    const src = readFileSync('app/(admin)/admin/(protected)/location/ModaleCaracteristiquesBien.tsx', 'utf8');
    expect(src).toContain("import { ModifierFicheBien } from '../gestion/ModifierFicheBien';");
    expect(src).toContain('<ModifierFicheBien lotId={lotId}');
  });

  it('enregistrer la surface → la modale se ferme, le bien est relu, les honoraires propriétaire recalculés au barème', async () => {
    await monter(); await choisirBien();
    expect(montant().value).toBe('935,03');
    await clic(bouton());
    await enregistrerSurface('70');
    expect(posts.filter((p) => p.corps.action === 'modifier-fiche-bien')).toHaveLength(1);
    expect(q('[data-modale-caracteristiques-bien]')).toBeNull();
    expect(montant().value).toBe('1059,10');
    expect(mention()).toBe('calculé avec la surface du bien — modifiable');
    expect(nav.push).not.toHaveBeenCalled();                       // on reste sur « Nouveau locataire »
  });

  it('un montant saisi à la main n’est JAMAIS écrasé : l’écart avec le nouveau calcul est dit', async () => {
    await monter(); await choisirBien();
    await saisir(montant(), '1 000');
    await clic(bouton());
    await enregistrerSurface('70');
    expect(montant().value).toBe('1 000');
    expect(mention()).toBe('saisi à la main · au barème : 1 059,10 € (écart : +59,10 €) · recalculer'.replace(/ (?=\d{3},)/g, ' '));
  });

  it('Annuler, Échap, « ← Nouveau locataire » : la modale se ferme, rien n’est écrit', async () => {
    await monter(); await choisirBien();
    await clic(bouton());
    await clic('[data-modale-caracteristiques-bien] [data-annuler-modification]');
    expect(q('[data-modale-caracteristiques-bien]')).toBeNull();
    await clic(bouton());
    await echap();
    expect(q('[data-modale-caracteristiques-bien]')).toBeNull();
    await clic(bouton());
    await clic('[data-modale-caracteristiques-bien] .loc-retour a');
    expect(q('[data-modale-caracteristiques-bien]')).toBeNull();
    // avec une saisie : la question habituelle d'abord ; Échap ne ferme qu'elle
    await clic(bouton());
    await saisir(surface(), '70');
    await echap();
    expect(q('.mis-boite')?.textContent).toContain('Abandonner les modifications ?');
    expect(q('[data-modale-caracteristiques-bien]')).not.toBeNull();
    await clic('[data-abandonner-modification]');
    expect(q('[data-modale-caracteristiques-bien]')).toBeNull();
    expect(posts).toHaveLength(0);
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe('ecartHonoraires', () => {
  it('l’écart barème − saisi, signé ; rien sans calcul, sans écart ou montant illisible', () => {
    expect(ecartHonoraires('1 000', '935,03')).toBe('au barème : 935,03 € (écart : −64,97 €)');
    expect(ecartHonoraires('500', '935,03')).toBe('au barème : 935,03 € (écart : +435,03 €)');
    expect(ecartHonoraires('935,03', '935,03')).toBeNull();
    expect(ecartHonoraires('1 000', '')).toBeNull();
    expect(ecartHonoraires('abc', '935,03')).toBeNull();
  });
});
