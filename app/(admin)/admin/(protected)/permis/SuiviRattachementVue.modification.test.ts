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
    for (const action of ['valider', 'clore', 'retour_lidar', 'ouvrir_manuel'])
      expect(bloc, `le déverrouillage ne doit pas déclencher « ${action} »`).not.toContain(action);
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
  it('ProjectionVue monte CaracteristiquesBloc SANS lectureSeule (l’instruction normale reste éditable)', () => {
    expect(projection).toContain('<CaracteristiquesBloc');
    expect(projection).not.toContain('lectureSeule');
  });
  it('ProjectionVue ne connaît ni le verrou ni la pop-up de modification (aucune contagion)', () => {
    expect(projection).not.toContain('BandeauModificationValidation');
    expect(projection).not.toContain('PopUpConfirmerModification');
    expect(projection).not.toContain('modifOuverte');
  });
});
