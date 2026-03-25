import { NextResponse } from "next/server";

type BluelyticsLatest = {
  blue?: { value_avg?: number };
  last_update?: string;
};

export async function GET() {
  try {
    const res = await fetch("https://api.bluelytics.com.ar/v2/latest", {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "upstream" }, { status: 502 });
    }
    const data = (await res.json()) as BluelyticsLatest;
    const blueAvg = data?.blue?.value_avg;
    if (typeof blueAvg !== "number" || !Number.isFinite(blueAvg) || blueAvg <= 0) {
      return NextResponse.json({ error: "parse" }, { status: 502 });
    }
    return NextResponse.json({
      blueAvg,
      lastUpdate: data.last_update ?? null,
    });
  } catch {
    return NextResponse.json({ error: "fetch" }, { status: 502 });
  }
}
