const ensureElement = (selector, create) => {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = create();
    document.head.appendChild(node);
  }
  return node;
};

export const setHeadMeta = (key, content, { property = false } = {}) => {
  if (!content) return;
  const attr = property ? 'property' : 'name';
  const selector = `meta[${attr}="${key}"]`;
  const node = ensureElement(selector, () => {
    const meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    return meta;
  });
  node.setAttribute('content', content);
};

export const setHeadLink = (rel, href, extra = {}) => {
  if (!href) return;
  const selector = `link[rel="${rel}"]`;
  const node = ensureElement(selector, () => {
    const link = document.createElement('link');
    link.rel = rel;
    return link;
  });
  node.setAttribute('href', href);
  Object.entries(extra).forEach(([key, value]) => {
    if (value) node.setAttribute(key, value);
  });
};

export const setStructuredData = (id, payload) => {
  const selector = `script[data-seo-id="${id}"]`;
  let node = document.head.querySelector(selector);
  if (!payload) {
    if (node) node.remove();
    return;
  }
  if (!node) {
    node = document.createElement('script');
    node.type = 'application/ld+json';
    node.setAttribute('data-seo-id', id);
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(payload);
};
