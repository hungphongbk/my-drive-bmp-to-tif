export function getFolderId(folderUrl) {
  const i = folderUrl.indexOf("/folders/");
  if (i === -1) return null;
  return folderUrl.slice(i + 9).split(/[?#]/)[0];
}

export async function listChildren(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken, files(id,name,mimeType,thumbnailLink)",
      pageSize: 1000,
      pageToken,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

export async function listAllBmpRecursively(drive, rootFolderId) {
  const result = [];
  const queue = [{ id: rootFolderId, path: "" }];

  while (queue.length) {
    const cur = queue.shift();
    const children = await listChildren(drive, cur.id);
    for (const item of children) {
      if (item.mimeType === "application/vnd.google-apps.folder") {
        queue.push({ id: item.id, path: `${cur.path}/${item.name}` });
      } else {
        const isBmp = (item.name || "").toLowerCase().endsWith(".bmp");
        if (isBmp) {
          result.push({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType || "image/bmp",
            parentPath: cur.path || "/",
            thumbnail: item.thumbnailLink || null,
          });
        }
      }
    }
  }
  return result;
}

export async function downloadFileStream(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );
  return Buffer.from(res.data); // Trả về buffer BMP
}
