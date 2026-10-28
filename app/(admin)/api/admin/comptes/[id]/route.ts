import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { trouverCompteParId, permsDuCompte, capaciteModifPermis, etatEnvoiGestion } from '../../../../../lib/admin/comptes';
import { lireServiceGestion } from '../../../../../lib/admin/serviceGestion';
import { lireVoirCommissions } from '../../../../../lib/admin/voirCommissions';
import { lireResultatNet } from '../../../../../lib/admin/resultatNet';
import { lireSocieteCompte } from '../../../../../lib/admin/societeCompte';
import { lireStatutCompte } from '../../../../../lib/admin/statutCompte';
import { lireCommissionneCompte } from '../../../../../lib/admin/commissionneCompte';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/comptes/[id] — détail d'un compte, état RÉEL en base (M3-4 Lot D). Administrateur uniquement
 * (double barrière : proxy `estAdministratif` + `exigerAdministrateur`). Renvoie prénom, nom, identifiant, rôle,
 * actif, dernière connexion, drapeau de première connexion et les 6 permissions EFFECTIVES. JAMAIS le hash.
 */
export async function GET(request: Request, ctx: Ctx) {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  const { id } = await ctx.params;
  if (!/^[1-9]\d*$/.test(id)) return Response.json({ erreur: 'Identifiant de compte invalide.' }, { status: 422 });

  const c = await trouverCompteParId(Number(id));
  if (!c) return Response.json({ erreur: 'Compte introuvable.' }, { status: 404 });

  return Response.json({
    compte: {
      id: c.id,
      identifiant: c.identifiant,
      prenom: c.prenom,
      nom: c.nom,
      role: c.role,
      actif: c.actif,
      derniere_connexion_a: c.derniere_connexion_a,
      doit_changer_mot_de_passe: c.doit_changer_mot_de_passe,
      perms: permsDuCompte(c),
      peutModifierPermis: capaciteModifPermis(c), // RATT-EDIT lot A3 — état de la sous-case « modifier après validation »
      // LOT 5-DROITS — TROIS états possibles, dont « à décider » : l'écran doit pouvoir le DIRE, pas seulement le colorer.
      etatEnvoiGestion: etatEnvoiGestion(c),
      // LOT PROFIL-GESTION — « Appartient au service gestion » (aucun droit), avec son dernier changement (date, auteur).
      serviceGestion: await lireServiceGestion(c.id),
      // LOCATION « Outils de suivi » (406) — « Voir les commissions » (administrateur : implicite).
      voirCommissions: await lireVoirCommissions(c.id),
      // 🔴 Arno (26/10/2026, 428) — « Accès au Résultat net de l'agence ? » (question de la tuile Location).
      resultatNet: await lireResultatNet(c.id),
      // TRANSACTION, LOT D (434) — la société du collaborateur (CRITERIMMO / MACJ) et ses périodes datées ; sans la 434 : non disponible.
      societeDetail: await lireSocieteCompte(c.id).catch(() => ({ valeur: null, disponible: false, periodes: [] })),
      // 🔴 LOT P (439) — le statut de la personne et l'historique de ses changements (date, avant, après, auteur).
      statutDetail: await lireStatutCompte(c.id).catch(() => ({ valeur: null, disponible: false, historique: [] })),
      // 🔴 LOT S (441) — « Commissionné / Non commissionné » (administrateur seulement) et l'historique de ses changements.
      commissionneDetail: await lireCommissionneCompte(c.id).catch(() => ({ valeur: null, applicable: c.role === 'administrateur', disponible: false, historique: [] })),
    },
  });
}
