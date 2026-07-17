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

// Suppress known R3F/Three warnings in test output.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = args[0]?.toString() ?? "";
  if (msg.includes("THREE") || msg.includes("react-three-fiber")) return;
  originalWarn(...args);
};
