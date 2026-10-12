import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  biensDeLaCopropriete, biensDuCabinet, biensPartagesDuCabinet, biensPartagesParGroupe, ligneBienPartage, motAvertissementPartage,
  motConfirmationRattachement, motFichePartagee, niveauxModifies,
} from './partageSyndic';
import { versFormulaire, type FicheSyndic, type ImmeubleConnu } from './syndics';

/**
 * ══ 🔴🔴 LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE — LA RÈGLE MÉTIER, ÉPROUVÉE ══════════════════════════════════════════════
 * « Une fiche syndic n'existe qu'UNE fois et se partage par LIEN, jamais par copie. » 🔒 Données de banc.
 */
const FICHE = {
  id: 11, nom: '_BANC Cabinet', adresse: '1 rue _BANC', codePostal: '75001', ville: 'Paris', telephone: '0100000000', telephone2: null,
  email: 'standard@banc.invalid', note: null, creeLe: '', creeParLibelle: 'banc', majLe: null, majParLibelle: null,
  contacts: [
    { id: 4, titre: 'Responsable de copropriété', prenom: 'Léa', nom: 'Durand', tousImmeubles: false, immeubles: ['25 rue edith cavell'], coordonnees: [] },
    { id: 5, titre: 'Comptable', prenom: 'Paul', nom: 'Commun', tousImmeubles: false, immeubles: ['15 rue carle hebert'], coordonnees: [] },
  ],
  coproprietes: [
    { id: 6, cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie', debut: '',
      lots: [{ id: 1, numero: '219', adresse: '25 rue Edith Cavell', commune: null }, { id: 2, numero: '220', adresse: '25 rue Edith Cavell', commune: null },
        { id: 9, numero: '990', adresse: '25 bis rue Edith Cavell', commune: null }],
      adresses: [{ cle: '25 bis rue edith cavell', libelle: '25 bis rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' }] },
    { id: 7, cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', debut: '',
      lots: [{ id: 3, numero: '373', adresse: '15 rue Carle Hebert', commune: null }] },
  ],
  historique: [], anciens: [],
} as unknown as FicheSyndic;

describe('🔴 RÈGLE 1 — le CABINET : une fiche, commune à tous ses biens, quel que soit l’immeuble', () => {
  it('tous les biens du cabinet, adresses secondaires comprises, sans doublon', () => {
    expect(biensDuCabinet(FICHE).map((b) => b.numero)).toEqual(['219', '220', '990', '373']);
  });
  it('la carte d’un bien : les AUTRES biens qui partagent la fiche, lus dans l’annuaire des immeubles', () => {
    const IM = [
      { cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: null, commune: null, syndic: { id: 11, nom: 'x' }, lots: FICHE.coproprietes[0].lots.slice(0, 2) },
      { cle: '25 bis rue edith cavell', libelle: '25 bis rue Edith Cavell', codePostal: null, commune: null, syndic: { id: 11, nom: 'x' }, lots: [FICHE.coproprietes[0].lots[2]],
        principale: { cle: '25 rue edith cavell', libelle: '25 rue Edith Cavell', codePostal: null, commune: null } },
      { cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert', codePostal: null, commune: null, syndic: { id: 11, nom: 'x' }, lots: FICHE.coproprietes[1].lots },
      { cle: '1 rue ailleurs', libelle: '1 rue Ailleurs', codePostal: null, commune: null, syndic: { id: 99, nom: 'autre' }, lots: [{ id: 50, numero: '50', adresse: '1 rue Ailleurs', commune: null }] },
    ] as ImmeubleConnu[];
    const b = biensPartagesDuCabinet(IM, 11, 1);
    expect(b.map(ligneBienPartage)).toEqual(['15 rue Carle Hebert — lot 373', '25 bis rue Edith Cavell — lot 990', '25 rue Edith Cavell — lot 220']);
    /* 🔴 LOT PARTAGE-CABINET-IMMEUBLE — les deux groupes : « Dans cet immeuble » (adresse secondaire comprise), puis
       « Autres immeubles du cabinet ». */
    const g = biensPartagesParGroupe(IM, 11, 1, '25 rue edith cavell');
    expect(g.immeuble.map(ligneBienPartage)).toEqual(['25 bis rue Edith Cavell — lot 990', '25 rue Edith Cavell — lot 220']);
    expect(g.autres.map(ligneBienPartage)).toEqual(['15 rue Carle Hebert — lot 373']);
    /* Depuis l'adresse SECONDAIRE, le même immeuble. */
    expect(biensPartagesParGroupe(IM, 11, 9, '25 bis rue edith cavell').immeuble.map((x) => x.numero)).toEqual(['219', '220']);
    expect(biensPartagesParGroupe(IM, 11, 3, '15 rue carle hebert').immeuble).toEqual([]);
  });
  it('🔴 LOT PARTAGE-CABINET-IMMEUBLE — « … du cabinet, dont M dans cet immeuble », accords compris', () => {
    expect(motFichePartagee(3, 2)).toBe('Fiche partagée avec 3 autres biens du cabinet, dont 2 dans cet immeuble');
    expect(motFichePartagee(3, 1)).toBe('Fiche partagée avec 3 autres biens du cabinet, dont 1 dans cet immeuble');
    expect(motFichePartagee(2, 0)).toBe('Fiche partagée avec 2 autres biens du cabinet, aucun dans cet immeuble');
    expect(motFichePartagee(1, 1)).toBe('Fiche partagée avec 1 autre bien du cabinet, dont 1 dans cet immeuble');
    expect(motFichePartagee(1)).toBe('Fiche partagée avec 1 autre bien du cabinet, aucun dans cet immeuble');
    expect(motFichePartagee(0, 0)).toBeNull();
  });
});

describe('🔴 RÈGLE 2 — la COPROPRIÉTÉ : commune à tous les biens de l’immeuble', () => {
  it('par sa clé principale ou par une adresse secondaire : les mêmes biens', () => {
    expect(biensDeLaCopropriete(FICHE, '25 rue edith cavell').map((b) => b.numero)).toEqual(['219', '220', '990']);
    expect(biensDeLaCopropriete(FICHE, '25 bis rue edith cavell').map((b) => b.numero)).toEqual(['219', '220', '990']);
    expect(biensDeLaCopropriete(FICHE, null)).toEqual([]);
  });
});

describe('🔴 RÈGLE 4 — ce qu’une modification touche, et à combien de biens on l’annonce', () => {
  const base = versFormulaire(FICHE, 1);
  const cle = '25 rue edith cavell';
  it('le cabinet : nom, standard, e-mail, note ; un contact modifié ou qui « ne travaille plus ici »', () => {
    expect(niveauxModifies(base, { ...base, email: 'x@banc.invalid' }, cle)).toEqual({ cabinet: true, copropriete: false });
    expect(niveauxModifies(base, { ...base, telephones: ['01 00 00 00 00'] }, cle)).toEqual({ cabinet: false, copropriete: false });
    expect(niveauxModifies(base, { ...base, contacts: base.contacts.map((c) => (c.id === 5 ? { ...c, nom: 'Autre' } : c)) }, cle).cabinet).toBe(true);
    expect(niveauxModifies(base, { ...base, partis: [base.contacts[1]] }, cle).cabinet).toBe(true);
  });
  it('la copropriété : un contact détaché ou affecté, le carnet de l’immeuble, ses adresses', () => {
    const detache = { ...base, contacts: base.contacts.map((c) => (c.id === 4 ? { ...c, immeubles: [] } : c)) };
    expect(niveauxModifies(base, detache, cle)).toEqual({ cabinet: false, copropriete: true });
    const avecCarnet = { ...base, immeubleContacts: { libelle: '25 rue Edith Cavell', contacts: [] } };
    const gardien = { ...avecCarnet, immeubleContacts: { libelle: '25 rue Edith Cavell', contacts: [{ ...base.contacts[0], id: null, nom: 'Loge', titreChoix: 'Gardien' }] } };
    expect(niveauxModifies(avecCarnet, gardien, cle)).toEqual({ cabinet: false, copropriete: true });
  });
  it('la note de CE bien n’est ni l’un ni l’autre : elle est propre au bien', () => {
    expect(niveauxModifies(base, { ...base, noteBien: 'Code portail 1234' }, cle)).toEqual({ cabinet: false, copropriete: false });
  });
  it('le mot : « aux N biens rattachés à cette fiche », et rien pour une fiche qui ne sert qu’à ce bien', () => {
    expect(motAvertissementPartage({ cabinet: 4, copropriete: null }))
      .toBe('Cette modification s’appliquera aux 4 biens rattachés à cette fiche (cabinet : 4 biens du cabinet).');
    expect(motAvertissementPartage({ cabinet: null, copropriete: 3 }))
      .toBe('Cette modification s’appliquera aux 3 biens rattachés à cette fiche (copropriété : 3 biens de l’immeuble).');
    expect(motAvertissementPartage({ cabinet: 4, copropriete: 3 }))
      .toBe('Cette modification s’appliquera aux 4 biens rattachés à cette fiche (cabinet : 4 biens du cabinet ; copropriété : 3 biens de l’immeuble).');
    expect(motAvertissementPartage({ cabinet: 1, copropriete: 1 })).toBeNull();
    expect(motAvertissementPartage({ cabinet: null, copropriete: null })).toBeNull();
  });
});

describe('🔴 RÈGLE 3 — rattacher = rattacher à la fiche ENTIÈRE : le message de confirmation', () => {
  it('« Syndic X rattaché — N contacts syndic et M habitants / gardien partagés avec K autres biens »', () => {
    expect(motConfirmationRattachement({ syndic: { id: 2, nom: 'TEST ARNAUD', ville: null }, contactsSyndic: 2, habitants: 1, autresBiens: 3 }))
      .toBe('Syndic TEST ARNAUD rattaché — 2 contacts syndic et 1 habitant / gardien partagés avec 3 autres biens');
    expect(motConfirmationRattachement({ syndic: { id: 2, nom: 'X', ville: null }, contactsSyndic: 1, habitants: 0, autresBiens: 1 }))
      .toBe('Syndic X rattaché — 1 contact syndic et 0 habitants / gardien partagés avec 1 autre bien');
  });
});

describe('🔒 il n’y a AUCUNE copie par bien dans le modèle', () => {
  it('le lot ne porte ni syndic ni contact : le lien passe par la clé de son « Immeuble » ; la seule chose propre au bien est sa note', () => {
    const repo = readFileSync('app/lib/gestion/syndicRepo.ts', 'utf8');
    /* Le cabinet se lit par son identifiant, jamais par bien. */
    expect(repo).toContain('FROM gestion_syndic WHERE id = $1 AND supprime_le IS NULL');
    /* Le carnet se lit par la COPROPRIÉTÉ (clé principale ou adresse secondaire), jamais par bien. */
    const carnet = readFileSync('app/lib/gestion/contactsImmeubleRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(carnet).toContain('c.cle_immeuble = $1 OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL)');
    /* Seule la note est rangée par (lot, syndic). */
    expect(repo).toContain('FROM gestion_syndic_note_bien WHERE lot_id = $1 AND syndic_id = $2');
  });
});
