export const MASK_PATTERNS: {
  name: string;
  re: RegExp;
  token: string;
}[] = [
  {
    name: "email",
    re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    token: "[이메일]",
  },
  {
    name: "resident_registration_number",
    re: /(?<!\d)\d{6}[-\s]?[1-4]\d{6}(?!\d)/,
    token: "[주민번호]",
  },
  {
    name: "phone",
    re: /(?<!\d)(?:(?:\+?82[-.\s]?)?0?1[016789]|0(?:2|[3-6][1-5]))[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/,
    token: "[전화번호]",
  },
  {
    name: "card_number",
    re: /(?<!\d)(?:\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}|\d{16})(?!\d)/,
    token: "[카드번호]",
  },
  {
    name: "account_number",
    re: /(?:(?<=(?:계좌|계좌번호)\s*[:：]?\s*)\d{10,14}(?!\d)|(?<!\d)(?!(?:19|20)\d{2}-\d{1,2}-\d{1,2}(?!\d))\d{2,6}(?:-\d{2,6}){2,3}(?!\d))/,
    token: "[계좌번호]",
  },
];

export function mask(text: string): string {
  return MASK_PATTERNS.reduce((masked, { re, token }) => {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    return masked.replace(new RegExp(re.source, flags), token);
  }, text);
}
