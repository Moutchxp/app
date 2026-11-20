import { adresseAffichee } from '../../lib/adresse/libelleAffiche';

/**
 * ══ 🔴🔴 L'ADRESSE OFFICIELLE, CÔTÉ NAVIGATEUR : LA SOURCE UNIQUE ET LE FORMAT UNIQUE (Arno, 20/11/2026, « Adresse officielle BAN », lot 7a). PUR (hors `fetch`). ══
 *
 * Règle d'Arno : « une seule auto-complétion, une seule écriture partout ». Ce module est le SEUL endroit du navigateur qui interroge la Base Adresse
 * Nationale (api-adresse.data.gouv.fr) ; il rend chaque proposition au FORMAT UNIQUE : identifiant BAN (`cle_d_interoperabilite`), libellé officiel,
 * numéro et indice, code postal, INSEE, commune (et les coordonnées, pour les cartes). Le composant unique (`ChampAdresseOfficielle`) l'emploie, et
 * tous les champs d'adresse de l'application passent par ce composant (garde : `champAdresseUnique.guard.test.ts`).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : ce module est chargé par le site public comme par l'administration.
 */
export const URL_API_ADRESSE = 'https://api-adresse.data.gouv.fr/search/';

/** UNE ADRESSE AU FORMAT UNIQUE. Les valeurs sont celles de la BAN, jamais réécrites ; l'écran les montre par `libelleAdresse`. */
export interface AdresseOfficielle {
  /** l'identifiant BAN (`cle_d_interoperabilite`, ex. « 92026_7184_00054 ») ; null : une adresse d'une autre source (la Base locale du syndic, un géocodage serveur) */
  banId: string | null;
  /** le libellé complet tel que la BAN l'écrit (« 54 Avenue Puvis de Chavannes 92400 Courbevoie ») */
  libelle: string;
  /** numéro + indice + voie (« 54 Avenue Puvis de Chavannes ») */
  voie: string;
  numero: string | null;
  indice: string | null;
  codePostal: string;
  insee: string | null;
  commune: string;
  lat: number | null;
  lon: number | null;
  /** Lambert-93, quand la source les donne */
  x: number | null;
  y: number | null;
  score: number | null;
}

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Le numéro et son indice, lus dans `housenumber` (« 12 », « 12bis », « 4 ter »). PUR. */
export function numeroEtIndice(housenumber: string): { numero: string | null; indice: string | null } {
  const m = /^(\d+)\s*([\p{L}]+)?$/u.exec(housenumber.trim());
  if (m === null) return { numero: housenumber.trim() || null, indice: null };
  return { numero: m[1], indice: m[2] ? m[2].toLocaleLowerCase('fr-FR') : null };
}

/** L'adresse de recherche (« q », la limite, l'auto-complétion). PUR. */
export const urlRechercheAdresse = (q: string, limite: number): string =>
  `${URL_API_ADRESSE}?q=${encodeURIComponent(q.trim())}&limit=${limite}&autocomplete=1`;

/** Une réponse de l'API Adresse → des adresses au FORMAT UNIQUE (une proposition sans libellé est écartée). PUR. */
export function adressesDepuisReponse(reponse: unknown): AdresseOfficielle[] {
  const features = (reponse as { features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown[] } }> } | null)?.features ?? [];
  const out: AdresseOfficielle[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const libelle = texte(p.label);
    const voie = texte(p.name);
    if (libelle === '' && voie === '') continue;
    const { numero, indice } = numeroEtIndice(texte(p.housenumber));
    const c = f.geometry?.coordinates ?? [];
    out.push({ banId: texte(p.id) || null, libelle: libelle || voie, voie: voie || libelle, numero: texte(p.housenumber) ? numero : null, indice: texte(p.housenumber) ? indice : null,
      codePostal: texte(p.postcode), insee: texte(p.citycode) || null, commune: texte(p.city), lon: nombre(c[0]), lat: nombre(c[1]), x: nombre(p.x), y: nombre(p.y), score: nombre(p.score) });
  }
  return out;
}

/** Une adresse d'une autre source (rue, code postal, commune seulement) au format unique. PUR. */
export const adresseSansIdentifiant = (a: { voie: string; codePostal?: string | null; commune?: string | null; libelle?: string; x?: number | null; y?: number | null }): AdresseOfficielle => ({
  banId: null, libelle: a.libelle ?? [a.voie, [a.codePostal ?? '', a.commune ?? ''].filter(Boolean).join(' ')].filter(Boolean).join(' '), voie: a.voie,
  numero: /^\d+/.exec(a.voie)?.[0] ?? null, indice: null, codePostal: a.codePostal ?? '', insee: null, commune: a.commune ?? '', lat: null, lon: null, x: a.x ?? null, y: a.y ?? null, score: null });

/** L'ADRESSE À L'ÉCRAN : la fonction d'affichage unique (« 54 avenue Puvis de Chavannes, 92400 Courbevoie »). PUR. */
export function libelleAdresse(a: Pick<AdresseOfficielle, 'voie' | 'codePostal' | 'commune' | 'libelle'>): string {
  if (a.voie.trim() === '' || (a.codePostal.trim() === '' && a.commune.trim() === '')) return adresseAffichee(a.libelle || a.voie);
  return adresseAffichee(`${a.voie}, ${[a.codePostal, a.commune].filter((x) => x.trim() !== '').join(' ')}`);
}

/** Une adresse CHOISIE, en une seule chaîne de texte, telle que la BAN l'écrit (« 3 Rue des Lilas, 75019 Paris ») — pour les champs qui gardent un texte. PUR. */
export const adresseDuChoix = (a: Pick<AdresseOfficielle, 'voie' | 'codePostal' | 'commune'>): string =>
  [a.voie, [a.codePostal, a.commune].filter((x) => x.trim() !== '').join(' ')].filter((x) => x.trim() !== '').join(', ');

export type ChercherAdresses = (q: string, signal: AbortSignal) => Promise<AdresseOfficielle[]>;

/**
 * 🔴 LA SOURCE UNIQUE : l'API Adresse, depuis le navigateur. `repli` (l'administration) : appelé si l'API échoue, ne répond pas en `delaiApi` ms ou rend
 * une erreur — jamais pour une liste VIDE (l'API couvre toute la France ; un extrait local ne trouvera pas mieux).
 */
export function sourceBan(o: { limite: number; repli?: ChercherAdresses; delaiApi?: number; appel?: typeof fetch } = { limite: 7 }): ChercherAdresses {
  return async (q, signal) => {
    const appel = o.appel ?? fetch;
    const minuteur = new AbortController();
    const fin = () => minuteur.abort();
    signal.addEventListener('abort', fin);
    const t = o.repli !== undefined ? setTimeout(fin, o.delaiApi ?? 3000) : null;
    try {
      const r = await appel(urlRechercheAdresse(q, o.limite), { signal: minuteur.signal });
      if (r.ok === false) throw new Error(`API Adresse : ${r.status}`);
      return adressesDepuisReponse(await r.json());
    } catch (e) {
      if (signal.aborted || o.repli === undefined) throw e;
      return o.repli(q, signal);
    } finally {
      if (t !== null) clearTimeout(t);
      signal.removeEventListener('abort', fin);
    }
  };
}
