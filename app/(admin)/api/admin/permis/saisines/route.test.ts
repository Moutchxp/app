import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * X4 — route /api/admin/permis/saisines (GET agrégé + POST actions). On MOCKE les dépendances (garde, agrégateur, repo,
 * orchestrateur d'envoi, chemin d'abandon) : ce fichier teste le COMPORTEMENT de la route (codes HTTP, mapping d'erreurs,
 * journalisation), pas la logique métier (testée dans saisineCadaRepo.test.ts / envoiSaisineCada.test.ts / saisinesSuivi.test.ts).
 * ⚠️ SaisineCadaError doit rester la VRAIE classe (instanceof dans la route) → importActual pour le reste du module.
 */
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/veille/saisinesSuivi', () => ({ chargerSuiviSaisines: vi.fn() }));
vi.mock('../../../../../lib/veille/demandeRelanceRepo', () => ({ abandonnerRelance: vi.fn() }));
vi.mock('../../../../../lib/sitadel/envoiSaisineCada', () => ({ lancerSaisinePourDemande: vi.fn() }));
vi.mock('../../../../../lib/veille/saisineCadaRepo', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, marquerSaisineDeposee: vi.fn(), enregistrerAvisSaisine: vi.fn() };
});

import { GET, POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviSaisines } from '../../../../../lib/veille/saisinesSuivi';
import { abandonnerRelance } from '../../../../../lib/veille/demandeRelanceRepo';
import { lancerSaisinePourDemande } from '../../../../../lib/sitadel/envoiSaisineCada';
import { marquerSaisineDeposee, enregistrerAvisSaisine, SaisineCadaError } from '../../../../../lib/veille/saisineCadaRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const suivi = chargerSuiviSaisines as unknown as ReturnType<typeof vi.fn>;
const abandon = abandonnerRelance as unknown as ReturnType<typeof vi.fn>;
const lancer = lancerSaisinePourDemande as unknown as ReturnType<typeof vi.fn>;
const deposer = marquerSaisineDeposee as unknown as ReturnType<typeof vi.fn>;
const avis = enregistrerAvisSaisine as unknown as ReturnType<typeof vi.fn>;

const reqGet = () => new Request('http://test/api/admin/permis/saisines');
const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/saisines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 }); // administrateur par défaut
});

describe('X4 — GET : garde + agrégat + 503', () => {
  it('non-administrateur → 403 renvoyé tel quel, AUCUNE lecture', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await GET(reqGet());
    expect(res.status).toBe(403);
    expect(suivi).not.toHaveBeenCalled();
  });
  it('administrateur → 200 + corps de l’agrégat', async () => {
    suivi.mockResolvedValueOnce({ saisissables: [], indeterminees: [], enCours: [], recues: [], abandonnees: [], fileADeposer: [], cadaEmailVide: true, urlFormulaire: 'u' });
    const res = await GET(reqGet());
    expect(res.status).toBe(200);
    expect((await res.json()).cadaEmailVide).toBe(true);
  });
  it('agrégat en échec → 503 maîtrisé', async () => {
    suivi.mockRejectedValueOnce(new Error('db down'));
    expect((await GET(reqGet())).status).toBe(503);
  });
});

describe('X4 — POST « lancer » : chemin partagé lancerSaisinePourDemande', () => {
  it('envoyé → 200 { ok:true, canal:email, issue:envoye } ; lancé pour (demandeId, auteur)', async () => {
    lancer.mockResolvedValueOnce({ saisineId: 7, ok: true, canal: 'email', issue: 'envoye' });
    const res = await post({ action: 'lancer', demandeId: 42 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, canal: 'email', issue: 'envoye', saisineId: 7 });
    expect(lancer).toHaveBeenCalledWith(42, '5');
  });
  it('cada vide → 200 { ok:true, canal:formulaire } (placée en file de dépôt)', async () => {
    lancer.mockResolvedValueOnce({ saisineId: 7, ok: true, canal: 'formulaire' });
    expect(await (await post({ action: 'lancer', demandeId: 42 })).json()).toMatchObject({ ok: true, canal: 'formulaire' });
  });
  it('brouillon créé mais envoi non abouti → 200 { ok:false, motif } (jamais un faux succès)', async () => {
    lancer.mockResolvedValueOnce({ saisineId: 7, ok: false, canal: 'email', issue: 'echec', motif: 'timeout' });
    expect(await (await post({ action: 'lancer', demandeId: 42 })).json()).toMatchObject({ ok: false, issue: 'echec', motif: 'timeout' });
  });
  it('refus métier de création (état) → 409 explicite', async () => {
    lancer.mockRejectedValueOnce(new SaisineCadaError('demande « close » : seule une demande envoyée peut être saisie devant la CADA'));
    const res = await post({ action: 'lancer', demandeId: 42 });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toContain('CADA');
  });
  it('DOUBLE saisine (23505 brut sur demande_relance_vivante_uniq) → 409 NOMMÉ, jamais un 503', async () => {
    lancer.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505', constraint: 'demande_relance_vivante_uniq' }));
    const res = await post({ action: 'lancer', demandeId: 42 });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toBe('une saisine est déjà en cours pour cette demande');
  });
  it('identité incomplète (name) → 409', async () => {
    lancer.mockRejectedValueOnce(Object.assign(new Error('identité incomplète'), { name: 'IdentiteIncompleteError' }));
    expect((await post({ action: 'lancer', demandeId: 42 })).status).toBe(409);
  });
  it('demandeId non entier → 400, lancement jamais appelé', async () => {
    const res = await post({ action: 'lancer', demandeId: 'x' });
    expect(res.status).toBe(400);
    expect(lancer).not.toHaveBeenCalled();
  });
});

describe('X4 — POST « marquer_deposee » / « abandonner »', () => {
  it('marquer_deposee OK → 200 { ok:true }', async () => {
    deposer.mockResolvedValueOnce(undefined);
    expect(await (await post({ action: 'marquer_deposee', saisineId: 7 })).json()).toEqual({ ok: true });
    expect(deposer).toHaveBeenCalledWith(7, '5');
  });
  it('marquer_deposee sur un non-brouillon → 409 (refus métier)', async () => {
    deposer.mockRejectedValueOnce(new SaisineCadaError('saisine introuvable ou déjà déposée/abandonnée'));
    expect((await post({ action: 'marquer_deposee', saisineId: 7 })).status).toBe(409);
  });
  it('abandonner → réutilise abandonnerRelance ; true → ok:true, false → ok:false (idempotent)', async () => {
    abandon.mockResolvedValueOnce(true);
    expect(await (await post({ action: 'abandonner', saisineId: 7 })).json()).toEqual({ ok: true });
    abandon.mockResolvedValueOnce(false);
    expect(await (await post({ action: 'abandonner', saisineId: 7 })).json()).toEqual({ ok: false });
    expect(abandon).toHaveBeenLastCalledWith(7, '5');
  });
});

describe('X4 — POST « enregistrer_avis »', () => {
  it('sens valide → 200 { ok:true }', async () => {
    avis.mockResolvedValueOnce(undefined);
    expect(await (await post({ action: 'enregistrer_avis', saisineId: 7, sens: 'favorable' })).json()).toEqual({ ok: true });
    expect(avis).toHaveBeenCalledWith(7, 'favorable', '5');
  });
  it('MAUVAIS ÉTAT (saisine non envoyée) → 409 explicite', async () => {
    avis.mockRejectedValueOnce(new SaisineCadaError('saisine introuvable ou non envoyée (seule une saisine envoyée à la CADA peut recevoir un avis)'));
    const res = await post({ action: 'enregistrer_avis', saisineId: 7, sens: 'favorable' });
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toContain('avis');
  });
  it('sens hors liste fermée → 400, jamais d’écriture', async () => {
    const res = await post({ action: 'enregistrer_avis', saisineId: 7, sens: 'peut-etre' });
    expect(res.status).toBe(400);
    expect(avis).not.toHaveBeenCalled();
  });
});

describe('X4 — garde-fous transverses (POST)', () => {
  it('non-administrateur → 403, aucune action', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await post({ action: 'abandonner', saisineId: 7 });
    expect(res.status).toBe(403);
    expect(abandon).not.toHaveBeenCalled();
  });
  it('action inconnue → 400', async () => {
    expect((await post({ action: 'zzz' })).status).toBe(400);
  });
  it('exception INATTENDUE → 503 APRÈS journalisation (jamais un catch muet)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deposer.mockRejectedValueOnce(Object.assign(new Error('colonne absente'), { code: '42703', table: 'demande_relance', column: 'xxx' }));
    const res = await post({ action: 'marquer_deposee', saisineId: 7 });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erreur: 'action impossible' });
    expect(spy).toHaveBeenCalled(); // journalisé AVANT de répondre
    const trace = spy.mock.calls[0][1] as Record<string, unknown>;
    expect(trace).toMatchObject({ action: 'marquer_deposee', code: '42703', column: 'xxx' });
    spy.mockRestore();
  });
  it('auteur = "admin" quand la voie de secours n’a pas de sub (auteurId null)', async () => {
    garde.mockResolvedValueOnce({ auteurId: null });
    deposer.mockResolvedValueOnce(undefined);
    await post({ action: 'marquer_deposee', saisineId: 7 });
    expect(deposer).toHaveBeenCalledWith(7, 'admin');
  });
});
