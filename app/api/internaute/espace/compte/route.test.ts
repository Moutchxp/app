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
const { declarerResidence } = vi.hoisted(() => ({ declarerResidence: vi.fn() }));
vi.mock('../../../../lib/internaute/cycleVie', () => ({ rectifierInternaute, declarerResidence, ErreurEmailDuplique }));
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
    declarerResidence.mockReset().mockResolvedValue({ change: true });
    lireCompte.mockReset().mockResolvedValue({ prenom: 'Jean', nom: 'Dupont', email: 'a@b.co', telephone: null });
  });

  it('succès → 200 { ok, prenom, nom } (valeurs normalisées relues en base), id de SESSION', async () => {
    const res = await PATCH(req({ prenom: 'jean', nom: 'dupont' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, prenom: 'Jean', nom: 'Dupont', adresseResidence: null });
    expect(rectifierInternaute).toHaveBeenCalledTimes(1);
    const [id, champs, auteur, canal] = rectifierInternaute.mock.calls[0];
    expect(id).toBe('SESSION'); // id de session, jamais du corps
    expect(auteur).toBeNull(); // geste de l'internaute lui-même
    expect(champs).toEqual({ prenom: 'Jean', nom: 'Dupont' }); // casse normalisée
    expect(canal).toBe('espace_client'); // canal déclaré explicitement (J1)
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

describe('PATCH /api/internaute/espace/compte — adresse de résidence principale (lot COORDONNEES-CONNU-REEL)', () => {
  beforeEach(() => {
    exigerInternaute.mockReset().mockResolvedValue({ internauteId: 'SESSION' });
    rectifierInternaute.mockReset().mockResolvedValue({ rectifie: true });
    declarerResidence.mockReset().mockResolvedValue({ change: true });
    lireCompte.mockReset().mockResolvedValue({ prenom: 'Jean', nom: 'Dupont', email: 'a@b.co', telephone: null, adresseResidence: '5 Rue Neuve 92600 Asnières-sur-Seine' });
  });

  it('adresse seule → écrite pour l’id de SESSION (source et canal espace_client), prénom/nom non touchés, relue en base', async () => {
    const res = await PATCH(req({ adresseResidence: '  5 Rue Neuve   92600 Asnières-sur-Seine ', id: 'AUTRE' }));
    expect(res.status).toBe(200);
    expect(declarerResidence).toHaveBeenCalledWith('SESSION', '5 Rue Neuve 92600 Asnières-sur-Seine', 'espace_client', 'espace_client');
    expect(rectifierInternaute).not.toHaveBeenCalled();
    expect((await res.json()).adresseResidence).toBe('5 Rue Neuve 92600 Asnières-sur-Seine');
  });

  it('prénom, nom et adresse ensemble → les deux écritures ; e-mail et téléphone toujours écartés', async () => {
    await PATCH(req({ prenom: 'jean', nom: 'dupont', adresseResidence: '5 Rue Neuve', email: 'pirate@x.z', telephone: '0600000000' }));
    expect(rectifierInternaute.mock.calls[0][1]).toEqual({ prenom: 'Jean', nom: 'Dupont' });
    expect(declarerResidence).toHaveBeenCalledWith('SESSION', '5 Rue Neuve', 'espace_client', 'espace_client');
  });

  it('champ vidé → adresse effacée (null) ; valeur démesurée ou non textuelle → 400 sans écriture', async () => {
    await PATCH(req({ adresseResidence: '   ' }));
    expect(declarerResidence).toHaveBeenCalledWith('SESSION', null, 'espace_client', 'espace_client');
    declarerResidence.mockClear();
    expect((await PATCH(req({ adresseResidence: 'x'.repeat(400) }))).status).toBe(400);
    expect((await PATCH(req({ adresseResidence: 12 }))).status).toBe(400);
    expect(declarerResidence).not.toHaveBeenCalled();
  });

  it('non authentifié → refus de la garde, aucune écriture', async () => {
    exigerInternaute.mockResolvedValue({ refus: new Response(null, { status: 401 }) });
    expect((await PATCH(req({ adresseResidence: '5 Rue Neuve' }))).status).toBe(401);
    expect(declarerResidence).not.toHaveBeenCalled();
  });
});
