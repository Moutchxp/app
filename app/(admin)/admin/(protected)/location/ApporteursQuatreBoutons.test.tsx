// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (24/10/2026) — LA CARTE D'APPORTEUR À QUATRE BOUTONS : Fiche · Rattachement · Taux · Cumul. Dans cet ordre ; un seul panneau
 * ouvert par carte ; le bouton actif en évidence ; un second clic referme ; TOUT l'ancien « Fiche et cumul » est dans Fiche + Cumul (et le
 * rattachement dans Rattachement) ; la synthèse reste visible ; la fiche d'un externe (identité complète, récapitulatif, conflit). Données
 * fictives, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown, status = 200) => ({ ok: status < 400, status, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let reponseFiche: { status: number; corps: unknown };
const EXTERNE: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Fictive', prenom: 'Léa', societe: 'Fictive Conseil',
  telephone: '06 00 00 00 04', email: 'lea@exemple.fr', civilite: null, adresse: null, notes: null, telephonesAutres: [], emailsAutres: [], version: 'v1',
  baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0, mode: 'one_shot', tauxGestion: 0, ordre: 1 }],
  collegues: [{ depuis: '0001-01-01', collegueId: 5, collegueLibelle: 'Paul Collègue' }], remunerations: [] };
const INTERNE: Apporteur = { id: 9, nom: 'Marie Interne', type: 'collaborateur', archive: false, compteId: 2, nomFamille: 'Interne', prenom: 'Marie',
  compteLibelle: 'Marie Interne', compteIdentifiant: 'marie@exemple.fr', baremes: [], collegues: [], remunerations: [] };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; reponseFiche = { status: 200, corps: { etat: 'ok', data: { changements: [] } } };
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  const suivi = { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, nomPrenom: true, negociateurs: [], regles: [], retrocessions: [],
    collegues: [{ id: 2, libelle: 'Marie Interne' }, { id: 5, libelle: 'Paul Collègue' }], apporteurs: [EXTERNE, INTERNE] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(c);
      return c.action === 'fiche-apporteur' ? json(reponseFiche.corps, reponseFiche.status) : json({ etat: 'ok' });
    }
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: '2026-10-24', dossiers: [] } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 2, ca: 2000, commission: 200 }, parAnnee: [{ annee: 2026, nb: 2, ca: 2000, commission: 200 }], parMois: [] } });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: { 4: { nb: 2, ca: 2000, commission: 200, collegue: 0 }, 9: { nb: 0, ca: 0, commission: 0 } } });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: Element, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const annuaire = async () => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};
const bouton = (id: number, p: string) => container.querySelector(`[data-apporteur-bouton="${id}"][data-panneau-bouton="${p}"]`)!;
const ouverts = (id: number) => [...container.querySelectorAll(`[data-apporteur="${id}"] [data-panneau]`)].map((x) => x.getAttribute('data-panneau'));

describe('🔴 la carte à quatre boutons', () => {
  it('les 4 boutons dans l’ordre ; « Nouveau taux » et « Fiche et cumul » remplacés ; la synthèse reste visible', async () => {
    await annuaire();
    const carte = container.querySelector('[data-apporteur="4"]')!;
    expect([...carte.querySelectorAll('[data-panneau-bouton]')].map((b) => b.textContent)).toEqual(['Fiche', 'Rattachement', 'Taux', 'Cumul']);
    expect(carte.querySelector('[data-nouveau-taux], [data-ouvrir-fiche]')).toBeNull();
    expect(carte.querySelector('[data-totaux-ligne="4"]')).not.toBeNull();
    // 🔴 Arno (24/10/2026) — le bloc « Conditions » a pris la place de la cascade sur la carte (accord d'Arno).
    expect(carte.querySelector('[data-conditions="4"]')).not.toBeNull();
  });
  it('un seul panneau ouvert à la fois par carte ; le bouton actif en évidence ; un second clic referme', async () => {
    await annuaire();
    for (const p of ['fiche', 'rattachement', 'taux', 'cumul']) {
      await clic(bouton(4, p));
      expect(ouverts(4)).toEqual([p]);
      expect([...container.querySelectorAll('[data-apporteur-bouton="4"][aria-pressed="true"]')].map((b) => b.getAttribute('data-panneau-bouton'))).toEqual([p]);
    }
    await clic(bouton(4, 'cumul'));
    expect(ouverts(4)).toEqual([]);
    expect(container.querySelector('[data-apporteur-bouton="4"][aria-pressed="true"]')).toBeNull();
    // Deux cartes : chacune son panneau.
    await clic(bouton(4, 'fiche'));
    await clic(bouton(9, 'taux'));
    expect([ouverts(4), ouverts(9)]).toEqual([['fiche'], ['taux']]);
  });
  it('TOUT l’ancien « Fiche et cumul » est là : identité dans Fiche, rattachement + rémunération dans Rattachement, totaux et cumul dans Cumul', async () => {
    await annuaire();
    await clic(bouton(4, 'fiche'));
    const f = container.querySelector('[data-apporteur="4"] [data-panneau="fiche"]')!;
    for (const k of ['data-fiche-nom-famille', 'data-fiche-prenom', 'data-fiche-societe', 'data-fiche-type', 'data-fiche-telephone', 'data-fiche-email', 'data-enregistrer-fiche',
      'data-fiche-civilite', 'data-fiche-adresse', 'data-fiche-notes']) expect(f.querySelector(`[${k}]`), k).not.toBeNull();
    expect((f.querySelector('[data-fiche-societe]') as HTMLInputElement).value).toBe('Fictive Conseil');
    await clic(bouton(4, 'rattachement'));
    const r = container.querySelector('[data-apporteur="4"] [data-panneau="rattachement"]')!;
    for (const k of ['data-rattacher-collegue', 'data-rattacher-toujours', 'data-rattacher-depuis', 'data-enregistrer-rattachement', 'data-historique-collegues', 'data-question-honoraires',
      'data-modifier-remuneration', 'data-resume-rattachement'])
      expect(r.querySelector(`[${k}]`), k).not.toBeNull();
    await clic(bouton(4, 'cumul'));
    const c = container.querySelector('[data-apporteur="4"] [data-panneau="cumul"]')!;
    await calmer();
    expect(c.querySelector('[data-totaux-apporteur]')).not.toBeNull();
    expect(c.querySelector('[data-cumul-apporteur]')).not.toBeNull();
    await clic(bouton(4, 'taux'));
    const t = container.querySelector('[data-apporteur="4"] [data-panneau="taux"]')!;
    for (const k of ['data-taux-en-vigueur', 'data-historique-taux', 'data-nouvelle-version', 'data-effet-reglage']) expect(t.querySelector(`[${k}]`), k).not.toBeNull();
  });
  it('la fiche d’un externe : autres téléphones, notes ; le récapitulatif des seuls champs modifiés ; « Confirmer » envoie avec la version lue', async () => {
    await annuaire();
    await clic(bouton(4, 'fiche'));
    const f = container.querySelector('[data-apporteur="4"] [data-panneau="fiche"]')!;
    expect((f.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true);
    await clic(f.querySelector('[data-fiche-civilite]')!);
    await clic(f.querySelector('[data-liste-choix] [data-option="Mme"]')!);
    await clic(f.querySelector('[data-ajouter-autre="telephones"]')!);
    await saisir(f.querySelector('[data-autre="telephones-0"]')!, '01 00 00 00 01');
    await saisir(f.querySelector('[data-fiche-notes]')!, 'Rencontrée au salon');
    await clic(f.querySelector('[data-enregistrer-fiche]')!);
    expect(posts).toEqual([]);
    expect([...f.querySelectorAll('[data-recap-champ]')].map((x) => x.textContent)).toEqual(['Civilité : — → Mme', 'Autres téléphones : — → 01 00 00 00 01', 'Notes : — → Rencontrée au salon']);
    await clic(f.querySelector('[data-recap-confirmer]')!);
    expect(posts).toEqual([{ action: 'fiche-apporteur', apporteurId: 4, version: 'v1', fiche: expect.objectContaining({ civilite: 'Mme', telephonesAutres: ['01 00 00 00 01'], notes: 'Rencontrée au salon' }) }]);
  });
  it('🔴 conflit : le refus du serveur est dit, « Recharger » est proposé', async () => {
    reponseFiche = { status: 409, corps: { etat: 'conflit', motif: 'Cette fiche a été modifiée par Paul Collègue le 24/10/2026 à 14:05 depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.' } };
    await annuaire();
    await clic(bouton(4, 'fiche'));
    const f = container.querySelector('[data-apporteur="4"] [data-panneau="fiche"]')!;
    await saisir(f.querySelector('[data-fiche-adresse]')!, '3 rue des Essais');
    await clic(f.querySelector('[data-enregistrer-fiche]')!);
    await clic(f.querySelector('[data-recap-confirmer]')!);
    expect(f.querySelector('[data-refus-local]')?.textContent).toMatch(/modifiée par Paul Collègue.*Rien n’a été enregistré/);
    expect(f.querySelector('[data-recharger-fiche]')).not.toBeNull();
  });
  it('un INTERNE : Fiche en lecture seule (son compte) ; Rattachement réduit — aucun champ', async () => {
    await annuaire();
    await clic(bouton(9, 'fiche'));
    const f = container.querySelector('[data-apporteur="9"] [data-panneau="fiche"]')!;
    expect([...f.querySelectorAll('dd')].map((x) => x.textContent)).toEqual(['Interne — Collaborateur', 'Marie Interne', 'marie@exemple.fr']);
    expect(f.querySelector('input, textarea, [role="combobox"]')).toBeNull();
    await clic(bouton(9, 'rattachement'));
    const r = container.querySelector('[data-apporteur="9"] [data-panneau="rattachement"]')!;
    expect(r.textContent).toBe('Apporteur interne — pas de rattachement.');
    expect(r.querySelector('input, button, [role="combobox"]')).toBeNull();
  });
});
