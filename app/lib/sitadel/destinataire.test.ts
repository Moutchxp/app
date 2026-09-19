import { describe, it, expect } from 'vitest';
import { resoudreDestination, type ContactCommune } from './destinataire';

const base = (o: Partial<ContactCommune> = {}): ContactCommune => ({
  contactCanal: 'inconnu', contactStatut: 'presume', contactEmail: null, contactUrlFormulaire: null, contactAdressePostale: null,
  pradaCourriel: null, pradaImportId: null, pradaNom: null, ...o,
});

describe('resoudreDestination — canal = mairie_contact (override PRADA RETIRÉ)', () => {
  it('presume + PRADA courriel NON vide → PLUS de forçage e-mail : canal/e-mail = mairie_contact, origine mairie_contact', () => {
    const d = resoudreDestination(base({
      contactStatut: 'presume', contactCanal: 'email', contactEmail: 'mairie@x.fr',
      pradaCourriel: 'prada@x.fr', pradaImportId: 42, pradaNom: 'Jean Dupont',
    }));
    expect(d.origine).toBe('mairie_contact'); // jamais 'prada' : la PRADA ne déduit plus le canal
    expect(d.canal).toBe('email');            // celui de mairie_contact, PAS déduit de la PRADA
    expect(d.email).toBe('mairie@x.fr');      // e-mail du contact, PAS le courriel PRADA
    expect(d.pradaImportId).toBeNull();
    expect(d.nom).toBeNull();
    expect(d.arbitragePrada).toBe(false);     // presume → pas d'arbitrage (signal réservé à 'confirme')
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

  it('canal INCONNU + presume + PRADA courriel → RESTE inconnu (hors process ; l’ancienne rescousse PRADA est retirée)', () => {
    const d = resoudreDestination(base({ contactCanal: 'inconnu', contactStatut: 'presume', pradaCourriel: 'prada@x.fr' }));
    expect(d.canal).toBe('inconnu');       // plus de forçage e-mail → la commune retombe hors process
    expect(d.origine).toBe('mairie_contact');
    expect(d.email).toBeNull();
    expect(d.arbitragePrada).toBe(false);
  });

  it('sans PRADA → repli intégral sur mairie_contact (canal/adresse conservés)', () => {
    const d = resoudreDestination(base({ contactStatut: 'presume', contactCanal: 'formulaire', contactUrlFormulaire: 'https://f.fr' }));
    expect(d.origine).toBe('mairie_contact');
    expect(d.canal).toBe('formulaire');
    expect(d.urlFormulaire).toBe('https://f.fr');
    expect(d.arbitragePrada).toBe(false);
  });
});
