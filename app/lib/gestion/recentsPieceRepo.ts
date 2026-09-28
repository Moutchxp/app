import { query } from '../db/client';
import { piecesRecentesDisponibles } from './schema';

/**
 * MODULE « GESTION » — LOT EDITEUR-PJ : CE QU'ON A DÉJÀ JOINT. Accès base, en lecture et en écriture.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 AUCUNE ÉCRITURE DRIVE, D'AUCUNE SORTE. Cet historique vit dans NOTRE base. Du Drive, il ne retient que des
 * identifiants — et un identifiant Google ne donne aucun droit par lui-même : rouvrir un « récent » repasse par
 * `/api/admin/gestion/drive/fichiers`, qui redemande le jeton par délégation et laisse Google appliquer SES droits,
 * dossier par dossier. Un fichier auquel Arno n'a plus accès figurera dans sa liste et refusera de s'ouvrir : c'est
 * le comportement juste, et c'est Google qui le prononce.
 *
 * 🔴 « DOCUMENTS CLIENTS SCANNÉS » N'EST PAS UN CAS PARTICULIER ICI, et c'est voulu. Un fichier de ce dossier ne
 * peut pas être JOINT (la route le refuse en remontant la chaîne des parents), donc il n'arrive jamais jusqu'à
 * `noterRecent` : la liste ne peut pas en contenir. On ne réécrit donc PAS la règle une seconde fois ici — une
 * règle recopiée est une règle qui divergera. Elle est prononcée là où elle compte, une seule fois.
 *
 * ⚠️ PAS DE `import 'server-only'` : les CLI du module importent ce fichier par `tsx`. La frontière navigateur est
 * tenue par `app/lib/garde/clientBoundary.guard.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export type SorteRecent = 'drive_fichier' | 'drive_dossier' | 'locale';

export interface PieceRecente {
  sorte: SorteRecent;
  cle: string;
  libelle: string;
  detail: string | null;
  tailleOctets: number | null;
  dernierLe: string;
}

/** Au-delà, ce n'est plus « récent » : c'est une deuxième arborescence, et on préfère chercher. */
export const RECENTS_MAX = 12;

/** Une ligne telle que PostgreSQL la rend. ⚠️ `bigint` arrive en CHAÎNE avec le pilote `pg`. */
interface Ligne {
  sorte: string;
  cle: string;
  libelle: string;
  detail: string | null;
  taille_octets: string | null;
  dernier_le: string;
}

function valide(s: string): s is SorteRecent {
  return s === 'drive_fichier' || s === 'drive_dossier' || s === 'locale';
}

/**
 * NOTER QU'UNE CIBLE VIENT D'ÊTRE UTILISÉE.
 *
 * 🔴 ELLE REMONTE, ELLE NE SE DUPLIQUE PAS. Rejoindre douze fois le même bail doit donner UNE ligne en tête de
 * liste, pas douze lignes identiques qui chassent tout le reste. D'où le `ON CONFLICT` sur (compte, sorte, clé).
 *
 * ⚠️ LE LIBELLÉ EST RAFRAÎCHI À CHAQUE USAGE : un fichier renommé chez Google reprend son nom courant. On garde en
 * revanche `premier_le`, qui dit depuis quand cette pièce fait partie des habitudes.
 *
 * ⚠️ NE JETTE JAMAIS. Tenir un historique est un CONFORT : si l'écriture échoue, la pièce est jointe quand même et
 * personne ne doit s'en apercevoir. Un mail qui part vaut mieux qu'une liste de raccourcis à jour.
 */
export async function noterRecent(entree: {
  compteId: number;
  sorte: SorteRecent;
  cle: string;
  libelle: string;
  detail?: string | null;
  tailleOctets?: number | null;
}): Promise<boolean> {
  const cle = entree.cle.trim();
  if (!Number.isSafeInteger(entree.compteId) || entree.compteId <= 0 || cle === '') return false;
  if (!(await piecesRecentesDisponibles())) return false;
  try {
    await query(
      `INSERT INTO gestion_piece_recente (compte_id, sorte, cle, libelle, detail, taille_octets)
            VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (compte_id, sorte, cle) DO UPDATE
               SET dernier_le = now(),
                   nb_usages  = gestion_piece_recente.nb_usages + 1,
                   libelle    = EXCLUDED.libelle,
                   detail     = coalesce(EXCLUDED.detail, gestion_piece_recente.detail),
                   taille_octets = coalesce(EXCLUDED.taille_octets, gestion_piece_recente.taille_octets)`,
      [entree.compteId, entree.sorte, cle, entree.libelle.slice(0, 300),
        entree.detail ?? null, entree.tailleOctets ?? null],
    );
    return true;
  } catch (e) {
    console.error('[gestion/recents] la cible n’a pas pu être notée', e);
    return false;
  }
}

/**
 * LES CIBLES RÉCENTES D'UNE PERSONNE, la plus récente en tête.
 *
 * ⚠️ `disponible: false` N'EST PAS UNE LISTE VIDE. Une liste vide se lit « vous n'avez rien joint récemment » ;
 * l'absence de migration se lit « cette fonction n'est pas encore installée ». L'écran doit pouvoir faire la
 * différence, sinon il affiche une section vide que personne ne comprend.
 */
export async function listerRecents(
  compteId: number, sortes: readonly SorteRecent[], limite = RECENTS_MAX,
): Promise<{ lignes: PieceRecente[]; disponible: boolean }> {
  if (!Number.isSafeInteger(compteId) || compteId <= 0 || sortes.length === 0) {
    return { lignes: [], disponible: true };
  }
  if (!(await piecesRecentesDisponibles())) return { lignes: [], disponible: false };
  const n = Math.min(Math.max(1, Math.round(limite)), RECENTS_MAX);
  const { rows } = await query<Ligne>(
    `SELECT sorte, cle, libelle, detail, taille_octets, dernier_le::text AS dernier_le
       FROM gestion_piece_recente
      WHERE compte_id = $1 AND sorte = ANY ($2::text[])
      ORDER BY dernier_le DESC
      LIMIT $3`,
    [compteId, [...sortes], n],
  );
  return {
    disponible: true,
    lignes: rows.filter((r) => valide(r.sorte)).map((r) => ({
      sorte: r.sorte as SorteRecent,
      cle: r.cle,
      libelle: r.libelle,
      detail: r.detail,
      // ⚠️ `bigint` arrive en CHAÎNE : sans ce `Number`, une taille serait comparée comme du texte.
      tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
      dernierLe: r.dernier_le,
    })),
  };
}

/**
 * LA CLÉ DE STOCKAGE D'UNE PIÈCE LOCALE RÉCENTE, si elle appartient bien à cette personne.
 *
 * 🔴 C'EST LA GARDE QUI COMPTE POUR LE POINT 7. Rejoindre un « récent » local relit des octets DÉJÀ chez nous : si
 * l'on acceptait une clé de stockage envoyée par l'écran sans vérifier à qui elle appartient, n'importe quelle clé
 * du seau deviendrait une pièce jointe. On ne rend donc la clé que si elle figure dans l'historique DE CE COMPTE.
 */
export async function cleLocaleDuRecent(compteId: number, cle: string): Promise<PieceRecente | null> {
  if (!Number.isSafeInteger(compteId) || compteId <= 0 || cle.trim() === '') return null;
  if (!(await piecesRecentesDisponibles())) return null;
  const { rows } = await query<Ligne>(
    `SELECT sorte, cle, libelle, detail, taille_octets, dernier_le::text AS dernier_le
       FROM gestion_piece_recente
      WHERE compte_id = $1 AND sorte = 'locale' AND cle = $2
      LIMIT 1`,
    [compteId, cle.trim()],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    sorte: 'locale',
    cle: r.cle,
    libelle: r.libelle,
    detail: r.detail,
    tailleOctets: r.taille_octets === null ? null : Number(r.taille_octets),
    dernierLe: r.dernier_le,
  };
}
