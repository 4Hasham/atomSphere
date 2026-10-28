export async function apiRequest(url, accessToken, options = {}) {
  if (!url) {
    throw new Error("This feature needs its API URL configured.");
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }

  return result;
}

// Sends the file straight to S3 with the presigned POST; XHR for upload progress.
export function postToS3(upload, file, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(upload.fields).forEach(([name, value]) => form.append(name, value));
    form.append("file", file); // must be the last field
    const request = new XMLHttpRequest();
    request.open("POST", upload.url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => (request.status >= 200 && request.status < 300
      ? resolve()
      : reject(new Error(request.status === 400
        ? "The storage service refused this file (it may be too large)."
        : `Upload failed (${request.status}).`)));
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.send(form);
  });
}
