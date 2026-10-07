import { describe, it, expect } from 'vitest';
import {
  cleDuCalcul, dossierDOuverture, motRaison, titreDuBien, titreDuProprietaire, vignettesDeLaFenetre,
  type BienPourLaFenetre, type RaisonBien,
} from './raccourciDrive';

/**
 * ══ 🔴🔴 LOT DRIVE-RACCOURCI-PAR-DESTINATAIRE — CE QUE LA COLONNE DE GAUCHE MONTRE, ET POURQUOI ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026) : « le bouton Drive (▲) et la fenêtre Drive qu'il ouvre se configurent tout seuls
 * sur le ou les biens concernés. »
 *
 * Ce fichier éprouve la MISE EN FORME, sans base : quelles vignettes, dans quel ordre, avec quels mots, et où la
 * fenêtre s'ouvre. La LECTURE (quel bien pour quelle adresse) se mesure sur les vraies données —
 * `raccourciDriveRepo.itest.ts`, qui rejoue les dix cas qu'Arno a listés.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const bien = (o: Partial<BienPourLaFenetre> = {}): BienPourLaFenetre => ({
  cle: '418',
  libelle: '38-44 rue de la Vanne, 92120 MONTROUGE — lot 418',
  proprietaire: 'NDOLO et BILE Agnès et Jean David',
  raison: 'rattache',
  dossierId: 'd-418',
  dossierNom: null,
  ...o,
});

describe('les mots de la vignette — on doit pouvoir dire POURQUOI sans ouvrir la fiche', () => {
  it('🔴 chaque raison a son mot, et « ancien locataire » n’est pas « locataire »', () => {
    const mots: Record<RaisonBien, string> = {
      rattache: 'rattaché au mail',
      locataire: 'locataire',
      ancien_locataire: 'ancien locataire',
      proprietaire: 'propriétaire',
      proprietaire_multi: 'propriétaire',
      contact_proprietaire: 'contact du propriétaire',
      contact_locataire: 'contact du locataire',
    };
    for (const [r, mot] of Object.entries(mots)) expect(motRaison(r as RaisonBien)).toBe(mot);
  });

  /**
   * 🔴 LE NOMBRE N'EST DIT QU'AU-DELÀ D'UN. « propriétaire de 1 bien » ferait croire qu'il y a quelque chose à
   * choisir là où il n'y a qu'un dossier — et c'est précisément ce que la vignette doit éviter de suggérer.
   */
  it('🔴 « propriétaire de 3 biens » — le nombre, et seulement quand il y en a plusieurs', () => {
    expect(motRaison('proprietaire_multi', 3)).toBe('propriétaire de 3 biens');
    expect(motRaison('proprietaire_multi', 1)).toBe('propriétaire');
    expect(motRaison('proprietaire_multi', 0)).toBe('propriétaire');
  });

  it('⚠️ sans propriétaire connu, le tiret disparaît avec le nom', () => {
    expect(titreDuBien('GARREAU Gabrielle')).toBe('Dossier du bien — GARREAU Gabrielle');
    expect(titreDuBien(null)).toBe('Dossier du bien');
    expect(titreDuBien('   ')).toBe('Dossier du bien');
    expect(titreDuProprietaire('RD PROMOTION ET CIE')).toBe('Dossier propriétaire — RD PROMOTION ET CIE');
    expect(titreDuProprietaire('')).toBe('Dossier propriétaire');
  });
});

describe('les vignettes, dans l’ordre où la colonne les montre', () => {
  it('🔴 un seul bien : une vignette, qui dit le nom, l’adresse, le lot ET la raison', () => {
    const v = vignettesDeLaFenetre([bien()]);
    expect(v).toHaveLength(1);
    expect(v[0].sorte).toBe('bien');
    expect(v[0].titre).toBe('Dossier du bien — NDOLO et BILE Agnès et Jean David');
    expect(v[0].detail).toBe('38-44 rue de la Vanne, 92120 MONTROUGE — lot 418 · rattaché au mail');
    expect(v[0].dossierId).toBe('d-418');
  });

  /**
   * 🔴 LE MAIL RATTACHÉ À PLUSIEURS BIENS : UNE VIGNETTE PAR BIEN, et aucune vignette de propriétaire — le mail
   * a été rattaché à des LOGEMENTS, pas à un bailleur. C'est aussi un changement assumé par rapport au lot
   * DRIVE-DOSSIER-DU-BIEN, qui groupait deux lots d'un même bailleur sur UNE ligne parce qu'ils menaient au même
   * dossier. Ils ne mènent plus au même : chaque bien a le sien.
   */
  it('🔴 plusieurs biens rattachés : une vignette CHACUN, dans l’ordre reçu', () => {
    const v = vignettesDeLaFenetre([
      bien({ cle: '421', libelle: 'B1 — lot 421', dossierId: 'd-421' }),
      bien({ cle: '422', libelle: 'B2 — lot 422', dossierId: 'd-422' }),
    ]);
    expect(v.map((x) => x.dossierId)).toEqual(['d-421', 'd-422']);
    expect(v.every((x) => x.sorte === 'bien')).toBe(true);
  });

  /**
   * 🔴🔴 MULTI-BIENS : LE DOSSIER DU PROPRIÉTAIRE EN TÊTE, PUIS UN PAR BIEN — demande d'Arno, mot pour mot.
   * C'est le cas de RD PROMOTION ET CIE : six lots à la MÊME adresse (19 rue Diderot). Sans le numéro de lot sur
   * chaque ligne, les six vignettes seraient six lignes identiques.
   */
  it('🔴🔴 propriétaire de plusieurs biens : « Dossier propriétaire » en tête, puis un par bien', () => {
    const biens = ['478', '479', '480'].map((c) => bien({
      cle: c, libelle: `19 Rue Diderot, 92130 Issy-les-Moulineaux — lot ${c}`,
      proprietaire: 'RD PROMOTION ET CIE', raison: 'proprietaire_multi', dossierId: `d-${c}`,
    }));
    const v = vignettesDeLaFenetre(biens, {
      nom: 'RD PROMOTION ET CIE', dossierId: 'd-prop', dossierNom: null, nbBiens: 3,
    });
    expect(v).toHaveLength(4);
    expect(v[0].sorte).toBe('proprietaire');
    expect(v[0].titre).toBe('Dossier propriétaire — RD PROMOTION ET CIE');
    expect(v[0].detail).toBe('propriétaire de 3 biens');
    expect(v.slice(1).map((x) => x.dossierId)).toEqual(['d-478', 'd-479', 'd-480']);
    // Chaque ligne de bien porte SON numéro : c'est tout ce qui les distingue à cette adresse.
    expect(v[1].detail).toContain('lot 478');
    expect(v[3].detail).toContain('lot 480');
  });

  /**
   * ══ 🔴🔴 LE CAS QU'ARNO A PRÉVU LUI-MÊME : PAS DE DOSSIER PROPRIÉTAIRE ═══════════════════════════════════════
   *
   * « Si ce dossier n'existe pas ou est introuvable, on ouvre le premier bien, et les vignettes permettent de
   * passer aux autres. » Il n'y a donc PAS de vignette de tête morte : elle n'est simplement pas là, et
   * l'ouverture retombe sur le premier bien sans qu'aucune règle de plus soit écrite.
   */
  it('🔴🔴 multi-biens SANS dossier propriétaire : aucune vignette de tête, on ouvre le premier bien', () => {
    const biens = ['478', '479'].map((c) => bien({ cle: c, libelle: `L${c}`, dossierId: `d-${c}` }));
    for (const sans of [null, '', '   ']) {
      const v = vignettesDeLaFenetre(biens, {
        nom: 'RD PROMOTION', dossierId: sans, dossierNom: null, nbBiens: 2,
      });
      expect(v).toHaveLength(2);
      expect(v.every((x) => x.sorte === 'bien')).toBe(true);
      expect(dossierDOuverture(v)?.dossierId).toBe('d-478');
    }
  });

  /**
   * 🔴 UN BIEN SANS DOSSIER CONNU NE PRODUIT PAS DE VIGNETTE — pas une ligne grisée, pas un message. Une ligne
   * morte se clique quand même, et c'est elle qu'on accuse ensuite d'avoir « cassé le Drive ».
   */
  it('🔴 un bien sans dossier connu ne fait AUCUNE ligne', () => {
    expect(vignettesDeLaFenetre([bien({ dossierId: null })])).toHaveLength(0);
    expect(vignettesDeLaFenetre([bien({ dossierId: '  ' })])).toHaveLength(0);
    const v = vignettesDeLaFenetre([bien({ cle: 'a', dossierId: null }), bien({ cle: 'b', dossierId: 'd-b' })]);
    expect(v.map((x) => x.cle)).toEqual(['bien:b']);
  });

  /** ⓒ d'Arno : « Aucune correspondance : comportement actuel inchangé ». Aucune vignette, aucune ouverture. */
  it('⚠️ aucun bien ⇒ aucune vignette, et la fenêtre n’est emmenée nulle part', () => {
    expect(vignettesDeLaFenetre([])).toHaveLength(0);
    expect(dossierDOuverture([])).toBeNull();
  });

  /** ⚠️ Deux biens ne peuvent pas partager un dossier (l'arbre en pose un par lot) — mais une clé React en double
      ferait crier React, et le garde ne coûte rien. */
  it('⚠️ deux fois le même dossier ne fait qu’une vignette', () => {
    const v = vignettesDeLaFenetre([bien({ cle: 'a', dossierId: 'd' }), bien({ cle: 'b', dossierId: 'd' })]);
    expect(v).toHaveLength(1);
  });

  it('🔴 la fenêtre s’ouvre sur la PREMIÈRE vignette — le propriétaire quand il y en a un', () => {
    const v = vignettesDeLaFenetre([bien({ dossierId: 'd-418' })], {
      nom: 'X', dossierId: 'd-prop', dossierNom: null, nbBiens: 2,
    });
    expect(dossierDOuverture(v)?.dossierId).toBe('d-prop');
  });
});

/**
 * ══ 🔴🔴 QUAND LE CALCUL SE REFAIT — LA DEUXIÈME MOITIÉ DE LA DEMANDE ════════════════════════════════════════════
 *
 * « Le calcul se met à jour en direct quand on modifie le champ À (nouveau message) ; pour une réponse, il vaut
 * dès l'ouverture. » Les deux phrases ne sont qu'UNE règle de priorité, et c'est ce que ce groupe prouve : dès
 * qu'un échange ou des lots désignent quelque chose, la clé ne bouge plus quand on touche au « À ».
 */
describe('la clé de calcul : ce qui relance la lecture, et ce qui ne la relance pas', () => {
  it('🔴🔴 une RÉPONSE : retoucher le champ « À » ne change RIEN', () => {
    const avant = cleDuCalcul({ filId: 101, lots: [], adresses: ['a@x.fr'] });
    const apres = cleDuCalcul({ filId: 101, lots: [], adresses: ['b@y.fr', 'c@z.fr'] });
    expect(apres).toBe(avant);
  });

  it('🔴 un MESSAGE NEUF : la première adresse décide, et elle seule', () => {
    const une = cleDuCalcul({ filId: null, lots: [], adresses: ['a@x.fr'] });
    expect(cleDuCalcul({ filId: null, lots: [], adresses: ['a@x.fr', 'b@y.fr'] })).toBe(une);
    expect(cleDuCalcul({ filId: null, lots: [], adresses: ['b@y.fr'] })).not.toBe(une);
  });

  it('🔴 des lots choisis à l’écriture valent un échange : le « À » n’entre plus dans la clé', () => {
    const avec = cleDuCalcul({ filId: null, lots: ['418'], adresses: ['a@x.fr'] });
    expect(cleDuCalcul({ filId: null, lots: ['418'], adresses: ['z@z.fr'] })).toBe(avec);
    expect(cleDuCalcul({ filId: null, lots: ['419'], adresses: ['a@x.fr'] })).not.toBe(avec);
  });

  it('⚠️ rien du tout : une clé stable, donc aucune lecture inutile', () => {
    expect(cleDuCalcul({ filId: null, lots: [], adresses: [] }))
      .toBe(cleDuCalcul({ filId: null, lots: [], adresses: [] }));
  });
});
