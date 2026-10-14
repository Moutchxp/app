// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  BlocHistoriqueEchanges, categoriesDeLaFichePersonne, personneDuBloc, texteFichePersonne,
  type FichePersonneLue, type PerimetreEchanges,
} from './BlocHistoriqueEchanges';
import { brouillonNouveauPersonne, cibleDeLHistorique, type PersonneHistorique } from './HistoriqueDuBien';
import { bienDuNouveauMessageLocataire, type LogementPourNouveauMessage } from '../../../../lib/gestion/bienNouveauMessageLocataire';
import type { LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-ECHANGES-FICHE-LOCATAIRE (Arno, 14/10/2026) — LE BLOC PARTAGÉ, PARAMÉTRÉ PAR SON PÉRIMÈTRE ═══════
 *
 * Le bloc « Historique des échanges » de la fiche propriétaire, monté sur la fiche d'un locataire avec le périmètre
 * « mails du logement » : même barre OPTIONS, même frise, même raccourci des pièces, même légende, « Nouveau message » —
 * seule la sélection change (`lot-<clé>`, sans `echanges=1`), et le message neuf part rattaché au bien loué.
 * Routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAINTENANT = new Date('2026-10-14T08:00:00Z');
const ligne = (o: Partial<LigneHistorique> = {}): LigneHistorique => ({
  messageId: 1, filId: 10, messageIdRfc: null, recuLe: '2026-02-01T09:00:00Z', sens: 'recu',
  de: 'lea@exemple.test', deNom: 'DURAND Léa', destinataires: [], a: [], cc: [], cci: [],
  repondreA: [], adressesTexte: [], objet: 'Quittance', extrait: 'Bonjour', pieces: [],
  parCible: { sorte: 'lot', cle: '353', id: null }, cibleLibelle: '26 rue Emile Duclaux, Paris — lot 353', source: 'rattachement',
  evenements: [], statut: null, statutDetail: null, ...o,
});
const LIGNES = [
  ligne({ messageId: 2, filId: 20, recuLe: '2026-03-15T09:00:00Z', objet: 'Travaux', sens: 'envoye', de: 'gestion@exemple.test',
    pieces: [{ pieceId: 22, nomFichier: 'devis.pdf', typeMime: 'application/pdf', tailleOctets: 1000, disponible: true, motifNonStocke: null, empreinte: 'e22' }] }),
  ligne({ messageId: 1, filId: 10 }),
];
const FICHE: FichePersonneLue = { titre: 'DURAND Léa', sousTitre: null, adresses: ['lea@exemple.test'], occupations: [] };
const BIEN = { lotId: 4353, cle: '353', libelle: '26 rue Emile Duclaux, Paris — lot 353' };

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
      return reponse({ etat: 'ok', data: { tronque: false, messages: [{ messageId: 2, filId: 20, recuLe: LIGNES[0].recuLe, sens: 'envoye',
        de: 'gestion@exemple.test', deNom: null, objet: 'Travaux', pieces: LIGNES[0].pieces }] } });
    }
    if (u.includes('/historique/frise')) {
      return reponse({ etat: 'ok', data: { tronque: false, mails: [
        { messageId: 1, recuLe: '2026-02-01T09:00:00Z', sens: 'recu', de: 'lea@exemple.test', deNom: null, objet: 'Quittance', aClasser: true },
        { messageId: 2, recuLe: '2026-03-15T09:00:00Z', sens: 'envoye', de: 'gestion@exemple.test', deNom: null, objet: 'Travaux', aClasser: false },
      ] } });
    }
    if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
    return reponse({ etat: 'ok', data: {
      titre: 'lot 353', sousTitre: null, adresses: [], occupations: [],
      lignes: LIGNES, suite: false, entete: { nbMails: 2 }, selection: { nbMails: 2 },
      interlocuteurs: [], interlocuteursTronques: false, propositions: [],
    } });
  }));
  vi.stubGlobal('open', vi.fn());
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); }); };
async function monter(perimetre: PerimetreEchanges): Promise<void> {
  await act(async () => {
    racine.render(createElement(BlocHistoriqueEchanges, {
      sorte: 'locataire', cle: 'T1', fiche: FICHE, perimetre, maintenant: MAINTENANT,
      redaction: { schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false, signature: 'Service Gestion',
        nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 5, classementDisponible: true } as never,
    }));
  });
  await calmer();
}
const texte = (): string => hote.textContent ?? '';
const parMot = (mot: string) => [...hote.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(mot));
const cliquer = async (el: Element | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const requetes = (r: RegExp) => appels.filter((u) => r.test(u));
const requetesMails = () => requetes(/\/api\/admin\/gestion\/historique\?/);

describe('🔴🔴 PÉRIMÈTRE « BIEN » — les mails du logement, avec le bloc de la fiche propriétaire', () => {
  it('la sélection : les mails du LOGEMENT (lot-353), sans echanges=1, pour la liste, les pièces et la frise', async () => {
    await monter({ sorte: 'bien', cle: '353', bienNouveauMessage: BIEN });
    expect(requetesMails().length).toBeGreaterThan(0);
    for (const r of [/\/historique\?/, /\/historique\/pieces/, /\/historique\/frise/]) {
      expect(requetes(r).length).toBeGreaterThan(0);
      expect(requetes(r).every((u) => u.includes('cible=lot-353') && !u.includes('echanges=1'))).toBe(true);
    }
    // Rien de ce qui n'a de sens que pour la fiche d'un bien n'est demandé (même règle que la fiche propriétaire).
    expect(appels.some((u) => /\/historique\/(evenements|parties|accolades|sortis)/.test(u))).toBe(false);
  });
  it('le MÊME bloc que la fiche propriétaire : titre, Période, OPTIONS, Classement, frise, légende, pièces, Nouveau message', async () => {
    await monter({ sorte: 'bien', cle: '353', bienNouveauMessage: BIEN });
    expect(hote.querySelector('#hdb-titre')?.textContent).toContain('Historique des échanges');
    expect(parMot('Tous les échanges')).toBeDefined();
    expect(texte()).toContain('Dates personnalisées');
    const options = [...hote.querySelectorAll('legend')].find((l) => l.textContent === 'Options')!.parentElement!;
    expect(options.querySelector('input[type="search"], input[type="text"]')).not.toBeNull();
    for (const mot of ['Toutes', 'Avec', 'Sans', 'Événement ouvert', 'Plus récent en haut', 'Regrouper par conversation']) {
      expect(options.textContent).toContain(mot);
    }
    expect(hote.querySelector('[data-option="classement"]')).not.toBeNull();
    expect(hote.querySelectorAll('.hdb-barre').length).toBeGreaterThan(0);
    expect(hote.querySelector('.hdb-legende-barres')).not.toBeNull();
    expect(hote.querySelector('[data-legende="classement"]')).not.toBeNull();
    expect(texte()).toMatch(/pièces? dans cette sélection/);
    expect(parMot('Nouveau message')).toBeDefined();
    // Rien de propre à la fiche d'un bien, ni la ligne des logements (elle est en cartes sur la fiche).
    expect([...hote.querySelectorAll('legend')].map((l) => l.textContent)).not.toContain('Parties');
    expect(hote.querySelector('[data-occupations]')).toBeNull();
    expect(texte()).not.toContain('Depuis l’entrée du dernier locataire');
  });
  it('les filtres partent au serveur sur le périmètre du logement : pièces, événement ouvert, classement, recherche', async () => {
    await monter({ sorte: 'bien', cle: '353', bienNouveauMessage: BIEN });
    await cliquer(parMot('Avec'));
    expect(requetesMails().at(-1)).toMatch(/cible=lot-353/);
    expect(requetesMails().some((u) => u.includes('pieces=avec'))).toBe(true);
    await cliquer(parMot('Événement ouvert'));
    expect(requetesMails().some((u) => u.includes('evt=ouvert') && u.includes('cible=lot-353'))).toBe(true);
    await cliquer([...(hote.querySelector('[data-option="classement"]') as HTMLElement).querySelectorAll('button')][1]);
    expect(requetesMails().at(-1)).toContain('classe=a_classer');
  });
  it('🔴 « Nouveau message » : adressé au locataire (comme la fiche propriétaire) et RATTACHÉ au bien loué', async () => {
    await monter({ sorte: 'bien', cle: '353', bienNouveauMessage: BIEN });
    await cliquer(parMot('Nouveau message'));
    expect(texte()).toContain('lea@exemple.test');
    // Le bien loué est déjà coché dans le composeur : la case verte « Rattaché » compte un logement.
    expect(texte()).toMatch(/Rattaché\s*1 logement/);
  });
});

describe('PUR — périmètre, personne, couleurs, brouillon', () => {
  const personneEchanges: PersonneHistorique = { sorte: 'proprietaire', cle: '79', nom: 'X', adresses: ['a@b.test'] };
  it('cibleDeLHistorique : fiche propriétaire INCHANGÉE, bien inchangé, périmètre « bien » = la cible du bien', () => {
    expect(cibleDeLHistorique('x', personneEchanges)).toBe('proprio-79&echanges=1');
    expect(cibleDeLHistorique('155', null)).toBe('lot-155');
    expect(cibleDeLHistorique('x', { ...personneEchanges, sorte: 'locataire', perimetreBien: '353' })).toBe('lot-353');
  });
  it('personneDuBloc : périmètre « échanges » = l’objet d’avant ce lot ; « bien » = périmètre + bien, sans occupations', () => {
    const fiche: FichePersonneLue = { titre: 'DURAND Léa', sousTitre: null, adresses: ['lea@exemple.test'],
      occupations: [{ cle: '26', libelle: 'x', depuis: '2025-01-01', jusqua: null }] };
    const ouvrir = () => {};
    expect(personneDuBloc('locataire', 'T1', fiche, { sorte: 'echanges' }, ouvrir)).toEqual({
      sorte: 'locataire', cle: 'T1', nom: 'DURAND Léa', adresses: ['lea@exemple.test'], occupations: fiche.occupations, onOuvrirLogement: ouvrir,
    });
    expect(personneDuBloc('proprietaire', '79', fiche, { sorte: 'echanges' })).toEqual({
      sorte: 'proprietaire', cle: '79', nom: 'DURAND Léa', adresses: ['lea@exemple.test'],
    });
    expect(personneDuBloc('locataire', 'T1', fiche, { sorte: 'bien', cle: '353', bienNouveauMessage: BIEN }, ouvrir)).toEqual({
      sorte: 'locataire', cle: 'T1', nom: 'DURAND Léa', adresses: ['lea@exemple.test'], perimetreBien: '353', bienNouveauMessage: BIEN,
    });
  });
  it('couleurs : la famille de la fiche, ancien locataire quand plus aucune occupation n’est en cours', () => {
    const f = (occ: FichePersonneLue['occupations']): FichePersonneLue => ({ titre: '', sousTitre: null, adresses: ['A@B.test'], occupations: occ });
    expect(categoriesDeLaFichePersonne('proprietaire', f([])).get('a@b.test')).toBe('proprietaire');
    expect(categoriesDeLaFichePersonne('locataire', f([{ cle: '1', libelle: '', depuis: null, jusqua: null }])).get('a@b.test')).toBe('locataire');
    expect(categoriesDeLaFichePersonne('locataire', f([{ cle: '1', libelle: '', depuis: null, jusqua: '2024-01-01' }])).get('a@b.test')).toBe('ancien_locataire');
    expect(texteFichePersonne('locataire', 'T1')).toBe('locataire-T1');
  });
  it('brouillonNouveauPersonne : adressé à la fiche ; le bien coché seulement s’il y en a un', () => {
    const base = { a: [] as string[], objet: '', cibles: [] as unknown[] };
    expect(brouillonNouveauPersonne(base, personneEchanges)).toEqual({ a: ['a@b.test'], objet: '', cibles: [] });
    expect(brouillonNouveauPersonne(base, { ...personneEchanges, bienNouveauMessage: BIEN })).toEqual({
      a: ['a@b.test'], objet: '', cibles: [{ sorte: 'lot', cle: '353', id: 4353, libelle: BIEN.libelle }],
    });
  });
});

describe('PUR — le bien présélectionné du « Nouveau message » d’un locataire', () => {
  const L = (o: Partial<LogementPourNouveauMessage>): LogementPourNouveauMessage => ({
    lotId: 1, numero: '1', adresse: '1 rue A', commune: 'Paris', entree: '2020-01-01', sortie: null, horsGestion: false, ...o,
  });
  it('le bien loué ACTUELLEMENT, même s’il en a loué d’autres avant', () => {
    expect(bienDuNouveauMessageLocataire([
      L({ lotId: 7, numero: '7', sortie: '2019-12-31', entree: '2015-01-01' }),
      L({ lotId: 353, numero: '353', adresse: '26 rue Emile Duclaux', sortie: null }),
    ])).toEqual({ lotId: 353, cle: '353', libelle: '26 rue Emile Duclaux, Paris — lot 353' });
  });
  it('plusieurs en cours : le premier, celui que le bloc de mails montre', () => {
    expect(bienDuNouveauMessageLocataire([L({ lotId: 2, numero: '2' }), L({ lotId: 3, numero: '3' })])?.cle).toBe('2');
  });
  it('🔴 ANCIEN locataire : le DERNIER bien loué (sortie la plus récente, puis entrée)', () => {
    expect(bienDuNouveauMessageLocataire([
      L({ lotId: 7, numero: '7', sortie: '2019-12-31' }),
      L({ lotId: 9, numero: '9', sortie: '2024-06-30' }),
      L({ lotId: 8, numero: '8', sortie: '2022-01-31' }),
    ])?.cle).toBe('9');
    expect(bienDuNouveauMessageLocataire([
      L({ lotId: 5, numero: '5', sortie: '2024-06-30', entree: '2020-01-01' }),
      L({ lotId: 6, numero: '6', sortie: '2024-06-30', entree: '2023-01-01' }),
    ])?.cle).toBe('6');
  });
  it('jamais un bien hors gestion ou inconnu de l’annuaire ; rien à viser → null (message sans bien)', () => {
    expect(bienDuNouveauMessageLocataire([L({ lotId: null, numero: 'X' }), L({ lotId: 4, numero: '4', horsGestion: true })])).toBeNull();
    expect(bienDuNouveauMessageLocataire([
      L({ lotId: 4, numero: '4', horsGestion: true }), L({ lotId: 7, numero: '7', sortie: '2019-12-31' }),
    ])?.cle).toBe('7');
    expect(bienDuNouveauMessageLocataire([])).toBeNull();
  });
});

describe('🔒 un seul bloc, deux fiches', () => {
  const lire = (f: string) => readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
  it('HistoriquePersonne et la fiche locataire montent le MÊME composant ; la fiche locataire ne monte plus VieDuBien', () => {
    expect(lire('HistoriquePersonne.tsx')).toContain("<BlocHistoriqueEchanges sorte={cible.sorte} cle={cle} fiche={fiche} perimetre={{ sorte: 'echanges' }}");
    const annuaire = lire('Annuaire.tsx');
    expect(annuaire).toContain('<BlocHistoriqueEchanges sorte="locataire"');
    expect(annuaire).toContain("perimetre={{ sorte: 'bien', cle: lotCle, bienNouveauMessage: bienDuNouveauMessageLocataire(f.logements) }}");
    expect(annuaire).not.toContain('<VieDuBien');
    // Le texte explicatif au-dessus du bloc est conservé.
    expect(annuaire).toContain('un mail est rattaché à un bien, jamais à une personne.');
  });
});
