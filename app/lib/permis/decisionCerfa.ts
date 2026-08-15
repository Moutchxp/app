/**
 * N7-D — DÉCISION PURE du mapping « champs AcroForm du Cerfa → colonnes déclarées (migration 106) ». Prend la table des champs
 * lus (N7-B `champsFormulaire`, identité déjà filtrée) + la surface Sitadel du dossier, rend PAR CHAMP CIBLE soit une valeur
 * (avec confiance/réserve/provenance), soit un MOTIF de non-écriture. Aucune base, aucune écriture, aucune décision d'attribution.
 *
 * 🔒 RÈGLES ARBITRÉES (porteur) — appliquées à la lettre :
 * - nb_places_stationnement ← S1M_stationnementapres (état APRÈS travaux). ÉCRIT MÊME À 0 (zéro déclaré ≠ absence). a_verifier.
 * - surface_plancher_m2 ← W2SF1. == surf_creee Sitadel → confirmee ; != → a_verifier + réserve citant les deux ; surf_creee
 *   absent → a_verifier sans réserve.
 * - nature_projet ← DÉRIVÉE du tableau des surfaces par destination (« W2·F1 », sauf « W2S » = Somme/total) : UNE destination à
 *   surface > 0 → cette destination ; PLUSIEURS → 'mixte'. Jamais de dominante, jamais de pondération. a_verifier. Le détail par
 *   destination figure dans l'extrait journalisé (pas de colonne dédiée).
 * - adresse_terrain ← T2Q_numero + ' ' + T2V_voie + ', ' + T2L_localite. Recoupée avec l'adresse terrain de Sitadel (comparaison
 *   NORMALISÉE : casse/accents/espaces/abréviations de voie — sert à COMPARER, jamais à réécrire) : == → confirmee ; != →
 *   a_verifier + réserve citant les deux libellés ; Sitadel absent → a_verifier sans réserve. Un manquant → on écrit ce qu'on a.
 * - nb_logements → NON écrit (aucun champ logement ; l'absence ne vaut pas zéro).
 * - permis_corps_batiment.adresse → JAMAIS écrite (attribution par corps non résolue, N5-F).
 *
 * ⚠️ Codes destinations (« W2B »=bureaux, « W2C »=commerce, « W2H »=habitation, « W2S »=Somme/total à EXCLURE) calés sur le Cerfa
 * PC 13409*15 ; un code inconnu compte comme une destination présente mais mappe vers 'autre'. À étendre pour d'autres millésimes.
 */
import type { Confiance } from './decisionSommet';
import type { ChampGlobalDeclare } from './caracteristiquesRepo';

/** Un champ AcroForm lu (avec la pièce d'origine — le Cerfa). */
export interface ChampCerfa { nom: string; valeur: string; page: number | null; pieceNom: string }
/** Provenance d'une valeur écrite : la pièce (Cerfa), la page, le NOM EXACT du/des champ(s), et l'extrait brut. */
export interface ProvenanceCerfa { pieceNom: string; page: number | null; champNom: string; extrait: string }

export interface DecisionCerfaChamp {
  colonne: string;                 // colonne SQL cible
  cle?: ChampGlobalDeclare;        // clé logique d'écriture (permis-level) ; absente pour un non_ecrit ou le corps
  portee: 'permis' | 'corps';
  statut: 'ecrit' | 'non_ecrit';
  valeur?: string | number;        // présent si 'ecrit'
  confiance?: Confiance;
  reserve?: string | null;
  provenance?: ProvenanceCerfa;
  motif?: string;                  // présent si 'non_ecrit'
}
export interface DecisionCerfa { champs: DecisionCerfaChamp[] }

// Codes destinations (lettre après « W2 ») → nature. « S » = Somme/total, exclu.
const NATURE_PAR_LETTRE: Record<string, string> = { B: 'bureaux', C: 'commerce', H: 'habitation' };
const nombre = (s: string): number => Number(String(s).replace(',', '.'));

// Abréviations de voie courantes (pour COMPARER deux adresses, jamais pour réécrire la valeur stockée).
const ABREV_VOIE: Record<string, string> = {
  av: 'avenue', ave: 'avenue', bd: 'boulevard', bld: 'boulevard', boul: 'boulevard', imp: 'impasse',
  all: 'allee', pl: 'place', rte: 'route', che: 'chemin', chem: 'chemin', sq: 'square', pas: 'passage', crs: 'cours',
};
/** Normalise une adresse pour la COMPARAISON : minuscules, sans accents, ponctuation → espace, abréviations de voie développées. */
function normaliserAdresse(s: string): string {
  const base = s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return base.split(' ').filter(Boolean).map((t) => ABREV_VOIE[t] ?? t).join(' ');
}

function prov(c: ChampCerfa, champNom: string, extrait: string): ProvenanceCerfa {
  return { pieceNom: c.pieceNom, page: c.page, champNom, extrait };
}

/** Destinations à surface > 0 dans le tableau « W2·F1 » (hors total « W2S »), dédoublonnées par lettre, ordre déterministe. */
function destinationsPresentes(champs: ChampCerfa[]): { lettre: string; valeur: number; nom: string; source: ChampCerfa }[] {
  const parLettre = new Map<string, { lettre: string; valeur: number; nom: string; source: ChampCerfa }>();
  for (const c of champs) {
    const m = /^W2([A-Z])F1$/.exec(c.nom);
    if (!m || m[1] === 'S') continue; // S = Somme/total, pas une destination
    const v = nombre(c.valeur);
    if (Number.isFinite(v) && v > 0 && !parLettre.has(m[1])) parLettre.set(m[1], { lettre: m[1], valeur: v, nom: c.nom, source: c });
  }
  return [...parLettre.values()].sort((a, b) => a.lettre.localeCompare(b.lettre));
}

/** Applique les règles de mapping. `surfCreee` = surf_creee de Sitadel (m²) ; `adresseSitadel` = adresse terrain Sitadel — pour recouper. */
export function decisionCerfa(champs: ChampCerfa[], surfCreee: number | null, adresseSitadel: string | null = null): DecisionCerfa {
  const idx = new Map<string, ChampCerfa>();
  for (const c of champs) if (!idx.has(c.nom)) idx.set(c.nom, c); // 1re occurrence
  const out: DecisionCerfaChamp[] = [];

  // 1) nb_places_stationnement ← S1M_stationnementapres (écrit même à 0)
  const stat = idx.get('S1M_stationnementapres');
  if (stat && Number.isFinite(nombre(stat.valeur))) {
    out.push({ colonne: 'nb_places_stationnement', cle: 'nbPlacesStationnement', portee: 'permis', statut: 'ecrit', valeur: nombre(stat.valeur), confiance: 'a_verifier', reserve: null, provenance: prov(stat, stat.nom, `${stat.nom} = ${stat.valeur}`) });
  } else {
    out.push({ colonne: 'nb_places_stationnement', portee: 'permis', statut: 'non_ecrit', motif: 'champ S1M_stationnementapres absent du Cerfa' });
  }

  // 2) surface_plancher_m2 ← W2SF1, recoupé avec Sitadel
  const surf = idx.get('W2SF1');
  if (surf && Number.isFinite(nombre(surf.valeur))) {
    const v = nombre(surf.valeur);
    let confiance: Confiance = 'a_verifier';
    let reserve: string | null = null;
    if (surfCreee !== null) {
      if (nombre(String(surfCreee)) === v) confiance = 'confirmee';
      else reserve = `W2SF1=${v} m² vs Sitadel surf_creee=${nombre(String(surfCreee))} m²`;
    }
    out.push({ colonne: 'surface_plancher_m2', cle: 'surfacePlancherM2', portee: 'permis', statut: 'ecrit', valeur: v, confiance, reserve, provenance: prov(surf, surf.nom, `${surf.nom} = ${surf.valeur}`) });
  } else {
    out.push({ colonne: 'surface_plancher_m2', portee: 'permis', statut: 'non_ecrit', motif: 'champ W2SF1 absent du Cerfa' });
  }

  // 3) nature_projet ← destinations
  const dests = destinationsPresentes(champs);
  if (dests.length === 0) {
    out.push({ colonne: 'nature_projet', portee: 'permis', statut: 'non_ecrit', motif: 'aucune surface par destination (W2·F1) renseignée' });
  } else {
    const nature = dests.length === 1 ? (NATURE_PAR_LETTRE[dests[0].lettre] ?? 'autre') : 'mixte';
    const detail = dests.map((d) => `${d.nom}=${d.valeur}`).join(' · ');
    out.push({ colonne: 'nature_projet', cle: 'natureProjet', portee: 'permis', statut: 'ecrit', valeur: nature, confiance: 'a_verifier', reserve: null, provenance: { pieceNom: dests[0].source.pieceNom, page: dests[0].source.page, champNom: 'W2·F1 (destinations)', extrait: detail } });
  }

  // 4) adresse_terrain ← T2Q_numero + T2V_voie + T2L_localite
  const num = idx.get('T2Q_numero'), voie = idx.get('T2V_voie'), loc = idx.get('T2L_localite');
  if (!num && !voie && !loc) {
    out.push({ colonne: 'adresse_terrain', portee: 'permis', statut: 'non_ecrit', motif: 'aucun champ d’adresse terrain (T2Q_numero / T2V_voie / T2L_localite)' });
  } else {
    const rue = [num?.valeur, voie?.valeur].filter(Boolean).join(' ');
    const adresse = [rue, loc?.valeur].filter(Boolean).join(', ');
    const sources = [num, voie, loc].filter((f): f is ChampCerfa => Boolean(f));
    const extrait = sources.map((f) => `${f.nom}=${f.valeur}`).join(' · ');
    // Recoupement avec Sitadel (comparaison normalisée), même logique que la surface.
    let confiance: Confiance = 'a_verifier';
    let reserve: string | null = null;
    const sit = (adresseSitadel ?? '').trim();
    if (sit !== '') {
      if (normaliserAdresse(adresse) === normaliserAdresse(sit)) confiance = 'confirmee';
      else reserve = `Cerfa « ${adresse} » vs Sitadel « ${sit} »`;
    }
    out.push({ colonne: 'adresse_terrain', cle: 'adresseTerrain', portee: 'permis', statut: 'ecrit', valeur: adresse, confiance, reserve, provenance: { pieceNom: sources[0].pieceNom, page: sources[0].page, champNom: 'T2Q_numero + T2V_voie + T2L_localite', extrait } });
  }

  // 5) nb_logements → NON écrit (l'absence de champ ne vaut pas zéro)
  out.push({ colonne: 'nb_logements', portee: 'permis', statut: 'non_ecrit', motif: 'aucun champ logement renseigné dans le Cerfa ; l’absence de champ ne vaut pas zéro logement' });

  // 6) permis_corps_batiment.adresse → JAMAIS écrite
  out.push({ colonne: 'adresse', portee: 'corps', statut: 'non_ecrit', motif: 'attribution par corps non résolue (N5-F) ; colonne en attente' });

  return { champs: out };
}
