import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  cibleDepuisTexte, ecrireFiltres, entierBorne, filtreActif, grouperParCible, jourValide,
  libelleInterlocuteur, lireFiltres, resumeEntete, texteCible,
  FILTRES_VIDES, INTERLOCUTEURS_MAX, PAGE_HISTORIQUE, PAGE_HISTORIQUE_MAX,
  type FiltresHistorique, type LigneHistorique,
} from './historique';
import {
  etatSuite, motifSuite, resumeSuite, COMPTES_SUITE_VIDES, MARGE_RETOUR_SUITE, PLAFOND_MESSAGES_SUITE,
} from './suiteReleve';
import { cibleEvenement, cibleLot, cibleProprietaire } from './rattachement';

/**
 * LOT RATTACHEMENT-2 — LES MODULES PURS : l'adresse de l'historique, ses filtres, et le verdict de l'enchaînement.
 *
 * 🔴 CE QU'AUCUN TEST NE FERA ICI : toucher la base, Gmail ou le Drive. Ce que PostgreSQL fait vraiment — un nouveau
 * mail rattaché dans la même passe, une décision humaine jamais écrasée, une relève qui survit à l'échec de son
 * enchaînement — se prouve sur le CLUSTER JETABLE (`npm run gestion:rattachement:epreuve`).
 *
 * 🔒 Aucune donnée réelle : clés inventées, adresses en @fictif.fr.
 */

describe('la cible, dans l’adresse', () => {
  it('s’écrit en une forme canonique, unique', () => {
    expect(texteCible(cibleLot('282'))).toBe('lot-282');
    expect(texteCible(cibleProprietaire('339'))).toBe('proprio-339');
    expect(texteCible(cibleEvenement(12))).toBe('carte-12');
  });

  it('se relit exactement', () => {
    for (const c of [cibleLot('282'), cibleProprietaire('339'), cibleEvenement(12)]) {
      expect(cibleDepuisTexte(texteCible(c)), texteCible(c)).toEqual(c);
    }
  });

  it('🔴 une clé WIPPIMMO qui contient un TIRET survit — la coupe se fait au PREMIER tiret', () => {
    // Les jeux d'épreuve portent des clés « J-1 » : couper au dernier tiret, ou refuser le non-numérique,
    //   casserait silencieusement ces cibles-là.
    expect(cibleDepuisTexte('lot-J-1')).toEqual(cibleLot('J-1'));
    expect(texteCible(cibleLot('J-1'))).toBe('lot-J-1');
    expect(cibleDepuisTexte(texteCible(cibleLot('J-1')))).toEqual(cibleLot('J-1'));
  });

  it('🔴 une adresse absurde rend null, JAMAIS une erreur — un signet de six mois ne fait pas écran blanc', () => {
    for (const non of [
      null, undefined, '', '   ', 'lot', 'lot-', '-282', 'inventee-1',
      'carte-0',                    // un identifiant nul n'existe pas en base
      'carte-abc',                  // un événement se désigne par un NOMBRE
      'lot-a b',                    // espace : ce n'est pas une clé
      `lot-${'x'.repeat(61)}`,      // absurde
      'lot-<script>',               // rien d'arbitraire n'atteint une requête
    ]) {
      expect(cibleDepuisTexte(non), String(non)).toBeNull();
    }
  });
});

describe('les filtres', () => {
  const depuis = (q: string): FiltresHistorique => lireFiltres(new URLSearchParams(q));

  it('une adresse nue rend les défauts', () => {
    expect(depuis('')).toEqual(FILTRES_VIDES);
  });

  it('🔴 « inclure le propriétaire » est ÉTEINT par défaut, « inclure les logements » est ALLUMÉ', () => {
    // Les deux défauts sont opposés, et chacun pour une raison : un bailleur écrit souvent pour ses comptes sans
    // rapport avec un logement donné ; alors qu'un historique de propriétaire SANS ses logements ne montrerait
    // presque rien de ce qui le concerne.
    expect(FILTRES_VIDES.avecProprietaire).toBe(false);
    expect(FILTRES_VIDES.avecLogements).toBe(true);
    expect(depuis('proprio=1').avecProprietaire).toBe(true);
    expect(depuis('logements=0').avecLogements).toBe(false);
    // ⚠️ L'ABSENCE du paramètre doit rendre le DÉFAUT, pas « faux ».
    expect(depuis('grouper=1').avecLogements).toBe(true);
  });

  it('les interlocuteurs sont normalisés, dédoublonnés et bornés', () => {
    expect(depuis('avec=A@Fictif.FR,%20a@fictif.fr%20,b@fictif.fr').interlocuteurs)
      .toEqual(['a@fictif.fr', 'b@fictif.fr']);
    const beaucoup = Array.from({ length: 200 }, (_, i) => `a${i}@fictif.fr`).join(',');
    expect(depuis(`avec=${beaucoup}`).interlocuteurs).toHaveLength(INTERLOCUTEURS_MAX);
  });

  it('une date est acceptée en ISO, et refusée autrement — on ne devine pas « 03/07/2024 »', () => {
    expect(jourValide('2024-07-03')).toBe('2024-07-03');
    for (const non of [null, '', '03/07/2024', '2024-7-3', '2024-13-45', 'hier']) {
      expect(jourValide(non), String(non)).toBeNull();
    }
  });

  it('les entiers sont bornés, et une valeur absurde rend le défaut', () => {
    expect(entierBorne('7', 25, 100)).toBe(7);
    expect(entierBorne('500', 25, 100)).toBe(100);
    for (const non of ['-1', 'abc', '', null, '1.5']) expect(entierBorne(non, 25, 100), String(non)).toBe(25);
    expect(depuis('taille=100000').taille).toBe(PAGE_HISTORIQUE_MAX);
    expect(depuis('taille=0').taille).toBe(PAGE_HISTORIQUE);
  });

  it('le choix « pièces » n’accepte que ses trois valeurs', () => {
    expect(depuis('pieces=avec').pieces).toBe('avec');
    expect(depuis('pieces=sans').pieces).toBe('sans');
    for (const non of ['', 'AVEC', 'inventee']) expect(depuis(`pieces=${non}`).pieces, non).toBe('toutes');
  });

  it('🔴 ce qui est lu se réécrit à l’identique — sinon « Précédent » ramènerait un autre écran', () => {
    const f: FiltresHistorique = {
      ...FILTRES_VIDES, interlocuteurs: ['a@fictif.fr', 'b@fictif.fr'], du: '2024-01-01', au: '2024-12-31',
      pieces: 'avec', texte: 'quittance', avecProprietaire: true, avecLogements: false, grouper: true, page: 3,
    };
    expect(lireFiltres(new URLSearchParams(ecrireFiltres(f).slice(1)))).toEqual(f);
  });

  it('des filtres vides s’écrivent VIDE : l’adresse nue du module reste l’adresse nue', () => {
    expect(ecrireFiltres(FILTRES_VIDES)).toBe('');
  });

  it('« un filtre est-il actif ? » ne compte QUE ce qui cache des mails', () => {
    expect(filtreActif(FILTRES_VIDES)).toBe(false);
    // Le périmètre et le regroupement ne cachent rien : ils élargissent ou réordonnent.
    expect(filtreActif({ ...FILTRES_VIDES, avecProprietaire: true, grouper: true, page: 4 })).toBe(false);
    expect(filtreActif({ ...FILTRES_VIDES, texte: 'x' })).toBe(true);
    expect(filtreActif({ ...FILTRES_VIDES, interlocuteurs: ['a@fictif.fr'] })).toBe(true);
    expect(filtreActif({ ...FILTRES_VIDES, du: '2024-01-01' })).toBe(true);
    expect(filtreActif({ ...FILTRES_VIDES, pieces: 'sans' })).toBe(true);
  });
});

describe('ce que l’en-tête dit', () => {
  it('un historique vide le dit, sans chiffres trompeurs', () => {
    expect(resumeEntete({ nbMails: 0, nbPieces: 0, premierLe: null, dernierLe: null }))
      .toBe('Aucun échange rattaché pour l’instant.');
  });

  it('les pluriels tiennent, et « aucune pièce » est écrit plutôt que « 0 pièce »', () => {
    expect(resumeEntete({ nbMails: 1, nbPieces: 0, premierLe: 'a', dernierLe: 'b' }))
      .toBe('1 mail · aucune pièce jointe');
    expect(resumeEntete({ nbMails: 429, nbPieces: 12, premierLe: 'a', dernierLe: 'b' }))
      .toBe('429 mails · 12 pièces jointes');
  });
});

describe('le regroupement par cible', () => {
  const ligne = (id: number, date: string, cle: string): LigneHistorique => ({
    messageId: id, filId: 1, recuLe: date, sens: 'recu', de: 'a@fictif.fr', deNom: null, destinataires: [],
    objet: null, extrait: null, pieces: [], parCible: cibleLot(cle), cibleLibelle: `lot ${cle}`,
    source: 'rattachement',
  });

  it('🔴 les groupes suivent le PLUS RÉCENT de chacun, pas l’ordre alphabétique', () => {
    // On cherche « où en est-on » : ce qui a bougé en dernier doit être en haut.
    const g = grouperParCible([
      ligne(1, '2024-03-01T10:00:00Z', 'B'),
      ligne(2, '2024-02-01T10:00:00Z', 'A'),
      ligne(3, '2024-01-01T10:00:00Z', 'B'),
    ]);
    expect(g.map((x) => x.cible.cle)).toEqual(['B', 'A']);
    // Et l'ordre chronologique inverse est conservé À L'INTÉRIEUR d'un groupe.
    expect(g[0].lignes.map((l) => l.messageId)).toEqual([1, 3]);
  });

  it('un interlocuteur sans nom est désigné par son adresse', () => {
    expect(libelleInterlocuteur({ adresse: 'a@fictif.fr', nom: null, nbMails: 3, interne: false }))
      .toBe('a@fictif.fr');
    expect(libelleInterlocuteur({ adresse: 'a@fictif.fr', nom: '  Jean PONS ', nbMails: 3, interne: false }))
      .toBe('Jean PONS');
    expect(libelleInterlocuteur({ adresse: 'a@fictif.fr', nom: '   ', nbMails: 3, interne: false }))
      .toBe('a@fictif.fr');
  });
});

describe('l’enchaînement qui suit la relève', () => {
  it('une passe ordinaire ne rapporte rien, et le dit sans chiffres', () => {
    expect(resumeSuite(COMPTES_SUITE_VIDES)).toBe('rien de nouveau à rattacher');
  });

  it('une passe qui a fait quelque chose dit QUOI', () => {
    const r = resumeSuite({
      ...COMPTES_SUITE_VIDES, messagesReleves: 2, adressesEcrites: 5, filsReexamines: 2,
      liensPoses: 2, candidatsPoses: 1, respectes: 3, resteAFaire: 1,
    });
    expect(r).toContain('2 message(s) relevé(s)');
    expect(r).toContain('5 adresse(s)');
    expect(r).toContain('3 décision(s) humaine(s) respectée(s)');
    expect(r).toContain('pour la passe suivante');
  });

  it('un motif d’erreur est mis sur UNE ligne et BORNÉ : il va en base et dans un bandeau', () => {
    expect(motifSuite(new Error('  a\n  b  '))).toBe('a b');
    expect(motifSuite(new Error('x'.repeat(500)))).toHaveLength(300);
    expect(motifSuite(new Error('x'.repeat(500))).endsWith('…')).toBe(true);
    expect(motifSuite('pas une Error')).toBe('pas une Error');
  });

  it('🔴 le bandeau SE TAIT quand tout va bien — une ligne qui rassure chaque minute cache celle qui alerte', () => {
    expect(etatSuite({ resultat: 'ok', detail: 'x', ms: 3 }).niveau).toBe('ok');
    expect(etatSuite({ resultat: 'ok', detail: 'x', ms: 3 }).texte).toBe('');
    expect(etatSuite({ resultat: 'ignore', detail: 'rien', ms: 2 }).texte).toBe('');
  });

  it('🔴 « on ne sait pas » N’EST PAS « tout va bien » : sans la 258, il se tait sans rassurer', () => {
    const e = etatSuite({ resultat: null, detail: null, ms: null });
    expect(e.niveau).toBe('muet');
    expect(e.texte).toBe('');
  });

  it('🔴 sur échec il dit que LE COURRIER EST BIEN ARRIVÉ, le motif, et le geste qui répare', () => {
    const e = etatSuite({ resultat: 'erreur', detail: 'annuaire absent', ms: 12 });
    expect(e.niveau).toBe('echec');
    expect(e.texte).toContain('Le courrier est bien arrivé');
    expect(e.texte).toContain('annuaire absent');
    expect(e.aide).toContain('gestion:rattachement:proposer');
  });

  it('les bornes de l’enchaînement sont nommées, jamais dispersées', () => {
    expect(PLAFOND_MESSAGES_SUITE).toBe(2_000);
    expect(MARGE_RETOUR_SUITE).toBe(1_000);
  });
});

/** LA MIGRATION 258, éprouvée par sa FORME. */
describe('la migration 258', () => {
  const sql = readFileSync('db/migrations/258_gestion_suite_releve.sql', 'utf8');
  const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');

  it('ajoute les trois colonnes du verdict, et rien d’autre', () => {
    for (const c of ['suite_resultat', 'suite_detail', 'suite_ms']) {
      expect(code, c).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
    }
    const alteres = [...code.matchAll(/ALTER TABLE\s+(\w+)/gi)].map((m) => m[1]);
    expect(new Set(alteres)).toEqual(new Set(['gestion_releve_run']));
  });

  it('🔴 le verdict de l’enchaînement est DISTINCT de celui de la relève', () => {
    // Écrire le motif dans `erreur` ferait passer pour ratée une passe qui a parfaitement rapatrié le courrier,
    // et le bandeau de veille crierait à tort.
    expect(code).toContain("suite_resultat IN ('ok', 'erreur', 'ignore')");
    expect(code).not.toMatch(/UPDATE\s+gestion_releve_run\s+SET\s+erreur/i);
    expect(code).not.toMatch(/ALTER TABLE gestion_releve_run\s+DROP COLUMN/i);
  });

  it('🔴 elle NE CRÉE AUCUN INDEX — la mesure a montré qu’il n’en fallait pas', () => {
    expect(code).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(sql).toContain('4,8 ms');
  });

  it('elle exige son prédécesseur plutôt que d’échouer obscurément plus loin', () => {
    expect(code).toContain("to_regclass('public.gestion_rattachement') IS NULL");
  });

  it('🔒 ne contient aucune donnée, et s’exécute en UNE transaction', () => {
    expect(code).not.toMatch(/INSERT\s+INTO/i);
    expect(code.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(code.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('donne la commande exacte', () => {
    expect(sql).toContain('psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/258_gestion_suite_releve.sql');
  });
});

/** 🔴 CE QUE LES MODULES DE CE LOT NE DOIVENT JAMAIS FAIRE. */
describe('les garanties du lot', () => {
  const sansCommentaires = (src: string): string => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n');

  const suiteReel = sansCommentaires(readFileSync('app/lib/gestion/suiteReleveReel.ts', 'utf8'));
  const histoRepo = sansCommentaires(readFileSync('app/lib/gestion/historiqueRepo.ts', 'utf8'));
  const releveReelle = sansCommentaires(readFileSync('app/lib/gestion/releveReelle.ts', 'utf8'));

  it('🔴 le dépôt de l’historique n’ÉCRIT rien : aucun INSERT, aucun UPDATE, aucun DELETE', () => {
    expect(histoRepo).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+gestion_|DELETE\s+FROM)/i);
  });

  it('🔴 ni l’un ni l’autre n’atteint Gmail, le Drive ou MinIO', () => {
    /**
     * ⚠️ ON VISE LES MODULES QUI PARLENT AU RÉSEAU, pas les noms qui y ressemblent. `driveArbre` est un module PUR
     * de NOMMAGE (« 4 rue X — lot 100 ») : l'interdire priverait l'historique de ses libellés sans rien protéger.
     * Ce qu'on interdit, ce sont les clients : `driveEcriture`, `copiePiecesReel`, `gmail`, `stockage`, `email/…`.
     */
    const clients = /driveEcriture|driveDelegue|copiePiecesReel|driveRepo|gmail|stockage|\/email|releveReelle/i;
    for (const [nom, src] of [['suite', suiteReel], ['historique', histoRepo]] as const) {
      expect(src, nom).not.toMatch(/googleapis\.com|imapflow|@aws-sdk/);
      const imports = [...src.matchAll(/from\s*'([^']*)'/g)].map((m) => m[1]);
      expect(imports.filter((i) => clients.test(i)), nom).toHaveLength(0);
    }
  });

  it('🔴 l’enchaînement ne peut PAS faire échouer la relève : il attrape tout', () => {
    // Le bloc de `enchainerApresReleve` se termine par un `catch` qui REND un verdict au lieu de propager.
    const bloc = suiteReel.slice(suiteReel.indexOf('export async function enchainerApresReleve'));
    const corps = bloc.slice(0, bloc.indexOf('export async function consignerSuite'));
    expect(corps).toContain('catch (e)');
    expect(corps).toContain("resultat: 'erreur'");
    expect(corps).not.toMatch(/\bthrow\b/);
  });

  it('🔴 la relève n’enchaîne QUE sur une passe appliquée ET réussie', () => {
    const bloc = releveReelle.slice(releveReelle.indexOf('export async function relever'));
    expect(bloc).toContain("if (!appliquer || issue.resultat !== 'ok') return issue;");
    // 🔴 ET ELLE REND L'ISSUE DE LA RELÈVE, jamais celle de l'enchaînement : le courrier est arrivé, c'est cela que
    //   l'appelant doit savoir. Rendre `suite` ferait passer une passe réussie pour ratée.
    expect(bloc).toContain('const suite = await enchainerApresReleve(journal);');
    expect(bloc).toContain('await consignerSuite(issue.runId, suite);');
    expect(bloc).not.toMatch(/return\s+suite/);
  });

  it('🔴 le rattachement respecte les décisions humaines, et c’est écrit en SQL', () => {
    const repo = sansCommentaires(readFileSync('app/lib/gestion/rattachementRepo.ts', 'utf8'));
    // La mise à jour d'un lien automatique s'interdit ceux qu'un humain a touchés…
    expect(repo).toContain('statut_par_libelle IS NULL');
    // …et l'insertion ne se fait qu'en l'absence de TOUTE ligne pour cette identité (donc jamais de résurrection).
    expect(repo).toContain('WHERE NOT EXISTS (SELECT 1 FROM gestion_rattachement WHERE');
  });
});
