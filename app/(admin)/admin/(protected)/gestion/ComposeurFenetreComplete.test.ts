// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { RattachementsDuFil } from './RattachementsDuFil';
import { TITRE_BIENS_SUIVIS } from '../../../../lib/gestion/ficheRattachement';

/**
 * ══ 🔴🔴 LOT COMPOSEUR-FENETRE-COMPLETE (Arno, 13-14/10/2026) — LA FENÊTRE DU COMPOSEUR EST CELLE DE « MODIFIER LE
 * RATTACHEMENT », COMPLÈTE ═════════════════════════════════════════════════════════════════════════════════════════════
 * Biens suivis avec leur case, propositions et recherche, « Événement rattaché », « Portée du suivi » à 4 positions.
 * Rien n'est écrit avant l'envoi ; les choix sont gardés avec le brouillon et partent avec l'envoi.
 * Le VRAI composeur et la VRAIE fenêtre, routes simulées : rien ne part, rien n'est écrit.
 * (L'application après l'envoi — mêmes écritures que « Modifier le rattachement » pour chaque position — est éprouvée
 * sur une base d'essai : `composeurFenetreComplete.itest.ts`.)
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5, classementDisponible: true, interneDisponible: true,
};
const MAIL = 9123;
const REPONSE: BrouillonEcran = {
  id: null, voie: 'repondre', a: ['c.jullien@exemple.test'], cc: [], cci: [], objet: 'Re: Fuite',
  corps: 'Bonjour,\n\nService Gestion', citation: null, destinatairesApproximatifs: false,
  filId: 77, repondALeMessageId: MAIL,
};
const NEUF: BrouillonEcran = { ...REPONSE, voie: 'nouveau', objet: 'Quittance', filId: null, repondALeMessageId: null, a: ['gabrielle@exemple.test'] };
const personne = (role: 'proprietaire' | 'locataire', nom: string) => ({
  role, cle: `${role}-${nom}`, id: 12, nom, civilite: null, expediteur: false, telephones: [], emails: [],
});
const FICHE = {
  filId: 77, objet: 'Fuite', nbMailsDuFil: 3, horsGestion: false, messageRecentId: MAIL,
  enTete: { messageId: MAIL, de: 'c.jullien@exemple.test', deNom: 'JULLIEN', recuLe: '2025-11-21T10:00:00Z', objet: 'Fuite' },
  disponible: true,
  biens: [{
    cle: 'L-176', lotId: 176, adresseComplete: '15 rue Carle Hebert, 92400 COURBEVOIE', numeroLot: '176',
    nature: 'Appartement', typeBien: 'Studio', surfaceM2: 28, statut: 'classe', dateMail: '2025-11-21', nbMails: 1,
    dossierDriveId: null, lienIds: [100],
    personnes: [personne('proprietaire', 'JULLIEN - GARRIDO Cédric'), personne('locataire', 'COLSON Manon')],
  }],
};
const LIENS = [{
  id: 100, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: 'L-176', id: null }, libelle: 'lot 176',
  origine: 'manuel', statut: 'confirme', confiance: null, regle: null, motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null,
}];
const SUIVI = {
  etat: 'ok', mails: [9100, 9101, MAIL], exceptions: [],
  periodes: [{ id: 5, depuisMessageId: 9100, classement: { sorte: 'biens', biens: [{ cle: 'L-176', libelle: 'lot 176' }] } }],
};
const EVENEMENT = { id: 31, reference: 'GES-2026-000031', objet: 'Fuite sous évier', ouvert: true, categorie: 'plomberie', urgence: 'haute', ouvertLe: '2025-11-20T09:00:00Z' };

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: unknown }[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entree);
    appels.push({ url, methode: init?.method ?? 'GET', corps: init?.body ? JSON.parse(String(init.body)) : null });
    const rep = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (/\/classement$/.test(url)) {
      return rep({ etat: 'ok', contexte: { disponible: true, interneDabord: false,
        biens: [{ cle: '421', libelle: '28 av. Marceau — lot 421', motif: 'locataire de ce bien', recommande: false, parties: [] }] } });
    }
    if (url.includes('rattachements?fiche=')) return rep({ etat: 'ok', data: FICHE });
    if (url.includes('rattachements?fil=')) return rep({ etat: 'ok', data: LIENS });
    if (url.includes('/gestion/suivi?fil=')) return rep(SUIVI);
    if (url.includes('/evenements/des-biens')) return rep({ etat: 'ok', duBien: url.includes('L-176') ? [EVENEMENT] : [] });
    if (url.includes('/affectation')) return rep({ etat: 'ok', evenement: null, qualifie: true, lus: { rattaches: [], duBien: [EVENEMENT] } });
    if (/\/gestion\/envois/.test(url)) return rep({ etat: 'ok', ok: true, envoi: { id: 1 } });
    return rep({ ok: true, brouillon: { id: 4242 } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i += 1) await Promise.resolve(); }); };
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await calmer(); };
let courant: BrouillonEcran;
let rerendre: () => void = () => {};
const monter = async (depart: BrouillonEcran) => {
  courant = depart;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (b: BrouillonEcran) => { courant = b; rendre(); }, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  rerendre = rendre;
  await act(async () => { rendre(); });
  await calmer();
};
const caseDe = (mot: RegExp) => [...container.querySelectorAll('.ccl-case')].find((c) => mot.test(c.textContent ?? '')) as HTMLButtonElement;
const ouvrir = async () => { await avancer(1500); await act(async () => { (caseDe(/Rattach/)).click(); }); await calmer(); };
const fenetre = () => container.querySelector('.rdf--brouillon') as HTMLElement | null;
const bouton = (motif: RegExp, dans: ParentNode = container) => [...dans.querySelectorAll('button')].find((b) => motif.test((b.textContent ?? '').trim()));
const radio = (libelle: string) => [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent === libelle)!;
const cliquer = async (e: Element) => { await act(async () => { (e as HTMLElement).click(); }); await calmer(); };

/**
 * Ce qui fait la forme d'un bloc : ses classes et ses mots. ⚠️ SANS « Voir le détail par mail » (`.rdf-detail-mails`) :
 * il liste les liens DU MAIL, et un mail en cours d'écriture n'en a encore aucun — c'est la seule différence.
 */
const forme = (e: Element | null) => (e === null ? null : {
  classes: [...e.querySelectorAll('*')].filter((x) => x.closest('.rdf-detail-mails') === null)
    .map((x) => x.className).filter((c) => typeof c === 'string' && c !== ''),
  radios: [...e.querySelectorAll('[role="radio"]')].map((x) => x.textContent),
});

describe('🔴 la fenêtre est la même que « Modifier le rattachement »', () => {
  it('mêmes blocs : biens suivis (case, fond vert, motif, parties), événement, glissière à 4 positions', async () => {
    await monter(REPONSE);
    await ouvrir();
    const f = fenetre()!;
    const composeur = {
      carte: forme(f.querySelector('.rdf-suivi-carte')),
      portee: forme(f.querySelector('.rdf-portee .gpo-libelles')),
      evt: f.querySelector('details.rdf-evt-bloc .rdf-evt-titre')?.textContent,
      motif: f.querySelector('.rdf-suivi-carte .rec-motif')?.textContent,
      titre: f.querySelector('.rdf-suivis-titre')?.textContent,
    };
    act(() => { root.unmount(); });
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(RattachementsDuFil, { filId: 77, titre: 'Fuite', messageId: MAIL, ponctuel: true, onFerme: () => {} } as never));
    });
    await calmer();
    const m = container.querySelector('.mrt.rdf') as HTMLElement;
    expect(composeur.carte).toEqual(forme(m.querySelector('.rdf-suivi-carte')));
    expect(composeur.portee).toEqual(forme(m.querySelector('.rdf-portee .gpo-libelles')));
    expect(composeur.portee?.radios).toEqual(['Origine', 'One shot', 'Ce mail + futurs échanges', 'Toute la conversation']);
    expect(composeur.evt).toBe(m.querySelector('details.rdf-evt-bloc .rdf-evt-titre')?.textContent);
    expect(composeur.motif).toBe('déjà rattaché — décochez pour le retirer');
    expect(composeur.titre).toBe(TITRE_BIENS_SUIVIS);
  });

  it('🔴 réponse : la carte du bien suivi est cochée, sur fond vert, avec propriétaire et locataire ; défaut « Origine »', async () => {
    await monter(REPONSE);
    await ouvrir();
    const carte = fenetre()!.querySelector('[data-bloc="suivis"] .rdf-suivi-carte') as HTMLElement;
    expect((carte.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(carte.className).toContain('rec-bien--coche');
    expect(carte.textContent).toContain('JULLIEN - GARRIDO Cédric');
    expect(carte.textContent).toContain('COLSON Manon');
    expect(radio('Origine').getAttribute('aria-checked')).toBe('true');
    expect(bouton(/^Valider le maintien du suivi actuel$/)).toBeDefined();
    // Le bien suivi n'est pas répété dans les propositions.
    expect([...fenetre()!.querySelectorAll('.rec-carte .rec-bien-nom')].map((x) => x.textContent).join(' ')).not.toContain('Carle Hebert');
  });

  it('🔴 événement : les événements en cours du bien, en lecture (« non rattaché »)', async () => {
    await monter(REPONSE);
    await ouvrir();
    const bloc = fenetre()!.querySelector('details.rdf-evt-bloc') as HTMLDetailsElement;
    expect(bloc.querySelector('.rdf-evt-resume')?.textContent).toContain('Événement rattaché');
    await act(async () => { bloc.open = true; bloc.dispatchEvent(new Event('toggle')); });
    await calmer();
    expect(bloc.textContent).toContain('Événements en cours sur ce bien');
    expect(bloc.textContent).toContain('GES-2026-000031');
    expect(bloc.querySelector('.rdf-evt-non-rattache')?.textContent).toBe('non rattaché');
  });

  it('🔴 nouveau message : pas de bloc des biens suivis ; premier rattachement, « Origine » interdite', async () => {
    await monter(NEUF);
    await ouvrir();
    expect(fenetre()!.querySelector('[data-bloc="suivis"]')).toBeNull();
    expect(radio('Origine').getAttribute('aria-disabled')).toBe('true');
    expect(radio('Ce mail + futurs échanges').getAttribute('aria-checked')).toBe('true');
  });
});

describe('🔴 la glissière se comporte comme sur un mail existant', () => {
  it('décocher le bien suivi : « sera retiré », la glissière passe d’elle-même sur One shot', async () => {
    await monter(REPONSE);
    await ouvrir();
    await cliquer(fenetre()!.querySelector('[data-bloc="suivis"] input[type="checkbox"]')!);
    expect(fenetre()!.querySelector('.rdf-sera-retire')?.textContent).toBe('sera retiré');
    expect(radio('One shot').getAttribute('aria-checked')).toBe('true');
    expect(bouton(/^Valider la modification du suivi$/)).toBeDefined();
  });
  it('« Toute la conversation » : la confirmation est exigée avant de valider', async () => {
    await monter(REPONSE);
    await ouvrir();
    await cliquer(fenetre()!.querySelector('[data-bloc="suivis"] input[type="checkbox"]')!);
    await cliquer(radio('Toute la conversation'));
    const alerte = fenetre()!.querySelector('.rdf-portee .rdf-alerte') as HTMLElement;
    expect(alerte.textContent).toContain('3 mails de cette conversation seront mis à jour');
    expect(bouton(/^Valider la modification du suivi$/)!.disabled).toBe(true);
    await cliquer(alerte.querySelector('input[type="checkbox"]')!);
    expect(bouton(/^Valider la modification du suivi$/)!.disabled).toBe(false);
  });
  it('revenir à « Origine » avec des modifications : la question, et « Oui » remet tout', async () => {
    await monter(REPONSE);
    await ouvrir();
    await cliquer(fenetre()!.querySelector('[data-bloc="suivis"] input[type="checkbox"]')!);
    await cliquer(radio('Origine'));
    expect(fenetre()!.textContent).toContain('Revenir au suivi d’origine ?');
    await cliquer(bouton(/^Oui$/)!);
    expect((fenetre()!.querySelector('[data-bloc="suivis"] input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(radio('Origine').getAttribute('aria-checked')).toBe('true');
  });
});

describe('🔴 rien n’est écrit avant l’envoi ; les choix sont gardés avec le brouillon et partent avec l’envoi', () => {
  it('valider : la portée et le bien décoché vont dans le brouillon ; aucune écriture de rattachement', async () => {
    await monter(REPONSE);
    // Le brouillon est écrit (un brouillon qu'on n'a pas touché ne s'enregistre pas : règle existante).
    await act(async () => { courant = { ...courant, corps: `Merci.\n\n${courant.corps}` }; rerendre(); });
    await calmer();
    await ouvrir();
    await cliquer(fenetre()!.querySelector('[data-bloc="suivis"] input[type="checkbox"]')!);
    await cliquer(radio('Ce mail + futurs échanges'));
    await cliquer(bouton(/^Valider la modification du suivi$/)!);
    expect(fenetre()).toBeNull();
    expect(courant.rattachement).toEqual({ position: 'suite', retires: ['L-176'] });
    expect((courant.cibles ?? []).map((c) => (c as { cle?: string }).cle)).not.toContain('L-176');
    expect(appels.filter((a) => a.methode !== 'GET' && /\/gestion\/(suivi|rattachements|messages)/.test(a.url))).toEqual([]);
    // Le brouillon enregistré les porte.
    await avancer(3000);
    const sauve = [...appels].reverse().find((a) => a.methode !== 'GET' && /\/gestion\/brouillons/.test(a.url));
    expect((sauve?.corps as { rattachement?: unknown })?.rattachement).toEqual({ position: 'suite', retires: ['L-176'] });
  });
  it('rouvrir la fenêtre : les choix sont retrouvés (bien décoché, glissière)', async () => {
    await monter({ ...REPONSE, rattachement: { position: 'suite', retires: ['L-176'] } } as BrouillonEcran);
    await ouvrir();
    expect((fenetre()!.querySelector('[data-bloc="suivis"] input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(radio('Ce mail + futurs échanges').getAttribute('aria-checked')).toBe('true');
  });
  it('l’envoi (route simulée) emporte les biens ET le rattachement', async () => {
    await monter({ ...REPONSE, cibles: [{ sorte: 'lot', cle: '421', id: null, libelle: '28 av. Marceau — lot 421' }],
      rattachement: { position: 'one_shot', retires: ['L-176'] } } as BrouillonEcran);
    await act(async () => { bouton(/^Envoyer/)!.click(); });
    await avancer(6000);
    const envoi = appels.find((a) => a.methode !== 'GET' && /\/gestion\/envois/.test(a.url));
    const corps = envoi!.corps as { cibles?: { cle?: string }[]; rattachement?: unknown };
    expect((corps.cibles ?? []).map((c) => c.cle)).toEqual(['421']);
    expect(corps.rattachement).toEqual({ position: 'one_shot', retires: ['L-176'] });
  });
  it('sans rien toucher, le rattachement part vide (position par défaut de la fenêtre, décidée après l’envoi)', async () => {
    await monter({ ...NEUF, cibles: [{ sorte: 'lot', cle: '26', id: 27, libelle: '7 avenue de l’Union — lot 26' }] } as BrouillonEcran);
    await act(async () => { bouton(/^Envoyer/)!.click(); });
    await avancer(6000);
    const envoi = appels.find((a) => a.methode !== 'GET' && /\/gestion\/envois/.test(a.url));
    expect((envoi!.corps as { rattachement?: unknown }).rattachement).toEqual({ position: null, retires: [] });
  });
});
