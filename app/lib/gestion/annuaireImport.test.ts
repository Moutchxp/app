import { describe, it, expect } from 'vitest';
import { construirePlan, ErreurSource, resumerPlan } from './annuaireImport';
import type { FeuilleLue } from './xlsxLecture';

/**
 * LOT ANNUAIRE-1 — LE PLAN D'IMPORT, ÉPROUVÉ SANS BASE ET SANS RÉSEAU.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE. Tous les noms, adresses, numéros et e-mails ci-dessous sont inventés.
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI CHACUN COMPTE :
 *   ① le rapprochement lot → propriétaire se fait par ÉGALITÉ de nom normalisé, jamais par score ;
 *   ② un nom porté par DEUX bailleurs n'est pas tranché : signalé, et le lot garde son texte ;
 *   ③ un bail visant un lot absent de l'export est GARDÉ, avec sa mention ;
 *   ④ la date de début de relation est DÉRIVÉE de la plus ancienne « Déb gest. » de ses lots ;
 *   ⑤ tout rejet porte un motif lisible, avec le numéro de ligne DU TABLEUR ;
 *   ⑥ une colonne obligatoire absente arrête TOUT — importer deux fichiers sur trois marquerait « disparu »
 *      l'intégralité du troisième.
 */

const feuille = (entetes: string[], lignes: string[][]): FeuilleLue => ({ entetes, lignes });

const BAILLEURS = feuille(
  ['Id', 'Civilité', 'Nom prop.', 'Prénom prop.', 'Adresse', 'Commune', 'C.P.', 'Télécoms', 'Mobile', 'Email'],
  [
    ['1', 'M.', 'DUPONT', 'Jean', '4 rue Fictive', 'PUTEAUX', '92800', '', '0699991234', 'jean@fictif.fr'],
    ['2', 'Mme', 'MARTIN', 'Claire', '9 allée Imaginaire', 'COURBEVOIE', '92400', '', '', 'claire@fictif.fr;c.martin@fictif.fr'],
    // ② DEUX bailleurs de même nom : l'import ne doit trancher ni dans un sens ni dans l'autre.
    ['3', 'M.', 'DURAND', 'Paul', '1 place Inventée', 'PUTEAUX', '92800', '', '', 'paul1@fictif.fr'],
    ['4', 'M.', 'DURAND', 'Paul', '2 place Inventée', 'PUTEAUX', '92800', '', '', 'paul2@fictif.fr'],
  ],
);

const LOTS = feuille(
  ['Id', 'Immeuble', 'Propriétaire', 'Déb gest.', 'Fin gest.', 'Nature', 'Type', 'Adresse', 'Commune', 'C.P.'],
  [
    ['100', 'Le Fictif', 'DUPONT Jean', '19/07/2018', '', 'Appartement', 'Type 2', '4 rue Fictive', 'PUTEAUX', '92800'],
    ['101', 'Le Fictif', 'DUPONT Jean', '05/01/2020', '', 'Parking', '', '4 rue Fictive', 'PUTEAUX', '92800'],
    ['102', '', 'MARTIN Claire', '02/03/2024', '', 'Studio', 'Type 1', '9 allée Imaginaire', 'COURBEVOIE', '92400'],
    ['103', '', 'DURAND Paul', '01/01/2021', '', 'Appartement', 'Type 3', '1 place Inventée', 'PUTEAUX', '92800'],
  ],
);

const LOCATAIRES = feuille(
  ['Id', 'Locataire', 'Propriétaire actuel', 'Effet', 'Sortie', 'Lot', 'Adresse', 'Commune', 'C.P.', 'Mobile', 'Email'],
  [
    ['500', 'BERNARD Alice', 'DUPONT Jean', '01/09/2022', '', '100', '4 rue Fictive', 'PUTEAUX', '92800', '0699995678', 'alice@fictif.fr'],
    ['501', 'PETIT Marc', 'DUPONT Jean', '01/02/2019', '31/08/2022', '100', '4 rue Fictive', 'PUTEAUX', '92800', '', 'marc@fictif.fr'],
    // ④ Le MÊME locataire, deux baux, même e-mail → une seule personne, deux occupations.
    ['502', 'BERNARD Alice', 'DUPONT Jean', '01/03/2023', '', '101', '4 rue Fictive', 'PUTEAUX', '92800', '', 'alice@fictif.fr'],
    // ③ Un bail visant un lot qui n'est PAS dans l'export Lots.
    ['503', 'ROUX Sophie', 'MARTIN Claire', '15/06/2021', '', '999', '9 allée Imaginaire', 'COURBEVOIE', '92400', '', 'sophie@fictif.fr'],
  ],
);

const plan = () => construirePlan({ bailleurs: BAILLEURS, lots: LOTS, locataires: LOCATAIRES });

describe('🔴 ① le rapprochement se fait par ÉGALITÉ, jamais au jugé', () => {
  it('chaque lot retrouve son propriétaire par le nom normalisé', () => {
    const p = plan();
    expect(p.lots.find((l) => l.wippimmoId === '100')?.proprietaireCle).toBe('dupont jean');
    expect(p.lots.find((l) => l.wippimmoId === '102')?.proprietaireCle).toBe('martin claire');
  });

  it('un propriétaire absent de Bailleurs laisse le lot NON rattaché, et le dit', () => {
    const lots = feuille(LOTS.entetes, [
      ['200', '', 'INCONNU Zoé', '01/01/2020', '', 'Studio', '', '1 rue Fictive', 'PUTEAUX', '92800'],
    ]);
    const p = construirePlan({ bailleurs: BAILLEURS, lots, locataires: feuille(LOCATAIRES.entetes, []) });
    expect(p.lots[0].proprietaireCle).toBeNull();
    // Le lot EXISTE quand même : perdre un lot parce que son bailleur manque serait pire que l'afficher nu.
    expect(p.lots[0].proprietaireTexte).toBe('INCONNU Zoé');
    expect(p.lotsSansProprietaire).toBe(1);
    expect(p.rejets[0].motif).toContain('absent de Bailleurs.xlsx');
  });
});

describe('🔴 ② un nom porté par deux bailleurs n’est PAS tranché', () => {
  it('l’homonyme est signalé, avec les deux identifiants et le nombre de lots en attente', () => {
    const p = plan();
    expect(p.homonymes).toHaveLength(1);
    expect(p.homonymes[0].wippimmoIds.sort()).toEqual(['3', '4']);
    expect(p.homonymes[0].lotsEnAttente).toBe(1);
  });

  it('le lot de ce nom reste sans propriétaire rattaché — jamais attribué à l’un des deux', () => {
    const p = plan();
    const lot = p.lots.find((l) => l.wippimmoId === '103');
    expect(lot?.proprietaireCle).toBeNull();
    expect(lot?.proprietaireTexte).toBe('DURAND Paul');
  });

  it('les DEUX bailleurs restent dans le plan : on ne fusionne pas, on n’écarte pas non plus', () => {
    const p = plan();
    expect(p.proprietaires.filter((x) => x.nomNormalise === 'durand paul')).toHaveLength(2);
  });

  it('leur date de début de relation reste inconnue — aucun lot ne leur est rattaché, c’est la vérité', () => {
    const p = plan();
    for (const d of p.proprietaires.filter((x) => x.nomNormalise === 'durand paul')) {
      expect(d.relationDepuis).toBeNull();
    }
  });
});

describe('🔴 ③ un bail vers un lot hors gestion est GARDÉ', () => {
  it('il est marqué « lot inconnu », et sa référence est conservée', () => {
    const p = plan();
    const o = p.occupations.find((x) => x.wippimmoId === '503');
    expect(o?.lotConnu).toBe(false);
    expect(o?.lotWippimmoId).toBe('999');
    expect(p.occupationsHorsGestion).toBe(1);
  });
});

describe('🔴 ④ la date de relation est DÉRIVÉE, et les baux se regroupent par personne', () => {
  it('le début de relation est la plus ancienne « Déb gest. » de ses lots', () => {
    const p = plan();
    expect(p.proprietaires.find((x) => x.wippimmoId === '1')?.relationDepuis).toBe('2018-07-19');
    expect(p.proprietaires.find((x) => x.wippimmoId === '2')?.relationDepuis).toBe('2024-03-02');
  });

  it('deux baux du même locataire (même nom, même e-mail) font UNE personne et DEUX occupations', () => {
    const p = plan();
    expect(p.locataires.filter((x) => x.nomNormalise === 'bernard alice')).toHaveLength(1);
    expect(p.occupations.filter((o) => o.clePersonne === p.locataires.find((x) => x.nomNormalise === 'bernard alice')?.clePersonne))
      .toHaveLength(2);
    expect(p.locatairesRegroupes).toBe(1);
  });

  it('les CONTACTS des deux baux se cumulent : un second bail peut porter un numéro que le premier n’avait pas', () => {
    const locataires = feuille(LOCATAIRES.entetes, [
      ['600', 'BERNARD Alice', 'DUPONT Jean', '01/09/2022', '', '100', '', '', '', '', 'alice@fictif.fr'],
      ['601', 'BERNARD Alice', 'DUPONT Jean', '01/03/2023', '', '101', '', '', '', '0699990000', 'alice@fictif.fr'],
    ]);
    const p = construirePlan({ bailleurs: BAILLEURS, lots: LOTS, locataires });
    const alice = p.locataires.find((x) => x.nomNormalise === 'bernard alice');
    expect(alice?.contacts.map((c) => c.valeur).sort()).toEqual(['+33699990000', 'alice@fictif.fr']);
  });

  it('un bail en cours n’a pas de sortie ; un bail terminé en a une', () => {
    const p = plan();
    expect(p.occupations.find((o) => o.wippimmoId === '500')?.sortie).toBeNull();
    expect(p.occupations.find((o) => o.wippimmoId === '501')?.sortie).toBe('2022-08-31');
    expect(p.occupations.find((o) => o.wippimmoId === '501')?.entree).toBe('2019-02-01');
  });
});

describe('🔴 ⑤ tout rejet porte un motif, et le numéro de ligne DU TABLEUR', () => {
  it('une ligne sans identifiant est rejetée, en nommant la ligne telle qu’on la voit dans le tableur', () => {
    const bailleurs = feuille(BAILLEURS.entetes, [['', '', 'SANSID', '', '', '', '', '', '', '']]);
    const p = construirePlan({ bailleurs, lots: feuille(LOTS.entetes, []), locataires: feuille(LOCATAIRES.entetes, []) });
    // Ligne 2 : la 1re ligne de données d'un tableur dont la ligne 1 est l'en-tête.
    expect(p.rejets).toEqual([{ source: 'bailleurs', ligne: 2, motif: 'sans identifiant WIPPIMMO' }]);
  });

  it('un identifiant présent deux fois est rejeté la seconde fois — jamais écrasé en silence', () => {
    const bailleurs = feuille(BAILLEURS.entetes, [
      ['7', '', 'DUPONT', 'Jean', '', '', '', '', '', ''],
      ['7', '', 'AUTRE', 'Personne', '', '', '', '', '', ''],
    ]);
    const p = construirePlan({ bailleurs, lots: feuille(LOTS.entetes, []), locataires: feuille(LOCATAIRES.entetes, []) });
    expect(p.proprietaires).toHaveLength(1);
    expect(p.rejets[0].motif).toContain('deux fois');
  });

  it('une sortie antérieure à l’entrée fait rejeter le bail, avec les deux dates dans le motif', () => {
    const locataires = feuille(LOCATAIRES.entetes, [
      ['700', 'ENVERS Paul', 'DUPONT Jean', '01/09/2022', '01/01/2020', '100', '', '', '', '', 'p@fictif.fr'],
    ]);
    const p = construirePlan({ bailleurs: BAILLEURS, lots: LOTS, locataires });
    expect(p.occupations).toHaveLength(0);
    expect(p.rejets[0].motif).toContain('antérieure à l’entrée');
    expect(p.rejets[0].motif).toContain('01/09/2022');
    // La PERSONNE, elle, est gardée : c'est le bail qui est douteux, pas son locataire.
    expect(p.locataires).toHaveLength(1);
  });

  it('une ligne entièrement vide n’est PAS un rejet : il n’y a rien à rejeter', () => {
    const bailleurs = feuille(BAILLEURS.entetes, [['', '', '', '', '', '', '', '', '', '']]);
    const p = construirePlan({ bailleurs, lots: feuille(LOTS.entetes, []), locataires: feuille(LOCATAIRES.entetes, []) });
    expect(p.rejets).toEqual([]);
    expect(p.proprietaires).toEqual([]);
  });

  it('une date illisible est signalée, et le lot entre quand même — sans date', () => {
    const lots = feuille(LOTS.entetes, [
      ['300', '', 'DUPONT Jean', 'le mois dernier', '', 'Studio', '', '1 rue Fictive', 'PUTEAUX', '92800'],
    ]);
    const p = construirePlan({ bailleurs: BAILLEURS, lots, locataires: feuille(LOCATAIRES.entetes, []) });
    expect(p.lots).toHaveLength(1);
    expect(p.lots[0].gestionDebut).toBeNull();
    expect(p.rejets[0].motif).toContain('illisible');
  });
});

describe('🔴 ⑥ une colonne obligatoire absente arrête TOUT', () => {
  it('sans « Id », le fichier entier est refusé, en disant quelles colonnes ont été lues', () => {
    const bailleurs = feuille(['Nom prop.', 'Prénom prop.'], [['DUPONT', 'Jean']]);
    expect(() => construirePlan({ bailleurs, lots: LOTS, locataires: LOCATAIRES })).toThrow(ErreurSource);
    try {
      construirePlan({ bailleurs, lots: LOTS, locataires: LOCATAIRES });
    } catch (e) {
      expect((e as Error).message).toContain('Bailleurs.xlsx');
      expect((e as Error).message).toContain('Nom prop.');
    }
  });

  it('une colonne FACULTATIVE absente ne gêne pas : la valeur est simplement vide', () => {
    const bailleurs = feuille(['Id', 'Nom prop.'], [['1', 'DUPONT']]);
    const p = construirePlan({ bailleurs, lots: feuille(LOTS.entetes, []), locataires: feuille(LOCATAIRES.entetes, []) });
    expect(p.proprietaires[0].prenom).toBeNull();
    expect(p.proprietaires[0].contacts).toEqual([]);
  });

  it('la colonne est trouvée par son TITRE, quelle qu’en soit la casse ou l’accent', () => {
    const bailleurs = feuille(['ID', 'NOM PROP.', 'PRENOM PROP.'], [['1', 'DUPONT', 'Jean']]);
    const p = construirePlan({ bailleurs, lots: feuille(LOTS.entetes, []), locataires: feuille(LOCATAIRES.entetes, []) });
    expect(p.proprietaires[0].nomComplet).toBe('DUPONT Jean');
  });
});

describe('le résumé, lisible par quelqu’un qui n’a pas écrit le code', () => {
  it('dit les six nombres qui comptent', () => {
    const l = resumerPlan(plan()).join(' | ');
    expect(l).toContain('propriétaires : 4');
    expect(l).toContain('lots : 4');
    expect(l).toContain('baux');
    expect(l).toContain('homonymes de propriétaires signalés : 1');
    expect(l).toContain('rejets : 0');
  });
});
