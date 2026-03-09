import { getQueue, clearQueue } from "../queue/productQueue";

export async function processQueue(admin) {

  const productIds = getQueue();

  if (!productIds.length) return;

  for (const productId of productIds) {

    await updateProductTags(admin, productId);

  }

  clearQueue();
}
async function updateProductTags(admin, productId) {

  const query = `
  query {
    product(id: "${productId}") {
      tags
      variants(first:100){
        edges{
          node{
            inventoryItem{
              inventoryLevels(first:20){
                edges{
                  node{
                    available
                    location{
                      name
                    }
                  }
                }
              }
              variant {
                id
              }
            }
          }
        }
      }
    }
  }`;

  const res = await admin.graphql(query);
  const data = await res.json();

  const product = data.data.product;

  let activeLocations = new Set();

  product.variants.edges.forEach(v => {

    v.node.inventoryItem.inventoryLevels.edges.forEach(level => {

      if (level.node.available > 0) {

        const locationTag = level.node.location.name
          .toLowerCase()
          .replace(/\s+/g, "_");

        const variantId = v.node.inventoryItem.variant.id.split("/").pop();

        const tag = `loc_${locationTag}_${variantId}`;

        activeLocations.add(tag);

      }

    });

  });

  let existingTagsArray = typeof product.tags === 'string' ? product.tags.split(",").map(t => t.trim()) : (Array.isArray(product.tags) ? product.tags : []);

  let cleanTags = existingTagsArray.filter(
    tag => !tag.startsWith("loc_")
  );

  let finalTags = [...new Set([...cleanTags, ...activeLocations])];

  // ⭐ Compare sorted tags to avoid redundant API calls
  if (JSON.stringify([...finalTags].sort()) !== JSON.stringify([...existingTagsArray].sort())) {

    const mutation = `
    mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
            product { id tags }
        }
    }`;

    await admin.graphql(mutation, {
      variables: {
        input: {
          id: productId,
          tags: finalTags
        }
      }
    });

    console.log("Product tags updated:", productId, finalTags);

  } else {
    console.log("No tag change, skipping update for:", productId);
  }
}