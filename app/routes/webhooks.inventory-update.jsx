import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.webhook(request);

    const body = await request.json();
    const inventoryItemId = body.inventory_item_id;

    if (!inventoryItemId) {
      console.log("No inventory_item_id received");
      return json({ success: false });
    }

    // 1️⃣ Fetch product + all variants inventory
    const response = await admin.graphql(`
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
          variant {
            product {
              id
              tags
              variants(first: 100) {
                edges {
                  node {
                    inventoryItem {
                      id
                      inventoryLevels(first: 20) {
                        edges {
                          node {
                            available
                            location {
                              id
                              name
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data = await response.json();

    if (!data?.data?.inventoryItem?.variant?.product) {
      console.log("Product not found for inventory item");
      return json({ success: false });
    }

    const product = data.data.inventoryItem.variant.product;

    // 2️⃣ Calculate location availability
    const locationStock = {};

    product.variants.edges.forEach((variant) => {
      const levels = variant.node.inventoryItem?.inventoryLevels?.edges || [];

      levels.forEach((level) => {
        const qty = level.node.available;
        const locationName = level.node.location.name;

        if (qty > 0) {
          locationStock[locationName] = true;
        }
      });
    });

    // 3️⃣ Convert locations → tags
    const locationTags = Object.keys(locationStock).map((loc) =>
      `loc_${loc.replace(/\s+/g, "_").toLowerCase()}`
    );

    // 4️⃣ Existing product tags
    const existingTags = product.tags
      ? product.tags.split(",").map((t) => t.trim())
      : [];

    // 5️⃣ Remove old location tags
    const nonLocationTags = existingTags.filter(
      (tag) => !tag.startsWith("loc_")
    );

    // 6️⃣ Final tag list
    const updatedTags = [...nonLocationTags, ...locationTags];

    // 7️⃣ Only update if tags changed
    const existingTagString = existingTags.sort().join(",");
    const updatedTagString = updatedTags.sort().join(",");

    if (existingTagString === updatedTagString) {
      console.log("No tag changes needed");
      return json({ success: true });
    }

    // 8️⃣ Update product tags
    await admin.graphql(`
      mutation productUpdate {
        productUpdate(input:{
          id:"${product.id}"
          tags:${JSON.stringify(updatedTags)}
        }){
          product{
            id
            tags
          }
        }
      }
    `);

    console.log("Product tags updated:", updatedTags);

    return json({ success: true });

  } catch (error) {
    console.error("Webhook error:", error);
    return json({ success: false });
  }
};