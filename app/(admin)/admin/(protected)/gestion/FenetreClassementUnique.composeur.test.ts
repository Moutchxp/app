// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { RattachementsDuFil } from './RattachementsDuFil';
import { TITRE_BIENS_DU_MAIL, TITRE_BIENS_SUIVIS } from '../../../../lib/gestion/ficheRattachement';

/**
 * ══ 🔴🔴 LOT FENETRE-CLASSEMENT-UNIQUE (Arno, 13/10/2026) — LE COMPOSEUR OUVRE LA FENÊTRE DE « MODIFIER LE RATTACHEMENT » ══
 * Décisions d'Arno : fenêtre partagée `RattachementsDuFil` en mode brouillon, glissière masquée (envoi « one shot »),
 * ni « Événement rattaché » ni « Autres classements », bloc « Biens suivis dans cette conversation » pour une réponse
 * seulement ; propositions « D'après le destinataire » gardées ; choix gardés avec le brouillon, appliqués à l'envoi.
 * Le VRAI composeur et la VRAIE fenêtre, routes simulées : rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5, classementDisponible: true, interneDisponible: true,
};
const NEUF: BrouillonEcran = {
  id: null, voie: 'nouveau', a: ['gabrielle@exemple.test'], cc: [], cci: [], objet: 'Quittance de septembre',
  corps: 'Bonjour,\n\nService Gestion', citation: null, destinatairesApproximatifs: false,
  filId: null, repondALeMessageId: null,
};
const MAIL = 9123;
const REPONSE: BrouillonEcran = { ...NEUF, voie: 'repondre', objet: 'Re: Fuite', filId: 77, repondALeMessageId: MAIL };
const FICHE = {
  filId: 77, objet: 'Fuite', nbMailsDuFil: 3, horsGestion: false, messageRecentId: MAIL,
  enTete: { messageId: MAIL, de: 'c.jullien@exemple.test', deNom: 'JULLIEN', recuLe: '2025-11-21T10:00:00Z', objet: 'Fuite' },
  disponible: true,
  biens: [{
    cle: 'L-176', lotId: 176, adresseComplete: '15 rue Carle Hebert, 92400 COURBEVOIE', numeroLot: '176',
    nature: 'Appartement', typeBien: 'Studio', surfaceM2: 28, statut: 'classe', dateMail: '2025-11-21', nbMails: 1,
    dossierDriveId: null, lienIds: [100], personnes: [],
  }],
};
const LIENS = [{
  id: 100, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: 'L-176', id: null }, libelle: 'lot 176',
  origine: 'manuel', statut: 'confirme', confiance: null, regle: null, motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null,
}];

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
        biens: [{ cle: '421', libelle: '28 av. Marceau — lot 421', motif: 'locataire de ce bien', recommande: true, parties: [] }] } });
    }
    if (url.includes('rattachements?fiche=')) return rep({ etat: 'ok', data: FICHE });
    if (url.includes('rattachements?fil=')) return rep({ etat: 'ok', data: LIENS });
    if (/\/gestion\/envois/.test(url)) return rep({ etat: 'ok', ok: true, envoi: { id: 1 } });
    return rep({ ok: true, brouillon: { id: 4242 } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }); };
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await calmer(); };
let courant: BrouillonEcran;
const monter = async (depart: BrouillonEcran) => {
  courant = depart;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: CONTEXTE,
    onChange: (b: BrouillonEcran) => { courant = b; rendre(); }, onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};
const caseDe = (mot: RegExp) => [...container.querySelectorAll('.ccl-case')].find((c) => mot.test(c.textContent ?? '')) as HTMLElement;
const ouvrir = async () => { await avancer(1500); await act(async () => { (caseDe(/Rattacher/) as HTMLButtonElement).click(); }); await calmer(); };
const fenetre = () => container.querySelector('.rdf--brouillon') as HTMLElement | null;
const bouton = (motif: RegExp) => [...container.querySelectorAll('button')].find((b) => motif.test((b.textContent ?? '').trim()));

describe('🔴 la même fenêtre que « Modifier le rattachement »', () => {
  it('« Rattacher » ouvre RattachementsDuFil en mode brouillon : même cadre, même titre', async () => {
    await monter(NEUF);
    await ouvrir();
    expect(fenetre()?.getAttribute('data-mode')).toBe('brouillon');
    expect(fenetre()?.classList.contains('mrt')).toBe(true);
    expect(fenetre()?.classList.contains('rdf')).toBe(true);
    expect(fenetre()?.querySelector('.mrt-titre')?.textContent).toBe(TITRE_BIENS_DU_MAIL);
    // L'ancienne petite fenêtre (son voile et son titre) n'est plus montée.
    expect(container.querySelector('.rec-voile')).toBeNull();
    expect(container.textContent).not.toContain('Rattacher ce mail à…');
  });

  it('la fenêtre de « Modifier le rattachement » d’un mail reçu est inchangée (même composant, même titre)', async () => {
    await act(async () => {
      root.render(createElement(RattachementsDuFil, { filId: 77, titre: 'Fuite', messageId: MAIL, ponctuel: true, onFerme: () => {} } as never));
    });
    await calmer();
    const f = container.querySelector('.mrt.rdf') as HTMLElement;
    expect(f.getAttribute('data-mode')).toBeNull();
    expect(f.querySelector('.mrt-titre')?.textContent).toBe(TITRE_BIENS_DU_MAIL);
    expect(f.textContent).toContain('Portée du suivi');
  });

  it('🔴 propositions « D’après le destinataire » conservées ; glissière, événement, autres classements absents', async () => {
    await monter(NEUF);
    await ouvrir();
    const f = fenetre()!;
    expect(f.textContent).toContain('D’après le destinataire : gabrielle@exemple.test');
    // La proposition du moteur est là, pré-cochée (recommandée), comme dans la petite fenêtre d'avant.
    expect(f.querySelectorAll('input[type="checkbox"]:checked').length).toBeGreaterThan(0);
    expect(bouton(/^Valider — 1 bien/)).toBeDefined();
    expect(f.textContent).not.toContain('Portée du suivi');
    expect(f.textContent).not.toContain('Événement rattaché');
    expect(f.textContent).not.toContain('Autres classements');
    // Nouveau message : pas de conversation, donc pas de bloc des biens suivis.
    expect(f.querySelector('[data-bloc="suivis"]')).toBeNull();
  });

  it('🔴 une RÉPONSE montre les biens suivis dans la conversation (en lecture)', async () => {
    await monter(REPONSE);
    await ouvrir();
    const bloc = fenetre()!.querySelector('[data-bloc="suivis"]') as HTMLElement;
    expect(bloc.querySelector('.rdf-suivis-titre')?.textContent).toBe(TITRE_BIENS_SUIVIS);
    expect(bloc.textContent).toContain('15 rue Carle Hebert');
    expect(bloc.querySelector('input[type="checkbox"]')).toBeNull();
  });
});

describe('🔴 les choix vont dans le brouillon, et partent à l’envoi', () => {
  it('« Valider » : rien n’est écrit sur le serveur, le brouillon porte le bien ; l’envoi l’emporte', async () => {
    await monter(NEUF);
    await ouvrir();
    await act(async () => { bouton(/^Valider — 1 bien/)!.click(); });
    await calmer();
    expect(fenetre()).toBeNull();
    expect((courant.cibles ?? []).map((c) => (c as { cle?: string }).cle)).toEqual(['421']);
    expect(appels.filter((a) => a.methode !== 'GET' && /\/gestion\/(suivi|rattachements)/.test(a.url))).toEqual([]);
    await act(async () => { bouton(/^Envoyer/)!.click(); });
    await avancer(6000);
    const envoi = appels.find((a) => a.methode !== 'GET' && /\/gestion\/envois/.test(a.url));
    expect(envoi).toBeDefined();
    expect(((envoi!.corps as { cibles?: { cle?: string }[] }).cibles ?? []).map((c) => c.cle)).toEqual(['421']);
  });

  it('la croix ferme sans rien changer', async () => {
    await monter(NEUF);
    await ouvrir();
    await act(async () => { (fenetre()!.querySelector('.rdf-croix') as HTMLButtonElement).click(); });
    await calmer();
    expect(fenetre()).toBeNull();
    expect(courant.cibles ?? []).toEqual([]);
  });
});
