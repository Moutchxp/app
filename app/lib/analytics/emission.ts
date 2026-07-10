import 'server-only';
import { after } from 'next/server';
import { incrementerCompteur, type EvenementCompteur } from './writer';

/**
 * M2 — Analytics, LOT 1. Primitive d'ÉMISSION post-réponse. Fournie pour le LOT 2 (instrumentation du
 * tunnel) ; le LOT 1 n'émet AUCUN événement — ce module n'est appelé nulle part encore.
 *
 * GARANTIES (constats R1/R2 de la revue M2) :
 *  1. NON BLOQUANT : l'écriture est différée APRÈS la réponse via `after()` de Next 16. La réponse au
 *     tunnel part avant toute écriture analytique.
 *  2. THROW SYNCHRONE MAÎTRISÉ : le payload est construit À L'INTÉRIEUR du callback `after`, dans un
 *     `try/catch`. Un `void fn().catch()` n'intercepterait PAS un throw dans l'évaluation des arguments
 *     (→ 500 sur une certification réussie) : ici, `construire()` ne s'exécute jamais avant `after`.
 *  3. `after()` INDISPONIBLE : s'il est appelé hors contexte de requête (il throw alors), on avale.
 *  4. ÉCRITURE FAILLIBLE : `incrementerCompteur` ne throw jamais (voir `writer.ts`).
 *
 * Résultat : `emettreApresReponse` NE PEUT JAMAIS ni throw vers l'appelant, ni bloquer la réponse.
 *
 * ⚠️ Ne DOIT jamais être importé par le moteur (`app/lib/svv/**`, `pipeline.ts`).
 */
export function emettreApresReponse(construire: () => EvenementCompteur | null): void {
  try {
    after(async () => {
      let ev: EvenementCompteur | null;
      try {
        // Construction DANS le callback → un throw synchrone ici ne remonte jamais à la route.
        ev = construire();
      } catch (e) {
        console.error('[analytics] construction du payload abandonnée', e);
        return;
      }
      if (ev) await incrementerCompteur(ev); // ne throw jamais
    });
  } catch (e) {
    // `after` hors contexte de requête (tests, appel hors route) → on avale, jamais bloquer l'appelant.
    console.error('[analytics] after() indisponible — événement abandonné', e);
  }
}
