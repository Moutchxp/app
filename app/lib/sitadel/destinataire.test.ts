import { describe, it, expect } from 'vitest';
import { resoudreDestination, type ContactCommune } from './destinataire';

const base = (o: Partial<ContactCommune> = {}): ContactCommune => ({
  contactCanal: 'inconnu', contactStatut: 'presume', contactEmail: null, contactUrlFormulaire: null, contactAdressePostale: null,
  pradaCourriel: null, pradaImportId: null, pradaNom: null, ...o,
});

describe('S14d — resoudreDestination (précédence PRADA / contact)', () => {
  it('presume + PRADA courriel NON vide → destinataire = PRADA (email, origine prada, import_id, nom)', () => {
    const d = resoudreDestination(base({
      contactStatut: 'presume', contactCanal: 'email', contactEmail: 'mairie@x.fr',
      pradaCourriel: 'prada@x.fr', pradaImportId: 42, pradaNom: 'Jean Dupont',
    }));
    expect(d.origine).toBe('prada');
    expect(d.canal).toBe('email');
    expect(d.email).toBe('prada@x.fr');
    expect(d.pradaImportId).toBe(42);
    expect(d.nom).toBe('Jean Dupont');
    expect(d.arbitragePrada).toBe(false);
  });

  it('presume + PRADA courriel VIDE → repli mairie_contact (aucune bascule)', () => {
    const d = resoudreDestination(base({ contactStatut: 'presume', contactCanal: 'email', contactEmail: 'mairie@x.fr', pradaCourriel: '   ' }));
    expect(d.origine).toBe('mairie_contact');
    expect(d.email).toBe('mairie@x.fr');
    expect(d.pradaImportId).toBeNull();
    expect(d.arbitragePrada).toBe(false);
  });

  it('confirme + PRADA courriel non vide → contact CONSERVÉ + arbitrage SIGNALÉ (jamais silencieux)', () => {
    const d = resoudreDestination(base({
      contactStatut: 'confirme', contactCanal: 'courrier', contactAdressePostale: 'BASU Paris',
      pradaCourriel: 'prada@paris.fr', pradaImportId: 7, pradaNom: 'Marie Martin',
    }));
    expect(d.origine).toBe('mairie_contact'); // le travail humain prime
    expect(d.canal).toBe('courrier');
    expect(d.adressePostale).toBe('BASU Paris');
    expect(d.email).toBeNull();
    expect(d.pradaImportId).toBeNull();
    expect(d.nom).toBeNull();
    expect(d.arbitragePrada).toBe(true); // à lister au rapport
  });

  it('canal INCONNU + presume + PRADA courriel → devient adressable par email', () => {
    const d = resoudreDestination(base({ contactCanal: 'inconnu', contactStatut: 'presume', pradaCourriel: 'prada@x.fr' }));
    expect(d.canal).toBe('email');
    expect(d.origine).toBe('prada');
  });

  it('sans PRADA → repli intégral sur mairie_contact (canal/adresse conservés)', () => {
    const d = resoudreDestination(base({ contactStatut: 'presume', contactCanal: 'formulaire', contactUrlFormulaire: 'https://f.fr' }));
    expect(d.origine).toBe('mairie_contact');
    expect(d.canal).toBe('formulaire');
    expect(d.urlFormulaire).toBe('https://f.fr');
    expect(d.arbitragePrada).toBe(false);
  });
});
