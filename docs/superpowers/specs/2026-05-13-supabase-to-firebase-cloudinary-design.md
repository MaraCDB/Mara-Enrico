# Migrazione foto da Supabase a Firestore + Cloudinary

**Data:** 2026-05-13
**Stato:** Design approvato, pronto per piano di implementazione
**Scope:** Sostituire interamente la dipendenza da Supabase nel sito di matrimonio di Mara & Enrico, mantenendo invariato il flusso RSVP (Google Apps Script + Google Sheets).

## Contesto

Il sito `index.html` è un file singolo con vanilla JS senza build system. Usa due servizi esterni:
- **Google Apps Script + Google Sheets** per il form RSVP — **resta invariato**.
- **Supabase** (Storage + Postgres) per upload foto e gallery — **viene rimosso**.

Motivi della migrazione:
- Supabase mette in pausa i progetti free dopo 7 giorni di inattività; ogni riattivazione è manuale.
- Servirà fino a settembre 2026 (giorno del matrimonio) e nei mesi successivi per la condivisione foto.

## Vincoli e decisioni

| Vincolo | Decisione |
|---|---|
| Upload pubblico, niente login | Confermato: chiunque visiti il sito può caricare foto. |
| Foto in alta qualità | Compressione client-side limitata a 2400px q=0.9 (solo per ridurre upload). Cloudinary serve qualità piena. |
| Niente piani a pagamento | Firebase Storage (Blaze required) scartato. Stack scelto: Firestore (Spark) + Cloudinary (free 25 GB). |
| Foto esistenti su Supabase | Nessuna migrazione: partiamo da zero. |
| Nessuna protezione anti-abuso obbligatoria | Replica del comportamento Supabase attuale: tutto pubblico. Opzionalmente limiti su preset Cloudinary (max 20 MB, formati immagine). |

Approcci scartati durante il brainstorming:
- **Firebase Storage** — richiede piano Blaze (carta di credito) da ottobre 2024.
- **Firestore-only con base64** — funzionerebbe ma costringe a compressione aggressiva incompatibile con "alta qualità".
- **Google Drive via Apps Script** — niente CDN, upload lento, condivide la quota Drive del proprietario.
- **Amazon Photos** — nessuna API pubblica per upload da web.

## Architettura

```
Browser (index.html)
  ├── Compressione leggera (Canvas API, max 2400px, q=0.9)
  ├── POST a Cloudinary REST (unsigned upload preset)
  │     ← public_id, format, width, height, secure_url
  ├── addDoc Firestore collection 'photos'
  └── Gallery: getDocs(orderBy created_at desc, limit 20, startAfter cursor)
        ├── thumbnail URL: w_400,h_400,c_fill,q_auto,f_auto
        └── full URL:      q_auto,f_auto                    (auto WebP/AVIF)
```

Cloudinary sostituisce Supabase Storage. Firestore sostituisce la tabella Supabase `photos`. Tutti gli URL delle immagini sono **costruiti dinamicamente** dal `public_id` Cloudinary + parametri di trasformazione: non salviamo URL nel database, salviamo solo il `public_id` e ricaviamo on-the-fly la versione thumb e la versione full.

## Setup esterno (responsabilità utente)

### Firebase
1. Progetto `mara-enrico-wedding` (già creato).
2. **Firestore Database abilitato** in `eur3 (europe-west)`, modalità test.
3. Storage **NON** abilitato (non serve).
4. Regole Firestore da incollare prima della scadenza della modalità test:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /photos/{doc} {
         allow read, create: if true;
         allow update, delete: if false;
       }
     }
   }
   ```

### Cloudinary
1. Account free, **Cloud Name:** `dwxunp63a`.
2. **Unsigned upload preset:** `wedding_photos`
   - Signing Mode: `Unsigned`
   - Asset folder: `wedding`
   - Generated public ID: usa filename + suffisso unico
   - Media Analysis / AI: disabilitato
   - (Opzionale) Max file size: 20 MB, Allowed formats: `jpg,jpeg,png,heic,webp`

## Data model

### Cloudinary
Bucket gestito da Cloudinary. Le foto finiscono nella cartella `wedding/`. Nessun bisogno di generare thumbnail upload-side: le trasformazioni URL servono qualunque variante on-demand.

### Firestore — collection `photos`

```js
{
  public_id:  string,       // es. "wedding/IMG_1234_abc7xy"
  format:     string,       // es. "jpg", "webp"
  width:      number,       // dimensioni originali post-compressione client
  height:     number,
  name:       string,       // nome uploader, default "Anonimo"
  created_at: Timestamp     // serverTimestamp()
}
```

Niente campi `url` o `thumb_url`: gli URL sono derivati dal `public_id` + format al render. Vantaggio: se in futuro cambiamo trasformazioni (es. WebP forzato, watermark), non serve toccare i dati storici.

### Helper URL builder
```js
const buildUrl = (publicId, format, transform) =>
  `https://res.cloudinary.com/dwxunp63a/image/upload/${transform}/${publicId}.${format}`;

const thumbUrl = (p) => buildUrl(p.public_id, p.format, 'w_400,h_400,c_fill,q_auto,f_auto');
const fullUrl  = (p) => buildUrl(p.public_id, p.format, 'q_auto,f_auto');
```

`q_auto,f_auto` lascia che Cloudinary scelga la qualità ottimale e il miglior formato supportato dal browser (WebP/AVIF dove possibile, fallback JPEG).

## Modifiche a `index.html`

Tutto il lavoro è dentro **un solo blocco `<script type="module">`** (attuale linee 1010-1225, quello che contiene Supabase). Il resto del file (HTML, CSS, RSVP, hamburger menu, countdown, scroll fade-in) **non viene toccato**.

### Imports nuovi
```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, query, orderBy,
  limit, startAfter, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
```

### Costanti
```js
const firebaseConfig = {
  apiKey: "AIzaSyAV3HbzJRdKwgpwEs3YzcnH39DGui5Rijc",
  authDomain: "mara-enrico-wedding.firebaseapp.com",
  projectId: "mara-enrico-wedding",
  storageBucket: "mara-enrico-wedding.firebasestorage.app",
  messagingSenderId: "392174455170",
  appId: "1:392174455170:web:fd0b5db72f19b8a39fe79b"
};
const CLOUDINARY_CLOUD  = 'dwxunp63a';
const CLOUDINARY_PRESET = 'wedding_photos';
const BATCH = 20;
```
La `firebaseConfig` è informazione pubblica destinata al client (analoga alla anon key di Supabase): le regole Firestore sono il vero confine di sicurezza.

### Upload handler (sostituisce il blocco upload Supabase)
Per ogni file:
1. `compressImage(file, 2400, 0.9)` → blob compresso leggero.
2. POST a `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload` con FormData `{ file: blob, upload_preset: CLOUDINARY_PRESET, folder: 'wedding' }`. Risposta JSON contiene `public_id`, `format`, `width`, `height`.
3. `addDoc(collection(db, 'photos'), { public_id, format, width, height, name: uploaderName, created_at: serverTimestamp() })`.
4. Aggiorna la progress bar (peso uguale per ogni file).

### Gallery loader (sostituisce il blocco `loadGallery` Supabase)
Pagination tramite **cursor Firestore** invece di offset numerico:
```js
let lastDoc = null;     // sostituisce 'offset'
let allPhotos = [];

async function loadGallery(reset = false) {
  if (reset) { lastDoc = null; allPhotos = []; galleryGrid.innerHTML = ''; }

  let q = query(collection(db, 'photos'),
                orderBy('created_at', 'desc'),
                limit(BATCH));
  if (lastDoc) q = query(q, startAfter(lastDoc));

  const snap = await getDocs(q);
  if (snap.empty && allPhotos.length === 0) {
    galleryGrid.innerHTML = '<p class="gallery-empty">Nessuna foto ancora. Sii il primo a caricare!</p>';
    loadMoreBtn.style.display = 'none';
    return;
  }
  snap.docs.forEach(doc => {
    const photo = { id: doc.id, ...doc.data() };
    allPhotos.push(photo);
    appendGalleryItem(photo, allPhotos.length - 1);
  });
  lastDoc = snap.docs[snap.docs.length - 1] || lastDoc;
  loadMoreBtn.style.display = snap.size < BATCH ? 'none' : 'inline-block';
}
```

### appendGalleryItem (cambio piccolo)
```js
img.src = thumbUrl(data);     // invece di data.thumb_url
```

### Lightbox (cambio piccolo)
```js
lightboxImg.src = fullUrl(p); // invece di p.url
```

## Gestione errori

Comportamento equivalente a quello Supabase attuale:
- Upload fallito (network/CORS/preset errato): `console.error` + messaggio in `uploadStatus`.
- Firestore write fallito: stesso pattern.
- Foto con `public_id` orfano (caricato su Cloudinary ma Firestore write fallito): semplicemente non appare in gallery. Accettabile: ricaricabile dall'utente.
- Foto eliminata su Cloudinary ma ancora in Firestore: `img.onerror` rimuove la card dalla griglia (logica già presente).

## Cosa NON cambia (verifica)

- Layout HTML, classi CSS, variabili `:root`.
- Hamburger menu, countdown, scroll fade-in.
- RSVP form e tutta la logica Google Apps Script (linee ~968-1006).
- Compressione canvas-based (`compressImage`), drag & drop, file picker, lightbox open/close.
- Gallery grid HTML structure (cambia solo come si popolano gli `<img src>`).
- Pulsante "Carica altre foto" e behavior di paginazione (cambia solo il backend query).

## Out of scope

- Cancellazione foto da parte di admin (richiede dashboard / regole Firestore con auth).
- Moderation / approval workflow.
- Migrazione foto già su Supabase (deciso: si parte da zero).
- Notifiche / email sui nuovi upload.
- App Check / reCAPTCHA (utente ha scelto "nessuna protezione").

## Test plan

Sito senza framework di test. Verifica manuale post-implementazione:
1. **Upload singolo:** seleziona 1 JPEG, conferma che appaia in gallery dopo refresh e che si apra in alta qualità nel lightbox.
2. **Upload multiplo:** drag & drop di 5 foto, verifica progress bar e che tutte e 5 finiscano in gallery.
3. **Paginazione:** carica > 20 foto, verifica che il pulsante "Carica altre foto" funzioni e nasconda al raggiungimento del fondo.
4. **Pulizia stato:** un secondo upload dopo il primo deve resettare e riallineare la gallery (chiamata `loadGallery(true)`).
5. **Errore upload:** disconnetti rete e prova upload, verifica messaggio in `uploadStatus`.
6. **HEIC iPhone:** carica una foto HEIC da iPhone, verifica che Cloudinary la converta in JPEG/WebP automaticamente nelle trasformazioni.
7. **Browser senza WebP** (rara): URL `f_auto` deve servire JPEG.
8. **RSVP intatto:** invia un RSVP, verifica che arrivi su Google Sheets come prima.

## File modificati

- `index.html` — sostituzione del blocco `<script type="module">` foto+supabase con il nuovo blocco firestore+cloudinary.

Nessun altro file di progetto cambia. Nessun package.json o build step da introdurre.
