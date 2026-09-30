# Furniture Odyssey — Interactive Book

A static website presenting the Furniture Odyssey hardcover in 3D. The book floats gently, rotates when dragged, opens when clicked, and includes Next/Back page turns through six sample reading pages.

## Run locally

Serve this folder over HTTP. For example, with Python installed:

```sh
python -m http.server 4173
```

Open http://localhost:4173/ in a modern browser. No npm installation or build step is needed; Three.js and its required loaders are bundled in `vendor/`. Opening `index.html` directly with a `file://` URL will not load the ES modules and GLB correctly.

## Controls

- Drag the closed book to rotate it; release to return to its presentation angle.
- Click the book or press Enter to open it.
- Use Next page and Back page to turn the pages.
- Use arrow keys to rotate the closed book or navigate pages while reading.
- Press Home to reset the closed view.
- Focus view enlarges the presentation. Pause motion stops the floating motion.

Reduced-motion preferences are supported. A rendered image and readable HTML text provide a fallback when WebGL is unavailable.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Website layout and Three.js import map |
| `styles.css`, `reader.css` | Presentation and reading styles |
| `viewer.js` | 3D rendering, floating, dragging, cover opening, and page turns |
| `app.js` | Dialog, buttons, navigation, and motion controls |
| `book-content.js` | Six sample interior pages; replace with final case-study text |
| `furniture-odyssey.glb` | Book geometry, materials, and embedded front/spine artwork |
| `furniture-odyssey.png` | Rendered fallback image |
| `vendor/` | Three.js 0.180.0, required loaders/utilities, and MIT license |

The GLB contains separate cover, spine, endpaper, and page-block parts. Both supplied PNG textures are embedded unchanged. The front cover uses the complete image; the spine maps the central third of the side image, omitting its blank margins. The back cover is plain cream. The website measures the book's parts to position its cover hinge and reading surfaces.

Floating, dragging, opening, and page turns run in JavaScript. The interior text and page textures are generated from `book-content.js`; HTML overlays keep the resting page text crisp. The Blender source is not required to run this website.

## Use in another website

Keep the GLB, fallback image, JavaScript modules, and `vendor/` paths consistent. Integrate the viewer markup and styles into the existing layout rather than replacing that site's homepage. Update asset and import paths if you move the files into a subfolder. The supplied files can also be served directly by a static web host.

Google Fonts is optional; the site falls back to Georgia and Arial. Three.js is distributed under the MIT license included in `vendor/LICENSE`. This repository does not grant additional rights to the cover artwork.
