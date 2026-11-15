/**
 * ══ 🔴🔴 Arno (15/11/2026) — LA COPIE LOCALE DU COMPTE RENDU, DANS LE TÉLÉPHONE (IndexedDB) ══════════════════════════════════════════════
 * Tant que le serveur n'a pas confirmé, rien ne vit seulement en mémoire :
 *   · le BROUILLON (le contenu du formulaire, et s'il est déjà enregistré sur le serveur) ;
 *   · chaque PHOTO et chaque PRISE vocale pas encore déposée (le fichier lui-même), renvoyée automatiquement au retour du réseau.
 * Ce stockage appartient à l'appareil (rien ne part ailleurs). Sans IndexedDB (navigation privée, ancien navigateur, épreuves) : une mémoire
 * de secours le temps de la page. Ne lève jamais. Navigateur seulement, sans import.
 */
export interface BrouillonLocal { contenu: unknown; modifieLe: string; synchronise: boolean }
export interface EnvoiEnAttente {
  /** la pré-visite (occupations), puis la clé de la photo ou de la prise dans le formulaire */
  cle: string; sorte: 'photo' | 'prise'; blob: Blob; type: string;
  /** une prise : son fichier vocal (clé, nom) et sa durée */
  fichierCle?: string; fichierNom?: string; dureeS?: number; creeLe: string;
  /** une photo : sa légende déjà saisie (gardée avec elle tant qu'elle n'est pas déposée) */
  legende?: string;
}

const BASE = 'svav-compte-rendu'; const VERSION = 1;
const memoire = { brouillons: new Map<string, BrouillonLocal>(), envois: new Map<string, EnvoiEnAttente & { groupe: string }>() };

function ouvrir(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') { ok(null); return; }
      const r = indexedDB.open(BASE, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('brouillons')) db.createObjectStore('brouillons');
        if (!db.objectStoreNames.contains('envois')) db.createObjectStore('envois').createIndex('groupe', 'groupe');
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch { ok(null); }
  });
}

async function operer<T>(magasin: 'brouillons' | 'envois', mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest | null, secours: () => T): Promise<T> {
  const db = await ouvrir();
  if (db === null) return secours();
  return new Promise<T>((ok) => {
    try {
      const t = db.transaction(magasin, mode);
      const req = f(t.objectStore(magasin));
      let v: T | undefined;
      if (req) req.onsuccess = () => { v = req.result as T; };
      t.oncomplete = () => { db.close(); ok(v as T); };
      t.onerror = () => { db.close(); ok(secours()); };
      t.onabort = () => { db.close(); ok(secours()); };
    } catch { db.close(); ok(secours()); }
  });
}

/** La clé d'une pré-visite : ses occupations, triées. PUR. */
export const groupeDe = (occupationIds: readonly number[]): string => [...occupationIds].sort((a, b) => a - b).join(',');

export const lireBrouillonLocal = (g: string): Promise<BrouillonLocal | null> =>
  operer<BrouillonLocal | null>('brouillons', 'readonly', (s) => s.get(g), () => memoire.brouillons.get(g) ?? null).then((x) => x ?? null);
export const ecrireBrouillonLocal = (g: string, b: BrouillonLocal): Promise<void> =>
  operer<unknown>('brouillons', 'readwrite', (s) => s.put(b, g), () => { memoire.brouillons.set(g, b); return undefined; }).then(() => undefined);
export const effacerBrouillonLocal = (g: string): Promise<void> =>
  operer<unknown>('brouillons', 'readwrite', (s) => s.delete(g), () => { memoire.brouillons.delete(g); return undefined; }).then(() => undefined);

const cleEnvoi = (g: string, cle: string): string => `${g}|${cle}`;
/* 🔴 Le FICHIER est rangé en octets (ArrayBuffer) : WebKit refuse de ranger un Blob dans IndexedDB dans certains contextes (l'écriture échoue
   en silence) ; les octets passent partout. Le Blob est recréé à la lecture. */
type EnvoiRange = Omit<EnvoiEnAttente, 'blob'> & { groupe: string; octets: ArrayBuffer };
const versBlob = (e: EnvoiRange): EnvoiEnAttente => { const { octets, groupe: _g, ...reste } = e; return { ...reste, blob: new Blob([octets], { type: e.type }) }; };
export async function mettreEnAttente(g: string, e: EnvoiEnAttente): Promise<void> {
  let octets: ArrayBuffer;
  try { octets = await e.blob.arrayBuffer(); } catch { memoire.envois.set(cleEnvoi(g, e.cle), { ...e, groupe: g }); return; }
  const { blob: _b, ...reste } = e;
  const range: EnvoiRange = { ...reste, groupe: g, octets };
  await operer<unknown>('envois', 'readwrite', (s) => s.put(range, cleEnvoi(g, e.cle)), () => { memoire.envois.set(cleEnvoi(g, e.cle), { ...e, groupe: g }); return undefined; });
}
export async function retirerAttente(g: string, cle: string): Promise<void> {
  memoire.envois.delete(cleEnvoi(g, cle));
  await operer<unknown>('envois', 'readwrite', (s) => s.delete(cleEnvoi(g, cle)), () => undefined);
}
export async function listerAttente(g: string): Promise<EnvoiEnAttente[]> {
  const ranges = await operer<(EnvoiRange | (EnvoiEnAttente & { groupe: string }))[]>('envois', 'readonly', (s) => s.index('groupe').getAll(g), () => []);
  const xs: EnvoiEnAttente[] = (ranges ?? []).map((e) => ('octets' in e ? versBlob(e) : e));
  for (const e of memoire.envois.values()) if (e.groupe === g && !xs.some((x) => x.cle === e.cle)) xs.push(e);
  return xs.sort((a, b) => a.creeLe.localeCompare(b.creeLe));
}
export async function viderAttente(g: string): Promise<void> {
  for (const e of await listerAttente(g)) await retirerAttente(g, e.cle);
}

/** Une erreur de RÉSEAU (le serveur n'a pas répondu) : la pièce est gardée et renvoyée plus tard ; un refus du serveur, non. PUR. */
export const erreurReseau = (r: { motif: string | null; cause?: string }): boolean => r.motif !== null && r.cause === 'technique';

/** Pour les épreuves : oublie la mémoire de secours. */
export function oublierMemoireLocale(): void { memoire.brouillons.clear(); memoire.envois.clear(); }
