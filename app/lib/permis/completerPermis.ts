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
/** N10-R — abstention PRÉVUE par une étape (décision du corpus), pour tracer le motif même en --dry-run (où rien n'est écrit). */
export interface PrevisionAbstention { champ: string; corpsId: number | null; motif: string }
export interface Etape { nom: string; executer(): Promise<{ resume: string; coutApiUsd?: number; abstentions?: PrevisionAbstention[] }> }
export interface EtapeResultat { nom: string; statut: 'ok' | 'ignoree' | 'echec'; resume: string; coutApiUsd: number }

const cle = (corpsId: number | null, colonne: string) => `${corpsId ?? 'permis'}:${colonne}`;

/** Enchaîne les étapes DANS L'ORDRE. Une étape en échec NE STOPPE PAS les autres (signalée + on continue). `sauter` = étapes ignorées.
 *  Rend aussi l'`overlay` des motifs d'abstention prévus (par champ/corps) — pour que le compte rendu ne montre AUCUN vide muet en --dry-run. */
export async function executerEtapes(etapes: readonly Etape[], sauter: readonly string[] = []): Promise<{ etapes: EtapeResultat[]; coutApiUsd: number; overlay: Map<string, string> }> {
  const out: EtapeResultat[] = [];
  const overlay = new Map<string, string>();
  for (const e of etapes) {
    if (sauter.includes(e.nom)) { out.push({ nom: e.nom, statut: 'ignoree', resume: 'ignorée (--sauter)', coutApiUsd: 0 }); continue; }
    try { const r = await e.executer(); for (const a of r.abstentions ?? []) overlay.set(cle(a.corpsId, a.champ), a.motif); out.push({ nom: e.nom, statut: 'ok', resume: r.resume, coutApiUsd: r.coutApiUsd ?? 0 }); }
    catch (err) { out.push({ nom: e.nom, statut: 'echec', resume: `ÉCHEC : ${err instanceof Error ? err.message : String(err)}`, coutApiUsd: 0 }); }
  }
  return { etapes: out, coutApiUsd: out.reduce((s, e) => s + e.coutApiUsd, 0), overlay };
}

// ── Compte rendu champ par champ ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface LigneRapport { niveau: string; champ: string; valeur: string | null; origine: OrigineValeur | null; methode: string | null; motif: string | null; sansMotif: boolean; permanent: boolean }

/** N10-R (cause 2) — champs SANS aucun extracteur (mesure du 21/08 : non lisibles) : motif PERMANENT, distinct d'une abstention
 *  circonstancielle. « aucun extracteur » = on a DÉCIDÉ de ne pas extraire ; « aucune planche… » = le corpus est muet. À distinguer. */
export const MOTIF_SANS_EXTRACTEUR = 'aucun extracteur — non extractible du corpus (mesure du 21/08), à saisir à la main';
const SANS_EXTRACTEUR = new Set(['hauteur_relative_m', 'altitude_terrain_naturel_ngf']);

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

function ligne(niveau: string, libelle: string, colonne: string, corpsId: number | null, valeur: unknown, origine: OrigineValeur | null, j: JournalChamp | undefined, overlay: Map<string, string>): LigneRapport {
  const rempli = valeur !== null && valeur !== undefined && !(Array.isArray(valeur) && valeur.length === 0);
  if (rempli) return { niveau, champ: libelle, valeur: Array.isArray(valeur) ? valeur.join(', ') : String(valeur), origine, methode: j?.methode ?? null, motif: null, sansMotif: false, permanent: false };
  // Cause 2 (motif PERMANENT) prime sur tout : champ sans extracteur → jamais un vide muet, jamais confondu avec une abstention circonstancielle.
  if (SANS_EXTRACTEUR.has(colonne)) return { niveau, champ: libelle, valeur: null, origine: null, methode: null, motif: MOTIF_SANS_EXTRACTEUR, sansMotif: false, permanent: true };
  // Sinon : motif journalisé (abstention persistée) → sinon motif prévu par une étape (overlay dry-run) → sinon défaut visible.
  const motif = j?.motif ?? overlay.get(cle(corpsId, colonne)) ?? null;
  return { niveau, champ: libelle, valeur: null, origine: null, methode: null, motif: motif ?? MOTIF_ABSENT, sansMotif: motif === null, permanent: false };
}

/**
 * Construit le compte rendu champ par champ à partir de l'état lu (colonnes + journal). PUR. Chaque champ VIDE porte un MOTIF
 * (journalisé, sinon PERMANENT `MOTIF_SANS_EXTRACTEUR` pour les champs sans extracteur, sinon `overlay` prévu par une étape en
 * --dry-run, sinon `MOTIF_ABSENT` + `sansMotif=true`) : un champ vide SANS motif est un défaut à faire remonter, jamais un silence.
 */
export function construireRapport(global: GlobalPermis | null, corps: readonly CorpsBatiment[], journal: JournalPermis, overlay: Map<string, string> = new Map()): LigneRapport[] {
  const g = global as (Record<string, unknown> | null);
  const rows: LigneRapport[] = [];
  for (const c of PERMIS) rows.push(ligne('permis', c.libelle, c.colonne, null, g?.[c.cle as string], (g?.[`${c.cle}Origine`] as OrigineValeur | null) ?? null, journal.permis[c.colonne], overlay));
  // destinations (tableau)
  rows.push(ligne('permis', 'Destinations', 'destinations', null, global?.destinations ?? null, global?.destinationsOrigine ?? null, journal.permis['destinations'], overlay));
  // corps
  for (const co of corps) {
    const jc = journal.parCorps[co.id] ?? {};
    const rec = co as unknown as Record<string, unknown>;
    for (const m of MESURES) rows.push(ligne(`corps #${co.id}${co.repere ? ` (${co.repere})` : ''}`, m.libelle, m.colonne, co.id, rec[m.cle as string], (rec[`${m.cle}Origine`] as OrigineValeur | null) ?? null, jc[m.colonne], overlay));
  }
  return rows;
}

/** Nombre de champs VIDES sans motif journalisé (doit être 0 sur un dossier complété proprement). */
export const compterSansMotif = (rows: readonly LigneRapport[]): number => rows.filter((r) => r.sansMotif).length;
