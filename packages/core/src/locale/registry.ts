import { TimetableError } from "../errors.js";
import type {
  LocaleDefinition,
  LocaleRegistry,
  Weekday,
} from "../schema/types.js";

export type DayRecognition = {
  readonly weekdays: readonly Weekday[];
  readonly tokens: readonly string[];
};

const EN_PH_ALIASES = {
  monday: "MO",
  mon: "MO",
  mo: "MO",
  m: "MO",
  tuesday: "TU",
  tue: "TU",
  tues: "TU",
  tu: "TU",
  t: "TU",
  wednesday: "WE",
  wed: "WE",
  we: "WE",
  w: "WE",
  thursday: "TH",
  thu: "TH",
  thur: "TH",
  thurs: "TH",
  th: "TH",
  friday: "FR",
  fri: "FR",
  fr: "FR",
  f: "FR",
  saturday: "SA",
  sat: "SA",
  sa: "SA",
  sunday: "SU",
  sun: "SU",
  su: "SU",
  s: "SU",
  lunes: "MO",
  lun: "MO",
  lu: "MO",
  martes: "TU",
  mar: "TU",
  ma: "TU",
  miyerkules: "WE",
  miyer: "WE",
  miye: "WE",
  mi: "WE",
  miy: "WE",
  huwebes: "TH",
  huwe: "TH",
  huw: "TH",
  hu: "TH",
  biyernes: "FR",
  biyer: "FR",
  biye: "FR",
  bi: "FR",
  sabado: "SA",
  sab: "SA",
  linggo: "SU",
  ling: "SU",
  lin: "SU",
  li: "SU",
} satisfies Readonly<Record<string, Weekday>>;

export const EN_PH_LOCALE: LocaleDefinition = {
  id: "en-PH",
  dayAliases: EN_PH_ALIASES,
  dateOrder: "MDY",
};

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[.]/g, "");
}

class ImmutableLocaleRegistry implements LocaleRegistry {
  constructor(readonly definitions: readonly LocaleDefinition[]) {}

  get(id: string): LocaleDefinition {
    const wanted = id.toLocaleLowerCase();
    const definition = this.definitions.find(
      (entry) => entry.id.toLocaleLowerCase() === wanted,
    );
    if (definition === undefined) {
      throw new TimetableError(
        "INVALID_OPTIONS",
        "The requested locale is not registered.",
        {
          locale: id,
        },
      );
    }
    return definition;
  }

  with(definition: LocaleDefinition): LocaleRegistry {
    const withoutPrevious = this.definitions.filter(
      (entry) =>
        entry.id.toLocaleLowerCase() !== definition.id.toLocaleLowerCase(),
    );
    return new ImmutableLocaleRegistry([...withoutPrevious, definition]);
  }
}

export function createLocaleRegistry(
  definitions: readonly LocaleDefinition[] = [EN_PH_LOCALE],
): LocaleRegistry {
  return new ImmutableLocaleRegistry(definitions);
}

function isCompactToken(token: string, original: string): boolean {
  return (
    original.length > 1 &&
    original.length <= 8 &&
    /^[A-Z]+$/.test(original) &&
    /^[mtwfsaueh]+$/i.test(token)
  );
}

function readCompactToken(
  token: string,
  aliases: Readonly<Record<string, Weekday>>,
): readonly Weekday[] {
  const keys = Object.keys(aliases).sort(
    (left, right) => right.length - left.length,
  );
  const result: Weekday[] = [];
  let offset = 0;
  while (offset < token.length) {
    const key = keys.find((candidate) => token.startsWith(candidate, offset));
    if (key === undefined) {
      return [];
    }
    const weekday = aliases[key];
    if (weekday !== undefined && !result.includes(weekday)) {
      result.push(weekday);
    }
    offset += key.length;
  }
  return result;
}

export function parseWeekdays(
  text: string,
  definition: LocaleDefinition,
): DayRecognition {
  const aliases = Object.fromEntries(
    Object.entries(definition.dayAliases).map(([key, value]) => [
      normalized(key),
      value,
    ]),
  ) satisfies Readonly<Record<string, Weekday>>;
  const tokenPattern = /[\p{L}\p{N}]+/gu;
  const found: Weekday[] = [];
  const tokens: string[] = [];
  let match = tokenPattern.exec(text);
  while (match !== null) {
    const original = match[0];
    const token = normalized(original);
    const direct = aliases[token];
    const compact =
      direct === undefined && isCompactToken(token, original)
        ? readCompactToken(token, aliases)
        : [];
    if (direct !== undefined) {
      if (!found.includes(direct)) {
        found.push(direct);
      }
      tokens.push(original);
    } else if (compact.length > 0) {
      for (const weekday of compact) {
        if (!found.includes(weekday)) {
          found.push(weekday);
        }
      }
      tokens.push(original);
    }
    match = tokenPattern.exec(text);
  }
  const order: readonly Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  return {
    weekdays: order.filter((weekday) => found.includes(weekday)),
    tokens,
  };
}

export function normalizeLocaleAlias(value: string): string {
  return normalized(value).replace(/\s+/g, " ").trim();
}
