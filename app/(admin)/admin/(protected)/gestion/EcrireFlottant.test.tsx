// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 (Arno, 27/11/2026, 22h17) « applique la même règle que 7b5715a6 : c'est le DROIT D'ENVOI qui décide, pas la tuile » — les « Écrire » des
 * fiches de la Location (contacts de l'annuaire, du syndic) ouvrent LE « Nouveau message » de la boîte Gestion (fenêtre flottante), au lieu de
 * la messagerie de l'ordinateur ; sans droit d'envoi, rien de nouveau n'apparaît (l'adresse reste telle quelle).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ouvertes = vi.hoisted(() => ({ brouillons: [] as { a: string[]; objet: string }[] }));
vi.mock('./FenetresRedaction', () => ({
  useFenetresRedaction: () => {
    const fenetres: { cle: string }[] = [];
    return {
      fenetres, brouillons: new Map(), fermetures: new Map(),
      ouvrirFenetre: (cle: string, b: { a: string[]; objet: string }) => { ouvertes.brouillons.push(b); void cle; return null; },
      majBrouillon: vi.fn(), fermerLa: vi.fn(), demanderFermeture: vi.fn(), changerLEtat: vi.fn(),
    };
  },
  FenetresRedaction: () => null,
}));

import { brouillonAdresse } from './EcrireFlottant';
import { FicheSyndicLocationVue } from '../location/EcransLocation';
import { mailVingtDuContexte } from '../location/MailVingtPourcent';

const CONTEXTE = { schemaPret: true, peutEnvoyer: true, jetonPresent: true, signature: '— Gestion', signatureHtml: '', nomExpediteur: 'CRITERIMMO',
  adresseGestion: 'gestion@criterimmo.fr', delaiAnnulationS: 10, piecesDisponibles: false, htmlDisponible: false, classementDisponible: false,
  interneDisponible: false, corbeilleBrouillon: false };
const SYNDIC = { id: 4, nom: 'CABINET _TEST', adresse: null, codePostal: null, ville: null, telephone: null, telephone2: null, email: 'syndic@exemple.test', note: null,
  contacts: [{ id: 1, civilite: null, prenom: 'Léa', nom: 'MARTIN', titre: null, coordonnees: [{ id: 9, sorte: 'email', libelle: null, valeur: 'lea@exemple.test' }] }],
  coproprietes: [] };

const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
let container: HTMLDivElement; let root: Root; let droit: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ouvertes.brouillons.length = 0; droit = true;
  global.fetch = vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    if (url.startsWith('/api/admin/gestion/redaction')) return reponse({ ...CONTEXTE, peutEnvoyer: droit });
    if (url.includes('syndic=4')) return reponse({ etat: 'ok', data: SYNDIC });
    if (url.includes('mailSyndic') || url.includes('preremplir')) return reponse({ etat: 'inconnu' });
    return reponse({ etat: 'inconnu' });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }); };

describe('🔴 la règle de 7b5715a6, partagée : le droit d’envoi décide (Gestion ET Location)', () => {
  it('mailVingtDuContexte : contexte non lu, base pas à jour, ou sans droit d’envoi → null ; sinon le module', () => {
    expect(mailVingtDuContexte(null)).toBeNull();
    expect(mailVingtDuContexte({ ...CONTEXTE, schemaPret: false })).toBeNull();
    expect(mailVingtDuContexte({ ...CONTEXTE, peutEnvoyer: false })).toBeNull();
    const g = vi.fn();
    expect(mailVingtDuContexte(CONTEXTE, g)).toEqual({ contexte: CONTEXTE, onGeste: g });
  });
  it('brouillonAdresse : le « Nouveau message » de la boîte, pré-adressé, signé — partagé avec la boîte Gestion (aucune copie)', () => {
    const b = brouillonAdresse('lea@exemple.test', CONTEXTE);
    expect([b.a, b.id, b.corps.includes('— Gestion')]).toEqual([['lea@exemple.test'], null, true]);
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8')).toContain("const adresse: BrouillonEcran = brouillonAdresse(email, redaction, typeof ecrireA === 'string' ? [] : ecrireA.contexte.autres ?? []);");
  });
});

describe('🔴 Location › fiche d’un syndic : ses e-mails ne sont plus en lecture seule', () => {
  it('avec le droit d’envoi : « Écrire depuis gestion@ » sur l’e-mail du syndic et sur celui de chaque contact ; le clic ouvre le module, pré-adressé', async () => {
    await act(async () => { root.render(createElement(FicheSyndicLocationVue, { id: 4 })); }); await calmer();
    const boutons = [...container.querySelectorAll('[data-ecrire-syndic]')];
    expect(boutons.map((b) => b.getAttribute('data-ecrire-syndic'))).toEqual(['syndic@exemple.test', 'lea@exemple.test']);
    await act(async () => { (boutons[1] as HTMLButtonElement).click(); }); await calmer();
    expect(ouvertes.brouillons.map((b) => b.a)).toEqual([['lea@exemple.test']]);
  });
  it('sans le droit d’envoi : aucun bouton, les adresses restent affichées telles quelles (rien n’est retiré)', async () => {
    droit = false;
    await act(async () => { root.render(createElement(FicheSyndicLocationVue, { id: 4 })); }); await calmer();
    expect(container.querySelectorAll('[data-ecrire-syndic]')).toHaveLength(0);
    expect(container.textContent).toContain('syndic@exemple.test');
    expect(container.textContent).toContain('lea@exemple.test');
  });
});

describe('🔴 (Arno, 28/11/2026, 12h54, point 1) l’écran des syndics de la Gestion ouvre un syndic désigné par l’adresse', () => {
  it('« ?syndic=N » ouvre sa fiche, pour la modifier (le lien « à compléter » de la Location)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/EcranSyndics.tsx', 'utf8');
    expect(src).toContain("const n = Number(new URLSearchParams(window.location.search).get('syndic'));");
    expect(src).toContain('if (Number.isInteger(n) && n > 0) { depuisAdresse.current = true; setOuvert({ id: n }); }'); // 🔴 (13h18) et la fermeture ramène à l'origine
  });
});
