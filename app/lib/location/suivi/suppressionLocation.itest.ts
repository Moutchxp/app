import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { closePool, pool } from '../../db/client';

/**
 * 🔴🔴 LOT LS1 (Arno, 30/10/2026) — SUPPRIMER UNE LOCATION, SUR LA BASE DE RECETTE, SANS RIEN Y LAISSER. Des locations de TEST (« _TEST LS1 »)
 * sont créées sur deux biens réels, supprimées par le vrai geste (`supprimerLocation`, celui de la route), et vérifiées ; le tout dans UNE
 * transaction ANNULÉE à la fin (le montage « parcours en transaction annulée » : `pool.query` / `pool.connect` redirigés vers un client, les
 * transactions du code en points de sauvegarde) — journal compris, la recette est rendue telle qu'elle était (comptages avant / après).
 * Se lance seul : npx vitest run --config vitest.integration.config.ts app/lib/location/suivi/suppressionLocation.itest.ts
 */
let base: PoolClient;
const vrai = { connect: pool.connect.bind(pool), query: pool.query.bind(pool) };
const pile: string[] = [];
const qBase = (t: string, p?: unknown[]) => {
  const s = t.trim().toUpperCase();
  if (s === 'BEGIN') { const n = `sp${pile.length}`; pile.push(n); return base.query(`SAVEPOINT ${n}`); }
  if (s === 'COMMIT') return base.query(`RELEASE SAVEPOINT ${pile.pop()}`);
  if (s === 'ROLLBACK') return base.query(`ROLLBACK TO SAVEPOINT ${pile.pop()}`);
  return base.query(t, p);
};
const compter = async () => (await vrai.query(`SELECT (SELECT count(*) FROM gestion_journal)::int AS journal, (SELECT count(*) FROM gestion_location_activite)::int AS activites,
  (SELECT count(*) FROM gestion_annuaire_locataire)::int AS locataires, (SELECT count(*) FROM gestion_annuaire_locataire WHERE supprime_le IS NOT NULL)::int AS supprimes`)).rows[0];
let avant: Record<string, number>;
beforeAll(async () => {
  avant = await compter();
  base = await vrai.connect();
  await base.query('BEGIN');
  (pool as unknown as { query: unknown }).query = (t: string, p?: unknown[]) => qBase(t, p);
  (pool as unknown as { connect: unknown }).connect = async () => ({ query: qBase, release: () => {} });
});
afterAll(async () => {
  await base.query('ROLLBACK'); base.release();
  (pool as unknown as { query: unknown }).query = vrai.query; (pool as unknown as { connect: unknown }).connect = vrai.connect;
  expect(await compter()).toEqual(avant);
  await closePool();
});

describe('🔴 LOT LS1 — supprimer une location (recette, transaction annulée)', () => {
  it('un locataire, deux locataires, le locataire déjà sur un autre bien (appel direct), un sur deux conservé ; CA au centime ; bien intact ; journal', async () => {
    const compte = async (sql: string, p: unknown[] = []) => (await base.query(sql, p)).rows;
    const ligne = (o: unknown) => JSON.stringify(o);
    const echecs: string[] = [];
    const verifier = (mot: string, ok: boolean, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${mot}${detail ? ` — ${detail}` : ''}`); if (!ok) echecs.push(mot); };
  const { supprimerLocation, lirePlanSuppression } = await import('./suppressionLocationRepo');
  const { donneesTableau } = await import('./tableauBordRepo');
  const { caLigne } = await import('./tableauBord');
  const auteur = { id: 2, libelle: 'Arnaud Jorel (_TEST LS1, parcours annulé)' };
  let k = 0;
  const locataire = async (nom: string) => (await compte(`INSERT INTO gestion_annuaire_locataire (cle_personne, wippimmo_id, nom, nom_normalise) VALUES ($1, $1, $2, lower($2)) RETURNING id`, [`_test_ls1_${++k}`, nom]))[0].id as string;
  const location = async (lot: number, locs: string[], date: string, hono: [number, number]) => {
    const bail = (await compte('INSERT INTO gestion_bail (lot_id, entree) VALUES ($1, $2) RETURNING id', [lot, date]))[0].id;
    for (const l of locs) await compte(`INSERT INTO gestion_annuaire_occupation (wippimmo_id, locataire_id, lot_id, lot_wippimmo_id, entree, bail_id) VALUES ($1, $2, $3, $4, $5, $6)`, [`_test_ls1_o${++k}`, l, lot, `_test_ls1_l${lot}`, date, bail]);
    return (await compte(`INSERT INTO gestion_location_activite (type, date_signature, lot_id, bail_id, locataire_id, hono_proprietaire_ht, hono_locataire_ht, source, libelle_locataire, cree_par_libelle)
      VALUES ('bail', $1, $2, $3, $4, $5, $6, 'saisie', '_TEST LS1', '_TEST LS1') RETURNING id`, [date, lot, bail, locs[0], hono[0], hono[1]]))[0].id as string;
  };
  const caOctobre = async () => { const d = await donneesTableau(2026, true, '2026-10-30', null, { toutes: false, resultatNet: true });
    const oct = d.activites.filter((a) => a.dateSignature.startsWith('2026-10'));
    return { n: oct.length, ca: Math.round(oct.reduce((t: number, a) => t + caLigne(a), 0) * 100) }; };
  const intact = async (lot: number) => ligne(await compte(`SELECT l.*, (SELECT row_to_json(p) FROM gestion_annuaire_proprietaire p WHERE p.id = l.proprietaire_id) AS proprietaire FROM gestion_annuaire_lot l WHERE l.id = $1`, [lot]));
  const supprime = async (id: string) => (await compte('SELECT supprime_le IS NOT NULL AS s FROM gestion_annuaire_locataire WHERE id = $1', [id]))[0].s as boolean;
  const ca0 = await caOctobre();

  // ① une location à UN locataire
  await base.query('SAVEPOINT cas1');
  { const t = await locataire('_TEST LS1 UNIQUE Paul'); const a = await location(1, [t], '2026-10-15', [1000, 500]);
    const ca1 = await caOctobre(); const bien = await intact(1);
    const plan = await lirePlanSuppression(a); const journalAvantPlan = (await compte('SELECT count(*)::int AS n FROM gestion_journal'))[0].n;
    verifier('① la fenêtre (plan) n’écrit rien — « Annuler » ne change rien', (await compte('SELECT count(*)::int AS n FROM gestion_journal'))[0].n === journalAvantPlan && !(await supprime(t)) && plan.etat === 'ok');
    const r = await supprimerLocation(a, auteur);
    const ca2 = await caOctobre();
    verifier('① supprimée ; profil supprimé', r.etat === 'ok' && await supprime(t), ligne(r.etat === 'ok' ? r.data.locataires : r));
    verifier('① CA et compteur d’octobre : la ligne compte puis disparaît, au centime', ca1.n === ca0.n + 1 && ca1.ca === ca0.ca + 150000 && ca2.n === ca0.n && ca2.ca === ca0.ca, `${ca0.ca} → ${ca1.ca} → ${ca2.ca} centimes`);
    verifier('① le bien et son propriétaire intacts', (await intact(1)) === bien);
    verifier('① bail et occupation conservés (option A)', (await compte('SELECT count(*)::int AS n FROM gestion_annuaire_occupation WHERE locataire_id = $1', [t]))[0].n === 1);
    const j = await compte(`SELECT action, commentaire FROM gestion_journal WHERE (entite = 'location_activite' AND entite_id = $1) OR (entite = 'annuaire' AND entite_id = $2) ORDER BY id`, [a, t]);
    verifier('① journal : la fiche, puis la location', ligne(j.map((x) => x.action)) === ligne(['annuaire_supprime', 'location_supprimee']), j.map((x) => x.commentaire).join(' | ').slice(0, 300));
    verifier('① deux fois : la seconde est refusée (« inconnue »), rien de plus au journal', (await supprimerLocation(a, auteur)).etat === 'inconnu');
  }
  await base.query('ROLLBACK TO SAVEPOINT cas1');

  // ② une location à DEUX locataires
  await base.query('SAVEPOINT cas2');
  { const t1 = await locataire('_TEST LS1 DEUX Anne'); const t2 = await locataire('_TEST LS1 DEUX Marc'); const a = await location(1, [t1, t2], '2026-10-16', [800, 400]);
    const r = await supprimerLocation(a, auteur);
    verifier('② deux profils supprimés', r.etat === 'ok' && await supprime(t1) && await supprime(t2) && r.data.locataires.every((l) => !l.conserve)); }
  await base.query('ROLLBACK TO SAVEPOINT cas2');

  // ③ A supprimée, son locataire déjà sur B (cas d'Arno) : profil conservé, location B identique en tout point (au centime)
  await base.query('SAVEPOINT cas3');
  { const t = await locataire('_TEST LS1 PARTI SUR B Julie'); const a = await location(1, [t], '2026-10-17', [900, 450]); const b = await location(3, [t], '2026-10-20', [1200, 600]);
    const bAvant = ligne(await compte('SELECT * FROM gestion_location_activite WHERE id = $1', [b])); const occB = ligne(await compte('SELECT * FROM gestion_annuaire_occupation WHERE locataire_id = $1 AND lot_id = 3', [t]));
    const fiche = ligne(await compte('SELECT * FROM gestion_annuaire_locataire WHERE id = $1', [t]));
    const plan = await lirePlanSuppression(a);
    verifier('③ la fenêtre annonce le locataire conservé et son autre bien', plan.etat === 'ok' && plan.data.locataires[0].conserve && /République/.test(plan.data.locataires[0].autreBien ?? ''), ligne(plan.etat === 'ok' ? plan.data.locataires : plan));
    // contrôle serveur : appel DIRECT, sans passer par la fenêtre
    const r = await supprimerLocation(a, auteur);
    verifier('③ appel direct : profil conservé (fiche identique)', r.etat === 'ok' && !(await supprime(t)) && ligne(await compte('SELECT * FROM gestion_annuaire_locataire WHERE id = $1', [t])) === fiche);
    verifier('③ location B identique en tout point, occupation sur B intacte', ligne(await compte('SELECT * FROM gestion_location_activite WHERE id = $1', [b])) === bAvant
      && ligne(await compte('SELECT * FROM gestion_annuaire_occupation WHERE locataire_id = $1 AND lot_id = 3', [t])) === occB);
    const ca = await caOctobre(); verifier('③ octobre : B compte encore (1 800 € HT), A plus', ca.ca === ca0.ca + 180000 && ca.n === ca0.n + 1, `${ca.ca} centimes`); }
  await base.query('ROLLBACK TO SAVEPOINT cas3');

  // ④ deux locataires, un seul sur un autre bien
  await base.query('SAVEPOINT cas4');
  { const t1 = await locataire('_TEST LS1 RESTE Léa'); const t2 = await locataire('_TEST LS1 AILLEURS Tom'); const a = await location(1, [t1, t2], '2026-10-18', [700, 350]);
    await location(3, [t2], '2026-10-21', [500, 250]);
    const r = await supprimerLocation(a, auteur);
    verifier('④ un supprimé, un conservé', r.etat === 'ok' && await supprime(t1) && !(await supprime(t2)), ligne(r.etat === 'ok' ? r.data.locataires.map((l) => [l.nom, l.conserve, l.autreBien]) : r)); }
  await base.query('ROLLBACK TO SAVEPOINT cas4');
    expect(echecs).toEqual([]);
  });
});
