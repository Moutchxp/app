import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrigineDest, EncartArbitrages, CarteAmbiguite, CarteInjoignable, retirerCommune, type ArbitrageAffiche, type AmbiguiteAffiche, type CommuneInjoignableAffiche } from './DemandesRendu';

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
