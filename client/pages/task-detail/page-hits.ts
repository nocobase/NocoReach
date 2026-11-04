// What the page searches of the task page (Which page to change?, Related page) list from nrTaskWork:pages.

/** A page found in Website content, or (`link`) a link on the site it has not read, for Use this link. */
export type SiteHit = {
  url: string;
  title: string;
  type?: string;
  link?: boolean;
};

/** A link as Use this link shows it: the host and path. */
export const linkText = (url: string) => {
  try {
    const u = new URL(url);
    return decodeURI(`${u.host}${u.pathname}`);
  } catch {
    return url;
  }
};
