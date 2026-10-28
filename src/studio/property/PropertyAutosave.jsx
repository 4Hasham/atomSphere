import { useContext, useEffect, useRef, useState } from "react";
import { sceneToSave } from "../../stage/propertyApi";
import { SceneStoreContext } from "../sceneStore";

const SAVE_DELAY_MS = 1200;
const SAVED_FIELDS = ["property", "objects", "site", "backdrop", "weather"];

const LABELS = {
  saved: "Saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
};

/**
 * Saves the property scene shortly after each change (one save at a time; changes made
 * during a save are saved right after it). Shows the state, and warns before leaving
 * the page with unsaved work.
 */
export default function PropertyAutosave({ save }) {
  const store = useContext(SceneStoreContext);
  const [status, setStatus] = useState("saved");
  const retry = useRef(() => {});

  useEffect(() => {
    let saved = Object.fromEntries(SAVED_FIELDS.map((field) => [field, store.getState().document[field]]));
    let timer = null;
    let saving = false;
    let again = false;
    const changed = (document) => SAVED_FIELDS.some((field) => document[field] !== saved[field]);

    async function flush() {
      if (saving) {
        again = true;
        return;
      }
      const document = store.getState().document;
      if (!changed(document)) {
        setStatus("saved");
        return;
      }
      saving = true;
      setStatus("saving");
      try {
        await save(sceneToSave(document));
        saved = Object.fromEntries(SAVED_FIELDS.map((field) => [field, document[field]]));
        setStatus(changed(store.getState().document) ? "unsaved" : "saved");
      } catch (error) {
        console.error("Saving the property failed:", error);
        setStatus("error");
        again = false;
      } finally {
        saving = false;
        if (again) {
          again = false;
          flush();
        }
      }
    }
    retry.current = flush;

    const unsubscribe = store.subscribe((state, previous) => {
      if (state.document === previous.document || !changed(state.document)) return;
      setStatus("unsaved");
      clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DELAY_MS);
    });
    const warn = (event) => {
      if (saving || changed(store.getState().document)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", warn);
      clearTimeout(timer);
      // Leaving Studio: send whatever wasn't saved yet.
      if (changed(store.getState().document)) save(sceneToSave(store.getState().document)).catch(() => {});
    };
  }, [store, save]);

  return (
    <span className={`studio-save is-${status}`} role="status" aria-live="polite">
      {LABELS[status]}
      {status === "error" && (
        <button type="button" className="studio-save-retry" onClick={() => retry.current()}>Retry</button>
      )}
    </span>
  );
}
