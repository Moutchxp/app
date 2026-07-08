/**
 * Banc d'essai M5 · Lot 5 — Exécution ×2 (profil actif vs profil de test) + comparaison.
 *
 * GOLDEN-SAFE PAR CONSTRUCTION : réutilise le MÊME moteur (analyser PUR) que la prod ; la décorrélation se
 * fait UNIQUEMENT par le profil injecté. La GÉOMÉTRIE est construite UNE SEULE FOIS (construireEntree), puis
 * `analyser(entree, profil)` est rejoué ×N sur la MÊME entrée — aucun second round-trip DB (BE-50/BE-50bis).
 * LECTURE SEULE : construireEntree + chargerProfilDegagement ne font que des SELECT ; aucune écriture, aucune
 * persistance. Le comparatif est un différentiel de PRÉSENTATION : il n'altère jamais les scores.
 */
import { construireEntree, type ParametresAnalyse } from "./pipeline";
import { chargerProfilDegagement } from "./profilConfig";
import { analyser } from "../svv/analyse";
import { clonerProfil, diffProfils, type EcartsProfil } from "../svv/profilTest";
import type { ProfilDegagement } from "../svv/profilDegagement";
import type { ScoreTotal } from "../svv/scoreTotal";
import type { VentilationAnalyse } from "../svv/coucheDegagement";

/** Un run du banc : score client (total /100 + libellé + détail interne famille1/2) + ventilation par faisceau + verdict. */
export interface RunBanc {
  score: ScoreTotal; // total, libelle, scorePartiel, famille1/famille2 (détail interne — non sommés, BE-51a)
  ventilation: VentilationAnalyse; // seam Lot 1 (61 lignes + agrégat)
  verdict: string; // verdict géométrique (100 % découplé du score) — sert à l'assertion BE-56
}

/** Comparaison actif vs test. `ok=false` si le point est invalide (BE-55 : pas de comparatif partiel). */
export interface ComparaisonBanc {
  ok: boolean;
  statut: string;
  message?: string;
  actif?: RunBanc;
  test?: RunBanc;
  delta?: number; // test.total − actif.total (BE-52)
  verdictIdentique?: boolean; // BE-56 : le verdict DOIT être identique (100 % géométrique)
  ecarts?: EcartsProfil; // récap des écarts de variables actif → test (BE-53 ; diffProfils)
}

/**
 * Exécute le banc : construit l'entrée UNE fois, applique le profil ACTIF puis le profil de TEST, et renvoie
 * la comparaison. `profilTest` absent → clone du profil actif (source minimale tant que l'éditeur — Lot 2b —
 * n'existe pas) → délta nul (CA-5.2). Le profil actif = `params.profil` (tests golden) sinon config_scoring live.
 */
export async function comparerProfils(
  params: ParametresAnalyse,
  profilTest?: ProfilDegagement,
): Promise<ComparaisonBanc> {
  const { validation, entree } = await construireEntree(params);
  if (!entree) {
    const statut = validation.valide
      ? "INVALIDE"
      : Number.isFinite(validation.distanceAuBatimentM)
        ? "HORS_BATIMENT"
        : "SANS_BATIMENT";
    return { ok: false, statut, message: "Point invalide — impossible d'exécuter le test." };
  }

  const profilActif = params.profil ?? (await chargerProfilDegagement());
  const profilT = profilTest ?? clonerProfil(profilActif);

  // MÊME entrée, MÊME moteur pur, deux profils → aucune reconstruction de géométrie, aucun round-trip DB.
  const rActif = analyser(entree, profilActif, { ventilation: true });
  const rTest = analyser(entree, profilT, { ventilation: true });

  if (!rActif.ventilation || !rTest.ventilation) {
    return { ok: false, statut: "ERREUR", message: "Ventilation indisponible (seam)." };
  }

  return {
    ok: true,
    statut: "OK",
    actif: { score: rActif.score, ventilation: rActif.ventilation, verdict: rActif.verdict.verdict },
    test: { score: rTest.score, ventilation: rTest.ventilation, verdict: rTest.verdict.verdict },
    delta: rTest.score.total - rActif.score.total,
    verdictIdentique: rActif.verdict.verdict === rTest.verdict.verdict,
    ecarts: diffProfils(profilActif, profilT),
  };
}
