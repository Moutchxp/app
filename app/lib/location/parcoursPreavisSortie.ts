import { dateFrPreavis } from './preavis';
import { issueSortie, type BailLogement } from './sortieLocataires';

/**
 * ══ 🔴 Arno (06/11/2026) — LE PARCOURS « PRÉAVIS / SORTIE » : CE QUE LE RÉCAPITULATIF DIT DU LOGEMENT. PUR. ══════════════════════════════════════
 * Rappel (règle d'Arno) : le logement ne devient libre qu'à la SORTIE effective, jamais au préavis.
 *   · préavis : tous les locataires du logement en préavis (ceux choisis + ceux qui l'étaient déjà) → « … deviendra vacant le JJ/MM/AAAA (à la
 *     sortie effective) », la date la plus tardive ; sinon « Le logement restera occupé par : … » (ceux qui ne sont pas en préavis) ;
 *   · sortie : « Le logement devient vacant » ou « Le logement reste occupé par : … » (la règle de la sortie, `issueSortie`).
 */
export function sortDuLogementPreavis(bail: Pick<BailLogement, 'locataires' | 'autresOccupants'>, dejaEnPreavis: ReadonlyMap<number, string>,
  choisis: readonly number[], dateMaxNouvelle: string): { vacant: boolean; phrase: string } {
  const s = new Set(choisis);
  const restants = [...bail.locataires.filter((l) => !s.has(l.occupationId) && !dejaEnPreavis.has(l.occupationId)).map((l) => l.nom), ...bail.autresOccupants];
  if (restants.length > 0) return { vacant: false, phrase: `Le logement restera occupé par : ${restants.join(', ')}.` };
  const dates = [dateMaxNouvelle, ...bail.locataires.filter((l) => !s.has(l.occupationId)).map((l) => dejaEnPreavis.get(l.occupationId)).filter((d): d is string => d !== undefined)];
  const fin = dates.sort().at(-1) ?? dateMaxNouvelle;
  return { vacant: true, phrase: `Tous les locataires du logement sont en préavis : le logement deviendra vacant le ${dateFrPreavis(fin)} (à la sortie effective).` };
}

export function sortDuLogementSortie(bail: Pick<BailLogement, 'locataires' | 'autresOccupants'>, sortants: readonly number[]): { vacant: boolean; phrase: string } {
  const i = issueSortie(bail, sortants);
  return i.vacant ? { vacant: true, phrase: 'Le logement devient vacant.' } : { vacant: false, phrase: `Le logement reste occupé par : ${i.restants.join(', ')}.` };
}

export const AUCUN_MAIL_ENVOYE = 'Aucun mail n’a été envoyé.';
export const AUCUN_MAIL_PREVU = 'Aucun mail ne sera envoyé.';
