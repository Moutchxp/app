// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';
import type { ContactSource } from '../../../../lib/gestion/contactsTache';

/**
 * ══ 🔴🔴 LOT TACHES-1-BIS — LES CONTACTS DANS LA FENÊTRE D'UNE TÂCHE, À L'ÉCRAN ═══════════════════════════════════
 *
 * On monte la VRAIE fenêtre, sur des routes simulées. Création : la section est entre « Événement du bien lié » et
 * « Rappels », rien n'est coché, cocher/décocher refait le bloc « Contacts » sans toucher la note. Détail : les
 * contacts copiés, « Coordonnées modifiées depuis » + « Mettre à jour », un contact plus lié au bien toujours lisible,
 * téléphones en tel:, e-mails vers le composeur « Nouveau message » (rien n'est envoyé).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROPRIO: ContactSource = {
  cle: 'proprietaire:12', famille: 'proprietaire', nom: 'M. DUPONT Jean', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'telephone', libelle: 'Mobile', valeur: '0612345678', affichage: '06 12 34 56 78' },
    { sorte: 'email', libelle: null, valeur: 'jean@dupont.fr', affichage: null }],
};
const SYNDIC: ContactSource = {
  cle: 'syndic_contact:9', famille: 'syndic_immeuble', nom: 'M. GESTION Paul', qualite: 'Gestionnaire',
  organisation: 'Cabinet LOISEAU', adresse: '3 rue du Syndic, 75011 Paris',
  coordonnees: [{ sorte: 'telephone', libelle: 'Standard du cabinet', valeur: '0140000000', affichage: null }],
};
const ANCIEN: ContactSource = {
  cle: 'locataire:45', famille: 'locataire', nom: 'Mme MARTIN Claire', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'telephone', libelle: 'Portable', valeur: '0700000000', affichage: null }],
};

let sources: ContactSource[];
let envois: { url: string; method: string; corps: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sources = [PROPRIO, SYNDIC];
  envois = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entree);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') {
      envois.push({ url, method, corps: JSON.parse(String(init?.body)) });
      return Response.json({ etat: 'ok', id: 7, message: 'ok' });
    }
    if (url.includes('/taches/collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 1, libelle: 'Arno Jorel' }], moi: 1 });
    if (url.includes('/biens/evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: sources });
    if (url.endsWith('/taches/7')) {
      return Response.json({
        etat: 'ok',
        tache: {
          id: 7, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union, Paris', evenement: null, objet: 'Visite',
          note: 'Passer avec les clés', jour: '2026-10-15', heure: null, rappels: [], etat: 'a_faire', confieeA: 1,
          confieeALibelle: 'Arno Jorel', creeLe: '2026-10-01T08:00:00Z', creeParLibelle: 'A', majLe: '2026-10-01T08:00:00Z',
          faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 2,
        },
        traces: [],
        contacts: [
          // Copié avec un ANCIEN numéro : la fiche a changé depuis.
          { ...PROPRIO, coordonnees: [{ sorte: 'telephone', libelle: 'Mobile', valeur: '0611111111', affichage: null },
            PROPRIO.coordonnees[1]], copieLe: '2026-10-01T08:00:00Z' },
          // Locataire sorti : il n'est plus dans la fiche, sa copie reste.
          { ...ANCIEN, copieLe: '2026-10-01T08:00:00Z' },
        ],
      });
    }
    return Response.json({});
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const cases = () => [...container.querySelectorAll<HTMLInputElement>('.tchc-case input')];
const caseDe = (nom: string) => [...container.querySelectorAll<HTMLLabelElement>('.tchc-case')]
  .find((l) => l.textContent?.includes(nom))?.querySelector('input') as HTMLInputElement;
const bloc = () => container.querySelector('[data-bloc-contacts]')?.textContent ?? '';
const note = () => container.querySelector('textarea') as HTMLTextAreaElement;

const taperNote = async (texte: string) => {
  const t = note();
  const poser = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => { poser?.call(t, texte); t.dispatchEvent(new Event('input', { bubbles: true })); });
};

describe('🔴 création : choisir des contacts du bien', () => {
  const monter = async (onEcrire = vi.fn()) => {
    await act(async () => {
      root.render(createElement(FenetreTache, {
        mode: { sorte: 'creer', lotId: 10, lotCle: '315', adresse: '7 avenue de l’Union, Paris' }, onFermer: () => {}, onEcrire,
      }));
    });
    await calmer();
  };

  it('la section est entre « Événement du bien lié » et « Rappels », groupée par famille aux couleurs du bloc PARTIES', async () => {
    await monter();
    const corps = container.querySelector('.tchf-corps') as HTMLElement;
    const texte = corps.textContent ?? '';
    const ev = texte.indexOf('Événement du bien lié');
    const contacts = texte.indexOf('Contacts de la tâche');
    const rappels = texte.indexOf('Rappels');
    expect(ev).toBeGreaterThan(-1);
    expect(contacts).toBeGreaterThan(ev);
    expect(rappels).toBeGreaterThan(contacts);
    expect(container.querySelector('[data-famille="proprietaire"]')?.className).toContain('tchc-groupe--rouge');
    expect(container.querySelector('[data-famille="syndic_immeuble"]')?.className).toContain('tchc-groupe--rose');
    // Aucun coché par défaut, et pas de recherche à deux contacts.
    expect(cases().map((c) => c.checked)).toEqual([false, false]);
    expect(container.querySelector('.tchc-recherche')).toBeNull();
    expect(bloc()).toBe('');
  });

  it('🔴 cocher et décocher refait le bloc « Contacts » sans jamais toucher la note', async () => {
    await monter();
    await taperNote('Passer avec les clés.\nSonner deux fois.');
    await act(async () => { caseDe('DUPONT').click(); });
    expect(bloc()).toContain('M. DUPONT Jean · Propriétaire');
    expect(bloc()).toContain('Mobile : 06 12 34 56 78');
    await act(async () => { caseDe('GESTION').click(); });
    expect(bloc()).toContain('Cabinet : Cabinet LOISEAU');
    expect(bloc()).toContain('Adresse : 3 rue du Syndic, 75011 Paris');
    await act(async () => { caseDe('DUPONT').click(); });
    expect(bloc()).not.toContain('DUPONT');
    expect(note().value).toBe('Passer avec les clés.\nSonner deux fois.');

    const creer = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Créer la tâche') as HTMLButtonElement;
    const objet = container.querySelector('input[type="text"]') as HTMLInputElement;
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { poser?.call(objet, 'Visite'); objet.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { creer.click(); });
    await calmer();
    expect(envois).toHaveLength(1);
    expect(envois[0].corps).toMatchObject({ lotId: 10, note: 'Passer avec les clés.\nSonner deux fois.', contacts: ['syndic_contact:9'] });
  });

  it('au-delà de 8 contacts, un petit champ de recherche filtre la liste', async () => {
    sources = Array.from({ length: 9 }, (_, i) => ({ ...PROPRIO, cle: `carte:${i}`, nom: `Contact ${i}` }));
    sources.push({ ...SYNDIC });
    await monter();
    const recherche = container.querySelector('.tchc-recherche') as HTMLInputElement;
    expect(recherche).not.toBeNull();
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { poser?.call(recherche, 'loiseau'); recherche.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(cases()).toHaveLength(1);
  });
});

describe('🔴 détail : copie datée, « Mettre à jour », liens', () => {
  it('« Coordonnées modifiées depuis » + « Mettre à jour » ; contact retiré du bien toujours lisible ; tel: et Nouveau message', async () => {
    const onEcrire = vi.fn();
    const onFermer = vi.fn();
    await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'detail', id: 7 }, onFermer, onEcrire })); });
    await calmer();
    await calmer();
    const proprio = container.querySelector('[data-contact="proprietaire:12"]') as HTMLElement;
    const ancien = container.querySelector('[data-contact="locataire:45"]') as HTMLElement;
    expect(proprio.getAttribute('data-etat-copie')).toBe('modifie');
    expect(proprio.textContent).toContain('Coordonnées modifiées depuis');
    // 🔴 Le contact sorti du bien reste lisible, avec SES coordonnées d'alors.
    expect(ancien.getAttribute('data-etat-copie')).toBe('plus_lie');
    expect(ancien.textContent).toContain('0700000000');
    expect(ancien.querySelector('a')?.getAttribute('href')).toBe('tel:0700000000');
    // Il reste aussi coché dans la liste de choix, avec la mention.
    expect(caseDe('MARTIN').checked).toBe(true);
    expect(container.textContent).toContain('n’est plus lié à ce bien');

    await act(async () => {
      ([...proprio.querySelectorAll('button')].find((b) => b.textContent === 'Mettre à jour') as HTMLButtonElement).click();
    });
    await calmer();
    expect(envois.at(-1)).toMatchObject({ method: 'PATCH', corps: { geste: 'actualiserContact', cle: 'proprietaire:12' } });

    // L'e-mail ouvre le composeur « Nouveau message » (callback), la fenêtre se ferme ; aucun envoi n'est fait.
    const avant = envois.length;
    await act(async () => { (proprio.querySelector('.tchc-lien-bouton') as HTMLButtonElement).click(); });
    expect(onEcrire).toHaveBeenCalledWith('jean@dupont.fr');
    expect(onFermer).toHaveBeenCalled();
    expect(envois).toHaveLength(avant);
  });
});
