// export const action = async ({ request }) => {

//   const payload = await request.json();
//   const { inventory_item_id } = payload;

//   const admin = await shopify.authenticate.admin(request);

//   // 1️⃣ Get variant → product
//   const variantQuery = `
//   query {
//     inventoryItem(id: "gid://shopify/InventoryItem/${inventory_item_id}") {
//       variant {
//         product {
//           id
//           tags
//         }
//       }
//     }
//   }`;

//   const variantRes = await admin.graphql(variantQuery);
//   const variantData = await variantRes.json();

//   const productId = variantData.data.inventoryItem.variant.product.id;
//   const productTags = variantData.data.inventoryItem.variant.product.tags;

//   // 2️⃣ Fetch all variants inventory
//   const inventoryQuery = `
//   query {
//     product(id: "${productId}") {
//       variants(first: 100) {
//         edges {
//           node {
//             inventoryItem {
//               inventoryLevels(first: 20) {
//                 edges {
//                   node {
//                     available
//                     location {
//                       name
//                     }
//                   }
//                 }
//               }
//             }
//           }
//         }
//       }
//     }
//   }`;

//   const inventoryRes = await admin.graphql(inventoryQuery);
//   const inventoryData = await inventoryRes.json();

//   const variants = inventoryData.data.product.variants.edges.map(e => {
//     return {
//       inventoryLevels: e.node.inventoryItem.inventoryLevels.edges.map(l => l.node)
//     };
//   });

//   // ⭐ HERE ADD YOUR LOGIC

//   let activeLocations = new Set();

//   variants.forEach(v => {
//     v.inventoryLevels.forEach(level => {
//       if (level.available > 0) {
//         //activeLocations.add(`loc_${level.location.name}`);
//         const tag = "loc_" + level.location.name
//           .toLowerCase()
//           .replace(/\s+/g, "_");

//         activeLocations.add(tag);
//       }
//     });
//   });

//   let existingTags = productTags.split(",");

//   let cleanTags = existingTags.filter(tag => !tag.startsWith("loc_"));

//   let finalTags = [...cleanTags, ...activeLocations];

//   // 3️⃣ Update product tags
//   const mutation = `
//   mutation {
//     productUpdate(input: {
//       id: "${productId}",
//       tags: ${JSON.stringify(finalTags)}
//     }) {
//       product {
//         id
//       }
//     }
//   }`;

//   await admin.graphql(mutation);

//   return new Response("ok");
// };

import { authenticate, unauthenticated } from "../shopify.server";
import { addToQueue } from "../queue/productQueue";
import { processQueue } from "../services/inventoryTagService";
import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), "webhook_debug.log");

function logDebug(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logMessage);
  console.log(message);
}

export const action = async ({ request }) => {
  logDebug("Inventory webhook received");

  const { admin: webhookAdmin, payload, shop } = await authenticate.webhook(request);

  let admin = webhookAdmin;
  if (!admin && shop) {
    logDebug(`Admin client missing in webhook auth, attempting unauthenticated fallback for ${shop}`);
    const results = await unauthenticated.admin(shop);
    admin = results.admin;
  }

  if (!admin) {
    logDebug("CRITICAL: Failed to obtain admin client for webhook");
    return new Response("Unauthorized", { status: 401 });
  }

  logDebug(`Processing payload for item: ${payload.inventory_item_id}`);

  const inventoryItemId = payload.inventory_item_id;

  const query = `
  query {
    inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
      variant {
        product {
          id
        }
      }
    }
  }`;

  const res = await admin.graphql(query);
  const data = await res.json();

  if (!data?.data?.inventoryItem) {
    logDebug(`ERR: Inventory item ${inventoryItemId} not found or query failed. Errors: ${JSON.stringify(data.errors)}`);
    return new Response("Not Found", { status: 404 });
  }

  const productId = data.data.inventoryItem.variant.product.id;
  logDebug(`Found Product ID: ${productId}`);

  addToQueue(productId);

  await processQueue(admin);

  logDebug(`Successfully processed inventory update for ${productId}`);
  return new Response("ok");
};