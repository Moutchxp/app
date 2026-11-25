import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (24/11/2026) — « Restitution faite » / « Annuler » : gestes en ajout seul (513), journalisés au dossier de chaque locataire. */
const h = vi.hoisted(() => ({ query: vi.fn(), avec513: true, sql: [] as { s: string; p: unknown[] }[], restitutions: [] as { id: number; sortie: number; geste: string; annule: number | null }[] }));
vi.mock('../db/client', () => ({ query: h.query, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(h.query) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => h.avec513 }));
import { annulerRestitution, enregistrerRestitution, SQL_SANS_RESTITUTION_EN_COURS } from './restitutionVingtRepo';
import { MOTIF_SANS_513 } from './vingtPourcent';

const AUTEUR = { id: 1, libelle: 'Arno Test' };
const norm = (s: string) => s.replace(/\s+/g, ' ');
beforeEach(() => {
  h.avec513 = true; h.sql = []; h.restitutions = [];
  h.query.mockReset().mockImplementation(async (sql: string, p: unknown[] = []) => {
    const s = norm(sql); h.sql.push({ s, p });
    if (s.includes('FROM gestion_location_sortie_validee s WHERE s.id = $1') && s.includes('retenue_20 AS retenue')) {
      return { rows: Number(p[0]) === 7 ? [{ date_sortie: '2026-03-01', retenue: true, j: '2026-11-24' }] : Number(p[0]) === 8 ? [{ date_sortie: '2026-03-01', retenue: false, j: '2026-11-24' }] : [] };
    }
    if (s.startsWith('SELECT 1 AS id FROM gestion_location_sortie_validee s WHERE s.id = $1 AND NOT')) {
      const enCours = h.restitutions.some((r) => r.sortie === Number(p[0]) && r.geste === 'faite' && !h.restitutions.some((a) => a.annule === r.id));
      return { rows: enCours ? [{ id: '1' }] : [] };
    }
    if (s.startsWith("INSERT INTO gestion_location_restitution_vingt (sortie_validee_id, geste, date_restitution")) {
      const id = h.restitutions.length + 1; h.restitutions.push({ id, sortie: Number(p[0]), geste: 'faite', annule: null }); return { rows: [{ id: String(id) }] };
    }
    if (s.includes("FROM gestion_location_restitution_vingt f WHERE f.id = $1 AND f.geste = 'faite'")) {
      const r = h.restitutions.find((x) => x.id === Number(p[0]) && x.geste === 'faite');
      return { rows: r ? [{ sortie: String(r.sortie), date: '2026-11-20', montant: '312.50' }] : [] };
    }
    if (s.startsWith("INSERT INTO gestion_location_restitution_vingt (sortie_validee_id, geste, annule_id")) {
      if (h.restitutions.some((a) => a.annule === Number(p[1]))) return { rows: [] };
      const id = h.restitutions.length + 1; h.restitutions.push({ id, sortie: Number(p[0]), geste: 'annulee', annule: Number(p[1]) }); return { rows: [{ id: String(id) }] };
    }
    if (s.includes('SELECT DISTINCT o.locataire_id::text AS id')) return { rows: [{ id: '101' }, { id: '102' }] };
    return { rows: [] };
  });
});
const journaux = () => h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_journal'));

describe('« Restitution faite »', () => {
  const OK = { sortieId: 7, date: '2026-11-20', montantRestitue: '312,50', montantRetenuCharges: '40', commentaire: 'Virement _TEST' };
  it('🔴 enregistrée, puis journalisée dans le dossier de CHAQUE locataire de la sortie (entité « annuaire »)', async () => {
    expect(await enregistrerRestitution(OK, AUTEUR)).toEqual({ etat: 'ok', data: { id: 1 } });
    const ins = h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_location_restitution_vingt'))!;
    expect(ins.p).toEqual([7, '2026-11-20', 312.5, 40, 'Virement _TEST', 1, 'Arno Test', null, null]); // 🔴 (22h06, 518) + 20 % et motif (inconnus ici)
    expect(journaux().map((j) => [j.p[0], j.p[1], j.p[2]])).toEqual([
      [101, 'location_restitution_20_faite', 'restitution des 20 % faite le 20/11/2026 : 312,50 € restitués, 40,00 € retenus au titre des charges'],
      [102, 'location_restitution_20_faite', 'restitution des 20 % faite le 20/11/2026 : 312,50 € restitués, 40,00 € retenus au titre des charges'],
      // 🔴 (Arno, 25/11/2026) et dans l'historique du BIEN de la sortie (paramètre : la sortie ; le bien lu sur s.lot_id)
      [7, 'location_restitution_20_faite', 'restitution des 20 % faite le 20/11/2026 : 312,50 € restitués, 40,00 € retenus au titre des charges']]);
    expect(journaux()[2].s).toContain("INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) SELECT 'annuaire_lot', s.lot_id, $2, NULL, $3, $4, $5, $6 FROM gestion_location_sortie_validee s WHERE s.id = $1");
    expect(journaux()[2].p[3]).toBe('Virement _TEST — sortie validée 7, restitution 1');
    expect(norm(SQL_SANS_RESTITUTION_EN_COURS)).toContain("f.geste = 'faite' AND NOT EXISTS (SELECT 1 FROM gestion_location_restitution_vingt a WHERE a.annule_id = f.id)");
  });
  it('🔴 une deuxième fois sur la même sortie : refus, rien n’est écrit ; sans retenue, ou date avant la sortie / dans le futur : refus', async () => {
    await enregistrerRestitution(OK, AUTEUR);
    h.sql = [];
    expect(await enregistrerRestitution(OK, AUTEUR)).toMatchObject({ etat: 'refus', motif: expect.stringContaining('déjà enregistrée') });
    expect(await enregistrerRestitution({ ...OK, sortieId: 8 }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(await enregistrerRestitution({ ...OK, date: '2026-02-01' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'date' });
    expect(await enregistrerRestitution({ ...OK, date: '2026-12-01' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'date' });
    expect(await enregistrerRestitution({ ...OK, montantRestitue: '' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montantRestitue' });
    expect(h.sql.some((x) => x.s.startsWith('INSERT'))).toBe(false);
  });
  it('sans la 513 : refus dit, rien n’est lu ni écrit', async () => {
    h.avec513 = false;
    expect(await enregistrerRestitution(OK, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_SANS_513 });
    expect(h.sql).toEqual([]);
  });
});

describe('« Annuler » une restitution', () => {
  it('🔴 un geste « annulee » (la restitution reste), journalisé pour chaque locataire ; une deuxième annulation : refus', async () => {
    await enregistrerRestitution({ sortieId: 7, date: '2026-11-20', montantRestitue: '312,50' }, AUTEUR);
    h.sql = [];
    expect(await annulerRestitution({ restitutionId: 1 }, AUTEUR)).toEqual({ etat: 'ok', data: { id: 2 } });
    expect(h.restitutions).toEqual([{ id: 1, sortie: 7, geste: 'faite', annule: null }, { id: 2, sortie: 7, geste: 'annulee', annule: 1 }]);
    expect(journaux().map((j) => [j.p[0], j.p[1], j.p[2]])).toEqual([
      [101, 'location_restitution_20_annulee', 'restitution des 20 % du 20/11/2026 (312,50 €) annulée'],
      [102, 'location_restitution_20_annulee', 'restitution des 20 % du 20/11/2026 (312,50 €) annulée'],
      [7, 'location_restitution_20_annulee', 'restitution des 20 % du 20/11/2026 (312,50 €) annulée']]);     // 🔴 (25/11) au bien aussi
    expect(journaux()[2].s).toContain("SELECT 'annuaire_lot', s.lot_id,");
    // aucune ligne modifiée ni effacée
    expect(h.sql.some((x) => /^(UPDATE|DELETE)/.test(x.s))).toBe(false);
    expect(await annulerRestitution({ restitutionId: 1 }, AUTEUR)).toMatchObject({ etat: 'refus', motif: expect.stringContaining('déjà annulée') });
    // annulée : la sortie peut de nouveau être restituée
    expect((await enregistrerRestitution({ sortieId: 7, date: '2026-11-21', montantRestitue: 300 }, AUTEUR)).etat).toBe('ok');
  });
});

/** 🔴🔴 Arno (25/11/2026, 22h06) — « 20 % retenus » prérempli, « Montant restitué », différence ; une différence exige un MOTIF ; jamais plus que les 20 %. */
describe('🔴🔴 la restitution : 20 % retenus, différence et motif', () => {
  const OK = { sortieId: 7, date: '2026-11-20', montantRestitue: '370,00', montantVingt: '400,00', commentaire: '' };
  it('différence sans motif : refus (champ « motifDifference »), rien n’est écrit ; restitué > 20 % : refus', async () => {
    expect(await enregistrerRestitution({ ...OK, motifDifference: '  ' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'motifDifference' });
    expect(await enregistrerRestitution({ ...OK, montantRestitue: '401' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montantRestitue' });
    expect(await enregistrerRestitution({ ...OK, montantVingt: '' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montantVingt' });
    expect(h.sql.some((x) => x.s.startsWith('INSERT'))).toBe(false);
  });
  it('partielle : 20 %, motif, différence comme « retenu » ; les 20 % de la fenêtre deviennent le montant de la sortie ; l’historique dit le motif', async () => {
    expect(await enregistrerRestitution({ ...OK, motifDifference: 'régularisation de charges' }, AUTEUR)).toEqual({ etat: 'ok', data: { id: 1 } });
    const ins = h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_location_restitution_vingt'))!;
    expect(ins.s).toContain('montant_vingt, motif_difference');
    expect(ins.p).toEqual([7, '2026-11-20', 370, 30, null, 1, 'Arno Test', 400, 'régularisation de charges']);
    const m = h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_location_montant_vingt'))!;
    expect(m.p).toEqual([7, 400, 'saisi', null, 1, 'Arno Test']);
    expect(journaux()[0].p[2]).toBe('restitution des 20 % faite le 20/11/2026 : 370,00 € restitués sur 400,00 € retenus à la sortie, 30,00 € conservés (motif : régularisation de charges)');
  });
  it('totale : pas de motif demandé ni gardé', async () => {
    expect(await enregistrerRestitution({ ...OK, montantRestitue: '400', motifDifference: 'inutile' }, AUTEUR)).toEqual({ etat: 'ok', data: { id: 1 } });
    expect(h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_location_restitution_vingt'))!.p).toEqual([7, '2026-11-20', 400, null, null, 1, 'Arno Test', 400, null]);
  });
});

/**
 * 🔴 (Arno, 26/11/2026) — « dans « Restitutions faites », « Enregistrée par » doit afficher « Prénom NOM » de l'utilisateur (comme ailleurs dans l'application,
 * ex. « saisie par Arnaud JOREL ») […]. Si le nom est introuvable, afficher l'adresse mail en dernier recours. »
 */
describe('🔴 « Enregistrée par » : Prénom NOM, l’adresse mail en dernier recours', () => {
  it('auteurRestitution : le compte retrouvé → « Arnaud JOREL » ; introuvable → le libellé saisi (adresse ou nom d’essai)', async () => {
    const { auteurRestitution } = await import('./restitutionVingtRepo');
    expect(auteurRestitution({ par: 'a.jorel@sansvisavis.com', prenom: 'Arnaud', nom: 'Jorel' })).toBe('Arnaud JOREL');
    expect(auteurRestitution({ par: 'x@exemple.test', prenom: null, nom: null })).toBe('x@exemple.test');
    expect(auteurRestitution({ par: 'Gestion locative', prenom: null, nom: null })).toBe('Gestion locative');
    expect(auteurRestitution({ par: 'a.jorel@sansvisavis.com', prenom: '  ', nom: '' })).toBe('a.jorel@sansvisavis.com');
  });
  it('lireRestitutionsFaites : le compte est lu par son n° (sinon par l’identifiant écrit en libellé) ; « par » = Prénom NOM', async () => {
    h.avec513 = true;
    h.query.mockReset().mockImplementation(async (sql: string) => (sql.includes('FROM gestion_location_restitution_vingt f JOIN gestion_location_sortie_validee')
      ? { rows: [
        { id: '6', sortie: '40', noms: ['LACROIX Manon'], logement: '11 rue', date_sortie: '2026-03-31', date: '2026-11-21', restitue: '243.60', retenu: '36.40', commentaire: null,
          motif: 'm', par: 'a.jorel@sansvisavis.com', le: '2026-11-26 00:02:14.1', prenom: 'Arnaud', nom: 'Jorel' },
        { id: '9', sortie: '41', noms: ['X'], logement: null, date_sortie: '2026-03-31', date: '2026-11-21', restitue: '1', retenu: null, commentaire: null,
          motif: null, par: 'inconnu@exemple.test', le: '2026-11-26 00:03:00', prenom: null, nom: null }] }
      : { rows: [] }));
    const { lireRestitutionsFaites } = await import('./restitutionVingtRepo');
    const r = await lireRestitutionsFaites();
    expect(r.map((x) => [x.par, x.le])).toEqual([['Arnaud JOREL', '2026-11-26 00:02'], ['inconnu@exemple.test', '2026-11-26 00:03']]);
    const sql = String(h.query.mock.calls.find((c) => String(c[0]).includes('FROM gestion_location_restitution_vingt f JOIN'))![0]).replace(/\s+/g, ' ');
    expect(sql).toContain('LEFT JOIN admin_utilisateur u ON (f.saisie_par IS NOT NULL AND u.id = f.saisie_par)');
    expect(sql).toContain("lower(u.identifiant) = lower(f.saisie_par_libelle)");
  });
});
