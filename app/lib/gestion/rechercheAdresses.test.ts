/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 CHERCHER UN MAIL PAR UNE ADRESSE — LOT RECHERCHE-MAILS-PAR-ADRESSE (08/10/2026) ════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « Pouvoir taper une adresse e-mail (ou un morceau : “gohudif”, “@gmail.com”, “manomano”) et
 * retrouver tous les mails affichés où cette adresse apparaît. […] expéditeur (From), destinataires (To), copie
 * (Cc), copie cachée (Bcc) si connue, Répondre-à (Reply-To) ; et les adresses écrites dans le corps.
 * Correspondance partielle, sans tenir compte des majuscules/accents. »
 *
 * 🔴 LES TROIS MORCEAUX QU'IL DONNE EN EXEMPLE SONT ÉPROUVÉS TELS QUELS : « gohudif » (un bout de nom),
 * « @gmail.com » (un domaine entier, arobase comprise), « manomano » (une enseigne). Ce sont trois formes
 * différentes de correspondance partielle, et c'est pour ces trois-là que l'outil est fait.
 *
 * 🔒 Aucune base, aucun réseau. Les adresses employées ici sont fictives (`.test`), sauf les domaines publics
 * cités par Arno lui-même.
 */
import { describe, expect, it } from 'vitest';
import {
  ADRESSES_TEXTE_MAX, adressesDuMail, adressesDuTexte, adressesTrouvees, MOT_ROLE_RECHERCHE,
  type MailAChercher,
} from './rechercheAdresses';
import { motsRecherches, normaliserRecherche } from './historiqueBien';

/** Le mail d'essai : une adresse dans CHACUNE des six familles, pour qu'aucune ne puisse être oubliée. */
const MAIL: MailAChercher = {
  de: 'Agence@Criterimmo.test',
  a: [{ adresse: 'locataire@fictif.test' }],
  cc: [{ adresse: 'gohudif.marie@gmail.com' }],
  cci: [{ adresse: 'compta@fictif.test' }],
  repondreA: [{ adresse: 'ne-pas-repondre@fictif.test' }],
  adressesTexte: ['service.client@manomano.test'],
};

describe('🔴🔴 ① les adresses écrites dans un corps de mail', () => {
  /**
   * 🔴🔴 LE CAS D'ARNO, MOT POUR MOT : « historique cité “De : … <x@y.fr>”, messages transférés ». C'est la
   * famille qu'aucune recherche n'atteignait : l'écran ne reçoit que 240 caractères de corps, et une adresse
   * citée vit toujours plus bas.
   */
  it('🔴🔴 une adresse citée dans un historique repris est relevée', () => {
    const corps = [
      'Bonjour, je vous transfère ci-dessous.',
      '---------- Message transféré ----------',
      'De : Marie GOHUDIF <gohudif.marie@gmail.com>',
      'À : Service client <service.client@manomano.test>',
      'Objet : Commande',
    ].join('\n');
    expect(adressesDuTexte(corps)).toEqual(['gohudif.marie@gmail.com', 'service.client@manomano.test']);
  });

  /** ⚠️ EN MINUSCULES ET DÉDOUBLONNÉES : la même adresse citée six fois dans un fil ne compte qu'une. */
  it('⚠️ les adresses sont mises en minuscules et dédoublonnées', () => {
    expect(adressesDuTexte('A@B.test puis a@b.TEST puis A@b.Test')).toEqual(['a@b.test']);
  });

  /**
   * 🔴🔴 LES FAUX POSITIFS DU HTML SONT ÉCARTÉS. `logo@2x.png` est un nom de fichier d'image à haute densité :
   * il a une arobase, un point et des lettres, donc l'expression l'attraperait. Mesuré sur les corps réels,
   * c'est la seule famille de fausses adresses qui revient — et elle reviendrait sur CHAQUE mail en HTML.
   */
  it('🔴🔴 un nom de fichier d’image n’est pas une adresse', () => {
    const html = '<img src="https://x.test/logo@2x.png"><a href="mailto:vrai@fictif.test">écrire</a>';
    expect(adressesDuTexte(html)).toEqual(['vrai@fictif.test']);
  });

  /** ⚠️ LE HTML EST LU COMME DU TEXTE, et cela suffit : l'adresse d'un `mailto:` y est en clair. */
  it('⚠️ une adresse de lien mailto est trouvée sans analyser le HTML', () => {
    expect(adressesDuTexte('<a href="mailto:syndic@fictif.test">Syndic</a>')).toEqual(['syndic@fictif.test']);
  });

  /** ⚠️ RIEN À CHERCHER ⇒ RIEN, et jamais d'erreur : la colonne peut être vide ou absente. */
  it('⚠️ un corps vide, nul ou sans adresse ne rend rien', () => {
    expect(adressesDuTexte(null)).toEqual([]);
    expect(adressesDuTexte(undefined)).toEqual([]);
    expect(adressesDuTexte('')).toEqual([]);
    expect(adressesDuTexte('aucune adresse ici, juste du texte @ et des points.')).toEqual([]);
  });

  /** ⚠️ BORNÉ : un fil de vingt réponses en porte facilement trente ; au-delà de 50 on s'arrête. */
  it('⚠️ le relevé est borné', () => {
    const corps = Array.from({ length: 80 }, (_, i) => `p${i}@fictif.test`).join(' ');
    expect(adressesDuTexte(corps)).toHaveLength(ADRESSES_TEXTE_MAX);
  });
});

describe('🔴🔴 ② les six familles d’adresses d’un mail', () => {
  /** 🔴 LES CINQ EN-TÊTES D'ARNO, PLUS LE CORPS — et chacun porte son rôle. */
  it('🔴🔴 chaque famille est relevée sous son rôle', () => {
    expect(adressesDuMail(MAIL)).toEqual([
      { adresse: 'agence@criterimmo.test', role: 'expediteur' },
      { adresse: 'locataire@fictif.test', role: 'destinataire' },
      { adresse: 'gohudif.marie@gmail.com', role: 'copie' },
      { adresse: 'compta@fictif.test', role: 'copie_cachee' },
      { adresse: 'ne-pas-repondre@fictif.test', role: 'repondre_a' },
      { adresse: 'service.client@manomano.test', role: 'texte' },
    ]);
  });

  /**
   * 🔴🔴 LE RÔLE LE PLUS ENGAGEANT L'EMPORTE. Un mail qui reprend son propre fil porte l'adresse de son
   * expéditeur DEUX fois : en en-tête, et dans la citation. Afficher « dans le texte » serait vrai et
   * trompeur — on conclurait que la personne est seulement citée, alors qu'elle écrit.
   */
  it('🔴🔴 une adresse à la fois expéditeur et citée reste « expéditeur »', () => {
    const m: MailAChercher = { de: 'qui@fictif.test', adressesTexte: ['qui@fictif.test'] };
    expect(adressesDuMail(m)).toEqual([{ adresse: 'qui@fictif.test', role: 'expediteur' }]);
  });

  /** ⚠️ L'ORDRE VA DU PLUS ENGAGEANT AU PLUS INCIDENT, jamais alphabétique. */
  it('⚠️ l’ordre d’affichage suit le rôle, pas l’alphabet', () => {
    const m: MailAChercher = { de: 'zoe@fictif.test', adressesTexte: ['alain@fictif.test'] };
    expect(adressesDuMail(m).map((x) => x.adresse)).toEqual(['zoe@fictif.test', 'alain@fictif.test']);
  });

  /** ⚠️ UN MAIL SANS RIEN D'AUTRE QUE SON EXPÉDITEUR ne rend que lui : aucune famille n'est obligatoire. */
  it('⚠️ les familles absentes ne gênent pas', () => {
    expect(adressesDuMail({ de: 'seul@fictif.test' })).toEqual([
      { adresse: 'seul@fictif.test', role: 'expediteur' },
    ]);
  });
});

describe('🔴🔴 ③ les trois morceaux qu’Arno donne en exemple', () => {
  const chercher = (texte: string) => adressesTrouvees(MAIL, motsRecherches(texte), normaliserRecherche);

  /** 🔴 « gohudif » — un bout de nom, dans une adresse qui n'est QU'EN COPIE. C'est le cas qui motive le lot. */
  it('🔴🔴 « gohudif » retrouve l’adresse en copie, et le dit', () => {
    expect(chercher('gohudif')).toEqual([
      { adresse: 'gohudif.marie@gmail.com', role: 'copie', mot: 'en copie' },
    ]);
  });

  /** 🔴 « @gmail.com » — un domaine entier, arobase comprise : la correspondance est partielle, pas par mot. */
  it('🔴🔴 « @gmail.com » retrouve le mail par son domaine', () => {
    expect(chercher('@gmail.com').map((x) => x.adresse)).toEqual(['gohudif.marie@gmail.com']);
  });

  /** 🔴 « manomano » — une enseigne, citée seulement DANS LE CORPS. */
  it('🔴🔴 « manomano » retrouve une adresse écrite dans le texte', () => {
    expect(chercher('manomano')).toEqual([
      { adresse: 'service.client@manomano.test', role: 'texte', mot: 'dans le texte' },
    ]);
  });

  /**
   * 🔴 LA CASSE ET LES ACCENTS SONT IGNORÉS (Arno). L'expéditeur est écrit « Agence@Criterimmo.test » dans
   * l'en-tête ; on le cherche en minuscules, et « frédéric » doit répondre à « frederic ».
   */
  it('🔴🔴 ni la casse ni les accents n’empêchent de trouver', () => {
    expect(chercher('CRITERIMMO').map((x) => x.adresse)).toEqual(['agence@criterimmo.test']);
    const m: MailAChercher = { de: 'frederic@fictif.test' };
    expect(adressesTrouvees(m, motsRecherches('Frédéric'), normaliserRecherche).map((x) => x.adresse))
      .toEqual(['frederic@fictif.test']);
  });

  /**
   * 🔴🔴 UN SEUL MOT SUFFIT À RETENIR UNE ADRESSE, et c'est volontairement plus large que la recherche
   * elle-même (« tous les mots présents »). Les deux questions diffèrent : la recherche décide si le MAIL
   * reste affiché ; ceci décide quelles ADRESSES l'expliquent. Exiger les deux mots dans la même adresse
   * n'expliquerait plus rien dès qu'on tape « gohudif facture ».
   */
  it('🔴🔴 « gohudif facture » explique encore par l’adresse', () => {
    expect(chercher('gohudif facture').map((x) => x.adresse)).toEqual(['gohudif.marie@gmail.com']);
  });

  /** ⚠️ SANS RECHERCHE, AUCUNE EXPLICATION : la ligne est alors exactement celle d'avant le lot. */
  it('⚠️ sans mot cherché, rien n’est expliqué', () => {
    expect(adressesTrouvees(MAIL, [], normaliserRecherche)).toEqual([]);
    expect(adressesTrouvees(MAIL, motsRecherches('   '), normaliserRecherche)).toEqual([]);
  });

  /** ⚠️ UN MOT QUI NE TOUCHE AUCUNE ADRESSE n'explique rien — le mail peut rester affiché par son objet. */
  it('⚠️ un mot trouvé ailleurs que dans une adresse n’invente pas d’explication', () => {
    expect(chercher('chaudiere')).toEqual([]);
  });

  /** 🔴 LES SIX ÉTIQUETTES SONT ÉCRITES UNE SEULE FOIS, et ce sont les mots d'Arno. */
  it('🔴 les étiquettes de rôle sont celles d’Arno', () => {
    expect(MOT_ROLE_RECHERCHE.expediteur).toBe('expéditeur');
    expect(MOT_ROLE_RECHERCHE.destinataire).toBe('destinataire');
    expect(MOT_ROLE_RECHERCHE.copie).toBe('en copie');
    expect(MOT_ROLE_RECHERCHE.texte).toBe('dans le texte');
    expect(MOT_ROLE_RECHERCHE.copie_cachee).toBe('en copie cachée');
    expect(MOT_ROLE_RECHERCHE.repondre_a).toBe('répondre à');
  });
});
