/**
 * ══ MODE RECETTE — LE VERROU RÉSEAU, POSÉ AU DÉMARRAGE (lot RECETTE-MAC) ══════════════════════════════════════════════
 *
 * `instrumentation.ts` (runtime Node, via `demarrageNode.ts`) appelle `installerVerrouRecette()` UNE fois, au démarrage du serveur, SEULEMENT si `modeRecette()`
 * est vrai. Le `fetch` global est alors enveloppé : chaque requête sortante passe par `decisionRecette` — les écritures
 * Gmail, Agenda et Drive ne partent pas (cf. `interception.ts`), et sont notées dans la boîte de test. Toutes les
 * fonctions de l'application reçoivent ce `fetch` (`{ fetch }`, paramètres par défaut) : aucune n'y échappe.
 */
import { randomUUID } from 'node:crypto';
import { decisionRecette, decoderRfc822, resumerRfc822 } from './interception';
import { deposerDansBoite, requeteLisible } from './boite';

const MARQUE = Symbol.for('svav.recette.fetch');
// Drapeau GLOBAL (Next peut envelopper à son tour le fetch : le nôtre reste dans la chaîne, mais n'est plus au sommet).
const POSE = Symbol.for('svav.recette.verrouPose');
const drapeaux = globalThis as unknown as Record<symbol, boolean | undefined>;

function lireCorpsTexte(init?: RequestInit): string | null {
  const b = init?.body;
  if (typeof b === 'string') return b;
  if (b instanceof Uint8Array) return Buffer.from(b).toString('utf8');
  if (b instanceof ArrayBuffer) return Buffer.from(new Uint8Array(b)).toString('utf8');
  return null;
}

/** Résumé d'un envoi Gmail : `raw` en JSON, ou le message RFC 822 brut (envoi /upload/ en message/rfc822). */
function resumerEnvoiGmail(corps: string | null): { a: string | null; objet: string | null } {
  if (!corps) return { a: null, objet: null };
  try {
    const j = JSON.parse(corps) as { raw?: string; message?: { raw?: string } };
    return resumerRfc822(j.raw ?? j.message?.raw ?? null);
  } catch {
    return resumerRfc822(Buffer.from(corps, 'utf8').toString('base64'));
  }
}

/** Le message RFC 822 entier d'un envoi Gmail (`raw` en JSON, ou le message brut en /upload/). */
function messageEnvoiGmail(corps: string | null): string | null {
  if (!corps) return null;
  try {
    const j = JSON.parse(corps) as { raw?: string; message?: { raw?: string } };
    return decoderRfc822(j.raw ?? j.message?.raw ?? null);
  } catch {
    return corps;
  }
}

/** Enveloppe le `fetch` global (idempotent). Renvoie `true` si le verrou vient d'être posé. */
export function installerVerrouRecette(): boolean {
  const actuel = globalThis.fetch as typeof fetch & { [MARQUE]?: true };
  if (drapeaux[POSE] || actuel[MARQUE]) return false;
  const base = actuel;
  const verrou = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.toString() : entree.url;
    const methode = init?.method ?? (typeof entree === 'object' && 'method' in entree ? entree.method : 'GET');
    const d = decisionRecette(url, methode, randomUUID().slice(0, 12));
    if (d.action === 'laisser') return base(entree, init);
    const requete = requeteLisible(url, methode);
    if (d.canal === 'gmail_envoi') {
      const corps = lireCorpsTexte(init);
      const { a, objet } = resumerEnvoiGmail(corps);
      deposerDansBoite({ canal: 'gmail_envoi', issue: 'intercepte', a, objet, requete }, messageEnvoiGmail(corps));
    } else {
      deposerDansBoite({ canal: d.canal, issue: d.action === 'simuler' ? 'simule' : 'refuse', requete });
    }
    return d.corps === null
      ? new Response(null, { status: d.statut })
      : new Response(JSON.stringify(d.corps), { status: d.statut, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch & { [MARQUE]?: true };
  verrou[MARQUE] = true;
  globalThis.fetch = verrou;
  drapeaux[POSE] = true;
  return true;
}

/** Le verrou réseau est-il posé dans CE processus ? (affiché par la page de recette) */
export function verrouRecettePose(): boolean {
  return drapeaux[POSE] === true;
}
