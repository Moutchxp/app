import { describe, it, expect } from 'vitest';
import {
  TITRE_CONTACT_MODIFIER, TITRE_CONTACT_NOUVEAU, coordonneesDeLaCarte, coordonneesPourLaBase,
  couperNomEtPrenom, ficheAEnvoyer, manquesDuContact, premierTelephone,
} from './ficheContact';
import { manquesDeLaFiche } from './annuaireEdition';
import { CIVILITES, civiliteDeLaListe } from './saisieFiche';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-8, POINT 3 — LES RÈGLES D'UNE FICHE DE CONTACT ══════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Le formulaire du “+” doit être le MÊME que celui des clients
 * (“Nouvelle fiche” / “Modifier la fiche”), le MÊME composant, pas une copie […]. Pré-rempli depuis le
 * pré-remplissage : nom et prénom séparés si possible, e-mail, téléphone et adresse trouvés dans la signature.
 * POUR UN CONTACT, SEULS LE NOM ET AU MOINS UN E-MAIL SONT OBLIGATOIRES ; les autres champs sont facultatifs,
 * sans message rouge. LES RÈGLES DES CLIENTS NE CHANGENT PAS. »
 *
 * CE QUE CE FICHIER TIENT : les règles elles-mêmes. Que le formulaire soit bien LE MÊME COMPOSANT est éprouvé là
 * où il vit (`annuaireEdition.test.ts` pour le garde de structure, `CartesPersonnes.contacts.test.tsx` et
 * `HistoriqueDuBien.test.ts` pour les deux écrans qui l'ouvrent).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const email = (valeur: string) => ({ sorte: 'email' as const, valeur, libelle: 'E-mail' });
const tel = (valeur: string) => ({ sorte: 'telephone' as const, valeur, libelle: 'Mobile' });

describe('① ce qu’un contact doit avoir, et rien de plus', () => {
  it('🔴🔴 LE NOM ET UN E-MAIL SUFFISENT — c’est la règle d’Arno, mot pour mot', () => {
    const m = manquesDuContact({ nom: 'ROSKY', coordonnees: [email('f@r.test')] });
    expect(m).toEqual({});
  });

  it('🔴 LE NOM MANQUANT EST DIT, et c’est le cas le plus fréquent du « + »', () => {
    const m = manquesDuContact({ nom: '   ', coordonnees: [email('f@r.test')] });
    expect(m.nom).toBe('Le nom est obligatoire.');
    expect(Object.keys(m)).toEqual(['nom']);
  });

  /**
   * 🔴🔴 POURQUOI L'E-MAIL EST EXIGÉ ALORS QUE LE FORMULAIRE LE PRÉ-REMPLIT TOUJOURS : rien n'empêche de le
   * retirer d'un clic sur « ✕ ». Une carte sans adresse ne sert plus à rien — c'est par l'adresse que
   * l'automatisation reconnaît ses mails. La règle protège le BUT de la carte, pas une case.
   */
  it('🔴🔴 SANS AUCUN E-MAIL, LA CARTE NE SERT PLUS À RIEN — et le motif le dit', () => {
    const m = manquesDuContact({ nom: 'ROSKY', coordonnees: [tel('06 11 22 33 44')] });
    expect(m.email).toContain('au moins une adresse e-mail');
    expect(m.email).toContain('reconnaît ses mails');
  });

  it('⚠️ UNE LIGNE E-MAIL VIDE NE COMPTE PAS : la liste en porte pendant la saisie', () => {
    expect(manquesDuContact({ nom: 'ROSKY', coordonnees: [email('  ')] }).email).toBeDefined();
  });

  /**
   * ══ 🔴🔴 LA DIFFÉRENCE AVEC UN CLIENT, MISE CÔTE À CÔTE ════════════════════════════════════════════════════
   *
   * C'est LE cas de ce fichier : la même saisie, jugée par les deux règles. Un contact passe, un client ne passe
   * pas — et c'est exactement ce qu'Arno demande (« les règles des CLIENTS ne changent pas »). Si quelqu'un
   * fusionnait un jour les deux fonctions, ce cas tomberait.
   */
  it('🔴🔴 LA MÊME SAISIE PASSE POUR UN CONTACT ET ÉCHOUE POUR UN CLIENT', () => {
    const saisie = {
      civilite: '', nom: 'ROSKY', prenom: '', adresse: '', codePostal: '', commune: '',
      coordonnees: [email('f@r.test')],
    };
    expect(manquesDuContact(saisie)).toEqual({});
    const client = manquesDeLaFiche(saisie);
    expect(Object.keys(client).sort()).toEqual(
      ['adresse', 'civilite', 'codePostal', 'commune', 'prenom', 'telephone']);
  });

  it('🔴 NI QUALITÉ, NI ADRESSE, NI NOTE, NI TÉLÉPHONE NE SONT JAMAIS RÉCLAMÉS À UN CONTACT', () => {
    const m = manquesDuContact({ nom: 'ROSKY', coordonnees: [email('f@r.test')] });
    for (const champ of ['qualite', 'adresse', 'codePostal', 'commune', 'note', 'telephone', 'civilite']) {
      expect(m[champ], champ).toBeUndefined();
    }
  });

  it('les deux titres du formulaire sont écrits UNE fois, ici', () => {
    expect(TITRE_CONTACT_NOUVEAU).toBe('Nouveau contact');
    expect(TITRE_CONTACT_MODIFIER).toBe('Modifier ce contact');
  });
});

describe('② les coordonnées : un tableau ordonné, relu sans rien deviner', () => {
  it('🔴 L’ORDRE DU TABLEAU EST L’ORDRE AFFICHÉ — il n’y a rien à trier au retour', () => {
    const lu = coordonneesDeLaCarte([
      { sorte: 'email', valeur: 'b@x.test', libelle: 'E-mail' },
      { sorte: 'telephone', valeur: '01 02 03 04 05', libelle: 'Fixe' },
    ]);
    expect(lu.map((c) => c.valeur)).toEqual(['b@x.test', '01 02 03 04 05']);
  });

  /**
   * 🔴🔴 UNE LIGNE ILLISIBLE EST IGNORÉE, JAMAIS DEVINÉE. La base ne contraint que la FORME (un tableau — `CHECK`
   * de la 306). Deviner la sorte d'une ligne sans sorte aurait rangé un numéro parmi les e-mails, et c'est une
   * carte qui ment ensuite pour toujours.
   */
  it('🔴🔴 CE QUI N’EST PAS LISIBLE EST SAUTÉ : aucune sorte n’est inventée', () => {
    const lu = coordonneesDeLaCarte([
      'texte', 42, null, {}, { sorte: 'fax', valeur: '01' }, { sorte: 'email' },
      { sorte: 'email', valeur: '   ' }, { sorte: 'telephone', valeur: '06 11 22 33 44' },
    ]);
    expect(lu).toEqual([{ sorte: 'telephone', valeur: '06 11 22 33 44', libelle: null }]);
  });

  it('⚠️ CE QUI N’EST PAS UN TABLEAU REND UNE LISTE VIDE — le cas d’une base sans la 306', () => {
    for (const brut of [null, undefined, {}, 'coordonnees', 7]) {
      expect(coordonneesDeLaCarte(brut)).toEqual([]);
    }
  });

  it('🔴 LA LISTE COMPLÈTE PART, SANS LES LIGNES VIDES, DANS SON ORDRE', () => {
    const pour = coordonneesPourLaBase([tel(' 06 11 22 33 44 '), email(''), email('f@r.test')]);
    expect(pour).toEqual([
      { sorte: 'telephone', valeur: '06 11 22 33 44', libelle: 'Mobile' },
      { sorte: 'email', valeur: 'f@r.test', libelle: 'E-mail' },
    ]);
  });

  /**
   * 🔴🔴 LA COLONNE `telephone` EST **DÉRIVÉE**, ET NON UNE SECONDE VÉRITÉ. Elle est lue ailleurs (le report d'un
   * changement de côté, la proposition automatique) : la laisser vide quand la liste porte un numéro aurait fait
   * perdre ce numéro au premier glissement d'un côté à l'autre.
   */
  it('🔴🔴 LE PREMIER TÉLÉPHONE DE LA LISTE ALIMENTE LA COLONNE, et dans l’ordre affiché', () => {
    expect(premierTelephone([email('f@r.test'), tel('01 02 03 04 05'), tel('06 11 22 33 44')]))
      .toBe('01 02 03 04 05');
    expect(premierTelephone([email('f@r.test')])).toBeNull();
    expect(premierTelephone([])).toBeNull();
  });
});

describe('③ la découpe prénom / nom — « si possible », et pas davantage', () => {
  /**
   * MESURÉ sur les 398 noms d'en-tête des adresses à carte du 05/10/2026 : 28 en un seul mot, 185 avec un signal
   * de capitales, 149 à deux mots, 36 gardés en bloc.
   */
  it('🔴🔴 LE SIGNAL DES CAPITALES TRANCHE — le cas le plus fréquent de la base (185 sur 398)', () => {
    expect(couperNomEtPrenom('Jessica TADEU')).toEqual({ nom: 'TADEU', prenom: 'Jessica', civilite: '' });
    expect(couperNomEtPrenom('TADEU Jessica')).toEqual({ nom: 'TADEU', prenom: 'Jessica', civilite: '' });
    expect(couperNomEtPrenom('Karima BOCHET LEMRABET'))
      .toEqual({ nom: 'BOCHET LEMRABET', prenom: 'Karima', civilite: '' });
  });

  it('⚠️ UN MOT EN CAPITALES D’UNE SEULE LETTRE N’EN EST PAS UN : « J. Mercier » n’a pas pour nom « J. »', () => {
    expect(couperNomEtPrenom('J. Mercier')).toEqual({ prenom: 'J.', nom: 'Mercier', civilite: '' });
  });

  it('🔴 DEUX MOTS SANS SIGNAL : « Prénom Nom », l’ordre des en-têtes de courrier', () => {
    expect(couperNomEtPrenom('Fanny Rosky')).toEqual({ prenom: 'Fanny', nom: 'Rosky', civilite: '' });
    expect(couperNomEtPrenom('esteban fardeau')).toEqual({ prenom: 'esteban', nom: 'fardeau', civilite: '' });
  });

  /**
   * 🔴🔴 ON NE COUPE PAS CE QU'ON NE SAIT PAS COUPER, et c'est la moitié de la demande d'Arno. « Puro Flow
   * Paris » n'a pas de prénom : en inventer un (« Puro ») ferait une fiche fausse, recopiée dans tous les
   * courriers, qu'un humain devra défaire.
   */
  it('🔴🔴 TROIS MOTS SANS SIGNAL RESTENT EN BLOC — c’est presque toujours une société', () => {
    expect(couperNomEtPrenom('Puro Flow Paris')).toEqual({ nom: 'Puro Flow Paris', prenom: '', civilite: '' });
    expect(couperNomEtPrenom('Couverture Couvreur Paris'))
      .toEqual({ nom: 'Couverture Couvreur Paris', prenom: '', civilite: '' });
  });

  it('⚠️ UN SEUL MOT, OU RIEN : tout dans le nom, et aucune invention', () => {
    expect(couperNomEtPrenom('MDRC')).toEqual({ nom: 'MDRC', prenom: '', civilite: '' });
    expect(couperNomEtPrenom('')).toEqual({ nom: '', prenom: '', civilite: '' });
    expect(couperNomEtPrenom(null)).toEqual({ nom: '', prenom: '', civilite: '' });
    expect(couperNomEtPrenom('   Syndic   ')).toEqual({ nom: 'Syndic', prenom: '', civilite: '' });
  });

  /**
   * 🔴🔴 UNE CIVILITÉ EN TÊTE EST UNE CIVILITÉ, PAS UN PRÉNOM, ET C'EST LA MESURE QUI L'A IMPOSÉ : « MADAME
   * ROUDAUT », « MADAME BERREBI », « MONSIEUR TROSSELY » et « Mr Ramdani » donnaient prénom = « MADAME » /
   * « MONSIEUR » / « Mr ». Le formulaire a un champ « Civilité » : le mot va là, et le prénom reste vide.
   */
  it('🔴🔴 UNE CIVILITÉ EN TÊTE VA DANS SON CHAMP — mesuré sur quatre noms réels', () => {
    expect(couperNomEtPrenom('MADAME ROUDAUT')).toEqual({ civilite: 'Mme', nom: 'ROUDAUT', prenom: '' });
    expect(couperNomEtPrenom('Mr Ramdani')).toEqual({ civilite: 'M.', nom: 'Ramdani', prenom: '' });
    expect(couperNomEtPrenom('M. et Mme BASUYAUX').civilite).toBe('M. et Mme');
  });

  it('⚠️ UNE CIVILITÉ SEULE RESTE LE NOM : « M. » tout seul n’est pas une fiche vide', () => {
    expect(couperNomEtPrenom('M.')).toEqual({ nom: 'M.', prenom: '', civilite: '' });
  });

  /**
   * 🔴🔴 LA CIVILITÉ RENDUE EST UNE VALEUR DE LA LISTE DES CLIENTS, et ce cas le tient. Sans lui, « MADAME »
   * serait rendu tel quel, le formulaire ne le trouverait pas dans sa liste, et il tomberait dans « Autre » avec
   * son texte en champ libre — c'est-à-dire qu'on aurait rangé une civilité connue dans la case « préciser ».
   */
  it('🔴🔴 LA CIVILITÉ RENDUE EST TOUJOURS DANS LA LISTE DES CLIENTS', () => {
    for (const nom of ['MADAME ROUDAUT', 'MONSIEUR TROSSELY', 'Mr Ramdani', 'Mme BERREBI',
      'Mademoiselle Garel', 'M. et Mme BASUYAUX']) {
      const c = couperNomEtPrenom(nom).civilite;
      expect(CIVILITES, nom).toContain(c);
      expect(civiliteDeLaListe(c).choix, nom).toBe(c);
    }
  });

  /**
   * ⚠️ CE QUE LA MESURE DIT AUSSI, ET QU'ON N'ESSAIE PAS DE CORRIGER. Ces trois cas sont FAUX, et ils sont
   * écrits ici exprès : ils disent la limite de l'heuristique, pour que personne ne croie qu'elle n'en a pas.
   * Le pré-remplissage s'affiche dans un formulaire qu'un humain valide champ par champ.
   */
  it('⚠️ LA LIMITE, ÉCRITE NOIR SUR BLANC : trois découpes fausses que la mesure a trouvées', () => {
    /* une société à deux mots : le second mot n'est pas un nom de famille */
    expect(couperNomEtPrenom('ARX FRANCE')).toEqual({ prenom: 'ARX', nom: 'FRANCE', civilite: '' });
    /* l'ordre « Nom Prénom » sans capitales : les deux champs sont inversés */
    expect(couperNomEtPrenom('Aguado Christelle')).toEqual({ prenom: 'Aguado', nom: 'Christelle', civilite: '' });
    /* un mot de société avant un nom en capitales : il part dans le prénom */
    expect(couperNomEtPrenom('Cabinet MC Immo')).toEqual({ nom: 'MC', prenom: 'Cabinet Immo', civilite: '' });
  });
});

describe('④ ce qui part au serveur, écrit une seule fois', () => {
  /**
   * 🔴🔴 LES DEUX ÉCRANS QUI ENREGISTRENT UN CONTACT — le « + » du bloc du bas et le crayon d'une carte du haut —
   * reçoivent le MÊME objet du formulaire. Une seule traduction : deux jumelles auraient divergé au premier champ
   * ajouté, l'une l'envoyant et l'autre l'oubliant.
   */
  it('🔴🔴 UN CHAMP BLANC DEVIENT `null`, JAMAIS UNE CHAÎNE VIDE', () => {
    const corps = ficheAEnvoyer({
      nom: 'ROSKY', civilite: '', prenom: '   ', qualite: '', adresse: '', codePostal: '', commune: '',
      note: '', coordonnees: [email('f@r.test')],
    });
    expect(corps).toEqual({
      nom: 'ROSKY', civilite: null, prenom: null, qualite: null,
      adressePostale: null, codePostal: null, commune: null, note: null,
      coordonnees: [{ sorte: 'email', valeur: 'f@r.test', libelle: 'E-mail' }],
    });
  });

  /**
   * 🔴🔴 `adresse` DEVIENT `adressePostale`, ET C'EST LE SEUL ENDROIT OÙ LE MOT CHANGE. Le formulaire appelle
   * « adresse » son champ postal (il ne connaît que des clients) ; une carte de contact appelle « adresse » son
   * adresse e-mail, qui est son IDENTITÉ. Les confondre créerait une carte dont l'identité est une rue.
   */
  it('🔴🔴 LE CHAMP POSTAL S’APPELLE `adressePostale` EN SORTANT, jamais `adresse`', () => {
    const corps = ficheAEnvoyer({ nom: 'MDRC', adresse: '11 boulevard Richard Wallace', commune: 'Puteaux' });
    expect(corps.adressePostale).toBe('11 boulevard Richard Wallace');
    expect(corps.commune).toBe('Puteaux');
    expect(Object.keys(corps)).not.toContain('adresse');
  });

  it('⚠️ LA NOTE GARDE SES RETOURS À LA LIGNE : c’est une note, pas un titre', () => {
    expect(ficheAEnvoyer({ nom: 'X', note: 'ne pas appeler\navant 10 h' }).note)
      .toBe('ne pas appeler\navant 10 h');
  });
});

/**
 * 🔴 LE MODULE NE SAIT NI LIRE NI ÉCRIRE, et c'est sa garantie : il est importé par des composants `'use client'`
 * ET par le dépôt. Un seul import qui tirerait `pg` ferait tomber TOUTE l'application, écran de connexion
 * compris — incident du 24/09/2026. Le garde de graphe l'attrape aussi ; celui-ci le dit là où on le lit.
 */
describe('⑤ le module reste pur', () => {
  it('🔒 aucune I/O, aucun React', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/ficheContact.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const mot of ['fetch(', 'SELECT ', 'from \'react\'', 'from \'../db/', 'server-only', 'node:fs']) {
      expect(src, mot).not.toContain(mot);
    }
  });
});
