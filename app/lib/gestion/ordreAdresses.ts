/**
 * ══ 🔴🔴 L'ORDRE DES ADRESSES D'UNE COPROPRIÉTÉ (Arno, 26/11/2026, 13h30). MODULE PUR — LA SEULE FONCTION DE TRI des adresses de la fiche Copropriété. ══
 *
 * « Lorsqu'il y a plusieurs adresses pour une même copropriété, elles doivent être classées par rue s'il y a plusieurs rues différentes, puis, dans chaque
 * rue, par numéro croissant. » La rue : ordre alphabétique du libellé complet de la voie, sans tenir compte des majuscules ni des accents. Le numéro : en
 * NOMBRE (2 avant 10) ; l'indice suit son numéro (18, 18 bis, 18 ter, 20) ; « 12-28 » est classé à 12 ; une adresse sans numéro va en fin de sa rue.
 * Partagée par la liste ADRESSES, les blocs DIGICODES et les adresses proposées : jamais de copie. L'adresse principale n'est pas triée ici (elle reste
 * en tête, à part). ⚠️ AUCUN IMPORT QUI TIRE `pg` (l'écran l'importe).
 */

const RANG_INDICE: Record<string, number> = { '': 0, b: 1, bis: 1, t: 2, ter: 2, q: 3, qua: 3, quater: 3, quinquies: 4 };

const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Le numéro, son indice et la voie d'une adresse (« 18 bis rue Baudin, 92400 Courbevoie » → 18, 1, « rue baudin »). PUR. */
export function partiesAdresse(libelle: string | null | undefined): { numero: number | null; indice: number; voie: string } {
  const ligne = sansAccents((libelle ?? '').split(',')[0]).replace(/\s+/g, ' ').trim();
  const m = /^(\d+)(?:\s*[-–/]\s*\d+)?\s*(bis|ter|quater|quinquies|qua|b|t|q)?(?![a-z])\s*(.*)$/.exec(ligne);
  if (m === null) return { numero: null, indice: 0, voie: ligne };
  return { numero: Number(m[1]), indice: RANG_INDICE[m[2] ?? ''] ?? 5, voie: m[3].trim() };
}

/** Compare deux adresses : la rue, puis le numéro (sans numéro : en fin de rue), puis l'indice. PUR. */
export function comparerAdresses(a: string | null | undefined, b: string | null | undefined): number {
  const x = partiesAdresse(a); const y = partiesAdresse(b);
  const rue = x.voie.localeCompare(y.voie, 'fr', { sensitivity: 'base' });
  if (rue !== 0) return rue;
  if (x.numero !== y.numero) return x.numero === null ? 1 : y.numero === null ? -1 : x.numero - y.numero;
  return x.indice - y.indice;
}

/** Une copie de la liste, triée selon `comparerAdresses` (tri stable : deux adresses égales gardent leur ordre). PUR. */
export function trierAdresses<T>(liste: readonly T[], libelle: (x: T) => string | null | undefined): T[] {
  return [...liste].sort((p, q) => comparerAdresses(libelle(p), libelle(q)));
}
