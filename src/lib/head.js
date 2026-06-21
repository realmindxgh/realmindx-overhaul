const ensureElement = (selector, create) => {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = create();
    document.head.appendChild(node);
  }
  return node;
};

export const setHeadMeta = (key, content, { property = false } = {}) => {
  const attr = property ? 'property' : 'name';
  const selector = `meta[${attr}="${key}"]`;
  if (content === null || content === undefined) {
    document.head.querySelector(selector)?.remove();
    return;
  }
  const node = ensureElement(selector, () => {
    const meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    return meta;
  });
  node.setAttribute('content', String(content));
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

export const setFavicons = ({ icon, appleTouchIcon }) => {
  if (icon) {
    const iconLinks = [...document.head.querySelectorAll('link[rel="icon"]')];
    if (!iconLinks.length) {
      const link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      iconLinks.push(link);
    }
    iconLinks.forEach((link) => {
      link.setAttribute('href', icon);
      link.setAttribute('type', icon.endsWith('.ico') ? 'image/x-icon' : 'image/png');
    });
    const shortcut = ensureElement('link[rel="shortcut icon"]', () => {
      const link = document.createElement('link');
      link.rel = 'shortcut icon';
      return link;
    });
    shortcut.setAttribute('href', icon);
    shortcut.setAttribute('type', icon.includes('.ico') ? 'image/x-icon' : 'image/png');
  }
  if (appleTouchIcon) {
    setHeadLink('apple-touch-icon', appleTouchIcon, { sizes: '180x180' });
  }
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
