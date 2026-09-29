import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  analyserTerme, CHIFFRES_MINIMUM_TELEPHONE, formaterDateIso, LONGUEUR_MAXIMALE, LONGUEUR_MINIMALE,
  messageRechercheVide, periodeOccupation, titreLogement,
} from './annuaireRecherche';

/**
 * LOT ANNUAIRE-1 — CE QU'ON TAPE, ET CE QUE ÇA VEUT DIRE.
 *
 * 🔴 TOUTES LES LECTURES SONT CUMULÉES, JAMAIS EXCLUSIVES. Décider qu'un terme « est un téléphone DONC pas un nom »
 * ferait disparaître les sociétés dont le nom porte des chiffres — et les adresses, qui commencent toutes par un
 * numéro. C'est la propriété la plus importante de ce module, et c'est la première éprouvée.
 *
 * 🔒 Noms, adresses et numéros inventés.
 */

describe('🔴 les lectures se CUMULENT', () => {
  it('« 12 rue de la Paix » est à la fois du texte et des chiffres', () => {
    const t = analyserTerme('12 rue de la Paix');
    expect(t.texte).toBe('12 rue de la paix');
    expect(t.mots).toContain('rue');
    expect(t.mots).toContain('paix');
    // Pas assez de chiffres pour être un bout de téléphone, et pas un nombre SEUL : donc pas un numéro de lot.
    expect(t.chiffres).toBeNull();
    expect(t.numeroLot).toBeNull();
  });

  it('un numéro complet est lu comme téléphone ET comme suite de chiffres', () => {
    const t = analyserTerme('06 99 99 12 34');
    expect(t.telephone).toBe('+33699991234');
    expect(t.chiffres).toBe('0699991234');
  });

  it('les quatre écritures d’un même numéro donnent le même E.164', () => {
    for (const e of ['0699991234', '06.99.99.12.34', '+33 6 99 99 12 34', '0033699991234']) {
      expect(analyserTerme(e).telephone, e).toBe('+33699991234');
    }
  });

  it('une FIN de numéro n’est pas un E.164, mais reste cherchable par ses chiffres', () => {
    const t = analyserTerme('99 12 34');
    expect(t.telephone).toBeNull();
    expect(t.chiffres).toBe('991234');
  });

  it('trop peu de chiffres pour être un bout de numéro : on ne cherche pas dans les téléphones', () => {
    expect(CHIFFRES_MINIMUM_TELEPHONE).toBe(4);
    expect(analyserTerme('92 8').chiffres).toBeNull();
  });

  it('un e-mail n’est lu comme e-mail que s’il porte une arobase', () => {
    expect(analyserTerme('Zoe@Fictif.FR').email).toBe('zoe@fictif.fr');
    expect(analyserTerme('zoe fictif fr').email).toBeNull();
    // Une arobase ne suffit pas : ce qui ne ressemble pas à une adresse n'en est pas une.
    expect(analyserTerme('arobase @ perdue').email).toBeNull();
  });

  it('un nombre SEUL et court est lu comme un numéro de lot ; un nombre suivi de mots, non', () => {
    expect(analyserTerme('103').numeroLot).toBe('103');
    expect(analyserTerme('54 avenue').numeroLot).toBeNull();
    expect(analyserTerme('1234567').numeroLot).toBeNull();
  });
});

describe('les bornes, et ce qu’on en dit', () => {
  it('trop court : rien n’est cherché, et l’écran le DIT', () => {
    const t = analyserTerme('a');
    expect(t.vide).toBe(true);
    expect(messageRechercheVide(t)).toContain(`${LONGUEUR_MINIMALE} caractères`);
  });

  it('vide ou absent ne casse rien', () => {
    expect(analyserTerme(null).vide).toBe(true);
    expect(analyserTerme(undefined).vide).toBe(true);
    expect(analyserTerme('   ').vide).toBe(true);
  });

  it('un copier-coller géant est TRONQUÉ, jamais refusé', () => {
    const t = analyserTerme('x'.repeat(500));
    expect(t.brut).toHaveLength(LONGUEUR_MAXIMALE);
    expect(t.vide).toBe(false);
  });

  it('« aucun résultat » rappelle ce qui a été cherché ET ce sur quoi porte la recherche', () => {
    const m = messageRechercheVide(analyserTerme('DUPONT'));
    expect(m).toContain('DUPONT');
    expect(m).toContain('téléphones');
    expect(m).toContain('numéros de lot');
  });
});

describe('les accents et la casse ne comptent jamais', () => {
  it('« PUTEAUX », « puteaux » et « Putéaux » donnent le même texte cherché', () => {
    expect(analyserTerme('PUTEAUX').texte).toBe('puteaux');
    expect(analyserTerme('puteaux').texte).toBe('puteaux');
    expect(analyserTerme('Putéaux').texte).toBe('puteaux');
  });

  it('une adresse tapée sans accent retrouve la même forme que celle qui en a', () => {
    expect(analyserTerme('54 avenue Puvis de Chavannes').texte)
      .toBe(analyserTerme('54 AVENUE PUVIS DE CHAVÂNNES').texte);
  });
});

describe('les mots de l’écran', () => {
  it('une date ISO se dit en français, et une date absente ne dit rien', () => {
    expect(formaterDateIso('2018-07-19')).toBe('19/07/2018');
    expect(formaterDateIso('2018-07-19T00:00:00.000Z')).toBe('19/07/2018');
    expect(formaterDateIso(null)).toBe('');
    expect(formaterDateIso('n’importe quoi')).toBe('');
  });

  it('une occupation se dit selon ce qu’on sait d’elle — jamais une date inventée', () => {
    expect(periodeOccupation('2022-09-01', null)).toBe('depuis le 01/09/2022');
    expect(periodeOccupation('2019-02-01', '2022-08-31')).toBe('du 01/02/2019 au 31/08/2022');
    expect(periodeOccupation(null, '2022-08-31')).toBe('jusqu’au 31/08/2022');
    expect(periodeOccupation(null, null)).toBe('dates inconnues');
  });

  it('un logement sans adresse le DIT, au lieu d’afficher une ligne vide', () => {
    expect(titreLogement('4 rue Fictive', 'PUTEAUX')).toBe('4 rue Fictive, PUTEAUX');
    expect(titreLogement('4 rue Fictive', null)).toBe('4 rue Fictive');
    expect(titreLogement(null, 'PUTEAUX')).toBe('PUTEAUX');
    expect(titreLogement(null, null)).toBe('Adresse non renseignée');
    expect(titreLogement('  ', '  ')).toBe('Adresse non renseignée');
  });
});

/**
 * GARANTIES D'ÉCRAN, lues dans la source — ce qu'aucun test de fonction pure ne peut tenir.
 */
describe('garanties statiques de l’écran « Annuaire »', () => {
  const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');

  /**
   * ══ 🔴 RÈGLE RÉÉCRITE LE 29/09/2026 (lot FICHES-ANNUAIRE) ═══════════════════════════════════════════════════
   *
   * ELLE COMPTAIT LES `<input>` DU FICHIER, et il y en a maintenant DEUX. Ce n'est pas un second champ : c'est
   * LE MÊME, écrit à deux endroits parce qu'il change de forme — grand avec son étiquette sur les résultats,
   * compact dans l'en-tête d'une fiche, où l'on cherche la personne SUIVANTE. Les deux sont mutuellement
   * exclusifs (`fiche === null` / `fiche !== null`) : un seul est rendu à la fois, et ils écrivent tous les deux
   * dans `terme`.
   *
   * CE QUE LA RÈGLE PROTÉGEAIT, ET QUI N'A PAS BOUGÉ : on ne choisit JAMAIS, avant de taper, dans quel champ on
   * est — il n'y a qu'une recherche, et elle accepte tout. C'est cela qu'on éprouve désormais, plutôt qu'un
   * comptage de balises que la moindre mise en page faisait mentir.
   */
  it('🔴 UNE SEULE recherche : les deux champs sont exclusifs et écrivent au même endroit', () => {
    const champs = src.match(/<input[\s\S]*?\/>/g) ?? [];
    expect(champs).toHaveLength(2);
    // Les deux sont des champs de RECHERCHE, et tous deux alimentent `terme`.
    for (const c of champs) {
      expect(c).toContain('type="search"');
      expect(c).toContain('setTerme(e.target.value)');
    }
    // L'un porte l'étiquette visible (les résultats), l'autre son intitulé accessible (la fiche).
    expect(src).toContain('<label className="ann-label"');
    expect(src).toContain('aria-label="Chercher un propriétaire, un lot, un locataire"');
    // 🔴 EXCLUSIFS : l'un ne s'affiche que sans fiche, l'autre que sur une fiche.
    expect(src).toContain('{fiche === null && (');
    expect(src).toContain('{fiche !== null && (');
  });

  it('les trois fiches existent, et le rôle de chaque valeur est écrit en toutes lettres', () => {
    expect(src).toContain('function VueProprietaire');
    expect(src).toContain('function VueLot');
    expect(src).toContain('function VueLocataire');
    expect(src).toContain('Propriétaire');
    expect(src).toContain('Locataire actuel');
    expect(src).toContain('Locataires passés');
  });

  it('les coordonnées sont cliquables : `tel:` compose, `mailto:` (ou l’éditeur maison) écrit', () => {
    expect(src).toContain('href={`tel:${c.valeur}`}');
    expect(src).toContain('href={`mailto:${c.valeur}`}');
  });

  /**
   * ══ 🔴 MOTS RÉÉCRITS LE 29/09/2026 (lot FICHES-ANNUAIRE), à la demande d'Arno, mot pour mot :
   * « Puis la date de début de collaboration (“le 11/06/2025 — début de gestion du plus ancien lot”) ».
   *
   * CE QUE LA RÈGLE PROTÈGE N'A PAS BOUGÉ D'UN POUCE : cette date est DÉRIVÉE (le plus ancien début de gestion),
   * et l'écran doit le dire. Présentée comme une saisie, on la corrigerait — et il n'y a rien à corriger.
   */
  it('🔴 la date de début de collaboration est PRÉSENTÉE comme dérivée, jamais comme une saisie', () => {
    expect(src).toContain('Début de collaboration');
    expect(src).toContain('début de gestion du plus ancien lot');
  });

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT FICHES-ANNUAIRE — LA FICHE PROPRIÉTAIRE RESTRUCTURÉE
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴 CONSTAT D'ARNO sur la fiche de M. ROI Nathan : « elle est nulle, il faut totalement la restructurer ».
   * Elle commençait à 590 px du haut, sous cinq blocs qui ne la concernaient pas. Le premier bloc est désormais
   * les COORDONNÉES, et il porte tout ce qu'Arno a énuméré.
   */
  it('🔴 le premier bloc est celui des COORDONNÉES, et il porte tout ce qui a été demandé', () => {
    const i = src.indexOf('function BlocCoordonnees');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, src.indexOf('function DateOuRien'));
    for (const mot of ['Qualité', 'Adresse postale', 'Téléphone', 'E-mail', 'Note', 'Début de collaboration']) {
      expect(bloc).toContain(mot);
    }
    // Le libellé d'origine de chaque coordonnée, et son bouton Copier.
    expect(bloc).toContain('ann-libelle');
    expect(bloc).toContain('<BoutonCopier');
  });

  /**
   * 🔴🔴 ON N'INVENTE JAMAIS UNE DONNÉE ABSENTE. Mesuré sur la vraie base le 29/09/2026 : ni « qualité », ni
   * « note », ni « surface » n'existent dans le schéma. L'écran écrit « non renseignée » — un fait — plutôt
   * qu'un vide, qui se lirait comme un oubli d'affichage, ou qu'une valeur devinée, qui serait un mensonge.
   */
  it('🔴 ce que la base ne sait pas est écrit « non renseigné(e) », jamais laissé vide', () => {
    const bloc = src.slice(src.indexOf('function BlocCoordonnees'), src.indexOf('function VueProprietaire'));
    expect((bloc.match(/non renseignée/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(bloc).toContain('non renseigné');
  });

  /** 🔴 LA CARTE D'UN BIEN porte les huit faits qu'Arno a énumérés, chacun avec son mot. */
  it('🔴 une carte de bien dit adresse, lot, type, surface, locataire, mails, dernier échange, événements, Drive', () => {
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    for (const mot of ['lot ', 'Surface', 'Locataire', 'Mails', 'Dernier échange', 'Événements ouverts']) {
      expect(carte).toContain(mot);
    }
    // « Vacant » est un MOT, jamais une couleur seule.
    expect(carte).toContain('Vacant');
    // Le dossier Drive du LOT, et l'aveu quand il n'existe pas.
    expect(carte).toContain('Dossier Drive du lot');
    expect(carte).toContain('dossier Drive non construit');
  });

  /**
   * 🔴 UN BOUTON DANS UN BOUTON est du HTML invalide et injouable au clavier. La carte entière est le bouton ;
   * les deux liens qui en sortent vivent dans un PIED, à côté — pas dedans.
   */
  it('🔴 les liens d’une carte sont hors du bouton de la carte', () => {
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    const corps = carte.slice(carte.indexOf('ann-carte-corps'), carte.indexOf('ann-carte-pied'));
    expect(corps).not.toContain('<a ');
    expect(carte.slice(carte.indexOf('ann-carte-pied'))).toContain('<a className="ann-lien"');
  });

  /** ⚠️ LES ANCIENS BIENS SONT REPLIÉS, JAMAIS RETIRÉS : on ouvre souvent la fiche pour eux. */
  it('les biens sortis de gestion ont leur section repliable', () => {
    const vue = src.slice(src.indexOf('function VueProprietaire'), src.indexOf('function VueLot'));
    expect(vue).toContain('Anciens biens');
    expect(vue).toContain('aria-expanded={anciensOuverts}');
    expect(vue).toContain('Biens en gestion');
  });

  it('mobile d’abord : cibles ≥ 44 px, et AUCUNE interaction au seul survol', () => {
    expect(src).toContain('min-height:44px');
    expect(src).not.toMatch(/:hover\{[^}]*(display|visibility)\s*:/);
  });

  it('« lot hors gestion » et « absent du dernier export » sont dits par des MOTS', () => {
    expect(src).toContain('lot hors gestion');
    expect(src).toContain('absent du dernier export');
  });

  it('l’écran DIT quand l’annuaire n’est pas installé, plutôt que de rester vide', () => {
    expect(src).toContain('sans_schema');
    expect(src).toContain('n’est pas encore installé');
  });

  /**
   * 🔴 CORRECTIF DU 26/09/2026, mesuré à l'écran sur la vraie base : chercher « puvis » correspond à 76 logements,
   * l'écran en montrait 60 et annonçait « 60 résultats » — 16 disparaissaient sans un mot. Une liste coupée qui ne
   * le dit pas est un mensonge, et c'est précisément ce que le module s'interdit ailleurs (la fenêtre de 30 jours
   * de la file annonce ce qu'elle laisse de côté).
   */
  it('🔴 une liste COUPÉE le dit, et dit quoi faire pour voir le reste', () => {
    expect(src).toContain('reponse.tronque');
    expect(src).toContain('premiers résultats');
    expect(src).toContain('d’autres correspondent');
    expect(src).toContain('Précisez votre recherche');
  });

  it('le dépôt demande UNE ligne de plus que le plafond — c’est elle qui révèle qu’il y en a d’autres', () => {
    const repo = readFileSync('app/lib/gestion/annuaireRepo.ts', 'utf8');
    expect(repo).toContain('PLAFOND_RESULTATS + 1');
    expect(repo).toContain('rows.length > PLAFOND_RESULTATS');
    // La ligne en trop ne doit JAMAIS être rendue : elle ne sert qu'à compter.
    expect(repo).toContain('rows.slice(0, PLAFOND_RESULTATS)');
  });
});
