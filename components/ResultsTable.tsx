import type { Publication, PublicationSource } from "@/lib/publicationService";

type ResultsTableProps = {
  publications: Publication[];
};

const sourceStyles: Record<PublicationSource, string> = {
  PubMed: "bg-blue-100 text-blue-800",
  Scopus: "bg-orange-100 text-orange-800",
  "Web of Science": "bg-purple-100 text-purple-800",
};

const getSources = (publication: Publication) =>
  publication.sources && publication.sources.length > 0
    ? publication.sources
    : [publication.source];

export default function ResultsTable({ publications }: ResultsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Authors</th>
            <th className="px-4 py-2">Journal</th>
            <th className="px-4 py-2">Found In</th>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Times Cited</th>
            <th className="px-4 py-2">AI Publication Type</th>
          </tr>
        </thead>
        <tbody>
          {publications.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500"
              >
                No results yet. Run a search to preview data.
              </td>
            </tr>
          ) : (
            publications.map((publication, index) => {
              const sources = getSources(publication);
              const sourceUrls = publication.sourceUrls ?? {};
              const rowKey =
                publication.doi ??
                publication.url ??
                publication.id ??
                publication.title ??
                "publication";
              return (
                <tr
                  key={`${rowKey}-${index}`}
                  className="rounded-lg bg-slate-50/70 text-slate-700 shadow-sm"
                >
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {publication.url ? (
                      <a
                        href={publication.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-900 underline decoration-slate-300 underline-offset-2 transition hover:text-slate-700"
                      >
                        {publication.title}
                      </a>
                    ) : (
                      publication.title
                    )}
                  </td>
                  <td className="px-4 py-3">{publication.authors}</td>
                  <td className="px-4 py-3">{publication.journal}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {sources.map((source) => {
                        const sourceUrl = sourceUrls[source];
                        const badge = (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${sourceStyles[source]}`}
                          >
                            {source}
                          </span>
                        );
                        if (!sourceUrl) {
                          return (
                            <span key={`${publication.id}-${source}`} className="inline-flex">
                              {badge}
                            </span>
                          );
                        }
                        return (
                          <a
                            key={`${publication.id}-${source}`}
                            href={sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex"
                          >
                            {badge}
                          </a>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">{publication.date}</td>
                  <td className="px-4 py-3 text-center">
                    {publication.citationCount}
                  </td>
                  <td className="px-4 py-3">{publication.aiPublicationType}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
