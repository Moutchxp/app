import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ui from './ordreModulesUi';
import { messageEchecReorg, MSG_REORG_SESSION, MSG_REORG_ECHEC } from './ordreModulesUi';

/**
 * DETTE « MENSONGE D'INTERFACE » SOLDÉE — le rangement des tuiles est self-service PAR COMPTE ; en voie de secours (sub=null)
 * la route renvoie 400 et l'écran affichait « Réorganisation non enregistrée » (comme une panne de données). On DIT désormais
 * le vrai motif, et on EMPÊCHE le geste (poignées inactives + contexte affiché AVANT la tentative). Ce filet verrouille (1) la
 * sélection PURE du message selon le statut HTTP et (2) le câblage (composant client non montable ici : garde par lecture de source).
 */
describe('messageEchecReorg — motif HONNÊTE selon le statut, jamais « panne de données » à tort', () => {
  // Voie de secours web retirée le 15/10/2026 (audit point A) ; ses textes, devenus inatteignables, sont retirés (accord d'Arno).
  it('400 → message d’échec générique : le texte « accès de secours » n’existe plus', () => {
    expect(messageEchecReorg(400)).toBe(MSG_REORG_ECHEC);
    expect(Object.values(ui).filter((v) => typeof v === 'string').join(' ')).not.toContain('secours');
  });
  it('401 → session expirée (une reconnexion, pas une perte de données)', () => {
    expect(messageEchecReorg(401)).toBe(MSG_REORG_SESSION);
    expect(MSG_REORG_SESSION).toContain('Session expirée');
  });
  it('autre statut (500, 403) ET coupure réseau (0) → message d’échec générique', () => {
    expect(messageEchecReorg(500)).toBe(MSG_REORG_ECHEC);
    expect(messageEchecReorg(403)).toBe(MSG_REORG_ECHEC);
    expect(messageEchecReorg(0)).toBe(MSG_REORG_ECHEC);
  });
  it('le contexte « accès de secours » au-dessus de la grille est retiré (plus d’export MSG_SECOURS_GRILLE ni MSG_REORG_SECOURS)', () => {
    expect('MSG_SECOURS_GRILLE' in ui).toBe(false);
    expect('MSG_REORG_SECOURS' in ui).toBe(false);
  });
});

describe('GrilleModules + page.tsx — empêchement AVANT le geste en voie de secours (garde de source)', () => {
  const grille = readFileSync(fileURLToPath(new URL('./GrilleModules.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  const page = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');

  it('page.tsx calcule `secours` (sub===null) et le passe à GrilleModules', () => {
    expect(page).toContain('const secours = session ? session.sub === null : false;');
    expect(page).toContain('<GrilleModules tuiles={tuiles} secours={secours} />');
  });
  it('GrilleModules reçoit toujours `secours`, mais n’affiche plus aucun texte « accès de secours » (bandeau, libellé, info-bulle)', () => {
    expect(grille).toContain('export function GrilleModules({ tuiles, secours = false }');
    expect(grille).not.toContain('MSG_SECOURS_GRILLE');
    expect(grille).not.toContain('accès de secours\'');
    expect(grille).not.toContain('Réordonner indisponible');
    expect(grille).not.toContain('Reconnectez-vous avec votre compte nommé');
    expect(grille).toContain('aria-label={`Réordonner la tuile ${tuile.libelle}`}');
  });
  it('en voie de secours : rendu STATIQUE (aucun DndContext monté) + poignées DÉSACTIVÉES', () => {
    expect(grille).toContain('{(!mounted || secours) ? (');   // le drag n'est monté QUE hors secours (et après hydratation)
    expect(grille).toContain('poigneeInactive={secours}');
    expect(grille).toContain('disabled={poigneeInactive}');
  });
  it('onDragEnd distingue le MOTIF via le statut (plus de message unique)', () => {
    expect(grille).toContain('messageEchecReorg(res.status)');
    // l'ancien message codé en dur dans onDragEnd a disparu (il vit désormais dans ordreModulesUi, choisi par statut).
    expect(grille).not.toContain("setErreur('Réorganisation non enregistrée");
  });
});
