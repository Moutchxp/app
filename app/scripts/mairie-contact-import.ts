/**
 * CLI d'import du registre des e-mails de MAIRIES (chantier S5). Exécuté par `tsx` :  npm run mairie:contact:import
 *
 * SOURCE : annuaire de l'administration (DILA / service-public.fr), API Opendatasoft `api-lannuaire.service-public.fr`,
 * Licence Ouverte (Etalab-famille). Le seul contact municipal disponible est la MAIRIE (aucun « service urbanisme »).
 *
 * Modèle `commune-import` : agrégat téléchargé dans `data/mairie/` (LOCAL, git-ignoré), VÉRIFICATION DE COMPLÉTUDE
 * (toutes les communes du référentiel interrogées sans échec), import IDEMPOTENT. ⚠️ RÈGLE ABSOLUE : ne remplace JAMAIS
 * une adresse 'confirme', 'saisie_manuelle' ou 'reponse_mairie' (cf. `doitRemplacerDepuisAnnuaire`). N'écrit qu'un vrai
 * changement (journalisé). NE PRODUIT AUCUN ENVOI. LECTURE de `commune` (référentiel) ; écrit `mairie_contact(+journal)`.
 */
import 'dotenv/config';
import { createWriteStream, existsSync } from 'node:fs';
import { readFile, mkdir, rename, rm } from 'node:fs/promises';
import { query, closePool, withTransaction } from '../lib/db/client';
import {
  type Requete, type ContactExistant,
  extraireEmailMairie, doitRemplacerDepuisAnnuaire, ecrireContact, lireContact,
} from '../lib/sitadel/mairieContact';

const DOSSIER_LOCAL = 'data/mairie';
const FICHIER = `${DOSSIER_LOCAL}/annuaire.mairies.json`;
const API = 'https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records';

const q: Requete = <R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> =>
  query(text, params) as unknown as Promise<{ rows: R[] }>;

interface EntreeAnnuaire { code_insee: string; email: string | null }

/** Interroge l'annuaire pour une commune et renvoie l'e-mail de la mairie (ou null). Un échec réseau throw (repris par l'appelant). */
async function emailMairie(codeInsee: string): Promise<string | null> {
  const url = `${API}?where=${encodeURIComponent(`code_insee_commune="${codeInsee}"`)}&limit=100&select=nom,pivot,adresse_courriel`;
  const res = await fetch(url, { headers: { 'User-Agent': 'sansvisavis-mairie-contact' } });
  if (!res.ok) throw new Error(`annuaire HTTP ${res.status} pour ${codeInsee}`);
  const d = (await res.json()) as { results?: { pivot?: unknown; adresse_courriel?: string | null }[] };
  return extraireEmailMairie(d.results ?? []);
}

/** Télécharge l'agrégat (email mairie par commune) s'il manque, en vérifiant la complétude (toutes les communes couvertes). */
async function telecharger(codes: { code_insee: string; departement: string }[]): Promise<EntreeAnnuaire[]> {
  if (existsSync(FICHIER)) {
    try {
      const cache = JSON.parse(await readFile(FICHIER, 'utf8')) as EntreeAnnuaire[];
      if (Array.isArray(cache) && cache.length === codes.length) { console.log(`  ✓ complet, déjà présent : ${FICHIER}`); return cache; }
    } catch { /* cache illisible → on retélécharge */ }
  }
  console.log(`  ↓ interrogation de l'annuaire pour ${codes.length} communes …`);
  const entrees: EntreeAnnuaire[] = [];
  const CONC = 8;
  for (let i = 0; i < codes.length; i += CONC) {
    const lot = codes.slice(i, i + CONC);
    const res = await Promise.all(lot.map((x) => emailMairie(x.code_insee).then((email) => ({ code_insee: x.code_insee, email }))));
    entrees.push(...res);
  }
  if (entrees.length !== codes.length) throw new Error(`agrégat incomplet (${entrees.length}/${codes.length}) — import refusé`);
  const part = `${FICHIER}.part`;
  await new Promise<void>((ok, ko) => { const w = createWriteStream(part); w.on('error', ko); w.end(JSON.stringify(entrees), () => ok()); });
  await rename(part, FICHIER).catch(async () => { await rm(part, { force: true }); });
  console.log(`  ✓ complet : ${FICHIER}`);
  return entrees;
}

async function main(): Promise<void> {
  await mkdir(DOSSIER_LOCAL, { recursive: true });
  console.log('Mairie — annuaire de l’administration (DILA, Licence Ouverte)');
  const communes = (await q<{ code_insee: string; departement: string }>('SELECT code_insee, departement FROM commune ORDER BY code_insee')).rows;
  const entrees = await telecharger(communes);
  const emailParCode = new Map(entrees.map((e) => [e.code_insee, e.email]));

  // UPSERT respectant la règle de non-écrasement + journalisation (transaction par commune).
  let ecrits = 0;
  for (const c of communes) {
    const email = emailParCode.get(c.code_insee) ?? null;
    if (email === null) continue; // pas d'email annuaire → on ne crée rien (commune « sans destinataire »)
    const change = await withTransaction<boolean>(async (tx) => {
      const qt: Requete = <R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>;
      const existant: ContactExistant | null = await lireContact(qt, c.code_insee);
      if (!doitRemplacerDepuisAnnuaire(existant)) return false; // 'confirme' / 'saisie_manuelle' / 'reponse_mairie' → intouché
      const r = await ecrireContact(qt, { codeInsee: c.code_insee, email, source: 'annuaire', statut: 'presume', canal: 'email', motif: 'import annuaire', auteur: null });
      return r.change;
    });
    if (change) ecrits += 1;
  }

  // Bilan par département + communes sans destinataire.
  const bilan = await q<{ departement: string; avec: number; sans: number }>(
    `SELECT c.departement,
            count(*) FILTER (WHERE mc.email IS NOT NULL)::int AS avec,
            count(*) FILTER (WHERE mc.email IS NULL)::int AS sans
     FROM commune c LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
     GROUP BY c.departement ORDER BY c.departement`,
  );
  console.log(`\n${ecrits} contact(s) écrit(s)/mis à jour ce run.\nCouverture par département :`);
  for (const b of bilan.rows) console.log(`  ${b.departement} : ${b.avec} avec e-mail · ${b.sans} sans`);
  const sans = await q<{ code_insee: string; nom: string; departement: string }>(
    `SELECT c.code_insee, c.nom, c.departement FROM commune c LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
     WHERE mc.email IS NULL ORDER BY c.departement, c.code_insee`,
  );
  console.log(`\nCommunes SANS destinataire (${sans.rows.length}) :`);
  for (const s of sans.rows) console.log(`  ${s.code_insee} ${s.nom} (dép. ${s.departement})`);
}

void main()
  .catch((e) => { console.error('[mairie:contact:import] échec', e); process.exitCode = 1; })
  .finally(() => closePool());
