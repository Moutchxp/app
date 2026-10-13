// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonSyndic } from './BoutonSyndic';
import { cleImmeuble } from '../../../../lib/gestion/syndics';

/**
 * ══ 🔴🔴 LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE — LA FICHE EST COMMUNE, À L'ÉCRAN ════════════════════════════════════════
 * Un faux serveur À ÉTAT (un seul syndic, un seul carnet par copropriété) : ce qu'un bien écrit, l'autre le relit.
 * 🔒 Données de banc (`fetch` simulé) : rien n'est lu ni écrit en base.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOTS_CAVELL = [{ id: 1, numero: '219', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }, { id: 2, numero: '220', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }];
const LOTS_HEBERT = [{ id: 3, numero: '373', adresse: '15 rue Carle Hebert', commune: 'Courbevoie' }];
const FICHE = {
  id: 11, nom: '_BANC Cabinet', adresse: '1 rue _BANC', codePostal: '75001', ville: 'Paris', telephone: '0100000000', telephone2: null,
  email: 'standard@banc.invalid', note: null, creeLe: '2026-10-12T10:00:00Z', creeParLibelle: 'banc', majLe: null, majParLibelle: null,
  contacts: [{ id: 4, civilite: 'Mme', titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', tousImmeubles: false,
    immeubles: ['25 rue edith cavell'], coordonnees: [{ id: 5, sorte: 'email', libelle: null, valeur: 'lea@banc.invalid' }] }],
  coproprietes: [
    { id: 6, cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: LOTS_CAVELL },
    { id: 7, cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: LOTS_HEBERT },
  ],
  historique: [],
  /* LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — un ancien contact « ne travaille plus ici » (banc). */
  anciens: [{ id: 9, titre: 'Comptable', prenom: 'Paul', nom: 'Loge', civilite: 'M.', partiLe: '2026-09-30 18:00:00+02',
    coordonnees: [{ sorte: 'email', libelle: null, valeur: 'paul.ancien@banc.invalid' }] }],
};
const SYNDIC = { id: 11, nom: '_BANC Cabinet', ville: 'Paris' };
const IMMEUBLES = [
  { cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie', syndic: SYNDIC, lots: LOTS_CAVELL },
  { cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', syndic: SYNDIC, lots: LOTS_HEBERT },
];

/** LE FAUX SERVEUR : un carnet par copropriété — une seule vérité, partagée par tous ses biens. */
let carnets: Record<string, Array<Record<string, unknown>>> = {};
let puts: Array<Record<string, unknown>> = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  carnets = { '25 rue edith cavell': [], '15 rue carle hebert': [] };
  puts = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const methode = init?.method ?? 'GET';
    const corps = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    const rep = (j: unknown) => ({ ok: true, json: async () => j });
    if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: IMMEUBLES });
    if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) {
      const cle = cleImmeuble(new URL(url, 'http://x').searchParams.get('immeuble'));
      return rep({ etat: 'ok', contacts: carnets[cle] ?? [] });
    }
    if (url.startsWith('/api/admin/gestion/syndics/11') && methode === 'GET') return rep({ etat: 'ok', fiche: FICHE });
    if (url === '/api/admin/gestion/syndics/11' && methode === 'PUT') {
      puts.push(corps ?? {});
      const ci = corps?.contactsImmeuble as { immeuble: string; contacts: Array<Record<string, unknown>> } | undefined;
      if (ci) {
        carnets[cleImmeuble(ci.immeuble)] = ci.contacts.map((c, i) => ({
          id: 100 + i, categorie: c.categorie, libelle: c.libelle || null, civilite: c.civilite, prenom: c.prenom || null,
          nom: c.nom || null, note: null, coordonnees: [] }));
      }
      return rep({ ok: true, id: 11 });
    }
    return rep({ etat: 'ok', disponible: true, syndics: [], communes: [], adresses: [] });
  }));
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async (): Promise<void> => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const attendre = async (ms: number): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); await calmer(); };
const cliquer = async (el: Element | null | undefined): Promise<void> => {
  if (!el) throw new Error('élément introuvable');
  await act(async () => { (el as HTMLElement).click(); }); await calmer();
};
const bouton = (texte: string, zone: ParentNode = document): HTMLButtonElement => {
  const b = [...zone.querySelectorAll('button')].find((x) => x.textContent?.trim() === texte);
  if (!b) throw new Error(`bouton introuvable : ${texte}`);
  return b as HTMLButtonElement;
};
const taper = async (el: HTMLInputElement, v: string): Promise<void> => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => { setter?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const monter = async (lotId: number, immeuble: string): Promise<void> => {
  const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
  await act(async () => { await rafraichirImmeubles(); });
  await act(async () => { root.render(createElement(BoutonSyndic, { immeuble, lotId, key: `lot-${lotId}` })); });
  await calmer();
};
const ouvrir = async (): Promise<void> => { await cliquer(document.querySelector('button.bsy')); await attendre(10); };

describe('🔴🔴 RÈGLE 2 et 4 — un gardien ajouté depuis le bien A paraît sur le bien B du même immeuble', () => {
  it('ajout depuis A (avertissement « 2 biens de l’immeuble »), puis relu depuis B — sans rien recopier', async () => {
    await monter(1, '25 rue Edith Cavell');
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(bouton('Habitant / gardien de l’immeuble'));
    const edit = document.querySelector('.fsy-contact-edit') as HTMLElement;
    await cliquer(bouton('Gardien', edit.querySelector('[aria-label="Catégorie"]') as Element));
    const nom = [...edit.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await taper(nom, 'Loge');
    await cliquer(bouton('Valider', edit));
    const pas = document.querySelector('.fsy-pied .svv-btn-primary');
    if (pas?.textContent?.trim() === 'Valider quand même') await cliquer(pas);
    await cliquer(bouton('Valider', document.querySelector('.fsy-pied') as Element));
    /* RÈGLE 4 : depuis un bien, la fiche commune l'annonce — niveau copropriété, ses 2 biens. */
    expect(document.querySelector('.fsy-partage')?.textContent)
      .toContain('Cette modification s’appliquera aux 2 biens rattachés à cette fiche (copropriété : 2 biens de l’immeuble).');
    expect(puts).toHaveLength(0);
    await cliquer(bouton('Enregistrer', document.querySelector('.fsy-partage') as Element));
    /* Le contact d'immeuble encore ouvert : la question existante « Enregistrer le nouveau contact … ? » suit. */
    if (document.querySelector('.fsy-pied')?.textContent?.includes('Enregistrer le nouveau contact')) {
      await cliquer(bouton('Oui', document.querySelector('.fsy-pied') as Element));
    }
    expect(puts).toHaveLength(1);
    /* UNE écriture, sur la copropriété (le carnet de l'immeuble) — jamais sur le bien. */
    expect((puts[0].contactsImmeuble as { immeuble: string }).immeuble).toBe('25 rue Edith Cavell');
    expect(carnets['25 rue edith cavell']).toHaveLength(1);

    /* Le bien B du même immeuble : la même fiche, le même carnet. */
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    await monter(2, '25 rue Edith Cavell');
    await ouvrir();
    expect(document.querySelector('.fsy')?.textContent).toContain('LOGE');
    expect(document.querySelector('.fsy')?.textContent).toContain('Gardien');
  });
  it('un bien d’un AUTRE immeuble du même cabinet ne voit JAMAIS ce gardien (le carnet appartient à sa copropriété)', async () => {
    carnets['25 rue edith cavell'] = [{ id: 100, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: null, nom: 'Loge', note: null, coordonnees: [] }];
    await monter(3, '15 rue Carle Hebert');
    await ouvrir();
    expect(document.querySelector('.fsy')?.textContent).not.toContain('LOGE');
    /* RÈGLE 1 : les coordonnées du cabinet, elles, sont les mêmes. */
    expect(document.querySelector('.fsy')?.textContent).toContain('_BANC Cabinet');
  });
});

describe('🔴🔴 RÈGLE 1 et 4 — une modification du CABINET s’annonce à tous les biens du cabinet', () => {
  it('l’e-mail générique modifié depuis un bien : « 3 biens du cabinet »', async () => {
    await monter(1, '25 rue Edith Cavell');
    await ouvrir();
    await taper(document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLInputElement, 'nouveau@banc.invalid');
    await cliquer(bouton('Valider', document.querySelector('.fsy-pied') as Element));
    expect(document.querySelector('.fsy-partage')?.textContent)
      .toContain('Cette modification s’appliquera aux 3 biens rattachés à cette fiche (cabinet : 3 biens du cabinet).');
    await cliquer(bouton('Revenir', document.querySelector('.fsy-partage') as Element));
    expect(puts).toHaveLength(0);
  });
});

describe('🔴🔴 LOT RETRAIT-FICHE-PARTAGEE — la mention « Fiche partagée » n’est plus affichée (accord d’Arno)', () => {
  it('plus de ligne « Fiche partagée … » ni de bulle « Autres immeubles du cabinet » ; le bouton du syndic reste et ouvre sa fiche', async () => {
    await monter(1, '25 rue Edith Cavell');
    expect(document.body.textContent).not.toContain('Fiche partagée');
    expect(document.body.textContent).not.toContain('Autres immeubles du cabinet');
    expect(document.querySelector('.bsy-partage, .bsy-partage-mot, .bsy-partage-bulle')).toBeNull();
    const syndic = document.querySelector('button.bsy') as HTMLButtonElement;
    expect(syndic).not.toBeNull();
    expect(syndic.className).toContain('bsy--connu');
    await act(async () => { syndic.click(); });
    for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('.fsy')).not.toBeNull(); // la fiche syndic s'ouvre, comme avant
  });
  it('un bien seul dans son immeuble : rien non plus', async () => {
    await monter(3, '15 rue Carle Hebert');
    expect(document.body.textContent).not.toContain('Fiche partagée');
  });
});

describe('🔴🔴 LOT PARTAGE-CABINET-IMMEUBLE-ET-FUSION-CONTACTS-RETOUR — « Réintégrer » plutôt que recréer', () => {
  const saisirNouveau = async (choix: string): Promise<HTMLElement> => {
    await monter(1, '25 rue Edith Cavell');
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(bouton(choix));
    const edit = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const champ = (l: string) => [...edit.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === l)?.querySelector('input') as HTMLInputElement;
    if (choix.startsWith('Habitant')) await cliquer(bouton('Gardien', edit.querySelector('[aria-label="Catégorie"]') as Element));
    await taper(champ('Prénom'), 'paul');
    await taper(champ('Nom'), 'LOGÉ');
    await cliquer(bouton('Valider', edit));
    const pas = edit.querySelector('.svv-btn-primary');
    if (pas?.textContent?.trim() === 'Valider quand même') await cliquer(pas);
    return edit;
  };
  it('contact syndic : AVANT la création, la proposition ; « Réintégrer » remet la fiche #9 en poste (aucun nouveau contact)', async () => {
    await saisirNouveau('Contact du syndic de copropriété');
    const prop = document.querySelector('.fsy-retour');
    expect(prop?.textContent).toContain('M. Paul LOGE a travaillé ici jusqu’au 30/09/2026 — Réintégrer cette personne ?');
    await cliquer(bouton('Réintégrer', prop as Element));
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    await cliquer(bouton('Valider', document.querySelector('.fsy-pied') as Element));
    if (document.querySelector('.fsy-partage')) await cliquer(bouton('Enregistrer', document.querySelector('.fsy-partage') as Element));
    const contacts = (puts[0]?.contacts ?? []) as Array<{ id: number | null; nom: string; reintegre?: boolean; immeubles: string[] }>;
    expect(contacts.filter((c) => c.nom === 'Loge')).toEqual([expect.objectContaining({ id: 9, reintegre: true, immeubles: ['25 rue edith cavell'] })]);
    expect(contacts.some((c) => c.id === null)).toBe(false);
  });
  it('« Non, c’est une autre personne » : le contact est créé, comme avant', async () => {
    await saisirNouveau('Contact du syndic de copropriété');
    await cliquer(bouton('Non, c’est une autre personne', document.querySelector('.fsy-retour') as Element));
    expect(document.querySelector('.fsy-retour')).toBeNull();
    await cliquer(bouton('Valider', document.querySelector('.fsy-pied') as Element));
    if (document.querySelector('.fsy-partage')) await cliquer(bouton('Enregistrer', document.querySelector('.fsy-partage') as Element));
    const contacts = (puts[0]?.contacts ?? []) as Array<{ id: number | null; nom: string; reintegre?: boolean }>;
    expect(contacts.some((c) => c.id === null && c.nom.toLowerCase().startsWith('log'))).toBe(true);
    expect(contacts.some((c) => c.id === 9)).toBe(false);
  });
  it('habitant / gardien : la même proposition, avant la création', async () => {
    await saisirNouveau('Habitant / gardien de l’immeuble');
    expect(document.querySelector('.fsy-retour')?.textContent).toContain('a travaillé ici jusqu’au 30/09/2026');
  });
});
