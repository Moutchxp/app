import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * X5 — route publique POST /api/cada/confirmer. On MOCKE le jeton (verifierJetonCada) et le chemin partagé
 * (lancerSaisinePourDemande) : ce fichier teste le COMPORTEMENT de la route (le lien n'agit qu'au POST, mapping d'erreurs,
 * anti-doublon 23505 → « déjà lancée »). SaisineCadaError reste la VRAIE classe (instanceof). db/client mocké (aucune vraie DB).
 */
vi.mock('../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../../lib/internaute/jetonRectification', () => ({ verifierJetonCada: vi.fn() }));
vi.mock('../../../lib/sitadel/envoiSaisineCada', () => ({ lancerSaisinePourDemande: vi.fn() }));

import { POST } from './route';
import { verifierJetonCada } from '../../../lib/internaute/jetonRectification';
import { lancerSaisinePourDemande } from '../../../lib/sitadel/envoiSaisineCada';
import { SaisineCadaError } from '../../../lib/veille/saisineCadaRepo';

const verif = verifierJetonCada as unknown as ReturnType<typeof vi.fn>;
const lancer = lancerSaisinePourDemande as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) => POST(new Request('http://test/api/cada/confirmer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  verif.mockResolvedValue({ ok: true, demandeId: 42 }); // jeton valide par défaut
});

describe('X5 — le lien n’agit qu’au POST + vérification du jeton', () => {
  it('jeton absent → 400, jamais de lancement', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(lancer).not.toHaveBeenCalled();
  });
  it('jeton invalide → 401, jamais de lancement', async () => {
    verif.mockResolvedValueOnce({ ok: false, raison: 'invalide' });
    const res = await post({ jeton: 'x' });
    expect(res.status).toBe(401);
    expect((await res.json()).etat).toBe('jeton');
    expect(lancer).not.toHaveBeenCalled();
  });
  it('jeton expiré → 401 « lien expiré », jamais de lancement', async () => {
    verif.mockResolvedValueOnce({ ok: false, raison: 'expire' });
    const res = await post({ jeton: 'x' });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toMatch(/expiré/i);
    expect(lancer).not.toHaveBeenCalled();
  });
});

describe('X5 — POST : chemin partagé (création + envoi), agit sur l’id du JETON', () => {
  it('valide + envoyé → 200 { ok:true, canal:email }, lancé pour l’id scellé, auteur « lien e-mail CADA »', async () => {
    lancer.mockResolvedValueOnce({ saisineId: 7, ok: true, canal: 'email', issue: 'envoye' });
    const res = await post({ jeton: 'bon' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, canal: 'email', issue: 'envoye' });
    expect(lancer).toHaveBeenCalledWith(42, 'lien e-mail CADA'); // id du jeton, jamais du client
  });
  it('valide + canal formulaire → 200 { ok:true, canal:formulaire }', async () => {
    lancer.mockResolvedValueOnce({ saisineId: 7, ok: true, canal: 'formulaire' });
    expect(await (await post({ jeton: 'bon' })).json()).toMatchObject({ ok: true, canal: 'formulaire' });
  });
});

describe('X5 — anti-doublon : confirmer deux fois ne crée qu’une saisine', () => {
  it('2e confirmation (saisine déjà en cours) → 409 « déjà lancée », jamais un 503', async () => {
    lancer.mockResolvedValueOnce({ saisineId: 7, ok: true, canal: 'email', issue: 'envoye' });
    lancer.mockRejectedValueOnce(new SaisineCadaError('une saisine est déjà en cours pour cette demande'));
    expect((await (await post({ jeton: 'bon' })).json())).toMatchObject({ ok: true }); // 1re : lancée
    const res2 = await post({ jeton: 'bon' });
    expect(res2.status).toBe(409);
    expect((await res2.json()).etat).toBe('deja'); // 2e : déjà lancée (pas de 2e saisine)
  });

  it('23505 BRUT sur demande_relance_vivante_uniq (course onglet/lien) → 409 « déjà lancée », pas 503', async () => {
    lancer.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint: 'demande_relance_vivante_uniq' }));
    const res = await post({ jeton: 'bon' });
    expect(res.status).toBe(409);
    expect((await res.json()).etat).toBe('deja');
  });
});

describe('X5 — refus métier & inattendu', () => {
  it('forclose (SaisineCadaError) → 409 { etat:refus } avec le motif', async () => {
    lancer.mockRejectedValueOnce(new SaisineCadaError('délai de saisine forclos (plus de deux mois depuis le refus tacite)'));
    const res = await post({ jeton: 'bon' });
    expect(res.status).toBe(409);
    const b = await res.json();
    expect(b.etat).toBe('refus');
    expect(b.message).toMatch(/forclos/i);
  });
  it('exception INATTENDUE → 503 APRÈS journalisation', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    lancer.mockRejectedValueOnce(Object.assign(new Error('colonne absente'), { code: '42703' }));
    const res = await post({ jeton: 'bon' });
    expect(res.status).toBe(503);
    expect((await res.json()).etat).toBe('erreur');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
