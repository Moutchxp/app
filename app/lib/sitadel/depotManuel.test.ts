import { describe, it, expect, vi } from 'vitest';

// depotManuel importe `query` (db/client) pour ses deps RÉELLES uniquement ; on le neutralise (les tests passent des deps injectées).
vi.mock('../db/client', () => ({ query: vi.fn() }));

import {
  objetEstPermis, estCandidatDepot, traiterDepotManuel, empreinteDe, parserAdressesConnues, nomsDepuisCorps,
  type DepsDepotManuel, type CandidatDossier, type CaracteristiquesPermis, type IssueDepot,
} from './depotManuel';
import type { MessageBoite, PieceMeta } from '../veille/releveReponses';
import type { ResultatDrive } from '../permis/drive';

// ── Fabriques ─────────────────────────────────────────────────────────────────
const piece = (nom: string, contenu: string, typeMime: string | null = 'application/pdf'): PieceMeta =>
  ({ nomFichier: nom, typeMime, tailleOctets: contenu.length, contenu: Buffer.from(contenu) });
const mail = (over: Partial<MessageBoite['message']> = {}, pieces: PieceMeta[] = [piece('a.pdf', 'x')]): MessageBoite => ({
  uid: 1, message: { messageId: '<m1@x>', deAdresse: 'a.jorel@sansvisavis.com', objet: 'permis', ...over },
  recuLe: new Date('2026-08-14T09:00:00Z'), deNom: null, pieces, partiesRapport: undefined,
});
const CARAC: CaracteristiquesPermis = {
  reference: 'SVAV-DEM-2026-000042', numDau: '0930012500081', type: 'PC', adresse: '12 rue des Fleurs',
  communeNom: 'Aubervilliers', codeInsee: '93001', natureTravaux: 'Construction neuve', dateAutorisation: '2026-05-01', surface: '2000', logements: 20,
};

function harness(opts: {
  candidats?: CandidatDossier[]; textes?: Record<string, string | null>; dejaTraite?: boolean; empreintes?: Set<string>;
  deposeMotif?: string; // si défini → deposer échoue avec ce motif
  ficheEchec?: string;  // N1-B : si défini → la génération de fiche échoue avec ce motif (les pièces doivent quand même être versées)
  driveResultat?: ResultatDrive; // N6-B : réponse injectée de recupererPiecesDrive (défaut : configuré, vide)
} = {}) {
  const journal: { messageId: string; issue: IssueDepot; dossierId: number | null }[] = [];
  const alertes: { sujet: string; corps: string; pieceJointe?: { nomFichier: string; contenu: Buffer } }[] = [];
  const forwards: { sujet: string; corps: string }[] = [];
  const marques: { demandeId: number; dossierId: number }[] = [];
  const deposes: { dossierId: number; nom: string }[] = [];
  const fiches: number[] = []; // N1-B : dossierIds pour lesquels une (re)génération de fiche a été demandée
  const drivesDemandes: string[][] = []; // N6-B : ids passés à recupererPiecesDrive
  const deps: DepsDepotManuel = {
    dejaTraite: async () => opts.dejaTraite === true,
    journaliser: async (e) => { journal.push({ messageId: e.messageId, issue: e.issue, dossierId: e.dossierId }); },
    extraireTextePdf: async (contenu) => (opts.textes ? (opts.textes[contenu.toString()] ?? null) : contenu.toString()),
    chargerCandidats: async () => opts.candidats ?? [],
    empreintesEnGed: async () => opts.empreintes ?? new Set<string>(),
    marquerSatisfait: async (demandeId, dossierId) => { marques.push({ demandeId, dossierId }); },
    deposer: async (dossierId, p) => { if (opts.deposeMotif) return { ok: false, motif: opts.deposeMotif }; deposes.push({ dossierId, nom: p.nomFichier }); return { ok: true }; },
    caracteristiques: async () => CARAC,
    genererEtDeposerFiche: async (dossierId) => {
      fiches.push(dossierId);
      if (opts.ficheEchec) return { ok: false, motif: opts.ficheEchec };
      return { ok: true, nomFichier: 'Fiche de synthèse du permis.pdf', contenu: Buffer.from('%PDF-fake') };
    },
    recupererPiecesDrive: async (ids) => {
      drivesDemandes.push(ids);
      return opts.driveResultat ?? { configure: true, pieces: [], echecs: [], plafondFichiers: false, plafondVolume: false };
    },
    envoyerAlerte: async (sujet, corps, pieceJointe) => { alertes.push({ sujet, corps, pieceJointe }); },
    forwarder: async (_mb, sujet, corps) => { forwards.push({ sujet, corps }); },
  };
  return { deps, journal, alertes, forwards, marques, deposes, fiches, drivesDemandes };
}

describe('F-N1 — parserAdressesConnues : séparateurs tolérés, casse ignorée, vides ignorés', () => {
  it('point-virgule accepté (jamais zéro adresse en silence)', () => {
    expect(parserAdressesConnues('a@x.com;b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('virgule + espace acceptés', () => {
    expect(parserAdressesConnues('a@x.com, b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('espaces et retours à la ligne acceptés, entrées vides ignorées', () => {
    expect(parserAdressesConnues('a@x.com\n\nb@y.com ;; , c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });
  it('casse normalisée (comparaison insensible)', () => {
    expect(parserAdressesConnues('A@X.COM')).toEqual(['a@x.com']);
  });
  it('chaîne vide → aucune adresse', () => {
    expect(parserAdressesConnues('')).toEqual([]);
    expect(parserAdressesConnues('   ')).toEqual([]);
  });
});

describe('N1-A / N6-B(a) — reconnaissance de l’objet (premier mot « permis », zéro-largeur tolérés)', () => {
  it('objetEstPermis : accepté si le PREMIER mot est « permis » ; casse/accents/Re:/Fwd: tolérés', () => {
    for (const o of ['permis', 'Permis', '  PERMIS ', 'Re: permis', 'Fwd: Permis', 'TR : permís']) expect(objetEstPermis(o)).toBe(true);
    // N6-B(a) — Gmail colle les noms de fichiers après « permis », séparés par des espaces zéro-largeur : ACCEPTÉ
    expect(objetEstPermis('permis PC14_2D.pdf PC16.1_2D.pdf')).toBe(true);
    expect(objetEstPermis('permis\u200B PC14_2D.pdf\u200B\u200B PC16.1_2D.pdf\u200B')).toBe(true); // ZWSP (U+200B) comme Gmail
    expect(objetEstPermis('permis\uFEFFPC14.pdf')).toBe(true); // zéro-largeur (U+FEFF) COLLÉ au mot → frontière préservée
    // Restent REFUSÉS : le premier mot n'est pas « permis »
    for (const o of ['les permis', 'demande de permis', '', null, undefined]) expect(objetEstPermis(o as string)).toBe(false);
  });
  it('estCandidatDepot (N6-B) : DEUX conditions — objet « permis » ET expéditeur en liste blanche ; la présence de pièces n’entre PLUS en compte', () => {
    const adr = new Set(['a.jorel@sansvisavis.com']);
    expect(estCandidatDepot({ objet: 'permis', deAdresse: 'A.Jorel@Sansvisavis.com' }, adr)).toBe(true);  // casse ignorée
    expect(estCandidatDepot({ objet: 'permis PC14.pdf', deAdresse: 'a.jorel@sansvisavis.com' }, adr)).toBe(true); // objet Drive (sans pièce jointe)
    expect(estCandidatDepot({ objet: 'autre', deAdresse: 'a.jorel@sansvisavis.com' }, adr)).toBe(false);   // objet
    expect(estCandidatDepot({ objet: 'permis', deAdresse: 'inconnu@x.fr' }, adr)).toBe(false);             // expéditeur
  });
});

describe('N1-A — les quatre issues (§4)', () => {
  const CAND: CandidatDossier = { dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false };

  it('(a) UN candidat → verse TOUTES les pièces (même celles sans référence), bascule en Archives, alerte succès', async () => {
    const h = harness({
      candidats: [CAND],
      textes: { 'contient 0930012500081 ici': 'contient 0930012500081 ici', 'aucune ref': 'aucune ref' },
    });
    const mb = mail({}, [piece('arrete.pdf', 'contient 0930012500081 ici'), piece('plan.pdf', 'aucune ref')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.marques).toEqual([{ demandeId: 10, dossierId: 1 }]);            // satisfait AVANT dépôt (garde saine)
    expect(h.deposes.map((d) => d.nom)).toEqual(['arrete.pdf', 'plan.pdf']); // TOUTES les pièces, pas seulement celle qui cite
    expect(h.alertes).toHaveLength(1);
    expect(h.alertes[0].corps).toContain('N°0930012500081');
    expect(h.alertes[0].corps).toContain('SVAV-DEM-2026-000042');
    expect(h.alertes[0].corps).toContain('12 rue des Fleurs');
    expect(h.journal[0]).toMatchObject({ issue: 'verse', dossierId: 1 });
    expect(h.forwards).toHaveLength(0);
  });

  it('N1-B — fiche de synthèse (re)générée sur un versement, JOINTE à l’alerte, mentionnée dans le corps', async () => {
    const h = harness({ candidats: [CAND], textes: { 'ref 0930012500081': 'ref 0930012500081' } });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.fiches).toEqual([1]);                                   // fiche demandée pour le dossier versé
    expect(h.alertes[0].pieceJointe?.nomFichier).toBe('Fiche de synthèse du permis.pdf'); // jointe à l'e-mail
    expect(h.alertes[0].pieceJointe?.contenu.subarray(0, 5).toString()).toBe('%PDF-');
    expect(h.alertes[0].corps).toContain('Fiche de synthèse : générée, déposée en GED et jointe');
  });

  it('N1-B — fiche EN ÉCHEC → les pièces sont QUAND MÊME versées, l’alerte le dit, sans pièce jointe (jamais un document perdu)', async () => {
    const h = harness({ candidats: [CAND], textes: { 'ref 0930012500081': 'ref 0930012500081' }, ficheEchec: 'stockage non configuré' });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');                                 // le versement RÉUSSIT malgré l'échec de fiche
    expect(h.deposes).toHaveLength(1);                               // la pièce a bien été versée
    expect(h.journal[0]).toMatchObject({ issue: 'verse', dossierId: 1 });
    expect(h.alertes).toHaveLength(1);                               // alerte envoyée (jamais un silence)
    expect(h.alertes[0].pieceJointe).toBeUndefined();               // pas de fiche jointe (échec)
    expect(h.alertes[0].corps).toContain('Fiche de synthèse NON générée (stockage non configuré)');
  });

  it('(a2) dossier DÉJÀ satisfait (Archives) → n’appelle pas marquerSatisfait, ajoute simplement les pièces', async () => {
    const h = harness({ candidats: [{ ...CAND, dejaSatisfait: true }], textes: { 'ref 0930012500081': 'ref 0930012500081' } });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.marques).toEqual([]); // déjà satisfait → pas de re-marquage
    expect(h.deposes).toHaveLength(1);
  });

  it('(b) PLUSIEURS candidats → NE VERSE RIEN, alerte listant les permis en concurrence', async () => {
    const h = harness({
      candidats: [{ dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false }, { dossierId: 2, demandeId: 11, numDau: '0930012500082', dejaSatisfait: true }],
      textes: { 'les deux 0930012500081 et 0930012500082': 'les deux 0930012500081 et 0930012500082' },
    });
    const res = await traiterDepotManuel(mail({}, [piece('deux.pdf', 'les deux 0930012500081 et 0930012500082')]), 'entreprise', h.deps);
    expect(res.issue).toBe('ambigu');
    expect(h.deposes).toHaveLength(0);
    expect(h.marques).toHaveLength(0);
    expect(h.alertes[0].corps).toContain('Candidat 1');
    expect(h.alertes[0].corps).toContain('Candidat 2');
    expect(h.journal[0]).toMatchObject({ issue: 'ambigu', dossierId: null });
  });

  it('(c) AUCUN candidat (texte lu, aucun n° connu) → NE VERSE RIEN, FORWARD du mail + alerte', async () => {
    const h = harness({ candidats: [CAND], textes: { 'rien de reconnaissable': 'rien de reconnaissable' } });
    const res = await traiterDepotManuel(mail({}, [piece('z.pdf', 'rien de reconnaissable')]), 'entreprise', h.deps);
    expect(res.issue).toBe('aucun_candidat');
    expect(h.deposes).toHaveLength(0);
    expect(h.forwards).toHaveLength(1);
    expect(h.forwards[0].corps).toContain('AUCUN numéro de permis');
    expect(h.alertes).toHaveLength(0); // le forward EST l'alerte (contient le mail complet)
    expect(h.journal[0]).toMatchObject({ issue: 'aucun_candidat' });
  });

  it('(d) extraction ÉCHOUÉE → traité comme (c) mais avec le MOTIF exact ; jamais de silence', async () => {
    const h = harness({ candidats: [CAND], textes: { 'scan': null } }); // extraction renvoie null → PDF sans texte
    const res = await traiterDepotManuel(mail({}, [piece('scan.pdf', 'scan')]), 'entreprise', h.deps);
    expect(res.issue).toBe('extraction_echec');
    expect(h.forwards[0].corps).toContain('PDF sans couche texte lisible');
    expect(h.forwards[0].corps).toContain('scan.pdf');
    expect(h.deposes).toHaveLength(0);
  });

  it('idempotence : message déjà traité → deja_traite, RIEN refait (ni versement, ni alerte, ni forward, ni journal)', async () => {
    const h = harness({ candidats: [CAND], dejaTraite: true, textes: { 'ref 0930012500081': 'ref 0930012500081' } });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('deja_traite');
    expect([h.deposes.length, h.alertes.length, h.forwards.length, h.journal.length, h.marques.length]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('N1-A — dédoublonnage partiel (§6) : ne verse que les pièces absentes', () => {
  it('5 pièces dont 3 déjà en GED (par empreinte) → 2 versées, 3 ignorées ; le mail n’est jamais rejeté en entier', async () => {
    const contenus = ['p1', 'p2', 'p3', 'p4-ref 0930012500081', 'p5'];
    const pieces = contenus.map((c, i) => piece(`p${i + 1}.pdf`, c));
    const dejaEnGed = new Set([empreinteDe(pieces[0].contenu), empreinteDe(pieces[1].contenu), empreinteDe(pieces[2].contenu)]);
    const textes: Record<string, string> = Object.fromEntries(contenus.map((c) => [c, c]));
    const h = harness({ candidats: [{ dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false }], empreintes: dejaEnGed, textes });
    const res = await traiterDepotManuel(mail({}, pieces), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(res.deposees).toEqual(['p4.pdf', 'p5.pdf']);          // seules les absentes
    expect(res.ignorees).toEqual(['p1.pdf', 'p2.pdf', 'p3.pdf']); // déjà présentes
    expect(h.deposes.map((d) => d.nom)).toEqual(['p4.pdf', 'p5.pdf']);
    expect(h.alertes[0].corps).toContain('déjà présentes');
  });

  it('échec de dépôt d’UNE pièce → consigné dans l’alerte (echecs), jamais avalé', async () => {
    const h = harness({ candidats: [{ dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: true }], textes: { 'ref 0930012500081': 'ref 0930012500081' }, deposeMotif: 'type non autorisé pour le dépôt' });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(res.echecs).toEqual(['x.pdf (type non autorisé pour le dépôt)']);
    expect(h.alertes[0].corps).toContain('NON versées');
  });
});

describe('N6-B — versement via liens Google Drive (0 pièce jointe) : MÊMES issues que les pièces jointes', () => {
  const CAND: CandidatDossier = { dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false };
  // Un mail « permis » de Gmail SANS pièce jointe, dont le corps porte 2 liens Drive.
  const mailDrive = (corps: string) => mail({ objet: 'permis fichier.pdf', corpsTexte: corps, corpsHtml: undefined }, []);
  const CORPS_2 = 'arrete.pdf https://drive.google.com/file/d/AAA/view?usp=drive_web\nplan.pdf https://drive.google.com/file/d/BBB/view?usp=drive_web';

  it('UN candidat via Drive → fichiers téléchargés fabriquent la liste, versement + Archives + fiche + alerte', async () => {
    const drivePieces = [
      { nomFichier: 'arrete.pdf', typeMime: 'application/pdf', contenu: Buffer.from('cite 0930012500081') },
      { nomFichier: 'plan.pdf', typeMime: 'application/pdf', contenu: Buffer.from('sans ref') },
    ];
    const h = harness({
      candidats: [CAND],
      textes: { 'cite 0930012500081': 'cite 0930012500081', 'sans ref': 'sans ref' },
      driveResultat: { configure: true, pieces: drivePieces, echecs: [], plafondFichiers: false, plafondVolume: false },
    });
    const res = await traiterDepotManuel(mailDrive(CORPS_2), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.drivesDemandes).toEqual([['AAA', 'BBB']]);              // les 2 FILE_ID extraits, dans l'ordre
    expect(h.marques).toEqual([{ demandeId: 10, dossierId: 1 }]);    // bascule en Archives (même chemin)
    expect(h.deposes.map((d) => d.nom)).toEqual(['arrete.pdf', 'plan.pdf']);
    expect(h.fiches).toEqual([1]);                                   // fiche de synthèse régénérée
    expect(h.alertes[0].pieceJointe?.nomFichier).toBe('Fiche de synthèse du permis.pdf');
  });

  it('échecs Drive partiels (trop gros, natif Google) → versement du reste + alerte les liste (jamais un silence)', async () => {
    const h = harness({
      candidats: [CAND],
      textes: { 'cite 0930012500081': 'cite 0930012500081' },
      driveResultat: {
        configure: true,
        pieces: [{ nomFichier: 'ok.pdf', typeMime: 'application/pdf', contenu: Buffer.from('cite 0930012500081') }],
        echecs: [{ ref: 'gros.pdf', motif: 'trop volumineux : 42.0 Mo (maximum 20.0 Mo)' }, { ref: 'sheet', motif: 'fichier natif Google (application/vnd.google-apps.spreadsheet) — non téléchargeable' }],
        plafondFichiers: true, plafondVolume: false,
      },
    });
    const res = await traiterDepotManuel(mailDrive(CORPS_2), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.deposes.map((d) => d.nom)).toEqual(['ok.pdf']);
    expect(h.alertes[0].corps).toContain('Fichiers Drive NON récupérés');
    expect(h.alertes[0].corps).toContain('trop volumineux');
    expect(h.alertes[0].corps).toContain('natif Google');
    expect(h.alertes[0].corps).toContain('Plafond du NOMBRE');
  });

  it('PLUSIEURS candidats via Drive → ne verse rien + alerte « à trancher »', async () => {
    const h = harness({
      candidats: [CAND, { dossierId: 2, demandeId: 11, numDau: '0930012500082', dejaSatisfait: true }],
      textes: { 'deux 0930012500081 et 0930012500082': 'deux 0930012500081 et 0930012500082' },
      driveResultat: { configure: true, pieces: [{ nomFichier: 'x.pdf', typeMime: 'application/pdf', contenu: Buffer.from('deux 0930012500081 et 0930012500082') }], echecs: [], plafondFichiers: false, plafondVolume: false },
    });
    const res = await traiterDepotManuel(mailDrive(CORPS_2), 'entreprise', h.deps);
    expect(res.issue).toBe('ambigu');
    expect(h.deposes).toHaveLength(0);
    expect(h.alertes[0].corps).toContain('PLUSIEURS permis');
  });

  it('AUCUN candidat via Drive → forward + alerte', async () => {
    const h = harness({
      candidats: [CAND],
      textes: { 'aucun numero connu': 'aucun numero connu' },
      driveResultat: { configure: true, pieces: [{ nomFichier: 'x.pdf', typeMime: 'application/pdf', contenu: Buffer.from('aucun numero connu') }], echecs: [], plafondFichiers: false, plafondVolume: false },
    });
    const res = await traiterDepotManuel(mailDrive(CORPS_2), 'entreprise', h.deps);
    expect(res.issue).toBe('aucun_candidat');
    expect(h.forwards).toHaveLength(1);
  });

  it('accès Drive NON configuré → alerte explicite + issue drive_non_configure (jamais un silence)', async () => {
    const h = harness({ driveResultat: { configure: false } });
    const res = await traiterDepotManuel(mailDrive(CORPS_2), 'entreprise', h.deps);
    expect(res.issue).toBe('drive_non_configure');
    expect(h.alertes[0].sujet).toContain('accès Drive non configuré');
    expect(h.deposes).toHaveLength(0);
    expect(h.journal[0]).toMatchObject({ issue: 'drive_non_configure' });
  });

  it('jeton Drive refusé/expiré → alerte explicite + issue drive_jeton', async () => {
    const h = harness({ driveResultat: { configure: true, jetonRefuse: true } });
    const res = await traiterDepotManuel(mailDrive(CORPS_2), 'entreprise', h.deps);
    expect(res.issue).toBe('drive_jeton');
    expect(h.alertes[0].sujet).toContain('jeton');
    expect(h.journal[0]).toMatchObject({ issue: 'drive_jeton' });
  });

  it('F-N2 — 0 pièce jointe ET 0 lien Drive exploitable → alerte, jamais un silence', async () => {
    const h = harness({});
    const res = await traiterDepotManuel(mail({ objet: 'permis', corpsTexte: 'bonjour, rien ici', corpsHtml: undefined }, []), 'entreprise', h.deps);
    expect(res.issue).toBe('aucun_contenu');
    expect(h.drivesDemandes).toHaveLength(0);       // pas de tentative Drive : aucun lien
    expect(h.alertes[0].sujet).toContain('sans pièce jointe ni lien');
    expect(h.journal[0]).toMatchObject({ issue: 'aucun_contenu' });
  });
});

describe('N6-B — nomsDepuisCorps (repli de nom : le nom PRÉCÈDE le lien)', () => {
  it('associe à chaque FILE_ID le nom de fichier qui le précède dans le corps', () => {
    const corps = 'PC1.pdf https://drive.google.com/file/d/AAA/view\nPC2.pdf https://drive.google.com/file/d/BBB/view';
    expect(nomsDepuisCorps(corps, null, ['AAA', 'BBB'])).toEqual({ AAA: 'PC1.pdf', BBB: 'PC2.pdf' });
  });
  it('id absent du corps → pas d’entrée (best-effort, jamais une erreur)', () => {
    expect(nomsDepuisCorps('rien', null, ['ZZZ'])).toEqual({});
  });
});


describe('N6-D — rapprochement élargi (objet + corps du mail) + alerte « aucun candidat » exploitable', () => {
  const CAND: CandidatDossier = { dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false };

  it('numéro présent SEULEMENT dans l’OBJET → reconnu et versé', async () => {
    const h = harness({ candidats: [CAND] });
    const mb = mail({ objet: 'permis 0930012500081 plan.pdf' }, [piece('plan.pdf', 'contenu sans numero')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.deposes.map((d) => d.nom)).toEqual(['plan.pdf']);
  });

  it('numéro présent SEULEMENT dans le corps text/plain du mail → reconnu et versé', async () => {
    const h = harness({ candidats: [CAND] });
    const mb = mail({ objet: 'permis', corpsTexte: 'Bonjour, référence du dossier 0930012500081, cordialement.' }, [piece('plan.pdf', 'sans numero')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
  });

  it('numéro présent SEULEMENT dans le corps HTML (texte, pas les balises) → reconnu', async () => {
    const h = harness({ candidats: [CAND] });
    const mb = mail({ objet: 'permis', corpsTexte: 'rien', corpsHtml: '<div><p>Dossier&nbsp;: 0930012500081</p></div>' }, [piece('plan.pdf', 'sans numero')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
  });

  it('DEUX numéros DISTINCTS (un dans un nom de fichier, un dans le corps) → RIEN versé + alerte à trancher (règle de sûreté)', async () => {
    const CAND2: CandidatDossier = { dossierId: 2, demandeId: 11, numDau: '0930012500082', dejaSatisfait: true };
    const h = harness({ candidats: [CAND, CAND2] });
    const mb = mail({ objet: 'permis', corpsTexte: 'référence 0930012500082' }, [piece('0930012500081.pdf', 'rien')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('ambigu');
    expect(h.deposes).toHaveLength(0);
    expect(h.alertes[0].corps).toContain('PLUSIEURS permis');
  });

  it('alerte « aucun candidat » : liste les noms examinés, rappelle l’objet, et dit 0 pièce versée POUR CE MESSAGE', async () => {
    const h = harness({ candidats: [CAND] });
    const mb = mail({ objet: 'permis dossier.pdf' }, [piece('dossier.pdf', 'aucun numero connu ici')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('aucun_candidat');
    const corps = h.forwards[0].corps;
    expect(corps).toContain('0 pièce n’a été versée en GED pour ce message.');
    expect(corps).toContain('Objet du mail examiné : « permis dossier.pdf »');
    expect(corps).toContain('dossier.pdf'); // nom de fichier examiné listé
  });

  it('REJOUE le 15/08 : PC1→PC10 / PC4_A1→A7, objet « permis » sans numéro, corps sans numéro → TOUJOURS « aucun candidat » (pas de faux positif)', async () => {
    const noms = ['PC1_2D_PDM__20251219164001.pdf', 'PC2_2D_PDM__20251219164116.pdf', 'PC4_A1_2D_PDM__20251015130349.pdf', 'PC10_2D_PDM___20251015130706.pdf'];
    const h = harness({ candidats: [CAND] }); // le permis 0930012500081 existe mais n'apparaît NULLE PART dans ce mail
    const mb = mail({ objet: 'permis PC14_2D_PDM.pdf PC16.1_2D_PDM.pdf', corpsTexte: 'Bonjour, voici les pièces du dossier.' }, noms.map((n) => piece(n, 'plan sans numero exploitable')));
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('aucun_candidat');
    expect(h.deposes).toHaveLength(0);
  });
});
