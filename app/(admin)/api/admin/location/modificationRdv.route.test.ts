import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (19/11/2026) — règles A, D et J à la route (le reste du fichier : même banc que choixLocatairesRdv.route.test.ts).
 * Arno (18/11/2026, 2e lot) — « Envoyer l'invitation aux locataires : Oui / Non », pour TOUS les rendez-vous d'un préavis (pré-visite ET état
 * des lieux de sortie). Le COMPORTEMENT de la route : sans choix → refus, rien n'est écrit ; « Non » → le rendez-vous est planifié, AUCUN mail aux
 * locataires, le choix est journalisé ; « Oui » → l'invitation des locataires part. Le collègue (mécanisme des tâches) est appelé dans les deux cas.
 * Base, droits et écritures simulés.
 */
vi.mock('../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [] })), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/location/garde', () => ({ exigerLocation: async () => ({ utilisateur: { id: 2 } }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'Arnaud Jorel' }) }));
const perim = vi.hoisted(() => ({ test: null as null | Record<string, unknown> }));
vi.mock('../../../../lib/location/preavisTestRepo', () => ({
  perimetreDuGeste: async () => ({ ok: true, perimetre: perim.test }), creerPreavisTest: vi.fn(), supprimerPreavisTest: vi.fn(), testDisponible: vi.fn(),
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
const m = vi.hoisted(() => ({ etat: null as null | Record<string, unknown>, prevenir: vi.fn(async () => []) }));
vi.mock('../../../../lib/gestion/modificationRdvRepo', () => ({
  tacheDuRdvPreavis: async () => 41, etatDuRdv: async () => m.etat, prevenirCollaborateurInitial: (...a: unknown[]) => m.prevenir(...(a as [])),
}));
vi.mock('../../../../lib/gestion/agendaSynchroRepo', () => ({ synchroniserApresGeste: async () => '' }));
vi.mock('../../../../lib/location/preavisTestInvitation', () => ({ planifierInvitationTest: vi.fn() }));

import { POST } from './route';

const post = (corps: unknown) => POST(new Request('http://localhost/api/admin/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }));
const RDV = { occupationIds: [553], jour: '2099-11-25', debut: '14:00', fin: '15:00', locataires: 'oui' };
beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  m.prevenir.mockClear();
  m.etat = { jour: '2099-11-20', heure: '10:00', dureeMinutes: 60, collaborateurs: [{ id: 4, libelle: 'Claire Test', email: 'claire@exemple.test', agenda: false }], objet: 'x', adresse: null, etat: 'a_faire' };
  const edl = { etat: 'ok', tacheId: 41, data: {}, demande: { statut: 'en_attente', destinataireLibelle: 'Paul Test' } };
  h.deplacerEdls.mockResolvedValue(edl);
  h.deplacerPrevisite.mockResolvedValue({ etat: 'ok', data: { previsiteId: 1, tacheId: 41, rdv: { jour: '2099-11-25', heure: '14:00', dureeMinutes: 60 }, ancien: null, occupationIds: [553] }, demandes: [] });
  h.envoyerMailLocatairesEdls.mockResolvedValue({ envois: [], sansEmail: [] });
  h.envoyerMailLocatairesPrevisite.mockResolvedValue({ envois: [], sansEmail: [] });
  h.envoyerSiAutorise.mockResolvedValue('envoye');
  h.envoyerAuxInvites.mockResolvedValue([]);
});

describe('🔴 A — « Modifier / déplacer » la pré-visite change aussi les collègues', () => {
  it('les collègues choisis partent avec le geste ; puis le collaborateur initial est prévenu (D)', async () => {
    expect(await (await post({ action: 'deplacer-previsite', ...RDV, destinataires: [5] })).json()).toMatchObject({ etat: 'ok' });
    expect(h.deplacerPrevisite).toHaveBeenCalledWith(expect.objectContaining({ destinataires: [5] }), expect.anything());
    expect(m.prevenir).toHaveBeenCalledWith(41, m.etat, { id: 2, libelle: 'Arnaud Jorel' });
  });
  it('sans collègues dans la demande : le déplacement seul (comme avant)', async () => {
    await post({ action: 'deplacer-previsite', ...RDV });
    expect(h.deplacerPrevisite.mock.calls[0][0]).not.toHaveProperty('destinataires');
  });
});

describe('🔴 D et J — l’état des lieux', () => {
  it('« Modifier / déplacer » avec un autre collaborateur : le collaborateur initial est prévenu', async () => {
    expect(await (await post({ action: 'deplacer-edls', ...RDV, confieA: 5 })).json()).toMatchObject({ etat: 'ok' });
    expect(m.prevenir).toHaveBeenCalledWith(41, m.etat, { id: 2, libelle: 'Arnaud Jorel' });
  });
  it('🔴 J corrigée — une date PASSÉE mais un rendez-vous encore à faire : modifiable (date, collaborateur, mails)', async () => {
    m.etat = { ...m.etat, jour: '2020-01-01', etat: 'a_faire' };
    expect(await (await post({ action: 'deplacer-edls', ...RDV, confieA: 5 })).json()).toMatchObject({ etat: 'ok' });
    expect(h.deplacerEdls).toHaveBeenCalledOnce();
  });
  it('🔴 J corrigée — un rendez-vous EFFECTUÉ ou ANNULÉ ne se modifie plus : refusé (400), rien n’est écrit', async () => {
    for (const etat of ['faite', 'annulee']) {
      m.etat = { ...m.etat, etat };
      const r = await post({ action: 'deplacer-edls', ...RDV, confieA: 5 });
      expect(r.status).toBe(400);
      expect(await r.json()).toMatchObject({ etat: 'refus', motif: 'Ce rendez-vous est effectué ou annulé : il ne peut plus être modifié.' });
    }
    expect(h.deplacerEdls).not.toHaveBeenCalled();
    expect(m.prevenir).not.toHaveBeenCalled();
  });
});
