/**
 * ══ 🔴 Arno (25/10/2026) — LES CHAMPS NUMÉRIQUES STRICTS DE LOCATION (montants, taux, surfaces, nombres, indices) ═══════════════════
 * À la frappe : seuls les chiffres, UN séparateur décimal (virgule ou point, affiché en virgule) et les espaces de milliers passent ;
 * tout autre caractère est IGNORÉ, sans message. Les décimales sont bornées selon le champ (2 pour les euros et les %, 3 pour les
 * indices, 0 pour un nombre entier) : une décimale de trop est ignorée aussi. Au collage : le texte est filtré de la même façon (« € »,
 * « % », lettres retirés ; « 1.234,56 » et « 1,234.56 » compris — le DERNIER séparateur est la décimale) ; un collage sans aucun chiffre
 * est refusé, avec un message court. Le contrôle serveur ne change pas (il refuse toujours une valeur non numérique). PUR.
 */
const ESPACES = /[\s\u00a0\u202f]/;

/** Le texte tapé → le texte gardé (chiffres, une virgule, espaces de milliers ; décimales bornées). */
export function filtrerSaisieNombre(brut: string, decimales: number): string {
  let sortie = '';
  let separateur = false;
  let apres = 0;
  for (const c of brut) {
    if (c >= '0' && c <= '9') {
      if (separateur) { if (apres >= decimales) continue; apres += 1; }
      sortie += c;
    } else if ((c === ',' || c === '.') && decimales > 0 && !separateur) {
      separateur = true;
      sortie += ',';
    } else if (ESPACES.test(c) && !separateur && sortie !== '' && !sortie.endsWith(' ')) {
      // Une espace de milliers (tolérée, jamais en tête, jamais doublée, jamais dans les décimales).
      sortie += ' ';
    }
  }
  return sortie;
}

/** Le nombre de caractères gardés parmi les `n` premiers caractères tapés (pour replacer le curseur). */
export function gardesAvant(brut: string, n: number, decimales: number): number {
  return filtrerSaisieNombre(brut.slice(0, n), decimales).length;
}

export const MOTIF_COLLAGE_REFUSE = 'Collage refusé : aucun nombre à coller.';

/**
 * Un texte collé → le nombre à insérer (« 1 234,56 € » → « 1 234,56 » ; « 1.234,56 » → « 1234,56 » ; « 12.5 % » → « 12,5 »), ou
 * `null` s'il ne contient aucun chiffre. Le dernier séparateur (virgule ou point) suivi de chiffres est la décimale ; les autres sont
 * des séparateurs de milliers, retirés.
 */
export function nombreColle(texte: string, decimales: number): string | null {
  if (!/\d/.test(texte)) return null;
  const garde = texte.replace(/[^\d.,\s\u00a0\u202f]/g, '').trim();
  const dernier = Math.max(garde.lastIndexOf(','), garde.lastIndexOf('.'));
  let entier = garde;
  let fraction = '';
  if (dernier >= 0 && /\d/.test(garde.slice(dernier + 1))) { entier = garde.slice(0, dernier); fraction = garde.slice(dernier + 1); }
  entier = entier.replace(/[.,]/g, '');
  // Un champ entier ne prend pas la partie décimale d'un collage (« 12,5 » → « 12 », jamais « 125 »).
  const brut = fraction === '' || decimales === 0 ? entier : `${entier},${fraction.replace(/\D/g, '')}`;
  const sortie = filtrerSaisieNombre(brut, decimales).trim();
  return /\d/.test(sortie) ? sortie : null;
}
