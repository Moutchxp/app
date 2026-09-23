/**
 * MODULE « GESTION » — LOT 4c : LIRE L'OBJET D'UN MAIL. Fonctions PURES (aucune base, aucun réseau), donc éprouvables
 * sur les objets réels vus à l'écran.
 *
 * Deux services, et une règle commune : ON NE PROPOSE QUE CE QUI EST ÉCRIT. Rien n'est deviné, rien n'est complété de
 * mémoire ; il n'existe aucun référentiel de biens dans cet outil, et ce n'est pas ici qu'on en inventera un. Ce qui
 * sort d'ici est une PROPOSITION affichée dans un champ modifiable — jamais une donnée écrite d'autorité.
 */

/** Préfixes de réponse et de transfert, français et anglais, tels qu'ils apparaissent VRAIMENT dans la boîte. */
const PREFIXES = ['re', 'ref', 'réf', 'rép', 'rep', 'tr', 'trans', 'fw', 'fwd', 'rv', 'aw', 'wg', 'sv', 'vs', 'antw'];

/**
 * Retire les préfixes de réponse/transfert EN CASCADE (« Re: TR: Fwd: Objet » → « Objet »), y compris les variantes
 * numérotées d'Outlook (« RE[2]: ») et les espaces avant les deux-points. Le RESTE de l'objet n'est pas touché :
 * ni la casse, ni la ponctuation interne, ni les accents.
 *
 * Pourquoi c'est nécessaire : la boîte est faite de fils longs, et un titre de carte « Re: RE: TR: Préavis de départ »
 * ne dit rien de plus que « Préavis de départ » — il dit juste que le mail a beaucoup circulé.
 */
export function nettoyerObjet(objet: string | null | undefined): string {
  let s = (objet ?? '').replace(/\s+/g, ' ').trim();
  // Une seule passe par préfixe trouvé, en boucle : c'est la CASCADE qu'on veut défaire, pas un préfixe unique.
  const motif = new RegExp(`^(?:${PREFIXES.join('|')})\\s*(?:\\[\\d+\\]|\\(\\d+\\)|\\d+)?\\s*:\\s*`, 'i');
  let garde = 0;
  while (motif.test(s) && garde++ < 20) s = s.replace(motif, '').trim();
  return s;
}

/** Types de voie reconnus. Volontairement fermé : un mot inconnu ne devient pas une adresse par optimisme. */
const VOIES = [
  'rue', 'avenue', 'av', 'ave', 'boulevard', 'bd', 'bld', 'quai', 'place', 'pl', 'impasse', 'allee', 'allée', 'allees',
  'allées', 'chemin', 'route', 'rte', 'cours', 'square', 'villa', 'passage', 'sentier', 'faubourg', 'fbg', 'promenade',
  'esplanade', 'parvis', 'rond-point', 'residence', 'résidence', 'domaine', 'hameau', 'cite', 'cité', 'voie',
];
/** Départements de l'aire d'activité. Un code postal d'ailleurs n'est pas une erreur, il n'est simplement pas un indice. */
const DEPARTEMENTS = ['75', '77', '78', '91', '92', '93', '94', '95'];

const VOIE_ALT = VOIES.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
/** « 1bis rue des pavillons … », « 34 Quai de Dion Bouton … », « 11 rue Paul chatrousse , … ». */
const NUMERO_VOIE = new RegExp(`\\b\\d{1,4}\\s*(?:bis|ter|quater|quinquies)?\\s*,?\\s*(?:${VOIE_ALT})\\b\\.?\\s`, 'i');
const CODE_POSTAL = new RegExp(`\\b(?:${DEPARTEMENTS.join('|')})\\d{3}\\b`);

const MAX_ADRESSE = 160;

/** Remet d'aplomb une adresse extraite : espaces multiples, « mot , mot » → « mot, mot », ponctuation qui traîne. */
function ranger(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\s+([,;])/g, '$1').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim();
}

/**
 * Propose une adresse postale LUE dans un texte — l'objet du mail d'abord, à défaut sa première ligne utile.
 *
 * Deux indices, par ordre de force :
 *   ① un NUMÉRO suivi d'un TYPE DE VOIE (« 28 avenue Marceau ») : on prend à partir de là jusqu'à la fin du segment ;
 *   ② à défaut, un CODE POSTAL d'Île-de-France suivi d'une commune (« 92800 PUTEAUX »).
 * Aucun indice → `null`, et le champ reste VIDE. Une adresse à moitié devinée est pire qu'une adresse absente : elle
 * a l'air d'une information.
 *
 * Le segment s'arrête à un tiret entouré d'espaces (« … Marceau - merci de confirmer ») ou à une parenthèse : ces
 * séparateurs annoncent autre chose que l'adresse. Le reste est conservé tel quel, commune comprise.
 */
export function adresseProposee(objet: string | null | undefined, corps?: string | null): string | null {
  for (const source of [objet, premiereLigneUtile(corps)]) {
    const trouve = chercherAdresse(source);
    if (trouve) return trouve;
  }
  return null;
}

function chercherAdresse(texte: string | null | undefined): string | null {
  const s = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  const m = NUMERO_VOIE.exec(s);
  if (m) {
    const brut = ranger(couper(s.slice(m.index)));
    return brut ? brut.slice(0, MAX_ADRESSE) : null;
  }

  const cp = CODE_POSTAL.exec(s);
  if (cp) {
    // Un code postal seul ne vaut que s'il est suivi d'un nom de commune ; « 92800 » tout court ne situe rien.
    const suite = ranger(couper(s.slice(cp.index)));
    return /^\d{5}\s+\S/.test(suite) ? suite.slice(0, MAX_ADRESSE) : null;
  }
  return null;
}

/** Coupe à ce qui annonce manifestement autre chose que la suite de l'adresse. */
function couper(s: string): string {
  return s.split(/\s+[–—-]\s+|\s*[(|]/)[0] ?? s;
}

/** La première ligne qui porte quelque chose — les formules d'ouverture seules ne sont pas une adresse. */
function premiereLigneUtile(corps: string | null | undefined): string | null {
  if (!corps) return null;
  for (const ligne of corps.split(/\r?\n/).slice(0, 8)) {
    const l = ligne.trim();
    if (l.length >= 8 && !/^(bonjour|bonsoir|madame|monsieur|cher|chère|hello|hi)\b[\s,]*$/i.test(l)) return l;
  }
  return null;
}
