import { NextResponse } from "next/server";
import { fetchFromScopus, type Publication } from "@/lib/publicationService";

type ScopusSearchRequest = {
  facultyNames: string[];
  startDate?: string;
  endDate?: string;
};

const isWithinDateRange = (
  publication: Publication,
  startDate?: string,
  endDate?: string,
) => {
  if (!startDate && !endDate) {
    return true;
  }
  const dateValue = publication.date;
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return true;
  }
  if (startDate) {
    const start = new Date(startDate);
    if (!Number.isNaN(start.getTime()) && parsedDate < start) {
      return false;
    }
  }
  if (endDate) {
    const end = new Date(endDate);
    if (!Number.isNaN(end.getTime()) && parsedDate > end) {
      return false;
    }
  }
  return true;
};

export async function POST(request: Request) {
  const { facultyNames, startDate, endDate } =
    (await request.json()) as ScopusSearchRequest;

  const names = (facultyNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (names.length === 0) {
    return NextResponse.json({ publications: [] });
  }

  const results = await Promise.all(names.map((name) => fetchFromScopus(name)));
  const publications = results
    .flat()
    .filter((publication) => isWithinDateRange(publication, startDate, endDate));

  return NextResponse.json({ publications });
}
