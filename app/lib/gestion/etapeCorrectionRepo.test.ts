import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT FRISE-CORRECTION-MANUELLE — le dépôt des corrections. Base simulée par une requête qui répond selon le SENS du SQL :
 * on éprouve les décisions, les paramètres liés et l'ordre lire → refuser → écrire, jamais la forme d'une requête. Le SQL
 * lui-même a été éprouvé sur le cluster jetable (gestion_jetable), avant et après la migration 429.
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');
const appels: { sql: string; params: unknown[] }[] = [];
let ligne: Record<string, unknown> | null;
let doublon = false;
let ouvertes: boolean[] = [];

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = plat(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_monga_etape WHERE id = $1 FOR UPDATE')) return { rows: ligne === null ? [] : [ligne] };
  if (s.includes('SELECT 1 FROM gestion_monga_etape WHERE message_id')) return { rows: doublon ? [{ '?column?': 1 }] : [] };
  if (s.includes('RETURNING type, statut')) return { rows: [{ type: 'commentaire', statut: 'vif' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a),
  withTransaction: (fn: (q: unknown) => unknown) => fn((...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a)),
}));
const migration429 = vi.fn(async () => true);
vi.mock('./schema', () => ({ correctionEtapeDisponible: () => migration429() }));
vi.mock('./mongaEtapeRepo', () => ({
  evenementsDeLaCarte: async () => [37],
  verrouillerEvenements: async () => undefined,
  ouvertDansLaTransaction: async () => ouvertes.shift() ?? true,
}));

import { changerPresenceEtape, corrigerEtape, revenirAuClassementAutomatique } from './etapeCorrectionRepo';

const ARNO = { id: 4, libelle: 'Arnaud' };
const updates = () => appels.filter((a) => a.sql.startsWith('UPDATE gestion_monga_etape'));
const journaux = () => appels.filter((a) => a.sql.includes('INSERT INTO gestion_journal'));
const indice = (f: string) => appels.findIndex((a) => a.sql.includes(f));

beforeEach(() => {
  appels.length = 0; queryMock.mockClear(); doublon = false; ouvertes = [];
  migration429.mockResolvedValue(true);
  ligne = {
    id: 596, type: 'commentaire', titre: null, jour: '2026-10-23', survenu_le: '2026-10-23 16:39:00+02', heure_connue: false,
    jour_connu: true, statut: 'vif', source: 'monga', certitude: 'fiable', message_id: 900, auto_type: null,
  };
});

describe('corriger', () => {
  it('point → carte : les paramètres liés portent la nature, le titre, le jour et l’auteur ; l’origine est gardée ; journalisé', async () => {
    const r = await corrigerEtape({ id: 596, voulu: { type: 'rdv_intervention', titre: 'RDV chaudière', jour: '2026-10-28' }, auteur: ARNO });
    expect(r).toEqual({ ok: true, ouvertAvant: null, ouvertApres: null });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].params).toEqual([596, 'rdv_intervention', 'RDV chaudière', '2026-10-28', 4, 'Arnaud', false]);
    expect(updates()[0].sql).toContain('auto_type = CASE WHEN source = \'monga\' AND auto_type IS NULL THEN type');
    expect(journaux()).toHaveLength(1);
    expect(journaux()[0].params).toEqual(expect.arrayContaining([37, 'correction_etape', 4, 'Arnaud']));
    expect(indice('FOR UPDATE')).toBeLessThan(indice('UPDATE gestion_monga_etape SET'));
  });

  it('même jour : la date est gardée (dernier paramètre lié = vrai)', async () => {
    await corrigerEtape({ id: 596, voulu: { type: 'note', titre: null, jour: '2026-10-23' }, auteur: ARNO });
    expect(updates()[0].params.at(-1)).toBe(true);
  });

  it('sans la migration 429 → refus « après la mise à jour », AUCUNE requête', async () => {
    migration429.mockResolvedValue(false);
    const r = await corrigerEtape({ id: 596, voulu: { type: 'note', titre: null, jour: null }, auteur: ARNO });
    expect(r).toMatchObject({ ok: false, code: 'sans_schema' });
    expect(appels).toHaveLength(0);
  });

  it('refus (nature de borne, étape retirée, doublon du mail) : rien n’est écrit', async () => {
    ligne = { ...(ligne as object), type: 'cloture' };
    expect(await corrigerEtape({ id: 596, voulu: { type: 'note', titre: null, jour: null }, auteur: ARNO })).toMatchObject({ ok: false, code: 'refus' });
    ligne = { ...(ligne as object), type: 'commentaire', statut: 'retire' };
    expect(await corrigerEtape({ id: 596, voulu: { type: 'note', titre: null, jour: null }, auteur: ARNO })).toMatchObject({ ok: false });
    ligne = { ...(ligne as object), statut: 'vif' };
    doublon = true;
    expect(await corrigerEtape({ id: 596, voulu: { type: 'rappel_devis', titre: null, jour: null }, auteur: ARNO })).toMatchObject({ ok: false, code: 'refus' });
    expect(updates()).toHaveLength(0);
    expect(journaux()).toHaveLength(0);
  });

  it('étape inconnue → « inconnue »', async () => {
    ligne = null;
    expect(await corrigerEtape({ id: 1, voulu: { type: 'note', titre: null, jour: null }, auteur: ARNO })).toMatchObject({ ok: false, code: 'inconnue' });
  });
});

describe('retirer / remettre', () => {
  it('retirer : statut « retire », retiré par l’auteur, origine gardée, journalisé — jamais un DELETE', async () => {
    const r = await changerPresenceEtape(596, 'retire', ARNO);
    expect(r.ok).toBe(true);
    expect(updates()[0].sql).toContain("statut = 'retire'");
    expect(updates()[0].params).toEqual([596, 4, 'Arnaud']);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
    expect(journaux()).toHaveLength(1);
  });

  it('remettre : statut « vif », une étape écartée redevient confirmée', async () => {
    ligne = { ...(ligne as object), statut: 'retire', certitude: 'ecartee' };
    await changerPresenceEtape(596, 'vif', ARNO);
    expect(updates()[0].sql).toContain("statut = 'vif'");
    expect(updates()[0].sql).toContain("WHEN certitude = 'ecartee' THEN 'confirmee'");
  });

  it('retirer une borne relit l’état avant et après (l’écran apprend que l’événement a changé)', async () => {
    ligne = { ...(ligne as object), type: 'reouverture' };
    ouvertes = [true, false];
    expect(await changerPresenceEtape(596, 'retire', ARNO)).toEqual({ ok: true, ouvertAvant: true, ouvertApres: false });
  });

  it('déjà dans cet état → refus, rien écrit', async () => {
    expect(await changerPresenceEtape(596, 'vif', ARNO)).toMatchObject({ ok: false, code: 'refus' });
    expect(updates()).toHaveLength(0);
  });
});

describe('revenir au classement automatique', () => {
  it('étape Monga corrigée : remet auto_* et efface la trace de la ligne ; journalisé', async () => {
    ligne = { ...(ligne as object), type: 'rdv_intervention', auto_type: 'commentaire' };
    const r = await revenirAuClassementAutomatique(596, ARNO);
    expect(r.ok).toBe(true);
    expect(updates()[0].sql).toContain('type = auto_type');
    expect(updates()[0].sql).toContain('corrige_le = NULL');
    expect(journaux()).toHaveLength(1);
  });

  it('étape jamais corrigée, ou posée à la main → refus, rien écrit', async () => {
    expect(await revenirAuClassementAutomatique(596, ARNO)).toMatchObject({ ok: false, code: 'refus' });
    ligne = { ...(ligne as object), source: 'manuelle', auto_type: null };
    expect(await revenirAuClassementAutomatique(596, ARNO)).toMatchObject({ ok: false, code: 'refus' });
    expect(updates()).toHaveLength(0);
  });

  it('le mail porte déjà une étape de la nature d’origine → refus, rien écrit', async () => {
    ligne = { ...(ligne as object), type: 'rdv_intervention', auto_type: 'commentaire' };
    doublon = true;
    expect(await revenirAuClassementAutomatique(596, ARNO)).toMatchObject({ ok: false, code: 'refus' });
    expect(updates()).toHaveLength(0);
  });
});
