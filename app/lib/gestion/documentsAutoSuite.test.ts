import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attribuer, estDocumentGarant, fichesNommeesDans, fichesProchesDe, indexerNoms, MENTION_GARANT,
  nomsPropresDans, normaliserNom, SOUS_TYPES_GARANT,
  type AnnuaireAdresses, type FicheDestinataire,
} from './documentsAuto';

/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-SUITE — LE NOM, LE GARANT, ET LA RÉCEPTION ════════════════════════════════════════
 *
 * DÉCISIONS D'ARNO (01/10/2026) :
 *   ① « Si l'objet contient le nom complet d'UNE SEULE fiche […] le document est rangé dans cette fiche avec
 *      certitude, même si l'adresse ne suffisait pas. […] Si le nom correspond à plusieurs fiches → pas de
 *      certitude. »
 *   ② « Les documents adressés à un garant […] sont rangés dans la fiche du LOCATAIRE concerné […] avec la
 *      mention “envoyé au garant”. »
 *   ③ « Tout le reste va dans la Réception principale. »
 *
 * 🔒 Aucune donnée réelle : des fiches et des adresses inventées.
 */

const NOUS = ['@criterimmo.fr', '@sansvisavis.com'];

const fiche = (
  sorte: 'proprietaire' | 'locataire', cle: string, libelle: string, nbBiens = 1,
): FicheDestinataire => ({ sorte, cle, libelle, nbBiens });

const annuaire = (couples: [string, FicheDestinataire[]][]): AnnuaireAdresses => new Map(couples);

const DUPONT = fiche('locataire', 'l-dupont', 'DUPONT Jean-Paul');
const MARTIN = fiche('locataire', 'l-martin', 'MARTIN Élise');
const MARTINEZ = fiche('locataire', 'l-martinez', 'MARTINEZ Paula');
const SOCIETE = fiche('proprietaire', 'p-soc', 'VALET / RAEPSAET Damien et Michelle', 3);

const ANNUAIRE_COMPLET = annuaire([
  ['jp.dupont@exemple.test', [DUPONT]],
  ['elise@exemple.test', [MARTIN]],
  ['paula@exemple.test', [MARTINEZ]],
  ['valet@exemple.test', [SOCIETE]],
]);
const INDEX = indexerNoms(ANNUAIRE_COMPLET);

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE NOM DANS L'OBJET
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① un nom UNIQUE dans l’objet : le document est rangé', () => {
  it('🔴 l’adresse est inconnue, mais l’objet nomme une seule fiche → rangé, par le NOM', () => {
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Document CRITERIMMO - Quittance DUPONT Jean-Paul Mars 2026', indexNoms: INDEX,
    });
    expect(a.sorte).toBe('fiche');
    if (a.sorte !== 'fiche') return;
    expect(a.fiche.cle).toBe('l-dupont');
    expect(a.voie).toBe('nom');
    // 🔴 La cause d'origine est reportée : Arno veut savoir ce que le nom rattrape, et à quelle famille.
    expect(a.motifAdresse).toBe('adresse_inconnue');
  });

  /** 🔴 LES TRANSFERTS INTERNES AUSSI — Arno les a nommés explicitement. */
  it('🔴 un transfert vers NOS adresses est rangé si l’objet nomme une fiche', () => {
    const a = attribuer({
      destinataires: ['gestion@criterimmo.fr'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Fwd: Document CRITERIMMO - Août 2026 MARTIN Élise', indexNoms: INDEX,
    });
    expect(a.sorte === 'fiche' && a.fiche.cle).toBe('l-martin');
    expect(a.sorte === 'fiche' && a.motifAdresse).toBe('nos_adresses');
  });

  it('⚠️ accents, casse et tirets sont indifférents', () => {
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'quittance dupont jean paul mars 2026', indexNoms: INDEX,
    });
    expect(a.sorte === 'fiche' && a.fiche.cle).toBe('l-dupont');
    const b = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Honoraires VALET RAEPSAET Damien et Michelle', indexNoms: INDEX,
    });
    expect(b.sorte === 'fiche' && b.fiche.cle).toBe('p-soc');
  });

  /**
   * ══ 🔴🔴 LE TEST QUI EMPÊCHE DE RANGER CHEZ LE VOISIN ════════════════════════════════════════════════════════
   *
   * La comparaison porte sur des MOTS ENTIERS. Sans cela, la fiche « MARTIN Élise » serait reconnue dans un objet
   * qui nomme « MARTINEZ Paula » — et une quittance partirait chez quelqu'un d'autre. C'est la seule erreur que
   * cette règle pouvait introduire, et c'est elle qu'on scelle.
   */
  it('🔴🔴 « MARTIN Élise » n’est PAS reconnue dans un objet qui nomme « MARTINEZ Paula »', () => {
    const trouvees = fichesNommeesDans('Quittance MARTINEZ Paula Mars 2026', INDEX);
    expect(trouvees.map((f) => f.cle)).toEqual(['l-martinez']);
  });

  it('🔴 l’ADRESSE l’emporte toujours sur le nom : le nom n’est lu que si l’adresse n’a rien conclu', () => {
    const a = attribuer({
      // L'adresse désigne MARTIN, l'objet nomme DUPONT. L'adresse est un fait, le nom une lecture.
      destinataires: ['elise@exemple.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Quittance DUPONT Jean-Paul', indexNoms: INDEX,
    });
    expect(a.sorte === 'fiche' && a.fiche.cle).toBe('l-martin');
    expect(a.sorte === 'fiche' && a.voie).toBe('adresse');
    expect(a.sorte === 'fiche' && a.motifAdresse).toBe(null);
  });

  it('⚠️ sans index de noms, la voie du nom n’est pas tentée du tout', () => {
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Quittance DUPONT Jean-Paul',
    });
    expect(a.sorte).toBe('non_attribue');
  });
});

describe('① un nom AMBIGU : le document va dans la Réception', () => {
  /** Deux fiches portent le même nom : on ne tranche pas. */
  it('🔴 deux fiches de même nom → pas de certitude', () => {
    const homonymes = annuaire([
      ['a@exemple.test', [fiche('locataire', 'l-1', 'DURAND Paul')]],
      ['b@exemple.test', [fiche('proprietaire', 'p-1', 'DURAND Paul')]],
    ]);
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: homonymes, nosAdresses: NOUS,
      objet: 'Quittance DURAND Paul', indexNoms: indexerNoms(homonymes),
    });
    expect(a.sorte).toBe('non_attribue');
  });

  /** L'objet nomme deux personnes différentes : lequel des deux dossiers ? On ne devine pas. */
  it('🔴 un objet qui nomme DEUX fiches → pas de certitude', () => {
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Décompte DUPONT Jean-Paul et MARTIN Élise', indexNoms: INDEX,
    });
    expect(a.sorte).toBe('non_attribue');
  });

  /** ⚠️ Un nom contenu dans un autre produit DEUX fiches, donc l'abstention. Mesuré : 259 documents. */
  it('⚠️ un nom contenu dans un autre nom produit deux fiches, donc l’abstention', () => {
    const emboites = annuaire([
      ['a@exemple.test', [fiche('locataire', 'l-court', 'REAL Luis')]],
      ['b@exemple.test', [fiche('locataire', 'l-long', 'REAL Luis Carlos')]],
    ]);
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: emboites, nosAdresses: NOUS,
      objet: 'Quittance REAL Luis Carlos', indexNoms: indexerNoms(emboites),
    });
    expect(a.sorte).toBe('non_attribue');
  });

  it('⚠️ un nom d’un seul mot n’est jamais un nom : il ne range rien', () => {
    const court = annuaire([['a@exemple.test', [fiche('locataire', 'l-x', 'DUPONT')]]]);
    expect(indexerNoms(court).size).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES GARANTS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② un document de garant : la fiche du LOCATAIRE, avec la mention', () => {
  it('🔴 les sous-types de garant sont reconnus', () => {
    for (const t of SOUS_TYPES_GARANT) {
      expect(estDocumentGarant(`Document CRITERIMMO - ${t.code} - ${t.libelle}`)).toBe(true);
    }
    expect(estDocumentGarant('Document CRITERIMMO - R21 - Rappel garant')).toBe(true);
    expect(estDocumentGarant('Acte de cautionnement VISALE')).toBe(true);
    expect(estDocumentGarant('CAUTION GARANT ME')).toBe(true);
  });

  /**
   * ⚠️ « GARANTIE » N'EST PAS « GARANT ». Une garantie décennale est un contrat, pas une caution : la confondre
   * ferait porter la mention « envoyé au garant » à des documents qui ne partent chez personne de tel.
   */
  it('⚠️ une « garantie » n’est pas un garant', () => {
    expect(estDocumentGarant('Attestation de garantie décennale')).toBe(false);
    expect(estDocumentGarant('Quittance DUPONT Jean-Paul')).toBe(false);
  });

  it('🔴 rangé dans la fiche du locataire, et le document porte la mention', () => {
    const a = attribuer({
      destinataires: ['jp.dupont@exemple.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Document CRITERIMMO - RMH31 - Notification garant Mise en demeure MRH DUPONT Jean-Paul',
      indexNoms: INDEX,
    });
    expect(a.sorte).toBe('fiche');
    if (a.sorte !== 'fiche') return;
    expect(a.fiche.sorte).toBe('locataire');
    expect(a.garant).toBe(true);
    expect(MENTION_GARANT).toBe('envoyé au garant');
  });

  it('🔴 un garant inconnu part dans la Réception, en restant marqué « garant »', () => {
    const a = attribuer({
      destinataires: ['caution@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Document CRITERIMMO - RMH21 - Notification garant Rappel simple MRH', indexNoms: INDEX,
    });
    expect(a.sorte).toBe('non_attribue');
    expect(a.garant).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LE RESTE VA DANS LA RÉCEPTION — ET L'INVARIANT QUI LE TIENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('③ tout le reste va dans la Réception', () => {
  it('🔴 ni adresse ni nom → non attribué', () => {
    const a = attribuer({
      destinataires: ['inconnu@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Document CRITERIMMO - R10 - Relance simple locataire', indexNoms: INDEX,
    });
    expect(a.sorte).toBe('non_attribue');
    expect(a.sorte === 'non_attribue' && a.motif).toBe('adresse_inconnue');
  });

  /**
   * ══ 🔴🔴 L'INVARIANT DU LOT, RELU DANS LE CODE ═══════════════════════════════════════════════════════════════
   *
   *     UN DOCUMENT EST CACHÉ DANS « COURRIER AUTOMATIQUE » SI ET SEULEMENT S'IL EST RANGÉ DANS UNE FICHE.
   *
   * Les deux sens comptent, et c'est le second qu'on oublie : sans `remettreEnAutomatique`, un document rangé
   * APRÈS être parti en Réception y resterait pour toujours, et la Réception ne se viderait jamais — alors
   * qu'Arno demande qu'il « quitte alors la Réception pour sa fiche ».
   */
  it('🔴🔴 le rangement sait rendre visible ET remettre en « Courrier automatique »', () => {
    const repo = readFileSync('app/lib/gestion/documentsAutoRepo.ts', 'utf8');
    expect(repo).toContain('async function rendreVisible');
    expect(repo).toContain('async function remettreEnAutomatique');
    // Rendre visible = effacer l'exclusion ; la remettre = la réécrire AVEC sa règle et son motif.
    expect(repo.replace(/\s+/g, ' ')).toContain(
      'SET exclu_le = NULL, exclu_par_regle_id = NULL, exclu_motif = NULL');
    expect(repo.replace(/\s+/g, ' ')).toContain('SET exclu_le = now(), exclu_par_regle_id = $2');
  });

  /**
   * 🔴 LE COMPTEUR « NON LUS » NE PEUT PAS BOUGER, et ce n'est pas une opinion : un document est un message
   * ENVOYÉ, et le prédicat du non-lu exige `sens = 'recu'`. Arno a posé « sans gonfler le compteur non lus » —
   * ce test relie sa demande à la ligne de code qui la tient, pour que personne ne la desserre par mégarde.
   */
  it('🔴🔴 un envoi ne peut jamais être « non lu » — la demande d’Arno tient par construction', () => {
    const lecture = readFileSync('app/lib/gestion/lectureRepo.ts', 'utf8');
    expect(lecture.replace(/\s+/g, ' ')).toContain("mm.sens = 'recu'");
  });

  /** ⚠️ Le document se repère par ce qu'il EST, non par l'endroit où il se trouve — sinon on ne le relit jamais. */
  it('⚠️ les documents se relisent même une fois sortis de « Courrier automatique »', () => {
    const repo = readFileSync('app/lib/gestion/documentsAutoRepo.ts', 'utf8');
    expect(repo.replace(/\s+/g, ' ')).toContain(
      "(m.exclu_par_regle_id = $1 OR m.objet ILIKE '%Document CRITERIMMO%')");
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ UNE FICHE COMPLÉTÉE PLUS TARD RANGE LES DOCUMENTS DEVENUS CERTAINS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ une fiche complétée range ce qui était en Réception', () => {
  /**
   * 🔴 LE SCÉNARIO D'ARNO, JOUÉ EN ENTIER. Un document part en Réception faute d'adresse connue ; Arno ajoute
   * l'adresse à la fiche ; le même document, relu, trouve sa fiche. C'est la raison d'être de la liste CSV.
   */
  it('🔴 ajouter l’adresse à la fiche suffit à ranger le document', () => {
    const avant = attribuer({
      destinataires: ['nouveau@ailleurs.test'], annuaire: ANNUAIRE_COMPLET, nosAdresses: NOUS,
      objet: 'Document CRITERIMMO - R10 - Relance simple locataire', indexNoms: INDEX,
    });
    expect(avant.sorte).toBe('non_attribue');

    const complete = annuaire([
      ...[...ANNUAIRE_COMPLET.entries()].map(([k, v]) => [k, [...v]] as [string, FicheDestinataire[]]),
      ['nouveau@ailleurs.test', [DUPONT]],
    ]);
    const apres = attribuer({
      destinataires: ['nouveau@ailleurs.test'], annuaire: complete, nosAdresses: NOUS,
      objet: 'Document CRITERIMMO - R10 - Relance simple locataire', indexNoms: indexerNoms(complete),
    });
    expect(apres.sorte === 'fiche' && apres.fiche.cle).toBe('l-dupont');
  });

  /** ⚠️ Et la relève doit repasser dessus : sans cette passe, la fiche complétée ne rangerait jamais rien. */
  it('🔴 la relève continue range les documents au fil de l’eau', () => {
    const releve = readFileSync('app/scripts/relever-gestion-continu.ts', 'utf8');
    expect(releve).toContain('rangerLesDocuments');
    expect(releve).toContain('seulementNonRanges: true');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA LISTE POUR ARNO — LES NOMS LUS DANS LES OBJETS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⑤ les noms lus dans les objets', () => {
  it('🔴 un nom absent de l’annuaire est tout de même lu', () => {
    expect(nomsPropresDans('Document CRITERIMMO - Août 2025 BAROUK Alexis')).toEqual(['BAROUK Alexis']);
  });

  /** ⚠️ Un mois ARRÊTE le nom, sinon la liste compte un « nom » par mois pour la même personne. */
  it('⚠️ le mois n’entre pas dans le nom', () => {
    expect(nomsPropresDans('BAROUK Alexis Novembre 2025')).toEqual(['BAROUK Alexis']);
  });

  it('⚠️ les sigles du métier ne sont pas des noms', () => {
    expect(nomsPropresDans('RMH21 - Notification garant Rappel simple MRH')).toEqual([]);
    expect(nomsPropresDans('R10 - Relance simple locataire')).toEqual([]);
    expect(nomsPropresDans('Transmission de l’avis de taxe foncière 2025')).toEqual([]);
  });

  it('🔴 la « fiche probable » rapproche par le patronyme, et ne range RIEN', () => {
    const proches = fichesProchesDe('MARTIN Jean-Claude', INDEX);
    expect(proches.map((f) => f.cle)).toEqual(['l-martin']);
    // 🔴 Le rapprochement est une ressemblance : le rangement, lui, exige le nom complet exact.
    expect(fichesNommeesDans('Quittance MARTIN Jean-Claude', INDEX)).toEqual([]);
  });

  it('⚠️ normaliserNom met bien deux écritures du même nom sous la même forme', () => {
    expect(normaliserNom('VALET / RAEPSAET Damien et Michelle'))
      .toBe(normaliserNom('Valet Raepsaet Damien ET Michelle'));
    expect(normaliserNom('BAGHUELOU Jean-René')).toBe('baghuelou jean rene');
  });
});
