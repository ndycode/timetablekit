import type { TimetableInput, TermRange } from "@ndycode/timetablekit";

export const SAMPLE_TEXT = `# Campus week / Spring 2025
Mon 09:00-11:00 CS101 Algorithms | Room 204 | Instructor: A. Reyes
Mon 10:30-12:00 MATH201 Discrete Math | Room 204
Mon 14:00-15:30 CS205 Databases | Room 305
Tue 09:00-11:00 CS101 Algorithms | Room 204
Tue 13:00-14:30 MATH201 Discrete Math | Room 204
Tue 15:00-16:30 CS205 Databases | Room 305
Tue 15:00-16:30 CS205 Databases | Room 305`;

export const SAMPLE_INPUT: TimetableInput = {
  kind: "text",
  text: SAMPLE_TEXT,
  filename: "campus-week-spring-2025.txt",
};

export const SAMPLE_TERM: TermRange = {
  startsOn: "2025-05-12",
  endsOn: "2025-05-30",
};

export const SAMPLE_LABEL = "Campus week / Spring 2025";
