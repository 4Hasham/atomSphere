import { createSampleProperty } from "./property/propertyDocument";
import { createEmptyProperty } from "./property/propertyEdits";
import StudioViewer from "./StudioViewer";

/** Development-only scenes: the sample two-storey house, or a blank property to trace. */
export default function DemoStudio({ demo, theme, onToggleTheme, onBack }) {
  return (
    <StudioViewer
      jobId={`demo-${demo}`}
      prompt={demo === "blank" ? "New property" : "Sample house (10 marla, 2 storeys)"}
      property={demo === "blank" ? createEmptyProperty() : createSampleProperty()}
      theme={theme}
      onToggleTheme={onToggleTheme}
      onBack={onBack}
    />
  );
}
