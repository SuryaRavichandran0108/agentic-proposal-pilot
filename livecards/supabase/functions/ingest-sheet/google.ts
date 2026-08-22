/**
 * Minimal Google service-account auth + Sheets reader.
 *
 * Signs a JWT with Web Crypto (no third-party JWT dependency), exchanges it
 * for an access token, and reads a value range from the Sheets API. Tokens are
 * cached in module scope for the life of the isolate.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not set. Add the service account key " +
        "JSON as an Edge Function secret.",
    );
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the whole key file.",
    );
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "Service account JSON is missing client_email or private_key.",
    );
  }
  return parsed;
}

/** Convert a PEM-encoded PKCS#8 private key into a Web Crypto signing key. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Secrets are often stored with literal "\n" rather than real newlines.
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function fetchAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // Reuse a cached token while it has at least a minute of life left.
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value;
  }

  const account = loadServiceAccount();
  const key = await importPrivateKey(account.private_key);

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(
    JSON.stringify({
      iss: account.client_email,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Google token exchange failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  cachedToken = {
    value: payload.access_token,
    expiresAt: now + (payload.expires_in ?? 3600),
  };
  return cachedToken.value;
}

/**
 * Read every populated cell of a sheet tab as a 2D string array.
 * Google trims trailing empty cells, so rows are ragged — callers must
 * index defensively.
 */
export async function readSheetValues(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const token = await fetchAccessToken();
  const range = encodeURIComponent(sheetName);
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 403) {
    throw new Error(
      "Google returned 403. Share the spreadsheet with the service account " +
        "email (Viewer access is enough).",
    );
  }
  if (response.status === 404) {
    throw new Error(
      `Spreadsheet or tab not found: "${spreadsheetId}" / "${sheetName}". ` +
        "Check the ID and that the tab name matches exactly.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Sheets API error (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  const values: unknown[][] = payload.values ?? [];

  // Normalize every cell to a trimmed string; numbers and dates arrive typed.
  return values.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())),
  );
}
