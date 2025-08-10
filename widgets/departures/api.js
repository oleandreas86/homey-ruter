'use strict';

const ENTUR_URL   = 'https://api.entur.io/journey-planner/v3/graphql';
const CLIENT_NAME = 'com.haleyproductions.ruter';

const QUERY = `
  query Departures(
    $stopId: String!,
    $n: Int!,
    $timeRange: Int!,
    $whitelistLines: [ID!]
  ) {
    stopPlace(id: $stopId) {
      id
      name
      estimatedCalls(
        numberOfDepartures: $n,
        timeRange: $timeRange,
        whiteListed: { lines: $whitelistLines }
      ) {
        realtime
        aimedDepartureTime
        expectedDepartureTime
        cancellation
        destinationDisplay { frontText }
        quay { name publicCode }
        serviceJourney {
          line { id name publicCode transportMode }
          journeyPattern { directionType }
        }
      }
    }
  }
`;

function extractQuayCode(name) {
  if (!name) return '';
  const m = String(name).match(/(?:spor|track|platform|plattform|stop|stopp|bay)\s*([A-Za-z0-9]+)/i)
      || String(name).match(/\b([A-Za-z]?\d{1,3})\b/);
  return m ? m[1] : '';
}

async function fetchEnturDepartures({ stopId, n, timeRangeSec, lineIds }) {
  const res = await fetch(ENTUR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ET-Client-Name': CLIENT_NAME
    },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        stopId,
        n,
        timeRange: timeRangeSec,
        whitelistLines: (Array.isArray(lineIds) && lineIds.length) ? lineIds : null
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Entur HTTP ${res.status}: ${text.slice(0, 160)}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors.map(e => e.message).join('; '));
  }

  const calls = json.data?.stopPlace?.estimatedCalls ?? [];
  return calls.map(c => {
    const depIso = c.expectedDepartureTime || c.aimedDepartureTime;
    const line = c.serviceJourney?.line?.publicCode || c.serviceJourney?.line?.name || '?';
    const direction = (c.serviceJourney?.journeyPattern?.directionType || 'unknown').toLowerCase();
    const quayName = c.quay?.name || '';
    const quayCode = c.quay?.publicCode || extractQuayCode(quayName);
    const mode =
        (c.serviceJourney?.line?.transportMode ??
            c.serviceJourney?.journeyPattern?.line?.transportMode ??
            '').toLowerCase();
    
    return {
      line,
      destination: c.destinationDisplay?.frontText || '',
      time: depIso,
      canceled: Boolean(c.cancellation),
      platform: quayName,
      trackOrStop: quayCode,
      direction,
      realtime: Boolean(c.realtime),
      mode,
    };
  });
}

module.exports = {
  async getDepartures({ homey, query }) {
    const {
      useDefaults = 'true',
      // optional per-widget overrides
      maxResults: maxResultsRaw,
      minutesAhead: minutesAheadRaw,
      direction: directionRaw,
      timeFormat: timeFormatRaw,
      // force defaults for stop & lines
      stopId: _ignoreStop = '',
      lineFilter: _ignoreLine = '',
      showCanceled = 'false'
    } = query;

    const defaultsEnabled = String(useDefaults) === 'true';

    // App defaults
    const defaultStopId       = homey.settings.get('defaultStopId');
    const defaultLinesCodes   = (homey.settings.get('defaultLines') || []).map(String);
    const defaultLineIds      = (homey.settings.get('defaultLineIds') || []).map(String); // NEW
    const defaultMaxResults   = Number(homey.settings.get('defaultMaxResults')   ?? 200);
    const defaultMinutesAhead = Number(homey.settings.get('defaultMinutesAhead') ?? 180);
    const defaultDirection    = String(homey.settings.get('defaultDirection')    || 'any');
    const defaultTimeFormat   = String(homey.settings.get('defaultTimeFormat')   || 'auto');

    // Effective values
    const n = Math.max(1, Math.min(50, Number(maxResultsRaw ?? defaultMaxResults)));
    const minutesAhead = Math.max(5, Math.min(480, Number(minutesAheadRaw ?? defaultMinutesAhead)));
    const direction = (directionRaw ?? defaultDirection);
    const timeFormat = (timeFormatRaw ?? defaultTimeFormat);

    const effectiveStopId = defaultsEnabled ? (defaultStopId || '') : '';
    if (!effectiveStopId) return { rows: [], error: 'No stop selected in Settings.' };

    // Use saved Line IDs for server-side whitelisting; if missing, fall back to codes (client-side filter)
    const lineIds = defaultsEnabled ? defaultLineIds : [];
    const allowedCodes = new Set(defaultsEnabled ? defaultLinesCodes : []);

    const timeRangeSec = Math.max(300, Math.min(8 * 3600, minutesAhead * 60));

    const rows = await fetchEnturDepartures({
      stopId: effectiveStopId,
      n,
      timeRangeSec,
      lineIds
    });

    // Keep a safety net: if only codes are saved (no IDs yet), filter locally by publicCode
    const filteredByCodes = (allowedCodes.size > 0 && lineIds.length === 0)
        ? rows.filter(r => allowedCodes.has(String(r.line)))
        : rows;

    const filtered = filteredByCodes
        .filter(r => (showCanceled === 'true') || !r.canceled)
        .filter(r => (direction === 'any') || (r.direction === direction))
        .slice(0, n);

    return {
      rows: filtered,
      meta: {
        stopId: effectiveStopId,
        usedDefaults: defaultsEnabled,
        lineFilter: Array.from(allowedCodes),
        effectiveMaxResults: n,
        effectiveMinutesAhead: minutesAhead,
        effectiveDirection: direction,
        effectiveTimeFormat: timeFormat,
        whitelistedLineIds: lineIds
      }
    };
  }
};
