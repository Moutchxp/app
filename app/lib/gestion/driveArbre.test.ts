import { describe, it, expect } from 'vitest';
import {
  CLE_BIENS, CLE_NON_RATTACHES, CLE_PROPRIETAIRES, CLE_RACINE, construirePlanArbre, dateFr, EN_ATTENTE,
  nomBien, nomOccupation, nomProprietaire, nomRaccourci, resumerPlanArbre, RUBRIQUES_BIEN,
  type LotSource, type NoeudPlan, type OccupationSource, type ProprietaireSource,
} from './driveArbre';
import { NOM_MAX } from './driveGardeFou';

/**
 * LOT DRIVE-1 — LE PLAN DE L'ARBORESCENCE, ÉPROUVÉ SANS RÉSEAU.
 *
 * 🔒 Noms et adresses inventés. Le cas « homonyme » reproduit une situation MESURÉE dans les vrais exports (deux
 * fiches WIPPIMMO au même nom) avec des données fictives.
 */

const PROPS: ProprietaireSource[] = [
  { wippimmoId: '1', nomComplet: 'DUPONT Jean' },
  { wippimmoId: '2', nomComplet: 'MARTIN Claire' },
  // 🔴 HOMONYMES : même nom, deux fiches. C'est le numéro qui les distingue.
  { wippimmoId: '102', nomComplet: 'GUSCHEMANN Gracieuse' },
  { wippimmoId: '103', nomComplet: 'GUSCHEMANN Gracieuse' },
];

const LOTS: LotSource[] = [
  { wippimmoId: '100', proprietaireWippimmoId: '1', adresse: '4 rue Fictive', codePostal: '92800', commune: 'PUTEAUX', nature: 'Appartement', typeBien: 'Type 2' },
  { wippimmoId: '101', proprietaireWippimmoId: '1', adresse: '4 rue Fictive', codePostal: '92800', commune: 'PUTEAUX', nature: 'Parking', typeBien: null },
  { wippimmoId: '200', proprietaireWippimmoId: '2', adresse: '9 allée Imaginaire', codePostal: '92400', commune: 'COURBEVOIE', nature: 'Studio', typeBien: 'Type 1' },
  // Un lot dont le propriétaire n'a PAS pu être tranché (homonyme) : le bien existe quand même.
  { wippimmoId: '300', proprietaireWippimmoId: null, adresse: '1 place Inventée', codePostal: '92800', commune: 'PUTEAUX', nature: 'Appartement', typeBien: 'Type 3' },
];

const OCCS: OccupationSource[] = [
  { wippimmoId: '500', lotWippimmoId: '100', locataireNom: 'BERNARD Alice', entree: '2022-09-01', sortie: null },
  { wippimmoId: '501', lotWippimmoId: '100', locataireNom: 'PETIT Marc', entree: '2019-02-01', sortie: '2022-08-31' },
  // Un bail vers un lot HORS gestion : il n'a nulle part où aller dans cette arborescence.
  { wippimmoId: '502', lotWippimmoId: '999', locataireNom: 'ROUX Sophie', entree: '2021-06-15', sortie: null },
];

const plan = () => construirePlanArbre({ proprietaires: PROPS, lots: LOTS, occupations: OCCS });
const par = (p: ReturnType<typeof plan>, sorte: string): NoeudPlan[] => p.noeuds.filter((n) => n.sorte === sorte);

describe('les quatre dossiers de tête, et eux seuls, sous la racine', () => {
  it('la racine n’a pas de parent ; les trois autres l’ont pour parent', () => {
    const p = plan();
    const racine = p.noeuds[0];
    expect(racine.sorte).toBe('racine');
    expect(racine.parent).toBeNull();
    for (const cle of [CLE_NON_RATTACHES, CLE_PROPRIETAIRES, CLE_BIENS]) {
      const n = p.noeuds.find((x) => x.cle === cle);
      expect(n?.parent).toEqual({ sorte: 'racine', cle: CLE_RACINE });
    }
  });

  it('« 00 Non rattachés » n’a AUCUN sous-dossier dans ce lot : les AAAA/MM naissent au lot suivant', () => {
    const p = plan();
    expect(p.noeuds.filter((n) => n.parent?.cle === CLE_NON_RATTACHES)).toHaveLength(0);
  });

  it('la racine est la SEULE sans parent — l’ascension du garde-fou en dépend', () => {
    expect(plan().noeuds.filter((n) => n.parent === null)).toHaveLength(1);
  });
});

describe('🔴 un parent précède TOUJOURS son enfant, et un bien son raccourci', () => {
  it('l’ordre du plan est un ordre de création sûr : une coupure laisse un état cohérent', () => {
    const p = plan();
    const vus = new Set<string>();
    const clef = (s: string, c: string) => `${s}|${c}`;
    for (const n of p.noeuds) {
      if (n.parent !== null) {
        expect(vus.has(clef(n.parent.sorte, n.parent.cle)), `${n.chemin} avant son parent`).toBe(true);
      }
      if (n.cible !== undefined) {
        expect(vus.has(clef(n.cible.sorte, n.cible.cle)), `${n.chemin} avant sa cible`).toBe(true);
      }
      vus.add(clef(n.sorte, n.cle));
    }
  });
});

describe('🔴 les clés sont uniques — c’est ce qui rend la construction idempotente', () => {
  it('aucun couple (sorte, clé) n’apparaît deux fois', () => {
    const p = plan();
    const cles = p.noeuds.map((n) => `${n.sorte}|${n.cle}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it('les homonymes ont DEUX dossiers distincts, grâce à leur numéro WIPPIMMO', () => {
    const p = plan();
    const g = par(p, 'proprietaire').filter((n) => n.nom.startsWith('GUSCHEMANN'));
    expect(g).toHaveLength(2);
    expect(g.map((n) => n.nom).sort()).toEqual(['GUSCHEMANN Gracieuse (102)', 'GUSCHEMANN Gracieuse (103)']);
    expect(new Set(g.map((n) => n.cle)).size).toBe(2);
  });
});

describe('chaque bien porte ses quatre rubriques et son « En attente »', () => {
  it('quatre rubriques, dans l’ordre demandé', () => {
    const p = plan();
    const rubriques = par(p, 'rubrique').filter((n) => n.parent?.cle === '100');
    expect(rubriques.map((n) => n.nom)).toEqual([...RUBRIQUES_BIEN]);
  });

  it('un « En attente » par bien ET un par propriétaire — jamais mélangés', () => {
    const p = plan();
    const attentes = par(p, 'en_attente');
    expect(attentes.filter((n) => n.cle.startsWith('bien|'))).toHaveLength(LOTS.length);
    expect(attentes.filter((n) => n.cle.startsWith('prop|'))).toHaveLength(PROPS.length);
    expect(attentes.every((n) => n.nom === EN_ATTENTE)).toBe(true);
  });

  it('un bien dont le propriétaire n’est pas tranché existe quand même — c’est un logement réel', () => {
    const p = plan();
    expect(par(p, 'bien').some((n) => n.cle === '300')).toBe(true);
    // …mais aucun raccourci ne pointe vers lui, puisqu'on ne sait pas chez qui le mettre.
    expect(par(p, 'raccourci').some((n) => n.cible?.cle === '300')).toBe(false);
  });
});

describe('les baux, sous « 1 Locataires » de leur bien', () => {
  it('un bail va sous la rubrique « 1 Locataires » du bon bien', () => {
    const p = plan();
    const bail = par(p, 'occupation').find((n) => n.cle === '500');
    expect(bail?.parent).toEqual({ sorte: 'rubrique', cle: `100|${RUBRIQUES_BIEN[0]}` });
    expect(bail?.chemin).toContain('/1 Locataires/');
  });

  it('🔴 un bail visant un lot HORS gestion n’est pas créé : il n’a nulle part où aller', () => {
    const p = plan();
    expect(par(p, 'occupation').some((n) => n.cle === '502')).toBe(false);
    expect(par(p, 'occupation')).toHaveLength(2);
  });

  it('le bail EN COURS est nommé « en cours », le bail terminé porte sa sortie', () => {
    expect(nomOccupation(OCCS[0])).toBe('BERNARD Alice (entrée 01/09/2022 – en cours)');
    expect(nomOccupation(OCCS[1])).toBe('PETIT Marc (entrée 01/02/2019 – sortie 31/08/2022)');
  });

  it('une date inconnue est DITE, jamais inventée', () => {
    expect(nomOccupation({ wippimmoId: 'x', lotWippimmoId: '100', locataireNom: 'X Y', entree: null, sortie: null }))
      .toBe('X Y (entrée inconnue – en cours)');
    expect(dateFr(null)).toBe('');
    expect(dateFr('2022-09-01')).toBe('01/09/2022');
  });
});

describe('les raccourcis — dans l’arborescence, et vers elle seule', () => {
  it('un propriétaire reçoit un raccourci par bien', () => {
    const p = plan();
    const sesRaccourcis = par(p, 'raccourci').filter((n) => n.parent?.cle === '1');
    expect(sesRaccourcis).toHaveLength(2);
    expect(sesRaccourcis.map((n) => n.cible?.cle).sort()).toEqual(['100', '101']);
  });

  it('🔴 TOUTE cible de raccourci est un « bien » DU PLAN — jamais un dossier venu d’ailleurs', () => {
    const p = plan();
    const biens = new Set(par(p, 'bien').map((n) => n.cle));
    for (const r of par(p, 'raccourci')) {
      expect(r.cible?.sorte).toBe('bien');
      expect(biens.has(r.cible?.cle ?? ''), r.nom).toBe(true);
    }
  });

  it('la flèche dit d’un coup d’œil que c’est un raccourci, pas une copie', () => {
    expect(nomRaccourci(LOTS[0]).startsWith('→ ')).toBe(true);
  });

  it('un propriétaire sans bien n’a aucun raccourci, et garde son dossier', () => {
    const p = plan();
    expect(par(p, 'proprietaire').some((n) => n.cle === '102')).toBe(true);
    expect(par(p, 'raccourci').some((n) => n.parent?.cle === '102')).toBe(false);
  });
});

describe('les noms', () => {
  it('un bien : l’adresse d’abord, le numéro de lot en dernier', () => {
    expect(nomBien(LOTS[0])).toBe('4 rue Fictive, 92800 PUTEAUX — Appartement Type 2 — lot 100');
  });

  it('un bien sans type ne laisse pas d’espace en trop', () => {
    expect(nomBien(LOTS[1])).toBe('4 rue Fictive, 92800 PUTEAUX — Parking — lot 101');
  });

  it('un bien sans adresse le DIT, et reste identifiable par son numéro', () => {
    expect(nomBien({ wippimmoId: '9', proprietaireWippimmoId: null, adresse: null, codePostal: null, commune: null, nature: null, typeBien: null }))
      .toBe('Adresse non renseignée — lot 9');
  });

  it('un propriétaire porte son numéro WIPPIMMO', () => {
    expect(nomProprietaire(PROPS[0])).toBe('DUPONT Jean (1)');
  });

  it('aucun nom ne dépasse la borne, n’est vide, ni ne porte de caractère de contrôle', () => {
    for (const n of plan().noeuds) {
      expect(n.nom.length, n.nom).toBeLessThanOrEqual(NOM_MAX);
      expect(n.nom.trim()).not.toBe('');
      // eslint-disable-next-line no-control-regex
      expect(n.nom, n.nom).not.toMatch(/[\u0000-\u001f\u007f]/);
    }
  });
});

describe('les comptes du mode « à blanc »', () => {
  it('le résumé dit ce qui serait créé, sorte par sorte', () => {
    const p = plan();
    expect(p.comptes.proprietaire).toBe(4);
    expect(p.comptes.bien).toBe(4);
    expect(p.comptes.rubrique).toBe(4 * RUBRIQUES_BIEN.length);
    expect(p.comptes.occupation).toBe(2);
    expect(p.comptes.raccourci).toBe(3);
    expect(p.comptes.total).toBe(p.noeuds.length);
    const texte = resumerPlanArbre(p).join(' | ');
    expect(texte).toContain('TOTAL à créer');
    expect(texte).toContain('propriétaires : 4');
  });
});
