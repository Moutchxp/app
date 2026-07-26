import { describe, it, expect } from 'vitest';
import {
  type ContactExistant, type Requete, type EcritureContact,
  emailValide, choisirEmail, extraireEmailMairie, doitRemplacerDepuisAnnuaire, ecrireContact,
} from './mairieContact';

describe('Sitadel S5 — validation & choix d’adresse', () => {
  it('emailValide : accepte une adresse simple, refuse les malformées', () => {
    expect(emailValide('urbanisme@ville.fr')).toBe(true);
    expect(emailValide('contact.mairie@saint-cloud.fr')).toBe(true);
    for (const mauvais of ['', 'sansarobase', 'a@b', 'a b@c.fr', 'a@@b.fr', 'a@b.', '@b.fr']) {
      expect(emailValide(mauvais)).toBe(false);
    }
  });

  it('choisirEmail : préfère une adresse de SERVICE (générique) à une nominative ; gère la liste ;', () => {
    expect(choisirEmail('jean.dupont@ville.fr;urbanisme@ville.fr')).toBe('urbanisme@ville.fr');
    expect(choisirEmail('contact@ville.fr')).toBe('contact@ville.fr');
    expect(choisirEmail('jean.dupont@ville.fr')).toBe('jean.dupont@ville.fr'); // pas de générique → 1re valide
    expect(choisirEmail(null)).toBeNull();
    expect(choisirEmail('  , ; ')).toBeNull();
  });

  it('extraireEmailMairie : prend l’e-mail du pivot « mairie », ignore les autres services', () => {
    const recs = [
      { pivot: '[{"type_service_local":"ccas"}]', adresse_courriel: 'ccas@ville.fr' },
      { pivot: '[{"type_service_local":"mairie"}]', adresse_courriel: 'contact@ville.fr' },
    ];
    expect(extraireEmailMairie(recs)).toBe('contact@ville.fr');
    expect(extraireEmailMairie([{ pivot: '[{"type_service_local":"prefecture"}]', adresse_courriel: 'x@p.fr' }])).toBeNull();
  });
});

describe('Sitadel S5 — règle de non-écrasement à l’import', () => {
  const cas = (source: ContactExistant['source'], statut: ContactExistant['statut']): ContactExistant => ({ email: 'x@y.fr', source, statut });
  it('remplace : commune sans contact, ou source=annuaire non confirmée', () => {
    expect(doitRemplacerDepuisAnnuaire(null)).toBe(true);
    expect(doitRemplacerDepuisAnnuaire(cas('annuaire', 'presume'))).toBe(true);
  });
  it('NE remplace JAMAIS : confirme, saisie_manuelle, reponse_mairie', () => {
    expect(doitRemplacerDepuisAnnuaire(cas('annuaire', 'confirme'))).toBe(false);
    expect(doitRemplacerDepuisAnnuaire(cas('saisie_manuelle', 'confirme'))).toBe(false);
    expect(doitRemplacerDepuisAnnuaire(cas('saisie_manuelle', 'presume'))).toBe(false);
    expect(doitRemplacerDepuisAnnuaire(cas('reponse_mairie', 'confirme'))).toBe(false);
  });
});

describe('Sitadel S5 — écriture journalisée & idempotence', () => {
  /** Mock : registre + journal en mémoire, émulant lireContact / INSERT journal / upsert. */
  function fauxDepot(initial: ContactExistant | null = null) {
    const registre = new Map<string, ContactExistant>();
    if (initial) registre.set('92050', initial);
    const journal: unknown[][] = [];
    const q: Requete = (async (text: string, params?: unknown[]) => {
      const p = params ?? [];
      if (text.includes('SELECT email, source, statut FROM mairie_contact')) {
        const c = registre.get(String(p[0]));
        return { rows: c ? [c] : [] };
      }
      if (text.includes('INSERT INTO mairie_contact_journal')) { journal.push([...p]); return { rows: [] }; }
      if (text.includes('INSERT INTO mairie_contact')) {
        registre.set(String(p[0]), { email: p[1] as string | null, source: p[2] as ContactExistant['source'], statut: p[3] as ContactExistant['statut'] });
        return { rows: [] };
      }
      return { rows: [] };
    }) as Requete;
    return { q, registre, journal };
  }
  const annuaire = (code: string, email: string): EcritureContact =>
    ({ codeInsee: code, email, source: 'annuaire', statut: 'presume', motif: 'import annuaire', auteur: null });

  it('premier renseignement : écrit EXACTEMENT une ligne de journal', async () => {
    const { q, journal } = fauxDepot(null);
    const r = await ecrireContact(q, annuaire('92050', 'contact@nanterre.fr'));
    expect(r.change).toBe(true);
    expect(journal).toHaveLength(1);
    expect(journal[0][1]).toBeNull();                 // email_avant
    expect(journal[0][2]).toBe('contact@nanterre.fr'); // email_apres
  });

  it('idempotent : rejouer à l’identique n’écrit AUCUN journal, ne change rien', async () => {
    const { q, journal } = fauxDepot({ email: 'contact@nanterre.fr', source: 'annuaire', statut: 'presume' });
    const r = await ecrireContact(q, annuaire('92050', 'contact@nanterre.fr'));
    expect(r.change).toBe(false);
    expect(journal).toHaveLength(0);
  });

  it('changement d’adresse : une seule ligne de journal (avant→après)', async () => {
    const { q, journal } = fauxDepot({ email: 'ancien@nanterre.fr', source: 'annuaire', statut: 'presume' });
    await ecrireContact(q, annuaire('92050', 'nouveau@nanterre.fr'));
    expect(journal).toHaveLength(1);
    expect(journal[0][1]).toBe('ancien@nanterre.fr');
    expect(journal[0][2]).toBe('nouveau@nanterre.fr');
  });

  it('correction manuelle sur une ligne annuaire : journalisée (source/statut changent)', async () => {
    const { q, journal, registre } = fauxDepot({ email: 'contact@nanterre.fr', source: 'annuaire', statut: 'presume' });
    const r = await ecrireContact(q, { codeInsee: '92050', email: 'contact@nanterre.fr', source: 'saisie_manuelle', statut: 'confirme', motif: 'correction', auteur: '7' });
    expect(r.change).toBe(true);           // même email mais source/statut changent
    expect(journal).toHaveLength(1);
    expect(registre.get('92050')).toMatchObject({ source: 'saisie_manuelle', statut: 'confirme' });
  });
});
