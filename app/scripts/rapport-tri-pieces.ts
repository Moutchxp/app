/**
 * CLI `gestion:tri:rapport` — MODULE « GESTION », LOT DRIVE-1 : LE RAPPORT DE TRI À BLANC.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 AUCUNE COPIE, AUCUNE ÉCRITURE. Cette commande LIT la base (pièces jointes + annuaire), applique le moteur de
 * tri (`triPieces`, fonction pure) et écrit DEUX FICHIERS SUR LE BUREAU. Elle ne touche ni à Drive, ni à MinIO, ni
 * à la base. C'est ce qui permet à Arno de relire 26 000 décisions AVANT qu'un seul octet ne bouge.
 *
 * 🔒 LES FICHIERS PRODUITS CONTIENNENT DES DONNÉES PERSONNELLES (expéditeurs, objets). Ils vivent HORS du dépôt,
 * sur le Bureau, et ne sont jamais commités.
 *
 * Usage :
 *   npm run gestion:tri:rapport
 *   npm run gestion:tri:rapport -- --sortie=/Users/…/Desktop/rapport-tri-pieces
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { annuaireDisponible } from '../lib/gestion/schema';
import { cheminDestination, trierPieces, type Decision } from '../lib/gestion/triPieces';
import {
  ADRESSE_AGENCE_DEFAUT, chargerContexteTri, type PieceAvecTaille,
} from '../lib/gestion/triPiecesRepo';

const P = '[gestion:tri:rapport]';
export const SORTIE_DEFAUT = join(homedir(), 'Desktop', 'rapport-tri-pieces');

/** Débit de copie supposé pour l'estimation du lot 2. SUPPOSÉ, pas mesuré — le rapport le dit. */
export const DEBIT_SUPPOSE_MO_S = 2.5;

/**
 * 🔴 L'ADRESSE DE L'AGENCE est définie dans `triPiecesRepo` — le MÊME endroit que pour la copie réelle. La
 * ré-exporter ici plutôt que de la redéclarer garantit que le rapport et la copie excluent exactement la même.
 */
export { ADRESSE_AGENCE_DEFAUT };

export function tailleLisible(octets: number): string {
  if (octets >= 1024 ** 3) return `${(octets / 1024 ** 3).toFixed(1)} Go`;
  if (octets >= 1024 ** 2) return `${(octets / 1024 ** 2).toFixed(0)} Mo`;
  return `${(octets / 1024).toFixed(0)} Ko`;
}

/** Une durée en secondes, dite en français. PUR. */
export function dureeLisible(secondes: number): string {
  const h = Math.floor(secondes / 3600);
  const m = Math.round((secondes % 3600) / 60);
  if (h === 0) return `${Math.max(1, m)} min`;
  return `${h} h ${String(m).padStart(2, '0')}`;
}

/** Échappe une valeur pour un CSV à point-virgule. PUR. */
export function csv(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const sortie = argv.find((a) => a.startsWith('--sortie='))?.slice('--sortie='.length) ?? SORTIE_DEFAUT;
  const adresseAgence = argv.find((a) => a.startsWith('--adresse-agence='))?.slice('--adresse-agence='.length)
    ?? ADRESSE_AGENCE_DEFAUT;

  if (!(await annuaireDisponible())) {
    console.error(`\n${P} ❌ L’annuaire n’est pas installé (migration 253). Rien à rapprocher.\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n${P} lecture de l’annuaire et des pièces (même chargement que la copie réelle)…`);
  const ctx = await chargerContexteTri(adresseAgence);
  console.log(`${P}   ${ctx.annuaire.contacts.length} contacts · ${ctx.annuaire.lots.length} lots · `
    + `${ctx.annuaire.occupations.length} baux · ${ctx.annuaire.proprietaires.length} propriétaires`);
  console.log(`${P}   adresse de l’agence EXCLUE des rapprochements par adresse : « ${adresseAgence} »`);
  console.log(`${P}   ${ctx.pieces.length} pièces`);

  console.log(`${P} tri (aucune copie)…`);
  const decisions = trierPieces(ctx.pieces, ctx.annuaire);

  const pieces = ctx.pieces;
  const tailles = new Map(ctx.pieces.map((p) => [p.pieceId, p.taille]));
  const nomsBiens = ctx.nomsBiens;
  const nomsProps = ctx.nomsProprietaires;

  mkdirSync(sortie, { recursive: true });
  ecrireCsv(join(sortie, 'decisions.csv'), decisions, pieces, tailles, nomsBiens, nomsProps);
  ecrireRapport(join(sortie, 'RAPPORT.md'), decisions, pieces, tailles, nomsBiens, nomsProps);

  console.log('');
  console.log(`${P} ✅ ${join(sortie, 'RAPPORT.md')}`);
  console.log(`${P} ✅ ${join(sortie, 'decisions.csv')}`);
}

// ── ÉCRITURES (sur le Bureau, jamais dans le dépôt) ───────────────────────────────────────────────────────────────

function ecrireCsv(
  chemin: string, decisions: readonly Decision[], pieces: readonly PieceAvecTaille[],
  tailles: ReadonlyMap<number, number>, biens: ReadonlyMap<string, string>, props: ReadonlyMap<string, string>,
): void {
  const parPiece = new Map(pieces.map((p) => [p.pieceId, p]));
  const l: string[] = ['piece_id;message_id;date;expediteur;objet;taille_octets;stockee;destination;regle;confiance;motif'];
  for (const d of decisions) {
    const p = parPiece.get(d.pieceId);
    l.push([
      d.pieceId, d.messageId, (p?.date ?? '').slice(0, 10), csv(p?.expediteur), csv((p?.objet ?? '').slice(0, 200)),
      tailles.get(d.pieceId) ?? 0, d.stockee ? 'oui' : 'non',
      csv(cheminDestination(d.destination, biens, props)), d.regle, d.confiance, csv(d.motif),
    ].join(';'));
  }
  writeFileSync(chemin, `﻿${l.join('\n')}\n`, 'utf8');
}

function ecrireRapport(
  chemin: string, decisions: readonly Decision[], pieces: readonly PieceAvecTaille[],
  tailles: ReadonlyMap<number, number>, biens: ReadonlyMap<string, string>, props: ReadonlyMap<string, string>,
): void {
  const parPiece = new Map(pieces.map((p) => [p.pieceId, p]));
  const octets = (d: Decision): number => tailles.get(d.pieceId) ?? 0;
  const total = decisions.reduce((n, d) => n + octets(d), 0);

  const parSorte = { bien: [0, 0], proprietaire: [0, 0], non_rattache: [0, 0] };
  const parRegle: Record<string, [number, number]> = { a: [0, 0], b: [0, 0], c: [0, 0], d: [0, 0] };
  const parConfiance: Record<string, number> = { haute: 0, moyenne: 0, basse: 0 };
  const chargeBien = new Map<string, [number, number]>();
  const chargeProp = new Map<string, [number, number]>();
  const nonRattaches: Decision[] = [];
  const sansContenu: Decision[] = [];

  for (const d of decisions) {
    const o = octets(d);
    parSorte[d.destination.sorte][0] += 1;
    parSorte[d.destination.sorte][1] += o;
    parRegle[d.regle][0] += 1;
    parRegle[d.regle][1] += o;
    parConfiance[d.confiance] += 1;
    if (!d.stockee) sansContenu.push(d);
    if (d.destination.sorte === 'bien') {
      const c = chargeBien.get(d.destination.cle) ?? [0, 0];
      chargeBien.set(d.destination.cle, [c[0] + 1, c[1] + o]);
    } else if (d.destination.sorte === 'proprietaire') {
      const c = chargeProp.get(d.destination.cle) ?? [0, 0];
      chargeProp.set(d.destination.cle, [c[0] + 1, c[1] + o]);
    } else {
      nonRattaches.push(d);
    }
  }

  const top = (m: Map<string, [number, number]>, noms: ReadonlyMap<string, string>, n: number): string[] => {
    const l = [...m.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, n);
    return l.map(([cle, [c, o]], i) => `| ${i + 1} | ${noms.get(cle) ?? cle} | ${c} | ${tailleLisible(o)} |`);
  };

  const pct = (n: number): string => `${((n / Math.max(1, decisions.length)) * 100).toFixed(1)} %`;
  const secondes = total / (DEBIT_SUPPOSE_MO_S * 1024 * 1024);

  const md = `# Tri des pièces jointes — RAPPORT À BLANC

**Aucune pièce n'a été copiée, déplacée ni modifiée.** Cette passe a LU la base et appliqué le moteur de tri ;
elle n'a écrit que ce fichier et \`decisions.csv\`, sur le Bureau, hors du dépôt. Relevé le
${new Date().toLocaleString('fr-FR')}.

## Les chiffres clés

| | Pièces | Volume |
|---|---:|---:|
| **Total** | **${decisions.length}** | **${tailleLisible(total)}** |
| Vers un BIEN (« En attente » du logement) | ${parSorte.bien[0]} (${pct(parSorte.bien[0])}) | ${tailleLisible(parSorte.bien[1])} |
| Vers un PROPRIÉTAIRE (« En attente » du client) | ${parSorte.proprietaire[0]} (${pct(parSorte.proprietaire[0])}) | ${tailleLisible(parSorte.proprietaire[1])} |
| Vers « 00 Non rattachés » | ${parSorte.non_rattache[0]} (${pct(parSorte.non_rattache[0])}) | ${tailleLisible(parSorte.non_rattache[1])} |

**Par règle** — l'ordre est celui de la décision : on n'essaie la suivante que si la précédente a échoué.

| Règle | Ce qu'elle regarde | Pièces | Volume |
|---|---|---:|---:|
| **a** | les ADRESSES e-mail, comparées à l'annuaire | ${parRegle.a[0]} (${pct(parRegle.a[0])}) | ${tailleLisible(parRegle.a[1])} |
| **b** | le MÊME ÉCHANGE : hérite de ses voisins | ${parRegle.b[0]} (${pct(parRegle.b[0])}) | ${tailleLisible(parRegle.b[1])} |
| **c** | les RENFORTS : carte d'événement, adresse citée, nom dans l'objet | ${parRegle.c[0]} (${pct(parRegle.c[0])}) | ${tailleLisible(parRegle.c[1])} |
| **d** | rien de reconnaissable → « 00 Non rattachés / AAAA / MM » | ${parRegle.d[0]} (${pct(parRegle.d[0])}) | ${tailleLisible(parRegle.d[1])} |

**Par niveau de confiance** : haute ${parConfiance.haute} · moyenne ${parConfiance.moyenne} · basse ${parConfiance.basse}.
Une confiance basse n'est pas une erreur : c'est une décision qui mérite un œil (mail hors période d'un bail,
adresse partagée par plusieurs lots, nom trouvé dans un objet).

## Les 20 biens les plus chargés

| # | Bien | Pièces | Volume |
|---:|---|---:|---:|
${top(chargeBien, biens, 20).join('\n') || '| — | *(aucun)* | 0 | 0 |'}

## Les 20 propriétaires les plus chargés

| # | Propriétaire | Pièces | Volume |
|---:|---|---:|---:|
${top(chargeProp, props, 20).join('\n') || '| — | *(aucun)* | 0 | 0 |'}

## 30 exemples de « non rattachés » — à lire pour voir ce qui manque

Ces pièces n'ont pu être rattachées par aucune règle. Elles ne sont pas perdues : elles iront dans
« 00 Non rattachés / AAAA / MM ». Si un expéditeur revient souvent ci-dessous, c'est sans doute une adresse
à ajouter dans WIPPIMMO.

| Date | Expéditeur | Objet |
|---|---|---|
${nonRattaches.slice(0, 30).map((d) => {
    const p = parPiece.get(d.pieceId);
    const objet = (p?.objet ?? '(sans objet)').replace(/\|/g, '/').slice(0, 90);
    return `| ${(p?.date ?? '').slice(0, 10)} | ${(p?.expediteur ?? '?').replace(/\|/g, '/')} | ${objet} |`;
  }).join('\n') || '| — | *(aucun)* | — |'}

**Les expéditeurs les plus fréquents parmi les non rattachés** (ce sont eux qu'il serait le plus rentable
d'ajouter à l'annuaire) :

${expediteursFrequents(nonRattaches, parPiece).map((e) => `- ${e.adresse} — ${e.compte} pièces`).join('\n') || '- *(aucun)*'}

## Pièces sans contenu stocké

**${sansContenu.length}** pièces n'ont pas leurs octets chez nous (refusées à la capture, ou jamais téléchargées).
Elles sont DÉCIDÉES comme les autres — leur destination est calculée — mais il n'y aura rien à copier. Elles sont
listées dans \`decisions.csv\` avec \`stockee = non\` : aucune n'est perdue.

## Temps estimé de la copie (lot suivant)

**SUPPOSÉ.** ${tailleLisible(total)} à copier, à un débit supposé de ${DEBIT_SUPPOSE_MO_S} Mo/s vers l'API Drive
(un fichier à la fois, avec la pause imposée par les quotas) : **environ ${dureeLisible(secondes)}**.

Ce chiffre est une estimation, pas une mesure : le débit réel dépend de la taille moyenne des fichiers (beaucoup
de petits fichiers coûtent plus cher que quelques gros, à volume égal) et du ralentissement que Google applique
au-delà de quelques dizaines d'écritures par seconde. À mesurer sur les 100 premières pièces du lot suivant.

## Ce que ce rapport ne dit pas

- **Aucun tri vers « Travaux », « Assurances » ou « Litige ».** Ces trois rubriques demandent de comprendre le
  CONTENU d'un document ; aucune règle mécanique ne sait le faire. Tout arrive dans un « En attente ».
- **Les décisions de confiance basse méritent un échantillon relu à la main** avant la copie.
- **Rien n'est figé** : ce rapport se rejoue à volonté, et changera si l'annuaire change.
`;

  writeFileSync(chemin, md, 'utf8');
}

function expediteursFrequents(
  decisions: readonly Decision[], parPiece: ReadonlyMap<number, PieceAvecTaille>,
): { adresse: string; compte: number }[] {
  const m = new Map<string, number>();
  for (const d of decisions) {
    const a = (parPiece.get(d.pieceId)?.expediteur ?? '').trim().toLowerCase();
    if (a !== '') m.set(a, (m.get(a) ?? 0) + 1);
  }
  return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15)
    .map(([adresse, compte]) => ({ adresse, compte }));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(async () => {
    const { closePool } = await import('../lib/db/client');
    await closePool();
  });
}
