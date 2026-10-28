import 'server-only';
import { exigerAdministrateur } from '../../../../lib/admin/garde';
import { estEmailValide } from '../../../../lib/admin/email';
import { genererMotDePasseTemporaire } from '../../../../lib/admin/motDePasseTemporaire';
import { creerCompteAdministration, listerComptes, ErreurCompte } from '../../../../lib/admin/comptes';
import type { RoleAdmin } from '../../../../lib/admin/session';
/* 🔴 LOT GESTION-INVITATION-ADMIN (16/10/2026) — le mail d'invitation part à la création ; la liste dit l'état de chaque compte. */
import { envoyerInvitation, etatsInvitations, type IssueEnvoi } from '../../../../lib/admin/invitationRepo';
import { phraseEnvoi } from '../../../../lib/admin/invitation';
/* TRANSACTION, LOT D (434) — la société (CRITERIMMO / MACJ), obligatoire à la création dès que la 434 est appliquée. */
import { definirSocieteCompte, societesDesComptes } from '../../../../lib/admin/societeCompte';
import { definirStatutCompte, statutsDesComptes } from '../../../../lib/admin/statutCompte';
import { estStatut } from '../../../../lib/admin/statut';
import { repartitionDisponible, societeLesDeuxDisponible, statutDisponible } from '../../../../lib/admin/schemaDroits';
import { estSocieteCompte, LES_DEUX } from '../../../../lib/transaction/societeNegociateur';
import { auteurDeLaRequete } from '../../../../lib/gestion/auteur';
import { aujourdhuiParis } from '../../../../lib/location/suivi/suivi';

/**
 * Tuile Administratif (M3-4 Lot C). Namespace PLURIEL `/api/admin/comptes` (disjoint du self-service singulier
 * `/api/admin/compte/mot-de-passe`). DOUBLE BARRIÈRE : proxy.ts garde déjà par le rôle du JWS, ET chaque handler
 * revérifie le rôle EN BASE (`exigerAdministrateur`) — un jeton de 8 h peut porter un rôle rétrogradé.
 */

/** GET — liste des comptes (jamais le hash). Administrateur uniquement. */
export async function GET(request: Request) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const comptes = await listerComptes();
    // État d'invitation (activé ou non, dernier envoi) : une lecture à part ; un échec ne prive pas de la liste.
    const etats = await etatsInvitations(comptes.map((c) => Number(c.id))).catch(() => new Map());
    // LOT D — la société de chaque compte (lecture à part ; sans la 434 ou en échec : non renseignée, la liste reste).
    const societes = await societesDesComptes(comptes.map((c) => Number(c.id))).catch(() => new Map());
    const societeDisponible = await repartitionDisponible().catch(() => false);
    // LOT K — « CRITERIMMO et MACJ » enregistrable (438) ?
    const societeLesDeux = societeDisponible && await societeLesDeuxDisponible().catch(() => false);
    // LOT P (439) — le statut de chaque compte (associé, salarié, indépendant, observateur ; null : à renseigner).
    const avecStatut = await statutDisponible().catch(() => false);
    const statuts = avecStatut ? await statutsDesComptes(comptes.map((c) => Number(c.id))) : new Map();
    // Sans la 434, la réponse reste celle d'avant (aucune clé `societe`) : l'écran ne montre alors pas la ligne « Société ».
    return Response.json({ societeDisponible, ...(societeDisponible ? { societeLesDeux } : {}), statutDisponible: avecStatut, comptes: comptes.map((c) => ({ ...c, invitation: etats.get(Number(c.id)) ?? null,
      ...(societeDisponible ? { societe: societes.get(Number(c.id)) ?? null } : {}), ...(avecStatut ? { statut: statuts.get(Number(c.id)) ?? null } : {}) })) });
  } catch {
    return Response.json({ erreur: 'Liste indisponible.' }, { status: 503 });
  }
}

/**
 * POST — création d'un compte. Administrateur uniquement. Génère un mot de passe TEMPORAIRE (CSPRNG), le hache,
 * crée le compte avec `doit_changer_mot_de_passe = true`, et RENVOIE LE CLAIR UNE SEULE FOIS dans la réponse.
 * Le clair n'est jamais journalisé (le journal ne porte que identifiant/rôle) ni renvoyé ailleurs.
 */
export async function POST(request: Request) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erreur: 'Requête invalide.' }, { status: 422 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const identifiant = typeof b.identifiant === 'string' ? b.identifiant.trim() : '';
  const prenom = typeof b.prenom === 'string' ? b.prenom.trim() : '';
  const nom = typeof b.nom === 'string' ? b.nom.trim() : '';
  const role: RoleAdmin | null = b.role === 'administrateur' || b.role === 'collaborateur' ? b.role : null;
  const pb = (b.perms ?? {}) as Record<string, unknown>;

  if (!estEmailValide(identifiant)) {
    return Response.json({ erreur: 'Identifiant : adresse e-mail invalide.' }, { status: 422 });
  }
  if (prenom.length === 0 || nom.length === 0) {
    return Response.json({ erreur: 'Prénom et nom sont obligatoires.' }, { status: 422 });
  }
  if (role === null) {
    return Response.json({ erreur: 'Rôle attendu : administrateur | collaborateur.' }, { status: 422 });
  }

  const perms = {
    pilotage: pb.pilotage === true,
    cartes_annee: pb.cartes_annee === true,
    statistiques: pb.statistiques === true,
    internautes: pb.internautes === true,
    curation: pb.curation === true,
    banc_test: pb.banc_test === true,
    permis: pb.permis === true, // RATT-EDIT (lot A2) — module « Permis de construire »
    gestion: pb.gestion === true, // GESTION (lot 2) — module « Gestion »
    location: pb.location === true, // LOCATION (17/10/2026) — module « Location » (migration 371)
    transaction: pb.transaction === true, // TRANSACTION (27/10/2026) — module « Transaction » (migration 433)
  };

  // 🔴 LOT 5-DROITS — MÊME EXIGENCE QU'À LA MODIFICATION : cocher la tuile Gestion oblige à répondre sur l'envoi. Créer
  //   un compte est justement le moment où l'on oublierait le plus facilement de poser la question.
  const envoiBrut = b.gestion_envoi;
  const envoi = envoiBrut === true ? true : envoiBrut === false ? false : null;
  if (role === 'collaborateur' && perms.gestion && envoi === null) {
    return Response.json({
      erreur: 'Pour donner l’accès à la tuile Gestion, il faut répondre à la question « Peut envoyer des mails au nom de gestion@criterimmo.fr » : oui ou non.',
      champ: 'gestion_envoi',
    }, { status: 422 });
  }

  // TRANSACTION, LOT D — « Société : CRITERIMMO / MACJ », obligatoire à la création une fois la 434 appliquée (sans elle : ni exigée ni écrite).
  const avecSociete = await repartitionDisponible().catch(() => false);
  if (avecSociete && !estSocieteCompte(b.societe)) {
    return Response.json({ erreur: 'Choisissez la société du collaborateur : CRITERIMMO, MACJ, ou CRITERIMMO et MACJ.', champ: 'societe' }, { status: 422 });
  }
  // LOT K — « CRITERIMMO et MACJ » avant la 438 : refusé AVANT de créer le compte (rien n'est écrit).
  if (avecSociete && b.societe === LES_DEUX && !(await societeLesDeuxDisponible().catch(() => false))) {
    return Response.json({ erreur: 'Mise à jour de la base à appliquer (migration 438) avant de pouvoir choisir « CRITERIMMO et MACJ ».', champ: 'societe' }, { status: 409 });
  }

  // 🔴 LOT P — « Statut » obligatoire à la création une fois la 439 appliquée (sans elle : ni exigé ni écrit).
  const avecStatut = await statutDisponible().catch(() => false);
  if (avecStatut && !estStatut(b.statut)) {
    return Response.json({ erreur: 'Choisissez le statut de la personne : Associé, Salarié, Indépendant ou Observateur.', champ: 'statut' }, { status: 422 });
  }

  const motDePasseTemporaire = genererMotDePasseTemporaire();
  try {
    const compte = await creerCompteAdministration({
      identifiant, prenom, nom, role, perms, peutModifierPermis: b.permis_modif === true, peutEnvoyerGestion: envoi, motDePasseClair: motDePasseTemporaire, auteurId: garde.auteurId, // RATT-EDIT lot A3 — sous-droit lu au niveau racine (subordonné à perms.permis côté repo)
    });
    // La société, posée à compter d'aujourd'hui (une période datée et signée). Un échec ne défait pas le compte : il est dit.
    let societe: { ok: boolean; motif?: string } | null = null;
    if (avecSociete) {
      const r = await definirSocieteCompte(Number(compte.id), b.societe, aujourdhuiParis(), await auteurDeLaRequete(request))
        .catch(() => ({ ok: false as const, motif: 'Société non enregistrée : renseignez-la dans le détail du compte.' }));
      societe = r.ok ? { ok: true } : { ok: false, motif: r.motif };
    }
    // LOT P — le statut, journalisé (date, auteur). Un échec ne défait pas le compte : il est dit.
    let statut: { ok: boolean; motif?: string } | null = null;
    if (avecStatut) {
      const r = await definirStatutCompte(Number(compte.id), b.statut, garde.auteurId).catch(() => ({ ok: false as const, motif: 'Statut non enregistré : renseignez-le dans le détail du compte.' }));
      statut = r.ok ? { ok: true } : { ok: false, motif: r.motif };
    }
    // 🔴 LE MAIL D'INVITATION : envoyé APRÈS la création (un échec n'annule pas le compte) et DIT tel quel à l'écran —
    //    jamais « envoyé » quand rien n'est parti. Le mot de passe temporaire reste affiché une fois, comme avant.
    let invitation: IssueEnvoi;
    try {
      invitation = await envoyerInvitation(Number(compte.id), garde.auteurId);
    } catch (e) {
      invitation = { ok: false, etat: 'echec', destinataire: identifiant, motif: e instanceof Error ? e.message.slice(0, 200) : 'erreur inconnue' };
    }
    const phrase = phraseEnvoi({ etat: invitation.etat === 'refuse' ? 'echec' : invitation.etat, destinataire: invitation.destinataire || identifiant, motif: invitation.ok ? null : invitation.motif });
    // Le CLAIR n'est renvoyé QU'ICI, une seule fois. Aucun réaffichage possible → l'admin doit le transmettre.
    return Response.json({ compte, motDePasseTemporaire, invitation: { ...invitation, phrase }, societe, statut }, { status: 201 });
  } catch (e) {
    // ErreurCompte = message métier (identifiant pris, etc.) ; jamais le mot de passe dans l'erreur.
    if (e instanceof ErreurCompte) return Response.json({ erreur: e.message }, { status: 409 });
    return Response.json({ erreur: 'Création impossible.' }, { status: 500 });
  }
}
