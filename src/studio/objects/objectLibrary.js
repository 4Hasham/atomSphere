import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { statusGroup } from "../../stage/model";

// What a property's Studio needs to furnish it: the signed-in user's jobs (objects being
// made or ready), and calls to start one and to get a signed link to a finished one.
// { jobs, jobsLoading, reload, getModelUrl(jobId), createObject(body), token }. Null
// outside properties.
export const ObjectLibraryContext = createContext(null);

export function useObjectLibrary() {
  return useContext(ObjectLibraryContext);
}

/** Jobs by id, for looking up each placed object's status. */
export function useJobsById() {
  const library = useObjectLibrary();
  return useMemo(() => new Map((library?.jobs ?? []).map((job) => [job.jobId, job])), [library?.jobs]);
}

/**
 * Signed links for the placed objects whose models are ready, fetched once each.
 * Returns { [jobId]: url | "error" }.
 */
export function useModelUrls(objects) {
  const library = useObjectLibrary();
  const jobsById = useJobsById();
  const [urls, setUrls] = useState({});

  const wanted = useMemo(() => [...new Set(objects
    .map((object) => object.source.jobId)
    .filter((jobId) => statusGroup(jobsById.get(jobId)?.status) === "ready"))], [objects, jobsById]);

  useEffect(() => {
    if (!library) return;
    wanted.filter((jobId) => !(jobId in urls)).forEach((jobId) => {
      setUrls((current) => ({ ...current, [jobId]: null }));
      library.getModelUrl(jobId)
        .then((url) => setUrls((current) => ({ ...current, [jobId]: url })))
        .catch(() => setUrls((current) => ({ ...current, [jobId]: "error" })));
    });
  }, [library, wanted, urls]);

  return urls;
}
