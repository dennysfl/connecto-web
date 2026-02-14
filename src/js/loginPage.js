import { signIn, signUp } from "./auth.js";

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

const formNew = document.querySelector("#newAccountForm");
const msgNew = document.querySelector("#newMsg");

formNew.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgNew.textContent = "";

    const fullName = document.querySelector("#newName").value.trim();
    const newEmail = document.querySelector("#newEmail").value.trim();
    const newPassword = document.querySelector("#newPassword").value;

    try {
        await signUp(newEmail, newPassword, fullName);

        if (data?.session) {
            window.location.href = "/dashboard.html";
            return;
        }

        // mensagem precisa vir ANTES de qualquer navegação (e aqui não navegamos)
        msgNew.textContent = "Usuário criado com sucesso. Agora faça login.";

        // ajuda UX: preenche o email do login e foca no password
        document.querySelector("#email").value = newEmail;
        document.querySelector("#password").focus();

        // limpa o form de criação
        formNew.reset();
    } catch (err) {
        msgNew.textContent = err?.message ?? "Error creating account";
        console.error(err);
    }
});
