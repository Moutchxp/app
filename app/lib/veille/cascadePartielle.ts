/**
 * CASC-3 — MOTEUR PUR de la cascade de relances sur DOSSIER PARTIEL (la mairie a répondu, des pièces manquent ; CASC-1 a posé le
 * marqueur, la relance ordinaire du 22/08 est suspendue). Aucune I/O, aucun envoi. Testable seul.
 *
 * RÈGLE (Arno) : après la 1re réclamation, relancer tous les `relanceJours` (10 j), `nbRelancesAvantAnnonce` FOIS (2). Puis, après
 * `annonceJours` (10 j), ANNONCER qu'une saisine CADA sera engagée. La saisine ne devient proposable qu'ensuite.
 *
 * ⚠️ ARTICULATION AVEC CASC-2 (constaté, non tranché unilatéralement) : la saisine n'est réellement proposable qu'au BUTOIR CASC-2
 * (partiel_le + 1 mois + 4 j) — c'est déjà l'AUTORITÉ de l'éligibilité (lireSaisinesEligibles). Le tail « annonce + saisineJours »
 * de CASC-3 et le « + 4 j » de CASC-2 coïncident par défaut (4 j) mais divergent d'1-3 j selon la longueur du mois. On retient donc la
 * date la PLUS TARDIVE des deux : on n'annonce/n'ouvre JAMAIS un recours avant qu'il soit réellement proposable (aucun conflit possible).
 *
 * La cascade du 22/08 (absence TOTALE de réponse) n'est PAS concernée : ce moteur ne tourne que si le marqueur « dossier partiel » est actif.
 */
import type { FamillePlan } from '../permis/planMasse';

/** Étape DUE aujourd'hui (ou 'aucune' si rien n'est encore échu). */
export type EtapePartielle = 'aucune' | 'relance' | 'annonce' | 'saisine_proposable';

export interface ReglagesCascadePartielle {
  relanceJours: number;            // intervalle entre la 1re réclamation et chaque relance (défaut 10)
  nbRelancesAvantAnnonce: number;  // nombre de relances courtoises avant l'annonce (défaut 2)
  annonceJours: number;            // délai entre la dernière relance et l'annonce (défaut 10)
  saisineJours: number;            // délai entre l'annonce et la saisine (défaut 4) — harmonisé au butoir CASC-2 (max)
}

export interface EntreeCascadePartielle {
  premiereReclamation: Date;   // partiel_le (CASC-1) : le POINT DE DÉPART, jamais la dernière relance
  relancesEnvoyees: number;    // relances courtoises DÉJÀ envoyées (comptées hors outil-agnostique par l'appelant)
  annonceEnvoyee: boolean;     // l'annonce CADA a-t-elle déjà été envoyée ?
  aujourdhui: Date;
  butoirCasc2: Date;           // CASC-2 : date d'éligibilité réelle de la saisine (autorité) — voir dateButoirPartiel
  reglages: ReglagesCascadePartielle;
}

export interface ResultatCascadePartielle {
  etape: EtapePartielle;
  rang: number | null;         // n° de la relance quand etape='relance' (1..nbRelancesAvantAnnonce)
  dateDue: Date | null;        // date de l'étape DUE (présente quand etape ≠ 'aucune')
  prochaineDate: Date | null;  // prochaine échéance quand rien n'est dû maintenant (etape='aucune')
}

const MS_JOUR = 86_400_000;
function ajouterJours(d: Date, n: number): Date { return new Date(d.getTime() + n * MS_JOUR); }

/**
 * Étape due de la cascade partielle. Progression stricte : relances 1..N (à `premiereReclamation + rang×relanceJours`), puis annonce
 * (à `+ N×relanceJours + annonceJours`), puis saisine proposable (à la PLUS TARDIVE de `annonce + saisineJours` et du butoir CASC-2).
 * `relancesEnvoyees`/`annonceEnvoyee` font AVANCER la cascade (aucune étape re-proposée une fois franchie). PUR.
 */
export function etapeCascadePartielle(e: EntreeCascadePartielle): ResultatCascadePartielle {
  const { premiereReclamation: J, relancesEnvoyees, annonceEnvoyee, aujourdhui, butoirCasc2, reglages: r } = e;
  const t = aujourdhui.getTime();
  const rien = (prochaineDate: Date): ResultatCascadePartielle => ({ etape: 'aucune', rang: null, dateDue: null, prochaineDate });

  // 1) RELANCES COURTOISES restantes.
  if (relancesEnvoyees < r.nbRelancesAvantAnnonce) {
    const rang = relancesEnvoyees + 1;
    const dateDue = ajouterJours(J, rang * r.relanceJours);
    return t >= dateDue.getTime() ? { etape: 'relance', rang, dateDue, prochaineDate: null } : rien(dateDue);
  }

  // 2) ANNONCE CADA (après la dernière relance).
  const dateAnnonce = ajouterJours(J, r.nbRelancesAvantAnnonce * r.relanceJours + r.annonceJours);
  if (!annonceEnvoyee) {
    return t >= dateAnnonce.getTime() ? { etape: 'annonce', rang: null, dateDue: dateAnnonce, prochaineDate: null } : rien(dateAnnonce);
  }

  // 3) SAISINE PROPOSABLE — la date la PLUS TARDIVE de (annonce + saisineJours) et du butoir CASC-2 (autorité). Jamais avant le butoir.
  const dateSaisineCascade = ajouterJours(dateAnnonce, r.saisineJours);
  const dateSaisine = dateSaisineCascade.getTime() >= butoirCasc2.getTime() ? dateSaisineCascade : butoirCasc2;
  return t >= dateSaisine.getTime() ? { etape: 'saisine_proposable', rang: null, dateDue: dateSaisine, prochaineDate: null } : rien(dateSaisine);
}

// ── Générateurs de TEXTE (purs, DISTINCTS entre eux et de tout générateur existant) ──────────────────────────────────────────────
const LIB_FAMILLE: Record<FamillePlan, string> = {
  masse: 'le plan de masse', coupe: 'le plan de coupe (ou de profil)', etage: 'les plans des étages (niveaux)', cerfa: 'le formulaire Cerfa complet',
};
const ORDRE_FAMILLE: readonly FamillePlan[] = ['masse', 'coupe', 'etage', 'cerfa'];

/** Liste lisible des pièces manquantes ACTUELLES (jamais la liste d'origine) — triée, dédupliquée, dans l'ordre canonique. */
function listerFamilles(familles: readonly FamillePlan[]): string {
  const set = new Set(familles);
  return ORDRE_FAMILLE.filter((f) => set.has(f)).map((f) => LIB_FAMILLE[f]).join(', ');
}

export interface TexteRelance { objet: string; corps: string }

/**
 * Relance COURTOISE (rang 1 = 1re relance, rang 2 = 2e relance, etc.) rappelant les pièces TOUJOURS manquantes (relues au jour de la
 * préparation). Ton neutre, aucune mention de recours. `famillesManquantes` = diagnostic à jour (l'appelant a exclu ce qui est arrivé).
 */
export function texteRelancePartielle(rang: number, famillesManquantes: readonly FamillePlan[]): TexteRelance {
  const rangMot = rang === 1 ? 'première' : rang === 2 ? 'deuxième' : `${rang}e`;
  const pieces = listerFamilles(famillesManquantes);
  const objet = `Pièces manquantes — ${rangMot} relance`;
  const corps = [
    'Madame, Monsieur,',
    '',
    `Faisant suite à votre transmission partielle, et sauf erreur de ma part, il manque encore, pour compléter le dossier : ${pieces}.`,
    'Je vous saurais gré de bien vouloir me les communiquer.',
    '',
    'Vous en remerciant par avance,',
    'Cordialement,',
  ].join('\n');
  return { objet, corps };
}

/**
 * ANNONCE : à défaut de réponse d'ici la date où la saisine devient proposable, une saisine de la CADA sera engagée. Ton FACTUEL,
 * jamais comminatoire. `dateSaisineProposable` = date effective (la plus tardive annonce+délai / butoir CASC-2), au format JJ/MM/AAAA.
 */
export function texteAnnonceCada(famillesManquantes: readonly FamillePlan[], dateSaisineProposable: Date): TexteRelance {
  const pieces = listerFamilles(famillesManquantes);
  const jj = String(dateSaisineProposable.getUTCDate()).padStart(2, '0');
  const mm = String(dateSaisineProposable.getUTCMonth() + 1).padStart(2, '0');
  const dateFr = `${jj}/${mm}/${dateSaisineProposable.getUTCFullYear()}`;
  const objet = 'Pièces manquantes — information sur une éventuelle saisine de la CADA';
  const corps = [
    'Madame, Monsieur,',
    '',
    `Malgré mes précédentes demandes, les pièces suivantes restent à ce jour manquantes : ${pieces}.`,
    `À défaut de communication de ces pièces d'ici le ${dateFr}, je serai conduit à saisir la Commission d'accès aux documents administratifs (CADA), conformément au code des relations entre le public et l'administration.`,
    'Je reste à votre disposition et vous en remercie.',
    '',
    'Cordialement,',
  ].join('\n');
  return { objet, corps };
}
