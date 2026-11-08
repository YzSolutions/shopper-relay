"use client";

import { useEffect, useMemo, useRef } from "react";
import { Calendar } from "@bryntum/calendar-enterprise";
import "@bryntum/core-enterprise/fontawesome/css/fontawesome.css";
import "@bryntum/core-enterprise/fontawesome/css/solid.css";
import "@bryntum/calendar-enterprise/calendar.css";
import "@bryntum/calendar-enterprise/svalbard-light.css";
import { localToday, occasionStatus, shopDay, type OccasionTone, type OccasionView } from "@/lib/client/occasions";

// Sarah's occasions on a Bryntum calendar: each date, and the day the AI shops for it,
// coloured by how that went. People add and change occasions with the form beside it,
// so the calendar itself is read-only. Loaded only in the browser (it needs the DOM).

// Bryntum's licence key is meant for the browser; it lives in an env var so it stays out of the repo.
if (process.env.NEXT_PUBLIC_BRYNTUM_KEY) globalThis.bryntum.licenseKey = process.env.NEXT_PUBLIC_BRYNTUM_KEY;

const TONE_COLOR: Record<OccasionTone, string> = {
  plain: "#4a5670",
  due: "#fd7800",
  waiting: "#fd7800",
  done: "#027a30",
  stop: "#b42318",
  past: "#4a5670",
};

const asDate = (day: string, plus = 0) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d + plus);
};
// A whole day: from that midnight to the next (an event needs an end to be drawn).
const wholeDay = (day: string) => ({ startDate: asDate(day), endDate: asDate(day, 1), allDay: true });

export default function OccasionCalendar({ occasions, today, owner, onPick }: { occasions: OccasionView[]; today: string; owner: string; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const calendar = useRef<Calendar | null>(null);
  const pick = useRef(onPick);

  const events = useMemo(
    () =>
      occasions.flatMap((o) => {
        const status = occasionStatus(o, today, owner);
        return [
          { id: `day-${o.id}`, name: o.title, tip: o.job, iconCls: "fa fa-gift", ...wholeDay(o.date), eventColor: "#0151c9", occasionId: o.id },
          {
            id: `shop-${o.id}`,
            // The cart marks the day the AI shops (or did); its colour says how that went.
            name: o.title,
            tip: `The AI shops for this: ${o.job}. ${status.words}.`,
            iconCls: "fa fa-cart-shopping",
            ...wholeDay(o.shoppedAt ? localToday(new Date(o.shoppedAt)) : shopDay(o.date, o.daysAhead)),
            eventColor: TONE_COLOR[status.tone],
            occasionId: o.id,
          },
        ];
      }),
    [occasions, today, owner],
  );
  const latest = useRef(events);

  useEffect(() => {
    pick.current = onPick;
    latest.current = events;
    if (calendar.current) calendar.current.eventStore.data = events;
  }, [events, onPick]);

  useEffect(() => {
    calendar.current = new Calendar({
      appendTo: box.current!,
      date: asDate(today),
      mode: "month",
      modes: { day: null, week: null, year: null, agenda: { title: "List" } },
      events: latest.current,
      readOnly: true,
      sidebar: false,
      features: {
        eventEdit: false,
        eventMenu: false,
        scheduleMenu: false,
        drag: false,
        // Plain text, never HTML, so nothing typed into an occasion can run as code.
        eventTooltip: { renderer: async ({ eventRecord }) => ({ tag: "p", text: String(eventRecord.getData("tip")) }) },
      },
      listeners: { eventClick: ({ eventRecord }: { eventRecord: { getData: (f: string) => unknown } }) => pick.current(String(eventRecord.getData("occasionId"))) },
    });
    return () => {
      calendar.current?.destroy();
      calendar.current = null;
    };
  }, [today]);

  return <div ref={box} className="h-[38rem] overflow-hidden rounded-2xl border border-line" />;
}
