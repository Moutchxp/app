import type { EnvoiHistorique } from './historiqueEnvois';
import type { EtatPartiel } from '../permis/dossierPartiel';
import { dateButoirPartiel } from '../permis/dossierPartiel';
import { echeanceDe } from './echeance';
import { ordinalRelance } from './decompteButoir';
import type { ReglagesCascade } from './cascadeRelance';
import type { ReglagesCascadePartielle } from './cascadePartielle';
import { estParmiDernieres } from './rangDernieres'; // module PUR sans import DB (client-safe) — pas via destinatairesCommune (qui tire `pg`)

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
  multiAdresse: { active: boolean; nbDernieres: number }; // LOT 27 : Règle B — les nbDernieres DERNIÈRES étapes d'envoi partent à TOUTES les adresses (si active)
}

/** État COURANT d'où le parcours est dérivé — tout DÉJÀ chargé (LOT 13/17), aucune lecture ici. */
export interface EntreeParcours {
  envoyeLe: string | null;               // envoi initial (base de l'échéance ordinaire) ; null = brouillon → parcours vide
  envois: readonly EnvoiHistorique[];    // envois RÉELS (LOT 13) : initiale / relances ordinaires (grade) / relances partielles → dates des faits
  suspension: EtatPartiel | null;        // bifurcation : la 1re réclamation de pièces (partiel_le) → régime PARTIEL
  saisineCadaEnvoyeeLe: string | null;   // dépôt CADA réellement parti (→ « Dépôt de saisine CADA » effectué)
  annonceCadaEnvoyeeLe: string | null;   // annonce CADA réellement partie (→ « Information saisine CADA » effectuée, régime partiel)
  destinataireCourant: string | null;    // LOT 19 : destinataire ACTUEL de la demande (dest_email, figé par demande) → adresse des étapes d'envoi À VENIR (ordinaires)
  bifurcationDestinataire: string | null; // LOT 21 : adresse servie de la RÉCLAMATION (bifurcation) — lue du journal ; PRÉSUMÉE si origine déclarée (envoi manuel non capté)
  annonceCadaDestinataire: string | null; // LOT 21 : adresse servie de l'ANNONCE CADA effectuée (captée par l'outil, certaine)
  reglages: ReglagesParcours;
}

const MS_JOUR = 86_400_000;
const iso = (d: string): string => new Date(d).toISOString();                                   // NORMALISE tout format (pg `::text` ou ISO) en ISO comparable
const ajoute = (isoDate: string, jours: number): string => new Date(new Date(isoDate).getTime() + jours * MS_JOUR).toISOString();
const detailOrdinaire = (grade: string): string => (grade === 'Rappel' ? 'rappel courtois' : grade === 'Avis d’échéance' ? 'avis d’échéance' : grade.toLowerCase());
// LOT 19 (point 11) — une relance PARTIELLE à venir part In-Reply-To du dernier message mairie : l'adresse peut changer → jamais une adresse figée trompeuse.
const INTERLOCUTEUR_FUTUR = 'au dernier interlocuteur de la mairie';
// LOT 27 (Règle B) — une étape d'envoi À VENIR couverte par la multi-adresse ne part PAS à un seul interlocuteur mais à toute la mairie ayant participé.
const TOUTES_ADRESSES_FUTUR = 'à toutes les adresses de la mairie ayant participé';
/** Règle B — l'étape d'envoi À VENIR de rang `rang` (sur `total`) part-elle à TOUTES les adresses (multi-adresse active + parmi les dernières) ? PUR. */
function estMultiAdresseFutur(m: { active: boolean; nbDernieres: number }, rang: number, total: number): boolean {
  return m.active && m.nbDernieres > 0 && estParmiDernieres(rang, total, m.nbDernieres);
}

/**
 * LOT 19/21 — ligne de détail grise d'une étape d'ENVOI : l'adresse (« à … ») puis, le cas échéant, la nature, séparées par un point
 * médian (point 7). UNE seule ligne. `presume` (LOT 21, point 3) : marque une adresse dont on ne sait pas à qui le mail est RÉELLEMENT
 * parti (envoi déclaré hors outil, ou repli sur le destinataire connu) → « à … (présumé) », jamais présentée comme certaine.
 */
function detailEnvoi(adresse: string | null, nature: string | null, presume = false): string | null {
  const parts: string[] = [];
  if (adresse) parts.push(`à ${adresse}${presume ? ' (présumé)' : ''}`);
  if (nature) parts.push(nature);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Une étape ordinaire (rappel/avis) : effectuée (date + adresse RÉELLES) si l'envoi de ce grade existe, sinon programmée (`detailFutur` déjà calculé). */
function etapeOrdinaire(ordRealise: Map<string, { le: string; dest: string | null }>, grade: string, dateProjetee: string, nature: string, detailFutur: string | null): EvenementFrise {
  const reel = ordRealise.get(grade);
  return reel
    ? { le: reel.le, quand: 'passe', libelle: 'Relance effectuée', detail: detailEnvoi(reel.dest, nature) }
    : { le: dateProjetee, quand: 'avenir', libelle: 'Relance programmée', detail: detailFutur };
}

/**
 * LOT 27 — détail d'une étape d'envoi ORDINAIRE À VENIR : Règle B (multi-adresse) → « à toutes les adresses… » ; sinon Règle A → au
 * destinataire courant (dernier répondant, déjà résolu par l'appelant). Total ordinaire = 3 (rappel=1, avis=2, saisine=3). PUR.
 */
function detailFuturOrdinaire(e: EntreeParcours, rang: number, nature: string | null): string | null {
  if (estMultiAdresseFutur(e.reglages.multiAdresse, rang, 3)) return nature ? `${TOUTES_ADRESSES_FUTUR} · ${nature}` : TOUTES_ADRESSES_FUTUR;
  return detailEnvoi(e.destinataireCourant, nature);
}

/**
 * Projette le parcours COMPLET (faits + étapes à venir datées). PUR. Régime ordinaire OU partiel (bifurcation). Marque la position
 * courante. Les libellés suivent le vocabulaire arrêté (points 8-11) : relance programmée/effectuée · Information saisine CADA · Dépôt
 * de saisine CADA · Relance pièces complémentaires (bifurcation). Vide si la demande n'est pas encore envoyée.
 */
export function projeterParcours(e: EntreeParcours): EvenementFrise[] {
  if (!e.envoyeLe) return [];
  const evs: EvenementFrise[] = [];

  // Étape 1 — DEMANDE INITIALE (toujours un fait) : adresse RÉELLEMENT utilisée (destinataire de l'envoi), à défaut le destinataire courant.
  const envoiInitial = e.envois.find((x) => x.nature === 'initiale');
  evs.push({ le: iso(e.envoyeLe), quand: 'passe', libelle: 'Demande initiale de communication', detail: detailEnvoi(envoiInitial?.destinataire ?? e.destinataireCourant, null) });

  // Faits RÉELS indexés (date + ADRESSE réelle) : relances ordinaires par GRADE, relances partielles par ordre chronologique (= ordre de rang).
  const ordRealise = new Map<string, { le: string; dest: string | null }>();
  for (const x of e.envois) if (x.nature === 'relance_ordinaire' && x.grade) ordRealise.set(x.grade, { le: iso(x.le), dest: x.destinataire });
  const partielsRealises = e.envois.filter((x) => x.nature === 'relance_partielle').map((x) => ({ le: iso(x.le), dest: x.destinataire })).sort((a, b) => (a.le < b.le ? -1 : a.le > b.le ? 1 : 0));

  if (e.suspension) {
    // ── RÉGIME PARTIEL (après bifurcation) ──
    const J = iso(e.suspension.le);
    // Relances ordinaires réalisées AVANT la bifurcation → font partie de l'HISTOIRE (les non survenues, elles, disparaissent).
    for (const [grade, v] of ordRealise) if (v.le < J) evs.push({ le: v.le, quand: 'passe', libelle: 'Relance effectuée', detail: detailEnvoi(v.dest, detailOrdinaire(grade)) });
    // BIFURCATION — « Relance pièces complémentaires » (fait, badge rouge cerclé). LOT 21/22 : c'est un ENVOI → il porte une adresse.
    //   L'adresse STOCKÉE par la réclamation (journal, y compris une déclaration hors outil) est CERTAINE : on l'affiche telle quelle.
    //   Le marquage « présumé » (LOT 22, point 5) ne sert QUE lorsqu'AUCUNE adresse n'est stockée → repli sur le destinataire connu.
    const origine = e.suspension.origine === 'declaree' ? 'relance de complément déclarée hors outil' : 'complément de pièces réclamé par l’outil';
    const adresseBif = e.bifurcationDestinataire ?? e.destinataireCourant;
    const presumeBif = e.bifurcationDestinataire === null; // adresse stockée → certaine ; repli sur le destinataire connu → présumé
    evs.push({ le: J, quand: 'passe', libelle: 'Relance pièces complémentaires', detail: detailEnvoi(adresseBif, origine, presumeBif), bifurcation: true });
    // Relances partielles (programmées → effectuées sur envoi réel).
    const rp = e.reglages.partiel;
    // LOT 27 — cascade partielle : relances 1..N puis annonce (rang N+1). Les 2 dernières (relance N + annonce) → « à toutes les adresses » si Règle B active.
    const totalPartiel = rp.nbRelancesAvantAnnonce + 1;
    for (let k = 1; k <= rp.nbRelancesAvantAnnonce; k++) {
      const reel = partielsRealises[k - 1];
      const nature = `${ordinalRelance(k)} relance`;
      const futur = estMultiAdresseFutur(e.reglages.multiAdresse, k, totalPartiel) ? TOUTES_ADRESSES_FUTUR : INTERLOCUTEUR_FUTUR;
      evs.push(reel
        ? { le: reel.le, quand: 'passe', libelle: 'Relance effectuée', detail: detailEnvoi(reel.dest, nature) }
        // À venir : relance partielle envoyée In-Reply-To → adresse non figée (point 11) ; Règle B → toutes les adresses. Jamais d'adresse trompeuse.
        : { le: ajoute(J, k * rp.relanceJours), quand: 'avenir', libelle: 'Relance programmée', detail: `${nature} · ${futur}` });
    }
    // INFORMATION SAISINE CADA (l'annonce, In-Reply-To) — effectuée sur envoi réel (adresse non conservée), sinon programmée (Règle B → toutes les adresses).
    const dateAnnonce = ajoute(J, rp.nbRelancesAvantAnnonce * rp.relanceJours + rp.annonceJours);
    const futurAnnonce = estMultiAdresseFutur(e.reglages.multiAdresse, totalPartiel, totalPartiel) ? TOUTES_ADRESSES_FUTUR : INTERLOCUTEUR_FUTUR;
    evs.push(e.annonceCadaEnvoyeeLe
      // LOT 21 — annonce effectuée : adresse RÉELLEMENT servie (captée par l'outil, certaine) ; à défaut (colonne absente), rien.
      ? { le: iso(e.annonceCadaEnvoyeeLe), quand: 'passe', libelle: 'Information saisine CADA', detail: detailEnvoi(e.annonceCadaDestinataire, null) }
      : { le: dateAnnonce, quand: 'avenir', libelle: 'Information saisine CADA', detail: futurAnnonce });
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
    // LOT 27 — rangs ordinaires : rappel=1, avis=2, saisine=3. Les 2 dernières (avis + saisine) → « à toutes les adresses » quand la Règle B est active.
    evs.push(etapeOrdinaire(ordRealise, 'Rappel', ajoute(ech, -o.rappelJoursAvant), 'rappel courtois', detailFuturOrdinaire(e, 1, 'rappel courtois')));       // J-10
    evs.push(etapeOrdinaire(ordRealise, 'Avis d’échéance', ajoute(ech, -o.avisJoursAvant), 'avis d’échéance', detailFuturOrdinaire(e, 2, 'avis d’échéance'))); // J-3
    // INFORMATION SAISINE CADA — la relance « saisine » (celle qui annonce le recours), au destinataire de la demande ; effectuée si partie, sinon programmée.
    const saisineReel = ordRealise.get('Saisine');
    evs.push(saisineReel
      ? { le: saisineReel.le, quand: 'passe', libelle: 'Information saisine CADA', detail: detailEnvoi(saisineReel.dest, null) }
      : { le: ech, quand: 'avenir', libelle: 'Information saisine CADA', detail: detailFuturOrdinaire(e, 3, null) });
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
