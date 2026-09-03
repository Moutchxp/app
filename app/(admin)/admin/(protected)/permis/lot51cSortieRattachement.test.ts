import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LOT 51-C — câblage (source) de la sortie définitive vers Rattachement. La PREUVE de comportement (arrêt exhaustif des trois systèmes)
 * est dans l'itest `app/lib/permis/sortieTestRelances.itest.ts` (vraie base). Ici : gardes de source pour que le câblage ne régresse pas.
 */
const lire = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

describe('LOT 51-C — arreterToutesRelances : LES DEUX gestes (aucun seul ne suffit)', () => {
  const s = lire('app/lib/permis/arretRelances.ts');
  it('pose statut=close ET partiel_leve_le dans la même fonction', () => {
    expect(s).toContain("SET statut = 'close'");
    expect(s).toContain('partiel_leve_le = now()');
  });
  it('close est gardé à une demande envoyee (mêmes bornes que cloturerDemande) et journalisé', () => {
    expect(s).toContain("if (statut === 'envoyee')");
    expect(s).toContain('INSERT INTO demande_journal');
  });
  it('documente pourquoi aucun geste seul ne suffit (connaissance qui doit survivre)', () => {
    expect(s.includes('aucun geste seul ne suffit') || s.includes('AUCUN POINT UNIQUE')).toBe(true);
    expect(s).toContain('RÉACTIVE'); // lever le partiel réactiverait la cascade ordinaire
  });
});

describe('LOT 51-C — sortirTestVersRattachement : double condition + atomicité + altitude PAR CORPS', () => {
  const s = lire('app/lib/permis/projectionFileRepo.ts');
  it('gate empreinte PUIS altitude (permis_corps_batiment.altitude_sommet_ngf), avec `manque` explicite', () => {
    expect(s).toContain('export async function sortirTestVersRattachement');
    expect(s).toContain('altitude_sommet_ngf IS NULL');                 // altitude PAR CORPS
    expect(s).toContain("manque: 'empreinte'");
    expect(s).toContain("manque: 'altitude'");
  });
  it('l’altitude n’entre PAS dans la validation NORMALE (validerProjection inchangée sur ce point)', () => {
    // Le CORPS de validerProjection (jusqu'au type ResultatSortieTest) ne lit jamais altitude_sommet_ngf : la condition altitude est
    //   propre à sortirTestVersRattachement (décision porteur : ne pas changer le comportement des dossiers ordinaires).
    const corpsValider = s.slice(s.indexOf('export async function validerProjection'), s.indexOf('export type ResultatSortieTest'));
    expect(corpsValider).not.toContain('altitude_sommet_ngf');
  });
  it('en UNE transaction : projection + arrêt exhaustif + effacement du marqueur test', () => {
    const bloc = s.slice(s.indexOf('export async function sortirTestVersRattachement'));
    expect(bloc).toContain('ecrireProjectionValidee(q');
    expect(bloc).toContain('arreterToutesRelances(q');
    expect(bloc).toContain('DELETE FROM dossier_test_analyse');
  });
});

describe('LOT 51-C — UI : sortie gardée, condition manquante affichée, bouton normal masqué pour un dossier testé', () => {
  const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
  it('bouton de sortie plein libellé + action serveur dédiée', () => {
    expect(s).toContain('Terminer l’analyse et passer en Rattachement');
    expect(s).toContain("action: 'sortir_vers_rattachement'");
  });
  it('l’écran DIT laquelle des deux conditions manque (jamais un bouton grisé muet)', () => {
    expect(s).toContain('Empreinte non validée');
    expect(s).toContain('sans altitude de sommet (NGF)');
    expect(s).toContain('pretSortie'); // le bouton n'est actif QUE si les deux conditions sont vertes
  });
  it('le bouton « Valider » NORMAL est masqué pour un dossier testé (chemin qui n’arrête pas les relances)', () => {
    expect(s).toContain('!row?.testeEnAnalyse && (');
  });
  it('la route 409 renvoie `manque` pour l’affichage', () => {
    expect(lire('app/(admin)/api/admin/permis/projection/route.ts')).toContain('manque: res.manque');
  });
});
