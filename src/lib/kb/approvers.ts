const APPROVERS = (process.env.KB_APPROVERS || "david@coolkidz.com.au,mel@coolkidz.com.au")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
export const isApprover = (email: string | null | undefined) => !!email && APPROVERS.includes(email.toLowerCase());
