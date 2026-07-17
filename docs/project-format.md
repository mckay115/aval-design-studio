# Studio project format

Studio saves UTF-8 `*.avalstudio.json` documents with `studioVersion: 2`. A Studio document contains editor-only selection state and preparation recipes alongside AVAL-shaped sources, units, states, routes, bindings, canvas, rational frame rate, alpha, and encoding preferences.

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

Legacy version-1 segment documents remain readable by the legacy model but are not silently promoted into a buildable state graph. A future Open Project migration must preserve ranges and require resolution of ambiguous event/bridge semantics.
