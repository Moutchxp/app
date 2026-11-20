/**
 * ══ 🔴 LE LIBELLÉ OFFICIEL À L'ÉCRAN (Arno, 20/11/2026, « Adresse officielle BAN », retouche après le lot 5). PUR. ═══════════════════════════════════
 *
 * La BAN écrit « 54 Avenue Puvis De Chavannes » : à l'écran, le TYPE DE VOIE et les PETITS MOTS passent en minuscule, sauf en tête du libellé —
 * « 54 avenue Puvis de Chavannes », « 80 rue de Normandie », « 12 place de l'Arche ». Les noms propres (Saint-Denis, Jean-Baptiste Charcot, Maréchal
 * Joffre) gardent leurs majuscules. UNE SEULE FONCTION pour tous les écrans (fiche copropriété, liste, digicodes, nom grisé) ; les données BAN
 * stockées ne sont JAMAIS réécrites : seul l'affichage passe par ici.
 */

/** Les types de voie, écrits en entier (avec leurs accents). */
const TYPES = new Set(['avenue', 'rue', 'boulevard', 'place', 'allée', 'allee', 'impasse', 'chemin', 'square', 'quai', 'route', 'cours', 'passage', 'faubourg',
  'villa', 'cité', 'cite', 'résidence', 'residence', 'sentier', 'promenade', 'esplanade', 'parvis', 'hameau', 'voie', 'mail', 'ruelle', 'sente', 'carrefour',
  'cour', 'galerie', 'rond-point', 'chaussée', 'chaussee', 'parc', 'jardin', 'lotissement', 'domaine', 'quartier']);
/** Les petits mots, en minuscule sauf en tête. */
const PETITS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'aux', 'au', 'sur', 'en', 'et']);

/** Un mot (séparé par des espaces) : type de voie ou petit mot en minuscule ; « L'Arche », « D'Alsace » → « l'Arche », « d'Alsace » ; les traits d'union gardés. */
function mot(m: string, enTete: boolean, debutDeVoie: boolean): string {
  if (enTete) return m;
  const bas = m.toLocaleLowerCase('fr-FR');
  // le type de voie seulement EN DÉBUT de voie (« Rue du Port » : « Port » est un nom, il garde sa majuscule)
  if ((debutDeVoie && TYPES.has(bas)) || PETITS.has(bas)) return bas;
  const elision = /^([LlDd])['’](.+)$/.exec(m);
  if (elision !== null) return `${elision[1].toLowerCase()}${m[1]}${elision[2]}`; // l'apostrophe gardée telle qu'écrite
  // dans un nom composé (« Saint-Germain-Des-Prés »), un petit mot après le premier segment passe en minuscule
  if (m.includes('-')) return m.split('-').map((s, i) => (i > 0 && PETITS.has(s.toLocaleLowerCase('fr-FR')) ? s.toLocaleLowerCase('fr-FR') : s)).join('-');
  return m;
}

/** LE LIBELLÉ OFFICIEL À L'ÉCRAN : la voie seule (« 54 Avenue Puvis De Chavannes » → « 54 avenue Puvis de Chavannes »). Le premier mot reste tel quel. PUR. */
export function voieAffichee(libelle: string): string {
  const mots = libelle.trim().split(/\s+/).filter((x) => x !== '');
  const debut = /^\d/.test(mots[0] ?? '') ? 1 : 0; // le premier mot de la voie (après le numéro, et son indice « bis » / « ter »)
  const bas = (m: string | undefined) => (m ?? '').toLocaleLowerCase('fr-FR');
  // un indice (« bis », « ter », « B », ou l'écriture BAN « ba ») avant le type de voie : la voie commence au mot suivant
  const voie = debut === 1 && mots.length > 2 && (/^(bis|ter|quater|[a-z])$/i.test(mots[1]) || (!TYPES.has(bas(mots[1])) && TYPES.has(bas(mots[2])))) ? 2 : debut;
  return mots.map((m, i) => mot(m, i === 0, i === voie)).join(' ');
}
