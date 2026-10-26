/**
 * ══ 🔴🔴 LOT PARTENAIRE-INTERNE-JAMAIS-UNE-CLE (Arno, 26/10/2026) — POURQUOI CE BIEN EST COCHÉ DANS LE COMPOSEUR. PUR ══════
 *
 * La fenêtre « Bien(s) rattaché(s) à ce mail » du composeur écrit, à côté de chaque bien coché qui n'est pas une
 * proposition du moteur, la RAISON de sa présence. Elle disait « déjà rattaché — décochez pour le retirer » pour tout bien
 * déjà dans le brouillon, quelle que soit son origine : un bien venu de la FICHE où l'on écrit se lisait comme un bien venu
 * de l'adresse du destinataire (constat d'Arno sur « Service Gestion », ADHOC).
 *
 * RÈGLE (R3) : un brouillon ouvert depuis une fiche bien GARDE ce bien (c'est voulu), et le dit — « rattaché car écrit
 * depuis la fiche du bien » —, quel que soit le destinataire : changer d'adresse ne fait pas croire que le bien en vient.
 * Les autres mentions sont celles d'avant, au mot près, dans le même ordre.
 */
export const MOTIF_DEPUIS_LA_FICHE = 'rattaché car écrit depuis la fiche du bien';
export const MOTIF_DEJA_RATTACHE = 'déjà rattaché — décochez pour le retirer';
export const MOTIF_AJOUT_MANUEL_SANS_CLIENT = 'ajouté manuellement — aucun client de ce bien dans les destinataires';
export const MOTIF_AJOUT_RECHERCHE = 'ajouté à la main depuis la recherche';

export function motifBienCoche(o: {
  cle: string;
  /** D'où vient la ligne : un bien d'une adresse en attente, un ajout depuis la recherche, ou un bien déjà dans le brouillon. */
  origine: 'attente' | 'recherche' | 'deja';
  /** Le motif d'une ligne « attente » (celui de l'adresse qui l'amène). */
  motifAttente?: string;
  /** Les biens dont un propriétaire ou un locataire est destinataire ; `null` = pas encore lus. */
  clesClients: ReadonlySet<string> | null;
  /** Les biens de BASE du brouillon (fiche ouverte, réponse héritée) : jamais « manuels ». */
  clesDeBase: ReadonlySet<string> | null;
  /** Parmi eux, le bien de la FICHE d'où l'on écrit. */
  clesDeFiche: ReadonlySet<string> | null;
}): string {
  if (o.origine === 'attente') return o.motifAttente ?? '';
  if (o.clesDeFiche?.has(o.cle) === true) return MOTIF_DEPUIS_LA_FICHE;
  if (o.clesClients !== null && !o.clesClients.has(o.cle) && !(o.clesDeBase?.has(o.cle) ?? false)) return MOTIF_AJOUT_MANUEL_SANS_CLIENT;
  if (o.origine === 'recherche') return MOTIF_AJOUT_RECHERCHE;
  return MOTIF_DEJA_RATTACHE;
}
