/**
 * ══ 🔴🔴 ACCEPTER LES AJOUTS HUMAINS PURS DANS « Documents clients scannés » (Arno, 19/10/2026) ═══════════════════════════
 *
 * L'équipe dépose encore des pièces dans « Documents clients scannés ». Chaque dépôt change l'empreinte (a) et arrête net les
 * étapes réelles du rangement. Pour le rattrapage (R) et la corbeille (D) SEULEMENT, Arno accepte qu'une empreinte différente
 * ne bloque pas QUAND ET SEULEMENT QUAND la différence avec le relevé de référence est faite d'AJOUTS PURS, par un compte
 * HUMAIN du Workspace. Tout le reste arrête immédiatement :
 *   · une disparition, une modification (date, contenu), un renommage, un déplacement, un élément à la corbeille ;
 *   · une étiquette `svav_*` (la marque de l'application) sur n'importe quel élément ;
 *   · un ajout fait par un compte de la LISTE NOIRE (compte de service, gestion@, noreply@, a.jorel@ — décision d'Arno :
 *     l'application agit parfois sous a.jorel@), ou par un compte hors des domaines du Workspace, ou sans auteur lisible ;
 *   · un ajout créé AVANT le relevé de référence (il a été DÉPLACÉ dans le dossier, ce n'est pas un ajout) ;
 *   · un raccourci, un ajout dont le parent n'est ni dans la référence ni lui-même un ajout accepté ;
 *   · plus de 20 ajouts NOUVEAUX dans une même exécution (au-delà, on s'arrête et on demande).
 * PUR : le relevé est lu par le script, le jugement est rendu ici, sans réseau.
 */
import { DOMAINES_INTERNES } from './adresseInterne';

export interface ElementReleve {
  id: string; name: string; mimeType: string; parents?: readonly string[];
  modifiedTime: string; createdTime?: string; md5Checksum?: string; size?: string; trashed?: boolean;
  appProperties?: Readonly<Record<string, string>>;
  lastModifyingUser?: { emailAddress?: string; displayName?: string };
}

/** Les domaines du Workspace : la liste centrale, jamais recopiée (garde `adressesInternesPartout`). */
export const DOMAINES_HUMAINS: readonly string[] = DOMAINES_INTERNES;
/** Décision d'Arno du 19/10/2026 : ces comptes n'ajoutent JAMAIS rien qu'on accepte sans lui. */
export const LISTE_NOIRE_AJOUTS: readonly string[] = ['a.jorel@sansvisavis.com', 'gestion@criterimmo.fr'];
export const PLAFOND_AJOUTS = 20;
const RACCOURCI = 'application/vnd.google-apps.shortcut';

/** Ce compte peut-il être l'auteur d'un ajout accepté ? `null` = oui ; sinon le motif. PUR. */
export function motifAuteurRefuse(email: string | undefined, listeNoire: readonly string[] = LISTE_NOIRE_AJOUTS): string | null {
  const e = (email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(e)) return 'auteur illisible — ne pas savoir vaut refus';
  const [local, domaine] = e.split('@');
  if (domaine.endsWith('gserviceaccount.com')) return `${e} est un compte de service`;
  if (local === 'noreply' || local === 'no-reply') return `${e} est un compte technique (noreply)`;
  if (listeNoire.map((x) => x.toLowerCase()).includes(e)) return `${e} est sur la liste noire`;
  if (!DOMAINES_HUMAINS.includes(domaine)) return `${e} n’est pas un compte du Workspace`;
  return null;
}

const etiquetteApplication = (x: ElementReleve) => Object.keys(x.appProperties ?? {}).find((k) => k.startsWith('svav_'));

/**
 * LE JUGEMENT. `reference` : le relevé complet dont l'empreinte (a) est la référence, et l'instant où il a été lu ; `actuel` :
 * le relevé d'aujourd'hui ; `dejaAcceptes` : les ajouts acceptés lors d'exécutions précédentes (ils ne comptent pas dans le
 * plafond). Rend les ajouts (tous, depuis la référence) ou la liste des motifs d'arrêt. PUR.
 */
export function jugerAjoutsHumains(
  reference: { lu: string; elements: readonly ElementReleve[] },
  actuel: readonly ElementReleve[],
  scannesId: string,
  opts: { dejaAcceptes?: ReadonlySet<string>; plafond?: number; listeNoire?: readonly string[] } = {},
): { ok: true; ajouts: ElementReleve[]; nouveaux: ElementReleve[] } | { ok: false; motifs: string[] } {
  const motifs: string[] = [];
  const A = new Map(reference.elements.map((e) => [e.id, e]));
  const B = new Map(actuel.map((e) => [e.id, e]));
  if (!A.has(scannesId) || !B.has(scannesId)) motifs.push('« Documents clients scannés » absent d’un des deux relevés');
  if (!Number.isFinite(Date.parse(reference.lu))) motifs.push('instant du relevé de référence inconnu');

  for (const o of reference.elements) {
    const n = B.get(o.id);
    if (n === undefined) { motifs.push(`DISPARU : « ${o.name} » (${o.id})`); continue; }
    if (n.trashed === true) motifs.push(`À LA CORBEILLE : « ${o.name} » (${o.id})`);
    if (n.name !== o.name) motifs.push(`RENOMMÉ : « ${o.name} » → « ${n.name} » (${o.id})`);
    if ((n.parents?.[0] ?? '') !== (o.parents?.[0] ?? '')) motifs.push(`DÉPLACÉ : « ${o.name} » (${o.id})`);
    if (n.modifiedTime !== o.modifiedTime || (o.md5Checksum ?? '') !== (n.md5Checksum ?? '')) motifs.push(`MODIFIÉ : « ${o.name} » (${o.id})`);
  }
  for (const x of actuel) {
    const k = etiquetteApplication(x);
    if (k !== undefined) motifs.push(`ÉTIQUETTE ${k} sur « ${x.name} » (${x.id}) : la marque de l’application`);
  }
  const ajouts = actuel.filter((x) => !A.has(x.id));
  const ids = new Set(ajouts.map((x) => x.id));
  for (const x of ajouts) {
    if (x.trashed === true) motifs.push(`AJOUT à la corbeille : « ${x.name} » (${x.id})`);
    if (x.mimeType === RACCOURCI) motifs.push(`AJOUT d’un raccourci : « ${x.name} » (${x.id})`);
    const parent = x.parents?.[0] ?? '';
    if ((x.parents ?? []).length !== 1 || (!A.has(parent) && !ids.has(parent))) motifs.push(`AJOUT hors de l’arbre de référence : « ${x.name} » (${x.id})`);
    if (x.createdTime === undefined || !(Date.parse(x.createdTime) > Date.parse(reference.lu))) {
      motifs.push(`« ${x.name} » (${x.id}) a été créé le ${x.createdTime ?? '?'}, avant le relevé de référence : déplacé dans le dossier, pas ajouté`);
    }
    const auteur = motifAuteurRefuse(x.lastModifyingUser?.emailAddress, opts.listeNoire);
    if (auteur !== null) motifs.push(`AJOUT « ${x.name} » (${x.id}) refusé : ${auteur}`);
  }
  const nouveaux = ajouts.filter((x) => !(opts.dejaAcceptes ?? new Set()).has(x.id));
  const plafond = opts.plafond ?? PLAFOND_AJOUTS;
  if (nouveaux.length > plafond) motifs.push(`${nouveaux.length} ajouts nouveaux dans cette exécution : plus que le plafond (${plafond})`);
  return motifs.length > 0 ? { ok: false, motifs } : { ok: true, ajouts, nouveaux };
}
