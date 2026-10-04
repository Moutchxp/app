/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — RANGER LES PARTIES EXISTANTES, ET CRÉER LES CARTES DE CONTACT ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 SANS `--appliquer`, CE SCRIPT N'ÉCRIT RIEN. C'est le mode par défaut, et c'est ainsi que les chiffres
 * ci-dessous ont été mesurés le 04/10/2026 — AVANT toute écriture.
 * 🔒 AUCUN `DELETE`, AUCUNE SUPPRESSION, AUCUN APPEL RÉSEAU : il ne lit et n'écrit que notre base.
 * 🔒 AUCUNE LIGNE `origine = 'manuel'` N'EST TOUCHÉE, jamais. Le choix manuel prime toujours.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/reprendre-categories-parties.ts              # simule
 *   npx tsx --env-file=.env app/scripts/reprendre-categories-parties.ts --appliquer
 *
 * Journal : ~/Desktop/journal-reprise-categories.txt  (et  …-applique.txt  en écriture)
 *
 * ═══ 🔴 CE QUE LA RÈGLE À TROIS ÉTAGES DONNE, ET CE QUE CE SCRIPT DOIT RETROUVER ═══════════════════════════════════
 *
 *   point de départ : 887 paires (bien, adresse) · 640 adresses distinctes · 234 biens
 *   ① plusieurs biens  → indépendant PROPOSÉ ........  65 adresses, qui expliquent 312 paires
 *   ② un seul bien     → carte de contact ...........  485 cartes — 318 côté propriétaire, 167 côté locataire,
 *                                                       sur 164 biens
 *   ③ les deux / aucun → « à répartir » .............   90 paires, sur 50 biens
 *
 * ⚠️ SI LA MESURE DIFFÈRE, LE SCRIPT LE DIT ET NE CORRIGE RIEN. Les chiffres attendus sont écrits ci-dessous et
 * comparés à chaque passe : un écart est une information (du courrier est arrivé, un rattachement a été tranché,
 * l'annuaire a été réimporté), jamais un bogue à faire taire en changeant la constante.
 *
 * ═══ 🔴 QUI EST « À RANGER », ET LA NUANCE QU'IL FAUT CONNAÎTRE ════════════════════════════════════════════════════
 *
 * Les paires (bien, adresse) à ranger sont celles où l'adresse est NON INTERNE (ce n'est pas nous) et où l'annuaire
 * ne la reconnaît comme AUCUNE partie — `gestion_message_adresse.partie IS NULL`.
 *
 * ⚠️ LA MESURE EST « RECONNUE NULLE PART », PAS « RECONNUE SUR CE BIEN ». Sur la base du 04/10/2026 les deux
 * donnent le même nombre d'adresses (le relevé pose `partie` par adresse, pas par couple), mais ce ne sont pas la
 * même question : la seconde rendrait 1 136 paires au lieu de 887, parce qu'un propriétaire du lot A écrivant sur
 * le lot B deviendrait « à ranger » sur B. On garde la première — un client reste un client partout — et on l'écrit
 * ici pour qu'elle ne se redécouvre pas dans six mois.
 *
 * ═══ 🔒 ET LE GARDE : UN INDÉPENDANT NE SERT JAMAIS À L'AUTOMATISATION ════════════════════════════════════════════
 *
 * Les 65 indépendants proposés sont écrits avec `lot_cle = NULL` — GLOBAUX, rattachés à aucun bien, et la base le
 * rend impossible autrement (`gestion_partie_categorie_portee_chk`). Aucune carte n'est créée pour eux. Aucun bien
 * n'est jamais déduit de leur adresse : ce script ne touche NI `gestion_rattachement`, NI `gestion_message_adresse`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { query } from '../lib/db/client';
import { contactCarteDisponible, partieCategorieDisponible } from '../lib/gestion/schema';
import { categorieParDefaut, coteDeLaCategorie, LIBELLE_CARTE_AUTO } from '../lib/gestion/partieCategorie';
import type { Categorie, Cote } from '../lib/gestion/partieCategorie';

const APPLIQUER = process.argv.includes('--appliquer');
/** Au plus tant d'exemples par section : un rapport de mille lignes ne se lit pas. */
const EXEMPLES_MAX = 12;

/** 🔴 LA SIGNATURE DE LA PASSE. Ce n'est pas un humain, et la ligne ne doit pas prétendre le contraire. */
const AUTEUR = 'automatique';
const MOTIF = 'reprise des catégories de parties (lot HISTORIQUE-BIEN-1, migration 304)';

/** 🔴 LES CHIFFRES MESURÉS LE 04/10/2026, EN LECTURE SEULE. Comparés, jamais imposés. */
const ATTENDU = {
  paires: 887, adresses: 640, biens: 234,
  independants: 65, pairesIndependantes: 312,
  cartes: 485, cartesProprietaire: 318, cartesLocataire: 167, biensAvecCarte: 164,
  aRepartir: 90, biensARepartir: 50,
} as const;

interface Paire {
  lotCle: string;
  adresse: string;
  /** Sur combien de biens cette adresse apparaît-elle, parmi les paires à ranger ? Le signal de l'étage ①. */
  biensDeLAdresse: number;
  parleAvecProprietaire: boolean;
  parleAvecLocataire: boolean;
  /** Le nom lu dans un en-tête, quand il y en a un. `null` pour qui n'a jamais écrit sous son nom. */
  nom: string | null;
  categorie: Categorie;
  origine: 'defaut' | 'propose';
  cote: Cote | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LA LECTURE — UNE SEULE REQUÊTE, ET ELLE N'ÉCRIT RIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES PAIRES (BIEN, ADRESSE) À RANGER, AVEC LEURS DEUX SIGNAUX DE CONVERSATION. LECTURE SEULE.
 *
 * 🔴 LA RÈGLE DU LIEN DE BIEN EST RÉÉCRITE ICI, EXPRÈS. `app/scripts/` est hors du champ du garde
 * `uneSeuleRegleDuLienDeBien.guard.test.ts`, et son encadré dit pourquoi en toutes lettres : « un script d'audit
 * vaut précisément parce qu'il REDÉMONTRE la règle de son côté ; un oracle qui partage le code qu'il contrôle ne
 * contrôle rien. » Elle est donc écrite à la main, à l'identique : `statut='confirme'`, `cible_sorte='lot'`,
 * `cible_cle IS NOT NULL`, `piece_id IS NULL`.
 *
 * ═══ 🔴🔴 LE POINT DÉLICAT : « PARLER AVEC LE PROPRIÉTAIRE DE CE BIEN » ════════════════════════════════════════════
 *
 * Les parties présentes dans une conversation sont relevées DANS LES MAILS DE CE BIEN, et nulle part ailleurs
 * (`fil_partie` ci-dessous est bornée par `liens`). C'est ce qui donne les chiffres validés — 318 / 167 / 90.
 *
 * ⚠️ DEUX VARIANTES PLUS LARGES ONT ÉTÉ MESURÉES ET ÉCARTÉES, et il faut les connaître pour ne pas les réessayer :
 *   · parties relevées dans TOUTE la conversation, sans la borner au bien → 317 / 153 / 105 ;
 *   · propriétaire retrouvé par l'annuaire (lot → propriétaire → `proprietaire_cle`) → 318 / 156 / 101.
 * Les deux répondent à une question légèrement différente — « cette adresse parle-t-elle avec un propriétaire ? »
 * au lieu de « … avec le propriétaire DE CE BIEN, sur le courrier DE CE BIEN ? » — et c'est la seconde qu'Arno a
 * validée.
 *
 * ⚠️ `gestion_message_adresse.partie` NE PORTE PAS DE `lot_cle` POUR UN PROPRIÉTAIRE (mesuré : 17 360 lignes
 * `proprietaire`, ZÉRO avec `lot_cle` ; elles portent `proprietaire_cle`). Toute tentative de borner le
 * propriétaire par `a.lot_cle` rend donc SILENCIEUSEMENT « aucun propriétaire nulle part » — vérifié, elle donnait
 * 0 côté propriétaire et 252 côté locataire. C'est exactement le genre de jointure qui ne lève pas et qui ment.
 */
async function lirePaires(): Promise<Paire[]> {
  const { rows } = await query<{
    lot_cle: string; adresse: string; n_biens: string; prop: boolean | null; loc: boolean | null;
    nom: string | null;
  }>(
    `WITH liens AS (
        SELECT DISTINCT r.message_id, r.cible_cle AS lot_cle
          FROM gestion_rattachement r
         WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot'
           AND r.cible_cle IS NOT NULL AND r.piece_id IS NULL
      ),
      /* Les paires à ranger, avec la conversation où l'adresse a été vue. */
      inconnues AS (
        SELECT DISTINCT l.lot_cle, a.adresse, m.fil_id
          FROM liens l
          JOIN gestion_message m ON m.id = l.message_id
          JOIN gestion_message_adresse a
            ON a.message_id = l.message_id AND a.interne = false AND a.partie IS NULL
      ),
      /* Les parties présentes dans les mails DE CE LOT, conversation par conversation. */
      fil_partie AS (
        SELECT DISTINCT l.lot_cle, m.fil_id, a.partie
          FROM liens l
          JOIN gestion_message m ON m.id = l.message_id
          JOIN gestion_message_adresse a ON a.message_id = l.message_id AND a.partie IS NOT NULL
      ),
      paires AS (
        SELECT i.lot_cle, i.adresse,
               bool_or(fp.partie = 'proprietaire') AS prop,
               bool_or(fp.partie = 'locataire')    AS loc
          FROM inconnues i
          LEFT JOIN fil_partie fp ON fp.fil_id = i.fil_id AND fp.lot_cle = i.lot_cle
         GROUP BY 1, 2
      ),
      /* Le signal de l'étage ① : sur combien de biens cette adresse apparaît-elle ? */
      compte AS (SELECT adresse, count(DISTINCT lot_cle) AS n_biens FROM paires GROUP BY 1),
      /* ══ ⚠️ LE NOM EST DEVINÉ, ET LE CHEMIN A ÉTÉ CORRIGÉ APRÈS MESURE ══════════════════════════════════════════
         Premier essai : le nom d'affichage de l'adresse quand elle est EXPÉDITRICE. Il rendait ZÉRO nom sur 485
         cartes, et la base dit pourquoi : sur 57 486 lignes \`expediteur\`, AUCUNE n'a de chevrons dans
         \`adresse_brute\` — la capture y range l'adresse nue. Les noms d'affichage vivent dans les autres rôles
         (61 338 \`destinataire\`, 5 903 \`copie\`, 4 484 \`repondre_a\`, 5 248 \`transfere\`).
         On lit donc TOUS les rôles, et l'on garde le nom le PLUS FRÉQUENT — pas le premier venu : une même
         personne est écrite de plusieurs façons, et le plus fréquent est celui que l'équipe reconnaîtra.
         ⚠️ UN NOM QUI EST LUI-MÊME UNE ADRESSE EST ÉCARTÉ (\`NOT LIKE '%@%'\`) : « contact@x.fr <contact@x.fr> »
         n'apprend rien, et afficherait deux fois la même chose sur la carte.
         ⚠️ CE CHOIX NE CHANGE AUCUN DES DIX COMPTES ci-dessus : il ne remplit qu'un champ de carte. Il DIVERGE en
         revanche d'une phrase de la simulation, qui annonçait \`rusanov_d@me.com\` « sans nom possible » parce
         qu'il n'a jamais écrit — les en-têtes où il est en copie portent bien « Dmytro Rusanov ». */
      noms AS (
        SELECT DISTINCT ON (adresse) adresse, nom FROM (
          SELECT a.adresse,
                 btrim(btrim(regexp_replace(a.adresse_brute, '\\s*<[^<>]*>\\s*$', ''), ' "'''), ' ') AS nom,
                 count(*) AS n
            FROM gestion_message_adresse a
           WHERE a.adresse_brute LIKE '%<%'
           GROUP BY 1, 2
        ) t
         WHERE nom <> '' AND nom NOT LIKE '%@%'
         ORDER BY adresse, n DESC, length(nom) DESC, nom
      )
      SELECT p.lot_cle, p.adresse, c.n_biens::text, p.prop, p.loc, n.nom
        FROM paires p
        JOIN compte c ON c.adresse = p.adresse
        LEFT JOIN noms n ON n.adresse = p.adresse
       ORDER BY p.lot_cle, p.adresse`);

  return rows.map((r) => {
    const signaux = {
      biensDeLAdresse: Number(r.n_biens),
      parleAvecProprietaire: r.prop === true,
      parleAvecLocataire: r.loc === true,
    };
    /* 🔴 LA RÈGLE EST CELLE DU MODULE PUR, pas une seconde écriture en SQL. C'est le seul endroit où elle est lue. */
    const { categorie, origine } = categorieParDefaut(signaux);
    return {
      lotCle: r.lot_cle, adresse: r.adresse, ...signaux,
      nom: (r.nom ?? '').trim() === '' ? null : (r.nom as string).trim().slice(0, 300),
      categorie, origine: origine as 'defaut' | 'propose', cote: coteDeLaCategorie(categorie),
    };
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE RAPPORT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const lignes: string[] = [];
function dire(s = ''): void { lignes.push(s); console.log(s); }

function ecart(nom: string, mesure: number, attendu: number): void {
  dire(mesure === attendu
    ? `  ✅ ${nom.padEnd(34)} ${String(mesure).padStart(5)}`
    : `  ⚠️ ${nom.padEnd(34)} ${String(mesure).padStart(5)}   (attendu ${attendu}, écart ${mesure - attendu > 0 ? '+' : ''}${mesure - attendu})`);
}

/**
 * LE JOURNAL SUR LE BUREAU.
 *
 * 🔴 EN MODE `--appliquer`, ON AJOUTE À LA SUITE — ON N'ÉCRASE PAS, et ce défaut a été mesuré le 04/10/2026 : la
 * passe réelle (640 catégories, 485 cartes) avait écrit son rapport, et la relance de contrôle, qui n'a rien écrit
 * en base (0 / 0, preuve de l'idempotence), a REMPLACÉ ce rapport par le sien. Une passe d'écriture est un
 * événement historique : on n'efface pas le compte rendu de celle qui a réellement rangé 1 125 lignes.
 *
 * ⚠️ EN SIMULATION, ON ÉCRASE, et c'est voulu : une simulation est un INSTANTANÉ de l'état d'aujourd'hui, pas un
 * historique. Dix instantanés empilés ne se lisent pas, et seul le dernier dit la vérité du moment.
 */
function journal(): void {
  const chemin = join(homedir(), 'Desktop',
    APPLIQUER ? 'journal-reprise-categories-applique.txt' : 'journal-reprise-categories.txt');
  try {
    mkdirSync(dirname(chemin), { recursive: true });
    const texte = `${lignes.join('\n')}\n`;
    if (APPLIQUER) appendFileSync(chemin, `${texte}\n`, 'utf8');
    else writeFileSync(chemin, texte, 'utf8');
    console.log(`\nJournal ${APPLIQUER ? 'complété' : 'écrit'} : ${chemin}`);
  } catch (e) {
    console.error('[reprise-categories] journal NON écrit', e);
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ L'ÉCRITURE — SEULEMENT AVEC `--appliquer`
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES CATÉGORIES. Une instruction, `jsonb_to_recordset` pour éviter 887 requêtes et toute interpolation de valeur.
 *
 * 🔴 TROIS PROTECTIONS, ET CHACUNE COMPTE :
 *   ① `ON CONFLICT … WHERE retire_le IS NULL DO NOTHING` sur l'index partiel des vivantes — relancer la reprise ne
 *      crée AUCUN doublon et ne fait perdre aucune date. Le prédicat est RÉPÉTÉ : sans lui, PostgreSQL refuse
 *      (« no unique or exclusion constraint matching the ON CONFLICT specification »), erreur déjà payée une fois ;
 *   ② `NOT EXISTS (… origine = 'manuel')` — 🔴 LE CHOIX MANUEL N'EST JAMAIS RECOUVERT, même par une catégorie
 *      d'une autre portée. Le `DO NOTHING` seul ne suffirait pas : il protège (adresse, MÊME lot), pas une adresse
 *      rangée `independant` à la main que la règle voudrait reposer sur un bien ;
 *   ③ les indépendants partent avec `lot_cle = NULL`, et la base l'exige (`_portee_chk`).
 */
async function ecrireCategories(paires: readonly Paire[]): Promise<number> {
  /* UNE catégorie par (adresse, lot) — et UNE SEULE, globale, par indépendant. */
  const vues = new Set<string>();
  const payload: { adresse: string; lot_cle: string | null; categorie: string; origine: string }[] = [];
  for (const p of paires) {
    const lot = p.categorie === 'independant' ? null : p.lotCle;
    const cle = `${p.adresse}|${lot ?? ''}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    payload.push({ adresse: p.adresse, lot_cle: lot, categorie: p.categorie, origine: p.origine });
  }

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_partie_categorie (adresse, lot_cle, categorie, origine, pose_par_libelle)
     SELECT x.adresse, x.lot_cle, x.categorie, x.origine, $2
       FROM jsonb_to_recordset($1::jsonb)
         AS x(adresse text, lot_cle text, categorie text, origine text)
      WHERE NOT EXISTS (
        SELECT 1 FROM gestion_partie_categorie m
         WHERE m.retire_le IS NULL AND m.origine = 'manuel' AND m.adresse = x.adresse)
     ON CONFLICT (adresse, coalesce(lot_cle, '')) WHERE retire_le IS NULL DO NOTHING
     RETURNING id`,
    [JSON.stringify(payload), AUTEUR]);
  return rows.length;
}

/**
 * LES CARTES. Même précautions, et une de plus : AUCUNE carte pour un indépendant ni pour un « à répartir » —
 * `cote` est `null` pour eux, et ils sont écartés avant d'arriver ici.
 */
async function ecrireCartes(paires: readonly Paire[]): Promise<number> {
  const payload = paires
    .filter((p) => p.cote !== null)
    .map((p) => ({ lot_cle: p.lotCle, cote: p.cote as string, adresse: p.adresse, nom: p.nom }));

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_contact_carte (lot_cle, cote, adresse, nom, origine, cree_par_libelle)
     SELECT x.lot_cle, x.cote, x.adresse, x.nom, 'auto', $2
       FROM jsonb_to_recordset($1::jsonb) AS x(lot_cle text, cote text, adresse text, nom text)
      WHERE NOT EXISTS (
        SELECT 1 FROM gestion_contact_carte m
         WHERE m.retire_le IS NULL AND m.origine = 'manuel'
           AND m.lot_cle = x.lot_cle AND m.cote = x.cote AND m.adresse = x.adresse)
     ON CONFLICT (lot_cle, cote, adresse) WHERE retire_le IS NULL DO NOTHING
     RETURNING id`,
    [JSON.stringify(payload), AUTEUR]);
  return rows.length;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LA PASSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  const [cat, carte] = await Promise.all([partieCategorieDisponible(), contactCarteDisponible()]);
  if (!cat || !carte) {
    console.error('🔴 la migration 304 n’est pas appliquée : `gestion_partie_categorie` et/ou '
      + '`gestion_contact_carte` n’existent pas.');
    console.error('   Rien n’a été lu, rien n’a été écrit.');
    process.exit(1);
  }

  const paires = await lirePaires();
  const parCat = (c: Categorie): Paire[] => paires.filter((p) => p.categorie === c);
  const independants = parCat('independant');
  const cartesProp = parCat('proprietaire');
  const cartesLoc = parCat('locataire');
  const aRepartir = parCat('a_repartir');
  const biensAvecCarte = new Set([...cartesProp, ...cartesLoc].map((p) => p.lotCle));

  dire('══ REPRISE DES CATÉGORIES DE PARTIES — lot HISTORIQUE-BIEN-1, migration 304 ════════════════════════');
  dire(`${APPLIQUER ? '🔴 APPLICATION' : 'SIMULATION (aucune écriture)'} · ${new Date().toISOString()}`);
  dire();
  dire('LE POINT DE DÉPART — paires (bien, adresse) à ranger :');
  ecart('paires', paires.length, ATTENDU.paires);
  ecart('adresses distinctes', new Set(paires.map((p) => p.adresse)).size, ATTENDU.adresses);
  ecart('biens concernés', new Set(paires.map((p) => p.lotCle)).size, ATTENDU.biens);
  dire();
  dire('LA RÈGLE À TROIS ÉTAGES :');
  ecart('① indépendants proposés', new Set(independants.map((p) => p.adresse)).size, ATTENDU.independants);
  ecart('   dont paires expliquées', independants.length, ATTENDU.pairesIndependantes);
  ecart('② cartes de contact', cartesProp.length + cartesLoc.length, ATTENDU.cartes);
  ecart('   dont côté propriétaire', cartesProp.length, ATTENDU.cartesProprietaire);
  ecart('   dont côté locataire', cartesLoc.length, ATTENDU.cartesLocataire);
  ecart('   biens recevant une carte', biensAvecCarte.size, ATTENDU.biensAvecCarte);
  ecart('③ « à répartir »', aRepartir.length, ATTENDU.aRepartir);
  ecart('   sur combien de biens', new Set(aRepartir.map((p) => p.lotCle)).size, ATTENDU.biensARepartir);
  dire();
  dire(`⚠️ AUCUNE CARTE POUR UN INDÉPENDANT NI POUR UN « À RÉPARTIR » : ${independants.length + aRepartir.length} `
    + 'paires rangées sans carte.');
  dire(`⚠️ Les cartes naissent avec la mention « ${LIBELLE_CARTE_AUTO} ».`);
  dire(`⚠️ ${cartesProp.concat(cartesLoc).filter((p) => p.nom === null).length} carte(s) naîtront SANS NOM `
    + '(aucun en-tête ne porte de nom d’affichage pour cette adresse) — c’est le cas que la mention couvre.');
  dire();

  dire('LES INDÉPENDANTS LES PLUS PRÉSENTS (étage ①) :');
  const parAdresse = new Map<string, number>();
  for (const p of independants) parAdresse.set(p.adresse, p.biensDeLAdresse);
  for (const [adresse, n] of [...parAdresse.entries()].sort((a, b) => b[1] - a[1]).slice(0, EXEMPLES_MAX)) {
    dire(`  ${String(n).padStart(3)} biens · ${adresse}`);
  }
  dire();

  dire('LES BIENS QUI REÇOIVENT LE PLUS DE CARTES :');
  const parBien = new Map<string, { prop: number; loc: number; rep: number; ind: number }>();
  for (const p of paires) {
    const e = parBien.get(p.lotCle) ?? { prop: 0, loc: 0, rep: 0, ind: 0 };
    if (p.categorie === 'proprietaire') e.prop += 1;
    else if (p.categorie === 'locataire') e.loc += 1;
    else if (p.categorie === 'a_repartir') e.rep += 1;
    else e.ind += 1;
    parBien.set(p.lotCle, e);
  }
  for (const [lot, e] of [...parBien.entries()]
    .sort((a, b) => (b[1].prop + b[1].loc) - (a[1].prop + a[1].loc)).slice(0, 8)) {
    dire(`  lot ${lot.padEnd(6)} propriétaire ${String(e.prop).padStart(3)} · locataire ${String(e.loc).padStart(3)}`
      + ` · à répartir ${String(e.rep).padStart(3)} · indépendants vus ${String(e.ind).padStart(3)}`);
  }
  dire();

  dire('QUELQUES CARTES QUI SERAIENT CRÉÉES :');
  for (const p of [...cartesProp, ...cartesLoc].slice(0, EXEMPLES_MAX)) {
    dire(`  lot ${p.lotCle.padEnd(6)} ${p.cote === 'proprietaire' ? 'propriétaire' : 'locataire   '} · `
      + `${p.adresse.padEnd(40)} ${p.nom ?? '(nom absent de l’en-tête)'}`);
  }
  dire();
  dire('QUELQUES « À RÉPARTIR », ET LEUR RAISON :');
  for (const p of aRepartir.slice(0, EXEMPLES_MAX)) {
    dire(`  lot ${p.lotCle.padEnd(6)} ${p.adresse.padEnd(40)} `
      + (p.parleAvecProprietaire && p.parleAvecLocataire ? 'parle avec les deux' : 'parle avec aucun des deux'));
  }
  dire();

  if (!APPLIQUER) {
    dire('Aucune écriture. Relancer avec --appliquer pour ranger.');
    journal();
    return;
  }

  /* 🔴 L'ÉCRITURE. Les catégories d'abord : une carte sans sa catégorie serait un affichage sans jugement. */
  const nbCat = await ecrireCategories(paires);
  const nbCartes = await ecrireCartes(paires);
  dire(`🔴 ${nbCat} catégorie(s) posée(s) · ${nbCartes} carte(s) créée(s) PAR CETTE PASSE.`);
  dire('   (Les lignes déjà présentes et les rangements manuels ont été laissés intacts : relancer ne double rien.)');

  /**
   * 🔴 ET L'ÉTAT TOTAL, APRÈS LA PASSE. Le compte ci-dessus dit ce que CETTE passe a écrit — zéro sur une relance,
   * ce qui est la preuve de l'idempotence mais ne dit rien de ce qui est rangé. Celui-ci dit la vérité du moment,
   * quel que soit le nombre de passes jouées avant.
   */
  const { rows: total } = await query<{ categorie: string; origine: string; n: string }>(
    `SELECT categorie, origine, count(*)::text AS n FROM gestion_partie_categorie
      WHERE retire_le IS NULL GROUP BY 1, 2 ORDER BY 1, 2`);
  const { rows: totalCartes } = await query<{ cote: string; origine: string; n: string }>(
    `SELECT cote, origine, count(*)::text AS n FROM gestion_contact_carte
      WHERE retire_le IS NULL GROUP BY 1, 2 ORDER BY 1, 2`);
  dire();
  dire('ÉTAT TOTAL APRÈS LA PASSE — lignes vivantes en base :');
  for (const r of total) dire(`  catégorie ${r.categorie.padEnd(13)} ${r.origine.padEnd(8)} ${r.n.padStart(5)}`);
  for (const r of totalCartes) dire(`  carte     ${r.cote.padEnd(13)} ${r.origine.padEnd(8)} ${r.n.padStart(5)}`);

  /* LE JOURNAL EN BASE, pour qu'on sache dans six mois d'où viennent ces lignes. Au mieux-effort : son échec ne
     défait pas une reprise qui a eu lieu. */
  try {
    await query(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('rattachement', 0, 'reprise_categories_parties', $1, $2, $3, NULL, $4)`,
      [
        `${paires.length} paire(s) (bien, adresse) à ranger`,
        `${nbCat} catégorie(s) · ${nbCartes} carte(s)`,
        'Reprise des catégories de parties (migration 304), règle à trois étages : plusieurs biens → indépendant '
          + 'PROPOSÉ et GLOBAL (jamais rattaché à un bien, jamais utilisé pour l’automatisation) ; un seul bien → '
          + 'côté propriétaire ou locataire selon la conversation ; les deux ou aucun → à répartir. Aucune ligne '
          + 'origine=manuel touchée. Aucune suppression.',
        MOTIF,
      ]);
  } catch (e) {
    console.error('[reprise-categories] bilan NON journalisé', e);
  }
  journal();
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
