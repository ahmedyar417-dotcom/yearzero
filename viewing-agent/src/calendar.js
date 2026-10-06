import { calendar as calendarApi } from '@googleapis/calendar';
import { DateTime } from 'luxon';

const TAG = 'viewingAgent';

/** Optional Google Calendar integration: read busy times, write booked viewings. */
export class CalendarClient {
  constructor(auth, calendarId = 'primary') {
    this.api = calendarApi({ version: 'v3', auth });
    this.calendarId = calendarId;
  }

  /** Timed events you're busy for, excluding the agent's own viewing events. Returns [{start, end}] DateTimes. */
  async busyBlocks(from, to) {
    const blocks = [];
    let pageToken;
    do {
      const { data } = await this.api.events.list({
        calendarId: this.calendarId,
        timeMin: from.toISO(),
        timeMax: to.toISO(),
        singleEvents: true,
        maxResults: 250,
        pageToken,
      });
      for (const e of data.items ?? []) {
        if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
        if (!e.start?.dateTime || !e.end?.dateTime) continue; // all-day events don't block viewings
        if (e.extendedProperties?.private?.[TAG]) continue;
        const declined = (e.attendees ?? []).some((a) => a.self && a.responseStatus === 'declined');
        if (declined) continue;
        blocks.push({ start: DateTime.fromISO(e.start.dateTime), end: DateTime.fromISO(e.end.dateTime) });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return blocks;
  }

  /** Create the viewing event, or move it if `eventId` is given. Returns the event id. */
  async upsertViewing({ eventId, propertyId, start, minutes, address, listingUrl, contact, timezone }) {
    const requestBody = {
      summary: `Viewing: ${address}`,
      location: address,
      description: [listingUrl, contact && `Contact: ${contact}`, 'Booked by Viewing Agent'].filter(Boolean).join('\n'),
      start: { dateTime: start.toISO(), timeZone: timezone },
      end: { dateTime: start.plus({ minutes }).toISO(), timeZone: timezone },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
      extendedProperties: { private: { [TAG]: propertyId } },
    };
    if (eventId) {
      const { data } = await this.api.events.patch({ calendarId: this.calendarId, eventId, requestBody });
      return data.id;
    }
    const { data } = await this.api.events.insert({ calendarId: this.calendarId, requestBody });
    return data.id;
  }

  async deleteViewing(eventId) {
    await this.api.events.delete({ calendarId: this.calendarId, eventId });
  }
}
