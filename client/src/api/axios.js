import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true, // sends the httpOnly auth cookie automatically
});

// A separate plain axios instance for the refresh call itself - using API
// here would recurse back into the same interceptor below.
const refreshClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

let refreshInFlight = null;

// The access token now expires every 15 minutes (short-lived by design -
// see the server changes). Rather than bouncing the user to /login every
// 15 minutes, a 401 triggers one attempt to silently trade the refresh
// cookie for a new access token, then replays the original request. Only
// a failed refresh (refresh token itself expired/invalid/reused) sends
// the user to /login.
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    if (response?.status !== 401 || config._retried) {
      if (response?.status === 401) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }
    config._retried = true;

    try {
      // Multiple requests can 401 around the same moment (e.g. a page that
      // fires several calls on load) - share one in-flight refresh instead
      // of racing several rotations against each other, which would have
      // each one invalidate the refresh token the others are about to use.
      if (!refreshInFlight) {
        refreshInFlight = refreshClient.post("/refresh").finally(() => {
          refreshInFlight = null;
        });
      }
      await refreshInFlight;
      return API(config);
    } catch {
      window.location.href = "/login";
      return Promise.reject(error);
    }
  }
);

export default API;