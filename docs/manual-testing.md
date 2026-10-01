# Manual Testing + Video Demo Script

Two things in one guide:

1. A **test checklist** you can rehearse with, so nothing surprises you.
2. A **scene-by-scene script** to follow while recording the video for judges.

Written to be read one line at a time. Click, look, say. Nothing here needs heavy explanation.

---

## 1. Setup — do this before every session

1. Open a terminal in the project folder and run:

   ```bash
   npm run dev
   ```

   Wait until it says "Ready".

2. Reset the demo data so all the dates are fresh:

   ```bash
   npm run seed
   ```

   It prints the demo accounts when done.

   > **Important:** seeding deletes and recreates all bookings. Never run it while recording. Run it *between* takes.

3. Open `http://localhost:3000` in your browser.

4. Before recording: zoom to 100% (`Ctrl+0`), close extra tabs, hide the bookmarks bar (`Ctrl+Shift+B` in Chrome).

5. If anything looks odd, press `Ctrl+Shift+R` (hard refresh).

6. Optional, for the cleanest recording: run `npm run build` then `npm start` instead of `npm run dev`. The dev server can show developer overlays; the production start cannot.

### Demo accounts

All use the password **`hackathon123`**.

| Role | Email | How to sign in |
|---|---|---|
| Student | student@lab.edu | Click the **Student** button on the login page |
| Faculty | faculty@lab.edu | Click **Faculty** |
| Lab Staff | staff@lab.edu | Click **Lab Staff** |
| Coordinator | coordinator@lab.edu | Click **Coordinator** |
| Admin | admin@lab.edu | Click **Admin** |

Sara (EE student) and Usman (ME student) have no buttons — type `sara@lab.edu` or `usman@lab.edu` with the same password if you need them.

### What is already in the demo data

So you know what to expect on screen:

- **Tomorrow, 2:00–4:00 PM** — Software Engineering Lab is already requested (pending). This is your conflict demo.
- **Today, 3:00–5:00 PM** — Networking Lab is in use, with routers checked out. This is your return demo.
- **3 days from now, 12:00–2:00 PM** — CAD/CAM Lab is reserved. This is your waitlist demo.
- **One Arduino kit loan is 2 days overdue.** This is your overdue demo.
- **About 270 past bookings** — these fill the analytics pages.

---

## 2. Quick rehearsal (5 minutes, do this once before recording)

| # | Do this | You should see |
|---|---|---|
| 1 | Log in with each of the 5 demo buttons (sign out between each) | Each lands on the dashboard. Sidebar changes: students see no Approvals; staff see Desk; coordinator sees Analytics + Administration |
| 2 | As Student: Labs → click Software Engineering Lab | A day-by-day availability bar; the next day shows a block at 2–4 PM |
| 3 | Click **Book this lab**, set tomorrow 14:00–16:00 | An amber panel: "Already booked for part of that window", free times, other labs with match % |
| 4 | Click a free time chip | The panel turns green: "Available for the whole window" |
| 5 | As Lab Staff: Approvals | The pending requests with priority badges; Approve works |
| 6 | As Lab Staff: Issues & returns | "Outstanding" items and "Ready to issue" list |
| 7 | Scan → click any item under "Open checkouts" | A QR code with the checkout code appears |
| 8 | As Coordinator: Analytics | KPI numbers, heatmap, charts — all populated |

If all 8 pass, you are ready to record.

---

## 3. Recording script (scene by scene)

About 8 minutes total. If you are short on time (~5 minutes), skip the scenes marked **(skip if short)**.

Each scene has three parts:

- **DO** — the exact clicks.
- **SAY** — one or two lines you can improvise around.
- **CHECK** — what proves it worked.

---

### Scene 1 — Landing page + login (45 sec)

**DO**
1. Open `http://localhost:3000`. Let the landing page sit for a moment.
2. Scroll once down and back up.
3. Click **Sign in to demo**.
4. Point at the **Demo accounts** card. Click **Student**.

**SAY**
- "This is Lab Reserve — one place to book university labs and equipment, approve requests, hand items out, and see how everything is used."
- "Every role has a one-click demo account, so judges can try it in seconds."

**CHECK**
- You land on the dashboard. Top right shows the student's name and avatar.

---

### Scene 2 — Student: find a lab (1 min)

**DO**
1. Sidebar → **Labs**.
2. Type `AI` in the search box → **Filter**. One card remains. Clear it and show the department filter briefly.
3. Open **Software Engineering Lab** (clear the filter first, or use search "Software").
4. Point at the availability bar. Click **Next day** once.

**SAY**
- "Students browse every lab, filter by department, capacity and facilities."
- "The bar shows committed times only — including pending requests, so you cannot ask for a slot someone already asked for."
- "See the block at 2 to 4 PM tomorrow? That is where the next scene starts."

**CHECK**
- The bar shows an amber block at 2:00–4:00 PM on the next day.

---

### Scene 3 — Student: conflict + smart alternatives (2 min) ⭐ the big one

**DO**
1. On the lab page, click **Book this lab**.
2. In the wizard: set the date to tomorrow, start `14:00`, end `16:00`.
3. Wait a second — the panel on the right updates by itself.
4. Point at: the conflict list, the **Free times** chips, and **Other labs that fit** with match percentages.
5. Click one of the **Free times** chips.
6. Search `Arduino` in the equipment box → click **Add** → press `+` until the quantity is 5.
7. Expected attendees: `20`. Purpose: type `Embedded systems midterm exam practice`.
8. Click **Submit request**. On the confirmation card, click **View booking**.

**SAY**
- "I asked for tomorrow 2 to 4 PM. The system already knows that slot was requested."
- "Instead of a dead end, it offers other free times on this lab, and ranks other labs by how well they fit — capacity, facilities, department, how busy they are."
- "I'll take the suggested free time, add 5 Arduino kits, and submit."
- "The request goes to lab staff for approval."

**CHECK**
- Amber conflict panel → after clicking the free time, it turns green.
- Confirmation card appears: "Request submitted". Then the booking page shows **Pending approval**.

---

### Scene 4 — Student: my bookings + rules (1 min) **(skip if short)**

**DO**
1. Sidebar → **My bookings**. Point at the filters (All / Upcoming / Awaiting review / Completed / Cancelled) and click one or two.
2. Open one old **Completed** booking to show the status timeline. Go back.
3. Sidebar → **New booking**. Same lab, but set start `09:00`, end `15:00` (6 hours). Click **Submit request**.

**SAY**
- "Every request is tracked with its full history."
- "Departments set their own rules — maximum duration, maximum equipment, how far ahead you can book."
- "Six hours is over this department's 4-hour limit, so the system refuses it."

**CHECK**
- A red message: "Bookings in this department are limited to 4 hr."

---

### Scene 5 — Staff: approval queue (1.5 min)

**DO**
1. Avatar (top right) → **Sign out**.
2. Click **Lab Staff**.
3. Sidebar → **Approvals**.
4. Point at the priority badges and the reasons under each request.
5. Click **Approve** on the exam request (the one you just made).
6. On another request, click **Reject** → type `Lab needed for scheduled coursework` → **Confirm rejection**.

**SAY**
- "Staff see every request, highest priority first. Faculty requests and exam-related requests rise to the top automatically."
- "Approve is one click. Reject asks for a reason, and the student is notified either way."

**CHECK**
- "Request approved." and "Request rejected." messages. The approved booking disappears from the queue.

---

### Scene 6 — Staff: issue equipment + QR code (1.5 min)

**DO**
1. Sidebar → **Issues & returns**.
2. Scroll to **Ready to issue**. Find the booking you just approved → click **Issue / check out**.
3. Sidebar → **Scan**. Under **Open checkouts**, click the item you just issued.

**SAY**
- "Approved bookings wait here until staff hand out the equipment."
- "Every checkout gets a short code and a QR label. If there's no camera, you can just type the code — lookup works both ways."

**CHECK**
- A QR code, the checkout code, and the due time appear.

---

### Scene 7 — Staff: returns, damage photo, overdue (2 min)

**DO**
1. Back to **Issues & returns**. In **Outstanding**, find the Networking Lab items (checked out earlier today).
2. On the first one: set Return condition to **Damaged**, click **Add damage photo**, pick any image, click **Record return**.
3. On the second one: leave **Good**, click **Record return**.
4. Find the Arduino loan with the **Overdue** badge → return it as **Fair**.

**SAY**
- "Returns record the condition, an optional photo, and any remarks."
- "When everything is back, the booking closes by itself — completed, late, or damaged."
- "This Arduino loan went overdue on its own, and now it's recorded as returned late."

**CHECK**
- The overdue item becomes "Returned late". Open the booking and show the closed status + timeline.

---

### Scene 8 — Waitlist + notification (1.5 min) **(skip if short)**

**DO**
1. Sign out → **Student**. Sidebar → **Waitlist**.
2. Join: Lab = **CAD/CAM Lab**, date = pick the day **3 days from now**, start `12:00`, end `14:00`. Click **Join the waitlist**.
3. Sign out → **Lab Staff** → **Issues & returns** → in **Ready to issue**, find the CAD/CAM booking → click **View**.
4. On the booking page, click **Cancel booking** → reason `Reserved room needed elsewhere` → **Confirm cancellation**.
5. Sign out → **Student**. Click the **bell** (top right).

**SAY**
- "The lab is reserved at that time, so the student holds a place in line."
- "When a reservation is cancelled, the first person in line is promoted and notified — automatically."

**CHECK**
- The bell shows "A slot opened up". The Waitlist page shows the entry under History as **Promoted**.

---

### Scene 9 — Coordinator: analytics (1.5 min)

**DO**
1. Sign out → **Coordinator** → sidebar → **Analytics**.
2. Slowly scroll through: KPI cards, the weekday × hour heatmap, peak booking hours chart, most booked labs, most used equipment, underused labs, usage by department.

**SAY**
- "Everything here comes from the real booking records — no mock numbers."
- "When are labs busiest, which get used most, which are underused, how much equipment goes out, what gets damaged."
- "This is the data a university needs to decide where to put resources."

**CHECK**
- Charts and lists are populated (they use the ~270 seeded past bookings).

---

### Scene 10 — Admin: rules and people (45 sec) **(skip if short)**

**DO**
1. Sign out → **Admin** → sidebar → **Administration**.
2. Point at the rules cards (duration, equipment limits, advance days per department).
3. Scroll to Labs → show the status dropdown and **Add a lab** form.
4. Scroll to Users → show role change and activate/deactivate.

**SAY**
- "Admins manage people and resources; coordinators manage the rules."
- "Changing a lab to maintenance stops new bookings on it immediately."

**CHECK**
- The page shows rules, labs, equipment, categories and users.

---

### Scene 11 — Roles + dark mode + close (45 sec)

**DO**
1. While signed in as Student, type `http://localhost:3000/approvals` in the address bar. You are bounced back to the dashboard.
2. Open the **avatar menu** → click **Dark**. Show the dashboard in dark for a second. Switch back or stay in dark.
3. Finish on the dashboard.

**SAY**
- "Pages like approvals and analytics are blocked for students on the server, not just hidden in the menu."
- "Light and dark mode are built in."
- "Lab Reserve: book, approve, issue, return and measure — with double bookings made impossible at the database level."

---

## 4. Full manual test checklist

Rehearse these once. Tick them off. (Optional — the recording script already covers the main path.)

| # | Test | Expected result |
|---|---|---|
| 1 | Log in with all 5 demo buttons | Each role lands on the dashboard with its own sidebar |
| 2 | Student tries to open `/approvals` and `/analytics` directly | Bounced back to the dashboard |
| 3 | Sign out, then open `/dashboard` | Redirected to the login page |
| 4 | Labs: filter by department, capacity and facility | The card list shrinks accordingly |
| 5 | Lab page: previous/next day buttons | The availability bar changes per day |
| 6 | Request a slot that is already requested | Refused with a conflict panel + free times + ranked labs |
| 7 | Click a free time suggestion | Panel turns green, submit works |
| 8 | Request longer than the department maximum (e.g. 6 hours) | Refused with the hour limit message |
| 9 | Request a date more than 30 days ahead | Refused with the advance-booking message |
| 10 | Add more than 10 equipment units (with a CS lab) | Refused with the units limit message |
| 11 | Set attendees above the lab's capacity | Refused with the seat count |
| 12 | Log in as `sara@lab.edu` and try to book a CS lab | Refused: "only resources belonging to your own department" |
| 13 | Submit a valid request | Confirmation card, then booking shows Pending approval |
| 14 | Cancel your own pending request | Status becomes Cancelled in the list and detail |
| 15 | Staff: approve a request | Approval badge changes, student gets a notification |
| 16 | Staff: reject with a reason | Status Rejected, reason shown on the booking |
| 17 | Staff: issue an approved booking | Booking becomes In use, checkout code + QR exist |
| 18 | Return an item with condition "Damaged" and a photo | Damage count on the equipment goes up; booking closes as Damaged |
| 19 | Overdue Arduino loan → return it | Shows "Returned late", overdue list empties |
| 20 | Waitlist: join, then cancel the blocking booking | Promoted + notification to the waitlisted student |
| 21 | Notifications bell: mark all read | Badge disappears |
| 22 | Avatar menu: theme Light / Dark / System | Whole app switches theme |
| 23 | Analytics as coordinator | All numbers and charts populated |
| 24 | Admin: set a lab to Maintenance, then open the booking wizard as a student | The lab disappears from the picker (a booking attempt would be refused server-side anyway) |

---

## 5. Reset between takes + troubleshooting

**Reset between takes**

1. Run `npm run seed` (brings fresh dates and clears test bookings).
2. Press `Ctrl+Shift+R` in the browser.
3. Sign out (avatar menu) or just open `http://localhost:3000/login`.

**Common problems**

| Problem | Fix |
|---|---|
| Login buttons say the demo accounts are not seeded | Run `npm run seed` |
| Bookings show the wrong day as "Today" | Run `npm run seed`, then hard refresh |
| A red error overlay appears | Screenshot it and send it to your developer (paste the message) |
| The page will not load at all | Check the terminal: is `npm run dev` still running? |
| Changes look stale | `Ctrl+Shift+R`, or restart the dev server |

---

**Tip for the video:** record one take per scene, not one long take. Scenes 3, 5 and 7 are the strongest — if time is tight, make sure those three are perfect.
