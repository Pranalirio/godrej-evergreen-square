# LeadRat CRM setup

The landing page stays on GitHub Pages. A Netlify Function receives each lead and
forwards it to LeadRat using its Website integration. No Google Sheet is involved.

## Before connecting

1. Rotate the LeadRat API key shared in chat. Do not put a replacement key in
   GitHub, `index.html`, or `netlify.toml`.
2. In Netlify, import this GitHub repository and deploy the
   `codex/leadrat-crm-integration` branch for initial setup. The included
   `netlify.toml` publishes a small relay page and the `create-lead` function;
   the existing `godrejevergreen.com` DNS continues to point to GitHub Pages.
3. In Netlify's site environment variables, add `LEADRAT_API_KEY` with the new
   value. Make sure it is available to Functions. Redeploy after adding it.
4. Copy the Netlify site URL. In `index.html`, replace
   `REPLACE-WITH-YOUR-NETLIFY-SITE` in `CONFIG.leadEndpoint` with the real
   Netlify subdomain (e.g. `my-crm-relay.netlify.app`).
5. Check the LeadRat project name and the payload mapping in
   `netlify/functions/create-lead.mjs`. The sample provided uses a JSON array,
   `API-Key` header, and HTTP 200 for success. Confirm LeadRat accepts the
   configured `source`, `propertyType`, and `additionalProperties` values.
6. First send a controlled dummy request to the deployed function with an
   `Origin: https://godrejevergreen.com` header and confirm it appears in
   LeadRat. Then merge the branch to publish the landing page change. Submit
   one enquiry through each live form and confirm both appear in LeadRat.
   A failed CRM response should keep the form available for retry.

The function only allows browser requests from `godrejevergreen.com` and its
`www` hostname. This CORS setting is not bot protection: any public form can
still receive automated requests. Configure LeadRat-side spam controls or add
rate limits/CAPTCHA if unwanted submissions occur.

The former Google Apps Script deployment is not contacted by the updated page.
It can be disabled after LeadRat has been tested and the new page is live.
