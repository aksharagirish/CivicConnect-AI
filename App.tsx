import React, { useState, useEffect } from "react";
import { ListCollapse, Map, AlertOctagon, HelpCircle, Sparkles, PlusCircle, CheckCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Dashboard from "./components/Dashboard";
import MapContainer from "./components/MapContainer";
import ReportForm from "./components/ReportForm";
import Metrics from "./components/Metrics";
import { Issue, IssueStatus } from "./types";

export default function App() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  
  // App views
  const [activeTab, setActiveTab] = useState<"dashboard" | "map" | "report">("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [apiEngine, setApiEngine] = useState("gemini-3.5-flash");
  const [localErr, setLocalErr] = useState("");

  // Location being pinned for a new report
  const [reportingLocation, setReportingLocation] = useState<{ lat: number; lng: number; address: string } | null>(null);

  // Client session voter ID
  const [currentUserId, setCurrentUserId] = useState("");

  // 1. GENERATE OR FETCH CLIENT ID ON MOUNT
  useEffect(() => {
    let uid = localStorage.getItem("civic_connect_uid");
    if (!uid) {
      uid = `civic-user-${Math.floor(100000 + Math.random() * 900000)}`;
      localStorage.setItem("civic_connect_uid", uid);
    }
    setCurrentUserId(uid);
  }, []);

  // 2. FETCH ALL INCIDENTS FROM FULLSTACK SERVER
  const fetchAllIssues = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/issues");
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setIssues(data.issues);
        setApiEngine(data.aiModelUsed);
      } else {
        throw new Error(data.error || "Failed loading catalog");
      }
    } catch (err: any) {
      setLocalErr(`Failed to connect with CivicConnect API services: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllIssues();
  }, []);

  // 3. HANDLERS FOR VOTING, VERIFYING, STATUS TRIAGE
  const handleVote = async (id: string) => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/issues/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId })
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        // Optimistic update
        setIssues((prev) =>
          prev.map((issue) =>
            issue.id === id
              ? { ...issue, votes: data.votes, votedUsers: data.votedUsers }
              : issue
          )
        );
      }
    } catch (err) {
      console.error("Failed to post upvote:", err);
    }
  };

  const handleVerify = async (id: string) => {
    if (!currentUserId) return;
    try {
      const res = await fetch(`/api/issues/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId })
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        // Optimistic update
        setIssues((prev) =>
          prev.map((issue) =>
            issue.id === id
              ? { ...issue, verifications: data.verifications, verifiedUsers: data.verifiedUsers }
              : issue
          )
        );
      }
    } catch (err) {
      console.error("Failed to post verification:", err);
    }
  };

  const handleUpdateStatus = async (id: string, status: IssueStatus, comment: string) => {
    try {
      const res = await fetch(`/api/issues/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, comment })
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        setIssues((prev) =>
          prev.map((issue) => (issue.id === id ? data.issue : issue))
        );
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      alert(`Simulation error: ${err.message}`);
    }
  };

  // Submit new reported incident
  const handleReportCreated = async (newReportPayload: any) => {
    try {
      const res = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newReportPayload)
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        // Sift successfully added report to the state list
        setIssues((prev) => [data.issue, ...prev]);
        setReportingLocation(null);
        setSelectedIssueId(data.issue.id);
        setActiveTab("dashboard");
      } else {
        throw new Error(data.error || "Filing failed");
      }
    } catch (err) {
      console.error("Filing incident report exception:", err);
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-[#070b13] bg-radial-[at_top_right] from-slate-900/40 via-[#070b13] to-[#04060b] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      
      {/* Decorative ambient beams */}
      <div className="absolute top-0 left-0 w-full h-[550px] bg-gradient-to-b from-indigo-500/5 via-emerald-500/0 to-transparent pointer-events-none" />

      {/* Navigation Municipal Masthead */}
      <header className="sticky top-0 z-30 bg-slate-950/75 backdrop-blur-xl border-b border-slate-900 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Logo & Sub-context */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl flex items-center justify-center shadow-xl shadow-emerald-950/40 border border-emerald-400/20">
              <ListCollapse className="w-5.5 h-5.5 text-slate-950 font-black rotate-12" />
            </div>
            <div className="text-left">
              <h1 className="font-extrabold text-lg text-slate-100 tracking-tight leading-tight">
                CivicConnect <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">AI</span>
              </h1>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Community Hero Solver Hub</p>
            </div>
          </div>

          {/* AI Connection Portal Diagnostics */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className={`text-[10px] uppercase font-mono px-3 py-1.5 rounded-full flex items-center gap-1.5 border ${
              apiEngine.includes("gemini")
                ? "bg-slate-950/80 text-emerald-400 border-emerald-500/20"
                : "bg-slate-950/80 text-amber-400 border-amber-500/20"
            }`}>
              <Sparkles className={`w-3.5 h-3.5 ${apiEngine.includes("gemini") ? "text-yellow-300 animate-pulse" : "text-amber-400"}`} />
              <span className="text-[10px] font-bold">Triage: {apiEngine}</span>
            </div>

            <div className="text-[10px] font-mono px-3 py-1.5 bg-slate-950/60 border border-slate-900 rounded-full text-slate-500" title="Offline persistent identification fingerprint">
              User ID: <span className="text-slate-300">{currentUserId}</span>
            </div>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6 relative">
        
        {localErr && (
          <div className="p-4 bg-rose-950/50 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-left">
            <AlertOctagon className="w-5.5 h-5.5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-300 text-sm">Offline / Portal Failure</h4>
              <p className="text-xs text-rose-400/90 mt-1">{localErr}</p>
            </div>
          </div>
        )}

        {/* Dynamic community statistics */}
        <Metrics issues={issues} />

        {/* View Selection Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-955 border border-slate-900 p-2 rounded-2xl">
          
          {/* Navigation selectors */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900 shrink-0">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`text-xs px-4 py-2.5 rounded-lg transition duration-200 font-semibold flex items-center gap-2 ${
                activeTab === "dashboard"
                  ? "bg-slate-900 text-slate-100 shadow-md border border-slate-800"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ListCollapse className="w-4 h-4 text-emerald-400" />
              Incident Hub
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`text-xs px-4 py-2.5 rounded-lg transition duration-200 font-semibold flex items-center gap-2 ${
                activeTab === "map"
                  ? "bg-slate-900 text-slate-100 shadow-md border border-slate-800"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Map className="w-4 h-4 text-sky-400" />
              Neighborhood Geo Grid
            </button>
          </div>

          {/* filing Trigger Button */}
          <button
            onClick={() => setActiveTab("report")}
            className={`text-xs px-5 py-2.5 rounded-xl font-bold transition flex items-center justify-center gap-2 ${
              activeTab === "report"
                ? "bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/10"
                : "bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:text-white"
            }`}
          >
            <PlusCircle className="w-4.5 h-4.5 shrink-0" />
            File New Hazard Incident
          </button>
        </div>

        {/* Main tabs content router */}
        <div className="flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
              <span className="w-12 h-12 rounded-full border-4 border-slate-850 border-t-emerald-400 animate-spin" />
              <p className="text-xs text-slate-500 font-mono tracking-widest uppercase mt-4">Connecting with Civic Database services...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === "dashboard" && (
                <motion.div
                  key="tab-dashboard"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.25 }}
                >
                  <Dashboard
                    issues={issues}
                    selectedIssueId={selectedIssueId}
                    onSelectIssue={setSelectedIssueId}
                    onVoteIssue={handleVote}
                    onVerifyIssue={handleVerify}
                    onUpdateStatus={handleUpdateStatus}
                    currentUserId={currentUserId}
                  />
                </motion.div>
              )}

              {activeTab === "map" && (
                <motion.div
                  key="tab-map"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="h-[500px]"
                >
                  <MapContainer
                    issues={issues}
                    selectedIssueId={selectedIssueId}
                    onSelectIssue={(id) => {
                      setSelectedIssueId(id);
                      if (id) setActiveTab("dashboard");
                    }}
                    reportingLocation={reportingLocation}
                    onSelectReportingLocation={(loc) => {
                      setReportingLocation(loc);
                      setActiveTab("report");
                    }}
                    isReportingMode={false}
                  />
                </motion.div>
              )}

              {activeTab === "report" && (
                <motion.div
                  key="tab-report"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* form block */}
                    <div className="lg:col-span-3">
                      <ReportForm
                        onReportSubmitted={handleReportCreated}
                        onCancel={() => {
                          setReportingLocation(null);
                          setActiveTab("dashboard");
                        }}
                        selectedCoordinates={reportingLocation}
                        onEnterReportingMode={() => {
                          setActiveTab("map");
                          // Enter pseudo pin drop mode in map
                          setReportingLocation(null);
                        }}
                      />
                    </div>

                    {/* help coordinate picker helper */}
                    <div className="lg:col-span-2 space-y-4">
                      {/* Map Coordinate Picker Preview */}
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-left flex flex-col justify-between h-full">
                        <div>
                          <div className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">Instructions</div>
                          <h4 className="font-bold text-slate-200 text-sm mt-1">Geolocating Your Incident</h4>
                          <p className="text-slate-400 text-xs mt-2 font-sans leading-relaxed">
                            For maximum repair dispatch accuracy, CivicConnect mandates assigning coordinate parameters. 
                            You have two streamlined options:
                          </p>
                          <ol className="list-decimal text-slate-500 text-xs mt-3.5 ml-4 space-y-2 font-sans leading-relaxed">
                            <li>
                              Click the <strong className="text-slate-300 font-bold">Change Pin Link</strong> or go to the <strong className="text-slate-300 font-bold">Neighborhood map</strong>.
                            </li>
                            <li>
                              Move around the Maple Grove sectors, and <strong className="text-slate-300 font-bold">click on the target street or area</strong>.
                            </li>
                            <li>
                              A custom geolocated pin will snap to the street and convert coordinates back into our database forms instantly!
                            </li>
                          </ol>
                        </div>

                        <div className="border-t border-slate-850 pt-4 mt-5">
                          <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mb-2">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            Coordinate Status Check:
                          </div>
                          {reportingLocation ? (
                            <div className="p-3 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-mono">
                              Coordinate Pin locked at {reportingLocation.lat.toFixed(5)}° N, {reportingLocation.lng.toFixed(5)}° W
                            </div>
                          ) : (
                            <div className="p-3 bg-amber-955/40 border border-amber-500/20 rounded-xl text-xs text-amber-500 font-mono">
                              No Coordinate Pin locked yet
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 px-6 mt-12 text-center text-slate-600 text-xs font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <span>CivicConnect AI • Safe Communities Powered by Gemini</span>
          <span>Maple Grove Sector Control © 2026</span>
        </div>
      </footer>

    </div>
  );
}
