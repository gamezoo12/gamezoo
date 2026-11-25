import { useEffect, useState } from 'react';
import { api } from './api';

export default function useProfileImage(path) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl;
    setUrl('');
    if (path && /^\/api\/users\/profile-picture\//.test(path)) {
      api.get(path.replace(/^\/api/, ''), { responseType: 'blob' }).then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setUrl(objectUrl);
      }).catch(() => {});
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return url;
}