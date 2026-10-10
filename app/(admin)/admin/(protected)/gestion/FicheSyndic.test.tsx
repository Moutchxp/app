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
/** L'API Adresse en panne (pour éprouver le repli sur la BAN locale). */
let apiEnPanne = false;
/** Ce que rend l'API Adresse, selon la saisie : de vraies formes de réponse (name / postcode / city). */
const API_ADRESSE: Record<string, Array<{ name: string; postcode: string; city: string }>> = {
  '8 Rue Denfert Rochereau': [
    { name: '8 Rue Denfert-Rochereau', postcode: '92100', city: 'Boulogne-Billancourt' },
    { name: '8 Rue Denfert-Rochereau', postcode: '69004', city: 'Lyon' },
    { name: '8 Avenue Denfert-Rochereau', postcode: '75014', city: 'Paris' },
  ],
  '7 rue test': [{ name: '7 Rue Test', postcode: '92400', city: 'Courbevoie' }],
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  appels = []; apiEnPanne = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    appels.push({ url, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(String(init.body)) : null });
    const rep = (j: unknown) => ({ ok: true, json: async () => j });
    if (url.startsWith('https://api-adresse.data.gouv.fr/search/')) {
      if (apiEnPanne) throw new TypeError('Failed to fetch');
      const q = new URL(url).searchParams.get('q') ?? '';
      return rep({ features: (API_ADRESSE[q] ?? []).map((properties) => ({ properties })) });
    }
    if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: IMMEUBLES });
    if (url.startsWith('/api/admin/gestion/syndics/adresses')) {
      return rep({ etat: 'ok', adresses: url.includes('7%20rue%20test') ? [{ cle: '7 rue test', libelle: '7 Rue Test', codePostal: '92400', commune: 'Courbevoie' }] : [] });
    }
    if (url === '/api/admin/gestion/syndics/11' && (init?.method ?? 'GET') === 'GET') return rep({ etat: 'ok', fiche: FICHE });
    if (url === '/api/admin/gestion/syndics/14' && (init?.method ?? 'GET') === 'GET') {
      return rep({ etat: 'ok', fiche: { ...FICHE, id: 14, adresse: '8 Rue Denfert Rochereau', codePostal: null, ville: null } });
    }
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
/** Un bouton par son texte exact, DANS une zone (le pied et un contact ont chacun leur « Valider »). */
const boutonDans = (zone: Element | null, texte: string): HTMLButtonElement => {
  const b = [...(zone?.querySelectorAll('button') ?? [])].find((x) => x.textContent?.trim() === texte);
  if (!b) throw new Error(`bouton introuvable dans la zone : ${texte}`);
  return b as HTMLButtonElement;
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

  /* LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — CE QU'IL DISAIT AVANT : « la BAN LOCALE » et « aucun appel à
     data.gouv.fr ». Arno demande désormais la MÊME source que les fiches (l'API Adresse), la BAN locale en repli. */
  it('hors portefeuille : l\'API Adresse, « aucun bien en gestion à cette adresse »', async () => {
    await ouvrir();
    await taper(champ('+ Ajouter une copropriété (immeuble)'), '7 rue test');
    await attendre(300);
    expect(appels.some((a) => a.url.startsWith('https://api-adresse.data.gouv.fr/search/?q=7%20rue%20test'))).toBe(true);
    const prop = [...document.querySelectorAll('.fsy-proposition')].map((p) => p.textContent ?? '');
    expect(prop.join()).toContain('7 Rue Test, 92400 Courbevoie');
    expect(prop.join()).toContain('aucun bien en gestion à cette adresse');
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/syndics/adresses'))).toBe(false);
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

describe('LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — replié, ouvert en lecture, en modification', () => {
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  const bloc = (): Element | null => document.querySelector('.fsy-contact-edit');
  const champContact = (label: string): HTMLInputElement => {
    const l = [...(bloc()?.querySelectorAll('label') ?? [])].find((x) => x.querySelector('span')?.textContent === label);
    return l?.querySelector('input') as HTMLInputElement;
  };

  it('① REPLIÉ : « Prénom NOM · Titre » sur une ligne cliquable, avec ▸, SANS bouton « Modifier »', async () => {
    await ouvrir();
    const ligne = document.querySelector('button.fsy-contact-replie') as HTMLButtonElement;
    expect(ligne.textContent).toBe('Léa DURAND · Responsable de copropriété▸');
    expect(ligne.querySelector('strong')?.textContent).toBe('Léa DURAND');
    expect(ligne.querySelector('button')).toBeNull();
  });

  it('② un clic l\'OUVRE EN LECTURE : une ligne par téléphone, « Appeler » au bout ; Modifier / Supprimer / Fermer ; l\'en-tête le referme', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    const ouvert = document.querySelector('.fsy-contact-ouvert') as HTMLElement;
    expect(ouvert.querySelectorAll('input')).toHaveLength(0);
    const tel = ouvert.querySelector('.fsy-contact-coord')?.textContent ?? '';
    expect(tel).toBe('Portable :06 13 86 18 77Appeler');
    for (const t of ['Modifier', 'Supprimer ce contact', 'Fermer']) expect(boutonDans(ouvert, t)).toBeTruthy();
    await cliquer(ouvert.querySelector('.fsy-contact-tete-btn') as Element);
    expect(document.querySelector('.fsy-contact-ouvert')).toBeNull();
    expect(document.querySelector('button.fsy-contact-replie')).not.toBeNull();
  });

  it('③ « Modifier » : des champs ; le bouton « Modifier » DEVIENT « Valider » dès qu\'un champ change ; Valider revient en lecture', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    expect(boutonDans(bloc(), 'Modifier').disabled).toBe(true);
    await taper(champContact('Nom'), 'Martin');
    const v = boutonDans(bloc(), 'Valider');
    expect(v.className).toContain('svv-btn-primary');
    await cliquer(v);
    expect(bloc()).toBeNull();
    expect(document.querySelector('.fsy-contact-ouvert .fsy-contact-tete-btn')?.textContent).toContain('Léa MARTIN');
    await cliquer(boutonDans(pied(), 'Valider'));
    const put = appels.find((x) => x.methode === 'PUT')?.corps as { contacts: Array<{ nom: string }> };
    expect(put.contacts[0].nom).toBe('Martin');
  });

  it('« Annuler » une modification : « Abandonner les modifications ? », puis retour en lecture, inchangé', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await taper(champContact('Prénom'), 'Zoé');
    await cliquer(boutonDans(bloc(), 'Annuler'));
    expect(bloc()?.textContent).toContain('Abandonner les modifications ?');
    await cliquer(boutonDans(bloc(), 'Oui, abandonner'));
    expect(bloc()).toBeNull();
    expect(document.querySelector('.fsy-contact-ouvert')?.textContent).toContain('Léa DURAND');
  });

  it('« Annuler » sans changement revient en lecture SANS confirmation', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await cliquer(boutonDans(bloc(), 'Annuler'));
    expect(bloc()).toBeNull();
    expect(document.querySelector('.fsy-contact-ouvert')).not.toBeNull();
  });

  it('« Supprimer ce contact » : « Supprimer Léa DURAND ? » → retiré de la fiche (enregistré par Valider)', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Supprimer ce contact'));
    expect(document.body.textContent).toContain('Supprimer Léa DURAND ?');
    await cliquer(bouton('Oui, supprimer'));
    expect(document.querySelector('.fsy-contact-ouvert, .fsy-contact-replie')).toBeNull();
    await cliquer(boutonDans(pied(), 'Valider'));
    expect((appels.find((x) => x.methode === 'PUT')?.corps as { contacts: unknown[] }).contacts).toEqual([]);
  });

  it('NOUVEAU CONTACT : en modification, « Nouveau contact », sans « Retirer ce contact » ; refus sans nom ni titre ; Annuler le retire', async () => {
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    expect(bloc()?.querySelector('legend')?.textContent).toBe('Nouveau contact');
    expect(document.body.textContent).not.toContain('Retirer ce contact');
    await cliquer(boutonDans(bloc(), 'Valider'));
    expect(bloc()?.textContent).toContain('Indiquez au moins un prénom, un nom ou un titre.');
    await cliquer(boutonDans(bloc(), 'Annuler'));
    expect(bloc()).toBeNull();
    expect(document.querySelectorAll('button.fsy-contact-replie')).toHaveLength(1);
  });

  it('NOUVEAU CONTACT validé : il s\'affiche REPLIÉ dans la liste', async () => {
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(champContact('Prénom'), 'Marie');
    await taper(champContact('Nom'), 'Dupont');
    await cliquer(boutonDans(bloc(), 'Valider'));
    const lignes = [...document.querySelectorAll('button.fsy-contact-replie')].map((l) => l.querySelector('strong')?.textContent);
    expect(lignes).toEqual(['Léa DURAND', 'Marie DUPONT']);
  });

  it('UN SEUL contact en modification : en ouvrir un autre pendant une modification non enregistrée demande d\'abandonner', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await taper(champContact('Prénom'), 'Zoé');
    await cliquer(bouton('+ Ajouter un contact'));
    expect(document.body.textContent).toContain('Abandonner les modifications (Zoé DURAND) ?');
    expect(document.querySelectorAll('.fsy-contact-edit')).toHaveLength(1);
    await cliquer(bouton('Oui, abandonner'));
    expect(bloc()?.querySelector('legend')?.textContent).toBe('Nouveau contact');
  });

  it('« Valider » la FICHE pendant une modification non validée : « Valider aussi les modifications du contact … ? »', async () => {
    const onFerme = await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await taper(champContact('Nom'), 'Bernard');
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(pied()?.textContent).toContain('Valider aussi les modifications du contact Léa BERNARD ?');
    expect(appels.some((x) => x.methode === 'PUT')).toBe(false);
    await cliquer(boutonDans(pied(), 'Oui, valider aussi'));
    expect((appels.find((x) => x.methode === 'PUT')?.corps as { contacts: Array<{ nom: string }> }).contacts[0].nom).toBe('Bernard');
    expect(onFerme).toHaveBeenCalledTimes(1);
  });
});

describe('LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS', () => {
  const rue = (): HTMLInputElement => champ('Adresse (rue) *');
  const propositions = (): string[] => [...document.querySelectorAll('.fsy-proposition')].map((p) => p.textContent ?? '');

  it('LA CAUSE : une rue DÉJÀ ENREGISTRÉE (« 8 Rue Denfert Rochereau ») propose des adresses dès qu\'on entre dans le champ', async () => {
    await ouvrir(vi.fn(), 14);
    expect(rue().value).toBe('8 Rue Denfert Rochereau');
    await act(async () => { rue().focus(); });
    await attendre(300);
    expect(appels.some((a) => a.url.startsWith('https://api-adresse.data.gouv.fr/search/?q=8%20Rue%20Denfert%20Rochereau'))).toBe(true);
    expect(propositions()).toEqual([
      '8 Rue Denfert-Rochereau, 92100 Boulogne-Billancourt',
      '8 Rue Denfert-Rochereau, 69004 Lyon',
      '8 Avenue Denfert-Rochereau, 75014 Paris',
    ]);
  });

  it('un clic remplit les TROIS champs (rue, code postal, ville), qui restent modifiables', async () => {
    await ouvrir(vi.fn(), 14);
    await act(async () => { rue().focus(); });
    await attendre(300);
    await cliquer(document.querySelector('.fsy-proposition') as Element);
    expect([rue().value, champ('Code postal *').value, champ('Ville *').value]).toEqual(['8 Rue Denfert-Rochereau', '92100', 'Boulogne-Billancourt']);
    await taper(champ('Ville *'), 'Boulogne');
    expect(champ('Ville *').value).toBe('Boulogne');
  });

  it('une adresse de PARIS et une HORS ÎLE-DE-FRANCE sont proposées avec leur code postal', async () => {
    await ouvrir(vi.fn(), 14);
    await act(async () => { rue().focus(); });
    await attendre(300);
    await cliquer([...document.querySelectorAll('.fsy-proposition')][2]);
    expect([champ('Code postal *').value, champ('Ville *').value]).toEqual(['75014', 'Paris']);
    await act(async () => { rue().focus(); });
    await taper(rue(), '8 Rue Denfert Rochereau');
    await attendre(300);
    await cliquer([...document.querySelectorAll('.fsy-proposition')][1]);
    expect([champ('Code postal *').value, champ('Ville *').value]).toEqual(['69004', 'Lyon']);
  });

  it('dès 3 caractères seulement, en tapant', async () => {
    await ouvrir(vi.fn(), null);
    await cliquer(bouton('Créer un nouveau syndic'));
    await taper(rue(), '8 ');
    await attendre(300);
    expect(appels.some((a) => a.url.startsWith('https://api-adresse.data.gouv.fr'))).toBe(false);
    await taper(rue(), '8 Rue Denfert Rochereau');
    await attendre(300);
    expect(propositions()[0]).toBe('8 Rue Denfert-Rochereau, 92100 Boulogne-Billancourt');
  });

  it('l\'API en panne : REPLI sur la BAN locale', async () => {
    apiEnPanne = true;
    await ouvrir();
    await taper(champ('+ Ajouter une copropriété (immeuble)'), '7 rue test');
    await attendre(300);
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/syndics/adresses?q=7%20rue%20test'))).toBe(true);
    expect(propositions().join()).toContain('7 Rue Test, 92400 Courbevoie');
  });

  it('la casse des noms EN QUITTANT le champ : « jean-pierre » → « Jean-Pierre », « lefèvre » → « LEFÈVRE »', async () => {
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    const bloc = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const champC = (l: string): HTMLInputElement => [...bloc.querySelectorAll('label')]
      .find((x) => x.querySelector('span')?.textContent === l)?.querySelector('input') as HTMLInputElement;
    await act(async () => { champC('Prénom').focus(); });
    await taper(champC('Prénom'), 'jean-pierre');
    expect(champC('Prénom').value).toBe('jean-pierre'); // pas pendant la frappe
    await act(async () => { champC('Nom').focus(); });
    expect(champC('Prénom').value).toBe('Jean-Pierre');
    await taper(champC('Nom'), 'lefèvre');
    await act(async () => { champC('Prénom').focus(); });
    expect(champC('Nom').value).toBe('LEFÈVRE');
    await cliquer([...bloc.querySelectorAll('button')].find((b) => b.textContent === 'Valider') as Element);
    const ligne = [...document.querySelectorAll('button.fsy-contact-replie')].map((l) => l.textContent);
    expect(ligne).toContain('Jean-Pierre LEFÈVRE▸');
  });

  it('un nom existant qu\'on ne fait que TRAVERSER n\'est pas réécrit', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer([...document.querySelectorAll('.fsy-contact-ouvert button')].find((b) => b.textContent === 'Modifier') as Element);
    const bloc = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const nom = [...bloc.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await act(async () => { nom.focus(); nom.blur(); });
    expect(nom.value).toBe('Durand');
  });
});
