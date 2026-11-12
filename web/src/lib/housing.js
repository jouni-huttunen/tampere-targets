// Housing form (FR-49): Oikotie's AI-guessed housing types (`adData.aiHabitationRentTypes`, sent
// by the API as `housing_types`) turned into the two chip rows of the parameters panel. Pure
// functions, covered by node:test.
//
// Financing: every listing is exactly one of FREE or SUBSIDISED (the user's rule): subsidised when
// its types include 3 (Arava / korkotukiasunto), free-market otherwise, including listings with no
// types at all (in practice an empty guess is a free-market flat).
// Types: the special housing forms (2, 4–8), which Arava is not one of. A listing can have several
// (e.g. [4, 9], a free-market shared flat).

const ARAVA = 3;

export const FREE = 'free';
export const SUBSIDISED = 'subsidised';
export const FINANCING = [
  { key: FREE, label: 'Free-market', title: 'Not Arava: vapaarahoitteinen or no housing form given' },
  { key: SUBSIDISED, label: 'Subsidised', title: 'Arava / korkotukiasunto (state-subsidised)' },
];

/** Oikotie's special housing-form codes (not 3 Arava, not 9 vapaarahoitteinen). */
export const HOUSING_TYPES = [
  { code: 4, label: 'Shared flat', title: 'Soluasunto (a room in a shared flat)' },
  { code: 2, label: 'Sublet', title: 'Alivuokralaisasunto' },
  { code: 5, label: 'Senior', title: 'Senioritalo' },
  { code: 7, label: 'Employer', title: 'Työsuhdeasunto' },
  { code: 6, label: 'Service', title: 'Palvelutalo' },
  { code: 8, label: 'Student', title: 'Opiskelija-asunto' },
];
export const TYPE_CODES = HOUSING_TYPES.map((t) => t.code);

const typesOf = (l) => (Array.isArray(l.housing_types) ? l.housing_types : []);

/** FREE or SUBSIDISED. */
export function financing(l) {
  return typesOf(l).includes(ARAVA) ? SUBSIDISED : FREE;
}

/** True when the listing has any of the given type codes. */
export function hasAnyType(l, codes) {
  if (!codes.length) return false;
  return typesOf(l).some((c) => codes.includes(c));
}

/**
 * Counts for both chip rows, over the listings not removed (like the move-in chips):
 * { financing: { free, subsidised }, types: { [code]: n } }.
 */
export function housingCounts(listings) {
  const c = { financing: { [FREE]: 0, [SUBSIDISED]: 0 }, types: Object.fromEntries(TYPE_CODES.map((k) => [k, 0])) };
  for (const l of listings) {
    if (l.removed) continue;
    c.financing[financing(l)]++;
    for (const code of new Set(typesOf(l))) if (code in c.types) c.types[code]++;
  }
  return c;
}
