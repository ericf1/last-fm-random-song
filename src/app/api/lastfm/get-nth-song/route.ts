/**
 * GET /api/lastfm/track-by-index
 * Query params: user, n, maxPlaycount
 *
 * Adds Spotify lookup (link + id + preview) for the fetched track.
 */

import { NextRequest, NextResponse } from "next/server";

type LastFmTrack = {
  artist: { "#text": string };
  name: string;
  album: { "#text": string };
  image: Array<{ "#text": string; size: string }>;
  date?: { uts: string; "#text": string };
};

// ---- Spotify helpers ----
let cachedSpotifyToken: { access_token: string; expires_at: number } | null =
  null;

async function getSpotifyAccessToken() {
  if (
    cachedSpotifyToken &&
    Date.now() < cachedSpotifyToken.expires_at - 15_000 // refresh 15s early
  ) {
    return cachedSpotifyToken.access_token;
  }
  const cid = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!cid || !secret) {
    // If missing, we’ll just skip Spotify enrichment gracefully.
    throw new Error("Missing Spotify credentials");
  }
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${cid}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    // Short cache—tokens typically last ~3600s
    next: { revalidate: 300 },
  });
  if (!resp.ok) {
    throw new Error(`Spotify token error: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };
  cachedSpotifyToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

function normalizeTitleForQuery(title: string) {
  // Remove common suffixes like " - Radio Edit", " - Remastered 2014", "(feat. …)" etc.
  // Keep this conservative to avoid nuking real titles.
  return title
    .replace(
      /\s*-\s*(radio edit|remaster(?:ed)?(?: \d{4})?|live|mono|stereo).*$/i,
      ""
    )
    .replace(
      /\s*\((feat\.?|with|vs\.?|version|remaster(?:ed)?(?: \d{4})?)\b.*?\)\s*$/i,
      ""
    )
    .trim();
}

async function findSpotifyTrack(
  artist: string,
  title: string,
  market = "US"
): Promise<{
  id: string;
  url: string;
  preview_url: string | null;
  name: string;
  artists: string[];
} | null> {
  const token = await getSpotifyAccessToken();
  const cleaned = normalizeTitleForQuery(title);

  // Strong query: track + artist
  const q = `track:"${cleaned}" artist:"${artist}"`;
  const params = new URLSearchParams({
    q,
    type: "track",
    limit: "1",
    market,
  });

  const resp = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
  });

  if (!resp.ok) {
    // Soft-fail: just return null if Spotify is unhappy (rate limit, etc.)
    return null;
  }
  const data = (await resp.json()) as any;
  const t = data?.tracks?.items?.[0];
  if (!t) return null;

  return {
    id: t.id,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    preview_url: t.preview_url ?? null,
    name: t.name,
    artists: Array.isArray(t.artists) ? t.artists.map((a: any) => a.name) : [],
  };
}

// ---- Route ----
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
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

    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) {
      console.error("LASTFM_API_KEY is not configured on the server.");
      return NextResponse.json(
        { error: "Server misconfigured: Missing API key" },
        { status: 500 }
      );
    }

    const limit = 200;
    const nFromLatest = maxPlaycount - n + 1;
    const page = Math.floor((nFromLatest - 1) / limit) + 1;
    const indexInPage = (nFromLatest - 1) % limit;

    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "user.getRecentTracks");
    url.searchParams.set("user", user);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      next: { revalidate: 300 }, // 5 min
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
    const track: LastFmTrack | undefined =
      data?.recenttracks?.track?.[indexInPage];

    if (!track) {
      return NextResponse.json(
        { error: "Track not found at the specified index." },
        { status: 404 }
      );
    }

    // --- Spotify enrichment (best-effort; never blocks success) ---
    let spotify: Awaited<ReturnType<typeof findSpotifyTrack>> = null;
    try {
      const artistName = track.artist?.["#text"]?.trim() ?? "";
      const title = track.name?.trim() ?? "";
      if (artistName && title) {
        spotify = await findSpotifyTrack(artistName, title, "US");
      }
    } catch {
      // swallow Spotify errors to avoid failing the whole request
      spotify = null;
    }

    return NextResponse.json(
      {
        track,
        spotify, // { id, url, preview_url, name, artists } | null
      },
      {
        headers: {
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
