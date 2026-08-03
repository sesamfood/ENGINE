import { ConvexError } from "convex/values";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 200;

export const DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT =
  "Dårlig levering – {location} – {date}";

export function validateBadDeliveryEmailSubject(value: string) {
  const subject = value.trim();
  if (!subject || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    throw new ConvexError("E-mailens emne skal være mellem 1 og 200 tegn");
  }
  return subject;
}

export function validateBadDeliveryRecipients(lists: {
  to: string[];
  cc: string[];
  bcc: string[];
}) {
  const normalized = {
    to: lists.to.map((email) => email.trim()),
    cc: lists.cc.map((email) => email.trim()),
    bcc: lists.bcc.map((email) => email.trim()),
  };
  const all = [...normalized.to, ...normalized.cc, ...normalized.bcc];
  if (all.length > MAX_RECIPIENTS) {
    throw new ConvexError("Der kan højst angives 50 modtagere");
  }
  if (all.some((email) => !EMAIL.test(email))) {
    throw new ConvexError("En eller flere e-mailadresser er ugyldige");
  }
  const unique = new Set(all.map((email) => email.toLocaleLowerCase("en-US")));
  if (unique.size !== all.length) {
    throw new ConvexError("Den samme e-mailadresse må kun angives én gang");
  }
  return normalized;
}
