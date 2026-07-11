// ============================================================
// ui/photo-lightbox.js
//
// Modal de visualização de fotos em tamanho grande, com navegação.
// Singleton: cria o DOM uma vez e reutiliza em qualquer tela.
// ============================================================

let overlayEl = null;
let imgEl = null;
let prevBtn = null;
let nextBtn = null;
let urlsState = [];
let indexState = 0;

function ensureLightboxDom() {
    if (overlayEl) return;

    overlayEl = document.createElement("div");
    overlayEl.id = "photoLightboxOverlay";
    overlayEl.style.cssText = `
        display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85);
        z-index:1000; align-items:center; justify-content:center;
    `;

    overlayEl.innerHTML = `
        <button id="lightboxCloseBtn" type="button"
            style="position:absolute; top:20px; right:24px; font-size:28px; color:#fff;
                   background:none; border:none; cursor:pointer; line-height:1;">×</button>
        <button id="lightboxPrevBtn" type="button"
            style="position:absolute; left:20px; font-size:32px; color:#fff;
                   background:none; border:none; cursor:pointer;">‹</button>
        <img id="lightboxImg" style="max-width:85vw; max-height:85vh; border-radius:4px;" />
        <button id="lightboxNextBtn" type="button"
            style="position:absolute; right:20px; font-size:32px; color:#fff;
                   background:none; border:none; cursor:pointer;">›</button>
    `;

    document.body.appendChild(overlayEl);

    imgEl = overlayEl.querySelector("#lightboxImg");
    prevBtn = overlayEl.querySelector("#lightboxPrevBtn");
    nextBtn = overlayEl.querySelector("#lightboxNextBtn");

    overlayEl.querySelector("#lightboxCloseBtn").addEventListener("click", closeLightbox);
    overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeLightbox(); });
    prevBtn.addEventListener("click", () => showAt(indexState - 1));
    nextBtn.addEventListener("click", () => showAt(indexState + 1));

    document.addEventListener("keydown", (e) => {
        if (overlayEl.style.display !== "flex") return;
        if (e.key === "Escape") closeLightbox();
        if (e.key === "ArrowLeft") showAt(indexState - 1);
        if (e.key === "ArrowRight") showAt(indexState + 1);
    });
}

function showAt(index) {
    if (!urlsState.length) return;
    indexState = (index + urlsState.length) % urlsState.length;
    imgEl.src = urlsState[indexState];
    const showNav = urlsState.length > 1;
    prevBtn.style.display = showNav ? "block" : "none";
    nextBtn.style.display = showNav ? "block" : "none";
}

export function openLightbox(urls, startIndex = 0) {
    ensureLightboxDom();
    urlsState = urls;
    overlayEl.style.display = "flex";
    showAt(startIndex);
}

export function closeLightbox() {
    if (overlayEl) overlayEl.style.display = "none";
}