import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  messageEchecReorg,
  MSG_REORG_SECOURS,
  MSG_REORG_SESSION,
  MSG_REORG_ECHEC,
  MSG_SECOURS_GRILLE,
} from './ordreModulesUi';

/**
 * DETTE « MENSONGE D'INTERFACE » SOLDÉE — le rangement des tuiles est self-service PAR COMPTE ; en voie de secours (sub=null)
 * la route renvoie 400 et l'écran affichait « Réorganisation non enregistrée » (comme une panne de données). On DIT désormais
 * le vrai motif, et on EMPÊCHE le geste (poignées inactives + contexte affiché AVANT la tentative). Ce filet verrouille (1) la
 * sélection PURE du message selon le statut HTTP et (2) le câblage (composant client non montable ici : garde par lecture de source).
 */
describe('messageEchecReorg — motif HONNÊTE selon le statut, jamais « panne de données » à tort', () => {
  it('400 (voie de secours) → message « compte nommé », sans jargon (pas « 400 », pas « self-service »)', () => {
    expect(messageEchecReorg(400)).toBe(MSG_REORG_SECOURS);
    expect(MSG_REORG_SECOURS).toContain('accès de secours');
    expect(MSG_REORG_SECOURS).toContain('compte nommé');
    expect(MSG_REORG_SECOURS).not.toContain('400');
    expect(MSG_REORG_SECOURS.toLowerCase()).not.toContain('self-service');
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
  it('le contexte de secours DIT que c’est l’ordre par défaut et que rien n’est perdu (lecture honnête)', () => {
    expect(MSG_SECOURS_GRILLE).toContain('ordre par défaut');
    expect(MSG_SECOURS_GRILLE).toContain('n’est pas perdu');
    expect(MSG_SECOURS_GRILLE).toContain('compte nommé');
  });
});

describe('GrilleModules + page.tsx — empêchement AVANT le geste en voie de secours (garde de source)', () => {
  const grille = readFileSync(fileURLToPath(new URL('./GrilleModules.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  const page = readFileSync(fileURLToPath(new URL('./page.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');

  it('page.tsx calcule `secours` (sub===null) et le passe à GrilleModules', () => {
    expect(page).toContain('const secours = session ? session.sub === null : false;');
    expect(page).toContain('<GrilleModules tuiles={tuiles} secours={secours} />');
  });
  it('GrilleModules reçoit `secours` et affiche le CONTEXTE au-dessus de la grille AVANT toute tentative', () => {
    expect(grille).toContain('export function GrilleModules({ tuiles, secours = false }');
    expect(grille).toContain('{secours && (');
    expect(grille).toContain('MSG_SECOURS_GRILLE');
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
