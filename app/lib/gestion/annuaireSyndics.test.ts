import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adresseImmeuble, apercuPropagation, chiffresTelephone, choixDe, cleImmeuble, communeLisible, coproprietesRetirees,
  formaterTelephone, formulaireModifie, formulaireVide, contactVide, immeublesQuiRepondent, ligneContact, motBiensEnGestion,
  PERSONNALISE, saisieTelephone, lotsDuPortefeuille, cleNom, cleEmail, doublonsLocaux, motDoublon, detacher, nomAvecVille, libellesDe, trierParNom, filtrerCatalogue, suiviParDefaut, suitImmeuble, affecter, motContacts, motBiens, adressesDepuisApi, urlApiAdresse, casserPrenom, casserNom, adresseManquante, contactModifie, copieContact, nomAffiche, telephoneComplet, appliquerBrouillon, MOTIF_ADRESSE_INCOMPLETE, prenomNom, syndicsQuiRepondent, validerSyndic, versFormulaire, versSaisie,
  type FicheSyndic, type ImmeubleConnu, type SyndicResume,
} from './syndics';

/**
 * LOTS ANNUAIRE-SYNDICS-ET-ENTETE-BIEN (commit 2) et FICHE-SYNDIC-FINITIONS — l'annuaire des syndics : règles pures,
 * dépôt (requêtes et paramètres liés, base simulée), migrations 324-325, et garanties sur les écrans.
 */

const appels: Array<{ sql: string; params: unknown[] }> = [];
let reponses: Array<(sql: string) => { rows: unknown[] } | undefined> = [];
const repondre = (sql: string): { rows: unknown[] } => {
  for (const r of reponses) { const x = r(sql); if (x) return x; }
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); }),
  withTransaction: vi.fn(async (fn: (q: unknown) => Promise<unknown>) =>
    fn(async (sql: string, params: unknown[] = []) => { appels.push({ sql, params }); return repondre(sql); })),
}));

const norm = (s: string): string => s.replace(/\s+/g, ' ');
const auteur = { id: 7, libelle: 'arno' };
const im = (libelle: string, codePostal = '', commune = '') => ({ libelle, codePostal, commune });
/** LOT FICHE-SYNDIC-COORDONNEES-ET-ENTETE — rue, code postal et ville sont désormais obligatoires. */
const ADR = { adresse: '1 rue _TEST', codePostal: '75001', ville: 'Paris' };

describe('les règles pures', () => {
  it('la clé d\'un immeuble est sa forme normalisée (casse, accents, ponctuation)', () => {
    expect(cleImmeuble('12, Rue de l\'Église')).toBe(cleImmeuble('12 rue de l eglise'));
    expect(cleImmeuble(null)).toBe('');
  });

  it('le nom du cabinet est obligatoire', () => {
    expect(validerSyndic({ ...ADR, nom: '  ' })).toEqual({ ok: false, motif: 'Le nom du cabinet est obligatoire.' });
  });

  it('un contact a au moins un nom, un prénom ou un titre ; un contact vide est ignoré', () => {
    expect(validerSyndic({ ...ADR, nom: 'Cab', contacts: [{ coordonnees: [{ sorte: 'telephone', valeur: '01' }] }] }).ok).toBe(false);
    const v = validerSyndic({ ...ADR, nom: 'Cab', contacts: [{}, { titre: 'Service comptabilité' }] });
    expect(v.ok && v.syndic.contacts.length).toBe(1);
  });

  it('des coordonnées illimitées, vides ignorées, e-mail vérifié, téléphone enregistré EN CHIFFRES', () => {
    const v = validerSyndic({ ...ADR, nom: 'Cab', contacts: [{ nom: 'Durand', coordonnees: [
      { sorte: 'email', libelle: 'Ligne directe', valeur: 'a@b.fr' },
      { sorte: 'telephone', libelle: 'Portable', valeur: '06 13 86 18 77' },
      { sorte: 'telephone', libelle: '', valeur: '   ' },
    ] }] });
    expect(v.ok && v.syndic.contacts[0].coordonnees.map((k) => k.valeur)).toEqual(['a@b.fr', '0613861877']);
    expect(validerSyndic({ ...ADR, nom: 'Cab', contacts: [{ nom: 'D', coordonnees: [{ sorte: 'email', valeur: 'pas-un-mail' }] }] }).ok).toBe(false);
  });

  it('deux standards au plus, en chiffres ; le second remonte si le premier est vide', () => {
    const v = validerSyndic({ ...ADR, nom: 'Cab', telephone: '', telephone2: '+33 6 13 86 18 77' });
    expect(v.ok && [v.syndic.telephone, v.syndic.telephone2]).toEqual(['+33613861877', '']);
  });

  it('les immeubles sont dédoublonnés par leur clé, avec code postal et commune ; l\'ancienne forme texte passe', () => {
    const v = validerSyndic({ ...ADR, nom: 'Cab', immeubles: [im('12 rue X', '92400', 'Courbevoie'), '12 RUE X', '', im('3 av Y')] });
    expect(v.ok && v.syndic.immeubles).toEqual([im('12 rue X', '92400', 'Courbevoie'), im('3 av Y')]);
  });

  const connus: ImmeubleConnu[] = [
    { cle: cleImmeuble('12 rue X'), libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', syndic: null,
      lots: [{ id: 1, numero: '101', adresse: '12 rue X', commune: 'Paris' }, { id: 2, numero: '102', adresse: '12 rue X', commune: 'Paris' }] },
    { cle: cleImmeuble('3 av Y'), libelle: '3 av Y', codePostal: '69001', commune: 'Lyon', syndic: { id: 9, nom: 'Autre' },
      lots: [{ id: 3, numero: '201', adresse: '3 av Y', commune: 'Lyon' }] },
    { cle: cleImmeuble('8 rue Sans Lot'), libelle: '8 rue Sans Lot', codePostal: null, commune: null, syndic: null, lots: [] },
  ];

  it('AVANT VALIDATION : la liste des biens qui recevront ce syndic, et les changements de syndic', () => {
    const a = apercuPropagation([im('12 rue x'), im('3 av Y'), im('immeuble inconnu')], connus, 5);
    expect(a.lots.map((l) => l.numero)).toEqual(['101', '102', '201']);
    expect(a.changements).toEqual([{ immeuble: '3 av Y', ancien: 'Autre' }]);
    expect(a.sansLot).toEqual(['immeuble inconnu']);
    expect(apercuPropagation([im('3 av Y')], connus, 9).changements).toEqual([]);
  });

  it('auto-complétion DÈS 2 CARACTÈRES, sur le portefeuille seulement (immeubles qui ont des lots), par mots', () => {
    expect(immeublesQuiRepondent('1', connus)).toEqual([]);
    expect(immeublesQuiRepondent('12', connus).map((i) => i.libelle)).toEqual(['12 rue X']);
    expect(immeublesQuiRepondent('courbevoie 12', connus).map((i) => i.libelle)).toEqual(['12 rue X']);
    expect(immeublesQuiRepondent('sans lot', connus)).toEqual([]);
    expect(motBiensEnGestion(0)).toBe('aucun bien en gestion à cette adresse');
    expect(motBiensEnGestion(1)).toBe('1 bien en gestion à cette adresse');
    expect(motBiensEnGestion(3)).toBe('3 biens en gestion à cette adresse');
  });

  it('recherche de syndic par nom / e-mail / domaine', () => {
    const s: SyndicResume[] = [
      { id: 1, nom: 'Citya', email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: 'citya agence citya com' },
      { id: 2, nom: 'Foncia', email: null, telephone: null, nbCoproprietes: 0, nbBiens: 0, cherchable: 'foncia foncia fr' },
    ];
    expect(syndicsQuiRepondent('citya.com', s).map((x) => x.id)).toEqual([1]);
    expect(syndicsQuiRepondent('', s)).toHaveLength(2);
  });

  it('titres et libellés : prédéfinis, ou « Personnalisé » + champ libre ; aller-retour fiche → formulaire → saisie', () => {
    expect(choixDe('Responsable de copropriété', ['Responsable de copropriété'])).toEqual({ choix: 'Responsable de copropriété', libre: '' });
    expect(choixDe('Gardienne', ['Responsable de copropriété'])).toEqual({ choix: PERSONNALISE, libre: 'Gardienne' });
    const fiche: FicheSyndic = {
      id: 3, nom: 'Cab', adresse: '1 rue A', codePostal: '75001', ville: 'Paris', telephone: '0100000000', telephone2: '0200000000',
      email: 'c@cab.fr', note: null,
      creeLe: '2026-10-10', creeParLibelle: 'arno', majLe: null, majParLibelle: null,
      contacts: [{ id: 4, titre: 'Gardienne', prenom: 'Léa', nom: null, tousImmeubles: true, immeubles: [],
        coordonnees: [{ id: 5, sorte: 'telephone', libelle: 'Portable', valeur: '0613861877' }] }],
      coproprietes: [{ id: 6, cle: 'x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', debut: '2026-10-10', lots: [] }],
      historique: [],
    };
    const f = versFormulaire(fiche);
    expect(f.telephones).toEqual(['01 00 00 00 00', '02 00 00 00 00']);
    // LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — « replié / ouvert / en modification » est un état d'ÉCRAN, plus une donnée.
    expect('replie' in f.contacts[0]).toBe(false);
    expect(f.contacts[0].coordonnees[0].valeur).toBe('06 13 86 18 77');
    const s = versSaisie(f);
    expect([s.telephone, s.telephone2, s.codePostal, s.ville]).toEqual(['0100000000', '0200000000', '75001', 'Paris']);
    expect(s.contacts[0]).toMatchObject({ id: 4, titre: 'Gardienne', prenom: 'Léa' });
    expect(s.contacts[0].coordonnees[0]).toMatchObject({ id: 5, libelle: 'Portable', valeur: '0613861877' });
    expect(s.immeubles).toEqual([im('12 rue X', '92400', 'Courbevoie')]);
    expect(coproprietesRetirees([im('12 rue X'), im('3 av Y')], [im('12 RUE X')])).toEqual(['3 av Y']);
  });

  it('« des modifications en cours » : rien ne bouge ⇒ non ; replier un contact n\'est pas une modification', () => {
    const a = formulaireVide(null);
    expect(formulaireModifie(a, { ...a })).toBe(false);
    expect(formulaireModifie(a, { ...a, nom: 'X' })).toBe(true);
  });
});

describe('l\'adresse du syndic est OBLIGATOIRE — rue, code postal (5 chiffres), ville', () => {
  it('le serveur refuse une saisie sans rue, sans code postal à 5 chiffres ou sans ville', () => {
    for (const manque of [{ adresse: '' }, { codePostal: '9240' }, { codePostal: '' }, { ville: ' ' }]) {
      expect(validerSyndic({ ...ADR, nom: 'Cab', ...manque })).toEqual({ ok: false, motif: MOTIF_ADRESSE_INCOMPLETE });
    }
    expect(validerSyndic({ ...ADR, nom: 'Cab' }).ok).toBe(true);
  });
  it('l\'écran sait QUEL champ manque (pour le cercler de rouge)', () => {
    expect(adresseManquante({ adresse: '', codePostal: '92400', ville: '' })).toEqual(['adresse', 'ville']);
    expect(adresseManquante({ adresse: '1 rue', codePostal: 'abcde', ville: 'X' })).toEqual(['codePostal']);
    expect(adresseManquante(ADR)).toEqual([]);
  });
  it('« Prénom NOM »', () => {
    expect(prenomNom('Léa', 'Durand')).toBe('Léa DURAND');
    expect(prenomNom('', 'durand')).toBe('DURAND');
  });
});

describe('LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — les règles d\'un contact en modification', () => {
  const base = { cle: 'k1', id: 4, titreChoix: 'Responsable de copropriété', titreLibre: '', prenom: 'Marie', nom: 'Dupont',
    tousImmeubles: true, immeubles: [] as string[],
    coordonnees: [{ cle: 'c1', id: 5, sorte: 'telephone' as const, choix: 'Portable', libre: '', valeur: '06 13 86 18 77' }] };
  it('« Modifier » devient « Valider » dès qu\'un champ change — et pas pour un simple reformatage', () => {
    expect(contactModifie(base, copieContact(base))).toBe(false);
    expect(contactModifie(base, { ...base, nom: 'Durand' })).toBe(true);
    expect(contactModifie(base, { ...base, coordonnees: [{ ...base.coordonnees[0], valeur: '0613861877' }] })).toBe(false);
    expect(contactModifie(base, { ...base, coordonnees: [] })).toBe(true);
  });
  it('un NOUVEAU contact est « modifié » dès qu\'un champ est rempli', () => {
    expect(contactModifie(null, { ...base, titreChoix: '', prenom: '', nom: '', coordonnees: [] })).toBe(false);
    expect(contactModifie(null, { ...base, titreChoix: '', prenom: 'X', nom: '', coordonnees: [] })).toBe(true);
  });
  it('« Supprimer Marie DUPONT ? » ; « Copier » seulement pour un numéro complet', () => {
    expect(nomAffiche(base)).toBe('Marie DUPONT');
    expect(nomAffiche({ ...base, prenom: '', nom: '' })).toBe('Responsable de copropriété');
    expect(telephoneComplet('06 13 86 18 77')).toBe(true);
    expect(telephoneComplet('+33 6 13 86 18 77')).toBe(true);
    expect(telephoneComplet('06 13')).toBe(false);
  });
  it('« Valider » reporte le brouillon dans la fiche : remplacé, ou ajouté s\'il est nouveau ; la copie est indépendante', () => {
    const f = { ...formulaireVide(null), contacts: [base] };
    expect(appliquerBrouillon(f, { cle: 'k1', brouillon: { ...base, nom: 'Durand' }, nouveau: false }).contacts.map((c) => c.nom)).toEqual(['Durand']);
    expect(appliquerBrouillon(f, { cle: 'k2', brouillon: { ...base, cle: 'k2', nom: 'Neuf' }, nouveau: true }).contacts.map((c) => c.nom)).toEqual(['Dupont', 'Neuf']);
    const copie = copieContact(base);
    copie.coordonnees[0].valeur = 'X';
    expect(base.coordonnees[0].valeur).toBe('06 13 86 18 77');
  });
});

describe('LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — la réponse de l\'API Adresse, la casse des noms', () => {
  it('une réponse de l\'API → rue / code postal / ville ; écarte l\'incomplet et les doublons', () => {
    const r = adressesDepuisApi({ features: [
      { properties: { name: '8 Rue Denfert-Rochereau', postcode: '92100', city: 'Boulogne-Billancourt' } },
      { properties: { name: '8 Rue Denfert-Rochereau', postcode: '92100', city: 'Boulogne-Billancourt' } },
      { properties: { name: '8 Avenue Denfert-Rochereau', postcode: '75014', city: 'Paris' } },
      { properties: { name: '8 Rue Denfert-Rochereau', postcode: '69004', city: 'Lyon' } },
      { properties: { name: '', postcode: '75001', city: 'Paris' } },
      { properties: { name: 'Lieu-dit', city: 'Quelque Part' } },
    ] });
    expect(r.map((a) => `${a.libelle}, ${a.codePostal ?? '—'} ${a.commune}`)).toEqual([
      '8 Rue Denfert-Rochereau, 92100 Boulogne-Billancourt', '8 Avenue Denfert-Rochereau, 75014 Paris',
      '8 Rue Denfert-Rochereau, 69004 Lyon', 'Lieu-dit, — Quelque Part',
    ]);
    expect(adressesDepuisApi(null)).toEqual([]);
    expect(urlApiAdresse(' 8 Rue Denfert ')).toBe('https://api-adresse.data.gouv.fr/search/?q=8%20Rue%20Denfert&limit=7&autocomplete=1');
  });
  it('prénom : « jean-pierre » → « Jean-Pierre », « MARIE CLAIRE » → « Marie Claire », accents conservés', () => {
    expect(casserPrenom('jean-pierre')).toBe('Jean-Pierre');
    expect(casserPrenom('MARIE CLAIRE')).toBe('Marie Claire');
    expect(casserPrenom('éLODIE')).toBe('Élodie');
    expect(casserPrenom("  anne-marie  d'arc ")).toBe("Anne-Marie D'Arc");
  });
  it('nom : tout en MAJUSCULES, accents conservés', () => {
    expect(casserNom('dupont-martin')).toBe('DUPONT-MARTIN');
    expect(casserNom('lefèvre')).toBe('LEFÈVRE');
    expect(casserNom(' de  la fontaine ')).toBe('DE LA FONTAINE');
  });
  it('la fiche syndic passe par l\'API Adresse avec la BAN locale en repli, et ne réécrit aucun contact à la lecture', () => {
    const client = readFileSync(join(__dirname, '../../(admin)/admin/(protected)/gestion/adressesSyndic.ts'), 'utf8');
    expect(client).toContain('fetch(urlApiAdresse(q)');
    expect(client).toContain('/api/admin/gestion/syndics/adresses?q=');
    expect(readFileSync(join(__dirname, 'syndics.ts'), 'utf8')).toContain("export const URL_API_ADRESSE = 'https://api-adresse.data.gouv.fr/search/';");
    expect(readFileSync(join(__dirname, '../../(admin)/admin/(protected)/gestion/ChampAdresseBan.tsx'), 'utf8')).toContain('https://api-adresse.data.gouv.fr/search/');
  });
});

describe('LOT FICHE-SYNDIC-LIBELLES-ET-ALIGNEMENTS — les libellés selon le type', () => {
  it('e-mail : Email direct / Email service ; téléphone : Ligne directe / Portable / Standard', () => {
    expect(libellesDe('email')).toEqual(['Email direct', 'Email service']);
    expect(libellesDe('telephone')).toEqual(['Ligne directe', 'Portable', 'Standard']);
  });
  it('un e-mail à l\'ancien libellé « Ligne directe » s\'ouvre en « Personnalisé » + son texte ; la saisie le rend tel quel', () => {
    const f = versFormulaire({
      id: 1, nom: 'X', adresse: null, codePostal: null, ville: null, telephone: null, telephone2: null, email: null, note: null,
      creeLe: '', creeParLibelle: '', majLe: null, majParLibelle: null, historique: [], coproprietes: [],
      contacts: [{ id: 2, titre: null, prenom: 'A', nom: 'B', tousImmeubles: true, immeubles: [], coordonnees: [
        { id: 3, sorte: 'email', libelle: 'Ligne directe', valeur: 'a@b.fr' },
        { id: 4, sorte: 'telephone', libelle: 'Ligne directe', valeur: '0100000000' },
        { id: 5, sorte: 'email', libelle: 'Email direct', valeur: 'c@d.fr' },
      ] }],
    });
    expect(f.contacts[0].coordonnees.map((k) => [k.choix, k.libre])).toEqual([
      [PERSONNALISE, 'Ligne directe'], ['Ligne directe', ''], ['Email direct', ''],
    ]);
    expect(versSaisie(f).contacts[0].coordonnees.map((k) => k.libelle)).toEqual(['Ligne directe', 'Ligne directe', 'Email direct']);
  });
});

describe('LOT SYNDIC-CONTACTS-PAR-COPROPRIETE — qui suit quel immeuble', () => {
  const copros = [im('12 rue X'), im('3 av Y')];
  it('contact créé depuis un BIEN : cet immeuble seul ; sans bien (ou immeuble hors fiche) : « Tous les immeubles »', () => {
    expect(suiviParDefaut(cleImmeuble('12 rue X'), copros)).toEqual({ tousImmeubles: false, immeubles: ['12 rue x'] });
    expect(suiviParDefaut(null, copros)).toEqual({ tousImmeubles: true, immeubles: [] });
    expect(suiviParDefaut(cleImmeuble('99 rue Z'), copros)).toEqual({ tousImmeubles: true, immeubles: [] });
  });
  it('la saisie : un contact ne suit que des copropriétés DE CE SYNDIC ; « tous » ⇒ aucune liste ; absent ⇒ tous', () => {
    const v = validerSyndic({ ...ADR, nom: 'Cab', immeubles: copros, contacts: [
      { nom: 'A', tousImmeubles: false, immeubles: ['12 RUE X', '99 rue Z'] },
      { nom: 'B', tousImmeubles: true, immeubles: ['3 av Y'] },
      { nom: 'C' },
    ] });
    expect(v.ok && v.syndic.contacts.map((c) => [c.tousImmeubles, c.immeubles])).toEqual([
      [false, ['12 rue x']], [true, []], [true, []],
    ]);
  });
  it('affecter / retirer une affectation ; un contact « commun » n\'est pas touché ; « suit » cet immeuble ?', () => {
    const c = { ...contactVide({ tousImmeubles: false, immeubles: ['12 rue x'] }), nom: 'A' };
    expect(affecter(c, '3 av y', true).immeubles).toEqual(['12 rue x', '3 av y']);
    expect(affecter(c, '12 rue x', false).immeubles).toEqual([]);
    const commun = contactVide();
    expect(affecter(commun, '3 av y', false)).toBe(commun);
    expect(suitImmeuble(commun, 'nimporte')).toBe(true);
    expect(suitImmeuble(c, '3 av y')).toBe(false);
    expect(contactModifie(c, affecter(c, '3 av y', true))).toBe(true);
  });
  it('« 2 contacts · 1 bien en gestion »', () => {
    expect([motContacts(0), motContacts(1), motContacts(2)]).toEqual(['aucun contact', '1 contact', '2 contacts']);
    expect([motBiens(0), motBiens(1), motBiens(3)]).toEqual(['aucun bien en gestion', '1 bien en gestion', '3 biens en gestion']);
  });
});

describe('LOT SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT — tri et filtre du catalogue', () => {
  const c = (prenom: string, nom: string, titre = '', tel = '', email = '') => ({
    ...contactVide(), prenom, nom, titreChoix: titre,
    coordonnees: [
      ...(tel ? [{ cle: 't', id: null, sorte: 'telephone' as const, choix: '', libre: '', valeur: tel }] : []),
      ...(email ? [{ cle: 'e', id: null, sorte: 'email' as const, choix: '', libre: '', valeur: email }] : []),
    ],
  });
  const liste = [c('Yves', 'Trois'), c('Élodie', 'Été', 'Service comptabilité', '06 11 22 33 44', 'elodie@x.fr'), c('', '', 'Responsable de copropriété')];
  it('trié par NOM (accents ignorés) ; un contact sans nom se range à son titre', () => {
    expect(trierParNom(liste).map((x) => x.nom || x.titreChoix)).toEqual(['Été', 'Responsable de copropriété', 'Trois']);
  });
  it('filtre : prénom, nom, titre, téléphone (chiffres ou paires), e-mail ; sans accents ni casse ; vide ⇒ tout', () => {
    expect(filtrerCatalogue(liste, '').length).toBe(3);
    expect(filtrerCatalogue(liste, 'ELODIE').map((x) => x.nom)).toEqual(['Été']);
    // « ete » trouve « Été » ET « copropriété » : la preuve que les accents ne comptent pas.
    expect(filtrerCatalogue(liste, 'ete').map((x) => x.nom || x.titreChoix)).toEqual(['Été', 'Responsable de copropriété']);
    expect(filtrerCatalogue(liste, 'elodie ete').map((x) => x.nom)).toEqual(['Été']);
    expect(filtrerCatalogue(liste, 'compta').map((x) => x.nom)).toEqual(['Été']);
    expect(filtrerCatalogue(liste, '0611').map((x) => x.nom)).toEqual(['Été']);
    expect(filtrerCatalogue(liste, '06 11 22').map((x) => x.nom)).toEqual(['Été']);
    expect(filtrerCatalogue(liste, 'x.fr').map((x) => x.nom)).toEqual(['Été']);
    expect(filtrerCatalogue(liste, 'responsable').map((x) => x.titreChoix)).toEqual(['Responsable de copropriété']);
    expect(filtrerCatalogue(liste, 'zzz')).toEqual([]);
  });
});

describe('LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — « NOM / Ville »', () => {
  it('le nom du cabinet + « / » + la ville, telle qu\'enregistrée', () => {
    expect(nomAvecVille('TEST ARNAUD', 'Asnieres Sur Seine')).toBe('TEST ARNAUD / Asnieres Sur Seine');
    expect(nomAvecVille('FONCIA', 'Courbevoie')).toBe('FONCIA / Courbevoie');
  });
  it('sans ville : le nom seul, sans « / »', () => {
    expect(nomAvecVille('FONCIA', null)).toBe('FONCIA');
    expect(nomAvecVille('FONCIA', '  ')).toBe('FONCIA');
  });
  it('le nom finit déjà par la ville : pas de doublon (accents, casse, ponctuation ignorés)', () => {
    expect(nomAvecVille('Foncia Courbevoie', 'COURBEVOIE')).toBe('Foncia Courbevoie');
    expect(nomAvecVille('Citya Asnières-sur-Seine', 'Asnieres Sur Seine')).toBe('Citya Asnières-sur-Seine');
    expect(nomAvecVille('Lyonnaise de gestion', 'Lyon')).toBe('Lyonnaise de gestion / Lyon');
  });
  it('la mention de propagation avant enregistrement nomme l\'ancien syndic « NOM / Ville »', () => {
    const connus: ImmeubleConnu[] = [{ cle: '3 av y', libelle: '3 av Y', codePostal: null, commune: null, lots: [],
      syndic: { id: 9, nom: 'FONCIA', ville: 'Lyon' } }];
    expect(apercuPropagation([im('3 av Y')], connus, 5).changements).toEqual([{ immeuble: '3 av Y', ancien: 'FONCIA / Lyon' }]);
  });
  it('le champ « Nom du cabinet » n\'est jamais réécrit : la saisie garde le nom seul', () => {
    const v = validerSyndic({ ...ADR, nom: 'FONCIA' });
    expect(v.ok && v.syndic.nom).toBe('FONCIA');
    // LOT SYNDIC-CONTACTS-ANTI-DOUBLON — CE QU'IL DISAIT AVANT : `nomAvecVille` absent du dépôt. Il y sert désormais au
    // MESSAGE de refus d'un e-mail déjà pris ; la garde porte donc sur ce qui s'écrit : le nom saisi, seul.
    const repo = readFileSync(join(__dirname, 'syndicRepo.ts'), 'utf8');
    expect(repo).toContain('const champs = [saisie.nom,');
    expect(repo).not.toMatch(/champs = \[nomAvecVille/);
  });
});

describe('LOT SYNDIC-DETACHER-DE-LA-COPROPRIETE — detacher (pur)', () => {
  it('retire SEULEMENT cet immeuble ; « Tous les immeubles » ⇒ toutes les AUTRES, explicitement', () => {
    const c = { ...contactVide({ tousImmeubles: false, immeubles: ['a', 'b'] }), nom: 'X' };
    expect(detacher(c, 'a', ['a', 'b', 'c'])).toMatchObject({ tousImmeubles: false, immeubles: ['b'] });
    const tous = { ...contactVide(), nom: 'T' };
    expect(detacher(tous, 'a', ['a', 'b', 'c'])).toMatchObject({ tousImmeubles: false, immeubles: ['b', 'c'] });
  });
});

describe('LOT SYNDIC-CONTACTS-ANTI-DOUBLON — les règles', () => {
  it('nom : sans accents, sans casse, espaces et tirets ignorés', () => {
    expect(cleNom('Mathis', 'BERCIER')).toBe(cleNom('mathis', 'Bercier'));
    expect(cleNom('Jean-Pierre', 'Dupont')).toBe(cleNom('jean pierre', 'DUPONT'));
    expect(cleNom('Élodie', 'ÉTÉ')).toBe(cleNom('elodie', 'ete'));
    expect(cleNom('', '')).toBe('');
  });
  it('e-mail : en minuscules, sans espaces', () => {
    expect(cleEmail(' Mathis.Bercier@Test.FR ')).toBe('mathis.bercier@test.fr');
  });
  it('doublons dans le syndic (le formulaire fait foi) : par e-mail, par nom', () => {
    const a = { ...contactVide(), prenom: 'Mathis', nom: 'BERCIER', coordonnees: [{ cle: 'e', id: null, sorte: 'email' as const, choix: '', libre: '', valeur: 'm@b.fr' }] };
    const b = { ...contactVide(), prenom: 'mathis', nom: 'bercier' };
    const c = { ...contactVide(), prenom: 'X', nom: 'Y', coordonnees: [{ cle: 'f', id: null, sorte: 'email' as const, choix: '', libre: '', valeur: ' M@B.FR' }] };
    expect(doublonsLocaux(b, [a]).nom).toBe(a);
    expect(doublonsLocaux(c, [a]).email).toBe(a);
    expect(doublonsLocaux(c, [b])).toEqual({ email: null, nom: null });
  });
  it('le serveur refuse le même Prénom + NOM et le même e-mail dans UN syndic ; dédoublonne un e-mail répété sur un contact', () => {
    expect(validerSyndic({ ...ADR, nom: 'S', contacts: [{ prenom: 'Mathis', nom: 'BERCIER' }, { prenom: 'mathis', nom: 'Bercier' }] }))
      .toEqual({ ok: false, motif: 'Deux contacts de ce syndic portent le même nom : mathis BERCIER.' });
    const v = validerSyndic({ ...ADR, nom: 'S', contacts: [
      { nom: 'A', coordonnees: [{ sorte: 'email', valeur: 'x@y.fr' }] }, { nom: 'B', coordonnees: [{ sorte: 'email', valeur: 'X@Y.FR' }] }] });
    expect(v.ok).toBe(false);
    const w = validerSyndic({ ...ADR, nom: 'S', contacts: [{ nom: 'A', coordonnees: [{ sorte: 'email', valeur: 'x@y.fr' }, { sorte: 'email', valeur: 'X@y.fr' }] }] });
    expect(w.ok && w.syndic.contacts[0].coordonnees).toHaveLength(1);
    // un contact sans nom (titre seul) n'est pas comparé par nom
    expect(validerSyndic({ ...ADR, nom: 'S', contacts: [{ titre: 'Service comptabilité' }, { titre: 'Service comptabilité' }] }).ok).toBe(true);
  });
  it('« Ce contact existe déjà : Prénom NOM · titre · NOM / Ville »', () => {
    expect(motDoublon({ prenom: 'Mathis', nom: 'Bercier', titre: 'Service comptabilité' }, 'TEST ARNAUD / Asnieres Sur Seine'))
      .toBe('Ce contact existe déjà : Mathis BERCIER · Service comptabilité · TEST ARNAUD / Asnieres Sur Seine');
    expect(motDoublon({ prenom: 'Mathis', nom: 'Bercier', titre: null }, 'S')).toBe('Ce contact existe déjà : Mathis BERCIER · S');
  });
});

describe('LOT SYNDIC-BLOC-PORTEFEUILLE — lotsDuPortefeuille (pur)', () => {
  const l = (id: number, numero: string, tri?: string) => ({ id, numero, adresse: null, commune: null, proprietaires: tri ? [tri.toUpperCase()] : [], triProprietaire: tri });
  const connus: ImmeubleConnu[] = [
    { cle: '12 rue x', libelle: '12 rue X', codePostal: '92400', commune: 'Courbevoie', syndic: null, lots: [l(1, '101', 'zola'), l(2, '9', 'abel'), l(3, '100')] },
    { cle: '3 av y', libelle: '3 av Y', codePostal: null, commune: null, syndic: null, lots: [l(4, '201', 'dupont')] },
    { cle: '10 av y', libelle: '10 av Y', codePostal: null, commune: null, syndic: null, lots: [l(5, '7', 'dupont')] },
    { cle: '8 rue elan', libelle: '8 rue Élan', codePostal: null, commune: null, syndic: null, lots: [l(6, '1')] },
    { cle: '5 rue vide', libelle: '5 rue Vide', codePostal: null, commune: null, syndic: null, lots: [] },
  ];
  const tous = [im('12 rue X'), im('3 av Y'), im('10 av Y'), im('8 rue Élan'), im('5 rue Vide')];
  it('copropriété du bien d’abord, puis par voie sans numéro (accents ignorés), puis par numéro ; une copropriété sans lot ne fait pas de groupe', () => {
    expect(lotsDuPortefeuille(tous, connus, '12 rue x', new Set()).map((g) => g.cle)).toEqual(['12 rue x', '3 av y', '10 av y', '8 rue elan']);
    expect(lotsDuPortefeuille(tous, connus, null, new Set()).map((g) => g.cle)).toEqual(['3 av y', '10 av y', '8 rue elan', '12 rue x']);
  });
  it('dans un groupe : par premier propriétaire, puis numéro (numérique) ; sans propriétaire à la fin', () => {
    expect(lotsDuPortefeuille([im('12 rue X')], connus, null, new Set())[0].lots.map((x) => x.numero)).toEqual(['9', '101', '100']);
  });
  it('« au Valider » seulement pour une copropriété pas encore enregistrée chez ce syndic', () => {
    const g = lotsDuPortefeuille([im('12 rue X'), im('3 av Y')], connus, null, new Set(['12 rue x']));
    expect(g.map((x) => [x.cle, x.lots.every((y) => y.aValider)])).toEqual([['3 av y', true], ['12 rue x', false]]);
  });
});

describe('LOT SYNDIC-NOTE-PAR-BIEN — la note de CE bien dans la saisie', () => {
  it('la saisie porte { lotId, texte } ; un lot non désigné est refusé ; sans note de bien, rien', () => {
    const v = validerSyndic({ ...ADR, nom: 'S', noteBien: { lotId: 101, texte: '  Clé chez la gardienne ' } });
    expect(v.ok && v.syndic.noteBien).toEqual({ lotId: 101, texte: 'Clé chez la gardienne' });
    expect(validerSyndic({ ...ADR, nom: 'S', noteBien: { lotId: 'x', texte: 'a' } }).ok).toBe(false);
    const w = validerSyndic({ ...ADR, nom: 'S' });
    expect(w.ok && w.syndic.noteBien).toBeNull();
  });
  it('le formulaire : depuis un bien, la note du bien voyage avec son lot ; sans bien, aucune', () => {
    const f = { ...formulaireVide(null, 101), noteBien: 'A' };
    expect(versSaisie(f).noteBien).toEqual({ lotId: 101, texte: 'A' });
    expect(versSaisie(formulaireVide(null)).noteBien).toBeNull();
    expect(formulaireModifie(formulaireVide(null, 101), f)).toBe(true);
  });
});

describe('les téléphones — par paires, à l\'affichage ET à la saisie', () => {
  it('« 06 13 86 18 77 », « +33 6 13 86 18 77 », et pendant la frappe', () => {
    expect(formaterTelephone('0613861877')).toBe('06 13 86 18 77');
    expect(formaterTelephone('06.13.86.18.77')).toBe('06 13 86 18 77');
    expect(formaterTelephone('+33613861877')).toBe('+33 6 13 86 18 77');
    expect(formaterTelephone('0033613861877')).toBe('+33 6 13 86 18 77');
    expect(formaterTelephone('061')).toBe('06 1');
    expect(formaterTelephone('+336')).toBe('+33 6');
    expect(formaterTelephone('+3361')).toBe('+33 6 1');
    expect(chiffresTelephone('+33 6 13 86 18 77')).toBe('+33613861877');
  });
  it('effacer un espace efface le chiffre d\'avant (sinon la touche semblerait bloquée)', () => {
    expect(saisieTelephone('06 13', '06 1')).toBe('06 1');
    expect(saisieTelephone('06 13 ', '06 13')).toBe('06 1');
    expect(saisieTelephone('06 1', '06 13')).toBe('06 13');
  });
  it('la ligne d\'un contact replié : titre · prénom nom · e-mails · téléphones, sans « · · »', () => {
    expect(ligneContact({ titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', emails: ['l@d.fr'], telephones: ['0613861877'] }))
      .toBe('Responsable de copropriété · Léa Durand · l@d.fr · 06 13 86 18 77');
    expect(ligneContact({ titre: '', prenom: '', nom: 'Durand', emails: [], telephones: [] })).toBe('Durand');
  });
});

describe('les adresses — « 25 rue Edith Cavell, 92400 Courbevoie »', () => {
  it('rue, code postal, commune ; jamais un code postal ou une commune répétés', () => {
    expect(adresseImmeuble('25 rue Edith Cavell', '92400', 'Courbevoie')).toBe('25 rue Edith Cavell, 92400 Courbevoie');
    expect(adresseImmeuble('25 rue Edith Cavell 92400 Courbevoie', '92400', 'Courbevoie')).toBe('25 rue Edith Cavell 92400 Courbevoie');
    expect(adresseImmeuble('25 rue Edith Cavell', null, null)).toBe('25 rue Edith Cavell');
    expect(communeLisible('COURBEVOIE')).toBe('Courbevoie');
    expect(communeLisible('LEVALLOIS-PERRET')).toBe('Levallois-Perret');
    expect(communeLisible('Courbevoie')).toBe('Courbevoie');
  });
});

describe('le dépôt — deux portes d\'écriture, rien n\'est effacé', () => {
  beforeEach(() => { appels.length = 0; reponses = []; });

  it('création : syndic (adresse, CP, ville, deux standards), contact, coordonnée, copropriété et lien, auteur de la session', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [(sql) => (sql.includes('INSERT INTO gestion_syndic ') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('INSERT INTO gestion_syndic_contact') ? { rows: [{ id: '21' }] } : undefined)];
    const v = validerSyndic({ nom: 'Cabinet TEST', adresse: '1 rue A', codePostal: '75001', ville: 'Paris',
      telephone: '01 00 00 00 00', telephone2: '02 00 00 00 00', email: 'x@test.fr',
      contacts: [{ titre: 'Responsable de copropriété', nom: 'Durand', coordonnees: [{ sorte: 'email', libelle: 'Ligne directe', valeur: 'd@test.fr' }] }],
      immeubles: [im('12 rue X', '92400', 'Courbevoie')] });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(null, v.syndic, auteur)).toEqual({ ok: true, id: 11 });
    const sqls = appels.map((a) => norm(a.sql));
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_syndic '))?.params)
      .toEqual(['Cabinet TEST', '1 rue A', '75001', 'Paris', '0100000000', '0200000000', 'x@test.fr', null, 7, 'arno']);
    expect(sqls.some((s) => s.includes('INSERT INTO gestion_syndic_coordonnee'))).toBe(true);
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_copropriete '))?.params)
      .toEqual([cleImmeuble('12 rue X'), '12 rue X', '92400', 'Courbevoie', 7, 'arno']);
    expect(sqls.some((s) => s.includes('ON CONFLICT (cle_immeuble) DO UPDATE SET code_postal = coalesce(gestion_copropriete.code_postal'))).toBe(true);
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_copropriete_syndic'))?.params).toEqual([cleImmeuble('12 rue X'), 11, 7, 'arno']);
  });

  it('un immeuble repris d\'un AUTRE syndic : son lien est FERMÉ (« changement de syndic »), jamais effacé', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('FOR UPDATE OF cs') ? { rows: [
        { lien_id: '31', copro_id: '41', cle: cleImmeuble('3 av Y'), syndic_id: '99' },
        { lien_id: '32', copro_id: '42', cle: cleImmeuble('ancien immeuble'), syndic_id: '11' },
      ] } : undefined),
    ];
    const v = validerSyndic({ ...ADR, nom: 'Cabinet TEST', immeubles: [im('3 av Y')] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(11, v.syndic, auteur);
    const fermetures = appels.filter((a) => a.sql.includes('UPDATE gestion_copropriete_syndic SET fin = now()'));
    expect(fermetures.map((f) => [f.params[0], f.params[3]])).toEqual([['31', 'changement de syndic'], ['32', 'retrait']]);
    expect(appels.some((a) => /\bDELETE\b/i.test(a.sql))).toBe(false);
  });

  it('un syndic inexistant OU SUPPRIMÉ est refusé AVANT toute écriture', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    const v = validerSyndic({ ...ADR, nom: 'X' });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(404, v.syndic, auteur)).toEqual({ ok: false, motif: 'Ce syndic n’existe pas.' });
    expect(appels.filter((a) => /^\s*(INSERT|UPDATE)/i.test(a.sql))).toEqual([]);
  });

  it('SUPPRIMER : liens fermés (« suppression du syndic »), contacts retirés, supprime_le, ligne au journal — aucun DELETE', async () => {
    const { supprimerSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_annuaire_lot') ? { rows: [
        { id: '1', numero: '101', immeuble: '12 rue X', adresse: '12 rue X', commune: 'Paris', code_postal: '75001' },
        { id: '2', numero: '102', immeuble: '12 rue X', adresse: '12 rue X', commune: 'Paris', code_postal: '75001' },
      ] } : undefined),
      (sql) => (sql.includes('SELECT nom FROM gestion_syndic') ? { rows: [{ nom: 'Cabinet TEST' }] } : undefined),
      (sql) => (sql.includes('FOR UPDATE OF cs') ? { rows: [{ id: '31', cle: cleImmeuble('12 rue X') }] } : undefined),
    ];
    expect(await supprimerSyndic(11, auteur)).toEqual({ ok: true, coproprietes: 1 });
    const sqls = appels.map((a) => norm(a.sql));
    expect(sqls.some((s) => s.includes("fin_motif = 'suppression du syndic'"))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE gestion_syndic_contact SET retire_le = now()'))).toBe(true);
    expect(sqls.some((s) => s.includes('UPDATE gestion_syndic SET supprime_le = now()'))).toBe(true);
    const journal = appels.find((a) => a.sql.includes('INSERT INTO gestion_journal'));
    expect(norm(journal?.sql ?? '')).toContain("VALUES ('annuaire', $1, 'suppression_syndic'");
    expect(journal?.params).toEqual([11, 'Cabinet TEST', 'syndic supprimé — 1 copropriété(s), 2 bien(s) repassent sans syndic', 7, 'arno']);
    expect(appels.some((a) => /\bDELETE\b/i.test(a.sql))).toBe(false);
  });

  it('SUPPRIMER un syndic inconnu ou déjà supprimé : refusé avant toute écriture', async () => {
    const { supprimerSyndic } = await import('./syndicRepo');
    expect((await supprimerSyndic(404, auteur)).ok).toBe(false);
    expect(appels.filter((a) => /^\s*(INSERT|UPDATE)/i.test(a.sql))).toEqual([]);
  });

  it('les listes et la fiche ignorent les syndics supprimés', () => {
    const src = norm(readFileSync(join(__dirname, 'syndicRepo.ts'), 'utf8'));
    expect(src).toContain('FROM gestion_syndic s WHERE s.supprime_le IS NULL');
    expect(src).toContain('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL');
  });

  it('la BAN LOCALE : un numéro et une voie, paramètres liés, code postal déduit (Paris, nos lots, DILA) — aucun réseau', async () => {
    const { adressesBanLocale } = await import('./syndicRepo');
    expect(await adressesBanLocale('rue edith')).toEqual([]);
    expect(appels).toEqual([]);
    reponses = [(sql) => (sql.includes('FROM adresse_ban') ? { rows: [
      { numero: 25, suffixe: null, nom_voie: 'Rue Edith Cavell', nom_commune: 'Courbevoie', code_postal: '92400' },
    ] } : undefined)];
    const r = await adressesBanLocale('25 rue Édith Cav');
    expect(appels[0].params).toEqual([25, null, 'rue edith cav', 6]);
    expect(r).toEqual([{ cle: cleImmeuble('25 Rue Edith Cavell'), libelle: '25 Rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' }]);
    const sql = norm(appels[0].sql);
    expect(sql).toContain("'750' || substr(b.insee_commune, 4, 2)");
    expect(sql).toContain('FROM gestion_annuaire_lot lo');
    expect(sql).toContain('FROM dila_import d');
    const src = readFileSync(join(__dirname, 'syndicRepo.ts'), 'utf8');
    expect(src).not.toMatch(/fetch\(|https?:\/\//);
  });

  it('les lots d\'une copropriété se lisent par leur immeuble normalisé, avec leur code postal et leur commune', async () => {
    const { immeublesConnus } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_annuaire_lot') ? { rows: [
        { id: '1', numero: '101', immeuble: '12 Rue X', adresse: '12 rue X', commune: 'COURBEVOIE', code_postal: '92400' },
        { id: '2', numero: '102', immeuble: '12 rue x', adresse: '12 rue X', commune: 'COURBEVOIE', code_postal: '92400' },
        { id: '3', numero: '103', immeuble: null, adresse: '5 rue Z', commune: 'Paris', code_postal: null },
      ] } : undefined),
      (sql) => (sql.includes('FROM gestion_copropriete c') ? { rows: [
        { cle: cleImmeuble('12 rue X'), libelle: '12 rue X', code_postal: null, commune: null, syndic_id: '11', syndic_nom: 'Cab' },
      ] } : undefined),
    ];
    const l = await immeublesConnus();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ codePostal: '92400', commune: 'Courbevoie', syndic: { id: 11, nom: 'Cab' } });
    expect(l[0].lots.map((x) => x.numero)).toEqual(['101', '102']);
  });

  it('AFFECTATIONS : un contact qui suit un immeuble précis reçoit son affectation (tous_immeubles = faux, auteur)', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [(sql) => (sql.includes('INSERT INTO gestion_syndic ') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('INSERT INTO gestion_syndic_contact ') ? { rows: [{ id: '21' }] } : undefined),
      (sql) => (sql.includes('SELECT id::text FROM gestion_copropriete WHERE cle_immeuble = ANY') ? { rows: [{ id: '41' }] } : undefined)];
    const v = validerSyndic({ ...ADR, nom: 'Cab', immeubles: [im('12 rue X')], contacts: [{ nom: 'A', tousImmeubles: false, immeubles: ['12 rue X'] }] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(null, v.syndic, auteur);
    const i = appels.findIndex((a) => a.sql.includes('INSERT INTO gestion_copropriete_syndic'));
    const j = appels.findIndex((a) => a.sql.includes('INSERT INTO gestion_syndic_contact '));
    expect(i).toBeLessThan(j); // les copropriétés D'ABORD
    expect(appels[j].params[6]).toBe(false);
    expect(appels.find((a) => a.sql.includes('INSERT INTO gestion_syndic_contact_copropriete'))?.params).toEqual([21, '41', 7, 'arno']);
  });

  it('AFFECTATIONS : passer à « tous les immeubles » RETIRE les affectations (historisées), jamais effacées', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('FROM gestion_syndic_contact WHERE syndic_id = $1 AND retire_le IS NULL FOR UPDATE') ? { rows: [{ id: '21' }] } : undefined),
      (sql) => (sql.includes('FROM gestion_syndic_contact_copropriete') && sql.includes('FOR UPDATE') ? { rows: [{ id: '51', copropriete_id: '41' }] } : undefined),
    ];
    const v = validerSyndic({ ...ADR, nom: 'Cab', immeubles: [im('12 rue X')], contacts: [{ id: 21, nom: 'A', tousImmeubles: true }] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(11, v.syndic, auteur);
    const r = appels.find((a) => a.sql.includes('UPDATE gestion_syndic_contact_copropriete SET retire_le = now()') && a.params[0] instanceof Array);
    expect(r?.params).toEqual([['51'], 'arno', 'tous les immeubles']);
  });

  it('AFFECTATIONS : une copropriété qui QUITTE le syndic retire les affectations de ses contacts', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE') ? { rows: [{ id: '11' }] } : undefined),
      (sql) => (sql.includes('FOR UPDATE OF cs') ? { rows: [{ lien_id: '32', copro_id: '42', cle: cleImmeuble('ancien'), syndic_id: '11' }] } : undefined),
    ];
    const v = validerSyndic({ ...ADR, nom: 'Cab', immeubles: [] });
    if (!v.ok) throw new Error(v.motif);
    await enregistrerSyndic(11, v.syndic, auteur);
    const r = appels.find((a) => norm(a.sql).includes('UPDATE gestion_syndic_contact_copropriete a SET retire_le = now()'));
    expect(r?.params).toEqual([11, '42', 'arno', 'copropriété retirée du syndic']);
    expect(appels.some((a) => /\bDELETE\b/i.test(a.sql))).toBe(false);
  });

  it('ANTI-DOUBLON : un e-mail déjà porté par un contact d’un AUTRE syndic est refusé AVANT toute écriture', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    reponses = [(sql) => (sql.includes('FROM gestion_syndic_contact c JOIN gestion_syndic s') ? { rows: [
      { prenom: 'Mathis', nom: 'BERCIER', titre: null, syndic_id: '9', syndic_nom: 'AUTRE', syndic_ville: 'Lyon', emails: [' M@B.fr'] },
    ] } : undefined)];
    const v = validerSyndic({ ...ADR, nom: 'Cab', contacts: [{ nom: 'X', coordonnees: [{ sorte: 'email', valeur: 'm@b.FR' }] }] });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(11, v.syndic, auteur))
      .toEqual({ ok: false, motif: 'L’adresse e-mail m@b.fr appartient déjà à Mathis BERCIER (AUTRE / Lyon).' });
    expect(appels.filter((a) => /^\s*(INSERT|UPDATE)/i.test(a.sql))).toEqual([]);
    expect(appels[0].params).toEqual([11]); // les contacts des AUTRES syndics seulement
  });

  it('ANTI-DOUBLON : doublonsAilleurs — e-mail (bloquant) et nom (avertissement), normalisés', async () => {
    const { doublonsAilleurs } = await import('./syndicRepo');
    reponses = [(sql) => (sql.includes('FROM gestion_syndic_contact c JOIN gestion_syndic s') ? { rows: [
      { prenom: 'Mathis', nom: 'BERCIER', titre: 'Compta', syndic_id: '9', syndic_nom: 'AUTRE', syndic_ville: 'Lyon', emails: ['m@b.fr'] },
      { prenom: 'Jean-Pierre', nom: 'Dupont', titre: null, syndic_id: '8', syndic_nom: 'TIERS', syndic_ville: null, emails: null },
    ] } : undefined)];
    const r = await doublonsAilleurs(11, 'jean pierre', 'DUPONT', [' M@B.FR']);
    expect(r.emails.map((c) => c.nom)).toEqual(['BERCIER']);
    expect(r.noms.map((c) => c.syndicNom)).toEqual(['TIERS']);
    expect('emails' in r.emails[0]).toBe(false);
  });

  it('ANTI-DOUBLON : un contact retiré libère ses coordonnées (son e-mail redevient disponible)', () => {
    const src = norm(readFileSync(join(__dirname, 'syndicRepo.ts'), 'utf8'));
    expect(src).toContain('UPDATE gestion_syndic_coordonnee SET retire_le = now() WHERE contact_id = ANY($1::bigint[]) AND retire_le IS NULL');
    expect(src).toContain('UPDATE gestion_syndic_coordonnee k SET retire_le = now() FROM gestion_syndic_contact c');
  });

  it('PORTEFEUILLE : chaque lot porte ses propriétaires (« M. JULLIEN ») et la clé de tri du premier', async () => {
    const { immeublesConnus } = await import('./syndicRepo');
    reponses = [(sql) => (sql.includes('FROM gestion_annuaire_lot lo') ? { rows: [
      { id: '1', numero: '62', immeuble: '12 rue X', adresse: '12 rue des Pavillons', commune: 'PUTEAUX', code_postal: '92800',
        proprietaires: [{ affiche: 'M. JULLIEN', tri: 'jullien' }, { affiche: 'Mme X', tri: 'x' }] },
      { id: '2', numero: '63', immeuble: '12 rue X', adresse: '12 rue des Pavillons', commune: 'PUTEAUX', code_postal: '92800', proprietaires: null },
    ] } : undefined)];
    const [i] = await immeublesConnus();
    expect(i.lots.map((x) => [x.numero, x.proprietaires, x.triProprietaire])).toEqual([['62', ['M. JULLIEN', 'Mme X'], 'jullien'], ['63', [], undefined]]);
    const sql = norm(appels.find((a) => a.sql.includes('FROM gestion_annuaire_lot lo'))?.sql ?? '');
    expect(sql).toContain('FROM gestion_annuaire_proprietaire p WHERE p.id = lo.proprietaire_id AND p.supprime_le IS NULL');
    expect(sql).toContain('WHERE lp.lot_id = lo.id AND lp.jusqu_a IS NULL AND p2.supprime_le IS NULL');
  });

  it('NOTE PAR BIEN : la fiche lue pour un lot porte la note du couple (lot, syndic), et elle seule', async () => {
    const { ficheSyndic } = await import('./syndicRepo');
    reponses = [
      (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL') ? { rows: [{ id: '11', nom: 'S', cree_le: '', cree_par_libelle: 'x' }] } : undefined),
      (sql) => (sql.includes('FROM gestion_syndic_note_bien') ? { rows: [{ texte: 'Note du bien A' }] } : undefined),
    ];
    expect((await ficheSyndic(11, 101))?.noteBien).toBe('Note du bien A');
    expect(appels.find((a) => a.sql.includes('FROM gestion_syndic_note_bien'))?.params).toEqual([101, 11]);
    appels.length = 0;
    expect((await ficheSyndic(11))?.noteBien).toBeNull();
    expect(appels.some((a) => a.sql.includes('gestion_syndic_note_bien'))).toBe(false);
  });

  it('NOTE PAR BIEN : modifiée ⇒ ancienne FERMÉE + nouvelle ; vidée ⇒ fermée seulement ; inchangée ⇒ rien', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    const enregistrer = async (texte: string, enCours: string | null): Promise<string[]> => {
      appels.length = 0;
      reponses = [
        (sql) => (sql.includes('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL FOR UPDATE') ? { rows: [{ id: '11' }] } : undefined),
        (sql) => (sql.includes('FROM gestion_annuaire_lot WHERE id = $1') ? { rows: [{ id: '101' }] } : undefined),
        (sql) => (sql.includes('FROM gestion_syndic_note_bien') && sql.includes('FOR UPDATE') ? { rows: enCours === null ? [] : [{ id: '5', texte: enCours }] } : undefined),
      ];
      const v = validerSyndic({ ...ADR, nom: 'S', noteBien: { lotId: 101, texte } });
      if (!v.ok) throw new Error(v.motif);
      await enregistrerSyndic(11, v.syndic, auteur);
      return appels.filter((a) => /gestion_syndic_note_bien/.test(a.sql) && /^\s*(INSERT|UPDATE)/.test(a.sql)).map((a) => norm(a.sql).trim().split(' ').slice(0, 3).join(' '));
    };
    expect(await enregistrer('B', 'A')).toEqual(['UPDATE gestion_syndic_note_bien SET', 'INSERT INTO gestion_syndic_note_bien']);
    expect(await enregistrer('', 'A')).toEqual(['UPDATE gestion_syndic_note_bien SET']);
    expect(await enregistrer('A', 'A')).toEqual([]);
    expect(await enregistrer('Neuve', null)).toEqual(['INSERT INTO gestion_syndic_note_bien']);
    // la note générale du cabinet n'est pas touchée : le champ « note » vaut ce que porte la saisie (ici vide → null)
    expect(appels.some((a) => /DELETE/i.test(a.sql))).toBe(false);
  });

  it('NOTE PAR BIEN : un bien inexistant est refusé AVANT toute écriture', async () => {
    const { enregistrerSyndic } = await import('./syndicRepo');
    const v = validerSyndic({ ...ADR, nom: 'S', noteBien: { lotId: 999, texte: 'x' } });
    if (!v.ok) throw new Error(v.motif);
    expect(await enregistrerSyndic(11, v.syndic, auteur)).toEqual({ ok: false, motif: 'Note du bien : ce bien n’existe pas.' });
    expect(appels.filter((a) => /^\s*(INSERT|UPDATE)/i.test(a.sql))).toEqual([]);
  });

  it('le dépôt ne contient aucun DELETE', () => {
    expect(readFileSync(join(__dirname, 'syndicRepo.ts'), 'utf8')).not.toMatch(/DELETE FROM/i);
  });
});

describe('les migrations 324 et 325 — ajout uniquement', () => {
  const lire = (f: string): string => readFileSync(join(__dirname, `../../../db/migrations/${f}`), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  it('324 : cinq tables, aucune suppression ni renommage ; un seul syndic EN COURS par immeuble', () => {
    const code = lire('324_gestion_annuaire_syndics.sql');
    for (const t of ['gestion_syndic ', 'gestion_copropriete ', 'gestion_copropriete_syndic ', 'gestion_syndic_contact ', 'gestion_syndic_coordonnee ']) {
      expect(code).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    }
    expect(code).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER TABLE/i);
    expect(norm(code)).toContain('CREATE UNIQUE INDEX IF NOT EXISTS gestion_copropriete_syndic_en_cours ON gestion_copropriete_syndic (copropriete_id) WHERE fin IS NULL');
  });
  it('326 : la colonne « tous les immeubles » (défaut VRAI) et la table d\'affectations historisée — rien d\'autre', () => {
    const code = norm(lire('326_gestion_syndic_contact_copropriete.sql'));
    expect(code).toContain('ALTER TABLE gestion_syndic_contact ADD COLUMN IF NOT EXISTS tous_immeubles boolean NOT NULL DEFAULT true;');
    expect(code).toContain('CREATE TABLE IF NOT EXISTS gestion_syndic_contact_copropriete (');
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS gestion_syndic_contact_copropriete_en_cours ON gestion_syndic_contact_copropriete (contact_id, copropriete_id) WHERE retire_le IS NULL;');
    expect(code).not.toMatch(/\bDROP\b|\bRENAME\b|\bUPDATE\b|\bDELETE\b/i);
    expect(code.match(/ALTER TABLE/g)?.length).toBe(1);
  });
  it('327 : un index d’unicité sur l’e-mail normalisé des coordonnées non retirées — rien d’autre', () => {
    const code = norm(lire('327_gestion_syndic_email_unique.sql')).trim();
    expect(code).toBe("CREATE UNIQUE INDEX IF NOT EXISTS gestion_syndic_coordonnee_email_unique ON gestion_syndic_coordonnee (lower(regexp_replace(valeur, '\\s+', '', 'g'))) WHERE sorte = 'email' AND retire_le IS NULL;");
  });
  it('328 : une table de notes par (lot, syndic), historisée (fin), une seule en cours — ajout uniquement', () => {
    const code = norm(lire('328_gestion_syndic_note_bien.sql'));
    expect(code).toContain('CREATE TABLE IF NOT EXISTS gestion_syndic_note_bien (');
    expect(code).toContain('lot_id bigint NOT NULL REFERENCES gestion_annuaire_lot(id)');
    expect(code).toContain('syndic_id bigint NOT NULL REFERENCES gestion_syndic(id)');
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS gestion_syndic_note_bien_en_cours ON gestion_syndic_note_bien (lot_id, syndic_id) WHERE fin IS NULL;');
    expect(code).not.toMatch(/\bDROP\b|\bRENAME\b|ALTER TABLE|\bUPDATE\b|\bDELETE\b|INSERT/i);
  });
  it('325 : uniquement des ADD COLUMN', () => {
    const lignes = lire('325_gestion_syndic_finitions.sql').split('\n').map((l) => l.trim()).filter((l) => l !== '');
    expect(lignes.length).toBe(8);
    for (const l of lignes) expect(l).toMatch(/^ALTER TABLE gestion_(syndic|copropriete) ADD COLUMN IF NOT EXISTS \w+ (text|timestamptz|bigint);$/);
  });
});

describe('les écrans', () => {
  const g = join(__dirname, '../../(admin)/admin/(protected)/gestion');
  const lire = (f: string): string => readFileSync(join(g, f), 'utf8');

  /* LOT SYNDIC-NOM-VILLE-ET-NOTE-VIDE — CE QU'IL DISAIT AVANT : le nom seul, TRONQUÉ par « … » (ellipsis). Arno :
     « NOM / Ville », et « JAMAIS tronqué par des … » : le nom passe à la ligne. */
  it('le bouton : « NOM / Ville », jamais tronqué (il passe à la ligne), sinon « Créer le syndic »', () => {
    const src = lire('BoutonSyndic.tsx');
    expect(src).toContain('const nom = syndic !== null ? nomAvecVille(syndic.nom, syndic.ville)');
    expect(src).toContain("{syndic !== null ? nom : 'Créer le syndic'}");
    expect(src).not.toContain('text-overflow:ellipsis');
    expect(src).toContain('.bsy-mot{display:block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;');
  });

  // (LOT SYNDIC-NOTE-PAR-BIEN : le bouton reçoit aussi le lot de la carte — `lotId` — pour la note de CE bien.)
  it('le bouton a EXACTEMENT le format de « Historique » : même classe, même retrait de 14 px que le pied de carte', () => {
    const src = lire('BoutonSyndic.tsx');
    expect(src).toContain('svv-btn svv-btn-outline gst-btn ann-carte-bouton ann-carte-bouton--large bsy');
    expect(src).toContain('.bsy-ligne{display:flex;flex-direction:column;align-items:stretch;padding:0 14px;');
    expect(lire('Annuaire.tsx')).toContain('.ann-carte-pied{display:flex;flex-direction:column;gap:.4rem;padding:0 14px 12px;');
    expect(lire('Annuaire.tsx')).toContain('<BoutonSyndic immeuble={f.immeuble} dansLaFiche lotId={f.id} />');
  });

  it('rose franc par des jetons, en Clair ET en Sombre ; « Créer le syndic » reste blanc', () => {
    const src = lire('BoutonSyndic.tsx');
    expect(src).toContain('background:var(--color-svv-syndic-fond);color:var(--color-svv-syndic-texte);border-color:var(--color-svv-syndic-bord)');
    expect(src).toContain('.ann-carte-bouton.bsy{background:var(--color-svv-surface)');
    const css = readFileSync(join(__dirname, '../../globals.css'), 'utf8');
    expect(css.match(/--color-svv-syndic-fond:/g)?.length).toBe(3); // Clair, Sombre, Sombre « système »
    expect(css).toContain('--color-svv-syndic-texte: #9d174d;');
    expect(css.match(/--color-svv-syndic-texte: #f9a8d4;/g)?.length).toBe(2);
  });

  it('dans la carte du bien, À LA PLACE de la ligne SURFACE (entre le cartouche et les faits)', () => {
    const src = lire('Annuaire.tsx');
    const carte = src.slice(src.indexOf('function CarteBien'), src.indexOf('function VueProprietaire'));
    const i = carte.indexOf('<BoutonSyndic immeuble={b.immeuble} lotId={b.id} />');
    expect(i).toBeGreaterThan(carte.indexOf('<CartoucheEvenement'));
    expect(i).toBeLessThan(carte.indexOf('className="ann-carte-faits"'));
    expect(src).toContain('{o.lotId !== null && <BoutonSyndic immeuble={o.immeuble} lotId={o.lotId} />}');
  });

  it('l\'entrée « Syndics » est SOUS « Événements », et « Annuaire » garde sa place après', () => {
    const src = lire('PleinEcranBoite.tsx');
    const ev = src.indexOf('<span className="cm-texte">Événements</span>');
    const sy = src.indexOf('<span className="cm-texte">Syndics</span>');
    const an = src.indexOf('<span className="cm-texte">Annuaire</span>');
    expect(ev).toBeGreaterThan(-1);
    expect(sy).toBeGreaterThan(ev);
    expect(an).toBeGreaterThan(sy);
  });

  it('la fiche : pied hors de la zone qui défile, Annuler / Valider, abandon confirmé, croix = Annuler', () => {
    const src = lire('FicheSyndic.tsx');
    expect(src.indexOf('className="fsy-corps"')).toBeLessThan(src.indexOf('className="fsy-pied"'));
    expect(src).toContain('.fsy-corps{flex:1 1 auto;min-height:0;overflow-y:auto;');
    expect(src).toContain('.fsy-pied{flex:0 0 auto;');
    expect(src).toContain('Abandonner les modifications ?');
    expect(src).toContain('aria-label="Annuler et fermer" onClick={annuler}');
    expect(src).toContain("{envoi ? 'Enregistrement…' : 'Valider'}");
  });

  it('la fiche est COMPACTE : aucune base flex sur un champ hors d\'une rangée (elle devenait une hauteur)', () => {
    const src = lire('FicheSyndic.tsx');
    const regle = src.slice(src.indexOf('.fsy-champ{'), src.indexOf('}', src.indexOf('.fsy-champ{')));
    expect(regle).not.toMatch(/flex:/);
    expect(src).toContain('.fsy-duo > .fsy-champ{flex:1 1 11rem}');
  });

  it('contacts repliés, « Valider ce contact », « Modifier » ; second standard ; liste des biens ; suppression confirmée', () => {
    const src = lire('FicheSyndic.tsx');
    // LOT FICHE-SYNDIC-CONTACTS-TROIS-ETATS — CE QU'IL DISAIT AVANT : 'Valider ce contact' (devenu « Valider » du contact).
    expect(src).not.toMatch(/>\s*Retirer ce contact\s*</); // le lien a disparu (accord d'Arno) ; seul un commentaire le cite
    // LOT SYNDIC-CATALOGUE-DANS-NOUVEAU-CONTACT — CE QU'IL DISAIT AVANT : 'Catalogue des contacts', 'Autres contacts du
    // cabinet', 'Contacts pour cet immeuble'. Le titre redevient « Autres contacts » ; le reste passe dans le « Catalogue ».
    // (LOT SYNDIC-CATALOGUE-ANNULER-ET-TITRE : « Catalogue des contacts DU SYNDIC » est le nouveau titre du bloc
    //  Catalogue, voulu par Arno ; seul l'ancien titre de SECTION, exact, reste interdit.)
    expect(src).not.toMatch(/>\s*(Catalogue des contacts\s*<|Contacts pour cet immeuble|Autres contacts du cabinet)/);
    expect(src).toContain('Catalogue des contacts du syndic');
    // LOT SYNDIC-MODALE-DEUX-BLOCS — « Autres contacts » devient « Contacts de cet immeuble » / « Contacts du cabinet ».
    for (const mot of ['Supprimer ce contact', 'Nouveau contact', '+ Ajouter un contact', 'Contacts de cette copropriété', 'Contacts du cabinet', 'Ajouter un contact syndic à cette copropriété',
      'Gérer ce syndic', 'Coordonnées et contacts du cabinet', 'Syndic de l’immeuble · ', 'Catalogue',
      'Ajouter à cette copropriété', 'Déjà rattaché à :', 'Immeubles suivis', 'Tous les immeubles', '+ Affecter un contact', 'Créer un nouveau contact', 'commun', 'Ajouter un second numéro de standard',
      // LOT SYNDIC-BLOC-PORTEFEUILLE — CE QU'IL DISAIT AVANT : 'Biens qui recevront ce syndic', 'déjà rattachée à',
      // 'Oui, la prendre' (le champ d'ajout d'une copropriété, retiré, et la liste remplacée par les lots du portefeuille).
      'Lots du portefeuille liés à ce syndic', 'au Valider', 'propriétaire non renseigné', 'Supprimer ce syndic', 'Oui, supprimer ce syndic',
      'perdra ce syndic', 'Rattacher cet immeuble à ce syndic', 'Créer un nouveau syndic', 'Retirer ? Le lien passe en historique.']) {
      expect(src).toContain(mot);
    }
    // LOT SYNDIC-ADRESSE-AUTOCOMPLETE-ET-CASSE-NOMS — CE QU'IL DISAIT AVANT : la fiche appelait la BAN locale seule et
    // jamais l'API en ligne. Arno demande la source des fiches (API Adresse), la BAN locale en repli : `chercherAdresses`.
    expect(src).toContain('chercherAdresses(');
  });
});
