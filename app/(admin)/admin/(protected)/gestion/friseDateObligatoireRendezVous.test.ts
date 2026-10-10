import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dateAuCentre, estCarteRendezVous, jourAEnregistrer, MENTION_DATE_RDV, refusDEnregistrement,
  typesRendezVous, valeursDeLaCarte,
} from '../../../../lib/gestion/frise';
import { motEtape, type TypeEtape } from '../../../../lib/gestion/mongaEtape';

/**
 * ══ 🔴🔴 LOT FRISE-DATE-OBLIGATOIRE-RENDEZ-VOUS (09/10/2026) ═══════════════════════════════════════════════════
 *
 * ARNO, en trois points :
 *   ① cartes de RENDEZ-VOUS — date et heure VIDES à l'ouverture, champ cerclé de rouge, « Valider » refuse tant
 *      que la date est vide, l'heure reste facultative, et la règle suit le changement de Type ;
 *   ② toutes les AUTRES cartes — date et heure FACULTATIVES, pré-remplissage conservé, aucun cercle ;
 *   ③ Ouverture / Clôture / Réouverture — aucun champ date ni heure, et leur titre+date centrés dans le carré,
 *      horizontalement ET verticalement.
 */

const TOUS: readonly TypeEtape[] = [
  'ouverture', 'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte', 'rdv_intervention',
  'intervention', 'rapport', 'cloture', 'facture', 'rappel_devis', 'contact_injoignable', 'commentaire',
  'note', 'assurance', 'expertise', 'relance', 'reouverture', 'autre',
];

const FAV = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');

describe('🔴🔴 ① quelles cartes exigent leur date', () => {
  /**
   * 🔴🔴 LES TROIS QU'ARNO NOMME, ET EXACTEMENT ELLES. Le test parcourt la liste ENTIÈRE des types : si un
   * quatrième se mettait à porter « rendez-vous » dans son nom, ce cas le dirait au lieu de le laisser passer.
   */
  it('🔴🔴 les trois cartes de rendez-vous, et aucune autre', () => {
    expect(typesRendezVous(TOUS)).toEqual(['prise_rdv', 'rdv_eu_lieu', 'rdv_intervention']);
    expect(typesRendezVous(TOUS).map(motEtape)).toEqual([
      'Prise de rendez-vous', 'Rendez-vous eu lieu', 'Rendez-vous d’intervention',
    ]);
  });

  /**
   * 🔴 LA RÈGLE LIT LE NOM, PAS UNE LISTE RECOPIÉE (Arno : « et tout type dont le nom contient rendez-vous »).
   * ⚠️ ET ELLE SURVIT À L'APOSTROPHE TYPOGRAPHIQUE : « Rendez-vous d’intervention » en porte une.
   */
  it('🔴 c’est le NOM du type qui décide', () => {
    expect(estCarteRendezVous('rdv_intervention')).toBe(true);
    expect(motEtape('rdv_intervention')).toContain('’');
    for (const t of ['devis_recu', 'intervention', 'facture', 'assurance', 'expertise', 'autre'] as TypeEtape[]) {
      expect(estCarteRendezVous(t), t).toBe(false);
    }
  });
});

describe('🔴🔴 ① ce que le formulaire propose à l’ouverture', () => {
  /** 🔴🔴 « LES CHAMPS DATE ET HEURE SONT VIDES » — plus de date proposée pour un rendez-vous. */
  it('🔴🔴 une carte de rendez-vous neuve s’ouvre SANS date', () => {
    for (const t of typesRendezVous(TOUS)) {
      const v = valeursDeLaCarte(null, '2026-10-09', t);
      expect(v.jour, t).toBe('');
      expect(v.heure, t).toBe('');
    }
  });

  /** 🔴 ET LE PRÉREMPLISSAGE DES AUTRES NE BOUGE PAS D'UN IOTA (point 2). */
  /* ⚠️ CE CAS DISAIT : « une carte ordinaire GARDE la date proposée » ('2026-10-09'). INVERSÉ le 10/10/2026 par
     le lot FRISE-DATE-VIDE-PAR-DEFAUT : Arno a retiré la date proposée de TOUTES les cartes. Ce qui distingue
     encore le rendez-vous n'est plus le champ vide, c'est l'OBLIGATION (refus + cercle rouge, cas plus bas). */
  it('🔴 une carte ordinaire s’ouvre AUSSI sans date', () => {
    expect(valeursDeLaCarte(null, '2026-10-09', 'devis_recu').jour).toBe('');
    expect(valeursDeLaCarte(null, '2026-10-09', 'facture').jour).toBe('');
    expect(valeursDeLaCarte(null, '2026-10-09', 'autre').jour).toBe('');
  });

  /**
   * 🔴🔴 EN MODIFICATION, LA DATE DE LA CARTE EST PRÉ-REMPLIE — y compris sur un rendez-vous : on corrige une
   * carte qui existe, on ne la vide pas. (Et si on la vide à la main, le refus la retient : cas plus bas.)
   */
  it('🔴🔴 modifier un rendez-vous pré-remplit sa date', () => {
    const carte = {
      id: 1, type: 'prise_rdv' as TypeEtape, survenuLe: '2026-11-14T09:30:00Z', heureConnue: true,
      texte: null, titre: null, montantCents: null, pieceNom: null,
    } as unknown as Parameters<typeof valeursDeLaCarte>[0];
    const v = valeursDeLaCarte(carte, '2026-10-09', 'prise_rdv');
    expect(v.jour).toBe('2026-11-14');
    expect(v.heure).toBe('09:30');
  });
});

describe('🔴🔴 ① « Valider » refuse, et le DIT', () => {
  /** 🔴🔴 LES MOTS D'ARNO, AU CARACTÈRE PRÈS — et les mêmes pour la mention du champ et pour le refus. */
  it('🔴🔴 une date vide refuse un rendez-vous', () => {
    expect(MENTION_DATE_RDV).toBe('Date du rendez-vous obligatoire');
    for (const t of typesRendezVous(TOUS)) {
      expect(refusDEnregistrement({ jour: '', type: t, titre: '', montantLisible: true }), t)
        .toBe(MENTION_DATE_RDV);
    }
  });

  /** 🔴 DÈS QU'UNE DATE EST SAISIE, PLUS DE REFUS — et l'heure n'y est pour rien (elle reste facultative). */
  it('🔴 une date saisie suffit, l’heure reste libre', () => {
    expect(refusDEnregistrement({ jour: '2026-11-14', type: 'prise_rdv', titre: '', montantLisible: true }))
      .toBeNull();
  });

  /** 🔴🔴 ET SUR UNE CARTE ORDINAIRE, UNE DATE VIDE N'EST PLUS UN REFUS (point 2). */
  it('🔴🔴 une carte ordinaire s’enregistre sans date', () => {
    for (const t of ['devis_recu', 'devis_refuse', 'devis_accepte', 'intervention', 'rapport', 'facture',
      'assurance', 'expertise', 'note'] as TypeEtape[]) {
      expect(refusDEnregistrement({ jour: '', type: t, titre: '', montantLisible: true }), t).toBeNull();
    }
    /* ⚠️ La carte LIBRE garde son refus à elle — il porte sur le titre, pas sur la date. */
    expect(refusDEnregistrement({ jour: '', type: 'autre', titre: '', montantLisible: true }))
      .toBe('Une carte libre demande un titre.');
  });

  /** ⚠️ UNE DATE ILLISIBLE RESTE UNE ERREUR, pour tout le monde : ce n'est pas « pas de date », c'est faux. */
  it('⚠️ une date illisible est refusée, rendez-vous ou non', () => {
    for (const t of ['prise_rdv', 'devis_recu'] as TypeEtape[]) {
      expect(refusDEnregistrement({ jour: '14/11/2026', type: t, titre: '', montantLisible: true }), t)
        .toBe('La date ne se lit pas : attendu JJ/MM/AAAA.');
    }
  });

  /**
   * 🔴 LE JOUR RÉELLEMENT ENREGISTRÉ : celui qu'on a saisi, sinon celui du « + » d'où le bloc s'est ouvert.
   * `survenu_le` est `NOT NULL` en base et la frise range par jour : « facultative » ne peut pas vouloir dire
   * « sans date » — cela veut dire « vous n'avez pas à la saisir ».
   */
  it('🔴 une date vide se range au jour du « + »', () => {
    expect(jourAEnregistrer('', '2026-10-09')).toBe('2026-10-09');
    expect(jourAEnregistrer('2026-11-14', '2026-10-09')).toBe('2026-11-14');
  });
});

describe('🔴 ① ce que l’écran en fait', () => {
  it('🔴 le cercle rouge et sa mention naissent du même état', () => {
    expect(FAV).toContain("const dateManquante = estCarteRendezVous(type) && jour === '';");
    expect(FAV).toContain("className={`fav-champ${dateManquante ? ' fav-champ--exige' : ''}`}");
    expect(FAV).toContain('aria-invalid={dateManquante}');
    expect(FAV).toContain('{MENTION_DATE_RDV}');
  });

  /** 🔴 LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE : le champ est décrit, et la mention est liée. */
  it('🔴 le champ invalide est décrit pour un lecteur d’écran', () => {
    expect(FAV).toContain("aria-describedby={dateManquante ? 'fav-jour-exige' : undefined}");
    expect(FAV).toContain('id="fav-jour-exige"');
  });

  /** 🔴🔴 « SI ON CHANGE LE TYPE, LA RÈGLE SUIT » — dans les deux sens, et sans jeter une date saisie. */
  /* ⚠️ CE CAS DISAIT : « changer de type EFFACE OU REND la date proposée » — vers un rendez-vous on effaçait le
     jour du « + », en le quittant on le rendait. INVERSÉ le 10/10/2026 (lot FRISE-DATE-VIDE-PAR-DEFAUT) : il
     n'y a plus de date proposée à effacer ni à rendre. Le champ garde ce que la personne y a mis ; la règle du
     rendez-vous suit toujours le type, parce qu'elle se DÉDUIT de `type` et `jour`. */
  it('🔴🔴 changer de type ne touche plus à la date — la règle, elle, suit le type', () => {
    expect(FAV).toContain('onChange={(e) => changerDeType(e.target.value as TypeEtape)}');
    expect(FAV).toContain('const changerDeType = (suivant: TypeEtape): void => { setType(suivant); };');
    expect(FAV).not.toContain("setJour(jourDefaut)");
    expect(FAV).toContain("const dateManquante = estCarteRendezVous(type) && jour === '';");
  });
});

describe('🔴🔴 ③ les bornes : aucun champ de date, et un bloc centré', () => {
  /** 🔴 LES TROIS BORNES, et elles seules, n'offrent ni Date ni Heure (accord explicite d'Arno). */
  it('🔴 Ouverture, Clôture et Réouverture n’ont pas de champ date', () => {
    for (const t of ['ouverture', 'cloture', 'reouverture'] as TypeEtape[]) expect(dateAuCentre(t), t).toBe(true);
    for (const t of ['prise_rdv', 'devis_recu', 'autre'] as TypeEtape[]) expect(dateAuCentre(t), t).toBe(false);
    expect(FAV).toContain('{dateAuCentre(type) ? (');
    expect(FAV).toContain('Date fixée automatiquement au jour de la pose');
  });

  /**
   * 🔴🔴 LE CENTRAGE VERTICAL, DEMANDÉ AU POINT 3 : « le bloc titre+date au milieu de la hauteur utile,
   * au-dessus des pictos du bas ». Le centrage HORIZONTAL existait déjà (text-align sur le conteneur).
   *
   * ⚠️ LE MÊME JUGE QUE LE GRAS ET LE CENTRAGE HORIZONTAL (`dateAuCentre`) : une seconde condition aurait fini
   * par désigner un autre ensemble de cartes.
   */
  it('🔴🔴 le bloc titre+date d’une borne se centre en hauteur', () => {
    expect(FAV).toContain(".fav-carre-clic--borne{justify-content:center}");
    expect(FAV).toContain("className={`fav-carre-clic${dateAuCentre(e.type) ? ' fav-carre-clic--borne' : ''}`}");
    /* La carte d'ouverture DÉRIVÉE (celle qui porte la correction de date) est une borne elle aussi. */
    expect(FAV).toContain('className="fav-carre-clic fav-carre-clic--borne"');
  });

  /** ⚠️ ET SEULEMENT LES BORNES : une carte ordinaire garde son titre en haut, aligné avec ses voisines. */
  it('⚠️ une carte ordinaire n’est pas centrée en hauteur', () => {
    const regle = FAV.slice(FAV.indexOf('.fav-carre-clic{'), FAV.indexOf('.fav-carre-clic--borne'));
    expect(regle).not.toContain('justify-content');
  });
});
