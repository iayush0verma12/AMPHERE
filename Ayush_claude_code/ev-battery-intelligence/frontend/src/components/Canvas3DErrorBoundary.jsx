/**
 * Canvas3DWrapper — error boundary for Three.js Canvas components.
 *
 * If WebGL crashes (context lost), shows a graceful fallback
 * instead of taking down the whole React tree.
 */

import React from "react";

export class Canvas3DErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.warn("[Canvas3D] Error caught:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="canvas-fallback">
          <div className="canvas-fallback-text">
            3D visualization unavailable
            <br />
            <span className="muted" style={{ fontSize: 12 }}>
              WebGL context could not be initialized
            </span>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
