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

describe('LOT 51-C / DURCI — sortirTestVersRattachement : « franchi le process » (altitudes ET emprises VALIDÉES par bâtiment)', () => {
  const s = lire('app/lib/permis/projectionFileRepo.ts');
  it('gate empreinte PUIS « franchi le process » (altitude_sommet_ngf_confirme_le + emprise_validee_id), SOURCE UNIQUE estValidationAcquise, `manque` explicite', () => {
    expect(s).toContain('export async function sortirTestVersRattachement');
    expect(s).toContain('altitude_sommet_ngf_confirme_le IS NULL'); // altitude VALIDÉE (pas seulement renseignée)
    expect(s).toContain('emprise_validee_id');                       // emprise VALIDÉE (migration 206)
    expect(s).toContain('estValidationAcquise(');                    // 🔴 même critère que le regroupement Rattachement/Surveillance
    expect(s).toContain("manque: 'empreinte'");
    expect(s).toMatch(/manque: sansAlt\.length > 0 \? 'altitude' : 'emprise'/); // le refus DIT lequel manque
  });
  it('🔴 SOURCE UNIQUE (§4) — le garde du bouton ET le regroupement Rattachement/Surveillance consomment le MÊME estValidationAcquise (jamais deux critères)', () => {
    expect(s).toContain('estValidationAcquise('); // garde du bouton (sortirTestVersRattachement)
    expect(lire('app/lib/permis/rattachementSuiviRepo.ts')).toContain('estValidationAcquise('); // appartenance (validationAcquise → groupe « en attente » vs « incomplet »)
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

describe('LOT 51-C — UI : sortie gardée, condition manquante affichée ; bouton « Valider » désormais rendu aussi pour un dossier testé (parité)', () => {
  const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
  it('bouton de sortie plein libellé + action serveur dédiée', () => {
    expect(s).toContain('Terminer l’analyse et passer en Rattachement');
    expect(s).toContain("action: 'sortir_vers_rattachement'");
  });
  it('l’écran DIT laquelle des deux conditions manque (jamais un bouton grisé muet)', () => {
    expect(s).toContain('Empreinte non validée');
    // LOT 71 — la condition altitude à TROIS états (sans objet ≠ satisfaite) vit dans le module PUR `etatSortieRattachement`
    //   (testé par etatSortieRattachement.test.ts) ; l'UI la câble et rend son texte.
    expect(s).toContain('conditionAltitudeSortie');
    expect(s).toContain('condAltitude.texte');
    expect(s).toContain('pretPourSortie'); // le bouton n'est actif QUE si empreinte OK ET altitude SATISFAITE (jamais « sans objet »)
    expect(lire('app/lib/permis/etatSortieRattachement.ts')).toContain('sans altitude de sommet (NGF)');
  });
  it('🔴 COMPLÉMENT — le bouton GLOBAL « Valider la projection » est RETIRÉ de l’écran (ne réapparaît nulle part) ; la sortie DÉDIÉE « Terminer l’analyse » subsiste', () => {
    expect(s).not.toContain('<BoutonValiderProjection');           // le vestige n’est plus rendu (validation PAR BÂTIMENT désormais)
    expect(lire('app/(admin)/admin/(protected)/permis/ProjectionRendu.tsx')).not.toContain('export function BoutonValiderProjection'); // ni défini
    expect(s).toContain("action: 'sortir_vers_rattachement'");     // « Terminer l’analyse » (arrêt des relances) subsiste pour un dossier testé
  });
  it('🔴 COMPLÉMENT — la CLÔTURE est le MÊME composant rendu à TROIS endroits (jamais des copies), condition unique clotureVisible', () => {
    expect(s).toContain('<ClotureVersRattachement');              // UN seul composant, dans le helper `rendreCloture`
    expect((s.match(/rendreCloture\(/g) ?? []).length).toBe(3);   // 3 rendus (① principal + ③ et ⑤ bouton) — décision Arno : plus de rendus en HAUT des blocs
    expect(s).toContain("rendreCloture('principal')");            // ① tête de fiche : message d'accompagnement
    expect(s).toContain("rendreCloture('bouton')");               // ③/⑤ : bouton seul (bas des deux blocs)
    expect(s).toContain('clotureVisible(');                       // VISIBILITÉ = source unique (partagée avec le repli « Analyse déjà à jour… » ET le n° en vert)
    expect(s).toContain("action: 'valider_permis'");              // écrit le marqueur de passage (même geste que l’auto-finalisation)
  });
  it('🔴 COMPLÉMENT — la ligne « Analyse déjà à jour… » RESTE quand le bouton n’est pas affiché (le bouton la remplace seulement s’il s’affiche)', () => {
    expect(s).toContain('Analyse déjà à jour');                   // la ligne (passageMsg) n'est pas supprimée
    expect(s).toContain('clotureVisibleIci'); expect(s).toContain('passageMsg'); // remplacement conditionnel (bouton OU la ligne)
  });
  it('la route 409 renvoie `manque` pour l’affichage', () => {
    expect(lire('app/(admin)/api/admin/permis/projection/route.ts')).toContain('manque: res.manque');
  });
});

describe('ENR-1 (LOT 1/2) — garde dédiée à l’envoi (« enregistré » = fait serveur), estValidationAcquise INCHANGÉ (garde de périmètre)', () => {
  const repo = lire('app/lib/permis/projectionFileRepo.ts');
  it('les DEUX chemins d’envoi (validerProjection ET sortirTestVersRattachement) appellent la garde lireCorpsNonEnregistres et refusent manque:enregistrement', () => {
    const vp = repo.slice(repo.indexOf('export async function validerProjection'), repo.indexOf('export type ResultatSortieTest'));
    expect(vp).toContain('lireCorpsNonEnregistres');
    expect(vp).toContain("manque: 'enregistrement'");
    const st = repo.slice(repo.indexOf('export async function sortirTestVersRattachement'));
    expect(st).toContain('lireCorpsNonEnregistres');
    expect(st).toContain("manque: 'enregistrement'");
  });
  it('la garde est un MIROIR NULL-safe de estConfirmeHumainement (IS TRUE / IS NOT TRUE), le sommet EXCLU (validé à part)', () => {
    expect(repo).toContain('IS TRUE AND');
    expect(repo).toContain('IS NOT TRUE');
    expect(repo).not.toContain('altitude_sommet_ngf_origine'); // le sommet a son propre geste de validation, hors enregistrement
  });
  it('🔴 PÉRIMÈTRE — estValidationAcquise (rattachementGroupes.ts) est INCHANGÉ : 3 args, même corps (regroupement Rattachement/surveillance intacts)', () => {
    const rg = lire('app/lib/permis/rattachementGroupes.ts');
    expect(rg).toContain('export function estValidationAcquise(nbCorps: number, nbSansAltitudeValidee: number, nbSansEmpriseValidee: number): boolean {');
    expect(rg).toContain('return nbCorps >= 1 && nbSansAltitudeValidee === 0 && nbSansEmpriseValidee === 0;');
    expect(rg).not.toContain('nbCorpsNonEnregistres'); // l'enregistrement n'entre PAS dans ce prédicat partagé (décision Arno)
  });
});

describe('ENR-1 (LOT 1/2) — UI ProjectionVue : mère, bandeau et bouton suivent le FAIT SERVEUR (honnête bloc replié)', () => {
  const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
  it('la mère se calcule sur des comptes portant nbCorpsNonEnregistres (repli file), sans dépendre de fraicheurBat', () => {
    expect(s).toContain('nbCorpsNonEnregistres: row?.nbCorpsNonEnregistres ?? 0');
  });
  it('le bandeau + bouton de clôture sont gatés par le fait serveur (jamais un faux « prêt » bloc replié)', () => {
    expect(s).toContain("(comptesMere.nbCorpsNonEnregistres ?? 0) === 0");
  });
  it('la carte « Terminer l’analyse » ajoute la 3e condition « bâtiments enregistrés » et gate le bouton', () => {
    expect(s).toContain('enregistrementOk');
    expect(s).toContain('Trois conditions requises');
  });
});
