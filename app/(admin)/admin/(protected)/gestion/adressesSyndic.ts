'use client';

import { adressesDepuisApi, urlApiAdresse, type AdresseBan } from '../../../../lib/gestion/syndics';

/**
 * ══ 🔴 LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — LES ADRESSES PROPOSÉES À LA FICHE SYNDIC ══════════════════
 *
 * ARNO : « Branche le champ “Adresse (rue)” sur la MÊME source que la saisie d'adresse des fiches existantes (l'API
 * adresse.data.gouv.fr déjà utilisée dans l'application — pas de nouveau service). Garde la BAN locale en repli si
 * l'API ne répond pas. » Même chose pour « + Ajouter une copropriété » hors portefeuille.
 *
 *   ① l'API Adresse, depuis le navigateur — exactement comme `ChampAdresseBan` (fiches de l'annuaire) ;
 *   ② si elle échoue, ne répond pas en 3 s, ou rend une erreur : la BAN LOCALE (`/api/admin/gestion/syndics/adresses`,
 *      137 communes d'Île-de-France, code postal déduit).
 *
 * ⚠️ UNE LISTE VIDE DE L'API N'EST PAS UNE PANNE : on ne bascule PAS sur la BAN locale pour autant — l'API couvre
 * toute la France, et si elle ne trouve rien, la base locale (qui en est un extrait) ne trouvera pas mieux.
 */
const DELAI_API_MS = 3000;

export type SourceAdresses = 'api' | 'ban_locale';

export async function chercherAdresses(q: string, signal?: AbortSignal):
Promise<{ adresses: AdresseBan[]; source: SourceAdresses }> {
  try {
    const minuteur = new AbortController();
    const t = setTimeout(() => minuteur.abort(), DELAI_API_MS);
    signal?.addEventListener('abort', () => minuteur.abort());
    try {
      const r = await fetch(urlApiAdresse(q), { signal: minuteur.signal });
      if (!r.ok) throw new Error(`API Adresse : ${r.status}`);
      return { adresses: adressesDepuisApi(await r.json()), source: 'api' };
    } finally {
      clearTimeout(t);
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    const r = await fetch(`/api/admin/gestion/syndics/adresses?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal });
    const j = (await r.json()) as { adresses?: AdresseBan[] };
    return { adresses: j.adresses ?? [], source: 'ban_locale' };
  }
}
