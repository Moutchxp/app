import type { Apporteur } from './suivi';
import { libelleOrigineContact, type OrigineContact } from './suivi';
import {
  apporteursEtCollegues, caLigne, commissionApporteurDe, commissionCollegueSignatureDe, LIBELLE_NATURE_BIEN, natureBienLoue, NATURES_BIEN, sectionNegociateurs,
  totauxPeriode, type ActiviteCalcul, type ContexteCalcul,
} from './tableauBord';

/**
 * ══ 🔴 Arno (25/10/2026) — LES CONSÉQUENCES D'UNE MODIFICATION DE L'ORIGINE DU CONTACT, EN CASCADE, AVANT / APRÈS ═══════════════════
 * Calculées SANS RIEN ÉCRIRE, avec les mêmes fonctions que les écrans : la ligne modifiée comme le serveur l'écrira (`appliquerOrigine`,
 * miroir exact de l'écriture), puis origine / apporteur / collègue, statut du bien, honoraires d'apporteur et rémunération du collègue du
 * dossier, Résultat du mois, CA par statut, Apporteurs et Collègues du mois ; pour un administrateur seulement : variable du négociateur et
 * Résultat net de l'agence. Seules les lignes qui CHANGENT sont rendues (l'origine toujours). PUR.
 */
export interface NouvelleOrigine {
  origineContact: OrigineContact | null; origineContactPrecision: string | null; apporteurId: number | null; collegueId: number | null;
  /** Les noms résolus (annuaire, comptes) — ce que la ligne portera. */
  apporteurNom: string | null; collegueLibelle: string | null;
}
export interface LigneConsequence { groupe: string; libelle: string; avant: string; apres: string; sensible?: boolean }

/**
 * La ligne APRÈS l'enregistrement, exactement comme `modifierOrigineActivite` l'écrit : un AUTRE apporteur (ou plus d'apporteur) remet le
 * taux, le montant saisi, le mode et le taux de gestion de l'apporteur à ceux de l'annuaire ; le même apporteur les garde. PUR.
 */
export function appliquerOrigine<T extends ActiviteCalcul>(a: T, n: NouvelleOrigine): T {
  const autreApporteur = n.apporteurId === null || n.apporteurId !== a.apporteurId;
  return {
    ...a, origineContact: n.origineContact, origineContactPrecision: n.origineContact === 'personnalise' ? n.origineContactPrecision : null,
    apporteurId: n.apporteurId, apporteurNom: n.apporteurId === null ? null : n.apporteurNom ?? a.apporteurNom,
    collegueId: n.collegueId, collegueLibelle: n.origineContact === 'collegue' ? n.collegueLibelle : null,
    ...(autreApporteur ? { apporteurTaux: null, commissionSaisie: null, apporteurMode: null, apporteurTauxGestion: null } : {}),
  };
}

const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const cent = (x: number): number => Math.round((x + Number.EPSILON) * 100);

/** Les conséquences de remplacer la ligne `id` par `apres`, sur le mois de sa signature. `voirSensible` : administrateur. PUR. */
export function consequencesOrigine(lignes: readonly ActiviteCalcul[], id: number | string, apres: ActiviteCalcul, ctx: ContexteCalcul,
  o: { voirSensible: boolean; apporteurs: readonly Apporteur[]; collegues?: readonly { id: number; libelle: string }[] }): LigneConsequence[] {
  const avant = lignes.find((x) => String(x.id) === String(id));
  if (avant === undefined) return [];
  const lignesApres = lignes.map((x) => (String(x.id) === String(id) ? apres : x));
  const mois = avant.dateSignature.slice(0, 7);
  const periode = { annee: Number(mois.slice(0, 4)), mois: Number(mois.slice(5, 7)) };
  const nomCollegue = (a: ActiviteCalcul): string => a.collegueLibelle ?? (o.collegues ?? []).find((c) => c.id === a.collegueId)?.libelle ?? (a.collegueId === null || a.collegueId === undefined ? '—' : `compte n° ${a.collegueId}`);
  const sortie: LigneConsequence[] = [];
  const ligne = (groupe: string, libelle: string, av: string, ap: string, toujours = false, sensible = false): void => {
    if (toujours || av !== ap) sortie.push({ groupe, libelle, avant: av, apres: ap, ...(sensible ? { sensible: true } : {}) });
  };
  const montant = (groupe: string, libelle: string, av: number, ap: number, sensible = false): void => ligne(groupe, libelle, eur(av), eur(ap), false, sensible);

  // ① L'origine, l'apporteur, le collègue.
  ligne('Origine', 'Origine du contact', libelleOrigineContact(avant.origineContact ?? null, avant.origineContactPrecision ?? null) || 'à renseigner',
    libelleOrigineContact(apres.origineContact ?? null, apres.origineContactPrecision ?? null) || 'à renseigner', true);
  ligne('Origine', 'Apporteur', avant.apporteurNom ?? '—', apres.apporteurNom ?? '—');
  ligne('Origine', 'Collègue', avant.origineContact === 'collegue' ? nomCollegue(avant) : '—', apres.origineContact === 'collegue' ? nomCollegue(apres) : '—');
  // ② Le dossier.
  ligne('Dossier', 'Statut du bien', LIBELLE_NATURE_BIEN[natureBienLoue(avant).nature], LIBELLE_NATURE_BIEN[natureBienLoue(apres).nature]);
  montant('Dossier', 'Honoraires d’apporteur (à la signature)', commissionApporteurDe(avant, o.apporteurs), commissionApporteurDe(apres, o.apporteurs));
  montant('Dossier', 'Rémunération du collègue rattaché (à la signature)', commissionCollegueSignatureDe(avant, o.apporteurs), commissionCollegueSignatureDe(apres, o.apporteurs));
  // ③ Le mois.
  const t0 = totauxPeriode(lignes, ctx, periode); const t1 = totauxPeriode(lignesApres, ctx, periode);
  const net = (t: typeof t0): number => (cent(t.ca) - cent(t.apporteurs) - cent(t.collegues)) / 100;
  montant('Résultat du mois', 'Honoraires d’apporteurs', t0.apporteurs, t1.apporteurs);
  montant('Résultat du mois', 'Commissions collègues', t0.collegues, t1.collegues);
  montant('Résultat du mois', 'CA HT net', net(t0), net(t1));
  const duMois0 = lignes.filter((x) => x.dateSignature.startsWith(mois)); const duMois1 = lignesApres.filter((x) => x.dateSignature.startsWith(mois));
  for (const n of NATURES_BIEN) {
    const c = (l: readonly ActiviteCalcul[]) => { const s = l.filter((x) => natureBienLoue(x).nature === n); return `${s.length} · ${eur(s.reduce((u, x) => u + caLigne(x), 0))}`; };
    ligne('CA par statut du bien', LIBELLE_NATURE_BIEN[n], c(duMois0), c(duMois1));
  }
  const rec = { lignes: ctx.recurrents ?? [], mois: [mois], aujourdhui: ctx.aujourdhui ?? '9999-12-31' };
  const ac0 = apporteursEtCollegues(duMois0, o.apporteurs, rec); const ac1 = apporteursEtCollegues(duMois1, o.apporteurs, rec);
  const noms = new Set([...ac0.apporteurs.map((x) => x.nom), ...ac1.apporteurs.map((x) => x.nom)]);
  for (const nom of noms) {
    const f = (l: typeof ac0.apporteurs) => { const x = l.find((y) => y.nom === nom); return x === undefined ? '—' : `${x.nb} · ${eur(x.ca)} · ${eur(x.commission)}`; };
    ligne('Apporteurs du mois', nom, f(ac0.apporteurs), f(ac1.apporteurs));
  }
  const cols = new Set([...ac0.collegues.map((x) => x.libelle), ...ac1.collegues.map((x) => x.libelle)]);
  for (const nom of cols) {
    const f = (l: typeof ac0.collegues) => { const x = l.find((y) => y.libelle === nom); return x === undefined ? '—' : `${x.nb} · ${eur(x.ca)} · ${eur(x.commission)}`; };
    ligne('Collègues du mois', nom, f(ac0.collegues), f(ac1.collegues));
  }
  // ④ Réservé aux administrateurs : le variable du négociateur et le Résultat net de l'agence.
  if (o.voirSensible) {
    const n0 = sectionNegociateurs(lignes, ctx, periode); const n1 = sectionNegociateurs(lignesApres, ctx, periode);
    for (const x of n0) {
      const y = n1.find((z) => z.cle === x.cle);
      montant('Variable du négociateur', x.libelle, x.totaux.commission, y?.totaux.commission ?? 0, true);
    }
    const variables = (n: typeof n0) => n.reduce((s, x) => s + cent(x.totaux.commission), 0);
    ligne('Résultat net de l’agence', 'CA net de toutes variables', eur((cent(net(t0)) - variables(n0)) / 100),
      eur((cent(net(t1)) - variables(n1)) / 100), false, true);
  }
  return sortie;
}

/** Le résumé écrit au journal (une ligne par conséquence). PUR. */
export const resumeConsequences = (l: readonly LigneConsequence[]): string => l.map((x) => `${x.groupe} — ${x.libelle} : ${x.avant} → ${x.apres}`).join(' ; ');
