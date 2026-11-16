// Shared name-normalization used to match the same employee across submissions,
// since employees don't log in and there's no employee ID field.
// Safe to import from both client and server code (no server-only APIs used).
export function makeEmployeeKey(lastName: string, firstName: string, middleName?: string | null): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${norm(lastName || '')}|${norm(firstName || '')}|${norm(middleName || '')}`;
}
