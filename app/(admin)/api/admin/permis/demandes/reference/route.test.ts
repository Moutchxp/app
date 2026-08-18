import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P1 — POST /api/admin/permis/demandes/reference : ajout d'une référence mairie (y compris après coup). On MOCKE
 * ajouterReferenceExterne (+ garde). Ce fichier teste le COMPORTEMENT HTTP : garde 403, validations 400, doublon → 409 NOMMÉ
 * (jamais 503), inattendu → 503 journalisé. db/client mocké (aucune DB).
 */
vi.mock('../../../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/demandeRepo', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, ajouterReferenceExterne: vi.fn(), supprimerReferenceExterne: vi.fn() };
});

import { POST, DELETE } from './route';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { ajouterReferenceExterne, supprimerReferenceExterne, ReferenceDejaEnregistreeError } from '../../../../../../lib/sitadel/demandeRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const ajouter = ajouterReferenceExterne as unknown as ReturnType<typeof vi.fn>;
const supprimer = supprimerReferenceExterne as unknown as ReturnType<typeof vi.fn>;
const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/demandes/reference', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const del = (body: unknown) => DELETE(new Request('http://test/api/admin/permis/demandes/reference', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); garde.mockResolvedValue({ auteurId: 5 }); });

describe('P1 — POST reference', () => {
  it('non-administrateur → 403, aucun ajout', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await post({ demandeId: 1, reference: 'X' })).status).toBe(403);
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('demandeId invalide → 400 ; référence vide → 400 (aucun appel repo)', async () => {
    expect((await post({ demandeId: 'x', reference: 'X' })).status).toBe(400);
    expect((await post({ demandeId: 119, reference: '   ' })).status).toBe(400);
    expect(ajouter).not.toHaveBeenCalled();
  });

  it('ajout valide → 200, la référence trimée est transmise au repo (source par défaut « saisie_manuelle »)', async () => {
    ajouter.mockResolvedValueOnce(undefined);
    const res = await post({ demandeId: 119, reference: ' SLC260810440700 ' });
    expect(res.status).toBe(200);
    expect(ajouter).toHaveBeenCalledWith(119, 'SLC260810440700', expect.objectContaining({ source: 'saisie_manuelle' }));
  });

  it('référence DÉJÀ enregistrée → 409 NOMMÉ, jamais 503', async () => {
    ajouter.mockRejectedValueOnce(new ReferenceDejaEnregistreeError());
    const res = await post({ demandeId: 119, reference: 'DOUBLON' });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toContain('déjà enregistrée pour cette demande');
  });

  it('exception INATTENDUE → 503 APRÈS journalisation (jamais de catch muet)', async () => {
    ajouter.mockRejectedValueOnce(Object.assign(new Error('relation manquante'), { code: '42P01' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ demandeId: 119, reference: 'X' });
    expect(res.status).toBe(503);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('FUS-4 — DELETE reference (effacer, jamais défaire un envoi)', () => {
  it('non-administrateur → 403, aucun effacement', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await del({ demandeId: 119, reference: 'SLC' })).status).toBe(403);
    expect(supprimer).not.toHaveBeenCalled();
  });

  it('demandeId invalide → 400 ; référence vide → 400 (aucun appel repo)', async () => {
    expect((await del({ demandeId: 'x', reference: 'SLC' })).status).toBe(400);
    expect((await del({ demandeId: 119, reference: '   ' })).status).toBe(400);
    expect(supprimer).not.toHaveBeenCalled();
  });

  it('effacement valide → 200 { supprime:true }, référence trimée transmise', async () => {
    supprimer.mockResolvedValueOnce(true);
    const res = await del({ demandeId: 119, reference: ' SLC260810440700 ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, supprime: true });
    expect(supprimer).toHaveBeenCalledWith(119, 'SLC260810440700');
  });

  it('référence absente → 200 { supprime:false } (idempotent, jamais une erreur)', async () => {
    supprimer.mockResolvedValueOnce(false);
    const res = await del({ demandeId: 119, reference: 'INCONNUE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, supprime: false });
  });

  it('exception INATTENDUE → 503 APRÈS journalisation', async () => {
    supprimer.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '42P01' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await del({ demandeId: 119, reference: 'X' })).status).toBe(503);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
