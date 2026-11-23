import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴🔴 Arno (17/11/2026, 481) — « + Ajouter un PV d'AG » et « Corriger » de la fiche Copropriété, AU SERVEUR, sur une base SIMULÉE : refus AVANT
 * toute écriture (sans la 481, date à venir, type manquant, copropriété sans fiche, saisie déjà corrigée, rien de changé) ; un PV = une date
 * OFFICIELLE d'AG tenue, AGO ou AGE ; une correction AJOUTE une ligne qui désigne celle qu'elle corrige (rien n'est effacé). Données fictives.
 */
const h = vi.hoisted(() => ({ avec481: true, copro: true, actives: [] as Record<string, unknown>[], dejaCorrigee: 0, sql: [] as { s: string; p: unknown[] }[] }));
const rep = async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT c.id::text, c.libelle, c.cle_immeuble AS cle FROM gestion_copropriete c')) return { rows: h.copro ? [{ id: '5', libelle: 'Résidence _TEST AG', cle: 'residence test ag' }] : [] };
  if (s.startsWith('SELECT cle_immeuble AS cle FROM gestion_copropriete WHERE id = $1')) return { rows: [{ cle: 'residence test ag' }] };
  if (s.includes('FROM gestion_copropriete_ag h')) return { rows: h.actives };
  if (s.startsWith('SELECT id::text FROM gestion_copropriete_ag WHERE id = $1 FOR UPDATE')) return { rows: h.actives.some((a) => a.id === String(p[0])) ? [{ id: String(p[0]) }] : [] };
  if (s.startsWith('SELECT count(*)::text AS n FROM gestion_copropriete_ag WHERE corrige_id')) return { rows: [{ n: String(h.dejaCorrigee) }] };
  return { rows: [] };
};
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => rep(s, p), withTransaction: (fn: (q: unknown) => Promise<unknown>) => fn((s: string, p?: unknown[]) => rep(s, p)) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'corrige_id' ? h.avec481 : true) }));
vi.mock('./mailPortefeuilleRepo', () => ({ emailDeLAuteur: async () => ({ email: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nomFamille: 'Jorel' }) }));
const { enregistrerPv, enregistrerAgOfficielle, agOfficiellesValides } = await import('./agCoproprieteRepo');

const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const LIGNE = (o: Record<string, unknown> = {}) => ({ id: '7', type_ag: 'derniere', statut: 'officielle', date_ag: '2015-03-12', confirmation: false, origine: 'reprise',
  saisie_le: '2026-11-01T10:00:00Z', saisie_par_libelle: 'reprise', sortie_validee_id: null, copropriete_id: '5', nature_ag: 'ago', note: null, c_id: null, c_date: null, c_nature: null, c_note: null, ...o });
const insertions = () => h.sql.filter((x) => x.s.startsWith('INSERT'));
beforeEach(() => { h.avec481 = true; h.copro = true; h.actives = [LIGNE()]; h.dejaCorrigee = 0; h.sql = []; });

describe('🔴🔴 enregistrer un PV d’AG', () => {
  it('refus AVANT toute écriture : sans la 481 ; date à venir ; type manquant ; copropriété sans fiche', async () => {
    h.avec481 = false;
    expect(await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2024-03-12', nature: 'ago' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('migration 481') });
    h.avec481 = true;
    expect(await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2999-03-12', nature: 'ago' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('une date à venir n’est pas un PV') });
    expect(await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2024-03-12' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('Choisissez le type') });
    h.copro = false;
    expect(await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2024-03-12', nature: 'age' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('pas encore de fiche') });
    expect(insertions()).toEqual([]);
  });
  it('un ajout : une ligne « dernière AG tenue », officielle, AGE, la note, d’origine « fiche copropriété », QUI l’a saisie ; aucune correction', async () => {
    expect((await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2024-06-01', nature: 'age', note: ' travaux ' }, AUTEUR)).ok).toBe(true);
    const [i] = insertions();
    // (23/11/2026) le type est désormais un paramètre lié : le COMPORTEMENT (paramètres) et des fragments du SQL, jamais sa forme exacte
    expect(i.s).toContain("'officielle', $2::date, 'fiche_copropriete'");
    expect(i.p).toEqual([5, '2024-06-01', 2, 'Arnaud JOREL', 'age', 'travaux', null, 'derniere']);
  });
  it('« Corriger » : une ligne de PLUS qui désigne celle qu’elle corrige (la reprise devient une AGE) ; jamais d’UPDATE ni de DELETE', async () => {
    expect((await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2015-03-12', nature: 'age', corrige: 7 }, AUTEUR)).ok).toBe(true);
    expect(insertions()[0].p).toEqual([5, '2015-03-12', 2, 'Arnaud JOREL', 'age', null, 7, 'derniere']);
    expect(h.sql.some((x) => /^(UPDATE|DELETE)\b/.test(x.s))).toBe(false);
  });
  it('« Corriger » refusé : saisie déjà corrigée, inconnue, ou rien de changé — aucune écriture', async () => {
    h.dejaCorrigee = 1;
    expect(await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2015-03-13', nature: 'ago', corrige: 7 }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('déjà été corrigée') });
    h.dejaCorrigee = 0;
    expect((await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2015-03-13', nature: 'ago', corrige: 99 }, AUTEUR)).ok).toBe(false);
    expect(await enregistrerPv({ immeuble: 'Résidence _TEST AG', date: '2015-03-12', nature: 'ago', corrige: 7 }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('Rien n’a changé') });
    expect(insertions()).toEqual([]);
  });
});

/** 🔴🔴 Arno (17/11/2026) : « la saisie va dans la MÊME base officielle des PV d'AG de la copropriété […] un PV saisi avant l'enregistrement du bien est rattaché à la copropriété à l'enregistrement. » */
describe('🔴🔴 les PV saisis avec le bien (« Nouveau bien », « Modifier le bien »)', () => {
  it('le contrôle AVANT toute écriture : rien → rien ; une date à venir, un type manquant, plus de 10, sans la 481 : refus', async () => {
    const { pvsDuBienValides } = await import('./agCoproprieteRepo');
    expect(await pvsDuBienValides(undefined)).toEqual({ ok: true, pvs: [] });
    expect(await pvsDuBienValides([{ date: '2999-01-01', nature: 'ago' }])).toMatchObject({ ok: false, motif: expect.stringContaining('PV d’AG : Le PV d’une AG porte une date déjà passée') });
    expect(await pvsDuBienValides([{ date: '2024-03-12' }])).toMatchObject({ ok: false, motif: expect.stringContaining('Choisissez le type') });
    expect(await pvsDuBienValides(Array.from({ length: 11 }, () => ({ date: '2024-03-12', nature: 'ago' })))).toMatchObject({ ok: false });
    h.avec481 = false;
    expect(await pvsDuBienValides([{ date: '2024-03-12', nature: 'ago' }])).toMatchObject({ ok: false, motif: expect.stringContaining('migration 481') });
    h.avec481 = true;
    expect(await pvsDuBienValides([{ date: '2024-03-12', nature: 'age', note: ' travaux ' }])).toEqual({ ok: true, pvs: [{ date: '2024-03-12', nature: 'age', note: 'travaux' }] });
  });
});

/**
 * 🔴🔴 Arno (23/11/2026) — « + Ajouter une AG » de la fiche Copropriété : « Date officielle uniquement : l'assemblée a eu lieu ou sa date est fixée par
 * convocation. » Passée : un PV ; à venir : une « prochaine AG » OFFICIELLE. Jamais une projection. Même table, même origine, « Corriger » conservé.
 */
describe('🔴🔴 « + Ajouter une AG » (date officielle, tenue ou fixée par convocation)', () => {
  it('une date passée : « dernière AG tenue » ; une date à venir : « prochaine AG », toujours OFFICIELLE, origine « fiche copropriété »', async () => {
    expect((await enregistrerAgOfficielle({ immeuble: 'Résidence _TEST AG', date: '2024-06-01', nature: 'ago' }, AUTEUR)).ok).toBe(true);
    expect((await enregistrerAgOfficielle({ immeuble: 'Résidence _TEST AG', date: '2999-03-12', nature: 'age' }, AUTEUR)).ok).toBe(true);
    const [a, b] = insertions();
    expect(a.p).toEqual([5, '2024-06-01', 2, 'Arnaud JOREL', 'ago', null, null, 'derniere']);
    expect(b.p).toEqual([5, '2999-03-12', 2, 'Arnaud JOREL', 'age', null, null, 'prochaine']);
    for (const x of [a, b]) expect(x.s).toContain("'officielle', $2::date, 'fiche_copropriete'");
  });
  it('refus AVANT toute écriture : date ou type manquant, copropriété sans fiche', async () => {
    expect(await enregistrerAgOfficielle({ immeuble: 'Résidence _TEST AG', nature: 'ago' }, AUTEUR)).toMatchObject({ ok: false, motif: 'Renseignez la date de l’AG.' });
    expect(await enregistrerAgOfficielle({ immeuble: 'Résidence _TEST AG', date: '2024-06-01' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('Choisissez le type') });
    h.copro = false;
    expect(await enregistrerAgOfficielle({ immeuble: 'Résidence _TEST AG', date: '2024-06-01', nature: 'ago' }, AUTEUR)).toMatchObject({ ok: false, motif: expect.stringContaining('pas encore de fiche') });
    expect(insertions()).toEqual([]);
  });
  it('« Corriger » une AG officielle à venir : une ligne de PLUS ; jamais d’UPDATE ni de DELETE', async () => {
    h.actives = [LIGNE({ id: '8', type_ag: 'prochaine', date_ag: '2999-03-12', origine: 'fiche_copropriete' })];
    expect((await enregistrerAgOfficielle({ immeuble: 'Résidence _TEST AG', date: '2999-03-19', nature: 'ago', corrige: 8 }, AUTEUR)).ok).toBe(true);
    expect(insertions()[0].p).toEqual([5, '2999-03-19', 2, 'Arnaud JOREL', 'ago', null, 8, 'prochaine']);
    expect(h.sql.some((x) => /^(UPDATE|DELETE)\b/.test(x.s))).toBe(false);
  });
  it('les AG d’une fiche NOUVELLE : contrôlées avant toute écriture (date, type, 10 au plus, la 481)', async () => {
    expect(await agOfficiellesValides(undefined)).toEqual({ ok: true, ags: [] });
    expect(await agOfficiellesValides([{ date: '2999-03-12', nature: 'ago' }])).toEqual({ ok: true, ags: [{ date: '2999-03-12', nature: 'ago', note: null }] });
    expect(await agOfficiellesValides([{ date: '2024-03-12' }])).toMatchObject({ ok: false, motif: expect.stringContaining('AG : Choisissez le type') });
    expect(await agOfficiellesValides(Array.from({ length: 11 }, () => ({ date: '2024-03-12', nature: 'ago' })))).toMatchObject({ ok: false });
    h.avec481 = false;
    expect(await agOfficiellesValides([{ date: '2024-03-12', nature: 'ago' }])).toMatchObject({ ok: false, motif: expect.stringContaining('migration 481') });
    expect(insertions()).toEqual([]);
  });
});
