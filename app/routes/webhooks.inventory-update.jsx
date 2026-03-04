import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.webhook(request);

  const body = await request.json();
  console.log("Inventory webhook triggered:", body);

  return json({ success: true });
};