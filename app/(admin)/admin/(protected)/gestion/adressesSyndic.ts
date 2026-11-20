'use client';

import { adresseSansIdentifiant, sourceBan, type AdresseOfficielle, type ChercherAdresses } from '../../../../components/adresse/adresseOfficielle';
import type { AdresseBan } from '../../../../lib/gestion/syndics';

/**
 * ══ 🔴 LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — LES ADRESSES PROPOSÉES À LA FICHE SYNDIC ══════════════════
 *
 * ARNO : « Branche le champ “Adresse (rue)” sur la MÊME source que la saisie d'adresse des fiches existantes (l'API
 * adresse.data.gouv.fr déjà utilisée dans l'application — pas de nouveau service). Garde la BAN locale en repli si
 * l'API ne répond pas. » Même chose pour « + Ajouter une copropriété » hors portefeuille.
 *
 *   ① l'API Adresse, depuis le navigateur — la SOURCE UNIQUE (`sourceBan`, Arno, 20/11/2026, lot 7a) ;
 *   ② si elle échoue, ne répond pas en 3 s, ou rend une erreur : la BAN LOCALE (`/api/admin/gestion/syndics/adresses`,
 *      137 communes d'Île-de-France, code postal déduit).
 *
 * ⚠️ UNE LISTE VIDE DE L'API N'EST PAS UNE PANNE : on ne bascule PAS sur la BAN locale pour autant — l'API couvre
 * toute la France, et si elle ne trouve rien, la base locale (qui en est un extrait) ne trouvera pas mieux.
 */
const DELAI_API_MS = 3000;

/** ② la BAN locale, au format unique (sans identifiant : elle ne le rend pas). */
const banLocale: ChercherAdresses = async (q, signal) => {
  const r = await fetch(`/api/admin/gestion/syndics/adresses?q=${encodeURIComponent(q)}`, { cache: 'no-store', signal });
  const j = (await r.json()) as { adresses?: AdresseBan[] };
  return (j.adresses ?? []).map((a) => adresseSansIdentifiant({ voie: a.libelle, codePostal: a.codePostal, commune: a.commune }));
};

/** LA SOURCE DES ADRESSES DU SYNDIC : l'API Adresse, la BAN locale en repli. */
export const sourceAdressesSyndic: ChercherAdresses = sourceBan({ limite: 7, repli: banLocale, delaiApi: DELAI_API_MS });

export type { AdresseOfficielle };
