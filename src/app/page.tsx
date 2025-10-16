"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

type Track = {
  track?: {
    artist: { "#text": string };
    name: string;
    album: { "#text": string };
    image: Array<{ "#text": string; size: string }>;
    date?: { uts: string; "#text": string };
    url: string;
  };
  spotify?: {
    id: string;
    url: string;
    preview?: string;
  };
};

export default function SlotDemo() {
  const initialDigits = [0, 0, 0, 0, 0, 0, 0];
  const [slotLength] = useState<number>(initialDigits.length);
  const [targets, setTargets] = useState<number[]>([...initialDigits]);

  const [username, setUsername] = useState<string | null>(null);
  const [maxPlaycount, setMaxPlaycount] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");

  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const [spinSignals, setSpinSignals] = useState<number[]>(
    Array(slotLength).fill(0)
  );
  const [cursor, setCursor] = useState<number>(-1);

  const spinRandom = useCallback(async () => {
    if (!username) {
      setStatus("Enter a Last.fm username");
      return;
    }

    setLoading(true);

    // 1) Get maxPlaycount (use existing value if present; otherwise fetch)
    let localMax = maxPlaycount;

    try {
      setUsername(username);
      setMaxPlaycount(null);
      setTrack(null);
      setStatus("Fetching…");

      const res = await fetch(
        `/api/lastfm/max-playcount?user=${encodeURIComponent(username)}`
      );

      if (!res.ok) {
        setStatus("Server error");
        return;
      }

      const data = await res.json();
      localMax =
        typeof data.maxPlaycount === "number" ? data.maxPlaycount : null;

      if (localMax == null) {
        setStatus("No data");
        return;
      }

      setMaxPlaycount(localMax);
      setStatus(`${username} has ${localMax} scribbles`);
    } catch {
      setStatus("Error fetching");
      return;
    } finally {
      // don't stop loading yet; we still need to fetch the nth track
    }

    // 2) Pick a random index (bounded by max if available)
    let random = Math.floor(Math.random() * 9_999_999);
    if (localMax) {
      random = Math.floor(Math.random() * Math.max(1, localMax));
    }

    // 3) Build the reel digits (left-pad with zeros to slotLength)
    let rand = String(random).split("").map(Number);
    if (rand.length < slotLength) {
      rand = Array(slotLength - rand.length)
        .fill(0)
        .concat(rand);
    }

    // 4) Fetch the nth track
    try {
      const params = new URLSearchParams({
        user: username,
        n: String(random),
        maxPlaycount: String(localMax ?? ""),
      });
      const res = await fetch(`/api/lastfm/get-nth-song?${params.toString()}`);
      const data = await res.json();
      setTrack(data ?? null);
    } catch {
      // optional: setStatus("Error fetching track");
    } finally {
      setLoading(false);
    }

    // 5) Update reels and cursor
    setTargets(rand);
    setSpinSignals((prev) => prev.map(() => Date.now()));
    setCursor(-1);
  }, [
    username,
    maxPlaycount,
    slotLength,
    setStatus,
    setUsername,
    setMaxPlaycount,
    setTrack,
    setLoading,
    setTargets,
    setSpinSignals,
    setCursor,
  ]);

  useEffect(() => {
    const spinCurrent = async () => {
      // if we dont have maxPlacount dont do anything
      if (!maxPlaycount || !username) {
        return;
      }
      setLoading(true);

      let localMax = maxPlaycount;
      if (username) {
        try {
          setUsername(username);
          setMaxPlaycount(null);
          setTrack(null);
          setStatus("Fetching…");

          const res = await fetch(
            `/api/lastfm/max-playcount?user=${encodeURIComponent(username)}`
          );

          if (!res.ok) {
            setStatus("Server error");
            return;
          }

          const data = await res.json();
          localMax =
            typeof data.maxPlaycount === "number" ? data.maxPlaycount : null;

          if (localMax == null) {
            setStatus("No data");
            return;
          }

          setMaxPlaycount(localMax);
          setStatus(`${username} has ${localMax} scrobbles`);
        } catch {
          setStatus("Error fetching");
          return;
        } finally {
          // don't stop loading yet; we still need to fetch the nth track
        }
      }

      const currentNumber = targets.reduce(
        (acc, digit, i) => acc + digit * 10 ** (slotLength - i - 1),
        0
      );

      // if current number is greater than maxPlaycount, clamp to maxPlaycount
      const clampedNumber =
        maxPlaycount != null
          ? Math.min(currentNumber, Math.max(1, maxPlaycount))
          : currentNumber;

      // if current number is 0, set to 1
      const finalNumber = clampedNumber === 0 ? 1 : clampedNumber;

      // call server to get track
      const track = await fetch(
        `/api/lastfm/get-nth-song?user=${encodeURIComponent(
          username || ""
        )}&n=${finalNumber}&maxPlaycount=${maxPlaycount}`
      )
        .then((res) => res.json())
        .then((data) => data.track)
        .finally(() => setLoading(false));

      setTrack(track);
      setSpinSignals((prev) => prev.map(() => Date.now()));
      // set targets to finalNumber
      const digits = String(finalNumber)
        .split("")
        .map((d) => Number(d));
      const padded = digits.slice(-slotLength);
      const leftPad = Array(Math.max(0, slotLength - padded.length))
        .fill(0)
        .concat(padded);
      setTargets(leftPad);
      setCursor(-1);
    };

    function isEditingOrSelecting() {
      const ae = document.activeElement as HTMLElement | null;
      const isFormField =
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          (ae as HTMLInputElement).isContentEditable ||
          ae.closest('[contenteditable="true"]'));

      const sel = window.getSelection?.();
      const hasRangeSelection =
        !!sel && sel.type === "Range" && sel.toString().length > 0;

      return Boolean(isFormField || hasRangeSelection);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditingOrSelecting()) return;

      // Move cursor left/right; clamp to [0, slotLength]
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, -1));
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, slotLength));
        return;
      }
      // Optional: jump to ends
      // if (e.key === "Home") {
      //   e.preventDefault();
      //   setCursor(0);
      //   return;
      // }
      // if (e.key === "End") {
      //   e.preventDefault();
      //   setCursor(slotLength);
      //   return;
      // }

      if (e.key >= "0" && e.key <= "9") {
        if (cursor < slotLength) {
          const val = parseInt(e.key, 10);
          setTargets((prev) => {
            const next = [...prev];
            next[cursor] = val;
            return next;
          });
          setSpinSignals((prev) => {
            const next = [...prev];
            next[cursor] = Date.now();
            return next;
          });
          setCursor((c) => Math.min(c + 1, slotLength));
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (cursor > 0) {
          const idx = cursor - 1;
          setTargets((prev) => {
            const next = [...prev];
            next[idx] = 0;
            return next;
          });
          setSpinSignals((prev) => {
            const next = [...prev];
            next[idx] = Date.now();
            return next;
          });
          setCursor((c) => Math.max(c - 1, 0));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        spinCurrent();
      } else if (e.code === "Space") {
        e.preventDefault();
        spinRandom();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    cursor,
    slotLength,
    setCursor,
    setTargets,
    setSpinSignals,
    spinRandom,
    maxPlaycount,
    username,
    targets,
    initialDigits.length,
  ]);

  // const applyNumberToReels = (n: number) => {
  //   const digits = String(Math.max(0, Math.floor(n)))
  //     .split("")
  //     .map((d) => Number(d));
  //   const padded = digits.slice(-slotLength); // take rightmost digits if longer
  //   const leftPad = Array(Math.max(0, slotLength - padded.length))
  //     .fill(0)
  //     .concat(padded);
  //   setTargets(leftPad);
  //   setSpinSignals((prev) => prev.map(() => Date.now()));
  //   setCursor(slotLength);
  // };

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      tabIndex={0}
      className="flex flex-col items-center justify-center w-screen h-screen p-4 bg-black text-neutral-100 focus:outline-none"
    >
      <div className="fixed top-4 right-4 text-sm text-neutral-500">
        Favicon from{" "}
        <motion.a
          href="https://www.flaticon.com/free-icons/slot-machine"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/70 underline"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
        >
          Freepik
        </motion.a>
      </div>
      {/* 1. Title fades in first */}
      <div className="text-center mb-8">
        <motion.h1
          className="text-5xl font-extrabold tracking-tight text-white"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          slotfm
        </motion.h1>
        <p className="text-neutral-500 text-sm mt-1">
          Spin a random track from your Last.fm history
        </p>

        <motion.p
          className="text-neutral-400 mt-3 max-w-xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          Enter your <span className="text-white/80 font-medium">Last.fm</span>{" "}
          username and press{" "}
          <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-white/70 text-sm">
            Space
          </kbd>{" "}
          or click <span className="text-white/80 font-medium">Spin</span> to
          get a scrobble.
          <br />
          Use{" "}
          <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-white/70 text-sm">
            ←
          </kbd>{" "}
          <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-white/70 text-sm">
            →
          </kbd>{" "}
          to move the cursor,
          <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-white/70 text-sm">
            Backspace
          </kbd>{" "}
          to edit, and{" "}
          <kbd className="px-1 py-0.5 bg-neutral-800 rounded text-white/70 text-sm">
            Enter
          </kbd>{" "}
          to confirm.
          <br />
          <span className="text-neutral-500 text-sm block mt-2">
            Built by{" "}
            <motion.a
              href="https://github.com/ericf1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/70 underline"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              ericf1
            </motion.a>
          </span>
        </motion.p>
      </div>

      {/* 2. LastfmConnector fades in second */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="flex flex-col items-center gap-2"
      >
        {/* <LastfmConnector
          onMaxPlaycount={applyNumberToReels}
          setUsername={setUsername}
          setMaxPlaycount={setMaxPlaycount}
          username={username}
          maxPlaycount={maxPlaycount}
        /> */}
        <input
          value={username ?? ""}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              spinRandom();
            }
            if (inputRef.current && e.key === "Enter") {
              inputRef.current.blur();
            }
          }}
          placeholder="Last.fm username"
          className="w-full max-w-xs bg-transparent border-b border-neutral-700 py-2 text-center text-lg text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
          ref={inputRef}
        />
        <small>{status}</small>
        <button
          onClick={spinRandom}
          disabled={loading}
          className="px-5 py-2 mt-6 font-semibold bg-neutral-800 rounded-md hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          Spin
        </button>
      </motion.div>

      {/* 3. Main controls fade in only AFTER username is set */}
      <AnimatePresence>
        {username && maxPlaycount && (
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.4, delay: 0.2 }} // Quick delay for a smooth handoff
          >
            <div className="flex gap-2.5 mt-5">
              {Array.from({ length: slotLength }).map((_, i) => (
                <div key={i} className="relative">
                  <SlotReel
                    index={i}
                    target={targets[i]}
                    loading={loading}
                    spinSignal={spinSignals[i]} // Add this prop
                  />
                  {cursor === i && (
                    <motion.div
                      className="absolute top-0 bottom-0 -left-1 -right-1 border-2 border-red-500"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 4. Track result fades in only AFTER a spin is complete */}
            <div className="relative mt-5">
              {/* 1. INVISIBLE PLACEHOLDER */}
              {/* This div has the same structure as your content. Its only job
      is to take up space in the layout so nothing below it moves.
      The `invisible` class makes it take up space without being seen. */}
              <div
                className="flex flex-col items-center gap-3 text-center invisible"
                aria-hidden="true"
              >
                <div className="w-24 h-24 rounded-md" />
                <div>
                  <p className="font-bold">Artist Name - Longest Track Name</p>
                  <p className="text-sm text-neutral-400">
                    Longest Album Title Possible
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Formatted Date Text
                  </p>
                </div>
              </div>

              {/* 2. ANIMATED CONTENT (POSITIONED ON TOP) */}
              {/* This div is absolutely positioned to fill the space created
      by the placeholder above. Your content animates inside it. */}
              <div className="absolute inset-0 flex justify-center">
                <AnimatePresence mode="popLayout">
                  {track && (
                    <motion.div
                      key={track?.track?.name}
                      className="flex flex-col items-center gap-3 text-center"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                    >
                      {track.track?.image?.[2]?.["#text"] && (
                        <a
                          href={track.spotify?.url ?? track.track?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Image
                            src={track.track?.image[2]["#text"]} // e.g. https://lastfm.freetls.fastly.net/i/u/...
                            alt="Album Art"
                            width={96}
                            height={96} // matches w-24 h-24
                            className="rounded-md shadow-lg object-cover"
                            priority={false}
                          />
                        </a>
                      )}

                      <div>
                        <a
                          href={track.spotify?.url ?? track.track?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold"
                        >
                          {track.track?.artist?.["#text"]} - {track.track?.name}
                        </a>
                        {track.track?.album?.["#text"] && (
                          <p className="text-sm text-neutral-400">
                            {track.track?.album["#text"]}
                          </p>
                        )}
                        {track.track?.date?.["#text"] && (
                          <p className="text-xs text-neutral-500 mt-1">
                            {track.track?.date["#text"]}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A helper hook to get the previous value of a prop or state.
 * This is useful for detecting changes in props, like when `loading`
 * transitions from true to false.
 */
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

function SlotReel({
  index,
  target,
  loading,
  spinSignal,
}: {
  index: number;
  target: number;
  loading: boolean;
  spinSignal: number;
}) {
  const [currentDigit, setCurrentDigit] = useState(target);
  const prevLoading = usePrevious(loading);
  const prevSpinSignal = usePrevious(spinSignal);

  const intervalRef = useRef<number | null>(null);
  const startTimeoutRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const loadingStarted = loading && !prevLoading;
    const loadingStopped = !loading && prevLoading;
    const signalChanged =
      prevSpinSignal !== undefined && spinSignal !== prevSpinSignal;

    // --- Global Spin START ---
    if (loadingStarted) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);

      startTimeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          setCurrentDigit((prev) => (prev + 1) % 10);
        }, 45 + (index % 3) * 10);
      }, index * 100);
    }

    // --- Global Spin STOP ---
    if (loadingStopped) {
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
      stopTimeoutRef.current = window.setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        setCurrentDigit(target);
      }, 300 + index * 150);
    }

    // --- Individual Spin SIGNAL ---
    if (signalChanged && !loading) {
      // CRITICAL FIX: Clear existing timers before starting a new one-shot spin.
      // This prevents orphaned intervals if signals arrive quickly (e.g., typing fast).
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);

      intervalRef.current = window.setInterval(() => {
        setCurrentDigit((prev) => (prev + 1) % 10);
      }, 50);

      stopTimeoutRef.current = window.setTimeout(() => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        setCurrentDigit(target);
      }, 250);
    }
  }, [loading, prevLoading, spinSignal, prevSpinSignal, target, index]);

  // Final Cleanup (no changes here)
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, []);

  return (
    // The JSX remains the same
    <div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentDigit}
          initial={{ rotateX: 90, opacity: 0, y: -6 }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          exit={{ rotateX: -90, opacity: 0, y: 6 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 22,
            mass: 0.7,
          }}
          style={{
            fontSize: "3rem",
            fontWeight: "bold",
            display: "inline-block",
            width: "1ch",
            textAlign: "center",
          }}
        >
          {currentDigit}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
