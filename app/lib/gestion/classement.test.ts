import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  auMoins, cleDossier, compterPlan, comptesClassementVides, libelleCible, normaliser, periodeDe, planDeLaPiece,
  resumeClassement, rubriqueProbable, PRODUCTION_INTERDITE, RUBRIQUES,
  type Certitude, type PieceAClasser,
} from './classement';
import { deplacerDansDossier, poserRaccourci, toucheLaProduction, SOUS_DOSSIERS_PRODUCTION } from './classementDrive';
import { indexer, type NoeudArbre } from './driveGardeFou';

/**
 * LOT CLASSEMENT-1 — RANGER CHAQUE PIÈCE, OU AVOUER QU'ON NE SAIT PAS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI EST PROTÉGÉ ICI, ET CHAQUE POINT A UNE CONSÉQUENCE CONNUE :
 *   ① une pièce ne part JAMAIS dans une rubrique sur une hypothèse — « En attente » est préférable, parce qu'un
 *      document rangé au mauvais endroit est introuvable là où on le cherchera, alors qu'« En attente » se voit ;
 *   ② l'ordre des règles : litige avant assurance avant travaux avant locataires. Une mise en demeure pour loyers
 *      impayés est un LITIGE, pas une quittance ;
 *   ③ plusieurs biens ⇒ un RACCOURCI, jamais une copie : deux fichiers pour un document, c'est deux vérités ;
 *   ④ 🔴🔴 AUCUNE destination ne peut être sous « Documents clients scannés », et le garde qui l'interdit ne dépend
 *      ni de la base, ni du réseau, ni de l'arbre mémorisé.
 *
 * 🔒 Aucune donnée réelle : clés inventées, adresses en `.invalid`. Aucun appel Drive — le transport est un espion.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const piece = (o: Partial<PieceAClasser> = {}): PieceAClasser => ({
  pieceId: 42, nomFichier: 'document.pdf', objet: null, extrait: null,
  recuLe: '2026-03-15T10:00:00Z', lotsConfirmes: [], proprietairesConfirmes: [], ...o,
});

describe('la normalisation, sans laquelle rien ne se compare', () => {
  it('minuscules, accents ôtés, ponctuation en espaces', () => {
    expect(normaliser('Déclaration de SINISTRE')).toBe('declaration de sinistre');
  });

  it('🔴 les DEUX apostrophes donnent le même texte — les deux existent dans la vraie boîte', () => {
    expect(normaliser("attestation d'assurance")).toBe(normaliser('attestation d’assurance'));
  });

  it('un texte absent ne casse rien', () => {
    expect(normaliser(null)).toBe('');
    expect(normaliser(undefined)).toBe('');
  });
});

describe('🔴 la rubrique, et l’ORDRE des règles', () => {
  it('le LITIGE passe avant le loyer : une mise en demeure n’est pas une quittance', () => {
    const r = rubriqueProbable(['Mise en demeure pour loyers impayés']);
    expect(r?.rubrique).toBe('4 Litige');
    expect(r?.certitude).toBe('certaine');
  });

  it('l’ASSURANCE passe avant les travaux : un sinistre va chez l’assureur', () => {
    expect(rubriqueProbable(['Déclaration de sinistre dégât des eaux'])?.rubrique).toBe('3 Assurances');
  });

  it('les TRAVAUX passent avant le loyer : un devis n’est pas une affaire de bail', () => {
    expect(rubriqueProbable(['Devis remplacement chaudière — loyer de mars'])?.rubrique).toBe('2 Travaux');
  });

  it('le bail et la quittance vont dans « 1 Locataires »', () => {
    expect(rubriqueProbable(['Signature du bail'])?.rubrique).toBe('1 Locataires');
    expect(rubriqueProbable(['Quittance septembre'])?.rubrique).toBe('1 Locataires');
    expect(rubriqueProbable(['État des lieux de sortie'])?.rubrique).toBe('1 Locataires');
  });

  it('🔴 « certaine » n’est accordé qu’à ce qui ne peut pas vouloir dire autre chose', () => {
    // « devis » ne devise que des travaux : certaine. « loyer » seul peut être une quittance, une relance, un litige.
    expect(rubriqueProbable(['Devis peinture'])?.certitude).toBe('certaine');
    expect(rubriqueProbable(['Point sur le loyer'])?.certitude).toBe('probable');
    expect(rubriqueProbable(['La machine à laver ne fonctionne plus'])?.certitude).toBe('probable');
  });

  it('un mot à l’intérieur d’un autre ne déclenche rien', () => {
    // « bail » ne doit pas être trouvé dans « travail » : les motifs sont cherchés entourés d'espaces.
    expect(rubriqueProbable(['Mon travail de cette semaine'])).toBeNull();
  });

  it('le NOM DU FICHIER compte autant que l’objet', () => {
    expect(rubriqueProbable([null, 'Attestation assurance MRH 2026.pdf'])?.rubrique).toBe('3 Assurances');
  });

  it('rien de reconnaissable ⇒ `null`, et surtout pas une rubrique au hasard', () => {
    expect(rubriqueProbable(['Bonjour, comment allez-vous ?'])).toBeNull();
    expect(rubriqueProbable([null, undefined, ''])).toBeNull();
  });
});

describe('🔴 le plan d’une pièce : l’ordre des questions', () => {
  it('logement confirmé + rubrique certaine ⇒ la rubrique du bien', () => {
    const p = planDeLaPiece(piece({ lotsConfirmes: ['315'], objet: 'Devis fenêtre' }));
    expect(p.cible).toEqual({ sorte: 'rubrique', bienCle: '315', rubrique: '2 Travaux' });
    expect(p.certitude).toBe('certaine');
    expect(p.regle).toContain('logement confirmé');
  });

  it('🔴 logement confirmé mais rubrique INCERTAINE ⇒ « En attente » du bien, jamais une rubrique devinée', () => {
    const p = planDeLaPiece(piece({ lotsConfirmes: ['315'], objet: 'Bonjour' }));
    expect(p.cible).toEqual({ sorte: 'en_attente_bien', bienCle: '315' });
    expect(p.certitude).toBe('incertaine');
  });

  it('🔴 une rubrique seulement PROBABLE ne suffit pas au seuil par défaut', () => {
    const p = planDeLaPiece(piece({ lotsConfirmes: ['315'], objet: 'Point sur le loyer' }));
    expect(p.cible.sorte).toBe('en_attente_bien');
    expect(p.regle).toContain('seulement probable');
    // …mais elle suffit si Arno abaisse le seuil, et c'est le SEUL effet de ce réglage.
    const souple = planDeLaPiece(piece({ lotsConfirmes: ['315'], objet: 'Point sur le loyer' }), 'probable');
    expect(souple.cible).toEqual({ sorte: 'rubrique', bienCle: '315', rubrique: '1 Locataires' });
  });

  it('propriétaire seul ⇒ « En attente » du propriétaire — les rubriques appartiennent à un BIEN', () => {
    // Même avec un texte limpide : il n'existe pas de « 2 Travaux » chez un propriétaire.
    const p = planDeLaPiece(piece({ proprietairesConfirmes: ['223'], objet: 'Devis chaudière' }));
    expect(p.cible).toEqual({ sorte: 'en_attente_proprietaire', proprietaireCle: '223' });
  });

  it('plusieurs propriétaires ⇒ le premier, et la règle le DIT', () => {
    const p = planDeLaPiece(piece({ proprietairesConfirmes: ['300', '223'] }));
    expect(p.cible).toEqual({ sorte: 'en_attente_proprietaire', proprietaireCle: '223' });
    expect(p.regle).toContain('2 propriétaires');
    expect(p.certitude).toBe('incertaine');
  });

  it('aucun rattachement ⇒ « 00 Non rattachés », par année ET par mois', () => {
    const p = planDeLaPiece(piece({ recuLe: '2025-07-04T08:00:00Z' }));
    expect(p.cible).toEqual({ sorte: 'non_rattachee', annee: '2025', mois: '07' });
    // 🔴 On est SÛR de ne pas savoir : la destination, elle, est certaine.
    expect(p.certitude).toBe('certaine');
  });

  it('🔴 PLUSIEURS BIENS : le fichier va dans le premier, les autres reçoivent un RACCOURCI', () => {
    const p = planDeLaPiece(piece({ lotsConfirmes: ['400', '315'], objet: 'Devis toiture' }));
    expect(p.cible).toEqual({ sorte: 'rubrique', bienCle: '315', rubrique: '2 Travaux' });
    expect(p.raccourcisVers).toEqual(['400']);
  });

  it('les clés vides et les doublons sont ignorés', () => {
    const p = planDeLaPiece(piece({ lotsConfirmes: ['315', '315', '  ', ''] }));
    expect(p.raccourcisVers).toEqual([]);
  });

  it('une date illisible ne se fond pas dans le mois courant', () => {
    expect(planDeLaPiece(piece({ recuLe: 'pas-une-date' })).cible)
      .toEqual({ sorte: 'non_rattachee', annee: 'inconnue', mois: '00' });
  });
});

describe('les clés de dossier — le seul pont vers le Drive', () => {
  it('chaque cible donne la clé exacte de `gestion_drive_arbre`', () => {
    expect(cleDossier({ sorte: 'rubrique', bienCle: '315', rubrique: '1 Locataires' }))
      .toEqual({ sorte: 'rubrique', cle: '315|1 Locataires' });
    expect(cleDossier({ sorte: 'en_attente_bien', bienCle: '315' })).toEqual({ sorte: 'en_attente', cle: 'bien|315' });
    expect(cleDossier({ sorte: 'en_attente_proprietaire', proprietaireCle: '223' }))
      .toEqual({ sorte: 'en_attente', cle: 'prop|223' });
    // La convention du Drive pour les périodes : `AAAA|MM`, comme « 00 Arrivée des mails ».
    expect(cleDossier({ sorte: 'non_rattachee', annee: '2025', mois: '07' }))
      .toEqual({ sorte: 'periode', cle: '2025|07' });
  });

  it('le libellé se lit sans connaître le code', () => {
    expect(libelleCible({ sorte: 'rubrique', bienCle: '315', rubrique: '4 Litige' })).toBe('bien 315 / 4 Litige');
    expect(libelleCible({ sorte: 'non_rattachee', annee: '2025', mois: '07' })).toBe('00 Non rattachés / 2025 / 07');
  });

  it('periodeDe rend un mois sur DEUX chiffres, comme les dossiers', () => {
    expect(periodeDe('2026-01-05T00:00:00Z')).toEqual({ annee: '2026', mois: '01' });
    expect(periodeDe('2026-12-31T23:00:00Z')).toEqual({ annee: '2026', mois: '12' });
  });
});

describe('les comptes et le résumé', () => {
  it('chaque plan est compté une fois, et par sorte', () => {
    const c = comptesClassementVides();
    compterPlan(c, planDeLaPiece(piece({ lotsConfirmes: ['315'], objet: 'Devis' })));
    compterPlan(c, planDeLaPiece(piece({ lotsConfirmes: ['315'] })));
    compterPlan(c, planDeLaPiece(piece({ proprietairesConfirmes: ['223'] })));
    compterPlan(c, planDeLaPiece(piece()));
    expect(c.vues).toBe(4);
    expect(c.parSorte).toEqual({ rubrique: 1, en_attente_bien: 1, en_attente_proprietaire: 1, non_rattachee: 1 });
    expect(c.parRubrique['2 Travaux']).toBe(1);
    const texte = resumeClassement(c).join('\n');
    expect(texte).toContain('2 Travaux');
    // Une rubrique à zéro n'est pas listée : une liste de zéros cache celle qui compte.
    expect(texte).not.toContain('4 Litige');
  });

  it('`auMoins` compare les certitudes dans le bon sens', () => {
    expect(auMoins('certaine', 'probable')).toBe(true);
    expect(auMoins('probable', 'certaine')).toBe(false);
    expect(auMoins('incertaine', 'incertaine')).toBe(true);
  });
});

// ════ 🔴🔴 LE GARDE DE LA PRODUCTION ════════════════════════════════════════════════════════════════════════════
const ARBRE: NoeudArbre[] = [
  { driveId: 'RACINE', parentDriveId: null, sorte: 'racine', nom: 'Base de données locative', chemin: '/' },
  { driveId: 'BIENS', parentDriveId: 'RACINE', sorte: 'biens', nom: '2 Biens immobiliers', chemin: '/2 Biens immobiliers' },
  { driveId: 'BIEN315', parentDriveId: 'BIENS', sorte: 'bien', nom: 'lot 315', chemin: '/2 Biens immobiliers/lot 315' },
  { driveId: 'RUB315T', parentDriveId: 'BIEN315', sorte: 'rubrique', nom: '2 Travaux', chemin: '/2 Biens immobiliers/lot 315/2 Travaux' },
];
const INDEX = indexer(ARBRE);
/** Nos propres copies — le garde ④. `F1` est à nous ; `AUTRUI` ne l'est pas. */
const NOTRES = new Set(['F1']);
const espion = () => vi.fn(async () => ({ ok: true, json: async () => ({ id: 'X' }), text: async () => '' }) as unknown as Response);

describe('🔴🔴 « Documents clients scannés » est INTERDIT, et le garde ne dépend de rien', () => {
  it('le nom du dossier de production est refusé, dans un chemin', () => {
    expect(toucheLaProduction({ chemins: ['/Documents clients scannés/1 actifs/Dupont'] })).not.toBeNull();
  });

  it('chacun de ses TROIS sous-dossiers est refusé, même sans le nom du parent', () => {
    for (const s of SOUS_DOSSIERS_PRODUCTION) {
      expect(toucheLaProduction({ chemins: [`/${s}/Dupont/bail.pdf`] }), s).not.toBeNull();
    }
  });

  it('la casse ne contourne rien', () => {
    expect(toucheLaProduction({ chemins: ['/DOCUMENTS CLIENTS SCANNÉS/x'] })).not.toBeNull();
    expect(toucheLaProduction({ chemins: ['/1 ACTIFS/x'] })).not.toBeNull();
  });

  it('un identifiant de production CONNU est refusé, même si aucun nom ne le trahit', () => {
    expect(toucheLaProduction({ driveIds: ['PROD-9'] }, new Set(['PROD-9']))).not.toBeNull();
  });

  it('un chemin de « Base de données locative » passe', () => {
    expect(toucheLaProduction({ chemins: ['/2 Biens immobiliers/lot 315/2 Travaux'] })).toBeNull();
  });

  it('🔴 le déplacement REFUSE une destination de production AVANT tout appel réseau', async () => {
    const f = espion();
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'F1', versDossierId: 'RUB315T', parentsAvant: ['ARRIVEE'], nosCopies: NOTRES,
      chemins: ['/Documents clients scannés/1 actifs/Dupont'],
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.garde).toBe('production');
    expect(f).not.toHaveBeenCalled();   // 🔴 rien n'est parti
  });

  it('🔴 le RACCOURCI refuse aussi, et sur le nom qu’on lui donne', async () => {
    const f = espion();
    const r = await poserRaccourci({
      accessToken: 'j', versFichierId: 'F1', dansDossierId: 'RUB315T', nom: '→ 1 actifs Dupont', nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('🔴 ④ on ne déplace QUE nos propres copies', () => {
  /**
   * CE GARDE EST NÉ D'UN TEST. La première version passait le fichier comme `cibleDriveId` à `verifierEcriture`, en
   * croyant l'y faire vérifier — or sa liste blanche ne contient que des DOSSIERS, jamais un fichier : TOUT
   * déplacement était refusé. La leçon n'est pas de retirer la vérification mais de la faire porter sur la bonne
   * chose, et sur la bonne table.
   */
  it('un fichier qui n’est pas à nous est refusé, sans appel réseau', async () => {
    const f = espion();
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'AUTRUI', versDossierId: 'RUB315T', parentsAvant: ['ARRIVEE'],
      nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('n’est pas une copie que ce programme a faite');
    expect(f).not.toHaveBeenCalled();
  });

  it('un raccourci vers un fichier qui n’est pas à nous est refusé aussi', async () => {
    const f = espion();
    const r = await poserRaccourci({
      accessToken: 'j', versFichierId: 'AUTRUI', dansDossierId: 'RUB315T', nom: 'x.pdf', nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('🔴 un ensemble VIDE refuse tout : l’absence d’information n’autorise rien', async () => {
    const f = espion();
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'F1', versDossierId: 'RUB315T', parentsAvant: ['ARRIVEE'],
      nosCopies: new Set(),
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('le double garde-fou du lot DRIVE-1, réemployé tel quel', () => {
  it('un dossier HORS liste blanche est refusé', async () => {
    const f = espion();
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'F1', versDossierId: 'INCONNU', parentsAvant: ['ARRIVEE'], nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.garde).toBe('hors_liste_blanche');
    expect(f).not.toHaveBeenCalled();
  });

  it('🔴 sans parents connus, on refuse : Drive laisserait le fichier dans les DEUX dossiers', async () => {
    const f = espion();
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'F1', versDossierId: 'RUB315T', parentsAvant: [], nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('ce que le déplacement ÉMET, quand tout est permis', () => {
  it('un seul PATCH, avec addParents ET removeParents, et un corps vide', async () => {
    let vu = { url: '', methode: '', corps: '' };
    const f = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      vu = { url: String(u), methode: init?.method ?? '', corps: String(init?.body ?? '') };
      return { ok: true, json: async () => ({ id: 'F1' }), text: async () => '' } as unknown as Response;
    });
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'F1', versDossierId: 'RUB315T', parentsAvant: ['ARRIVEE'], nosCopies: NOTRES,
      chemins: ['/2 Biens immobiliers/lot 315/2 Travaux'],
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(vu.methode).toBe('PATCH');
    expect(vu.url).toContain('addParents=RUB315T');
    expect(vu.url).toContain('removeParents=ARRIVEE');
    expect(vu.url).toContain('supportsAllDrives=true');
    // 🔴 NI NOM, NI CONTENU, NI DROITS : le corps est vide, donc rien d'autre ne peut changer.
    expect(vu.corps).toBe('{}');
    expect(vu.url).not.toContain('name');
  });

  it('un refus de Drive est rendu tel quel, sans prétendre que le fichier a bougé', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 403, text: async () => 'insufficientPermissions' }) as unknown as Response);
    const r = await deplacerDansDossier({
      accessToken: 'j', driveFileId: 'F1', versDossierId: 'RUB315T', parentsAvant: ['ARRIVEE'], nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('403');
  });

  it('le raccourci crée bien un raccourci, jamais une copie', async () => {
    let corps = '';
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      corps = String(init?.body ?? '');
      return { ok: true, json: async () => ({ id: 'R1' }), text: async () => '' } as unknown as Response;
    });
    await poserRaccourci({
      accessToken: 'j', versFichierId: 'F1', dansDossierId: 'RUB315T', nom: 'devis.pdf', nosCopies: NOTRES,
    }, INDEX, { fetch: f as unknown as typeof fetch });
    expect(corps).toContain('application/vnd.google-apps.shortcut');
    expect(corps).toContain('"targetId":"F1"');
    // 🔴 Jamais `files/{id}/copy` : une copie créerait un second fichier à faire vivre.
    expect(corps).not.toContain('copy');
  });
});

/** 🔒 CE QUE LES SOURCES S'INTERDISENT. */
describe('les garanties du lot', () => {
  const sans = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  it('🔒 le dépôt de classement est en LECTURE SEULE', () => {
    const repo = sans(readFileSync('app/lib/gestion/classementRepo.ts', 'utf8'));
    for (const verbe of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'TRUNCATE']) {
      expect(repo, verbe).not.toContain(verbe);
    }
  });

  it('🔒 le moteur de plan est PUR : aucun import', () => {
    const src = readFileSync('app/lib/gestion/classement.ts', 'utf8');
    expect(src.match(/^import\s/gm)).toBeNull();
  });

  it('🔴 la commande de simulation ne PEUT PAS déplacer : elle n’importe pas le module qui sait le faire', () => {
    const cmd = sans(readFileSync('app/scripts/plan-classement.ts', 'utf8'));
    const imports = [...cmd.matchAll(/^import\s+(?!type\b)[^;]*from\s*'([^']*)'/gm)].map((m) => m[1]);
    expect(imports.filter((i) => /classementDrive|driveEcriture|stockage/.test(i))).toHaveLength(0);
    expect(cmd).not.toContain('--appliquer');
  });

  it('🔴 le module de déplacement n’émet que PATCH (déplacer) et POST (raccourci) — jamais DELETE ni copy', () => {
    const d = sans(readFileSync('app/lib/gestion/classementDrive.ts', 'utf8'));
    expect(d).not.toMatch(/method:\s*'DELETE'/);
    expect(d).not.toContain('/copy');
    expect(d).not.toContain('trashed');
    expect(d).not.toContain('permissions');
    // Et le garde de production est le PREMIER geste de chacune des deux fonctions.
    for (const nom of ['deplacerDansDossier', 'poserRaccourci']) {
      const corps = d.slice(d.indexOf(`export async function ${nom}`));
      expect(corps.indexOf('toucheLaProduction('), nom).toBeGreaterThanOrEqual(0);
      expect(corps.indexOf('toucheLaProduction(')).toBeLessThan(corps.indexOf('deps.fetch'));
    }
  });

  it('le nom du dossier de production est écrit UNE fois, dans le moteur', () => {
    expect(PRODUCTION_INTERDITE).toBe('Documents clients scannés');
    const d = readFileSync('app/lib/gestion/classementDrive.ts', 'utf8');
    // Le module de déplacement l'IMPORTE au lieu de le recopier : deux copies finiraient par diverger.
    expect(d).toContain("import { PRODUCTION_INTERDITE } from './classement'");
  });

  it('les quatre rubriques sont celles du Drive, dans l’ordre', () => {
    expect(RUBRIQUES).toEqual(['1 Locataires', '2 Travaux', '3 Assurances', '4 Litige']);
  });
});
