import { json } from "@remix-run/node";

export const loader = async () => {
    console.log("DEBUG: Diagnostic request received");
    return json({ ok: true, message: "Server is reachable via proxy" });
};
