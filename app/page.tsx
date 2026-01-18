"use client";

import { useState } from "react";
import { fetchPublications, type Publication } from "@/lib/publicationService";
import { fetchiCiteData } from "@/lib/iCiteService";
import { MetricsEngine } from "@/lib/metricsEngine";
import { benchmarks } from "@/lib/benchmarks";
import Sidebar from "@/components/Sidebar";
import ResultsTable from "@/components/ResultsTable";

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
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [summaryMetrics, setSummaryMetrics] = useState<{
    hIndex: number;
    weightedRcr: number;
    rcrCount: number;
    pubmedCount: number;
  } | null>(null);

  const handleChange = (field: keyof SearchState, value: string) => {
    setSearch((prev) => ({ ...prev, [field]: value }));
  };

  const handleSearch = async () => {
    const names = search.facultyNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    setIsLoading(true);
    setErrorMessages([]);
    setSummaryMetrics(null);
    try {
      const { publications, errors } = await fetchPublications(
        names,
        search.startDate,
        search.endDate,
      );
      const pubmedPmids = publications
        .filter((publication) => publication.sources?.includes("PubMed") || publication.source === "PubMed")
        .map((publication) => publication.id);
      const rcrMap = await fetchiCiteData(pubmedPmids);
      let rcrCount = 0;
      const enrichedPublications = publications.map((publication) => {
        if (publication.sources?.includes("PubMed") || publication.source === "PubMed") {
          const rcr = rcrMap.get(publication.id);
          if (typeof rcr === "number") {
            rcrCount += 1;
            return { ...publication, rcr };
          }
        }
        return publication;
      });
      const pubmedCount = pubmedPmids.length;
      const hIndex = MetricsEngine.calculateHIndex(enrichedPublications);
      const weightedRcr = MetricsEngine.calculateWeightedRCR(enrichedPublications);
      setResults(enrichedPublications);
      setErrorMessages(errors);
      setSummaryMetrics({ hIndex, weightedRcr, rcrCount, pubmedCount });
      if (publications.length === 0 && errors.length === 0) {
        setErrorMessages(["No results found for the selected filters."]);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to fetch publications.";
      setErrorMessages([message]);
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
                    Pulling PubMed, Scopus, and Web of Science publications...
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

          {summaryMetrics ? (
            <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Summary</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Aggregated impact metrics across all returned publications.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">H-Index</p>
                    <p className="text-2xl font-semibold text-slate-900">{summaryMetrics.hIndex}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Weighted RCR
                    </p>
                    <p className="text-2xl font-semibold text-slate-900">
                      {summaryMetrics.weightedRcr.toFixed(2)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {summaryMetrics.rcrCount}/{summaryMetrics.pubmedCount} PubMed papers matched in iCite
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-600 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tenure Track Benchmarks
                  </p>
                  <p className="mt-2">
                    Assistant: h={benchmarks.tenureTrack.assistant.hIndex} · Associate:
                    h={benchmarks.tenureTrack.associate.hIndex} · Professor:
                    h={benchmarks.tenureTrack.professor.hIndex}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Non-Tenure Benchmarks
                  </p>
                  <p className="mt-2">
                    Assistant: h={benchmarks.nonTenure.assistant.hIndex} · Associate:
                    h={benchmarks.nonTenure.associate.hIndex} · Professor:
                    h={benchmarks.nonTenure.professor.hIndex}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Results</h3>
              <span className="text-sm text-slate-500">
                {results.length} publication{results.length === 1 ? "" : "s"}
              </span>
            </div>
            {errorMessages.length > 0 ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {errorMessages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            ) : null}
            <ResultsTable publications={results} />
          </section>
        </main>
      </div>
    </div>
  );
}
