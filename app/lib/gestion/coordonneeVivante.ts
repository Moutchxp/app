import { annuaireModifiableDisponible } from './schema';

/**
 * ══ 🔴🔴 UNE COORDONNÉE RETIRÉE À LA MAIN NE SERT PLUS À RIEN, NULLE PART ═════════════════════════════════════════
 *
 * LOT FICHES-ANNUAIRE (étape C). La migration 278 ajoute `gestion_annuaire_contact.archive_le` : le téléphone ou
 * l'e-mail qu'Arno vient de retirer d'une fiche. Il n'est pas supprimé — rien ne l'est dans ce module — mais il ne
 * doit plus PESER.
 *
 * 🔴 POURQUOI UN SEUL ENDROIT POUR CETTE CONDITION. Neuf requêtes du module rapprochent un mail d'une fiche par
 * son adresse : le moteur de propositions de classement (`classementBien`), la recherche de bien, le tri des
 * pièces, l'encart « qui est cet expéditeur », la fiche de rattachement… Si UNE SEULE oubliait `archive_le`, une
 * adresse retirée continuerait de proposer un bien — et le geste d'Arno serait à moitié appliqué, ce qui est pire
 * que pas appliqué du tout : il aurait toutes les raisons de croire que c'est fait.
 *
 * ⚠️ `archive_le` N'EST PAS `absent_le`, ET LES DEUX CONDITIONS COEXISTENT :
 *   · `absent_le`  — « plus dans le dernier export de WIPPIMMO ». La coordonnée a servi, elle s'affiche grisée
 *                    sur la fiche, et un ré-import peut la réveiller.
 *   · `archive_le` — « retirée par nous ». Elle disparaît de la fiche, et un ré-import ne la réveille PAS.
 * Les confondre effacerait de l'historique, ou ferait réapparaître ce que quelqu'un venait de retirer.
 *
 * ⚠️ LA SONDE VOYAGE AVEC LA COLONNE : sans la migration 278, la condition est la CHAÎNE VIDE, et la colonne
 * n'est NOMMÉE nulle part. La nommer ferait échouer les requêtes qui l'utilisent — c'est-à-dire le classement
 * d'un mail, donc l'écran principal du module.
 */
export async function conditionCoordonneeVivante(alias = ''): Promise<string> {
  if (!await annuaireModifiableDisponible()) return '';
  const prefixe = alias === '' ? '' : `${alias}.`;
  return ` AND ${prefixe}archive_le IS NULL`;
}
