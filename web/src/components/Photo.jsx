import { useLayoutEffect, useRef, useState } from 'react';
import { Crosshair } from './Icons.jsx';

/**
 * The "acquiring visual" loader of listing photos: the grid, a scan band sweeping down and a
 * reticle (in small frames only the reticle, no label). It fills its box, so it is exactly the
 * size of the photo that replaces it.
 */
export function PhotoLoader({ className = '' }) {
  return (
    <span className={`photo-loader ${className}`} aria-hidden="true">
      <Crosshair className="photo-mark" />
      <span className="photo-note">Acquiring visual</span>
    </span>
  );
}

/**
 * A listing photo with PhotoLoader under it until it has loaded (then the photo fades in), or a
 * calm placeholder when photos are hidden, missing or fail to load.
 */
export default function Photo({ src, alt = '', noPhotos = false, className = '', eager = false }) {
  // Remember WHICH url failed or loaded, so a reused component with a new src starts over.
  const [failedSrc, setFailedSrc] = useState(null);
  const [loadedSrc, setLoadedSrc] = useState(null);
  const img = useRef(null);
  // A photo already in the cache can be complete before React sees its load event.
  useLayoutEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoadedSrc(src);
  }, [src]);
  if (!src || failedSrc === src) {
    return (
      <span className={`photo photo-placeholder ${className}`} role="img" aria-label={noPhotos ? 'Photo hidden' : 'No photo'}>
        <Crosshair className="photo-mark" />
        <span className="photo-note">{noPhotos ? 'Visual hidden in preview' : 'No visual'}</span>
      </span>
    );
  }
  const loading = loadedSrc !== src;
  return (
    <span className={`photo-frame ${className} ${loading ? 'is-loading' : ''}`}>
      {loading && <PhotoLoader />}
      <img
        ref={img}
        className="photo"
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
}
