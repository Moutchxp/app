import { describe, it, expect, vi, beforeEach } from 'vitest';

// Moteur + canal analytique mockés : on teste la ROUTE, pas le calcul ni la base.
vi.mock('../../lib/db/pipeline', () => ({ analyserAdresse: vi.fn() }));
vi.mock('../../lib/analytics/writer', () => ({ incrementerCompteur: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../lib/analytics/commune', () => ({ communeDuPoint: vi.fn().mockResolvedValue(null) }));
// `after()` : on EXÉCUTE le callback (microtâche) pour prouver qu'un throw dedans ne casse jamais la réponse.
vi.mock('next/server', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, after: (fn: () => unknown) => { void Promise.resolve().then(() => fn()).catch(() => {}); } };
});

import { POST } from './route';
import { analyserAdresse } from '../../lib/db/pipeline';
import { incrementerCompteur } from '../../lib/analytics/writer';
import { communeDuPoint } from '../../lib/analytics/commune';

const analyser = analyserAdresse as unknown as ReturnType<typeof vi.fn>;
const incr = incrementerCompteur as unknown as ReturnType<typeof vi.fn>;
const commune = communeDuPoint as unknown as ReturnType<typeof vi.fn>;

const RESULTAT_FAKE = {
  verdict: { verdict: 'SANS_VIS_A_VIS', distanceM: 61 },
  score: { total: 42, libelle: 'x' },
  distanceAxePrincipalM: 61,
};

function requete(corps: Record<string, unknown>): Request {
  return new Request('http://test/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
}
const CORPS_OK = { lat: 48.90693, lon: 2.269431, azimut: 90, etage: 2, dernierEtage: false };
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.clearAllMocks());

describe('/api/analyse — l’instrumentation ne peut jamais casser la certification', () => {
  it('LE TEST DU LOT : répond 200 même si l’émission analytique ÉCHOUE (commune KO + writer KO)', async () => {
    analyser.mockResolvedValue({ validation: { ok: true }, resultat: RESULTAT_FAKE });
    commune.mockRejectedValueOnce(new Error('KNN down'));
    incr.mockRejectedValueOnce(new Error('pool full'));
    const res = await POST(requete(CORPS_OK));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.resultat.verdict.verdict).toBe('SANS_VIS_A_VIS');
    await tick(); // laisse tourner le callback after() : son throw doit rester avalé, sans effet
    expect(res.status).toBe(200);
  });

  it('VERDICT OBSERVÉ, PAS INFLUENCÉ : le resultat renvoyé est EXACTEMENT la sortie du moteur', async () => {
    analyser.mockResolvedValue({ validation: { ok: true }, resultat: RESULTAT_FAKE });
    const json = await (await POST(requete(CORPS_OK))).json();
    expect(json.resultat).toEqual(RESULTAT_FAKE); // aucun champ ajouté/modifié par l'instrumentation
  });

  it('ANONYMAT : l’événement resultat porte verdict+tranche+commune, JAMAIS lat/lon', async () => {
    analyser.mockResolvedValue({ validation: { ok: true }, resultat: RESULTAT_FAKE });
    commune.mockResolvedValueOnce('92004');
    await POST(requete(CORPS_OK));
    await tick();
    expect(incr).toHaveBeenCalledTimes(1);
    const ev = incr.mock.calls[0][0] as Record<string, unknown>;
    expect(ev).toEqual({ nom: 'resultat', verdict: 'SANS_VIS_A_VIS', scoreTranche: 2, communeInsee: '92004' });
    // Aucune coordonnée / adresse dans l'événement.
    expect(JSON.stringify(ev)).not.toMatch(/48\.9|2\.269|lat|lon/i);
    // La commune a bien été dérivée du point EN VOL (lat/lon transitent au lookup, jamais stockés).
    expect(commune).toHaveBeenCalledWith(48.90693, 2.269431);
  });

  it('INDETERMINE (resultat null) : 200, émission verdict=INDETERMINE, tranche null', async () => {
    analyser.mockResolvedValue({ validation: { ok: true }, resultat: null });
    commune.mockResolvedValueOnce('75056');
    const res = await POST(requete(CORPS_OK));
    expect(res.status).toBe(200);
    await tick();
    expect(incr.mock.calls[0][0]).toEqual({ nom: 'resultat', verdict: 'INDETERMINE', scoreTranche: null, communeInsee: '75056' });
  });

  it('une entrée invalide reste un 400 métier (inchangé), sans émission', async () => {
    const res = await POST(requete({ lat: 'x' }));
    expect(res.status).toBe(400);
    await tick();
    expect(incr).not.toHaveBeenCalled();
  });
});

/**
 * Plafond d'attente de la base (chemin public uniquement). Le pipeline est mocké : on prouve le
 * COMPORTEMENT de la route face aux deux manifestations d'un plafond atteint, pas le plafond lui-même
 * (prouvé côté pool dans `lib/db/plafondAnalyse.test.ts`).
 */
describe('/api/analyse — plafond d’attente de la base', () => {
  /** Erreur telle que Postgres la remonte quand `statement_timeout` annule la requête. */
  function erreurStatementTimeout(): Error {
    return Object.assign(
      new Error('canceling statement due to statement timeout\nSELECT b.cleabs, ST_Distance(...) FROM batiment b'),
      { code: '57014' },
    );
  }

  it('statement_timeout (57014) → 503 JSON propre, sans trace technique ni SQL', async () => {
    analyser.mockRejectedValueOnce(erreurStatementTimeout());
    const res = await POST(requete(CORPS_OK));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(typeof json.erreur).toBe('string');
    // Aucune fuite : ni le SQLSTATE, ni le message pg, ni un fragment de requête ne sortent vers l'écran.
    expect(json.erreur).not.toMatch(/57014|statement timeout|SELECT|ST_Distance|batiment/i);
  });

  it('attente d’une connexion dépassée → 503 aussi (jamais une attente infinie)', async () => {
    analyser.mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'));
    const res = await POST(requete(CORPS_OK));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });

  it('un 503 de plafond n’émet AUCUN événement analytique (la route rend avant after())', async () => {
    analyser.mockRejectedValueOnce(erreurStatementTimeout());
    await POST(requete(CORPS_OK));
    await tick();
    expect(incr).not.toHaveBeenCalled();
  });

  it('une erreur ORDINAIRE reste un 500 (chemin d’erreur historique inchangé)', async () => {
    analyser.mockRejectedValueOnce(new Error('colonne inconnue'));
    const res = await POST(requete(CORPS_OK));
    expect(res.status).toBe(500);
    expect((await res.json()).erreur).toBe('colonne inconnue');
  });

  it('le chemin NOMINAL passe par le plafond sans rien changer au résultat rendu', async () => {
    analyser.mockResolvedValue({ validation: { ok: true }, resultat: RESULTAT_FAKE });
    const res = await POST(requete(CORPS_OK));
    expect(res.status).toBe(200);
    expect((await res.json()).resultat).toEqual(RESULTAT_FAKE);
  });
});
