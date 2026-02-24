"use client";

import { useEffect, useState, useCallback } from "react";

interface TableInfo {
  name: string;
  row_count: number;
}

interface TableData {
  table_name: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
}

function getSecret() {
  return localStorage.getItem("monitoring_secret") || "";
}

function headers(extra?: Record<string, string>) {
  return { "X-Monitoring-Secret": getSecret(), ...extra };
}

export default function DatabasePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  const copyCell = (value: unknown, key: string) => {
    const text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCell(key);
      setTimeout(() => setCopiedCell(null), 1200);
    });
  };

  // Fetch table list
  const fetchTables = useCallback(async () => {
    try {
      const res = await fetch("/api/monitoring/tables", { headers: headers() });
      const data = await res.json();
      setTables(data.tables || []);
    } catch {
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  // Fetch table rows
  const fetchTableData = useCallback(async () => {
    if (!selectedTable) return;
    setTableLoading(true);
    try {
      const res = await fetch(
        `/api/monitoring/tables/${selectedTable}?page=${page}&page_size=30`,
        { headers: headers() }
      );
      const data = await res.json();
      setTableData(data);
    } catch {
      setTableData(null);
    } finally {
      setTableLoading(false);
    }
  }, [selectedTable, page]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  const showMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 5000);
  };

  // Delete a single row
  const deleteRow = (tableName: string, rowId: string) => {
    setConfirmAction({
      title: `Delete row from ${tableName}`,
      description: `This will permanently delete row ${rowId.slice(0, 8)}... from ${tableName}.`,
      onConfirm: async () => {
        const res = await fetch(`/api/monitoring/tables/${tableName}/${rowId}`, {
          method: "DELETE",
          headers: headers({ "X-Confirm": "true" }),
        });
        const data = await res.json();
        showMessage(data.message || "Deleted");
        fetchTableData();
        fetchTables();
        setConfirmAction(null);
      },
    });
  };

  // Delete a deliberation (cascade)
  const deleteDeliberation = (id: string, question: string) => {
    setConfirmAction({
      title: "Delete Deliberation (Cascade)",
      description: `This will permanently delete "${question}" and ALL related data: opinions, statements, rankings, critiques, feedback, and traces.`,
      onConfirm: async () => {
        const res = await fetch(`/api/monitoring/deliberations/${id}`, {
          method: "DELETE",
          headers: headers({ "X-Confirm": "true" }),
        });
        const data = await res.json();
        showMessage(data.message || "Deleted");
        fetchTableData();
        fetchTables();
        setConfirmAction(null);
      },
    });
  };

  // Bulk: delete empty deliberations
  const deleteEmptyDeliberations = () => {
    setConfirmAction({
      title: "Delete Empty Deliberations",
      description: "This will delete all deliberations that have zero statements.",
      onConfirm: async () => {
        const res = await fetch("/api/monitoring/bulk-actions/delete-empty-deliberations", {
          method: "POST",
          headers: headers({ "X-Confirm": "true" }),
        });
        const data = await res.json();
        showMessage(data.message || "Done");
        fetchTableData();
        fetchTables();
        setConfirmAction(null);
      },
    });
  };

  // Bulk: delete seed-only deliberations
  const deleteSeedOnlyDeliberations = () => {
    setConfirmAction({
      title: "Delete Seed-Only Deliberations",
      description: "This will delete all deliberations that only have seed statements (no user-contributed statements).",
      onConfirm: async () => {
        const res = await fetch("/api/monitoring/bulk-actions/delete-seed-only-deliberations", {
          method: "POST",
          headers: headers({ "X-Confirm": "true" }),
        });
        const data = await res.json();
        showMessage(data.message || "Done");
        fetchTableData();
        fetchTables();
        setConfirmAction(null);
      },
    });
  };

  if (loading) return <div className="text-sm" style={{ color: "var(--muted)" }}>Loading...</div>;

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-bold mb-6">Database Management</h1>

      {/* Action message */}
      {actionMessage && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-sm">
          {actionMessage}
        </div>
      )}

      {/* Bulk Actions */}
      <div
        className="mb-6 p-4 rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <h2 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
          Bulk Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="Delete Empty Deliberations"
            onClick={deleteEmptyDeliberations}
            variant="warning"
          />
          <ActionButton
            label="Delete Seed-Only Deliberations"
            onClick={deleteSeedOnlyDeliberations}
            variant="warning"
          />
        </div>
      </div>

      {/* Table Selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tables.map((t) => (
          <button
            key={t.name}
            onClick={() => {
              setSelectedTable(t.name);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              selectedTable === t.name ? "" : "hover:opacity-80"
            }`}
            style={{
              borderColor: selectedTable === t.name ? "var(--foreground)" : "var(--border)",
              background: selectedTable === t.name ? "var(--foreground)" : "transparent",
              color: selectedTable === t.name ? "var(--background)" : "var(--foreground)",
            }}
          >
            {t.name}
            <span className="ml-1.5 opacity-60">{t.row_count}</span>
          </button>
        ))}
      </div>

      {/* Table Data */}
      {selectedTable && (
        <>
          {tableLoading ? (
            <div className="text-sm" style={{ color: "var(--muted)" }}>Loading rows...</div>
          ) : tableData && tableData.rows.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface)" }}>
                    {tableData.columns.map((col) => (
                      <th
                        key={col}
                        className="px-2.5 py-2 text-left font-medium whitespace-nowrap"
                        style={{ color: "var(--muted)" }}
                      >
                        {col}
                      </th>
                    ))}
                    <th className="px-2.5 py-2 text-left font-medium" style={{ color: "var(--muted)" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.rows.map((row, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                      {tableData.columns.map((col) => {
                        const cellKey = `${i}-${col}`;
                        const copied = copiedCell === cellKey;
                        return (
                          <td
                            key={col}
                            className="px-2.5 py-2 max-w-[200px] truncate font-mono cursor-pointer select-none relative"
                            title="Click to copy"
                            onClick={() => copyCell(row[col], cellKey)}
                            style={{ opacity: copied ? 0.6 : 1, transition: "opacity 0.15s" }}
                          >
                            {copied ? <span className="text-green-500">Copied!</span> : formatCell(row[col])}
                          </td>
                        );
                      })}
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => deleteRow(selectedTable, String(row.id))}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:opacity-80"
                          >
                            Delete
                          </button>
                          {selectedTable === "deliberations" && (
                            <button
                              onClick={() =>
                                deleteDeliberation(
                                  String(row.id),
                                  String(row.question || row.id)
                                )
                              }
                              className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-300 hover:opacity-80"
                            >
                              Cascade
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              No rows in {selectedTable}
            </div>
          )}

          {/* Pagination */}
          {tableData && tableData.total > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {tableData.total} rows total
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-30"
                  style={{ borderColor: "var(--border)" }}
                >
                  ← Prev
                </button>
                <span className="text-xs px-2 py-1.5 tabular-nums" style={{ color: "var(--muted)" }}>
                  Page {page}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(tableData?.rows.length || 0) < 30}
                  className="px-3 py-1.5 rounded-lg border text-xs disabled:opacity-30"
                  style={{ borderColor: "var(--border)" }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-md p-6 rounded-xl shadow-xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">
              {confirmAction.title}
            </h3>
            <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
              {confirmAction.description}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAction.onConfirm}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value).slice(0, 100);
  const str = String(value);
  return str.length > 80 ? str.slice(0, 80) + "…" : str;
}

function ActionButton({
  label,
  onClick,
  variant,
}: {
  label: string;
  onClick: () => void;
  variant: "warning" | "danger";
}) {
  const cls =
    variant === "danger"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity ${cls}`}
    >
      {label}
    </button>
  );
}
