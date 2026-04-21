import React, { useState, useRef } from "react";

const STATUS_OPTIONS = ["P", "L", "L/2", "WO", "WO/PH", "PH", "HD", "A"];
const LM_STATUS_OPTIONS = ["Approved", "Pending", "Rejected"];

export default function App() {
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const fileInputRef = useRef(null);

  const isValidFile = (file) => {
    const allowed = ["application/pdf", 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];
    return allowed.includes(file.type);
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (!isValidFile(selected)) {
      alert("Only PDF and Excel files are allowed");
      return;
    }
    setFile(selected);
    setData(null);
    setEntries([]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (!dropped) return;
    if (!isValidFile(dropped)) {
      alert("Only PDF and Excel files are allowed");
      return;
    }
    setFile(dropped);
    setData(null);
    setEntries([]);
  };

  const handleUpload = async () => {
    if (!file) return alert("Upload a file");
    if (!employeeId.trim()) return alert("Enter an Employee ID");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("employeeId", employeeId.trim().toLowerCase());

    try {
      setLoading(true);

      const res = await fetch(
        "https://asadkhann8nproject.app.n8n.cloud/webhook/upload-timesheet",
        {
          method: "POST",
          body: formData,
        }
      );

      if (res.status === 400) {
        setData(null);
        alert("Unauthorized: Please add the correct Employee ID.");
        return;
      }

      const response = await res.json();

      if (response?.entries?.length === 0 || !response?.entries) {
        setData(null);
        setEntries([]);
        alert("Incorrect timesheet file: no entries found.");
        return;
      }

      setData(response);

      const rawEntries = response?.entries || [];
      const monthStr = response?.metadata?.month;

      // Parse month/year from any format
      const MONTH_NAMES = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
      let targetMonth = null; // 0-indexed
      let targetYear = null;

      if (monthStr) {
        // "Jan-26" or "Oct-25"
        const dashFmt = monthStr.match(/^([A-Za-z]+)-(\d{2,4})$/);
        if (dashFmt) {
          targetMonth = MONTH_NAMES[dashFmt[1].toLowerCase().slice(0,3)];
          const y = parseInt(dashFmt[2]);
          targetYear = y < 100 ? 2000 + y : y;
        }
        // "01/2025"
        const slashFmt = monthStr.match(/^(\d{2})\/(\d{4})$/);
        if (slashFmt) {
          targetMonth = parseInt(slashFmt[1]) - 1;
          targetYear = parseInt(slashFmt[2]);
        }
        // "January 2025" or "JANUARY 2025"
        const spaceFmt = monthStr.match(/([A-Za-z]+)\s+(\d{4})/);
        if (spaceFmt) {
          targetMonth = MONTH_NAMES[spaceFmt[1].toLowerCase().slice(0,3)];
          targetYear = parseInt(spaceFmt[2]);
        }
      }

      // Build a map of existing entries keyed by normalised date string "DD-MMM"
      const entryMap = {};
      rawEntries.forEach((e) => {
        const key = e.date?.toLowerCase();
        if (key) entryMap[key] = e;
      });

      const MONTH_ABBR = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

      let fullEntries;
      if (targetMonth !== null && targetYear !== null) {
        const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
        fullEntries = Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const pad = String(day).padStart(2, "0");
          const abbr = MONTH_ABBR[targetMonth];
          const key = `${pad}-${abbr}`;
          const displayDate = `${pad}-${abbr.charAt(0).toUpperCase() + abbr.slice(1)}`;
          return entryMap[key] || {
            date: displayDate,
            project: "",
            hours: 0,
            present: 0,
            leave: 0,
            halfDay: 0,
            weekOff: 0,
            publicHoliday: 0,
            status: "",
            lmStatus: "Pending",
          };
        });
      } else {
        fullEntries = rawEntries;
      }

      // If no entry has a project, fill with client name
      const hasAnyProject = fullEntries.some((e) => e.project?.trim());
      if (!hasAnyProject) {
        const client = response?.metadata?.client || "";
        fullEntries = fullEntries.map((e) => ({ ...e, project: client }));
      }

      setEntries(fullEntries);
    } catch (err) {
      console.error(err);
      setData(null);
      alert("Error uploading");
    } finally {
      setLoading(false);
    }
  };

  const getDayName = (dateStr, monthStr) => {
    try {
      const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const MONTHS = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };

      // Extract year from any monthStr format
      const extractYear = (ms) => {
        if (!ms) return new Date().getFullYear();
        // "Jan-26" or "Oct-25" → last segment after "-"
        const dashMatch = ms.match(/-(\d{2,4})$/);
        if (dashMatch) {
          const y = parseInt(dashMatch[1]);
          return y < 100 ? 2000 + y : y;
        }
        // "01/2025" or "10/2026"
        const slashMatch = ms.match(/\/(\d{4})$/);
        if (slashMatch) return parseInt(slashMatch[1]);
        // "October 2025" or "Jan 2026"
        const spaceMatch = ms.match(/\b(20\d{2})\b/);
        if (spaceMatch) return parseInt(spaceMatch[1]);
        return new Date().getFullYear();
      };

      // "DD-MMM" format (e.g. "01-Jan", "1-Oct")
      if (/^\d{1,2}-[A-Za-z]{3}$/.test(dateStr)) {
        const [day, mon] = dateStr.split("-");
        const year = extractYear(monthStr);
        const d = new Date(Date.UTC(year, MONTHS[mon.toLowerCase()], parseInt(day)));
        return DAYS[d.getUTCDay()];
      }
      // "DD/MM/YYYY" format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const [dd, mm, yyyy] = dateStr.split("/");
        const d = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)));
        return DAYS[d.getUTCDay()];
      }
      return "";
    } catch { return ""; }
  };

  const handleEntryChange = (index, field, value) => {
    setEntries((prev) => {
      const updated = [...prev];
      let changes = { [field]: value };

      // Mutual exclusivity: present, leave, halfDay
      if (field === "present" && value === 1) changes = { ...changes, leave: 0, halfDay: 0 };
      if (field === "leave" && value === 1)   changes = { ...changes, present: 0, halfDay: 0 };
      if (field === "halfDay" && value === 1) changes = { ...changes, present: 0, leave: 0 };

      const merged = { ...updated[index], ...changes };

      // Sync status ↔ checkboxes
      if (["present", "leave", "halfDay"].includes(field)) {
        // Checkbox changed → update status
        if (merged.present === 1)      merged.status = "P";
        else if (merged.leave === 1)   merged.status = "L";
        else if (merged.halfDay === 1) merged.status = "L/2";
        else                           merged.status = "WO/PH";
      } else if (field === "status") {
        // Status dropdown changed → sync checkboxes
        merged.present = value === "P" ? 1 : 0;
        merged.leave   = value === "L" ? 1 : 0;
        merged.halfDay = value === "L/2" ? 1 : 0;
        merged.weekOff = ["WO", "WO/PH"].includes(value) ? 1 : 0;
        merged.publicHoliday = value === "PH" ? 1 : 0;
      }

      updated[index] = merged;
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-6 text-white">
      
      <div className="w-full max-w-6xl bg-gray-900/60 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-gray-700">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <img
            src="https://techcarrot.ae/wp-content/uploads/2022/12/techcarrot.svg"
            alt="Techcarrot"
            className="h-8 w-auto bg-white rounded px-2 py-0.5"
          />
          <h1 className="text-2xl font-semibold">Timesheet Analyzer</h1>
        </div>

        {/* Upload */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
            dragging
              ? "border-blue-400 bg-blue-500/10 scale-[1.01]"
              : file
              ? "border-green-500 bg-green-500/10"
              : "border-gray-600 hover:border-blue-400 hover:bg-white/5"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.xlsx,.xls"
          />

          <div className="flex flex-col items-center gap-3">
            <div className="text-4xl">{file ? "✅" : "📂"}</div>
            {file ? (
              <div>
                <p className="font-medium text-green-400">{file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-gray-200">Drag & drop your file here</p>
                <p className="text-xs text-gray-400 mt-1">or <span className="text-blue-400 underline">browse to upload</span></p>
                <p className="text-xs text-gray-500 mt-2">Supports PDF & Excel (.xlsx)</p>
              </div>
            )}
          </div>
        </div>

        <input
          type="text"
          placeholder="Employee ID (e.g. john.doe)"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUpload()}
          className="mt-4 w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
        />

        <button
          onClick={handleUpload}
          disabled={loading || !file}
          className="mt-3 w-full bg-blue-600 py-2.5 rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Analyzing..." : "Upload & Analyze"}
        </button>

        {/* Loader */}
        {loading && (
          <div className="mt-6 text-center text-sm text-gray-400 animate-pulse">
            Processing timesheet...
          </div>
        )}

        {/* Result */}
        {data && (
          <div className="mt-8 space-y-5">

            {/* Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Employee", value: data.metadata?.employee },
                { label: "Client", value: data.metadata?.client },
                { label: "Month", value: data.metadata?.month },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="font-medium text-sm truncate">{value || "—"}</p>
                </div>
              ))}
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                { label: "Present", color: "bg-green-500/20 text-green-400 border-green-500/30", count: entries.filter(e => e.status === "P").length },
                { label: "Leave", color: "bg-red-500/20 text-red-400 border-red-500/30", count: entries.filter(e => e.leave === 1).length },
                { label: "Half Day", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", count: entries.filter(e => e.halfDay === 1).length },
                { label: "WO / PH", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", count: entries.filter(e => ["WO","WO/PH","PH"].includes(e.status)).length },
              ].map(({ label, color, count }) => (
                <span key={label} className={`px-3 py-1 rounded-full border font-medium ${color}`}>
                  {label}: {count}
                </span>
              ))}
            </div>

            {/* Editable Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-700">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    {["Date", "Project", "Hours", "Present", "Leave", "Half Day", "Status", "LM Status"].map(h => (
                      <th key={h} className="px-3 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr
                      key={i}
                      className={`border-t border-gray-700/50 transition-colors ${
                        ["WO","WO/PH","PH"].includes(entry.status)
                          ? "bg-blue-900/20 text-gray-400"
                          : entry.leave === 1
                          ? "bg-red-900/20"
                          : entry.halfDay === 1
                          ? "bg-yellow-900/20"
                          : "hover:bg-white/5"
                      }`}
                    >
                      {/* Date – read only */}
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">
                        <span className="font-mono">{entry.date}</span>
                        <span className="ml-1.5 text-gray-500">{getDayName(entry.date, data.metadata?.month)}</span>
                      </td>

                      {/* Project */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={entry.project}
                          onChange={(e) => handleEntryChange(i, "project", e.target.value)}
                          className="w-full bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 rounded px-1.5 py-0.5 outline-none focus:bg-gray-800 transition text-xs"
                        />
                      </td>

                      {/* Hours */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={entry.hours}
                          min={0}
                          step={0.5}
                          onChange={(e) => handleEntryChange(i, "hours", parseFloat(e.target.value) || 0)}
                          className="w-16 bg-transparent border border-transparent hover:border-gray-600 focus:border-blue-500 rounded px-1.5 py-0.5 outline-none focus:bg-gray-800 transition text-xs"
                        />
                      </td>

                      {/* Present */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={entry.present === 1}
                          onChange={(e) => handleEntryChange(i, "present", e.target.checked ? 1 : 0)}
                          className="accent-green-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Leave */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={entry.leave === 1}
                          onChange={(e) => handleEntryChange(i, "leave", e.target.checked ? 1 : 0)}
                          className="accent-red-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Half Day */}
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={entry.halfDay === 1}
                          onChange={(e) => handleEntryChange(i, "halfDay", e.target.checked ? 1 : 0)}
                          className="accent-yellow-500 w-4 h-4 cursor-pointer"
                        />
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2">
                        <select
                          disabled
                          value={entry.status}
                          onChange={(e) => handleEntryChange(i, "status", e.target.value)}
                          className="bg-gray-800 border border-gray-600 rounded px-1.5 py-0.5 text-xs outline-none focus:border-blue-500 cursor-pointer"
                        >
                          {STATUS_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>

                      {/* LM Status */}
                      <td className="px-3 py-2">
                        <select
                          value={entry.lmStatus}
                          onChange={(e) => handleEntryChange(i, "lmStatus", e.target.value)}
                          className={`bg-gray-800 border rounded px-1.5 py-0.5 text-xs outline-none cursor-pointer ${
                            entry.lmStatus === "Approved"
                              ? "border-green-600 text-green-400"
                              : entry.lmStatus === "Rejected"
                              ? "border-red-600 text-red-400"
                              : "border-gray-600 text-yellow-400"
                          }`}
                        >
                          {LM_STATUS_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Submit */}
            <div className="flex justify-center">
              <button
                onClick={() => alert("Data submitted")}
                className="px-6 py-2 bg-green-600 rounded-lg text-sm font-medium hover:bg-green-700 transition"
              >
                Submit
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
