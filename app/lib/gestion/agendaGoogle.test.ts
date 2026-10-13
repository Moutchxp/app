import { describe, expect, it } from 'vitest';
import { AppelAgendaRefuse, BASE_AGENDA, creerPorteAgenda, fetchAgendaGarde, refusAppelAgenda } from './agendaGoogle';
import { creerFauxGoogle, jetonFactice } from './agendaFauxGoogle';
import { construireEvenement, MARQUE_APPLICATION, type ContenuTache } from './agendaTache';
import { motRappel } from './taches';

/**
 * LOT TACHES-AGENDA — 🔴🔴 LE GARDE-FOU, CODÉ ET ÉPROUVÉ : l'application ne crée, ne modifie et ne supprime QUE ses
 * propres événements ; elle ne lit, ne modifie et ne supprime JAMAIS les autres. Tout passe par le FAUX Google :
 * aucun appel réel.
 */
const A = 'a.jorel@sansvisavis.com';
const ev = (id: number) => construireEvenement({
  id, objet: 'Visite', texte: '', jour: '2026-10-14', heure: null, dureeMinutes: null, rappels: [], faite: false, lotId: 27,
  adresse: '7 avenue de l’Union', codePostal: null, commune: 'Asnières', pieces: [],
} satisfies ContenuTache, { motRappel });
const E = (a: string) => `${BASE_AGENDA}${encodeURIComponent(a)}/events`;

describe('🔴 le verrou du fetch : refus AVANT tout envoi', () => {
  it('refuse toute adresse hors des événements (liste des agendas, partages, réglages, autre API)', () => {
    expect(refusAppelAgenda('https://www.googleapis.com/calendar/v3/users/me/calendarList', 'GET', null)).not.toBeNull();
    expect(refusAppelAgenda(`${BASE_AGENDA}${encodeURIComponent(A)}/acl`, 'GET', null)).not.toBeNull();
    expect(refusAppelAgenda(`${BASE_AGENDA}${encodeURIComponent(A)}`, 'GET', null)).not.toBeNull();
    expect(refusAppelAgenda(`${E(A)}/import`, 'POST', null)).not.toBeNull();
    expect(refusAppelAgenda(`${E(A)}/abc/move?destination=x`, 'POST', null)).not.toBeNull();
    expect(refusAppelAgenda(`${E(A)}/abc/instances`, 'GET', null)).not.toBeNull();
    expect(refusAppelAgenda(`${E(A)}/watch`, 'POST', ev(1))).not.toBeNull();
    expect(refusAppelAgenda('https://www.googleapis.com/drive/v3/files', 'GET', null)).not.toBeNull();
  });
  it('refuse de LISTER un agenda sans le filtre de la marque : on ne lit pas les rendez-vous des gens', () => {
    expect(refusAppelAgenda(E(A), 'GET', null)).toMatch(/filtre/);
    expect(refusAppelAgenda(`${E(A)}?timeMin=2026-01-01T00:00:00Z`, 'GET', null)).toMatch(/filtre/);
    expect(refusAppelAgenda(`${E(A)}?privateExtendedProperty=${encodeURIComponent(`svavApp=${MARQUE_APPLICATION}`)}`, 'GET', null)).toBeNull();
  });
  it('refuse une création ou une modification sans la marque, et PUT', () => {
    expect(refusAppelAgenda(E(A), 'POST', { summary: 'x' })).toMatch(/marque/);
    expect(refusAppelAgenda(`${E(A)}/abc`, 'PATCH', { summary: 'x' })).toMatch(/marque/);
    expect(refusAppelAgenda(`${E(A)}/abc`, 'PUT', ev(1))).toMatch(/PUT/);
    expect(refusAppelAgenda(E(A), 'POST', ev(1))).toBeNull();
  });
  it('le fetch gardé lève, et rien ne part', async () => {
    const faux = creerFauxGoogle();
    await expect(fetchAgendaGarde(faux.fetch)(E(A), { method: 'GET' })).rejects.toBeInstanceOf(AppelAgendaRefuse);
    expect(faux.appels).toEqual([]);
  });
});

describe('🔴🔴 la porte ne touche QUE nos événements', () => {
  const porte = (faux = creerFauxGoogle()) => ({ faux, p: creerPorteAgenda({ jeton: jetonFactice, fetch: faux.fetch }) });

  it('crée, modifie, supprime le nôtre ; sans mail (sendUpdates=none)', async () => {
    const { faux, p } = porte();
    const c = await p.creer(A, 41, ev(41));
    expect(c.ok).toBe(true);
    const id = (c as { id: string }).id;
    expect((await p.modifier(A, id, 41, { ...ev(41), summary: 'nouveau' })).ok).toBe(true);
    expect(faux.agendas.get(A)?.get(id)?.summary).toBe('nouveau');
    expect((await p.supprimer(A, id, 41)).ok).toBe(true);
    expect(faux.agendas.get(A)?.has(id)).toBe(false);
    expect(faux.appels.filter((x) => x.methode !== 'GET').every((x) => x.url.includes('sendUpdates=none'))).toBe(true);
  });

  it('un vrai rendez-vous (sans marque) n’est NI modifié NI supprimé, même par son identifiant', async () => {
    const { faux, p } = porte();
    const etranger = faux.semer(A, { summary: 'Dentiste', start: { dateTime: '2026-10-14T10:00:00' } });
    const avant = faux.instantane();
    expect(await p.supprimer(A, etranger, 41)).toMatchObject({ ok: false, sorte: 'refus_garde' });
    expect(await p.modifier(A, etranger, 41, ev(41))).toMatchObject({ ok: false, sorte: 'refus_garde' });
    expect(faux.instantane()).toBe(avant);
    expect(faux.appels.filter((x) => x.methode !== 'GET')).toEqual([]);
  });

  it('l’événement d’une AUTRE tâche n’est pas touché non plus', async () => {
    const { faux, p } = porte();
    const autre = (await p.creer(A, 99, ev(99))) as { id: string };
    const avant = faux.instantane();
    expect(await p.supprimer(A, autre.id, 41)).toMatchObject({ sorte: 'refus_garde' });
    expect(faux.instantane()).toBe(avant);
  });

  it('chercher ne rend QUE nos événements de cette tâche', async () => {
    const { faux, p } = porte();
    faux.semer(A, { summary: 'Réunion' });
    faux.semer(A, { summary: 'Usurpé', extendedProperties: { shared: { svavApp: MARQUE_APPLICATION, svavTacheId: '41' } } });
    const n = (await p.creer(A, 41, ev(41))) as { id: string };
    await p.creer(A, 42, ev(42));
    expect(await p.chercher(A, 41)).toEqual({ ok: true, ids: [n.id] });
  });

  it('refuse de créer pour une tâche un événement marqué d’une autre', async () => {
    const { p } = porte();
    await expect(p.creer(A, 41, ev(42))).rejects.toBeInstanceOf(AppelAgendaRefuse);
  });

  it('Google en panne : un échec en français, rien n’est levé', async () => {
    const { faux, p } = porte();
    faux.panne = true;
    expect(await p.creer(A, 41, ev(41))).toMatchObject({ ok: false, sorte: 'echec', motif: expect.stringMatching(/indisponible/) });
  });

  it('jeton refusé (compte inconnu du Workspace) : échec dit, aucun appel', async () => {
    const faux = creerFauxGoogle();
    const p = creerPorteAgenda({ jeton: async () => ({ ok: false, motif: 'pas d’agenda Google' }), fetch: faux.fetch });
    expect(await p.creer(A, 41, ev(41))).toEqual({ ok: false, sorte: 'echec', motif: 'pas d’agenda Google' });
    expect(faux.appels).toEqual([]);
  });
});
