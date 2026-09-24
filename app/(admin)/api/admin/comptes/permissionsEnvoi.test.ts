import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 5-DROITS — LA ROUTE REFUSE, ELLE AUSSI. L'écran empêche déjà d'enregistrer un accès Gestion sans réponse sur
 * l'envoi (bouton désactivé, message en français). Ça ne suffit pas : un écran qui oblige est un CONFORT, une route qui
 * refuse est une GARANTIE — la seule qui tienne face à un appel direct, un formulaire rejoué, ou un écran d'une version
 * antérieure resté ouvert dans un onglet.
 *
 * On teste le COMPORTEMENT : le code de réponse, le message rendu, et surtout le fait qu'AUCUNE écriture n'ait lieu.
 */

const modifierPermissions = vi.fn();
const trouverCompteParId = vi.fn();
const exigerAdministrateur = vi.fn();

vi.mock('../../../../lib/admin/garde', () => ({ exigerAdministrateur: (...a: unknown[]) => exigerAdministrateur(...a) }));
vi.mock('../../../../lib/admin/comptes', () => ({
  modifierPermissions: (...a: unknown[]) => modifierPermissions(...a),
  trouverCompteParId: (...a: unknown[]) => trouverCompteParId(...a),
}));

import { POST } from './[id]/permissions/route';

const PERMS = (o: Record<string, boolean> = {}) => ({
  pilotage: false, cartes_annee: false, statistiques: false, internautes: false,
  curation: false, banc_test: false, permis: false, gestion: false, ...o,
});
const requete = (corps: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(corps) });
const ctx = { params: Promise.resolve({ id: '42' }) };

beforeEach(() => {
  modifierPermissions.mockReset().mockResolvedValue(true);
  trouverCompteParId.mockReset();
  exigerAdministrateur.mockReset().mockResolvedValue({ auteurId: 7 });
});

describe('🔴 accès Gestion SANS réponse sur l’envoi → refusé par le SERVEUR', () => {
  it('rien du tout → 422, message en français, et AUCUNE écriture', async () => {
    const res = await POST(requete({ perms: PERMS({ gestion: true }) }), ctx);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.erreur).toContain('Peut envoyer des mails au nom de gestion@criterimmo.fr');
    expect(body.erreur).toContain('oui ou non');
    expect(modifierPermissions).not.toHaveBeenCalled(); // lire, refuser, puis écrire — jamais l'inverse
  });

  it('une valeur qui n’est ni true ni false ne passe pas pour une réponse', async () => {
    for (const valeur of [null, 'oui', 1, {}, undefined]) {
      modifierPermissions.mockClear();
      const res = await POST(requete({ perms: PERMS({ gestion: true }), gestion_envoi: valeur }), ctx);
      expect(res.status).toBe(422);
      expect(modifierPermissions).not.toHaveBeenCalled();
    }
  });
});

describe('les cas qui passent', () => {
  it('« oui » → enregistré, et la réponse est transmise telle quelle au dépôt', async () => {
    const res = await POST(requete({ perms: PERMS({ gestion: true }), gestion_envoi: true }), ctx);
    expect(res.status).toBe(200);
    expect(modifierPermissions).toHaveBeenCalledWith(42, expect.objectContaining({ gestion: true }), false, 7, true);
  });

  it('« non » → enregistré aussi : c’est une réponse, pas une absence de réponse', async () => {
    await POST(requete({ perms: PERMS({ gestion: true }), gestion_envoi: false }), ctx);
    expect(modifierPermissions).toHaveBeenCalledWith(42, expect.anything(), false, 7, false);
  });

  it('SANS accès Gestion, la question ne se pose pas : aucune réponse n’est exigée', async () => {
    const res = await POST(requete({ perms: PERMS({ curation: true }) }), ctx);
    expect(res.status).toBe(200);
    expect(modifierPermissions).toHaveBeenCalledWith(42, expect.objectContaining({ gestion: false }), false, 7, null);
  });

  it('retirer la tuile Gestion transmet `null` — la question se reposera à la réouverture (décision d)', async () => {
    await POST(requete({ perms: PERMS({ gestion: false }), gestion_envoi: true }), ctx);
    expect(modifierPermissions).toHaveBeenCalledWith(42, expect.anything(), false, 7, true);
    // (c'est le dépôt qui neutralise en NULL quand la tuile est absente — vérifié dans droitEnvoiGestion.test.ts)
  });
});

describe('les barrières d’avant n’ont pas bougé', () => {
  it('non-administrateur → refus, sans rien lire ni écrire', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: new Response('non', { status: 403 }) });
    const res = await POST(requete({ perms: PERMS({ gestion: true }), gestion_envoi: true }), ctx);
    expect(res.status).toBe(403);
    expect(modifierPermissions).not.toHaveBeenCalled();
  });

  it('identifiant de compte invalide → 422', async () => {
    const res = await POST(requete({ perms: PERMS() }), { params: Promise.resolve({ id: 'zero' }) });
    expect(res.status).toBe(422);
  });

  it('0 ligne modifiée et compte introuvable → 404', async () => {
    modifierPermissions.mockResolvedValue(false);
    trouverCompteParId.mockResolvedValue(null);
    const res = await POST(requete({ perms: PERMS() }), ctx);
    expect(res.status).toBe(404);
  });

  it('0 ligne modifiée mais compte présent (administrateur) → 409', async () => {
    modifierPermissions.mockResolvedValue(false);
    trouverCompteParId.mockResolvedValue({ id: 42, role: 'administrateur' });
    const res = await POST(requete({ perms: PERMS() }), ctx);
    expect(res.status).toBe(409);
  });
});
