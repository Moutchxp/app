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
  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — Léa est rattachée EXPLICITEMENT à sa copropriété (il n'y a plus de « tous »
  // implicite quand le marqueur est absent).
  contacts: [{ id: 4, titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', tousImmeubles: false, immeubles: ['12 rue x'],
    coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }] }],
  coproprietes: [{ id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10',
    lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Courbevoie' }] }],
  historique: [],
};
const IMMEUBLES = [
  { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', syndic: { id: 11, nom: '_TEST Cabinet' },
    lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Courbevoie' }] },
  { cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie',
    syndic: { id: 99, nom: '_TEST Autre Syndic', ville: 'Courbevoie' },
    lots: [{ id: 2, numero: '201', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }, { id: 3, numero: '202', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }] },
];

/** LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — un syndic _TEST, 2 copropriétés, 3 contacts : un commun, un par immeuble. */
const FICHE_20 = {
  ...FICHE, id: 20, nom: '_TEST Grand Cabinet',
  contacts: [
    { id: 31, titre: 'Service comptabilité', prenom: 'Paul', nom: 'Commun', tousImmeubles: true, immeubles: [], coordonnees: [] },
    { id: 32, titre: 'Responsable de copropriété', prenom: 'Marie', nom: 'Douze', tousImmeubles: false, immeubles: ['12 rue x'], coordonnees: [] },
    { id: 33, titre: 'Responsable de copropriété', prenom: 'Yves', nom: 'Trois', tousImmeubles: false, immeubles: ['3 av y'], coordonnees: [] },
  ],
  coproprietes: [
    { id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10',
      lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Courbevoie' }] },
    { id: 7, cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
  ],
};
/** LOT SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT — 4 contacts _TEST aux affectations variées (un accentué, avec coordonnées). */
const FICHE_21 = {
  ...FICHE_20, id: 21, nom: '_TEST Cabinet Catalogue',
  contacts: [
    ...FICHE_20.contacts,
    { id: 34, titre: 'Service comptabilité', prenom: 'Élodie', nom: 'Été', tousImmeubles: false, immeubles: ['3 av y'],
      coordonnees: [{ id: 41, sorte: 'telephone', libelle: 'Ligne directe', valeur: '0611223344' },
        { id: 42, sorte: 'email', libelle: 'Email direct', valeur: 'elodie@test.invalid' }] },
  ],
};
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
    if (url === '/api/admin/gestion/syndics/20' && (init?.method ?? 'GET') === 'GET') return rep({ etat: 'ok', fiche: FICHE_20 });
    if (url === '/api/admin/gestion/syndics/21' && (init?.method ?? 'GET') === 'GET') return rep({ etat: 'ok', fiche: FICHE_21 });
    if (url === '/api/admin/gestion/syndics/21') return rep({ ok: true, id: 21 });
    if (url === '/api/admin/gestion/syndics/20') return rep({ ok: true, id: 20 });
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
/** LOT SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT — la liste des copropriétés est repliée à l'ouverture : on la déplie. */
const deplierCopros = async (): Promise<void> => {
  const l = document.querySelector('button.fsy-copros-ligne') as HTMLButtonElement | null;
  if (l !== null && l.getAttribute('aria-expanded') === 'false') { await act(async () => { l.click(); }); }
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
    await deplierCopros();
    expect(document.querySelector('.fsy-copro')?.textContent).toContain('12 rue X, 92400 Courbevoie');
  });

  /* LOT SYNDIC-BLOC-PORTEFEUILLE — CE QU'ILS DISAIENT AVANT (deux tests) : le champ « + Ajouter une copropriété
     (immeuble) » proposait le portefeuille (« N biens en gestion », « déjà rattachée à … » et reprise confirmée) puis
     l'API Adresse. Le champ est RETIRÉ avec l'accord d'Arno ; la source d'adresses reste éprouvée sur le champ « rue ». */
  it('le champ « + Ajouter une copropriété » n’existe plus dans la fiche', async () => {
    await ouvrir();
    await deplierCopros();
    expect([...document.querySelectorAll('label > span')].some((x) => x.textContent === '+ Ajouter une copropriété (immeuble)')).toBe(false);
    expect(document.querySelector('.fsy-proposition')).toBeNull();
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
    // LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — CE QU'IL DISAIT AVANT : « _TEST Autre Syndic » (le nom seul).
    expect(connu.textContent).toBe('_TEST Autre Syndic / Courbevoie');
    expect(connu.title).toBe('Syndic : _TEST Autre Syndic / Courbevoie');
    expect(connu.className).toContain('bsy--connu');
    expect(connu.querySelector('.bsy-mot')).not.toBeNull();
    expect(inconnu.textContent).toBe('Créer le syndic');
    expect(inconnu.className).not.toContain('bsy--connu');
    expect(connu.closest('.bsy-ligne')).not.toBeNull();
  });
});

describe('LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — coordonnées générales, autres contacts, adresse obligatoire', () => {
  /* LOT FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS — CE QU'IL DISAIT AVANT : un lien « Appeler » (tel:) au bout du numéro.
     « Copier » le remplace (accord d'Arno). */
  it('la ligne en DOUBLON sous l\'e-mail a disparu ; « Écrire depuis gestion@ » est au bout du champ, « Copier » au bout du numéro', async () => {
    await ouvrir(vi.fn(), 11, vi.fn());
    expect(document.querySelector('.fsy-liens')).toBeNull();
    const ligneEmail = (document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLElement).closest('.fsy-ligne-champ');
    expect(ligneEmail?.textContent).toContain('Écrire depuis gestion@');
    const ligneTel = (document.querySelector('input[aria-label="Téléphone standard"]') as HTMLElement).closest('.fsy-ligne-tel');
    expect(ligneTel?.querySelector('.fsy-action .bcp')?.textContent).toBe('Copier');
    expect(ligneTel?.textContent).not.toContain('Appeler');
  });

  it('un e-mail invalide n\'a pas de lien ; un numéro incomplet n\'a pas de « Copier »', async () => {
    await ouvrir(vi.fn(), 11, vi.fn());
    await taper(document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLInputElement, 'pas-un-mail');
    expect(document.querySelector('.fsy-ligne-champ')?.textContent).not.toContain('Écrire');
    await taper(document.querySelector('input[aria-label="Téléphone standard"]') as HTMLInputElement, '01 23');
    expect(document.querySelector('.fsy-ligne-tel .bcp')).toBeNull();
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
    // LOT FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS — CE QU'IL DISAIT AVANT : « Léa DURAND · Responsable… » (titre collé au nom).
    // Le nom est à gauche, le titre à DROITE, juste avant la flèche.
    expect(ligne.querySelector('.fsy-contact-nom')?.textContent).toBe('Léa DURAND');
    expect(ligne.querySelector('.fsy-contact-titre')?.textContent).toBe('Responsable de copropriété');
    expect(ligne.textContent).toBe('Léa DURANDResponsable de copropriété▸');
    expect(ligne.querySelector('strong')?.textContent).toBe('Léa DURAND');
    expect(ligne.querySelector('button')).toBeNull();
  });

  it('② un clic l\'OUVRE EN LECTURE : une ligne par téléphone, « Copier » à droite ; Modifier / Supprimer / Fermer ; l\'en-tête le referme', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    const ouvert = document.querySelector('.fsy-contact-ouvert') as HTMLElement;
    expect(ouvert.querySelectorAll('input')).toHaveLength(0);
    const tel = ouvert.querySelector('.fsy-contact-coord')?.textContent ?? '';
    expect(tel).toBe('Portable : 06 13 86 18 77Copier');
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
    // LOT SYNDIC-CONTACTS-ANTI-DOUBLON — CE QU'IL DISAIT AVANT : « … du contact Léa BERNARD ? ».
    expect(pied()?.textContent).toContain('Valider aussi les modifications de Léa BERNARD ?');
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

  // LOT SYNDIC-BLOC-PORTEFEUILLE — CE QU'IL DISAIT AVANT : le repli éprouvé sur « + Ajouter une copropriété » (retiré).
  it('l\'API en panne : REPLI sur la BAN locale (champ « Adresse (rue) »)', async () => {
    apiEnPanne = true;
    await ouvrir();
    await taper(champ('Adresse (rue) *'), '7 rue test');
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
    // (sans titre : le nom seul, à gauche)
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

describe('LOT FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS', () => {
  const optionsDe = (select: HTMLSelectElement): string[] => [...select.options].map((o) => o.textContent ?? '');
  const ouvrirEnModification = async (): Promise<HTMLElement> => {
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer([...document.querySelectorAll('.fsy-contact-ouvert button')].find((b) => b.textContent === 'Modifier') as Element);
    return document.querySelector('.fsy-contact-edit') as HTMLElement;
  };

  it('le menu « Libellé » d\'un E-MAIL : Email direct / Email service / Personnalisé… ; celui d\'un TÉLÉPHONE est inchangé', async () => {
    await ouvrir();
    const bloc = await ouvrirEnModification();
    await cliquer([...bloc.querySelectorAll('button')].find((b) => b.textContent === '+ e-mail') as Element);
    const lignes = [...bloc.querySelectorAll('.fsy-coord-edit')];
    const menuTel = lignes[0].querySelector('select') as HTMLSelectElement;
    const menuEmail = lignes[1].querySelector('select') as HTMLSelectElement;
    expect(optionsDe(menuTel)).toEqual(['—', 'Ligne directe', 'Portable', 'Standard', 'Personnalisé…']);
    expect(optionsDe(menuEmail)).toEqual(['—', 'Email direct', 'Email service', 'Personnalisé…']);
  });

  it('un e-mail ENREGISTRÉ avec un ancien libellé téléphonique s\'ouvre sous « Personnalisé… », avec son texte, sans réécriture', async () => {
    const ancien = { ...FICHE, id: 15, contacts: [{ ...FICHE.contacts[0],
      coordonnees: [{ id: 7, sorte: 'email', libelle: 'Ligne directe', valeur: 'lea@test.invalid' }] }] };
    const fetchAvant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => (url === '/api/admin/gestion/syndics/15'
      ? { ok: true, json: async () => ({ etat: 'ok', fiche: ancien }) } : (fetchAvant as typeof fetch)(url, init))));
    await ouvrir(vi.fn(), 15);
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    expect(document.querySelector('.fsy-contact-ouvert .fsy-contact-coord')?.textContent).toContain('Ligne directe : lea@test.invalid');
    await cliquer([...document.querySelectorAll('.fsy-contact-ouvert button')].find((b) => b.textContent === 'Modifier') as Element);
    const ligne = document.querySelector('.fsy-coord-edit') as HTMLElement;
    expect((ligne.querySelector('select') as HTMLSelectElement).value).toBe('Personnalisé');
    const libre = [...ligne.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Libellé personnalisé'))?.querySelector('input') as HTMLInputElement;
    expect(libre.value).toBe('Ligne directe');
    expect(boutonDans(document.querySelector('.fsy-contact-edit'), 'Modifier').disabled).toBe(true); // rien n'a changé
  });

  it('« Copier » copie le numéro AU FORMAT PAR PAIRES et dit « Copié » ; le numéro reste cliquable (tel:)', async () => {
    const ecrire = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    const ligne = document.querySelector('.fsy-contact-ouvert .fsy-contact-coord') as HTMLElement;
    expect(ligne.querySelector('a')?.getAttribute('href')).toBe('tel:0613861877');
    await cliquer(ligne.querySelector('.bcp') as Element);
    expect(ecrire).toHaveBeenCalledWith('06 13 86 18 77');
    expect(ligne.querySelector('.bcp')?.textContent).toBe('Copié');
  });

  it('les actions de droite sont dans une colonne alignée : chaque ligne pousse son action au bord droit', async () => {
    await ouvrir(vi.fn(), 11, vi.fn());
    // ⚠️ jsdom ne calcule aucune géométrie (getBoundingClientRect y vaut 0) : l'alignement est tenu par la feuille de
    // style — ligne en `justify-content:space-between`, action en `margin-left:auto` — et par la structure.
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-action{flex:0 0 auto;margin-left:auto;');
    expect(css).toContain('.fsy-contact-coord{display:flex;align-items:center;justify-content:space-between;');
    const ligneTel = (document.querySelector('input[aria-label="Téléphone standard"]') as HTMLElement).closest('.fsy-ligne-tel') as HTMLElement;
    expect(ligneTel.lastElementChild?.className).toBe('fsy-action');
    const ligneEmail = (document.querySelector('input[aria-labelledby="fsy-email-generique"]') as HTMLElement).closest('.fsy-ligne-champ') as HTMLElement;
    expect(ligneEmail.lastElementChild?.className).toContain('fsy-action');
  });
});

describe('LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — le catalogue, et qui suit quel immeuble', () => {
  type Corps = { contacts: Array<{ nom: string; tousImmeubles: boolean; immeubles: string[] }> };
  const put = (): Corps => appels.find((x) => x.methode === 'PUT')?.corps as Corps;
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  const depuisUnBien = async (): Promise<void> => {
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 20, onFerme: vi.fn(),
        immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };
  const noms = (zone: Element | null): string[] => [...(zone?.querySelectorAll(':scope > button.fsy-contact-replie, :scope > .fsy-contact-replie') ?? [])]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const copro = (i: number): HTMLElement => document.querySelectorAll('.fsy-copro')[i] as HTMLElement;

  /* LOT SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT — CE QU'IL DISAIT AVANT : « Catalogue des contacts » en titre, le
     sous-titre « Contacts pour cet immeuble », et un bloc replié « Autres contacts du cabinet ». Arno corrige : le titre
     redevient « Autres contacts », qui n'affiche QUE les contacts de l'immeuble du bien ; les autres → « Catalogue ». */
  it('depuis un BIEN : « Autres contacts » n\'affiche QUE les contacts de cet immeuble (affectés + communs)', async () => {
    await depuisUnBien();
    // LOT SYNDIC-MODALE-DEUX-BLOCS — CE QU'IL DISAIT AVANT : « Autres contacts », devenu « Contacts de cet immeuble ».
    // LOT SYNDIC-TITRES-COPROPRIETE — CE QU'IL DISAIT AVANT : « Contacts de cet immeuble ».
    expect([...document.querySelectorAll('.fsy-sous-titre')].map((h) => h.textContent)).toContain('Contacts de cette copropriété');
    expect(document.body.textContent).not.toContain('Contacts pour cet immeuble');
    expect(document.body.textContent).not.toContain('Catalogue des contacts');
    expect(document.querySelector('details.fsy-autres')).toBeNull();
    const affiches = [...document.querySelectorAll('.fsy-corps button.fsy-contact-replie')].map((b) => b.querySelector('.fsy-contact-nom')?.textContent);
    expect(affiches).toEqual(['Paul COMMUN', 'Marie DOUZE']);
  });

  it('sans bien (écran « Syndics ») : inchangé, TOUS les contacts', async () => {
    await ouvrir(vi.fn(), 20);
    const affiches = [...document.querySelectorAll('.fsy-corps button.fsy-contact-replie')].map((b) => b.querySelector('.fsy-contact-nom')?.textContent);
    expect(affiches).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Yves TROIS']);
  });

  it('contact ouvert : « Immeubles suivis : Tous les immeubles » ou la liste des copropriétés', async () => {
    await ouvrir(vi.fn(), 20);
    const lignes = [...document.querySelectorAll('button.fsy-contact-replie')];
    await cliquer(lignes[0]);
    await cliquer([...document.querySelectorAll('button.fsy-contact-replie')][0]);
    // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : « Tous les immeubles » pour Paul (contact « commun »).
    // Un ancien « tous » se lit désormais comme les copropriétés ACTUELLES, explicitement (comme le convertit la 329).
    // LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — CE QU'IL DISAIT AVANT : la ligne « Immeubles suivis : A · B ».
    // Écran Syndics : « Copropriétés suivies (N) ▸ », repliée.
    const suivis = [...document.querySelectorAll('.fsy-contact-ouvert .fsy-suivis-tete')].map((p) => p.textContent);
    expect(suivis).toEqual(['Copropriétés suivies (2)▸', 'Copropriétés suivies (1)▸']);
  });

  it('affecter un contact à DEUX copropriétés, puis à « Tous les immeubles », par les cases', async () => {
    await ouvrir(vi.fn(), 20);
    await cliquer([...document.querySelectorAll('button.fsy-contact-replie')][1]); // Marie DOUZE
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    const cases = (): HTMLInputElement[] => [...document.querySelectorAll('.fsy-suivis-edit input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases().map((c) => [c.checked, c.disabled])).toEqual([[false, false], [true, false], [false, false]]);
    await cliquer(cases()[2]); // + 3 av Y
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    // LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES — CE QU'IL DISAIT AVANT : « Immeubles suivis : 12 rue X … · 3 av Y … ».
    await cliquer(document.querySelector('.fsy-contact-ouvert .fsy-suivis-tete') as Element);
    expect([...document.querySelectorAll('.fsy-contact-ouvert .fsy-suivis-liste li')].map((x) => x.textContent))
      .toEqual(['3 av Y, 92400 Courbevoie', '12 rue X, 92400 Courbevoie']);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : cocher « Tous les immeubles » désactivait les autres
    // cases et enregistrait tousImmeubles = vrai. C'est désormais un RACCOURCI sur les copropriétés ACTUELLES.
    expect(cases()[0].checked).toBe(true); // les deux copropriétés actuelles sont cochées ⇒ « tous » apparaît coché
    await cliquer(cases()[0]); // décoche tout
    expect(cases().map((c) => c.checked)).toEqual([false, false, false]);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    expect(cases().map((c) => c.checked)).toEqual([false, false, false]);
    await cliquer(cases()[0]); // recoche tout
    expect(cases().map((c) => [c.checked, c.disabled])).toEqual([[true, false], [true, false], [true, false]]);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts[1]).toMatchObject({ nom: 'Douze', tousImmeubles: false, immeubles: ['12 rue x', '3 av y'] });
  });

  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : Paul marqué « commun » (sans « Retirer »). Plus de contact
  // commun : Paul est là par SON affectation, et se retire comme les autres.
  it('la copropriété repliée : « 12 rue X, 92400 Courbevoie · 2 contacts · 1 bien en gestion » ; dépliée : ses contacts, chacun retirable', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    expect(copro(0).querySelector('.fsy-copro-tete')?.textContent).toBe('12 rue X, 92400 Courbevoie2 contacts · 1 bien en gestion▸');
    await cliquer(copro(0).querySelector('.fsy-copro-tete') as Element);
    const lignes = [...copro(0).querySelectorAll('.fsy-copro-contacts .fsy-contact-coord')].map((l) => l.textContent);
    expect(lignes).toEqual(['Paul COMMUN · Service comptabilitéRetirer', 'Marie DOUZE · Responsable de copropriétéRetirer']);
    expect(copro(0).querySelector('.fsy-commun')).toBeNull();
  });

  it('RETIRER une affectation depuis la copropriété : le contact reste au catalogue', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    await cliquer(copro(0).querySelector('.fsy-copro-tete') as Element);
    await cliquer(copro(0).querySelector('button[aria-label="Retirer l’affectation de Marie DOUZE"]') as Element);
    expect(copro(0).querySelector('.fsy-copro-tete')?.textContent).toContain('1 contact · 1 bien en gestion');
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts.map((c) => [c.nom, c.tousImmeubles, c.immeubles])).toEqual([
      ['Commun', false, ['12 rue x', '3 av y']], ['Douze', false, []], ['Trois', false, ['3 av y']], // avant : Commun « tous »
    ]);
  });

  it('« + Affecter un contact » : la liste du catalogue à cocher', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    await cliquer(copro(1).querySelector('.fsy-copro-tete') as Element);
    await cliquer(boutonDans(copro(1), '+ Affecter un contact'));
    const cases = [...copro(1).querySelectorAll('.fsy-affecter label')].map((l) => l.textContent);
    expect(cases).toEqual(['Marie DOUZE · Responsable de copropriété']);
    await cliquer(copro(1).querySelector('.fsy-affecter input') as Element);
    await cliquer(boutonDans(copro(1), 'Affecter'));
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts[1].immeubles).toEqual(['12 rue x', '3 av y']);
  });

  it('« Créer un nouveau contact » depuis une copropriété : créé dans le catalogue ET affecté à cet immeuble', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    await cliquer(copro(1).querySelector('.fsy-copro-tete') as Element);
    await cliquer(boutonDans(copro(1), 'Créer un nouveau contact'));
    const bloc = document.querySelector('.fsy-contact-edit') as HTMLElement;
    expect(bloc.querySelector('legend')?.textContent).toBe('Nouveau contact');
    const cases = [...bloc.querySelectorAll('.fsy-suivis-edit input')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked)).toEqual([false, false, true]);
  });

  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : sans bien, « Tous les immeubles » coché par défaut.
  it('un contact créé DEPUIS UN BIEN suit cet immeuble par défaut ; SANS bien, AUCUNE copropriété', async () => {
    await depuisUnBien();
    await cliquer(bouton('+ Ajouter un contact'));
    // LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — CE QU'IL DISAIT AVANT : les cases, celle de l'immeuble du bien cochée.
    // Depuis un bien, les cases cèdent la place à « Sera rattaché à : … » (accord d'Arno).
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-edit')).toBeNull();
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis')?.textContent).toBe('Sera rattaché à : 12 rue X, 92400 Courbevoie');
    let cases: HTMLInputElement[];
    act(() => { root.unmount(); });
    root = createRoot(container);
    await ouvrir(vi.fn(), 20);
    await cliquer(bouton('+ Ajouter un contact'));
    cases = [...document.querySelectorAll('.fsy-contact-edit .fsy-suivis-edit input')] as HTMLInputElement[];
    expect(cases.map((c) => c.checked)).toEqual([false, false, false]);
  });

  it('RETIRER une copropriété : elle sort aussi des contacts qui la suivaient', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    await cliquer(boutonDans(copro(1), 'Retirer'));
    await cliquer(bouton('Oui, retirer'));
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts[2]).toMatchObject({ nom: 'Trois', tousImmeubles: false, immeubles: [] });
  });
});

/* LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — ce bloc remplace celui du lot SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT.
   CE QU'IL DISAIT AVANT : une ligne repliable « Catalogue ▸ (N) » DANS le formulaire « Nouveau contact », et, dans ce
   formulaire, les cases « Immeubles suivis » (immeuble du bien coché). Désormais : deux blocs l'un sous l'autre,
   le Catalogue OUVERT d'office au-dessus, et « Sera rattaché à : … » à la place des cases. */
const FICHE_22 = {
  ...FICHE_20, id: 22, nom: '_TEST Cabinet Sept',
  contacts: [
    { id: 31, titre: 'Service comptabilité', prenom: 'Paul', nom: 'Commun', tousImmeubles: true, immeubles: [], coordonnees: [] },
    { id: 32, titre: 'Responsable de copropriété', prenom: 'Marie', nom: 'Douze', tousImmeubles: false, immeubles: ['12 rue x'], coordonnees: [] },
    { id: 33, titre: '', prenom: 'Yves', nom: 'Trois', tousImmeubles: false, immeubles: ['3 av y'], coordonnees: [] },
    { id: 34, titre: 'Service comptabilité', prenom: 'Élodie', nom: 'Été', tousImmeubles: false, immeubles: ['3 av y'],
      coordonnees: [{ id: 41, sorte: 'telephone', libelle: 'Ligne directe', valeur: '0611223344' },
        { id: 42, sorte: 'email', libelle: 'Email direct', valeur: 'elodie@test.invalid' }] },
    { id: 35, titre: '', prenom: 'Bruno', nom: 'Abel', tousImmeubles: false, immeubles: ['3 av y'], coordonnees: [] },
    { id: 36, titre: '', prenom: 'Anne', nom: 'Abel', tousImmeubles: false, immeubles: ['3 av y'], coordonnees: [] },
    { id: 37, titre: '', prenom: 'Zoé', nom: 'Zola', tousImmeubles: false, immeubles: [], coordonnees: [] },
    { id: 38, titre: '', prenom: 'Luc', nom: 'Martin', tousImmeubles: false, immeubles: ['3 av y'], coordonnees: [] },
  ],
};

describe('LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — Catalogue ouvert, puis Nouveau contact', () => {
  type Corps = { contacts: Array<{ nom: string; tousImmeubles: boolean; immeubles: string[] }> };
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  const avecFiche22 = (): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      if (url === '/api/admin/gestion/syndics/22') { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 22 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const depuisLeBien = async (id: number, libelle = '12 rue X'): Promise<ReturnType<typeof vi.fn>> => {
    if (id === 22) avecFiche22();
    const onFerme = vi.fn();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: id, onFerme, immeubleDepart: { libelle, codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    return onFerme;
  };
  const catalogue = (): HTMLElement | null => document.querySelector('.fsy-catalogue');
  const tuiles = (): string[] => [...(catalogue()?.querySelectorAll('.fsy-catalogue-liste > button.fsy-contact-replie, .fsy-catalogue-liste .fsy-contact-tete-btn') ?? [])]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const affiches = (): string[] => [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie')]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');

  it('« + Ajouter un contact » : le Catalogue OUVERT d\'office (« Catalogue (6) »), PUIS le bloc « Nouveau contact »', async () => {
    await depuisLeBien(22);
    await cliquer(bouton('+ Ajouter un contact'));
    // LOT SYNDIC-CATALOGUE-ANNULER-ET-TITRE — CE QU'IL DISAIT AVANT : « Catalogue (6) ».
    expect(catalogue()?.querySelector('.fsy-catalogue-titre')?.textContent).toBe('Catalogue des contacts du syndic (6)');
    expect(catalogue()?.querySelector('button[aria-expanded="false"].fsy-catalogue-tete')).toBeNull();
    const nouveau = document.querySelector('.fsy-contact-edit') as HTMLElement;
    expect(nouveau.querySelector('legend')?.textContent).toBe('Nouveau contact');
    expect(catalogue()?.compareDocumentPosition(nouveau)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(nouveau.contains(catalogue())).toBe(false);
  });

  it('toutes les tuiles d\'office, par ordre alphabétique du NOM puis du prénom', async () => {
    await depuisLeBien(22);
    await cliquer(bouton('+ Ajouter un contact'));
    // L'ordre exact, accents ignorés : ABEL Anne, ABEL Bruno, ÉTÉ (rangé à « ete »), MARTIN, TROIS, ZOLA.
    expect(tuiles()).toEqual(['Anne ABEL', 'Bruno ABEL', 'Élodie ÉTÉ', 'Luc MARTIN', 'Yves TROIS', 'Zoé ZOLA']);
  });

  it('5 tuiles au plus, puis DÉFILEMENT dans la liste ; recherche sur toute la largeur', async () => {
    await depuisLeBien(22);
    await cliquer(bouton('+ Ajouter un contact'));
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    // ⚠️ jsdom ne mesure rien : la hauteur est tenue par la feuille de style (5 × 40 px + 4 intervalles), le
    // défilement par overflow-y:auto sur la LISTE ; les 6 tuiles sont bien toutes dans cette liste.
    expect(css).toContain('.fsy-catalogue-liste{display:flex;flex-direction:column;gap:.3rem;max-height:calc(5 * 40px + 4 * .3rem);overflow-y:auto;');
    expect(css).toContain('.fsy-catalogue-liste > .fsy-contact-replie{flex:0 0 40px;min-height:40px;max-height:40px}');
    expect(catalogue()?.querySelectorAll('.fsy-catalogue-liste > button.fsy-contact-replie')).toHaveLength(6);
    expect(css).toContain('.fsy-catalogue-recherche{display:block;width:100%;box-sizing:border-box;');
    expect((catalogue()?.querySelector('input[type="search"]') as HTMLInputElement).value).toBe('');
  });

  it('le filtre, à chaque lettre, sans accents ni casse', async () => {
    await depuisLeBien(22);
    await cliquer(bouton('+ Ajouter un contact'));
    const champ = catalogue()?.querySelector('input[type="search"]') as HTMLInputElement;
    await taper(champ, 'abel');
    expect(tuiles()).toEqual(['Anne ABEL', 'Bruno ABEL']);
    await taper(champ, 'ZOE');
    expect(tuiles()).toEqual(['Zoé ZOLA']);
    await taper(champ, '0611');
    expect(tuiles()).toEqual(['Élodie ÉTÉ']);
    await taper(champ, 'zzz');
    expect(catalogue()?.textContent).toContain('Aucun contact');
  });

  it('tuile dépliée inchangée ; SÉLECTIONNER puis Valider : immeuble du bien AJOUTÉ, anciens conservés', async () => {
    await depuisLeBien(22);
    await cliquer(bouton('+ Ajouter un contact'));
    const champ = catalogue()?.querySelector('input[type="search"]') as HTMLInputElement;
    await taper(champ, 'elodie');
    await cliquer(catalogue()?.querySelector('button.fsy-contact-replie') as Element);
    const fiche = catalogue()?.querySelector('.fsy-contact-ouvert') as HTMLElement;
    expect([...fiche.querySelectorAll('.fsy-contact-coord')].map((l) => l.textContent)).toEqual([
      'Ligne directe : 06 11 22 33 44Copier', 'Email direct : elodie@test.invalidCopier']);
    expect(fiche.querySelector('.fsy-suivis')?.textContent).toBe('Déjà rattaché à : 3 av Y, 92400 Courbevoie');
    await cliquer(boutonDans(fiche, 'Ajouter à cette copropriété'));
    expect(catalogue()).toBeNull();
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    expect(affiches()).toContain('Élodie ÉTÉ');
    await cliquer(boutonDans(pied(), 'Valider'));
    const put = appels.find((x) => x.methode === 'PUT')?.corps as Corps;
    expect(put.contacts.find((c) => c.nom === 'Été')).toMatchObject({ tousImmeubles: false, immeubles: ['3 av y', '12 rue x'] });
  });

  it('CATALOGUE VIDE : seul le bloc « Nouveau contact »', async () => {
    await depuisLeBien(11);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(catalogue()).toBeNull();
    expect(document.querySelector('.fsy-contact-edit legend')?.textContent).toBe('Nouveau contact');
  });

  it('CRÉATION depuis un bien : rattaché UNIQUEMENT à cet immeuble, sans cases ; « Sera rattaché à : … »', async () => {
    await depuisLeBien(22);
    await cliquer(bouton('+ Ajouter un contact'));
    const bloc = document.querySelector('.fsy-contact-edit') as HTMLElement;
    expect(bloc.querySelector('.fsy-suivis-edit')).toBeNull();
    expect(bloc.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(bloc.querySelector('.fsy-suivis')?.textContent).toBe('Sera rattaché à : 12 rue X, 92400 Courbevoie');
    const champC = (l: string): HTMLInputElement => [...bloc.querySelectorAll('label')]
      .find((x) => x.querySelector('span')?.textContent === l)?.querySelector('input') as HTMLInputElement;
    await taper(champC('Nom'), 'Neuf');
    await cliquer(boutonDans(bloc, 'Valider'));
    await cliquer(boutonDans(pied(), 'Valider'));
    const put = appels.find((x) => x.methode === 'PUT')?.corps as Corps;
    expect(put.contacts.find((c) => c.nom === 'Neuf')).toMatchObject({ tousImmeubles: false, immeubles: ['12 rue x'] });
  });

  it('un contact rattaché à 3 immeubles (aucune limite), et « Immeubles suivis » CONSERVÉ en modification', async () => {
    const trois = { ...FICHE_22, id: 23, coproprietes: [...FICHE_22.coproprietes,
      { id: 8, cle: '7 bd z', libelle: '7 bd Z', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] }] };
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/23' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: trois }) };
      if (url === '/api/admin/gestion/syndics/23') { appels.push({ url, methode: 'PUT', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 23 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
    await ouvrir(vi.fn(), 23);
    const marie = [...document.querySelectorAll('button.fsy-contact-replie')].find((b) => b.textContent?.includes('Marie DOUZE')) as Element;
    await cliquer(marie);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    const cases = (): HTMLInputElement[] => [...document.querySelectorAll('.fsy-contact-edit .fsy-suivis-edit input')] as HTMLInputElement[];
    expect(cases()).toHaveLength(4);
    await cliquer(cases()[2]);
    await cliquer(cases()[3]);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    await cliquer(boutonDans(pied(), 'Valider'));
    const put = appels.find((x) => x.methode === 'PUT')?.corps as Corps;
    expect(put.contacts.find((c) => c.nom === 'Douze')?.immeubles).toEqual(['12 rue x', '3 av y', '7 bd z']);
  });

  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : « Tous les immeubles » coché par défaut.
  it('écran « Syndics » (sans bien) : pas de Catalogue, les cases, AUCUNE cochée par défaut', async () => {
    avecFiche22();
    await ouvrir(vi.fn(), 22);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(catalogue()).toBeNull();
    const cases = [...document.querySelectorAll('.fsy-contact-edit .fsy-suivis-edit input')] as HTMLInputElement[];
    expect(cases.length).toBe(3);
    expect(cases.map((c) => c.checked)).toEqual([false, false, false]);
  });
});

describe('LOT SYNDIC-CATALOGUE-ANNULER-ET-TITRE — replier une tuile du catalogue sans rien rattacher', () => {
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  const catalogue = (): HTMLElement | null => document.querySelector('.fsy-catalogue');
  const ouverte = (): HTMLElement | null => catalogue()?.querySelector('.fsy-contact-ouvert') ?? null;
  const tuile = (nom: string): HTMLElement => [...(catalogue()?.querySelectorAll('button.fsy-contact-replie') ?? [])]
    .find((b) => b.querySelector('.fsy-contact-nom')?.textContent === nom) as HTMLElement;
  const affiches = (): string[] => [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie')]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const preparer = async (): Promise<ReturnType<typeof vi.fn>> => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      if (url === '/api/admin/gestion/syndics/22') { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 22 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
    const onFerme = vi.fn();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 22, onFerme, immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(catalogue()?.querySelector('input[type="search"]') as HTMLInputElement, 'abel');
    await cliquer(tuile('Anne ABEL'));
    return onFerme;
  };
  /** Rien n'a été rattaché : « Autres contacts » inchangé, et « Valider » ferme sans rien écrire. */
  const rienEcrit = async (onFerme: ReturnType<typeof vi.fn>): Promise<void> => {
    expect(affiches()).toEqual(['Paul COMMUN', 'Marie DOUZE']);
    await cliquer(document.querySelector('.fsy-contact-edit') ? boutonDans(document.querySelector('.fsy-contact-edit'), 'Annuler') : bouton('Annuler'));
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(appels.some((x) => x.methode === 'PUT')).toBe(false);
    expect(onFerme).toHaveBeenCalledTimes(1);
  };

  it('« Annuler » est À GAUCHE de « Ajouter à cette copropriété », au style des Annuler blancs', async () => {
    await preparer();
    const boutons = [...(ouverte()?.querySelectorAll('.fsy-boutons button') ?? [])] as HTMLButtonElement[];
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['Annuler', 'Ajouter à cette copropriété']);
    expect(boutons[0].className).toContain('svv-btn-outline');
  });

  it('« Annuler » replie la tuile, ne rattache rien, garde la recherche', async () => {
    const onFerme = await preparer();
    await cliquer(boutonDans(ouverte(), 'Annuler'));
    expect(ouverte()).toBeNull();
    expect((catalogue()?.querySelector('input[type="search"]') as HTMLInputElement).value).toBe('abel');
    expect([...(catalogue()?.querySelectorAll('button.fsy-contact-replie') ?? [])].map((b) => b.querySelector('.fsy-contact-nom')?.textContent))
      .toEqual(['Anne ABEL', 'Bruno ABEL']);
    await rienEcrit(onFerme);
  });

  it('le ▾ de l\'en-tête replie aussi la tuile', async () => {
    const onFerme = await preparer();
    await cliquer(ouverte()?.querySelector('.fsy-contact-tete-btn') as Element);
    expect(ouverte()).toBeNull();
    await rienEcrit(onFerme);
  });

  it('cliquer une AUTRE tuile replie la précédente : une seule dépliée à la fois', async () => {
    const onFerme = await preparer();
    await cliquer(tuile('Bruno ABEL'));
    const ouvertes = [...(catalogue()?.querySelectorAll('.fsy-contact-ouvert') ?? [])];
    expect(ouvertes).toHaveLength(1);
    expect(ouvertes[0].querySelector('.fsy-contact-nom')?.textContent).toBe('Bruno ABEL');
    await rienEcrit(onFerme);
  });

  it('Échap DANS la tuile = Annuler, SANS fermer la fiche ; le focus revient sur la tuile', async () => {
    const onFerme = await preparer();
    const bouton0 = boutonDans(ouverte(), 'Ajouter à cette copropriété');
    await act(async () => { bouton0.focus(); bouton0.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await attendre(10);
    expect(ouverte()).toBeNull();
    expect(onFerme).not.toHaveBeenCalled();
    expect(document.querySelector('.fsy')).not.toBeNull();
    expect((document.activeElement as HTMLElement | null)?.querySelector('.fsy-contact-nom')?.textContent).toBe('Anne ABEL');
    await rienEcrit(onFerme);
  });

  it('Échap HORS d\'une tuile ferme toujours la fiche (comportement inchangé)', async () => {
    const onFerme = await preparer();
    await cliquer(boutonDans(ouverte(), 'Annuler'));
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Annuler'));
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('« Ajouter à cette copropriété » fonctionne toujours', async () => {
    await preparer();
    await cliquer(boutonDans(ouverte(), 'Ajouter à cette copropriété'));
    expect(affiches()).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Anne ABEL']);
    await cliquer(boutonDans(pied(), 'Valider'));
    const put = appels.find((x) => x.methode === 'PUT')?.corps as { contacts: Array<{ prenom: string; nom: string; immeubles: string[] }> };
    expect(put.contacts.find((c) => c.prenom === 'Anne')?.immeubles).toEqual(['3 av y', '12 rue x']);
  });
});

describe('LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE', () => {
  const titre = (): string => document.querySelector('#fsy-titre')?.textContent ?? '';
  const servir = (routes: Record<string, unknown>): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return { ok: true, json: async () => ({ ok: true, id: 11 }) }; }
      for (const [debut, rep] of Object.entries(routes)) {
        if (url.startsWith(debut)) return { ok: true, json: async () => (typeof rep === 'function' ? (rep as () => unknown)() : rep) };
      }
      return (avant as typeof fetch)(url, init);
    }));
  };

  it('le TITRE de la modale : « NOM / Ville » ; le champ « Nom du cabinet » garde le nom seul', async () => {
    await ouvrir();
    expect(titre()).toBe('_TEST Cabinet / Paris');
    expect(champ('Nom du cabinet *').value).toBe('_TEST Cabinet');
  });

  it('syndic SANS ville : le nom seul, sans « / »', async () => {
    await ouvrir(vi.fn(), 12); // FICHE sans code postal ni ville
    expect(titre()).toBe('_TEST Cabinet');
  });

  it('ville modifiée puis Valider : la ville part au serveur, et le titre est « NOM / nouvelle ville » à la réouverture', async () => {
    let ville = 'Paris';
    servir({ '/api/admin/gestion/syndics/11': () => ({ etat: 'ok', fiche: { ...FICHE, ville } }) });
    const onFerme = await ouvrir();
    await taper(champ('Ville *'), 'Lyon');
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect((appels.find((a) => a.methode === 'PUT')?.corps as { ville: string; nom: string })).toMatchObject({ ville: 'Lyon', nom: '_TEST Cabinet' });
    expect(onFerme).toHaveBeenCalledTimes(1);
    ville = 'Lyon';
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir();
    expect(titre()).toBe('_TEST Cabinet / Lyon');
  });

  it('le BOUTON ROSE : « NOM / Ville » en entier, long texte SANS troncature ; il suit la ville après Valider', async () => {
    const long = '_TEST Cabinet de gestion immobilière et syndic de copropriété des Hauts-de-Seine';
    let ville = 'Asnieres Sur Seine';
    servir({ '/api/admin/gestion/syndics/immeubles': () => ({ etat: 'ok', disponible: true, immeubles: [
      { cle: '9 rue long', libelle: '9 rue Long', codePostal: '92600', commune: 'Asnières', lots: [], syndic: { id: 50, nom: long, ville } },
    ] }) });
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: '9 rue Long' })); });
    await calmer();
    const b = container.querySelector('button.bsy') as HTMLButtonElement;
    expect(b.textContent).toBe(`${long} / Asnieres Sur Seine`);
    expect(b.textContent).not.toContain('…');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).not.toContain('text-overflow:ellipsis');
    ville = 'Gennevilliers';
    await act(async () => { await rafraichirImmeubles(); }); // ce que fait « Valider » de la fiche
    await calmer();
    expect((container.querySelector('button.bsy') as HTMLButtonElement).textContent).toBe(`${long} / Gennevilliers`);
  });

  it('deux syndics de MÊME NOM dans deux villes : distincts dans l\'écran « Syndics » et dans l\'autocomplétion d\'un bien', async () => {
    const deux = { etat: 'ok', disponible: true, syndics: [
      { id: 61, nom: '_TEST FONCIA', ville: 'Courbevoie', email: null, telephone: null, nbCoproprietes: 1, nbBiens: 2, cherchable: '' },
      { id: 62, nom: '_TEST FONCIA', ville: 'Lyon', email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: '' },
      { id: 63, nom: '_TEST SANS VILLE', ville: null, email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: '' },
    ] };
    servir({ '/api/admin/gestion/syndics?q=': deux });
    const { EcranSyndics } = await import('./EcranSyndics');
    await act(async () => { root.render(createElement(EcranSyndics, {})); });
    await attendre(300);
    expect([...container.querySelectorAll('.esy-nom')].map((x) => x.textContent))
      .toEqual(['_TEST FONCIA / Courbevoie', '_TEST FONCIA / Lyon', '_TEST SANS VILLE']);
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: null, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await attendre(300);
    expect([...document.querySelectorAll('.fsy-resultat-nom strong')].map((x) => x.textContent))
      .toEqual(['_TEST FONCIA / Courbevoie', '_TEST FONCIA / Lyon', '_TEST SANS VILLE']);
  });

  it('NOTE VIDE : le bloc « Note » est masqué ; « + note » ouvre le champ vide, le curseur dedans', async () => {
    await ouvrir(); // FICHE.note === null
    const libelles = (): string[] => [...document.querySelectorAll('.fsy-corps label > span')].map((x) => x.textContent ?? '');
    expect(libelles()).not.toContain('Note');
    const plus = bouton('+ note');
    expect(plus.className).toContain('fsy-mini-btn');
    await cliquer(plus);
    expect(libelles()).toContain('Note');
    const zone = document.querySelector('.fsy-corps textarea') as HTMLTextAreaElement;
    expect(zone.value).toBe('');
    expect(document.activeElement).toBe(zone);
  });

  it('NOTE PLEINE : le bloc s\'affiche comme avant, sans « + note »', async () => {
    servir({ '/api/admin/gestion/syndics/11': { etat: 'ok', fiche: { ...FICHE, note: 'Gardien le matin' } } });
    await ouvrir();
    expect((document.querySelector('.fsy-corps textarea') as HTMLTextAreaElement).value).toBe('Gardien le matin');
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === '+ note')).toBe(false);
  });

  it('une note VIDÉE puis Valider : le bloc disparaît à la réouverture', async () => {
    let note: string | null = 'Gardien le matin';
    servir({ '/api/admin/gestion/syndics/11': () => ({ etat: 'ok', fiche: { ...FICHE, note } }) });
    await ouvrir();
    const zone = document.querySelector('.fsy-corps textarea') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(zone, ''); zone.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(document.querySelector('.fsy-corps textarea')).not.toBeNull(); // pas pendant la saisie
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect((appels.find((a) => a.methode === 'PUT')?.corps as { note: string }).note).toBe('');
    note = null;
    act(() => { root.unmount(); }); root = createRoot(container);
    await ouvrir();
    expect(document.querySelector('.fsy-corps textarea')).toBeNull();
    expect(bouton('+ note')).toBeTruthy();
  });
});

describe('LOT SYNDIC-LIBELLES-COPROS-REPLIEES-UN-CONTACT', () => {
  const ligne = (): HTMLElement | null => document.querySelector('.fsy-copros-ligne');
  const plusContact = (): HTMLButtonElement | undefined =>
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '+ Ajouter un contact') as HTMLButtonElement | undefined;
  const servir22 = (): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      if (url === '/api/admin/gestion/syndics/22') { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 22 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const depuisLeBien22 = async (): Promise<void> => {
    servir22();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 22, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };

  it('le bouton du catalogue s\'appelle « Ajouter à cette copropriété »', async () => {
    await depuisLeBien22();
    await cliquer(plusContact() as Element);
    await cliquer(document.querySelector('.fsy-catalogue button.fsy-contact-replie') as Element);
    const boutons = [...(document.querySelector('.fsy-catalogue .fsy-contact-ouvert')?.querySelectorAll('.fsy-boutons button') ?? [])].map((b) => b.textContent?.trim());
    expect(boutons).toEqual(['Annuler', 'Ajouter à cette copropriété']);
    expect(document.body.textContent).not.toContain('Sélectionner pour cet immeuble');
  });

  it('COPROPRIÉTÉS : une ligne repliée à l\'ouverture « … (N) ▸ » ; un clic déplie, un autre replie', async () => {
    await ouvrir(vi.fn(), 20);
    expect(ligne()?.tagName).toBe('BUTTON');
    expect(ligne()?.textContent).toBe('Copropriétés déjà rattachées à ce syndic (2)▸');
    expect(ligne()?.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelectorAll('.fsy-copro')).toHaveLength(0);
    // le titre « Copropriétés » a laissé place à la ligne
    expect([...document.querySelectorAll('.fsy-sous-titre')].map((h) => h.textContent)).not.toContain('Copropriétés');
    await cliquer(ligne() as Element);
    expect(ligne()?.textContent).toBe('Copropriétés déjà rattachées à ce syndic (2)▾');
    expect(document.querySelectorAll('.fsy-copro')).toHaveLength(2);
    // le dépliage d'UNE copropriété est inchangé
    await cliquer(document.querySelector('.fsy-copro .fsy-copro-tete') as Element);
    expect(document.querySelector('.fsy-copro-contacts')).not.toBeNull();
    await cliquer(ligne() as Element);
    expect(document.querySelectorAll('.fsy-copro')).toHaveLength(0);
  });

  // LOT SYNDIC-BLOC-PORTEFEUILLE — CE QU'IL DISAIT AVANT : « + Ajouter une copropriété » reste visible. Il est retiré.
  it('COPROPRIÉTÉS : même format que les lignes repliées (même règle de style) ; plus de « + Ajouter une copropriété »', async () => {
    await ouvrir(vi.fn(), 20);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-contact-replie,.fsy-contact-tete-btn,.fsy-copros-ligne{width:100%;min-height:40px;');
    expect([...document.querySelectorAll('label > span')].some((x) => x.textContent === '+ Ajouter une copropriété (immeuble)')).toBe(false);
  });

  it('COPROPRIÉTÉS : aucune → « (0) », non dépliable', async () => {
    await ouvrir(vi.fn(), null);
    await cliquer(bouton('Créer un nouveau syndic'));
    expect(ligne()?.tagName).toBe('DIV');
    expect(ligne()?.textContent).toBe('Copropriétés déjà rattachées à ce syndic (0)');
  });

  it('« + Ajouter un contact » ABSENT pendant la création, de retour après Annuler', async () => {
    await ouvrir(vi.fn(), 20);
    await cliquer(plusContact() as Element);
    expect(plusContact()).toBeUndefined();
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Annuler'));
    expect(plusContact()).toBeDefined();
  });

  it('… de retour après Valider du nouveau contact', async () => {
    await ouvrir(vi.fn(), 20);
    await cliquer(plusContact() as Element);
    const bloc = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const nom = [...bloc.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await taper(nom, 'Neuf');
    await cliquer(boutonDans(bloc, 'Valider'));
    expect(plusContact()).toBeDefined();
  });

  it('… de retour après « Ajouter à cette copropriété » (depuis un bien, Catalogue + Nouveau contact ouverts)', async () => {
    await depuisLeBien22();
    await cliquer(plusContact() as Element);
    expect(document.querySelector('.fsy-catalogue')).not.toBeNull();
    expect(plusContact()).toBeUndefined();
    await cliquer(document.querySelector('.fsy-catalogue button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-catalogue .fsy-contact-ouvert'), 'Ajouter à cette copropriété'));
    expect(document.querySelector('.fsy-catalogue')).toBeNull();
    expect(plusContact()).toBeDefined();
  });

  it('… même règle depuis l\'écran « Syndics » (sans bien)', async () => {
    servir22();
    await ouvrir(vi.fn(), 22);
    await cliquer(plusContact() as Element);
    expect(document.querySelector('.fsy-catalogue')).toBeNull();
    expect(plusContact()).toBeUndefined();
  });
});

describe('LOT SYNDIC-MODALE-DEUX-BLOCS — deux blocs encadrés, l\'un sous l\'autre', () => {
  const bloc = (n: 1 | 2): HTMLElement => document.querySelector(`section[aria-labelledby="fsy-bloc-${n}"]`) as HTMLElement;
  const titre = (n: 1 | 2): string => bloc(n).querySelector('.fsy-cadre-titre')?.textContent ?? '';
  const servir22 = (): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      if (url === '/api/admin/gestion/syndics/22') { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 22 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const depuisLeBien = async (): Promise<void> => {
    servir22();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 22, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };
  const dans = (n: 1 | 2, el: Element | null): boolean => el !== null && bloc(n).contains(el);
  const noms = (n: 1 | 2): string[] => [...bloc(n).querySelectorAll(':scope > button.fsy-contact-replie')]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');

  it('depuis un BIEN : « Syndic de l’immeuble · adresse » puis « Syndic & portefeuille de gestion », dans cet ordre, encadrés', async () => {
    await depuisLeBien();
    expect(titre(1)).toBe('Syndic de l’immeuble · 12 rue X, 92400 Courbevoie');
    expect(titre(2)).toBe('Syndic & portefeuille de gestion'); // avant : « Gérer ce syndic »
    expect(bloc(1).compareDocumentPosition(bloc(2))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(bloc(1).className).toBe('fsy-cadre');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-cadre{display:flex;flex-direction:column;gap:.45rem;padding:10px 12px 12px;border:1px solid var(--color-svv-line);border-radius:12px;');
    expect(css).toContain('.fsy-deux-blocs{gap:1rem}');
    expect(bloc(1).querySelector('.fsy-cadre-titre')?.className).toContain('fsy-sous-titre');
  });

  it('depuis l’écran « Syndics » : « Coordonnées et contacts du cabinet » et « Contacts du cabinet » (tous)', async () => {
    await ouvrir(vi.fn(), 20);
    expect(titre(1)).toBe('Coordonnées et contacts du cabinet');
    expect(titre(2)).toBe('Syndic & portefeuille de gestion'); // avant : « Gérer ce syndic »
    expect([...bloc(1).querySelectorAll('h4.fsy-sous-titre')].map((h) => h.textContent)).toEqual(['Contacts du cabinet']);
    expect(noms(1)).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Yves TROIS']);
  });

  it('chaque élément dans le bon bloc, dans l’ordre demandé', async () => {
    await depuisLeBien();
    // BLOC 1 : coordonnées du cabinet, note, puis « Contacts de cet immeuble »
    for (const l of ['Nom du cabinet *', 'Adresse (rue) *', 'Code postal *', 'Ville *']) expect(dans(1, champ(l))).toBe(true);
    expect(dans(1, document.querySelector('input[aria-label="Téléphone standard"]'))).toBe(true);
    expect(dans(1, document.querySelector('input[aria-labelledby="fsy-email-generique"]'))).toBe(true);
    expect(dans(1, bouton('+ note'))).toBe(true);
    const sousTitre = bloc(1).querySelector('h4.fsy-sous-titre') as HTMLElement;
    expect(sousTitre.textContent).toBe('Contacts de cette copropriété'); // avant : « Contacts de cet immeuble »
    expect(noms(1)).toEqual(['Paul COMMUN', 'Marie DOUZE']);
    expect(champ('Nom du cabinet *').compareDocumentPosition(sousTitre)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // LOT SYNDIC-BLOC-AJOUT-CONTACT — CE QU'IL DISAIT AVANT : « + Ajouter un contact » en tête du BLOC 2. Il est
    // DÉPLACÉ en bas du bloc 1, sous la liste des contacts.
    expect(dans(1, bouton('+ Ajouter un contact'))).toBe(true);
    expect(sousTitre.compareDocumentPosition(bouton('+ Ajouter un contact'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // BLOC 2 — LOT SYNDIC-BLOC-PORTEFEUILLE, CE QU'IL DISAIT AVANT : copropriétés, « + Ajouter une copropriété », « Biens
    // qui recevront ce syndic ». Désormais : copropriétés, puis « Lots du portefeuille liés à ce syndic ».
    const ordre = [document.querySelector('.fsy-copros-ligne:not(.fsy-lots-ligne)'), document.querySelector('.fsy-lots-ligne')] as Element[];
    for (const el of ordre) expect(dans(2, el)).toBe(true);
    for (let i = 1; i < ordre.length; i++) expect(ordre[i - 1].compareDocumentPosition(ordre[i])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // rien n'est retiré : historique / trace / suppression restent sous les deux blocs
    expect(bloc(2).compareDocumentPosition(document.querySelector('.fsy-trace') as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(bouton('Supprimer ce syndic')).toBeTruthy();
  });

  /* LOT SYNDIC-BLOC-AJOUT-CONTACT — CE QU'IL DISAIT AVANT : le bloc d'ajout s'ouvrait DANS le bloc 2. Il a désormais
     SON PROPRE cadre, entre le bloc 1 et « Gérer ce syndic ». */
  it('le bloc d’ajout (Catalogue + Nouveau contact) s’ouvre dans SON PROPRE cadre, ni dans le bloc 1 ni dans le bloc 2', async () => {
    await depuisLeBien();
    await cliquer(bouton('+ Ajouter un contact'));
    const ajout = document.querySelector('section[aria-labelledby="fsy-bloc-ajout"]') as HTMLElement;
    expect(ajout.contains(document.querySelector('.fsy-catalogue'))).toBe(true);
    expect(ajout.contains(document.querySelector('.fsy-contact-edit'))).toBe(true);
    expect(dans(1, document.querySelector('.fsy-catalogue'))).toBe(false);
    expect(dans(2, document.querySelector('.fsy-catalogue'))).toBe(false);
  });

  it('un contact AJOUTÉ (catalogue ou création) apparaît aussitôt dans la liste du BLOC 1', async () => {
    await depuisLeBien();
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(document.querySelector('.fsy-catalogue button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-catalogue .fsy-contact-ouvert'), 'Ajouter à cette copropriété'));
    expect(noms(1)).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Anne ABEL']);
    await cliquer(bouton('+ Ajouter un contact'));
    const edit = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const nom = [...edit.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await taper(nom, 'Neuf');
    await cliquer(boutonDans(edit, 'Valider'));
    expect(noms(1)).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Anne ABEL', 'NEUF']); // le nom s'affiche en capitales
  });
});

describe('LOT SYNDIC-BLOC-AJOUT-CONTACT — l’ajout d’un contact a son propre bloc', () => {
  const bloc = (id: string): HTMLElement | null => document.querySelector(`section[aria-labelledby="${id}"]`);
  const titre = (id: string): string => bloc(id)?.querySelector('.fsy-cadre-titre')?.textContent ?? '';
  const plus = (): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '+ Ajouter un contact') as HTMLButtonElement | undefined;
  const noms1 = (): string[] => [...(bloc('fsy-bloc-1')?.querySelectorAll(':scope > button.fsy-contact-replie') ?? [])]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const servir22 = (): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      if (url === '/api/admin/gestion/syndics/22') { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 22 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const depuisLeBien = async (): Promise<ReturnType<typeof vi.fn>> => {
    servir22();
    const onFerme = vi.fn();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 22, onFerme, immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    return onFerme;
  };
  const depuisSyndics = async (): Promise<ReturnType<typeof vi.fn>> => { servir22(); return ouvrir(vi.fn(), 22); };

  it('depuis un BIEN : bloc 1, puis « Ajouter un contact syndic à cette copropriété » (pendant l’ajout seulement), puis « Gérer ce syndic »', async () => {
    await depuisLeBien();
    expect(bloc('fsy-bloc-ajout')).toBeNull();
    await cliquer(plus() as Element);
    const ordre = [bloc('fsy-bloc-1'), bloc('fsy-bloc-ajout'), bloc('fsy-bloc-2')] as HTMLElement[];
    expect(ordre.every((b) => b !== null)).toBe(true);
    for (let i = 1; i < 3; i++) expect(ordre[i - 1].compareDocumentPosition(ordre[i])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(titre('fsy-bloc-ajout')).toBe('Ajouter un contact syndic à cette copropriété'); // avant : « … à cet immeuble »
    expect(bloc('fsy-bloc-ajout')?.className).toContain('fsy-cadre');
    expect(bloc('fsy-bloc-ajout')?.querySelector('.fsy-cadre-titre')?.className).toContain('fsy-sous-titre');
  });

  it('depuis l’écran « Syndics » : « Ajouter un contact au cabinet », sans catalogue', async () => {
    await depuisSyndics();
    await cliquer(plus() as Element);
    expect(titre('fsy-bloc-ajout')).toBe('Ajouter un contact au cabinet');
    expect(bloc('fsy-bloc-ajout')?.querySelector('.fsy-catalogue')).toBeNull();
    expect(bloc('fsy-bloc-ajout')?.querySelectorAll('.fsy-sous-cadre')).toHaveLength(1);
  });

  it('« + Ajouter un contact » est DANS le bloc 1, sous la liste, et MASQUÉ pendant l’ajout', async () => {
    await depuisLeBien();
    expect(bloc('fsy-bloc-1')?.contains(plus() as Node)).toBe(true);
    expect(bloc('fsy-bloc-2')?.contains(plus() as Node)).toBe(false);
    await cliquer(plus() as Element);
    expect(plus()).toBeUndefined();
  });

  it('les deux sous-cadres, dans l’ordre, chacun avec son intertitre : Catalogue, puis Nouveau contact', async () => {
    await depuisLeBien();
    await cliquer(plus() as Element);
    const sc = [...(bloc('fsy-bloc-ajout')?.querySelectorAll(':scope > .fsy-sous-cadre') ?? [])];
    expect(sc).toHaveLength(2);
    expect(sc[0].querySelector('.fsy-catalogue-titre')?.textContent).toBe('Catalogue des contacts du syndic (6)');
    expect(sc[1].querySelector('legend')?.textContent).toBe('Nouveau contact');
  });

  it('« × Fermer » ferme tout le bloc sans rien rattacher ni créer ; le bouton réapparaît', async () => {
    const onFerme = await depuisLeBien();
    await cliquer(plus() as Element);
    const edit = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const nom = [...edit.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await taper(nom, 'Pas créé');
    const fermer = bloc('fsy-bloc-ajout')?.querySelector('.fsy-fermer-ajout') as HTMLButtonElement;
    expect(fermer.textContent).toBe('× Fermer');
    expect(fermer.closest('.fsy-cadre-tete')).not.toBeNull();
    await cliquer(fermer);
    expect(bloc('fsy-bloc-ajout')).toBeNull();
    expect(plus()).toBeDefined();
    expect(noms1()).toEqual(['Paul COMMUN', 'Marie DOUZE']);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(appels.some((x) => x.methode === 'PUT' || x.methode === 'POST')).toBe(false);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('catalogue VIDE : le bloc d’ajout n’a que « Nouveau contact »', async () => {
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 11, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    await cliquer(plus() as Element);
    expect(bloc('fsy-bloc-ajout')?.querySelector('.fsy-catalogue')).toBeNull();
    expect(bloc('fsy-bloc-ajout')?.querySelector('legend')?.textContent).toBe('Nouveau contact');
  });

  it('ajout par le CATALOGUE, puis par CRÉATION : chaque fois le bloc se ferme et le contact apparaît dans le bloc 1', async () => {
    await depuisLeBien();
    await cliquer(plus() as Element);
    await cliquer(document.querySelector('.fsy-catalogue button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-catalogue .fsy-contact-ouvert'), 'Ajouter à cette copropriété'));
    expect(bloc('fsy-bloc-ajout')).toBeNull();
    expect(noms1()).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Anne ABEL']);
    await cliquer(plus() as Element);
    const edit = document.querySelector('.fsy-contact-edit') as HTMLElement;
    const nom = [...edit.querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await taper(nom, 'Neuf');
    await cliquer(boutonDans(edit, 'Valider'));
    expect(bloc('fsy-bloc-ajout')).toBeNull();
    expect(noms1()).toEqual(['Paul COMMUN', 'Marie DOUZE', 'Anne ABEL', 'NEUF']);
  });
});

describe('LOT SYNDIC-TITRES-COPROPRIETE — « copropriété » depuis un bien, « cabinet » sans bien', () => {
  const titreAjout = (): string => document.querySelector('section[aria-labelledby="fsy-bloc-ajout"] .fsy-cadre-titre')?.textContent ?? '';
  const intertitre = (): string => document.querySelector('section[aria-labelledby="fsy-bloc-1"] h4.fsy-sous-titre')?.textContent ?? '';
  const plus = (): HTMLButtonElement => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '+ Ajouter un contact') as HTMLButtonElement;

  it('depuis un BIEN : « Contacts de cette copropriété » et « Ajouter un contact syndic à cette copropriété », mêmes styles', async () => {
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 20, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    expect(intertitre()).toBe('Contacts de cette copropriété');
    await cliquer(plus());
    expect(titreAjout()).toBe('Ajouter un contact syndic à cette copropriété');
    expect(document.querySelector('section[aria-labelledby="fsy-bloc-ajout"] .fsy-cadre-titre')?.className).toContain('fsy-sous-titre');
  });

  it('sans bien (écran « Syndics ») : « Contacts du cabinet » et « Ajouter un contact au cabinet », inchangés', async () => {
    await ouvrir(vi.fn(), 20);
    expect(intertitre()).toBe('Contacts du cabinet');
    await cliquer(plus());
    expect(titreAjout()).toBe('Ajouter un contact au cabinet');
  });
});

describe('LOT SYNDIC-BOUTON-AJOUT-CENTRE', () => {
  const plus = (): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '+ Ajouter un contact') as HTMLButtonElement | undefined;
  const verifier = async (): Promise<void> => {
    const b = plus() as HTMLButtonElement;
    expect(b.parentElement?.className).toBe('fsy-ajout-centre');
    expect(b.className).toBe('svv-btn svv-btn-outline gst-btn fsy-ajout'); // taille et style inchangés
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-ajout-centre{display:flex;justify-content:center}');
    await cliquer(b);
    expect(plus()).toBeUndefined();
    expect(document.querySelector('.fsy-ajout-centre')).toBeNull();
    await cliquer(document.querySelector('.fsy-fermer-ajout') as Element);
    expect(plus()?.parentElement?.className).toBe('fsy-ajout-centre');
  };
  it('centré en bas du bloc 1 depuis un bien ; masqué pendant l’ajout, de retour centré après', async () => {
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 20, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    expect(document.querySelector('section[aria-labelledby="fsy-bloc-1"]')?.contains(plus() as Node)).toBe(true);
    await verifier();
  });
  it('… et depuis l’écran « Syndics »', async () => {
    await ouvrir(vi.fn(), 20);
    await verifier();
  });
});

describe('LOT SYNDIC-DETACHER-DE-LA-COPROPRIETE', () => {
  type Corps = { contacts: Array<{ prenom: string; nom: string; tousImmeubles: boolean; immeubles: string[] }> };
  /** Marie suit les DEUX copropriétés ; Paul suit « Tous les immeubles ». */
  const FICHE_24 = { ...FICHE_22, id: 24, contacts: FICHE_22.contacts.map((c) => (c.id === 32 ? { ...c, immeubles: ['12 rue x', '3 av y'] } : c)) };
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  const bloc1 = (): HTMLElement => document.querySelector('section[aria-labelledby="fsy-bloc-1"]') as HTMLElement;
  const noms1 = (): string[] => [...bloc1().querySelectorAll(':scope > button.fsy-contact-replie, :scope > .fsy-contact-ouvert .fsy-contact-tete-btn')]
    .map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const put = (): Corps => appels.find((x) => x.methode === 'PUT')?.corps as Corps;
  const servir = (fiche: unknown, id: number): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `/api/admin/gestion/syndics/${id}` && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche }) };
      if (url === `/api/admin/gestion/syndics/${id}`) { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const depuisLeBien = async (): Promise<ReturnType<typeof vi.fn>> => {
    servir(FICHE_24, 24);
    const onFerme = vi.fn();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 24, onFerme, immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    return onFerme;
  };
  const ouvrirContact = async (nom: string): Promise<HTMLElement> => {
    const b = [...bloc1().querySelectorAll(':scope > button.fsy-contact-replie')].find((x) => x.querySelector('.fsy-contact-nom')?.textContent === nom) as Element;
    await cliquer(b);
    return bloc1().querySelector('.fsy-contact-ouvert') as HTMLElement;
  };
  const detacherLe = async (nom: string): Promise<void> => {
    const o = await ouvrirContact(nom);
    await cliquer(boutonDans(o, 'Détacher de la copropriété'));
  };

  it('le BOUTON « Détacher de la copropriété » remplace « Supprimer ce contact » : à gauche, gabarit de « Fermer », texte rouge', async () => {
    await depuisLeBien();
    const o = await ouvrirContact('Marie DOUZE');
    const boutons = [...o.querySelectorAll('.fsy-boutons button')] as HTMLButtonElement[];
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['Détacher de la copropriété', 'Fermer', 'Modifier']);
    expect(boutons[0].className).toBe('svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-detacher fsy-pousse-gauche');
    expect(boutons[1].className).toBe('svv-btn svv-btn-outline gst-btn fsy-mini-btn');
    expect(o.textContent).not.toContain('Supprimer ce contact');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.gst-btn.fsy-detacher{color:var(--color-svv-red)}');
  });

  it('après détachement : absent de « Contacts de cette copropriété », présent au Catalogue, compteur à jour', async () => {
    await depuisLeBien();
    expect(noms1()).toEqual(['Paul COMMUN', 'Marie DOUZE']);
    await detacherLe('Marie DOUZE');
    expect(noms1()).toEqual(['Paul COMMUN']);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(document.querySelector('.fsy-catalogue-titre')?.textContent).toBe('Catalogue des contacts du syndic (7)');
    expect([...document.querySelectorAll('.fsy-catalogue button.fsy-contact-replie .fsy-contact-nom')].map((x) => x.textContent)).toContain('Marie DOUZE');
  });

  it('Valider : seule l’affectation à CETTE copropriété est retirée ; ses autres restent ; toujours au catalogue', async () => {
    await depuisLeBien();
    await detacherLe('Marie DOUZE');
    await cliquer(boutonDans(pied(), 'Valider'));
    const c = put().contacts;
    expect(c.find((x) => x.nom === 'Douze')).toMatchObject({ tousImmeubles: false, immeubles: ['3 av y'] });
    expect(c.find((x) => x.nom === 'Trois')).toMatchObject({ immeubles: ['3 av y'] });
    expect(c).toHaveLength(FICHE_24.contacts.length);
  });

  it('Annuler : rien n’est écrit', async () => {
    const onFerme = await depuisLeBien();
    await detacherLe('Marie DOUZE');
    await cliquer(boutonDans(pied(), 'Annuler'));
    expect(pied()?.textContent).toContain('Abandonner les modifications ?');
    await cliquer(boutonDans(pied(), 'Oui, abandonner'));
    expect(onFerme).toHaveBeenCalledTimes(1);
    expect(appels.some((x) => x.methode === 'PUT')).toBe(false);
  });

  it('« Tous les immeubles » : le détacher le rattache EXPLICITEMENT à toutes les AUTRES copropriétés', async () => {
    await depuisLeBien();
    await detacherLe('Paul COMMUN');
    expect(noms1()).toEqual(['Marie DOUZE']);
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts.find((x) => x.nom === 'Commun')).toMatchObject({ tousImmeubles: false, immeubles: ['3 av y'] });
  });

  it('rattacher de nouveau par le Catalogue, « Ajouter à cette copropriété »', async () => {
    await depuisLeBien();
    await detacherLe('Marie DOUZE');
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(document.querySelector('.fsy-catalogue input[type="search"]') as HTMLInputElement, 'douze');
    await cliquer(document.querySelector('.fsy-catalogue button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-catalogue .fsy-contact-ouvert'), 'Ajouter à cette copropriété'));
    expect(noms1()).toEqual(['Paul COMMUN', 'Marie DOUZE']);
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts.find((x) => x.nom === 'Douze')?.immeubles.sort()).toEqual(['12 rue x', '3 av y']);
  });

  it('écran « Syndics » (sans bien) : « Supprimer ce contact » inchangé, pas de « Détacher »', async () => {
    servir(FICHE_24, 24);
    await ouvrir(vi.fn(), 24);
    const o = await ouvrirContact('Marie DOUZE');
    expect([...o.querySelectorAll('button')].some((b) => b.textContent?.includes('Détacher'))).toBe(false);
    const sup = [...o.querySelectorAll('button')].find((b) => b.textContent === 'Supprimer ce contact') as HTMLButtonElement;
    expect(sup.className).toBe('fsy-lien-bouton fsy-pousse-gauche');
  });
});

describe('LOT SYNDIC-CONTACTS-ANTI-DOUBLON — à la saisie', () => {
  let ailleurs: { emails: unknown[]; noms: unknown[] } = { emails: [], noms: [] };
  const servir22 = (): void => {
    ailleurs = { emails: [], noms: [] };
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/admin/gestion/syndics/doublons')) { appels.push({ url, methode: 'GET', corps: null }); return { ok: true, json: async () => ({ etat: 'ok', ...ailleurs }) }; }
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      if (url === '/api/admin/gestion/syndics/22') { appels.push({ url, methode: init?.method ?? 'GET', corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 22 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const depuisLeBien = async (): Promise<void> => {
    servir22();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 22, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };
  const depuisSyndics = async (): Promise<void> => { servir22(); await ouvrir(vi.fn(), 22); };
  const bloc = (): HTMLElement => document.querySelector('.fsy-contact-edit') as HTMLElement;
  const champC = (l: string): HTMLInputElement => [...bloc().querySelectorAll('label')]
    .find((x) => x.querySelector('span')?.textContent === l)?.querySelector('input') as HTMLInputElement;
  const quitter = async (el: HTMLInputElement): Promise<void> => { await act(async () => { el.focus(); el.blur(); }); await calmer(); };
  const valider = (): HTMLButtonElement => boutonDans(bloc(), 'Valider');
  const nouveauAvecEmail = async (email: string): Promise<HTMLInputElement> => {
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(boutonDans(bloc(), '+ e-mail'));
    const champ = bloc().querySelector('input[aria-label="E-mail du contact"]') as HTMLInputElement;
    await taper(champ, email);
    await quitter(champ);
    return champ;
  };
  const rouge = (): string[] => [...bloc().querySelectorAll('.fsy-doublon')].map((p) => p.textContent ?? '');

  it('E-MAIL en double DANS ce syndic (casse, espaces) : message rouge sous le champ, Valider désactivé', async () => {
    await depuisSyndics();
    const champ = await nouveauAvecEmail(' ELODIE@test.invalid');
    expect(rouge()).toEqual(['Ce contact existe déjà : Élodie ÉTÉ · Service comptabilité · _TEST Cabinet Sept / Paris']);
    expect(champ.closest('.fsy-coord-edit')?.querySelector('.fsy-doublon')).not.toBeNull();
    expect(valider().disabled).toBe(true);
  });

  it('E-MAIL en double dans un AUTRE syndic : bloquant aussi, avec « NOM / Ville » de l’autre syndic', async () => {
    await depuisSyndics();
    ailleurs = { emails: [{ prenom: 'Mathis', nom: 'BERCIER', titre: 'Service comptabilité', syndicId: 9, syndicNom: '_TEST AUTRE', syndicVille: 'Lyon' }], noms: [] };
    await nouveauAvecEmail('mathis@ailleurs.invalid');
    expect(appels.some((a) => a.url.includes('/doublons?syndic=22&') && a.url.includes('mathis%40ailleurs.invalid'))).toBe(true);
    expect(rouge()).toEqual(['Ce contact existe déjà : Mathis BERCIER · Service comptabilité · _TEST AUTRE / Lyon']);
    expect(valider().disabled).toBe(true);
  });

  it('NOM en double dans ce syndic (accents, casse, tirets) : bloqué ; déjà dans la copropriété ⇒ « déjà rattaché à cette copropriété »', async () => {
    await depuisLeBien();
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(champC('Prénom'), 'MARIE');
    await taper(champC('Nom'), 'douze');
    await quitter(champC('Nom'));
    expect(rouge()).toEqual(['Ce contact existe déjà : Marie DOUZE · Responsable de copropriété · _TEST Cabinet Sept / Paris — déjà rattaché à cette copropriété']);
    expect(bloc().textContent).not.toContain('Voir dans le catalogue');
    expect(valider().disabled).toBe(true);
  });

  it('NOM en double encore au Catalogue : « Voir dans le catalogue » fait défiler et déplie sa tuile', async () => {
    await depuisLeBien();
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(document.querySelector('.fsy-catalogue input[type="search"]') as HTMLInputElement, 'abel');
    await taper(champC('Prénom'), 'Elodie');
    await taper(champC('Nom'), 'ete');
    await quitter(champC('Nom'));
    expect(rouge()[0]).toBe('Ce contact existe déjà : Élodie ÉTÉ · Service comptabilité · _TEST Cabinet Sept / Paris · Voir dans le catalogue');
    await cliquer(boutonDans(bloc(), 'Voir dans le catalogue'));
    await attendre(10);
    expect((document.querySelector('.fsy-catalogue input[type="search"]') as HTMLInputElement).value).toBe('');
    const ouverte = document.querySelector('.fsy-catalogue .fsy-contact-ouvert') as HTMLElement;
    expect(ouverte.getAttribute('data-cle-ouverte')).not.toBeNull();
    expect(ouverte.querySelector('.fsy-contact-nom')?.textContent).toBe('Élodie ÉTÉ');
    expect(boutonDans(ouverte, 'Ajouter à cette copropriété')).toBeTruthy();
  });

  it('NOM identique dans un AUTRE syndic : simple avertissement orange, Valider reste possible', async () => {
    await depuisSyndics();
    ailleurs = { emails: [], noms: [{ prenom: 'Jean', nom: 'NEUF', titre: null, syndicId: 9, syndicNom: '_TEST AUTRE', syndicVille: 'Lyon' }] };
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(champC('Prénom'), 'Jean');
    await taper(champC('Nom'), 'Neuf');
    await quitter(champC('Nom'));
    expect(rouge()).toEqual([]);
    expect(bloc().querySelector('.fsy-avertissement')?.textContent).toBe('Un contact du même nom existe chez _TEST AUTRE / Lyon');
    expect(valider().disabled).toBe(false);
    await cliquer(valider());
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
  });

  it('au VALIDER du contact, la vérification est refaite et bloque', async () => {
    await depuisSyndics();
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(boutonDans(bloc(), '+ e-mail'));
    await act(async () => {
      const champ = bloc().querySelector('input[aria-label="E-mail du contact"]') as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(champ, 'elodie@test.invalid'); champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await taper(champC('Nom'), 'Autre'); // pas de « blur » sur l'e-mail
    await cliquer(valider());
    expect(document.querySelector('.fsy-contact-edit')).not.toBeNull();
    expect(rouge()[0]).toContain('Élodie ÉTÉ');
  });

  it('MODIFICATION d’un contact existant vers un e-mail déjà pris : bloquée', async () => {
    await depuisSyndics();
    const marie = [...document.querySelectorAll('button.fsy-contact-replie')].find((b) => b.textContent?.includes('Marie DOUZE')) as Element;
    await cliquer(marie);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await cliquer(boutonDans(bloc(), '+ e-mail'));
    const champ = bloc().querySelector('input[aria-label="E-mail du contact"]') as HTMLInputElement;
    await taper(champ, 'Elodie@Test.invalid');
    await quitter(champ);
    expect(rouge()[0]).toBe('Ce contact existe déjà : Élodie ÉTÉ · Service comptabilité · _TEST Cabinet Sept / Paris');
    expect(valider().disabled).toBe(true);
  });

  it('le contact lui-même n’est pas son propre doublon (modification sans changement de nom)', async () => {
    await depuisSyndics();
    const marie = [...document.querySelectorAll('button.fsy-contact-replie')].find((b) => b.textContent?.includes('Marie DOUZE')) as Element;
    await cliquer(marie);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await quitter(champC('Nom'));
    expect(rouge()).toEqual([]);
  });
});

describe('LOT SYNDIC-BLOC-PORTEFEUILLE — « Syndic & portefeuille de gestion »', () => {
  const lot = (id: number, numero: string, adresse: string, proprietaires: string[]) => ({
    id, numero, adresse, commune: 'COURBEVOIE', proprietaires, triProprietaire: proprietaires[0] ? proprietaires[0].replace(/^(M\.|Mme)\s+/, '').toLowerCase() : undefined,
  });
  const IMM = [
    { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', syndic: { id: 20, nom: '_TEST Grand Cabinet', ville: 'Paris' },
      lots: [lot(1, '101', '12 rue X', ['M. ZOLA']), lot(4, '9', '12 rue X', ['Mme ABEL', 'M. JULLIEN']), lot(5, '100', '12 rue X', [])] },
    { cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', syndic: { id: 20, nom: '_TEST Grand Cabinet', ville: 'Paris' },
      lots: [lot(2, '201', '3 av Y', ['M. DUPONT'])] },
    { cle: '8 rue abel', libelle: '8 rue Abel', codePostal: '92400', commune: 'Courbevoie', syndic: null,
      lots: [lot(3, '301', '8 rue Abel', ['M. MARTIN'])] },
  ];
  const FICHE_25 = { ...FICHE_20, id: 25, coproprietes: [
    { id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
    { id: 7, cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
    { id: 9, cle: '8 rue abel', libelle: '8 rue Abel', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
  ] };
  const servir = async (): Promise<void> => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return { ok: true, json: async () => ({ etat: 'ok', disponible: true, immeubles: IMM }) };
      if (url === '/api/admin/gestion/syndics/25' && m === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_25 }) };
      if (m !== 'GET') { appels.push({ url, methode: m, corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 25 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
  };
  const ouvrirDepuis = async (libelle: string | null, syndicId: number | null = 25): Promise<void> => {
    await servir();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId, onFerme: vi.fn(),
        immeubleDepart: libelle === null ? null : { libelle, codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };
  const ligneLots = (): HTMLElement | null => document.querySelector('.fsy-lots-ligne');
  const groupes = (): Array<{ adresse: string; lots: string[] }> => [...document.querySelectorAll('.fsy-lots-groupe')].map((g) => ({
    adresse: g.querySelector('.fsy-lots-adresse')?.textContent ?? '',
    lots: [...g.querySelectorAll('.fsy-lot')].map((l) => l.textContent ?? ''),
  }));

  it('titre « Syndic & portefeuille de gestion » ; « + Ajouter une copropriété » absent ; « Biens qui recevront » remplacé', async () => {
    await ouvrirDepuis('12 rue X');
    expect(document.querySelector('section[aria-labelledby="fsy-bloc-2"] .fsy-cadre-titre')?.textContent).toBe('Syndic & portefeuille de gestion');
    expect([...document.querySelectorAll('label > span')].some((x) => x.textContent === '+ Ajouter une copropriété (immeuble)')).toBe(false);
    expect(document.querySelector('details.fsy-biens')).toBeNull();
    expect(document.body.textContent).not.toContain('Biens qui recevront ce syndic');
  });

  it('la ligne « Lots du portefeuille liés à ce syndic (N) » : sous les copropriétés, même format, repliée, puis dépliée et repliée', async () => {
    await ouvrirDepuis('12 rue X');
    const l = ligneLots() as HTMLElement;
    expect(l.tagName).toBe('BUTTON');
    expect(l.className).toContain('fsy-copros-ligne');
    expect(l.textContent).toBe('Lots du portefeuille liés à ce syndic (5)▸');
    expect(document.querySelector('.fsy-copros-ligne')?.compareDocumentPosition(l)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(document.querySelector('.fsy-lots')).toBeNull();
    await cliquer(l);
    expect(ligneLots()?.textContent).toBe('Lots du portefeuille liés à ce syndic (5)▾');
    expect(document.querySelector('.fsy-lots')).not.toBeNull();
    await cliquer(ligneLots() as Element);
    expect(document.querySelector('.fsy-lots')).toBeNull();
  });

  it('ORDRE depuis un bien : sa copropriété d’abord, puis par voie (sans numéro) ; dans un groupe, par premier propriétaire puis numéro', async () => {
    await ouvrirDepuis('12 rue X');
    await cliquer(ligneLots() as Element);
    const g = groupes();
    expect(g.map((x) => x.adresse)).toEqual(['12 rue X, 92400 Courbevoie', '3 av Y, 92400 Courbevoie', '8 rue Abel, 92400 Courbevoie']);
    // LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — CE QU'IL DISAIT AVANT : propriétaires nus à droite, « propriétaire non
    // renseigné » en minuscule. Désormais « Propriétaire(s) : … » sur la 2e ligne ; « Propriétaire non renseigné ».
    expect(g[0].lots).toEqual([
      'lot 9 — 12 rue X, COURBEVOIEPropriétaires : Mme ABEL · M. JULLIEN',
      'lot 101 — 12 rue X, COURBEVOIEPropriétaire : M. ZOLA',
      'lot 100 — 12 rue X, COURBEVOIEPropriétaire non renseigné',
    ]);
  });

  it('ORDRE depuis l’écran « Syndics » : toutes les adresses par voie puis numéro', async () => {
    await ouvrirDepuis(null);
    await cliquer(ligneLots() as Element);
    expect(groupes().map((x) => x.adresse)).toEqual(['3 av Y, 92400 Courbevoie', '8 rue Abel, 92400 Courbevoie', '12 rue X, 92400 Courbevoie']);
  });

  // LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — CE QU'IL DISAIT AVANT : « plusieurs propriétaires à droite » (colonne de
  // droite, margin-left:auto). Désormais sous le lot, à gauche, préfixés « Propriétaires : ».
  it('plusieurs propriétaires : « Propriétaires : A · B », sous le lot, à gauche, sans « … »', async () => {
    await ouvrirDepuis('12 rue X');
    await cliquer(ligneLots() as Element);
    const p = [...document.querySelectorAll('.fsy-lot-proprios')].map((x) => x.textContent);
    expect(p).toContain('Propriétaires : Mme ABEL · M. JULLIEN');
    expect(p).toContain('Propriétaire : M. ZOLA');
    expect(p.join('')).not.toContain('…');
  });

  // LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — CE QU'IL DISAIT AVANT : la mention grise « · au Valider ». Désormais la
  // pastille orange « en attente de validation », après l'adresse, avec son info-bulle.
  it('« en attente de validation » et PROPAGATION : un nouveau syndic créé depuis un bien liste ses lots en attente, puis les enregistre', async () => {
    await ouvrirDepuis('8 rue Abel', null);
    await cliquer(bouton('Créer un nouveau syndic'));
    await cliquer(ligneLots() as Element);
    expect(groupes()).toEqual([{ adresse: '8 rue Abel, 92400 Courbevoie',
      lots: ['lot 301 — 8 rue Abel, COURBEVOIE en attente de validationPropriétaire : M. MARTIN'] }]);
    const pastille = document.querySelector('.fsy-lot-ligne1 .fsy-pastille-attente') as HTMLElement;
    expect(pastille.textContent).toBe('en attente de validation');
    expect(pastille.title).toBe('Ce lot recevra ce syndic quand vous cliquerez sur Valider');
    expect(pastille.parentElement?.textContent).toBe('lot 301 — 8 rue Abel, COURBEVOIE en attente de validation'); // après l'adresse
    expect(pastille.nextSibling).toBeNull();
    expect(document.querySelector('.fsy-lots')?.textContent).not.toContain('au Valider');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toMatch(/\.fsy-pastille-attente\{[^}]*border-radius:999px;background:var\(--color-svv-orange-soft\);\s*color:var\(--color-svv-orange\)/);
    await taper(champ('Nom du cabinet *'), '_TEST Nouveau');
    await taper(champ('Adresse (rue) *'), '1 rue _TEST');
    await taper(champ('Code postal *'), '92400');
    await taper(champ('Ville *'), 'Courbevoie');
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect((appels.find((a) => a.methode === 'POST')?.corps as { immeubles: Array<{ libelle: string }> }).immeubles.map((i) => i.libelle)).toEqual(['8 rue Abel']);
  });

  it('les copropriétés déjà enregistrées ne portent ni « au Valider » ni la pastille d’attente', async () => {
    await ouvrirDepuis('12 rue X');
    await cliquer(ligneLots() as Element);
    expect(document.body.textContent).not.toContain('au Valider');
    expect(document.querySelector('.fsy-pastille-attente')).toBeNull();
  });

  it('LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — DEUX LIGNES par lot : le lot, puis le(s) propriétaire(s) dessous, à gauche, en petit gris', async () => {
    await ouvrirDepuis('12 rue X');
    await cliquer(ligneLots() as Element);
    for (const li of document.querySelectorAll('.fsy-lot')) {
      expect([...li.children].map((x) => x.className)).toEqual(['fsy-lot-ligne1', 'fsy-lot-proprios']);
      expect(li.children[0].querySelector('strong')?.textContent).toMatch(/^lot \d+$/);
    }
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-lot{display:flex;flex-direction:column;align-items:flex-start;');
    expect(css).toContain('.fsy-lot + .fsy-lot{margin-top:'); // un petit espace entre deux lots
    const regle = css.match(/\.fsy-lot-proprios\{[^}]*\}/)?.[0] ?? '';
    expect(regle).toContain('text-align:left');
    expect(regle).toContain('color:var(--color-svv-muted)');
    expect(regle).toContain('overflow-wrap:anywhere');
    expect(regle).not.toMatch(/margin-left:auto|text-overflow|ellipsis|nowrap/);
  });

  it('LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — un nom très long : rendu EN ENTIER, tel qu’en base, sans troncature', async () => {
    const LONG = 'M. JULLIEN - GARRIDO Jean-Baptiste Maximilien de la Tour d’Auvergne et Consorts Indivision';
    const avant = IMM[0].lots[2].proprietaires;
    IMM[0].lots[2].proprietaires = [LONG, 'mme petit'];
    try {
      await ouvrirDepuis('12 rue X');
      await cliquer(ligneLots() as Element);
      const p = [...document.querySelectorAll('.fsy-lot-proprios')].map((x) => x.textContent);
      expect(p).toContain(`Propriétaires : ${LONG} · mme petit`); // casse et texte d'origine, intacts
      expect(p.join('')).not.toContain('…');
      const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
      expect(css.match(/\.fsy-lot-proprios\{[^}]*\}/)?.[0]).toContain('white-space:normal');
    } finally { IMM[0].lots[2].proprietaires = avant; }
  });

  it('LOT SYNDIC-LOTS-DEUX-LIGNES-ET-PASTILLE — aucun propriétaire : « Propriétaire non renseigné » en gris, sur la 2e ligne', async () => {
    await ouvrirDepuis('12 rue X');
    await cliquer(ligneLots() as Element);
    const li = [...document.querySelectorAll('.fsy-lot')].find((x) => x.querySelector('strong')?.textContent === 'lot 100') as HTMLElement;
    expect(li.children[1].className).toBe('fsy-lot-proprios');
    expect(li.children[1].textContent).toBe('Propriétaire non renseigné');
  });
});

describe('LOT SYNDIC-NOTE-PAR-BIEN-ET-GROUPES-COPROS', () => {
  type Corps = { note: string; noteBien: { lotId: number; texte: string } | null };
  /** Le « serveur » : une note par couple (lot, syndic), et la note générale du cabinet. */
  let notes: Record<string, string> = {};
  let noteCabinet: string | null = null;
  const IMM = [
    { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', syndic: { id: 30, nom: '_TEST Notes', ville: 'Paris' },
      lots: [{ id: 101, numero: '101', adresse: '12 rue X', commune: 'COURBEVOIE', proprietaires: ['M. A'], triProprietaire: 'a' },
        { id: 102, numero: '102', adresse: '12 rue X', commune: 'COURBEVOIE', proprietaires: ['M. B'], triProprietaire: 'b' }] },
    { cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', syndic: { id: 30, nom: '_TEST Notes', ville: 'Paris' },
      lots: [{ id: 201, numero: '201', adresse: '3 av Y', commune: 'COURBEVOIE', proprietaires: ['M. C'], triProprietaire: 'c' }] },
  ];
  const fiche30 = (lot: string | null) => ({
    ...FICHE, id: 30, nom: '_TEST Notes', note: noteCabinet,
    coproprietes: [
      { id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
      { id: 7, cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
    ],
    noteBien: lot === null ? null : (notes[lot] ?? null),
  });
  const servir = async (): Promise<void> => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return { ok: true, json: async () => ({ etat: 'ok', disponible: true, immeubles: IMM }) };
      if (url.startsWith('/api/admin/gestion/syndics/30') && m === 'GET') {
        appels.push({ url, methode: m, corps: null });
        return { ok: true, json: async () => ({ etat: 'ok', fiche: fiche30(new URL(`http://x${url}`).searchParams.get('lot')) }) };
      }
      if (url === '/api/admin/gestion/syndics/30') {
        const c = JSON.parse(String(init?.body)) as Corps;
        appels.push({ url, methode: m, corps: c });
        if (c.noteBien) notes[String(c.noteBien.lotId)] = c.noteBien.texte; // ce que fait le serveur pour CE couple
        noteCabinet = c.note === '' ? null : c.note;
        return { ok: true, json: async () => ({ ok: true, id: 30 }) };
      }
      return (avant as typeof fetch)(url, init);
    }));
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
  };
  const ouvrirBien = async (lot: number | null, libelle: string | null = '12 rue X'): Promise<ReturnType<typeof vi.fn>> => {
    act(() => { root.unmount(); }); root = createRoot(container);
    const onFerme = vi.fn();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 30, onFerme, lotDepart: lot,
        immeubleDepart: libelle === null ? null : { libelle, codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    return onFerme;
  };
  const libelles = (): string[] => [...document.querySelectorAll('.fsy-corps .fsy-champ > span')].map((x) => x.textContent ?? '');
  const zoneNote = (): HTMLTextAreaElement | null => {
    const l = [...document.querySelectorAll('.fsy-corps label')].find((x) => x.querySelector('span')?.textContent === 'Note pour ce bien');
    return (l?.querySelector('textarea') as HTMLTextAreaElement | undefined) ?? null;
  };
  const ecrire = async (z: HTMLTextAreaElement, v: string): Promise<void> => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => { set?.call(z, v); z.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  beforeEach(async () => { notes = {}; noteCabinet = null; await servir(); });

  it('depuis un bien : la fiche est lue POUR CE LOT, « Note pour ce bien » VIDE par défaut (« + note »)', async () => {
    await ouvrirBien(101);
    expect(appels.some((a) => a.url === '/api/admin/gestion/syndics/30?lot=101')).toBe(true);
    expect(zoneNote()).toBeNull();
    await cliquer(bouton('+ note'));
    expect(zoneNote()?.value).toBe('');
    expect(libelles()).toContain('Note pour ce bien');
    expect(libelles()).not.toContain('Note');
  });

  it('note écrite sur le bien A, INVISIBLE sur le bien B du même syndic ; relue sur A', async () => {
    await ouvrirBien(101);
    await cliquer(bouton('+ note'));
    await ecrire(zoneNote() as HTMLTextAreaElement, 'Clé chez la gardienne');
    await cliquer(boutonDans(pied(), 'Valider'));
    expect((appels.find((a) => a.methode === 'PUT')?.corps as Corps).noteBien).toEqual({ lotId: 101, texte: 'Clé chez la gardienne' });
    await ouvrirBien(102);
    expect(zoneNote()).toBeNull(); // bien B : rien
    expect(document.body.textContent).not.toContain('Clé chez la gardienne');
    await ouvrirBien(101);
    expect(zoneNote()?.value).toBe('Clé chez la gardienne');
  });

  it('Annuler : la note du bien n’est pas écrite', async () => {
    const onFerme = await ouvrirBien(101);
    await cliquer(bouton('+ note'));
    await ecrire(zoneNote() as HTMLTextAreaElement, 'Brouillon');
    await cliquer(boutonDans(pied(), 'Annuler'));
    expect(pied()?.textContent).toContain('Abandonner les modifications ?');
    await cliquer(boutonDans(pied(), 'Oui, abandonner'));
    expect(onFerme).toHaveBeenCalledTimes(1);
    expect(appels.some((a) => a.methode === 'PUT')).toBe(false);
    expect(notes['101']).toBeUndefined();
  });

  it('note générale du cabinet : LECTURE SEULE « Note du cabinet » depuis un bien (si non vide), ÉDITABLE « Note » depuis Syndics', async () => {
    noteCabinet = 'Appeler le matin';
    await ouvrirBien(101);
    expect(libelles()).toContain('Note du cabinet');
    expect(document.querySelector('.fsy-note-cabinet')?.textContent).toBe('Appeler le matin');
    expect([...document.querySelectorAll('.fsy-corps textarea')].some((t) => (t as HTMLTextAreaElement).value === 'Appeler le matin')).toBe(false);
    await cliquer(bouton('+ note'));
    await ecrire(zoneNote() as HTMLTextAreaElement, 'Note A');
    await cliquer(boutonDans(pied(), 'Valider'));
    expect((appels.find((a) => a.methode === 'PUT')?.corps as Corps).note).toBe('Appeler le matin'); // inchangée
    await ouvrirBien(null, null); // écran « Syndics »
    expect(libelles()).not.toContain('Note du cabinet');
    expect(libelles()).not.toContain('Note pour ce bien');
    const l = [...document.querySelectorAll('.fsy-corps label')].find((x) => x.querySelector('span')?.textContent === 'Note');
    expect((l?.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Appeler le matin');
  });

  it('note du cabinet VIDE : pas de « Note du cabinet » depuis un bien', async () => {
    await ouvrirBien(101);
    expect(libelles()).not.toContain('Note du cabinet');
  });

  it('SOUS-CADRES : un par copropriété, en-tête adresse + nombre de lots, pastille « copropriété de ce bien » sur la première', async () => {
    await ouvrirBien(101);
    await cliquer(document.querySelector('.fsy-lots-ligne') as Element);
    const g = [...document.querySelectorAll('.fsy-lots-groupe')];
    expect(g.map((x) => x.querySelector('.fsy-lots-adresse')?.textContent)).toEqual(['12 rue X, 92400 Courbevoie', '3 av Y, 92400 Courbevoie']);
    expect(g.map((x) => x.querySelector('.fsy-lots-nombre')?.textContent)).toEqual(['2 lots', '1 lot']);
    expect(g[0].querySelector('.fsy-pastille')?.textContent).toBe('copropriété de ce bien');
    expect(g[1].querySelector('.fsy-pastille')).toBeNull();
    expect(g[0].querySelector('.fsy-lots-tete')?.nextElementSibling?.querySelectorAll('.fsy-lot')).toHaveLength(2);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-lots-groupe{display:flex;flex-direction:column;gap:.3rem;padding:6px 10px 8px;border:1px solid var(--color-svv-line);border-radius:10px;');
    expect(css).toContain('.fsy-lots-tete{display:flex;flex-wrap:wrap;align-items:baseline;gap:.4rem;padding-bottom:.3rem;border-bottom:1px solid var(--color-svv-line)}');
  });

  it('SOUS-CADRES depuis l’écran « Syndics » : pas de pastille', async () => {
    await ouvrirBien(null, null);
    await cliquer(document.querySelector('.fsy-lots-ligne') as Element);
    expect(document.querySelector('.fsy-pastille')).toBeNull();
  });

  it('le bouton rose d’une carte transmet son LOT à la fiche', async () => {
    act(() => { root.unmount(); }); root = createRoot(container);
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: '12 rue X', lotId: 102 })); });
    await calmer();
    await cliquer(container.querySelector('button.bsy') as Element);
    await calmer();
    expect(appels.some((a) => a.url === '/api/admin/gestion/syndics/30?lot=102')).toBe(true);
  });
});

describe('LOT SYNDIC-CATALOGUE-TUILES-ROSES', () => {
  const ROSE = '.fsy-catalogue-liste .fsy-tuile-catalogue{background:color-mix(in srgb, var(--color-svv-syndic-texte) 10%, transparent)}';
  const servir22 = (): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/22' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_22 }) };
      return (avant as typeof fetch)(url, init);
    }));
  };
  const ouvrirAjout = async (): Promise<void> => {
    servir22();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 22, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    await cliquer(bouton('+ Ajouter un contact'));
  };
  const tuilesCatalogue = (): Element[] => [...document.querySelectorAll('.fsy-catalogue-liste > .fsy-contact-replie, .fsy-catalogue-liste > .fsy-contact-ouvert')];

  it('dès l’ouverture, SANS recherche : toutes les tuiles du catalogue sont roses ; règle de style et survol présents', async () => {
    await ouvrirAjout();
    const t = tuilesCatalogue();
    expect(t.length).toBe(6);
    expect(t.every((x) => x.classList.contains('fsy-tuile-catalogue'))).toBe(true);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain(ROSE);
    expect(css).toContain('.fsy-catalogue-liste .fsy-tuile-catalogue:hover{background:color-mix(in srgb, var(--color-svv-syndic-texte) 16%, transparent)}');
  });

  it('PENDANT la recherche et une fois DÉPLIÉE : toujours rose', async () => {
    await ouvrirAjout();
    await taper(document.querySelector('.fsy-catalogue input[type="search"]') as HTMLInputElement, 'abel');
    expect(tuilesCatalogue().every((x) => x.classList.contains('fsy-tuile-catalogue'))).toBe(true);
    await cliquer(document.querySelector('.fsy-catalogue-liste > .fsy-contact-replie') as Element);
    expect(document.querySelector('.fsy-catalogue-liste > .fsy-contact-ouvert')?.classList.contains('fsy-tuile-catalogue')).toBe(true);
  });

  it('les tuiles « Contacts de cette copropriété », le champ de recherche, le titre et « Nouveau contact » ne sont PAS roses', async () => {
    await ouvrirAjout();
    const rattaches = [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] .fsy-contact-replie')];
    expect(rattaches.length).toBe(2);
    expect(rattaches.some((x) => x.classList.contains('fsy-tuile-catalogue'))).toBe(false);
    for (const sel of ['.fsy-catalogue input[type="search"]', '.fsy-catalogue-titre', '.fsy-contact-edit', '.fsy-catalogue']) {
      expect(document.querySelector(sel)?.classList.contains('fsy-tuile-catalogue')).toBe(false);
    }
  });
});

/**
 * ══ LOT SYNDIC-CONTACT-CIVILITE ══════════════════════════════════════════════════════════════════════════════════
 * Un syndic _TEST, une copropriété ; Mathis (M.) et Jo (sans civilité) la suivent ; Léa (Mme) n'est qu'au catalogue.
 */
describe('LOT SYNDIC-CONTACT-CIVILITE — saisie et affichage', () => {
  type Corps = { contacts: Array<{ id?: number | null; prenom: string; nom: string; civilite: string | null }> };
  const FICHE_30 = {
    ...FICHE, id: 30, nom: '_TEST Cabinet Civilité',
    contacts: [
      { id: 61, titre: 'Responsable de copropriété', prenom: 'Mathis', nom: 'Bercier', civilite: 'M.', tousImmeubles: false, immeubles: ['12 rue x'], coordonnees: [] },
      { id: 62, titre: 'Service comptabilité', prenom: 'Léa', nom: 'Durand', civilite: 'Mme', tousImmeubles: false, immeubles: [], coordonnees: [] },
      { id: 63, titre: null, prenom: 'Jo', nom: 'Sans', civilite: null, tousImmeubles: false, immeubles: ['12 rue x'], coordonnees: [] },
    ],
  };
  const servir30 = (): void => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (url === '/api/admin/gestion/syndics/30' && m === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_30 }) };
      if (url === '/api/admin/gestion/syndics/30') { appels.push({ url, methode: m, corps: JSON.parse(String(init?.body)) }); return { ok: true, json: async () => ({ ok: true, id: 30 }) }; }
      return (avant as typeof fetch)(url, init);
    }));
  };
  const ouvrir30 = async (depuisLeBien: boolean): Promise<void> => {
    servir30();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 30, onFerme: vi.fn(),
        immeubleDepart: depuisLeBien ? { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } : null }));
    });
    await calmer();
  };
  const edit = (): HTMLElement => document.querySelector('.fsy-contact-edit') as HTMLElement;
  const civ = (mot: string): HTMLButtonElement => boutonDans(edit().querySelector('[aria-label="Civilité"]'), mot);
  const pressees = (): string[] => [...edit().querySelectorAll('[aria-label="Civilité"] button')]
    .filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent ?? '');
  const champC = (label: string): HTMLInputElement => {
    const l = [...edit().querySelectorAll('label')].find((x) => x.querySelector('span')?.textContent === label);
    return l?.querySelector('input') as HTMLInputElement;
  };
  const corps = (): Corps => appels.filter((a) => a.methode === 'PUT').at(-1)?.corps as Corps;
  const noms = (sel: string): string[] => [...document.querySelectorAll(sel)].map((b) => b.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const modifier = async (nom: string): Promise<void> => {
    const t = [...document.querySelectorAll('button.fsy-contact-replie')].find((b) => b.querySelector('.fsy-contact-nom')?.textContent === nom);
    await cliquer(t as Element);
    const ouvert = [...document.querySelectorAll('.fsy-contact-ouvert')].find((o) => o.querySelector('.fsy-contact-nom')?.textContent === nom);
    await cliquer(boutonDans(ouvert as Element, 'Modifier'));
  };
  const valider = async (): Promise<void> => {
    await cliquer(boutonDans(edit(), 'Valider'));
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
  };

  it('le champ « Civilité » : à GAUCHE de Prénom et Nom sur leur ligne, sous le Titre ; deux pilules, aucune active', async () => {
    await ouvrir30(false);
    await cliquer(bouton('+ Ajouter un contact'));
    const ligne = edit().querySelector('.fsy-duo--civilite') as HTMLElement;
    expect([...ligne.children].map((x) => x.querySelector(':scope > span')?.textContent)).toEqual(['Civilité', 'Prénom', 'Nom']);
    const titre = [...edit().querySelectorAll('.fsy-duo')].findIndex((d) => d.textContent?.includes('Titre'));
    expect(titre).toBeLessThan([...edit().querySelectorAll('.fsy-duo')].indexOf(ligne));
    expect([...ligne.querySelectorAll('button')].map((b) => [b.textContent, b.className, b.getAttribute('aria-pressed')]))
      .toEqual([['M.', 'gpil', 'false'], ['Mme', 'gpil', 'false']]);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.gpil--actif{color:var(--color-svv-surface);background:var(--color-svv-red)');
  });

  it('un clic choisit, un clic sur l’autre bascule, un clic sur l’actif revient à VIDE', async () => {
    await ouvrir30(false);
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(civ('M.'));
    expect(pressees()).toEqual(['M.']);
    expect(civ('M.').className).toBe('gpil gpil--actif');
    await cliquer(civ('Mme'));
    expect(pressees()).toEqual(['Mme']);
    await cliquer(civ('Mme'));
    expect(pressees()).toEqual([]);
  });

  for (const [choix, attendu] of [['M.', 'M.'], ['Mme', 'Mme'], [null, null]] as const) {
    it(`CRÉATION ${choix ?? 'sans civilité'} : enregistrée « ${attendu ?? 'null'} » ; jamais obligatoire`, async () => {
      await ouvrir30(false);
      await cliquer(bouton('+ Ajouter un contact'));
      if (choix !== null) await cliquer(civ(choix));
      await taper(champC('Prénom'), 'Anne');
      await taper(champC('Nom'), 'Neuve');
      await valider();
      const c = corps().contacts.find((x) => x.nom === 'Neuve');
      expect(c?.civilite).toBe(attendu);
      expect(c?.id ?? null).toBeNull();
    });
  }

  it('MODIFICATION : ajouter une civilité (Jo), en changer (Mathis), la retirer (Léa)', async () => {
    await ouvrir30(false);
    await modifier('Jo SANS');
    expect(pressees()).toEqual([]);
    await cliquer(civ('M.'));
    await cliquer(boutonDans(edit(), 'Valider'));
    await modifier('M. Mathis BERCIER');
    expect(pressees()).toEqual(['M.']);
    await cliquer(civ('Mme'));
    await cliquer(boutonDans(edit(), 'Valider'));
    await modifier('Mme Léa DURAND');
    await cliquer(civ('Mme'));
    await valider();
    expect(corps().contacts.map((c) => [c.id, c.civilite])).toEqual([[61, 'Mme'], [62, null], [63, 'M.']]);
  });

  it('une civilité changée suffit à rendre le contact « modifié » (« Valider » apparaît)', async () => {
    await ouvrir30(false);
    await modifier('Jo SANS');
    const valide = (): boolean => [...edit().querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Valider' && !b.disabled);
    expect(valide()).toBe(false);
    await cliquer(civ('Mme'));
    expect(valide()).toBe(true);
  });

  it('AFFICHAGE — « Contacts de cette copropriété » (depuis un bien) : « M. Mathis BERCIER », « Jo SANS »', async () => {
    await ouvrir30(true);
    expect(noms('section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie')).toEqual(['M. Mathis BERCIER', 'Jo SANS']);
  });

  it('AFFICHAGE — Catalogue : « Mme Léa DURAND », repliée puis dépliée', async () => {
    await ouvrir30(true);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(noms('.fsy-catalogue-liste > button.fsy-contact-replie')).toEqual(['Mme Léa DURAND']);
    await cliquer(document.querySelector('.fsy-catalogue-liste > button.fsy-contact-replie') as Element);
    expect(document.querySelector('.fsy-catalogue-liste .fsy-contact-tete-btn .fsy-contact-nom')?.textContent).toBe('Mme Léa DURAND');
  });

  it('AFFICHAGE — écran « Syndics » : chaque tuile, et la tuile DÉPLIÉE en lecture', async () => {
    await ouvrir30(false);
    expect(noms('button.fsy-contact-replie')).toEqual(['M. Mathis BERCIER', 'Mme Léa DURAND', 'Jo SANS']);
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    expect(document.querySelector('.fsy-contact-ouvert .fsy-contact-nom')?.textContent).toBe('M. Mathis BERCIER');
    expect(document.querySelector('.fsy-contact-ouvert .fsy-contact-titre')?.textContent).toBe('Responsable de copropriété');
  });

  it('AFFICHAGE — le panneau d’une copropriété (bloc 2) nomme aussi « M. Mathis BERCIER »', async () => {
    await ouvrir30(false);
    await deplierCopros();
    await cliquer(document.querySelector('.fsy-copro button[aria-expanded]') as Element);
    const l = [...document.querySelectorAll('.fsy-copro-contacts .fsy-coord-gauche strong')].map((x) => x.textContent);
    expect(l).toEqual(['M. Mathis BERCIER', 'Jo SANS']);
  });
});

/**
 * ══ LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES ═══════════════════════════════════════════════════════════
 * Un syndic _TEST, trois copropriétés (12 rue X = celle du bien) ; Ana suit les trois, Bob la seule du bien, Cat
 * n'est qu'au catalogue (3 av Y).
 */
describe('LOT SYNDIC-CONTACT-ARRIVEE-ROSE-ET-COPROS-REPLIEES', () => {
  const FICHE_40 = {
    ...FICHE, id: 40, nom: '_TEST Cabinet Arrivée',
    contacts: [
      { id: 71, titre: null, prenom: 'Ana', nom: 'Trois', civilite: null, tousImmeubles: false, immeubles: ['12 rue x', '8 rue abel', '3 av y'], coordonnees: [] },
      { id: 72, titre: null, prenom: 'Bob', nom: 'Seul', civilite: null, tousImmeubles: false, immeubles: ['12 rue x'], coordonnees: [] },
      { id: 73, titre: null, prenom: 'Cat', nom: 'Logue', civilite: null, tousImmeubles: false, immeubles: ['3 av y'], coordonnees: [] },
    ],
    coproprietes: [
      { id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
      { id: 7, cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
      { id: 8, cle: '8 rue abel', libelle: '8 rue Abel', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
    ],
  };
  const ouvrir40 = async (depuisLeBien: boolean): Promise<void> => {
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/gestion/syndics/40' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche: FICHE_40 }) };
      return (avant as typeof fetch)(url, init);
    }));
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 40, onFerme: vi.fn(),
        immeubleDepart: depuisLeBien ? { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } : null }));
    });
    await calmer();
  };
  const tuile = (nom: string): HTMLElement | undefined => [...document.querySelectorAll(
    'section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie, section[aria-labelledby="fsy-bloc-1"] > .fsy-contact-ouvert')]
    .find((t) => t.querySelector('.fsy-contact-nom')?.textContent === nom) as HTMLElement | undefined;
  const arrivees = (): number => document.querySelectorAll('.fsy-arrivee').length;
  const sous = async (f: () => Promise<void>): Promise<void> => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try { await f(); } finally { vi.useRealTimers(); }
  };
  const avancer = async (ms: number): Promise<void> => { await act(async () => { vi.advanceTimersByTime(ms); }); };

  it('ARRIVÉE PAR LE CATALOGUE : la tuile arrive en rose (classe d’arrivée), défile en vue, puis la classe part à 3 s', async () => {
    const vu = vi.fn();
    const avant = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vu;
    try {
      await ouvrir40(true);
      expect(arrivees()).toBe(0);
      await sous(async () => {
        await cliquer(bouton('+ Ajouter un contact'));
        await cliquer(document.querySelector('.fsy-catalogue-liste > button.fsy-contact-replie') as Element);
        vu.mockClear();
        await cliquer(bouton('Ajouter à cette copropriété'));
        const t = tuile('Cat LOGUE') as HTMLElement;
        expect(t.classList.contains('fsy-arrivee')).toBe(true);
        expect(arrivees()).toBe(1);
        expect(vu.mock.contexts).toContain(t);
        await avancer(2999);
        expect(tuile('Cat LOGUE')?.classList.contains('fsy-arrivee')).toBe(true);
        await avancer(1);
        expect(tuile('Cat LOGUE')?.classList.contains('fsy-arrivee')).toBe(false);
        expect(arrivees()).toBe(0);
      });
    } finally { Element.prototype.scrollIntoView = avant; }
  });

  it('ARRIVÉE PAR CRÉATION : le Valider d’un Nouveau contact le fait arriver en rose, 3 s', async () => {
    await ouvrir40(true);
    await sous(async () => {
      await cliquer(bouton('+ Ajouter un contact'));
      const edit = document.querySelectorAll('.fsy-contact-edit');
      const champ = (label: string): HTMLInputElement => [...edit[edit.length - 1].querySelectorAll('label')]
        .find((x) => x.querySelector('span')?.textContent === label)?.querySelector('input') as HTMLInputElement;
      await taper(champ('Prénom'), 'Nina');
      await taper(champ('Nom'), 'Neuve');
      await cliquer(boutonDans(edit[edit.length - 1], 'Valider'));
      expect(tuile('Nina NEUVE')?.classList.contains('fsy-arrivee')).toBe(true);
      expect(tuile('Ana TROIS')?.classList.contains('fsy-arrivee')).toBe(false);
      await avancer(3000);
      expect(tuile('Nina NEUVE')?.classList.contains('fsy-arrivee')).toBe(false);
    });
  });

  it('pas d’animation à la RÉOUVERTURE de la fiche, ni pour les contacts déjà là', async () => {
    await ouvrir40(true);
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(document.querySelector('.fsy-catalogue-liste > button.fsy-contact-replie') as Element);
    await cliquer(bouton('Ajouter à cette copropriété'));
    expect(arrivees()).toBe(1);
    await act(async () => { root.render(null); });
    await ouvrir40(true);
    expect(arrivees()).toBe(0);
  });

  it('la feuille : fondu 3 s ease-out du rose (jeton syndic, 10 %) au gris ; MOINS D’ANIMATIONS : pas de fondu, rose tenu', async () => {
    await ouvrir40(true);
    const src = [...document.querySelectorAll('style')].map((x) => x.textContent).join('').replace(/\s+/g, ' ');
    expect(src).toContain('@keyframes fsy-arrivee{ from{background-color:color-mix(in srgb, var(--color-svv-syndic-texte) 10%, transparent)} to{background-color:var(--color-svv-field)}}');
    expect(src).toContain('.fsy-contact-replie.fsy-arrivee,.fsy-contact-ouvert.fsy-arrivee{animation:fsy-arrivee 3s ease-out forwards}');
    expect(src).toContain('@media (prefers-reduced-motion: reduce){ .fsy-contact-replie.fsy-arrivee,.fsy-contact-ouvert.fsy-arrivee{animation:none; background-color:color-mix(in srgb, var(--color-svv-syndic-texte) 10%, transparent)}}');
  });

  it('DEPUIS UN BIEN : « Autres copropriétés du portefeuille suivies (2) ▸ », repliée, sans celle du bien ; dépliée par voie ; repliée', async () => {
    await ouvrir40(true);
    await cliquer(tuile('Ana TROIS') as Element);
    const t = tuile('Ana TROIS') as HTMLElement;
    expect(t.textContent).not.toContain('Immeubles suivis');
    const tete = t.querySelector('.fsy-suivis-tete') as HTMLButtonElement;
    expect(tete.textContent).toBe('Autres copropriétés du portefeuille suivies (2)▸');
    expect(tete.getAttribute('aria-expanded')).toBe('false');
    expect(t.querySelector('.fsy-suivis-liste')).toBeNull();
    await cliquer(tete);
    expect(tete.textContent).toBe('Autres copropriétés du portefeuille suivies (2)▾');
    expect([...t.querySelectorAll('.fsy-suivis-liste li')].map((x) => x.textContent)).toEqual(['3 av Y, 92400 Courbevoie', '8 rue Abel, 92400 Courbevoie']);
    await cliquer(tete);
    expect(t.querySelector('.fsy-suivis-liste')).toBeNull();
  });

  it('N = 0 : « Aucune autre copropriété suivie », non dépliable', async () => {
    await ouvrir40(true);
    await cliquer(tuile('Bob SEUL') as Element);
    const t = tuile('Bob SEUL') as HTMLElement;
    expect(t.querySelector('.fsy-suivis-tete')).toBeNull();
    expect(t.querySelector('.fsy-suivis')?.textContent).toBe('Aucune autre copropriété suivie');
  });

  it('ÉCRAN SYNDICS : « Copropriétés suivies (3) ▸ », dépliée par voie puis numéro', async () => {
    await ouvrir40(false);
    await cliquer(tuile('Ana TROIS') as Element);
    const t = tuile('Ana TROIS') as HTMLElement;
    await cliquer(t.querySelector('.fsy-suivis-tete') as Element);
    expect(t.querySelector('.fsy-suivis-tete')?.textContent).toBe('Copropriétés suivies (3)▾');
    expect([...t.querySelectorAll('.fsy-suivis-liste li')].map((x) => x.textContent))
      .toEqual(['3 av Y, 92400 Courbevoie', '8 rue Abel, 92400 Courbevoie', '12 rue X, 92400 Courbevoie']);
  });

  it('INCHANGÉS : les cases « Immeubles suivis » en modification ; « Déjà rattaché à » dans le catalogue', async () => {
    await ouvrir40(true);
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(document.querySelector('.fsy-catalogue-liste > button.fsy-contact-replie') as Element);
    expect(document.querySelector('.fsy-catalogue-liste .fsy-suivis')?.textContent).toBe('Déjà rattaché à : 3 av Y, 92400 Courbevoie');
    await act(async () => { root.render(null); });
    await ouvrir40(false);
    await cliquer(tuile('Bob SEUL') as Element);
    await cliquer(boutonDans(tuile('Bob SEUL') as Element, 'Modifier'));
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-edit legend')?.textContent).toBe('Immeubles suivis');
  });
});

/**
 * ══ LOT SYNDIC-RETIRER-DE-LA-RESIDENCE ═══════════════════════════════════════════════════════════════════════════
 * Un syndic _TEST (50), deux copropriétés : 12 rue X (le bien, lots 406 et 373) et 3 av Y. Un autre syndic (51).
 */
describe('LOT SYNDIC-RETIRER-DE-LA-RESIDENCE', () => {
  const FICHE_50 = {
    ...FICHE, id: 50, nom: '_TEST ANCIEN', ville: 'Asnieres Sur Seine',
    contacts: [{ id: 81, titre: null, prenom: 'Léa', nom: 'Deux', civilite: null, tousImmeubles: false, immeubles: ['12 rue x', '3 av y'], coordonnees: [] }],
    coproprietes: [
      { id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10',
        lots: [{ id: 406, numero: '406', adresse: '12 rue X', commune: 'COURBEVOIE' }, { id: 373, numero: '373', adresse: '12 rue X', commune: 'COURBEVOIE' }] },
      { id: 7, cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
    ],
  };
  let retire = false;
  const SYNDICS = [
    { id: 50, nom: '_TEST ANCIEN', ville: 'Asnieres Sur Seine', email: null, telephone: null, nbCoproprietes: 1, nbBiens: 0 },
    { id: 51, nom: '_TEST AUTRE', ville: 'Paris', email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0 },
  ];
  const servir50 = (): void => {
    retire = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') {
        appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null });
        if (url === '/api/admin/gestion/syndics/50/retirer-copropriete') { retire = true; return rep({ ok: true, lots: 2 }); }
        return rep({ ok: true, id: 50 });
      }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) {
        return rep({ etat: 'ok', disponible: true, immeubles: [{ cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', lots: [],
          syndic: retire ? null : { id: 50, nom: '_TEST ANCIEN', ville: 'Asnieres Sur Seine' } }] });
      }
      if (url.startsWith('/api/admin/gestion/syndics/50')) return rep({ etat: 'ok', fiche: FICHE_50 });
      if (url.startsWith('/api/admin/gestion/syndics?q=')) {
        const q = decodeURIComponent(url.split('q=')[1] ?? '').toLowerCase();
        return rep({ etat: 'ok', disponible: true, syndics: SYNDICS.filter((s) => s.nom.toLowerCase().includes(q)) });
      }
      return rep({});
    }));
  };
  const ouvrir50 = async (bien: string | null, props: Record<string, unknown> = {}): Promise<void> => {
    servir50();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 50, onFerme: vi.fn(),
        immeubleDepart: bien === null ? null : { libelle: bien, codePostal: '92400', commune: 'Courbevoie' }, ...props }));
    });
    await calmer();
  };
  const gros = (): HTMLButtonElement | null => document.querySelector('button.fsy-retrait');
  const confirmation = (): HTMLElement | null => document.querySelector('.fsy-retrait-confirmer');
  const ecritures = (): typeof appels => appels.filter((a) => a.methode !== 'GET');

  it('DEPUIS UN BIEN : le gros bouton, sous « Syndic & portefeuille de gestion », au-dessus de « Créé le … » ; le lien « Supprimer ce syndic » reste dessous', async () => {
    await ouvrir50('12 rue X');
    const b = gros() as HTMLButtonElement;
    expect(b.textContent).toBe('Supprimer ce syndic de cette résidence');
    const bloc2 = document.querySelector('section[aria-labelledby="fsy-bloc-2"]') as Element;
    expect(bloc2.compareDocumentPosition(b)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(b.compareDocumentPosition(document.querySelector('.fsy-trace') as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(b.compareDocumentPosition(bouton('Supprimer ce syndic'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-retrait{width:100%;min-height:52px;');
    expect(css).toMatch(/\.fsy-retrait\{[^}]*border:2px solid var\(--color-svv-red\);\s*background:var\(--color-svv-surface\);color:var\(--color-svv-red\)/);
  });

  it('DEPUIS L’ÉCRAN SYNDICS : pas de gros bouton ; depuis un bien dont la copropriété n’est pas (encore) à ce syndic : non plus', async () => {
    await ouvrir50(null);
    expect(gros()).toBeNull();
    expect(bouton('Supprimer ce syndic')).toBeTruthy();
    await act(async () => { root.render(null); });
    await ouvrir50('8 rue Z');
    expect(gros()).toBeNull();
  });

  it('modifications non validées : le bandeau le dit d’abord, pas de confirmation', async () => {
    await ouvrir50('12 rue X');
    await taper(champ('Nom du cabinet *'), '_TEST ANCIEN modifié');
    await cliquer(gros() as Element);
    expect(document.querySelector('.fsy-pied-alerte')?.textContent).toBe('Validez ou abandonnez vos modifications avant de retirer ce syndic');
    expect(confirmation()).toBeNull();
    expect(ecritures()).toEqual([]);
  });

  it('la CONFIRMATION nomme le syndic, la copropriété et les lots ; « Annuler » n’écrit rien', async () => {
    await ouvrir50('12 rue X');
    await cliquer(gros() as Element);
    expect(confirmation()?.querySelector('p')?.textContent).toBe('Retirer _TEST ANCIEN / Asnieres Sur Seine de la copropriété 12 rue X, 92400 Courbevoie ? '
      + 'Lots concernés : lot 373, lot 406. Le syndic, ses autres copropriétés et son catalogue de contacts sont conservés.');
    expect([...(confirmation()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Annuler', 'Oui, retirer de cette résidence']);
    await cliquer(boutonDans(confirmation(), 'Annuler'));
    expect(confirmation()).toBeNull();
    expect(gros()).not.toBeNull();
    expect(ecritures()).toEqual([]);
  });

  it('« Oui » : POST du retrait de CETTE copropriété, puis l’enchaînement (sans hôte : la fiche se ferme)', async () => {
    const onFerme = vi.fn();
    const enchaine = vi.fn();
    await ouvrir50('12 rue X', { onFerme, onRetireDeLaResidence: enchaine });
    await cliquer(gros() as Element);
    await cliquer(bouton('Oui, retirer de cette résidence'));
    expect(ecritures()).toEqual([{ url: '/api/admin/gestion/syndics/50/retirer-copropriete', methode: 'POST', corps: { immeuble: '12 rue X' } }]);
    expect(enchaine).toHaveBeenCalledWith(50);
    expect(onFerme).not.toHaveBeenCalled();
    await act(async () => { root.render(null); });
    appels = [];
    const ferme = vi.fn();
    await ouvrir50('12 rue X', { onFerme: ferme });
    await cliquer(gros() as Element);
    await cliquer(bouton('Oui, retirer de cette résidence'));
    expect(ferme).toHaveBeenCalledTimes(1);
  });

  it('ENCHAÎNEMENT depuis la carte du bien : la fiche se ferme, le formulaire EXISTANT de choix s’ouvre ; l’ancien syndic n’est pas en tête mais reste trouvable ; fermer sans choisir ⇒ « Créer le syndic »', async () => {
    servir50();
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: '12 rue X', lotId: 406 })); });
    await calmer();
    expect(document.querySelector('.bsy-mot')?.textContent).toBe('_TEST ANCIEN / Asnieres Sur Seine');
    await cliquer(document.querySelector('button.bsy') as Element);
    await cliquer(gros() as Element);
    await cliquer(bouton('Oui, retirer de cette résidence'));
    await attendre(250);
    // Le formulaire existant : « Syndic de la copropriété », la recherche, « Créer un nouveau syndic ».
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Syndic de la copropriété');
    expect(document.body.textContent).toContain('Chercher un syndic existant');
    expect(bouton('Créer un nouveau syndic')).toBeTruthy();
    expect(gros()).toBeNull();
    const noms = (): string[] => [...document.querySelectorAll('.fsy-resultat strong')].map((x) => x.textContent ?? '');
    expect(noms()).toEqual(['_TEST AUTRE / Paris', '_TEST ANCIEN / Asnieres Sur Seine']);
    const recherche = [...document.querySelectorAll('input[type="search"]')].at(-1) as HTMLInputElement;
    await taper(recherche, 'ancien');
    await attendre(250);
    expect(noms()).toEqual(['_TEST ANCIEN / Asnieres Sur Seine']);
    await cliquer(bouton('×'));
    expect(document.querySelector('.fsy')).toBeNull();
    expect(document.querySelector('.bsy-mot')?.textContent).toBe('Créer le syndic');
  });
});
