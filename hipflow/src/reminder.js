// A calendar file with a daily stretch reminder for the 10 weeks.
import { addDays } from "./data/program.js";

export function reminderIcs(startDate, time = "18:00", days = 70) {
  const [h, m] = time.split(":").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const d = startDate.replaceAll("-", "");
  const end = addDays(startDate, days - 1).replaceAll("-", "");
  const t = `${pad(h)}${pad(m)}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HipFlow//EN", "BEGIN:VEVENT",
    `UID:hipflow-${d}@hipflow.app`, `DTSTAMP:${stamp}`,
    `DTSTART:${d}T${t}`, "DURATION:PT10M",
    `RRULE:FREQ=DAILY;UNTIL=${end}T235959`,
    "SUMMARY:HipFlow · 10-minute hip stretch",
    "DESCRIPTION:Open HipFlow and start today's session.",
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:Time to stretch", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadReminder(startDate, time) {
  const blob = new Blob([reminderIcs(startDate, time)], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "hipflow-reminder.ics";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
