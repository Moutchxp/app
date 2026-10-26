import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT MONGA-LIEN-PAR-LE-GESTE — « le premier geste humain sur un mail Monga relie toute sa référence » (Arno, 26/10/2026).
 *
 * Les trois gestes de `gestes.ts` qui rattachent (un échange, un mail, un mail vers une carte neuve) posent le lien
 * référence → événement DANS leur transaction, quand on le leur demande (`relierMonga`, passé par les seules routes
 * humaines). Sans l'option — le cas du classement Monga de la relève — rien n'est relié.
 *
 * La base est simulée par une fausse requête qui répond selon le SENS du SQL : on éprouve le comportement et les
 * paramètres liés, jamais la forme d'une requête (AGENTS.md). Le SQL lui-même a été éprouvé sur le cluster jetable.
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');

interface Etat {
  lienExistant: { evenement_id: number; reference_evenement: string } | null;
  refsDuFil: string[];
  refsDuMail: string[];
}
let etat: Etat;
const appels: { sql: string; params: unknown[] }[] = [];

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = plat(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_fil WHERE id')) return { rows: [{ id: 5, etat: 'a_classer' }] };
  if (s.includes('SELECT reference FROM gestion_evenement')) return { rows: [{ reference: 'GES-2026-000009' }] };
  if (s.includes('FROM gestion_message WHERE id = $1 FOR UPDATE')) return { rows: [{ id: 3, fil_id: 5, objet: 'MNG-25126 - Nouveau commentaire' }] };
  if (s.includes('FROM gestion_monga_mail mm JOIN gestion_message m')) return { rows: etat.refsDuFil.map((reference) => ({ reference })) };
  if (s.includes('FROM gestion_monga_mail mm WHERE mm.message_id')) return { rows: etat.refsDuMail.map((reference) => ({ reference })) };
  if (s.includes('FROM gestion_monga_lien l')) return { rows: etat.lienExistant === null ? [] : [etat.lienExistant] };
  if (s.includes('INSERT INTO gestion_monga_lien')) return { rows: [{ id: 1 }] };
  if (s.includes('INSERT INTO gestion_affectation')) return { rows: [{ id: 77 }] };
  if (s.includes('INSERT INTO gestion_compteur')) return { rows: [{ dernier: 12 }] };
  if (s.includes('INSERT INTO gestion_evenement')) return { rows: [{ id: 12 }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a),
  withTransaction: (fn: (q: unknown) => unknown) => fn((...a: unknown[]) => (queryMock as (...x: unknown[]) => unknown)(...a)),
}));
const migration311 = vi.fn(async () => true);
vi.mock('./schema', () => ({
  deplacementsDeMailsDisponibles: async () => true,
  evenementQualifieDisponible: async () => false,
  rattacheDepuisDisponible: async () => false,
  mongaDisponible: () => migration311(),
  oublierSchema: () => {},
}));

import { affecter, deplacerMessage, deplacerMessageVersNouveau } from './gestes';

const ARNO = { id: 1, libelle: 'arno' };
const insertsLien = () => appels.filter((a) => a.sql.includes('INSERT INTO gestion_monga_lien'));
const journauxLien = () => appels.filter((a) => a.sql.includes('INSERT INTO gestion_journal') && a.params.includes('lien_monga'));
const indice = (frag: string) => appels.findIndex((a) => a.sql.includes(frag));

beforeEach(() => {
  appels.length = 0;
  queryMock.mockClear();
  migration311.mockReset(); migration311.mockResolvedValue(true);
  etat = { lienExistant: null, refsDuFil: ['MNG-25126'], refsDuMail: ['MNG-25126'] };
});

describe('(a) rattacher un ÉCHANGE à un événement ouvert', () => {
  it('référence sans lien → le lien est créé, signé par l’auteur du geste, et journalisé « relié par le rattachement du mail »', async () => {
    const r = await affecter(5, { evenementId: 9 }, ARNO, null, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, evenementId: 9, monga: [{ reference: 'MNG-25126', issue: 'cree' }] });
    expect(insertsLien()).toHaveLength(1);
    expect(insertsLien()[0].params).toEqual(['MNG-25126', 9, 1, 'arno']);
    expect(journauxLien()).toHaveLength(1);
    expect(journauxLien()[0].params.some((p) => typeof p === 'string' && p.includes('relié par le rattachement du mail'))).toBe(true);
  });

  it('LIRE → refuser → ÉCRIRE : le lien est lu (verrouillé) AVANT que l’affectation soit écrite, et posé APRÈS', async () => {
    await affecter(5, { evenementId: 9 }, ARNO, null, { relierMonga: true });
    expect(indice('FROM gestion_monga_lien l')).toBeLessThan(indice('INSERT INTO gestion_affectation'));
    expect(indice('INSERT INTO gestion_affectation')).toBeLessThan(indice('INSERT INTO gestion_monga_lien'));
  });

  it('déjà reliée au MÊME événement → rien de plus', async () => {
    etat.lienExistant = { evenement_id: 9, reference_evenement: 'GES-2026-000009' };
    const r = await affecter(5, { evenementId: 9 }, ARNO, null, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, monga: [{ issue: 'deja' }] });
    expect(insertsLien()).toHaveLength(0);
  });

  it('déjà reliée à un AUTRE événement → le lien ne bouge pas, l’échange est rattaché quand même, l’autre carte est nommée', async () => {
    etat.lienExistant = { evenement_id: 4, reference_evenement: 'GES-2026-000004' };
    const r = await affecter(5, { evenementId: 9 }, ARNO, null, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, monga: [{ issue: 'ailleurs', evenementReference: 'GES-2026-000004' }] });
    expect(insertsLien()).toHaveLength(0);
    expect(indice('INSERT INTO gestion_affectation')).toBeGreaterThan(-1);
  });

  it('plusieurs références dans l’échange → chacune selon les mêmes règles', async () => {
    etat.refsDuFil = ['MNG-30006', 'MNG-30005'];
    const r = await affecter(5, { evenementId: 9 }, ARNO, null, { relierMonga: true });
    expect(r.ok && r.monga?.map((m) => m.reference)).toEqual(['MNG-30005', 'MNG-30006']);
    expect(insertsLien()).toHaveLength(2);
  });

  it('(b) créer un événement depuis l’échange → motif « relié par l’ouverture de l’événement »', async () => {
    const r = await affecter(5, { nouveau: { objet: 'Fuite' } }, ARNO, null, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, evenementId: 12, monga: [{ issue: 'cree' }] });
    expect(journauxLien()[0].params.some((p) => typeof p === 'string' && p.includes('relié par l’ouverture de l’événement'))).toBe(true);
  });

  it('sans l’option → le geste d’avant, à l’identique : aucune lecture Monga, aucune sonde', async () => {
    const r = await affecter(5, { evenementId: 9 }, ARNO);
    expect(r).toEqual({ ok: true, evenementId: 9, reference: 'GES-2026-000009' });
    expect(appels.some((a) => a.sql.includes('gestion_monga'))).toBe(false);
    expect(migration311).not.toHaveBeenCalled();
  });

  it('migration 311 absente → le rattachement passe, aucune table Monga nommée', async () => {
    migration311.mockResolvedValue(false);
    const r = await affecter(5, { evenementId: 9 }, ARNO, null, { relierMonga: true });
    expect(r.ok).toBe(true);
    expect(appels.some((a) => a.sql.includes('gestion_monga'))).toBe(false);
  });
});

describe('(a) rattacher UN MAIL à un événement', () => {
  it('avec l’option (route humaine) → lien créé', async () => {
    const r = await deplacerMessage(3, 9, ARNO, undefined, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, monga: [{ reference: 'MNG-25126', issue: 'cree' }] });
    expect(insertsLien()[0].params).toEqual(['MNG-25126', 9, 1, 'arno']);
  });

  it('LA RELÈVE NE RELIE JAMAIS : le classement Monga appelle ce geste sans l’option → aucun lien, aucune lecture Monga', async () => {
    const r = await deplacerMessage(3, 9, { id: null, libelle: 'classement Monga' }, 'classé automatiquement — intervention Monga MNG-25126');
    expect(r).toEqual({ ok: true, evenementId: 9, reference: 'GES-2026-000009' });
    expect(appels.some((a) => a.sql.includes('gestion_monga'))).toBe(false);
  });

  it('un auteur « automatique » ne relie pas, même avec l’option (la base le refuserait) — le mail est rattaché quand même', async () => {
    const r = await deplacerMessage(3, 9, { id: null, libelle: 'automatique' }, undefined, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, monga: [] });
    expect(insertsLien()).toHaveLength(0);
  });

  it('un mail sans référence Monga → rien à relier', async () => {
    etat.refsDuMail = [];
    const r = await deplacerMessage(3, 9, ARNO, undefined, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, monga: [] });
    expect(insertsLien()).toHaveLength(0);
  });
});

describe('(b) créer un événement depuis CE mail', () => {
  it('lien créé vers la carte neuve, motif « relié par l’ouverture de l’événement »', async () => {
    const r = await deplacerMessageVersNouveau(3, { objet: 'Problème de chauffage' }, ARNO, undefined, { relierMonga: true });
    expect(r).toMatchObject({ ok: true, evenementId: 12, monga: [{ issue: 'cree' }] });
    expect(insertsLien()[0].params).toEqual(['MNG-25126', 12, 1, 'arno']);
    expect(journauxLien()[0].params.some((p) => typeof p === 'string' && p.includes('relié par l’ouverture de l’événement'))).toBe(true);
  });

  it('sans l’option (le « Créer l’événement » de l’encart Monga, qui relie lui-même ensuite) → aucun lien posé ici', async () => {
    await deplacerMessageVersNouveau(3, { objet: 'Problème de chauffage' }, ARNO, 'classé automatiquement — intervention Monga MNG-25126');
    expect(insertsLien()).toHaveLength(0);
  });
});
