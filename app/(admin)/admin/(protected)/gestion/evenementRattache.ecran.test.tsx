// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { LigneVie } from './VieDuBien';
import { RattachementsDuFil } from './RattachementsDuFil';
import type { EvenementDeLigne, LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOT EVENEMENT-RATTACHE-COHERENT-ET-BLOC-DEPLIABLE — LA PASTILLE ET LA FENÊTRE DISENT LA MÊME CHOSE ══════════
 *
 * Pour chaque cas, la LIGNE (pastille « Événement en cours », mention « événement ouvert sur ce bien ») et la FENÊTRE
 * « Modifier le rattachement » (bloc « Événement rattaché ») sont montées sur les MÊMES listes — celles que la route
 * de l'historique donne à la ligne, et que la route `/affectation` donne à la fenêtre.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : `fetch` simulé, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIL = 9123;
const GES1: EvenementDeLigne = { id: 1, reference: 'GES-2026-000001', objet: 'Re: NOTE INFORMATION RESIDENCE DE L’ORNE', ouvert: true };
const CLOS: EvenementDeLigne = { id: 3, reference: 'GES-2026-000003', objet: 'Ancien dossier', ouvert: false };

type Cas = { nom: string; rattaches: EvenementDeLigne[]; duBien: EvenementDeLigne[] };
const CAS: Cas[] = [
  { nom: 'a) rattaché, en cours', rattaches: [GES1], duBien: [GES1] },
  { nom: 'b) non rattaché, ouvert sur le bien', rattaches: [], duBien: [GES1] },
  { nom: 'aucun', rattaches: [], duBien: [] },
  { nom: 'rattaché à un événement clos', rattaches: [CLOS], duBien: [] },
];

const LIGNE: LigneHistorique = {
  messageId: MAIL, filId: 77, messageIdRfc: null, recuLe: '2026-09-24T07:40:27.000Z', sens: 'recu',
  de: 'banc@exemple.test', deNom: 'Personne BANC', destinataires: [], a: [], cc: [], cci: [],
  repondreA: [], adressesTexte: [], objet: 'Re: Facture diagnostic', extrait: 'Bonjour', pieces: [],
  parCible: { sorte: 'lot', cle: 'L-1', id: null }, cibleLibelle: 'Lot 1', source: 'rattachement',
  evenements: [], statut: 'auto', statutDetail: null,
};
const FICHE = {
  filId: 77, objet: 'Facture', nbMailsDuFil: 2, horsGestion: false, messageRecentId: MAIL,
  enTete: { messageId: MAIL, de: 'banc@exemple.test', deNom: 'BANC', recuLe: '2026-09-24T07:40:27Z', objet: 'Facture' },
  disponible: true,
  biens: [{
    cle: 'L-1', lotId: 1, adresseComplete: '1 rue du Banc, 92400 COURBEVOIE', numeroLot: '1', nature: 'Appartement',
    typeBien: 'Studio', surfaceM2: 20, statut: 'classe', dateMail: '2026-09-24', nbMails: 1, dossierDriveId: null,
    lienIds: [100], personnes: [],
  }],
};
const LIENS = [{
  id: 100, messageId: MAIL, pieceId: null, cible: { sorte: 'lot', cle: 'L-1', id: null }, libelle: 'lot 1',
  origine: 'manuel', statut: 'confirme', confiance: null, regle: null, motif: null, adresses: [], parUnHumain: true,
  creeLe: null, creePar: null, statutLe: null, statutPar: null,
}];

let container: HTMLDivElement;
let root: Root;
let ecritures: string[];
let cas: Cas;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  ecritures = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const rep = (j: unknown) => ({ ok: true, json: async () => j }) as unknown as Response;
    if ((init?.method ?? 'GET') !== 'GET') { ecritures.push(u); return rep({ ok: true }); }
    if (u.includes('rattachements?fiche=')) return rep({ etat: 'ok', data: FICHE });
    if (u.includes('rattachements?fil=')) return rep({ etat: 'ok', data: LIENS });
    if (u.includes('/gestion/suivi')) return rep({ etat: 'ok', mails: [MAIL], periodes: [], exceptions: [] });
    if (u.includes('/gestion/classement')) {
      return rep({ etat: 'ok', contexte: { messageId: MAIL, filId: 77, dateMail: '2026-09-24', nbMailsDuFil: 2,
        proprietaire: null, examen: { issue: 'sans_candidat', motif: '' }, pieces: [], disponible: true, biens: [] } });
    }
    if (u.includes('/affectation')) {
      const premier = cas.rattaches[0];
      return rep({
        etat: 'ok', qualifie: true,
        evenement: premier === undefined ? null : {
          evenementId: premier.id, reference: premier.reference, objet: premier.objet,
          etat: premier.ouvert ? 'a_traiter' : 'traite', portee: 'mail', categorie: null, urgence: null,
        },
        lus: { rattaches: cas.rattaches, duBien: cas.duBien },
      });
    }
    return rep({ etat: 'ok' });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); }); };

/** Ce que dit la LIGNE. */
async function lireLaLigne(c: Cas): Promise<{ pastille: boolean; mention: boolean }> {
  await act(async () => {
    root.render(createElement(LigneVie, {
      /* La ligne reçoit les rattachés DATÉS DANS UNE PÉRIODE (le dépôt filtre) : un clos y figure, non « ouvert ». */
      l: { ...LIGNE, evenements: c.rattaches, evenementsDuBien: c.duBien },
      maintenant: new Date('2026-10-12T12:00:00Z'), ouvert: false, onBasculer: () => {}, onOuvrirFil: () => {},
    }));
  });
  await calmer();
  return {
    pastille: container.querySelector('.vdb-capsule--evt') !== null,
    mention: container.querySelector('.vdb-evt-bien') !== null,
  };
}

/** Ce que dit la FENÊTRE, bloc replié. */
async function lireLaFenetre(): Promise<{ enCours: boolean; aucun: boolean; propose: boolean; titre: string | null }> {
  await act(async () => {
    root.render(createElement(RattachementsDuFil, {
      filId: 77, titre: 'Facture', messageId: MAIL, ponctuel: true, onFerme: () => {}, onGeste: () => {},
    } as never));
  });
  await calmer();
  const resume = container.querySelector('details.rdf-evt-bloc > summary') as HTMLElement;
  const capsule = resume.querySelector('.rdf-capsule-evt');
  return {
    enCours: capsule !== null && !capsule.className.includes('--gris'),
    aucun: resume.querySelector('.rdf-evt-aucun')?.textContent === 'aucun',
    propose: container.querySelector('.rdf-evt-proposer') !== null,
    titre: capsule?.getAttribute('title') ?? null,
  };
}

describe('🔴🔴 pour chaque cas, la pastille de la ligne et la fenêtre disent la même chose', () => {
  it.each(CAS)('$nom', async (c) => {
    cas = c;
    const ligne = await lireLaLigne(c);
    act(() => { root.unmount(); });
    root = createRoot(container);
    const fenetre = await lireLaFenetre();
    /* a) : pastille pleine ⇔ capsule ambre dans « Événement rattaché ». */
    expect(fenetre.enCours).toBe(ligne.pastille);
    /* b) : mention discrète ⇔ proposition de rattacher, et la fenêtre dit « aucun ». */
    expect(fenetre.propose).toBe(ligne.mention);
    if (ligne.mention) expect(fenetre.aucun).toBe(true);
    if (c.nom === 'aucun') expect([ligne.pastille, ligne.mention, fenetre.aucun]).toEqual([false, false, true]);
    if (ligne.pastille) expect(fenetre.titre).toBe('GES-2026-000001 — Re: NOTE INFORMATION RESIDENCE DE L’ORNE');
    expect(ecritures).toEqual([]);
  });
});

describe('🔴🔴 PARTIE 3 — « Événement rattaché », un bloc replié par défaut', () => {
  const monter = async (c: Cas) => { cas = c; await lireLaFenetre(); };
  it('replié, sur une ligne : le titre, la capsule (numéro — titre, complet au survol), le chevron', async () => {
    await monter(CAS[0]);
    const d = container.querySelector('details.rdf-evt-bloc') as HTMLDetailsElement;
    expect(d.open).toBe(false);
    const enfants = [...(d.querySelector('summary') as HTMLElement).children].map((e) => e.className);
    expect(enfants).toEqual(['rdf-evt-titre', 'rdf-evt-etat', 'rdf-evt-chevron']);
    expect(d.querySelector('summary .rdf-capsule-evt-mot')?.textContent).toBe('GES-2026-000001 — Re: NOTE INFORMATION RESIDENCE DE L’ORNE');
  });
  it('déplié : tout le contenu d’avant est là, rien n’est retiré', async () => {
    await monter(CAS[2]);
    const d = container.querySelector('details.rdf-evt-bloc') as HTMLDetailsElement;
    const mots = [...d.querySelectorAll('button')].map((b) => b.textContent);
    expect(mots).toContain('Lier à un événement');
    expect(mots).toContain('Créer un événement');
  });
  it('b) « Rattacher ce mail à GES-… » NOTE le lien — rien n’est écrit tant qu’on ne valide pas', async () => {
    await monter(CAS[1]);
    const b = container.querySelector('.rdf-evt-proposer') as HTMLButtonElement;
    expect(b.textContent).toBe('Rattacher ce mail à GES-2026-000001 — Re: NOTE INFORMATION RESIDENCE DE L’ORNE');
    await act(async () => { b.click(); });
    await calmer();
    expect(container.querySelector('summary .rdf-evt-voulu')?.textContent)
      .toBe('à lier : GES-2026-000001 — Re: NOTE INFORMATION RESIDENCE DE L’ORNE');
    expect(ecritures).toEqual([]);
  });
  it('la capsule a les couleurs de la pastille « Événement en cours », et rien ne déborde du bloc', () => {
    const r = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(r).toContain('background:var(--color-svv-amber-soft);color:var(--color-svv-amber);');
    expect(r).toContain('.rdf-capsule-evt-objet{flex:0 100000 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre}');
    expect(r).toContain('.rdf-evt-proposer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}');
  });
});
