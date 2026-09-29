/**
 * MODULE « GESTION » — LOT LECTURE-HTML-FIL-TROMBONE : CE QU'ON S'AUTORISE À ALLER CHERCHER. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 UN SERVEUR QUI VA CHERCHER UNE ADRESSE POUR VOUS EST UNE ARME, ET IL FAUT LA TENIR PAR LES DEUX BOUTS.
 *
 * La faille s'appelle SSRF : faire appeler par NOTRE serveur une adresse que lui seul peut joindre — la base de
 * données sur `localhost`, le stockage S3 sur `localhost:9000`, un service du réseau privé, le service de
 * métadonnées d'un hébergeur sur `169.254.169.254` — et lire la réponse. Un relais d'images qui accepterait une URL
 * en paramètre ouvrirait exactement cette porte.
 *
 * ═══ LES DEUX VERROUS, ET AUCUN NE SUFFIT SEUL ═══════════════════════════════════════════════════════════════════
 *
 * ① LA ROUTE NE PREND PAS D'ADRESSE. Elle prend un MESSAGE et un RANG (« la 3ᵉ image du mail 57185 ») et relit
 *    l'adresse dans le HTML que NOUS avons stocké. Rien de ce qu'un client envoie ne devient une adresse.
 *
 * ② ET L'ADRESSE AINSI OBTENUE EST QUAND MÊME VÉRIFIÉE (ce fichier). Parce que le HTML vient d'un mail, donc de
 *    quelqu'un d'extérieur : un expéditeur qui glisse `<img src="http://127.0.0.1:9000/…">` dans sa signature
 *    ferait, sans le second verrou, exactement ce que le premier interdit. Deux verrous, deux raisons.
 *
 * ⚠️ LA VÉRIFICATION SE REFAIT À CHAQUE REDIRECTION. Une adresse publique qui redirige vers `127.0.0.1` est le
 * contournement classique du premier contrôle : on ne suit donc pas les redirections en aveugle, on les suit UNE
 * PAR UNE en revérifiant chaque étape.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Au-delà, ce n'est plus un logo de signature : on refuse plutôt que de faire transiter un fichier lourd. */
export const TAILLE_MAX_IMAGE = 5 * 1024 * 1024;
/** Le temps qu'on accorde au serveur d'en face. Passé ce délai, l'image ne s'affichera pas — et c'est tout. */
export const DELAI_MS = 6_000;
/** Combien de redirections on accepte de suivre, en revérifiant chacune. */
export const REDIRECTIONS_MAX = 3;

/**
 * ══ 🔴 CETTE ADRESSE EST-ELLE ALLABLE ? PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Rend le motif du REFUS, ou `null` quand l'adresse est acceptable. Le motif est rendu plutôt qu'un booléen parce
 * qu'il finit dans le journal du serveur : « refusé » sans raison ne s'instruit pas six mois après.
 *
 * ⚠️ ON NE RÉSOUT PAS LE NOM DE DOMAINE ICI, et c'est délibéré : ce module est PUR. Le contrôle des adresses IP
 * littérales est fait ici (c'est la voie directe), et l'appelant, lui, refuse en plus toute réponse qui ne serait
 * pas une image. Un nom de domaine public qui pointerait vers une adresse privée reste théoriquement possible ;
 * ce qu'il permettrait est borné par le fait qu'on ne rend au navigateur QUE des octets d'image, jamais du texte,
 * jamais un en-tête, et jamais un code de retour.
 */
export function refusDeLAdresse(brut: string): string | null {
  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return 'adresse illisible';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `protocole refusé (${u.protocol})`;
  const hote = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hote === '') return 'hôte vide';
  if (hote === 'localhost' || hote.endsWith('.localhost') || hote.endsWith('.local')) return 'hôte local';
  if (estIpPrivee(hote)) return `adresse privée (${hote})`;
  return null;
}

/**
 * 🔴 UNE ADRESSE IP QU'UN MAIL N'A AUCUNE RAISON DE DÉSIGNER. PUR.
 *
 * On couvre les quatre familles qui comptent, et l'on refuse par défaut ce qu'on ne sait pas lire :
 *   · la boucle locale (127.0.0.0/8, ::1) — la base, le stockage, tout ce qui tourne sur la machine ;
 *   · les réseaux privés (10/8, 172.16/12, 192.168/16, fc00::/7) — le reste de l'infrastructure ;
 *   · le lien-local (169.254/16, fe80::/10) — dont `169.254.169.254`, le service de métadonnées des hébergeurs,
 *     qui rend des IDENTIFIANTS ; c'est la cible classique d'une SSRF, et elle mérite d'être nommée ;
 *   · `0.0.0.0` et les formes abrégées, qui désignent la machine elle-même.
 */
export function estIpPrivee(hote: string): boolean {
  const h = hote.toLowerCase();
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;                       // fc00::/7 — unique local
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;                       // fe80::/10 — lien local
  if (/^::ffff:/.test(h)) return estIpPrivee(h.replace(/^::ffff:/, '')); // IPv4 écrite en IPv6
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4 === null) return false; // un NOM de domaine : voir l'encadré de `refusDeLAdresse`
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** Les types qu'on accepte de renvoyer au navigateur. Tout le reste est refusé — y compris `text/html`. */
export function typeImageAcceptable(brut: string | null | undefined): boolean {
  const t = (brut ?? '').split(';')[0].trim().toLowerCase();
  return t.startsWith('image/') && !t.includes('svg');
}

/**
 * ⚠️ `image/svg+xml` EST REFUSÉ, et ce n'est pas un oubli. Un SVG est un DOCUMENT : il peut porter du script, des
 * références externes et sa propre feuille de style. Le servir depuis notre domaine reviendrait à laisser un
 * expéditeur poser du code dans notre page — exactement ce que l'assainissement du HTML interdit par ailleurs.
 */
export const MENTION_SVG_REFUSE = 'image vectorielle non affichée';
