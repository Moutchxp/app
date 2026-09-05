/**
 * LOT 101 — CORRECTION MANUELLE d'une parcelle mal référencée (impasse « parcelle non rattachée »). Quand la référence Sitadel est
 * introuvable au cadastre (ex. 468 : DK 649 inexistante ; DI 649 existe), l'app PROPOSE des candidates, ARNO CHOISIT, et le geste est
 * PERSISTÉ + TRACÉ comme humain — jamais un rapprochement automatique (principe « proposer, jamais deviner »).
 *
 * Chaîne débloquée : on réécrit la ligne permis_parcelle (section/numéro/idu, origine='saisie', `correction` jsonb) → l'IDU se
 * re-résout sur `parcelle` → figerEmpreinte recopie geom_snapshot + ST_Union → l'empreinte redevient dessinable → calage possible.
 * RÉSILIENT : colonne `correction` absente (migration 197) → le geste répond « indisponible » sans rien casser (comportement d'avant).
 */
import { query } from '../db/client';
import { versIdu, communeCadastrale } from '../sitadel/referenceCadastrale';
import { figerEmpreinte, figerBatiSnapshot, lireParcellesPermis, lireEmpreintePermis, type ParcelleLigne, type EmpreinteLigne } from './parcellesRepo';

export interface CandidatParcelle { idu: string; section: string; numero: string; contenance: number | null; motif: 'meme-numero-autre-section' | 'meme-section-numero-proche' }
export interface RefParcelle { prefixe: string | null; section: string; numero: string; idu: string | null }
export interface ResultatCandidats { ref: RefParcelle | null; commune: string | null; superficieDeclareeM2: number | null; candidats: CandidatParcelle[] }

/** Commune cadastrale (arrondissement) pour chercher au cadastre : d'abord l'IDU existant (5 premiers car.), sinon dérivée du n° de dossier. */
async function communePourParcelle(dossierId: number, idu: string | null): Promise<string | null> {
  if (idu && idu.length >= 5) return idu.slice(0, 5);
  const { rows } = await query<{ num_dau: string; code_insee: string }>(`SELECT num_dau, code_insee FROM sitadel_dossier WHERE id = $1`, [dossierId]);
  const d = rows[0];
  if (!d) return null;
  const c = communeCadastrale(d.num_dau, d.code_insee);
  return 'insee' in c ? c.insee : null;
}

/**
 * Candidates cadastrales PLAUSIBLES pour une parcelle (référence introuvable) : ① même commune + même numéro, AUTRE section (capte la
 * confusion DK/DI de 468) ; ② même commune + même section, numéro PROCHE (±5, capte une coquille de numéro). Chacune AVEC SA CONTENANCE
 * (le pouvoir de vérification d'Arno). Aucune candidate → liste vide (l'appelant le DIT, jamais un écran muet).
 */
export async function candidatsCorrectionParcelle(dossierId: number, parcelleId: number): Promise<ResultatCandidats | null> {
  const { rows } = await query<{ prefixe: string | null; section: string; numero: string; idu: string | null; superficie: string | number | null }>(
    `SELECT prefixe, section, numero, idu, superficie_declaree_m2 AS superficie FROM permis_parcelle WHERE id = $1 AND dossier_id = $2`, [parcelleId, dossierId]);
  const p = rows[0];
  if (!p) return null;
  const commune = await communePourParcelle(dossierId, p.idu);
  if (!commune) return { ref: { prefixe: p.prefixe, section: p.section, numero: p.numero, idu: p.idu }, commune: null, superficieDeclareeM2: p.superficie == null ? null : Number(p.superficie), candidats: [] };

  // ① même numéro, autre section — puis ② même section, numéro proche. `parcelle.numero`/`section` sans zéros de tête (comme permis_parcelle).
  const { rows: cands } = await query<{ id: string; section: string; numero: string; contenance: number | null; motif: string }>(
    `(SELECT id, section, numero, contenance, 'meme-numero-autre-section' AS motif
        FROM parcelle WHERE commune = $1 AND numero = $2 AND section <> $3)
     UNION
     (SELECT id, section, numero, contenance, 'meme-section-numero-proche' AS motif
        FROM parcelle WHERE commune = $1 AND section = $3 AND numero ~ '^[0-9]+$' AND $2 ~ '^[0-9]+$'
              AND numero::int BETWEEN ($2)::int - 5 AND ($2)::int + 5 AND numero <> $2)
     ORDER BY motif, section, numero`,
    [commune, p.numero, p.section]);
  const candidats: CandidatParcelle[] = cands.map((c) => ({ idu: c.id, section: c.section, numero: c.numero, contenance: c.contenance, motif: c.motif as CandidatParcelle['motif'] }));
  return { ref: { prefixe: p.prefixe, section: p.section, numero: p.numero, idu: p.idu }, commune, superficieDeclareeM2: p.superficie == null ? null : Number(p.superficie), candidats };
}

export type ResultatCorrection =
  | { ok: true; parcelles: ParcelleLigne[]; empreinte: EmpreinteLigne | null }
  | { ok: false; motif: 'migration_requise' | 'reference_inexistante' | 'parcelle_introuvable' | 'doublon' };

/** Une erreur SQL est-elle « colonne `correction` absente » (migration 197 non appliquée) ? */
function estColonneAbsente(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === '42703' || code === '42P01';
}

/**
 * Applique une correction MANUELLE : réécrit la ligne (section/numéro/préfixe/idu → choix), origine='saisie', `correction` jsonb
 * (référence d'origine remplacée + auteur + date), PUIS recalcule empreinte + photo bâti. Refuse si la référence choisie n'existe pas
 * au cadastre (jamais accepter une saisie fantôme). Choix = candidate OU saisie libre (même chemin, validé pareil).
 */
export async function corrigerParcelle(
  dossierId: number, parcelleId: number, choix: { section: string; numero: string; prefixe: string | null }, majPar: string,
): Promise<ResultatCorrection> {
  const { rows } = await query<{ prefixe: string | null; section: string; numero: string; idu: string | null }>(
    `SELECT prefixe, section, numero, idu FROM permis_parcelle WHERE id = $1 AND dossier_id = $2`, [parcelleId, dossierId]);
  const p = rows[0];
  if (!p) return { ok: false, motif: 'parcelle_introuvable' };
  const commune = await communePourParcelle(dossierId, p.idu);
  if (!commune) return { ok: false, motif: 'reference_inexistante' }; // sans commune cadastrale on ne peut pas valider → on refuse (jamais deviner)

  const section = choix.section.trim().toUpperCase();
  const numero = choix.numero.trim().replace(/^0+/, '') || '0'; // sans zéros de tête, comme `parcelle`
  const prefixe = (choix.prefixe ?? p.prefixe ?? '000') || '000';
  const nouvelIdu = versIdu({ insee: commune, prefixe, section, numero });

  // VALIDATION : la référence choisie DOIT exister au cadastre (jamais un rattachement fantôme).
  const { rows: exist } = await query<{ ok: boolean }>(`SELECT EXISTS(SELECT 1 FROM parcelle WHERE id = $1) AS ok`, [nouvelIdu]);
  if (!exist[0]?.ok) return { ok: false, motif: 'reference_inexistante' };

  // Réécriture de la ligne + TRACE de correction. Résilient : colonne `correction` absente → geste indisponible (rien réécrit).
  const refOrigine = JSON.stringify({ prefixe: p.prefixe, section: p.section, numero: p.numero, idu: p.idu });
  try {
    await query(
      `UPDATE permis_parcelle
          SET section = $3, numero = $4, prefixe = $5, idu = $6, origine = 'saisie', maj_le = now(), maj_par = $7::text,
              correction = jsonb_build_object('refOrigine', $8::jsonb, 'corrigeeLe', now(), 'corrigeePar', $7::text)
        WHERE id = $1 AND dossier_id = $2`,
      [parcelleId, dossierId, section, numero, prefixe, nouvelIdu, majPar, refOrigine]);
  } catch (e) {
    if (estColonneAbsente(e)) return { ok: false, motif: 'migration_requise' };
    if ((e as { code?: string })?.code === '23505') return { ok: false, motif: 'doublon' }; // une parcelle (section,numéro) identique existe déjà
    throw e;
  }

  await figerEmpreinte(dossierId, majPar);            // recopie geom_snapshot + ST_Union → empreinte dessinable
  await figerBatiSnapshot(dossierId, majPar).catch(() => undefined); // rafraîchit la photo du bâti (best-effort)
  return { ok: true, parcelles: await lireParcellesPermis(dossierId), empreinte: await lireEmpreintePermis(dossierId) };
}

/**
 * ANNULE une correction manuelle : restaure la référence d'origine (depuis `correction.refOrigine`), origine='extraite', vide le
 * snapshot, PUIS recalcule l'empreinte (qui redevient incomplète — l'état d'AVANT, jamais un état vide inventé). `annule:false` = rien
 * à annuler (pas de correction sur cette ligne).
 */
export async function annulerCorrectionParcelle(dossierId: number, parcelleId: number, majPar: string): Promise<{ ok: boolean; annule: boolean; parcelles?: ParcelleLigne[]; empreinte?: EmpreinteLigne | null }> {
  type Corr = { refOrigine?: { prefixe: string | null; section: string; numero: string; idu: string | null } } | null;
  let corr: Corr = null;
  try {
    const { rows } = await query<{ correction: Corr }>(`SELECT correction FROM permis_parcelle WHERE id = $1 AND dossier_id = $2`, [parcelleId, dossierId]);
    corr = rows[0]?.correction ?? null;
  } catch (e) { if (estColonneAbsente(e)) return { ok: true, annule: false }; throw e; } // migration absente → rien à annuler
  const ref = corr?.refOrigine;
  if (!ref) return { ok: true, annule: false }; // pas une correction manuelle
  await query(
    `UPDATE permis_parcelle
        SET section = $3, numero = $4, prefixe = $5, idu = $6, origine = 'extraite', geom_snapshot = NULL, snapshot_millesime = NULL,
            correction = NULL, maj_le = now(), maj_par = $7
      WHERE id = $1 AND dossier_id = $2`,
    [parcelleId, dossierId, ref.section, ref.numero, ref.prefixe, ref.idu, majPar]);
  await figerEmpreinte(dossierId, majPar); // recompute → empreinte redevient incomplète (état d'avant), jamais un vide inventé
  return { ok: true, annule: true, parcelles: await lireParcellesPermis(dossierId), empreinte: await lireEmpreintePermis(dossierId) };
}
