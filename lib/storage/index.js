import { nanoid } from "nanoid";
import * as cloudinary from "./cloudinary.js";
import * as s3 from "./s3.js";

const provider = process.env.STORAGE_PROVIDER === "s3" ? s3 : cloudinary;

export const uploadPublicFile = provider.uploadPublicFile;
export const deletePublicFile = provider.deletePublicFile;
export const isOwnedUploadUrl = provider.isOwnedUploadUrl;

// Every upload lives under one top-level folder in the storage
// account/bucket, so this app's files stay separate from anything else
// sharing the same Cloudinary/S3 account. Override via STORAGE_FOLDER if
// you ever need a different namespace (e.g. separate dev/prod folders).
const BASE_FOLDER = process.env.STORAGE_FOLDER || "schoolapp";

export function generateObjectKey(prefix, filename) {
  const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  return `${BASE_FOLDER}/${prefix}/${nanoid()}${ext}`;
}
