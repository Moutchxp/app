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
  appels = []; apiEnPanne = false; passerAlerteCoord = true; passerChoixAjout = true;
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
/**
 * LOT SYNDIC-CONTACT-ALERTE-COORDONNEES-MANQUANTES — le « Valider » d'un contact SANS téléphone ou SANS e-mail ouvre
 * désormais un avertissement (jamais bloquant). Les épreuves écrites avant lui valident des contacts sans coordonnées
 * pour éprouver AUTRE CHOSE : par défaut, `cliquer` répond donc « Valider quand même » à leur place — leurs attentes,
 * elles, ne changent pas. Les épreuves de l'avertissement coupent ce passage (`passerAlerteCoord = false`).
 */
let passerAlerteCoord = true;
/**
 * LOT COPRO-CONTACTS-IMMEUBLE — depuis un bien, « + Ajouter un contact » propose désormais un CHOIX (① contact du
 * syndic / ② habitant ou gardien de l'immeuble). Les épreuves écrites avant lui éprouvent ①, inchangé : par défaut,
 * `cliquer` choisit ① à leur place (l'étape de clic supplémentaire) ; leurs attentes ne changent pas. Les épreuves du
 * choix coupent ce passage (`passerChoixAjout = false`).
 */
let passerChoixAjout = true;
const cliquer = async (el: Element): Promise<void> => {
  const valideUnContact = (el as HTMLElement).textContent?.trim() === 'Valider' && el.closest('.fsy-contact-edit') !== null;
  const ajoute = (el as HTMLElement).textContent?.trim() === '+ Ajouter un contact';
  await act(async () => { (el as HTMLElement).click(); }); await calmer();
  if (ajoute && passerChoixAjout) {
    const un = [...document.querySelectorAll('.fsy-choix-ajout button')].find((x) => x.textContent?.trim() === 'Contact du syndic de copropriété') as HTMLElement | undefined;
    if (un) { await act(async () => { un.click(); }); await calmer(); }
  }
  if (!passerAlerteCoord || !valideUnContact) return;
  const b = [...document.querySelectorAll('.fsy-alerte-coord button')].find((x) => x.textContent === 'Valider quand même') as HTMLElement | undefined;
  if (b) { await act(async () => { b.click(); }); await calmer(); }
};
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

  // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : « Valider aussi les modifications de Léa BERNARD ? », bouton « Oui, valider aussi ».
  it('« Valider » la FICHE pendant une modification non validée : « Enregistrer les modifications de … ? » — Oui', async () => {
    const onFerme = await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await taper(champContact('Nom'), 'Bernard');
    await cliquer(boutonDans(pied(), 'Valider'));
    // LOT SYNDIC-CONTACTS-ANTI-DOUBLON — CE QU'IL DISAIT AVANT : « … du contact Léa BERNARD ? ».
    expect(pied()?.textContent).toContain('Enregistrer les modifications de Léa BERNARD ?');
    expect(appels.some((x) => x.methode === 'PUT')).toBe(false);
    await cliquer(boutonDans(pied(), 'Oui'));
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
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Contacts de cette copropriété ».
    expect([...document.querySelectorAll('.fsy-sous-titre')].map((h) => h.textContent)).toContain('Contact(s) syndic de cette copropriété');
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

  // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : « affecter un contact à DEUX copropriétés, puis à « Tous les immeubles », par les
  // cases » (toutes les copropriétés du syndic + « Tous les immeubles »). En modification, seules les copropriétés
  // SUIVIES s'affichent : on ne peut plus qu'en détacher (on rattache par le Catalogue, depuis le bien).
  it('détacher un contact d’une copropriété par SA case, en modification ; la case décochée reste, pour la recocher', async () => {
    await ouvrir(vi.fn(), 20);
    await cliquer([...document.querySelectorAll('button.fsy-contact-replie')][1]); // Marie DOUZE
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    const tete = (): HTMLButtonElement => document.querySelector('.fsy-contact-edit .fsy-suivis-tete') as HTMLButtonElement;
    const cases = (): HTMLInputElement[] => [...document.querySelectorAll('.fsy-contact-edit .fsy-suivis-liste input[type="checkbox"]')] as HTMLInputElement[];
    expect(tete().textContent).toBe('Immeubles suivis (1)▸');
    expect(cases()).toEqual([]);
    await cliquer(tete());
    expect(cases().map((c) => [c.checked, c.parentElement?.textContent])).toEqual([[true, '12 rue X, 92400 Courbevoie']]);
    expect(document.querySelector('.fsy-contact-edit')?.textContent).not.toContain('Tous les immeubles');
    await cliquer(cases()[0]);
    expect(cases().map((c) => c.checked)).toEqual([false]);
    expect(tete().textContent).toBe('Immeubles suivis (0)▾');
    await cliquer(cases()[0]);
    expect(cases().map((c) => c.checked)).toEqual([true]);
    await cliquer(cases()[0]);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    await cliquer(boutonDans(pied(), 'Valider'));
    expect(put().contacts[1]).toMatchObject({ id: 32, nom: 'Douze', tousImmeubles: false, immeubles: [] });
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
    // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : les trois cases, la troisième (3 av Y) cochée.
    await cliquer(bloc.querySelector('.fsy-suivis-tete') as Element);
    expect(bloc.querySelector('.fsy-suivis-tete')?.textContent).toBe('Immeubles suivis (1)▾');
    const cases = [...bloc.querySelectorAll('.fsy-suivis-liste input')] as HTMLInputElement[];
    expect(cases.map((c) => [c.checked, c.parentElement?.textContent])).toEqual([[true, '3 av Y, 92400 Courbevoie']]);
  });

  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : sans bien, « Tous les immeubles » coché par défaut.
  it('un contact créé DEPUIS UN BIEN suit cet immeuble par défaut ; SANS bien, AUCUNE copropriété', async () => {
    await depuisUnBien();
    await cliquer(bouton('+ Ajouter un contact'));
    // LOT SYNDIC-AJOUT-CONTACT-CATALOGUE-OUVERT — CE QU'IL DISAIT AVANT : les cases, celle de l'immeuble du bien cochée.
    // Depuis un bien, les cases cèdent la place à « Sera rattaché à : … » (accord d'Arno).
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-edit')).toBeNull();
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis')?.textContent).toBe('Sera rattaché à : 12 rue X, 92400 Courbevoie');
    act(() => { root.unmount(); });
    root = createRoot(container);
    await ouvrir(vi.fn(), 20);
    await cliquer(bouton('+ Ajouter un contact'));
    // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : trois cases, aucune cochée.
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis')?.textContent).toBe('Aucun immeuble suivi');
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-tete')).toBeNull();
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

  // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : Marie (1 immeuble) recevait 2 immeubles de plus par les cases (4 cases). En
  // modification on ne rattache plus : Marie suit déjà 3 immeubles, les 3 s'affichent, et on en détache un.
  it('un contact rattaché à 3 immeubles (aucune limite), et « Immeubles suivis » CONSERVÉ en modification', async () => {
    const trois = { ...FICHE_22, id: 23,
      contacts: FICHE_22.contacts.map((c) => (c.id === 32 ? { ...c, immeubles: ['12 rue x', '3 av y', '7 bd z'] } : c)),
      coproprietes: [...FICHE_22.coproprietes,
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
    await cliquer(document.querySelector('.fsy-contact-edit .fsy-suivis-tete') as Element);
    const cases = (): HTMLInputElement[] => [...document.querySelectorAll('.fsy-contact-edit .fsy-suivis-liste input')] as HTMLInputElement[];
    expect(cases().map((c) => [c.checked, c.parentElement?.textContent])).toEqual([
      [true, '3 av Y, 92400 Courbevoie'], [true, '7 bd Z, 92400 Courbevoie'], [true, '12 rue X, 92400 Courbevoie']]);
    await cliquer(cases()[1]); // 7 bd Z
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    await cliquer(boutonDans(pied(), 'Valider'));
    const put = appels.find((x) => x.methode === 'PUT')?.corps as Corps;
    expect(put.contacts.find((c) => c.nom === 'Douze')?.immeubles).toEqual(['12 rue x', '3 av y']);
  });

  // LOT SYNDIC-FIN-TOUS-LES-IMMEUBLES — CE QU'IL DISAIT AVANT : « Tous les immeubles » coché par défaut.
  // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : « les cases, AUCUNE cochée par défaut » (3 cases).
  it('écran « Syndics » (sans bien) : pas de Catalogue ; « Aucun immeuble suivi » pour un nouveau contact', async () => {
    avecFiche22();
    await ouvrir(vi.fn(), 22);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(catalogue()).toBeNull();
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis')?.textContent).toBe('Aucun immeuble suivi');
    expect(document.querySelectorAll('.fsy-contact-edit input[type="checkbox"]')).toHaveLength(0);
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
    // LOT COPRO-PLUSIEURS-ADRESSES — CE QU'IL DISAIT AVANT : le titre seul. Le petit « + » (ajouter une autre adresse)
    // le suit désormais, dans la même ligne.
    expect(titre(1)).toBe('Syndic de l’immeuble · 12 rue X, 92400 Courbevoie+');
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
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Contacts de cette copropriété ».
    expect(sousTitre.textContent).toBe('Contact(s) syndic de cette copropriété'); // avant : « Contacts de cet immeuble »
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
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Contacts de cette copropriété ».
    expect(intertitre()).toBe('Contact(s) syndic de cette copropriété');
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
    // LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT — CE QU'IL DISAIT AVANT : trois boutons, « Détacher » portant le
    // retrait à gauche. « Ne travaille plus ici » s'ajoute À CÔTÉ ; c'est lui qui porte désormais le retrait.
    expect(boutons.map((b) => b.textContent?.trim())).toEqual(['Détacher de la copropriété', 'Ne travaille plus ici', 'Fermer', 'Modifier']);
    expect(boutons[0].className).toBe('svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-detacher');
    expect(boutons[1].className).toBe('svv-btn svv-btn-outline gst-btn fsy-mini-btn fsy-parti fsy-pousse-gauche');
    boutons.splice(1, 1);
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
    // LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT — CE QU'IL DISAIT AVANT : 'fsy-lien-bouton fsy-pousse-gauche'. Le
    // lien est inchangé ; le retrait à gauche passe à « Ne travaille plus ici », posé juste après lui.
    expect(sup.className).toBe('fsy-lien-bouton');
    expect((sup.nextElementSibling as HTMLElement).textContent).toBe('Ne travaille plus ici');
  });
});

describe('LOT SYNDIC-CONTACTS-ANTI-DOUBLON — à la saisie', () => {
  let ailleurs: { emails: unknown[]; noms: unknown[]; coordonnees?: unknown[] } = { emails: [], noms: [] };
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
  /** LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — les avertissements ORANGE sous les coordonnées, ligne par ligne. */
  const orange = (): string[][] => [...bloc().querySelectorAll('.fsy-doublon-coord')].map((p) => [...p.querySelectorAll('span')].map((x) => x.textContent ?? ''));

  // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « message rouge sous le champ, Valider désactivé » (« Ce contact existe déjà : … »).
  it('E-MAIL en double DANS ce syndic (casse, espaces) : avertissement ORANGE précis sous le champ, Valider ACTIF', async () => {
    await depuisSyndics();
    const champ = await nouveauAvecEmail(' ELODIE@test.invalid');
    expect(orange()).toEqual([['L’adresse e-mail ELODIE@test.invalid est déjà utilisée par Élodie ÉTÉ · Service comptabilité · _TEST Cabinet Sept / Paris.']]);
    expect(champ.closest('.fsy-coord-edit')?.querySelector('.fsy-doublon-coord')).not.toBeNull();
    expect(rouge()).toEqual([]);
    expect(valider().disabled).toBe(false);
  });

  // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « bloquant aussi » (message rouge, Valider désactivé).
  it('E-MAIL en double dans un AUTRE syndic : avertissement orange, avec civilité, titre et « NOM / Ville » ; Valider actif', async () => {
    await depuisSyndics();
    ailleurs = { emails: [], noms: [], coordonnees: [{ sorte: 'email', cle: 'mathis@ailleurs.invalid', proprietaire: { genre: 'syndic', contactId: 9,
      civilite: 'M.', prenom: 'Mathis', nom: 'BERCIER', titre: 'Service comptabilité', syndicId: 9, syndicNom: '_TEST AUTRE', syndicVille: 'Lyon', coproprietes: [] } }] };
    await nouveauAvecEmail('mathis@ailleurs.invalid');
    expect(appels.some((a) => a.url.includes('/doublons?syndic=22&') && a.url.includes('mathis%40ailleurs.invalid'))).toBe(true);
    expect(orange()).toEqual([['L’adresse e-mail mathis@ailleurs.invalid est déjà utilisée par M. Mathis BERCIER · Service comptabilité · _TEST AUTRE / Lyon.']]);
    expect(valider().disabled).toBe(false);
  });

  it('TÉLÉPHONE en double (« +33 7… » contre « 07 … ») ; PLUSIEURS porteurs (un syndic, un gardien) : une ligne par porteur', async () => {
    await depuisSyndics();
    ailleurs = { emails: [], noms: [], coordonnees: [
      { sorte: 'telephone', cle: '0760201010', proprietaire: { genre: 'syndic', contactId: 9, civilite: 'M.', prenom: 'Mathis', nom: 'BERCIER',
        titre: 'Service comptabilité', syndicId: 9, syndicNom: 'TEST ARNAUD', syndicVille: 'Asnieres Sur Seine', coproprietes: [] } },
      { sorte: 'telephone', cle: '0760201010', proprietaire: { genre: 'immeuble', contactId: 5, civilite: null, prenom: 'Paul', nom: 'Loge',
        categorie: 'Gardien', immeubleCle: '3 av y', immeubleAdresse: '3 av Y, 92400 Courbevoie' } },
    ] };
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(boutonDans(bloc(), '+ téléphone'));
    const champ = bloc().querySelector('input[aria-label="Téléphone du contact"]') as HTMLInputElement;
    await taper(champ, '+33 7 60 20 10 10');
    await quitter(champ);
    expect(appels.some((a) => a.url.includes('telephones=0760201010'))).toBe(true); // envoyé normalisé
    expect(orange()).toEqual([['Le numéro +33 7 60 20 10 10 est déjà utilisé par :',
      'M. Mathis BERCIER · Service comptabilité · TEST ARNAUD / Asnieres Sur Seine', 'Paul LOGE · Gardien · 3 av Y, 92400 Courbevoie']]);
  });

  it('NOM en double dans ce syndic (accents, casse, tirets) : bloqué ; déjà dans la copropriété ⇒ « déjà rattaché à cette copropriété »', async () => {
    await depuisLeBien();
    await cliquer(bouton('+ Ajouter un contact'));
    await taper(champC('Prénom'), 'MARIE');
    await taper(champC('Nom'), 'douze');
    await quitter(champC('Nom'));
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Ce contact existe déjà : Marie DOUZE · Responsable de copropriété · _TEST Cabinet
    // Sept / Paris — déjà rattaché à cette copropriété ». Toujours BLOQUANT ; texte précis.
    expect(rouge()).toEqual(['Un contact nommé Marie DOUZE existe déjà chez _TEST Cabinet Sept / Paris.']);
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
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Ce contact existe déjà : Élodie ÉTÉ · Service comptabilité · … · Voir dans le catalogue ».
    expect(rouge()[0]).toBe('Un contact nommé Élodie ÉTÉ existe déjà chez _TEST Cabinet Sept / Paris. · Voir dans le catalogue');
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

  // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « au VALIDER du contact, la vérification est refaite et BLOQUE ». Elle est
  // refaite, et donne un encadré orange (regroupé avec le manque de téléphone) : « Corriger » / « Valider quand même ».
  it('au VALIDER du contact : encadré orange regroupé (doublon + manque), « Corriger » met le curseur, puis « Valider quand même » ⇒ confirmé', async () => {
    passerAlerteCoord = false;
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
    const a = bloc().querySelector('.fsy-alerte-coord') as HTMLElement;
    expect([...a.querySelectorAll('.fsy-alerte-coord-texte > span')].map((x) => x.textContent)).toEqual([
      'L’adresse e-mail elodie@test.invalid est déjà utilisée par Élodie ÉTÉ · Service comptabilité · _TEST Cabinet Sept / Paris.',
      'Aucun numéro de téléphone pour AUTRE.', 'Valider quand même ?']);
    expect([...a.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Corriger', 'Valider quand même']);
    await cliquer(boutonDans(a, 'Corriger'));
    expect(bloc().querySelector('.fsy-alerte-coord')).toBeNull();
    expect(document.activeElement).toBe(bloc().querySelector('input[aria-label="E-mail du contact"]'));
    await cliquer(valider());
    await cliquer(boutonDans(bloc().querySelector('.fsy-alerte-coord'), 'Valider quand même'));
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    const corps = appels.find((x) => x.methode === 'PUT')?.corps as { confirmeDoublons?: boolean; contacts: Array<{ nom: string }> };
    expect(corps.confirmeDoublons).toBe(true);
    expect(corps.contacts.map((c) => c.nom)).toContain('Autre');
  });

  it('MODIFICATION d’un contact existant vers un e-mail déjà pris : avertissement, plus blocage', async () => {
    await depuisSyndics();
    const marie = [...document.querySelectorAll('button.fsy-contact-replie')].find((b) => b.textContent?.includes('Marie DOUZE')) as Element;
    await cliquer(marie);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await cliquer(boutonDans(bloc(), '+ e-mail'));
    const champ = bloc().querySelector('input[aria-label="E-mail du contact"]') as HTMLInputElement;
    await taper(champ, 'Elodie@Test.invalid');
    await quitter(champ);
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : bloquée (« Ce contact existe déjà : … », Valider désactivé).
    expect(orange()).toEqual([['L’adresse e-mail Elodie@Test.invalid est déjà utilisée par Élodie ÉTÉ · Service comptabilité · _TEST Cabinet Sept / Paris.']]);
    expect(valider().disabled).toBe(false);
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

  // LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS — CE QU'IL DISAIT AVANT : les cases « Immeubles suivis » (cadre et légende) en modification.
  it('INCHANGÉ : « Déjà rattaché à » dans le catalogue ; en modification, « Immeubles suivis (N) » replié', async () => {
    await ouvrir40(true);
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(document.querySelector('.fsy-catalogue-liste > button.fsy-contact-replie') as Element);
    expect(document.querySelector('.fsy-catalogue-liste .fsy-suivis')?.textContent).toBe('Déjà rattaché à : 3 av Y, 92400 Courbevoie');
    await act(async () => { root.render(null); });
    await ouvrir40(false);
    await cliquer(tuile('Bob SEUL') as Element);
    await cliquer(boutonDans(tuile('Bob SEUL') as Element, 'Modifier'));
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-tete')?.textContent).toBe('Immeubles suivis (1)▸');
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

  // LOT SYNDIC-RETRAIT-RESIDENCE-MESSAGE-SIMPLE — CE QU'IL DISAIT AVANT : une seule phrase « Retirer … de la copropriété
  // 12 rue X, 92400 Courbevoie ? Lots concernés : lot 373, lot 406. Le syndic, ses autres copropriétés et son catalogue
  // de contacts sont conservés. » — désormais trois lignes, sans « Lots concernés » (accord d'Arno).
  it('la CONFIRMATION en trois lignes (gras / adresse / gris), sans « Lots concernés » ; « Annuler » n’écrit rien', async () => {
    await ouvrir50('12 rue X');
    await cliquer(gros() as Element);
    const p = [...(confirmation()?.querySelectorAll('p') ?? [])];
    expect(p.map((x) => x.textContent)).toEqual([
      'Détacher _TEST ANCIEN / Asnieres Sur Seine de cette copropriété ?',
      '12 rue X, 92400 Courbevoie',
      'Le syndic et ses contacts restent enregistrés dans la base des syndics.',
    ]);
    expect(p[0].querySelector('strong')?.textContent).toBe(p[0].textContent); // ligne 1 en gras
    expect(p[2].className).toContain('fsy-discret'); // ligne 3 en gris
    expect(confirmation()?.textContent).not.toContain('Lots concernés');
    expect(confirmation()?.textContent).not.toMatch(/lot \d/);
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
    // Le formulaire existant : la recherche, « Créer un nouveau syndic ».
    // LOT SYNDIC-TITRE-APRES-RETRAIT — CE QU'IL DISAIT AVANT : titre « Syndic de la copropriété ».
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Rattacher un nouveau syndic de copropriété');
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

/**
 * ══ LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS ═════════════════════════════════════════════════════
 * Fiche 11 : le cabinet « _TEST Cabinet », une copropriété (12 rue X), Léa DURAND qui la suit.
 */
describe('LOT SYNDIC-CONTACT-VALIDATION-SIMPLE-ET-IMMEUBLES-SUIVIS', () => {
  type Corps = { nom: string; contacts: Array<{ id?: number | null; prenom: string; nom: string; immeubles: string[] }> };
  const pied = (): Element | null => document.querySelector('.fsy-pied');
  const bandeau = (): HTMLElement | null => document.querySelector('.fsy-pied [role="group"][aria-label="Enregistrer les modifications de ce contact ?"]');
  const put = (): Corps | undefined => appels.find((x) => x.methode === 'PUT')?.corps as Corps | undefined;
  const champC = (label: string): HTMLInputElement => [...(document.querySelector('.fsy-contact-edit')?.querySelectorAll('label') ?? [])]
    .find((x) => x.querySelector('span')?.textContent === label)?.querySelector('input') as HTMLInputElement;
  /** Léa en modification (nom → Bernard), ET le nom du cabinet changé, puis « Valider » de la fiche. */
  const leaModifiee = async (onFerme = vi.fn()): Promise<ReturnType<typeof vi.fn>> => {
    await ouvrir(onFerme);
    await taper(champ('Nom du cabinet *'), '_TEST Cabinet bis');
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await taper(champC('Nom'), 'Bernard');
    await cliquer(boutonDans(pied(), 'Valider'));
    return onFerme;
  };

  it('le bandeau : « Enregistrer les modifications de Léa BERNARD ? », DEUX boutons « Non » (blanc) et « Oui » (rouge), plus de « Revenir »', async () => {
    await leaModifiee();
    const b = bandeau() as HTMLElement;
    expect(b.querySelector('.fsy-question')?.textContent).toBe('Enregistrer les modifications de Léa BERNARD ?');
    expect([...b.querySelectorAll('button')].map((x) => [x.textContent, x.className.includes('svv-btn-primary') ? 'rouge' : 'blanc']))
      .toEqual([['Non', 'blanc'], ['Oui', 'rouge']]);
    expect(pied()?.textContent).not.toContain('Revenir');
    expect(pied()?.textContent).not.toContain('Valider aussi');
    expect(put()).toBeUndefined();
  });

  it('« Non » : les modifications de CE contact sont abandonnées, le reste de la fiche est enregistré, puis la fiche se ferme', async () => {
    const onFerme = await leaModifiee();
    await cliquer(boutonDans(bandeau(), 'Non'));
    expect(put()?.nom).toBe('_TEST Cabinet bis');
    expect(put()?.contacts.map((c) => [c.id, c.nom])).toEqual([[4, 'Durand']]);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('« Oui » : le contact ET le reste de la fiche sont enregistrés, puis la fiche se ferme', async () => {
    const onFerme = await leaModifiee();
    await cliquer(boutonDans(bandeau(), 'Oui'));
    expect(put()?.nom).toBe('_TEST Cabinet bis');
    expect(put()?.contacts.map((c) => [c.id, c.nom])).toEqual([[4, 'Bernard']]);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('Échap referme le bandeau SANS RIEN FAIRE : fiche ouverte, contact toujours en modification, rien d’enregistré', async () => {
    const onFerme = await leaModifiee();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(bandeau()).toBeNull();
    expect(pied()?.textContent).not.toContain('Abandonner les modifications ?');
    expect(champC('Nom').value).toBe('Bernard');
    expect(put()).toBeUndefined();
    expect(onFerme).not.toHaveBeenCalled();
  });

  it('un clic HORS du bandeau le referme sans rien faire ; un clic DEDANS le laisse', async () => {
    const onFerme = await leaModifiee();
    await act(async () => { bandeau()?.querySelector('.fsy-question')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(bandeau()).not.toBeNull();
    await act(async () => { document.querySelector('.fsy-corps')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(bandeau()).toBeNull();
    expect(put()).toBeUndefined();
    expect(onFerme).not.toHaveBeenCalled();
  });

  it('NOUVEAU CONTACT : « Enregistrer le nouveau contact Anne NEUVE ? » — Non : le reste seul ; Oui : le contact aussi', async () => {
    for (const reponse of ['Non', 'Oui'] as const) {
      appels = [];
      await act(async () => { root.render(null); });
      await ouvrir();
      await taper(champ('Nom du cabinet *'), '_TEST Cabinet ter');
      await cliquer(bouton('+ Ajouter un contact'));
      await taper(champC('Prénom'), 'Anne');
      await taper(champC('Nom'), 'Neuve');
      await cliquer(boutonDans(pied(), 'Valider'));
      expect(bandeau()?.querySelector('.fsy-question')?.textContent).toBe('Enregistrer le nouveau contact Anne NEUVE ?');
      expect([...(bandeau()?.querySelectorAll('button') ?? [])].map((x) => x.textContent)).toEqual(['Non', 'Oui']);
      await cliquer(boutonDans(bandeau(), reponse));
      expect(put()?.nom).toBe('_TEST Cabinet ter');
      expect(put()?.contacts.map((c) => c.nom)).toEqual(reponse === 'Non' ? ['Durand'] : ['Durand', 'Neuve']);
    }
  });

  it('en modification : « Immeubles suivis (1) ▸ » replié ; contenu déplié sur FOND BLANC, petit cadre arrondi, en retrait (lecture aussi)', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    const tete = document.querySelector('.fsy-contact-edit .fsy-suivis-tete') as HTMLButtonElement;
    expect(tete.textContent).toBe('Immeubles suivis (1)▸');
    expect(tete.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-liste')).toBeNull();
    await cliquer(tete);
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-liste')).not.toBeNull();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('').replace(/\s+/g, ' ');
    const regle = css.match(/\.fsy-suivis-liste\{[^}]*\}/)?.[0] ?? '';
    expect(regle).toContain('background:var(--color-svv-surface)');
    expect(regle).toContain('border:1px solid var(--color-svv-line)');
    expect(regle).toContain('border-radius:8px');
    expect(regle).toMatch(/margin:[^;]*\.6rem/); // en retrait
  });

  it('N = 0 pour un contact EXISTANT : « Aucun immeuble suivi », non dépliable', async () => {
    servirFiche({ ...FICHE, contacts: [{ ...FICHE.contacts[0], immeubles: [] }] });
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis')?.textContent).toBe('Aucun immeuble suivi');
    expect(document.querySelector('.fsy-contact-edit .fsy-suivis-tete')).toBeNull();
  });
});

function servirFiche(fiche: unknown): void {
  const avant = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/admin/gestion/syndics/11' && (init?.method ?? 'GET') === 'GET') return { ok: true, json: async () => ({ etat: 'ok', fiche }) };
    return (avant as typeof fetch)(url, init);
  }));
}

/**
 * ══ LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT ═════════════════════════════════════════════════════════════
 * Syndic _TEST 60 : trois copropriétés ; M. Mathis BERCIER les suit toutes, Léa la seule 25 rue Edith Cavell ;
 * un ancien contact, Jean ANCIEN, parti le 10/10/2026.
 */
describe('LOT SYNDIC-CONTACT-PARTI-ET-BOUTON-CREER-EN-HAUT', () => {
  type Corps = { contacts: Array<{ id?: number | null; nom: string; parti?: boolean; reintegre?: boolean; immeubles: string[]; coordonnees: unknown[] }> };
  const copro = (id: number, libelle: string, cp: string, commune: string) =>
    ({ id, cle: libelle.toLowerCase(), libelle, codePostal: cp, commune, debut: '2026-10-10', lots: [] });
  const FICHE_60 = {
    ...FICHE, id: 60, nom: '_TEST ARNAUD', ville: 'Asnieres Sur Seine',
    contacts: [
      { id: 91, titre: 'Responsable de copropriété', prenom: 'Mathis', nom: 'Bercier', civilite: 'M.', tousImmeubles: false,
        immeubles: ['12 rue des pavillons', '15 rue carle hebert', '25 rue edith cavell'],
        coordonnees: [{ id: 95, sorte: 'email', libelle: null, valeur: 'mathis@test.invalid' }] },
      { id: 92, titre: null, prenom: 'Léa', nom: 'Une', civilite: 'Mme', tousImmeubles: false, immeubles: ['25 rue edith cavell'], coordonnees: [] },
    ],
    coproprietes: [copro(6, '12 rue des Pavillons', '92800', 'Puteaux'), copro(7, '15 rue Carle Hebert', '92400', 'Courbevoie'),
      copro(8, '25 rue Edith Cavell', '92400', 'Courbevoie')],
    anciens: [{ id: 99, titre: 'Service comptabilité', prenom: 'Jean', nom: 'Ancien', civilite: null, partiLe: '2026-10-10T08:00:00Z',
      coordonnees: [{ sorte: 'email', libelle: null, valeur: 'jean@test.invalid' }] }],
  };
  const SYNDICS_20 = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, nom: `_TEST Syndic ${String(i + 1).padStart(2, '0')}`, ville: 'Paris',
    email: null, telephone: null, nbCoproprietes: 1, nbBiens: 0 }));
  const servir60 = (fiche: unknown = FICHE_60): void => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep({ ok: true, id: 60 }); }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: [] });
      if (url.startsWith('/api/admin/gestion/syndics/60')) return rep({ etat: 'ok', fiche });
      if (url.startsWith('/api/admin/gestion/syndics?q=')) return rep({ etat: 'ok', disponible: true, syndics: SYNDICS_20 });
      if (url.startsWith('/api/admin/gestion/syndics/doublons')) return rep({ emails: [], noms: [] });
      return rep({});
    }));
  };
  const ouvrir60 = async (bien: string | null, onFerme = vi.fn()): Promise<ReturnType<typeof vi.fn>> => {
    servir60();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 60, onFerme,
        immeubleDepart: bien === null ? null : { libelle: bien, codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    return onFerme;
  };
  const tuiles = (): string[] => [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie, section[aria-labelledby="fsy-bloc-1"] > .fsy-contact-ouvert')]
    .map((t) => t.querySelector('.fsy-contact-nom')?.textContent ?? '');
  const deplier = async (nom: string): Promise<HTMLElement> => {
    const t = [...document.querySelectorAll('button.fsy-contact-replie')].find((b) => b.querySelector('.fsy-contact-nom')?.textContent === nom) as Element;
    await cliquer(t);
    return [...document.querySelectorAll('.fsy-contact-ouvert')].find((o) => o.querySelector('.fsy-contact-nom')?.textContent === nom) as HTMLElement;
  };
  const put = (): Corps | undefined => appels.find((a) => a.methode === 'PUT')?.corps as Corps | undefined;
  const lignesDepart = (c: Element): { question: string; annonce: string; copros: string[] } => ({
    question: c.querySelector('.fsy-parti-question')?.textContent ?? '',
    annonce: c.querySelector('.fsy-parti-annonce')?.textContent ?? '',
    copros: [...c.querySelectorAll('.fsy-parti-copros li')].map((x) => x.textContent ?? ''),
  });
  const PHRASE = 'M. Mathis BERCIER ne travaille plus chez _TEST ARNAUD / Asnieres Sur Seine ? Il sera retiré du catalogue et de ses 3 copropriétés : '
    + '15 rue Carle Hebert, 92400 Courbevoie · 12 rue des Pavillons, 92800 Puteaux · 25 rue Edith Cavell, 92400 Courbevoie.';

  it('le bouton « Ne travaille plus ici » : dans la tuile dépliée, depuis un bien (à côté de « Détacher ») comme depuis Syndics (à côté de « Supprimer ce contact »)', async () => {
    await ouvrir60('25 rue Edith Cavell');
    let o = await deplier('M. Mathis BERCIER');
    expect([...o.querySelectorAll('.fsy-boutons button')].map((b) => b.textContent)).toEqual(['Détacher de la copropriété', 'Ne travaille plus ici', 'Fermer', 'Modifier']);
    await act(async () => { root.render(null); });
    await ouvrir60(null);
    o = await deplier('M. Mathis BERCIER');
    expect([...o.querySelectorAll('.fsy-boutons button')].map((b) => b.textContent)).toEqual(['Supprimer ce contact', 'Ne travaille plus ici', 'Fermer', 'Modifier']);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-parti,.fsy-parti:hover{background:var(--color-svv-surface);color:var(--color-svv-gray)}');
  });

  it('pas de bouton pour un contact jamais enregistré (rien à quitter)', async () => {
    await ouvrir60(null);
    await cliquer(bouton('+ Ajouter un contact'));
    const champC = (label: string): HTMLInputElement => [...(document.querySelector('.fsy-contact-edit')?.querySelectorAll('label') ?? [])]
      .find((x) => x.querySelector('span')?.textContent === label)?.querySelector('input') as HTMLInputElement;
    await taper(champC('Nom'), 'Neuf');
    await cliquer(boutonDans(document.querySelector('.fsy-contact-edit'), 'Valider'));
    const o = await deplier('NEUF');
    expect(o.textContent).not.toContain('Ne travaille plus ici');
  });

  it('la confirmation DANS la tuile, avec ses copropriétés ; « Annuler » n’écrit rien et ne retire rien', async () => {
    await ouvrir60(null);
    const o = await deplier('M. Mathis BERCIER');
    await cliquer(boutonDans(o, 'Ne travaille plus ici'));
    const c = o.querySelector('.fsy-parti-confirmer') as HTMLElement;
    // LOT SYNDIC-CONFIRMATION-DEPART-UNE-COPRO-PAR-LIGNE — CE QU'IL DISAIT AVANT : la phrase d'un seul tenant (PHRASE),
    // copropriétés séparées par « · ». Même texte, désormais en lignes.
    expect(lignesDepart(c)).toEqual({
      question: 'M. Mathis BERCIER ne travaille plus chez _TEST ARNAUD / Asnieres Sur Seine ?',
      annonce: 'Il sera retiré du catalogue et de ses 3 copropriétés :',
      copros: ['15 rue Carle Hebert, 92400 Courbevoie', '12 rue des Pavillons, 92800 Puteaux', '25 rue Edith Cavell, 92400 Courbevoie'],
    });
    expect(`${lignesDepart(c).question} ${lignesDepart(c).annonce} ${lignesDepart(c).copros.join(' · ')}.`).toBe(PHRASE); // même texte
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Annuler', 'Oui, il ne travaille plus ici']);
    expect(c.querySelector('ul.fsy-parti-copros')?.compareDocumentPosition(c.querySelector('button') as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await cliquer(boutonDans(c, 'Annuler'));
    expect(o.querySelector('.fsy-parti-confirmer')).toBeNull();
    expect(tuiles()).toEqual(['M. Mathis BERCIER', 'Mme Léa UNE']);
    expect(appels.filter((a) => a.methode !== 'GET')).toEqual([]);
  });

  it('LOT SYNDIC-CONFIRMATION-DEPART-UNE-COPRO-PAR-LIGNE — UNE copropriété : « sa copropriété : » puis une ligne ; AUCUNE : « … du catalogue. » sans liste', async () => {
    await ouvrir60(null);
    let o = await deplier('Mme Léa UNE');
    await cliquer(boutonDans(o, 'Ne travaille plus ici'));
    let c = o.querySelector('.fsy-parti-confirmer') as HTMLElement;
    expect(lignesDepart(c)).toEqual({ question: 'Mme Léa UNE ne travaille plus chez _TEST ARNAUD / Asnieres Sur Seine ?',
      annonce: 'Elle sera retirée du catalogue et de sa copropriété :', copros: ['25 rue Edith Cavell, 92400 Courbevoie'] });
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Annuler', 'Oui, elle ne travaille plus ici']);
    await act(async () => { root.render(null); });
    servir60({ ...FICHE_60, contacts: [{ ...FICHE_60.contacts[1], civilite: null, immeubles: [] }] });
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: 60, onFerme: vi.fn() })); });
    await calmer();
    o = await deplier('Léa UNE');
    await cliquer(boutonDans(o, 'Ne travaille plus ici'));
    c = o.querySelector('.fsy-parti-confirmer') as HTMLElement;
    expect(lignesDepart(c)).toEqual({ question: 'Léa UNE ne travaille plus chez _TEST ARNAUD / Asnieres Sur Seine ?',
      annonce: 'Ce contact sera retiré du catalogue.', copros: [] });
    expect(c.querySelector('ul')).toBeNull();
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Annuler', 'Oui, ne travaille plus ici']);
  });

  it('la liste : puces discrètes, en retrait', async () => {
    await ouvrir60(null);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-parti-copros{margin:.05rem 0 .2rem;padding-left:1.4rem;list-style:disc;');
    expect(css).toContain('.fsy-parti-copros li::marker{color:var(--color-svv-muted)}');
  });

  it('« Oui » : il quitte la liste aussitôt ; au « Valider » de la fiche, il part (parti, sans coordonnées ni copropriétés), les autres restent', async () => {
    const onFerme = await ouvrir60(null);
    const o = await deplier('M. Mathis BERCIER');
    await cliquer(boutonDans(o, 'Ne travaille plus ici'));
    await cliquer(bouton('Oui, il ne travaille plus ici'));
    expect(tuiles()).toEqual(['Mme Léa UNE']);
    expect(appels.filter((a) => a.methode !== 'GET')).toEqual([]); // rien avant le Valider
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(put()?.contacts.map((c) => [c.id, c.nom, c.parti ?? false, c.immeubles, c.coordonnees])).toEqual([
      [92, 'Une', false, ['25 rue edith cavell'], []],
      [91, 'Bercier', true, [], []],
    ]);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('« Oui » puis « Annuler » la fiche : TOUT est annulé, rien n’est écrit', async () => {
    const onFerme = await ouvrir60(null);
    const o = await deplier('M. Mathis BERCIER');
    await cliquer(boutonDans(o, 'Ne travaille plus ici'));
    await cliquer(bouton('Oui, il ne travaille plus ici'));
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Annuler'));
    expect(document.querySelector('.fsy-pied')?.textContent).toContain('Abandonner les modifications ?');
    await cliquer(bouton('Oui, abandonner'));
    expect(onFerme).toHaveBeenCalledTimes(1);
    expect(appels.filter((a) => a.methode !== 'GET')).toEqual([]);
  });

  it('depuis un bien : après « Oui », absent de « Contacts de cette copropriété » ET du Catalogue', async () => {
    await ouvrir60('25 rue Edith Cavell');
    const o = await deplier('M. Mathis BERCIER');
    await cliquer(boutonDans(o, 'Ne travaille plus ici'));
    await cliquer(bouton('Oui, il ne travaille plus ici'));
    expect(tuiles()).toEqual(['Mme Léa UNE']);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(document.querySelector('.fsy-catalogue-liste')?.textContent ?? '').not.toContain('BERCIER');
  });

  it('« Anciens contacts (1) ▸ » en bas de la liste (écran Syndics), repliée ; dépliée : nom, titre, « parti le 10/10/2026 » ; absente depuis un bien', async () => {
    await ouvrir60(null);
    const l = document.querySelector('.fsy-anciens') as HTMLElement;
    const derniereTuile = [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie')].at(-1) as Element;
    expect(derniereTuile.compareDocumentPosition(l)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(l.querySelector('.fsy-suivis-tete')?.textContent).toBe('Anciens contacts (1)▸');
    expect(l.querySelector('.fsy-ancien')).toBeNull();
    await cliquer(l.querySelector('.fsy-suivis-tete') as Element);
    const a = l.querySelector('.fsy-ancien') as HTMLElement;
    expect(a.querySelector('span')?.textContent).toBe('Jean ANCIEN · Service comptabilité · parti le 10/10/2026');
    expect([...a.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Réintégrer au catalogue']);
    expect(a.querySelector('input')).toBeNull(); // lecture seule
    await act(async () => { root.render(null); });
    await ouvrir60('25 rue Edith Cavell');
    expect(document.querySelector('.fsy-anciens')).toBeNull();
  });

  it('N = 0 : pas de ligne « Anciens contacts »', async () => {
    servir60({ ...FICHE_60, anciens: [] });
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: 60, onFerme: vi.fn() })); });
    await calmer();
    expect(document.querySelector('.fsy-anciens')).toBeNull();
    expect(document.body.textContent).not.toContain('Anciens contacts');
  });

  it('« Réintégrer au catalogue » : il revient dans la liste (sans copropriété) ; au Valider, réintégré avec ses coordonnées', async () => {
    await ouvrir60(null);
    await cliquer(document.querySelector('.fsy-anciens .fsy-suivis-tete') as Element);
    await cliquer(bouton('Réintégrer au catalogue'));
    expect(document.querySelector('.fsy-anciens')).toBeNull();
    expect(tuiles()).toEqual(['M. Mathis BERCIER', 'Mme Léa UNE', 'Jean ANCIEN']);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    const c = put()?.contacts.find((x) => x.id === 99);
    expect(c).toMatchObject({ nom: 'Ancien', reintegre: true, immeubles: [], coordonnees: [{ id: null, sorte: 'email', libelle: '', valeur: 'jean@test.invalid' }] });
  });

  it('« Créer un nouveau syndic » dans la ligne de TITRE, juste à gauche de ×, HORS de la zone qui défile — 20 syndics ; comportement inchangé', async () => {
    servir60();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: null, onFerme: vi.fn(), immeubleDepart: { libelle: '9 rue Neuve', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await attendre(250);
    expect(document.querySelectorAll('.fsy-resultat')).toHaveLength(20);
    const tete = document.querySelector('.fsy-tete') as HTMLElement;
    const b = [...tete.querySelectorAll('button')].map((x) => [x.textContent, x.className]);
    expect(b).toEqual([['Créer un nouveau syndic', 'svv-btn svv-btn-primary gst-btn fsy-creer-tete'], ['×', 'fsy-croix']]);
    expect(document.querySelector('.fsy-corps')?.textContent).not.toContain('Créer un nouveau syndic');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-tete-actions{flex:0 0 auto;display:flex;align-items:center;gap:.35rem;margin-left:auto}');
    expect(css).toContain('.fsy-tete{flex-wrap:wrap}');
    await cliquer(bouton('Créer un nouveau syndic'));
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Créer un syndic');
    expect(document.querySelector('.fsy-creer-tete')).toBeNull(); // seulement à l'étape de recherche
    expect(document.body.textContent).toContain('9 rue Neuve');
  });
});

/**
 * ══ LOT SYNDIC-CONTACT-ALERTE-COORDONNEES-MANQUANTES ═════════════════════════════════════════════════════════════
 * Fiche 11 : Léa DURAND, un téléphone, aucun e-mail. Ici, `cliquer` ne répond PAS à l'avertissement.
 */
describe('LOT SYNDIC-CONTACT-ALERTE-COORDONNEES-MANQUANTES', () => {
  beforeEach(() => { passerAlerteCoord = false; });
  const edit = (): HTMLElement => document.querySelector('.fsy-contact-edit') as HTMLElement;
  const champC = (label: string): HTMLInputElement => [...edit().querySelectorAll('label')]
    .find((x) => x.querySelector('span')?.textContent === label)?.querySelector('input') as HTMLInputElement;
  const tels = (): HTMLInputElement[] => [...edit().querySelectorAll('input[aria-label="Téléphone du contact"]')] as HTMLInputElement[];
  const mails = (): HTMLInputElement[] => [...edit().querySelectorAll('input[aria-label="E-mail du contact"]')] as HTMLInputElement[];
  const alerte = (): HTMLElement | null => document.querySelector('.fsy-contact-edit .fsy-alerte-coord');
  const nouveau = async (prenom: string, nom: string, coord: { tel?: string; mail?: string } = {}): Promise<void> => {
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    if (prenom) await taper(champC('Prénom'), prenom);
    if (nom) await taper(champC('Nom'), nom);
    if (coord.tel !== undefined) { await cliquer(boutonDans(edit(), '+ téléphone')); await taper(tels()[0], coord.tel); }
    if (coord.mail !== undefined) { await cliquer(boutonDans(edit(), '+ e-mail')); await taper(mails()[0], coord.mail); }
  };
  const valider = async (): Promise<void> => { await cliquer(boutonDans(edit(), 'Valider')); };
  const noms = (): string[] => [...document.querySelectorAll('button.fsy-contact-replie .fsy-contact-nom')].map((x) => x.textContent ?? '');

  for (const [cas, coord, attendu] of [
    ['sans e-mail', { tel: '06 11 22 33 44' }, 'Aucune adresse e-mail pour Anne NEUVE. Valider quand même ?'],
    ['sans téléphone', { mail: 'anne@test.invalid' }, 'Aucun numéro de téléphone pour Anne NEUVE. Valider quand même ?'],
    ['sans les deux', {}, 'Ni téléphone ni e-mail pour Anne NEUVE. Valider quand même ?'],
  ] as const) {
    it(`NOUVEAU CONTACT ${cas} : l'avertissement orange, au-dessus des boutons, « Compléter » / « Valider quand même »`, async () => {
      await nouveau('Anne', 'Neuve', coord);
      await valider();
      const a = alerte() as HTMLElement;
      expect(a.querySelector('span')?.textContent).toBe(attendu);
      expect([...a.querySelectorAll('button')].map((b) => [b.textContent, b.className.includes('svv-btn-primary') ? 'rouge' : 'blanc']))
        .toEqual([['Compléter', 'blanc'], ['Valider quand même', 'rouge']]);
      expect(a.compareDocumentPosition(edit().querySelector('.fsy-boutons--contact') as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(noms()).toEqual(['Léa DURAND']); // pas encore validé
    });
  }

  it('sans nom : « … pour ce contact. »', async () => {
    await ouvrir();
    await cliquer(bouton('+ Ajouter un contact'));
    const select = edit().querySelector('select') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'Service comptabilité');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await valider();
    expect(alerte()?.querySelector('span')?.textContent).toBe('Ni téléphone ni e-mail pour ce contact. Valider quand même ?');
  });

  it('une ligne « + téléphone » ouverte mais VIDE compte comme absente', async () => {
    await nouveau('Anne', 'Neuve', { mail: 'anne@test.invalid' });
    await cliquer(boutonDans(edit(), '+ téléphone'));
    expect(tels()).toHaveLength(1);
    await valider();
    expect(alerte()?.querySelector('span')?.textContent).toBe('Aucun numéro de téléphone pour Anne NEUVE. Valider quand même ?');
  });

  it('« Compléter » sans ligne : ouvre « + téléphone » et y met le curseur ; avec une ligne vide : le curseur y va, sans en ouvrir une autre', async () => {
    await nouveau('Anne', 'Neuve', { mail: 'anne@test.invalid' });
    await valider();
    await cliquer(boutonDans(alerte(), 'Compléter'));
    expect(alerte()).toBeNull();
    expect(tels()).toHaveLength(1);
    expect(document.activeElement).toBe(tels()[0]);
    await act(async () => { (document.activeElement as HTMLElement).blur(); });
    await valider();
    await cliquer(boutonDans(alerte(), 'Compléter'));
    expect(tels()).toHaveLength(1);
    expect(document.activeElement).toBe(tels()[0]);
  });

  it('« Compléter » quand seul l’e-mail manque : le curseur dans un champ E-mail', async () => {
    await nouveau('Anne', 'Neuve', { tel: '06 11 22 33 44' });
    await valider();
    await cliquer(boutonDans(alerte(), 'Compléter'));
    expect(mails()).toHaveLength(1);
    expect(document.activeElement).toBe(mails()[0]);
  });

  it('« Valider quand même » : le contact est validé comme aujourd’hui (rien n’est obligatoire)', async () => {
    await nouveau('Anne', 'Neuve');
    await valider();
    await cliquer(boutonDans(alerte(), 'Valider quand même'));
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    expect(noms()).toEqual(['Léa DURAND', 'Anne NEUVE']);
  });

  it('un contact COMPLET (téléphone ET e-mail) passe directement, sans avertissement', async () => {
    await nouveau('Anne', 'Neuve', { tel: '06 11 22 33 44', mail: 'anne@test.invalid' });
    await valider();
    expect(document.querySelector('.fsy-alerte-coord')).toBeNull();
    expect(noms()).toEqual(['Léa DURAND', 'Anne NEUVE']);
  });

  it('EN MODIFICATION : Léa (téléphone seul) → « Aucune adresse e-mail pour Léa BERNARD. Valider quand même ? »', async () => {
    await ouvrir();
    await cliquer(document.querySelector('button.fsy-contact-replie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert'), 'Modifier'));
    await taper(champC('Nom'), 'Bernard');
    await valider();
    expect(alerte()?.querySelector('span')?.textContent).toBe('Aucune adresse e-mail pour Léa BERNARD. Valider quand même ?');
    await cliquer(boutonDans(alerte(), 'Valider quand même'));
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    expect(document.querySelector('.fsy-contact-ouvert .fsy-contact-nom')?.textContent).toBe('Léa BERNARD');
  });

  it('l’ANTI-DOUBLON passe AVANT : un doublon bloquant ⇒ pas d’avertissement des coordonnées', async () => {
    await nouveau('Léa', 'Durand');
    await valider();
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Ce contact existe déjà … ».
    expect(document.querySelector('.fsy-contact-edit .fsy-doublon')?.textContent).toContain('Un contact nommé Léa DURAND existe déjà chez');
    expect(alerte()).toBeNull();
    expect(noms()).toEqual(['Léa DURAND']);
  });

  it('la feuille : encadré orange clair (jetons orange)', async () => {
    await ouvrir();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('').replace(/\s+/g, ' ');
    expect(css).toContain('border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft)');
  });
});

/** LOT SYNDIC-TITRE-APRES-RETRAIT — le titre de la recherche selon le chemin. */
describe('LOT SYNDIC-TITRE-APRES-RETRAIT', () => {
  let retire = false;
  const servir = (): void => {
    retire = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: null }); if (url.endsWith('/retirer-copropriete')) retire = true; return rep({ ok: true, lots: 1 }); }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) {
        return rep({ etat: 'ok', disponible: true, immeubles: [{ cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', lots: [],
          syndic: retire ? null : { id: 70, nom: '_TEST TITRE', ville: 'Paris' } }] });
      }
      if (url.startsWith('/api/admin/gestion/syndics/70')) {
        return rep({ etat: 'ok', fiche: { ...FICHE, id: 70, nom: '_TEST TITRE', ville: 'Paris', contacts: [],
          coproprietes: [{ id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] }] } });
      }
      if (url.startsWith('/api/admin/gestion/syndics?q=')) return rep({ etat: 'ok', disponible: true, syndics: [] });
      return rep({});
    }));
  };
  const monter = async (): Promise<void> => {
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: '12 rue X', lotId: 5 })); });
    await calmer();
  };
  const titre = (): string => document.querySelector('#fsy-titre')?.textContent ?? '';

  it('juste après le retrait : « Rattacher un nouveau syndic de copropriété » ; le reste identique (Créer en tête, Annuler)', async () => {
    servir();
    await monter();
    await cliquer(document.querySelector('button.bsy') as Element);
    expect(titre()).toBe('_TEST TITRE / Paris');
    await cliquer(document.querySelector('button.fsy-retrait') as Element);
    await cliquer(bouton('Oui, retirer de cette résidence'));
    await attendre(250);
    expect(titre()).toBe('Rattacher un nouveau syndic de copropriété');
    expect([...document.querySelectorAll('.fsy-tete button')].map((b) => b.textContent)).toEqual(['Créer un nouveau syndic', '×']);
    expect(boutonDans(document.querySelector('.fsy-pied'), 'Annuler')).toBeTruthy();
  });

  it('fermée puis rouverte par la carte du bien : le titre normal « Syndic de la copropriété »', async () => {
    servir();
    await monter();
    await cliquer(document.querySelector('button.bsy') as Element);
    await cliquer(document.querySelector('button.fsy-retrait') as Element);
    await cliquer(bouton('Oui, retirer de cette résidence'));
    await attendre(250);
    await cliquer(bouton('×'));
    expect(document.querySelector('.fsy')).toBeNull();
    expect(document.querySelector('.bsy-mot')?.textContent).toBe('Créer le syndic');
    await cliquer(document.querySelector('button.bsy') as Element);
    await attendre(250);
    expect(titre()).toBe('Syndic de la copropriété');
  });

  it('par « Créer le syndic » d’une carte de bien : « Syndic de la copropriété »', async () => {
    servir();
    retire = true; // la copropriété n'a pas de syndic : la carte dit « Créer le syndic »
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: '12 rue X', lotId: 5 })); });
    await calmer();
    expect(document.querySelector('.bsy-mot')?.textContent).toBe('Créer le syndic');
    await cliquer(document.querySelector('button.bsy') as Element);
    await attendre(250);
    expect(titre()).toBe('Syndic de la copropriété');
  });
});

/**
 * ══ LOT COPRO-CONTACTS-IMMEUBLE ══════════════════════════════════════════════════════════════════════════════════
 * Syndic _TEST 80 ; copropriétés 12 rue X (le bien) et 3 av Y ; au syndic, Léa DURAND (12 rue X). Le carnet de 12 rue X
 * est servi par la route des contacts d'immeuble (vide, ou un gardien).
 */
describe('LOT COPRO-CONTACTS-IMMEUBLE', () => {
  type CI = { id: number | null; categorie: string; libelle: string; civilite: string | null; prenom: string; nom: string; note: string; coordonnees: Array<{ sorte: string; valeur: string }> };
  type Corps = { contactsImmeuble?: { immeuble: string; contacts: CI[] }; contacts: Array<{ nom: string }> };
  const FICHE_80 = {
    ...FICHE, id: 80, nom: '_TEST Carnet', ville: 'Paris',
    contacts: [{ id: 4, titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', civilite: null, tousImmeubles: false, immeubles: ['12 rue x'],
      coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }] }],
    coproprietes: [
      { id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
      { id: 7, cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] },
    ],
  };
  const GARDIEN = { id: 501, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: 'Paul', nom: 'Loge', note: 'Loge au rez-de-chaussée',
    coordonnees: [{ id: 601, sorte: 'telephone', libelle: null, valeur: '0611223344' }, { id: 602, sorte: 'email', libelle: null, valeur: 'loge@test.invalid' }] };
  let carnet: unknown[] = [];
  const servir80 = (): void => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep({ ok: true, id: 80 }); }
      if (url.startsWith('/api/admin/gestion/coproprietes/contacts?immeuble=')) {
        appels.push({ url, methode: m, corps: null });
        return rep({ etat: 'ok', contacts: decodeURIComponent(url.split('=')[1]) === '12 rue X' ? carnet : [] });
      }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: [] });
      if (url.startsWith('/api/admin/gestion/syndics/80')) return rep({ etat: 'ok', fiche: FICHE_80 });
      if (url.startsWith('/api/admin/gestion/syndics/doublons')) return rep({ emails: [], noms: [] });
      return rep({});
    }));
  };
  const ouvrir80 = async (bien: boolean, contenu: unknown[] = []): Promise<ReturnType<typeof vi.fn>> => {
    carnet = contenu;
    servir80();
    const onFerme = vi.fn();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 80, onFerme,
        immeubleDepart: bien ? { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } : null }));
    });
    await calmer();
    return onFerme;
  };
  const choix = (): HTMLElement | null => document.querySelector('.fsy-choix-ajout');
  const blocImmeuble = (): HTMLElement | null => document.querySelector('section[aria-labelledby="fsy-bloc-ajout-immeuble"]');
  const edit = (): HTMLElement => document.querySelector('.fsy-contact-edit') as HTMLElement;
  const champC = (label: string): HTMLInputElement => [...edit().querySelectorAll('label')]
    .find((x) => x.querySelector('span')?.textContent === label)?.querySelector('input, textarea') as HTMLInputElement;
  const tuilesImmeuble = (): string[] => [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] > .fsy-contact-immeuble')]
    .map((t) => `${t.querySelector('.fsy-contact-nom')?.textContent ?? ''}|${t.querySelector('.fsy-contact-titre')?.textContent ?? ''}`);
  const put = (): Corps | undefined => appels.filter((a) => a.methode === 'PUT').at(-1)?.corps as Corps | undefined;
  const ouvrirAjoutImmeuble = async (): Promise<void> => {
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(bouton('Habitant / gardien de l’immeuble'));
  };
  const valider = async (): Promise<void> => { await cliquer(boutonDans(edit(), 'Valider')); };
  beforeEach(() => { passerChoixAjout = false; });

  it('le CHOIX : deux gros boutons côte à côte et « Annuler », rien d’ouvert ; Annuler remet « + Ajouter un contact »', async () => {
    await ouvrir80(true);
    await cliquer(bouton('+ Ajouter un contact'));
    const c = choix() as HTMLElement;
    expect([...c.querySelectorAll('.fsy-choix-ajout-boutons button')].map((b) => b.textContent))
      .toEqual(['Contact du syndic de copropriété', 'Habitant / gardien de l’immeuble']);
    expect(boutonDans(c, 'Annuler')).toBeTruthy();
    expect(document.querySelector('.fsy-contact-edit')).toBeNull();
    expect(document.querySelector('.fsy-catalogue')).toBeNull();
    await cliquer(boutonDans(c, 'Annuler'));
    expect(choix()).toBeNull();
    expect(bouton('+ Ajouter un contact')).toBeTruthy();
  });

  it('① : EXACTEMENT l’ajout d’aujourd’hui — « Ajouter un contact syndic à cette copropriété », Nouveau contact', async () => {
    await ouvrir80(true);
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(bouton('Contact du syndic de copropriété'));
    expect(document.querySelector('#fsy-bloc-ajout')?.textContent).toBe('Ajouter un contact syndic à cette copropriété');
    expect(edit().querySelector('legend')?.textContent).toBe('Nouveau contact');
    expect(edit().querySelector('[aria-label="Catégorie"]')).toBeNull();
    expect(blocImmeuble()).toBeNull();
  });

  it('écran SYNDICS : pas de choix — « + Ajouter un contact » ouvre directement le contact du cabinet ; pas de carnet', async () => {
    await ouvrir80(false);
    await cliquer(bouton('+ Ajouter un contact'));
    expect(choix()).toBeNull();
    expect(document.querySelector('#fsy-bloc-ajout')?.textContent).toBe('Ajouter un contact au cabinet');
    expect(appels.some((a) => a.url.startsWith('/api/admin/gestion/coproprietes/contacts'))).toBe(false);
  });

  it('② : le bloc « Ajouter un contact de l’immeuble » — catégorie (3 pilules), civilité, prénom, nom, + téléphone, + e-mail, note, « Sera rattaché à », sans catalogue', async () => {
    await ouvrir80(true);
    await ouvrirAjoutImmeuble();
    const b = blocImmeuble() as HTMLElement;
    expect(b.querySelector('#fsy-bloc-ajout-immeuble')?.textContent).toBe('Ajouter un contact de l’immeuble');
    expect(boutonDans(b, '× Fermer')).toBeTruthy();
    expect(b.querySelector('.fsy-catalogue')).toBeNull();
    expect(b.querySelector('legend')?.textContent).toBe('Nouveau contact de l’immeuble');
    expect([...b.querySelectorAll('[aria-label="Catégorie"] button')].map((x) => x.textContent)).toEqual(['Gardien', 'Conseil syndical', 'Personnalisé']);
    expect([...b.querySelectorAll('[aria-label="Civilité"] button')].map((x) => x.textContent)).toEqual(['M.', 'Mme']);
    for (const l of ['Prénom', 'Nom', 'Note']) expect(champC(l)).toBeTruthy();
    expect(boutonDans(b, '+ téléphone')).toBeTruthy();
    expect(boutonDans(b, '+ e-mail')).toBeTruthy();
    expect(b.querySelector('.fsy-suivis')?.textContent).toBe('Sera rattaché à : 12 rue X, 92400 Courbevoie');
    expect([...b.querySelectorAll('.fsy-boutons--contact button')].map((x) => x.textContent)).toEqual(['Annuler', 'Valider']);
    expect(b.textContent).not.toContain('Immeubles suivis');
    await cliquer(boutonDans(b, '× Fermer'));
    expect(blocImmeuble()).toBeNull();
  });

  for (const [categorie, libre, attendu, base] of [
    ['Gardien', '', 'Gardien', 'gardien'], ['Conseil syndical', '', 'Conseil syndical', 'conseil_syndical'], ['Personnalisé', 'Habitant', 'Habitant', 'personnalise'],
  ] as const) {
    it(`CRÉATION « ${categorie} » : la tuile dans « Habitants et gardien de l’immeuble », puis enregistrée au Valider de la fiche`, async () => {
      passerAlerteCoord = true;
      await ouvrir80(true);
      expect(document.body.textContent).not.toContain('Habitants et gardien de l’immeuble'); // vide ⇒ masquée
      await ouvrirAjoutImmeuble();
      await cliquer(boutonDans(edit().querySelector('[aria-label="Catégorie"]'), categorie));
      if (libre) await taper(champC('Libellé personnalisé *'), libre);
      await cliquer(boutonDans(edit().querySelector('[aria-label="Civilité"]'), 'Mme'));
      await taper(champC('Prénom'), 'Anne');
      await taper(champC('Nom'), 'Neuve');
      await valider();
      expect(blocImmeuble()).toBeNull();
      expect(document.querySelector('section[aria-labelledby="fsy-bloc-1"] .fsy-sous-titre--immeuble')?.textContent).toBe('Habitants et gardien de l’immeuble');
      expect(tuilesImmeuble()).toEqual([`Mme Anne NEUVE|${attendu}`]);
      await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
      expect(put()?.contactsImmeuble).toEqual({ immeuble: '12 rue X', contacts: [
        { id: null, categorie: base, libelle: libre, civilite: 'Mme', prenom: 'Anne', nom: 'Neuve', note: '', coordonnees: [] }] });
      expect(put()?.contacts.map((c) => c.nom)).toEqual(['Durand']); // le syndic n'a rien reçu
    });
  }

  it('« Personnalisé » SANS libellé : refusé ; sans catégorie : refusé', async () => {
    await ouvrir80(true);
    await ouvrirAjoutImmeuble();
    await taper(champC('Nom'), 'Neuve');
    await valider();
    expect(edit().querySelector('.fsy-alerte[role="alert"]')?.textContent).toBe('Choisissez une catégorie : Gardien, Conseil syndical ou Personnalisé.');
    await cliquer(boutonDans(edit().querySelector('[aria-label="Catégorie"]'), 'Personnalisé'));
    await valider();
    expect(edit().querySelector('.fsy-alerte[role="alert"]')?.textContent).toBe('Précisez le libellé personnalisé (Habitant, Femme de ménage…).');
    expect(blocImmeuble()).not.toBeNull();
    expect(tuilesImmeuble()).toEqual([]);
  });

  it('la liste lue du serveur : intertitre, tuile « M. Paul LOGE | Gardien » ; dépliée : coordonnées, note, Retirer / Fermer / Modifier — sans actions du syndic', async () => {
    await ouvrir80(true, [GARDIEN]);
    expect(tuilesImmeuble()).toEqual(['M. Paul LOGE|Gardien']);
    const titres = [...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] h4')].map((h) => h.textContent);
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Contacts de cette copropriété ».
    expect(titres).toEqual(['Contact(s) syndic de cette copropriété', 'Habitants et gardien de l’immeuble']);
    await cliquer(document.querySelector('button.fsy-contact-immeuble') as Element);
    const o = document.querySelector('.fsy-contact-ouvert.fsy-contact-immeuble') as HTMLElement;
    expect(o.textContent).toContain('06 11 22 33 44');
    expect(o.textContent).toContain('loge@test.invalid');
    expect(o.querySelector('.fsy-note-contact')?.textContent).toBe('Note : Loge au rez-de-chaussée');
    expect([...o.querySelectorAll('.fsy-boutons button')].map((b) => b.textContent)).toEqual(['Retirer de l’immeuble', 'Fermer', 'Modifier']);
    expect(o.textContent).not.toMatch(/Détacher|Ne travaille plus|Supprimer ce contact|copropriétés suivies/i);
  });

  it('MODIFICATION puis RETRAIT : « Retirer Paul LOGE de l’immeuble ? » Non / Oui ; au Valider, la liste envoyée sans lui (le serveur le retire, historisé)', async () => {
    await ouvrir80(true, [GARDIEN]);
    await cliquer(document.querySelector('button.fsy-contact-immeuble') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert.fsy-contact-immeuble'), 'Modifier'));
    expect(edit().querySelector('.fsy-suivis')?.textContent).toBe('Rattaché à : 12 rue X, 92400 Courbevoie');
    const note = champC('Note') as unknown as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(note, 'Loge côté cour');
      note.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await valider();
    let o = document.querySelector('.fsy-contact-ouvert.fsy-contact-immeuble') as HTMLElement;
    expect(o.querySelector('.fsy-note-contact')?.textContent).toBe('Note : Loge côté cour');
    await cliquer(boutonDans(o, 'Retirer de l’immeuble'));
    expect(o.querySelector('.fsy-confirmer span')?.textContent).toBe('Retirer Paul LOGE de l’immeuble ?');
    await cliquer(boutonDans(o, 'Non'));
    expect(tuilesImmeuble()).toEqual(['M. Paul LOGE|Gardien']);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(put()?.contactsImmeuble?.contacts.map((c) => [c.id, c.note])).toEqual([[501, 'Loge côté cour']]);
    appels = [];
    await act(async () => { root.render(null); });
    await ouvrir80(true, [GARDIEN]);
    await cliquer(document.querySelector('button.fsy-contact-immeuble') as Element);
    o = document.querySelector('.fsy-contact-ouvert.fsy-contact-immeuble') as HTMLElement;
    await cliquer(boutonDans(o, 'Retirer de l’immeuble'));
    await cliquer(boutonDans(o, 'Oui'));
    expect(tuilesImmeuble()).toEqual([]);
    expect(document.body.textContent).not.toContain('Habitants et gardien de l’immeuble');
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(put()?.contactsImmeuble).toEqual({ immeuble: '12 rue X', contacts: [] });
  });

  it('ANTI-DOUBLON dans le MÊME IMMEUBLE seulement : même nom qu’un contact de l’immeuble ⇒ bloqué ; même nom qu’un contact du SYNDIC ⇒ accepté', async () => {
    passerAlerteCoord = true;
    await ouvrir80(true, [GARDIEN]);
    await ouvrirAjoutImmeuble();
    await cliquer(boutonDans(edit().querySelector('[aria-label="Catégorie"]'), 'Conseil syndical'));
    await taper(champC('Prénom'), 'paul');
    await taper(champC('Nom'), 'LOGE');
    await valider();
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — CE QU'IL DISAIT AVANT : « Ce contact existe déjà dans cet immeuble : Paul LOGE · Gardien ».
    expect(edit().querySelector('.fsy-doublon')?.textContent).toBe('Un contact nommé Paul LOGE existe déjà dans l’immeuble 12 rue X, 92400 Courbevoie.');
    expect(blocImmeuble()).not.toBeNull();
    await taper(champC('Prénom'), 'Léa');
    await taper(champC('Nom'), 'Durand');
    // En quittant le champ, la vérification est relancée (comme à l'écran) : plus de doublon dans cet immeuble.
    await act(async () => { champC('Nom').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await calmer();
    expect(edit().querySelector('.fsy-doublon')).toBeNull();
    await valider();
    expect(blocImmeuble()).toBeNull();
    expect(tuilesImmeuble()).toEqual(['M. Paul LOGE|Gardien', 'Léa DURAND|Conseil syndical']);
  });

  it('ALERTE coordonnées et ARRIVÉE rose : mêmes mécanismes', async () => {
    passerAlerteCoord = false;
    await ouvrir80(true);
    await ouvrirAjoutImmeuble();
    await cliquer(boutonDans(edit().querySelector('[aria-label="Catégorie"]'), 'Gardien'));
    await taper(champC('Nom'), 'Loge');
    await valider();
    expect(document.querySelector('.fsy-alerte-coord span')?.textContent).toBe('Ni téléphone ni e-mail pour LOGE. Valider quand même ?');
    await cliquer(bouton('Valider quand même'));
    const t = document.querySelector('button.fsy-contact-immeuble') as HTMLElement;
    expect(t.classList.contains('fsy-arrivee')).toBe(true);
  });

  it('le bandeau de la fiche : un contact d’immeuble en modification ⇒ « Enregistrer les modifications de Paul LOGE ? » — Oui', async () => {
    await ouvrir80(true, [GARDIEN]);
    await cliquer(document.querySelector('button.fsy-contact-immeuble') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-contact-ouvert.fsy-contact-immeuble'), 'Modifier'));
    await taper(champC('Nom'), 'Loges');
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(document.querySelector('.fsy-pied .fsy-question')?.textContent).toBe('Enregistrer les modifications de Paul LOGES ?');
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Oui'));
    expect(put()?.contactsImmeuble?.contacts.map((c) => [c.id, c.nom])).toEqual([[501, 'Loges']]);
  });

  it('le carnet lu n’est pas une modification : Valider sans rien toucher ferme sans écrire', async () => {
    const onFerme = await ouvrir80(true, [GARDIEN]);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(appels.filter((a) => a.methode !== 'GET')).toEqual([]);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });
});

/**
 * ══ LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — entre carnets, et la confirmation exigée par le serveur ══════════
 * Syndic _TEST 90, depuis le bien 12 rue X : Léa DURAND (syndic, 06 13 86 18 77) ; au carnet, M. Paul LOGE (gardien,
 * loge@test.invalid).
 */
describe('LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — entre carnets', () => {
  const FICHE_90 = {
    ...FICHE, id: 90, nom: '_TEST Doublons', ville: 'Paris',
    contacts: [{ id: 4, titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', civilite: null, tousImmeubles: false, immeubles: ['12 rue x'],
      coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }] }],
  };
  const LOGE = { id: 501, categorie: 'gardien', libelle: null, civilite: 'M.', prenom: 'Paul', nom: 'Loge', note: null,
    coordonnees: [{ id: 602, sorte: 'email', libelle: null, valeur: 'loge@test.invalid' }] };
  let reponsePut: { status: number; corps: unknown } = { status: 200, corps: { ok: true, id: 90 } };
  const servir = (): void => {
    reponsePut = { status: 200, corps: { ok: true, id: 90 } };
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      if (m !== 'GET') {
        appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null });
        const r = reponsePut; reponsePut = { status: 200, corps: { ok: true, id: 90 } };
        return { ok: r.status < 300, status: r.status, json: async () => r.corps };
      }
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) return rep({ etat: 'ok', contacts: [LOGE] });
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: [] });
      if (url.startsWith('/api/admin/gestion/syndics/90')) return rep({ etat: 'ok', fiche: FICHE_90 });
      if (url.startsWith('/api/admin/gestion/syndics/doublons')) {
        // ce que la base sait : LES DEUX carnets — l'écran les remplace par le formulaire pour CE syndic et CET immeuble
        return rep({ emails: [], noms: [], coordonnees: [
          { sorte: 'email', cle: 'loge@test.invalid', proprietaire: { genre: 'immeuble', contactId: 501, civilite: 'M.', prenom: 'Paul', nom: 'Loge',
            categorie: 'Gardien', immeubleCle: '12 rue x', immeubleAdresse: 'périmé' } },
        ] });
      }
      return rep({});
    }));
  };
  const ouvrir90 = async (): Promise<void> => {
    servir();
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 90, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };
  const edit = (): HTMLElement => document.querySelector('.fsy-contact-edit') as HTMLElement;
  const orange = (): string[][] => [...edit().querySelectorAll('.fsy-doublon-coord')].map((p) => [...p.querySelectorAll('span')].map((x) => x.textContent ?? ''));
  const saisir = async (sorte: 'telephone' | 'email', v: string): Promise<void> => {
    await cliquer(boutonDans(edit(), sorte === 'email' ? '+ e-mail' : '+ téléphone'));
    const champ = edit().querySelector(`input[aria-label="${sorte === 'email' ? 'E-mail' : 'Téléphone'} du contact"]`) as HTMLInputElement;
    await taper(champ, v);
    await act(async () => { champ.focus(); champ.blur(); });
    await calmer();
  };

  it('contact SYNDIC avec l’e-mail du GARDIEN : « … par M. Paul LOGE · Gardien · 12 rue X, 92400 Courbevoie. »', async () => {
    await ouvrir90();
    await cliquer(bouton('+ Ajouter un contact')); // ① par défaut
    await saisir('email', 'Loge@Test.invalid');
    expect(orange()).toEqual([['L’adresse e-mail Loge@Test.invalid est déjà utilisée par M. Paul LOGE · Gardien · 12 rue X, 92400 Courbevoie.']]);
  });

  it('contact d’IMMEUBLE avec le téléphone d’un contact du SYNDIC rattaché à cette copropriété : « (déjà rattaché à cette copropriété) »', async () => {
    passerChoixAjout = false;
    await ouvrir90();
    await cliquer(bouton('+ Ajouter un contact'));
    await cliquer(bouton('Habitant / gardien de l’immeuble'));
    await saisir('telephone', '06.13.86.18.77');
    expect(orange()).toEqual([['Le numéro 06 13 86 18 77 est déjà utilisé par Léa DURAND · Responsable de copropriété · _TEST Doublons / Paris (déjà rattaché à cette copropriété).']]);
  });

  it('le SERVEUR exige la confirmation : sans elle, 409 et ses lignes dans le pied ; « Enregistrer quand même » renvoie avec la confirmation', async () => {
    const onFerme = vi.fn();
    servir();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: 90, onFerme })); });
    await calmer();
    await taper(champ('Nom du cabinet *'), '_TEST Doublons bis');
    reponsePut = { status: 409, corps: { erreur: 'x', avertissement: ['L’adresse e-mail a@b.fr est déjà utilisée par :', 'A', 'B'] } };
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    const g = document.querySelector('.fsy-avert-serveur') as HTMLElement;
    expect([...g.querySelectorAll('.fsy-alerte-coord-texte > span')].map((x) => x.textContent))
      .toEqual(['L’adresse e-mail a@b.fr est déjà utilisée par :', 'A', 'B', 'Enregistrer quand même ?']);
    expect(onFerme).not.toHaveBeenCalled();
    expect((appels.filter((a) => a.methode === 'PUT')[0].corps as { confirmeDoublons?: boolean }).confirmeDoublons).toBeUndefined();
    await cliquer(boutonDans(g, 'Enregistrer quand même'));
    const puts = appels.filter((a) => a.methode === 'PUT');
    expect(puts).toHaveLength(2);
    expect((puts[1].corps as { confirmeDoublons?: boolean }).confirmeDoublons).toBe(true);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('« Revenir » : rien n’est renvoyé, la fiche reste ouverte', async () => {
    const onFerme = vi.fn();
    servir();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: 90, onFerme })); });
    await calmer();
    await taper(champ('Nom du cabinet *'), '_TEST Doublons ter');
    reponsePut = { status: 409, corps: { erreur: 'x', avertissement: ['Le numéro 07 60 20 10 10 est déjà utilisé par A.'] } };
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    await cliquer(boutonDans(document.querySelector('.fsy-avert-serveur'), 'Revenir'));
    expect(document.querySelector('.fsy-avert-serveur')).toBeNull();
    expect(appels.filter((a) => a.methode === 'PUT')).toHaveLength(1);
    expect(onFerme).not.toHaveBeenCalled();
  });
});

/**
 * ══ LOT COPRO-PLUSIEURS-ADRESSES ═════════════════════════════════════════════════════════════════════════════════
 * Syndic _TEST 95 : la copropriété 12 rue X (lot 101) a une adresse secondaire 3 av Y (lots 301, 302). Ailleurs :
 * 9 bd W (lot 901) n'est à personne ; 5 rue Prise est la copropriété d'AUTRE / Lyon ; 7 rue Sec est l'adresse
 * secondaire de la copropriété 1 rue Autre (AUTRE / Lyon).
 */
describe('LOT COPRO-PLUSIEURS-ADRESSES', () => {
  const lot = (id: number, numero: string, adresse: string) => ({ id, numero, adresse, commune: 'COURBEVOIE', proprietaires: [] as string[] });
  const AUTRE = { id: 7, nom: 'AUTRE', ville: 'Lyon' };
  const MOI = { id: 95, nom: '_TEST Multi', ville: 'Paris' };
  const P = { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' };
  const CONNUS = [
    { ...P, lots: [lot(101, '101', '12 rue X')], syndic: MOI, secondaires: [{ cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie' }] },
    { cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', lots: [lot(301, '301', '3 av Y'), lot(302, '302', '3 av Y')], syndic: MOI, principale: P },
    { cle: '9 bd w', libelle: '9 bd W', codePostal: '92400', commune: 'Courbevoie', lots: [lot(901, '901', '9 bd W')], syndic: null },
    { cle: '5 rue prise', libelle: '5 rue Prise', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: AUTRE },
    { cle: '7 rue sec', libelle: '7 rue Sec', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: AUTRE,
      principale: { cle: '1 rue autre', libelle: '1 rue Autre', codePostal: '92400', commune: 'Courbevoie' } },
  ];
  const FICHE_95 = {
    ...FICHE, id: 95, nom: '_TEST Multi', ville: 'Paris',
    contacts: [{ id: 4, titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', civilite: null, tousImmeubles: false, immeubles: ['12 rue x'],
      coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }, { id: 6, sorte: 'email', libelle: null, valeur: 'lea@test.invalid' }] }],
    coproprietes: [{ id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10',
      lots: [lot(101, '101', '12 rue X'), lot(301, '301', '3 av Y'), lot(302, '302', '3 av Y')],
      adresses: [{ cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie' }] }],
  };
  const servir = (): void => {
    API_ADRESSE['9 bd'] = [{ name: '9 bd W', postcode: '92400', city: 'Courbevoie' }];
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep({ ok: true, id: 95 }); }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: CONNUS });
      if (url.startsWith('/api/admin/gestion/syndics/95')) return rep({ etat: 'ok', fiche: FICHE_95 });
      if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) { appels.push({ url, methode: m, corps: null }); return rep({ etat: 'ok', contacts: [] }); }
      if (url.startsWith('/api/admin/gestion/syndics/doublons')) return rep({ emails: [], noms: [], coordonnees: [] });
      return (avant as typeof fetch)(url, init);
    }));
  };
  const monterCarte = async (immeuble: string): Promise<void> => {
    servir();
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble, lotId: 101 })); });
    await calmer();
    await cliquer(document.querySelector('button.bsy') as Element);
    await calmer();
  };
  const titre = (): HTMLElement => document.querySelector('#fsy-bloc-1') as HTMLElement;
  const plus = (): HTMLButtonElement | null => document.querySelector('#fsy-bloc-1 .fsy-plus-adresse');
  const mention = (): HTMLButtonElement | null => document.querySelector('#fsy-bloc-1 .fsy-autres-adresses');
  const lignes = (): Array<[string, boolean]> => [...document.querySelectorAll('.fsy-adresses-copro li')]
    .map((l) => [l.querySelector('span')?.textContent ?? '', l.querySelector('.fsy-retirer-adresse') !== null]);
  const put = (): { immeubles: Array<{ libelle: string; adresses?: Array<{ libelle: string }> }> } =>
    appels.filter((a) => a.methode === 'PUT').at(-1)?.corps as { immeubles: Array<{ libelle: string; adresses?: Array<{ libelle: string }> }> };
  const groupesLots = async (): Promise<Array<{ tete: string; lots: string[] }>> => {
    if (!document.querySelector('.fsy-lots')) await cliquer(document.querySelector('.fsy-lots-ligne') as Element);
    return [...document.querySelectorAll('.fsy-lots-groupe')].map((g) => ({
      tete: g.querySelector('.fsy-lots-adresse')?.textContent ?? '',
      lots: [...g.querySelectorAll('.fsy-lot')].map((l) => `${l.querySelector('strong')?.textContent}${l.querySelector('.fsy-pastille-attente') ? ' (attente)' : ''}`),
    }));
  };

  it('le « + » rouge cerclé, après l’adresse du titre, avec son info-bulle ; « · 1 autre adresse ▸ » repliée', async () => {
    await monterCarte('12 rue X');
    const p = plus() as HTMLButtonElement;
    expect(p.textContent).toBe('+');
    expect(p.title).toBe('Ajouter une autre adresse à cette copropriété');
    expect(titre().firstChild?.textContent).toBe('Syndic de l’immeuble · 12 rue X, 92400 Courbevoie');
    expect(mention()?.textContent).toBe('· 1 autre adresse ▸');
    expect(document.querySelector('.fsy-adresses-copro')).toBeNull();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toMatch(/\.fsy-plus-adresse\{[^}]*width:20px;height:20px;[^}]*border-radius:50%;border:1px solid var\(--color-svv-red\)/);
  });

  it('dépliée : une adresse par ligne, sur fond blanc, avec « × » ; repliée au second clic', async () => {
    await monterCarte('12 rue X');
    await cliquer(mention() as Element);
    expect(mention()?.textContent).toBe('· 1 autre adresse ▾');
    expect(lignes()).toEqual([['3 av Y, 92400 Courbevoie', true]]);
    expect(document.querySelector('.fsy-adresses-copro')?.classList.contains('fsy-suivis-liste')).toBe(true); // fond blanc, cadre fin
    await cliquer(mention() as Element);
    expect(document.querySelector('.fsy-adresses-copro')).toBeNull();
  });

  it('un bien à une adresse SECONDAIRE : elle s’affiche ; la principale est dans la liste, SANS croix ; contacts et carnet partagés', async () => {
    await monterCarte('3 av Y');
    expect(document.querySelector('.bsy') && titre().firstChild?.textContent).toBe('Syndic de l’immeuble · 3 av Y, 92400 Courbevoie');
    await cliquer(mention() as Element);
    expect(lignes()).toEqual([['12 rue X, 92400 Courbevoie', false]]);
    // la copropriété est la même : ses contacts (Léa suit 12 rue X) et son carnet (lu par l'adresse principale)
    expect([...document.querySelectorAll('section[aria-labelledby="fsy-bloc-1"] > button.fsy-contact-replie .fsy-contact-nom')].map((x) => x.textContent))
      .toEqual(['Léa DURAND']);
    expect(appels.find((a) => a.url.startsWith('/api/admin/gestion/coproprietes/contacts'))?.url).toBe('/api/admin/gestion/coproprietes/contacts?immeuble=12%20rue%20X');
  });

  it('AJOUT avec l’autocomplétion : « Ajouter » ⇒ la mention compte 2 autres adresses ; ses lots arrivent « en attente » ; au Valider, l’adresse part', async () => {
    await monterCarte('12 rue X');
    await cliquer(plus() as Element);
    const champ = document.querySelector('input[aria-label="Autre adresse de la copropriété"]') as HTMLInputElement;
    await taper(champ, '9 bd');
    await attendre(300);
    await cliquer([...document.querySelectorAll('.fsy-ajout-adresse .fsy-proposition')].find((b) => b.textContent === '9 bd W, 92400 Courbevoie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Ajouter'));
    expect(document.querySelector('.fsy-ajout-adresse')).toBeNull();
    expect(mention()?.textContent).toBe('· 2 autres adresses ▸');
    expect(await groupesLots()).toEqual([{ tete: '12 rue X, 92400 Courbevoie · 3 av Y, 92400 Courbevoie · 9 bd W, 92400 Courbevoie',
      lots: ['lot 101', 'lot 301', 'lot 302', 'lot 901 (attente)'] }]);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(put().immeubles[0]).toMatchObject({ libelle: '12 rue X', adresses: [{ libelle: '3 av Y' }, { libelle: '9 bd W', codePostal: '92400', commune: 'Courbevoie' }] });
  });

  for (const [saisie, message] of [
    ['5 rue Prise', '5 rue Prise est déjà la copropriété rattachée à AUTRE / Lyon.'],
    ['7 rue Sec', '7 rue Sec est déjà une adresse de la copropriété 1 rue Autre, 92400 Courbevoie (rattachée à AUTRE / Lyon).'],
    ['3 av Y', '3 av Y est déjà une adresse de cette copropriété.'],
  ] as const) {
    it(`adresse déjà prise (« ${saisie} ») : message précis, RIEN n’est ajouté`, async () => {
      await monterCarte('12 rue X');
      await cliquer(plus() as Element);
      await taper(document.querySelector('input[aria-label="Autre adresse de la copropriété"]') as HTMLInputElement, saisie);
      await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Ajouter'));
      expect(document.querySelector('.fsy-ajout-adresse .fsy-alerte')?.textContent).toBe(message);
      expect(mention()?.textContent).toBe('· 1 autre adresse ▸');
      await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Annuler'));
      expect(document.querySelector('.fsy-ajout-adresse')).toBeNull();
    });
  }

  it('RETRAIT d’une adresse secondaire : confirmation qui liste ses lots ; Non garde, Oui retire ; ses lots quittent le portefeuille ; au Valider, liste vide', async () => {
    await monterCarte('12 rue X');
    await cliquer(mention() as Element);
    await cliquer(document.querySelector('.fsy-retirer-adresse') as Element);
    const c = document.querySelector('.fsy-adresses-copro .fsy-confirmer') as HTMLElement;
    expect(c.querySelector('span')?.textContent).toBe('Retirer cette adresse de la copropriété ? lot 301, lot 302 perdront ce syndic.');
    await cliquer(boutonDans(c, 'Non'));
    expect(lignes()).toEqual([['3 av Y, 92400 Courbevoie', true]]);
    await cliquer(document.querySelector('.fsy-retirer-adresse') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-adresses-copro .fsy-confirmer'), 'Oui'));
    expect(mention()).toBeNull();
    expect(await groupesLots()).toEqual([{ tete: '12 rue X, 92400 Courbevoie', lots: ['lot 101'] }]);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(put().immeubles[0].adresses).toEqual([]);
  });

  it('« Copropriétés déjà rattachées » : une ligne par copropriété, « + 1 adresse » en gris, biens de toutes ses adresses', async () => {
    await monterCarte('12 rue X');
    await deplierCopros();
    const l = document.querySelector('.fsy-copro .fsy-copro-adresse') as HTMLElement;
    expect(l.querySelector('.fsy-plus-adresses')?.textContent).toBe(' + 1 adresse');
    expect(l.textContent).toContain('3 biens en gestion');
    expect(document.querySelectorAll('.fsy-copro')).toHaveLength(1);
  });

  it('écran SYNDICS (sans bien) : pas de « + »', async () => {
    servir();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: 95, onFerme: vi.fn() })); });
    await calmer();
    expect(plus()).toBeNull();
    expect(mention()).toBeNull();
  });
});

/**
 * ══ LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE ════════════════════════════════════════════════════════════════════
 * La copropriété 12 rue X (adresse secondaire 3 av Y) du syndic _TEST 96. La parcelle de 12 rue X porte aussi 12 bis
 * rue X (libre, lot 121) et 5 rue Prise (copropriété d'AUTRE / Lyon) ; celle de 3 av Y porte aussi 5 av Y (libre).
 */
describe('LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE', () => {
  const lot = (id: number, numero: string, adresse: string) => ({ id, numero, adresse, commune: 'COURBEVOIE', proprietaires: [] as string[] });
  const MOI = { id: 96, nom: '_TEST Parcelle', ville: 'Paris' };
  const P = { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' };
  const CONNUS = [
    { ...P, lots: [lot(101, '101', '12 rue X')], syndic: MOI, secondaires: [{ cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie' }] },
    { cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie', lots: [lot(301, '301', '3 av Y')], syndic: MOI, principale: P },
    { cle: '12 bis rue x', libelle: '12 bis rue X', codePostal: '92400', commune: 'Courbevoie', lots: [lot(121, '121', '12 bis rue X')], syndic: null },
    { cle: '5 rue prise', libelle: '5 rue Prise', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: { id: 7, nom: 'AUTRE', ville: 'Lyon' } },
  ];
  const FICHE_96 = {
    ...FICHE, id: 96, nom: '_TEST Parcelle', ville: 'Paris', contacts: [],
    coproprietes: [{ id: 6, cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10',
      lots: [lot(101, '101', '12 rue X'), lot(301, '301', '3 av Y')], adresses: [{ cle: '3 av y', libelle: '3 av Y', codePostal: '92400', commune: 'Courbevoie' }] }],
  };
  const a = (libelle: string) => ({ libelle, codePostal: '92400', commune: 'Courbevoie' });
  /** La « parcelle » : ce que le serveur rendrait pour ces adresses (les entrées elles-mêmes exclues). */
  let rien = false;
  const parcelle = (entrees: Array<{ libelle: string }>): Array<{ libelle: string }> => {
    if (rien) return [];
    const les = entrees.map((e) => e.libelle);
    const sortie = [...(les.includes('12 rue X') ? ['12 bis rue X', '5 rue Prise', '3 av Y'] : []), ...(les.includes('3 av Y') ? ['5 av Y', '12 rue X'] : [])];
    return [...new Set(sortie)].filter((x) => !les.includes(x)).map(a);
  };
  const servir = (): void => {
    rien = false;
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep({ ok: true, id: 96 }); }
      if (url.startsWith('/api/admin/gestion/coproprietes/parcelle?a=')) {
        appels.push({ url, methode: m, corps: null });
        return rep({ etat: 'ok', parcelles: ['X'], adresses: parcelle(JSON.parse(decodeURIComponent(url.split('a=')[1]))) });
      }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: CONNUS });
      if (url.startsWith('/api/admin/gestion/syndics/96')) return rep({ etat: 'ok', fiche: FICHE_96 });
      if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) return rep({ etat: 'ok', contacts: [] });
      return (avant as typeof fetch)(url, init);
    }));
  };
  const ouvrir96 = async (): Promise<void> => {
    servir();
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 96, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
  };
  const mention = (): HTMLButtonElement | null => document.querySelector('#fsy-bloc-1 .fsy-parcelle-mention');
  const lignes = (): Array<[string, boolean]> => [...document.querySelectorAll('.fsy-parcelle-liste li')]
    .map((l) => [l.querySelector('span')?.textContent ?? '', boutonDansOuNull(l, 'Rattacher') !== null]);
  const boutonDansOuNull = (zone: Element, t: string): Element | null => [...zone.querySelectorAll('button')].find((b) => b.textContent === t) ?? null;
  const put = (): { immeubles: Array<{ libelle: string; adresses?: Array<{ libelle: string }> }> } =>
    appels.filter((x) => x.methode === 'PUT').at(-1)?.corps as { immeubles: Array<{ libelle: string; adresses?: Array<{ libelle: string }> }> };

  it('la mention grise « · 3 adresses sur la même parcelle ▸ » ; TOUTES les adresses de la copropriété sont interrogées (plusieurs parcelles)', async () => {
    await ouvrir96();
    // LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — CE QU'IL DISAIT AVANT : « · 3 adresses … » (la prise ailleurs comptait). N = les PROPOSABLES ; la prise
    // ailleurs est dite à part, en gris.
    expect(mention()?.textContent).toBe('· 2 adresses sur la même parcelle (+ 1 déjà rattachée ailleurs) ▸');
    const q = appels.find((x) => x.url.startsWith('/api/admin/gestion/coproprietes/parcelle'))?.url ?? '';
    expect(JSON.parse(decodeURIComponent(q.split('a=')[1])).map((x: { libelle: string }) => x.libelle)).toEqual(['12 rue X', '3 av Y']);
    expect(document.querySelector('.fsy-parcelle-liste')).toBeNull();
  });

  it('dépliée (fond blanc) : « Rattacher » pour une adresse libre ; prise ailleurs : grisée, sans bouton, avec la raison', async () => {
    await ouvrir96();
    await cliquer(mention() as Element);
    expect(document.querySelector('.fsy-parcelle-liste')?.classList.contains('fsy-suivis-liste')).toBe(true);
    expect(lignes()).toEqual([
      ['12 bis rue X, 92400 Courbevoie', true],
      // LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — CE QU'IL DISAIT AVANT : « — déjà la copropriété rattachée à AUTRE / Lyon ».
      ['5 rue Prise, 92400 Courbevoie — déjà rattachée à une autre copropriété — AUTRE / Lyon', false],
      ['5 av Y, 92400 Courbevoie', true],
    ]);
    expect(document.querySelector('.fsy-adresse-prise')?.textContent).toContain('5 rue Prise');
  });

  it('« Rattacher » : l’adresse devient secondaire (rien d’automatique avant le clic), ses lots arrivent « en attente » ; au Valider, propagée', async () => {
    await ouvrir96();
    expect(appels.filter((x) => x.methode !== 'GET')).toEqual([]);
    await cliquer(mention() as Element);
    await cliquer(boutonDansOuNull([...document.querySelectorAll('.fsy-parcelle-liste li')][0], 'Rattacher') as Element);
    await calmer();
    expect((document.querySelector('#fsy-bloc-1 .fsy-autres-adresses') as HTMLElement).textContent).toBe('· 2 autres adresses ▸');
    // LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES — CE QU'IL DISAIT AVANT : « · 2 adresses … ▾ » (la prise ailleurs comptait).
    expect(mention()?.textContent).toBe('· 1 adresse sur la même parcelle (+ 1 déjà rattachée ailleurs) ▾');
    await cliquer(document.querySelector('.fsy-lots-ligne') as Element);
    const lots = [...document.querySelectorAll('.fsy-lot')].map((l) => `${l.querySelector('strong')?.textContent}${l.querySelector('.fsy-pastille-attente') ? ' (attente)' : ''}`);
    expect(lots).toEqual(['lot 101', 'lot 121 (attente)', 'lot 301']);
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(put().immeubles[0].adresses?.map((x) => x.libelle)).toEqual(['3 av Y', '12 bis rue X']);
  });

  it('une adresse RETIRÉE (par le « × ») redevient proposable', async () => {
    await ouvrir96();
    await cliquer(document.querySelector('#fsy-bloc-1 .fsy-autres-adresses:not(.fsy-parcelle-mention)') as Element);
    await cliquer(document.querySelector('.fsy-retirer-adresse') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-adresses-copro .fsy-confirmer'), 'Oui'));
    await calmer();
    await cliquer(mention() as Element);
    expect(lignes().map(([l, b]) => [l.split(' — ')[0], b])).toEqual([
      ['12 bis rue X, 92400 Courbevoie', true], ['5 rue Prise, 92400 Courbevoie', false], ['3 av Y, 92400 Courbevoie', true]]);
  });

  it('rien à proposer : pas de mention', async () => {
    servir();
    rien = true;
    await act(async () => {
      root.render(createElement(FicheSyndic, { syndicId: 96, onFerme: vi.fn(), immeubleDepart: { libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie' } }));
    });
    await calmer();
    expect(mention()).toBeNull();
    expect(document.body.textContent).not.toContain('sur la même parcelle');
  });
});

/**
 * ══ LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES ═══════════════════════════════════════════════════════════════════
 * Le bien est au 80 rue de Normandie (sans syndic). La parcelle de 80 rue de Normandie porte 82 rue de Normandie
 * (libre) et 5 rue Prise (copropriété d'AUTRE / Lyon) ; celle de 9 rue Voisine porte 11 rue Voisine (libre).
 */
describe('LOT COPRO-PARCELLE-PROPOSITIONS-IMMEDIATES', () => {
  const N80 = { cle: '80 rue de normandie', libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie' };
  const CONNUS = [
    { ...N80, lots: [{ id: 801, numero: '801', adresse: '80 rue de Normandie', commune: 'COURBEVOIE', proprietaires: [] }], syndic: null },
    { cle: '5 rue prise', libelle: '5 rue Prise', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: { id: 7, nom: 'AUTRE', ville: 'Lyon' } },
  ];
  let parcelles: Record<string, string[]> = {};
  const demandes = (): string[][] => appels.filter((x) => x.url.startsWith('/api/admin/gestion/coproprietes/parcelle'))
    .map((x) => (JSON.parse(decodeURIComponent(x.url.split('a=')[1])) as Array<{ libelle: string; codePostal: string; commune: string }>).map((a) => `${a.libelle}|${a.codePostal}|${a.commune}`));
  const servir = (): void => {
    parcelles = { '80 rue de Normandie': ['82 rue de Normandie', '5 rue Prise'], '9 rue Voisine': ['11 rue Voisine'] };
    API_ADRESSE['9 rue'] = [{ name: '9 rue Voisine', postcode: '92400', city: 'Courbevoie' }];
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep({ ok: true, id: 97 }); }
      if (url.startsWith('/api/admin/gestion/coproprietes/parcelle?a=')) {
        appels.push({ url, methode: m, corps: null });
        const les = (JSON.parse(decodeURIComponent(url.split('a=')[1])) as Array<{ libelle: string }>).map((x) => x.libelle);
        const sortie = [...new Set(les.flatMap((l) => parcelles[l] ?? []))].filter((x) => !les.includes(x));
        return rep({ etat: 'ok', parcelles: ['P'], adresses: sortie.map((libelle) => ({ libelle, codePostal: '92400', commune: 'Courbevoie' })) });
      }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: CONNUS });
      if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) return rep({ etat: 'ok', contacts: [] });
      if (url.startsWith('/api/admin/gestion/syndics?q=')) return rep({ etat: 'ok', disponible: true, syndics: [] });
      return (avant as typeof fetch)(url, init);
    }));
  };
  /** Un NOUVEAU syndic, créé depuis le bien : rien n'est enregistré. `sansConflit` : la parcelle ne porte que des
   *  adresses libres (LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — 5 rue Prise, d'un AUTRE syndic, ouvre désormais l'étape « conflit possible »). */
  const creerDepuisLeBien = async (sansConflit = false): Promise<ReturnType<typeof vi.fn>> => {
    servir();
    if (sansConflit) parcelles['80 rue de Normandie'] = ['82 rue de Normandie'];
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    const onFerme = vi.fn();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: null, onFerme, immeubleDepart: { libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie' } })); });
    await attendre(250);
    await cliquer(bouton('Créer un nouveau syndic'));
    await calmer();
    await taper(champ('Nom du cabinet *'), '_TEST Normandie');
    await taper(champ('Adresse (rue) *'), '1 rue _TEST');
    await taper(champ('Code postal *'), '92400');
    await taper(champ('Ville *'), 'Courbevoie');
    return onFerme;
  };
  const plus = (): HTMLButtonElement => document.querySelector('#fsy-bloc-1 .fsy-plus-adresse') as HTMLButtonElement;
  const mention = (): HTMLButtonElement | null => document.querySelector('#fsy-bloc-1 .fsy-parcelle-mention');
  const ecritures = (): unknown[] => appels.filter((x) => x.methode !== 'GET');

  it('AVANT tout enregistrement : la fiche d’un NOUVEAU syndic, depuis le bien, interroge la parcelle et propose aussitôt', async () => {
    await creerDepuisLeBien();
    expect(ecritures()).toEqual([]);
    expect(demandes()[0]).toEqual(['80 rue de Normandie|92400|Courbevoie']);
    expect(mention()?.textContent).toBe('· 1 adresse sur la même parcelle (+ 1 déjà rattachée ailleurs) ▸');
  });

  it('une adresse CHOISIE dans l’autocomplétion du « + » apporte sa parcelle aussitôt (sans Valider) ; une saisie libre prend la ville de la copropriété', async () => {
    await creerDepuisLeBien();
    await cliquer(plus());
    await taper(document.querySelector('input[aria-label="Autre adresse de la copropriété"]') as HTMLInputElement, '9 rue');
    await attendre(300);
    await cliquer([...document.querySelectorAll('.fsy-ajout-adresse .fsy-proposition')].find((b) => b.textContent === '9 rue Voisine, 92400 Courbevoie') as Element);
    await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Ajouter'));
    await calmer();
    expect(demandes().at(-1)).toEqual(['80 rue de Normandie|92400|Courbevoie', '9 rue Voisine|92400|Courbevoie']);
    await cliquer(mention() as Element);
    expect([...document.querySelectorAll('.fsy-parcelle-liste li')].map((l) => l.querySelector('span')?.textContent?.split(' — ')[0]))
      .toEqual(['82 rue de Normandie, 92400 Courbevoie', '5 rue Prise, 92400 Courbevoie', '11 rue Voisine, 92400 Courbevoie']);
    // saisie libre (sans code postal ni ville) : ceux de la copropriété
    await cliquer(plus());
    await taper(document.querySelector('input[aria-label="Autre adresse de la copropriété"]') as HTMLInputElement, '7 impasse Libre');
    await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Ajouter'));
    await calmer();
    expect(demandes().at(-1)?.at(-1)).toBe('7 impasse Libre|92400|Courbevoie');
    expect(ecritures()).toEqual([]);
  });

  it('le « + » PULSE quand des propositions attendent ; il s’arrête à l’ouverture de la liste ; une proposition NOUVELLE le relance ; un clic sur « + » l’arrête', async () => {
    await creerDepuisLeBien();
    expect(plus().classList.contains('fsy-plus-adresse--pulse')).toBe(true);
    await cliquer(mention() as Element);
    expect(plus().classList.contains('fsy-plus-adresse--pulse')).toBe(false);
    await cliquer(mention() as Element); // repliée : toujours vue
    expect(plus().classList.contains('fsy-plus-adresse--pulse')).toBe(false);
    // une adresse ajoutée apporte une proposition nouvelle (11 rue Voisine)
    await cliquer(plus());
    await taper(document.querySelector('input[aria-label="Autre adresse de la copropriété"]') as HTMLInputElement, '9 rue');
    await attendre(300);
    await cliquer([...document.querySelectorAll('.fsy-ajout-adresse .fsy-proposition')][0]);
    await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Ajouter'));
    await calmer();
    expect(plus().classList.contains('fsy-plus-adresse--pulse')).toBe(true);
    await cliquer(plus());
    expect(plus().classList.contains('fsy-plus-adresse--pulse')).toBe(false);
  });

  it('la feuille : 2 pulsations amples (×2,5, 0,8 s), puis une douce toutes les 2 s ; en surimpression ; moins d’animations : un « + » rempli', async () => {
    await creerDepuisLeBien();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('').replace(/\s+/g, ' ');
    expect(css).toContain('@keyframes fsy-pulse-ample{from{transform:scale(1);opacity:.55}to{transform:scale(2.5);opacity:0}}');
    expect(css).toContain('animation:fsy-pulse-ample .8s ease-out 0s 2, fsy-pulse-douce 2s ease-in-out 1.6s infinite');
    expect(css).toMatch(/\.fsy-plus-adresse--pulse::before\{content:"";position:absolute;inset:-1px;[^}]*pointer-events:none/);
    expect(css).toContain('@media (prefers-reduced-motion: reduce){ .fsy-plus-adresse--pulse::before{animation:none;display:none} .fsy-plus-adresse--pulse{background:var(--color-svv-red);color:var(--color-svv-surface)}}');
  });

  it('ALERTE au Valider : propositions non traitées ⇒ le pied le dit ; « Voir les adresses » déplie et fait défiler ; « Valider quand même » enregistre', async () => {
    const vu = vi.fn();
    const avant = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vu;
    try {
      // LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — CE QU'IL DISAIT AVANT : la parcelle portait aussi 5 rue Prise (AUTRE / Lyon) ; elle ouvre désormais
      // l'étape « conflit possible ». L'alerte s'éprouve ici sur une parcelle sans conflit.
      const onFerme = await creerDepuisLeBien(true);
      await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
      const a = document.querySelector('.fsy-alerte-parcelle') as HTMLElement;
      expect(a.querySelector('.fsy-question')?.textContent).toBe('Cette copropriété possède peut-être d’autres adresses postales : 1 adresse sur la même parcelle cadastrale n’a pas été associée.');
      expect([...a.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Voir les adresses', 'Valider quand même']);
      expect(ecritures()).toEqual([]);
      await cliquer(boutonDans(a, 'Voir les adresses'));
      await attendre(10);
      expect(document.querySelector('.fsy-alerte-parcelle')).toBeNull();
      expect(document.querySelector('.fsy-parcelle-liste')).not.toBeNull();
      expect(vu.mock.contexts).toContain(document.querySelector('.fsy-parcelle-liste'));
      // LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — CE QU'IL DISAIT AVANT : l'alerte revenait au Valider suivant,
      // puis « Valider quand même ». Elle n'est montrée qu'UNE fois : le Valider suivant enregistre, et la copropriété
      // est marquée alertée.
      await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
      expect(document.querySelector('.fsy-alerte-parcelle')).toBeNull();
      expect(appels.filter((x) => x.methode === 'POST')).toHaveLength(1);
      expect((appels.find((x) => x.methode === 'POST')?.corps as { alerteParcelle?: string[] }).alerteParcelle).toEqual(['80 rue de normandie']);
      expect(onFerme).toHaveBeenCalledTimes(1);
    } finally { Element.prototype.scrollIntoView = avant; }
  });

  it('PAS d’alerte si une adresse a été rattachée pendant la session', async () => {
    // LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — CE QU'IL DISAIT AVANT : creerDepuisLeBien() (avec 5 rue Prise, désormais un conflit possible).
    const onFerme = await creerDepuisLeBien(true);
    await cliquer(plus()); // relit rien ; on rattache par la liste
    await cliquer(boutonDans(document.querySelector('.fsy-ajout-adresse'), 'Annuler'));
    await cliquer(mention() as Element);
    await cliquer([...document.querySelectorAll('.fsy-parcelle-liste button')].find((b) => b.textContent === 'Rattacher') as Element);
    await calmer();
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(document.querySelector('.fsy-alerte-parcelle')).toBeNull();
    expect(appels.filter((x) => x.methode === 'POST')).toHaveLength(1);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  // LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — CE QU'IL DISAIT AVANT : Valider enregistrait aussitôt. L'adresse grisée est à un AUTRE syndic (AUTRE /
  // Lyon) : c'est un conflit possible, qui s'annonce AVANT d'enregistrer. Toujours ni alerte « autres adresses », ni pulsation.
  it('PAS d’alerte ni de pulsation s’il ne reste que des adresses GRISÉES (prises ailleurs) — exclues du compteur ; le conflit s’annonce', async () => {
    servir();
    parcelles['80 rue de Normandie'] = ['5 rue Prise'];
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    const onFerme = vi.fn();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: null, onFerme, immeubleDepart: { libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie' } })); });
    await attendre(250);
    await cliquer(bouton('Créer un nouveau syndic'));
    await calmer();
    expect(mention()?.textContent).toBe('· 1 adresse de la parcelle déjà rattachée ailleurs ▸');
    expect(plus().classList.contains('fsy-plus-adresse--pulse')).toBe(false);
    await taper(champ('Nom du cabinet *'), '_TEST Normandie');
    await taper(champ('Adresse (rue) *'), '1 rue _TEST');
    await taper(champ('Code postal *'), '92400');
    await taper(champ('Ville *'), 'Courbevoie');
    await cliquer(boutonDans(document.querySelector('.fsy-pied'), 'Valider'));
    expect(document.querySelector('.fsy-alerte-parcelle')).toBeNull();
    expect(document.querySelector('.fsy-conflit-parcelle')).not.toBeNull();
    expect(onFerme).not.toHaveBeenCalled();
  });
});

/**
 * ══ LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS ══════════════════════════════════════════════════════════
 * Le bien est au 37 avenue Marceau (sans syndic). Sur sa parcelle : 80 rue de Normandie (copropriété de TEST ARNAUD, 70)
 * et, selon le cas, 39 avenue Marceau (copropriété d'AUTRE / Lyon, 71) ou 41 avenue Marceau (libre).
 */
describe('LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS', () => {
  const ARNAUD = { id: 70, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' };
  const AUTRE = { id: 71, nom: 'AUTRE', ville: 'Lyon' };
  const lot = (id: number, a: string) => ({ id, numero: String(id), adresse: a, commune: 'COURBEVOIE', proprietaires: [] as string[] });
  let connus: unknown[] = [];
  let parcelle: string[] = [];
  let syndics: unknown[] = [];
  const FICHE_70 = { ...FICHE, id: 70, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine', contacts: [],
    coproprietes: [{ id: 8, cle: '80 rue de normandie', libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [], adresses: [] }] };
  const servir = (o: { connus?: unknown[]; parcelle?: string[]; syndics?: unknown[] } = {}): void => {
    connus = o.connus ?? [
      { cle: '37 avenue marceau', libelle: '37 avenue Marceau', codePostal: '92400', commune: 'Courbevoie', lots: [lot(370, '37 avenue Marceau')], syndic: null },
      { cle: '80 rue de normandie', libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: ARNAUD },
      { cle: '39 avenue marceau', libelle: '39 avenue Marceau', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: AUTRE },
    ];
    parcelle = o.parcelle ?? ['80 rue de Normandie'];
    syndics = o.syndics ?? [];
    const avant = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown) => ({ ok: true, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: init?.body ? JSON.parse(String(init.body)) : null }); return rep({ ok: true, id: 99 }); }
      if (url.startsWith('/api/admin/gestion/coproprietes/parcelle?a=')) {
        const les = (JSON.parse(decodeURIComponent(url.split('a=')[1])) as Array<{ libelle: string }>).map((x) => x.libelle);
        return rep({ etat: 'ok', parcelles: ['92026000AB0001'], adresses: parcelle.filter((x) => !les.includes(x))
          .map((libelle) => ({ libelle, codePostal: '92400', commune: 'Courbevoie', parcelle: '92026000AB0001' })) });
      }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) return rep({ etat: 'ok', disponible: true, immeubles: connus });
      if (url.startsWith('/api/admin/gestion/syndics/70')) return rep({ etat: 'ok', fiche: FICHE_70 });
      if (url.startsWith('/api/admin/gestion/syndics?q=')) return rep({ etat: 'ok', disponible: true, syndics });
      if (url.startsWith('/api/admin/gestion/coproprietes/contacts')) return rep({ etat: 'ok', contacts: [] });
      return (avant as typeof fetch)(url, init);
    }));
  };
  const BIEN = { libelle: '37 avenue Marceau', codePostal: '92400', commune: 'Courbevoie' };
  const monter = async (): Promise<ReturnType<typeof vi.fn>> => {
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    const onFerme = vi.fn();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: null, onFerme, immeubleDepart: BIEN })); });
    await attendre(250);
    return onFerme;
  };
  const creerNouveau = async (): Promise<ReturnType<typeof vi.fn>> => {
    const onFerme = await monter();
    await cliquer(bouton('Créer un nouveau syndic'));
    await calmer();
    await taper(champ('Nom du cabinet *'), '_TEST Marceau');
    await taper(champ('Adresse (rue) *'), '1 rue _TEST');
    await taper(champ('Code postal *'), '92400');
    await taper(champ('Ville *'), 'Courbevoie');
    return onFerme;
  };
  const pied = (): Element => document.querySelector('.fsy-pied') as Element;
  const valider = async (): Promise<void> => { await cliquer(boutonDans(pied(), 'Valider')); };
  const ecritures = () => appels.filter((x) => x.methode !== 'GET');

  it('CONFLIT, premier niveau : encadré orange, le texte, et « Rattacher à TEST ARNAUD » / « Annuler » / « Continuer avec un autre syndic »', async () => {
    servir();
    await creerNouveau();
    await valider();
    const c = document.querySelector('.fsy-conflit-parcelle') as HTMLElement;
    expect(c.querySelector('.fsy-question')?.textContent).toBe('Attention : l’adresse 37 avenue Marceau, 92400 Courbevoie semble appartenir à la même parcelle que '
      + '80 rue de Normandie, déjà rattachée au syndic TEST ARNAUD / Asnieres Sur Seine. Vérifiez qu’il ne s’agit pas d’une erreur d’adresse ou de la même copropriété.');
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Rattacher à TEST ARNAUD', 'Annuler', 'Continuer avec un autre syndic']);
    expect(ecritures()).toEqual([]);
    await cliquer(boutonDans(c, 'Annuler'));
    expect(document.querySelector('.fsy-conflit-parcelle')).toBeNull();
    expect(ecritures()).toEqual([]);
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.fsy-conflit-parcelle{padding:6px 10px;border-radius:8px;border:1px solid var(--color-svv-orange);background:var(--color-svv-orange-soft)');
  });

  it('plusieurs syndics trouvés : un « Rattacher à … » par syndic', async () => {
    servir({ parcelle: ['80 rue de Normandie', '39 avenue Marceau'] });
    await creerNouveau();
    await valider();
    const c = document.querySelector('.fsy-conflit-parcelle') as HTMLElement;
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Rattacher à TEST ARNAUD', 'Rattacher à AUTRE', 'Annuler', 'Continuer avec un autre syndic']);
    expect(c.querySelector('.fsy-question')?.textContent).toContain('80 rue de Normandie, déjà rattachée au syndic TEST ARNAUD / Asnieres Sur Seine et que 39 avenue Marceau, déjà rattachée au syndic AUTRE / Lyon.');
  });

  it('« Rattacher à TEST ARNAUD » : l’adresse du bien devient une adresse SECONDAIRE de sa copropriété (PUT de CE syndic) ; rien d’autre n’est créé', async () => {
    servir();
    const onFerme = await creerNouveau();
    await valider();
    await cliquer(boutonDans(document.querySelector('.fsy-conflit-parcelle'), 'Rattacher à TEST ARNAUD'));
    await calmer();
    const put = ecritures();
    expect(put.map((x) => [x.methode, x.url])).toEqual([['PUT', '/api/admin/gestion/syndics/70']]);
    expect((put[0].corps as { immeubles: Array<{ libelle: string; adresses?: unknown[] }> }).immeubles).toEqual([
      { libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', adresses: [{ libelle: '37 avenue Marceau', codePostal: '92400', commune: 'Courbevoie' }] }]);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('« Continuer avec un autre syndic » ⇒ deuxième confirmation : « Non, revenir » ramène au premier niveau ; « Oui, je confirme » enregistre et note le conflit', async () => {
    servir({ parcelle: ['80 rue de Normandie', '41 avenue Marceau'] });
    const onFerme = await creerNouveau();
    await valider();
    await cliquer(boutonDans(document.querySelector('.fsy-conflit-parcelle'), 'Continuer avec un autre syndic'));
    let c = document.querySelector('.fsy-conflit-parcelle') as HTMLElement;
    expect(c.querySelector('.fsy-question')?.textContent).toBe('Confirmez-vous que 37 avenue Marceau est une copropriété distincte, avec un syndic différent ?');
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Non, revenir', 'Oui, je confirme']);
    await cliquer(boutonDans(c, 'Non, revenir'));
    expect(document.querySelector('.fsy-conflit-parcelle .fsy-question')?.textContent).toContain('Attention :');
    await cliquer(boutonDans(document.querySelector('.fsy-conflit-parcelle'), 'Continuer avec un autre syndic'));
    c = document.querySelector('.fsy-conflit-parcelle') as HTMLElement;
    await cliquer(boutonDans(c, 'Oui, je confirme'));
    // reste une adresse libre (41) : l'alerte « autres adresses » vient ensuite, une fois
    expect(document.querySelector('.fsy-alerte-parcelle')).not.toBeNull();
    await cliquer(boutonDans(document.querySelector('.fsy-alerte-parcelle'), 'Valider quand même'));
    const post = appels.find((x) => x.methode === 'POST')?.corps as { conflitsParcelle?: unknown; alerteParcelle?: string[] };
    expect(post.conflitsParcelle).toEqual([{ immeuble: '37 avenue Marceau', autre: '80 rue de Normandie', parcelle: '92026000AB0001' }]);
    expect(post.alerteParcelle).toEqual(['37 avenue marceau']);
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('MÊME SYNDIC : « la rattacher à cette copropriété ? » — Oui regroupe (adresse secondaire) ; Non crée une copropriété distincte', async () => {
    for (const reponse of ['Oui', 'Non'] as const) {
      appels = [];
      await act(async () => { root.render(null); });
      servir({ connus: [
        { cle: '37 avenue marceau', libelle: '37 avenue Marceau', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: null },
        { cle: '80 rue de normandie', libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: ARNAUD, alerteParcelle: true },
      ], syndics: [{ id: 70, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine', email: null, telephone: null, nbCoproprietes: 1, nbBiens: 0 }] });
      await monter();
      await cliquer(bouton('Rattacher cet immeuble à ce syndic'));
      await calmer();
      await valider();
      const m = document.querySelector('.fsy-meme-syndic') as HTMLElement;
      expect(m.querySelector('.fsy-question')?.textContent).toBe('Cette adresse est sur la même parcelle qu’une copropriété de ce syndic : la rattacher à cette copropriété ? (80 rue de Normandie)');
      expect(document.querySelector('.fsy-conflit-parcelle')).toBeNull(); // pas de conflit : même syndic
      await cliquer(boutonDans(m, reponse));
      await calmer();
      const put = appels.find((x) => x.methode === 'PUT')?.corps as { immeubles: Array<{ libelle: string; adresses?: Array<{ libelle: string }> }> };
      expect(put.immeubles.map((im) => [im.libelle, (im.adresses ?? []).map((a) => a.libelle)])).toEqual(reponse === 'Oui'
        ? [['80 rue de Normandie', ['37 avenue Marceau']]]
        : [['80 rue de Normandie', []], ['37 avenue Marceau', []]]);
    }
  });

  it('ALERTE UNIQUE : copropriété DÉJÀ alertée ⇒ pas d’alerte, même avec des propositions ; la pulsation reste', async () => {
    servir({ connus: [
      { cle: '37 avenue marceau', libelle: '37 avenue Marceau', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: null, alerteParcelle: true },
    ], parcelle: ['41 avenue Marceau'] });
    const onFerme = await creerNouveau();
    expect(document.querySelector('#fsy-bloc-1 .fsy-plus-adresse')?.classList.contains('fsy-plus-adresse--pulse')).toBe(true);
    await valider();
    expect(document.querySelector('.fsy-alerte-parcelle')).toBeNull();
    const post = appels.find((x) => x.methode === 'POST')?.corps as { alerteParcelle?: unknown };
    expect(post.alerteParcelle).toBeUndefined();
    expect(onFerme).toHaveBeenCalledTimes(1);
  });

  it('ALERTE UNIQUE : la copropriété déjà rattachée à CE syndic (réouverture) ⇒ pas d’alerte', async () => {
    servir({ connus: [{ cle: '80 rue de normandie', libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: ARNAUD }],
      parcelle: ['82 rue de Normandie'] });
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    const onFerme = vi.fn();
    await act(async () => { root.render(createElement(FicheSyndic, { syndicId: 70, onFerme, immeubleDepart: { libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie' } })); });
    await calmer();
    await taper(champ('Nom du cabinet *'), 'TEST ARNAUD bis');
    await valider();
    expect(document.querySelector('.fsy-alerte-parcelle')).toBeNull();
    expect(onFerme).toHaveBeenCalledTimes(1);
  });
});

describe('LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS — la pastille des cartes', () => {
  const CONFLIT = { id: 5, parcelle: '92026000AB0001', coproprietes: [
    { cle: '37 avenue marceau', adresse: '37 avenue Marceau, 92400 Courbevoie', syndic: { id: 72, nom: '_TEST NEUF', ville: 'Paris' } },
    { cle: '80 rue de normandie', adresse: '80 rue de Normandie, 92400 Courbevoie', syndic: { id: 70, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' } },
  ] };
  let verifie = false;
  const servir = (): void => {
    verifie = false;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const m = init?.method ?? 'GET';
      const rep = (j: unknown, ok = true) => ({ ok, json: async () => j });
      if (m !== 'GET') { appels.push({ url, methode: m, corps: null }); verifie = true; return rep({ ok: true }); }
      if (url.startsWith('/api/admin/gestion/syndics/immeubles')) {
        const k = verifie ? {} : { conflits: [CONFLIT] };
        return rep({ etat: 'ok', disponible: true, immeubles: [
          { cle: '37 avenue marceau', libelle: '37 avenue Marceau', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: { id: 72, nom: '_TEST NEUF', ville: 'Paris' }, ...k },
          { cle: '80 rue de normandie', libelle: '80 rue de Normandie', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: { id: 70, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' }, ...k },
          { cle: '9 rue tranquille', libelle: '9 rue Tranquille', codePostal: '92400', commune: 'Courbevoie', lots: [], syndic: null },
        ] });
      }
      return rep({});
    }));
  };
  const monter = async (): Promise<void> => {
    servir();
    const { rafraichirImmeubles } = await import('./useImmeublesSyndics');
    await act(async () => { await rafraichirImmeubles(); });
    const { PastilleConflitParcelle } = await import('./BoutonSyndic');
    await act(async () => {
      root.render(createElement('div', null,
        createElement('div', { className: 'carte-a' }, createElement(PastilleConflitParcelle, { immeuble: '37 avenue Marceau' })),
        createElement('div', { className: 'carte-b' }, createElement(PastilleConflitParcelle, { immeuble: '80 rue de Normandie' })),
        createElement('div', { className: 'carte-c' }, createElement(PastilleConflitParcelle, { immeuble: '9 rue Tranquille' }))));
    });
    await calmer();
  };

  it('sur les DEUX cartes concernées (et pas ailleurs) : « ⚠ Conflit possible : 2 syndics sur une même parcelle — à vérifier »', async () => {
    await monter();
    for (const c of ['.carte-a', '.carte-b']) expect(document.querySelector(`${c} .bsy-conflit`)?.textContent).toBe('⚠ Conflit possible : 2 syndics sur une même parcelle — à vérifier');
    expect(document.querySelector('.carte-c .bsy-conflit')).toBeNull();
  });

  it('le panneau : les deux copropriétés et leurs syndics ; « Vérifié, pas d’erreur » enregistre et la pastille disparaît (des deux cartes)', async () => {
    await monter();
    await cliquer(document.querySelector('.carte-a .bsy-conflit') as Element);
    const p = document.querySelector('.carte-a .bsy-conflit-panneau') as HTMLElement;
    expect([...p.querySelectorAll('li')].map((l) => l.textContent)).toEqual([
      '37 avenue Marceau, 92400 Courbevoie — _TEST NEUF / Paris', '80 rue de Normandie, 92400 Courbevoie — TEST ARNAUD / Asnieres Sur Seine']);
    await cliquer(boutonDans(p, 'Vérifié, pas d’erreur'));
    await calmer();
    expect(appels.map((x) => [x.methode, x.url])).toEqual([['POST', '/api/admin/gestion/coproprietes/conflits/5/verifier']]);
    expect(document.querySelector('.bsy-conflit')).toBeNull();
  });
});
