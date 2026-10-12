// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { LigneVie } from './VieDuBien';
import { RattachementsDuFil } from './RattachementsDuFil';
import type { EvenementDeLigne, LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOTS EVENEMENT-RATTACHE-COHERENT ET BLOC-EVENEMENT-RATTACHE-COMPLET — À L'ÉCRAN ════════════════════════════
 *
 * ① Pour chaque cas, la LIGNE (pastille, mention) et la FENÊTRE « Modifier le rattachement » (bloc « Événement
 *    rattaché ») sont montées sur les MÊMES listes, et disent la même chose.
 * ② La ligne repliée du bloc dit la vérité complète (3 cas d'Arno, accords) ; dépliée, la liste « Événements en
 *    cours sur ce bien » (étape = dernière étape de la frise) ; jamais deux fois la même capsule.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : `fetch` simulé, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MAIL = 9123;
const GES1: EvenementDeLigne = {
  id: 1, reference: 'GES-2026-000001', objet: 'Re: NOTE INFORMATION RESIDENCE DE L’ORNE', ouvert: true,
  categorie: null, urgence: null, ouvertLe: '2026-09-23T08:00:00Z', etape: null,
};
const GES2: EvenementDeLigne = {
  id: 2, reference: 'GES-2026-000002', objet: 'Fuite salle de bain', ouvert: true,
  categorie: 'travaux', urgence: 'urgent', ouvertLe: '2026-09-20T08:00:00Z',
  etape: { type: 'devis_recu', titre: null, survenuLe: '2026-10-02T09:00:00Z', heureConnue: false, jourConnu: true,
    source: 'manuelle', certitude: 'fiable' },
};
const CLOS: EvenementDeLigne = {
  id: 3, reference: 'GES-2026-000003', objet: 'Ancien dossier', ouvert: false,
  categorie: null, urgence: 'haute', ouvertLe: '2025-01-01T08:00:00Z', etape: null,
};

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
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => { f(0); return 0; });
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
          etat: premier.ouvert ? 'a_traiter' : 'traite', portee: 'mail',
          categorie: premier.categorie ?? null, urgence: premier.urgence ?? null,
        },
        lus: { rattaches: cas.rattaches, duBien: cas.duBien },
      });
    }
    return rep({ etat: 'ok' });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); }); };
const neuf = () => { act(() => { root.unmount(); }); root = createRoot(container); };

async function lireLaLigne(c: Cas): Promise<{ pastille: boolean; survol: string | null }> {
  await act(async () => {
    root.render(createElement(LigneVie, {
      l: { ...LIGNE, evenements: c.rattaches, evenementsDuBien: c.duBien },
      maintenant: new Date('2026-10-12T12:00:00Z'), ouvert: false, onBasculer: () => {}, onOuvrirFil: () => {},
    }));
  });
  await calmer();
  /* 🔴 LOT UNE-SEULE-PASTILLE-EVENEMENT-EN-COURS — sur la ligne, UNE présentation : la pastille « Événement en cours ». */
  const p = container.querySelector('.vdb-capsule--evt') as HTMLElement | null;
  return { pastille: p !== null, survol: p?.title ?? null };
}

async function monterFenetre(c: Cas): Promise<HTMLDetailsElement> {
  cas = c;
  await act(async () => {
    root.render(createElement(RattachementsDuFil, {
      filId: 77, titre: 'Facture', messageId: MAIL, ponctuel: true, onFerme: () => {}, onGeste: () => {},
    } as never));
  });
  await calmer();
  return container.querySelector('details.rdf-evt-bloc') as HTMLDetailsElement;
}
const resume = (d: HTMLDetailsElement) => d.querySelector('summary') as HTMLElement;
const deplier = async (d: HTMLDetailsElement) => {
  await act(async () => { d.open = true; d.dispatchEvent(new Event('toggle')); });
  await calmer();
};
/** Les capsules d'événement VISIBLES : celles du résumé, et — bloc déplié seulement — celles du contenu. */
const capsulesVisibles = (d: HTMLDetailsElement): string[] => [...d.querySelectorAll('.cev')]
  .filter((c) => d.open || resume(d).contains(c))
  .map((c) => c.querySelector('.cev-ref')?.textContent ?? '');

describe('🔴🔴 ① la pastille de la ligne et la fenêtre disent la même chose', () => {
  it.each(CAS)('$nom', async (c) => {
    const ligne = await lireLaLigne(c);
    neuf();
    const d = await monterFenetre(c);
    const r = resume(d);
    const capsuleEnCours = [...r.querySelectorAll('.cev')].some((x) => !x.className.includes('cev--clos'));
    const rattacheEnCours = c.rattaches.some((e) => e.ouvert);
    /* 🔴 LOT UNE-SEULE-PASTILLE-EVENEMENT-EN-COURS — la LIGNE réunit les deux cas : pastille ⇔ capsule en cours dans
       la fenêtre (rattachée, ou en cours sur le bien). La FENÊTRE, elle, distingue toujours. */
    expect(ligne.pastille).toBe(capsuleEnCours);
    /* a) rattaché : la fenêtre nomme l'événement, sans « Rattacher » ; la bulle ne dit pas « non rattaché ». */
    if (rattacheEnCours) {
      expect(r.querySelector('.rdf-evt-rattacher')).toBeNull();
      expect(ligne.survol).not.toContain('mail non rattaché');
    }
    /* b) non rattaché, en cours sur le bien : même pastille ; la fenêtre dit « aucun — 1 événement en cours sur ce
       bien : » et offre « Rattacher » ; la bulle ajoute « — mail non rattaché ». */
    if (!rattacheEnCours && ligne.pastille) {
      expect(r.querySelector('.rdf-evt-aucun')?.textContent).toBe('aucun — 1 événement en cours sur ce bien :');
      /* LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — plus de « Rattacher » ici : il est dans « Événement de ce mail ». */
      expect(r.querySelector('button')).toBeNull();
      expect(ligne.survol).toContain('— mail non rattaché');
    }
    if (c.nom === 'aucun') {
      expect(ligne.pastille).toBe(false);
      expect(r.querySelector('.rdf-evt-aucun')?.textContent).toBe('aucun');
    }
    expect(ecritures).toEqual([]);
  });
});

describe('🔴🔴 ② PARTIE 1 — la ligne repliée dit toujours la vérité complète', () => {
  it('1) rattaché : une capsule par rattaché, et « + 1 autre en cours » / « + 2 autres en cours »', async () => {
    let d = await monterFenetre({ nom: '', rattaches: [GES1], duBien: [GES1, GES2] });
    expect(capsulesVisibles(d)).toEqual(['GES-2026-000001']);
    expect(resume(d).querySelector('.rdf-evt-autres')?.textContent).toBe('+ 1 autre en cours');
    neuf();
    const GES4 = { ...GES2, id: 4, reference: 'GES-2026-000004' };
    d = await monterFenetre({ nom: '', rattaches: [GES1], duBien: [GES2, GES4] });
    expect(resume(d).querySelector('.rdf-evt-autres')?.textContent).toBe('+ 2 autres en cours');
  });
  it('2) non rattaché : « aucun — N événement(s) en cours sur ce bien : » et les capsules, sans bouton', async () => {
    let d = await monterFenetre({ nom: '', rattaches: [], duBien: [GES1] });
    expect(resume(d).querySelector('.rdf-evt-aucun')?.textContent).toBe('aucun — 1 événement en cours sur ce bien :');
    neuf();
    d = await monterFenetre({ nom: '', rattaches: [], duBien: [GES1, GES2] });
    expect(resume(d).querySelector('.rdf-evt-aucun')?.textContent).toBe('aucun — 2 événements en cours sur ce bien :');
    /* Tri : urgence décroissante — l'urgent d'abord. */
    expect(capsulesVisibles(d)).toEqual(['GES-2026-000002', 'GES-2026-000001']);
    /* LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — la ligne repliée ne fait plus que DIRE : aucun bouton. */
    expect(resume(d).querySelector('button')).toBeNull();
    expect(ecritures).toEqual([]);
  });
  it('3) ni rattaché ni en cours : « aucun », gris, sans capsule', async () => {
    const d = await monterFenetre(CAS[2]);
    const r = resume(d);
    expect(r.querySelector('.rdf-evt-titre')?.textContent).toBe('Événement rattaché :');
    expect(r.querySelector('.rdf-evt-aucun')?.textContent).toBe('aucun');
    expect(r.querySelector('.cev')).toBeNull();
    expect(r.lastElementChild?.className).toBe('rdf-evt-chevron');
  });
});

describe('🔴🔴 PARTIE 2 — la capsule : type · numéro — titre, trame = urgence', () => {
  it('la trame suit l’urgence (échelle de l’application), non précisée = ambre, clos = gris', async () => {
    const trames: Record<string, string> = {};
    for (const [u, ouvert] of [['normale', true], ['haute', true], ['urgent', true], [null, true], ['urgent', false]] as const) {
      neuf();
      const e = { ...GES1, urgence: u, ouvert };
      const d = await monterFenetre({ nom: '', rattaches: [e], duBien: [] });
      trames[`${u}-${ouvert}`] = (resume(d).querySelector('.cev') as HTMLElement).className;
    }
    expect(trames['normale-true']).toContain('cev--vert');
    expect(trames['haute-true']).toContain('cev--orange');
    expect(trames['urgent-true']).toContain('cev--rouge');
    expect(trames['null-true']).toContain('cev--non-precisee');
    expect(trames['urgent-false']).toContain('cev--clos');
  });
  it('le type est écrit (« non précisée » si vide), la bulle dit « Urgence : … »', async () => {
    const d = await monterFenetre({ nom: '', rattaches: [], duBien: [GES2, GES1] });
    const [urgent, sans] = [...resume(d).querySelectorAll('.cev')] as HTMLElement[];
    expect(urgent.querySelector('.cev-type')?.textContent).toBe('Travaux');
    expect(urgent.title).toContain('Urgence : urgent');
    expect(urgent.title).toContain('GES-2026-000002 — Fuite salle de bain');
    expect(sans.querySelector('.cev-type')?.textContent).toBe('non précisée');
  });
  /**
   * 🔴🔴 LOT UNE-SEULE-PASTILLE-EVENEMENT-EN-COURS (Arno) — sur les LIGNES de mail, la MÊME pastille dans les deux cas
   * (ambre, « Événement en cours », sans type ni urgence) ; plus de mention en italique. Au survol : numéro et titre,
   * et « — mail non rattaché » quand le mail ne l'est pas. La capsule type + trame reste dans la fenêtre seule.
   */
  it('les lignes de mail : la même pastille, rattaché ou non — la bulle dit la différence', async () => {
    await lireLaLigne({ nom: '', rattaches: [GES2], duBien: [GES2] });
    const a = container.querySelector('.vdb-capsule--evt') as HTMLElement;
    const pastilleA = [a.className, a.textContent];
    expect(a.title).toBe('GES-2026-000002 — Fuite salle de bain');
    neuf();
    await lireLaLigne({ nom: '', rattaches: [], duBien: [GES2] });
    const b = container.querySelector('.vdb-capsule--evt') as HTMLElement;
    expect([b.className, b.textContent]).toEqual(pastilleA);
    expect(pastilleA).toEqual(['vdb-capsule vdb-capsule--evt', 'Événement en cours']);
    expect(b.title).toBe('GES-2026-000002 — Fuite salle de bain — mail non rattaché');
    expect(container.querySelector('.vdb-evt-bien')).toBeNull();
    expect(container.textContent).not.toContain('événement ouvert sur ce bien');
    expect(container.querySelector('.cev')).toBeNull();
    /* Rattaché à l'un, un autre en cours sur le bien : « 2 événements en cours », une ligne de bulle par événement. */
    neuf();
    await lireLaLigne({ nom: '', rattaches: [GES1], duBien: [GES1, GES2] });
    const c = container.querySelector('.vdb-capsule--evt') as HTMLElement;
    expect(c.textContent).toBe('2 événements en cours');
    expect(c.title).toBe('GES-2026-000001 — Re: NOTE INFORMATION RESIDENCE DE L’ORNE\nGES-2026-000002 — Fuite salle de bain — mail non rattaché');
    for (const f of ['VieDuBien.tsx', 'BoiteMail.tsx', 'Conversation.tsx']) {
      const src = readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');
      expect(src, f).not.toMatch(/<CapsuleEvenement\b|CSS_CAPSULE_EVENEMENT/);
      expect(src, f).not.toContain('vdb-evt-bien');
    }
  });
});

describe('🔴🔴 PARTIE 3 — déplié : « Événements en cours sur ce bien »', () => {
  it('une ligne par événement : ouvert le …, Étape = dernière étape de la frise, « Rattaché ✓ » ou « non rattaché »', async () => {
    const d = await monterFenetre({ nom: '', rattaches: [GES1], duBien: [GES1, GES2] });
    await deplier(d);
    const lignes = [...d.querySelectorAll('.rdf-evt-ligne')] as HTMLElement[];
    expect(lignes.map((l) => l.querySelector('.cev-ref')?.textContent)).toEqual(['GES-2026-000002', 'GES-2026-000001']);
    expect(lignes[0].querySelector('.rdf-evt-meta')?.textContent).toBe('ouvert le 20/09/2026Étape : Devis reçu (02/10/2026)');
    /* Frise vide : « Étape : Ouverture » et la date d'ouverture — comme la miniature de la carte. */
    expect(lignes[1].querySelector('.rdf-evt-meta')?.textContent).toBe('ouvert le 23/09/2026Étape : Ouverture (23/09/2026)');
    expect(lignes[1].querySelector('.rdf-evt-rattache')?.textContent).toBe('Rattaché ✓');
    /* LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — « non rattaché » en simple texte, aucune case. */
    expect(lignes[0].querySelector('.rdf-evt-non-rattache')?.textContent).toBe('non rattaché');
    expect(d.querySelector('input')).toBeNull();
    expect(ecritures).toEqual([]);
  });
  /**
   * 🔴🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE (accord d'Arno) — LE BLOC EST EN LECTURE SEULE dans « Modifier
   * le rattachement » : ni case, ni « Rattacher », ni « Lier à un événement », ni « Créer un événement », ni
   * formulaire. Tout a déménagé dans « Événement de ce mail » (épreuves de `FenetreEvenementMail`), et la phrase
   * d'Arno y renvoie.
   */
  it('bloc sans action : aucun bouton, aucune case, aucun champ — et la phrase de renvoi', async () => {
    const d = await monterFenetre({ nom: '', rattaches: [], duBien: [GES1] });
    await deplier(d);
    const contenu = [...d.children].filter((x) => x.tagName !== 'SUMMARY');
    expect(contenu.flatMap((x) => [...x.querySelectorAll('button, input, select, textarea')])).toEqual([]);
    expect(contenu.filter((x) => x.matches('button, input, select, textarea'))).toEqual([]);
    expect(d.querySelector('.rdf-evt-renvoi')?.textContent)
      .toBe('Pour créer un événement ou y lier ce mail, utilisez le bouton Événement du mail.');
  });
  it('l’étape vient de la MÊME fonction que la miniature de la carte, sur le même SQL', () => {
    const carte = readFileSync('app/(admin)/admin/(protected)/gestion/CarteVive.tsx', 'utf8');
    const fen = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(carte).toContain('const lue = etapeEnMots(etape, ouvertLe);');
    expect(fen).toContain('const etape = etapeEnMots(e.etape, e.ouvertLe);');
    expect(readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8')).toContain("${sqlDerniereEtape('et', false)}");
  });
});

describe('🔴🔴 PARTIE 4 — aucun doublon, rien ne déborde', () => {
  it.each(CAS)('$nom : chaque capsule visible une seule fois, replié comme déplié', async (c) => {
    const d = await monterFenetre(c);
    const replie = capsulesVisibles(d);
    expect(new Set(replie).size).toBe(replie.length);
    await deplier(d);
    const deplie = capsulesVisibles(d);
    expect(new Set(deplie).size).toBe(deplie.length);
    /* Déplié : la ligne de titre ne porte plus de capsule. */
    expect(resume(d).querySelector('.cev')).toBeNull();
  });
  it('le cadre de focus est tracé dedans, le chevron posé dans la marge droite', () => {
    const r = readFileSync('app/(admin)/admin/(protected)/gestion/RattachementsDuFil.tsx', 'utf8');
    expect(r).toContain('.rdf-evt-bloc>.rdf-evt-resume:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px;border-radius:.5rem}');
    expect(r).toContain('padding:4px 30px 4px 6px;margin:-4px -6px;');
    expect(r).toContain('.rdf-evt-chevron{position:absolute;right:11px;');
  });
});
