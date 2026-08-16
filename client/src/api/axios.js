import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:5001", // your backend URL
});

// Attach JWT token automatically if user is logged in
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;