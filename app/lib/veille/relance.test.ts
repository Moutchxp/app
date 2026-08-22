import { describe, it, expect } from 'vitest';
import { genererRelance, IdentiteIncompleteError, AucunDossierNonSatisfaitError, DELAI_SAISINE_JOURS, type EntreeRelance, type VarianteRelance } from './relance';
import type { Lot, CandidatDossier, ConfigDemandeur, Piece } from '../sitadel/demande';

/**
 * Lot 1/6 — CASCADE de relance (PURE) : 3 variantes ('rappel' J-10, 'avis' J-3, 'saisine' jour J), structure commune en 12 points,
 * excuse préventive en tête, historique en fin, bascule référence interne / numéro de permis, liste close d'articles. Aucun envoi.
 */
const DOSSIER1: CandidatDossier = {
  dossierId: 1, codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', type: 'PC', numDau: 'PC0920042500001',
  dateReelleAutorisation: '2025-06-15', adresse: '12 rue de la Paix', codePostal: '92600', cadastre: ['AB 12'],
  etatDau: null, absentDuDernierMillesime: false,
};
const DOSSIER2: CandidatDossier = { ...DOSSIER1, dossierId: 2, numDau: 'PC0920042500002', adresse: '8 avenue des Fleurs' };
const LOT: Lot = { codeInsee: '92004', communeNom: 'Asnieres', canal: 'email', dossiers: [DOSSIER1, DOSSIER2] };
const LOT_UN: Lot = { ...LOT, dossiers: [DOSSIER1] };

const PIECES: Piece[] = [
  { code: 'PC2', description: 'plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme' },
  { code: 'PC3', description: 'plan en coupe du terrain et de la construction' },
];

const CONFIG_ENT: ConfigDemandeur = {
  raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
  representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
};
const CONFIG_PERS: ConfigDemandeur = {
  raisonSociale: '', formeJuridique: '', siegeAdresse: '12 rue des Lilas, 92000 Nanterre',
  representantNom: 'Jean Dupont', representantQualite: '', emailContact: 'jean.dupont@exemple.fr', telephone: '',
};

function entree(over: Partial<EntreeRelance> = {}): EntreeRelance {
  return {
    reference: 'SVAV-DEM-2026-000123', profil: 'entreprise', lot: LOT, dossiersSatisfaitsIds: [], config: CONFIG_ENT,
    pieces: PIECES, envoyeeLe: new Date('2026-03-14T10:00:00Z'), echeanceLe: new Date('2026-04-14T10:00:00Z'),
    saisineLe: new Date('2026-04-18T10:00:00Z'), adresseReponse: 'demandes@sansvisavis.com', ...over,
  };
}

const TOUTES: VarianteRelance[] = ['rappel', 'avis', 'saisine'];

// Liste CLOSE des références autorisées, normalisées (sans espaces ni points).
const REFS_AUTORISEES = new Set(['L311-1', 'L311-9', 'R311-12', 'R311-13', 'R343-1', 'R431-9']);
function articlesCites(texte: string): string[] {
  return (texte.match(/[LR]\.?\s?\d{2,3}-\d+/g) ?? []).map((a) => a.replace(/[\s.]/g, '').toUpperCase());
}
/** Positions successives d'une liste de marqueurs dans le corps (−1 si absent) — pour vérifier l'ORDRE des blocs. */
function positions(corps: string, marqueurs: string[]): number[] {
  return marqueurs.map((m) => corps.indexOf(m));
}
const EXCUSE = 'je vous prie de bien vouloir excuser cette relance';
const NUM_PERMIS = 'Merci de bien vouloir rappeler le numéro de permis dans votre réponse.';

describe('lot 1 — structure commune : excuse préventive en tête, ordre des 12 blocs, numéro de permis', () => {
  for (const v of TOUTES) {
    it(`${v} : excuse préventive présente EN TÊTE (avant le fondement), et rappel du NUMÉRO de permis`, () => {
      const { corps } = genererRelance(entree(), v);
      expect(corps).toContain(EXCUSE);
      const [iBonjour, iExcuse, iFondement] = positions(corps, ['Madame, Monsieur,', EXCUSE, 'en application des articles L311-1']);
      expect(iBonjour).toBeGreaterThanOrEqual(0);
      expect(iExcuse).toBeGreaterThan(iBonjour);     // excuse après « Madame, Monsieur, »
      expect(iFondement).toBeGreaterThan(iExcuse);   // …et avant le fondement
      expect(corps).toContain(NUM_PERMIS);
      expect(corps).not.toContain('rappeler la référence'); // F — plus jamais la référence interne au point 10
    });
  }

  it('sans serviceDestinataire : la lettre commence par « Madame, Monsieur, » (aucune ligne de service)', () => {
    const { corps } = genererRelance(entree({ serviceDestinataire: undefined }), 'rappel');
    expect(corps.startsWith('Madame, Monsieur,')).toBe(true);
    const { corps: vide } = genererRelance(entree({ serviceDestinataire: '   ' }), 'rappel'); // vide/espaces → ignoré
    expect(vide.startsWith('Madame, Monsieur,')).toBe(true);
  });

  it('avec serviceDestinataire : rendu EN TÊTE, avant « Madame, Monsieur, » (jamais de littéral en dur ici)', () => {
    const svc = 'À l’attention du service de l’urbanisme';
    const { corps } = genererRelance(entree({ serviceDestinataire: svc }), 'avis');
    expect(corps.startsWith(`${svc}\n\nMadame, Monsieur,`)).toBe(true);
  });

  it('historique en FIN de lettre : après le numéro de permis, avant la politesse ; absent par défaut', () => {
    const histo = [
      { date: new Date('2026-08-04T09:00:00Z'), libelle: 'demande initiale, adressée par courrier électronique' },
      { date: new Date('2026-08-25T09:00:00Z'), libelle: 'nouvelle demande' },
    ];
    const { corps } = genererRelance(entree({ historique: histo }), 'rappel');
    expect(corps).toContain('Pour mémoire, nos échanges concernant ce permis :');
    expect(corps).toContain('— 4 août 2026 : demande initiale, adressée par courrier électronique');
    expect(corps).toContain('— 25 août 2026 : nouvelle demande');
    const [iNum, iHisto, iPolitesse] = positions(corps, [NUM_PERMIS, 'Pour mémoire, nos échanges', 'Je vous prie d’agréer']);
    expect(iNum).toBeLessThan(iHisto);
    expect(iHisto).toBeLessThan(iPolitesse);
    // absent par défaut (historique non fourni)
    expect(genererRelance(entree(), 'rappel').corps).not.toContain('Pour mémoire, nos échanges');
  });
});

describe('lot 1 — paragraphe propre à la variante × profil (6 cas) + ordre', () => {
  const attendreOrdre = (corps: string, para: string) => {
    const [iDoss, iPara, iOffre, iIdent, iNum] = positions(corps, ['Dossier', para, 'un lien de téléchargement', 'Adresse de réponse', NUM_PERMIS]);
    expect(Math.min(iDoss, iPara, iOffre, iIdent, iNum)).toBeGreaterThanOrEqual(0);
    expect(iDoss).toBeLessThan(iPara); expect(iPara).toBeLessThan(iOffre);
    expect(iOffre).toBeLessThan(iIdent); expect(iIdent).toBeLessThan(iNum);
  };
  const RAPPEL = 'Je me permets de revenir vers vous à l’approche de cette date';
  const AVIS = 'l’absence de réponse vaut décision implicite de refus, ce qui ouvre la possibilité de saisir la Commission d’accès aux documents administratifs (CADA)';
  const SAISINE = 'Cette absence de réponse constitue une décision implicite de refus au sens de l’article R. 311-12.';

  for (const profil of ['entreprise', 'personne'] as const) {
    const conf = profil === 'entreprise' ? CONFIG_ENT : CONFIG_PERS;
    it(`${profil} — rappel : arrive à échéance le 14 avril 2026, courtois, renvoi service ; ordre respecté`, () => {
      const { corps } = genererRelance(entree({ profil, config: conf }), 'rappel');
      expect(corps).toContain('arrive à son terme le 14 avril 2026');
      expect(corps).toContain(RAPPEL);
      expect(corps).toContain('la transmettre au service compétent');
      attendreOrdre(corps, RAPPEL);
    });
    it(`${profil} — avis : échéance à venir + POSSIBILITÉ CADA, renvoi service ; ordre respecté`, () => {
      const { corps } = genererRelance(entree({ profil, config: conf }), 'avis');
      expect(corps).toContain(AVIS);
      expect(corps).toContain('Une réponse de votre part rendrait cette démarche sans objet.');
      expect(corps).toContain('la transmettre au service compétent');
      attendreOrdre(corps, AVIS);
    });
    it(`${profil} — saisine : refus tacite R.311-12 + saisine R.343-1 le 18 avril 2026, mise à disposition ; ordre respecté`, () => {
      const { corps } = genererRelance(entree({ profil, config: conf }), 'saisine');
      expect(corps).toContain(SAISINE);
      expect(corps).toContain('sur le fondement de l’article R. 343-1');
      expect(corps).toContain('Je procéderai à cette saisine le 18 avril 2026'); // échéance + DELAI_SAISINE_JOURS
      expect(corps).toContain('Je reste à votre disposition');
      expect(corps).not.toContain('la transmettre au service compétent'); // point 9 remplacé en 'saisine'
      attendreOrdre(corps, SAISINE);
    });
  }
});

describe('lot 1 — EXIGENCE n°1 : « rappel » ne mentionne NI CADA NI refus tacite', () => {
  it('rappel (entreprise ET personne) : aucun « CADA / Commission d’accès / refus / R. 311-12 / R. 343-1 »', () => {
    for (const profil of ['entreprise', 'personne'] as const) {
      const { corps } = genererRelance(entree({ profil, config: profil === 'entreprise' ? CONFIG_ENT : CONFIG_PERS }), 'rappel');
      expect(corps).not.toContain('CADA');
      expect(corps).not.toContain('Commission d’accès');
      expect(corps).not.toContain('refus');
      expect(corps).not.toContain('R. 311-12');
      expect(corps).not.toContain('R. 343-1');
      expect(corps).not.toContain('…'); // aucun texte tronqué
    }
  });
});

describe('lot 1 — liste close d’articles (les 3 variantes) et neutralité', () => {
  for (const v of TOUTES) {
    it(`${v} : tout article cité appartient à la liste close (aucun inventé)`, () => {
      const { corps } = genererRelance(entree(), v);
      const cites = articlesCites(corps);
      expect(cites.length).toBeGreaterThan(0);
      for (const a of cites) expect(REFS_AUTORISEES.has(a), `article hors liste close : ${a}`).toBe(true);
    });
    it(`${v} : AUCUN motif ni justification d’intérêt`, () => {
      const { corps } = genererRelance(entree(), v);
      expect(corps).not.toMatch(/afin de|en vue de|dans le but|pour les besoins|motif|justif/i);
    });
  }
});

describe('lot 1 — bascule référence interne / numéro de permis (E/F)', () => {
  it('UN SEUL dossier : objet = type + numéro + commune ; AUCUN « SVAV-DEM » ni référence (objet ET corps), les DEUX profils', () => {
    for (const profil of ['entreprise', 'personne'] as const) {
      for (const v of TOUTES) {
        const { objet, corps } = genererRelance(entree({ profil, config: profil === 'entreprise' ? CONFIG_ENT : CONFIG_PERS, lot: LOT_UN }), v);
        expect(objet).not.toContain('SVAV-DEM');
        expect(corps).not.toContain('SVAV-DEM');
        expect(objet).not.toContain('2026-000123'); // ni la forme discrète
        expect(corps).not.toContain('2026-000123');
        expect(objet).toContain('permis de construire n° PC0920042500001'); // type (donnée) + numéro
        expect(objet).toContain('Asnieres');
        expect(objet.startsWith(v === 'saisine' ? 'Information sur la suite de ma demande' : 'Nouvelle demande de communication de documents administratifs')).toBe(true);
        expect(corps).toContain('Dossier concerné :'); // singulier
      }
    }
  });

  it('PLUSIEURS dossiers : ENTREPRISE → référence complète dans l’objet ET le corps ; label pluriel', () => {
    const { objet, corps } = genererRelance(entree(), 'rappel');
    expect(objet).toContain('réf. SVAV-DEM-2026-000123');
    expect(objet).toContain('Asnieres');
    expect(corps).toContain('référencée SVAV-DEM-2026-000123');
    expect(corps).toContain('Dossiers concernés :'); // pluriel
  });

  it('PLUSIEURS dossiers : PERSONNE → objet GÉNÉRIQUE (ni commune, ni référence) ; aucune fuite dans le corps', () => {
    const { objet, corps } = genererRelance(entree({ profil: 'personne', config: CONFIG_PERS }), 'avis');
    expect(objet).toBe('Nouvelle demande de communication de documents administratifs');
    expect(corps).not.toContain('SVAV-DEM');
    expect(corps).not.toContain('2026-000123');
  });
});

describe('lot 1 — partielle (seuls les dossiers dus) + signatures + gardes', () => {
  it('un dossier SATISFAIT est absent ; le dossier dû est présent (les 3 variantes)', () => {
    for (const v of TOUTES) {
      const { corps } = genererRelance(entree({ dossiersSatisfaitsIds: [1] }), v);
      expect(corps).not.toContain('PC0920042500001'); // dossier 1 satisfait → non réclamé
      expect(corps).toContain('PC0920042500002');      // dossier 2 dû → réclamé
    }
  });

  it('TOUS les dossiers satisfaits → AucunDossierNonSatisfaitError', () => {
    expect(() => genererRelance(entree({ dossiersSatisfaitsIds: [1, 2] }), 'rappel')).toThrow(AucunDossierNonSatisfaitError);
  });

  it('identité incomplète → IdentiteIncompleteError, aucun texte', () => {
    expect(() => genererRelance(entree({ config: { ...CONFIG_ENT, raisonSociale: '' } }), 'rappel')).toThrow(IdentiteIncompleteError);
  });

  it('entreprise : signée du nom + qualité en fin de lettre ; personne : signée du seul nom', () => {
    expect(genererRelance(entree(), 'saisine').corps.trimEnd().endsWith('ma considération distinguée.\n\nA. Jorel\ngérant')).toBe(true);
    expect(genererRelance(entree({ profil: 'personne', config: CONFIG_PERS }), 'saisine').corps.trimEnd().endsWith('mes salutations distinguées.\n\nJean Dupont')).toBe(true);
  });

  it('variante « saisine » sans saisineLe → erreur explicite (garde de contrat)', () => {
    expect(() => genererRelance(entree({ saisineLe: undefined }), 'saisine')).toThrow(/saisineLe/);
  });

  it('DELAI_SAISINE_JOURS = 4 (constante exportée, dérivation de la date de saisine chez les appelants)', () => {
    expect(DELAI_SAISINE_JOURS).toBe(4);
  });
});
