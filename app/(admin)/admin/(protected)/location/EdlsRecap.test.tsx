// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocPreavisAccueil } from './PreavisAccueil';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';

/**
 * 🔴🔴 Arno (10/11/2026) — L'ÉTAT DES LIEUX DE SORTIE : le récapitulatif avant envoi (le collègue invité et son texte), « Revenir » qui garde la
 * saisie, puis le résultat d'après le serveur (échec en rouge). Les vrais composants, routes simulées : rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ENCART: EncartLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: false, etage: '3', porte: 'G', numLotCopro: null,
  numeroLot: '100', batiment: 'B', escalier: null, surfaceCarrez: null, surfaceHabitable: null, surface: null, surfaceExterieure: null,
  nombrePieces: null, ascenseur: true, digicode: true, digicodeCode: '4521A', precisionAcces: 'Code au portail', dpeClasse: null, dpeDate: null,
  dpeNonSoumis: null, chauffage: null, epoqueConstruction: null,
  lots: [
    { lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: null, numeroLot: '100', porte: 'G', place: false },
    { lotId: 8, role: 'annexe', type: 'Parking', etage: '-1', numLotCopro: null, numeroLot: null, porte: '12', place: true },
  ],
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: null,
  bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null },
  coordonnees: {
    proprietaire: { telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] },
    locataires: [
      { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: ['06 55 66 77 88'], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] },
    ],
  },
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const LIGNE: LignePreavisAccueil = { cle: 'A', lotId: 7, adresse: '4 rue Fictive', occupationId: 11, occupationIds: [11],
  locataires: [{ occupationId: 11, locataireId: 101, nom: 'MARTIN Alice' }], recuLe: '2026-11-01', dateMax: '2099-02-01', etatDesLieuxLe: null };
let posts: Record<string, unknown>[]; let c: HTMLDivElement; let r: Root;
let mailsServeur: { destinataire: string; etat: string }[];
beforeEach(() => {
  posts = []; mailsServeur = [{ destinataire: 'Claire Test', etat: 'echec' }];
  c = document.createElement('div'); document.body.appendChild(c); r = createRoot(c);
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      if (corps.action === 'apercu-edls') return ok({ collaborateurs: [{ libelle: 'Claire Test', mail: true, motif: null }], exterieurs: [], total: 1,
        texteCollaborateur: 'Bonjour Claire Test,\n\nMission : état des lieux de sortie.', texteExterieur: null });
      return ok({ edlsId: 77, statut: 'en_attente', mails: mailsServeur, agenda: '' });
    }
    const s = decodeURIComponent(String(u));
    if (s.includes('preavisEnCours=1')) return ok({ disponible: true, etatDesLieux: true, planification: true, lignes: [LIGNE] });
    if (s.includes('encartBail=')) return ok(ENCART);
    if (s.includes('edlsConfiables=1')) return ok([{ id: 3, libelle: 'Arno Test', accesGestion: true }, { id: 4, libelle: 'Claire Test', accesGestion: true }]);
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => r.unmount()); c.remove(); document.querySelectorAll('.mis-voile').forEach((n) => n.remove()); vi.restoreAllMocks(); });
const calmer = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const clic = async (el: Element | null) => { if (el === null) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const saisir = (el: Element | null, v: string) => act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); (el as HTMLElement).dispatchEvent(new Event('input', { bubbles: true })); });

describe('🔴 l’état des lieux de sortie : récapitulatif, « Revenir », résultat', () => {
  it('planifier : le récapitulatif (Claire Test, 1 invitation, son texte) ; « Revenir » garde la saisie ; confirmer : le résultat, échec en rouge', async () => {
    await act(async () => { r.render(createElement(BlocPreavisAccueil, { gestion: true })); }); await calmer();
    await clic(c.querySelector('[data-ouvrir-preavis="A"]'));
    await clic(c.querySelector('[data-planifier-edls]'));
    saisir(c.querySelector('[data-edls-jour]'), '2026-11-20');
    saisir(c.querySelector('[data-edls-debut]'), '10:00');
    await calmer();
    await clic(c.querySelector('[data-valider-edls]'));
    expect(posts.at(-1)).toMatchObject({ action: 'apercu-edls', geste: 'planifier', jour: '2026-11-20', debut: '10:00' });
    const f = document.querySelector('[data-fenetre-envois="recap"]')!;
    expect(f.querySelector('[data-total-envois]')?.textContent).toBe('1 invitation partira.');
    expect([...f.querySelectorAll('[data-recap-collaborateurs] li')].map((l) => l.textContent)).toEqual(['Claire Test — invitation par mail']);
    expect(f.querySelector('[data-recap-exterieurs]')?.textContent).toContain('Aucun');
    await clic(document.querySelector('[data-revenir-recap]'));
    expect(posts.some((p) => p.action === 'planifier-edls')).toBe(false);
    expect((c.querySelector('[data-edls-jour]') as HTMLInputElement).value).toBe('2026-11-20');
    await clic(c.querySelector('[data-valider-edls]'));
    await clic(document.querySelector('[data-confirmer-recap]'));
    expect(posts.at(-1)).toMatchObject({ action: 'planifier-edls', jour: '2026-11-20' });
    const res = document.querySelector('[data-fenetre-envois="resultat"]')!;
    expect(res.querySelector('[data-titre-resultat-envois]')?.textContent).toBe('✓ État des lieux de sortie planifié');
    expect(res.querySelector('[data-envoye="non"]')?.textContent).toContain('Claire Test');
  });
});
