"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { fetchPublications, type Publication } from "@/lib/publicationService";

type FacultyProfile = {
  id: string;
  name: string;
  orcid: string;
  focus: string;
  publications: number;
  citations: number;
  lastPublication: string;
};

type FormState = {
  name: string;
  orcid: string;
  focus: string;
};

const STORAGE_KEY = "facultyProfiles";

const emptyForm: FormState = {
  name: "",
  orcid: "",
  focus: "",
};

const buildProfile = (form: FormState): FacultyProfile => ({
  id: crypto.randomUUID(),
  name: form.name.trim(),
  orcid: form.orcid.trim(),
  focus: form.focus.trim(),
  publications: 0,
  citations: 0,
  lastPublication: "N/A",
});

const calculateMetrics = (publications: Publication[]) => {
  const count = publications.length;
  const citations = publications.reduce((total, pub) => total + pub.citationCount, 0);
  const lastPublication = publications
    .map((pub) => pub.date)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];

  return {
    publications: count,
    citations,
    lastPublication: lastPublication ?? "N/A",
  };
};

export default function FacultyProfilesPage() {
  const [profiles, setProfiles] = useState<FacultyProfile[]>([]);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [globalStatus, setGlobalStatus] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FacultyProfile[];
        setProfiles(parsed);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) {
      return profiles;
    }
    const query = searchQuery.toLowerCase();
    return profiles.filter(
      (profile) =>
        profile.name.toLowerCase().includes(query) ||
        profile.focus.toLowerCase().includes(query) ||
        profile.orcid.toLowerCase().includes(query),
    );
  }, [profiles, searchQuery]);

  const handleFormChange = (field: keyof FormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddProfile = () => {
    if (!formState.name.trim()) {
      setGlobalStatus("Please add a faculty name before saving.");
      return;
    }
    setGlobalStatus(null);
    if (editingId) {
      setProfiles((prev) =>
        prev.map((profile) =>
          profile.id === editingId
            ? {
                ...profile,
                name: formState.name.trim(),
                orcid: formState.orcid.trim(),
                focus: formState.focus.trim(),
              }
            : profile,
        ),
      );
      setEditingId(null);
      setFormState(emptyForm);
      return;
    }

    setProfiles((prev) => [buildProfile(formState), ...prev]);
    setFormState(emptyForm);
  };

  const handleEditProfile = (profile: FacultyProfile) => {
    setEditingId(profile.id);
    setFormState({
      name: profile.name,
      orcid: profile.orcid,
      focus: profile.focus,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormState(emptyForm);
  };

  const handleRemoveProfile = (id: string) => {
    setProfiles((prev) => prev.filter((profile) => profile.id !== id));
  };

  const updateMetrics = async (profile: FacultyProfile) => {
    setLoadingIds((prev) => [...prev, profile.id]);
    try {
      const publications = await fetchPublications([profile.name]);
      const metrics = calculateMetrics(publications);
      setProfiles((prev) =>
        prev.map((item) => (item.id === profile.id ? { ...item, ...metrics } : item)),
      );
    } finally {
      setLoadingIds((prev) => prev.filter((id) => id !== profile.id));
    }
  };

  const refreshAll = async () => {
    setGlobalStatus(null);
    for (const profile of profiles) {
      await updateMetrics(profile);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 px-8 py-10">
          <header className="mb-8">
            <h2 className="text-3xl font-semibold text-slate-900">Faculty Profiles</h2>
            <p className="mt-2 text-sm text-slate-500">
              Track faculty expertise, recent outputs, and research themes in one place.
            </p>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Active Faculty
                </h3>
                <p className="text-sm text-slate-500">
                  {profiles.length} profiles synced with publication data.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                <input
                  type="text"
                  placeholder="Search faculty or keywords"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 lg:w-72"
                />
                <button
                  type="button"
                  onClick={refreshAll}
                  className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
                >
                  Refresh Metrics
                </button>
              </div>
            </div>
            {globalStatus ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {globalStatus}
              </div>
            ) : null}
          </section>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="text-lg font-semibold text-slate-900">Add Faculty</h4>
              <p className="mt-2 text-sm text-slate-500">
                Store core details locally and sync metrics with PubMed on demand.
              </p>
              <div className="mt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Name</label>
                  <input
                    type="text"
                    value={formState.name}
                    onChange={(event) => handleFormChange("name", event.target.value)}
                    placeholder="Dr. Jordan Lee"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    ORCID
                  </label>
                  <input
                    type="text"
                    value={formState.orcid}
                    onChange={(event) => handleFormChange("orcid", event.target.value)}
                    placeholder="0000-0002-1825-0097"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Research Focus
                  </label>
                  <textarea
                    rows={4}
                    value={formState.focus}
                    onChange={(event) => handleFormChange("focus", event.target.value)}
                    placeholder="Simulation-based education, clinical decision-making"
                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddProfile}
                  className="w-full rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {editingId ? "Save Changes" : "Save Profile"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="w-full rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300"
                  >
                    Cancel Editing
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-4">
              {filteredProfiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
                  No faculty profiles yet. Add a profile to start tracking metrics.
                </div>
              ) : (
                filteredProfiles.map((profile) => {
                  const isLoading = loadingIds.includes(profile.id);
                  return (
                    <article
                      key={profile.id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-lg font-semibold text-slate-900">
                            {profile.name}
                          </h4>
                          <p className="mt-1 text-sm text-slate-500">
                            {profile.focus || "No focus area provided yet."}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          ORCID {profile.orcid || "Not set"}
                        </span>
                      </div>

                      <div className="mt-6 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Publications
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {profile.publications}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Citations
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {profile.citations}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">
                            Last Publication
                          </p>
                          <p className="mt-1 text-lg font-semibold text-slate-900">
                            {profile.lastPublication}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                        <span>Local profile stored in browser</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateMetrics(profile)}
                            disabled={isLoading}
                            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {isLoading ? "Syncing..." : "Sync Metrics"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditProfile(profile)}
                            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveProfile(profile.id)}
                            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-300"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
