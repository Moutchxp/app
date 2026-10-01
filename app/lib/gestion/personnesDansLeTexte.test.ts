import { describe, it, expect } from 'vitest';
import {
  BIENS_MONTRES, LONGUEUR_NOM_RARE, biensAMontrer, chiffresDuNumero, citeAvecMajuscule, compterLesMots,
  extraitAutour, motifDuContenu, motRare, motsDuNom, personnesDansLeTexte,
  type AnnuaireContenu, type PersonneConnue,
} from './personnesDansLeTexte';

/**
 * ══ 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — QUI LE TEXTE D'UN MAIL NOMME-T-IL ? ═════════════════════════════════
 *
 * LE CAS D'ARNO, 01/10/2026 : un virement du Crédit Mutuel, « Motif de l'opération : LOYER ZAHRA CHAKROUN
 * oct 2026 ». Aucune adresse de l'échange n'est à l'annuaire, et pourtant le mail dit de quel logement il parle.
 *
 * 🔴 ET LA RÈGLE ABSOLUE, QUI EST LA RAISON D'ÊTRE DU MODULE : une reconnaissance par le CONTENU ne rattache
 * jamais rien toute seule. Ce fichier éprouve ce qu'elle reconnaît ; `propositionsBien.test.ts` éprouve qu'elle
 * ne coche rien.
 */

const CHAKROUN: PersonneConnue = {
  cle: 'locataire|106', role: 'locataire', nom: 'CHAKROUN Zahra', nomFamille: 'CHAKROUN',
  emails: ['zahrachakroun@gmail.com'], telephones: ['+33609513571'], lots: ['295'],
};
const MARTY: PersonneConnue = {
  cle: 'proprietaire|310', role: 'proprietaire', nom: 'MARTY Jean-François', nomFamille: 'MARTY',
  lots: ['310', '311'],
};
/** Le faux positif qu'Arno nomme le premier : un locataire dont le nom est un mot de tous les jours. */
const PETIT: PersonneConnue = {
  cle: 'locataire|7', role: 'locataire', nom: 'PETIT Sophie', nomFamille: 'PETIT', lots: ['12'],
};
const MARTIN: PersonneConnue = {
  cle: 'locataire|8', role: 'locataire', nom: 'MARTIN Luc', nomFamille: 'MARTIN', lots: ['13'],
};

const ANNUAIRE: AnnuaireContenu = { personnes: [CHAKROUN, MARTY, PETIT, MARTIN] };
const cles = (t: string, a: AnnuaireContenu = ANNUAIRE) =>
  personnesDansLeTexte(t, a).map((c) => c.personne.cle);

/** Le corps RÉEL du mail 57335, raccourci mais pas retouché. */
const MAIL_57335 = `Bonjour,
Nous vous informons que nous avons instruit, le 01/10/2026, un ordre de virement initié par MME ZAHRA CHAKROUN :
Vers votre compte : FR7618206001XXXXXXXXXX543XX
Pour un montant de : 804,97 EUR
Motif de l'opération : LOYER ZAHRA CHAKROUN oct 2026
`;

describe('🔴🔴 ① le cas d’Arno, de bout en bout', () => {
  it('🔴🔴 « LOYER ZAHRA CHAKROUN » désigne Mme CHAKROUN, et elle seule', () => {
    const r = personnesDansLeTexte(MAIL_57335, ANNUAIRE);
    expect(r.map((c) => c.personne.cle)).toEqual(['locataire|106']);
    expect(r[0].par).toBe('nom_complet');
    expect(r[0].personne.lots).toEqual(['295']);
  });

  /** 🔴 ON CITE, ON NE REFORMULE PAS : Arno doit lire ce que le mail dit. */
  it('🔴🔴 l’extrait est le texte RÉEL, court', () => {
    const r = personnesDansLeTexte(MAIL_57335, ANNUAIRE);
    expect(r[0].extrait).toContain('ZAHRA CHAKROUN');
    expect(r[0].extrait.length).toBeLessThanOrEqual(60);
  });

  it('🔴 et la raison affichée nomme la personne et la façon', () => {
    const m = motifDuContenu(personnesDansLeTexte(MAIL_57335, ANNUAIRE)[0]);
    expect(m).toContain('trouvé dans le contenu du mail');
    expect(m).toContain('ZAHRA CHAKROUN');
    expect(m).toContain('CHAKROUN Zahra');
  });
});

describe('🔴 ② les trois façons de reconnaître quelqu’un', () => {
  it('🔴 son adresse e-mail, citée dans le texte', () => {
    const r = personnesDansLeTexte('Merci d’écrire à zahrachakroun@gmail.com pour la suite.', ANNUAIRE);
    expect(r.map((c) => c.par)).toEqual(['email']);
  });

  /** ⚠️ LE NUMÉRO SE COMPARE SUR SES NEUF DERNIERS CHIFFRES : l'indicatif s'écrit de six façons. */
  it('🔴 son téléphone, quelle que soit la façon de l’écrire', () => {
    for (const ecrit of ['06 09 51 35 71', '0609513571', '+33 6 09 51 35 71', '06.09.51.35.71']) {
      expect(cles(`Appelez le ${ecrit} svp`), ecrit).toEqual(['locataire|106']);
    }
    expect(chiffresDuNumero('+33 6 09 51 35 71')).toBe('609513571');
    expect(chiffresDuNumero('0609513571')).toBe('609513571');
    expect(chiffresDuNumero('1234')).toBe('');
  });

  it('🔴 son nom complet, dans n’importe quel ordre, accents et tirets indifférents', () => {
    expect(cles('dossier de Jean-François MARTY')).toEqual(['proprietaire|310']);
    expect(cles('dossier de marty jean francois')).toEqual(['proprietaire|310']);
    expect(cles('ZAHRA chakroun')).toEqual(['locataire|106']);
  });

  /** 🔴 « pas un fragment de mot » : on compare des MOTS ENTIERS. */
  it('🔴🔴 un fragment de mot ne reconnaît personne', () => {
    expect(cles('le CHAKROUNIEN et la MARTYROLOGIE')).toEqual([]);
    expect(cles('zahrachakrounXX@gmail.com')).toEqual([]);
  });
});

describe('🔴🔴 ③ les faux positifs qu’Arno demande d’empêcher', () => {
  /** ① HOMONYMES DE MOTS COURANTS — le nom seul ne suffit pas, et ces mots-là ne suffisent JAMAIS. */
  it('🔴🔴 « petit » et « martin » seuls ne proposent rien', () => {
    expect(cles('J’ai un petit souci avec le volet.')).toEqual([]);
    expect(cles('Le PETIT salon a été repeint.')).toEqual([]);
    expect(cles('Martin est passé ce matin.')).toEqual([]);
    expect(cles('MARTIN a signé.')).toEqual([]);
  });

  /** 🔴 …MAIS LA PERSONNE RESTE RECONNAISSABLE PAR SON NOM COMPLET : on exclut le raccourci, pas la personne. */
  it('🔴🔴 …mais « PETIT Sophie » en entier, oui', () => {
    expect(cles('Mme Sophie PETIT a appelé.')).toEqual(['locataire|7']);
    expect(cles('Luc MARTIN a appelé.')).toEqual(['locataire|8']);
  });

  /** ② LE NOM DE LA MAISON ET DE SES COLLABORATEURS : jamais. */
  it('🔴🔴 le nom de l’agence et de ses collaborateurs ne reconnaît personne', () => {
    const PONS: PersonneConnue = {
      cle: 'proprietaire|999', role: 'proprietaire', nom: 'PONS Jean-Baptiste', nomFamille: 'PONS',
      lots: ['500'],
    };
    const a: AnnuaireContenu = {
      personnes: [PONS],
      motsExclus: ['Jean-Baptiste PONS', 'CRITERIMMO', 'Sans Vis-à-Vis'],
    };
    expect(cles('Bien cordialement, Jean-Baptiste PONS — Service Gestion CRITERIMMO', a)).toEqual([]);
  });

  /** ③ UN MOT RARE ÉCRIT EN MINUSCULES N'EST PAS UN NOM PROPRE. */
  it('🔴🔴 un nom rare en minuscules ne reconnaît personne', () => {
    const RARE: PersonneConnue = {
      cle: 'locataire|9', role: 'locataire', nom: 'Brouillard', nomFamille: 'Brouillard', lots: ['14'],
    };
    const a: AnnuaireContenu = { personnes: [RARE] };
    expect(cles('il y avait du brouillard ce matin', a)).toEqual([]);
    expect(cles('Mme Brouillard a appelé', a)).toEqual(['locataire|9']);
  });

  it('⚠️ une personne sans aucun bien actif n’a rien à proposer', () => {
    const SANS: PersonneConnue = { cle: 'locataire|10', role: 'locataire', nom: 'VERLAINE Paul', lots: [] };
    expect(cles('Paul VERLAINE a écrit', { personnes: [SANS] })).toEqual([]);
  });
});

describe('🔴 ④ le critère de rareté, mesuré sur l’annuaire', () => {
  it('🔴 un mot porté par UNE seule fiche, d’au moins 5 lettres, hors des mots courants', () => {
    const parMot = compterLesMots([CHAKROUN, MARTY, PETIT, MARTIN]);
    expect(motRare('chakroun', parMot)).toBe(true);
    // porté par une seule fiche, mais c'est un mot de tous les jours
    expect(motRare('petit', parMot)).toBe(false);
    expect(motRare('martin', parMot)).toBe(false);
    expect(LONGUEUR_NOM_RARE).toBe(5);
  });

  it('🔴 un mot trop court ne tranche rien', () => {
    const parMot = compterLesMots([{ cle: 'x', role: 'locataire', nom: 'ROY Ada', lots: ['1'] }]);
    expect(motRare('roy', parMot)).toBe(false);
  });

  /** 🔴 PORTÉ PAR DEUX FICHES ⇒ IL NE DÉSIGNE PERSONNE : c'est tout l'objet de la mesure. */
  it('🔴🔴 un mot porté par deux fiches ne désigne plus personne', () => {
    const a: AnnuaireContenu = {
      personnes: [
        { cle: 'l|1', role: 'locataire', nom: 'DELAUNAY Marc', nomFamille: 'DELAUNAY', lots: ['1'] },
        { cle: 'l|2', role: 'locataire', nom: 'DELAUNAY Rose', nomFamille: 'DELAUNAY', lots: ['2'] },
      ],
    };
    expect(cles('Mme DELAUNAY a téléphoné', a)).toEqual([]);
    // …et chacun reste reconnaissable par son nom complet.
    expect(cles('Marc DELAUNAY a téléphoné', a)).toEqual(['l|1']);
  });

  it('les mots de liaison ne comptent pas dans un nom', () => {
    expect(motsDuNom('M. de LA TOUR épouse MARTIN')).toEqual(['tour', 'martin']);
    expect(motsDuNom('RYAN Aidan et Bernadette')).toEqual(['ryan', 'aidan', 'bernadette']);
  });

  it('la majuscule se repère avec ou sans accent, en capitales comme en initiale', () => {
    expect(citeAvecMajuscule('Mme Chakroun', 'chakroun')).toBe(true);
    expect(citeAvecMajuscule('LOYER CHAKROUN', 'chakroun')).toBe(true);
    expect(citeAvecMajuscule('loyer chakroun', 'chakroun')).toBe(false);
    expect(citeAvecMajuscule('Éberlin a écrit', 'eberlin')).toBe(true);
  });
});

describe('🔴 ⑤ ce qui s’affiche', () => {
  it('🔴 au-delà de 5 biens, on en montre 5 et on dit combien restent', () => {
    const gros: PersonneConnue = {
      cle: 'p|1', role: 'proprietaire', nom: 'X', lots: ['1', '2', '3', '4', '5', '6', '7'],
    };
    expect(biensAMontrer(gros)).toEqual({ montres: ['1', '2', '3', '4', '5'], autres: 2 });
    expect(biensAMontrer(CHAKROUN)).toEqual({ montres: ['295'], autres: 0 });
    expect(BIENS_MONTRES).toBe(5);
  });

  it('⚠️ l’extrait se recale sur des espaces, jamais au milieu d’un mot', () => {
    const e = extraitAutour('Veuillez noter que Monsieur DELAUNAY passera demain matin pour le volet', ['delaunay']);
    expect(e.startsWith(' ')).toBe(false);
    expect(e).toContain('DELAUNAY');
    expect(/^\S*$/.test(e)).toBe(false);
  });

  it('⚠️ un texte vide ne reconnaît personne', () => {
    expect(personnesDansLeTexte('', ANNUAIRE)).toEqual([]);
    expect(personnesDansLeTexte('   ', ANNUAIRE)).toEqual([]);
  });

  /** ⚠️ L'ORDRE EST CELUI DE LA FIABILITÉ : adresse, téléphone, nom complet, nom rare. */
  it('⚠️ les correspondances sortent dans l’ordre de fiabilité', () => {
    const r = personnesDansLeTexte('Luc MARTIN et zahrachakroun@gmail.com', ANNUAIRE);
    expect(r.map((c) => c.par)).toEqual(['email', 'nom_complet']);
  });
});

/** 🔒 PAS D'E/S : l'appelant charge l'annuaire, ce module décide. */
describe('🔒 module pur', () => {
  it('🔒 aucun import', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/personnesDansLeTexte.ts', 'utf8')).not.toMatch(/^import /m);
  });
});
