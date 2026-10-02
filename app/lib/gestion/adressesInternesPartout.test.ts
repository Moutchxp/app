import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  adressesRapprochables, estAdresseInterne, ADRESSES_INTERNES, DOMAINES_INTERNES,
} from './adresseInterne';
// ── LES QUATRE VOIES QU'ARNO A NOMMÉES ──────────────────────────────────────────────────────────────────────────
// ① LE MOTEUR : « cette adresse peut-elle servir de clé de rattachement ? »
import { estInterne } from './adressesMessage';
// ② L'ÉTAPE 2 : la décision est pure, le dépôt ne fait que lui passer le verdict d'`estAdresseInterne`.
import { etape2Requise } from './contactExterne';
// ③ LES DOCUMENTS AUTOMATIQUES : « ce document part-il chez quelqu'un, ou chez nous ? »
import { estNotreAdresse } from './documentsAuto';
import { NOS_ADRESSES } from './documentsAutoRepo';
// ④ LES ENVOIS : « Interne » proposé en premier quand tous les destinataires sont de la maison.
import { DOMAINES_MAISON, estAdresseMaison, proposerInterneDabord } from './interneRepo';
// ⑤ LE TRI DES PIÈCES JOINTES, qui lit la même liste depuis toujours.
import { estAdresseMaison as estAdresseMaisonPiece, DOMAINES_MAISON as DOMAINES_PIECE } from './triPieces';

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — NOS ADRESSES, LA MÊME LISTE PARTOUT ══════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (02/10/2026) : « gestion.criterimmo@gmail.com est NOTRE adresse. Ajoute-la à la liste centrale
 * des adresses internes (comme @criterimmo.fr et @sansvisavis.com) : jamais d'étape 2, jamais de bloc des
 * parties, jamais de proposition par expéditeur. Vérifie que la liste est la même partout (moteur, étape 2,
 * documents automatiques, envois). »
 *
 * 🔴🔴 CE FICHIER EXISTE PARCE QUE LA VÉRIFICATION A TROUVÉ QUELQUE CHOSE. La liste était écrite à TROIS endroits :
 *
 *     · `adresseInterne.DOMAINES_INTERNES`        — la liste dite « centrale », deux domaines ;
 *     · `interneRepo.DOMAINES_MAISON`             — une recopie, mêmes deux domaines, dans l'autre ordre ;
 *     · `documentsAutoRepo.NOS_ADRESSES`          — une recopie, deux domaines **PLUS** gestion.criterimmo@gmail.com.
 *
 * Le rangement des documents automatiques savait donc que cette boîte Gmail était la nôtre, et le moteur de
 * rattachement ne le savait pas. Mesuré sur la base le 02/10/2026 : **940 mails de notre propre boîte** attendaient
 * dans la file « À rattacher » comme s'ils venaient d'un inconnu — le plus gros « expéditeur inconnu » du dépôt.
 *
 * 🔴 LES TROIS LISTES N'EN FONT PLUS QU'UNE, et ce fichier le GARDE. Les deux recopies sont devenues des dérivées,
 * et une épreuve compare les RÉFÉRENCES (`toBe`), pas les contenus : un quatrième domaine ajouté un jour n'aura
 * qu'un seul endroit où être écrit — et si quelqu'un en recopie une quatrième, c'est ici que ça tombera rouge.
 *
 * ⚠️ LA DERNIÈRE ÉPREUVE LIT LE CODE SOURCE. C'est inhabituel et c'est assumé : une liste recopiée ne se voit pas
 * à l'exécution tant que les deux copies s'accordent. Seule une lecture du texte peut dire « ce nom de domaine est
 * écrit en dur quelque part où il ne devrait pas l'être ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Notre boîte Gmail de gestion — la décision d'Arno du 02/10/2026. */
const NOTRE_GMAIL = 'gestion.criterimmo@gmail.com';
/** Un vrai client chez le même fournisseur : il doit rester parfaitement extérieur. */
const CLIENT_GMAIL = 'locataire.dupont@gmail.com';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   A — LA LISTE CENTRALE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('A — la liste centrale porte nos deux domaines ET nos adresses nommées', () => {
  it('🔴 les deux domaines, inchangés', () => {
    expect([...DOMAINES_INTERNES].sort()).toEqual(['criterimmo.fr', 'sansvisavis.com']);
  });

  it('🔴🔴 et notre boîte Gmail de gestion, nommée EN ENTIER', () => {
    expect([...ADRESSES_INTERNES]).toEqual([NOTRE_GMAIL]);
    // ⚠️ EN MINUSCULES ET SANS BLANC : une entrée mal formée ne correspondrait jamais à rien, en silence.
    for (const a of ADRESSES_INTERNES) {
      expect(a).toBe(a.trim().toLowerCase());
      expect(a).toContain('@');
    }
  });

  it('🔴🔴 « gmail.com » N’EST PAS UN DOMAINE INTERNE — ce serait la pire des régressions', () => {
    expect([...DOMAINES_INTERNES]).not.toContain('gmail.com');
    expect(estAdresseInterne(CLIENT_GMAIL)).toBe(false);
    expect(estAdresseInterne('syndic@gmail.com')).toBe(false);
  });

  it('🔴 notre Gmail est reconnu, quelle que soit la casse ou les blancs', () => {
    expect(estAdresseInterne(NOTRE_GMAIL)).toBe(true);
    expect(estAdresseInterne('  GESTION.CRITERIMMO@Gmail.COM  ')).toBe(true);
  });

  it('🔴 les domaines d’avant continuent de valoir, sous-domaines compris', () => {
    expect(estAdresseInterne('a.jorel@sansvisavis.com')).toBe(true);
    expect(estAdresseInterne('gestion@criterimmo.fr')).toBe(true);
    expect(estAdresseInterne('robot@mail.criterimmo.fr')).toBe(true);
    expect(estAdresseInterne('locataire@orange.fr')).toBe(false);
  });

  it('🔴 elle n’est jamais rapprochable : aucune fiche ne sera cherchée pour elle', () => {
    expect(adressesRapprochables([NOTRE_GMAIL, CLIENT_GMAIL, 'gestion@criterimmo.fr']))
      .toEqual([CLIENT_GMAIL]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 B — LA MÊME LISTE DANS LES QUATRE VOIES D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 B — moteur, étape 2, documents automatiques, envois : la même réponse', () => {
  it('① LE MOTEUR : notre Gmail ne sert plus de clé de rattachement', () => {
    // `estInterne` reçoit l'adresse de gestion et les partenaires ; notre Gmail doit valoir sans qu'on l'y passe.
    expect(estInterne(NOTRE_GMAIL, 'gestion@criterimmo.fr', [])).toBe(true);
    expect(estInterne(CLIENT_GMAIL, 'gestion@criterimmo.fr', [])).toBe(false);
  });

  it('🔴🔴 ② L’ÉTAPE 2 : jamais demandée pour notre Gmail', () => {
    const contexte = {
      sens: 'recu' as const, expediteurConnu: false, document: false,
      biensCoches: ['421'], interne: false, horsGestion: false,
    };
    // Le dépôt passe le verdict d'`estAdresseInterne` : on le rejoue ici, des deux côtés.
    expect(etape2Requise({ ...contexte, expediteurInterne: estAdresseInterne(NOTRE_GMAIL) }))
      .toEqual({ requise: false, motif: 'adresse_interne' });
    // ⚠️ ET POUR UN VRAI INCONNU CHEZ GMAIL, ELLE RESTE DEMANDÉE : on n'a pas fermé la porte d'un cran de trop.
    expect(etape2Requise({ ...contexte, expediteurInterne: estAdresseInterne(CLIENT_GMAIL) }))
      .toEqual({ requise: true, motif: null });
  });

  it('③ LES DOCUMENTS AUTOMATIQUES : `NOS_ADRESSES` DÉRIVE de la liste centrale', () => {
    // Elle porte les domaines sous leur forme « @domaine », plus les adresses nommées en entier.
    expect([...NOS_ADRESSES].sort())
      .toEqual(['@criterimmo.fr', '@sansvisavis.com', NOTRE_GMAIL].sort());
    expect(estNotreAdresse(NOTRE_GMAIL, NOS_ADRESSES)).toBe(true);
    expect(estNotreAdresse('a.jorel@sansvisavis.com', NOS_ADRESSES)).toBe(true);
    expect(estNotreAdresse(CLIENT_GMAIL, NOS_ADRESSES)).toBe(false);
  });

  it('🔴 ③-bis sa composition SUIT la liste centrale, elle ne la recopie pas', () => {
    for (const d of DOMAINES_INTERNES) expect([...NOS_ADRESSES]).toContain(`@${d}`);
    for (const a of ADRESSES_INTERNES) expect([...NOS_ADRESSES]).toContain(a);
    expect(NOS_ADRESSES).toHaveLength(DOMAINES_INTERNES.length + ADRESSES_INTERNES.length);
  });

  it('④ LES ENVOIS : notre Gmail est de la maison, « gmail.com » ne l’est pas', () => {
    expect(estAdresseMaison(NOTRE_GMAIL)).toBe(true);
    expect(estAdresseMaison(CLIENT_GMAIL)).toBe(false);
    expect(proposerInterneDabord([NOTRE_GMAIL, 'a.jorel@sansvisavis.com'])).toBe(true);
    expect(proposerInterneDabord([NOTRE_GMAIL, CLIENT_GMAIL])).toBe(false);
  });

  it('⑤ LE TRI DES PIÈCES JOINTES lit la même liste', () => {
    expect(estAdresseMaisonPiece(NOTRE_GMAIL, [])).toBe(true);
    expect(estAdresseMaisonPiece(CLIENT_GMAIL, [])).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 C — IL N'Y A PLUS QU'UNE SEULE LISTE, ET C'EST CE QUI SE GARDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 C — une seule vérité : les réexports sont la MÊME référence', () => {
  it('🔴 `interneRepo.DOMAINES_MAISON` EST la liste centrale', () => {
    expect(DOMAINES_MAISON).toBe(DOMAINES_INTERNES);
  });

  it('🔴 `triPieces.DOMAINES_MAISON` aussi', () => {
    expect(DOMAINES_PIECE).toBe(DOMAINES_INTERNES);
  });

  /**
   * ══ 🔴🔴 LE GARDE QUI LIT LE CODE SOURCE ══════════════════════════════════════════════════════════════════
   *
   * Les épreuves ci-dessus prouvent que les listes s'accordent AUJOURD'HUI. Elles ne peuvent pas prouver que
   * personne n'en recopiera une QUATRIÈME demain — c'est précisément ce qui s'était produit, et ce garde l'a
   * TROUVÉ à sa première exécution : `config.ts` portait `domainesInternes: ['criterimmo.fr','sansvisavis.com']`,
   * une quatrième copie que personne ne lisait mais qui aurait dérivé au premier domaine ajouté.
   *
   * ═══ 🔴 CE QU'IL VISE EXACTEMENT, ET POURQUOI SI ÉTROIT ═════════════════════════════════════════════════════
   *
   * La signature d'une LISTE recopiée, et elle seule : **DEUX de nos domaines, entre apostrophes, sur la MÊME
   * ligne**. C'est la forme de `['criterimmo.fr', 'sansvisavis.com']`, et aucune autre construction du dépôt ne
   * lui ressemble.
   *
   * ⚠️ SA PREMIÈRE ÉCRITURE ÉTAIT TROP LARGE, ET C'EST INSTRUCTIF. Elle signalait UN domaine entre apostrophes
   * n'importe où — et elle accusait `envoiGmail.ts:50`, `return (m?.[1] ?? 'criterimmo.fr')`, un REPLI de domaine
   * pour composer un Message-ID. Ce n'est pas une liste de nos adresses, c'est une valeur par défaut : la
   * signaler aurait appris à ignorer ce test, ce qui est pire que ne pas l'avoir.
   *
   * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT LA LECTURE. Les encadrés de ce lot NOMMENT nos domaines et notre
   * adresse Gmail — c'est leur travail d'expliquer la règle. Un garde qui les compterait se déclencherait sur sa
   * propre documentation.
   */

  /** Le fichier, débarrassé de ses commentaires : on ne juge que du CODE. PUR. */
  const sansCommentaires = (source: string): string => source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  /** Les fichiers du module à examiner. La liste centrale a le droit — c'est elle ; les tests aussi. */
  const fichiersDuModule = (): { nom: string; code: string }[] => {
    const racine = join(process.cwd(), 'app', 'lib', 'gestion');
    const out: { nom: string; code: string }[] = [];
    for (const nom of readdirSync(racine)) {
      if (!nom.endsWith('.ts')) continue;
      if (nom === 'adresseInterne.ts' || nom.includes('.test.') || nom.includes('.itest.')) continue;
      out.push({ nom, code: sansCommentaires(readFileSync(join(racine, nom), 'utf8')) });
    }
    return out;
  };

  it('🔴🔴 aucun autre fichier du module ne RECOPIE la liste de nos domaines', () => {
    const cite = (ligne: string, d: string): boolean =>
      new RegExp(`['"\`]${d.replace(/\./g, '\\.')}['"\`]`).test(ligne);
    const coupables: string[] = [];
    for (const { nom, code } of fichiersDuModule()) {
      for (const ligne of code.split('\n')) {
        // 🔴 DEUX de nos domaines sur la MÊME ligne : c'est une liste, et elle n'a qu'un seul endroit où vivre.
        if (DOMAINES_INTERNES.filter((d) => cite(ligne, d)).length >= 2) {
          coupables.push(`${nom} → ${ligne.trim().slice(0, 80)}`);
        }
      }
    }
    expect(coupables, `une liste de nos domaines est recopiée ici :\n  ${coupables.join('\n  ')}`).toEqual([]);
  });

  it('🔴🔴 et aucun ne recopie une de nos adresses nommées', () => {
    const coupables: string[] = [];
    for (const { nom, code } of fichiersDuModule()) {
      for (const a of ADRESSES_INTERNES) if (code.includes(a)) coupables.push(`${nom} → ${a}`);
    }
    expect(coupables, `une de nos adresses est recopiée ici : ${coupables.join(', ')}`).toEqual([]);
  });
});
