import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrigineDest, EncartArbitrages, BlocRepliable, BlocInjoignables, libelleInjoignables, CarteAmbiguite, CarteInjoignable, CarteDepot, CartePropositions, EnteteTriable, FiltreTypes, retirerCommune, repartirRetour, MessageRetour, type RetourAction, type ArbitrageAffiche, type AmbiguiteAffiche, type CommuneInjoignableAffiche, type DepotAffiche, type LotAffiche } from './DemandesRendu';
import type { Tri } from '../../../../lib/sitadel/demandesListe';
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

describe('S14e / C2 — EncartArbitrages (repliable, information seule, aucune bascule)', () => {
  const a: ArbitrageAffiche = {
    codeInsee: '75056', communeNom: 'Paris', pradaNom: 'Marie Martin', pradaCourriel: 'prada@paris.fr',
    contactCanal: 'courrier', contactEmail: null, contactAdressePostale: 'BASU, 75013 Paris',
  };
  const b: ArbitrageAffiche = { ...a, codeInsee: '92004', communeNom: 'Asnières', pradaNom: 'Jean Bon', pradaCourriel: 'prada@asnieres.fr', contactAdressePostale: 'Mairie, 92600' };
  const rendu = (arbitrages: ArbitrageAffiche[], ouvert: boolean) => renderToStaticMarkup(createElement(EncartArbitrages, { arbitrages, ouvert, onToggle: () => {} }));

  it('OUVERT : liste chaque commune avec PRADA + adresse retenue + explication du non-basculement', () => {
    const h = rendu([a], true);
    expect(h).toContain('Paris');
    expect(h).toContain('Marie Martin');
    expect(h).toContain('prada@paris.fr');
    expect(h).toContain('BASU, 75013 Paris');   // adresse RETENUE (contact confirmé)
    expect(h).toContain('rien n’a basculé');     // explication : le travail humain prime
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Arbitrages PRADA à rendre"');
  });

  it('C2 — FERMÉ (défaut) : décompte annoncé, mais NI la liste NI l’explication ne sont rendues', () => {
    const h = rendu([a, b], false);
    expect(h).toContain('2 communes ont une PRADA non adoptée'); // décompte calculé (pluriel accordé)
    expect(h).not.toContain('rien n’a basculé'); // explication masquée
    expect(h).not.toContain('Marie Martin');      // liste masquée
    expect(h).not.toContain('Jean Bon');
  });

  it('C2 — le décompte suit les DONNÉES (jamais figé) et accorde le singulier', () => {
    expect(rendu([a], false)).toContain('1 commune a une PRADA non adoptée');
    expect(rendu([a, b], false)).toContain('2 communes ont une PRADA non adoptée');
  });

  it('C2 — aria-expanded suit l’état ; le déclencheur est un vrai <button> (clavier)', () => {
    expect(rendu([a], false)).toContain('aria-expanded="false"');
    expect(rendu([a], true)).toContain('aria-expanded="true"');
    expect(rendu([a], false)).toMatch(/<button[^>]*aria-expanded/);
    expect(rendu([a], true)).toContain('aria-controls="arbitrages-prada-contenu"');
  });

  it('C2 — décompte NUL → rien du tout, quel que soit l’état', () => {
    expect(rendu([], false)).toBe('');
    expect(rendu([], true)).toBe('');
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

describe('V3 — CartePropositions : choix lot-par-lot (rendu PUR)', () => {
  const lot = (cle: string, nb: number, communeNom = 'Asnières'): LotAffiche => ({ cle, codeInsee: '92004', communeNom, canal: 'email', nbDossiers: nb });
  const base = {
    resumeDiag: 'diag', explication: 'aucun lot', profilLibelle: 'société',
    pageCourante: 1, nbPages: 1, onBasculer: () => {}, onToutSelectionner: () => {}, onPage: () => {}, onCreer: () => {},
  };
  const rendu = (over: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(CartePropositions, { ...base, ...over } as unknown as Parameters<typeof CartePropositions>[0]));

  it('aucun lot proposé (total 0) → explication, aucune case ni bouton de création', () => {
    const h = rendu({ total: 0, lotsVisibles: [], selection: new Set(), nbSelLots: 0, nbSelDossiers: 0, toutCoche: false });
    expect(h).toContain('aucun lot');
    expect(h).not.toContain('type="checkbox"');
    expect(h).not.toContain('Créer les demandes sélectionnées');
  });

  it('par défaut AUCUN lot coché → bouton DÉSACTIVÉ avec sa raison', () => {
    const lots = [lot('1-2', 2), lot('3', 1)];
    const h = rendu({ total: 2, lotsVisibles: lots, selection: new Set(), nbSelLots: 0, nbSelDossiers: 0, toutCoche: false });
    // deux cases, aucune cochée
    expect((h.match(/type="checkbox"/g) ?? []).length).toBe(2);
    expect(h).not.toContain('checked');
    // bouton désactivé + raison lisible
    expect(h).toMatch(/<button[^>]*disabled[^>]*>Créer les demandes sélectionnées</);
    expect(h).toContain('Cochez au moins un lot pour créer des demandes');
  });

  it('le décompte affiche LOTS ET DOSSIERS (rappel + libellé du bouton)', () => {
    const lots = [lot('1-2', 2)];
    const h = rendu({ total: 3, lotsVisibles: lots, selection: new Set(['1-2', '3', '4-5']), nbSelLots: 3, nbSelDossiers: 6, toutCoche: true });
    expect(h).toContain('3 lot(s)');
    expect(h).toContain('6 dossier(s)');
    // bouton actif (au moins un coché) et non désactivé
    expect(h).toMatch(/Créer les demandes sélectionnées \(3 lot\(s\) · 6 dossier\(s\)\)/);
    expect(h).not.toMatch(/<button[^>]*disabled[^>]*>Créer les demandes/);
  });

  it('RAPPEL du décompte visible même quand les lots cochés ne sont PAS sur la page affichée (survit à la pagination)', () => {
    // La page n'affiche que le lot '3' ; mais la sélection (calculée sur l'ENSEMBLE par la Vue) vaut 2 lots / 4 dossiers.
    const h = rendu({ total: 20, lotsVisibles: [lot('3', 1)], selection: new Set(['hors-page-a', '3']), nbSelLots: 2, nbSelDossiers: 4, toutCoche: false, nbPages: 2, pageCourante: 2 });
    expect(h).toContain('2 lot(s)');   // le décompte reflète des lots absents de la page
    expect(h).toContain('4 dossier(s)');
    expect(h).toContain('Page 2 / 2');
  });

  it('« tout sélectionner » ↔ « tout désélectionner » selon toutCoche', () => {
    const lots = [lot('1-2', 2)];
    expect(rendu({ total: 1, lotsVisibles: lots, selection: new Set(), nbSelLots: 0, nbSelDossiers: 0, toutCoche: false })).toContain('Tout sélectionner');
    expect(rendu({ total: 1, lotsVisibles: lots, selection: new Set(['1-2']), nbSelLots: 1, nbSelDossiers: 2, toutCoche: true })).toContain('Tout désélectionner');
  });

  it('une case est cochée ssi sa clé est dans la sélection', () => {
    const lots = [lot('1-2', 2), lot('3', 1)];
    const h = rendu({ total: 2, lotsVisibles: lots, selection: new Set(['1-2']), nbSelLots: 1, nbSelDossiers: 2, toutCoche: false });
    expect((h.match(/checked/g) ?? []).length).toBe(1); // exactement une case cochée
  });
});

describe('D2 — EnteteTriable : aria-sort + sens + activable au clavier', () => {
  const th = (colonne: 'commune' | 'dossiers' | 'statut', tri: Tri) =>
    renderToStaticMarkup(createElement(EnteteTriable, { libelle: 'Commune', colonne, tri, onTrier: () => {} }));

  it('colonne ACTIVE ascendante → aria-sort="ascending" + flèche ▲', () => {
    const h = th('commune', { colonne: 'commune', sens: 'asc' });
    expect(h).toContain('aria-sort="ascending"');
    expect(h).toContain('▲');
  });
  it('colonne ACTIVE descendante → aria-sort="descending" + flèche ▼', () => {
    const h = th('commune', { colonne: 'commune', sens: 'desc' });
    expect(h).toContain('aria-sort="descending"');
    expect(h).toContain('▼');
  });
  it('colonne INACTIVE → aria-sort="none" (posé sur le BON en-tête seulement)', () => {
    const h = th('dossiers', { colonne: 'commune', sens: 'asc' });
    expect(h).toContain('aria-sort="none"');
    expect(h).not.toContain('▲');
    expect(h).not.toContain('▼');
  });
  it('l’en-tête est un <button> (activable au clavier, pas un simple texte)', () => {
    expect(th('statut', { colonne: 'statut', sens: 'asc' })).toContain('<button');
  });
});

describe('D2 — FiltreTypes : libellés de l’app + sémantique « au moins un dossier »', () => {
  const cats = [{ cle: 'immeuble_neuf', libelle: 'Immeuble neuf', rang: 1 }, { cle: 'extension', libelle: 'Extension', rang: 4 }];
  it('rend une case par catégorie avec son libellé', () => {
    const h = renderToStaticMarkup(createElement(FiltreTypes, { categories: cats, coches: new Set<number>() }));
    expect(h).toContain('Immeuble neuf');
    expect(h).toContain('Extension');
    expect((h.match(/type="checkbox"/g) ?? []).length).toBe(2);
  });
  it('l’aide dit EXPLICITEMENT « au moins un dossier » et « aucun type coché = tous »', () => {
    const h = renderToStaticMarkup(createElement(FiltreTypes, { categories: cats, coches: new Set<number>() }));
    expect(h).toContain('au moins un dossier');
    expect(h).toContain('Aucun type coché = tous');
  });
  it('une case est cochée ssi son rang est dans `coches`', () => {
    const h = renderToStaticMarkup(createElement(FiltreTypes, { categories: cats, coches: new Set([4]) }));
    expect((h.match(/checked/g) ?? []).length).toBe(1); // seule « Extension » (rang 4) cochée
  });
});

describe('C3 — libelleInjoignables : décompte calculé, « commune » accordée', () => {
  it('singulier / pluriel', () => {
    expect(libelleInjoignables(1)).toBe('1 commune sans adresse e-mail');
    expect(libelleInjoignables(15)).toBe('15 communes sans adresse e-mail');
  });
});

describe('C3 — BlocRepliable : disclosure + slot retour hors du repli', () => {
  const base = { ligne: 'X éléments', idContenu: 'contenu-x', ariaLabel: 'Groupe X', onToggle: () => {} };
  const rendu = (ouvert: boolean, retour?: unknown) =>
    renderToStaticMarkup(createElement(BlocRepliable, { ...base, ouvert, retour, children: createElement('p', null, 'CONTENU-DEPLIE') } as Parameters<typeof BlocRepliable>[0]));
  it('FERMÉ : ligne visible, contenu déplié ABSENT, aria-expanded=false, vrai <button>', () => {
    const h = rendu(false);
    expect(h).toContain('X éléments');
    expect(h).not.toContain('CONTENU-DEPLIE');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toMatch(/<button[^>]*aria-expanded/);
  });
  it('OUVERT : contenu déplié présent, aria-expanded=true, aria-controls relié', () => {
    const h = rendu(true);
    expect(h).toContain('CONTENU-DEPLIE');
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-controls="contenu-x"');
  });
  it('le slot `retour` est TOUJOURS rendu (fermé comme ouvert) → jamais masqué par le repli', () => {
    const msg = createElement('span', { role: 'status' }, 'RETOUR-VISIBLE');
    expect(rendu(false, msg)).toContain('RETOUR-VISIBLE'); // même fermé
    expect(rendu(true, msg)).toContain('RETOUR-VISIBLE');
  });
});

describe('C3 — BlocInjoignables : bloc « sans adresse » repliable, cartes actives', () => {
  const inj = (n: number): CommuneInjoignableAffiche[] => Array.from({ length: n }, (_, i) => ({ codeInsee: String(78000 + i), nom: `Commune ${i}`, departement: '78' }));
  const carte = (c: CommuneInjoignableAffiche) => createElement(CarteInjoignable, { key: c.codeInsee, c },
    createElement('input', { type: 'email', 'aria-label': `Adresse e-mail pour ${c.nom}` }),
    createElement('button', { type: 'button' }, 'Enregistrer l’adresse'));
  const explication = createElement('div', { key: 'exp' }, '(ni contact, ni PRADA) — saisissez une adresse pour les rendre adressables. Enregistrée en « confirmée ».');
  const rendu = (n: number, ouvert: boolean, retour?: unknown) =>
    renderToStaticMarkup(createElement(BlocInjoignables, { injoignables: inj(n), ouvert, onToggle: () => {}, retour, children: [explication, ...inj(n).map(carte)] } as Parameters<typeof BlocInjoignables>[0]));

  it('décompte NUL → rien du tout (null), quel que soit l’état', () => {
    expect(rendu(0, false)).toBe('');
    expect(rendu(0, true)).toBe('');
  });
  it('FERMÉ (défaut) : décompte accordé, mais NI les cartes NI l’explication ne sont rendues', () => {
    const h = rendu(3, false);
    expect(h).toContain('3 communes sans adresse e-mail');
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain('ni contact, ni PRADA');           // explication masquée (dans les children)
    expect(h).not.toContain('Adresse e-mail pour Commune 0');   // carte masquée
  });
  it('le décompte SUIT les données (décrément après enregistrement d’une carte) + s’accorde', () => {
    expect(rendu(15, false)).toContain('15 communes sans adresse e-mail');
    expect(rendu(14, false)).toContain('14 communes sans adresse e-mail'); // une carte enregistrée → liste 15→14
    expect(rendu(1, false)).toContain('1 commune sans adresse e-mail');    // singulier
  });
  it('OUVERT : chaque commune apparaît avec son CHAMP et son BOUTON', () => {
    const h = rendu(2, true);
    expect(h).toContain('Commune 0');
    expect(h).toContain('Commune 1');
    expect((h.match(/type="email"/g) ?? []).length).toBe(2);            // un champ par commune
    expect((h.match(/Enregistrer l’adresse/g) ?? []).length).toBe(2);   // un bouton par commune
    expect(h).toContain('ni contact, ni PRADA');                         // explication rendue à l’ouverture
  });
  it('aria-expanded suit l’état', () => {
    expect(rendu(2, false)).toContain('aria-expanded="false"');
    expect(rendu(2, true)).toContain('aria-expanded="true"');
  });
  it('le RETOUR de saisie (succès) reste visible même FERMÉ (survit au repli)', () => {
    const msg = createElement('span', { role: 'status' }, 'Adresse enregistrée pour 92004.');
    expect(rendu(3, false, msg)).toContain('Adresse enregistrée pour 92004.'); // fermé
    expect(rendu(3, true, msg)).toContain('Adresse enregistrée pour 92004.');  // ouvert
  });
});
