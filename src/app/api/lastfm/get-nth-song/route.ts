/**
 * @file This Next.js API route fetches a specific track from a user's Last.fm
 * listening history based on its reverse chronological index (n).
 *
 * It acts as a secure proxy to hide the LASTFM_API_KEY from the client.
 *
 * @endpoint GET /api/lastfm/track-by-index
 * @param {string} user - The Last.fm username.
 * @param {string} n - The reverse index of the track to fetch (e.g., n=1 is the most recent).
 * @param {string} maxPlaycount - The user's total track playcount.
 * @returns {object} A JSON object containing the requested track data or an error.
 */

import { NextRequest, NextResponse } from "next/server";

// A simplified type for the Last.fm track object to ensure type safety.
type LastFmTrack = {
  artist: { "#text": string };
  name: string;
  album: { "#text": string };
  image: Array<{ "#text": string; size: string }>;
  date?: { uts: string; "#text": string };
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // --- 1. Validate Input Parameters ---
    const user = searchParams.get("user");
    const nParam = searchParams.get("n");
    const maxPlaycountParam = searchParams.get("maxPlaycount");

    if (!user || !nParam || !maxPlaycountParam) {
      return NextResponse.json(
        { error: "Missing required parameters: user, n, maxPlaycount" },
        { status: 400 }
      );
    }

    const n = Number(nParam);
    const maxPlaycount = Number(maxPlaycountParam);

    if (isNaN(n) || isNaN(maxPlaycount) || n < 1 || n > maxPlaycount) {
      return NextResponse.json(
        { error: "Invalid 'n' or 'maxPlaycount' value" },
        { status: 400 }
      );
    }

    // --- 2. Securely Access API Key ---
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) {
      console.error("LASTFM_API_KEY is not configured on the server.");
      return NextResponse.json(
        { error: "Server misconfigured: Missing API key" },
        { status: 500 }
      );
    }

    // --- 3. Calculate Pagination for Last.fm API ---
    // The Last.fm API's getRecentTracks is paginated. We must calculate the correct
    // page and the track's index within that page to retrieve it.
    const limit = 200; // Last.fm's max limit per page for this endpoint
    const nFromLatest = maxPlaycount - n + 1; // Convert our random index 'n' to a chronological index
    const page = Math.floor((nFromLatest - 1) / limit) + 1;
    const indexInPage = (nFromLatest - 1) % limit;

    // --- 4. Fetch Data from Last.fm API ---
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "user.getRecentTracks");
    url.searchParams.set("user", user);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      next: { revalidate: 300 }, // Cache the response for 5 minutes
    });

    if (!response.ok) {
      console.error(
        `Last.fm API error: ${response.status} ${response.statusText}`
      );
      return NextResponse.json(
        { error: "Error fetching data from Last.fm API" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Safely access the track using the calculated index
    const track: LastFmTrack | undefined =
      data?.recenttracks?.track?.[indexInPage];

    if (!track) {
      return NextResponse.json(
        { error: "Track not found at the specified index." },
        { status: 404 }
      );
    }

    // --- 5. Return the Track Data ---
    return NextResponse.json(
      { track },
      {
        headers: {
          // Set browser and CDN caching policies
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("An unexpected error occurred in the API route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
