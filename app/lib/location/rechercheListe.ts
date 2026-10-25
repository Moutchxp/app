/**
 * ══ 🔴 Arno (25/10/2026) — LE MINI MOTEUR DE RECHERCHE D'UNE LISTE (l'apporteur d'affaires d'abord) ═══════════════════════════════════
 * On tape, la liste se filtre : sans tenir compte des accents ni de la casse ; plusieurs mots = TOUS présents (dans le libellé ou le
 * texte cherchable : nom, prénom, société, téléphones, e-mails) ; un téléphone se trouve avec ou sans espaces (« 0612 », « 06 12 34 »).
 * Les meilleurs résultats d'abord (le libellé qui COMMENCE par le mot, puis un mot du libellé, puis le libellé, puis le reste) ; le
 * terme recherché se surligne dans le libellé. PUR.
 */

/** Un caractère sans accent, en minuscule : UN caractère pour UN caractère (les positions du surlignage restent justes). */
const base = (c: string): string => (c.normalize('NFD')[0] ?? c).toLowerCase();
export const normaliser = (t: string): string => [...t].map(base).join('');
const chiffres = (t: string): string => t.replace(/\D/g, '');

/** Les mots d'une recherche (normalisés, sans vide). */
export const motsRecherche = (q: string): string[] => normaliser(q).split(/[\s,;]+/).filter((m) => m !== '');

/**
 * Le score d'un choix pour une recherche (null : un mot manque). `libelle` : ce qui s'affiche ; `texte` : tout ce qui se cherche en plus.
 * Un mot de 2 chiffres ou plus se cherche aussi dans les chiffres seuls du texte (un téléphone écrit avec espaces, points ou « +33 »).
 */
export function scoreRecherche(libelle: string, texte: string, q: string): number | null {
  const mots = motsRecherche(q);
  if (mots.length === 0) return 0;
  const l = normaliser(libelle);
  const tout = `${l} ${normaliser(texte)}`;
  const numeros = chiffres(texte).length > 0 ? `${chiffres(texte)} ${texte.split(/[,;/]/).map((x) => chiffres(x).replace(/^33(\d{9})$/, '0$1')).join(' ')}` : '';
  let score = 0;
  for (const m of mots) {
    const n = chiffres(m);
    const parChiffres = n.length >= 2 && n.length === m.replace(/[\s.+-]/g, '').length && numeros.includes(n);
    if (!tout.includes(m) && !parChiffres) return null;
    score += l.startsWith(m) ? 4 : l.split(/[\s'’()-]+/).some((w) => w.startsWith(m)) ? 3 : l.includes(m) ? 2 : 1;
  }
  return score;
}

/** Le libellé découpé pour le surlignage : les morceaux qui correspondent à un mot de la recherche sont « fort ». */
export function segmentsSurlignes(libelle: string, q: string): { t: string; fort: boolean }[] {
  const mots = motsRecherche(q);
  if (mots.length === 0) return [{ t: libelle, fort: false }];
  const l = normaliser(libelle);
  const marque = new Array<boolean>(libelle.length).fill(false);
  for (const m of mots) {
    let i = l.indexOf(m);
    while (i >= 0) { for (let k = i; k < i + m.length; k += 1) marque[k] = true; i = l.indexOf(m, i + 1); }
  }
  const sortie: { t: string; fort: boolean }[] = [];
  for (let i = 0; i < libelle.length; i += 1) {
    const dernier = sortie[sortie.length - 1];
    if (dernier !== undefined && dernier.fort === marque[i]) dernier.t += libelle[i]; else sortie.push({ t: libelle[i], fort: marque[i] });
  }
  return sortie;
}
