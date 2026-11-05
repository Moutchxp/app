// ══ 🔴🔴 MON ESPACE — LE COMPROMIS COMMUN (Arno, 05/11/2026). IMPUR (base + envoi). Règles et textes : `compromisCommun.ts`. ══════════════════
// Après la création d'un compromis depuis « Mon espace » : le compromis est MARQUÉ (règle « clients à renseigner », migration 459), puis un mail
// part à chaque collaborateur d'un côté, sauf le créateur — par le canal des mails internes de l'application (`transportParDefaut` : factice
// sous les tests ; en RECETTE, le verrou réseau intercepte l'envoi et le dépose dans la boîte de test, rien ne part). Chaque mail est journalisé
// (`mon_espace_mail_compromis`). Sans la 459 : rien n'est marqué, aucun mail ne part, et le récapitulatif le dit. Ne lève jamais.
// Pas de `import 'server-only'` (même convention que les dépôts de « Mon espace », lus par les épreuves).
import { randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { AuteurTx } from '../transaction/repo';
import type { DossierSaisie } from '../transaction/saisie';
import { LIBELLE_SOCIETE } from '../transaction/modele';
import { chargerConfigGestion } from '../gestion/config';
import { fabriquerMessageId } from '../gestion/envoiGmail';
import { transportParDefaut, type TransportDemande } from '../gestion/envoiDemandeTache';
import { adresseApplication } from '../gestion/adresseApplication';
import { colonneExisteMemo } from '../location/sondeLocation';
import { clientsRenseignes, collaborateursAPrevenir, cotesDuCompte, lienCompromis, mailCommun, MOT_COTE, type CoteVente } from './compromisCommun';

export const compromisCommunDisponible = (): Promise<boolean> => colonneExisteMemo('mon_espace_compromis_commun', 'vente_id');

/** Les compromis marqués « commun » parmi ces ventes (sans la 459 : aucun). LECTURE SEULE. */
export async function ventesCommunes(ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0 || !(await compromisCommunDisponible())) return new Set();
  const { rows } = await query<{ id: string }>('SELECT vente_id::text AS id FROM mon_espace_compromis_commun WHERE vente_id = ANY($1::bigint[])', [[...ids]]);
  return new Set(rows.map((r) => Number(r.id)));
}

export interface MailPrevenu { compteId: number; nom: string; email: string | null; envoye: boolean; motif: string | null; variante: 'clients_saisis' | 'clients_a_saisir' }
export interface RecapCommun {
  mandat: string | null; structure: string; cotes: { entree: string | null; sortie: string | null }; partage: string[];
  /** Les collaborateurs prévenus (ou qu'on a tenté de prévenir), avec l'issue de chaque mail ; vide : le créateur seul sur les deux côtés. */
  mails: MailPrevenu[];
  /** Faux sans la migration 459 : aucun mail n'est parti (le récapitulatif le dit). */
  disponible: boolean;
}

interface CompteLu { id: number; prenom: string | null; nom: string | null; identifiant: string }
const nomDe = (c: CompteLu | undefined, id: number): string => (c === undefined ? `compte ${id}` : [c.prenom, c.nom].filter((x) => x && x.trim() !== '').join(' ') || c.identifiant);
const pct = (x: number): string => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
const eurHt = (x: number): string => `${x.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT`;

/** Le partage de la commission, en mots (une ligne par partie). PUR. */
export function partageEnMots(parties: DossierSaisie['parties'], nom: (id: number) => string): string[] {
  return parties.map((p) => {
    const part = p.pourcentage !== null ? pct(p.pourcentage) : p.montantHt !== null ? eurHt(p.montantHt) : 'à définir';
    if (p.sorte === 'exterieure') return `partenaire extérieur ${p.nom ?? ''} — ${part}`.replace(/\s+/g, ' ');
    const cote = p.sorte === 'entree' ? 'entrée du mandat' : p.sorte === 'sortie' ? 'sortie du mandat' : 'entrée et sortie du mandat';
    return `${cote} — ${p.compteId === null ? 'à définir' : nom(p.compteId)}${p.societe ? ` (${LIBELLE_SOCIETE[p.societe]})` : ''} : ${part}`;
  });
}

/** Le partage est-il défini, côté serveur : une partie pour chaque côté (ou une seule « entrée et sortie »), chacune avec sa part. PUR. */
export function partageDefiniSaisie(parties: DossierSaisie['parties']): boolean {
  const avecPart = parties.filter((p) => p.sorte !== 'exterieure' && (p.pourcentage !== null || p.montantHt !== null));
  const tient = (c: CoteVente): boolean => avecPart.some((p) => p.sorte === c || p.sorte === 'entree_sortie');
  return tient('entree') && tient('sortie');
}

async function journaliser(o: { venteId: number; compteId: number; destinataire: string; objet: string; texte: string; html: string; variante: string;
  statut: 'envoye' | 'echec'; erreur: string | null; messageId: string | null; auteur: AuteurTx }): Promise<void> {
  try {
    await query(
      `INSERT INTO mon_espace_mail_compromis (vente_id, compte_id, destinataire, objet, texte, html, variante, statut, erreur, message_id, auteur_id, auteur_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [o.venteId, o.compteId, o.destinataire, o.objet, o.texte, o.html, o.variante, o.statut, o.erreur, o.messageId, o.auteur.id, o.auteur.libelle]);
  } catch (e) {
    console.error('[mon-espace] journal du mail « compromis commun » impossible', (e as Error)?.message);
  }
}

/**
 * APRÈS LA CRÉATION RÉUSSIE d'un compromis depuis « Mon espace » : le marquer, prévenir les autres collaborateurs, rendre le récapitulatif de la
 * fenêtre de confirmation. Ne lève jamais : une erreur d'envoi est rendue (jamais un faux « envoyé ») et ne défait rien.
 */
export async function apresCreationCompromis(venteId: number, s: DossierSaisie, createurId: number, aujourdhui: string, auteur: AuteurTx,
  deps: { transport?: TransportDemande } = {}): Promise<RecapCommun> {
  const ids = [...new Set([s.entreeId, s.sortieId, ...s.parties.map((p) => p.compteId)].filter((x): x is number => x !== null))];
  const comptes = ids.length === 0 ? [] : (await query<{ id: string; prenom: string | null; nom: string | null; identifiant: string }>(
    'SELECT id::text, prenom, nom, identifiant FROM admin_utilisateur WHERE id = ANY($1::bigint[])', [ids]).catch(() => ({ rows: [] }))).rows
    .map((r) => ({ ...r, id: Number(r.id) }));
  const compte = (id: number): CompteLu | undefined => comptes.find((c) => c.id === id);
  const nom = (id: number): string => nomDe(compte(id), id);
  const partage = partageEnMots(s.parties, nom);
  const recap: RecapCommun = { mandat: s.numeroMandat?.saisi ?? null, structure: LIBELLE_SOCIETE[s.societe],
    cotes: { entree: s.entreeId === null ? null : nom(s.entreeId), sortie: s.sortieId === null ? null : nom(s.sortieId) }, partage, mails: [], disponible: true };
  const aPrevenir = collaborateursAPrevenir(s, createurId);
  if (aPrevenir.length === 0) return recap;
  if (!(await compromisCommunDisponible().catch(() => false))) return { ...recap, disponible: false };
  try {
    await query(`INSERT INTO mon_espace_compromis_commun (vente_id, cree_par, cree_par_libelle) VALUES ($1, $2, $3) ON CONFLICT (vente_id) DO NOTHING`,
      [venteId, auteur.id, auteur.libelle]);
  } catch (e) { console.error('[mon-espace] marque « compromis commun » impossible', (e as Error)?.message); }
  const config = await chargerConfigGestion().catch(() => ({ adresseGestion: 'gestion@criterimmo.fr' }));
  const base = adresseApplication().base;
  for (const id of aPrevenir) {
    const c = compte(id);
    const sesCotes = cotesDuCompte(s, id);
    const clients = sesCotes.reduce((t, cote) => t + clientsRenseignes(s.personnes, cote), 0);
    const variante = clients > 0 ? 'clients_saisis' as const : 'clients_a_saisir' as const;
    const m = mailCommun({ destinataire: { prenom: c?.prenom ?? null, nom: nom(id) }, createur: nom(createurId), quand: aujourdhui, structure: recap.structure,
      mandat: recap.mandat ?? '—', adresse: s.adresseBien, prixVente: s.prixVente, honorairesTtc: s.honorairesTtc, sesCotes, partage, clientsSaisis: clients,
      lien: lienCompromis(base, venteId, sesCotes[0] ?? 'entree') });
    const email = c !== undefined && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.identifiant) ? c.identifiant : null;
    if (email === null) {
      recap.mails.push({ compteId: id, nom: nom(id), email: null, envoye: false, motif: 'aucune adresse e-mail sur son compte', variante });
      continue;
    }
    try {
      const domaine = config.adresseGestion.split('@')[1] ?? 'criterimmo.fr';
      const messageId = fabriquerMessageId(domaine, randomBytes(12).toString('hex'), new Date());
      const r = await (deps.transport ?? transportParDefaut()).envoyer({ de: config.adresseGestion, deNom: 'Mon espace', a: [email], cc: [], cci: [], objet: m.objet,
        corps: m.texte, corpsHtml: m.html, messageId });
      await journaliser({ venteId, compteId: id, destinataire: email, objet: m.objet, texte: m.texte, html: m.html, variante, statut: r.ok ? 'envoye' : 'echec',
        erreur: r.ok ? null : r.motif, messageId: r.ok ? messageId : null, auteur });
      recap.mails.push({ compteId: id, nom: nom(id), email, envoye: r.ok, motif: r.ok ? null : r.motif, variante });
    } catch (e) {
      const motif = (e as Error)?.message || 'erreur inattendue';
      await journaliser({ venteId, compteId: id, destinataire: email, objet: m.objet, texte: m.texte, html: m.html, variante, statut: 'echec', erreur: motif, messageId: null, auteur });
      recap.mails.push({ compteId: id, nom: nom(id), email, envoye: false, motif, variante });
    }
  }
  return recap;
}

export { MOT_COTE };
