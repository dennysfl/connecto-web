import { signIn } from "./auth.js";

const form = document.querySelector("#loginForm");
const msg = document.querySelector("#msg");

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const email = document.querySelector("#email").value.trim();
    const password = document.querySelector("#password").value;

    try {
        await signIn(email, password);
        window.location.href = "/dashboard.html";
    } catch (err) {
        msg.textContent = err?.message ?? "Login failed";
        console.error(err);
    }
});
