/**
 * CLI `gestion:adresses:relever` — MODULE « GESTION », LOT DRIVE-2-bis.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE FAIT : relève TOUTES les adresses de TOUS les messages (56 802), avec leur rôle — expéditeur,
 * destinataire, copie, répondre-à, et l'expéditeur d'origine des mails transférés — et note, pour chacune, ce que
 * l'annuaire en dit À LA DATE DU MAIL.
 *
 * 🔴 ELLE COUVRE LES MESSAGES SANS PIÈCE JOINTE AUTANT QUE LES AUTRES, et c'est le point. L'objectif des lots
 * suivants est de reconstituer l'historique COMPLET des échanges d'un logement : un mail sans pièce jointe en fait
 * partie autant qu'un autre. Cette table est écrite ici une fois, et servira longtemps.
 *
 * 🔒 LECTURE SEULE SUR LE COURRIER. Elle lit `gestion_message` et n'écrit que dans `gestion_message_adresse`. Ni
 * Gmail, ni Drive, ni MinIO ne sont touchés.
 *
 * IDEMPOTENTE ET REPRENABLE : la clé est (message, adresse, rôle) ; relancer met à jour sans doubler. Le curseur
 * est l'identifiant du message, donc une coupure ne coûte qu'un paquet.
 *
 * OPTIONS :
 *   --paquet=N    messages par paquet (500 par défaut)
 *   --limite=N    s'arrête après N messages (pour les essais)
 *   --recalculer  repart de zéro, y compris sur ce qui est déjà relevé (après un import d'annuaire)
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import '../lib/chargerEnv';
import { pathToFileURL } from 'node:url';
import { query, closePool } from '../lib/db/client';
import { adressesMessagesDisponibles } from '../lib/gestion/schema';
import {
  chargerAnnuaireAdresses, chiffresReleve, COMPTES_RELEVE_VIDE, curseurReleve, PAQUET_DEFAUT, releverPaquet,
} from '../lib/gestion/adressesRepo';
import { dureeFr } from '../lib/gestion/copiePieces';

const P = '[gestion:adresses:relever]';

export interface OptionsReleve { paquet: number; limite: number | null; recalculer: boolean }

/** Ce que la ligne de commande demande. PUR. */
export function lireOptions(argv: readonly string[]): OptionsReleve {
  const entier = (nom: string, defaut: number | null): number | null => {
    const a = argv.find((x) => x.startsWith(`--${nom}=`));
    if (a === undefined) return defaut;
    const n = Number(a.slice(nom.length + 3));
    return Number.isInteger(n) && n > 0 ? n : defaut;
  };
  return {
    paquet: entier('paquet', PAQUET_DEFAUT) ?? PAQUET_DEFAUT,
    limite: entier('limite', null),
    recalculer: argv.includes('--recalculer'),
  };
}

/** Un pourcentage lisible, sans division par zéro. PUR. */
export function pourcent(n: number, total: number): string {
  return total === 0 ? '—' : `${((n / total) * 100).toFixed(1)} %`;
}

async function principal(): Promise<void> {
  const o = lireOptions(process.argv.slice(2));
  console.log('');
  if (!(await adressesMessagesDisponibles())) {
    console.error(`${P} ❌ La migration 256 n’est pas appliquée : il n’y a nulle part où écrire la trace.`);
    console.error(`${P}    cd /Users/macbookprom4arnaud/sansvisavis/app && export $(grep -E '^DATABASE_URL=' .env | xargs)`);
    console.error(`${P}    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f db/migrations/256_gestion_arrivee_adresses.sql\n`);
    process.exitCode = 1;
    return;
  }

  const annuaire = await chargerAnnuaireAdresses();
  console.log(`${P} annuaire : ${annuaire.contacts.length} contacts · ${annuaire.occupations.length} baux`);
  console.log(`${P} adresses internes : ${annuaire.adresseGestion}, les domaines maison, `
    + `${annuaire.partenaires.length} partenaire(s) interne(s)`);

  const depart = o.recalculer ? 0 : await curseurReleve();
  if (depart > 0) console.log(`${P} reprise après le message ${depart}`);
  if (o.recalculer) console.log(`${P} 🔄 recalcul complet demandé : les lignes existantes seront mises à jour`);

  const c = { ...COMPTES_RELEVE_VIDE };
  const debut = Date.now();
  let curseur = depart;

  for (;;) {
    const suivant = await releverPaquet(curseur, o.paquet, annuaire, c);
    if (suivant === null) break;
    curseur = suivant;
    const ecoule = Date.now() - debut;
    console.log(`${P}   ${c.messagesVus} messages · ${c.adressesEcrites} adresses · `
      + `${c.reconnues} reconnues · ${c.transferts} transferts · ${dureeFr(ecoule)}`);
    if (o.limite !== null && c.messagesVus >= o.limite) {
      console.log(`${P} limite de ${o.limite} messages atteinte.`);
      break;
    }
  }

  const ch = await chiffresReleve();
  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_libelle)
     VALUES ('adresses_messages', $1, 'releve', $2, 'relevé automatique')`,
    [ch.messagesCouverts,
      `${c.messagesVus} messages parcourus, ${c.adressesEcrites} adresses écrites `
      + `(${ch.reconnues} reconnues par l’annuaire sur ${ch.adresses})`]);

  console.log('');
  console.log(`${P} ── RELEVÉ ── ${dureeFr(Date.now() - debut)}`);
  console.log(`${P} messages couverts .......... ${ch.messagesCouverts} / ${ch.messages} (${pourcent(ch.messagesCouverts, ch.messages)})`);
  console.log(`${P} adresses relevées .......... ${ch.adresses} · ${ch.distinctes} adresses distinctes`);
  console.log(`${P} dont internes .............. ${ch.internes} (${pourcent(ch.internes, ch.adresses)}) — jamais une clé`);
  console.log(`${P} reconnues par l’annuaire ... ${ch.reconnues} (${pourcent(ch.reconnues, ch.adresses)})`);
  console.log(`${P}   dont un LOT à la date .... ${ch.avecLot} (${pourcent(ch.avecLot, ch.adresses)})`);
  console.log(`${P} expéditeurs de transferts .. ${ch.transferts}`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void principal().then(closePool, async (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
    await closePool();
  });
}
