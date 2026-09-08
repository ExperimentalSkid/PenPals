export type CountryOption = { code: string; name: string; aliases?: string[] };

// ISO 3166-1 alpha-2 codes. Labels are produced from the platform's canonical
// English region names instead of being inferred from the current result set.
const COUNTRY_CODES = `
  AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CD CG CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW
`.trim().split(/\s+/);

const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

// Keep common English search names alongside the canonical display names. The
// data source and stored values remain ISO codes; aliases only make lookup
// forgiving (for example, "Turkey" should find canonical "Türkiye").
const COUNTRY_ALIASES: Record<string, string[]> = {
  TR: ["Turkey"],
  CZ: ["Czech Republic"],
  CI: ["Ivory Coast", "Cote d'Ivoire"],
  KR: ["Korea"],
  RU: ["Russian Federation"],
  US: ["USA", "United States of America"],
};

export const COUNTRY_OPTIONS: CountryOption[] = COUNTRY_CODES.map((code) => ({
  code,
  name: displayNames.of(code) ?? code,
  aliases: COUNTRY_ALIASES[code],
}));

const countryCodeByName = new Map(
  COUNTRY_OPTIONS.flatMap((country) => [country.name, ...(country.aliases ?? [])].map((name) => [name.toLocaleLowerCase(), country.code] as const)),
);

export function countryCodeForName(value: string | null | undefined) {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized ? countryCodeByName.get(normalized) ?? null : null;
}

export function countryNameForCode(value: string | null | undefined) {
  if (!value) return null;
  return COUNTRY_OPTIONS.find((country) => country.code === value.toUpperCase())?.name ?? null;
}
