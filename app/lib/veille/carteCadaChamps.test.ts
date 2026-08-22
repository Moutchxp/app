import { describe, it, expect } from 'vitest';
import {
  champsCarteCada, objetPorteSur, documentsObjet, observations, decouperNom, decouperAdresse,
  messageHistoriqueCopies, CLES_CHAMPS_CADA, type EntreeCarteCada, type CleChampCada,
} from './carteCadaChamps';
import type { CandidatDossier, Piece } from '../sitadel/demande';

/**
 * CADA lot A — composition PURE des 17 champs du formulaire de saisine CADA. Un test par champ (surtout 14/15/17), plus le
 * message d'historique (nombre/date/compte + déposée/non déposée). Repères = demande 154 (Aubervilliers).
 */
const PIECES: Piece[] = [
  { code: 'PC2', description: 'plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme' },
  { code: 'PC3', description: 'plan en coupe du terrain et de la construction' },
];
const DOSSIER: CandidatDossier = {
  dossierId: 1, codeInsee: '93001', communeNom: 'Aubervilliers', canal: 'email', numDau: '0930012500081',
  dateReelleAutorisation: '2026-03-31', adresse: '1 RUE FERRAGUS AUBERVILLIERS', codePostal: '93300',
  cadastre: ['AB 157', 'AB 160', 'Z 1'], etatDau: null, absentDuDernierMillesime: false,
};
const E = (over: Partial<EntreeCarteCada> = {}): EntreeCarteCada => ({
  representantNom: 'Arnaud JOREL', representantQualite: 'Gérant', emailContact: 'a.jorel@sansvisavis.com',
  raisonSociale: 'Criterimmo', formeJuridique: 'sarl', siegeAdresse: '191 Avenue Charles de Gaulle 92200 Neuilly-sur-Seine',
  communeNom: 'Aubervilliers', destNom: '', mairieAdressePostale: '',
  pieces: PIECES, dossiersDus: [DOSSIER],
  envoyeeLe: new Date('2026-08-04T21:21:33.311+02:00'), refusTaciteLe: new Date('2026-09-04T19:21:33.311Z'),
  ...over,
});
const val = (cle: CleChampCada, over: Partial<EntreeCarteCada> = {}): string => champsCarteCada(E(over)).find((c) => c.cle === cle)!.valeur;
const dispo = (cle: CleChampCada, over: Partial<EntreeCarteCada> = {}): boolean => champsCarteCada(E(over)).find((c) => c.cle === cle)!.disponible;

describe('CADA lot A — helpers de découpe', () => {
  it('decouperNom : premier mot = prénom, reste = nom', () => {
    expect(decouperNom('Arnaud JOREL')).toEqual({ prenom: 'Arnaud', nom: 'JOREL' });
    expect(decouperNom('Jean-Pierre De La Tour')).toEqual({ prenom: 'Jean-Pierre', nom: 'De La Tour' });
    expect(decouperNom('Cher')).toEqual({ prenom: '', nom: 'Cher' });
  });
  it('decouperAdresse : sépare voie / CP / localité par le code postal', () => {
    expect(decouperAdresse('191 Avenue Charles de Gaulle 92200 Neuilly-sur-Seine')).toEqual({ voie: '191 Avenue Charles de Gaulle', codePostal: '92200', localite: 'Neuilly-sur-Seine' });
    expect(decouperAdresse('sans code postal')).toEqual({ voie: 'sans code postal', codePostal: '', localite: '' });
  });
});

describe('CADA lot A — un test par champ (identité + administration + objet)', () => {
  it('1. Civilité = valeur simple', () => expect(val('civilite')).toBe('Monsieur'));
  it('2. Prénom (représentant)', () => expect(val('prenom')).toBe('Arnaud'));
  it('3. Nom (représentant)', () => expect(val('nom')).toBe('JOREL'));
  it('4. Adresse courriel', () => expect(val('courriel')).toBe('a.jorel@sansvisavis.com'));
  it('5. Pour le compte de = raison sociale + forme juridique (majuscule)', () => expect(val('pour_compte')).toBe('Criterimmo (SARL)'));
  it('6. Adresse (siège)', () => expect(val('adresse')).toBe('191 Avenue Charles de Gaulle'));
  it('7. Code postal (siège)', () => expect(val('code_postal')).toBe('92200'));
  it('8. Localité (siège)', () => expect(val('localite')).toBe('Neuilly-sur-Seine'));
  it('9. Pays = France', () => expect(val('pays')).toBe('France'));
  it('10. Administration concernée = « Mairie d’… » composé quand dest_nom absent', () => expect(val('admin_nom')).toBe('Mairie d’Aubervilliers'));
  it('10bis. dest_nom présent → utilisé tel quel', () => expect(val('admin_nom', { destNom: 'Ville d’Aubervilliers — Service urbanisme' })).toBe('Ville d’Aubervilliers — Service urbanisme'));
  it('11/12. Adresse + CP mairie ABSENTS (jamais inventés) → indisponibles', () => {
    expect(dispo('admin_adresse')).toBe(false);
    expect(dispo('admin_code_postal')).toBe(false);
    expect(val('admin_adresse')).toBe('');
  });
  it('13. Localité mairie retombe sur la commune (fait factuel) quand l’adresse postale manque', () => {
    expect(val('admin_localite')).toBe('Aubervilliers');
    expect(dispo('admin_localite')).toBe(true);
  });
  it('11/12/13. adresse postale mairie connue → découpée', () => {
    const over = { mairieAdressePostale: '2 rue de la Commune de Paris 93300 Aubervilliers' };
    expect(val('admin_adresse', over)).toBe('2 rue de la Commune de Paris');
    expect(val('admin_code_postal', over)).toBe('93300');
    expect(val('admin_localite', over)).toBe('Aubervilliers');
  });
  it('16. Date de la demande = jj/mm/aaaa', () => expect(val('date_demande')).toBe('04/08/2026'));
});

describe('CADA lot A — champ 14 (« Votre demande porte sur »)', () => {
  it('une seule ligne, courte, cite les pièces et la commune', () => {
    const o = objetPorteSur(E());
    expect(o).toBe('Communication de documents administratifs d’urbanisme (pièces PC2, PC3) relatifs à un permis de construire — commune d’Aubervilliers');
    expect(o).not.toContain('\n');
  });
});

describe('CADA lot A — champ 15 (« Document(s) objet de la saisine »)', () => {
  const d = documentsObjet(E());
  it('désigne PC2 avec R.431-9 et PC3', () => {
    expect(d).toContain('la pièce PC2, plan de masse coté dans les trois dimensions, prévue à l’article R.431-9 du code de l’urbanisme');
    expect(d).toContain('la pièce PC3, plan en coupe du terrain et de la construction');
  });
  it('détaille chaque dossier dû : numéro, date d’autorisation, adresse, parcelles', () => {
    expect(d).toContain('Dossiers concernés :');
    expect(d).toContain('0930012500081 — autorisé le 31 mars 2026 — 1 RUE FERRAGUS AUBERVILLIERS, 93300 Aubervilliers — parcelle(s) AB 157, AB 160, Z 1');
  });
  it('plusieurs dossiers → une ligne par dossier', () => {
    const d2 = documentsObjet(E({ dossiersDus: [DOSSIER, { ...DOSSIER, dossierId: 2, numDau: '0930012500082', cadastre: ['ZK 9'] }] }));
    expect(d2).toContain('0930012500081 —');
    expect(d2).toContain('0930012500082 — autorisé le 31 mars 2026 — 1 RUE FERRAGUS AUBERVILLIERS, 93300 Aubervilliers — parcelle(s) ZK 9');
  });
});

describe('CADA lot A — champ 17 (Observations)', () => {
  const o = observations(E());
  it('qualité du signataire (gérant) + pour le compte de la société', () => {
    expect(o).toContain('Demande formée par Arnaud JOREL, en qualité de gérant, pour le compte de la société Criterimmo (SARL).');
  });
  it('date du refus tacite + absence de réponse', () => {
    expect(o).toContain('une décision implicite de refus est née le 4 septembre 2026');
    expect(o).toContain('Aucune réponse n’a été reçue à ce jour.');
    expect(o).toContain('adressée à la commune le 04/08/2026 et est restée sans réponse');
  });
});

describe('CADA lot A — structure : 17 champs, clés stables, ordre du formulaire', () => {
  it('champsCarteCada renvoie exactement les 17 clés dans l’ordre', () => {
    expect(champsCarteCada(E()).map((c) => c.cle)).toEqual([...CLES_CHAMPS_CADA]);
  });
});

describe('CADA lot A — message d’historique (ouverture de carte)', () => {
  it('aucune copie antérieure → pas de message', () => {
    expect(messageHistoriqueCopies({ nbChamps: 0, derniereLe: null, dernierAdmin: null, deposee: false }).present).toBe(false);
  });
  it('des copies → nombre + date (Europe/Paris) + compte, et l’état NON déposée', () => {
    const m = messageHistoriqueCopies({ nbChamps: 3, derniereLe: '2026-08-25T19:30:00Z', dernierAdmin: 'Arnaud JOREL', deposee: false });
    expect(m.present).toBe(true);
    expect(m.entete).toContain('3 champs déjà copiés');
    expect(m.entete).toContain('21:30');        // 19:30 UTC = 21:30 Europe/Paris (été)
    expect(m.entete).toContain('Arnaud JOREL');
    expect(m.statutDepot).toContain('n’est PAS marquée comme déposée');
    expect(m.statutDepot).toContain('Copier n’est pas déposer');
  });
  it('saisine déposée → seconde ligne l’affirme', () => {
    const m = messageHistoriqueCopies({ nbChamps: 1, derniereLe: '2026-08-25T19:30:00Z', dernierAdmin: null, deposee: true });
    expect(m.entete).toContain('1 champ déjà copié');
    expect(m.entete).toContain('un compte inconnu');
    expect(m.statutDepot).toContain('marquée comme DÉPOSÉE');
  });
});
