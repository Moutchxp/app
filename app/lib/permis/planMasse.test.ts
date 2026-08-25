import { describe, it, expect } from 'vitest';
import { scoreNomPlanMasse, classerPiecesPlanMasse, texteEstPlanMasse, pagePlanMasse, lireEchelleTexte, estPageCartouche, pagesPlanches, familleDeNom, estTracable, classerPiecesParFamille, type PieceScorable } from './planMasse';

// Noms RÉELS mesurés sur le dossier 11430 (cf. recon PROJ-3d).
const PLANS = [
  'PC2.1_Plan_de_masse_projet__20250402100339.pdf',
  'PC2.2_Plan_de_masse_existant__20250402100415.pdf',
  'PC39.2_Plan_de_masse__20250328160714.pdf',
  'PC40.2.1_Plan_de_masse__20250328161325.pdf',
  'ANNEXE_12_Plan_masse_paysage__20250402100504.pdf',
];
const CONTRE = [
  'PC1_Plan_de_situation__20250328155250.pdf',
  'PC3.1_Coupe_AA___20250328155505.pdf',
  'PC5.1_Plan_de_toitures__20250328155706.pdf',
  'PC4_Notice_architecturale_et_paysagere__20250402100536.pdf',
  'CERFA_13409_15_VF_signe___20250331171427.pdf',
];

describe('PROJ-3d — score par nom (0 faux positif / 0 faux négatif sur le dossier mesuré)', () => {
  it('tous les vrais plans de masse ont un score > 0', () => {
    for (const nom of PLANS) expect(scoreNomPlanMasse(nom), nom).toBeGreaterThan(0);
  });
  it('aucun contre-exemple n’est proposé (score 0)', () => {
    for (const nom of CONTRE) expect(scoreNomPlanMasse(nom), nom).toBe(0);
  });
  it('« projet » passe AVANT « existant » (on projette le futur)', () => {
    expect(scoreNomPlanMasse('PC2.1_Plan_de_masse_projet.pdf')).toBeGreaterThan(scoreNomPlanMasse('PC2.2_Plan_de_masse_existant.pdf'));
  });
  it('le code PC2 (R.431-9) compte, mais PC20 / PC39 / PC40 ne sont PAS des PC2', () => {
    expect(scoreNomPlanMasse('PC2_quelconque.pdf')).toBeGreaterThan(0);          // PC2 = plan de masse
    expect(scoreNomPlanMasse('PC20_autre_chose.pdf')).toBe(0);                   // PC20 ≠ PC2
    expect(scoreNomPlanMasse('PC39_Notice_accessibilite.pdf')).toBe(0);         // PC39 sans « plan de masse » → 0
  });
});

describe('PROJ-3d — classement : proposées triées, repli garanti', () => {
  const pieces: PieceScorable[] = [
    { id: 1, nomFichier: 'PC1_Plan_de_situation.pdf', typeMime: 'application/pdf' },
    { id: 2, nomFichier: 'PC2.2_Plan_de_masse_existant.pdf', typeMime: 'application/pdf' },
    { id: 3, nomFichier: 'PC3.1_Coupe_AA.pdf', typeMime: 'application/pdf' },
    { id: 4, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', typeMime: 'application/pdf' },
    { id: 5, nomFichier: 'ANNEXE_12_Plan_masse_paysage.pdf', typeMime: 'application/pdf' },
  ];
  it('proposées = les 3 plans, PROJET en tête ; autres = le reste dans l’ordre', () => {
    const { proposees, autres } = classerPiecesPlanMasse(pieces);
    expect(proposees.map((p) => p.id)).toEqual([4, 2, 5]); // projet(195) > existant(175) > paysage(100)
    expect(autres.map((p) => p.id)).toEqual([1, 3]);       // situation + coupe, ordre d'origine
    // REPLI : aucune pièce perdue
    expect(proposees.length + autres.length).toBe(pieces.length);
  });
});

describe('PROJ-3d — confirmation par texte + numéro de page', () => {
  it('texteEstPlanMasse : « plan de masse » dans le texte', () => {
    expect(texteEstPlanMasse('… PC2.1 PLAN DE MASSE projet éch. 1:1000 …')).toBe(true);
    expect(texteEstPlanMasse('Coupe AA sur le terrain naturel')).toBe(false);
  });
  it('pagePlanMasse : première page plan de masse (1-based), sinon null', () => {
    expect(pagePlanMasse(['garde', 'PLAN DE MASSE', 'coupe'])).toBe(2);
    expect(pagePlanMasse(['texte', 'texte'])).toBeNull();
  });
});

describe('PROJ-3g — familles décidées au NOM (noms réels mesurés sur 11430 et 11434)', () => {
  it('MASSE (inchangé, prioritaire)', () => {
    for (const n of ['PC2.1_Plan_de_masse_projet.pdf', 'ANNEXE_12_Plan_masse_paysage.pdf', 'PC2_2D_PDM.pdf'])
      expect(familleDeNom(n), n).toBe('masse');
  });
  it('ÉTAGE : « plan du R+n / RDC / niveau »', () => {
    for (const n of ['ANNEXE_5_Plan_du_RDC.pdf', 'ANNEXE_6_Plan_du_R_1.pdf', 'PC40.4.7_Plan_R_5___SSI.pdf', 'PC39.9_Plan_du_R_5.pdf'])
      expect(familleDeNom(n), n).toBe('etage');
  });
  it('COUPE / façade (élévations) : « coupe », « façade », code PC3', () => {
    for (const n of ['PC3.1_Coupe_AA.pdf', 'PC5.2_Facade_Est.pdf', 'PC3_2D_PDM.pdf', 'PYTHON_EMS_PC40.5_Coupes.pdf'])
      expect(familleDeNom(n), n).toBe('coupe');
  });
  it('CONTRE-EXEMPLES : notice / cerfa / avis / situation / toitures → hors bande (null)', () => {
    for (const n of ['PC4_Notice_architecturale.pdf', 'CERFA_13409_15.pdf', 'AVIS ABF.pdf', 'PC1_Plan_de_situation.pdf', 'PC5.1_Plan_de_toitures.pdf', 'PC33_1_2D_PDM.pdf'])
      expect(familleDeNom(n), n).toBeNull();
  });
  it('VERROU : seul « masse » est traçable', () => {
    expect(estTracable('masse')).toBe(true);
    expect(estTracable('etage')).toBe(false);
    expect(estTracable('coupe')).toBe(false);
    expect(estTracable(null)).toBe(false);
  });
  it('classerPiecesParFamille : ordre masse → étage → coupe ; repli garanti', () => {
    const pieces: PieceScorable[] = [
      { id: 1, nomFichier: 'PC3.1_Coupe_AA.pdf', typeMime: 'application/pdf' },
      { id: 2, nomFichier: 'ANNEXE_6_Plan_du_R_1.pdf', typeMime: 'application/pdf' },
      { id: 3, nomFichier: 'PC2.1_Plan_de_masse_projet.pdf', typeMime: 'application/pdf' },
      { id: 4, nomFichier: 'PC4_Notice.pdf', typeMime: 'application/pdf' },
    ];
    const { proposees, autres } = classerPiecesParFamille(pieces);
    expect(proposees.map((p) => `${p.id}:${p.famille}`)).toEqual(['3:masse', '2:etage', '1:coupe']);
    expect(autres.map((p) => p.id)).toEqual([4]); // la notice reste atteignable au repli
  });
});

describe('PROJ-3f — cartouche exclu, pièce multi-pages éclatée en planches (pur)', () => {
  it('estPageCartouche : le TITRE réglementaire est un signal d’EXCLUSION (inverse de PROJ-3d)', () => {
    // page de garde PC2 mesurée sur 07512025V0035
    expect(estPageCartouche('PC2 PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER — bureaux d’études')).toBe(true);
    expect(estPageCartouche('constructions à modifier')).toBe(true);
    // une planche NE porte PAS ce titre
    expect(estPageCartouche('cotes 128.40 NGF, limite de parcelle, R+5')).toBe(false);
  });
  it('pièce MULTI-PAGES (forme mesurée sur PC2_2D_PDM) : cartouche exclu, texte + planches gardés', () => {
    // p1 = cartouche titré, p2-3 = texte, p4-8 = planches (sans le titre)
    const pages = [
      'PC2 PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER',
      'nomenclature des surfaces …',
      'plan de situation 1/10000',
      'planche : implantation R+5', 'planche : niveaux', 'planche A0', 'planche A0', 'planche A0',
    ];
    expect(pagesPlanches(pages)).toEqual([2, 3, 4, 5, 6, 7, 8]); // page 1 (cartouche) EXCLUE, le reste feuilletable
  });
  it('pièce MONO-PAGE (cas 11430) : la page est gardée même si elle porte le titre (titre + dessin coexistent) — non-régression', () => {
    expect(pagesPlanches(['PC2.1 PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER — le dessin est ici'])).toEqual([1]);
  });
  it('pièce SCANNÉE (aucune couche texte) : rien n’est reconnu cartouche → TOUTES les pages entrent (jamais bloquant)', () => {
    expect(pagesPlanches(['', '', ''])).toEqual([1, 2, 3]);
  });
  it('pièce illisible (0 page) → [] (l’appelant repliera sur la page 1)', () => {
    expect(pagesPlanches([])).toEqual([]);
  });
});

describe('PROJ-3d — lecture d’échelle : gardes anti-faux-positifs mesurés', () => {
  it('accepte « 1:1000 » et « 1:200 » (deux-points, dans la plage)', () => {
    expect(lireEchelleTexte('PLAN DE MASSE  éch 1:1000')).toBe('1:1000');
    expect(lireEchelleTexte('coupe 1:200')).toBe('1:200');
  });
  it('REJETTE « 1:46 » (hors plage — légende mesurée sur ANNEXE_12)', () => {
    expect(lireEchelleTexte('repère 1:46 en légende')).toBeNull();
  });
  it('REJETTE « 1/15 » isolé (numéro de page mesuré sur PC4) — pas de contexte « éch »', () => {
    expect(lireEchelleTexte('Notice architecturale page 1/15')).toBeNull();
  });
  it('accepte « 1/500 » SEULEMENT avec le contexte « échelle »', () => {
    expect(lireEchelleTexte('échelle 1/500')).toBe('1:500');
  });
  it('rien de plausible → null (jamais inventé)', () => {
    expect(lireEchelleTexte('aucune échelle ici')).toBeNull();
  });
});
