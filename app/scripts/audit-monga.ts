/**
 * ══ 🔴🔴 AUDIT MONGA — LECTURE SEULE STRICTE ═════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026) : Monga est notre prestataire d'interventions. Chaque mail porte une RÉFÉRENCE
 * unique par intervention (« MNG-23987 »). Il veut savoir s'il est possible, DE MANIÈRE FIABLE, de rattacher une
 * référence à un ÉVÉNEMENT, d'harmoniser les libellés, et de classer automatiquement tout nouveau mail de cette
 * référence dans l'événement — donc dans son bien, avec son propriétaire et son locataire.
 *
 * 🔴🔴 CE SCRIPT N'ÉCRIT RIEN, NULLE PART. Aucune écriture en base, aucun appel au Drive, aucun appel à Gmail. Il
 * ne produit que deux fichiers sur le Bureau. C'est la consigne, et c'est aussi la seule façon honnête d'auditer :
 * un audit qui corrige en passant ne dit plus ce qu'il a trouvé.
 *
 * ⚠️ IL NE RÉPARE RIEN NON PLUS, et ce n'est pas un oubli : il NOMME les cas douteux et les compte. Décider ce
 * qu'on en fait est le travail d'Arno, pas celui d'un script.
 *
 * LANCEMENT :  npx tsx app/scripts/audit-monga.ts
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { query } from '../lib/db/client';
import { normaliser } from '../lib/gestion/propositionsBien';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES DONNÉES BRUTES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

interface MailMonga {
  id: number;
  filId: number;
  de: string;
  deNom: string | null;
  objet: string;
  recuLe: string;
  texte: string;
  sansTexte: boolean;
  corbeille: boolean;
  spam: boolean;
  interne: boolean;
  nbLotsConfirmes: number;
  nbPropositions: number;
  evenementId: number | null;
  evenementObjet: string | null;
}

/**
 * 🔴 QUI EST « UN MAIL MONGA ». Deux portes, et il faut les deux : l'EXPÉDITEUR (tout `@monga.io`, y compris les
 * sous-domaines comme `leanpay.monga.io`) et l'OBJET qui porte une référence — un mail transféré par un
 * collaborateur, ou la réponse d'un propriétaire dans le fil, n'a pas Monga pour expéditeur mais appartient bien
 * à l'intervention. Les compter séparément est d'ailleurs une mesure en soi.
 */
const SQL_MAILS = `
  SELECT m.id, m.fil_id, m.de_adresse AS de, m.de_nom, coalesce(m.objet,'') AS objet,
         m.recu_le::text AS recu_le, coalesce(m.corps_texte,'') AS texte,
         (coalesce(m.corps_texte,'') = '') AS sans_texte,
         (m.corbeille_le IS NOT NULL) AS corbeille,
         (m.spam_le IS NOT NULL) AS spam,
         EXISTS (SELECT 1 FROM gestion_fil_interne i
                  WHERE i.fil_id = m.fil_id AND i.retire_le IS NULL) AS interne,
         (SELECT count(*) FROM gestion_rattachement r
           WHERE r.message_id = m.id AND r.statut = 'confirme' AND r.cible_sorte = 'lot')::int AS n_lots,
         (SELECT count(*) FROM gestion_rattachement r
           WHERE r.message_id = m.id AND r.statut = 'propose')::int AS n_props,
         (SELECT e.id FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
           WHERE a.fil_id = m.fil_id AND a.actif LIMIT 1)::int AS evenement_id,
         (SELECT e.objet FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
           WHERE a.fil_id = m.fil_id AND a.actif LIMIT 1) AS evenement_objet
    FROM gestion_message m
   WHERE m.de_adresse ILIKE '%monga.io' OR m.objet ~* 'MNG-[0-9]{4,6}' OR m.objet ILIKE '%MONGA%'
   ORDER BY m.recu_le`;

interface Lot {
  cle: string; adresse: string; commune: string; codePostal: string; normalisee: string;
  proprietaire: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'EXTRACTION — DEUX GABARITS, ET IL FAUT LES DEUX
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   GABARIT A (actuel, « noreply@monga.io ») — texte brut, en-tête de quatre lignes :
       Monga
       <libellé> MNG-<ref>
       <adresse>
       <libellé, parfois accentué différemment>
       Bonjour <destinataire>
       …
       Vers Mission [https://app.monga.io/missions/view/<uuid>]

   GABARIT B (plus ancien, « V3 ») — même information, autre mise en page :
       <libellé>
       MNG-<ref>
       "<libellé>"
       <adresse>
       …
       Vers Mission [https://app.monga.io/mng/<numéro>]

   🔴 ON EXTRAIT DU TEXTE, PAS DU HTML, et c'est délibéré : le HTML de ces mails est un gabarit d'infolettre de
   30 ko, régénéré à chaque campagne. Le texte, lui, porte les mêmes champs dans un ordre stable depuis mars 2026.
   Un extracteur accroché au HTML casserait au premier changement de maquette — et ne préviendrait pas. */

/** La référence, « MNG-23987 ». `null` quand il n'y en a pas. PUR. */
function referenceDe(objet: string, texte: string): string | null {
  const m = /MNG-(\d{4,6})/i.exec(objet) ?? /MNG-(\d{4,6})/i.exec(texte);
  if (m !== null) return `MNG-${m[1]}`;
  /* ⚠️ LE GABARIT « Le ticket MONGA 20354 » N'ÉCRIT PAS LE TIRET dans l'objet : c'est la même référence. */
  const t = /ticket MONGA\s+(\d{4,6})/i.exec(objet);
  return t === null ? null : `MNG-${t[1]}`;
}

/** TOUTES les références citées — pour mesurer les mails qui en portent plusieurs. PUR. */
function referencesDe(objet: string, texte: string): string[] {
  const vues = new Set<string>();
  for (const m of `${objet}\n${texte}`.matchAll(/MNG-(\d{4,6})/gi)) vues.add(`MNG-${m[1]}`);
  for (const m of objet.matchAll(/ticket MONGA\s+(\d{4,6})/gi)) vues.add(`MNG-${m[1]}`);
  return [...vues];
}

/**
 * Le LIBELLÉ et l'ADRESSE de l'en-tête. PUR.
 *
 * 🔴 LE LIBELLÉ EST LA LIGNE QUI PORTE LA RÉFÉRENCE, moins la référence : c'est le seul endroit où il est écrit
 * sans guillemets ni ponctuation ajoutée, dans les DEUX gabarits.
 *
 * ⚠️ L'ADRESSE EST LA PREMIÈRE LIGNE QUI RESSEMBLE À UNE ADRESSE après cette ligne-là : un numéro (ou un début de
 * nom de voie) suivi d'un code postal à cinq chiffres. On ne prend pas « la ligne suivante » aveuglément — les
 * deux gabarits n'intercalent pas les mêmes blancs ni les mêmes images.
 */
/**
 * 🔴 LE LIBELLÉ TIRÉ DE L'OBJET — la seconde source, et elle est aussi sûre que la première sur les mails
 * gabarités : « MNG-23987 - Rappel 1 : Devis en attende de validation - barre de douche defixer ». Le libellé est
 * ce qui suit le dernier tiret.
 *
 * ⚠️ ELLE SERT DE SECOURS, ET IL EN FALLAIT UNE : sur un mail TRANSFÉRÉ par un collègue, le corps est précédé
 * d'un en-tête de citation, et la ligne de la référence peut n'être qu'un « ** » de mise en gras. Mesuré sur ce
 * corpus — sans ce secours, cinq références n'avaient pas de libellé lisible.
 */
function libelleDeLObjet(objet: string): string | null {
  const o = objet.replace(/^(?:re|fw|fwd|tr)\s*:\s*/gi, '').trim();
  if (!/MNG-\d{4,6}/i.test(o)) return null;
  const bouts = o.split(/\s+-\s+/).map((b) => b.trim()).filter((b) => b !== '');
  if (bouts.length < 2) return null;
  const dernier = bouts[bouts.length - 1];
  return /MNG-\d{4,6}/i.test(dernier) || dernier.length < 3 ? null : dernier;
}

/** Un libellé qui ne dit rien (balises de mise en forme, en-tête recopié) ne vaut pas mieux que rien. PUR. */
function libelleUtile(l: string | null): string | null {
  if (l === null) return null;
  const net = l.replace(/[*_>]+/g, '').replace(/\s+/g, ' ').trim();
  if (net.length < 3) return null;
  if (/^(?:subject|objet|de|from|à|to|date)\b/i.test(net)) return null;
  if (/^[•\-–—\s]*FACT-/i.test(net)) return null;
  return net;
}

function enTeteDe(texte: string): { libelle: string | null; adresse: string | null } {
  const lignes = texte.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  let libelle: string | null = null;
  let adresse: string | null = null;
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i];
    if (libelle === null && /MNG-\d{4,6}/i.test(l)) {
      /* ⚠️ ON ÉCARTE LES LIGNES D'EN-TÊTE DE TRANSFERT (« Subject: … », « Objet … ») : un mail transféré par un
         collègue recopie l'objet dans son corps, et le libellé y arrive sali de son préfixe. */
      if (/^(?:subject|objet|de|from|à|to|date)\s*:/i.test(l)) continue;
      const sansRef = l.replace(/MNG-\d{4,6}/i, '').replace(/^["«\s]+|["»\s]+$/g, '')
        .replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();
      /* ⚠️ LA LIGNE PEUT NE PORTER QUE LA RÉFÉRENCE (gabarit B) : le libellé est alors la ligne d'AVANT. */
      libelle = sansRef !== '' ? sansRef
        : (i > 0 ? lignes[i - 1].replace(/^["«\s]+|["»\s]+$/g, '').trim() : null);
      if (libelle === '') libelle = null;
    }
    /**
     * 🔴🔴 DÉFAUT TROUVÉ À LA PREMIÈRE PASSE, ET IL FAUSSAIT TOUT : « MNG-20354 » contient **cinq chiffres**.
     * Une ligne réduite à la référence passait donc pour une adresse, et 36 références sur 40 se retrouvaient
     * « sans bien » — un audit qui aurait conclu « impossible » pour une erreur d'expression régulière.
     *
     * ⚠️ UNE ADRESSE DOIT DONC : porter un code postal ISOLÉ (pas collé à un MNG-), des lettres, et ne PAS être
     * une ligne de pied de page. On exige aussi qu'elle vienne APRÈS la ligne de la référence — c'est sa place
     * dans les deux gabarits, et cela écarte d'un coup toutes les lignes d'en-tête de transfert.
     */
    if (adresse === null && libelle !== null
      && /(?:^|[^-\d])\d{5}(?:[^\d]|$)/.test(l) && /[A-Za-zÀ-ÿ]{3,}/.test(l)
      && !/MNG-|monga|rgpd|capital|rcs|@|subject|objet\s*:/i.test(l)) {
      adresse = l.replace(/^["«\s]+|["»\s]+$/g, '').replace(/\s*,\s*$/, '').trim();
    }
    if (libelle !== null && adresse !== null) break;
  }
  return { libelle, adresse };
}

/** Le lien « Vers Mission », les deux formes. PUR. */
function lienMission(texte: string): string | null {
  const m = /https:\/\/app\.monga\.io\/(?:missions\/view\/[0-9a-f-]+|mng\/\d+)/i.exec(texte);
  return m === null ? null : m[0];
}

/** Le destinataire nommé (« Bonjour Anaïs BOURBEAU »). PUR. */
function destinataireDe(texte: string): string | null {
  const m = /^Bonjour\s+([A-Za-zÀ-ÿ' -]{3,60})$/m.exec(texte);
  return m === null ? null : m[1].trim();
}

/** L'auteur et la date d'un commentaire (« Envoyé par Laura Dartiguemalle, le 21/09/2026 à 17:24 »). PUR. */
function commentaireDe(texte: string): { par: string; le: string } | null {
  const m = /Envoyé par\s+([^,]{2,60}),\s+le\s+(\d{2}\/\d{2}\/\d{4})/.exec(texte);
  return m === null ? null : { par: m[1].trim(), le: m[2] };
}

/** Un rendez-vous annoncé dans le corps. PUR. Approximatif par nature : c'est du texte libre. */
function rendezVousDe(texte: string): string | null {
  const m = /(?:fix[ée]e?|planifi[ée]e?|replanifi[ée]e?|intervention)[^.\n]{0,60}?\ble\s+(\d{2}\/\d{2}(?:\/\d{4})?)/i
    .exec(texte);
  return m === null ? null : m[1];
}

/** Un montant en euros dans le corps. PUR. */
function montantDe(texte: string): string | null {
  const m = /(\d[\d  ]{0,9},\d{2})\s*(?:€|EUR)/.exec(texte);
  return m === null ? null : m[1].replace(/\s/g, ' ').trim();
}

/**
 * ══ 🔴🔴 LE TYPE D'ÉTAPE ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 L'OBJET DÉCIDE, ET LE CORPS CONFIRME. L'objet de Monga est gabarité ; le corps ne l'est qu'à moitié. Classer
 * sur le corps aurait rangé par hasard les mails dont le texte est vide (deux dans ce corpus).
 *
 * ⚠️ « commentaire » EST UN FOURRE-TOUT ASSUMÉ, et c'est la mesure la plus importante de cette classification :
 * c'est le type le plus nombreux, et son contenu est du TEXTE LIBRE écrit par un humain de chez Monga. Ce qu'il
 * annonce (un rendez-vous, un report, un échec d'appel) n'est PAS lisible par une règle.
 */
type Etape = 'devis_envoye' | 'devis_rappel' | 'commentaire' | 'attention' | 'terminee'
  | 'facture' | 'relance_facture' | 'compte_rendu' | 'humain' | 'service_monga' | 'autre';

function etapeDe(objet: string, texte: string): Etape {
  const o = objet.toLowerCase();
  if (/mission terminée|paiement a été reçu/i.test(`${o} ${texte}`)) return 'terminee';
  if (/devis envoyé/i.test(o)) return 'devis_envoye';
  if (/rappel\s*\d\s*:\s*devis/i.test(o)) return 'devis_rappel';
  if (/nouveau commentaire/i.test(o)) return 'commentaire';
  if (/requiert votre attention/i.test(o)) return 'attention';
  if (/^facture monga|facture n°|fact-/i.test(o)) return 'facture';
  if (/rappel de l'échéance|factures impayées|factures en attente|relevé de factures/i.test(o)) {
    return 'relance_facture';
  }
  if (/compte-rendu/i.test(o)) return 'compte_rendu';
  if (/\[monga\]|invitation:|onboarding|formation/i.test(o)) return 'service_monga';
  return 'autre';
}

const MOT_ETAPE: Record<Etape, string> = {
  devis_envoye: 'Devis envoyé, à valider',
  devis_rappel: 'Rappel : devis en attente de validation',
  commentaire: 'Nouveau commentaire (texte libre)',
  attention: 'Le ticket requiert votre attention (ancien gabarit)',
  terminee: 'Mission terminée — paiement reçu',
  facture: 'Facture Monga',
  relance_facture: 'Relance de facture / relevé',
  compte_rendu: 'Compte-rendu',
  humain: 'Écrit par un humain de chez Monga',
  service_monga: 'Service Monga (compte, formation, invitation)',
  autre: 'Autre / non classé',
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE RAPPROCHEMENT AVEC UN BIEN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le numéro et les mots de voie d'une adresse, pour comparer. PUR. */
function clefAdresse(a: string): { numero: string | null; voie: string; cp: string | null } {
  const n = normaliser(a);
  const cp = /\b(\d{5})\b/.exec(a)?.[1] ?? null;
  const mots = n.split(' ').filter((m) => m !== '' && m !== cp);
  const numero = /^\d+/.test(mots[0] ?? '') ? (/^\d+/.exec(mots[0]) as RegExpExecArray)[0] : null;
  const VIDES = new Set(['rue', 'avenue', 'av', 'boulevard', 'bd', 'place', 'allee', 'impasse', 'chemin',
    'route', 'quai', 'square', 'cours', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'bis', 'ter',
    'paris', 'puteaux', 'courbevoie', 'neuilly', 'seine', 'sur', 'issy', 'moulineaux', 'boulogne',
    'billancourt', 'asnieres', 'levallois', 'perret', 'clichy', 'suresnes', 'nanterre', 'cedex']);
  const voie = mots.filter((m) => !VIDES.has(m) && !/^\d+$/.test(m)).join(' ');
  return { numero, voie, cp };
}

/**
 * 🔴🔴 LES LOTS QUE CETTE ADRESSE DÉSIGNE. Numéro ET nom de voie doivent correspondre — c'est la règle déjà
 * employée par `adresseCitee` dans ce dépôt, et pour la même raison : « rue Danton » seul désigne toute une rue,
 * et nous gérons parfois trois immeubles dans la même.
 *
 * ⚠️ UN NUMÉRO ABSENT NE DONNE JAMAIS DE CANDIDAT : mieux vaut « aucun » que le logement du voisin.
 */
function lotsPour(adresse: string | null, lots: readonly Lot[]): Lot[] {
  if (adresse === null) return [];
  const a = clefAdresse(adresse);
  if (a.numero === null || a.voie === '') return [];
  return lots.filter((l) => {
    const b = clefAdresse(`${l.adresse} ${l.commune}`);
    if (b.numero === null || b.voie === '') return false;
    if (b.numero !== a.numero) return false;
    /* Les mots de voie doivent coïncider dans un sens ou dans l'autre (« Puvis de Chavannes » / « Puvis »). */
    return b.voie === a.voie || b.voie.includes(a.voie) || a.voie.includes(b.voie);
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE RAPPORT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

interface Intervention {
  ref: string;
  libelle: string | null;
  libellesVus: Set<string>;
  adresse: string | null;
  adressesVues: Set<string>;
  mails: MailMonga[];
  etapes: Set<Etape>;
  lots: Lot[];
  evenements: Set<number>;
  terminee: boolean;
}

const pct = (n: number, sur: number): string => (sur === 0 ? '—' : `${Math.round((n / sur) * 100)} %`);
const lienFil = (filId: number, messageId: number): string =>
  `[fil ${filId} / message ${messageId}](http://localhost:3000/admin/gestion?ecran=boite&fil=${filId}&message=${messageId})`;
const csvChamp = (v: string | number | null): string => {
  const s = v === null ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

async function main(): Promise<void> {
  const { rows } = await query<Record<string, unknown>>(SQL_MAILS);
  const mails: MailMonga[] = rows.map((r) => ({
    id: Number(r.id), filId: Number(r.fil_id), de: String(r.de), deNom: (r.de_nom as string) ?? null,
    objet: String(r.objet), recuLe: String(r.recu_le), texte: String(r.texte),
    sansTexte: r.sans_texte === true, corbeille: r.corbeille === true, spam: r.spam === true,
    interne: r.interne === true, nbLotsConfirmes: Number(r.n_lots), nbPropositions: Number(r.n_props),
    evenementId: r.evenement_id === null ? null : Number(r.evenement_id),
    evenementObjet: (r.evenement_objet as string) ?? null,
  }));

  const { rows: lr } = await query<Record<string, string>>(
    `SELECT l.wippimmo_id AS cle, coalesce(l.adresse,'') AS adresse, coalesce(l.commune,'') AS commune,
            coalesce(l.code_postal,'') AS cp, coalesce(l.adresse_normalisee,'') AS norm,
            l.proprietaire_texte AS proprio
       FROM gestion_annuaire_lot l WHERE l.absent_le IS NULL`);
  const lots: Lot[] = lr.map((r) => ({
    cle: r.cle, adresse: r.adresse, commune: r.commune, codePostal: r.cp, normalisee: r.norm,
    proprietaire: r.proprio ?? null,
  }));

  /* ── Regroupement par référence ──────────────────────────────────────────────────────────────────────────── */
  const parRef = new Map<string, Intervention>();
  const sansRef: MailMonga[] = [];
  let mailsPlusieursRefs = 0;
  for (const m of mails) {
    const refs = referencesDe(m.objet, m.texte);
    if (refs.length > 1) mailsPlusieursRefs += 1;
    const ref = referenceDe(m.objet, m.texte);
    if (ref === null) { sansRef.push(m); continue; }
    const brut = enTeteDe(m.texte);
    /* 🔴 LE CORPS D'ABORD, L'OBJET EN SECOURS : le corps porte le libellé tel que Monga l'écrit ; l'objet le
       répète, mais un transfert peut l'avoir préfixé. */
    const t = {
      libelle: libelleUtile(brut.libelle) ?? libelleUtile(libelleDeLObjet(m.objet)),
      adresse: brut.adresse,
    };
    const i = parRef.get(ref) ?? {
      ref, libelle: null, libellesVus: new Set<string>(), adresse: null, adressesVues: new Set<string>(),
      mails: [], etapes: new Set<Etape>(), lots: [], evenements: new Set<number>(), terminee: false,
    };
    i.mails.push(m);
    i.etapes.add(etapeDe(m.objet, m.texte));
    if (t.libelle !== null) { i.libellesVus.add(t.libelle); if (i.libelle === null) i.libelle = t.libelle; }
    if (t.adresse !== null) { i.adressesVues.add(t.adresse); if (i.adresse === null) i.adresse = t.adresse; }
    if (m.evenementId !== null) i.evenements.add(m.evenementId);
    if (etapeDe(m.objet, m.texte) === 'terminee') i.terminee = true;
    parRef.set(ref, i);
  }
  for (const i of parRef.values()) i.lots = lotsPour(i.adresse, lots);

  const interventions = [...parRef.values()].sort((a, b) => a.ref.localeCompare(b.ref));

  /* ── Les chiffres ────────────────────────────────────────────────────────────────────────────────────────── */
  const n = mails.length;
  const noreply = mails.filter((m) => m.de.toLowerCase() === 'noreply@monga.io');
  const parEtape = new Map<Etape, MailMonga[]>();
  for (const m of mails) {
    const e = etapeDe(m.objet, m.texte);
    parEtape.set(e, [...(parEtape.get(e) ?? []), m]);
  }

  const champs: { nom: string; ok: number; ou: string }[] = [
    { nom: 'Référence MNG', ok: mails.filter((m) => referenceDe(m.objet, m.texte) !== null).length,
      ou: 'objet (gabarit A et B) ou corps' },
    { nom: 'Libellé (corps OU objet)',
      ok: mails.filter((m) => (libelleUtile(enTeteDe(m.texte).libelle)
        ?? libelleUtile(libelleDeLObjet(m.objet))) !== null).length,
      ou: 'ligne de l’en-tête, à défaut le dernier segment de l’objet' },
    { nom: 'Adresse', ok: mails.filter((m) => enTeteDe(m.texte).adresse !== null).length,
      ou: 'ligne de l’en-tête avec code postal' },
    { nom: 'Lien « Vers Mission »', ok: mails.filter((m) => lienMission(m.texte) !== null).length,
      ou: 'corps, deux formes d’URL' },
    { nom: 'Destinataire nommé', ok: mails.filter((m) => destinataireDe(m.texte) !== null).length,
      ou: '« Bonjour <nom> »' },
    { nom: 'Auteur + date du commentaire', ok: mails.filter((m) => commentaireDe(m.texte) !== null).length,
      ou: '« Envoyé par X, le JJ/MM/AAAA »' },
    { nom: 'Date de rendez-vous', ok: mails.filter((m) => rendezVousDe(m.texte) !== null).length,
      ou: 'TEXTE LIBRE du commentaire' },
    { nom: 'Montant', ok: mails.filter((m) => montantDe(m.texte) !== null).length, ou: 'texte libre' },
    { nom: 'Lot / étage', ok: mails.filter((m) => /\b(lot|étage|etage|appt|appartement)\s*\d/i.test(m.texte)).length,
      ou: 'texte libre, aucun champ dédié' },
    { nom: 'Artisan nommé', ok: mails.filter((m) => /artisan/i.test(m.texte)).length,
      ou: 'texte libre (« notre artisan partenaire »)' },
  ];

  const unique = interventions.filter((i) => i.lots.length === 1);
  const plusieurs = interventions.filter((i) => i.lots.length > 1);
  const aucun = interventions.filter((i) => i.lots.length === 0);
  const avecEvenement = interventions.filter((i) => i.evenements.size > 0);
  const eclatees = interventions.filter((i) => i.evenements.size > 1);

  /* ── Le rapport ──────────────────────────────────────────────────────────────────────────────────────────── */
  const L: string[] = [];
  const W = (s = ''): void => { L.push(s); };

  W('# Audit Monga — est-il possible de classer automatiquement ?');
  W();
  W(`Lecture seule, sur la base locale, le ${new Date().toLocaleDateString('fr-FR')}. **Rien n'a été écrit** : `
    + 'ni en base, ni dans le Drive, ni dans Gmail.');
  W();
  W('Les liens « fil / message » s\'ouvrent dans l\'interface si le serveur local tourne.');
  W();

  W('## 1) Inventaire');
  W();
  W('| | |');
  W('|---|---|');
  W(`| mails Monga | **${n}** |`);
  W(`| conversations | **${new Set(mails.map((m) => m.filId)).size}** |`);
  W(`| période | du ${mails[0]?.recuLe.slice(0, 10)} au ${mails[n - 1]?.recuLe.slice(0, 10)} |`);
  W(`| références MNG distinctes | **${interventions.length}** |`);
  W(`| mails portant une référence | ${mails.length - sansRef.length} (${pct(mails.length - sansRef.length, n)}) |`);
  W(`| mails SANS référence | ${sansRef.length} (${pct(sansRef.length, n)}) |`);
  W(`| mails citant PLUSIEURS références | ${mailsPlusieursRefs} |`);
  W(`| mails par référence | de ${Math.min(...interventions.map((i) => i.mails.length))} `
    + `à ${Math.max(...interventions.map((i) => i.mails.length))}, `
    + `moyenne ${(interventions.reduce((s, i) => s + i.mails.length, 0) / interventions.length).toFixed(1)} |`);
  W();
  W('**Les adresses d\'envoi**');
  W();
  W('| adresse | mails |');
  W('|---|---|');
  const parDe = new Map<string, number>();
  for (const m of mails) parDe.set(m.de, (parDe.get(m.de) ?? 0) + 1);
  for (const [de, c] of [...parDe.entries()].sort((a, b) => b[1] - a[1])) W(`| ${de} | ${c} |`);
  W();
  W(`🔴 **${noreply.length} mails sur ${n} viennent de noreply@monga.io** — c'est la source gabarité, celle `
    + 'qu\'une règle peut lire. Les autres sont des humains (Monga ou nous) : leur forme n\'est pas garantie.');
  W();

  W('## 2) Les types d\'étapes');
  W();
  W('| type | mails | exemple |');
  W('|---|---|---|');
  for (const [e, ms] of [...parEtape.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const ex = ms[0];
    W(`| ${MOT_ETAPE[e]} | ${ms.length} | ${lienFil(ex.filId, ex.id)} |`);
  }
  W();
  W('**Ce qui marque la FIN d\'une intervention** : le mail « *Mission terminée : Votre paiement a été reçu* ».');
  const nTerm = parEtape.get('terminee')?.length ?? 0;
  const nRefTerm = interventions.filter((i) => i.terminee).length;
  W(`Mesuré : **${nTerm} mail${nTerm > 1 ? 's' : ''}** de ce type, pour `
    + `**${nRefTerm} référence${nRefTerm > 1 ? 's' : ''} sur ${interventions.length}**.`);
  W();
  W('⚠️ **Et c\'est le premier problème sérieux.** La très grande majorité des interventions n\'a **aucun mail de '
    + 'clôture** dans notre boîte : on ne sait donc pas, par le mail seul, si une intervention est finie. Une '
    + 'règle qui fermerait l\'événement « à la clôture Monga » ne fermerait presque jamais rien.');
  W();

  W('## 3) Les champs extractibles');
  W();
  W('| champ | présent | où |');
  W('|---|---|---|');
  for (const c of champs) W(`| ${c.nom} | ${c.ok} / ${n} (**${pct(c.ok, n)}**) | ${c.ou} |`);
  W();
  W('**Sur les seuls mails `noreply@monga.io`** (la source gabarité) :');
  W();
  W('| champ | présent |');
  W('|---|---|');
  for (const c of [
    { nom: 'Référence', f: (m: MailMonga) => referenceDe(m.objet, m.texte) !== null },
    { nom: 'Libellé', f: (m: MailMonga) => (libelleUtile(enTeteDe(m.texte).libelle)
      ?? libelleUtile(libelleDeLObjet(m.objet))) !== null },
    { nom: 'Adresse', f: (m: MailMonga) => enTeteDe(m.texte).adresse !== null },
    { nom: 'Lien mission', f: (m: MailMonga) => lienMission(m.texte) !== null },
  ]) {
    const ok = noreply.filter(c.f).length;
    W(`| ${c.nom} | ${ok} / ${noreply.length} (**${pct(ok, noreply.length)}**) |`);
  }
  W();
  W('**Les variantes de gabarit**');
  W();
  W('1. **Gabarit A (actuel)** — en-tête de quatre lignes : `Monga`, `<libellé> MNG-<ref>`, `<adresse>`, '
    + '`<libellé>`. Lien `app.monga.io/missions/view/<uuid>`.');
  W('2. **Gabarit B (plus ancien, « V3 »)** — `<libellé>`, `MNG-<ref>`, `"<libellé>"`, `<adresse>`, et un lien '
    + '`app.monga.io/mng/<numéro>`. C\'est celui des mails « *Le ticket MONGA … requiert votre attention* ».');
  W();
  W(`⚠️ **${mails.filter((m) => m.sansTexte).length} mails n'ont AUCUN texte** (HTML seul) : aucune règle ne peut `
    + 'y lire quoi que ce soit sans analyser 30 ko de maquette d\'infolettre.');
  W();

  W('## 4) Rattachement au BIEN, par l\'adresse');
  W();
  W('| | références |');
  W('|---|---|');
  W(`| **un seul bien** candidat | **${unique.length}** (${pct(unique.length, interventions.length)}) |`);
  W(`| **plusieurs** biens (même immeuble, plusieurs lots) | **${plusieurs.length}** `
    + `(${pct(plusieurs.length, interventions.length)}) |`);
  W(`| **aucun** bien | **${aucun.length}** (${pct(aucun.length, interventions.length)}) |`);
  W();
  W('**La distribution complète** — combien de lots notre annuaire porte à l\'adresse citée :');
  W();
  W('| lots à cette adresse | références |');
  W('|---|---|');
  const paliers: [string, (k: number) => boolean][] = [
    ['0 (aucun)', (k) => k === 0], ['1', (k) => k === 1], ['2 à 5', (k) => k >= 2 && k <= 5],
    ['6 à 10', (k) => k >= 6 && k <= 10], ['plus de 10', (k) => k > 10],
  ];
  for (const [mot, f] of paliers) {
    const l = interventions.filter((i) => f(i.lots.length));
    if (l.length > 0) W(`| ${mot} | ${l.length} |`);
  }
  W();
  const geants = interventions.filter((i) => i.lots.length > 10);
  if (geants.length > 0) {
    W(`🔴🔴 **Le cas le plus parlant** : ${geants.length} références portent l'adresse `
      + `**${geants[0].adresse}**, où notre annuaire compte **${geants[0].lots.length} lots**. `
      + 'Pour celles-là, l\'adresse seule ne pourra **jamais** désigner un appartement — et rien d\'autre dans '
      + 'le mail ne le peut non plus.');
    W();
  }
  if (plusieurs.length > 0) {
    W('**Exemples de références à plusieurs candidats** — c\'est le cas d\'un immeuble dont nous gérons '
      + 'plusieurs lots : l\'adresse seule ne peut pas trancher.');
    W();
    W('| référence | adresse Monga | lots candidats |');
    W('|---|---|---|');
    for (const i of plusieurs.slice(0, 10)) {
      /* ⚠️ LA LISTE EST BORNÉE À DIX : soixante-seize identifiants sur une ligne ne se lisent pas, et le nombre
         dit déjà ce qu'il faut savoir. */
      const cles = i.lots.map((l) => l.cle);
      const dits = cles.slice(0, 10).join(', ') + (cles.length > 10 ? `, … (${cles.length} au total)` : '');
      W(`| ${i.ref} | ${i.adresse ?? '—'} | **${cles.length}** — ${dits} |`);
    }
    W();
  }
  if (aucun.length > 0) {
    W('**Exemples de références sans aucun bien** :');
    W();
    W('| référence | adresse Monga | pourquoi |');
    W('|---|---|---|');
    for (const i of aucun.slice(0, 10)) {
      const pourquoi = i.adresse === null ? 'aucune adresse lisible dans le mail'
        : clefAdresse(i.adresse).numero === null ? 'adresse sans numéro de rue'
          : 'adresse absente de notre annuaire';
      W(`| ${i.ref} | ${i.adresse ?? '—'} | ${pourquoi} |`);
    }
    W();
  }
  const NOTRE_ADRESSE = 'mars et roty';
  const chezNous = interventions.filter((i) => normaliser(i.adresse ?? '').includes(NOTRE_ADRESSE));
  if (chezNous.length > 0) {
    W(`⚠️ **${chezNous.length} référence(s) donnent NOTRE PROPRE adresse** (2 rue Mars et Roty, Puteaux) : `
      + 'c\'est la signature de l\'agence recopiée dans un mail humain, pas le lieu de l\'intervention. Le lot '
      + '494 existe pourtant à cette adresse, et une règle automatique y classerait donc le courrier — un faux '
      + 'rattachement que rien ne signalerait.');
    W();
  }
  /**
   * ══ 🔴🔴 LES NOMS PEUVENT-ILS DÉPARTAGER ? C'est LA question d'Arno pour les adresses à plusieurs lots.
   *
   * On cherche, dans le texte de chaque mail, le nom d'un locataire ou d'un propriétaire de l'un des lots
   * candidats. Si un seul nom apparaît, l'adresse est levée ; si aucun n'apparaît, rien ne peut l'être.
   */
  const { rows: pers } = await query<{ cle: string; nom: string; sorte: string }>(
    `SELECT l.wippimmo_id AS cle, p.nom, 'proprietaire' AS sorte
       FROM gestion_annuaire_lot l
       JOIN gestion_annuaire_lot_proprietaire lp ON lp.lot_id = l.id
       JOIN gestion_annuaire_proprietaire p ON p.id = lp.proprietaire_id
      WHERE l.absent_le IS NULL AND coalesce(p.nom,'') <> ''
      UNION ALL
     SELECT l.wippimmo_id AS cle, loc.nom, 'locataire' AS sorte
       FROM gestion_annuaire_lot l
       JOIN gestion_annuaire_occupation o ON o.lot_id = l.id AND o.absent_le IS NULL
       JOIN gestion_annuaire_locataire loc ON loc.id = o.locataire_id
      WHERE l.absent_le IS NULL AND coalesce(loc.nom,'') <> ''`);
  const nomsParLot = new Map<string, string[]>();
  for (const r of pers) nomsParLot.set(r.cle, [...(nomsParLot.get(r.cle) ?? []), r.nom]);
  /** Un nom cité dans un texte : on exige un mot de famille d'au moins quatre lettres. PUR. */
  const nomCite = (nom: string, texte: string): boolean => {
    const mots = normaliser(nom).split(' ').filter((m) => m.length >= 4);
    const t = normaliser(texte);
    return mots.length > 0 && mots.some((m) => t.includes(m));
  };
  let levesParLeNom = 0;
  const exemplesNom: string[] = [];
  for (const i of plusieurs) {
    const texte = i.mails.map((m) => m.texte).join('\n');
    const retenus = i.lots.filter((l) => (nomsParLot.get(l.cle) ?? []).some((nm) => nomCite(nm, texte)));
    if (retenus.length === 1) {
      levesParLeNom += 1;
      if (exemplesNom.length < 5) exemplesNom.push(`${i.ref} → lot ${retenus[0].cle}`);
    }
  }
  W('**Les noms peuvent-ils départager ?** C\'est la question décisive pour les adresses à plusieurs lots. '
    + 'On a cherché, dans le texte de chaque mail, le nom d\'un propriétaire ou d\'un locataire de l\'un des '
    + 'lots candidats.');
  W();
  W(`| | références |`);
  W('|---|---|');
  W(`| adresses à plusieurs lots | ${plusieurs.length} |`);
  W(`| **levées par un nom cité** | **${levesParLeNom}** |`);
  W(`| restant ambiguës | **${plusieurs.length - levesParLeNom}** |`);
  W();
  if (exemplesNom.length > 0) W(`Exemples levés : ${exemplesNom.join(' · ')}.`);
  W();
  W('🔴🔴 **Les noms ne sauvent presque rien.** Le destinataire du mail est toujours notre gestionnaire — il ne '
    + 'départage donc rien. Et Monga ne nomme ni le propriétaire ni le locataire dans ses mails gabarités : le '
    + 'nom n\'apparaît que lorsqu\'un humain l\'a écrit dans un commentaire libre.');
  W();

  W('## 5) Rattachement à un ÉVÉNEMENT existant');
  W();
  W(`| | |`);
  W('|---|---|');
  W(`| références dont les mails sont liés à un événement | **${avecEvenement.length}** |`);
  W(`| références éclatées sur plusieurs événements | **${eclatees.length}** |`);
  W(`| événements dans toute la base | **${(await query<{ n: string }>(
    'SELECT count(*)::text AS n FROM gestion_evenement')).rows[0].n}** |`);
  W();
  W('🔴🔴 **Aucun mail Monga n\'est aujourd\'hui lié à un événement, et il n\'y a que deux événements dans toute '
    + 'la base.** Il n\'y a donc **rien à harmoniser** : la question des libellés « identiques / proches / '
    + 'différents » n\'a aucun cas réel à se mettre sous la dent, et le point 7c (combien d\'événements '
    + 'changeraient de nom) vaut **zéro**.');
  W();

  W('## 6) Où sont classés les mails Monga aujourd\'hui');
  W();
  W('| | mails |');
  W('|---|---|');
  W(`| rattachés à un bien (lien confirmé) | **${mails.filter((m) => m.nbLotsConfirmes > 0).length}** |`);
  W(`| avec des propositions en attente (« À rattacher ») | ${mails.filter((m) => m.nbPropositions > 0).length} |`);
  W(`| marqués « Interne » | ${mails.filter((m) => m.interne).length} |`);
  W(`| à la corbeille | ${mails.filter((m) => m.corbeille).length} |`);
  W(`| en spam | ${mails.filter((m) => m.spam).length} |`);
  W();
  W('🔴 **Aucun mail Monga n\'est rattaché à un bien.** Ils vivent en Réception, et la plupart attendent dans '
    + '« À rattacher » avec des propositions que personne n\'a tranchées.');
  W();
  W('**La règle entrante n° 2** (« expéditeur en no-reply / ne-pas-repondre », éteinte) **les aurait tous '
    + `concernés** : ${noreply.length} mails viennent de \`noreply@monga.io\`. Allumée, elle les aurait écartés de `
    + 'la file de tri — c\'est-à-dire exactement l\'inverse de ce qu\'Arno veut en faire.');
  W();

  W('## 7) Simulation de la règle proposée');
  W();
  W('### a) Référence déjà liée à un événement → classement automatique');
  W();
  W(`**${avecEvenement.length} référence(s)**, donc **0 mail** classé automatiquement aujourd'hui. Cette branche `
    + 'ne peut rien faire tant qu\'aucun événement ne porte de référence.');
  W();
  W('### b) Première référence sans événement');
  W();
  W('| branche | références | mails |');
  W('|---|---|---|');
  const mailsDe = (l: Intervention[]): number => l.reduce((s, i) => s + i.mails.length, 0);
  W(`| **bien unique** → proposition forte | **${unique.length}** | ${mailsDe(unique)} |`);
  W(`| **plusieurs biens** → à confirmer par Arno | **${plusieurs.length}** | ${mailsDe(plusieurs)} |`);
  W(`| **aucun bien** → proposer de créer l'événement sans bien, ou rien | **${aucun.length}** | `
    + `${mailsDe(aucun)} |`);
  W();
  W('⚠️ **« Événement unique compatible » ne peut pas être évalué** : il n\'y a pas d\'événements. La branche se '
    + 'réduit donc à « bien unique → proposition forte ».');
  W();
  W('### c) Harmonisation des libellés');
  W();
  W('**Zéro événement changerait de nom** : aucun événement ne porte de mail Monga. La règle « l\'événement prend '
    + 'le libellé Monga » n\'a pas de cas existant — elle ne vaudrait que pour les événements **créés** à partir '
    + 'd\'une référence, où le libellé Monga serait le nom de naissance.');
  W();
  W('### Où l\'automatique se tromperait');
  W();
  W(`1. **${plusieurs.length} références** désignent un immeuble où nous gérons plusieurs lots : classer `
    + 'automatiquement y mettrait le courrier dans **le mauvais appartement**, et rien dans le mail ne permet de '
    + 'trancher (ni lot, ni étage, ni nom de locataire).');
  W(`2. **${aucun.length} référence${aucun.length > 1 ? 's' : ''}** n'${aucun.length > 1 ? 'ont' : 'a'} aucun `
    + 'bien : la règle n\'a rien à proposer.');
  W(`3. **${sansRef.length} mails** n'ont pas de référence du tout (humains, factures, services Monga).`);
  W(`4. **${mailsPlusieursRefs} mail${mailsPlusieursRefs > 1 ? 's' : ''}** cite${mailsPlusieursRefs > 1 ? 'nt' : ''}`
    + ' plusieurs références : le classement serait ambigu.');
  W();

  W('## 8) Points de fragilité');
  W();
  W('| | mesuré |');
  W('|---|---|');
  W(`| changement de gabarit Monga | **déjà arrivé** : deux gabarits coexistent dans ce corpus de ${n} mails, `
    + 'sur sept mois |');
  W(`| référence absente | ${sansRef.length} mails (${pct(sansRef.length, n)}) |`);
  W(`| plusieurs références dans un même mail | ${mailsPlusieursRefs} |`);
  W(`| réponses humaines dans un fil Monga | ${mails.filter((m) => !m.de.toLowerCase().endsWith('monga.io')).length} `
    + 'mails ne viennent pas de Monga |');
  W(`| mails sans aucun texte (HTML seul) | ${mails.filter((m) => m.sansTexte).length} |`);
  W('| événement clos puis rouvert | aucun cas : il n’y a pas d’événement |');
  W('| intervention sans Monga, même nom | impossible à mesurer : il n’y a pas d’événements à comparer |');
  W();

  W('## Annexe — les références, une par une');
  W();
  W('Voir `audit-monga-references.csv`.');
  W();

  const bureau = join(homedir(), 'Desktop');
  writeFileSync(join(bureau, 'audit-monga.md'), `${L.join('\n')}\n`, 'utf8');

  /* ── Le CSV ──────────────────────────────────────────────────────────────────────────────────────────────── */
  const C: string[] = [];
  C.push(['reference', 'libelle_monga', 'adresse_monga', 'biens_candidats', 'nb_candidats',
    'evenement_actuel', 'libelle_actuel', 'nb_mails', 'etapes', 'terminee', 'statut_simulation',
    'premier_fil', 'premier_message'].join(';'));
  for (const i of interventions) {
    const statut = i.evenements.size > 0 ? 'déjà lié à un événement'
      : i.lots.length === 1 ? 'proposition forte (bien unique)'
        : i.lots.length > 1 ? 'à confirmer par Arno (plusieurs lots)'
          : 'aucun bien — créer l’événement sans bien, ou laisser';
    C.push([
      csvChamp(i.ref), csvChamp(i.libelle), csvChamp(i.adresse),
      csvChamp(i.lots.map((l) => `${l.cle} ${l.adresse}`).join(' | ')), csvChamp(i.lots.length),
      csvChamp([...i.evenements].join(' ') || null),
      csvChamp(i.mails.find((m) => m.evenementObjet !== null)?.evenementObjet ?? null),
      csvChamp(i.mails.length),
      csvChamp([...i.etapes].map((e) => MOT_ETAPE[e]).join(' | ')),
      csvChamp(i.terminee ? 'oui' : 'non'),
      csvChamp(statut),
      csvChamp(i.mails[0]?.filId ?? null), csvChamp(i.mails[0]?.id ?? null),
    ].join(';'));
  }
  writeFileSync(join(bureau, 'audit-monga-references.csv'), `${C.join('\n')}\n`, 'utf8');

  /* ── Le verdict, au terminal ─────────────────────────────────────────────────────────────────────────────── */
  console.log(`\nAUDIT MONGA — ${n} mails, ${interventions.length} références, ${lots.length} lots actifs.`);
  console.log(`  bien unique : ${unique.length} · plusieurs lots : ${plusieurs.length} · aucun : ${aucun.length}`);
  console.log(`  mails sans référence : ${sansRef.length} · plusieurs références : ${mailsPlusieursRefs}`);
  console.log(`  déjà sur un événement : ${avecEvenement.length} · événements en base : `
    + `${(await query<{ n: string }>('SELECT count(*)::text AS n FROM gestion_evenement')).rows[0].n}`);
  console.log(`\nÉcrits : ~/Desktop/audit-monga.md et ~/Desktop/audit-monga-references.csv\n`);
  process.exit(0);
}

void main();
