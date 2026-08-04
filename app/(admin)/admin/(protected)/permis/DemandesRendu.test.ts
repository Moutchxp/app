import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrigineDest, EncartArbitrages, CarteAmbiguite, CarteInjoignable, CarteDepot, retirerCommune, repartirRetour, MessageRetour, type RetourAction, type ArbitrageAffiche, type AmbiguiteAffiche, type CommuneInjoignableAffiche, type DepotAffiche } from './DemandesRendu';
import { genererTexte, piecesDepuisConfig, type Lot, type ConfigDemandeur, type CandidatDossier } from '../../../../lib/sitadel/demande';

describe('S14e — OrigineDest (texte porteur, pas seulement couleur)', () => {
  it('origine prada → « PRADA — Nom » (texte lisible)', () => {
    const h = renderToStaticMarkup(createElement(OrigineDest, { origine: 'prada', nom: 'Jean Dupont' }));
    expect(h).toContain('PRADA');
    expect(h).toContain('Jean Dupont');
  });
  it('origine mairie_contact → « contact mairie » (jamais une pastille muette)', () => {
    const h = renderToStaticMarkup(createElement(OrigineDest, { origine: 'mairie_contact', nom: null }));
    expect(h).toContain('contact mairie');
    expect(h).not.toContain('PRADA');
  });
  it('prada sans nom → « PRADA » seul (pas de tiret orphelin)', () => {
    const h = renderToStaticMarkup(createElement(OrigineDest, { origine: 'prada', nom: '' }));
    expect(h).toContain('PRADA');
    expect(h).not.toContain('—');
  });
});

describe('S14e — EncartArbitrages (information seule, aucune bascule)', () => {
  const a: ArbitrageAffiche = {
    codeInsee: '75056', communeNom: 'Paris', pradaNom: 'Marie Martin', pradaCourriel: 'prada@paris.fr',
    contactCanal: 'courrier', contactEmail: null, contactAdressePostale: 'BASU, 75013 Paris',
  };
  it('liste chaque commune avec PRADA + adresse retenue + explication du non-basculement', () => {
    const h = renderToStaticMarkup(createElement(EncartArbitrages, { arbitrages: [a] }));
    expect(h).toContain('Paris');
    expect(h).toContain('Marie Martin');
    expect(h).toContain('prada@paris.fr');
    expect(h).toContain('BASU, 75013 Paris');   // adresse RETENUE (contact confirmé)
    expect(h).toContain('rien n’a basculé');     // explication : le travail humain prime
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Arbitrages PRADA à rendre"');
  });
  it('aucun arbitrage → rien affiché (null)', () => {
    expect(renderToStaticMarkup(createElement(EncartArbitrages, { arbitrages: [] }))).toBe('');
  });
});

describe('S14e — CarteAmbiguite (colonnes brutes, mobile-first)', () => {
  const amb: AmbiguiteAffiche = {
    id: 12, nomAdministration: 'Mairie de Saint-Ouen', departement: '93', codePostalVille: '93400 Saint-Ouen-sur-Seine',
    courriel: '', adresse: '6 place de la République', prenom: 'Léa', nom: 'Bernard', millesime: '2026-07',
  };
  it('affiche les colonnes brutes et signale un courriel vide', () => {
    const h = renderToStaticMarkup(createElement(CarteAmbiguite, { a: amb }));
    expect(h).toContain('Mairie de Saint-Ouen');
    expect(h).toContain('93400 Saint-Ouen-sur-Seine');
    expect(h).toContain('6 place de la République');
    expect(h).toContain('Léa Bernard');
    expect(h).toContain('(vide)'); // courriel vide explicitement signalé
    expect(h).toContain('2026-07');
  });

  it('le message de retour (children) est rendu DANS la carte, après les colonnes', () => {
    const message = createElement('span', { role: 'alert' }, 'Refusé : code INSEE invalide.');
    const h = renderToStaticMarkup(createElement(CarteAmbiguite, { a: amb }, message));
    expect(h).toContain('Refusé : code INSEE invalide.');
    expect(h).toContain('role="alert"');
    // le message vient bien APRÈS le nom de l'administration (donc dans la même carte, sous les infos)
    expect(h.indexOf('Refusé')).toBeGreaterThan(h.indexOf('Mairie de Saint-Ouen'));
  });
});

describe('S15 — communes injoignables (saisie par commune)', () => {
  const communes: CommuneInjoignableAffiche[] = Array.from({ length: 16 }, (_, i) => ({
    codeInsee: String(78000 + i), nom: `Commune ${i}`, departement: '78',
  }));

  it('CarteInjoignable affiche le NOM et le département en texte (jamais la couleur seule)', () => {
    const h = renderToStaticMarkup(createElement(CarteInjoignable, { c: communes[0] }));
    expect(h).toContain('Commune 0');
    expect(h).toContain('dép. 78'); // département en toutes lettres, pas une pastille muette
    expect(h).toContain('78000');
  });

  it('la carte accueille le champ e-mail + bouton (children)', () => {
    const enfant = createElement('button', null, 'Enregistrer l’adresse');
    const h = renderToStaticMarkup(createElement(CarteInjoignable, { c: communes[0] }, enfant));
    expect(h).toContain('Enregistrer l’adresse');
    expect(h.indexOf('Enregistrer')).toBeGreaterThan(h.indexOf('Commune 0')); // dans la carte, sous les infos
  });

  it('retirerCommune : la liste tombe de 16 à 15 après enregistrement d’une adresse (retrait optimiste)', () => {
    expect(communes).toHaveLength(16);
    const apres = retirerCommune(communes, '78003');
    expect(apres).toHaveLength(15);
    expect(apres.some((c) => c.codeInsee === '78003')).toBe(false);
  });
});

describe('S42 — retour d’action visible LÀ où l’utilisateur a cliqué (jamais dédoublé)', () => {
  const echecDetail: RetourAction = { texte: 'action impossible', ok: false, zone: 'detail' };

  it('un échec déclenché depuis le panneau détail (panneau ouvert) s’affiche DANS le détail, pas dans le bandeau', () => {
    const rep = repartirRetour(echecDetail, true);
    expect(rep.detail).toEqual(echecDetail); // rendu dans le panneau détail
    expect(rep.haut).toBeNull();             // et NULLE PART ailleurs → jamais deux fois à l’écran
    // le composant rend bien le texte de l’échec, avec role="status" (a11y) et un rouge (échec ≠ succès)
    const h = renderToStaticMarkup(createElement(MessageRetour, { r: rep.detail }));
    expect(h).toContain('action impossible');
    expect(h).toContain('role="status"');
    expect(h).toContain('var(--color-svv-red)');
  });

  it('détail refermé → repli dans le bandeau du haut (le message n’est pas perdu)', () => {
    const rep = repartirRetour(echecDetail, false);
    expect(rep.haut).toEqual(echecDetail);
    expect(rep.detail).toBeNull();
  });

  it('un retour d’action groupée (zone haut) reste dans le bandeau même détail ouvert', () => {
    const okHaut: RetourAction = { texte: '3 demande(s) marquée(s) prête(s).', ok: true, zone: 'haut' };
    const rep = repartirRetour(okHaut, true);
    expect(rep.haut).toEqual(okHaut);
    expect(rep.detail).toBeNull();
    // succès → vert, distinct de l’échec
    const h = renderToStaticMarkup(createElement(MessageRetour, { r: rep.haut }));
    expect(h).toContain('var(--color-svv-green)');
    expect(h).toContain('role="status"');
  });

  it('aucun retour → aucune des deux zones, et MessageRetour ne rend rien', () => {
    const rep = repartirRetour(null, true);
    expect(rep.haut).toBeNull();
    expect(rep.detail).toBeNull();
    expect(renderToStaticMarkup(createElement(MessageRetour, { r: null }))).toBe('');
  });
});

describe('S16 — CarteDepot (file à déposer à la main)', () => {
  const dossier = {
    dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', numDau: 'PC0001',
    dateReelleAutorisation: '2025-03-10', adresse: '10 RUE DE RIVOLI', codePostal: '75001', cadastre: ['AB 12'],
    etatDau: '2', absentDuDernierMillesime: false,
  } as CandidatDossier;
  const lot: Lot = { codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire' as Lot['canal'], dossiers: [dossier] };
  const CONFIG: ConfigDemandeur = {
    raisonSociale: 'Criterimmo', formeJuridique: 'SARL', siegeAdresse: '191 av. Charles de Gaulle, 92200 Neuilly',
    representantNom: 'A. Jorel', representantQualite: 'gérant', emailContact: 'contact@sansvisavis.com', telephone: '',
  };
  const { corps } = genererTexte(lot, CONFIG, 'SVAV-DEM-2026-000001', piecesDepuisConfig('PC2,PC3'), 'entreprise');

  it('le TEXTE affiché est BYTE-IDENTIQUE à celui de genererTexte (aucune variante)', () => {
    const d: DepotAffiche = { id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Paris', url: 'https://teleservice.paris.fr/urbanisme', corps, nbDossiers: 1, statut: 'brouillon' };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain(corps); // le corps stocké (= genererTexte) est rendu tel quel, sans transformation
  });

  it('URL de téléservice cliquable en nouvel onglet, rel noopener ; nb dossiers affiché', () => {
    const d: DepotAffiche = { id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Paris', url: 'https://teleservice.paris.fr/urbanisme', corps, nbDossiers: 4, statut: 'brouillon' };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('https://teleservice.paris.fr/urbanisme');
    expect(h).toContain('target="_blank"');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).toContain('4 dossier(s)');
  });

  it('URL manquante → alerte explicite (jamais un lien mort)', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'X', url: null, corps: 'x', nbDossiers: 1, statut: 'brouillon' };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('URL de téléservice manquante');
    expect(h).toContain('role="alert"');
  });
});
