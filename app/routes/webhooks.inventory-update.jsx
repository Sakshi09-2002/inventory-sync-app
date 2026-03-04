import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { admin } = await authenticate.webhook(request);

  const body = await request.json();
  const inventoryItemId = body.inventory_item_id;

  // 1️⃣ Get inventory item + all location levels
  const response = await admin.graphql(`
    query {
      inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
        inventoryLevels(first: 10) {
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
        variant {
          id
          product {
            id
            tags
          }
        }
      }
    }
  `);

  const data = await response.json();
  const inventoryItem = data.data.inventoryItem;

  if (!inventoryItem) return json({ success: true });

  const productId = inventoryItem.variant.product.id;
  const existingTags = inventoryItem.variant.product.tags;

  let locationTags = [];

  inventoryItem.inventoryLevels.edges.forEach(edge => {
    const qty = edge.node.available;
    const locationName = edge.node.location.name;

    if (qty > 0) {
      locationTags.push(
        locationName.replace(/\s+/g, "_").toLowerCase()
      );
    }
  });

  // Remove old location tags first (optional logic)
  const filteredExistingTags = existingTags.filter(
    tag => !tag.startsWith("loc_")
  );

  const finalTags = [
    ...new Set([
      ...filteredExistingTags,
      ...locationTags.map(t => `loc_${t}`)
    ])
  ];

  // 2️⃣ Update product tags
  await admin.graphql(`
    mutation {
      productUpdate(input: {
        id: "${productId}",
        tags: ${JSON.stringify(finalTags)}
      }) {
        userErrors {
          message
        }
      }
    }
  `);

  return json({ success: true });
};