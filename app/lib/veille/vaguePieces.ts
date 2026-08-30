/**
 * PART-C — CLÔTURE d'une VAGUE de pièces (PUR, aucune I/O, aucune horloge : on passe l'instant). Une mairie peut envoyer les
 * documents en PLUSIEURS mails successifs ; on ne veut PAS un diagnostic de complétude par mail (sinon on réclame une pièce qui
 * arrive cinq minutes plus tard). On attend que la vague soit CLOSE, puis UN SEUL diagnostic.
 *
 * DEUX portes DISTINCTES (ne jamais confondre) :
 *  - `vagueCloseeDiagnostic` : peut-on lancer le DIAGNOSTIC maintenant ? En relève AUTOMATIQUE, oui seulement si le dernier mail
 *    de la mairie date d'au moins `calmeMinutes` (sur sa DATE D'ENVOI). En relève MANUELLE, TOUJOURS oui : Arno considère que tout
 *    est arrivé → résultat immédiat.
 *  - `vagueCloseeEnvoi` : l'ENVOI AUTOMATIQUE de la relance qui découlerait du diagnostic est-il permis ? TOUJOURS soumis au calme,
 *    quel que soit le mode (garde-fou PART-C) — même après une relève manuelle, un courrier ne part pas réclamer des pièces qui
 *    arrivent cinq minutes plus tard. (Consommée en PART-E ; l'envoi MANUEL d'Arno, lui, n'est jamais bridé et ne passe pas ici.)
 *
 * Le calme se compte sur la DATE D'ENVOI du dernier mail (`dernierMailLe`), jamais sur l'heure de la relève. `dernierMailLe = null`
 * (aucun mail connu) → rien à attendre → vague close. `calmeMinutes ≤ 0` → pas d'attente (diagnostic/envoi immédiats).
 */
export type ModeReleve = 'auto' | 'manuel';

const MS_MINUTE = 60_000;

/** Le dernier mail de la mairie a-t-il au moins `calmeMinutes` (sur sa date d'envoi) à l'instant `maintenant` ? `null` → oui (rien à attendre). */
export function calmeEcoule(dernierMailLe: Date | null, maintenant: Date, calmeMinutes: number): boolean {
  if (dernierMailLe === null) return true;                 // aucun mail connu → aucune vague en cours → rien à attendre
  if (calmeMinutes <= 0) return true;                      // calme désactivé → immédiat
  return (maintenant.getTime() - dernierMailLe.getTime()) >= calmeMinutes * MS_MINUTE;
}

/** PORTE DIAGNOSTIC : manuel → toujours (résultat immédiat pour Arno) ; auto → seulement si le calme est écoulé. PUR. */
export function vagueCloseeDiagnostic(input: { mode: ModeReleve; dernierMailLe: Date | null; maintenant: Date; calmeMinutes: number }): boolean {
  if (input.mode === 'manuel') return true;               // relève manuelle : Arno considère que tout est arrivé
  return calmeEcoule(input.dernierMailLe, input.maintenant, input.calmeMinutes);
}

/** PORTE ENVOI AUTO : TOUJOURS soumise au calme (indépendante du mode) — garde-fou PART-C, consommée par l'envoi de relance (PART-E). PUR. */
export function vagueCloseeEnvoi(input: { dernierMailLe: Date | null; maintenant: Date; calmeMinutes: number }): boolean {
  return calmeEcoule(input.dernierMailLe, input.maintenant, input.calmeMinutes);
}
