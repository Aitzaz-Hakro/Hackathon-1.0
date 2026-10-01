/**
 * The seeded demo accounts, shared by the login page's one-click buttons.
 *
 * Emails appear in the client bundle by design; the password does not — it
 * lives in `src/lib/actions/auth.ts` and `scripts/seed-users.ts`.
 */
export type DemoAccount = {
  email: string;
  label: string;
  role: "student" | "faculty" | "lab_staff" | "coordinator" | "admin";
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "student@lab.edu", label: "Student", role: "student" },
  { email: "faculty@lab.edu", label: "Faculty", role: "faculty" },
  { email: "staff@lab.edu", label: "Lab Staff", role: "lab_staff" },
  { email: "coordinator@lab.edu", label: "Coordinator", role: "coordinator" },
  { email: "admin@lab.edu", label: "Admin", role: "admin" },
];
