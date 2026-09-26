const LOADING_VIDEO_SRC = '../images/loading.webm';

function createLoadingVideoElement(): HTMLVideoElement {
  const video = document.createElement('video');
  video.className = 'mosaic-loading-video';
  video.src = LOADING_VIDEO_SRC;

  video.setAttribute('autoplay', '');
  video.setAttribute('loop', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('aria-hidden', 'true');

  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';

  return video;
}

function playLoadingVideo(video: HTMLVideoElement | null) {
  if (!video) {
    return;
  }

  try {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  } catch (error) {
    console.warn('[LoadingVideo] Could not start loading video:', error);
  }
}

function mountLoadingVideo(
  container: HTMLElement | null,
): HTMLVideoElement | null {
  if (!container) {
    return null;
  }

  const existing = container.querySelector<HTMLVideoElement>(
    'video.mosaic-loading-video',
  );
  if (existing) {
    playLoadingVideo(existing);
    return existing;
  }

  unmountLoadingVideo(container);

  const video = createLoadingVideoElement();
  container.appendChild(video);
  playLoadingVideo(video);
  video.addEventListener('canplay', () => playLoadingVideo(video), {
    once: true,
  });

  return video;
}

function unmountLoadingVideo(container: HTMLElement | null) {
  if (!container) {
    return;
  }

  container
    .querySelectorAll<HTMLVideoElement>('video.mosaic-loading-video')
    .forEach((video) => {
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch (error) {
        console.warn('[LoadingVideo] Could not stop loading video:', error);
      }
      video.remove();
    });
}

function preloadLoadingVideo(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const video = createLoadingVideoElement();
    video.autoplay = false;
    video.style.cssText =
      'position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; inset: auto;';

    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const done = () => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      video.removeEventListener('loadeddata', done);
      video.removeEventListener('canplaythrough', done);
      video.removeEventListener('error', done);
      video.removeAttribute('src');
      video.load();
      video.remove();
      resolve();
    };

    video.addEventListener('loadeddata', done);
    video.addEventListener('canplaythrough', done);
    video.addEventListener('error', done);
    timeoutId = setTimeout(done, 8000);

    document.body.appendChild(video);

    if (video.readyState >= 2) {
      done();
    }
  });
}

if (typeof window !== 'undefined') {
  (window as any).mountLoadingVideo = mountLoadingVideo;
  (window as any).unmountLoadingVideo = unmountLoadingVideo;
  (window as any).preloadLoadingVideo = preloadLoadingVideo;
  (window as any).LOADING_VIDEO_SRC = LOADING_VIDEO_SRC;
}

export {
  LOADING_VIDEO_SRC,
  mountLoadingVideo,
  unmountLoadingVideo,
  preloadLoadingVideo,
};
