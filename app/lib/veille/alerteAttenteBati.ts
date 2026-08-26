/**
 * ATT-BATI (alerte) — LOGIQUE PURE de l'alerte « un permis attend le bâti depuis trop longtemps ». Aucune I/O : calcul de
 * l'ancienneté, sélection des dossiers à alerter, composition de l'e-mail. Testable sans base ni SMTP.
 *
 * 🔴 CE QUE CETTE ALERTE EST — ET N'EST PAS : un simple RAPPEL qu'un ou plusieurs permis attendent que leur futur bâtiment
 * apparaisse dans BD TOPO. Ce n'est JAMAIS une détection de bâti neuf ; elle ne dit pas que le bâtiment est arrivé, n'appelle
 * aucune action, ne lit que l'état et l'ancienneté du dossier. Elle ne touche NI le moteur, NI le verdict, NI une altitude, NI un
 * certificat, NI l'emprise reconstituée. Vocabulaire « bâtiment », jamais « corps ».
 */

const MS_JOUR = 86_400_000;

/** Ancienneté en JOURS PLEINS depuis `detecteLe` (date d'entrée en « en attente de bâti »), jamais négative. PUR. */
export function joursDepuis(detecteLe: Date, maintenant: Date): number {
  return Math.max(0, Math.floor((maintenant.getTime() - detecteLe.getTime()) / MS_JOUR));
}

/** Un dossier candidat : son ancienneté brute + s'il a DÉJÀ reçu son alerte (marqueur anti-doublon en base). */
export interface CandidatAttenteBati {
  dossierId: number;
  numDau: string | null;
  communeNom: string | null;
  detecteLe: Date;
  dejaAlerte: boolean;
}

/** Un dossier RETENU pour l'alerte (ancienneté calculée). */
export interface DossierAAlerter {
  dossierId: number;
  numDau: string | null;
  communeNom: string | null;
  joursAttente: number;
}

/**
 * Sélectionne les dossiers à alerter : ancienneté ≥ seuil ET jamais encore alertés (un seul rappel par dossier et par
 * franchissement). Tri par ancienneté décroissante (le plus vieux d'abord). PUR.
 */
export function dossiersAAlerter(candidats: CandidatAttenteBati[], seuilJours: number, maintenant: Date): DossierAAlerter[] {
  return candidats
    .map((c) => ({ dossierId: c.dossierId, numDau: c.numDau, communeNom: c.communeNom, joursAttente: joursDepuis(c.detecteLe, maintenant), dejaAlerte: c.dejaAlerte }))
    .filter((c) => c.joursAttente >= seuilJours && !c.dejaAlerte)
    .sort((a, b) => b.joursAttente - a.joursAttente)
    .map(({ dossierId, numDau, communeNom, joursAttente }) => ({ dossierId, numDau, communeNom, joursAttente }));
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Un dossier en une ligne lisible : « PC… (commune) — en attente depuis N jours ». Sans num_dau connu → « permis #id ». */
function ligneDossier(d: DossierAAlerter): string {
  const nom = d.numDau ?? `permis #${d.dossierId}`;
  const commune = d.communeNom ? ` (${d.communeNom})` : '';
  return `• ${nom}${commune} — en attente depuis ${pluriel(d.joursAttente, 'jour')}`;
}

/**
 * Compose l'e-mail (sujet + corps). Dit FRANCHEMENT ce que c'est (un rappel), ce que ce n'est PAS (une détection), et qu'aucune
 * action n'est requise. Liste chaque dossier avec son ancienneté. PUR. Renvoie null si aucun dossier (l'appelant n'envoie alors rien).
 */
export function composerAlerteAttenteBati(dossiers: DossierAAlerter[], seuilJours: number): { sujet: string; corps: string } | null {
  if (dossiers.length === 0) return null;
  const n = dossiers.length;
  const sujet = n === 1
    ? `Rappel — un permis attend son bâtiment depuis longtemps`
    : `Rappel — ${n} permis attendent leur bâtiment depuis longtemps`;
  const corps = [
    n === 1
      ? `Ceci est un simple RAPPEL : un permis attend depuis longtemps que son futur bâtiment apparaisse dans les données BD TOPO.`
      : `Ceci est un simple RAPPEL : ${n} permis attendent depuis longtemps que leur futur bâtiment apparaisse dans les données BD TOPO.`,
    ``,
    `⚠️ Ce n’est PAS une détection : rien ne dit que le bâtiment est arrivé, et il n’y a aucune action à faire de votre part pour l’instant. Ce message existe seulement pour qu’un dossier en attente ne reste pas oublié.`,
    ``,
    n === 1 ? `Le dossier concerné :` : `Les dossiers concernés :`,
    ...dossiers.map(ligneDossier),
    ``,
    `Un bâtiment neuf met en général 1 à 3 ans à apparaître dans BD TOPO. Ce rappel se déclenche au-delà de ${pluriel(seuilJours, 'jour')} d’attente, une seule fois par dossier. Le jour où une mise à jour BD TOPO fera apparaître le bâtiment, le permis basculera de lui-même en « arbitrage demandé » (une décision de rattachement vous sera alors proposée dans l’onglet Rattachement).`,
  ].join('\n');
  return { sujet, corps };
}
