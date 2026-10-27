import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";

const HISTORY_LIMIT = 100;

// One store per open Studio scene. Every edit replaces `document` with a new object
// and pushes the old one onto `past`, which is all undo/redo needs.
export function createSceneStore(initialDocument) {
  return createStore((set, get) => {
    function edit(change) {
      const { document, past } = get();
      set({
        document: { ...document, ...change(document) },
        past: [...past, document].slice(-HISTORY_LIMIT),
        future: [],
      });
    }

    return {
      document: initialDocument,
      past: [],
      future: [],
      // How the property is shown (which level, roof on/off): a viewing choice, not an
      // edit, so it isn't part of the document or the undo history.
      propertyView: { level: "all", roof: true },
      setPropertyView: (patch) => set((state) => ({ propertyView: { ...state.propertyView, ...patch } })),

      // A real-world terrain and an image backdrop both supply the ground around the
      // model, so they must never be active together. Setting a site clears the
      // backdrop; choosing a backdrop clears the site.
      setSite: (site) => edit(() => (site ? { site, backdrop: "none" } : { site: null })),
      setBackdrop: (backdrop) => edit(() => (
        backdrop === "none" ? { backdrop } : { backdrop, site: null }
      )),
      setWeatherPreset: (presetId) => edit((document) => ({
        weather: { ...document.weather, presetId },
      })),
      setObjectSize: (id, sizeMeters) => edit((document) => ({
        objects: document.objects.map((object) => (
          object.id === id ? { ...object, sizeMeters } : object
        )),
      })),

      undo: () => {
        const { document, past, future } = get();
        if (!past.length) return;
        set({ document: past.at(-1), past: past.slice(0, -1), future: [document, ...future] });
      },
      redo: () => {
        const { document, past, future } = get();
        if (!future.length) return;
        set({ document: future[0], past: [...past, document], future: future.slice(1) });
      },
    };
  });
}

export const SceneStoreContext = createContext(null);

export function useScene(selector) {
  const store = useContext(SceneStoreContext);
  if (!store) throw new Error("useScene must be used inside a SceneStoreContext provider.");
  return useStore(store, selector);
}
