import { describe, expect, it } from 'vitest';
import { alertesDuCompteRendu, coordonneesDeTiers, mailsValidationSortie, verifierValidation, type PartieSortie } from './validationSortie';

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
