import 'server-only';
import { query } from '../../db/client';
import { donneesTableau } from './tableauBordRepo';
import { modifierOrigineActivite, type IssueOrigine } from '../origineProprietaireRepo';
import { appliquerOrigine, consequencesOrigine, resumeConsequences, type LigneConsequence } from './origineConsequences';
import { verifierCommercial } from './suivi';
import { aujourdhuiParis } from './suivi';

type Auteur = { id: number | null; libelle: string };

/**
 * ══ 🔴 Arno (25/10/2026) — LES CONSÉQUENCES D'UNE MODIFICATION DE L'ORIGINE, CALCULÉES PAR LE SERVEUR SANS RIEN ÉCRIRE ═════════════════
 * Les données de l'année de la ligne (les mêmes que les écrans du Suivi), la ligne telle qu'elle SERA écrite (`appliquerOrigine`), et les
 * conséquences avant / après. Les lignes sensibles (variable, net) ne partent qu'à un ADMINISTRATEUR. `enregistrerOrigineActivite` :
 * recalcule ces mêmes conséquences et les écrit au journal avec la modification (une transaction, conflit refusé).
 */
export async function simulerOrigineActivite(activiteId: number, brut: unknown, administrateur: boolean):
  Promise<{ etat: 'ok'; data: { lignes: LigneConsequence[] } } | { etat: 'refus'; motif: string }> {
  if (!Number.isSafeInteger(activiteId) || activiteId <= 0) return { etat: 'refus', motif: 'Ligne inconnue.' };
  const c = verifierCommercial((brut ?? {}) as Record<string, unknown>, true);
  if (!c.ok) return { etat: 'refus', motif: c.motif };
  const ligne = (await query<{ date_signature: string }>('SELECT date_signature::text AS date_signature FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL', [activiteId])).rows[0];
  if (ligne === undefined) return { etat: 'refus', motif: 'Cette location n’existe plus.' };
  // Le calcul se fait avec toutes les données (côté serveur) ; seules les lignes autorisées partent.
  const d = await donneesTableau(Number(ligne.date_signature.slice(0, 4)), true, aujourdhuiParis());
  const a = d.activites.find((x) => String(x.id) === String(activiteId));
  if (a === undefined) return { etat: 'refus', motif: 'Cette location n’est pas dans le Suivi.' };
  const v = c.valeurs;
  const apres = appliquerOrigine(a, {
    origineContact: v.origineContact, origineContactPrecision: v.origineContactPrecision ?? null, apporteurId: v.apporteurId, collegueId: v.collegueId,
    apporteurNom: v.apporteurId === null ? null : d.apporteurs.find((x) => x.id === v.apporteurId)?.nom ?? null,
    collegueLibelle: v.collegueId === null ? null : (d.collegues ?? []).find((x) => x.id === v.collegueId)?.libelle ?? null,
  });
  const ctx = { regles: d.regles, apporteurs: d.apporteurs, retrocessions: d.retrocessions, recurrents: d.recurrents ?? [], aujourdhui: d.aujourdhui };
  const lignes = consequencesOrigine(d.activites, activiteId, apres, ctx, { voirSensible: administrateur, apporteurs: d.apporteurs, collegues: d.collegues });
  return { etat: 'ok', data: { lignes } };
}

export async function enregistrerOrigineActivite(activiteId: number, brut: unknown, empreinte: unknown, auteur: Auteur, administrateur: boolean): Promise<IssueOrigine<{ mot: string }>> {
  const s = await simulerOrigineActivite(activiteId, brut, administrateur);
  if (s.etat !== 'ok') return s;
  return modifierOrigineActivite(activiteId, brut, empreinte, auteur, resumeConsequences(s.data.lignes));
}
