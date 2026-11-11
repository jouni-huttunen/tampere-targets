import { useState } from 'react';

/** A listing photo, or a calm placeholder when photos are hidden, missing or fail to load. */
export default function Photo({ src, alt = '', noPhotos = false, className = '', eager = false }) {
  // Remember WHICH url failed, so a reused component with a new src tries again.
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) {
    return (
      <span className={`photo photo-placeholder ${className}`} role="img" aria-label={noPhotos ? 'Photo hidden' : 'No photo'}>
        <span className="photo-rune" aria-hidden="true">ᛟ</span>
        <span className="photo-note">{noPhotos ? 'Photo hidden in preview' : 'No photo'}</span>
      </span>
    );
  }
  return (
    <img
      className={`photo ${className}`}
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
