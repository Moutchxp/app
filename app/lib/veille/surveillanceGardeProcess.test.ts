import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔑 D2 — GARDE ABSOLUE (axe F de la recon). La séparation des deux process (Téléservice / E-mail) est une opération
 * d'AFFICHAGE, EN AVAL. Les 6 requêtes de SURVEILLANCE JURIDIQUE (échéance, saisine CADA, relance, alerte, relève) doivent voir
 * TOUS les process : leur ajouter un filtre `dest_canal` sortirait des demandes de la surveillance EN SILENCE (ex. forclusion
 * CADA d'une demande téléservice). Part 1 : « ajouter un SELECT ou un champ en lecture y est permis ; ajouter un WHERE est
 * INTERDIT ». Ce test CASSE si un `dest_canal` apparaît en position de FILTRE dans l'une de ces 6 requêtes.
 *
 * Méthode : on lit le source, on isole le CORPS de la fonction/const nommée (self-check par une ancre distinctive : si
 * l'extraction rate, l'ancre manque → le test échoue bruyamment), on retire les commentaires JS, puis on interdit `dest_canal`
 * suivi d'un opérateur de prédicat. Un `SELECT d.dest_canal AS canal` (lecture, pour l'affichage) reste autorisé.
 */

const RACINE = process.cwd();
function lire(rel: string): string {
  return readFileSync(join(RACINE, rel), 'utf8');
}

/** Frontière = début de la PROCHAINE déclaration top-level (fonction/const/méthode deps) → borne le corps courant. */
const FRONTIERE = /\n(?:export\s+)?(?:async\s+)?function\s+\w+|\n {2,}\w+\s*:\s*async\b|\nconst\s+[A-Z0-9_]+\s*=|\nexport\s+(?:async\s+)?const\b/;

function corps(src: string, marqueur: string): string {
  const debut = src.indexOf(marqueur);
  if (debut < 0) throw new Error(`marqueur introuvable : ${marqueur}`);
  const reste = src.slice(debut + marqueur.length);
  const m = FRONTIERE.exec(reste);
  const slice = m ? reste.slice(0, m.index) : reste;
  // Retire les commentaires JS (// … et /* … */) pour ne pas piéger sur un commentaire mentionnant dest_canal.
  return slice.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** `dest_canal` en position de PRÉDICAT (filtre) — comparaison, IN/IS/NOT/LIKE. Un `dest_canal AS`/`dest_canal,` (SELECT) NE matche PAS. */
const FILTRE_DEST_CANAL = /dest_canal\s*(?:=|<>|!=|>=|<=|>|<)|dest_canal\s+(?:IN|IS|NOT|LIKE|SIMILAR)\b/i;

// Les 6 requêtes de surveillance (fichier, marqueur de fonction, ancre distinctive de son corps).
const REQUETES_SURVEILLANCE = [
  { nom: 'chargerDemandesSuivi (source En cours + Réponses)', fichier: 'app/lib/veille/reponsesSuivi.ts', marqueur: 'export async function chargerDemandesSuivi', ancre: 'nb_reponses_reelles' },
  { nom: 'lireSaisinesEligibles / SQL_CANDIDATS (saisine CADA due)', fichier: 'app/lib/veille/saisineCadaRepo.ts', marqueur: 'const SQL_CANDIDATS', ancre: 'refus_expres' },
  { nom: 'lireDemandesEnvoyees (cascade de relance)', fichier: 'app/lib/veille/relanceAuto.ts', marqueur: 'lireDemandesEnvoyees: async', ancre: 'profil_demandeur = $1' },
  { nom: 'chargerEntreeAlerte (alerte quotidienne échéances)', fichier: 'app/lib/veille/alerteAuto.ts', marqueur: 'export async function chargerEntreeAlerte', ancre: 'demandesEcheance' },
  { nom: 'lireEnvoyees (relève des réponses)', fichier: 'app/lib/veille/releveReponses.ts', marqueur: 'async function lireEnvoyees', ancre: 'message_ids' },
  { nom: 'lireCandidatsSaisine (envoi/dépôt de la saisine)', fichier: 'app/lib/sitadel/envoiSaisineCada.ts', marqueur: 'export async function lireCandidatsSaisine', ancre: 'demande_acheminement' },
] as const;

describe('🔑 D2 — aucune requête de surveillance juridique ne filtre par process (dest_canal)', () => {
  for (const q of REQUETES_SURVEILLANCE) {
    it(`${q.nom} : corps extrait correctement ET aucun filtre dest_canal`, () => {
      const c = corps(lire(q.fichier), q.marqueur);
      // Self-check : l'ancre prouve qu'on lit bien le corps de CETTE requête (sinon l'absence de dest_canal ne prouverait rien).
      expect(c, `ancre « ${q.ancre} » absente → extraction du corps erronée`).toContain(q.ancre);
      // 🔴 Le verrou : dest_canal en position de filtre est INTERDIT dans ces requêtes.
      expect(FILTRE_DEST_CANAL.test(c), `un filtre dest_canal est apparu dans « ${q.nom} » — il sortirait des demandes de la surveillance en silence`).toBe(false);
    });
  }

  it('le détecteur de filtre distingue bien un FILTRE (interdit) d’un SELECT (autorisé)', () => {
    // Garde-fou du garde-fou : la regex doit matcher un WHERE, pas un SELECT.
    expect(FILTRE_DEST_CANAL.test("WHERE d.dest_canal = 'email'")).toBe(true);
    expect(FILTRE_DEST_CANAL.test('AND d.dest_canal IN (\'email\')')).toBe(true);
    expect(FILTRE_DEST_CANAL.test('SELECT d.dest_canal AS canal')).toBe(false);
    expect(FILTRE_DEST_CANAL.test('SELECT d.dest_canal, d.statut')).toBe(false);
  });
});
