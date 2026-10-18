/**
 * ══ 🔴🔴 TUILE LOCATION — « ENTRETIEN À PRÉVOIR » D'UN BIEN (Arno, 18/10/2026). PUR. ═════════════════════════════════════
 *
 * « Oui / Non. Si Oui : Chaudière (case) + date anniversaire d'entretien (facultative) ; Ramonage (case) + date (facultative) ;
 * “+ Autre entretien” : nom libre + date (facultative), autant que nécessaire, chacun supprimable. Repasser à Non vide le
 * tout. Dates exploitables pour de futures relances. » (Arno) — Une chaudière / un ramonage au plus ; un « autre » a un nom.
 */

export type SorteEntretien = 'chaudiere' | 'ramonage' | 'autre';
export interface Entretien { sorte: SorteEntretien; nom: string | null; dateAnniversaire: string | null }

export const LIBELLE_ENTRETIEN: Record<Exclude<SorteEntretien, 'autre'>, string> = { chaudiere: 'Chaudière', ramonage: 'Ramonage' };

function dateValide(t: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m === null) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) && Number(m[1]) >= 1900;
}

const ouiNon = (v: unknown): boolean | null => (v === true || v === 'oui' ? true : v === false || v === 'non' ? false : null);

/** Vérifie la saisie : « Non » (ou rien) ⇒ aucune ligne ; « Oui » ⇒ les entretiens, chacun valide. PUR. */
export function verifierEntretiens(aPrevoir: unknown, brut: unknown):
  { ok: true; aPrevoir: boolean | null; entretiens: Entretien[] } | { ok: false; motif: string } {
  const oui = ouiNon(aPrevoir);
  if (oui !== true) return { ok: true, aPrevoir: oui, entretiens: [] };
  const liste = Array.isArray(brut) ? brut.slice(0, 30) : [];
  const entretiens: Entretien[] = [];
  for (const [i, e] of liste.entries()) {
    const x = (e ?? {}) as Record<string, unknown>;
    const sorte = x.sorte === 'chaudiere' || x.sorte === 'ramonage' || x.sorte === 'autre' ? x.sorte : null;
    if (sorte === null) return { ok: false, motif: `Entretien ${i + 1} : nature inconnue.` };
    const nom = typeof x.nom === 'string' && x.nom.trim() !== '' ? x.nom.trim().slice(0, 120) : null;
    if (sorte === 'autre' && nom === null) return { ok: false, motif: `Entretien ${i + 1} : donnez-lui un nom (ex. Climatisation, VMC).` };
    const date = typeof x.dateAnniversaire === 'string' && x.dateAnniversaire.trim() !== '' ? x.dateAnniversaire.trim() : null;
    if (date !== null && !dateValide(date)) return { ok: false, motif: `Entretien ${i + 1} : la date anniversaire n’est pas une date valide.` };
    if (sorte !== 'autre' && entretiens.some((y) => y.sorte === sorte)) continue;
    entretiens.push({ sorte, nom: sorte === 'autre' ? nom : null, dateAnniversaire: date });
  }
  return { ok: true, aPrevoir: true, entretiens };
}

/** Le libellé d'un entretien : « Chaudière », « Ramonage », ou son nom. PUR. */
export function libelleEntretien(e: Pick<Entretien, 'sorte' | 'nom'>): string {
  return e.sorte === 'autre' ? (e.nom ?? 'Autre entretien') : LIBELLE_ENTRETIEN[e.sorte];
}

/** La clé d'égalité de deux entretiens (pour ne retirer / ajouter que ce qui a changé). PUR. */
export function cleEntretien(e: Entretien): string {
  return `${e.sorte}|${(e.nom ?? '').trim().toLowerCase()}|${e.dateAnniversaire ?? ''}`;
}
