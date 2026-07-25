import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * PATCH /api/internaute/espace/compte. On mocke la garde, `rectifierInternaute`, `lireCompte` ; on garde le VRAI
 * `validerRectification` (pur) → la normalisation de casse est prouvée de bout en bout. PREUVES : id de SESSION (jamais
 * du corps) ; BARRIÈRE DURE (email/telephone du corps jamais transmis) ; normalisation ; validation ; erreurs.
 */
const { exigerInternaute } = vi.hoisted(() => ({ exigerInternaute: vi.fn() }));
const { rectifierInternaute, ErreurEmailDuplique } = vi.hoisted(() => ({
  rectifierInternaute: vi.fn(),
  ErreurEmailDuplique: class ErreurEmailDuplique extends Error {},
}));
const { lireCompte } = vi.hoisted(() => ({ lireCompte: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/internaute/authGarde', () => ({ exigerInternaute }));
vi.mock('../../../../lib/internaute/cycleVie', () => ({ rectifierInternaute, ErreurEmailDuplique }));
vi.mock('../../../../lib/internaute/espace', () => ({ lireCompte }));

import { PATCH } from './route';

const req = (body: unknown, brut = false) =>
  new Request('http://localhost/api/internaute/espace/compte', {
    method: 'PATCH',
    body: brut ? (body as string) : JSON.stringify(body),
  });

describe('PATCH /api/internaute/espace/compte — modification prénom/nom', () => {
  beforeEach(() => {
    exigerInternaute.mockReset().mockResolvedValue({ internauteId: 'SESSION' });
    rectifierInternaute.mockReset().mockResolvedValue({ rectifie: true });
    lireCompte.mockReset().mockResolvedValue({ prenom: 'Jean', nom: 'Dupont', email: 'a@b.co', telephone: null });
  });

  it('succès → 200 { ok, prenom, nom } (valeurs normalisées relues en base), id de SESSION', async () => {
    const res = await PATCH(req({ prenom: 'jean', nom: 'dupont' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, prenom: 'Jean', nom: 'Dupont' });
    expect(rectifierInternaute).toHaveBeenCalledTimes(1);
    const [id, champs, auteur] = rectifierInternaute.mock.calls[0];
    expect(id).toBe('SESSION'); // id de session, jamais du corps
    expect(auteur).toBeNull(); // geste de l'internaute lui-même
    expect(champs).toEqual({ prenom: 'Jean', nom: 'Dupont' }); // casse normalisée
  });

  it('BARRIÈRE DURE : un corps contenant email/telephone ne les transmet JAMAIS à rectifierInternaute', async () => {
    await PATCH(req({ prenom: 'jean', nom: 'dupont', email: 'pirate@x.z', telephone: '0600000000' }));
    const champs = rectifierInternaute.mock.calls[0][1] as Record<string, unknown>;
    expect(champs).toEqual({ prenom: 'Jean', nom: 'Dupont' }); // uniquement prénom/nom
    expect('email' in champs).toBe(false);
    expect('telephone' in champs).toBe(false);
  });

  it('id du CORPS ignoré : l’id agi reste celui de la session', async () => {
    await PATCH(req({ id: 'AUTRE', prenom: 'a', nom: 'b' }));
    expect(rectifierInternaute.mock.calls[0][0]).toBe('SESSION');
  });

  it('normalisation de casse variée (MAJ, apostrophe, tiret)', async () => {
    await PATCH(req({ prenom: 'JEAN', nom: "o'brien" }));
    expect(rectifierInternaute.mock.calls[0][1]).toEqual({ prenom: 'Jean', nom: "O'Brien" });
  });

  it('validation : prénom vide → 400, rectifierInternaute NON appelée', async () => {
    const res = await PATCH(req({ prenom: '   ', nom: 'Dupont' }));
    expect(res.status).toBe(400);
    expect(rectifierInternaute).not.toHaveBeenCalled();
  });

  it('validation : aucun champ (corps vide) → 400', async () => {
    const res = await PATCH(req({}));
    expect(res.status).toBe(400);
    expect(rectifierInternaute).not.toHaveBeenCalled();
  });

  it('corps non-JSON → 400', async () => {
    const res = await PATCH(req('pas du json', true));
    expect(res.status).toBe(400);
    expect(rectifierInternaute).not.toHaveBeenCalled();
  });

  it('non authentifié → renvoie le refus de la garde (401), aucune modification', async () => {
    exigerInternaute.mockResolvedValue({ refus: Response.json({ erreur: 'non authentifié' }, { status: 401 }) });
    const res = await PATCH(req({ prenom: 'a', nom: 'b' }));
    expect(res.status).toBe(401);
    expect(rectifierInternaute).not.toHaveBeenCalled();
  });

  it('rectifie:false (incohérence) → 500', async () => {
    rectifierInternaute.mockResolvedValue({ rectifie: false });
    const res = await PATCH(req({ prenom: 'a', nom: 'b' }));
    expect(res.status).toBe(500);
  });

  it('rectifierInternaute lève → 500 générique', async () => {
    rectifierInternaute.mockRejectedValue(new Error('db down'));
    const res = await PATCH(req({ prenom: 'a', nom: 'b' }));
    expect(res.status).toBe(500);
  });
});
