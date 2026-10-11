// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { RattachementsDuFil } from './RattachementsDuFil';
import { TITRE_BIENS_SUIVIS } from '../../../../lib/gestion/ficheRattachement';

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — « MODIFIER LE RATTACHEMENT », MONTÉE POUR DE VRAI ══════════
 *
 * Demande d'Arno (11/10/2026), bloc par bloc. Ce fichier éprouve la porte PONCTUELLE (historique d'un bien → mail →
 * « Modifier le rattachement ») ; les deux autres portes de la même fenêtre sont éprouvées par `VisualiserUnifie`.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : un fil inventé, des lots inventés, `fetch` simulé — rien ne sort, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIL = 9123;
const personne = (role: 'proprietaire' | 'locataire', nom: string, expediteur = false) => ({
  role, cle: `${role}-${nom}`, id: 12, nom, civilite: null, expediteur,
  telephones: [{ libelle: 'Mobile 1', valeur: '0611223344', affichage: '06 11 22 33 44', note: null }],
  emails: [{ libelle: 'Email 1', valeur: `${nom.toLowerCase().replace(/\W+/g, '.')}@exemple.test`,
    affichage: `${nom.toLowerCase().replace(/\W+/g, '.')}@exemple.test`, note: null }],
});
const FICHE = {
  filId: 77, objet: 'Fuite', nbMailsDuFil: 13, horsGestion: false, messageRecentId: MAIL,
  enTete: { messageId: MAIL, de: 'c.jullien@exemple.test', deNom: 'JULLIEN', recuLe: '2025-11-21T10:00:00Z', objet: 'Fuite' },
  disponible: true,
  biens: [{
    cle: 'L-176', lotId: 176, adresseComplete: '15 rue Carle Hebert, 92400 COURBEVOIE', numeroLot: '176',
    nature: 'Appartement', typeBien: 'Studio', surfaceM2: 28, statut: 'classe',
    dateMail: '2025-11-21', nbMails: 1, dossierDriveId: 'dossier-176', lienIds: [100],
    personnes: [personne('proprietaire', 'JULLIEN - GARRIDO Cédric', true), personne('locataire', 'COLSON Manon')],
  }],
};
const LIENS = [{
  id: 100, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: 'L-176', id: null }, libelle: 'lot 176',
  origine: 'manuel', statut: 'confirme', confiance: null, regle: null, motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null,
}];
const CONTEXTE = {
  messageId: MAIL, filId: 77, dateMail: '2025-11-21', nbMailsDuFil: 13, proprietaire: null,
  examen: { issue: 'sans_candidat', motif: '' }, pieces: [], disponible: true, biens: [],
};
const SUIVI = {
  etat: 'ok', mails: [9100, 9101, 9102, 9103, 9104, 9105, 9106, 9107, 9108, 9109, 9110, 9111, MAIL],
  periodes: [{ id: 5, depuisMessageId: 9100, classement: { sorte: 'biens', biens: [{ cle: 'L-176', libelle: 'lot 176' }] } }],
  exceptions: [],
};

let container: HTMLDivElement;
let root: Root;
let ecritures: { url: string; corps: unknown }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if ((init?.method ?? 'GET') !== 'GET') {
      ecritures.push({ url: u, corps: JSON.parse(String(init?.body ?? 'null')) });
      return { ok: true, json: async () => ({ ok: true, trace: { filId: 77, exceptions: [1], periodes: [] } }) } as unknown as Response;
    }
    if (u.includes('rattachements?fiche=')) return { ok: true, json: async () => ({ etat: 'ok', data: FICHE }) } as unknown as Response;
    if (u.includes('rattachements?fil=')) return { ok: true, json: async () => ({ etat: 'ok', data: LIENS }) } as unknown as Response;
    if (u.includes('/gestion/suivi')) return { ok: true, json: async () => SUIVI } as unknown as Response;
    if (u.includes('/gestion/classement')) return { ok: true, json: async () => ({ etat: 'ok', contexte: CONTEXTE }) } as unknown as Response;
    if (u.includes('/affectation')) return { ok: true, json: async () => ({ etat: 'ok', evenement: null, qualifie: true }) } as unknown as Response;
    return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
let ferme = 0;
const monter = async () => {
  ferme = 0;
  await act(async () => {
    root.render(createElement(RattachementsDuFil, {
      filId: 77, titre: 'Fuite', messageId: MAIL, ponctuel: true, onFerme: () => { ferme += 1; }, onGeste: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element) => { await act(async () => { (e as HTMLElement).click(); }); await calmer(); };
const bouton = (motif: RegExp) => [...container.querySelectorAll('button')].find((b) => motif.test(b.textContent ?? ''));

describe('① le bloc « Biens actuellement suivi(s) dans cette conversation »', () => {
  it('🔴 le titre est intégré au cadre du bloc, et remplace « 1 bien rattaché à ce mail »', async () => {
    await monter();
    const bloc = container.querySelector('section.rdf-suivis');
    expect(bloc?.querySelector('h3')?.textContent).toBe(TITRE_BIENS_SUIVIS);
    expect(bloc?.querySelector('.rdf-suivi-carte')).not.toBeNull();
    expect(container.querySelector('.rdf-compteur')).toBeNull();
    expect(container.textContent).not.toContain('1 bien rattaché à ce mail');
  });

  it('🔴 chaque bien est une carte au format du composant partagé : case, titre, « i », parties, motif', async () => {
    await monter();
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    expect(carte.className).toContain('rec-bien');
    expect((carte.querySelector('.rec-choix input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(carte.querySelector('.rec-bien-nom')?.textContent).toBe('15 rue Carle Hebert, COURBEVOIE — Appartement · Studio');
    expect(carte.querySelector('.rec-choix .ifb-bouton, .rec-choix button')).not.toBeNull();
    const parties = carte.querySelector('.rec-deux-lignes')?.textContent ?? '';
    expect(parties).toContain('Propriétaire JULLIEN - GARRIDO Cédric');
    expect(parties).toContain('Locataire (à la date du mail) COLSON Manon');
    expect(carte.querySelector('.rec-motif')?.textContent).toBe('déjà rattaché — décochez pour le retirer');
  });

  it('🔴 une ligne repliable unique, au nom du propriétaire ; dépliée, le détail actuel', async () => {
    await monter();
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    const details = carte.querySelectorAll('details.rdf-suivi-detail');
    expect(details).toHaveLength(1);
    const d = details[0] as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toContain('JULLIEN - GARRIDO Cédric');
    /* Le détail : les deux parties, MOBILE / E-MAIL avec Copier, Fiche annuaire, détail par mail. */
    expect(d.querySelectorAll('.rdf-personne')).toHaveLength(2);
    expect(d.textContent).toContain('06 11 22 33 44');
    expect([...d.querySelectorAll('button')].filter((b) => /Copier/.test(b.textContent ?? '')).length).toBeGreaterThan(0);
    expect(d.textContent).toContain('Fiche annuaire');
    expect(d.textContent).toContain('Voir le détail par mail');
  });

  it('🔴 la capsule EXPÉDITEUR, à côté de la partie qui a écrit — y compris sur la ligne repliée', async () => {
    await monter();
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    const lignes = [...carte.querySelectorAll('.rec-deux-lignes .rec-ligne-parties')];
    expect(lignes[0].querySelector('.rec-expediteur')?.textContent).toBe('Expéditeur');
    expect(lignes[1].querySelector('.rec-expediteur')).toBeNull();
    expect(carte.querySelector('summary .rec-expediteur')?.textContent).toBe('Expéditeur');
  });

  it('🔴 « Ouvrir le Drive du bien » et « Historique du bien » ne sont plus dans cette modale', async () => {
    await monter();
    expect(container.querySelector('.rdf-raccourcis')).toBeNull();
    expect(container.textContent).not.toMatch(/Drive du bien/);
    expect(container.textContent).not.toMatch(/Historique du bien/);
  });

  it('décocher la carte annonce le retrait', async () => {
    await monter();
    await cliquer(container.querySelector('.rdf-suivi-carte input.rdf-garde') as Element);
    const carte = container.querySelector('.rdf-suivi-carte') as HTMLElement;
    expect(carte.className).toContain('rdf-suivi-carte--retire');
    expect(carte.textContent).toContain('sera retiré');
  });
});

describe('④ la ligne « Événement rattaché », repliable', () => {
  it('🔴 une seule ligne repliée ; dépliée, « Lier à un événement » et « Créer un événement »', async () => {
    await monter();
    const d = container.querySelector('details.rdf-evt') as HTMLDetailsElement;
    expect(d).not.toBeNull();
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe('Événement rattaché : aucun');
    expect(bouton(/^Lier à un événement$/)).toBeDefined();
    expect(bouton(/^Créer un événement$/)).toBeDefined();
    expect(d.contains(bouton(/^Lier à un événement$/) as Node)).toBe(true);
  });
});

describe('la croix', () => {
  it('🔴 fermer par la croix : rien n’est écrit', async () => {
    await monter();
    await cliquer(container.querySelector('.rdf-suivi-carte input.rdf-garde') as Element);
    await cliquer(container.querySelector('.rdf-croix') as Element);
    expect(ferme).toBe(1);
    expect(ecritures).toEqual([]);
  });
});
