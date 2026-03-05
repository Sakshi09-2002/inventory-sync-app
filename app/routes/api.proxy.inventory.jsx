import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.public.appProxy(request);

  if (!admin) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  if (!productId) {
    return json({ error: "Missing productId" }, { status: 400 });
  }

  const globalProductId = productId.includes("gid://") ? productId : `gid://shopify/Product/${productId}`;

  try {
    const query = `
      query GetProductInventory($id: ID!) {
        product(id: $id) {
          variants(first: 100) {
            edges {
              node {
                id
                title
                inventoryItem {
                  id
                  inventoryLevels(first: 50) {
                    edges {
                      node {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                        location {
                          id
                          name
                          isActive
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
    `;

    const response = await admin.graphql(query, {
      variables: { id: globalProductId },
    });

    const data = await response.json();
    const variants = data.data?.product?.variants?.edges || [];

    const variantMapping = {};

    variants.forEach((variantEdge) => {
      const variant = variantEdge.node;
      const inventoryLevels = variant.inventoryItem?.inventoryLevels?.edges || [];

      variantMapping[variant.id] = inventoryLevels
        .filter((levelEdge) => levelEdge.node.location.isActive)
        .map((levelEdge) => ({
          locationId: levelEdge.node.location.id,
          locationName: levelEdge.node.location.name,
          available: levelEdge.node.quantities.find((q) => q.name === "available")?.quantity || 0,
        }));
    });

    return json(
      { productId: globalProductId, variantMapping },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("App Proxy Inventory Error:", error);
    return json({ error: "Failed to fetch inventory data" }, { status: 500 });
  }
};
