// This function is deployed on Netlify; the landing page remains on GitHub Pages.
// Configure LEADRAT_API_KEY in Netlify's environment variables (Functions scope).
const CRM_URL = "https://connect.leadrat.com/api/v1/integration/Website";
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
    if (!response.ok) {
      console.error("LeadRat rejected a lead with HTTP", response.status);
      return reply(502, { ok: false, error: "CRM did not accept the enquiry" }, origin);
    }
    return reply(200, { ok: true }, origin);
  } catch (error) {
    console.error("LeadRat request failed:", error);
    return reply(502, { ok: false, error: "CRM is temporarily unavailable" }, origin);
  }
}
