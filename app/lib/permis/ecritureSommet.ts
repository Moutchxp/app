/**
 * N5-C — DÉPÔT D'ÉCRITURE du sommet extrait. IMPUR (base) : consomme une `DecisionSommet` (calculée en amont, PURE) et
 * l'APPLIQUE — attribution à un corps, écriture de l'altitude, et JOURNAL de la décision. Ne re-décide RIEN.
 *
 * 🔒 RÈGLES ARBITRÉES (porteur, 15/08/2026) :
 * - ATTRIBUTION : 0 corps existant → en créer UN (repere=null) et y écrire · 1 corps → y écrire · ≥2 corps → n'attribuer à
 *   AUCUN (on ne devine pas lequel porte le point haut), journaliser l'ambiguïté et ALERTER (statut renvoyé).
 * - L'invariant « une saisie manuelle n'est jamais écrasée par l'automatique » est celui du dépôt existant (`ecrireCorps`,
 *   mode 'extraite') — RÉUTILISÉ tel quel, PAS réimplémenté. Si la valeur est ignorée (saisie présente), on ne réécrit rien et
 *   le JOURNAL le dit (ligne 'ecartee' avec corps_id renseigné).
 * - Toute valeur écrite est ACCOMPAGNÉE de son journal : la ligne 'retenue' ET les lignes 'candidat' qui l'expliquent. Une
 *   valeur écrite sans ligne de journal correspondante serait un défaut.
 * - Rien n'attend personne : aucune file, aucun statut « en attente de validation ». La confiance ('a_verifier'/'confirmee') est
 *   portée par la ligne, pas par une file.
 */
import { query } from '../db/client';
import { lirePermisCaracteristiques, creerCorps, ecrireCorps } from './caracteristiquesRepo';
import type { DecisionSommet, Observation } from './decisionSommet';

/** Résultat de l'écriture — sert aussi à ALERTER (statut 'ambigu_plusieurs_corps') sans rien bloquer. */
export type ResultatEcritureSommet =
  | { statut: 'ecrit'; corpsId: number; corpsCree: boolean; valeurNgf: number; ignoreSaisie: boolean }
  | { statut: 'ambigu_plusieurs_corps'; nbCorps: number }
  | { statut: 'aucun_sommet' };

type Role = 'retenue' | 'candidat' | 'ecartee';
interface LigneJournal {
  corpsId: number | null; champ: string; valeur: number; unite: 'ngf' | 'm';
  role: Role; confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null;
  piece: string; page: number; extrait: string;
}

const CHAMP_SOMMET = 'altitude_sommet_ngf';
const CHAMP_NIVEAU_FINI = 'niveau_fini';

/** Une ligne de journal par OBSERVATION du sommet (chaque pièce/page où la valeur apparaît). */
function lignesSommet(decision: DecisionSommet, corpsId: number | null, role: Role): LigneJournal[] {
  if (decision.valeurNgf === null) return [];
  return decision.observations.map((o: Observation) => ({
    corpsId, champ: CHAMP_SOMMET, valeur: decision.valeurNgf as number, unite: 'ngf',
    role, confiance: decision.confiance, reserve: decision.reserve,
    piece: o.provenance.pieceNom, page: o.provenance.page, extrait: o.texteBrut,
  }));
}

/** Candidats « niveau fini » → toujours role='candidat', corps_id=null, sans confiance/réserve (jamais promus en sommet). */
function lignesCandidatsNiveauFini(decision: DecisionSommet): LigneJournal[] {
  return decision.candidatsNiveauFini.flatMap((c) =>
    c.observations.map((o) => ({
      corpsId: null, champ: CHAMP_NIVEAU_FINI, valeur: c.valeur, unite: 'ngf' as const,
      role: 'candidat' as Role, confiance: null, reserve: null,
      piece: o.provenance.pieceNom, page: o.provenance.page, extrait: o.texteBrut,
    })),
  );
}

async function journaliser(dossierId: number, lignes: LigneJournal[]): Promise<void> {
  for (const l of lignes) {
    await query(
      `INSERT INTO permis_extraction_journal
         (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, piece, page, extrait, extrait_le)
       VALUES ($1, $2, $3, $4, $5, $6, 'motifs', $7, $8, $9, $10, $11, now())`,
      [dossierId, l.corpsId, l.champ, l.valeur, l.unite, l.role, l.confiance, l.reserve, l.piece, l.page, l.extrait],
    );
  }
}

/**
 * Applique la décision : attribution + écriture (invariant réutilisé) + journal. `majPar` identifie l'auteur automatique.
 */
export async function ecrireSommet(dossierId: number, decision: DecisionSommet, majPar: string): Promise<ResultatEcritureSommet> {
  // Pas de sommet mesuré → rien à écrire, mais on journalise quand même les candidats « niveau fini » vus.
  if (decision.valeurNgf === null) {
    await journaliser(dossierId, lignesCandidatsNiveauFini(decision));
    return { statut: 'aucun_sommet' };
  }

  const { corps } = await lirePermisCaracteristiques(dossierId);

  // ≥2 corps : on n'attribue à AUCUN (on ne devine pas). Journal en 'ecartee' (corps_id null) + candidats. Alerte via le statut.
  if (corps.length >= 2) {
    await journaliser(dossierId, [...lignesSommet(decision, null, 'ecartee'), ...lignesCandidatsNiveauFini(decision)]);
    return { statut: 'ambigu_plusieurs_corps', nbCorps: corps.length };
  }

  // 0 corps → en créer UN (repere=null) ; 1 corps → celui-là.
  const corpsCree = corps.length === 0;
  const corpsId = corpsCree ? await creerCorps(dossierId, null, majPar) : corps[0].id;

  // Écriture via le dépôt existant : mode 'extraite' → l'invariant « saisie non écrasée » s'applique tel quel.
  const res = await ecrireCorps(corpsId, { altitudeSommetNgf: decision.valeurNgf }, 'extraite', majPar);
  const ignoreSaisie = res.ignores.includes('altitudeSommetNgf');

  // Écrit → 'retenue' ; ignoré car une saisie occupe le champ → 'ecartee' (corps_id renseigné : le journal DIT pourquoi).
  const role: Role = ignoreSaisie ? 'ecartee' : 'retenue';
  await journaliser(dossierId, [...lignesSommet(decision, corpsId, role), ...lignesCandidatsNiveauFini(decision)]);

  return { statut: 'ecrit', corpsId, corpsCree, valeurNgf: decision.valeurNgf, ignoreSaisie };
}
