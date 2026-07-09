// src/components/HRPortal/SitesDepartmentsPage.jsx
// HR Portal – Sites & Departments management.
// Small admin page: add / delete Sites and Departments. Both lists come from
// HRPortalContext (useHRPortal), same as the rest of the portal.

import { useState } from "react";
import { apiFetch } from "../../utils/auth";
import { useHRPortal } from "../../context/HRPortalContext";

const API = `${import.meta.env.VITE_API_BASE_URL}/api`;

const T = {
  navy:  "#0a2a5e",
  blue:  "#1557b0",
  ink:   "#1a2233",
  muted: "#5b6472",
  line:  "#e2e8f0",
  bg:    "#f7f9fc",
};

// ── One column: Departments or Sites ────────────────────────────────────────
function EntityColumn({ title, subtitle, items, loading, isHRM, endpoint, onChanged, showToast }) {
  const [name, setName]   = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) { showToast(`Enter a ${title.toLowerCase()} name first.`, "err"); return; }
    setAdding(true);
    try {
      const res = await apiFetch(`${API}/employees/${endpoint}/`, {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.name?.[0] || data.error || data.detail || `Could not add this ${title.toLowerCase()}.`;
        showToast(msg, "err");
        return;
      }
      setName("");
      onChanged();
      showToast(`${title.slice(0, -1)} added.`, "ok");
    } catch {
      showToast(`Could not add this ${title.toLowerCase()}.`, "err");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id, itemName) => {
    if (!window.confirm(`Delete "${itemName}"? Employees assigned to it will just be left without one.`)) return;
    setDeletingId(id);
    try {
      const res = await apiFetch(`${API}/employees/${endpoint}/${id}/`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Only the IT Manager can delete records.", "err");
        return;
      }
      onChanged();
      showToast(`${title.slice(0, -1)} deleted.`, "ok");
    } catch {
      showToast("Could not delete — please try again.", "err");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{
      flex: "1 1 340px", minWidth: 300,
      background: "#fff", borderRadius: 14, border: `1px solid ${T.line}`,
      boxShadow: "0 1px 6px rgba(0,0,0,0.04)", overflow: "hidden",
    }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${T.line}` }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: T.navy }}>
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: T.muted, fontFamily: "'DM Sans',sans-serif", marginTop: 2 }}>
          {subtitle}
        </div>
      </div>

      {isHRM && (
        <div style={{ display: "flex", gap: 8, padding: "14px 20px", borderBottom: `1px solid ${T.line}` }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
            placeholder={`New ${title.toLowerCase().slice(0, -1)} name`}
            style={{
              flex: 1, padding: "9px 12px", borderRadius: 9,
              border: `1.5px solid ${T.line}`, fontSize: 13,
              fontFamily: "'DM Sans',sans-serif", outline: "none",
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            style={{
              padding: "9px 16px", borderRadius: 9, border: "none",
              background: adding ? "#94a3b8" : `linear-gradient(135deg,${T.navy},${T.blue})`,
              color: "#fff", fontSize: 13, fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", cursor: adding ? "wait" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      <div style={{ maxHeight: 420, overflowY: "auto" }}>
        {loading && !items && (
          <div style={{ padding: 20, fontSize: 13, color: T.muted, fontFamily: "'DM Sans',sans-serif" }}>Loading…</div>
        )}
        {items && items.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: T.muted, fontFamily: "'DM Sans',sans-serif" }}>
            No {title.toLowerCase()} yet.
          </div>
        )}
        {items && items.map(item => (
          <div key={item.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "11px 20px", borderBottom: `1px solid #f1f5f9`,
          }}>
            <span style={{ fontSize: 13.5, color: T.ink, fontFamily: "'DM Sans',sans-serif", fontWeight: 500 }}>
              {item.name}
            </span>
            {isHRM && (
              <button
                onClick={() => handleDelete(item.id, item.name)}
                disabled={deletingId === item.id}
                title="Delete"
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  color: deletingId === item.id ? "#cbd5e1" : "#dc2626",
                  padding: 6, borderRadius: 7, display: "flex",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HRSitesDepartmentsPage({ showToast, isHRM }) {
  const { departments, sites, loading, refetchDepartments, refetchSites } = useHRPortal();

  return (
    <div style={{ padding: "28px 32px", background: T.bg, minHeight: "100%" }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 700, color: T.navy }}>
          Sites & Departments
        </div>
        <div style={{ fontSize: 13.5, color: T.muted, fontFamily: "'DM Sans',sans-serif", marginTop: 4 }}>
          Manage the Sites and Departments employees can be assigned to — including the ones created automatically during bulk import.
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <EntityColumn
          title="Departments"
          subtitle="Functional departments (e.g. Finance, Admin, Workshop)"
          items={departments}
          loading={loading?.departments}
          isHRM={isHRM}
          endpoint="departments"
          onChanged={refetchDepartments}
          showToast={showToast}
        />
        <EntityColumn
          title="Sites"
          subtitle="Physical work locations (e.g. Bluffhill, Bindura)"
          items={sites}
          loading={loading?.sites}
          isHRM={isHRM}
          endpoint="sites"
          onChanged={refetchSites}
          showToast={showToast}
        />
      </div>

      {!isHRM && (
        <div style={{
          marginTop: 20, padding: "12px 16px", borderRadius: 10,
          background: "#fffbeb", border: "1px solid #fde68a",
          fontSize: 12.5, color: "#92400e", fontFamily: "'DM Sans',sans-serif",
        }}>
          Only an HR Manager can add or delete sites and departments here.
        </div>
      )}
    </div>
  );
}