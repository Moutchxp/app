import {
  causeEnFrancais, corpsAlerte, doitAlerter, ESSAIS_MAX, objetAlerte, verdictPieces,
  type EtatPiece,
} from './fileEnvoi';

/**
 * MODULE « GESTION » — LOT ENVOI-ARRIERE-PLAN : LE TRAVAILLEUR QUI VIDE LA FILE.
 *
 * IMPUR, mais TOUT est injecté : base, Drive, Gmail, horloge. Aucune connexion n'est ouverte par ce fichier — c'est
 * ce qui permet d'éprouver « le mail ne part pas si une pièce manque » sans qu'un seul mail parte.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 L'ORDRE DES GESTES EST LA FONCTIONNALITÉ, comme dans `envoi.ts`, et chaque inversion a une conséquence connue :
 *   ① on récupère d'abord les PIÈCES en attente — c'est ce qui prend du temps, et plusieurs à la fois ;
 *   ② on ne prend une ligne de la file que si son bail est libre → un travailleur mort ne bloque rien, et deux
 *      travailleurs vivants ne font pas partir le même mail deux fois ;
 *   ③ on regarde l'état des pièces AVANT d'appeler Gmail → jamais d'envoi partiel ;
 *   ④ on envoie, par le MÊME chemin que l'envoi synchrone (`envoyerMessage`) → une seule façon d'envoyer un mail
 *      dans toute l'application, donc une seule à surveiller ;
 *   ⑤ en cas d'échec : le brouillon est REMIS, PUIS l'alerte part. Dans cet ordre — l'alerte annonce un brouillon
 *      qui doit déjà exister quand on clique son lien.
 *
 * 🔴🔴 CE TRAVAILLEUR NE SUPPRIME JAMAIS RIEN. Une ligne échouée reste en base avec sa cause ; un brouillon remis
 * garde son texte et ses pièces déjà récupérées. Le pire résultat possible de ce module est « ce mail n'est pas
 * parti, et voici pourquoi » — jamais « ce mail a disparu ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une ligne de la file, telle que le travailleur la voit. */
export interface LigneFile {
  id: number;
  cleIdempotence: string;
  brouillonId: number | null;
  objet: string;
  destinataires: string[];
  demandeLe: Date;
  essais: number;
  alerteLe: Date | null;
  /** 🔴 Une alerte ne déclenche jamais une alerte : cette ligne EST-elle un mail d'alerte ? */
  estUneAlerte: boolean;
}

/** Une pièce en attente de ses octets. */
export interface PieceAFond {
  id: number;
  nom: string;
  driveId: string;
  essais: number;
}

export interface DepsTravailleur {
  /** ① Les pièces à récupérer, bail pris. Vide = rien à faire. */
  piecesAPrendre(max: number): Promise<PieceAFond[]>;
  /** Tire les octets du Drive et les dépose chez nous. Lève en cas d'échec — c'est le travailleur qui décide. */
  recupererPiece(p: PieceAFond): Promise<void>;
  /** Marque une pièce prête, ou en échec définitif (avec la cause). */
  marquerPiece(id: number, m: { etat: EtatPiece; erreur?: string | null }): Promise<void>;
  /** ② Les lignes de file à traiter, bail pris. */
  lignesAPrendre(max: number): Promise<LigneFile[]>;
  /** ③ L'état des pièces d'une ligne, et le NOM de la première qui a échoué (pour la cause en français). */
  etatDesPieces(l: LigneFile): Promise<{ etats: EtatPiece[]; premiereEchouee: string | null }>;
  /** Rend la ligne à la file (bail relâché) : ses pièces ne sont pas encore prêtes. */
  remettreEnAttente(id: number): Promise<void>;
  /** ④ L'envoi réel, par le MÊME chemin que l'envoi synchrone. */
  envoyer(l: LigneFile): Promise<{ ok: true; envoiId: number } | { ok: false; motif: string }>;
  /** Marque la ligne partie. */
  marquerEnvoye(id: number, envoiId: number): Promise<void>;
  /** Marque la ligne échouée, avec sa cause en français. */
  marquerEchec(id: number, cause: string): Promise<void>;
  /** ⑤ Remet le brouillon dans les Brouillons, avec tout son contenu. */
  remettreEnBrouillon(l: LigneFile): Promise<void>;
  /** Envoie l'alerte. Ne doit JAMAIS lever : une alerte qui échoue ne doit pas bloquer la file. */
  alerter(a: { ligne: LigneFile; objet: string; corps: string }): Promise<void>;
  /** Note que l'alerte est partie — pour qu'elle ne reparte jamais. */
  marquerAlerte(id: number): Promise<void>;
  /** Le lien vers le brouillon, pour le corps de l'alerte. */
  lienBrouillon(brouillonId: number | null): string;
  /** Signale un incident au journal DU SERVEUR. Ne doit RIEN lever : c'est le dernier filet. */
  incident(etape: string, e: unknown): void;
  maintenant(): Date;
}

/** Ce qu'une passe a fait. Sert au journal de la relève, et aux tests. */
export interface RapportPasse {
  piecesRecuperees: number;
  piecesEchouees: number;
  envoyes: number;
  echecs: number;
  alertes: number;
  reportes: number;
}

const VIDE: RapportPasse = {
  piecesRecuperees: 0, piecesEchouees: 0, envoyes: 0, echecs: 0, alertes: 0, reportes: 0,
};

/**
 * ══ ① LES PIÈCES, PLUSIEURS À LA FOIS ════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 PARALLÉLISME RAISONNABLE, ET « RAISONNABLE » A UN SENS PRÉCIS ICI : assez pour que six pièces n'attendent pas
 * l'une après l'autre, assez peu pour ne pas se faire limiter par Google (`429`) — auquel cas on irait PLUS
 * lentement qu'en série, avec des reprises en plus. Quatre est le compromis retenu.
 *
 * ⚠️ `allSettled`, JAMAIS `all` : avec `all`, une seule pièce en échec abandonnerait les trois autres en vol, et
 * elles repartiraient de zéro à la passe suivante. Chaque pièce vit et meurt pour son propre compte.
 */
export const PIECES_EN_PARALLELE = 4;

export async function recupererLesPieces(deps: DepsTravailleur, max = PIECES_EN_PARALLELE): Promise<RapportPasse> {
  const r = { ...VIDE };
  const pieces = await deps.piecesAPrendre(max);
  if (pieces.length === 0) return r;

  const issues = await Promise.allSettled(pieces.map(async (p) => {
    await deps.recupererPiece(p);
    return p;
  }));

  for (let i = 0; i < issues.length; i += 1) {
    const p = pieces[i];
    const issue = issues[i];
    if (issue.status === 'fulfilled') {
      await deps.marquerPiece(p.id, { etat: 'prete' });
      r.piecesRecuperees += 1;
      continue;
    }
    const motif = issue.reason instanceof Error ? issue.reason.message : String(issue.reason);
    /**
     * 🔴 LA REPRISE EST COMPTÉE SUR LA PIÈCE, PAS SUR LA PASSE. Une erreur passagère (réseau coupé, jeton qui vient
     * d'expirer, `429`) mérite un nouvel essai ; le même échec trois fois de suite est un fichier qu'on ne peut pas
     * lire, et s'acharner ne fait que retarder le moment où on le DIT.
     */
    if (p.essais + 1 >= ESSAIS_MAX) {
      await deps.marquerPiece(p.id, { etat: 'echec', erreur: motif });
      r.piecesEchouees += 1;
    } else {
      await deps.marquerPiece(p.id, { etat: 'attente', erreur: motif });
    }
  }
  return r;
}

/**
 * ══ ②③④⑤ LES MAILS ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function envoyerCeQuiEstPret(deps: DepsTravailleur, max = 5): Promise<RapportPasse> {
  const r = { ...VIDE };
  const lignes = await deps.lignesAPrendre(max);

  for (const l of lignes) {
    try {
      // ③ L'ÉTAT DES PIÈCES, AVANT TOUT APPEL À GMAIL. C'est ici que se joue « jamais d'envoi partiel ».
      const { etats, premiereEchouee } = await deps.etatDesPieces(l);
      const verdict = verdictPieces(etats);

      if (verdict.v === 'attendre') {
        // On rend la ligne à la file : rien n'a été tenté, rien n'est perdu, on repassera.
        await deps.remettreEnAttente(l.id);
        r.reportes += 1;
        continue;
      }

      if (verdict.v === 'echec') {
        await echouer(deps, l, causeEnFrancais({ sorte: 'piece', nom: premiereEchouee ?? 'une pièce jointe' }), r);
        continue;
      }

      // ④ L'ENVOI RÉEL, par le MÊME chemin que l'envoi synchrone.
      const issue = await deps.envoyer(l);
      if (issue.ok) {
        await deps.marquerEnvoye(l.id, issue.envoiId);
        r.envoyes += 1;
        continue;
      }
      await echouer(deps, l, causeEnFrancais({ sorte: 'gmail', detail: issue.motif }), r);
    } catch (e) {
      /**
       * ⚠️ UNE LIGNE QUI JETTE NE DOIT PAS EMPORTER LA PASSE. Les autres mails de la file n'y sont pour rien, et
       * les abandonner ferait d'une erreur isolée une panne générale.
       */
      deps.incident('file', e);
      const motif = e instanceof Error ? e.message : String(e);
      try {
        await echouer(deps, l, causeEnFrancais({ sorte: 'inconnue', detail: motif }), r);
      } catch (e2) {
        deps.incident('file-echec', e2);
      }
    }
  }
  return r;
}

/**
 * ⑤ L'ÉCHEC : ON MARQUE, ON REMET EN BROUILLON, PUIS ON ALERTE. Dans cet ordre, et il compte.
 *
 * 🔴 LE BROUILLON AVANT L'ALERTE : l'alerte porte un lien vers le brouillon. Alerter d'abord, c'est risquer qu'on
 * clique le lien avant que le brouillon existe — et qu'on trouve une page vide en cherchant un mail perdu.
 *
 * 🔴 L'ALERTE NE PEUT PAS FAIRE ÉCHOUER LE RESTE. Si elle ne part pas, la ligne reste marquée « non envoyé », le
 * brouillon est là, la capsule rouge s'affiche à l'écran. On perd un signal, pas le travail.
 */
async function echouer(deps: DepsTravailleur, l: LigneFile, cause: string, r: RapportPasse): Promise<void> {
  await deps.marquerEchec(l.id, cause);
  r.echecs += 1;

  try {
    await deps.remettreEnBrouillon(l);
  } catch (e) {
    deps.incident('brouillon', e);
  }

  if (!doitAlerter({ etat: 'echec', alerteLe: l.alerteLe, estUneAlerte: l.estUneAlerte })) return;
  try {
    await deps.alerter({
      ligne: l,
      objet: objetAlerte(l.objet),
      corps: corpsAlerte({
        objet: l.objet,
        destinataires: l.destinataires,
        cliqueLe: l.demandeLe,
        cause,
        lienBrouillon: deps.lienBrouillon(l.brouillonId),
      }),
    });
    // 🔴 MARQUÉE APRÈS L'ENVOI, jamais avant : marquer d'abord ferait perdre l'alerte si l'envoi échouait, et
    //   personne ne serait prévenu de rien.
    await deps.marquerAlerte(l.id);
    r.alertes += 1;
  } catch (e) {
    deps.incident('alerte', e);
  }
}

/**
 * UNE PASSE COMPLÈTE : les pièces, puis les mails.
 *
 * 🔴 LES PIÈCES D'ABORD, ET CE N'EST PAS INDIFFÉRENT. Récupérer avant d'examiner la file, c'est donner une chance
 * aux mails de partir DANS LA MÊME PASSE. L'ordre inverse les reporterait systématiquement d'un tour — soit une
 * minute de retard sur chaque envoi, pour rien.
 */
export async function passeEnvoi(deps: DepsTravailleur): Promise<RapportPasse> {
  const a = await recupererLesPieces(deps);
  const b = await envoyerCeQuiEstPret(deps);
  return {
    piecesRecuperees: a.piecesRecuperees + b.piecesRecuperees,
    piecesEchouees: a.piecesEchouees + b.piecesEchouees,
    envoyes: a.envoyes + b.envoyes,
    echecs: a.echecs + b.echecs,
    alertes: a.alertes + b.alertes,
    reportes: a.reportes + b.reportes,
  };
}

/** La ligne de journal d'une passe. Vide = rien à dire, et on ne dit rien. PUR. */
export function resumePasse(r: RapportPasse): string | null {
  const bouts: string[] = [];
  if (r.piecesRecuperees > 0) bouts.push(`${r.piecesRecuperees} pièce(s) récupérée(s)`);
  if (r.piecesEchouees > 0) bouts.push(`${r.piecesEchouees} pièce(s) en échec`);
  if (r.envoyes > 0) bouts.push(`${r.envoyes} mail(s) envoyé(s)`);
  if (r.echecs > 0) bouts.push(`${r.echecs} mail(s) NON envoyé(s)`);
  if (r.alertes > 0) bouts.push(`${r.alertes} alerte(s)`);
  if (r.reportes > 0) bouts.push(`${r.reportes} en attente de pièces`);
  return bouts.length === 0 ? null : `file d’envoi : ${bouts.join(', ')}.`;
}
