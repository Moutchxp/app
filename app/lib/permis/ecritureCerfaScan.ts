/**
 * N10-O — DÉPÔT de la lecture d'un Cerfa SCANNÉ (niveau PERMIS). IMPUR (base). Consomme les DEUX lectures (OCR + vision) rendues par
 * `lireCerfaScan`, les accorde (`decisionCerfaScan`, pur) et applique le plan : écrit les colonnes déclarées (migration 106) +
 * `destinations` (110) en origine='extraite' (invariant 103), journalise en `methode='ia'` avec pièce et page.
 *
 * 🔒 Accord des deux sources → écrit (confiance 'confirmee'). Désaccord/abstention → RIEN d'écrit, les lectures journalisées.
 * Sitadel n'entre PAS ici (corroboration, jamais source). RECOMPUTE IDEMPOTENT : purge CIBLÉE methode='ia' des champs concernés.
 */
import { query } from '../db/client';
import { ecrireCaracteristiquesGlobales, ecrireDestinations, type ValeursGlobalDeclare } from './caracteristiquesRepo';
import { accorder, accorderDestinations, planifierEcriture, type LectureValeur, type ChampScalaire } from './decisionCerfaScan';
import { SOUS_DESTINATIONS } from './lireCerfaScan';

export interface LecturesCerfa {
  scalaires: Record<'surfacePlancherM2' | 'nbLogements' | 'nbPlacesStationnement' | 'adresseTerrain', { ocr: LectureValeur; vision: LectureValeur }>;
  destinations: { ocr: Record<string, LectureValeur>; vision: Record<string, LectureValeur> };
}

const META: { cle: ChampScalaire['cle']; colonne: string; page: number; numerique: boolean }[] = [
  { cle: 'adresseTerrain', colonne: 'adresse_terrain', page: 5, numerique: false },
  { cle: 'nbLogements', colonne: 'nb_logements', page: 7, numerique: true },
  { cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', page: 9, numerique: true },
  { cle: 'nbPlacesStationnement', colonne: 'nb_places_stationnement', page: 10, numerique: true },
];
const CHAMPS = [...META.map((m) => m.colonne), 'destinations'];

export interface ResultatCerfaScan { ecrits: string[]; abstentions: string[]; desaccords: string[]; nbJournal: number }

/** Construit le plan (pur) à partir des lectures — exposé pour l'affichage à blanc (--dry-run) et les tests. */
export function planDepuisLectures(piece: string, lectures: LecturesCerfa) {
  const champs: ChampScalaire[] = META.map((m) => ({ cle: m.cle, colonne: m.colonne, page: m.page, numerique: m.numerique, accord: accorder(lectures.scalaires[m.cle].ocr, lectures.scalaires[m.cle].vision) }));
  const accordDest = accorderDestinations(SOUS_DESTINATIONS, lectures.destinations.ocr, lectures.destinations.vision);
  return { plan: planifierEcriture(champs, piece, 9, accordDest), champs, accordDest };
}

/** Applique le plan : colonnes + destinations (origine 'extraite'), journal 'ia'. `dryRun` → aucune écriture, rend le plan calculé. */
export async function ecrireCerfaScan(dossierId: number, piece: string, lectures: LecturesCerfa, majPar: string, dryRun = false): Promise<ResultatCerfaScan & { plan: ReturnType<typeof planDepuisLectures>['plan'] }> {
  const { plan } = planDepuisLectures(piece, lectures);
  const ecrits: string[] = [], abstentions: string[] = [], desaccords: string[] = [];

  const classer = (champ: string, motif: string | null) => { const c = motif && /divergent|non concordant/i.test(motif) ? desaccords : abstentions; if (!c.includes(champ)) c.push(champ); };
  if (dryRun) {
    for (const l of plan.journal) { if (l.role === 'retenue') { if (!ecrits.includes(l.champ)) ecrits.push(l.champ); } else classer(l.champ, l.motif); }
    return { plan, ecrits, abstentions: abstentions.filter((c) => !ecrits.includes(c)), desaccords, nbJournal: plan.journal.length };
  }

  // Purge idempotente CIBLÉE (jamais 'cerfa'/'motifs'/'plan', jamais la saisie).
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'ia' AND champ = ANY($2::text[])`, [dossierId, CHAMPS]);

  // Colonnes déclarées scalaires (invariant 103 réutilisé).
  const valeurs: ValeursGlobalDeclare = {};
  for (const s of plan.scalaires) {
    const m = META.find((x) => x.cle === s.cle)!;
    (valeurs as Record<string, string | number>)[s.cle] = m.numerique ? Number(String(s.valeur).replace(',', '.').replace(/\s/g, '')) : s.valeur;
  }
  if (Object.keys(valeurs).length > 0) { const r = await ecrireCaracteristiquesGlobales(dossierId, valeurs, 'extraite', majPar); ecrits.push(...r.ecrits.map((c) => META.find((m) => m.cle === c)?.colonne ?? c)); }

  // Destinations (tableau) — seulement si accord ET non vide.
  if (plan.destinations && plan.destinations.length > 0) { const rd = await ecrireDestinations(dossierId, plan.destinations, 'extraite', majPar); if (rd.ecrit) ecrits.push('destinations'); }

  // Journal (methode='ia', niveau permis corps_id NULL).
  for (const l of plan.journal) {
    await query(
      `INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
       VALUES ($1, NULL, $2, $3, NULL, $4, 'ia', $5, $6, $7, $8, $9, $10, now())`,
      [dossierId, l.champ, l.valeur, l.role, l.confiance, l.reserve, l.motif, l.piece, l.page, l.extrait],
    );
    if (l.role === 'ecartee') classer(l.champ, l.motif);
  }
  return { plan, ecrits: [...new Set(ecrits)], abstentions: abstentions.filter((c) => !ecrits.includes(c)), desaccords, nbJournal: plan.journal.length };
}
