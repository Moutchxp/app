import { describe, expect, it } from 'vitest';
import {
  acceptationInitiale, compterEnAttente, corpsDemande, erreurMotif, estDemandeAcceptationTache, filtrerParAcceptation,
  liensDemande, messageIdDemande, modificationRelanceLaDemande, objetDemande, verdictLien, type StatutAcceptation,
} from './acceptationTache';
import { examinerMessage } from './rattachement';
import type { BienConnu } from './propositionsBien';
import { repartirTaches, type Tache } from './taches';

/**
 * LOT TACHES-ACCEPTATION — la règle pure : acceptée d'office ou en attente, relance, lien (bon destinataire, une fois,
 * avant expiration), motif, mail, filtres, ordre — et le VERROU : le mail de demande n'est jamais rattaché à un bien.
 */
const MAINT = new Date('2026-10-13T15:00:00+02:00');

describe('🔴 acceptée d’office, ou en attente', () => {
  it('confiée à moi = acceptée ; confiée à un autre = en attente', () => {
    expect(acceptationInitiale(2, 2)).toBe('acceptee');
    expect(acceptationInitiale(3, 2)).toBe('en_attente');
    expect(acceptationInitiale(2, null)).toBe('en_attente'); // voie de secours : personne ne s'est confié la tâche
  });
  it('🔴 date, heure ou personne changée relance la demande ; le reste non', () => {
    const t = { jour: '2026-10-15', heure: null, confieeA: 3 };
    expect(modificationRelanceLaDemande(t, { ...t, jour: '2026-10-16' })).toBe(true);
    expect(modificationRelanceLaDemande(t, { ...t, heure: '09:00' })).toBe(true);
    expect(modificationRelanceLaDemande(t, { ...t, confieeA: 4 })).toBe(true);
    expect(modificationRelanceLaDemande(t, { ...t })).toBe(false);
  });
});

describe('🔴 le lien : pour le bon destinataire, une seule fois, avant son expiration', () => {
  const d = { statut: 'en_attente', destinataireId: 3, expireLe: '2026-10-20T00:00:00Z', utiliseLe: null };
  it('valable pour le destinataire', () => {
    expect(verdictLien(d, 'a_faire', 3, MAINT)).toEqual({ ok: true });
  });
  it.each([
    ['autre personne', d, 'a_faire', 2, 'autre_personne'],
    ['expiré', { ...d, expireLe: '2026-10-13T12:00:00Z' }, 'a_faire', 3, 'expire'],
    ['déjà utilisé', { ...d, utiliseLe: '2026-10-13T10:00:00Z', statut: 'acceptee' }, 'a_faire', 3, 'deja_utilise'],
    ['remplacé', { ...d, statut: 'remplacee' }, 'a_faire', 3, 'remplace'],
    ['tâche annulée', d, 'annulee', 3, 'tache_terminee'],
    ['inconnu', null, null, 3, 'inconnu'],
  ] as const)('refus propre : %s', (_n, dem, etat, qui, cause) => {
    const v = verdictLien(dem, etat, qui, MAINT);
    expect(v.ok).toBe(false);
    if (!v.ok) { expect(v.cause).toBe(cause); expect(v.message.length).toBeGreaterThan(20); }
  });
  it('« Refuser » exige un motif', () => {
    expect(erreurMotif('  ')).toBe('Indiquez le motif du refus.');
    expect(erreurMotif('En congé')).toBeNull();
  });
});

describe('le mail de demande', () => {
  it('objet, Message-ID marqué, liens qui demandent confirmation, deux boutons', () => {
    expect(objetDemande({ adresseCourte: '7 avenue de l’Union', objet: 'Visite', echeance: 'mar. 13 oct. · journée' }))
      .toBe('Tâche à accepter — 7 avenue de l’Union — Visite — mar. 13 oct. · journée');
    expect(messageIdDemande('criterimmo.fr', 'abc')).toBe('<tache-acceptation.abc@criterimmo.fr>');
    const l = liensDemande('https://app.test/', 'JETON');
    expect(l).toEqual({ accepter: 'https://app.test/admin/taches?j=JETON&d=accepter', refuser: 'https://app.test/admin/taches?j=JETON&d=refuser' });
    const c = corpsDemande({
      echeance: 'mar. 13 oct. · journée', adresseBien: '7 avenue de l’Union, Asnières', objet: 'Visite', demandeur: 'Arnaud Jorel',
      destinataire: 'Claire', texte: 'Note\n\nContacts\n— M. X · Propriétaire', pieces: [{ nom: 'Bail.pdf', lien: 'https://drive/b' }],
      lienAccepter: l.accepter, lienRefuser: l.refuser, expireLe: '20/10/2026 à 15:00',
    });
    for (const x of ['Échéance : mar. 13 oct. · journée', 'Demandée par : Arnaud Jorel', 'Contacts', 'Bail.pdf : https://drive/b', l.accepter, l.refuser]) {
      expect(c.texte).toContain(x);
    }
    expect(c.html).toContain('>Accepter</a>');
    expect(c.html).toContain('>Refuser</a>');
  });
});

describe('🔴 le mail de demande n’est JAMAIS rattaché à un bien', () => {
  const BIENS: BienConnu[] = [{ cle: '26', numero: '26', adresse: '7 avenue de l’Union', commune: 'Asnières', proprietaireCle: '1', proprietaireNom: 'X' }];
  const OBJET = 'Tâche à accepter — 7 avenue de l’Union — Visite — mar. 13 oct. · journée';
  it('reconnu par son Message-ID, ou par son objet sur un mail envoyé', () => {
    expect(estDemandeAcceptationTache({ messageIdEntete: '<tache-acceptation.x@criterimmo.fr>' })).toBe(true);
    expect(estDemandeAcceptationTache({ sens: 'envoye', objet: OBJET })).toBe(true);
    // Une réponse REÇUE d'un collègue (« Re: … ») n'est pas notre demande.
    expect(estDemandeAcceptationTache({ sens: 'recu', objet: `Re: ${OBJET}`, messageIdEntete: '<CA+abc@mail.gmail.com>' })).toBe(false);
  });
  it('le moteur le refuse AVANT tout calcul, même quand l’objet cite l’adresse du bien', () => {
    const e = examinerMessage({
      messageId: 9, biens: BIENS, adressesEchange: [], sens: 'envoye', messageIdEntete: '<tache-acceptation.x@criterimmo.fr>',
      textes: { objet: OBJET, corps: 'Bien : 7 avenue de l’Union, Asnières', pieces: [] }, lectureObjet: true,
    } as Parameters<typeof examinerMessage>[0]);
    expect(e.issue).toBe('sans_candidat');
    expect(e.certain).toBeNull();
    expect(e.candidats).toEqual([]);
    expect(e.motif).toContain('demande d’acceptation de tâche');
  });
});

describe('🔴 filtres combinables, compteur et ordre chronologique', () => {
  const t = (id: number, jour: string, confieeA: number, demandeur: number, statut: StatutAcceptation): Tache => ({
    id, lotId: 1, lotCle: '1', adresseBien: 'x', evenement: null, objet: `T${id}`, note: null, jour, heure: null, rappels: [],
    etat: 'a_faire', confieeA, confieeALibelle: 'x', creeLe: '', creeParLibelle: '', majLe: '', faiteLe: null,
    faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, creePar: demandeur,
    acceptation: { statut, automatique: false, destinataireId: confieeA, destinataireLibelle: 'x', demandeurId: demandeur,
      demandeurLibelle: 'x', demandeLe: '', reponduLe: null, reponduParLibelle: null, motif: null, mailEtat: 'desactive', mailLe: null },
  });
  const L = [
    t(1, '2026-10-20', 2, 2, 'acceptee'),   // à moi, par moi
    t(2, '2026-10-10', 3, 2, 'en_attente'), // commandée par moi à Claire, en retard
    t(3, '2026-10-14', 3, 2, 'refusee'),    // commandée par moi, refusée
    t(4, '2026-10-13', 2, 3, 'en_attente'), // confiée à moi par Claire
  ];
  it('qui × statut', () => {
    expect(filtrerParAcceptation(L, 'toutes', 'toutes', 2).map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(filtrerParAcceptation(L, 'confiees', 'toutes', 2).map((x) => x.id)).toEqual([1, 4]);
    expect(filtrerParAcceptation(L, 'commandees', 'toutes', 2).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(filtrerParAcceptation(L, 'commandees', 'en_attente', 2).map((x) => x.id)).toEqual([2]);
    expect(filtrerParAcceptation(L, 'toutes', 'refusee', 2).map((x) => x.id)).toEqual([3]);
    expect(filtrerParAcceptation(L, 'confiees', 'en_attente', 2).map((x) => x.id)).toEqual([4]);
  });
  it('compteur « En attente de confirmation »', () => {
    expect(compterEnAttente(L)).toBe(2);
  });
  it('ordre chronologique strict : de l’échéance la plus proche (retard compris) à la plus lointaine', () => {
    expect(repartirTaches(L, MAINT).ouvertes.map((x) => x.jour)).toEqual(['2026-10-10', '2026-10-13', '2026-10-14', '2026-10-20']);
  });
});
