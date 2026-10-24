// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';

let chemin = '/admin/location';
vi.mock('next/navigation', () => ({ usePathname: () => chemin }));
const { RoueParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (21/10/2026) — la roue crantée « Paramètres Location » et sa modale à deux onglets. Les VRAIS composants, route
 * simulée : rien n'est écrit. On éprouve : la roue seulement sur l'accueil Location et pour un administrateur ; les
 * destinataires par défaut (modifier, supprimer, ajouter, réordonner, format) ; une NOUVELLE version de barème ; le refus d'une
 * date antérieure ; une version utilisée verrouillée ; une version future jamais utilisée corrigeable.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
const V = (id: number, depuis: string, baux: number, t = '12.10') => ({ id, depuis, tresTendue: t, tendue: '10.09', autre: '8.07', etatDesLieux: '3.03', source: 'Arrêté',
  saisiLe: '2026-01-01T10:00:00+01', saisiPar: 'migration 392', corrigeLe: null, corrigePar: null, baux });
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let versions: ReturnType<typeof V>[];
beforeEach(() => {
  chemin = '/admin/location';
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; versions = [V(2, '2026-12-01', 0, '12.50'), V(1, '2026-01-01', 3)];
  global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return json({ etat: 'ok' }); }
    return json({ etat: 'ok', data: {
      destinataires: [{ adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' }, { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }, { adresse: 'laura@monga.io', libelle: 'MONGA' }],
      destinatairesSaisis: { le: '2026-10-21T10:00:00+02', par: 'migration 395' }, versions, aujourdhui: '2026-10-21', manquantes: [],
      archivage: { mois: 24, disponible: true },
    } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: Element | null, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el!.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ouvrir = async () => {
  await act(async () => { root.render(createElement(RoueParametresLocation, { administrateur: true })); });
  await clic(container.querySelector('[data-roue-parametres]'));
};
const adresses = () => [...container.querySelectorAll('[data-destinataire-defaut] [data-adresse]')].map((i) => (i as HTMLInputElement).value);

describe('🔴 la roue crantée « Paramètres Location »', () => {
  it('sur l’accueil Location, pour un administrateur : la roue (libellé accessible, cible 44 px) ; ailleurs ou sans le rôle : rien', async () => {
    await act(async () => { root.render(createElement(RoueParametresLocation, { administrateur: true })); });
    const roue = container.querySelector('[data-roue-parametres]');
    expect(roue?.getAttribute('aria-label')).toBe('Paramètres Location');
    expect(container.querySelector('style')?.textContent).toMatch(/\.plo-roue\{[^}]*width:44px;height:44px;margin:-8px -6px;border:0/);
    await act(async () => { root.render(createElement(RoueParametresLocation, { administrateur: false })); });
    expect(container.querySelector('[data-roue-parametres]')).toBeNull();
    chemin = '/admin/location/locataires';
    await act(async () => { root.render(createElement(RoueParametresLocation, { administrateur: true })); });
    expect(container.querySelector('[data-roue-parametres]')).toBeNull();
  });

  it('Arno (21/10/2026) — la roue est sur la ligne du bandeau, JUSTE À DROITE DE L’HEURE, avant « Changer mon mot de passe » et « Déconnexion »', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/layout.tsx', 'utf8');
    const i = (m: string) => src.indexOf(m);
    expect(i('<HeureParis />')).toBeGreaterThan(0);
    expect(i("<RoueParametresLocation administrateur={session.role === 'administrateur'} />")).toBeGreaterThan(i('<HeureParis />'));
    const iRoue = i('<RoueParametresLocation');
    const iMdp = src.indexOf('Changer mon mot de passe', iRoue);
    expect(iMdp).toBeGreaterThan(iRoue);
    expect(src.indexOf('<BoutonDeconnexion />', iMdp)).toBeGreaterThan(iMdp);
    expect(src).not.toContain("flexDirection: 'column'");
  });

  it('la modale : ses onglets (dont « Archivage des fins de gestion », 405) ; Enregistrer / Annuler en bas', async () => {
    await ouvrir();
    expect(container.querySelector('[data-modale-parametres]')?.getAttribute('role')).toBe('dialog');
    expect([...container.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Destinataires du mail', 'Barèmes d’honoraires', 'Archivage des fins de gestion', 'Apporteurs', 'Commissions', 'Indices']); // 406 : deux onglets AJOUTÉS en fin
    expect([...container.querySelectorAll('.plo-boutons button')].map((b) => b.textContent)).toEqual(['Annuler', 'Enregistrer']);
    await clic(container.querySelector('[data-annuler-parametres]'));
    expect(container.querySelector('[data-modale-parametres]')).toBeNull();
    expect(posts).toEqual([]);
  });
});

describe('🔴 onglet « Destinataires du mail »', () => {
  it('pré-rempli ; la copie automatique est rappelée ; modifier, supprimer, ajouter, réordonner, contrôle du format ; Enregistrer la nouvelle liste', async () => {
    await ouvrir();
    expect(adresses()).toEqual(['gestion@criterimmo.fr', 'gestion.criterimmo@gmail.com', 'laura@monga.io']);
    expect(container.textContent).toContain('La personne qui envoie reçoit toujours une copie, automatiquement');
    await clic(container.querySelector('[data-destinataire-defaut="2"] [data-monter]'));
    expect(adresses()).toEqual(['gestion@criterimmo.fr', 'laura@monga.io', 'gestion.criterimmo@gmail.com']);
    await clic(container.querySelector('[data-destinataire-defaut="0"] [data-supprimer]'));
    await saisir(container.querySelector('[data-destinataire-defaut="1"] [data-libelle]'), 'ADHOC (compta)');
    await clic(container.querySelector('[data-ajouter]'));
    await saisir(container.querySelector('[data-destinataire-defaut="2"] [data-adresse]'), 'mauvaise');
    expect(container.querySelector('[data-destinataire-defaut="2"]')?.textContent).toContain('Ce n’est pas une adresse e-mail valide.');
    await clic(container.querySelector('[data-enregistrer-parametres]'));
    expect(posts).toEqual([]);
    await saisir(container.querySelector('[data-destinataire-defaut="2"] [data-adresse]'), 'nouveau@exemple.test');
    await clic(container.querySelector('[data-enregistrer-parametres]'));
    expect(posts).toEqual([{ action: 'destinataires', liste: [
      { adresse: 'laura@monga.io', libelle: 'MONGA' }, { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC (compta)' }, { adresse: 'nouveau@exemple.test', libelle: '' },
    ] }]);
    expect(container.querySelector('[data-info-parametres]')?.textContent).toBe('Liste des destinataires enregistrée.');
  });
});

describe('🔴 onglet « Barèmes d’honoraires » : versions datées', () => {
  const onglet = async () => { await ouvrir(); await clic(container.querySelector('[data-onglet="baremes"]')); };
  const valeur = (k: string) => (container.querySelector(`[data-champ-bareme="${k}"] input`) as HTMLInputElement).value;

  it('pré-rempli avec la version EN VIGUEUR, « Applicable à partir du » = aujourd’hui ; l’historique (dates, valeurs, baux, auteur)', async () => {
    await onglet();
    expect([valeur('tresTendue'), valeur('tendue'), valeur('autre'), valeur('etatDesLieux'), valeur('depuis')]).toEqual(['12,10', '10,09', '8,07', '3,03', '2026-10-21']);
    const h = [...container.querySelectorAll('[data-version]')].map((li) => li.textContent);
    expect(h[0]).toContain('Applicable à partir du 01/12/2026');
    expect(h[0]).toContain('à venir');
    expect(h[0]).toContain('Aucun bail');
    expect(h[1]).toContain('Applicable à partir du 01/01/2026');
    expect(h[1]).toContain('en vigueur');
    expect(h[1]).toContain('3 baux · créée le 01/01/2026 par migration 392');
  });

  it('une date ANTÉRIEURE à la version précédente est refusée (rien ne part) ; une date valide crée une NOUVELLE version', async () => {
    await onglet();
    expect(container.querySelector('[data-refus-bareme]')?.textContent).toBe('La date « Applicable à partir du » ne peut pas être antérieure à celle de la version précédente (01/12/2026).');
    expect((container.querySelector('[data-enregistrer-parametres]') as HTMLButtonElement).disabled).toBe(true);
    await saisir(container.querySelector('[data-champ-bareme="depuis"] input'), '2027-01-01');
    await saisir(container.querySelector('[data-champ-bareme="tresTendue"] input'), '13,00');
    await clic(container.querySelector('[data-enregistrer-parametres]'));
    expect(posts).toEqual([{ action: 'bareme', depuis: '2027-01-01', tresTendue: '13,00', tendue: '10,09', autre: '8,07', etatDesLieux: '3,03', source: '' }]);
    expect(container.querySelector('[data-info-parametres]')?.textContent).toBe('Nouvelle version du barème enregistrée.');
  });

  it('une version UTILISÉE (ou déjà en vigueur) est verrouillée ; une version FUTURE jamais utilisée se corrige', async () => {
    await onglet();
    expect(container.querySelector('[data-version="1"] [data-corriger-version]')).toBeNull();
    expect(container.querySelector('[data-version="1"] [data-verrou-version]')?.textContent).toBe('🔒 Utilisée par un bail : ne se modifie pas.');
    await clic(container.querySelector('[data-corriger-version="2"]'));
    expect(container.querySelector('[data-correction]')?.textContent).toContain('Correction de la version applicable à partir du 01/12/2026');
    expect(valeur('tresTendue')).toBe('12,50');
    await saisir(container.querySelector('[data-champ-bareme="depuis"] input'), '2026-12-15');
    await clic(container.querySelector('[data-enregistrer-parametres]'));
    expect(posts).toEqual([{ action: 'corriger-bareme', id: 2, depuis: '2026-12-15', tresTendue: '12,50', tendue: '10,09', autre: '8,07', etatDesLieux: '3,03', source: 'Arrêté' }]);
  });
});

describe('🔴 onglet « Archivage des fins de gestion » (Arno, 21/10/2026, 405)', () => {
  it('le délai (24 mois par défaut), contrôlé, enregistré ; il vaut pour les biens pas encore archivés', async () => {
    await ouvrir();
    await clic(container.querySelector('[data-onglet="archivage"]'));
    expect(container.querySelector('[data-onglet="archivage"]')?.textContent).toBe('Archivage des fins de gestion');
    const champ = container.querySelector('[data-delai-archivage]') as HTMLInputElement;
    expect(champ.value).toBe('24');
    expect(container.querySelector('[data-onglet-archivage]')?.textContent).toContain('Un changement vaut pour les biens PAS ENCORE archivés, jamais pour ceux qui le sont.');
    await saisir(champ, '0');
    await clic(container.querySelector('[data-enregistrer-parametres]'));
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-motif-parametres]')?.textContent).toBe('Le délai d’archivage est un nombre entier de mois, entre 1 et 240.');
    await saisir(champ, '18');
    await clic(container.querySelector('[data-enregistrer-parametres]'));
    expect(posts).toEqual([{ action: 'archivage-delai', mois: 18 }]);
    expect(container.querySelector('[data-info-parametres]')?.textContent).toBe('Délai d’archivage enregistré : 18 mois après la fin de gestion.');
  });
});
