// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FicheSyndic } from './FicheSyndic';
import { BoutonSyndic } from './BoutonSyndic';

/**
 * LOT FICHE-SYNDIC-FINITIONS — LES GESTES DE LA FICHE, MONTÉE POUR DE VRAI (jsdom, réseau simulé).
 *
 * ⚠️ JSDOM NE MESURE RIEN (aucune mise en page) : la compacité et l'alignement des boutons sont tenus par les
 * garanties sur la feuille de style (`annuaireSyndics.test.ts`). Ici on éprouve ce que l'on FAIT : Annuler /
 * Valider, l'abandon confirmé, le contact replié, le second standard, la frappe par paires, l'auto-complétion
 * (portefeuille puis BAN locale), la reprise confirmée d'une copropriété, la suppression confirmée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FICHE = {
  id: 11, nom: '_TEST Cabinet', adresse: '1 rue A', codePostal: '75001', ville: 'Paris', telephone: '0100000000', telephone2: null,
  email: 'standard@test.invalid', note: null, creeLe: '2026-10-10T10:00:00Z', creeParLibelle: 'arno', majLe: null, majParLibelle: null,
  contacts: [{ id: 4, titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand',
    coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }] }],
  coproprietes: [{ id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10',
    lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Courbevoie' }] }],
  historique: [],
};
const IMMEUBLES = [
  { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', syndic: { id: 11, nom: '_TEST Cabinet' },
    lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Courbevoie' }] },
  { cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie',
    syndic: { id: 99, nom: '_TEST Autre Syndic' },
    lots: [{ id: 2, numero: '201', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }, { id: 3, numero: '202', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }] },
];

let appels: Array<{ url: string; methode: string; corps: unknown }> = [];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(String(init.body)) : null });
    const rep = (j: unknown) => ({ ok: true, json: async () => j });
    if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: IMMEUBLES });
    if (url.startsWith('/api/admin/gestion/syndics/adresses')) {
      return rep({ etat: 'ok', adresses: url.includes('7%20rue%20test') ? [{ cle: '7 rue test', libelle: '7 Rue Test', codePostal: '92400', commune: 'Courbevoie' }] : [] });
    }
    if (url === '/api/admin/gestion/syndics/11' && (init?.method ?? 'GET') === 'GET') return rep({ etat: 'ok', fiche: FICHE });
    if (url === '/api/admin/gestion/syndics/12' && (init?.method ?? 'GET') === 'GET') {
      return rep({ etat: 'ok', fiche: { ...FICHE, id: 12, codePostal: null, ville: null } });
    }
    if (url.startsWith('/api/admin/gestion/syndics/communes')) return rep({ etat: 'ok', communes: url.endsWith('92400') ? ['Courbevoie'] : [] });
    if (url === '/api/admin/gestion/syndics/11') return rep({ ok: true, id: 11, coproprietes: 1 });
    if (url === '/api/admin/gestion/syndics' && init?.method === 'POST') return rep({ ok: true, id: 13 });
    if (url.startsWith('/api/admin/gestion/syndics')) return rep({ etat: 'ok', disponible: true, syndics: [] });
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
const cliquer = async (el: Element): Promise<void> => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const taper = async (el: HTMLInputElement, v: string): Promise<void> => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => { setter?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await calmer();
};
const champ = (label: string): HTMLInputElement => {
  const l = [...document.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === label);
  const i = l?.querySelector('input');
  if (!i) throw new Error(`champ introuvable : ${label}`);
  return i as HTMLInputElement;
};

async function ouvrir(onFerme = vi.fn(), syndicId: number | null = 11, onEcrire?: (e: string) => void): Promise<ReturnType<typeof vi.fn>> {
  await act(async () => { root.render(createElement(FicheSyndic, { syndicId, onFerme, onEcrire })); });
  await calmer();
  return onFerme;
}

describe('la fiche syndic — Annuler / Valider, pied toujours là', () => {
  it('le pied porte Annuler et Valider, HORS de la zone qui défile', async () => {
    await ouvrir();
    const pied = document.querySelector('.fsy-pied');
    expect(pied?.textContent).toContain('Annuler');
    expect(pied?.textContent).toContain('Valider');
    expect(document.querySelector('.fsy-corps')?.contains(pied as Node)).toBe(false);
  });

  it('Annuler sans rien changer ferme ; avec un changement, demande « Abandonner les modifications ? »', async () => {
    const onFerme = await ouvrir();
    await taper(champ('Nom du cabinet *'), '_TEST Cabinet modifié');
    await cliquer(bouton('×'));
    expect(onFerme).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Abandonner les modifications ?');
    await cliquer(bouton('Oui, abandonner'));
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('Valider enregistre (PUT, numéros EN CHIFFRES) PUIS ferme', async () => {
    const onFerme = await ouvrir();
    await taper(champ('Nom du cabinet *'), '_TEST Cabinet 2');
    await cliquer(bouton('Valider'));
    const put = appels.find((a) => a.methode === 'PUT');
    expect(put?.corps).toMatchObject({ nom: '_TEST Cabinet 2', telephone: '0100000000', telephone2: '' });
    expect(onFerme).toHaveBeenCalledTimes(1);
  });
});

describe('les contacts — repliés, « Modifier », « Valider ce contact »', () => {
  it('un contact existant arrive replié en une ligne ; Modifier le rouvre ; Valider ce contact le replie', async () => {
    await ouvrir();
    const ligne = document.querySelector('.fsy-contact-replie')?.textContent ?? '';
    expect(ligne).toContain('Responsable de copropriété');
    expect(ligne).toContain('Léa DURAND');
    expect(ligne).toContain('06 13 86 18 77');
    await cliquer(bouton('Modifier'));
    expect(document.querySelector('.fsy-contact-edit')).not.toBeNull();
    await cliquer(bouton('Valider ce contact'));
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    expect(document.querySelector('.fsy-contact-replie')).not.toBeNull();
  });

  it('« + Ajouter un contact » ouvre un bloc DÉPLIÉ', async () => {
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    expect(document.querySelectorAll('.fsy-contact-edit')).toHaveLength(1);
  });
});

describe('les téléphones du standard', () => {
  it('par paires pendant la frappe ; « + » ajoute un second numéro, deux au plus', async () => {
    await ouvrir();
    const premier = document.querySelector('input[aria-label="Téléphone standard"]') as HTMLInputElement;
    await taper(premier, '0613861877');
    expect(premier.value).toBe('06 13 86 18 77');
    await cliquer(document.querySelector('button[aria-label="Ajouter un second numéro de standard"]') as Element);
    expect(document.querySelectorAll('.fsy-ligne-tel')).toHaveLength(2);
    expect(document.querySelector('button[aria-label="Ajouter un second numéro de standard"]')).toBeNull();
    const second = document.querySelector('input[aria-label="Second téléphone standard"]') as HTMLInputElement;
    await taper(second, '+33612345678');
    expect(second.value).toBe('+33 6 12 34 56 78');
  });
});

describe('les copropriétés — adresse complète, auto-complétion, reprise confirmée', () => {
  it('une copropriété s\'affiche « 12 rue X, 92400 Courbevoie »', async () => {
    await ouvrir();
    expect(document.querySelector('.fsy-copro')?.textContent).toContain('12 rue X, 92400 Courbevoie');
  });

  it('dès 2 caractères : le portefeuille, avec « N biens en gestion » et « déjà rattachée à … » ; la prise se confirme', async () => {
    await ouvrir();
    await taper(champ('+ Ajouter une copropriété (immeuble)'), '25');
    const prop = [...document.querySelectorAll('.fsy-proposition')].map((p) => p.textContent ?? '');
    expect(prop[0]).toContain('25 rue Edith Cavell, 92400 Courbevoie');
    expect(prop[0]).toContain('2 biens en gestion à cette adresse');
    expect(prop[0]).toContain('déjà rattachée à _TEST Autre Syndic');
    await cliquer(document.querySelector('.fsy-proposition') as Element);
    expect(document.body.textContent).toContain('La prendre ?');
    await cliquer(bouton('Oui, la prendre'));
    expect([...document.querySelectorAll('.fsy-copro')].map((c) => c.textContent).join()).toContain('25 rue Edith Cavell, 92400 Courbevoie');
    expect(document.body.textContent).toContain('Changement de syndic à la validation');
  });

  it('hors portefeuille : la BAN LOCALE, « aucun bien en gestion à cette adresse »', async () => {
    await ouvrir();
    await taper(champ('+ Ajouter une copropriété (immeuble)'), '7 rue test');
    await attendre(300);
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/syndics/adresses?q=7%20rue%20test'))).toBe(true);
    const prop = [...document.querySelectorAll('.fsy-proposition')].map((p) => p.textContent ?? '');
    expect(prop.join()).toContain('7 Rue Test, 92400 Courbevoie');
    expect(prop.join()).toContain('aucun bien en gestion à cette adresse');
    expect(appels.some((a) => a.url.includes('data.gouv.fr'))).toBe(false);
  });
});

describe('supprimer ce syndic', () => {
  it('lien discret → confirmation qui liste les biens → DELETE → ferme', async () => {
    const onFerme = await ouvrir();
    await cliquer(bouton('Supprimer ce syndic'));
    const conf = document.querySelector('.fsy-supprimer')?.textContent ?? '';
    expect(conf).toContain('1 bien perdra ce syndic');
    expect(conf).toContain('lot 101');
    expect(appels.some((a) => a.methode === 'DELETE')).toBe(false);
    await cliquer(bouton('Oui, supprimer ce syndic'));
    expect(appels.find((a) => a.methode === 'DELETE')?.url).toBe('/api/admin/gestion/syndics/11');
    expect(onFerme).toHaveBeenCalledTimes(1);
  });
});

describe('le bouton de la carte bien', () => {
  it('affiche le NOM du syndic (entier au survol) ; sinon « Créer le syndic »', async () => {
    await act(async () => {
      root.render(createElement('div', null,
        createElement(BoutonSyndic, { immeuble: '25 rue Edith Cavell' }),
        createElement(BoutonSyndic, { immeuble: '99 rue Inconnue' })));
    });
    await calmer();
    const [connu, inconnu] = [...container.querySelectorAll('button.bsy')] as HTMLButtonElement[];
    expect(connu.textContent).toBe('_TEST Autre Syndic');
    expect(connu.title).toBe('Syndic : _TEST Autre Syndic');
    expect(connu.className).toContain('bsy--connu');
    expect(connu.querySelector('.bsy-mot')).not.toBeNull();
    expect(inconnu.textContent).toBe('Créer le syndic');
    expect(inconnu.className).not.toContain('bsy--connu');
    expect(connu.closest('.bsy-ligne')).not.toBeNull();
  });
});

describe('LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — coordonnées générales, autres contacts, adresse obligatoire', () => {
  it('la ligne en DOUBLON sous l\'e-mail a disparu ; « Écrire depuis gestion@ » est au bout du champ, « Appeler » au bout du numéro', async () => {
    await ouvrir(vi.fn(), 11, vi.fn());
    expect(document.querySelector('.fsy-liens')).toBeNull();
    const ligneEmail = (document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLElement).closest('.fsy-ligne-champ');
    expect(ligneEmail?.textContent).toContain('Écrire depuis gestion@');
    const ligneTel = (document.querySelector('input[aria-label="Téléphone standard"]') as HTMLElement).closest('.fsy-ligne-tel');
    const appeler = [...(ligneTel?.querySelectorAll('a') ?? [])].find((a) => a.textContent === 'Appeler');
    expect(appeler?.getAttribute('href')).toBe('tel:0100000000');
  });

  it('un e-mail invalide n\'a pas de lien ; un numéro incomplet n\'a pas d\'« Appeler »', async () => {
    await ouvrir(vi.fn(), 11, vi.fn());
    await taper(document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLInputElement, 'pas-un-mail');
    expect(document.querySelector('.fsy-ligne-champ')?.textContent).not.toContain('Écrire');
    await taper(document.querySelector('input[aria-label="Téléphone standard"]') as HTMLInputElement, '01 23');
    expect(document.querySelector('.fsy-ligne-tel')?.textContent).not.toContain('Appeler');
  });

  it('« AUTRES CONTACTS » : titre · Prénom NOM, puis le numéro avec « Appeler » sur sa ligne', async () => {
    await ouvrir(vi.fn(), 11, vi.fn());
    const titres = [...document.querySelectorAll('.fsy-sous-titre')].map((h) => h.textContent);
    expect(titres).toContain('Autres contacts');
    const replie = document.querySelector('.fsy-contact-replie') as HTMLElement;
    expect(replie.querySelector('.fsy-contact-ligne')?.textContent).toBe('Responsable de copropriété · Léa DURAND');
    const coord = replie.querySelector('.fsy-contact-coord')?.textContent ?? '';
    expect(coord).toContain('06 13 86 18 77');
    expect(coord).toContain('Appeler');
  });

  it('« Valider » REFUSE sans adresse complète : message près du bouton, champs vides cerclés, rien n\'est envoyé', async () => {
    const onFerme = await ouvrir(vi.fn(), null);
    await cliquer(bouton('Créer un nouveau syndic'));
    await taper(champ('Nom du cabinet *'), '_TEST Cabinet');
    await cliquer(bouton('Valider'));
    expect(appels.some((a) => a.methode === 'POST')).toBe(false);
    expect(onFerme).not.toHaveBeenCalled();
    expect(document.querySelector('.fsy-pied')?.textContent).toContain('Complétez l’adresse du syndic');
    expect(document.querySelectorAll('.fsy-champ--manque')).toHaveLength(3);
    await taper(champ('Adresse (rue) *'), '1 rue _TEST');
    await taper(champ('Code postal *'), '92400');
    await cliquer(bouton('Courbevoie'));
    expect(champ('Ville *').value).toBe('Courbevoie');
    await cliquer(bouton('Valider'));
    expect(appels.find((a) => a.methode === 'POST')?.corps).toMatchObject({ adresse: '1 rue _TEST', codePostal: '92400', ville: 'Courbevoie' });
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('un syndic EXISTANT sans code postal ni ville reste consultable ; l\'obligation vaut à la prochaine modification', async () => {
    const onFerme = await ouvrir(vi.fn(), 12);
    expect(document.body.textContent).toContain('Complétez code postal et ville');
    await cliquer(bouton('Valider'));
    expect(appels.some((a) => a.methode === 'PUT')).toBe(false);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });
});
