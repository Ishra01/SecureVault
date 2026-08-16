function getFaviconUrl(siteName) {
  const domain = siteName.trim().toLowerCase().replace(/\s+/g, '') + '.com';
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}