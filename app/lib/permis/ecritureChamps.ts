/**
 * N5-E — DÉPÔT D'ÉCRITURE généralisé à TOUS les champs (remplace l'ex-`ecritureSommet`). IMPUR (base) : consomme une
 * `DecisionChamps` (calculée en amont, PURE) et l'applique — attribution à un corps, écriture des champs qui concluent, et
 * JOURNAL complet : 'retenue' pour ce qui est écrit, 'candidat' pour les candidats explicatifs (niveau fini), 'ecartee' AVEC
 * MOTIF pour chaque champ non écrit. Ne re-décide RIEN.
 *
 * 🔒 RÈGLES ARBITRÉES (porteur, 15/08/2026) :
 * - ATTRIBUTION : 0 corps → en créer UN (repere=null) et y écrire · 1 corps → y écrire · ≥2 corps → n'attribuer à AUCUN,
 *   journaliser (motif ambiguïté) et ALERTER. Un corps n'est CRÉÉ que s'il y a au moins un champ à écrire.
 * - « La main l'emporte » : l'invariant du dépôt existant (`ecrireCorps`, mode 'extraite') est RÉUTILISÉ tel quel ; un champ déjà
 *   'saisie' n'est pas écrasé → journalisé 'ecartee' avec le motif « saisie occupe déjà le champ ».
 * - RECOMPUTE IDEMPOTENT : le journal auto ('motifs') du permis est purgé avant réécriture → il reflète TOUJOURS la dernière
 *   passe, jamais un cumul. La saisie humaine ne va jamais au journal, donc rien d'humain n'est touché.
 * - Rien n'attend personne : aucune file, aucun statut « en attente ». La confiance/le motif vivent dans le journal.
 */
import { query } from '../db/client';
import { lirePermisCaracteristiques, creerCorps, ecrireCorps, type ValeursCorps } from './caracteristiquesRepo';
import { proprietairesRetenue } from './journalLecture';
import { domine, motifEcartePrecedence } from './precedenceMethodes';
import type { CandidatNiveauFiniJournal } from './decisionSommet';
import type { ChampEcrit, DecisionChamps } from './decisionChamps';

export const MOTIF_SAISIE_PRIORITAIRE = 'une valeur saisie à la main occupe déjà le champ (non écrasée)';
export const MOTIF_AMBIGU_CORPS = 'attribution ambiguë : ≥2 bâtiments, aucun choix possible';
const METHODE = 'motifs';

export type ResultatEcritureChamps =
  | { statut: 'traite'; corpsId: number | null; corpsCree: boolean; champsEcrits: string[]; champsIgnoresSaisie: string[]; champsEcartesPrecedence: string[] }
  | { statut: 'ambigu_plusieurs_corps'; nbCorps: number };

type Role = 'retenue' | 'candidat' | 'ecartee';
interface LigneJournal {
  corpsId: number | null; champ: string; valeur: number | null; unite: 'ngf' | 'm' | null;
  role: Role; confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; motif: string | null;
  piece: string | null; page: number | null; extrait: string | null;
}

const CHAMP_NIVEAU_FINI = 'niveau_fini';

/** Lignes 'retenue' d'un champ écrit : une par observation (pièce/page/extrait), avec confiance + réserve. */
function lignesRetenue(d: ChampEcrit, corpsId: number | null): LigneJournal[] {
  return d.observations.map((o) => ({
    corpsId, champ: d.champ, valeur: d.valeur, unite: d.unite, role: 'retenue' as Role,
    confiance: d.confiance, reserve: d.reserve, motif: null,
    piece: o.provenance.pieceNom, page: o.provenance.page, extrait: o.texteBrut,
  }));
}

/** Une ligne 'ecartee' portant le MOTIF de non-écriture (aucune valeur, aucune provenance). */
function ligneEcartee(champ: string, corpsId: number | null, motif: string): LigneJournal {
  return { corpsId, champ, valeur: null, unite: null, role: 'ecartee', confiance: null, reserve: null, motif, piece: null, page: null, extrait: null };
}

/** N10-T — ligne 'ecartee' d'un champ écarté par PRÉCÉDENCE : on CONSERVE la valeur et la provenance lues (l'écart reste visible/cliquable). */
function lignePrecedence(d: ChampEcrit, corpsId: number | null, motif: string): LigneJournal {
  const o = d.observations[0];
  return { corpsId, champ: d.champ, valeur: d.valeur, unite: d.unite, role: 'ecartee', confiance: null, reserve: null, motif, piece: o?.provenance.pieceNom ?? null, page: o?.provenance.page ?? null, extrait: o?.texteBrut ?? null };
}

/** Candidats « niveau fini » → toujours 'candidat', corps_id=null, jamais promus en valeur. */
function lignesCandidats(cands: CandidatNiveauFiniJournal[]): LigneJournal[] {
  return cands.flatMap((c) => c.observations.map((o) => ({
    corpsId: null, champ: CHAMP_NIVEAU_FINI, valeur: c.valeur, unite: 'ngf' as const, role: 'candidat' as Role,
    confiance: null, reserve: null, motif: null, piece: o.provenance.pieceNom, page: o.provenance.page, extrait: o.texteBrut,
  })));
}

async function journaliser(dossierId: number, lignes: LigneJournal[]): Promise<void> {
  for (const l of lignes) {
    await query(
      `INSERT INTO permis_extraction_journal
         (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le)
       VALUES ($1, $2, $3, $4, $5, $6, 'motifs', $7, $8, $9, $10, $11, $12, now())`,
      [dossierId, l.corpsId, l.champ, l.valeur, l.unite, l.role, l.confiance, l.reserve, l.motif, l.piece, l.page, l.extrait],
    );
  }
}

/**
 * Applique la décision de TOUS les champs. `majPar` identifie l'auteur automatique.
 */
export async function ecrireChamps(dossierId: number, decision: DecisionChamps, majPar: string): Promise<ResultatEcritureChamps> {
  const { corps } = await lirePermisCaracteristiques(dossierId);
  // Recompute idempotent : on purge le journal AUTO du permis (jamais la saisie humaine, qui n'y figure pas).
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'motifs'`, [dossierId]);

  const champsCorps = decision.champs.filter((d) => d.portee === 'corps');
  const champsGlobal = decision.champs.filter((d) => d.portee === 'global'); // parking (non écrit)

  // ≥2 corps : on n'attribue à AUCUN. Tout est 'ecartee' (corps_id null) — un champ qui aurait pu être écrit prend le motif
  // d'ambiguïté, un champ non écrit garde son propre motif. Alerte via le statut.
  if (corps.length >= 2) {
    const lignes: LigneJournal[] = [];
    for (const d of champsCorps) lignes.push(ligneEcartee(d.champ, null, d.statut === 'ecrit' ? MOTIF_AMBIGU_CORPS : d.motif));
    for (const d of champsGlobal) if (d.statut === 'non_ecrit') lignes.push(ligneEcartee(d.champ, null, d.motif));
    lignes.push(...lignesCandidats(decision.candidatsNiveauFini));
    await journaliser(dossierId, lignes);
    return { statut: 'ambigu_plusieurs_corps', nbCorps: corps.length };
  }

  const aEcrire = champsCorps.filter((d): d is ChampEcrit => d.statut === 'ecrit');
  // On ne crée un corps que s'il y a quelque chose à écrire (pas de corps vide juste pour porter des motifs).
  const corpsCree = corps.length === 0 && aEcrire.length > 0;
  const corpsId = corps.length > 0 ? corps[0].id : (corpsCree ? await creerCorps(dossierId, null, majPar) : null);

  // N10-T — PRÉCÉDENCE : 'motifs' (cote isolée) est de rang LE PLUS FAIBLE. Un champ déjà détenu par une méthode supérieure
  //   (typiquement 'enonce', la table structurée des niveaux, écrite plus tôt) n'est PAS réécrit : la cote est écartée, journalisée
  //   avec le motif qui nomme la règle — ce qui rend enfin EFFECTIVE l'intention « la table prime sur les cotes isolées ».
  const owner = corpsId !== null ? await proprietairesRetenue(dossierId, corpsId, aEcrire.map((d) => d.champ)) : new Map<string, string | null>();
  const rejetePar = (champ: string): string | null => { const o = owner.get(champ); return o != null && !domine(METHODE, o) ? o : null; };

  let ecrits: string[] = [];
  let ignores: string[] = [];
  if (corpsId !== null && aEcrire.length > 0) {
    const valeurs: ValeursCorps = {};
    for (const d of aEcrire) if (!rejetePar(d.champ)) (valeurs as Record<string, number>)[d.cle] = d.valeur;
    const res = Object.keys(valeurs).length > 0 ? await ecrireCorps(corpsId, valeurs, 'extraite', majPar) : { ecrits: [], ignores: [] };
    ecrits = res.ecrits; ignores = res.ignores;
  }

  const lignes: LigneJournal[] = [];
  const champsEcartesPrecedence: string[] = [];
  for (const d of champsCorps) {
    if (d.statut === 'non_ecrit') { lignes.push(ligneEcartee(d.champ, corpsId, d.motif)); continue; }
    const o = rejetePar(d.champ);
    if (o) { lignes.push(lignePrecedence(d, corpsId, motifEcartePrecedence(METHODE, o))); champsEcartesPrecedence.push(d.champ); continue; } // écartée par précédence, valeur conservée (visible)
    if (ecrits.includes(d.cle)) lignes.push(...lignesRetenue(d, corpsId));
    else if (ignores.includes(d.cle)) lignes.push(ligneEcartee(d.champ, corpsId, MOTIF_SAISIE_PRIORITAIRE)); // la main l'emporte, le journal le dit
  }
  for (const d of champsGlobal) if (d.statut === 'non_ecrit') lignes.push(ligneEcartee(d.champ, null, d.motif));
  lignes.push(...lignesCandidats(decision.candidatsNiveauFini));
  await journaliser(dossierId, lignes);

  return { statut: 'traite', corpsId, corpsCree, champsEcrits: ecrits, champsIgnoresSaisie: ignores, champsEcartesPrecedence };
}
