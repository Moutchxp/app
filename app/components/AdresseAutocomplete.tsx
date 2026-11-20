"use client";

import { ChampAdresseOfficielle } from "./adresse/ChampAdresseOfficielle";
import { sourceBan, type AdresseOfficielle } from "./adresse/adresseOfficielle";

// `citycode` = code INSEE de la commune (fourni par la BAN) — capté pour l'analytique M2 (grain commune,
// jamais la position exacte). Optionnel : une suggestion sans citycode reste valide.
export type SuggestionAdresse = { label: string; lat: number; lon: number; citycode?: string };

// Champ d'adresse avec autocomplétion BAN, AUTONOME et sans aucune logique carte. L'intégrateur reçoit la saisie
// via onChange et la sélection via onSelect (où il place ses éventuels effets de bord — recentrage carte, anti-reverse, etc.).
// 🔴🔴 (Arno, 20/11/2026, lot 7a : « une seule auto-complétion, une seule écriture partout ») un EMBALLAGE du composant
// unique (`adresse/ChampAdresseOfficielle`) : la source, la liste et l'affichage sont les siens ; ici ne restent
// l'habillage du site public, le délai (300 ms), les 5 résultats, la liste qui reste ouverte, et la suggestion rendue
// telle qu'avant (libellé de la BAN, coordonnées, INSEE). Seules les propositions avec coordonnées sont gardées (la carte en dépend).
type Props = {
  value: string;
  onChange: (val: string) => void;
  onSelect: (s: SuggestionAdresse) => void;
  placeholder?: string;
};

const RESULTATS = 5;
const avecCoordonnees = sourceBan({ limite: RESULTATS });
const chercher = async (q: string, signal: AbortSignal): Promise<AdresseOfficielle[]> =>
  (await avecCoordonnees(q, signal)).filter((a) => a.libelle !== "" && a.lat !== null && a.lon !== null);

export function AdresseAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  return (
    <ChampAdresseOfficielle
      valeur={value}
      onChange={onChange}
      exemple={placeholder}
      limite={RESULTATS}
      delai={300}
      fermerAuDepart={false}
      chercher={chercher}
      listeId="adresse-propositions"
      prefixeOption="adresse-proposition"
      onChoisir={(a) => onSelect({ label: a.libelle, lat: a.lat ?? 0, lon: a.lon ?? 0, ...(a.insee ? { citycode: a.insee } : {}) })}
      apparence={{
        enveloppe: { className: "contents" },
        champ: { className: "w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none" },
        liste: { className: "mt-2 mb-3 overflow-hidden rounded-xl border border-svv-line bg-white shadow-sm divide-y divide-svv-line" },
        proposition: { className: "w-full px-3 py-2 text-left text-sm text-svv-ink active:bg-svv-field", viseeClassName: "bg-svv-field" },
      }}
    />
  );
}

export default AdresseAutocomplete;
