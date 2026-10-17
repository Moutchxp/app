/**
 * ══ 🔴🔴 LOT L0 (étude Location, 17/10/2026) — UNE FICHE CRÉÉE DANS L'APPLICATION, RETROUVÉE DANS L'EXPORT ═════════
 *
 * Module PUR : il décide, pour une personne de l'export WIPPIMMO qui n'existe pas encore sous sa clé d'import, si
 * elle est une fiche créée à la main ici (« app-… ») — auquel cas l'import la RAPPROCHE au lieu de créer un doublon.
 *
 * 🔴 LA RÈGLE EST STRICTE, PARCE QU'UN MAUVAIS RAPPROCHEMENT EST PIRE QU'UN DOUBLON. Un doublon se voit et se
 * corrige ; une fiche rattachée à la mauvaise personne envoie le courrier d'un client chez un autre. On ne rapproche
 * donc que si TOUT concorde :
 *   · le MÊME nom normalisé (celui que l'import et la saisie calculent avec la même fonction),
 *   · ET au moins UNE coordonnée commune (téléphone en E.164 ou e-mail en minuscules — formes canoniques des deux
 *     côtés),
 *   · ET UNE SEULE fiche de l'application dans ce cas.
 * Plusieurs candidates → « ambigu » ; même nom sans coordonnée commune → « possible ». Dans ces deux cas l'import
 * crée la fiche comme avant ET le dit dans son rapport : la décision revient à un humain.
 */

export interface CandidateRapprochement {
  id: string;
  nomNormalise: string;
  /** Ses coordonnées vivantes, en forme canonique. */
  valeurs: readonly string[];
}

export type ChoixRapprochement =
  | { etat: 'unique'; id: string }
  | { etat: 'ambigu'; ids: string[] }
  | { etat: 'possible'; ids: string[] }
  | { etat: 'aucun' };

export function choisirFicheARapprocher(
  candidates: readonly CandidateRapprochement[],
  entrant: { nomNormalise: string; valeurs: readonly string[] },
): ChoixRapprochement {
  const nom = entrant.nomNormalise.trim();
  if (nom === '') return { etat: 'aucun' };
  const memeNom = candidates.filter((c) => c.nomNormalise.trim() === nom);
  if (memeNom.length === 0) return { etat: 'aucun' };
  const voulues = new Set(entrant.valeurs.map((v) => v.trim()).filter((v) => v !== ''));
  const fortes = memeNom.filter((c) => c.valeurs.some((v) => voulues.has(v.trim())));
  if (fortes.length === 1) return { etat: 'unique', id: fortes[0].id };
  if (fortes.length > 1) return { etat: 'ambigu', ids: fortes.map((c) => c.id) };
  return { etat: 'possible', ids: memeNom.map((c) => c.id) };
}

/** La phrase du rapport quand l'import n'a PAS osé rapprocher. Écrite une seule fois. */
export function phraseRapprochementNonFait(
  qui: string, choix: Extract<ChoixRapprochement, { etat: 'ambigu' | 'possible' }>,
): string {
  return choix.etat === 'ambigu'
    ? `${qui} — plusieurs fiches créées dans l’application lui ressemblent (fiches ${choix.ids.join(', ')}) : `
      + 'fiche créée depuis l’export, rapprochement à décider à la main.'
    : `${qui} — même nom qu’une fiche créée dans l’application (fiche ${choix.ids.join(', ')}) mais aucune `
      + 'coordonnée commune : fiche créée depuis l’export, rapprochement à vérifier à la main.';
}

/** Une clé de fiche créée dans l'application. La SEULE écriture de ce test, partout. */
export const estCleApplication = (cle: string | null | undefined): boolean =>
  typeof cle === 'string' && cle.startsWith('app-');
