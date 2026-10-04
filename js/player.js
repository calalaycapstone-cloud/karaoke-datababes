// Thin wrapper over the official YouTube IFrame Player API (legit embedded playback).
let yt;
export function initPlayer(el, h) {
  return new Promise(res => {
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
    window.onYouTubeIframeAPIReady = () => {
      yt = new YT.Player(el, { width: '100%', height: '100%', playerVars: { playsinline: 1, rel: 0, modestbranding: 1, controls: 0, disablekb: 1 },
        events: { onReady: () => res(api), onStateChange: e => h.state(e.data), onError: e => h.error(e.data) } });
    };
  });
}
const api = {
  load: id => yt.loadVideoById(id), toggle: () => (yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo()),
  seek: t => yt.seekTo(t, true), time: () => yt.getCurrentTime?.() || 0, dur: () => yt.getDuration?.() || 0,
  vol: v => yt.setVolume(v), mute: m => (m ? yt.mute() : yt.unMute()), playing: () => yt.getPlayerState() === 1
};
