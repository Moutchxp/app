import { describe, it, expect } from 'vitest';
import {
  nomMatcheFamille, nommageReglementaireAvere, evaluerFamille, evaluerCompletude, famillesSuiviesActives,
  FAMILLES_REF_DEFAUT, type FamilleRef, type ClassementMinimal,
} from './famillesRef';

// Petit référentiel de test : 2 historiques (détecteur de CONTENU) + 3 nouvelles (détectées par le NOM).
const masse: FamilleRef = { code: 'masse', libelle: 'Plan de masse', libelleCorps: 'le plan de masse (PC2)', ordre: 30, motifsNom: ['pc2', 'plan de masse'], detecteurContenu: 'masse', actif: true };
const cerfa: FamilleRef = { code: 'cerfa', libelle: 'Formulaire Cerfa', libelleCorps: 'le formulaire Cerfa', ordre: 10, motifsNom: ['cerfa', '13409'], detecteurContenu: 'cerfa', actif: true };
const situation: FamilleRef = { code: 'situation', libelle: 'Plan de situation (PC1)', libelleCorps: 'le plan de situation (PC1)', ordre: 20, motifsNom: ['pc1', 'plan de situation'], detecteurContenu: null, actif: true };
const facade: FamilleRef = { code: 'facade', libelle: 'Plans des façades (PC5)', libelleCorps: 'les plans des façades (PC5)', ordre: 60, motifsNom: ['pc5', 'facade', 'toiture'], detecteurContenu: null, actif: true };
const arrete: FamilleRef = { code: 'arrete', libelle: 'Arrêté', libelleCorps: 'l’arrêté', ordre: 90, motifsNom: ['arrete'], detecteurContenu: null, actif: true };

const cl = (nomFichier: string, famille: string | null = null): ClassementMinimal => ({ nomFichier, famille });

describe('nomMatcheFamille — détection par le nom (normalisée, frontière stricte pour « pcN »)', () => {
  it('code réglementaire PCn : « pc1 » matche PC1 mais PAS PC10 / PC11 (frontière de mot)', () => {
    expect(nomMatcheFamille('PC1_plan_situation.pdf', ['pc1'])).toBe(true);
    expect(nomMatcheFamille('_PC 93048 25 B0010-PC1_1_2.pdf', ['pc1'])).toBe(true); // nommage Sitadel réel
    expect(nomMatcheFamille('PC10-autre.pdf', ['pc1'])).toBe(false);
    expect(nomMatcheFamille('PC11.pdf', ['pc1'])).toBe(false);
  });
  it('mots-clés : accents et séparateurs (_ - espaces) sont neutralisés', () => {
    expect(nomMatcheFamille('Plan-de-Situation.PDF', ['plan de situation'])).toBe(true);
    expect(nomMatcheFamille('ARRÊTÉ_2024.pdf', ['arrete'])).toBe(true);      // accent retiré des deux côtés
    expect(nomMatcheFamille('facades_sud.pdf', ['facade'])).toBe(true);       // sous-chaîne
  });
  it('aucun motif ne matche un nom opaque', () => {
    expect(nomMatcheFamille('image.png', ['pc1', 'plan de situation'])).toBe(false);
  });
});

describe('evaluerFamille — 3 états (present / manquant / indetermine)', () => {
  it('famille à détecteur de CONTENU : présente si une pièce la porte (classement mémorisé), sinon MANQUANT (fiable)', () => {
    expect(evaluerFamille(masse, [cl('x.pdf', 'masse')], true).etat).toBe('present');
    expect(evaluerFamille(masse, [cl('x.pdf', 'coupe')], true).etat).toBe('manquant');
    expect(evaluerFamille(masse, [cl('x.pdf', 'coupe')], false).etat).toBe('manquant'); // détecteur contenu → « manquant » même sans nommage avéré
  });
  it('famille par NOM : présente si un nom matche', () => {
    const r = evaluerFamille(situation, [cl('PC1_situation.pdf')], false);
    expect(r.etat).toBe('present');
    expect(r.pieces).toEqual(['PC1_situation.pdf']);
  });
  it('famille par NOM absente + nommage réglementaire AVÉRÉ → manquant', () => {
    expect(evaluerFamille(situation, [cl('PC2_masse.pdf')], true).etat).toBe('manquant');
  });
  it('famille par NOM absente + noms OPAQUES (nommage NON avéré) → indetermine (jamais un faux manquant)', () => {
    expect(evaluerFamille(situation, [cl('image.png'), cl('scan.pdf')], false).etat).toBe('indetermine');
  });
});

describe('nommageReglementaireAvere — le dossier utilise-t-il des codes/mots réglementaires ?', () => {
  const refs = [masse, situation, facade];
  it('vrai dès qu’une pièce matche un motif d’UNE famille (code PCx…)', () => {
    expect(nommageReglementaireAvere([cl('PC2_masse.pdf'), cl('image.png')], refs)).toBe(true);
  });
  it('faux si aucune pièce n’a un nom réglementaire (que des scans opaques)', () => {
    expect(nommageReglementaireAvere([cl('image.png'), cl('doc1.pdf')], refs)).toBe(false);
  });
});

describe('evaluerCompletude — bout en bout, ordonné par le référentiel', () => {
  it('dossier PC2 + PC1 présents, PC5 absent (mais nommage avéré) → present/present/manquant, dans l’ordre', () => {
    const refs = [cerfa, situation, masse, facade]; // ordres 10,20,30,60
    const classements = [cl('_PC B0010-PC2_2_2.pdf', 'masse'), cl('PC1_situation.pdf')];
    const lignes = evaluerCompletude(classements, refs);
    expect(lignes.map((l) => l.code)).toEqual(['cerfa', 'situation', 'masse', 'facade']); // tri par ordre
    const etat = Object.fromEntries(lignes.map((l) => [l.code, l.etat]));
    expect(etat).toEqual({ cerfa: 'manquant', situation: 'present', masse: 'present', facade: 'manquant' }); // nommage avéré (PC1/PC2) → facade manquante
  });
  it('dossier aux noms OPAQUES → les familles par nom sont « à vérifier », jamais manquantes', () => {
    const refs = [situation, facade, arrete];
    const lignes = evaluerCompletude([cl('image.png'), cl('scan2.pdf')], refs);
    expect(lignes.every((l) => l.etat === 'indetermine')).toBe(true);
  });
});

describe('famillesSuiviesActives — activation HYBRIDE (4 historiques via config_veille, nouvelles via actif)', () => {
  const refs = [masse, situation, facade];
  it('une famille HISTORIQUE décochée dans config_veille est retirée ; les nouvelles ne sont pas affectées par ces interrupteurs', () => {
    const actives = famillesSuiviesActives(refs, { familleAttendueCerfa: true, familleAttendueMasse: false, familleAttendueCoupe: true, familleAttendueEtage: true });
    expect(actives.map((f) => f.code)).toEqual(['situation', 'facade']); // masse (historique) retirée ; situation/facade (nouvelles) conservées
  });
  it('une famille NOUVELLE avec actif=false est retirée ; l’ordre suit le référentiel', () => {
    const actives = famillesSuiviesActives([{ ...facade, actif: false }, situation, masse], { familleAttendueCerfa: true, familleAttendueMasse: true, familleAttendueCoupe: true, familleAttendueEtage: true });
    expect(actives.map((f) => f.code)).toEqual(['situation', 'masse']); // facade inactive écartée ; tri par ordre (20, 30)
  });
});

describe('FAMILLES_REF_DEFAUT — repli EN DUR = comportement historique (4 familles à détecteur de contenu)', () => {
  it('exactement les 4 familles historiques, toutes à détecteur de CONTENU (aucun « indéterminé » possible en repli)', () => {
    expect(FAMILLES_REF_DEFAUT.map((f) => f.code)).toEqual(['masse', 'coupe', 'etage', 'cerfa']);
    expect(FAMILLES_REF_DEFAUT.every((f) => f.detecteurContenu !== null)).toBe(true);
  });
});
