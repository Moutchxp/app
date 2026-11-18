import { query, type RequeteTx } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { colonneExisteMemo } from './sondeLocation';
import { LIBELLE_MANDAT, type Mandat, type SaisieMandat, type SorteMandat } from './mandatBien';
import { decisionMandat, formeMandat, signalementPartage, type DecisionMandat, type UsageMandat } from './mandatParBien';

/**
 * ══ 🔴🔴 LE N° DE MANDAT PORTÉ PAR CHAQUE BIEN — LECTURES ET ÉCRITURES (Arno, 18/11/2026, « Mandat par bien », migration 492). IMPUR (base). ══════
 * La règle du n° partagé est `decisionMandat` (mandatParBien.ts) ; ici : qui porte déjà ce n° (tous les biens, quel que soit leur statut — « jamais
 * réutilisable par un autre propriétaire »), l'ensemble des propriétaires d'un bien, l'écriture sur le bien (journalisée), et la lecture du mandat
 * d'un bien (une annexe rattachée lit celui de son logement : « elles portent le n° de leur logement, sans champ propre »).
 */
export const COLONNES_MANDAT_BIEN: Record<SorteMandat, { numero: string; normalise: string; date: string }> = {
  gestion: { numero: 'mandat_gestion_numero', normalise: 'mandat_gestion_normalise', date: 'mandat_gestion_signe_le' },
  transaction: { numero: 'mandat_transaction_numero', normalise: 'mandat_transaction_normalise', date: 'mandat_transaction_signe_le' },
};

/** La 492 est-elle posée (le mandat se porte par le bien) ? Sans elle : comme avant, sur la fiche des propriétaires. */
export const mandatParBienDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_annuaire_lot', 'mandat_transaction_signe_le');

type Lecteur = RequeteTx | typeof query;

/** L'ensemble des propriétaires d'un bien : le titulaire et les copropriétaires actifs. */
export async function ensembleDuBien(q: Lecteur, lotId: number): Promise<number[]> {
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'lot_id');
  const { rows } = await (q as RequeteTx)<{ id: string }>(
    `SELECT proprietaire_id::text AS id FROM gestion_annuaire_lot WHERE id = $1 AND proprietaire_id IS NOT NULL
     ${avecCo ? 'UNION SELECT proprietaire_id::text FROM gestion_annuaire_lot_proprietaire WHERE lot_id = $1 AND jusqu_a IS NULL' : ''}`, [lotId]);
  return [...new Set(rows.map((r) => Number(r.id)))];
}

/** Les AUTRES biens qui portent déjà ce n° (même sorte, même forme de comparaison), avec leur adresse et leurs propriétaires. */
export async function usagesDuMandat(q: Lecteur, sorte: SorteMandat, normalise: string, saufLot: number | null): Promise<UsageMandat[]> {
  const c = COLONNES_MANDAT_BIEN[sorte];
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'lot_id');
  const { rows } = await (q as RequeteTx)<{ id: string; adresse: string | null; cp: string | null; commune: string | null; etage: string | null; porte: string | null; proprios: string[] | null }>(
    `SELECT l.id::text, l.adresse, l.code_postal AS cp, l.commune, l.etage, l.porte,
            ARRAY(SELECT x::text FROM (SELECT l.proprietaire_id AS x WHERE l.proprietaire_id IS NOT NULL
              ${avecCo ? 'UNION SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = l.id AND lp.jusqu_a IS NULL' : ''}) s) AS proprios
       FROM gestion_annuaire_lot l WHERE l.${c.normalise} = $1 AND ($2::bigint IS NULL OR l.id <> $2) ORDER BY l.id`, [normalise, saufLot]);
  return rows.map((r) => ({
    lotId: Number(r.id),
    adresse: [[r.adresse, [r.cp, r.commune].filter((x) => (x ?? '').trim() !== '').join(' ')].filter((x) => (x ?? '').trim() !== '').join(', ') || `bien n° ${r.id}`,
      [r.etage ? `étage ${r.etage}` : null, r.porte ? `porte ${r.porte}` : null].filter((x) => x !== null).join(', ')].filter((x) => x !== '').join(' — '),
    proprietaires: (r.proprios ?? []).map(Number),
  }));
}

/**
 * LE CONTRÔLE d'un n° saisi pour un bien (existant : `lotId` ; à créer : `null`) et ses propriétaires, DANS la transaction de l'appelant : le n°
 * est verrouillé le temps de la transaction (deux enregistrements simultanés du même n° passent l'un après l'autre).
 */
export async function controlerMandatBien(q: RequeteTx, sorte: SorteMandat, numero: string, proprietaires: readonly number[], lotId: number | null,
  confirme: boolean): Promise<DecisionMandat> {
  const normalise = formeMandat(numero);
  if (normalise === null) return { etat: 'refus', motif: `${LIBELLE_MANDAT[sorte]} : le n° doit contenir au moins une lettre ou un chiffre. Rien n’est enregistré.` };
  await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`mandat-bien:${sorte}:${normalise}`]);
  return decisionMandat(sorte, numero.trim(), proprietaires, await usagesDuMandat(q, sorte, normalise, lotId), confirme);
}

/** Le refus « à confirmer » remonté aux écrans : la fenêtre « Confirmer / Corriger ». */
export class MandatAConfirmer extends Error {
  constructor(readonly sorte: SorteMandat, readonly numero: string, readonly adresses: string[], motif: string) { super(motif); }
}
/** Le refus absolu (un autre propriétaire). */
export class MandatRefuse extends Error {}

/**
 * ÉCRIT le mandat saisi sur le BIEN (le logement ou local ; jamais une annexe), dans la transaction de l'appelant, après le contrôle : un n° vide
 * garde celui du bien, une date vide garde la sienne ; seulement ce qui change ; journalisé sur le bien (avant / après).
 * Lève `MandatAConfirmer` (même propriétaire, sans confirmation) ou `MandatRefuse` (autre propriétaire) : rien n'est écrit.
 */
export async function ecrireMandatDuBien(q: RequeteTx, lotId: number, m: SaisieMandat, proprietaires: readonly number[], confirme: boolean, auteur: Auteur,
  contexte: string): Promise<boolean> {
  const c = COLONNES_MANDAT_BIEN[m.sorte];
  const { rows } = await q<{ n: string | null; d: string | null }>(`SELECT ${c.numero} AS n, ${c.date}::text AS d FROM gestion_annuaire_lot WHERE id = $1 FOR UPDATE`, [lotId]);
  const avant = rows[0];
  if (avant === undefined) throw new MandatRefuse('Ce bien n’existe pas.');
  const numero = m.numero ?? avant.n;
  const signeLe = m.signeLe ?? avant.d;
  if (numero === avant.n && signeLe === avant.d) return false;
  if (numero !== null && numero !== avant.n) {
    const d = await controlerMandatBien(q, m.sorte, numero, proprietaires, lotId, confirme);
    if (d.etat === 'refus') throw new MandatRefuse(d.motif);
    if (d.etat === 'a_confirmer') throw new MandatAConfirmer(m.sorte, numero.trim(), d.adresses, d.motif);
  }
  await q(`UPDATE gestion_annuaire_lot SET ${c.numero} = $2, ${c.normalise} = $3, ${c.date} = $4::date WHERE id = $1`, [lotId, numero, formeMandat(numero), signeLe]);
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
           VALUES ('annuaire_lot', $1, $2, $3, $4, $5, $6, $7)`,
    [lotId, m.sorte === 'gestion' ? 'location_numero_mandat' : 'location_numero_mandat_transaction',
      [avant.n, avant.d].filter((x) => x).join(' · ') || null, [numero, signeLe].filter((x) => x).join(' · ') || null,
      `${LIBELLE_MANDAT[m.sorte]} du bien saisi ${contexte}`, auteur.id, auteur.libelle]);
  return true;
}

/** Le mandat d'un bien, par sorte, et le signalement d'un n° partagé qui ne couvre plus le même propriétaire. */
export interface MandatsDuBien { lotId: number; porteur: number; gestion: Mandat; transaction: Mandat; signalements: string[] }

/**
 * LES MANDATS de biens (lecture seule) : une annexe rattachée lit ceux de son logement (`porteur`). Rien sans la 492 (tableau vide).
 */
export async function mandatsDesBiens(lotIds: readonly number[]): Promise<MandatsDuBien[]> {
  if (lotIds.length === 0 || !(await mandatParBienDisponible())) return [];
  const avecAnnexe = await colonneExisteMemo('gestion_lot_annexe', 'annexe_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const { rows } = await query<{ id: string; porteur: string; mg: string | null; mgn: string | null; dg: string | null; mt: string | null; mtn: string | null; dt: string | null }>(
    `SELECT l.id::text, p.id::text AS porteur, p.mandat_gestion_numero AS mg, p.mandat_gestion_normalise AS mgn, p.mandat_gestion_signe_le::text AS dg,
            p.mandat_transaction_numero AS mt, p.mandat_transaction_normalise AS mtn, p.mandat_transaction_signe_le::text AS dt
       FROM gestion_annuaire_lot l
       JOIN gestion_annuaire_lot p ON p.id = coalesce(${avecAnnexe ? `(SELECT ax.parent_id FROM gestion_lot_annexe ax WHERE ax.annexe_id = l.id${avecDetache ? ' AND l.annexe_detachee_le IS NULL' : ''} LIMIT 1)` : 'NULL::bigint'}, l.id)
      WHERE l.id = ANY($1::bigint[])`, [[...lotIds]]);
  const out: MandatsDuBien[] = [];
  for (const id of lotIds) {
    const r = rows.find((x) => Number(x.id) === id);
    if (r === undefined) continue;
    const porteur = Number(r.porteur);
    const signalements: string[] = [];
    for (const [sorte, n, f] of [['gestion', r.mg, r.mgn], ['transaction', r.mt, r.mtn]] as const) {
      if (n === null || f === null) continue;
      const s = signalementPartage(sorte, n, await ensembleDuBien(query, porteur), await usagesDuMandat(query, sorte, f, porteur));
      if (s !== null) signalements.push(s);
    }
    out.push({ lotId: id, porteur, gestion: { numero: r.mg, signeLe: r.dg }, transaction: { numero: r.mt, signeLe: r.dt }, signalements });
  }
  return out;
}

/** LE CONTRÔLE AVANT ÉCRITURE (lecture seule, sans verrou) : ce que dirait l'enregistrement — pour refuser tôt, sans rien avoir écrit. */
export async function decisionAvantEcriture(sorte: SorteMandat, numero: string, proprietaires: readonly number[], lotId: number | null, confirme: boolean): Promise<DecisionMandat> {
  const normalise = formeMandat(numero);
  if (normalise === null) return { etat: 'refus', motif: `${LIBELLE_MANDAT[sorte]} : le n° doit contenir au moins une lettre ou un chiffre. Rien n’est enregistré.` };
  if (lotId !== null) {
    const { rows } = await query<{ f: string | null }>(`SELECT ${COLONNES_MANDAT_BIEN[sorte].normalise} AS f FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
    if (rows[0]?.f === normalise) return { etat: 'libre' }; // le n° du bien, inchangé
  }
  return decisionMandat(sorte, numero.trim(), proprietaires, await usagesDuMandat(query, sorte, normalise, lotId), confirme);
}

/**
 * LE PRÉ-REMPLISSAGE de « Nouveau bien » (lecture seule) : pour l'ensemble EXACT des propriétaires choisis, le dernier n° de mandat (par sorte) porté par
 * un de leurs biens — l'enregistrement demandera la confirmation (« L'utiliser aussi pour ce bien ? »). Même forme que `mandatsDesProprietaires`.
 */
export async function mandatsDuMemeEnsemble(ids: readonly number[]): Promise<{ id: number; nom: string; gestion: Mandat; transaction: Mandat }[]> {
  if (ids.length === 0) return [];
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'lot_id');
  const cle = [...new Set(ids)].sort((a, b) => a - b).map(String);
  const { rows } = await query<{ id: string; adresse: string | null; mg: string | null; dg: string | null; mt: string | null; dt: string | null }>(
    `SELECT l.id::text, l.adresse, l.mandat_gestion_numero AS mg, l.mandat_gestion_signe_le::text AS dg, l.mandat_transaction_numero AS mt, l.mandat_transaction_signe_le::text AS dt
       FROM gestion_annuaire_lot l
      WHERE (l.mandat_gestion_numero IS NOT NULL OR l.mandat_transaction_numero IS NOT NULL)
        AND ARRAY(SELECT x::text FROM (SELECT l.proprietaire_id AS x WHERE l.proprietaire_id IS NOT NULL
              ${avecCo ? 'UNION SELECT lp.proprietaire_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.lot_id = l.id AND lp.jusqu_a IS NULL' : ''}) s ORDER BY x) = $1::text[]
      ORDER BY l.id DESC`, [cle]);
  const g = rows.find((r) => r.mg !== null);
  const t = rows.find((r) => r.mt !== null);
  if (g === undefined && t === undefined) return [];
  const ou = (r: { adresse: string | null; id: string } | undefined): string => (r === undefined ? '' : r.adresse ?? `bien n° ${r.id}`);
  return [{ id: ids[0], nom: `ce propriétaire (${ou(g ?? t)})`,
    gestion: g === undefined ? { numero: null, signeLe: null } : { numero: g.mg, signeLe: g.dg },
    transaction: t === undefined ? { numero: null, signeLe: null } : { numero: t.mt, signeLe: t.dt } }];
}

/** Un n° de mandat d'un bien d'un propriétaire (sa fiche : « la liste en lecture seule des n° de ses biens »). */
export interface MandatDUnBien { lotId: number; adresse: string; sorte: SorteMandat; numero: string | null; signeLe: string | null }

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien », réponse 2) — « Fiche propriétaire : les champs « N° de mandat de gestion / de transaction » deviennent […]
 * la liste en lecture seule des n° de ses biens (chacun modifiable sur son bien). » Les biens où il est titulaire ou copropriétaire actif ; une annexe
 * rattachée porte le n° de son logement (elle n'apparaît pas à part). LECTURE SEULE. Vide sans la 492.
 */
export async function mandatsDesBiensDuProprietaire(proprietaireId: number): Promise<MandatDUnBien[]> {
  if (!(await mandatParBienDisponible())) return [];
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'lot_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const { rows } = await query<{ id: string; adresse: string | null; cp: string | null; commune: string | null; mg: string | null; dg: string | null; mt: string | null; dt: string | null }>(
    `SELECT l.id::text, l.adresse, l.code_postal AS cp, l.commune, l.mandat_gestion_numero AS mg, l.mandat_gestion_signe_le::text AS dg,
            l.mandat_transaction_numero AS mt, l.mandat_transaction_signe_le::text AS dt
       FROM gestion_annuaire_lot l
      WHERE (l.proprietaire_id = $1${avecCo ? ' OR l.id IN (SELECT lp.lot_id FROM gestion_annuaire_lot_proprietaire lp WHERE lp.proprietaire_id = $1 AND lp.jusqu_a IS NULL)' : ''})
        AND (l.mandat_gestion_numero IS NOT NULL OR l.mandat_transaction_numero IS NOT NULL OR l.mandat_gestion_signe_le IS NOT NULL OR l.mandat_transaction_signe_le IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM gestion_lot_annexe ax WHERE ax.annexe_id = l.id${avecDetache ? ' AND l.annexe_detachee_le IS NULL' : ''})
      ORDER BY l.adresse NULLS LAST, l.id`, [proprietaireId]);
  const out: MandatDUnBien[] = [];
  for (const r of rows) {
    const adresse = [r.adresse, [r.cp, r.commune].filter((x) => (x ?? '').trim() !== '').join(' ')].filter((x) => (x ?? '').trim() !== '').join(', ') || `bien n° ${r.id}`;
    if (r.mg !== null || r.dg !== null) out.push({ lotId: Number(r.id), adresse, sorte: 'gestion', numero: r.mg, signeLe: r.dg });
    if (r.mt !== null || r.dt !== null) out.push({ lotId: Number(r.id), adresse, sorte: 'transaction', numero: r.mt, signeLe: r.dt });
  }
  return out;
}

/** Le mandat d'UN bien (son logement s'il est une annexe rattachée), ou `null` sans la 492 : le lecteur garde alors l'ancienne source. */
export async function mandatDuBien(lotId: number): Promise<{ gestion: Mandat; transaction: Mandat } | null> {
  if (!(await mandatParBienDisponible())) return null;
  const m = (await mandatsDesBiens([lotId]))[0];
  return m === undefined ? { gestion: { numero: null, signeLe: null }, transaction: { numero: null, signeLe: null } } : { gestion: m.gestion, transaction: m.transaction };
}
