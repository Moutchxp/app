import { query } from '../db/client';
import { normaliserTexte } from '../gestion/annuaire';
import { affecterContact, rattacherBienAuSyndic, syndicsConnusPourAdresse } from '../gestion/doublonSyndicRepo';
import { enregistrerSyndic, ficheSyndic } from '../gestion/syndicRepo';
import { cleImmeuble, validerSyndic, versFormulaire, versSaisie, type ImmeubleSaisi } from '../gestion/syndics';
import type { Auteur } from '../gestion/gestes';
import type { NouveauContactSyndic, SyndicDuBien, SyndicSuggere } from './syndicLocation';
export type { NouveauContactSyndic, SyndicDuBien, SyndicSuggere } from './syndicLocation';

/**
 * ══ 🔴🔴 TUILE LOCATION — LE SYNDIC DU BIEN, PAR LES FONCTIONS DE LA GESTION (Arno, 17/10/2026). IMPUR (base). ═════════
 *
 * « Réutilise les composants et fonctions syndic de la Gestion ; aucune nouvelle notion si elle existe déjà. » (Arno)
 *   · la SUGGESTION « Syndic déjà connu pour cette adresse » : `syndicsConnusPourAdresse` de la Gestion (un autre bien du
 *     portefeuille à la même adresse, une adresse de la même copropriété), complétée par le syndic déclaré sur un bien de
 *     la Location à la même adresse. LECTURE SEULE — jamais de rattachement sans clic ;
 *   · le RATTACHEMENT, une fois le bien créé : `rattacherBienAuSyndic` (le syndic reçoit l'immeuble du bien comme
 *     copropriété, par la porte unique `enregistrerSyndic`), puis `affecterContact` pour chaque contact du cabinet
 *     désigné pour ce bien, puis l'ajout des NOUVEAUX contacts à l'annuaire interne du syndic (même porte unique) ;
 *   · la création d'un syndic se fait dans la modale de la Gestion (`FicheSyndic`), qui écrit dans son annuaire.
 * Le lien bien ↔ syndic de la Gestion passe par l'« Immeuble » du bien : un bien créé dans la Location le reçoit (son
 * adresse), ce qui le relie à la copropriété du syndic exactement comme un bien importé.
 */

export async function syndicsPourAdresse(adresse: ImmeubleSaisi): Promise<SyndicSuggere[]> {
  if (adresse.libelle.trim() === '') return [];
  const connus = await syndicsConnusPourAdresse(adresse, { parcelle: false }).catch(() => []);
  const vus = new Map<number, SyndicSuggere>();
  for (const c of connus) {
    if (!vus.has(c.syndic.id)) {
      vus.set(c.syndic.id, { id: c.syndic.id, nom: c.syndic.nom, ville: c.syndic.ville, motif: c.biens.length > 0 ? 'un autre bien du portefeuille à cette adresse' : 'une copropriété à cette adresse' });
    }
  }
  // Un bien de la LOCATION à la même adresse, avec un syndic déclaré (colonne 374), compte aussi.
  const cle = normaliserTexte([adresse.libelle, adresse.commune].filter((x) => x).join(' '));
  try {
    const { rows } = await query<{ id: string; nom: string; ville: string | null }>(
      `SELECT DISTINCT s.id::text, s.nom, s.ville FROM gestion_annuaire_lot lo JOIN gestion_syndic s ON s.id = lo.syndic_id AND s.supprime_le IS NULL
        WHERE lo.adresse_normalisee = $1 AND lo.gestion_fin IS NULL AND lo.absent_le IS NULL`, [cle]);
    for (const r of rows) {
      const id = Number(r.id);
      if (!vus.has(id)) vus.set(id, { id, nom: r.nom, ville: r.ville, motif: 'un autre bien du portefeuille à cette adresse' });
    }
  } catch { /* sans la colonne 374 : la voie de la Gestion suffit */ }
  return [...vus.values()];
}


const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Vérifie la saisie des nouveaux contacts AVANT toute écriture : un nom, et un téléphone ou un e-mail. */
export function refusNouveauxContacts(l: readonly NouveauContactSyndic[]): string | null {
  for (const [i, c] of l.entries()) {
    if (texte(c.nom, 200) === '') return `Contact du syndic ${i + 1} : le nom est obligatoire.`;
    if (texte(c.email, 200) === '' && texte(c.telephone, 40) === '') return `Contact du syndic ${i + 1} : un téléphone ou un e-mail.`;
  }
  return null;
}

/** Après la création du bien : rattache le syndic par l'immeuble du bien, désigne ses contacts, enrichit son annuaire. */
export async function rattacherSyndicAuBien(lotId: number, s: SyndicDuBien, adresse: ImmeubleSaisi, auteur: Auteur):
  Promise<{ ok: true } | { ok: false; motif: string }> {
  const r = await rattacherBienAuSyndic(s.id, adresse, null, auteur, lotId);
  if (!r.ok) return r;
  await query('UPDATE gestion_annuaire_lot SET syndic_id = $2 WHERE id = $1', [lotId, s.id]).catch(() => undefined);
  const fiche = await ficheSyndic(s.id);
  if (fiche === null) return { ok: false, motif: 'Ce syndic n’existe plus.' };
  const cle = cleImmeuble(adresse.libelle);
  const copro = fiche.coproprietes.find((c) => c.cle === cle || (c.adresses ?? []).some((a) => cleImmeuble(a.libelle) === cle || a.cle === cle));
  const coproCle = copro?.cle ?? cle;
  for (const contactId of [...new Set(s.contactsIds ?? [])]) {
    const a = await affecterContact(s.id, contactId, coproCle, auteur);
    if (!a.ok) return a;
  }
  const nouveaux = s.nouveauxContacts ?? [];
  if (nouveaux.length > 0) {
    const relue = await ficheSyndic(s.id);
    if (relue === null) return { ok: false, motif: 'Ce syndic n’existe plus.' };
    const saisie = versSaisie(versFormulaire(relue));
    for (const c of nouveaux) {
      saisie.contacts.push({
        id: null, titre: texte(c.fonction, 120), prenom: texte(c.prenom, 120), nom: texte(c.nom, 200),
        civilite: c.civilite === 'M.' || c.civilite === 'Mme' ? c.civilite : null, tousImmeubles: false, immeubles: [coproCle],
        coordonnees: [
          ...(texte(c.telephone, 40) !== '' ? [{ id: null, sorte: 'telephone' as const, libelle: 'Téléphone', valeur: texte(c.telephone, 40).replace(/[^\d+]/g, '') }] : []),
          ...(texte(c.email, 200) !== '' ? [{ id: null, sorte: 'email' as const, libelle: 'E-mail', valeur: texte(c.email, 200) }] : []),
        ],
      });
    }
    const v = validerSyndic(JSON.parse(JSON.stringify({ ...saisie, confirmeDoublons: true })));
    if (!v.ok) return { ok: false, motif: v.motif };
    const e = await enregistrerSyndic(s.id, v.syndic, auteur);
    if (!e.ok) return { ok: false, motif: e.motif };
  }
  return { ok: true };
}
