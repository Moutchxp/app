// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HistoriquePersonne } from './HistoriquePersonne';
import { HistoriqueDuBien, cibleDeLHistorique, motOccupation } from './HistoriqueDuBien';
import type { LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-PERSONNE (Arno, 14/10/2026) — L'HISTORIQUE D'UNE FICHE PROPRIÉTAIRE / LOCATAIRE, À L'ÉCRAN ═══
 * Le MÊME composant que l'historique d'un bien (`HistoriqueDuBien`), seule la sélection change (`echanges=1`) : mêmes
 * cartes, même barre OPTIONS, même résumé des pièces, même légende, « Nouveau message ». Ce qui était propre à l'ancien
 * écran et qu'Arno a fait retirer n'y est plus. Routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-14T08:00:00Z');
const ligne = (o: Partial<LigneHistorique> = {}): LigneHistorique => ({
  messageId: 1, filId: 10, messageIdRfc: null, recuLe: '2026-02-01T09:00:00Z', sens: 'recu',
  de: 'c.jullien@exemple.test', deNom: 'JULLIEN Cédric', destinataires: [], a: [], cc: [], cci: [],
  repondreA: [], adressesTexte: [], objet: 'Quittance', extrait: 'Bonjour', pieces: [],
  parCible: { sorte: 'proprietaire', cle: '79', id: null }, cibleLibelle: '', source: 'rattachement',
  evenements: [], statut: null, statutDetail: null, ...o,
});
const LIGNES = [
  ligne({ messageId: 2, filId: 20, recuLe: '2026-03-15T09:00:00Z', objet: 'Travaux', sens: 'envoye', de: 'gestion@exemple.test',
    pieces: [{ pieceId: 22, nomFichier: 'devis.pdf', typeMime: 'application/pdf', tailleOctets: 1000, disponible: true, motifNonStocke: null, empreinte: 'e22' }] }),
  ligne({ messageId: 1, filId: 10 }),
];

let hote: HTMLDivElement;
let racine: Root;
let appels: string[];
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  appels = [];
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    appels.push(u);
    if (u.includes('/historique/pieces')) {
      return reponse({ etat: 'ok', porteurs: [{ messageId: 2, filId: 20, recuLe: LIGNES[0].recuLe, sens: 'envoye', de: 'gestion@exemple.test', deNom: null,
        objet: 'Travaux', pieces: LIGNES[0].pieces }], tronque: false, total: 1 });
    }
    if (u.includes('/historique/frise')) return reponse({ etat: 'ok', mois: [] });
    if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
    const locataire = u.includes('cible=locataire');
    return reponse({ etat: 'ok', data: {
      titre: locataire ? 'DURAND Léa' : 'JULLIEN - GARRIDO Cédric', sousTitre: locataire ? '2 logements occupés' : '6 logements en gestion',
      adresses: locataire ? ['lea@exemple.test'] : ['c.jullien@exemple.test'],
      occupations: locataire ? [
        { cle: '26', libelle: '26 rue Emile Duclaux', depuis: '2025-01-01', jusqua: null },
        { cle: '27', libelle: '7 avenue de l’Union', depuis: '2020-01-01', jusqua: '2024-12-31' },
      ] : [],
      lignes: LIGNES, suite: false, entete: { nbMails: 2 }, selection: { nbMails: 2 },
      interlocuteurs: [], interlocuteursTronques: false, propositions: [{ lienId: 1 }],
    } });
  }));
  vi.stubGlobal('open', vi.fn());
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); }); };
let logementOuvert: string | null = null;
async function monter(sorte: 'proprietaire' | 'locataire', cle: string): Promise<void> {
  logementOuvert = null;
  await act(async () => {
    racine.render(createElement(HistoriquePersonne, {
      cible: { sorte, cle, id: null }, maintenant: MAINTENANT, onRetour: () => {}, onReception: () => {},
      onOuvrirLogement: (c: string) => { logementOuvert = c; },
      redaction: { schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, signature: 'Service Gestion',
        nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5, classementDisponible: true } as never,
    } as never));
  });
  await calmer();
}
const texte = (): string => hote.textContent ?? '';
const parMot = (mot: string) => [...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(mot));
const cliquer = async (el: Element | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const requetesMails = () => appels.filter((u) => /\/api\/admin\/gestion\/historique\?/.test(u) && !/taille=1(&|$)/.test(u));

describe('🔴🔴 fiche PROPRIÉTAIRE — même composant que l’historique d’un bien', () => {
  it('la sélection demandée : les échanges de la fiche (proprio-79, echanges=1), pour les mails, les pièces et la frise', async () => {
    await monter('proprietaire', '79');
    expect(requetesMails().length).toBeGreaterThan(0);
    expect(requetesMails().every((u) => u.includes('cible=proprio-79&echanges=1'))).toBe(true);
    expect(appels.some((u) => u.includes('/historique/pieces') && u.includes('cible=proprio-79&echanges=1'))).toBe(true);
    expect(appels.some((u) => u.includes('/historique/frise') && u.includes('cible=proprio-79&echanges=1'))).toBe(true);
    // Ce qui n'a de sens que pour un bien n'est pas demandé.
    expect(appels.some((u) => /\/historique\/(evenements|parties|accolades|sortis)/.test(u))).toBe(false);
  });
  it('en-tête gardé (← Écran partagé, Réception, nature, nom) ; le bloc est celui de l’historique d’un bien', async () => {
    await monter('proprietaire', '79');
    expect(parMot('← Écran partagé')).toBeDefined();
    expect(parMot('Réception')).toBeDefined();
    expect(hote.querySelector('.hst-sorte')?.textContent).toBe('Propriétaire');
    expect(hote.querySelector('.hst-titre')?.textContent).toBe('JULLIEN - GARRIDO Cédric');
    expect(hote.querySelector('section.hdb')).not.toBeNull();
    expect(hote.querySelector('#hdb-titre')?.textContent).toContain('Historique des échanges');
  });
  it('🔴 la barre OPTIONS complète, les cartes de mail, la légende, « Nouveau message », le résumé des pièces', async () => {
    await monter('proprietaire', '79');
    const options = [...hote.querySelectorAll('legend')].find((l) => l.textContent === 'Options')!.parentElement!;
    expect(options.querySelector('input[type="search"], input[type="text"]')).not.toBeNull();
    for (const mot of ['Toutes', 'Avec', 'Sans', 'Événement ouvert', 'Plus récent en haut', 'Regrouper par conversation']) {
      expect(options.textContent).toContain(mot);
    }
    expect(hote.querySelectorAll('.hdb-barre').length).toBeGreaterThan(0);
    expect(hote.querySelector('.hdb-legende-barres')).not.toBeNull();
    expect(parMot('Nouveau message')).toBeDefined();
    expect(texte()).toMatch(/pièce/);
  });
  it('ordre par défaut : plus récent en haut', async () => {
    await monter('proprietaire', '79');
    const objets = [...hote.querySelectorAll('[id^="hdb-mail-"]')].map((e) => e.id);
    expect(objets[0]).toBe('hdb-mail-2');
  });
  it('chaque option part au serveur (pièces, événement ouvert) ; l’ordre s’inverse', async () => {
    await monter('proprietaire', '79');
    await cliquer(parMot('Avec'));
    expect(requetesMails().some((u) => u.includes('pieces=avec'))).toBe(true);
    await cliquer(parMot('Événement ouvert'));
    expect(requetesMails().some((u) => u.includes('evt=ouvert'))).toBe(true);
    await cliquer(parMot('Plus récent en haut'));
    expect(texte()).toContain('Plus ancien en haut');
  });
  it('« Période » : Tous les échanges et Dates personnalisées (Du / Au) ; rien de propre à un bien', async () => {
    await monter('proprietaire', '79');
    expect(parMot('Tous les échanges')).toBeDefined();
    expect(texte()).not.toContain('Depuis l’entrée du dernier locataire');
    expect(texte()).not.toContain('Un événement');
  });
  it('🔴 retirés avec l’accord d’Arno : logements, regroupement par logement, interlocuteurs, propositions, Parties', async () => {
    await monter('proprietaire', '79');
    for (const mot of ['Inclure les mails', 'Regrouper par logement', 'Interlocuteurs', 'propositions non confirmées', 'Appliquer']) {
      expect(texte()).not.toContain(mot);
    }
    expect([...hote.querySelectorAll('legend')].map((l) => l.textContent)).not.toContain('Parties');
  });
  it('« Nouveau message » s’adresse à la fiche', async () => {
    await monter('proprietaire', '79');
    await cliquer(parMot('Nouveau message'));
    expect(texte()).toContain('c.jullien@exemple.test');
  });
});

describe('PUR', () => {
  it('cible de l’historique : inchangée pour un bien', () => {
    expect(cibleDeLHistorique('155', null)).toBe('lot-155');
    expect(cibleDeLHistorique('x', { sorte: 'locataire', cle: 'T1', nom: '', adresses: [] })).toBe('locataire-T1&echanges=1');
  });
  it('les dates d’occupation', () => {
    expect(motOccupation('2025-01-01', null)).toBe('depuis le 01/01/2025');
    expect(motOccupation(null, null)).toBe('dates inconnues');
  });
  it('le composant est exporté une seule fois (même composant pour les trois historiques)', () => {
    expect(typeof HistoriqueDuBien).toBe('function');
  });
});
