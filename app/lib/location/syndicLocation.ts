/**
 * TUILE LOCATION — LE SYNDIC DU BIEN : les formes échangées entre l'écran et le serveur. MODULE PUR (aucune base).
 * Voir `syndicLocationRepo.ts` (fonctions de la Gestion) et `BlocSyndicBien.tsx` (l'écran).
 */
export interface SyndicSuggere { id: number; nom: string; ville: string | null; motif: string }

export interface NouveauContactSyndic {
  civilite?: 'M.' | 'Mme' | null; prenom?: string; nom?: string; fonction?: string; email?: string; telephone?: string;
}

export interface SyndicDuBien { id: number; contactsIds?: number[]; nouveauxContacts?: NouveauContactSyndic[] }

// ── LE DÉTAIL DU SYNDIC : LES BIENS GÉRÉS, PAR ADRESSE D'IMMEUBLE (Arno, 17/10/2026) ───────────────────────────────────

export interface LotDuDetail {
  id: number; numero: string; adresse: string | null; commune: string | null; type?: string | null; proprietaires?: string[];
}
export interface CoproDuDetail { libelle: string; codePostal: string | null; commune: string | null; lots: readonly LotDuDetail[] }
export interface GroupeAdresse { adresse: string; codePostal: string | null; commune: string | null; lots: LotDuDetail[] }

const plat = (t: string | null | undefined): string => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** « 12bis rue des Lilas » → { numero: 12, suffixe: 'bis', voie: 'rue des lilas' } ; sans numéro : numero null. PUR. */
export function decouperAdresse(brut: string | null | undefined): { numero: number | null; suffixe: string; voie: string } {
  const t = plat(brut);
  const m = /^(\d+)\s*([a-z]{0,4})\b[\s,]*(.*)$/.exec(t);
  if (m === null) return { numero: null, suffixe: '', voie: t };
  return { numero: Number(m[1]), suffixe: m[2] ?? '', voie: (m[3] ?? '').trim() };
}

/**
 * « Immeubles et biens gérés, regroupés PAR ADRESSE d'immeuble, triés par commune puis par voie puis par numéro ; sous chaque
 * adresse, ses lots. » (Arno) L'adresse d'un lot est la sienne (une copropriété peut avoir plusieurs adresses), à défaut celle
 * de sa copropriété ; une copropriété sans bien du portefeuille garde sa ligne. PUR.
 */
export function grouperBiensParAdresse(copros: readonly CoproDuDetail[]): GroupeAdresse[] {
  const groupes = new Map<string, GroupeAdresse>();
  const ajouter = (adresse: string, codePostal: string | null, commune: string | null, lot: LotDuDetail | null): void => {
    const cle = `${plat(commune)}|${plat(adresse)}`;
    const g = groupes.get(cle) ?? { adresse, codePostal, commune, lots: [] };
    if (lot !== null && !g.lots.some((x) => x.id === lot.id)) g.lots.push(lot);
    groupes.set(cle, g);
  };
  for (const c of copros) {
    if (c.lots.length === 0) ajouter(c.libelle, c.codePostal, c.commune, null);
    for (const l of c.lots) ajouter((l.adresse ?? '').trim() || c.libelle, c.codePostal, l.commune ?? c.commune, l);
  }
  const num = (n: string): number => (/^\d+$/.test(n) ? Number(n) : Number.MAX_SAFE_INTEGER);
  return [...groupes.values()]
    .map((g) => ({ ...g, lots: [...g.lots].sort((a, b) => num(a.numero) - num(b.numero) || a.numero.localeCompare(b.numero, 'fr')) }))
    .sort((a, b) => {
      const ca = plat(a.commune).localeCompare(plat(b.commune), 'fr');
      if (ca !== 0) return ca;
      const da = decouperAdresse(a.adresse);
      const db = decouperAdresse(b.adresse);
      return da.voie.localeCompare(db.voie, 'fr') || (da.numero ?? Number.MAX_SAFE_INTEGER) - (db.numero ?? Number.MAX_SAFE_INTEGER)
        || da.suffixe.localeCompare(db.suffixe, 'fr');
    });
}

// ── LE DÉTAIL DU SYNDIC : LES CONTACTS DE CETTE ADRESSE EN TÊTE (Arno, 18/10/2026) ─────────────────────────────────────

/**
 * Les clés d'immeuble de l'adresse du bien : la copropriété proposée et ses adresses secondaires (même immeuble). PUR.
 */
export function clesDeLAdresse(coproCle: string, coproprietes: readonly { cle: string; adresses?: readonly { cle: string }[] }[]): Set<string> {
  const cles = new Set<string>([coproCle]);
  for (const c of coproprietes) {
    const toutes = [c.cle, ...(c.adresses ?? []).map((a) => a.cle)];
    if (toutes.includes(coproCle)) for (const k of toutes) cles.add(k);
  }
  return cles;
}

/**
 * « Les contacts déjà associés à un bien de CETTE adresse (même immeuble) passent EN TÊTE de liste, avec un repère
 * distinctif ; les autres suivent. » (Arno) L'ordre de l'annuaire est gardé à l'intérieur de chaque groupe. PUR.
 */
export function ordonnerContactsSyndic<T extends { immeubles: readonly string[] }>(contacts: readonly T[], cles: ReadonlySet<string>):
  { contact: T; associe: boolean }[] {
  const vus = contacts.map((contact) => ({ contact, associe: contact.immeubles.some((k) => cles.has(k)) }));
  return [...vus.filter((x) => x.associe), ...vus.filter((x) => !x.associe)];
}
