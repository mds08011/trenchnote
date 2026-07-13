# TrenchNote — Field Guide

How to use TrenchNote on the job. No app to download — your phone camera
and one sign-in are all it takes.

## First time on this phone: sign in

The first time you open TrenchNote on a phone, it asks you to sign in.
Use the crew login your PM gave you (or your own, if you have one). That's
a **one-time thing per phone** — as long as the phone gets used now and
then, it stays signed in.

If TrenchNote ever shows you the sign-in screen again, just sign back in
with the same login — it'll drop you right back at whatever you scanned.

## Moving a piece of equipment

Every tracked machine and tool has a QR sticker with a short code printed
under it (like `A001`).

1. **Point your phone camera at the QR code** and tap the link that pops up.
2. The page shows what the thing is and where it's supposed to be.
3. Taking it somewhere? Pick the destination from the dropdown, put your
   name in the name box, and hit the big orange **MOVE HERE** button.
4. Green checkmark = done. That's the whole job.

Type your name once — the phone remembers it after that.

Heads up: on sites where the PM has turned it on, logging a move **off** a
site automatically emails that site's PM. That's the point — no more gear
vanishing unannounced. Log honestly and nobody has to make angry calls.

**Sticker too muddy or scratched to scan?** Use the code printed under it:
open TrenchNote in your browser, find that code on the dashboard list, and
tap it. Same page.

**Already in the app?** Tap **📷 Scan** at the top instead of switching to
your camera — point it at the next tag and it opens straight away. (First
time, your browser asks to use the camera — allow it.)

## Hour meters and odometers

Some equipment pages — generators, lifts, trucks — show an extra box in
the move form: **"Hour meter reading?"** (or "Odometer reading?").

- **You can always skip it.** Leave it blank and the move works exactly
  like it always has. Nobody's move gets held up by a gauge.
- **Got ten seconds?** Glance at the gauge, punch in the number (the
  keypad comes up), and tap 📷 if you want to snap the gauge itself —
  that photo is gold at billing time. Then hit MOVE HERE like normal.
- **Month-end walkdown, nothing's moving?** Open the equipment page and
  tap **"Record a reading (no move)"**. Number, optional photo, save.

If the number you enter is *smaller* than the last one on record, the app
still saves it — it just flags it in the list. Fat-fingered it? Enter the
right number as a new reading; the flag on the old one tells the office
which entry to ignore. (Same rule as moves: never fix an old entry, add
a correct one.)

Under the big location box you may also see **"Charging to job …"** —
that's the job number this site's equipment time is billed to. If gear is
sitting on a job it shouldn't be billed to, that line is the tell.

## Inspections (harnesses, extinguishers, slings, monitors…)

Some gear is only legal to use until a date — and that date used to live
on a paper tag. Now it's on the same page you scan.

**Reading the badge.** When gear has inspections set up, its page shows a
colored box:

- **Red "DO NOT USE"** — it failed its last inspection, was pulled from
  service, or an inspection is overdue. Don't use it, don't get creative.
  Tell your PM, or if you're the competent person, inspect it and log the
  result.
- **Yellow "due soon"** — still fine to use, but an inspection comes due
  within two weeks. Good time to get it done.
- **Green** — all inspections current. Go to work.
- **No box at all** — this gear doesn't have inspections set up. Most
  equipment doesn't; that's normal.

Tap the box to see the list — what gets inspected, how often, when it was
last done, and the full history.

**Logging an inspection.** On the gear's page, tap the badge (or
**🛡 Inspections & certs**), pick which inspection you did (or "ad-hoc"
for a one-off check), tap pass / fail / removed from service, put your
name on it, and **take a photo** — especially on a fail. The photo of the
cut webbing or the dead gauge is what ends arguments later. The app will
nag you once if you skip the photo on a fail, but it won't stop you —
pulling bad gear from service matters more than the picture.

Works with zero bars, same as moves — it saves on the phone and sends
itself when signal returns.

**The red badge shows up before the move button on purpose.** Whether
you're allowed to use a thing beats where it sits. You can still move
red-tagged gear (hauling a bad harness back to the shop is the right
move) — you just can't miss that it's bad.

**Same ledger rules as everything else:** never fix an old inspection —
log a new one. Fat-fingered a fail? Log the correct result as a new
entry; the history keeps both and the story stays honest.

**For PMs / safety folks:** set up what a piece of gear owes under
**⚙ Manage requirements** on its page — a name ("Monthly visual"), how
many days between inspections, and where the rule comes from. Starter
templates are in `docs/inspection-seeds.md`, but set the intervals from
*your* safety program — the app shows status, it isn't the program. The
dashboard's **Inspections** panel lists everything red and yellow,
worst first — that's your Monday-morning walk list. There's a CSV export
of the whole inspection history at the bottom of the panel for audits.

## Walking the yard (inventory check)

Doing a walk-through to see what's actually on site? Open **📷 Scan** and
set **"I'm at:"** to where you're standing. Now the camera stays on, and
every tag you point at lands on a list:

- **Green ✓** — it's where the log says it should be. Keep walking.
- **Orange "ledger says…"** — the log thinks it's somewhere else. You're
  looking at it, so you win: tap **Move here** and the record is fixed on
  the spot.
- **Red "not in the system"** — that sticker isn't in TrenchNote. Tell
  your PM.

Scan the same tag twice and it just blinks — no double entries. Twenty
tags in five minutes is normal.

## Reading the equipment page

- The **big box** is where the thing currently is, and how long it's been
  there.
- **RENTED** in the corner means it's rental gear — the vendor's name is
  right there. Don't send a rental to another site without telling whoever
  manages the PO.
- A brown **SPOKEN FOR** box means someone has dibs on this for an upcoming
  date. You can still move it — but you're taking it from that person, so
  call them first. Their name is in the box.
- Tap **🕑 Move history** to see everywhere this thing has been — each hop,
  who moved it, and when. Handy for "wasn't this at Northside last week?"

An amber **In transit on Manifest #…** box means a sender put the item on a
truck and the receiving site has not confirmed it yet. The big location box
still shows the last confirmed ledger location on purpose.

## Calling dibs (reservations)

Need the machine for your pour next Thursday? On the equipment page, tap
**"Need this later? Reserve it"**, put in your name, the date you need it
by (and when you'll give it back, if you know), and what it's for. Now
everyone who scans that machine sees your claim.

Reserving doesn't lock anything — it just makes sure nobody takes it without
knowing about you. If two people have dibs on the same machine, both claims
show, earliest first — that's your cue to make a phone call, not the app's
cue to pick a winner.

**Closing out a claim:**

- Just moved the machine to whoever reserved it? The page asks "did this
  move hand it over?" — tap yes and the claim is done.
- Don't need it anymore? Tap **Cancel this claim** on the claim itself.
- A claim in red saying **"release date passed"** means someone kept it
  past when they said they'd let it go, and nobody's closed the claim.
  It stays red until someone does — if it's yours, deal with it.

## Materials (pipe supports, fittings, anchor bolts…)

Stuff that comes by the hundred doesn't get individual stickers. Instead:

1. Open TrenchNote and look at the **MATERIALS** list on the dashboard.
2. Tap the material. You'll see how many are at each yard, warehouse, and
   site — straight from the log, counted every time you open the page.
3. **Truck arrived from the supplier?** Leave the first dropdown on "New
   delivery", pick where it was unloaded, type how many, hit **LOG MOVE**.
   See "Taking a delivery" below — there's ten seconds more that will save
   somebody a five-figure argument next year.
4. **Hauling 40 supports from the yard to your site?** Pick the yard as
   "From", your site as "To", type 40, log it.
5. **Installed it or used it up?** Pick where it came from, choose
   **"Used / consumed"** as the destination, type how many. It comes off
   the count but stays in the log forever. Put where it went in the note
   ("clarifier weir, bay 2") — future you will thank you.

The page shows how many the log says are at the "From" spot. If that number
looks wrong compared to what's actually on the ground, tell your PM — the
fix is logging a correcting move, and it takes ten seconds.

If you log more than the app thinks is there, it asks you to confirm once.
If the material really is in your hands, tap OK — you're right and the log
is missing a delivery. The count goes negative until someone logs it.

If a spot ever shows a **red negative number**, that's the app telling you
the log and the ground disagree — more left that spot on paper than ever
arrived. Usually it's a delivery nobody logged. Log it now and the number
goes right.

## Moving a truckload (transfer manifests)

Use a manifest when one truck carries several assets or bulk materials between
two TrenchNote locations and the receiving site needs to check the load.

**Sender:**

1. From the dashboard, tap **Transfer manifest**. Pick the source, destination,
   and type the driver's name.
2. Add equipment from the list, or tap **Scan asset tag** and scan it. Add bulk
   materials with the quantity actually loaded. A gang box is one line — add
   the box, not every tool inside it; its contents travel with the box.
3. Tap **Dispatch truck**. The manifest page is printer-friendly; tap
   **Print manifest** for the copy that rides in the cab. **Save draft** keeps
   it staged without calling it in transit yet.

**Receiver:**

1. Open the manifest from **Manifests in transit** on the dashboard (or from
   the sender's link/paper reference).
2. Work down every line. Leave the received number alone when it matches;
   change it when it does not. Type a plain note for anything short or damaged.
3. Tap **Confirm all received** once. The signed-in receiving account is put on
   the manifest, every movement is written together, and the status says
   **received with discrepancies** if any line was short.

Example: sent 40 supports, received 38. The source loses all 40, the receiving
site gains 38, and 2 show at **Missing in transfer** until somebody finds and
moves them. The app never calls a missing bundle “used/consumed.”

While the truck is moving, asset and material pages show **in transit on
Manifest #…**. Their normal location/stock still shows the last confirmed
ledger count until the receiver submits — both facts are labeled so nobody
mistakes a guess for a receipt.

## Taking a delivery

Material sits in the yard for a year or more before it gets installed.
When something turns up missing at startup, whoever has proof wins the
argument with the vendor — and the proof is made **at the truck**, not
later.

When you pick "New delivery", the form opens a few extra boxes:

- **Photograph the packing slip before the driver leaves — every time.**
  Tap the 📷 packing slip button and snap it right on the tailgate. That
  photo, with its date, is the whole ballgame in a dispute. The app will
  nag you in orange if you skip it — it'll still let you log the delivery,
  but do everybody a favor and take the picture.
- **Vendor and PO number** — who delivered, and the PO it came against.
  Straight off the slip. Type it once, done.
- **Anything over, short, or damaged?** Say it in the box, plainly:
  *"Received 480 of 500 per slip; 2 crates damaged."* Count what actually
  came off the truck, not what the slip promises.
- **Damage photos** — crate crushed? Snap it. Up to eight pictures ride
  along with the delivery.

All of it shows up in the **Delivery history** on the material's page,
and your PM can print the whole record — photos and all — from the
**receiving report** link at the bottom to send with the claim.

No signal at the yard? Log it anyway, photos and all — it saves on the
phone and sends itself when you're back in coverage, same as moves.

## The dashboard

Open TrenchNote's main page in any browser to see, at a glance:

- **Every asset, grouped by where it is** — tap any row to open its page.
- **Materials** — totals on hand.
- **Spoken for** — who has claimed what, and for when.
- **Recently moved** — the last moves, who logged them, and how long ago.
- **Manifests in transit** — open truck handoffs, oldest first.

## The three rules

1. **If it moves, log it.** Two taps at the truck beats an hour of phone
   calls next month.
2. **Never "fix" an old entry.** Wrong move? Log a new one putting it right.
   The history is what saves us in vendor disputes.
3. **Put your name on it.** Nobody's checking up on you — but "who moved
   this?" is the exact question this thing exists to answer.

## No signal? It still works

TrenchNote keeps working with zero bars:

- **Scanning still opens the page**, showing the last info this phone saw —
  with a banner telling you exactly how old it is. Old info is old; the
  banner keeps it honest.
- **Logging a move still works.** It's saved on the phone, and a black
  **"⏳ to sync"** tag appears in the corner. When you're back in coverage,
  it sends itself (or tap the tag to send it now). Don't clear the browser
  or sign out while that tag is showing — that data hasn't reached the
  office yet.
- **Meter readings, deliveries, inspections, and transfer manifests work
  offline too** —
  photos and all. They ride the same ⏳ queue as moves and send
  themselves when signal returns, keeping the date you actually did them.
- The receiving phone must have opened the manifest while it still had signal
  before it can receive that manifest offline. The receiving site cannot see a
  brand-new sender manifest until the sender's phone reaches the server.
- If the tag turns **red**, one of your saved moves couldn't be accepted —
  tap it, read why, and check with your PM before discarding anything.

## When something's wrong

- **Page won't load and you've never opened TrenchNote on this phone:**
  offline mode only knows what the phone has seen before. Open it once
  with signal and you're covered from then on.
- **"No asset found":** the code was typed wrong, or the sticker belongs to
  gear that isn't in the system yet. Tell your PM.
- **Wrong email or password:** logins are handed out by your PM — there's
  no sign-up button on purpose. Ask them for the crew login.
- **Wrong location showing:** somebody moved it without logging (see rule 1).
  Log a move to where it actually is — that both fixes the record and
  timestamps the correction.
