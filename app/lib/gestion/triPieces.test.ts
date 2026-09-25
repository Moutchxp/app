import { describe, it, expect } from 'vitest';
import {
  adresseCitee, adressesCles, cheminDestination, destinationMajoritaire, estAdresseMaison, lotsRapprochablesParAdresse,
  memeDestination, nomCite, nonRattache, occupeALaDate, proprietaireCommun, reglerParAdresse, trierPieces,
  type AnnuaireTri, type Destination, type PieceATrier,
} from './triPieces';
import { normaliserTexte } from './annuaire';

/**
 * LOT DRIVE-1 — LE MOTEUR DE TRI, ÉPROUVÉ RÈGLE PAR RÈGLE, SANS BASE NI RÉSEAU.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : noms, adresses et e-mails inventés (domaine `fictif.fr`).
 *
 * 🔴 CE QUI EST ÉPROUVÉ, ET POURQUOI CHAQUE CAS COMPTE :
 *   ① nos propres adresses ne rattachent RIEN — sans quoi tout irait au même endroit ;
 *   ② la DATE décide de quel bien il s'agit, pas le dernier bail connu ;
 *   ③ une contradiction ne donne jamais « la première » réponse ;
 *   ④ les règles s'appliquent dans l'ordre a → b → c → d, et pas dans un autre ;
 *   ⑤ ce qu'on ne sait pas classer part en « 00 Non rattachés / AAAA / MM » — retrouvable, jamais deviné.
 */

// ── UN ANNUAIRE FICTIF ────────────────────────────────────────────────────────────────────────────────────────────
// DUPONT (prop 1) a DEUX biens : lot 100 et lot 101.  MARTIN (prop 2) n'a QUE le lot 200.
const ANNUAIRE: AnnuaireTri = {
  adressesMaison: ['gestion@criterimmo.fr'],
  contacts: [
    { email: 'jean@fictif.fr', role: 'proprietaire', sujetId: 1 },
    { email: 'claire@fictif.fr', role: 'proprietaire', sujetId: 2 },
    { email: 'alice@fictif.fr', role: 'locataire', sujetId: 10 },
    { email: 'marc@fictif.fr', role: 'locataire', sujetId: 11 },
    { email: 'zoe@fictif.fr', role: 'locataire', sujetId: 12 },
  ],
  proprietaires: [
    { id: 1, cle: 'P1', nomNormalise: 'dupont jean', lots: ['100', '101'] },
    { id: 2, cle: 'P2', nomNormalise: 'martin claire', lots: ['200'] },
    { id: 3, cle: 'P3', nomNormalise: 'sansbien paul', lots: [] },
  ],
  locataires: [
    { id: 10, nomNormalise: 'bernard alice' },
    { id: 11, nomNormalise: 'petit marc' },
    { id: 12, nomNormalise: 'roux zoe' },
  ],
  lots: [
    { cle: '100', proprietaireCle: 'P1', adresse: '4 rue Fictive', codePostal: '92800', commune: 'PUTEAUX' },
    { cle: '101', proprietaireCle: 'P1', adresse: '4 rue Fictive', codePostal: '92800', commune: 'PUTEAUX' },
    { cle: '200', proprietaireCle: 'P2', adresse: '9 allée Imaginaire', codePostal: '92400', commune: 'COURBEVOIE' },
  ],
  occupations: [
    // Alice : lot 100 de 2019 à 2022, puis lot 101 depuis 2023. La DATE décide.
    { locataireId: 10, lotCle: '100', proprietaireCle: 'P1', entree: '2019-02-01', sortie: '2022-08-31' },
    { locataireId: 10, lotCle: '101', proprietaireCle: 'P1', entree: '2023-03-01', sortie: null },
    // Marc occupe DEUX biens en même temps, du même propriétaire.
    { locataireId: 11, lotCle: '100', proprietaireCle: 'P1', entree: '2024-01-01', sortie: null },
    { locataireId: 11, lotCle: '101', proprietaireCle: 'P1', entree: '2024-01-01', sortie: null },
    // Zoé occupe deux biens de propriétaires DIFFÉRENTS : contradiction irréductible.
    { locataireId: 12, lotCle: '100', proprietaireCle: 'P1', entree: '2024-01-01', sortie: null },
    { locataireId: 12, lotCle: '200', proprietaireCle: 'P2', entree: '2024-01-01', sortie: null },
  ],
};

const piece = (o: Partial<PieceATrier> = {}): PieceATrier => ({
  pieceId: 1, messageId: 1, filId: 1, date: '2024-06-15', sens: 'recu',
  expediteur: 'alice@fictif.fr', destinataires: ['gestion@criterimmo.fr'],
  objet: '', corps: '', stockee: true, ...o,
});

const dest = (d: Destination): string => JSON.stringify(d);

describe('🔴 ① nos propres adresses ne rattachent RIEN', () => {
  it('gestion@, @criterimmo.fr et @sansvisavis.com sont écartées', () => {
    for (const a of ['gestion@criterimmo.fr', 'compta@criterimmo.fr', 'a.jorel@sansvisavis.com', 'x@mail.sansvisavis.com']) {
      expect(estAdresseMaison(a, ANNUAIRE.adressesMaison), a).toBe(true);
    }
    expect(estAdresseMaison('alice@fictif.fr', ANNUAIRE.adressesMaison)).toBe(false);
  });

  it('un mail REÇU n’est jugé que sur son EXPÉDITEUR', () => {
    const p = piece({ sens: 'recu', expediteur: 'alice@fictif.fr', destinataires: ['jean@fictif.fr'] });
    expect(adressesCles(p, ANNUAIRE.adressesMaison)).toEqual(['alice@fictif.fr']);
  });

  it('un mail ENVOYÉ est jugé sur ses DESTINATAIRES, jamais sur nous', () => {
    const p = piece({ sens: 'envoye', expediteur: 'gestion@criterimmo.fr', destinataires: ['jean@fictif.fr', 'gestion@criterimmo.fr'] });
    expect(adressesCles(p, ANNUAIRE.adressesMaison)).toEqual(['jean@fictif.fr']);
  });

  it('un mail entièrement interne n’a AUCUNE clé, et part donc vers les règles suivantes', () => {
    const p = piece({ sens: 'envoye', expediteur: 'gestion@criterimmo.fr', destinataires: ['compta@criterimmo.fr'] });
    expect(adressesCles(p, ANNUAIRE.adressesMaison)).toEqual([]);
    expect(reglerParAdresse(p, ANNUAIRE)).toBeNull();
  });
});

describe('🔴 ② la DATE décide de quel bien il s’agit', () => {
  it('un mail de 2021 va sur le bien qu’Alice occupait EN 2021', () => {
    const d = trierPieces([piece({ date: '2021-05-04' })], ANNUAIRE)[0];
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '100' }));
    expect(d.regle).toBe('a');
    expect(d.confiance).toBe('haute');
  });

  it('un mail de 2024 va sur le bien qu’elle occupe DEPUIS 2023 — pas le même', () => {
    const d = trierPieces([piece({ date: '2024-06-15' })], ANNUAIRE)[0];
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '101' }));
  });

  it('un mail ENTRE les deux baux retombe sur la dernière occupation, avec une confiance BASSE', () => {
    const d = trierPieces([piece({ date: '2022-11-20' })], ANNUAIRE)[0];
    expect(d.confiance).toBe('basse');
    expect(d.motif).toContain('aucun bail en cours à la date du mail');
  });

  it('les bornes du bail sont incluses des deux côtés', () => {
    const o = { locataireId: 10, lotCle: '100', proprietaireCle: 'P1', entree: '2019-02-01', sortie: '2022-08-31' };
    expect(occupeALaDate(o, '2019-02-01')).toBe(true);
    expect(occupeALaDate(o, '2022-08-31')).toBe(true);
    expect(occupeALaDate(o, '2019-01-31')).toBe(false);
    expect(occupeALaDate(o, '2022-09-01')).toBe(false);
  });

  it('un bail sans date d’entrée ni de sortie ne borne rien : il vaut toujours', () => {
    expect(occupeALaDate({ locataireId: 1, lotCle: 'x', proprietaireCle: null, entree: null, sortie: null }, '1999-01-01'))
      .toBe(true);
  });
});

describe('🔴 ③ une contradiction ne donne JAMAIS « la première » réponse', () => {
  it('un locataire de deux biens du MÊME propriétaire → chez le propriétaire', () => {
    const d = trierPieces([piece({ expediteur: 'marc@fictif.fr' })], ANNUAIRE)[0];
    expect(dest(d.destination)).toBe(dest({ sorte: 'proprietaire', cle: 'P1' }));
    expect(d.motif).toContain('propriétaire commun');
  });

  it('🔴 un locataire de deux biens de propriétaires DIFFÉRENTS → « 00 Non rattachés »', () => {
    const d = trierPieces([piece({ expediteur: 'zoe@fictif.fr', filId: null })], ANNUAIRE)[0];
    expect(d.destination.sorte).toBe('non_rattache');
    expect(d.motif).toContain('non tranché');
  });

  it('deux adresses connues qui désignent des dossiers différents → « 00 Non rattachés »', () => {
    const p = piece({ sens: 'envoye', expediteur: 'gestion@criterimmo.fr', filId: null,
      destinataires: ['jean@fictif.fr', 'claire@fictif.fr'] });
    const d = trierPieces([p], ANNUAIRE)[0];
    expect(d.destination.sorte).toBe('non_rattache');
  });

  it('deux adresses qui désignent des biens d’un MÊME propriétaire → chez lui', () => {
    const annuaire: AnnuaireTri = {
      ...ANNUAIRE,
      contacts: [...ANNUAIRE.contacts, { email: 'autre@fictif.fr', role: 'locataire', sujetId: 13 }],
      locataires: [...ANNUAIRE.locataires, { id: 13, nomNormalise: 'autre pierre' }],
      occupations: [...ANNUAIRE.occupations,
        { locataireId: 13, lotCle: '100', proprietaireCle: 'P1', entree: '2024-01-01', sortie: null }],
    };
    const p = piece({ sens: 'envoye', expediteur: 'gestion@criterimmo.fr',
      destinataires: ['alice@fictif.fr', 'autre@fictif.fr'] });
    const d = trierPieces([p], annuaire)[0];
    expect(dest(d.destination)).toBe(dest({ sorte: 'proprietaire', cle: 'P1' }));
  });

  it('le propriétaire commun n’existe que s’il est VRAIMENT commun', () => {
    expect(proprietaireCommun(['P1', 'P1'])).toBe('P1');
    expect(proprietaireCommun(['P1', 'P2'])).toBeNull();
    expect(proprietaireCommun(['P1', null])).toBe('P1');
    expect(proprietaireCommun([null, null])).toBeNull();
  });
});

describe('l’adresse d’un PROPRIÉTAIRE', () => {
  it('un seul bien → le bien ; plusieurs biens → chez lui', () => {
    expect(dest(trierPieces([piece({ expediteur: 'claire@fictif.fr' })], ANNUAIRE)[0].destination))
      .toBe(dest({ sorte: 'bien', cle: '200' }));
    expect(dest(trierPieces([piece({ expediteur: 'jean@fictif.fr' })], ANNUAIRE)[0].destination))
      .toBe(dest({ sorte: 'proprietaire', cle: 'P1' }));
  });

  it('un propriétaire SANS bien en gestion va chez lui, avec une confiance moindre', () => {
    const annuaire: AnnuaireTri = {
      ...ANNUAIRE, contacts: [...ANNUAIRE.contacts, { email: 'paul@fictif.fr', role: 'proprietaire', sujetId: 3 }],
    };
    const d = trierPieces([piece({ expediteur: 'paul@fictif.fr' })], annuaire)[0];
    expect(dest(d.destination)).toBe(dest({ sorte: 'proprietaire', cle: 'P3' }));
    expect(d.confiance).toBe('moyenne');
  });
});

describe('🔴 ④ RÈGLE b — l’échange, et seulement quand a a échoué', () => {
  it('un mail sans correspondance hérite du rattachement de ses voisins de fil', () => {
    const connus = piece({ pieceId: 1, messageId: 1, filId: 7, expediteur: 'claire@fictif.fr' });
    const inconnu = piece({ pieceId: 2, messageId: 2, filId: 7, expediteur: 'artisan@fictif.fr' });
    const ds = trierPieces([connus, inconnu], ANNUAIRE);
    expect(ds[1].regle).toBe('b');
    expect(dest(ds[1].destination)).toBe(dest({ sorte: 'bien', cle: '200' }));
    expect(ds[1].motif).toContain('hérité');
  });

  it('la règle a PRIME : un mail dont l’adresse est connue n’hérite de rien', () => {
    const a = piece({ pieceId: 1, messageId: 1, filId: 8, expediteur: 'claire@fictif.fr' });
    const b = piece({ pieceId: 2, messageId: 2, filId: 8, expediteur: 'jean@fictif.fr' });
    const ds = trierPieces([a, b], ANNUAIRE);
    expect(ds[1].regle).toBe('a');
    expect(dest(ds[1].destination)).toBe(dest({ sorte: 'proprietaire', cle: 'P1' }));
  });

  it('une ÉGALITÉ dans le fil ne fait pas majorité — le mail continue vers les renforts', () => {
    expect(destinationMajoritaire([{ sorte: 'bien', cle: '100' }, { sorte: 'bien', cle: '200' }])).toBeNull();
    expect(destinationMajoritaire([])).toBeNull();
    expect(destinationMajoritaire([
      { sorte: 'bien', cle: '100' }, { sorte: 'bien', cle: '100' }, { sorte: 'bien', cle: '200' },
    ])?.compte).toBe(2);
  });

  it('un mail sans fil n’hérite de rien', () => {
    const d = trierPieces([piece({ filId: null, expediteur: 'artisan@fictif.fr' })], ANNUAIRE)[0];
    expect(d.regle).not.toBe('b');
  });
});

describe('🔴 RÈGLE c — les renforts, dans l’ordre', () => {
  const inconnu = { expediteur: 'artisan@fictif.fr', filId: null as number | null };

  it('c.1 — l’adresse de la carte d’événement de l’échange', () => {
    const d = trierPieces([piece({ ...inconnu, evenementAdresse: '9 allée Imaginaire, 92400 COURBEVOIE' })], ANNUAIRE)[0];
    expect(d.regle).toBe('c');
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '200' }));
  });

  it('c.2 — une adresse de bien citée dans le corps (cas des mails de syndic)', () => {
    const d = trierPieces([piece({ ...inconnu, corps: 'Bonjour, concernant le 9 allée Imaginaire 92400 COURBEVOIE, …' })], ANNUAIRE)[0];
    expect(d.regle).toBe('c');
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '200' }));
  });

  it('🔴 une adresse partagée par DEUX lots du même propriétaire → chez lui, jamais l’un des deux au hasard', () => {
    const d = trierPieces([piece({ ...inconnu, corps: 'le 4 rue Fictive 92800 PUTEAUX' })], ANNUAIRE)[0];
    expect(dest(d.destination)).toBe(dest({ sorte: 'proprietaire', cle: 'P1' }));
  });

  it('c.3 — un nom dans l’OBJET, et seulement dans l’objet', () => {
    const d = trierPieces([piece({ ...inconnu, objet: 'Dossier MARTIN Claire — relance' })], ANNUAIRE)[0];
    expect(d.regle).toBe('c');
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '200' }));
    // Le même nom dans le CORPS ne suffit pas : signatures, citations et pieds de page en sont pleins.
    const e = trierPieces([piece({ ...inconnu, corps: 'Dossier MARTIN Claire' })], ANNUAIRE)[0];
    expect(e.regle).toBe('d');
  });

  it('les renforts ne servent QUE si a et b ont échoué', () => {
    const d = trierPieces([piece({ expediteur: 'claire@fictif.fr', corps: 'le 4 rue Fictive 92800 PUTEAUX' })], ANNUAIRE)[0];
    expect(d.regle).toBe('a');
  });
});

/**
 * 🔴 CORRECTIF DU 26/09/2026, MESURÉ SUR LES 26 811 PIÈCES RÉELLES. L'adresse de l'agence figure dans la signature
 * de chaque mail sortant ; comme un lot géré s'y trouve, la règle c.2 la reconnaissait et y envoyait **1 853
 * pièces**, toutes à tort — 49 % de tout ce que la règle c rattachait. Une signature dit qui envoie, pas de quoi
 * le mail parle. C'est la même doctrine que pour nos adresses e-mail : ce qui est à nous n'est pas une clé.
 */
describe('🔴 notre propre adresse POSTALE n’est pas une clé non plus', () => {
  const avecAgence: AnnuaireTri = {
    ...ANNUAIRE,
    lots: [...ANNUAIRE.lots,
      { cle: '494', proprietaireCle: 'P2', adresse: '2 rue Agence', codePostal: '92800', commune: 'PUTEAUX' }],
    adressesPostalesMaison: ['2 rue Agence'],
  };
  const signature = 'Service Gestion 2 rue Agence, 92800 PUTEAUX';

  it('l’adresse de l’agence citée dans une signature ne rattache RIEN', () => {
    const d = trierPieces([piece({ filId: null, expediteur: 'artisan@fictif.fr', corps: signature })], avecAgence)[0];
    expect(d.regle).toBe('d');
    expect(d.destination.sorte).toBe('non_rattache');
  });

  it('sans l’exclusion, la même pièce serait rattachée à tort — c’est bien elle qui protège', () => {
    const sansExclusion: AnnuaireTri = { ...avecAgence, adressesPostalesMaison: [] };
    const d = trierPieces([piece({ filId: null, expediteur: 'artisan@fictif.fr', corps: signature })], sansExclusion)[0];
    expect(d.regle).toBe('c');
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '494' }));
  });

  it('le lot de l’agence GARDE son dossier : il est seulement exclu du rapprochement PAR ADRESSE', () => {
    const rapprochables = lotsRapprochablesParAdresse(avecAgence);
    expect(rapprochables.some((l) => l.cle === '494')).toBe(false);
    expect(avecAgence.lots.some((l) => l.cle === '494')).toBe(true);
  });

  it('il reste joignable par la règle a — ses vrais mails ne sont pas perdus', () => {
    const annuaire: AnnuaireTri = {
      ...avecAgence,
      proprietaires: avecAgence.proprietaires.map((p) => (p.cle === 'P2' ? { ...p, lots: ['494'] } : p)),
    };
    const d = trierPieces([piece({ expediteur: 'claire@fictif.fr' })], annuaire)[0];
    expect(d.regle).toBe('a');
    expect(dest(d.destination)).toBe(dest({ sorte: 'bien', cle: '494' }));
  });

  it('sans adresse d’agence déclarée, tous les lots restent rapprochables', () => {
    expect(lotsRapprochablesParAdresse(ANNUAIRE)).toHaveLength(ANNUAIRE.lots.length);
  });
});

describe('le rapprochement d’adresse — jamais approché au jugé', () => {
  const lot = ANNUAIRE.lots[2];   // 9 allée Imaginaire, 92400 COURBEVOIE

  it('il faut le NUMÉRO, un mot distinctif de la VOIE, et le code postal ou la commune', () => {
    expect(adresseCitee(lot, normaliserTexte('9 allée Imaginaire 92400'))).toBe(true);
    expect(adresseCitee(lot, normaliserTexte('9 allee imaginaire courbevoie'))).toBe(true);
  });

  it('le numéro SEUL ne suffit pas — il apparaît partout', () => {
    expect(adresseCitee(lot, normaliserTexte('facture n° 9 du mois'))).toBe(false);
  });

  it('la voie SANS le numéro ne suffit pas — elle désigne tout l’immeuble', () => {
    expect(adresseCitee(lot, normaliserTexte('allée Imaginaire 92400 COURBEVOIE'))).toBe(false);
  });

  it('la voie et le numéro SANS le lieu ne suffisent pas', () => {
    expect(adresseCitee(lot, normaliserTexte('9 allée Imaginaire'))).toBe(false);
  });

  it('un lot sans adresse ne peut jamais être cité', () => {
    expect(adresseCitee({ cle: 'x', proprietaireCle: null, adresse: null, codePostal: null, commune: null }, 'quoi que ce soit'))
      .toBe(false);
  });

  it('un nom cité exige tous ses mots, et au moins un de cinq lettres', () => {
    expect(nomCite('martin claire', new Set(['dossier', 'martin', 'claire']))).toBe(true);
    expect(nomCite('martin claire', new Set(['martin']))).toBe(false);
    expect(nomCite('li wu', new Set(['li', 'wu']))).toBe(false);   // trop court pour être distinctif
  });
});

describe('🔴 ⑤ « 00 Non rattachés » — une réponse, pas un échec', () => {
  it('sans rien de reconnaissable, la pièce va en AAAA / MM', () => {
    const d = trierPieces([piece({ filId: null, expediteur: 'inconnu@ailleurs.fr', objet: 'Publicité' })], ANNUAIRE)[0];
    expect(d.regle).toBe('d');
    expect(d.destination).toEqual({ sorte: 'non_rattache', annee: '2024', mois: '06' });
  });

  it('une date illisible ne fait pas perdre la pièce : elle a quand même un dossier', () => {
    expect(nonRattache('pas une date')).toEqual({ sorte: 'non_rattache', annee: 'date inconnue', mois: '00' });
  });

  it('les pièces SANS contenu stocké sont décidées comme les autres, et marquées', () => {
    const d = trierPieces([piece({ stockee: false })], ANNUAIRE)[0];
    expect(d.stockee).toBe(false);
    expect(d.destination.sorte).toBe('bien');
  });

  it('chaque pièce reçoit UNE décision, et une seule', () => {
    const pieces = [piece({ pieceId: 1 }), piece({ pieceId: 2, expediteur: 'jean@fictif.fr' }),
      piece({ pieceId: 3, filId: null, expediteur: 'x@ailleurs.fr' })];
    const ds = trierPieces(pieces, ANNUAIRE);
    expect(ds).toHaveLength(3);
    expect(new Set(ds.map((d) => d.pieceId)).size).toBe(3);
  });
});

describe('les chemins lisibles du rapport', () => {
  const biens = new Map([['100', '4 rue Fictive — lot 100']]);
  const props = new Map([['P1', 'DUPONT Jean (1)']]);

  it('un bien mène à son « En attente », jamais à « Travaux » ni « Litige »', () => {
    const c = cheminDestination({ sorte: 'bien', cle: '100' }, biens, props);
    expect(c).toBe('2 Biens immobiliers/4 rue Fictive — lot 100/En attente');
    expect(c).not.toContain('Travaux');
  });

  it('un propriétaire aussi', () => {
    expect(cheminDestination({ sorte: 'proprietaire', cle: 'P1' }, biens, props))
      .toBe('1 Propriétaires/DUPONT Jean (1)/En attente');
  });

  it('un non-rattaché porte son année et son mois', () => {
    expect(cheminDestination({ sorte: 'non_rattache', annee: '2024', mois: '06' }, biens, props))
      .toBe('00 Non rattachés/2024/06');
  });

  it('deux destinations se comparent sans se tromper de sorte', () => {
    expect(memeDestination({ sorte: 'bien', cle: '1' }, { sorte: 'bien', cle: '1' })).toBe(true);
    expect(memeDestination({ sorte: 'bien', cle: '1' }, { sorte: 'proprietaire', cle: '1' })).toBe(false);
    expect(memeDestination({ sorte: 'non_rattache', annee: '2024', mois: '06' },
      { sorte: 'non_rattache', annee: '2024', mois: '07' })).toBe(false);
  });
});
