"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Types only: the calendar itself comes from public/bryntum (see scripts/copy-bryntum.mjs).
import type { Calendar, CalendarConfig } from "@bryntum/calendar";
import { Spinner } from "@/components/ui";
import { localToday, occasionStatus, shopDay, type OccasionTone, type OccasionView } from "@/lib/client/occasions";

// Sarah's occasions on a Bryntum calendar: each date, and the day the AI shops for it,
// coloured by how that went. People add and change occasions with the form beside it,
// so the calendar itself is read-only.

declare global {
  interface Window {
    bryntum?: { calendar?: { Calendar: new (config: CalendarConfig) => Calendar } };
  }
}

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

let loading: Promise<void> | null = null;
/** Loads Bryntum's browser build once per page. */
function loadBryntum(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/bryntum/calendar.umd.js";
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("The calendar couldn't load."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export default function OccasionCalendar({ occasions, today, owner, onPick }: { occasions: OccasionView[]; today: string; owner: string; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const calendar = useRef<Calendar | null>(null);
  const pick = useRef(onPick);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

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
    let gone = false;
    loadBryntum()
      .then(() => {
        const Cal = window.bryntum?.calendar?.Calendar;
        if (gone || !box.current) return;
        if (!Cal) throw new Error("Bryntum didn't load.");
        calendar.current = new Cal({
          appendTo: box.current,
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
        setState("ready");
      })
      .catch(() => {
        if (!gone) setState("failed");
      });
    return () => {
      gone = true;
      calendar.current?.destroy();
      calendar.current = null;
    };
  }, [today]);

  return (
    <div className="relative h-[38rem] overflow-hidden rounded-2xl border border-line">
      {/* React puts these in the head once; they only load on this page (Bryntum is kept out of the bundle). */}
      {/* eslint-disable @next/next/no-css-tags */}
      <link rel="stylesheet" href="/bryntum/calendar.css" precedence="default" />
      <link rel="stylesheet" href="/bryntum/svalbard-light.css" precedence="default" />
      <link rel="stylesheet" href="/bryntum/fontawesome/css/fontawesome.css" precedence="default" />
      <link rel="stylesheet" href="/bryntum/fontawesome/css/solid.css" precedence="default" />
      {/* eslint-enable @next/next/no-css-tags */}
      <div ref={box} className="h-full" />
      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center bg-white">
          {state === "loading" ? <Spinner label="Loading the calendar…" /> : <p className="text-lg text-ink-soft">The calendar couldn&apos;t load. The list below has every occasion.</p>}
        </div>
      )}
    </div>
  );
}
