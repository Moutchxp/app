/**
 * CR-3 — INSTRUCTION des valeurs de la part GÉNÉRÉE par le téléservice dans les champs de caractéristiques ENCORE VIDES. Réutilise les
 * VERROUS existants : la décision PURE `decisionInstruireTeleservice` (mirroir de LOT 70), l'écriture par `ecrireCorps`/`ecrireDestinations`
 * (mode 'extraite' → garde 'saisie' du dépôt), et le journal 'teleservice'. AUCUN 5e chemin d'écriture. AUCUN DELETE (journal ADDITIF +
 * idempotent par `WHERE NOT EXISTS`). RÉSILIENT : si la migration 215 n'est pas appliquée (méthode 'teleservice' hors CHECK), l'apply est
 * un NO-OP propre (repli type `to_regclass`), jamais un crash.
 */
import { query } from '../db/client';
import { lirePermisCaracteristiques, ecrireCorps, ecrireDestinations } from './caracteristiquesRepo';
import { lireDeclarationsRecap } from './cerfaRecapRepo';
import { proprietairesRetenue } from './journalLecture';
import { origineDepuisMajPar, suffixeOrigine } from './journalExtraction';
import { scinderDescription, divergenceNiveauxHorsSol } from './descriptionScission';
import { decisionInstruireTeleservice, type DecisionTeleservice, type EtatCible } from './decisionTeleservice';

export interface RapportDossierTeleservice {
  dossierId: number;
  decisions: DecisionTeleservice[];
  ecrites: number;
  migrationAbsente: boolean; // true si --appliquer demandé mais méthode 'teleservice' hors CHECK (215 non appliquée) → no-op
}

/** La méthode 'teleservice' est-elle autorisée par le CHECK du journal (migration 215 appliquée) ? Résilient (repli `to_regclass`). */
async function methodeTeleserviceAutorisee(): Promise<boolean> {
  try {
    const { rows } = await query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = to_regclass('permis_extraction_journal') AND conname = 'permis_journal_methode_chk'`);
    return rows.some((r) => r.def.includes("'teleservice'"));
  } catch { return false; }
}

/** Journalise une décision (retenue/ecartee) méthode 'teleservice'. ADDITIF + IDEMPOTENT : une seule ligne par (dossier, corps, champ, role). */
async function journaliser(dossierId: number, corpsId: number | null, champ: string, role: 'retenue' | 'ecartee', valeur: number | null, motif: string | null, extrait: string | null, majPar: string): Promise<void> {
  const origine = origineDepuisMajPar(majPar); // LOT 100
  const params = [dossierId, corpsId, champ, valeur, role, motif, extrait]; // $1..$7
  const og = await suffixeOrigine(params.length, origine); // $8 (colonne origine, LOT 100) — no-op si 196 absente
  await query(
    `INSERT INTO permis_extraction_journal
       (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le${og.cols})
     SELECT $1, $2, $3, $4, NULL, $5, 'teleservice', CASE WHEN $5 = 'retenue' THEN 'a_verifier' ELSE NULL END, NULL, $6, NULL, NULL, $7, now()${og.vals}
      WHERE NOT EXISTS (
        SELECT 1 FROM permis_extraction_journal
         WHERE dossier_id = $1 AND corps_id IS NOT DISTINCT FROM $2 AND champ = $3 AND methode = 'teleservice' AND role = $5)`,
    [...params, ...og.params]);
}

/**
 * Instruit UN dossier. `appliquer=false` (défaut) → calcule et renvoie les décisions SANS écrire. `appliquer=true` → écrit les champs
 * VIDES + journalise (si la migration 215 est appliquée ; sinon no-op + `migrationAbsente`). La scission est RECOMPOSÉE du texte source
 * (`scinderDescription`) — robuste aux instantanés antérieurs à CR-1b.
 */
export async function instruireTeleservice(dossierId: number, opts: { appliquer: boolean; majPar: string }): Promise<RapportDossierTeleservice> {
  const { appliquer, majPar } = opts;
  const dc = await lireDeclarationsRecap(dossierId);
  const scission = scinderDescription(dc?.declarations.descriptionProjet ?? null);
  const valeurs = scission.valeurs;
  if (!valeurs) return { dossierId, decisions: [], ecrites: 0, migrationAbsente: false };

  const carac = await lirePermisCaracteristiques(dossierId);
  const nbCorps = carac.corps.length;
  const divergenceEtages = divergenceNiveauxHorsSol(scission) != null;

  const propPermis = await proprietairesRetenue(dossierId, null, ['destinations']);
  const etatDestinations: EtatCible = { valeur: carac.global?.destinations ?? null, origine: carac.global?.destinationsOrigine ?? null, proprietaire: propPermis.get('destinations') ?? null };

  let etatEtages: EtatCible = { valeur: null, origine: null, proprietaire: null };
  let etatSousSol: EtatCible = { valeur: null, origine: null, proprietaire: null };
  let corpsId: number | null = null;
  if (nbCorps === 1) {
    const c = carac.corps[0];
    corpsId = c.id;
    const prop = await proprietairesRetenue(dossierId, c.id, ['nb_etages', 'nb_niveaux_sous_sol']);
    etatEtages = { valeur: c.nbEtages, origine: c.nbEtagesOrigine, proprietaire: prop.get('nb_etages') ?? null };
    etatSousSol = { valeur: c.nbNiveauxSousSol, origine: c.nbNiveauxSousSolOrigine, proprietaire: prop.get('nb_niveaux_sous_sol') ?? null };
  }

  const decisions = decisionInstruireTeleservice({ valeurs, divergenceEtages, nbCorps, etatEtages, etatSousSol, etatDestinations });

  if (!appliquer) return { dossierId, decisions, ecrites: 0, migrationAbsente: false };
  if (!(await methodeTeleserviceAutorisee())) return { dossierId, decisions, ecrites: 0, migrationAbsente: true };

  // IDEMPOTENCE (CR-4) : un champ qui porte DÉJÀ la valeur candidate n'est pas réécrit — une seconde passe est un VRAI no-op (aucune
  //   réécriture de colonne, aucune ligne de journal ajoutée, le journal étant par ailleurs append-only WHERE NOT EXISTS). decisionTeleservice
  //   reste inchangée (elle autorise la ré-écriture idempotente) ; c'est ICI, au moment d'écrire, qu'on saute la redondance stricte.
  const memeArray = (a: string[] | number | null, b: readonly string[]): boolean => Array.isArray(a) && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  let ecrites = 0;
  for (const d of decisions) {
    if (d.action === 'ecrire') {
      if (d.champ === 'nb_etages' && corpsId != null && d.valeurNombre != null) {
        if (etatEtages.valeur === d.valeurNombre) continue; // déjà à cette valeur → no-op
        await ecrireCorps(corpsId, { nbEtages: d.valeurNombre }, 'extraite', majPar);
        await journaliser(dossierId, corpsId, 'nb_etages', 'retenue', d.valeurNombre, null, d.candidat, majPar);
        ecrites++;
      } else if (d.champ === 'nb_niveaux_sous_sol' && corpsId != null && d.valeurNombre != null) {
        if (etatSousSol.valeur === d.valeurNombre) continue; // déjà à cette valeur → no-op
        await ecrireCorps(corpsId, { nbNiveauxSousSol: d.valeurNombre }, 'extraite', majPar);
        await journaliser(dossierId, corpsId, 'nb_niveaux_sous_sol', 'retenue', d.valeurNombre, null, d.candidat, majPar);
        ecrites++;
      } else if (d.champ === 'destinations' && d.valeurTexte) {
        if (memeArray(etatDestinations.valeur, d.valeurTexte)) continue; // déjà à cette valeur → no-op
        await ecrireDestinations(dossierId, d.valeurTexte, 'extraite', majPar);
        await journaliser(dossierId, null, 'destinations', 'retenue', null, null, d.valeurTexte.join(', '), majPar);
        ecrites++;
      }
    } else {
      await journaliser(dossierId, d.niveau === 'corps' ? corpsId : null, d.champ, 'ecartee', null, d.motif ?? null, d.candidat, majPar);
    }
  }
  return { dossierId, decisions, ecrites, migrationAbsente: false };
}
