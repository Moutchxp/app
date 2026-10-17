import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴 LOT GESTION-INVITATIONS-TACHES — LA ROUTE DES GESTES SUR UN INVITÉ ══════════════════════════════════════════
 * « Renvoyer l'invitation » : « Invitation renvoyée à … » ou l'erreur RÉELLE du mail (avec sa cause, et le fait que
 * l'ancien lien ne marche plus) ; trop tôt (moins de 2 minutes) : le refus, sans mail. « Changer le destinataire » : un
 * mail au nouvel invité seulement.
 */
const h = vi.hoisted(() => ({
  envoyerSiBesoin: vi.fn(),
  peutEnvoyer: vi.fn(),
  renvoyerInvitation: vi.fn(),
  changerDestinataire: vi.fn(),
  erreurMailDemande: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: vi.fn(async () => ({ id: 2, libelle: 'a.jorel@x.fr' })) }));
vi.mock('../../../../../lib/gestion/schema', () => ({ tachesDisponibles: vi.fn(async () => true) }));
vi.mock('../../../../../lib/gestion/tachesRepo', () => ({
  renvoyerDemande: vi.fn(), actualiserContact: vi.fn(), ajouterPieces: vi.fn(), annulerTache: vi.fn(), retirerPiece: vi.fn(),
  decalerTache: vi.fn(), lireTache: vi.fn(), marquerFaite: vi.fn(), modifierTache: vi.fn(), rouvrirTache: vi.fn(),
}));
vi.mock('../../../../../lib/gestion/invitesRepo', () => ({
  renvoyerInvitation: h.renvoyerInvitation, changerDestinataire: h.changerDestinataire, erreurMailDemande: h.erreurMailDemande,
}));
vi.mock('../../../../../lib/gestion/jetonCollaborateur', () => ({ jetonPourRequete: vi.fn() }));
vi.mock('../../../../../lib/gestion/tachesDrive', () => ({ relirePieces: vi.fn() }));
vi.mock('../../../../../lib/gestion/acceptationRepo', () => ({ envoyerSiBesoin: h.envoyerSiBesoin }));
vi.mock('../../../../../lib/gestion/agendaSynchroRepo', () => ({
  synchroniserApresGeste: vi.fn(async () => ''), reessayerSynchro: vi.fn(), phraseSynchro: () => '',
}));
vi.mock('../../../../../lib/gestion/gardeEnvoi', () => ({ peutEnvoyerAuNomDeGestion: h.peutEnvoyer }));

import { PATCH } from './[id]/route';

const ctx = { params: Promise.resolve({ id: '4' }) };
const geste = (corps: Record<string, unknown>) =>
  new Request('http://local/api/admin/gestion/taches/4', { method: 'PATCH', body: JSON.stringify(corps) });
const DEMANDE = { statut: 'en_attente', jeton: 'j', demandeId: 31, inviteId: 7, destinataireLibelle: 'Emma Essai' };

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.peutEnvoyer.mockResolvedValue(true);
  h.renvoyerInvitation.mockResolvedValue({ ok: true, id: 4, demandes: [DEMANDE], message: 'Invitation renvoyée à Emma Essai.' });
});

describe('« Renvoyer l’invitation »', () => {
  it('mail parti → « Invitation renvoyée à … »', async () => {
    h.envoyerSiBesoin.mockResolvedValue('envoye');
    const res = await PATCH(geste({ geste: 'renvoyerInvitation', inviteId: 7 }), ctx);
    expect(res.status).toBe(200);
    expect(h.renvoyerInvitation).toHaveBeenCalledWith(4, 7, { id: 2, libelle: 'a.jorel@x.fr' });
    expect((await res.json()).message).toBe('Invitation renvoyée à Emma Essai.');
  });

  it('mail en échec → l’erreur RÉELLE, et l’ancien lien ne marche plus', async () => {
    h.envoyerSiBesoin.mockResolvedValue('echec');
    h.erreurMailDemande.mockResolvedValue('Le jeton de gestion@ n’a pas pu être rafraîchi.');
    const res = await PATCH(geste({ geste: 'renvoyerInvitation', inviteId: 7 }), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).erreur).toBe(
      'L’invitation à Emma Essai n’est pas partie : Le jeton de gestion@ n’a pas pu être rafraîchi. Un nouveau lien a été créé ; l’ancien ne fonctionne plus.');
  });

  it('envoi désactivé ou sans droit d’envoi → dit tel quel, jamais « renvoyée »', async () => {
    h.envoyerSiBesoin.mockResolvedValue('desactive');
    const r1 = await PATCH(geste({ geste: 'renvoyerInvitation', inviteId: 7 }), ctx);
    expect((await r1.json()).erreur).toContain('mail non envoyé (envoi désactivé)');
    h.peutEnvoyer.mockResolvedValue(false);
    const r2 = await PATCH(geste({ geste: 'renvoyerInvitation', inviteId: 7 }), ctx);
    expect(r2.status).toBe(502);
    expect((await r2.json()).erreur).toContain('pas de mail');
  });

  it('trop tôt (moins de 2 minutes) → le refus du dépôt, aucun mail', async () => {
    h.renvoyerInvitation.mockResolvedValue({ ok: false, statut: 429, motif: 'L’invitation à Emma Essai vient d’être renvoyée : patientez encore 1 min 20 s avant un nouveau renvoi.' });
    const res = await PATCH(geste({ geste: 'renvoyerInvitation', inviteId: 7 }), ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).erreur).toContain('patientez encore 1 min 20 s');
    expect(h.envoyerSiBesoin).not.toHaveBeenCalled();
  });
});

describe('« Changer le destinataire »', () => {
  it('un mail au nouvel invité, et le message dit qui remplace qui', async () => {
    h.envoyerSiBesoin.mockResolvedValue('envoye');
    h.changerDestinataire.mockResolvedValue({
      ok: true, id: 4, message: 'Destinataire changé : Félix Essai → Gaspard Essai.',
      demandes: [{ ...DEMANDE, destinataireLibelle: 'Gaspard Essai' }],
    });
    const res = await PATCH(geste({ geste: 'changerDestinataire', inviteId: 9, collaborateurId: 6 }), ctx);
    expect(h.changerDestinataire).toHaveBeenCalledWith(4, 9, 6, { id: 2, libelle: 'a.jorel@x.fr' });
    expect((await res.json()).message).toBe('Destinataire changé : Félix Essai → Gaspard Essai. Invitation : Gaspard Essai (envoyée par mail).');
  });
  it('sans nouveau destinataire → refus clair', async () => {
    const res = await PATCH(geste({ geste: 'changerDestinataire', inviteId: 9 }), ctx);
    expect(res.status).toBe(400);
    expect(h.changerDestinataire).not.toHaveBeenCalled();
  });
});
