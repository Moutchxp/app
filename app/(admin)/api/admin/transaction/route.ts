import 'server-only';
import { auteurDeLaRequete } from '../../../../lib/gestion/auteur';
import { exigerTransaction } from '../../../../lib/transaction/garde';
import { concerne, estSociete, type Vente } from '../../../../lib/transaction/modele';
import { lireDateActe, lireDossier, lireGestion as lireSaisieGestion, lireModification, lireRetro, lireVente } from '../../../../lib/transaction/saisie';
import {
  acteSigne, annulerGeste, attribuer, creerVente, enregistrerDossier, enregistrerGestion, lireARattacher, lireGestion, lireJournal, lireNegociateurs, lireNotesDoubles,
  lirePersonnes, lireRetrocessions, lireVentes, modifierVente, rattacherRetro, retirerVente, retourCompromis, saisirRetro, transactionDisponible,
} from '../../../../lib/transaction/repo';
import { repartitionDisponible } from '../../../../lib/admin/schemaDroits';
import { lireApporteurs } from '../../../../lib/location/suivi/suiviRepo';
import { lireCaLocation } from '../../../../lib/transaction/locationLue';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';

/**
 * TUILE « TRANSACTION » (Arno, 27/10/2026, migration 433) — la porte de la tuile :
 *   GET  ?vue=societe&societe=criterimmo|macj   ventes, compromis, rétrocessions, montants « à rattacher » de la société ;
 *   GET  ?vue=global                            les ventes des deux sociétés, la gestion du mois, le CA location (lu dans le Suivi) ;
 *   GET  ?vue=journal&entite=…&id=N             l'historique d'une ligne (pour « Annuler ») ;
 *   POST action=vente-saisir {vente} | vente-modifier {id, champs} | vente-retirer {id, retirer}
 *        action=retro-rattacher {id, venteId|null} | retro-saisir {retro}
 *        action=gestion-enregistrer {annee, mois, gestion}
 *        action=annuler {journalId}
 *        action=attribuer {cle, societe|null}   LOT C : la même vente notée chez les deux sociétés, attribuée (ou remise à attribuer)
 *   LOT D (migration 434) :
 *   GET  ?vue=compromis&societe=criterimmo|macj|tous   les compromis en cours (acte non signé) de la société (ou des deux) ;
 *   GET  ?vue=references                               négociateurs (comptes et société du jour), apporteurs (annuaire de la Location), personnes ;
 *   POST action=dossier-enregistrer {id|null, dossier} | acte-signe {id, dateActe} | retour-compromis {id}
 * Sans la migration 433 : les lectures rendent des listes vides (`disponible: false`) et toute écriture est refusée avec ce motif.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });
const ENTITES = ['vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne'];

/** LOT D — ce que les formulaires proposent : les comptes (actifs) et leur société du jour, l'annuaire des apporteurs de la Location, les personnes. */
async function references(aujourdhui: string): Promise<Record<string, unknown>> {
  const lotD = await repartitionDisponible();
  const [negociateurs, apporteurs, personnes] = await Promise.all([
    lireNegociateurs(aujourdhui),
    lireApporteurs().catch(() => []),
    lotD ? lirePersonnes() : Promise.resolve([]),
  ]);
  return { lotD, negociateurs: negociateurs.filter((x) => x.actif), apporteurs: apporteurs.filter((a) => !a.archive).map((a) => ({ id: a.id, nom: a.nom })), personnes };
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerTransaction(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const vue = url.searchParams.get('vue');
  const aujourdhui = aujourdhuiParis();
  try {
    const disponible = await transactionDisponible();
    if (vue === 'societe') {
      const societe = url.searchParams.get('societe');
      if (!estSociete(societe)) return json({ etat: 'refus', motif: 'Société inconnue.' }, 400);
      if (!disponible) return json({ etat: 'ok', data: { disponible, societe, aujourdhui, ventes: [], retrocessions: [], aRattacher: [], doubles: [] } });
      const [ventes, retrocessions, aRattacher, doubles] = await Promise.all([lireVentes(societe), lireRetrocessions(societe), lireARattacher(societe), lireNotesDoubles(societe)]);
      return json({ etat: 'ok', data: { disponible, societe, aujourdhui, ventes, retrocessions, aRattacher, doubles } });
    }
    if (vue === 'global') {
      const location = await lireCaLocation().catch(() => null);
      if (!disponible) return json({ etat: 'ok', data: { disponible, aujourdhui, ventes: [], gestion: [], location } });
      const [ventes, gestion] = await Promise.all([lireVentes(null), lireGestion()]);
      return json({ etat: 'ok', data: { disponible, aujourdhui, gestion, location,
        ventes: ventes.map((v: Vente) => ({ id: v.id, societe: v.societe, statut: v.statut, annee: v.annee, mois: v.mois, honorairesTtc: v.honorairesTtc, libelle: v.libelle,
          double: v.double, sourceFichier: v.sourceFichier, sourceOnglet: v.sourceOnglet, sourceLigne: v.sourceLigne, repartition: v.repartition ?? null })) } });
    }
    if (vue === 'compromis') {
      // LOT D — les compromis en cours (acte non signé) qui comptent pour la société (une part, ou la société de l'historique), ou pour les deux.
      const societe = url.searchParams.get('societe');
      if (societe !== 'tous' && !estSociete(societe)) return json({ etat: 'refus', motif: 'Société inconnue.' }, 400);
      const ref = await references(aujourdhui);
      if (!disponible) return json({ etat: 'ok', data: { disponible, aujourdhui, societe, compromis: [], ...ref } });
      const ventes = await lireVentes(societe === 'tous' ? null : societe);
      const compromis = ventes.filter((v) => v.statut === 'compromis' && (societe === 'tous' ? concerne(v, 'criterimmo') || concerne(v, 'macj') || v.repartition != null : concerne(v, societe)));
      return json({ etat: 'ok', data: { disponible, aujourdhui, societe, compromis, ...ref } });
    }
    if (vue === 'references') return json({ etat: 'ok', data: { disponible, aujourdhui, ...(await references(aujourdhui)) } });
    if (vue === 'journal') {
      const entite = url.searchParams.get('entite') ?? '';
      const id = Number(url.searchParams.get('id'));
      if (!ENTITES.includes(entite) || !Number.isInteger(id) || id <= 0) return json({ etat: 'refus', motif: 'Ligne inconnue.' }, 400);
      return json({ etat: 'ok', data: disponible ? await lireJournal(entite, id) : [] });
    }
    return json({ etat: 'refus', motif: 'Vue inconnue.' }, 400);
  } catch (e) {
    console.error('[transaction] lecture', e);
    return json({ etat: 'erreur', message: 'Lecture impossible.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerTransaction(request);
  if ('refus' in garde) return garde.refus;
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; } catch { return json({ etat: 'refus', motif: 'Requête illisible.' }, 400); }
  const auteur = await auteurDeLaRequete(request);
  const id = Number(corps.id);
  const idValide = Number.isInteger(id) && id > 0;
  const rendre = (r: { ok: true; valeur?: unknown } | { ok: false; motif: string }): Response =>
    (r.ok ? json({ etat: 'ok', data: r.valeur ?? null }) : json({ etat: 'refus', motif: r.motif }, 422));
  try {
    switch (corps.action) {
      case 'vente-saisir': {
        const v = lireVente(corps.vente);
        return v.ok ? rendre(await creerVente(v.valeur, auteur)) : rendre(v);
      }
      case 'vente-modifier': {
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        const ch = lireModification(corps.champs);
        return ch.ok ? rendre(await modifierVente(id, ch.valeur, auteur)) : rendre(ch);
      }
      case 'vente-retirer':
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        return rendre(await retirerVente(id, corps.retirer !== false, auteur));
      case 'retro-rattacher': {
        if (!idValide) return json({ etat: 'refus', motif: 'Rétrocession inconnue.' }, 400);
        const venteId = corps.venteId === null ? null : Number(corps.venteId);
        if (venteId !== null && (!Number.isInteger(venteId) || venteId <= 0)) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        return rendre(await rattacherRetro(id, venteId, auteur));
      }
      case 'retro-saisir': {
        const r = lireRetro(corps.retro);
        return r.ok ? rendre(await saisirRetro(r.valeur, auteur)) : rendre(r);
      }
      case 'gestion-enregistrer': {
        const annee = Number(corps.annee);
        const mois = Number(corps.mois);
        if (!Number.isInteger(annee) || annee < 2000 || annee > 2100 || !Number.isInteger(mois) || mois < 1 || mois > 12) return json({ etat: 'refus', motif: 'Mois invalide.' }, 400);
        const g = lireSaisieGestion(corps.gestion);
        return g.ok ? rendre(await enregistrerGestion(annee, mois, g.valeur, auteur)) : rendre(g);
      }
      case 'attribuer': {
        // LOT C — « Attribuer à CRITERIMMO / à MACJ » ; societe null : remettre à attribuer (annuler l'attribution).
        const cle = typeof corps.cle === 'string' ? corps.cle : '';
        if (cle === '' || (corps.societe !== null && !estSociete(corps.societe))) return json({ etat: 'refus', motif: 'Vente ou société inconnue.' }, 400);
        return rendre(await attribuer(cle, corps.societe === null ? null : corps.societe as 'criterimmo' | 'macj', auteur));
      }
      case 'dossier-enregistrer': {
        // LOT D — un compromis (ou une vente) avec son dossier et sa répartition ; id null : création.
        if (corps.id != null && !idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        const dossierId = corps.id == null ? null : id;
        const d = lireDossier(corps.dossier);
        return d.ok ? rendre(await enregistrerDossier(dossierId, d.valeur, aujourdhuiParis(), auteur)) : rendre(d);
      }
      case 'acte-signe': {
        if (!idValide) return json({ etat: 'refus', motif: 'Compromis inconnu.' }, 400);
        const d = lireDateActe(corps.dateActe);
        return d.ok ? rendre(await acteSigne(id, d.valeur, auteur)) : rendre(d);
      }
      case 'retour-compromis':
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        return rendre(await retourCompromis(id, auteur));
      case 'annuler': {
        const j = Number(corps.journalId);
        if (!Number.isInteger(j) || j <= 0) return json({ etat: 'refus', motif: 'Geste inconnu.' }, 400);
        return rendre(await annulerGeste(j, auteur));
      }
      default:
        return json({ etat: 'refus', motif: 'Action inconnue.' }, 400);
    }
  } catch (e) {
    console.error('[transaction] écriture', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible.' }, 500);
  }
}
