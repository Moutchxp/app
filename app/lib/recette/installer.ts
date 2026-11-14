/**
 * ══ MODE RECETTE — LE VERROU RÉSEAU (lot RECETTE-MAC ; 🔴 refondu le 15/11/2026) ══════════════════════════════════════════════
 *
 * `instrumentation.ts` (runtime Node, via `demarrageNode.ts`) pose le verrou au démarrage du serveur, en recette (simulé + boîte de test)
 * ou hors production (`refus`). 🔴 Avant le 15/11/2026, le `fetch` global était simplement remplacé UNE fois : Next le remettait à
 * l'origine à chaque rechargement à chaud du code serveur, et la recette envoyait pour de vrai. Le `fetch` global est désormais un
 * ACCESSEUR qui rend toujours le `fetch` rangé SOUS le verrou ; un auto-contrôle le vérifie au démarrage (`autoControleRecette`).
 * Deuxième barrière, indépendante : `gardeSortie.ts` (`fetchSortant`), au plus bas niveau de chaque fonction qui écrit.
 */
import { ENTETE_AUTO_CONTROLE, fetchSortant, intercepter, politiqueSortie, type PolitiqueSortie } from './gardeSortie';
import { deposerRecette } from './depotRecette';

const MARQUE = Symbol.for('svav.recette.fetch');
// Drapeau GLOBAL (Next peut envelopper à son tour le fetch : le nôtre reste dans la chaîne, mais n'est plus au sommet).
const POSE = Symbol.for('svav.recette.verrouPose');
const drapeaux = globalThis as unknown as Record<symbol, boolean | undefined>;

type Fetch = typeof fetch & { [MARQUE]?: true };
interface Accesseur { courant: typeof fetch; politique: PolitiqueSortie; enveloppes: WeakMap<typeof fetch, Fetch> }
const ACCESSEUR = Symbol.for('svav.recette.accesseur');
const etat = globalThis as unknown as Record<symbol, Accesseur | undefined>;

/**
 * 🔴🔴 Arno (15/11/2026) — LE `fetch` GLOBAL DEVIENT UN ACCESSEUR : ce que le serveur y range (Next remet son `fetch` d'origine à CHAQUE
 * rechargement à chaud du code, `resetFetch`) est gardé, mais toujours RENDU SOUS LE VERROU. Plus aucune remise à zéro ne l'efface.
 * `politique` : `recette` (simulé + boîte de test) ou `refus` (écritures refusées). Idempotent ; renvoie `true` s'il vient d'être posé.
 */
export function installerVerrouRecette(politique: PolitiqueSortie = 'recette'): boolean {
  const deja = etat[ACCESSEUR];
  if (deja !== undefined && Object.getOwnPropertyDescriptor(globalThis, 'fetch')?.get !== undefined) { deja.politique = politique; return false; }
  const a: Accesseur = { courant: globalThis.fetch, politique, enveloppes: new WeakMap() };
  const envelopper = (f: typeof fetch): Fetch => {
    if ((f as Fetch)[MARQUE]) return f as Fetch;
    const connu = a.enveloppes.get(f);
    if (connu) return connu;
    const v = (async (entree: RequestInfo | URL, init?: RequestInit) => intercepter(entree, init, a.politique, deposerRecette) ?? f(entree, init)) as Fetch;
    v[MARQUE] = true;
    a.enveloppes.set(f, v);
    return v;
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, enumerable: true,
    get: () => envelopper(a.courant),
    set: (f: typeof fetch) => { a.courant = f; },
  });
  etat[ACCESSEUR] = a;
  drapeaux[POSE] = true;
  return true;
}

/** Épreuves seulement : retire l'accesseur et rend au `fetch` global une valeur simple. */
export function retirerVerrouRecette(): void {
  const a = etat[ACCESSEUR];
  if (a === undefined) return;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, enumerable: true, writable: true, value: a.courant });
  delete etat[ACCESSEUR];
  delete drapeaux[POSE];
}

export type IssueAutoControle = { ok: true } | { ok: false; motif: string };

/**
 * 🔴🔴 L'AUTO-CONTRÔLE DE DÉMARRAGE (Arno, 15/11/2026) : le verrou est-il posé, résiste-t-il à la remise à zéro de Next, et la garde au plus
 * bas niveau intercepte-t-elle ? Un envoi Gmail de CONTRÔLE (marqué : jamais déposé) ne doit atteindre AUCUN `fetch` réel. Rien ne part :
 * les `fetch` réels sont remplacés le temps du contrôle par une sentinelle.
 */
export async function autoControleRecette(env: Record<string, string | undefined> = process.env, nomMachine = ''): Promise<IssueAutoControle> {
  const politique = politiqueSortie(env, nomMachine, { demarrage: true });
  if (politique !== 'recette') return { ok: false, motif: `le mode recette n’est pas actif (politique : ${politique})` };
  const a = etat[ACCESSEUR];
  if (a === undefined || !verrouRecettePose()) return { ok: false, motif: 'le verrou réseau n’est pas posé' };
  let atteint = 0;
  const sentinelle = (async () => { atteint += 1; return new Response('{}', { status: 200 }); }) as typeof fetch;
  const avant = a.courant;
  const URL_ENVOI = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
  const init = { method: 'POST', headers: { [ENTETE_AUTO_CONTROLE]: '1', 'content-type': 'application/json' }, body: '{"raw":""}' };
  try {
    globalThis.fetch = sentinelle; // ce que fait Next à chaque rechargement à chaud
    const r1 = await globalThis.fetch(URL_ENVOI, init);
    const r2 = await fetchSortant(sentinelle, () => politique)(URL_ENVOI, init);
    const r3 = await globalThis.fetch('https://www.googleapis.com/calendar/v3/calendars/x/events', init);
    const r4 = await globalThis.fetch('https://www.googleapis.com/drive/v3/files', init);
    if (atteint > 0) return { ok: false, motif: 'une écriture de contrôle a atteint le réseau' };
    const id = ((await r1.json().catch(() => ({}))) as { id?: string }).id ?? '';
    if (!id.startsWith('recette-') || r2.status !== 200 || r3.status !== 200 || r4.status !== 403) return { ok: false, motif: 'réponses de contrôle inattendues' };
    return { ok: true };
  } catch (e) {
    return { ok: false, motif: (e as Error)?.message ?? 'erreur inattendue' };
  } finally {
    a.courant = avant;
  }
}

/** Le verrou réseau est-il posé dans CE processus ? (affiché par la page de recette) */
export function verrouRecettePose(): boolean {
  return drapeaux[POSE] === true && etat[ACCESSEUR] !== undefined && (globalThis.fetch as Fetch)[MARQUE] === true;
}
