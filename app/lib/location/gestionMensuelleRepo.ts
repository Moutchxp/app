import 'server-only';
import { query } from '../db/client';
import { colonneExisteMemo } from './sondeLocation';
import { indiceDuBailDisponible, indicesDisponibles } from './indicesRepo';
import type { TypeIndice } from './indicesLoyers';
import { aujourdhuiParis, type Apporteur } from './suivi/suivi';
import {
  dureeApporteurDe, modeApporteurDe, remunerationCollegueDe, tauxGestionApporteurDe, type ActiviteCalcul,
} from './suivi/tableauBord';
import {
  calculerDossier, finDeDuree, indicesManquants, type BailMensuel, type BienMensuel, type Fenetre, type LireIndice,
} from './suivi/gestionMensuelle';

/**
 * ══ 🔴 Arno (25/10/2026) — LES DONNÉES DU CALCUL MENSUEL DE LA GESTION (IMPUR : base, lecture seule) ════════════════════════════════════
 * Pour un bien : ses baux successifs (entrée, sortie, locataires), le loyer d'entrée et le taux d'honoraires de gestion du mandat (les
 * conditions du bail, sinon le taux WIPPIMMO du bien), l'indice du bail et sa date de révision (423), les loyers RÉELS révisés (423). Les
 * indices : la table, valeur en vigueur. Rien n'est écrit, rien n'est figé : tout est recalculé à chaque lecture.
 */

const nomLocataire = `coalesce(nullif(btrim(concat_ws(' ', lo.prenom, lo.nom)), ''), lo.nom)`;
const libelleLot = `coalesce(nullif(concat_ws(' — ', nullif(btrim(l.nature), ''), nullif(btrim(concat_ws(' ', l.adresse, l.commune)), '')), ''), 'Bien n° ' || l.id)`;
const nb = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/** La table des indices, valeur EN VIGUEUR (vide sans la 423). */
export async function lectureIndices(): Promise<LireIndice> {
  if (!(await indicesDisponibles())) return () => null;
  const { rows } = await query<{ type: string; annee: number; trimestre: number; valeur: string }>(
    'SELECT DISTINCT ON (type, annee, trimestre) type, annee, trimestre, valeur::text AS valeur FROM gestion_location_indice ORDER BY type, annee, trimestre, id DESC');
  const m = new Map(rows.map((r) => [`${r.type}-${r.annee}-${r.trimestre}`, Number(r.valeur)]));
  return (t, a, q) => m.get(`${t}-${a}-${q}`) ?? null;
}

/** Les biens demandés et leurs baux (sans la sortie de gestion, propre à chaque dossier d'apport). */
export async function biensMensuels(lotIds: readonly number[]): Promise<Map<number, Omit<BienMensuel, 'finGestion'>>> {
  const sortie = new Map<number, Omit<BienMensuel, 'finGestion'>>();
  if (lotIds.length === 0) return sortie;
  const avec423 = await indiceDuBailDisponible();
  const avecRevise = await colonneExisteMemo('gestion_location_loyer_revise', 'effet_le');
  const avecBailCond = await colonneExisteMemo('gestion_location_conditions', 'bail_id');
  const { rows } = await query<Record<string, unknown>>(
    `SELECT b.id, b.lot_id, b.entree::text AS entree, b.sortie::text AS sortie, ${libelleLot} AS libelle, l.taux_honos_wippimmo::text AS taux_bien,
            (SELECT nullif(string_agg(${nomLocataire}, ', ' ORDER BY lo.id), '') FROM gestion_annuaire_locataire lo
              WHERE lo.id IN (SELECT oc.locataire_id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = b.id)) AS locataires,
            c.loyer_hc::text AS loyer_hc, c.provisions::text AS provisions, c.base, c.taux_gestion_ht::text AS taux,
            ${avec423 ? 'ce.indice_type, ce.indice_annee, ce.indice_trimestre, ce.revision_le::text AS revision_le' : 'NULL::text AS indice_type, NULL::int AS indice_annee, NULL::int AS indice_trimestre, NULL::text AS revision_le'},
            ${avecRevise ? `(SELECT json_agg(json_build_object('effet', r.effet_le::text, 'hc', r.loyer_hc::text, 'prov', r.provisions::text) ORDER BY r.effet_le, r.id)
               FROM gestion_location_loyer_revise r WHERE r.bail_id = b.id AND r.annule_le IS NULL)` : 'NULL::json'} AS revises
       FROM gestion_bail b
       JOIN gestion_annuaire_lot l ON l.id = b.lot_id
       LEFT JOIN LATERAL (SELECT x.loyer_hc, x.provisions, x.base, x.taux_gestion_ht FROM gestion_location_conditions x
                           WHERE ${avecBailCond ? 'x.bail_id = b.id OR ' : ''}x.occupation_id IN (SELECT oc.id FROM gestion_annuaire_occupation oc WHERE oc.bail_id = b.id)
                           ORDER BY x.id DESC LIMIT 1) c ON true
       ${avec423 ? `LEFT JOIN LATERAL (SELECT y.indice_type, y.indice_annee, y.indice_trimestre, y.revision_le FROM gestion_location_conditions_entree y
                           WHERE y.bail_id = b.id ORDER BY y.id DESC LIMIT 1) ce ON true` : ''}
      WHERE b.lot_id = ANY($1::bigint[]) AND b.entree IS NOT NULL
      ORDER BY b.lot_id, b.entree, b.id`, [[...lotIds]]);
  for (const r of rows) {
    const lotId = Number(r.lot_id);
    const bien = sortie.get(lotId) ?? { lotId, libelle: String(r.libelle), baux: [] as BailMensuel[] };
    const revises = Array.isArray(r.revises) ? (r.revises as { effet: string; hc: string; prov: string | null }[]) : [];
    (bien.baux as BailMensuel[]).push({
      bailId: Number(r.id), entree: String(r.entree), sortie: (r.sortie as string | null) ?? null, locataire: String(r.locataires ?? 'locataire'),
      loyerHc: nb(r.loyer_hc), provisions: nb(r.provisions), base: r.base === 'hc' ? 'hc' : 'cc', tauxGestion: nb(r.taux) ?? nb(r.taux_bien),
      indice: r.indice_type ? { type: r.indice_type as TypeIndice, annee: Number(r.indice_annee), trimestre: Number(r.indice_trimestre) } : null,
      revision: (r.revision_le as string | null) ?? null,
      revises: revises.map((x) => ({ effetLe: x.effet, loyerHc: Number(x.hc), provisions: nb(x.prov) })),
    });
    sortie.set(lotId, bien);
  }
  return sortie;
}

/** La rémunération RÉCURRENTE sur la gestion de l'apporteur d'un dossier (null : aucune). PUR. */
function fenetreApporteur(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): Fenetre | null {
  if (a.apporteurId === null || modeApporteurDe(a, apporteurs) !== 'recurrent') return null;
  const taux = tauxGestionApporteurDe(a, apporteurs);
  return taux > 0 ? { taux, debut: a.dateSignature, fin: finDeDuree(a.dateSignature, dureeApporteurDe(a, apporteurs)) } : null;
}
/** La rémunération RÉCURRENTE sur la gestion du collègue de rattachement d'un dossier (null : aucune). PUR. */
function fenetreCollegue(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): Fenetre | null {
  const r = remunerationCollegueDe(a, apporteurs);
  if (r === null || r.regle.mode !== 'recurrent' || r.regle.tauxGestion <= 0) return null;
  return { taux: r.regle.tauxGestion, debut: a.dateSignature, fin: finDeDuree(a.dateSignature, r.regle.dureeAnnees) };
}

/**
 * Pose le CALCUL MENSUEL sur les dossiers d'apport SAISIS DANS L'OUTIL (jamais sur ceux repris du fichier : leurs montants importés
 * restent) dont l'apporteur ou le collègue est « Récurrent » sur la gestion, quand le bien a les données (un bail avec loyer et taux).
 * Sinon rien n'est posé : la règle d'avant s'applique. Recalculé à chaque lecture (les nouveaux mois apparaissent d'eux-mêmes).
 */
export async function enrichirGestionMensuelle<T extends ActiviteCalcul & { lotId?: number | null; source?: string }>(activites: T[],
  apporteurs: readonly Apporteur[], aujourdhui: string): Promise<void> {
  const candidats = activites.filter((a) => a.source !== 'import' && typeof a.lotId === 'number' && a.apporteurId !== null
    && (fenetreApporteur(a, apporteurs) !== null || fenetreCollegue(a, apporteurs) !== null));
  if (candidats.length === 0) return;
  const [biens, indice] = await Promise.all([biensMensuels([...new Set(candidats.map((a) => a.lotId as number))]), lectureIndices()]);
  for (const a of candidats) {
    const lu = biens.get(a.lotId as number);
    if (lu === undefined) continue;
    // Le bail du dossier sans conditions saisies : le loyer et le taux du dossier lui-même (la règle d'avant), rien d'inventé.
    const b = { ...lu, baux: lu.baux.map((x) => (x.bailId !== (a as { bailId?: number | null }).bailId ? x : {
      ...x, loyerHc: x.loyerHc ?? a.loyerHc, provisions: x.loyerHc === null ? a.charges : x.provisions, tauxGestion: x.tauxGestion ?? a.tauxGestionBien ?? null,
    })) };
    if (!b.baux.some((x) => x.loyerHc !== null && x.tauxGestion !== null)) continue;
    const bien: BienMensuel = { ...b, finGestion: a.finGestion ?? null };
    a.gestionMensuelle = { lotId: b.lotId, libelle: b.libelle,
      mois: calculerDossier(bien, a.dateSignature, aujourdhui, indice, fenetreApporteur(a, apporteurs), fenetreCollegue(a, apporteurs)) };
  }
}

/** 🔴 Les indices MANQUANTS dont une révision passée a besoin (onglet « Indices », bien concerné), avec les biens. */
export async function alertesIndices(
  /** 🔴 Arno (25/10/2026) — la fiche d'UN bien : ses seules alertes (par l'identifiant du bien, ou son numéro WIPPIMMO). */
  bien?: { lotId: number } | { wippimmoId: number }): Promise<{ type: TypeIndice; annee: number; trimestre: number; biens: string[] }[]> {
  if (!(await indiceDuBailDisponible())) return [];
  const filtre = bien === undefined ? '' : 'lotId' in bien ? 'WHERE l.id = $1' : 'WHERE l.wippimmo_id::text = $1::text';
  const { rows } = await query<Record<string, unknown>>(
    `SELECT DISTINCT ON (ce.bail_id) ce.indice_type, ce.indice_annee, ce.indice_trimestre, ce.revision_le::text AS revision_le, b.sortie::text AS sortie,
            ${libelleLot} AS libelle
       FROM gestion_location_conditions_entree ce JOIN gestion_bail b ON b.id = ce.bail_id JOIN gestion_annuaire_lot l ON l.id = b.lot_id
      ${filtre}
      ORDER BY ce.bail_id, ce.id DESC`, bien === undefined ? [] : ['lotId' in bien ? bien.lotId : bien.wippimmoId]);
  const baux = rows.filter((r) => r.indice_type !== null).map((r) => ({
    indice: { type: r.indice_type as TypeIndice, annee: Number(r.indice_annee), trimestre: Number(r.indice_trimestre) },
    revision: (r.revision_le as string | null) ?? null, revises: [], sortie: (r.sortie as string | null) ?? null, libelle: String(r.libelle),
  }));
  return indicesManquants(baux, aujourdhuiParis(), await lectureIndices());
}
