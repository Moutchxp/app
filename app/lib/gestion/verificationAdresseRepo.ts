import { normaliserTexte } from './annuaire';
import { pointsBan } from './parcelleRepo';
import { adresseDepuisBan } from './saisieFiche';
import { adresseImmeuble, cleImmeuble, type AdresseSaisie } from './syndics';

/**
 * ══ 🔴🔴 UNE ADRESSE AJOUTÉE À UNE COPROPRIÉTÉ EST UNE ADRESSE VÉRIFIÉE (Arno, 16/11/2026 — option C) ═══════════════════════════════════════
 *
 * Le « + » de l'encart « Adresses » de la fiche copropriété ne propose plus que les adresses de la MÊME PARCELLE, ou une autre adresse choisie
 * dans les suggestions de la Base Adresse Nationale (`ChampAdresseBan`) — plus de saisie à la main (doublons : accents, abréviations). Le serveur
 * ne croit pas l'écran sur parole : chaque NOUVELLE adresse est retrouvée, telle quelle, dans la Base Adresse Nationale.
 *   ① d'abord la copie LOCALE (`adresse_ban` : 75, 78, 91, 92, 93, 94, 95 — c'est elle qui donne aussi les adresses de la parcelle) ;
 *   ② introuvable localement (autre département, adresse récente, sans numéro) : vérification EXACTE auprès du service national en ligne — le
 *      même que les suggestions de `ChampAdresseBan` (api-adresse.data.gouv.fr). 🔒 SEULE L'ADRESSE part (rue, code postal, ville), jamais un
 *      nom, un identifiant ni quoi que ce soit d'autre ;
 *   ③ le service ne répond pas : REFUS clair, rien n'est enregistré.
 */
export const SERVICE_ADRESSE = 'https://api-adresse.data.gouv.fr/search/';
const DELAI_SERVICE_MS = 5000;

export type IssueVerification = { ok: true } | { ok: false; motif: string };

export const motifIntrouvable = (a: AdresseSaisie): string =>
  `L’adresse ${adresseImmeuble(a.libelle, a.codePostal || null, a.commune || null)} est introuvable dans la Base Adresse Nationale : choisissez-la parmi les adresses de la même parcelle ou dans les suggestions. Rien n’est enregistré.`;
export const motifServiceMuet = (a: AdresseSaisie): string =>
  `L’adresse ${adresseImmeuble(a.libelle, a.codePostal || null, a.commune || null)} n’a pas pu être vérifiée : le service national des adresses ne répond pas. Rien n’est enregistré ; réessayez dans un moment.`;

/** Une réponse du service national désigne-t-elle EXACTEMENT cette adresse (voie, et code postal ou ville) ? PUR. */
export function correspondExactement(a: AdresseSaisie, p: { label?: string; name?: string; postcode?: string; city?: string }): boolean {
  const b = adresseDepuisBan(p);
  if (b === null || cleImmeuble(b.voie) !== cleImmeuble(a.libelle)) return false;
  const cp = a.codePostal.trim();
  return cp !== '' ? b.codePostal === cp : normaliserTexte(b.commune) === normaliserTexte(a.commune);
}

/** La vérification exacte auprès du service national : vrai, faux, ou `null` s'il ne répond pas. Seule l'adresse est envoyée. */
async function trouveeEnLigne(a: AdresseSaisie, appel: typeof fetch = fetch): Promise<boolean | null> {
  const q = [a.libelle, a.codePostal, a.commune].map((x) => x.trim()).filter((x) => x !== '').join(' ');
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_SERVICE_MS);
  try {
    const r = await appel(`${SERVICE_ADRESSE}?q=${encodeURIComponent(q)}&limit=10`, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const d = (await r.json()) as { features?: { properties?: { label?: string; name?: string; postcode?: string; city?: string } }[] };
    return (d.features ?? []).some((f) => correspondExactement(a, f.properties ?? {}));
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * L'ÉTAT de chaque adresse : retrouvée (base locale, puis service national), introuvable, ou non vérifiable (service muet). LECTURE SEULE.
 * 🔴 (Arno, 17/11/2026, « Adresses uniformisées », lot 2) — la même vérification sert l'adresse d'une personne, avec ses propres mots.
 */
export async function etatsAdresses(adresses: readonly AdresseSaisie[], appel: typeof fetch = fetch): Promise<('trouvee' | 'introuvable' | 'muet')[]> {
  if (adresses.length === 0) return [];
  const { points } = await pointsBan(adresses);
  const locales = new Set(points.map((p) => p.cle));
  const etats: ('trouvee' | 'introuvable' | 'muet')[] = [];
  for (const a of adresses) {
    if (locales.has(cleImmeuble(a.libelle))) { etats.push('trouvee'); continue; }
    const enLigne = await trouveeEnLigne(a, appel);
    etats.push(enLigne === null ? 'muet' : enLigne ? 'trouvee' : 'introuvable');
    if (enLigne !== true) break;
  }
  return etats;
}

/** Chaque adresse doit être retrouvée (base locale, puis service national). Le premier refus est rendu. LECTURE SEULE. */
export async function verifierAdresses(adresses: readonly AdresseSaisie[], appel: typeof fetch = fetch): Promise<IssueVerification> {
  const etats = await etatsAdresses(adresses, appel);
  for (const [i, e] of etats.entries()) {
    if (e === 'muet') return { ok: false, motif: motifServiceMuet(adresses[i]) };
    if (e === 'introuvable') return { ok: false, motif: motifIntrouvable(adresses[i]) };
  }
  return { ok: true };
}
