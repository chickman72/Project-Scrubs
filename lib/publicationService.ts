export type PublicationType = "Primary Research" | "Review";

export type Publication = {
  id: string;
  title: string;
  authors: string;
  journal: string;
  date: string;
  citationCount: number;
  aiPublicationType: PublicationType;
  abstract: string;
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
    AZURE_OPENAI_ENDPOINT,
    AZURE_OPENAI_API_KEY,
    AZURE_OPENAI_DEPLOYMENT_NAME,
  } = process.env;

  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !AZURE_OPENAI_DEPLOYMENT_NAME) {
    return inferPublicationType(abstract);
  }

  // TODO: Call Azure OpenAI with AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and
  // AZURE_OPENAI_DEPLOYMENT_NAME to classify the abstract.
  return inferPublicationType(abstract);
}

export async function fetchPublications(
  facultyNames: string[],
  startDate?: string,
  endDate?: string,
): Promise<Publication[]> {
  const hasPubMedKeys =
    Boolean(process.env.NEXT_PUBLIC_PUBMED_API_KEY) &&
    Boolean(process.env.NEXT_PUBLIC_PUBMED_BASE_URL);

  if (!hasPubMedKeys) {
    return mockPublications;
  }

  const response = await fetch("/api/pubmed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facultyNames, startDate, endDate }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `PubMed request failed (${response.status}): ${errorBody || "Unknown error"}`,
    );
  }

  const data = (await response.json()) as { publications?: Publication[] };
  const publications = data.publications ?? [];

  // TODO: Fetch Scopus publications using SCOPUS_BASE_URL and SCOPUS_API_KEY.
  // TODO: Fetch Web of Science publications using WOS_BASE_URL and WOS_API_KEY.
  // TODO: Merge, dedupe, and enrich results with citations and AI classifications.

  return publications;
}
