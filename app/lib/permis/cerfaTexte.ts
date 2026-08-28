/**
 * LECT-1 (C) — REPLI TEXTE du Cerfa quand l'AcroForm est VIDE. Beaucoup de mairies versent le Cerfa SCANNÉ (0 champ AcroForm) :
 * `decisionCerfa` n'a alors rien à mapper. Ici on lit dans le TEXTE ce qui est ROBUSTE et NON AMBIGU — jamais un chiffre au jugé.
 * PUR (aucune I/O), testable. AUCUN appel externe (la vision Mistral reste un geste délibéré à part).
 *
 * ⚠️ Choix de conception PROUVÉ sur 531 (à redire au porteur) :
 * - `nbLogementsTexte` : MODE corroboré (valeur la plus fréquente, ≥ 2 occurrences, STRICTEMENT majoritaire). L'aplatissement PDF
 *   coupe parfois les chiffres (« 2 1 logements » → capte « 1 »), mais la valeur RÉELLE « 21 logements » se répète (énoncé, titre,
 *   désignation) et l'emporte largement. Ex æquo ou une seule occurrence → null (on n'écrit pas dans le doute).
 * - `surfacePlancherTexte` : EXIGE l'étiquette « surface de plancher » suivie d'un nombre, et EXCLUT les phrases de SEUIL
 *   réglementaire (« n'excède pas 150 m² », « supérieure à 2500 m² »). ⚠️ Sur 531 le seul chiffre est « surface créée : 586 m² »
 *   dans « (niveau de sous-sol …) » = surface créée du SOUS-SOL, PAS la surface de plancher → NON captée (abstention correcte :
 *   écrire 586 en surface_plancher serait un FAUX). La surface de plancher du projet n'est pas énoncée en toutes lettres dans 531.
 */

/** MODE corroboré du nombre de logements dans un texte, ou null (une seule occurrence / ex æquo / rien → on n'écrit pas). */
export function nbLogementsTexte(texte: string): { valeur: number; occurrences: number } | null {
  const compte = new Map<number, number>();
  for (const m of texte.matchAll(/(?<!\d)(\d{1,4})\s{0,2}logements?\b/gi)) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0 && v < 2000) compte.set(v, (compte.get(v) ?? 0) + 1); // < 2000 : garde-fou anti-artefact
  }
  if (compte.size === 0) return null;
  const tri = [...compte.entries()].sort((a, b) => b[1] - a[1]); // décroissant par fréquence
  if (tri[0][1] < 2) return null;                                // pas corroboré (une seule occurrence)
  if (tri[1] && tri[1][1] === tri[0][1]) return null;            // ex æquo → ambigu, on ne devine pas
  return { valeur: tri[0][0], occurrences: tri[0][1] };
}

const CONTEXTE_SEUIL = /n['’]excède pas|sup[ée]rieures?\s+à|inf[ée]rieures?\s+à|seuil|maximum|au moins|au-?del[àa]|excède|n['’]exc[èe]de/i;

/** Surface de PLANCHER énoncée (m²) dans un texte, hors phrases de SEUIL réglementaire, ou null. Conservateur par construction. */
export function surfacePlancherTexte(texte: string): { valeur: number; extrait: string } | null {
  for (const m of texte.matchAll(/surface\s+de\s+plancher[^.]{0,40}?(\d{1,6}(?:[.,]\d{1,2})?)\s*m²/gi)) {
    const i = m.index ?? 0;
    const contexte = texte.slice(Math.max(0, i - 45), i + m[0].length + 12); // fenêtre autour du match
    if (CONTEXTE_SEUIL.test(contexte)) continue;                             // phrase de seuil → pas une valeur du projet
    const v = Number(m[1].replace(',', '.'));
    if (Number.isFinite(v) && v > 0) return { valeur: v, extrait: m[0].replace(/\s+/g, ' ').trim() };
  }
  return null;
}

/**
 * PROV-3 (3) — SOUS-DESTINATIONS détectées dans un texte (CANDIDATES, jamais cochées d'office). Signaux FORTS et non ambigus, mappés
 * vers la liste FERMÉE du CHECK (libellés EXACTS). Aujourd'hui : « Logement » (habitation) — le cas de 531 (« résidence sociale de 21
 * logements », « logement locatif social », « habitation », « APPT 101 »). Rend l'extrait déclencheur pour la traçabilité.
 * ⚠️ Extensible : d'autres sous-destinations (Bureau, Artisanat et commerce de détail…) à ajouter au fil des dossiers, avec leurs
 *   signaux propres. Aujourd'hui volontairement CONSERVATEUR : ne propose que ce qui est franc.
 */
//   Deux niveaux de signal : FORT (résidence sociale, logement locatif social, « N logements » : sans ambiguïté) et FAIBLE (bare
//   « logement » / « habitation » / « APPT » : peut apparaître dans un contexte annexe, ex. « part logement de la redevance »). Le
//   niveau FORT prime pour choisir la SOURCE (la page la plus fiable) ; `fort` est remonté pour le classement dans decisionCerfa.
const SIGNAUX_SOUS_DESTINATION: { sousDestination: string; fort: RegExp; faible: RegExp }[] = [
  { sousDestination: 'Logement',
    fort: /r[ée]sidence\s+(?:sociale|[ée]tudiante|senior|autonomie|jeunes|pour\s+personnes)|logement\s+locatif\s+social|\bLLS\b|\d+\s+logements?/i,
    faible: /\blogements?\b|\bhabitation\b|\bappartements?\b|\bappt\b/i },
];
export function destinationsTexte(texte: string): { sousDestination: string; extrait: string; fort: boolean }[] {
  const out: { sousDestination: string; extrait: string; fort: boolean }[] = [];
  for (const s of SIGNAUX_SOUS_DESTINATION) {
    const mf = s.fort.exec(texte);
    const m = mf ?? s.faible.exec(texte);
    if (!m) continue;
    const i = m.index;
    const extrait = texte.slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, ' ').trim();
    out.push({ sousDestination: s.sousDestination, extrait, fort: mf !== null });
  }
  return out;
}
