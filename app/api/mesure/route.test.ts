import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pool mocké : lireMotifBots() lit la config → on renvoie un motif fixe. Writer/session mockés pour
// inspecter CE QUI EST ÉCRIT. `after()` exécute le callback (sinon rien n'est écrit en test).
vi.mock('../../lib/analytics/pool', () => ({
  queryAnalytics: vi.fn().mockResolvedValue({ rows: [{ valeur: 'facebookexternalhit|bot|crawl|slackbot' }] }),
}));
vi.mock('../../lib/analytics/writer', () => ({
  incrementerCompteur: vi.fn().mockResolvedValue(undefined),
  jourParis: () => '2026-07-10',
}));
vi.mock('../../lib/analytics/session', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  majSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/server', async (orig) => ({
  ...(await orig() as Record<string, unknown>),
  after: (fn: () => unknown) => { void Promise.resolve().then(() => fn()).catch(() => {}); },
}));

import { POST } from './route';
import { incrementerCompteur } from '../../lib/analytics/writer';
import { majSession } from '../../lib/analytics/session';

const incr = incrementerCompteur as unknown as ReturnType<typeof vi.fn>;
const sess = majSession as unknown as ReturnType<typeof vi.fn>;
const V4 = '11111111-1111-4111-8111-111111111111';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Mobile/15E148 Safari/604';

function beacon(corps: Record<string, unknown>, ua = UA_IPHONE): Request {
  return new Request('http://test/api/mesure', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua, host: 'sansvisavis.com' },
    body: JSON.stringify(corps),
  });
}
const attendre = () => new Promise((r) => setTimeout(r, 15)); // laisse tourner after() (2 await internes)

beforeEach(() => vi.clearAllMocks());

describe('/api/mesure — beacon : répond 204, écrit best-effort après réponse', () => {
  it('répond 204 immédiatement', async () => {
    const res = await POST(beacon({ nom: 'photo_prise', sid: V4 }));
    expect(res.status).toBe(204);
  });

  it('ANONYMAT session_debut : la PII du corps/headers NE atteint JAMAIS la session', async () => {
    // Corps VOLONTAIREMENT pollué : coordonnées, email, token dans le referer, UTM en clair.
    const res = await POST(
      beacon({
        nom: 'session_debut',
        sid: V4,
        source: 'Instagram',
        medium: 'Social',
        referer: 'https://instagram.com/p/xyz/?token=SECRET&email=jean@x.com',
        lat: 48.9044, // ← PII, ne doit jamais ressortir
        lon: 2.2701,
        email: 'jean@x.com',
      }),
    );
    expect(res.status).toBe(204);
    await attendre();
    expect(sess).toHaveBeenCalledTimes(1);
    const [sid, etape, acq] = sess.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(sid).toBe(V4);
    expect(etape).toBe('intro');
    // Provenance RÉDUITE : host seul, UTM bucketés, device/famille dérivés de l'UA.
    expect(acq).toEqual({
      source: 'instagram',
      medium: 'social',
      campagne: null,
      refererHote: 'instagram.com', // ni path, ni token, ni email
      deviceType: 'mobile',
      navigateurFamille: 'Safari',
    });
    // Aucune coordonnée / email / token nulle part dans ce qui est écrit.
    expect(JSON.stringify(acq)).not.toMatch(/48\.90|2\.27|jean|secret|token|@/i);
    expect(incr).not.toHaveBeenCalled(); // session_debut n'écrit PAS de compteur (provenance = table session)
  });

  it('etape_atteinte : monte la session ET compte l’entrée d’écran (etape neutre)', async () => {
    await POST(beacon({ nom: 'etape_atteinte', sid: V4, etape: 'photo' }));
    await attendre();
    expect(sess).toHaveBeenCalledWith(V4, 'photo');
    expect(incr).toHaveBeenCalledWith({ nom: 'etape_atteinte', etape: 'photo' });
  });

  it('point_origine_place : commune valide gardée, commune-poubelle (coordonnée) → null', async () => {
    await POST(beacon({ nom: 'point_origine_place', sid: V4, commune: '92004' }));
    await attendre();
    expect(incr).toHaveBeenCalledWith({ nom: 'point_origine_place', communeInsee: '92004' });
    incr.mockClear();
    await POST(beacon({ nom: 'point_origine_place', sid: V4, commune: '48.9044,2.2701' }));
    await attendre();
    expect(incr).toHaveBeenCalledWith({ nom: 'point_origine_place', communeInsee: null });
  });

  it('point_origine_refuse : raison de l’allowlist seulement', async () => {
    await POST(beacon({ nom: 'point_origine_refuse', sid: V4, raison: 'hors_emprise' }));
    await attendre();
    expect(incr).toHaveBeenCalledWith({ nom: 'point_origine_refuse', raison: 'hors_emprise' });
    incr.mockClear();
    await POST(beacon({ nom: 'point_origine_refuse', sid: V4, raison: 'pirate' }));
    await attendre();
    expect(incr).toHaveBeenCalledWith({ nom: 'point_origine_refuse', raison: null });
  });

  it('un nom HORS allowlist client (resultat, session_fin, admin_*) → 204, AUCUNE écriture', async () => {
    for (const nom of ['resultat', 'session_fin', 'admin_connexion', 'inconnu']) {
      const res = await POST(beacon({ nom, sid: V4, verdict: 'SANS_VIS_A_VIS' }));
      expect(res.status).toBe(204);
    }
    await attendre();
    expect(incr).not.toHaveBeenCalled();
    expect(sess).not.toHaveBeenCalled();
  });

  it('FILTRE BOTS : un UA de bot n’est JAMAIS compté', async () => {
    await POST(beacon({ nom: 'session_debut', sid: V4, source: 'x' }, 'facebookexternalhit/1.1'));
    await attendre();
    expect(sess).not.toHaveBeenCalled();
    expect(incr).not.toHaveBeenCalled();
  });

  it('sid non-v4 : compteurs OK, mais aucune session écrite (le CHECK 018 rejetterait un non-v4)', async () => {
    await POST(beacon({ nom: 'etape_atteinte', sid: 'pas-un-uuid', etape: 'photo' }));
    await attendre();
    expect(incr).toHaveBeenCalledWith({ nom: 'etape_atteinte', etape: 'photo' }); // le compteur ne dépend pas du sid
    expect(sess).not.toHaveBeenCalled(); // pas de session sans sid valide
  });

  it('conversions (Chantier A) : clic_plusvalue ACCEPTÉ + certificat/estimation → lignes NEUTRES (aucune dimension)', async () => {
    for (const nom of ['clic_certificat', 'clic_plusvalue', 'clic_estimation']) {
      // dims parasites (commune/verdict) volontairement envoyées : elles NE doivent PAS entrer dans ces compteurs.
      const res = await POST(beacon({ nom, sid: V4, commune: '92004', verdict: 'SANS_VIS_A_VIS' }));
      expect(res.status).toBe(204);
    }
    await attendre();
    // clic_plusvalue est bien dans NOMS_CLIENT (sinon rejet 204 sans écriture) et écrit comme {nom} seul.
    expect(incr).toHaveBeenCalledWith({ nom: 'clic_certificat' });
    expect(incr).toHaveBeenCalledWith({ nom: 'clic_plusvalue' });
    expect(incr).toHaveBeenCalledWith({ nom: 'clic_estimation' });
    // Ligne NEUTRE : ni commune, ni verdict ne se glissent dans ces compteurs (hors k-anonymat).
    for (const call of incr.mock.calls) {
      const ev = call[0] as { nom: string };
      if (ev.nom.startsWith('clic_')) expect(ev).toEqual({ nom: ev.nom });
    }
  });
});
