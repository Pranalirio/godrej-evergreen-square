// This function is deployed on Netlify; the landing page remains on GitHub Pages.
// Configure LEADRAT_API_KEY in Netlify's environment variables (Functions scope).
const CRM_URL = "https://connect.leadrat.com/api/v1/integration/Website";
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbwv5RLnNnnkZpYl9FfVSWiWABNdF2Z41LXdtIZuOZN_maME7FuAAcrXkJiHfppKtQzx0Q/exec";
const ORIGINS = new Set([
  "https://godrejevergreen.com",
  "https://www.godrejevergreen.com",
]);

const namePattern = /^(?=.*\p{L})[\p{L}\p{M} .\u2019'-]+$/u;
const clean = (value, max = 160) => String(value ?? "").trim().slice(0, max);

function reply(status, body, origin) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "Cache-Control": "no-store",
    },
  });
}

function submissionTime() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit",
      year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value])
  );
  return {
    submittedDate: `${parts.day}-${parts.month}-${parts.year}`,
    submittedTime: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export default async function createLead(request) {
  const origin = request.headers.get("Origin");
  if (!ORIGINS.has(origin)) return new Response("Forbidden", { status: 403 });
  if (request.method === "OPTIONS") return reply(200, { ok: true }, origin);
  if (request.method !== "POST") return reply(405, { ok: false }, origin);
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    return reply(415, { ok: false, error: "Expected JSON" }, origin);
  }
  if (!process.env.LEADRAT_API_KEY) {
    return reply(503, { ok: false, error: "Lead service is not configured" }, origin);
  }

  let data;
  try {
    const raw = await request.text();
    if (raw.length > 10000) return reply(413, { ok: false }, origin);
    data = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: "Invalid request" }, origin);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return reply(400, { ok: false, error: "Invalid request" }, origin);
  }

  const name = clean(data.name, 80);
  const mobile = clean(data.phone, 20);
  if (name.length < 2 || !namePattern.test(name) || !/^[6-9]\d{9}$/.test(mobile)) {
    return reply(400, { ok: false, error: "Enter a valid name and mobile number" }, origin);
  }
  const utm = data.utm && typeof data.utm === "object" && !Array.isArray(data.utm) ? data.utm : {};
  const intent = clean(data.intent, 60);
  const config = clean(data.config, 80);
  const plan = clean(data.plan, 80);
  const source = clean(utm.utm_source, 100) ||
    (utm.gclid ? "Google Ads" : utm.fbclid ? "Meta Ads" : "Website");

  // LeadRat's Website integration accepts a JSON array of lead objects.
  const payload = [{
    name,
    mobile,
    countryCode: "91",
    project: "Godrej Evergreen Square",
    propertyType: "Flat",
    notes: `Enquiry: ${intent || "Website"}; Home: ${config || "Not specified"}; Plan: ${plan || "Not specified"}; GCLID: ${clean(utm.gclid, 160)}; FBCLID: ${clean(utm.fbclid, 160)}`,
    source,
    subSource: clean(utm.utm_medium, 100),
    CampaignName: clean(utm.utm_campaign, 160),
    additionalProperties: {
      EnquiredFor: "Buy",
      NoOfBHK: config.match(/^[23]\s*BHK/i)?.[0].charAt(0) || "",
    },
    ...submissionTime(),
  }];

  // Keep the old leads sheet as a verified fallback while LeadRat rejects requests.
  const sheetRecord = {
    name, phone: mobile, intent, config, plan,
    at: new Date().toISOString(), utm, page: "evergreen-square",
  };

  try {
    const response = await fetch(CRM_URL, {
      method: "POST",
      headers: {
        "API-Key": process.env.LEADRAT_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) return reply(200, { ok: true }, origin);
    console.error("LeadRat rejected a lead with HTTP", response.status);
  } catch (error) {
    console.error("LeadRat request failed:", error);
  }

  try {
    const response = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(sheetRecord),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Google Sheet returned HTTP ${response.status}`);
    const result = await response.json();
    if (result?.ok !== true) throw new Error("Google Sheet did not accept the enquiry");
    console.info("Lead saved to Google Sheet fallback");
    return reply(200, { ok: true, savedTo: "sheet" }, origin);
  } catch (error) {
    console.error("Google Sheet fallback failed:", error);
    return reply(502, { ok: false, error: "Could not save the enquiry" }, origin);
  }
}
