import { describe, it, expect, vi } from 'vitest';
import { brouillonNouveauDepuisLeBien, civilitesPourAppel, MOT_NOUVEAU_MESSAGE } from './nouveauMessageBien';
import { preparerBrouillon } from './redaction';
import { rangerSuggestions, type SuggestionAdresse } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT BOUTON-NOUVEAU-MESSAGE-DANS-L-HISTORIQUE-DU-BIEN — LE BROUILLON (PUR, lecture simulée) ═══════════════════
 * Le « Nouveau message » de la colonne, déjà rattaché au bien de la fiche : bien pré-coché, adresses du dossier,
 * formule d'appel calculée sur « À ». 🔒 Données inventées, aucune écriture (la seule lecture est simulée).
 */
const l = (adresse: string, o: Partial<SuggestionAdresse>): SuggestionAdresse => ({
  adresse, nom: null, role: 'r', ton: 'neutre', propre: true, civilite: null, nomFamille: null, ...o,
});
const GROUPES = rangerSuggestions({
  clients: [
    l('Jean@X.fr', { nom: 'DUPONT Jean', role: 'Propriétaire', ton: 'proprietaire', civilite: 'M.', nomFamille: 'DUPONT' }),
    l('lea@x.fr', { nom: 'ROI Léa', role: 'Ancien locataire', ton: 'ancien_locataire' as SuggestionAdresse['ton'], civilite: 'Mme', nomFamille: 'ROI' }),
  ],
  immeuble: [l('contact@cab.fr', { nom: 'CABINET', role: 'Syndic — CABINET', ton: 'syndic' })],
  autres: [l('vu@y.fr', { role: 'vue dans 1 mail du bien' })],
});
const CIBLE = { cle: '343', id: 77, libelle: '54 avenue Inventée, VILLE — lot 343', categorie: 'logement' };
const BIEN = { lotId: 77, cle: '343', libelle: 'repli — lot 343' };
const SIGNATURE = { texte: 'Service Gestion', html: '<p>Service Gestion</p>' };
const base = () => ({ ...preparerBrouillon('nouveau', null, { adresseGestion: 'gestion@exemple.test', signature: 'Service Gestion' }), id: null });

const lecture = (ok: boolean) => vi.fn(async (url: string) => {
  if (!ok) return new Response('{}', { status: 503 });
  expect(url).toBe('/api/admin/gestion/biens/77/ecrire');
  return new Response(JSON.stringify({ etat: 'ok', cible: CIBLE, groupes: GROUPES, dossierDrive: { id: 'd1', nom: '343' } }));
});

describe('le brouillon du « Nouveau message » de la fiche', () => {
  it('🔴 le bien de la fiche est pré-coché (rattaché), avec son identifiant : le bouton vert « Rattaché · 1 logement »', async () => {
    const b = await brouillonNouveauDepuisLeBien(base(), BIEN, SIGNATURE, lecture(true));
    expect(b.cibles).toEqual([{ sorte: 'lot', cle: '343', id: 77, libelle: CIBLE.libelle, categorie: 'logement' }]);
    expect(b.voie).toBe('nouveau');
    expect(b.a).toEqual([]);
    expect(b.objet).toBe('');
  });
  it('🔴 les adresses du dossier du bien sont là, pour À / Cc / Cci, et le Drive s’ouvre sur le dossier du bien', async () => {
    const b = await brouillonNouveauDepuisLeBien(base(), BIEN, SIGNATURE, lecture(true));
    expect(b.suggestionsBien).toEqual(GROUPES);
    expect(b.depuisLeBien).toBe(true);
    expect(b.dossierDriveBien).toEqual({ id: 'd1', nom: '343' });
  });
  it('🔴 la formule d’appel en tête du corps, calculée sur « À » (vide ⇒ « Madame, Monsieur »), signature dessous', async () => {
    const b = await brouillonNouveauDepuisLeBien(base(), BIEN, SIGNATURE, lecture(true));
    expect(b.corps.split('\n')[0]).toBe('Bonjour Madame, Monsieur,');
    expect(b.corps.endsWith('Service Gestion')).toBe(true);
    expect(b.corpsHtml).toContain('Bonjour Madame, Monsieur,');
    expect(b.corpsHtml).toContain('<p>Service Gestion</p>');
    expect(b.appel?.formule).toBe('Bonjour Madame, Monsieur,');
    /* La table que le compositeur relit à chaque changement de « À » : les personnes nommées, en minuscules. */
    expect(b.appel?.civilites).toEqual({ 'jean@x.fr': { civilite: 'M.', nom: 'DUPONT' }, 'lea@x.fr': { civilite: 'Mme', nom: 'ROI' } });
  });
  it('lecture impossible : le message s’ouvre quand même, le bien TOUJOURS pré-coché (sans suggestions)', async () => {
    const b = await brouillonNouveauDepuisLeBien(base(), BIEN, SIGNATURE, lecture(false));
    expect(b.cibles).toEqual([{ sorte: 'lot', cle: '343', id: 77, libelle: 'repli — lot 343' }]);
    expect(b.suggestionsBien).toBeUndefined();
    expect(b.depuisLeBien).toBeUndefined();
    expect(b.appel?.formule).toBe('Bonjour Madame, Monsieur,');
  });
  it('aucune écriture : une seule lecture, en GET', async () => {
    const lire = lecture(true);
    await brouillonNouveauDepuisLeBien(base(), BIEN, SIGNATURE, lire);
    expect(lire).toHaveBeenCalledTimes(1);
    expect((lire.mock.calls[0] as unknown[])[1]).toEqual({ cache: 'no-store' });
  });
  it('civilitesPourAppel : ni l’e-mail général du syndic, ni les « autres adresses » ; adresses en minuscules', () => {
    expect(Object.keys(civilitesPourAppel(GROUPES))).toEqual(['jean@x.fr', 'lea@x.fr']);
    expect(civilitesPourAppel(null)).toEqual({});
  });
  it('le mot du bouton est celui du gros bouton rouge de la colonne', () => {
    expect(MOT_NOUVEAU_MESSAGE).toBe('Nouveau message');
  });
});
