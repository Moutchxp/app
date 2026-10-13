import { query } from '../db/client';
import { ficheLot, type PersonneAnnuaire } from './annuaireRepo';
import { categorieDuBien } from './categorieBien';
import { libelleBien } from './classementBien';
import { contactsDeLImmeuble } from './contactsImmeubleRepo';
import { civiliteDeTexte } from './mailSyndic';
import { lireCartesDuBien, lireCategoriesDuBien } from './partieCategorieRepo';
import { sqlLiensDuBien } from './rattachement';
import { ficheSyndic } from './syndicRepo';
import { cleImmeuble } from './syndics';
/* 🔴🔴 LOT PARTIES-SYNDIC-ET-IMMEUBLE — les rôles « Syndic — … », « Gardien »… écrits UNE fois, pour toutes les vues. */
import { roleCabinet, roleContactSyndic, roleImmeuble } from './partiesSyndic';
import { estAdresseSansReponse } from './typologie';
import { rangerSuggestions, type GroupeSuggestions, type SuggestionAdresse, type TonSuggestion } from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS — CE QU'ON LIT QUAND ON ÉCRIT DEPUIS UNE FICHE BIEN ═════════
 *
 * Deux choses, lues à l'ouverture du message, en LECTURE SEULE :
 *   · la CIBLE « bien » pré-cochée — le bien d'origine (son lot, son adresse), posée sur le mail par le chemin
 *     existant des biens cochés avant l'envoi (`gestion_envoi_cible` → `gestion_rattachement` confirmé) ;
 *   · les ADRESSES liées au bien, en trois groupes (voir `suggestionsBien.ts`).
 *
 * 🔴 RIEN N'EST RÉINVENTÉ : la fiche du bien (`ficheLot`) donne les clients et leurs e-mails propres ; les cartes de
 * contact et les catégories rangées (`lireCartesDuBien`, `lireCategoriesDuBien`) donnent les e-mails rattachés à
 * leur partie — ceux-là même que « Historique du bien » range sous chaque partie ; la fiche du syndic et le carnet
 * de l'immeuble donnent le groupe « Immeuble » ; les adresses relevées sur les mails du bien (`sqlLiensDuBien`) donnent
 * le reste.
 */

export interface EcrireDepuisLeBien {
  /** Le bien d'origine, prêt à poser dans `brouillon.cibles`. */
  cible: { sorte: 'lot'; cle: string; id: number; libelle: string; categorie: 'logement' | 'parking' | 'cave' };
  groupes: GroupeSuggestions[];
  /**
   * LOT MAIL-DEPUIS-BIEN-MISE-EN-PAGE-OBJET-DRIVE — le dossier Drive DÉJÀ associé au bien (« Dossier Drive du lot »), pour
   * que le bouton Drive de la rédaction s'ouvre dessus. `null` = aucun. Lu dans NOTRE base (l'arbre), jamais écrit.
   */
  dossierDrive: { id: string; nom: string } | null;
}

const propre = (x: string | null | undefined): string => (x ?? '').trim();
const nomPrenom = (p: Pick<PersonneAnnuaire, 'nom' | 'prenom'>): string =>
  [p.nom, p.prenom ?? ''].map((x) => x.trim()).filter((x) => x !== '').join(' ');
const emailsPropres = (p: PersonneAnnuaire): string[] =>
  p.contacts.filter((c) => c.sorte === 'email' && !c.absent).map((c) => c.valeur.trim().toLowerCase());

const ROLE_COTE: Record<'proprietaire' | 'locataire' | 'ancien_locataire', string> = {
  proprietaire: 'Contact du propriétaire',
  locataire: 'Contact du locataire',
  ancien_locataire: 'Contact d’un ancien locataire',
};

/** Lit tout ce qu'il faut pour écrire depuis la fiche du bien `lotId`. `null` = bien inconnu. LECTURE SEULE. */
export async function ecrireDepuisLeBien(lotId: number): Promise<EcrireDepuisLeBien | null> {
  const lu = await ficheLot(lotId);
  if (lu.etat !== 'ok') return null;
  const f = lu.data;
  const [cartes, categories] = await Promise.all([lireCartesDuBien(f.numero), lireCategoriesDuBien(f.numero)]);

  // ── ① CLIENTS DE L'AGENCE — chaque partie : ses e-mails propres, puis ceux rattachés à sa partie ────────────────
  const clients: SuggestionAdresse[] = [];
  const rattachesDuCote = (cote: 'proprietaire' | 'locataire' | 'ancien_locataire', locataireId: number | null,
    ton: TonSuggestion): SuggestionAdresse[] => {
    const out: SuggestionAdresse[] = [];
    for (const c of cartes) {
      if (c.cote !== cote || (cote === 'ancien_locataire' && c.locataireId !== locataireId)) continue;
      const nom = [c.prenom, c.nom].map(propre).filter((x) => x !== '').join(' ');
      out.push({
        adresse: c.adresse, nom: nom === '' ? null : nom, role: propre(c.qualite) || ROLE_COTE[cote], ton, propre: false,
        civilite: civiliteDeTexte(c.civilite), nomFamille: propre(c.nom) || null,
      });
    }
    // Une adresse rangée de ce côté sans carte (cas fréquent : rangée d'un geste, jamais décrite).
    if (cote !== 'ancien_locataire') {
      for (const k of categories) {
        if (k.retenue?.categorie !== cote) continue;
        out.push({ adresse: k.adresse, nom: null, role: ROLE_COTE[cote], ton, propre: false, civilite: null, nomFamille: null });
      }
    }
    return out;
  };
  const personne = (p: PersonneAnnuaire, role: string, ton: TonSuggestion): SuggestionAdresse[] =>
    emailsPropres(p).map((adresse) => ({
      adresse, nom: nomPrenom(p), role, ton, propre: true, civilite: civiliteDeTexte(p.civilite), nomFamille: propre(p.nom) || null,
    }));
  const proprietaires = f.proprietaires.filter((p) => !p.archive);
  for (const p of proprietaires) clients.push(...personne(p, 'Propriétaire', 'proprietaire'));
  clients.push(...rattachesDuCote('proprietaire', null, 'proprietaire'));
  for (const p of f.occupants.filter((x) => !x.archive)) clients.push(...personne(p, 'Locataire', 'locataire'));
  clients.push(...rattachesDuCote('locataire', null, 'locataire'));
  for (const p of f.anciensOccupants.filter((x) => !x.archive)) {
    clients.push(...personne(p, 'Ancien locataire', 'ancien_locataire'));
    clients.push(...rattachesDuCote('ancien_locataire', p.id, 'ancien_locataire'));
  }

  // ── ② IMMEUBLE — contacts du syndic de la copropriété, son e-mail générique, puis le carnet ─────────────────────
  const immeuble: SuggestionAdresse[] = [];
  const cle = cleImmeuble(f.immeuble);
  if (cle !== '') {
    const { rows } = await query<{ cle: string; syndic_id: string }>(
      `SELECT c.cle_immeuble AS cle, cs.syndic_id::text
         FROM gestion_copropriete c
         JOIN gestion_copropriete_syndic cs ON cs.copropriete_id = c.id AND cs.fin IS NULL
         JOIN gestion_syndic s ON s.id = cs.syndic_id AND s.supprime_le IS NULL
        WHERE c.cle_immeuble = $1
           OR c.id = (SELECT a.copropriete_id FROM gestion_copropriete_adresse a WHERE a.cle_immeuble = $1 AND a.retire_le IS NULL)
        LIMIT 1`, [cle]);
    const copro = rows[0];
    const syndic = copro === undefined ? null : await ficheSyndic(Number(copro.syndic_id), lotId);
    if (syndic !== null && copro !== undefined) {
      for (const c of syndic.contacts) {
        if (!c.tousImmeubles && !c.immeubles.includes(copro.cle)) continue;
        const nom = [c.prenom, c.nom].map(propre).filter((x) => x !== '').join(' ');
        for (const k of c.coordonnees) {
          if (k.sorte !== 'email') continue;
          immeuble.push({
            adresse: k.valeur, nom: nom === '' ? null : nom,
            role: roleContactSyndic(c.titre), ton: 'syndic', propre: true,
            civilite: c.civilite ?? null, nomFamille: propre(c.nom) || null,
            /* 🔴 LOT DEUX-ECARTS-SUGGESTIONS — le cabinet, visible et cherchable sur la ligne (décision d'Arno). */
            ...(propre(syndic.nom) !== '' ? { cabinet: propre(syndic.nom) } : {}),
          });
        }
      }
      if (propre(syndic.email) !== '') {
        immeuble.push({
          adresse: syndic.email as string, nom: syndic.nom, role: roleCabinet(syndic.nom), ton: 'syndic', propre: true,
          civilite: null, nomFamille: null,
        });
      }
    }
    // Le carnet : le gardien d'abord, puis les autres (conseil syndical, habitants…), dans l'ordre du carnet.
    const carnet = await contactsDeLImmeuble(f.immeuble as string);
    const ordonne = [...carnet.filter((c) => c.categorie === 'gardien'), ...carnet.filter((c) => c.categorie !== 'gardien')];
    for (const c of ordonne) {
      const nom = [c.prenom, c.nom].map(propre).filter((x) => x !== '').join(' ');
      for (const k of c.coordonnees) {
        if (k.sorte !== 'email') continue;
        immeuble.push({
          adresse: k.valeur, nom: nom === '' ? null : nom,
          role: roleImmeuble(c.categorie, c.libelle), ton: 'immeuble',
          propre: true, civilite: c.civilite ?? null, nomFamille: propre(c.nom) || null,
        });
      }
    }
  }

  // ── ③ AUTRES CONTACTS DE L'HISTORIQUE DU BIEN ──────────────────────────────────────────────────────────────────────
  /*
   * ══ 🔴🔴 LOT SUGGESTIONS-DANS-TOUS-COMPOSEURS-DEPUIS-BIEN — TOUTES LES ADRESSES DE L'HISTORIQUE ═════════════════════
   * ARNO : toutes les adresses qui apparaissent dans les mails de l'historique de CE bien (expéditeurs, À, Cc), même
   * sans partie, sauf celles déjà proposées en ① ou ② (`rangerSuggestions` les retire). CE QU'IL FAISAIT AVANT : seules
   * les adresses SANS partie y entraient, triées par nombre de mails.
   *   · l'historique, c'est `sqlLiensDuBien` sur la clé de CE bien : un mail rattaché à plusieurs biens compte pour le
   *     bien de la fiche ouverte ; un mail « sorti du suivi » de ce bien n'y est plus ;
   *   · exclues : nos adresses (`interne`, dont gestion@) et les adresses techniques (`estAdresseSansReponse` :
   *     noreply, mailer-daemon — « Mail Delivery Subsystem » —, postmaster, notifications…) ;
   *   · tri : le dernier échange d'abord ; le nom est celui que les mails affichent, le plus récent.
   */
  const { rows: vues } = await query<{ adresse: string; brute: string | null; n: string; dernier: string | null }>(
    `SELECT a.adresse,
            (array_agg(a.adresse_brute ORDER BY m.recu_le DESC) FILTER (WHERE a.adresse_brute IS NOT NULL))[1] AS brute,
            count(DISTINCT a.message_id)::text AS n, max(m.recu_le)::text AS dernier
       FROM gestion_rattachement r
       JOIN gestion_message_adresse a ON a.message_id = r.message_id
       JOIN gestion_message m ON m.id = a.message_id
      WHERE r.cible_cle = $1 AND ${sqlLiensDuBien('r')}
        AND a.interne = false
        AND a.role IN ('expediteur', 'destinataire', 'copie')
      GROUP BY a.adresse
      ORDER BY max(m.recu_le) DESC NULLS LAST, a.adresse
      LIMIT 400`, [f.numero]);
  const autres: SuggestionAdresse[] = vues
    .filter((v) => v.adresse.includes('@') && !estAdresseSansReponse(v.adresse))
    .map((v) => {
      const nom = /^\s*"?([^"<]+?)"?\s*</.exec(v.brute ?? '')?.[1]?.trim() ?? null;
      const n = Number(v.n);
      return {
        adresse: v.adresse, nom: nom === '' ? null : nom, role: `vue dans ${n} mail${n > 1 ? 's' : ''} du bien`, ton: 'neutre',
        propre: true, civilite: null, nomFamille: null,
      };
    });

  // Le dossier Drive du bien : son identifiant vient de la fiche, son nom de l'arbre (simple attente d'affichage).
  let dossierDrive: EcrireDepuisLeBien['dossierDrive'] = null;
  if ((f.driveDossierId ?? '') !== '') {
    const { rows: arbre } = await query<{ nom: string | null }>(
      `SELECT nom FROM gestion_drive_arbre WHERE drive_id = $1 ORDER BY absent_le NULLS FIRST LIMIT 1`, [f.driveDossierId]);
    dossierDrive = { id: f.driveDossierId as string, nom: (arbre[0]?.nom ?? '').trim() || `Dossier du lot ${f.numero}` };
  }

  return {
    dossierDrive,
    cible: {
      sorte: 'lot', cle: f.numero, id: f.id,
      libelle: libelleBien({ adresse: f.adresse, commune: f.commune, cle: f.numero }),
      categorie: categorieDuBien({ nature: f.nature, typeBien: f.typeBien }),
    },
    groupes: rangerSuggestions({ clients, immeuble, autres }),
  };
}
