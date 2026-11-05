// Image PNG transparente 1×1 réellement décodable, CRC des chunks valides.
// Utilisée exclusivement par les tests : aucune donnée privée.
export const VALID_TEST_PNG_BYTES=Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64"
));
