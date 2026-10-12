// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreEvenementMail } from './FenetreEvenementMail';
import {
  corpsCreation, partiesDesBiensFiche, phraseRemplacement, titrePrerempli,
} from '../../../../lib/gestion/evenementDuMail';

/**
 * ══ 🔴🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — « ÉVÉNEMENT DE CE MAIL » ══════════════════════════════════
 * Lier en one shot, créer depuis le mail, remplacement d'événement, retrait — par la route `/messages/<id>/affectation`.
 * 🔒 AUCUNE DONNÉE RÉELLE : `fetch` simulé ; les écritures sont capturées, jamais envoyées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIL = 9123;
const GES1 = { id: 1, reference: 'GES-2026-000001', objet: 'Fuite', ouvert: true, categorie: 'fuite_eau', urgence: 'haute',
  ouvertLe: '2026-09-23T08:00:00Z', etape: null };
const GES2 = { id: 2, reference: 'GES-2026-000002', objet: 'Toiture', ouvert: true, categorie: 'travaux', urgence: 'urgent',
  ouvertLe: '2026-09-20T08:00:00Z', etape: null };
const FICHE = {
  filId: 77, objet: 'Facture', nbMailsDuFil: 2, horsGestion: false, messageRecentId: MAIL,
  enTete: { messageId: MAIL, de: 'banc@exemple.test', deNom: 'BANC', recuLe: '2026-09-24T07:40:27Z', objet: 'Re: Facture diagnostic' },
  disponible: true,
  biens: [{
    cle: 'L-1', lotId: 1, adresseComplete: '1 rue du Banc, 92400 COURBEVOIE', numeroLot: '1', nature: 'Appartement',
    typeBien: 'Studio', surfaceM2: 20, statut: 'classe', dateMail: '2026-09-24', nbMails: 1, dossierDriveId: null,
    lienIds: [100], personnes: [
      { role: 'proprietaire', cle: 'P-9', id: 9, nom: 'PROPRIO Banc', civilite: null, expediteur: false, telephones: [], emails: [] },
      { role: 'locataire', cle: 'T-4', id: 4, nom: 'LOCATAIRE Banc', civilite: null, expediteur: false, telephones: [], emails: [] },
    ],
  }],
};

let container: HTMLDivElement;
let root: Root;
let ecritures: { url: string; methode: string; corps: unknown }[];
let affectation: Record<string, unknown>;
let fait: string[];
let ferme: number;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = []; fait = []; ferme = 0;
  affectation = { etat: 'ok', qualifie: true, evenement: null, lus: { rattaches: [], duBien: [GES1, GES2] } };
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const rep = (j: unknown) => ({ ok: true, json: async () => j }) as unknown as Response;
    const methode = init?.method ?? 'GET';
    if (methode !== 'GET') {
      ecritures.push({ url: u, methode, corps: init?.body === undefined ? null : JSON.parse(String(init.body)) });
      return rep({ ok: true });
    }
    if (u.includes('/affectation')) return rep(affectation);
    if (u.includes('rattachements?fiche=')) return rep({ etat: 'ok', data: FICHE });
    if (u.includes('/annuaire?lotCle=')) return rep({ etat: 'ok', data: { occupations: [] } });
    return rep({ etat: 'ok', resultats: [] });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(FenetreEvenementMail, {
      messageId: MAIL, filId: 77, onFerme: () => { ferme += 1; }, onFait: (m: string) => { fait.push(m); },
    }));
  });
  await calmer();
};
const bouton = (t: string) => [...container.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === t) as HTMLButtonElement;
const cliquer = async (e: Element) => { await act(async () => { (e as HTMLElement).click(); }); await calmer(); };

describe('🔴🔴 A) lier ce mail à un événement déjà ouvert (one shot)', () => {
  it('la liste des événements en cours (urgence décroissante), le choix, puis « Lier ce mail » → CE mail seul', async () => {
    await monter();
    expect(container.querySelector('.fem-entete')?.textContent).toContain('Re: Facture diagnostic');
    expect(container.querySelector('.fem-biens')?.textContent).toContain('1 rue du Banc, 92400 COURBEVOIE — lot 1');
    const refs = [...container.querySelectorAll('.fem-ligne .cev-ref')].map((e) => e.textContent);
    expect(refs).toEqual(['GES-2026-000002', 'GES-2026-000001']);
    expect(container.querySelector('.fem-ligne .fem-meta')?.textContent).toBe('ouvert le 20/09/2026Étape : Ouverture (20/09/2026)');
    expect(bouton('Lier ce mail').disabled).toBe(true);
    await cliquer(container.querySelectorAll('.fem-ligne input[type="radio"]')[0]);
    await cliquer(bouton('Lier ce mail'));
    expect(ecritures).toEqual([{ url: `/api/admin/gestion/messages/${MAIL}/affectation`, methode: 'POST', corps: { evenementId: 2 } }]);
    expect(fait).toEqual(['Mail lié à l’événement.']);
  });
  it('déjà lié : « Ce mail est lié à … », et choisir un autre événement annonce « remplacera GES-… »', async () => {
    affectation = { etat: 'ok', qualifie: true,
      evenement: { evenementId: 1, reference: GES1.reference, objet: GES1.objet, etat: 'a_traiter', portee: 'mail', categorie: null, urgence: null },
      lus: { rattaches: [GES1], duBien: [GES1, GES2] } };
    await monter();
    expect(container.querySelector('.fem-lie')?.textContent).toContain('Ce mail est lié à');
    expect(container.querySelector('.fem-lie .cev-ref')?.textContent).toBe('GES-2026-000001');
    /* L'événement déjà lié ne se recoche pas : « Rattaché ✓ ». */
    const lignes = [...container.querySelectorAll('.fem-ligne')];
    const ligneG1 = lignes.find((l) => l.textContent?.includes('GES-2026-000001')) as HTMLElement;
    expect((ligneG1.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(ligneG1.querySelector('.fem-deja')?.textContent).toBe('Rattaché ✓');
    const ligneG2 = lignes.find((l) => l.textContent?.includes('GES-2026-000002')) as HTMLElement;
    await cliquer(ligneG2.querySelector('input') as HTMLElement);
    expect(container.querySelector('.fem-choisi .fem-remplace')?.textContent).toBe(' — remplacera GES-2026-000001');
    expect(ecritures).toEqual([]);
  });
  it('« Voir aussi les autres événements » ouvre la recherche de l’ancien « Lier à un événement »', async () => {
    await monter();
    await cliquer(bouton('Voir aussi les autres événements'));
    expect(container.querySelector('.fem-autres')).not.toBeNull();
    expect(ecritures).toEqual([]);
  });
});

describe('🔴🔴 B) créer un événement à partir de ce mail', () => {
  it('titre prérempli (adresse — lot), ouverture = date du mail ; « Créer l’événement » → le mail est le 1er de la carte', async () => {
    await monter();
    await cliquer(bouton('Créer un événement à partir de ce mail'));
    const titre = container.querySelector('.bev-saisie') as HTMLInputElement;
    expect(titre.value).toBe('1 rue du Banc, 92400 COURBEVOIE — lot 1');
    /* Le formulaire existant, sans rien retirer — « Garder pour la validation » compris. */
    expect(bouton('Garder pour la validation')).toBeDefined();
    await cliquer(bouton('Créer l’événement'));
    expect(ecritures).toHaveLength(1);
    const e = ecritures[0] as { url: string; methode: string; corps: { nouveau: Record<string, unknown> } };
    expect([e.url, e.methode]).toEqual([`/api/admin/gestion/messages/${MAIL}/affectation`, 'POST']);
    expect(e.corps.nouveau.objet).toBe('1 rue du Banc, 92400 COURBEVOIE — lot 1');
    expect(e.corps.nouveau.ouvertLe).toBe('2026-09-24');
    expect(e.corps.nouveau.parties).toEqual([
      { sorte: 'lot', cle: 'L-1', libelle: '1 rue du Banc, 92400 COURBEVOIE — lot 1' },
      { sorte: 'proprietaire', cle: 'P-9', libelle: 'PROPRIO Banc' },
      { sorte: 'locataire', cle: 'T-4', libelle: 'LOCATAIRE Banc' },
    ]);
    expect(fait).toEqual(['Événement créé à partir de ce mail.']);
  });
});

describe('🔴 retirer, fermer', () => {
  it('« Retirer ce mail de l’événement » (le « Délier » existant) quand le lien est posé sur CE mail', async () => {
    affectation = { etat: 'ok', qualifie: true,
      evenement: { evenementId: 1, reference: GES1.reference, objet: GES1.objet, etat: 'a_traiter', portee: 'mail', categorie: null, urgence: null },
      lus: { rattaches: [GES1], duBien: [GES1] } };
    await monter();
    await cliquer(bouton('Retirer ce mail de l’événement'));
    expect(ecritures).toEqual([{ url: `/api/admin/gestion/messages/${MAIL}/affectation`, methode: 'DELETE', corps: null }]);
  });
  it('lié par la conversation : pas de « Retirer » (le lien n’est pas sur CE mail)', async () => {
    affectation = { etat: 'ok', qualifie: true,
      evenement: { evenementId: 1, reference: GES1.reference, objet: GES1.objet, etat: 'a_traiter', portee: 'conversation', categorie: null, urgence: null },
      lus: { rattaches: [GES1], duBien: [GES1] } };
    await monter();
    expect(bouton('Retirer ce mail de l’événement')).toBeUndefined();
    expect(container.querySelector('.fem-note')?.textContent).toBe('(par sa conversation)');
  });
  it('fermer (croix ou « Fermer ») n’écrit rien', async () => {
    await monter();
    await cliquer(container.querySelector('.fem-croix') as Element);
    await cliquer(bouton('Fermer'));
    expect(ferme).toBe(2);
    expect(ecritures).toEqual([]);
  });
});

describe('🔒 le module pur', () => {
  it('remplacement, titre, parties, corps de création', () => {
    expect(phraseRemplacement([{ id: 1, reference: 'GES-1' }], 2)).toBe('remplacera GES-1');
    expect(phraseRemplacement([{ id: 1, reference: 'GES-1' }], 1)).toBeNull();
    expect(phraseRemplacement([], 2)).toBeNull();
    expect(titrePrerempli([], ' Re: objet ')).toBe('Re: objet');
    expect(titrePrerempli(['A — lot 1'], 'x')).toBe('A — lot 1');
    const parties = partiesDesBiensFiche([{ cle: 'L', personnes: [{ role: 'locataire', cle: 'T', nom: 'Loc' }] }],
      [{ cle: 'L', libelle: 'Lot' }]);
    expect(corpsCreation({ objet: ' T ', categorie: '', urgence: 'haute', ouvertLe: '2026-01-01', closLe: null, note: null,
      concernes: { modifie: true, choix: [{ sorte: 'libre', nom: 'X' }] } }, true, parties).nouveau)
      .toEqual({ objet: 'T', categorie: null, urgence: 'haute', parties: [{ sorte: 'lot', cle: 'L', libelle: 'Lot' }],
        concernes: [{ sorte: 'libre', nom: 'X' }], ouvertLe: '2026-01-01', closLe: null, note: null });
    expect(Object.keys(corpsCreation({ objet: 'T', categorie: 'x', urgence: 'y', ouvertLe: null, closLe: null, note: null },
      false, []).nouveau)).not.toContain('categorie');
  });
});
