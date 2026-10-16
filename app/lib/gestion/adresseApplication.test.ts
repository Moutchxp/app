import { describe, expect, it } from 'vitest';
import { adresseApplication, estTunnelTemporaire, MENTION_LIEN_LOCAL, URL_LOCALE } from './adresseApplication';
import { construireEvenement, lienFicheBien } from './agendaTache';
import { liensDemande } from './acceptationTache';
import { motRappel } from './taches';

/**
 * LOT AGENDA-TITRE-ET-LIENS — UNE SEULE ADRESSE DE BASE pour les liens sortants de la Gestion (agenda ET mails de
 * demande), jamais un tunnel temporaire, `http://localhost:3000` par défaut avec sa mention.
 */
const TUNNEL = { SITE_URL: 'https://freight-trusts-supreme-sense.trycloudflare.com' };

describe('🔴 l’adresse de base', () => {
  it('défaut : localhost, signalée locale ; SITE_URL (le tunnel) n’est jamais lue', () => {
    expect(adresseApplication({})).toEqual({ base: URL_LOCALE, locale: true });
    expect(adresseApplication(TUNNEL)).toEqual({ base: 'http://localhost:3000', locale: true });
  });
  it('une adresse de tunnel temporaire dans GESTION_URL_APPLICATION est refusée', () => {
    expect(adresseApplication({ GESTION_URL_APPLICATION: 'https://abc.trycloudflare.com/' })).toEqual({ base: URL_LOCALE, locale: true });
    expect(adresseApplication({ GESTION_URL_APPLICATION: 'https://x.ngrok-free.app' }).base).toBe(URL_LOCALE);
    expect(estTunnelTemporaire('freight-trusts-supreme-sense.trycloudflare.com')).toBe(true);
    expect(estTunnelTemporaire('gestion.sansvisavis.com')).toBe(false);
  });
  it('une adresse fixe est prise telle quelle, sans « / » final ; mal formée → localhost', () => {
    expect(adresseApplication({ GESTION_URL_APPLICATION: 'https://gestion.sansvisavis.com/' }))
      .toEqual({ base: 'https://gestion.sansvisavis.com', locale: false });
    expect(adresseApplication({ GESTION_URL_APPLICATION: 'pas une adresse' }).base).toBe(URL_LOCALE);
  });
  it('🔴 la description d’agenda et les liens « Accepter / Refuser » partent de la MÊME base', () => {
    const { base, locale } = adresseApplication({ GESTION_URL_APPLICATION: 'https://gestion.sansvisavis.com' });
    expect(lienFicheBien(base, 27)).toBe('https://gestion.sansvisavis.com/admin/gestion?ecran=annuaire&fiche=lot-27');
    expect(liensDemande(base, 'J').accepter.startsWith('https://gestion.sansvisavis.com/tache/reponse?')).toBe(true);
    expect(locale).toBe(false);
  });
  it('base locale : la description dit que le lien ne vaut que sur l’ordinateur de l’application', () => {
    const { base, locale } = adresseApplication(TUNNEL);
    const ev = construireEvenement({
      id: 1, objet: 'test 4 rdv', texte: '', jour: '2026-10-16', heure: '16:30', dureeMinutes: null, rappels: [], faite: false,
      lotId: 27, adresse: '7 avenue de l’Union', codePostal: null, commune: null, pieces: [],
    }, { siteUrl: base, motRappel, lienLocal: locale });
    expect(ev.description).toContain(`Fiche du bien : http://localhost:3000/admin/gestion?ecran=annuaire&fiche=lot-27 ${MENTION_LIEN_LOCAL}`);
    expect(ev.description).not.toContain('trycloudflare');
    expect(ev.summary).toBe('Tâche gestion — test 4 rdv — 7 avenue de l’Union');
  });
});
