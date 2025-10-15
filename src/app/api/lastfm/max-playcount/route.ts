/**
 * @file This Next.js API route fetches a user's total track playcount from Last.fm.
 * It uses the user.getinfo method as an efficient way to get this statistic.
 *
 * It acts as a secure proxy to hide the LASTFM_API_KEY from the client.
 *
 * @endpoint GET /api/lastfm/max-playcount
 * @param {string} user - The Last.fm username.
 * @returns {object} A JSON object containing the user's max playcount or an error.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // --- 1. Validate Input Parameters ---
    const user = searchParams.get("user");
    if (!user) {
      return NextResponse.json(
        { error: "Missing required parameter: user" },
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

    // --- 3. Fetch Data from Last.fm API ---
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "user.getinfo");
    url.searchParams.set("user", user);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), {
      next: { revalidate: 300 }, // Cache the response for 5 minutes
    });

    if (!response.ok) {
      console.error(
        `Last.fm API error: ${response.status} ${response.statusText}`
      );
      // If the user is not found, Last.fm returns a 404
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Last.fm user not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Error fetching data from Last.fm API" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Safely access the playcount, which Last.fm provides as a string.
    const playcountString = data?.user?.playcount;

    if (playcountString === undefined || playcountString === null) {
      return NextResponse.json(
        { error: "Could not find playcount for the specified user." },
        { status: 404 }
      );
    }

    const maxPlaycount = Number(playcountString);

    if (isNaN(maxPlaycount)) {
      return NextResponse.json(
        { error: "Invalid playcount format received from Last.fm" },
        { status: 500 }
      );
    }

    // --- 4. Return the Max Playcount ---
    return NextResponse.json(
      { maxPlaycount },
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
