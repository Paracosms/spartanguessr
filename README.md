# GeoGuessr, but for SJSU!

## Gallery

## Metrics

## Build Instructions

### Frontend

Install the JavaScript dependencies and start the Vite development server:

```bash
npm install
npm run dev
```

To create and preview a production build:

```bash
npm run build
npm run preview
```

The frontend uses the hosted API by default. To run it against a local backend, set this in `.env.local`:

```text
VITE_API_BASE_URL=http://localhost:5000
```

### Backend

The backend needs Python, an Upstash Redis database, the private image catalog, and an image CDN base URL. From the repository root:

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

Set these environment variables with local values before starting Flask:

```text
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
IMAGE_CATALOG_PATH=path/to/image_catalog.private.json
IMAGE_CDN_BASE_URL=https://your-image-cdn.example
ALLOWED_ORIGIN=http://localhost:5173
```

Then run the backend from its directory:

```bash
cd backend
python app.py
```


## Privacy
This game is free of accounts! There is no login or registration. All data is stored locally. 

## Contributing

### Image Contributions
For image contributions, use the in-app **Submit Photos** flow or open an issue with the proposed change. This can be found at the bottom of the **About** panel.
Only submit campus photos that are appropriate to share. Try not to include people in your photos, and avoid any personally identifiable information.



### Developer Contributions
Keep contributions small and focused. Always explain the reason for the change. Before opening a pull request, run the checks relevant to your change:

```bash
# Frontend
npx eslint src
npm run build

# Backend
cd backend
pytest tests.py -q
```
