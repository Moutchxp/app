import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  adresseDepuisBan, CIVILITES, CIVILITE_AUTRE, civiliteDeLaListe, civiliteRetenue, codePostalComplet,
  codePostalFormate, communeEnSaisie, communeFormatee, dateCourte, ficheFormatee, ficheImportee,
  mentionCreation, MOT_ADRESSE_NON_VERIFIEE, nomAfficheFormate, nomEnSaisie, nomFormate, prenomEnSaisie,
  prenomFormate,
} from './saisieFiche';
import { civiliteDesigneSociete } from './annuaireEdition';

/**
 * ══ 🔴🔴 LOT FICHE-SAISIE-UNIFORME — LE FORMAT DES CHAMPS ════════════════════════════════════════════════════
 *
 * ARNO (01/10/2026) : « NOM tout en MAJUSCULES, accents conservés (“JULLIEN-GARRIDO”, “D'ERSU”). PRÉNOM première
 * lettre de chaque partie en majuscule, y compris les prénoms composés et les apostrophes (“Jean-François”,
 * “Marie-France”). VILLE tout en MAJUSCULES. CODE POSTAL 5 chiffres. »
 */
describe('🔴 le NOM : majuscules, accents conservés', () => {
  it('🔴 les deux exemples d’Arno, mot pour mot', () => {
    expect(nomFormate('jullien-garrido')).toBe('JULLIEN-GARRIDO');
    expect(nomFormate("d'ersu")).toBe("D'ERSU");
  });

  /**
   * 🔴🔴 LES ACCENTS SURVIVENT. Les retirer donnerait « BEZIERS » pour « BÉZIERS » — et c'est le nom d'une
   * personne, ou d'une ville, qu'on aurait silencieusement changé.
   */
  it('🔴🔴 « é » devient « É », jamais « E »', () => {
    expect(nomFormate('béziers')).toBe('BÉZIERS');
    expect(nomFormate('Noël')).toBe('NOËL');
    expect(nomFormate('françois')).toBe('FRANÇOIS');
  });

  it('⚠️ les espaces collés au copier-coller sont réduits, les tirets jamais', () => {
    expect(nomFormate('  le   goff ')).toBe('LE GOFF');
    expect(nomFormate('jullien - garrido')).toBe('JULLIEN - GARRIDO');
  });

  it('un nom absent ne devient pas « null »', () => {
    expect(nomFormate(null)).toBe('');
    expect(nomFormate(undefined)).toBe('');
  });

  /**
   * ══ 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN, PAS EN TEST — proprietaire-146, 01/10/2026 ═══════════════════════════
   *
   * En tapant « _test jullien-garrido », le champ affichait « _TESTJULLIEN-GARRIDO » : L'ESPACE ÉTAIT
   * IMPOSSIBLE À TAPER. La fonction était juste ; c'est le MOMENT de son application qui ne l'était pas —
   * `trim()` supprimait l'espace final à l'instant même où on venait de l'appuyer.
   *
   * 🔴 PENDANT LA FRAPPE, ON NE TOUCHE QU'À LA CASSE. Le ménage des espaces attend l'enregistrement, quand la
   * personne a fini d'écrire.
   */
  it('🔴🔴 pendant la frappe, l’espace final SURVIT', () => {
    expect(nomEnSaisie('_test ')).toBe('_TEST ');
    expect(nomEnSaisie('_test jullien-garrido')).toBe('_TEST JULLIEN-GARRIDO');
    expect(prenomEnSaisie('marie ')).toBe('Marie ');
    expect(prenomEnSaisie('marie f')).toBe('Marie F');
    expect(communeEnSaisie('saint ')).toBe('SAINT ');
  });

  /** ⚠️ ET LE MÉNAGE SE FAIT QUAND MÊME, à l'enregistrement : c'est `ficheFormatee` qui le fait. */
  it('⚠️ à l’enregistrement, les espaces en trop disparaissent', () => {
    expect(nomFormate('_test  jullien-garrido ')).toBe('_TEST JULLIEN-GARRIDO');
    expect(prenomFormate(' marie  france ')).toBe('Marie France');
  });
});

describe('🔴 le PRÉNOM : chaque partie capitalisée', () => {
  /** 🔴 LES DEUX EXEMPLES D'ARNO. Une règle qui ne couperait qu'aux espaces rendrait « Jean-françois ». */
  it('🔴 les prénoms COMPOSÉS, au trait d’union', () => {
    expect(prenomFormate('jean-françois')).toBe('Jean-François');
    expect(prenomFormate('marie-france')).toBe('Marie-France');
  });

  /** 🔴 ET LES APOSTROPHES — Arno les nomme explicitement, droite comme typographique. */
  it('🔴 les apostrophes aussi', () => {
    expect(prenomFormate("d'artagnan")).toBe("D'Artagnan");
    expect(prenomFormate('d’artagnan')).toBe('D’Artagnan');
  });

  /**
   * 🔴🔴 ON MINUSCULE D'ABORD, PUIS ON RELÈVE. Sans cela, un prénom tapé en verrouillage majuscule resterait
   * tel quel : la règle doit CORRIGER la saisie, pas seulement la compléter.
   */
  it('🔴🔴 « JEAN-FRANÇOIS » est corrigé, pas laissé tel quel', () => {
    expect(prenomFormate('JEAN-FRANÇOIS')).toBe('Jean-François');
    expect(prenomFormate('MARIE FRANCE')).toBe('Marie France');
  });

  it('les accents tiennent, en majuscule comme en minuscule', () => {
    expect(prenomFormate('joSÉ')).toBe('José');
    expect(prenomFormate('éléonore')).toBe('Éléonore');
  });

  /** ⚠️ VIDE AUTORISÉ : une société n'a pas de prénom, et c'est la règle actuelle. */
  it('⚠️ le vide reste le vide — une société n’a pas de prénom', () => {
    expect(prenomFormate('')).toBe('');
    expect(prenomFormate(null)).toBe('');
    expect(civiliteDesigneSociete('SCI')).toBe(true);
  });
});

describe('🔴 la VILLE et le CODE POSTAL', () => {
  it('🔴 la commune est en majuscules, accents conservés', () => {
    expect(communeFormatee('puteaux')).toBe('PUTEAUX');
    expect(communeFormatee('saint-étienne')).toBe('SAINT-ÉTIENNE');
  });

  /** ⚠️ ON NETTOIE, ON NE REFUSE PAS : refuser la frappe empêcherait de taper le deuxième chiffre. */
  it('⚠️ cinq chiffres, et ce qui n’en est pas disparaît', () => {
    expect(codePostalFormate('92 800')).toBe('92800');
    expect(codePostalFormate('92800 Puteaux')).toBe('92800');
    expect(codePostalFormate('928001234')).toBe('92800');
    expect(codePostalFormate('9')).toBe('9');
  });

  it('un code postal complet se reconnaît', () => {
    expect(codePostalComplet('92800')).toBe(true);
    expect(codePostalComplet('928')).toBe(false);
    expect(codePostalComplet('')).toBe(false);
  });
});

/**
 * ══ 🔴🔴 LA CIVILITÉ : UNE LISTE, PLUS « AUTRE » ════════════════════════════════════════════════════════════
 *
 * Arno : « liste au lieu du texte libre : M., Mme, M. et Mme, SCI, SARL, SAS, SNC, Société, Indivision, Autre.
 * Pour “Autre”, un petit champ libre. »
 */
describe('🔴🔴 la civilité est une LISTE', () => {
  it('🔴 les dix entrées d’Arno, dans son ordre', () => {
    expect(CIVILITES).toEqual([
      'M.', 'Mme', 'M. et Mme', 'SCI', 'SARL', 'SAS', 'SNC', 'Société', 'Indivision', 'Autre',
    ]);
  });

  /**
   * 🔴🔴 LA LISTE FERME UN TROU RÉEL : la civilité pilote `civiliteDesigneSociete`, qui décide si le prénom est
   * exigé. En texte libre, une faute de frappe faisait exiger un prénom d'une SCI.
   */
  it('🔴🔴 chaque forme de société de la liste est bien reconnue comme telle', () => {
    for (const c of ['SCI', 'SARL', 'SAS', 'SNC', 'Société', 'Indivision']) {
      expect(civiliteDesigneSociete(c), c).toBe(true);
    }
    for (const c of ['M.', 'Mme', 'M. et Mme']) expect(civiliteDesigneSociete(c), c).toBe(false);
  });

  it('🔴 « Autre » ouvre un champ libre, et c’est LUI qui part en base', () => {
    expect(civiliteRetenue(CIVILITE_AUTRE, 'Succession Dupont')).toBe('Succession Dupont');
    expect(civiliteRetenue('Mme', '')).toBe('Mme');
  });

  /** ⚠️ « Autre » NE PART JAMAIS TEL QUEL : il ne désigne personne. Vide ⇒ la civilité manque, et c'est vrai. */
  it('⚠️ « Autre » sans précision ne vaut rien', () => {
    expect(civiliteRetenue(CIVILITE_AUTRE, '   ')).toBe('');
  });

  /**
   * 🔴🔴 UNE FICHE IMPORTÉE RETROUVE SA PLACE SANS ÊTRE RÉÉCRITE. Perdre la civilité d'une fiche WIPPIMMO parce
   * qu'elle était écrite « MME » serait une régression silencieuse — elle ne se verrait qu'à l'enregistrement.
   */
  it('🔴🔴 « MME », « S.C.I. », « mme » retombent sur la bonne entrée', () => {
    expect(civiliteDeLaListe('MME')).toEqual({ choix: 'Mme', libre: '' });
    expect(civiliteDeLaListe('S.C.I.')).toEqual({ choix: 'SCI', libre: '' });
    expect(civiliteDeLaListe('m.')).toEqual({ choix: 'M.', libre: '' });
    expect(civiliteDeLaListe('societe')).toEqual({ choix: 'Société', libre: '' });
  });

  it('🔴 ce qu’on ne reconnaît pas tombe dans « Autre », SANS perdre le texte', () => {
    expect(civiliteDeLaListe('Succession Dupont')).toEqual({ choix: 'Autre', libre: 'Succession Dupont' });
  });

  it('une civilité absente laisse la liste sur « Choisir… »', () => {
    expect(civiliteDeLaListe(null)).toEqual({ choix: '', libre: '' });
  });
});

/**
 * ══ 🔴🔴 L'AUTO-COMPLÉTION D'ADRESSE — CE QU'ELLE REMPLIT ═══════════════════════════════════════════════════
 *
 * Arno : « Un choix remplit Adresse (numéro + voie), Code postal et Commune (en majuscules). »
 */
describe('🔴🔴 une proposition de la Base Adresse Nationale remplit TROIS champs', () => {
  const BAN = { label: '1 Rue de l’Essai 92800 Puteaux', name: '1 Rue de l’Essai', postcode: '92800', city: 'Puteaux' };

  it('🔴 les trois champs, et la commune EN MAJUSCULES', () => {
    expect(adresseDepuisBan(BAN)).toEqual({
      etiquette: '1 Rue de l’Essai 92800 Puteaux',
      voie: '1 Rue de l’Essai',
      codePostal: '92800',
      commune: 'PUTEAUX',
    });
  });

  /**
   * 🔴🔴 `name` ET NON `label`. Recopier le libellé complet dans le champ Adresse y remettrait le code postal et
   * la commune, qui ont leurs propres champs juste en dessous — on les lirait deux fois sur chaque fiche.
   */
  it('🔴🔴 le champ Adresse ne reçoit QUE le numéro et la voie', () => {
    const a = adresseDepuisBan(BAN);
    expect(a?.voie).not.toContain('92800');
    expect(a?.voie).not.toContain('Puteaux');
  });

  /** ⚠️ Une commune seule, un lieu-dit : pas de `name`. On retombe sur le libellé plutôt que de ne rien remplir. */
  it('⚠️ une proposition sans « name » remplit quand même quelque chose', () => {
    const a = adresseDepuisBan({ label: 'Puteaux 92800', postcode: '92800', city: 'Puteaux' });
    expect(a?.commune).toBe('PUTEAUX');
    expect(a?.codePostal).toBe('92800');
    expect(a?.voie).not.toBe('');
  });

  it('une réponse vide n’entre pas dans la liste', () => {
    expect(adresseDepuisBan({})).toBeNull();
  });
});

/**
 * ══ 🔴 « SAISIE LIBRE TOUJOURS POSSIBLE » ═══════════════════════════════════════════════════════════════════
 *
 * Arno : « adresse étrangère, lieu-dit, BAN indisponible. Dans ce cas, pas de blocage : un petit “adresse non
 * vérifiée” discret. »
 */
describe('🔴 la saisie libre n’est jamais bloquée', () => {
  const champ = readFileSync('app/(admin)/admin/(protected)/gestion/ChampAdresseBan.tsx', 'utf8');

  it('🔴 le champ est un simple `input` : rien n’y est refusé', () => {
    expect(champ).toContain('onChange={(e) => taper(e.target.value)}');
    expect(champ).not.toContain('readOnly');
    expect(champ).not.toContain('disabled');
  });

  /** 🔴 LA MENTION INFORME, ELLE N'INTERDIT PAS — et elle ne clignote pas à chaque lettre. */
  it('🔴 la mention « adresse non vérifiée » ne paraît que hors recherche', () => {
    expect(MOT_ADRESSE_NON_VERIFIEE).toBe('adresse non vérifiée');
    expect(champ).toContain('{!verifiee && !ouvert && !cherche && valeur.trim() !== \'\' && (');
  });

  /** 🔴 LA BAN MUETTE VIDE LA LISTE, SANS UN MOT : ce n'est pas une panne de la fiche. */
  it('🔴 une BAN indisponible ne dit rien et ne bloque rien', () => {
    expect(champ).toContain('setPropositions([]);');
    expect(champ).toContain('BAN indisponible');
  });

  /** Arno : « délai court, 5 à 7 résultats, flèches ↑↓ + Entrée, clic ». */
  it('🔴 5 à 7 résultats, flèches, Entrée, et le clic', () => {
    expect(champ).toMatch(/const RESULTATS = [567];/);
    expect(champ).toContain("e.key === 'ArrowDown'");
    expect(champ).toContain("e.key === 'ArrowUp'");
    expect(champ).toContain("e.key === 'Enter'");
    expect(champ).toContain('onMouseDown');
  });

  /** 🔴 MÊME FOURNISSEUR QU'AILLEURS DANS L'APP — « Pas de nouveau fournisseur » (Arno). */
  it('🔴 c’est la Base Adresse Nationale, et elle seule', () => {
    expect(champ).toContain('api-adresse.data.gouv.fr/search/');
    const autres = champ.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [];
    expect([...new Set(autres)]).toEqual(['https://api-adresse.data.gouv.fr']);
  });
});

/**
 * ══ 🔴🔴 « CRÉÉE LE », ET LA MENTION « IMPORTÉE » ═══════════════════════════════════════════════════════════
 *
 * Arno : « rempli automatiquement à la création et non modifiable. Pour les fiches importées : la date de
 * l'import, avec la mention “importée”. »
 */
describe('🔴🔴 la date de naissance de la fiche', () => {
  it('🔴 une fiche créée dans l’app : « Créée le JJ/MM/AAAA »', () => {
    expect(mentionCreation({
      creeLe: '2026-10-01T09:30:00Z', importeLe: '2026-09-28T00:00:00Z', wippimmoId: 'app-1790-x7',
    })).toBe('Créée le 01/10/2026');
  });

  it('🔴 une fiche importée : la date de l’IMPORT, et le mot « Importée »', () => {
    expect(mentionCreation({
      creeLe: '2026-10-01T09:30:00Z', importeLe: '2026-09-28T00:00:00Z', wippimmoId: '146',
    })).toBe('Importée le 28/09/2026');
  });

  /**
   * 🔴🔴 ON NE DEVINE PAS PAR LES DATES. À l'import, `cree_le` et `importe_le` valent tous deux « maintenant » :
   * les comparer ne dirait rien. C'est la CLÉ qui tranche — et elle existait déjà, sans qu'on l'ait nommée.
   */
  it('🔴🔴 c’est la CLÉ qui dit l’origine, jamais les dates', () => {
    expect(ficheImportee('app-1790802-abc')).toBe(false);
    expect(ficheImportee('146')).toBe(true);
    expect(ficheImportee('')).toBe(true);
    const memeDate = { creeLe: '2026-09-28T00:00:00Z', importeLe: '2026-09-28T00:00:00Z' };
    expect(mentionCreation({ ...memeDate, wippimmoId: 'app-1' })).toContain('Créée');
    expect(mentionCreation({ ...memeDate, wippimmoId: '1' })).toContain('Importée');
  });

  /** ⚠️ RIEN N'EST INVENTÉ : une date fausse sur une fiche est pire qu'une date absente. */
  it('⚠️ sans date lisible, aucune mention', () => {
    expect(mentionCreation({ creeLe: null, importeLe: null, wippimmoId: 'app-1' })).toBe('');
    expect(dateCourte('pas une date')).toBe('');
    expect(dateCourte(null)).toBe('');
  });

  it('la date se lit à l’endroit : 01/10/2026', () => {
    expect(dateCourte('2026-10-01T23:59:00+02:00')).toBe('01/10/2026');
  });
});

describe('🔴 la fiche entière, mise en forme d’un seul geste', () => {
  it('🔴 les quatre champs formatés, l’adresse intacte', () => {
    expect(ficheFormatee({
      civilite: 'Mme', nom: 'jullien-garrido', prenom: 'MARIE-france',
      adresse: '12 bis rue de l’Église', codePostal: '92 800', commune: 'puteaux',
    })).toEqual({
      civilite: 'Mme', nom: 'JULLIEN-GARRIDO', prenom: 'Marie-France',
      adresse: '12 bis rue de l’Église', codePostal: '92800', commune: 'PUTEAUX',
    });
  });

  /**
   * ⚠️ L'ADRESSE N'EST PAS TOUCHÉE, et c'est délibéré : « 12 bis rue de l'Église » ne se met pas en majuscules
   * sans devenir illisible, ni en capitales initiales sans casser « bis ».
   */
  it('⚠️ l’adresse reste telle qu’elle est tapée', () => {
    const f = { civilite: '', nom: '', prenom: '', adresse: '12 bis rue de l’Église', codePostal: '', commune: '' };
    expect(ficheFormatee(f).adresse).toBe('12 bis rue de l’Église');
  });

  /**
   * 🔴 LE NOM AFFICHÉ D'UNE CARTE se recompose depuis les COLONNES, jamais en découpant `nom_complet` : « JULLIEN
   * - GARRIDO Cédric » a trois mots avant le prénom, et deviner où finit le nom se tromperait.
   */
  it('🔴 le nom affiché d’une carte se met en forme à la lecture', () => {
    expect(nomAfficheFormate({ nom: 'jullien - garrido', prenom: 'cédric', nomAffiche: 'Jullien - Garrido Cédric' }))
      .toBe('JULLIEN - GARRIDO Cédric');
    // Une société n'a pas de prénom : le nom seul, sans espace en trop.
    expect(nomAfficheFormate({ nom: 'sci du moulin', prenom: null, nomAffiche: 'SCI du Moulin' }))
      .toBe('SCI DU MOULIN');
  });

  /** ⚠️ SANS COLONNE `nom`, on rend le nom affiché tel quel plutôt que rien. */
  it('⚠️ à défaut de colonnes, le nom affiché passe tel quel', () => {
    expect(nomAfficheFormate({ nomAffiche: 'M. ROI Nathan' })).toBe('M. ROI Nathan');
  });
});

/**
 * ══ 🔴🔴 « PAS DE RÉÉCRITURE MASSIVE » ══════════════════════════════════════════════════════════════════════
 *
 * Arno : « Écriture en base seulement quand la fiche est enregistrée. » Ce module ne sait pas écrire : il n'a
 * aucune dépendance. C'est ce qui rend la promesse vérifiable d'un coup d'œil.
 */
describe('🔒 le module est PUR — il ne peut rien écrire', () => {
  it('🔒 aucun import : ni base, ni sonde, ni réseau', () => {
    const src = readFileSync('app/lib/gestion/saisieFiche.ts', 'utf8');
    expect(src).not.toMatch(/^import /m);
  });

  /** 🔴 ET L'ÉCRAN APPLIQUE LE MÊME FORMAT AUX TROIS MOMENTS : frappe, enregistrement, affichage. */
  it('🔴 l’écran des cartes formate à la frappe, à l’enregistrement ET à l’affichage', () => {
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(ecran).toContain('onChange={(e) => setNom(nomEnSaisie(e.target.value))}');
    expect(ecran).toContain('onChange={(e) => setPrenom(prenomEnSaisie(e.target.value))}');
    expect(ecran).toContain('...ficheFormatee({ civilite, nom, prenom, adresse, codePostal, commune })');
    expect(ecran).toContain('nomAfficheFormate(p)');
    expect(ecran).toContain('mentionCreation(');
  });

  /** 🔴 ET LE CHAMP DATE A DISPARU DU FORMULAIRE — « La mention “Date obligatoire” disparaît » (Arno). */
  it('🔴 plus aucun champ date dans le formulaire', () => {
    const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/CartesPersonnes.tsx', 'utf8');
    expect(ecran).not.toContain('type="date"');
    expect(ecran).not.toContain('motDate');
  });
});
