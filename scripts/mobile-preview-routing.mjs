// Expo exports these native dynamic screens as route-template HTML. Serving the
// homepage for them makes the initial client render disagree with the document.
const dynamicScreens = {
  business: "[slug]",
  booking: "[slug]",
  appointment: "[id]",
  manage: "[section]",
};

export function dynamicPreviewDocument(pathname) {
  const match = /^\/([^/]+)\/([^/.]+)\/?$/.exec(pathname);
  const template = match && Object.hasOwn(dynamicScreens, match[1]) ? dynamicScreens[match[1]] : null;
  return template ? `${match[1]}/${template}.html` : null;
}
