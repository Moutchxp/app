import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ AUDIT POINT 9 (15/10/2026) — LE MAIL D'ACCEPTATION D'UNE TÂCHE EXIGE LE DROIT D'ENVOI AU NOM DE gestion@ ══════════════
 * Le trou : créer une tâche confiée à quelqu'un (ou lui renvoyer la demande) envoyait un mail AU NOM DE gestion@, même pour
 * un collaborateur qui n'a pas le droit d'écrire au nom de l'agence (seul le réglage global le conditionnait).
 * Désormais, sans ce droit : la tâche est créée, la demande reste en attente et visible dans « Mes tâches », AUCUN mail.
 */
const h = vi.hoisted(() => ({
  envoyerSiBesoin: vi.fn(),
  peutEnvoyer: vi.fn(),
  creerTache: vi.fn(),
  renvoyerDemande: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: vi.fn(async () => ({ id: 3, libelle: 'lea@x.fr' })) }));
vi.mock('../../../../../lib/gestion/schema', () => ({ tachesDisponibles: vi.fn(async () => true), piecesTacheDisponible: vi.fn(async () => false) }));
vi.mock('../../../../../lib/gestion/taches', () => ({
  verifierSaisie: () => null, lireSaisie: () => ({ pieces: [] }), dureeValide: () => null, lireIdsDrive: () => [],
  estHeureValide: () => true, estJourValide: () => true, RACCOURCIS_DECALAGE: {},
}));
vi.mock('../../../../../lib/gestion/tachesRepo', () => ({
  creerTache: h.creerTache, listerTaches: vi.fn(), renvoyerDemande: h.renvoyerDemande,
  actualiserContact: vi.fn(), ajouterPieces: vi.fn(), annulerTache: vi.fn(), retirerPiece: vi.fn(), decalerTache: vi.fn(),
  lireTache: vi.fn(), marquerFaite: vi.fn(), modifierTache: vi.fn(), rouvrirTache: vi.fn(),
}));
vi.mock('../../../../../lib/gestion/jetonCollaborateur', () => ({ jetonPourRequete: vi.fn() }));
vi.mock('../../../../../lib/gestion/tachesDrive', () => ({ relirePieces: vi.fn() }));
vi.mock('../../../../../lib/gestion/acceptationRepo', () => ({ envoyerSiBesoin: h.envoyerSiBesoin }));
vi.mock('../../../../../lib/gestion/agendaSynchroRepo', () => ({
  declencherReprise: vi.fn(), synchroniserApresGeste: vi.fn(async () => ''), reessayerSynchro: vi.fn(), phraseSynchro: () => '',
}));
vi.mock('../../../../../lib/gestion/gardeEnvoi', () => ({ peutEnvoyerAuNomDeGestion: h.peutEnvoyer }));

import { POST } from './route';
import { PATCH } from './[id]/route';

const DEMANDE = { statut: 'en_attente', jeton: 'jeton-demande', demandeId: 9 };
const creation = () => new Request('http://local/api/admin/gestion/taches', { method: 'POST', body: JSON.stringify({ lotId: 12, objet: 'Visite' }) });
const renvoi = () => new Request('http://local/api/admin/gestion/taches/4', { method: 'PATCH', body: JSON.stringify({ geste: 'renvoyerDemande' }) });
const ctx = { params: Promise.resolve({ id: '4' }) };

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.creerTache.mockResolvedValue({ ok: true, id: 4, demande: DEMANDE });
  h.renvoyerDemande.mockResolvedValue({ ok: true, id: 4, demande: DEMANDE });
  h.envoyerSiBesoin.mockResolvedValue('envoye');
});

describe('mail d’acceptation de tâche et droit d’envoi (point 9)', () => {
  it('création par un compte SANS droit d’envoi → tâche créée, AUCUN mail, et le message le dit', async () => {
    h.peutEnvoyer.mockResolvedValue(false);
    const res = await POST(creation());
    expect(res.status).toBe(200);
    expect(h.envoyerSiBesoin).not.toHaveBeenCalled();
    const { message } = await res.json();
    expect(message).toContain('en attente d’acceptation');
    expect(message).toContain('pas de mail');
    expect(message).toContain('Mes tâches');
  });

  it('renvoi de la demande par un compte SANS droit d’envoi → aucun mail', async () => {
    h.peutEnvoyer.mockResolvedValue(false);
    const res = await PATCH(renvoi(), ctx);
    expect(res.status).toBe(200);
    expect(h.envoyerSiBesoin).not.toHaveBeenCalled();
    expect((await res.json()).message).toContain('pas de mail');
  });

  it('AVEC le droit (administrateur, ou collaborateur autorisé) → mail comme avant', async () => {
    h.peutEnvoyer.mockResolvedValue(true);
    const res = await POST(creation());
    expect(h.envoyerSiBesoin).toHaveBeenCalledWith(DEMANDE);
    expect((await res.json()).message).toContain('demande envoyée par mail');
    h.envoyerSiBesoin.mockClear();
    await PATCH(renvoi(), ctx);
    expect(h.envoyerSiBesoin).toHaveBeenCalledWith(DEMANDE);
  });

  it('tâche acceptée d’office (confiée à soi-même : pas de jeton) → ni mail ni question de droit', async () => {
    h.creerTache.mockResolvedValue({ ok: true, id: 4, demande: { statut: 'acceptee', jeton: null, demandeId: 9 } });
    const res = await POST(creation());
    expect(h.peutEnvoyer).not.toHaveBeenCalled();
    expect(h.envoyerSiBesoin).not.toHaveBeenCalled();
    expect((await res.json()).message).toBe('Tâche créée.');
  });
});
