import { useEffect, useMemo, useState } from "react";

// Updated connector
export function LastfmConnector({
  onMaxPlaycount,
  setUsername,
  setMaxPlaycount,
  username,
  maxPlaycount,
}: {
  onMaxPlaycount: (n: number) => void;
  setUsername: (n: string | null) => void;
  setMaxPlaycount: (n: number | null) => void;
  username: string | null;
  maxPlaycount: number | null;
}) {
  const [input, setInput] = useState(username ?? "");
  const [status, setStatus] = useState<string>("");

  const fetchAndApply = async () => {
    const val = (input || username || "").trim();
    if (!val) {
      setStatus("Enter a Last.fm username");
      return;
    }
    setMaxPlaycount(null);
    setStatus("Fetching…");
    setUsername(val);
    try {
      const res = await fetch(
        `/api/lastfm/max-playcount?user=${encodeURIComponent(val)}`
      );
      if (!res.ok) {
        setStatus("Server error");
        return;
      }
      const data = await res.json();
      const max =
        typeof data.maxPlaycount === "number" ? data.maxPlaycount : null;
      if (max == null) {
        setStatus("No data");
        return;
      }
      onMaxPlaycount(max);
      setMaxPlaycount(max);
      setStatus(`${val} has ${max} scribbles`);
    } catch (e) {
      setStatus("Error fetching");
    }
  };

  return (
    <div>
      <div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Last.fm username"
        />
        <button onClick={fetchAndApply}>Fetch</button>
      </div>
      <small>{status}</small>
      {/* {maxPlaycount != null && <p>Stored Max Playcount: {maxPlaycount}</p>} */}
    </div>
  );
}
