// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InvitesTache } from './InvitesTache';
import type { Tache } from '../../../../lib/gestion/taches';
import type { InviteTache } from '../../../../lib/gestion/acceptationTache';
import type { GesteTache } from './tachesClient';

/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES — LA LISTE DES INVITÉS (carte et fenêtre) ═══════════════════════════════════
 * Chaque invité avec son état et « N acceptées sur M » ; « Changer le destinataire » sur un invité en attente, jamais
 * sur un invité qui a accepté (la ligne dit comment le retirer). Le vrai composant ; la liste des collaborateurs simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const invite = (p: Partial<InviteTache>): InviteTache => ({
  inviteId: 1, collaborateurId: 2, libelle: 'X', principal: false, statut: 'en_attente', automatique: false, motif: null,
  reponduLe: null, demandeLe: null, mailEtat: 'envoye', dernierRenvoiLe: null, ...p,
});
const tache = (invites: InviteTache[]): Tache => ({
  id: 7, lotId: 27, lotCle: '26', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'Visite', note: null,
  jour: '2026-10-21', heure: '14:30', rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Claire', creeLe: '',
  creeParLibelle: '', majLe: '', faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, invites,
});

let container: HTMLDivElement;
let root: Root;
let gestes: GesteTache[];
beforeEach(() => {
  gestes = [];
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({
    etat: 'ok', moi: 1, invites: true,
    collaborateurs: [{ id: 2, libelle: 'Claire' }, { id: 4, libelle: 'Emma' }, { id: 5, libelle: 'Félix' }, { id: 6, libelle: 'Gaspard' }],
  })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

const rendre = async (t: Tache, terminee = false) => {
  await act(async () => {
    root.render(createElement(InvitesTache, { tache: t, terminee, occupe: false, agir: async (g: GesteTache) => { gestes.push(g); } }));
  });
};
const ligne = (id: number) => container.querySelector(`[data-invite="${id}"]`) as HTMLElement;

describe('les invités, leur état, le résumé', () => {
  const t = tache([
    invite({ inviteId: 11, collaborateurId: 2, libelle: 'Claire', principal: true, statut: 'acceptee' }),
    invite({ inviteId: 12, collaborateurId: 4, libelle: 'Emma', statut: 'refusee', motif: 'Pas disponible' }),
    invite({ inviteId: 13, collaborateurId: 5, libelle: 'Félix', statut: 'en_attente' }),
  ]);

  it('chaque invité avec son badge, le motif d’un refus, et « 1 acceptée sur 3 »', async () => {
    await rendre(t);
    expect(container.querySelector('[data-resume]')?.textContent).toBe('1 acceptée sur 3');
    expect(ligne(11).textContent).toContain('Claire');
    expect(ligne(11).textContent).toContain('confiée à');
    expect(ligne(11).textContent).toContain('✓ Acceptée');
    expect(ligne(12).textContent).toContain('✗ Refusée');
    expect(ligne(12).textContent).toContain('Motif : Pas disponible');
    expect(ligne(13).textContent).toContain('⏳ En attente');
  });

  it('« Changer le destinataire » : sur l’invité en attente ; jamais sur l’accepté (qui dit comment le retirer)', async () => {
    await rendre(t);
    expect(ligne(11).querySelector('[data-action="changer-destinataire"]')).toBeNull();
    expect(ligne(11).textContent).toContain('« Modifier », puis décochez-la');
    expect(ligne(13).querySelector('[data-action="changer-destinataire"]')).not.toBeNull();
  });

  it('choisir un autre collaborateur (pas un invité déjà là) puis Valider → le geste part avec l’invité et le nouveau', async () => {
    await rendre(t);
    await act(async () => { (ligne(13).querySelector('[data-action="changer-destinataire"]') as HTMLButtonElement).click(); });
    const select = ligne(13).querySelector('[data-champ-nouveau-destinataire]') as HTMLSelectElement;
    const proposes = [...select.options].map((o) => o.textContent);
    expect(proposes).toEqual(['— nouveau destinataire —', 'Gaspard']);
    await act(async () => {
      select.value = '6';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const valider = [...ligne(13).querySelectorAll('button')].find((b) => b.textContent === 'Valider') as HTMLButtonElement;
    await act(async () => { valider.click(); });
    expect(gestes).toEqual([{ geste: 'changerDestinataire', inviteId: 13, collaborateurId: 6 }]);
  });

  it('une tâche terminée n’offre aucun geste ; sans invités, rien n’est rendu', async () => {
    await rendre(t, true);
    expect(container.querySelector('[data-action="changer-destinataire"]')).toBeNull();
    await rendre(tache([]));
    expect(container.querySelector('.tch-invites')).toBeNull();
  });
});

describe('🔴 LOT 2 — « Renvoyer l’invitation »', () => {
  it('sur chaque invité en attente seulement ; le geste part avec l’invité', async () => {
    await rendre(tache([
      invite({ inviteId: 21, collaborateurId: 2, libelle: 'Claire', principal: true, statut: 'acceptee' }),
      invite({ inviteId: 22, collaborateurId: 4, libelle: 'Emma', statut: 'en_attente' }),
      invite({ inviteId: 23, collaborateurId: 5, libelle: 'Félix', statut: 'refusee', motif: 'non' }),
    ]));
    expect(ligne(21).querySelector('[data-action="renvoyer-invitation"]')).toBeNull();
    expect(ligne(23).querySelector('[data-action="renvoyer-invitation"]')).toBeNull();
    const b = ligne(22).querySelector('[data-action="renvoyer-invitation"]') as HTMLButtonElement;
    expect(b.textContent).toBe('Renvoyer l’invitation');
    await act(async () => { b.click(); });
    expect(gestes).toEqual([{ geste: 'renvoyerInvitation', inviteId: 22 }]);
  });
});
