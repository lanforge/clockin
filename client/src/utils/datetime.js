// Lightweight timezone-aware date helpers used across the client.
// Storage convention: all instants are UTC; "due dates" are UTC midnight treated as a calendar day.

export function detectTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const FULL_OPTS = {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short'
};

export function formatInTz(date, tz, opts = {}) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      ...FULL_OPTS,
      ...opts
    }).format(new Date(date));
  } catch {
    return new Date(date).toString();
  }
}

export function tzAbbrev(tz, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      timeZoneName: 'short'
    }).formatToParts(date);
    return parts.find(p => p.type === 'timeZoneName')?.value || '';
  } catch {
    return '';
  }
}

// Returns { primary, secondary } where primary is the organizer's time string
// and secondary is the viewer's local time if different (else null).
export function describeMeetingTime(meeting, viewerTz) {
  const orgTz = meeting?.organizer_timezone || viewerTz;
  const start = meeting?.start_time;
  if (!start) return { primary: '', secondary: null };

  const primary = formatInTz(start, orgTz);
  if (!viewerTz || !orgTz || orgTz === viewerTz) {
    return { primary, secondary: null };
  }
  const orgAbbr = tzAbbrev(orgTz, start);
  const viewerAbbr = tzAbbrev(viewerTz, start);
  if (orgAbbr && orgAbbr === viewerAbbr) {
    return { primary, secondary: null };
  }
  return { primary, secondary: formatInTz(start, viewerTz) };
}

// "MMM D, YYYY" rendering for a calendar-day due_date (UTC midnight).
export function formatDueDate(due) {
  if (!due) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(due));
  } catch {
    return '';
  }
}

// Returns true if a due_date (UTC calendar day) has already passed in the viewer's TZ.
export function isDueDateOverdue(due, viewerTz) {
  if (!due) return false;
  try {
    const dueDay = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(due));
    const todayLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: viewerTz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    return dueDay < todayLocal;
  } catch {
    return false;
  }
}
