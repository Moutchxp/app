// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FicheSyndic } from './FicheSyndic';

/**
 * 🔴 MODALE « SYNDIC DE LA COPROPRIÉTÉ » DU FORMULAIRE DU BIEN (variante « location », Arno 17/10/2026) — et la Gestion
 * inchangée : un seul bouton de création ; 3 boutons sur une ligne sous l'encadré « déjà connu » ; « Voir le détail »
 * déplie les informations de l'annuaire (lecture seule) ; le rattachement depuis le détail est rendu au formulaire SANS
 * écriture ; « Non, créer un autre syndic » ouvre la création. Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const CONNU = { syndic: { id: 2, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' }, copro: { cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert' }, via: ['bien'], biens: [{ id: 7, numero: '219', adresse: '15 rue Carle Hebert' }] };
const FICHE = {
  id: 2, nom: 'TEST ARNAUD', adresse: '1 rue du Cabinet', codePostal: '92600', ville: 'Asnieres Sur Seine', telephone: '0140000000', telephone2: '',
  email: 'cabinet@exemple.test', note: 'Joignable le matin.',
  contacts: [{ id: 21, civilite: 'M.', prenom: 'Arnaud', nom: 'JOREL', titre: 'Responsable de copropriété', tousImmeubles: false, immeubles: [], coordonnees: [{ id: 1, sorte: 'email', libelle: null, valeur: 'arnaud@exemple.test' }] }],
  coproprietes: [{ id: 3, cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', debut: '2026-01-01', lots: [{ id: 7, numero: '219', adresse: '15 rue Carle Hebert', commune: 'Courbevoie' }] }],
  historique: [],
};

let hote: HTMLDivElement;
let racine: Root;
let ecritures: string[];
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  ecritures = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method !== undefined && init.method !== 'GET') { ecritures.push(`${init.method} ${u}`); return reponse({ ok: true }); }
    if (u.includes('/syndics/connus')) return reponse({ etat: 'ok', syndics: [CONNU] });
    if (u.includes('/syndics/2')) return reponse({ etat: 'ok', fiche: FICHE });
    if (u.includes('/syndics/immeubles')) return reponse({ etat: 'ok', disponible: true, immeubles: [] });
    return reponse({ etat: 'ok', syndics: [], comparables: [], contacts: [] });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const bouton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const IMMEUBLE = { libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie' };

describe('🔴 modale syndic — variante « location »', () => {
  it('un seul bouton de création ; 3 boutons sur une ligne ; détail ; rattachement rendu SANS écriture', async () => {
    const choisis: unknown[] = [];
    let fermee = false;
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onChoisi: (s: unknown) => choisis.push(s), onFerme: () => { fermee = true; } })); });
    await calmer();
    expect(bouton('Créer un nouveau syndic')).toBeUndefined();
    expect(document.querySelector('[data-syndic-connu]')?.textContent).toContain('Un syndic est déjà connu pour cette adresse');
    expect([...document.querySelectorAll('[data-trois-boutons] button')].map((b) => b.textContent)).toEqual(['Le rattacher à ce bien', 'Voir le détail', 'Non, créer un autre syndic']);
    await act(async () => { bouton('Voir le détail')!.click(); });
    await calmer();
    const detail = document.querySelector('[data-detail-syndic]') as HTMLElement;
    for (const t of ['TEST ARNAUD', '1 rue du Cabinet', '0140000000', 'cabinet@exemple.test', 'M. Arnaud JOREL', 'Responsable de copropriété', 'arnaud@exemple.test', '15 rue Carle Hebert', 'lot 219', 'Joignable le matin.']) {
      expect(detail.textContent, t).toContain(t);
    }
    expect(detail.querySelector('a')?.getAttribute('href')).toBe('/admin/location/syndic/2');
    // Les 3 boutons restent accessibles, détail ouvert ; « Masquer le détail » replie.
    expect(bouton('Masquer le détail')).toBeDefined();
    expect(document.querySelectorAll('[data-trois-boutons] button')).toHaveLength(3);
    await act(async () => { bouton('Le rattacher à ce bien')!.click(); });
    expect(choisis).toEqual([{ id: 2, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' }]);
    expect(fermee).toBe(true);
    expect(ecritures).toEqual([]);
  });

  it('« Non, créer un autre syndic » bascule sur le formulaire de création', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onFerme: () => {} })); });
    await calmer();
    await act(async () => { bouton('Non, créer un autre syndic')!.click(); });
    await calmer();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Créer un syndic');
    expect(document.body.textContent).toContain('Nom du cabinet');
  });

  it('la GESTION est inchangée : son bouton « Créer un nouveau syndic » et son encadré à elle', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, onFerme: () => {} })); });
    await calmer();
    expect(bouton('Créer un nouveau syndic')).toBeDefined();
    expect(document.querySelector('[data-trois-boutons]')).toBeNull();
    expect(bouton('Le rattacher à ce bien')).toBeDefined();
  });
});
