/**
 * Seeds demo accounts and booking history.
 *
 * Run AFTER pasting all four migrations into the Supabase SQL Editor:
 *
 *   npm run seed
 *
 * Requires `.env.local` with NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. The service-role key bypasses Row Level Security,
 * so this file must never be imported from anything under `src/`.
 *
 * Auth users are created through the Admin API rather than by inserting into
 * `auth.users` directly — the supported path, and the one that keeps the
 * encrypted password column and identity rows consistent.
 */

import { createClient } from "@supabase/supabase-js";

import type { BookingStatus, Database, UserRole } from "../src/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "\nMissing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill both in, then re-run `npm run seed`.\n",
  );
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Shared password for every demo account, so judges can log in from the list. */
const DEMO_PASSWORD = "hackathon123";

type DemoUser = {
  email: string;
  fullName: string;
  role: UserRole;
  departmentCode: string;
  studentId?: string;
  label: string;
};

const DEMO_USERS: DemoUser[] = [
  {
    email: "student@lab.edu",
    fullName: "Hamza Iqbal",
    role: "student",
    departmentCode: "CS",
    studentId: "CS-2022-0147",
    label: "Student",
  },
  {
    email: "faculty@lab.edu",
    fullName: "Dr. Nadia Rehman",
    role: "faculty",
    departmentCode: "CS",
    label: "Faculty",
  },
  {
    email: "staff@lab.edu",
    fullName: "Imran Sheikh",
    role: "lab_staff",
    departmentCode: "CS",
    label: "Lab staff",
  },
  {
    email: "coordinator@lab.edu",
    fullName: "Dr. Ayesha Khan",
    role: "coordinator",
    departmentCode: "CS",
    label: "Coordinator",
  },
  {
    email: "admin@lab.edu",
    fullName: "System Administrator",
    role: "admin",
    departmentCode: "CS",
    label: "Administrator",
  },
  // Extra students so the analytics have more than one requester.
  {
    email: "sara@lab.edu",
    fullName: "Sara Butt",
    role: "student",
    departmentCode: "EE",
    studentId: "EE-2021-0088",
    label: "Student (EE)",
  },
  {
    email: "usman@lab.edu",
    fullName: "Usman Tariq",
    role: "student",
    departmentCode: "ME",
    studentId: "ME-2023-0311",
    label: "Student (ME)",
  },
  {
    email: "ee.staff@lab.edu",
    fullName: "Fatima Noor",
    role: "lab_staff",
    departmentCode: "EE",
    label: "Lab staff (EE)",
  },
];

/**
 * Deterministic PRNG so re-running produces the same demo data.
 * A mulberry32 — small, fast, and good enough for picking demo slots.
 */
function makeRandom(seed: number) {
  let state = seed;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function makeCheckoutCode(index: number): string {
  const random = makeRandom(index * 7919 + 13);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let position = 0; position < 6; position += 1) {
    code += alphabet[Math.floor(random() * alphabet.length)];
  }
  return `LAB-${code}`;
}

async function main() {
  console.log("\nSeeding University Lab & Equipment Booking System\n");

  // ---------------------------------------------------------------------------
  // Departments
  // ---------------------------------------------------------------------------

  const { data: departments, error: departmentError } = await db.from("departments").select("id, code, name");

  if (departmentError || !departments?.length) {
    throw new Error(
      `Could not read departments (${departmentError?.message ?? "no rows"}). ` +
        "Paste 0004_seed_reference.sql into the Supabase SQL Editor first.",
    );
  }

  const departmentByCode = new Map(departments.map((department) => [department.code, department.id]));
  console.log(`  departments            ${departments.length} found`);

  // ---------------------------------------------------------------------------
  // Auth users + profiles
  // ---------------------------------------------------------------------------

  const profileIdByEmail = new Map<string, string>();

  for (const demo of DEMO_USERS) {
    const departmentId = departmentByCode.get(demo.departmentCode);
    if (!departmentId) {
      throw new Error(`Unknown department code "${demo.departmentCode}" for ${demo.email}.`);
    }

    // Create the auth user. `email_confirm: true` skips the confirmation mail,
    // which would otherwise block login for a demo account.
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: demo.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: demo.fullName },
    });

    let userId = created?.user?.id;

    if (createError) {
      if (!/already|exists|registered/i.test(createError.message)) {
        throw new Error(`Could not create ${demo.email}: ${createError.message}`);
      }

      // Already present from an earlier run — look the id up instead.
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users.find((user) => user.email === demo.email);
      if (!existing) {
        throw new Error(`${demo.email} already exists but could not be found in the user list.`);
      }
      userId = existing.id;
    }

    if (!userId) throw new Error(`No user id returned for ${demo.email}.`);

    profileIdByEmail.set(demo.email, userId);

    // The `handle_new_user` trigger already inserted a profile defaulting to
    // `student`. Set the real role and department — this runs with the
    // service-role key, so RLS does not apply.
    const { error: profileError } = await db
      .from("profiles")
      .update({
        full_name: demo.fullName,
        role: demo.role,
        department_id: departmentId,
        student_id: demo.studentId ?? null,
      })
      .eq("id", userId);

    if (profileError) throw new Error(`Could not update profile for ${demo.email}: ${profileError.message}`);

    console.log(`  ${demo.label.padEnd(22)} ${demo.email}`);
  }

  // ---------------------------------------------------------------------------
  // Reference data for booking generation
  // ---------------------------------------------------------------------------

  const { data: labs, error: labError } = await db
    .from("labs")
    .select("id, name, code, capacity, department_id, facilities");

  if (labError || !labs?.length) {
    throw new Error(`Could not read labs: ${labError?.message ?? "no rows"}`);
  }

  const { data: equipment, error: equipmentError } = await db
    .from("equipment")
    .select("id, name, lab_id, total_quantity");

  if (equipmentError || !equipment?.length) {
    throw new Error(`Could not read equipment: ${equipmentError?.message ?? "no rows"}`);
  }

  // Start clean so re-running does not pile up history.
  const { error: clearError } = await db
    .from("bookings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (clearError) throw new Error(`Could not clear existing bookings: ${clearError.message}`);

  // ---------------------------------------------------------------------------
  // Historical bookings
  //
  // Past bookings are written with status `completed`, which is not in the
  // active set, so they cannot trip the `bookings_no_lab_overlap` EXCLUDE
  // constraint — the generator can place them freely. The handful of live
  // bookings below are hand-placed on distinct slots for the same reason.
  // ---------------------------------------------------------------------------

  const requesterEmails = ["student@lab.edu", "sara@lab.edu", "usman@lab.edu", "faculty@lab.edu"];

  const purposes = [
    "Final year project session",
    "Data structures lab work",
    "Midterm exam practice",
    "Thesis research and data collection",
    "Group assignment meeting",
    "Robotics competition preparation",
    "Circuit design and testing",
    "Machine learning model training",
    "Course project demo rehearsal",
    "Independent study session",
  ];

  // Weighted toward afternoon so the usage heatmap shows a realistic peak.
  const startHours = [9, 9, 10, 10, 11, 11, 12, 13, 14, 14, 14, 15, 15, 16, 16, 17];
  const durations = [60, 60, 120, 120, 120, 180, 240];

  const random = makeRandom(20261001);
  const HISTORY_DAYS = 120;
  const bookingsToInsert: Array<Database["public"]["Tables"]["bookings"]["Insert"]> = [];

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo -= 1) {
    // Weekends are quiet — only a fifth of the usual volume.
    const date = new Date(`${isoDate(-daysAgo)}T00:00:00Z`);
    const weekday = date.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    const bookingsToday = isWeekend ? Math.floor(random() * 2) : 1 + Math.floor(random() * 5);

    for (let index = 0; index < bookingsToday; index += 1) {
      const lab = labs[Math.floor(random() * labs.length)];
      const startHour = startHours[Math.floor(random() * startHours.length)];
      const durationMinutes = durations[Math.floor(random() * durations.length)];
      const endHour = Math.min(startHour + durationMinutes / 60, 21);

      if (endHour <= startHour) continue;

      const email = requesterEmails[Math.floor(random() * requesterEmails.length)];
      const userId = profileIdByEmail.get(email);
      if (!userId) continue;

      // A few rejections and cancellations, so the status breakdown is not
      // uniformly green.
      const roll = random();
      const bookingStatus: BookingStatus =
        roll > 0.94 ? "rejected" : roll > 0.89 ? "cancelled" : roll > 0.85 ? "returned_late" : "completed";

      bookingsToInsert.push({
        user_id: userId,
        resource_type: "lab",
        lab_id: lab.id,
        booking_date: isoDate(-daysAgo),
        start_time: `${String(startHour).padStart(2, "0")}:00`,
        end_time: `${String(Math.floor(endHour)).padStart(2, "0")}:${endHour % 1 === 0 ? "00" : "30"}`,
        purpose: purposes[Math.floor(random() * purposes.length)],
        expected_attendees: Math.min(1 + Math.floor(random() * lab.capacity), lab.capacity),
        approval_status: bookingStatus === "rejected" ? "rejected" : "approved",
        booking_status: bookingStatus,
        rejection_reason: bookingStatus === "rejected" ? "Lab reserved for scheduled coursework." : null,
        priority_score: Math.floor(random() * 60),
      });
    }
  }

  // Insert in chunks — a single statement with hundreds of rows can exceed the
  // request size limit.
  const { data: insertedBookings, error: bookingError } = await db
    .from("bookings")
    .insert(bookingsToInsert)
    .select("id, booking_date, booking_status");

  if (bookingError) throw new Error(`Could not insert booking history: ${bookingError.message}`);

  console.log(`\n  historical bookings    ${insertedBookings?.length ?? 0}`);

  // ---------------------------------------------------------------------------
  // Live bookings — the ones the demo actually walks through.
  //
  // Each occupies a distinct lab and slot so nothing overlaps.
  // ---------------------------------------------------------------------------

  const staffId = profileIdByEmail.get("staff@lab.edu");
  const studentId = profileIdByEmail.get("student@lab.edu");
  const facultyId = profileIdByEmail.get("faculty@lab.edu");
  const eeStudentId = profileIdByEmail.get("sara@lab.edu");

  const labByCode = new Map(labs.map((lab) => [lab.code, lab]));

  type LiveBooking = {
    labCode: string;
    userId: string | undefined;
    dayOffset: number;
    start: string;
    end: string;
    purpose: string;
    approval: Database["public"]["Tables"]["bookings"]["Row"]["approval_status"];
    status: BookingStatus;
    attendees: number;
  };

  const liveBookings: LiveBooking[] = [
    {
      labCode: "CS-LAB-SE",
      userId: studentId,
      dayOffset: 1,
      start: "14:00",
      end: "16:00",
      purpose: "Final year project session",
      approval: "pending",
      status: "pending_approval",
      attendees: 18,
    },
    {
      labCode: "CS-LAB-AI",
      userId: facultyId,
      dayOffset: 2,
      start: "10:00",
      end: "13:00",
      purpose: "Thesis research and model training",
      approval: "pending",
      status: "pending_approval",
      attendees: 6,
    },
    {
      labCode: "EE-LAB-EMB",
      userId: eeStudentId,
      dayOffset: 1,
      start: "09:00",
      end: "11:00",
      purpose: "Embedded systems midterm exam practice",
      approval: "pending",
      status: "pending_approval",
      attendees: 22,
    },
    {
      labCode: "CS-LAB-NET",
      userId: studentId,
      dayOffset: 0,
      start: "15:00",
      end: "17:00",
      purpose: "Networking assignment lab work",
      approval: "approved",
      status: "in_use",
      attendees: 12,
    },
    {
      labCode: "ME-LAB-CAD",
      userId: facultyId,
      dayOffset: 3,
      start: "12:00",
      end: "14:00",
      purpose: "CAD project review session",
      approval: "approved",
      status: "reserved",
      attendees: 10,
    },
  ];

  const liveRows: Array<Database["public"]["Tables"]["bookings"]["Insert"]> = [];

  for (const live of liveBookings) {
    const lab = labByCode.get(live.labCode);
    if (!lab || !live.userId) continue;

    liveRows.push({
      user_id: live.userId,
      resource_type: "lab",
      lab_id: lab.id,
      booking_date: isoDate(live.dayOffset),
      start_time: live.start,
      end_time: live.end,
      purpose: live.purpose,
      expected_attendees: live.attendees,
      approval_status: live.approval,
      booking_status: live.status,
      priority_score: live.status === "pending_approval" ? 72 : 40,
      priority_reason: live.status === "pending_approval" ? "Purpose mentions exam, research" : null,
      approved_by: live.approval === "approved" ? staffId : null,
      approved_at: live.approval === "approved" ? new Date().toISOString() : null,
    });
  }

  const { data: insertedLive, error: liveError } = await db.from("bookings").insert(liveRows).select("id, purpose");

  if (liveError) throw new Error(`Could not insert live bookings: ${liveError.message}`);

  console.log(`  live bookings          ${insertedLive?.length ?? 0}`);

  // ---------------------------------------------------------------------------
  // Equipment issued against the in-use booking, so the issues desk and QR
  // screen have something to show.
  // ---------------------------------------------------------------------------

  const inUseBooking = insertedLive?.find((booking) => booking.purpose.includes("Networking"));

  if (inUseBooking) {
    const routers = equipment.find((item) => item.name.startsWith("Cisco"));
    const tplink = equipment.find((item) => item.name.startsWith("TP-Link"));

    const lines = [
      routers ? { equipment_id: routers.id, quantity: 2 } : null,
      tplink ? { equipment_id: tplink.id, quantity: 3 } : null,
    ].filter((line): line is { equipment_id: string; quantity: number } => line !== null);

    if (lines.length > 0) {
      const { error: lineError } = await db
        .from("booking_equipment")
        .insert(lines.map((line) => ({ ...line, booking_id: inUseBooking.id })));

      if (lineError) throw new Error(`Could not insert booking equipment: ${lineError.message}`);

      const issuedAt = new Date();
      const dueAt = new Date(issuedAt.getTime() + 4 * 60 * 60 * 1000);

      const { error: issueError } = await db.from("issues").insert(
        lines.map((line, index) => ({
          booking_id: inUseBooking.id,
          equipment_id: line.equipment_id,
          quantity: line.quantity,
          issued_at: issuedAt.toISOString(),
          due_at: dueAt.toISOString(),
          issued_by: staffId ?? null,
          checkout_code: makeCheckoutCode(index + 1),
        })),
      );

      if (issueError) throw new Error(`Could not insert issues: ${issueError.message}`);

      console.log(`  issued lines           ${lines.length}`);
    }
  }

  // ---------------------------------------------------------------------------
  // One deliberately overdue loan
  //
  // The overdue list, the issues desk and the analytics KPIs need a row that
  // is already past its due date on first load.
  // ---------------------------------------------------------------------------

  const overdueLab = labByCode.get("CS-LAB-SE");
  const arduinoKit = equipment.find((item) => item.name.startsWith("Arduino Uno"));

  if (overdueLab && arduinoKit && studentId) {
    const approvedAt = new Date();
    approvedAt.setDate(approvedAt.getDate() - 3);

    const { data: overdueBooking, error: overdueError } = await db
      .from("bookings")
      .insert({
        user_id: studentId,
        resource_type: "lab",
        lab_id: overdueLab.id,
        booking_date: isoDate(-2),
        start_time: "14:00",
        end_time: "16:00",
        purpose: "Microcontroller kit loan — return pending",
        expected_attendees: 2,
        approval_status: "approved",
        booking_status: "overdue",
        priority_score: 30,
        approved_by: staffId ?? null,
        approved_at: approvedAt.toISOString(),
      })
      .select("id")
      .single();

    if (overdueError) throw new Error(`Could not insert the overdue booking: ${overdueError.message}`);

    if (overdueBooking) {
      const { error: overdueLineError } = await db
        .from("booking_equipment")
        .insert({ booking_id: overdueBooking.id, equipment_id: arduinoKit.id, quantity: 3 });
      if (overdueLineError) throw new Error(`Could not insert the overdue line: ${overdueLineError.message}`);

      const issuedAt = new Date();
      issuedAt.setDate(issuedAt.getDate() - 3);
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() - 2);

      const { error: overdueIssueError } = await db.from("issues").insert({
        booking_id: overdueBooking.id,
        equipment_id: arduinoKit.id,
        quantity: 3,
        issued_at: issuedAt.toISOString(),
        due_at: dueAt.toISOString(),
        issued_by: staffId ?? null,
        checkout_code: makeCheckoutCode(77),
      });
      if (overdueIssueError) throw new Error(`Could not insert the overdue issue: ${overdueIssueError.message}`);

      console.log("  overdue loan           1");
    }
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  console.log("\nDemo accounts — all use the same password\n");
  console.log(`  ${"Role".padEnd(22)} ${"Email".padEnd(28)} Password`);
  console.log(`  ${"-".repeat(22)} ${"-".repeat(28)} ${"-".repeat(14)}`);

  for (const demo of DEMO_USERS.filter((user) => user.role !== "student" || user.email === "student@lab.edu")) {
    console.log(`  ${demo.label.padEnd(22)} ${demo.email.padEnd(28)} ${DEMO_PASSWORD}`);
  }

  console.log("\nSeeding complete.\n");
}

main().catch((error: unknown) => {
  console.error(`\nSeeding failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
