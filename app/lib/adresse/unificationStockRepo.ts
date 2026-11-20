import { query } from '../db/client';
import { cleImmeuble } from '../gestion/syndics';
import { digicodesDesAdresses } from '../gestion/digicodesRepo';
import { regroupementsEnCours } from '../gestion/regroupementCoproprietesRepo';
import { colonneExisteMemo } from '../location/sondeLocation';
import { rapprocherAdresse, rapprocherBien, type RapprochementComplet } from './banRepo';
import { compterTables, TABLES_COMPTEES, type Comptage } from './essaiStockRepo';
import { planUnification, type AdresseCoproStock, type BienStock, type CoproStock, type DigicodeEnVigueur, type EntreeUnification, type PlanUnification } from './unificationStock';

/**
 * ══ 🔴🔴 L'UNIFICATION DU STOCK — LA LECTURE (Arno, 20/11/2026, « Adresse officielle BAN », lot 5). IMPUR, LECTURE SEULE. ════════════════════════════
 * Refuse une connexion qui n'est pas en lecture seule ; lit le stock (biens, copropriétés et leurs adresses, syndics, AG, habitants et gardiens, bâtiments,
 * digicodes en vigueur, regroupements 504, autres données rangées par adresse) ; rapproche biens et adresses par le MODULE UNIQUE ; rend le plan
 * (`planUnification`) et la preuve qu'il n'a rien écrit (tables comptées avant et après).
 */
export type IssueUnification = { ok: false; motif: string } | { ok: true; base: string; plan: PlanUnification; avant: Comptage; apres: Comptage; intact: boolean };

/** Les autres données rangées par une clé d'adresse : la table, sa colonne de clé, et la forme de la clé (une adresse seule, ou « voie|cp|commune »). */
export const DONNEES_PAR_ADRESSE: readonly { table: string; colonne: string; nom: string; composee?: boolean }[] = [
  { table: 'gestion_copropriete_ag', colonne: 'cle_immeuble', nom: 'AG (fiche copropriété)' },
  { table: 'gestion_immeuble_ag', colonne: 'cle_immeuble', nom: 'AG (immeuble, 377)' },
  { table: 'gestion_copropriete_batiment', colonne: 'adresse_cle', nom: 'bâtiments' },
  { table: 'gestion_copropriete_rattachement_refus', colonne: 'adresse_cle', nom: 'refus de rattachement par la parcelle' },
  { table: 'gestion_immeuble', colonne: 'cle_adresse', nom: 'immeubles des digicodes d’avant (396)', composee: true },
];

export async function unificationDuStock(): Promise<IssueUnification> {
  const { rows: [etat] } = await query<{ base: string; lecture_seule: string }>(`SELECT current_database() AS base, current_setting('default_transaction_read_only') AS lecture_seule`);
  if (etat?.lecture_seule !== 'on') return { ok: false, motif: `La connexion à « ${etat?.base ?? '?'} » n’est pas en lecture seule : rien n’est fait.` };
  const avant = await compterTables();
  const plan = planUnification(await lireEntreeUnification());
  const apres = await compterTables();
  return { ok: true, base: etat.base, plan, avant, apres, intact: TABLES_COMPTEES.every((t) => avant[t] === apres[t]) };
}

/** LE STOCK, LU (sans écrire) : ce que reçoit le plan — partagé par l'essai et par l'application (lot 5). */
export async function lireEntreeUnification(): Promise<EntreeUnification> {
  const avec505 = await colonneExisteMemo('gestion_copropriete_adresse', 'sorte');
  const avec476 = await colonneExisteMemo('gestion_copropriete', 'nom');

  const { rows: lots } = await query<{ id: string; immeuble: string | null; adresse: string | null; code_postal: string | null; commune: string | null }>(
    'SELECT id::text, immeuble, adresse, code_postal, commune FROM gestion_annuaire_lot WHERE absent_le IS NULL ORDER BY id');
  const biens: BienStock[] = lots.map((b) => ({ id: Number(b.id), immeuble: b.immeuble, adresse: b.adresse, codePostal: b.code_postal, commune: b.commune }));
  const { rows: cs } = await query<{ id: string; cle: string; libelle: string; cp: string | null; commune: string | null; nom: string | null; ban_id: string | null;
    syndic_id: string | null; syndic: string | null; ag: string; contacts: string; batiments: string }>(
    `SELECT c.id::text, c.cle_immeuble AS cle, c.libelle, c.code_postal AS cp, c.commune, ${avec476 ? 'c.nom' : 'NULL::text AS nom'}, ${avec505 ? 'c.ban_id' : 'NULL::text AS ban_id'},
            s.id::text AS syndic_id, s.nom AS syndic,
            (SELECT count(*) FROM gestion_copropriete_ag g WHERE g.copropriete_id = c.id)::text AS ag,
            (SELECT count(*) FROM gestion_copropriete_contact k WHERE k.copropriete_id = c.id AND k.retire_le IS NULL)::text AS contacts,
            (SELECT count(*) FROM gestion_copropriete_batiment b WHERE b.copropriete_id = c.id)::text AS batiments
       FROM gestion_copropriete c
       LEFT JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
       LEFT JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL ORDER BY c.id`);
  const copros: CoproStock[] = cs.map((c) => ({ id: Number(c.id), cle: c.cle, libelle: c.libelle, nom: c.nom, banId: c.ban_id,
    syndic: c.syndic_id === null ? null : { id: Number(c.syndic_id), nom: c.syndic ?? '' }, ag: Number(c.ag), contacts: Number(c.contacts), batiments: Number(c.batiments) }));
  const { rows: sec } = await query<{ id: string; copro: string; cle: string; libelle: string; cp: string | null; commune: string | null; sorte: string }>(
    `SELECT id::text, copropriete_id::text AS copro, cle_immeuble AS cle, libelle, code_postal AS cp, commune, ${avec505 ? 'sorte' : "'adresse'::text AS sorte"}
       FROM gestion_copropriete_adresse WHERE retire_le IS NULL ORDER BY id`);
  const adressesCopro: AdresseCoproStock[] = [
    ...cs.map((c) => ({ id: null, coproId: Number(c.id), cle: c.cle, libelle: c.libelle, codePostal: c.cp, commune: c.commune, principale: true, sorte: 'adresse' as const })),
    ...sec.map((a) => ({ id: Number(a.id), coproId: Number(a.copro), cle: a.cle, libelle: a.libelle, codePostal: a.cp ?? cs.find((c) => c.id === a.copro)?.cp ?? null,
      commune: a.commune ?? cs.find((c) => c.id === a.copro)?.commune ?? null, principale: false, sorte: a.sorte === 'ecriture' ? 'ecriture' as const : 'adresse' as const })),
  ];

  // les rapprochements, par le module unique (les biens écrits de la même façon ne sont rapprochés qu'une fois)
  const memo = new Map<string, Promise<RapprochementComplet>>();
  const rapprochementDesBiens = new Map<number, RapprochementComplet>();
  for (const b of biens) {
    const k = JSON.stringify([b.immeuble, b.adresse, b.codePostal, b.commune]);
    if (!memo.has(k)) memo.set(k, rapprocherBien(b));
    rapprochementDesBiens.set(b.id, await memo.get(k)!);
  }
  const rapprochementDesAdresses = new Map<string, RapprochementComplet>();
  for (const a of adressesCopro) if (!rapprochementDesAdresses.has(a.cle)) rapprochementDesAdresses.set(a.cle, await rapprocherAdresse({ texte: a.libelle, codePostal: a.codePostal, commune: a.commune }));

  // les digicodes EN VIGUEUR de chaque clé d'adresse (base unique et valeurs d'avant), par place
  const cles = [...new Set([...adressesCopro.map((a) => a.cle), ...biens.map((b) => cleImmeuble((b.immeuble ?? '').trim() || (b.adresse ?? '').trim())).filter((k) => k !== '')])];
  const digicodes: DigicodeEnVigueur[] = [];
  for (const d of await digicodesDesAdresses(cles)) {
    for (const p of [d.commun, ...d.batiments]) {
      const v = p.code?.valeur;
      if (v === undefined || (v.digicode === null && (v.code ?? '') === '')) continue;
      digicodes.push({ adresseCle: d.adresseCle, place: p === d.commun ? '' : p.cle, code: v.digicode === false ? 'pas de digicode' : (v.code ?? 'oui (code inconnu)') });
    }
  }
  const idDeCle = new Map(copros.map((c) => [c.cle, c.id]));
  const regroupements = (await regroupementsEnCours()).map((g) => ({ id: g.id, coproId: idDeCle.get(g.cle) ?? -1, regroupees: g.regroupees }));

  const autresParCle = new Map<string, Record<string, number>>();
  for (const t of DONNEES_PAR_ADRESSE) {
    if (!(await colonneExisteMemo(t.table, t.colonne))) continue;
    // le nom de table et de colonne viennent de la liste fixe ci-dessus, jamais d'une saisie
    const { rows } = await query<{ cle: string; n: string }>(`SELECT ${t.composee ? `split_part(${t.colonne}, '|', 1)` : t.colonne} AS cle, count(*)::text AS n FROM ${t.table} GROUP BY 1`);
    for (const r of rows) { const m = autresParCle.get(r.cle) ?? {}; m[t.nom] = (m[t.nom] ?? 0) + Number(r.n); autresParCle.set(r.cle, m); }
  }
  return { biens, rapprochementDesBiens, copros, adressesCopro, rapprochementDesAdresses, digicodes, regroupements, autresParCle };
}
