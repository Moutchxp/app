/**
 * LOT 34 — PLANIFICATEUR de la relève DÉCLENCHÉE par le clic « copier » d'un dépôt téléservice. PUR par injection (setTimeout,
 * délai, callbacks fournis) → testable sans DOM ni horloge réelle, et séparé du rendu.
 *
 * RÈGLE : un clic programme UNE relève après `delaiMs()`. **Déduplication** : tant qu'une relève est déjà programmée (en attente),
 * un nouveau clic est un NO-OP → deux clics rapprochés ne produisent qu'UNE seule relève. À l'échéance, le créneau se libère (un clic
 * ultérieur peut reprogrammer). `annuler()` (démontage) évite une relève fantôme après que l'écran a disparu.
 */
export interface PlanificateurReleve {
  demander(): void;    // programme la relève (dédup : no-op si déjà en attente)
  annuler(): void;     // annule la relève en attente (au démontage)
  enAttente(): boolean;
}

export interface IoPlanificateurReleve {
  delaiMs(): number;                                // délai courant (lu au clic → suit la config, jamais figé)
  programmer(cb: () => void, ms: number): unknown;  // setTimeout injectable
  annuler(handle: unknown): void;                   // clearTimeout injectable
  avantAttente(): void;                             // « la boîte sera relevée dans un instant » (feedback écran)
  executer(): void;                                 // à l'échéance : lance la relève (POST /relever-depot)
}

export function creerPlanificateurReleve(io: IoPlanificateurReleve): PlanificateurReleve {
  let handle: unknown = null;
  return {
    demander() {
      if (handle !== null) return; // DÉDUP : une relève est déjà programmée → on ne la double pas
      io.avantAttente();
      handle = io.programmer(() => { handle = null; io.executer(); }, io.delaiMs());
    },
    annuler() {
      if (handle === null) return;
      io.annuler(handle);
      handle = null;
    },
    enAttente() { return handle !== null; },
  };
}
