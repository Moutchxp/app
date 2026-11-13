/**
 * ══ 🔴🔴 LE COMPTE RENDU DE PRÉ-VISITE, EN LECTURE (Arno, 13/11/2026) — MODULE PUR ═══════════════════════════════════════════════════════════
 * « Voir le compte rendu » (case « 2 Pré-visite », pré-visite effectuée) : le texte tel qu'enregistré, qui l'a saisi et quand, les pièces
 * jointes, et l'envoi par mail — pour CHAQUE destinataire : son nom, sa famille (locataire / propriétaire / interne), la date et l'heure, l'état
 * (envoyé / échec / non envoyé). Tout vient du JOURNAL DES ENVOIS (`gestion_location_mail_avis`, sorte `previsite_compte_rendu`) : rien n'est
 * recalculé, rien n'est écrit. 🔴 CONFIDENTIALITÉ : aucune adresse de client n'est rendue — un destinataire se dit par son NOM ; une adresse
 * qu'aucune fiche ne reconnaît est MASQUÉE (« j…@exemple.fr »). ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export type FamilleDestinataire = 'locataire' | 'proprietaire' | 'interne' | 'autre';
export type EtatEnvoiCr = 'envoye' | 'echec' | 'non_envoye';
export interface DestinataireCr { nom: string; famille: FamilleDestinataire; quand: string | null; etat: EtatEnvoiCr; motif: string | null }
export interface PieceCr { id: number; nom: string; taille: number }
export interface CompteRenduAffiche {
  /** Le texte du compte rendu, tel qu'enregistré (le mail interne) ; null : aucun compte rendu saisi. */
  texte: string | null; objet: string | null; saisiPar: string | null; saisiLe: string | null;
  pieces: PieceCr[]; destinataires: DestinataireCr[];
  /** Aucun mail n'est parti (aucun envoi réussi). */
  aucunEnvoi: boolean;
  /** 🔴 Arno (13/11/2026, lot C) — les vocaux du compte rendu : INTERNES, écoutables ici, jamais envoyés. */
  vocaux?: PieceCr[];
}

/** Une ligne du journal des envois (sorte `previsite_compte_rendu`). */
export interface EnvoiJournalCr { destinataires: string[]; copies: string[]; objet: string; texte: string; statut: 'envoye' | 'echec'; erreur: string | null;
  envoyeLe: string; auteur: string; pieceIds: number[] }
export interface AnnuaireCr {
  locataires: readonly { nom: string; prenom: string | null; emails: readonly string[] }[];
  proprietaires: readonly { nom: string; emails: readonly string[] }[];
  /** Les comptes de l'agence (nom affiché, identifiant de connexion = adresse). */
  internes: readonly { nom: string; email: string }[];
  /** Les domaines de l'agence : une adresse inconnue de ces domaines reste « interne », lisible. */
  domainesAgence: readonly string[];
}

const norm = (x: string): string => x.trim().toLowerCase();
const nomComplet = (p: { nom: string; prenom?: string | null }): string => [p.prenom ?? '', p.nom].map((x) => x.trim()).filter(Boolean).join(' ');

/** « j…@exemple.fr » : une adresse sans fiche, jamais lisible en entier. PUR. */
export function adresseMasquee(a: string): string {
  const [l, d] = a.trim().split('@');
  return d === undefined ? '…' : `${(l ?? '').slice(0, 1)}…@${d}`;
}

/** Qui est cette adresse : son nom et sa famille. PUR. */
export function identifier(adresse: string, a: AnnuaireCr): { nom: string; famille: FamilleDestinataire; cle: string } {
  const x = norm(adresse);
  const loc = a.locataires.find((l) => l.emails.some((e) => norm(e) === x));
  if (loc) return { nom: nomComplet(loc), famille: 'locataire', cle: `locataire:${nomComplet(loc)}` };
  const pro = a.proprietaires.find((p) => p.emails.some((e) => norm(e) === x));
  if (pro) return { nom: pro.nom, famille: 'proprietaire', cle: `proprietaire:${pro.nom}` };
  const int = a.internes.find((i) => norm(i.email) === x);
  if (int) return { nom: int.nom, famille: 'interne', cle: `interne:${x}` };
  const domaine = x.split('@')[1] ?? '';
  if (a.domainesAgence.map(norm).includes(domaine)) return { nom: adresse.trim(), famille: 'interne', cle: `interne:${x}` };
  return { nom: adresseMasquee(adresse), famille: 'autre', cle: `autre:${x}` };
}

/**
 * Le compte rendu affiché, depuis le journal des envois. Le texte : celui du mail INTERNE (aucun locataire parmi ses destinataires), sinon le
 * premier ; qui / quand : le suivi de la pré-visite (« effectuée par … le … »), sinon le premier envoi. Les locataires du préavis qu'aucun mail
 * n'a atteints : « non envoyé ». Ordre : par famille (locataires, propriétaires, interne, autres), puis par nom. PUR.
 */
export function compteRenduAffiche(envois: readonly EnvoiJournalCr[], a: AnnuaireCr, suivi: { effectueeLe: string | null; effectueePar: string | null },
  pieces: readonly PieceCr[] = []): CompteRenduAffiche {
  const tries = [...envois].sort((x, y) => x.envoyeLe.localeCompare(y.envoyeLe));
  const estLocataire = (adr: string) => identifier(adr, a).famille === 'locataire';
  const interne = tries.find((m) => !m.destinataires.some(estLocataire)) ?? tries[0] ?? null;
  const vus = new Map<string, DestinataireCr>();
  for (const m of tries) {
    for (const adr of [...m.destinataires, ...m.copies]) {
      const q = identifier(adr, a);
      const avant = vus.get(q.cle);
      // un même destinataire, plusieurs envois : un envoi réussi l'emporte sur un échec ; à égalité, le plus récent
      if (avant !== undefined && avant.etat === 'envoye' && m.statut !== 'envoye') continue;
      vus.set(q.cle, { nom: q.nom, famille: q.famille, quand: m.envoyeLe, etat: m.statut === 'envoye' ? 'envoye' : 'echec', motif: m.statut === 'envoye' ? null : m.erreur });
    }
  }
  if (tries.length > 0) {
    for (const l of a.locataires) {
      const cle = `locataire:${nomComplet(l)}`;
      if (!vus.has(cle)) vus.set(cle, { nom: nomComplet(l), famille: 'locataire', quand: null, etat: 'non_envoye', motif: l.emails.length === 0 ? 'pas d’adresse e-mail' : null });
    }
  }
  const RANG: Record<FamilleDestinataire, number> = { locataire: 0, proprietaire: 1, interne: 2, autre: 3 };
  const destinataires = [...vus.values()].sort((x, y) => RANG[x.famille] - RANG[y.famille] || x.nom.localeCompare(y.nom, 'fr'));
  return {
    texte: interne?.texte ?? null, objet: interne?.objet ?? null,
    saisiPar: suivi.effectueePar ?? interne?.auteur ?? null, saisiLe: suivi.effectueeLe ?? interne?.envoyeLe ?? null,
    pieces: [...pieces], destinataires, aucunEnvoi: !tries.some((m) => m.statut === 'envoye'),
  };
}

/** « le 13/11/2026 à 13h52 » (heure de Paris). PUR. */
export function quandFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const v = (t: string) => f.find((x) => x.type === t)?.value ?? '';
  return `le ${v('day')}/${v('month')}/${v('year')} à ${v('hour')}h${v('minute')}`;
}

export const LIBELLE_FAMILLE_CR: Record<FamilleDestinataire, string> = { locataire: 'Locataire', proprietaire: 'Propriétaire', interne: 'Interne', autre: 'Autre' };
export const LIBELLE_ETAT_CR: Record<EtatEnvoiCr, string> = { envoye: 'envoyé', echec: 'échec', non_envoye: 'non envoyé' };
export const AUCUN_ENVOI_CR = 'Compte rendu conservé en interne — aucun mail envoyé';
export const AUCUN_CR = 'Aucun compte rendu saisi';
