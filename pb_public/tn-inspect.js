// TrenchNote inspections — the derived compliance badge (ADR 0014).
//
// This file is the SECOND exception to "every page is self-contained"
// (tn-auth.js is the first), for the same class of reason: asset.html and
// index.html must give the same verdict about whether a thing is safe to
// use, and two drifting copies of DO-NOT-USE logic is how a dashboard
// says green while the scan page says red. One implementation, two pages.
//
// Everything here is DERIVED, nothing is stored (ADR 0002 applied to
// compliance): the inputs are the asset's inspection_requirements rows
// and its inspections ledger, the output is a verdict computed fresh on
// every render. There is no status column anywhere that could disagree
// with the records.
//
// The rules (ADR 0014):
//
//   RED / DO NOT USE   — on any requirement, the latest inspection is a
//                        fail or removed_from_service (no pass since); OR
//                        any requirement is past its next-due date; OR a
//                        requirement has NO passing inspection on record
//                        (owed and unproven = not known safe); OR the
//                        latest AD-HOC inspection (no requirement) is a
//                        fail/removed with no later ad-hoc pass.
//   YELLOW / DUE SOON  — any requirement due within DUE_SOON_DAYS.
//   GREEN              — requirements exist and all are current.
//   none               — no requirements and nothing blocking (most
//                        assets; the badge simply doesn't render).
//
// next_due per requirement = latest PASSING inspection's inspected_at
// + interval_days. Dates are date-only at UTC midnight (the reservations
// convention) — all math below is done in UTC on purpose; see the
// developer guide's date-handling warning.

const TNInspect = {

  // Due-soon window, in days. A CONSTANT, not a setting (ADR 0014):
  // "14" is one code change; a settings screen is a support burden and
  // an invitation to per-site drift in what YELLOW means.
  DUE_SOON_DAYS: 14,

  // "YYYY-MM-DD" of a PocketBase date string ("2026-07-10 00:00:00.000Z")
  day(pbDate) { return String(pbDate).slice(0, 10); },

  // day-string + n days -> day-string, computed in UTC
  addDays(dayStr, n) {
    const [y, m, d] = dayStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  },

  // Whole days from today until a day-string (negative = past), in UTC
  daysUntil(dayStr, todayStr) {
    const p = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((p(dayStr) - p(todayStr)) / 86400000);
  },

  // The verdict for ONE asset.
  //   requirements — this asset's inspection_requirements records
  //   inspections  — this asset's inspections records, ANY order (sorted here)
  //   todayStr     — optional "YYYY-MM-DD" (tests); defaults to today UTC
  // Returns {
  //   badge: 'red' | 'yellow' | 'green' | 'none',
  //   rows:  per requirement: { req, last, lastPass, nextDue, dueIn,
  //          state: 'failed'|'never'|'overdue'|'due_soon'|'ok', label },
  //   adhocBlock: the blocking ad-hoc inspection record, or null,
  //   reasons: human strings for the red banner
  // }
  assess(requirements, inspections, todayStr) {
    const today = todayStr || new Date().toISOString().slice(0, 10);

    // Newest first by the date eyes were on the thing; `created` breaks
    // ties so two same-day records (a fail, then the re-check) order by
    // when they entered the system.
    const sorted = (inspections || []).slice().sort((a, b) =>
      this.day(b.inspected_at).localeCompare(this.day(a.inspected_at)) ||
      String(b.created).localeCompare(String(a.created)));

    const rows = [];
    const reasons = [];

    for (const req of requirements || []) {
      const lane = sorted.filter((i) => i.requirement === req.id);
      const last = lane[0] || null;
      const lastPass = lane.find((i) => i.result === 'pass') || null;

      let state, nextDue = null, dueIn = null, label;
      if (last && last.result !== 'pass') {
        // Latest word on this requirement is fail/removed — no math
        // needed, the thing is out of service until a new pass is logged.
        state = 'failed';
        const verb = last.result === 'removed_from_service' ? 'removed from service' : 'failed';
        label = verb.toUpperCase() + ' ' + this.fmtDay(last.inspected_at);
        reasons.push(req.name + ': ' + verb + ' ' + this.fmtDay(last.inspected_at));
      } else if (!lastPass) {
        // Owed, and no passing record exists: not provably safe. Harsh on
        // day one (adding a requirement flips the badge red until the
        // first inspection is logged) — and correct: log the inspection
        // you presumably just did, and it goes green.
        state = 'never';
        label = 'never inspected';
        reasons.push(req.name + ': no inspection on record');
      } else {
        nextDue = this.addDays(this.day(lastPass.inspected_at), req.interval_days);
        dueIn = this.daysUntil(nextDue, today);
        if (dueIn < 0) {
          state = 'overdue';
          label = 'OVERDUE ' + (-dueIn) + (dueIn === -1 ? ' day' : ' days');
          reasons.push(req.name + ': overdue ' + (-dueIn) + (dueIn === -1 ? ' day' : ' days'));
        } else if (dueIn <= this.DUE_SOON_DAYS) {
          state = 'due_soon';
          label = dueIn === 0 ? 'due today' : 'due in ' + dueIn + (dueIn === 1 ? ' day' : ' days');
        } else {
          state = 'ok';
          label = 'next due ' + this.fmtDay(nextDue);
        }
      }
      rows.push({ req, last, lastPass, nextDue, dueIn, state, label });
    }

    // The ad-hoc lane: inspections with no requirement. Someone pulling a
    // thing from service outside any schedule blocks use exactly like a
    // failed scheduled inspection; a later ad-hoc pass clears it.
    const adhoc = sorted.filter((i) => !i.requirement);
    const adhocBlock = adhoc.length && adhoc[0].result !== 'pass' ? adhoc[0] : null;
    if (adhocBlock) {
      reasons.push((adhocBlock.result === 'removed_from_service'
        ? 'removed from service ' : 'failed inspection ') +
        this.fmtDay(adhocBlock.inspected_at) +
        (adhocBlock.note ? ' — ' + adhocBlock.note : ''));
    }

    const red = adhocBlock || rows.some((r) =>
      r.state === 'failed' || r.state === 'never' || r.state === 'overdue');
    const yellow = rows.some((r) => r.state === 'due_soon');

    return {
      badge: red ? 'red' : yellow ? 'yellow' : rows.length ? 'green' : 'none',
      rows, adhocBlock, reasons,
    };
  },

  // "Jul 10" — always UTC, or western timezones show the previous day.
  fmtDay(pbDateOrDay) {
    const [y, m, d] = this.day(pbDateOrDay).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined,
      { month: 'short', day: 'numeric', timeZone: 'UTC' });
  },
};

// Same reason as tn-sync.js: top-level `const` doesn't create a window
// property, and pages reach us as window.TNInspect.
window.TNInspect = TNInspect;
