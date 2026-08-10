// Cuts the user's crop selection out of the source image and re-encodes
// it at a fixed output size, via an offscreen canvas - keeps the upload
// small and guarantees the result is exactly the shape it'll be
// displayed as (a rectangle navbar logo, a square favicon), instead of
// leaving it to whatever `object-cover`/`object-contain` happens to do
// with an arbitrarily-shaped upload the vendor never previewed.
export async function getCroppedImageBlob(imageSrc, cropPixels, { outputWidth = 512, outputHeight = 512 } = {}) {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Crop failed"))), "image/png", 0.92);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = src;
  });
}
