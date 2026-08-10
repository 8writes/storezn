// Client-side helper for the generic authenticated upload endpoint
// (assignment attachments/submissions, payment proofs). Separate from
// the profile-picture upload flow (hooks/useApi + /api/v1/uploads/profile)
// since this one takes a `purpose` and returns just a URL, no user record
// to update afterward.
export async function uploadFile(token, file, purpose) {
  const body = new FormData();
  body.append("file", file);
  body.append("purpose", purpose);

  const res = await fetch("/api/v1/uploads/file", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}
