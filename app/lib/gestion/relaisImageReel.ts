import { DELAI_MS, REDIRECTIONS_MAX, TAILLE_MAX_IMAGE, refusDeLAdresse, typeImageAcceptable } from './relaisImage';

/**
 * LOT ETOILE-ET-SIGNATURE — ALLER CHERCHER UNE IMAGE, AVEC LES VERROUS. Le seul endroit du module qui appelle une
 * adresse venue d'ailleurs.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE CODE ÉTAIT DANS LA ROUTE `/messages/[id]/image` (lot LECTURE-HTML-FIL-TROMBONE). Il est SORTI ici parce
 * qu'un second appelant en a besoin — les images de la signature Gmail — et qu'une seconde copie des verrous est
 * une seconde chance de n'en corriger qu'une. Rien n'a changé dans les règles : elles sont recopiées mot pour mot,
 * avec leurs raisons.
 *
 * ① L'ADRESSE EST VÉRIFIÉE AVANT CHAQUE APPEL (`refusDeLAdresse`) : pas de boucle locale, pas de réseau privé, pas
 *    de service de métadonnées d'hébergeur, pas de protocole exotique. C'est la faille SSRF, et elle ne s'ouvre pas
 *    « juste pour des images ».
 *
 * ② LES REDIRECTIONS SONT SUIVIES UNE PAR UNE, EN REVÉRIFIANT CHACUNE. Une adresse publique qui redirige vers
 *    `127.0.0.1` est le contournement classique : `redirect: 'manual'` est obligatoire, pas une précaution.
 *
 * ③ SEULES DES IMAGES, ET JAMAIS UN SVG (`typeImageAcceptable`) : un SVG est un DOCUMENT, avec script et feuille
 *    de style. Le servir depuis notre domaine reviendrait à laisser quelqu'un poser du code dans notre page.
 *
 * ④ LA TAILLE EST RELUE SUR LES OCTETS REÇUS, jamais crue sur parole : un serveur peut mentir sur son
 *    `Content-Length`, ou n'en donner aucun.
 *
 * 🔒 AUCUNE IDENTITÉ N'EST ENVOYÉE (`credentials: 'omit'`, aucun en-tête d'autorisation). Mesuré le 29/09/2026 sur
 * les images de la signature de gestion@ : NUES elles répondent 200 (image/png, 1 933 / 835 / 1 600 octets) ;
 * avec un jeton Google, elles répondent 403. Envoyer notre jeton serait donc à la fois inutile, cassant, et une
 * fuite d'identifiant vers un hôte qui n'a aucune raison de le voir.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ImageRapportee {
  corps: ArrayBuffer;
  /** Le type MIME, sans paramètre (`image/png`, jamais `image/png; charset=binary`). */
  type: string;
}

/** `null` = refusée ou illisible, sans distinction — l'appelant ne doit rien pouvoir déduire de l'échec. */
export async function allerChercherImage(depart: string): Promise<ImageRapportee | null> {
  let url = depart;
  for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
    const motif = refusDeLAdresse(url);
    if (motif !== null) {
      console.warn('[gestion/image] adresse refusée', { url: url.slice(0, 120), motif });
      return null;
    }
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(DELAI_MS),
      credentials: 'omit',
      headers: { Accept: 'image/*' },
    });
    if (res.status >= 300 && res.status < 400) {
      const suite = res.headers.get('location');
      if (suite === null) return null;
      url = new URL(suite, url).toString();
      continue;
    }
    if (!res.ok) return null;
    const type = res.headers.get('content-type');
    if (!typeImageAcceptable(type)) return null;
    const annoncee = Number(res.headers.get('content-length') ?? '0');
    if (annoncee > TAILLE_MAX_IMAGE) return null;
    const corps = await res.arrayBuffer();
    if (corps.byteLength > TAILLE_MAX_IMAGE) return null;
    return { corps, type: (type ?? 'image/png').split(';')[0].trim() };
  }
  return null; // trop de redirections : on s'arrête plutôt que de tourner
}
