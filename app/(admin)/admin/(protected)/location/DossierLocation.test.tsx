// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModaleDossierLocation } from './ModaleDossierLocation';
import type { LectureDossier } from '../../../../lib/location/dossierLocation';

/**
 * 🔴 Arno (24/10/2026) — « DOSSIER DE LOCATION » : le formulaire « Nouveau locataire » rouvert en modification. On éprouve à l'écran :
 * les 4 blocs pré-remplis, aucun bouton d'envoi à ADHOC & MONGA, « Enregistrer les modifications » inactif tant que rien n'a changé,
 * le récapitulatif des seuls champs modifiés par bloc, l'envoi (une MISE À JOUR), le conflit. Données fictives ; route simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const lecture: LectureDossier = {
  activiteId: 100, bailId: 70, lotId: 51, version: 'v1', titre: 'Dossier de location — MARTIN Léa — 7 rue des Essais Courbevoie',
  bien: { id: 51, titre: '7 rue des Essais Courbevoie', famille: 'logement' }, lots: [{ id: 51, libelle: 'Appartement — 7 rue des Essais Courbevoie' }], entree: '2026-09-12',
  locataires: [{ id: 230, civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', codePostal: '92400', commune: 'COURBEVOIE', note: null,
    contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }] }],
  contacts: [{ id: 5, libelle: 'M. DURAND Paul', qualite: 'Garant' }],
  conditions: { occupationId: 900, loyer: { principal: 100000, provisions: 10000 }, lignesHonoraires: [],
    valeurs: { depot: 'agence', prelevement: true, jour: 5, garant: true, assurance: 'aucune', assurancePrecision: null, honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
      sommes: { prorataLoyer: 50000, prorataCharges: 5000, depotGarantie: 100000, honorairesAgence: 68086 }, reglement: 'virement', reglementPrecision: null, commentaire: null } },
  entretien: null,
  suivi: { type: 'bail', dateSignature: '2026-09-01', honoProprietaireHt: '567,38', honoLocataireHt: '567,38', negociateurId: 3, apporteurId: null, apporteurTaux: '',
    mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: 'relocation', collegueId: null, commissionApporteur: '',
    primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement' },
};
const parametres = { disponible: true, apporteurs: [], negociateurs: [{ id: 3, libelle: 'Jean-Baptiste Pons' }, { id: 4, libelle: 'Arnaud Jorel' }], moi: 4, collegues: [],
  regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], annuaire: true, dejaClient: true };
let posts: Record<string, unknown>[];
let reponsePost: { status: number; corps: Record<string, unknown> };
let hote: HTMLDivElement;
let root: Root;
const onEnregistre = vi.fn();
beforeEach(() => {
  posts = []; reponsePost = { status: 200, corps: { etat: 'ok', data: { changements: [] } } }; onEnregistre.mockClear();
  global.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: reponsePost.status < 400, status: reponsePost.status, json: async () => reponsePost.corps } as unknown as Response; }
    if (url.includes('dossierLocation=100')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: lecture }) } as unknown as Response;
    if (url.startsWith('/api/admin/location/suivi') && !url.includes('vue=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: parametres }) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ etat: 'inconnu' }) } as unknown as Response;
  }) as unknown as typeof fetch;
  hote = document.createElement('div'); hote.className = 'svv-adm-root'; document.body.appendChild(hote); root = createRoot(hote);
});
afterEach(() => { act(() => { root.unmount(); }); hote.remove(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async () => { await act(async () => { root.render(createElement(ModaleDossierLocation, { activiteId: 100, onFermer: () => {}, onEnregistre })); }); await calmer(); };
const enregistrer = () => document.querySelector('[data-enregistrer-dossier]') as HTMLButtonElement;
const choisirNegociateur = async (libelle: string) => {
  const champ = [...document.querySelectorAll('[data-suivi-commercial] [role="combobox"]')].find((b) => b.textContent?.includes('Jean-Baptiste Pons')) as HTMLButtonElement;
  await act(async () => { champ.click(); });
  const o = [...document.querySelectorAll('[role="option"]')].find((x) => x.textContent?.replace('✓', '').trim() === libelle) as HTMLElement;
  await act(async () => { o.click(); });
};

describe('🔴 « Dossier de location » — le formulaire « Nouveau locataire » en modification', () => {
  it('les 4 blocs pré-remplis ; le titre ; aucun envoi à ADHOC & MONGA ; « Enregistrer les modifications » inactif sans changement', async () => {
    await monter();
    expect(document.querySelector('h2')?.textContent).toBe('Dossier de location — MARTIN Léa — 7 rue des Essais Courbevoie');
    expect([...document.querySelectorAll('[data-bloc-dossier]')].map((s) => s.getAttribute('data-bloc-dossier'))).toEqual(['1', '2', '3', '4']);
    expect(document.querySelector('[data-carte-dossier="230"]')?.textContent).toContain('Mme MARTIN Léa');
    expect(document.querySelector('[data-contacts-dossier]')?.textContent).toContain('M. DURAND Paul — Garant');
    expect(document.querySelector('[data-lots-dossier]')?.textContent).toContain('Appartement — 7 rue des Essais Courbevoie');
    expect(document.querySelector('[data-entree-dossier]')?.textContent).toContain('12/09/2026');
    expect(document.querySelector('[data-conditions-entree], [data-bloc-dossier="3"] input')).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/ADHOC|MONGA/);
    expect(enregistrer().disabled).toBe(true);
    expect(enregistrer().textContent).toBe('Enregistrer les modifications');
    expect(document.querySelector('[data-etat-dossier]')?.textContent).toBe('Aucune modification.');
  });

  it('un champ modifié : le récapitulatif des SEULS champs modifiés, par bloc ; « Confirmer » envoie une MISE À JOUR', async () => {
    await monter();
    await choisirNegociateur('Arnaud Jorel');
    expect(enregistrer().disabled).toBe(false);
    await act(async () => { enregistrer().click(); });
    const recap = document.querySelector('[data-recap-dossier]')!;
    expect([...recap.querySelectorAll('[data-recap-bloc]')].map((b) => b.getAttribute('data-recap-bloc'))).toEqual(['4']);
    expect([...recap.querySelectorAll('[data-recap-champ]')].map((l) => l.textContent)).toEqual(['Négociateur : Jean-Baptiste Pons → Arnaud Jorel']);
    expect(posts).toEqual([]);
    await act(async () => { (document.querySelector('[data-repere="confirmer-dossier"], button[data-repere="confirmer-dossier"]') as HTMLButtonElement ?? [...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'modifier-dossier-location', id: 100, ecran: 'Dossier de location (Suivi du mois)', saisie: { version: 'v1', suivi: { negociateurId: 4 } } });
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });

  it('🔴 conflit : le serveur refuse (modifié par ailleurs) — dit, rien n’est écrasé, « Recharger » proposé', async () => {
    reponsePost = { status: 409, corps: { etat: 'conflit', motif: 'Cette fiche a été modifiée par Jean-Baptiste Pons le 24/10/2026 à 14:05 depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.' } };
    await monter();
    await choisirNegociateur('Arnaud Jorel');
    await act(async () => { enregistrer().click(); });
    await act(async () => { [...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer')!.click(); });
    await calmer();
    expect(document.body.textContent).toContain('Dossier modifié par ailleurs');
    expect(document.body.textContent).toContain('modifiée par Jean-Baptiste Pons le 24/10/2026 à 14:05');
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Recharger')).toBe(true);
    expect(onEnregistre).not.toHaveBeenCalled();
  });

  it('une carte de locataire modifiée : marquée « modifiée », dans le récapitulatif du bloc 1 ; rien n’est écrit avant « Confirmer »', async () => {
    await monter();
    await act(async () => { (document.querySelector('[data-modifier-carte="230"]') as HTMLButtonElement).click(); });
    const commune = [...document.querySelectorAll('label')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Commune')!.querySelector('input') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(commune, 'Puteaux'); commune.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (document.querySelector('[data-carte-dossier="230"] form button[type="submit"]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-carte-modifiee]')).not.toBeNull();
    expect(posts).toEqual([]);
    await act(async () => { enregistrer().click(); });
    expect([...document.querySelectorAll('[data-recap-bloc="1"] [data-recap-champ]')].map((l) => l.textContent)).toEqual(['MARTIN Léa — Commune : COURBEVOIE → PUTEAUX']);
  });
});

describe('🔴 Arno (25/10/2026) — un dossier ANCIEN incomplet : il s’ouvre et se lit ; seul l’enregistrement exige les champs', () => {
  it('ouvert (bloc 3 lisible, « Paiement des charges » à droite du mode de règlement) ; « Enregistrer » refusé, en disant quoi compléter ; rien ne part', async () => {
    const ancien: LectureDossier = { ...lecture, conditions: { occupationId: 900, loyer: null, lignesHonoraires: [],
      valeurs: { ...lecture.conditions!.valeurs, sommes: { prorataLoyer: null, prorataCharges: null, depotGarantie: null, honorairesAgence: null }, chargesCopro: null } } };
    global.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
      if (url.includes('dossierLocation=100')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: ancien }) } as unknown as Response;
      if (url.startsWith('/api/admin/location/suivi') && !url.includes('vue=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: parametres }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ etat: 'inconnu' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await monter();
    expect(document.querySelector('[data-bloc-dossier="3"] [data-conditions-entree]')).not.toBeNull();
    expect([...document.querySelectorAll('[data-cond-paire="reglement-charges"] > .loc-cond-bloc')].map((b) => b.getAttribute('data-cond'))).toEqual(['reglement', 'charges']);
    expect((document.querySelector('[data-loyer="principal"] input') as HTMLInputElement).value).toBe('');
    await choisirNegociateur('Arnaud Jorel');
    await act(async () => { enregistrer().click(); });
    await calmer();
    expect(document.body.textContent).toContain('Loyer mensuel : le loyer principal (0 si aucun)');
    expect(document.body.textContent).toContain('Paiement des charges : payées par l’agence ou par le propriétaire');
    expect(posts).toEqual([]);
  });
});

describe('🔴 Arno (25/10/2026) — « Paiement des charges » présélectionné depuis la fiche du bien (Dossier de location)', () => {
  const servir = (l: LectureDossier) => {
    global.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
      if (url.includes('dossierLocation=100')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: l }) } as unknown as Response;
      if (url.startsWith('/api/admin/location/suivi') && !url.includes('vue=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: parametres }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ etat: 'inconnu' }) } as unknown as Response;
    }) as unknown as typeof fetch;
  };
  const boutons = () => [...document.querySelectorAll('[aria-label="Paiement des charges"] button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
  const signal = () => document.querySelector('[data-charges-signal]')?.textContent ?? null;

  it('la valeur de la fiche est choisie ; mêmes boutons, même ordre (Agence, Propriétaire) ; modifiée ici : « différent de la fiche du bien », dans le récapitulatif', async () => {
    servir({ ...lecture, lots: [{ ...lecture.lots[0], chargesCopro: 'proprietaire' }],
      conditions: { ...lecture.conditions!, valeurs: { ...lecture.conditions!.valeurs, chargesCopro: 'proprietaire' } } });
    await monter();
    expect(boutons()).toEqual([['Agence', 'false'], ['Propriétaire', 'true']]);
    expect(signal()).toBeNull();
    expect(document.querySelector('[data-cond="charges"]')?.textContent).not.toContain('Fiche du bien aujourd’hui');
    await act(async () => { ([...document.querySelectorAll('[aria-label="Paiement des charges"] button')].find((b) => b.textContent === 'Agence') as HTMLButtonElement).click(); });
    expect(signal()).toBe('Différent de la fiche du bien (Propriétaire) : la fiche sera mise à jour à l’enregistrement.');
    expect(document.querySelector('[data-etat-dossier]')?.textContent).not.toBe('Aucune modification.');
  });

  it('des lots aux valeurs DIFFÉRENTES : aucune présélection, « valeurs différentes selon les lots »', async () => {
    servir({ ...lecture, lots: [{ ...lecture.lots[0], chargesCopro: 'agence' }, { id: 52, libelle: 'Parking n° 52', chargesCopro: 'proprietaire' }],
      conditions: { ...lecture.conditions!, valeurs: { ...lecture.conditions!.valeurs, chargesCopro: null } } });
    await monter();
    expect(boutons()).toEqual([['Agence', 'false'], ['Propriétaire', 'false']]);
    expect(signal()).toBe('Valeurs différentes selon les lots : aucune présélection, choisissez.');
  });
});

describe('🔴 Arno (25/10/2026) — « Type de bien » reporté sur la fiche du bien : lots de familles différentes', () => {
  it('enregistré, mais la fiche n’est pas écrasée : la modale le dit (« modifier dans Caractéristiques du bien loué ») ; « Fermer » termine', async () => {
    reponsePost = { status: 200, corps: { etat: 'ok', data: { changements: [], note: 'Type de bien : familles différentes selon les lots — modifier dans « Caractéristiques du bien loué ».' } } };
    await monter();
    await choisirNegociateur('Arnaud Jorel');
    await act(async () => { enregistrer().click(); });
    await act(async () => { ([...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer') as HTMLButtonElement).click(); });
    await calmer();
    expect(document.querySelector('[data-modale-issue="attention"]')?.textContent).toContain('familles différentes selon les lots — modifier dans « Caractéristiques du bien loué »');
    expect(onEnregistre).not.toHaveBeenCalled();
    await act(async () => { (document.querySelector('[data-fermer-note-dossier]') as HTMLButtonElement).click(); });
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });
});

describe('🔴 Arno (25/10/2026) — « GLI : laquelle ? » et la rangée Garanties | Honoraires (Dossier de location)', () => {
  const servir = (l: LectureDossier) => {
    global.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
      const url = String(u);
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response; }
      if (url.includes('dossierLocation=100')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: l }) } as unknown as Response;
      if (url.startsWith('/api/admin/location/suivi') && !url.includes('vue=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: parametres }) } as unknown as Response;
      return { ok: true, status: 200, json: async () => ({ etat: 'inconnu' }) } as unknown as Response;
    }) as unknown as typeof fetch;
  };
  const avecGli = (precision: string): LectureDossier => ({ ...lecture, entretien: { aPrevoir: false, entretiens: [] },
    conditions: { ...lecture.conditions!, valeurs: { ...lecture.conditions!.valeurs, assurance: 'gli', assurancePrecision: precision } } });
  const gli = () => [...document.querySelectorAll('[aria-label="GLI : laquelle ?"] button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
  const champ = () => document.querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement | null;

  it('« Garantme » enregistré (casse et espaces ignorés) : Garantme présélectionné, aucun champ ; rien à enregistrer', async () => {
    servir(avecGli(' garantme '));
    await monter();
    expect(gli()).toEqual([['Garantme', 'true'], ['Personnaliser', 'false']]);
    expect(champ()).toBeNull();
    expect(document.querySelector('[data-etat-dossier]')?.textContent).toBe('Aucune modification.');
  });

  it('un autre texte : Personnaliser présélectionné avec le texte ; passer à Garantme se lit dans le récapitulatif', async () => {
    servir(avecGli('Assureur X'));
    await monter();
    expect(gli()).toEqual([['Garantme', 'false'], ['Personnaliser', 'true']]);
    expect(champ()?.value).toBe('Assureur X');
    await act(async () => { ([...document.querySelectorAll('[aria-label="GLI : laquelle ?"] button')].find((b) => b.textContent === 'Garantme') as HTMLButtonElement).click(); });
    expect(champ()).toBeNull();
    await act(async () => { enregistrer().click(); });
    expect([...document.querySelectorAll('[data-recap-champ]')].map((l) => l.textContent)).toContain('Assurance loyers impayés : GLI — Assureur X → GLI — Garantme');
  });

  it('Garanties | Honoraires côte à côte (même rangée de la grille), « Entretien à prévoir » juste après, pleine largeur', async () => {
    servir(avecGli('Garantme'));
    await monter();
    const ordre = [...document.querySelectorAll('[data-conditions-entree] > .loc-cond-bloc')].map((b) => b.getAttribute('data-cond'));
    expect(ordre.slice(0, 5)).toEqual(['depot', 'prelevement', 'garanties', 'honoraires', 'entretien']);
  });
});
