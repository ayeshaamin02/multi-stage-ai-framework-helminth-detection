import { auth } from "@/lib/auth/server";

const h = auth.handler();

export const { GET, POST, PUT, DELETE, PATCH } = h;
