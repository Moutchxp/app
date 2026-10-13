/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS — LES ADRESSES PROPOSÉES DANS À / Cc / Cci. PUR. ═══════════
 *
 * ARNO (11/10/2026) : « Dès qu'on clique dans À, Cc ou Cci, une liste s'ouvre sous le champ avec TOUTES les adresses
 * liées à ce bien, en groupes séparés par un intertitre, dans cet ordre :
 *   ① CLIENTS DE L'AGENCE : propriétaires, puis locataires. Pour chaque partie, son nom, puis ses adresses : d'abord
 *      l'e-mail propre du client, puis les e-mails rattachés à sa partie.
 *   ② IMMEUBLE : contacts du syndic de la copropriété (et e-mail générique du syndic), puis gardien et habitants.
 *   ③ AUTRES ADRESSES LIÉES AU BIEN : adresses vues dans les mails de ce bien sans aucune partie. »
 *
 * LE CODE COULEUR EST CELUI QUI EXISTE (`tonDuGroupe`, historiqueBien.ts) : propriétaire rouge, locataire vert,
 * ancien locataire violet ; le syndic garde son rose (jetons `--color-svv-syndic-*`), que le carnet de l'immeuble
 * partage faute d'en avoir un à lui ; le groupe ③ est gris neutre. L'e-mail PROPRE d'un client : pastille pleine ;
 * un e-mail RATTACHÉ à sa partie : pastille en contour, même couleur, et la mention grise « rattaché ».
 *
 * ⚠️ AUCUNE E/S, AUCUN IMPORT DE VALEUR : ce module est lu par le composeur (navigateur) et par la route (serveur).
 */
import type { Civilite } from './syndics';

/**
 * La famille de couleur d'une ligne. Les quatre premières sont les tons existants des parties.
 * LOT PASTILLE-TIERS-INDEPENDANT-DANS-LES-SUGGESTIONS — `independant` : le BLEU du « tiers indépendant » des PARTIES.
 */
export type TonSuggestion = 'proprietaire' | 'locataire' | 'ancien_locataire' | 'syndic' | 'immeuble' | 'independant' | 'neutre';

/**
 * ══ 🔴🔴 LOT PASTILLE-TIERS-INDEPENDANT-DANS-LES-SUGGESTIONS — LA COULEUR D'UNE FAMILLE DES PARTIES ═══════════════════
 * La famille où le bloc PARTIES range une adresse (`famillesDesParties`) → la couleur de sa pastille : propriétaire
 * rouge, locataire vert, ancien locataire violet, syndic & immeuble rose, tiers indépendant BLEU, non affecté (absent
 * de la carte) gris. Aucun second calcul : on ne fait que nommer la couleur de la famille déjà tranchée. PUR.
 */
export function tonDeLaFamille(famille: string | null | undefined): TonSuggestion {
  switch (famille) {
    case 'proprietaire': return 'proprietaire';
    case 'locataire': return 'locataire';
    case 'ancien_locataire': return 'ancien_locataire';
    case 'syndic_immeuble': return 'syndic';
    case 'independant': return 'independant';
    default: return 'neutre';
  }
}

export interface SuggestionAdresse {
  adresse: string;
  /** Le nom de la personne (ou du cabinet) ; `null` = inconnu, la ligne montre l'adresse seule. */
  nom: string | null;
  /** Le rôle, en clair : « Propriétaire », « Garant », « Gestionnaire », « Gardien », « vu dans 3 mails »… */
  role: string;
  ton: TonSuggestion;
  /** `true` = l'e-mail PROPRE de la personne (pastille pleine) ; `false` = un e-mail RATTACHÉ à sa partie (contour). */
  propre: boolean;
  /** Pour la formule d'appel : la civilité et le nom de famille, quand on les connaît. */
  civilite: Civilite | null;
  nomFamille: string | null;
  /**
   * 🔴 LOT DEUX-ECARTS-SUGGESTIONS (décision d'Arno, écart 748023a5) — le nom du CABINET d'un contact de syndic. Il
   * suit le rôle sur la ligne (« Syndic — Responsable de copropriété · TEST ARNAUD ») et la saisie le cherche. À part
   * de `role`, et c'est voulu : `role` nourrit aussi l'info-bulle des puces et les parties « Syndic & immeuble », qui
   * ne changent pas. Absent ⇒ la ligne est exactement celle d'avant.
   */
  cabinet?: string;
  /**
   * LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — le libellé du bien qui propose cette adresse, quand la liste en
   * regroupe PLUSIEURS : il sert d'intertitre gris dans chaque groupe. Absent ⇒ un seul bien, aucun intertitre.
   */
  bien?: string;
}

export type CleGroupeSuggestions = 'clients' | 'immeuble' | 'autres';

export interface GroupeSuggestions { cle: CleGroupeSuggestions; titre: string; lignes: SuggestionAdresse[] }

export const TITRES_SUGGESTIONS: Readonly<Record<CleGroupeSuggestions, string>> = {
  clients: 'Clients de l’agence',
  immeuble: 'Immeuble',
  autres: 'Autres adresses liées au bien',
};

const ORDRE: readonly CleGroupeSuggestions[] = ['clients', 'immeuble', 'autres'];

/** Minuscules, sans accents, espaces resserrés : « Léa DURAND » et « lea durand » se valent. PUR. */
export function sansAccents(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * LES TROIS GROUPES, DANS L'ORDRE, chaque adresse UNE SEULE FOIS (la première place gagne : un client n'est jamais
 * redit en « autre adresse »). Un groupe vide reste dans la liste — c'est l'écran qui ne le peint pas. PUR.
 */
export function rangerSuggestions(parGroupe: Partial<Record<CleGroupeSuggestions, readonly SuggestionAdresse[]>>): GroupeSuggestions[] {
  const vues = new Set<string>();
  return ORDRE.map((cle) => ({
    cle, titre: TITRES_SUGGESTIONS[cle],
    lignes: (parGroupe[cle] ?? []).filter((l) => {
      const a = l.adresse.trim().toLowerCase();
      if (a === '' || vues.has(a)) return false;
      vues.add(a);
      return true;
    }).map((l) => ({ ...l, adresse: l.adresse.trim().toLowerCase() })),
  }));
}

/** Le rôle tel que la ligne l'écrit : « rôle · cabinet » pour un contact de syndic, le rôle seul sinon. PUR. */
export function roleAffiche(l: Pick<SuggestionAdresse, 'role' | 'cabinet'>): string {
  const cabinet = (l.cabinet ?? '').trim();
  return cabinet === '' ? l.role : `${l.role} · ${cabinet}`;
}

/**
 * CE QUE LA LISTE MONTRE APRÈS LA FRAPPE. PUR.
 *   · le texte tapé filtre sur le NOM ou l'ADRESSE (et le rôle), sans tenir compte des accents ni de la casse ;
 *   · une adresse déjà présente dans À, Cc ou Cci n'est plus proposée ;
 *   · un groupe devenu vide disparaît (ses intertitres ne flottent pas au-dessus de rien).
 */
export function filtrerSuggestions(
  groupes: readonly GroupeSuggestions[], saisie: string, dejaPresentes: readonly string[],
): GroupeSuggestions[] {
  const q = sansAccents(saisie);
  const exclues = new Set(dejaPresentes.map((a) => a.trim().toLowerCase()));
  return groupes
    .map((g) => ({
      ...g,
      lignes: g.lignes.filter((l) => !exclues.has(l.adresse)
        && (q === '' || sansAccents(`${l.nom ?? ''} ${l.adresse} ${roleAffiche(l)}`).includes(q))),
    }))
    .filter((g) => g.lignes.length > 0);
}

/** Pour la formule d'appel : adresse → civilité et nom de famille connus. PUR. */
export function civilitesDesSuggestions(
  groupes: readonly GroupeSuggestions[],
): Record<string, { civilite: Civilite | null; nom: string | null }> {
  const out: Record<string, { civilite: Civilite | null; nom: string | null }> = {};
  for (const g of groupes) {
    for (const l of g.lignes) {
      // Une adresse sans personne derrière (e-mail générique, autre adresse) n'est pas un contact : pas d'entrée.
      if (l.ton === 'neutre' || (l.ton === 'syndic' && l.nomFamille === null && l.civilite === null)) continue;
      out[l.adresse] = { civilite: l.civilite, nom: l.nomFamille };
    }
  }
  return out;
}
