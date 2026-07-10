"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

// `citycode` = code INSEE de la commune (fourni par la BAN) — capté pour l'analytique M2 (grain commune,
// jamais la position exacte). Optionnel : une suggestion sans citycode reste valide.
export type SuggestionAdresse = { label: string; lat: number; lon: number; citycode?: string };

// Champ d'adresse avec autocomplétion BAN (api-adresse.data.gouv.fr), AUTONOME et sans aucune
// logique carte. Le débounce (300 ms), l'appel réseau et la liste de suggestions sont internes.
// L'intégrateur reçoit la saisie via onChange et la sélection via onSelect (où il place ses
// éventuels effets de bord — recentrage carte, anti-reverse, etc.).
type Props = {
  value: string;
  onChange: (val: string) => void;
  onSelect: (s: SuggestionAdresse) => void;
  placeholder?: string;
};

export function AdresseAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchSuggestions(q: string) {
    type BanFeature = { properties?: { label?: string; citycode?: string }; geometry?: { coordinates?: number[] } };
    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&autocomplete=1`,
      );
      const data: { features?: BanFeature[] } = await res.json();
      const items: SuggestionAdresse[] = [];
      for (const f of data.features ?? []) {
        const label = f.properties?.label ?? "";
        const lon = f.geometry?.coordinates?.[0];
        const lat = f.geometry?.coordinates?.[1];
        if (label !== "" && typeof lat === "number" && typeof lon === "number") {
          items.push({ label, lat, lon, citycode: f.properties?.citycode });
        }
      }
      setSuggestions(items);
    } catch {
      setSuggestions([]);
    }
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v); // champ contrôlé côté intégrateur
    if (timerRef.current) clearTimeout(timerRef.current);
    if (v.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timerRef.current = setTimeout(() => fetchSuggestions(v), 300); // débounce ~300 ms
  }

  function handleSelect(s: SuggestionAdresse) {
    setSuggestions([]); // vide la liste locale ; aucun effet de bord carte ici
    onSelect(s);
  }

  // Purge du timer de débounce au démontage.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <input
        value={value}
        onChange={handleChange}
        className="w-full rounded-xl border border-svv-line bg-white p-3 text-base text-svv-ink placeholder:text-svv-muted focus:border-svv-red focus:outline-none"
        placeholder={placeholder}
      />
      {suggestions.length > 0 && (
        <ul className="mt-2 mb-3 overflow-hidden rounded-xl border border-svv-line bg-white shadow-sm divide-y divide-svv-line">
          {suggestions.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full px-3 py-2 text-left text-sm text-svv-ink active:bg-svv-field"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default AdresseAutocomplete;
