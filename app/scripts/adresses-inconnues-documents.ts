/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-SUITE (point 4) — LA LISTE DES ADRESSES À COMPLÉTER DANS L'ANNUAIRE ════════════════
 *
 * DÉCISION D'ARNO (01/10/2026) : « ~/Desktop/adresses-inconnues-documents.csv, avec une ligne par adresse
 * inconnue : adresse (en clair, c'est pour Arno), nombre de documents, noms lus dans les objets, sous-types, rôle
 * probable (garant, conjoint, pro), fiche probable. Triée par nombre de documents décroissant, pour qu'il complète
 * l'annuaire. »
 *
 * 🔴 CE FICHIER SORT DU DÉPÔT, et c'est voulu : il porte des adresses personnelles en clair. Le dépôt n'en
 * conserve que le programme qui le fabrique.
 *
 * 🔴 LECTURE SEULE. Ce script n'écrit rien en base, jamais — pas même avec un drapeau.
 *
 *   npm run gestion:documents:adresses            → écrit ~/Desktop/adresses-inconnues-documents.csv
 *   npm run gestion:documents:adresses -- --vers <chemin>
 */
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  chargerAnnuaireFiches, documentsARanger, NOS_ADRESSES,
} from '../lib/gestion/documentsAutoRepo';
import {
  attribuer, estDocumentGarant, fichesProchesDe, indexerNoms, nomsPropresDans, sousTypeLisible,
  type FicheDestinataire,
} from '../lib/gestion/documentsAuto';
import { closePool } from '../lib/db/client';

/**
 * ══ LE RÔLE PROBABLE — UNE LECTURE, PAS UN VERDICT ═════════════════════════════════════════════════════════════
 *
 * Arno demande « garant, conjoint, pro ». Chacun se devine autrement, et aucun ne se prouve :
 *   · GARANT — ses documents sont des documents de garant (RMH21, RMH31, R21…). C'est le signe le plus sûr.
 *   · PRO — l'adresse porte un domaine d'entreprise, c'est-à-dire ni un fournisseur de messagerie grand public ni
 *     un nom de famille. On se contente de la liste des grands fournisseurs : tout le reste est « pro ? ».
 *   · CONJOINT — ses documents nomment une fiche dont l'adresse n'est pas la sienne. Quelqu'un reçoit le courrier
 *     d'un autre : conjoint, enfant, parent, mandataire.
 */
const GRAND_PUBLIC: readonly string[] = [
  'gmail.com', 'hotmail.com', 'hotmail.fr', 'outlook.com', 'outlook.fr', 'yahoo.com', 'yahoo.fr',
  'orange.fr', 'wanadoo.fr', 'free.fr', 'sfr.fr', 'laposte.net', 'icloud.com', 'me.com', 'live.fr',
  'bbox.fr', 'numericable.fr', 'aol.com', 'protonmail.com', 'proton.me', 'gmx.fr', 'msn.com',
];

interface Ligne {
  adresse: string;
  documents: number;
  noms: Set<string>;
  sousTypes: Map<string, number>;
  garant: number;
  fichesProbables: Map<string, FicheDestinataire>;
}

/** Une cellule de CSV, échappée selon RFC 4180 : guillemets doublés, cellule entourée dès qu'elle en a besoin. */
function cellule(v: string): string {
  const s = (v ?? '').replace(/\r?\n/g, ' ').trim();
  return /[";,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function role(l: Ligne): string {
  if (l.garant > 0) return l.garant === l.documents ? 'garant' : 'garant (en partie)';
  if (l.fichesProbables.size > 0) return 'conjoint / proche / mandataire';
  const domaine = l.adresse.split('@')[1] ?? '';
  return GRAND_PUBLIC.includes(domaine) ? 'particulier inconnu' : 'pro ?';
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--vers');
  const sortie = i >= 0 && process.argv[i + 1] !== undefined
    ? process.argv[i + 1]
    : join(homedir(), 'Desktop', 'adresses-inconnues-documents.csv');

  const annuaire = await chargerAnnuaireFiches();
  const indexNoms = indexerNoms(annuaire);
  const docs = await documentsARanger();

  const lignes = new Map<string, Ligne>();
  let examines = 0;
  for (const d of docs) {
    const a = attribuer({
      destinataires: d.destinataires, annuaire, nosAdresses: NOS_ADRESSES, objet: d.objet, indexNoms,
    });
    // 🔴 SEULEMENT LES NON RANGÉS : une adresse dont les documents trouvent leur fiche n'a rien à compléter.
    if (a.sorte !== 'non_attribue') continue;
    examines += 1;

    for (const brute of d.destinataires) {
      const adresse = (brute ?? '').trim().toLowerCase();
      if (adresse === '') continue;
      // ⚠️ NOS ADRESSES NE SONT PAS DES ADRESSES INCONNUES : les lister ferait du bruit en tête de tableau.
      if (NOS_ADRESSES.some((n) => (n.startsWith('@') ? adresse.endsWith(n) : adresse === n))) continue;
      // Une adresse que l'annuaire CONNAÎT n'est pas à compléter : le document a échoué pour une autre raison.
      if ((annuaire.get(adresse) ?? []).length > 0) continue;

      const l = lignes.get(adresse) ?? {
        adresse, documents: 0, noms: new Set<string>(), sousTypes: new Map<string, number>(),
        garant: 0, fichesProbables: new Map<string, FicheDestinataire>(),
      };
      l.documents += 1;
      if (estDocumentGarant(d.objet)) l.garant += 1;
      const st = sousTypeLisible(d.objet);
      l.sousTypes.set(st, (l.sousTypes.get(st) ?? 0) + 1);
      /**
       * 🔴 LES NOMS SE LISENT DANS L'OBJET, PAS DANS L'ANNUAIRE, et c'est tout l'intérêt de cette colonne. Un
       * objet qui nommerait une fiche CONNUE aurait déjà été rangé (décision n° 1) et ne serait pas ici : chercher
       * des fiches reconnues laisserait donc la colonne vide sur toutes les lignes. Ce qu'Arno veut lire, ce sont
       * les noms que l'annuaire IGNORE — « BAROUK Alexis » quand aucune fiche ne porte ce nom.
       */
      for (const nom of nomsPropresDans(d.objet)) {
        l.noms.add(nom);
        for (const f of fichesProchesDe(nom, indexNoms)) l.fichesProbables.set(`${f.sorte}:${f.cle}`, f);
      }
      lignes.set(adresse, l);
    }
  }

  const triees = [...lignes.values()].sort((a, b) => b.documents - a.documents
    || a.adresse.localeCompare(b.adresse));

  const csv = ['adresse;documents;noms lus dans les objets;sous-types;rôle probable;fiche probable'];
  for (const l of triees) {
    const sousTypes = [...l.sousTypes.entries()].sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s} (${n})`).join(', ');
    const noms = [...l.noms].join(' / ');
    const fiches = [...l.fichesProbables.values()].map((f) => `${f.sorte} ${f.libelle}`).join(' / ');
    csv.push([
      cellule(l.adresse), String(l.documents), cellule(noms), cellule(sousTypes),
      cellule(role(l)), cellule(fiches),
    ].join(';'));
  }

  // ⚠️ BOM UTF-8 : sans lui, Excel ouvre « Zélie » en « ZÃ©lie ». Le fichier est fait pour être ouvert, pas relu
  //   par un programme.
  writeFileSync(sortie, '﻿' + csv.join('\n') + '\n', 'utf8');

  console.log(`\n${examines} documents non rangés examinés`);
  console.log(`${triees.length} adresses inconnues, ${triees.reduce((a, b) => a + b.documents, 0)} documents`);
  console.log(`\nLES DIX PREMIÈRES`);
  for (const l of triees.slice(0, 10)) {
    console.log(`  ${String(l.documents).padStart(4)}  ${l.adresse.padEnd(34)}  ${role(l)}`);
  }
  console.log(`\n✅ écrit : ${sortie}`);
  await closePool();
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
