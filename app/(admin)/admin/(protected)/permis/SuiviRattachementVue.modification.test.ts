import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * RATT-EDIT (lot B2) — GARDE PAR LECTURE DE SOURCE du câblage dans SuiviRattachementVue (l'onglet Rattachement monte des composants clients
 * LOURDS — CaracteristiquesBloc, BlocTraceEmprise pdf.js — non montables unitairement ; on garde donc la STRUCTURE, à la manière de LOT 86).
 * On prouve : verrou fermé par défaut (lecture seule pour tous), bouton « Modifier » gaté par la capacité, pop-up 1, éditeur d'emprise monté
 * SEULEMENT déverrouillé, permis qui NE redescend PAS en Analyse, et Analyse et projection STRICTEMENT inchangé.
 */
const ici = dirname(fileURLToPath(import.meta.url));
const vue = readFileSync(join(ici, 'SuiviRattachementVue.tsx'), 'utf8');
const tuile = readFileSync(join(ici, 'PermisTuile.tsx'), 'utf8');
const page = readFileSync(join(ici, 'page.tsx'), 'utf8');
const projection = readFileSync(join(ici, 'ProjectionVue.tsx'), 'utf8');
const rendu = readFileSync(join(ici, 'SuiviRattachementRendu.tsx'), 'utf8');

describe('B2 — verrou par défaut : altitude en lecture seule tant que la modification n’est pas déverrouillée', () => {
  it('état modifOuverte initialisé à FALSE (verrouillé pour tous, admin compris)', () => {
    expect(vue).toContain('const [modifOuverte, setModifOuverte] = useState(false)');
  });
  it('CaracteristiquesBloc reçoit lectureSeule = !modifOuverte (édition d’altitude verrouillée par défaut)', () => {
    expect(vue).toContain('lectureSeule={!modifOuverte}');
  });
  it('le verrou est REMIS À ZÉRO à chaque changement de dossier (jamais un verrou ouvert hérité)', () => {
    expect(vue).toContain('setModifOuverte(false); setPopupModif(false);');
  });
});

describe('B2 — bouton « Modifier » gaté par la capacité + pop-up 1', () => {
  it('le bandeau reçoit peutModifier = peutModifierPermis (bouton absent sans la capacité)', () => {
    expect(vue).toContain('peutModifier={peutModifierPermis}');
    expect(vue).toContain('<BandeauModificationValidation');
  });
  it('« Modifier » ouvre la pop-up 1 ; sa CONFIRMATION (et elle seule) déverrouille ; « Annuler » ne déverrouille rien', () => {
    expect(vue).toContain('onDemander={() => setPopupModif(true)}');
    expect(vue).toContain('<PopUpConfirmerModification');
    expect(vue).toContain('onConfirmer={() => { setModifOuverte(true); setPopupModif(false); }}');
    expect(vue).toContain('onAnnuler={() => setPopupModif(false)}');
    // La pop-up n'est montée que lorsqu'elle est demandée (popupModif).
    expect(vue).toContain('{popupModif && (');
  });
});

describe('B2 — éditeur d’emprise monté seulement déverrouillé ; le permis reste dans Rattachement', () => {
  it('BlocTraceEmprise (éditeur de polygone) est monté UNIQUEMENT sous la condition modifOuverte', () => {
    expect(vue).toContain("import { BlocTraceEmprise } from './BlocTraceEmprise'");
    // le montage de l'éditeur est gardé par modifOuverte (jamais chargé en consultation).
    expect(vue).toMatch(/\{modifOuverte && \([\s\S]*?<BlocTraceEmprise dossierId=\{detail\.dossierId\} \/>/);
  });
  it('le flux de modification n’appelle AUCUNE action de rattachement (valider/clore/retour_lidar) → le permis ne redescend pas', () => {
    // On isole le bloc de la pop-up + du bandeau : il ne doit contenir que des bascules d'état local (setModifOuverte/setPopupModif).
    const iBandeau = vue.indexOf('<BandeauModificationValidation');
    const iFin = vue.indexOf('<PopUpConfirmerModification');
    const bloc = vue.slice(iBandeau, iFin);
    expect(iBandeau).toBeGreaterThan(-1);
    expect(iFin).toBeGreaterThan(iBandeau);
    // On cible la CHARGE utile d'un POST de décision (`action: '…'`), pas le mot nu : « Revalider » (B3) contient « valider » sans être une décision.
    for (const action of ['valider', 'clore', 'retour_lidar', 'ouvrir_manuel'])
      expect(bloc, `le déverrouillage ne doit pas déclencher « ${action} »`).not.toContain(`action: '${action}'`);
  });
});

describe('B2 — plomberie de la capacité peutModifierPermis (serveur → tuile → vue)', () => {
  it('page.tsx (serveur) calcule peutModifierPermis depuis la session et le passe à PermisTuile', () => {
    expect(page).toContain('sessionDepuisPayload');
    expect(page).toContain('session?.peutModifierPermis ?? false');
    expect(page).toContain('peutModifierPermis={peutModifierPermis}');
  });
  it('PermisTuile thread peutModifierPermis à l’onglet Rattachement', () => {
    expect(tuile).toContain('peutModifierPermis');
    expect(tuile).toMatch(/onglet === 'rattachement'[\s\S]*peutModifierPermis=\{peutModifierPermis\}/);
  });
});

describe('B2 — Analyse et projection STRICTEMENT inchangé', () => {
  // LOT 1 (parité fiche) — ProjectionVue délègue désormais les 6 blocs au composant PARTAGÉ FichePermisBlocs, monté en mode 'analyse'. Le
  //   verrou de saisie (lectureSeule) n'existe QU'en 'rattachement' et n'est activé qu'après « Modifier » (lot 2) → en analyse, jamais.
  const fiche = readFileSync(join(ici, 'FichePermisBlocs.tsx'), 'utf8');
  it('Analyse monte la fiche partagée en mode « analyse » → saisie ÉDITABLE (le verrou lectureSeule est gaté par le mode, jamais actif ici)', () => {
    expect(projection).toContain('mode="analyse"');                 // ProjectionVue → FichePermisBlocs en mode analyse
    expect(fiche).toContain("mode === 'rattachement' && !edition"); // lectureSeule GATÉ par le mode → false en analyse (instruction normale éditable)
    expect(projection).not.toContain('lectureSeule');               // le parent Analyse n'a plus à connaître le verrou (il vit dans la fiche, gaté)
  });
  it('ni ProjectionVue ni la fiche partagée ne connaissent le verrou/la pop-up de modification (aucune contagion du lot B2 dans Analyse)', () => {
    for (const src of [projection, fiche]) {
      expect(src).not.toContain('BandeauModificationValidation'); // l'UI d'édition verrouillée vit dans SuiviRattachementVue (Rattachement), pas ici
      expect(src).not.toContain('PopUpConfirmerModification');
      expect(src).not.toContain('modifOuverte');
    }
  });
});

describe('B3 — revalidation en place + marqueur persistant + trace', () => {
  it('marqueur PERSISTANT servi par le SERVEUR (detail.modifieDepuisValidation) → survit au rechargement, vaut pour tout utilisateur (jamais un état local)', () => {
    expect(vue).toContain('detail.modifieDepuisValidation');
  });
  it('BADGE sur la ligne fermée (l.modifieApresValidation) → visible SANS déplier', () => {
    expect(rendu).toContain('l.modifieApresValidation');
    expect(rendu).toMatch(/modifié\s*—\s*à revalider/);
  });
  it('la trace « qui / quand » (derniereModif) est affichée dans le détail', () => {
    expect(vue).toContain('detail.derniereModif');
  });
  it('bouton « Revalider » gaté par la capacité peutModifierPermis + pop-up 2', () => {
    expect(vue).toMatch(/peutModifierPermis && \(modifOuverte \|\| detail\.modifieDepuisValidation\)/);
    expect(vue).toContain('<PopUpConfirmerRevalidation');
    expect(vue).toContain("setPopupReval(true)");
  });
  it('la revalidation POSTe l’action « revalider » et rafraîchit le détail (marqueur effacé sans rechargement)', () => {
    const iReval = vue.indexOf('const revalider = useCallback');
    const bloc = vue.slice(iReval, iReval + 1400);
    expect(bloc).toContain("action: 'revalider'");
    expect(bloc).toContain('if (d.detail) setDetail(d.detail)'); // le détail à jour porte modifieDepuisValidation=false
  });
  it('la revalidation ne déclenche AUCUNE action qui ferait redescendre le permis (valider/refuser/clore/retour) — il reste dans Rattachement', () => {
    const iReval = vue.indexOf('const revalider = useCallback');
    const bloc = vue.slice(iReval, iReval + 1400);
    for (const a of ["'valider'", "'refuser'", "'retour_lidar'", "'clore'", "'ouvrir_manuel'"])
      expect(bloc, `la revalidation ne doit pas émettre ${a}`).not.toContain(a);
  });
  it('Analyse et projection : AUCUNE contagion de la revalidation', () => {
    expect(projection).not.toContain('revalider');
    expect(projection).not.toContain('modifieDepuisValidation');
    expect(projection).not.toContain('PopUpConfirmerRevalidation');
  });
});

describe('C1 — restauration de la validation d’origine', () => {
  it('bouton « Restaurer la validation d’origine » gaté par la capacité + pop-up 3', () => {
    expect(vue).toContain('peutModifierPermis && (');
    expect(vue).toContain('Restaurer la validation d’origine');
    expect(vue).toContain('<PopUpConfirmerRestauration');
    expect(vue).toContain('setPopupRestau(true)');
  });
  it('AUCUNE version restaurable → message honnête, jamais un bouton qui échoue', () => {
    expect(vue).toContain('detail.versionsRestaurables.length === 0');
    expect(vue).toContain('Aucune validation d’origine enregistrée pour ce permis');
  });
  it('sélecteur de version si plusieurs (choix explicite, date + auteur en clair)', () => {
    expect(vue).toContain('versions.length > 1');
    expect(vue).toContain('libelleVersionRestaurable');
    expect(vue).toContain('setVersionRestauId(Number(e.target.value))');
  });
  it('la restauration POSTe l’action « restaurer » {gelId} et rafraîchit le détail (marqueur ON, versions à jour)', () => {
    const iReset = vue.indexOf('const restaurer = useCallback');
    const bloc = vue.slice(iReset, iReset + 1400);
    expect(bloc).toContain("action: 'restaurer'");
    expect(bloc).toContain('gelId');
    expect(bloc).toContain('if (d.detail) setDetail(d.detail)');
  });
  it('la restauration ne déclenche AUCUNE action qui ferait redescendre le permis (valider/refuser/clore/retour)', () => {
    const iReset = vue.indexOf('const restaurer = useCallback');
    const bloc = vue.slice(iReset, iReset + 1400);
    for (const a of ["'valider'", "'refuser'", "'retour_lidar'", "'clore'", "'ouvrir_manuel'"])
      expect(bloc, `la restauration ne doit pas émettre ${a}`).not.toContain(a);
  });
  it('Analyse et projection : AUCUNE contagion de la restauration', () => {
    expect(projection).not.toContain('restaurer');
    expect(projection).not.toContain('versionsRestaurables');
    expect(projection).not.toContain('PopUpConfirmerRestauration');
  });
});
