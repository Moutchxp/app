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

  it('dès 2 caractères : le portefeuille, avec « N biens en gestion » et « déjà rattachée à … » ; la prise se confirme', async () => {
    await ouvrir();
    await deplierCopros();
    await taper(champ('+ Ajouter une copropriété (immeuble)'), '25');
    const prop = [...document.querySelectorAll('.fsy-proposition')].map((p) => p.textContent ?? '');
    expect(prop[0]).toContain('25 rue Edith Cavell, 92400 Courbevoie');
    expect(prop[0]).toContain('2 biens en gestion à cette adresse');
    expect(prop[0]).toContain('déjà rattachée à _TEST Autre Syndic / Courbevoie');
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
    const suivis = [...document.querySelectorAll('.fsy-suivis')].map((p) => p.textContent);
    expect(suivis).toEqual(['Immeubles suivis : Tous les immeubles', 'Immeubles suivis : 12 rue X, 92400 Courbevoie']);
  });

  it('affecter un contact à DEUX copropriétés, puis à « Tous les immeubles », par les cases', async () => {
    await ouvrir(vi.fn(), 20);
    await cliquer([...document.querySelectorAll('button.fsy-contact-replie')][1]); // Marie DOUZE
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    const cases = (): HTMLInputElement[] => [...document.querySelectorAll('.fsy-suivis-edit input[type="checkbox"]')] as HTMLInputElement[];
    expect(cases().map((c) => [c.checked, c.disabled])).toEqual([[false, false], [true, false], [false, false]]);
    await cliquer(cases()[2]); // + 3 av Y
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    expect(document.querySelector('.fsy-contact-ouvert .fsy-suivis')?.textContent)
      .toBe('Immeubles suivis : 12 rue X, 92400 Courbevoie · 3 av Y, 92400 Courbevoie');
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await cliquer(cases()[0]); // tous les immeubles
    expect(cases().slice(1).every((c) => c.disabled && c.checked)).toBe(true);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts[1]).toMatchObject({ nom: 'Douze', tousImmeubles: true, immeubles: [] });
  });

  it('la copropriété repliée : « 12 rue X, 92400 Courbevoie · 2 contacts · 1 bien en gestion » ; dépliée : ses contacts, « commun » marqué', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    expect(copro(0).querySelector('.fsy-copro-tete')?.textContent).toBe('12 rue X, 92400 Courbevoie2 contacts · 1 bien en gestion▸');
    await cliquer(copro(0).querySelector('.fsy-copro-tete') as Element);
    const lignes = [...copro(0).querySelectorAll('.fsy-copro-contacts .fsy-contact-coord')].map((l) => l.textContent);
    expect(lignes).toEqual(['Paul COMMUN · Service comptabilitécommun', 'Marie DOUZE · Responsable de copropriétéRetirer']);
  });

  it('RETIRER une affectation depuis la copropriété : le contact reste au catalogue', async () => {
    await ouvrir(vi.fn(), 20);
    await deplierCopros();
    await cliquer(copro(0).querySelector('.fsy-copro-tete') as Element);
    await cliquer(copro(0).querySelector('button[aria-label="Retirer l’affectation de Marie DOUZE"]') as Element);
    expect(copro(0).querySelector('.fsy-copro-tete')?.textContent).toContain('1 contact · 1 bien en gestion');
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts.map((c) => [c.nom, c.tousImmeubles, c.immeubles])).toEqual([
      ['Commun', true, []], ['Douze', false, []], ['Trois', false, ['3 av y']],
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

  it('un contact créé DEPUIS UN BIEN suit cet immeuble par défaut ; SANS bien, « Tous les immeubles »', async () => {
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
    expect(cases[0].checked).toBe(true);
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

  it('écran « Syndics » (sans bien) inchangé : pas de Catalogue, « Tous les immeubles » coché et les cases', async () => {
    avecFiche22();
    await ouvrir(vi.fn(), 22);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(catalogue()).toBeNull();
    const cases = [...document.querySelectorAll('.fsy-contact-edit .fsy-suivis-edit input')] as HTMLInputElement[];
    expect(cases.length).toBe(3);
    expect(cases[0].checked).toBe(true);
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

  it('COPROPRIÉTÉS : même format que les lignes repliées (même règle de style) ; « + Ajouter une copropriété » reste visible', async () => {
    await ouvrir(vi.fn(), 20);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-contact-replie,.fsy-contact-tete-btn,.fsy-copros-ligne{width:100%;min-height:40px;');
    expect(champ('+ Ajouter une copropriété (immeuble)')).toBeTruthy();
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

  it('depuis un BIEN : « Syndic de l’immeuble · adresse » puis « Gérer ce syndic », dans cet ordre, encadrés', async () => {
    await depuisLeBien();
    expect(titre(1)).toBe('Syndic de l’immeuble · 12 rue X, 92400 Courbevoie');
    expect(titre(2)).toBe('Gérer ce syndic');
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
    expect(titre(2)).toBe('Gérer ce syndic');
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
    // BLOC 2 : copropriétés repliées, + Ajouter une copropriété, Biens qui recevront ce syndic
    const ordre = [document.querySelector('.fsy-copros-ligne'),
      champ('+ Ajouter une copropriété (immeuble)'), document.querySelector('details.fsy-biens')] as Element[];
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
