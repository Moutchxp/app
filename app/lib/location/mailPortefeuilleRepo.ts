import { randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { adresseApplication } from '../gestion/adresseApplication';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { messageIdDemande } from '../gestion/acceptationTache';
import { conditionCoordonneeVivante } from '../gestion/coordonneeVivante';
import { honorairesMensuels, tvaEnVigueur, type BaseHonoraires } from '../gestion/honorairesGestion';
import { lireReglages } from '../gestion/honorairesGestionRepo';
import { bailDisponible, sqlConditionsDe } from './bailRepo';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { familleDeCategorie, LIBELLE_FAMILLE, LIBELLE_TYPE_LOGEMENT, type TypeLogement } from './bienComplet';
import { LIBELLE_ORIGINE, LIBELLE_SOUS_ORIGINE, type OrigineArchivage, type Origine, type SousOrigine } from './archivage';
import {
  htmlMail, objetMail, texteMail, type DonneesMail, type LotMail, type ProprietaireMail, type SensMouvement, type TuileOrigine,
} from './mailPortefeuille';

/**
 * ══ 🔴🔴 LES MAILS D'ENTRÉE / SORTIE DU PORTEFEUILLE DE GESTION (Arno, 18/10/2026). IMPUR (base + envoi). ═══════════════
 *
 * « À chaque ENTRÉE ou SORTIE du portefeuille de gestion » :
 *   · SORTIE : archivage d'un propriétaire (avec ses biens) ou sortie d'un ou plusieurs biens — Location OU fiche commune ;
 *   · ENTRÉE : création d'un bien rattaché à un propriétaire « en gestion = Oui », réactivation d'un propriétaire ou d'un
 *     bien. Un bien en simple mandat de transaction (en gestion = Non) n'envoie RIEN.
 * DESTINATAIRES (dédoublonnés) : l'AUTEUR (e-mail de son compte), plus — action depuis la Location — tous les comptes actifs
 * qui ont le droit Gestion ; depuis la Gestion — tous ceux qui ont le droit Location (un administrateur a tous les droits).
 * LE CANAL : celui des mails de tâches (API Gmail de gestion@, `transportParDefaut` : factice sous les tests ; en RECETTE, le
 * verrou réseau intercepte l'envoi et le dépose dans la boîte de test — aucun envoi réel).
 * 🔴 APPELÉ APRÈS L'ÉCRITURE RÉUSSIE, ET JAMAIS BLOQUANT : rien ne lève ; un échec est journalisé et RENDU à l'appelant
 * (« enregistré, mais mail non envoyé »). Chaque tentative est écrite au journal (date, destinataires, objet).
 */

export interface EvenementPortefeuille {
  sens: SensMouvement;
  /** Entrée par réactivation (et non nouveau mandat). */
  reactivation?: boolean;
  /** Le propriétaire de la fiche (archivage, sortie de biens) ; sinon déduit des biens. */
  proprietaireId: number | null;
  /** Les biens touchés (logements ET annexes). */
  lotIds: readonly number[];
  origine: OrigineArchivage | null;
  /** Entrée par création : n'envoyer que si un des propriétaires est « en gestion = Oui ». */
  exigerEnGestion?: boolean;
  /** Ajouter les annexes des biens donnés (création : seul le logement est connu de l'appelant). */
  avecAnnexes?: boolean;
}

export interface IssueMail { envoye: boolean; ignore?: boolean; motif: string | null; destinataires: string[]; objet: string | null }

const ESSAI = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Les destinataires : l'auteur, puis les comptes actifs de l'AUTRE tuile ; dédoublonnés (casse ignorée). PUR. */
export function dedoublonner(liste: readonly (string | null | undefined)[]): string[] {
  const vus = new Set<string>(); const sortie: string[] = [];
  for (const brut of liste) {
    const e = (brut ?? '').trim().toLowerCase();
    if (!ESSAI.test(e) || vus.has(e)) continue;
    vus.add(e); sortie.push(e);
  }
  return sortie;
}

/** L'e-mail du compte de l'auteur (identifiant de connexion), ou `null` (voie de secours). */
export async function emailDeLAuteur(auteur: Auteur): Promise<{ email: string | null; nom: string }> {
  if (auteur.id !== null) {
    const { rows } = await query<{ identifiant: string; prenom: string | null; nom: string | null }>(
      'SELECT identifiant, prenom, nom FROM admin_utilisateur WHERE id = $1', [auteur.id]);
    if (rows[0] !== undefined) {
      const nom = [rows[0].prenom, rows[0].nom].filter((x) => x && x.trim() !== '').join(' ');
      return { email: ESSAI.test(rows[0].identifiant) ? rows[0].identifiant : null, nom: nom || rows[0].identifiant };
    }
  }
  return { email: ESSAI.test(auteur.libelle) ? auteur.libelle : null, nom: auteur.libelle };
}

/** Les comptes ACTIFS qui ont le droit de l'autre tuile (un administrateur les a tous). */
export async function destinatairesDe(tuile: TuileOrigine, emailAuteur: string | null): Promise<string[]> {
  const droit = tuile === 'Location' ? 'perm_gestion' : 'perm_location';
  const { rows } = await query<{ identifiant: string }>(
    `SELECT identifiant FROM admin_utilisateur WHERE actif AND (role = 'administrateur' OR ${droit} IS TRUE) ORDER BY id`);
  return dedoublonner([emailAuteur, ...rows.map((r) => r.identifiant)]);
}

const num = (s: string | null): number | null => (s === null ? null : Number(s));
const numeroLot = (w: string | null): string | null => (w === null || w.startsWith('app-') ? null : w);

/** Rassemble ce que le mail dit : propriétaires, lots (annexes, locataires, clôtures), valorisation (règles de l'écran Honoraires). */
export async function donneesDuMail(ev: EvenementPortefeuille, auteur: { nom: string; email: string | null }, tuile: TuileOrigine, quand: string): Promise<DonneesMail | null> {
  const ids = [...new Set(ev.lotIds)];
  if (ids.length === 0) return null;
  const avec = async (t: string, c: string): Promise<boolean> => colonneExisteMemo(t, c);
  const col = async (c: string, repli = 'NULL'): Promise<string> => ((await avec('gestion_annuaire_lot', c)) ? `lo.${c}` : repli);
  const { rows: lots } = await query<{ id: string; adresse: string | null; numero: string | null; categorie: string | null; type_logement: string | null;
    nature: string | null; surface: string | null; etage: string | null; porte: string | null; parent: string | null; proprietaire_id: string | null }>(
    `SELECT lo.id::text, nullif(concat_ws(', ', lo.adresse, lo.commune), '') AS adresse, lo.wippimmo_id AS numero,
            ${await col('categorie')}::text AS categorie, ${await col('type_logement')}::text AS type_logement, coalesce(lo.nature, lo.type_bien) AS nature,
            coalesce(${await col('surface_habitable_m2')}, ${await col('surface_carrez_m2')}, ${await col('surface_m2')})::text AS surface,
            ${await col('etage')}::text AS etage, ${await col('porte')}::text AS porte,
            (SELECT a.parent_id::text FROM gestion_lot_annexe a WHERE a.annexe_id = lo.id LIMIT 1) AS parent, lo.proprietaire_id::text
       FROM gestion_annuaire_lot lo WHERE lo.id = ANY($1::bigint[]) ORDER BY lo.adresse_normalisee NULLS LAST, lo.id`, [ids]);
  if (lots.length === 0) return null;
  const dans = new Set(lots.map((l) => l.id));
  const tetes = lots.filter((l) => l.parent === null || !dans.has(l.parent));
  const annexesDe = (id: string) => lots.filter((l) => l.parent === id);
  const libelleAnnexe = (a: (typeof lots)[number]): string =>
    [a.categorie ? a.categorie.charAt(0).toUpperCase() + a.categorie.slice(1) : 'Annexe', a.porte ? `n° ${a.porte}` : null, numeroLot(a.numero) ? `lot ${numeroLot(a.numero)}` : null]
      .filter((x) => x !== null).join(' ');

  // Les locations : sortie = celles closes aujourd'hui par le geste ; entrée = celles en cours.
  // Arno (20/10/2026, 393) : le loyer est celui du BAIL — compté UNE fois par bail (`cle`), jamais une fois par colocataire.
  const avecBail = await bailDisponible();
  const { rows: occ } = await query<{ lot_id: string; locataire: string; sortie: string | null; loyer_hc: string | null; provisions: string | null; taux: string | null; base: BaseHonoraires | null; cle: string }>(
    `SELECT o.lot_id::text, l.nom AS locataire, o.sortie::text, c.loyer_hc::text, c.provisions::text, c.taux_gestion_ht::text AS taux, c.base,
            ${avecBail ? "coalesce('b' || o.bail_id::text, 'o' || o.id::text)" : "'o' || o.id::text"} AS cle
       FROM gestion_annuaire_occupation o
       JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
       LEFT JOIN LATERAL (SELECT * FROM gestion_location_conditions x WHERE ${sqlConditionsDe('x', 'o', avecBail)} ORDER BY x.id DESC LIMIT 1) c ON true
      WHERE o.lot_id = ANY($1::bigint[]) AND ${ev.sens === 'sortie' ? `o.sortie = ${SQL_AUJOURDHUI_PARIS}` : 'o.sortie IS NULL'}
      ORDER BY o.id`, [ids]).catch(() => ({ rows: [] }));
  const reglages = await lireReglages().catch(() => ({ tauxDefautHt: 0, baseDefaut: 'cc' as BaseHonoraires, tva: [] }));
  const aujourdhui = quand.slice(0, 10);
  const tvaPct = tvaEnVigueur(reglages.tva, aujourdhui) ?? 20;

  const lotsMail: LotMail[] = tetes.map((t) => {
    const groupe = [t.id, ...annexesDe(t.id).map((a) => a.id)];
    const sesOcc = occ.filter((o) => groupe.includes(o.lot_id));
    // Valorisation : par location de ce lot (et de ses annexes), loyer de départ × taux — les règles de l'écran Honoraires.
    let loyer: number | null = null; let taux: number | null = null; let mensuel: number | null = null; let complet = sesOcc.length > 0;
    const parBail = [...new Map(sesOcc.map((o) => [o.cle, o])).values()];
    for (const o of parBail) {
      const base: BaseHonoraires = o.base ?? reglages.baseDefaut;
      const tauxHt = num(o.taux);
      const assietteLoyer = num(o.loyer_hc);
      if (assietteLoyer === null || tauxHt === null) { complet = false; if (assietteLoyer !== null) loyer = (loyer ?? 0) + assietteLoyer; continue; }
      const h = honorairesMensuels({ loyerHc: assietteLoyer, provisions: num(o.provisions), base, tauxHt }, tvaPct);
      if (h === null) { complet = false; continue; }
      loyer = (loyer ?? 0) + assietteLoyer + (base === 'cc' ? (num(o.provisions) ?? 0) : 0);
      taux = tauxHt; mensuel = (mensuel ?? 0) + h.ht;
    }
    const famille = familleDeCategorie(t.categorie);
    return {
      lotId: Number(t.id), adresse: t.adresse, numero: numeroLot(t.numero),
      type: t.type_logement ? (LIBELLE_TYPE_LOGEMENT[t.type_logement as TypeLogement] ?? t.type_logement) : t.nature,
      famille: famille === null ? null : LIBELLE_FAMILLE[famille],
      surface: t.surface === null ? null : Number(t.surface), etage: t.etage,
      annexes: annexesDe(t.id).map(libelleAnnexe),
      locataires: [...new Set(sesOcc.map((o) => o.locataire))],
      clotureLe: ev.sens === 'sortie' ? (sesOcc.find((o) => o.sortie !== null)?.sortie ?? null) : null,
      valeur: complet && mensuel !== null ? { loyer, taux, mensuelHT: mensuel } : { loyer: complet ? loyer : (loyer ?? null), taux, mensuelHT: null },
    };
  });

  // Les propriétaires : celui de la fiche, sinon ceux des biens (les deux sources de propriété).
  let proprietaires: number[] = ev.proprietaireId !== null ? [ev.proprietaireId] : [];
  if (proprietaires.length === 0) {
    const { rows } = await query<{ id: string }>(
      `SELECT DISTINCT x.pid::text AS id FROM (
         SELECT proprietaire_id AS pid FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) AND proprietaire_id IS NOT NULL
         UNION SELECT proprietaire_id FROM gestion_annuaire_lot_proprietaire WHERE lot_id = ANY($1::bigint[]) AND jusqu_a IS NULL) x ORDER BY 1`,
      [tetes.map((t) => Number(t.id))]);
    proprietaires = rows.map((r) => Number(r.id));
  }
  const vivante = await conditionCoordonneeVivante('c');
  const coord = (sorte: string): string => `(SELECT c.valeur_brute FROM gestion_annuaire_contact c WHERE c.sujet = 'proprietaire' AND c.sujet_id = p.id
      AND c.sorte = '${sorte}' AND c.absent_le IS NULL${vivante} ORDER BY c.rang, c.id LIMIT 1)`;
  const mandat = (await avec('gestion_annuaire_proprietaire', 'numero_mandat_gestion')) ? 'p.numero_mandat_gestion' : 'NULL::text';
  const transaction = (await avec('gestion_annuaire_proprietaire', 'numero_mandat_transaction')) ? 'p.numero_mandat_transaction' : 'NULL::text';
  const { rows: pr } = proprietaires.length === 0 ? { rows: [] } : await query<{ id: string; nom: string | null; tel: string | null; email: string | null; adresse: string | null; mg: string | null; mt: string | null }>(
    `SELECT p.id::text, p.nom_complet AS nom, ${coord('telephone')} AS tel, ${coord('email')} AS email,
            nullif(concat_ws(', ', p.adresse, nullif(concat_ws(' ', p.code_postal, p.commune), '')), '') AS adresse, ${mandat} AS mg, ${transaction} AS mt
       FROM gestion_annuaire_proprietaire p WHERE p.id = ANY($1::bigint[]) ORDER BY p.nom_complet`, [proprietaires]);
  const props: ProprietaireMail[] = pr.map((p) => ({
    nom: p.nom ?? `Propriétaire ${p.id}`, telephone: p.tel, email: p.email, adresse: p.adresse, mandatGestion: p.mg, mandatTransaction: p.mt,
  }));
  // SORTIE D'UNE ANNEXE SEULE (Arno, 18/10/2026) : une seule tête, qui est l'annexe d'un logement resté hors de la sortie.
  let annexe: { libelle: string; logement: string } | null = null;
  if (ev.sens === 'sortie' && tetes.length === 1 && tetes[0].parent !== null) {
    const { rows: pa } = await query<{ adresse: string | null; numero: string | null }>(
      `SELECT nullif(concat_ws(', ', adresse, commune), '') AS adresse, wippimmo_id AS numero FROM gestion_annuaire_lot WHERE id = $1`, [Number(tetes[0].parent)]);
    const logement = pa[0] === undefined ? `bien ${tetes[0].parent}` : [pa[0].adresse ?? `Bien ${tetes[0].parent}`, numeroLot(pa[0].numero) ? `lot ${numeroLot(pa[0].numero)}` : null].filter((x) => x !== null).join(' · ');
    annexe = { libelle: libelleAnnexe(tetes[0]), logement };
  }
  const base = adresseApplication().base;
  return {
    annexe,
    sens: ev.sens, reactivation: ev.reactivation === true, auteur, quand, tuile, proprietaires: props, lots: lotsMail,
    origine: ev.origine === null ? null : {
      motif: LIBELLE_ORIGINE[ev.origine.origine as Origine],
      sousMotif: ev.origine.sousOrigine === null ? null : LIBELLE_SOUS_ORIGINE[ev.origine.sousOrigine as SousOrigine],
      precision: ev.origine.precision,
    },
    tva: tvaPct / 100,
    lienFiche: proprietaires[0] === undefined ? null : `${base}/admin/gestion?ecran=annuaire&fiche=proprietaire-${proprietaires[0]}`,
  };
}

async function journaliserEnvoi(proprietaireId: number | null, lotId: number, issue: IssueMail, auteur: Auteur): Promise<void> {
  try {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ($1, $2, 'location_mail_portefeuille', $3, $4, $5, $6)`,
      [proprietaireId !== null ? 'annuaire' : 'annuaire_lot', proprietaireId ?? lotId, issue.envoye ? 'envoye' : 'echec',
        `${issue.objet ?? 'mail de portefeuille'} — à : ${issue.destinataires.join(', ') || 'personne'}${issue.motif ? ` — non envoyé : ${issue.motif}` : ''}`,
        auteur.id, auteur.libelle]);
  } catch (e) {
    console.error('[location] journal du mail de portefeuille impossible', (e as Error)?.message);
  }
}

/**
 * ENVOIE le mail d'un mouvement du portefeuille, APRÈS l'écriture. Ne lève JAMAIS : rend `{ envoye, motif }` pour que
 * l'écran dise « enregistré, mais mail non envoyé ». `ignore` = rien à envoyer (ex. bien en simple mandat de transaction).
 */
export async function notifierPortefeuille(
  ev: EvenementPortefeuille, ctx: { auteur: Auteur; tuile: TuileOrigine },
  deps: { transport?: TransportDemande; maintenant?: Date } = {},
): Promise<IssueMail> {
  let issue: IssueMail = { envoye: false, motif: null, destinataires: [], objet: null };
  try {
    if (ev.exigerEnGestion === true) {
      const ids = ev.proprietaireId !== null ? [ev.proprietaireId] : [];
      const { rows } = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM gestion_annuaire_proprietaire p
          WHERE p.en_gestion IS TRUE AND (p.id = ANY($1::bigint[]) OR p.id IN (
            SELECT proprietaire_id FROM gestion_annuaire_lot WHERE id = ANY($2::bigint[])
            UNION SELECT proprietaire_id FROM gestion_annuaire_lot_proprietaire WHERE lot_id = ANY($2::bigint[]) AND jusqu_a IS NULL))`,
        [ids, [...ev.lotIds]]).catch(() => ({ rows: [{ n: 0 }] }));
      if ((rows[0]?.n ?? 0) === 0) return { ...issue, ignore: true };
    }
    if (ev.avecAnnexes === true && ev.lotIds.length > 0) {
      const { rows } = await query<{ id: string }>('SELECT annexe_id::text AS id FROM gestion_lot_annexe WHERE parent_id = ANY($1::bigint[])', [[...ev.lotIds]]);
      ev = { ...ev, lotIds: [...ev.lotIds, ...rows.map((r) => Number(r.id))] };
    }
    const quand = (deps.maintenant ?? new Date()).toISOString();
    const auteur = await emailDeLAuteur(ctx.auteur);
    const donnees = await donneesDuMail(ev, auteur, ctx.tuile, quand);
    if (donnees === null) return { ...issue, ignore: true };
    const destinataires = await destinatairesDe(ctx.tuile, auteur.email);
    const objet = objetMail(donnees);
    issue = { ...issue, destinataires, objet };
    if (destinataires.length === 0) {
      issue = { ...issue, motif: 'aucun destinataire (aucune adresse e-mail connue)' };
    } else {
      const config = await chargerConfigGestion();
      const domaine = config.adresseGestion.split('@')[1] ?? 'criterimmo.fr';
      const r = await (deps.transport ?? transportParDefaut()).envoyer({
        de: config.adresseGestion, deNom: 'Gestion', a: destinataires, cc: [], cci: [], objet,
        corps: texteMail(donnees), corpsHtml: htmlMail(donnees), messageId: messageIdDemande(domaine, randomBytes(12).toString('hex')),
      });
      issue = r.ok ? { ...issue, envoye: true } : { ...issue, motif: r.motif };
    }
    await journaliserEnvoi(ev.proprietaireId ?? (donnees.lienFiche ? Number(donnees.lienFiche.split('proprietaire-')[1]) : null), donnees.lots[0]?.lotId ?? ev.lotIds[0], issue, ctx.auteur);
    return issue;
  } catch (e) {
    const motif = (e as Error)?.message ?? 'erreur inattendue';
    console.error('[location] mail de portefeuille non envoyé', motif);
    issue = { ...issue, envoye: false, motif };
    await journaliserEnvoi(ev.proprietaireId, ev.lotIds[0] ?? 0, issue, ctx.auteur);
    return issue;
  }
}

/**
 * Le pont des ROUTES : après un geste RÉUSSI (archivage, sortie de biens, réactivation, création), le mail, puis la réponse
 * enrichie de `mail` ({ envoye, motif, ignore }) pour que l'écran puisse dire « enregistré, mais mail non envoyé ».
 */
export async function avecMail<T extends { etat: string }>(
  issue: T, ev: EvenementPortefeuille | null, ctx: { auteur: Auteur; tuile: TuileOrigine },
): Promise<T & { mail?: { envoye: boolean; ignore: boolean; motif: string | null } }> {
  if (issue.etat !== 'ok' || ev === null || ev.lotIds.length === 0) return issue;
  const m = await notifierPortefeuille(ev, ctx);
  return { ...issue, mail: { envoye: m.envoye, ignore: m.ignore === true, motif: m.motif } };
}
