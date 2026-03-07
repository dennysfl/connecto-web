import { supabase } from "./supabaseClient.js";

const form = document.querySelector("#serviceForm");
const msg = document.querySelector("#msg");

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const serviceTitle = document.querySelector("#serviceTitle").value.trim();
    const serviceDesc = document.querySelector("#serviceDesc").value.trim();
    const serviceCate = document.querySelector("#serviceCate").value.trim();
    const serviceCity = document.querySelector("#serviceCity").value.trim();
    const serviceCountry = document.querySelector("#serviceCountry").value.trim();

    const serviceData = [{ title: serviceTitle, description: serviceDesc, category: serviceCate, city: serviceCity, country: serviceCountry, is_active: true }]
    await createService(serviceData);
});

async function createService(serviceData) {

    try {
        const { data, error } = await supabase
            .from("services")
            .insert(serviceData)
            .select();

        if (error) throw error;

        msg.textContent = "Service created successfully.";
        console.log("Inserted service:", data);

        form.reset();
    }
    catch (err) {
        msg.textContent = err?.message ?? "Error creating service";
        console.error("Create service error:", err);
    }
};
