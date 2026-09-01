import type { Weekday } from "@ndycode/timetablekit";

export const WEEKDAY_OPTIONS: readonly Weekday[] = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
};
