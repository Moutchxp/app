/**
 * ══ 🔴 LE LIBELLÉ OFFICIEL À L'ÉCRAN (Arno, 20/11/2026, « Adresse officielle BAN », retouche après le lot 5, corrigée après le lot 6). PUR. ═══════
 *
 * SEULS le TYPE DE VOIE (en début de voie) et les PETITS MOTS DE LIAISON passent en minuscule ; CHAQUE AUTRE MOT garde ou REÇOIT sa majuscule
 * initiale, même si la source l'écrit en minuscule : « 18 rue pierre et marie curie » → « 18 rue Pierre et Marie Curie ». Un mot écrit tout en
 * capitales passe en casse normale (« COURBEVOIE » → « Courbevoie ») ; un chiffre romain (« Louis XIV ») reste en capitales. La COMMUNE suit la même
 * règle (« LA GARENNE COLOMBES » → « La Garenne Colombes », « ASNIÈRES-SUR-SEINE » → « Asnières-sur-Seine »).
 * UNE SEULE FONCTION pour tous les écrans de l'adresse officielle (fiche copropriété, liste, digicodes, nom grisé, file « Adresses à vérifier » :
 * propositions, auto-complétion, fenêtre de confirmation, message, choix faits). Les données stockées ne sont JAMAIS réécrites.
 */

/** Les types de voie, écrits en entier (avec leurs accents). */
const TYPES = new Set(['avenue', 'rue', 'boulevard', 'place', 'allée', 'allee', 'impasse', 'chemin', 'square', 'quai', 'route', 'cours', 'passage', 'faubourg',
  'villa', 'cité', 'cite', 'résidence', 'residence', 'sentier', 'promenade', 'esplanade', 'parvis', 'hameau', 'voie', 'mail', 'ruelle', 'sente', 'carrefour',
  'cour', 'galerie', 'rond-point', 'chaussée', 'chaussee', 'parc', 'jardin', 'lotissement', 'domaine', 'quartier']);
/** Les petits mots de liaison, en minuscule sauf en tête. */
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'aux', 'au', 'sur', 'sous', 'en', 'et', 'à', 'lès', 'lez']);
/** Les indices d'un numéro (« 4 bis », « 12 ter », « 4 ba » dans la BAN, « 7 B ») : écrits tels quels. */
const INDICE = /^(bis|ter|quater|quinquies|[a-z]{1,2})$/i;
const ROMAIN = /^[IVXLC]{2,}$/;

const bas = (m: string) => m.toLocaleLowerCase('fr-FR');
/** La majuscule initiale ; un mot écrit tout en capitales passe en casse normale (sauf un chiffre romain). */
function capitale(m: string): string {
  if (m === '') return m;
  // un ordinal (« 19E », « 1ER ») écrit en capitales : en minuscule (« 19e », « 1er ») ; sinon un mot qui commence par un chiffre reste tel quel
  if (/^\d/.test(m)) return /^\d+(E|ER|ERE|ÈRE|EME|ÈME)$/.test(m) ? bas(m) : m;
  const toutCapitales = /\p{L}.*\p{L}/u.test(m) && m === m.toLocaleUpperCase('fr-FR') && m !== bas(m);
  const corps = toutCapitales && !ROMAIN.test(m) ? bas(m) : m;
  return corps.charAt(0).toLocaleUpperCase('fr-FR') + corps.slice(1);
}

/** Un nom (éventuellement composé : « jean-jacques », « saint-germain-des-prés ») : chaque segment en capitale, sauf un petit mot après le premier. */
function nom(m: string, enTete: boolean): string {
  const elision = /^([LlDd])(['’])(.+)$/.exec(m);
  if (elision !== null) return `${enTete ? elision[1].toUpperCase() : elision[1].toLowerCase()}${elision[2]}${nom(elision[3], false)}`;
  return m.split('-').map((s, i) => (i > 0 && PETITS.has(bas(s)) ? bas(s) : capitale(s))).join('-');
}

/** Un mot : type de voie (en début de voie) ou petit mot en minuscule ; sinon un nom, en capitale. */
function mot(m: string, enTete: boolean, debutDeVoie: boolean): string {
  if (!enTete && ((debutDeVoie && TYPES.has(bas(m))) || PETITS.has(bas(m)))) return bas(m);
  return nom(m, enTete);
}

/** LA VOIE À L'ÉCRAN : « 18 rue pierre et marie curie » → « 18 rue Pierre et Marie Curie ». PUR. */
export function voieAffichee(libelle: string): string {
  const mots = libelle.trim().split(/\s+/).filter((x) => x !== '');
  const debut = /^\d/.test(mots[0] ?? '') ? 1 : 0; // le premier mot de la voie (après le numéro)
  // un indice (« bis », « ter », « B », ou l'écriture BAN « ba ») avant le type de voie : la voie commence au mot suivant, l'indice est écrit tel quel
  const indice = debut === 1 && mots.length > 2 && !TYPES.has(bas(mots[1])) && !PETITS.has(bas(mots[1])) && (INDICE.test(mots[1]) || TYPES.has(bas(mots[2])));
  const voie = indice ? 2 : debut;
  return mots.map((m, i) => (indice && i === 1 ? m : mot(m, i === 0, i === voie))).join(' ');
}

/** LA COMMUNE À L'ÉCRAN : « COURBEVOIE » → « Courbevoie », « ASNIÈRES-SUR-SEINE » → « Asnières-sur-Seine ». PUR. */
export function communeAffichee(commune: string | null | undefined): string {
  const mots = (commune ?? '').trim().split(/\s+/).filter((x) => x !== '');
  return mots.map((m, i) => (i > 0 && PETITS.has(bas(m)) ? bas(m) : nom(m, i === 0))).join(' ');
}

/** UNE ADRESSE COMPLÈTE À L'ÉCRAN (« 1 Villa Des Lilas, 92400 COURBEVOIE » → « 1 villa des Lilas, 92400 Courbevoie »). PUR. */
export function adresseAffichee(texte: string): string {
  const i = texte.lastIndexOf(',');
  if (i < 0) return voieAffichee(texte);
  const fin = texte.slice(i + 1).trim();
  const m = /^(\d{4,5})\s+(.+)$/.exec(fin);
  return `${voieAffichee(texte.slice(0, i))}, ${m === null ? communeAffichee(fin) : `${m[1]} ${communeAffichee(m[2])}`}`;
}
