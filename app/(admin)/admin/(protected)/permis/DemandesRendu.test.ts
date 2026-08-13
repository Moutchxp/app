import { describe, it, expect } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrigineDest, EncartArbitrages, BlocRepliable, BlocInjoignables, libelleInjoignables, CarteAmbiguite, CarteInjoignable, CarteDepot, BoutonAnnulerDepot, CartePropositions, EnteteTriable, FiltreTypes, CelluleType, ConteneurTableDefilant, TableDemandes, PanneauDetailDemande, RetourMairie, etatRetourMairie, BlocStock, TableStock, PanneauDetailStock, libelleStock, BandeauReglages, retirerCommune, repartirRetour, MessageRetour, MentionMasquage, BlocDossiersDetail, STATUT_LIBELLE, type RetourAction, type ArbitrageAffiche, type AmbiguiteAffiche, type CommuneInjoignableAffiche, type DepotAffiche, type LotAffiche, type DemandeAffichee } from './DemandesRendu';
import type { Tri } from '../../../../lib/sitadel/demandesListe';
import { genererTexte, piecesDepuisConfig, type Lot, type ConfigDemandeur, type CandidatDossier } from '../../../../lib/sitadel/demande';
import { formaterReferencePermis } from '../../../../lib/sitadel/referencePermis';
import type { LigneStock } from '../../../../lib/sitadel/stock';
import type { PermisDetail } from '../../../../lib/sitadel/demandeRepo';

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
    const d: DepotAffiche = { id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Paris', url: 'https://teleservice.paris.fr/urbanisme', corps, nbDossiers: 1, statut: 'brouillon', dossiers: [{ type: 'PC', numDau: '07510124V0034' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain(corps); // le corps stocké (= genererTexte) est rendu tel quel, sans transformation
  });

  it('URL de téléservice cliquable en nouvel onglet, rel noopener ; nb dossiers affiché', () => {
    const d: DepotAffiche = { id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Paris', url: 'https://teleservice.paris.fr/urbanisme', corps, nbDossiers: 4, statut: 'brouillon', dossiers: [{ type: 'PC', numDau: '07510124V0034' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('https://teleservice.paris.fr/urbanisme');
    expect(h).toContain('target="_blank"');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).toContain('4 dossier(s)');
  });

  it('URL manquante → alerte explicite (jamais un lien mort)', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'X', url: null, corps: 'x', nbDossiers: 1, statut: 'brouillon', dossiers: [{ type: 'PC', numDau: '07510124V0034' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('URL de téléservice manquante');
    expect(h).toContain('role="alert"');
  });

  it('U2 — le CORPS et le CHAMP affichent la MÊME référence pour un même dossier (source de vérité unique)', () => {
    const numDau = '07510124V0034';
    const lotT: Lot = { codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', dossiers: [{ ...dossier, type: 'PC', numDau }] };
    const { corps: corpsT } = genererTexte(lotT, CONFIG, 'SVAV-DEM-2026-000001', piecesDepuisConfig('PC2,PC3'), 'entreprise');
    const ref = formaterReferencePermis('PC', numDau);
    const d: DepotAffiche = { id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Paris', url: 'u', corps: corpsT, nbDossiers: 1, statut: 'brouillon', dossiers: [{ type: 'PC', numDau }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(ref.ok).toBe(true);
    if (ref.ok) {
      expect(corpsT).toContain(ref.reference);            // le corps porte la référence…
      expect(h).toContain(`value="${ref.reference}"`);    // …et le champ « Numéro de dossier instruit » la MÊME chaîne
    }
  });

  it('U2 — champ « Numéro de dossier instruit » + Copier dédié + mention arrondissement (sans copie) ; « Copier le texte » inchangé', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'Paris', url: 'u', corps: 'x', nbDossiers: 1, statut: 'brouillon', dossiers: [{ type: 'PC', numDau: '07510124V0034' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d, onCopierRef: () => {} }, createElement('button', { type: 'button' }, 'Copier le texte')));
    expect(h).toContain('Numéro de dossier instruit');
    expect(h).toContain('value="PC07510124V0034"'); // pré-rempli par la source unique
    expect(h).toContain('>Copier<');                 // bouton Copier DÉDIÉ au numéro (distinct de « Copier le texte »)
    expect(h).toContain('Arrondissement : 1er');     // mention, sans bouton de copie
    expect(h).toContain('Copier le texte');          // le bouton existant (children) reste
  });

  it('U2 — type indéterminable (aucun dossier) → champ NON pré-rempli + raison ; jamais « PC » inventé ; arrondissement indéterminé', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'X', url: 'u', corps: 'x', nbDossiers: 0, statut: 'brouillon', dossiers: [] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('impossible de pré-remplir');
    expect(h).not.toContain('value="PC'); // aucune référence inventée
    expect(h).toContain('Arrondissement : indéterminé');
  });

  it('U3 (A) — le champ et SON bouton « Copier » sont dans le MÊME cartouche ; « Copier le texte » est DEHORS (valeurs inchangées)', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'Paris', url: 'u', corps: 'MESSAGE', nbDossiers: 1, statut: 'brouillon', dossiers: [{ type: 'PC', numDau: '07510124V0034' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d, onCopierRef: () => {} }, createElement('button', { type: 'button' }, 'Copier le texte')));
    expect(h).toContain('role="group"');
    expect(h).toContain('aria-label="Numéro de dossier instruit à copier"'); // le cartouche encadre le champ + son bouton
    // Le contenu du cartouche (du groupe jusqu'à la mention Arrondissement, hors cartouche) : le champ ET son bouton Copier.
    const cartouche = h.slice(h.indexOf('aria-label="Numéro de dossier instruit à copier"'), h.indexOf('Arrondissement :'));
    expect(cartouche).toContain('value="PC07510124V0034"'); // valeur inchangée
    expect(cartouche).toContain('>Copier<');                 // le bouton dédié est DANS le cartouche
    expect(cartouche).not.toContain('Copier le texte');      // …mais pas « Copier le texte »
    expect(h).toContain('Copier le texte');                  // qui reste rendu, DEHORS (children)
  });

  it('U4 — adresse PRÉSENTE → affichée sur la carte (source unique, comme le corps) ; aucun avertissement', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'Paris', url: 'u', corps: 'x', nbDossiers: 1, statut: 'brouillon',
      dossiers: [{ type: 'PC', numDau: '07510124V0034', adresse: '5 rue de Rivoli', codePostal: '75001', communeNom: 'Paris' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('Adresse : 5 rue de Rivoli, 75001 Paris');
    expect(h).not.toContain('Aucune adresse de voie'); // pas d’avertissement quand l’adresse est là
  });

  it('U4 — adresse ABSENTE → AVERTISSEMENT explicite à l’opérateur (role=alert), jamais un silence ; arrondissement toujours affiché', () => {
    const d: DepotAffiche = { id: 1, reference: 'R', communeNom: 'Paris', url: 'u', corps: 'x', nbDossiers: 1, statut: 'brouillon',
      dossiers: [{ type: 'PC', numDau: '07511524V0006', adresse: null, codePostal: null, communeNom: 'Paris' }] };
    const h = renderToStaticMarkup(createElement(CarteDepot, { d }));
    expect(h).toContain('Aucune adresse de voie');
    expect(h).toContain('role="alert"');
    expect(h).toContain('Arrondissement : 15e'); // l’arrondissement reste connu (dérivé du num_dau)
    expect(h).not.toContain('Adresse : '); // pas de fausse ligne d’adresse
  });

  const carte = (dossiers: DepotAffiche['dossiers']) =>
    renderToStaticMarkup(createElement(CarteDepot, { d: { id: 1, reference: 'R', communeNom: 'Paris', url: 'u', corps: 'x', nbDossiers: 1, statut: 'brouillon', dossiers } }));

  it('U5 — repli VÉRIFIÉ (parcelle commune) → adresse de la sœur affichée + mention de provenance (opérateur)', () => {
    const h = carte([{ type: 'PC', numDau: '07511524V0006', adresse: null, codePostal: null, communeNom: 'Paris', parcelles: ['AS-4'],
      soeurs: [{ type: 'PD', adresse: '1 AVENUE DE LA PORTE BRANCIO', codePostal: '75015', communeNom: 'Paris', parcelles: ['AS-4'] }] }]);
    expect(h).toContain('Adresse : 1 AVENUE DE LA PORTE BRANCIO, 75015 Paris');
    expect(h).toContain('issue de la ligne PD du même numéro de permis');
    expect(h).toContain('parcelle AS-4 commune vérifiée');
    expect(h).not.toContain('Aucune adresse de voie'); // repli vérifié → pas d’avertissement d’absence
  });

  it('U5 — sœur adressée mais parcelles ABSENTES → NON VÉRIFIABLE : avertissement U4 + signal, JAMAIS d’emprunt (cas demande 156)', () => {
    const h = carte([{ type: 'PC', numDau: '07511524V0006', adresse: null, codePostal: null, communeNom: 'Paris', parcelles: [],
      soeurs: [{ type: 'PD', adresse: '1 AVENUE DE LA PORTE BRANCIO', codePostal: '75015', communeNom: 'Paris', parcelles: ['AS-4'] }] }]);
    expect(h).toContain('Aucune adresse de voie');          // comportement U4
    expect(h).toContain('Une ligne PD');                    // signal qu’une sœur existe
    expect(h).toContain('lien n’a pas pu être vérifié');    // …non vérifié
    expect(h).not.toContain('1 AVENUE DE LA PORTE BRANCIO'); // jamais empruntée sans vérification
  });

  it('U5 — parcelles DISJOINTES → pas de repli NI de signal, comportement U4 (terrain différent)', () => {
    const h = carte([{ type: 'PC', numDau: '07511524V0006', adresse: null, codePostal: null, communeNom: 'Paris', parcelles: ['AB-1'],
      soeurs: [{ type: 'PD', adresse: '9 rue Y', parcelles: ['XY-9'] }] }]);
    expect(h).toContain('Aucune adresse de voie');
    expect(h).not.toContain('issue de la ligne');
    expect(h).not.toContain('lien n’a pas pu être vérifié'); // disjoint ≠ non vérifiable
    expect(h).not.toContain('9 rue Y');
  });
});

describe('U3 (B) — BoutonAnnulerDepot : geste SECONDAIRE + confirmation qui dit ce qui se passe', () => {
  const noop = () => {};
  it('fermé → un LIEN secondaire « Annuler cette demande », JAMAIS un bouton primaire', () => {
    const h = renderToStaticMarkup(createElement(BoutonAnnulerDepot, { ouvert: false, onOuvrir: noop, onConfirmer: noop, onFermer: noop }));
    expect(h).toContain('Annuler cette demande');
    expect(h).toContain('class="svv-link"');   // secondaire (lien), pas une action principale
    expect(h).not.toContain('svv-btn-primary'); // JAMAIS rendu comme « Marquer comme déposée »
  });
  it('ouvert → confirmation EXPLICITE (annulée + dossiers demandables + « À demander »), pas un « êtes-vous sûr ? » générique', () => {
    const h = renderToStaticMarkup(createElement(BoutonAnnulerDepot, { ouvert: true, onOuvrir: noop, onConfirmer: noop, onFermer: noop }));
    expect(h).toContain('role="alert"');
    expect(h).toContain('annulée');
    expect(h).toContain('redeviennent demandables');
    expect(h).toContain('À demander');
    expect(h).toContain('Confirmer l’annulation');
    expect(h).toContain('Retour');
    expect(h).not.toContain('êtes-vous sûr');
    expect(h).not.toContain('svv-btn-primary'); // même « Confirmer » reste secondaire (outline)
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

  it('P3 — profil IMPOSÉ par le téléservice : le motif est DIT explicitement (jamais substitué en silence)', () => {
    const lotImpose: LotAffiche = { ...lot('9-9', 1, 'Paris'), profilImpose: 'personne' };
    const h = rendu({ total: 1, lotsVisibles: [lotImpose], selection: new Set(), nbSelLots: 0, nbSelDossiers: 0, toutCoche: false });
    expect(h).toContain('profil imposé par le téléservice de cette commune');
    expect(h).toContain('Personne physique'); // ETIQUETTE_PROFIL['personne']
    // un lot SANS contrainte n'affiche AUCUN motif
    expect(rendu({ total: 1, lotsVisibles: [lot('1-2', 2)], selection: new Set(), nbSelLots: 0, nbSelDossiers: 0, toutCoche: false })).not.toContain('profil imposé');
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

// ── D3 : colonne « Type » + tenue du tableau à l'écran ────────────────────────────────────────────────────────────────
const CATS_D3 = [
  { libelle: 'Immeuble neuf', rang: 1 },
  { libelle: 'Construction neuve', rang: 3 },
  { libelle: 'Extension', rang: 4 },
];
const DEM = (over: Partial<DemandeAffichee> = {}): DemandeAffichee => ({
  id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Asnières', codeInsee: '92004',
  profil: 'entreprise', canal: 'email', destOrigine: 'mairie_contact', destNom: null,
  nbDossiers: 3, statut: 'brouillon', rangs: [1], ...over,
});
const TRI_COMMUNE: Tri = { colonne: 'commune', sens: 'asc' };

describe('D3 — CelluleType (badge du type + « +N » + title)', () => {
  const rendu = (rangs: number[] | undefined) => renderToStaticMarkup(createElement(CelluleType, { rangs, categories: CATS_D3 }));

  it('un seul type → le libellé, aucun « +N »', () => {
    const h = rendu([3]);
    expect(h).toContain('Construction neuve');
    expect(h).not.toContain('+1');
  });
  it('types différents → badge du plus prioritaire + « +N » + title listant TOUS les types', () => {
    const h = rendu([4, 1, 3]);
    expect(h).toContain('Immeuble neuf'); // rang 1 = prioritaire
    expect(h).toContain('+2');
    expect(h).toContain('title="Immeuble neuf, Construction neuve, Extension"');
  });
  it('catégorie « autre » → libellé « Autre » affiché (jamais une cellule vide)', () => {
    expect(rendu([9999])).toContain('Autre');
  });
  it('aucun rang connu → « — », jamais une cellule vide', () => {
    expect(rendu([])).toContain('—');
    expect(rendu(undefined)).toContain('—');
  });
});

describe('D3 — ConteneurTableDefilant (défilement horizontal atteignable au clavier)', () => {
  it('porte role=region, tabIndex et un aria-label explicite', () => {
    const h = renderToStaticMarkup(createElement(ConteneurTableDefilant, { ariaLabel: 'Tableau des demandes, défilement horizontal' }, 'x'));
    expect(h).toContain('role="region"');
    expect(h).toContain('tabindex="0"');
    expect(h).toContain('aria-label="Tableau des demandes, défilement horizontal"');
    expect(h).toContain('overflow-x:auto');
  });
});

describe('D3 — TableDemandes : colonne « Type » en 2e position + conteneur défilant', () => {
  const rendu = (over?: Partial<Parameters<typeof TableDemandes>[0]>) => renderToStaticMarkup(createElement(TableDemandes, {
    visibles: [DEM({ rangs: [1] })], categories: CATS_D3, tri: TRI_COMMUNE, sel: new Set<number>(),
    toutCoche: false, messageVide: 'Aucune demande.', ...over,
  }));

  it('en-tête : « Type » vient juste APRÈS « Référence » et AVANT « Commune »', () => {
    const h = rendu();
    const iRef = h.indexOf('Référence'); const iType = h.indexOf('Type'); const iCommune = h.indexOf('Commune');
    expect(iRef).toBeGreaterThanOrEqual(0);
    expect(iRef).toBeLessThan(iType);
    expect(iType).toBeLessThan(iCommune);
  });

  it('ligne : la cellule Type (badge) est ENTRE la référence et la commune → alignée sur l’en-tête', () => {
    const h = rendu();
    const iRef = h.indexOf('SVAV-DEM-2026-000001'); const iType = h.indexOf('Immeuble neuf'); const iCommune = h.indexOf('Asnières');
    expect(iRef).toBeLessThan(iType);
    expect(iType).toBeLessThan(iCommune);
  });

  it('le tableau est enveloppé d’un conteneur défilant a11y (region + tabIndex + aria-label)', () => {
    const h = rendu();
    expect(h).toContain('role="region"');
    expect(h).toContain('tabindex="0"');
    expect(h).toContain('aria-label="Tableau des demandes, défilement horizontal"');
  });

  it('non-régression : les en-têtes triables de D2 restent triables (aria-sort porté par la colonne active)', () => {
    const h = rendu({ tri: { colonne: 'commune', sens: 'asc' } });
    expect(h).toContain('aria-sort="ascending"'); // Commune actif → EnteteTriable inchangé
    expect(h).toContain('aria-sort="none"');       // les autres colonnes triables
  });

  it('liste vide → message explicite sur toute la largeur (colSpan = 10, colonne Type incluse)', () => {
    const h = rendu({ visibles: [], messageVide: 'Aucune demande pour ces filtres.' });
    expect(h).toContain('Aucune demande pour ces filtres.');
    expect(h).toContain('colSpan="10"'); // React 19 émet l'attribut tel quel (HTML insensible à la casse)
  });

  it('défaut (avecSelection omis) : la colonne de sélection est présente (case « Tout sélectionner » + case par ligne)', () => {
    const h = rendu();
    expect(h).toContain('aria-label="Tout sélectionner"');
    expect(h).toContain('aria-label="Sélectionner SVAV-DEM-2026-000001"');
  });

  it('Q6 — avecSelection=false (ex. « en cours », sans action groupée) : AUCUNE case à cocher, ni en-tête ni ligne', () => {
    const h = rendu({ avecSelection: false });
    expect(h).not.toContain('aria-label="Tout sélectionner"');
    expect(h).not.toContain('aria-label="Sélectionner SVAV-DEM-2026-000001"');
    expect(h).not.toContain('type="checkbox"');
    // les colonnes de données restent alignées (Référence → Type → Commune)
    const iRef = h.indexOf('Référence'); const iType = h.indexOf('Type'); const iCommune = h.indexOf('Commune');
    expect(iRef).toBeLessThan(iType);
    expect(iType).toBeLessThan(iCommune);
  });

  it('Q6 — avecSelection=false : la ligne vide couvre 9 colonnes (la colonne de sélection retirée)', () => {
    const h = rendu({ avecSelection: false, visibles: [], messageVide: 'Aucune demande.' });
    expect(h).toContain('Aucune demande.');
    expect(h).toContain('colSpan="9"');
    expect(h).not.toContain('colSpan="10"');
  });
});

describe('U7 — TableDemandes : détail en ACCORDÉON à un seul volet, sous la ligne cliquée', () => {
  const A = DEM({ id: 1, reference: 'SVAV-DEM-2026-000001', communeNom: 'Asnières' });
  const B = DEM({ id: 2, reference: 'SVAV-DEM-2026-000002', communeNom: 'Clichy' });
  const PANNEAU = createElement('span', null, 'DETAIL-DE-LA-LIGNE'); // sentinelle du slot fourni par la Vue
  const rendu = (over?: Partial<Parameters<typeof TableDemandes>[0]>) => renderToStaticMarkup(createElement(TableDemandes, {
    visibles: [A, B], categories: CATS_D3, tri: TRI_COMMUNE, sel: new Set<number>(),
    toutCoche: false, messageVide: 'Aucune demande.', panneau: PANNEAU, ...over,
  }));
  const compte = (h: string, re: RegExp) => (h.match(re) ?? []).length;

  it('aucune ligne ouverte par défaut (demandeOuverte omis) → AUCUN détail rendu, chaque bouton dit « ouvrir »', () => {
    const h = rendu(); // demandeOuverte non fourni → null
    expect(h).not.toContain('DETAIL-DE-LA-LIGNE');   // le panneau n'est pas rendu tant que rien n'est ouvert
    expect(h).not.toContain('refermer');
    expect(h).not.toContain('aria-expanded="true"');
    expect(compte(h, />ouvrir</g)).toBe(2);          // deux lignes, deux boutons « ouvrir »
  });

  it('ouvrir une ligne rend son détail IMMÉDIATEMENT sous elle (entre sa ligne et la suivante), et nulle part ailleurs', () => {
    const h = rendu({ demandeOuverte: 1 });
    const iA = h.indexOf('SVAV-DEM-2026-000001');
    const iPanneau = h.indexOf('DETAIL-DE-LA-LIGNE');
    const iB = h.indexOf('SVAV-DEM-2026-000002');
    expect(iA).toBeLessThan(iPanneau);   // le détail suit la ligne 1…
    expect(iPanneau).toBeLessThan(iB);   // …et précède la ligne 2 → directement SOUS la ligne 1
    expect(compte(h, /DETAIL-DE-LA-LIGNE/g)).toBe(1); // rendu une seule fois
  });

  it('UN SEUL VOLET : demandeOuverte=2 → le détail est sous la ligne 2, la ligne 1 n’a AUCUN détail (jamais deux ouverts)', () => {
    const h = rendu({ demandeOuverte: 2 });
    const iB = h.indexOf('SVAV-DEM-2026-000002');
    const iPanneau = h.indexOf('DETAIL-DE-LA-LIGNE');
    expect(iPanneau).toBeGreaterThan(iB);             // sous la ligne 2 (la dernière) → pas entre 1 et 2
    expect(compte(h, /DETAIL-DE-LA-LIGNE/g)).toBe(1); // exactement un panneau, jamais deux
  });

  it('le bouton de la ligne OUVERTE porte « refermer » (aria-expanded=true + aria-controls) ; la ligne fermée garde « ouvrir »', () => {
    const h = rendu({ demandeOuverte: 1 });
    expect(h).toContain('refermer');
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-controls="demande-1"'); // relie le bouton à son panneau (ancreDetail)
    expect(h).toContain('id="demande-1"');            // le panneau (2ᵉ tr) porte cet id
    expect(compte(h, />ouvrir</g)).toBe(1);           // la ligne 2 (fermée) garde « ouvrir »
    expect(h).toContain('aria-expanded="false"');
  });

  it('les COLONNES ne bougent pas : panneau pleine largeur (colSpan=10), en-tête et ligne fermée inchangés', () => {
    const ouvert = rendu({ demandeOuverte: 1 });
    expect(ouvert).toContain('colSpan="10"');         // le détail couvre toutes les colonnes → aucun décalage
    const iRef = ouvert.indexOf('Référence'); const iType = ouvert.indexOf('Type'); const iCommune = ouvert.indexOf('Commune');
    expect(iRef).toBeLessThan(iType); expect(iType).toBeLessThan(iCommune); // en-tête intact
    expect(ouvert).toContain('aria-label="Sélectionner SVAV-DEM-2026-000002"'); // la ligne fermée 2 est intacte
  });

  it('avecSelection=false → le panneau couvre 9 colonnes (colonne de sélection retirée), toujours pleine largeur', () => {
    const h = rendu({ demandeOuverte: 1, avecSelection: false });
    expect(h).toContain('colSpan="9"');
    expect(h).not.toContain('colSpan="10"');
    expect(h).toContain('DETAIL-DE-LA-LIGNE');
  });
});

describe('U7 — PanneauDetailDemande : contenu + actions du détail (déplacé sous la ligne, à l’identique)', () => {
  const noop = () => {};
  const cbs = { onCorps: noop, onRefDetail: noop, onFermer: noop, onSauverCorps: noop, onAjouterReference: noop, onBascule: noop, onTransition: noop };
  const DETAIL = (over: Record<string, unknown> = {}) => ({
    id: 1, reference: 'SVAV-DEM-2026-000001', codeInsee: '92004', communeNom: 'Asnières', statut: 'brouillon',
    profil: 'entreprise', canal: 'email', destEmail: 'urba@mairie.fr', destAdressePostale: null, destUrlFormulaire: null,
    destOrigine: 'mairie_contact', destNom: null, corps: 'CORPS DEMANDE',
    dossiers: [{ numDau: 'PC0920042500001', date: null }], dossiersRetires: [],
    referencesMairie: [], referencesMairieIndisponible: false, ...over,
  }) as unknown as Parameters<typeof PanneauDetailDemande>[0]['detail'];
  const rendu = (over: Record<string, unknown> = {}, corps = 'CORPS DEMANDE', retour: RetourAction = null) =>
    renderToStaticMarkup(createElement(PanneauDetailDemande, { detail: DETAIL(over), corps, refDetail: '', retour, ...cbs }));

  it('affiche la référence, le destinataire figé, un bouton « fermer »', () => {
    const h = rendu();
    expect(h).toContain('SVAV-DEM-2026-000001');
    expect(h).toContain('Destinataire figé');
    expect(h).toContain('urba@mairie.fr');
    expect(h).toContain('fermer');
  });

  it('brouillon → corps ÉDITABLE + « Enregistrer le texte » / « Marquer prête » / « Annuler la demande »', () => {
    const h = rendu({ statut: 'brouillon' });
    expect(h).toContain('Enregistrer le texte');
    expect(h).toContain('Marquer prête');
    expect(h).toContain('Annuler la demande');
    expect(h).not.toContain('readOnly');       // textarea éditable (aucun attribut readOnly)
    expect(h).not.toContain('bascule impossible');
  });

  it('non brouillon (prête) → textarea LECTURE SEULE, « bascule impossible », AUCUN bouton de transition', () => {
    const h = rendu({ statut: 'prete' });
    expect(h).toContain('readOnly');           // textarea non éditable hors brouillon
    expect(h).toContain('bascule impossible');
    expect(h).not.toContain('Marquer prête');
    expect(h).not.toContain('Enregistrer le texte');
  });

  it('références mairie : « aucune enregistrée » si vide ; listées sinon ; « indisponibles » si lecture en erreur', () => {
    expect(rendu({ referencesMairie: [] })).toContain('aucune enregistrée');
    expect(rendu({ referencesMairie: [{ reference: 'SLC-42' }] })).toContain('SLC-42');
    expect(rendu({ referencesMairieIndisponible: true })).toContain('indisponibles');
  });

  it('le retour d’action de la ZONE détail se rend dans le panneau (même MessageRetour qu’avant le déplacement)', () => {
    expect(rendu()).not.toContain('Texte enregistré.');
    expect(rendu({}, 'x', { texte: 'Texte enregistré.', ok: true, zone: 'detail' })).toContain('Texte enregistré.');
  });
});

describe('T6-A — Retour mairie (dérivation + rendu) + colonnes « En cours » + slots du détail', () => {
  it('etatRetourMairie : 3 états dérivés (priorité obtenus > message > aucun)', () => {
    expect(etatRetourMairie({ nbReponses: 0, dossiersActifs: 2, dossiersSatisfaits: 0 })).toBe('aucun');
    expect(etatRetourMairie({ nbReponses: 1, dossiersActifs: 2, dossiersSatisfaits: 0 })).toBe('message');
    expect(etatRetourMairie({ nbReponses: 0, dossiersActifs: 2, dossiersSatisfaits: 2 })).toBe('obtenus');
    expect(etatRetourMairie({ nbReponses: 3, dossiersActifs: 2, dossiersSatisfaits: 2 })).toBe('obtenus'); // obtenus prime sur message
    expect(etatRetourMairie({ nbReponses: 0, dossiersActifs: 0, dossiersSatisfaits: 0 })).toBe('aucun');   // 0 dossier actif → jamais « obtenus »
  });

  it('RetourMairie : « aucun retour » / « message reçu le JJ/MM (N) » / « documents obtenus »', () => {
    expect(renderToStaticMarkup(createElement(RetourMairie, { etat: 'aucun', nbReponses: 0, derniereReponseLe: null }))).toContain('aucun retour');
    expect(renderToStaticMarkup(createElement(RetourMairie, { etat: 'message', nbReponses: 2, derniereReponseLe: '2026-08-05T09:30:00Z' }))).toContain('message reçu le 05/08 (2)');
    expect(renderToStaticMarkup(createElement(RetourMairie, { etat: 'obtenus', nbReponses: 0, derniereReponseLe: null }))).toContain('documents obtenus');
  });

  const COLS = { largeur: 2, entetes: createElement('th', null, 'Délai-EnTete'), cellule: (d: DemandeAffichee) => createElement('td', null, `cell-${d.id}`) };
  const renduTable = (over?: Partial<Parameters<typeof TableDemandes>[0]>) => renderToStaticMarkup(createElement(TableDemandes, {
    visibles: [DEM({ id: 1, rangs: [1] })], categories: CATS_D3, tri: TRI_COMMUNE, sel: new Set<number>(),
    toutCoche: false, messageVide: 'Aucune demande.', ...over,
  }));

  it('SANS colonnesSuivi (À demander) : aucune colonne supplémentaire, colSpan de base — NON-RÉGRESSION', () => {
    const h = renduTable({ demandeOuverte: 1, panneau: createElement('span', null, 'PAN') });
    expect(h).not.toContain('Délai-EnTete');
    expect(h).toContain('colSpan="10"'); // 10 colonnes (avec sélection) — inchangé par l’ajout de colonnesSuivi
  });

  it('AVEC colonnesSuivi (En cours) : 2 colonnes ajoutées APRÈS Statut, colSpan du panneau reflète +2', () => {
    const h = renduTable({ colonnesSuivi: COLS, demandeOuverte: 1, panneau: createElement('span', null, 'PAN') });
    expect(h).toContain('Délai-EnTete');
    expect(h).toContain('cell-1');
    expect(h.indexOf('Statut')).toBeLessThan(h.indexOf('Délai-EnTete')); // injectées après la colonne Statut
    expect(h).toContain('colSpan="12"'); // 10 + 2
    expect(h).not.toContain('colSpan="10"');
  });

  it('PanneauDetailDemande : slotDossiers REMPLACE le détail brut, slotActions s’ajoute (En cours) ; sans slots → détail brut (À demander)', () => {
    const noop = () => {};
    const cbs = { onCorps: noop, onRefDetail: noop, onFermer: noop, onSauverCorps: noop, onAjouterReference: noop, onBascule: noop, onTransition: noop };
    const DETAIL = { id: 1, reference: 'SVAV-DEM-2026-000009', codeInsee: '92004', communeNom: 'Asnières', statut: 'envoyee',
      profil: 'entreprise', canal: 'email', destEmail: null, destAdressePostale: null, destUrlFormulaire: null, destOrigine: 'mairie_contact', destNom: null,
      corps: 'X', dossiers: [{ numDau: 'PC-DOSSIER-BRUT', date: null }], dossiersRetires: [], referencesMairie: [], referencesMairieIndisponible: false,
    } as unknown as Parameters<typeof PanneauDetailDemande>[0]['detail'];
    const base = { detail: DETAIL, corps: 'X', refDetail: '', retour: null as RetourAction, ...cbs };
    const sans = renderToStaticMarkup(createElement(PanneauDetailDemande, base));
    expect(sans).toContain('PC-DOSSIER-BRUT'); // détail brut des dossiers (À demander)
    const avec = renderToStaticMarkup(createElement(PanneauDetailDemande, { ...base,
      slotDossiers: createElement('span', null, 'SLOT-DOSSIERS-RICHE'), slotActions: createElement('span', null, 'SLOT-CLOTURE') }));
    expect(avec).toContain('SLOT-DOSSIERS-RICHE');
    expect(avec).toContain('SLOT-CLOTURE');
    expect(avec).not.toContain('PC-DOSSIER-BRUT'); // remplacé par le slot riche
  });
});

describe('Q7 — STATUT_LIBELLE : « annulée » + lisibilité des lignes de journal d’avant le renommage', () => {
  it('la valeur COURANTE annulee → « annulée »', () => {
    expect(STATUT_LIBELLE.annulee).toBe('annulée');
  });
  it('les quatre autres statuts inchangés', () => {
    expect(STATUT_LIBELLE.brouillon).toBe('brouillon');
    expect(STATUT_LIBELLE.prete).toBe('prête');
    expect(STATUT_LIBELLE.envoyee).toBe('envoyée');
    expect(STATUT_LIBELLE.close).toBe('close');
  });
  it('l’ANCIENNE valeur abandonnee (demande_journal append-only) reste TRADUITE, jamais brute', () => {
    // Une ligne de journal écrite avant Q7 porte encore 'abandonnee' : son affichage doit rester lisible.
    expect(STATUT_LIBELLE.abandonnee).toBe('annulée (ex-abandonnée)');
    expect(STATUT_LIBELLE.abandonnee).not.toBe('abandonnee'); // jamais le token brut à l’écran
  });
});

describe('T2-C — BlocDossiersDetail : compte les attachés, liste les retirés à part (jamais une disparition muette)', () => {
  const rendu = (dossiers: { numDau: string }[], retires: { numDau: string }[]) =>
    renderToStaticMarkup(createElement(BlocDossiersDetail, { dossiers, retires }));

  it('4 dossiers dont 3 retirés → « Dossiers (1) » + les 3 retirés sous leur étiquette, jamais comptés avec', () => {
    const h = rendu([{ numDau: 'PC-A' }], [{ numDau: 'PC-B' }, { numDau: 'PC-C' }, { numDau: 'PC-D' }]);
    expect(h).toContain('Dossiers (1)');                       // compte = attachés uniquement
    expect(h).toContain('PC-A');
    expect(h).toContain('3 dossiers retirés de la demande');   // étiquette distincte + décompte
    expect(h).toContain('PC-B, PC-C, PC-D');                   // les retirés restent LISTÉS
  });

  it('un seul retiré → « 1 dossier retiré de la demande » (singulier)', () => {
    expect(rendu([{ numDau: 'PC-A' }], [{ numDau: 'PC-Z' }])).toContain('1 dossier retiré de la demande');
  });

  it('demande SANS retrait → rendue exactement comme avant (une ligne « Dossiers (N) », aucune étiquette de retrait)', () => {
    const h = rendu([{ numDau: 'PC-A' }, { numDau: 'PC-B' }], []);
    expect(h).toBe('<div><span style="font-size:12px;color:var(--color-svv-muted)">Dossiers (2) : </span><span style="font-size:12px">PC-A, PC-B</span></div>');
    expect(h).not.toContain('retiré');
  });
});

describe('Q6b — MentionMasquage : le masquage par défaut n’est JAMAIS silencieux', () => {
  const rendu = (morts: { statut: string; n: number }[], onAfficherTout?: () => void) =>
    renderToStaticMarkup(createElement(MentionMasquage, { morts, onAfficherTout }));

  it('aucune ligne masquée → ne rend RIEN (pas de bruit)', () => {
    expect(rendu([])).toBe('');
    expect(rendu([{ statut: 'annulee', n: 0 }])).toBe(''); // total 0 → rien
  });

  it('des annulées masquées → annonce le décompte EXACT + propose « les afficher »', () => {
    const h = rendu([{ statut: 'annulee', n: 99 }], () => {});
    expect(h).toContain('99 annulée(s) masquée(s)');
    expect(h).toContain('les afficher');
    expect(h).toContain('<button'); // l’offre d’affichage est actionnable
  });

  it('« En cours » : des closes masquées → « 3 close(s) masquée(s) »', () => {
    const h = rendu([{ statut: 'close', n: 3 }], () => {});
    expect(h).toContain('3 close(s) masquée(s)');
  });

  it('sans callback « les afficher » → décompte annoncé mais aucun bouton', () => {
    const h = rendu([{ statut: 'annulee', n: 5 }]);
    expect(h).toContain('5 annulée(s) masquée(s)');
    expect(h).not.toContain('<button');
  });
});

// ── Q2b : STOCK — bloc repliable + tableau par commune + panneau de détail (disclosure natif) ─────────────────────────
const CATS_STOCK = [
  { cle: 'immeuble_neuf', libelle: 'Immeuble neuf', rang: 1 },
  { cle: 'surelevation', libelle: 'Surélévation', rang: 2 },
  { cle: 'construction_neuve', libelle: 'Construction neuve', rang: 3 },
  { cle: 'extension', libelle: 'Extension', rang: 4 },
  { cle: 'demolition', libelle: 'Démolition', rang: 5 },
];
const ligneStock = (over: Partial<LigneStock> = {}): LigneStock => ({ codeInsee: '75056', communeNom: 'Paris', parType: { immeuble_neuf: 5, extension: 3 }, total: 8, ...over });

describe('Q2b — libelleStock (étiquette de la ligne repliée, décompte calculé)', () => {
  it('null (rien chargé) → étiquette générique', () => {
    expect(libelleStock(null, 6)).toBe('Stock de permis à demander (par commune)');
  });
  it('stock chargé → chiffre principal (immeubles) sur combien de communes', () => {
    const l = libelleStock([ligneStock({ parType: { immeuble_neuf: 5 } }), ligneStock({ codeInsee: '93029', parType: { immeuble_neuf: 2 } }), ligneStock({ codeInsee: '92004', parType: { extension: 4 } })], 6);
    expect(l).toContain('7 immeubles à demander'); // 5 + 2
    expect(l).toContain('2 communes');             // seules celles avec ≥1 immeuble
    expect(l).toContain('6 derniers mois');
  });
});

describe('Q2b — TableStock (disclosure natif par ligne : aria-expanded / aria-controls)', () => {
  const rendu = (communeOuverte: string | null, panneau?: ReactNode, lignes: LigneStock[] = [ligneStock()]) =>
    renderToStaticMarkup(createElement(TableStock, { lignes, categories: CATS_STOCK, communeOuverte, onDetail: () => {}, panneau }));

  it('ligne fermée → bouton « Détail », aria-expanded=false, panneau ABSENT', () => {
    const h = rendu(null, createElement('span', {}, 'PANNEAU_SENTINELLE'));
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('Détail');
    expect(h).not.toContain('PANNEAU_SENTINELLE');   // panneau rendu SEULEMENT quand la ligne est ouverte
  });

  it('ligne ouverte → aria-expanded=true, aria-controls pointe le panneau, panneau rendu sous la ligne', () => {
    const h = rendu('75056', createElement('span', {}, 'PANNEAU_SENTINELLE'));
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('aria-controls="stock-detail-75056"');
    expect(h).toContain('id="stock-detail-75056"');   // 2ᵉ <tr><td colSpan> porteur du panneau
    expect(h).toContain('PANNEAU_SENTINELLE');
    expect(h).toContain('Fermer');
  });

  it('le panneau s’ouvre sous la BONNE ligne (celle ouverte, pas une autre)', () => {
    const lignes = [ligneStock({ codeInsee: '75056', communeNom: 'Paris' }), ligneStock({ codeInsee: '93029', communeNom: 'Drancy' })];
    const h = rendu('93029', createElement('span', {}, 'PANNEAU_SENTINELLE'), lignes);
    expect(h).toContain('id="stock-detail-93029"');       // panneau sur Drancy
    expect(h).not.toContain('id="stock-detail-75056"');   // pas sur Paris
    expect((h.match(/aria-expanded="true"/g) ?? []).length).toBe(1); // une seule ligne ouverte
  });

  it('un stock à 0 dans une colonne affiche « 0 », jamais une cellule vide', () => {
    const h = rendu(null, undefined, [ligneStock({ parType: { extension: 2 }, total: 2 })]); // aucun immeuble
    expect(h).toContain('>0</td>'); // la colonne immeuble neuf rend 0 (pas de blanc)
  });

  it('en-têtes = libellés de l’app (jamais réinventés), immeuble neuf en tête', () => {
    const h = rendu(null);
    for (const c of CATS_STOCK) expect(h).toContain(c.libelle);
    expect(h.indexOf('Immeuble neuf')).toBeLessThan(h.indexOf('Extension')); // ordre canonique
  });
});

describe('Q2b — PanneauDetailStock (période, type, permis, Refermer)', () => {
  const permisFixture: PermisDetail[] = [
    { numDau: 'PC-A', date: '2026-05-01', adresse: '10 rue de Paris', categorie: 'immeuble_neuf', libelleCategorie: 'Immeuble neuf', demandeReference: 'SVAV-DEM-2026-000009' },
    { numDau: 'PC-B', date: '2026-04-01', adresse: '2 rue B', categorie: 'extension', libelleCategorie: 'Extension', demandeReference: null },
  ];
  const rendu = (permis: PermisDetail[] | null, chargement = false) =>
    renderToStaticMarkup(createElement(PanneauDetailStock, {
      communeNom: 'Paris', categories: CATS_STOCK, periode: '6m', typeFiltre: 'immeuble_neuf', permis, chargement, onRefermer: () => {},
    }));

  it('permis déjà demandé → référence affichée ; non demandé → « à demander »', () => {
    const h = rendu(permisFixture);
    expect(h).toContain('SVAV-DEM-2026-000009');
    expect(h).toContain('demandé');
    expect(h).toContain('à demander');
    expect(h).toContain('PC-A');
    expect(h).toContain('10 rue de Paris');
  });

  it('sélecteurs période (6 mois → origine) + type (tous + catégories), bouton Refermer', () => {
    const h = rendu(permisFixture);
    expect(h).toContain('6 derniers mois');
    expect(h).toContain('Depuis l’origine');   // « origine » élargit
    expect(h).toContain('Tous les types');
    expect(h).toContain('Immeuble neuf');
    expect(h).toContain('Refermer');
  });

  it('chargement (permis=null) → « Chargement… » ; vide ([]) → message explicite', () => {
    expect(rendu(null, true)).toContain('Chargement');
    expect(rendu([])).toContain('Aucun permis délivré');
  });
});

describe('Q2b — BlocStock (repliable, fermé par défaut, mention du sous-ensemble)', () => {
  it('fermé (stock null) → étiquette générique, contenu (explication + table) NON rendu', () => {
    const h = renderToStaticMarkup(createElement(BlocStock, {
      ouvert: false, chargement: false, stock: null, fenetreMois: 6, onToggle: () => {},
      table: createElement('span', {}, 'TABLE_SENTINELLE'),
    }));
    expect(h).toContain('Stock de permis à demander (par commune)');
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain('TABLE_SENTINELLE');     // données chargées SEULEMENT à l'ouverture
    expect(h).not.toContain('sous-ensemble');
  });

  it('ouvert + stock chargé → table rendue, mention « sous-ensemble d’affichage », temps de calcul', () => {
    const h = renderToStaticMarkup(createElement(BlocStock, {
      ouvert: true, chargement: false, stock: [ligneStock()], genereEnMs: 15, fenetreMois: 6, onToggle: () => {},
      table: createElement('span', {}, 'TABLE_SENTINELLE'),
    }));
    expect(h).toContain('aria-expanded="true"');
    expect(h).toContain('TABLE_SENTINELLE');
    expect(h).toContain('sous-ensemble d’affichage'); // n'affecte pas l'éligibilité
    expect(h).toContain('15 ms');
  });

  it('ouvert + en chargement (stock null) → « Chargement du stock… »', () => {
    const h = renderToStaticMarkup(createElement(BlocStock, { ouvert: true, chargement: true, stock: null, fenetreMois: 6, onToggle: () => {} }));
    expect(h).toContain('Chargement du stock');
  });

  it('U6 — REPLIÉ par défaut : une seule ligne (titre + compteur) visible, contenu du tableau NON rendu ; ouverture manuelle inchangée', () => {
    const stock = [ligneStock({ parType: { immeuble_neuf: 5 } }), ligneStock({ codeInsee: '93029', parType: { immeuble_neuf: 2 } })];
    const table = createElement('span', {}, 'TABLE_SENTINELLE');
    const replie = renderToStaticMarkup(createElement(BlocStock, { ouvert: false, chargement: false, stock, fenetreMois: 6, onToggle: () => {}, table }));
    expect(replie).toContain('aria-expanded="false"');   // une seule ligne dépliable
    expect(replie).toContain(libelleStock(stock, 6));     // le titre + son compteur restent visibles
    expect(replie).not.toContain('TABLE_SENTINELLE');     // le contenu du tableau n'est PAS dans l'état ouvert
    // ouverture manuelle : le MÊME bloc, ouvert, rend le contenu (comportement inchangé)
    const ouvert = renderToStaticMarkup(createElement(BlocStock, { ouvert: true, chargement: false, stock, fenetreMois: 6, onToggle: () => {}, table }));
    expect(ouvert).toContain('aria-expanded="true"');
    expect(ouvert).toContain('TABLE_SENTINELLE');
  });
});

describe('Q4 — BandeauReglages (rappel des réglages en vigueur + filtre d’ancienneté)', () => {
  const rendu = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(BandeauReglages, {
    ancienneteMaxAnnees: 2, triLibelle: 'ORDRE_LIBELLE_SENTINELLE',
    moisSaisie: '24', maxMois: 24, onMois: () => {}, onAllerReglages: () => {}, ...over,
  }));

  it('rappelle l’ancienneté maximale et l’ordre d’examen (libellé fourni par la Vue = source unique)', () => {
    const h = rendu();
    expect(h).toContain('Ancienneté maximale des demandes');
    expect(h).toContain('2 ans');
    expect(h).toContain('examen');                    // « Ordre d’examen »
    expect(h).toContain('ORDRE_LIBELLE_SENTINELLE');  // le libellé vient d’optionsEnumLabels, jamais réécrit ici
  });

  it('1 an → singulier « an »', () => {
    expect(rendu({ ancienneteMaxAnnees: 1, maxMois: 12, moisSaisie: '12' })).toContain('1 an<');
  });

  it('champ NOMBRE borné [1, maxMois], borne affichée sous le champ (motif PlageParam), AUCUN slider', () => {
    const h = rendu();
    expect(h).toContain('type="number"');
    expect(h).toContain('min="1"');
    expect(h).toContain('max="24"');
    expect(h).toContain('value="24"');
    expect(h).toContain('Plage autorisée');
    expect(h).toContain('24 mois');
    expect(h).not.toContain('type="range"'); // pas de curseur/slider
  });

  it('propose un lien vers l’onglet Réglages', () => {
    expect(rendu()).toContain('Réglages');
  });
});

describe('Q4 — stock : libellé de fenêtre DYNAMIQUE (plus de « 6 » figé)', () => {
  it('libelleStock reflète la fenêtre en cours (24 mois, jamais 6)', () => {
    const l = libelleStock([ligneStock({ parType: { immeuble_neuf: 3 } })], 24);
    expect(l).toContain('24 derniers mois');
    expect(l).not.toContain('6 derniers mois');
  });

  it('BlocStock (ouvert) affiche la fenêtre courante dans l’explication', () => {
    const h = renderToStaticMarkup(createElement(BlocStock, {
      ouvert: true, chargement: false, stock: [], genereEnMs: 10, fenetreMois: 18, onToggle: () => {},
      table: createElement('span', {}, 'TABLE'),
    }));
    expect(h).toContain('18 derniers mois');
  });
});
