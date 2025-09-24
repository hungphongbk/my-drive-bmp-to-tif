export async function uploadToLightroom({
  tiffBuffer,
  fileNameNoExt,
  parentPath,
}) {
  // TODO: Tích hợp Adobe Lightroom Cloud:
  // 1) PUT /v2/catalogs/{catalog_id}/assets/{asset_id}
  // 2) PUT /v2/catalogs/{catalog_id}/assets/{asset_id}/master
  // kèm headers: Authorization: Bearer <access_token>, X-API-Key: <ADOBE_CLIENT_ID>
  // Ở đây mock cho nhanh:
  return {
    ok: true,
    assetId: `mock-${Date.now()}`,
    fileName: `${fileNameNoExt}.tiff`,
    parentPath,
  };
}
