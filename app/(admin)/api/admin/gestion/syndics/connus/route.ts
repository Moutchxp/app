import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { syndicsConnusPourAdresse } from '../../../../../../lib/gestion/doublonSyndicRepo';
import { syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';

/**
 * GET /api/admin/gestion/syndics/connus?libelle=&cp=&commune=&lot=&exclure= — LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION.
 * À l'ouverture de « Rattacher un nouveau syndic » depuis un bien ou une adresse : les syndics déjà rattachés à la
 * MÊME adresse postale (un autre bien du portefeuille, une adresse de la même copropriété, la même parcelle).
 * L'adresse est celle d'un IMMEUBLE (comme `coproprietes/contacts?immeuble=`), jamais celle d'une personne.
 * 🔒 LECTURE SEULE.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

const entier = (v: string | null): number | null => {
  const n = Number(v);
  return v !== null && Number.isSafeInteger(n) && n > 0 ? n : null;
};

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  const libelle = (u.get('libelle') ?? '').trim().slice(0, 300);
  if (libelle === '') return Response.json({ etat: 'ok', syndics: [] }, { headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) return Response.json({ etat: 'ok', syndics: [] }, { headers: ENTETES });
    const syndics = await syndicsConnusPourAdresse(
      { libelle, codePostal: (u.get('cp') ?? '').trim().slice(0, 10), commune: (u.get('commune') ?? '').trim().slice(0, 120) },
      { lotId: entier(u.get('lot')), exclureSyndic: entier(u.get('exclure')) });
    return Response.json({ etat: 'ok', syndics }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/connus] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
