/**
 * PART-F ②③ — PRÉPARATION AUTOMATIQUE de la saisine CADA sur DOSSIER PARTIEL. Ferme le trou : la garde CASC-4 refuse de créer une
 * saisine tant que le butoir n'est pas atteint, mais RIEN ne la créait une fois qu'il l'était. Ici, pour chaque demande PARTIELLE
 * devenue saisissable (butoir CASC-2 atteint), on PRÉPARE la saisine en BROUILLON (creerSaisineCada, auteur 'auto') — SANS l'envoyer.
 *
 * 🔴 « ARNO EST PRÉVENU, IL DÉCIDE » : une saisine CADA est un recours contre une commune. Ce module ne fait que la PRÉPARER ; le
 * brouillon est SIGNALÉ par la pastille « Saisines CADA » existante (compterSaisines : file « à déposer » / « à envoyer ») et ne PART
 * JAMAIS seul — l'envoi reste gouverné par l'interrupteur `saisine_cada_auto_active` (défaut OFF) et son étape d'envoi dédiée.
 *
 * Gardes RÉUTILISÉES (aucune contournée) : creerSaisineCada revérifie TOUT (régime CASC-4 / butoir, refus acquis, forclusion, délai
 * annoncé, relève fraîche, dossiers dus) et refuse par SaisineCadaError → simplement IGNORÉ ici. IDEMPOTENT : une saisine vivante
 * existe déjà → refus « déjà en cours » → ignoré (jamais deux). Scope PARTIEL uniquement : le flux ordinaire (proposition X5 +
 * lancement manuel) est INCHANGÉ. Un échec inattendu sur une demande est ISOLÉ (compté) et n'arrête ni les autres ni la veille.
 */
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { lireSaisinesEligibles, creerSaisineCada, SaisineCadaError } from './saisineCadaRepo';
import { lireButoirsPartiel } from '../permis/dossierPartielRepo';

export interface DepsPreparationSaisinePartielle {
  candidats(): Promise<number[]>;                        // demandeIds PARTIELS saisissables (butoir atteint, aucune saisine vivante)
  preparer(demandeId: number): Promise<'preparee' | 'ignoree'>; // creerSaisineCada 'auto' ; 'ignoree' = refus métier (déjà en cours / non éligible)
}

export interface BilanPreparationSaisine { candidats: number; preparees: number; ignorees: number; erreurs: number }

/**
 * Une passe. Prépare (brouillon) la saisine de chaque demande partielle saisissable. Un refus métier (SaisineCadaError, identité,
 * dossiers) est IGNORÉ (pas une erreur : la demande n'est simplement pas prête). Un échec inattendu est ISOLÉ. AUCUN envoi.
 */
export async function executerPreparationSaisinePartielle(deps: DepsPreparationSaisinePartielle): Promise<BilanPreparationSaisine> {
  const ids = await deps.candidats();
  let preparees = 0, ignorees = 0, erreurs = 0;
  for (const id of ids) {
    try {
      if ((await deps.preparer(id)) === 'preparee') preparees += 1; else ignorees += 1;
    } catch { erreurs += 1; } // isolation : un échec inattendu n'arrête ni les suivantes ni la veille
  }
  return { candidats: ids.length, preparees, ignorees, erreurs };
}

// ── Implémentation RÉELLE (production) ─────────────────────────────────────────
export function depsReellesPreparationSaisinePartielle(): DepsPreparationSaisinePartielle {
  return {
    candidats: async () => {
      // Saisissables ∩ demandes en dossier partiel actif (butoir CASC-2 atteint) : le flux ordinaire reste hors de ce module.
      const [{ saisissables }, cfg] = await Promise.all([lireSaisinesEligibles(), chargerConfigVeille()]);
      const butoirs = await lireButoirsPartiel(cfg.cadaPartielDelaiMois, cfg.cadaPartielDelaiJours); // Map vide si 177 absente → aucun candidat
      return saisissables.filter((s) => butoirs.has(s.demandeId)).map((s) => s.demandeId);
    },
    preparer: async (demandeId) => {
      try {
        await creerSaisineCada(demandeId, 'auto'); // BROUILLON seulement ; aucune émission (garde saisine_cada_auto_active côté envoi)
        return 'preparee';
      } catch (e) {
        // Refus métier (état, butoir, forclusion, déjà en cours, identité, dossiers) → la demande n'est pas prête : IGNORÉ, jamais bloquant.
        if (e instanceof SaisineCadaError) return 'ignoree';
        if (e instanceof Error && (e.name === 'IdentiteIncompleteError' || e.name === 'AucunDossierNonSatisfaitError')) return 'ignoree';
        throw e; // toute AUTRE erreur remonte → isolée + comptée par l'orchestrateur
      }
    },
  };
}
