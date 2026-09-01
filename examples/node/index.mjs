import { parseTimetable, toJSON } from "@ndycode/timetablekit";

const result = await parseTimetable(
  {
    kind: "text",
    text: "Midterm Exam | 2026-10-12 | 09:00-10:30 | Room 101",
  },
  {
    locale: "en-PH",
    timezone: "Asia/Manila",
  },
);

process.stdout.write(`${toJSON(result, { pretty: true })}\n`);
