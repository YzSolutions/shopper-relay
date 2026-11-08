"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  CsvExportModule,
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  PinnedRowModule,
  QuickFilterModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { Button } from "@/components/ui";
import { ledgerRows, paidLately, type LedgerPurchase, type LedgerRow, type LedgerStatus } from "@/lib/client/ledger";

// The household's spending, as a table people can sort, filter, search and download.
// Only the community modules it uses are loaded, and only on the History page.
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  QuickFilterModule,
  CsvExportModule,
  PinnedRowModule,
  CellStyleModule,
  ...(process.env.NODE_ENV === "production" ? [] : [ValidationModule]),
]);

// ShopperRelay's own colours and type (see globals.css), so the table belongs to the app.
const theme = themeQuartz.withParams({
  fontFamily: "inherit",
  fontSize: 16,
  headerFontSize: 15,
  headerFontWeight: 700,
  foregroundColor: "#14213d",
  backgroundColor: "#ffffff",
  chromeBackgroundColor: "#f2f6fc",
  headerTextColor: "#14213d",
  accentColor: "#0151c9",
  borderColor: "#d5deec",
  rowHoverColor: "#e8f0fc",
  wrapperBorderRadius: 16,
  rowHeight: 52,
  headerHeight: 48,
  spacing: 6,
  cellHorizontalPadding: 12,
});

const STATUS_CLASS: Record<LedgerStatus, string> = {
  Paid: "bg-ledger-wash text-ledger-deep",
  Held: "bg-signal-wash text-signal-text",
  Waiting: "bg-signal-wash text-signal-text",
  Declined: "bg-stop-wash text-stop",
  Released: "bg-mist text-ink-soft",
  "Not allowed": "bg-stop-wash text-stop",
  Stopped: "bg-stop-wash text-stop",
};

type Row = LedgerRow | { item: string; amount: number; total: true };
const isTotal = (r: Row | undefined): r is Extract<Row, { total: true }> => !!r && "total" in r;
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const shortDay = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });

function ItemCell({ data }: ICellRendererParams<Row>) {
  if (!data) return null;
  if (isTotal(data)) return <span className="font-bold">{data.item}</span>;
  return (
    <Link href={`/purchase/${data.id}`} title={data.item} className="font-semibold text-relay underline-offset-4 hover:underline">
      {data.item}
    </Link>
  );
}

function StatusCell({ data }: ICellRendererParams<Row>) {
  if (!data || isTotal(data)) return null;
  return <span className={`rounded-full px-2.5 py-0.5 text-[0.9375rem] font-semibold whitespace-nowrap ${STATUS_CLASS[data.status]}`}>{data.status}</span>;
}

/** Matches a picked date to the day, whatever the time of the purchase. */
function sameDay(filterDate: Date, cell: Date | null): number {
  if (!cell) return -1;
  const d = new Date(cell.getFullYear(), cell.getMonth(), cell.getDate()).getTime();
  return d === filterDate.getTime() ? 0 : d < filterDate.getTime() ? -1 : 1;
}

export function SpendingGrid({ purchases, names }: { purchases: LedgerPurchase[]; names: { shopper: string; reviewer: string } }) {
  const grid = useRef<AgGridReact<Row>>(null);
  const [search, setSearch] = useState("");
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);

  const rows = useMemo(() => ledgerRows(purchases, names), [purchases, names]);
  const total = useMemo(() => [{ item: "Paid, last 30 days", amount: paidLately(rows), total: true as const }], [rows]);

  // Every column shares the width, so nothing runs off the side; on a phone only date, item and amount stay.
  const columns = useMemo<ColDef<Row>[]>(
    () => [
      { headerName: "Date", field: "date" as never, initialSort: "desc", filter: "agDateColumnFilter", filterParams: { comparator: sameDay }, valueFormatter: (p) => (p.value ? shortDay(p.value) : ""), flex: 0.8, minWidth: narrow ? 76 : 104 },
      { headerName: "Item", field: "item", cellRenderer: ItemCell, filter: "agTextColumnFilter", flex: 2, minWidth: 140 },
      { headerName: "Category", field: "category" as never, filter: "agTextColumnFilter", hide: narrow, flex: 1, minWidth: 110 },
      { headerName: "Amount", field: "amount", filter: "agNumberColumnFilter", valueFormatter: (p) => money(p.value), cellClass: "ag-right-aligned-cell tabular-nums font-semibold", headerClass: "ag-right-aligned-header", flex: 1, minWidth: 100 },
      { headerName: "Status", field: "status" as never, cellRenderer: StatusCell, filter: "agTextColumnFilter", hide: narrow, flex: 1, minWidth: 118 },
      { headerName: "Decided by", field: "decidedBy" as never, filter: "agTextColumnFilter", hide: narrow, flex: 1.3, minWidth: 140 },
      { headerName: "PayPal ID", field: "paypalId" as never, filter: "agTextColumnFilter", hide: narrow, cellClass: "tabular-nums text-ink-soft", flex: 1.2, minWidth: 130 },
    ],
    [narrow],
  );

  function download() {
    grid.current?.api.exportDataAsCsv({
      fileName: "shopperrelay-spending.csv",
      // Plain values a spreadsheet can sort: ISO dates and numbers.
      processCellCallback: (p) => (p.value instanceof Date ? p.value.toISOString().slice(0, 10) : p.value),
    });
  }

  return (
    <section aria-labelledby="spending" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="spending" className="text-2xl font-bold">
          Spending
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="sr-only">Search the spending table</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="min-h-11 w-52 rounded-xl border-2 border-line px-3 text-lg focus:border-relay focus:outline-none"
            />
          </label>
          <Button tone="quiet" onClick={download} disabled={rows.length === 0}>
            Download as CSV
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-lg text-ink-soft">Nothing yet. Purchases show up here once they&apos;re paid for or sent to {names.reviewer}.</p>
      ) : (
        <AgGridReact<Row>
          ref={grid}
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          pinnedBottomRowData={total}
          quickFilterText={search}
          domLayout="autoHeight"
          defaultColDef={{ sortable: true, resizable: true, suppressHeaderFilterButton: narrow, minWidth: 64 }}
          getRowId={(p) => (isTotal(p.data) ? "total" : p.data.id)}
          suppressCellFocus={false}
        />
      )}
    </section>
  );
}
