/**
 * N1-A — VERSEMENT AUTOMATIQUE en GED des pièces reçues par e-mail. MODULE UNIQUE, appelé par les DEUX chemins de relève
 * (releveReponses + releveApprofondie) — jamais deux implémentations.
 *
 * Déclencheur (trois conditions CUMULATIVES) : objet réduit au seul mot « permis » (casse/accents/espaces tolérés, préfixe
 * Re:/Fwd:/Tr: toléré) + expéditeur dans les ADRESSES CONNUES (config_veille.depot_adresses_connues ∪ toutes les adresses de
 * collaborateur, statut ignoré) + au moins une pièce jointe. Une condition manquante → `non_traite` (flux normal inchangé).
 *
 * Quatre issues (§4) : (a) UN candidat → verse TOUTES les pièces + bascule en Archives + alerte succès ; (b) PLUSIEURS candidats
 * → ne verse rien + alerte « à trancher » ; (c) AUCUN candidat → forward du mail + alerte ; (d) extraction impossible → comme (c)
 * avec le motif. IDEMPOTENCE au grain message (depot_manuel_journal) : un message traité ne l'est jamais deux fois.
 *
 * INVARIANTS : aucune confirmation humaine ; on ne CONTOURNE PAS la garde de `deposerDocumentSurPermis` (on pose satisfait_le
 * AVANT si besoin) ; dédoublonnage pièce par pièce sur l'empreinte sha256 ; pas de catch muet (motif distinguable). Testable par
 * INJECTION (aucune I/O réelle dans les tests).
 */
import { createHash } from 'node:crypto';
import { query } from '../db/client';
import { dossiersSatisfaits } from '../veille/satisfactionDossier';
import type { MessageBoite } from '../veille/releveReponses';
import type { ProfilBoite } from '../veille/demandeReponseRepo';

// ── Reconnaissance (PURE) ─────────────────────────────────────────────────────
/** Normalise un objet : sans accents, minuscules, préfixes Re:/Fwd:/Tr: retirés, espaces réduits. */
function normaliserObjet(objet: string | null | undefined): string {
  return (objet ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/^\s*(re|fwd|fw|tr)\s*:\s*/i, '') // un préfixe de réponse/transfert
    .replace(/\s+/g, ' ')
    .trim();
}
/** L'objet est-il le SEUL mot « permis » ? */
export function objetEstPermis(objet: string | null | undefined): boolean {
  return normaliserObjet(objet) === 'permis';
}
/** Adresse normalisée pour comparaison (trim + minuscules). */
export function normaliserAdresse(a: string | null | undefined): string {
  return (a ?? '').trim().toLowerCase();
}
/** Les trois conditions cumulatives du déclencheur. `adresses` = ensemble normalisé (minuscules). PURE. */
export function estCandidatDepot(m: { objet: string | null | undefined; deAdresse: string | null | undefined; nbPieces: number }, adresses: ReadonlySet<string>): boolean {
  return objetEstPermis(m.objet) && m.nbPieces > 0 && adresses.has(normaliserAdresse(m.deAdresse));
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CandidatDossier { dossierId: number; demandeId: number; numDau: string; dejaSatisfait: boolean }
export interface CaracteristiquesPermis {
  reference: string;            // référence INTERNE de la demande (SVAV-DEM-…)
  numDau: string; type: string; // numéro officiel + type d'autorisation
  adresse: string | null; communeNom: string | null; codeInsee: string;
  natureTravaux: string | null; dateAutorisation: string | null; surface: string | null; logements: number | null;
}
export type IssueDepot = 'non_traite' | 'deja_traite' | 'verse' | 'ambigu' | 'aucun_candidat' | 'extraction_echec';
export interface ResultatDepot { issue: IssueDepot; dossierId?: number; deposees?: string[]; ignorees?: string[]; echecs?: string[]; candidats?: number }

/** I/O injectables (aucune dépendance lourde dans les tests). */
export interface DepsDepotManuel {
  dejaTraite(messageId: string): Promise<boolean>;
  journaliser(e: { messageId: string; profil: ProfilBoite; issue: IssueDepot; dossierId: number | null; expediteur: string }): Promise<void>;
  extraireTextePdf(contenu: Buffer, typeMime: string | null): Promise<string | null>; // null = non extractible
  chargerCandidats(): Promise<CandidatDossier[]>;
  empreintesEnGed(dossierId: number): Promise<Set<string>>;
  marquerSatisfait(demandeId: number, dossierId: number): Promise<void>;
  deposer(dossierId: number, piece: { nomFichier: string; typeMime: string | null; contenu: Buffer }, expediteur: string, messageId: string): Promise<{ ok: true } | { ok: false; motif: string }>;
  caracteristiques(dossierId: number): Promise<CaracteristiquesPermis | null>;
  envoyerAlerte(sujet: string, corps: string): Promise<void>;
  forwarder(mb: MessageBoite, sujet: string, corps: string): Promise<void>;
}

/** Empreinte sha256 (même algorithme que le stockage) — pour le dédoublonnage pièce par pièce. */
export function empreinteDe(contenu: Buffer): string {
  return createHash('sha256').update(contenu).digest('hex');
}

// ── Composition des messages (PURE) ───────────────────────────────────────────
function ligneCarac(c: CaracteristiquesPermis): string[] {
  const L: string[] = [];
  L.push(`Permis N°${c.numDau} (${c.type})${c.communeNom ? ` — ${c.communeNom}` : ''} (INSEE ${c.codeInsee})`);
  L.push(`Référence interne de la demande : ${c.reference}`);
  if (c.adresse) L.push(`Adresse : ${c.adresse}`);
  if (c.natureTravaux) L.push(`Nature des travaux : ${c.natureTravaux}`);
  if (c.dateAutorisation) L.push(`Date d’acceptation : ${c.dateAutorisation}`);
  if (c.surface) L.push(`Surface créée : ${c.surface} m²`);
  if (c.logements !== null) L.push(`Logements créés : ${c.logements}`);
  return L;
}
export function corpsSucces(c: CaracteristiquesPermis | null, deposees: string[], ignorees: string[], echecs: string[], expediteur: string): string {
  const L: string[] = ['Des documents reçus par e-mail ont été versés AUTOMATIQUEMENT dans la GED d’un permis.', ''];
  if (c) L.push(...ligneCarac(c), ''); else L.push('⚠ Caractéristiques du permis indisponibles en base (lecture en erreur).', '');
  L.push(deposees.length > 0 ? `Pièces versées (${deposees.length}) :` : 'Aucune nouvelle pièce versée (toutes déjà présentes).');
  for (const n of deposees) L.push(`  · ${n}`);
  if (ignorees.length > 0) { L.push('', `Pièces ignorées car déjà présentes (${ignorees.length}) :`); for (const n of ignorees) L.push(`  · ${n}`); }
  if (echecs.length > 0) { L.push('', `⚠ Pièces NON versées (échec de dépôt) (${echecs.length}) :`); for (const n of echecs) L.push(`  ⚠ ${n}`); }
  L.push('', `Expéditeur du mail d’origine : ${expediteur}`);
  return L.join('\n');
}
export function corpsAmbigu(caracs: (CaracteristiquesPermis | null)[], expediteur: string): string {
  const L: string[] = ['Un mail « permis » désigne PLUSIEURS permis en concurrence : AUCUNE pièce n’a été versée. À trancher à la main.', ''];
  caracs.forEach((c, i) => { L.push(`Candidat ${i + 1} :`); L.push(...(c ? ligneCarac(c) : ['(caractéristiques indisponibles)']).map((x) => `  ${x}`)); L.push(''); });
  L.push(`Expéditeur du mail d’origine : ${expediteur}`);
  return L.join('\n');
}
export function corpsAucun(issue: 'aucun_candidat' | 'extraction_echec', motifs: string[], expediteur: string): string {
  const L: string[] = [];
  if (issue === 'extraction_echec') {
    L.push('Un mail « permis » a été reçu mais le NUMÉRO DE PERMIS n’a pas pu être lu dans ses pièces (extraction impossible).', '', 'Motifs :');
    for (const m of motifs) L.push(`  ⚠ ${m}`);
  } else {
    L.push('Un mail « permis » a été reçu mais AUCUN numéro de permis correspondant à une demande dans l’interface n’a été trouvé.', '');
  }
  L.push('', 'Que faire de ce mail et de ses pièces jointes ? (le mail complet est transféré ci-dessus.)', '', `Expéditeur du mail d’origine : ${expediteur}`);
  return L.join('\n');
}

// ── Orchestrateur (INJECTION) ─────────────────────────────────────────────────
/**
 * Traite UN message reconnu comme candidat au versement (l'appelant a déjà vérifié `estCandidatDepot`). Retourne l'issue.
 * Idempotent : un message déjà journalisé → `deja_traite` (rien refait). Aucun catch muet : un échec de dépôt d'UNE pièce est
 * consigné dans l'alerte (echecs), jamais avalé.
 */
export async function traiterDepotManuel(mb: MessageBoite, profil: ProfilBoite, deps: DepsDepotManuel): Promise<ResultatDepot> {
  const messageId = mb.message.messageId.trim();
  const expediteur = mb.message.deAdresse;
  if (await deps.dejaTraite(messageId)) return { issue: 'deja_traite' };

  // 1) Extraction du texte des pièces (PDF) — les échecs sont collectés (motif), jamais silencieux.
  const textes: string[] = [];
  const motifs: string[] = [];
  for (const p of mb.pieces) {
    const t = await deps.extraireTextePdf(p.contenu, p.typeMime);
    if (t !== null && t.trim() !== '') textes.push(t);
    else motifs.push(`« ${p.nomFichier} » : ${p.typeMime === 'application/pdf' ? 'PDF sans couche texte lisible' : `type non lisible (${p.typeMime ?? 'inconnu'})`}`);
  }

  // 2) Rapprochement : num_dau connus trouvés dans (noms de fichiers + texte extrait). Technique existante (satisfactionDossier).
  const candidats = await deps.chargerCandidats();
  const trouves = dossiersSatisfaits(
    { piecesNoms: mb.pieces.map((p) => p.nomFichier), corpsTexte: textes.join('\n') },
    candidats.map((c) => ({ dossierId: c.dossierId, numDau: c.numDau })),
  );
  const distincts = [...new Set(trouves)];

  // (a) UN SEUL candidat → verser TOUTES les pièces
  if (distincts.length === 1) {
    const dossierId = distincts[0];
    const cand = candidats.find((c) => c.dossierId === dossierId)!;
    if (!cand.dejaSatisfait) await deps.marquerSatisfait(cand.demandeId, dossierId); // bascule en Archives AVANT le dépôt (garde saine)
    const dejaEmpreintes = await deps.empreintesEnGed(dossierId);
    const deposees: string[] = []; const ignorees: string[] = []; const echecs: string[] = [];
    for (const p of mb.pieces) {
      const emp = empreinteDe(p.contenu);
      if (dejaEmpreintes.has(emp)) { ignorees.push(p.nomFichier); continue; } // déjà en GED → on n'ajoute pas
      const r = await deps.deposer(dossierId, { nomFichier: p.nomFichier, typeMime: p.typeMime, contenu: p.contenu }, expediteur, messageId);
      if (r.ok) { deposees.push(p.nomFichier); dejaEmpreintes.add(emp); } else echecs.push(`${p.nomFichier} (${r.motif})`);
    }
    const carac = await deps.caracteristiques(dossierId);
    await deps.envoyerAlerte(`Versement GED — permis N°${carac?.numDau ?? '?'} (${deposees.length} pièce(s))`, corpsSucces(carac, deposees, ignorees, echecs, expediteur));
    await deps.journaliser({ messageId, profil, issue: 'verse', dossierId, expediteur });
    return { issue: 'verse', dossierId, deposees, ignorees, echecs };
  }

  // (b) PLUSIEURS candidats → ne rien verser, alerter pour trancher
  if (distincts.length > 1) {
    const caracs = await Promise.all(distincts.map((id) => deps.caracteristiques(id)));
    await deps.envoyerAlerte(`Versement GED à trancher — ${distincts.length} permis en concurrence`, corpsAmbigu(caracs, expediteur));
    await deps.journaliser({ messageId, profil, issue: 'ambigu', dossierId: null, expediteur });
    return { issue: 'ambigu', candidats: distincts.length };
  }

  // (c)/(d) AUCUN candidat → forward du mail complet + alerte (avec motif si extraction échouée)
  const issue: IssueDepot = motifs.length > 0 ? 'extraction_echec' : 'aucun_candidat';
  const sujet = issue === 'extraction_echec' ? 'Versement GED impossible — numéro de permis illisible' : 'Versement GED impossible — permis inconnu';
  await deps.forwarder(mb, sujet, corpsAucun(issue, motifs, expediteur));
  await deps.journaliser({ messageId, profil, issue, dossierId: null, expediteur });
  return { issue };
}

// ── Implémentation RÉELLE (production) ────────────────────────────────────────
/**
 * Charge l'ensemble des ADRESSES CONNUES : `config_veille.depot_adresses_connues` (virgules) ∪ toutes les adresses de
 * collaborateur (statut IGNORÉ — une adresse désactivée reste connue). Normalisées en minuscules. Lectures BEST-EFFORT.
 */
export async function chargerAdressesConnues(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const { chargerConfigVeille } = await import('./veilleConfig');
    const cfg = await chargerConfigVeille();
    for (const a of cfg.depotAdressesConnues.split(',')) { const n = normaliserAdresse(a); if (n !== '') set.add(n); }
  } catch { /* config indisponible → on garde au moins les collaborateurs */ }
  try {
    const { rows } = await query<{ email: string }>(`SELECT email FROM collaborateur`); // statut ignoré (désactivé = adresse connue)
    for (const r of rows) { const n = normaliserAdresse(r.email); if (n !== '') set.add(n); }
  } catch { /* table collaborateur indisponible → on garde au moins la config */ }
  return set;
}

/** Extraction du texte d'un PDF côté SERVEUR via pdfjs-dist (worker désactivé). Non-PDF ou échec → null (jamais d'exception). */
async function extraireTextePdfReel(contenu: Buffer, typeMime: string | null): Promise<string | null> {
  if (typeMime !== 'application/pdf') return null;
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(contenu), isEvalSupported: false, useSystemFonts: true }).promise;
    let texte = '';
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const contenuTexte = await page.getTextContent();
      texte += contenuTexte.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
    }
    await doc.destroy();
    return texte;
  } catch (e) {
    console.error('[depotManuel] extraction PDF impossible', { message: e instanceof Error ? e.message : String(e) });
    return null; // dégradation distinguable : « non extractible » (→ issue extraction_echec), jamais un silence
  }
}

export function depsReellesDepotManuel(): DepsDepotManuel {
  return {
    dejaTraite: async (messageId) => {
      const { rows } = await query<{ un: number }>(`SELECT 1 AS un FROM depot_manuel_journal WHERE message_id = $1`, [messageId]);
      return rows.length > 0;
    },
    journaliser: async (e) => {
      await query(
        `INSERT INTO depot_manuel_journal (message_id, profil_boite, issue, dossier_id, expediteur)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (message_id) DO NOTHING`,
        [e.messageId, e.profil, e.issue, e.dossierId, e.expediteur],
      );
    },
    extraireTextePdf: extraireTextePdfReel,
    chargerCandidats: async () => {
      // Un CANDIDAT = un dossier rattaché à une demande (actif), qu'il soit déjà satisfait (Archives) ou non (en cours).
      //   demande_id retenu = de préférence une demande où il reste À obtenir (satisfait_le NULL), pour que marquerSatisfait agisse.
      const { rows } = await query<{ dossier_id: number; num_dau: string; demande_id: number; deja_satisfait: boolean }>(
        `SELECT s.id::int AS dossier_id, s.num_dau,
                (array_agg(dd.demande_id ORDER BY (dd.satisfait_le IS NULL) DESC, dd.demande_id))[1]::int AS demande_id,
                bool_or(dd.satisfait_le IS NOT NULL) AS deja_satisfait
           FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
          WHERE dd.actif
          GROUP BY s.id, s.num_dau`,
      );
      return rows.map((r) => ({ dossierId: r.dossier_id, numDau: r.num_dau, demandeId: r.demande_id, dejaSatisfait: r.deja_satisfait }));
    },
    empreintesEnGed: async (dossierId) => {
      const { rows } = await query<{ e: string }>(`SELECT empreinte_sha256 AS e FROM dossier_document WHERE dossier_id = $1 AND empreinte_sha256 IS NOT NULL`, [dossierId]);
      return new Set(rows.map((r) => r.e));
    },
    marquerSatisfait: async (demandeId, dossierId) => {
      const { marquerDossierSatisfait } = await import('../veille/demandeReponseRepo');
      await marquerDossierSatisfait(demandeId, dossierId, null, 'versement automatique (e-mail)');
    },
    deposer: async (dossierId, piece, expediteur, messageId) => {
      const { deposerDocumentSurPermis } = await import('./demandeRepo');
      const r = await deposerDocumentSurPermis(dossierId, piece.contenu, piece.typeMime, piece.nomFichier, expediteur, `versement automatique — message ${messageId}`);
      return r.ok ? { ok: true } : { ok: false, motif: r.motif };
    },
    caracteristiques: async (dossierId) => {
      const { rows } = await query<{
        reference: string; num_dau: string; type: string; adresse: string | null; commune_nom: string | null; code_insee: string;
        nature: string | null; date_autorisation: string | null; surface: string | number | null; logements: number | null;
      }>(
        `SELECT dm.reference, s.num_dau, s.type,
                nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
                c.nom AS commune_nom, s.code_insee, s.nature_projet_completee AS nature,
                s.date_reelle_autorisation::text AS date_autorisation, s.surf_creee AS surface, s.nb_lgt_tot_crees AS logements
           FROM sitadel_dossier s
           JOIN demande_dossier dd ON dd.dossier_id = s.id AND dd.actif
           JOIN demande dm ON dm.id = dd.demande_id
           LEFT JOIN commune c ON c.code_insee = s.code_insee
          WHERE s.id = $1
          ORDER BY dm.id LIMIT 1`,
        [dossierId],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        reference: r.reference, numDau: r.num_dau, type: r.type, adresse: r.adresse, communeNom: r.commune_nom, codeInsee: r.code_insee,
        natureTravaux: r.nature, dateAutorisation: r.date_autorisation, surface: r.surface === null ? null : String(r.surface), logements: r.logements,
      };
    },
    envoyerAlerte: async (sujet, corps) => {
      const { chargerConfigVeille } = await import('./veilleConfig');
      const email = (await chargerConfigVeille()).alerteEmail.trim();
      if (email === '') return; // pas de destinataire configuré → rien à envoyer (le versement a bien eu lieu ; journalisé)
      const { lireConfigEmail, obtenirTransporteur, envoyerAlerte } = await import('../email');
      const cfg = lireConfigEmail();
      if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
      await envoyerAlerte(obtenirTransporteur(cfg), cfg.from, { to: email, sujet, corps });
    },
    forwarder: async (mb, sujet, corps) => {
      const { chargerConfigVeille } = await import('./veilleConfig');
      const email = (await chargerConfigVeille()).alerteEmail.trim();
      if (email === '') return;
      const { lireConfigEmail, obtenirTransporteur, envoyerForwardGed } = await import('../email');
      const cfg = lireConfigEmail();
      if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
      const attachments = mb.pieces.map((p) => ({ filename: p.nomFichier, content: p.contenu, contentType: p.typeMime ?? 'application/octet-stream' }));
      await envoyerForwardGed(obtenirTransporteur(cfg), cfg.from, { to: email, sujet, corps, attachments });
    },
  };
}

/**
 * Bundle branché dans la relève : l'ensemble des adresses connues (pour la sélection serveur + le déclencheur) et le closure
 * `traiter`. Présent UNIQUEMENT en mode appliqué (les tests de relève qui ne le passent pas gardent un comportement inchangé).
 */
export interface BrancheDepot { adresses: Set<string>; traiter: (mb: MessageBoite) => Promise<ResultatDepot> }
export async function brancheDepotManuel(profil: ProfilBoite): Promise<BrancheDepot> {
  const adresses = await chargerAdressesConnues();
  const deps = depsReellesDepotManuel();
  return {
    adresses,
    traiter: async (mb) => {
      if (!estCandidatDepot({ objet: mb.message.objet, deAdresse: mb.message.deAdresse, nbPieces: mb.pieces.length }, adresses)) return { issue: 'non_traite' };
      return traiterDepotManuel(mb, profil, deps);
    },
  };
}
