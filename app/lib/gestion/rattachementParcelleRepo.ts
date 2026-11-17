import { query, withTransaction } from '../db/client';
import type { Auteur } from './gestes';
import { colonneExisteMemo } from '../location/sondeLocation';
import { adressesDeLaParcelle } from './parcelleRepo';
import { adresseImmeuble, cleImmeuble, type AdresseSaisie } from './syndics';

/**
 * ══ 🔴🔴 « RATTACHER À LA COPROPRIÉTÉ <NOM> — <ADRESSES> ? » (Arno, 17/11/2026, « Adresses multiples d'une copropriété », lot 5). IMPUR. ════════════════
 * « 3. À la création ou modification d'un bien dont l'adresse n'appartient à aucune copropriété mais tombe sur la parcelle d'une copropriété existante, le
 * système PROPOSE « Rattacher à la copropriété <nom> — <adresses> ? » ; rattacher ajoute cette adresse (avec son propre bloc digicode mère + filles, vide au
 * départ) après confirmation, jamais automatiquement (une parcelle peut porter deux copropriétés). » ; « Proposition […] partout où l'adresse d'un bien est
 * saisie (« Nouveau bien », « Modifier le bien », fiche du bien Gestion). La réponse « Non, c'est une autre copropriété » est mémorisée pour cette adresse et
 * la question ne revient plus. » ; « Ajouter une adresse : un seul endroit, la fiche Copropriété » — le rattachement écrit exactement là (335).
 */
export interface PropositionRattachement { coproprieteId: number; cle: string; nom: string; adresses: string[] }

/** La 491 est-elle posée (le « Non » se mémorise) ? */
export const refusMemorisable = (): Promise<boolean> => colonneExisteMemo('gestion_copropriete_rattachement_refus', 'adresse_cle');

/** Les copropriétés d'une adresse (principale ou secondaire en cours). LECTURE SEULE. */
async function coproprietesDesAdresses(cles: readonly string[]): Promise<{ id: string; cle: string; libelle: string; nom: string | null }[]> {
  if (cles.length === 0) return [];
  const { rows } = await query<{ id: string; cle: string; libelle: string; nom: string | null }>(
    `SELECT DISTINCT c.id::text, c.cle_immeuble AS cle, c.libelle, c.nom FROM gestion_copropriete c
      WHERE c.cle_immeuble = ANY($1::text[]) OR c.id IN (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = ANY($1::text[]) AND a.retire_le IS NULL)`, [[...cles]]);
  return rows;
}

/** LES PROPOSITIONS pour l'adresse saisie d'un bien : vide si elle est déjà une adresse de copropriété, ou si rien n'est sur sa parcelle. LECTURE SEULE. */
export async function propositionsRattachement(adresse: AdresseSaisie): Promise<PropositionRattachement[]> {
  const cle = cleImmeuble(adresse.libelle);
  if (cle === '') return [];
  if ((await coproprietesDesAdresses([cle])).length > 0) return []; // déjà une adresse de copropriété : rien à proposer
  const { adresses } = await adressesDeLaParcelle([adresse]);
  const copros = await coproprietesDesAdresses(adresses.map((a) => a.cle));
  if (copros.length === 0) return [];
  const refusees = (await refusMemorisable())
    ? new Set((await query<{ id: string }>('SELECT copropriete_id::text AS id FROM gestion_copropriete_rattachement_refus WHERE adresse_cle = $1', [cle])).rows.map((r) => r.id))
    : new Set<string>();
  const out: PropositionRattachement[] = [];
  for (const c of copros.filter((x) => !refusees.has(x.id))) {
    const { rows: sec } = await query<{ libelle: string; code_postal: string | null; commune: string | null }>(
      'SELECT libelle, code_postal, commune FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND retire_le IS NULL ORDER BY id', [c.id]);
    out.push({ coproprieteId: Number(c.id), cle: c.cle, nom: (c.nom ?? '').trim() || c.libelle, adresses: [c.libelle, ...sec.map((a) => a.libelle)] });
  }
  return out;
}

const texte = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const adresseDu = (b: Record<string, unknown>): AdresseSaisie => ({ libelle: texte(b.adresse), codePostal: texte(b.codePostal, 10), commune: texte(b.commune, 120) });

/**
 * RATTACHER (après la confirmation de l'écran) : l'adresse devient une adresse de la copropriété proposée — la même écriture que la fiche Copropriété
 * (335) ; son bloc de digicodes (vide) apparaît avec elle. Refus clairs, rien d'écrit : la proposition n'est plus valable (adresse déjà rattachée
 * ailleurs, copropriété plus sur la parcelle).
 */
export async function rattacherAdresse(brut: unknown, auteur: Auteur): Promise<{ ok: true; message: string } | { ok: false; motif: string }> {
  const b = (brut ?? {}) as Record<string, unknown>;
  const a = adresseDu(b);
  const id = Number(b.coproprieteId);
  const p = (await propositionsRattachement(a)).find((x) => x.coproprieteId === id);
  if (p === undefined) return { ok: false, motif: 'Cette proposition n’est plus valable (adresse déjà rattachée, ou copropriété hors de la parcelle) : rien n’est enregistré.' };
  await withTransaction(async (q) => {
    await q(`INSERT INTO gestion_copropriete_adresse (copropriete_id, cle_immeuble, libelle, code_postal, commune, cree_par, cree_par_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, cleImmeuble(a.libelle), a.libelle, a.codePostal || null, a.commune || null, auteur.id, auteur.libelle]);
  });
  return { ok: true, message: `${adresseImmeuble(a.libelle, a.codePostal || null, a.commune || null)} est désormais une adresse de la copropriété ${p.nom} : son bloc de digicodes (vide) est créé.` };
}

/** « NON, C'EST UNE AUTRE COPROPRIÉTÉ » : mémorisé pour cette adresse (la question ne revient plus) ; sans la 491 : rien n'est écrit. */
export async function refuserRattachement(brut: unknown, auteur: Auteur): Promise<{ ok: true; memorise: boolean } | { ok: false; motif: string }> {
  const b = (brut ?? {}) as Record<string, unknown>;
  const cle = cleImmeuble(adresseDu(b).libelle);
  const id = Number(b.coproprieteId);
  if (cle === '' || !Number.isSafeInteger(id) || id <= 0) return { ok: false, motif: 'Demande incomplète.' };
  if (!(await refusMemorisable())) return { ok: true, memorise: false };
  await query(`INSERT INTO gestion_copropriete_rattachement_refus (adresse_cle, copropriete_id, par, par_libelle) VALUES ($1, $2, $3, $4)
               ON CONFLICT (adresse_cle, copropriete_id) DO NOTHING`, [cle, id, auteur.id, auteur.libelle]);
  return { ok: true, memorise: true };
}
