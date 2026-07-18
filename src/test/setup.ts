import "@testing-library/jest-dom";

// Minimal WebGL context for tests that instantiate Three.js without a real canvas.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: function (type: string) {
    if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
      return {
        getExtension: () => null,
        getParameter: () => 0,
        createShader: () => ({ id: 1 }),
        createProgram: () => ({ id: 1 }),
        attachShader: () => {},
        linkProgram: () => {},
        useProgram: () => {},
        createBuffer: () => ({ id: 1 }),
        bindBuffer: () => {},
        bufferData: () => {},
        enableVertexAttribArray: () => {},
        vertexAttribPointer: () => {},
        drawArrays: () => {},
        clear: () => {},
        viewport: () => {},
        enable: () => {},
        disable: () => {},
        blendFunc: () => {},
        depthFunc: () => {},
        uniform1f: () => {},
        uniform3f: () => {},
        uniformMatrix4fv: () => {},
        getAttribLocation: () => 0,
        getUniformLocation: () => ({ id: 1 }),
      };
    }
    return null;
  },
  configurable: true,
});

// Suppress known R3F/Three/jsdom warnings in test output.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = args[0]?.toString() ?? "";
  if (
    msg.includes("THREE") ||
    msg.includes("react-three-fiber") ||
    msg.includes("incorrect casing") ||
    msg.includes("unrecognized in this browser") ||
    msg.includes("does not recognize the") ||
    msg.includes("non-boolean attribute") ||
    msg.startsWith("<")
  ) {
    return;
  }
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args[0]?.toString() ?? "";
  if (
    msg.includes("incorrect casing") ||
    msg.includes("unrecognized in this browser") ||
    msg.includes("does not recognize the") ||
    msg.includes("non-boolean attribute") ||
    msg.startsWith("<")
  ) {
    return;
  }
  originalError(...args);
};
