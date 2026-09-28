import { describe, it, expect } from 'vitest';
import {
  adresseComplete, caracteristiquesDuLot, dateFr, groupesParProprietaire, lienTelephone, locatairesDuBien,
  periodeOccupation, valeurVide, type LotFiche, type PersonneFiche,
} from './ficheBien';

/**
 * 🔴 LOT FICHE-PROPOSITION — CE QUI S'AFFICHE DANS LA FICHE D'UN BIEN PROPOSÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Module PUR. Ce qui est protégé ici, et qui casse d'une façon reconnaissable :
 *   ① 🔴 RIEN N'EST INVENTÉ, et un champ vide n'est PAS affiché — pas même sous un tiret ;
 *   ② « A renseigner » est une valeur de l'import, pas une information : elle vaut un champ vide ;
 *   ③ les biens se groupent par PROPRIÉTAIRE, un bloc par groupe, dans l'ordre de certitude des biens ;
 *   ④ une indivision reste UNE carte : l'annuaire n'a qu'un enregistrement, et découper le nom fabriquerait
 *      deux fiches fausses au lieu d'une vraie ;
 *   ⑤ un bien sans locataire à la date du mail est VACANT, et cela se dit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const LOT = (o: Partial<LotFiche> = {}): LotFiche => ({
  cle: '442', adresse: '22 Boulevard Richard Wallace', codePostal: '92800', commune: 'PUTEAUX',
  immeuble: '22 Boulevard Richard Wallace', nature: 'Appartement', typeBien: 'Type 4',
  gestionDebut: '2025-02-04', gestionFin: null, ...o,
});
const personne = (role: 'proprietaire' | 'locataire', cle: string, o: Partial<PersonneFiche> = {}): PersonneFiche => ({
  role, cle, nom: `NOM ${cle}`, emails: [], telephones: [], ...o,
});

describe('🔴 ① ② les caractéristiques : tout ce qui existe, rien d’autre', () => {
  it('rend les champs de l’import, dans l’ordre du plus parlant au plus administratif', () => {
    expect(caracteristiquesDuLot(LOT())).toEqual([
      { libelle: 'Nature', valeur: 'Appartement' },
      { libelle: 'Type', valeur: 'Type 4' },
      { libelle: 'En gestion depuis', valeur: '04/02/2025' },
    ]);
  });

  it('🔴 un champ VIDE n’apparaît pas — une fiche pleine de tirets se lit « on ne sait rien »', () => {
    const c = caracteristiquesDuLot(LOT({ typeBien: null, gestionDebut: null }));
    expect(c.map((x) => x.libelle)).toEqual(['Nature']);
  });

  it('🔴 « A renseigner » vaut un champ vide : c’est ce que WIPPIMMO écrit quand rien n’a été saisi', () => {
    expect(valeurVide('A renseigner')).toBe(true);
    expect(valeurVide('à renseigner')).toBe(true);
    expect(valeurVide('  ')).toBe(true);
    expect(valeurVide('Appartement')).toBe(false);
    expect(caracteristiquesDuLot(LOT({ nature: 'A renseigner' })).map((x) => x.libelle))
      .toEqual(['Type', 'En gestion depuis']);
  });

  it('le MEUBLÉ vient de la nature, et le NOMBRE DE PIÈCES du type : c’est l’import qui les porte', () => {
    const c = caracteristiquesDuLot(LOT({ nature: 'Appartement meublé', typeBien: 'Studio' }));
    expect(c).toContainEqual({ libelle: 'Nature', valeur: 'Appartement meublé' });
    expect(c).toContainEqual({ libelle: 'Type', valeur: 'Studio' });
  });

  it('🔴 le BÂTIMENT n’est pas répété quand il est l’adresse — deux fois la même chose fait croire à deux', () => {
    expect(caracteristiquesDuLot(LOT()).some((x) => x.libelle === 'Bâtiment')).toBe(false);
    const autre = caracteristiquesDuLot(LOT({ immeuble: 'Résidence Bellerive — bât. B' }));
    expect(autre).toContainEqual({ libelle: 'Bâtiment', valeur: 'Résidence Bellerive — bât. B' });
  });

  it('une gestion terminée est dite, quand elle l’est', () => {
    expect(caracteristiquesDuLot(LOT({ gestionFin: '2026-06-30' })))
      .toContainEqual({ libelle: 'Gestion terminée le', valeur: '30/06/2026' });
  });

  /** 🔴 Ce que l'import NE PORTE PAS ne doit apparaître nulle part — pas même en creux. */
  it('🔴 ni surface, ni étage, ni annexes : ils ne sont pas dans l’import, ils ne sont pas inventés', () => {
    const libelles = caracteristiquesDuLot(LOT()).map((x) => x.libelle.toLowerCase()).join(' ');
    expect(libelles).not.toContain('surface');
    expect(libelles).not.toContain('étage');
    expect(libelles).not.toContain('annexe');
  });
});

describe('l’adresse complète', () => {
  it('réunit voie, code postal et commune', () => {
    expect(adresseComplete(LOT())).toBe('22 Boulevard Richard Wallace, 92800 PUTEAUX');
  });

  it('se passe de ce qui manque, sans virgule orpheline', () => {
    expect(adresseComplete({ adresse: '4 rue X', codePostal: null, commune: null })).toBe('4 rue X');
    expect(adresseComplete({ adresse: null, codePostal: '92800', commune: 'PUTEAUX' })).toBe('92800 PUTEAUX');
    expect(adresseComplete({ adresse: null, codePostal: null, commune: null })).toBe('');
  });
});

describe('les dates, écrites à la française', () => {
  it('convertit l’ISO, et refuse ce qui n’est pas une date', () => {
    expect(dateFr('2025-02-04')).toBe('04/02/2025');
    expect(dateFr('2025-02-04T10:00:00Z')).toBe('04/02/2025');
    expect(dateFr(null)).toBeNull();
    expect(dateFr('bientôt')).toBeNull();
  });

  it('🔴 « depuis le … » ne dit PAS « pour toujours » : il dit qu’aucune sortie n’est enregistrée', () => {
    expect(periodeOccupation('2025-05-19', null)).toBe('depuis le 19/05/2025');
    expect(periodeOccupation('2024-07-31', '2026-09-12')).toBe('du 31/07/2024 au 12/09/2026');
    expect(periodeOccupation(null, '2026-09-12')).toBe('jusqu’au 12/09/2026');
    expect(periodeOccupation(null, null)).toBeNull();
  });
});

describe('🔴 ③ ④ les groupes de propriétaires', () => {
  const bien = (cle: string, proprio: string, locataires: string[] = []) => ({
    cle,
    parties: [
      personne('proprietaire', proprio, { nom: `BAILLEUR ${proprio}` }),
      ...locataires.map((l) => personne('locataire', l)),
    ],
  });

  it('un seul propriétaire ⇒ un seul bloc, qui porte tous ses biens', () => {
    const g = groupesParProprietaire([bien('1', 'P1'), bien('2', 'P1'), bien('3', 'P1')]);
    expect(g).toHaveLength(1);
    expect(g[0].biens.map((b) => b.cle)).toEqual(['1', '2', '3']);
    expect(g[0].personnes.map((p) => p.nom)).toEqual(['BAILLEUR P1']);
  });

  it('🔴 DEUX propriétaires ⇒ DEUX blocs : un seul bandeau ferait croire au même bailleur', () => {
    const g = groupesParProprietaire([bien('1', 'P1'), bien('2', 'P2'), bien('3', 'P1')]);
    expect(g).toHaveLength(2);
    expect(g[0].biens.map((b) => b.cle)).toEqual(['1', '3']);
    expect(g[1].biens.map((b) => b.cle)).toEqual(['2']);
  });

  it('🔴 l’ordre des groupes suit celui des biens — donc la certitude, pas l’alphabet', () => {
    const g = groupesParProprietaire([bien('1', 'ZZZ'), bien('2', 'AAA')]);
    expect(g.map((x) => x.cle)).toEqual(['ZZZ', 'AAA']);
  });

  it('un bien SANS propriétaire connu forme son propre groupe : on ne le range pas ailleurs', () => {
    const g = groupesParProprietaire([bien('1', 'P1'), { cle: '2', parties: [] }]);
    expect(g).toHaveLength(2);
    expect(g[1].cle).toBe('');
    expect(g[1].personnes).toEqual([]);
  });

  /**
   * 🔴 L'INDIVISION. L'annuaire ne porte qu'UN enregistrement, même quand le nom en désigne deux
   * (« MOTTAIS GRAINDORGE Didier et Sandrine » : 81 lots sur 365 sont dans ce cas, mesuré le 28/09/2026).
   * On rend donc UNE carte, avec TOUS ses contacts — deux e-mails, un téléphone. Découper le nom fabriquerait
   * deux fiches fausses au lieu d'une vraie, et attribuerait au hasard un e-mail à l'un des deux.
   */
  it('🔴 une indivision reste UNE carte, avec tous ses contacts', () => {
    const indivision = personne('proprietaire', 'P9', {
      nom: 'MOTTAIS GRAINDORGE Didier et Sandrine',
      emails: ['didier@x.fr', 'sandrine@x.fr'], telephones: ['+33600000000'],
    });
    const g = groupesParProprietaire([{ cle: '1', parties: [indivision] }]);
    expect(g[0].personnes).toHaveLength(1);
    expect(g[0].personnes[0].emails).toEqual(['didier@x.fr', 'sandrine@x.fr']);
  });

  it('si l’annuaire porte VRAIMENT deux enregistrements, deux cartes sont rendues', () => {
    const b = {
      cle: '1',
      parties: [personne('proprietaire', 'A', { nom: 'DUPONT Jean' }),
        personne('proprietaire', 'B', { nom: 'DUPONT Marie' })],
    };
    const g = groupesParProprietaire([b]);
    expect(g[0].personnes.map((p) => p.nom)).toEqual(['DUPONT Jean', 'DUPONT Marie']);
  });
});

describe('🔴 ⑤ les locataires à la date du mail', () => {
  it('rend TOUS les locataires — une colocation, un couple, ils existent tous les deux', () => {
    const b = {
      cle: '1',
      parties: [personne('proprietaire', 'P1'), personne('locataire', 'L1'), personne('locataire', 'L2')],
    };
    expect(locatairesDuBien(b).map((p) => p.cle)).toEqual(['L1', 'L2']);
  });

  it('aucun locataire ⇒ liste vide, et c’est à l’écran de dire « vacant »', () => {
    expect(locatairesDuBien({ cle: '1', parties: [personne('proprietaire', 'P1')] })).toEqual([]);
  });
});

describe('le lien d’appel d’un téléphone', () => {
  it('ne garde que les chiffres et le « + » de tête : un `tel:` avec des espaces n’est pas composé partout', () => {
    expect(lienTelephone('+33684318116')).toBe('tel:+33684318116');
    expect(lienTelephone('06 84 31 81 16')).toBe('tel:0684318116');
    expect(lienTelephone('01.47.22.00.00')).toBe('tel:0147220000');
  });

  it('refuse ce qui n’est pas un numéro, plutôt que d’offrir un lien mort', () => {
    expect(lienTelephone('')).toBeNull();
    expect(lienTelephone('n° inconnu')).toBeNull();
    expect(lienTelephone('12345')).toBeNull();
  });
});
