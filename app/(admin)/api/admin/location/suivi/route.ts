import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { exigerLocation } from '../../../../../lib/location/garde';
import {
  ajouterBaremeApporteur, ajouterRegle, ajouterRetrocession, annuaireDisponible, personnalisableDisponible, nomPrenomDisponible, origineDejaClientDisponible, annulerRetrocession, creerApporteur, enregistrerActiviteBail,
  lireApporteurs, lireComptesInterface, lireNegociateurs, lireRegles, lireRetrocessions, modifierActivite, validerStatutBien, modifierApporteur, estAdministrateurActif,
  proposerActivite, rattacherApporteur, suiviDisponible, ajouterRemunerationCollegue, interneDisponible, toujoursDisponible, enregistrerFicheApporteur, ficheIdentiteDisponible, passerApporteurEnInterne, passageDisponible, enregistrerRattachement,
} from '../../../../../lib/location/suivi/suiviRepo';
import { donneesTableau, lireActivites, anneesActives } from '../../../../../lib/location/suivi/tableauBordRepo';
import { cumulApporteur, totauxApporteurs } from '../../../../../lib/location/suivi/tableauBord';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';
import { autresConditions } from '../../../../../lib/location/suivi/detailDossier';
import { avecTrace } from '../../../../../lib/gestion/traceJournal';
import { lireSessionCuration } from '../../../../../lib/admin/sessionServeur';
import { lireOrigineActivite, origineProprietaireDisponible } from '../../../../../lib/location/origineProprietaireRepo';
import { enregistrerOrigineActivite, simulerOrigineActivite } from '../../../../../lib/location/suivi/origineConsequencesRepo';

/**
 * TUILE LOCATION — « OUTILS DE SUIVI » (Arno, 22/10/2026, migration 406). Une porte dédiée, à côté de `/api/admin/location` :
 *   GET  ?vue=parametres                         apporteurs (taux datés), règles de commission, rétrocessions, négociateurs ;
 *   GET  ?vue=proposition&lotId&locataires&date  ce que « Nouveau locataire » propose (gestion du bien, origine client déduite) ;
 *   GET  ?vue=tableau&annee=AAAA                  le tableau de bord (lignes de l'année et de N−1, gestion récurrente, préavis) ;
 *   POST action=enregistrer-activite {bailId, activite}   le suivi commercial d'un bail (module Location) ;
 *   POST action=creer-apporteur {apporteur}               « + Nouvel apporteur » (module Location) ;
 *   POST action=bareme-apporteur | regle | retrocession | annuler-retrocession   (ADMINISTRATEUR : la roue Paramètres).
 *   407 : POST action=modifier-activite {id, champs}  la feuille du mois corrige origine, collègue, apporteur, prime (Location) ;
 *   424 : POST action=statut-bien {id, statut|null}  le « Statut du bien » validé à la main, ou rendu au calcul (Location) ;
 *         POST action=modifier-apporteur | rattacher-apporteur  la fiche de l'annuaire, le collègue daté (ADMINISTRATEUR) ;
 *         GET  ?vue=cumul-apporteur&id=N                       les affaires d'un apporteur : total, par an, par mois ;
 *         GET  ?vue=totaux-apporteurs                          les totaux de chaque apporteur depuis le début (dossiers, HT, dû).
 *   POST action=fiche-apporteur {apporteurId, fiche, version}  le panneau « Fiche » d'un externe (ADMINISTRATEUR ; 409 : conflit).
 *   POST action=rattachement {apporteurId, rattachement}  collègue + rémunération du collègue, une transaction (ADMINISTRATEUR).
 *   POST action=passer-interne {apporteurId, compteId}  un externe devient interne (ADMINISTRATEUR, 422).
 *   GET ?vue=dossiers-apporteur&id=N : les dossiers d'un apporteur (calcul en direct, cascade).
 *   419 : POST action=remuneration-collegue {apporteurId, remuneration}  la rémunération du collègue de rattachement (ADMINISTRATEUR).
 * 🔴 Arno (25/10/2026) — le variable des négociateurs (taux, rétrocessions, commission brute, cascade) ne part qu'aux ADMINISTRATEURS ;
 * tout autre compte reçoit sa SEULE cascade de négociateur (`variablesPropres`), calculée côté serveur.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  try {
    if (url.searchParams.get('vue') === 'proposition') {
      const ids = (url.searchParams.get('locataires') ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0);
      return json(await proposerActivite(Number(url.searchParams.get('lotId')), ids, url.searchParams.get('date')));
    }
    // 🔴 Arno (25/10/2026) — le variable des négociateurs : administrateurs seulement ; un autre compte, SA seule cascade.
    // 🔴 Arno (25/10/2026, 425) — BLOC 9 de la Fiche du bien (Suivi du mois) : l'origine de la location, son empreinte, l'héritage du bien.
    if (url.searchParams.get('vue') === 'origine-activite') {
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) return json({ etat: 'refus', motif: 'Ligne inconnue.' }, 400);
      const lu = await lireOrigineActivite(id);
      return json(lu === null ? { etat: 'non_rattache' } : { etat: 'ok', data: lu });
    }
    const voirCommissions = await estAdministrateurActif(garde.auteurId);
    if (url.searchParams.get('vue') === 'cumul-apporteur') {
      const id = Number(url.searchParams.get('id'));
      const [annees, apporteurs] = await Promise.all([anneesActives(), lireApporteurs()]);
      return json({ etat: 'ok', data: cumulApporteur(await lireActivites(annees), apporteurs, id, aujourdhuiParis()) });
    }
    // 🔴 Arno (24/10/2026) — les dossiers d'UN apporteur (calcul en direct du « Nouveau taux », cascade par dossier).
    if (url.searchParams.get('vue') === 'dossiers-apporteur') {
      const id = Number(url.searchParams.get('id'));
      const annees = await anneesActives();
      return json({ etat: 'ok', data: { aujourdhui: aujourdhuiParis(), dossiers: (await lireActivites(annees)).filter((x) => x.apporteurId === id) } });
    }
    // Arno (23/10/2026) — les totaux de chaque apporteur depuis le début (liste de l'annuaire).
    if (url.searchParams.get('vue') === 'totaux-apporteurs') {
      const [annees, apporteurs] = await Promise.all([anneesActives(), lireApporteurs()]);
      const activites = await lireActivites(annees);
      const jour = aujourdhuiParis();
      const totaux = totauxApporteurs(activites, apporteurs, jour);
      // 🔴 Arno (24/10/2026) — les dossiers calculés à d'AUTRES conditions que celles en vigueur (version antérieure, saisie de l'import).
      for (const id of Object.keys(totaux)) totaux[Number(id)].autres = autresConditions(activites, apporteurs, Number(id), jour);
      return json({ etat: 'ok', data: totaux });
    }
    if (url.searchParams.get('vue') === 'tableau') {
      const jour = aujourdhuiParis();
      const a = Number(url.searchParams.get('annee'));
      const annee = Number.isInteger(a) && a >= 2000 && a <= 2100 ? a : Number(jour.slice(0, 4));
      return json({ etat: 'ok', data: await donneesTableau(annee, voirCommissions, jour, voirCommissions ? null : garde.auteurId) });
    }
    // 🔴 Arno (24/10/2026, après 56700ffb) — DEUX règles : « Négociateur » = accès Location ou administrateur ; « Collègue » = tous.
    const [disponible, apporteurs, regles, retrocessions, negociateurs, collegues, annuaire, personnalisable, nomPrenom, dejaClient, interne, toujours, identite, passage] = await Promise.all([
      suiviDisponible(), lireApporteurs(), lireRegles(), voirCommissions ? lireRetrocessions() : Promise.resolve([]), lireNegociateurs(),
      lireComptesInterface(), annuaireDisponible(), personnalisableDisponible(), nomPrenomDisponible(), origineDejaClientDisponible(), interneDisponible(), toujoursDisponible(), ficheIdentiteDisponible(), passageDisponible(),
    ]);
    // Arno (24/10/2026) — `personnalisable` : la migration 411 est là, l'origine « Personnalisé » peut être proposée.
    // 🔴 Arno (25/10/2026) — le taux du négociateur (de quoi recalculer un variable) : administrateurs seulement.
    return json({ etat: 'ok', data: { disponible, origineProprietaire: await origineProprietaireDisponible(), apporteurs, regles: voirCommissions ? regles : regles.map((r) => ({ ...r, tauxNegociateur: 0 })), retrocessions, negociateurs, voirCommissions, moi: garde.auteurId ?? null, collegues, annuaire, personnalisable,
      // 414 — le nom de famille et le prénom des apporteurs peuvent-ils être corrigés dans la fiche ?
      nomPrenom,
      // 415 — l'origine « Propriétaire déjà client » peut-elle être proposée ?
      dejaClient,
      // 419 — apporteurs internes, durée du récurrent, rémunération du collègue : enregistrables ?
      interne,
      // 420 — « Depuis toujours » enregistrable ?
      toujours,
      // 421 — la fiche d'identité complète d'un externe ?
      identite,
      // 422 — « Passer en interne » enregistrable ?
      passage } });
  } catch (e) {
    console.error('[api/admin/location/suivi] lecture impossible', e);
    return json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, 503);
  }
}

const ACTIONS_ADMIN = new Set(['bareme-apporteur', 'regle', 'retrocession', 'annuler-retrocession', 'modifier-apporteur', 'rattacher-apporteur', 'remuneration-collegue', 'fiche-apporteur', 'passer-interne', 'rattachement']);

export async function POST(request: Request): Promise<Response> {
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return json({ etat: 'refus', motif: 'Demande illisible.' }, 400);
  }
  const action = typeof corps.action === 'string' ? corps.action : '';
  const garde = ACTIONS_ADMIN.has(action) ? await exigerAdministrateur(request) : await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const auteur = await auteurDeLaRequete(request);
  try {
    switch (action) {
      // 🔴 Arno (25/10/2026) — le « Type de bien » reporté sur la fiche du bien : journalisé avec compte, session et écran « Nouveau locataire ».
      case 'enregistrer-activite': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Nouveau locataire' },
        () => enregistrerActiviteBail(corps.bailId, corps.activite, auteur)));
      case 'creer-apporteur': return json(await creerApporteur(corps.apporteur, auteur));
      // 420 — compte, session et écran journalisés (« Depuis toujours »).
      case 'bareme-apporteur': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Annuaire des apporteurs' },
        () => ajouterBaremeApporteur(corps.apporteurId, corps.bareme, auteur)));
      case 'regle': return json(await ajouterRegle(corps.regle, auteur));
      case 'retrocession': return json(await ajouterRetrocession(corps.retrocession, auteur));
      case 'annuler-retrocession': return json(await annulerRetrocession(corps.id, auteur));
      // 🔴 Arno (25/10/2026) — « Modifier » de l'encart : chaque champ changé au journal, avec compte, session et écran « Suivi du mois ».
      case 'modifier-activite': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Suivi du mois' },
        () => modifierActivite(corps.id, corps.champs, auteur)));
      // 🔴 Arno (25/10/2026, 424) — « Statut du bien » validé à la main (`statut` : l'un des 5) ou rendu au calcul (`statut` : null).
      // 🔴 425 — le bloc 9 « Origine du contact » de la Fiche du bien (Suivi du mois) : la location seule, conflit refusé.
      case 'origine-activite': {
        // 🔴 Arno (25/10/2026) — `simuler` : les conséquences avant / après, SANS RIEN ÉCRIRE ; sinon l'enregistrement (conséquences au journal).
        const admin = await estAdministrateurActif(garde.auteurId);
        if (corps.simuler === true) return json(await simulerOrigineActivite(Number(corps.id), corps.origine, admin));
        const ecran = corps.ecran === 'Dossier de location (Suivi du mois)' ? 'Dossier de location (Suivi du mois)' as const : 'Fiche du bien (Suivi du mois)' as const;
        const r = await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran },
          () => enregistrerOrigineActivite(Number(corps.id), corps.origine, corps.empreinte, auteur, admin));
        return json(r, r.etat === 'conflit' ? 409 : 200);
      }
      case 'statut-bien': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Suivi du mois' },
        () => validerStatutBien(corps.id, corps.statut ?? null, auteur)));
      case 'modifier-apporteur': return json(await modifierApporteur(corps.apporteurId, corps.fiche, auteur));
      case 'rattacher-apporteur': return json(await rattacherApporteur(corps.apporteurId, corps.rattachement, auteur));
      // 🔴 Arno (24/10/2026) — le panneau « Fiche » : récapitulatif côté écran, conflit (409) et journal (compte, session, écran).
      case 'fiche-apporteur': {
        const r = await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Annuaire des apporteurs' },
          () => enregistrerFicheApporteur(corps.apporteurId, { fiche: corps.fiche, version: corps.version }, auteur));
        return json(r, r.etat === 'conflit' ? 409 : 200);
      }
      // 🔴 Arno (24/10/2026, 422) — « Passer en interne » (la règle du script ; journal avec compte, session, écran).
      case 'passer-interne': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Annuaire des apporteurs' },
        () => passerApporteurEnInterne(corps.apporteurId, corps.compteId, auteur)));
      // 🔴 Arno (24/10/2026) — le rattachement ET la rémunération du collègue, un seul geste, une transaction, journalisé.
      case 'rattachement': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Annuaire des apporteurs' },
        () => enregistrerRattachement(corps.apporteurId, corps.rattachement, auteur)));
      case 'remuneration-collegue': return json(await avecTrace({ sessionId: (await lireSessionCuration(request)).jti, ecran: 'Annuaire des apporteurs' },
        () => ajouterRemunerationCollegue(corps.apporteurId, corps.remuneration, auteur)));
      default: return json({ etat: 'refus', motif: 'Action inconnue.' }, 400);
    }
  } catch (e) {
    console.error('[api/admin/location/suivi] écriture impossible', action, e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu.' }, 503);
  }
}
