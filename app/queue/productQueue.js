const productQueue = new Set();

export function addToQueue(productId) {
    productQueue.add(productId);
}

export function getQueue() {
    return [...productQueue];
}

export function clearQueue() {
    productQueue.clear();
}