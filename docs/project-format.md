# Studio project format

Studio saves UTF-8 `*.avalstudio` JSON documents with `studioVersion: 3`. A Studio document contains editor-only selection state and preparation recipes alongside AVAL-shaped sources, typed units, stable body states, authored routes, bindings, canvas, rational frame rate, alpha, and encoding preferences.

In Studio v3, a state references a stable body unit. Entry, exit, one-shot, and reversible clips are typed units attached to routes or initial-state residency; they are not represented as temporary application states. Route start policies preserve AVAL portal, finish, and cut semantics explicitly.

Frame ranges are always half-open `[startFrame, endFrame)`. Media URLs, MediaBunny objects, canvases, decoder state, and browser blob URLs are transient and are never serialized.

Before compilation, `toAvalProject` emits an exact AVAL project with `projectVersion: "1.0"`. The projection contains only fields accepted by the upstream schema:

```json
{
  "projectVersion": "1.0",
  "alpha": "auto",
  "canvas": {
    "width": 1280,
    "height": 720,
    "fit": "contain",
    "pixelAspect": [1, 1],
    "colorSpace": "srgb"
  },
  "frameRate": { "numerator": 24, "denominator": 1 },
  "sources": [],
  "encodings": [],
  "units": [],
  "initialState": "idle",
  "states": [],
  "edges": [],
  "bindings": []
}
```

Legacy version-1 segment documents remain readable by the legacy model but are not silently promoted into a buildable state graph. Studio v2 documents require an explicit migration because their route and transition semantics are not sufficient to infer every v3 unit, port, residency, and route-start policy safely.
