import { describe, expect, it } from 'vitest';
import {
  alertesDuCompteRendu, AVERTISSEMENT_SANS_EDL_JOINT, coordonneesDeTiers, paragraphePiecesLocataire, paragraphePiecesProprietaire, estEtatDesLieux, etatRetenue, mailsValidationSortie, MOTIF_RETENUE_IMPOSSIBLE, PARAGRAPHE_RETENUE_LOCATAIRE,
  PHRASE_RETENUE_PROPRIETAIRE, texteProprietaire, PIECE_MAX_OCTETS, PIECES_MAX_OCTETS, refusPiece, typePiece, verifierValidation, type PartieSortie,
} from './validationSortie';

/** 🔴🔴 Arno (11/11/2026, lot 4) — « Valider l'état des lieux de sortie » : contrôles, alerte de coordonnées, confidentialité des mails. PUR. */
const ALICE: PartieSortie = { cle: 'loc-11', famille: 'locataire', nom: 'BERNARD Alice', prenom: null, emails: ['alice@exemple.test'], telephones: ['06 55 66 77 88'], occupationId: 11 };
const PAUL: PartieSortie = { cle: 'loc-12', famille: 'locataire', nom: 'BERNARD Paul', prenom: null, emails: ['paul@exemple.test'], telephones: ['07 01 02 03 04'], occupationId: 12 };
const JEAN: PartieSortie = { cle: 'pro-5', famille: 'proprietaire', nom: 'DUPONT Jean', prenom: null, emails: ['jean@exemple.test'], telephones: ['06 11 22 33 44'], proprietaireId: 5 };
const MARIE: PartieSortie = { cle: 'pro-6', famille: 'proprietaire', nom: 'DUPONT Marie', prenom: null, emails: ['marie@exemple.test'], telephones: [], proprietaireId: 6 };
const TOUS = [ALICE, PAUL, JEAN, MARIE];
const D = (o: Partial<Parameters<typeof mailsValidationSortie>[0]> = {}) => ({
  adresse: '4 rue Fictive, 92800 Puteaux', date: '2026-11-10', compteRendu: 'Logement rendu propre.\n\nCompteurs relevés.', vacant: true, copropriete: false,
  destinataires: [] as PartieSortie[], sortants: [ALICE, PAUL], expediteur: 'gestion@exemple.test', qui: { email: 'arno@exemple.test', nom: 'Arno Test' },
  signature: { html: '', texte: '' }, internes: ['gestion@exemple.test', 'arno@exemple.test'], ...o,
});
const coordonneesDe = (p: PartieSortie): string[] => [p.nom, ...p.nom.split(' '), ...p.emails, ...p.telephones];

describe('la saisie', () => {
  it('case « réalisé » obligatoire ; date obligatoire et jamais dans le futur ; au moins un locataire', () => {
    const ok = { realise: true, date: '2026-11-10', sortants: [11], compteRendu: '' };
    expect(verifierValidation(ok, '2026-11-11')).toEqual({ ok: true });
    expect(verifierValidation({ ...ok, realise: false }, '2026-11-11')).toMatchObject({ ok: false, champ: 'realise' });
    expect(verifierValidation({ ...ok, date: '' }, '2026-11-11')).toMatchObject({ ok: false, champ: 'date' });
    expect(verifierValidation({ ...ok, date: '2026-11-12' }, '2026-11-11')).toMatchObject({ ok: false, motif: 'La date de sortie effective ne peut pas être dans le futur.' });
    expect(verifierValidation({ ...ok, date: '2026-11-11' }, '2026-11-11')).toEqual({ ok: true });
    expect(verifierValidation({ ...ok, sortants: [] }, '2026-11-11')).toMatchObject({ ok: false, champ: 'locataires' });
  });
});

describe('🔴 l’alerte : les coordonnées d’une autre partie dans le compte rendu', () => {
  it('nom (accents et casse ignorés), téléphone (autre écriture), e-mail — jamais le destinataire lui-même', () => {
    expect(coordonneesDeTiers('Vu avec M. Dupont sur place.', ALICE, TOUS).map((x) => [x.cle, x.quoi])).toEqual([['pro-5', ['nom']], ['pro-6', ['nom']]]);
    expect(coordonneesDeTiers('Rappeler au +33 6 11 22 33 44', ALICE, TOUS).map((x) => [x.cle, x.quoi])).toEqual([['pro-5', ['telephone']]]);
    expect(coordonneesDeTiers('Écrire à JEAN@exemple.test', PAUL, TOUS).map((x) => x.cle)).toEqual(['pro-5']);
    expect(coordonneesDeTiers('Paul a rendu les clés.', ALICE, TOUS).map((x) => [x.cle, x.quoi])).toEqual([['loc-12', ['nom']]]);
    // Son propre nom, son propre numéro : rien.
    expect(coordonneesDeTiers('Alice Bernard, 06.55.66.77.88, alice@exemple.test', ALICE, TOUS)).toEqual([]);
    // Le nom de famille PARTAGÉ (deux époux) n'est pas une coordonnée d'un tiers ; le prénom de l'autre, si.
    expect(coordonneesDeTiers('Madame Dupont était présente.', JEAN, TOUS).map((x) => x.cle)).toEqual([]);
    expect(coordonneesDeTiers('Texte sans aucun nom.', ALICE, TOUS)).toEqual([]);
  });
  it('une alerte par destinataire coché, avec la phrase « Attention : ce texte contient les coordonnées de … »', () => {
    const a = alertesDuCompteRendu('Clés remises à Jean Dupont.', [ALICE, JEAN], TOUS);
    expect(a.map((x) => x.cle)).toEqual(['loc-11']);
    expect(a[0].phrase).toBe('Attention : ce texte contient les coordonnées de Jean DUPONT (nom).');
  });
});

describe('🔴 les mails : un par destinataire, aucune coordonnée d’un tiers, copie interne', () => {
  it('aucun destinataire coché : la copie interne SEULE (gestion@ et la personne qui valide)', () => {
    const m = mailsValidationSortie(D());
    expect(m.parties).toEqual([]);
    expect(m.interne?.a).toEqual(['gestion@exemple.test', 'arno@exemple.test']);
    expect(m.interne?.sorte).toBe('sortie_edls_interne');
    expect(m.interne?.texte).toContain('Aucun mail aux locataires ni aux propriétaires : copie interne seule.');
  });
  it('avec destinataires : LOCATAIRES puis PROPRIÉTAIRES, un seul destinataire par mail, aucune copie ; le locataire ne lit rien du propriétaire ni de l’autre locataire, et inversement', () => {
    const m = mailsValidationSortie(D({ destinataires: [JEAN, ALICE, MARIE, PAUL] }));
    expect(m.parties.map((x) => [x.partie.cle, x.mail.sorte, x.mail.a, x.mail.cc])).toEqual([
      ['loc-11', 'sortie_edls_locataire', ['alice@exemple.test'], []], ['loc-12', 'sortie_edls_locataire', ['paul@exemple.test'], []],
      ['pro-5', 'sortie_edls_proprietaire', ['jean@exemple.test'], []], ['pro-6', 'sortie_edls_proprietaire', ['marie@exemple.test'], []]]);
    for (const { partie, mail } of m.parties) {
      for (const tiers of TOUS.filter((p) => p.cle !== partie.cle)) {
        for (const c of coordonneesDe(tiers).filter((x) => !coordonneesDe(partie).includes(x))) {
          expect(mail.texte, `${partie.cle} ne doit pas lire « ${c} »`).not.toContain(c);
          expect(mail.html).not.toContain(c);
        }
      }
      expect(mail.texte).toContain('Logement rendu propre.');
    }
    expect(m.parties[0].mail.texte).toContain('Bonjour Alice BERNARD,');
    expect(m.parties[2].mail.texte).toContain('Le logement est désormais libre de toute occupation.');
    // La copie interne, elle, dit à qui chaque mail est parti.
    expect(m.interne?.texte).toContain('· Alice BERNARD (locataire) — alice@exemple.test');
    expect(m.interne?.texte).toContain('· Jean DUPONT (propriétaire) — jean@exemple.test');
  });
  it('une partie sans adresse e-mail ne reçoit rien et est signalée', () => {
    const m = mailsValidationSortie(D({ destinataires: [{ ...PAUL, emails: [] }] }));
    expect(m.parties).toEqual([]);
    expect(m.sansEmail).toEqual(['Paul BERNARD']);
  });
});

describe('🔴🔴 Arno (11/11/2026, 468) — la retenue de 20 % et les pièces jointes', () => {
  it('case cochée : le paragraphe EXACT en fin de compte rendu des LOCATAIRES, la phrase courte chez les PROPRIÉTAIRES, la mention dans la copie interne ; apostrophes typographiques', () => {
    expect(PARAGRAPHE_RETENUE_LOCATAIRE).not.toContain("'");
    // 🔴 Arno (23/11/2026) — plus « rond », la base légale citée EN ENTIER
    expect(PARAGRAPHE_RETENUE_LOCATAIRE.startsWith('Le logement que vous occupiez se trouve dans un immeuble en copropriété. Pour cette raison, et comme le prévoit l’article 22 de la loi n° 89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs et portant modification de la loi n° 86-1290 du 23 décembre 1986 (dans sa rédaction issue de la loi n° 2014-366 du 24 mars 2014, dite loi ALUR)')).toBe(true);
    const m = mailsValidationSortie(D({ destinataires: [ALICE, JEAN], retenue: { appliquee: true, paragrapheLocataire: PARAGRAPHE_RETENUE_LOCATAIRE } }));
    const loc = m.parties[0].mail.texte;
    expect(loc.indexOf('Compteurs relevés.')).toBeLessThan(loc.indexOf(PARAGRAPHE_RETENUE_LOCATAIRE));
    expect(loc).not.toContain(PHRASE_RETENUE_PROPRIETAIRE);
    const pro = m.parties[1].mail.texte;
    // 🔴 Arno (23/11/2026) — « même ton, même base légale » chez le propriétaire (avant : une phrase courte, sans l'article 22)
    expect(pro).toContain(PHRASE_RETENUE_PROPRIETAIRE);
    expect(pro).toContain('article 22 de la loi n° 89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs');
    expect(pro).not.toContain(PARAGRAPHE_RETENUE_LOCATAIRE);
    expect(m.interne?.texte).toContain('Retenue de 20 % du dépôt de garantie : appliquée (article 22).');
  });
  it('le paragraphe est modifiable ; case décochée : ni paragraphe, ni phrase (et plus le paragraphe automatique d’avant)', () => {
    const modifie = mailsValidationSortie(D({ destinataires: [ALICE], copropriete: true, retenue: { appliquee: true, paragrapheLocataire: 'Provision de 20 % conservée (texte revu).' } }));
    expect(modifie.parties[0].mail.texte).toContain('Provision de 20 % conservée (texte revu).');
    const sans = mailsValidationSortie(D({ destinataires: [ALICE, JEAN], copropriete: true, retenue: { appliquee: false, paragrapheLocataire: PARAGRAPHE_RETENUE_LOCATAIRE } }));
    for (const { mail } of sans.parties) { expect(mail.texte).not.toContain('20 %'); }
    expect(sans.interne?.texte).toContain('Retenue de 20 % du dépôt de garantie : non appliquée.');
  });
  it('la case selon la copropriété de la fiche : Non → impossible ; Non renseigné → à vérifier ; Oui → possible', () => {
    expect([etatRetenue(false), etatRetenue(null), etatRetenue(true)]).toEqual(['impossible', 'a_verifier', 'possible']);
    expect(MOTIF_RETENUE_IMPOSSIBLE).toBe('Retenue impossible : le bien n’est pas en copropriété (article 22).');
  });
  it('les MÊMES pièces à chaque mail (locataires, propriétaires, copie interne) ; aucune coordonnée d’un tiers ajoutée par la retenue', () => {
    const pieces = [{ id: 1, nom: 'edl.pdf', typeMime: 'application/pdf', taille: 10 }, { id: 2, nom: 'salon.jpg', typeMime: 'image/jpeg', taille: 20 }];
    const m = mailsValidationSortie(D({ destinataires: [ALICE, JEAN], pieces, retenue: { appliquee: true, paragrapheLocataire: PARAGRAPHE_RETENUE_LOCATAIRE } }));
    for (const x of [...m.parties.map((p) => p.mail), m.interne!]) expect(x.pieces?.map((p) => p.nom)).toEqual(['edl.pdf', 'salon.jpg']);
    for (const { partie, mail } of m.parties) {
      for (const tiers of TOUS.filter((p) => p.cle !== partie.cle)) {
        for (const c of coordonneesDe(tiers).filter((x) => !coordonneesDe(partie).includes(x))) expect(mail.texte).not.toContain(c);
      }
    }
  });
  it('types et tailles : PDF, JPG, PNG, HEIC, Word ; 10 Mo par fichier, 15 Mo au total ; filtre « États des lieux »', () => {
    expect(['a.pdf', 'b.JPG', 'c.png', 'd.heic', 'e.doc', 'f.docx'].map((n) => typePiece(n, ''))).toEqual(['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    expect(typePiece('g.xlsx', '')).toBeNull();
    expect(refusPiece({ nom: 'a.pdf', typeMime: 'application/pdf', taille: PIECE_MAX_OCTETS + 1 }, [])).toContain('par fichier');
    expect(refusPiece({ nom: 'a.pdf', typeMime: 'application/pdf', taille: 6 * 1024 * 1024 }, [{ taille: PIECES_MAX_OCTETS - 1024 }])).toContain('le total des pièces dépasserait 15 Mo');
    expect(refusPiece({ nom: 'a.pdf', typeMime: 'application/pdf', taille: 1024 }, [])).toBeNull();
    expect([estEtatDesLieux('EDL sortie.pdf'), estEtatDesLieux('scan.pdf', ['État des lieux']), estEtatDesLieux('bail.pdf')]).toEqual([true, true, false]);
  });
});

/** 🔴🔴 Arno (17/11/2026) : « un mail nominatif par personne et par adresse […] même dans un couple […] ou entre copropriétaires ». */
describe('🔴🔴 un mail = une seule adresse (état des lieux de sortie)', () => {
  it('un propriétaire à deux adresses (fiche de couple) : deux mails, chacun une adresse, marqués client, rangés pour CE propriétaire', () => {
    const COUPLE: PartieSortie = { ...JEAN, emails: ['jean@exemple.test', 'marie.dupont@exemple.test'] };
    const m = mailsValidationSortie(D({ destinataires: [ALICE, COUPLE] }));
    expect(m.parties.map((x) => [x.partie.cle, x.mail.a, x.mail.cc, x.mail.client])).toEqual([
      ['loc-11', ['alice@exemple.test'], [], 'locataire'], ['pro-5', ['jean@exemple.test'], [], 'proprietaire'], ['pro-5', ['marie.dupont@exemple.test'], [], 'proprietaire']]);
  });
});

/**
 * 🔴 Arno (23/11/2026) — « après le 1er paragraphe du mail qui valide la sortie du locataire et qui se finit par "cette date", il faut ajouter un
 * paragraphe qui indique qu'il trouvera en pièce jointe de ce mail le document d'état des lieux de sortie effectué, puis garder le reste du mail ».
 */
describe('🔴 le paragraphe « pièce jointe » du mail aux locataires', () => {
  const UNE = [{ id: 1, nom: 'edl.pdf', typeMime: 'application/pdf', taille: 10 }];
  const DEUX = [...UNE, { id: 2, nom: 'salon.jpg', typeMime: 'image/jpeg', taille: 20 }];
  // 🔴 (23/11/2026, suite) reformulé : « le rapport de l'état des lieux de sortie de votre logement »
  const SINGULIER = 'Vous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement. Nous vous invitons à le conserver.';
  const PLURIEL = 'Vous trouverez en pièces jointes de ce mail le rapport complet et les documents de l’état des lieux de sortie de votre logement. Nous vous invitons à les conserver.';
  const DATE = 'Votre sortie du logement est enregistrée à cette date.';
  // 🔴 Arno (23/11/2026, suite) — « le paragraphe "Vous trouverez en pièce jointe …" doit être placé SOUS le bloc "Compte rendu de l'état des lieux de
  // sortie : …", et non avant » : 1) ouverture 2) compte rendu 3) pièce jointe 4) 20 % 5) formule de fin
  it('une pièce : l’ordre ouverture → compte rendu → pièce jointe → 20 % → fin', () => {
    const loc = mailsValidationSortie(D({ destinataires: [ALICE], pieces: UNE, retenue: { appliquee: true, paragrapheLocataire: PARAGRAPHE_RETENUE_LOCATAIRE } })).parties[0].mail.texte;
    const i = [loc.indexOf(DATE), loc.indexOf('Compte rendu de l’état des lieux de sortie :'), loc.indexOf(SINGULIER), loc.indexOf('Le logement que vous occupiez'), loc.indexOf('Nous restons à votre disposition')];
    expect(i.every((x) => x >= 0)).toBe(true);
    expect([...i].sort((a, b) => a - b)).toEqual(i);
    // juste SOUS le compte rendu saisi (son dernier paragraphe), un paragraphe à lui
    expect(loc).toContain(`Compteurs relevés.\n\n${SINGULIER}\n\nLe logement que vous occupiez`);
    expect(loc).not.toContain(PLURIEL);
  });
  it('deux pièces : au pluriel ; sans compte rendu saisi, la pièce jointe suit directement l’ouverture', () => {
    const loc = mailsValidationSortie(D({ destinataires: [ALICE], pieces: DEUX })).parties[0].mail.texte;
    expect(loc).toContain(`Compteurs relevés.\n\n${PLURIEL}\n\nNous restons à votre disposition`);
    expect(loc).not.toContain(SINGULIER);
    const sansCr = mailsValidationSortie(D({ destinataires: [ALICE], pieces: UNE, compteRendu: '' })).parties[0].mail.texte;
    expect(sansCr).toContain(`${DATE}\n\n${SINGULIER}\n\nNous restons à votre disposition`);
    expect(sansCr).not.toContain('Compte rendu de l’état des lieux de sortie :');
  });
  it('sans pièce : aucun paragraphe (le reste du mail inchangé) ; l’avertissement du récapitulatif, mot pour mot', () => {
    const avec = mailsValidationSortie(D({ destinataires: [ALICE], pieces: UNE })).parties[0].mail.texte;
    const sans = mailsValidationSortie(D({ destinataires: [ALICE] })).parties[0].mail.texte;
    expect(sans).not.toContain('pièce jointe');
    expect(sans).not.toContain('pièces jointes');
    expect(avec.replace(`${SINGULIER}\n\n`, '')).toBe(sans);
    expect(AVERTISSEMENT_SANS_EDL_JOINT).toBe('Aucun état des lieux joint : le mail ne l’annoncera pas.');
    expect([paragraphePiecesLocataire(0), paragraphePiecesLocataire(1), paragraphePiecesLocataire(3)]).toEqual([null, SINGULIER, PLURIEL]);
  });
  it('plusieurs locataires : un mail par personne, chacun avec le paragraphe ; le propriétaire a le sien ; jamais dans la copie interne', () => {
    const m = mailsValidationSortie(D({ destinataires: [ALICE, PAUL, JEAN], pieces: UNE }));
    const par = (f: string) => m.parties.filter((p) => p.partie.famille === f).map((p) => p.mail.texte);
    expect(par('locataire')).toHaveLength(2);
    for (const t of par('locataire')) expect(t).toContain(`Compteurs relevés.\n\n${SINGULIER}`);
    for (const t of [...par('proprietaire'), m.interne!.texte]) expect(t).not.toContain(SINGULIER);
    expect(m.interne!.texte).not.toContain('Vous trouverez en pièce jointe');
  });
});

/**
 * 🔴🔴 Arno (23/11/2026) — le texte des PROPRIÉTAIRES : « il faut ajouter qu'il doit nous communiquer, dès qu'il en aura connaissance, la date de tenue
 * de l'AGO […] afin de pouvoir préparer/anticiper la restitution des 20 % aux locataires. […] Refaire le texte plus synthétique et clair. »
 */
describe('🔴🔴 le texte des propriétaires, en trois paragraphes', () => {
  const LOI = 'l’article 22 de la loi n° 89-462 du 6 juillet 1989 tendant à améliorer les rapports locatifs et portant modification de la loi n° 86-1290 du 23 décembre 1986 (dans sa rédaction issue de la loi n° 2014-366 du 24 mars 2014, dite loi ALUR)';
  it('date PROJETÉE : les trois paragraphes d’Arno, mot pour mot', () => {
    expect(texteProprietaire({ jour: '2027-04-10', statut: 'projetee', cloture: '2027-12-31', pluriel: false }).split('\n\n')).toEqual([
      `Le logement étant situé dans une copropriété, nous conservons, comme le prévoit ${LOI}, au plus 20 % du dépôt de garantie de votre locataire jusqu’à l’approbation des comptes de l’exercice clos le 31/12/2027.`,
      'Ces comptes seront approuvés lors de l’assemblée générale ordinaire attendue vers avril 2027 (date approximative, estimée d’après les précédentes assemblées). Le solde sera ensuite restitué ou ajusté à votre locataire vers mai 2027.',
      'Pour préparer cette restitution dans les délais, merci de nous communiquer la date précise de cette assemblée dès que vous la connaîtrez, puis son procès-verbal dès sa réception. La bonne clôture de la sortie de votre locataire dépend de la transmission de ces éléments à notre service Gestion.']);
  });
  it('date OFFICIELLE : « prévue le … », « au plus tard le … », et la demande du seul procès-verbal', () => {
    const t = texteProprietaire({ jour: '2028-03-15', statut: 'officielle', cloture: '2027-12-31', pluriel: false }).split('\n\n');
    expect(t.slice(1)).toEqual([
      'Ces comptes seront approuvés lors de l’assemblée générale ordinaire prévue le 15/03/2028. Le solde sera ensuite restitué ou ajusté à votre locataire au plus tard le 15/04/2028.',
      'Merci de nous transmettre le procès-verbal de cette assemblée dès sa réception : la bonne clôture de la sortie de votre locataire en dépend.']);
  });
  it('arrêté inconnu : « de l’exercice couvrant sa période d’occupation » ; plusieurs locataires : « vos locataires » / « leur » ; décembre → janvier', () => {
    const t = texteProprietaire({ jour: '2027-12-10', statut: 'projetee', cloture: null, pluriel: true });
    expect(t).toContain('au plus 20 % du dépôt de garantie de vos locataires jusqu’à l’approbation des comptes de l’exercice couvrant leur période d’occupation.');
    expect(t).toContain('Le solde sera ensuite restitué ou ajusté à vos locataires vers janvier 2028.');
    expect(t).toContain('La bonne clôture de la sortie de vos locataires dépend');
    expect(t).not.toContain('votre locataire');
    expect(texteProprietaire({ jour: null, statut: null, cloture: null, pluriel: false })).toContain('l’exercice couvrant sa période d’occupation');
  });
  it('sans date (case « Indiquer … » non cochée) : trois paragraphes aussi, la restitution dans le mois qui suit, la demande de la date ; c’est le repli du mail', () => {
    const t = texteProprietaire({ jour: null, statut: null, cloture: null, pluriel: false }).split('\n\n');
    expect(t).toHaveLength(3);
    expect(t[1]).toBe('Le solde sera ensuite restitué ou ajusté à votre locataire dans le mois qui suit l’approbation des comptes.');
    expect(t[2]).toContain('merci de nous communiquer la date de l’assemblée générale ordinaire qui approuvera ces comptes dès que vous la connaîtrez');
    expect(PHRASE_RETENUE_PROPRIETAIRE).toBe(texteProprietaire({ jour: null, statut: null, cloture: null, pluriel: false }));
    // dans le mail : trois paragraphes, tels quels
    const pro = mailsValidationSortie(D({ destinataires: [JEAN], retenue: { appliquee: true, paragrapheLocataire: PARAGRAPHE_RETENUE_LOCATAIRE } })).parties[0].mail.texte;
    for (const p of t) expect(pro).toContain(`${p}\n\n`);
  });
});

/**
 * 🔴 Arno (23/11/2026, suite) — « à partir du moment où une pièce jointe a été ajoutée, un paragraphe qui indique que le destinataire de ce mail
 * trouvera en pièce jointe le rapport de l'état des lieux de sortie de son logement » : le PROPRIÉTAIRE aussi, juste après sa phrase d'ouverture.
 */
describe('🔴 le paragraphe « pièce jointe » du mail aux propriétaires', () => {
  const UNE = [{ id: 1, nom: 'edl.pdf', typeMime: 'application/pdf', taille: 10 }];
  const DEUX = [...UNE, { id: 2, nom: 'salon.jpg', typeMime: 'image/jpeg', taille: 20 }];
  const OUVERTURE = 'L’état des lieux de sortie de votre bien situé 4 rue Fictive, 92800 Puteaux a été réalisé le 10/11/2026. Le logement est désormais libre de toute occupation.';
  it('une pièce : après le compte rendu (même ordre que le locataire), sinon après l’ouverture ; deux : « le rapport et les documents » ; aucune : absent', () => {
    const un = mailsValidationSortie(D({ destinataires: [JEAN], pieces: UNE })).parties[0].mail.texte;
    expect(un).toContain(`${OUVERTURE}\n\nCompte rendu de l’état des lieux de sortie :\n\nLogement rendu propre.\n\nCompteurs relevés.\n\nVous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement situé 4 rue Fictive, 92800 Puteaux.\n\nNous restons`);
    const sansCr = mailsValidationSortie(D({ destinataires: [JEAN], pieces: UNE, compteRendu: '' })).parties[0].mail.texte;
    expect(sansCr).toContain(`${OUVERTURE}\n\nVous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement situé 4 rue Fictive, 92800 Puteaux.\n\nNous restons`);
    const deux = mailsValidationSortie(D({ destinataires: [JEAN], pieces: DEUX })).parties[0].mail.texte;
    expect(deux).toContain(`Compteurs relevés.\n\nVous trouverez en pièces jointes de ce mail le rapport complet et les documents de l’état des lieux de sortie de votre logement situé 4 rue Fictive, 92800 Puteaux.\n\n`);
    const sans = mailsValidationSortie(D({ destinataires: [JEAN] })).parties[0].mail.texte;
    expect(sans).not.toContain('Vous trouverez en pièce');
    expect(un.replace('Vous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement situé 4 rue Fictive, 92800 Puteaux.\n\n', '')).toBe(sans);
    expect([paragraphePiecesProprietaire(0, 'x'), paragraphePiecesProprietaire(1, '1 rue A')]).toEqual([null, 'Vous trouverez en pièce jointe de ce mail le rapport complet de l’état des lieux de sortie de votre logement situé 1 rue A.']);
  });
});
