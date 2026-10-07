import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  categoriesDeLaFiche, categoriesDuBien, detailFamilles, famillesDestinataires, mentionAdresse,
  motFamille, ORDRE_FAMILLES, titreFamille, tonFamille,
} from './familleDestinataire';
import type { CategoriePartie } from './historiqueBien';
import { estAdresseInterne } from './adresseInterne';

/**
 * ══ 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — LE STATUT D'ENVOI D'UNE PIÈCE, PAR FAMILLE ══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ CE FICHIER ÉPROUVAIT `partiesDestinataires` (lot HISTORIQUE-BIEN-14) : des LIGNES « → envoyé à la partie … »,
 * où TOUTES nos adresses étaient écartées et où « non affecté » nommait l'inconnu. Arno le renverse le 07/10/2026 :
 * des CAPSULES, une famille INTERNE qui n'existait pas, « Extérieur » à la place de « non affecté », le Cci compté
 * quand on le connaît, et un seul « i » pour toute la pièce.
 *
 * 🔴 CE QUE L'ANCIEN FICHIER PROTÉGEAIT EST TOUJOURS ÉPROUVÉ, et la plupart de ses cas sont ici, réécrits : une
 * ligne par PARTIE et non par adresse, nos adresses traitées à part, l'ordre des groupes, « À » avant « Cc », une
 * adresse répétée comptée une fois, et rien du tout pour un message reçu.
 *
 * Le jeu d'essai reste celui de lot-146 : la propriétaire Blandine Piriou, les locataires en place, l'assureur,
 * et nos deux adresses.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const PROPRIO = 'blandine.piriou@gmail.com';
const PROPRIO2 = 'chloe.mangifesta@gtf.fr';
const LOCATAIRE = 'mathilde.brasset@gmail.com';
const LOCATAIRE2 = 'louisvaglio@live.fr';
const TIERS = 'sinistres@assureur.test';
const INCONNU = 'voisin@ailleurs.test';
/** La BOÎTE elle-même : écartée des destinataires, et elle seule. */
const BOITE = 'gestion@criterimmo.fr';
/** Un collègue : interne, mais PAS la boîte — il a donc sa capsule depuis ce lot. */
const COLLEGUE = 'n.bayart@sansvisavis.com';
/** Notre adresse Gmail nommée, qui n'est sur aucun de nos domaines. */
const NOTRE_GMAIL = 'gestion.criterimmo@gmail.com';

const CATS = new Map<string, CategoriePartie>([
  [PROPRIO, 'proprietaire'], [PROPRIO2, 'proprietaire'],
  [LOCATAIRE, 'locataire'], [LOCATAIRE2, 'locataire'], [TIERS, 'independant'],
]);

/** Les règles de l'écran : la règle centrale du dépôt, et la boîte. */
const REGLES = { estInterne: (a: string) => estAdresseInterne(a), adresseBoite: BOITE };

const qui = (adresse: string, nom: string | null = null) => ({ nom, adresse });
const envoi = (a: string[], cc: string[] = [], cci: string[] = []) => ({
  sens: 'envoye' as const, a: a.map((x) => qui(x)), cc: cc.map((x) => qui(x)), cci: cci.map((x) => qui(x)),
});
/** Les familles d'un envoi, dans l'ordre rendu — c'est ce que les capsules afficheront. */
const familles = (m: Parameters<typeof famillesDestinataires>[0]): string[] =>
  famillesDestinataires(m, CATS, REGLES).map((f) => f.famille);

describe('🔴🔴 ① quand : nos envois seulement', () => {
  it('🔴🔴 un message REÇU ne porte aucune capsule', () => {
    expect(famillesDestinataires(
      { sens: 'recu', a: [qui(PROPRIO)], cc: [qui(LOCATAIRE)] }, CATS, REGLES)).toEqual([]);
  });

  it('🔴 un envoi sans destinataire exploitable ne porte rien non plus', () => {
    expect(familles(envoi([]))).toEqual([]);
    /* ⚠️ LA BOÎTE SEULE NE FAIT PAS UNE CAPSULE : s'écrire à soi-même n'est pas « envoyer vers ». */
    expect(familles(envoi([BOITE]))).toEqual([]);
    /* ⚠️ UNE ADRESSE VIDE OU FAITE D'ESPACES N'EST PAS UNE PERSONNE. */
    expect(familles(envoi(['', '   ']))).toEqual([]);
  });
});

describe('🔴🔴 ② la famille d’une adresse, dans l’ordre de priorité d’Arno', () => {
  /**
   * 🔴🔴 L'INTERNE PASSE AVANT LE BLOC PARTIES, et c'est la priorité (a) d'Arno. Ce cas est le plus important du
   * fichier : six de nos fiches WIPPIMMO portent une de nos adresses (JOREL Arnaud, GABRIEL ESTATE, MARS AVENIR,
   * SARL MACJ…). Sans cette priorité, un mail entre collègues deviendrait « Envoyé vers propriétaire ».
   */
  it('🔴🔴 une adresse interne reste INTERNE, même si les Parties la connaissent', () => {
    const cats = new Map<string, CategoriePartie>([[COLLEGUE, 'proprietaire'], [NOTRE_GMAIL, 'locataire']]);
    const r = famillesDestinataires(envoi([COLLEGUE, NOTRE_GMAIL]), cats, REGLES);
    expect(r.map((f) => f.famille)).toEqual(['interne']);
    expect(r[0].adresses.map((d) => d.adresse)).toEqual([COLLEGUE, NOTRE_GMAIL]);
  });

  it('🔴🔴 les trois domaines et l’adresse nommée sont internes', () => {
    for (const a of ['x@sansvisavis.com', 'y@criterimmo.fr', 'z@mail.criterimmo.fr', NOTRE_GMAIL]) {
      expect(familles(envoi([a])), a).toEqual(['interne']);
    }
  });

  it('🔴 les trois catégories du bloc PARTIES donnent leurs trois familles', () => {
    expect(familles(envoi([PROPRIO]))).toEqual(['proprietaire']);
    expect(familles(envoi([LOCATAIRE]))).toEqual(['locataire']);
    expect(familles(envoi([TIERS]))).toEqual(['independant']);
  });

  /** 🔴 UNE ADRESSE INCONNUE DES PARTIES → EXTÉRIEUR, et c'est le cas (c) d'Arno. */
  it('🔴 une adresse inconnue est EXTÉRIEURE', () => {
    expect(familles(envoi([INCONNU]))).toEqual(['exterieur']);
  });

  /**
   * 🔴🔴 SANS BIEN RATTACHÉ, IL N'Y A QUE INTERNE ET EXTÉRIEUR (Arno). On le vérifie avec une carte VIDE, qui est
   * exactement ce que l'écran passe quand la conversation ne porte aucun bien confirmé.
   */
  it('🔴🔴 conversation sans bien : seulement Interne et Extérieur', () => {
    const sansBien = new Map<string, CategoriePartie>();
    const r = famillesDestinataires(envoi([PROPRIO, COLLEGUE, TIERS]), sansBien, REGLES);
    expect(r.map((f) => f.famille)).toEqual(['interne', 'exterieur']);
  });
});

describe('🔴🔴 ③ une capsule par famille, dans l’ordre', () => {
  /** 🔴🔴 L'ORDRE D'ARNO : Propriétaire, Locataire, Tiers indépendant, Interne, Extérieur. */
  it('🔴🔴 l’ordre est celui d’Arno, quel que soit l’ordre des en-têtes', () => {
    expect([...ORDRE_FAMILLES])
      .toEqual(['proprietaire', 'locataire', 'independant', 'interne', 'exterieur']);
    /* Les en-têtes sont donnés à l'envers exprès : le rendu doit les remettre dans l'ordre. */
    expect(familles(envoi([INCONNU, COLLEGUE, TIERS, LOCATAIRE, PROPRIO])))
      .toEqual(['proprietaire', 'locataire', 'independant', 'interne', 'exterieur']);
  });

  /** 🔴🔴 PROPRIÉTAIRE + LOCATAIRE + INTERNE → TROIS capsules, dans l'ordre (cas demandé par Arno). */
  it('🔴🔴 propriétaire, locataire et interne : trois capsules, ordre respecté', () => {
    const r = famillesDestinataires(envoi([PROPRIO], [LOCATAIRE, COLLEGUE]), CATS, REGLES);
    expect(r.map((f) => f.mot)).toEqual([
      'Envoyé vers propriétaire', 'Envoyé vers locataire', 'Envoyé en interne',
    ]);
  });

  /**
   * 🔴🔴 DEUX LOCATAIRES → UNE SEULE CAPSULE (Arno). La question posée par la capsule est « vers qui », pas
   * « combien » : le détail des deux adresses vit dans la bulle.
   */
  it('🔴🔴 deux locataires : une seule capsule verte, deux adresses dans la bulle', () => {
    const r = famillesDestinataires(envoi([LOCATAIRE, LOCATAIRE2]), CATS, REGLES);
    expect(r).toHaveLength(1);
    expect(r[0].famille).toBe('locataire');
    expect(r[0].adresses.map((d) => d.adresse)).toEqual([LOCATAIRE, LOCATAIRE2]);
  });

  /** 🔴 LES MOTS ET LES TONS, dans les mots d'Arno au caractère près. */
  it('🔴 chaque famille a son mot, son titre et son ton', () => {
    expect(ORDRE_FAMILLES.map(motFamille)).toEqual([
      'Envoyé vers propriétaire', 'Envoyé vers locataire', 'Envoyé à tiers indépendant',
      'Envoyé en interne', 'Destinataire extérieur',
    ]);
    expect(ORDRE_FAMILLES.map(titreFamille)).toEqual([
      'Propriétaire', 'Locataire', 'Tiers indépendant', 'Interne', 'Extérieur',
    ]);
    expect(ORDRE_FAMILLES.map(tonFamille)).toEqual(['rouge', 'vert', 'bleu', 'gris', 'neutre']);
  });
});

describe('🔴🔴 ④ les destinataires : À, Cc, Cci — et la boîte écartée', () => {
  /** 🔴 LES TROIS CHAMPS SONT LUS, dans l'ordre où on lit un en-tête de courrier. */
  it('🔴 « À » puis « Cc » puis « Cci »', () => {
    const r = famillesDestinataires(envoi([PROPRIO], [LOCATAIRE], [TIERS]), CATS, REGLES);
    expect(r.flatMap((f) => f.adresses.map((d) => d.champ))).toEqual(['À', 'Cc', 'Cci']);
  });

  /** ⚠️ LE CCI EST FACULTATIF : les écrans qui ne le connaissent pas ne doivent pas pour autant perdre le reste. */
  it('⚠️ un message sans Cci connu se calcule quand même', () => {
    const r = famillesDestinataires(
      { sens: 'envoye', a: [qui(PROPRIO)], cc: [] }, CATS, REGLES);
    expect(r.map((f) => f.famille)).toEqual(['proprietaire']);
  });

  /** ⚠️ UNE ADRESSE RÉPÉTÉE (en « À » puis en « Cc ») N'EST COMPTÉE QU'UNE FOIS, au premier champ. */
  it('⚠️ une adresse répétée ne paraît qu’une fois', () => {
    const r = famillesDestinataires(envoi([PROPRIO], [PROPRIO.toUpperCase()]), CATS, REGLES);
    expect(r[0].adresses).toHaveLength(1);
    expect(r[0].adresses[0].champ).toBe('À');
  });

  /**
   * 🔴🔴 LA BOÎTE EST ÉCARTÉE, ET ELLE SEULE. C'est le renversement du lot : un collègue reste, la boîte part.
   * Sans cette distinction, « Envoyé en interne » se collerait sous la moitié des pièces sortantes, puisque nous
   * nous mettons en copie de la moitié de nos messages.
   */
  it('🔴🔴 la boîte part, le collègue reste', () => {
    const r = famillesDestinataires(envoi([PROPRIO], [BOITE, COLLEGUE]), CATS, REGLES);
    expect(r.map((f) => f.famille)).toEqual(['proprietaire', 'interne']);
    expect(r[1].adresses.map((d) => d.adresse)).toEqual([COLLEGUE]);
  });

  /** ⚠️ LA COMPARAISON EST INSENSIBLE À LA CASSE ET AUX BLANCS, des deux côtés. */
  it('⚠️ la boîte est reconnue quelle que soit sa casse', () => {
    expect(familles(envoi([' Gestion@CRITERIMMO.fr ']))).toEqual([]);
  });
});

describe('🔴🔴 ⑤ la bulle du « i »', () => {
  /** 🔴🔴 GROUPÉE PAR FAMILLE, avec le titre de famille — et les adresses EN ENTIER (Arno). */
  it('🔴🔴 une ligne par famille, titre puis adresses entières', () => {
    const r = famillesDestinataires(
      { sens: 'envoye',
        a: [{ nom: 'Blandine PIRIOU', adresse: PROPRIO }],
        cc: [qui(LOCATAIRE), qui(LOCATAIRE2), qui(COLLEGUE)] },
      CATS, REGLES);
    /* ⚠️ LE CHAMP N'EST DIT QUE S'IL N'EST PAS « À » : le format d'Arno se rend au caractère près pour un
       destinataire direct, et une copie reste distinguable — l'ancienne info-bulle le disait, et le perdre
       aurait été un retrait. */
    expect(detailFamilles(r)).toBe(
      `Propriétaire : Blandine PIRIOU <${PROPRIO}>\n`
      + `Locataire : ${LOCATAIRE} (Cc), ${LOCATAIRE2} (Cc)\n`
      + `Interne : ${COLLEGUE} (Cc)`);
  });

  /** ⚠️ LE NOM **ET** L'ADRESSE quand les deux existent ; l'adresse seule sinon — jamais un « (sans nom) ». */
  it('⚠️ le nom accompagne l’adresse, il ne la remplace pas', () => {
    expect(mentionAdresse({ champ: 'À', nom: 'Jean PONS', adresse: 'j@x.fr' })).toBe('Jean PONS <j@x.fr>');
    expect(mentionAdresse({ champ: 'À', nom: null, adresse: 'j@x.fr' })).toBe('j@x.fr');
    expect(mentionAdresse({ champ: 'À', nom: '   ', adresse: 'j@x.fr' })).toBe('j@x.fr');
  });
});

describe('🔴🔴 ⑥ le classement reprend le calcul du bloc PARTIES, sans copie', () => {
  /**
   * 🔴🔴 LA MOITIÉ « FICHE » : les propriétaires donnent « Propriétaire », les occupants et les anciens donnent
   * « Locataire », et le PREMIER POSÉ gagne — un couple propriétaire-occupant ne change pas de groupe selon
   * l'ordre de lecture.
   */
  it('🔴🔴 la fiche donne propriétaires et locataires, le premier posé gagne', () => {
    const c = (valeur: string) => ({ sorte: 'email' as const, valeur });
    const m = categoriesDeLaFiche({
      proprietaires: [{ contacts: [c(PROPRIO), c('PARTAGE@x.fr')] }],
      proprietaireContacts: [c(PROPRIO2)],
      occupants: [{ contacts: [c(LOCATAIRE), c('partage@x.fr')] }],
      occupations: [{ contacts: [c(LOCATAIRE2)] }],
    } as never);
    expect(m.get(PROPRIO)).toBe('proprietaire');
    expect(m.get(PROPRIO2)).toBe('proprietaire');
    expect(m.get(LOCATAIRE)).toBe('locataire');
    expect(m.get(LOCATAIRE2)).toBe('locataire');
    /* 🔴 L'ADRESSE PARTAGÉE RESTE PROPRIÉTAIRE : elle a été posée d'abord, exprès. */
    expect(m.get('partage@x.fr')).toBe('proprietaire');
  });

  /** ⚠️ LES CLÉS SONT EN MINUSCULES : une comparaison sensible à la casse aurait rangé « Jean.PONS@… » à l'écart. */
  it('⚠️ les clés sont normalisées', () => {
    const m = categoriesDeLaFiche({
      proprietaires: [{ contacts: [{ sorte: 'email', valeur: '  Jean.PONS@X.FR ' }] }],
      proprietaireContacts: [], occupants: [], occupations: [],
    } as never);
    expect(m.get('jean.pons@x.fr')).toBe('proprietaire');
  });

  /**
   * 🔴🔴 LA FUSION : LA FICHE L'EMPORTE SUR LES RANGEMENTS. Un propriétaire de CETTE fiche est un CLIENT, et
   * aucun rangement — fût-il vérifié — ne doit le faire basculer dans un autre groupe.
   */
  it('🔴🔴 dans la fusion, la fiche gagne', () => {
    const rangees = new Map<string, CategoriePartie>([[PROPRIO, 'independant'], [TIERS, 'independant']]);
    const m = categoriesDuBien({
      proprietaires: [{ contacts: [{ sorte: 'email', valeur: PROPRIO }] }],
      proprietaireContacts: [], occupants: [], occupations: [],
    } as never, rangees);
    expect(m.get(PROPRIO)).toBe('proprietaire');
    /* 🔴 ET LE RANGEMENT TIENT LÀ OÙ LA FICHE NE DIT RIEN : « Tiers indépendant » ne vit que là. */
    expect(m.get(TIERS)).toBe('independant');
  });

  /** ⚠️ SANS FICHE (conversation sans bien), il ne reste que les rangements — et une carte vide si rien. */
  it('⚠️ sans fiche, il ne reste que les rangements', () => {
    expect(categoriesDuBien(null, new Map([[TIERS, 'independant']])).get(TIERS)).toBe('independant');
    expect(categoriesDuBien(null).size).toBe(0);
  });

  /**
   * 🔴🔴 ET PERSONNE NE RECLASSE À SA FAÇON (Arno). Les trois écrans qui montrent ces capsules — la fiche du
   * bien, l'historique du bien et la conversation — appellent la MÊME fonction, et aucun ne réécrit la règle.
   */
  it('🔴🔴 les trois écrans lisent la même fonction, aucun ne la recopie', () => {
    const fichiers = [
      ['Annuaire (fiche du bien)', 'app/(admin)/admin/(protected)/gestion/Annuaire.tsx'],
      ['Historique du bien', 'app/(admin)/admin/(protected)/gestion/HistoriqueDuBien.tsx'],
      ['Conversation', 'app/(admin)/admin/(protected)/gestion/Conversation.tsx'],
    ] as const;
    for (const [nom, chemin] of fichiers) {
      const src = readFileSync(chemin, 'utf8');
      expect(src, nom).toContain("from '../../../../lib/gestion/familleDestinataire'");
      /* ⚠️ SANS LES COMMENTAIRES : les encadrés de ce lot NOMMENT la fonction descendue pour dire d'où elle
         vient — une lecture brute tomberait sur l'explication au lieu d'une recopie. */
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, nom).not.toContain('function categoriesDesParties');
      /* 🔴 ET AUCUN N'A GARDÉ LA RÈGLE : poser « proprietaire » depuis les contacts d'une fiche ne s'écrit plus
         que dans le module pur.
         ⚠️ ON NE CHERCHE PAS `sorte !== 'email'` TOUT COURT : `periodesDesParties` le fait aussi, pour les
         PÉRIODES d'occupation — une autre question, qui n'a rien à voir avec les catégories. */
      expect(code, nom).not.toContain("poser(p.contacts, 'proprietaire')");
      expect(code, nom).not.toContain("poser(p.contacts, 'locataire')");
    }
  });
});
