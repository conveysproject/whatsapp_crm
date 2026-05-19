export function maskPhone(phone: string): string {
  return phone.slice(0, 3) + "X".repeat(Math.max(0, phone.length - 3));
}

export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx < 2) return "***@***";
  return email.slice(0, 2) + "***" + email.slice(atIdx);
}
