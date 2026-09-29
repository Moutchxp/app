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
  /**
   * ══ 🔴 RÈGLE RÉÉCRITE UNE SECONDE FOIS LE 29/09/2026 (lot FICHES-ANNUAIRE, étape C) ═════════════════════════
   *
   * ELLE COMPTAIT TOUS LES `<input>` DU FICHIER, et attendait exactement deux. L'étape C ajoute de VRAIS
   * formulaires à cet écran — créer une personne, enregistrer un départ — donc d'autres `<input>`, qui ne sont
   * pas des champs de recherche du tout. Le comptage global ne disait plus rien.
   *
   * CE QU'ON ÉPROUVE DÉSORMAIS, et qui est la règle elle-même : les champs de RECHERCHE (`type="search"`) sont
   * DEUX, ils écrivent tous les deux dans `terme`, et ils sont mutuellement exclusifs. Les autres saisies sont
   * des formulaires, et n'ont rien à voir avec « une seule recherche ».
   */
  it('🔴 UNE SEULE recherche : les deux champs sont exclusifs et écrivent au même endroit', () => {
    const champs = (src.match(/<input[\s\S]*?\/>/g) ?? []).filter((c) => c.includes('type="search"'));
    expect(champs).toHaveLength(2);
    // Les deux alimentent `terme` : on ne choisit jamais, avant de taper, dans quel champ on est.
    for (const c of champs) expect(c).toContain('setTerme(e.target.value)');
    // L'un porte l'étiquette visible (les résultats), l'autre son intitulé accessible (la fiche).
    expect(src).toContain('<label className="ann-label"');
    expect(src).toContain('aria-label="Chercher un propriétaire, un lot, un locataire"');
    // 🔴 EXCLUSIFS : l'un ne s'affiche que sans fiche, l'autre que sur une fiche.
    expect(src).toContain('{fiche === null && (');
    expect(src).toContain('{fiche !== null && (');
  });

  /**
   * ══ 🔴 MOTS RÉÉCRITS LE 29/09/2026 (lot FICHES-ANNUAIRE, étape B) ══════════════════════════════════════════
   *
   * « Locataire actuel » et « Locataires passés » sont devenus « Locataire(s) en place » et « Historique des
   * locataires » — les mots d'Arno, mot pour mot, et ils disent mieux ce qu'on lit : un logement peut avoir
   * PLUSIEURS occupants en place (colocataires, couple), ce que « le locataire actuel » niait au singulier.
   *
   * CE QUE LA RÈGLE PROTÈGE N'A PAS BOUGÉ : les trois fiches existent, et le RÔLE de chaque valeur est écrit en
   * toutes lettres — jamais deux noms l'un sous l'autre sans dire lequel est lequel.
   */
  it('🔴 les trois fiches existent, et le rôle de chaque valeur est écrit en toutes lettres', () => {
    expect(src).toContain('function VueProprietaire');
    expect(src).toContain('function VueLot');
    expect(src).toContain('function VueLocataire');
    expect(src).toContain('Propriétaire');
    expect(src).toContain('en place');
    expect(src).toContain('Historique des locataires');
    // Le rôle de la personne est dit dans une capsule, en toutes lettres : « En place » / « Parti ».
    expect(src).toContain('En place');
    expect(src).toContain('Parti');
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
  /**
   * ══ 🔴 RÈGLE RÉÉCRITE LE 29/09/2026 (lot FICHES-ANNUAIRE, étape C) ══════════════════════════════════════════
   *
   * ELLE LISAIT `function BlocCoordonnees`, qui n'existe plus : ce bloc n'affichait qu'UNE personne, et son `<dl>`
   * ne pouvait pas aligner un libellé sur sa valeur — le défaut signalé par Arno (« des écarts de niveaux
   * partout »). Le premier bloc est désormais une RANGÉE DE CARTES (`BlocCartes`, fichier `CartesPersonnes`), une
   * par propriétaire, chacune avec son crayon « Modifier ».
   *
   * CE QUE LA RÈGLE PROTÉGEAIT N'A PAS BOUGÉ D'UN POUCE, et on l'éprouve toujours, au nouvel endroit : le premier
   * bloc de la fiche est celui des COORDONNÉES, il porte tout ce qu'Arno a énuméré (qualité, adresse, téléphones,
   * e-mails, note), chaque coordonnée a son LIBELLÉ et son bouton COPIER, et la date de début de collaboration
   * suit. Le détail ligne par ligne vit dans `annuaireEdition.test.ts`, avec les cartes.
   */
  it('🔴 le premier bloc est celui des COORDONNÉES, et il porte tout ce qui a été demandé', () => {
    // Sur la fiche : le bloc « Coordonnées » vient AVANT les biens, et c'est une rangée de cartes.
    const vue = src.slice(src.indexOf('function VueProprietaire'), src.indexOf('function BoutonDepart'));
    expect(vue.indexOf('titre="Coordonnées"')).toBeGreaterThan(0);
    expect(vue.indexOf('titre="Coordonnées"')).toBeLessThan(vue.indexOf('Biens en gestion'));
    expect(vue).toContain('Début de collaboration');

    // Dans la carte : tout ce qu'Arno a énuméré, avec le libellé de chaque coordonnée et son bouton Copier.
    const carte = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    for (const mot of ['Qualité', 'Adresse', 'Téléphone', 'E-mail', 'Note']) expect(carte).toContain(mot);
    expect(carte).toContain('cp-caps');
    expect(carte).toContain('<Copier ');
  });

  /**
   * 🔴🔴 ON N'INVENTE JAMAIS UNE DONNÉE ABSENTE. Mesuré sur la vraie base le 29/09/2026 : ni « qualité », ni
   * « note », ni « surface » n'existent dans le schéma. L'écran écrit « non renseignée » — un fait — plutôt
   * qu'un vide, qui se lirait comme un oubli d'affichage, ou qu'une valeur devinée, qui serait un mensonge.
   */
  /**
   * ⚠️ MÊME RÉÉCRITURE QUE CI-DESSUS, ET MÊME MOTIF : le bloc lu n'existe plus, la règle est intacte. Elle vaut
   * maintenant pour la CARTE, qui est l'endroit où ces valeurs s'affichent — et où, la migration 278 appliquée,
   * « qualité » et « note » cesseront d'être vides pour de bon.
   */
  it('🔴 ce que la base ne sait pas est écrit « non renseigné(e) », jamais laissé vide', () => {
    const carte = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect((carte.match(/non renseignée/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(carte).toContain('non renseigné');
    // Et c'est un MOT en italique gris, jamais un blanc, qui se lirait comme un oubli d'affichage.
    expect(carte).toContain('.cp-rien{font-style:italic');
    // La surface d'un bien, elle, reste dite sur la fiche : aucune colonne ne la porte.
    expect(src).toContain('non renseignée');
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

  /* ════════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT FICHES-ANNUAIRE, ÉTAPE B — LA FICHE DU BIEN ET « LA VIE DU BIEN »
     ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /** 🔴 L'EN-TÊTE DU BIEN porte les cinq choses qu'Arno a énumérées, et le dossier Drive en action. */
  it('🔴 l’en-tête du bien : adresse, lot, type, surface, propriétaire, dossier Drive', () => {
    const vue = src.slice(src.indexOf('function VueLot'), src.indexOf('function grouperParPeriode'));
    for (const mot of ['ann-tete-nom', 'lot {f.numero}', 'Surface', 'Propriétaire', 'Dossier Drive']) {
      expect(vue).toContain(mot);
    }
    // 🔴 LA SURFACE N'EST PAS DEVINÉE DEPUIS LE TYPE : aucune colonne n'existe, on écrit le fait.
    expect(vue).toContain('non renseignée');
  });

  /**
   * 🔴 LE GROUPEMENT PAR BAIL EST ÉCRIT, même si la base n'en contient aucun aujourd'hui. Mesuré le
   * 29/09/2026 : zéro couple (lot, date d'entrée) porté par deux personnes. Un écran qui n'aurait pas prévu deux
   * occupants les afficherait comme deux baux successifs — ce qui serait faux le jour où l'étape C en crée un.
   */
  it('🔴 les occupations sont groupées par PÉRIODE, et un groupe de deux le DIT', () => {
    const vue = src.slice(src.indexOf('function VueLot'), src.indexOf('export const CSS_ANNUAIRE'));
    expect(vue).toContain('function grouperParPeriode');
    expect(vue).toContain('occupants du même bail');
    // La clé du groupe est la PAIRE de dates, et rien d'autre.
    expect(vue).toContain('${o.entree ?? \'?\'}|${o.sortie ?? \'?\'}');
  });

  /** 🔴 CHAQUE OCCUPANT, EN PLACE OU PARTI, PORTE SES COORDONNÉES COMPLÈTES — c'est la demande, mot pour mot. */
  it('🔴 un occupant affiche ses dates, son adresse, ses téléphones et ses e-mails', () => {
    const bloc = src.slice(src.indexOf('function BlocOccupant'), src.indexOf('function VueLot'));
    for (const mot of ['Adresse postale', 'Téléphone', 'E-mail', 'ann-libelle', '<BoutonCopier']) {
      expect(bloc).toContain(mot);
    }
    expect(bloc).toContain('periodeOccupation');
  });
  it('mobile d’abord : cibles ≥ 44 px, et AUCUNE interaction au seul survol', () => {
    expect(src).toContain('min-height:44px');
    expect(src).not.toMatch(/:hover\{[^}]*(display|visibility)\s*:/);
  });

  /**
   * ══ 🔴 MOTS RÉÉCRITS LE 29/09/2026 (lot FICHES-ANNUAIRE, étape C) ═══════════════════════════════════════════
   *
   * « lot hors gestion » est devenu « hors gestion » : la mention vit maintenant DANS une carte de logement, à
   * côté de la capsule « lot 494 » — répéter le mot « lot » à trois centimètres du numéro du lot était du
   * bavardage. La règle protégée, elle, n'a pas bougé d'un pouce : ces deux états sont dits par des MOTS, jamais
   * par une couleur ou un simple grisé, qu'un écran mal éclairé ou un œil daltonien ne rend pas.
   */
  it('« hors gestion » et « absent du dernier export » sont dits par des MOTS', () => {
    expect(src).toContain('hors gestion');
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 « LA VIE DU BIEN » — LE MÊME FORMAT DE LIGNE QUE LA BOÎTE
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la vie du bien', () => {
  const vdb = readFileSync('app/(admin)/admin/(protected)/gestion/VieDuBien.tsx', 'utf8');

  /**
   * 🔴 « LE MÊME FORMAT DE LIGNE QUE LA BOÎTE » N'EST PAS UNE RESSEMBLANCE : ce sont les MÊMES fonctions pures
   * qui décident. En réécrire une seule ici donnerait, un jour, deux verdicts pour un même mail — et c'est celui
   * qu'on regarde le moins qui garderait l'erreur.
   */
  it('🔴 la capsule et le trombone viennent des fonctions de la BOÎTE, jamais d’une seconde règle', () => {
    expect(vdb).toContain("from '../../../../lib/gestion/statutClassement'");
    expect(vdb).toContain('motCapsule');
    expect(vdb).toContain('tonCapsule');
    expect(vdb).toContain('etatTrombone');
    expect(vdb).toContain('motTrombone');
    expect(vdb).toContain('trierPieces');
  });

  /** 🔴 UN BOUTON DANS UN BOUTON est du HTML invalide : le triangle est le VOISIN de la ligne. */
  it('🔴 le triangle est hors du bouton de la ligne, et muet au clavier', () => {
    const i = vdb.indexOf('vdb-triangle');
    const ligne = vdb.indexOf('className="vdb-ligne"');
    expect(i).toBeGreaterThan(0);
    expect(ligne).toBeGreaterThan(i);      // le triangle vient AVANT, donc à gauche
    expect(vdb).toContain('aria-hidden="true" tabIndex={-1}');
    expect(vdb).toContain('aria-expanded={ouvert}');
  });

  /** 🔴 LES TROIS FILTRES D'ARNO, et leur traduction en paramètres de la route — pas un de plus. */
  it('🔴 Tous / avec pièces jointes / avec événement ouvert, plus une recherche', () => {
    expect(vdb).toContain("{ cle: 'tous', mot: 'Tous' }");
    expect(vdb).toContain("mot: 'Avec pièces jointes'");
    expect(vdb).toContain("mot: 'Avec événement ouvert'");
    expect(vdb).toContain("p.set('pieces', 'avec')");
    expect(vdb).toContain("p.set('evt', 'ouvert')");
    expect(vdb).toContain("p.set('q', texte.trim())");
    // Le filtre actif est dit par `aria-pressed`, jamais par la seule couleur.
    expect(vdb).toContain('aria-pressed={filtre === f.cle}');
  });

  /** ⚠️ LES PIÈCES SONT RENDUES PAR LE COMPOSANT EXISTANT : deux rendus des mêmes pièces se contrediraient. */
  it('les pièces passent par `PiecesJointes`, jamais par un second rendu', () => {
    expect(vdb).toContain('<PiecesJointes messageId={l.messageId}');
  });

  /** ⚠️ ON NE CHARGE PAS 429 MAILS D'UN COUP : la vie du bien se lit par pages, et le dit. */
  it('la liste est paginée, et le changement de filtre revient à la première page', () => {
    expect(vdb).toContain("taille: '25'");
    expect(vdb).toContain('Voir la suite');
    expect(vdb).toContain('useEffect(() => { setPage(0); }, [filtre, texte]);');
  });
});
