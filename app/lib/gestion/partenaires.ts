/**
 * MODULE « GESTION » — LOT 4d : LES PARTENAIRES INTERNES (migration 233). IMPUR (base), en LECTURE SEULE.
 *
 * Un partenaire interne n'est ni nous ni un correspondant extérieur : il travaille AVEC nous et n'est jamais en
 * contact direct avec les clients. Aujourd'hui : la comptabilité de la gestion, externalisée à ADHOC Gestion.
 * La règle qu'ils déclenchent est écrite dans `attente.ts` ; ici on ne fait que LIRE la liste et servir son libellé.
 *
 * ⚠️ REPLI SI LA TABLE N'EXISTE PAS. Les migrations sont livrées NON APPLIQUÉES : entre la livraison du code et son
 * application par Arno, la table n'est pas là. On rend alors une liste VIDE — et tout le module retombe exactement sur
 * son comportement d'avant (deux catégories), sans une seule erreur à l'écran.
 *
 * Le repli n'est valable que parce qu'on passe par `query()`, donc en AUTO-COMMIT : PostgreSQL abandonne toute la
 * transaction à la première erreur, si bien qu'un repli placé À L'INTÉRIEUR d'une transaction ne pourrait jamais
 * s'exécuter. Ce piège a déjà coûté une livraison (lot 4a) — il ne se reproduit pas ici.
 */
import { query } from '../db/client';

export interface PartenaireInterne {
  adresse: string;
  libelle: string;
}

/** Code PostgreSQL « undefined_table » : la migration 233 n'est pas encore appliquée. Ce n'est pas une panne. */
const TABLE_ABSENTE = '42P01';

export async function lirePartenairesInternes(): Promise<PartenaireInterne[]> {
  try {
    const { rows } = await query<{ adresse: string; libelle: string }>(
      `SELECT lower(btrim(adresse)) AS adresse, libelle
         FROM gestion_partenaire_interne WHERE actif ORDER BY adresse`);
    return rows.map((r) => ({ adresse: r.adresse, libelle: r.libelle }));
  } catch (e) {
    if ((e as { code?: string })?.code === TABLE_ABSENTE) return [];
    throw e; // toute autre erreur est une VRAIE erreur : on ne la déguise pas en « pas de partenaire »
  }
}

/** Les adresses seules, pour les passer en paramètre lié (`text[]`) aux requêtes de `attente.ts`. PUR. */
export function adressesDe(partenaires: readonly PartenaireInterne[]): string[] {
  return partenaires.map((p) => p.adresse);
}

/** Vrai si cette adresse est celle d'un partenaire interne. PUR. */
export function estPartenaire(partenaires: readonly PartenaireInterne[], adresse: string | null | undefined): boolean {
  const a = (adresse ?? '').trim().toLowerCase();
  return a !== '' && partenaires.some((p) => p.adresse === a);
}

/**
 * CE QUE L'ÉCRAN AFFICHE à la place du nom d'expéditeur.
 *
 * Le libellé du partenaire PRIME sur le nom porté par le mail : « Service Gestion » ne dit rien à personne et se
 * confond avec notre propre boîte, alors que « Comptabilité (ADHOC Gestion) » dit qui parle et à quel titre. Pour tous
 * les autres, rien ne change : le nom du mail, à défaut l'adresse. PUR.
 */
export function libelleExpediteur(
  partenaires: readonly PartenaireInterne[], adresse: string | null | undefined, deNom: string | null | undefined,
): string {
  const a = (adresse ?? '').trim().toLowerCase();
  const partenaire = partenaires.find((p) => p.adresse === a);
  if (partenaire) return partenaire.libelle;
  const nom = (deNom ?? '').trim();
  return nom !== '' ? nom : (adresse ?? '').trim();
}
