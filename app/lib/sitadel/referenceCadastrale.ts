/**
 * CAD-1 — RÉFÉRENCE CADASTRALE : conversion (INSEE, préfixe, section, numéro) ⟷ IDU 14 caractères. PUR (aucune I/O), testé.
 *
 * ⚠️ LE PIÈGE DU RAPPROCHEMENT : les colonnes parsées de `parcelle` (`section`, `numero`) ont PERDU leurs zéros de tête
 * (« 0J » → « J », « 0161 » → « 161 »), tandis que l'IDU `parcelle.id` les GARDE. Et Sitadel/Cerfa donnent des valeurs SANS zéros
 * (« 9 », « DZ », préfixe vide). La SEULE clé sûre est donc l'IDU reconstitué avec le PADDING :
 *   IDU = INSEE(5) · préfixe(3, défaut 000) · section(2) · numéro(4)   — ex. « 92062 000 0J 0161 » = « 920620000J0161 ».
 */

export interface ReferenceCadastrale { insee: string; prefixe: string; section: string; numero: string }

/**
 * N3-E — COMMUNE CADASTRALE d'un permis, dérivée du NUMÉRO de dossier. 🔴 GARDE CENTRALE : à Paris/Lyon/Marseille le cadastre est
 * découpé par ARRONDISSEMENT (75101→75120, 69381→69389, 13201→13216) alors que Sitadel donne la commune ENTIÈRE (75056, 69123,
 * 13055). Une même « DZ 9 » existe dans PLUSIEURS arrondissements avec des contenances différentes : sans conversion on ne récolte
 * pas « 0 ligne » mais UNE PARCELLE FAUSSE ET PLAUSIBLE. Le numéro de dossier encode l'arrondissement réel : « 07512025V0035 » =
 * `0` + dept `75` + commune `120` → INSEE cadastral **75120**. Format attendu : `0` + 2 chiffres (dept) + 3 chiffres (commune).
 * On ne devine JAMAIS : format illisible, ou dept du numéro ≠ dept Sitadel → on N'ATTRIBUE PAS, avec un motif explicite.
 * `codeInsee` (Sitadel, commune entière) sert uniquement de garde-fou sur le département — sa commune (75056) diffère À DESSEIN de
 * l'arrondissement cadastral (75120), ce n'est pas une divergence.
 */
export function communeCadastrale(numDau: string, codeInsee: string): { insee: string } | { motif: string } {
  const m = /^0(\d{2})(\d{3})/.exec((numDau ?? '').trim());
  if (!m) return { motif: `numéro de dossier « ${numDau} » illisible (format attendu 0 + dept + commune) → commune cadastrale indéterminée` };
  const dept = m[1], commune = m[2];
  const deptSitadel = (codeInsee ?? '').trim().slice(0, 2);
  if (deptSitadel && deptSitadel !== dept) {
    return { motif: `département incohérent entre le numéro (${dept}) et Sitadel (${deptSitadel}) → commune cadastrale indéterminée` };
  }
  return { insee: `${dept}${commune}` }; // 75120 (arrondissement) ≠ 75056 (commune Sitadel) : voulu
}

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
