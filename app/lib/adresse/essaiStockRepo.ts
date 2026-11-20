import { query } from '../db/client';
import { rapprocherBien, type RapprochementComplet } from './banRepo';
import { construireRapport, type BienLu, type RapportEssai } from './essaiStock';
import { regroupementsEnCours } from '../gestion/regroupementCoproprietesRepo';

/**
 * ══ 🔴🔴 L'ESSAI DU STOCK — LA LECTURE (Arno, 20/11/2026, « Adresse officielle BAN », lot 3). IMPUR, LECTURE SEULE. ══════════════════════════════════
 * Refuse une connexion qui n'est pas en lecture seule ; lit les biens en portefeuille, les copropriétés, leurs adresses secondaires en cours et les
 * regroupements 504 ; rapproche chaque bien par le MODULE UNIQUE (`banRepo.rapprocherBien`) ; COMPTE les tables du chantier avant et après — la
 * preuve qu'il n'a rien écrit. Le script `adresses-officielles-stock.ts` n'en fait que les fichiers.
 */

/** Les tables que le chantier touchera un jour : comptées avant et après l'essai. */
export const TABLES_COMPTEES = ['gestion_annuaire_lot', 'gestion_copropriete', 'gestion_copropriete_adresse', 'gestion_copropriete_syndic', 'gestion_journal', 'gestion_lot_adresse_ban'] as const;
export type Comptage = Record<(typeof TABLES_COMPTEES)[number], number | null>;

export async function compterTables(): Promise<Comptage> {
  const out = {} as Comptage;
  for (const t of TABLES_COMPTEES) {
    const { rows: [x] } = await query<{ t: string | null }>('SELECT to_regclass($1)::text AS t', [t]);
    // le nom vient de la liste fixe ci-dessus, jamais d'une saisie
    out[t] = x?.t == null ? null : Number((await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${t}`)).rows[0].n);
  }
  return out;
}

export type IssueEssai = { ok: false; motif: string } | { ok: true; base: string; rapport: RapportEssai; avant: Comptage; apres: Comptage; intact: boolean };

export async function essaiDuStock(): Promise<IssueEssai> {
  const { rows: [etat] } = await query<{ base: string; lecture_seule: string }>(`SELECT current_database() AS base, current_setting('default_transaction_read_only') AS lecture_seule`);
  if (etat?.lecture_seule !== 'on') return { ok: false, motif: `La connexion à « ${etat?.base ?? '?'} » n’est pas en lecture seule : rien n’est fait.` };
  const avant = await compterTables();
  const { rows: biens } = await query<{ id: string; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null }>(
    'SELECT id::text, immeuble, adresse, code_postal, commune FROM gestion_annuaire_lot WHERE absent_le IS NULL ORDER BY id');
  const { rows: copros } = await query<{ id: string; cle: string }>('SELECT id::text, cle_immeuble AS cle FROM gestion_copropriete');
  const { rows: sec } = await query<{ copro: string; cle: string }>(
    'SELECT copropriete_id::text AS copro, cle_immeuble AS cle FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id');
  const cleDeCopro = new Map(copros.map((c) => [c.id, c.cle]));
  const principaleDe = new Map<string, string>();
  for (const a of sec) { const c = cleDeCopro.get(a.copro); if (c !== undefined && !principaleDe.has(a.cle)) principaleDe.set(a.cle, c); }
  // les biens écrits de la même façon ne sont rapprochés qu'une fois
  const lus: BienLu[] = biens.map((b) => ({ id: Number(b.id), immeuble: b.immeuble, adresse: b.adresse, codePostal: b.code_postal, commune: b.commune }));
  const memo = new Map<string, Promise<RapprochementComplet>>();
  const rapprochements = new Map<number, RapprochementComplet>();
  for (const b of lus) {
    const k = JSON.stringify([b.immeuble, b.adresse, b.codePostal, b.commune]);
    if (!memo.has(k)) memo.set(k, rapprocherBien(b));
    rapprochements.set(b.id, await memo.get(k)!);
  }
  const regroupements = (await regroupementsEnCours()).map((g) => ({ id: g.id, cle: g.cle, principale: g.principale, regroupees: g.regroupees }));
  const rapport = construireRapport({ biens: lus, rapprochements, principaleDe, coproprietes: copros.map((c) => c.cle), regroupements });
  const apres = await compterTables();
  return { ok: true, base: etat.base, rapport, avant, apres, intact: TABLES_COMPTEES.every((t) => avant[t] === apres[t]) };
}
