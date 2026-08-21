/**
 * N10-Q — ORCHESTRATION : une passe qui enchaîne les 4 étapes de complétion d'UN permis (niveaux → champs → parcelles → cerfa-scan)
 * et rend UN compte rendu champ par champ. N'invente AUCUNE extraction : elle appelle les fonctions existantes (injectées comme
 * `Etape`). PUR côté contrôle-de-flux et construction du rapport (testable sans base ni API) ; les étapes réelles vivent dans la CLI.
 *
 * ⚠️ ORDRE IMPOSÉ (défaut signalé, N10-Q recon) : `niveaux` AVANT `champs`. `ecritureNiveaux.ts:43` (et `ecritureLots.ts:33`)
 * purgent `methode='enonce'` SANS filtre de champ ; or la désignation écrit `enonce`/champ='designation' (`ecritureDesignation.ts:32`).
 * Si `champs` (qui produit la désignation) tournait AVANT `niveaux`, la purge large de niveaux effacerait la ligne journal de la
 * désignation (la valeur en colonne survit ; sa TRACE non). À corriger un jour en scopant la purge niveaux/lots à leurs champs.
 */
import type { GlobalPermis, CorpsBatiment, OrigineValeur } from './caracteristiquesRepo';
import type { JournalPermis, JournalChamp } from './journalLecture';

// ── Contrôle de flux ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Etape { nom: string; executer(): Promise<{ resume: string; coutApiUsd?: number }> }
export interface EtapeResultat { nom: string; statut: 'ok' | 'ignoree' | 'echec'; resume: string; coutApiUsd: number }

/** Enchaîne les étapes DANS L'ORDRE. Une étape en échec NE STOPPE PAS les autres (signalée + on continue). `sauter` = étapes ignorées. */
export async function executerEtapes(etapes: readonly Etape[], sauter: readonly string[] = []): Promise<{ etapes: EtapeResultat[]; coutApiUsd: number }> {
  const out: EtapeResultat[] = [];
  for (const e of etapes) {
    if (sauter.includes(e.nom)) { out.push({ nom: e.nom, statut: 'ignoree', resume: 'ignorée (--sauter)', coutApiUsd: 0 }); continue; }
    try { const r = await e.executer(); out.push({ nom: e.nom, statut: 'ok', resume: r.resume, coutApiUsd: r.coutApiUsd ?? 0 }); }
    catch (err) { out.push({ nom: e.nom, statut: 'echec', resume: `ÉCHEC : ${err instanceof Error ? err.message : String(err)}`, coutApiUsd: 0 }); }
  }
  return { etapes: out, coutApiUsd: out.reduce((s, e) => s + e.coutApiUsd, 0) };
}

// ── Compte rendu champ par champ ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface LigneRapport { niveau: string; champ: string; valeur: string | null; origine: OrigineValeur | null; methode: string | null; motif: string | null; sansMotif: boolean }

const PERMIS: { cle: keyof GlobalPermis; colonne: string; libelle: string }[] = [
  { cle: 'surfacePlancherM2', colonne: 'surface_plancher_m2', libelle: 'Surface de plancher' },
  { cle: 'nbLogements', colonne: 'nb_logements', libelle: 'Nombre de logements' },
  { cle: 'nbPlacesStationnement', colonne: 'nb_places_stationnement', libelle: 'Places de stationnement' },
  { cle: 'adresseTerrain', colonne: 'adresse_terrain', libelle: 'Adresse du terrain' },
  { cle: 'designation', colonne: 'designation', libelle: 'Désignation de l’opération' },
  // NB : le « sommet du PERMIS » (N8-C, permis_caracteristique.altitude_sommet_ngf) n'est ciblé par AUCUNE des 4 étapes de complétion
  //   → volontairement HORS de ce rapport (sinon il ressortirait « vide sans motif » à tort). Le sommet par CORPS, lui, y figure.
];
const MESURES: { cle: keyof CorpsBatiment; colonne: string; libelle: string }[] = [
  { cle: 'nbEtages', colonne: 'nb_etages', libelle: 'Étages' },
  { cle: 'nbNiveauxSousSol', colonne: 'nb_niveaux_sous_sol', libelle: 'Niveaux de sous-sol' },
  { cle: 'altitudeDernierPlancherNgf', colonne: 'altitude_dernier_plancher_ngf', libelle: 'Dernier plancher (NGF)' },
  { cle: 'altitudeSommetNgf', colonne: 'altitude_sommet_ngf', libelle: 'Sommet (NGF)' },
  { cle: 'hauteurMaxPluNgf', colonne: 'hauteur_max_plu_ngf', libelle: 'Gabarit PLU (NGF)' },
  { cle: 'altitudePlateauNivellementNgf', colonne: 'altitude_plateau_nivellement_ngf', libelle: 'Plateau de nivellement (NGF)' },
  { cle: 'hauteurRelativeM', colonne: 'hauteur_relative_m', libelle: 'Hauteur relative' },
  { cle: 'altitudeTerrainNaturelNgf', colonne: 'altitude_terrain_naturel_ngf', libelle: 'Terrain naturel (NGF)' },
];

/** Motif par défaut quand un champ VIDE n'a AUCUNE trace journalisée : la doctrine interdit un vide muet → on le rend visible. */
export const MOTIF_ABSENT = 'non renseigné — aucune extraction ni abstention journalisée (à vérifier)';

function ligne(niveau: string, libelle: string, valeur: unknown, origine: OrigineValeur | null, j: JournalChamp | undefined): LigneRapport {
  const rempli = valeur !== null && valeur !== undefined && !(Array.isArray(valeur) && valeur.length === 0);
  if (rempli) return { niveau, champ: libelle, valeur: Array.isArray(valeur) ? valeur.join(', ') : String(valeur), origine, methode: j?.methode ?? null, motif: null, sansMotif: false };
  const motif = j?.motif ?? null;
  return { niveau, champ: libelle, valeur: null, origine: null, methode: null, motif: motif ?? MOTIF_ABSENT, sansMotif: motif === null };
}

/**
 * Construit le compte rendu champ par champ à partir de l'état lu (colonnes + journal). PUR. Chaque champ VIDE porte un MOTIF
 * (journalisé sinon `MOTIF_ABSENT` + `sansMotif=true`) : un champ vide SANS motif est un défaut à faire remonter, jamais un silence.
 */
export function construireRapport(global: GlobalPermis | null, corps: readonly CorpsBatiment[], journal: JournalPermis): LigneRapport[] {
  const g = global as (Record<string, unknown> | null);
  const rows: LigneRapport[] = [];
  for (const c of PERMIS) rows.push(ligne('permis', c.libelle, g?.[c.cle as string], (g?.[`${c.cle}Origine`] as OrigineValeur | null) ?? null, journal.permis[c.colonne]));
  // destinations (tableau)
  rows.push(ligne('permis', 'Destinations', global?.destinations ?? null, global?.destinationsOrigine ?? null, journal.permis['destinations']));
  // corps
  for (const co of corps) {
    const jc = journal.parCorps[co.id] ?? {};
    const rec = co as unknown as Record<string, unknown>;
    for (const m of MESURES) rows.push(ligne(`corps #${co.id}${co.repere ? ` (${co.repere})` : ''}`, m.libelle, rec[m.cle as string], (rec[`${m.cle}Origine`] as OrigineValeur | null) ?? null, jc[m.colonne]));
  }
  return rows;
}

/** Nombre de champs VIDES sans motif journalisé (doit être 0 sur un dossier complété proprement). */
export const compterSansMotif = (rows: readonly LigneRapport[]): number => rows.filter((r) => r.sansMotif).length;
