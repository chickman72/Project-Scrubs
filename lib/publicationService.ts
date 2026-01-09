export type PublicationType = "Primary Research" | "Review";
export type PublicationSource = "PubMed" | "Scopus" | "Web of Science";

export type Publication = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  date: string;
  citationCount: number;
  aiPublicationType: PublicationType;
  abstract: string;
  source: PublicationSource;
};

const mockPublications: Publication[] = [
  {
    id: "mock-001",
    title: "Simulation-Based Learning and Clinical Readiness in Undergraduate Nursing",
    authors: "Jordan Lee, Maria Alvarez, Priya Shah",
    journal: "Journal of Nursing Education",
    date: "2023-06-12",
    citationCount: 34,
    aiPublicationType: "Primary Research",
    abstract:
      "A multi-site study assessing the impact of simulation-based learning on clinical readiness scores among undergraduate nursing cohorts.",
    source: "PubMed",
  },
  {
    id: "mock-002",
    title: "Evidence-Based Interventions for Nurse Burnout: A Systematic Review",
    authors: "Amelia Grant, Kelvin Brooks",
    journal: "Nursing Outlook",
    date: "2022-11-03",
    citationCount: 57,
    aiPublicationType: "Review",
    abstract:
      "This systematic review synthesizes evidence-based interventions that reduce burnout and improve retention among registered nurses.",
    source: "PubMed",
  },
  {
    id: "mock-003",
    title: "Telehealth Adoption in Rural Maternal Care",
    authors: "Priya Shah, Thomas Nguyen, Jordan Lee",
    journal: "Telemedicine and e-Health",
    date: "2024-02-19",
    citationCount: 12,
    aiPublicationType: "Primary Research",
    abstract:
      "A longitudinal cohort analysis measuring telehealth adoption and maternal outcomes across rural health networks.",
    source: "PubMed",
  },
];

const inferPublicationType = (abstract: string): PublicationType => {
  const normalized = abstract.toLowerCase();
  if (
    normalized.includes("systematic review") ||
    normalized.includes("meta-analysis") ||
    normalized.includes("scoping review")
  ) {
    return "Review";
  }
  return "Primary Research";
};

export async function classifyPaper(abstract: string): Promise<PublicationType> {
  const {
    LITELLM_BASE_URL,
    LITELLM_API_KEY,
  } = process.env;

  if (LITELLM_BASE_URL && LITELLM_API_KEY) {
    try {
      const response = await fetch(`${LITELLM_BASE_URL.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LITELLM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You label abstracts as either Primary Research or Review. Reply with exactly one of those labels.",
            },
            {
              role: "user",
              content: `Abstract:\\n${abstract}`,
            },
          ],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = data.choices?.[0]?.message?.content?.trim() ?? "";
        if (content === "Primary Research" || content === "Review") {
          return content;
        }
      }
    } catch {
      // Fall back to heuristic.
    }
  }

  return inferPublicationType(abstract);
}

export type PublicationResult = {
  publications: Publication[];
  errors: string[];
};

export async function fetchPublications(
  facultyNames: string[],
  startDate?: string,
  endDate?: string,
): Promise<PublicationResult> {
  const useMock = process.env.NEXT_PUBLIC_USE_MOCK_PUBLICATIONS === "true";
  if (useMock) {
    return { publications: mockPublications, errors: [] };
  }

  const requestBody = JSON.stringify({ facultyNames, startDate, endDate });
  const headers = { "Content-Type": "application/json" };

  const [pubmedResult, scopusResult, wosResult] = await Promise.allSettled([
    fetch("/api/pubmed", { method: "POST", headers, body: requestBody }),
    fetch("/api/scopus", { method: "POST", headers, body: requestBody }),
    fetch("/api/wos", { method: "POST", headers, body: requestBody }),
  ]);

  const errors: string[] = [];
  const responses: { source: PublicationSource; response: Response }[] = [];

  if (pubmedResult.status === "fulfilled") {
    responses.push({ source: "PubMed", response: pubmedResult.value });
  } else {
    const message =
      pubmedResult.reason instanceof Error
        ? pubmedResult.reason.message
        : "Network error";
    errors.push(`PubMed request failed: ${message}`);
  }

  if (scopusResult.status === "fulfilled") {
    responses.push({ source: "Scopus", response: scopusResult.value });
  } else {
    const message =
      scopusResult.reason instanceof Error
        ? scopusResult.reason.message
        : "Network error";
    errors.push(`Scopus request failed: ${message}`);
  }

  if (wosResult.status === "fulfilled") {
    responses.push({ source: "Web of Science", response: wosResult.value });
  } else {
    const message =
      wosResult.reason instanceof Error
        ? wosResult.reason.message
        : "Network error";
    errors.push(`Web of Science request failed: ${message}`);
  }

  if (responses.length === 0) {
    return {
      publications: [],
      errors: errors.length > 0 ? errors : ["Unable to reach any data source."],
    };
  }

  const publications: Publication[] = [];

  for (const { source, response } of responses) {
    if (!response.ok) {
      const errorBody = await response.text();
      errors.push(
        `${source} request failed (${response.status}): ${errorBody || "Unknown error"}`,
      );
      continue;
    }
    const data = (await response.json()) as { publications?: Publication[] };
    publications.push(...(data.publications ?? []));
  }

  if (publications.length === 0 && errors.length > 0) {
    return { publications: [], errors };
  }

  const seen = new Set<string>();
  const deduped: Publication[] = [];
  for (const publication of publications) {
    const key = `${publication.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${publication.date}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(publication);
  }

  // TODO: Merge, dedupe, and enrich results with citations and AI classifications.

  return { publications: deduped, errors };
}
