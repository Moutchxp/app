// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';

/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES — « INVITER AUSSI » DANS LA FENÊTRE DE CRÉATION / MODIFICATION ════════════════
 * Plusieurs collaborateurs choisis en même temps ; « Confiée à » reste le premier (le champ existant ne bouge pas).
 * Sans la migration 365 (le serveur ne dit pas `invites`), la case n'existe pas et rien de nouveau ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let envois: Record<string, unknown>[];
let avecInvites: boolean;
let avecEvenements: boolean;
let reprise: boolean;
let container: HTMLDivElement;
const invite = (inviteId: number, libelle: string, statut: string, principal = false) => ({
  inviteId, collaborateurId: inviteId, libelle, principal, statut, automatique: false, motif: statut === 'refusee' ? 'Congé' : null,
  reponduLe: null, demandeLe: '2026-10-17T08:00:00Z', mailEtat: 'envoye', dernierRenvoiLe: null,
});
const TACHE_3_INVITES = {
  id: 9, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union, Paris', evenement: null, objet: 'Visite d’entrée',
  note: null, jour: '2026-10-21', heure: '14:30', rappels: [], etat: 'a_faire', confieeA: 4, confieeALibelle: 'Emma Essai',
  creeLe: '2026-10-17T08:00:00Z', creeParLibelle: 'Arnaud Jorel', majLe: '2026-10-17T08:00:00Z', faiteLe: null,
  faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0,
  // Le « Confiée à » a accepté, un autre n'a pas répondu : la tâche est EN ATTENTE (le constat d'Arno).
  acceptation: { statut: 'acceptee', automatique: false, destinataireId: 4, destinataireLibelle: 'Emma Essai', demandeurId: 2,
    demandeurLibelle: 'Arnaud Jorel', demandeLe: '2026-10-17T08:00:00Z', reponduLe: '2026-10-17T09:00:00Z',
    reponduParLibelle: 'Emma Essai', motif: null, mailEtat: 'envoye', mailLe: null },
  invites: [invite(4, 'Emma Essai', 'acceptee', true), invite(5, 'Félix Essai', 'en_attente'), invite(6, 'Gaspard Essai', 'refusee')],
};
let root: Root;

beforeEach(() => {
  envois = [];
  avecInvites = true;
  avecEvenements = false;
  reprise = false;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    if (init?.method && init.method !== 'GET') {
      envois.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return Response.json({ etat: 'ok', id: 7, message: 'Tâche créée.' });
    }
    if (url.includes('collaborateurs')) {
      return Response.json({ etat: 'ok', moi: 2, ...(avecInvites ? { invites: true } : {}), collaborateurs: [
        { id: 2, libelle: 'Arnaud Jorel', accesGestion: true }, { id: 4, libelle: 'Emma Essai', accesGestion: true },
        { id: 5, libelle: 'Félix Essai', accesGestion: false },
      ] });
    }
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    if (url.endsWith('/taches/9')) return Response.json({ etat: 'ok', tache: TACHE_3_INVITES, traces: [], contacts: [], pieces: [] });
    if (url.includes('/taches/evenements')) {
      return avecEvenements ? Response.json({ etat: 'ok', reprise, evenements: [
        { id: 11, reference: 'GES-2026-000011', objet: 'Fuite (du bien)', duBien: true },
        { id: 12, reference: 'GES-2026-000012', objet: 'Ascenseur', duBien: false },
        { id: 13, reference: 'GES-2026-000013', objet: 'Toiture', duBien: false },
      ] }) : Response.json({ etat: 'sans_schema' });
    }
    if (url.includes('evenements')) return Response.json({ etat: 'ok', evenements: [] });
    return Response.json({});
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const ouvrir = async () => {
  await act(async () => {
    root.render(createElement(FenetreTache, { mode: { sorte: 'creer', lotId: 27, lotCle: '26', adresse: 'x' }, onFermer: () => {} }));
  });
  await calmer();
};
const ecrireObjet = async (texte: string) => {
  const input = container.querySelector('.tchf-corps input[type="text"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texte);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const enregistrer = async () => {
  const b = [...container.querySelectorAll<HTMLButtonElement>('button')].find((x) => /Enregistrer|Créer/.test(x.textContent ?? ''))!;
  await act(async () => { b.click(); });
  await calmer();
};

describe('« Inviter aussi »', () => {
  it('propose les autres collaborateurs (pas « Confiée à ») ; les cochés partent avec la tâche', async () => {
    await ouvrir();
    const cases = [...container.querySelectorAll<HTMLInputElement>('[data-invite-choix]')];
    expect(cases.map((c) => c.dataset.inviteChoix)).toEqual(['4', '5']);
    expect(container.querySelector('.tchf-invites-choix legend')?.textContent).toContain('chacun reçoit sa propre invitation');
    await act(async () => { cases[0].click(); });
    await act(async () => { cases[1].click(); });
    await ecrireObjet('Visite technique');
    await enregistrer();
    expect(envois).toHaveLength(1);
    expect(envois[0]).toMatchObject({ confieeA: 2, invites: [4, 5] });
  });

  it('sans la migration 365 : pas de case, et le corps envoyé est celui d’avant (aucun champ `invites`)', async () => {
    avecInvites = false;
    await ouvrir();
    expect(container.querySelector('[data-invite-choix]')).toBeNull();
    await ecrireObjet('Visite technique');
    await enregistrer();
    expect(envois).toHaveLength(1);
    expect('invites' in envois[0]).toBe(false);
  });
});

describe('🔴 LOT GESTION-TACHES-EVENEMENTS — rattacher à des événements en cours', () => {
  it('tâche d’un bien : ses événements ouverts proposés d’office ; reprise pas faite : « Événement du bien lié » reste là', async () => {
    avecEvenements = true;
    await ouvrir();
    const groupes = [...container.querySelectorAll('[data-evenements-du-bien]')].map((g) => g.querySelector('.tchf-aide')?.textContent);
    expect(groupes).toEqual(['Événements de ce bien']);
    expect(container.querySelector('.tchf-corps')?.textContent).toContain('Événement du bien lié (facultatif)');
    // 🔴 LOT GESTION-RECHERCHE-EVENEMENTS — la liste de TOUS les événements en cours est remplacée par la recherche.
    const cases = [...container.querySelectorAll<HTMLInputElement>('[data-evenement-choix]')];
    expect(cases.map((c) => c.dataset.evenementChoix)).toEqual(['11']);
    expect(container.querySelector('[data-recherche-evenements]')).not.toBeNull();
    await act(async () => { cases[0].click(); });
    expect(container.querySelector('[data-etiquette-evenement="11"]')?.textContent).toContain('GES-2026-000011 — Fuite (du bien)');
    await ecrireObjet('Visite technique');
    await enregistrer();
    expect(envois[0]).toMatchObject({ evenements: [11] });
  });
  it('sans la migration 366 : pas de sélecteur, et aucun champ `evenements` envoyé', async () => {
    await ouvrir();
    expect(container.querySelector('.tchf-evenements')).toBeNull();
    await ecrireObjet('Visite technique');
    await enregistrer();
    expect('evenements' in envois[0]).toBe(false);
  });
});

describe('🔴 LOT GESTION-TACHES-EVENEMENTS-FUSION — l’ancien champ fusionné dans le sélecteur', () => {
  it('reprise faite (367) : « Événement du bien lié » ne s’affiche plus ; le sélecteur reste', async () => {
    avecEvenements = true; reprise = true;
    await ouvrir();
    expect(container.querySelector('.tchf-corps')?.textContent).not.toContain('Événement du bien lié');
    expect(container.querySelector('.tchf-evenements')).not.toBeNull();
  });
});

describe('🔴 LOT GESTION-STATUTS-TACHES — le statut global en tête de la fenêtre', () => {
  it('« Statut de la tâche » : le badge de la carte (règle statutTache), AU-DESSUS de l’état du « Confiée à » et des invités', async () => {
    await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'detail', id: 9 }, onFermer: () => {} })); });
    await calmer();
    const statut = container.querySelector('[data-statut-tache]')!;
    expect(statut.textContent).toBe('Statut de la tâche ⏳ En attente· 1 acceptée sur 3· 1/3');
    expect(statut.querySelector('[data-acceptation]')?.getAttribute('data-acceptation')).toBe('en_attente');
    const confiee = container.querySelector('.tchf-acceptation[data-acceptation]')!;
    const invites = container.querySelector('.tchf-invites')!;
    expect(confiee.textContent).toContain('✓ Acceptée'); // l'état du « Confiée à », nommé, reste là
    expect(statut.compareDocumentPosition(confiee) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(statut.compareDocumentPosition(invites) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
