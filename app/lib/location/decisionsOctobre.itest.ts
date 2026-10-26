import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { gardeBaseJetable } from '../../scripts/baseJetable';

/**
 * ══ 🔴🔴 LOT DÉCISIONS DU 26/10/2026 (CHALAH / REIFHI, migration 431) — L'ÉPREUVE RÉELLE, SUR LA BASE JETABLE SEULEMENT ═════════════════
 *   A. dès le 01/10/2026, une annexe ne compte jamais comme une gestion à part (la bascule de la 426, avancée par une NOUVELLE valeur) ;
 *   B. un bien rentré vide entre dans le suivi au 1er locataire ; sans locataire : « en attente », ni compté ni effacé ; occupé : le mandat ;
 *   les mois avant octobre 2026 ne bougent pas (lignes et stock), la 431 lue AVANT puis APRÈS sur les mêmes données ;
 *   C. conversion d'une ligne « Bail » en « Mandat de gestion seul » et son annulation ;
 *   D. le script : dry-run sans écriture ; --appliquer : bien, date, bail ET ligne de suivi en une transaction.
 * La base doit avoir la 430 et PAS ENCORE la 431 : l'épreuve l'applique elle-même au milieu (le fichier tel qu'il est livré).
 * 🔒 REFUSE DE DÉMARRER si DATABASE_URL ne vise pas `gestion_jetable`.
 *   DATABASE_URL=postgresql://postgres@localhost:55432/gestion_jetable npx vitest run --config vitest.integration.config.ts app/lib/location/decisionsOctobre.itest.ts
 */
const garde = gardeBaseJetable(process.env.DATABASE_URL);
if (garde !== null) throw new Error(garde);
vi.mock('node:fs', async (orig) => ({ ...(await orig<typeof import('node:fs')>()), writeFileSync: vi.fn(), mkdirSync: vi.fn() }));
vi.mock('./sondeLocation', async (orig) => {
  // La sonde mémorise un « non » quelques secondes : on la relit à chaque appel, pour voir la 431 dès qu'elle est appliquée.
  const { query } = await import('../db/client');
  void orig;
  return {
    colonneExisteMemo: async (t: string, c: string) => ((await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [t, c])).rows[0]?.n ?? 0) > 0,
    oublierSchemaLocation: () => {},
  };
});

const { query, pool } = await import('../db/client');
const { lireLignesGestion, lireGestion, lireGestionsEnAttente } = await import('./suivi/tableauBordRepo');
const { lireRegleAnnexes } = await import('./suivi/annexesGestionRepo');
const { gestionDuMois, sectionGestion } = await import('./suivi/tableauBord');
const { stockGestion } = await import('./suivi/annexesGestion');
const { convertirEnMandatSeul, annulerConversion } = await import('./suivi/conversionMandatRepo');
const { main } = await import('../../scripts/rentre-occupe');

const AUTEUR = { id: 3, libelle: 'a.jorel@sansvisavis.com' };
let proprio = 0; let locataire = 0; let rang = 0;
const lot = async (o: { adresse: string; depuis: string; categorie?: string; occupe?: boolean | null; parent?: number }): Promise<number> => {
  const id = Number((await query<{ id: string }>(
    `INSERT INTO gestion_annuaire_lot (wippimmo_id, proprietaire_id, proprietaire_texte, adresse, commune, categorie, en_gestion, statut_bien_depuis, entre_occupe)
     VALUES ($1, $2, 'CHALAH Ramdane', $3, 'GENNEVILLIERS', $4, true, $5::date, $6) RETURNING id::text`,
    [`ep-${(rang += 1)}`, proprio, o.adresse, o.categorie ?? 'logement', o.depuis, o.occupe ?? null])).rows[0].id);
  if (o.parent !== undefined) await query('INSERT INTO gestion_lot_annexe (annexe_id, parent_id, pose_par_libelle) VALUES ($1, $2, $3)', [id, o.parent, 'épreuve']);
  return id;
};
const bail = async (lots: number[], entree: string): Promise<number> => {
  const b = Number((await query<{ id: string }>('INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, $2::date) RETURNING id::text', [lots[0], entree])).rows[0].id);
  for (const l of lots) {
    await query(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, bail_id) VALUES ($1, $2, $3, $4, $5::date, $6)`,
      [`occ-${b}-${l}`, locataire, l, `w-${l}`, entree, b]);
  }
  return b;
};
const lignesDe = async (debut: string, fin: string) => (await lireLignesGestion(debut, fin)).filter((l) => l.apres === 'en_gestion')
  .map((l) => `${l.lotId}@${l.effetLe}`).sort();
const etat = async () => {
  const regle = await lireRegleAnnexes();
  const r = { bascule: regle.basculeAnnexes, annexes: new Set(regle.annexes) };
  const g = await lireGestion('2025-01-01');
  const lignes = await lireLignesGestion('2025-01-01', '2026-12-31');
  return { regle: r, lignes, oct: gestionDuMois(lignes, '2026-10', r), sept: gestionDuMois(lignes, '2026-09', r),
    stock: sectionGestion(g.transitions, stockGestion(g.stock, g.transitions, r), '2026-12', r) };
};

const L: Record<string, number> = {};
beforeAll(async () => {
  await query(`INSERT INTO admin_utilisateur (id, identifiant, mot_de_passe, role, prenom, nom) VALUES (3, 'a.jorel@sansvisavis.com', 'x', 'administrateur', 'Arnaud', 'JOREL')`);
  proprio = Number((await query<{ id: string }>(`INSERT INTO gestion_annuaire_proprietaire (wippimmo_id, nom, nom_complet, nom_normalise) VALUES ('ep-p', 'CHALAH', 'CHALAH Ramdane', 'chalah ramdane') RETURNING id::text`)).rows[0].id);
  locataire = Number((await query<{ id: string }>(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise) VALUES ('ep-l', 'ep-l', 'REIFHI Assia', 'reifhi assia') RETURNING id::text`)).rows[0].id);
  // Septembre (avant la bascule) : un logement et sa cave, loués depuis 2014 ; la cave compte encore comme une gestion.
  L.sept = await lot({ adresse: '1 Rue Septembre', depuis: '2026-09-10' });
  L.septCave = await lot({ adresse: '1 Rue Septembre', depuis: '2026-09-10', categorie: 'cave', parent: L.sept });
  await bail([L.sept, L.septCave], '2014-03-01');
  // Le cas REIFHI : logement + cave entrés le 22/10, bail de 2014 sur les deux, rien de renseigné.
  L.reifhi = await lot({ adresse: '25 Rue Henri Barbusse', depuis: '2026-10-22' });
  L.cave = await lot({ adresse: '25 Rue Henri Barbusse', depuis: '2026-10-22', categorie: 'cave', parent: L.reifhi });
  L.bail536 = await bail([L.reifhi, L.cave], '2014-12-26');
  // Vides : l'un sans locataire (en attente), l'autre loué le 05/11 ; un occupé, au mandat (20/10).
  L.vide = await lot({ adresse: '12 Rue de l’Église', depuis: '2026-10-26', occupe: false });
  L.videLoue = await lot({ adresse: '1 Rue Louis Pouey', depuis: '2026-10-26', occupe: false });
  await bail([L.videLoue], '2026-11-05');
  L.occupe = await lot({ adresse: '8 Rue Denfert', depuis: '2026-10-20', occupe: true });
  await bail([L.occupe], '2016-01-01');
  // La ligne de suivi « Bail » de 2014 (la 837), avec la prime de nouvelle gestion.
  L.ligne = Number((await query<{ id: string }>(
    `INSERT INTO gestion_location_activite (type, date_signature, bail_id, lot_id, libelle_proprietaire, libelle_locataire, hono_proprietaire_ht, hono_locataire_ht,
       mandat_gestion, avec_gestion, negociateur_libelle, source, cree_par_libelle, prime_mode, origine_contact)
     VALUES ('bail', '2014-12-26', $1, $2, 'CHALAH Ramdane', 'Assia REIFHI', 0, 0, true, false, 'Jean-Baptiste PONS', 'saisie', 'épreuve', 'regle', 'passage_agence') RETURNING id::text`,
    [L.bail536, L.reifhi])).rows[0].id);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(async () => { await pool.end(); });

describe('AVANT la 431 (430 seule) puis APRÈS : A, B, et les mois antérieurs', () => {
  let avant: Awaited<ReturnType<typeof etat>>;
  it('avant : rien ne change (aucune bascule) — les cinq lots d’octobre à leur date de création', async () => {
    avant = await etat();
    expect(avant.regle.bascule).toBeNull();
    expect(avant.oct.nbNouvelles).toBe(5);
    expect(await lireGestionsEnAttente('2026-10-01', '2026-10-31')).toEqual([]);
  });
  it('la 431 appliquée telle qu’elle est livrée (rejouable)', async () => {
    const sql = readFileSync('db/migrations/431_location_bascules_octobre_conversion.sql', 'utf8');
    await pool.query(sql);
    await pool.query(sql);
    expect((await query(`SELECT cle, valeur::text AS v FROM gestion_location_parametre_date ORDER BY id`)).rows)
      .toEqual([{ cle: 'bascule_annexes_gestion', v: '2026-10-01' }, { cle: 'bascule_entree_locataire', v: '2026-10-01' }]);
  });
  it('A : la cave REIFHI (entrée le 22/10) ne compte plus ; la cave de septembre compte toujours', async () => {
    const apres = await etat();
    expect(apres.regle.bascule).toBe('2026-10-01');
    expect(apres.sept.nbNouvelles).toBe(2);
    expect(apres.oct.nouvelles.map((l) => l.lotId)).toContain(L.cave);                    // montrée…
    expect(apres.oct.nouvelles.filter((l) => l.lotId === L.cave || l.lotId === L.reifhi).length).toBe(2);
    expect(apres.oct.nbNouvelles).toBe(2);                                                // …mais seuls REIFHI et l'occupé comptent
  });
  it('B : sans locataire → en attente (ni ligne, ni +1, ni stock) ; loué le 05/11 → novembre ; occupé → le mandat ; REIFHI non renseigné → jamais avant le 01/10', async () => {
    const oct = await lignesDe('2026-10-01', '2026-10-31');
    expect(oct).toEqual([`${L.reifhi}@2026-10-01`, `${L.cave}@2026-10-01`, `${L.occupe}@2026-10-20`].sort());
    expect(await lignesDe('2026-11-01', '2026-11-30')).toEqual([`${L.videLoue}@2026-11-05`]);
    expect((await lireGestionsEnAttente('2026-10-01', '2026-10-31')).map((l) => [l.lotId, l.effetLe])).toEqual([[L.vide, '2026-10-26']]);
    const g = await lireGestion('2025-01-01');
    expect(g.transitions.map((t) => t.lotId)).not.toContain(L.vide);
    expect(g.stock).toBe(6);                                                              // 7 lots en gestion, le bien en attente n'y est pas
  });
  it('les mois AVANT octobre 2026 ne bougent pas : mêmes lignes, même stock à la fin de chaque mois', async () => {
    const apres = await etat();
    const jusquA = (x: typeof avant) => x.lignes.filter((l) => l.effetLe < '2026-10-01').map((l) => `${l.lotId}@${l.effetLe}`).sort();
    expect(jusquA(apres)).toEqual(jusquA(avant));
    const stocks = (x: typeof avant) => x.stock.filter((p) => p.mois < '2026-10').map((p) => [p.mois, p.stock, p.entrees, p.sorties]);
    expect(stocks(apres)).toEqual(stocks(avant));
  });
});

describe('C — convertir la ligne « Bail » en « Mandat de gestion seul », puis annuler', () => {
  const lire = async () => (await query<{ type: string; d: string; to: string | null; dor: string | null; neg: string; prime: string }>(
    `SELECT type, date_signature::text AS d, type_origine AS to, date_signature_origine::text AS dor, negociateur_libelle AS neg, prime_mode AS prime
       FROM gestion_location_activite WHERE id = $1`, [L.ligne])).rows[0];
  it('convertie : date du mandat, hors « Bail », origine gardée, négociateur et prime conservés ; journalisée', async () => {
    expect((await convertirEnMandatSeul(L.ligne, '2026-10-20', AUTEUR)).etat).toBe('ok');
    expect(await lire()).toEqual({ type: 'gestion_seule', d: '2026-10-20', to: 'bail', dor: '2014-12-26', neg: 'Jean-Baptiste PONS', prime: 'regle' });
    expect((await convertirEnMandatSeul(L.ligne, '2026-10-20', AUTEUR)).etat).toBe('refus');   // déjà convertie
  });
  it('annulée : nature et date d’origine remises ; les deux gestes au journal', async () => {
    expect((await annulerConversion(L.ligne, AUTEUR)).etat).toBe('ok');
    expect(await lire()).toEqual({ type: 'bail', d: '2014-12-26', to: null, dor: null, neg: 'Jean-Baptiste PONS', prime: 'regle' });
    expect((await query(`SELECT action FROM gestion_journal WHERE entite = 'location_activite' AND entite_id = $1 ORDER BY id`, [L.ligne])).rows.map((r) => r.action))
      .toEqual(['location_conversion_mandat_seul', 'location_conversion_annulee']);
  });
});

describe('D — le script : dry-run sans écriture, puis tout en une transaction', () => {
  const tables = ['gestion_annuaire_lot', 'gestion_bail', 'gestion_bien_statut_transition', 'gestion_bien_statut_effet_corrige', 'gestion_journal', 'gestion_location_activite'];
  const compter = async () => Promise.all(tables.map(async (t) => Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`)).rows[0].n)));
  const args = () => [`--bien=${L.reifhi}`, `--bail=${L.bail536}`, `--ligne-suivi=${L.ligne}`, '--date-mandat=2026-10-20'];
  it('dry-run : rien n’est écrit, et il dit ce qui serait fait (conversion comprise)', async () => {
    const avant = await compter();
    const l = await main(args());
    expect(l.join('\n')).toContain(`ligne de suivi ${L.ligne} : « Bail » → « Mandat de gestion seul »`);
    expect(await compter()).toEqual(avant);
  });
  it('une ligne de suivi d’un autre bien : refusé AVANT d’écrire, rien n’est écrit', async () => {
    const avant = await compter();
    const l = await main([`--bien=${L.occupe}`, `--ligne-suivi=${L.ligne}`, '--date-mandat=2026-10-20', '--appliquer']);
    expect(l.join('\n')).toContain('n’est pas celle d’un bail du bien');
    expect(await compter()).toEqual(avant);
  });
  it('--appliquer : rentré occupé, entrée au 20/10 (cave comprise), bail en place, ligne convertie — puis rejoué : rien de plus', async () => {
    await main([...args(), '--appliquer']);
    expect((await query('SELECT entre_occupe FROM gestion_annuaire_lot WHERE id = $1', [L.reifhi])).rows[0].entre_occupe).toBe(true);
    expect(await lignesDe('2026-10-01', '2026-10-31')).toEqual([`${L.reifhi}@2026-10-20`, `${L.cave}@2026-10-20`, `${L.occupe}@2026-10-20`].sort());
    expect((await query('SELECT en_place_prise_gestion AS p FROM gestion_bail WHERE id = $1', [L.bail536])).rows[0].p).toBe(true);
    expect((await query('SELECT type, date_signature::text AS d FROM gestion_location_activite WHERE id = $1', [L.ligne])).rows[0]).toEqual({ type: 'gestion_seule', d: '2026-10-20' });
    const j = (await query<{ commentaire: string }>(`SELECT commentaire FROM gestion_journal WHERE entite = 'annuaire_lot' AND entite_id = $1 AND action = 'location_rentre_occupe'`, [L.reifhi])).rows;
    expect(j).toHaveLength(1);
    expect(j[0].commentaire).toContain('convertie');
    const apres = await compter();
    await main([...args(), '--appliquer']);
    expect(await compter()).toEqual(apres);
  });
});
