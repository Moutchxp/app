/**
 * ══ 🔴🔴 LA GARDE DES EFFETS RÉELS — DÉFENSE EN PROFONDEUR (Arno, 15/11/2026) ══════════════════════════════════════════════════════════════
 *
 * CONSTATÉ (13–14/11/2026) : la recette a envoyé de VRAIS mails et créé de VRAIS rendez-vous Google. Cause : le serveur de
 * développement de Next garde le `fetch` d'ORIGINE capturé à son démarrage (avant `instrumentation.ts`) et le REMET en place à chaque
 * rechargement à chaud du code serveur (`resetFetch`, `router-server.js` / `hot-reloader-webpack.js`) — le verrou, posé une seule fois
 * au démarrage, disparaissait à la première modification de code ; plus rien n'était intercepté.
 *
 * DÉSORMAIS, TROIS COUCHES INDÉPENDANTES :
 *   1. AU PLUS BAS NIVEAU, DANS CHAQUE FONCTION QUI ÉCRIT : chaque appel réseau des modules Gmail, Agenda et Drive passe par
 *      `fetchSortant(f)`, et chaque transporteur SMTP par `politiqueSortie` — la décision est relue À CHAQUE APPEL, jamais une seule
 *      fois au démarrage.
 *   2. LE `fetch` GLOBAL est un ACCESSEUR (`installer.ts`) : ce que Next y remet est rangé, mais toujours rendu SOUS le verrou.
 *   3. AU DÉMARRAGE de la recette, un AUTO-CONTRÔLE simule la remise à zéro de Next et un envoi : s'il passait, le serveur s'arrête.
 *
 * LA RÈGLE (`politiqueSortie`, PURE) :
 *   · mode recette actif → `recette` : les écritures Gmail / Agenda sont simulées et déposées dans la boîte de test, le Drive refusé ;
 *   · base de recette ou d'épreuve (`svav_recette`, `svav_test…`) sans mode recette → `refus` ;
 *   · l'application configurée comme la PRODUCTION (adresse publique `authentification.sansvisavis.com`, ou machine `svav-prod`) → `production` : libre ;
 *   · sous les épreuves (vitest) → `epreuve` : libre (les transports y sont des faux injectés) ;
 *   · TOUT LE RESTE (un Mac en `npm run dev`, une autre base) → `refus` : aucune écriture Google, aucun mail SMTP ne part ; le refus est
 *     écrit au journal (canal, hôte et chemin seulement — jamais un jeton, une clé, un en-tête ni un destinataire). Jamais l'inverse.
 * ⚠️ AUCUN MODULE NODE ICI (ni `pg`, ni `fs`, ni `os`) : des modules partagés avec le navigateur l'importent (`drive.ts`…). Le disque
 * (boîte de test) et le nom de la machine sont BRANCHÉS par `gardeSortie.ts`, côté serveur.
 */
import { decisionRecette, type Decision } from './interception';
import { etatRecette, HOTE_PRODUCTION, MACHINE_PRODUCTION } from './modeEtat';

export type PolitiqueSortie = 'recette' | 'production' | 'epreuve' | 'refus';

const BASE_NON_PRODUCTION = /^svav_(recette|test)/i;

/** « POST https://hote/chemin » — jamais les paramètres (ils peuvent porter un identifiant). PUR. */
export function requeteLisible(url: string, methode: string): string {
  try { const u = new URL(url); return `${methode.toUpperCase()} ${u.origin}${u.pathname}`; } catch { return methode.toUpperCase(); }
}

/**
 * Les branchements du SERVEUR (`gardeSortie.ts`, chargé au démarrage) : le nom de la machine et le dépôt dans la boîte de test (disque).
 * Absents (un module chargé ailleurs), la garde décide QUAND MÊME — elle ne dépose simplement rien. Rangés sur `globalThis` : ils
 * survivent aux rechargements à chaud du code.
 */
export interface BranchementsGarde { nomMachine: () => string; deposer: Deposer; trace: (e: { canal: string; issue: 'refuse'; requete: string }) => void }
const CLE_BRANCHEMENTS = Symbol.for('svav.garde.branchements');
export const branchementsGarde = (): BranchementsGarde | null => (globalThis as unknown as Record<symbol, BranchementsGarde | undefined>)[CLE_BRANCHEMENTS] ?? null;
export function brancherGarde(b: BranchementsGarde): void { (globalThis as unknown as Record<symbol, BranchementsGarde | undefined>)[CLE_BRANCHEMENTS] = b; }
const idAleatoire = (): string => { try { return globalThis.crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); } };
const auNavigateur = (): boolean => typeof window !== 'undefined';
/** En-tête de l'auto-contrôle de démarrage : la requête de contrôle n'est jamais déposée dans la boîte de test. */
export const ENTETE_AUTO_CONTROLE = 'x-svav-auto-controle';

const hote = (url: string | undefined): string | null => { try { return url ? new URL(url).hostname.toLowerCase() : null; } catch { return null; } };
/** Le nom de la base de `DATABASE_URL` (jamais l'utilisateur ni le mot de passe). PUR. */
export const nomDeBase = (url: string | undefined): string | null => {
  try { return url ? decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null : null; } catch { return null; }
};

/** Que peut faire ce processus de ses écritures réelles ? PUR (environnement et nom d'hôte en paramètres). */
export function politiqueSortie(env: Record<string, string | undefined>, nomMachine = '',
  /** Le démarrage du serveur : jamais l'exemption des épreuves (ce n'est pas un faux transport, c'est le vrai serveur). */
  o: { demarrage?: boolean } = {}): PolitiqueSortie {
  const epreuve = !o.demarrage && (env.VITEST || env.NODE_ENV === 'test') && env.SVAV_GARDE_EPREUVE !== '1';
  if (epreuve) return 'epreuve';
  if (etatRecette(env, nomMachine).actif) return 'recette';
  if (BASE_NON_PRODUCTION.test(nomDeBase(env.DATABASE_URL) ?? '')) return 'refus';
  for (const cle of ['GESTION_URL_APPLICATION', 'SITE_URL']) if (hote(env[cle]) === HOTE_PRODUCTION) return 'production';
  if (MACHINE_PRODUCTION.test(nomMachine)) return 'production';
  return 'refus';
}

/** La politique de CE processus, relue à chaque appel. */
export const politiqueCourante = (): PolitiqueSortie => politiqueSortie(process.env, branchementsGarde()?.nomMachine() ?? '');

export const MOTIF_REFUS_SORTIE = 'Écriture réelle REFUSÉE : ce serveur n’est ni la production ni en mode recette (aucun mail, agenda ni Drive réel hors production).';

/** La décision pour une requête sortante, selon la politique. PUR. */
export function decisionSortie(url: string, methode: string | undefined, politique: PolitiqueSortie, id: string): Decision {
  if (politique === 'production' || politique === 'epreuve') return { action: 'laisser' };
  const d = decisionRecette(url, methode, id);
  if (politique === 'recette' || d.action === 'laisser') return d;
  // `refus` : toute écriture Google (envoi, agenda, Drive, lot) est refusée — rien n'est simulé comme « envoyé »
  return { action: 'refuser', canal: d.canal === 'gmail_envoi' || d.canal === 'gmail_ecriture' || d.canal === 'agenda' ? 'google_lot' : d.canal, statut: 403,
    corps: { error: { code: 403, message: MOTIF_REFUS_SORTIE } } };
}

function lireCorpsTexte(init?: RequestInit): string | null {
  const b = init?.body;
  if (typeof b === 'string') return b;
  if (b instanceof Uint8Array) return Buffer.from(b).toString('utf8');
  if (b instanceof ArrayBuffer) return Buffer.from(new Uint8Array(b)).toString('utf8');
  return null;
}
const urlDe = (entree: RequestInfo | URL): string => (typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url);
const methodeDe = (entree: RequestInfo | URL, init?: RequestInit): string => init?.method ?? (typeof entree === 'object' && 'method' in entree ? entree.method : 'GET');
const estAutoControle = (init?: RequestInit): boolean => {
  const h = init?.headers;
  if (!h) return false;
  if (h instanceof Headers) return h.get(ENTETE_AUTO_CONTROLE) === '1';
  if (Array.isArray(h)) return h.some(([k, v]) => k.toLowerCase() === ENTETE_AUTO_CONTROLE && v === '1');
  return Object.entries(h).some(([k, v]) => k.toLowerCase() === ENTETE_AUTO_CONTROLE && v === '1');
};

/** Hook de dépôt (le message entier d'un envoi Gmail) — branché par `installer.ts` ; absent : le résumé seul. */
export type Deposer = (url: string, methode: string, d: Exclude<Decision, { action: 'laisser' }>, corps: string | null) => void;

function deposerParDefaut(url: string, methode: string, d: Exclude<Decision, { action: 'laisser' }>, corps: string | null): void {
  const b = branchementsGarde();
  if (b !== null) b.deposer(url, methode, d, corps);
  else console.warn(`[RECETTE] aucun effet réel : ${d.canal} ${requeteLisible(url, methode)} (boîte de test non branchée dans ce processus)`);
}

/**
 * Applique la décision à UNE requête : `null` = la laisser partir ; sinon la réponse simulée ou le refus (déposé dans la boîte en recette,
 * écrit au journal en refus). Ne lève jamais.
 */
export function intercepter(entree: RequestInfo | URL, init: RequestInit | undefined, politique: PolitiqueSortie, deposer: Deposer = deposerParDefaut): Response | null {
  const url = urlDe(entree);
  const methode = methodeDe(entree, init);
  const d = decisionSortie(url, methode, politique, idAleatoire().slice(0, 12));
  if (d.action === 'laisser') return null;
  if (!estAutoControle(init)) {
    try {
      if (politique === 'recette') deposer(url, methode, d, lireCorpsTexte(init));
      else {
        console.error(`[GARDE] ${MOTIF_REFUS_SORTIE} — ${d.canal} ${requeteLisible(url, methode)}`);
        branchementsGarde()?.trace({ canal: d.canal, issue: 'refuse', requete: requeteLisible(url, methode) });
      }
    } catch { /* la trace ne bloque jamais le refus */ }
  }
  return d.corps === null ? new Response(null, { status: d.statut })
    : new Response(JSON.stringify(d.corps), { status: d.statut, headers: { 'Content-Type': 'application/json' } });
}

const MARQUE_SORTANT = Symbol.for('svav.garde.fetchSortant');

/**
 * 🔴 LA GARDE AU PLUS BAS NIVEAU : le `fetch` qu'utilise une fonction qui écrit (Gmail, Agenda, Drive). La politique est relue À CHAQUE
 * APPEL ; aucune remise à zéro du `fetch` global ne la contourne.
 */
export function fetchSortant<F extends (entree: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(f: F, lire: () => PolitiqueSortie = politiqueCourante): F {
  // au navigateur : aucune écriture Google n'en part (et la décision lit l'environnement du serveur) — le `fetch` tel quel
  if (auNavigateur() || (f as unknown as Record<symbol, unknown>)[MARQUE_SORTANT] === true) return f;
  const garde = (async (entree: RequestInfo | URL, init?: RequestInit) => intercepter(entree, init, lire()) ?? f(entree, init)) as unknown as F;
  (garde as unknown as Record<symbol, unknown>)[MARQUE_SORTANT] = true;
  return garde;
}

/** L'envoi SMTP est-il permis ? `recette` : boîte de test ; `refus` : rien ne part ; sinon : le vrai serveur. */
export function sortieSmtp(politique: PolitiqueSortie = politiqueCourante()): 'reel' | 'recette' | 'refus' {
  return politique === 'recette' ? 'recette' : politique === 'refus' ? 'refus' : 'reel';
}
