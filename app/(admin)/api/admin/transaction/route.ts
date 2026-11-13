import 'server-only';
import { auteurDeLaRequete } from '../../../../lib/gestion/auteur';
import { exigerTransaction } from '../../../../lib/transaction/garde';
import { concerne, estSociete, type Vente } from '../../../../lib/transaction/modele';
import { compromisEnCours, pourLaVue } from '../../../../lib/transaction/compromisEnCours';
import { libellesNegociateurs } from '../../../../lib/transaction/nomNegociateur';
import { lireAnnulation, lireDateActe, lireDossier, lireGestion as lireSaisieGestion, lireModification, lireRetro, lireVente } from '../../../../lib/transaction/saisie';
import {
  acteSigne, annulerCompromis, annulerGeste, enregistrerCommissionCote, retablirCompromis, attribuer, creerVente, enregistrerDossier, enregistrerGestion, lireJournal, lireNegociateurs,
  lirePersonnes, lireVentes, modifierVente, rattacherRetro, statutRetro, retirerVente, retourCompromis, saisirRetro, transactionDisponible, libellesDePaye, lireStatutsNegociateurs, nomsAffichesNegociateurs } from '../../../../lib/transaction/repo';
import { annulationDisponible, interCabinetDisponible, mandatDisponible, prixVenteDisponible, repartitionDisponible, uniteCommissionDisponible, personneTypeDisponible } from '../../../../lib/admin/schemaDroits';
import { montant } from '../../../../lib/transaction/saisie';
import { creerApporteur, lireApporteurs, lireComptesInterface } from '../../../../lib/location/suivi/suiviRepo';
import { lireLocationCa } from '../../../../lib/transaction/locationLue';
import { apporteurProfessionnel, aujourdhuiParis, estInterne, libelleApporteur, texteRechercheApporteur } from '../../../../lib/location/suivi/suivi';
import { estDoublonMandat } from '../../../../lib/transaction/mandatRepo';
import { MOTIF_DOUBLON_MANDAT } from '../../../../lib/transaction/mandat';
import { lireDonneesSociete } from '../../../../lib/transaction/donneesSociete';
import { lireDonneesGlobal } from '../../../../lib/transaction/donneesGlobal';
import { estAdministrateur, peutVoirCouts } from '../../../../lib/mon-espace/compteRepo';

/**
 * TUILE « TRANSACTION » (Arno, 27/10/2026, migration 433) — la porte de la tuile :
 *   GET  ?vue=societe&societe=criterimmo|macj   ventes, compromis, rétrocessions, montants « à rattacher » de la société ;
 *   GET  ?vue=global                            les ventes des deux sociétés, la gestion du mois, le CA location (lu dans le Suivi) ;
 *   GET  ?vue=journal&entite=…&id=N             l'historique d'une ligne (pour « Annuler ») ;
 *   GET  ?vue=location                          LOT LO1 : les lignes du Suivi de la Location (CA, primes, apporteurs, net au centime), lecture seule ;
 *   POST action=vente-saisir {vente} | vente-modifier {id, champs} | vente-retirer {id, retirer}
 *        action=retro-rattacher {id, venteId|null} | retro-saisir {retro}
 *        🔴 D38 (455) : action=retro-statut {id, statut: 'particulier'|'professionnel'|null} — ADMINISTRATEURS ; journalisé, réversible
 *        action=gestion-enregistrer {annee, mois, gestion}
 *        action=annuler {journalId}
 *        action=attribuer {cle, societe|null}   LOT C : la même vente notée chez les deux sociétés, attribuée (ou remise à attribuer)
 *   LOT D (migration 434) :
 *   GET  ?vue=compromis&societe=criterimmo|macj|tous   les compromis en cours (acte non signé) de la société (ou des deux) ;
 *   GET  ?vue=references                               négociateurs (comptes et société du jour), apporteurs (annuaire de la Location), personnes ;
 *   POST action=dossier-enregistrer {id|null, dossier} | acte-signe {id, dateActe} | retour-compromis {id}
 *   LOT R : POST action=commission-cote {id, cote, montant: {montant, unite} | null, taux} — la rémunération d'un côté, seule (sur la vente
 *        d'origine, aussi depuis sa ligne miroir) ; les vues d'une société rendent les LIGNES MIROIR de l'inter-cabinet.
 * Sans la migration 433 : les lectures rendent des listes vides (`disponible: false`) et toute écriture est refusée avec ce motif.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });
const ENTITES = ['vente', 'vente_ligne', 'retrocession', 'ca_a_rattacher', 'gestion_mois', 'personne', 'location_salaires_mois'];

/** LOT D — ce que les formulaires proposent : les comptes (actifs) et leur société du jour, l'annuaire des apporteurs de la Location, les personnes. */
async function references(aujourdhui: string): Promise<Record<string, unknown>> {
  const lotD = await repartitionDisponible();
  const [negociateurs, apporteurs, collegues, personnes] = await Promise.all([
    lireNegociateurs(aujourdhui),
    lireApporteurs().catch(() => []),
    // 🔴 LOT AC — les collègues de l'interface (collègue de rattachement, compte d'un interne) pour créer un apporteur depuis la Transaction.
    lireComptesInterface().catch(() => []),
    lotD ? lirePersonnes() : Promise.resolve([]),
  ]);
  return { lotD, personneType: await personneTypeDisponible(), prixVente: await prixVenteDisponible(), mandat: await mandatDisponible(), annulation: await annulationDisponible(), uniteCommission: await uniteCommissionDisponible(), interCabinet: await interCabinetDisponible(), negociateurs: negociateurs.filter((x) => x.actif), apporteurs: apporteurs.filter((a) => !a.archive).map((a) => ({ id: a.id, nom: a.nom,
    // LOT AC — la recherche (nom, prénom, société, téléphones, e-mails) et le libellé de l'annuaire (homonymes).
    recherche: texteRechercheApporteur(a), libelle: libelleApporteur(a),
    // 🔴 D29 / D38 — `interne` : la commission porte la TVA (un collaborateur, ou un apporteur « Professionnel ») ; sinon un Particulier, sans TVA.
    // `statutTva` : le statut de la fiche (Particulier / Professionnel), montré tel quel.
    ...(estInterne(a) || apporteurProfessionnel(a) ? { interne: true } : {}), ...(a.statutTva !== undefined ? { statutTva: a.statutTva } : {}) })), collegues, personnes };
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
      // 🔴 LOT DM — « tous » : la FUSION des deux sociétés (toutes les ventes, chacune une fois : `lireVentes(null)`, comme le CA global)
      const brut = url.searchParams.get('societe');
      if (brut !== 'tous' && !estSociete(brut)) return json({ etat: 'refus', motif: 'Société inconnue.' }, 400);
      // 🔴 MON ESPACE, LOT 10 — la lecture est `lireDonneesSociete` (la même pour le mode agence de « Mon espace »), déplacée telle quelle.
      return json({ etat: 'ok', data: await lireDonneesSociete(brut === 'tous' ? null : brut, aujourdhui) });
    }
    // 🔴 MON ESPACE « Les coûts » (03/11/2026) — la lecture est `lireDonneesGlobal` (la même pour l'onglet « Les coûts »), déplacée telle quelle.
    // 🔴 472 — les « Rémunérations associés » : seulement pour un compte qui a « Les coûts » (relu en base) ; pour tout autre, ni lignes ni montants
    if (vue === 'global') return json({ etat: 'ok', data: await lireDonneesGlobal(aujourdhui, { remunerations: garde.auteurId !== null && (await peutVoirCouts(garde.auteurId)) }) });
    if (vue === 'compromis') {
      // LOT D — les compromis en cours (acte non signé) qui comptent pour la société (une part, ou la société de l'historique), ou pour les deux.
      const societe = url.searchParams.get('societe');
      if (societe !== 'tous' && !estSociete(societe)) return json({ etat: 'refus', motif: 'Société inconnue.' }, 400);
      const ref = await references(aujourdhui);
      if (!disponible) return json({ etat: 'ok', data: { disponible, aujourdhui, societe, compromis: [], annules: [], ...ref } });
      const ventes = await lireVentes(societe === 'tous' ? null : societe);
      // 🔴 LOT R — une société : les ventes qu'elle porte et ses LIGNES MIROIR (sa part reçue en inter-cabinet), déjà triées par `lireVentes`.
      // 🔴 LOT CY — la règle unique des compromis en cours (`compromisEnCours`), celle de « Le mois », « L'année » et du CA global.
      const vueC = societe === 'tous' ? null : societe;
      const pourVue = (v: Vente): boolean => pourLaVue(v, vueC);
      const compromis = compromisEnCours(ventes, vueC);
      // 🔴 LOT BY — « Du mois » : les compromis signés ce mois-ci (mois calendaire d'aujourd'hui) et déjà passés en acte (étiquette « acte signé »).
      const actesDuMois = ventes.filter((v) => v.statut === 'vendue' && (v.dateCompromis ?? '').slice(0, 7) === aujourdhui.slice(0, 7) && pourVue(v));
      // LOT G — les compromis ANNULÉS par le bouton « Annulation » (motif enregistré) : consultables, rétablissables.
      const annules = ventes.filter((v) => v.statut === 'annulee' && v.annulation != null && (societe === 'tous' || (v.repartition != null ? concerne(v, societe) : v.societe === societe)));
      // LOT Q — même règle pour le cumul « Commissions versées » : la paye importée d'un compromis suit le compte rapproché.
      const statutsNegociateurs = await lireStatutsNegociateurs(libellesDePaye([...compromis, ...actesDuMois])).catch(() => ({}));
      const nomsNegociateurs = await nomsAffichesNegociateurs(libellesNegociateurs([...compromis, ...actesDuMois, ...annules])).catch(() => ({}));
      return json({ etat: 'ok', data: { disponible, aujourdhui, societe, compromis, actesDuMois, annules, statutsNegociateurs, nomsNegociateurs, ...ref } });
    }
    // 🔴 LOT LO1 — « Location » (Suivi Chiffre d'affaires) : les lignes du Suivi du mois de la Location, en lecture seule.
    if (vue === 'location') return json({ etat: 'ok', data: { aujourdhui, ...(await lireLocationCa()) } });
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
  const rendre = (r: { ok: true; valeur?: unknown } | { ok: false; motif: string; conflit?: true }): Response =>
    (r.ok ? json({ etat: 'ok', data: r.valeur ?? null }) : json({ etat: 'refus', motif: r.motif, ...(r.conflit ? { conflit: true } : {}) }, r.conflit ? 409 : 422));
  // 🔴 MON ESPACE, LOT 6 — la version de la vente lue par l'écran (garde de version) ; absente : un écran d'avant, pas de contrôle.
  const version = typeof corps.version === 'number' && Number.isInteger(corps.version) && corps.version >= 0 ? corps.version : null;
  try {
    switch (corps.action) {
      case 'vente-saisir': {
        const v = lireVente(corps.vente);
        return v.ok ? rendre(await creerVente(v.valeur, auteur)) : rendre(v);
      }
      case 'vente-modifier': {
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        const ch = lireModification(corps.champs);
        return ch.ok ? rendre(await modifierVente(id, ch.valeur, auteur, version)) : rendre(ch);
      }
      case 'vente-retirer':
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        return rendre(await retirerVente(id, corps.retirer !== false, auteur, version));
      case 'retro-rattacher': {
        if (!idValide) return json({ etat: 'refus', motif: 'Rétrocession inconnue.' }, 400);
        const venteId = corps.venteId === null ? null : Number(corps.venteId);
        if (venteId !== null && (!Number.isInteger(venteId) || venteId <= 0)) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        return rendre(await rattacherRetro(id, venteId, auteur));
      }
      // 🔴 D38 (Arno, 04/11/2026) — le statut Particulier / Professionnel d'UNE rétrocession (null : la règle) : administrateurs seulement.
      case 'retro-statut': {
        if (!idValide) return json({ etat: 'refus', motif: 'Rétrocession inconnue.' }, 400);
        if (garde.auteurId === null || !(await estAdministrateur(garde.auteurId))) return json({ etat: 'refus', motif: 'Le statut d’une rétrocession se modifie par un administrateur.' }, 403);
        const statut = corps.statut === null ? null : corps.statut === 'particulier' || corps.statut === 'professionnel' ? corps.statut : undefined;
        if (statut === undefined) return json({ etat: 'refus', motif: 'Statut : Particulier, Professionnel, ou la règle.' }, 400);
        return rendre(await statutRetro(id, statut, auteur));
      }
      case 'retro-saisir': {
        const r = lireRetro(corps.retro);
        return r.ok ? rendre(await saisirRetro(r.valeur, auteur)) : rendre(r);
      }
      case 'location-salaires-enregistrer': {
        // 🔴 R3 (accord d'Arno, 03/11/2026) — les salaires chargés de la Location ne se saisissent plus ici : par salarié, dans « Mon espace › Les coûts »
        // (une seule source). Refus explicite, rien n'est écrit.
        return json({ etat: 'refus', motif: 'Les salaires chargés de la Location se saisissent désormais par salarié dans « Mon espace › Les coûts » : rien n’a été écrit.' }, 409);
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
        return d.ok ? rendre(await enregistrerDossier(dossierId, d.valeur, aujourdhuiParis(), auteur, version)) : rendre(d);
      }
      case 'acte-signe': {
        if (!idValide) return json({ etat: 'refus', motif: 'Compromis inconnu.' }, 400);
        const d = lireDateActe(corps.dateActe);
        return d.ok ? rendre(await acteSigne(id, d.valeur, auteur, version)) : rendre(d);
      }
      case 'compromis-annuler': {
        // LOT G — « Confirmer l'annulation » (motif, date, note).
        if (!idValide) return json({ etat: 'refus', motif: 'Compromis inconnu.' }, 400);
        const a = lireAnnulation(corps.annulation);
        return a.ok ? rendre(await annulerCompromis(id, a.valeur, auteur, version)) : rendre(a);
      }
      case 'compromis-retablir':
        if (!idValide) return json({ etat: 'refus', motif: 'Compromis inconnu.' }, 400);
        return rendre(await retablirCompromis(id, auteur, version));
      case 'retour-compromis':
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        return rendre(await retourCompromis(id, auteur, version));
      case 'commission-cote': {
        // 🔴 LOT R — la rémunération d'un côté (montant dans son unité, taux de rémunération) ; montant null : retirée.
        if (!idValide) return json({ etat: 'refus', motif: 'Vente inconnue.' }, 400);
        if (corps.cote !== 'entree' && corps.cote !== 'sortie') return json({ etat: 'refus', motif: 'Côté inconnu (entrée ou sortie).' }, 400);
        const m = corps.montant == null ? null : corps.montant as Record<string, unknown>;
        const x = m === null ? null : montant(m.montant);
        const t = montant(corps.taux);
        if (x === undefined || t === undefined || (m !== null && m.unite !== 'ht' && m.unite !== 'ttc')) return json({ etat: 'refus', motif: 'Rémunération illisible.' }, 400);
        // 🔴 LOT V — le mode : « calculee » (Appliquer / Revenir au calcul, taux modifié) ou « manuelle » (montant tapé) ; autre : inconnu.
        const mode = corps.mode === 'calculee' || corps.mode === 'manuelle' ? corps.mode : null;
        return rendre(await enregistrerCommissionCote(id, corps.cote, m === null || x === null ? null : { montant: x, unite: m.unite as 'ht' | 'ttc' }, t, auteur, mode, version));
      }
      case 'apporteur-creer': {
        // 🔴 LOT AC (Arno) — un nouvel apporteur depuis le choix de l'apporteur d'un compromis : le MÊME annuaire que la Location (`creerApporteur` :
        // un nom déjà pris est refusé, jamais de doublon ; un externe a son collègue de rattachement), journalisé ; son taux : 0 % à partir d'aujourd'hui.
        const r = await creerApporteur({ ...((corps.apporteur ?? {}) as Record<string, unknown>), depuis: aujourdhuiParis(), origine: 'transaction' }, auteur);
        return r.etat === 'ok' ? json({ etat: 'ok', data: r.data ?? null }) : json({ etat: 'refus', motif: r.motif }, 422);
      }
      case 'annuler': {
        const j = Number(corps.journalId);
        if (!Number.isInteger(j) || j <= 0) return json({ etat: 'refus', motif: 'Geste inconnu.' }, 400);
        return rendre(await annulerGeste(j, auteur));
      }
      default:
        return json({ etat: 'refus', motif: 'Action inconnue.' }, 400);
    }
  } catch (e) {
    // 🔴 MON ESPACE, LOT 2 — la base refuse un doublon de n° de mandat (deux saisies simultanées, rétablissement, annulation d'un geste) :
    // un refus clair, rien n'est écrit (la transaction est annulée).
    if (estDoublonMandat(e)) return json({ etat: 'refus', motif: MOTIF_DOUBLON_MANDAT }, 422);
    console.error('[transaction] écriture', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible.' }, 500);
  }
}
