import { Redis } from "@upstash/redis";
import { v4 as uuidv4 } from "uuid";
// Hàm lấy catalogId từ API Lightroom
export async function fetchCatalogId(sub) {
  const access_token = await getAdobeAccessToken(sub);
  if (!access_token) return null;
  const clientId = process.env.ADOBE_CLIENT_ID;
  const url = "https://lr.adobe.io/v2/catalog";
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    console.error("[Lightroom catalog error]", {
      url,
      status: res.status,
      detail: await res.text(),
    });
    return null;
  }
  let text = await res.text();
  console.log("[Lightroom catalog response]", text);
  // Loại bỏ prefix 'while (1) {}'
  text = text.replace(/^while \(1\) \{\}\s*/, "");
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("[Lightroom catalog parse error]", e);
    return null;
  }
  // Nếu trả về mảng, lấy id đầu tiên
  if (Array.isArray(data) && data.length > 0 && data[0].id) return data[0].id;
  // Nếu trả về object, lấy id
  if (data.id) return data.id;
  return null;
}

// Hàm lấy access_token từ Redis
async function getAdobeAccessToken(sub) {
  const redis = Redis.fromEnv();
  const key = `adobe:lr:user:${sub}`;
  const info = await redis.hgetall(key);
  return info?.access_token || null;
}

async function getAdobeAccountId(sub) {
  const redis = Redis.fromEnv();
  const cacheKey = `adobe:lr:accountid:${sub}`;
  let accountId = await redis.get(cacheKey);
  if (accountId) return accountId;
  const access_token = await getAdobeAccessToken(sub);
  if (!access_token) return null;
  const url = "https://lr.adobe.io/v2/account";
  const clientId = process.env.ADOBE_CLIENT_ID;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
  });
  // debug and log res
  // console.log("[Lightroom account response]", await res.text());
  if (!res.ok) return null;
  let text = await res.text();
  text = text.replace(/^while \(1\) \{\}\s*/, "");
  let data;
  try {
    console.log("[Lightroom account response]", text);
    data = JSON.parse(text);
  } catch (e) {
    console.error("[Lightroom account parse error]", e);
    return null;
  }
  if (data.id) {
    await redis.set(cacheKey, data.id);
    return data.id;
  }
  return null;
}

export async function uploadToLightroom({
  tiffBuffer,
  fileNameNoExt,
  parentPath,
  sub,
}) {
  // Lấy access_token từ Redis
  const access_token = await getAdobeAccessToken(sub);
  if (!access_token) {
    return { ok: false, error: "missing_adobe_access_token" };
  }

  // Các thông tin cần thiết
  const catalogId = await fetchCatalogId(sub);
  // Sinh assetId là GUID v4 không dấu gạch ngang
  const assetId = uuidv4().replace(/-/g, "");
  const clientId = process.env.ADOBE_CLIENT_ID;
  console.log("catalogId", catalogId);
  // 1) Tạo asset metadata
  const assetUrl = `https://lr.adobe.io/v2/catalogs/${catalogId}/assets/${assetId}`;
  const metaRes = await fetch(assetUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "X-API-Key": clientId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subtype: "image",
      payload: {
        captureDate: new Date().toISOString(),
        importSource: {
          fileName: `${fileNameNoExt}.tiff`,
          importedOnDevice: "nodejs",
          importedBy: await getAdobeAccountId(sub),
          importTimestamp: new Date().toISOString(),
        },
      },
    }),
  });
  if (!metaRes.ok) {
    // log api call route and sent payload
    console.error("[Lightroom asset metadata error]", {
      url: assetUrl,
      payload: {
        subtype: "image",
        payload: {
          captureDate: new Date().toISOString(),
          importSource: {
            fileName: `${fileNameNoExt}.tiff`,
            importedOnDevice: "nodejs",
            importedBy: await getAdobeAccountId(sub),
            importTimestamp: new Date().toISOString(),
          },
        },
      },
      status: metaRes.status,
    });
    return {
      ok: false,
      error: "asset_metadata_failed",
      status: metaRes.status,
      detail: await metaRes.text(),
    };
  }

  // 2) Upload master TIFF
  const masterUrl = `https://lr.adobe.io/v2/catalogs/${catalogId}/assets/${assetId}/master`;
  const contentLength = tiffBuffer.length;
  const masterRes = await fetch(masterUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "X-API-Key": clientId,
      "Content-Type": "image/tiff",
      "Content-Length": String(contentLength),
      "Content-Range": `bytes 0-${contentLength - 1}/${contentLength}`,
    },
    body: tiffBuffer,
  });
  if (!masterRes.ok) {
    return {
      ok: false,
      error: "upload_master_failed",
      status: masterRes.status,
      detail: await masterRes.text(),
    };
  }

  return {
    ok: true,
    assetId,
    fileName: `${fileNameNoExt}.tiff`,
    parentPath,
  };
}
