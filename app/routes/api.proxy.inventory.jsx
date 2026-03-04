import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  // The authenticate.public.appProxy() method ensures the request comes from Shopify
  const { admin } = await authenticate.public.appProxy(request);

  if (!admin) {
     return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");

  if (!variantId) {
    return json({ error: "Missing variantId" }, { status: 400 });
  }

  // Ensure variantId is in Global ID format: gid://shopify/ProductVariant/12345
  const globalVariantId = variantId.includes("gid://") ? variantId : `gid://shopify/ProductVariant/${variantId}`;

  try {
    // 1. Fetch the Inventory Item ID for the Variant
    const variantQuery = `
      query GetVariantInventoryItem($id: ID!) {
        productVariant(id: $id) {
          inventoryItem {
            id
          }
        }
      }
    `;
    
    const variantResponse = await admin.graphql(variantQuery, {
      variables: {
        id: globalVariantId,
      },
    });

    const variantData = await variantResponse.json();
    
    if (!variantData.data?.productVariant?.inventoryItem?.id) {
       return json({ error: "Variant or Inventory Item not found" }, { status: 404 });
    }

    const inventoryItemId = variantData.data.productVariant.inventoryItem.id;

    // 2. Fetch Inventory Levels for that Inventory Item
    const levelsQuery = `
      query GetInventoryLevels($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 50) {
            edges {
              node {
                quantities(names: ["available"]) {
                  name
                  quantity
                }
                location {
                  name
                  isActive
                }
              }
            }
          }
        }
      }
    `;

    const levelsResponse = await admin.graphql(levelsQuery, {
      variables: {
        id: inventoryItemId,
      }
    });

    const levelsData = await levelsResponse.json();
    
    const edges = levelsData.data?.inventoryItem?.inventoryLevels?.edges || [];
    
    // 3. Format the response data
    const inventoryLevels = edges
      .filter(edge => edge.node.location.isActive) // Only show active locations
      .map(edge => {
        const availableQuantityObj = edge.node.quantities.find(q => q.name === "available");
        return {
          locationName: edge.node.location.name,
          quantity: availableQuantityObj ? availableQuantityObj.quantity : 0,
        };
      });

    return json({
      variantId: globalVariantId,
      inventoryLevels
    }, {
      headers: {
        "Access-Control-Allow-Origin": "*", // Or restrict to the shop domain if known
      }
    });

  } catch (error) {
    console.error("App Proxy Inventory Error:", error);
    return json({ error: "Failed to fetch inventory data" }, { status: 500 });
  }
};
