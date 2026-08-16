/**
 * FUS-2 — MOTEUR PUR de détection du rattachement d'un permis à sa parcelle et à ses polygones de bâtiment FUTURS.
 *
 * ⚠️ PUR : AUCUNE I/O (pas de DB, pas de PostGIS, pas de `server-only`). Les mesures géométriques (recouvrement de surface,
 * coïncidence de bordure, polygones nouveaux/modifiés) sont calculées EN AMONT par l'adaptateur impur `rattachementRepo`
 * (PostGIS) et passées ici DÉJÀ MESURÉES. Ce module ne fait que la DÉCISION : régime, critères, verdict, motif, preuves. Il
 * ne touche NI le moteur de verdict SVAV NI le golden — c'est un moteur de VEILLE, séparé.
 *
 * LES TROIS CRITÈRES (leur CUMUL fait le lien) :
 *   1. SURFACE  — une parcelle candidate recouvre l'empreinte au-delà d'un seuil (jamais une égalité : voies/trottoirs prélevés).
 *   2. BORDURE  — une part du périmètre de la candidate coïncide avec le contour de l'empreinte (mesure définie par l'adaptateur,
 *                 rapportée au périmètre CANDIDAT → ∈ [0,1], lisible).
 *   3. BÂTI     — apparition ou modification d'un polygone dans l'empreinte (vs snapshot FUS-1b). FACULTATIF (rénovation = néant).
 *
 * DEUX RÉGIMES :
 *   · AVEC fusion  — les parcelles d'origine ont disparu, une nouvelle apparaît → critères 1+2, le 3 en renfort.
 *   · SANS fusion  — construction neuve sur parcelle unique, la surface ne bouge PAS → le critère 3 est le SEUL signal
 *                    (ne PAS traiter ce cas comme une absence de détection).
 *
 * TROIS ISSUES :
 *   · RATTACHEMENT_AUTOMATIQUE — un seul polygone nouveau/modifié (quel que soit le nb de bâtiments DÉJÀ présents ; aucun étage
 *       BD TOPO requis) ; OU plusieurs corps d'altitudes égales à la marge (ordre d'affectation indifférent) ; OU (bonus rare)
 *       étages BD TOPO présents, tous distincts et concordants avec les corps ; OU fusion nette (surface+bordure) sans bâti encore.
 *   · ARBITRAGE_DEMANDE — plusieurs polygones sans discriminant fiable ; OU cardinalités différentes (corps ≠ polygones) ; OU
 *       plusieurs corps d'altitudes distinctes au-delà de la marge sans discriminant.
 *   · RIEN — aucun critère franchi.
 */

// ── Seuils (unités-métier, déjà converties par le lecteur de config) ─────────
export interface SeuilsRattachement {
  seuilSurface: number;    // ratio ∈ [0,1] (défaut 0,80)
  seuilBordure: number;    // ratio ∈ [0,1] (défaut 0,60)
  margeAltitudeM: number;  // mètres (défaut 0,10)
}

// ── Entrées (faits déjà mesurés) ─────────────────────────────────────────────
export interface CorpsPermis {
  repere: string | null;
  altitudeSommetNgf: number | null; // NGF absolu, si connu du permis
  nbEtages: number | null;          // étages déclarés au permis, si connus
}

export type EtatPolygone = 'nouveau' | 'modifie';
export interface PolygoneEmpreinte {
  cleabs: string | null;
  etat: EtatPolygone;               // apparu depuis le snapshot, ou géométrie modifiée
  nbEtages: number | null;          // étages BD TOPO du polygone (souvent null — ~0 % de remplissage sur le bâti récent)
  altitudeMaxToit: number | null;   // altitude toit BD TOPO (souvent null) — preuve seulement
}

export interface ParcelleCandidate {
  idu: string | null;
  ratioSurface: number;             // ST_Area(candidate ∩ empreinte) / ST_Area(empreinte) ∈ [0,1]
  partBordure: number;              // part du périmètre candidat à ≤ τ du contour de l'empreinte ∈ [0,1]
}

export interface EntreesRattachement {
  empreinteComplete: boolean;               // FUS-1 : l'empreinte attendue est figée et complète (sinon détection impossible)
  parcellesOrigineToujoursLa: boolean;      // true → régime SANS fusion ; false → AVEC fusion (parcelles d'origine disparues)
  parcelleCandidate: ParcelleCandidate | null; // meilleure parcelle actuelle recouvrant l'empreinte (régime avec fusion) ; null si aucune
  polygones: PolygoneEmpreinte[];           // bâtiments nouveaux/modifiés dans l'empreinte (critère 3)
  corpsPermis: CorpsPermis[];               // corps de bâtiment déclarés au permis (cardinalité + altitudes)
  seuils: SeuilsRattachement;
}

// ── Sortie ───────────────────────────────────────────────────────────────────
export type VerdictRattachement = 'RATTACHEMENT_AUTOMATIQUE' | 'ARBITRAGE_DEMANDE' | 'RIEN';
export type RegimeRattachement = 'avec_fusion' | 'sans_fusion' | 'indetermine';

export interface CritereSurface { applicable: boolean; ratio: number | null; seuil: number; franchi: boolean }
export interface CritereBordure { applicable: boolean; part: number | null; seuil: number; franchi: boolean }
export interface CritereBati { nbNouveauxOuModifies: number; franchi: boolean }

export interface ResultatRattachement {
  verdict: VerdictRattachement;
  regime: RegimeRattachement;
  motif: string;
  criteres: { surface: CritereSurface; bordure: CritereBordure; bati: CritereBati };
  preuves: string[];
}

// Formatage LISIBLE d'un ratio en pourcent — AFFICHAGE SEUL (les preuves ne réalimentent aucun calcul, cf. CLAUDE.md §5).
const pct = (x: number): string => `${(x * 100).toFixed(1).replace(/\.0$/, '')} %`;

/** Toutes les altitudes de sommet des corps sont connues ET tiennent dans la marge (max − min ≤ marge). false si une est absente. */
function altitudesEgalesALaMarge(corps: CorpsPermis[], margeM: number): boolean {
  const alts = corps.map((c) => c.altitudeSommetNgf);
  if (alts.length === 0 || alts.some((a) => a === null || a === undefined)) return false;
  const vals = alts as number[];
  return Math.max(...vals) - Math.min(...vals) <= margeM;
}

/**
 * Bonus RARE : les étages BD TOPO permettent d'affecter chaque corps à son polygone SANS ambiguïté. Vrai seulement si TOUS les
 * polygones ET tous les corps portent un nb d'étages, tous DISTINCTS de leur côté, et les deux multiensembles CONCORDENT.
 * (Remplissage réel ~0,1 % sur le bâti récent → ce chemin est anecdotique, jamais le chemin nominal.)
 */
function etagesDiscriminants(corps: CorpsPermis[], polys: PolygoneEmpreinte[]): boolean {
  if (corps.length < 2 || corps.length !== polys.length) return false;
  const eCorps = corps.map((c) => c.nbEtages);
  const ePolys = polys.map((p) => p.nbEtages);
  if (eCorps.some((e) => e === null) || ePolys.some((e) => e === null)) return false;
  const c = (eCorps as number[]).slice().sort((a, b) => a - b);
  const p = (ePolys as number[]).slice().sort((a, b) => a - b);
  if (new Set(c).size !== c.length || new Set(p).size !== p.length) return false; // « tous différents » des deux côtés
  return c.every((v, i) => v === p[i]);                                            // concordance (même multiensemble)
}

/** Décision PURE du rattachement. Aucune I/O, aucun aléa : mêmes entrées → même sortie. */
export function detecterRattachement(e: EntreesRattachement): ResultatRattachement {
  const { seuils, corpsPermis } = e;
  const nbPolys = e.polygones.length;
  const nbCorps = corpsPermis.length;
  const bati: CritereBati = { nbNouveauxOuModifies: nbPolys, franchi: nbPolys >= 1 };

  // Empreinte incomplète → aucune assiette de référence figée → détection impossible.
  if (!e.empreinteComplete) {
    return {
      verdict: 'RIEN', regime: 'indetermine',
      motif: 'empreinte incomplète : rattachement indéterminé (aucune assiette de référence figée)',
      criteres: {
        surface: { applicable: false, ratio: null, seuil: seuils.seuilSurface, franchi: false },
        bordure: { applicable: false, part: null, seuil: seuils.seuilBordure, franchi: false },
        bati,
      },
      preuves: [],
    };
  }

  const regime: RegimeRattachement = e.parcellesOrigineToujoursLa ? 'sans_fusion' : 'avec_fusion';
  const cand = e.parcelleCandidate;

  // Critères SURFACE/BORDURE : applicables SEULEMENT avec fusion (sans fusion, la surface ne bouge pas du tout).
  const surface: CritereSurface = regime === 'avec_fusion'
    ? { applicable: true, ratio: cand ? cand.ratioSurface : null, seuil: seuils.seuilSurface, franchi: cand ? cand.ratioSurface >= seuils.seuilSurface : false }
    : { applicable: false, ratio: null, seuil: seuils.seuilSurface, franchi: false };
  const bordure: CritereBordure = regime === 'avec_fusion'
    ? { applicable: true, part: cand ? cand.partBordure : null, seuil: seuils.seuilBordure, franchi: cand ? cand.partBordure >= seuils.seuilBordure : false }
    : { applicable: false, part: null, seuil: seuils.seuilBordure, franchi: false };

  const criteres = { surface, bordure, bati };
  const preuves: string[] = [];

  const lienParcelle = surface.franchi && bordure.franchi; // cumul 1+2 (avec fusion)
  const lienBati = bati.franchi;                            // critère 3

  // Aucun critère franchi → RIEN (motif distinct selon le régime : « en attente », pas une erreur).
  if (!lienParcelle && !lienBati) {
    const motif = regime === 'sans_fusion'
      ? 'sans fusion cadastrale et aucun bâti nouveau ou modifié dans l’empreinte : aucun signal (en attente)'
      : 'aucun critère franchi : parcelle candidate non concluante (surface/bordure) et aucun bâti nouveau';
    return { verdict: 'RIEN', regime, motif, criteres, preuves };
  }

  // Preuves du lien parcellaire (avec fusion).
  if (regime === 'avec_fusion' && cand) {
    if (surface.franchi) preuves.push(`surface : ${pct(cand.ratioSurface)} de l’empreinte recouverte par la parcelle candidate${cand.idu ? ` ${cand.idu}` : ''} (seuil ${pct(seuils.seuilSurface)})`);
    if (bordure.franchi) preuves.push(`bordure : ${pct(cand.partBordure)} du périmètre candidat épouse l’empreinte (seuil ${pct(seuils.seuilBordure)})`);
  }

  // ── Résolution par le BÂTI ────────────────────────────────────────────────
  if (nbPolys === 0) {
    // Lien uniquement PARCELLAIRE (fusion nette, surface+bordure) ; pas encore de bâti dans l'empreinte.
    preuves.push('aucun bâti nouveau ou modifié dans l’empreinte (rattachement par la fusion parcellaire seule)');
    return {
      verdict: 'RATTACHEMENT_AUTOMATIQUE', regime,
      motif: 'fusion cadastrale concluante (surface + bordure) ; aucun nouveau bâti encore observé',
      criteres, preuves,
    };
  }

  if (nbPolys === 1) {
    const p = e.polygones[0];
    preuves.push(`bâti : 1 polygone ${p.etat} dans l’empreinte${p.cleabs ? ` (${p.cleabs})` : ''}`);
    if (nbCorps >= 2) {
      return {
        verdict: 'ARBITRAGE_DEMANDE', regime,
        motif: `cardinalité : ${nbCorps} corps déclarés au permis mais 1 seul polygone dans l’empreinte`,
        criteres, preuves,
      };
    }
    return {
      verdict: 'RATTACHEMENT_AUTOMATIQUE', regime,
      motif: 'un seul polygone nouveau ou modifié dans l’empreinte (aucun étage BD TOPO requis)',
      criteres, preuves,
    };
  }

  // nbPolys ≥ 2
  preuves.push(`bâti : ${nbPolys} polygones nouveaux ou modifiés dans l’empreinte`);
  if (nbCorps !== nbPolys) {
    return {
      verdict: 'ARBITRAGE_DEMANDE', regime,
      motif: `cardinalité : ${nbCorps} corps déclarés au permis pour ${nbPolys} polygones dans l’empreinte`,
      criteres, preuves,
    };
  }

  // nbCorps === nbPolys ≥ 2 : il faut affecter chaque corps à un polygone.
  if (altitudesEgalesALaMarge(corpsPermis, seuils.margeAltitudeM)) {
    preuves.push(`altitudes des corps identiques à la marge près (${seuils.margeAltitudeM} m) → ordre d’affectation indifférent`);
    return {
      verdict: 'RATTACHEMENT_AUTOMATIQUE', regime,
      motif: 'plusieurs corps d’altitudes identiques à la marge près : affectation corps→polygone indifférente',
      criteres, preuves,
    };
  }
  if (etagesDiscriminants(corpsPermis, e.polygones)) {
    preuves.push('étages BD TOPO présents, tous distincts et concordants avec les corps → affectation déterministe (bonus rare)');
    return {
      verdict: 'RATTACHEMENT_AUTOMATIQUE', regime,
      motif: 'affectation corps→polygone par les étages BD TOPO (présents, distincts, concordants)',
      criteres, preuves,
    };
  }
  return {
    verdict: 'ARBITRAGE_DEMANDE', regime,
    motif: 'plusieurs corps d’altitudes distinctes (au-delà de la marge) sans discriminant fiable sur les polygones (étages BD TOPO absents)',
    criteres, preuves,
  };
}
