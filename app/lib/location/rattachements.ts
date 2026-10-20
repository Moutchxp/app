import { estGarant } from './cartesLocation';

/**
 * ══ 🔴🔴 GARANTS ET CONTACTS RATTACHÉS AUX LOCATAIRES (Arno, 20/10/2026, migration 393). PUR. ═══════════════════════════
 *
 * « Le garant est rattaché au BAIL et aux locataires qu'il garantit ; le contact du locataire est rattaché au LOCATAIRE. »
 * Dans « Nouveau locataire », les locataires et les contacts sont désignés par leur RANG à l'écran (les fiches n'existent
 * pas encore) : `garantit` = les rangs des locataires garantis, `locataire` = le rang du locataire dont c'est le contact.
 * · un seul locataire : tout lui est rattaché, d'office (rien à demander) ;
 * · plusieurs : « Garantit : » (tous cochés par défaut) pour un garant, « Contact de : » pour un autre contact ;
 * · rien de reçu (un écran d'avant) : un seul locataire → d'office ; plusieurs → rien n'est rattaché, la carte reste
 *   visible côté bien avec « à rattacher à un locataire » (jamais deviné).
 */
export interface RattachementSaisi { garantit?: number[]; locataire?: number | null }
export interface RattachementContact { garant: boolean; garantit: number[]; locataire: number | null }

/** Les rattachements vérifiés, un par contact (même ordre). Refus si un rang désigne un locataire qui n'existe pas. */
export function verifierRattachements(brut: unknown, contacts: readonly { qualite?: string | null }[], nbLocataires: number):
  { ok: true; valeurs: RattachementContact[] } | { ok: false; motif: string } {
  const liste = Array.isArray(brut) ? brut : null;
  const tous = Array.from({ length: nbLocataires }, (_, i) => i);
  const valeurs: RattachementContact[] = [];
  for (const [i, c] of contacts.entries()) {
    const garant = estGarant(c.qualite);
    const r = (liste?.[i] ?? null) as RattachementSaisi | null;
    const rang = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < nbLocataires ? x : null);
    if (nbLocataires === 1) { valeurs.push({ garant, garantit: garant ? [0] : [], locataire: garant ? null : 0 }); continue; }
    if (garant) {
      const brutG = r !== null && Array.isArray(r.garantit) ? r.garantit : null;
      if (brutG === null) { valeurs.push({ garant, garantit: liste === null ? [] : tous, locataire: null }); continue; }
      const rangs = brutG.map(rang);
      if (rangs.some((x) => x === null)) return { ok: false, motif: `Contact ${i + 1} : « Garantit » désigne un locataire inconnu.` };
      const garantit = [...new Set(rangs as number[])].sort((a, b) => a - b);
      if (garantit.length === 0) return { ok: false, motif: `Contact ${i + 1} : cochez au moins un locataire garanti.` };
      valeurs.push({ garant, garantit, locataire: null });
    } else {
      const l = r === null || r.locataire === undefined || r.locataire === null ? null : rang(r.locataire);
      if (r !== null && r.locataire !== undefined && r.locataire !== null && l === null) return { ok: false, motif: `Contact ${i + 1} : « Contact de » désigne un locataire inconnu.` };
      valeurs.push({ garant, garantit: [], locataire: l });
    }
  }
  return { ok: true, valeurs };
}

/** Le mot d'un rattachement, pour la fiche du bien et du locataire. */
export function motRattachement(r: { garant: boolean; locataires: string[] }): string {
  if (r.locataires.length === 0) return 'à rattacher à un locataire';
  return r.garant ? `garantit ${r.locataires.join(', ')}` : `contact de ${r.locataires.join(', ')}`;
}

/** Une carte de contact côté locataire, avec ce à quoi elle est rattachée. */
export interface ContactRattache {
  carteId: number; nom: string; qualite: string | null; garant: boolean;
  /** Les locataires garantis (garant) ou le locataire dont c'est le contact ; vide = « à rattacher à un locataire ». */
  locataires: { id: number; nom: string }[];
  /** Les baux des garanties (garant). */
  bailIds: number[];
  mot: string;
}


/**
 * ══ LA REPRISE DES CARTES EXISTANTES (Arno, 20/10/2026, point 4). PUR. ══════════════════════════════════════════════════
 * Une carte côté locataire sans rattachement : proposée SEULEMENT si son bien a exactement UN bail en cours, avec UN seul
 * locataire en place. Tout le reste (colocation, plusieurs baux, bien libre, carte sans bien) est « à rattacher à la main ».
 */
export type MotifMain = 'sans_bien' | 'bien_libre' | 'plusieurs_baux' | 'colocation';
export const LIBELLE_MOTIF_MAIN: Record<MotifMain, string> = {
  sans_bien: 'carte sans bien', bien_libre: 'bien libre (aucun bail en cours)', plusieurs_baux: 'plusieurs baux en cours', colocation: 'colocation',
};
export type ClasseReprise =
  | { sorte: 'proposee'; bailId: number; locataireId: number; garant: boolean }
  | { sorte: 'main'; motif: MotifMain };

export function classerReprise(carte: { lotId: number | null; qualite: string | null },
  bauxEnCours: readonly { bailId: number; locataires: readonly number[] }[]): ClasseReprise {
  if (carte.lotId === null) return { sorte: 'main', motif: 'sans_bien' };
  if (bauxEnCours.length === 0) return { sorte: 'main', motif: 'bien_libre' };
  if (bauxEnCours.length > 1) return { sorte: 'main', motif: 'plusieurs_baux' };
  const b = bauxEnCours[0];
  const locs = [...new Set(b.locataires)];
  if (locs.length !== 1) return { sorte: 'main', motif: locs.length === 0 ? 'bien_libre' : 'colocation' };
  return { sorte: 'proposee', bailId: b.bailId, locataireId: locs[0], garant: estGarant(carte.qualite) };
}
