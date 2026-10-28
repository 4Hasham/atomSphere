import { createContext, useContext } from "react";
import { createStore, useStore } from "zustand";

const HISTORY_LIMIT = 100;

// One store per open Studio scene. Every edit replaces `document` with a new object
// and pushes the old one onto `past`, which is all undo/redo needs.
// `initial` can preset the editor, floorplan images and `persistence` (a saved
// property's save / uploadPlanImage functions; null for unsaved scenes).
export function createSceneStore(initialDocument, initial = {}) {
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

      // Floorplan editor state (not part of the document): 3D or plan, the floor being
      // edited, the active tool, what's selected and the display unit.
      editor: {
        mode: "3d",
        levelIndex: 0,
        tool: "select",
        selection: null,
        unit: "ft",
        wallThickness: "exterior",
        ...initial.editor,
      },
      setEditor: (patch) => set((state) => ({ editor: { ...state.editor, ...patch } })),
      // Floorplan images per level id (object URLs). Kept out of the document until
      // properties are saved with their images.
      underlayImages: initial.underlayImages ?? {},
      persistence: initial.persistence ?? null,
      setUnderlayImage: (levelId, url) => set((state) => {
        const previous = state.underlayImages[levelId];
        if (previous && previous !== url) URL.revokeObjectURL(previous);
        return { underlayImages: { ...state.underlayImages, [levelId]: url } };
      }),

      // Every property edit is one undo step. `change` gets the property and returns a
      // new one (see property/propertyEdits.js).
      editProperty: (change) => edit((document) => ({ property: change(document.property) })),

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

      // Furnishing a property: each add, move, turn or removal is one undo step.
      addObject: (object) => edit((document) => ({ objects: [...document.objects, object] })),
      placeObject: (id, placement) => edit((document) => ({
        objects: document.objects.map((object) => (
          object.id === id ? { ...object, placement: { ...object.placement, ...placement } } : object
        )),
      })),
      removeObject: (id) => {
        edit((document) => ({ objects: document.objects.filter((object) => object.id !== id) }));
        if (get().staging.selected === id) set((state) => ({ staging: { ...state.staging, selected: null } }));
      },

      // Which placed object is selected, and what is waiting to be placed by a click:
      // { object } for a new one, { id } to move an existing one. Not part of the document.
      staging: { selected: null, placing: null },
      setStaging: (patch) => set((state) => ({ staging: { ...state.staging, ...patch } })),

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
