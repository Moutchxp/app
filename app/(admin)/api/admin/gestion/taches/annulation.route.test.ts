import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (19/11/2026, choix A) — UNE TÂCHE ANNULÉE DISPARAÎT DES ÉCRANS : la route. Le détail d'une tâche annulée n'est plus servi (404) ; « annuler »
 * prévient les collaborateurs qui avaient accepté, les locataires qui avaient confirmé et les contacts invités, puis resynchronise l'agenda (qui
 * retire l'événement). Les dépendances sont simulées : rien ne part.
 */
const h = vi.hoisted(() => ({
  lireTache: vi.fn(), annulerTache: vi.fn(), prevenirAnnulation: vi.fn(), prevenirLocataires: vi.fn(), envoisAuxContacts: vi.fn(), synchro: vi.fn(),
  lireAvant: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: vi.fn(async () => ({ id: 2, libelle: 'Arnaud Jorel' })) }));
vi.mock('../../../../../lib/gestion/schema', () => ({ tachesDisponibles: vi.fn(async () => true), piecesTacheDisponible: vi.fn(async () => false) }));
vi.mock('../../../../../lib/gestion/tachesRepo', () => ({
  creerTache: vi.fn(), listerTaches: vi.fn(), renvoyerDemande: vi.fn(), actualiserContact: vi.fn(), ajouterPieces: vi.fn(), annulerTache: h.annulerTache,
  retirerPiece: vi.fn(), decalerTache: vi.fn(), lireTache: h.lireTache, marquerFaite: vi.fn(), modifierTache: vi.fn(), rouvrirTache: vi.fn(),
}));
vi.mock('../../../../../lib/gestion/annulationTacheRepo', () => ({ lireAvantAnnulation: h.lireAvant, prevenirAnnulation: h.prevenirAnnulation }));
vi.mock('../../../../../lib/location/annulationRdvLocataires', () => ({ prevenirLocatairesAnnulation: h.prevenirLocataires }));
vi.mock('../../../../../lib/gestion/invitationsContactsAutorisees', () => ({ envoisAuxContacts: h.envoisAuxContacts, lireRetouchesExterieurs: () => ({ ok: true, retouches: {} }) }));
vi.mock('../../../../../lib/gestion/agendaSynchroRepo', () => ({ declencherReprise: vi.fn(), synchroniserApresGeste: h.synchro, reessayerSynchro: vi.fn(), phraseSynchro: () => '' }));
vi.mock('../../../../../lib/location/perimetreRequete', () => ({ dansLePerimetreDuTest: (_r: unknown, f: () => unknown) => f() }));

import { GET, PATCH } from './[id]/route';

const ctx = { params: Promise.resolve({ id: '41' }) };
const AVANT = { titre: 'Pré-visite', rdv: true, adresse: null, jour: '2026-11-20', heure: '10:00', dureeMinutes: 30, reponses: [] };
beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.lireAvant.mockResolvedValue(AVANT);
  h.annulerTache.mockResolvedValue({ ok: true, id: 41 });
  h.prevenirAnnulation.mockResolvedValue([{ destinataire: 'Cédric JULLIEN', etat: 'envoye', objet: '[Copie interne] Rendez-vous annulé — Pré-visite' }]);
  h.prevenirLocataires.mockResolvedValue([{ sorte: 'rdv_annulation_locataires', objet: 'Pré-visite annulée — 1 rue', a: ['loc@exemple.test'], cc: [], texte: '', envoye: true, motif: null }]);
  h.envoisAuxContacts.mockResolvedValue([]);
  h.synchro.mockResolvedValue('');
});

describe('🔴 une tâche annulée a disparu de l’interface', () => {
  it('son détail n’est plus servi : 404 « Tâche introuvable. » (elle reste en base)', async () => {
    h.lireTache.mockResolvedValue({ tache: { id: 41, etat: 'annulee' }, traces: [], contacts: [], pieces: [] });
    const r = await GET(new Request('http://local/api/admin/gestion/taches/41'), ctx);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ erreur: 'Tâche introuvable.' });
    h.lireTache.mockResolvedValue({ tache: { id: 41, etat: 'a_faire' }, traces: [], contacts: [], pieces: [] });
    expect((await GET(new Request('http://local/api/admin/gestion/taches/41'), ctx)).status).toBe(200);
  });
  it('« annuler » : l’état d’AVANT est lu, puis les seuls acceptants sont prévenus, l’agenda resynchronisé, la phrase de confirmation rendue', async () => {
    const r = await PATCH(new Request('http://local/api/admin/gestion/taches/41', { method: 'PATCH', body: JSON.stringify({ geste: 'annuler' }) }), ctx);
    const d = await r.json() as Record<string, unknown>;
    expect(r.status).toBe(200);
    expect(h.lireAvant.mock.invocationCallOrder[0]).toBeLessThan(h.annulerTache.mock.invocationCallOrder[0]);
    expect(h.prevenirAnnulation).toHaveBeenCalledWith(41, AVANT, { id: 2, libelle: 'Arnaud Jorel' });
    expect(h.prevenirLocataires).toHaveBeenCalledWith(41, AVANT, { id: 2, libelle: 'Arnaud Jorel' });
    expect(h.synchro).toHaveBeenCalledWith(41);
    expect(d).toMatchObject({ etat: 'ok', id: 41, collaborateurs: [{ destinataire: 'Cédric JULLIEN', etat: 'envoye' }],
      locataires: [{ sorte: 'rdv_annulation_locataires', envoye: true }],
      message: 'La tâche « Pré-visite » est annulée : elle n’apparaît plus dans l’interface. 2 personnes ont été prévenues par mail.' });
  });
  it('un refus de l’annulation (déjà terminée) : personne n’est prévenu', async () => {
    h.annulerTache.mockResolvedValue({ ok: false, statut: 409, motif: 'Cette tâche n’est plus à faire.' });
    const r = await PATCH(new Request('http://local/api/admin/gestion/taches/41', { method: 'PATCH', body: JSON.stringify({ geste: 'annuler' }) }), ctx);
    expect(r.status).toBe(409);
    expect(h.prevenirAnnulation).not.toHaveBeenCalled();
    expect(h.prevenirLocataires).not.toHaveBeenCalled();
  });
});
