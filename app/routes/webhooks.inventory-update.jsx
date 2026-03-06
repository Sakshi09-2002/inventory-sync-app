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

import { addToQueue } from "../queue/productQueue";

export const action = async ({ request }) => {

  const payload = await request.json();

  const inventoryItemId = payload.inventory_item_id;

  const admin = await shopify.authenticate.admin(request);

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

  const productId =
    data.data.inventoryItem.variant.product.id;

  addToQueue(productId);
  setTimeout(async () => {
    const admin = await shopify.authenticate.admin(request);
    await processQueue(admin);
  }, 2000);
  return new Response("queued");
};