import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T7-B (cas ③) — orchestration de l'alerte « ce message appelle une réponse ». Partie 1 : COMPORTEMENT par INJECTION (aucune
 * base, aucun SMTP). Partie 2 : la requête RÉELLE des candidats porte bien l'ANCRE anti-rétroactif (nature_classee_le IS NOT
 * NULL) et l'idempotence (alerte_action_le IS NULL) — c'est ce qui protège la réponse de Paris (rétro-classée) d'une alerte.
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT r\.id::int AS reponse_id/i.test(sql)) {
      return { rows: [
        { reponse_id: 7, de_adresse: 'urba@mairie.fr', de_nom: 'Urba', objet: 'Complément', recu_le: '2026-08-12T09:00:00.000Z', corps_texte: 'précisez', commune_nom: 'Aubervilliers', num_daus: ['0930012500081', '0930012500082'] },
        { reponse_id: 8, de_adresse: 'x@mairie.fr', de_nom: null, objet: null, recu_le: '2026-08-12T10:00:00.000Z', corps_texte: null, commune_nom: null, num_daus: [] },
      ], rowCount: 2 };
    }
    return { rows: [], rowCount: 1 };
  };
  return { appels, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock }));
vi.mock('../sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn(async () => ({ alerteActive: true, alerteEmail: 'ops@sansvisavis.fr' })) }));

import { executerAlerteActionAuto, depsReellesAlerteAction, type DepsAlerteAction, type CandidatAction } from './alerteActionAuto';

const cand = (over: Partial<CandidatAction> = {}): CandidatAction => ({
  reponseId: 7, numDau: '0930012500081', autresPermis: [], communeNom: 'Aubervilliers',
  recuLe: new Date('2026-08-12T09:00:00.000Z'), deAdresse: 'urba@mairie.fr', deNom: 'Urba', objet: 'Complément', corpsTexte: 'précisez', ...over,
});

function harness(candidats: CandidatAction[], opts: { envoyerThrows?: boolean; active?: boolean } = {}) {
  const envois: { to: string; sujet: string; corps: string }[] = [];
  const marques: number[] = [];
  const deps: DepsAlerteAction = {
    lireConfig: async () => ({ active: opts.active ?? true, email: 'ops@sansvisavis.fr' }),
    chargerCandidats: async () => candidats,
    envoyer: async (m) => { if (opts.envoyerThrows) throw new Error('SMTP down'); envois.push(m); },
    marquerEnvoyee: async (id) => { marques.push(id); },
  };
  return { deps, envois, marques };
}

beforeEach(() => { appels.length = 0; });

describe('T7-B — executerAlerteActionAuto (injection)', () => {
  it('un candidat → e-mail envoyé PUIS marqué (idempotence) ; sujet avec n° de permis', async () => {
    const h = harness([cand()]);
    const b = await executerAlerteActionAuto(h.deps);
    expect(b.envoyees).toBe(1);
    expect(h.envois).toHaveLength(1);
    expect(h.envois[0].to).toBe('ops@sansvisavis.fr');
    expect(h.envois[0].sujet).toContain('N°0930012500081');
    expect(h.marques).toEqual([7]); // marqué APRÈS l'envoi
  });

  it('non rattaché (numDau null) → alerte SANS n° de permis (permis à identifier)', async () => {
    const h = harness([cand({ reponseId: 8, numDau: null, autresPermis: [], communeNom: null })]);
    await executerAlerteActionAuto(h.deps);
    expect(h.envois[0].sujet).toContain('permis à identifier');
    expect(h.envois[0].sujet).not.toMatch(/N°\d/);
    expect(h.marques).toEqual([8]);
  });

  it('ISOLATION : un envoi qui échoue n’est PAS marqué (retenté à la passe suivante) et n’interrompt pas les autres', async () => {
    const h = harness([cand({ reponseId: 7 }), cand({ reponseId: 8 })], { envoyerThrows: true });
    const b = await executerAlerteActionAuto(h.deps);
    expect(b.envoyees).toBe(0);
    expect(b.erreurs).toBe(2);
    expect(h.marques).toEqual([]); // jamais marqué sans envoi → pas de doublon, pas de silence
  });

  it('opt-in désactivé → aucune alerte, aucun chargement de candidat', async () => {
    const chargerCandidats = vi.fn(async () => [cand()]);
    const b = await executerAlerteActionAuto({ ...harness([]).deps, lireConfig: async () => ({ active: false, email: 'ops@x.fr' }), chargerCandidats });
    expect(b.envoyees).toBe(0);
    expect(chargerCandidats).not.toHaveBeenCalled();
  });
});

describe('T7-B — depsReellesAlerteAction : requête candidats ancrée + idempotence', () => {
  it('chargerCandidats filtre nature=autre ET nature_classee_le IS NOT NULL (ancre) ET alerte_action_le IS NULL', async () => {
    const deps = depsReellesAlerteAction();
    const candidats = await deps.chargerCandidats();
    const sel = appels.find((a) => /SELECT r\.id::int AS reponse_id/i.test(a.sql))!;
    const sql = sel.sql.replace(/\s+/g, ' ');
    expect(sql).toContain("r.nature = 'autre'");
    expect(sql).toContain('r.nature_classee_le IS NOT NULL'); // ANCRE : jamais un message rétro-classé (Paris protégée)
    expect(sql).toContain('r.alerte_action_le IS NULL');      // idempotence : jamais deux fois
    // mapping numDau/autresPermis depuis num_daus
    expect(candidats[0]).toMatchObject({ reponseId: 7, numDau: '0930012500081', autresPermis: ['0930012500082'] });
    expect(candidats[1]).toMatchObject({ reponseId: 8, numDau: null, autresPermis: [] });
  });

  it('marquerEnvoyee pose alerte_action_le=now() (garde IS NULL), jamais demande.statut ni satisfait_le', async () => {
    const deps = depsReellesAlerteAction();
    await deps.marquerEnvoyee(7);
    const upd = appels.find((a) => /UPDATE demande_reponse/i.test(a.sql))!;
    const sql = upd.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('SET alerte_action_le = now()');
    expect(sql).toContain('WHERE id = $1 AND alerte_action_le IS NULL');
    expect(upd.params).toEqual([7]);
    expect(/SET statut|UPDATE demande\b|satisfait_le/i.test(sql)).toBe(false);
  });
});
