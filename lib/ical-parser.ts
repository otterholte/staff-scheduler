// Simple iCal parser for importing availability from calendar apps

export interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  description?: string;
}

export function parseICalFile(content: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const lines = content.split(/\r?\n/);

  let currentEvent: Partial<ICalEvent> | null = null;
  let currentKey = '';
  let currentValue = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle line continuations (lines starting with space or tab)
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentValue += line.slice(1);
      continue;
    }

    // Process previous key-value pair
    if (currentKey && currentEvent) {
      processKeyValue(currentEvent, currentKey, currentValue);
    }

    // Parse new line
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    currentKey = line.slice(0, colonIndex).split(';')[0]; // Remove parameters
    currentValue = line.slice(colonIndex + 1);

    if (currentKey === 'BEGIN' && currentValue === 'VEVENT') {
      currentEvent = {};
    } else if (currentKey === 'END' && currentValue === 'VEVENT') {
      if (currentEvent && currentEvent.uid && currentEvent.dtstart && currentEvent.dtend) {
        events.push(currentEvent as ICalEvent);
      }
      currentEvent = null;
    }
  }

  return events;
}

function processKeyValue(event: Partial<ICalEvent>, key: string, value: string): void {
  switch (key) {
    case 'UID':
      event.uid = value;
      break;
    case 'SUMMARY':
      event.summary = unescapeText(value);
      break;
    case 'DESCRIPTION':
      event.description = unescapeText(value);
      break;
    case 'DTSTART':
      event.dtstart = parseICalDate(value);
      break;
    case 'DTEND':
      event.dtend = parseICalDate(value);
      break;
  }
}

function parseICalDate(value: string): Date {
  // Handle different date formats
  // Basic: 20231215T090000Z
  // With timezone: TZID=America/New_York:20231215T090000

  // Extract just the date part if there's a timezone prefix
  const dateStr = value.includes(':') ? value.split(':')[1] : value;

  // Remove the 'Z' suffix if present
  const cleanDate = dateStr.replace('Z', '');

  // Parse the date components
  const year = parseInt(cleanDate.slice(0, 4), 10);
  const month = parseInt(cleanDate.slice(4, 6), 10) - 1; // JS months are 0-indexed
  const day = parseInt(cleanDate.slice(6, 8), 10);

  // Check if time is included
  if (cleanDate.length >= 15 && cleanDate[8] === 'T') {
    const hour = parseInt(cleanDate.slice(9, 11), 10);
    const minute = parseInt(cleanDate.slice(11, 13), 10);
    const second = parseInt(cleanDate.slice(13, 15), 10);

    // If original had 'Z', it's UTC
    if (value.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    return new Date(year, month, day, hour, minute, second);
  }

  // Date only (all-day event)
  return new Date(year, month, day);
}

function unescapeText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

// Convert iCal events to blocked times (times when staff is NOT available)
export interface BlockedTimeSlot {
  date: Date;
  startHour: number;
  endHour: number;
  reason?: string;
}

export function eventsToBlockedTimes(events: ICalEvent[]): BlockedTimeSlot[] {
  const blocked: BlockedTimeSlot[] = [];

  for (const event of events) {
    const startDate = new Date(event.dtstart);
    const endDate = new Date(event.dtend);

    // Skip if end is before start (invalid)
    if (endDate <= startDate) continue;

    // Handle multi-day events
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);

    while (currentDate < endDate) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const effectiveStart = startDate > dayStart ? startDate : dayStart;
      const effectiveEnd = endDate < dayEnd ? endDate : dayEnd;

      const startHour = effectiveStart.getHours() + effectiveStart.getMinutes() / 60;
      const endHour = effectiveEnd.getHours() + effectiveEnd.getMinutes() / 60;

      // Only add if there's actual time blocked
      if (endHour > startHour || effectiveEnd.getDate() !== effectiveStart.getDate()) {
        blocked.push({
          date: new Date(currentDate),
          startHour: Math.floor(startHour),
          endHour: Math.ceil(endHour) || 24, // If ends at midnight, use 24
          reason: event.summary,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return blocked;
}

