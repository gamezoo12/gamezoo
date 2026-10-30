import { useEffect, useState } from 'react';

export function useBlobUrl(fetcher, key) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    let made = '';
    if (!key) return undefined;
    fetcher().then((b) => { made = URL.createObjectURL(b); if (alive) setUrl(made); }).catch(() => {});
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}
