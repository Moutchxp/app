import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pool pg mocké (garde + comptes partagent le module client). modifierIdentite n'utilise que `query`.
const queryMock = vi.fn();
vi.mock('../../../../../lib/db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));

import { POST } from './identite/route';
import { signerJeton, permsToutes, NOM_COOKIE, type SessionAdmin } from '../../../../../lib/admin/session';

const SECRET = 'secret-de-test-suffisamment-long-pour-hs256-0123456789';
const ctx = { params: Promise.resolve({ id: '5' }) };

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  queryMock.mockReset();
});

async function req(session: SessionAdmin | null, body: unknown): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session) headers.cookie = `${NOM_COOKIE}=${await signerJeton(session)}`;
  return new Request('http://local/api/admin/comptes/5/identite', { method: 'POST', headers, body: JSON.stringify(body) });
}
const admin = (sub = 1): SessionAdmin => ({ sub, identifiant: 'chef', role: 'administrateur', perms: permsToutes(), doitChanger: false });
const collab = (): SessionAdmin => ({ sub: 3, identifiant: 'lea', role: 'collaborateur', perms: permsToutes(), doitChanger: false });
const secours = (): SessionAdmin => ({ sub: null, identifiant: 'secours', role: 'administrateur', perms: permsToutes(), doitChanger: false });
const gardeAdmin = () => queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'administrateur' }] });
/** L'appel de modifierIdentite = 2e requête (après la garde). Renvoie sa SQL et ses params. */
const appelModif = () => ({ sql: String(queryMock.mock.calls[1][0]), params: queryMock.mock.calls[1][1] as unknown[] });

describe('POST /comptes/[id]/identite — F-2 (édition prénom/nom) + double barrière', () => {
  it('administrateur édite le prénom/nom d’un AUTRE administrateur → 200 ; SET prenom+nom seulement', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // modifierIdentite : 1 ligne
    const res = await POST(await req(admin(), { prenom: 'Anne', nom: 'Roy' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const { sql, params } = appelModif();
    expect(sql).toMatch(/UPDATE\s+admin_utilisateur\s+SET\s+prenom\s*=\s*\$2,\s*nom\s*=\s*\$3/i);
    expect(sql).not.toMatch(/SET[\s\S]*identifiant/i); // jamais l’identifiant
    expect(params).toEqual([5, 'Anne', 'Roy', 1]); // id, prenom, nom, auteur_id (=sub)
    expect(sql).toContain("'changement_identite'"); // action journalisée (autorisée par 017)
  });

  it('FORGEAGE : un champ `identifiant` dans le corps est IGNORÉ (allowlist) — jamais écrit en base', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const res = await POST(await req(admin(), { prenom: 'Zoé', nom: 'Bar', identifiant: 'pirate@evil.test', role: 'administrateur' }), ctx);
    expect(res.status).toBe(200);
    const { sql, params } = appelModif();
    // Preuve SUR LA BASE (pas sur la réponse) : ni la valeur forgée ni la colonne identifiant n’atteignent le SQL.
    expect(params).toEqual([5, 'Zoé', 'Bar', 1]);
    expect(JSON.stringify(params)).not.toContain('pirate@evil.test');
    expect(sql).not.toMatch(/identifiant/i);
    expect(sql).not.toMatch(/\brole\b\s*=/i); // le `role` forgé n’est pas écrit non plus
  });

  it('trim serveur : espaces autour du prénom/nom retirés avant écriture', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    await POST(await req(admin(), { prenom: '  Léo  ', nom: '  Dan  ' }), ctx);
    expect(appelModif().params).toEqual([5, 'Léo', 'Dan', 1]);
  });

  it('appelant COLLABORATEUR (rôle réel en base) → 403 INTERDIT, aucune écriture', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] }); // garde lit le rôle RÉEL
    const res = await POST(await req(collab(), { prenom: 'X', nom: 'Y' }), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ erreur: 'INTERDIT' });
    expect(queryMock).toHaveBeenCalledTimes(1); // garde seule, pas de modifierIdentite
  });

  it('jeton au rôle PÉRIMÉ (JWS administrateur, base collaborateur) → 403', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ actif: true, role: 'collaborateur' }] });
    const perime: SessionAdmin = { sub: 9, identifiant: 'ex', role: 'administrateur', perms: permsToutes(), doitChanger: false };
    const res = await POST(await req(perime, { prenom: 'X', nom: 'Y' }), ctx);
    expect(res.status).toBe(403);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('prénom vide (blancs seuls) → 422 côté serveur, AVANT toute écriture', async () => {
    gardeAdmin();
    const res = await POST(await req(admin(), { prenom: '   ', nom: 'Y' }), ctx);
    expect(res.status).toBe(422);
    expect(queryMock).toHaveBeenCalledTimes(1); // garde uniquement ; modifierIdentite jamais appelé
  });

  it('nom absent → 422', async () => {
    gardeAdmin();
    const res = await POST(await req(admin(), { prenom: 'X' }), ctx);
    expect(res.status).toBe(422);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('compte introuvable (0 ligne) → 404', async () => {
    gardeAdmin();
    queryMock.mockResolvedValueOnce({ rows: [] }); // modifierIdentite : aucune ligne
    const res = await POST(await req(admin(), { prenom: 'X', nom: 'Y' }), ctx);
    expect(res.status).toBe(404);
  });

  it('id non numérique → 422 sans même interroger la base', async () => {
    gardeAdmin();
    const res = await POST(await req(admin(), { prenom: 'X', nom: 'Y' }), { params: Promise.resolve({ id: 'abc' }) });
    expect(res.status).toBe(422);
    expect(queryMock).toHaveBeenCalledTimes(1); // garde a lieu ; l’id est rejeté ensuite, pas de modif
  });

  it('VOIE DE SECOURS (sub = null) : accès complet, auteur_id NULL au journal, sans requête de garde', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // 1re requête = modifierIdentite (pas de garde en secours)
    const res = await POST(await req(secours(), { prenom: 'X', nom: 'Y' }), ctx);
    expect(res.status).toBe(200);
    const params = queryMock.mock.calls[0][1] as unknown[]; // en secours il n’y a PAS de requête de garde
    expect(params).toEqual([5, 'X', 'Y', null]); // auteur_id = NULL
  });

  it('sans cookie de session → 403 INTERDIT', async () => {
    const res = await POST(await req(null, { prenom: 'X', nom: 'Y' }), ctx);
    expect(res.status).toBe(403);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
