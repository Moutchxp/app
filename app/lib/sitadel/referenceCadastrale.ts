/**
 * CAD-1 — RÉFÉRENCE CADASTRALE : conversion (INSEE, préfixe, section, numéro) ⟷ IDU 14 caractères. PUR (aucune I/O), testé.
 *
 * ⚠️ LE PIÈGE DU RAPPROCHEMENT : les colonnes parsées de `parcelle` (`section`, `numero`) ont PERDU leurs zéros de tête
 * (« 0J » → « J », « 0161 » → « 161 »), tandis que l'IDU `parcelle.id` les GARDE. Et Sitadel/Cerfa donnent des valeurs SANS zéros
 * (« 9 », « DZ », préfixe vide). La SEULE clé sûre est donc l'IDU reconstitué avec le PADDING :
 *   IDU = INSEE(5) · préfixe(3, défaut 000) · section(2) · numéro(4)   — ex. « 92062 000 0J 0161 » = « 920620000J0161 ».
 */

export interface ReferenceCadastrale { insee: string; prefixe: string; section: string; numero: string }

/** (INSEE, préfixe, section, numéro) → IDU 14 caractères, zéros de tête PADDÉS. Préfixe vide/absent → « 000 ». Section en MAJUSCULES.
 *  Toujours 14 caractères : chaque composant est tronqué à sa largeur par la gauche si trop long (dernier chiffres/lettres significatifs). */
export function versIdu(ref: ReferenceCadastrale): string {
  const insee = (ref.insee ?? '').trim().padStart(5, '0').slice(-5);
  const prefixe = ((ref.prefixe ?? '').trim() || '0').padStart(3, '0').slice(-3);       // '' → '000'
  const section = (ref.section ?? '').trim().toUpperCase().padStart(2, '0').slice(-2);    // 'J' → '0J', 'DZ' → 'DZ'
  const numero = (ref.numero ?? '').trim().padStart(4, '0').slice(-4);                    // '9' → '0009', '161' → '0161'
  return `${insee}${prefixe}${section}${numero}`;
}

/** IDU 14 caractères → composants PADDÉS (tels que dans l'IDU). `depuisIdu('920620000J0161')` = { insee:'92062', prefixe:'000', section:'0J', numero:'0161' }.
 *  Retourne null si la longueur n'est pas 14 (on ne devine pas un découpage). */
export function depuisIdu(idu: string): ReferenceCadastrale | null {
  const s = (idu ?? '').trim();
  if (s.length !== 14) return null;
  return { insee: s.slice(0, 5), prefixe: s.slice(5, 8), section: s.slice(8, 10), numero: s.slice(10, 14) };
}

/** Forme « colonnes parsées » de `parcelle` (zéros de tête retirés sur section/numéro), pour COMPARER à ce que la table stocke.
 *  '0J' → 'J', '0161' → '161', 'DZ' → 'DZ', '000' → '000'. */
export function sectionNumeroParses(idu: string): { section: string; numero: string } | null {
  const ref = depuisIdu(idu);
  if (!ref) return null;
  const sansZeros = (v: string) => v.replace(/^0+/, '') || '0';
  return { section: sansZeros(ref.section), numero: sansZeros(ref.numero) };
}
