/**
 * N3-E — DÉCISION PURE des PARCELLES cadastrales d'un permis. Aucune base, aucune IA. Le CERFA fait foi par DEUX sources de même
 * autorité : le bloc T2 (préfixe + section + numéro + superficie PAR parcelle, 3 emplacements) ET, N10-G, l'ANNEXE 4 (fiche
 * complémentaire : réf. « DH18 » en un seul champ « T5Z?3 » + superficie « T5Z?4 », slots lettrés NON plafonnés). SITADEL corrobore
 * (sec/num_cadastre1..3, plafonné à 3) — d'où une 4e parcelle du Cerfa légitimement absente de Sitadel (absence ATTENDUE, pas un doute).
 * L'IDU est calculé via la COMMUNE CADASTRALE (arrondissement dérivé du numéro de dossier — garde `communeCadastrale`) ; s'il ne peut
 * pas être tranché, la parcelle reste connue mais NON rattachée (idu null + motif), jamais une parcelle fausse.
 *
 * Confiance : `confirmee` si la parcelle du Cerfa est corroborée par Sitadel (même section/numéro), sinon `a_verifier` + réserve.
 * Écarts SIGNALÉS (jamais masqués) : parcelle Cerfa absente de Sitadel, parcelle Sitadel absente du Cerfa, Cerfa plus de parcelles
 * que les 3 emplacements Sitadel.
 */
import type { ChampCerfa } from './decisionCerfa';
import { versIdu, communeCadastrale } from '../sitadel/referenceCadastrale';

export interface ParcelleSitadel { section: string; numero: string }
export interface ParcelleDecision {
  prefixe: string; section: string; numero: string; superficieDeclareeM2: number | null;
  role: 'origine';
  idu: string | null;                                  // null si commune cadastrale indéterminée
  confiance: 'confirmee' | 'a_verifier';
  reserve: string | null;                              // motif de commune indéterminée OU « absente de Sitadel »
  provenance: string;                                  // ex. « Cerfa T2S/T2N/T2T (parcelle 1) »
}
export interface DecisionParcelles {
  parcelles: ParcelleDecision[];
  ecarts: string[];                                    // divergences Cerfa ⟷ Sitadel, à afficher
  motif: string | null;                                // renseigné si AUCUNE parcelle (ni Cerfa ni Sitadel)
}

const SLOTS = [
  { rang: 1, prefixe: 'T2F_prefixe', section: 'T2S_section', numero: 'T2N_numero', superficie: 'T2T_superficie' },
  { rang: 2, prefixe: 'T2FP2_prefixe', section: 'T2SP2_section', numero: 'T2NP2_numero', superficie: 'T2TP2_superficie' },
  { rang: 3, prefixe: 'T2FP3_prefixe', section: 'T2SP3_section', numero: 'T2NP3_numero', superficie: 'T2TP3_superficie' },
] as const;

const nombre = (s: string): number | null => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : null; };
/** Clé de COMPARAISON section/numéro : majuscules + zéros de tête retirés (Cerfa « DZ 09 » ⟷ Sitadel « DZ 9 »). */
const cle = (section: string, numero: string) => `${section.trim().toUpperCase()}#${numero.trim().replace(/^0+/, '') || '0'}`;

/** Décide les parcelles. `champsCerfa` = AcroForm du Cerfa ; `sitadel` = parcelles Sitadel ; `numDau`/`codeInsee` pour l'IDU. */
export function decisionParcelles(champsCerfa: ChampCerfa[], sitadel: ParcelleSitadel[], numDau: string, codeInsee: string): DecisionParcelles {
  const idx = new Map<string, string>();
  for (const c of champsCerfa) if (!idx.has(c.nom)) idx.set(c.nom, (c.valeur ?? '').trim());
  const val = (nom: string) => (idx.get(nom) ?? '').trim();

  const comm = communeCadastrale(numDau, codeInsee); // {insee} | {motif}
  const inseeCad = 'insee' in comm ? comm.insee : null;
  const motifCommune = 'motif' in comm ? comm.motif : null;

  const sitadelCles = new Set(sitadel.filter((p) => p.section && p.numero).map((p) => cle(p.section, p.numero)));
  const cerfaCles = new Set<string>();
  const parcelles: ParcelleDecision[] = [];
  const ecarts: string[] = [];

  // 1) parcelles du CERFA (source de vérité) — un slot est « rempli » s'il a section + numéro.
  for (const s of SLOTS) {
    const section = val(s.section), numero = val(s.numero);
    if (!section || !numero) continue;
    const prefixe = val(s.prefixe) || '000';
    const superficie = nombre(val(s.superficie));
    const k = cle(section, numero);
    cerfaCles.add(k);
    const corrobore = sitadelCles.has(k);
    const idu = inseeCad ? versIdu({ insee: inseeCad, prefixe, section, numero }) : null;
    const reserves: string[] = [];
    if (!inseeCad && motifCommune) reserves.push(motifCommune);
    if (!corrobore) reserves.push('parcelle présente au Cerfa mais absente des références Sitadel');
    parcelles.push({
      prefixe, section, numero, superficieDeclareeM2: superficie, role: 'origine', idu,
      confiance: corrobore && inseeCad ? 'confirmee' : 'a_verifier',
      reserve: reserves.length ? reserves.join(' ; ') : null,
      provenance: `Cerfa ${s.section}/${s.numero}/${s.superficie} (parcelle ${s.rang})`,
    });
  }

  // 1bis) parcelles de l'ANNEXE 4 du Cerfa (fiche complémentaire des parcelles) — MÊME AUTORITÉ que le bloc T2 (le Cerfa fait foi).
  //   Forme mesurée : la référence tient dans UN SEUL champ « T5Z?3 » (« DH18 » = section + numéro collés, sans préfixe) ; la
  //   superficie est dans son jumeau « T5Z?4 ». Slots lettrés (A, B, C, …) NON plafonnés → on énumère tous les « T5Z?3 » présents.
  //   ⚠️ Noms calés sur cette annexe (comme T2 l'est sur le 13409*15) : d'autres millésimes pourront demander à les étendre.
  const slotsAnnexe = [...idx.keys()].filter((n) => /^T5Z[A-Z]3$/.test(n)).sort();
  for (const refNom of slotsAnnexe) {
    const m = /^\s*([A-Za-z]+)\s*(\d+)\s*$/.exec(val(refNom));
    if (!m) continue;                                  // référence illisible → ignorée (rien d'inventé)
    const section = m[1].toUpperCase(), numero = m[2];
    const k = cle(section, numero);
    if (cerfaCles.has(k)) continue;                    // déjà donnée par le bloc T2 → pas de doublon (dédup section/numéro)
    cerfaCles.add(k);
    const supNom = refNom.replace(/3$/, '4');
    const superficie = nombre(val(supNom));
    const corrobore = sitadelCles.has(k);
    const idu = inseeCad ? versIdu({ insee: inseeCad, prefixe: '000', section, numero }) : null;
    const reserves: string[] = [];
    if (!inseeCad && motifCommune) reserves.push(motifCommune);
    // Non corroborée par Sitadel : quand Sitadel est SATURÉ (3 parcelles), l'absence d'une 4e est ATTENDUE — la parcelle est
    // déclarée au Cerfa, son existence n'est PAS en doute (source Sitadel tronquée), ne pas la lire comme une contradiction.
    if (!corrobore) reserves.push(
      sitadelCles.size >= 3
        ? 'parcelle déclarée à l’annexe 4 du Cerfa ; non reprise par Sitadel, plafonné à 3 parcelles — absence attendue, aucune incidence sur son existence (à corroborer géométriquement, pas à vérifier)'
        : 'parcelle déclarée à l’annexe 4 du Cerfa mais absente des références Sitadel',
    );
    parcelles.push({
      prefixe: '000', section, numero, superficieDeclareeM2: superficie, role: 'origine', idu,
      confiance: corrobore && inseeCad ? 'confirmee' : 'a_verifier',
      reserve: reserves.length ? reserves.join(' ; ') : null,
      provenance: `Cerfa annexe 4 (${refNom}/${supNom})`,
    });
  }

  // 2) parcelles Sitadel non retrouvées au Cerfa → ÉCART (Cerfa muet ? repli : on les écrit quand même, en a_verifier).
  for (const p of sitadel) {
    if (!p.section || !p.numero) continue;
    const k = cle(p.section, p.numero);
    if (cerfaCles.has(k)) continue;
    if (parcelles.length > 0) ecarts.push(`Sitadel déclare ${p.section} ${p.numero}, absente du bloc parcellaire du Cerfa`);
    const idu = inseeCad ? versIdu({ insee: inseeCad, prefixe: '000', section: p.section, numero: p.numero }) : null;
    parcelles.push({
      prefixe: '000', section: p.section.trim().toUpperCase(), numero: p.numero.trim(), superficieDeclareeM2: null, role: 'origine', idu,
      confiance: 'a_verifier',
      reserve: [motifCommune, 'référence Sitadel non corroborée par le Cerfa'].filter(Boolean).join(' ; ') || null,
      provenance: 'Sitadel (sec/num_cadastre)',
    });
  }

  // 3) plafond Sitadel : le Cerfa peut en donner plus que les 3 emplacements Sitadel → signaler la troncature.
  if (cerfaCles.size > sitadelCles.size && sitadelCles.size >= 3) {
    ecarts.push(`le Cerfa déclare ${cerfaCles.size} parcelles ; Sitadel est plafonné à ${sitadelCles.size} (sec/num_cadastre1..3)`);
  }

  return { parcelles, ecarts, motif: parcelles.length === 0 ? 'aucune parcelle déclarée (bloc T2 du Cerfa vide et sec/num_cadastre Sitadel vides)' : null };
}
