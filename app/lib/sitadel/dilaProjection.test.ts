import { describe, it, expect } from 'vitest';
import { decisionProjection } from './dilaProjection';
import type { ContactExistant } from './mairieContact';

const contact = (o: Partial<ContactExistant> & Pick<ContactExistant, 'source' | 'statut'>): ContactExistant =>
  ({ email: null, canal: 'inconnu', urlFormulaire: null, adressePostale: null, telephoneStandard: null, ...o });

describe('S29 — decisionProjection : garde humaine + idempotence de contenu', () => {
  it('pas de ligne de contact → sans_ligne (on ne CRÉE jamais depuis la DILA)', () => {
    expect(decisionProjection(null, '01 22 22 22 22')).toBe('sans_ligne');
  });

  it('travail humain PROTÉGÉ : confirme / saisie_manuelle / reponse_mairie → protegee (jamais touché)', () => {
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'confirme' }), '01 22 22 22 22')).toBe('protegee');
    expect(decisionProjection(contact({ source: 'saisie_manuelle', statut: 'presume' }), '01 22 22 22 22')).toBe('protegee');
    expect(decisionProjection(contact({ source: 'reponse_mairie', statut: 'presume' }), '01 22 22 22 22')).toBe('protegee');
  });

  it('DILA sans standard → sans_valeur_dila (la DILA ne rend personne adressable)', () => {
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'presume' }), '')).toBe('sans_valeur_dila');
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'presume' }), null)).toBe('sans_valeur_dila');
  });

  it('standard déjà identique → deja_identique (idempotence de contenu)', () => {
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'presume', telephoneStandard: '01 22 22 22 22' }), '01 22 22 22 22')).toBe('deja_identique');
    // tolérant aux espaces de bord
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'presume', telephoneStandard: '01 22 22 22 22' }), '  01 22 22 22 22 ')).toBe('deja_identique');
  });

  it('ligne annuaire présumée sans standard (ou différent) → recoit_standard', () => {
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'presume', telephoneStandard: null }), '01 22 22 22 22')).toBe('recoit_standard');
    expect(decisionProjection(contact({ source: 'annuaire', statut: 'presume', telephoneStandard: '01 00 00 00 00' }), '01 22 22 22 22')).toBe('recoit_standard');
  });

  it('une ligne DÉJÀ annuaire_dila reste projetable (re-projection d’un nouveau millésime)', () => {
    expect(decisionProjection(contact({ source: 'annuaire_dila', statut: 'presume', telephoneStandard: null }), '01 22 22 22 22')).toBe('recoit_standard');
    expect(decisionProjection(contact({ source: 'annuaire_dila', statut: 'presume', telephoneStandard: '01 22 22 22 22' }), '01 22 22 22 22')).toBe('deja_identique');
  });
});
