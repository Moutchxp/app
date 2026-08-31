import type { EnvoiHistorique } from './historiqueEnvois';
import type { EtatPartiel } from '../permis/dossierPartiel';
import { dateButoirPartiel } from '../permis/dossierPartiel';
import { echeanceDe } from './echeance';
import { ordinalRelance } from './decompteButoir';
import type { ReglagesCascade } from './cascadeRelance';
import type { ReglagesCascadePartielle } from './cascadePartielle';

/**
 * LOT 18 — FRISE « Suivi et actions » = le PARCOURS COMPLET : les étapes FAITES et les étapes À VENIR (avec leurs dates prévisionnelles),
 * pour voir d'un coup d'œil OÙ ON EN EST. Cœur PUR (aucune I/O) : `projeterParcours` DÉRIVE toute la chaîne de l'état courant à CHAQUE
 * rendu (jamais figée en base) — dates futures recalculées dès que la mairie répond, qu'une relance part, que le butoir bouge.
 *
 * 🔴 FAITS vs ÉCHÉANCES (LOT 15) : `quand:'passe'` = étape FRANCHIE (envoi réel, horodaté « à HHhMM ») ; `quand:'avenir'` = étape
 *   PROJETÉE (date prévisionnelle seule, marquée « à venir »). Le basculement programmée→effectuée se fait sur l'ENVOI RÉEL (envois /
 *   journal), jamais sur la date atteinte (point 8).
 * 🔴 BIFURCATION (points 6/7) : dès qu'une demande de pièces complémentaires est faite (suspension), le futur ORDINAIRE non survenu
 *   DISPARAÎT, remplacé par le futur PARTIEL (jamais deux futurs concurrents). Les étapes ordinaires DÉJÀ réalisées restent (histoire).
 * 🔴 POSITION COURANTE (point 4) : `courant` marque la DERNIÈRE étape franchie (liseré), une seule à la fois.
 */
export type QuandFrise = 'passe' | 'avenir';
export interface EvenementFrise {
  le: string;              // ISO — date (± heure) de l'étape franchie ou projetée
  quand: QuandFrise;
  libelle: string;         // nature de l'étape, en gras à l'affichage
  detail: string | null;   // précision grise sous la ligne (destinataire, type de relance…) ou null
  courant?: boolean;       // LOT 18 : POSITION COURANTE (dernière étape franchie) → liseré rouge vertical. Une seule dans la frise.
  bifurcation?: boolean;   // LOT 18 : CHANGEMENT DE PROCESS (« Relance pièces complémentaires ») → badge rouge cerclé.
}

/** Réglages de projection — tous issus de config_veille (PILOTAGE SANS CODE, jamais de valeur en dur). */
export interface ReglagesParcours {
  ordinaire: ReglagesCascade;            // rappelJoursAvant (J-10), avisJoursAvant (J-3), saisineDelaiJours (J+4)
  partiel: ReglagesCascadePartielle;     // relanceJours (J+10), nbRelancesAvantAnnonce (2), annonceJours (+10), saisineJours (+4)
  cadaPartielMois: number;               // CASC-2 : butoir = partiel_le + mois + jours (autorité de la saisine partielle)
  cadaPartielJours: number;
}

/** État COURANT d'où le parcours est dérivé — tout DÉJÀ chargé (LOT 13/17), aucune lecture ici. */
export interface EntreeParcours {
  envoyeLe: string | null;               // envoi initial (base de l'échéance ordinaire) ; null = brouillon → parcours vide
  envois: readonly EnvoiHistorique[];    // envois RÉELS (LOT 13) : initiale / relances ordinaires (grade) / relances partielles → dates des faits
  suspension: EtatPartiel | null;        // bifurcation : la 1re réclamation de pièces (partiel_le) → régime PARTIEL
  saisineCadaEnvoyeeLe: string | null;   // dépôt CADA réellement parti (→ « Dépôt de saisine CADA » effectué)
  annonceCadaEnvoyeeLe: string | null;   // annonce CADA réellement partie (→ « Information saisine CADA » effectuée, régime partiel)
  reglages: ReglagesParcours;
}

const MS_JOUR = 86_400_000;
const iso = (d: string): string => new Date(d).toISOString();                                   // NORMALISE tout format (pg `::text` ou ISO) en ISO comparable
const ajoute = (isoDate: string, jours: number): string => new Date(new Date(isoDate).getTime() + jours * MS_JOUR).toISOString();
const detailOrdinaire = (grade: string): string => (grade === 'Rappel' ? 'rappel courtois' : grade === 'Avis d’échéance' ? 'avis d’échéance' : grade.toLowerCase());

/** Une étape ordinaire (rappel/avis) : effectuée si l'envoi de ce grade existe (date réelle), sinon programmée (date projetée). */
function etapeOrdinaire(ordRealise: Map<string, string>, grade: string, dateProjetee: string, detail: string): EvenementFrise {
  const reel = ordRealise.get(grade);
  return reel
    ? { le: reel, quand: 'passe', libelle: 'Relance effectuée', detail }
    : { le: dateProjetee, quand: 'avenir', libelle: 'Relance programmée', detail };
}

/**
 * Projette le parcours COMPLET (faits + étapes à venir datées). PUR. Régime ordinaire OU partiel (bifurcation). Marque la position
 * courante. Les libellés suivent le vocabulaire arrêté (points 8-11) : relance programmée/effectuée · Information saisine CADA · Dépôt
 * de saisine CADA · Relance pièces complémentaires (bifurcation). Vide si la demande n'est pas encore envoyée.
 */
export function projeterParcours(e: EntreeParcours): EvenementFrise[] {
  if (!e.envoyeLe) return [];
  const evs: EvenementFrise[] = [];

  // Étape 1 — DEMANDE INITIALE (toujours un fait).
  const envoiInitial = e.envois.find((x) => x.nature === 'initiale');
  evs.push({ le: iso(e.envoyeLe), quand: 'passe', libelle: 'Demande initiale de communication', detail: envoiInitial?.destinataire ? `à ${envoiInitial.destinataire}` : null });

  // Faits RÉELS indexés : relances ordinaires par GRADE, relances partielles par ordre chronologique (= ordre de rang).
  const ordRealise = new Map<string, string>();
  for (const x of e.envois) if (x.nature === 'relance_ordinaire' && x.grade) ordRealise.set(x.grade, iso(x.le));
  const partielsRealises = e.envois.filter((x) => x.nature === 'relance_partielle').map((x) => iso(x.le)).sort();

  if (e.suspension) {
    // ── RÉGIME PARTIEL (après bifurcation) ──
    const J = iso(e.suspension.le);
    // Relances ordinaires réalisées AVANT la bifurcation → font partie de l'HISTOIRE (les non survenues, elles, disparaissent).
    for (const [grade, le] of ordRealise) if (le < J) evs.push({ le, quand: 'passe', libelle: 'Relance effectuée', detail: detailOrdinaire(grade) });
    // BIFURCATION — « Relance pièces complémentaires » (fait, badge rouge cerclé).
    const origine = e.suspension.origine === 'declaree' ? 'relance de complément déclarée hors outil' : 'complément de pièces réclamé par l’outil';
    evs.push({ le: J, quand: 'passe', libelle: 'Relance pièces complémentaires', detail: origine, bifurcation: true });
    // Relances partielles (programmées → effectuées sur envoi réel).
    const rp = e.reglages.partiel;
    for (let k = 1; k <= rp.nbRelancesAvantAnnonce; k++) {
      const reel = partielsRealises[k - 1];
      evs.push(reel
        ? { le: reel, quand: 'passe', libelle: 'Relance effectuée', detail: `${ordinalRelance(k)} relance` }
        : { le: ajoute(J, k * rp.relanceJours), quand: 'avenir', libelle: 'Relance programmée', detail: `${ordinalRelance(k)} relance` });
    }
    // INFORMATION SAISINE CADA (l'annonce) — effectuée sur envoi réel de l'annonce, sinon programmée.
    const dateAnnonce = ajoute(J, rp.nbRelancesAvantAnnonce * rp.relanceJours + rp.annonceJours);
    evs.push(e.annonceCadaEnvoyeeLe
      ? { le: iso(e.annonceCadaEnvoyeeLe), quand: 'passe', libelle: 'Information saisine CADA', detail: null }
      : { le: dateAnnonce, quand: 'avenir', libelle: 'Information saisine CADA', detail: null });
    // DÉPÔT DE SAISINE CADA — date la PLUS TARDIVE de (annonce + saisineJours) et du butoir CASC-2 (autorité) ; effectué sur dépôt réel.
    const butoir = dateButoirPartiel(new Date(iso(e.suspension.le)), e.reglages.cadaPartielMois, e.reglages.cadaPartielJours).toISOString();
    const dateCascade = ajoute(dateAnnonce, rp.saisineJours);
    const dateDepot = dateCascade >= butoir ? dateCascade : butoir;
    evs.push(e.saisineCadaEnvoyeeLe
      ? { le: iso(e.saisineCadaEnvoyeeLe), quand: 'passe', libelle: 'Dépôt de saisine CADA', detail: null }
      : { le: dateDepot, quand: 'avenir', libelle: 'Dépôt de saisine CADA', detail: null });
  } else {
    // ── RÉGIME ORDINAIRE ──
    const ech = echeanceDe(new Date(iso(e.envoyeLe))).toISOString();
    const o = e.reglages.ordinaire;
    evs.push(etapeOrdinaire(ordRealise, 'Rappel', ajoute(ech, -o.rappelJoursAvant), 'rappel courtois'));       // J-10
    evs.push(etapeOrdinaire(ordRealise, 'Avis d’échéance', ajoute(ech, -o.avisJoursAvant), 'avis d’échéance')); // J-3
    // INFORMATION SAISINE CADA — la relance « saisine » (celle qui annonce le recours) ; effectuée si partie, sinon programmée à l'échéance.
    const saisineReel = ordRealise.get('Saisine');
    evs.push(saisineReel
      ? { le: saisineReel, quand: 'passe', libelle: 'Information saisine CADA', detail: null }
      : { le: ech, quand: 'avenir', libelle: 'Information saisine CADA', detail: null });
    // DÉPÔT DE SAISINE CADA — échéance + saisineDelaiJours ; effectué sur dépôt réel.
    evs.push(e.saisineCadaEnvoyeeLe
      ? { le: iso(e.saisineCadaEnvoyeeLe), quand: 'passe', libelle: 'Dépôt de saisine CADA', detail: null }
      : { le: ajoute(ech, o.saisineDelaiJours), quand: 'avenir', libelle: 'Dépôt de saisine CADA', detail: null });
  }

  evs.sort((a, b) => (a.le < b.le ? -1 : a.le > b.le ? 1 : 0));
  // POSITION COURANTE = la DERNIÈRE étape franchie (dernier 'passe' dans l'ordre). Une seule (point 5).
  let idxCourant = -1;
  evs.forEach((x, i) => { if (x.quand === 'passe') idxCourant = i; });
  if (idxCourant >= 0) evs[idxCourant].courant = true;
  return evs;
}

/**
 * Repli des faits ANCIENS (LOT 15) : parmi les faits (passé), l'ancre (demande initiale) et les 3 plus récents restent visibles, le
 * milieu part derrière un repli ; les étapes À VENIR restent TOUJOURS visibles (jamais repliées : c'est la suite du parcours). PUR.
 */
export function partitionnerFrise(evenements: readonly EvenementFrise[]): { passeVisible: EvenementFrise[]; passeReplie: EvenementFrise[]; avenir: EvenementFrise[] } {
  const passe = evenements.filter((e) => e.quand === 'passe');
  const avenir = evenements.filter((e) => e.quand === 'avenir');
  if (passe.length <= 4) return { passeVisible: passe, passeReplie: [], avenir };
  return { passeVisible: [passe[0], ...passe.slice(-3)], passeReplie: passe.slice(1, passe.length - 3), avenir };
}
