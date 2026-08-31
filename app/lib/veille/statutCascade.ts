/**
 * Lot 4/6 — STATUT DÉRIVÉ de la cascade, à la LECTURE (jamais stocké, jamais écrit dans demande.statut). Deux fonctions PURES,
 * client-safe (aucune I/O) :
 *  - `statutCascade` : le libellé de la colonne STATUT — reflète le DERNIER ENVOI RÉEL (demande_acheminement), pas un brouillon
 *    préparé (« prêt, non envoyé » si préparé sans être parti). Heures en Europe/Paris.
 *  - `prochaineEtape` : l'étape suivante + sa date prévue (fenêtre du lot 3) ; à défaut, DIT explicitement pourquoi il n'y en a
 *    aucune (règle « aucun compte à zéro muet »).
 *
 * ⚠️ Ces libellés vont dans la colonne STATUT. La colonne « Retour mairie » (vocabulaire T8) est réservée à ce que fait la
 * MAIRIE — une relance est NOTRE action, elle n'y entre jamais.
 */
import { etapeCible, saisineLeDe, type ReglagesCascade } from './cascadeRelance';
import { echeanceDe } from './echeance';

const MS_JOUR = 86_400_000;
const TZ = 'Europe/Paris';

/** « 14 avril 2026 à 12:00 » (Europe/Paris). */
function dateHeure(iso: string): string {
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d);
  return `${jour} à ${heure}`;
}
/** « 14 avril 2026 » (Europe/Paris) — pour les dates sans heure (saisine CADA, prochaine étape). */
function dateSeule(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso));
}

/** Données de LECTURE d'une demande pour dériver son statut de cascade (toutes issues de la source unique `chargerDemandesSuivi`). */
/**
 * Infos d'ENVOI AUTOMATIQUE (réglages existants, jamais recopiés en dur) : l'interrupteur `relance_auto_active` + la fenêtre horaire
 * `envoi_heure_debut`/`envoi_heure_fin`. Servent à DIRE, sur une relance préparée, qu'elle partira seule et QUAND (ou pas, si OFF).
 */
export interface EnvoiAutoInfos { relanceAutoActive: boolean; envoiHeureDebut: number; envoiHeureFin: number }

/** Fenêtre horaire cohérente (début < fin, dans 0..23) ? Sinon rien ne part (fenetreEnvoiOuverte l'exige), on le dit à l'écran. */
function fenetreCoherente(e: EnvoiAutoInfos): boolean {
  return Number.isInteger(e.envoiHeureDebut) && Number.isInteger(e.envoiHeureFin) && e.envoiHeureDebut >= 0 && e.envoiHeureFin <= 23 && e.envoiHeureDebut < e.envoiHeureFin;
}

/**
 * MENTION affichée SUR LA CARTE d'une relance préparée : dit en une phrase que le courrier PART TOUT SEUL (ou pas, si l'envoi auto
 * est OFF ou mal réglé) et que les boutons ne servent qu'à le modifier/annuler avant. Horaires issus des RÉGLAGES (jamais en dur). PUR.
 */
export function mentionEnvoiAutoRelance(envoi: EnvoiAutoInfos): string {
  if (!envoi.relanceAutoActive) return 'L’envoi automatique est désactivé : ce courrier ne partira pas seul. Les boutons ci-dessous servent à le modifier ou l’annuler.';
  if (!fenetreCoherente(envoi)) return 'Envoi automatique actif mais fenêtre d’envoi mal réglée : rien ne partira tant qu’elle n’est pas corrigée (Réglages).';
  return `Ce courrier part tout seul à la prochaine fenêtre d’envoi (jours ouvrés, de ${envoi.envoiHeureDebut} h à ${envoi.envoiHeureFin} h). Les boutons ci-dessous servent seulement à le modifier ou l’annuler avant.`;
}

export interface EntreeStatutCascade {
  statut: string;                 // 'envoyee' | 'close'
  envoyeLe: string | null;        // ISO — envoi initial (ancre d'échéance)
  statutAcheminement: string;     // 'envoye' | 'rebond' | 'echec' | 'en_attente'
  dossiersDus: number;            // dossiers actifs NON satisfaits
  dernierEnvoiRelance: { variante: string; envoyeLe: string } | null; // dernière relance RÉELLEMENT envoyée (acheminement)
  relancePreparee: { variante: string } | null;                        // brouillon vivant NON envoyé (préparé)
  saisineCadaEnvoyeeLe: string | null;                                 // saisine CADA (type='saisine_cada') envoyée
}

const LIBELLE_RELANCE: Record<string, string> = { rappel: 'Rappel', avis: 'Avis d’échéance', saisine: 'Saisine', formelle: 'Saisine' };

/** Libellé humain d'une variante de relance ORDINAIRE (« Rappel » / « Avis d'échéance » / « Saisine »). SOURCE UNIQUE — vocabulaire
 *  NON fusionné avec la cascade PARTIELLE (ordinaux « 1re relance »…, décision LOT 8). PUR. Repli « Relance » pour une variante inconnue. */
export function libelleVarianteRelance(variante: string): string { return LIBELLE_RELANCE[variante] ?? 'Relance'; }

/**
 * Libellé de la colonne STATUT, par ORDRE de priorité (du plus avancé au moins avancé) :
 *   Saisine CADA envoyée → Saisine CADA à lancer → dernier envoi RÉEL de relance (rappel/avis/saisine annoncée) → brouillon
 *   PRÉPARÉ non envoyé → à défaut, le statut actuel (« Envoyée le … » / « Clôturée »). Le DERNIER ENVOI RÉEL fait foi : un
 *   brouillon préparé sans être parti n'affiche JAMAIS « envoyé ».
 */
export function statutCascade(e: EntreeStatutCascade, maintenant: Date, reglages: ReglagesCascade, envoi?: EnvoiAutoInfos): string {
  if (e.saisineCadaEnvoyeeLe) return `Saisine CADA envoyée le ${dateSeule(e.saisineCadaEnvoyeeLe)}`;
  // Saisine CADA À LANCER : échéance + délai atteinte, saisine pas encore partie, et il reste des dossiers dus.
  if (e.dossiersDus > 0 && e.envoyeLe !== null && e.statutAcheminement === 'envoye') {
    const saisineLe = saisineLeDe(new Date(e.envoyeLe), reglages.saisineDelaiJours);
    if (maintenant.getTime() >= saisineLe.getTime()) return 'Saisine CADA à lancer';
  }
  if (e.dernierEnvoiRelance) {
    const d = dateHeure(e.dernierEnvoiRelance.envoyeLe);
    switch (e.dernierEnvoiRelance.variante) {
      case 'rappel': return `Rappel envoyé le ${d}`;
      case 'avis': return `Avis d’échéance envoyé le ${d}`;
      default: return `Saisine annoncée le ${d}`; // saisine | formelle (héritée)
    }
  }
  if (e.relancePreparee) {
    const nom = LIBELLE_RELANCE[e.relancePreparee.variante] ?? 'Relance';
    if (!envoi) return `${nom} prêt, non envoyé`;                                          // appelant sans info d'envoi (compat)
    if (!envoi.relanceAutoActive) return `${nom} prêt — l’envoi automatique est désactivé : à envoyer à la main`;
    if (!fenetreCoherente(envoi)) return `${nom} prêt — envoi automatique actif mais fenêtre d’envoi mal réglée : rien ne partira tant qu’elle n’est pas corrigée (Réglages)`;
    return `${nom} prêt — partira tout seul à la prochaine fenêtre d’envoi (jours ouvrés, de ${envoi.envoiHeureDebut} h à ${envoi.envoiHeureFin} h)`;
  }
  if (e.statut === 'close') return 'Clôturée';
  return e.envoyeLe !== null ? `Envoyée le ${dateHeure(e.envoyeLe)}` : 'Envoyée';
}

/**
 * LOT-7 (A) — LIBELLÉ COURT de la colonne STATUT : un ÉTAT (un mot), jamais la phrase, DÉRIVÉ de l'état réel — MÊMES branches et MÊME
 * priorité que `statutCascade`, mais compact et sur UNE ligne (le texte complet va dans l'infobulle). La suspension (« Arrêtée ») est
 * décidée en amont (elle ne passe pas par `EntreeStatutCascade`). Jamais une troncature de chaîne : chaque libellé est nommé.
 */
export function libelleCourtCascade(e: EntreeStatutCascade, maintenant: Date, reglages: ReglagesCascade): string {
  if (e.saisineCadaEnvoyeeLe) return 'Saisine CADA envoyée';
  if (e.dossiersDus > 0 && e.envoyeLe !== null && e.statutAcheminement === 'envoye') {
    const saisineLe = saisineLeDe(new Date(e.envoyeLe), reglages.saisineDelaiJours);
    if (maintenant.getTime() >= saisineLe.getTime()) return 'Saisine CADA à lancer';
  }
  if (e.dernierEnvoiRelance) {
    switch (e.dernierEnvoiRelance.variante) {
      case 'rappel': return 'Rappel envoyé';
      case 'avis': return 'Avis d’échéance envoyé';
      default: return 'Saisine annoncée';
    }
  }
  if (e.relancePreparee) return `${LIBELLE_RELANCE[e.relancePreparee.variante] ?? 'Relance'} prêt`;
  if (e.statut === 'close') return 'Clôturée';
  return 'Envoyée';
}

/**
 * PROCHAINE ÉTAPE de la cascade + sa date prévue (« Avis d'échéance prévu le 1 septembre 2026 »). Calculée par les jalons de la
 * fenêtre (lot 3). Si AUCUNE étape n'est prévue, le DIT explicitement (clôturée / non délivrée / tous dossiers obtenus / saisine
 * déjà partie / plus d'étape ultérieure) — jamais vide.
 */
export function prochaineEtape(e: EntreeStatutCascade, maintenant: Date, reglages: ReglagesCascade): string {
  if (e.statut === 'close') return 'Demande clôturée — aucune étape prévue.';
  if (e.statutAcheminement !== 'envoye' || e.envoyeLe === null) return 'Demande non délivrée — aucune étape prévue.';
  if (e.dossiersDus <= 0) return 'Tous les dossiers obtenus — cascade terminée.';
  if (e.saisineCadaEnvoyeeLe) return 'Saisine CADA envoyée — plus d’étape de relance.';
  const ech = echeanceDe(new Date(e.envoyeLe)).getTime();
  const jalons: { etape: string; t: number }[] = [
    { etape: 'Rappel', t: ech - reglages.rappelJoursAvant * MS_JOUR },
    { etape: 'Avis d’échéance', t: ech - reglages.avisJoursAvant * MS_JOUR },
    { etape: 'Saisine', t: ech },
    { etape: 'Saisine CADA', t: ech + reglages.saisineDelaiJours * MS_JOUR },
  ].sort((a, b) => a.t - b.t); // réglages incohérents → tri par date, jamais un ordre faux
  const prochain = jalons.find((j) => j.t > maintenant.getTime());
  if (!prochain) return 'Saisine CADA à lancer — aucune étape ultérieure.';
  return `${prochain.etape} prévu le ${dateSeule(new Date(prochain.t).toISOString())}`;
}

/** Étape cible du jour (réexport pratique pour le rendu : la Vue n'importe qu'un module). */
export { etapeCible };

/**
 * Lot 5b (B) — STATUT lisible d'une saisine CADA dans l'onglet Saisines, cohérent avec la colonne Statut d'« En cours ».
 * Réutilise le même formateur de date (Europe/Paris) que `statutCascade`, sans dupliquer la mécanique. Cinq libellés :
 *   - « Saisine à lancer »               : possible, aucune saisine matérialisée (une demande saisissable) ;
 *   - « Saisine préparée, non envoyée »  : brouillon existant, e-mail CADA configuré, pas parti (« envoi à finaliser ») ;
 *   - « Saisine envoyée le <date> »      : e-mail parti (acheminement canal='email') ;
 *   - « Saisine à déposer sur le formulaire » : brouillon, aucune adresse CADA (canal formulaire) ;
 *   - « Saisine déposée le <date> »      : marquée à la main après dépôt sur le formulaire (envoyée SANS acheminement e-mail).
 * (« Saisine abandonnée » couvre la trace conservée, hors des cinq.)
 */
export interface EntreeStatutSaisine {
  materialisee: boolean;              // false = aucune ligne saisine_cada encore (demande seulement SAISISSABLE)
  statut?: string;                    // 'brouillon' | 'envoyee' | 'abandonnee' (si matérialisée)
  canal?: string | null;             // canal de l'acheminement de l'envoi : 'email' (e-mail parti) ; null = dépôt formulaire
  envoyeeLe?: string | null;          // date d'envoi/dépôt (ISO)
  cadaEmailVide: boolean;             // adresse CADA non configurée → canal formulaire
}
export function statutSaisine(e: EntreeStatutSaisine): string {
  if (!e.materialisee) return 'Saisine à lancer';
  if (e.statut === 'abandonnee') return 'Saisine abandonnée';
  if (e.statut === 'envoyee') {
    const d = e.envoyeeLe ? dateSeule(e.envoyeeLe) : '—';
    return e.canal === 'email' ? `Saisine envoyée le ${d}` : `Saisine déposée le ${d}`;
  }
  return e.cadaEmailVide ? 'Saisine à déposer sur le formulaire' : 'Saisine préparée, non envoyée';
}
