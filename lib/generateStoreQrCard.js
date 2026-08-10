import QRCode from "qrcode";

const WIDTH = 1080;
const HEADER_HEIGHT = 220;
const QR_SIZE = 640;
const BRAND_900 = "#114b33";
const BRAND_600 = "#14915b";
const BRAND_500 = "#1fb872";
const SLATE_900 = "#0f172a";
const SLATE_400 = "#94a3b8";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = src;
  });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Renders a downloadable "shop online" card for a vendor's storefront:
// Storezn branding up top, the store name, a QR code pointing at their
// storefront URL, and the URL itself spelled out underneath in case the
// code can't be scanned. Pure canvas composition so it downloads as one
// flat PNG the vendor can print or post anywhere, no server round-trip.
export async function generateStoreQrCard({ storeName, storeUrl }) {
  const [logo, qrDataUrl] = await Promise.all([
    loadImage("/storezn-logo.png"),
    QRCode.toDataURL(storeUrl, { width: QR_SIZE, margin: 1, color: { dark: BRAND_900, light: "#ffffff" } }),
  ]);
  const qrImage = await loadImage(qrDataUrl);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Measure the store-name block first (canvas height depends on how many
  // lines it wraps to) using a throwaway context sized wide enough that
  // font metrics are accurate.
  canvas.width = WIDTH;
  canvas.height = 2000;
  ctx.font = "700 60px sans-serif";
  const nameLines = wrapText(ctx, storeName, WIDTH - 160).slice(0, 2);
  const nameBlockHeight = nameLines.length * 76;

  const contentTop = HEADER_HEIGHT + 90;
  const shopOnlineY = contentTop;
  const nameStartY = shopOnlineY + 80;
  const qrTop = nameStartY + nameBlockHeight + 40;
  const scanTextY = qrTop + QR_SIZE + 60;
  const urlY = scanTextY + 50;
  const height = urlY + 70;

  canvas.height = height;

  // Header bar
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.fillStyle = BRAND_900;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);

  const logoWidth = 340;
  const logoHeight = logoWidth * (logo.height / logo.width);
  ctx.drawImage(logo, (WIDTH - logoWidth) / 2, (HEADER_HEIGHT - logoHeight) / 2, logoWidth, logoHeight);

  // "SHOP ONLINE"
  ctx.textAlign = "center";
  ctx.fillStyle = BRAND_600;
  ctx.font = "700 40px sans-serif";
  ctx.fillText("S H O P   O N L I N E", WIDTH / 2, shopOnlineY);

  // Store name (up to 2 lines)
  ctx.fillStyle = SLATE_900;
  ctx.font = "700 60px sans-serif";
  nameLines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, nameStartY + i * 76));

  // QR code
  ctx.drawImage(qrImage, (WIDTH - QR_SIZE) / 2, qrTop, QR_SIZE, QR_SIZE);

  // Scan hint + URL
  ctx.fillStyle = "#475569";
  ctx.font = "600 32px sans-serif";
  ctx.fillText("Scan to shop", WIDTH / 2, scanTextY);
  ctx.fillStyle = SLATE_400;
  ctx.font = "400 28px sans-serif";
  ctx.fillText(storeUrl.replace(/^https?:\/\//, ""), WIDTH / 2, urlY);

  // Footer accent bar
  ctx.fillStyle = BRAND_500;
  ctx.fillRect(0, height - 10, WIDTH, 10);

  return canvas;
}
