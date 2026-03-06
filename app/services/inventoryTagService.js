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

                const tag = "loc_" +
                    level.node.location.name
                        .toLowerCase()
                        .replace(/\s+/g, "_");

                activeLocations.add(tag);

            }

        });

    });

    let existingTags = product.tags;

    let cleanTags = existingTags.filter(
        tag => !tag.startsWith("loc_")
    );

    let finalTags = [...cleanTags, ...activeLocations];

    // ⭐ ADD CHECK HERE
    if (JSON.stringify(finalTags.sort()) !== JSON.stringify(existingTags.sort())) {

        const mutation = `
    mutation {
        productUpdate(input:{
        id:"${productId}"
        tags:${JSON.stringify(finalTags)}
        }){
        product{ id }
        }
    }`;

        await admin.graphql(mutation);

        console.log("Product tags updated:", productId);

    } else {

        console.log("No tag change, skipping update");

    }

    const mutation = `
  mutation {
    productUpdate(input:{
      id:"${productId}"
      tags:${JSON.stringify(finalTags)}
    }){
      product{ id }
    }
  }`;

    await admin.graphql(mutation);
}