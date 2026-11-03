import { afterAll, describe, expect, it } from 'vitest';

/**
 * 🔴 « LES COÛTS », LOT 2 (Arno, 03/11/2026, migration 451) — SUR UNE VRAIE BASE D'ESSAI : une saisie écrit UNE ligne, journalisée, gardée par sa
 * version (409), jamais effacée ; la page Gestion / Location et « Coûts globaux » la lisent au même endroit ; le résultat net bouge du même montant ;
 * ADHOC / MONGA écrivent la ligne de la Gestion ; l'effacement C8 et sa restauration.
 * 🔴 REFUSE DE TOURNER ailleurs que sur une base `svav_test…` (avec la 451) : il écrit.
 *   DATABASE_URL=postgresql://localhost:5432/svav_test_couts npx vitest run --config vitest.integration.config.ts app/lib/mon-espace/coutsSaisis.itest.ts
 */
const BASE = process.env.DATABASE_URL ?? '';
if (!/\/svav_test[^/]*$/.test(BASE)) throw new Error(`Base d'essai exigée (svav_test…), reçu : ${BASE.replace(/:[^:@/]*@/, ':***@')}`);
const { pool, query } = await import('../db/client');
const repo = await import('../transaction/repo');
const { lireDonneesGlobal } = await import('../transaction/donneesGlobal');
const { coutsGlobaux } = await import('../transaction/coutsGlobal');
const AUTEUR = { id: null, libelle: 'itest couts' };
afterAll(async () => { await pool.end(); });
/** Une année encore vide (aucune ligne de gestion ni coût saisi) : l'épreuve se rejoue sur la même base sans se marcher dessus. */
const anneeLibre = async (depuis: number): Promise<number> => {
  for (let a = depuis; ; a += 1) {
    const { rows } = await query<{ n: string }>(`SELECT (SELECT count(*) FROM transaction_gestion_mois WHERE annee = $1) + (SELECT count(*) FROM transaction_cout_ligne WHERE annee = $1) AS n`, [a]);
    if (Number(rows[0].n) === 0) return a;
  }
};

const compte = async (identifiant: string): Promise<number> => Number((await query<{ id: string }>(
  `INSERT INTO admin_utilisateur (identifiant, mot_de_passe, role, actif, prenom, nom) VALUES ($1, 'x', 'collaborateur', true, 'Essai', $1)
   ON CONFLICT DO NOTHING RETURNING id`, [identifiant])).rows[0]?.id ?? (await query<{ id: string }>('SELECT id FROM admin_utilisateur WHERE identifiant = $1', [identifiant])).rows[0].id);

describe('🔴 une saisie = une ligne, journalisée, versionnée', () => {
  it('ajouter, lire, modifier (version), 409 périmé, retirer ; le même salarié deux fois : refus', async () => {
    const c = await compte(`itest-couts-${Date.now()}@essai.test`);
    const ajout = await repo.ajouterCoutLigne({ societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2031, mois: 3, compteId: c, libelle: null, montantHt: 2100.55 }, AUTEUR);
    expect(ajout.ok).toBe(true);
    const id = ajout.ok ? ajout.valeur! : 0;
    const l = (await repo.lireCoutsLignes())!.find((x) => x.id === id)!;
    expect([l.montantHt, l.compteId, l.version > 0]).toEqual([2100.55, c, true]);
    const double = await repo.ajouterCoutLigne({ societe: 'criterimmo', famille: 'gestion', poste: 'salaires', annee: 2031, mois: 3, compteId: c, libelle: null, montantHt: 1 }, AUTEUR);
    expect(double.ok).toBe(false);
    expect((await repo.modifierCoutLigne(id, l.version, { montantHt: 2200 }, AUTEUR)).ok).toBe(true);
    const perime = await repo.modifierCoutLigne(id, l.version, { montantHt: 9 }, AUTEUR);
    expect(perime).toMatchObject({ ok: false, conflit: true });
    const l2 = (await repo.lireCoutsLignes())!.find((x) => x.id === id)!;
    expect(l2.montantHt).toBe(2200);
    // la page Gestion additionne le salarié (2031-03 n'avait pas de ligne de gestion : elle en reçoit une, avec ses seuls salaires)
    expect((await repo.lireGestion()).find((g) => g.annee === 2031 && g.mois === 3)?.salarieHt).toBe(2200);
    expect((await repo.modifierCoutLigne(id, l2.version, { retirer: true }, AUTEUR)).ok).toBe(true);
    expect((await repo.lireCoutsLignes())!.some((x) => x.id === id)).toBe(false);
    const j = await query<{ action: string }>(`SELECT action FROM transaction_journal WHERE entite = 'cout_ligne' AND entite_id = $1 ORDER BY id`, [id]);
    expect(j.rows.map((r) => r.action)).toEqual(['saisie', 'modification', 'retrait']);
    await expect(query('DELETE FROM transaction_cout_ligne WHERE id = $1', [id])).rejects.toThrow();
  });
});

describe('🔴 la propagation : « Coûts globaux » et le résultat net bougent du même montant, au bon mois, à la bonne structure', () => {
  it('« Autres » MACJ de mai 2031 : +12 345 centimes en mai 2031, rien ailleurs ; un salaire de la vente CRITERIMMO : idem', async () => {
    const lire = async () => { const d = await lireDonneesGlobal('2031-12-31', { compromis: false }) as Record<string, unknown>;
      return { ventes: d.ventes, retrocessions: d.retrocessions, location: d.locationCa ?? null, gestion: d.gestion, saisis: d.coutsSaisis } as Parameters<typeof coutsGlobaux>[0]; };
    const avant = await lire();
    const r = await repo.ajouterCoutLigne({ societe: 'macj', famille: 'vente', poste: 'autres', annee: 2031, mois: 5, compteId: null, libelle: 'Logiciel', montantHt: 123.45 }, AUTEUR);
    expect(r.ok).toBe(true);
    const apres = await lire();
    expect(coutsGlobaux(apres, 2031, 5).total.htC - coutsGlobaux(avant, 2031, 5).total.htC).toBe(12345);
    expect(coutsGlobaux(apres, 2031, 4).total).toEqual(coutsGlobaux(avant, 2031, 4).total);
    expect(coutsGlobaux(apres, 2030, 5).total).toEqual(coutsGlobaux(avant, 2030, 5).total);
  });
});

describe('🔴 ADHOC / MONGA : la ligne de la Gestion du mois, versionnée', () => {
  it('un mois sans ligne : créée (version 0) ; ensuite la version du journal ; périmée : 409', async () => {
    const a = await anneeLibre(2040);
    expect((await repo.modifierPosteGestion(a, 1, 'monga', 412.5, 0, AUTEUR)).ok).toBe(true);
    const v = (await repo.lireVersionsGestion())[`${a}-01`];
    expect(v.version).toBeGreaterThan(0);
    expect((await repo.lireGestion()).find((g) => g.annee === a && g.mois === 1)?.mongaHt).toBe(412.5);
    expect((await repo.modifierPosteGestion(a, 1, 'adhoc', 99, v.version, AUTEUR)).ok).toBe(true);
    expect(await repo.modifierPosteGestion(a, 1, 'adhoc', 1, v.version, AUTEUR)).toMatchObject({ ok: false, conflit: true });
  });
});

describe('🔴 C8 — effacer après sauvegarde, restaurer', () => {
  it('effacer exactement la sauvegarde (journalisé) ; une valeur changée entre-temps : refus ; restaurer là où c’est vide', async () => {
    const a = await anneeLibre(2100 - 40);
    await query(`INSERT INTO transaction_gestion_mois (annee, mois, salarie_ht, origine, cree_par_libelle) VALUES ($1, 6, 1500.25, 'saisie', 'itest')`, [a]);
    const s = (await repo.lireSalairesMensuels()).filter((x) => x.annee === a);
    expect(s).toHaveLength(1);
    expect(await repo.effacerSalairesMensuels([{ ...s[0], montantHt: 1 }], AUTEUR)).toMatchObject({ ok: false });
    expect(await repo.effacerSalairesMensuels(s, AUTEUR)).toEqual({ ok: true, valeur: 1 });
    expect((await repo.lireSalairesMensuels()).some((x) => x.annee === a)).toBe(false);
    expect(await repo.restaurerSalairesMensuels(s, AUTEUR)).toEqual({ ok: true, valeur: 1 });
    expect((await repo.lireSalairesMensuels()).find((x) => x.annee === a)?.montantHt).toBe(1500.25);
    const j = await query<{ action: string }>(`SELECT action FROM transaction_journal WHERE entite = 'gestion_mois' AND entite_id = $1 ORDER BY id`, [s[0].id]);
    expect(j.rows.map((r) => r.action)).toEqual(['effacement_c8', 'restauration_c8']);
  });
});
