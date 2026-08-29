/**
 * L1 — extraction PURE des liens de téléchargement d'une réponse de mairie (corps texte ET HTML) + de leur EXPIRATION lorsqu'elle
 * est écrite EXPLICITEMENT. Module 100 % PUR : aucune I/O, aucun réseau, aucun import pg/imap.
 *
 * ⚠️ RÈGLE DURE (non négociable) : on NE SUIT JAMAIS un lien — ni pour le vérifier, ni pour le télécharger. Certains liens de
 * téléservice sont à usage unique ou tracés : un GET automatique consommerait l'accès ou fausserait une preuve. Ce module ne
 * fait QUE lire des chaînes ; il ne construit aucune requête réseau. Le téléchargement reste un geste HUMAIN.
 *
 * Réutilise (pas de rival) : `hrefsBruts` (prada.ts, regex href), `FORME_URL` (reglagesVeille), `MOIS_FR` (demande.ts).
 *
 * DISCRIMINATION (cas Paris : les 6 URL sont sur paris.fr → le domaine ne discrimine RIEN) : on capte TOUS les candidats, on
 * MARQUE « fort » celui dont le CHEMIN porte un jeton opaque (ex. /share/s/<jeton>/), et on n'en choisit JAMAIS un automatiquement.
 */
import { hrefsBruts } from '../sitadel/prada';
import { FORME_URL } from '../sitadel/reglagesVeille';
import { MOIS_FR } from '../sitadel/demande';

export interface LienCandidat {
  url: string;
  fort: boolean;                                 // chemin porteur d'un jeton opaque → candidat FORT (indice d'affichage, JAMAIS une décision)
  expireLe: Date | null;                         // expiration EXPLICITE (jamais devinée) ; portée par les liens FORTS uniquement
  expirationSource: 'absolue' | 'relative' | null;
  expirationIndice: string | null;              // fragment reconnu (« 7 jours », « jusqu'au 17/08/2026 ») — audit + rendu
}

/** Expiration parsée d'un message (fait de niveau message, rattaché ensuite aux liens FORTS). */
export interface Expiration {
  expireLe: Date | null;
  source: 'absolue' | 'relative' | null;
  indice: string | null;
}

// ── Collecte des URL (texte + html) ──────────────────────────────────────────
/** URL nues (http/https) d'un texte brut, sans la ponctuation de fin. */
const RE_URL_NUE = /https?:\/\/[^\s<>"'`)\]}]+/gi;
function urlsDuTexte(txt: string): string[] {
  return (txt.match(RE_URL_NUE) ?? []).map((u) => u.replace(/[.,;:!?)\]}>"']+$/, ''));
}

// ── Filtre des parasites (logos, tracking, désabonnement, réseaux sociaux, assets) ───────────────────────────────────────
const HOTES_PARASITES = /(?:^|\.)(?:facebook|twitter|linkedin|instagram|youtube|tiktok|pinterest|snapchat|google-analytics|googletagmanager|doubleclick|mailchimp|sendinblue|sibautomation|list-manage)\.[a-z]/i;
const HOTE_X = /(?:^|\.)x\.com$/i;
const CHEMIN_PARASITE = /(?:unsubscribe|desabon|desinscri|se-desabonner|optout|opt-out|preferences?|pixel|tracking|\/track\/)/i;
const EXT_ASSET = /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf|eot)(?:[?#].*)?$/i;

function estParasite(u: URL): boolean {
  const hote = u.hostname.toLowerCase();
  const chemin = u.pathname.toLowerCase();
  return HOTES_PARASITES.test(hote) || HOTE_X.test(hote) || CHEMIN_PARASITE.test(chemin) || EXT_ASSET.test(u.pathname);
}

// ── Détection d'un chemin « à jeton » (candidat FORT) ────────────────────────
/** Un segment de chemin est un JETON s'il est OPAQUE. L'opacité se juge sur le segment ENTIER, TIRETS COMPRIS — le tiret n'est
 *  PAS un critère (un jeton base64url comme « NvurYVHvT-iMfIC9RJ2LQQ » en contient légitimement). Critère retenu : longueur ≥ 16,
 *  lettres ET chiffres mêlés, ET une CASSE MIXTE (au moins une minuscule ET une majuscule). C'est la casse mixte qui sépare le
 *  jeton du slug : les slugs d'URL sont en minuscules par convention web (« le-plan-local-d-urbanisme-plu-2329 »,
 *  « demarches-2094 ») → jamais de majuscule → jamais retenus. Un jeton d'accès (identifiant machine) mêle les deux casses. Sans
 *  casse mixte (segment monocasse), on retombe sur la garde anti-slug d'origine (mots-tirets → faible). Erreur de côté SÛRE :
 *  dans le doute → faible. */
function segmentEstJeton(seg: string): boolean {
  if (seg.length < 16) return false;
  if (!/[A-Za-z]/.test(seg) || !/[0-9]/.test(seg)) return false;   // opaque = lettres ET chiffres mêlés (segment entier)
  if (/[a-z]/.test(seg) && /[A-Z]/.test(seg)) return true;          // casse MIXTE → jeton (un slug web reste en minuscules)
  return !/^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(seg);                  // monocasse : garde anti-slug (mots-tirets → jamais un jeton)
}
function cheminAJeton(u: URL): boolean {
  return u.pathname.split('/').filter(Boolean).some(segmentEstJeton);
}

// ── PART-1 — hôtes qui ne peuvent JAMAIS porter un « lien fort » (les nôtres / hébergeurs de nos actifs) ──────────────────────────
/** Parse une liste d'hôtes (virgules/point-virgules/espaces) en minuscules, sans entrée vide. PURE. */
export function parserHotesNonFort(brut: string | null | undefined): string[] {
  return (brut ?? '').split(/[,;\s]+/).map((h) => h.trim().toLowerCase()).filter((h) => h !== '');
}
/** Un hôte est exclu si l'un des hôtes listés en est un SUFFIXE de domaine (host === h OU host se termine par « .h »). PURE. */
export function hoteExclu(hostname: string, hotes: readonly string[]): boolean {
  const host = hostname.trim().toLowerCase();
  return hotes.some((h) => host === h || host.endsWith(`.${h}`));
}

// ── Expiration EXPLICITE (jamais devinée) ────────────────────────────────────
const RE_JJMMAAAA = /(\d{1,2})[/.](\d{1,2})[/.](\d{4})/;
const RE_ISO = /(\d{4})-(\d{2})-(\d{2})/;
const RE_TEXTE = new RegExp(`(\\d{1,2})\\s+(${MOIS_FR.join('|')})\\s+(\\d{4})`, 'i');
/** Déclencheurs d'une date d'expiration ABSOLUE (on n'attrape pas une date au hasard : elle doit suivre un déclencheur). */
const DECLENCHEURS_ABS = /(?:jusqu['’]?\s*au|expire(?:\s+le)?|valable\s+jusqu['’]?\s*au|avant\s+le|date\s+limite|dernier\s+d[ée]lai)\s*:?\s*/i;
/** Durée relative EXPLICITE. `valable` DOIT être immédiatement suivi d'un CHIFFRE : « valable environ 7 jours » / « valable une
 *  semaine » ne matchent pas (pas de chiffre juste après) → approximatif → expiration NULLE. */
const RE_RELATIVE = /\bvalable\s+(\d+)\s+(jours?|semaines?|mois)\b/i;

function jourUTC(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // rejette 31/02, etc.
  return dt;
}
function ajouterJours(base: Date, n: number): Date { return new Date(base.getTime() + n * 86_400_000); }
function ajouterMois(base: Date, n: number): Date {
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/** Parse une date ABSOLUE dans un fragment (les 3 formes), ou null. Renvoie aussi l'indice brut reconnu. */
function dateAbsolue(fragment: string): { date: Date; indice: string } | null {
  let m = RE_JJMMAAAA.exec(fragment);
  if (m) { const dt = jourUTC(+m[3], +m[2], +m[1]); if (dt) return { date: dt, indice: m[0] }; }
  m = RE_ISO.exec(fragment);
  if (m) { const dt = jourUTC(+m[1], +m[2], +m[3]); if (dt) return { date: dt, indice: m[0] }; }
  m = RE_TEXTE.exec(fragment);
  if (m) { const mois = MOIS_FR.indexOf(m[2].toLowerCase()) + 1; const dt = jourUTC(+m[3], mois, +m[1]); if (dt) return { date: dt, indice: m[0] }; }
  return null;
}

/**
 * Extrait l'expiration EXPLICITE d'un corps. Priorité à la date ABSOLUE (déclencheur + date), sinon durée RELATIVE explicite
 * (« valable N jours/semaines/mois », ancrée sur `recuLe`). Toute formulation approximative → { null, null, null } (« durée non
 * précisée »). Jamais d'invention : lire une durée écrite n'est pas deviner ; en fabriquer une, si.
 */
export function extraireExpiration(corps: string, recuLe: Date): Expiration {
  const decl = DECLENCHEURS_ABS.exec(corps);
  if (decl) {
    const apres = corps.slice(decl.index + decl[0].length, decl.index + decl[0].length + 40);
    const abs = dateAbsolue(apres);
    if (abs) return { expireLe: abs.date, source: 'absolue', indice: `${decl[0].trim()} ${abs.indice}`.trim() };
  }
  const rel = RE_RELATIVE.exec(corps);
  if (rel) {
    const n = Number(rel[1]);
    const unite = rel[2].toLowerCase();
    const expireLe = unite.startsWith('mois') ? ajouterMois(recuLe, n)
      : unite.startsWith('semaine') ? ajouterJours(recuLe, n * 7)
      : ajouterJours(recuLe, n);
    return { expireLe, source: 'relative', indice: `${n} ${unite}` };
  }
  return { expireLe: null, source: null, indice: null };
}

/**
 * Analyse une réponse : collecte les URL candidates (hrefs HTML + URL nues du texte), écarte les parasites, déduplique, marque
 * les FORTES (chemin à jeton), et rattache l'expiration EXPLICITE du message aux liens FORTS (le « lien valable N jours »
 * désigne le lien de téléchargement). Les liens faibles portent une expiration NULLE. Ordre : forts d'abord, puis par apparition.
 */
export function analyserLiensReponse(entree: { corpsTexte?: string | null; corpsHtml?: string | null; recuLe: Date }, hotesJamaisFort: readonly string[] = []): { liens: LienCandidat[]; expiration: Expiration } {
  const texte = entree.corpsTexte ?? '';
  const html = entree.corpsHtml ?? '';
  const brutes = [...hrefsBruts(html), ...urlsDuTexte(texte), ...urlsDuTexte(html)];

  const vues = new Set<string>();
  const retenues: { url: URL; brut: string }[] = [];
  for (const b of brutes) {
    const v = b.trim();
    if (!FORME_URL.test(v)) continue;            // http(s):// seulement (écarte mailto/tel/relatifs)
    let u: URL;
    try { u = new URL(v); } catch { continue; }  // URL malformée → ignorée (jamais suivie de toute façon)
    if (estParasite(u)) continue;
    const cle = u.toString();      // clé de DÉDOUBLONNAGE normalisée (new URL) — jamais stockée
    if (vues.has(cle)) continue;
    vues.add(cle);
    retenues.push({ url: u, brut: v }); // on STOCKE la forme BRUTE (fidélité : un lien à jeton n'est jamais réécrit/normalisé)
  }

  const expiration = extraireExpiration(`${texte}\n${html}`, entree.recuLe);
  const liens: LienCandidat[] = retenues.map(({ url, brut }) => {
    // PART-1 — un lien porté par un hôte à nous (ou un hébergeur de nos actifs, ex. googleusercontent d'une signature citée) n'est
    //   JAMAIS fort : ce n'est pas un lien de téléchargement de mairie, même si son chemin ressemble à un jeton.
    const fort = cheminAJeton(url) && !hoteExclu(url.hostname, hotesJamaisFort);
    return {
      url: brut,
      fort,
      // L'expiration décrit le lien de TÉLÉCHARGEMENT (fort). Les liens faibles (pied de page) n'en portent aucune.
      expireLe: fort ? expiration.expireLe : null,
      expirationSource: fort ? expiration.source : null,
      expirationIndice: fort ? expiration.indice : null,
    };
  });
  // Forts en tête (indice d'affichage), l'ordre d'apparition préservé à l'intérieur de chaque groupe.
  liens.sort((a, b) => (a.fort === b.fort ? 0 : a.fort ? -1 : 1));
  return { liens, expiration };
}
