/**
 * ══ 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — CE QUE LE TEXTE DES MAILS NOMME, SUR TOUT L'EXISTANT ════════════════
 *
 * Demande d'Arno : « Calcule ces propositions pour les mails “À rattacher”. Fais d'abord une SIMULATION : nombre
 * de mails concernés, nombre de propositions, 20 exemples tirés au hasard avec l'extrait, et la part des cas
 * douteux. Si la simulation est propre, applique-la. »
 *
 *   npm run gestion:propositions:contenu                 → SIMULATION : elle compte et montre, elle n'écrit rien
 *   npm run gestion:propositions:contenu -- --appliquer   → elle réexamine les conversations concernées
 *   npm run gestion:propositions:contenu -- --limite=500  → bornée, pour un essai
 *
 * ═══ 🔴 CE QU'ELLE N'ÉCRIT JAMAIS ══════════════════════════════════════════════════════════════════════════════
 *
 * AUCUN LIEN CONFIRMÉ. Une correspondance de contenu est TOUJOURS une proposition décochée — c'est la règle
 * absolue d'Arno, tenue par le module pur (`cas: 'e'`, `certitude: 'a_trancher'`, `preCoche: false`) et vérifiée
 * ici une seconde fois : la commande compte les rattachements confirmés AVANT et APRÈS, et s'arrête en erreur si
 * le chiffre a bougé d'une unité.
 *
 * ⚠️ L'ÉCRITURE PASSE PAR `examinerFilsPrecis`, le seul chemin d'écriture du moteur — avec ses garde-fous : un
 * lien posé à la main n'est jamais touché, un candidat rejeté ne ressuscite pas.
 */
import { query } from '../lib/db/client';
import { chargerAnnuaireContenu } from '../lib/gestion/annuaireContenuRepo';
import { corpsLisible } from '../lib/gestion/htmlMail';
import { personnesDansLeTexte, type CorrespondanceContenu } from '../lib/gestion/personnesDansLeTexte';
import { CORPS_CHERCHABLE_MAX, texteDuContenu } from '../lib/gestion/propositionsBien';
import {
  COMPTES_VIDES, chargerLibelles, examinerFilsPrecis, type ComptesPasse,
} from '../lib/gestion/rattachementRepo';
import { rattachementsDisponibles } from '../lib/gestion/schema';

const P = '  ';
const EXEMPLES = 20;

/** Les mails « À rattacher » : ni spam, ni corbeille, et aucun lien CONFIRMÉ sur un bien. */
const SQL_A_RATTACHER = `
  SELECT m.id::text, m.fil_id::text AS fil_id, m.objet,
         left(coalesce(m.corps_texte, ''), 4000) AS corps,
         left(coalesce(m.corps_html, ''), 60000) AS html
    FROM gestion_message m
   WHERE m.spam_le IS NULL AND m.corbeille_le IS NULL
     AND NOT EXISTS (SELECT 1 FROM gestion_rattachement r
                      WHERE r.message_id = m.id AND r.statut = 'confirme' AND r.cible_sorte = 'lot')
   ORDER BY m.id`;

async function confirmes(): Promise<number> {
  const { rows } = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM gestion_rattachement WHERE statut = 'confirme'");
  return rows[0]?.n ?? 0;
}

async function main(): Promise<void> {
  const appliquer = process.argv.includes('--appliquer');
  const limite = Number(process.argv.find((a) => a.startsWith('--limite='))?.slice(9) ?? 0);
  if (!(await rattachementsDisponibles())) { console.error('Migration 257 absente.'); process.exit(1); }

  const annuaire = await chargerAnnuaireContenu();
  console.log(`\nANNUAIRE : ${annuaire.personnes.length} personnes, `
    + `${annuaire.personnes.filter((p) => p.lots.length > 0).length} avec au moins un bien actif, `
    + `${(annuaire.motsExclus ?? []).length} mots de la maison écartés.`);

  const { rows } = await query<{
    id: string; fil_id: string | null; objet: string | null; corps: string | null; html: string | null;
  }>(SQL_A_RATTACHER + (limite > 0 ? ` LIMIT ${limite}` : ''));
  console.log(`${P}mails « À rattacher » examinés : ${rows.length}`);

  // ── LA SIMULATION : on calcule tout, on n'écrit rien ────────────────────────────────────────────────────────
  const touches: { id: number; fil: number | null; c: CorrespondanceContenu[] }[] = [];
  let propositions = 0;
  const parFacon = new Map<string, number>();
  for (const m of rows) {
    const texte = texteDuContenu({
      objet: m.objet,
      corps: corpsLisible(m.corps, m.html).slice(0, CORPS_CHERCHABLE_MAX),
    });
    const c = personnesDansLeTexte(texte, annuaire);
    if (c.length === 0) continue;
    touches.push({ id: Number(m.id), fil: m.fil_id === null ? null : Number(m.fil_id), c });
    for (const x of c) {
      propositions += Math.min(5, x.personne.lots.length);
      parFacon.set(x.par, (parFacon.get(x.par) ?? 0) + 1);
    }
  }

  console.log('\nCE QUE LE CONTENU DONNERAIT');
  console.log(`${P}mails concernés        ${touches.length}`);
  console.log(`${P}propositions (biens)   ${propositions}`);
  for (const [k, v] of [...parFacon].sort((a, b) => b[1] - a[1])) {
    console.log(`${P}  par ${k.padEnd(14)} ${v}`);
  }
  /**
   * 🔴 LA PART DES CAS DOUTEUX, ET CE QUE J'APPELLE DOUTEUX. Les quatre façons ne se valent pas : une ADRESSE ou
   * un TÉLÉPHONE sont des identités — on ne se trompe pas. Un NOM COMPLET (deux mots) est très sûr. Un NOM RARE
   * (un seul mot, unique dans l'annuaire, cité avec une majuscule) est le seul qui repose sur une ressemblance :
   * c'est lui que je compte comme douteux, et lui seul.
   */
  const douteux = parFacon.get('nom_rare') ?? 0;
  const total = [...parFacon.values()].reduce((a, b) => a + b, 0);
  console.log(`${P}🔴 cas douteux (nom rare seul) ${douteux} sur ${total} `
    + `(${total === 0 ? 0 : Math.round((douteux / total) * 100)} %)`);

  // ── 20 EXEMPLES TIRÉS AU HASARD ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${EXEMPLES} EXEMPLES TIRÉS AU HASARD`);
  const melange = [...touches].sort(() => Math.random() - 0.5).slice(0, EXEMPLES);
  for (const t of melange) {
    for (const x of t.c.slice(0, 2)) {
      console.log(`${P}mail ${String(t.id).padEnd(6)} ${x.par.padEnd(12)} ${x.personne.nom.padEnd(32)} `
        + `${x.personne.lots.length} bien(s)`);
      console.log(`${P}       « ${x.extrait} »`);
    }
  }

  if (!appliquer) {
    console.log('\n🔵 SIMULATION — rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }

  // ── L'APPLICATION ───────────────────────────────────────────────────────────────────────────────────────────
  const avant = await confirmes();
  const fils = [...new Set(touches.map((t) => t.fil).filter((f): f is number => f !== null))];
  console.log(`\n🔴 RÉEXAMEN de ${fils.length} conversation(s)… (rattachements confirmés avant : ${avant})`);
  const comptes: ComptesPasse = { ...COMPTES_VIDES };
  const libelles = await chargerLibelles();
  const PAQUET = 200;
  for (let i = 0; i < fils.length; i += PAQUET) {
    await examinerFilsPrecis(fils.slice(i, i + PAQUET), libelles, comptes, true);
    process.stdout.write(`${P}${Math.min(i + PAQUET, fils.length)} / ${fils.length}\r`);
  }

  const apres = await confirmes();
  const { rows: posees } = await query<{ n: number }>(
    "SELECT count(*)::int AS n FROM gestion_rattachement WHERE statut = 'propose' AND regle = 'e'");
  console.log(`\n\nAPRÈS`);
  console.log(`${P}propositions « contenu » vivantes  ${posees[0]?.n ?? 0}`);
  console.log(`${P}messages réexaminés                ${comptes.messagesVus}`);
  console.log(`${P}candidats écrits                   ${comptes.candidatsEcrits}`);
  console.log(`${P}liens retirés                      ${comptes.liensRetires}`);
  console.log(avant === apres
    ? `\n✅ rattachements confirmés : ${avant} → ${apres} (aucun lien créé par le contenu)`
    : `\n🔴 ATTENTION : les rattachements confirmés ont bougé (${avant} → ${apres})`);
  if (avant !== apres) process.exit(1);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
