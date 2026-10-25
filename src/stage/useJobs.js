import { useEffect, useState } from "react";
import { apiRequest } from "../api";
import { JOBS_API_URL, normalizeJobs } from "./model";

/** Loads the signed-in user's jobs and polls every 10 seconds. */
export default function useJobs(auth, refreshKey) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const token = auth.user?.access_token;
  const signedIn = Boolean(auth.isAuthenticated && token);

  useEffect(() => {
    if (!signedIn) return undefined;

    let active = true;
    let inFlight = false;

    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await apiRequest(JOBS_API_URL, token);
        if (active) {
          setJobs(normalizeJobs(result));
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }

    load();
    const id = window.setInterval(load, 10000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [signedIn, token, refreshKey, retry]);

  return {
    jobs: signedIn ? jobs : [],
    loading: signedIn && loading,
    error: signedIn ? error : "",
    reload: () => setRetry((value) => value + 1),
  };
}
