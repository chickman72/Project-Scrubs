"use client";

import { useState } from "react";
import { fetchPublications, type Publication } from "@/lib/publicationService";
import Sidebar from "@/components/Sidebar";

type SearchState = {
  startDate: string;
  endDate: string;
  facultyNames: string;
};

const initialSearch: SearchState = {
  startDate: "",
  endDate: "",
  facultyNames: "",
};

export default function Home() {
  const [search, setSearch] = useState<SearchState>(initialSearch);
  const [results, setResults] = useState<Publication[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (field: keyof SearchState, value: string) => {
    setSearch((prev) => ({ ...prev, [field]: value }));
  };

  const handleSearch = async () => {
    const names = search.facultyNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchPublications(names, search.startDate, search.endDate);
      setResults(data);
      if (data.length === 0) {
        setErrorMessage("No PubMed results found for the selected filters.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fetch publications.";
      setErrorMessage(message);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 px-8 py-10">
          <header className="mb-8">
            <h2 className="text-3xl font-semibold text-slate-900">
              Faculty Publication Dashboard
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Search across PubMed, Scopus, and Web of Science with AI-assisted
              classification.
            </p>
          </header>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="start-date">
                  Start Date
                </label>
                <input
                  id="start-date"
                  type="date"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={search.startDate}
                  onChange={(event) => handleChange("startDate", event.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="end-date">
                  End Date
                </label>
                <input
                  id="end-date"
                  type="date"
                  className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  value={search.endDate}
                  onChange={(event) => handleChange("endDate", event.target.value)}
                />
              </div>
            </div>

            <div className="mt-6">
              <label className="text-sm font-medium text-slate-700" htmlFor="faculty-names">
                Faculty Names (comma-separated)
              </label>
              <textarea
                id="faculty-names"
                rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-3 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="e.g., Jordan Lee, Maria Alvarez, Priya Shah"
                value={search.facultyNames}
                onChange={(event) => handleChange("facultyNames", event.target.value)}
              />
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Tip: Add multiple names to blend results from each data source.
              </p>
              <div className="flex items-center gap-3">
                {isLoading ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                    Pulling PubMed publications...
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoading ? "Searching..." : "Search"}
                </button>
              </div>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Results</h3>
              <span className="text-sm text-slate-500">
                {results.length} publication{results.length === 1 ? "" : "s"}
              </span>
            </div>
            {errorMessage ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {errorMessage}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Title</th>
                    <th className="px-4 py-2">Authors</th>
                    <th className="px-4 py-2">Journal</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Citation Count</th>
                    <th className="px-4 py-2">AI Publication Type</th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
                      >
                        No results yet. Run a search to preview data.
                      </td>
                    </tr>
                  ) : (
                    results.map((publication) => (
                      <tr
                        key={publication.id}
                        className="rounded-lg bg-slate-50/70 text-slate-700 shadow-sm"
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {publication.title}
                        </td>
                        <td className="px-4 py-3">{publication.authors}</td>
                        <td className="px-4 py-3">{publication.journal}</td>
                        <td className="px-4 py-3">{publication.date}</td>
                        <td className="px-4 py-3 text-center">
                          {publication.citationCount}
                        </td>
                        <td className="px-4 py-3">{publication.aiPublicationType}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
