// Client-side helper for the generic authenticated upload endpoint
// (assignment attachments/submissions, payment proofs). Separate from
// the profile-picture upload flow (hooks/useApi + /api/v1/uploads/profile)
// since this one takes a `purpose` and returns just a URL, no user record
// to update afterward.
export async function uploadFile(token, file, purpose) {
  // Read the file fully into memory before building the request body -
  // on iOS Safari, a File picked straight from Photo Library (especially
  // with iCloud "Optimize Storage" on) can still be an unresolved
  // placeholder whose bytes haven't finished downloading yet. Streaming
  // that File directly into fetch's FormData can send a body shorter
  // than its declared size, which the server's multipart parser then
  // fails on ("No file provided"). Forcing the read here first makes
  // sure we only ever send fully-materialized bytes.
  const buffer = await file.arrayBuffer();
  const resolvedFile = new File([buffer], file.name, { type: file.type });

  const body = new FormData();
  body.append("file", resolvedFile);
  body.append("purpose", purpose);

  const res = await fetch("/api/v1/uploads/file", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Upload failed");
    err.status = res.status;
    throw err;
  }
  return data.url;
}

// Cleans up a file that was uploaded but never got attached to anything -
// see the DELETE handler in app/api/v1/uploads/file/route.js for when
// this is actually needed. Best-effort by design at every call site: a
// removed-before-save photo not immediately vanishing from storage is a
// much smaller problem than blocking the user's actual action on it.
export async function deleteUploadedFile(token, url) {
  await fetch("/api/v1/uploads/file", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}
