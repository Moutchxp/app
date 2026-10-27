// TUILE « TRANSACTION » — LOT B : L'ÉCRITURE DE LA REPRISE (B1, B2). Pas de `import 'server-only'` : lu par le script sous tsx et par
// les tests. 🔴 RIEN N'EST JAMAIS SUPPRIMÉ : chaque ligne porte sa clé (fichier|onglet|ligne) et la marque de l'import ; rejouer
// n'écrit que ce qui manque (idempotent) ; `--annuler` RETIRE (retire_le), journalisé, réversible ; une saisie d'Arno n'est jamais
// écrasée (la gestion d'un mois déjà saisi est laissée telle quelle, et dite au rapport).
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { GestionPlan, Plan, RetroPlan, VentePlan } from './planImport';

export const PREFIXE_MARQUE = 'import fichier transaction';
export const marqueDuJour = (jjmm: string): string => `${PREFIXE_MARQUE} du ${jjmm}`;
const n = (v: unknown): number => Number(v);
const premierDuMois = (annee: number, mois: number | null): string | null => (mois === null ? null : `${annee}-${String(mois).padStart(2, '0')}-01`);

export async function tablesPresentes(): Promise<boolean> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'transaction_vente'`);
  return (rows[0]?.n ?? 0) > 0;
}

/** Les clés déjà en base (ventes, lignes, rétrocessions, montants à rattacher, gestion) et l'id de vente de chaque clé de ligne. */
export interface Existant { ventes: Map<string, number>; lignes: Map<string, number>; retros: Set<string>; aRattacher: Set<string>; gestionCles: Set<string>;
  gestionMois: Map<string, { origine: string; cle: string | null }> }
export async function lireExistant(): Promise<Existant> {
  if (!(await tablesPresentes())) return { ventes: new Map(), lignes: new Map(), retros: new Set(), aRattacher: new Set(), gestionCles: new Set(), gestionMois: new Map() };
  const [v, l, r, a, g] = await Promise.all([
    query<{ id: string; import_cle: string }>('SELECT id, import_cle FROM transaction_vente WHERE import_cle IS NOT NULL'),
    query<{ vente_id: string; import_cle: string }>('SELECT vente_id, import_cle FROM transaction_vente_ligne WHERE import_cle IS NOT NULL'),
    query<{ import_cle: string }>('SELECT import_cle FROM transaction_retrocession WHERE import_cle IS NOT NULL'),
    query<{ import_cle: string }>('SELECT import_cle FROM transaction_ca_a_rattacher WHERE import_cle IS NOT NULL'),
    query<{ annee: number; mois: number; origine: string; import_cle: string | null; retire: boolean }>('SELECT annee, mois, origine, import_cle, retire_le IS NOT NULL AS retire FROM transaction_gestion_mois'),
  ]);
  return { ventes: new Map(v.rows.map((x) => [x.import_cle, n(x.id)])), lignes: new Map(l.rows.map((x) => [x.import_cle, n(x.vente_id)])),
    retros: new Set(r.rows.map((x) => x.import_cle)), aRattacher: new Set(a.rows.map((x) => x.import_cle)),
    gestionCles: new Set(g.rows.filter((x) => x.import_cle !== null).map((x) => x.import_cle as string)),
    gestionMois: new Map(g.rows.filter((x) => !x.retire).map((x) => [`${x.annee}-${x.mois}`, { origine: x.origine, cle: x.import_cle }])) };
}

export interface Bilan { ventesCreees: number; ventesMisesAJour: number; lignes: number; retros: number; aRattacher: number; gestion: number; gestionLaissee: string[]; retrosSansVente: string[] }

async function journal(q: RequeteTx, entite: string, id: number, action: string, avant: unknown, apres: unknown, commentaire: string, marque: string): Promise<void> {
  await q(`INSERT INTO transaction_journal (entite, entite_id, action, avant, apres, commentaire, auteur_libelle) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [entite, id, action, avant === null ? null : JSON.stringify(avant), apres === null ? null : JSON.stringify(apres), commentaire, marque]);
}

/** La vente déjà en base pour ce plan : par sa clé, ou par la clé d'une de ses lignes (un compromis repris l'année suivante — D2). */
const venteExistante = (v: VentePlan, e: Existant): number | null =>
  e.ventes.get(v.cle) ?? v.lignes.map((l) => e.lignes.get(l.occ.cle)).find((x): x is number => x !== undefined) ?? null;

/**
 * Écrit, pour les fichiers choisis, ce que le plan leur attribue — et seulement ce qui manque. Une transaction par fichier : un fichier
 * refusé en cours de route n'écrit rien. Rend le bilan par fichier.
 */
export async function ecrireFichier(plan: Plan, fichier: string, marque: string): Promise<Bilan> {
  const e = await lireExistant();
  return withTransaction(async (q) => {
    const b: Bilan = { ventesCreees: 0, ventesMisesAJour: 0, lignes: 0, retros: 0, aRattacher: 0, gestion: 0, gestionLaissee: [], retrosSansVente: [] };
    const idDeVente = new Map<string, number>();
    for (const v of plan.ventes.filter((x) => x.fichier === fichier)) {
      let id = venteExistante(v, e);
      const valeurs = { honoraires_ttc: v.honorairesTtc, statut: v.statut, annee: v.annee, mois_acte: premierDuMois(v.annee, v.statut === 'vendue' ? v.mois : null) };
      if (id === null) {
        const { rows } = await q<{ id: string }>(
          `INSERT INTO transaction_vente (societe, libelle, honoraires_ttc, statut, annee, mois_acte, note, origine, import_marque, import_cle, source_fichier, source_onglet, source_ligne, cree_par_libelle)
           VALUES ($1, $2, $3, $4, $5, $6::date, $7, 'import', $8, $9, $10, $11, $12, $8) RETURNING id`,
          [v.societe, v.libelle, v.honorairesTtc, v.statut, v.annee, valeurs.mois_acte, [v.motifMois === null ? null : `Mois à confirmer : ${v.motifMois}.`, ...v.notes].filter(Boolean).join(' ') || null,
            marque, v.cle, v.fichier, v.primaire.onglet, v.primaire.ligne]);
        id = n(rows[0].id);
        await journal(q, 'vente', id, 'import_fichier', null, { ...valeurs, libelle: v.libelle, cle: v.cle }, `${marque} — ${v.fichier} › ${v.primaire.onglet} › ligne ${v.primaire.ligne} ; réversible par --annuler (retrait, jamais de suppression)`, marque);
        b.ventesCreees++;
      } else {
        // Un compromis importé plus tôt (fichier de son année), retrouvé dans un fichier plus récent : il devient la vente de ce fichier.
        const { rows } = await q<Record<string, unknown>>(`SELECT honoraires_ttc, statut, annee, to_char(mois_acte, 'YYYY-MM-DD') AS mois_acte FROM transaction_vente WHERE id = $1 FOR UPDATE`, [id]);
        const a = rows[0];
        const avant = { honoraires_ttc: n(a.honoraires_ttc), statut: a.statut, annee: n(a.annee), mois_acte: a.mois_acte ?? null };
        if (JSON.stringify(avant) !== JSON.stringify(valeurs)) {
          await q('UPDATE transaction_vente SET honoraires_ttc = $2, statut = $3, annee = $4, mois_acte = $5::date, modifie_le = now() WHERE id = $1',
            [id, valeurs.honoraires_ttc, valeurs.statut, valeurs.annee, valeurs.mois_acte]);
          await journal(q, 'vente', id, 'import_mise_a_jour', avant, valeurs, `${marque} — retrouvée dans ${v.fichier} (D2) ; « Annuler » remet la valeur d'avant`, marque);
          b.ventesMisesAJour++;
        }
      }
      idDeVente.set(v.cle, id);
      for (const l of v.lignes) {
        if (e.lignes.has(l.occ.cle)) continue;
        await q(`INSERT INTO transaction_vente_ligne (vente_id, negociateur, role, montant_ttc, nature, compte, origine, import_marque, import_cle, source_fichier, source_onglet, source_ligne, note, cree_par_libelle)
                 VALUES ($1, $2, $3, $4, $5, $6, 'import', $7, $8, $9, $10, $11, $12, $7)`,
          [id, l.occ.onglet, l.role, l.montantTtc, l.occ.nature, l.compte, marque, l.occ.cle, l.occ.fichier, l.occ.onglet, l.occ.ligne, l.note]);
        e.lignes.set(l.occ.cle, id);
        b.lignes++;
      }
    }
    const idVente = async (cle: string | null): Promise<number | null> => {
      if (cle === null) return null;
      if (idDeVente.has(cle)) return idDeVente.get(cle)!;
      const { rows } = await q<{ id: string }>('SELECT id FROM transaction_vente WHERE import_cle = $1', [cle]);
      return rows[0] === undefined ? null : n(rows[0].id);
    };
    for (const r of plan.retros.filter((x: RetroPlan) => x.fichier === fichier)) {
      if (e.retros.has(r.cle)) continue;
      const venteId = await idVente(r.venteCle);
      if (r.venteCle !== null && venteId === null) b.retrosSansVente.push(`${r.m.onglet}!${r.m.cellule} : la vente ${r.venteCle} n'est pas encore importée — « à répartir »`);
      await q(`INSERT INTO transaction_retrocession (societe, annee, mois, negociateur, montant_ttc, vente_id, libelle, origine, import_marque, import_cle, source_fichier, source_onglet, source_cellule, cree_par_libelle)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'import', $8, $9, $10, $11, $12, $8)`,
        [r.societe, r.annee, r.m.mois, r.m.onglet, r.m.montant, venteId, `${r.m.libelle} — ${r.motif}`, marque, r.cle, r.fichier, r.m.onglet, r.m.cellule]);
      b.retros++;
    }
    for (const a of plan.aRattacher.filter((x) => x.fichier === fichier)) {
      if (e.aRattacher.has(a.cle)) continue;
      await q(`INSERT INTO transaction_ca_a_rattacher (societe, annee, mois, negociateur, montant_ttc, libelle, origine, import_marque, import_cle, source_fichier, source_onglet, source_cellule, cree_par_libelle)
               VALUES ($1, $2, $3, $4, $5, $6, 'import', $7, $8, $9, $10, $11, $7)`,
        [a.societe, a.annee, a.m.mois, a.m.onglet, a.m.montant, a.m.libelle, marque, a.cle, a.fichier, a.m.onglet, a.m.cellule]);
      b.aRattacher++;
    }
    for (const g of plan.gestion.filter((x: GestionPlan) => x.fichier === fichier)) {
      if (e.gestionCles.has(g.cle)) continue;
      const deja = e.gestionMois.get(`${g.annee}-${g.mois}`);
      if (deja !== undefined) { b.gestionLaissee.push(`${g.annee}-${String(g.mois).padStart(2, '0')} : déjà en base (${deja.origine}) — laissé tel quel`); continue; }
      const { rows } = await q<{ id: string }>(
        `INSERT INTO transaction_gestion_mois (annee, mois, nb_lots, honoraires_ht, adhoc_ht, salarie_ht, reste_ht, note, origine, import_marque, import_cle, source_fichier, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'import', $9, $10, $11, $9) RETURNING id`,
        [g.annee, g.mois, g.nbLots, g.honorairesHt, g.adhocHt, g.salarieHt, g.resteHt, g.note, marque, g.cle, g.fichier]);
      await journal(q, 'gestion_mois', n(rows[0].id), 'import_fichier', null, g, `${marque} — ${g.fichier} › GESTION`, marque);
      b.gestion++;
    }
    return b;
  });
}

/**
 * `--annuler` : RETIRE (retire_le) ce que l'import a écrit — tout, ou les lignes venues des fichiers donnés —, une trace au journal par
 * vente et par mois de gestion. Rien n'est supprimé ; les saisies d'Arno (origine « saisie ») ne sont jamais visées. Rend les comptes.
 */
export async function annulerImport(fichiers: readonly string[] | null, auteur: string, appliquer: boolean): Promise<Record<string, number>> {
  if (!(await tablesPresentes())) return {};
  const filtre = fichiers === null ? '' : ' AND source_fichier = ANY($2::text[])';
  const params = (x: unknown[]): unknown[] => (fichiers === null ? x : [...x, fichiers]);
  const tables = ['transaction_vente', 'transaction_vente_ligne', 'transaction_retrocession', 'transaction_ca_a_rattacher', 'transaction_gestion_mois'];
  const comptes: Record<string, number> = {};
  const travail = async (q: RequeteTx): Promise<void> => {
    for (const t of tables) {
      const { rows } = await q<{ id: string }>(`SELECT id FROM ${t} WHERE origine = 'import' AND import_marque LIKE $1 AND retire_le IS NULL${filtre} ORDER BY id`,
        params([`${PREFIXE_MARQUE}%`]));
      comptes[t] = rows.length;
      if (!appliquer) continue;
      for (const r of rows) {
        await q(`UPDATE ${t} SET retire_le = now(), retire_par_libelle = $2 WHERE id = $1 AND retire_le IS NULL`, [n(r.id), auteur]);
        if (t === 'transaction_vente' || t === 'transaction_gestion_mois') {
          await journal(q, t === 'transaction_vente' ? 'vente' : 'gestion_mois', n(r.id), 'import_annule', { retire_le: null }, { retire_le: 'retirée' },
            `${auteur} — import retiré (--annuler) ; rien n'est supprimé, « Annuler » sur ce geste la rétablit`, auteur);
        }
      }
    }
  };
  if (appliquer) await withTransaction(travail); else await travail(query as unknown as RequeteTx);
  return comptes;
}

/**
 * `--retablir` : l'inverse de `--annuler` — remet (retire_le = NULL) les lignes de l'import RETIRÉES PAR `--annuler` (et seulement
 * elles : une ligne qu'Arno a retirée à l'écran porte son nom, pas la marque de l'import), une trace au journal par vente et par mois.
 */
export async function retablirImport(fichiers: readonly string[] | null, auteur: string, appliquer: boolean): Promise<Record<string, number>> {
  if (!(await tablesPresentes())) return {};
  const filtre = fichiers === null ? '' : ' AND source_fichier = ANY($2::text[])';
  const params = (x: unknown[]): unknown[] => (fichiers === null ? x : [...x, fichiers]);
  const comptes: Record<string, number> = {};
  const travail = async (q: RequeteTx): Promise<void> => {
    for (const t of ['transaction_vente', 'transaction_vente_ligne', 'transaction_retrocession', 'transaction_ca_a_rattacher', 'transaction_gestion_mois']) {
      const { rows } = await q<{ id: string; annee: number; mois: number | null }>(
        `SELECT id${t === 'transaction_gestion_mois' ? ', annee, mois' : ', NULL::int AS annee, NULL::int AS mois'} FROM ${t}
          WHERE origine = 'import' AND retire_le IS NOT NULL AND retire_par_libelle LIKE $1${filtre} ORDER BY id`, params([`${PREFIXE_MARQUE}%`]));
      let k = 0;
      for (const r of rows) {
        if (t === 'transaction_gestion_mois') {
          // Un mois saisi entre-temps à l'écran garde sa place : la ligne de l'import reste retirée.
          const { rows: occ } = await q('SELECT 1 FROM transaction_gestion_mois WHERE annee = $1 AND mois = $2 AND retire_le IS NULL', [r.annee, r.mois]);
          if (occ.length > 0) continue;
        }
        k++;
        if (!appliquer) continue;
        await q(`UPDATE ${t} SET retire_le = NULL, retire_par_libelle = NULL WHERE id = $1`, [n(r.id)]);
        if (t === 'transaction_vente' || t === 'transaction_gestion_mois') {
          await journal(q, t === 'transaction_vente' ? 'vente' : 'gestion_mois', n(r.id), 'import_retabli', { retire_le: 'retirée' }, { retire_le: null },
            `${auteur} — ligne de l'import rétablie (--retablir)`, auteur);
        }
      }
      comptes[t] = k;
    }
  };
  if (appliquer) await withTransaction(travail); else await travail(query as unknown as RequeteTx);
  return comptes;
}

/** Pour la comparaison d'information (B3) : le CA HT de la location par mois, tel que le Suivi de la Location le compte. */
export async function caLocationParMois(): Promise<Record<string, number> | null> {
  const { rows: t } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'gestion_location_activite'`);
  if ((t[0]?.n ?? 0) === 0) return null;
  const { rows } = await query<{ mois: string; ca: string }>(
    `SELECT to_char(date_signature, 'YYYY-MM') AS mois, sum(coalesce(hono_proprietaire_ht, 0) + coalesce(hono_locataire_ht, 0))::text AS ca
       FROM gestion_location_activite WHERE annule_le IS NULL GROUP BY 1`);
  return Object.fromEntries(rows.map((r) => [r.mois, Number(r.ca)]));
}
