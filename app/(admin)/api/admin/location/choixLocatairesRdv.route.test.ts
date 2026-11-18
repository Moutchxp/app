import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (18/11/2026, 2e lot) — « Envoyer l'invitation aux locataires : Oui / Non », pour TOUS les rendez-vous d'un préavis (pré-visite ET état
 * des lieux de sortie). Le COMPORTEMENT de la route : sans choix → refus, rien n'est écrit ; « Non » → le rendez-vous est planifié, AUCUN mail aux
 * locataires, le choix est journalisé ; « Oui » → l'invitation des locataires part. Le collègue (mécanisme des tâches) est appelé dans les deux cas.
 * Base, droits et écritures simulés.
 */
vi.mock('../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [] })), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/location/garde', () => ({ exigerLocation: async () => ({ utilisateur: { id: 2 } }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'Arnaud Jorel' }) }));
vi.mock('../../../../lib/location/preavisTestRepo', () => ({
  perimetreDuGeste: async () => ({ ok: true, perimetre: null }), creerPreavisTest: vi.fn(), supprimerPreavisTest: vi.fn(), testDisponible: vi.fn(),
}));
const h = vi.hoisted(() => ({
  planifierEdls: vi.fn(), deplacerEdls: vi.fn(), programmerPrevisite: vi.fn(), deplacerPrevisite: vi.fn(),
  envoyerMailLocatairesEdls: vi.fn(), envoyerMailLocatairesPrevisite: vi.fn(), confirmerSansDemande: vi.fn(), envoyerAuxInvites: vi.fn(), envoyerSiAutorise: vi.fn(),
}));
vi.mock('../../../../lib/location/edlsRepo', () => ({
  planifierEdls: (...a: unknown[]) => h.planifierEdls(...a), deplacerEdls: (...a: unknown[]) => h.deplacerEdls(...a), reattribuerEdls: vi.fn(), confiablesEdls: vi.fn(), apercuEdls: vi.fn(),
}));
vi.mock('../../../../lib/location/previsiteRepo', () => ({
  programmerPrevisite: (...a: unknown[]) => h.programmerPrevisite(...a), deplacerPrevisite: (...a: unknown[]) => h.deplacerPrevisite(...a), reaffecterPrevisite: vi.fn(),
  envoyerMailLocatairesPrevisite: (...a: unknown[]) => h.envoyerMailLocatairesPrevisite(...a),
  apercuCompteRendu: vi.fn(), apercuRdvPrevisite: vi.fn(), apercuRefus: vi.fn(), avecPrevisites: vi.fn(), collegesPrevisite: vi.fn(),
  destinatairesCompteRendu: vi.fn(), envoyerCompteRendu: vi.fn(), envoyerRefus: vi.fn(), texteRefusPropose: vi.fn(),
}));
vi.mock('../../../../lib/location/reponsesRdvRepo', () => ({
  envoyerMailLocatairesEdls: (...a: unknown[]) => h.envoyerMailLocatairesEdls(...a), confirmerSansDemande: (...a: unknown[]) => h.confirmerSansDemande(...a),
  apercuLocatairesEdls: vi.fn(), avecReponsesRdv: vi.fn(), validerRdvALaMain: vi.fn(), versionRdv: vi.fn(),
}));
vi.mock('../../../../lib/gestion/acceptationAutorisee', () => ({
  envoyerAuxInvites: (...a: unknown[]) => h.envoyerAuxInvites(...a), envoyerSiAutorise: (...a: unknown[]) => h.envoyerSiAutorise(...a),
}));
vi.mock('../../../../lib/gestion/agendaSynchroRepo', () => ({ synchroniserApresGeste: async () => '' }));
vi.mock('../../../../lib/location/preavisTestInvitation', () => ({ planifierInvitationTest: vi.fn() }));

import { POST } from './route';

const post = (corps: unknown) => POST(new Request('http://localhost/api/admin/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }));
const RDV = { occupationIds: [553], jour: '2026-11-25', debut: '14:00', fin: '15:00' };
const GESTES = [
  { sorte: 'edl', action: 'planifier-edls', corps: { ...RDV, confieA: 3 }, ecriture: () => h.planifierEdls, envoi: () => h.envoyerMailLocatairesEdls },
  { sorte: 'edl', action: 'deplacer-edls', corps: { ...RDV, confieA: 3 }, ecriture: () => h.deplacerEdls, envoi: () => h.envoyerMailLocatairesEdls },
  { sorte: 'previsite', action: 'programmer-previsite', corps: { ...RDV, destinataires: [3] }, ecriture: () => h.programmerPrevisite, envoi: () => h.envoyerMailLocatairesPrevisite },
  { sorte: 'previsite', action: 'deplacer-previsite', corps: RDV, ecriture: () => h.deplacerPrevisite, envoi: () => h.envoyerMailLocatairesPrevisite },
] as const;

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  const edl = { etat: 'ok', tacheId: 60, data: {}, demande: { statut: 'en_attente', destinataireLibelle: 'Collègue ESSAI' } };
  h.planifierEdls.mockResolvedValue(edl);
  h.deplacerEdls.mockResolvedValue(edl);
  const pv = { etat: 'ok', data: { previsiteId: 1, tacheId: 34, rdv: { jour: '2026-11-25', heure: '14:00', dureeMinutes: 60 }, ancien: null, occupationIds: [553] }, demandes: [] };
  h.programmerPrevisite.mockResolvedValue(pv);
  h.deplacerPrevisite.mockResolvedValue(pv);
  h.envoyerMailLocatairesEdls.mockResolvedValue({ envois: [{ sorte: 'edls_locataires', objet: 'o', a: ['paul@exemple.test'], cc: [], envoye: true, motif: null }], sansEmail: [] });
  h.envoyerMailLocatairesPrevisite.mockResolvedValue({ envois: [{ sorte: 'previsite_locataires', objet: 'o', a: ['paul@exemple.test'], cc: [], envoye: true, motif: null }], sansEmail: [] });
  h.envoyerSiAutorise.mockResolvedValue('envoye');
  h.envoyerAuxInvites.mockResolvedValue([{ destinataire: 'Collègue ESSAI', etat: 'envoye' }]);
  h.confirmerSansDemande.mockResolvedValue(true);
});

describe.each(GESTES)('🔴 « $action » (mêmes règles pour la pré-visite et pour l’état des lieux)', (g) => {
  it('sans choix : refusé (400), RIEN n’est écrit ni envoyé', async () => {
    const r = await post({ action: g.action, ...g.corps });
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ etat: 'refus', champ: 'locataires' });
    expect(g.ecriture()).not.toHaveBeenCalled();
    expect(g.envoi()).not.toHaveBeenCalled();
  });
  it('« Non » : le rendez-vous est planifié, AUCUN mail aux locataires, il est confirmé côté locataires (auteur journalisé) ; le collègue reçoit toujours son invitation', async () => {
    const r = await post({ action: g.action, ...g.corps, locataires: 'non' });
    const d = await r.json() as { etat: string; data: Record<string, unknown> };
    expect(d).toMatchObject({ etat: 'ok', data: { locataires: [], choixLocataires: 'non' } });
    // 🔴 le COLLÈGUE (un autre que soi) reste « En attente » : son invitation Accepter / Refuser part comme avant
    if (g.sorte === 'edl') expect(d.data.statut).toBe('en_attente');
    else expect(d.data.collegues).toEqual([{ destinataire: 'Collègue ESSAI', etat: 'envoye' }]);
    expect(g.ecriture()).toHaveBeenCalledOnce();
    expect(g.envoi()).not.toHaveBeenCalled();
    expect(h.confirmerSansDemande).toHaveBeenCalledWith(g.sorte, g.sorte === 'edl' ? 60 : 34, [553], { id: 2, libelle: 'Arnaud Jorel' });
    expect(h.envoyerSiAutorise.mock.calls.length + h.envoyerAuxInvites.mock.calls.length).toBe(1);
  });
  it('« Oui » : l’invitation des locataires part (avec leurs boutons), rien n’est confirmé d’office (comportement inchangé)', async () => {
    const r = await post({ action: g.action, ...g.corps, locataires: 'oui' });
    const d = await r.json() as { etat: string; data: { locataires: { a: string[] }[] } };
    expect(d.etat).toBe('ok');
    expect(d.data.locataires.map((m) => m.a)).toEqual([['paul@exemple.test']]);
    expect(g.envoi()).toHaveBeenCalledOnce();
    expect(h.confirmerSansDemande).not.toHaveBeenCalled();
  });
});
