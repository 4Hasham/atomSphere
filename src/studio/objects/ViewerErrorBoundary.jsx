import { Component } from "react";
import { Html } from "@react-three/drei";

export default class ViewerErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Failed to load GLB in the model viewer:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <p className="viewer-failure" role="alert">
            Could not load this model. The signed link may have expired or S3 CORS may block it.
          </p>
        </Html>
      );
    }
    return this.props.children;
  }
}
