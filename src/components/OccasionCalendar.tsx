"use client";

import { useMemo } from "react";
import { BryntumCalendar } from "@bryntum/calendar-react";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/svalbard-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";
import { localToday, occasionStatus, shopDay, type OccasionTone, type OccasionView } from "@/lib/client/occasions";

// Sarah's occasions on a Bryntum calendar: each date, and the day the AI shops for it,
// coloured by how that went. People add and change occasions with the form beside it,
// so the calendar itself is read-only. Loaded only in the browser (it needs the DOM).

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

  return (
    <div className="h-[38rem] overflow-hidden rounded-2xl border border-line">
      <BryntumCalendar
        date={asDate(today)}
        mode="month"
        modes={{ day: null, week: null, year: null, agenda: { title: "List" } }}
        events={events}
        readOnly
        sidebar={false}
        eventEditFeature={false}
        eventMenuFeature={false}
        scheduleMenuFeature={false}
        dragFeature={false}
        // Plain text, never HTML, so nothing typed into an occasion can run as code.
        eventTooltipFeature={{ renderer: async ({ eventRecord }) => ({ tag: "p", text: String(eventRecord.getData("tip")) }) }}
        onEventClick={({ eventRecord }) => onPick(String(eventRecord.getData("occasionId")))}
      />
    </div>
  );
}
