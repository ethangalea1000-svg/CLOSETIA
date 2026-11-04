import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("const SAFE_IMPORT_IMAGE_DATA");
const end = source.indexOf("function dataImageDecodes(", start);
assert.ok(start >= 0 && end > start, "import image filter must exist");
const safeImportedImage = new Function(source.slice(start, end) + "\nreturn safeImportedImage;")();

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const ok = value => assert.equal(safeImportedImage(value).rejected, false, String(value).slice(0, 40));
const ko = value => {
  const r = safeImportedImage(value);
  assert.equal(r.rejected, true, String(value).slice(0, 40));
  assert.equal(r.image, "", "a rejected image must be emptied, never kept");
};

ok(""); ok(null); ok(undefined);
ok(png);
ok("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==");
ok("https://example.com/a.jpg");
ko("javascript:alert(1)");
ko("http://example.com/a.jpg");
ko("data:image/svg+xml;base64,PHN2Zy8+");
ko("data:text/html;base64,PHNjcmlwdD4=");
ko("data:image/png;base64,@@@@");
ko("data:image/png;base64,abc");
ko("https://example.com/a b.jpg");
ko('https://example.com/a"onerror="x');
ko("https://example.com/" + "a".repeat(2100));
ko(123);
ko({ url: "https://example.com/a.jpg" });
console.log("CLOSETIA import image filter tests passed.");
