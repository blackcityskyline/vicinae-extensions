import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { createWriteStream } from "node:fs";

export type IconSource = string;

function downloadToFile(url: string, dest: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const mod = u.protocol === "https:" ? request : httpRequest;
      const req = mod(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === "https:" ? 443 : 80),
          path: u.pathname + u.search,
          method: "GET",
          headers: {
            "User-Agent": "webapp-maker/1.0",
          },
          timeout: timeoutMs,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirect = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).toString();
            res.resume();
            downloadToFile(redirect, dest, timeoutMs).then(resolve).catch(reject);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error("http " + res.statusCode));
            return;
          }
          const file = createWriteStream(dest);
          res.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", reject);
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

export async function downloadIcon(url: string, dest: string): Promise<void> {
  await downloadToFile(url, dest, 10000);
}

export async function fetchSiteIcon(siteUrl: string, dest: string): Promise<void> {
  let pageUrl = siteUrl;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pageUrl)) {
    pageUrl = "https://" + pageUrl;
  }
  const u = new URL(pageUrl);
  const origin = u.protocol + "//" + u.host;

  try {
    const page = await fetch(pageUrl, { method: "GET", headers: { "User-Agent": "webapp-maker/1.0" }, redirect: "follow" } as any);
    if (page.ok) {
      const text = await page.text();
      const match = text.match(/<link[^>]*rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i);
      if (match) {
        const hrefMatch = match[0].match(/href=["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1]) {
          let iconUrl = hrefMatch[1];
          if (iconUrl.startsWith("//")) iconUrl = u.protocol + iconUrl;
          else if (iconUrl.startsWith("/")) iconUrl = origin + iconUrl;
          else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(iconUrl)) iconUrl = origin + "/" + iconUrl;
          try {
            await downloadToFile(iconUrl, dest, 5000);
            return;
          } catch {}
        }
      }
    }
  } catch {}

  try {
    await downloadToFile(origin + "/apple-touch-icon.png", dest, 5000);
    return;
  } catch {}

  try {
    await downloadToFile("https://www.google.com/s2/favicons?domain=" + u.hostname + "&sz=256", dest, 5000);
    return;
  } catch {}

  throw new Error("could not download icon");
}
