import { defineEventHandler, setCookie } from "h3";

export default defineEventHandler(async (event) => {
  setCookie(event, "de_access_token", "", {
    maxAge: 0,
    path: "/",
    httpOnly: false,
    sameSite: "lax",
  });
  return { ok: true };
});
